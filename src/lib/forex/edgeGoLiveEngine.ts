// Edge Go-Live Ladder Engine
// Supervisory layer that decides deployment mode based on shadow performance
// Does NOT change governance multipliers or gates — allocation only

import {
  type NormalizedTrade,
  avg,
  stddev,
  computeMaxDD,
  confidenceInterval,
  buildEnvironmentStats,
  findTopEdgeEnvironments,
} from './edgeDiscoveryEngine';

// ─── Types ────────────────────────────────────────────────────────────

export type MaturityLevel = 0 | 1 | 2 | 3 | 4;
export type DeploymentMode = 'NORMAL' | 'EDGE_WEIGHT' | 'COND_EDGE_ONLY' | 'FULL_EDGE_ONLY';

export interface SessionCoverage {
  asian: number;
  london: number;
  ny: number;
  lateNY: number;
}

export interface RegimeCoverage {
  compression: number;
  ignition: number;
  expansion: number;
  exhaustion: number;
}

export interface DirectionParity {
  longEdge: number;
  shortEdge: number;
  longBase: number;
  shortBase: number;
}

export interface GoLiveMetrics {
  shadowEdgeTrades: number;
  baselineTrades: number;
  shadowEdgeExpectancy: number;
  baselineExpectancy: number;
  expectancyRatio: number;
  shadowEdgeMaxDD: number;
  baselineMaxDD: number;
  ddRatio: number;
  compositePredictivenessScore: number;
  sessionCoverage: SessionCoverage;
  regimeCoverage: RegimeCoverage;
  directionParity: DirectionParity;
  clusterStabilityScore: number;
}

export interface GoLiveCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  requiredForLevel: MaturityLevel;
}

export interface GoLiveResult {
  maturityLevel: MaturityLevel;
  deploymentMode: DeploymentMode;
  metrics: GoLiveMetrics;
  passFailReasons: string[];
  downgradeTriggered: boolean;
  checks: GoLiveCheckItem[];
  rollingStability: RollingStabilityPoint[];
  sizingRule: { edgeMultiplier: number; nonEdgeMultiplier: number } | null;
}

export interface RollingStabilityPoint {
  dayLabel: string;
  expectancyRatio: number;
  ddRatio: number;
  predictiveness: number;
  clusterStability: number;
}

// ─── Edge Environment Classifier ─────────────────────────────────────

function makeEnvKey(t: NormalizedTrade): string {
  return `${t.session}|${t.regime}|${t.symbol}|${t.direction}`;
}

export function getEdgeEnvironmentKeys(
  trades: NormalizedTrade[],
  topN = 10,
  minTrades = 30
): Set<string> {
  const stats = buildEnvironmentStats(trades, { minTrades });
  const { top } = findTopEdgeEnvironments(stats, topN);
  return new Set(top.map(e => e.envKey));
}

export function isEdgeTrade(t: NormalizedTrade, edgeKeys: Set<string>): boolean {
  return edgeKeys.has(makeEnvKey(t));
}

// ─── Composite Predictiveness ────────────────────────────────────────

function computeCompositePredictivenessScore(trades: NormalizedTrade[]): number {
  if (trades.length < 20) return 0;

  // Group into deciles by composite score
  const deciles: number[][] = Array.from({ length: 10 }, () => []);
  for (const t of trades) {
    const d = Math.min(Math.floor(t.compositeScore * 10), 9);
    deciles[d].push(t.pnlPips);
  }

  const expectations = deciles.map(d => (d.length > 0 ? avg(d) : null));
  const valid = expectations.filter(e => e !== null) as number[];
  if (valid.length < 3) return 0;

  // Measure monotonicity via Spearman rank correlation
  const n = expectations.length;
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (expectations[i] === null) continue;
    for (let j = i + 1; j < n; j++) {
      if (expectations[j] === null) continue;
      total++;
      if (expectations[j]! > expectations[i]!) concordant++;
      else if (expectations[j]! < expectations[i]!) concordant--;
    }
  }

  return total > 0 ? Math.max(0, Math.min(1, (concordant / total + 1) / 2)) : 0;
}

// ─── Cluster Stability ───────────────────────────────────────────────

function computeClusterStabilityScore(
  edgeTrades: NormalizedTrade[],
  allTrades: NormalizedTrade[]
): number {
  if (edgeTrades.length < 10) return 0;

  // Measure how concentrated edge trades are in a few environments
  const envCounts: Record<string, number> = {};
  for (const t of edgeTrades) {
    const k = makeEnvKey(t);
    envCounts[k] = (envCounts[k] || 0) + 1;
  }

  const counts = Object.values(envCounts);
  const total = edgeTrades.length;

  // Herfindahl-Hirschman Index (HHI) — higher = more concentrated = more stable
  const hhi = counts.reduce((s, c) => s + (c / total) ** 2, 0);
  // Normalize: HHI ranges from 1/N (uniform) to 1 (all in one env)
  const n = counts.length;
  const normalizedHHI = n > 1 ? (hhi - 1 / n) / (1 - 1 / n) : 1;

  // Also check if edge environments maintain positive expectancy
  const envExpectancies: number[] = [];
  for (const [key, count] of Object.entries(envCounts)) {
    if (count < 5) continue;
    const envTrades = edgeTrades.filter(t => makeEnvKey(t) === key);
    envExpectancies.push(avg(envTrades.map(t => t.pnlPips)));
  }

  const positiveRatio = envExpectancies.length > 0
    ? envExpectancies.filter(e => e > 0).length / envExpectancies.length
    : 0;

  return Math.round(((normalizedHHI * 0.4) + (positiveRatio * 0.6)) * 100) / 100;
}

// ─── Session & Regime Coverage ───────────────────────────────────────

const SESSION_MAP: Record<string, keyof SessionCoverage> = {
  'asian': 'asian', 'asia': 'asian', 'tokyo': 'asian',
  'london': 'london', 'london-open': 'london', 'london-close': 'london',
  'ny': 'ny', 'ny-open': 'ny', 'ny-overlap': 'ny', 'new-york': 'ny',
  'late-ny': 'lateNY', 'lateNY': 'lateNY', 'late_ny': 'lateNY',
};

const REGIME_MAP: Record<string, keyof RegimeCoverage> = {
  'compression': 'compression', 'ranging': 'compression',
  'ignition': 'ignition',
  'expansion': 'expansion', 'trending': 'expansion',
  'exhaustion': 'exhaustion', 'high-volatility': 'exhaustion', 'low-liquidity': 'exhaustion',
};

function computeSessionCoverage(trades: NormalizedTrade[]): SessionCoverage {
  const cov: SessionCoverage = { asian: 0, london: 0, ny: 0, lateNY: 0 };
  for (const t of trades) {
    const key = SESSION_MAP[t.session.toLowerCase()] || SESSION_MAP[t.session];
    if (key) cov[key]++;
  }
  return cov;
}

function computeRegimeCoverage(trades: NormalizedTrade[]): RegimeCoverage {
  const cov: RegimeCoverage = { compression: 0, ignition: 0, expansion: 0, exhaustion: 0 };
  for (const t of trades) {
    const key = REGIME_MAP[t.regime.toLowerCase()] || REGIME_MAP[t.regime];
    if (key) cov[key]++;
  }
  return cov;
}

// ─── Rolling Stability (7-day windows) ───────────────────────────────

function computeRollingStability(
  shadowEdge: NormalizedTrade[],
  baseline: NormalizedTrade[],
  allTrades: NormalizedTrade[]
): RollingStabilityPoint[] {
  const points: RollingStabilityPoint[] = [];
  if (shadowEdge.length < 10 || baseline.length < 10) return points;

  const sorted = [...shadowEdge].sort((a, b) => a.entryTs - b.entryTs);
  const baseSorted = [...baseline].sort((a, b) => a.entryTs - b.entryTs);

  const DAY_MS = 86400000;
  const startTs = Math.min(sorted[0]?.entryTs ?? 0, baseSorted[0]?.entryTs ?? 0);
  const endTs = Math.max(
    sorted[sorted.length - 1]?.entryTs ?? 0,
    baseSorted[baseSorted.length - 1]?.entryTs ?? 0
  );

  const windowMs = 7 * DAY_MS;

  for (let ts = startTs + windowMs; ts <= endTs; ts += DAY_MS) {
    const windowStart = ts - windowMs;
    const edgeWindow = sorted.filter(t => t.entryTs >= windowStart && t.entryTs < ts);
    const baseWindow = baseSorted.filter(t => t.entryTs >= windowStart && t.entryTs < ts);

    if (edgeWindow.length < 3 || baseWindow.length < 3) continue;

    const edgeExp = avg(edgeWindow.map(t => t.pnlPips));
    const baseExp = avg(baseWindow.map(t => t.pnlPips));
    const edgeDD = computeMaxDD(edgeWindow.map(t => t.pnlPips));
    const baseDD = computeMaxDD(baseWindow.map(t => t.pnlPips));

    const date = new Date(ts);
    points.push({
      dayLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      expectancyRatio: baseExp !== 0 ? Math.round((edgeExp / baseExp) * 100) / 100 : edgeExp > 0 ? 99 : 0,
      ddRatio: baseDD > 0 ? Math.round((edgeDD / baseDD) * 100) / 100 : edgeDD === 0 ? 0 : 1,
      predictiveness: computeCompositePredictivenessScore(baseWindow),
      clusterStability: computeClusterStabilityScore(edgeWindow, baseWindow),
    });
  }

  return points.slice(-14); // last 14 data points
}

// ─── Main Engine ──────────────────────────────────────────────────────

export function computeEdgeGoLive(
  allTrades: NormalizedTrade[],
  options?: { edgeTopN?: number; minEnvTrades?: number }
): GoLiveResult {
  const topN = options?.edgeTopN ?? 10;
  const minEnvTrades = options?.minEnvTrades ?? 30;

  // Separate by environment
  const livePractice = allTrades.filter(t => t.environment === 'live' || t.environment === 'practice');
  const shadowTrades = allTrades.filter(t => t.environment === 'shadow');
  const backtestTrades = allTrades.filter(t => t.environment === 'backtest');

  // Use backtest + live/practice to determine edge environments
  const referencePool = [...livePractice, ...backtestTrades];
  const edgeKeys = getEdgeEnvironmentKeys(referencePool, topN, minEnvTrades);

  // Shadow edge = shadow evals whose environment matches edge definition
  const shadowEdge = shadowTrades.filter(t => isEdgeTrade(t, edgeKeys));

  // Baseline = all governance-approved trades (live+practice) in same time window
  const baselineApproved = livePractice.filter(t =>
    t.governanceDecision === 'approved' || t.governanceDecision === 'unknown'
  );

  // Compute metrics
  const shadowEdgePnls = shadowEdge.map(t => t.pnlPips);
  const baselinePnls = baselineApproved.map(t => t.pnlPips);

  const shadowEdgeExpectancy = shadowEdgePnls.length > 0 ? avg(shadowEdgePnls) : 0;
  const baselineExpectancy = baselinePnls.length > 0 ? avg(baselinePnls) : 0;
  const expectancyRatio = baselineExpectancy !== 0
    ? Math.round((shadowEdgeExpectancy / baselineExpectancy) * 100) / 100
    : shadowEdgeExpectancy > 0 ? 99 : 0;

  const shadowEdgeMaxDD = computeMaxDD(shadowEdgePnls);
  const baselineMaxDD = computeMaxDD(baselinePnls);
  const ddRatio = baselineMaxDD > 0
    ? Math.round((shadowEdgeMaxDD / baselineMaxDD) * 100) / 100
    : shadowEdgeMaxDD === 0 ? 0 : 1;

  const compositePredictivenessScore = computeCompositePredictivenessScore(baselineApproved);
  const sessionCoverage = computeSessionCoverage(shadowEdge);
  const regimeCoverage = computeRegimeCoverage(shadowEdge);

  const longEdge = shadowEdge.filter(t => t.direction === 'long');
  const shortEdge = shadowEdge.filter(t => t.direction === 'short');
  const longBase = baselineApproved.filter(t => t.direction === 'long');
  const shortBase = baselineApproved.filter(t => t.direction === 'short');

  const directionParity: DirectionParity = {
    longEdge: longEdge.length,
    shortEdge: shortEdge.length,
    longBase: longBase.length,
    shortBase: shortBase.length,
  };

  const clusterStabilityScore = computeClusterStabilityScore(shadowEdge, baselineApproved);

  const metrics: GoLiveMetrics = {
    shadowEdgeTrades: shadowEdge.length,
    baselineTrades: baselineApproved.length,
    shadowEdgeExpectancy: Math.round(shadowEdgeExpectancy * 100) / 100,
    baselineExpectancy: Math.round(baselineExpectancy * 100) / 100,
    expectancyRatio,
    shadowEdgeMaxDD,
    baselineMaxDD,
    ddRatio,
    compositePredictivenessScore: Math.round(compositePredictivenessScore * 100) / 100,
    sessionCoverage,
    regimeCoverage,
    directionParity,
    clusterStabilityScore,
  };

  // Count sessions with >= 15 trades
  const sessionsWith15 = Object.values(sessionCoverage).filter(c => c >= 15).length;
  const regimesWith15 = Object.values(regimeCoverage).filter(c => c >= 15).length;

  // Build checklist
  const checks: GoLiveCheckItem[] = [
    // Level 1
    { id: 'shadow_50', label: 'Shadow edge trades ≥ 50', passed: shadowEdge.length >= 50, detail: `${shadowEdge.length} shadow edge trades`, requiredForLevel: 1 },
    { id: 'exp_ratio_1_2', label: 'Expectancy ratio > 1.2', passed: expectancyRatio > 1.2, detail: `Ratio: ${expectancyRatio}`, requiredForLevel: 1 },
    // Level 2
    { id: 'shadow_120', label: 'Shadow edge trades ≥ 120', passed: shadowEdge.length >= 120, detail: `${shadowEdge.length} shadow edge trades`, requiredForLevel: 2 },
    { id: 'exp_ratio_1_4', label: 'Expectancy ratio > 1.4', passed: expectancyRatio > 1.4, detail: `Ratio: ${expectancyRatio}`, requiredForLevel: 2 },
    { id: 'dd_ratio_0_75', label: 'DD ratio < 0.75', passed: ddRatio < 0.75, detail: `DD Ratio: ${ddRatio}`, requiredForLevel: 2 },
    // Level 3
    { id: 'shadow_200', label: 'Shadow edge trades ≥ 200', passed: shadowEdge.length >= 200, detail: `${shadowEdge.length} shadow edge trades`, requiredForLevel: 3 },
    { id: 'exp_ratio_1_5', label: 'Expectancy ratio > 1.5', passed: expectancyRatio > 1.5, detail: `Ratio: ${expectancyRatio}`, requiredForLevel: 3 },
    { id: 'dd_ratio_0_60', label: 'DD ratio < 0.60', passed: ddRatio < 0.60, detail: `DD Ratio: ${ddRatio}`, requiredForLevel: 3 },
    { id: 'predict_0_55', label: 'Predictiveness > 0.55', passed: compositePredictivenessScore > 0.55, detail: `Score: ${compositePredictivenessScore}`, requiredForLevel: 3 },
    { id: 'sessions_3', label: 'Edge stable across ≥ 3 sessions', passed: sessionsWith15 >= 3, detail: `${sessionsWith15} sessions with ≥ 15 trades`, requiredForLevel: 3 },
    // Level 4
    { id: 'shadow_350', label: 'Shadow edge trades ≥ 350', passed: shadowEdge.length >= 350, detail: `${shadowEdge.length} shadow edge trades`, requiredForLevel: 4 },
    { id: 'exp_ratio_1_7', label: 'Expectancy ratio > 1.7', passed: expectancyRatio > 1.7, detail: `Ratio: ${expectancyRatio}`, requiredForLevel: 4 },
    { id: 'dd_ratio_0_50', label: 'DD ratio < 0.50', passed: ddRatio < 0.50, detail: `DD Ratio: ${ddRatio}`, requiredForLevel: 4 },
    { id: 'predict_0_65', label: 'Predictiveness > 0.65', passed: compositePredictivenessScore > 0.65, detail: `Score: ${compositePredictivenessScore}`, requiredForLevel: 4 },
    { id: 'session_coverage_15', label: '≥ 3 sessions with ≥ 15 trades', passed: sessionsWith15 >= 3, detail: `${sessionsWith15} sessions`, requiredForLevel: 4 },
    { id: 'regime_coverage_15', label: '≥ 2 regimes with ≥ 15 trades', passed: regimesWith15 >= 2, detail: `${regimesWith15} regimes`, requiredForLevel: 4 },
  ];

  // Determine maturity level
  const l4Checks = checks.filter(c => c.requiredForLevel <= 4);
  const l3Checks = checks.filter(c => c.requiredForLevel <= 3);
  const l2Checks = checks.filter(c => c.requiredForLevel <= 2);
  const l1Checks = checks.filter(c => c.requiredForLevel <= 1);

  let maturityLevel: MaturityLevel = 0;
  let deploymentMode: DeploymentMode = 'NORMAL';
  let sizingRule: GoLiveResult['sizingRule'] = null;

  if (l4Checks.every(c => c.passed)) {
    maturityLevel = 4;
    deploymentMode = 'FULL_EDGE_ONLY';
  } else if (l3Checks.every(c => c.passed)) {
    maturityLevel = 3;
    deploymentMode = 'COND_EDGE_ONLY';
  } else if (l2Checks.every(c => c.passed)) {
    maturityLevel = 2;
    deploymentMode = 'EDGE_WEIGHT';
    sizingRule = { edgeMultiplier: 1.35, nonEdgeMultiplier: 0.65 };
  } else if (l1Checks.every(c => c.passed)) {
    maturityLevel = 1;
    deploymentMode = 'NORMAL';
  }

  // Auto-downgrade: check rolling 7-day stability
  const rollingStability = computeRollingStability(shadowEdge, baselineApproved, allTrades);
  let downgradeTriggered = false;

  if (maturityLevel >= 2 && rollingStability.length >= 3) {
    const recent = rollingStability.slice(-3);
    const recentExpRatio = avg(recent.map(p => p.expectancyRatio));
    const recentDdRatio = avg(recent.map(p => p.ddRatio));
    const recentPred = avg(recent.map(p => p.predictiveness));
    const recentCluster = avg(recent.map(p => p.clusterStability));

    const earlyPred = rollingStability.length > 5
      ? avg(rollingStability.slice(0, 3).map(p => p.predictiveness))
      : compositePredictivenessScore;

    if (
      recentExpRatio < 1.2 ||
      recentDdRatio > 0.90 ||
      (earlyPred - recentPred) > 0.15 ||
      recentCluster < 0.2
    ) {
      downgradeTriggered = true;
      maturityLevel = Math.max(0, maturityLevel - 1) as MaturityLevel;
      deploymentMode = maturityLevel === 0 ? 'NORMAL'
        : maturityLevel === 1 ? 'NORMAL'
        : maturityLevel === 2 ? 'EDGE_WEIGHT'
        : 'COND_EDGE_ONLY';
    }
  }

  // Build pass/fail reasons for "Why not Edge-Only yet?"
  const passFailReasons: string[] = [];
  const nextLevel = Math.min(4, maturityLevel + 1) as MaturityLevel;
  for (const c of checks) {
    if (c.requiredForLevel === nextLevel && !c.passed) {
      passFailReasons.push(`❌ ${c.label} — ${c.detail}`);
    }
  }
  if (downgradeTriggered) {
    passFailReasons.unshift('⚠️ Auto-downgrade triggered: rolling 7-day metrics degraded');
  }
  if (passFailReasons.length === 0 && maturityLevel < 4) {
    passFailReasons.push('Insufficient shadow trade data for next level');
  }

  return {
    maturityLevel,
    deploymentMode,
    metrics,
    passFailReasons,
    downgradeTriggered,
    checks,
    rollingStability,
    sizingRule,
  };
}
