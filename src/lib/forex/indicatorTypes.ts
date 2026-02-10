// Shared types for the live indicator computation system

export interface IndicatorResult {
  value?: number;
  signal: string;
  [key: string]: any;
}

export interface IndicatorSet {
  ema50: IndicatorResult;
  rsi: IndicatorResult;
  stochastics: IndicatorResult & { k: number; d: number };
  adx: IndicatorResult & { plusDI?: number; minusDI?: number };
  bollingerBands: IndicatorResult & { upper: number; mid: number; lower: number; bandwidth: number; pctB: number };
  donchianChannels: IndicatorResult & { upper: number; mid: number; lower: number };
  ichimoku: IndicatorResult & { tenkanSen: number; kijunSen: number; senkouA: number; senkouB: number };
  supertrend: IndicatorResult;
  parabolicSAR: IndicatorResult;
  cci: IndicatorResult;
  keltnerChannels: IndicatorResult & { upper: number; mid: number; lower: number };
  roc: IndicatorResult;
  elderForce: IndicatorResult;
  heikinAshi: { candles: { o: number; h: number; l: number; c: number }[]; signal: string };
  pivotPoints: IndicatorResult & { pivot: number; r1: number; r2: number; s1: number; s2: number };
  trendEfficiency: IndicatorResult;
}

export interface ConsensusResult {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
}

export interface IndicatorSnapshot {
  instrument: string;
  timeframe: string;
  mode?: 'live' | 'backtest';
  lastPrice: number;
  lastTime: string;
  firstTime?: string;
  candleCount: number;
  indicators: IndicatorSet;
  consensus: ConsensusResult;
}

export const ALL_INDICATOR_NAMES: (keyof IndicatorSet)[] = [
  'ema50', 'supertrend', 'rsi', 'stochastics', 'adx',
  'bollingerBands', 'donchianChannels', 'ichimoku',
  'parabolicSAR', 'cci', 'keltnerChannels', 'roc',
  'elderForce', 'heikinAshi', 'pivotPoints', 'trendEfficiency',
];

export const INDICATOR_LABELS: Record<keyof IndicatorSet, string> = {
  ema50: '50 EMA',
  supertrend: 'Supertrend',
  rsi: 'RSI (14)',
  stochastics: 'Stochastics',
  adx: 'ADX',
  bollingerBands: 'Bollinger Bands',
  donchianChannels: 'Donchian',
  ichimoku: 'Ichimoku',
  parabolicSAR: 'Parabolic SAR',
  cci: 'CCI',
  keltnerChannels: 'Keltner',
  roc: 'ROC',
  elderForce: 'Elder Force',
  heikinAshi: 'Heikin-Ashi',
  pivotPoints: 'Pivot Points',
  trendEfficiency: 'Trend Efficiency',
};

export const ALL_FOREX_PAIRS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD',
  'NZD_USD', 'USD_CHF', 'EUR_GBP',
  'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CHF_JPY', 'CAD_JPY', 'NZD_JPY',
  'EUR_AUD', 'GBP_AUD', 'EUR_CAD', 'GBP_CAD', 'AUD_CAD', 'NZD_CAD',
  'AUD_NZD', 'EUR_NZD', 'GBP_NZD', 'EUR_CHF', 'AUD_CHF', 'CAD_CHF',
];

export const SCALPING_TIMEFRAMES = ['1m', '5m', '15m'] as const;
export type ScalpingTimeframe = typeof SCALPING_TIMEFRAMES[number];
