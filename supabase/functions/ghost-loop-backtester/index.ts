// ghost-loop-backtester: Recursive backtester against last 4h of OANDA order book movements
// Tests if shadow agent strategies would have been stop-hunted by retail cluster sweeps
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
    const slPips = body.sl_pips ?? 15;
    const tpPips = body.tp_pips ?? 30;
    const lookbackHours = body.lookback_hours ?? 4;

    const mult = JPY_PAIRS.includes(pair) ? 100 : 10000;
    const pipSize = 1 / mult;

    // 1. Fetch recent 1-min candles for the lookback period
    const barCount = lookbackHours * 60;
    const candleRes = await fetch(
      `${baseUrl}/v3/instruments/${pair}/candles?granularity=M1&count=${Math.min(barCount, 500)}`,
      { headers: { Authorization: `Bearer ${oandaToken}` } }
    );

    if (!candleRes.ok) {
      return new Response(JSON.stringify({ error: `Candle fetch failed: ${candleRes.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candleData = await candleRes.json();
    const candles = (candleData.candles || []).filter((c: any) => c.complete).map((c: any) => ({
      time: c.time,
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
    }));

    // 2. Fetch current stop clusters from market_liquidity_map
    const { data: liquidityData } = await supabase
      .from("market_liquidity_map")
      .select("top_stop_clusters, wall_of_pain_price, wall_of_pain_type, current_price")
      .eq("currency_pair", pair)
      .limit(1);

    const stopClusters = (liquidityData?.[0]?.top_stop_clusters as any[]) || [];
    const wallOfPain = liquidityData?.[0]?.wall_of_pain_price;

    // 3. Simulate entries every N bars and check if stop-hunted
    const entryInterval = 5; // Try entry every 5 minutes
    const simulations: any[] = [];
    let wins = 0, losses = 0, stopHunted = 0;

    for (let i = 0; i < candles.length - 20; i += entryInterval) {
      const entryCandle = candles[i];
      const entryPrice = entryCandle.c;

      const sl = direction === "long"
        ? entryPrice - slPips * pipSize
        : entryPrice + slPips * pipSize;
      const tp = direction === "long"
        ? entryPrice + tpPips * pipSize
        : entryPrice - tpPips * pipSize;

      // Check if SL is near a stop cluster (within 3 pips)
      const nearStopCluster = stopClusters.some((sc: any) => {
        const clusterPrice = parseFloat(sc.price);
        const distPips = Math.abs(sl - clusterPrice) * mult;
        return distPips < 3;
      });

      // Walk forward through candles to see outcome
      let outcome = "open";
      let exitBar = 0;
      let exitPrice = entryPrice;
      let maePrice = entryPrice;

      for (let j = i + 1; j < Math.min(i + 60, candles.length); j++) {
        const c = candles[j];

        // Track MAE
        if (direction === "long") {
          if (c.l < maePrice) maePrice = c.l;
          if (c.l <= sl) { outcome = "stopped"; exitPrice = sl; exitBar = j - i; break; }
          if (c.h >= tp) { outcome = "target"; exitPrice = tp; exitBar = j - i; break; }
        } else {
          if (c.h > maePrice) maePrice = c.h;
          if (c.h >= sl) { outcome = "stopped"; exitPrice = sl; exitBar = j - i; break; }
          if (c.l <= tp) { outcome = "target"; exitPrice = tp; exitBar = j - i; break; }
        }
      }

      if (outcome === "open") {
        // Expired without hitting SL or TP
        const lastCandle = candles[Math.min(i + 59, candles.length - 1)];
        exitPrice = lastCandle.c;
        const pnl = direction === "long"
          ? (exitPrice - entryPrice) * mult
          : (entryPrice - exitPrice) * mult;
        outcome = pnl > 0 ? "expired_profit" : "expired_loss";
        exitBar = Math.min(59, candles.length - i - 1);
      }

      const pnlPips = direction === "long"
        ? (exitPrice - entryPrice) * mult
        : (entryPrice - exitPrice) * mult;

      const maePips = direction === "long"
        ? (entryPrice - maePrice) * mult
        : (maePrice - entryPrice) * mult;

      if (outcome === "target" || outcome === "expired_profit") wins++;
      else losses++;
      if (outcome === "stopped" && nearStopCluster) stopHunted++;

      simulations.push({
        entryTime: entryCandle.time,
        entryPrice: entryPrice.toFixed(JPY_PAIRS.includes(pair) ? 3 : 5),
        exitPrice: exitPrice.toFixed(JPY_PAIRS.includes(pair) ? 3 : 5),
        outcome,
        pnlPips: Math.round(pnlPips * 10) / 10,
        maePips: Math.round(maePips * 10) / 10,
        exitBar,
        nearStopCluster,
        stopHunted: outcome === "stopped" && nearStopCluster,
      });
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0;
    const stopHuntRate = totalTrades > 0 ? Math.round((stopHunted / totalTrades) * 1000) / 10 : 0;
    const netPips = simulations.reduce((s, t) => s + t.pnlPips, 0);
    const avgPnl = totalTrades > 0 ? Math.round((netPips / totalTrades) * 10) / 10 : 0;

    const recommendation = stopHuntRate > 30 ? "REJECT_SL_PLACEMENT"
      : winRate < 35 ? "REJECT_STRATEGY"
      : winRate > 55 ? "DEPLOY"
      : "REFINE";

    const result = {
      pair,
      direction,
      slPips,
      tpPips,
      lookbackHours,
      totalSimulations: totalTrades,
      wins,
      losses,
      winRate,
      netPips: Math.round(netPips * 10) / 10,
      avgPnlPips: avgPnl,
      stopHuntRate,
      stopHuntedCount: stopHunted,
      recommendation,
      wallOfPainPrice: wallOfPain,
      stopClustersChecked: stopClusters.length,
      recentSimulations: simulations.slice(-10),
      timestamp: new Date().toISOString(),
    };

    // Persist
    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "ghost_loop_result",
        memory_key: `${pair}_${direction}`,
        payload: result,
        relevance_score: recommendation === "DEPLOY" ? 1.0 : 0.5,
        created_by: "ghost-loop-backtester",
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
