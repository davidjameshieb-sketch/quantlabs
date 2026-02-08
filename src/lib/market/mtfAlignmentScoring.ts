// MTF Alignment Scoring Algorithm
// Extends existing multi-timeframe analysis with hierarchical alignment intelligence

import { AnalysisResult, Timeframe, BiasDirection } from '@/lib/market/types';
import { TimeframeLayer, TIMEFRAME_TO_LAYER, TimeframeAlignmentState } from '@/lib/agents/mtfTypes';

export interface TimeframeAlignmentScore {
  overallScore: number;                        // 0-100
  state: TimeframeAlignmentState;
  layerScores: Record<TimeframeLayer, number>; // 0-100 per layer
  directionalAgreement: number;                // 0-1
  momentumCoherence: number;                   // 0-1
  efficiencySync: number;                      // 0-1
  dominantLayer: TimeframeLayer;
  conflictCount: number;
  description: string;
}

/**
 * Compute hierarchical alignment from multi-timeframe analysis results.
 * Groups analyses by HTF/MTF/LTF and scores agreement.
 */
export const computeAlignmentFromAnalyses = (
  analyses: Record<Timeframe, AnalysisResult>
): TimeframeAlignmentScore => {
  const layers: Record<TimeframeLayer, AnalysisResult[]> = { HTF: [], MTF: [], LTF: [] };

  Object.entries(analyses).forEach(([tf, result]) => {
    const layer = TIMEFRAME_TO_LAYER[tf as Timeframe];
    if (layer) layers[layer].push(result);
  });

  // Layer-level bias consensus
  const getLayerBias = (results: AnalysisResult[]): { bias: BiasDirection; confidence: number; efficiency: number } => {
    if (results.length === 0) return { bias: 'bullish', confidence: 0, efficiency: 0 };
    const bullish = results.filter(r => r.bias === 'bullish').length;
    const bias: BiasDirection = bullish >= results.length / 2 ? 'bullish' : 'bearish';
    const avgConf = results.reduce((s, r) => s + r.confidencePercent, 0) / results.length;
    const avgEff = results.reduce((s, r) => s + r.efficiency.score, 0) / results.length;
    return { bias, confidence: avgConf, efficiency: avgEff };
  };

  const htfSummary = getLayerBias(layers.HTF);
  const mtfSummary = getLayerBias(layers.MTF);
  const ltfSummary = getLayerBias(layers.LTF);

  // Directional agreement
  const allBiases = [htfSummary.bias, mtfSummary.bias, ltfSummary.bias].filter(
    (_, i) => [layers.HTF, layers.MTF, layers.LTF][i].length > 0
  );
  const dominantBias = allBiases.filter(b => b === 'bullish').length >= allBiases.length / 2 ? 'bullish' : 'bearish';
  const directionalAgreement = allBiases.filter(b => b === dominantBias).length / Math.max(1, allBiases.length);

  // Momentum coherence (based on confidence spread)
  const confidences = [htfSummary.confidence, mtfSummary.confidence, ltfSummary.confidence].filter(
    (_, i) => [layers.HTF, layers.MTF, layers.LTF][i].length > 0
  );
  const confRange = confidences.length > 1 ? Math.max(...confidences) - Math.min(...confidences) : 0;
  const momentumCoherence = Math.max(0, 1 - confRange / 100);

  // Efficiency sync
  const efficiencies = [htfSummary.efficiency, mtfSummary.efficiency, ltfSummary.efficiency].filter(
    (_, i) => [layers.HTF, layers.MTF, layers.LTF][i].length > 0
  );
  const effRange = efficiencies.length > 1 ? Math.max(...efficiencies) - Math.min(...efficiencies) : 0;
  const efficiencySync = Math.max(0, 1 - effRange);

  // Layer scores
  const layerScores: Record<TimeframeLayer, number> = {
    HTF: htfSummary.confidence * (htfSummary.efficiency > 0.3 ? 1 : 0.7),
    MTF: mtfSummary.confidence * (mtfSummary.efficiency > 0.3 ? 1 : 0.7),
    LTF: ltfSummary.confidence * (ltfSummary.efficiency > 0.3 ? 1 : 0.7),
  };

  // Overall score
  const overallScore = Math.round(
    directionalAgreement * 40 +
    momentumCoherence * 30 +
    efficiencySync * 30
  );

  // Conflict count
  let conflictCount = 0;
  if (layers.HTF.length > 0 && layers.MTF.length > 0 && htfSummary.bias !== mtfSummary.bias) conflictCount++;
  if (layers.MTF.length > 0 && layers.LTF.length > 0 && mtfSummary.bias !== ltfSummary.bias) conflictCount++;
  if (Math.abs(htfSummary.efficiency - ltfSummary.efficiency) > 0.4) conflictCount++;

  // State
  let state: TimeframeAlignmentState;
  if (overallScore > 75) state = 'fully-aligned';
  else if (overallScore > 55) state = 'partially-aligned';
  else if (conflictCount >= 2) state = 'diverging';
  else state = 'conflicting';

  // Dominant layer
  const dominant: TimeframeLayer = htfSummary.confidence > 70 ? 'HTF' :
    mtfSummary.confidence > 60 ? 'MTF' : 'LTF';

  // Description
  const stateDescriptions: Record<TimeframeAlignmentState, string> = {
    'fully-aligned': `All timeframe layers ${dominantBias} with ${overallScore}% alignment — optimal conditions for trend continuation`,
    'partially-aligned': `Majority ${dominantBias} but ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} detected — proceed with caution`,
    'conflicting': `Timeframe signals are mixed — ${dominant} layer is dominant but lower frames show divergence`,
    'diverging': `Critical divergence across timeframes — defensive positioning recommended`,
  };

  return {
    overallScore,
    state,
    layerScores,
    directionalAgreement,
    momentumCoherence,
    efficiencySync,
    dominantLayer: dominant,
    conflictCount,
    description: stateDescriptions[state],
  };
};
