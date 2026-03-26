// ═══════════════════════════════════════════════════════════════
// PENNY STOCK JACKPOT SCANNER — AI-Powered Political Catalyst Finder
// Uses Gemini AI to identify small-cap stocks with real products,
// social buzz, and political tailwinds that institutions can't ignore
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You are an elite penny stock research analyst specializing in finding "jackpot" micro-cap and small-cap stocks. Your edge: identifying companies that are real businesses with real products, growing social followings, and political tailwinds that will force institutional attention.

STRICT CRITERIA for every stock you recommend:
1. REAL COMPANY: Must have actual revenue, real products/services, verifiable customers. No shell companies, no SPACs, no pre-revenue biotech gambles.
2. PRICE: Under $10 per share (true penny stocks under $5 preferred, but up to $10 for quality).
3. SOCIAL BUZZ: Must have measurable and growing social media presence — Reddit mentions, Twitter/X following, StockTwits activity, YouTube coverage. The "retail army" is watching.
4. POLITICAL CATALYST: Must benefit from CURRENT political themes and government policy direction:
   - Defense/military spending increases
   - Energy independence (oil, gas, nuclear, rare earth minerals)
   - Border security & surveillance tech
   - Reshoring/American manufacturing
   - Infrastructure spending
   - Cryptocurrency/blockchain regulatory clarity
   - AI/tech sovereignty
   - Space & satellite defense
   - Agriculture & food security
   - Tariff beneficiaries (domestic producers replacing imports)
   - Deregulation plays (banking, energy, pharma)
5. INSTITUTIONAL BLIND SPOT: Market cap too small for big funds BUT growing fast enough they'll be forced to notice within 6-12 months.
6. CATALYST TIMELINE: Must have a near-term catalyst (earnings, contract, political event, regulation) within 1-3 months.

For each stock provide:
- ticker: Stock symbol
- company: Full company name
- price_range: Current approximate price range (e.g. "$2.50 - $3.00")
- market_cap: Approximate market cap
- sector: Industry sector
- political_theme: Which political catalyst applies
- product_description: What they actually make/do (2-3 sentences)
- social_score: 1-10 rating of social media buzz
- catalyst: The specific near-term catalyst
- catalyst_timeline: When the catalyst hits
- risk_level: LOW / MEDIUM / HIGH / EXTREME
- bull_case: Best case scenario (1 sentence)
- bear_case: Worst case scenario (1 sentence)  
- institutional_interest: Signs that smart money is starting to notice
- strategy: Specific entry strategy (limit price, position size advice)

Return EXACTLY 10-15 stocks as a JSON array. Focus on quality over quantity. Every pick must be defensible with real data.`;

const USER_PROMPT = `Scan the current market for penny stock jackpot opportunities. Today's date is ${new Date().toISOString().slice(0, 10)}.

Focus heavily on these current political money flows:
1. Defense stocks benefiting from increased military budgets and global tensions
2. Energy independence plays — domestic oil, gas, nuclear, uranium, rare earth miners
3. Border security technology companies
4. American manufacturing reshoring beneficiaries  
5. Infrastructure & construction material companies
6. Crypto/blockchain companies benefiting from regulatory clarity
7. AI infrastructure (small companies providing picks-and-shovels to the AI boom)
8. Space & satellite defense contractors
9. Tariff winners — domestic producers replacing Chinese imports
10. Deregulation beneficiaries in banking, energy, or pharma

For each stock, verify:
- It has REAL revenue (not pre-revenue)
- It has growing social media following (Reddit, Twitter/X, StockTwits)
- It's under $10/share
- Market cap is too small for major ETFs but growing
- There's a specific catalyst in the next 1-3 months

Return the results as a JSON array with the schema specified. Be specific with real ticker symbols and real companies.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const focusTheme = body.theme || "all";

    let userPrompt = USER_PROMPT;
    if (focusTheme !== "all") {
      userPrompt += `\n\nPRIORITY FOCUS: Give extra weight to stocks in the "${focusTheme}" political theme. At least 5 of your picks should be in this category.`;
    }

    console.log("[PENNY-SCANNER] Calling Gemini AI for penny stock analysis...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_penny_stocks",
              description: "Report the curated list of penny stock jackpot opportunities",
              parameters: {
                type: "object",
                properties: {
                  stocks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ticker: { type: "string" },
                        company: { type: "string" },
                        price_range: { type: "string" },
                        market_cap: { type: "string" },
                        sector: { type: "string" },
                        political_theme: { type: "string" },
                        product_description: { type: "string" },
                        social_score: { type: "number" },
                        catalyst: { type: "string" },
                        catalyst_timeline: { type: "string" },
                        risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "EXTREME"] },
                        bull_case: { type: "string" },
                        bear_case: { type: "string" },
                        institutional_interest: { type: "string" },
                        strategy: { type: "string" },
                      },
                      required: ["ticker", "company", "price_range", "sector", "political_theme", "product_description", "social_score", "catalyst", "risk_level", "bull_case", "bear_case", "strategy"],
                    },
                  },
                  market_context: { type: "string", description: "Brief overview of current political/market environment affecting penny stocks" },
                  scan_timestamp: { type: "string" },
                },
                required: ["stocks", "market_context"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_penny_stocks" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[PENNY-SCANNER] AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return json({ error: "Rate limited — try again in 30 seconds" }, 429);
      }
      if (aiResponse.status === 402) {
        return json({ error: "AI credits exhausted" }, 402);
      }
      return json({ error: "AI analysis failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("[PENNY-SCANNER] No tool call in response");
      return json({ error: "AI did not return structured data" }, 500);
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`[PENNY-SCANNER] Found ${result.stocks?.length || 0} penny stock picks`);

    // Enrich with computed fields
    const enrichedStocks = (result.stocks || []).map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      social_label: s.social_score >= 8 ? "🔥 VIRAL" : s.social_score >= 6 ? "📈 TRENDING" : s.social_score >= 4 ? "👀 WATCHED" : "🔍 UNDER RADAR",
      risk_color: s.risk_level === "LOW" ? "green" : s.risk_level === "MEDIUM" ? "yellow" : s.risk_level === "HIGH" ? "orange" : "red",
      theme_emoji: getThemeEmoji(s.political_theme),
    }));

    return json({
      stocks: enrichedStocks,
      market_context: result.market_context || "",
      scan_timestamp: new Date().toISOString(),
      total_picks: enrichedStocks.length,
      themes_covered: [...new Set(enrichedStocks.map((s: any) => s.political_theme))],
    });
  } catch (err) {
    console.error("[PENNY-SCANNER] Error:", err);
    return json({ error: (err as Error).message || "Scanner failed" }, 500);
  }
});

function getThemeEmoji(theme: string): string {
  const t = (theme || "").toLowerCase();
  if (t.includes("defense") || t.includes("military")) return "🛡️";
  if (t.includes("energy") || t.includes("oil") || t.includes("nuclear") || t.includes("uranium")) return "⚡";
  if (t.includes("border") || t.includes("security")) return "🔒";
  if (t.includes("manufactur") || t.includes("reshoring")) return "🏭";
  if (t.includes("infra")) return "🏗️";
  if (t.includes("crypto") || t.includes("blockchain")) return "₿";
  if (t.includes("ai") || t.includes("artificial")) return "🤖";
  if (t.includes("space") || t.includes("satellite")) return "🚀";
  if (t.includes("tariff")) return "🇺🇸";
  if (t.includes("dereg")) return "📜";
  if (t.includes("agri") || t.includes("food")) return "🌾";
  return "💰";
}
