// ═══════════════════════════════════════════════════════════════
// H4 SENTIMENT CONSENSUS ENGINE
// Dual Lite-model sentiment scoring + Black Swan interrupt detection
// Models: Gemini 2.5 Flash Lite + GPT-5 Nano
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface SentimentResult {
  model: string;
  pair: string;
  score: number; // -1 to +1
  confidence: number; // 0-100
  reasoning: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
}

interface ConsensusResult {
  pair: string;
  consensusScore: number; // -1 to +1
  modelA: SentimentResult;
  modelB: SentimentResult;
  agreement: number; // 0-100%
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTED";
}

// ── Sentiment prompt for a single pair ──
function buildSentimentPrompt(pair: string, webhookData?: Record<string, unknown>): string {
  const tvContext = webhookData
    ? `\nTradingView Data:\n- Price: ${webhookData.price}\n- RSI(14): ${webhookData.rsi}\n- EMA 200: ${webhookData.ema200}\n- Signal: ${webhookData.signal || "N/A"}`
    : "\nNo TradingView webhook data available — use general market knowledge.";

  return `You are a forex sentiment analyst. Analyze ${pair} on the H4 timeframe.
${tvContext}

Return a JSON object with exactly these fields:
{
  "score": <number from -1.0 (extreme bearish) to +1.0 (extreme bullish)>,
  "confidence": <number 0-100>,
  "reasoning": "<one sentence explaining your sentiment read>",
  "bias": "<BULLISH|BEARISH|NEUTRAL>"
}

Rules:
- Score MUST be between -1.0 and +1.0
- Be precise: 0.0 = perfectly neutral, ±0.3 = mild, ±0.6 = strong, ±0.9 = extreme
- Consider recent macro events, rate differentials, risk sentiment
- Return ONLY the JSON object, no markdown fences`;
}

// ── Call a single model for sentiment ──
async function callSentimentModel(
  apiKey: string,
  model: string,
  pair: string,
  webhookData?: Record<string, unknown>
): Promise<SentimentResult> {
  const prompt = buildSentimentPrompt(pair, webhookData);

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a quantitative forex sentiment analyst. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[H4-SENTIMENT] ${model} error ${res.status}:`, errText);
    throw new Error(`${model} returned ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";

  // Parse JSON from response (handle markdown fences)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`${model} returned no valid JSON`);

  const parsed = JSON.parse(jsonMatch[0]);
  const score = Math.max(-1, Math.min(1, Number(parsed.score) || 0));

  return {
    model,
    pair,
    score,
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
    reasoning: String(parsed.reasoning || "No reasoning provided"),
    bias: parsed.bias === "BULLISH" ? "BULLISH" : parsed.bias === "BEARISH" ? "BEARISH" : "NEUTRAL",
  };
}

// ── Compute consensus from two model outputs ──
function computeConsensus(a: SentimentResult, b: SentimentResult): ConsensusResult {
  // Weighted average by confidence
  const totalConf = a.confidence + b.confidence || 1;
  const consensusScore = +((a.score * a.confidence + b.score * b.confidence) / totalConf).toFixed(3);

  // Agreement = 100% - (distance between scores * 50)
  const distance = Math.abs(a.score - b.score);
  const agreement = Math.max(0, Math.round((1 - distance) * 100));

  const bias: "BULLISH" | "BEARISH" | "NEUTRAL" =
    consensusScore > 0.15 ? "BULLISH" : consensusScore < -0.15 ? "BEARISH" : "NEUTRAL";

  const absScore = Math.abs(consensusScore);
  const strength: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTED" =
    agreement < 40 ? "CONFLICTED" :
    absScore >= 0.6 ? "STRONG" :
    absScore >= 0.3 ? "MODERATE" : "WEAK";

  return {
    pair: a.pair,
    consensusScore,
    modelA: a,
    modelB: b,
    agreement,
    bias,
    strength,
  };
}

// ── Interrupt detection (Black Swan) ──
interface InterruptAlert {
  pair: string;
  type: "BLACK_SWAN" | "RAPID_SHIFT";
  severity: "CRITICAL" | "WARNING";
  delta: number;
  message: string;
  timestamp: string;
}

function checkInterrupt(
  current: ConsensusResult,
  previous?: { consensusScore: number; timestamp: string }
): InterruptAlert | null {
  if (!previous) return null;

  const delta = Math.abs(current.consensusScore - previous.consensusScore);
  const prevTime = new Date(previous.timestamp).getTime();
  const elapsed = (Date.now() - prevTime) / (1000 * 60); // minutes

  // Black Swan: >0.5 shift within 60 minutes
  if (delta > 0.5 && elapsed <= 60) {
    return {
      pair: current.pair,
      type: "BLACK_SWAN",
      severity: "CRITICAL",
      delta: +delta.toFixed(3),
      message: `⚠️ BLACK SWAN: ${current.pair} sentiment shifted ${delta.toFixed(2)} in ${Math.round(elapsed)}min. Previous: ${previous.consensusScore.toFixed(2)} → Current: ${current.consensusScore.toFixed(2)}`,
      timestamp: new Date().toISOString(),
    };
  }

  // Rapid shift warning: >0.3 within 60 minutes
  if (delta > 0.3 && elapsed <= 60) {
    return {
      pair: current.pair,
      type: "RAPID_SHIFT",
      severity: "WARNING",
      delta: +delta.toFixed(3),
      message: `⚡ RAPID SHIFT: ${current.pair} moved ${delta.toFixed(2)} in ${Math.round(elapsed)}min`,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

// ── H4 Candle Decision Request (Big Model) ──
async function triggerH4Decision(
  apiKey: string,
  pair: string,
  consensus: ConsensusResult,
  webhookData?: Record<string, unknown>
): Promise<{ decision: string; action: string; reasoning: string }> {
  const model = "google/gemini-2.5-pro"; // Big model for H4 decisions

  const prompt = `You are the Chief Trading Strategist at CustomQuantLabs. An H4 candle just closed for ${pair}.

CONSENSUS DATA:
- Score: ${consensus.consensusScore} (${consensus.bias}, ${consensus.strength})
- Model A (${consensus.modelA.model}): ${consensus.modelA.score} — ${consensus.modelA.reasoning}
- Model B (${consensus.modelB.model}): ${consensus.modelB.score} — ${consensus.modelB.reasoning}
- Agreement: ${consensus.agreement}%
${webhookData ? `\nTRADINGVIEW DATA:\n- Price: ${webhookData.price}\n- RSI: ${webhookData.rsi}\n- EMA200: ${webhookData.ema200}` : ""}

Provide your H4 decision. Return JSON:
{
  "decision": "<LONG|SHORT|STAY_OUT>",
  "action": "<specific action like 'Enter long at market' or 'Wait for pullback'>",
  "reasoning": "<2-3 sentences with institutional-grade reasoning>"
}

Return ONLY the JSON object.`;

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an elite forex strategist. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[H4-DECISION] Big model error:", res.status, t);
    return { decision: "ERROR", action: "Model unavailable", reasoning: t.slice(0, 200) };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { decision: "PARSE_ERROR", action: "Failed to parse", reasoning: raw.slice(0, 200) };

  return JSON.parse(match[0]);
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body = await req.json();
    const {
      action = "consensus",       // "consensus" | "h4_decision" | "full_cycle"
      pairs = ["EUR/USD", "GBP/USD", "USD/JPY"],
      webhookData,                // Optional: { price, rsi, ema200, signal }
      previousScores,             // Optional: { "EUR/USD": { consensusScore, timestamp } }
    } = body;

    const MODEL_A = "google/gemini-2.5-flash-lite";
    const MODEL_B = "openai/gpt-5-nano";

    if (action === "consensus" || action === "full_cycle") {
      const results: ConsensusResult[] = [];
      const interrupts: InterruptAlert[] = [];

      for (const pair of pairs) {
        try {
          const [resultA, resultB] = await Promise.all([
            callSentimentModel(LOVABLE_API_KEY, MODEL_A, pair, webhookData?.[pair]),
            callSentimentModel(LOVABLE_API_KEY, MODEL_B, pair, webhookData?.[pair]),
          ]);

          const consensus = computeConsensus(resultA, resultB);
          results.push(consensus);

          // Check for interrupts
          const prev = previousScores?.[pair];
          const interrupt = checkInterrupt(consensus, prev);
          if (interrupt) interrupts.push(interrupt);
        } catch (err: any) {
          console.error(`[H4-SENTIMENT] ${pair} failed:`, err.message);
          results.push({
            pair,
            consensusScore: 0,
            modelA: { model: MODEL_A, pair, score: 0, confidence: 0, reasoning: err.message, bias: "NEUTRAL" },
            modelB: { model: MODEL_B, pair, score: 0, confidence: 0, reasoning: "Skipped due to error", bias: "NEUTRAL" },
            agreement: 0,
            bias: "NEUTRAL",
            strength: "WEAK",
          });
        }
      }

      // If full_cycle, also trigger H4 decision for the strongest signal
      let h4Decision = null;
      if (action === "full_cycle" && results.length > 0) {
        const strongest = results.reduce((a, b) =>
          Math.abs(a.consensusScore) > Math.abs(b.consensusScore) ? a : b
        );
        if (Math.abs(strongest.consensusScore) >= 0.3) {
          h4Decision = await triggerH4Decision(LOVABLE_API_KEY, strongest.pair, strongest, webhookData?.[strongest.pair]);
          h4Decision = { ...h4Decision, pair: strongest.pair };
        }
      }

      return json({
        consensus: results,
        interrupts,
        h4Decision,
        timestamp: new Date().toISOString(),
        models: { liteA: MODEL_A, liteB: MODEL_B, big: "google/gemini-2.5-pro" },
      });
    }

    if (action === "h4_decision") {
      const pair = pairs[0] || "EUR/USD";
      // Need to run consensus first
      const [resultA, resultB] = await Promise.all([
        callSentimentModel(LOVABLE_API_KEY, MODEL_A, pair, webhookData?.[pair]),
        callSentimentModel(LOVABLE_API_KEY, MODEL_B, pair, webhookData?.[pair]),
      ]);
      const consensus = computeConsensus(resultA, resultB);
      const decision = await triggerH4Decision(LOVABLE_API_KEY, pair, consensus, webhookData?.[pair]);

      return json({
        consensus,
        h4Decision: { ...decision, pair },
        timestamp: new Date().toISOString(),
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[H4-SENTIMENT] Error:", err);
    return json({ error: (err as Error).message || "Unknown error" }, 500);
  }
});
