// OANDA Market Intelligence Edge Function
// Fetches order book, position book, transaction history, and instrument details
// from the OANDA v20 REST API for the Sovereign Intelligence system state.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

const FOCUS_INSTRUMENTS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
  "USD_CHF", "EUR_CHF", "EUR_AUD", "GBP_AUD", "AUD_NZD",
];

// ── In-memory caches ──
let cachedOrderBooks: Record<string, unknown> = {};
let cachedPositionBooks: Record<string, unknown> = {};
let cachedInstruments: Record<string, unknown> = {};
let cachedTransactions: unknown[] = [];
let cachedPricing: Record<string, unknown> = {};
let cacheTimestamps = { orderBook: 0, positionBook: 0, instruments: 0, transactions: 0, pricing: 0 };

const CACHE_TTL = {
  orderBook: 15 * 60_000,     // 15 min (OANDA updates every 20 min)
  positionBook: 15 * 60_000,  // 15 min
  instruments: 60 * 60_000,   // 1 hour (static data)
  transactions: 60_000,       // 1 min
  pricing: 5_000,             // 5 seconds (near-realtime)
};

function getOandaCreds(env: string) {
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  return { apiToken, accountId, host };
}

async function oandaGet(url: string, apiToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[MARKET-INTEL] ${res.status} from ${url}: ${body.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// ── Order Book ──
async function fetchOrderBooks(host: string, apiToken: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (now - cacheTimestamps.orderBook < CACHE_TTL.orderBook && Object.keys(cachedOrderBooks).length > 0) {
    return cachedOrderBooks;
  }

  const books: Record<string, unknown> = {};
  // Fetch top 6 pairs to stay within rate limits
  const topPairs = FOCUS_INSTRUMENTS.slice(0, 6);
  const results = await Promise.allSettled(
    topPairs.map(async (inst) => {
      const data = await oandaGet(`${host}/v3/instruments/${inst}/orderBook`, apiToken);
      if (data?.orderBook) {
        const ob = data.orderBook;
        // Extract just the key buckets around current price
        const buckets = (ob.buckets || []).map((b: any) => ({
          price: b.price,
          longPct: parseFloat(b.longCountPercent),
          shortPct: parseFloat(b.shortCountPercent),
        }));
        // Find clusters — buckets with significantly more orders
        const avgLong = buckets.reduce((s: number, b: any) => s + b.longPct, 0) / (buckets.length || 1);
        const avgShort = buckets.reduce((s: number, b: any) => s + b.shortPct, 0) / (buckets.length || 1);
        const longClusters = buckets.filter((b: any) => b.longPct > avgLong * 2).slice(0, 5);
        const shortClusters = buckets.filter((b: any) => b.shortPct > avgShort * 2).slice(0, 5);

        books[inst.replace("_", "/")] = {
          time: ob.time,
          price: ob.price,
          bucketWidth: ob.bucketWidth,
          totalBuckets: buckets.length,
          longClusters,
          shortClusters,
          retailStopZones: [
            ...longClusters.map((b: any) => ({ price: b.price, type: "long_cluster", pct: b.longPct })),
            ...shortClusters.map((b: any) => ({ price: b.price, type: "short_cluster", pct: b.shortPct })),
          ].sort((a: any, b: any) => parseFloat(b.pct) - parseFloat(a.pct)).slice(0, 5),
        };
      }
    })
  );

  if (Object.keys(books).length > 0) {
    cachedOrderBooks = books;
    cacheTimestamps.orderBook = now;
  }
  console.log(`[MARKET-INTEL] Order books: ${Object.keys(books).length} pairs`);
  return cachedOrderBooks;
}

// ── Position Book ──
async function fetchPositionBooks(host: string, apiToken: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (now - cacheTimestamps.positionBook < CACHE_TTL.positionBook && Object.keys(cachedPositionBooks).length > 0) {
    return cachedPositionBooks;
  }

  const books: Record<string, unknown> = {};
  const topPairs = FOCUS_INSTRUMENTS.slice(0, 6);
  await Promise.allSettled(
    topPairs.map(async (inst) => {
      const data = await oandaGet(`${host}/v3/instruments/${inst}/positionBook`, apiToken);
      if (data?.positionBook) {
        const pb = data.positionBook;
        const buckets = (pb.buckets || []).map((b: any) => ({
          price: b.price,
          longPct: parseFloat(b.longCountPercent),
          shortPct: parseFloat(b.shortCountPercent),
        }));
        const netBias = buckets.reduce((s: number, b: any) => s + (b.longPct - b.shortPct), 0);
        books[inst.replace("_", "/")] = {
          time: pb.time,
          price: pb.price,
          netRetailBias: netBias > 0 ? "LONG" : "SHORT",
          netBiasStrength: Math.abs(netBias).toFixed(2),
          topLongLevels: buckets.sort((a: any, b: any) => b.longPct - a.longPct).slice(0, 3),
          topShortLevels: [...buckets].sort((a: any, b: any) => b.shortPct - a.shortPct).slice(0, 3),
        };
      }
    })
  );

  if (Object.keys(books).length > 0) {
    cachedPositionBooks = books;
    cacheTimestamps.positionBook = now;
  }
  console.log(`[MARKET-INTEL] Position books: ${Object.keys(books).length} pairs`);
  return cachedPositionBooks;
}

// ── Instrument Details ──
async function fetchInstrumentDetails(host: string, accountId: string, apiToken: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (now - cacheTimestamps.instruments < CACHE_TTL.instruments && Object.keys(cachedInstruments).length > 0) {
    return cachedInstruments;
  }

  const url = `${host}/v3/accounts/${accountId}/instruments?instruments=${FOCUS_INSTRUMENTS.join(",")}`;
  const data = await oandaGet(url, apiToken);
  if (data?.instruments) {
    const instruments: Record<string, unknown> = {};
    for (const inst of data.instruments) {
      instruments[inst.name.replace("_", "/")] = {
        type: inst.type,
        displayName: inst.displayName,
        pipLocation: inst.pipLocation,
        displayPrecision: inst.displayPrecision,
        marginRate: inst.marginRate,
        minimumTradeSize: inst.minimumTradeSize,
        maximumTrailingStopDistance: inst.maximumTrailingStopDistance,
        minimumTrailingStopDistance: inst.minimumTrailingStopDistance,
        maximumPositionSize: inst.maximumPositionSize,
        maximumOrderUnits: inst.maximumOrderUnits,
        financing: inst.financing ? {
          longRate: inst.financing.longRate,
          shortRate: inst.financing.shortRate,
        } : null,
        guaranteedStopLossOrderMode: inst.guaranteedStopLossOrderMode,
        tags: inst.tags?.map((t: any) => t.name) || [],
      };
    }
    cachedInstruments = instruments;
    cacheTimestamps.instruments = now;
    console.log(`[MARKET-INTEL] Instruments: ${Object.keys(instruments).length} loaded`);
  }
  return cachedInstruments;
}

// ── Recent Transactions ──
async function fetchRecentTransactions(host: string, accountId: string, apiToken: string): Promise<unknown[]> {
  const now = Date.now();
  if (now - cacheTimestamps.transactions < CACHE_TTL.transactions && cachedTransactions.length > 0) {
    return cachedTransactions;
  }

  // Get last 100 transactions (covers fills, SL/TP triggers, financing, etc.)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = `${host}/v3/accounts/${accountId}/transactions?from=${encodeURIComponent(since)}&type=ORDER_FILL,STOP_LOSS_ORDER,TAKE_PROFIT_ORDER,TRAILING_STOP_LOSS_ORDER,ORDER_CANCEL&pageSize=100`;
  const data = await oandaGet(url, apiToken);

  if (data?.pages && data.pages.length > 0) {
    // Fetch first page of transaction details
    const pageUrl = data.pages[0];
    const pageData = await oandaGet(pageUrl, apiToken);
    if (pageData?.transactions) {
      cachedTransactions = pageData.transactions.slice(-50).map((t: any) => ({
        id: t.id,
        type: t.type,
        time: t.time,
        instrument: t.instrument,
        units: t.units,
        price: t.price,
        pl: t.pl,
        financing: t.financing,
        commission: t.commission,
        halfSpreadCost: t.halfSpreadCost,
        fullVWAP: t.fullVWAP,
        reason: t.reason,
        tradeID: t.tradeOpened?.tradeID || t.tradesClosed?.[0]?.tradeID || t.tradeReduced?.tradeID,
      }));
      cacheTimestamps.transactions = now;
      console.log(`[MARKET-INTEL] Transactions: ${cachedTransactions.length} recent`);
    }
  } else {
    // Fallback: try sinceid approach
    const sinceUrl = `${host}/v3/accounts/${accountId}/transactions?from=${encodeURIComponent(since)}&pageSize=50`;
    const fallback = await oandaGet(sinceUrl, apiToken);
    if (fallback?.count !== undefined) {
      cachedTransactions = [];
      cacheTimestamps.transactions = now;
    }
  }

  return cachedTransactions;
}

// ── Live Pricing (5s cache) ──
async function fetchLivePricing(host: string, accountId: string, apiToken: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (now - cacheTimestamps.pricing < CACHE_TTL.pricing && Object.keys(cachedPricing).length > 0) {
    return cachedPricing;
  }

  const url = `${host}/v3/accounts/${accountId}/pricing?instruments=${FOCUS_INSTRUMENTS.join(",")}`;
  const data = await oandaGet(url, apiToken);
  if (data?.prices) {
    const pricing: Record<string, unknown> = {};
    for (const p of data.prices) {
      if (p.bids?.length && p.asks?.length) {
        const bid = parseFloat(p.bids[0].price);
        const ask = parseFloat(p.asks[0].price);
        const spread = ask - bid;
        const symbol = p.instrument.replace("_", "/");
        const pipMultiplier = p.instrument.includes("JPY") ? 100 : 10000;
        pricing[symbol] = {
          bid,
          ask,
          mid: (bid + ask) / 2,
          spread: +(spread * pipMultiplier).toFixed(1),
          spreadPips: +(spread * pipMultiplier).toFixed(1),
          tradeable: p.tradeable,
          time: p.time,
          liquidity: p.bids.length + p.asks.length, // depth indicator
          bidDepth: p.bids.map((b: any) => ({ price: b.price, liquidity: b.liquidity })),
          askDepth: p.asks.map((a: any) => ({ price: a.price, liquidity: a.liquidity })),
        };
      }
    }
    cachedPricing = pricing;
    cacheTimestamps.pricing = now;
    console.log(`[MARKET-INTEL] Pricing: ${Object.keys(pricing).length} pairs (5s cache)`);
  }
  return cachedPricing;
}

// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const env = Deno.env.get("OANDA_ENV") || "live";
    const { apiToken, accountId, host } = getOandaCreds(env);

    if (!apiToken || !accountId) {
      return new Response(
        JSON.stringify({ error: "OANDA credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse optional query params for selective fetching
    const url = new URL(req.url);
    const sections = (url.searchParams.get("sections") || "all").split(",");
    const fetchAll = sections.includes("all");

    const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

    // Parallel fetch all sections
    const fetches: Promise<void>[] = [];

    if (fetchAll || sections.includes("pricing")) {
      fetches.push(
        fetchLivePricing(host, accountId, apiToken).then(d => { results.livePricing = d; })
      );
    }
    if (fetchAll || sections.includes("orderBook")) {
      fetches.push(
        fetchOrderBooks(host, apiToken).then(d => { results.orderBook = d; })
      );
    }
    if (fetchAll || sections.includes("positionBook")) {
      fetches.push(
        fetchPositionBooks(host, apiToken).then(d => { results.positionBook = d; })
      );
    }
    if (fetchAll || sections.includes("instruments")) {
      fetches.push(
        fetchInstrumentDetails(host, accountId, apiToken).then(d => { results.instruments = d; })
      );
    }
    if (fetchAll || sections.includes("transactions")) {
      fetches.push(
        fetchRecentTransactions(host, accountId, apiToken).then(d => { results.transactions = d; })
      );
    }

    await Promise.allSettled(fetches);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MARKET-INTEL] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
