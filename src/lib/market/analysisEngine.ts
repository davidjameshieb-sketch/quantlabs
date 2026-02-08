import {
  OHLC,
  TickerInfo,
  Timeframe,
  AnalysisResult,
  BiasDirection,
  EfficiencyVerdict,
  ConvictionState,
  MacroStrength,
  StrategyState,
  TrendCore,
  EfficiencyMetrics,
  MultiTimeframeAnalysis,
  SignalStates,
} from './types';
import { getMarketData } from './dataGenerator';
import { computeAlignmentFromAnalyses } from './mtfAlignmentScoring';

// Calculate True Range
const calculateTR = (current: OHLC, previous: OHLC): number => {
  const hl = current.high - current.low;
  const hpc = Math.abs(current.high - previous.close);
  const lpc = Math.abs(current.low - previous.close);
  return Math.max(hl, hpc, lpc);
};

// Calculate ATR (Average True Range)
const calculateATR = (data: OHLC[], period: number = 14): number => {
  if (data.length < period + 1) return 0;
  
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += calculateTR(data[data.length - i], data[data.length - i - 1]);
  }
  return atr / period;
};

// Rational Quadratic Kernel for smoothing
const rationalQuadraticKernel = (data: OHLC[], lookback: number, relativeWeight: number = 1): number => {
  if (data.length < lookback) return data[data.length - 1]?.close || 0;
  
  let sum = 0;
  let weightSum = 0;
  
  for (let i = 0; i < lookback; i++) {
    const idx = data.length - 1 - i;
    if (idx < 0) break;
    
    const weight = Math.pow(1 + (i * i) / (2 * relativeWeight * lookback * lookback), -relativeWeight);
    sum += data[idx].close * weight;
    weightSum += weight;
  }
  
  return weightSum > 0 ? sum / weightSum : data[data.length - 1]?.close || 0;
};

// Calculate Efficiency Score
const calculateEfficiency = (data: OHLC[], lookback: number = 3): EfficiencyMetrics => {
  if (data.length < lookback + 1) {
    return { score: 0, netMove: 0, pathNoise: 0, verdict: 'noisy' };
  }
  
  const currentClose = data[data.length - 1].close;
  const pastClose = data[data.length - 1 - lookback].close;
  
  const netMove = Math.abs(currentClose - pastClose);
  
  let pathNoise = 0;
  for (let i = 0; i < lookback; i++) {
    const idx = data.length - 1 - i;
    if (idx > 0) {
      pathNoise += calculateTR(data[idx], data[idx - 1]);
    }
  }
  
  const score = pathNoise > 0 ? netMove / pathNoise : 0;
  
  let verdict: EfficiencyVerdict;
  if (score > 0.6) verdict = 'clean';
  else if (score < 0.3) verdict = 'noisy';
  else verdict = 'mixed';
  
  return { score, netMove, pathNoise, verdict };
};

// Calculate Neural Trend Cores
const calculateTrendCores = (data: OHLC[], previousSpread?: number): TrendCore => {
  const fastCore = rationalQuadraticKernel(data, 8, 0.5);
  const slowCore = rationalQuadraticKernel(data, 21, 1.5);
  const spread = Math.abs(fastCore - slowCore);
  const spreadDelta = previousSpread !== undefined ? spread - previousSpread : 0;
  
  return { fastCore, slowCore, spread, spreadDelta };
};

// Determine bias direction
const determineBias = (trendCore: TrendCore): BiasDirection => {
  return trendCore.fastCore > trendCore.slowCore ? 'bullish' : 'bearish';
};

// Determine conviction state
const determineConviction = (trendCore: TrendCore): ConvictionState => {
  return trendCore.spreadDelta > 0 ? 'gaining' : 'losing';
};

// Calculate confidence percentage
const calculateConfidence = (trendCore: TrendCore, atr: number): number => {
  if (atr === 0) return 0;
  return Math.min((trendCore.spread / atr) * 100, 100);
};

// Determine macro strength
const determineMacroStrength = (confidence: number): MacroStrength => {
  if (confidence > 80) return 'strong';
  if (confidence < 40) return 'weak';
  return 'moderate';
};

// Determine strategy state
const determineStrategyState = (
  efficiency: EfficiencyMetrics,
  macroStrength: MacroStrength
): StrategyState => {
  if (macroStrength === 'strong') {
    if (efficiency.verdict === 'clean') return 'pressing';
    if (efficiency.verdict === 'noisy') return 'holding';
    return 'tracking';
  }
  
  if (efficiency.verdict === 'noisy') return 'avoiding';
  return 'watching';
};

// Generate efficiency reason
const generateEfficiencyReason = (efficiency: EfficiencyMetrics): string => {
  const scorePercent = (efficiency.score * 100).toFixed(0);
  const netMoveStr = efficiency.netMove.toFixed(4);
  const pathNoiseStr = efficiency.pathNoise.toFixed(4);
  
  if (efficiency.verdict === 'clean') {
    return `Price traveled ${netMoveStr} with only ${pathNoiseStr} deviation. Direct movement indicates strong directional conviction.`;
  } else if (efficiency.verdict === 'noisy') {
    return `High path noise (${pathNoiseStr}) relative to net movement (${netMoveStr}). Choppy conditions - structure unclear.`;
  }
  return `Movement efficiency at ${scorePercent}%. Some noise present but trend structure remains visible.`;
};

// Generate confidence reason
const generateConfidenceReason = (trendCore: TrendCore, atr: number, confidence: number): string => {
  const spreadStr = trendCore.spread.toFixed(4);
  const atrStr = atr.toFixed(4);
  const multiplier = atr > 0 ? (trendCore.spread / atr).toFixed(1) : '0';
  
  if (confidence > 80) {
    return `Trend cores separated by ${spreadStr}, which is ${multiplier}x the average volatility. Strong structural divergence.`;
  } else if (confidence < 40) {
    return `Trend cores are compressed (${spreadStr}) within normal volatility range (ATR: ${atrStr}). No clear directional commitment.`;
  }
  return `Core separation (${spreadStr}) is moderate relative to volatility (ATR: ${atrStr}). Developing structure.`;
};

// Generate strategy reason
const generateStrategyReason = (strategyState: StrategyState, macroStrength: MacroStrength, efficiency: EfficiencyMetrics): string => {
  const reasons: Record<StrategyState, string> = {
    pressing: 'Optimal conditions. Clear structure with efficient price action. Favorable for trend-following approaches.',
    tracking: 'Good structure but some noise. Standard trend-following with measured position sizing.',
    holding: 'Strong bias but choppy execution. Wait for cleaner price action before adding.',
    watching: 'Developing conditions. Monitor for setup formation before committing.',
    avoiding: 'Chop zone. No clear edge - structure unclear and efficiency too low.',
  };
  return reasons[strategyState];
};

// Calculate signal states for toggles
const calculateSignalStates = (
  trendCore: TrendCore,
  efficiency: EfficiencyMetrics,
  confidence: number,
  atr: number
): SignalStates => {
  const coreSpreadNormalized = atr > 0 ? trendCore.spread / atr : 0;
  
  return {
    trendActive: coreSpreadNormalized > 0.5,
    cleanFlow: efficiency.score > 0.6,
    highConviction: confidence > 70,
    structureGaining: trendCore.spreadDelta > 0,
    volatilityExpanding: false, // Would need historical ATR comparison
    trendingMode: efficiency.score >= 0.3,
  };
};

// Generate narrative
const generateNarrative = (
  bias: BiasDirection,
  efficiency: EfficiencyMetrics,
  conviction: ConvictionState,
  macroStrength: MacroStrength,
  strategyState: StrategyState,
  confidencePercent: number
): string => {
  const biasStr = bias.toUpperCase();
  const strengthStr = macroStrength.toUpperCase();
  const effStr = efficiency.verdict.toUpperCase();
  const strategyStr = strategyState.toUpperCase();
  
  const parts: string[] = [];
  
  // Main structure statement
  if (macroStrength === 'strong') {
    parts.push(`${strengthStr} ${biasStr} STRUCTURE`);
  } else if (macroStrength === 'moderate') {
    parts.push(`${biasStr} TREND developing`);
  } else {
    parts.push(`WEAK ${biasStr} bias`);
  }
  
  // Efficiency context
  parts.push(`with ${effStr} EFFICIENCY`);
  
  // Strategy conclusion
  parts.push(`— ${strategyStr}`);
  
  // Additional context
  const context: string[] = [];
  if (confidencePercent > 70) {
    context.push(`High confidence at ${confidencePercent.toFixed(0)}%`);
  }
  if (conviction === 'gaining' && macroStrength !== 'weak') {
    context.push('Structure is strengthening');
  } else if (conviction === 'losing' && macroStrength === 'strong') {
    context.push('Watch for potential exhaustion');
  }
  
  let narrative = parts.join(' ');
  if (context.length > 0) {
    narrative += `. ${context.join('. ')}.`;
  }
  
  return narrative;
};

// Main analysis function
export const analyzeMarket = (
  ticker: TickerInfo,
  timeframe: Timeframe,
  previousSpread?: number
): AnalysisResult => {
  const data = getMarketData(ticker, timeframe, 100);
  const currentPrice = data[data.length - 1]?.close || 0;
  
  const efficiency = calculateEfficiency(data, 3);
  const trendCore = calculateTrendCores(data, previousSpread);
  const atr = calculateATR(data, 14);
  
  const bias = determineBias(trendCore);
  const conviction = determineConviction(trendCore);
  const confidencePercent = calculateConfidence(trendCore, atr);
  const macroStrength = determineMacroStrength(confidencePercent);
  const strategyState = determineStrategyState(efficiency, macroStrength);
  
  const narrative = generateNarrative(
    bias,
    efficiency,
    conviction,
    macroStrength,
    strategyState,
    confidencePercent
  );
  
  // Generate AI reasoning
  const efficiencyReason = generateEfficiencyReason(efficiency);
  const confidenceReason = generateConfidenceReason(trendCore, atr, confidencePercent);
  const strategyReason = generateStrategyReason(strategyState, macroStrength, efficiency);
  
  // Calculate signal states
  const signals = calculateSignalStates(trendCore, efficiency, confidencePercent, atr);
  
  return {
    ticker,
    timeframe,
    timestamp: Date.now(),
    currentPrice,
    trendCore,
    efficiency,
    atr,
    bias,
    conviction,
    confidencePercent,
    macroStrength,
    strategyState,
    narrative,
    efficiencyReason,
    confidenceReason,
    strategyReason,
    signals,
  };
};

// Multi-timeframe analysis
export const analyzeMultiTimeframe = (
  ticker: TickerInfo,
  timeframes: Timeframe[] = ['15m', '1h', '4h', '1d']
): MultiTimeframeAnalysis => {
  const analyses: Record<Timeframe, AnalysisResult> = {} as Record<Timeframe, AnalysisResult>;
  
  timeframes.forEach(tf => {
    analyses[tf] = analyzeMarket(ticker, tf);
  });
  
  // Calculate aggregated score
  const timeframeWeights: Record<Timeframe, number> = {
    '1m': 0.5,
    '5m': 0.75,
    '15m': 1,
    '1h': 1.5,
    '4h': 2,
    '1d': 3,
    '1w': 4,
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  timeframes.forEach(tf => {
    const analysis = analyses[tf];
    const direction = analysis.bias === 'bullish' ? 1 : -1;
    const strengthWeight = analysis.confidencePercent / 100;
    const qualityWeight = analysis.efficiency.score;
    const tfWeight = timeframeWeights[tf] || 1;
    
    totalScore += direction * strengthWeight * qualityWeight * tfWeight;
    totalWeight += tfWeight;
  });
  
  const aggregatedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const dominantBias: BiasDirection = aggregatedScore >= 0 ? 'bullish' : 'bearish';
  
  // Determine alignment
  const bullishCount = timeframes.filter(tf => analyses[tf].bias === 'bullish').length;
  const alignmentRatio = bullishCount / timeframes.length;
  
  let alignmentLevel: 'aligned' | 'mixed' | 'conflicting';
  if (alignmentRatio >= 0.8 || alignmentRatio <= 0.2) {
    alignmentLevel = 'aligned';
  } else if (alignmentRatio >= 0.4 && alignmentRatio <= 0.6) {
    alignmentLevel = 'conflicting';
  } else {
    alignmentLevel = 'mixed';
  }
  
  // Compute MTF hierarchical alignment
  const mtfAlignment = computeAlignmentFromAnalyses(analyses);

  return {
    ticker,
    timestamp: Date.now(),
    analyses,
    aggregatedScore,
    dominantBias,
    alignmentLevel,
    mtfAlignmentScore: mtfAlignment.overallScore,
    mtfAlignmentState: mtfAlignment.state,
    mtfDominantLayer: mtfAlignment.dominantLayer,
  };
};
