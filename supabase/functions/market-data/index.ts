import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PolygonAggregateResult {
  v: number;
  vw: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
  n: number;
}

interface PolygonResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results?: PolygonAggregateResult[];
  status: string;
  request_id: string;
  count?: number;
  error?: string;
  message?: string;
}

// Simple in-memory cache
type CacheEntry = { payload: unknown; timestamp: number };
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Symbol whitelist — only these are allowed
const symbolMapping: Record<string, string> = {
  'SPX500': 'SPY', 'NASDAQ': 'QQQ', 'DJI': 'DIA',
  'BTCUSD': 'X:BTCUSD', 'ETHUSD': 'X:ETHUSD', 'SOLUSD': 'X:SOLUSD',
  'XRPUSD': 'X:XRPUSD', 'ADAUSD': 'X:ADAUSD',
  'EURUSD': 'C:EURUSD', 'GBPUSD': 'C:GBPUSD', 'USDJPY': 'C:USDJPY',
  'AUDUSD': 'C:AUDUSD', 'USDCAD': 'C:USDCAD', 'USDCHF': 'C:USDCHF',
  'XAUUSD': 'GLD', 'XAGUSD': 'SLV', 'WTIUSD': 'USO', 'NATGAS': 'UNG',
  'DAX': 'EWG', 'FTSE': 'EWU',
  // Direct tickers (stocks & ETFs)
  'AAPL': 'AAPL', 'MSFT': 'MSFT', 'GOOGL': 'GOOGL', 'AMZN': 'AMZN',
  'TSLA': 'TSLA', 'NVDA': 'NVDA', 'META': 'META', 'JPM': 'JPM',
  'SPY': 'SPY', 'QQQ': 'QQQ', 'DIA': 'DIA', 'IWM': 'IWM',
  'XLB': 'XLB', 'XLE': 'XLE', 'XLF': 'XLF', 'XLI': 'XLI',
  'XLK': 'XLK', 'XLP': 'XLP', 'XLU': 'XLU', 'XLV': 'XLV',
  'XLY': 'XLY', 'XLRE': 'XLRE', 'XLC': 'XLC',
  'GLD': 'GLD', 'SLV': 'SLV', 'USO': 'USO', 'UNG': 'UNG',
};

const validTimeframes = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w']);

const timeframeMapping: Record<string, { multiplier: number; timespan: string }> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '4h': { multiplier: 4, timespan: 'hour' },
  '1d': { multiplier: 1, timespan: 'day' },
  '1w': { multiplier: 1, timespan: 'week' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authentication ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[MARKET-DATA] Auth failed:', authError?.message);
      return json({ error: 'Unauthorized' }, 401);
    }
    console.log(`[MARKET-DATA] Authenticated user: ${user.id}`);

    // ── API Key check ──
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
    if (!POLYGON_API_KEY) {
      console.error('[MARKET-DATA] POLYGON_API_KEY not configured');
      return json({ error: 'Service temporarily unavailable' }, 503);
    }

    // ── Input validation ──
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const timeframe = url.searchParams.get('timeframe') || '1d';
    const limitParam = parseInt(url.searchParams.get('limit') || '100');

    if (!symbol || symbol.length > 20) {
      return json({ error: 'Invalid symbol' }, 400);
    }

    // Whitelist check — reject unknown symbols
    const polygonTicker = symbolMapping[symbol];
    if (!polygonTicker) {
      return json({ error: 'Symbol not supported' }, 400);
    }

    if (!validTimeframes.has(timeframe)) {
      return json({ error: 'Invalid timeframe' }, 400);
    }

    const limit = Math.max(1, Math.min(500, isNaN(limitParam) ? 100 : limitParam));
    const tf = timeframeMapping[timeframe];

    // Calculate date range
    const now = new Date();
    const daysBack = timeframe === '1w' ? limit * 7 : limit + 5;
    const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = now.toISOString().split('T')[0];

    console.log(`[MARKET-DATA] Fetching ${symbol} (${polygonTicker}) ${timeframe} from ${fromStr} to ${toStr}`);

    const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${polygonTicker}/range/${tf.multiplier}/${tf.timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=${limit}&apiKey=${POLYGON_API_KEY}`;

    // Serve from cache if fresh
    const cacheKey = `${polygonTicker}:${timeframe}:${fromStr}:${toStr}:${limit}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return json({ ...(cached.payload as Record<string, unknown>), cache: 'hit' });
    }

    const response = await fetch(polygonUrl);
    const data: PolygonResponse = await response.json();

    if (!response.ok || data.status === 'ERROR' || data.status === 'NOT_AUTHORIZED') {
      console.error('[MARKET-DATA] Upstream error:', data.status, data.message);

      const isRateLimit = /maximum requests per minute/i.test(data.message || '');
      if (isRateLimit && cached) {
        return json({ ...(cached.payload as Record<string, unknown>), cache: 'stale' });
      }

      if (isRateLimit) return json({ error: 'Too many requests' }, 429);
      if (data.status === 'NOT_AUTHORIZED') return json({ error: 'Access denied' }, 403);
      return json({ error: 'Market data unavailable' }, 503);
    }

    // Transform to OHLC format
    const ohlcData = (data.results || []).map(bar => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));

    console.log(`[MARKET-DATA] Returning ${ohlcData.length} bars for ${symbol}`);

    const payload = {
      symbol,
      timeframe,
      count: ohlcData.length,
      data: ohlcData,
      cache: 'miss',
    };

    responseCache.set(cacheKey, { payload, timestamp: Date.now() });
    return json(payload);

  } catch (error) {
    console.error('[MARKET-DATA] Error:', error);
    return json({ error: 'Service temporarily unavailable' }, 503);
  }
});
