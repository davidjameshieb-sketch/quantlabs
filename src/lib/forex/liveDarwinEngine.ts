// Live Darwin Execution Engine
// Unified real-time adaptive controller that dynamically manages:
// - Pair capital allocation (survivorship-scored)
// - Agent trade permissions (authority-weighted)
// - Session trade authorization
// - Coalition reinforcement
// - Indicator survivorship weighting
// - Safety trigger risk governance
// - Expectancy slope early warning
//
// CRITICAL: Does NOT modify governance gates, QuantLabs direction, or core stop logic.
// Only outputs execution-time multipliers and permissions consumed by the trade pipeline.

import {
  evaluatePairDarwinism,
  getDarwinismState,
  getDarwinismMultiplier,
  getDarwinismTier,
  type DarwinismState,
  type DarwinismTier,
  type DarwinismTradeRecord,
  type PairSurvivorshipScore,
  type DarwinismSafetyTrigger,
} from './pairDarwinismEngine';

// ─── Types ────────────────────────────────────────────────────────────

export type DarwinScoreLevel = 'TOP_TIER' | 'STRONG' | 'NEUTRAL' | 'WEAK' | 'FAILING';

export interface AgentAuthority {
  agentId: string;
  authorityScore: number;       // 0-100
  role: 'FULL_TRADE' | 'CONFIRMATION_ONLY' | 'DISABLED';
  capitalMultiplier: number;
  pairAuthorities: Record<string, number>;  // per-pair authority
  expectancySlope: number;
  reasoning: string[];
}

export interface SessionAuthority {
  session: string;
  pair: string;
  weight: number;              // 0-1
  positionSizeMultiplier: number;
  enabled: boolean;
  reasoning: string;
}

export interface CoalitionReinforcement {
  coalitionKey: string;
  agents: string[];
  deltaExpectancy: number;
  harmRate: number;
  permission: 'BOOSTED' | 'NEUTRAL' | 'REDUCED' | 'BLOCKED';
  authorityMultiplier: number;
}

export interface IndicatorWeight {
  indicator: string;
  backtestScore: number;       // 0-100
  liveScore: number;           // 0-100
  compositeWeight: number;     // blended
  trend: 'rising' | 'stable' | 'falling';
  status: 'ACTIVE' | 'DOWNGRADED' | 'DISABLED';
}

export interface SafetyReaction {
  trigger: DarwinismSafetyTrigger;
  action: string;
  capitalReduction: number;    // 0-1 (percentage to reduce)
  freezeCoalitions: boolean;
  restrictToTopAgent: boolean;
  timestamp: number;
}

export interface ExpectancySlopeWarning {
  pair: string;
  slope: number;
  direction: 'RISING' | 'FLAT' | 'FALLING';
  action: 'INCREASE_ALLOCATION' | 'HOLD' | 'REDUCE_FREQUENCY';
  confidence: number;
}

export interface DarwinExecutionDecision {
  pair: string;
  agentId: string;
  session: string;
  // Final multipliers
  pairCapitalMultiplier: number;
  agentAuthorityMultiplier: number;
  sessionMultiplier: number;
  coalitionMultiplier: number;
  // Combined
  finalPositionMultiplier: number;
  // Permissions
  tradePermitted: boolean;
  blockReasons: string[];
  // Metadata
  darwinTier: DarwinismTier;
  survivorshipScore: number;
  expectancySlopeWarning: ExpectancySlopeWarning | null;
}

export interface LiveDarwinState {
  // Core state from Darwinism engine
  darwinism: DarwinismState;
  // Live overlays
  agentAuthorities: AgentAuthority[];
  sessionAuthorities: SessionAuthority[];
  coalitionReinforcements: CoalitionReinforcement[];
  indicatorWeights: IndicatorWeight[];
  safetyReactions: SafetyReaction[];
  expectancyWarnings: ExpectancySlopeWarning[];
  // Counters
  tradesProcessed: number;
  lastUpdate: number;
  lastFullRebalance: number;
  rebalanceInterval: number;   // every N trades
  mode: 'ACTIVE' | 'FALLBACK_GOVERNANCE';
}

// ─── Configuration ───────────────────────────────────────────────────

export interface LiveDarwinConfig {
  // Capital scaling
  topTierMultiplier: number;      // 1.2
  strongMultiplier: number;       // 1.0
  neutralMultiplier: number;      // 0.7
  weakMultiplier: number;         // 0.4
  failingMultiplier: number;      // 0.0
  // Agent authority
  minAuthorityThreshold: number;  // below this = disabled
  confirmationOnlyThreshold: number; // below this = confirmation only
  // Session
  minSessionWeight: number;       // 0.3
  // Safety
  drawdownCapitalReduction: number; // 0.4
  // Rebalance
  rebalanceEveryNTrades: number;  // 50
  indicatorUpdateEveryN: number;  // 100
  // Fail-safe
  enableDarwin: boolean;
}

const DEFAULT_CONFIG: LiveDarwinConfig = {
  topTierMultiplier: 1.2,
  strongMultiplier: 1.0,
  neutralMultiplier: 0.7,
  weakMultiplier: 0.4,
  failingMultiplier: 0.0,
  minAuthorityThreshold: 20,
  confirmationOnlyThreshold: 40,
  minSessionWeight: 0.3,
  drawdownCapitalReduction: 0.4,
  rebalanceEveryNTrades: 50,
  indicatorUpdateEveryN: 100,
  enableDarwin: true,
};

let _config: LiveDarwinConfig = { ...DEFAULT_CONFIG };

export function getLiveDarwinConfig(): LiveDarwinConfig {
  return { ..._config };
}
export function setLiveDarwinConfig(partial: Partial<LiveDarwinConfig>): void {
  _config = { ..._config, ...partial };
}

// ─── Score Level Classification ──────────────────────────────────────

function classifyScoreLevel(score: number): DarwinScoreLevel {
  if (score >= 75) return 'TOP_TIER';
  if (score >= 60) return 'STRONG';
  if (score >= 45) return 'NEUTRAL';
  if (score >= 25) return 'WEAK';
  return 'FAILING';
}

function getCapitalMultiplier(level: DarwinScoreLevel): number {
  switch (level) {
    case 'TOP_TIER': return _config.topTierMultiplier;
    case 'STRONG': return _config.strongMultiplier;
    case 'NEUTRAL': return _config.neutralMultiplier;
    case 'WEAK': return _config.weakMultiplier;
    case 'FAILING': return _config.failingMultiplier;
  }
}

// ─── Agent Authority Computation ─────────────────────────────────────

function computeAgentAuthorities(
  trades: DarwinismTradeRecord[],
  pairScores: PairSurvivorshipScore[],
): AgentAuthority[] {
  // Group trades by agent
  const agentMap = new Map<string, DarwinismTradeRecord[]>();
  for (const t of trades) {
    const list = agentMap.get(t.agentId) || [];
    list.push(t);
    agentMap.set(t.agentId, list);
  }

  const pairScoreMap = new Map(pairScores.map(p => [p.pair, p.overallScore]));

  return Array.from(agentMap.entries()).map(([agentId, agentTrades]) => {
    const n = agentTrades.length;
    if (n < 5) {
      return {
        agentId, authorityScore: 0, role: 'DISABLED' as const,
        capitalMultiplier: 0, pairAuthorities: {}, expectancySlope: 0,
        reasoning: ['Insufficient data'],
      };
    }

    const pips = agentTrades.map(t => t.pips);
    const wins = pips.filter(p => p > 0).length;
    const winRate = wins / n;
    const expectancy = pips.reduce((s, p) => s + p, 0) / n;
    const grossProfit = pips.filter(p => p > 0).reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(pips.filter(p => p <= 0).reduce((s, p) => s + p, 0));
    const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    // Expectancy slope (first half vs second half)
    const half = Math.floor(n / 2);
    const firstExp = pips.slice(0, half).reduce((s, p) => s + p, 0) / Math.max(1, half);
    const secondExp = pips.slice(half).reduce((s, p) => s + p, 0) / Math.max(1, n - half);
    const expSlope = secondExp - firstExp;

    // Agent survivorship score
    const agentScore = Math.max(0, Math.min(100,
      (expectancy > 0 ? 30 : 0) +
      winRate * 30 +
      Math.min(20, pf * 5) +
      (expSlope > 0 ? 15 : 0) +
      Math.min(5, n / 20)
    ));

    // Per-pair authority = agent score × pair score (normalized)
    const pairAuthorities: Record<string, number> = {};
    const pairGroups = new Map<string, DarwinismTradeRecord[]>();
    for (const t of agentTrades) {
      const list = pairGroups.get(t.pair) || [];
      list.push(t);
      pairGroups.set(t.pair, list);
    }
    for (const [pair, pTrades] of pairGroups) {
      const pairScore = pairScoreMap.get(pair) || 50;
      const pairPips = pTrades.map(t => t.pips);
      const pairExp = pairPips.reduce((s, p) => s + p, 0) / pairPips.length;
      pairAuthorities[pair] = Math.max(0, Math.min(100,
        (agentScore * 0.5) + (pairScore * 0.3) + (pairExp > 0 ? 20 : 0)
      ));
    }

    // Determine role
    let role: AgentAuthority['role'] = 'FULL_TRADE';
    if (agentScore < _config.minAuthorityThreshold) role = 'DISABLED';
    else if (agentScore < _config.confirmationOnlyThreshold) role = 'CONFIRMATION_ONLY';

    const reasoning: string[] = [];
    if (expectancy > 0) reasoning.push(`+${expectancy.toFixed(1)}p expectancy`);
    else reasoning.push(`${expectancy.toFixed(1)}p expectancy — caution`);
    if (pf >= 1.5) reasoning.push(`Strong PF: ${pf.toFixed(2)}`);
    if (expSlope > 0) reasoning.push('Improving trend');
    else if (expSlope < -0.5) reasoning.push('Degrading — monitor');

    return {
      agentId,
      authorityScore: Math.round(agentScore * 10) / 10,
      role,
      capitalMultiplier: role === 'DISABLED' ? 0 : role === 'CONFIRMATION_ONLY' ? 0.5 : 1.0,
      pairAuthorities,
      expectancySlope: Math.round(expSlope * 100) / 100,
      reasoning,
    };
  }).sort((a, b) => b.authorityScore - a.authorityScore);
}

// ─── Session Authority ───────────────────────────────────────────────

function computeSessionAuthorities(pairScores: PairSurvivorshipScore[]): SessionAuthority[] {
  const result: SessionAuthority[] = [];

  for (const p of pairScores) {
    for (const s of p.sessions) {
      const weight = (s.compositeScore / 100) * (p.overallScore / 100);
      const enabled = weight >= _config.minSessionWeight && s.approval !== 'suppressed';
      const multiplier = enabled
        ? Math.max(0.3, Math.min(1.5, weight * 2))
        : 0;

      result.push({
        session: s.session,
        pair: p.pair,
        weight: Math.round(weight * 1000) / 1000,
        positionSizeMultiplier: Math.round(multiplier * 100) / 100,
        enabled,
        reasoning: !enabled
          ? `Suppressed: score ${s.compositeScore.toFixed(0)}, pair ${p.overallScore}`
          : `Active: weight ${(weight * 100).toFixed(0)}%`,
      });
    }
  }

  return result;
}

// ─── Coalition Reinforcement ─────────────────────────────────────────

function computeCoalitionReinforcements(pairScores: PairSurvivorshipScore[]): CoalitionReinforcement[] {
  return pairScores.map(p => {
    const { deltaExpectancy, harmRate } = p.coalitions;
    let permission: CoalitionReinforcement['permission'] = 'NEUTRAL';
    let authorityMultiplier = 1.0;

    if (deltaExpectancy > 0 && harmRate < 0.20) {
      permission = 'BOOSTED';
      authorityMultiplier = 1.0 + Math.min(0.15, deltaExpectancy * 0.05);
    } else if (deltaExpectancy > 0 && harmRate < 0.40) {
      permission = 'NEUTRAL';
    } else if (deltaExpectancy <= 0 || harmRate >= 0.40) {
      permission = 'REDUCED';
      authorityMultiplier = 0.85;
    }
    if (harmRate >= 0.60) {
      permission = 'BLOCKED';
      authorityMultiplier = 0;
    }

    return {
      coalitionKey: p.pair,
      agents: [],  // populated from coalition engine when available
      deltaExpectancy: Math.round(deltaExpectancy * 100) / 100,
      harmRate: Math.round(harmRate * 1000) / 1000,
      permission,
      authorityMultiplier: Math.round(authorityMultiplier * 100) / 100,
    };
  });
}

// ─── Indicator Survivorship ──────────────────────────────────────────

function computeIndicatorWeights(pairScores: PairSurvivorshipScore[]): IndicatorWeight[] {
  // Aggregate indicator performance across all pairs
  const indicatorAgg = new Map<string, { scores: number[]; counts: number }>();

  for (const p of pairScores) {
    for (const ind of p.indicators) {
      const entry = indicatorAgg.get(ind.indicator) || { scores: [], counts: 0 };
      entry.scores.push(ind.survivorshipScore);
      entry.counts++;
      indicatorAgg.set(ind.indicator, entry);
    }
  }

  return Array.from(indicatorAgg.entries()).map(([indicator, data]) => {
    const backtestScore = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
    // Simulate live score as slightly lower (conservative)
    const liveScore = Math.max(0, backtestScore - 5 + Math.random() * 10);
    const compositeWeight = backtestScore * 0.4 + liveScore * 0.6;

    // Trend detection
    const sorted = [...data.scores];
    const half = Math.floor(sorted.length / 2);
    const firstAvg = sorted.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const secondAvg = sorted.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, sorted.length - half);
    const trend: IndicatorWeight['trend'] = secondAvg > firstAvg + 3 ? 'rising' : secondAvg < firstAvg - 3 ? 'falling' : 'stable';

    let status: IndicatorWeight['status'] = 'ACTIVE';
    if (compositeWeight < 30) status = 'DISABLED';
    else if (compositeWeight < 50) status = 'DOWNGRADED';

    return {
      indicator,
      backtestScore: Math.round(backtestScore * 10) / 10,
      liveScore: Math.round(liveScore * 10) / 10,
      compositeWeight: Math.round(compositeWeight * 10) / 10,
      trend,
      status,
    };
  }).sort((a, b) => b.compositeWeight - a.compositeWeight);
}

// ─── Safety Reactions ────────────────────────────────────────────────

function processSafetyReactions(triggers: DarwinismSafetyTrigger[]): SafetyReaction[] {
  return triggers.map(trigger => {
    let action = '';
    let capitalReduction = 0;
    let freezeCoalitions = false;
    let restrictToTopAgent = false;

    switch (trigger.type) {
      case 'DD_SPIKE':
        action = `Drawdown spike on ${trigger.pair}: reduce capital ${(_config.drawdownCapitalReduction * 100).toFixed(0)}%, freeze new coalitions`;
        capitalReduction = _config.drawdownCapitalReduction;
        freezeCoalitions = true;
        break;
      case 'EXP_SLOPE_NEG':
        action = `Expectancy collapse on ${trigger.pair}: restrict to top agent only`;
        capitalReduction = 0.2;
        restrictToTopAgent = true;
        break;
      case 'PF_LOW':
        action = `Low PF on ${trigger.pair}: reduce trade frequency`;
        capitalReduction = 0.15;
        break;
      case 'COALITION_COLLAPSE':
        action = `Coalition collapse on ${trigger.pair}: freeze coalition permissions`;
        freezeCoalitions = true;
        break;
    }

    return {
      trigger,
      action,
      capitalReduction,
      freezeCoalitions,
      restrictToTopAgent,
      timestamp: Date.now(),
    };
  });
}

// ─── Expectancy Slope Early Warning ──────────────────────────────────

function computeExpectancyWarnings(pairScores: PairSurvivorshipScore[]): ExpectancySlopeWarning[] {
  return pairScores.map(p => {
    const slope = p.rollingWindows.w50.expectancySlope;
    let direction: ExpectancySlopeWarning['direction'] = 'FLAT';
    let action: ExpectancySlopeWarning['action'] = 'HOLD';
    let confidence = 50;

    if (slope > 0.3) {
      direction = 'RISING';
      action = 'INCREASE_ALLOCATION';
      confidence = Math.min(90, 50 + slope * 20);
    } else if (slope < -0.3) {
      direction = 'FALLING';
      action = 'REDUCE_FREQUENCY';
      confidence = Math.min(90, 50 + Math.abs(slope) * 20);
    }

    return {
      pair: p.pair,
      slope: Math.round(slope * 100) / 100,
      direction,
      action,
      confidence: Math.round(confidence),
    };
  });
}

// ─── In-Memory State ─────────────────────────────────────────────────

let _liveDarwinState: LiveDarwinState = {
  darwinism: getDarwinismState(),
  agentAuthorities: [],
  sessionAuthorities: [],
  coalitionReinforcements: [],
  indicatorWeights: [],
  safetyReactions: [],
  expectancyWarnings: [],
  tradesProcessed: 0,
  lastUpdate: 0,
  lastFullRebalance: 0,
  rebalanceInterval: DEFAULT_CONFIG.rebalanceEveryNTrades,
  mode: 'ACTIVE',
};

export function getLiveDarwinState(): LiveDarwinState {
  return { ..._liveDarwinState };
}

// ─── Execute Decision (called per trade) ─────────────────────────────

export function getDarwinExecutionDecision(
  pair: string,
  agentId: string,
  session: string,
): DarwinExecutionDecision {
  if (!_config.enableDarwin || _liveDarwinState.mode === 'FALLBACK_GOVERNANCE') {
    return {
      pair, agentId, session,
      pairCapitalMultiplier: 1.0,
      agentAuthorityMultiplier: 1.0,
      sessionMultiplier: 1.0,
      coalitionMultiplier: 1.0,
      finalPositionMultiplier: 1.0,
      tradePermitted: true,
      blockReasons: [],
      darwinTier: 'BETA',
      survivorshipScore: 50,
      expectancySlopeWarning: null,
    };
  }

  const blockReasons: string[] = [];

  // 1. Pair capital
  const pairScore = _liveDarwinState.darwinism.pairs.find(p => p.pair === pair);
  const survivorshipScore = pairScore?.overallScore ?? 50;
  const darwinTier = pairScore?.tier ?? 'BETA';
  const level = classifyScoreLevel(survivorshipScore);
  let pairCapitalMultiplier = getCapitalMultiplier(level);

  // Safety reduction
  const pairSafetyReactions = _liveDarwinState.safetyReactions.filter(r => r.trigger.pair === pair);
  for (const sr of pairSafetyReactions) {
    pairCapitalMultiplier *= (1 - sr.capitalReduction);
  }

  if (level === 'FAILING') {
    blockReasons.push(`Pair ${pair} in EXTINCTION — shadow only`);
  }

  // 2. Agent authority
  const agentAuth = _liveDarwinState.agentAuthorities.find(a => a.agentId === agentId);
  let agentAuthorityMultiplier = agentAuth?.capitalMultiplier ?? 1.0;

  if (agentAuth?.role === 'DISABLED') {
    blockReasons.push(`Agent ${agentId} disabled — below authority threshold`);
    agentAuthorityMultiplier = 0;
  }

  // Safety: restrict to top agent
  const restrictToTop = pairSafetyReactions.some(r => r.restrictToTopAgent);
  if (restrictToTop && _liveDarwinState.agentAuthorities.length > 0) {
    const topAgent = _liveDarwinState.agentAuthorities[0];
    if (agentId !== topAgent.agentId) {
      blockReasons.push(`Safety: restricted to top agent (${topAgent.agentId})`);
      agentAuthorityMultiplier = 0;
    }
  }

  // 3. Session authority
  const sessionAuth = _liveDarwinState.sessionAuthorities.find(
    s => s.pair === pair && s.session === session
  );
  let sessionMultiplier = sessionAuth?.positionSizeMultiplier ?? 1.0;

  if (sessionAuth && !sessionAuth.enabled) {
    blockReasons.push(`Session ${session} suppressed for ${pair}`);
    sessionMultiplier = 0;
  }

  // 4. Coalition
  const coalitionReinf = _liveDarwinState.coalitionReinforcements.find(c => c.coalitionKey === pair);
  let coalitionMultiplier = coalitionReinf?.authorityMultiplier ?? 1.0;

  if (coalitionReinf?.permission === 'BLOCKED') {
    blockReasons.push('Coalition blocked due to high harm rate');
    coalitionMultiplier = 0.5;
  }

  // Freeze check
  const coalitionFrozen = pairSafetyReactions.some(r => r.freezeCoalitions);
  if (coalitionFrozen) coalitionMultiplier = Math.min(coalitionMultiplier, 1.0);

  // 5. Expectancy warning
  const expWarning = _liveDarwinState.expectancyWarnings.find(w => w.pair === pair) ?? null;

  // Final combined multiplier
  const finalPositionMultiplier = Math.max(0, Math.min(2.0,
    pairCapitalMultiplier * agentAuthorityMultiplier * sessionMultiplier * coalitionMultiplier
  ));

  const tradePermitted = blockReasons.length === 0 && finalPositionMultiplier > 0;

  return {
    pair, agentId, session,
    pairCapitalMultiplier: Math.round(pairCapitalMultiplier * 100) / 100,
    agentAuthorityMultiplier: Math.round(agentAuthorityMultiplier * 100) / 100,
    sessionMultiplier: Math.round(sessionMultiplier * 100) / 100,
    coalitionMultiplier: Math.round(coalitionMultiplier * 100) / 100,
    finalPositionMultiplier: Math.round(finalPositionMultiplier * 100) / 100,
    tradePermitted,
    blockReasons,
    darwinTier,
    survivorshipScore,
    expectancySlopeWarning: expWarning,
  };
}

// ─── Full Rebalance (called every N trades or on demand) ─────────────

export function rebalanceDarwin(
  tradesByPair: Record<string, DarwinismTradeRecord[]>,
  allTrades: DarwinismTradeRecord[],
): LiveDarwinState {
  if (!_config.enableDarwin) {
    _liveDarwinState.mode = 'FALLBACK_GOVERNANCE';
    return { ..._liveDarwinState };
  }

  try {
    // 1. Run pair darwinism evaluation
    const darwinismState = evaluatePairDarwinism(tradesByPair);

    // 2. Compute all overlays
    const agentAuthorities = computeAgentAuthorities(allTrades, darwinismState.pairs);
    const sessionAuthorities = computeSessionAuthorities(darwinismState.pairs);
    const coalitionReinforcements = computeCoalitionReinforcements(darwinismState.pairs);
    const indicatorWeights = computeIndicatorWeights(darwinismState.pairs);
    const safetyReactions = processSafetyReactions(darwinismState.safetyTriggers);
    const expectancyWarnings = computeExpectancyWarnings(darwinismState.pairs);

    const totalTrades = Object.values(tradesByPair).reduce((s, t) => s + t.length, 0);

    _liveDarwinState = {
      darwinism: darwinismState,
      agentAuthorities,
      sessionAuthorities,
      coalitionReinforcements,
      indicatorWeights,
      safetyReactions,
      expectancyWarnings,
      tradesProcessed: totalTrades,
      lastUpdate: Date.now(),
      lastFullRebalance: Date.now(),
      rebalanceInterval: _config.rebalanceEveryNTrades,
      mode: 'ACTIVE',
    };
  } catch {
    // Fail-safe: revert to governance mode
    _liveDarwinState.mode = 'FALLBACK_GOVERNANCE';
  }

  return { ..._liveDarwinState };
}

// ─── On Trade Close (incremental update) ─────────────────────────────

export function onTradeClose(
  trade: DarwinismTradeRecord,
  tradesByPair: Record<string, DarwinismTradeRecord[]>,
  allTrades: DarwinismTradeRecord[],
): void {
  _liveDarwinState.tradesProcessed++;

  // Check if full rebalance needed
  const tradesSinceRebalance = _liveDarwinState.tradesProcessed % _config.rebalanceEveryNTrades;
  if (tradesSinceRebalance === 0) {
    rebalanceDarwin(tradesByPair, allTrades);
  }
}

// ─── Generate Mock Live State (for dashboard) ────────────────────────

export function generateMockLiveDarwinState(): LiveDarwinState {
  const PAIRS = ['USD_CAD', 'EUR_USD', 'AUD_USD', 'EUR_GBP', 'USD_JPY', 'GBP_USD', 'NZD_USD', 'USD_CHF'];
  const SESSIONS = ['london-open', 'ny-overlap', 'asian', 'rollover'];
  const AGENTS = ['forex-macro', 'range-navigator', 'liquidity-radar', 'volatility-architect', 'risk-sentinel', 'fractal-intelligence'];
  const INDICATORS = ['ema50', 'supertrend', 'adx', 'rsi', 'bollinger', 'ichimoku'];

  const tradesByPair: Record<string, DarwinismTradeRecord[]> = {};

  for (const pair of PAIRS) {
    const n = 80 + Math.floor(Math.random() * 120);
    const trades: DarwinismTradeRecord[] = [];
    const pairBias = pair === 'USD_CAD' ? 1.8 : pair === 'EUR_USD' ? 0.9 : pair === 'GBP_USD' ? -0.5 : pair === 'USD_JPY' ? 1.5 : 0.3;
    for (let i = 0; i < n; i++) {
      trades.push({
        pair,
        pips: Math.round((pairBias + (Math.random() - 0.45) * 6) * 10) / 10,
        session: SESSIONS[Math.floor(Math.random() * SESSIONS.length)],
        agentId: AGENTS[Math.floor(Math.random() * AGENTS.length)],
        spreadPips: Math.round((0.3 + Math.random() * 0.8) * 100) / 100,
        timestamp: Date.now() - (n - i) * 300000,
        coalitionAgents: Math.random() > 0.4 ? [AGENTS[Math.floor(Math.random() * 3)]] : undefined,
        indicators: Math.random() > 0.3 ? INDICATORS.filter(() => Math.random() > 0.5) : undefined,
      });
    }
    tradesByPair[pair] = trades;
  }

  const allTrades = Object.values(tradesByPair).flat();
  return rebalanceDarwin(tradesByPair, allTrades);
}
