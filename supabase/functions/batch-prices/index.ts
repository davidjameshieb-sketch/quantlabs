import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// In-memory cache for batch prices (shared across requests within same instance)
interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

const priceCache = new Map<string, PriceData>();
let lastBatchFetch = 0;
const BATCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - refresh every 5 min max

// Symbol mapping to Polygon tickers
const symbolMapping: Record<string, string> = {
  // US Stocks / Indices (using ETFs as proxies)
  'SPX500': 'SPY',
  'NASDAQ': 'QQQ',
  'DJI': 'DIA',
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'TSLA': 'TSLA',
  'NVDA': 'NVDA',
  'META': 'META',
  // Crypto
  'BTCUSD': 'X:BTCUSD',
  'ETHUSD': 'X:ETHUSD',
  'SOLUSD': 'X:SOLUSD',
  'XRPUSD': 'X:XRPUSD',
  'ADAUSD': 'X:ADAUSD',
  // Forex
  'EURUSD': 'C:EURUSD',
  'GBPUSD': 'C:GBPUSD',
  'USDJPY': 'C:USDJPY',
  'AUDUSD': 'C:AUDUSD',
  'USDCAD': 'C:USDCAD',
  'USDCHF': 'C:USDCHF',
  // Commodities (ETFs)
  'XAUUSD': 'GLD',
  'XAGUSD': 'SLV',
  'WTIUSD': 'USO',
  'NATGAS': 'UNG',
  // European indices (ETFs)
  'DAX': 'EWG',
  'FTSE': 'EWU',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Fetch previous close for a stock ticker
async function fetchStockPrice(polygonTicker: string, apiKey: string): Promise<{ price: number; prevClose: number } | null> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${polygonTicker}/prev?adjusted=true&apiKey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return {
        price: data.results[0].c,
        prevClose: data.results[0].o,
      };
    }
    return null;
  } catch (e) {
    console.error(`Failed to fetch ${polygonTicker}:`, e);
    return null;
  }
}

// Fetch grouped daily bars - gets all US stocks in one call!
async function fetchGroupedDaily(apiKey: string): Promise<Map<string, PriceData>> {
  const prices = new Map<string, PriceData>();
  const today = new Date();
  // Get previous trading day (skip weekends)
  let daysBack = 1;
  if (today.getDay() === 0) daysBack = 2; // Sunday -> Friday
  if (today.getDay() === 1) daysBack = 3; // Monday -> Friday
  
  const date = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dateStr = date.toISOString().split('T')[0];
  
  try {
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;
    console.log(`Fetching grouped daily for ${dateStr}`);
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results) {
      const timestamp = Date.now();
      for (const bar of data.results) {
        const change = bar.c - bar.o;
        const changePercent = bar.o > 0 ? (change / bar.o) * 100 : 0;
        prices.set(bar.T, {
          price: bar.c,
          change,
          changePercent,
          timestamp,
        });
      }
      console.log(`Got ${prices.size} stock prices from grouped daily`);
    } else {
      console.warn('Grouped daily response:', data.status, data.message);
    }
  } catch (e) {
    console.error('Failed to fetch grouped daily:', e);
  }
  
  return prices;
}

// Refresh all prices
async function refreshPrices(apiKey: string): Promise<void> {
  console.log('Refreshing batch prices...');
  
  // Get all US stocks with one API call
  const stockPrices = await fetchGroupedDaily(apiKey);
  
  const timestamp = Date.now();
  
  // Map our symbols to the fetched prices
  for (const [ourSymbol, polygonTicker] of Object.entries(symbolMapping)) {
    // Skip crypto/forex for now (would need separate API calls)
    if (polygonTicker.startsWith('X:') || polygonTicker.startsWith('C:')) {
      continue;
    }
    
    const priceData = stockPrices.get(polygonTicker);
    if (priceData) {
      priceCache.set(ourSymbol, priceData);
    }
  }
  
  // For remaining symbols, try individual fetches (rate-limit aware)
  const missingSymbols = Object.entries(symbolMapping).filter(([ourSymbol, polygonTicker]) => {
    return !priceCache.has(ourSymbol) && !polygonTicker.startsWith('X:') && !polygonTicker.startsWith('C:');
  });
  
  // Fetch up to 3 missing stock prices
  for (const [ourSymbol, polygonTicker] of missingSymbols.slice(0, 3)) {
    const result = await fetchStockPrice(polygonTicker, apiKey);
    if (result) {
      const change = result.price - result.prevClose;
      const changePercent = result.prevClose > 0 ? (change / result.prevClose) * 100 : 0;
      priceCache.set(ourSymbol, {
        price: result.price,
        change,
        changePercent,
        timestamp,
      });
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  lastBatchFetch = Date.now();
  console.log(`Price cache now has ${priceCache.size} entries`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
    if (!POLYGON_API_KEY) {
      return json({ error: 'POLYGON_API_KEY not configured' }, 500);
    }

    const url = new URL(req.url);
    const symbols = url.searchParams.get('symbols')?.split(',') || [];
    
    // Check if we need to refresh
    const now = Date.now();
    if (now - lastBatchFetch > BATCH_CACHE_TTL_MS || priceCache.size === 0) {
      await refreshPrices(POLYGON_API_KEY);
    }
    
    // Return requested symbols or all cached
    const result: Record<string, PriceData> = {};
    
    if (symbols.length > 0) {
      for (const symbol of symbols) {
        const cached = priceCache.get(symbol);
        if (cached) {
          result[symbol] = cached;
        }
      }
    } else {
      // Return all cached prices
      priceCache.forEach((data, symbol) => {
        result[symbol] = data;
      });
    }
    
    return json({
      prices: result,
      count: Object.keys(result).length,
      cacheAge: now - lastBatchFetch,
      lastUpdated: lastBatchFetch,
    });

  } catch (error) {
    console.error('Batch prices error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
