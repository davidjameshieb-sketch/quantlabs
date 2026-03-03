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

const QUANT_PROMPT = `You are "The Quant" — a professional price action trader who has traded institutional FX flow for 20 years at top-tier banks (JPMorgan, Citi, Deutsche).

You think in ORDER FLOW, not indicators. You read the market the way a floor trader reads the tape.

YOUR EDGE — WHAT MAKES YOU DIFFERENT:
You see the market as an auction. Every price movement is buyers vs sellers. You identify WHERE the money is positioned and WHERE it needs to go next. You trade structure, not signals.

CORE METHODOLOGY:
1. **Market Structure First**: Identify the dominant structure — is price making Higher Highs/Higher Lows (bullish) or Lower Highs/Lower Lows (bearish)? A break of structure (BOS) is the most important signal. Use OANDA candle data to pinpoint exact swing levels.
2. **Liquidity Pools**: Where are retail stops clustered? Equal highs = sell-side liquidity target. Equal lows = buy-side liquidity target. Price WILL hunt these levels before reversing. Mark these with precision using OANDA prices.
3. **Order Blocks & Fair Value Gaps (FVG)**: Identify the last down-candle before a strong up-move (bullish OB) or vice versa. Fair Value Gaps are imbalances price must rebalance. These are your entry zones.
4. **Multi-Timeframe Narrative**: H4 sets the story (trend direction). H1 gives the chapter (current leg). M15 gives the paragraph (entry timing). M5 gives the sentence (execution). ALL must align. If H4 is bearish but M15 is bullish, that's a pullback — NOT a buy.
5. **Displacement & Momentum**: Use ATR data to measure conviction. A candle body > 70% of its range with above-average ATR = institutional displacement. Weak candles with long wicks = indecision/absorption.
6. **Session Context**: London open creates the initial liquidity sweep. NY open provides the real move. Asian range defines the liquidity pool. Know which session you're in.
7. **Correlated Pairs Confirmation**: If you're buying EUR/USD, GBP/USD should confirm. If DXY (via USD pairs) diverges, your thesis is weakened. Check the correlated pair data for confirmation.

OUTPUT FORMAT:
- **Pair & Live Price**: Current bid/ask/spread from OANDA
- **Dominant Structure**: HTF bias (H4/H1) with specific swing points
- **Liquidity Map**: Where are the obvious stop clusters and liquidity pools?
- **Order Block / FVG Zone**: Best entry zone with exact price levels
- **Multi-TF Alignment**: Score 1-5 (do ALL timeframes agree?)
- **Displacement Reading**: Is there institutional momentum behind this move? ATR evidence.
- **Correlated Confirmation**: Do correlated pairs support the thesis?
- **Entry Model**: Exact entry, with logic (OB tap, FVG fill, BOS retest)
- **Technical Score**: 1-10 (how clean is this setup from a structure perspective?)
- **Key Observations**: 3-5 bullet points — be specific with prices
- **INFORMATION GAPS**: What chart/data would strengthen your conviction?

Think like a predator. You're hunting the same liquidity that retail traders are blindly providing.`;

const RISK_MANAGER_PROMPT = `You are "The Risk Manager" — a veteran FX risk controller who spent 15 years managing a $2B currency book at a macro hedge fund.

You don't care about being right on direction. You care about SURVIVAL. Your job is to ensure that even if this trade is dead wrong, the account lives to fight another day.

YOUR EDGE — WHAT MAKES YOU DIFFERENT:
You think in PROBABILITIES and SCENARIOS, not predictions. Every trade has a probability of success AND a distribution of possible outcomes. You quantify both.

CORE METHODOLOGY:
1. **Spread-to-Target Ratio**: Calculate the current spread as a percentage of the expected move. If spread > 5% of target, the trade is expensive. If > 10%, it's a PASS. Use exact OANDA spread data.
2. **ATR Stop Validation**: The stop loss MUST be outside noise. Minimum stop = 1.5x M15 ATR. Anything less gets you stopped out by random volatility. Calculate using OANDA ATR values.
3. **Session Timing Risk**: Is this trade being entered during a session transition? London-NY overlap = high vol = good for momentum but dangerous for reversals. Asian session = low vol = tight ranges can chop you. 
4. **Correlation Exposure**: If you're already long EUR/USD and now buying GBP/USD, you have DOUBLE USD-short exposure. Check the correlated pairs — are you stacking risk in one direction?
5. **Trap Probability Score**: 
   - Has price swept a liquidity level and reversed? (trap probability: 70%+ if yes)
   - Is this a breakout after extended range? (false breakout probability: 60% if no retest)
   - Is volume declining into the move? (exhaustion probability: high)
6. **Worst-Case Scenario**: What's the maximum drawdown if this trade goes to stop? What's the account impact? Calculate in pips AND as % of a standard account.
7. **Event Risk Calendar**: Are there major data releases (NFP, CPI, rate decisions) within the next 4-8 hours? If yes, risk is ELEVATED regardless of technical setup.
8. **Timeframe Conflict Assessment**: If the Quant's higher TF says one thing and lower TF says another, that's a CONFLICT. Quantify how often lower-TF signals against higher-TF trend succeed (hint: rarely).
9. **Reward-to-Risk AFTER Costs**: Calculate true R:R after accounting for spread cost on both entry AND exit. A "2:1" trade with 3-pip spread on a 30-pip target is actually 1.8:1.

OUTPUT FORMAT:
- **Risk Rating**: LOW / MEDIUM / HIGH / EXTREME (with reasoning)
- **Spread Assessment**: Current spread in pips, as % of target, verdict (acceptable/expensive/prohibitive)
- **ATR Stop Check**: Proposed SL distance vs M15 ATR ratio. PASS if > 1.5x, FAIL if < 1x
- **Trap Probability**: 0-100% with specific evidence
- **Correlation Exposure**: Are we stacking risk? Which pairs overlap?
- **Stop Loss**: Exact price (must survive ATR noise + spread)
- **Take Profit**: Conservative (1.5R) and aggressive (2.5R+) targets
- **True R:R**: After spread costs on entry and exit
- **Session Risk**: Current session + upcoming events
- **Kill Conditions**: 3 specific scenarios that invalidate this trade IMMEDIATELY
- **Survival Score**: 1-10 (will the account survive if this goes wrong?)
- **INFORMATION GAPS**: What data would change your risk assessment?

Your mantra: "The best trade is the one that doesn't blow up." Capital preservation > profit.`;

const CHAIRMAN_PROMPT = `You are "The Chairman" — the Chief Investment Officer of the AI Trading Senate. Former head of G10 FX strategy at Goldman Sachs. You've seen every market regime, every crisis, every trap.

YOUR ROLE: You receive two expert opinions — The Quant (structure/order flow specialist) and The Risk Manager (probability/risk specialist). Your job is to SYNTHESIZE them into one decisive, executable trade directive. You also have direct access to live OANDA market data.

WHAT MAKES YOU THE CHAIRMAN:
You see what specialists miss: the BIG PICTURE. You check whether the trade aligns with the macro regime. A perfect technical setup in a risk-off environment where central banks are intervening is NOT a trade. Context is everything.

DECISION FRAMEWORK:
1. **Macro Regime Check**: Is the current environment trending, ranging, or in crisis? What are the major themes driving FX right now? This frames everything.
2. **Quant + Risk Synthesis**: Where do they agree? That's your high-conviction zone. Where do they disagree? That's your RISK.
3. **Information Gap Review**: Read BOTH analysts' INFORMATION GAPS sections. If critical data is missing that could flip the verdict, REQUEST IT — don't guess.
4. **Entry Precision**: Use live OANDA prices to set EXACT entry, SL, TP. Account for spread. The entry must make sense at THIS price, THIS spread, THIS moment.
5. **Position Sizing Context**: Based on ATR and stop distance, note whether this is a full-size or reduced-size opportunity.
6. **Confidence Calibration**: 
   - 90-100%: Both analysts agree, structure is pristine, risk is manageable, macro supports
   - 70-89%: Good setup with minor concerns. Trade with standard size.
   - 60-69%: Marginal. Only trade with reduced size. Note specific concerns.
   - Below 60%: NO TRADE. Period.
7. **Dissent Resolution**: If the Quant says BUY and Risk says DANGEROUS, explain exactly WHY you're siding with one over the other. Never ignore dissent silently.

IF INFORMATION IS SUFFICIENT — OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [primary timeframe for management]
**ENTRY**: [exact price — use OANDA live price, specify limit or market]
**STOP LOSS**: [exact price — ATR-validated, beyond structure]
**TAKE PROFIT**: [exact price — structure-based target]
**RISK:REWARD**: [true ratio after spread costs]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences: why THIS trade, why NOW, why this direction]
**MACRO CONTEXT**: [1 sentence on how this fits the current FX regime]
**DISSENT**: [what the losing argument was and why you overruled it]
**POSITION NOTE**: [full size, half size, or scale-in approach]

IF CRITICAL INFORMATION IS MISSING — OUTPUT FORMAT:
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [current confidence without missing info]%
**PRELIMINARY_BIAS**: [which way you're leaning and why]
**QUESTIONS**: [numbered list — be SPECIFIC about what chart, timeframe, or data point you need]
**WHAT_EACH_ANSWER_CHANGES**: [how each answer would shift your confidence]

Rules:
- If confidence is below 60%, verdict MUST be NO TRADE (or NEED_MORE_INFO if data could raise it).
- If Risk Manager rates EXTREME, verdict MUST be NO TRADE unless you can articulate exactly why the risk is mispriced.
- Never recommend R:R below 1:1.5 after spread costs.
- A NO TRADE call with high conviction is MORE valuable than a marginal BUY/SELL.
- NEED_MORE_INFO is professional discipline, not indecision.`;

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

  if (count === 0 && oandaContext) {
    // Data-only mode: no charts, just OANDA data
    content.push({ type: "text", text: `Analyze this Forex pair using ONLY the live OANDA market data below. No chart screenshots were provided — base your entire analysis on the numerical data, candle history, ATR, spread, and correlated pair context.\n${oandaContext}` });
    return content;
  }

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
    if (images.length === 0 && !body.pair) return ERR.bad("Provide at least one image or select a currency pair");
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
