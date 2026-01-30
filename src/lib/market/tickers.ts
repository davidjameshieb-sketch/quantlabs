import { TickerInfo, MarketType } from './types';

// All tickers available in the platform
export const TICKERS: TickerInfo[] = [
  // Forex pairs
  { symbol: 'EURUSD', name: 'EUR/USD', type: 'forex', baseCurrency: 'EUR', quoteCurrency: 'USD' },
  { symbol: 'GBPUSD', name: 'GBP/USD', type: 'forex', baseCurrency: 'GBP', quoteCurrency: 'USD' },
  { symbol: 'USDJPY', name: 'USD/JPY', type: 'forex', baseCurrency: 'USD', quoteCurrency: 'JPY' },
  { symbol: 'AUDUSD', name: 'AUD/USD', type: 'forex', baseCurrency: 'AUD', quoteCurrency: 'USD' },
  { symbol: 'USDCAD', name: 'USD/CAD', type: 'forex', baseCurrency: 'USD', quoteCurrency: 'CAD' },
  { symbol: 'USDCHF', name: 'USD/CHF', type: 'forex', baseCurrency: 'USD', quoteCurrency: 'CHF' },
  
  // Indices
  { symbol: 'SPX500', name: 'S&P 500', type: 'indices' },
  { symbol: 'NASDAQ', name: 'NASDAQ 100', type: 'indices' },
  { symbol: 'DJI', name: 'Dow Jones', type: 'indices' },
  { symbol: 'DAX', name: 'DAX 40', type: 'indices' },
  { symbol: 'FTSE', name: 'FTSE 100', type: 'indices' },
  
  // Commodities
  { symbol: 'XAUUSD', name: 'Gold', type: 'commodities' },
  { symbol: 'XAGUSD', name: 'Silver', type: 'commodities' },
  { symbol: 'WTIUSD', name: 'Crude Oil WTI', type: 'commodities' },
  { symbol: 'NATGAS', name: 'Natural Gas', type: 'commodities' },
  
  // Crypto
  { symbol: 'BTCUSD', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETHUSD', name: 'Ethereum', type: 'crypto' },
  { symbol: 'SOLUSD', name: 'Solana', type: 'crypto' },
  { symbol: 'XRPUSD', name: 'Ripple', type: 'crypto' },
  { symbol: 'ADAUSD', name: 'Cardano', type: 'crypto' },
];

// Get tickers by market type
export const getTickersByType = (type: MarketType): TickerInfo[] => {
  return TICKERS.filter(t => t.type === type);
};

// Get ticker by symbol
export const getTickerBySymbol = (symbol: string): TickerInfo | undefined => {
  return TICKERS.find(t => t.symbol === symbol);
};

// Market type labels
export const MARKET_LABELS: Record<MarketType, string> = {
  forex: 'Forex',
  indices: 'Indices',
  commodities: 'Commodities',
  crypto: 'Crypto',
};

// Timeframe labels
export const TIMEFRAME_LABELS: Record<string, string> = {
  '1m': '1 Min',
  '5m': '5 Min',
  '15m': '15 Min',
  '1h': '1 Hour',
  '4h': '4 Hour',
  '1d': 'Daily',
  '1w': 'Weekly',
};

// Tier-based timeframe access
export const TIER_TIMEFRAMES: Record<number, string[]> = {
  1: ['1h'],
  2: ['15m', '1h', '4h'],
  3: ['5m', '15m', '1h', '4h', '1d'],
  4: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
  5: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
};
