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

const SYSTEM_PROMPT = `You are an elite quantitative equity analyst for a boutique hedge fund specializing in AI-focused small-cap stocks with ironclad fundamentals and world-class leadership.

CRITICAL TICKER ACCURACY RULES:
- You MUST only use REAL, CURRENTLY VALID stock tickers that trade on NYSE or NASDAQ as of today.
- DOUBLE CHECK every ticker. If you are not 100% certain the ticker is correct for the company you are describing, DO NOT INCLUDE IT.
- Do NOT invent tickers. Do NOT use old/delisted tickers. Do NOT confuse companies with similar names.
- If in doubt about a ticker, SKIP that company and pick another one you are certain about.

YOUR MISSION: Screen through 1000+ publicly traded companies in the AI ecosystem, then distill down to the absolute TOP 50 cream-of-the-crop hidden gems.

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

MARKET FOLLOWING & OWNERSHIP SCORING (REQUIRED for each stock):
- institutional_ownership_pct, institutional_following, top_institutional_holders
- retail_sentiment, social_buzz_score, analyst_coverage, short_interest_pct, insider_buying_signal

LEADERSHIP & TALENT SCORING (score each 0-100):
- ceo_score, engineering_team_score, talent_density_score
- Overall leadership_score: Weighted average (0-100)

AI PRODUCT SCORING (score each 0-100):
- ai_product_maturity, ai_moat_score, ai_revenue_pct, ai_innovation_score
- Overall ai_score: Weighted average (0-100)

FINANCIAL HEALTH SCORING (score each 0-100):
- revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score
- Overall financial_health_score: Weighted average (0-100)

DILUTION PROTECTION SCORING (0-100):
- dilution_risk_score, share_stability_score, insider_ownership_pct
- dilution_history: "CLEAN"/"MINOR"/"WARNING"/"SERIAL_DILUTER"
- NEVER recommend SERIAL_DILUTER stocks.

VOLATILITY PROFILE:
- volatility_tag: "EXTREME_SWINGS", "HIGH_BETA", "NEWS_DRIVEN", "MOMENTUM_SURFER"

For EACH stock provide ALL fields:
- ticker, company_name, sector, sub_sector
- estimated_market_cap, price_range, avg_daily_volume
- financial_health_score, revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score
- ttm_revenue, gross_margin_pct, debt_to_equity, cash_position
- leadership_score, ceo_score, engineering_team_score, talent_density_score
- ceo_name, ceo_background, notable_talent
- ai_score, ai_product_maturity, ai_moat_score, ai_revenue_pct, ai_innovation_score
- ai_product_description
- sector_growth_score, sector_tailwind, sector_momentum
- volatility_tag, why_volatile, why_solid
- setup_type: POLITICAL_CATALYST, PROFIT_CROSSOVER, SHORT_SQUEEZE, or IP_HOSTAGE
- the_thesis, catalyst, catalyst_timeline
- bull_case, bear_case, entry_strategy, why_not_zero
- dilution_risk_score, share_stability_score, insider_ownership_pct, shelf_registration_risk, dilution_history, shares_outstanding, dilution_note
- institutional_ownership_pct, institutional_following, top_institutional_holders, retail_sentiment, social_buzz_score, analyst_coverage, short_interest_pct, insider_buying_signal

Return EXACTLY 50 stocks as a JSON array. EVERY ticker MUST be real and currently trading. ZERO pharma/biotech.`;

const USER_PROMPT = `Today is ${new Date().toISOString().slice(0, 10)}. Scan the ENTIRE AI ecosystem (1000+ companies), then give me ONLY the TOP 50.

After scanning, give me ONLY the 50 that have:
- The BEST CEO with PROVEN track record
- The MOST ELITE engineering team
- A REAL AI product in PRODUCTION generating real revenue
- A DEFENSIBLE AI moat
- CLEAN dilution history

Return EXACTLY 50 results as JSON array inside a JSON object with keys: stocks, sector_rankings, market_context. ZERO pharma.`;

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
    const setupEmoji: Record<string, string> = { POLITICAL_CATALYST: "🏛️", PROFIT_CROSSOVER: "📈", SHORT_SQUEEZE: "🩳🔥", IP_HOSTAGE: "🔐" };

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
