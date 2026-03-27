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

const SYSTEM_PROMPT = `You are an institutional-grade quantitative analyst AI built for a boutique hedge fund. Your objective is to identify highly asymmetrical, high-conviction small-cap equities that are primed for explosive institutional repricing.

ABSOLUTE EXCLUSIONS — Never suggest ANY of these:
- Pharmaceutical companies, biotech, drug development, clinical trials
- Pre-revenue companies of any kind
- SPACs, blank-check companies, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- Any company with "Therapeutics", "Pharma", "Bio", "Sciences" in its name
- OTC/Pink Sheet stocks — NASDAQ or NYSE listed ONLY

You are hunting for REAL businesses with REAL revenue, REAL products that customers already buy, and structural tailwinds that make institutional repricing inevitable.

MANDATORY HARD FLOORS (Do not suggest any ticker that violates these):
1. Market Capitalization: Must be between $75M and $500M.
2. Liquidity: Average Daily Volume (ADV) must be strictly greater than 500,000 shares.
3. Institutional Footprint: Institutional ownership must be between 2% and 20%.
4. Operational Reality: Trailing Twelve Month (TTM) Revenue must be strictly greater than $15M.
5. Exchange: Must be listed on NYSE, NASDAQ, or NYSE American. No OTC.
6. Sector: Must NOT be Biotech, Pharma, or Healthcare R&D.

PRIORITY SECTORS (focus here):
- Defense contractors & military tech suppliers
- Domestic energy: oil services, uranium, nuclear, rare earth miners
- Border/homeland security technology
- American manufacturing & reshoring beneficiaries
- Infrastructure, construction, building materials
- AI infrastructure picks-and-shovels (data centers, cooling, chips)
- Satellite, space defense, communications
- Fintech & crypto infrastructure (exchanges, custody, compliance)
- Agriculture technology & food security
- Cybersecurity for critical infrastructure
- Logistics, shipping, supply chain tech

If a stock passes the hard floors, categorize it into one of these "Shark Setups":
- POLITICAL_CATALYST: First-movers benefiting directly from shifting government policies, tariffs, border security, defense spending, or domestic energy mandates.
- PROFIT_CROSSOVER: Companies crossing from negative to positive cash flow on a structural tailwind, catching algorithmic screeners off guard.
- SHORT_SQUEEZE: Low float stocks with High Short Interest (>15%) that have a legitimate fundamental catalyst capable of triggering margin calls.
- IP_HOSTAGE: Companies holding Tier-1 patents, contracts, assets, or technology that makes them an immediate acquisition target for a larger player.

For each stock provide:
- ticker: Stock symbol
- company_name: Full company name
- estimated_market_cap: Approximate market cap (e.g. "$125M")
- price_range: Current approximate price range
- sector: Industry sector (NEVER pharma/biotech)
- setup_type: One of POLITICAL_CATALYST, PROFIT_CROSSOVER, SHORT_SQUEEZE, IP_HOSTAGE
- political_theme: The specific current political/structural catalyst
- the_thesis: A 2-sentence aggressive, institutional-grade explanation
- adv_estimate: Estimated average daily volume
- institutional_ownership_pct: Estimated institutional ownership percentage
- ttm_revenue: Estimated trailing twelve month revenue
- short_interest_pct: Estimated short interest percentage (if applicable)
- risk_profile: MEDIUM or HIGH only (no EXTREME — we excluded those sectors)
- catalyst: The specific near-term catalyst
- catalyst_timeline: When the catalyst hits
- bull_case: Best case scenario (1 sentence)
- bear_case: Worst case scenario (1 sentence)
- strategy: Specific entry strategy
- why_not_zero: One sentence on why this company won't go to zero (real revenue, real contracts, real assets)

Return EXACTLY 15-20 stocks as a JSON array. Every pick MUST pass ALL hard floors. ZERO pharma/biotech. No exceptions.`;

const USER_PROMPT = `Scan the current market for institutional-grade small-cap shark setups. Today's date is ${new Date().toISOString().slice(0, 10)}.

HARD FLOORS — reject anything that fails:
- Market cap $75M-$500M
- ADV > 500,000 shares
- Institutional ownership 2%-20%
- TTM Revenue > $15M
- Listed on NYSE or NASDAQ ONLY
- ZERO pharma, biotech, therapeutics, drug companies

PRIORITY SECTORS (real businesses with real products):
1. Defense contractors & military tech suppliers
2. Energy independence — oil services, uranium, nuclear, rare earth mining
3. Border security & homeland security technology
4. American manufacturing reshoring / tariff beneficiaries
5. Infrastructure, construction, building materials
6. AI infrastructure picks-and-shovels (data centers, cooling, power)
7. Space, satellite, communications defense
8. Fintech, crypto infrastructure, digital asset compliance
9. Agriculture technology & food security
10. Cybersecurity for critical infrastructure
11. Logistics, shipping, supply chain automation
12. Deregulation plays in banking & energy

Categorize each into: POLITICAL_CATALYST, PROFIT_CROSSOVER, SHORT_SQUEEZE, or IP_HOSTAGE.

For EVERY pick explain why it won't go to zero (real revenue, real contracts, real assets).

Return 15-20 results as a JSON array with real ticker symbols and real companies. Every pick must be defensible. ZERO pharma.`;

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
              name: "report_shark_setups",
              description: "Report institutional-grade small-cap shark setups",
              parameters: {
                type: "object",
                properties: {
                  stocks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ticker: { type: "string" },
                        company_name: { type: "string" },
                        estimated_market_cap: { type: "string" },
                        price_range: { type: "string" },
                        sector: { type: "string" },
                        setup_type: { type: "string", enum: ["POLITICAL_CATALYST", "PROFIT_CROSSOVER", "SHORT_SQUEEZE", "IP_HOSTAGE"] },
                        political_theme: { type: "string" },
                        the_thesis: { type: "string" },
                        adv_estimate: { type: "string" },
                        institutional_ownership_pct: { type: "string" },
                        ttm_revenue: { type: "string" },
                        short_interest_pct: { type: "string" },
                        risk_profile: { type: "string", enum: ["MEDIUM", "HIGH", "EXTREME"] },
                        catalyst: { type: "string" },
                        catalyst_timeline: { type: "string" },
                        bull_case: { type: "string" },
                        bear_case: { type: "string" },
                        strategy: { type: "string" },
                      },
                      required: ["ticker", "company_name", "estimated_market_cap", "setup_type", "political_theme", "the_thesis", "risk_profile", "catalyst", "bull_case", "bear_case", "strategy"],
                    },
                  },
                  market_context: { type: "string", description: "Brief overview of current macro environment for small-cap shark setups" },
                },
                required: ["stocks", "market_context"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_shark_setups" } },
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
    console.log(`[PENNY-SCANNER] Found ${result.stocks?.length || 0} shark setups`);

    const setupEmoji: Record<string, string> = {
      POLITICAL_CATALYST: "🏛️",
      PROFIT_CROSSOVER: "📈",
      SHORT_SQUEEZE: "🩳🔥",
      IP_HOSTAGE: "🔐",
    };

    const enrichedStocks = (result.stocks || []).map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      setup_emoji: setupEmoji[s.setup_type] || "💰",
      risk_color: s.risk_profile === "MEDIUM" ? "yellow" : s.risk_profile === "HIGH" ? "orange" : "red",
      theme_emoji: getThemeEmoji(s.political_theme),
    }));

    return json({
      stocks: enrichedStocks,
      market_context: result.market_context || "",
      scan_timestamp: new Date().toISOString(),
      total_picks: enrichedStocks.length,
      setups_covered: [...new Set(enrichedStocks.map((s: any) => s.setup_type))],
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
