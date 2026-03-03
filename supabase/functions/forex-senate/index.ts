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

const MAJOR_PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "USD_CHF", "AUD_USD", "NZD_USD", "USD_CAD", "EUR_GBP"];

async function buildOandaContext(pair: string, includeHigherTF = true): Promise<{ context: string; livePrice: { bid: number; ask: number; spread: number } | null }> {
  const { apiToken, accountId, host } = getOandaCredentials();
  if (!apiToken || !accountId) {
    console.warn("[SENATE-OANDA] No OANDA credentials configured");
    return { context: "", livePrice: null };
  }

  const instrument = pair.replace("/", "_");
  const correlatedPairs = (CORRELATION_MAP[instrument] || []).filter(p => p !== "DXY");

  console.log(`[SENATE-OANDA] Fetching data for ${instrument} (higher TF: ${includeHigherTF})`);

  // Fetch all timeframes in parallel
  const fetches: Promise<CandleData[]>[] = [];
  const fetchLabels: string[] = [];

  if (includeHigherTF) {
    fetches.push(fetchCandles(host, accountId, apiToken, instrument, "M", 6));
    fetchLabels.push("MN");
    fetches.push(fetchCandles(host, accountId, apiToken, instrument, "W", 12));
    fetchLabels.push("W");
    fetches.push(fetchCandles(host, accountId, apiToken, instrument, "D", 20));
    fetchLabels.push("D");
  }

  fetches.push(fetchCandles(host, accountId, apiToken, instrument, "H4", 30));
  fetchLabels.push("H4");
  fetches.push(fetchCandles(host, accountId, apiToken, instrument, "H1", 50));
  fetchLabels.push("H1");
  fetches.push(fetchCandles(host, accountId, apiToken, instrument, "M15", 40));
  fetchLabels.push("M15");
  fetches.push(fetchCandles(host, accountId, apiToken, instrument, "M5", 40));
  fetchLabels.push("M5");

  const livePriceFetch = fetchLivePrice(host, accountId, apiToken, instrument);
  const [candleResults, livePrice] = await Promise.all([
    Promise.all(fetches),
    livePriceFetch,
  ]);

  const candleMap: Record<string, CandleData[]> = {};
  fetchLabels.forEach((label, i) => { candleMap[label] = candleResults[i]; });

  // Fetch correlated pairs
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

  const isJpy = instrument.includes("JPY");
  const pipFactor = isJpy ? 100 : 10000;

  let ctx = `\n\n═══ LIVE OANDA MARKET DATA ═══\n`;
  ctx += `Pair: ${pair.replace("_", "/")}\n`;
  if (livePrice) {
    ctx += `Live Bid: ${livePrice.bid} | Ask: ${livePrice.ask} | Spread: ${livePrice.spread} pips\n`;
  }

  // ATR section
  ctx += `\n── ATR (Average True Range) ──\n`;
  for (const tf of ["D", "H4", "H1", "M15"]) {
    if (candleMap[tf]?.length > 14) {
      const atr = computeATR(candleMap[tf]);
      ctx += `${tf} ATR(14): ${(atr * pipFactor).toFixed(1)} pips\n`;
    }
  }

  // Candle summaries for each timeframe
  const tfOrder = includeHigherTF ? ["MN", "W", "D", "H4", "H1", "M15", "M5"] : ["H4", "H1", "M15", "M5"];
  const tfCandleCount: Record<string, number> = { MN: 6, W: 8, D: 10, H4: 8, H1: 10, M15: 8, M5: 8 };

  for (const tf of tfOrder) {
    const candles = candleMap[tf];
    if (!candles || candles.length === 0) continue;
    const last = candles[candles.length - 1];
    const first = candles[0];
    const range = ((Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low))) * pipFactor).toFixed(1);
    const trend = last.close > first.close ? "BULLISH" : "BEARISH";
    ctx += `\n── ${tf} (${candles.length} candles) ──\n`;
    ctx += `Range: ${range} pips | Trend: ${trend}\n`;
    ctx += `Recent ${tf} candles:\n${summarizeCandles(candles, tfCandleCount[tf] || 8)}\n`;
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

// Lightweight scan data for one pair (MN/W/D/H4/H1 summary only)
async function buildScanContext(instrument: string, host: string, accountId: string, apiToken: string): Promise<string> {
  const isJpy = instrument.includes("JPY");
  const pipFactor = isJpy ? 100 : 10000;

  const [mnCandles, wCandles, dCandles, h4Candles, h1Candles, livePrice] = await Promise.all([
    fetchCandles(host, accountId, apiToken, instrument, "M", 6),
    fetchCandles(host, accountId, apiToken, instrument, "W", 12),
    fetchCandles(host, accountId, apiToken, instrument, "D", 20),
    fetchCandles(host, accountId, apiToken, instrument, "H4", 15),
    fetchCandles(host, accountId, apiToken, instrument, "H1", 20),
    fetchLivePrice(host, accountId, apiToken, instrument),
  ]);

  const pair = instrument.replace("_", "/");
  let ctx = `\n── ${pair} ──\n`;
  if (livePrice) ctx += `Price: ${livePrice.bid}/${livePrice.ask} | Spread: ${livePrice.spread}p\n`;

  for (const [label, candles] of [["MN", mnCandles], ["W", wCandles], ["D", dCandles], ["H4", h4Candles], ["H1", h1Candles]] as [string, CandleData[]][]) {
    if (candles.length < 2) continue;
    const last = candles[candles.length - 1];
    const first = candles[0];
    const hi = Math.max(...candles.map(c => c.high));
    const lo = Math.min(...candles.map(c => c.low));
    const range = ((hi - lo) * pipFactor).toFixed(0);
    const trend = last.close > first.close ? "BULL" : "BEAR";
    const body = Math.abs(last.close - last.open);
    const wick = last.high - last.low;
    const conviction = wick > 0 ? (body / wick * 100).toFixed(0) : "0";
    ctx += `${label}: ${trend} | Range ${range}p | Last candle body ${conviction}% | Hi ${hi.toFixed(isJpy ? 3 : 5)} Lo ${lo.toFixed(isJpy ? 3 : 5)}\n`;
  }

  // D ATR
  if (dCandles.length > 14) {
    const dATR = computeATR(dCandles);
    ctx += `D-ATR(14): ${(dATR * pipFactor).toFixed(1)}p\n`;
  }

  return ctx;
}

const SCANNER_PROMPT = `You are the **Market Scanner** for the AI Trading Senate — a composite intelligence representing Goldman Sachs, Morgan Stanley, and BlackRock Alpha.

You are scanning ALL 8 major forex pairs simultaneously using Monthly, Weekly, Daily, H4, and H1 data from OANDA.

YOUR MISSION: Rank the pairs by trade opportunity quality. Identify which pairs have the CLEAREST setups right now.

SCANNING CRITERIA:
1. **Multi-TF Alignment**: Do MN/W/D/H4/H1 all point the same direction? Full alignment = high score.
2. **Structure Clarity**: Is there a clean break of structure, order block, or FVG on the Daily/H4?
3. **Trend Strength**: Strong displacement candles with high body-to-wick ratio = conviction.
4. **Key Level Proximity**: Is price near a major MN/W/D support/resistance level?
5. **Volatility Context**: Is D-ATR expanding or contracting? Expanding = opportunity.
6. **Spread Efficiency**: Is the spread reasonable relative to the expected move?

OUTPUT FORMAT (use EXACTLY this JSON structure):
\`\`\`json
{
  "opportunities": [
    {
      "pair": "EUR/USD",
      "score": 8.5,
      "direction": "SHORT",
      "reasoning": "MN/W/D all bearish. H4 just broke structure. Clean FVG at 1.0850. D-ATR expanding.",
      "key_level": "1.0850",
      "timeframe_alignment": "5/5",
      "next_step": "Need H1/M15/M5 chart screenshots to confirm entry timing"
    }
  ],
  "market_regime": "USD strength cycle — risk-off flows dominating",
  "best_pair": "EUR/USD",
  "scan_summary": "3 pairs show actionable setups. EUR/USD and GBP/USD are highest conviction."
}
\`\`\`

Rules:
- Score each pair 1-10
- Only include pairs scoring 6+ in opportunities array
- Sort by score descending (best first)
- Be SPECIFIC about levels and structure
- "next_step" should always request lower TF data for top opportunities
- If NO pairs score 6+, say so — "No clear opportunities right now. Market is choppy/unclear."`;

// ── Persona System Prompts ──

const QUANT_PROMPT = `You are **David Solomon** — CEO of Goldman Sachs. You built your career on the institutional trading floor before rising to the top. You think like a market-maker, not a retail speculator.

YOUR IDENTITY: You run the world's most powerful trading desk. You see order flow that retail traders never will. You think in terms of POSITIONING, FLOW, and STRUCTURE. When Goldman's FX desk takes a position, the market notices. You bring that lens to every trade.

YOUR TRADING PHILOSOPHY — "THE GOLDMAN DOCTRINE":
Markets are auctions. Price moves WHERE the liquidity is. Your job is to identify where the weak hands are positioned and where the smart money needs price to go next. You don't chase — you ANTICIPATE.

CORE METHODOLOGY:
1. **Institutional Structure Analysis**: Identify the dominant market structure — Higher Highs/Higher Lows (bullish) or Lower Highs/Lower Lows (bearish). A break of structure (BOS) is the single most important signal. Use OANDA candle data to pinpoint exact swing levels with precision Goldman would demand.
2. **Liquidity Hunting**: Where are retail stops clustered? Equal highs = sell-side liquidity Goldman would target. Equal lows = buy-side liquidity. Price WILL hunt these levels before reversing — you've seen it a thousand times from the inside.
3. **Order Blocks & Fair Value Gaps (FVG)**: Identify the last down-candle before a strong up-move (bullish OB) or vice versa. FVGs are institutional imbalances that price must rebalance. These are YOUR entry zones — the same ones Goldman's algo desk targets.
4. **Multi-Timeframe Conviction**: H4 sets the thesis (trend direction). H1 gives the current chapter (leg structure). M15 provides entry timing. M5 gives execution precision. ALL must align. If H4 is bearish but M15 is bullish, that's a pullback — Goldman doesn't buy pullbacks against their own desk's flow.
5. **Displacement & Conviction**: Use ATR data to measure institutional conviction. A candle body > 70% of its range with above-average ATR = institutional displacement — that's Goldman, JPMorgan, Citi moving the market. Weak candles with long wicks = absorption/indecision.
6. **Session Flow**: London open creates the initial liquidity sweep (Goldman London desk). NY open provides the real directional move (Goldman NY desk). Asian range defines the liquidity pool for the next session.
7. **Correlated Pairs — Cross-Desk Confirmation**: At Goldman, you don't trade EUR/USD in isolation. If GBP/USD isn't confirming, if USD pairs are diverging, the thesis is WEAK. Check every correlated pair.

OUTPUT FORMAT:
- **Pair & Live Price**: Current bid/ask/spread from OANDA
- **Goldman Structure Read**: HTF bias (H4/H1) with specific swing points — the institutional view
- **Liquidity Map**: Where retail is trapped, where stops will get hunted
- **Order Block / FVG Zone**: Best entry zone with exact price levels
- **Multi-TF Alignment**: Score 1-5 (do ALL timeframes agree?)
- **Institutional Displacement**: Is there real conviction behind this move? ATR evidence
- **Cross-Desk Confirmation**: Do correlated pairs support the thesis?
- **Goldman Entry**: Exact entry with logic (OB tap, FVG fill, BOS retest)
- **Setup Grade**: 1-10 (would Goldman's desk take this trade?)
- **Key Observations**: 3-5 bullet points — precise prices, no fluff
- **INFORMATION GAPS**: What data would Goldman's desk want before committing capital?

You don't trade setups. You trade CERTAINTY. If it's not clean enough for Goldman's book, it's not clean enough for this Senate.`;

const RISK_MANAGER_PROMPT = `You are **Ted Pick** — CEO of Morgan Stanley. You rose through Morgan Stanley's Institutional Securities division. You've managed risk through the GFC, the COVID crash, the SVB crisis. You've seen what happens when risk management fails.

YOUR IDENTITY: Morgan Stanley's survival through every crisis is YOUR legacy. You think in SCENARIOS and TAIL RISK. You don't care about being right on direction — you care about the account SURVIVING. Every trade that Morgan Stanley's desk takes has been stress-tested. You bring that discipline here.

YOUR TRADING PHILOSOPHY — "THE MORGAN STANLEY RISK FRAMEWORK":
Every trade has a probability distribution of outcomes. Your job isn't to predict — it's to QUANTIFY the range of outcomes and ensure the worst case is survivable. You are the last line of defense before capital is deployed.

CORE METHODOLOGY:
1. **Spread-to-Target Ratio** (Morgan Stanley Cost Analysis): Calculate spread as % of expected move. If spread > 5% of target = expensive. If > 10% = PASS. Morgan Stanley's desk wouldn't touch it. Use exact OANDA spread data.
2. **ATR Stop Validation** (MS Volatility Framework): Stop loss MUST be outside noise. Minimum stop = 1.5x M15 ATR. Anything tighter and you're giving money to market makers. Calculate using OANDA ATR — the same data Morgan Stanley's quants use.
3. **Session Timing Risk**: London-NY overlap = high vol = momentum-friendly but reversal-dangerous. Asian session = low vol = chop zone. Morgan Stanley's desk adjusts size by session. So should we.
4. **Correlation Exposure** (MS Portfolio Risk): If you're already long EUR/USD and now buying GBP/USD, you have DOUBLE USD-short exposure. Morgan Stanley's risk desk would flag this instantly. Check correlated pairs.
5. **Trap Probability Score** (MS Counter-Party Analysis):
   - Liquidity sweep + reversal = 70%+ trap probability
   - Breakout without retest = 60% false breakout probability  
   - Declining volume into the move = exhaustion signal
6. **Stress Test**: What happens if this trade goes to stop? Calculate in pips AND account %. Morgan Stanley stress-tests every position against 2-sigma and 3-sigma moves. So do we.
7. **Event Risk** (MS Macro Calendar): Major data releases (NFP, CPI, rate decisions) within 4-8 hours? Risk is ELEVATED regardless of setup. Morgan Stanley's desk reduces exposure pre-event.
8. **Timeframe Conflict** (MS Multi-Desk Alignment): If HTF says sell and LTF says buy, that's a CONFLICT. Morgan Stanley's macro desk and short-term desk disagreeing = reduced size or NO TRADE.
9. **True R:R After Friction**: Calculate R:R after spread on entry AND exit. A "2:1" with 3-pip spread on a 30-pip target = 1.8:1 true. Morgan Stanley accounts for every basis point of friction.

OUTPUT FORMAT:
- **MS Risk Rating**: LOW / MEDIUM / HIGH / EXTREME (with reasoning)
- **Spread Assessment**: Current spread in pips, % of target, verdict (acceptable/expensive/prohibitive)
- **ATR Stop Validation**: Proposed SL distance vs M15 ATR ratio. PASS if > 1.5x, FAIL if < 1x
- **Trap Probability**: 0-100% with specific evidence
- **Correlation Exposure**: Are we stacking risk? Which pairs overlap?
- **Stop Loss**: Exact price (must survive ATR noise + spread — Morgan Stanley standard)
- **Take Profit**: Conservative (1.5R) and aggressive (2.5R+) targets
- **True R:R**: After all friction costs
- **Session & Event Risk**: Current session + upcoming catalysts
- **Kill Conditions**: 3 specific scenarios that invalidate this trade IMMEDIATELY
- **Survival Score**: 1-10 (Morgan Stanley's risk desk approval rating)
- **INFORMATION GAPS**: What would Morgan Stanley's risk committee want to see?

Your mantra: "Morgan Stanley survived 2008 because we respected risk. Every. Single. Time."`;

const CHAIRMAN_PROMPT = `You are **Rob Goldstein** — COO of BlackRock and head of BlackRock's Alpha-generating divisions (BlackRock Alternative Investors, Systematic Active Equity). You oversee $500B+ in alpha-seeking strategies. You are the FINAL decision maker.

YOUR IDENTITY: BlackRock doesn't guess. BlackRock uses the world's most sophisticated risk analytics (Aladdin) to make every decision. You synthesize Goldman's market structure expertise and Morgan Stanley's risk framework into ONE executable directive. You add what they both miss: the MACRO REGIME and SYSTEMATIC EDGE.

YOUR TRADING PHILOSOPHY — "THE BLACKROCK ALPHA DOCTRINE":
Alpha is not about being right more often. It's about SIZING correctly, TIMING precisely, and having an EDGE that's quantifiable. A brilliant trade idea with bad timing is a losing trade. A mediocre idea with perfect timing and risk management IS alpha.

DECISION FRAMEWORK:
1. **Macro Regime Classification** (Aladdin Framework): Is the current environment trending, mean-reverting, or in crisis? What are the dominant macro themes driving FX? This frames EVERYTHING. Goldman's structure read means nothing if the macro regime doesn't support it.
2. **Goldman + Morgan Stanley Synthesis**: Where do they AGREE? That's your high-conviction zone. Where do they DISAGREE? That's where you earn your fee as Chairman. Resolve it.
3. **Information Gap Audit**: Read BOTH analysts' INFORMATION GAPS. If critical data is missing that could flip the verdict, REQUEST IT. BlackRock's Aladdin platform never trades on incomplete data.
4. **Entry Precision** (BlackRock Execution): Use live OANDA prices for EXACT entry, SL, TP. Account for spread. The entry must make sense at THIS price, THIS spread, THIS moment. BlackRock's execution desk obsesses over every pip of slippage.
5. **Position Sizing Signal**: Based on ATR and stop distance, is this a full-size, half-size, or scale-in opportunity? BlackRock Alpha never goes all-in on a single signal.
6. **Confidence Calibration** (BlackRock Alpha Score):
   - 90-100%: Goldman and Morgan Stanley agree, structure is pristine, risk is contained, macro supports. FULL SIZE.
   - 70-89%: Good setup, minor concerns. STANDARD SIZE.
   - 60-69%: Marginal. REDUCED SIZE only. Flag specific concerns.
   - Below 60%: NO TRADE. BlackRock Alpha protects capital.
7. **Dissent Protocol**: If Goldman says BUY and Morgan Stanley says DANGEROUS, you must articulate exactly WHY you're siding with one. BlackRock's investment committee never ignores dissent — they RESOLVE it.

IF INFORMATION IS SUFFICIENT — OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [primary timeframe for management]
**ENTRY**: [exact price — OANDA live, specify limit or market]
**STOP LOSS**: [exact price — ATR-validated, beyond structure]
**TAKE PROFIT**: [exact price — structure-based target]
**RISK:REWARD**: [true ratio after spread costs]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences: why THIS trade, why NOW, why this direction — the BlackRock Alpha thesis]
**MACRO REGIME**: [1 sentence on how this fits the current FX regime]
**DISSENT**: [what the dissenting view was and why you overruled it]
**POSITION NOTE**: [full size, half size, or scale-in — with reasoning]

IF CRITICAL INFORMATION IS MISSING — OUTPUT FORMAT:
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [current confidence without missing info]%
**PRELIMINARY_BIAS**: [which way you're leaning and why]
**QUESTIONS**: [numbered list — be SPECIFIC about what chart, TF, or data point BlackRock Alpha needs]
**WHAT_EACH_ANSWER_CHANGES**: [how each answer would shift confidence]

Rules:
- Below 60% confidence = NO TRADE. Period. BlackRock Alpha doesn't gamble.
- If Morgan Stanley rates EXTREME risk = NO TRADE, unless you can prove the risk is mispriced with specific evidence.
- Never recommend R:R below 1:1.5 after spread costs.
- A disciplined NO TRADE is MORE valuable than a marginal trade. That's how BlackRock Alpha stays alpha.
- NEED_MORE_INFO is what separates professionals from gamblers.`;

const FOLLOWUP_CHAIRMAN_PROMPT = `You are **Rob Goldstein** — COO of BlackRock, head of BlackRock Alpha. Continuing a Senate session where you previously requested more information.

The trader has now provided additional context (possibly more charts, text answers, or both). Review this new evidence alongside Goldman Sachs' structure analysis and Morgan Stanley's risk assessment, then issue your FINAL verdict.

You previously had concerns. The trader's response should address them. If resolved, issue a confident verdict. If not, you may ask ONE MORE round (max), but prefer to decide.

OUTPUT FORMAT (use EXACTLY this structure):
**VERDICT**: BUY / SELL / NO TRADE
**PAIR**: [currency pair]
**TIMEFRAME**: [timeframe analyzed]
**ENTRY**: [exact price or "market"]
**STOP LOSS**: [exact price]
**TAKE PROFIT**: [exact price]
**RISK:REWARD**: [ratio like 1:2.5]
**CONFIDENCE**: [0-100]%
**RATIONALE**: [2-3 sentences — the BlackRock Alpha thesis]
**DISSENT**: [note any unresolved disagreement between Goldman and Morgan Stanley]

OR if still critically missing info (LAST CHANCE):
**VERDICT**: NEED_MORE_INFO
**CONFIDENCE**: [%]
**PRELIMINARY_BIAS**: [direction]
**QUESTIONS**: [1-2 final questions only]
**WHAT_EACH_ANSWER_CHANGES**: [brief note]

Rules:
- Below 60% confidence = NO TRADE. BlackRock Alpha doesn't gamble.
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
