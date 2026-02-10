// Edge + Governance Filter Simulator Engine
// Analysis/simulation only — does NOT change strategy logic.
// Evaluates ALL pairs across Tier 1/2/3, quantifies how expectancy changes
// when governance + edge filters are applied.

import {
  type NormalizedTrade,
  avg,
  stddev,
  computeMaxDD,
  confidenceInterval,
} from './edgeDiscoveryEngine';
import {
  normalizeSession,
  normalizeRegime,
  normalizeDirection,
  computeSpreadBucket,
  computeCompositeDecile,
} from './environmentSignature';

// ─── Types ────────────────────────────────────────────────────────────

export interface SimMetrics {
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  sharpe: number;
  maxDD: number;
  netPnl: number;
  frictionAdjExp: number;
  stability: number; // DD slope — negative = worsening
}

export interface EnvBucketStats extends SimMetrics {
  envKey: string;
  symbol: string;
  session: string;
  regime: string;
  direction: string;
  spreadBucket: string;
  compositeDecile: string;
  agentSet: string;
  ciLower: number;
  ciUpper: number;
}

export interface EdgeDiminishedScenario {
  envKey: string;
  symbol: string;
  session: string;
  regime: string;
  direction: string;
  spreadBucket: string;
  compositeDecile: string;
  trades: number;
  expectancy: number;
  frictionAdjExp: number;
  profitFactor: number;
  maxDD: number;
  ddSlope: number;
  baselineExpDelta: number; // % collapse vs pair baseline
  reasons: string[];
  recommendation: 'BLOCK' | 'RESTRICT' | 'SHADOW';
}

export interface PairSimResult {
  pair: string;
  tier: 1 | 2 | 3;
  edgeScore: number;
  baseline: SimMetrics;
  govFiltered: SimMetrics & { coveragePct: number };
  edgeFiltered: SimMetrics & { coveragePct: number; edgeDelta: number };
  edgeOnly: SimMetrics & { coveragePct: number };
  diminishedScenarios: EdgeDiminishedScenario[];
  recommendation: string;
}

export interface GlobalEdgeKiller {
  pattern: string; // e.g. "Late NY + Exhaustion + high spread"
  occurrences: number; // across how many pairs
  avgExpectancy: number;
  totalPnlImpact: number;
  pairs: string[];
}

export interface SimulatorConfig {
  minSampleThreshold: number; // configurable: 40/50/100
  collapseThresholdPct: number; // default 20%
  dateRangeMs: number; // lookback in ms
  includeBacktest: boolean;
}

export interface SimulatorResult {
  pairs: PairSimResult[];
  globalKillers: GlobalEdgeKiller[];
  config: SimulatorConfig;
  totalTradesAnalyzed: number;
}

// ─── Config Presets ───────────────────────────────────────────────────

const MS_3M = 90 * 24 * 60 * 60 * 1000;
const MS_6M = 180 * 24 * 60 * 60 * 1000;
const MS_12M = 365 * 24 * 60 * 60 * 1000;

export const DATE_RANGE_OPTIONS = {
  '3M': MS_3M,
  '6M': MS_6M,
  '12M': MS_12M,
  'All': Infinity,
} as const;

export function defaultConfig(): SimulatorConfig {
  return {
    minSampleThreshold: 40,
    collapseThresholdPct: 20,
    dateRangeMs: MS_6M,
    includeBacktest: false,
  };
}

// ─── Metric Computation ──────────────────────────────────────────────

function computeMetrics(trades: NormalizedTrade[]): SimMetrics {
  if (trades.length === 0) return emptyMetrics();
  const pnls = trades.map(t => t.pnlPips);
  const wins = pnls.filter(p => p > 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pnls.filter(p => p <= 0).reduce((s, p) => s + p, 0));
  const frictions = trades.map(t => (t.spreadAtEntry * 10000) + Math.abs(t.slippage));
  const avgFriction = avg(frictions);
  const exp = avg(pnls);
  const sd = stddev(pnls);
  const sharpe = sd > 0 ? (exp / sd) * Math.sqrt(Math.min(trades.length, 252)) : 0;

  // DD slope: compare first-half DD to second-half DD
  const half = Math.floor(pnls.length / 2);
  const dd1 = half > 0 ? computeMaxDD(pnls.slice(0, half)) : 0;
  const dd2 = half > 0 ? computeMaxDD(pnls.slice(half)) : 0;
  const stability = dd2 > 0 ? dd1 - dd2 : 0; // positive = improving, negative = worsening

  return {
    trades: trades.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    expectancy: Math.round(exp * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0,
    sharpe: Math.round(sharpe * 100) / 100,
    maxDD: computeMaxDD(pnls),
    netPnl: Math.round(pnls.reduce((s, p) => s + p, 0) * 10) / 10,
    frictionAdjExp: Math.round((exp - avgFriction) * 100) / 100,
    stability: Math.round(stability * 10) / 10,
  };
}

function emptyMetrics(): SimMetrics {
  return { trades: 0, winRate: 0, expectancy: 0, profitFactor: 0, sharpe: 0, maxDD: 0, netPnl: 0, frictionAdjExp: 0, stability: 0 };
}

// ─── Environment Key Building ────────────────────────────────────────

function buildSimEnvKey(t: NormalizedTrade): string {
  const session = normalizeSession(t.session);
  const regime = normalizeRegime(t.regime);
  const dir = normalizeDirection(t.direction);
  const spreadPips = t.spreadAtEntry * 10000;
  const spreadBucket = computeSpreadBucket(spreadPips);
  const compDecile = computeCompositeDecile(t.compositeScore);
  return `${t.symbol}|${session}|${regime}|${dir}|${spreadBucket}|${compDecile}|${t.agentId}`;
}

function parseEnvKey(key: string) {
  const [symbol, session, regime, direction, spreadBucket, compositeDecile, agentSet] = key.split('|');
  return { symbol, session, regime, direction, spreadBucket, compositeDecile, agentSet: agentSet || 'unknown' };
}

// ─── Governance Filter Simulation ────────────────────────────────────

function applyGovernanceFilter(trades: NormalizedTrade[]): NormalizedTrade[] {
  return trades.filter(t => {
    // Direction alignment: must not be neutral
    if (normalizeDirection(t.direction) === 'NEUTRAL') return false;
    // Data readiness: require non-zero composite and confidence
    if (t.compositeScore <= 0 || t.confidenceScore <= 0) return false;
    // Microstructure: spread stability (reject extreme spreads)
    const spreadPips = t.spreadAtEntry * 10000;
    if (spreadPips > 25) return false; // >2.5p = extreme
    // Friction ratio guard
    if (t.frictionRatio > 0.9) return false;
    // Composite gate (0.72 minimum)
    if (t.compositeScore < 0.72) return false;
    return true;
  });
}

// ─── Edge Filter Simulation ──────────────────────────────────────────

function applyEdgeFilter(
  trades: NormalizedTrade[],
  envStats: Map<string, SimMetrics>,
): NormalizedTrade[] {
  return trades.filter(t => {
    const key = buildSimEnvKey(t);
    const stats = envStats.get(key);
    if (!stats) return true; // no data = keep (neutral)

    // Block destructive envKeys
    if (stats.frictionAdjExp < -0.5 && stats.trades >= 20) return false;
    // Reduce neutral environments (require higher bar)
    if (stats.frictionAdjExp < 0 && stats.frictionAdjExp >= -0.5 && stats.profitFactor < 1.0) return false;
    return true;
  });
}

// ─── Edge-Only Filter ────────────────────────────────────────────────

function applyEdgeOnlyFilter(
  trades: NormalizedTrade[],
  envStats: Map<string, SimMetrics>,
  minSample: number,
): NormalizedTrade[] {
  return trades.filter(t => {
    const key = buildSimEnvKey(t);
    const stats = envStats.get(key);
    if (!stats || stats.trades < minSample) return false;
    // Positive friction-adjusted expectancy
    if (stats.frictionAdjExp <= 0) return false;
    // Stability: DD slope not worsening severely
    if (stats.stability < -5) return false;
    return true;
  });
}

// ─── Detect Edge-Diminished Scenarios ────────────────────────────────

function detectDiminishedScenarios(
  envBuckets: Map<string, NormalizedTrade[]>,
  pairBaseline: SimMetrics,
  config: SimulatorConfig,
): EdgeDiminishedScenario[] {
  const scenarios: EdgeDiminishedScenario[] = [];

  for (const [key, trades] of envBuckets) {
    if (trades.length < 5) continue;
    const metrics = computeMetrics(trades);
    const parsed = parseEnvKey(key);
    const reasons: string[] = [];

    const isDiminished =
      metrics.frictionAdjExp < 0 ||
      metrics.profitFactor < 1.0 ||
      metrics.stability < -3 ||
      (pairBaseline.expectancy > 0 &&
        (pairBaseline.expectancy - metrics.expectancy) / pairBaseline.expectancy >= config.collapseThresholdPct / 100);

    if (!isDiminished) continue;

    if (metrics.frictionAdjExp < 0) reasons.push(`Negative friction-adj expectancy: ${metrics.frictionAdjExp.toFixed(2)}p`);
    if (metrics.profitFactor < 1.0) reasons.push(`Profit factor below 1.0: ${metrics.profitFactor.toFixed(2)}`);
    if (metrics.stability < -3) reasons.push(`DD slope worsening: ${metrics.stability.toFixed(1)}`);
    const collapse = pairBaseline.expectancy > 0 ? ((pairBaseline.expectancy - metrics.expectancy) / pairBaseline.expectancy) * 100 : 0;
    if (collapse >= config.collapseThresholdPct) reasons.push(`Expectancy collapse: ${collapse.toFixed(0)}% vs pair baseline`);

    let recommendation: EdgeDiminishedScenario['recommendation'] = 'SHADOW';
    if (metrics.frictionAdjExp < -1.0 || metrics.profitFactor < 0.7) recommendation = 'BLOCK';
    else if (metrics.frictionAdjExp < 0 || metrics.profitFactor < 0.9) recommendation = 'RESTRICT';

    scenarios.push({
      envKey: key,
      ...parsed,
      trades: metrics.trades,
      expectancy: metrics.expectancy,
      frictionAdjExp: metrics.frictionAdjExp,
      profitFactor: metrics.profitFactor,
      maxDD: metrics.maxDD,
      ddSlope: metrics.stability,
      baselineExpDelta: Math.round(collapse * 10) / 10,
      reasons,
      recommendation,
    });
  }

  return scenarios.sort((a, b) => a.frictionAdjExp - b.frictionAdjExp);
}

// ─── Tier Assignment ─────────────────────────────────────────────────

function computeEdgeScore(m: SimMetrics, sessionCount: number): number {
  const expScore = Math.min(30, Math.max(0, (m.expectancy / 3.0) * 30));
  const sharpeScore = Math.min(20, Math.max(0, (m.sharpe / 0.6) * 20));
  const wrScore = Math.min(15, Math.max(0, ((m.winRate - 40) / 30) * 15));
  const pfScore = Math.min(15, Math.max(0, ((m.profitFactor - 1.0) / 2.0) * 15));
  const frictionRatio = m.expectancy > 0 ? Math.max(0, (m.expectancy - m.frictionAdjExp) / m.expectancy) : 1;
  const frictionPenalty = Math.min(10, Math.max(0, frictionRatio * 10));
  const sessionBonus = Math.min(10, Math.max(0, (sessionCount / 5) * 10));
  return Math.round(expScore + sharpeScore + wrScore + pfScore - frictionPenalty + sessionBonus);
}

function assignTier(edgeScore: number): 1 | 2 | 3 {
  if (edgeScore >= 65) return 1;
  if (edgeScore >= 45) return 2;
  return 3;
}

// ─── Global Edge Killers ─────────────────────────────────────────────

function findGlobalEdgeKillers(pairs: PairSimResult[]): GlobalEdgeKiller[] {
  const patternMap = new Map<string, { pairs: Set<string>; expectations: number[]; pnlImpacts: number[] }>();

  for (const p of pairs) {
    for (const s of p.diminishedScenarios) {
      // Build a pattern from session + regime + spreadBucket (without symbol/agent)
      const pattern = `${s.session} + ${s.regime} + ${s.spreadBucket}`;
      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, { pairs: new Set(), expectations: [], pnlImpacts: [] });
      }
      const entry = patternMap.get(pattern)!;
      entry.pairs.add(p.pair);
      entry.expectations.push(s.frictionAdjExp);
      entry.pnlImpacts.push(s.expectancy * s.trades);
    }
  }

  return [...patternMap.entries()]
    .filter(([, v]) => v.pairs.size >= 2)
    .map(([pattern, v]) => ({
      pattern,
      occurrences: v.pairs.size,
      avgExpectancy: Math.round(avg(v.expectations) * 100) / 100,
      totalPnlImpact: Math.round(v.pnlImpacts.reduce((s, p) => s + p, 0) * 10) / 10,
      pairs: [...v.pairs],
    }))
    .sort((a, b) => a.avgExpectancy - b.avgExpectancy)
    .slice(0, 20);
}

// ─── Main Simulator ──────────────────────────────────────────────────

export function runEdgeGovernanceSimulation(
  allTrades: NormalizedTrade[],
  config: SimulatorConfig = defaultConfig(),
): SimulatorResult {
  // Date range filter
  const cutoff = config.dateRangeMs === Infinity ? 0 : Date.now() - config.dateRangeMs;
  let trades = allTrades.filter(t => t.entryTs >= cutoff);

  // Environment filter
  if (!config.includeBacktest) {
    trades = trades.filter(t => t.environment === 'live' || t.environment === 'practice');
  }

  // Long-only filter
  trades = trades.filter(t => normalizeDirection(t.direction) === 'LONG');

  // Group by pair
  const pairGroups = new Map<string, NormalizedTrade[]>();
  for (const t of trades) {
    const arr = pairGroups.get(t.symbol) || [];
    arr.push(t);
    pairGroups.set(t.symbol, arr);
  }

  // Build env stats across ALL trades for edge filter
  const envBucketsAll = new Map<string, NormalizedTrade[]>();
  for (const t of trades) {
    const key = buildSimEnvKey(t);
    const arr = envBucketsAll.get(key) || [];
    arr.push(t);
    envBucketsAll.set(key, arr);
  }
  const envStatsAll = new Map<string, SimMetrics>();
  for (const [key, ts] of envBucketsAll) {
    envStatsAll.set(key, computeMetrics(ts));
  }

  const results: PairSimResult[] = [];

  for (const [pair, pairTrades] of pairGroups) {
    if (pairTrades.length < 10) continue;

    // Build per-pair env buckets
    const pairEnvBuckets = new Map<string, NormalizedTrade[]>();
    for (const t of pairTrades) {
      const key = buildSimEnvKey(t);
      const arr = pairEnvBuckets.get(key) || [];
      arr.push(t);
      pairEnvBuckets.set(key, arr);
    }

    // Step A: Baseline
    const baseline = computeMetrics(pairTrades);

    // Session count for tier scoring
    const sessions = new Set(pairTrades.map(t => normalizeSession(t.session)));

    // Step B: Governance Filtered
    const govFiltered = applyGovernanceFilter(pairTrades);
    const govMetrics = computeMetrics(govFiltered);

    // Step C: Edge Filtered
    const edgeFiltered = applyEdgeFilter(pairTrades, envStatsAll);
    const edgeMetrics = computeMetrics(edgeFiltered);

    // Step D: Edge-Only
    const edgeOnlyTrades = applyEdgeOnlyFilter(pairTrades, envStatsAll, config.minSampleThreshold);
    const edgeOnlyMetrics = computeMetrics(edgeOnlyTrades);

    // Edge-Diminished Scenarios
    const diminished = detectDiminishedScenarios(pairEnvBuckets, baseline, config);

    const edgeScore = computeEdgeScore(baseline, sessions.size);
    const tier = assignTier(edgeScore);

    // Recommendation
    let recommendation: string;
    if (tier === 1 && edgeOnlyMetrics.frictionAdjExp > 0.5) {
      recommendation = 'Deploy (Tier 1) — Full capital allocation';
    } else if (tier === 2 || (tier === 1 && edgeOnlyMetrics.frictionAdjExp <= 0.5)) {
      recommendation = 'Deploy Reduced (Tier 2) — Prime sessions, 0.7× allocation';
    } else {
      recommendation = 'Restrict/Shadow (Tier 3) — Shadow observation only';
    }

    results.push({
      pair,
      tier,
      edgeScore,
      baseline,
      govFiltered: {
        ...govMetrics,
        coveragePct: Math.round((govFiltered.length / pairTrades.length) * 1000) / 10,
      },
      edgeFiltered: {
        ...edgeMetrics,
        coveragePct: Math.round((edgeFiltered.length / pairTrades.length) * 1000) / 10,
        edgeDelta: Math.round((edgeMetrics.expectancy - baseline.expectancy) * 100) / 100,
      },
      edgeOnly: {
        ...edgeOnlyMetrics,
        coveragePct: Math.round((edgeOnlyTrades.length / pairTrades.length) * 1000) / 10,
      },
      diminishedScenarios: diminished,
      recommendation,
    });
  }

  results.sort((a, b) => b.edgeScore - a.edgeScore);

  const globalKillers = findGlobalEdgeKillers(results);

  return {
    pairs: results,
    globalKillers,
    config,
    totalTradesAnalyzed: trades.length,
  };
}

// ─── CSV Export Helpers ──────────────────────────────────────────────

export function exportPairSummaryCSV(pairs: PairSimResult[]): string {
  const header = 'Pair,Tier,Score,BL_Trades,BL_Exp,BL_PF,BL_MaxDD,BL_Sharpe,Gov_Trades,Gov_Exp,Gov_PF,Gov_Coverage%,Edge_Trades,Edge_Exp,Edge_PF,Edge_Coverage%,Edge_Delta,EO_Trades,EO_Exp,EO_PF,EO_Coverage%,Recommendation';
  const rows = pairs.map(p =>
    [p.pair, p.tier, p.edgeScore,
      p.baseline.trades, p.baseline.expectancy, p.baseline.profitFactor, p.baseline.maxDD, p.baseline.sharpe,
      p.govFiltered.trades, p.govFiltered.expectancy, p.govFiltered.profitFactor, p.govFiltered.coveragePct,
      p.edgeFiltered.trades, p.edgeFiltered.expectancy, p.edgeFiltered.profitFactor, p.edgeFiltered.coveragePct, p.edgeFiltered.edgeDelta,
      p.edgeOnly.trades, p.edgeOnly.expectancy, p.edgeOnly.profitFactor, p.edgeOnly.coveragePct,
      `"${p.recommendation}"`].join(',')
  );
  return [header, ...rows].join('\n');
}

export function exportScenariosCSV(pairs: PairSimResult[]): string {
  const header = 'Pair,Session,Regime,Direction,SpreadBucket,CompositeDecile,Trades,Expectancy,FrictionAdjExp,PF,MaxDD,DDSlope,BaselineDelta%,Recommendation,Reasons';
  const rows: string[] = [];
  for (const p of pairs) {
    for (const s of p.diminishedScenarios) {
      rows.push([
        p.pair, s.session, s.regime, s.direction, s.spreadBucket, s.compositeDecile,
        s.trades, s.expectancy, s.frictionAdjExp, s.profitFactor, s.maxDD, s.ddSlope,
        s.baselineExpDelta, s.recommendation, `"${s.reasons.join('; ')}"`,
      ].join(','));
    }
  }
  return [header, ...rows].join('\n');
}
