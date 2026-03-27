// ═══════════════════════════════════════════════════════════════
// VOLATILE GEMS SCANNER — High Volatility + Solid Fundamentals
// Finds stocks with explosive price action backed by real financials,
// scored by financial health and sector growth potential
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You are an elite quantitative equity analyst for a boutique hedge fund specializing in volatile small-cap stocks with ironclad fundamentals.

YOUR MISSION: Find stocks that are KNOWN to be highly volatile in price action — big swings, high beta, dramatic intraday/weekly moves — but whose UNDERLYING BUSINESS is rock-solid with strong financials and a sector outlook that promises explosive growth.

These are the hidden gems: stocks that scare away passive investors with their volatility, creating mispriced entry opportunities for sophisticated traders who understand the fundamentals are bulletproof.

ABSOLUTE EXCLUSIONS — NEVER suggest:
- Pharmaceutical, biotech, drug development, clinical trials companies
- Pre-revenue companies of any kind
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks — NASDAQ or NYSE listed ONLY
- Companies with "Therapeutics", "Pharma", "Bio", "Sciences" in name

MANDATORY HARD FLOORS:
1. Market Cap: UNDER $100M (micro-cap sweet spot: $15M - $100M)
2. Average Daily Volume: > 200,000 shares (must be tradeable)
3. TTM Revenue: > $5M (MUST have real revenue)
4. Must be listed on NYSE, NASDAQ, or NYSE American
5. Must have POSITIVE gross margins (makes money on what it sells)
6. Beta > 1.5 or known for high price volatility

FINANCIAL HEALTH SCORING (score each 0-100):
Evaluate these components and give an overall Financial Health Score:
- revenue_growth_score: Revenue trajectory (growing = higher score)
- gross_margin_score: Gross margin quality (higher margins = higher score)
- debt_health_score: Debt-to-equity and cash position (lower debt = higher score)
- cash_flow_score: Operating cash flow trend (positive/improving = higher score)
- balance_sheet_score: Current ratio, assets vs liabilities
- Overall financial_health_score: Weighted average of above (0-100)

SECTOR GROWTH SCORING (score each sector 0-100):
- sector_growth_score: How explosive is this sector's outlook in the next 12-24 months?
- sector_tailwind: What specific macro/political/structural force is driving growth?
- sector_momentum: Current momentum (accelerating, steady, emerging)

VOLATILITY PROFILE:
- volatility_tag: "EXTREME_SWINGS", "HIGH_BETA", "NEWS_DRIVEN", "MOMENTUM_SURFER"
- avg_weekly_range_pct: Estimated average weekly price range as percentage
- why_volatile: 1-sentence explanation of what causes the wild swings
- why_solid: 1-sentence explanation of why fundamentals are bulletproof despite volatility

SECTORS TO SCAN (real businesses, real products):
1. Defense & Military Tech (drones, cybersecurity, munitions, surveillance)
2. Energy Independence (oil services, uranium, nuclear, rare earth, lithium)
3. AI Infrastructure (data centers, cooling systems, edge computing, chips)
4. Space & Satellite (communications, launch services, earth observation)
5. Cybersecurity (endpoint, OT security, zero trust)
6. Fintech & Crypto Infrastructure (exchanges, custody, compliance, DeFi)
7. American Manufacturing & Reshoring (automation, robotics, materials)
8. Agriculture Tech & Food Security (precision ag, vertical farming, inputs)
9. Infrastructure & Construction (building materials, heavy equipment, IoT)
10. Border Security & Homeland Tech (sensors, drones, surveillance)
11. Logistics & Supply Chain (automation, last-mile, freight tech)
12. Clean Energy Tech (solar, wind components, grid storage, hydrogen)

For EACH stock provide ALL of these fields:
- ticker, company_name, sector, sub_sector
- estimated_market_cap, price_range, avg_daily_volume
- financial_health_score (0-100 overall)
- revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score (each 0-100)
- ttm_revenue, gross_margin_pct, debt_to_equity, cash_position
- sector_growth_score (0-100)
- sector_tailwind, sector_momentum
- volatility_tag, avg_weekly_range_pct, why_volatile, why_solid
- setup_type: POLITICAL_CATALYST, PROFIT_CROSSOVER, SHORT_SQUEEZE, or IP_HOSTAGE
- the_thesis (2-sentence aggressive institutional thesis)
- catalyst, catalyst_timeline
- bull_case, bear_case
- entry_strategy
- why_not_zero (1 sentence — real revenue, contracts, or assets that create a floor)

Return 20-25 stocks as a JSON array. Group mentally by sector. Every pick MUST be under $100M market cap with real revenue. ZERO pharma/biotech.`;

const USER_PROMPT = `Scan the market for VOLATILE small-cap stocks with BULLETPROOF fundamentals. Today is ${new Date().toISOString().slice(0, 10)}.

I want stocks that SWING HARD but won't go to zero because:
- They have REAL revenue (>$5M TTM)
- REAL products customers already buy
- Strong or improving gross margins
- Manageable debt or net cash positions
- Sector tailwinds that make growth inevitable

HARD FLOORS — reject anything that fails:
- Market cap UNDER $100M (sweet spot $15M-$100M)
- ADV > 200,000 shares
- TTM Revenue > $5M
- Positive gross margins
- NYSE or NASDAQ listed ONLY
- ZERO pharma, biotech, therapeutics

For EVERY stock:
1. Score Financial Health 0-100 with component breakdown
2. Score Sector Growth Potential 0-100
3. Explain WHY it's volatile (what causes swings)
4. Explain WHY fundamentals are solid (what creates the floor)
5. Give specific entry strategy for volatile names

I want to see these organized by sector, with the strongest financial health scores on top within each sector.

Return 20-25 results as JSON array. Real tickers, real companies, real financials. ZERO pharma.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const focusSector = body.sector || "all";

    let userPrompt = USER_PROMPT;
    if (focusSector !== "all") {
      userPrompt += `\n\nPRIORITY FOCUS: Give extra weight to the "${focusSector}" sector. At least 8 picks should be from this sector.`;
    }

    console.log("[VOLATILE-GEMS] Scanning for volatile stocks with solid fundamentals...");

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
              name: "report_volatile_gems",
              description: "Report volatile small-cap stocks with solid fundamentals, scored by financial health and sector growth",
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
                        sector: { type: "string" },
                        sub_sector: { type: "string" },
                        estimated_market_cap: { type: "string" },
                        price_range: { type: "string" },
                        avg_daily_volume: { type: "string" },
                        financial_health_score: { type: "number", description: "Overall 0-100" },
                        revenue_growth_score: { type: "number" },
                        gross_margin_score: { type: "number" },
                        debt_health_score: { type: "number" },
                        cash_flow_score: { type: "number" },
                        balance_sheet_score: { type: "number" },
                        ttm_revenue: { type: "string" },
                        gross_margin_pct: { type: "string" },
                        debt_to_equity: { type: "string" },
                        cash_position: { type: "string" },
                        sector_growth_score: { type: "number", description: "0-100 sector explosive growth potential" },
                        sector_tailwind: { type: "string" },
                        sector_momentum: { type: "string", enum: ["accelerating", "steady", "emerging"] },
                        volatility_tag: { type: "string", enum: ["EXTREME_SWINGS", "HIGH_BETA", "NEWS_DRIVEN", "MOMENTUM_SURFER"] },
                        avg_weekly_range_pct: { type: "string" },
                        why_volatile: { type: "string" },
                        why_solid: { type: "string" },
                        setup_type: { type: "string", enum: ["POLITICAL_CATALYST", "PROFIT_CROSSOVER", "SHORT_SQUEEZE", "IP_HOSTAGE"] },
                        the_thesis: { type: "string" },
                        catalyst: { type: "string" },
                        catalyst_timeline: { type: "string" },
                        bull_case: { type: "string" },
                        bear_case: { type: "string" },
                        entry_strategy: { type: "string" },
                        why_not_zero: { type: "string" },
                      },
                      required: [
                        "ticker", "company_name", "sector", "estimated_market_cap",
                        "financial_health_score", "sector_growth_score",
                        "volatility_tag", "why_volatile", "why_solid",
                        "setup_type", "the_thesis", "catalyst",
                        "bull_case", "bear_case", "entry_strategy", "why_not_zero"
                      ],
                    },
                  },
                  sector_rankings: {
                    type: "array",
                    description: "Sectors ranked by explosive growth potential",
                    items: {
                      type: "object",
                      properties: {
                        sector: { type: "string" },
                        growth_score: { type: "number" },
                        tailwind: { type: "string" },
                        momentum: { type: "string" },
                        stock_count: { type: "number" },
                      },
                      required: ["sector", "growth_score", "tailwind", "momentum", "stock_count"],
                    },
                  },
                  market_context: { type: "string" },
                },
                required: ["stocks", "sector_rankings", "market_context"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_volatile_gems" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[VOLATILE-GEMS] AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return json({ error: "Rate limited — try again in 30 seconds" }, 429);
      if (aiResponse.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: "AI analysis failed" }, 500);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("[VOLATILE-GEMS] No tool call in response");
      return json({ error: "AI did not return structured data" }, 500);
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`[VOLATILE-GEMS] Found ${result.stocks?.length || 0} volatile gems`);

    // Enrich with UI helpers
    const volEmoji: Record<string, string> = {
      EXTREME_SWINGS: "🌊",
      HIGH_BETA: "⚡",
      NEWS_DRIVEN: "📰",
      MOMENTUM_SURFER: "🏄",
    };

    const setupEmoji: Record<string, string> = {
      POLITICAL_CATALYST: "🏛️",
      PROFIT_CROSSOVER: "📈",
      SHORT_SQUEEZE: "🩳🔥",
      IP_HOSTAGE: "🔐",
    };

    const enrichedStocks = (result.stocks || []).map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      vol_emoji: volEmoji[s.volatility_tag] || "⚡",
      setup_emoji: setupEmoji[s.setup_type] || "💰",
      health_grade: getHealthGrade(s.financial_health_score),
      sector_grade: getHealthGrade(s.sector_growth_score),
    }));

    return json({
      stocks: enrichedStocks,
      sector_rankings: result.sector_rankings || [],
      market_context: result.market_context || "",
      scan_timestamp: new Date().toISOString(),
      total_picks: enrichedStocks.length,
    });
  } catch (err) {
    console.error("[VOLATILE-GEMS] Error:", err);
    return json({ error: (err as Error).message || "Scanner failed" }, 500);
  }
});

function getHealthGrade(score: number): string {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 55) return "B";
  if (score >= 45) return "C+";
  if (score >= 35) return "C";
  return "D";
}
