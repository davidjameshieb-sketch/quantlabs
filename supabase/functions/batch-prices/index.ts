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
let lastCryptoFetch = 0;
const BATCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for stocks
const CRYPTO_CACHE_TTL_MS = 30 * 1000; // 30 seconds for crypto (real-time)

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
  
  // ========== INDICES & SECTOR ETFs ==========
  // Market Indices (direct ETFs)
  'SPY': { polygon: 'SPY', source: 'S&P 500 ETF', minPrice: 200, maxPrice: 800 },
  'QQQ': { polygon: 'QQQ', source: 'NASDAQ-100 ETF', minPrice: 200, maxPrice: 700 },
  'DIA': { polygon: 'DIA', source: 'Dow Jones ETF', minPrice: 200, maxPrice: 600 },
  'IWM': { polygon: 'IWM', source: 'Russell 2000 ETF', minPrice: 100, maxPrice: 400 },
  'VIX': { polygon: 'VIXY', source: 'VIX ETF Proxy', minPrice: 5, maxPrice: 200 },
  'EFA': { polygon: 'EFA', source: 'MSCI EAFE ETF', minPrice: 50, maxPrice: 150 },
  'EEM': { polygon: 'EEM', source: 'Emerging Markets ETF', minPrice: 20, maxPrice: 80 },
  'VEA': { polygon: 'VEA', source: 'Developed Markets ETF', minPrice: 30, maxPrice: 80 },
  
  // S&P 500 Sector ETFs (SPDR Select Sector series)
  'XLB': { polygon: 'XLB', source: 'Materials Sector ETF', minPrice: 40, maxPrice: 150 },
  'XLE': { polygon: 'XLE', source: 'Energy Sector ETF', minPrice: 40, maxPrice: 150 },
  'XLF': { polygon: 'XLF', source: 'Financials Sector ETF', minPrice: 20, maxPrice: 80 },
  'XLI': { polygon: 'XLI', source: 'Industrials Sector ETF', minPrice: 80, maxPrice: 200 },
  'XLK': { polygon: 'XLK', source: 'Technology Sector ETF', minPrice: 100, maxPrice: 350 },
  'XLP': { polygon: 'XLP', source: 'Consumer Staples ETF', minPrice: 50, maxPrice: 120 },
  'XLU': { polygon: 'XLU', source: 'Utilities Sector ETF', minPrice: 30, maxPrice: 100 },
  'XLV': { polygon: 'XLV', source: 'Health Care Sector ETF', minPrice: 100, maxPrice: 200 },
  'XLY': { polygon: 'XLY', source: 'Consumer Disc. ETF', minPrice: 100, maxPrice: 300 },
  'XLRE': { polygon: 'XLRE', source: 'Real Estate ETF', minPrice: 25, maxPrice: 70 },
  'XLC': { polygon: 'XLC', source: 'Comm. Services ETF', minPrice: 40, maxPrice: 150 },
  
  // Legacy index mappings (for backward compatibility)
  'SPX500': { polygon: 'SPY', source: 'SPY ETF Proxy', minPrice: 200, maxPrice: 800 },
  'SPX': { polygon: 'SPY', source: 'SPY ETF Proxy', minPrice: 200, maxPrice: 800 },
  'NASDAQ': { polygon: 'QQQ', source: 'QQQ ETF Proxy', minPrice: 200, maxPrice: 700 },
  'NDX': { polygon: 'QQQ', source: 'QQQ ETF Proxy', minPrice: 200, maxPrice: 700 },
  'DJI': { polygon: 'DIA', source: 'DIA ETF Proxy', minPrice: 200, maxPrice: 600 },
  'DAX': { polygon: 'EWG', source: 'EWG ETF Proxy', minPrice: 10, maxPrice: 100 },
  'FTSE': { polygon: 'EWU', source: 'EWU ETF Proxy', minPrice: 10, maxPrice: 100 },
  'RUT': { polygon: 'IWM', source: 'IWM ETF Proxy', minPrice: 100, maxPrice: 400 },
  'RUSSELL': { polygon: 'IWM', source: 'IWM ETF Proxy', minPrice: 100, maxPrice: 400 },
  
  // ========== CRYPTO (Polygon X: prefix, 24/7 trading) ==========
  // Only include cryptos with confirmed Polygon data feeds
  'BTCUSD': { polygon: 'X:BTCUSD', source: 'Polygon Crypto', minPrice: 10000, maxPrice: 500000 },
  'ETHUSD': { polygon: 'X:ETHUSD', source: 'Polygon Crypto', minPrice: 500, maxPrice: 20000 },
  'SOLUSD': { polygon: 'X:SOLUSD', source: 'Polygon Crypto', minPrice: 10, maxPrice: 1000 },
  'XRPUSD': { polygon: 'X:XRPUSD', source: 'Polygon Crypto', minPrice: 0.1, maxPrice: 20 },
  'ADAUSD': { polygon: 'X:ADAUSD', source: 'Polygon Crypto', minPrice: 0.1, maxPrice: 10 },
  'DOGEUSD': { polygon: 'X:DOGEUSD', source: 'Polygon Crypto', minPrice: 0.01, maxPrice: 2 },
  'AVAXUSD': { polygon: 'X:AVAXUSD', source: 'Polygon Crypto', minPrice: 5, maxPrice: 200 },
  'DOTUSD': { polygon: 'X:DOTUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'LINKUSD': { polygon: 'X:LINKUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'SHIBUSD': { polygon: 'X:SHIBUSD', source: 'Polygon Crypto', minPrice: 0.000001, maxPrice: 0.001 },
  'LTCUSD': { polygon: 'X:LTCUSD', source: 'Polygon Crypto', minPrice: 20, maxPrice: 500 },
  'UNIUSD': { polygon: 'X:UNIUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'ATOMUSD': { polygon: 'X:ATOMUSD', source: 'Polygon Crypto', minPrice: 1, maxPrice: 100 },
  'BCHUSD': { polygon: 'X:BCHUSD', source: 'Polygon Crypto', minPrice: 50, maxPrice: 1000 },
  'XLMUSD': { polygon: 'X:XLMUSD', source: 'Polygon Crypto', minPrice: 0.05, maxPrice: 2 },
  'ETCUSD': { polygon: 'X:ETCUSD', source: 'Polygon Crypto', minPrice: 5, maxPrice: 200 },
  'XMRUSD': { polygon: 'X:XMRUSD', source: 'Polygon Crypto', minPrice: 50, maxPrice: 500 },
  'AAVEUSD': { polygon: 'X:AAVEUSD', source: 'Polygon Crypto', minPrice: 30, maxPrice: 800 },
  'ALGOUSD': { polygon: 'X:ALGOUSD', source: 'Polygon Crypto', minPrice: 0.05, maxPrice: 5 },
  'ZECUSD': { polygon: 'X:ZECUSD', source: 'Polygon Crypto', minPrice: 10, maxPrice: 500 },
  
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
  
  // ========== COMMODITIES (ETFs - direct mapping) ==========
  'GLD': { polygon: 'GLD', source: 'SPDR Gold ETF', minPrice: 100, maxPrice: 600 },
  'SLV': { polygon: 'SLV', source: 'iShares Silver ETF', minPrice: 15, maxPrice: 100 },
  'USO': { polygon: 'USO', source: 'US Oil Fund', minPrice: 30, maxPrice: 150 },
  'BNO': { polygon: 'BNO', source: 'Brent Oil Fund', minPrice: 15, maxPrice: 100 },
  'UNG': { polygon: 'UNG', source: 'US Natural Gas Fund', minPrice: 5, maxPrice: 100 },
  'CPER': { polygon: 'CPER', source: 'US Copper Index', minPrice: 10, maxPrice: 50 },
  'PPLT': { polygon: 'PPLT', source: 'Platinum Shares', minPrice: 50, maxPrice: 200 },
  'PALL': { polygon: 'PALL', source: 'Palladium Shares', minPrice: 50, maxPrice: 400 },
  'WEAT': { polygon: 'WEAT', source: 'Wheat Fund', minPrice: 3, maxPrice: 30 },
  'CORN': { polygon: 'CORN', source: 'Teucrium Corn', minPrice: 15, maxPrice: 40 },
  'SOYB': { polygon: 'SOYB', source: 'Teucrium Soybean', minPrice: 20, maxPrice: 50 },
  'JO': { polygon: 'JO', source: 'iPath Coffee', minPrice: 20, maxPrice: 100 },
  'CANE': { polygon: 'CANE', source: 'Sugar Fund', minPrice: 5, maxPrice: 20 },
  'BAL': { polygon: 'BAL', source: 'iPath Cotton', minPrice: 30, maxPrice: 100 },
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

// Get previous day for crypto (Polygon free tier only provides grouped daily)
function getCryptoPreviousDay(): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.toISOString().split('T')[0];
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

// Fetch crypto prices using grouped daily endpoint (reliable for free tier)
async function fetchCryptoPrices(apiKey: string): Promise<Map<string, PriceData>> {
  const prices = new Map<string, PriceData>();
  const dateStr = getCryptoPreviousDay();
  
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
          source: 'Polygon Crypto (Prev Close)',
          isDelayed: true,
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
  
  // Fetch stocks (grouped) and crypto (real-time last trade) in parallel
  const [stockPrices, cryptoPrices] = await Promise.all([
    fetchStocksGrouped(apiKey),
    fetchCryptoPrices(apiKey),
  ]);
  
  // Map our symbols to fetched prices
  for (const [ourSymbol, config] of Object.entries(symbolConfig)) {
    const polygonTicker = config.polygon;
    
    // Check stock prices (includes ETFs like GLD, SLV, USO, UNG)
    if (!polygonTicker.startsWith('X:') && !polygonTicker.startsWith('C:')) {
      const priceData = stockPrices.get(polygonTicker);
      if (priceData) {
        if (validatePrice(ourSymbol, priceData.price)) {
          priceCache.set(ourSymbol, { ...priceData, source: config.source });
          console.log(`Mapped ${ourSymbol} -> ${polygonTicker} = $${priceData.price}`);
        } else {
          console.warn(`Validation FAILED for ${ourSymbol}: ${priceData.price}`);
        }
      } else {
        console.warn(`No stock data for ${polygonTicker} (wanted by ${ourSymbol})`);
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
