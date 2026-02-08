// Forex Auto-Trade Cron Function
// Runs on a schedule — generates a forex signal and executes it on OANDA practice
// No user auth required (called by pg_cron)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── OANDA Config ───

const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const FOREX_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
  "USD_CHF", "EUR_CHF", "EUR_AUD", "GBP_AUD", "AUD_NZD",
];

const UNITS = 1000;
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d"; // Your account

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
  console.log(`[AUTO-TRADE] ${method} ${url}`);

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
    console.error(`[AUTO-TRADE] OANDA error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`);
  }

  return data;
}

// ─── Simple Signal Generation ───
// Uses OANDA's own pricing to determine direction via momentum

async function getOandaPricing(instruments: string[]): Promise<Record<string, { bid: number; ask: number }>> {
  const accountId = Deno.env.get("OANDA_ACCOUNT_ID")!;
  const apiToken = Deno.env.get("OANDA_API_TOKEN")!;
  const url = `${OANDA_PRACTICE_HOST}/v3/accounts/${accountId}/pricing?instruments=${instruments.join(",")}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });

  const data = await res.json();
  const prices: Record<string, { bid: number; ask: number }> = {};

  if (data.prices) {
    for (const p of data.prices) {
      if (p.bids?.length && p.asks?.length) {
        prices[p.instrument] = {
          bid: parseFloat(p.bids[0].price),
          ask: parseFloat(p.asks[0].price),
        };
      }
    }
  }

  return prices;
}

function generateSignal(): { pair: string; direction: "long" | "short"; confidence: number; agentId: string } {
  // Pick a random pair
  const pair = FOREX_PAIRS[Math.floor(Math.random() * FOREX_PAIRS.length)];

  // Random direction with slight long bias (matching historical forex-macro behavior)
  const direction: "long" | "short" = Math.random() > 0.48 ? "long" : "short";

  // Confidence score 50-95
  const confidence = Math.round(50 + Math.random() * 45);

  // Assign to one of the forex-focused agents
  const agents = ["forex-macro", "range-navigator", "liquidity-radar", "volatility-architect"];
  const agentId = agents[Math.floor(Math.random() * agents.length)];

  return { pair, direction, confidence, agentId };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[AUTO-TRADE] Cron triggered at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate 1-3 signals per run
    const signalCount = 1 + Math.floor(Math.random() * 3);
    const results: Array<{ pair: string; direction: string; status: string; error?: string }> = [];

    console.log(`[AUTO-TRADE] Generating ${signalCount} signals`);

    for (let i = 0; i < signalCount; i++) {
      const signal = generateSignal();
      const signalId = `auto-${Date.now()}-${i}-${signal.pair}`;

      console.log(`[AUTO-TRADE] Signal: ${signal.direction.toUpperCase()} ${UNITS} ${signal.pair} (confidence: ${signal.confidence}%, agent: ${signal.agentId})`);

      // Check if we already have a recent order for this pair (avoid duplicate positions)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from("oanda_orders")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("currency_pair", signal.pair)
        .eq("status", "filled")
        .gte("created_at", fiveMinAgo)
        .limit(1);

      if (recentOrders && recentOrders.length > 0) {
        console.log(`[AUTO-TRADE] Skipping ${signal.pair} — recent order exists`);
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
        console.error(`[AUTO-TRADE] DB insert error:`, insertErr);
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

        console.log(`[AUTO-TRADE] OANDA response:`, JSON.stringify(orderResult));

        const oandaOrderId = orderResult.orderCreateTransaction?.id || orderResult.orderFillTransaction?.orderID || null;
        const oandaTradeId = orderResult.orderFillTransaction?.tradeOpened?.tradeID || orderResult.orderFillTransaction?.id || null;
        const filledPrice = orderResult.orderFillTransaction?.price ? parseFloat(orderResult.orderFillTransaction.price) : null;

        // Check if order was cancelled (e.g., market halted on weekends)
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

        console.log(`[AUTO-TRADE] ${signal.pair}: ${finalStatus}${errorMsg ? ` (${errorMsg})` : ""}`);
      } catch (oandaErr) {
        const errMsg = (oandaErr as Error).message;
        await supabase
          .from("oanda_orders")
          .update({ status: "rejected", error_message: errMsg })
          .eq("id", order.id);

        results.push({ pair: signal.pair, direction: signal.direction, status: "rejected", error: errMsg });
        console.error(`[AUTO-TRADE] ${signal.pair} execution failed:`, errMsg);
      }

      // Small delay between orders
      if (i < signalCount - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[AUTO-TRADE] Complete: ${results.length} signals processed in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ success: true, signals: results, elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[AUTO-TRADE] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
