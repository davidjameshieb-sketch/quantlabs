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

const SYSTEM_PROMPT = `You are an elite technical breakout analyst at a boutique hedge fund. Your specialty: finding stocks ABOUT TO EXPLODE from consolidation patterns.

CRITICAL TICKER ACCURACY RULES:
- You MUST only use REAL, CURRENTLY VALID stock tickers on NYSE or NASDAQ as of today.
- DOUBLE CHECK every ticker before including it. If unsure, SKIP IT.
- Do NOT invent tickers. Do NOT use delisted/old tickers.

YOUR MISSION: Find 50 stocks under $100M market cap that are showing CLEAR BREAKOUT PATTERNS with strong upward momentum. ANY INDUSTRY — we don't care about sector, we care about the CHART and the CATALYST.

WHAT MAKES A BREAKOUT CANDIDATE:
- Stock is consolidating near resistance and showing increasing volume
- Price is trending UP — higher lows, tightening range, coiling for a move
- Recent volume surge (2x+ average) signals accumulation
- Breaking above key moving averages (50-day, 200-day)
- Relative strength vs sector peers — outperforming while nobody notices
- News catalyst, earnings beat, contract win, or sector rotation driving the move

ABSOLUTE EXCLUSIONS:
- Pharmaceutical/biotech drug development companies
- Pre-revenue companies
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks
- Companies with no real product shipping
- SERIAL DILUTERS — more than 1 offering in past 2 years = SKIP

MANDATORY HARD FLOORS:
1. Market Cap: $5M - $100M (sweet spot: $15M - $75M)
2. Average Daily Volume: > 50,000 shares (preferably spiking recently)
3. TTM Revenue: > $2M (MUST have real revenue)
4. Listed on NYSE, NASDAQ, or NYSE American ONLY
5. Share price trending UP — must show higher lows over past 30 days
6. No more than 5% dilution in past 12 months

BREAKOUT TECHNICAL ANALYSIS (score each 0-100):
- breakout_score: Overall breakout readiness (pattern quality + volume + momentum)
- volume_surge_score: Recent volume vs 30-day average (higher = more accumulation)
- trend_strength_score: Quality of the uptrend (higher lows, moving average alignment)
- consolidation_quality: How clean is the base/pattern?
- resistance_proximity_pct: How close to key resistance level (0% = at resistance, ready to break)

BREAKOUT PATTERN TYPE:
- pattern: "BULL_FLAG" / "CUP_AND_HANDLE" / "ASCENDING_TRIANGLE" / "CHANNEL_BREAKOUT" / "VOLUME_BREAKOUT" / "GOLDEN_CROSS" / "SQUEEZE_SETUP"
- pattern_description: 1 sentence describing the technical setup
- key_resistance: Price level to watch for breakout confirmation
- support_level: Where the floor is (risk management)
- risk_reward_ratio: Estimated R:R based on pattern measured move

CATALYST & NEWS:
- catalyst: The specific news/event driving the move
- catalyst_date: When it happened or is expected
- catalyst_type: "EARNINGS_BEAT" / "CONTRACT_WIN" / "PRODUCT_LAUNCH" / "SECTOR_ROTATION" / "INSIDER_BUYING" / "ANALYST_UPGRADE" / "REGULATORY_WIN" / "PARTNERSHIP" / "REVENUE_SURPRISE"
- news_headline: A real or realistic headline describing the catalyst
- why_now: Why THIS moment is the breakout window
- second_catalyst: Backup catalyst that could extend the move

MOMENTUM SIGNALS:
- price_change_5d_pct: 5-day price change %
- price_change_30d_pct: 30-day price change %
- volume_vs_avg_pct: Current volume vs 30-day average (200 = 2x normal)
- rsi_14: RSI reading (sweet spot: 55-70, not overbought yet)
- above_50ma: boolean
- above_200ma: boolean
- golden_cross_recent: boolean (50MA crossed above 200MA recently)

FINANCIAL SNAPSHOT:
- financial_health_score (0-100)
- ttm_revenue, revenue_growth_yoy_pct
- gross_margin_pct
- fcf_positive: boolean
- debt_to_equity
- cash_position

BUZZ & DISCOVERY:
- buzz_score (0-100): How exciting is this breakout story?
- reddit_angle: The 1-sentence hook for r/stocks
- retail_sentiment: "UNKNOWN_GEM" / "EARLY_DISCOVERY" / "GAINING_TRACTION"
- institutional_ownership_pct
- insider_buying_recent: boolean
- short_squeeze_potential: "HIGH" / "MEDIUM" / "LOW"

COMPANY BASICS:
- ticker, company_name, sector, sub_sector
- estimated_market_cap, price_range, avg_daily_volume
- setup_type: "BREAKOUT_IMMINENT" / "EARLY_BREAKOUT" / "MOMENTUM_RUNNER" / "COILING_SPRING"
- the_thesis: 2-sentence explanation of why this stock is about to move
- risk_profile: "MEDIUM" / "MEDIUM-HIGH" / "HIGH"
- upside_target_pct: Estimated upside from current price based on pattern
- stop_loss_pct: Suggested stop loss % below current price

For EACH stock provide ALL fields listed above plus: rank

Return EXACTLY 50 stocks as a JSON array. EVERY ticker MUST be real and currently trading. ALL INDUSTRIES WELCOME. ZERO pharma/drug companies. ZERO serial diluters. FOCUS on BREAKOUT PATTERNS and MOMENTUM.`;

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
    const setupEmoji: Record<string, string> = { CASH_FLOW_MACHINE: "💰", TURNAROUND_PLAY: "🔄", HIDDEN_COMPOUNDER: "💎", CATALYST_LOADED: "🚀" };

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
