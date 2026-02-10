// Agent Contribution Analysis Engine
// Evaluates each agent's system-level impact via what-if exclusion analysis.
// Classifies agents as Champion / Stabilizer / Specialist / Diluter.
// Outputs live deployment rules and multiplier recommendations.
//
// Analysis-only — does NOT modify governance, direction, or safety logic.

import { buildEnvKeyFromRaw, normalizeSession, normalizeDirection, computeSpreadBucket } from './environmentSignature';

// ─── Types ────────────────────────────────────────────────────────────

export type AgentRole = 'champion' | 'stabilizer' | 'specialist' | 'diluter';
export type AgentPriority = 'HIGH' | 'STANDARD' | 'GATED' | 'SHADOW';

export interface AgentContributionRecord {
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

export interface SystemMetrics {
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
  maxDrawdown: number;
  ddSlope: number;      // rolling DD trend: negative = worsening
  sharpe: number;
  harmRate: number;      // % of trades that lost > 2× avg loss
}

export interface ExclusionDelta {
  deltaExpectancy: number;
  deltaPF: number;
  deltaMaxDD: number;
  deltaSharpe: number;
  deltaHarmRate: number;
  systemWithout: SystemMetrics;
}

export interface PairAgentMetrics {
  pair: string;
  trades: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
}

export interface SessionAgentMetrics {
  session: string;
  trades: number;
  winRate: number;
  expectancy: number;
  netPips: number;
}

export interface RegimeAgentMetrics {
  regime: string;
  trades: number;
  winRate: number;
  expectancy: number;
  netPips: number;
}

export interface AgentContribution {
  agentId: string;
  role: AgentRole;
  priority: AgentPriority;
  reasoning: string[];

  // Core metrics
  trades: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  harmRate: number;

  // System-level impact (what-if exclusion)
  exclusionDelta: ExclusionDelta;

  // Pair breakdown
  pairMetrics: PairAgentMetrics[];
  bestPair: string;
  worstPair: string;

  // Session breakdown
  sessionMetrics: SessionAgentMetrics[];
  bestSession: string;

  // Regime breakdown
  regimeMetrics: RegimeAgentMetrics[];

  // Recommended multiplier
  recommendedMultiplier: number;
  multiplierRange: [number, number];

  // Pair × Agent alignment
  pairAlignment: 'primary' | 'secondary' | 'shadow';
  allowedPairs: string[];
  allowedSessions: string[];
}

export interface AgentOptimizationResult {
  systemBaseline: SystemMetrics;
  contributions: AgentContribution[];
  pairAgentMatrix: Record<string, string[]>; // pair → champion agent IDs
  improvementSummary: {
    baselineExpectancy: number;
    optimizedExpectancy: number;
    baselinePF: number;
    optimizedPF: number;
    baselineDD: number;
    optimizedDD: number;
    agentsEnabled: number;
    agentsShadowed: number;
  };
}

// ─── PnL Calculator ──────────────────────────────────────────────────

function calcPips(trade: AgentContributionRecord): number {
  const mult = trade.currency_pair.includes('JPY') ? 100 : 10000;
  if (trade.direction === 'long') return (trade.exit_price - trade.entry_price) * mult;
  return (trade.entry_price - trade.exit_price) * mult;
}

// ─── System Metrics Calculator ───────────────────────────────────────

function computeSystemMetrics(trades: AgentContributionRecord[]): SystemMetrics {
  if (trades.length === 0) {
    return { trades: 0, wins: 0, winRate: 0, expectancy: 0, netPips: 0, profitFactor: 0, grossProfit: 0, grossLoss: 0, maxDrawdown: 0, ddSlope: 0, sharpe: 0, harmRate: 0 };
  }

  const pips = trades.map(calcPips);
  const wins = pips.filter(p => p > 0).length;
  const grossProfit = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const netPips = pips.reduce((a, b) => a + b, 0);
  const winRate = wins / trades.length;
  const expectancy = netPips / trades.length;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // Sharpe
  const mean = expectancy;
  const variance = pips.reduce((a, p) => a + (p - mean) ** 2, 0) / (pips.length - 1 || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // Max Drawdown + DD slope
  let peak = 0, maxDD = 0, cumPnl = 0;
  const ddPoints: number[] = [];
  for (const p of pips) {
    cumPnl += p;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
    ddPoints.push(dd);
  }

  // DD slope: linear regression of last 50 DD points
  let ddSlope = 0;
  const ddWindow = ddPoints.slice(-50);
  if (ddWindow.length >= 10) {
    const n = ddWindow.length;
    const xMean = (n - 1) / 2;
    const yMean = ddWindow.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (ddWindow[i] - yMean);
      den += (i - xMean) ** 2;
    }
    ddSlope = den > 0 ? num / den : 0;
  }

  // Harm rate: trades losing > 2× average loss size
  const losses = pips.filter(p => p < 0);
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const harmfulTrades = losses.filter(l => Math.abs(l) > avgLoss * 2).length;
  const harmRate = trades.length > 0 ? harmfulTrades / trades.length : 0;

  return { trades: trades.length, wins, winRate, expectancy, netPips, profitFactor: pf, grossProfit, grossLoss, maxDrawdown: maxDD, ddSlope, sharpe, harmRate };
}

// ─── Exclusion Analysis ──────────────────────────────────────────────

function computeExclusionDelta(
  allTrades: AgentContributionRecord[],
  agentId: string,
  baseline: SystemMetrics
): ExclusionDelta {
  const withoutAgent = allTrades.filter(t => t.agent_id !== agentId);
  const systemWithout = computeSystemMetrics(withoutAgent);

  return {
    deltaExpectancy: baseline.expectancy - systemWithout.expectancy,
    deltaPF: baseline.profitFactor - systemWithout.profitFactor,
    deltaMaxDD: baseline.maxDrawdown - systemWithout.maxDrawdown,
    deltaSharpe: baseline.sharpe - systemWithout.sharpe,
    deltaHarmRate: baseline.harmRate - systemWithout.harmRate,
    systemWithout,
  };
}

// ─── Agent Classification ────────────────────────────────────────────

function classifyAgent(
  agentMetrics: SystemMetrics,
  exclusion: ExclusionDelta,
  pairMetrics: PairAgentMetrics[],
  sessionMetrics: SessionAgentMetrics[],
): { role: AgentRole; priority: AgentPriority; reasoning: string[]; multiplier: number; range: [number, number] } {
  const reasoning: string[] = [];

  // Check if removing this agent HURTS the system (positive delta = agent helps)
  const helpsExpectancy = exclusion.deltaExpectancy > 0;
  const helpsPF = exclusion.deltaPF > 0;
  const reducesDD = exclusion.deltaMaxDD > 0; // removing agent increases DD = agent reduces DD
  const reducesSharpe = exclusion.deltaSharpe > 0;
  const reducesHarm = exclusion.deltaHarmRate > 0; // removing agent increases harm

  // Count positive-edge environments
  const positiveSessionCount = sessionMetrics.filter(s => s.expectancy > 0 && s.trades >= 10).length;
  const positivePairCount = pairMetrics.filter(p => p.expectancy > 0 && p.trades >= 10).length;
  const totalSessionCount = sessionMetrics.filter(s => s.trades >= 10).length;

  // Champion: improves expectancy AND/OR PF without increasing DD
  if (helpsExpectancy && agentMetrics.expectancy > 0 && agentMetrics.profitFactor >= 1.1 && !reducesDD) {
    reasoning.push('Profit driver: improves system expectancy');
    if (helpsPF) reasoning.push(`System PF improves by ${exclusion.deltaPF.toFixed(2)} with agent`);
    if (reducesSharpe) reasoning.push(`Sharpe contribution: +${exclusion.deltaSharpe.toFixed(2)}`);
    return { role: 'champion', priority: 'HIGH', reasoning, multiplier: 1.15, range: [1.1, 1.25] };
  }

  // Stabilizer: reduces DD or variance even if raw PnL is modest
  if (reducesDD && agentMetrics.expectancy >= -0.1) {
    reasoning.push('Risk controller: reduces system drawdown');
    if (reducesHarm) reasoning.push('Reduces harm rate');
    if (agentMetrics.expectancy > 0) reasoning.push(`Positive expectancy: ${agentMetrics.expectancy.toFixed(3)}p`);
    return { role: 'stabilizer', priority: 'STANDARD', reasoning, multiplier: 0.95, range: [0.9, 1.0] };
  }

  // Specialist: positive only in specific sessions/regimes
  if (positiveSessionCount > 0 && positiveSessionCount < totalSessionCount && agentMetrics.netPips > -100) {
    const bestSessions = sessionMetrics.filter(s => s.expectancy > 0 && s.trades >= 10).map(s => s.session);
    reasoning.push(`Environment-bound: positive in ${bestSessions.join(', ')}`);
    if (positivePairCount > 0) {
      const bestPairs = pairMetrics.filter(p => p.expectancy > 0 && p.trades >= 10).map(p => p.pair);
      reasoning.push(`Best pairs: ${bestPairs.slice(0, 3).join(', ')}`);
    }
    return { role: 'specialist', priority: 'GATED', reasoning, multiplier: 0.7, range: [0.6, 0.8] };
  }

  // Diluter: increases harm rate or reduces expectancy
  reasoning.push('Edge destroyer: degrades system performance');
  if (!helpsExpectancy) reasoning.push(`Removing agent improves expectancy by ${Math.abs(exclusion.deltaExpectancy).toFixed(3)}p`);
  if (!helpsPF) reasoning.push(`Removing agent improves PF by ${Math.abs(exclusion.deltaPF).toFixed(2)}`);
  if (agentMetrics.harmRate > 0.1) reasoning.push(`High harm rate: ${(agentMetrics.harmRate * 100).toFixed(1)}%`);
  return { role: 'diluter', priority: 'SHADOW', reasoning, multiplier: 0, range: [0, 0] };
}

// ─── Pair × Agent Alignment ─────────────────────────────────────────

const PRIMARY_PAIR = 'USD_CAD';
const SECONDARY_PAIRS = ['AUD_USD', 'EUR_USD', 'EUR_GBP'];
const PRIME_SESSIONS = ['london-open', 'ny-overlap'];

function determinePairAlignment(
  role: AgentRole,
  pairMetrics: PairAgentMetrics[]
): { alignment: 'primary' | 'secondary' | 'shadow'; allowedPairs: string[] } {
  const usdCadMetrics = pairMetrics.find(p => p.pair === PRIMARY_PAIR);

  if (role === 'diluter') {
    return { alignment: 'shadow', allowedPairs: [] };
  }

  if (role === 'champion' || role === 'stabilizer') {
    // Champions + Stabilizers allowed on primary
    const allowed = [PRIMARY_PAIR];
    // Also allow on secondaries where they have positive edge
    for (const sp of SECONDARY_PAIRS) {
      const m = pairMetrics.find(p => p.pair === sp);
      if (m && m.expectancy > 0 && m.trades >= 5) allowed.push(sp);
    }
    return { alignment: 'primary', allowedPairs: allowed };
  }

  // Specialist: secondary or shadow based on pair-level data
  const positivePairs = pairMetrics.filter(p => p.expectancy > 0 && p.trades >= 5).map(p => p.pair);
  if (positivePairs.length === 0) return { alignment: 'shadow', allowedPairs: [] };
  return { alignment: 'secondary', allowedPairs: positivePairs };
}

// ─── Main Analysis ──────────────────────────────────────────────────

export function analyzeAgentContributions(
  trades: AgentContributionRecord[]
): AgentOptimizationResult {
  // System baseline
  const baseline = computeSystemMetrics(trades);

  // Group by agent
  const byAgent: Record<string, AgentContributionRecord[]> = {};
  for (const t of trades) {
    const aid = t.agent_id || 'unknown';
    if (aid === 'manual-test' || aid === 'unknown' || aid === 'backtest-engine') continue;
    if (!byAgent[aid]) byAgent[aid] = [];
    byAgent[aid].push(t);
  }

  const contributions: AgentContribution[] = [];
  const pairAgentMatrix: Record<string, string[]> = {};

  for (const [agentId, agentTrades] of Object.entries(byAgent)) {
    const agentMetrics = computeSystemMetrics(agentTrades);
    const exclusion = computeExclusionDelta(trades, agentId, baseline);

    // Per-pair breakdown
    const pairGroups: Record<string, AgentContributionRecord[]> = {};
    for (const t of agentTrades) {
      if (!pairGroups[t.currency_pair]) pairGroups[t.currency_pair] = [];
      pairGroups[t.currency_pair].push(t);
    }
    const pairMetrics: PairAgentMetrics[] = Object.entries(pairGroups).map(([pair, pts]) => {
      const pm = computeSystemMetrics(pts);
      return { pair, trades: pm.trades, winRate: pm.winRate, expectancy: pm.expectancy, netPips: pm.netPips, profitFactor: pm.profitFactor };
    }).sort((a, b) => b.expectancy - a.expectancy);

    // Per-session breakdown
    const sessionGroups: Record<string, AgentContributionRecord[]> = {};
    for (const t of agentTrades) {
      const s = t.session_label || 'unknown';
      if (!sessionGroups[s]) sessionGroups[s] = [];
      sessionGroups[s].push(t);
    }
    const sessionMetrics: SessionAgentMetrics[] = Object.entries(sessionGroups).map(([session, sts]) => {
      const sm = computeSystemMetrics(sts);
      return { session, trades: sm.trades, winRate: sm.winRate, expectancy: sm.expectancy, netPips: sm.netPips };
    }).sort((a, b) => b.expectancy - a.expectancy);

    // Per-regime breakdown
    const regimeGroups: Record<string, AgentContributionRecord[]> = {};
    for (const t of agentTrades) {
      const r = t.regime_label || 'unknown';
      if (!regimeGroups[r]) regimeGroups[r] = [];
      regimeGroups[r].push(t);
    }
    const regimeMetrics: RegimeAgentMetrics[] = Object.entries(regimeGroups).map(([regime, rts]) => {
      const rm = computeSystemMetrics(rts);
      return { regime, trades: rm.trades, winRate: rm.winRate, expectancy: rm.expectancy, netPips: rm.netPips };
    }).sort((a, b) => b.expectancy - a.expectancy);

    // Classify
    const { role, priority, reasoning, multiplier, range } = classifyAgent(
      agentMetrics, exclusion, pairMetrics, sessionMetrics
    );

    // Pair alignment
    const { alignment, allowedPairs } = determinePairAlignment(role, pairMetrics);
    const allowedSessions = role === 'specialist'
      ? sessionMetrics.filter(s => s.expectancy > 0 && s.trades >= 5).map(s => s.session)
      : role === 'diluter' ? [] : PRIME_SESSIONS;

    // Track pair → agent matrix for champions
    if (role === 'champion') {
      for (const p of allowedPairs) {
        if (!pairAgentMatrix[p]) pairAgentMatrix[p] = [];
        pairAgentMatrix[p].push(agentId);
      }
    }

    contributions.push({
      agentId,
      role,
      priority,
      reasoning,
      trades: agentMetrics.trades,
      winRate: agentMetrics.winRate,
      expectancy: agentMetrics.expectancy,
      netPips: agentMetrics.netPips,
      profitFactor: agentMetrics.profitFactor,
      sharpe: agentMetrics.sharpe,
      maxDrawdown: agentMetrics.maxDrawdown,
      harmRate: agentMetrics.harmRate,
      exclusionDelta: exclusion,
      pairMetrics,
      bestPair: pairMetrics[0]?.pair || 'N/A',
      worstPair: pairMetrics[pairMetrics.length - 1]?.pair || 'N/A',
      sessionMetrics,
      bestSession: sessionMetrics[0]?.session || 'N/A',
      regimeMetrics,
      recommendedMultiplier: multiplier,
      multiplierRange: range,
      pairAlignment: alignment,
      allowedPairs,
      allowedSessions,
    });
  }

  // Sort: champions first, then stabilizers, specialists, diluters
  const roleOrder: Record<AgentRole, number> = { champion: 0, stabilizer: 1, specialist: 2, diluter: 3 };
  contributions.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || b.netPips - a.netPips);

  // Compute optimized metrics (exclude diluters)
  const optimizedTrades = trades.filter(t => {
    const c = contributions.find(c => c.agentId === t.agent_id);
    return !c || c.role !== 'diluter';
  });
  const optimized = computeSystemMetrics(optimizedTrades);

  return {
    systemBaseline: baseline,
    contributions,
    pairAgentMatrix,
    improvementSummary: {
      baselineExpectancy: baseline.expectancy,
      optimizedExpectancy: optimized.expectancy,
      baselinePF: baseline.profitFactor,
      optimizedPF: optimized.profitFactor,
      baselineDD: baseline.maxDrawdown,
      optimizedDD: optimized.maxDrawdown,
      agentsEnabled: contributions.filter(c => c.role !== 'diluter').length,
      agentsShadowed: contributions.filter(c => c.role === 'diluter').length,
    },
  };
}
