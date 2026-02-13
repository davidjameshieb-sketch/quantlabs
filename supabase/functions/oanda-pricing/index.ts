// OANDA Live Pricing Edge Function
// Returns real-time bid/ask prices for all supported forex pairs from OANDA practice API

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

const ALL_OANDA_INSTRUMENTS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
  "USD_CHF", "EUR_CHF", "EUR_AUD", "GBP_AUD", "AUD_NZD",
  "USD_SGD", "USD_HKD", "USD_MXN", "USD_ZAR", "EUR_NZD",
  "GBP_NZD", "GBP_CAD", "EUR_CAD", "AUD_CAD", "NZD_CAD",
  "CHF_JPY", "CAD_JPY", "NZD_JPY", "CAD_CHF", "AUD_CHF",
];

// In-memory cache with 60s TTL
let cachedPrices: Record<string, { bid: number; ask: number; mid: number }> = {};
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5_000; // 5 seconds for near-realtime pricing

function oandaToDisplay(instrument: string): string {
  return instrument.replace("_", "/");
}

async function fetchOandaPrices(): Promise<Record<string, { bid: number; ask: number; mid: number }>> {
  const env = Deno.env.get("OANDA_ENV") || "practice";
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) {
    throw new Error("OANDA credentials not configured");
  }

  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  const url = `${host}/v3/accounts/${accountId}/pricing?instruments=${ALL_OANDA_INSTRUMENTS.join(",")}`;
  console.log(`[OANDA-PRICING] Fetching ${ALL_OANDA_INSTRUMENTS.length} instruments`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[OANDA-PRICING] API error ${res.status}: ${body}`);
    throw new Error(`OANDA API error: ${res.status}`);
  }

  const data = await res.json();
  const prices: Record<string, { bid: number; ask: number; mid: number }> = {};

  if (data.prices) {
    for (const p of data.prices) {
      if (p.bids?.length && p.asks?.length) {
        const bid = parseFloat(p.bids[0].price);
        const ask = parseFloat(p.asks[0].price);
        const displaySymbol = oandaToDisplay(p.instrument);
        prices[displaySymbol] = {
          bid,
          ask,
          mid: (bid + ask) / 2,
        };
      }
    }
  }

  console.log(`[OANDA-PRICING] Got prices for ${Object.keys(prices).length} pairs`);
  return prices;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    // Use cache if still fresh
    if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedPrices).length > 0) {
      console.log(`[OANDA-PRICING] Serving from cache (age: ${Math.round((now - cacheTimestamp) / 1000)}s)`);
      return new Response(
        JSON.stringify({
          prices: cachedPrices,
          count: Object.keys(cachedPrices).length,
          cached: true,
          cacheAge: now - cacheTimestamp,
          timestamp: cacheTimestamp,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch fresh prices
    const prices = await fetchOandaPrices();
    cachedPrices = prices;
    cacheTimestamp = Date.now();

    return new Response(
      JSON.stringify({
        prices,
        count: Object.keys(prices).length,
        cached: false,
        cacheAge: 0,
        timestamp: cacheTimestamp,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[OANDA-PRICING] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message, prices: {} }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
