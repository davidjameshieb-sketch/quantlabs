// Counterfactual Resolver — Checks rejected trades against actual price movements
// Runs on a schedule to fill in counterfactual_exit_5m/10m/15m and counterfactual_pips/result

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PendingOrder {
  id: string;
  currency_pair: string;
  direction: string;
  counterfactual_entry_price: number;
  created_at: string;
  user_id: string;
}

function pipMultiplier(pair: string): number {
  return pair.includes("JPY") ? 100 : 10000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN");
    const oandaHost = "https://api-fxtrade.oanda.com";
    const oandaAccountId = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");

    if (!oandaToken || !oandaAccountId) {
      return new Response(JSON.stringify({ error: "OANDA credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find rejected orders with entry price but no resolved outcome, older than 15 minutes
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingOrders, error: fetchErr } = await supabase
      .from("oanda_orders")
      .select("id, currency_pair, direction, counterfactual_entry_price, created_at, user_id")
      .in("status", ["rejected", "blocked", "skipped"])
      .not("counterfactual_entry_price", "is", null)
      .is("counterfactual_result", null)
      .gte("created_at", sevenDaysAgo)
      .lte("created_at", fifteenMinAgo)
      .limit(50);

    if (fetchErr) throw fetchErr;
    if (!pendingOrders || pendingOrders.length === 0) {
      console.log("[CF-RESOLVER] No pending counterfactual orders to resolve");
      return new Response(JSON.stringify({ resolved: 0, message: "No pending orders" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[CF-RESOLVER] Resolving ${pendingOrders.length} counterfactual orders`);

    // Group by pair for batch pricing
    const pairGroups: Record<string, PendingOrder[]> = {};
    for (const o of pendingOrders as PendingOrder[]) {
      const pair = o.currency_pair;
      if (!pairGroups[pair]) pairGroups[pair] = [];
      pairGroups[pair].push(o);
    }

    let totalResolved = 0;
    const results: Array<{ id: string; pair: string; pips: number; result: string }> = [];

    // For each pair, fetch current price and compute counterfactual outcomes
    for (const [pair, orders] of Object.entries(pairGroups)) {
      if (pair === "SYSTEM" || !pair.includes("_")) continue;

      try {
        // Fetch current mid price from OANDA
        const priceRes = await fetch(
          `${oandaHost}/v3/accounts/${oandaAccountId}/pricing?instruments=${pair}`,
          { headers: { Authorization: `Bearer ${oandaToken}` } }
        );

        if (!priceRes.ok) {
          console.warn(`[CF-RESOLVER] Price fetch failed for ${pair}: ${priceRes.status}`);
          continue;
        }

        const priceData = await priceRes.json();
        const priceInfo = priceData.prices?.[0];
        if (!priceInfo) continue;

        const currentBid = parseFloat(priceInfo.bids?.[0]?.price || "0");
        const currentAsk = parseFloat(priceInfo.asks?.[0]?.price || "0");
        const currentMid = (currentBid + currentAsk) / 2;
        const mult = pipMultiplier(pair);

        for (const order of orders) {
          const entryPrice = order.counterfactual_entry_price;
          const isLong = order.direction === "long";
          const createdAt = new Date(order.created_at).getTime();
          const ageMinutes = (Date.now() - createdAt) / 60000;

          // Use current price as the exit price for the best available window
          // (15m if old enough, else 10m, else 5m)
          const exitPrice = isLong ? currentBid : currentAsk;
          const cfPips = isLong
            ? (exitPrice - entryPrice) * mult
            : (entryPrice - exitPrice) * mult;

          // Determine which exit windows we can fill
          const exit5m = ageMinutes >= 5 ? currentMid : null;
          const exit10m = ageMinutes >= 10 ? currentMid : null;
          const exit15m = ageMinutes >= 15 ? currentMid : null;

          // Only mark as resolved when we have the 15m exit
          const cfResult = exit15m != null ? (cfPips > 0 ? "win" : "loss") : null;

          const updatePayload: Record<string, unknown> = {};
          if (exit5m != null) updatePayload.counterfactual_exit_5m = exit5m;
          if (exit10m != null) updatePayload.counterfactual_exit_10m = exit10m;
          if (exit15m != null) {
            updatePayload.counterfactual_exit_15m = exit15m;
            updatePayload.counterfactual_pips = parseFloat(cfPips.toFixed(2));
            updatePayload.counterfactual_result = cfResult;
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updateErr } = await supabase
              .from("oanda_orders")
              .update(updatePayload)
              .eq("id", order.id);

            if (updateErr) {
              console.warn(`[CF-RESOLVER] Update failed for ${order.id}: ${updateErr.message}`);
            } else if (cfResult) {
              totalResolved++;
              results.push({ id: order.id, pair, pips: parseFloat(cfPips.toFixed(2)), result: cfResult });
              console.log(`[CF-RESOLVER] ✓ ${pair} ${order.direction}: ${cfResult} (${cfPips >= 0 ? "+" : ""}${cfPips.toFixed(2)}p)`);
            }
          }
        }
      } catch (pairErr) {
        console.error(`[CF-RESOLVER] Error processing ${pair}: ${(pairErr as Error).message}`);
      }
    }

    const summary = {
      resolved: totalResolved,
      pending: pendingOrders.length - totalResolved,
      results,
    };

    console.log(`[CF-RESOLVER] Done — ${totalResolved} resolved, ${summary.pending} still pending`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[CF-RESOLVER] Fatal error: ${(err as Error).message}`);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
