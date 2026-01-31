import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PolygonAggregateResult {
  v: number;  // volume
  vw: number; // volume weighted average price
  o: number;  // open
  c: number;  // close
  h: number;  // high
  l: number;  // low
  t: number;  // timestamp
  n: number;  // number of transactions
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

// Map our symbols to Polygon tickers
const symbolMapping: Record<string, string> = {
  // US Stocks / Indices (using ETFs as proxies for indices)
  'SPX500': 'SPY',
  'NASDAQ': 'QQQ',
  'DJI': 'DIA',
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
  // Commodities (using ETFs)
  'XAUUSD': 'GLD',
  'XAGUSD': 'SLV',
  'WTIUSD': 'USO',
  'NATGAS': 'UNG',
  // European indices (ETFs)
  'DAX': 'EWG',
  'FTSE': 'EWU',
};

// Map timeframe to Polygon multiplier and timespan
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
    if (!POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY is not configured');
    }

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    let timeframe = url.searchParams.get('timeframe') || '1d';
    const limit = parseInt(url.searchParams.get('limit') || '100');

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const polygonTicker = symbolMapping[symbol] || symbol;
    
    // Free tier only supports daily data - force daily for intraday requests
    const originalTimeframe = timeframe;
    if (['1m', '5m', '15m', '1h', '4h'].includes(timeframe)) {
      timeframe = '1d';
    }
    
    const tf = timeframeMapping[timeframe] || timeframeMapping['1d'];

    // Calculate date range - get more history for daily
    const now = new Date();
    const daysBack = timeframe === '1w' ? limit * 7 : limit + 5;
    
    const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    
    const fromStr = from.toISOString().split('T')[0];
    const toStr = now.toISOString().split('T')[0];

    console.log(`Fetching ${symbol} (${polygonTicker}) ${timeframe} from ${fromStr} to ${toStr}`);

    const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${polygonTicker}/range/${tf.multiplier}/${tf.timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=${limit}&apiKey=${POLYGON_API_KEY}`;

    const response = await fetch(polygonUrl);
    const data: PolygonResponse = await response.json();

    if (!response.ok || data.status === 'ERROR' || data.status === 'NOT_AUTHORIZED') {
      console.error('Polygon API error:', data);
      return new Response(
        JSON.stringify({ 
          error: data.message || data.error || 'Failed to fetch market data',
          symbol,
          polygonTicker,
          note: data.status === 'NOT_AUTHORIZED' ? 'Upgrade Polygon plan for intraday data' : undefined
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform to our OHLC format
    const ohlcData = (data.results || []).map(bar => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));

    console.log(`Returning ${ohlcData.length} bars for ${symbol} (requested ${originalTimeframe}, served ${timeframe})`);

    return new Response(
      JSON.stringify({
        symbol,
        timeframe: originalTimeframe,
        actualTimeframe: timeframe,
        count: ohlcData.length,
        data: ohlcData,
        note: originalTimeframe !== timeframe ? 'Daily data returned (intraday requires paid Polygon plan)' : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Market data error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
