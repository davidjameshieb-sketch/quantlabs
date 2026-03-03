import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── OANDA Data Fetching ──

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

const CORRELATION_MAP: Record<string, string[]> = {
  EUR_USD: ["DXY", "GBP_USD", "USD_CHF"],
  GBP_USD: ["DXY", "EUR_USD", "EUR_GBP"],
  USD_JPY: ["DXY", "EUR_JPY", "GBP_JPY"],
  AUD_USD: ["DXY", "NZD_USD", "USD_CAD"],
  NZD_USD: ["DXY", "AUD_USD", "AUD_NZD"],
  USD_CAD: ["DXY", "AUD_USD", "USD_CHF"],
  USD_CHF: ["DXY", "EUR_USD", "EUR_CHF"],
  EUR_JPY: ["EUR_USD", "USD_JPY", "GBP_JPY"],
  GBP_JPY: ["GBP_USD", "USD_JPY", "EUR_JPY"],
  EUR_GBP: ["EUR_USD", "GBP_USD", "EUR_JPY"],
  AUD_JPY: ["AUD_USD", "USD_JPY", "NZD_JPY"],
  CAD_JPY: ["USD_CAD", "USD_JPY", "AUD_JPY"],
  CHF_JPY: ["USD_CHF", "USD_JPY", "EUR_CHF"],
  NZD_JPY: ["NZD_USD", "USD_JPY", "AUD_JPY"],
  EUR_CHF: ["EUR_USD", "USD_CHF", "GBP_CHF"],
  GBP_CHF: ["GBP_USD", "USD_CHF", "EUR_CHF"],
  AUD_NZD: ["AUD_USD", "NZD_USD", "AUD_JPY"],
  EUR_AUD: ["EUR_USD", "AUD_USD", "AUD_JPY"],
  GBP_AUD: ["GBP_USD", "AUD_USD", "EUR_AUD"],
  EUR_CAD: ["EUR_USD", "USD_CAD", "GBP_CAD"],
  GBP_CAD: ["GBP_USD", "USD_CAD", "EUR_CAD"],
  AUD_CAD: ["AUD_USD", "USD_CAD", "NZD_CAD"],
  EUR_NZD: ["EUR_USD", "NZD_USD", "AUD_NZD"],
  GBP_NZD: ["GBP_USD", "NZD_USD", "EUR_NZD"],
};

function getOandaCredentials() {
  const env = Deno.env.get("OANDA_ENV") || "practice";
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  return { apiToken, accountId, host, env };
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchCandles(
  host: string, accountId: string, apiToken: string,
  instrument: string, granularity: string, count: number
): Promise<CandleData[]> {
  const url = `${host}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`[SENATE-OANDA] Candle fetch failed for ${instrument} ${granularity}: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.candles || [])
    .filter((c: any) => c.complete)
    .map((c: any) => ({
      time: c.time,
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}

async function fetchLivePrice(
  host: string, accountId: string, apiToken: string, instrument: string
): Promise<{ bid: number; ask: number; spread: number } | null> {
  const url = `${host}/v3/accounts/${accountId}/pricing?instruments=${instrument}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.prices?.[0];
  if (!p?.bids?.length || !p?.asks?.length) return null;
  const bid = parseFloat(p.bids[0].price);
  const ask = parseFloat(p.asks[0].price);
  const isJpy = instrument.includes("JPY");
  const pipFactor = isJpy ? 100 : 10000;
  return { bid, ask, spread: Math.round((ask - bid) * pipFactor * 10) / 10 };
}

function computeATR(candles: CandleData[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc.close), Math.abs(c.low - pc.close));
    trs.push(tr);
  }
  const recentTRs = trs.slice(-period);
  return recentTRs.reduce((s, v) => s + v, 0) / recentTRs.length;
}

function summarizeCandles(candles: CandleData[], count = 10): string {
  const recent = candles.slice(-count);
  return recent.map(c => {
    const t = c.time.substring(0, 16).replace("T", " ");
    return `${t} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`;
  }).join("\n");
}

async function buildOandaContext(pair: string): Promise<{ context: string; livePrice: { bid: number; ask: number; spread: number } | null }> {
  const { apiToken, accountId, host } = getOandaCredentials();
  if (!apiToken || !accountId) {
    console.warn("[SENATE-OANDA] No OANDA credentials configured");
    return { context: "", livePrice: null };
  }

  const instrument = pair.replace("/", "_");
  const correlatedPairs = (CORRELATION_MAP[instrument] || []).filter(p => p !== "DXY"); // skip DXY - not available on OANDA

  console.log(`[SENATE-OANDA] Fetching data for ${instrument} + correlated: ${correlatedPairs.join(", ")}`);

  // Fetch primary pair data across timeframes + live price
  const [h4Candles, h1Candles, m15Candles, m5Candles, livePrice] = await Promise.all([
    fetchCandles(host, accountId, apiToken, instrument, "H4", 30),
    fetchCandles(host, accountId, apiToken, instrument, "H1", 50),
    fetchCandles(host, accountId, apiToken, instrument, "M15", 40),
    fetchCandles(host, accountId, apiToken, instrument, "M5", 40),
    fetchLivePrice(host, accountId, apiToken, instrument),
  ]);

  // Fetch correlated pairs (just H1 for context)
  const correlatedData: Record<string, { candles: CandleData[]; price: { bid: number; ask: number; spread: number } | null }> = {};
  await Promise.all(
    correlatedPairs.map(async (cp) => {
      const [candles, price] = await Promise.all([
        fetchCandles(host, accountId, apiToken, cp, "H1", 20),
        fetchLivePrice(host, accountId, apiToken, cp),
      ]);
      correlatedData[cp] = { candles, price };
    })
  );

  // Build context string
  const isJpy = instrument.includes("JPY");
  const pipFactor = isJpy ? 100 : 10000;
  const h4ATR = computeATR(h4Candles);
  const h1ATR = computeATR(h1Candles);
  const m15ATR = computeATR(m15Candles);

  let ctx = `\n\n═══ LIVE OANDA MARKET DATA ═══\n`;
  ctx += `Pair: ${pair}\n`;
  if (livePrice) {
    ctx += `Live Bid: ${livePrice.bid} | Ask: ${livePrice.ask} | Spread: ${livePrice.spread} pips\n`;
  }
  ctx += `\n── ATR (Average True Range) ──\n`;
  ctx += `H4 ATR(14): ${(h4ATR * pipFactor).toFixed(1)} pips\n`;
  ctx += `H1 ATR(14): ${(h1ATR * pipFactor).toFixed(1)} pips\n`;
  ctx += `M15 ATR(14): ${(m15ATR * pipFactor).toFixed(1)} pips\n`;

  // H4 summary
  if (h4Candles.length > 0) {
    const h4Last = h4Candles[h4Candles.length - 1];
    const h4First = h4Candles[0];
    const h4Range = ((Math.max(...h4Candles.map(c => c.high)) - Math.min(...h4Candles.map(c => c.low))) * pipFactor).toFixed(1);
    ctx += `\n── H4 (${h4Candles.length} candles) ──\n`;
    ctx += `Range: ${h4Range} pips | Recent trend: ${h4Last.close > h4First.close ? "BULLISH" : "BEARISH"}\n`;
    ctx += `Recent H4 candles:\n${summarizeCandles(h4Candles, 8)}\n`;
  }

  // H1 summary
  if (h1Candles.length > 0) {
    const h1Last = h1Candles[h1Candles.length - 1];
    const h1First = h1Candles[Math.max(0, h1Candles.length - 20)];
    ctx += `\n── H1 (${h1Candles.length} candles) ──\n`;
    ctx += `Recent 20-bar trend: ${h1Last.close > h1First.close ? "BULLISH" : "BEARISH"}\n`;
    ctx += `Recent H1 candles:\n${summarizeCandles(h1Candles, 10)}\n`;
  }

  // M15 summary
  if (m15Candles.length > 0) {
    ctx += `\n── M15 (${m15Candles.length} candles) ──\n`;
    ctx += `Recent M15 candles:\n${summarizeCandles(m15Candles, 8)}\n`;
  }

  // M5 summary
  if (m5Candles.length > 0) {
    ctx += `\n── M5 (${m5Candles.length} candles) ──\n`;
    ctx += `Recent M5 candles:\n${summarizeCandles(m5Candles, 8)}\n`;
  }

  // Correlated pairs
  if (Object.keys(correlatedData).length > 0) {
    ctx += `\n── CORRELATED PAIRS ──\n`;
    for (const [cp, data] of Object.entries(correlatedData)) {
      const displayPair = cp.replace("_", "/");
      if (data.price) {
        ctx += `${displayPair}: Bid ${data.price.bid} | Ask ${data.price.ask} | Spread ${data.price.spread} pips`;
      }
      if (data.candles.length > 0) {
        const last = data.candles[data.candles.length - 1];
        const first = data.candles[Math.max(0, data.candles.length - 10)];
        ctx += ` | 10-bar H1 trend: ${last.close > first.close ? "UP" : "DOWN"}`;
      }
      ctx += "\n";
    }
  }

  ctx += `═══ END OANDA DATA ═══\n`;
  return { context: ctx, livePrice };
}

// ── Persona System Prompts ──

const QUANT_PROMPT = `You are "The Quant" — a senior quantitative technical analyst with 20 years of experience.

ROLE: Analyze the provided Forex chart screenshot(s) with laser precision. You may receive multiple charts across different timeframes — use ALL of them for multi-timeframe confluence. You will ALSO receive live OANDA market data with exact prices, spreads, ATR values, and recent candle history — use this data to validate what you see in the charts.

ANALYSIS FRAMEWORK:
1. **Multi-Timeframe Confluence**: If multiple charts are provided, analyze each timeframe and note where they agree/disagree. Cross-reference with the OANDA candle data for precision.
2. **Price Action**: Identify candlestick patterns, support/resistance levels, trend structure (HH/HL or LH/LL)
3. **Key Levels**: Mark significant price levels using the exact OANDA prices provided. Reference specific bid/ask levels.
4. **Momentum**: Assess trend strength using ATR data and recent candle patterns. Compare ATR across timeframes.
5. **Spread & Execution**: Note the current spread and whether it's suitable for entry.
6. **Volume Profile**: Note any volume anomalies from the OANDA volume data.
7. **Pattern Recognition**: Identify chart patterns (wedges, channels, H&S, double tops/bottoms)
8. **Algorithmic Signatures**: Look for stop hunts, liquidity sweeps, and institutional footprints
9. **Correlated Pairs**: Use the correlated pair data to confirm or deny the thesis. Are correlated pairs confirming the move?

OUTPUT FORMAT:
- **Pair & Timeframes**: (identify from charts + OANDA data)
- **Live Price**: Current bid/ask/spread from OANDA
- **Multi-TF Alignment**: Do the timeframes agree? Where do they conflict? What does the candle data show vs the charts?
- **Trend Structure**: Current bias with supporting evidence from both charts AND OANDA data
- **ATR Context**: Current volatility regime (low/normal/high) based on ATR values
- **Key Levels**: List 3-5 critical price levels (use exact OANDA prices)
- **Entry Zone**: Optimal entry area with reasoning, accounting for current spread
- **Correlated Pairs**: Confirmation or divergence from correlated instruments
- **Technical Score**: 1-10 (how clean is this setup?)
- **Raw Analysis**: 3-5 bullet points of key observations
- **INFORMATION GAPS**: List anything you wish you could see but can't

Be precise. Use numbers. No fluff. Think like an algorithm.`;

const RISK_MANAGER_PROMPT = `You are "The Risk Manager" — the chief skeptic and downside protector.

ROLE: Challenge every bullish or bearish thesis. Your job is to find what could go WRONG. You may receive multiple charts across different timeframes AND live OANDA market data. Use the live data to calculate precise risk metrics.

ANALYSIS FRAMEWORK:
1. **Trap Detection**: Is this a potential bull/bear trap? Liquidity sweep before reversal?
2. **Against-Trend Risk**: What's the probability this is a counter-trend move about to fail?
3. **Liquidity Mapping**: Where are the stop clusters? Where will market makers hunt?
4. **Invalidation Levels**: At what exact price does every thesis break? Use OANDA bid/ask for precise levels.
5. **Risk:Reward Calculation**: Calculate strict R:R using the exact OANDA prices. Account for spread in SL/TP calculations.
6. **ATR-Based Stops**: Validate that stop distances make sense relative to ATR values. A stop within 0.5x ATR is too tight.
7. **Spread Risk**: Is the current spread acceptable? Calculate spread as % of target move.
8. **Correlation Risk**: Use the correlated pair data — are they confirming or diverging? Divergence = higher risk.
9. **Time Risk**: Is there an economic event that could invalidate this setup?
10. **Timeframe Conflict**: If lower TF says buy but higher TF says sell, that's a RED FLAG

OUTPUT FORMAT:
- **Risk Rating**: LOW / MEDIUM / HIGH / EXTREME
- **Trap Probability**: 0-100% (is this a fake move?)
- **Stop Loss**: Exact level with reasoning (must be beyond ATR noise)
- **Take Profit**: Conservative and aggressive targets
- **Risk:Reward Ratio**: Calculated R:R (account for spread)
- **Spread Assessment**: Current spread impact on the trade
- **ATR Stop Validation**: Is the proposed SL > 1x ATR(M15)? If not, flag it.
- **Correlation Check**: Do correlated pairs confirm or deny?
- **Kill Conditions**: 2-3 conditions that should cancel this trade
- **Warnings**: Critical risks the Quant might have missed
- **INFORMATION GAPS**: What additional data would help assess risk?

Be paranoid. Assume the market is trying to take your money. Protect capital above all else.`;

const CHAIRMAN_PROMPT = `You are "The Chairman" — the final decision maker of the AI Trading Senate.

ROLE: Synthesize the Quant's technical analysis and the Risk Manager's warnings into a single, actionable trading directive. You also have access to live OANDA market data — use it for precision in your entry, SL, and TP levels.

CRITICAL RULE — INFORMATION GAPS:
Before issuing a verdict, review both analysts' INFORMATION GAPS sections. If critical information is missing that could materially change the trade decision, you MUST request it from the trader instead of guessing.

DECISION FRAMEWORK:
1. Review the Quant's technical thesis — is it sound and well-supported by both charts AND live data?
2. Review the Risk Manager's objections — are the risks manageable?
3. Check INFORMATION GAPS from both analysts — is anything critical missing?
4. Verify entry/SL/TP levels make sense with current live prices and spread
5. Ensure R:R accounts for spread cost
6. If critical info is missing, output a REQUEST FOR INFORMATION instead of a verdict
7. Resolve any conflicts between the two analyses
8. If both agree, increase confidence. If they disagree, lean conservative.

IF INFORMATION IS SUFFICIENT — OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [timeframe analyzed]
**ENTRY**: [exact price or "market" — use OANDA live price]
**STOP LOSS**: [exact price — must be ATR-validated]
**TAKE PROFIT**: [exact price]
**RISK:REWARD**: [ratio like 1:2.5 — net of spread]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences explaining the decision]
**DISSENT**: [note any unresolved disagreement between Quant and Risk Manager]

IF CRITICAL INFORMATION IS MISSING — OUTPUT FORMAT:
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [current confidence without the missing info]%
**PRELIMINARY_BIAS**: [which way you're leaning and why]
**QUESTIONS**: [numbered list of specific questions or chart requests]
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
  images: string[];
  timeframeLabels?: string[];
  pair?: string;  // e.g. "EUR_USD" or "EUR/USD"
  quantModel?: string;
  riskModel?: string;
  chairmanModel?: string;
  isFollowUp?: boolean;
  followUpText?: string;
  followUpImages?: string[];
  followUpTimeframeLabels?: string[];
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

function buildImageContent(images: string[], labels?: string[], oandaContext?: string): Array<{ type: string; text?: string; image_url?: { url: string } }> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  const count = images.length;
  const hasLabels = labels && labels.length === count;
  const labelList = hasLabels ? labels!.join(", ") : `${count} chart(s)`;
  
  let intro = `Analyze ${count === 1 ? "this" : `these ${count}`} Forex chart screenshot${count > 1 ? "s" : ""}. ${hasLabels ? `Timeframes provided: ${labelList}. Each image is labeled below.` : `${count > 1 ? "Multiple timeframes provided — use ALL for confluence." : "Single timeframe."}`}`;
  
  if (oandaContext) {
    intro += `\n\nYou also have LIVE OANDA market data below. Use this for precise price levels, spread assessment, ATR-based stop validation, and correlated pair confirmation.\n${oandaContext}`;
  }
  
  content.push({ type: "text", text: intro });
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (hasLabels) {
      content.push({ type: "text", text: `--- ${labels![i]} chart ---` });
    }
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

    // Fetch OANDA data if pair is provided
    let oandaContext = "";
    let livePrice: { bid: number; ask: number; spread: number } | null = null;
    if (body.pair) {
      const pairNormalized = body.pair.replace("/", "_");
      console.log(`[SENATE] Fetching OANDA data for ${pairNormalized}`);
      try {
        const oandaResult = await buildOandaContext(pairNormalized);
        oandaContext = oandaResult.context;
        livePrice = oandaResult.livePrice;
        console.log(`[SENATE] OANDA data fetched (${oandaContext.length} chars)`);
      } catch (e) {
        console.error("[SENATE] OANDA data fetch failed (non-fatal):", e);
      }
    }

    // ── FOLLOW-UP FLOW ──
    if (body.isFollowUp) {
      console.log(`[SENATE] Follow-up round ${body.followUpRound || 2}`);
      
      const followUpContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      let contextBlock = `PREVIOUS SESSION CONTEXT:

--- THE QUANT'S ORIGINAL ANALYSIS ---
${body.previousQuant || "N/A"}

--- THE RISK MANAGER'S ORIGINAL ANALYSIS ---
${body.previousRisk || "N/A"}

--- YOUR PREVIOUS RESPONSE (CHAIRMAN) ---
${body.previousChairman || "N/A"}

--- TRADER'S RESPONSE TO YOUR QUESTIONS ---
${body.followUpText || "No text response provided."}

${(body.followUpImages?.length || 0) > 0 ? `The trader has also provided ${body.followUpImages!.length} additional chart(s)${body.followUpTimeframeLabels?.length ? ` (timeframes: ${body.followUpTimeframeLabels.join(", ")})` : ""}:` : "No additional charts provided."}`;

      if (oandaContext) {
        contextBlock += `\n\nUPDATED LIVE OANDA DATA:\n${oandaContext}`;
      }

      followUpContent.push({ type: "text", text: contextBlock });

      if (body.followUpImages?.length) {
        const fuLabels = body.followUpTimeframeLabels || [];
        for (let i = 0; i < body.followUpImages.length; i++) {
          const img = body.followUpImages[i];
          if (fuLabels[i]) followUpContent.push({ type: "text", text: `--- ${fuLabels[i]} chart ---` });
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
        livePrice,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── INITIAL ANALYSIS FLOW ──
    const images = body.images || [];
    const labels = body.timeframeLabels || [];
    if (images.length === 0) return ERR.bad("At least one image is required");
    if (images.length > 7) return ERR.bad("Maximum 7 images allowed");

    const totalSize = images.reduce((s, img) => s + img.length, 0);
    if (totalSize > 50_000_000) return ERR.bad("Total image data too large (max ~35MB)");

    const labelInfo = labels.length > 0 ? ` Timeframes: ${labels.join(", ")}` : "";
    const pairInfo = body.pair ? ` Pair: ${body.pair}` : "";
    console.log(`[SENATE] Starting analysis with ${images.length} image(s).${labelInfo}${pairInfo} Quant=${qModel}, Risk=${rModel}, Chairman=${cModel}`);

    const imageContent = buildImageContent(images, labels.length > 0 ? labels : undefined, oandaContext);

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

${oandaContext ? `--- LIVE OANDA MARKET DATA ---\n${oandaContext}\n` : ""}Now review the original chart(s)${labels.length > 0 ? ` (timeframes: ${labels.join(", ")})` : ""}:` },
    ];
    for (let i = 0; i < images.length; i++) {
      if (labels[i]) chairmanInput.push({ type: "text", text: `--- ${labels[i]} chart ---` });
      const url = images[i].startsWith("data:") ? images[i] : `data:image/png;base64,${images[i]}`;
      chairmanInput.push({ type: "image_url", image_url: { url } });
    }

    const chairmanResult = await callAgent(LOVABLE_API_KEY, CHAIRMAN_PROMPT, chairmanInput, cModel);
    console.log("[SENATE] Phase 2 complete.");

    const verdict = parseVerdict(chairmanResult);
    const needsMore = chairmanResult.includes("**VERDICT**: NEED_MORE_INFO") || chairmanResult.includes("NEED_MORE_INFO");
    const agreement = computeAgreement(quantResult, riskResult, chairmanResult);

    return new Response(JSON.stringify({
      quant: quantResult,
      riskManager: riskResult,
      chairman: chairmanResult,
      verdict,
      needsMoreInfo: needsMore,
      livePrice,
      agreement,
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

function extractDirectionVote(text: string): "LONG" | "SHORT" | "STAY_OUT" {
  const lower = text.toLowerCase();
  // Look for explicit verdict/bias keywords
  const buySignals = ["buy", "long", "bullish bias", "bullish setup", "bullish reversal", "upside", "go long"];
  const sellSignals = ["sell", "short", "bearish bias", "bearish setup", "bearish reversal", "downside", "go short"];
  const stayOutSignals = ["no trade", "stay out", "avoid", "extreme risk", "risk rating: extreme", "not recommended", "wait for"];

  let buyScore = 0, sellScore = 0, stayOutScore = 0;
  for (const s of stayOutSignals) if (lower.includes(s)) stayOutScore += 3;
  for (const s of buySignals) if (lower.includes(s)) buyScore += 1;
  for (const s of sellSignals) if (lower.includes(s)) sellScore += 1;

  if (stayOutScore >= 3) return "STAY_OUT";
  if (buyScore > sellScore && buyScore > 0) return "LONG";
  if (sellScore > buyScore && sellScore > 0) return "SHORT";
  return "STAY_OUT";
}

function computeAgreement(
  quantText: string,
  riskText: string,
  chairmanText: string
): { long_pct: number; short_pct: number; stay_out_pct: number; consensus: string } {
  const votes = [
    extractDirectionVote(quantText),
    extractDirectionVote(riskText),
    extractDirectionVote(chairmanText),
  ];

  const counts = { LONG: 0, SHORT: 0, STAY_OUT: 0 };
  for (const v of votes) counts[v]++;

  const total = 3;
  const long_pct = Math.round((counts.LONG / total) * 100);
  const short_pct = Math.round((counts.SHORT / total) * 100);
  const stay_out_pct = Math.round((counts.STAY_OUT / total) * 100);

  let consensus = "SPLIT";
  if (counts.LONG === 3) consensus = "UNANIMOUS LONG";
  else if (counts.SHORT === 3) consensus = "UNANIMOUS SHORT";
  else if (counts.STAY_OUT === 3) consensus = "UNANIMOUS STAY OUT";
  else if (counts.LONG === 2) consensus = "MAJORITY LONG";
  else if (counts.SHORT === 2) consensus = "MAJORITY SHORT";
  else if (counts.STAY_OUT === 2) consensus = "MAJORITY STAY OUT";

  return { long_pct, short_pct, stay_out_pct, consensus };
}
