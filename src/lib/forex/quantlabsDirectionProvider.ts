// QuantLabs Directional Bias Provider
// Retrieves directional signals from the QuantLabs analysis engine.
// This module supplies ONLY direction — governance determines WHEN to trade.
// QuantLabs NEVER overrides governance rejection.

import type { Timeframe, BiasDirection } from '@/lib/market/types';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { getTickersByType } from '@/lib/market/tickers';

// ─── Output Types ───

export type DirectionalBias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface QuantLabsDirectionResult {
  directionalBias: DirectionalBias;
  directionalConfidence: number; // 0..1
  sourceSignals: QuantLabsSignalSnapshot;
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
  // NEUTRAL conditions: low confidence, noisy efficiency, or conflicting alignment
  if (confidence < 35) {
    return { direction: 'NEUTRAL', adjustedConfidence: confidence / 100 };
  }
  if (efficiencyScore < 0.25) {
    return { direction: 'NEUTRAL', adjustedConfidence: Math.min(confidence / 100, 0.3) };
  }
  if (alignmentState === 'conflicting') {
    return { direction: 'NEUTRAL', adjustedConfidence: Math.min(confidence / 100, 0.35) };
  }

  // Directional bias with confidence scaling
  const baseConfidence = confidence / 100;
  const efficiencyBoost = efficiencyScore > 0.6 ? 0.1 : 0;
  const alignmentBoost = alignmentState === 'fully-aligned' ? 0.1 : alignmentState === 'partially-aligned' ? 0.05 : 0;
  const adjustedConfidence = Math.min(1.0, baseConfidence + efficiencyBoost + alignmentBoost);

  return {
    direction: bias === 'bullish' ? 'LONG' : 'SHORT',
    adjustedConfidence,
  };
}

// ─── Main Provider ───

export function getQuantLabsDirection(
  symbol: string,
  _timeframe: Timeframe = '15m',
): QuantLabsDirectionResult | null {
  try {
    const displayPair = symbol.includes('/') ? symbol : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    const ticker = getTickersByType('forex').find(t => t.symbol === displayPair);

    if (!ticker) {
      return null; // Failsafe: signal unavailable → SKIP
    }

    const mtfAnalysis = analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);
    const primaryTf = mtfAnalysis.analyses['1h'] || mtfAnalysis.analyses['15m'];

    if (!primaryTf) {
      return null; // Failsafe: no analysis available
    }

    const { direction, adjustedConfidence } = mapBiasToDirection(
      mtfAnalysis.dominantBias,
      primaryTf.confidencePercent,
      primaryTf.efficiency.score,
      mtfAnalysis.mtfAlignmentState || mtfAnalysis.alignmentLevel,
    );

    const snapshot: QuantLabsSignalSnapshot = {
      trendCoreBias: primaryTf.bias,
      efficiencyScore: primaryTf.efficiency.score,
      efficiencyVerdict: primaryTf.efficiency.verdict,
      confidencePercent: primaryTf.confidencePercent,
      mtfAlignmentScore: mtfAnalysis.mtfAlignmentScore ?? 0,
      mtfAlignmentState: mtfAnalysis.mtfAlignmentState || mtfAnalysis.alignmentLevel,
      macroStrength: primaryTf.macroStrength,
      strategyState: primaryTf.strategyState,
      conviction: primaryTf.conviction,
      dominantBias: mtfAnalysis.dominantBias,
    };

    return {
      directionalBias: direction,
      directionalConfidence: adjustedConfidence,
      sourceSignals: snapshot,
    };
  } catch (err) {
    console.error('[QuantLabsDirection] Failed to retrieve directional signal:', err);
    return null; // Failsafe: signal retrieval failure → SKIP
  }
}
