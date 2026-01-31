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
const CACHE_TTL = 60 * 1000; // 1 minute cache

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

  try {
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: null,
      method: 'GET',
    });

    // Use query params approach via direct fetch for GET requests
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data?symbol=${ticker.symbol}&timeframe=${timeframe}&limit=${barCount}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const result: MarketDataResponse = await response.json();
    
    if (result.error) {
      console.warn(`Market data error for ${ticker.symbol}:`, result.error);
      throw new Error(result.error);
    }

    if (result.data && result.data.length > 0) {
      // Cache the successful result
      apiDataCache.set(cacheKey, { data: result.data, timestamp: Date.now() });
      return result.data;
    }

    throw new Error('No data returned');
  } catch (error) {
    console.warn(`Falling back to simulated data for ${ticker.symbol}:`, error);
    // Fall back to generated data if API fails
    return generateOHLCData(ticker, timeframe, barCount);
  }
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
