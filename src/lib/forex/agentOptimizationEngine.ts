// Agent Optimization Engine
// Phase 1: Diagnose per-agent performance from real trade data
// Phase 2: Generate retune proposals using allowed levers only
//
// Uses environmentSignature.ts as single source of truth for env keys.
// Does NOT modify governance multipliers, gates, or QuantLabs logic.

import { buildEnvKeyFromRaw, normalizeSession, normalizeDirection, computeSpreadBucket } from './environmentSignature';
import type { AgentId } from '@/lib/agents/types';

// ─── Types ────────────────────────────────────────────────────────────

export type AgentTier = 'A' | 'B' | 'C' | 'D';

export interface AgentBreakdown {
  key: string;
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
}

export interface AgentScorecard {
  agentId: string;
  tier: AgentTier;
  totalTrades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
  sharpe: number;
  maxDrawdown: number;
  longNetPips: number;
  longWinRate: number;
  longPF: number;
  shortNetPips: number;
  shortWinRate: number;
  shortPF: number;
  sessionBreakdown: AgentBreakdown[];
  regimeBreakdown: AgentBreakdown[];
  pairBreakdown: AgentBreakdown[];
  directionBreakdown: AgentBreakdown[];
  spreadBucketBreakdown: AgentBreakdown[];
  topEdgeEnvKeys: AgentBreakdown[];
  bottomEnvKeys: AgentBreakdown[];
  oosInSample: { expectancy: number; pf: number; trades: number } | null;
  oosOutSample: { expectancy: number; pf: number; trades: number } | null;
  oosHolds: boolean;
  sessionCoverage: number; // how many sessions profitable
  topReasons: string[];
  recommendedActions: string[];
}

export interface TradeRecord {
  agent_id: string;
  direction: string;
  currency_pair: string;
  entry_price: number;
  exit_price: number;
  session_label: string | null;
  regime_label: string | null;
  spread_at_entry: number | null;
  governance_composite: number | null;
  confidence_score: number | null;
  created_at: string;
}

// ─── PnL Calculator ──────────────────────────────────────────────────

function calcPips(trade: TradeRecord): number {
  const mult = trade.currency_pair.includes('JPY') ? 100 : 10000;
  if (trade.direction === 'long') return (trade.exit_price - trade.entry_price) * mult;
  return (trade.entry_price - trade.exit_price) * mult;
}

function isWin(trade: TradeRecord): boolean {
  return calcPips(trade) > 0;
}

function calcSpreadPips(trade: TradeRecord): number {
  if (!trade.spread_at_entry) return 0;
  const mult = trade.currency_pair.includes('JPY') ? 100 : 10000;
  return trade.spread_at_entry * mult;
}

// ─── Metrics Helpers ─────────────────────────────────────────────────

function computeBreakdown(trades: TradeRecord[], keyFn: (t: TradeRecord) => string): AgentBreakdown[] {
  const groups: Record<string, TradeRecord[]> = {};
  for (const t of trades) {
    const k = keyFn(t);
    if (!groups[k]) groups[k] = [];
    groups[k].push(t);
  }

  return Object.entries(groups).map(([key, group]) => {
    const pips = group.map(calcPips);
    const wins = pips.filter(p => p > 0).length;
    const grossP = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const grossL = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
    return {
      key,
      trades: group.length,
      wins,
      winRate: group.length > 0 ? wins / group.length : 0,
      expectancy: group.length > 0 ? pips.reduce((a, b) => a + b, 0) / group.length : 0,
      netPips: pips.reduce((a, b) => a + b, 0),
      profitFactor: grossL > 0 ? grossP / grossL : grossP > 0 ? 99 : 0,
    };
  }).sort((a, b) => b.expectancy - a.expectancy);
}

function computeSharpe(trades: TradeRecord[]): number {
  if (trades.length < 2) return 0;
  const pips = trades.map(calcPips);
  const mean = pips.reduce((a, b) => a + b, 0) / pips.length;
  const variance = pips.reduce((a, p) => a + (p - mean) ** 2, 0) / (pips.length - 1);
  const std = Math.sqrt(variance);
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
}

function computeMaxDrawdown(trades: TradeRecord[]): number {
  let peak = 0, maxDD = 0, cumPnl = 0;
  for (const t of trades) {
    cumPnl += calcPips(t);
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ─── Scorecard Builder ───────────────────────────────────────────────

export function buildAgentScorecard(agentId: string, trades: TradeRecord[]): AgentScorecard {
  const pips = trades.map(calcPips);
  const wins = pips.filter(p => p > 0).length;
  const grossProfit = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const netPips = pips.reduce((a, b) => a + b, 0);
  const winRate = trades.length > 0 ? wins / trades.length : 0;
  const expectancy = trades.length > 0 ? netPips / trades.length : 0;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const sharpe = computeSharpe(trades);
  const maxDD = computeMaxDrawdown(trades);

  // Direction breakdown
  const longs = trades.filter(t => t.direction === 'long');
  const shorts = trades.filter(t => t.direction === 'short');
  const longPips = longs.map(calcPips);
  const shortPips = shorts.map(calcPips);
  const longWins = longPips.filter(p => p > 0).length;
  const shortWins = shortPips.filter(p => p > 0).length;
  const longGP = longPips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const longGL = Math.abs(longPips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const shortGP = shortPips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const shortGL = Math.abs(shortPips.filter(p => p <= 0).reduce((a, b) => a + b, 0));

  // Breakdowns
  const sessionBD = computeBreakdown(trades, t => t.session_label || 'unknown');
  const regimeBD = computeBreakdown(trades, t => t.regime_label || 'unknown');
  const pairBD = computeBreakdown(trades, t => t.currency_pair);
  const dirBD = computeBreakdown(trades, t => t.direction);
  const spreadBD = computeBreakdown(trades, t => computeSpreadBucket(calcSpreadPips(t)));

  // Environment-level analysis
  const envBD = computeBreakdown(trades, t => {
    const session = normalizeSession(t.session_label || 'unknown');
    const regime = t.regime_label || 'unknown';
    const dir = normalizeDirection(t.direction);
    const sym = t.currency_pair.replace('_', '').replace('/', '');
    return buildEnvKeyFromRaw(session, regime, sym, dir, agentId);
  });
  const topEdge = envBD.filter(e => e.trades >= 10).slice(0, 20);
  const bottomEnv = envBD.filter(e => e.trades >= 10).slice(-20).reverse();

  // OOS: 70/30 chronological split
  const sorted = [...trades].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const splitIdx = Math.floor(sorted.length * 0.7);
  const inSample = sorted.slice(0, splitIdx);
  const outSample = sorted.slice(splitIdx);
  
  const isExpectancy = inSample.length > 0 ? inSample.map(calcPips).reduce((a, b) => a + b, 0) / inSample.length : 0;
  const isGP = inSample.map(calcPips).filter(p => p > 0).reduce((a, b) => a + b, 0);
  const isGL = Math.abs(inSample.map(calcPips).filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const oosExpectancy = outSample.length > 0 ? outSample.map(calcPips).reduce((a, b) => a + b, 0) / outSample.length : 0;
  const oosGP = outSample.map(calcPips).filter(p => p > 0).reduce((a, b) => a + b, 0);
  const oosGL = Math.abs(outSample.map(calcPips).filter(p => p <= 0).reduce((a, b) => a + b, 0));

  const oosHolds = oosExpectancy > 0 && (oosGL > 0 ? oosGP / oosGL : 99) >= 1.05;

  // Session coverage: how many sessions are profitable
  const sessionCoverage = sessionBD.filter(s => s.expectancy > 0).length;

  // Tier classification
  const tier = classifyTier(expectancy, pf, maxDD, sessionCoverage, netPips, oosHolds);

  // Top reasons
  const reasons = generateReasons(agentId, expectancy, pf, netPips, winRate, sessionCoverage, 
    longPips.reduce((a, b) => a + b, 0), shortPips.reduce((a, b) => a + b, 0), pairBD, sessionBD, oosHolds);

  const actions = generateActions(tier, agentId, shortPips.reduce((a, b) => a + b, 0), pairBD, sessionBD);

  return {
    agentId, tier, totalTrades: trades.length, wins, winRate, expectancy, netPips,
    profitFactor: pf, grossProfit, grossLoss, sharpe, maxDrawdown: maxDD,
    longNetPips: longPips.reduce((a, b) => a + b, 0),
    longWinRate: longs.length > 0 ? longWins / longs.length : 0,
    longPF: longGL > 0 ? longGP / longGL : longGP > 0 ? 99 : 0,
    shortNetPips: shortPips.reduce((a, b) => a + b, 0),
    shortWinRate: shorts.length > 0 ? shortWins / shorts.length : 0,
    shortPF: shortGL > 0 ? shortGP / shortGL : shortGP > 0 ? 99 : 0,
    sessionBreakdown: sessionBD, regimeBreakdown: regimeBD, pairBreakdown: pairBD,
    directionBreakdown: dirBD, spreadBucketBreakdown: spreadBD,
    topEdgeEnvKeys: topEdge, bottomEnvKeys: bottomEnv,
    oosInSample: { expectancy: isExpectancy, pf: isGL > 0 ? isGP / isGL : 0, trades: inSample.length },
    oosOutSample: { expectancy: oosExpectancy, pf: oosGL > 0 ? oosGP / oosGL : 0, trades: outSample.length },
    oosHolds, sessionCoverage, topReasons: reasons, recommendedActions: actions,
  };
}

function classifyTier(
  expectancy: number, pf: number, maxDD: number, sessionCoverage: number,
  netPips: number, oosHolds: boolean
): AgentTier {
  // Tier A: positive expectancy, PF >= 1.10, stable across >= 3 sessions
  if (expectancy > 0 && pf >= 1.10 && sessionCoverage >= 3 && oosHolds) return 'A';
  // Tier B: LONG is profitable (can be rescued with direction gating)
  if (netPips > -1000 && pf >= 0.90) return 'B';
  // Tier C: significant losses but some edge environments exist
  if (netPips > -1500) return 'C';
  // Tier D: disable
  return 'D';
}

function generateReasons(
  agentId: string, expectancy: number, pf: number, netPips: number,
  winRate: number, sessionCoverage: number, longNet: number, shortNet: number,
  pairs: AgentBreakdown[], sessions: AgentBreakdown[], oosHolds: boolean
): string[] {
  const reasons: string[] = [];
  if (netPips > 0) reasons.push(`Net profitable: +${netPips.toFixed(0)} pips`);
  else reasons.push(`Net loss: ${netPips.toFixed(0)} pips`);
  
  if (longNet > 0 && shortNet < 0) {
    reasons.push(`LONG +${longNet.toFixed(0)}p vs SHORT ${shortNet.toFixed(0)}p — direction asymmetry`);
  }
  
  const toxicPairs = pairs.filter(p => p.expectancy < -0.5 && p.trades >= 100);
  if (toxicPairs.length > 0) {
    reasons.push(`Toxic pairs: ${toxicPairs.map(p => p.key).join(', ')}`);
  }
  
  const toxicSessions = sessions.filter(s => s.expectancy < -0.5 && s.trades >= 100);
  if (toxicSessions.length > 0) {
    reasons.push(`Weak sessions: ${toxicSessions.map(s => s.key).join(', ')}`);
  }
  
  if (!oosHolds) reasons.push('OOS validation fails — edge may not generalize');
  
  return reasons.slice(0, 5);
}

function generateActions(
  tier: AgentTier, agentId: string, shortNet: number,
  pairs: AgentBreakdown[], sessions: AgentBreakdown[]
): string[] {
  const actions: string[] = [];
  
  if (tier === 'A') {
    actions.push('Deploy: ready for reduced-live sizing');
    return actions;
  }

  if (shortNet < -1000) {
    actions.push('Block SHORT direction — all short trades are destructive');
  }

  const toxicPairs = pairs.filter(p => p.expectancy < -0.5 && p.trades >= 100);
  for (const p of toxicPairs.slice(0, 3)) {
    actions.push(`Block pair ${p.key} (${p.netPips.toFixed(0)}p loss, ${p.trades} trades)`);
  }

  const toxicSessions = sessions.filter(s => s.expectancy < -0.8 && s.trades >= 50);
  for (const s of toxicSessions.slice(0, 2)) {
    actions.push(`Block session ${s.key} (${s.netPips.toFixed(0)}p loss)`);
  }

  if (tier === 'D') {
    actions.push('Disable: move to shadow-only observation');
  }
  
  return actions.slice(0, 5);
}

// ─── Batch Scorecard ─────────────────────────────────────────────────

export function buildAllScorecards(trades: TradeRecord[]): AgentScorecard[] {
  const byAgent: Record<string, TradeRecord[]> = {};
  for (const t of trades) {
    const aid = t.agent_id || 'unknown';
    if (!byAgent[aid]) byAgent[aid] = [];
    byAgent[aid].push(t);
  }
  return Object.entries(byAgent)
    .filter(([id]) => id !== 'manual-test' && id !== 'unknown')
    .map(([id, agentTrades]) => buildAgentScorecard(id, agentTrades))
    .sort((a, b) => b.netPips - a.netPips);
}

// ─── Retune Proposals ────────────────────────────────────────────────

export interface RetuneRule {
  type: 'block_direction' | 'block_pair' | 'block_session' | 'raise_composite' | 'raise_friction' | 'throttle_frequency';
  label: string;
  value: string;
  impactEstimate: string;
}

export interface RetuneProposal {
  agentId: string;
  currentTier: AgentTier;
  targetTier: AgentTier;
  rules: RetuneRule[];
  estimatedExpectancy: number;
  estimatedPF: number;
  estimatedNetPips: number;
  remainingTrades: number;
  deploymentRisk: 'low' | 'medium' | 'high';
  riskReason: string;
}

export function generateRetuneProposal(scorecard: AgentScorecard, trades: TradeRecord[]): RetuneProposal {
  const rules: RetuneRule[] = [];
  let filtered = [...trades];

  // Rule A: Block SHORT if destructive
  if (scorecard.shortNetPips < -1000) {
    rules.push({
      type: 'block_direction',
      label: 'Block SHORT trades',
      value: 'short',
      impactEstimate: `Remove ${Math.abs(scorecard.shortNetPips).toFixed(0)}p loss`,
    });
    filtered = filtered.filter(t => t.direction !== 'short');
  }

  // Rule A: Block toxic pairs
  const toxicPairs = scorecard.pairBreakdown.filter(p => p.expectancy < -0.5 && p.trades >= 100);
  for (const p of toxicPairs.slice(0, 3)) {
    rules.push({
      type: 'block_pair',
      label: `Block ${p.key}`,
      value: p.key,
      impactEstimate: `Remove ${Math.abs(p.netPips).toFixed(0)}p loss from ${p.trades} trades`,
    });
    filtered = filtered.filter(t => t.currency_pair !== p.key);
  }

  // Rule A: Block toxic sessions
  const toxicSessions = scorecard.sessionBreakdown.filter(s => s.expectancy < -0.8 && s.trades >= 50);
  for (const s of toxicSessions.slice(0, 2)) {
    rules.push({
      type: 'block_session',
      label: `Block ${s.key} session`,
      value: s.key,
      impactEstimate: `Remove ${Math.abs(s.netPips).toFixed(0)}p loss from ${s.trades} trades`,
    });
    filtered = filtered.filter(t => (t.session_label || 'unknown') !== s.key);
  }

  // Recalculate metrics with retune applied
  const retunedPips = filtered.map(calcPips);
  const retunedNet = retunedPips.reduce((a, b) => a + b, 0);
  const retunedGP = retunedPips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const retunedGL = Math.abs(retunedPips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const retunedExp = filtered.length > 0 ? retunedNet / filtered.length : 0;
  const retunedPF = retunedGL > 0 ? retunedGP / retunedGL : retunedGP > 0 ? 99 : 0;

  // Deployment risk: concentrated edge = high risk
  const pairConcentration = filtered.length > 0
    ? Math.max(...Object.values(
        filtered.reduce((acc, t) => { acc[t.currency_pair] = (acc[t.currency_pair] || 0) + 1; return acc; }, {} as Record<string, number>)
      )) / filtered.length
    : 1;
  const deploymentRisk: 'low' | 'medium' | 'high' = 
    pairConcentration > 0.4 ? 'high' : pairConcentration > 0.25 ? 'medium' : 'low';

  const targetTier: AgentTier = retunedExp > 0 && retunedPF >= 1.10 ? 'B' : 'C';

  return {
    agentId: scorecard.agentId,
    currentTier: scorecard.tier,
    targetTier,
    rules,
    estimatedExpectancy: retunedExp,
    estimatedPF: retunedPF,
    estimatedNetPips: retunedNet,
    remainingTrades: filtered.length,
    deploymentRisk,
    riskReason: pairConcentration > 0.4 
      ? `Edge concentrated: ${(pairConcentration * 100).toFixed(0)}% in single pair`
      : 'Diversified across pairs',
  };
}
