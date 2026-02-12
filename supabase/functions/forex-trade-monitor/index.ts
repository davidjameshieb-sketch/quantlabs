// Forex Trade Exit Monitor
// Runs on a cron schedule — checks open OANDA trades against TP/SL thresholds
// and time limits, auto-closes positions, records exit_price and closed_at.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d";
const STRATEGY_CUTOFF = "2026-02-12T01:00:00Z";

// ─── Pair-specific thresholds ───

const JPY_PAIRS = ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY"];

function getPipMultiplier(pair: string): number {
  return JPY_PAIRS.includes(pair) ? 0.01 : 0.0001;
}

// TP thresholds by volatility class (SL is dynamic via Supertrend+ATR, no time limits)
function getExitThresholds(pair: string): { tpPips: number } {
  const highVol = ["GBP_JPY", "GBP_AUD", "EUR_AUD", "AUD_NZD"];
  const medVol = ["GBP_USD", "EUR_JPY", "AUD_JPY", "USD_CAD", "EUR_GBP", "USD_JPY"];

  if (highVol.includes(pair)) {
    return { tpPips: 25 };
  }
  if (medVol.includes(pair)) {
    return { tpPips: 18 };
  }
  return { tpPips: 12 };
}

// ─── Dynamic Stop Loss from 15m Supertrend + ATR ───
// LONG: SL = supertrendValue - max(5 pips, 25% of 15m ATR)
// SHORT: SL = supertrendValue + max(5 pips, 25% of 15m ATR)
// Returns the SL price level and the distance in pips from entry

interface DynamicSL {
  slPrice: number;
  slDistancePips: number;
  source: "supertrend+atr" | "fallback";
}

function computeDynamicSL(
  direction: string,
  entryPrice: number,
  pair: string,
  supertrendValue: number | null,
  atr15m: number | null,
): DynamicSL {
  const pipMult = getPipMultiplier(pair);

  // Fallback if no indicator data available
  if (supertrendValue === null || atr15m === null) {
    const highVol = ["GBP_JPY", "GBP_AUD", "EUR_AUD", "AUD_NZD"];
    const medVol = ["GBP_USD", "EUR_JPY", "AUD_JPY", "USD_CAD", "EUR_GBP", "USD_JPY"];
    const fallbackSlPips = highVol.includes(pair) ? 12 : medVol.includes(pair) ? 9 : 7;
    const slPrice = direction === "long"
      ? entryPrice - fallbackSlPips * pipMult
      : entryPrice + fallbackSlPips * pipMult;
    return { slPrice, slDistancePips: fallbackSlPips, source: "fallback" };
  }

  // Buffer = max(5 pips, 25% of 15m ATR) converted to price units
  const minBufferPrice = 5 * pipMult;
  const atrBufferPrice = 0.25 * atr15m;
  const buffer = Math.max(minBufferPrice, atrBufferPrice);

  let slPrice: number;
  if (direction === "long") {
    // SL below the Supertrend
    slPrice = supertrendValue - buffer;
    // Sanity: SL must be BELOW entry for a long — otherwise it triggers immediately
    if (slPrice >= entryPrice) {
      const fallbackSlPips = 12;
      slPrice = entryPrice - fallbackSlPips * pipMult;
      console.log(`[DYNAMIC-SL] ${pair} long: Supertrend SL ${(supertrendValue - buffer).toFixed(5)} >= entry ${entryPrice.toFixed(5)}, using fallback ${slPrice.toFixed(5)}`);
    }
  } else {
    // SL above the Supertrend
    slPrice = supertrendValue + buffer;
    // Sanity: SL must be ABOVE entry for a short — otherwise it triggers immediately
    if (slPrice <= entryPrice) {
      const fallbackSlPips = 12;
      slPrice = entryPrice + fallbackSlPips * pipMult;
      console.log(`[DYNAMIC-SL] ${pair} short: Supertrend SL ${(supertrendValue + buffer).toFixed(5)} <= entry ${entryPrice.toFixed(5)}, using fallback ${slPrice.toFixed(5)}`);
    }
  }

  const slDistancePips = direction === "long"
    ? (entryPrice - slPrice) / pipMult
    : (slPrice - entryPrice) / pipMult;

  return { slPrice, slDistancePips: Math.abs(slDistancePips), source: "supertrend+atr" };
}

// ─── Trailing stop logic ───
// If trade is >60% to TP, tighten SL to breakeven + 1 pip

function computeTrailingStop(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  pair: string,
  tpPips: number,
  triggerRatio = 0.60
): { adjustedSlPrice: number; isTrailing: boolean } {
  const pipMult = getPipMultiplier(pair);

  const tpPrice = direction === "long"
    ? entryPrice + tpPips * pipMult
    : entryPrice - tpPips * pipMult;

  // Calculate progress toward TP
  const totalDistance = Math.abs(tpPrice - entryPrice);
  const currentDistance = direction === "long"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  const progressRatio = totalDistance > 0 ? currentDistance / totalDistance : 0;

  if (progressRatio >= triggerRatio) {
    const breakEvenPlus = direction === "long"
      ? entryPrice + 1 * pipMult
      : entryPrice - 1 * pipMult;
    return { adjustedSlPrice: breakEvenPlus, isTrailing: true };
  }

  return { adjustedSlPrice: 0, isTrailing: false };
}

// ─── OANDA API Helper ───

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>, environment = "live"): Promise<Record<string, unknown>> {
  const env = Deno.env.get("OANDA_ENV") || "live";
  const effectiveEnv = environment === "practice" ? env : environment; // always route through OANDA_ENV
  const apiToken = effectiveEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = effectiveEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[effectiveEnv] || OANDA_HOSTS.live;
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  
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
// ═══ EXIT RULE PRIORITY (STRICT, INVIOLABLE ORDER) ═══
// 1. TP hit          → CLOSE immediately
// 2. Trailing stop   → CLOSE immediately
// 3. SL hit          → CLOSE immediately (dynamic via Supertrend+ATR)
// 4. Hold            → Continue monitoring (NO time limits — let TP/SL/trailing handle exits)
//
// DIVERGENCE DEFENSE is SUBORDINATE to all hard rules:
//   ✅ Can tighten trailing stops (reduce trailing trigger from 60% → 40% of TP)
//   ❌ NEVER widens stops or delays exits

interface ExitDecision {
  action: "hold" | "close-tp" | "close-sl" | "close-trailing";
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
  tradeAgeMinutes: number,
  dynamicSl: DynamicSL,
  governancePayload?: Record<string, unknown>
): ExitDecision {
  const pipMult = getPipMultiplier(pair);
  const thresholds = getExitThresholds(pair);

  // Current P&L in pips
  const currentPnlPips = direction === "long"
    ? (currentPrice - entryPrice) / pipMult
    : (entryPrice - currentPrice) / pipMult;

  // Progress toward TP
  const progressToTp = currentPnlPips / thresholds.tpPips;

  // ═══ PRIORITY 1: TP hit ═══
  if (currentPnlPips >= thresholds.tpPips) {
    return {
      action: "close-tp",
      reason: `TP hit: +${currentPnlPips.toFixed(1)} pips (target: ${thresholds.tpPips})`,
      currentPnlPips, progressToTp, tradeAgeMinutes,
    };
  }

  // ═══ PRIORITY 2: Trailing stop ═══
  const entryRegimeDiverging = governancePayload?.regimeEarlyWarning === true;
  const trailingTriggerRatio = entryRegimeDiverging ? 0.40 : 0.60;
  const trailing = computeTrailingStop(direction, entryPrice, currentPrice, pair, thresholds.tpPips, trailingTriggerRatio);
  if (trailing.isTrailing) {
    const trailingSlPips = direction === "long"
      ? (currentPrice - trailing.adjustedSlPrice) / pipMult
      : (trailing.adjustedSlPrice - currentPrice) / pipMult;

    if (trailingSlPips <= 0) {
      return {
        action: "close-trailing",
        reason: `Trailing stop hit after reaching ${(progressToTp * 100).toFixed(0)}% of TP${entryRegimeDiverging ? ' (tightened: regime early-warn)' : ''}`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  }

  // ═══ PRIORITY 3: Dynamic SL hit (Supertrend + ATR based) ═══
  const slHit = direction === "long"
    ? currentPrice <= dynamicSl.slPrice
    : currentPrice >= dynamicSl.slPrice;

  if (slHit) {
    return {
      action: "close-sl",
      reason: `SL hit (${dynamicSl.source}): ${currentPnlPips.toFixed(1)} pips | SL@${dynamicSl.slPrice.toFixed(5)} (${dynamicSl.slDistancePips.toFixed(1)}p from entry)`,
      currentPnlPips, progressToTp, tradeAgeMinutes,
    };
  }

  return {
    action: "hold",
    reason: `Holding: ${currentPnlPips.toFixed(1)}p P&L, ${(progressToTp * 100).toFixed(0)}% to TP, SL@${dynamicSl.slPrice.toFixed(5)} (${dynamicSl.slDistancePips.toFixed(1)}p), ${tradeAgeMinutes.toFixed(0)}min age [${dynamicSl.source}]`,
    currentPnlPips, progressToTp, tradeAgeMinutes,
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
      .gte("created_at", STRATEGY_CUTOFF)
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
    // Group orders by environment for correct OANDA routing
    const ordersByEnv = new Map<string, typeof openOrders>();
    for (const o of openOrders) {
      const env = o.environment || "practice";
      if (!ordersByEnv.has(env)) ordersByEnv.set(env, []);
      ordersByEnv.get(env)!.push(o);
    }

    // Fetch open trades from each environment
    let oandaTrades: Array<{ id: string; instrument: string; currentUnits: string; price: string; unrealizedPL: string }> = [];
    for (const env of ordersByEnv.keys()) {
      try {
        const tradesResult = await oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, env);
        const trades = (tradesResult.trades || []) as typeof oandaTrades;
        oandaTrades.push(...trades);
      } catch (err) {
        console.error(`[TRADE-MONITOR] Failed to fetch OANDA trades for ${env}:`, err);
      }
    }

    // Build a map of OANDA trade ID -> live trade data
    const oandaTradeMap = new Map<string, typeof oandaTrades[0]>();
    for (const t of oandaTrades) {
      oandaTradeMap.set(t.id, t);
    }

    // ═══ FIX: Fetch CURRENT market prices for all instruments with open trades ═══
    // CRITICAL: oandaTrade.price is the ENTRY price, NOT the current market price!
    // Without this, all TP/SL/trailing evaluations see ~0 pips P&L and never trigger.
    const instrumentsNeeded = new Set(openOrders.map(o => o.currency_pair));
    const currentPriceMap = new Map<string, number>();
    if (instrumentsNeeded.size > 0) {
      try {
        const instruments = [...instrumentsNeeded].join(",");
        const priceRes = await oandaRequest(
          `/v3/accounts/{accountId}/pricing?instruments=${instruments}`, "GET", undefined, "live"
        ) as { prices?: Array<{ instrument: string; asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
        for (const p of (priceRes.prices || [])) {
          const ask = parseFloat(p.asks?.[0]?.price || "0");
          const bid = parseFloat(p.bids?.[0]?.price || "0");
          const mid = (ask + bid) / 2;
          if (mid > 0) currentPriceMap.set(p.instrument, mid);
        }
        console.log(`[TRADE-MONITOR] Fetched live prices for ${currentPriceMap.size} instruments`);
      } catch (priceErr) {
        console.error(`[TRADE-MONITOR] Failed to fetch current prices:`, priceErr);
      }
    }

    // ═══ Fetch 15m Supertrend + ATR for dynamic stop loss ═══
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const indicatorMap = new Map<string, { supertrend: number; atr: number }>();

    // Fetch 15m indicators for each unique pair (parallel)
    const indicatorPromises = [...instrumentsNeeded].map(async (pair) => {
      try {
        const url = `${supabaseUrl}/functions/v1/forex-indicators?instrument=${pair}&timeframe=15m`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const stValue = data.indicators?.supertrend?.value;
          const atrValue = data.indicators?.atr?.value;
          if (stValue != null && atrValue != null) {
            indicatorMap.set(pair, { supertrend: stValue, atr: atrValue });
          }
        }
      } catch (err) {
        console.warn(`[TRADE-MONITOR] Failed to fetch 15m indicators for ${pair}:`, (err as Error).message);
      }
    });
    await Promise.all(indicatorPromises);
    console.log(`[TRADE-MONITOR] Fetched 15m indicators (Supertrend+ATR) for ${indicatorMap.size}/${instrumentsNeeded.size} pairs`);

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
        try {
          const tradeDetails = await oandaRequest(
            `/v3/accounts/{accountId}/trades/${order.oanda_trade_id}`,
            "GET",
            undefined,
            order.environment || "practice"
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

      const livePrice = currentPriceMap.get(order.currency_pair);
      const currentPrice = livePrice || parseFloat(oandaTrade.price);
      if (!livePrice) {
        console.warn(`[TRADE-MONITOR] ${order.currency_pair}: No live price, using trade entry as fallback`);
      }
      const entryPrice = order.entry_price!;
      const tradeAgeMs = Date.now() - new Date(order.created_at).getTime();
      const tradeAgeMinutes = tradeAgeMs / 60000;

      // Compute dynamic SL from 15m Supertrend + ATR
      const ind = indicatorMap.get(order.currency_pair);
      const dynamicSl = computeDynamicSL(
        order.direction,
        entryPrice,
        order.currency_pair,
        ind?.supertrend ?? null,
        ind?.atr ?? null,
      );

      // Evaluate exit decision
      const govPayload = (order.governance_payload && typeof order.governance_payload === 'object')
        ? order.governance_payload as Record<string, unknown>
        : undefined;
      const decision = evaluateExit(
        order.direction,
        entryPrice,
        currentPrice,
        order.currency_pair,
        tradeAgeMinutes,
        dynamicSl,
        govPayload
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
          {},
          order.environment || "practice"
        ) as { orderFillTransaction?: { price?: string } };

        const exitPrice = closeResult.orderFillTransaction?.price
          ? parseFloat(closeResult.orderFillTransaction.price)
          : currentPrice;

        // Update the order with exit data + exit reason for auditability
        const existingPayload = order.governance_payload || {};
        const updatedPayload = {
          ...(typeof existingPayload === 'object' ? existingPayload : {}),
          exitReason: decision.action,
          exitDetail: decision.reason,
          exitPnlPips: parseFloat(decision.currentPnlPips.toFixed(2)),
          exitProgressToTp: parseFloat((decision.progressToTp * 100).toFixed(1)),
          exitTradeAgeMin: parseFloat(decision.tradeAgeMinutes.toFixed(1)),
        };

        await supabase
          .from("oanda_orders")
          .update({
            status: "closed",
            exit_price: exitPrice,
            closed_at: new Date().toISOString(),
            governance_payload: updatedPayload,
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

    // ═══════════════════════════════════════════════════════════
    // COUNTERFACTUAL MONITOR — Track outcomes for blocked trades
    // ═══════════════════════════════════════════════════════════
    let counterfactualUpdated = 0;
    try {
      // Find rejected orders with counterfactual entry price but missing exit prices
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: cfOrders } = await supabase
        .from("oanda_orders")
        .select("id, currency_pair, direction, counterfactual_entry_price, created_at")
        .in("status", ["rejected", "blocked", "skipped"])
        .not("counterfactual_entry_price", "is", null)
        .is("counterfactual_exit_15m", null)
        .gte("created_at", thirtyMinAgo)
        .lte("created_at", fifteenMinAgo)
        .limit(20);

      if (cfOrders && cfOrders.length > 0) {
        // Group by pair to minimize OANDA API calls
        const pairSet = new Set(cfOrders.map(o => o.currency_pair));
        const pairPrices = new Map<string, number>();

        for (const p of pairSet) {
          try {
            const priceRes = await oandaRequest(
              `/v3/accounts/{accountId}/pricing?instruments=${p}`, "GET", undefined, "live"
            ) as { prices?: Array<{ asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
            const mid = priceRes.prices?.[0];
            if (mid) {
              const ask = parseFloat(mid.asks?.[0]?.price || "0");
              const bid = parseFloat(mid.bids?.[0]?.price || "0");
              pairPrices.set(p, (ask + bid) / 2);
            }
          } catch { /* skip pair */ }
        }

        for (const cfOrder of cfOrders) {
          const currentPrice = pairPrices.get(cfOrder.currency_pair);
          if (!currentPrice || !cfOrder.counterfactual_entry_price) continue;

          const entryPrice = Number(cfOrder.counterfactual_entry_price);
          const pipMult = cfOrder.currency_pair.includes("JPY") ? 0.01 : 0.0001;
          const pnlPips = cfOrder.direction === "long"
            ? (currentPrice - entryPrice) / pipMult
            : (entryPrice - currentPrice) / pipMult;

          const ageMs = Date.now() - new Date(cfOrder.created_at).getTime();
          const ageMin = ageMs / 60000;

          // Determine which time bucket to fill
          const updates: Record<string, unknown> = {};
          if (ageMin >= 5 && ageMin < 10) {
            updates.counterfactual_exit_5m = currentPrice;
          } else if (ageMin >= 10 && ageMin < 15) {
            updates.counterfactual_exit_5m = updates.counterfactual_exit_5m || currentPrice;
            updates.counterfactual_exit_10m = currentPrice;
          } else if (ageMin >= 15) {
            updates.counterfactual_exit_15m = currentPrice;
            updates.counterfactual_pips = pnlPips;
            updates.counterfactual_result = pnlPips > 0 ? "win" : "loss";
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from("oanda_orders")
              .update(updates)
              .eq("id", cfOrder.id);
            counterfactualUpdated++;
          }
        }
        console.log(`[TRADE-MONITOR] Counterfactual: updated ${counterfactualUpdated} blocked trade outcomes`);
      }
    } catch (cfErr) {
      console.warn(`[TRADE-MONITOR] Counterfactual monitor error:`, (cfErr as Error).message);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[TRADE-MONITOR] Complete: ${openOrders.length} monitored | ${closedCount} closed | ${heldCount} held | ${counterfactualUpdated} counterfactual | ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        monitored: openOrders.length,
        closed: closedCount,
        held: heldCount,
        counterfactualUpdated,
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
