// Indicator Learning Engine
// Computes per-pair indicator reliability from historical trade outcomes.
// Used by the trade engine to filter noise indicators and require quality consensus.

export interface IndicatorReliability {
  key: string;
  name: string;
  confirmedTrades: number;
  confirmedWins: number;
  winRate: number;
  lift: number; // vs baseline win rate
  quality: 'signal' | 'noise' | 'neutral'; // signal = positive lift, noise = negative, neutral = insufficient data
}

export interface PairIndicatorProfile {
  pair: string;
  totalTrades: number;
  baselineWinRate: number;
  indicators: IndicatorReliability[];
  signalIndicators: string[]; // keys with positive lift (quality = 'signal')
  noiseIndicators: string[];  // keys with negative lift (quality = 'noise')
  qualityScore: number;       // 0-100, how much edge the signal indicators add
  minSampleSize: number;
  lastUpdated: string;
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
const NOISE_LIFT_THRESHOLD = -0.03; // < -3% lift = noise
const SIGNAL_LIFT_THRESHOLD = 0.02; // > +2% lift = signal
const NOISE_FLOOR_WEIGHT = 0.05;   // soft floor — never fully excluded

/**
 * Compute adaptive consensus threshold based on learning maturity.
 * More data + more noise identified = higher bar for entry.
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
 * Compute indicator reliability profile for a given pair from historical trades.
 * This is the core learning function — runs either client-side for dashboard
 * or server-side in the edge function.
 */
export function computeIndicatorProfile(
  trades: Array<{
    pair: string;
    direction: string;
    won: boolean;
    indicators: Record<string, string>;
  }>,
  pair: string
): PairIndicatorProfile {
  const pairTrades = trades.filter(t => t.pair === pair);
  const totalTrades = pairTrades.length;
  const baselineWinRate = totalTrades > 0
    ? pairTrades.filter(t => t.won).length / totalTrades
    : 0.5;

  const indicators: IndicatorReliability[] = [];

  for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
    let confirmedTrades = 0;
    let confirmedWins = 0;

    for (const t of pairTrades) {
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
    const lift = confirmedTrades >= MIN_TRADES_FOR_LEARNING
      ? winRate - baselineWinRate
      : 0;

    let quality: 'signal' | 'noise' | 'neutral' = 'neutral';
    if (confirmedTrades >= MIN_TRADES_FOR_LEARNING) {
      if (lift >= SIGNAL_LIFT_THRESHOLD) quality = 'signal';
      else if (lift <= NOISE_LIFT_THRESHOLD) quality = 'noise';
    }

    indicators.push({ key, name, confirmedTrades, confirmedWins, winRate, lift, quality });
  }

  const signalIndicators = indicators.filter(i => i.quality === 'signal').map(i => i.key);
  const noiseIndicators = indicators.filter(i => i.quality === 'noise').map(i => i.key);

  // Quality score: weighted average lift of signal indicators (0-100)
  const signalLiftSum = indicators
    .filter(i => i.quality === 'signal')
    .reduce((s, i) => s + i.lift, 0);
  const qualityScore = Math.min(100, Math.round(
    (signalIndicators.length / 16) * 50 +
    Math.min(50, signalLiftSum * 500)
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
  };
}

/**
 * Compute a filtered consensus score using only "signal" indicators.
 * Noise indicators are excluded from the score.
 * Returns an adjusted consensus and the list of excluded indicators.
 */
/**
 * Compute soft indicator weights from reliability profiles.
 * Noise indicators get near-zero weight (0.05) instead of hard exclusion.
 * Signal indicators get boosted weight (up to 1.0).
 * Neutral indicators stay at baseline (0.5).
 */
export function computeSoftWeights(
  indicators: IndicatorReliability[]
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const ind of indicators) {
    if (ind.quality === 'signal') {
      // Scale weight by lift magnitude, capped at 1.0
      weights[ind.key] = Math.min(1.0, 0.6 + ind.lift * 5);
    } else if (ind.quality === 'noise') {
      // Near-zero but never fully excluded — can recover if regime flips
      weights[ind.key] = Math.max(NOISE_FLOOR_WEIGHT, 0.15 + ind.lift * 2);
    } else {
      weights[ind.key] = 0.5; // Neutral / insufficient data
    }
  }
  return weights;
}

/**
 * Compute a weighted consensus score using soft indicator weights.
 * Noise indicators contribute near-zero weight instead of being excluded.
 * Returns a weighted directional score and metadata.
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
