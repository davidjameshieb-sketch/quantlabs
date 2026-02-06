import { OHLC, TickerInfo, Timeframe } from './types';

// Seeded random number generator for consistent data
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// Get base price for ticker (realistic starting prices)
const getBasePrice = (ticker: TickerInfo): number => {
  const basePrices: Record<string, number> = {
    // Forex
    EURUSD: 1.0850,
    GBPUSD: 1.2650,
    USDJPY: 154.50,
    AUDUSD: 0.6520,
    USDCAD: 1.3580,
    USDCHF: 0.8820,
    // Indices
    SPX500: 5890,
    NASDAQ: 20500,
    DJI: 42800,
    DAX: 19200,
    FTSE: 8350,
    // Commodities
    XAUUSD: 2650,
    XAGUSD: 31.50,
    WTIUSD: 72.50,
    NATGAS: 3.25,
    // Crypto
    BTCUSD: 97500,
    ETHUSD: 3450,
    SOLUSD: 185,
    XRPUSD: 2.15,
    ADAUSD: 0.92,
  };

  // Known mappings first.
  const mapped = basePrices[ticker.symbol];
  if (typeof mapped === 'number') return mapped;

  // Deterministic fallback so we don't end up with everything clustering at ~$100.
  // This keeps simulated mode visually credible while still being stable per-symbol.
  const hash = ticker.symbol.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
  const unit = (hash % 10_000) / 10_000; // 0..1

  if (ticker.type === 'stocks') {
    // Typical stock range.
    return 20 + unit * 480; // 20..500
  }

  // Generic fallback.
  return 50 + unit * 150; // 50..200
};

// Get volatility multiplier for ticker — returns an absolute price move per bar
const getVolatility = (ticker: TickerInfo): number => {
  const volatilities: Record<string, number> = {
    // Forex (low volatility)
    EURUSD: 0.0008,
    GBPUSD: 0.0012,
    USDJPY: 0.08,
    AUDUSD: 0.001,
    USDCAD: 0.0008,
    USDCHF: 0.0007,
    // Indices (medium volatility)
    SPX500: 15,
    NASDAQ: 80,
    DJI: 150,
    DAX: 60,
    FTSE: 30,
    // Commodities (medium-high volatility)
    XAUUSD: 12,
    XAGUSD: 0.4,
    WTIUSD: 1.2,
    NATGAS: 0.08,
    // Crypto (high volatility)
    BTCUSD: 1500,
    ETHUSD: 80,
    SOLUSD: 8,
    XRPUSD: 0.05,
    ADAUSD: 0.03,
  };

  const mapped = volatilities[ticker.symbol];
  if (typeof mapped === 'number') return mapped;

  // Dynamic fallback: ~1.2% of base price per bar (realistic daily volatility)
  const basePrice = getBasePrice(ticker);
  
  if (ticker.type === 'stocks') return basePrice * 0.012;
  if (ticker.type === 'crypto') return basePrice * 0.025;
  if (ticker.type === 'forex') return basePrice * 0.003;
  if (ticker.type === 'commodities') return basePrice * 0.015;
  if (ticker.type === 'indices') return basePrice * 0.008;
  
  return basePrice * 0.01;
};

// Get timeframe duration in milliseconds
const getTimeframeDuration = (tf: Timeframe): number => {
  const durations: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return durations[tf];
};

// Generate OHLC data for a ticker and timeframe
export const generateOHLCData = (
  ticker: TickerInfo,
  timeframe: Timeframe,
  barCount: number = 100
): OHLC[] => {
  const seed = ticker.symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = new SeededRandom(seed + timeframe.charCodeAt(0));
  
  const basePrice = getBasePrice(ticker);
  const volatility = getVolatility(ticker);
  const tfDuration = getTimeframeDuration(timeframe);
  
  const now = Date.now();
  const data: OHLC[] = [];
  let currentPrice = basePrice;
  
  // Add some trend bias
  const trendBias = rng.range(-0.3, 0.3);
  
  for (let i = barCount - 1; i >= 0; i--) {
    const timestamp = now - i * tfDuration;
    
    // Random walk with trend bias
    const change = rng.range(-1, 1) + trendBias * 0.1;
    const open = currentPrice;
    
    // Generate realistic OHLC
    const range = volatility * rng.range(0.5, 2);
    const direction = change > 0 ? 1 : -1;
    
    const close = open + direction * range * rng.range(0.3, 1);
    const high = Math.max(open, close) + range * rng.range(0.1, 0.5);
    const low = Math.min(open, close) - range * rng.range(0.1, 0.5);
    
    data.push({
      timestamp,
      open: Number(open.toFixed(ticker.type === 'forex' ? 5 : 2)),
      high: Number(high.toFixed(ticker.type === 'forex' ? 5 : 2)),
      low: Number(low.toFixed(ticker.type === 'forex' ? 5 : 2)),
      close: Number(close.toFixed(ticker.type === 'forex' ? 5 : 2)),
      volume: Math.floor(rng.range(1000, 100000)),
    });
    
    currentPrice = close;
  }
  
  return data;
};

// Cache for generated data (prevents regeneration on each call)
const dataCache = new Map<string, OHLC[]>();

export const getMarketData = (
  ticker: TickerInfo,
  timeframe: Timeframe,
  barCount: number = 100
): OHLC[] => {
  const cacheKey = `${ticker.symbol}-${timeframe}-${barCount}`;
  
  if (!dataCache.has(cacheKey)) {
    dataCache.set(cacheKey, generateOHLCData(ticker, timeframe, barCount));
  }
  
  return dataCache.get(cacheKey)!;
};

// Clear cache (useful for "refreshing" data)
export const clearMarketDataCache = (): void => {
  dataCache.clear();
};
