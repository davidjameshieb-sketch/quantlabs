const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { ticker, series_ticker, period } = body;

    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seriesTicker = series_ticker || extractSeries(ticker);
    // period_interval: 1 (1min), 60 (1hr), 1440 (1day)
    const periodInterval = period || 60;

    // Kalshi requires start_ts — go back based on period
    const lookbackMs = periodInterval === 1 ? 6 * 3600 * 1000       // 6h for 1min candles
      : periodInterval === 60 ? 14 * 24 * 3600 * 1000               // 14d for 1hr candles
      : 90 * 24 * 3600 * 1000;                                       // 90d for daily candles
    const startTs = Math.floor((Date.now() - lookbackMs) / 1000);
    const endTs = Math.floor(Date.now() / 1000);

    const params = new URLSearchParams({
      period_interval: String(periodInterval),
      start_ts: String(startTs),
      end_ts: String(endTs),
    });

    const url = `${KALSHI_API}/series/${seriesTicker}/markets/${ticker}/candlesticks?${params}`;
    console.log(`Fetching candlesticks: ${url}`);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Kalshi candlestick error ${res.status}: ${errText}`);

      if (res.status === 404 || res.status === 400) {
        return new Response(JSON.stringify({
          candles: [],
          ticker,
          series_ticker: seriesTicker,
          period: periodInterval,
          error: "No candlestick data available for this market",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Kalshi API returned ${res.status}`);
    }

    const data = await res.json();
    const candles = (data.candlesticks || []).map((c: any) => ({
      time: c.end_period_ts || c.start_period_ts || c.ts,
      open: c.open / 100,
      high: c.high / 100,
      low: c.low / 100,
      close: c.close / 100,
      volume: c.volume || 0,
      oi: c.open_interest || 0,
    }));

    candles.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return new Response(JSON.stringify({
      candles,
      ticker,
      series_ticker: seriesTicker,
      period: periodInterval,
      count: candles.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chart data error:", error);
    return new Response(JSON.stringify({ error: error.message, candles: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractSeries(ticker: string): string {
  const match = ticker.match(/^([A-Z0-9]+)-/);
  return match ? match[1] : ticker;
}
