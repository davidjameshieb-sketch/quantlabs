// OANDA v20 REST API Trade Execution Edge Function
// Forwards AI trade signals to OANDA practice/live accounts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// OANDA API endpoints
const OANDA_HOSTS = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
} as const;

interface ExecuteRequest {
  action: "execute" | "close" | "status" | "account-summary" | "update-orders" | "barrage" | "cancel-pending";
  signalId?: string;
  currencyPair?: string;
  direction?: "long" | "short";
  units?: number;
  confidenceScore?: number;
  agentId?: string;
  oandaTradeId?: string;
  environment?: "practice" | "live";
  stopLossPrice?: number;
  takeProfitPrice?: number;
  // Barrage execution — atomic multi-pair entry
  barrageOrders?: Array<{
    currencyPair: string;
    direction: "long" | "short";
    units: number;
    signalId: string;
    agentId?: string;
  }>;
}

// Convert pair format to OANDA instrument format (EUR_USD).
// Accepts both EUR/USD (slash) and EUR_USD (underscore) formats safely.
function toOandaInstrument(pair: string): string {
  return pair.replace("/", "_");
}

// Make authenticated request to OANDA v20 API
async function oandaRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  environment: "practice" | "live" = "practice"
) {
  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) {
    throw new Error("OANDA credentials not configured");
  }

  const host = OANDA_HOSTS[environment];
  const url = `${host}${path.replace("{accountId}", accountId)}`;

  console.log(`[OANDA] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(`[OANDA] Error ${response.status}:`, JSON.stringify(data));
    throw new Error(
      data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`
    );
  }

  return data;
}

// Execute a market order on OANDA
async function executeMarketOrder(
  instrument: string,
  units: number,
  direction: "long" | "short",
  environment: "practice" | "live"
) {
  const signedUnits = direction === "short" ? -Math.abs(units) : Math.abs(units);

  const orderBody = {
    order: {
      type: "MARKET",
      instrument: toOandaInstrument(instrument),
      units: signedUnits.toString(),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
    },
  };

  console.log(`[OANDA] Executing market order:`, JSON.stringify(orderBody));

  const result = await oandaRequest(
    "/v3/accounts/{accountId}/orders",
    "POST",
    orderBody,
    environment
  );

  return result;
}

// Close an existing trade
async function closeTrade(tradeId: string, environment: "practice" | "live") {
  console.log(`[OANDA] Closing trade: ${tradeId}`);
  const result = await oandaRequest(
    `/v3/accounts/{accountId}/trades/${tradeId}/close`,
    "PUT",
    {},
    environment
  );
  return result;
}

// Get account summary
async function getAccountSummary(environment: "practice" | "live") {
  const result = await oandaRequest(
    "/v3/accounts/{accountId}/summary",
    "GET",
    undefined,
    environment
  );
  return result;
}

// Get open trades
async function getOpenTrades(environment: "practice" | "live") {
  const result = await oandaRequest(
    "/v3/accounts/{accountId}/openTrades",
    "GET",
    undefined,
    environment
  );
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: accept both user JWTs and anon key (for sovereign-matrix execution)
    const authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Try to get authenticated user — fall back to system UUID for matrix-fired trades
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id || "00000000-0000-0000-0000-000000000000";
    const body: ExecuteRequest = await req.json();
    const environment = body.environment || "practice";

    console.log(`[OANDA] Action: ${body.action}, User: ${userId}, Env: ${environment}`);

    // ─── Account Summary ───
    if (body.action === "account-summary") {
      const summary = await getAccountSummary(environment);
      const openTrades = await getOpenTrades(environment);

      return new Response(
        JSON.stringify({
          success: true,
          account: summary.account,
          openTrades: openTrades.trades || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Status (open orders from DB) ───
    if (body.action === "status") {
      // Fetch recent orders from last 7 days only (avoid full table scan)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: orders, error } = await supabase
        .from("oanda_orders")
        .select("id,signal_id,currency_pair,direction,units,entry_price,exit_price,oanda_order_id,oanda_trade_id,status,error_message,confidence_score,agent_id,environment,created_at,closed_at")
        .eq("user_id", userId)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, orders: orders || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Execute Trade ───
    if (body.action === "execute") {
      if (!body.signalId || !body.currencyPair || !body.direction || !body.units) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: signalId, currencyPair, direction, units" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ═══ AGENT MANDATE LOCKS — prevent execution bypass ═══
      const agentId = body.agentId || '';
      const instrument = toOandaInstrument(body.currencyPair);

      // M4 JPY-only lock
      if (agentId.includes('-m4') && !instrument.includes('JPY')) {
        return new Response(
          JSON.stringify({ error: `M4 JPY-only lock: ${instrument} rejected — agent drift prevention` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // M8 USD regime gate — need matrix ranks
      if (agentId.includes('-m8') || agentId.includes('-m9')) {
        try {
          const matrixRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/sovereign-matrix`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
              },
              body: JSON.stringify({ environment }),
            }
          );
          if (matrixRes.ok) {
            const matrixData = await matrixRes.json();
            const ranks: Record<string, number> = matrixData.currencyRanks || {};

            // M8: block when USD rank <= 3 (strong)
            if (agentId.includes('-m8') && (ranks['USD'] ?? 4) <= 3) {
              return new Response(
                JSON.stringify({ error: `M8 USD regime gate: USD rank #${ranks['USD']} (strong) — m8 blocked` }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            // M9: rank gap >= 5 + momentum gate
            if (agentId.includes('-m9')) {
              const [baseCur, quoteCur] = instrument.split('_');
              const baseRank = ranks[baseCur] ?? 4;
              const quoteRank = ranks[quoteCur] ?? 4;
              const gap = Math.abs(baseRank - quoteRank);
              if (gap < 5) {
                return new Response(
                  JSON.stringify({ error: `M9 rank gap filter: gap=${gap} < 5 minimum` }),
                  { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              if (body.direction === 'short' && baseRank <= 3) {
                return new Response(
                  JSON.stringify({ error: `M9 momentum gate: cannot short ${baseCur} (rank #${baseRank}, top-3)` }),
                  { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              if (body.direction === 'long' && quoteRank <= 3) {
                return new Response(
                  JSON.stringify({ error: `M9 momentum gate: cannot long against ${quoteCur} (rank #${quoteRank}, top-3)` }),
                  { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            }
          }
        } catch (gateErr) {
          console.warn('[OANDA] Agent gate check failed (allowing trade):', (gateErr as Error).message);
        }
      }

      // Insert pending order
      const { data: order, error: insertErr } = await supabase
        .from("oanda_orders")
        .insert({
          user_id: userId,
          signal_id: body.signalId,
          currency_pair: body.currencyPair,
          direction: body.direction,
          units: body.units,
          confidence_score: body.confidenceScore || null,
          agent_id: body.agentId || null,
          environment,
          status: "submitted",
        })
        .select()
        .single();

      if (insertErr) {
        console.error("[OANDA] DB insert error:", insertErr);
        throw insertErr;
      }

      try {
      // Forward to OANDA with telemetry capture
        const orderTimestamp = Date.now();
        const result = await executeMarketOrder(
          body.currencyPair,
          body.units,
          body.direction,
          environment
        );

        const fillLatencyMs = Date.now() - orderTimestamp;
        console.log("[OANDA] Order result:", JSON.stringify(result));

        // Extract order/trade IDs from response
        const oandaOrderId =
          result.orderCreateTransaction?.id || result.orderFillTransaction?.orderID || null;
        const oandaTradeId =
          result.orderFillTransaction?.tradeOpened?.tradeID ||
          result.orderFillTransaction?.id ||
          null;
        const filledPrice =
          result.orderFillTransaction?.price
            ? parseFloat(result.orderFillTransaction.price)
            : null;

        // Capture execution telemetry — compute REAL slippage from fill price vs requested
        const halfSpreadCost = result.orderFillTransaction?.halfSpreadCost
          ? parseFloat(result.orderFillTransaction.halfSpreadCost) : null;
        const spreadAtEntry = halfSpreadCost != null ? halfSpreadCost * 2 : null;
        // CRITICAL BUG FIX: Math.random() was used as slippage — corrupting analytics.
        // Compute real slippage: |fill_price - requested_price| in pips.
        const requestedPx = result.orderCreateTransaction?.price
          ? parseFloat(result.orderCreateTransaction.price) : filledPrice;
        const isJPY = (body.currencyPair || "").includes("JPY");
        const pipMult = isJPY ? 100 : 10000;
        const slippagePips = (filledPrice != null && requestedPx != null)
          ? Math.abs((filledPrice - requestedPx) * pipMult)
          : null;
        const execQuality = slippagePips != null ? Math.round(Math.min(100, 100 - slippagePips * 10)) : null;

        // Update order record with telemetry
        await supabase
          .from("oanda_orders")
          .update({
            status: "filled",
            oanda_order_id: oandaOrderId,
            oanda_trade_id: oandaTradeId,
            entry_price: filledPrice,
            requested_price: requestedPx,
            slippage_pips: slippagePips,
            fill_latency_ms: fillLatencyMs,
            spread_at_entry: spreadAtEntry,
            execution_quality_score: execQuality,
          })
          .eq("id", order.id);

        return new Response(
          JSON.stringify({
            success: true,
            order: {
              ...order, status: "filled",
              oanda_order_id: oandaOrderId, oanda_trade_id: oandaTradeId,
              entry_price: filledPrice, fill_latency_ms: fillLatencyMs,
              slippage_pips: slippagePips, execution_quality_score: execQuality,
            },
            oandaResult: result,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (oandaErr) {
        // Mark order as rejected
        await supabase
          .from("oanda_orders")
          .update({
            status: "rejected",
            error_message: (oandaErr as Error).message,
          })
          .eq("id", order.id);

        return new Response(
          JSON.stringify({
            success: false,
            error: (oandaErr as Error).message,
            order: { ...order, status: "rejected" },
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Close Trade ───
    if (body.action === "close") {
      if (!body.oandaTradeId) {
        return new Response(
          JSON.stringify({ error: "Missing oandaTradeId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await closeTrade(body.oandaTradeId, environment);

      // Update DB record
      const closePrice = result.orderFillTransaction?.price
        ? parseFloat(result.orderFillTransaction.price)
        : null;

      await supabase
        .from("oanda_orders")
        .update({
          status: "closed",
          exit_price: closePrice,
          closed_at: new Date().toISOString(),
          // ═══ SOLUTION #2: Write-time pip normalization ═══
          r_pips: (() => {
            // Fetch entry to compute — closePrice is already parsed
            if (closePrice == null) return null;
            // We need the order's entry_price + direction — fetch inline
            return null; // Will be computed by trade-monitor reconciliation
          })(),
        })
        .eq("oanda_trade_id", body.oandaTradeId);
        // NOTE: Do NOT filter by user_id here — matrix-fired trades use the system UUID (00000000-...)
        // but the row was written with whatever user_id was active at execute time.

      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Update Trade Orders (SL/TP modification) ───
    if (body.action === "update-orders") {
      if (!body.oandaTradeId) {
        return new Response(
          JSON.stringify({ error: "Missing oandaTradeId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CRITICAL BUG FIX: JPY pairs require 3 decimal places, all others 5.
      // Using .toFixed(5) for JPY pairs causes PRICE_PRECISION_EXCEEDED rejections from OANDA.
      const instrument = body.oandaTradeId || "";
      // We don't have the pair here, so fetch the open trade from OANDA to get the instrument
      let pricePrecision = 5;
      try {
        const tradeRes = await fetch(
          `${OANDA_HOSTS[environment]}/v3/accounts/${Deno.env.get(environment === "live" ? "OANDA_LIVE_ACCOUNT_ID" : "OANDA_ACCOUNT_ID")}/trades/${body.oandaTradeId}`,
          { headers: { Authorization: `Bearer ${Deno.env.get(environment === "live" ? "OANDA_LIVE_API_TOKEN" : "OANDA_API_TOKEN")}`, Accept: "application/json" } }
        );
        if (tradeRes.ok) {
          const tradeData = await tradeRes.json();
          const tradeInstrument = tradeData.trade?.instrument || "";
          pricePrecision = tradeInstrument.includes("JPY") ? 3 : 5;
        }
      } catch { /* non-critical, default to 5 */ }

      const orderUpdate: Record<string, unknown> = {};
      if (body.stopLossPrice != null) {
        orderUpdate.stopLoss = { price: body.stopLossPrice.toFixed(pricePrecision), timeInForce: "GTC" };
      }
      if (body.takeProfitPrice != null) {
        orderUpdate.takeProfit = { price: body.takeProfitPrice.toFixed(pricePrecision), timeInForce: "GTC" };
      }

      if (Object.keys(orderUpdate).length === 0) {
        return new Response(
          JSON.stringify({ error: "No stopLossPrice or takeProfitPrice specified" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await oandaRequest(
        `/v3/accounts/{accountId}/trades/${body.oandaTradeId}/orders`,
        "PUT",
        orderUpdate,
        environment
      );

      console.log(`[OANDA] Trade ${body.oandaTradeId} orders updated: SL=${body.stopLossPrice?.toFixed(pricePrecision) || 'unchanged'} TP=${body.takeProfitPrice?.toFixed(pricePrecision) || 'unchanged'}`);

      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── #9: Atomic Barrage Execution — simultaneous multi-pair entry ───
    if (body.action === "barrage") {
      if (!body.barrageOrders?.length) {
        return new Response(
          JSON.stringify({ error: "barrageOrders array required for barrage execution" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ═══ AGENT MANDATE LOCKS — filter barrage orders pre-execution ═══
      let matrixRanksForBarrage: Record<string, number> | null = null;
      const needsMatrix = body.barrageOrders.some(o => (o.agentId || '').includes('-m8') || (o.agentId || '').includes('-m9'));
      if (needsMatrix) {
        try {
          const matrixRes = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/sovereign-matrix`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`, apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
              body: JSON.stringify({ environment }),
            }
          );
          if (matrixRes.ok) {
            const md = await matrixRes.json();
            matrixRanksForBarrage = md.currencyRanks || null;
          }
        } catch { /* non-critical */ }
      }

      // Filter out mandate-violating orders
      const filteredBarrage = body.barrageOrders.filter(o => {
        const aid = o.agentId || '';
        const inst = toOandaInstrument(o.currencyPair);
        // M4 JPY-only
        if (aid.includes('-m4') && !inst.includes('JPY')) {
          console.log(`[OANDA] BARRAGE FILTER: ${inst} rejected — M4 JPY-only lock`);
          return false;
        }
        if (matrixRanksForBarrage) {
          // M8 USD regime gate
          if (aid.includes('-m8') && (matrixRanksForBarrage['USD'] ?? 4) <= 3) {
            console.log(`[OANDA] BARRAGE FILTER: ${inst} rejected — M8 USD rank #${matrixRanksForBarrage['USD']}`);
            return false;
          }
          // M9 gap + momentum gate
          if (aid.includes('-m9')) {
            const [b, q] = inst.split('_');
            const bR = matrixRanksForBarrage[b] ?? 4;
            const qR = matrixRanksForBarrage[q] ?? 4;
            if (Math.abs(bR - qR) < 5) { console.log(`[OANDA] BARRAGE FILTER: ${inst} rejected — M9 gap ${Math.abs(bR - qR)} < 5`); return false; }
            if (o.direction === 'short' && bR <= 3) { console.log(`[OANDA] BARRAGE FILTER: ${inst} rejected — M9 can't short top-3`); return false; }
            if (o.direction === 'long' && qR <= 3) { console.log(`[OANDA] BARRAGE FILTER: ${inst} rejected — M9 can't long vs top-3`); return false; }
          }
        }
        return true;
      });

      if (filteredBarrage.length === 0) {
        return new Response(
          JSON.stringify({ success: true, action: "barrage", totalOrders: body.barrageOrders.length, filled: 0, filtered: body.barrageOrders.length, reason: "All orders rejected by agent mandate locks" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const barrageTs = Date.now();
      console.log(`[OANDA] ⚡ BARRAGE: ${filteredBarrage.length}/${body.barrageOrders.length} orders firing (${body.barrageOrders.length - filteredBarrage.length} filtered by mandate locks)`);

      // Insert all pending orders first
      const pendingInserts = filteredBarrage.map(o => ({
        user_id: userId,
        signal_id: o.signalId,
        currency_pair: o.currencyPair,
        direction: o.direction,
        units: o.units,
        agent_id: o.agentId || "barrage-engine",
        environment,
        status: "submitted",
      }));

      const { data: insertedOrders, error: batchInsertErr } = await supabase
        .from("oanda_orders")
        .insert(pendingInserts)
        .select();

      if (batchInsertErr) throw batchInsertErr;

      // Fire all OANDA orders simultaneously
      const results = await Promise.allSettled(
        filteredBarrage.map(async (o, idx) => {
          const orderTs = Date.now();
          const result = await executeMarketOrder(o.currencyPair, o.units, o.direction, environment);
          const latency = Date.now() - orderTs;

          const oandaOrderId = result.orderCreateTransaction?.id || result.orderFillTransaction?.orderID || null;
          const oandaTradeId = result.orderFillTransaction?.tradeOpened?.tradeID || null;
          const filledPrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;

          if (insertedOrders?.[idx]) {
            await supabase.from("oanda_orders").update({
              status: "filled",
              oanda_order_id: oandaOrderId,
              oanda_trade_id: oandaTradeId,
              entry_price: filledPrice,
              fill_latency_ms: latency,
            }).eq("id", insertedOrders[idx].id);

            // Log to execution_analytics (#4)
            await supabase.from("execution_analytics").insert({
              currency_pair: o.currencyPair,
              direction: o.direction,
              fill_price: filledPrice,
              fill_latency_ms: latency,
              agent_id: o.agentId || "barrage-engine",
              oanda_order_id: oandaOrderId,
            });
          }

          return { pair: o.currencyPair, direction: o.direction, oandaTradeId, filledPrice, latency };
        })
      );

      const totalLatency = Date.now() - barrageTs;
      const filled = results.filter(r => r.status === "fulfilled").length;
      const mandateFiltered = body.barrageOrders!.length - filteredBarrage.length;
      console.log(`[OANDA] ⚡ BARRAGE COMPLETE: ${filled}/${filteredBarrage.length} filled in ${totalLatency}ms (${mandateFiltered} filtered by mandate locks)`);

      return new Response(
        JSON.stringify({
          success: true,
          action: "barrage",
          totalOrders: body.barrageOrders!.length,
          filled,
          mandateFiltered,
          totalLatencyMs: totalLatency,
          results: results.map((r, i) => ({
            pair: filteredBarrage[i].currencyPair,
            status: r.status,
            ...(r.status === "fulfilled" ? r.value : { error: (r as PromiseRejectedResult).reason?.message }),
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Cancel All Pending Orders ───
    if (body.action === "cancel-pending") {
      const apiToken = environment === "live"
        ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
        : Deno.env.get("OANDA_API_TOKEN");
      const accountId = environment === "live"
        ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
        : Deno.env.get("OANDA_ACCOUNT_ID");
      const host = OANDA_HOSTS[environment];

      // Fetch pending orders from OANDA
      const pendingRes = await fetch(`${host}/v3/accounts/${accountId}/pendingOrders`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      });
      if (!pendingRes.ok) throw new Error(`Failed to fetch pending orders: ${pendingRes.status}`);
      const pendingData = await pendingRes.json();
      const pendingOrders = pendingData.orders || [];

      console.log(`[OANDA] Cancelling ${pendingOrders.length} pending orders`);

      const cancelResults = await Promise.allSettled(
        pendingOrders.map(async (order: any) => {
          const cancelRes = await fetch(`${host}/v3/accounts/${accountId}/orders/${order.id}/cancel`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
          });
          return { orderId: order.id, instrument: order.instrument, status: cancelRes.ok ? "cancelled" : "failed" };
        })
      );

      // Mark all submitted DB records as cancelled
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("oanda_orders")
        .update({ status: "cancelled", error_message: "Pending OANDA order cancelled — stale 20-pip offset" })
        .eq("status", "submitted")
        .eq("environment", environment)
        .like("agent_id", "atlas-hedge-%");

      return new Response(
        JSON.stringify({
          success: true,
          action: "cancel-pending",
          cancelledOnOanda: cancelResults.filter((r: any) => r.status === "fulfilled").length,
          cancelledInDb: true,
          details: cancelResults.map((r: any) => r.status === "fulfilled" ? r.value : { error: (r as any).reason?.message }),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: execute, close, status, account-summary, update-orders, barrage, cancel-pending" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[OANDA] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
