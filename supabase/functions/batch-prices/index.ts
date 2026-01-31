import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// In-memory cache for batch prices
interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
  source: string;
  isDelayed?: boolean;
}

const priceCache = new Map<string, PriceData>();
let lastBatchFetch = 0;
const BATCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Canonical symbol mapping: frontend symbol -> { polygonTicker, source, priceRange }
interface SymbolConfig {
  polygon: string;
  source: string;
  minPrice: number;
  maxPrice: number;
}

const symbolConfig: Record<string, SymbolConfig> = {
  // ========== US STOCKS ==========
  'AAPL': { polygon: 'AAPL', source: 'NASDAQ', minPrice: 50, maxPrice: 500 },
  'MSFT': { polygon: 'MSFT', source: 'NASDAQ', minPrice: 100, maxPrice: 800 },
  'GOOGL': { polygon: 'GOOGL', source: 'NASDAQ', minPrice: 50, maxPrice: 500 },
  'GOOG': { polygon: 'GOOG', source: 'NASDAQ', minPrice: 50, maxPrice: 500 },
  'AMZN': { polygon: 'AMZN', source: 'NASDAQ', minPrice: 50, maxPrice: 500 },
  'TSLA': { polygon: 'TSLA', source: 'NASDAQ', minPrice: 50, maxPrice: 1000 },
  'NVDA': { polygon: 'NVDA', source: 'NASDAQ', minPrice: 50, maxPrice: 2000 },
  'META': { polygon: 'META', source: 'NASDAQ', minPrice: 100, maxPrice: 1000 },
  'BRK.B': { polygon: 'BRK.B', source: 'NYSE', minPrice: 200, maxPrice: 800 },
  'JPM': { polygon: 'JPM', source: 'NYSE', minPrice: 50, maxPrice: 400 },
  'V': { polygon: 'V', source: 'NYSE', minPrice: 100, maxPrice: 500 },
  'UNH': { polygon: 'UNH', source: 'NYSE', minPrice: 200, maxPrice: 800 },
  
  // ========== INDICES (via ETFs - clearly labeled) ==========
  'SPX500': { polygon: 'SPY', source: 'SPY ETF Proxy', minPrice: 200, maxPrice: 800 },
  'SPX': { polygon: 'SPY', source: 'SPY ETF Proxy', minPrice: 200, maxPrice: 800 },
  'NASDAQ': { polygon: 'QQQ', source: 'QQQ ETF Proxy', minPrice: 200, maxPrice: 700 },
  'NDX': { polygon: 'QQQ', source: 'QQQ ETF Proxy', minPrice: 200, maxPrice: 700 },
  'DJI': { polygon: 'DIA', source: 'DIA ETF Proxy', minPrice: 200, maxPrice: 600 },
  'DAX': { polygon: 'EWG', source: 'EWG ETF Proxy', minPrice: 10, maxPrice: 100 },
  'FTSE': { polygon: 'EWU', source: 'EWU ETF Proxy', minPrice: 10, maxPrice: 100 },
  
  // ========== CRYPTO (Polygon X: prefix, 24/7 trading) ==========
  'BTCUSD': { polygon: 'X:BTCUSD', source: 'Polygon Crypto', minPrice: 10000, maxPrice: 500000 },
  'ETHUSD': { polygon: 'X:ETHUSD', source: 'Polygon Crypto', minPrice: 500, maxPrice: 20000 },
  'BNBUSD': { polygon: 'X:BNBUSD', source: 'Polygon Crypto', minPrice: 100, maxPrice: 2000 },
  'SOLUSD': { polygon: 'X:SOLUSD', source: 'Polygon Crypto', minPrice: 10, maxPrice: 1000 },
  'XRPUSD': { polygon: 'X:XRPUSD', source: 'Polygon Crypto', minPrice: 0.1, maxPrice: 20 },
  'ADAUSD': { polygon: 'X:ADAUSD', source: 'Polygon Crypto', minPrice: 0.1, maxPrice: 10 },
  'DOGEUSD': { polygon: 'X:DOGEUSD', source: 'Polygon Crypto', minPrice: 0.01, maxPrice: 2 },
  'MATICUSD': { polygon: 'X:MATICUSD', source: 'Polygon Crypto', minPrice: 0.1, maxPrice: 10 },
  'DOTUSD': { polygon: 'X:DOTUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'LTCUSD': { polygon: 'X:LTCUSD', source: 'Polygon Crypto', minPrice: 20, maxPrice: 500 },
  'LINKUSD': { polygon: 'X:LINKUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'AVAXUSD': { polygon: 'X:AVAXUSD', source: 'Polygon Crypto', minPrice: 5, maxPrice: 200 },
  'UNIUSD': { polygon: 'X:UNIUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'ATOMUSD': { polygon: 'X:ATOMUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'SHIBUSD': { polygon: 'X:SHIBUSD', source: 'Polygon Crypto', minPrice: 0.000001, maxPrice: 0.001 },
  
  // ========== FOREX (Polygon C: prefix, 24/5 trading) ==========
  'EURUSD': { polygon: 'C:EURUSD', source: 'Polygon FX', minPrice: 0.8, maxPrice: 1.5 },
  'GBPUSD': { polygon: 'C:GBPUSD', source: 'Polygon FX', minPrice: 1.0, maxPrice: 2.0 },
  'USDJPY': { polygon: 'C:USDJPY', source: 'Polygon FX', minPrice: 80, maxPrice: 200 },
  'USDCHF': { polygon: 'C:USDCHF', source: 'Polygon FX', minPrice: 0.7, maxPrice: 1.3 },
  'AUDUSD': { polygon: 'C:AUDUSD', source: 'Polygon FX', minPrice: 0.5, maxPrice: 1.2 },
  'USDCAD': { polygon: 'C:USDCAD', source: 'Polygon FX', minPrice: 1.0, maxPrice: 1.8 },
  'NZDUSD': { polygon: 'C:NZDUSD', source: 'Polygon FX', minPrice: 0.4, maxPrice: 1.0 },
  'EURGBP': { polygon: 'C:EURGBP', source: 'Polygon FX', minPrice: 0.7, maxPrice: 1.1 },
  'EURJPY': { polygon: 'C:EURJPY', source: 'Polygon FX', minPrice: 100, maxPrice: 200 },
  'GBPJPY': { polygon: 'C:GBPJPY', source: 'Polygon FX', minPrice: 120, maxPrice: 250 },
  
  // ========== COMMODITIES (Polygon FX for precious metals) ==========
  'XAUUSD': { polygon: 'C:XAUUSD', source: 'Polygon FX', minPrice: 1500, maxPrice: 5000 },
  'XAGUSD': { polygon: 'C:XAGUSD', source: 'Polygon FX', minPrice: 15, maxPrice: 100 },
  // Oil/Gas via ETFs (clearly labeled)
  'WTIUSD': { polygon: 'USO', source: 'USO ETF Proxy', minPrice: 30, maxPrice: 150 },
  'NATGAS': { polygon: 'UNG', source: 'UNG ETF Proxy', minPrice: 5, maxPrice: 100 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Get previous trading day for stocks
function getPreviousTradingDay(): string {
  const today = new Date();
  let daysBack = 1;
  if (today.getDay() === 0) daysBack = 2; // Sunday -> Friday
  if (today.getDay() === 1) daysBack = 3; // Monday -> Friday
  const date = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

// Crypto trades 24/7 — use current UTC date for grouped daily (otherwise we lag by 1 day).
function getTodayUTCDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Validate price is within expected range (catches x100/x0.01 errors)
function validatePrice(symbol: string, price: number): boolean {
  const config = symbolConfig[symbol];
  if (!config) return true;
  
  if (price < config.minPrice || price > config.maxPrice) {
    console.warn(`VALIDATION FAILED: ${symbol} = ${price} (expected ${config.minPrice}-${config.maxPrice})`);
    return false;
  }
  return true;
}

// Fetch grouped daily bars for US stocks (one API call for all)
async function fetchStocksGrouped(apiKey: string): Promise<Map<string, PriceData>> {
  const prices = new Map<string, PriceData>();
  const dateStr = getPreviousTradingDay();
  
  try {
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;
    console.log(`Fetching stocks grouped daily for ${dateStr}`);
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
          source: 'Polygon Stocks',
        });
      }
      console.log(`Got ${prices.size} stock prices`);
    } else {
      console.warn('Stocks grouped response:', data.status, data.message);
    }
  } catch (e) {
    console.error('Failed to fetch stocks grouped:', e);
  }
  
  return prices;
}

// Fetch grouped daily bars for crypto (one API call for all)
async function fetchCryptoGrouped(apiKey: string): Promise<Map<string, PriceData>> {
  const prices = new Map<string, PriceData>();
  const dateStr = getTodayUTCDate();
  
  try {
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/global/market/crypto/${dateStr}?adjusted=true&apiKey=${apiKey}`;
    console.log(`Fetching crypto grouped daily for ${dateStr}`);
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
          source: 'Polygon Crypto',
        });
      }
      console.log(`Got ${prices.size} crypto prices`);
    } else {
      console.warn('Crypto grouped response:', data.status, data.message);
    }
  } catch (e) {
    console.error('Failed to fetch crypto grouped:', e);
  }
  
  return prices;
}

// Fetch previous close for individual symbol (forex, commodities)
async function fetchPrevClose(polygonTicker: string, apiKey: string): Promise<{ price: number; prevClose: number } | null> {
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

// Refresh all prices from all markets
async function refreshPrices(apiKey: string): Promise<void> {
  console.log('=== Refreshing batch prices ===');
  const timestamp = Date.now();
  
  // Fetch stocks and crypto in parallel (grouped endpoints = efficient)
  const [stockPrices, cryptoPrices] = await Promise.all([
    fetchStocksGrouped(apiKey),
    fetchCryptoGrouped(apiKey),
  ]);
  
  // Map our symbols to fetched prices
  for (const [ourSymbol, config] of Object.entries(symbolConfig)) {
    const polygonTicker = config.polygon;
    
    // Check stock prices
    if (!polygonTicker.startsWith('X:') && !polygonTicker.startsWith('C:')) {
      const priceData = stockPrices.get(polygonTicker);
      if (priceData && validatePrice(ourSymbol, priceData.price)) {
        priceCache.set(ourSymbol, { ...priceData, source: config.source });
      }
    }
    
    // Check crypto prices
    if (polygonTicker.startsWith('X:')) {
      const priceData = cryptoPrices.get(polygonTicker);
      if (priceData && validatePrice(ourSymbol, priceData.price)) {
        priceCache.set(ourSymbol, { ...priceData, source: config.source });
      }
    }
  }
  
  // Fetch forex/commodities individually (rate-limited)
  const forexSymbols = Object.entries(symbolConfig).filter(([_, c]) => c.polygon.startsWith('C:'));
  let fetchCount = 0;
  const maxFetches = 5; // Respect free tier limits
  
  for (const [ourSymbol, config] of forexSymbols) {
    if (fetchCount >= maxFetches) {
      console.log(`Rate limit: stopping at ${maxFetches} forex fetches`);
      break;
    }
    
    // Skip if we have recent data
    const existing = priceCache.get(ourSymbol);
    if (existing && timestamp - existing.timestamp < BATCH_CACHE_TTL_MS * 2) {
      continue;
    }
    
    const result = await fetchPrevClose(config.polygon, apiKey);
    if (result && validatePrice(ourSymbol, result.price)) {
      const change = result.price - result.prevClose;
      const changePercent = result.prevClose > 0 ? (change / result.prevClose) * 100 : 0;
      priceCache.set(ourSymbol, {
        price: result.price,
        change,
        changePercent,
        timestamp,
        source: config.source,
      });
      fetchCount++;
      console.log(`Fetched FX: ${ourSymbol} = ${result.price}`);
    }
    
    await new Promise(r => setTimeout(r, 250)); // Rate limit delay
  }
  
  lastBatchFetch = Date.now();
  console.log(`=== Cache now has ${priceCache.size} entries ===`);
  
  // QA: Log sample prices
  const samples = ['BTCUSD', 'ETHUSD', 'EURUSD', 'XAUUSD', 'AAPL', 'MSFT'];
  for (const s of samples) {
    const p = priceCache.get(s);
    if (p) console.log(`QA: ${s} = $${p.price.toFixed(p.price < 10 ? 4 : 2)} (${p.source})`);
    else console.log(`QA: ${s} = NOT FOUND`);
  }
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

    const responseNow = Date.now();
    
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
      priceCache.forEach((data, symbol) => {
        result[symbol] = data;
      });
    }
    
    return json({
      prices: result,
      count: Object.keys(result).length,
      cacheAge: Math.max(0, responseNow - lastBatchFetch),
      lastUpdated: lastBatchFetch,
      lastUpdatedISO: new Date(lastBatchFetch).toISOString(),
    });

  } catch (error) {
    console.error('Batch prices error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
