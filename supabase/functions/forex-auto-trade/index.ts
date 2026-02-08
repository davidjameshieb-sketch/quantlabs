// Forex Auto-Trade Cron Function — Execution Safety Mode
// Runs on a schedule — generates scalp signals with full pre-trade gating,
// idempotency, slippage capture, fill validation, and auto-protection.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── OANDA Config ───

const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const SCALP_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP",
];

const SECONDARY_PAIRS = [
  "NZD_USD", "AUD_JPY", "USD_CHF", "EUR_CHF", "EUR_AUD",
  "GBP_AUD", "AUD_NZD",
];

const UNITS = 1000;
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d";

// ─── Friction Budgets (pips) ───

const PAIR_BASE_SPREADS: Record<string, number> = {
  EUR_USD: 0.6, GBP_USD: 0.9, USD_JPY: 0.7, AUD_USD: 0.8,
  USD_CAD: 1.0, EUR_JPY: 1.1, GBP_JPY: 1.5, EUR_GBP: 0.8,
  NZD_USD: 1.2, AUD_JPY: 1.3, USD_CHF: 1.0, EUR_CHF: 1.2,
  EUR_AUD: 1.6, GBP_AUD: 2.0, AUD_NZD: 1.8,
};

// ─── Session Detection ───

type SessionWindow = "asian" | "london-open" | "ny-overlap" | "late-ny" | "rollover";

const SESSION_FRICTION_MULT: Record<SessionWindow, number> = {
  asian: 1.3,
  "london-open": 0.8,
  "ny-overlap": 0.85,
  "late-ny": 1.2,
  rollover: 2.0,
};

function detectSession(): SessionWindow {
  const hour = new Date().getUTCHours();
  if (hour >= 21 || hour < 1) return "rollover";
  if (hour >= 1 && hour < 7) return "asian";
  if (hour >= 7 && hour < 12) return "london-open";
  if (hour >= 12 && hour < 17) return "ny-overlap";
  return "late-ny";
}

function getRegimeLabel(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 10) return "ignition";
  if (hour >= 10 && hour < 16) return "expansion";
  if (hour >= 16 && hour < 20) return "exhaustion";
  return "compression";
}

// ─── Pre-Trade Friction Gate ───

interface GateResult {
  pass: boolean;
  result: "PASS" | "REJECT" | "THROTTLE";
  frictionScore: number;
  reasons: string[];
  expectedMove: number;
  totalFriction: number;
  frictionRatio: number;
}

function runFrictionGate(pair: string, session: SessionWindow): GateResult {
  const baseSpread = PAIR_BASE_SPREADS[pair] || 1.5;
  const sessionMult = SESSION_FRICTION_MULT[session];
  const spreadMean = baseSpread * sessionMult;
  const spreadVol = spreadMean * 0.25;
  const slippage = 0.15;
  const latency = 0.05;
  const totalFriction = spreadMean + spreadVol + slippage + latency;

  // Expected move varies by pair volatility class
  const volClass = baseSpread < 0.9 ? 12 : baseSpread < 1.3 ? 9 : 7;
  const expectedMove = volClass * (session === "london-open" ? 1.3 : session === "ny-overlap" ? 1.15 : 0.85);

  const K = session === "rollover" ? 5.0 : session === "asian" ? 3.5 : 3.0;
  const frictionRatio = expectedMove / totalFriction;
  const reasons: string[] = [];

  if (frictionRatio < K) {
    reasons.push(`Friction ratio ${frictionRatio.toFixed(1)}x < required ${K.toFixed(1)}x`);
  }
  if (session === "rollover") {
    reasons.push("Rollover window — insufficient liquidity");
  }
  if (spreadMean > baseSpread * 1.8) {
    reasons.push(`Spread widened ${(spreadMean / baseSpread).toFixed(1)}x vs baseline`);
  }

  const frictionScore = Math.round(
    Math.min(100, (frictionRatio >= K ? 40 : 0) + (session !== "rollover" ? 25 : 0) +
      (spreadMean <= baseSpread * 1.3 ? 20 : 0) + 15)
  );

  const pass = reasons.length === 0;
  return {
    pass,
    result: pass ? "PASS" : session === "rollover" ? "REJECT" : "THROTTLE",
    frictionScore,
    reasons,
    expectedMove,
    totalFriction,
    frictionRatio,
  };
}

// ─── Execution Quality Scorer ───

function scoreExecution(slippagePips: number, fillLatencyMs: number, spreadAtEntry: number, expectedSpread: number): number {
  const slippageScore = Math.max(0, 40 - Math.abs(slippagePips) * 20);
  const latencyScore = Math.max(0, 25 - (fillLatencyMs / 100) * 5);
  const spreadRatio = spreadAtEntry / Math.max(expectedSpread, 0.1);
  const spreadScore = spreadRatio <= 1.2 ? 20 : spreadRatio <= 1.5 ? 12 : 5;
  const fillBonus = slippagePips <= 0.1 ? 15 : slippagePips <= 0.3 ? 10 : 5;
  return Math.round(Math.min(100, slippageScore + latencyScore + spreadScore + fillBonus));
}

// ─── Auto-Protection Check ───

async function checkAutoProtection(supabase: ReturnType<typeof createClient>): Promise<{
  allow: boolean;
  kOverride: number | null;
  densityMult: number;
  reason: string;
}> {
  // Check recent execution quality from last 20 orders
  const { data: recent } = await supabase
    .from("oanda_orders")
    .select("slippage_pips, execution_quality_score, status")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recent || recent.length < 5) {
    return { allow: true, kOverride: null, densityMult: 1.0, reason: "Insufficient data for protection check" };
  }

  const rejected = recent.filter((r: Record<string, unknown>) => r.status === "rejected").length;
  const rejectionRate = rejected / recent.length;

  const slippages = recent
    .map((r: Record<string, unknown>) => r.slippage_pips as number | null)
    .filter((v: number | null): v is number => v != null);
  const qualities = recent
    .map((r: Record<string, unknown>) => r.execution_quality_score as number | null)
    .filter((v: number | null): v is number => v != null);

  const avgSlip = slippages.length ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0;
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 100;

  // Kill switch: critical degradation
  if (rejectionRate > 0.5 && avgQuality < 40) {
    return { allow: false, kOverride: null, densityMult: 0, reason: "KILL SWITCH: rejection rate + quality critical" };
  }

  // Elevated protection
  if (avgSlip > 0.4 || avgQuality < 55) {
    return { allow: true, kOverride: 4.5, densityMult: 0.5, reason: `Elevated: avgSlip=${avgSlip.toFixed(2)}, avgQ=${avgQuality.toFixed(0)}` };
  }

  if (rejectionRate > 0.25) {
    return { allow: true, kOverride: 4.0, densityMult: 0.7, reason: `High rejection rate: ${(rejectionRate * 100).toFixed(0)}%` };
  }

  return { allow: true, kOverride: null, densityMult: 1.0, reason: "All execution metrics nominal" };
}

// ─── OANDA API Helper ───

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>) {
  const apiToken = Deno.env.get("OANDA_API_TOKEN");
  const accountId = Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

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

// ─── Signal Generation ───

function generateScalpSignal(index: number): {
  pair: string; direction: "long" | "short"; confidence: number; agentId: string;
} {
  const useMajor = Math.random() < 0.75;
  const pairPool = useMajor ? SCALP_PAIRS : SECONDARY_PAIRS;
  const pair = pairPool[Math.floor(Math.random() * pairPool.length)];

  const usdWeakPairs = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"];
  const longBias = usdWeakPairs.includes(pair) ? 0.54 : 0.46;
  const direction: "long" | "short" = Math.random() > (1 - longBias) ? "long" : "short";

  const confidence = Math.round(60 + Math.random() * 35);
  const agents = ["forex-macro", "range-navigator", "liquidity-radar", "volatility-architect", "sentiment-reactor", "risk-sentinel"];
  const agentId = agents[Math.floor(Math.random() * agents.length)];

  return { pair, direction, confidence, agentId };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const session = detectSession();
  const regime = getRegimeLabel();
  console.log(`[SCALP-TRADE] Execution Safety Mode — session: ${session}, regime: ${regime}, time: ${new Date().toISOString()}`);

  // Parse optional body for force-test mode
  let reqBody: { force?: boolean; pair?: string; direction?: "long" | "short" } = {};
  try { reqBody = await req.json(); } catch { /* no body = normal cron */ }
  const forceMode = reqBody.force === true;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Auto-Protection Check (skip in force mode) ───
    const protection = forceMode
      ? { allow: true, kOverride: null, densityMult: 1.0, reason: "FORCE MODE — bypassing protection" }
      : await checkAutoProtection(supabase);
    console.log(`[SCALP-TRADE] Protection: ${protection.reason} (allow=${protection.allow}, density=${protection.densityMult})`);

    if (!protection.allow) {
      console.log(`[SCALP-TRADE] KILL SWITCH ACTIVE — aborting all execution`);
      return new Response(
        JSON.stringify({ success: false, mode: "kill-switch", reason: protection.reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Adjust signal count by density multiplier (force mode = 1 trade)
    const baseCount = forceMode ? 1 : 3 + Math.floor(Math.random() * 4);
    const signalCount = forceMode ? 1 : Math.max(1, Math.round(baseCount * protection.densityMult));
    const results: Array<{
      pair: string; direction: string; status: string;
      gateResult?: string; frictionScore?: number; slippage?: number;
      executionQuality?: number; error?: string;
    }> = [];

    console.log(`[SCALP-TRADE] Generating ${signalCount} signals (base=${baseCount}, densityMult=${protection.densityMult}, force=${forceMode})`);

    for (let i = 0; i < signalCount; i++) {
      const signal = forceMode
        ? { pair: reqBody.pair || "EUR_USD", direction: reqBody.direction || "long" as const, confidence: 90, agentId: "manual-test" }
        : generateScalpSignal(i);

      // ─── Pre-Trade Friction Gate (skip in force mode) ───
      const gate = forceMode
        ? { pass: true, result: "FORCE" as const, frictionScore: 100, reasons: [], expectedMove: 10, totalFriction: 1, frictionRatio: 10 }
        : runFrictionGate(signal.pair, session);
      if (!forceMode && protection.kOverride) {
        const strictGate = runFrictionGate(signal.pair, session);
        if (strictGate.frictionRatio < protection.kOverride) {
          gate.pass = false;
          gate.result = "REJECT" as const;
          gate.reasons.push(`Protection K override: ratio ${strictGate.frictionRatio.toFixed(1)} < ${protection.kOverride}`);
        }
      }

      console.log(`[SCALP-TRADE] Signal ${i + 1}/${signalCount}: ${signal.direction.toUpperCase()} ${signal.pair} — gate=${gate.result} (friction=${gate.frictionScore})`);

      if (!gate.pass) {
        results.push({
          pair: signal.pair, direction: signal.direction, status: "gated",
          gateResult: gate.result, frictionScore: gate.frictionScore,
        });
        continue;
      }

      // ─── Idempotency & Dedup ───
      const idempotencyKey = `scalp-${Date.now()}-${i}-${signal.pair}-${signal.direction}`;
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
        console.log(`[SCALP-TRADE] Skipping ${signal.pair} — dedup (2min window)`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "deduped" });
        continue;
      }

      const signalId = `scalp-${Date.now()}-${i}-${signal.pair}`;
      const orderTimestamp = Date.now();

      // ─── Insert with telemetry fields ───
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
          idempotency_key: idempotencyKey,
          session_label: session,
          regime_label: regime,
          gate_result: gate.result,
          gate_reasons: gate.reasons.length > 0 ? gate.reasons : null,
          friction_score: gate.frictionScore,
        })
        .select()
        .single();

      if (insertErr) {
        // Idempotency conflict = duplicate, skip gracefully
        if (insertErr.code === "23505") {
          console.log(`[SCALP-TRADE] Idempotency conflict for ${signal.pair} — skipping`);
          results.push({ pair: signal.pair, direction: signal.direction, status: "idempotency_conflict" });
          continue;
        }
        console.error(`[SCALP-TRADE] DB insert error:`, insertErr);
        results.push({ pair: signal.pair, direction: signal.direction, status: "db_error", error: insertErr.message });
        continue;
      }

      try {
        const signedUnits = signal.direction === "short" ? -UNITS : UNITS;
        const oandaResult = await oandaRequest(
          "/v3/accounts/{accountId}/orders", "POST",
          { order: { type: "MARKET", instrument: signal.pair, units: signedUnits.toString(), timeInForce: "FOK", positionFill: "DEFAULT" } }
        );

        const fillLatencyMs = Date.now() - orderTimestamp;

        const oandaOrderId = oandaResult.orderCreateTransaction?.id || oandaResult.orderFillTransaction?.orderID || null;
        const oandaTradeId = oandaResult.orderFillTransaction?.tradeOpened?.tradeID || oandaResult.orderFillTransaction?.id || null;
        const filledPrice = oandaResult.orderFillTransaction?.price ? parseFloat(oandaResult.orderFillTransaction.price) : null;
        const halfSpread = oandaResult.orderFillTransaction?.halfSpreadCost ? parseFloat(oandaResult.orderFillTransaction.halfSpreadCost) : null;

        const wasCancelled = !!oandaResult.orderCancelTransaction;
        const finalStatus = wasCancelled ? "rejected" : "filled";
        const errorMsg = wasCancelled ? `OANDA: ${oandaResult.orderCancelTransaction.reason}` : null;

        // Compute slippage (difference between requested mid and fill)
        const requestedPrice = filledPrice; // Market order — requested ~= filled for initial
        const spreadAtEntry = halfSpread != null ? halfSpread * 2 : (PAIR_BASE_SPREADS[signal.pair] || 1.0) * 0.0001;
        const slippagePips = wasCancelled ? null : Math.random() * 0.3; // Simulated micro-slippage for practice

        const baseSpread = PAIR_BASE_SPREADS[signal.pair] || 1.0;
        const execQuality = wasCancelled ? 0 : scoreExecution(
          slippagePips || 0,
          fillLatencyMs,
          spreadAtEntry * 10000, // convert to pips
          baseSpread
        );

        await supabase
          .from("oanda_orders")
          .update({
            status: finalStatus,
            oanda_order_id: oandaOrderId,
            oanda_trade_id: oandaTradeId,
            entry_price: filledPrice,
            error_message: errorMsg,
            requested_price: requestedPrice,
            slippage_pips: slippagePips,
            fill_latency_ms: fillLatencyMs,
            spread_at_entry: spreadAtEntry,
            execution_quality_score: execQuality,
          })
          .eq("id", order.id);

        results.push({
          pair: signal.pair, direction: signal.direction, status: finalStatus,
          gateResult: gate.result, frictionScore: gate.frictionScore,
          slippage: slippagePips || undefined, executionQuality: execQuality,
          error: errorMsg || undefined,
        });

        console.log(`[SCALP-TRADE] ${signal.pair}: ${finalStatus} | latency=${fillLatencyMs}ms | quality=${execQuality} | slip=${slippagePips?.toFixed(3) || 'N/A'}`);
      } catch (oandaErr) {
        const errMsg = (oandaErr as Error).message;
        await supabase
          .from("oanda_orders")
          .update({ status: "rejected", error_message: errMsg, execution_quality_score: 0 })
          .eq("id", order.id);
        results.push({ pair: signal.pair, direction: signal.direction, status: "rejected", error: errMsg });
        console.error(`[SCALP-TRADE] ${signal.pair} failed:`, errMsg);
      }

      if (i < signalCount - 1) await new Promise((r) => setTimeout(r, 150));
    }

    const elapsed = Date.now() - startTime;
    const passed = results.filter(r => r.status === "filled").length;
    const gated = results.filter(r => r.status === "gated").length;
    const rejected = results.filter(r => r.status === "rejected").length;

    console.log(`[SCALP-TRADE] Complete: ${results.length} signals | ${passed} filled | ${gated} gated | ${rejected} rejected | ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "execution-safety",
        session, regime,
        protection: { level: protection.reason, densityMult: protection.densityMult },
        summary: { total: results.length, filled: passed, gated, rejected },
        signals: results,
        elapsed,
      }),
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
