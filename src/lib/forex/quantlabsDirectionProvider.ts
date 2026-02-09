// QuantLabs Directional Bias Provider
// Retrieves directional signals from the QuantLabs analysis engine.
// This module supplies ONLY direction — governance determines WHEN to trade.
// QuantLabs NEVER overrides governance rejection.
//
// FIX #5: Deterministic timeframe policy
// Direction source: 1h bias (fallback 4h if 1h missing)
// Confirmation: requested timeframe efficiency/confidence
// Logged: directionTimeframeUsed + confirmationTimeframeUsed

import type { Timeframe, BiasDirection } from '@/lib/market/types';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { findForexTicker } from '@/lib/market/tickers';
import { toDisplaySymbol } from './forexSymbolMap';

// ─── Output Types ───

export type DirectionalBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface QuantLabsDirectionResult {
  directionalBias: DirectionalBias;
  directionalConfidence: number; // 0..1
  sourceSignals: QuantLabsSignalSnapshot;
  directionTimeframeUsed: string;
  confirmationTimeframeUsed: string;
}

export interface QuantLabsSignalSnapshot {
  trendCoreBias: BiasDirection | null;
  efficiencyScore: number;
  efficiencyVerdict: string;
  confidencePercent: number;
  mtfAlignmentScore: number;
  mtfAlignmentState: string;
  macroStrength: string;
  strategyState: string;
  conviction: string;
  dominantBias: BiasDirection;
}

// ─── Bias Mapping ───

function mapBiasToDirection(
  bias: BiasDirection,
  confidence: number,
  efficiencyScore: number,
  alignmentState: string,
): { direction: DirectionalBias; adjustedConfidence: number } {
  if (confidence < 35) {
    return { direction: 'NEUTRAL', adjustedConfidence: confidence / 100 };
  }
  if (efficiencyScore < 0.25) {
    return { direction: 'NEUTRAL', adjustedConfidence: Math.min(confidence / 100, 0.3) };
  }
  if (alignmentState === 'conflicting') {
    return { direction: 'NEUTRAL', adjustedConfidence: Math.min(confidence / 100, 0.35) };
  }

  const baseConfidence = confidence / 100;
  const efficiencyBoost = efficiencyScore > 0.6 ? 0.1 : 0;
  const alignmentBoost = alignmentState === 'fully-aligned' ? 0.1 : alignmentState === 'partially-aligned' ? 0.05 : 0;
  const adjustedConfidence = Math.min(1.0, baseConfidence + efficiencyBoost + alignmentBoost);

  return {
    direction: bias === 'bullish' ? 'LONG' : 'SHORT',
    adjustedConfidence,
  };
}

// ─── Main Provider (Fix #5: Deterministic Timeframe Policy) ───

export function getQuantLabsDirection(
  symbol: string,
  requestedTimeframe: Timeframe = '15m',
): QuantLabsDirectionResult | null {
  try {
    const displayPair = toDisplaySymbol(symbol);
    const ticker = findForexTicker(symbol);

    if (!ticker) {
      return null; // Failsafe: signal unavailable → SKIP
    }

    // Always analyze a fixed set of timeframes for consistency
    const mtfAnalysis = analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);

    // ── Deterministic direction source: 1h bias, fallback 4h ──
    let directionTimeframeUsed: string;
    const directionSource = mtfAnalysis.analyses['1h'] ?? mtfAnalysis.analyses['4h'] ?? null;

    if (mtfAnalysis.analyses['1h']) {
      directionTimeframeUsed = '1h';
    } else if (mtfAnalysis.analyses['4h']) {
      directionTimeframeUsed = '4h';
    } else {
      return null; // No direction source available
    }

    if (!directionSource) {
      return null;
    }

    // ── Confirmation: use requested timeframe, fallback 1h ──
    const confirmationTimeframeUsed = mtfAnalysis.analyses[requestedTimeframe]
      ? requestedTimeframe
      : '1h';
    const confirmationTf = mtfAnalysis.analyses[confirmationTimeframeUsed] ?? directionSource;

    // Direction from dominant bias, confirmation from requested timeframe
    const { direction, adjustedConfidence } = mapBiasToDirection(
      mtfAnalysis.dominantBias,
      confirmationTf.confidencePercent,
      confirmationTf.efficiency.score,
      mtfAnalysis.mtfAlignmentState || mtfAnalysis.alignmentLevel,
    );

    const snapshot: QuantLabsSignalSnapshot = {
      trendCoreBias: directionSource.bias,
      efficiencyScore: confirmationTf.efficiency.score,
      efficiencyVerdict: confirmationTf.efficiency.verdict,
      confidencePercent: confirmationTf.confidencePercent,
      mtfAlignmentScore: mtfAnalysis.mtfAlignmentScore ?? 0,
      mtfAlignmentState: mtfAnalysis.mtfAlignmentState || mtfAnalysis.alignmentLevel,
      macroStrength: directionSource.macroStrength,
      strategyState: directionSource.strategyState,
      conviction: directionSource.conviction,
      dominantBias: mtfAnalysis.dominantBias,
    };

    return {
      directionalBias: direction,
      directionalConfidence: adjustedConfidence,
      sourceSignals: snapshot,
      directionTimeframeUsed,
      confirmationTimeframeUsed,
    };
  } catch (err) {
    console.error('[QuantLabsDirection] Failed to retrieve directional signal:', err);
    return null;
  }
}
