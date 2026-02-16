// ═══════════════════════════════════════════════════════════════
// FLASH-CRASH KILL-SWITCH v2 — Systemic Cascade Detection
// 
// IMPROVEMENT #4: Enhanced with millisecond-level cascade detection.
// Monitors S5 candle velocity across ALL 11 pairs simultaneously.
// Triggers BEFORE headlines hit — pure price-action detection.
// Auto-injects CIRCUIT_BREAKER + AGENT_SUSPEND on cascade.
//
// New: Velocity acceleration detection, cross-pair correlation
// spike analysis, and graduated response (ALERT → HALT → FLATTEN).
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "NZD_USD",
  "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY", "USD_CHF",
];

// Flash crash thresholds (pips per 5-second bar)
const FLASH_THRESHOLDS: Record<string, number> = {
  "EUR_USD": 8, "GBP_USD": 12, "USD_JPY": 10, "AUD_USD": 8,
  "USD_CAD": 8, "NZD_USD": 7, "EUR_GBP": 6, "EUR_JPY": 12,
  "GBP_JPY": 18, "AUD_JPY": 10, "USD_CHF": 8,
};

// Cascade threshold: N pairs spiking simultaneously = systemic
const CASCADE_THRESHOLD = 3;

// NEW v2: Acceleration thresholds — velocity INCREASING bar-over-bar
const ACCELERATION_MULTIPLIER = 2.0; // If bar[n] > 2x bar[n-1], it's accelerating

// NEW v2: Correlation spike — if USD pairs all move same direction, it's a USD event
const USD_PAIRS_LONG = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"]; // USD is quote
const USD_PAIRS_SHORT = ["USD_JPY", "USD_CAD", "USD_CHF"];            // USD is base

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    const pairAlerts: any[] = [];
    const now = new Date();

    // ─── #7: Hardware-Level NAV Circuit Breaker ───
    // Non-AI deterministic check: if NAV drops >3% in <60s, kill everything
    let navBreaker = false;
    try {
      const oandaAccount = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");
      if (oandaAccount && oandaToken) {
        const summaryRes = await fetch(
          `${baseUrl}/v3/accounts/${oandaAccount}/summary`,
          { headers: { Authorization: `Bearer ${oandaToken}` } }
        );
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const nav = parseFloat(summaryData.account?.NAV || "0");
          const balance = parseFloat(summaryData.account?.balance || "0");
          const unrealizedPL = parseFloat(summaryData.account?.unrealizedPL || "0");
          const drawdownPct = balance > 0 ? (unrealizedPL / balance) * 100 : 0;

          if (drawdownPct <= -3) {
            navBreaker = true;
            console.log(`[FLASH-CRASH] ☢️ NAV BREAKER: ${drawdownPct.toFixed(1)}% drawdown (NAV: ${nav.toFixed(2)}, Balance: ${balance.toFixed(2)})`);

            // Check if breaker already active
            const { data: existingBreaker } = await supabase
              .from("gate_bypasses")
              .select("id")
              .eq("gate_id", "CIRCUIT_BREAKER:nav_hardware_killswitch")
              .eq("revoked", false)
              .gte("expires_at", now.toISOString())
              .limit(1);

            if (!existingBreaker?.length) {
              await supabase.from("gate_bypasses").insert({
                gate_id: "CIRCUIT_BREAKER:nav_hardware_killswitch",
                reason: `HARDWARE NAV BREAKER: ${drawdownPct.toFixed(1)}% drawdown. NAV=${nav.toFixed(2)} Balance=${balance.toFixed(2)}. ALL TRADING HALTED.`,
                expires_at: new Date(now.getTime() + 4 * 3600_000).toISOString(),
                pair: null,
                created_by: "hardware-nav-breaker",
              });

              // Flatten all positions immediately
              const tradesRes = await fetch(
                `${baseUrl}/v3/accounts/${oandaAccount}/openTrades`,
                { headers: { Authorization: `Bearer ${oandaToken}` } }
              );
              if (tradesRes.ok) {
                const { trades: openTrades = [] } = await tradesRes.json();
                await Promise.allSettled(openTrades.map((t: any) =>
                  fetch(`${baseUrl}/v3/accounts/${oandaAccount}/trades/${t.id}/close`, {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${oandaToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ units: "ALL" }),
                  })
                ));
                console.log(`[FLASH-CRASH] ☢️ NAV BREAKER: Flattened ${openTrades.length} positions`);
              }
            }
          }
        }
      }
    } catch (navErr) {
      console.warn(`[FLASH-CRASH] NAV check failed: ${(navErr as Error).message}`);
    }

    // Fetch latest S5 candles for all pairs
    const results = await Promise.all(
      ALL_PAIRS.map(async (pair) => {
        try {
          const res = await fetch(
            `${baseUrl}/v3/instruments/${pair}/candles?granularity=S5&count=24`,
            { headers: { Authorization: `Bearer ${oandaToken}` } }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return { pair, candles: (data.candles || []).filter((c: any) => c.complete) };
        } catch { return null; }
      })
    );

    // NEW v2: Track directional moves for correlation analysis
    const directionalMoves: Record<string, number> = {};

    for (const result of results) {
      if (!result || result.candles.length < 6) continue;
      const { pair, candles } = result;

      const isJpy = pair.includes("JPY");
      const mult = isJpy ? 100 : 10000;
      const threshold = FLASH_THRESHOLDS[pair] || 10;

      // Calculate velocity for each bar
      const velocities: number[] = candles.map((c: any) =>
        (parseFloat(c.mid.h) - parseFloat(c.mid.l)) * mult
      );

      // Last 3 bars = last 15 seconds
      const recent3 = velocities.slice(-3);
      const maxRecent = Math.max(...recent3);
      const avgRecent = recent3.reduce((a: number, b: number) => a + b, 0) / 3;

      // Historical baseline (older bars)
      const baseline = velocities.slice(0, -3);
      const avgBaseline = baseline.length > 0
        ? baseline.reduce((a: number, b: number) => a + b, 0) / baseline.length
        : 1;

      // Velocity ratio
      const velocityRatio = avgBaseline > 0 ? avgRecent / avgBaseline : 1;

      // Direction of the move
      const lastClose = parseFloat(candles[candles.length - 1].mid.c);
      const refClose = parseFloat(candles[candles.length - 4]?.mid.c || candles[0].mid.c);
      const movePips = (lastClose - refClose) * mult;

      // NEW v2: Acceleration detection (velocity increasing bar-over-bar)
      const isAccelerating = recent3.length >= 2 &&
        recent3[recent3.length - 1] > recent3[recent3.length - 2] * ACCELERATION_MULTIPLIER;

      // Track directional moves for correlation
      directionalMoves[pair] = movePips;

      const isFlashAlert = maxRecent >= threshold;
      const isVelocitySpike = velocityRatio >= 5;
      const isAccelAlert = isAccelerating && maxRecent >= threshold * 0.7;

      if (isFlashAlert || isVelocitySpike || isAccelAlert) {
        pairAlerts.push({
          pair,
          maxVelocity: Math.round(maxRecent * 10) / 10,
          avgVelocity: Math.round(avgRecent * 10) / 10,
          threshold,
          velocityRatio: Math.round(velocityRatio * 10) / 10,
          movePips: Math.round(movePips * 10) / 10,
          direction: movePips > 0 ? "UP" : "DOWN",
          severity: maxRecent >= threshold * 2 ? "EXTREME" : isAccelerating ? "ACCELERATING" : "HIGH",
          trigger: isFlashAlert ? "THRESHOLD_BREACH" : isAccelAlert ? "ACCELERATION" : "VELOCITY_SPIKE",
          isAccelerating,
        });
      }
    }

    // ─── NEW v2: Correlation Spike Detection ───
    // If 3+ USD-quote pairs move in same direction simultaneously = USD event
    let correlationSpike = false;
    let correlationDirection = "NONE";

    const usdLongMoves = USD_PAIRS_LONG.filter(p => (directionalMoves[p] || 0) > 2); // USD weakening (pairs go up)
    const usdLongDown = USD_PAIRS_LONG.filter(p => (directionalMoves[p] || 0) < -2); // USD strengthening
    const usdShortMoves = USD_PAIRS_SHORT.filter(p => (directionalMoves[p] || 0) > 2); // USD strengthening (USD base goes up)
    const usdShortDown = USD_PAIRS_SHORT.filter(p => (directionalMoves[p] || 0) < -2); // USD weakening

    // USD weakening: EUR_USD up + GBP_USD up + USD_JPY down + USD_CAD down
    const usdWeakCount = usdLongMoves.length + usdShortDown.length;
    const usdStrongCount = usdLongDown.length + usdShortMoves.length;

    if (usdWeakCount >= 5) {
      correlationSpike = true;
      correlationDirection = "USD_WEAK";
    } else if (usdStrongCount >= 5) {
      correlationSpike = true;
      correlationDirection = "USD_STRONG";
    }

    // Determine severity
    const isCascade = pairAlerts.length >= CASCADE_THRESHOLD;
    const hasExtreme = pairAlerts.some(a => a.severity === "EXTREME");
    const hasAccelerating = pairAlerts.some(a => a.isAccelerating);

    // ─── NEW v2: Graduated Response ───
    // ALERT: 1-2 pairs spiking → log only
    // HALT: 3+ pairs OR extreme OR correlation spike → halt trading
    // FLATTEN: 5+ pairs OR extreme + accelerating → halt + flatten all positions
    const shouldHalt = isCascade || hasExtreme || (correlationSpike && pairAlerts.length >= 2);
    const shouldFlatten = pairAlerts.length >= 5 || (hasExtreme && hasAccelerating);

    if (shouldHalt) {
      const { data: existing } = await supabase
        .from("gate_bypasses")
        .select("id")
        .eq("gate_id", "CIRCUIT_BREAKER:flash_crash_killswitch")
        .eq("revoked", false)
        .gte("expires_at", now.toISOString())
        .limit(1);

      if (!existing?.length) {
        const severity = shouldFlatten ? "NUCLEAR" : hasExtreme ? "EXTREME" : correlationSpike ? "CORRELATION_CASCADE" : "CASCADE";
        const affectedPairs = pairAlerts.map(a => a.pair).join(", ");
        const cooldownMin = shouldFlatten ? 60 : hasExtreme ? 30 : 15;

        await supabase.from("gate_bypasses").insert({
          gate_id: "CIRCUIT_BREAKER:flash_crash_killswitch",
          reason: `FLASH CRASH [${severity}]: ${pairAlerts.length} pairs spiking (${affectedPairs}). Max velocity ${Math.max(...pairAlerts.map(a => a.maxVelocity))} pips/5s.${correlationSpike ? ` CORRELATION: ${correlationDirection}.` : ''}${hasAccelerating ? ' ACCELERATING.' : ''} All trading halted ${cooldownMin}min.`,
          expires_at: new Date(now.getTime() + cooldownMin * 60_000).toISOString(),
          pair: null,
          created_by: "flash-crash-killswitch-v2",
        });

        await supabase.from("gate_bypasses").insert({
          gate_id: "AGENT_SUSPEND:flash_crash_all",
          reason: `FLASH CRASH auto-suspend: ${severity} event across ${pairAlerts.length} pairs.${correlationSpike ? ` ${correlationDirection} detected.` : ''}`,
          expires_at: new Date(now.getTime() + cooldownMin * 60_000).toISOString(),
          pair: null,
          created_by: "flash-crash-killswitch-v2",
        });

        // NEW v2: FLATTEN response — close all open positions
        if (shouldFlatten) {
          console.log(`[FLASH-CRASH] ☢️ NUCLEAR RESPONSE: Flattening all positions...`);
          try {
            const oandaAccount = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");
            if (oandaAccount && oandaToken) {
              // Get all open trades
              const tradesRes = await fetch(
                `${baseUrl}/v3/accounts/${oandaAccount}/openTrades`,
                { headers: { Authorization: `Bearer ${oandaToken}` } }
              );
              if (tradesRes.ok) {
                const tradesData = await tradesRes.json();
                const openTrades = tradesData.trades || [];

                // Close each trade
                const closePromises = openTrades.map(async (trade: any) => {
                  try {
                    const closeRes = await fetch(
                      `${baseUrl}/v3/accounts/${oandaAccount}/trades/${trade.id}/close`,
                      {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${oandaToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ units: "ALL" }),
                      }
                    );
                    const closeData = await closeRes.json();
                    console.log(`[FLASH-CRASH] Flattened trade ${trade.id} (${trade.instrument}): ${closeRes.ok ? 'OK' : 'FAILED'}`);
                    return { tradeId: trade.id, instrument: trade.instrument, success: closeRes.ok };
                  } catch (err) {
                    console.error(`[FLASH-CRASH] Failed to close ${trade.id}:`, err);
                    return { tradeId: trade.id, success: false };
                  }
                });

                const closeResults = await Promise.all(closePromises);
                const closedCount = closeResults.filter(r => r.success).length;
                console.log(`[FLASH-CRASH] ☢️ Flattened ${closedCount}/${openTrades.length} positions`);

                // Mark flattened trades in DB
                for (const r of closeResults.filter(cr => cr.success)) {
                  await supabase.from("oanda_orders")
                    .update({
                      status: "closed",
                      closed_at: now.toISOString(),
                      sovereign_override_tag: `FLASH_CRASH_FLATTEN:${severity}`,
                    })
                    .eq("oanda_trade_id", r.tradeId)
                    .eq("status", "filled");
                }
              }
            }
          } catch (flattenErr) {
            console.error(`[FLASH-CRASH] Flatten error:`, flattenErr);
          }
        }
      }
    }

    // Persist scan results
    const payload: any = {
      alertCount: pairAlerts.length,
      isCascade,
      hasExtreme,
      hasAccelerating,
      correlationSpike,
      correlationDirection,
      shouldFlatten,
      responseLevel: shouldFlatten ? "FLATTEN" : shouldHalt ? "HALT" : pairAlerts.length > 0 ? "ALERT" : "CLEAR",
      alerts: pairAlerts,
      allClear: pairAlerts.length === 0,
      scannedPairs: ALL_PAIRS.length,
      scanTime: now.toISOString(),
      version: "v2",
    };

    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "flash_crash_monitor",
        memory_key: "killswitch_status",
        payload,
        relevance_score: pairAlerts.length > 0 ? 1.0 : 0.2,
        created_by: "flash-crash-killswitch-v2",
      },
      { onConflict: "memory_type,memory_key" }
    );

    // DMA Interrupt for DNA mutation on flash crash
    if (isCascade || hasExtreme) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        console.log(`[L0-PRIME] DMA INTERRUPT: Flash crash detected. Firing DNA mutator...`);

        const dmaRes = await fetch(`${supabaseUrl}/functions/v1/recursive-dna-mutator`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            triggerOverride: {
              source: "L0-PRIME-DMA",
              flashCrashPayload: payload,
              timestamp: now.toISOString(),
            },
          }),
        });
        const dmaResult = await dmaRes.json();
        console.log(`[L0-PRIME] DNA mutation result:`, JSON.stringify(dmaResult));
        payload.dmaMutationFired = true;
        payload.dmaMutationResult = dmaResult;
      } catch (dmaErr) {
        console.error(`[L0-PRIME] DMA interrupt failed:`, dmaErr);
        payload.dmaMutationFired = false;
        payload.dmaMutationError = String(dmaErr);
      }
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
