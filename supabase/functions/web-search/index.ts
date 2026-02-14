// ═══════════════════════════════════════════════════════════════
// WEB SEARCH — Live internet search via Firecrawl
// Breaking news, market events, geopolitical intelligence
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, limit, tbs } = await req.json();

    if (!query) {
      return json({ success: false, error: "query is required" }, 400);
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return json({ success: false, error: "Firecrawl not configured" }, 500);
    }

    console.log("[WEB-SEARCH] Searching:", query);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: limit || 5,
        tbs: tbs || "qdr:d", // default: past day
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[WEB-SEARCH] Firecrawl error:", data);
      return json({ success: false, error: data.error || `HTTP ${response.status}` }, response.status);
    }

    // Summarize results for the AI
    const results = (data.data || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      content: r.markdown?.slice(0, 500), // first 500 chars of content
    }));

    return json({
      success: true,
      query,
      results,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[WEB-SEARCH] Error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
