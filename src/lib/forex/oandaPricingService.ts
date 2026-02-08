// OANDA Live Pricing Service
// Fetches and caches real-time forex prices from the oanda-pricing edge function

export interface OandaPrice {
  bid: number;
  ask: number;
  mid: number;
}

interface OandaPricingResponse {
  prices: Record<string, OandaPrice>;
  count: number;
  cached: boolean;
  cacheAge: number;
  timestamp: number;
  error?: string;
}

// Local cache
let livePrices: Record<string, OandaPrice> = {};
let lastFetchTimestamp = 0;
let isFetching = false;
let fetchPromise: Promise<Record<string, OandaPrice>> | null = null;

const LOCAL_CACHE_TTL = 60_000; // 60s local cache (server also caches 60s)

export async function fetchOandaLivePrices(): Promise<Record<string, OandaPrice>> {
  const now = Date.now();

  // Return cache if fresh
  if (now - lastFetchTimestamp < LOCAL_CACHE_TTL && Object.keys(livePrices).length > 0) {
    return livePrices;
  }

  // Dedupe concurrent requests
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      isFetching = true;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/oanda-pricing`, {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
      });

      if (!res.ok) {
        console.warn(`[OandaPricing] HTTP ${res.status}`);
        return livePrices;
      }

      const data: OandaPricingResponse = await res.json();

      if (data.prices && Object.keys(data.prices).length > 0) {
        livePrices = data.prices;
        lastFetchTimestamp = Date.now();
        console.log(`[OandaPricing] Loaded ${Object.keys(livePrices).length} live prices (cached: ${data.cached})`);
      }

      return livePrices;
    } catch (err) {
      console.warn('[OandaPricing] Fetch failed:', err);
      return livePrices; // Return stale cache on error
    } finally {
      isFetching = false;
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Get the cached live mid-price for a forex symbol (e.g. "EUR/USD").
 * Returns null if no live price is available yet.
 */
export function getLivePrice(symbol: string): number | null {
  const p = livePrices[symbol];
  return p ? p.mid : null;
}

/**
 * Get all cached live prices (synchronous).
 */
export function getAllLivePrices(): Record<string, OandaPrice> {
  return livePrices;
}

/**
 * Whether live prices have been loaded at least once.
 */
export function hasLivePrices(): boolean {
  return Object.keys(livePrices).length > 0;
}

/**
 * Get the timestamp of the last successful fetch.
 */
export function getLivePriceTimestamp(): number {
  return lastFetchTimestamp;
}
