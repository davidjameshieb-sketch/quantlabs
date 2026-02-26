// Slippage Sentinel — Pre-Trade Execution Guard + G16 Spread Guard
// Evaluates fill quality before trade placement by walking OANDA depth,
// comparing spread vs 24h average, and checking recent halfSpreadCost trends.
// G16 Spread Guard: If spread > 300% of 24h median, auto-injects gate bypass to block all entries.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// ═══ V15: DB-PERSISTED SPREAD HISTORY (sovereign_memory) ═══
// Replaces in-memory spreadHistory that reset on every cold start.
// Stores rolling 24h spread samples in sovereign_memory for true persistence.

async function recordSpreadToDB(sb: any, pair: string, spreadPips: number) {
  const memoryKey = `spread_history:${pair}`;
  try {
    const { data: existing } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_key', memoryKey)
      .eq('memory_type', 'spread_history')
      .single();

    const cutoff = Date.now() - 24 * 60 * 60_000;
    let history: { spread: number; ts: number }[] = [];
    if (existing?.payload?.samples) {
      history = (existing.payload.samples as any[]).filter((s: any) => s.ts > cutoff);
    }
    history.push({ spread: spreadPips, ts: Date.now() });

    // Keep max 500 samples per pair (every 10min = 144/day, plenty of room)
    if (history.length > 500) history = history.slice(-500);

    await sb.from('sovereign_memory').upsert({
      memory_key: memoryKey,
      memory_type: 'spread_history',
      payload: { samples: history, lastSpread: spreadPips, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
      created_by: 'slippage-sentinel',
    }, { onConflict: 'memory_key' });
  } catch (e) {
    console.warn(`[SPREAD-HISTORY] Failed to persist spread for ${pair}:`, (e as Error).message);
  }
}

async function getAvgSpreadFromDB(sb: any, pair: string): Promise<number> {
  const memoryKey = `spread_history:${pair}`;
  try {
    const { data } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_key', memoryKey)
      .eq('memory_type', 'spread_history')
      .single();

    if (!data?.payload?.samples) return 0;
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const samples = (data.payload.samples as any[]).filter((s: any) => s.ts > cutoff);
    if (samples.length === 0) return 0;

    // Use MEDIAN instead of mean for robustness against spike outliers
    const sorted = samples.map((s: any) => s.spread).sort((a: number, b: number) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  } catch {
    return 0;
  }
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

    // Record spread to DB for persistent 24h history
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    await recordSpreadToDB(sb, pair, currentSpreadPips);
    const avgSpread24h = await getAvgSpreadFromDB(sb, pair);

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

      // ═══ G16 SPREAD GUARD: Auto-inject gate bypass when >300% ═══
      try {
        const sb = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const gateId = `G16_SPREAD_GUARD:${pair}`;
        const { data: existing } = await sb.from('gate_bypasses')
          .select('gate_id')
          .eq('gate_id', gateId)
          .eq('revoked', false)
          .gt('expires_at', new Date().toISOString())
          .limit(1);

        if (!existing || existing.length === 0) {
          await sb.from('gate_bypasses').insert({
            gate_id: gateId,
            reason: JSON.stringify({
              action: 'BLOCK_ALL_ENTRIES',
              spreadRatio: Math.round(spreadRatio * 10) / 10,
              currentSpread: Math.round(currentSpreadPips * 100) / 100,
              medianSpread: Math.round(avgSpread24h * 100) / 100,
              trigger: 'G16_SPREAD_GUARD_300PCT',
            }),
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), // 10min TTL — re-evaluated next cycle
            pair,
            created_by: 'g16-spread-guard',
          });
          console.log(`[G16-SPREAD-GUARD] 🔴 ${pair}: Spread ${spreadRatio.toFixed(1)}x of 24h median → ALL ENTRIES BLOCKED for 10min`);
        }
      } catch (gateErr) {
        console.warn(`[G16-SPREAD-GUARD] Failed to write gate: ${(gateErr as Error).message}`);
      }
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
