// Indicator Learning Engine
// Computes per-pair, per-regime indicator reliability from historical trade outcomes.
// Used by the trade engine to soft-weight indicators and require quality consensus.

export interface IndicatorReliability {
  key: string;
  name: string;
  confirmedTrades: number;
  confirmedWins: number;
  winRate: number;
  lift: number; // vs baseline win rate
  quality: 'signal' | 'noise' | 'neutral';
}

// ─── Regime Buckets ───
// Volatility: compression / expansion / ignition / exhaustion
// Trend: trending / ranging
export type VolatilityBucket = 'compression' | 'expansion' | 'ignition' | 'exhaustion';
export type TrendBucket = 'trending' | 'ranging';
export type RegimeBucketKey = `${TrendBucket}_${VolatilityBucket}`;

export const ALL_REGIME_BUCKETS: RegimeBucketKey[] = [
  'trending_compression', 'trending_expansion', 'trending_ignition', 'trending_exhaustion',
  'ranging_compression', 'ranging_expansion', 'ranging_ignition', 'ranging_exhaustion',
];

/**
 * Map a regime label (from governance) to a structured bucket key.
 * Falls back to 'ranging_expansion' if unrecognizable.
 */
export function classifyRegimeBucket(regimeLabel: string): RegimeBucketKey {
  const lower = (regimeLabel || '').toLowerCase();

  // Volatility bucket
  let vol: VolatilityBucket = 'expansion';
  if (lower.includes('compress') || lower === 'quiet') vol = 'compression';
  else if (lower.includes('ignit') || lower.includes('breakout') || lower.includes('momentum')) vol = 'ignition';
  else if (lower.includes('exhaust') || lower.includes('risk-off')) vol = 'exhaustion';
  else if (lower.includes('expan') || lower.includes('breakdown')) vol = 'expansion';

  // Trend bucket
  let trend: TrendBucket = 'ranging';
  if (lower.includes('trend') || lower.includes('momentum') || lower.includes('breakout') || lower.includes('breakdown')) trend = 'trending';
  else if (lower.includes('rang') || lower.includes('compress') || lower.includes('quiet') || lower.includes('chop')) trend = 'ranging';
  // Expansion/ignition typically trending
  if (vol === 'ignition') trend = 'trending';

  return `${trend}_${vol}`;
}

export interface RegimeIndicatorProfile {
  regime: RegimeBucketKey;
  totalTrades: number;
  baselineWinRate: number;
  indicators: IndicatorReliability[];
  softWeights: Record<string, number>;
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
  // Regime-specific profiles
  regimeProfiles: Record<RegimeBucketKey, RegimeIndicatorProfile>;
  // Global soft weights (fallback when regime-specific data is insufficient)
  globalSoftWeights: Record<string, number>;
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
const MIN_TRADES_PER_REGIME = 5; // Lower threshold per regime bucket
const NOISE_LIFT_THRESHOLD = -0.03;
const SIGNAL_LIFT_THRESHOLD = 0.02;
const NOISE_FLOOR_WEIGHT = 0.05;

/**
 * Compute adaptive consensus threshold based on learning maturity.
 */
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

/**
 * Compute soft weights from indicator reliabilities.
 */
function computeWeightsFromReliabilities(indicators: IndicatorReliability[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const ind of indicators) {
    if (ind.quality === 'signal') {
      weights[ind.key] = Math.min(1.0, 0.6 + ind.lift * 5);
    } else if (ind.quality === 'noise') {
      weights[ind.key] = Math.max(NOISE_FLOOR_WEIGHT, 0.15 + ind.lift * 2);
    } else {
      weights[ind.key] = 0.5;
    }
  }
  return weights;
}

/**
 * Core indicator reliability computation for a set of trades.
 */
function computeReliabilities(
  trades: Array<{ direction: string; won: boolean; indicators: Record<string, string> }>,
  baselineWinRate: number,
  minSample: number
): IndicatorReliability[] {
  const indicators: IndicatorReliability[] = [];

  for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
    let confirmedTrades = 0;
    let confirmedWins = 0;

    for (const t of trades) {
      const sig = t.indicators[key];
      if (!sig || sig === 'neutral') continue;
      const isConfirming = (
        (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
        (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
      );
      if (isConfirming) {
        confirmedTrades++;
        if (t.won) confirmedWins++;
      }
    }

    const winRate = confirmedTrades > 0 ? confirmedWins / confirmedTrades : 0;
    const lift = confirmedTrades >= minSample ? winRate - baselineWinRate : 0;

    let quality: 'signal' | 'noise' | 'neutral' = 'neutral';
    if (confirmedTrades >= minSample) {
      if (lift >= SIGNAL_LIFT_THRESHOLD) quality = 'signal';
      else if (lift <= NOISE_LIFT_THRESHOLD) quality = 'noise';
    }

    indicators.push({ key, name, confirmedTrades, confirmedWins, winRate, lift, quality });
  }
  return indicators;
}

/**
 * Compute regime-aware indicator profile for a given pair.
 * Trades must include a `regime` field for bucketing.
 */
export function computeIndicatorProfile(
  trades: Array<{
    pair: string;
    direction: string;
    won: boolean;
    indicators: Record<string, string>;
    regime?: string; // Optional — if missing, only global profile is built
  }>,
  pair: string
): PairIndicatorProfile {
  const pairTrades = trades.filter(t => t.pair === pair);
  const totalTrades = pairTrades.length;
  const baselineWinRate = totalTrades > 0
    ? pairTrades.filter(t => t.won).length / totalTrades
    : 0.5;

  // Global indicators (across all regimes)
  const indicators = computeReliabilities(pairTrades, baselineWinRate, MIN_TRADES_FOR_LEARNING);
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
    const bucketIndicators = computeReliabilities(bucketTrades, bucketBaseWR, MIN_TRADES_PER_REGIME);
    regimeProfiles[bucket] = {
      regime: bucket,
      totalTrades: bucketTrades.length,
      baselineWinRate: bucketBaseWR,
      indicators: bucketIndicators,
      softWeights: computeWeightsFromReliabilities(bucketIndicators),
    };
  }

  // Quality score
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
  };
}

/**
 * Get the best available soft weights for a given regime.
 * Uses regime-specific weights if enough data, otherwise falls back to global.
 */
export function getRegimeAwareWeights(
  profile: PairIndicatorProfile,
  currentRegime?: string
): { weights: Record<string, number>; source: 'regime' | 'global'; regime?: RegimeBucketKey } {
  if (currentRegime) {
    const bucket = classifyRegimeBucket(currentRegime);
    const regimeProfile = profile.regimeProfiles[bucket];
    if (regimeProfile && regimeProfile.totalTrades >= MIN_TRADES_PER_REGIME) {
      return { weights: regimeProfile.softWeights, source: 'regime', regime: bucket };
    }
  }
  return { weights: profile.globalSoftWeights, source: 'global' };
}

/**
 * Compute soft indicator weights from reliability profiles.
 * @deprecated Use computeWeightsFromReliabilities or getRegimeAwareWeights instead
 */
export function computeSoftWeights(
  indicators: IndicatorReliability[]
): Record<string, number> {
  return computeWeightsFromReliabilities(indicators);
}

/**
 * Compute a weighted consensus score using soft indicator weights.
 * Noise indicators contribute near-zero weight instead of being excluded.
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
