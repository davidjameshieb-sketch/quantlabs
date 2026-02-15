// synthetic-dark-pool: Cross-broker sentiment aggregator
// Combines OANDA Position Book + IG Client Sentiment + MyFXBook Community Outlook
// Produces a "Consensus Heatmap" for identifying true stop-hunt targets
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAIRS_MAP: Record<string, { ig: string; myfx: string; oanda: string }> = {
  EUR_USD: { ig: "EURUSD", myfx: "EURUSD", oanda: "EUR_USD" },
  GBP_USD: { ig: "GBPUSD", myfx: "GBPUSD", oanda: "GBP_USD" },
  USD_JPY: { ig: "USDJPY", myfx: "USDJPY", oanda: "USD_JPY" },
  AUD_USD: { ig: "AUDUSD", myfx: "AUDUSD", oanda: "AUD_USD" },
  USD_CAD: { ig: "USDCAD", myfx: "USDCAD", oanda: "USD_CAD" },
  EUR_GBP: { ig: "EURGBP", myfx: "EURGBP", oanda: "EUR_GBP" },
  NZD_USD: { ig: "NZDUSD", myfx: "NZDUSD", oanda: "NZD_USD" },
  EUR_JPY: { ig: "EURJPY", myfx: "EURJPY", oanda: "EUR_JPY" },
  GBP_JPY: { ig: "GBPJPY", myfx: "GBPJPY", oanda: "GBP_JPY" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  try {
    const body = await req.json().catch(() => ({}));
    const pairs = body.pairs ?? Object.keys(PAIRS_MAP);

    const results: any[] = [];

    for (const pair of pairs) {
      const mapping = PAIRS_MAP[pair];
      if (!mapping) continue;

      const sources: { source: string; longPct: number; shortPct: number; raw?: any }[] = [];

      // Source 1: OANDA Position Book
      try {
        const res = await fetch(
          `${baseUrl}/v3/instruments/${pair}/positionBook`,
          { headers: { Authorization: `Bearer ${oandaToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const pb = data.positionBook;
          if (pb?.buckets) {
            let totalLong = 0, totalShort = 0;
            for (const b of pb.buckets) {
              totalLong += parseFloat(b.longCountPercent);
              totalShort += parseFloat(b.shortCountPercent);
            }
            // Normalize — OANDA gives % per bucket, sum to ~100 each side
            const total = totalLong + totalShort;
            sources.push({
              source: "OANDA",
              longPct: Math.round((totalLong / total) * 1000) / 10,
              shortPct: Math.round((totalShort / total) * 1000) / 10,
            });
          }
        }
      } catch { /* skip */ }

      // Source 2: IG Client Sentiment (scrape via Firecrawl)
      if (firecrawlKey) {
        try {
          const igUrl = `https://www.ig.com/en/forex/markets-forex/${mapping.ig.toLowerCase()}`;
          const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: igUrl,
              formats: ["markdown"],
              onlyMainContent: true,
              waitFor: 3000,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const md = data.data?.markdown || data.markdown || "";
            // Parse IG sentiment from markdown — look for "X% of client accounts are long"
            const longMatch = md.match(/(\d+(?:\.\d+)?)%\s*(?:of\s+)?(?:client\s+)?(?:accounts?\s+)?(?:are\s+)?long/i);
            const shortMatch = md.match(/(\d+(?:\.\d+)?)%\s*(?:of\s+)?(?:client\s+)?(?:accounts?\s+)?(?:are\s+)?short/i);
            if (longMatch || shortMatch) {
              const lp = longMatch ? parseFloat(longMatch[1]) : 0;
              const sp = shortMatch ? parseFloat(shortMatch[1]) : 0;
              if (lp + sp > 50) { // sanity check
                sources.push({ source: "IG", longPct: lp, shortPct: sp });
              }
            }
          }
        } catch { /* skip */ }
      }

      // Source 3: MyFXBook Community Outlook (scrape via Firecrawl)
      if (firecrawlKey) {
        try {
          const myfxUrl = `https://www.myfxbook.com/community/outlook/${mapping.myfx}`;
          const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: myfxUrl,
              formats: ["markdown"],
              onlyMainContent: true,
              waitFor: 3000,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const md = data.data?.markdown || data.markdown || "";
            // Parse MyFXBook — look for long/short percentages
            const longMatch = md.match(/(?:long|buy)[:\s]*(\d+(?:\.\d+)?)%/i);
            const shortMatch = md.match(/(?:short|sell)[:\s]*(\d+(?:\.\d+)?)%/i);
            if (longMatch || shortMatch) {
              const lp = longMatch ? parseFloat(longMatch[1]) : 0;
              const sp = shortMatch ? parseFloat(shortMatch[1]) : 0;
              if (lp + sp > 50) {
                sources.push({ source: "MyFXBook", longPct: lp, shortPct: sp });
              }
            }
          }
        } catch { /* skip */ }
      }

      // Compute consensus
      if (sources.length === 0) {
        results.push({ pair, sources: 0, consensus: null, error: "no data" });
        continue;
      }

      const avgLong = sources.reduce((s, x) => s + x.longPct, 0) / sources.length;
      const avgShort = sources.reduce((s, x) => s + x.shortPct, 0) / sources.length;
      const fragmentation = sources.length > 1
        ? Math.round(Math.sqrt(sources.reduce((s, x) => s + Math.pow(x.longPct - avgLong, 2), 0) / sources.length) * 10) / 10
        : 0;

      // True consensus = all brokers agree on direction
      const allLongBiased = sources.every(s => s.longPct > 55);
      const allShortBiased = sources.every(s => s.shortPct > 55);
      const consensusDirection = allLongBiased ? "retail_long" : allShortBiased ? "retail_short" : "fragmented";

      // Predatory signal = contrarian to consensus
      const predatoryDirection = consensusDirection === "retail_long" ? "short"
        : consensusDirection === "retail_short" ? "long" : "neutral";

      const consensus = {
        avgLongPct: Math.round(avgLong * 10) / 10,
        avgShortPct: Math.round(avgShort * 10) / 10,
        fragmentation,
        consensusDirection,
        predatoryDirection,
        strength: Math.round(Math.abs(avgLong - avgShort) * 10) / 10,
        sourceCount: sources.length,
      };

      results.push({ pair, sources: sources.length, sourceData: sources, consensus });

      // Persist to sovereign_memory
      await supabase.from("sovereign_memory").upsert(
        {
          memory_type: "synthetic_dark_pool",
          memory_key: pair,
          payload: { ...consensus, sourceData: sources, updatedAt: new Date().toISOString() },
          relevance_score: consensus.strength > 20 ? 1.0 : 0.5,
          created_by: "synthetic-dark-pool",
        },
        { onConflict: "memory_type,memory_key" }
      );
    }

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
