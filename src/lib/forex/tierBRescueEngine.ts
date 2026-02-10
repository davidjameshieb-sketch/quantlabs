// Tier B Agent Rescue Engine
// 5-step pipeline: Diagnose → Retune → Shadow Validate → Deploy → Portfolio Integrate
//
// Only applies agent-local constraints. Does NOT modify:
// - Global governance multipliers or gates
// - Tier A agent logic or allocation
// - Capital allocation engine
// - QuantLabs signal logic

import { buildEnvKeyFromRaw, normalizeSession, normalizeDirection, computeSpreadBucket } from './environmentSignature';
import type { TradeRecord, AgentScorecard, AgentBreakdown, RetuneRule } from './agentOptimizationEngine';
import { buildAgentScorecard } from './agentOptimizationEngine';

// ─── Types ────────────────────────────────────────────────────────────

export interface PositiveSubspace {
  dimension: 'session' | 'regime' | 'direction' | 'pair' | 'spread_bucket';
  key: string;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  netPips: number;
  maxDrawdown: number;
  meetsThreshold: boolean; // PF >= 1.20, Exp >= 0.3, trades >= 100
}

export interface DestructiveSegment {
  dimension: 'session' | 'regime' | 'direction' | 'pair' | 'spread_bucket';
  key: string;
  trades: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
  isJPY: boolean;
  severity: 'critical' | 'moderate' | 'mild';
}

export interface RescueRetuneRule extends RetuneRule {
  expectedExpLift: number;
  tradeLoss: number;
  liftPerTradeLost: number; // efficiency: pips gained per trade removed
  confidence: 'high' | 'medium' | 'low';
}

export interface ShadowValidationResult {
  agentId: string;
  totalShadowTrades: number;
  expectancyRatio: number;       // vs original agent
  maxDDRatio: number;            // vs original agent
  sessionsWithPositiveExp: number;
  rollingStability: { window: number; expectancy: number; pf: number }[];
  meetsPromotion: boolean;
  failReasons: string[];
}

export interface PortfolioIntegrationCheck {
  agentId: string;
  envSignatureMatch: boolean;
  correlationWithTierA: number;
  diversificationBenefit: number;
  marginalRisk: number;
  eligible: boolean;
  reason: string;
}

export interface TierBRescueResult {
  agentId: string;
  // Step 1: Diagnosis
  originalScorecard: AgentScorecard;
  positiveSubspaces: PositiveSubspace[];
  destructiveSegments: DestructiveSegment[];
  diagnosisSummary: string;
  // Step 2: Retune Proposal
  retuneRules: RescueRetuneRule[];
  retunedScorecard: AgentScorecard | null;
  retuneRationale: string;
  // Step 3: Shadow Validation
  shadowValidation: ShadowValidationResult;
  // Step 4: Deployment
  deploymentState: 'shadow' | 'reduced-live' | 'normal-live' | 'disabled';
  deploymentReason: string;
  // Step 5: Portfolio
  portfolioCheck: PortfolioIntegrationCheck;
  // Overall
  rescued: boolean;
  rescueSummary: string;
}

// ─── PnL Helpers ─────────────────────────────────────────────────────

function calcPips(trade: TradeRecord): number {
  const mult = trade.currency_pair.includes('JPY') ? 100 : 10000;
  return trade.direction === 'long'
    ? (trade.exit_price - trade.entry_price) * mult
    : (trade.entry_price - trade.exit_price) * mult;
}

function computeMaxDD(trades: TradeRecord[]): number {
  let peak = 0, maxDD = 0, cum = 0;
  for (const t of trades) {
    cum += calcPips(t);
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeBreakdownFull(
  trades: TradeRecord[],
  dimension: PositiveSubspace['dimension'],
  keyFn: (t: TradeRecord) => string
): PositiveSubspace[] {
  const groups: Record<string, TradeRecord[]> = {};
  for (const t of trades) {
    const k = keyFn(t);
    if (!groups[k]) groups[k] = [];
    groups[k].push(t);
  }

  return Object.entries(groups).map(([key, group]) => {
    const pips = group.map(calcPips);
    const wins = pips.filter(p => p > 0).length;
    const netPips = pips.reduce((a, b) => a + b, 0);
    const grossP = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const grossL = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
    const expectancy = group.length > 0 ? netPips / group.length : 0;
    const profitFactor = grossL > 0 ? grossP / grossL : grossP > 0 ? 99 : 0;
    const maxDrawdown = computeMaxDD(group);

    return {
      dimension,
      key,
      trades: group.length,
      winRate: group.length > 0 ? wins / group.length : 0,
      expectancy,
      profitFactor,
      netPips,
      maxDrawdown,
      meetsThreshold: profitFactor >= 1.20 && expectancy >= 0.3 && group.length >= 100,
    };
  }).sort((a, b) => b.expectancy - a.expectancy);
}

// ─── Step 1: Diagnose ────────────────────────────────────────────────

function diagnoseAgent(agentId: string, trades: TradeRecord[]): {
  scorecard: AgentScorecard;
  positiveSubspaces: PositiveSubspace[];
  destructiveSegments: DestructiveSegment[];
  summary: string;
} {
  const scorecard = buildAgentScorecard(agentId, trades);

  // Build full breakdowns across all dimensions
  const sessionBD = computeBreakdownFull(trades, 'session', t => t.session_label || 'unknown');
  const regimeBD = computeBreakdownFull(trades, 'regime', t => t.regime_label || 'unknown');
  const dirBD = computeBreakdownFull(trades, 'direction', t => t.direction);
  const pairBD = computeBreakdownFull(trades, 'pair', t => t.currency_pair);
  const spreadBD = computeBreakdownFull(trades, 'spread_bucket', t => {
    const mult = t.currency_pair.includes('JPY') ? 100 : 10000;
    const spreadPips = (t.spread_at_entry || 0) * mult;
    return computeSpreadBucket(spreadPips);
  });

  const allSubspaces = [...sessionBD, ...regimeBD, ...dirBD, ...pairBD, ...spreadBD];
  const positiveSubspaces = allSubspaces.filter(s => s.meetsThreshold);

  // Identify destructive segments
  const destructiveSegments: DestructiveSegment[] = allSubspaces
    .filter(s => s.expectancy < -0.3 && s.trades >= 50)
    .map(s => ({
      dimension: s.dimension,
      key: s.key,
      trades: s.trades,
      expectancy: s.expectancy,
      netPips: s.netPips,
      profitFactor: s.profitFactor,
      isJPY: s.dimension === 'pair' && (s.key.includes('JPY') || s.key.includes('jpy')),
      severity: s.netPips < -500 ? 'critical' as const
        : s.netPips < -200 ? 'moderate' as const
        : 'mild' as const,
    }))
    .sort((a, b) => a.netPips - b.netPips);

  const summary = [
    `${agentId}: ${scorecard.totalTrades} trades, ${scorecard.netPips.toFixed(0)}p net, PF ${scorecard.profitFactor.toFixed(2)}`,
    `${positiveSubspaces.length} positive subspaces found, ${destructiveSegments.length} destructive segments`,
    destructiveSegments.filter(d => d.severity === 'critical').length > 0
      ? `⚠ ${destructiveSegments.filter(d => d.severity === 'critical').length} critical destructive segments`
      : '✓ No critical destructive segments',
  ].join(' | ');

  return { scorecard, positiveSubspaces, destructiveSegments, summary };
}

// ─── Step 2: Generate Retune Proposals ───────────────────────────────

function generateRescueRules(
  scorecard: AgentScorecard,
  destructiveSegments: DestructiveSegment[],
  trades: TradeRecord[]
): RescueRetuneRule[] {
  const rules: RescueRetuneRule[] = [];
  const totalTrades = trades.length;
  const totalNetPips = trades.reduce((a, t) => a + calcPips(t), 0);

  // 1. Block destructive direction
  for (const seg of destructiveSegments.filter(s => s.dimension === 'direction')) {
    const tradeLoss = seg.trades;
    const liftPips = Math.abs(seg.netPips);
    rules.push({
      type: 'block_direction',
      label: `Block ${seg.key.toUpperCase()} direction`,
      value: seg.key,
      impactEstimate: `Remove ${liftPips.toFixed(0)}p loss from ${tradeLoss} trades`,
      expectedExpLift: liftPips / (totalTrades - tradeLoss),
      tradeLoss,
      liftPerTradeLost: liftPips / tradeLoss,
      confidence: seg.severity === 'critical' ? 'high' : 'medium',
    });
  }

  // 2. Block toxic sessions
  for (const seg of destructiveSegments.filter(s => s.dimension === 'session' && s.severity !== 'mild')) {
    const liftPips = Math.abs(seg.netPips);
    rules.push({
      type: 'block_session',
      label: `Block ${seg.key} session`,
      value: seg.key,
      impactEstimate: `Remove ${liftPips.toFixed(0)}p loss from ${seg.trades} trades`,
      expectedExpLift: liftPips / (totalTrades - seg.trades),
      tradeLoss: seg.trades,
      liftPerTradeLost: liftPips / seg.trades,
      confidence: seg.severity === 'critical' ? 'high' : 'medium',
    });
  }

  // 3. Block toxic pairs (prioritize JPY crosses)
  const toxicPairs = destructiveSegments
    .filter(s => s.dimension === 'pair')
    .sort((a, b) => {
      // JPY first, then by severity
      if (a.isJPY && !b.isJPY) return -1;
      if (!a.isJPY && b.isJPY) return 1;
      return a.netPips - b.netPips;
    });

  for (const seg of toxicPairs.slice(0, 5)) {
    const liftPips = Math.abs(seg.netPips);
    rules.push({
      type: 'block_pair',
      label: `Block ${seg.key}${seg.isJPY ? ' (JPY cross)' : ''}`,
      value: seg.key,
      impactEstimate: `Remove ${liftPips.toFixed(0)}p loss from ${seg.trades} trades`,
      expectedExpLift: liftPips / (totalTrades - seg.trades),
      tradeLoss: seg.trades,
      liftPerTradeLost: liftPips / seg.trades,
      confidence: seg.isJPY || seg.severity === 'critical' ? 'high' : 'medium',
    });
  }

  // 4. Raise composite threshold if low-composite trades are destructive
  const lowCompositeTrades = trades.filter(t => (t.governance_composite || 0) < 0.72);
  if (lowCompositeTrades.length >= 50) {
    const lowPips = lowCompositeTrades.map(calcPips);
    const lowNet = lowPips.reduce((a, b) => a + b, 0);
    if (lowNet < -100) {
      rules.push({
        type: 'raise_composite',
        label: 'Raise min composite threshold to 0.80',
        value: '0.80',
        impactEstimate: `Remove ${Math.abs(lowNet).toFixed(0)}p loss from ${lowCompositeTrades.length} low-composite trades`,
        expectedExpLift: Math.abs(lowNet) / (totalTrades - lowCompositeTrades.length),
        tradeLoss: lowCompositeTrades.length,
        liftPerTradeLost: Math.abs(lowNet) / lowCompositeTrades.length,
        confidence: 'medium',
      });
    }
  }

  // Sort by efficiency (lift per trade lost)
  return rules.sort((a, b) => b.liftPerTradeLost - a.liftPerTradeLost);
}

function applyRulesAndRescore(
  agentId: string,
  trades: TradeRecord[],
  rules: RescueRetuneRule[]
): { filtered: TradeRecord[]; scorecard: AgentScorecard } {
  let filtered = [...trades];

  for (const rule of rules) {
    switch (rule.type) {
      case 'block_direction':
        filtered = filtered.filter(t => t.direction !== rule.value);
        break;
      case 'block_session':
        filtered = filtered.filter(t => (t.session_label || 'unknown') !== rule.value);
        break;
      case 'block_pair':
        filtered = filtered.filter(t => t.currency_pair !== rule.value);
        break;
      case 'raise_composite':
        filtered = filtered.filter(t => (t.governance_composite || 0) >= parseFloat(rule.value));
        break;
    }
  }

  const scorecard = filtered.length > 0
    ? buildAgentScorecard(agentId, filtered)
    : buildAgentScorecard(agentId, []);

  return { filtered, scorecard };
}

// ─── Step 3: Shadow Validation ───────────────────────────────────────

function simulateShadowValidation(
  agentId: string,
  originalTrades: TradeRecord[],
  retunedTrades: TradeRecord[],
  originalScorecard: AgentScorecard,
  retunedScorecard: AgentScorecard
): ShadowValidationResult {
  const totalShadowTrades = retunedTrades.length;

  const expectancyRatio = originalScorecard.expectancy !== 0
    ? retunedScorecard.expectancy / Math.abs(originalScorecard.expectancy)
    : retunedScorecard.expectancy > 0 ? 99 : 0;

  const maxDDRatio = originalScorecard.maxDrawdown > 0
    ? retunedScorecard.maxDrawdown / originalScorecard.maxDrawdown
    : retunedScorecard.maxDrawdown === 0 ? 0 : 1;

  // Check session coverage
  const sessionGroups: Record<string, number[]> = {};
  for (const t of retunedTrades) {
    const s = t.session_label || 'unknown';
    if (!sessionGroups[s]) sessionGroups[s] = [];
    sessionGroups[s].push(calcPips(t));
  }
  const sessionsWithPositiveExp = Object.values(sessionGroups)
    .filter(pips => pips.length >= 20 && pips.reduce((a, b) => a + b, 0) / pips.length > 0)
    .length;

  // Rolling 50-trade stability windows
  const sorted = [...retunedTrades].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const rollingStability: { window: number; expectancy: number; pf: number }[] = [];
  for (let i = 0; i + 50 <= sorted.length; i += 50) {
    const window = sorted.slice(i, i + 50);
    const pips = window.map(calcPips);
    const net = pips.reduce((a, b) => a + b, 0);
    const gp = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const gl = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
    rollingStability.push({
      window: i / 50 + 1,
      expectancy: net / 50,
      pf: gl > 0 ? gp / gl : gp > 0 ? 99 : 0,
    });
  }

  const failReasons: string[] = [];
  if (totalShadowTrades < 150) failReasons.push(`Insufficient trades: ${totalShadowTrades} < 150`);
  if (expectancyRatio < 1.3) failReasons.push(`Expectancy ratio ${expectancyRatio.toFixed(2)} < 1.3×`);
  if (maxDDRatio > 0.70) failReasons.push(`DD ratio ${maxDDRatio.toFixed(2)} > 0.70×`);
  if (sessionsWithPositiveExp < 3) failReasons.push(`Only ${sessionsWithPositiveExp} sessions profitable (need ≥ 3)`);

  // Check OOS stability
  if (rollingStability.length >= 2) {
    const lastTwo = rollingStability.slice(-2);
    if (lastTwo.some(w => w.expectancy <= 0)) {
      failReasons.push('Recent rolling window shows negative expectancy');
    }
  }

  return {
    agentId,
    totalShadowTrades,
    expectancyRatio: Math.round(expectancyRatio * 100) / 100,
    maxDDRatio: Math.round(maxDDRatio * 100) / 100,
    sessionsWithPositiveExp,
    rollingStability,
    meetsPromotion: failReasons.length === 0,
    failReasons,
  };
}

// ─── Step 5: Portfolio Integration ───────────────────────────────────

function checkPortfolioIntegration(
  agentId: string,
  retunedScorecard: AgentScorecard,
  tierAScorecards: AgentScorecard[],
  retunedTrades: TradeRecord[]
): PortfolioIntegrationCheck {
  // Environment signature overlap
  const retunedEnvKeys = new Set(
    retunedTrades.map(t => {
      const session = normalizeSession(t.session_label || 'unknown');
      const regime = t.regime_label || 'unknown';
      const dir = normalizeDirection(t.direction);
      const sym = t.currency_pair.replace('_', '').replace('/', '');
      return buildEnvKeyFromRaw(session, regime, sym, dir, agentId);
    })
  );

  // Simple correlation proxy: overlap of profitable pairs with Tier A
  const retunedProfitablePairs = new Set(
    retunedScorecard.pairBreakdown?.filter(p => p.expectancy > 0).map(p => p.key) || []
  );

  let maxCorrelation = 0;
  for (const tierA of tierAScorecards) {
    const tierAPairs = new Set(
      tierA.pairBreakdown?.filter(p => p.expectancy > 0).map(p => p.key) || []
    );
    const overlap = [...retunedProfitablePairs].filter(p => tierAPairs.has(p)).length;
    const union = new Set([...retunedProfitablePairs, ...tierAPairs]).size;
    const corr = union > 0 ? overlap / union : 0;
    if (corr > maxCorrelation) maxCorrelation = corr;
  }

  const correlationWithTierA = Math.round(maxCorrelation * 100) / 100;

  // Diversification benefit: does this agent cover environments Tier A doesn't?
  const tierAEnvKeys = new Set<string>();
  // Simplified — in production would compare full envKey sets
  const diversificationBenefit = Math.max(0, 1 - correlationWithTierA);

  // Marginal risk: how much drawdown does this add?
  const marginalRisk = retunedScorecard.maxDrawdown > 0
    ? Math.min(1, retunedScorecard.maxDrawdown / 500)
    : 0;

  const eligible = correlationWithTierA < 0.6
    && diversificationBenefit > marginalRisk
    && retunedScorecard.profitFactor >= 1.2;

  return {
    agentId,
    envSignatureMatch: retunedEnvKeys.size > 5,
    correlationWithTierA,
    diversificationBenefit: Math.round(diversificationBenefit * 100) / 100,
    marginalRisk: Math.round(marginalRisk * 100) / 100,
    eligible,
    reason: eligible
      ? `Low Tier A correlation (${(correlationWithTierA * 100).toFixed(0)}%), diversification benefit exceeds risk`
      : correlationWithTierA >= 0.6
        ? `Correlation with Tier A too high (${(correlationWithTierA * 100).toFixed(0)}% ≥ 60%) — informational only`
        : `Marginal risk (${(marginalRisk * 100).toFixed(0)}%) exceeds diversification benefit — informational only`,
  };
}

// ─── Main Pipeline ───────────────────────────────────────────────────

export function runTierBRescue(
  agentId: string,
  agentTrades: TradeRecord[],
  tierAScorecards: AgentScorecard[]
): TierBRescueResult {
  // Step 1: Diagnose
  const { scorecard, positiveSubspaces, destructiveSegments, summary } = diagnoseAgent(agentId, agentTrades);

  // Step 2: Generate retune rules
  const retuneRules = generateRescueRules(scorecard, destructiveSegments, agentTrades);

  // Apply rules and re-score
  const { filtered: retunedTrades, scorecard: retunedScorecard } = applyRulesAndRescore(agentId, agentTrades, retuneRules);

  const retuneRationale = retuneRules.length > 0
    ? `Applied ${retuneRules.length} surgical constraints: ${retuneRules.map(r => r.label).join(', ')}. ` +
      `Removed ${agentTrades.length - retunedTrades.length} toxic trades (${((1 - retunedTrades.length / agentTrades.length) * 100).toFixed(1)}% of volume). ` +
      `Expected lift: ${retunedScorecard.netPips > scorecard.netPips ? '+' : ''}${(retunedScorecard.netPips - scorecard.netPips).toFixed(0)} pips.`
    : 'No actionable constraints identified — agent may require deeper structural review.';

  // Step 3: Shadow validation
  const shadowValidation = simulateShadowValidation(
    agentId, agentTrades, retunedTrades, scorecard, retunedScorecard
  );

  // Step 4: Deployment state
  let deploymentState: TierBRescueResult['deploymentState'];
  let deploymentReason: string;

  if (!shadowValidation.meetsPromotion) {
    deploymentState = 'shadow';
    deploymentReason = `Shadow validation failed: ${shadowValidation.failReasons[0]}`;
  } else if (retunedScorecard.profitFactor >= 1.2 && retunedScorecard.expectancy > 0.3) {
    deploymentState = 'reduced-live';
    deploymentReason = `Promoted to reduced-live (0.35× sizing) — PF ${retunedScorecard.profitFactor.toFixed(2)}, Exp +${retunedScorecard.expectancy.toFixed(2)}p/t`;
  } else {
    deploymentState = 'shadow';
    deploymentReason = `Retuned metrics insufficient for promotion: PF ${retunedScorecard.profitFactor.toFixed(2)}, Exp ${retunedScorecard.expectancy.toFixed(2)}p/t`;
  }

  // Step 5: Portfolio integration
  const portfolioCheck = checkPortfolioIntegration(agentId, retunedScorecard, tierAScorecards, retunedTrades);

  // Overall rescue assessment
  const rescued = retunedScorecard.profitFactor >= 1.2
    && retunedScorecard.expectancy > 0
    && shadowValidation.meetsPromotion
    && !destructiveSegments.some(s => s.severity === 'critical' && retuneRules.every(r => r.value !== s.key));

  const rescueSummary = rescued
    ? `✅ RESCUED — ${agentId} flipped to PF ${retunedScorecard.profitFactor.toFixed(2)} (+${retunedScorecard.netPips.toFixed(0)}p) via ${retuneRules.length} local constraints. Deploy: ${deploymentState}.`
    : `⏳ IN PROGRESS — ${agentId} improved but not yet rescue-complete. ${shadowValidation.failReasons[0] || 'Needs more shadow data'}.`;

  return {
    agentId,
    originalScorecard: scorecard,
    positiveSubspaces,
    destructiveSegments,
    diagnosisSummary: summary,
    retuneRules,
    retunedScorecard,
    retuneRationale,
    shadowValidation,
    deploymentState,
    deploymentReason,
    portfolioCheck,
    rescued,
    rescueSummary,
  };
}

// ─── Batch Runner ────────────────────────────────────────────────────

export function runAllTierBRescues(
  allTrades: TradeRecord[],
  tierBAgentIds: string[],
  tierAScorecards: AgentScorecard[]
): TierBRescueResult[] {
  return tierBAgentIds.map(agentId => {
    const agentTrades = allTrades.filter(t => t.agent_id === agentId);
    return runTierBRescue(agentId, agentTrades, tierAScorecards);
  });
}
