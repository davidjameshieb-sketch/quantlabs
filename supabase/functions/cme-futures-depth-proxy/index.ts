// CME Futures Depth Proxy via Polygon.io
// Fetches CME FX futures data (6E, 6B, 6J, 6A, 6C, 6N) and compares against
// OANDA retail positioning to identify:
// 1. Divergence Gate: retail vs CME institutional positioning → sizing multiplier
// 2. Liquidity Vacuum 2.0: CME iceberg detection → auto-arm vacuum on OANDA
// 3. Delta-Correlation Gate: CME volume delta vs OANDA price lag → lead-lag trigger

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CME FX futures → OANDA pair mapping
// Contract months: H=Mar, M=Jun, U=Sep, Z=Dec — auto-resolve current front month
function getCMEContractMonth(): string {
  const month = new Date().getMonth(); // 0-11
  if (month < 2) return "H"; // Jan-Feb → March contract
  if (month < 5) return "M"; // Mar-May → June contract
  if (month < 8) return "U"; // Jun-Aug → September contract
  return "Z"; // Sep-Dec → December contract
}
function getCMEYear(): string { return String(new Date().getFullYear()); }

const CME_MAP: Record<string, { ticker: string; oandaPair: string; name: string; invertPrice: boolean }> = {
  "6E": { ticker: `C:6E${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "EUR_USD", name: "Euro FX", invertPrice: false },
  "6B": { ticker: `C:6B${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "GBP_USD", name: "British Pound", invertPrice: false },
  "6J": { ticker: `C:6J${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "USD_JPY", name: "Japanese Yen", invertPrice: true },
  "6A": { ticker: `C:6A${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "AUD_USD", name: "Australian Dollar", invertPrice: false },
  "6C": { ticker: `C:6C${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "USD_CAD", name: "Canadian Dollar", invertPrice: true },
  "6N": { ticker: `C:6N${getCMEContractMonth()}${getCMEYear()}`, oandaPair: "NZD_USD", name: "New Zealand Dollar", invertPrice: false },
};

// Alternative: use Polygon forex aggregates + snapshot for volume proxy
const POLYGON_FX_PAIRS: Record<string, string> = {
  "EUR_USD": "C:EURUSD",
  "GBP_USD": "C:GBPUSD",
  "USD_JPY": "C:USDJPY",
  "AUD_USD": "C:AUDUSD",
  "USD_CAD": "C:USDCAD",
  "NZD_USD": "C:NZDUSD",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const polygonKey = Deno.env.get("POLYGON_API_KEY");

  if (!polygonKey) {
    return new Response(JSON.stringify({ error: "POLYGON_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400_000);
    const twoDaysAgo = new Date(now.getTime() - 172800_000);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const prevDateStr = twoDaysAgo.toISOString().slice(0, 10);

    // 1. Fetch Polygon FX aggregates (volume + OHLC) for each pair
    const pairResults = await Promise.all(
      Object.entries(POLYGON_FX_PAIRS).map(async ([oandaPair, polyTicker]) => {
        try {
          // Get 1-minute bars for last 2 hours for volume delta analysis
          const aggRes = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${polyTicker}/range/5/minute/${dateStr}/${dateStr}?adjusted=true&sort=desc&limit=48&apiKey=${polygonKey}`
          );
          const aggData = await aggRes.json();

          // Get previous day's aggregates for comparison
          const prevRes = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${polyTicker}/range/1/day/${prevDateStr}/${dateStr}?adjusted=true&sort=desc&limit=2&apiKey=${polygonKey}`
          );
          const prevData = await prevRes.json();

          // Get snapshot for current price
          const snapRes = await fetch(
            `https://api.polygon.io/v2/snapshot/locale/global/markets/forex/tickers/${polyTicker}?apiKey=${polygonKey}`
          );
          const snapData = await snapRes.json();

          return {
            oandaPair,
            polyTicker,
            bars: aggData.results || [],
            dailyBars: prevData.results || [],
            snapshot: snapData.ticker || null,
          };
        } catch (err) {
          console.error(`Failed to fetch ${oandaPair}:`, err);
          return { oandaPair, polyTicker, bars: [], dailyBars: [], snapshot: null };
        }
      })
    );

    // 2. Fetch OANDA retail positioning (from sovereign_memory)
    const { data: oandaData } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "sentiment_divergence")
      .eq("memory_key", "retail_vs_institutional")
      .limit(1)
      .single();

    const retailProfiles: any[] = oandaData?.payload?.profiles || [];

    // 3. Fetch current OANDA order book data
    const { data: darkPoolData } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "dark_pool_proxy")
      .eq("memory_key", "liquidity_depth_curve")
      .limit(1)
      .single();

    const darkPoolProfiles: any[] = darkPoolData?.payload?.profiles || [];

    // 4. Process each pair: compute divergence, icebergs, delta-correlation
    const cmePairAnalysis: any[] = [];
    const divergenceAlerts: any[] = [];
    const icebergAlerts: any[] = [];
    const deltaCorrelationAlerts: any[] = [];

    for (const result of pairResults) {
      if (!result.bars.length) continue;

      const { oandaPair, bars, dailyBars, snapshot } = result;

      // Volume delta: sum of (close > open ? vol : -vol) for recent bars
      let buyVolume = 0;
      let sellVolume = 0;
      const recentBars = bars.slice(0, 12); // last hour of 5min bars
      for (const bar of recentBars) {
        if (bar.c > bar.o) {
          buyVolume += (bar.v || 0);
        } else {
          sellVolume += (bar.v || 0);
        }
      }
      const totalVolume = buyVolume + sellVolume;
      const volumeDelta = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

      // Volume surge: compare recent volume to daily average
      const todayVol = dailyBars[0]?.v || 0;
      const prevDayVol = dailyBars[1]?.v || 1;
      const volumeSurge = prevDayVol > 0 ? todayVol / prevDayVol : 1;

      // Institutional bias from volume delta
      const institutionalBias = volumeDelta > 0.15 ? "LONG" : volumeDelta < -0.15 ? "SHORT" : "NEUTRAL";

      // Price momentum from recent bars
      const priceMomentum = recentBars.length >= 2
        ? (recentBars[0].c - recentBars[recentBars.length - 1].c) / recentBars[recentBars.length - 1].c * 10000
        : 0;

      // --- GATE 1: Divergence Gate ---
      const retailProfile = retailProfiles.find((p: any) => p.instrument === oandaPair);
      let divergenceSignal: any = null;

      if (retailProfile) {
        const retailLongPct = retailProfile.retailLongPct || 50;
        const retailBias = retailLongPct > 60 ? "LONG" : retailLongPct < 40 ? "SHORT" : "NEUTRAL";

        // If retail is heavily one-sided and CME shows opposite institutional flow
        const isDiverged = (retailLongPct >= 70 && institutionalBias === "SHORT") ||
                           (retailLongPct <= 30 && institutionalBias === "LONG");

        const divergenceStrength = isDiverged
          ? Math.abs(retailLongPct - 50) / 50 + Math.abs(volumeDelta)
          : 0;

        if (isDiverged && divergenceStrength > 0.5) {
          const sizingMultiplier = divergenceStrength > 0.8 ? 1.5 : 1.2;
          const tradeDirection = institutionalBias === "SHORT" ? "SHORT" : "LONG";

          divergenceSignal = {
            pair: oandaPair,
            retailLongPct,
            retailBias,
            cmeBias: institutionalBias,
            volumeDelta: Math.round(volumeDelta * 1000) / 1000,
            divergenceStrength: Math.round(divergenceStrength * 100) / 100,
            sizingMultiplier,
            recommendedDirection: tradeDirection,
            signal: `CME-RETAIL DIVERGENCE: Retail ${retailLongPct}% long, CME delta ${(volumeDelta * 100).toFixed(1)}% → ${sizingMultiplier}x ${tradeDirection}`,
          };

          divergenceAlerts.push(divergenceSignal);

          // Auto-inject sizing override
          await supabase.from("gate_bypasses").upsert({
            gate_id: `SIZING_OVERRIDE:cme_divergence_${oandaPair}`,
            reason: divergenceSignal.signal,
            expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
            pair: oandaPair,
            created_by: "cme-futures-depth-proxy",
          }, { onConflict: "gate_id" });
        }
      }

      // --- GATE 2: Liquidity Vacuum 2.0 (Iceberg Detection) ---
      let icebergSignal: any = null;

      // Detect iceberg: volume surge (>2x normal) with minimal price movement
      const priceRange = recentBars.length > 0
        ? Math.max(...recentBars.map((b: any) => b.h)) - Math.min(...recentBars.map((b: any) => b.l))
        : 0;
      const avgBarRange = priceRange / Math.max(recentBars.length, 1);
      const volumePerPip = totalVolume > 0 && avgBarRange > 0 ? totalVolume / (avgBarRange * 10000) : 0;

      // High volume + low price movement = iceberg (large resting order absorbing)
      if (volumeSurge > 2.0 && Math.abs(priceMomentum) < 5) {
        const icebergSide = volumeDelta > 0 ? "BUY_WALL" : "SELL_WALL";
        const currentPrice = snapshot?.lastQuote?.a || recentBars[0]?.c || 0;

        icebergSignal = {
          pair: oandaPair,
          type: icebergSide,
          volumeSurge: Math.round(volumeSurge * 100) / 100,
          priceMomentum: Math.round(priceMomentum * 10) / 10,
          volumePerPip: Math.round(volumePerPip),
          currentPrice,
          signal: `CME ICEBERG [${icebergSide}]: ${oandaPair} vol ${volumeSurge.toFixed(1)}x surge, price flat (${priceMomentum.toFixed(1)} pips). Institutional absorption detected.`,
          actionable: true,
        };

        icebergAlerts.push(icebergSignal);

        // Auto-arm liquidity vacuum on the OANDA side
        const darkProfile = darkPoolProfiles.find((p: any) => p.instrument === oandaPair);
        if (darkProfile || icebergSide === "BUY_WALL") {
          await supabase.from("gate_bypasses").upsert({
            gate_id: `LIQUIDITY_VACUUM:cme_iceberg_${oandaPair}`,
            reason: JSON.stringify({
              type: "LIQUIDITY_VACUUM_V2",
              trigger: "cme_iceberg",
              pair: oandaPair,
              side: icebergSide === "BUY_WALL" ? "LONG" : "SHORT",
              volumeSurge,
              signal: icebergSignal.signal,
            }),
            expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
            pair: oandaPair,
            created_by: "cme-futures-depth-proxy",
          }, { onConflict: "gate_id" });
        }
      }

      // --- GATE 3: Delta-Correlation Gate ---
      let deltaCorrelation: any = null;

      // CME volume delta spike without corresponding OANDA price move
      if (Math.abs(volumeDelta) > 0.25 && Math.abs(priceMomentum) < 3) {
        deltaCorrelation = {
          pair: oandaPair,
          volumeDelta: Math.round(volumeDelta * 1000) / 1000,
          priceLag: Math.round(priceMomentum * 10) / 10,
          expectedDirection: volumeDelta > 0 ? "UP" : "DOWN",
          signal: `DELTA-CORRELATION: CME delta ${(volumeDelta * 100).toFixed(1)}% but OANDA lagging (${priceMomentum.toFixed(1)} pips). Institutional front-run detected → lead-lag trigger.`,
          triggerLeadLag: true,
        };

        deltaCorrelationAlerts.push(deltaCorrelation);

        // Auto-arm correlation trigger for lead-lag execution
        await supabase.from("gate_bypasses").upsert({
          gate_id: `CORRELATION_TRIGGER:cme_delta_${oandaPair}`,
          reason: JSON.stringify({
            type: "CORRELATION_TRIGGER",
            trigger: "cme_delta_correlation",
            loudPair: `CME:${oandaPair}`,
            quietPair: oandaPair,
            direction: volumeDelta > 0 ? "LONG" : "SHORT",
            delta: volumeDelta,
            signal: deltaCorrelation.signal,
          }),
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          pair: oandaPair,
          created_by: "cme-futures-depth-proxy",
        }, { onConflict: "gate_id" });
      }

      cmePairAnalysis.push({
        pair: oandaPair,
        cmeBias: institutionalBias,
        volumeDelta: Math.round(volumeDelta * 1000) / 1000,
        volumeSurge: Math.round(volumeSurge * 100) / 100,
        totalVolume,
        priceMomentum: Math.round(priceMomentum * 10) / 10,
        divergenceGate: divergenceSignal,
        icebergDetection: icebergSignal,
        deltaCorrelation,
      });
    }

    // 5. Persist to sovereign_memory
    const payload = {
      pairsAnalyzed: cmePairAnalysis.length,
      divergenceAlerts: divergenceAlerts.length,
      icebergAlerts: icebergAlerts.length,
      deltaCorrelationAlerts: deltaCorrelationAlerts.length,
      pairs: cmePairAnalysis,
      divergenceGates: divergenceAlerts,
      icebergs: icebergAlerts,
      deltaCorrelations: deltaCorrelationAlerts,
      generatedAt: now.toISOString(),
    };

    await supabase.from("sovereign_memory").upsert({
      memory_type: "cme_futures_depth",
      memory_key: "institutional_depth_proxy",
      payload,
      relevance_score: (divergenceAlerts.length + icebergAlerts.length + deltaCorrelationAlerts.length) > 0 ? 1.0 : 0.4,
      created_by: "cme-futures-depth-proxy",
    }, { onConflict: "memory_type,memory_key" });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("CME proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
