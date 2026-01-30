// Market data types for The Neural Brain

export type MarketType = 'forex' | 'indices' | 'commodities' | 'crypto' | 'stocks';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export type BiasDirection = 'bullish' | 'bearish';

export type EfficiencyVerdict = 'clean' | 'mixed' | 'noisy';

export type ConvictionState = 'gaining' | 'losing';

export type StrategyState = 'watching' | 'avoiding' | 'tracking' | 'holding' | 'pressing';

export type MacroStrength = 'strong' | 'moderate' | 'weak';

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  type: MarketType;
  baseCurrency?: string;
  quoteCurrency?: string;
}

export interface TrendCore {
  fastCore: number;
  slowCore: number;
  spread: number;
  spreadDelta: number;
}

export interface EfficiencyMetrics {
  score: number;
  netMove: number;
  pathNoise: number;
  verdict: EfficiencyVerdict;
}

export interface SignalStates {
  trendActive: boolean;
  cleanFlow: boolean;
  highConviction: boolean;
  structureGaining: boolean;
  volatilityExpanding: boolean;
  trendingMode: boolean;
  mtfAligned?: boolean;
}

export interface AnalysisResult {
  ticker: TickerInfo;
  timeframe: Timeframe;
  timestamp: number;
  
  // Core metrics
  currentPrice: number;
  trendCore: TrendCore;
  efficiency: EfficiencyMetrics;
  atr: number;
  
  // Derived signals
  bias: BiasDirection;
  conviction: ConvictionState;
  confidencePercent: number;
  macroStrength: MacroStrength;
  strategyState: StrategyState;
  
  // Narrative
  narrative: string;
  
  // AI Reasoning
  efficiencyReason: string;
  confidenceReason: string;
  strategyReason: string;
  
  // Signal states for toggles
  signals: SignalStates;
}

export interface MultiTimeframeAnalysis {
  ticker: TickerInfo;
  timestamp: number;
  analyses: Record<Timeframe, AnalysisResult>;
  aggregatedScore: number;
  dominantBias: BiasDirection;
  alignmentLevel: 'aligned' | 'mixed' | 'conflicting';
}

export interface MarketSnapshot {
  type: MarketType;
  tickers: MultiTimeframeAnalysis[];
  strongestStructure: string;
  weakestStructure: string;
  timestamp: number;
}
