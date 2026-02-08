// Forex Trade Exit Monitor
// Runs on a cron schedule — checks open OANDA trades against TP/SL thresholds
// and time limits, auto-closes positions, records exit_price and closed_at.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d";

// ─── Pair-specific TP/SL thresholds (in price units, not pips) ───
// Scalping profile: tight SL, asymmetric TP (~3:1 reward:risk)

const JPY_PAIRS = ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY"];

function getPipMultiplier(pair: string): number {
  return JPY_PAIRS.includes(pair) ? 0.01 : 0.0001;
}

// TP/SL in pips per pair volatility class
function getExitThresholds(pair: string): { tpPips: number; slPips: number; maxAgeMinutes: number } {
  const pipMult = getPipMultiplier(pair);
  
  // Volatility classes
  const highVol = ["GBP_JPY", "GBP_AUD", "EUR_AUD", "AUD_NZD"];
  const medVol = ["GBP_USD", "EUR_JPY", "AUD_JPY", "USD_CAD", "EUR_GBP"];
  // Low vol: EUR_USD, USD_JPY, AUD_USD, NZD_USD, etc.

  if (highVol.includes(pair)) {
    return { tpPips: 20, slPips: 8, maxAgeMinutes: 12 };
  }
  if (medVol.includes(pair)) {
    return { tpPips: 15, slPips: 6, maxAgeMinutes: 10 };
  }
  // Low volatility majors — tighter scalping
  return { tpPips: 10, slPips: 5, maxAgeMinutes: 8 };
}

// ─── Trailing stop logic ───
// If trade is >60% to TP, tighten SL to breakeven + 1 pip

function computeTrailingStop(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  pair: string
): { adjustedSlPrice: number; isTrailing: boolean } {
  const pipMult = getPipMultiplier(pair);
  const thresholds = getExitThresholds(pair);
  
  const tpPrice = direction === "long" 
    ? entryPrice + thresholds.tpPips * pipMult 
    : entryPrice - thresholds.tpPips * pipMult;
  
  const originalSlPrice = direction === "long"
    ? entryPrice - thresholds.slPips * pipMult
    : entryPrice + thresholds.slPips * pipMult;

  // Calculate progress toward TP
  const totalDistance = Math.abs(tpPrice - entryPrice);
  const currentDistance = direction === "long"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  
  const progressRatio = totalDistance > 0 ? currentDistance / totalDistance : 0;

  // If >60% to TP, move SL to breakeven + 1 pip
  if (progressRatio >= 0.6) {
    const breakEvenPlus = direction === "long"
      ? entryPrice + 1 * pipMult
      : entryPrice - 1 * pipMult;
    return { adjustedSlPrice: breakEvenPlus, isTrailing: true };
  }

  return { adjustedSlPrice: originalSlPrice, isTrailing: false };
}

// ─── OANDA API Helper ───

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const apiToken = Deno.env.get("OANDA_API_TOKEN");
  const accountId = Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const url = `${OANDA_PRACTICE_HOST}${path.replace("{accountId}", accountId)}`;
  
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
    console.error(`[TRADE-MONITOR] OANDA error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA error: ${response.status}`);
  }

  return data;
}

// ─── Exit Decision Engine ───

interface ExitDecision {
  action: "hold" | "close-tp" | "close-sl" | "close-time" | "close-trailing";
  reason: string;
  currentPnlPips: number;
  progressToTp: number;
  tradeAgeMinutes: number;
}

function evaluateExit(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  pair: string,
  tradeAgeMinutes: number
): ExitDecision {
  const pipMult = getPipMultiplier(pair);
  const thresholds = getExitThresholds(pair);
  
  // Current P&L in pips
  const currentPnlPips = direction === "long"
    ? (currentPrice - entryPrice) / pipMult
    : (entryPrice - currentPrice) / pipMult;

  // Progress toward TP
  const progressToTp = currentPnlPips / thresholds.tpPips;

  // Check TP hit
  if (currentPnlPips >= thresholds.tpPips) {
    return {
      action: "close-tp",
      reason: `TP hit: +${currentPnlPips.toFixed(1)} pips (target: ${thresholds.tpPips})`,
      currentPnlPips,
      progressToTp,
      tradeAgeMinutes,
    };
  }

  // Check trailing stop (if >60% to TP, SL moves to breakeven+1)
  const trailing = computeTrailingStop(direction, entryPrice, currentPrice, pair);
  if (trailing.isTrailing) {
    const trailingSlPips = direction === "long"
      ? (currentPrice - trailing.adjustedSlPrice) / pipMult
      : (trailing.adjustedSlPrice - currentPrice) / pipMult;
    
    if (trailingSlPips <= 0) {
      return {
        action: "close-trailing",
        reason: `Trailing stop hit after reaching ${(progressToTp * 100).toFixed(0)}% of TP`,
        currentPnlPips,
        progressToTp,
        tradeAgeMinutes,
      };
    }
  }

  // Check SL hit
  if (currentPnlPips <= -thresholds.slPips) {
    return {
      action: "close-sl",
      reason: `SL hit: ${currentPnlPips.toFixed(1)} pips (limit: -${thresholds.slPips})`,
      currentPnlPips,
      progressToTp,
      tradeAgeMinutes,
    };
  }

  // Check time-based exit
  if (tradeAgeMinutes >= thresholds.maxAgeMinutes) {
    // Only time-exit if trade is not strongly profitable
    if (currentPnlPips < thresholds.tpPips * 0.5) {
      return {
        action: "close-time",
        reason: `Time exit: ${tradeAgeMinutes.toFixed(0)}min (max: ${thresholds.maxAgeMinutes}min), P&L: ${currentPnlPips.toFixed(1)}p`,
        currentPnlPips,
        progressToTp,
        tradeAgeMinutes,
      };
    }
  }

  return {
    action: "hold",
    reason: `Holding: ${currentPnlPips.toFixed(1)}p P&L, ${(progressToTp * 100).toFixed(0)}% to TP, ${tradeAgeMinutes.toFixed(0)}min age`,
    currentPnlPips,
    progressToTp,
    tradeAgeMinutes,
  };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[TRADE-MONITOR] Starting exit scan at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all filled orders that haven't been closed yet (no exit_price)
    const { data: openOrders, error: fetchErr } = await supabase
      .from("oanda_orders")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("status", "filled")
      .is("exit_price", null)
      .not("oanda_trade_id", "is", null)
      .not("entry_price", "is", null)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("[TRADE-MONITOR] DB fetch error:", fetchErr);
      throw fetchErr;
    }

    if (!openOrders || openOrders.length === 0) {
      console.log("[TRADE-MONITOR] No open trades to monitor");
      return new Response(
        JSON.stringify({ success: true, monitored: 0, closed: 0, held: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[TRADE-MONITOR] Found ${openOrders.length} open trades to evaluate`);

    // 2. Get current OANDA open trades for live pricing
    let oandaTrades: Array<{ id: string; instrument: string; currentUnits: string; price: string; unrealizedPL: string }> = [];
    try {
      const tradesResult = await oandaRequest("/v3/accounts/{accountId}/openTrades", "GET");
      oandaTrades = (tradesResult.trades || []) as typeof oandaTrades;
    } catch (err) {
      console.error("[TRADE-MONITOR] Failed to fetch OANDA trades:", err);
      // Continue — we'll use pricing API for closed trades
    }

    // Build a map of OANDA trade ID -> live trade data
    const oandaTradeMap = new Map<string, typeof oandaTrades[0]>();
    for (const t of oandaTrades) {
      oandaTradeMap.set(t.id, t);
    }

    // 3. Evaluate each open order
    const results: Array<{
      pair: string; direction: string; action: string; reason: string;
      exitPrice?: number; pnlPips?: number;
    }> = [];

    let closedCount = 0;
    let heldCount = 0;

    for (const order of openOrders) {
      const oandaTrade = oandaTradeMap.get(order.oanda_trade_id!);
      
      // If trade is no longer on OANDA (already closed externally)
      if (!oandaTrade) {
        // Try to get the trade details to find exit price
        try {
          const tradeDetails = await oandaRequest(
            `/v3/accounts/{accountId}/trades/${order.oanda_trade_id}`,
            "GET"
          ) as { trade: { state: string; averageClosePrice?: string; closeTime?: string; realizedPL?: string } };
          
          if (tradeDetails.trade?.state === "CLOSED") {
            const exitPrice = tradeDetails.trade.averageClosePrice 
              ? parseFloat(tradeDetails.trade.averageClosePrice) 
              : null;
            
            await supabase
              .from("oanda_orders")
              .update({
                status: "closed",
                exit_price: exitPrice,
                closed_at: tradeDetails.trade.closeTime || new Date().toISOString(),
              })
              .eq("id", order.id);

            console.log(`[TRADE-MONITOR] ${order.currency_pair}: Already closed on OANDA at ${exitPrice}`);
            results.push({
              pair: order.currency_pair,
              direction: order.direction,
              action: "already-closed",
              reason: "Closed externally on OANDA",
              exitPrice: exitPrice || undefined,
            });
            closedCount++;
            continue;
          }
        } catch {
          console.warn(`[TRADE-MONITOR] Could not fetch trade ${order.oanda_trade_id} details`);
        }
        
        heldCount++;
        continue;
      }

      // Get current price from live trade
      const currentPrice = parseFloat(oandaTrade.price);
      const entryPrice = order.entry_price!;
      const tradeAgeMs = Date.now() - new Date(order.created_at).getTime();
      const tradeAgeMinutes = tradeAgeMs / 60000;

      // Evaluate exit decision
      const decision = evaluateExit(
        order.direction,
        entryPrice,
        currentPrice,
        order.currency_pair,
        tradeAgeMinutes
      );

      if (decision.action === "hold") {
        heldCount++;
        console.log(`[TRADE-MONITOR] ${order.currency_pair} ${order.direction}: ${decision.reason}`);
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: "hold",
          reason: decision.reason,
          pnlPips: decision.currentPnlPips,
        });
        continue;
      }

      // Close the trade
      console.log(`[TRADE-MONITOR] CLOSING ${order.currency_pair} ${order.direction}: ${decision.reason}`);

      try {
        const closeResult = await oandaRequest(
          `/v3/accounts/{accountId}/trades/${order.oanda_trade_id}/close`,
          "PUT",
          {}
        ) as { orderFillTransaction?: { price?: string } };

        const exitPrice = closeResult.orderFillTransaction?.price
          ? parseFloat(closeResult.orderFillTransaction.price)
          : currentPrice;

        // Update the order with exit data
        await supabase
          .from("oanda_orders")
          .update({
            status: "closed",
            exit_price: exitPrice,
            closed_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        closedCount++;
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: decision.action,
          reason: decision.reason,
          exitPrice,
          pnlPips: decision.currentPnlPips,
        });

        console.log(`[TRADE-MONITOR] ${order.currency_pair}: Closed at ${exitPrice} | ${decision.action} | ${decision.currentPnlPips.toFixed(1)}p`);
      } catch (closeErr) {
        console.error(`[TRADE-MONITOR] Failed to close ${order.currency_pair}:`, closeErr);
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: "close-failed",
          reason: (closeErr as Error).message,
        });
      }

      // Small delay between closes to avoid rate limiting
      if (closedCount > 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[TRADE-MONITOR] Complete: ${openOrders.length} monitored | ${closedCount} closed | ${heldCount} held | ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        monitored: openOrders.length,
        closed: closedCount,
        held: heldCount,
        results,
        elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[TRADE-MONITOR] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
