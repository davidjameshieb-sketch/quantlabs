// Historical Condition Outcomes Engine
// Computes forward returns, win rates, MFE/MAE for condition labels

import { OHLC, TickerInfo, Timeframe, StrategyState, EfficiencyVerdict } from './types';
import { getMarketData } from './dataGenerator';
import { analyzeMarket } from './analysisEngine';

export type ConditionLabel = 
  | 'high-conviction-bullish'
  | 'high-conviction-bearish'
  | 'mixed'
  | 'noisy-avoid'
  | 'compression-breakout-imminent';

export interface ForwardReturn {
  horizon: number; // bars forward
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  sampleSize: number;
  percentile25: number;
  percentile75: number;
}

export interface OutcomeMetrics {
  conditionLabel: ConditionLabel;
  forwardReturns: ForwardReturn[];
  avgMFE: number; // Max Favorable Excursion
  avgMAE: number; // Max Adverse Excursion
  conditionFlipRate: number; // How often the condition changes
  avgDuration: number; // Average bars the condition persists
  confidenceWeight: number; // 0-1 based on sample size
}

export interface TickerOutcomes {
  symbol: string;
  outcomes: Record<ConditionLabel, OutcomeMetrics>;
  lastUpdated: number;
  sampleDepth: number; // Total bars analyzed
}

export interface AggregateOutcomes {
  groupType: 'sector' | 'industry' | 'market';
  groupName: string;
  outcomes: Record<ConditionLabel, OutcomeMetrics>;
  tickerCount: number;
  topPerformers: string[];
  worstPerformers: string[];
}

// Default horizons for forward return calculation
export const DEFAULT_HORIZONS = [1, 3, 5, 10, 20];

// Map analysis result to condition label
export const getConditionLabel = (
  confidence: number,
  efficiency: EfficiencyVerdict,
  bias: 'bullish' | 'bearish',
  strategyState: StrategyState
): ConditionLabel => {
  // High conviction (confidence > 70% with clean/mixed efficiency)
  if (confidence > 70 && efficiency !== 'noisy') {
    return bias === 'bullish' ? 'high-conviction-bullish' : 'high-conviction-bearish';
  }
  
  // Noisy / avoid zone
  if (efficiency === 'noisy' || strategyState === 'avoiding') {
    return 'noisy-avoid';
  }
  
  // Compression / waiting
  if (strategyState === 'watching' && confidence < 40) {
    return 'compression-breakout-imminent';
  }
  
  // Mixed conditions
  return 'mixed';
};

// Calculate percentile from sorted array
const percentile = (arr: number[], p: number): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
};

// Calculate forward returns for a given horizon
const calculateForwardReturn = (
  data: OHLC[],
  entryIndex: number,
  horizon: number
): { return: number; mfe: number; mae: number } | null => {
  if (entryIndex + horizon >= data.length) return null;
  
  const entryPrice = data[entryIndex].close;
  let mfe = 0;
  let mae = 0;
  
  for (let i = 1; i <= horizon; i++) {
    const idx = entryIndex + i;
    if (idx >= data.length) break;
    
    const bar = data[idx];
    const highReturn = (bar.high - entryPrice) / entryPrice;
    const lowReturn = (bar.low - entryPrice) / entryPrice;
    
    mfe = Math.max(mfe, highReturn);
    mae = Math.min(mae, lowReturn);
  }
  
  const exitPrice = data[entryIndex + horizon].close;
  const returnPct = (exitPrice - entryPrice) / entryPrice;
  
  return { return: returnPct, mfe, mae: Math.abs(mae) };
};

// Compute outcomes for a single ticker
export const computeTickerOutcomes = (
  ticker: TickerInfo,
  timeframe: Timeframe = '1h',
  barCount: number = 500,
  horizons: number[] = DEFAULT_HORIZONS
): TickerOutcomes => {
  const data = getMarketData(ticker, timeframe, barCount);
  
  // Track condition occurrences
  const conditionOccurrences: Record<ConditionLabel, {
    indices: number[];
    returns: Record<number, number[]>;
    mfes: number[];
    maes: number[];
    durations: number[];
  }> = {
    'high-conviction-bullish': { indices: [], returns: {}, mfes: [], maes: [], durations: [] },
    'high-conviction-bearish': { indices: [], returns: {}, mfes: [], maes: [], durations: [] },
    'mixed': { indices: [], returns: {}, mfes: [], maes: [], durations: [] },
    'noisy-avoid': { indices: [], returns: {}, mfes: [], maes: [], durations: [] },
    'compression-breakout-imminent': { indices: [], returns: {}, mfes: [], maes: [], durations: [] },
  };
  
  // Initialize returns arrays for each horizon
  Object.keys(conditionOccurrences).forEach(label => {
    horizons.forEach(h => {
      conditionOccurrences[label as ConditionLabel].returns[h] = [];
    });
  });
  
  // Analyze each bar to find condition occurrences
  let prevLabel: ConditionLabel | null = null;
  let conditionStartIdx = 0;
  let conditionFlips = 0;
  
  for (let i = 50; i < data.length - Math.max(...horizons); i++) {
    // Simulate getting analysis at this point
    const slicedData = data.slice(0, i + 1);
    const mockTicker = { ...ticker };
    
    // Get analysis for this bar (simplified - using random based on bar data)
    const barVolatility = (data[i].high - data[i].low) / data[i].close;
    const trendStrength = Math.abs(data[i].close - data[Math.max(0, i - 20)]?.close || data[i].close) / data[i].close;
    
    // Determine condition based on simulated metrics
    const confidence = Math.min(100, trendStrength * 1000 + Math.random() * 30);
    const efficiency: EfficiencyVerdict = barVolatility > 0.03 ? 'noisy' : barVolatility < 0.01 ? 'clean' : 'mixed';
    const bias = data[i].close > (data[i - 10]?.close || data[i].close) ? 'bullish' : 'bearish';
    const strategyState: StrategyState = confidence > 70 && efficiency === 'clean' ? 'pressing' : 
                                          confidence < 40 ? 'watching' : 
                                          efficiency === 'noisy' ? 'avoiding' : 'tracking';
    
    const label = getConditionLabel(confidence, efficiency, bias, strategyState);
    
    // Track condition flips
    if (prevLabel !== null && prevLabel !== label) {
      conditionFlips++;
      const duration = i - conditionStartIdx;
      if (prevLabel) {
        conditionOccurrences[prevLabel].durations.push(duration);
      }
      conditionStartIdx = i;
    }
    prevLabel = label;
    
    conditionOccurrences[label].indices.push(i);
    
    // Calculate forward returns for each horizon
    horizons.forEach(horizon => {
      const result = calculateForwardReturn(data, i, horizon);
      if (result) {
        conditionOccurrences[label].returns[horizon].push(result.return);
        conditionOccurrences[label].mfes.push(result.mfe);
        conditionOccurrences[label].maes.push(result.mae);
      }
    });
  }
  
  // Build outcome metrics
  const outcomes: Record<ConditionLabel, OutcomeMetrics> = {} as Record<ConditionLabel, OutcomeMetrics>;
  
  (Object.keys(conditionOccurrences) as ConditionLabel[]).forEach(label => {
    const occ = conditionOccurrences[label];
    
    const forwardReturns: ForwardReturn[] = horizons.map(horizon => {
      const returns = occ.returns[horizon];
      const sorted = [...returns].sort((a, b) => a - b);
      
      return {
        horizon,
        avgReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
        medianReturn: returns.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
        winRate: returns.length > 0 ? returns.filter(r => r > 0).length / returns.length : 0,
        sampleSize: returns.length,
        percentile25: percentile(returns, 25),
        percentile75: percentile(returns, 75),
      };
    });
    
    const avgMFE = occ.mfes.length > 0 ? occ.mfes.reduce((a, b) => a + b, 0) / occ.mfes.length : 0;
    const avgMAE = occ.maes.length > 0 ? occ.maes.reduce((a, b) => a + b, 0) / occ.maes.length : 0;
    const avgDuration = occ.durations.length > 0 ? occ.durations.reduce((a, b) => a + b, 0) / occ.durations.length : 0;
    
    // Calculate confidence weight based on sample size
    const totalSamples = forwardReturns.reduce((sum, fr) => sum + fr.sampleSize, 0);
    const confidenceWeight = Math.min(1, totalSamples / 100); // Full confidence at 100+ samples
    
    outcomes[label] = {
      conditionLabel: label,
      forwardReturns,
      avgMFE,
      avgMAE,
      conditionFlipRate: conditionFlips / (data.length - 50),
      avgDuration,
      confidenceWeight,
    };
  });
  
  return {
    symbol: ticker.symbol,
    outcomes,
    lastUpdated: Date.now(),
    sampleDepth: barCount,
  };
};

// Aggregate outcomes across multiple tickers (for sector/industry views)
export const aggregateOutcomes = (
  tickerOutcomes: TickerOutcomes[],
  groupType: 'sector' | 'industry' | 'market',
  groupName: string
): AggregateOutcomes => {
  const conditionLabels: ConditionLabel[] = [
    'high-conviction-bullish',
    'high-conviction-bearish',
    'mixed',
    'noisy-avoid',
    'compression-breakout-imminent',
  ];
  
  const aggregated: Record<ConditionLabel, OutcomeMetrics> = {} as Record<ConditionLabel, OutcomeMetrics>;
  
  // Track performance for ranking
  const performanceScores: { symbol: string; score: number }[] = [];
  
  conditionLabels.forEach(label => {
    const allForwardReturns: Record<number, ForwardReturn[]> = {};
    let totalMFE = 0;
    let totalMAE = 0;
    let totalFlipRate = 0;
    let totalDuration = 0;
    let count = 0;
    
    tickerOutcomes.forEach(to => {
      const outcome = to.outcomes[label];
      if (!outcome) return;
      
      outcome.forwardReturns.forEach(fr => {
        if (!allForwardReturns[fr.horizon]) {
          allForwardReturns[fr.horizon] = [];
        }
        allForwardReturns[fr.horizon].push(fr);
      });
      
      totalMFE += outcome.avgMFE;
      totalMAE += outcome.avgMAE;
      totalFlipRate += outcome.conditionFlipRate;
      totalDuration += outcome.avgDuration;
      count++;
      
      // Track performance scores (using 10-day returns as benchmark)
      if (label === 'high-conviction-bullish') {
        const fr10 = outcome.forwardReturns.find(fr => fr.horizon === 10);
        if (fr10) {
          performanceScores.push({ symbol: to.symbol, score: fr10.avgReturn * fr10.winRate });
        }
      }
    });
    
    // Aggregate forward returns by horizon
    const forwardReturns: ForwardReturn[] = Object.entries(allForwardReturns).map(([horizon, frs]) => {
      const h = parseInt(horizon);
      const avgReturn = frs.reduce((sum, fr) => sum + fr.avgReturn * fr.sampleSize, 0) / 
                        Math.max(1, frs.reduce((sum, fr) => sum + fr.sampleSize, 0));
      const avgWinRate = frs.reduce((sum, fr) => sum + fr.winRate * fr.sampleSize, 0) / 
                         Math.max(1, frs.reduce((sum, fr) => sum + fr.sampleSize, 0));
      const totalSamples = frs.reduce((sum, fr) => sum + fr.sampleSize, 0);
      
      return {
        horizon: h,
        avgReturn,
        medianReturn: frs.length > 0 ? frs.reduce((sum, fr) => sum + fr.medianReturn, 0) / frs.length : 0,
        winRate: avgWinRate,
        sampleSize: totalSamples,
        percentile25: frs.length > 0 ? frs.reduce((sum, fr) => sum + fr.percentile25, 0) / frs.length : 0,
        percentile75: frs.length > 0 ? frs.reduce((sum, fr) => sum + fr.percentile75, 0) / frs.length : 0,
      };
    });
    
    aggregated[label] = {
      conditionLabel: label,
      forwardReturns,
      avgMFE: count > 0 ? totalMFE / count : 0,
      avgMAE: count > 0 ? totalMAE / count : 0,
      conditionFlipRate: count > 0 ? totalFlipRate / count : 0,
      avgDuration: count > 0 ? totalDuration / count : 0,
      confidenceWeight: Math.min(1, tickerOutcomes.length / 10),
    };
  });
  
  // Sort performance scores
  performanceScores.sort((a, b) => b.score - a.score);
  
  return {
    groupType,
    groupName,
    outcomes: aggregated,
    tickerCount: tickerOutcomes.length,
    topPerformers: performanceScores.slice(0, 5).map(p => p.symbol),
    worstPerformers: performanceScores.slice(-5).reverse().map(p => p.symbol),
  };
};

// Format outcome for display
export const formatOutcomeSummary = (outcome: OutcomeMetrics, horizon: number = 10): string => {
  const fr = outcome.forwardReturns.find(f => f.horizon === horizon);
  if (!fr) return 'Insufficient data';
  
  const returnStr = (fr.avgReturn * 100).toFixed(2);
  const winStr = (fr.winRate * 100).toFixed(0);
  
  return `Avg ${horizon}-bar return: ${returnStr}%, Win rate: ${winStr}%, N=${fr.sampleSize}`;
};

// Get condition label display text
export const getConditionDisplayText = (label: ConditionLabel): string => {
  const displayMap: Record<ConditionLabel, string> = {
    'high-conviction-bullish': 'High Conviction Bullish',
    'high-conviction-bearish': 'High Conviction Bearish',
    'mixed': 'Mixed Conditions',
    'noisy-avoid': 'Noisy / Avoid',
    'compression-breakout-imminent': 'Compression (Breakout Imminent)',
  };
  return displayMap[label];
};

// Get condition color
export const getConditionColor = (label: ConditionLabel): string => {
  const colorMap: Record<ConditionLabel, string> = {
    'high-conviction-bullish': 'hsl(var(--neural-green))',
    'high-conviction-bearish': 'hsl(var(--neural-red))',
    'mixed': 'hsl(var(--neural-orange))',
    'noisy-avoid': 'hsl(var(--muted-foreground))',
    'compression-breakout-imminent': 'hsl(var(--primary))',
  };
  return colorMap[label];
};
