// ═══════════════════════════════════════════════════════════════
// INSTITUTIONAL DEEP VALUE SCANNER — PLAB/POWI Style Analysis
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier institutional fund. You produce deep-dive, PLAB/POWI-caliber stock reports — the kind that compare Value vs Growth, show real financial metrics, and give investors clear thesis + risk + catalyst breakdowns.

CRITICAL TICKER ACCURACY RULES:
- ONLY use REAL, CURRENTLY VALID stock tickers on NYSE or NASDAQ as of today.
- DOUBLE CHECK every ticker. If unsure, SKIP IT.
- Do NOT invent tickers. Do NOT use delisted/old tickers.

YOUR MISSION: Find 50 stocks under $5B market cap that institutional investors are MISSING. These are companies with:
1. REAL revenue, REAL profits, REAL products shipping to REAL customers
2. Strong or improving balance sheets (cash > debt preferred)
3. A clear catalyst within 1-6 months (earnings beat, contract, product cycle, sector rotation)
4. Technical momentum confirming the fundamental story

THINK LIKE THIS — For each stock, imagine writing a 2-stock comparison like "PLAB vs POWI" where you explain:
- Why a Value investor would love it (low P/E, cash-rich, profitable)
- Why a Growth investor would love it (revenue acceleration, TAM expansion, tech moat)
- The specific near-term catalyst that makes NOW the time to buy

INVESTOR STYLE TAGS (assign one per stock):
- "DEEP_VALUE" — P/E under 20, cash-rich, profitable, market ignoring it
- "QUALITY_COMPOUNDER" — Strong margins, growing steadily, best-in-class operations
- "RECOVERY_PLAY" — Stock beaten down but fundamentals improving, restructuring working
- "GROWTH_INFLECTION" — Revenue accelerating, new product/market about to inflect earnings
- "CATALYST_LOADED" — Specific near-term event (earnings, FDA, contract) about to reprice stock

ABSOLUTE EXCLUSIONS:
- Pre-revenue companies
- Pharmaceutical drug development / biotech clinical trials
- SPACs, blank-check, or shell companies
- Cannabis/marijuana stocks
- Chinese reverse-merger companies
- OTC/Pink Sheet stocks
- SERIAL DILUTERS — more than 1 offering or >5% share increase in past 2 years = SKIP

MANDATORY HARD FLOORS:
1. Market Cap: $100M - $5B (sweet spot: $300M - $3B)
2. Average Daily Volume: > 100,000 shares
3. TTM Revenue: > $50M (MUST have substantial real revenue)
4. Listed on NYSE, NASDAQ, or NYSE American ONLY
5. Positive gross margins (> 25%)
6. No more than 5% dilution in past 12 months

FOR EACH STOCK PROVIDE:

FINANCIAL DEEP DIVE:
- ticker, company_name, sector, sub_sector
- estimated_market_cap (string like "$1.2B")
- price_range (string like "$28-$32")
- pe_ratio: Current P/E ratio (number)
- forward_pe: Forward P/E based on estimates
- ttm_revenue (string like "$862M")
- revenue_growth_yoy_pct: Year-over-year revenue growth %
- net_profit_margin_pct: Net profit margin %
- gross_margin_pct: Gross margin %
- debt_to_equity: D/E ratio
- cash_position (string like "$637M")
- fcf_positive: boolean
- dividend_yield_pct: Dividend yield % (0 if none)
- financial_health_score: 0-100 overall financial health

QUALITY METRICS:
- quality_score: 0-100 (balance sheet strength, margin consistency, management quality)
- moat_description: 1-sentence competitive advantage
- management_grade: "A+" / "A" / "B+" / "B" / "C"
- insider_buying_recent: boolean

CATALYST & TIMING:
- catalyst: The specific near-term catalyst
- catalyst_date: When it happens or expected date
- catalyst_type: "EARNINGS_BEAT" / "CONTRACT_WIN" / "PRODUCT_LAUNCH" / "SECTOR_ROTATION" / "RESTRUCTURING" / "ANALYST_UPGRADE" / "REGULATORY_WIN" / "PARTNERSHIP" / "BUYBACK" / "MARGIN_EXPANSION"
- catalyst_timeline: "IMMINENT" (< 1 month) / "NEAR_TERM" (1-3 months) / "SETUP" (3-6 months)
- why_now: Why THIS moment is the entry window

TECHNICAL CONFIRMATION:
- ytd_performance_pct: Year-to-date performance %
- breakout_score: 0-100 technical breakout readiness
- above_50ma: boolean
- above_200ma: boolean
- rsi_14: RSI reading
- volume_vs_avg_pct: Current volume vs 30-day average

INVESTOR THESIS:
- setup_type: One of the 5 investor style tags above
- the_thesis: 2-3 sentence institutional-grade thesis (like the PLAB/POWI writeups)
- bull_case: 1-sentence best-case scenario
- bear_case: 1-sentence worst-case risk
- risk_profile: "LOW-MEDIUM" / "MEDIUM" / "MEDIUM-HIGH" / "HIGH"
- upside_target_pct: Estimated upside from current price
- stop_loss_pct: Suggested stop loss % below current price
- verdict: 1-sentence "Choose this stock if..." recommendation

BUZZ & DISCOVERY:
- buzz_score: 0-100 (how much attention is this getting?)
- reddit_angle: The 1-sentence hook for r/stocks
- institutional_ownership_pct: Approximate institutional ownership
- retail_sentiment: "UNKNOWN_GEM" / "EARLY_DISCOVERY" / "GAINING_TRACTION" / "WELL_KNOWN"
- short_interest_pct: Short interest as % of float

RANKING:
- rank: 1-50 (your conviction ranking)
- conviction_score: 0-100 (how confident are you in this pick?)

Return EXACTLY 50 stocks as a JSON array. EVERY ticker MUST be real and currently trading. ALL INDUSTRIES WELCOME — tech, industrials, energy, consumer, fintech, defense, infrastructure. ZERO pharma drug plays. ZERO serial diluters. Focus on QUALITY companies with REAL catalysts.`;

const USER_PROMPT = `Today is ${new Date().toISOString().slice(0, 10)}. 

I need you to do DEEP institutional research across 1000+ publicly traded companies under $5B market cap. Find me the TOP 50 that match this profile:

THE PLAB/POWI STANDARD:
Think about stocks like Photronics (PLAB) — a deep value play with $637M cash, zero debt, 15.8% margins, and a P/E of 15.5x. Or Power Integrations (POWI) — a quality recovery play with GaN technology moat and 30%+ YTD performance. I want stocks at THIS caliber.

WHAT I'M HUNTING:
1. DEEP VALUE: Companies trading at absurdly low P/E ratios relative to their cash position and profitability. The market is sleeping on them.
2. QUALITY COMPOUNDERS: Best-in-class operators with expanding margins, growing revenue, and competitive moats that make them acquisition targets.
3. RECOVERY PLAYS: Beaten-down stocks where restructuring is WORKING and the turnaround is about to show up in earnings.
4. GROWTH INFLECTIONS: Companies where a new product, market, or technology is about to inflect their revenue trajectory.
5. CATALYST LOADED: Stocks with specific upcoming events (earnings, contracts, partnerships) that will force the market to reprice them.

SECTOR DIVERSITY: Give me picks across ALL sectors — semiconductors, defense/aerospace, industrial tech, cybersecurity, energy infrastructure, fintech, robotics, data centers, consumer brands, enterprise software. I want the BEST from EVERY corner of the market.

NON-NEGOTIABLE:
- Real revenue (>$50M TTM)
- Real profits or clear path to profitability
- Clean balance sheet (low debt, cash-rich preferred)
- ZERO dilution risk
- Near-term catalyst (1-6 months)
- The kind of stock where when you tell someone about it, they say "HOW did I not know about this?"

Return EXACTLY 50 results as JSON object with keys: stocks (array of 50 stock objects), sector_breakdown (array of {sector, count, avg_conviction_score}), market_context (string with current market thesis).`;

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
      userPrompt += `\n\nPRIORITY FOCUS: Give extra weight to "${focusSector}". At least 10 picks from this sector.`;
    }

    await sb.from("penny_scan_jobs").update({ progress: 10 }).eq("id", jobId);
    console.log("[DEEP-VALUE] Background scan started for job:", jobId);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nIMPORTANT: Return your response as a valid JSON object with keys: stocks (array of 50 stock objects), sector_breakdown (array), market_context (string). Do NOT truncate — you MUST return all 50 stocks. CRITICAL: Every ticker MUST be unique — absolutely ZERO duplicate tickers." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 65000,
      }),
    });

    await sb.from("penny_scan_jobs").update({ progress: 50 }).eq("id", jobId);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[DEEP-VALUE] AI error:", aiResponse.status, errText);
      const errorMsg = aiResponse.status === 429 ? "Rate limited — try again in 30 seconds"
        : aiResponse.status === 402 ? "AI credits exhausted — add funds at Settings > Workspace > Usage"
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

    let result: any;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      // AI response was truncated — try to salvage partial JSON
      console.warn("[DEEP-VALUE] JSON truncated, attempting repair...");
      let fixed = content;
      // Close any unterminated strings
      const quoteCount = (fixed.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) fixed += '"';
      // Try to close the stocks array and outer object
      if (!fixed.includes('"sector_breakdown"')) {
        // Truncated inside the stocks array
        // Remove the last partial object
        const lastComplete = fixed.lastIndexOf("},");
        if (lastComplete > 0) {
          fixed = fixed.substring(0, lastComplete + 1);
        }
        fixed += '], "sector_breakdown": [], "market_context": "Partial scan — response was truncated"}';
      }
      try {
        result = JSON.parse(fixed);
      } catch {
        // Last resort: extract stock objects with regex
        const stockMatches = content.match(/\{[^{}]*"ticker"\s*:\s*"[A-Z]+?"[^{}]*\}/g) || [];
        const stocks = stockMatches.map((m: string) => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean);
        result = { stocks, sector_breakdown: [], market_context: "Partial scan — only complete stock entries recovered" };
      }
    }
    console.log(`[DEEP-VALUE] Found ${result.stocks?.length || 0} gems for job ${jobId}`);

    const setupEmoji: Record<string, string> = {
      DEEP_VALUE: "💰",
      QUALITY_COMPOUNDER: "💎",
      RECOVERY_PLAY: "🔄",
      GROWTH_INFLECTION: "🚀",
      CATALYST_LOADED: "⚡",
    };

    // Deduplicate by ticker — keep first occurrence only
    const seenTickers = new Set<string>();
    const dedupedStocks: any[] = [];
    for (const s of (result.stocks || [])) {
      const t = (s.ticker || "").toUpperCase().trim();
      if (!t || seenTickers.has(t)) continue;
      seenTickers.add(t);
      dedupedStocks.push(s);
    }

    const enrichedStocks = dedupedStocks.map((s: any, i: number) => ({
      ...s,
      rank: i + 1,
      setup_emoji: setupEmoji[s.setup_type] || "📊",
      health_grade: getHealthGrade(s.financial_health_score),
      quality_grade: getHealthGrade(s.quality_score),
    }));

    const finalResult = {
      stocks: enrichedStocks,
      sector_breakdown: result.sector_breakdown || [],
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

    console.log(`[DEEP-VALUE] Job ${jobId} completed with ${enrichedStocks.length} stocks`);
  } catch (err) {
    console.error("[DEEP-VALUE] Background error:", err);
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

    (globalThis as any).EdgeRuntime?.waitUntil?.(processInBackground(job.id, focusSector))
      ?? processInBackground(job.id, focusSector);

    return json({ status: "started", job_id: job.id });
  } catch (err) {
    console.error("[DEEP-VALUE] Error:", err);
    return json({ error: (err as Error).message || "Scanner failed" }, 500);
  }
});
