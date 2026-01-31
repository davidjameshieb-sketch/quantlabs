import { supabase } from '@/integrations/supabase/client';
import { OHLC, TickerInfo, Timeframe } from './types';
import { generateOHLCData } from './dataGenerator';

interface MarketDataResponse {
  symbol: string;
  timeframe: string;
  count: number;
  data: OHLC[];
  error?: string;
}

// Cache for API data to reduce calls
const apiDataCache = new Map<string, { data: OHLC[]; timestamp: number }>();
// Polygon free tier is heavily rate-limited; use a longer TTL to avoid falling back to simulated data.
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Coalesce identical in-flight requests
const inFlight = new Map<string, Promise<OHLC[]>>();

// Global throttle: at most 1 request every 12 seconds (~5/min)
let nextAllowedRequestAt = 0;
const MIN_REQUEST_GAP_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const throttle = async () => {
  const now = Date.now();
  const wait = Math.max(0, nextAllowedRequestAt - now);
  if (wait > 0) await sleep(wait);
  nextAllowedRequestAt = Date.now() + MIN_REQUEST_GAP_MS;
};

/**
 * Fetches real market data from the Polygon.io API via edge function
 */
export const fetchRealMarketData = async (
  ticker: TickerInfo,
  timeframe: Timeframe,
  barCount: number = 100
): Promise<OHLC[]> => {
  const cacheKey = `${ticker.symbol}-${timeframe}-${barCount}`;
  
  // Check cache first
  const cached = apiDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // If we already have a request in-flight for this key, reuse it.
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const requestPromise = (async () => {
    try {
      // Throttle before making any network call.
      await throttle();

      // Prefer the official client invoke API (handles auth headers automatically)
      const { data, error } = await supabase.functions.invoke('market-data', {
        method: 'GET',
        // @ts-expect-error - supabase-js supports queryParams for functions.invoke
        queryParams: {
          symbol: ticker.symbol,
          timeframe,
          limit: String(barCount),
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch market data');
      }

      const result = data as MarketDataResponse;

      if (result?.error) {
        throw new Error(result.error);
      }

      if (result?.data && result.data.length > 0) {
        apiDataCache.set(cacheKey, { data: result.data, timestamp: Date.now() });
        return result.data;
      }

      throw new Error('No data returned');
    } catch (err) {
      // Prefer stale real data over simulated data.
      const stale = apiDataCache.get(cacheKey);
      if (stale) {
        return stale.data;
      }

      console.warn(`Falling back to simulated data for ${ticker.symbol}:`, err);
      return generateOHLCData(ticker, timeframe, barCount);
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, requestPromise);
  return requestPromise;
};

/**
 * Gets market data - tries real API first, falls back to simulated
 */
export const getMarketDataAsync = async (
  ticker: TickerInfo,
  timeframe: Timeframe,
  barCount: number = 100
): Promise<OHLC[]> => {
  return fetchRealMarketData(ticker, timeframe, barCount);
};

/**
 * Clear the API data cache
 */
export const clearApiDataCache = (): void => {
  apiDataCache.clear();
};
