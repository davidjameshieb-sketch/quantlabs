// ─── Short Stop Geometry Engine ───
// Separate stop logic from the long engine's lossShrinker.
// Phase A (entry → N candles): No shrink. Let snapback happen.
// Phase B (MFE >= X × initialRisk): Activate trailing stop.
//
// Initial stop = max(k*ATR(5), spread*mult, recentSwingHigh + buffer)

import type { ShortStopConfig, ShortRegime } from './shortTypes';
import { DEFAULT_SHORT_STOP_CONFIG } from './shortTypes';

export interface ShortStopLevel {
  /** Initial stop distance in price units */
  initialStopDistance: number;
  /** Which component set the stop (ATR, spread, or swing) */
  stopSource: 'atr' | 'spread' | 'swing';
  /** Number of candles before trailing activates */
  noShrinkCandles: number;
  /** MFE multiple required to start trailing */
  trailActivationThreshold: number;
  /** Whether the trade is in Phase A (no shrink) or Phase B (trailing) */
  currentPhase: 'A' | 'B';
}

/**
 * Compute the initial stop distance for a short trade.
 * Takes the MAX of three components to ensure adequate room for snapbacks.
 */
export function computeShortInitialStop(
  atr5: number,
  currentSpread: number,
  recentSwingHigh: number,
  entryPrice: number,
  config: Partial<ShortStopConfig> = {},
): ShortStopLevel {
  const cfg = { ...DEFAULT_SHORT_STOP_CONFIG, ...config };
  
  const pipScale = entryPrice > 50 ? 0.01 : 0.0001; // JPY pairs vs others
  const bufferPrice = cfg.swingHighBufferPips * pipScale;
  const trailBufferPrice = cfg.trailBufferPips * pipScale;

  // Three stop candidates
  const atrStop = atr5 * cfg.initialStopAtrMultiplier;
  const spreadStop = currentSpread * cfg.initialStopSpreadMultiplier;
  const swingStop = Math.max(0, (recentSwingHigh + bufferPrice) - entryPrice);

  // Take the widest — shorts need room for snapbacks
  let stopDistance: number;
  let stopSource: ShortStopLevel['stopSource'];

  if (atrStop >= spreadStop && atrStop >= swingStop) {
    stopDistance = atrStop;
    stopSource = 'atr';
  } else if (spreadStop >= atrStop && spreadStop >= swingStop) {
    stopDistance = spreadStop;
    stopSource = 'spread';
  } else {
    stopDistance = swingStop;
    stopSource = 'swing';
  }

  // Floor: stop must be at least 2× spread to avoid noise exits
  stopDistance = Math.max(stopDistance, currentSpread * 2);

  return {
    initialStopDistance: stopDistance,
    stopSource,
    noShrinkCandles: cfg.noShrinkCandleCount,
    trailActivationThreshold: cfg.trailActivationMfeMultiple,
    currentPhase: 'A',
  };
}

/**
 * Evaluate whether a short trade should transition from Phase A (no shrink)
 * to Phase B (trailing stop active).
 */
export function evaluateShortStopPhase(
  candlesSinceEntry: number,
  currentMfe: number,
  initialRisk: number,
  config: Partial<ShortStopConfig> = {},
): { phase: 'A' | 'B'; shouldActivateTrail: boolean } {
  const cfg = { ...DEFAULT_SHORT_STOP_CONFIG, ...config };

  // Phase A: no shrink for first N candles
  if (candlesSinceEntry < cfg.noShrinkCandleCount) {
    return { phase: 'A', shouldActivateTrail: false };
  }

  // Phase B: activate trail only if MFE >= threshold × initial risk
  const mfeMultiple = initialRisk > 0 ? currentMfe / initialRisk : 0;
  const shouldActivate = mfeMultiple >= cfg.trailActivationMfeMultiple;

  return {
    phase: shouldActivate ? 'B' : 'A',
    shouldActivateTrail: shouldActivate,
  };
}

/**
 * Compute trailing stop level for Phase B.
 * Trail uses last N-bar high + buffer (for shorts, trail is above price).
 */
export function computeShortTrailingStop(
  recentHighs: number[],
  config: Partial<ShortStopConfig> = {},
): number {
  const cfg = { ...DEFAULT_SHORT_STOP_CONFIG, ...config };

  if (recentHighs.length === 0) return 0;

  // Take last N bars
  const lookback = recentHighs.slice(-cfg.trailStructureBars);
  const structureHigh = Math.max(...lookback);

  // For JPY pairs, pip scale is different — but we return price level
  // Buffer is added by the caller who knows the pip scale
  const pipScale = structureHigh > 50 ? 0.01 : 0.0001;
  const buffer = cfg.trailBufferPips * pipScale;

  return structureHigh + buffer;
}

/**
 * Regime-specific stop adjustments.
 * Different short regimes need different stop widths.
 */
export function getRegimeStopAdjustment(regime: ShortRegime): {
  atrMultiplierOverride: number | null;
  noShrinkOverride: number | null;
  mfeThresholdOverride: number | null;
} {
  switch (regime) {
    case 'shock-breakdown':
      // Fast move — tighter initial stop OK, trail activates quickly
      return { atrMultiplierOverride: 1.2, noShrinkOverride: 3, mfeThresholdOverride: 1.0 };
    case 'risk-off-impulse':
      // Broader move — standard stops
      return { atrMultiplierOverride: null, noShrinkOverride: null, mfeThresholdOverride: null };
    case 'liquidity-vacuum':
      // Wide spreads — need more room
      return { atrMultiplierOverride: 2.0, noShrinkOverride: 8, mfeThresholdOverride: 1.5 };
    case 'breakdown-continuation':
      // Second leg — moderate stops
      return { atrMultiplierOverride: 1.3, noShrinkOverride: 4, mfeThresholdOverride: 1.1 };
    default:
      return { atrMultiplierOverride: null, noShrinkOverride: null, mfeThresholdOverride: null };
  }
}
