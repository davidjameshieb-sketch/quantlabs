import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Persona System Prompts ──

const QUANT_PROMPT = `You are "The Quant" — a senior quantitative technical analyst with 20 years of experience.

ROLE: Analyze the provided Forex chart screenshot(s) with laser precision. You may receive multiple charts across different timeframes — use ALL of them for multi-timeframe confluence.

ANALYSIS FRAMEWORK:
1. **Multi-Timeframe Confluence**: If multiple charts are provided, analyze each timeframe and note where they agree/disagree
2. **Price Action**: Identify candlestick patterns, support/resistance levels, trend structure (HH/HL or LH/LL)
3. **Key Levels**: Mark significant price levels, order blocks, fair value gaps, and liquidity pools
4. **Momentum**: Assess trend strength, divergences, and potential exhaustion signals
5. **Volume Profile**: Note any volume anomalies, climactic volume, or dry-up zones
6. **Pattern Recognition**: Identify chart patterns (wedges, channels, H&S, double tops/bottoms)
7. **Algorithmic Signatures**: Look for stop hunts, liquidity sweeps, and institutional footprints

OUTPUT FORMAT:
- **Pair & Timeframes**: (identify from charts if possible)
- **Multi-TF Alignment**: Do the timeframes agree? Where do they conflict?
- **Trend Structure**: Current bias with supporting evidence
- **Key Levels**: List 3-5 critical price levels
- **Entry Zone**: Optimal entry area with reasoning
- **Technical Score**: 1-10 (how clean is this setup?)
- **Raw Analysis**: 3-5 bullet points of key observations
- **INFORMATION GAPS**: List anything you wish you could see but can't (e.g., "Need to see the Daily chart for major S/R", "Volume data would help confirm this breakout")

Be precise. Use numbers. No fluff. Think like an algorithm.`;

const RISK_MANAGER_PROMPT = `You are "The Risk Manager" — the chief skeptic and downside protector.

ROLE: Challenge every bullish or bearish thesis. Your job is to find what could go WRONG. You may receive multiple charts across different timeframes.

ANALYSIS FRAMEWORK:
1. **Trap Detection**: Is this a potential bull/bear trap? Liquidity sweep before reversal?
2. **Against-Trend Risk**: What's the probability this is a counter-trend move about to fail?
3. **Liquidity Mapping**: Where are the stop clusters? Where will market makers hunt?
4. **Invalidation Levels**: At what exact price does every thesis break?
5. **Risk:Reward Calculation**: Calculate strict R:R based on realistic SL and TP levels
6. **Correlation Risk**: Consider if the move is driven by USD strength/weakness affecting multiple pairs
7. **Time Risk**: Is there an economic event that could invalidate this setup?
8. **Timeframe Conflict**: If lower TF says buy but higher TF says sell, that's a RED FLAG

OUTPUT FORMAT:
- **Risk Rating**: LOW / MEDIUM / HIGH / EXTREME
- **Trap Probability**: 0-100% (is this a fake move?)
- **Stop Loss**: Exact level with reasoning
- **Take Profit**: Conservative and aggressive targets
- **Risk:Reward Ratio**: Calculated R:R
- **Kill Conditions**: 2-3 conditions that should cancel this trade
- **Warnings**: Critical risks the Quant might have missed
- **INFORMATION GAPS**: What additional data would help assess risk? (e.g., "Correlated pairs like DXY would reveal if this is USD-driven", "Economic calendar check needed")

Be paranoid. Assume the market is trying to take your money. Protect capital above all else.`;

const CHAIRMAN_PROMPT = `You are "The Chairman" — the final decision maker of the AI Trading Senate.

ROLE: Synthesize the Quant's technical analysis and the Risk Manager's warnings into a single, actionable trading directive.

CRITICAL RULE — INFORMATION GAPS:
Before issuing a verdict, review both analysts' INFORMATION GAPS sections. If critical information is missing that could materially change the trade decision, you MUST request it from the trader instead of guessing.

DECISION FRAMEWORK:
1. Review the Quant's technical thesis — is it sound and well-supported?
2. Review the Risk Manager's objections — are the risks manageable?
3. Check INFORMATION GAPS from both analysts — is anything critical missing?
4. If critical info is missing, output a REQUEST FOR INFORMATION instead of a verdict
5. Resolve any conflicts between the two analyses
6. If both agree, increase confidence. If they disagree, lean conservative.

IF INFORMATION IS SUFFICIENT — OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [timeframe analyzed]
**ENTRY**: [exact price or "market"]
**STOP LOSS**: [exact price]
**TAKE PROFIT**: [exact price]
**RISK:REWARD**: [ratio like 1:2.5]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences explaining the decision]
**DISSENT**: [note any unresolved disagreement between Quant and Risk Manager]

IF CRITICAL INFORMATION IS MISSING — OUTPUT FORMAT:
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [current confidence without the missing info]%
**PRELIMINARY_BIAS**: [which way you're leaning and why]
**QUESTIONS**: [numbered list of specific questions or chart requests, e.g.:]
1. Can you provide the Daily (D1) chart for this pair? The higher timeframe structure is unclear.
2. What is the current DXY (Dollar Index) doing? This looks USD-driven.
3. Are there any high-impact news events in the next 4 hours?
4. Can you show the [correlated pair] chart? Need to confirm this isn't a false divergence.
**WHAT_EACH_ANSWER_CHANGES**: [brief note on how each answer would affect the verdict]

Rules:
- If confidence is below 60%, the verdict MUST be NO TRADE (or NEED_MORE_INFO if info could raise it).
- If Risk Manager rates risk as EXTREME, the verdict MUST be NO TRADE.
- Never recommend a trade with R:R below 1:1.5.
- Be decisive. But also be honest when you don't have enough data.
- NEED_MORE_INFO is NOT weakness — it's discipline.`;

const FOLLOWUP_CHAIRMAN_PROMPT = `You are "The Chairman" — continuing a Senate session where you previously requested more information.

The trader has now provided additional context (possibly more charts, text answers, or both). Review this new evidence alongside the original analysis and issue your FINAL verdict.

You previously had these concerns. The trader's response should address them. If the new info resolves your concerns, issue a confident verdict. If not, you may ask ONE MORE round of questions (max), but prefer to make a call.

OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [timeframe analyzed]
**ENTRY**: [exact price or "market"]
**STOP LOSS**: [exact price]
**TAKE PROFIT**: [exact price]
**RISK:REWARD**: [ratio like 1:2.5]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences explaining the decision]
**DISSENT**: [note any unresolved disagreement]

OR if still critically missing info (LAST CHANCE):
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [%]
**PRELIMINARY_BIAS**: [direction]
**QUESTIONS**: [1-2 final questions only]
**WHAT_EACH_ANSWER_CHANGES**: [brief note]

Rules:
- If confidence is below 60%, verdict MUST be NO TRADE.
- Never recommend R:R below 1:1.5.
- This is at most the SECOND round. After this, you MUST decide.`;

interface RequestBody {
  images: string[];        // array of base64 data URIs
  quantModel?: string;
  riskModel?: string;
  chairmanModel?: string;
  // Follow-up fields
  isFollowUp?: boolean;
  followUpText?: string;
  followUpImages?: string[];
  previousQuant?: string;
  previousRisk?: string;
  previousChairman?: string;
  followUpRound?: number;
}

const ERR = {
  unauthorized: (msg = "Unauthorized") =>
    new Response(JSON.stringify({ error: msg }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
  bad: (msg = "Invalid request") =>
    new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
  internal: (msg = "Unable to process request.") =>
    new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
  rateLimit: () =>
    new Response(JSON.stringify({ error: "Rate limited. Please wait and retry." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
  credits: () =>
    new Response(JSON.stringify({ error: "AI credits exhausted. Check workspace usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
};

async function callAgent(
  apiKey: string,
  systemPrompt: string,
  userContent: Array<{ type: string; text?: string; image_url?: { url: string } }>,
  model: string
): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[SENATE] Agent call failed (${response.status}):`, errText);
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 402) throw new Error("CREDITS_EXHAUSTED");
    throw new Error(`Agent call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "No response from agent.";
}

function buildImageContent(images: string[]): Array<{ type: string; text?: string; image_url?: { url: string } }> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  const count = images.length;
  content.push({ type: "text", text: `Analyze ${count === 1 ? "this" : `these ${count}`} Forex chart screenshot${count > 1 ? "s" : ""} (${count > 1 ? "multiple timeframes provided — use ALL for confluence" : "single timeframe"}):` });
  for (const img of images) {
    const url = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
    content.push({ type: "image_url", image_url: { url } });
  }
  return content;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return ERR.unauthorized();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return ERR.unauthorized();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[SENATE] LOVABLE_API_KEY not configured");
      return ERR.internal();
    }

    const body: RequestBody = await req.json();
    const qModel = body.quantModel || "google/gemini-2.5-pro";
    const rModel = body.riskModel || "google/gemini-2.5-flash";
    const cModel = body.chairmanModel || "google/gemini-2.5-pro";

    // ── FOLLOW-UP FLOW ──
    if (body.isFollowUp) {
      console.log(`[SENATE] Follow-up round ${body.followUpRound || 2}`);
      
      const followUpContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      followUpContent.push({ type: "text", text: `PREVIOUS SESSION CONTEXT:

--- THE QUANT'S ORIGINAL ANALYSIS ---
${body.previousQuant || "N/A"}

--- THE RISK MANAGER'S ORIGINAL ANALYSIS ---
${body.previousRisk || "N/A"}

--- YOUR PREVIOUS RESPONSE (CHAIRMAN) ---
${body.previousChairman || "N/A"}

--- TRADER'S RESPONSE TO YOUR QUESTIONS ---
${body.followUpText || "No text response provided."}

${(body.followUpImages?.length || 0) > 0 ? `The trader has also provided ${body.followUpImages!.length} additional chart(s):` : "No additional charts provided."}` });

      if (body.followUpImages?.length) {
        for (const img of body.followUpImages) {
          const url = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
          followUpContent.push({ type: "image_url", image_url: { url } });
        }
      }

      const prompt = (body.followUpRound || 2) >= 3 ? CHAIRMAN_PROMPT.replace("NEED_MORE_INFO", "NO TRADE") : FOLLOWUP_CHAIRMAN_PROMPT;
      const chairmanResult = await callAgent(LOVABLE_API_KEY, prompt, followUpContent, cModel);
      const verdict = parseVerdict(chairmanResult);
      const needsMore = chairmanResult.includes("**VERDICT**: NEED_MORE_INFO") || chairmanResult.includes("NEED_MORE_INFO");

      return new Response(JSON.stringify({
        chairman: chairmanResult,
        verdict,
        needsMoreInfo: needsMore && (body.followUpRound || 2) < 3,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── INITIAL ANALYSIS FLOW ──
    const images = body.images || [];
    if (images.length === 0) return ERR.bad("At least one image is required");
    if (images.length > 5) return ERR.bad("Maximum 5 images allowed");

    const totalSize = images.reduce((s, img) => s + img.length, 0);
    if (totalSize > 50_000_000) return ERR.bad("Total image data too large (max ~35MB)");

    console.log(`[SENATE] Starting analysis with ${images.length} image(s). Quant=${qModel}, Risk=${rModel}, Chairman=${cModel}`);

    const imageContent = buildImageContent(images);

    const [quantResult, riskResult] = await Promise.all([
      callAgent(LOVABLE_API_KEY, QUANT_PROMPT, imageContent, qModel),
      callAgent(LOVABLE_API_KEY, RISK_MANAGER_PROMPT, imageContent, rModel),
    ]);

    console.log("[SENATE] Phase 1 complete.");

    const chairmanInput: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: `You have received analysis from two senior analysts. Review both alongside the original chart(s) and deliver your verdict.

--- THE QUANT'S ANALYSIS ---
${quantResult}

--- THE RISK MANAGER'S ANALYSIS ---
${riskResult}

Now review the original chart(s):` },
    ];
    for (const img of images) {
      const url = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
      chairmanInput.push({ type: "image_url", image_url: { url } });
    }

    const chairmanResult = await callAgent(LOVABLE_API_KEY, CHAIRMAN_PROMPT, chairmanInput, cModel);
    console.log("[SENATE] Phase 2 complete.");

    const verdict = parseVerdict(chairmanResult);
    const needsMore = chairmanResult.includes("**VERDICT**: NEED_MORE_INFO") || chairmanResult.includes("NEED_MORE_INFO");

    return new Response(JSON.stringify({
      quant: quantResult,
      riskManager: riskResult,
      chairman: chairmanResult,
      verdict,
      needsMoreInfo: needsMore,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[SENATE] Error:", error);
    if (error instanceof Error) {
      if (error.message === "RATE_LIMIT") return ERR.rateLimit();
      if (error.message === "CREDITS_EXHAUSTED") return ERR.credits();
    }
    return ERR.internal();
  }
});

function parseVerdict(text: string): Record<string, string> {
  const fields = ["VERDICT", "PAIR", "TIMEFRAME", "ENTRY", "STOP LOSS", "TAKE PROFIT", "RISK:REWARD", "CONFIDENCE", "RATIONALE", "DISSENT", "PRELIMINARY_BIAS", "QUESTIONS", "WHAT_EACH_ANSWER_CHANGES"];
  const result: Record<string, string> = {};
  for (const field of fields) {
    const regex = new RegExp(`\\*\\*${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:\\s*(.+?)(?=\\n\\*\\*|$)`, "s");
    const match = text.match(regex);
    result[field.toLowerCase().replace(/[: ]/g, "_")] = match?.[1]?.trim() ?? "—";
  }
  return result;
}
