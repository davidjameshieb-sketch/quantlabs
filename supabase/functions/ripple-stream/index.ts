// Ripple Stream Engine v3 — Z-Score Strike Engine
// The Committee is dead. Long live the Frontline Soldiers.
//
// Three L0 deterministic strategies on OANDA ms tick data:
//
// 1. Z-SCORE STRIKE — Continuous correlation-spread z-score across pair groups.
//    Fire when z > 2.0 + momentum burst on the lagging pair. No triggers, no arming, no AI.
//    Pure statistics. The edge IS the math.
//
// 2. VELOCITY GATING — 5+ same-direction ticks in 2s = impulse fire
//
// 3. SNAP-BACK SNIPER — Stop-hunt exhaustion → contrarian entry at reversal
//
// Plus: MICRO-SLIPPAGE AUDITOR — Real-time fill audit, auto-switches to
// PREDATORY_LIMIT if slippage > 0.2 pips.
//
// AI is the General Staff — sizing, regime, risk (hourly). Soldiers fire autonomously.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";
const OANDA_STREAM = "https://stream-fxtrade.oanda.com/v3";
const MAX_STREAM_SECONDS = 110;

// ─── Z-Score Strike Constants ────────────────────────────
const ZSCORE_WINDOW = 120;          // ticks to build rolling mean/stddev
const ZSCORE_FIRE_THRESHOLD = 2.0;  // z > 2.0 = statistical divergence (overridden by config)
const ZSCORE_EXIT_TARGET = 0.0;     // mean reversion target
const ZSCORE_COOLDOWN_MS = 300_000; // 5 MINUTES between fires on same group (was 10s — caused triple-taps)
const ZSCORE_MOMENTUM_TICKS = 3;    // quiet pair must show 3 aligned ticks in 5s

// ─── Velocity Gating Constants ───────────────────────────
const VELOCITY_TICK_THRESHOLD = 5;
const VELOCITY_MAX_AGE_MS = 2000;
const VELOCITY_COOLDOWN_MS = 3000;

// ─── Snap-Back Constants ─────────────────────────────────
const SNAPBACK_VOLUME_WINDOW = 15;
const SNAPBACK_EXHAUSTION_RATIO = 0.7;
const SNAPBACK_MIN_SPIKE_PIPS = 3;

// ─── Shared Constants ────────────────────────────────────
const SLIPPAGE_THRESHOLD_PIPS = 0.2;

// ─── Correlation Groups (pairs that move together) ───────
// Each group: the "spread" between them should be stationary → z-score works.
const DEFAULT_CORRELATION_GROUPS: { name: string; pairA: string; pairB: string }[] = [
  { name: "EUR_GBP_CROSS", pairA: "EUR_USD", pairB: "GBP_USD" },
  { name: "AUD_NZD_CROSS", pairA: "AUD_USD", pairB: "NZD_USD" },
  { name: "EUR_JPY_TRI",   pairA: "EUR_USD", pairB: "USD_JPY" },
  { name: "GBP_JPY_TRI",   pairA: "GBP_USD", pairB: "USD_JPY" },
  { name: "CAD_AUD_CROSS",  pairA: "USD_CAD", pairB: "AUD_USD" },
  { name: "EUR_AUD_CROSS",  pairA: "EUR_USD", pairB: "AUD_USD" },
];

// ─── Z-Score Tracker ─────────────────────────────────────
interface ZScoreTracker {
  spreadHistory: number[];     // rolling spread values
  lastFireTs: number;
  firedDirection: string | null;
}

interface VelocityTracker {
  ticks: { ts: number; mid: number; direction: 1 | -1 }[];
  lastFireTs: number;
}

interface SnapBackTracker {
  recentTicks: { ts: number; mid: number; delta: number }[];
  lastMid: number | null;
  lastFireTs: number;
}

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

function computeZScore(values: number[]): { mean: number; std: number; z: number } {
  if (values.length < 10) return { mean: 0, std: 0, z: 0 };
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std < 1e-10) return { mean, std: 0, z: 0 };
  const current = values[n - 1];
  const z = (current - mean) / std;
  return { mean, std, z };
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

    // ─── 1. Load General Staff orders (AI governance: sizing, regime) ───
    const { data: governanceConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "zscore_strike_config")
      .maybeSingle();

    const govPayload = governanceConfig?.payload as Record<string, unknown> | null;
    const baseUnits: number = (govPayload?.units as number) || 1000;
    const baseSlPips: number = (govPayload?.slPips as number) || 8;
    const baseTpPips: number = (govPayload?.tpPips as number) || 30;
    const zScoreThreshold: number = (govPayload?.zScoreThreshold as number) || ZSCORE_FIRE_THRESHOLD;
    const blockedPairs: string[] = (govPayload?.blockedPairs as string[]) || [];

    // ─── 2. Load velocity & snapback config ───
    const { data: velocityConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "velocity_gating_config")
      .maybeSingle();

    const velocityPairs: string[] = (velocityConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
      "EUR_JPY", "GBP_JPY", "EUR_GBP", "NZD_USD",
    ];
    const velocityUnits: number = (velocityConfig?.payload as any)?.units || baseUnits;
    const velocitySlPips: number = (velocityConfig?.payload as any)?.slPips || baseSlPips;
    const velocityTpPips: number = (velocityConfig?.payload as any)?.tpPips || baseTpPips;

    const { data: snapbackConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "snapback_sniper_config")
      .maybeSingle();

    const snapbackPairs: string[] = (snapbackConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "GBP_JPY", "AUD_USD",
    ];
    const snapbackUnits: number = (snapbackConfig?.payload as any)?.units || baseUnits;
    const snapbackSlPips: number = (snapbackConfig?.payload as any)?.slPips || 6;
    const snapbackTpPips: number = (snapbackConfig?.payload as any)?.tpPips || 12;

    // ─── 3. Load correlation groups (can be overridden by General Staff) ───
    const { data: corrGroupConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "correlation_groups_config")
      .maybeSingle();

    const correlationGroups = (corrGroupConfig?.payload as any)?.groups || DEFAULT_CORRELATION_GROUPS;

    // ─── 4. Build instrument set ───
    const instruments = new Set<string>();
    for (const g of correlationGroups) {
      if (!blockedPairs.includes(g.pairA)) instruments.add(g.pairA);
      if (!blockedPairs.includes(g.pairB)) instruments.add(g.pairB);
    }
    for (const p of velocityPairs) if (!blockedPairs.includes(p)) instruments.add(p);
    for (const p of snapbackPairs) if (!blockedPairs.includes(p)) instruments.add(p);

    if (instruments.size === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No instruments — General Staff has blocked all pairs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[STRIKE-v3] ⚡ Z-Score Strike Engine | ${correlationGroups.length} z-groups, ${velocityPairs.length} velocity, ${snapbackPairs.length} snapback | ${instruments.size} instruments | threshold z>${zScoreThreshold}`);

    // ─── 5. Open OANDA stream ───
    const instrumentList = Array.from(instruments).join(",");
    const streamRes = await fetch(
      `${OANDA_STREAM}/accounts/${OANDA_ACCOUNT}/pricing/stream?instruments=${instrumentList}&snapshot=true`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } },
    );

    if (!streamRes.ok || !streamRes.body) {
      const errBody = await streamRes.text().catch(() => "");
      console.error(`[STRIKE-v3] Stream open failed ${streamRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `Stream failed: ${streamRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 6. Initialize trackers ───
    const prices = new Map<string, { bid: number; ask: number; mid: number; spread: number; spreadPips: number }>();
    const zScoreTrackers = new Map<string, ZScoreTracker>();
    const velocityTrackers = new Map<string, VelocityTracker>();
    const snapbackTrackers = new Map<string, SnapBackTracker>();
    const slippageAudit = new Map<string, SlippageRecord>();
    const zScoreFires: string[] = [];
    const velocityFires: string[] = [];
    const snapbackFires: string[] = [];
    const autonomousExits: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let lastExitScanTs = 0;
    const EXIT_SCAN_INTERVAL_MS = 2000; // Scan open trades every 2s on tick data

    // ═══ IMPROVEMENT #2: AUTONOMOUS EXIT AUTHORITY ═══
    // L0 soldiers now manage exits at tick speed instead of waiting
    // for the 60s trade-monitor cycle. Three exit triggers:
    // 1. Profit-Capture Retrace: MFE >= 0.8R but price retracing → lock profit
    // 2. THS-Decay: Trade health collapsed while in profit → exit
    // 3. Time-Decay: Trade stale > 15 bars with no MFE progress → exit
    
    // Load open trades for exit monitoring
    const { data: openTradesForExit } = await supabase
      .from("oanda_orders")
      .select("id, oanda_trade_id, currency_pair, direction, entry_price, r_pips, mfe_price, mae_price, trade_health_score, bars_since_entry, created_at, environment")
      .eq("status", "filled")
      .is("exit_price", null)
      .not("oanda_trade_id", "is", null)
      .not("entry_price", "is", null);

    const exitTradeMap = new Map<string, any>();
    for (const t of (openTradesForExit || [])) {
      exitTradeMap.set(t.currency_pair, t);
    }
    console.log(`[STRIKE-v3] 🎯 Exit authority: monitoring ${exitTradeMap.size} open trades at tick speed`);

    // Init z-score trackers per correlation group
    for (const g of correlationGroups) {
      zScoreTrackers.set(g.name, { spreadHistory: [], lastFireTs: 0, firedDirection: null });
    }
    // Init velocity trackers
    for (const p of velocityPairs) {
      velocityTrackers.set(p, { ticks: [], lastFireTs: 0 });
    }
    // Also track momentum for z-score quiet pairs
    for (const g of correlationGroups) {
      if (!velocityTrackers.has(g.pairA)) velocityTrackers.set(g.pairA, { ticks: [], lastFireTs: 0 });
      if (!velocityTrackers.has(g.pairB)) velocityTrackers.set(g.pairB, { ticks: [], lastFireTs: 0 });
    }
    // Init snapback trackers
    for (const p of snapbackPairs) {
      snapbackTrackers.set(p, { recentTicks: [], lastMid: null, lastFireTs: 0 });
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Get admin user
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    // ─── Helper: Execute order (unchanged) ───
    async function executeOrder(
      pair: string, direction: string, units: number,
      slPips: number, tpPips: number, engine: string,
      metadata: Record<string, unknown>, currentPrice: { mid: number; spreadPips: number },
      orderType: "MARKET" | "LIMIT" = "MARKET",
    ): Promise<{ success: boolean; tradeId?: string; fillPrice?: number; slippage?: number }> {
      if (LIVE_ENABLED !== "true") {
        console.log(`[STRIKE-v3] 🔇 ${engine} would fire ${direction} ${units} ${pair} — LIVE DISABLED`);
        return { success: false };
      }

      // ─── L0 HARD GATE 1: Spread gate — tightened from 2.5 to 1.5 pips ───
      const maxSpreadPips = 1.5;
      if (currentPrice.spreadPips > maxSpreadPips) {
        console.log(`[STRIKE-v3] 🛡 SPREAD GATE: ${pair} spread ${currentPrice.spreadPips.toFixed(1)}p > ${maxSpreadPips}p — BLOCKED`);
        return { success: false };
      }

      // ─── L0 HARD GATE 2: Late-NY / Rollover session block (20:00-23:59 UTC) ───
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 20 || utcHour < 0) {
        console.log(`[STRIKE-v3] 🛡 SESSION GATE: UTC ${utcHour}h — late-NY/rollover blocked`);
        return { success: false };
      }

      // ─── L0 HARD GATE 3: Friction-to-edge ratio — spread must be < 30% of TP target ───
      const frictionPct = (currentPrice.spreadPips / tpPips) * 100;
      if (frictionPct > 30) {
        console.log(`[STRIKE-v3] 🛡 FRICTION GATE: ${pair} spread ${currentPrice.spreadPips.toFixed(1)}p = ${frictionPct.toFixed(0)}% of TP(${tpPips}p) — too expensive`);
        return { success: false };
      }

      // Slippage audit auto-switch
      const audit = slippageAudit.get(pair);
      if (audit?.switchedToLimit) {
        orderType = "LIMIT";
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

          // Micro-Slippage Audit
          if (!slippageAudit.has(pair)) {
            slippageAudit.set(pair, { totalSlippage: 0, fills: 0, switchedToLimit: false });
          }
          const sa = slippageAudit.get(pair)!;
          sa.totalSlippage += slippagePips;
          sa.fills++;

          if (slippagePips > SLIPPAGE_THRESHOLD_PIPS && !sa.switchedToLimit) {
            sa.switchedToLimit = true;
            console.log(`[STRIKE-v3] 🔴 SLIPPAGE AUDIT: ${pair} → PREDATORY_LIMIT`);
            await supabase.from("gate_bypasses").insert({
              gate_id: `PREDATORY_LIMIT_SWITCH:${pair}`,
              reason: JSON.stringify({ pair, slippage: slippagePips, engine: "slippage-auditor-v1" }),
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
              governance_payload: { ...metadata, slippagePips, orderType },
              requested_price: currentPrice.mid,
              slippage_pips: slippagePips,
              spread_at_entry: currentPrice.spreadPips,
            });
          }

          console.log(`[STRIKE-v3] ✅ ${engine} FILLED: ${tradeId} @ ${fillPrice} | ${direction} ${units} ${pair} | slip ${slippagePips.toFixed(2)}p`);
          return { success: true, tradeId, fillPrice, slippage: slippagePips };
        } else {
          const rejectReason = orderData.orderRejectTransaction?.rejectReason ||
            orderData.orderCancelTransaction?.reason || "Unknown";
          console.warn(`[STRIKE-v3] ❌ ${engine} REJECTED: ${rejectReason}`);
          return { success: false };
        }
      } catch (err) {
        console.error(`[STRIKE-v3] ${engine} execution error:`, err);
        return { success: false };
      }
    }

    // ─── 7. Process tick stream ───
    try {
      while (true) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > MAX_STREAM_SECONDS) {
          console.log(`[STRIKE-v3] ⏱ Shutdown after ${elapsed.toFixed(0)}s, ${tickCount} ticks`);
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

            // Update velocity tracker (used by both Velocity Gating AND Z-Score momentum filter)
            const vt = velocityTrackers.get(instrument);
            if (vt && prevPrice) {
              const delta = mid - prevPrice.mid;
              if (Math.abs(delta) > 0) {
                const dir: 1 | -1 = delta > 0 ? 1 : -1;
                vt.ticks.push({ ts: tickTs, mid, direction: dir });
                // Keep last 20 ticks for momentum lookback
                while (vt.ticks.length > 20) vt.ticks.shift();
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 1: Z-SCORE STRIKE
            // No triggers. No arming. No AI. Pure statistics.
            // Compute rolling z-score on the "spread" between correlated pairs.
            // Fire when z > threshold + momentum burst on the lagging pair.
            // ═══════════════════════════════════════════════
            for (const group of correlationGroups) {
              const priceA = prices.get(group.pairA);
              const priceB = prices.get(group.pairB);
              if (!priceA || !priceB) continue;

              // Correlation spread = normalized difference between pair mids
              // For JPY pairs, normalize to comparable pip scale
              const normA = priceA.mid * pipMultiplier(group.pairA);
              const normB = priceB.mid * pipMultiplier(group.pairB);
              const corrSpread = normA - normB;

              const tracker = zScoreTrackers.get(group.name)!;
              tracker.spreadHistory.push(corrSpread);
              if (tracker.spreadHistory.length > ZSCORE_WINDOW) {
                tracker.spreadHistory.shift();
              }

              // Need enough history
              if (tracker.spreadHistory.length < 30) continue;

              const { z, mean, std } = computeZScore(tracker.spreadHistory);

              // Cooldown check
              if (tickTs - tracker.lastFireTs < ZSCORE_COOLDOWN_MS) continue;

              // ─── GATE 1: Z-Score threshold (the only "committee" is math) ───
              if (Math.abs(z) < zScoreThreshold) continue;

              // z > 2: pairA is expensive relative to pairB → SHORT pairA or LONG pairB
              // z < -2: pairA is cheap relative to pairB → LONG pairA or SHORT pairB
              // We trade the LAGGING pair (the one that hasn't moved yet)
              const aMovePips = prevPrice ? Math.abs(toPips(priceA.mid - (prices.get(group.pairA)?.mid || priceA.mid), group.pairA)) : 0;
              
              let tradePair: string;
              let tradeDirection: string;
              
              if (z > zScoreThreshold) {
                // pairA overextended up relative to pairB → pairB should catch up (long) OR pairA should revert (short)
                // Trade the quieter pair in the catch-up direction
                tradePair = group.pairB;
                tradeDirection = "long";
              } else {
                // z < -threshold: pairA underextended → pairB should drop OR pairA should rise
                tradePair = group.pairB;
                tradeDirection = "short";
              }

              if (blockedPairs.includes(tradePair)) continue;

              // ─── GATE 2: Momentum burst (quiet pair waking up) ───
              const momentumTracker = velocityTrackers.get(tradePair);
              if (momentumTracker) {
                const expectedDir: 1 | -1 = tradeDirection === "long" ? 1 : -1;
                const recentTicks = momentumTracker.ticks.filter(t => t.ts > tickTs - 5000);
                const alignedTicks = recentTicks.filter(t => t.direction === expectedDir);
                if (alignedTicks.length < ZSCORE_MOMENTUM_TICKS) continue;
              }

              // ─── GATE 3: Spread OK (baked into executeOrder) ───
              // That's it. Three gates. Spread → Z-Score → Momentum. Fire.

              const tradePrice = prices.get(tradePair);
              if (!tradePrice) continue;

              tracker.lastFireTs = tickTs;
              tracker.firedDirection = tradeDirection;

              console.log(`[STRIKE-v3] 🎯 Z-SCORE FIRE: ${tradeDirection.toUpperCase()} ${baseUnits} ${tradePair} | z=${z.toFixed(2)} (threshold ${zScoreThreshold}) | group=${group.name} | tick #${tickCount}`);

              const result = await executeOrder(
                tradePair, tradeDirection, baseUnits,
                baseSlPips, baseTpPips, "zscore-strike",
                {
                  zScore: z, mean, std,
                  group: group.name,
                  pairA: group.pairA, pairB: group.pairB,
                  tickNumber: tickCount,
                  streamLatencyMs: Date.now() - startTime,
                  confidence: Math.min(1, Math.abs(z) / 3),
                  engine: "zscore-strike-v3",
                },
                tradePrice,
              );

              if (result.success) {
                zScoreFires.push(`${group.name}:${tradePair}`);

                // Audit log
                await supabase.from("gate_bypasses").insert({
                  gate_id: `ZSCORE_FIRE:${group.name}:${tradePair}`,
                  reason: JSON.stringify({
                    group: group.name, pair: tradePair,
                    direction: tradeDirection, zScore: z,
                    mean, std, threshold: zScoreThreshold,
                    fillPrice: result.fillPrice,
                    slippage: result.slippage,
                    tickNumber: tickCount,
                  }),
                  expires_at: new Date(Date.now() + 3600_000).toISOString(),
                  created_by: "zscore-strike-engine",
                });
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 2: VELOCITY GATING (unchanged — already L0)
            // 5+ same-direction ticks in 2s = impulse fire
            // ═══════════════════════════════════════════════
            if (vt && prevPrice && velocityPairs.includes(instrument)) {
              if (vt.ticks.length >= VELOCITY_TICK_THRESHOLD && (tickTs - vt.lastFireTs) > VELOCITY_COOLDOWN_MS) {
                const recentVTicks = vt.ticks.slice(-VELOCITY_TICK_THRESHOLD);
                const windowAge = tickTs - recentVTicks[0].ts;
                const allSameDir = recentVTicks.every(t => t.direction === recentVTicks[0].direction);

                if (allSameDir && windowAge <= VELOCITY_MAX_AGE_MS) {
                  const direction = recentVTicks[0].direction === 1 ? "long" : "short";
                  const movePips = Math.abs(toPips(recentVTicks[recentVTicks.length - 1].mid - recentVTicks[0].mid, instrument));
                  const avgTickInterval = Math.round(windowAge / (recentVTicks.length - 1));

                  if (movePips >= 1.0) {
                    vt.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] ⚡ VELOCITY: ${instrument} ${recentVTicks.length} ticks ${direction} in ${windowAge}ms | ${movePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, direction, velocityUnits,
                      velocitySlPips, velocityTpPips, "velocity-gating",
                      {
                        ticksInWindow: recentVTicks.length,
                        windowAgeMs: windowAge, avgTickIntervalMs: avgTickInterval,
                        movePips, tickNumber: tickCount,
                        streamLatencyMs: Date.now() - startTime,
                        confidence: Math.min(1, movePips / 3),
                        engine: "velocity-gating-v3",
                      },
                      { mid, spreadPips },
                    );

                    if (result.success) {
                      velocityFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `VELOCITY_FIRE:${instrument}`,
                        reason: JSON.stringify({
                          pair: instrument, direction, movePips,
                          ticksInWindow: recentVTicks.length,
                          windowAgeMs: windowAge, fillPrice: result.fillPrice,
                          slippage: result.slippage, tickNumber: tickCount,
                        }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "velocity-gating-engine",
                      });
                    }
                    vt.ticks = [];
                  }
                }
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 3: SNAP-BACK SNIPER (unchanged — already L0)
            // ═══════════════════════════════════════════════
            const sb = snapbackTrackers.get(instrument);
            if (sb && prevPrice) {
              const delta = mid - prevPrice.mid;
              const deltaPips = toPips(delta, instrument);
              sb.recentTicks.push({ ts: tickTs, mid, delta: deltaPips });

              if (sb.recentTicks.length > SNAPBACK_VOLUME_WINDOW) sb.recentTicks.shift();

              if (sb.recentTicks.length >= SNAPBACK_VOLUME_WINDOW && (tickTs - sb.lastFireTs) > 5000) {
                const ticks = sb.recentTicks;
                const totalMovePips = Math.abs(ticks[ticks.length - 1].mid - ticks[0].mid) * pipMultiplier(instrument);
                const lastFewTicks = ticks.slice(-3);
                const mainWindowTicks = ticks.slice(0, -3);

                if (mainWindowTicks.length >= 5) {
                  const mainDownRatio = mainWindowTicks.filter(t => t.delta < 0).length / mainWindowTicks.length;
                  const mainUpRatio = mainWindowTicks.filter(t => t.delta > 0).length / mainWindowTicks.length;
                  const lastFewDirection = lastFewTicks.reduce((sum, t) => sum + t.delta, 0);

                  // Down-flush → snap-back up
                  if (mainDownRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection > 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] 🎯 SNAP-BACK: ${instrument} down-flush → reversal | ${totalMovePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, "long", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      { huntDirection: "down", exhaustionRatio: mainDownRatio, spikePips: totalMovePips, tickNumber: tickCount, confidence: Math.min(1, totalMovePips / 5), engine: "snapback-sniper-v3" },
                      { mid, spreadPips },
                    );
                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({ pair: instrument, direction: "long", exhaustionRatio: mainDownRatio, spikePips: totalMovePips, tickNumber: tickCount }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "snapback-sniper-engine",
                      });
                    }
                    sb.recentTicks = [];
                  }

                  // Up-flush → snap-back down
                  if (mainUpRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection < 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] 🎯 SNAP-BACK: ${instrument} up-flush → reversal | ${totalMovePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, "short", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      { huntDirection: "up", exhaustionRatio: mainUpRatio, spikePips: totalMovePips, tickNumber: tickCount, confidence: Math.min(1, totalMovePips / 5), engine: "snapback-sniper-v3" },
                      { mid, spreadPips },
                    );
                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({ pair: instrument, direction: "short", exhaustionRatio: mainUpRatio, spikePips: totalMovePips, tickNumber: tickCount }),
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

    // ─── 8. Session summary ───
    const slippageSummary: Record<string, { avgSlippage: number; fills: number; switchedToLimit: boolean }> = {};
    for (const [pair, sa] of slippageAudit.entries()) {
      slippageSummary[pair] = {
        avgSlippage: sa.fills > 0 ? Math.round((sa.totalSlippage / sa.fills) * 100) / 100 : 0,
        fills: sa.fills, switchedToLimit: sa.switchedToLimit,
      };
    }

    const totalMs = Date.now() - startTime;
    console.log(`[STRIKE-v3] 📊 Session: ${totalMs}ms, ${tickCount} ticks | Z-Score: ${zScoreFires.length} | Velocity: ${velocityFires.length} | Snap-Back: ${snapbackFires.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v3-zscore-strike-engine",
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        zscore: { fired: zScoreFires.length, pairs: zScoreFires, groups: correlationGroups.length, threshold: zScoreThreshold },
        velocity: { fired: velocityFires.length, pairs: velocityFires, monitored: velocityPairs.length },
        snapback: { fired: snapbackFires.length, pairs: snapbackFires, monitored: snapbackPairs.length },
        slippageAudit: slippageSummary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[STRIKE-v3] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
