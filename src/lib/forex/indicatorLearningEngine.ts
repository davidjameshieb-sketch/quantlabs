// Indicator Learning Engine
// Walk-forward OOS, regime-aware, soft-weighted indicator reliability.
// Prevents data leakage by computing lift on out-of-sample trades only.

export interface IndicatorReliability {
  key: string;
  name: string;
  confirmedTrades: number;
  confirmedWins: number;
  winRate: number;
  lift: number;
  quality: 'signal' | 'noise' | 'neutral';
  oosValidated: boolean; // true if lift was confirmed out-of-sample
}

// ─── Regime Buckets ───
export type VolatilityBucket = 'compression' | 'expansion' | 'ignition' | 'exhaustion';
export type TrendBucket = 'trending' | 'ranging';
export type RegimeBucketKey = `${TrendBucket}_${VolatilityBucket}`;

export const ALL_REGIME_BUCKETS: RegimeBucketKey[] = [
  'trending_compression', 'trending_expansion', 'trending_ignition', 'trending_exhaustion',
  'ranging_compression', 'ranging_expansion', 'ranging_ignition', 'ranging_exhaustion',
];

export function classifyRegimeBucket(regimeLabel: string): RegimeBucketKey {
  const lower = (regimeLabel || '').toLowerCase();

  let vol: VolatilityBucket = 'expansion';
  if (lower.includes('compress') || lower === 'quiet') vol = 'compression';
  else if (lower.includes('ignit') || lower.includes('breakout') || lower.includes('momentum')) vol = 'ignition';
  else if (lower.includes('exhaust') || lower.includes('risk-off')) vol = 'exhaustion';

  let trend: TrendBucket = 'ranging';
  if (lower.includes('trend') || lower.includes('momentum') || lower.includes('breakout') || lower.includes('breakdown')) trend = 'trending';
  if (vol === 'ignition') trend = 'trending';

  return `${trend}_${vol}`;
}

export interface RegimeIndicatorProfile {
  regime: RegimeBucketKey;
  totalTrades: number;
  baselineWinRate: number;
  indicators: IndicatorReliability[];
  softWeights: Record<string, number>;
  oosValidated: boolean;
}

export interface PairIndicatorProfile {
  pair: string;
  totalTrades: number;
  baselineWinRate: number;
  indicators: IndicatorReliability[];
  signalIndicators: string[];
  noiseIndicators: string[];
  qualityScore: number;
  minSampleSize: number;
  lastUpdated: string;
  regimeProfiles: Record<RegimeBucketKey, RegimeIndicatorProfile>;
  globalSoftWeights: Record<string, number>;
  oosValidated: boolean;
  oosTradesUsed: number;
}

const INDICATOR_NAMES: Record<string, string> = {
  ema50: 'EMA-50', rsi: 'RSI', supertrend: 'Supertrend',
  parabolicSAR: 'Parabolic SAR', ichimoku: 'Ichimoku', adx: 'ADX',
  bollingerBands: 'Bollinger Bands', donchianChannels: 'Donchian',
  stochastics: 'Stochastics', cci: 'CCI', keltnerChannels: 'Keltner',
  roc: 'ROC', elderForce: 'Elder Force', heikinAshi: 'Heikin-Ashi',
  pivotPoints: 'Pivot Points', trendEfficiency: 'Trend Efficiency',
};

const MIN_TRADES_FOR_LEARNING = 10;
const MIN_TRADES_PER_REGIME = 5;
const MIN_OOS_TRADES = 5;
const NOISE_LIFT_THRESHOLD = -0.03;
const SIGNAL_LIFT_THRESHOLD = 0.02;
const NOISE_FLOOR_WEIGHT = 0.05;
const WALK_FORWARD_TRAIN_RATIO = 0.67; // 2/3 train, 1/3 test

export function computeAdaptiveThreshold(profile: PairIndicatorProfile): number {
  const BASE = 25;
  const MAX = 45;
  if (profile.totalTrades < 20) return BASE;
  const maturity = Math.min(1, profile.totalTrades / 100);
  const noiseRatio = profile.noiseIndicators.length / 16;
  const qualityBoost = Math.round(profile.qualityScore * 0.15);
  const noiseBoost = Math.round(noiseRatio * 10);
  return Math.min(MAX, BASE + Math.round((qualityBoost + noiseBoost) * maturity));
}

// ─── Walk-Forward OOS Indicator Learning ───

interface TradeRecord {
  direction: string;
  won: boolean;
  indicators: Record<string, string>;
  timestamp?: number; // for chronological ordering
}

/**
 * Compute indicator reliabilities using walk-forward OOS validation.
 * Train on older 2/3 of trades, validate lift on newer 1/3.
 * Signal requires positive lift in BOTH train and OOS sets.
 * Noise only needs negative OOS lift.
 */
function computeOOSReliabilities(
  trades: TradeRecord[],
  baselineWinRate: number,
  minSample: number
): { indicators: IndicatorReliability[]; oosValidated: boolean; oosTradesUsed: number } {
  // Sort chronologically (oldest first)
  const sorted = [...trades].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const splitIdx = Math.floor(sorted.length * WALK_FORWARD_TRAIN_RATIO);
  const trainSet = sorted.slice(0, splitIdx);
  const testSet = sorted.slice(splitIdx);

  const hasOOS = testSet.length >= MIN_OOS_TRADES;
  const trainBaseWR = trainSet.length > 0 ? trainSet.filter(t => t.won).length / trainSet.length : 0.5;
  const testBaseWR = testSet.length > 0 ? testSet.filter(t => t.won).length / testSet.length : 0.5;

  const indicators: IndicatorReliability[] = [];

  for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
    let trainConf = 0, trainWins = 0;
    for (const t of trainSet) {
      const sig = t.indicators[key];
      if (!sig || sig === 'neutral') continue;
      const isConf = (
        (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
        (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
      );
      if (isConf) { trainConf++; if (t.won) trainWins++; }
    }

    let testConf = 0, testWins = 0;
    for (const t of testSet) {
      const sig = t.indicators[key];
      if (!sig || sig === 'neutral') continue;
      const isConf = (
        (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
        (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
      );
      if (isConf) { testConf++; if (t.won) testWins++; }
    }

    let quality: 'signal' | 'noise' | 'neutral' = 'neutral';
    let lift = 0;
    let oosValidated = false;
    const totalConf = trainConf + testConf;
    const totalWins = trainWins + testWins;
    const winRate = totalConf > 0 ? totalWins / totalConf : 0;

    if (hasOOS && testConf >= Math.min(minSample, MIN_OOS_TRADES)) {
      // OOS-validated
      const oosLift = (testWins / testConf) - testBaseWR;
      lift = oosLift;
      oosValidated = true;

      if (oosLift <= NOISE_LIFT_THRESHOLD) {
        quality = 'noise';
      } else if (oosLift >= SIGNAL_LIFT_THRESHOLD) {
        const trainLift = trainConf >= minSample ? (trainWins / trainConf) - trainBaseWR : 0;
        quality = trainLift >= 0 ? 'signal' : 'neutral';
      }
    } else if (trainConf >= minSample) {
      // Fallback: in-sample only (capped influence)
      lift = (trainWins / trainConf) - trainBaseWR;
      if (lift >= SIGNAL_LIFT_THRESHOLD) quality = 'signal';
      else if (lift <= NOISE_LIFT_THRESHOLD) quality = 'noise';
    }

    indicators.push({ key, name, confirmedTrades: totalConf, confirmedWins: totalWins, winRate, lift, quality, oosValidated });
  }

  return { indicators, oosValidated: hasOOS, oosTradesUsed: testSet.length };
}

function computeWeightsFromReliabilities(indicators: IndicatorReliability[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const ind of indicators) {
    if (ind.quality === 'signal') {
      if (ind.oosValidated) {
        weights[ind.key] = Math.min(1.0, 0.6 + ind.lift * 5);
      } else {
        // Capped boost without OOS confirmation
        weights[ind.key] = Math.min(0.75, 0.55 + ind.lift * 3);
      }
    } else if (ind.quality === 'noise') {
      if (ind.oosValidated) {
        weights[ind.key] = Math.max(NOISE_FLOOR_WEIGHT, 0.15 + ind.lift * 2);
      } else {
        // Weaker penalty without OOS confirmation
        weights[ind.key] = Math.max(0.15, 0.3 + ind.lift * 2);
      }
    } else {
      weights[ind.key] = 0.5;
    }
  }
  return weights;
}

/**
 * Compute regime-aware, OOS-validated indicator profile for a given pair.
 */
export function computeIndicatorProfile(
  trades: Array<{
    pair: string;
    direction: string;
    won: boolean;
    indicators: Record<string, string>;
    regime?: string;
    timestamp?: number;
  }>,
  pair: string
): PairIndicatorProfile {
  const pairTrades = trades.filter(t => t.pair === pair);
  const totalTrades = pairTrades.length;
  const baselineWinRate = totalTrades > 0
    ? pairTrades.filter(t => t.won).length / totalTrades
    : 0.5;

  // Global OOS-validated indicators
  const { indicators, oosValidated, oosTradesUsed } = computeOOSReliabilities(pairTrades, baselineWinRate, MIN_TRADES_FOR_LEARNING);
  const globalSoftWeights = computeWeightsFromReliabilities(indicators);

  const signalIndicators = indicators.filter(i => i.quality === 'signal').map(i => i.key);
  const noiseIndicators = indicators.filter(i => i.quality === 'noise').map(i => i.key);

  // Regime-specific profiles
  const regimeProfiles = {} as Record<RegimeBucketKey, RegimeIndicatorProfile>;
  const regimeBuckets = new Map<RegimeBucketKey, typeof pairTrades>();

  for (const t of pairTrades) {
    if (!t.regime) continue;
    const bucket = classifyRegimeBucket(t.regime);
    if (!regimeBuckets.has(bucket)) regimeBuckets.set(bucket, []);
    regimeBuckets.get(bucket)!.push(t);
  }

  for (const [bucket, bucketTrades] of regimeBuckets) {
    if (bucketTrades.length < MIN_TRADES_PER_REGIME) continue;
    const bucketBaseWR = bucketTrades.filter(t => t.won).length / bucketTrades.length;
    const bucketResult = computeOOSReliabilities(bucketTrades, bucketBaseWR, MIN_TRADES_PER_REGIME);
    regimeProfiles[bucket] = {
      regime: bucket,
      totalTrades: bucketTrades.length,
      baselineWinRate: bucketBaseWR,
      indicators: bucketResult.indicators,
      softWeights: computeWeightsFromReliabilities(bucketResult.indicators),
      oosValidated: bucketResult.oosValidated,
    };
  }

  const signalLiftSum = indicators
    .filter(i => i.quality === 'signal')
    .reduce((s, i) => s + i.lift, 0);
  const qualityScore = Math.min(100, Math.round(
    (signalIndicators.length / 16) * 50 + Math.min(50, signalLiftSum * 500)
  ));

  return {
    pair,
    totalTrades,
    baselineWinRate,
    indicators,
    signalIndicators,
    noiseIndicators,
    qualityScore,
    minSampleSize: MIN_TRADES_FOR_LEARNING,
    lastUpdated: new Date().toISOString(),
    regimeProfiles,
    globalSoftWeights,
    oosValidated,
    oosTradesUsed,
  };
}

/**
 * Get the best available soft weights for a given regime.
 */
export function getRegimeAwareWeights(
  profile: PairIndicatorProfile,
  currentRegime?: string
): { weights: Record<string, number>; source: 'regime' | 'global'; regime?: RegimeBucketKey; oosValidated: boolean } {
  if (currentRegime) {
    const bucket = classifyRegimeBucket(currentRegime);
    const regimeProfile = profile.regimeProfiles[bucket];
    if (regimeProfile && regimeProfile.totalTrades >= MIN_TRADES_PER_REGIME) {
      return { weights: regimeProfile.softWeights, source: 'regime', regime: bucket, oosValidated: regimeProfile.oosValidated };
    }
  }
  return { weights: profile.globalSoftWeights, source: 'global', oosValidated: profile.oosValidated };
}

/** @deprecated Use computeWeightsFromReliabilities or getRegimeAwareWeights */
export function computeSoftWeights(indicators: IndicatorReliability[]): Record<string, number> {
  return computeWeightsFromReliabilities(indicators);
}

/**
 * Compute a weighted consensus score using soft indicator weights.
 */
export function computeFilteredConsensus(
  indicatorBreakdown: Record<string, string>,
  direction: 'long' | 'short',
  noiseIndicators: string[],
  softWeights?: Record<string, number>
): {
  filteredScore: number;
  filteredDirection: 'bullish' | 'bearish' | 'neutral';
  excludedCount: number;
  totalUsed: number;
  bullishCount: number;
  bearishCount: number;
  weightedBullish: number;
  weightedBearish: number;
} {
  let bullishW = 0;
  let bearishW = 0;
  let totalW = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let totalUsed = 0;

  for (const [key, sig] of Object.entries(indicatorBreakdown)) {
    if (sig === 'neutral') continue;

    const w = softWeights?.[key] ?? (noiseIndicators.includes(key) ? NOISE_FLOOR_WEIGHT : 0.5);
    totalW += w;
    totalUsed++;

    if (sig === 'bullish' || sig === 'oversold') {
      bullishW += w;
      bullishCount++;
    } else if (sig === 'bearish' || sig === 'overbought') {
      bearishW += w;
      bearishCount++;
    }
  }

  const filteredScore = totalW > 0
    ? Math.round(((bullishW - bearishW) / totalW) * 100)
    : 0;

  const filteredDirection: 'bullish' | 'bearish' | 'neutral' =
    filteredScore > 15 ? 'bullish' :
    filteredScore < -15 ? 'bearish' : 'neutral';

  return {
    filteredScore,
    filteredDirection,
    excludedCount: noiseIndicators.filter(k => indicatorBreakdown[k] && indicatorBreakdown[k] !== 'neutral').length,
    totalUsed,
    bullishCount,
    bearishCount,
    weightedBullish: Math.round(bullishW * 100) / 100,
    weightedBearish: Math.round(bearishW * 100) / 100,
  };
}
