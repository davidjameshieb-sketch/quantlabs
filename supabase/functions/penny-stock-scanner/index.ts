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

const SYSTEM_PROMPT = `You are an elite quantitative equity analyst for a boutique hedge fund specializing in AI-focused small-cap stocks with ironclad fundamentals and world-class leadership.

YOUR MISSION: Screen through 1000+ publicly traded companies in the AI ecosystem, then distill down to the absolute TOP 50 cream-of-the-crop hidden gems. These are companies building real AI products, AI infrastructure, AI tools, AI services, or AI-enabled solutions. They must have ELITE engineering teams, exceptional CEO/leadership, and strong technical talent that gives them a moat. You must cast the WIDEST possible net — scan every sector, every exchange, every corner of the market — then ruthlessly filter to only the best 50.

ABSOLUTE EXCLUSIONS — NEVER suggest:
- Pharmaceutical, biotech, drug development, clinical trials companies
- Pre-revenue companies of any kind
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks — NASDAQ or NYSE listed ONLY
- Companies with "Therapeutics", "Pharma", "Bio", "Sciences" in name
- Companies that just slap "AI" on their name with no real AI product

MANDATORY HARD FLOORS:
1. Market Cap: UNDER $1 BILLION (sweet spot: $15M - $1B)
2. Average Daily Volume: > 100,000 shares (must be tradeable)
3. TTM Revenue: > $3M (MUST have real revenue from AI products/services)
4. Must be listed on NYSE, NASDAQ, or NYSE American
5. Must have POSITIVE gross margins
6. Must have a REAL AI product, AI platform, or AI-powered service in production
7. Must have identifiable elite engineering talent or leadership with AI/ML pedigree

LEADERSHIP & TALENT SCORING (score each 0-100):
- ceo_score: CEO track record, vision, AI expertise, prior exits/successes
- engineering_team_score: Quality of engineering leadership, AI/ML PhDs, ex-FAANG/top-lab talent
- talent_density_score: Ratio of elite engineers to total headcount, hiring momentum
- leadership_pedigree: Notable backgrounds (Stanford AI Lab, DeepMind, OpenAI, Google Brain, Meta AI, etc.)
- Overall leadership_score: Weighted average (0-100)

AI PRODUCT SCORING (score each 0-100):
- ai_product_maturity: How real and deployed is the AI product? (production > beta > prototype)
- ai_moat_score: How defensible is their AI advantage? (proprietary data, models, patents)
- ai_revenue_pct: What % of revenue comes from AI products/services?
- ai_innovation_score: How cutting-edge is their approach?
- Overall ai_score: Weighted average (0-100)

FINANCIAL HEALTH SCORING (score each 0-100):
- revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score
- Overall financial_health_score: Weighted average (0-100)

DILUTION PROTECTION SCORING (CRITICAL — score each 0-100):
- dilution_risk_score: 0 = extreme dilution risk, 100 = zero dilution risk (HIGHER IS BETTER/SAFER)
- share_stability_score: How stable has the share count been over 12-24 months? (100 = no change, 0 = doubled+)
- insider_ownership_pct: What % do insiders/founders own? Higher = aligned incentives, less likely to dilute
- shelf_registration_risk: Does the company have an active shelf registration / ATM offering? (100 = no shelf, 0 = active ATM)
- dilution_history: "CLEAN" (no dilution in 2+ years), "MINOR" (small raise, <10% dilution), "WARNING" (recent significant dilution), "SERIAL_DILUTER" (repeated offerings — AVOID)
- shares_outstanding: Approximate current shares outstanding
- dilution_note: 1-sentence explanation of dilution risk or safety

CRITICAL DILUTION RULE: Do NOT recommend any stock with dilution_history = "SERIAL_DILUTER". 
Prefer stocks with "CLEAN" or "MINOR" dilution history. Flag any "WARNING" stocks prominently.

AI SUB-SECTORS TO SCAN:
1. AI Infrastructure (GPU cloud, model serving, MLOps, data pipelines, vector databases)
2. AI-Powered Cybersecurity (threat detection, autonomous SOC, zero-trust AI)
3. AI for Defense & Intelligence (autonomous systems, ISR, predictive analytics)
4. Edge AI & Embedded Intelligence (on-device ML, IoT AI, real-time inference)
5. AI-Powered Fintech (algorithmic trading platforms, AI underwriting, fraud detection)
6. Computer Vision & Robotics (industrial automation, autonomous vehicles, visual inspection)
7. NLP & Conversational AI (enterprise chatbots, document AI, speech/language processing)
8. AI Data Infrastructure (data labeling, synthetic data, feature stores, data quality)
9. AI for Healthcare Operations (NOT pharma — scheduling, billing, workflow AI, imaging AI)
10. Vertical AI SaaS (AI for legal, construction, agriculture, logistics, real estate)
11. AI Developer Tools (code generation, testing automation, DevOps AI)
12. Generative AI Applications (content creation, design, media, marketing AI)

VOLATILITY PROFILE:
- volatility_tag: "EXTREME_SWINGS", "HIGH_BETA", "NEWS_DRIVEN", "MOMENTUM_SURFER"
- why_volatile: 1-sentence explanation
- why_solid: 1-sentence explanation of why fundamentals are bulletproof

For EACH stock provide ALL fields:
- ticker, company_name, sector, sub_sector
- estimated_market_cap, price_range, avg_daily_volume
- financial_health_score (0-100), revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score
- ttm_revenue, gross_margin_pct, debt_to_equity, cash_position
- leadership_score (0-100), ceo_score, engineering_team_score, talent_density_score
- ceo_name, ceo_background (1 sentence), notable_talent (key hires or backgrounds)
- ai_score (0-100), ai_product_maturity, ai_moat_score, ai_revenue_pct, ai_innovation_score
- ai_product_description (1 sentence — what the AI product actually does)
- sector_growth_score (0-100), sector_tailwind, sector_momentum
- volatility_tag, why_volatile, why_solid
- setup_type: POLITICAL_CATALYST, PROFIT_CROSSOVER, SHORT_SQUEEZE, or IP_HOSTAGE
- the_thesis (2-sentence aggressive institutional thesis focusing on AI moat + leadership)
- catalyst, catalyst_timeline
- bull_case, bear_case, entry_strategy
- why_not_zero (1 sentence — real AI revenue, contracts, or IP that creates a floor)
- dilution_risk_score (0-100, higher = safer), share_stability_score, insider_ownership_pct
- shelf_registration_risk, dilution_history, shares_outstanding, dilution_note

SCANNING DEPTH: You must mentally scan through AT LEAST 1000 publicly traded companies across ALL exchanges (NYSE, NASDAQ, NYSE American) before selecting your final 50. Consider companies from EVERY AI sub-sector listed above. The final 50 must represent the absolute best risk/reward opportunities you can find — the cream of the crop from your 1000+ stock universe.

Return EXACTLY 50 stocks as a JSON array. EVERY pick must have a REAL AI product and identifiable leadership. ZERO pharma/biotech.`;

const USER_PROMPT = `Scan the market for AI-focused small-cap stocks with ELITE LEADERSHIP and BULLETPROOF fundamentals. Today is ${new Date().toISOString().slice(0, 10)}.

I want 50 AI hidden gems — companies where:
- The CEO has a PROVEN track record in AI/tech (prior exits, notable companies, technical depth)
- The engineering team includes talent from top AI labs (DeepMind, OpenAI, Google Brain, Meta AI, Stanford, MIT, CMU)
- They have a REAL AI product in PRODUCTION generating real revenue
- Their AI gives them a defensible moat (proprietary models, unique data, patents)

HARD FLOORS — reject anything that fails:
- Market cap UNDER $500M (sweet spot $15M-$500M)
- ADV > 100,000 shares
- TTM Revenue > $3M from AI products/services
- Positive gross margins
- NYSE or NASDAQ listed ONLY
- ZERO pharma, biotech, therapeutics
- Must have identifiable AI product and leadership

For EVERY stock:
1. Score Leadership Quality 0-100 (CEO + engineering team + talent density)
2. Score AI Product Strength 0-100 (maturity + moat + revenue % + innovation)
3. Score Financial Health 0-100 with component breakdown
4. Score Sector Growth Potential 0-100
5. Name the CEO and their background
6. Describe the specific AI product
7. Explain WHY the leadership team is elite
8. Give specific entry strategy

I want these organized by AI sub-sector, with the strongest leadership + AI scores on top.

Return EXACTLY 50 results as JSON array. Real tickers, real companies, real AI products, real leadership. ZERO pharma.`;

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

    console.log("[AI-GEMS] Scanning for AI stocks with elite leadership...");

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
              description: "Report AI-focused small-cap stocks with elite leadership, scored by AI product strength, leadership quality, and financial health",
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
                        leadership_score: { type: "number", description: "0-100 leadership quality" },
                        ceo_score: { type: "number" },
                        engineering_team_score: { type: "number" },
                        talent_density_score: { type: "number" },
                        ceo_name: { type: "string" },
                        ceo_background: { type: "string" },
                        notable_talent: { type: "string" },
                        ai_score: { type: "number", description: "0-100 AI product strength" },
                        ai_product_maturity: { type: "number" },
                        ai_moat_score: { type: "number" },
                        ai_revenue_pct: { type: "number" },
                        ai_innovation_score: { type: "number" },
                        ai_product_description: { type: "string" },
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
                        dilution_risk_score: { type: "number", description: "0-100, higher = safer from dilution" },
                        share_stability_score: { type: "number", description: "0-100, share count stability" },
                        insider_ownership_pct: { type: "number", description: "Insider ownership percentage" },
                        shelf_registration_risk: { type: "number", description: "0-100, 100 = no shelf registration" },
                        dilution_history: { type: "string", enum: ["CLEAN", "MINOR", "WARNING", "SERIAL_DILUTER"] },
                        shares_outstanding: { type: "string" },
                        dilution_note: { type: "string" },
                      },
                      required: [
                        "ticker", "company_name", "sector", "estimated_market_cap",
                        "financial_health_score", "leadership_score", "ai_score", "sector_growth_score",
                        "ceo_name", "ceo_background", "ai_product_description",
                        "volatility_tag", "why_volatile", "why_solid",
                        "setup_type", "the_thesis", "catalyst",
                        "bull_case", "bear_case", "entry_strategy", "why_not_zero",
                        "dilution_risk_score", "dilution_history", "dilution_note"
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
