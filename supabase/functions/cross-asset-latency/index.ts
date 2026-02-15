// cross-asset-latency: Cross-Broker Arbitrage Latency Map
// Tracks time-delay between SPY/BTC moves and FX pair reactions
// Quantifies "Macro-to-FX" lag for Ripple Strike automation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FX_PAIRS = ["EUR_USD","GBP_USD","USD_JPY","AUD_USD","USD_CAD","NZD_USD"];
const JPY_PAIRS = ["USD_JPY"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
  const polygonKey = Deno.env.get("POLYGON_API_KEY");

  try {
    const body = await req.json().catch(() => ({}));
    const lookbackBars = body.lookback_bars ?? 60; // 60 x 1min = 1 hour
    const moveThresholdPct = body.move_threshold_pct ?? 0.15; // 0.15% move = significant

    // 1. Fetch SPY 1-min candles from Polygon
    let spyCandles: { t: number; c: number }[] = [];
    if (polygonKey) {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - lookbackBars * 2 * 60000);
        const fromStr = from.toISOString().split("T")[0];
        const toStr = now.toISOString().split("T")[0];
        const res = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=${lookbackBars * 2}&apiKey=${polygonKey}`
        );
        if (res.ok) {
          const data = await res.json();
          spyCandles = (data.results || []).slice(-lookbackBars).map((r: any) => ({ t: r.t, c: r.c }));
        }
      } catch { /* skip */ }
    }

    // 2. Fetch BTC 1-min candles from Polygon
    let btcCandles: { t: number; c: number }[] = [];
    if (polygonKey) {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - lookbackBars * 2 * 60000);
        const fromStr = from.toISOString().split("T")[0];
        const toStr = now.toISOString().split("T")[0];
        const res = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/1/minute/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=${lookbackBars * 2}&apiKey=${polygonKey}`
        );
        if (res.ok) {
          const data = await res.json();
          btcCandles = (data.results || []).slice(-lookbackBars).map((r: any) => ({ t: r.t, c: r.c }));
        }
      } catch { /* skip */ }
    }

    // 3. Fetch FX 1-min candles from OANDA
    const fxCandles: Record<string, { t: number; c: number }[]> = {};
    for (const pair of FX_PAIRS) {
      try {
        const res = await fetch(
          `${baseUrl}/v3/instruments/${pair}/candles?granularity=M1&count=${lookbackBars}`,
          { headers: { Authorization: `Bearer ${oandaToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          fxCandles[pair] = (data.candles || [])
            .filter((c: any) => c.complete)
            .map((c: any) => ({
              t: new Date(c.time).getTime(),
              c: parseFloat(c.mid.c),
            }));
        }
      } catch { /* skip */ }
    }

    // 4. Detect significant moves in macro assets and measure FX lag
    const latencyMap: any[] = [];

    function detectMoves(candles: { t: number; c: number }[], label: string) {
      const moves: { startIdx: number; endIdx: number; startTime: number; direction: string; pctMove: number }[] = [];
      for (let i = 1; i < candles.length; i++) {
        const pctChange = ((candles[i].c - candles[i - 1].c) / candles[i - 1].c) * 100;
        if (Math.abs(pctChange) >= moveThresholdPct) {
          moves.push({
            startIdx: i - 1,
            endIdx: i,
            startTime: candles[i].t,
            direction: pctChange > 0 ? "up" : "down",
            pctMove: Math.round(pctChange * 1000) / 1000,
          });
        }
      }
      return moves;
    }

    function measureLag(
      macroMoves: ReturnType<typeof detectMoves>,
      fxData: { t: number; c: number }[],
      pair: string,
      macroLabel: string
    ) {
      const mult = JPY_PAIRS.includes(pair) ? 100 : 10000;

      for (const move of macroMoves) {
        // Find the FX candle closest to macro move time
        let fxStartIdx = -1;
        for (let j = 0; j < fxData.length; j++) {
          if (fxData[j].t >= move.startTime) { fxStartIdx = j; break; }
        }
        if (fxStartIdx < 0 || fxStartIdx >= fxData.length - 3) continue;

        // Look for FX reaction in next 1-10 minutes
        const fxStartPrice = fxData[fxStartIdx].c;
        let maxReaction = 0, reactionBar = 0;

        for (let k = 1; k <= Math.min(10, fxData.length - fxStartIdx - 1); k++) {
          const fxPips = (fxData[fxStartIdx + k].c - fxStartPrice) * mult;
          // For USD pairs where USD is quote (EUR_USD), up macro = up FX
          // For USD pairs where USD is base (USD_JPY), up macro = down FX
          const isUsdBase = pair.startsWith("USD");
          const expectedDir = isUsdBase ? -fxPips : fxPips;
          const aligned = move.direction === "up" ? expectedDir > 0 : expectedDir < 0;

          if (aligned && Math.abs(fxPips) > Math.abs(maxReaction)) {
            maxReaction = fxPips;
            reactionBar = k;
          }
        }

        if (reactionBar > 0) {
          latencyMap.push({
            macroAsset: macroLabel,
            fxPair: pair,
            macroDirection: move.direction,
            macroPctMove: move.pctMove,
            fxReactionPips: Math.round(maxReaction * 10) / 10,
            lagMinutes: reactionBar,
            macroTime: new Date(move.startTime).toISOString(),
          });
        }
      }
    }

    // Detect moves and measure lags
    const spyMoves = detectMoves(spyCandles, "SPY");
    const btcMoves = detectMoves(btcCandles, "BTC");

    for (const pair of FX_PAIRS) {
      if (!fxCandles[pair]?.length) continue;
      measureLag(spyMoves, fxCandles[pair], pair, "SPY");
      measureLag(btcMoves, fxCandles[pair], pair, "BTC");
    }

    // 5. Aggregate average lags per pair
    const avgLags: Record<string, { spyLag: number; btcLag: number; spySamples: number; btcSamples: number }> = {};
    for (const entry of latencyMap) {
      if (!avgLags[entry.fxPair]) avgLags[entry.fxPair] = { spyLag: 0, btcLag: 0, spySamples: 0, btcSamples: 0 };
      const a = avgLags[entry.fxPair];
      if (entry.macroAsset === "SPY") { a.spyLag += entry.lagMinutes; a.spySamples++; }
      if (entry.macroAsset === "BTC") { a.btcLag += entry.lagMinutes; a.btcSamples++; }
    }

    const summary = Object.entries(avgLags).map(([pair, a]) => ({
      pair,
      avgSpyLagMinutes: a.spySamples > 0 ? Math.round((a.spyLag / a.spySamples) * 10) / 10 : null,
      avgBtcLagMinutes: a.btcSamples > 0 ? Math.round((a.btcLag / a.btcSamples) * 10) / 10 : null,
      spySamples: a.spySamples,
      btcSamples: a.btcSamples,
    }));

    // Persist to sovereign_memory
    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "cross_asset_latency",
        memory_key: "latency_map",
        payload: { summary, rawEvents: latencyMap.slice(0, 50), spyMoves: spyMoves.length, btcMoves: btcMoves.length, updatedAt: new Date().toISOString() },
        relevance_score: 1.0,
        created_by: "cross-asset-latency",
      },
      { onConflict: "memory_type,memory_key" }
    );

    return new Response(JSON.stringify({
      summary,
      totalEvents: latencyMap.length,
      spyMovesDetected: spyMoves.length,
      btcMovesDetected: btcMoves.length,
      lookbackBars,
      recentEvents: latencyMap.slice(0, 20),
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
