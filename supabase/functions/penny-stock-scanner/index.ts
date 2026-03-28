// ═══════════════════════════════════════════════════════════════
// AI HIDDEN GEMS SCANNER — Background Processing Edition
// Returns job ID immediately, processes in background via waitUntil
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You are an elite quantitative equity analyst at a boutique hedge fund. Your job: find stocks that will make Reddit lose its mind when they discover them.

CRITICAL TICKER ACCURACY RULES:
- You MUST only use REAL, CURRENTLY VALID stock tickers on NYSE or NASDAQ as of today.
- DOUBLE CHECK every ticker before including it. If unsure, SKIP IT.
- Do NOT invent tickers. Do NOT use delisted/old tickers.

YOUR MISSION: Find 50 CRIMINALLY UNDERVALUED companies with REAL cash flow, REAL products, and SHORT-TERM CATALYSTS (1-3 months). These are stocks where people will say "HOW DID NO ONE KNOW ABOUT THIS?!" when they pop.

WHAT I WANT — "Reddit Discovery" Stocks:
- Companies generating REAL FREE CASH FLOW (FCF positive or near-positive)
- Stock price at or near 52-week lows or trading at absurd P/S or P/E discounts vs peers
- A clear SHORT-TERM CATALYST within 1-3 months (earnings beat setup, contract announcement, product launch, regulatory approval, inclusion in index, insider buying cluster, analyst initiation)
- The kind of company where if you post DD on r/wallstreetbets or r/stocks, people go "holy shit why is this so cheap"
- Companies in HOT SECTORS: AI infrastructure, data centers, cloud, cybersecurity, edge computing, semiconductors, defense tech, energy infrastructure, robotics, autonomous systems, SaaS with network effects, developer tools

ABSOLUTE EXCLUSIONS — NEVER suggest:
- Pharmaceutical/biotech drug development companies
- Pre-revenue companies of any kind
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks
- Companies with NO real product shipping
- SERIAL DILUTERS — if they've done more than 1 offering in the past 2 years, SKIP

MANDATORY HARD FLOORS:
1. Market Cap: $15M - $500M (sweet spot: $30M - $300M)
2. Average Daily Volume: > 100,000 shares
3. TTM Revenue: > $5M (MUST have meaningful revenue)
4. Listed on NYSE, NASDAQ, or NYSE American ONLY
5. Positive gross margins (>30% preferred)
6. Must have a REAL product in production generating revenue
7. Free Cash Flow: POSITIVE or within 1-2 quarters of turning positive
8. Shares outstanding STABLE — no more than 5% dilution in past 12 months

DILUTION IS THE #1 DISQUALIFIER:
- dilution_risk_score (0-100, higher = SAFER): Must be 70+
- shares_outstanding_change_12m_pct: Must be < 5%
- dilution_history: "CLEAN" or "MINOR" ONLY — never "WARNING" or "SERIAL_DILUTER"
- shelf_registration_risk: true/false
- insider_ownership_pct: Higher is better (aligned incentives)
- If ANY stock has done an ATM offering or secondary in the past 6 months, EXCLUDE IT

VALUATION — WHY IS THIS STOCK SO CHEAP?:
- price_vs_52w_low_pct: How far from 52-week low (0% = at low, 100% = at high)
- ev_to_revenue: Enterprise value to TTM revenue ratio
- price_to_fcf: Price to free cash flow ratio (if FCF positive)
- peer_discount_pct: How much cheaper than sector peers
- why_cheap: 1 sentence explaining the disconnect (market ignoring, misclassified sector, post-earnings overreaction, etc.)

SHORT-TERM CATALYST (THIS IS CRITICAL):
- catalyst: Specific upcoming event
- catalyst_timeline: "IMMINENT" (<30 days), "NEAR_TERM" (1-2 months), "SETUP" (2-3 months)
- catalyst_confidence: "HIGH" / "MEDIUM"
- second_catalyst: A backup catalyst if the first doesn't hit
- earnings_date: Next earnings date if known
- why_now: Why THIS is the moment to accumulate

FINANCIAL HEALTH (score each 0-100):
- financial_health_score, revenue_growth_score, gross_margin_score, cash_flow_score, balance_sheet_score
- ttm_revenue, gross_margin_pct, fcf_ttm, debt_to_equity, cash_position, burn_rate_months (if burning)
- revenue_growth_yoy_pct, revenue_acceleration: "ACCELERATING" / "STEADY" / "DECELERATING"

BUZZ POTENTIAL — Will Reddit Care?:
- buzz_score (0-100): How viral will this DD be?
- reddit_angle: The 1-sentence hook that would make someone click on r/stocks
- retail_sentiment: "UNKNOWN_GEM" / "EARLY_DISCOVERY" / "GROWING_BUZZ" / "UNDER_RADAR"
- social_buzz_score (0-100)
- meme_potential: "HIGH" / "MEDIUM" / "LOW" — does this have a compelling narrative?

INSTITUTIONAL & INSIDER SIGNALS:
- institutional_ownership_pct
- institutional_following: "HEAVY" / "MODERATE" / "LIGHT" / "ALMOST_NONE"
- top_institutional_holders: array of names
- insider_buying_signal: boolean — any insider buys in past 90 days?
- insider_buying_details: Brief description if yes
- short_interest_pct
- analyst_coverage: "WELL_COVERED" / "SPARSE" / "ALMOST_NONE"

LEADERSHIP & MOAT:
- ceo_score (0-100): Track record, skin in the game
- founder_led: boolean
- founder_story: Why this leader matters
- technical_moat: What makes this company hard to replicate
- engineering_team_score (0-100)

SECTOR & SETUP:
- sector, sub_sector
- sector_growth_score (0-100)
- setup_type: "CASH_FLOW_MACHINE", "TURNAROUND_PLAY", "HIDDEN_COMPOUNDER", "CATALYST_LOADED"
- the_thesis: 2-sentence aggressive thesis for why this is a BUY RIGHT NOW
- bull_case, bear_case
- risk_profile: "MEDIUM" / "MEDIUM-HIGH" / "HIGH"
- why_not_zero: Why this company won't go bankrupt

VOLATILITY:
- volatility_tag: "EXTREME_SWINGS" / "HIGH_BETA" / "NEWS_DRIVEN" / "MOMENTUM_SURFER"
- why_volatile, why_solid

For EACH stock provide ALL fields listed above plus: ticker, company_name, estimated_market_cap, price_range, avg_daily_volume, rank

Return EXACTLY 50 stocks as a JSON array. EVERY ticker MUST be real and currently trading. ZERO pharma/drug companies. ZERO serial diluters. FOCUS on near-term catalysts and cash-flow-positive companies.`;

const USER_PROMPT = `Today is ${new Date().toISOString().slice(0, 10)}. Scan 1000+ publicly traded companies and find me the TOP 50 that are CRIMINALLY UNDERVALUED with REAL CASH FLOW and SHORT-TERM CATALYSTS.

I want stocks that will make Reddit go INSANE when they discover them. The "how is nobody talking about this?!" plays.

FOCUS SECTORS (where the BUZZ is):
- AI infrastructure & picks-and-shovels plays (NOT the hype — the companies BUILDING the infrastructure)
- Data centers, cooling, power infrastructure for AI
- Cybersecurity (zero trust, endpoint, cloud security)
- Edge computing, IoT platforms
- Semiconductors & chip equipment (small players feeding the giants)
- Defense tech & autonomous systems
- Energy infrastructure (grid modernization, nuclear services)
- SaaS platforms with sticky revenue & network effects
- Developer tools & DevOps
- Robotics & industrial automation

REQUIREMENTS:
1. CASH FLOW POSITIVE or within 1-2 quarters — NO cash burners
2. Stock price near 52-week lows or massively undervalued vs peers
3. SHORT-TERM CATALYST within 1-3 months (earnings, contract, product launch, etc.)
4. ZERO DILUTION — clean share count, no recent offerings, insider aligned
5. Real products, real customers, real revenue growth
6. The kind of DD that gets 10,000 upvotes on Reddit

Return EXACTLY 50 results as JSON object with keys: stocks (array of 50 stock objects), sector_rankings (array), market_context (string). ZERO pharma. ZERO drug companies. ZERO serial diluters.`;

function getHealthGrade(score: number): string {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 55) return "B";
  if (score >= 45) return "C+";
  if (score >= 35) return "C";
  return "D";
}

async function processInBackground(jobId: string, focusSector: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await sb.from("penny_scan_jobs").update({ status: "failed", error: "LOVABLE_API_KEY not configured", completed_at: new Date().toISOString() }).eq("id", jobId);
      return;
    }

    let userPrompt = USER_PROMPT;
    if (focusSector !== "all") {
      userPrompt += `\n\nPRIORITY FOCUS: Give extra weight to "${focusSector}". At least 8 picks from this sector.`;
    }

    await sb.from("penny_scan_jobs").update({ progress: 10 }).eq("id", jobId);

    console.log("[AI-GEMS] Background scan started for job:", jobId);

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

    await sb.from("penny_scan_jobs").update({ progress: 50 }).eq("id", jobId);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[AI-GEMS] AI error:", aiResponse.status, errText);
      const errorMsg = aiResponse.status === 429 ? "Rate limited — try again in 30 seconds"
        : aiResponse.status === 402 ? "AI credits exhausted"
        : "AI analysis failed";
      await sb.from("penny_scan_jobs").update({ status: "failed", error: errorMsg, completed_at: new Date().toISOString() }).eq("id", jobId);
      return;
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      await sb.from("penny_scan_jobs").update({ status: "failed", error: "AI did not return data", completed_at: new Date().toISOString() }).eq("id", jobId);
      return;
    }

    await sb.from("penny_scan_jobs").update({ progress: 80 }).eq("id", jobId);

    const result = JSON.parse(content);
    console.log(`[AI-GEMS] Found ${result.stocks?.length || 0} gems for job ${jobId}`);

    const volEmoji: Record<string, string> = { EXTREME_SWINGS: "🌊", HIGH_BETA: "⚡", NEWS_DRIVEN: "📰", MOMENTUM_SURFER: "🏄" };
    const setupEmoji: Record<string, string> = { VISIONARY_FOUNDER: "🔮", CATEGORY_CREATOR: "🚀", PLATFORM_SHIFT: "🌊", STEALTH_COMPOUNDER: "💎" };

    const enrichedStocks = (result.stocks || []).map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      vol_emoji: volEmoji[s.volatility_tag] || "⚡",
      setup_emoji: setupEmoji[s.setup_type] || "💰",
      health_grade: getHealthGrade(s.financial_health_score),
      sector_grade: getHealthGrade(s.sector_growth_score),
    }));

    const finalResult = {
      stocks: enrichedStocks,
      sector_rankings: result.sector_rankings || [],
      market_context: result.market_context || "",
      scan_timestamp: new Date().toISOString(),
      total_picks: enrichedStocks.length,
    };

    await sb.from("penny_scan_jobs").update({
      status: "completed",
      progress: 100,
      result: finalResult,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`[AI-GEMS] Job ${jobId} completed with ${enrichedStocks.length} stocks`);
  } catch (err) {
    console.error("[AI-GEMS] Background error:", err);
    await sb.from("penny_scan_jobs").update({
      status: "failed",
      error: (err as Error).message || "Scanner failed",
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";

    // Poll for job status
    if (action === "poll" && body.job_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const { data: job, error } = await sb
        .from("penny_scan_jobs")
        .select("*")
        .eq("id", body.job_id)
        .single();

      if (error || !job) return json({ error: "Job not found" }, 404);

      if (job.status === "completed") {
        return json({ status: "completed", ...job.result });
      } else if (job.status === "failed") {
        return json({ status: "failed", error: job.error }, 500);
      } else {
        return json({ status: "processing", progress: job.progress });
      }
    }

    // Start new scan job
    const focusSector = body.sector || "all";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: job, error: insertErr } = await sb
      .from("penny_scan_jobs")
      .insert({ sector: focusSector, status: "processing", progress: 0 })
      .select()
      .single();

    if (insertErr || !job) return json({ error: "Failed to create scan job" }, 500);

    // Process in background
    (globalThis as any).EdgeRuntime?.waitUntil?.(processInBackground(job.id, focusSector))
      ?? processInBackground(job.id, focusSector);

    return json({ status: "started", job_id: job.id });
  } catch (err) {
    console.error("[AI-GEMS] Error:", err);
    return json({ error: (err as Error).message || "Scanner failed" }, 500);
  }
});
