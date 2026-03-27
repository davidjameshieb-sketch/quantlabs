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

const USER_PROMPT = `You are scanning the ENTIRE publicly traded AI ecosystem — cast a net across 1000+ companies, then distill to the TOP 50 absolute best. Today is ${new Date().toISOString().slice(0, 10)}.

SCANNING MANDATE: Do NOT just pick the first 50 AI companies that come to mind. You must mentally catalog companies across ALL 12 AI sub-sectors, across ALL major exchanges, at ALL market cap levels under $1B. Think about:
- Companies that just IPO'd in the last 2 years with AI products
- Companies that pivoted to AI from adjacent tech sectors
- Companies with government/defense AI contracts flying under the radar
- Companies building AI infrastructure (compute, networking, cooling, power)
- Companies with AI patents that haven't been noticed by the market yet
- International companies listed on US exchanges doing AI work
- Companies where insider buying is accelerating
- Companies with AI products generating real recurring revenue

After scanning 1000+, give me ONLY the 50 that have:
- The BEST CEO with PROVEN track record in AI/tech (prior exits, notable companies, technical depth)
- The MOST ELITE engineering team (talent from DeepMind, OpenAI, Google Brain, Meta AI, Stanford, MIT, CMU)
- A REAL AI product in PRODUCTION generating real revenue
- A DEFENSIBLE AI moat (proprietary models, unique data, patents)
- CLEAN dilution history (no serial diluters)

HARD FLOORS — reject anything that fails:
- Market cap UNDER $1 BILLION (sweet spot $15M-$1B)
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
5. Score Dilution Protection 0-100
6. Name the CEO and their background
7. Describe the specific AI product
8. Explain WHY the leadership team is elite
9. Give specific entry strategy

Organize by AI sub-sector, with the strongest leadership + AI scores on top within each sector.

Return EXACTLY 50 results as JSON array. These must be the CREAM OF THE CROP from your 1000+ stock scan. Real tickers, real companies, real AI products, real leadership. ZERO pharma.`;

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
          { role: "system", content: SYSTEM_PROMPT + "\n\nIMPORTANT: Return your response as a valid JSON object with keys: stocks (array of 50 stock objects), sector_rankings (array), market_context (string). Do NOT truncate — you MUST return all 50 stocks." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 65000,
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
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error("[VOLATILE-GEMS] No content in response");
      return json({ error: "AI did not return data" }, 500);
    }

    const result = JSON.parse(content);
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
