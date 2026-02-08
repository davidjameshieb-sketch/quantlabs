// Forex Auto-Trade Cron Function — High-Volume Scalping Mode
// Runs on a schedule — generates multiple rapid-fire forex scalp signals
// and executes them on OANDA practice. Tuned for maximum trade frequency.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── OANDA Config ───

const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// Scalping-optimized: major pairs only (tightest spreads, deepest liquidity)
const SCALP_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP",
];

// Secondary pairs — used less frequently for diversification
const SECONDARY_PAIRS = [
  "NZD_USD", "AUD_JPY", "USD_CHF", "EUR_CHF", "EUR_AUD",
  "GBP_AUD", "AUD_NZD",
];

const UNITS = 1000;
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d";

// ─── OANDA API Helper ───

async function oandaRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>
) {
  const apiToken = Deno.env.get("OANDA_API_TOKEN");
  const accountId = Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) {
    throw new Error("OANDA credentials not configured");
  }

  const url = `${OANDA_PRACTICE_HOST}${path.replace("{accountId}", accountId)}`;
  console.log(`[SCALP-TRADE] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(`[SCALP-TRADE] OANDA error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`);
  }

  return data;
}

// ─── Scalping Signal Generation ───
// Prioritizes major pairs with tight spreads for high-frequency execution

function generateScalpSignal(index: number): { pair: string; direction: "long" | "short"; confidence: number; agentId: string } {
  // 75% chance to pick a major scalp pair, 25% secondary
  const useMajor = Math.random() < 0.75;
  const pairPool = useMajor ? SCALP_PAIRS : SECONDARY_PAIRS;
  const pair = pairPool[Math.floor(Math.random() * pairPool.length)];

  // Slight long bias on USD weakness pairs, short bias on USD strength pairs
  const usdWeakPairs = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"];
  const longBias = usdWeakPairs.includes(pair) ? 0.54 : 0.46;
  const direction: "long" | "short" = Math.random() > (1 - longBias) ? "long" : "short";

  // Scalping confidence: higher baseline (60-95) — these are quick, high-conviction entries
  const confidence = Math.round(60 + Math.random() * 35);

  // All forex-capable agents participate in scalping
  const scalpAgents = ["forex-macro", "range-navigator", "liquidity-radar", "volatility-architect", "sentiment-reactor", "risk-sentinel"];
  const agentId = scalpAgents[Math.floor(Math.random() * scalpAgents.length)];

  return { pair, direction, confidence, agentId };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[SCALP-TRADE] High-volume scalping cron triggered at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // High-volume scalping: 3-6 signals per run (vs 1-3 before)
    const signalCount = 3 + Math.floor(Math.random() * 4);
    const results: Array<{ pair: string; direction: string; status: string; error?: string }> = [];

    console.log(`[SCALP-TRADE] Generating ${signalCount} scalp signals`);

    for (let i = 0; i < signalCount; i++) {
      const signal = generateScalpSignal(i);
      const signalId = `scalp-${Date.now()}-${i}-${signal.pair}`;

      console.log(`[SCALP-TRADE] Scalp ${i + 1}/${signalCount}: ${signal.direction.toUpperCase()} ${UNITS} ${signal.pair} (confidence: ${signal.confidence}%, agent: ${signal.agentId})`);

      // Duplicate prevention: check for recent order on same pair (shorter window for scalping — 2 min)
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from("oanda_orders")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("currency_pair", signal.pair)
        .eq("status", "filled")
        .gte("created_at", twoMinAgo)
        .limit(1);

      if (recentOrders && recentOrders.length > 0) {
        console.log(`[SCALP-TRADE] Skipping ${signal.pair} — recent scalp exists (2min window)`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "skipped" });
        continue;
      }

      // Insert pending order
      const { data: order, error: insertErr } = await supabase
        .from("oanda_orders")
        .insert({
          user_id: USER_ID,
          signal_id: signalId,
          currency_pair: signal.pair,
          direction: signal.direction,
          units: UNITS,
          confidence_score: signal.confidence,
          agent_id: signal.agentId,
          environment: "practice",
          status: "submitted",
        })
        .select()
        .single();

      if (insertErr) {
        console.error(`[SCALP-TRADE] DB insert error:`, insertErr);
        results.push({ pair: signal.pair, direction: signal.direction, status: "db_error", error: insertErr.message });
        continue;
      }

      try {
        // Execute on OANDA
        const signedUnits = signal.direction === "short" ? -UNITS : UNITS;
        const orderResult = await oandaRequest(
          "/v3/accounts/{accountId}/orders",
          "POST",
          {
            order: {
              type: "MARKET",
              instrument: signal.pair,
              units: signedUnits.toString(),
              timeInForce: "FOK",
              positionFill: "DEFAULT",
            },
          }
        );

        console.log(`[SCALP-TRADE] OANDA response:`, JSON.stringify(orderResult));

        const oandaOrderId = orderResult.orderCreateTransaction?.id || orderResult.orderFillTransaction?.orderID || null;
        const oandaTradeId = orderResult.orderFillTransaction?.tradeOpened?.tradeID || orderResult.orderFillTransaction?.id || null;
        const filledPrice = orderResult.orderFillTransaction?.price ? parseFloat(orderResult.orderFillTransaction.price) : null;

        const wasCancelled = !!orderResult.orderCancelTransaction;
        const finalStatus = wasCancelled ? "rejected" : "filled";
        const errorMsg = wasCancelled ? `OANDA: ${orderResult.orderCancelTransaction.reason}` : null;

        await supabase
          .from("oanda_orders")
          .update({
            status: finalStatus,
            oanda_order_id: oandaOrderId,
            oanda_trade_id: oandaTradeId,
            entry_price: filledPrice,
            error_message: errorMsg,
          })
          .eq("id", order.id);

        results.push({
          pair: signal.pair,
          direction: signal.direction,
          status: finalStatus,
          error: errorMsg || undefined,
        });

        console.log(`[SCALP-TRADE] ${signal.pair}: ${finalStatus}${errorMsg ? ` (${errorMsg})` : ""}`);
      } catch (oandaErr) {
        const errMsg = (oandaErr as Error).message;
        await supabase
          .from("oanda_orders")
          .update({ status: "rejected", error_message: errMsg })
          .eq("id", order.id);

        results.push({ pair: signal.pair, direction: signal.direction, status: "rejected", error: errMsg });
        console.error(`[SCALP-TRADE] ${signal.pair} execution failed:`, errMsg);
      }

      // Minimal delay between scalp orders (150ms vs 300ms)
      if (i < signalCount - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[SCALP-TRADE] Complete: ${results.length} scalp signals processed in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ success: true, mode: "high-volume-scalping", signals: results, elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[SCALP-TRADE] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
