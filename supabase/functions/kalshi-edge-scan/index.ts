const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_URL = "https://lovable.dev/api/v3/chat";

const SYSTEM_PROMPT = `You are an elite Kalshi event contract analyst. The user will paste raw text copied from the Kalshi website showing live markets, prices, and events.

Your job:
1. PARSE the pasted text to extract all markets, prices (Yes/No), teams/players, and any other data
2. IDENTIFY EDGES — mispriced contracts where the market price doesn't reflect true probability
3. For each edge found, provide:
   - The market and side (Yes or No)
   - Current price
   - Your estimated fair value
   - Edge size in cents
   - Confidence (HIGH/MEDIUM/LOW)
   - Brief reasoning (1-2 sentences)

Focus on:
- Heavy favorites trading below expected floor (e.g., 90%+ implied but trading at 75¢)
- Late-game situations where outcome is nearly certain but price hasn't caught up
- Arbitrage between related markets (e.g., winner market vs top 10 market)
- Mispriced props based on game context
- "Dead money" — contracts at 1¢ or 99¢ that are essentially settled

Output as structured JSON with this exact format:
{
  "markets_found": number,
  "edges": [
    {
      "market": "string — the event/matchup",
      "side": "Yes" or "No",
      "player_or_team": "string",
      "current_price": number (0-1),
      "fair_value": number (0-1),
      "edge_cents": number,
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "category": "UNDERPRICED_FAVORITE" | "OVERPRICED_UNDERDOG" | "ARBITRAGE" | "DEAD_MONEY" | "MOMENTUM_SHIFT" | "CLOSING_LINE_VALUE",
      "reasoning": "string"
    }
  ],
  "summary": "string — 1-2 sentence overview of the best opportunities",
  "risk_notes": "string — any warnings about correlated positions or liquidity"
}

If the pasted text is unclear or doesn't contain market data, still try your best to parse it. Kalshi copy-paste is often messy with numbers and text jumbled together.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pastedText } = await req.json();

    if (!pastedText || pastedText.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Please paste Kalshi market data to analyze" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI gateway with Gemini 2.5 Flash for speed
    const response = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Here is the raw text I copied from the Kalshi website. Find every edge:\n\n${pastedText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let analysis;
    try {
      // Try direct parse first
      analysis = JSON.parse(content);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        // Last resort: find first { to last }
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
          analysis = JSON.parse(content.substring(start, end + 1));
        } else {
          analysis = { markets_found: 0, edges: [], summary: content, risk_notes: "" };
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, analysis, raw_length: pastedText.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Kalshi edge scan error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
