import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Persona System Prompts ──

const QUANT_PROMPT = `You are "The Quant" — a senior quantitative technical analyst with 20 years of experience.

ROLE: Analyze the provided Forex chart screenshot with laser precision.

ANALYSIS FRAMEWORK:
1. **Price Action**: Identify candlestick patterns, support/resistance levels, trend structure (HH/HL or LH/LL)
2. **Key Levels**: Mark significant price levels, order blocks, fair value gaps, and liquidity pools
3. **Momentum**: Assess trend strength, divergences, and potential exhaustion signals
4. **Volume Profile**: Note any volume anomalies, climactic volume, or dry-up zones
5. **Pattern Recognition**: Identify chart patterns (wedges, channels, H&S, double tops/bottoms)
6. **Algorithmic Signatures**: Look for stop hunts, liquidity sweeps, and institutional footprints

OUTPUT FORMAT:
- **Pair & Timeframe**: (identify from chart if possible)
- **Trend Structure**: Current bias with supporting evidence
- **Key Levels**: List 3-5 critical price levels
- **Entry Zone**: Optimal entry area with reasoning
- **Technical Score**: 1-10 (how clean is this setup?)
- **Raw Analysis**: 3-5 bullet points of key observations

Be precise. Use numbers. No fluff. Think like an algorithm.`;

const RISK_MANAGER_PROMPT = `You are "The Risk Manager" — the chief skeptic and downside protector.

ROLE: Challenge every bullish or bearish thesis. Your job is to find what could go WRONG.

ANALYSIS FRAMEWORK:
1. **Trap Detection**: Is this a potential bull/bear trap? Liquidity sweep before reversal?
2. **Against-Trend Risk**: What's the probability this is a counter-trend move about to fail?
3. **Liquidity Mapping**: Where are the stop clusters? Where will market makers hunt?
4. **Invalidation Levels**: At what exact price does every thesis break?
5. **Risk:Reward Calculation**: Calculate strict R:R based on realistic SL and TP levels
6. **Correlation Risk**: Consider if the move is driven by USD strength/weakness affecting multiple pairs
7. **Time Risk**: Is there an economic event that could invalidate this setup?

OUTPUT FORMAT:
- **Risk Rating**: LOW / MEDIUM / HIGH / EXTREME
- **Trap Probability**: 0-100% (is this a fake move?)
- **Stop Loss**: Exact level with reasoning
- **Take Profit**: Conservative and aggressive targets
- **Risk:Reward Ratio**: Calculated R:R
- **Kill Conditions**: 2-3 conditions that should cancel this trade
- **Warnings**: Critical risks the Quant might have missed

Be paranoid. Assume the market is trying to take your money. Protect capital above all else.`;

const CHAIRMAN_PROMPT = `You are "The Chairman" — the final decision maker of the AI Trading Senate.

ROLE: Synthesize the Quant's technical analysis and the Risk Manager's warnings into a single, actionable trading directive.

DECISION FRAMEWORK:
1. Review the Quant's technical thesis — is it sound and well-supported?
2. Review the Risk Manager's objections — are the risks manageable?
3. Resolve any conflicts between the two analyses
4. If both agree, increase confidence. If they disagree, lean conservative.
5. Output a FINAL VERDICT with no ambiguity.

OUTPUT FORMAT (use EXACTLY this structure with these headers):
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

Rules:
- If confidence is below 60%, the verdict MUST be NO TRADE.
- If Risk Manager rates risk as EXTREME, the verdict MUST be NO TRADE.
- Never recommend a trade with R:R below 1:1.5.
- Be decisive. Analysts present data; you make the call.`;

interface RequestBody {
  imageBase64: string;
  quantModel?: string;
  riskModel?: string;
  chairmanModel?: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──
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

    // ── Parse body ──
    const body: RequestBody = await req.json();
    const { imageBase64, quantModel, riskModel, chairmanModel } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return ERR.bad("imageBase64 is required");
    }
    // Cap image size at ~10MB base64
    if (imageBase64.length > 14_000_000) {
      return ERR.bad("Image too large (max ~10MB)");
    }

    const qModel = quantModel || "google/gemini-2.5-pro";
    const rModel = riskModel || "google/gemini-2.5-flash";
    const cModel = chairmanModel || "google/gemini-2.5-pro";

    console.log(`[SENATE] Starting analysis. Quant=${qModel}, Risk=${rModel}, Chairman=${cModel}`);

    const imageContent = [
      { type: "text" as const, text: "Analyze this Forex chart screenshot:" },
      { type: "image_url" as const, image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}` } },
    ];

    // ── Phase 1: Quant + Risk Manager in parallel ──
    const [quantResult, riskResult] = await Promise.all([
      callAgent(LOVABLE_API_KEY, QUANT_PROMPT, imageContent, qModel),
      callAgent(LOVABLE_API_KEY, RISK_MANAGER_PROMPT, imageContent, rModel),
    ]);

    console.log("[SENATE] Phase 1 complete. Quant and Risk Manager delivered.");

    // ── Phase 2: Chairman synthesizes ──
    const chairmanInput = [
      { type: "text" as const, text: `You have received analysis from two senior analysts. Review both alongside the original chart and deliver your final verdict.

--- THE QUANT'S ANALYSIS ---
${quantResult}

--- THE RISK MANAGER'S ANALYSIS ---
${riskResult}

Now review the original chart:` },
      { type: "image_url" as const, image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}` } },
    ];

    const chairmanResult = await callAgent(LOVABLE_API_KEY, CHAIRMAN_PROMPT, chairmanInput, cModel);

    console.log("[SENATE] Phase 2 complete. Chairman has spoken.");

    // ── Parse Chairman's verdict ──
    const verdict = parseVerdict(chairmanResult);

    return new Response(JSON.stringify({
      quant: quantResult,
      riskManager: riskResult,
      chairman: chairmanResult,
      verdict,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
  const fields = ["VERDICT", "PAIR", "TIMEFRAME", "ENTRY", "STOP LOSS", "TAKE PROFIT", "RISK:REWARD", "CONFIDENCE", "RATIONALE", "DISSENT"];
  const result: Record<string, string> = {};
  for (const field of fields) {
    const regex = new RegExp(`\\*\\*${field}\\*\\*:\\s*(.+?)(?=\\n\\*\\*|$)`, "s");
    const match = text.match(regex);
    result[field.toLowerCase().replace(/[: ]/g, "_")] = match?.[1]?.trim() ?? "—";
  }
  return result;
}
