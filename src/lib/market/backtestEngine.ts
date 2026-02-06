// Historical Condition Outcomes Engine
// Computes forward returns, win rates, MFE/MAE for condition labels
// Includes position sizing with configurable account size and risk %

import { OHLC, TickerInfo, Timeframe, StrategyState, EfficiencyVerdict } from './types';
import { getMarketData } from './dataGenerator';

export type ConditionLabel = 
  | 'high-conviction-bullish'
  | 'high-conviction-bearish'
  | 'mixed'
  | 'noisy-avoid'
  | 'compression-breakout-imminent';

export interface ForwardReturn {
  horizon: number;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  sampleSize: number;
  percentile25: number;
  percentile75: number;
}

export interface PositionSizing {
  accountSize: number;
  riskPercent: number;
  riskPerTrade: number;
  avgPositionSize: number;
  avgPnlPerTrade: number;
  totalPnl: number;
  totalTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface OutcomeMetrics {
  conditionLabel: ConditionLabel;
  forwardReturns: ForwardReturn[];
  avgMFE: number;
  avgMAE: number;
  conditionFlipRate: number;
  avgDuration: number;
  confidenceWeight: number;
  positionSizing: PositionSizing;
}

export interface TickerOutcomes {
  symbol: string;
  outcomes: Record<ConditionLabel, OutcomeMetrics>;
  lastUpdated: number;
  sampleDepth: number;
  accountSize: number;
  riskPercent: number;
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

// Default account parameters
export const DEFAULT_ACCOUNT_SIZE = 1000;
export const DEFAULT_RISK_PERCENT = 5;

// Map analysis result to condition label
export const getConditionLabel = (
  confidence: number,
  efficiency: EfficiencyVerdict,
  bias: 'bullish' | 'bearish',
  strategyState: StrategyState
): ConditionLabel => {
  if (confidence > 70 && efficiency !== 'noisy') {
    return bias === 'bullish' ? 'high-conviction-bullish' : 'high-conviction-bearish';
  }
  if (efficiency === 'noisy' || strategyState === 'avoiding') {
    return 'noisy-avoid';
  }
  if (strategyState === 'watching' && confidence < 40) {
    return 'compression-breakout-imminent';
  }
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
  if (entryPrice === 0) return null;
  
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

// Calculate position sizing metrics
const calculatePositionSizing = (
  returns: number[],
  atrPercent: number,
  accountSize: number,
  riskPercent: number
): PositionSizing => {
  const riskPerTrade = accountSize * (riskPercent / 100);
  
  // Position size based on ATR-based stop (2x ATR stop)
  const stopDistancePct = Math.max(atrPercent * 2, 0.005); // min 0.5% stop
  const avgPositionSize = riskPerTrade / stopDistancePct;
  
  // Calculate P&L for each trade
  const pnls = returns.map(r => avgPositionSize * r);
  const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
  const avgPnlPerTrade = pnls.length > 0 ? totalPnl / pnls.length : 0;
  
  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  for (const pnl of pnls) {
    runningPnl += pnl;
    peak = Math.max(peak, runningPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - runningPnl);
  }
  
  // Sharpe ratio (annualized, assume 252 trading days)
  const avgReturn = pnls.length > 0 ? pnls.reduce((s, p) => s + p, 0) / pnls.length : 0;
  const stdDev = pnls.length > 1 
    ? Math.sqrt(pnls.reduce((s, p) => s + (p - avgReturn) ** 2, 0) / (pnls.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  return {
    accountSize,
    riskPercent,
    riskPerTrade,
    avgPositionSize,
    avgPnlPerTrade,
    totalPnl,
    totalTrades: returns.length,
    maxDrawdown,
    sharpeRatio,
  };
};

// Compute outcomes for a single ticker
export const computeTickerOutcomes = (
  ticker: TickerInfo,
  timeframe: Timeframe = '1h',
  barCount: number = 500,
  horizons: number[] = DEFAULT_HORIZONS,
  accountSize: number = DEFAULT_ACCOUNT_SIZE,
  riskPercent: number = DEFAULT_RISK_PERCENT
): TickerOutcomes => {
  const data = getMarketData(ticker, timeframe, barCount);
  
  // Calculate ATR for position sizing
  const atrWindow = Math.min(14, data.length - 1);
  let atrSum = 0;
  for (let i = data.length - atrWindow; i < data.length; i++) {
    atrSum += (data[i].high - data[i].low);
  }
  const avgATR = atrSum / atrWindow;
  const avgPrice = data[data.length - 1]?.close || 1;
  const atrPercent = avgATR / avgPrice;
  
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
  
  const maxHorizon = Math.max(...horizons);
  const analysisStart = Math.min(50, Math.floor(data.length * 0.1));
  
  for (let i = analysisStart; i < data.length - maxHorizon; i++) {
    // Calculate volatility as % of price for this window
    const windowSize = Math.min(20, i);
    const windowSlice = data.slice(i - windowSize, i + 1);
    
    const barVolatility = windowSlice.reduce((sum, b) => sum + (b.high - b.low), 0) / windowSlice.length;
    const barVolPct = barVolatility / data[i].close;
    
    // Trend strength: how much price moved directionally over the window
    const priceAtStart = data[Math.max(0, i - windowSize)]?.close || data[i].close;
    const trendStrength = Math.abs(data[i].close - priceAtStart) / priceAtStart;
    
    // Efficiency: directional move vs total path
    const netMove = Math.abs(data[i].close - priceAtStart);
    const pathLength = windowSlice.reduce((sum, b) => sum + (b.high - b.low), 0);
    const efficiencyRatio = pathLength > 0 ? netMove / pathLength : 0;
    
    // Determine condition based on computed metrics
    const confidence = Math.min(100, trendStrength * 800 + efficiencyRatio * 40);
    const efficiency: EfficiencyVerdict = efficiencyRatio > 0.4 ? 'clean' : efficiencyRatio < 0.15 ? 'noisy' : 'mixed';
    const bias = data[i].close > priceAtStart ? 'bullish' : 'bearish';
    const strategyState: StrategyState = confidence > 70 && efficiency === 'clean' ? 'pressing' : 
                                          confidence < 30 ? 'watching' : 
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
    const confidenceWeight = Math.min(1, totalSamples / 100);
    
    // Position sizing for the 10-bar horizon (primary benchmark)
    const primaryReturns = occ.returns[10] || occ.returns[horizons[0]] || [];
    const positionSizing = calculatePositionSizing(primaryReturns, atrPercent, accountSize, riskPercent);
    
    outcomes[label] = {
      conditionLabel: label,
      forwardReturns,
      avgMFE,
      avgMAE,
      conditionFlipRate: conditionFlips / Math.max(1, data.length - analysisStart),
      avgDuration,
      confidenceWeight,
      positionSizing,
    };
  });
  
  return {
    symbol: ticker.symbol,
    outcomes,
    lastUpdated: Date.now(),
    sampleDepth: barCount,
    accountSize,
    riskPercent,
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
      
      if (label === 'high-conviction-bullish') {
        const fr10 = outcome.forwardReturns.find(fr => fr.horizon === 10);
        if (fr10) {
          performanceScores.push({ symbol: to.symbol, score: fr10.avgReturn * fr10.winRate });
        }
      }
    });
    
    const forwardReturns: ForwardReturn[] = Object.entries(allForwardReturns).map(([horizon, frs]) => {
      const h = parseInt(horizon);
      const totalSamples = frs.reduce((sum, fr) => sum + fr.sampleSize, 0);
      const avgReturn = frs.reduce((sum, fr) => sum + fr.avgReturn * fr.sampleSize, 0) / Math.max(1, totalSamples);
      const avgWinRate = frs.reduce((sum, fr) => sum + fr.winRate * fr.sampleSize, 0) / Math.max(1, totalSamples);
      
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
      positionSizing: {
        accountSize: DEFAULT_ACCOUNT_SIZE,
        riskPercent: DEFAULT_RISK_PERCENT,
        riskPerTrade: DEFAULT_ACCOUNT_SIZE * DEFAULT_RISK_PERCENT / 100,
        avgPositionSize: 0,
        avgPnlPerTrade: 0,
        totalPnl: 0,
        totalTrades: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
      },
    };
  });
  
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

// Format dollar amount
export const formatDollar = (amount: number): string => {
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
};
