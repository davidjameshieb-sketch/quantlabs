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

const SYSTEM_PROMPT = `You are an elite quantitative equity analyst for a boutique hedge fund specializing in finding WORLD-CHANGING companies with VISIONARY FOUNDERS that top engineers dream of joining.

CRITICAL TICKER ACCURACY RULES:
- You MUST only use REAL, CURRENTLY VALID stock tickers that trade on NYSE or NASDAQ as of today.
- DOUBLE CHECK every ticker. If you are not 100% certain, DO NOT INCLUDE IT.
- Do NOT invent tickers. Do NOT use old/delisted tickers.

YOUR MISSION: Screen through 1000+ publicly traded companies across ALL innovative sectors (NOT just AI), then distill down to the TOP 50 HIDDEN GIANTS — companies with visionary leadership, elite talent, explosive growth trajectories, but that Wall Street is SLEEPING ON.

SECTORS TO SCAN (cast a WIDE net):
- AI & Machine Learning (infrastructure, applications, chips)
- Robotics & Automation
- Cybersecurity & Zero Trust
- Space & Defense Tech
- Clean Energy & Climate Tech
- Fintech & Payments Innovation
- Edge Computing & IoT
- Quantum Computing
- Advanced Manufacturing & 3D Printing
- Biotech PLATFORMS (NOT drug companies — platforms/tools only)
- SaaS with network effects
- Developer Tools & DevOps
- Autonomous Systems
- Digital Infrastructure
- Data Analytics & Observability

ABSOLUTE EXCLUSIONS — NEVER suggest:
- Pharmaceutical drug development / clinical trials companies
- Pre-revenue companies of any kind
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks — NASDAQ or NYSE listed ONLY
- Companies that just slap trendy buzzwords on their name with no real product
- SERIAL DILUTERS

MANDATORY HARD FLOORS:
1. Market Cap: UNDER $500 MILLION (sweet spot: $15M - $500M)
2. Average Daily Volume: > 100,000 shares
3. TTM Revenue: > $3M (MUST have real revenue)
4. Must be listed on NYSE, NASDAQ, or NYSE American
5. Must have POSITIVE gross margins
6. Must have a REAL product in production generating real revenue
7. Must have a VISIONARY FOUNDER or CEO that top engineers would follow

VISIONARY FOUNDER & TALENT SCORING (THIS IS THE #1 PRIORITY):
- founder_vision_score (0-100): How transformative is the founder's vision?
- talent_magnet_score (0-100): Would elite engineers from FAANG leave their jobs to work here?
- ceo_score (0-100): Track record, technical depth, industry respect
- engineering_team_score (0-100): Quality of technical team, patents, open-source contributions
- glassdoor_signal: "ENGINEERS_LOVE_IT" / "STRONG" / "MIXED" / "UNKNOWN"
- founder_story: Brief compelling narrative about why this founder is special

GROWTH & MOMENTUM SCORING:
- revenue_growth_yoy_pct: Actual year-over-year revenue growth percentage
- revenue_acceleration: "YES_ACCELERATING" / "STEADY" / "DECELERATING"
- customer_growth_signal: "EXPLOSIVE" / "STRONG" / "STEADY"
- why_growing: One sentence on what's driving the growth

FINANCIAL HEALTH SCORING (score each 0-100):
- financial_health_score, revenue_growth_score, gross_margin_score, debt_health_score, cash_flow_score, balance_sheet_score
- ttm_revenue, gross_margin_pct, debt_to_equity, cash_position

MARKET FOLLOWING & OWNERSHIP:
- institutional_ownership_pct, institutional_following ("HEAVY"/"MODERATE"/"LIGHT"/"ALMOST_NONE")
- top_institutional_holders (array of names)
- retail_sentiment ("CULT_FOLLOWING"/"STRONG_BULL"/"GROWING"/"UNDER_RADAR"/"UNKNOWN")
- social_buzz_score (0-100), analyst_coverage ("WELL_COVERED"/"SPARSE"/"ALMOST_NONE")
- short_interest_pct, insider_buying_signal (boolean)

DILUTION PROTECTION:
- dilution_risk_score (0-100, higher = safer)
- dilution_history: "CLEAN"/"MINOR"/"WARNING"/"SERIAL_DILUTER"
- NEVER recommend SERIAL_DILUTER stocks

SECTOR & CATALYST:
- sector, sub_sector
- sector_growth_score (0-100), sector_tailwind, sector_momentum
- setup_type: "VISIONARY_FOUNDER", "CATEGORY_CREATOR", "PLATFORM_SHIFT", "STEALTH_COMPOUNDER"
- the_thesis: 2-sentence institutional-grade thesis
- catalyst, catalyst_timeline
- bull_case, bear_case, entry_strategy, why_not_zero

VOLATILITY:
- volatility_tag: "EXTREME_SWINGS", "HIGH_BETA", "NEWS_DRIVEN", "MOMENTUM_SURFER"
- why_volatile, why_solid

For EACH stock provide ALL fields listed above plus: ticker, company_name, estimated_market_cap, price_range, avg_daily_volume, rank

Return EXACTLY 50 stocks as a JSON array. EVERY ticker MUST be real and currently trading. ZERO pharma/drug companies.`;

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
