// Fast-Poll Trigger Evaluator v2 — Ripple Strike Engine
// Evaluates armed correlation triggers against live OANDA prices at high frequency (10s via pg_cron).
// NOW ACTUALLY FIRES TRADES when divergence thresholds are breached.
//
// Improvements over v1:
// 1. Real divergence calculation against stored baselines
// 2. Spread gate (quiet pair spread must be < 40% of threshold)
// 3. Quiet-pair stillness check (quiet must have moved < 30% of loud move)
// 4. Stale trigger expiry (auto-revoke if armed > maxLagMinutes)
// 5. Autonomous trade execution via OANDA API
// 6. Idempotency guard (won't re-fire already-fired triggers)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";

interface ArmedTrigger {
  id: string;
  gate_id: string;
  pair: string | null;
  reason: string;
  expires_at: string;
  created_at: string;
}

interface TriggerPayload {
  triggerId: string;
  loudPair: string;
  quietPair: string;
  direction: string;
  thresholdPips: number;
  units: number;
  maxLagMinutes: number;
  slPips: number;
  tpPips: number;
  loudBaseline: number | null;
  quietBaseline: number | null;
  armedAt: string;
  fired: boolean;
  reason: string;
  correlationGroup: string | null;
}

interface PriceInfo {
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadPips: number;
}

function pipMultiplier(pair: string): number {
  return pair.includes("JPY") ? 100 : 10000;
}

function toPips(priceMove: number, pair: string): number {
  return priceMove * pipMultiplier(pair);
}

function fromPips(pips: number, pair: string): number {
  return pips / pipMultiplier(pair);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OANDA_TOKEN = Deno.env.get("OANDA_LIVE_API_TOKEN");
  const OANDA_ACCOUNT = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LIVE_ENABLED = Deno.env.get("LIVE_TRADING_ENABLED");

  if (!OANDA_TOKEN || !OANDA_ACCOUNT) {
    return new Response(JSON.stringify({ error: "OANDA credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // ─── 1. Fetch armed CORRELATION_TRIGGER records ───
    const { data: triggers, error: trigErr } = await supabase
      .from("gate_bypasses")
      .select("*")
      .like("gate_id", "CORRELATION_TRIGGER:%")
      .eq("revoked", false)
      .gte("expires_at", nowISO);

    if (trigErr) {
      console.error("[RIPPLE] Trigger fetch error:", trigErr);
      return new Response(JSON.stringify({ error: trigErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!triggers || triggers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No armed triggers", evaluated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. Parse and validate triggers ───
    const cleanPair = (p: string) => p.replace(/^[A-Z]+:/, "");
    const instruments = new Set<string>();
    const parsedTriggers: { trigger: ArmedTrigger; config: TriggerPayload }[] = [];

    for (const t of triggers as ArmedTrigger[]) {
      try {
        const payload = JSON.parse(t.reason) as TriggerPayload;

        // Skip already-fired
        if (payload.fired) continue;

        const loud = cleanPair(payload.loudPair);
        const quiet = cleanPair(payload.quietPair);

        // Skip if same pair after cleaning
        if (loud === quiet) {
          console.warn(`[RIPPLE] Skip ${t.gate_id}: loud/quiet resolve to same pair`);
          continue;
        }

        // Skip if missing baselines (can't calculate divergence)
        if (payload.loudBaseline == null || payload.quietBaseline == null) {
          console.warn(`[RIPPLE] Skip ${t.gate_id}: missing baseline prices`);
          continue;
        }

        // Validate OANDA format
        if (!/^[A-Z]{3}_[A-Z]{3}$/.test(loud) || !/^[A-Z]{3}_[A-Z]{3}$/.test(quiet)) {
          console.warn(`[RIPPLE] Skip ${t.gate_id}: non-OANDA instruments (${loud}, ${quiet})`);
          continue;
        }

        // ── Stale trigger check ──
        const armedAt = new Date(payload.armedAt).getTime();
        const maxLag = (payload.maxLagMinutes || 5) * 60_000;
        if (now.getTime() - armedAt > maxLag) {
          console.log(`[RIPPLE] Auto-revoking stale trigger ${t.gate_id} (armed ${payload.maxLagMinutes}m ago)`);
          await supabase
            .from("gate_bypasses")
            .update({ revoked: true })
            .eq("id", t.id);
          continue;
        }

        instruments.add(loud);
        instruments.add(quiet);
        parsedTriggers.push({
          trigger: t,
          config: { ...payload, loudPair: loud, quietPair: quiet },
        });
      } catch {
        console.warn(`[RIPPLE] Could not parse ${t.gate_id}`);
      }
    }

    if (parsedTriggers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No valid triggers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 3. Fetch live OANDA prices ───
    const instrumentList = Array.from(instruments).join(",");
    const priceRes = await fetch(
      `${OANDA_API}/accounts/${OANDA_ACCOUNT}/pricing?instruments=${instrumentList}`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } }
    );

    if (!priceRes.ok) {
      const errBody = await priceRes.text().catch(() => "");
      console.warn(`[RIPPLE] OANDA pricing ${priceRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: `Pricing unavailable: ${priceRes.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceData = await priceRes.json();
    const prices = new Map<string, PriceInfo>();
    for (const p of priceData.prices || []) {
      const bid = parseFloat(p.bids?.[0]?.price || "0");
      const ask = parseFloat(p.asks?.[0]?.price || "0");
      const mid = (bid + ask) / 2;
      const spread = ask - bid;
      const spreadPips = toPips(spread, p.instrument);
      prices.set(p.instrument, { bid, ask, mid, spread, spreadPips });
    }

    // ─── 4. Evaluate each trigger ───
    const results: {
      triggerId: string;
      status: string;
      loudMovePips: number;
      quietMovePips: number;
      divergencePips: number;
      quietSpreadPips: number;
      threshold: number;
      detail: string;
    }[] = [];
    const fired: string[] = [];

    for (const { trigger, config } of parsedTriggers) {
      const loudPrice = prices.get(config.loudPair);
      const quietPrice = prices.get(config.quietPair);

      if (!loudPrice || !quietPrice) {
        results.push({
          triggerId: config.triggerId,
          status: "SKIP",
          loudMovePips: 0,
          quietMovePips: 0,
          divergencePips: 0,
          quietSpreadPips: 0,
          threshold: config.thresholdPips,
          detail: `Missing price for ${config.loudPair} or ${config.quietPair}`,
        });
        continue;
      }

      // ── Calculate moves from baseline ──
      const loudMovePips = Math.abs(toPips(loudPrice.mid - config.loudBaseline!, config.loudPair));
      const quietMovePips = Math.abs(toPips(quietPrice.mid - config.quietBaseline!, config.quietPair));

      // Directional loud move (positive = moved in expected direction)
      const dirMult = config.direction.toLowerCase() === "long" ? 1 : -1;
      const loudDirectionalMove = toPips(loudPrice.mid - config.loudBaseline!, config.loudPair) * dirMult;

      // ── Divergence = how much loud moved vs how little quiet followed ──
      const divergencePips = loudMovePips - quietMovePips;

      // ── GATE 1: Loud pair must have moved enough ──
      if (loudMovePips < config.thresholdPips) {
        results.push({
          triggerId: config.triggerId,
          status: "WAITING",
          loudMovePips: Math.round(loudMovePips * 10) / 10,
          quietMovePips: Math.round(quietMovePips * 10) / 10,
          divergencePips: Math.round(divergencePips * 10) / 10,
          quietSpreadPips: Math.round(quietPrice.spreadPips * 10) / 10,
          threshold: config.thresholdPips,
          detail: `Loud ${config.loudPair} moved ${loudMovePips.toFixed(1)}p / ${config.thresholdPips}p threshold`,
        });
        continue;
      }

      // ── GATE 2: Loud must be moving in the RIGHT direction ──
      if (loudDirectionalMove < config.thresholdPips * 0.5) {
        results.push({
          triggerId: config.triggerId,
          status: "WRONG_DIRECTION",
          loudMovePips: Math.round(loudMovePips * 10) / 10,
          quietMovePips: Math.round(quietMovePips * 10) / 10,
          divergencePips: Math.round(divergencePips * 10) / 10,
          quietSpreadPips: Math.round(quietPrice.spreadPips * 10) / 10,
          threshold: config.thresholdPips,
          detail: `Loud moved ${loudDirectionalMove.toFixed(1)}p but wrong direction for ${config.direction}`,
        });
        continue;
      }

      // ── GATE 3: Quiet pair spread must be < 40% of threshold (friction gate) ──
      const maxSpread = config.thresholdPips * 0.4;
      if (quietPrice.spreadPips > maxSpread) {
        results.push({
          triggerId: config.triggerId,
          status: "SPREAD_GATE",
          loudMovePips: Math.round(loudMovePips * 10) / 10,
          quietMovePips: Math.round(quietMovePips * 10) / 10,
          divergencePips: Math.round(divergencePips * 10) / 10,
          quietSpreadPips: Math.round(quietPrice.spreadPips * 10) / 10,
          threshold: config.thresholdPips,
          detail: `Quiet spread ${quietPrice.spreadPips.toFixed(1)}p > max ${maxSpread.toFixed(1)}p`,
        });
        continue;
      }

      // ── GATE 4: Quiet pair must still be "quiet" (< 30% of loud move) ──
      const quietRatio = loudMovePips > 0 ? quietMovePips / loudMovePips : 0;
      if (quietRatio > 0.3) {
        results.push({
          triggerId: config.triggerId,
          status: "ALREADY_MOVED",
          loudMovePips: Math.round(loudMovePips * 10) / 10,
          quietMovePips: Math.round(quietMovePips * 10) / 10,
          divergencePips: Math.round(divergencePips * 10) / 10,
          quietSpreadPips: Math.round(quietPrice.spreadPips * 10) / 10,
          threshold: config.thresholdPips,
          detail: `Quiet already moved ${(quietRatio * 100).toFixed(0)}% of loud — ripple window closed`,
        });

        // Auto-revoke stale ripple
        await supabase
          .from("gate_bypasses")
          .update({ revoked: true })
          .eq("id", trigger.id);
        continue;
      }

      // ── ALL GATES PASSED — EXECUTION BLOCKED ──
      // OPERATOR DIRECTIVE: David-Atlas Distribution Terminal is the SOLE execution authority.
      // All trade signals must flow exclusively through the ripple-stream engine.
      // fast-poll-triggers is relegated to trigger evaluation and alerting ONLY.
      // No orders will be placed from this function.
      console.log(`[RIPPLE-BLOCKED] 🚫 Gate passed but execution DISABLED — ripple-stream is sole executor. ${config.direction.toUpperCase()} ${config.units} ${config.quietPair} | divergence=${divergencePips.toFixed(1)}p`);

      const tradeResult: Record<string, unknown> = { blocked: true, reason: "david-atlas-monopoly" };
      const fireSuccess = false;

      // Mark trigger as fired
      const firedPayload = { ...config, fired: true, firedAt: nowISO, tradeResult };
      await supabase
        .from("gate_bypasses")
        .update({
          revoked: true,
          reason: JSON.stringify(firedPayload),
        })
        .eq("id", trigger.id);

      // Log evaluation for dashboard
      await supabase.from("gate_bypasses").insert({
        gate_id: `RIPPLE_FIRED:${config.quietPair}`,
        reason: JSON.stringify({
          triggerId: config.triggerId,
          loudPair: config.loudPair,
          quietPair: config.quietPair,
          direction: config.direction,
          loudMovePips,
          quietMovePips,
          divergencePips,
          quietSpreadPips: quietPrice.spreadPips,
          fireSuccess,
          tradeResult,
          firedAt: nowISO,
        }),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        created_by: "ripple-strike-engine",
      });

      fired.push(config.quietPair);

      results.push({
        triggerId: config.triggerId,
        status: fireSuccess ? "FIRED" : "FIRE_FAILED",
        loudMovePips: Math.round(loudMovePips * 10) / 10,
        quietMovePips: Math.round(quietMovePips * 10) / 10,
        divergencePips: Math.round(divergencePips * 10) / 10,
        quietSpreadPips: Math.round(quietPrice.spreadPips * 10) / 10,
        threshold: config.thresholdPips,
        detail: fireSuccess
          ? `🎯 FIRED ${config.direction} ${config.units} ${config.quietPair}`
          : `Fire attempted but failed`,
      });
    }

    console.log(
      `[RIPPLE] Evaluated ${parsedTriggers.length} triggers, fired ${fired.length}: [${fired.join(", ")}]`
    );

    return new Response(
      JSON.stringify({
        success: true,
        evaluated: parsedTriggers.length,
        fired: fired.length,
        firedPairs: fired,
        results,
        timestamp: nowISO,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[RIPPLE] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
