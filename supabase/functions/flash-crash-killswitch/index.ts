// flash-crash-killswitch: Raw Tick Velocity Circuit Breaker
// Monitors S5 candle velocity across all pairs simultaneously
// Triggers BEFORE headlines hit — pure price-action detection
// Auto-injects CIRCUIT_BREAKER if velocity exceeds flash-crash thresholds
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

// Cascade threshold: if N pairs spike simultaneously, it's systemic
const CASCADE_THRESHOLD = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    const pairAlerts: any[] = [];
    const now = new Date();

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

      // Velocity ratio: how much faster is current vs baseline
      const velocityRatio = avgBaseline > 0 ? avgRecent / avgBaseline : 1;

      // Direction of the move
      const lastClose = parseFloat(candles[candles.length - 1].mid.c);
      const refClose = parseFloat(candles[candles.length - 4]?.mid.c || candles[0].mid.c);
      const movePips = (lastClose - refClose) * mult;

      const isFlashAlert = maxRecent >= threshold;
      const isVelocitySpike = velocityRatio >= 5; // 5x normal speed

      if (isFlashAlert || isVelocitySpike) {
        pairAlerts.push({
          pair,
          maxVelocity: Math.round(maxRecent * 10) / 10,
          avgVelocity: Math.round(avgRecent * 10) / 10,
          threshold,
          velocityRatio: Math.round(velocityRatio * 10) / 10,
          movePips: Math.round(movePips * 10) / 10,
          direction: movePips > 0 ? "UP" : "DOWN",
          severity: maxRecent >= threshold * 2 ? "EXTREME" : "HIGH",
          trigger: isFlashAlert ? "THRESHOLD_BREACH" : "VELOCITY_SPIKE",
        });
      }
    }

    // Determine if cascade (systemic flash crash)
    const isCascade = pairAlerts.length >= CASCADE_THRESHOLD;
    const hasExtreme = pairAlerts.some(a => a.severity === "EXTREME");

    // Auto-inject circuit breaker for flash crash
    if (isCascade || hasExtreme) {
      const { data: existing } = await supabase
        .from("gate_bypasses")
        .select("id")
        .eq("gate_id", "CIRCUIT_BREAKER:flash_crash_killswitch")
        .eq("revoked", false)
        .gte("expires_at", now.toISOString())
        .limit(1);

      if (!existing?.length) {
        const severity = hasExtreme ? "EXTREME" : "CASCADE";
        const affectedPairs = pairAlerts.map(a => a.pair).join(", ");
        const cooldownMin = hasExtreme ? 30 : 15;

        await supabase.from("gate_bypasses").insert({
          gate_id: "CIRCUIT_BREAKER:flash_crash_killswitch",
          reason: `FLASH CRASH [${severity}]: ${pairAlerts.length} pairs spiking simultaneously (${affectedPairs}). Max velocity ${Math.max(...pairAlerts.map(a => a.maxVelocity))} pips/5s. All trading halted ${cooldownMin}min.`,
          expires_at: new Date(now.getTime() + cooldownMin * 60_000).toISOString(),
          pair: null,
          created_by: "flash-crash-killswitch",
        });

        // Also suspend all agents during flash crash
        await supabase.from("gate_bypasses").insert({
          gate_id: "AGENT_SUSPEND:flash_crash_all",
          reason: `FLASH CRASH auto-suspend: ${severity} event detected across ${pairAlerts.length} pairs.`,
          expires_at: new Date(now.getTime() + cooldownMin * 60_000).toISOString(),
          pair: null,
          created_by: "flash-crash-killswitch",
        });
      }
    }

    // Persist scan results
    const payload = {
      alertCount: pairAlerts.length,
      isCascade,
      hasExtreme,
      alerts: pairAlerts,
      allClear: pairAlerts.length === 0,
      scannedPairs: ALL_PAIRS.length,
      scanTime: now.toISOString(),
    };

    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "flash_crash_monitor",
        memory_key: "killswitch_status",
        payload,
        relevance_score: pairAlerts.length > 0 ? 1.0 : 0.2,
        created_by: "flash-crash-killswitch",
      },
      { onConflict: "memory_type,memory_key" }
    );

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
