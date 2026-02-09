// Edge Discovery & Failure Mapping Engine v1
// Identifies conditional edge and capital destruction across all environments
// Includes environment-level stats, filter simulation support, and OOS validation

// ─── Types ────────────────────────────────────────────────────────────

export interface NormalizedTrade {
  tradeId: string;
  environment: string;
  directionSource: string;
  symbol: string;
  direction: string;
  entryTs: number;
  exitTs: number;
  pnlPips: number;
  spreadAtEntry: number;
  slippage: number;
  compositeScore: number;
  session: string;
  regime: string;
  agentId: string;
  mtfAlignmentScore: number;
  frictionRatio: number;
  volatilityPhase: string;
  governanceDecision: string;
  tradeMode: string;
  durationMinutes: number;
  confidenceScore: number;
}

export interface DimensionStats {
  key: string;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  ciLower: number;
  ciUpper: number;
  isWeak: boolean;
  edgeClass: 'strong-positive' | 'neutral' | 'strong-negative';
  totalPnl: number;
  sharpe: number;
}

export interface FailureEntry {
  dimension: string;
  key: string;
  trades: number;
  expectancy: number;
  winRate: number;
  profitFactor: number;
  suggestion: string;
}

export interface EdgeCluster {
  keys: string[];
  label: string;
  trades: number;
  expectancy: number;
  winRate: number;
  profitFactor: number;
  confidence: number;
  isWeak: boolean;
}

export interface PredictiveCheck {
  dimension: string;
  isMonotonic: boolean;
  correlation: number;
  verdict: 'PREDICTIVE' | 'NON-PREDICTIVE' | 'INSUFFICIENT_DATA';
  buckets: { label: string; expectancy: number; trades: number }[];
}

export interface DecayPoint {
  index: number;
  expectancy: number;
  sharpe: number;
  winRate: number;
}

export interface GovernanceQuality {
  approvedTrades: number;
  approvedExpectancy: number;
  approvedWinRate: number;
  rejectedTrades: number;
  rejectedExpectancy: number;
  rejectedWinRate: number;
  throttledTrades: number;
  throttledExpectancy: number;
  throttledWinRate: number;
  falsePositives: number;
  falseNegatives: number;
  governanceAccuracy: number;
}

export interface EnvironmentComparison {
  label: string;
  trades: number;
  expectancy: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
}

export interface EdgeDiscoveryResult {
  globalSummary: {
    totalTrades: number;
    winRate: number;
    expectancy: number;
    profitFactor: number;
    sharpe: number;
    maxDrawdown: number;
    avgFriction: number;
    avgComposite: number;
  };
  heatmap: Record<string, DimensionStats[]>;
  failures: FailureEntry[];
  clusters: EdgeCluster[];
  predictiveChecks: PredictiveCheck[];
  overallScoringVerdict: 'SCORING PREDICTIVE' | 'SCORING NON-PREDICTIVE' | 'INSUFFICIENT DATA';
  decay: DecayPoint[];
  edgeDecayStatus: 'STABLE' | 'DEGRADING' | 'CRITICAL' | 'INSUFFICIENT DATA';
  rngComparison: EnvironmentComparison[] | null;
  governanceQuality: GovernanceQuality;
  sectionConfidence: Record<string, { sampleSize: number; ciWidth: number; reliable: boolean }>;
}

// ─── Environment Stats (Step A) ───────────────────────────────────

export interface EnvironmentStatsEntry {
  envKey: string;
  session: string;
  regime: string;
  symbol: string;
  direction: string;
  trades: number;
  winRate: number;
  expectancyPips: number;
  profitFactor: number;
  sharpe: number;
  maxDDPips: number;
  avgDuration: number;
  avgSpread: number;
  avgFriction: number;
  avgComposite: number;
  avgQLConfidence: number;
  ciLower: number;
  ciUpper: number;
  edgeLabel: 'EDGE' | 'NEUTRAL' | '-EDGE';
  score: number;
}

export interface EnvironmentStatsOptions {
  minTrades?: number;
  useExtendedKey?: boolean;
}

export interface FailureDriver {
  dimension: string;
  key: string;
  trades: number;
  totalPnl: number;
  expectancy: number;
  maxDDContribution: number;
  suggestion: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

export function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function calcSharpe(returns: number[]): number {
  if (returns.length < 5) return 0;
  const m = avg(returns);
  const s = stddev(returns);
  return s === 0 ? 0 : (m / s) * Math.sqrt(Math.min(returns.length, 252));
}

export function confidenceInterval(returns: number[]): [number, number] {
  if (returns.length < 2) return [0, 0];
  const m = avg(returns);
  const se = stddev(returns) / Math.sqrt(returns.length);
  return [m - 1.96 * se, m + 1.96 * se];
}

function classifyEdge(expectancy: number, ciLower: number, ciUpper: number): DimensionStats['edgeClass'] {
  if (ciLower > 0) return 'strong-positive';
  if (ciUpper < 0) return 'strong-negative';
  return 'neutral';
}

function computeDimensionStats(key: string, pnls: number[]): DimensionStats {
  const wins = pnls.filter(p => p > 0).length;
  const grossProfit = pnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pnls.filter(p => p <= 0).reduce((s, p) => s + p, 0));
  const [ciLower, ciUpper] = confidenceInterval(pnls);
  const exp = avg(pnls);
  return {
    key,
    trades: pnls.length,
    winRate: pnls.length ? wins / pnls.length : 0,
    expectancy: Math.round(exp * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0,
    ciLower: Math.round(ciLower * 100) / 100,
    ciUpper: Math.round(ciUpper * 100) / 100,
    isWeak: pnls.length < 30,
    edgeClass: classifyEdge(exp, ciLower, ciUpper),
    totalPnl: Math.round(pnls.reduce((s, p) => s + p, 0) * 10) / 10,
    sharpe: Math.round(calcSharpe(pnls) * 100) / 100,
  };
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = fn(item);
    (map[k] ??= []).push(item);
  }
  return map;
}

function bucketize(value: number, breakpoints: number[], labels: string[]): string {
  for (let i = 0; i < breakpoints.length; i++) {
    if (value < breakpoints[i]) return labels[i];
  }
  return labels[labels.length - 1];
}

function decile(value: number): string {
  const d = Math.min(Math.floor(value * 10), 9);
  return `D${d + 1} (${(d * 10)}-${(d + 1) * 10}%)`;
}

export function computeMaxDD(pnls: number[]): number {
  let peak = 0, maxDD = 0, cum = 0;
  for (const p of pnls) {
    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 10) / 10;
}

export function computeMetricsSummary(trades: NormalizedTrade[]) {
  const pnls = trades.map(t => t.pnlPips);
  const wins = pnls.filter(p => p > 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pnls.filter(p => p <= 0).reduce((s, p) => s + p, 0));
  const [ciL, ciU] = confidenceInterval(pnls);
  return {
    trades: trades.length,
    netPnl: Math.round(pnls.reduce((s, p) => s + p, 0) * 10) / 10,
    winRate: trades.length ? wins.length / trades.length : 0,
    expectancy: Math.round(avg(pnls) * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0,
    sharpe: Math.round(calcSharpe(pnls) * 100) / 100,
    maxDrawdown: computeMaxDD(pnls),
    ciLower: Math.round(ciL * 100) / 100,
    ciUpper: Math.round(ciU * 100) / 100,
  };
}

// ─── Normalizer ───────────────────────────────────────────────────────

export function normalizeOandaOrders(orders: any[]): NormalizedTrade[] {
  return orders
    .filter(o => o.entry_price != null && o.exit_price != null && (o.status === 'filled' || o.status === 'closed'))
    .map(o => {
      const mult = getPipMultiplier(o.currency_pair);
      const pnl = o.direction === 'long'
        ? (o.exit_price - o.entry_price) * mult
        : (o.entry_price - o.exit_price) * mult;
      const entryTs = new Date(o.created_at).getTime();
      const exitTs = o.closed_at ? new Date(o.closed_at).getTime() : entryTs;
      const durationMinutes = (exitTs - entryTs) / 60000;

      return {
        tradeId: o.id,
        environment: o.environment || 'practice',
        directionSource: o.direction_engine || 'auto-governance',
        symbol: o.currency_pair,
        direction: o.direction,
        entryTs,
        exitTs,
        pnlPips: Math.round(pnl * 10) / 10,
        spreadAtEntry: o.spread_at_entry ?? 0,
        slippage: o.slippage_pips ?? 0,
        compositeScore: o.governance_composite ?? 0,
        session: o.session_label || 'unknown',
        regime: o.regime_label || 'unknown',
        agentId: o.agent_id || 'unknown',
        mtfAlignmentScore: o.confidence_score ? o.confidence_score / 100 : 0,
        frictionRatio: o.friction_score ? o.friction_score / 100 : 0,
        volatilityPhase: o.regime_label || 'unknown',
        governanceDecision: o.gate_result || 'unknown',
        tradeMode: durationMinutes < 15 ? 'scalp' : 'continuation',
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        confidenceScore: o.confidence_score ?? 0,
      };
    });
}

// ─── Step A: Environment Stats ───────────────────────────────────────

function makeEnvKey(t: NormalizedTrade, extended?: boolean): string {
  const base = `${t.session}|${t.regime}|${t.symbol}|${t.direction}`;
  if (!extended) return base;
  const spreadBucket = bucketize(t.spreadAtEntry * 10000, [5, 10, 15, 25], ['<0.5p', '0.5-1p', '1-1.5p', '1.5-2.5p', '>2.5p']);
  const compDecile = decile(Math.min(t.compositeScore, 1));
  return `${base}|${t.agentId}|${spreadBucket}|${compDecile}`;
}

export function buildEnvironmentStats(
  trades: NormalizedTrade[],
  options: EnvironmentStatsOptions = {}
): EnvironmentStatsEntry[] {
  const minTrades = options.minTrades ?? 50;
  const groups = groupBy(trades, t => makeEnvKey(t, options.useExtendedKey));

  return Object.entries(groups)
    .filter(([, ts]) => ts.length >= minTrades)
    .map(([key, ts]) => {
      const pnls = ts.map(t => t.pnlPips);
      const wins = pnls.filter(p => p > 0);
      const grossProfit = wins.reduce((s, p) => s + p, 0);
      const grossLoss = Math.abs(pnls.filter(p => p <= 0).reduce((s, p) => s + p, 0));
      const exp = avg(pnls);
      const [ciL, ciU] = confidenceInterval(pnls);
      const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
      const parts = key.split('|');

      const edgeLabel: EnvironmentStatsEntry['edgeLabel'] =
        ciL > 0 ? 'EDGE' : ciU < 0 ? '-EDGE' : 'NEUTRAL';

      const score = exp * Math.sqrt(ts.length) * (pf > 1 ? 1 : pf > 0 ? pf : 0.1);

      return {
        envKey: key,
        session: parts[0] || 'unknown',
        regime: parts[1] || 'unknown',
        symbol: parts[2] || 'unknown',
        direction: parts[3] || 'unknown',
        trades: ts.length,
        winRate: wins.length / ts.length,
        expectancyPips: Math.round(exp * 100) / 100,
        profitFactor: Math.round(pf * 100) / 100,
        sharpe: Math.round(calcSharpe(pnls) * 100) / 100,
        maxDDPips: computeMaxDD(pnls),
        avgDuration: Math.round(avg(ts.map(t => t.durationMinutes)) * 10) / 10,
        avgSpread: Math.round(avg(ts.map(t => t.spreadAtEntry)) * 100000) / 100000,
        avgFriction: Math.round(avg(ts.map(t => t.frictionRatio)) * 100) / 100,
        avgComposite: Math.round(avg(ts.map(t => t.compositeScore)) * 100) / 100,
        avgQLConfidence: Math.round(avg(ts.map(t => t.confidenceScore)) * 100) / 100,
        ciLower: Math.round(ciL * 100) / 100,
        ciUpper: Math.round(ciU * 100) / 100,
        edgeLabel,
        score: Math.round(score * 100) / 100,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function findTopEdgeEnvironments(
  stats: EnvironmentStatsEntry[],
  topN = 10
): { top: EnvironmentStatsEntry[]; bestSessions: string[]; bestPairs: string[]; bestRegimes: string[]; bestDirections: string[] } {
  const top = stats.filter(s => s.expectancyPips > 0).slice(0, topN);
  const bestSessions = [...new Set(top.map(s => s.session))];
  const bestPairs = [...new Set(top.map(s => s.symbol))];
  const bestRegimes = [...new Set(top.map(s => s.regime))];
  const bestDirections = [...new Set(top.map(s => s.direction))];
  return { top, bestSessions, bestPairs, bestRegimes, bestDirections };
}

export function findWorstEnvironments(
  stats: EnvironmentStatsEntry[],
  bottomN = 10
): EnvironmentStatsEntry[] {
  return [...stats].sort((a, b) => a.score - b.score).filter(s => s.expectancyPips < 0).slice(0, bottomN);
}

export function failureAttribution(
  trades: NormalizedTrade[]
): FailureDriver[] {
  const dims: { name: string; fn: (t: NormalizedTrade) => string }[] = [
    { name: 'Session', fn: t => t.session },
    { name: 'Regime', fn: t => t.regime },
    { name: 'Symbol', fn: t => t.symbol },
    { name: 'Direction', fn: t => t.direction },
    { name: 'Agent', fn: t => t.agentId },
    { name: 'Spread Bucket', fn: t => bucketize(t.spreadAtEntry * 10000, [5, 10, 15, 25], ['<0.5p', '0.5-1p', '1-1.5p', '1.5-2.5p', '>2.5p']) },
    { name: 'Composite Decile', fn: t => decile(Math.min(t.compositeScore, 1)) },
  ];

  const drivers: FailureDriver[] = [];

  for (const { name, fn } of dims) {
    const groups = groupBy(trades, fn);
    for (const [key, ts] of Object.entries(groups)) {
      const pnls = ts.map(t => t.pnlPips);
      const totalPnl = pnls.reduce((s, p) => s + p, 0);
      if (totalPnl >= 0) continue;
      drivers.push({
        dimension: name,
        key,
        trades: ts.length,
        totalPnl: Math.round(totalPnl * 10) / 10,
        expectancy: Math.round(avg(pnls) * 100) / 100,
        maxDDContribution: computeMaxDD(pnls),
        suggestion: `Review and consider blocking ${name}: ${key}`,
      });
    }
  }

  return drivers.sort((a, b) => a.totalPnl - b.totalPnl);
}

// ─── OOS Validation ──────────────────────────────────────────────────

export interface OOSValidation {
  inSampleTrades: number;
  outOfSampleTrades: number;
  inSampleExpectancy: number;
  outOfSampleExpectancy: number;
  edgeHolds: boolean;
  topEnvsInSample: EnvironmentStatsEntry[];
  topEnvsOOS: EnvironmentStatsEntry[];
}

export function validateOutOfSample(
  trades: NormalizedTrade[],
  splitRatio = 0.7,
  minTrades = 30
): OOSValidation {
  const sorted = [...trades].sort((a, b) => a.entryTs - b.entryTs);
  const splitIdx = Math.floor(sorted.length * splitRatio);
  const inSample = sorted.slice(0, splitIdx);
  const oos = sorted.slice(splitIdx);

  const isStats = buildEnvironmentStats(inSample, { minTrades });
  const isTop = findTopEdgeEnvironments(isStats, 10);
  const topKeys = new Set(isTop.top.map(e => e.envKey));

  // Evaluate those same keys in OOS
  const oosInTopEnvs = oos.filter(t => topKeys.has(makeEnvKey(t)));
  const oosStats = buildEnvironmentStats(oosInTopEnvs, { minTrades: 1 });

  const isExp = avg(inSample.map(t => t.pnlPips));
  const oosExp = avg(oos.map(t => t.pnlPips));

  return {
    inSampleTrades: inSample.length,
    outOfSampleTrades: oos.length,
    inSampleExpectancy: Math.round(isExp * 100) / 100,
    outOfSampleExpectancy: Math.round(oosExp * 100) / 100,
    edgeHolds: oosExp > 0 && oosExp > isExp * 0.3,
    topEnvsInSample: isTop.top,
    topEnvsOOS: oosStats,
  };
}

// ─── Main Engine ──────────────────────────────────────────────────────

export function computeEdgeDiscovery(trades: NormalizedTrade[]): EdgeDiscoveryResult {
  const pnls = trades.map(t => t.pnlPips);

  // Section 1: Global Summary
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));

  const globalSummary = {
    totalTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    expectancy: Math.round(avg(pnls) * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0,
    sharpe: Math.round(calcSharpe(pnls) * 100) / 100,
    maxDrawdown: computeMaxDD(pnls),
    avgFriction: Math.round(avg(trades.map(t => t.frictionRatio)) * 100) / 100,
    avgComposite: Math.round(avg(trades.map(t => t.compositeScore)) * 100) / 100,
  };

  // Section 2: Edge Heatmap
  const dimensions: Record<string, (t: NormalizedTrade) => string> = {
    'Session': t => t.session,
    'Regime': t => t.regime,
    'Symbol': t => t.symbol,
    'Direction': t => t.direction,
    'Agent': t => t.agentId,
    'Trade Mode': t => t.tradeMode,
    'Direction Source': t => t.directionSource,
    'Composite Decile': t => decile(Math.min(t.compositeScore, 1)),
    'MTF Alignment': t => bucketize(t.mtfAlignmentScore, [0.3, 0.5, 0.7, 0.9], ['Very Low', 'Low', 'Medium', 'High', 'Very High']),
    'Friction Ratio': t => bucketize(t.frictionRatio, [0.3, 0.5, 0.7, 0.9], ['Very Low', 'Low', 'Medium', 'High', 'Very High']),
    'Spread Bucket': t => bucketize(t.spreadAtEntry * 10000, [5, 10, 15, 25], ['<0.5p', '0.5-1p', '1-1.5p', '1.5-2.5p', '>2.5p']),
    'Duration': t => bucketize(t.durationMinutes, [5, 15, 60, 240], ['<5m', '5-15m', '15-60m', '1-4h', '>4h']),
  };

  const heatmap: Record<string, DimensionStats[]> = {};
  for (const [dimName, fn] of Object.entries(dimensions)) {
    const groups = groupBy(trades, fn);
    heatmap[dimName] = Object.entries(groups)
      .map(([k, ts]) => computeDimensionStats(k, ts.map(t => t.pnlPips)))
      .sort((a, b) => b.expectancy - a.expectancy);
  }

  // Section 3: Failure Detection
  const failures: FailureEntry[] = [];
  const failureDims = ['Session', 'Symbol', 'Regime', 'Agent', 'Direction', 'Spread Bucket', 'Composite Decile', 'Duration'];
  for (const dim of failureDims) {
    const stats = heatmap[dim];
    if (!stats?.length) continue;
    const worst = stats[stats.length - 1];
    if (worst.expectancy < 0) {
      const suggestions: Record<string, string> = {
        'Session': `Restrict or throttle trading during ${worst.key} session`,
        'Symbol': `Ban or reduce allocation for ${worst.key}`,
        'Regime': `Increase friction gates during ${worst.key} regime`,
        'Agent': `Throttle or retrain agent ${worst.key}`,
        'Direction': `Review ${worst.key}-side signal quality, consider asymmetric gates`,
        'Spread Bucket': `Raise minimum spread threshold to exclude ${worst.key} conditions`,
        'Composite Decile': `Raise composite threshold to exclude ${worst.key} range`,
        'Duration': `Tighten exit timing rules for ${worst.key} duration window`,
      };
      failures.push({
        dimension: dim,
        key: worst.key,
        trades: worst.trades,
        expectancy: worst.expectancy,
        winRate: worst.winRate,
        profitFactor: worst.profitFactor,
        suggestion: suggestions[dim] || `Review ${dim}: ${worst.key}`,
      });
    }
  }

  // Section 4: Edge Cluster Discovery
  const clusterDims: ((t: NormalizedTrade) => string)[] = [
    t => t.session, t => t.symbol, t => t.regime, t => t.direction,
  ];
  const clusterMap: Record<string, NormalizedTrade[]> = {};
  for (const t of trades) {
    const key = clusterDims.map(fn => fn(t)).join(' | ');
    (clusterMap[key] ??= []).push(t);
  }
  const clusters: EdgeCluster[] = Object.entries(clusterMap)
    .filter(([, ts]) => ts.length >= 5)
    .map(([label, ts]) => {
      const p = ts.map(t => t.pnlPips);
      const [ciL, ciU] = confidenceInterval(p);
      return {
        keys: label.split(' | '),
        label,
        trades: ts.length,
        expectancy: Math.round(avg(p) * 100) / 100,
        winRate: p.filter(x => x > 0).length / p.length,
        profitFactor: (() => {
          const gp = p.filter(x => x > 0).reduce((s, x) => s + x, 0);
          const gl = Math.abs(p.filter(x => x <= 0).reduce((s, x) => s + x, 0));
          return gl > 0 ? Math.round((gp / gl) * 100) / 100 : gp > 0 ? 99 : 0;
        })(),
        confidence: Math.round((1 - (ciU - ciL) / (Math.abs(avg(p)) + 0.001)) * 100) / 100,
        isWeak: ts.length < 30,
      };
    })
    .sort((a, b) => b.expectancy - a.expectancy);

  // Section 5: Predictive Validation
  const predictiveChecks: PredictiveCheck[] = [];
  const buildPredCheck = (dim: string, stats: DimensionStats[]) => {
    if (stats.length < 3) return;
    const exp = stats.map(d => d.expectancy);
    let monotonic = true;
    for (let i = 1; i < exp.length; i++) {
      if (exp[i] < exp[i - 1] - 0.1) { monotonic = false; break; }
    }
    const n = exp.length;
    const xBar = (n - 1) / 2, yBar = avg(exp);
    let num = 0, dX = 0, dY = 0;
    for (let i = 0; i < n; i++) { num += (i - xBar) * (exp[i] - yBar); dX += (i - xBar) ** 2; dY += (exp[i] - yBar) ** 2; }
    const corr = (dX * dY) > 0 ? num / Math.sqrt(dX * dY) : 0;
    predictiveChecks.push({
      dimension: dim,
      isMonotonic: monotonic,
      correlation: Math.round(corr * 100) / 100,
      verdict: corr > 0.5 ? 'PREDICTIVE' : corr < -0.2 ? 'NON-PREDICTIVE' : 'INSUFFICIENT_DATA',
      buckets: stats.map(d => ({ label: d.key, expectancy: d.expectancy, trades: d.trades })),
    });
  };
  buildPredCheck('Composite Score', heatmap['Composite Decile'] || []);
  buildPredCheck('MTF Alignment', heatmap['MTF Alignment'] || []);
  buildPredCheck('Friction Ratio', heatmap['Friction Ratio'] || []);

  const predictiveCount = predictiveChecks.filter(c => c.verdict === 'PREDICTIVE').length;
  const overallScoringVerdict = predictiveChecks.length === 0
    ? 'INSUFFICIENT DATA' as const
    : predictiveCount >= 2 ? 'SCORING PREDICTIVE' as const : 'SCORING NON-PREDICTIVE' as const;

  // Section 6: Edge Decay
  const windowSize = 50;
  const sortedTrades = [...trades].sort((a, b) => a.entryTs - b.entryTs);
  const decay: DecayPoint[] = [];
  for (let i = windowSize; i <= sortedTrades.length; i += Math.max(1, Math.floor(windowSize / 5))) {
    const window = sortedTrades.slice(i - windowSize, i).map(t => t.pnlPips);
    const w = window.filter(p => p > 0).length;
    decay.push({
      index: i,
      expectancy: Math.round(avg(window) * 100) / 100,
      sharpe: Math.round(calcSharpe(window) * 100) / 100,
      winRate: w / window.length,
    });
  }
  let edgeDecayStatus: EdgeDiscoveryResult['edgeDecayStatus'] = 'INSUFFICIENT DATA';
  if (decay.length >= 5) {
    const recent = decay.slice(-5);
    const recentExp = avg(recent.map(d => d.expectancy));
    const early = decay.slice(0, 5);
    const earlyExp = avg(early.map(d => d.expectancy));
    if (recentExp < earlyExp * 0.5 && recentExp < 0) edgeDecayStatus = 'CRITICAL';
    else if (recentExp < earlyExp * 0.7) edgeDecayStatus = 'DEGRADING';
    else edgeDecayStatus = 'STABLE';
  }

  // Section 7: RNG Comparison
  const rngTrades = trades.filter(t => t.directionSource === 'rng' || t.directionSource === 'random');
  const qlTrades = trades.filter(t => t.directionSource === 'quantlabs');
  let rngComparison: EnvironmentComparison[] | null = null;
  if (rngTrades.length >= 5 && qlTrades.length >= 5) {
    const makeEnv = (label: string, ts: NormalizedTrade[]): EnvironmentComparison => {
      const p = ts.map(t => t.pnlPips);
      const gp = p.filter(x => x > 0).reduce((s, x) => s + x, 0);
      const gl = Math.abs(p.filter(x => x <= 0).reduce((s, x) => s + x, 0));
      return {
        label, trades: ts.length,
        expectancy: Math.round(avg(p) * 100) / 100,
        winRate: p.filter(x => x > 0).length / p.length,
        profitFactor: gl > 0 ? Math.round((gp / gl) * 100) / 100 : 0,
        sharpe: Math.round(calcSharpe(p) * 100) / 100,
      };
    };
    rngComparison = [makeEnv('QuantLabs', qlTrades), makeEnv('RNG Baseline', rngTrades)];
  }

  // Section 8: Governance Quality
  const approved = trades.filter(t => t.governanceDecision === 'approved');
  const rejected = trades.filter(t => t.governanceDecision === 'rejected');
  const throttled = trades.filter(t => t.governanceDecision === 'throttled');
  const approvedPnls = approved.map(t => t.pnlPips);
  const rejectedPnls = rejected.map(t => t.pnlPips);
  const throttledPnls = throttled.map(t => t.pnlPips);

  const governanceQuality: GovernanceQuality = {
    approvedTrades: approved.length,
    approvedExpectancy: Math.round(avg(approvedPnls) * 100) / 100,
    approvedWinRate: approvedPnls.length ? approvedPnls.filter(p => p > 0).length / approvedPnls.length : 0,
    rejectedTrades: rejected.length,
    rejectedExpectancy: Math.round(avg(rejectedPnls) * 100) / 100,
    rejectedWinRate: rejectedPnls.length ? rejectedPnls.filter(p => p > 0).length / rejectedPnls.length : 0,
    throttledTrades: throttled.length,
    throttledExpectancy: Math.round(avg(throttledPnls) * 100) / 100,
    throttledWinRate: throttledPnls.length ? throttledPnls.filter(p => p > 0).length / throttledPnls.length : 0,
    falsePositives: approved.filter(t => t.pnlPips <= 0).length,
    falseNegatives: rejected.filter(t => t.pnlPips > 0).length,
    governanceAccuracy: approved.length + rejected.length > 0
      ? (approved.filter(t => t.pnlPips > 0).length + rejected.filter(t => t.pnlPips <= 0).length) /
        (approved.length + rejected.length)
      : 0,
  };

  // Section 9: Confidence per section
  const makeSectionConf = (n: number, pnlArr: number[]) => {
    const [ciL, ciU] = confidenceInterval(pnlArr);
    return { sampleSize: n, ciWidth: Math.round((ciU - ciL) * 100) / 100, reliable: n >= 30 };
  };
  const sectionConfidence: Record<string, { sampleSize: number; ciWidth: number; reliable: boolean }> = {
    global: makeSectionConf(trades.length, pnls),
    governance: makeSectionConf(approved.length + rejected.length, [...approvedPnls, ...rejectedPnls]),
    decay: makeSectionConf(decay.length, decay.map(d => d.expectancy)),
  };

  return {
    globalSummary, heatmap, failures, clusters,
    predictiveChecks, overallScoringVerdict,
    decay, edgeDecayStatus, rngComparison, governanceQuality, sectionConfidence,
  };
}
