// Sovereign Matrix v20.0 — Mechanical Chomp
// 30m macro matrix: Veff Atlas Wall, Triple-Lock gates, 1250-unit scaling

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// The 7 major pairs used to build the 8-currency matrix
const MATRIX_PAIRS = [
  { instrument: "EUR_USD", base: "EUR", quote: "USD", quoteInverted: false },
  { instrument: "GBP_USD", base: "GBP", quote: "USD", quoteInverted: false },
  { instrument: "AUD_USD", base: "AUD", quote: "USD", quoteInverted: false },
  { instrument: "NZD_USD", base: "NZD", quote: "USD", quoteInverted: false },
  { instrument: "USD_CAD", base: "USD", quote: "CAD", quoteInverted: true },
  { instrument: "USD_CHF", base: "USD", quote: "CHF", quoteInverted: true },
  { instrument: "USD_JPY", base: "USD", quote: "JPY", quoteInverted: true },
];

const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

// Supported scannable pairs (base_quote format for OANDA)
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
  gate1: boolean; // Matrix Alignment
  gate2: boolean; // Atlas Snap (20-period breakout)
  gate2Detail: { highest20: number; lowest20: number; close: number };
  gate3: boolean; // David Vector (LR slope)
  gate3Detail: { slope: number };
  direction: "long" | "short" | null;
  triplelock: boolean;
  atlasBlock: AtlasBlock | null;
  currentPrice: number;
  sobScore: number; // S_sob for this pair
}

interface CurrencyScores {
  [currency: string]: number;
}

async function fetchCandles(
  instrument: string,
  count: number,
  environment: "practice" | "live",
  apiToken: string
): Promise<Candle[]> {
  const host = environment === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Candle fetch failed for ${instrument}: ${err}`);
  }

  const data = await res.json();
  return (data.candles || [])
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
}

// Volume Efficiency: volume needed per pip of movement
function computeVeff(candles: Candle[]): number[] {
  return candles.map((c) => {
    const range = Math.abs(c.high - c.low);
    if (range === 0) return 0;
    return c.volume / range;
  });
}

// Simple Moving Average
function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

// Atlas Wall: find the most recent cluster candle in last 20 periods
function findAtlasBlock(candles: Candle[], period = 20): AtlasBlock | null {
  if (candles.length < period) return null;

  const recent = candles.slice(-period);
  const veff = computeVeff(recent);
  const avgVeff = veff.reduce((a, b) => a + b, 0) / veff.length;
  const threshold = avgVeff * 1.5;

  // Find most recent cluster candle
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

// Linear Regression slope over N points (y = mx + b, return m)
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

// Gate 2: Atlas Snap — 20-period highest high / lowest low breakout
function computeAtlasSnap(candles: Candle[], period = 20): { highest: number; lowest: number } {
  if (candles.length < period) {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    return { highest: Math.max(...highs), lowest: Math.min(...lows) };
  }
  const slice = candles.slice(-period);
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
    const targetPair: string | undefined = body.pair; // optional: scan a specific pair

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

    // ── Step 1: Fetch 22 candles for all 7 matrix pairs (20 lookback + 2 buffer)
    console.log(`[MATRIX] Fetching 30m candles for matrix pairs (env: ${environment})`);

    const matrixCandleResults = await Promise.allSettled(
      MATRIX_PAIRS.map(async (p) => ({
        pair: p,
        candles: await fetchCandles(p.instrument, 22, environment, apiToken),
      }))
    );

    // ── Step 2: Compute S_sob for each matrix pair → derive 8-currency scores
    const pairSob: Record<string, number> = {};
    for (const result of matrixCandleResults) {
      if (result.status === "fulfilled") {
        const { pair, candles } = result.value;
        const atlas = findAtlasBlock(candles);
        const sob = computeSob(candles, atlas);
        pairSob[pair.instrument] = sob;
      }
    }

    // Currency score aggregation (Synthetic Matrix Strength)
    const currencyScores: CurrencyScores = {};
    for (const c of ALL_CURRENCIES) currencyScores[c] = 0;

    for (const p of MATRIX_PAIRS) {
      const sob = pairSob[p.instrument] ?? 0;
      if (!p.quoteInverted) {
        // base/USD pair: sob > 0 means base is strong vs USD
        currencyScores[p.base] = (currencyScores[p.base] || 0) + sob;
        currencyScores[p.quote] = (currencyScores[p.quote] || 0) - sob;
      } else {
        // USD/quote pair: sob > 0 means USD is strong vs quote
        currencyScores[p.base] = (currencyScores[p.base] || 0) + sob;
        currencyScores[p.quote] = (currencyScores[p.quote] || 0) - sob;
      }
    }

    console.log("[MATRIX] Currency scores:", JSON.stringify(currencyScores));

    // ── Step 3: Scan target pair(s) for Triple-Lock signal
    const pairsToScan = targetPair ? [targetPair] : SCAN_PAIRS;
    const signals: MatrixSignal[] = [];

    await Promise.allSettled(
      pairsToScan.map(async (instrument) => {
        const parts = instrument.split("_");
        if (parts.length !== 2) return;
        const [baseCur, quoteCur] = parts;

        try {
          const candles = await fetchCandles(instrument, 22, environment, apiToken);
          if (candles.length < 20) return;

          const close = candles[candles.length - 1].close;
          const atlas = findAtlasBlock(candles);
          const sob = computeSob(candles, atlas);

          const baseScore = currencyScores[baseCur] ?? 0;
          const quoteScore = currencyScores[quoteCur] ?? 0;

          // Gate 1: Matrix Alignment
          const longG1 = baseScore >= 1 && quoteScore <= -1;
          const shortG1 = baseScore <= -1 && quoteScore >= 1;
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

    console.log(`[MATRIX] Scan complete. ${strikes.length} STRIKE(s) detected across ${signals.length} pairs.`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        environment,
        currencyScores,
        signals,
        strikes,
        strikeCount: strikes.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[MATRIX] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
