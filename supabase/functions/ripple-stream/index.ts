// Ripple Stream Engine v2 — Predictive Liquidity Capture
// Three concurrent sub-second strategies on the OANDA tick stream:
//
// 1. RIPPLE TRIGGERS (existing) — Lead-Lag correlation divergence trades
// 2. VELOCITY GATING — 5+ same-direction ticks in 250ms = impulse fire
// 3. SNAP-BACK SNIPER — Detects stop-hunt exhaustion ticks for contrarian entry
//
// Plus: MICRO-SLIPPAGE AUDITOR — Real-time fill audit, auto-switches to
// PREDATORY_LIMIT if slippage > 0.2 pips on any pair.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";
const OANDA_STREAM = "https://stream-fxtrade.oanda.com/v3";
const MAX_STREAM_SECONDS = 110;

// ─── Strategy Constants ──────────────────────────────────
const VELOCITY_WINDOW_MS = 250;
const VELOCITY_TICK_THRESHOLD = 5;
const VELOCITY_COOLDOWN_MS = 2000; // prevent rapid re-fires on same pair
const SLIPPAGE_THRESHOLD_PIPS = 0.2;
const SNAPBACK_VOLUME_WINDOW = 15; // ticks to track sell/buy pressure
const SNAPBACK_EXHAUSTION_RATIO = 0.7; // 70% of window must be directional then reverse
const SNAPBACK_MIN_SPIKE_PIPS = 3; // minimum move to qualify as stop-hunt

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

// ─── Velocity Tracker per instrument ─────────────────────
interface VelocityTracker {
  ticks: { ts: number; mid: number; direction: 1 | -1 }[];
  lastFireTs: number;
}

// ─── Snap-Back Tracker per instrument ────────────────────
interface SnapBackTracker {
  recentTicks: { ts: number; mid: number; delta: number }[];
  lastMid: number | null;
  huntDetected: boolean;
  huntDirection: 'down' | 'up' | null; // direction of the hunt
  huntPeakPrice: number | null;
  huntStartPrice: number | null;
  exhaustionFired: boolean;
  lastFireTs: number;
}

// ─── Slippage Auditor state ──────────────────────────────
interface SlippageRecord {
  totalSlippage: number;
  fills: number;
  switchedToLimit: boolean;
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

    // ─── 2. Fetch velocity-enabled pairs from sovereign_memory ───
    const { data: velocityConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "velocity_gating_config")
      .maybeSingle();

    const velocityPairs: string[] = (velocityConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
      "EUR_JPY", "GBP_JPY", "EUR_GBP", "NZD_USD",
    ];
    const velocityUnits: number = (velocityConfig?.payload as any)?.units || 500;
    const velocitySlPips: number = (velocityConfig?.payload as any)?.slPips || 8;
    const velocityTpPips: number = (velocityConfig?.payload as any)?.tpPips || 15;

    // ─── 3. Fetch snap-back config ───
    const { data: snapbackConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "snapback_sniper_config")
      .maybeSingle();

    const snapbackPairs: string[] = (snapbackConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "GBP_JPY", "AUD_USD",
    ];
    const snapbackUnits: number = (snapbackConfig?.payload as any)?.units || 500;
    const snapbackSlPips: number = (snapbackConfig?.payload as any)?.slPips || 6;
    const snapbackTpPips: number = (snapbackConfig?.payload as any)?.tpPips || 12;

    // ─── 4. Parse triggers ───
    const cleanPair = (p: string) => p.replace(/^[A-Z]+:/, "");
    const instruments = new Set<string>();
    const liveTriggers: LiveTrigger[] = [];

    for (const t of (triggers || [])) {
      try {
        const payload = JSON.parse(t.reason) as TriggerPayload;
        if (payload.fired) continue;

        const loud = cleanPair(payload.loudPair);
        const quiet = cleanPair(payload.quietPair);
        if (loud === quiet) continue;
        if (payload.loudBaseline == null || payload.quietBaseline == null) continue;
        if (!/^[A-Z]{3}_[A-Z]{3}$/.test(loud) || !/^[A-Z]{3}_[A-Z]{3}$/.test(quiet)) continue;

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
      } catch { /* skip unparseable */ }
    }

    // Add velocity and snapback instruments
    for (const p of velocityPairs) instruments.add(p);
    for (const p of snapbackPairs) instruments.add(p);

    if (instruments.size === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No instruments to stream" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[STREAM-v2] 🎯 Opening stream: ${liveTriggers.length} ripple triggers, ${velocityPairs.length} velocity pairs, ${snapbackPairs.length} snapback pairs on ${instruments.size} instruments`);

    // ─── 5. Open OANDA streaming connection ───
    const instrumentList = Array.from(instruments).join(",");
    const streamRes = await fetch(
      `${OANDA_STREAM}/accounts/${OANDA_ACCOUNT}/pricing/stream?instruments=${instrumentList}&snapshot=true`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } },
    );

    if (!streamRes.ok || !streamRes.body) {
      const errBody = await streamRes.text().catch(() => "");
      console.error(`[STREAM-v2] Stream open failed ${streamRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `Stream failed: ${streamRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 6. Initialize trackers ───
    const prices = new Map<string, { bid: number; ask: number; mid: number; spread: number; spreadPips: number }>();
    const velocityTrackers = new Map<string, VelocityTracker>();
    const snapbackTrackers = new Map<string, SnapBackTracker>();
    const slippageAudit = new Map<string, SlippageRecord>();
    const firedTriggers: string[] = [];
    const velocityFires: string[] = [];
    const snapbackFires: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let evalCount = 0;

    // Init velocity trackers
    for (const p of velocityPairs) {
      velocityTrackers.set(p, { ticks: [], lastFireTs: 0 });
    }
    // Init snapback trackers
    for (const p of snapbackPairs) {
      snapbackTrackers.set(p, {
        recentTicks: [], lastMid: null, huntDetected: false,
        huntDirection: null, huntPeakPrice: null, huntStartPrice: null,
        exhaustionFired: false, lastFireTs: 0,
      });
    }

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

    // ─── Helper: Execute order ───
    async function executeOrder(
      pair: string, direction: string, units: number,
      slPips: number, tpPips: number, engine: string,
      metadata: Record<string, unknown>, currentPrice: { mid: number; spreadPips: number },
      orderType: "MARKET" | "LIMIT" = "MARKET",
    ): Promise<{ success: boolean; tradeId?: string; fillPrice?: number; slippage?: number }> {
      if (LIVE_ENABLED !== "true") {
        console.log(`[STREAM-v2] 🔇 ${engine} would fire ${direction} ${units} ${pair} — LIVE DISABLED`);
        return { success: false };
      }

      // Check slippage audit — auto-switch to LIMIT if flagged
      const audit = slippageAudit.get(pair);
      if (audit?.switchedToLimit) {
        orderType = "LIMIT";
        console.log(`[STREAM-v2] ⚡ ${pair} auto-switched to PREDATORY_LIMIT (slippage audit)`);
      }

      const dirUnits = direction === "long" ? units : -units;
      const slDistance = fromPips(slPips, pair);
      const tpDistance = fromPips(tpPips, pair);

      const orderBody: Record<string, unknown> = {
        order: {
          type: orderType,
          instrument: pair,
          units: String(dirUnits),
          timeInForce: orderType === "MARKET" ? "FOK" : "IOC",
          stopLossOnFill: { distance: slDistance.toFixed(5), timeInForce: "GTC" },
          takeProfitOnFill: { distance: tpDistance.toFixed(5), timeInForce: "GTC" },
          ...(orderType === "LIMIT" ? { price: currentPrice.mid.toFixed(5) } : {}),
        },
      };

      try {
        const orderRes = await fetch(
          `${OANDA_API}/accounts/${OANDA_ACCOUNT}/orders`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(orderBody),
          },
        );

        const orderData = await orderRes.json();
        const fill = orderData.orderFillTransaction;

        if (fill) {
          const fillPrice = parseFloat(fill.price || "0");
          const tradeId = fill.tradeOpened?.tradeID || fill.id;
          const slippagePips = Math.abs(toPips(fillPrice - currentPrice.mid, pair));

          // ─── Micro-Slippage Audit ───
          if (!slippageAudit.has(pair)) {
            slippageAudit.set(pair, { totalSlippage: 0, fills: 0, switchedToLimit: false });
          }
          const sa = slippageAudit.get(pair)!;
          sa.totalSlippage += slippagePips;
          sa.fills++;
          const avgSlippage = sa.totalSlippage / sa.fills;

          if (slippagePips > SLIPPAGE_THRESHOLD_PIPS && !sa.switchedToLimit) {
            sa.switchedToLimit = true;
            console.log(`[STREAM-v2] 🔴 SLIPPAGE AUDIT: ${pair} slippage ${slippagePips.toFixed(2)}p > ${SLIPPAGE_THRESHOLD_PIPS}p — switching to PREDATORY_LIMIT`);

            // Persist the switch via gate_bypasses for Floor Manager visibility
            await supabase.from("gate_bypasses").insert({
              gate_id: `PREDATORY_LIMIT_SWITCH:${pair}`,
              reason: JSON.stringify({
                pair,
                triggerSlippage: slippagePips,
                avgSlippage,
                fills: sa.fills,
                threshold: SLIPPAGE_THRESHOLD_PIPS,
                switchedAt: new Date().toISOString(),
                engine: "slippage-auditor-v1",
              }),
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
              created_by: "slippage-auditor",
            });
          }

          // Record trade
          if (adminRole) {
            await supabase.from("oanda_orders").insert({
              user_id: adminRole.user_id,
              signal_id: `${engine}-${pair}-${Date.now()}`,
              currency_pair: pair,
              direction: direction.toLowerCase(),
              units,
              entry_price: fillPrice,
              oanda_order_id: fill.id,
              oanda_trade_id: tradeId,
              status: "filled",
              environment: "live",
              direction_engine: engine,
              sovereign_override_tag: `${engine}:${pair}`,
              confidence_score: (metadata.confidence as number) || 0.5,
              governance_payload: { ...metadata, slippagePips, avgSlippage, orderType },
              requested_price: currentPrice.mid,
              slippage_pips: slippagePips,
              spread_at_entry: currentPrice.spreadPips,
            });
          }

          console.log(`[STREAM-v2] ✅ ${engine} FILLED: Trade ${tradeId} @ ${fillPrice} | ${direction} ${units} ${pair} | slip ${slippagePips.toFixed(2)}p | type ${orderType}`);
          return { success: true, tradeId, fillPrice, slippage: slippagePips };
        } else {
          const rejectReason = orderData.orderRejectTransaction?.rejectReason ||
            orderData.orderCancelTransaction?.reason || "Unknown";
          console.warn(`[STREAM-v2] ❌ ${engine} REJECTED: ${rejectReason}`);
          return { success: false };
        }
      } catch (err) {
        console.error(`[STREAM-v2] ${engine} execution error:`, err);
        return { success: false };
      }
    }

    // ─── 7. Process tick stream ───
    try {
      while (true) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > MAX_STREAM_SECONDS) {
          console.log(`[STREAM-v2] ⏱ Graceful shutdown after ${elapsed.toFixed(0)}s, ${tickCount} ticks, ${evalCount} evals`);
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
            if (tick.type === "HEARTBEAT") continue;
            if (tick.type !== "PRICE") continue;

            tickCount++;
            const tickTs = Date.now();
            const instrument = tick.instrument;
            const bid = parseFloat(tick.bids?.[0]?.price || "0");
            const ask = parseFloat(tick.asks?.[0]?.price || "0");
            const mid = (bid + ask) / 2;
            const spread = ask - bid;
            const spreadPips = toPips(spread, instrument);
            const prevPrice = prices.get(instrument);
            prices.set(instrument, { bid, ask, mid, spread, spreadPips });

            // ═══════════════════════════════════════════
            // STRATEGY 1: RIPPLE TRIGGERS (existing)
            // ═══════════════════════════════════════════
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
                trigger.config.fired = true;
                await supabase.from("gate_bypasses").update({ revoked: true }).eq("id", trigger.id);
                console.log(`[STREAM-v2] Quiet ${config.quietPair} already moved ${(quietRatio * 100).toFixed(0)}% — revoked`);
                continue;
              }

              // ═══ ALL GATES PASSED — INSTANT FIRE ═══
              const divergencePips = loudMovePips - quietMovePips;
              console.log(`[STREAM-v2] 🎯 RIPPLE-FIRE: ${config.direction.toUpperCase()} ${config.units} ${config.quietPair} | Loud ${loudMovePips.toFixed(1)}p, Quiet lag ${(quietRatio * 100).toFixed(0)}% | Tick #${tickCount}`);

              const result = await executeOrder(
                config.quietPair, config.direction, config.units,
                config.slPips, config.tpPips, "ripple-stream",
                {
                  triggerId: config.triggerId, loudPair: config.loudPair,
                  loudMovePips, quietMovePips, divergencePips,
                  quietSpreadPips: quietPrice.spreadPips, quietRatio,
                  tickNumber: tickCount, streamLatencyMs: Date.now() - startTime,
                  confidence: Math.min(1, divergencePips / config.thresholdPips),
                  engine: "ripple-stream-v2",
                },
                quietPrice,
              );

              // Mark fired
              trigger.config.fired = true;
              const firedPayload = {
                ...config, fired: true, firedAt: new Date().toISOString(),
                tradeResult: result, engine: "ripple-stream-v2",
              };
              await supabase.from("gate_bypasses")
                .update({ revoked: true, reason: JSON.stringify(firedPayload) })
                .eq("id", trigger.id);

              // Audit log
              await supabase.from("gate_bypasses").insert({
                gate_id: `RIPPLE_STREAM_FIRED:${config.quietPair}`,
                reason: JSON.stringify({
                  triggerId: config.triggerId, loudPair: config.loudPair,
                  quietPair: config.quietPair, direction: config.direction,
                  loudMovePips, quietMovePips, divergencePips,
                  fireSuccess: result.success, tickNumber: tickCount,
                  streamLatencyMs: Date.now() - startTime,
                }),
                expires_at: new Date(Date.now() + 3600_000).toISOString(),
                created_by: "ripple-stream-engine",
              });

              firedTriggers.push(config.quietPair);
            }

            // ═══════════════════════════════════════════
            // STRATEGY 2: VELOCITY GATING
            // 5+ ticks in same direction within 250ms = impulse fire
            // ═══════════════════════════════════════════
            const vt = velocityTrackers.get(instrument);
            if (vt && prevPrice) {
              const delta = mid - prevPrice.mid;
              if (Math.abs(delta) > 0) {
                const dir: 1 | -1 = delta > 0 ? 1 : -1;
                vt.ticks.push({ ts: tickTs, mid, direction: dir });

                // Prune ticks outside window
                const cutoff = tickTs - VELOCITY_WINDOW_MS;
                vt.ticks = vt.ticks.filter(t => t.ts >= cutoff);

                // Check velocity spike
                if (vt.ticks.length >= VELOCITY_TICK_THRESHOLD && (tickTs - vt.lastFireTs) > VELOCITY_COOLDOWN_MS) {
                  // All ticks must be same direction
                  const firstDir = vt.ticks[0].direction;
                  const allSameDir = vt.ticks.every(t => t.direction === firstDir);

                  if (allSameDir) {
                    const direction = firstDir === 1 ? "long" : "short";
                    const movePips = Math.abs(toPips(vt.ticks[vt.ticks.length - 1].mid - vt.ticks[0].mid, instrument));

                    // Only fire if movement is meaningful (> 1 pip)
                    if (movePips >= 1.0) {
                      vt.lastFireTs = tickTs;

                      console.log(`[STREAM-v2] ⚡ VELOCITY SPIKE: ${instrument} ${vt.ticks.length} ticks ${direction} in ${VELOCITY_WINDOW_MS}ms | ${movePips.toFixed(1)}p impulse`);

                      const result = await executeOrder(
                        instrument, direction, velocityUnits,
                        velocitySlPips, velocityTpPips, "velocity-gating",
                        {
                          ticksInWindow: vt.ticks.length,
                          windowMs: VELOCITY_WINDOW_MS,
                          movePips,
                          tickNumber: tickCount,
                          streamLatencyMs: Date.now() - startTime,
                          confidence: Math.min(1, movePips / 3),
                          engine: "velocity-gating-v1",
                        },
                        { mid, spreadPips },
                      );

                      if (result.success) {
                        velocityFires.push(instrument);

                        // Audit log
                        await supabase.from("gate_bypasses").insert({
                          gate_id: `VELOCITY_FIRE:${instrument}`,
                          reason: JSON.stringify({
                            pair: instrument, direction, movePips,
                            ticksInWindow: vt.ticks.length, windowMs: VELOCITY_WINDOW_MS,
                            fillPrice: result.fillPrice, slippage: result.slippage,
                            tickNumber: tickCount,
                          }),
                          expires_at: new Date(Date.now() + 3600_000).toISOString(),
                          created_by: "velocity-gating-engine",
                        });
                      }

                      // Clear ticks after fire
                      vt.ticks = [];
                    }
                  }
                }
              }
            }

            // ═══════════════════════════════════════════
            // STRATEGY 3: SNAP-BACK SNIPER
            // Detect stop-hunt exhaustion → contrarian entry at reversal
            // ═══════════════════════════════════════════
            const sb = snapbackTrackers.get(instrument);
            if (sb && prevPrice) {
              const delta = mid - prevPrice.mid;
              const deltaPips = toPips(delta, instrument);
              sb.recentTicks.push({ ts: tickTs, mid, delta: deltaPips });

              // Keep only last N ticks
              if (sb.recentTicks.length > SNAPBACK_VOLUME_WINDOW) {
                sb.recentTicks.shift();
              }

              if (sb.recentTicks.length >= SNAPBACK_VOLUME_WINDOW && (tickTs - sb.lastFireTs) > 5000) {
                const ticks = sb.recentTicks;

                // Count directional pressure
                const downTicks = ticks.filter(t => t.delta < 0).length;
                const upTicks = ticks.filter(t => t.delta > 0).length;
                const totalMovePips = Math.abs(ticks[ticks.length - 1].mid - ticks[0].mid) * pipMultiplier(instrument);

                // Detect stop-hunt flush: majority of window was one direction, then reversal at end
                const lastFewTicks = ticks.slice(-3);
                const mainWindowTicks = ticks.slice(0, -3);

                if (mainWindowTicks.length >= 5) {
                  const mainDownRatio = mainWindowTicks.filter(t => t.delta < 0).length / mainWindowTicks.length;
                  const mainUpRatio = mainWindowTicks.filter(t => t.delta > 0).length / mainWindowTicks.length;
                  const lastFewDirection = lastFewTicks.reduce((sum, t) => sum + t.delta, 0);

                  // CASE 1: Down-flush then snap-back up
                  if (mainDownRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection > 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;

                    console.log(`[STREAM-v2] 🎯 SNAP-BACK: ${instrument} down-flush exhausted (${(mainDownRatio * 100).toFixed(0)}% down) → reversal detected | ${totalMovePips.toFixed(1)}p spike`);

                    const result = await executeOrder(
                      instrument, "long", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      {
                        huntDirection: "down",
                        exhaustionRatio: mainDownRatio,
                        spikePips: totalMovePips,
                        windowTicks: SNAPBACK_VOLUME_WINDOW,
                        tickNumber: tickCount,
                        streamLatencyMs: Date.now() - startTime,
                        confidence: Math.min(1, totalMovePips / 5),
                        engine: "snapback-sniper-v1",
                      },
                      { mid, spreadPips },
                    );

                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({
                          pair: instrument, direction: "long",
                          huntDirection: "down", exhaustionRatio: mainDownRatio,
                          spikePips: totalMovePips, fillPrice: result.fillPrice,
                          slippage: result.slippage, tickNumber: tickCount,
                        }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "snapback-sniper-engine",
                      });
                    }

                    sb.recentTicks = [];
                  }

                  // CASE 2: Up-flush then snap-back down
                  if (mainUpRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection < 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;

                    console.log(`[STREAM-v2] 🎯 SNAP-BACK: ${instrument} up-flush exhausted (${(mainUpRatio * 100).toFixed(0)}% up) → reversal detected | ${totalMovePips.toFixed(1)}p spike`);

                    const result = await executeOrder(
                      instrument, "short", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      {
                        huntDirection: "up",
                        exhaustionRatio: mainUpRatio,
                        spikePips: totalMovePips,
                        windowTicks: SNAPBACK_VOLUME_WINDOW,
                        tickNumber: tickCount,
                        streamLatencyMs: Date.now() - startTime,
                        confidence: Math.min(1, totalMovePips / 5),
                        engine: "snapback-sniper-v1",
                      },
                      { mid, spreadPips },
                    );

                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({
                          pair: instrument, direction: "short",
                          huntDirection: "up", exhaustionRatio: mainUpRatio,
                          spikePips: totalMovePips, fillPrice: result.fillPrice,
                          slippage: result.slippage, tickNumber: tickCount,
                        }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "snapback-sniper-engine",
                      });
                    }

                    sb.recentTicks = [];
                  }
                }
              }

              sb.lastMid = mid;
            }
          } catch { /* skip malformed tick */ }
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }

    // ─── 8. Build slippage audit summary ───
    const slippageSummary: Record<string, { avgSlippage: number; fills: number; switchedToLimit: boolean }> = {};
    for (const [pair, sa] of slippageAudit.entries()) {
      slippageSummary[pair] = {
        avgSlippage: sa.fills > 0 ? Math.round((sa.totalSlippage / sa.fills) * 100) / 100 : 0,
        fills: sa.fills,
        switchedToLimit: sa.switchedToLimit,
      };
    }

    const totalMs = Date.now() - startTime;
    console.log(`[STREAM-v2] 📊 Session: ${totalMs}ms, ${tickCount} ticks, ${evalCount} evals | Ripple: ${firedTriggers.length} | Velocity: ${velocityFires.length} | Snap-Back: ${snapbackFires.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v2-predictive-liquidity-capture",
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        evaluations: evalCount,
        ripple: { fired: firedTriggers.length, pairs: firedTriggers, monitored: liveTriggers.length },
        velocity: { fired: velocityFires.length, pairs: velocityFires, monitored: velocityPairs.length },
        snapback: { fired: snapbackFires.length, pairs: snapbackFires, monitored: snapbackPairs.length },
        slippageAudit: slippageSummary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[STREAM-v2] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
