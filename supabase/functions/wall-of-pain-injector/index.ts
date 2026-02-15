// Wall of Pain Logic Injector
// Background job that parses OANDA OrderBook every 5min and writes
// top_3_stop_clusters per pair into market_liquidity_map table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

const CORE_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "USD_CHF", "EUR_GBP", "EUR_JPY", "GBP_JPY",
];

function getOandaCreds(env: string) {
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  return { apiToken, accountId, host };
}

async function oandaGet(url: string, apiToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const env = Deno.env.get("OANDA_ENV") || "live";
    const { apiToken, accountId, host } = getOandaCreds(env);

    if (!apiToken || !accountId) {
      return new Response(
        JSON.stringify({ error: "OANDA credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let pairsProcessed = 0;
    let errors = 0;

    for (const instrument of CORE_PAIRS) {
      try {
        const data = await oandaGet(`${host}/v3/instruments/${instrument}/orderBook`, apiToken);
        if (!data?.orderBook) {
          errors++;
          continue;
        }

        const ob = data.orderBook;
        const buckets = (ob.buckets || []).map((b: any) => ({
          price: parseFloat(b.price),
          longPct: parseFloat(b.longCountPercent),
          shortPct: parseFloat(b.shortCountPercent),
        }));

        // Calculate averages for cluster detection
        const avgLong = buckets.reduce((s: number, b: any) => s + b.longPct, 0) / (buckets.length || 1);
        const avgShort = buckets.reduce((s: number, b: any) => s + b.shortPct, 0) / (buckets.length || 1);

        // Find significant clusters (>2x average)
        const longClusters = buckets
          .filter((b: any) => b.longPct > avgLong * 2)
          .sort((a: any, b: any) => b.longPct - a.longPct)
          .slice(0, 5);

        const shortClusters = buckets
          .filter((b: any) => b.shortPct > avgShort * 2)
          .sort((a: any, b: any) => b.shortPct - a.shortPct)
          .slice(0, 5);

        // Top 3 stop clusters (combined, sorted by intensity)
        const allClusters = [
          ...longClusters.map((b: any) => ({ price: b.price, type: "long_stop", pct: b.longPct })),
          ...shortClusters.map((b: any) => ({ price: b.price, type: "short_stop", pct: b.shortPct })),
        ].sort((a, b) => b.pct - a.pct).slice(0, 3);

        // Wall of Pain = the single densest cluster
        const wallOfPain = allClusters[0] || null;

        const pair = instrument.replace("_", "/");

        // Upsert into market_liquidity_map
        const { error: upsertError } = await sb
          .from("market_liquidity_map")
          .upsert({
            currency_pair: pair,
            current_price: parseFloat(ob.price),
            top_stop_clusters: allClusters,
            long_clusters: longClusters,
            short_clusters: shortClusters,
            bucket_width: ob.bucketWidth,
            wall_of_pain_price: wallOfPain?.price || null,
            wall_of_pain_type: wallOfPain?.type || null,
            wall_of_pain_pct: wallOfPain?.pct || null,
          }, { onConflict: "currency_pair" });

        if (upsertError) {
          console.error(`[WALL-OF-PAIN] Upsert error for ${pair}:`, upsertError);
          errors++;
        } else {
          pairsProcessed++;
        }
      } catch (pairErr) {
        console.error(`[WALL-OF-PAIN] Error processing ${instrument}:`, pairErr);
        errors++;
      }
    }

    console.log(`[WALL-OF-PAIN] Processed ${pairsProcessed}/${CORE_PAIRS.length} pairs, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        pairsProcessed,
        totalPairs: CORE_PAIRS.length,
        errors,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[WALL-OF-PAIN] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
