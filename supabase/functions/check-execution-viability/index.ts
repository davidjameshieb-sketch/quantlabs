// Slippage Sentinel — Pre-Trade Execution Guard
// Evaluates fill quality before trade placement by walking OANDA depth,
// comparing spread vs 24h average, and checking recent halfSpreadCost trends.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
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

async function oandaGet(url: string, apiToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[SLIPPAGE-SENTINEL] ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// Walk the depth book to estimate fill price for given units
function estimateVWAP(
  depthLevels: { price: string; liquidity: string }[],
  units: number
): { vwap: number; slippagePips: number; midPrice: number; fillable: boolean } {
  if (!depthLevels || depthLevels.length === 0) {
    return { vwap: 0, slippagePips: 0, midPrice: 0, fillable: false };
  }

  let remainingUnits = Math.abs(units);
  let totalCost = 0;
  let totalFilled = 0;
  const midPrice = parseFloat(depthLevels[0].price);

  for (const level of depthLevels) {
    const price = parseFloat(level.price);
    const available = parseInt(level.liquidity) || 0;
    const fillAtLevel = Math.min(remainingUnits, available);

    totalCost += price * fillAtLevel;
    totalFilled += fillAtLevel;
    remainingUnits -= fillAtLevel;

    if (remainingUnits <= 0) break;
  }

  const fillable = remainingUnits <= 0;
  const vwap = totalFilled > 0 ? totalCost / totalFilled : midPrice;
  const isJPY = midPrice > 10; // rough JPY detection
  const pipMultiplier = isJPY ? 100 : 10000;
  const slippagePips = Math.abs(vwap - midPrice) * pipMultiplier;

  return { vwap, slippagePips: +slippagePips.toFixed(2), midPrice, fillable };
}

// In-memory 24h spread history for moving average
const spreadHistory: Record<string, { spread: number; ts: number }[]> = {};

function recordSpread(pair: string, spreadPips: number) {
  if (!spreadHistory[pair]) spreadHistory[pair] = [];
  spreadHistory[pair].push({ spread: spreadPips, ts: Date.now() });
  // Keep only last 24h
  const cutoff = Date.now() - 24 * 60 * 60_000;
  spreadHistory[pair] = spreadHistory[pair].filter(s => s.ts > cutoff);
}

function getAvgSpread(pair: string): number {
  const hist = spreadHistory[pair];
  if (!hist || hist.length === 0) return 0;
  return hist.reduce((s, h) => s + h.spread, 0) / hist.length;
}

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

    const body = await req.json().catch(() => ({}));
    const { pair, units, direction } = body as { pair?: string; units?: number; direction?: string };

    if (!pair || !units || !direction) {
      return new Response(
        JSON.stringify({ error: "Required: pair, units, direction" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch live pricing with depth
    const instrument = pair.replace("/", "_");
    const pricingUrl = `${host}/v3/accounts/${accountId}/pricing?instruments=${instrument}`;
    const pricingData = await oandaGet(pricingUrl, apiToken);

    if (!pricingData?.prices?.[0]) {
      return new Response(
        JSON.stringify({ error: `No pricing data for ${pair}`, viabilityScore: 0, viability: "UNAVAILABLE" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const price = pricingData.prices[0];
    const bid = parseFloat(price.bids?.[0]?.price || "0");
    const ask = parseFloat(price.asks?.[0]?.price || "0");
    const mid = (bid + ask) / 2;
    const isJPY = instrument.includes("JPY");
    const pipMultiplier = isJPY ? 100 : 10000;
    const currentSpreadPips = +((ask - bid) * pipMultiplier).toFixed(1);

    // Record spread for MA calculation
    recordSpread(pair, currentSpreadPips);
    const avgSpread24h = getAvgSpread(pair);

    // Walk the depth book
    const depthLevels = direction === "long" ? price.asks : price.bids;
    const vwapResult = estimateVWAP(depthLevels || [], units);

    // Fetch recent transactions for halfSpreadCost trend
    const since = new Date(Date.now() - 60 * 60_000).toISOString(); // last 1h
    const txUrl = `${host}/v3/accounts/${accountId}/transactions?from=${encodeURIComponent(since)}&type=ORDER_FILL&pageSize=50`;
    const txData = await oandaGet(txUrl, apiToken);

    let halfSpreadCostTrend = "STABLE";
    let recentFills: { halfSpreadCost: number; time: string }[] = [];

    if (txData?.pages?.[0]) {
      const pageData = await oandaGet(txData.pages[0], apiToken);
      if (pageData?.transactions) {
        recentFills = pageData.transactions
          .filter((t: any) => t.instrument === instrument && t.halfSpreadCost)
          .slice(-10)
          .map((t: any) => ({
            halfSpreadCost: Math.abs(parseFloat(t.halfSpreadCost || "0")),
            time: t.time,
          }));

        if (recentFills.length >= 3) {
          const recent3 = recentFills.slice(-3);
          const earlier3 = recentFills.slice(0, 3);
          const recentAvg = recent3.reduce((s, f) => s + f.halfSpreadCost, 0) / recent3.length;
          const earlierAvg = earlier3.reduce((s, f) => s + f.halfSpreadCost, 0) / earlier3.length;
          if (recentAvg > earlierAvg * 1.5) halfSpreadCostTrend = "RISING";
          else if (recentAvg < earlierAvg * 0.7) halfSpreadCostTrend = "FALLING";
        }
      }
    }

    // Calculate viability score (0-100)
    let viabilityScore = 100;
    const issues: string[] = [];

    // Spread vs 24h average penalty
    const spreadRatio = avgSpread24h > 0 ? currentSpreadPips / avgSpread24h : 1;
    if (spreadRatio > 3) {
      viabilityScore -= 40;
      issues.push(`Spread ${currentSpreadPips}p is ${spreadRatio.toFixed(1)}x the 24h avg (${avgSpread24h.toFixed(1)}p)`);
    } else if (spreadRatio > 2) {
      viabilityScore -= 25;
      issues.push(`Spread ${currentSpreadPips}p is ${spreadRatio.toFixed(1)}x the 24h avg`);
    } else if (spreadRatio > 1.5) {
      viabilityScore -= 10;
      issues.push(`Spread slightly elevated: ${spreadRatio.toFixed(1)}x avg`);
    }

    // VWAP slippage penalty
    if (vwapResult.slippagePips > 1.0) {
      viabilityScore -= 30;
      issues.push(`Estimated slippage: ${vwapResult.slippagePips}p (depth too thin for ${units} units)`);
    } else if (vwapResult.slippagePips > 0.5) {
      viabilityScore -= 15;
      issues.push(`Moderate slippage risk: ${vwapResult.slippagePips}p`);
    }

    // Depth fillability
    if (!vwapResult.fillable) {
      viabilityScore -= 20;
      issues.push(`Insufficient depth to fully fill ${units} units`);
    }

    // halfSpreadCost trend penalty
    if (halfSpreadCostTrend === "RISING") {
      viabilityScore -= 15;
      issues.push("halfSpreadCost is RISING — market maker widening");
    }

    // Tradeable check
    if (!price.tradeable) {
      viabilityScore = 0;
      issues.push("Instrument is currently NOT TRADEABLE");
    }

    viabilityScore = Math.max(0, Math.min(100, viabilityScore));

    // Determine viability label
    let viability: string;
    if (viabilityScore >= 80) viability = "HIGH";
    else if (viabilityScore >= 50) viability = "MODERATE";
    else if (viabilityScore >= 25) viability = "LOW";
    else viability = "TOXIC";

    // Recommend order type
    let recommendedOrderType: string;
    let limitOffset = 0;
    if (viabilityScore >= 80) {
      recommendedOrderType = "MARKET";
    } else if (viabilityScore >= 50) {
      recommendedOrderType = "LIMIT";
      limitOffset = currentSpreadPips * 0.3; // offset by 30% of spread
    } else {
      recommendedOrderType = "LIMIT";
      limitOffset = currentSpreadPips * 0.5; // offset by 50% of spread
    }

    const result = {
      pair,
      direction,
      units,
      viabilityScore,
      viability,
      recommendedOrderType,
      limitOffset: +limitOffset.toFixed(1),
      currentSpreadPips,
      avgSpread24h: +avgSpread24h.toFixed(1),
      spreadRatio: +spreadRatio.toFixed(2),
      estimatedSlippagePips: vwapResult.slippagePips,
      estimatedVWAP: +vwapResult.vwap.toFixed(isJPY ? 3 : 5),
      midPrice: +mid.toFixed(isJPY ? 3 : 5),
      depthFillable: vwapResult.fillable,
      halfSpreadCostTrend,
      recentFillCount: recentFills.length,
      issues,
      tradeable: price.tradeable,
      timestamp: new Date().toISOString(),
    };

    console.log(`[SLIPPAGE-SENTINEL] ${pair} ${direction} ${units}u → Score:${viabilityScore} ${viability} | Order:${recommendedOrderType}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[SLIPPAGE-SENTINEL] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
