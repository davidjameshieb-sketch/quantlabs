// Sovereign Matrix v20.0 — True Mechanical Chomp
// 28-cross True Matrix: mathematically ranks all 8 currencies 1→8 from net global capital flow
// Gate 1: ONLY authorizes the #1 Strongest vs #8 Weakest (Rank 1 Predator vs Rank 8 Prey)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// All 8 major currencies
const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

// All 28 unique cross-rate combinations of the 8 majors
// Each entry: [base, quote, oandaInstrument]
const ALL_28_CROSSES: Array<{ base: string; quote: string; instrument: string }> = [];
for (let i = 0; i < ALL_CURRENCIES.length; i++) {
  for (let j = i + 1; j < ALL_CURRENCIES.length; j++) {
    const base = ALL_CURRENCIES[i];
    const quote = ALL_CURRENCIES[j];
    // OANDA instrument format
    ALL_28_CROSSES.push({ base, quote, instrument: `${base}_${quote}` });
  }
}

// Instruments OANDA actually provides (some crosses might not be directly available)
// We handle unavailable ones by derivation, but for simplicity we try direct + fallback
const OANDA_AVAILABLE: Set<string> = new Set([
  "EUR_USD", "EUR_GBP", "EUR_AUD", "EUR_NZD", "EUR_CAD", "EUR_CHF", "EUR_JPY",
  "GBP_USD", "GBP_AUD", "GBP_NZD", "GBP_CAD", "GBP_CHF", "GBP_JPY",
  "AUD_USD", "AUD_NZD", "AUD_CAD", "AUD_CHF", "AUD_JPY",
  "NZD_USD", "NZD_CAD", "NZD_CHF", "NZD_JPY",
  "USD_CAD", "USD_CHF", "USD_JPY",
  "CAD_CHF", "CAD_JPY",
  "CHF_JPY",
]);

// Pairs to scan for Triple-Lock signals
const SCAN_PAIRS = [
  "EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD",
  "USD_CAD", "USD_CHF", "USD_JPY",
  "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
];

interface Candle {
  time: string;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

interface AtlasBlock {
  blockHigh: number;
  blockLow: number;
  candleTime: string;
}

interface MatrixSignal {
  instrument: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseScore: number;
  quoteScore: number;
  baseRank: number;
  quoteRank: number;
  gate1: boolean;
  gate2: boolean;
  gate2Detail: { highest20: number; lowest20: number; close: number };
  gate3: boolean;
  gate3Detail: { slope: number };
  direction: "long" | "short" | null;
  triplelock: boolean;
  atlasBlock: AtlasBlock | null;
  currentPrice: number;
  sobScore: number;
}

async function fetchCandles(
  instrument: string,
  count: number,
  environment: "practice" | "live",
  apiToken: string
): Promise<Candle[] | null> {
  const host = environment === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const candles = (data.candles || [])
      .filter((c: { complete?: boolean }) => c.complete !== false)
      .map((c: {
        time: string;
        volume: number;
        mid: { h: string; l: string; o: string; c: string };
      }) => ({
        time: c.time,
        volume: c.volume,
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        open: parseFloat(c.mid.o),
        close: parseFloat(c.mid.c),
      }));
    return candles;
  } catch {
    return null;
  }
}

// Compute percentage return: (close - open) / open * 100 averaged over last N candles
function computePercentReturn(candles: Candle[], periods = 20): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(periods, candles.length));
  let totalReturn = 0;
  for (const c of slice) {
    if (c.open !== 0) {
      totalReturn += ((c.close - c.open) / c.open) * 100;
    }
  }
  return totalReturn / slice.length;
}

// Volume Efficiency
function computeVeff(candles: Candle[]): number[] {
  return candles.map((c) => {
    const range = Math.abs(c.high - c.low);
    if (range === 0) return 0;
    return c.volume / range;
  });
}

// Atlas Wall: find the most recent cluster candle in last 20 periods
function findAtlasBlock(candles: Candle[], period = 20): AtlasBlock | null {
  if (candles.length < period) return null;
  const recent = candles.slice(-period);
  const veff = computeVeff(recent);
  const avgVeff = veff.reduce((a, b) => a + b, 0) / veff.length;
  const threshold = avgVeff * 1.5;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (veff[i] > threshold) {
      return {
        blockHigh: recent[i].high,
        blockLow: recent[i].low,
        candleTime: recent[i].time,
      };
    }
  }
  return null;
}

// S_sob: Structural Order Book Score for a pair
function computeSob(candles: Candle[], atlasBlock: AtlasBlock | null): number {
  if (!atlasBlock || candles.length === 0) return 0;
  const close = candles[candles.length - 1].close;
  if (close > atlasBlock.blockHigh) return 1;
  if (close < atlasBlock.blockLow) return -1;
  return 0;
}

// Linear Regression slope over N points
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// Gate 2: Atlas Snap — exclude current candle from lookback
function computeAtlasSnap(candles: Candle[], period = 20): { highest: number; lowest: number } {
  const lookback = candles.slice(0, -1);
  if (lookback.length < period) {
    const highs = lookback.map((c) => c.high);
    const lows = lookback.map((c) => c.low);
    return {
      highest: highs.length > 0 ? Math.max(...highs) : 0,
      lowest: lows.length > 0 ? Math.min(...lows) : 0,
    };
  }
  const slice = lookback.slice(-period);
  return {
    highest: Math.max(...slice.map((c) => c.high)),
    lowest: Math.min(...slice.map((c) => c.low)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "live";
    const targetPair: string | undefined = body.pair;

    const apiToken =
      environment === "live"
        ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
        : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STEP 1: Fetch candles for all 28 cross-rate pairs in parallel ──────────
    console.log(`[TRUE MATRIX] Fetching 30m candles for 28 cross-rates (env: ${environment})`);

    // Filter to only OANDA-available instruments
    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    const crossResults = await Promise.allSettled(
      availableCrosses.map(async (cross) => {
        const candles = await fetchCandles(cross.instrument, 23, environment, apiToken);
        return { cross, candles };
      })
    );

    // ── STEP 2: Compute cross-rate performance scores ─────────────────────────
    // For each available cross, compute % return on base vs quote
    // currencyFlows accumulates net weighted score for each currency
    const currencyFlows: Record<string, number[]> = {};
    for (const c of ALL_CURRENCIES) currencyFlows[c] = [];

    for (const result of crossResults) {
      if (result.status !== "fulfilled" || !result.value.candles || result.value.candles.length < 3) continue;
      const { cross, candles } = result.value;

      // Percentage return: positive means base is gaining vs quote
      const pctReturn = computePercentReturn(candles, 20);

      // Base currency gains, quote currency loses (in this cross)
      currencyFlows[cross.base].push(pctReturn);
      currencyFlows[cross.quote].push(-pctReturn);
    }

    // Average all cross-rate flows per currency to get its "True Strength Score"
    const currencyScores: Record<string, number> = {};
    for (const cur of ALL_CURRENCIES) {
      const flows = currencyFlows[cur];
      if (flows.length === 0) {
        currencyScores[cur] = 0;
      } else {
        const avg = flows.reduce((a, b) => a + b, 0) / flows.length;
        // Round to 4 decimal places for display
        currencyScores[cur] = Math.round(avg * 10000) / 10000;
      }
    }

    // ── STEP 3: Rank all 8 currencies from 1 (Strongest) to 8 (Weakest) ──────
    const sortedCurrencies = [...ALL_CURRENCIES].sort(
      (a, b) => currencyScores[b] - currencyScores[a]
    );

    const currencyRanks: Record<string, number> = {};
    sortedCurrencies.forEach((cur, idx) => {
      currencyRanks[cur] = idx + 1; // Rank 1 = Strongest, Rank 8 = Weakest
    });

    // Predator = Rank 1 (strongest), Prey = Rank 8 (weakest)
    const predator = sortedCurrencies[0];
    const prey = sortedCurrencies[sortedCurrencies.length - 1];
    const bestChompPair = `${predator}_${prey}`;

    console.log(`[TRUE MATRIX] Rankings: ${sortedCurrencies.map((c, i) => `${i+1}.${c}`).join(' | ')}`);
    console.log(`[TRUE MATRIX] Best Chomp: ${bestChompPair}`);

    // ── STEP 4: Scan pairs for Triple-Lock signals ─────────────────────────────
    // Always include the Best Chomp pair (Rank #1 vs Rank #8) even if not in SCAN_PAIRS
    const bestChompInverse = `${prey}_${predator}`;
    const dynamicPairs = targetPair
      ? [targetPair]
      : [...new Set([...SCAN_PAIRS, bestChompPair, bestChompInverse].filter(p => OANDA_AVAILABLE.has(p)))];
    const pairsToScan = dynamicPairs;
    const signals: MatrixSignal[] = [];

    await Promise.allSettled(
      pairsToScan.map(async (instrument) => {
        const parts = instrument.split("_");
        if (parts.length !== 2) return;
        const [baseCur, quoteCur] = parts;

        try {
          const candles = await fetchCandles(instrument, 23, environment, apiToken);
          if (!candles || candles.length < 21) return;

          const close = candles[candles.length - 1].close;
          const atlas = findAtlasBlock(candles);
          const sob = computeSob(candles, atlas);

          const baseScore = currencyScores[baseCur] ?? 0;
          const quoteScore = currencyScores[quoteCur] ?? 0;
          const baseRank = currencyRanks[baseCur] ?? 4;
          const quoteRank = currencyRanks[quoteCur] ?? 4;

          // ── TRUE GATE 1: ELITE RANK FILTER ──────────────────────────────────
          // ONLY authorize the physical terrain extremes:
          // LONG: base is Rank 1 (or 2) AND quote is Rank 7 (or 8) — Predator vs Prey
          // SHORT: base is Rank 7 (or 8) AND quote is Rank 1 (or 2) — Prey fights Predator
          const longG1 = baseRank <= 2 && quoteRank >= 7;
          const shortG1 = baseRank >= 7 && quoteRank <= 2;
          const gate1 = longG1 || shortG1;

          // Gate 2: Atlas Snap — 20-period breakout
          const snap = computeAtlasSnap(candles, 20);
          const longG2 = close > snap.highest;
          const shortG2 = close < snap.lowest;
          let gate2 = false;
          if (longG1) gate2 = longG2;
          else if (shortG1) gate2 = shortG2;

          // Gate 3: David Vector — LR slope on close prices
          const closes = candles.slice(-20).map((c) => c.close);
          const slope = linearRegressionSlope(closes);
          const longG3 = slope > 0;
          const shortG3 = slope < 0;
          let gate3 = false;
          if (longG1) gate3 = longG3;
          else if (shortG1) gate3 = shortG3;

          const direction: "long" | "short" | null =
            longG1 ? "long" : shortG1 ? "short" : null;
          const triplelock = gate1 && gate2 && gate3;

          signals.push({
            instrument,
            baseCurrency: baseCur,
            quoteCurrency: quoteCur,
            baseScore,
            quoteScore,
            baseRank,
            quoteRank,
            gate1,
            gate2,
            gate2Detail: { highest20: snap.highest, lowest20: snap.lowest, close },
            gate3,
            gate3Detail: { slope },
            direction,
            triplelock,
            atlasBlock: atlas,
            currentPrice: close,
            sobScore: sob,
          });
        } catch (e) {
          console.warn(`[MATRIX] Skipped ${instrument}:`, (e as Error).message);
        }
      })
    );

    // Sort: triple-lock first, then gate count descending
    signals.sort((a, b) => {
      if (b.triplelock !== a.triplelock) return b.triplelock ? 1 : -1;
      const aGates = [a.gate1, a.gate2, a.gate3].filter(Boolean).length;
      const bGates = [b.gate1, b.gate2, b.gate3].filter(Boolean).length;
      return bGates - aGates;
    });

    const strikes = signals.filter((s) => s.triplelock);

    console.log(`[TRUE MATRIX] Complete. ${strikes.length} STRIKE(s) across ${signals.length} pairs.`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        environment,
        currencyScores,
        currencyRanks,
        sortedCurrencies,
        predator,
        prey,
        bestChompPair,
        signals,
        strikes,
        strikeCount: strikes.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[TRUE MATRIX] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
