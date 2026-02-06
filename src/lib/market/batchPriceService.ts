// Batch price service - fetches real prices from backend cache
import { TickerInfo } from './types';

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
  source?: string;
  isDelayed?: boolean;
}

interface BatchPriceResponse {
  prices: Record<string, PriceData>;
  count: number;
  cacheAge: number;
  lastUpdated: number;
  lastUpdatedISO?: string;
}

// Local cache for batch prices
let cachedPrices: Record<string, PriceData> = {};
let lastFetch = 0;
let lastUpdatedISO = '';
const LOCAL_CACHE_TTL = 90 * 1000; // 90 second local cache (backend refreshes every 2 min)

// In-flight request deduplication
let inFlightRequest: Promise<Record<string, PriceData>> | null = null;

export const fetchBatchPrices = async (symbols?: string[]): Promise<Record<string, PriceData>> => {
  const now = Date.now();
  
  // Return local cache if fresh
  if (now - lastFetch < LOCAL_CACHE_TTL && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }
  
  // Dedupe in-flight requests
  if (inFlightRequest) {
    return inFlightRequest;
  }
  
  inFlightRequest = (async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      let url = `${supabaseUrl}/functions/v1/batch-prices`;
      if (symbols && symbols.length > 0) {
        url += `?symbols=${symbols.join(',')}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data: BatchPriceResponse = await response.json();
      
      if (data.prices) {
        cachedPrices = { ...cachedPrices, ...data.prices };
        lastFetch = now;
        if (data.lastUpdatedISO) {
          lastUpdatedISO = data.lastUpdatedISO;
        }
      }
      
      return cachedPrices;
    } catch (err) {
      console.warn('Failed to fetch batch prices:', err);
      return cachedPrices; // Return stale cache on error
    } finally {
      inFlightRequest = null;
    }
  })();
  
  return inFlightRequest;
};

export const getTickerPrice = (symbol: string): PriceData | null => {
  return cachedPrices[symbol] || null;
};

export const getRealPrice = async (ticker: TickerInfo): Promise<number | null> => {
  const prices = await fetchBatchPrices([ticker.symbol]);
  const priceData = prices[ticker.symbol];
  return priceData?.price ?? null;
};

export const getLastUpdatedISO = (): string => {
  return lastUpdatedISO;
};

export const clearBatchPriceCache = (): void => {
  cachedPrices = {};
  lastFetch = 0;
  lastUpdatedISO = '';
};
