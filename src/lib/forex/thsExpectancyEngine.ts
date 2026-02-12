// ─── THS Expectancy Intelligence Layer ───
// Converts Trade Health Score from defensive governance into forward profitability intelligence.
// Uses closed trade outcomes bucketed by THS band to compute statistical expectancy for open trades.
//
// HARD CONSTRAINTS:
// • Does NOT alter entry logic
// • Does NOT force time exits
// • Operates as post-entry intelligence layer
// • Remains adaptive and rolling

// ─── Types ───────────────────────────────────────────────

export type ExpectancyBand = 'Elite' | 'Strong' | 'Viable' | 'Weak' | 'Fragile';

export interface ClosedTradeRecord {
  entryThs: number;
  peakThs: number;
  exitThs: number;
  finalR: number;
  mfeR: number;
  maeR: number;
  regimeAtEntry: string;
  pair: string;
  sessionLabel: string;
  durationBars: number;
  direction: string;
}

export interface BandStats {
  band: ExpectancyBand;
  thsRange: [number, number];
  tradeCount: number;
  winRate: number;
  avgR: number;
  medianR: number;
  stdDevR: number;
  avgMfeR: number;
  avgMaeR: number;
  avgDurationBars: number;
  profitFactor: number;
}

export interface LiveExpectancy {
  band: ExpectancyBand;
  expectedR: number;
  probabilityHoldSuccess: number;
  adaptiveRiskMultiplier: number;
  historicalWinRate: number;
  sampleSize: number;
  bandStats: BandStats | null;
}

export interface ExpectancyTableSet {
  global: BandStats[];
  byRegime: Record<string, BandStats[]>;
  byPairCluster: Record<string, BandStats[]>;
  bySession: Record<string, BandStats[]>;
  lastUpdated: number;
  totalSamples: number;
}

// ─── Constants ───────────────────────────────────────────

const BAND_RANGES: Array<{ band: ExpectancyBand; min: number; max: number }> = [
  { band: 'Elite',   min: 80, max: 100 },
  { band: 'Strong',  min: 70, max: 79 },
  { band: 'Viable',  min: 55, max: 69 },
  { band: 'Weak',    min: 40, max: 54 },
  { band: 'Fragile', min: 0,  max: 39 },
];

const PAIR_CLUSTERS: Record<string, string[]> = {
  'JPY': ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'],
  'AUD': ['AUD_USD', 'AUD_JPY', 'AUD_NZD', 'AUD_CAD', 'EUR_AUD', 'GBP_AUD'],
  'EUR': ['EUR_USD', 'EUR_GBP', 'EUR_JPY', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF', 'EUR_NZD'],
  'GBP': ['GBP_USD', 'GBP_JPY', 'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_NZD'],
  'CAD': ['USD_CAD', 'AUD_CAD', 'EUR_CAD', 'GBP_CAD', 'CAD_JPY', 'CAD_CHF'],
};

const ROLLING_WINDOW = 200; // last N trades for expectancy tables

// ─── State ───────────────────────────────────────────────

let _tables: ExpectancyTableSet | null = null;
let _tradeBuffer: ClosedTradeRecord[] = [];

// ─── Helpers ─────────────────────────────────────────────

function getBandForThs(ths: number): ExpectancyBand {
  for (const { band, min, max } of BAND_RANGES) {
    if (ths >= min && ths <= max) return band;
  }
  return 'Fragile';
}

function getPairCluster(pair: string): string {
  for (const [cluster, pairs] of Object.entries(PAIR_CLUSTERS)) {
    if (pairs.includes(pair)) return cluster;
  }
  return 'Other';
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function computeBandStats(trades: ClosedTradeRecord[], band: ExpectancyBand, range: [number, number]): BandStats {
  const bandTrades = trades.filter(t => t.entryThs >= range[0] && t.entryThs <= range[1]);

  if (bandTrades.length === 0) {
    return {
      band, thsRange: range, tradeCount: 0,
      winRate: 0, avgR: 0, medianR: 0, stdDevR: 0,
      avgMfeR: 0, avgMaeR: 0, avgDurationBars: 0, profitFactor: 0,
    };
  }

  const rValues = bandTrades.map(t => t.finalR);
  const wins = bandTrades.filter(t => t.finalR > 0);
  const losses = bandTrades.filter(t => t.finalR <= 0);

  const grossProfit = wins.reduce((s, t) => s + t.finalR, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.finalR, 0));

  return {
    band,
    thsRange: range,
    tradeCount: bandTrades.length,
    winRate: Math.round((wins.length / bandTrades.length) * 1000) / 10,
    avgR: Math.round((rValues.reduce((s, v) => s + v, 0) / rValues.length) * 100) / 100,
    medianR: Math.round(median(rValues) * 100) / 100,
    stdDevR: Math.round(stdDev(rValues) * 100) / 100,
    avgMfeR: Math.round((bandTrades.reduce((s, t) => s + t.mfeR, 0) / bandTrades.length) * 100) / 100,
    avgMaeR: Math.round((bandTrades.reduce((s, t) => s + t.maeR, 0) / bandTrades.length) * 100) / 100,
    avgDurationBars: Math.round(bandTrades.reduce((s, t) => s + t.durationBars, 0) / bandTrades.length),
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0,
  };
}

function buildBandStatsArray(trades: ClosedTradeRecord[]): BandStats[] {
  return BAND_RANGES.map(({ band, min, max }) => computeBandStats(trades, band, [min, max]));
}

// ─── Public API ──────────────────────────────────────────

/**
 * Feed closed trade records into the expectancy engine.
 * Maintains a rolling window of the most recent trades.
 */
export function feedClosedTrades(trades: ClosedTradeRecord[]): void {
  _tradeBuffer = [..._tradeBuffer, ...trades].slice(-ROLLING_WINDOW);
  rebuildTables();
}

/**
 * Replace the entire trade buffer (used on initial load from DB).
 */
export function setTradeBuffer(trades: ClosedTradeRecord[]): void {
  _tradeBuffer = trades.slice(-ROLLING_WINDOW);
  rebuildTables();
}

/**
 * Rebuild all expectancy tables from the current trade buffer.
 */
export function rebuildTables(): void {
  const trades = _tradeBuffer;

  // Global
  const global = buildBandStatsArray(trades);

  // By regime
  const regimes = [...new Set(trades.map(t => t.regimeAtEntry).filter(Boolean))];
  const byRegime: Record<string, BandStats[]> = {};
  for (const regime of regimes) {
    byRegime[regime] = buildBandStatsArray(trades.filter(t => t.regimeAtEntry === regime));
  }

  // By pair cluster
  const byPairCluster: Record<string, BandStats[]> = {};
  for (const cluster of Object.keys(PAIR_CLUSTERS)) {
    const clusterTrades = trades.filter(t => PAIR_CLUSTERS[cluster].includes(t.pair));
    if (clusterTrades.length > 0) {
      byPairCluster[cluster] = buildBandStatsArray(clusterTrades);
    }
  }

  // By session
  const sessions = [...new Set(trades.map(t => t.sessionLabel).filter(Boolean))];
  const bySession: Record<string, BandStats[]> = {};
  for (const session of sessions) {
    bySession[session] = buildBandStatsArray(trades.filter(t => t.sessionLabel === session));
  }

  _tables = {
    global,
    byRegime,
    byPairCluster,
    bySession,
    lastUpdated: Date.now(),
    totalSamples: trades.length,
  };
}

/**
 * Get the current expectancy tables.
 */
export function getExpectancyTables(): ExpectancyTableSet | null {
  return _tables;
}

/**
 * Compute live expectancy for an open trade given its current THS and context.
 */
export function computeLiveExpectancy(
  currentThs: number,
  thsSlope: number, // THS change per bar (positive = improving)
  persistenceDelta: number,
  regimeStability: number, // 0-100
  accelerationDelta: number,
  pair: string,
  regimeLabel: string,
  sessionLabel: string,
): LiveExpectancy {
  const band = getBandForThs(currentThs);
  const tables = _tables;

  if (!tables || tables.totalSamples < 10) {
    return {
      band,
      expectedR: 0,
      probabilityHoldSuccess: 0.5,
      adaptiveRiskMultiplier: 1.0,
      historicalWinRate: 0,
      sampleSize: 0,
      bandStats: null,
    };
  }

  // Find best-match stats: try regime-specific, then pair-cluster, then global
  let bandStats: BandStats | null = null;
  const cluster = getPairCluster(pair);

  // Regime-specific (most predictive)
  if (regimeLabel && tables.byRegime[regimeLabel]) {
    const regimeBand = tables.byRegime[regimeLabel].find(b => b.band === band);
    if (regimeBand && regimeBand.tradeCount >= 10) bandStats = regimeBand;
  }

  // Pair cluster fallback
  if (!bandStats && tables.byPairCluster[cluster]) {
    const clusterBand = tables.byPairCluster[cluster].find(b => b.band === band);
    if (clusterBand && clusterBand.tradeCount >= 10) bandStats = clusterBand;
  }

  // Global fallback
  if (!bandStats) {
    bandStats = tables.global.find(b => b.band === band) || null;
  }

  if (!bandStats || bandStats.tradeCount < 5) {
    return {
      band,
      expectedR: 0,
      probabilityHoldSuccess: 0.5,
      adaptiveRiskMultiplier: 1.0,
      historicalWinRate: 0,
      sampleSize: bandStats?.tradeCount ?? 0,
      bandStats,
    };
  }

  // ─── Probability of Completion ───
  // Derived from 4 live signals:
  // 1. THS slope (improving = higher probability)
  // 2. Persistence delta (trending = higher probability)
  // 3. Regime stability (stable = higher probability)
  // 4. Acceleration delta (accelerating = higher probability)

  const slopeContrib = clamp(0.5 + thsSlope * 0.05, 0, 1);       // ±10 THS/bar → 0..1
  const persContrib = clamp(0.5 + persistenceDelta * 0.01, 0, 1); // ±50 → 0..1
  const regimeContrib = regimeStability / 100;                     // 0..1 directly
  const accelContrib = clamp(0.5 + accelerationDelta * 0.01, 0, 1);

  // Weighted combination
  const rawProb = 0.30 * slopeContrib + 0.25 * persContrib + 0.30 * regimeContrib + 0.15 * accelContrib;

  // Blend with historical win rate (50/50)
  const histWinRate = bandStats.winRate / 100;
  const probabilityHoldSuccess = Math.round(((rawProb + histWinRate) / 2) * 100) / 100;

  // ─── Expected R ───
  const expectedR = Math.round(bandStats.avgR * probabilityHoldSuccess * 100) / 100;

  // ─── Adaptive Risk Multiplier ───
  // Scale position sizing based on expectancy quality
  // Elite/Strong with high probability → up to 1.5x
  // Weak/Fragile with low probability → down to 0.5x
  let adaptiveRiskMultiplier = 1.0;

  if (bandStats.profitFactor >= 2.0 && probabilityHoldSuccess >= 0.6) {
    adaptiveRiskMultiplier = Math.min(1.5, 1.0 + (bandStats.profitFactor - 1.5) * 0.15);
  } else if (bandStats.profitFactor < 1.0 || probabilityHoldSuccess < 0.35) {
    adaptiveRiskMultiplier = Math.max(0.5, probabilityHoldSuccess + 0.15);
  }

  adaptiveRiskMultiplier = Math.round(clamp(adaptiveRiskMultiplier, 0.5, 1.5) * 100) / 100;

  return {
    band,
    expectedR,
    probabilityHoldSuccess,
    adaptiveRiskMultiplier,
    historicalWinRate: bandStats.winRate,
    sampleSize: bandStats.tradeCount,
    bandStats,
  };
}

/**
 * Get global band summary for display.
 */
export function getGlobalBandSummary(): BandStats[] {
  return _tables?.global ?? [];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── DB Record Conversion Helper ─────────────────────────

export function orderToClosedTradeRecord(order: {
  entry_ths?: number | null;
  peak_ths?: number | null;
  exit_ths?: number | null;
  trade_health_score?: number | null;
  mfe_r?: number | null;
  mae_r?: number | null;
  r_pips?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  direction: string;
  currency_pair: string;
  session_label?: string | null;
  regime_label?: string | null;
  bars_since_entry?: number | null;
}): ClosedTradeRecord | null {
  const entryPrice = order.entry_price;
  const exitPrice = order.exit_price;
  if (entryPrice == null || exitPrice == null) return null;

  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  const pipMult = jpyPairs.includes(order.currency_pair) ? 100 : 10000;

  const pnlPips = order.direction === 'long'
    ? (exitPrice - entryPrice) * pipMult
    : (entryPrice - exitPrice) * pipMult;

  // FIX: Use real r_pips (true risk at entry) instead of default 8
  const riskPips = order.r_pips ?? 8;
  const finalR = Math.round((pnlPips / riskPips) * 100) / 100;

  return {
    entryThs: order.entry_ths ?? order.trade_health_score ?? 50,
    peakThs: order.peak_ths ?? order.trade_health_score ?? 50,
    exitThs: order.exit_ths ?? order.trade_health_score ?? 50,
    finalR,
    mfeR: order.mfe_r ?? 0,
    maeR: order.mae_r ?? 0,
    regimeAtEntry: order.regime_label ?? 'unknown',
    pair: order.currency_pair,
    sessionLabel: order.session_label ?? 'unknown',
    durationBars: order.bars_since_entry ?? 1,
    direction: order.direction,
  };
}
