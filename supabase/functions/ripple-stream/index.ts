// Ripple Stream Engine — Sub-Second Tick-Level Trigger Evaluator
// Connects to OANDA's streaming pricing API and evaluates armed correlation triggers
// on EVERY TICK (~100-500ms) for near-instant ripple trade execution.
//
// Architecture:
// - Invoked by pg_cron every 2 minutes (function stays alive ~110s processing stream)
// - Reads armed CORRELATION_TRIGGER records from gate_bypasses
// - Opens OANDA streaming connection for relevant instruments
// - On each tick: re-evaluates all 5 gates and fires trades instantly when breached
// - Self-terminates gracefully before edge function timeout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";
const OANDA_STREAM = "https://stream-fxtrade.oanda.com/v3";
const MAX_STREAM_SECONDS = 110; // graceful shutdown before 150s edge function limit

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

interface LiveTrigger {
  id: string;
  gate_id: string;
  config: TriggerPayload;
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // ─── 1. Fetch armed triggers ───
    const { data: triggers, error: trigErr } = await supabase
      .from("gate_bypasses")
      .select("*")
      .like("gate_id", "CORRELATION_TRIGGER:%")
      .eq("revoked", false)
      .gte("expires_at", nowISO);

    if (trigErr) {
      console.error("[STREAM] Trigger fetch error:", trigErr);
      return new Response(JSON.stringify({ error: trigErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!triggers || triggers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No armed triggers — stream idle", evaluated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. Parse triggers ───
    const cleanPair = (p: string) => p.replace(/^[A-Z]+:/, "");
    const instruments = new Set<string>();
    const liveTriggers: LiveTrigger[] = [];

    for (const t of triggers) {
      try {
        const payload = JSON.parse(t.reason) as TriggerPayload;
        if (payload.fired) continue;

        const loud = cleanPair(payload.loudPair);
        const quiet = cleanPair(payload.quietPair);
        if (loud === quiet) continue;
        if (payload.loudBaseline == null || payload.quietBaseline == null) continue;
        if (!/^[A-Z]{3}_[A-Z]{3}$/.test(loud) || !/^[A-Z]{3}_[A-Z]{3}$/.test(quiet)) continue;

        // Stale check
        const armedAt = new Date(payload.armedAt).getTime();
        const maxLag = (payload.maxLagMinutes || 5) * 60_000;
        if (now.getTime() - armedAt > maxLag) {
          console.log(`[STREAM] Auto-revoking stale trigger ${t.gate_id}`);
          await supabase.from("gate_bypasses").update({ revoked: true }).eq("id", t.id);
          continue;
        }

        instruments.add(loud);
        instruments.add(quiet);
        liveTriggers.push({
          id: t.id,
          gate_id: t.gate_id,
          config: { ...payload, loudPair: loud, quietPair: quiet },
        });
      } catch {
        // skip unparseable
      }
    }

    if (liveTriggers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No valid triggers for stream" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[STREAM] 🎯 Opening stream for ${liveTriggers.length} triggers on ${instruments.size} instruments`);

    // ─── 3. Open OANDA streaming connection ───
    const instrumentList = Array.from(instruments).join(",");
    const streamRes = await fetch(
      `${OANDA_STREAM}/accounts/${OANDA_ACCOUNT}/pricing/stream?instruments=${instrumentList}&snapshot=true`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } }
    );

    if (!streamRes.ok || !streamRes.body) {
      const errBody = await streamRes.text().catch(() => "");
      console.error(`[STREAM] Stream open failed ${streamRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `Stream failed: ${streamRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 4. Process tick stream ───
    const prices = new Map<string, { bid: number; ask: number; mid: number; spread: number; spreadPips: number }>();
    const firedTriggers: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let evalCount = 0;

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Get admin user for order records
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    try {
      while (true) {
        // Graceful timeout
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > MAX_STREAM_SECONDS) {
          console.log(`[STREAM] ⏱ Graceful shutdown after ${elapsed.toFixed(0)}s, ${tickCount} ticks, ${evalCount} evals`);
          break;
        }

        // Check if all triggers fired
        if (liveTriggers.every(t => t.config.fired)) {
          console.log("[STREAM] All triggers fired — closing stream");
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const tick = JSON.parse(trimmed);

            // Skip heartbeats
            if (tick.type === "HEARTBEAT") continue;
            if (tick.type !== "PRICE") continue;

            tickCount++;

            const instrument = tick.instrument;
            const bid = parseFloat(tick.bids?.[0]?.price || "0");
            const ask = parseFloat(tick.asks?.[0]?.price || "0");
            const mid = (bid + ask) / 2;
            const spread = ask - bid;
            const spreadPips = toPips(spread, instrument);
            prices.set(instrument, { bid, ask, mid, spread, spreadPips });

            // ─── Evaluate ALL triggers on this tick ───
            for (const trigger of liveTriggers) {
              if (trigger.config.fired) continue;

              const { config } = trigger;
              const loudPrice = prices.get(config.loudPair);
              const quietPrice = prices.get(config.quietPair);
              if (!loudPrice || !quietPrice) continue;

              evalCount++;

              // G1: Loud pair threshold
              const loudMovePips = Math.abs(toPips(loudPrice.mid - config.loudBaseline!, config.loudPair));
              if (loudMovePips < config.thresholdPips) continue;

              // G2: Direction check
              const dirMult = config.direction.toLowerCase() === "long" ? 1 : -1;
              const loudDirectional = toPips(loudPrice.mid - config.loudBaseline!, config.loudPair) * dirMult;
              if (loudDirectional < config.thresholdPips * 0.5) continue;

              // G3: Spread gate
              const maxSpread = config.thresholdPips * 0.4;
              if (quietPrice.spreadPips > maxSpread) continue;

              // G4: Quiet stillness
              const quietMovePips = Math.abs(toPips(quietPrice.mid - config.quietBaseline!, config.quietPair));
              const quietRatio = loudMovePips > 0 ? quietMovePips / loudMovePips : 0;
              if (quietRatio > 0.3) {
                // Quiet already moved — revoke trigger
                trigger.config.fired = true;
                await supabase.from("gate_bypasses").update({ revoked: true }).eq("id", trigger.id);
                console.log(`[STREAM] Quiet ${config.quietPair} already moved ${(quietRatio * 100).toFixed(0)}% — revoked`);
                continue;
              }

              // ═══ ALL GATES PASSED — INSTANT FIRE ═══
              const nowFire = new Date().toISOString();
              const divergencePips = loudMovePips - quietMovePips;
              console.log(`[STREAM] 🎯 TICK-FIRE: ${config.direction.toUpperCase()} ${config.units} ${config.quietPair} | Loud ${loudMovePips.toFixed(1)}p, Quiet lag ${(quietRatio * 100).toFixed(0)}% | Tick #${tickCount} @ ${(Date.now() - startTime)}ms`);

              let fireSuccess = false;
              let tradeResult: Record<string, unknown> = {};

              if (LIVE_ENABLED === "true") {
                try {
                  const units = config.direction.toLowerCase() === "long" ? config.units : -config.units;
                  const slDistance = fromPips(config.slPips, config.quietPair);
                  const tpDistance = fromPips(config.tpPips, config.quietPair);

                  const orderBody = {
                    order: {
                      type: "MARKET",
                      instrument: config.quietPair,
                      units: String(units),
                      timeInForce: "FOK",
                      stopLossOnFill: { distance: slDistance.toFixed(5), timeInForce: "GTC" },
                      takeProfitOnFill: { distance: tpDistance.toFixed(5), timeInForce: "GTC" },
                    },
                  };

                  const orderRes = await fetch(
                    `${OANDA_API}/accounts/${OANDA_ACCOUNT}/orders`,
                    {
                      method: "POST",
                      headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" },
                      body: JSON.stringify(orderBody),
                    }
                  );

                  const orderData = await orderRes.json();
                  tradeResult = orderData;
                  const fill = orderData.orderFillTransaction;

                  if (fill) {
                    fireSuccess = true;
                    const fillPrice = parseFloat(fill.price || "0");
                    const tradeId = fill.tradeOpened?.tradeID || fill.id;

                    if (adminRole) {
                      await supabase.from("oanda_orders").insert({
                        user_id: adminRole.user_id,
                        signal_id: `ripple-stream-${config.triggerId}-${Date.now()}`,
                        currency_pair: config.quietPair,
                        direction: config.direction.toLowerCase(),
                        units: config.units,
                        entry_price: fillPrice,
                        oanda_order_id: fill.id,
                        oanda_trade_id: tradeId,
                        status: "filled",
                        environment: "live",
                        direction_engine: "ripple-stream",
                        sovereign_override_tag: `ripple-stream:${config.triggerId}`,
                        confidence_score: Math.min(1, divergencePips / config.thresholdPips),
                        governance_payload: {
                          triggerId: config.triggerId,
                          loudPair: config.loudPair,
                          quietPair: config.quietPair,
                          loudBaseline: config.loudBaseline,
                          quietBaseline: config.quietBaseline,
                          loudMidAtFire: loudPrice.mid,
                          quietMidAtFire: quietPrice.mid,
                          loudMovePips,
                          quietMovePips,
                          divergencePips,
                          quietSpreadPips: quietPrice.spreadPips,
                          quietRatio,
                          tickNumber: tickCount,
                          streamLatencyMs: Date.now() - startTime,
                          firedAt: nowFire,
                          engine: "ripple-stream-v1",
                        },
                        requested_price: quietPrice.mid,
                        slippage_pips: Math.abs(toPips(fillPrice - quietPrice.mid, config.quietPair)),
                        spread_at_entry: quietPrice.spreadPips,
                      });
                    }

                    console.log(`[STREAM] ✅ FILLED: Trade ${tradeId} @ ${fillPrice} | ${config.direction} ${config.units} ${config.quietPair} | ${(Date.now() - startTime)}ms into stream`);
                  } else {
                    const rejectReason = orderData.orderRejectTransaction?.rejectReason ||
                      orderData.orderCancelTransaction?.reason || "Unknown";
                    console.warn(`[STREAM] ❌ REJECTED: ${rejectReason}`);
                    tradeResult = { rejected: true, reason: rejectReason };
                  }
                } catch (execErr) {
                  console.error(`[STREAM] Execution error:`, execErr);
                  tradeResult = { error: (execErr as Error).message };
                }
              }

              // Mark fired
              trigger.config.fired = true;
              const firedPayload = { ...config, fired: true, firedAt: nowFire, tradeResult, engine: "ripple-stream" };
              await supabase.from("gate_bypasses")
                .update({ revoked: true, reason: JSON.stringify(firedPayload) })
                .eq("id", trigger.id);

              // Audit log
              await supabase.from("gate_bypasses").insert({
                gate_id: `RIPPLE_STREAM_FIRED:${config.quietPair}`,
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
                  tickNumber: tickCount,
                  streamLatencyMs: Date.now() - startTime,
                  firedAt: nowFire,
                }),
                expires_at: new Date(Date.now() + 3600_000).toISOString(),
                created_by: "ripple-stream-engine",
              });

              firedTriggers.push(config.quietPair);
            }
          } catch {
            // skip malformed tick
          }
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }

    const totalMs = Date.now() - startTime;
    console.log(`[STREAM] 📊 Session: ${totalMs}ms, ${tickCount} ticks, ${evalCount} evals, ${firedTriggers.length} fired`);

    return new Response(
      JSON.stringify({
        success: true,
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        evaluations: evalCount,
        fired: firedTriggers.length,
        firedPairs: firedTriggers,
        triggersMonitored: liveTriggers.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[STREAM] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
