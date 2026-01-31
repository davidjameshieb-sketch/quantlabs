import { MarketType, TickerInfo } from './types';
import { getTickersByType, TICKERS } from './tickers';

/**
 * Snapshot Service
 * Provides curated "snapshot" sets of 5 tickers per market for fast initial load.
 * These are deterministic popular/blue-chip picks that don't require computation.
 */

// Popular/most-traded tickers per market (deterministic, stable list)
// IMPORTANT: These symbols must match what the batch-prices backend returns
const SNAPSHOT_SYMBOLS: Record<MarketType, string[]> = {
  stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'],
  crypto: ['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTIUSD', 'NATGAS', 'WHEAT'],
  indices: ['SPX', 'NDX', 'DJI', 'VIX', 'RUT'],
};

// Full market labels for "Load Full" CTAs
export const MARKET_FULL_LABELS: Record<MarketType, string> = {
  stocks: 'S&P 500 & NASDAQ',
  crypto: 'Top 100 Crypto',
  forex: 'Major Pairs',
  commodities: 'All Commodities',
  indices: 'Global Indices',
};

// Get snapshot count per market
export const SNAPSHOT_SIZE = 5;

/**
 * Get snapshot tickers for a specific market type (5 tickers)
 */
export const getSnapshotTickers = (type: MarketType): TickerInfo[] => {
  const symbols = SNAPSHOT_SYMBOLS[type] || [];
  const allTickers = getTickersByType(type);
  
  // Map symbols to ticker info, filtering out any that don't exist
  return symbols
    .map(symbol => allTickers.find(t => t.symbol === symbol))
    .filter((t): t is TickerInfo => t !== undefined)
    .slice(0, SNAPSHOT_SIZE);
};

/**
 * Get all snapshot tickers across all markets
 */
export const getAllSnapshotTickers = (): TickerInfo[] => {
  const marketTypes: MarketType[] = ['stocks', 'crypto', 'forex', 'commodities', 'indices'];
  return marketTypes.flatMap(type => getSnapshotTickers(type));
};

/**
 * Get snapshot tickers grouped by market type
 */
export const getSnapshotsByMarket = (): Record<MarketType, TickerInfo[]> => {
  return {
    stocks: getSnapshotTickers('stocks'),
    crypto: getSnapshotTickers('crypto'),
    forex: getSnapshotTickers('forex'),
    commodities: getSnapshotTickers('commodities'),
    indices: getSnapshotTickers('indices'),
  };
};

/**
 * Check if a market is in snapshot mode (not fully expanded)
 */
export const isSnapshotMode = (loadedCount: number, type: MarketType): boolean => {
  const fullCount = getTickersByType(type).length;
  return loadedCount < fullCount;
};

/**
 * Get the full ticker count for a market type
 */
export const getFullMarketCount = (type: MarketType): number => {
  return getTickersByType(type).length;
};

/**
 * Search tickers by query - works independently of loaded universe
 */
export const searchTickers = (query: string, limit = 10): TickerInfo[] => {
  if (!query || query.length < 1) return [];
  
  const sanitized = query.trim().toLowerCase().slice(0, 50);
  
  return TICKERS
    .filter(t => 
      t.symbol.toLowerCase().includes(sanitized) ||
      t.name.toLowerCase().includes(sanitized)
    )
    .slice(0, limit);
};
