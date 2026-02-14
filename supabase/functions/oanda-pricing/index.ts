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

// Dynamic instrument list — fetched from account on first call
let allForexInstruments: string[] = [];
let instrumentListTs = 0;
const INSTRUMENT_LIST_TTL = 60 * 60_000; // 1 hour

// In-memory cache
let cachedPrices: Record<string, { bid: number; ask: number; mid: number }> = {};
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5_000;

async function getAllInstruments(host: string, accountId: string, apiToken: string): Promise<string[]> {
  const now = Date.now();
  if (now - instrumentListTs < INSTRUMENT_LIST_TTL && allForexInstruments.length > 0) {
    return allForexInstruments;
  }
  const res = await fetch(`${host}/v3/accounts/${accountId}/instruments?type=CURRENCY`, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (res.ok) {
    const data = await res.json();
    if (data.instruments) {
      allForexInstruments = data.instruments.map((i: any) => i.name);
      instrumentListTs = now;
      console.log(`[OANDA-PRICING] Discovered ${allForexInstruments.length} forex instruments`);
    }
  }
  return allForexInstruments.length > 0 ? allForexInstruments : ["EUR_USD", "GBP_USD", "USD_JPY"];
}

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
  const instruments = await getAllInstruments(host, accountId, apiToken);
  const url = `${host}/v3/accounts/${accountId}/pricing?instruments=${instruments.join(",")}`;
  console.log(`[OANDA-PRICING] Fetching ${instruments.length} instruments`);

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
