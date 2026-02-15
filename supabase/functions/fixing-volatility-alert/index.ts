// fixing-volatility-alert: London 4PM Fix Proxy via Tick Velocity
// Detects pre-fix volatility compression and post-fix directional spikes
// Injects G19_FIX_VOLATILITY gate to widen SL or pause trading during fix windows
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIX_PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "EUR_GBP", "GBP_JPY", "USD_CHF"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();

    // London 4PM fix = 16:00 UTC (summer) / 16:00 UTC
    // Pre-fix window: 15:30-16:00, Fix window: 16:00-16:05, Post-fix: 16:05-16:30
    const isPreFix = utcHour === 15 && utcMin >= 30;
    const isFixWindow = utcHour === 16 && utcMin <= 5;
    const isPostFix = utcHour === 16 && utcMin > 5 && utcMin <= 30;
    const isFixRelevant = isPreFix || isFixWindow || isPostFix;

    // Fetch S5 (5-second) candles for tick velocity measurement
    const pairProfiles: Record<string, any> = {};

    for (const pair of FIX_PAIRS) {
      try {
        // Get last 60 x 5s candles = 5 minutes of tick data
        const res = await fetch(
          `${baseUrl}/v3/instruments/${pair}/candles?granularity=S5&count=60`,
          { headers: { Authorization: `Bearer ${oandaToken}` } }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const candles = (data.candles || []).filter((c: any) => c.complete);

        if (candles.length < 10) continue;

        const isJpy = pair.includes("JPY");
        const mult = isJpy ? 100 : 10000;

        // Calculate tick velocity (pips per 5s bar)
        const velocities: number[] = [];
        for (const c of candles) {
          const range = (parseFloat(c.mid.h) - parseFloat(c.mid.l)) * mult;
          velocities.push(range);
        }

        const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
        const maxVelocity = Math.max(...velocities);
        const recentVelocity = velocities.slice(-12).reduce((a, b) => a + b, 0) / 12; // last 60s

        // Detect compression (recent < 40% of avg = coiling before fix)
        const compressionRatio = avgVelocity > 0 ? recentVelocity / avgVelocity : 1;
        const isCompressed = compressionRatio < 0.4;

        // Detect spike (recent > 3x avg = fix explosion)
        const isSpiking = recentVelocity > avgVelocity * 3;

        // Directional bias from last 12 bars
        const lastClose = parseFloat(candles[candles.length - 1].mid.c);
        const refClose = parseFloat(candles[candles.length - 13]?.mid.c || candles[0].mid.c);
        const dirPips = (lastClose - refClose) * mult;

        pairProfiles[pair] = {
          avgTickVelocity: Math.round(avgVelocity * 100) / 100,
          maxTickVelocity: Math.round(maxVelocity * 100) / 100,
          recentTickVelocity: Math.round(recentVelocity * 100) / 100,
          compressionRatio: Math.round(compressionRatio * 100) / 100,
          isCompressed,
          isSpiking,
          directionPips: Math.round(dirPips * 10) / 10,
          direction: dirPips > 0.3 ? "bullish" : dirPips < -0.3 ? "bearish" : "neutral",
        };
      } catch { /* skip */ }
    }

    // Determine fix phase and alert level
    let fixPhase = "inactive";
    let alertLevel = "none";
    const compressedPairs = Object.entries(pairProfiles).filter(([, p]) => p.isCompressed).map(([k]) => k);
    const spikingPairs = Object.entries(pairProfiles).filter(([, p]) => p.isSpiking).map(([k]) => k);

    if (isFixWindow) {
      fixPhase = "FIX_ACTIVE";
      alertLevel = "critical";
    } else if (isPreFix) {
      fixPhase = "PRE_FIX";
      alertLevel = compressedPairs.length >= 2 ? "high" : "medium";
    } else if (isPostFix) {
      fixPhase = "POST_FIX";
      alertLevel = spikingPairs.length >= 1 ? "high" : "low";
    }

    // Auto-inject G19 gate during critical fix windows
    if (alertLevel === "critical" || (alertLevel === "high" && isPreFix)) {
      const { data: existing } = await supabase
        .from("gate_bypasses")
        .select("id")
        .eq("gate_id", "DYNAMIC_GATE:G19_FIX_VOLATILITY")
        .eq("revoked", false)
        .gte("expires_at", now.toISOString())
        .limit(1);

      if (!existing?.length) {
        await supabase.from("gate_bypasses").insert({
          gate_id: "DYNAMIC_GATE:G19_FIX_VOLATILITY",
          reason: `FIX ALERT [${fixPhase}]: ${compressedPairs.length} compressed, ${spikingPairs.length} spiking. Widening SL +50% and pausing new entries for 10min.`,
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          pair: null,
          created_by: "fixing-volatility-alert",
        });
      }
    }

    // Persist to sovereign_memory
    const payload = {
      fixPhase,
      alertLevel,
      utcTime: now.toISOString(),
      compressedPairs,
      spikingPairs,
      profiles: pairProfiles,
      isFixRelevant,
    };

    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "fixing_volatility",
        memory_key: "london_4pm_fix",
        payload,
        relevance_score: alertLevel === "critical" ? 1.0 : alertLevel === "high" ? 0.8 : 0.4,
        created_by: "fixing-volatility-alert",
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
