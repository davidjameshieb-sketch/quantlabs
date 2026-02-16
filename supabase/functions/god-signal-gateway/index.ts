// God Signal Push Gateway — NLP Scraper for Big 5 FX Desk Research
// Scrapes JP Morgan, Goldman Sachs, Citi, Barclays, Deutsche Bank FX research
// via Firecrawl search, then analyzes with Gemini for institutional flow sentiment.
// Results persisted to sovereign_memory as "god_signal" type.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BIG5_QUERIES = [
  { desk: "JPMorgan", query: "JP Morgan FX outlook currency forecast" },
  { desk: "Goldman Sachs", query: "Goldman Sachs forex currency trade recommendation" },
  { desk: "Citi", query: "Citi FX strategy currency forecast" },
  { desk: "Barclays", query: "Barclays FX research currency outlook" },
  { desk: "Deutsche Bank", query: "Deutsche Bank forex strategy currency view" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { desks, timeFilter } = body as { desks?: string[]; timeFilter?: string };

    // Filter desks if specified
    const targetDesks = desks
      ? BIG5_QUERIES.filter(d => desks.some(t => d.desk.toLowerCase().includes(t.toLowerCase())))
      : BIG5_QUERIES;

    const tbs = timeFilter || "qdr:d"; // default: past day
    const allSignals: any[] = [];

    // Step 1: Scrape each desk's research via Firecrawl search
    for (const desk of targetDesks) {
      try {
        console.log(`[GOD-SIGNAL] Searching: ${desk.desk}`);
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: desk.query,
            limit: 5,
            tbs,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        if (!searchRes.ok) {
          console.warn(`[GOD-SIGNAL] Firecrawl search failed for ${desk.desk}: ${searchRes.status}`);
          allSignals.push({ desk: desk.desk, error: `Search failed: ${searchRes.status}`, results: [] });
          continue;
        }

        const searchData = await searchRes.json();
        const results = searchData.data || searchData.results || [];

        // Aggregate markdown content for NLP
        const contentChunks = results
          .slice(0, 3)
          .map((r: any) => {
            const title = r.title || r.metadata?.title || "Untitled";
            const content = r.markdown || r.description || "";
            return `## ${title}\n${content.slice(0, 2000)}`;
          })
          .join("\n\n---\n\n");

        allSignals.push({
          desk: desk.desk,
          resultCount: results.length,
          titles: results.slice(0, 5).map((r: any) => r.title || r.metadata?.title || ""),
          contentPreview: contentChunks.slice(0, 500),
          rawContent: contentChunks,
        });
      } catch (err) {
        console.warn(`[GOD-SIGNAL] Error scraping ${desk.desk}:`, err);
        allSignals.push({ desk: desk.desk, error: (err as Error).message, results: [] });
      }
    }

    // Step 2: NLP Analysis via Gemini
    const combinedContent = allSignals
      .filter(s => s.rawContent)
      .map(s => `### ${s.desk} Research\n${s.rawContent}`)
      .join("\n\n===\n\n");

    let nlpAnalysis: any = null;
    if (combinedContent.length > 100) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are an institutional FX analyst. Analyze research notes from major bank trading desks and extract:
1. Overall USD bias (bullish/bearish/neutral) with confidence 0-100
2. Top 3 actionable FX trade ideas with pair, direction, conviction (high/medium/low)
3. Key risk events mentioned
4. Consensus vs contrarian positioning signals
5. Any cross-asset signals (yields, equities, commodities) affecting FX

Respond in valid JSON with this structure:
{
  "usdBias": "bullish|bearish|neutral",
  "usdConfidence": 0-100,
  "tradeIdeas": [{ "pair": "EUR/USD", "direction": "short", "conviction": "high", "rationale": "..." }],
  "riskEvents": ["..."],
  "consensusSignals": ["..."],
  "contrarianSignals": ["..."],
  "crossAssetNotes": "...",
  "summary": "..."
}`,
              },
              {
                role: "user",
                content: `Analyze these Big 5 FX desk research notes from the past ${tbs === "qdr:h" ? "hour" : tbs === "qdr:d" ? "day" : "week"}:\n\n${combinedContent.slice(0, 12000)}`,
              },
            ],
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content || "";
          // Extract JSON from response
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { nlpAnalysis = JSON.parse(jsonMatch[0]); } catch { nlpAnalysis = { rawResponse: raw }; }
          } else {
            nlpAnalysis = { rawResponse: raw };
          }
        } else {
          console.warn(`[GOD-SIGNAL] AI analysis failed: ${aiRes.status}`);
        }
      } catch (err) {
        console.warn("[GOD-SIGNAL] AI analysis error:", err);
      }
    }

    // Step 3: Persist to sovereign_memory
    const godSignalPayload = {
      desks: allSignals.map(s => ({
        desk: s.desk,
        resultCount: s.resultCount || 0,
        titles: s.titles || [],
        error: s.error || null,
      })),
      nlpAnalysis,
      timeFilter: tbs,
      scrapedAt: new Date().toISOString(),
    };

    const { error: memErr } = await supabase.from("sovereign_memory").upsert({
      memory_key: "god_signal_latest",
      memory_type: "god_signal",
      payload: godSignalPayload,
      relevance_score: 1.0,
      created_by: "god-signal-gateway",
      updated_at: new Date().toISOString(),
    }, { onConflict: "memory_type,memory_key" });

    if (memErr) console.warn("[GOD-SIGNAL] Memory persist error:", memErr);

    // Also log to gate_bypasses for dashboard transparency
    await supabase.from("gate_bypasses").insert({
      gate_id: `GOD_SIGNAL:big5_scan_${new Date().toISOString().slice(0, 13)}`,
      reason: `Big 5 FX Scan: ${allSignals.filter(s => !s.error).length}/${targetDesks.length} desks scraped. USD bias: ${nlpAnalysis?.usdBias || "unknown"} (${nlpAnalysis?.usdConfidence || 0}%). Top idea: ${nlpAnalysis?.tradeIdeas?.[0]?.pair || "none"} ${nlpAnalysis?.tradeIdeas?.[0]?.direction || ""}`,
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      created_by: "god-signal-gateway",
    });

    console.log(`[GOD-SIGNAL] Scan complete: ${allSignals.filter(s => !s.error).length}/${targetDesks.length} desks, NLP: ${nlpAnalysis ? "OK" : "SKIPPED"}`);

    // Remove rawContent before sending response
    const cleanSignals = allSignals.map(({ rawContent, ...rest }) => rest);

    return new Response(
      JSON.stringify({
        desksScraped: allSignals.filter(s => !s.error).length,
        totalDesks: targetDesks.length,
        signals: cleanSignals,
        nlpAnalysis,
        timeFilter: tbs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[GOD-SIGNAL] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
