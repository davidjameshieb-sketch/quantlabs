// cross-venue-dom: Cross-Venue DOM Aggregator (LMAX Depth Proxy)
// Synthesizes depth-of-market from OANDA order book + position book
// Creates a pseudo-institutional DOM by inferring where large orders cluster
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "EUR_GBP"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    const domProfiles: Record<string, any> = {};

    for (const pair of PAIRS) {
      try {
        // Fetch order book and position book in parallel
        const [obRes, pbRes] = await Promise.all([
          fetch(`${baseUrl}/v3/instruments/${pair}/orderBook`, {
            headers: { Authorization: `Bearer ${oandaToken}` },
          }),
          fetch(`${baseUrl}/v3/instruments/${pair}/positionBook`, {
            headers: { Authorization: `Bearer ${oandaToken}` },
          }),
        ]);

        if (!obRes.ok || !pbRes.ok) continue;

        const obData = await obRes.json();
        const pbData = await pbRes.json();

        const ob = obData.orderBook;
        const pb = pbData.positionBook;
        if (!ob?.buckets || !pb?.buckets) continue;

        const currentPrice = parseFloat(ob.price);
        const isJpy = pair.includes("JPY");
        const mult = isJpy ? 100 : 10000;

        // Analyze order book for pending order walls
        const orderWalls: { price: number; side: string; pct: number; pipsDist: number }[] = [];
        for (const b of ob.buckets) {
          const price = parseFloat(b.price);
          const longPct = parseFloat(b.longCountPercent);
          const shortPct = parseFloat(b.shortCountPercent);
          const pipsDist = Math.abs(price - currentPrice) * mult;

          // Only within 50 pips
          if (pipsDist > 50) continue;

          // Significant order cluster = > 1.5% of total
          if (longPct > 1.5) {
            orderWalls.push({ price, side: "BUY_LIMIT", pct: longPct, pipsDist: Math.round(pipsDist * 10) / 10 });
          }
          if (shortPct > 1.5) {
            orderWalls.push({ price, side: "SELL_LIMIT", pct: shortPct, pipsDist: Math.round(pipsDist * 10) / 10 });
          }
        }

        // Analyze position book for institutional-size positioning
        const positionClusters: { price: number; netBias: string; longPct: number; shortPct: number; imbalance: number }[] = [];
        let totalLong = 0, totalShort = 0;

        for (const b of pb.buckets) {
          const longPct = parseFloat(b.longCountPercent);
          const shortPct = parseFloat(b.shortCountPercent);
          totalLong += longPct;
          totalShort += shortPct;

          const price = parseFloat(b.price);
          const pipsDist = Math.abs(price - currentPrice) * mult;
          if (pipsDist > 30) continue;

          const imbalance = Math.abs(longPct - shortPct);
          if (imbalance > 0.8) {
            positionClusters.push({
              price,
              netBias: longPct > shortPct ? "LONG" : "SHORT",
              longPct: Math.round(longPct * 100) / 100,
              shortPct: Math.round(shortPct * 100) / 100,
              imbalance: Math.round(imbalance * 100) / 100,
            });
          }
        }

        // Sort by significance
        orderWalls.sort((a, b) => b.pct - a.pct);
        positionClusters.sort((a, b) => b.imbalance - a.imbalance);

        // Synthetic DOM depth score (0-100)
        // High = lots of resting orders = deep market = safe execution
        // Low = thin book = vulnerable to slippage
        const totalOrderDensity = orderWalls.reduce((s, w) => s + w.pct, 0);
        const depthScore = Math.min(100, Math.round(totalOrderDensity * 8));

        // Identify the "Wall of Pain" — price where max pain for retail
        const biggestWall = orderWalls[0] || null;

        // Net retail positioning
        const retailBias = totalLong > totalShort ? "NET_LONG" : "NET_SHORT";
        const retailImbalance = Math.round(Math.abs(totalLong - totalShort) * 10) / 10;

        domProfiles[pair] = {
          currentPrice,
          depthScore,
          retailBias,
          retailImbalance,
          topOrderWalls: orderWalls.slice(0, 5),
          topPositionClusters: positionClusters.slice(0, 5),
          wallOfPain: biggestWall ? {
            price: biggestWall.price,
            side: biggestWall.side,
            strength: biggestWall.pct,
            pipsDist: biggestWall.pipsDist,
          } : null,
          bookTimestamp: ob.time,
        };
      } catch { /* skip */ }
    }

    // Persist
    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "cross_venue_dom",
        memory_key: "aggregated_depth",
        payload: {
          profiles: domProfiles,
          pairsScanned: Object.keys(domProfiles).length,
          updatedAt: new Date().toISOString(),
        },
        relevance_score: 1.0,
        created_by: "cross-venue-dom",
      },
      { onConflict: "memory_type,memory_key" }
    );

    return new Response(JSON.stringify({
      profiles: domProfiles,
      pairsScanned: Object.keys(domProfiles).length,
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
