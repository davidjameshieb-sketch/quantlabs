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
} from './types';
import { getMarketData } from './dataGenerator';

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
  const convictionStr = conviction === 'gaining' ? 'strengthening' : 'weakening';
  
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
  
  return {
    ticker,
    timeframe,
    timestamp: Date.now(),
    currentPrice,
    trendCore,
    efficiency,
    bias,
    conviction,
    confidencePercent,
    macroStrength,
    strategyState,
    narrative,
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
  
  return {
    ticker,
    timestamp: Date.now(),
    analyses,
    aggregatedScore,
    dominantBias,
    alignmentLevel,
  };
};
