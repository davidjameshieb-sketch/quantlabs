// asymmetric-risk-engine: Decouples SL/TP based on Volatility Surface
// Enables "Sniper" mode (tight SL, wide TP) when Dark Pool fragmentation low + God Signal active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JPY_PAIRS = ["USD_JPY","EUR_JPY","GBP_JPY","AUD_JPY","CAD_JPY","CHF_JPY","NZD_JPY"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    const body = await req.json().catch(() => ({}));
    const pair = body.pair ?? "EUR_USD";
    const direction = body.direction ?? "long";
    const baseRiskPips = body.base_risk_pips ?? 15;

    // 1. Fetch volatility data — ATR from recent candles
    const granularity = "M5";
    const candleRes = await fetch(
      `${baseUrl}/v3/instruments/${pair}/candles?granularity=${granularity}&count=50`,
      { headers: { Authorization: `Bearer ${oandaToken}` } }
    );
    let atr5m = 0, atr1h = 0;
    if (candleRes.ok) {
      const candleData = await candleRes.json();
      const candles = candleData.candles?.filter((c: any) => c.complete) || [];
      const mult = JPY_PAIRS.includes(pair) ? 100 : 10000;
      const ranges = candles.map((c: any) => {
        const h = parseFloat(c.mid.h), l = parseFloat(c.mid.l);
        return (h - l) * mult;
      });
      atr5m = ranges.length > 0 ? ranges.reduce((a: number, b: number) => a + b, 0) / ranges.length : 0;
      atr1h = atr5m * Math.sqrt(12); // Scale 5m ATR to 1h estimate
    }

    // 2. Fetch Dark Pool fragmentation
    const { data: darkPool } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "synthetic_dark_pool")
      .eq("memory_key", pair)
      .limit(1);

    const dpPayload = darkPool?.[0]?.payload as any;
    const fragmentation = dpPayload?.fragmentation ?? 50;
    const consensusDirection = dpPayload?.consensusDirection ?? "fragmented";
    const consensusStrength = dpPayload?.strength ?? 0;

    // 3. Fetch God Signal
    const { data: godSignal } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "god_signal_latest")
      .eq("memory_key", "institutional_consensus")
      .limit(1);

    const gsPayload = godSignal?.[0]?.payload as any;
    const godConfidence = gsPayload?.confidence ?? gsPayload?.usdConfidence ?? 0;
    const godBias = gsPayload?.usdBias ?? "neutral";

    // 4. Compute Asymmetric Risk Profile
    // Sniper conditions: low fragmentation + active God Signal + direction aligns with institutional
    const isSniperEligible =
      fragmentation < 15 &&
      godConfidence >= 60 &&
      godBias !== "neutral" &&
      consensusDirection !== "fragmented";

    // Volatility surface multipliers
    const volRatio = atr1h > 0 ? atr5m / (atr1h / Math.sqrt(12)) : 1;
    const isLowVol = volRatio < 0.8;
    const isHighVol = volRatio > 1.3;

    let slPips: number, tpPips: number, riskRewardRatio: number, mode: string;

    if (isSniperEligible && isLowVol) {
      // SNIPER: Ultra-tight SL, massive TP — low vol compression before institutional move
      slPips = Math.max(3, Math.round(atr5m * 1.5));
      tpPips = Math.round(atr1h * 2.5);
      riskRewardRatio = tpPips / slPips;
      mode = "SNIPER";
    } else if (isSniperEligible) {
      // PREDATORY: Tight SL, wide TP — institutional alignment confirmed
      slPips = Math.max(5, Math.round(atr5m * 2));
      tpPips = Math.round(atr1h * 2);
      riskRewardRatio = tpPips / slPips;
      mode = "PREDATORY";
    } else if (isHighVol) {
      // DEFENSIVE: Wide SL to survive volatility, moderate TP
      slPips = Math.round(atr5m * 3);
      tpPips = Math.round(atr1h * 1.2);
      riskRewardRatio = tpPips / slPips;
      mode = "DEFENSIVE";
    } else {
      // STANDARD: Balanced risk
      slPips = Math.round(atr5m * 2.5);
      tpPips = Math.round(atr1h * 1.5);
      riskRewardRatio = tpPips / slPips;
      mode = "STANDARD";
    }

    // Ensure minimums
    slPips = Math.max(slPips, 3);
    tpPips = Math.max(tpPips, slPips * 1.5);
    riskRewardRatio = Math.round((tpPips / slPips) * 100) / 100;

    // 5. Sizing adjustment based on mode
    const sizingMultiplier = mode === "SNIPER" ? 2.0
      : mode === "PREDATORY" ? 1.5
      : mode === "DEFENSIVE" ? 0.5
      : 1.0;

    const result = {
      pair,
      direction,
      mode,
      slPips: Math.round(slPips * 10) / 10,
      tpPips: Math.round(tpPips * 10) / 10,
      riskRewardRatio,
      sizingMultiplier,
      volatilitySurface: {
        atr5m: Math.round(atr5m * 100) / 100,
        atr1h: Math.round(atr1h * 100) / 100,
        volRatio: Math.round(volRatio * 100) / 100,
        regime: isLowVol ? "compression" : isHighVol ? "expansion" : "normal",
      },
      darkPool: {
        fragmentation,
        consensusDirection,
        consensusStrength,
      },
      godSignal: {
        confidence: godConfidence,
        bias: godBias,
      },
      sniperEligible: isSniperEligible,
      timestamp: new Date().toISOString(),
    };

    // Persist to sovereign_memory for the loop to consume
    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "asymmetric_risk_profile",
        memory_key: pair,
        payload: result,
        relevance_score: mode === "SNIPER" ? 1.0 : 0.7,
        created_by: "asymmetric-risk-engine",
      },
      { onConflict: "memory_type,memory_key" }
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
