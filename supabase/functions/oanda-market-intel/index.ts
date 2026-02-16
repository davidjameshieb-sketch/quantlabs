// OANDA Market Intelligence Edge Function
// Fetches live pricing, transaction history, instrument details,
// and secondary price references from the OANDA v20 REST API.
// Order book/position book endpoints removed — OANDA restricts access on both live and practice tokens.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

// Dynamic instrument list — fetched from account
let cachedForexInstruments: string[] = [];
let instrumentListTimestamp = 0;
const INSTRUMENT_LIST_TTL = 60 * 60_000; // 1 hour

// ── In-memory caches ──
let cachedInstruments: Record<string, unknown> = {};
let cachedTransactions: unknown[] = [];
let cachedPricing: Record<string, unknown> = {};
let cacheTimestamps = { instruments: 0, transactions: 0, pricing: 0 };

const CACHE_TTL = {
  instruments: 60 * 60_000,
  transactions: 60_000,
  pricing: 5_000,
};

async function getForexInstruments(host: string, accountId: string, apiToken: string): Promise<string[]> {
  const now = Date.now();
  if (now - instrumentListTimestamp < INSTRUMENT_LIST_TTL && cachedForexInstruments.length > 0) {
    return cachedForexInstruments;
  }
  const url = `${host}/v3/accounts/${accountId}/instruments?type=CURRENCY`;
  const data = await oandaGet(url, apiToken);
  if (data?.instruments) {
    cachedForexInstruments = data.instruments.map((i: any) => i.name);
    instrumentListTimestamp = now;
    console.log(`[MARKET-INTEL] Discovered ${cachedForexInstruments.length} forex instruments`);
  }
  return cachedForexInstruments;
}

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

// ── Instrument Details ──
async function fetchInstrumentDetails(host: string, accountId: string, apiToken: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (now - cacheTimestamps.instruments < CACHE_TTL.instruments && Object.keys(cachedInstruments).length > 0) {
    return cachedInstruments;
  }

  const allInst = await getForexInstruments(host, accountId, apiToken);
  const url = `${host}/v3/accounts/${accountId}/instruments?instruments=${allInst.join(",")}`;
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

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = `${host}/v3/accounts/${accountId}/transactions?from=${encodeURIComponent(since)}&type=ORDER_FILL,STOP_LOSS_ORDER,TAKE_PROFIT_ORDER,TRAILING_STOP_LOSS_ORDER,ORDER_CANCEL&pageSize=100`;
  const data = await oandaGet(url, apiToken);

  if (data?.pages && data.pages.length > 0) {
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

  const instruments = await getForexInstruments(host, accountId, apiToken);
  const url = `${host}/v3/accounts/${accountId}/pricing?instruments=${instruments.join(",")}`;
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
          liquidity: p.bids.length + p.asks.length,
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

// ── Secondary Price Reference (Multi-Broker Arbitrage) ──
async function fetchSecondaryPrices(): Promise<Record<string, { mid: number; source: string }>> {
  const prices: Record<string, { mid: number; source: string }> = {};
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP,JPY,AUD,CAD,NZD,CHF");
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        const r = data.rates;
        if (r.EUR) prices["EUR/USD"] = { mid: 1 / r.EUR, source: "exchangerate.host" };
        if (r.GBP) prices["GBP/USD"] = { mid: 1 / r.GBP, source: "exchangerate.host" };
        if (r.JPY) prices["USD/JPY"] = { mid: r.JPY, source: "exchangerate.host" };
        if (r.AUD) prices["AUD/USD"] = { mid: 1 / r.AUD, source: "exchangerate.host" };
        if (r.CAD) prices["USD/CAD"] = { mid: r.CAD, source: "exchangerate.host" };
        if (r.NZD) prices["NZD/USD"] = { mid: 1 / r.NZD, source: "exchangerate.host" };
        if (r.CHF) prices["USD/CHF"] = { mid: r.CHF, source: "exchangerate.host" };
      }
    }
  } catch (e) {
    console.warn(`[MARKET-INTEL] Secondary price fetch failed: ${(e as Error).message}`);
  }
  return prices;
}

function detectPriceDeviation(
  oandaPricing: Record<string, unknown>,
  secondaryPrices: Record<string, { mid: number; source: string }>,
): Array<{ pair: string; oandaMid: number; refMid: number; deviationPips: number; source: string }> {
  const deviations: Array<{ pair: string; oandaMid: number; refMid: number; deviationPips: number; source: string }> = [];

  for (const [pair, refData] of Object.entries(secondaryPrices)) {
    const oanda = oandaPricing[pair] as any;
    if (!oanda?.mid) continue;
    const pipMult = pair.includes("JPY") ? 100 : 10000;
    const devPips = Math.abs(oanda.mid - refData.mid) * pipMult;
    if (devPips >= 1.5) {
      deviations.push({
        pair,
        oandaMid: oanda.mid,
        refMid: refData.mid,
        deviationPips: Math.round(devPips * 10) / 10,
        source: refData.source,
      });
    }
  }

  return deviations;
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

    const url = new URL(req.url);
    const sections = (url.searchParams.get("sections") || "all").split(",");
    const fetchAll = sections.includes("all");

    const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

    const fetches: Promise<void>[] = [];

    if (fetchAll || sections.includes("pricing")) {
      fetches.push(
        fetchLivePricing(host, accountId, apiToken).then(d => { results.livePricing = d; })
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

    // Secondary prices for arbitrage detection
    if (fetchAll || sections.includes("pricing") || sections.includes("arbitrage")) {
      fetches.push(
        fetchSecondaryPrices().then(d => { results.secondaryPrices = d; })
      );
    }

    await Promise.allSettled(fetches);

    // Post-processing: detect price deviations
    if (results.livePricing && results.secondaryPrices) {
      const deviations = detectPriceDeviation(
        results.livePricing as Record<string, unknown>,
        results.secondaryPrices as Record<string, { mid: number; source: string }>,
      );
      if (deviations.length > 0) {
        results.priceDeviations = deviations;
        console.log(`[MARKET-INTEL] ⚠️ PRICE DEVIATION: ${deviations.map(d => `${d.pair} ${d.deviationPips}p`).join(", ")}`);
      }
    }

    // Derive spread-based liquidity zones from pricing depth as stop-cluster proxy
    if (results.livePricing) {
      const liquidityZones: Record<string, unknown> = {};
      for (const [pair, priceData] of Object.entries(results.livePricing as Record<string, any>)) {
        if (!priceData?.bidDepth?.length || !priceData?.askDepth?.length) continue;
        const totalBidLiq = priceData.bidDepth.reduce((s: number, b: any) => s + parseInt(b.liquidity || "0"), 0);
        const totalAskLiq = priceData.askDepth.reduce((s: number, a: any) => s + parseInt(a.liquidity || "0"), 0);
        const imbalance = totalBidLiq > 0 ? (totalAskLiq - totalBidLiq) / (totalBidLiq + totalAskLiq) : 0;
        liquidityZones[pair] = {
          bidLiquidity: totalBidLiq,
          askLiquidity: totalAskLiq,
          imbalanceRatio: +imbalance.toFixed(3),
          bias: imbalance > 0.15 ? "ASK_HEAVY" : imbalance < -0.15 ? "BID_HEAVY" : "BALANCED",
          spreadPips: priceData.spreadPips,
        };
      }
      results.liquidityZones = liquidityZones;
    }

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
