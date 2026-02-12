// Forex Indicators Edge Function
// Fetches OANDA candles and computes 15+ technical indicators for any pair/timeframe
// Supports: EMA, Supertrend, Stochastics, RSI, ADX, Bollinger, Donchian, Ichimoku,
//           Parabolic SAR, CCI, Keltner, ROC, Elder Force, Heikin-Ashi, Pivot Points

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

const GRANULARITY_MAP: Record<string, string> = {
  "1m": "M1", "5m": "M5", "15m": "M15", "30m": "M30", "1h": "H1", "4h": "H4", "1d": "D",
};

// ── Candle types ──
interface Candle { o: number; h: number; l: number; c: number; v: number; t: string; }
interface HeikinAshi { o: number; h: number; l: number; c: number; }

// ── Helper math ──
function sma(data: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    out.push(sum / period);
  }
  return out;
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    out.push(data[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prev = candles[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
  });
}

function atr(candles: Candle[], period: number): number[] {
  const tr = trueRange(candles);
  return ema(tr, period);
}

// ── Indicator Implementations ──

function computeEMA(closes: number[], period: number) {
  const vals = ema(closes, period);
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  return { value: last, signal: closes[closes.length - 1] > last ? "bullish" : "bearish", slope: last - prev };
}

function computeRSI(closes: number[], period = 14) {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return { value: rsi, signal: rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral" };
}

function computeStochastics(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const slice = candles.slice(-kPeriod);
  const high = Math.max(...slice.map(c => c.h));
  const low = Math.min(...slice.map(c => c.l));
  const close = slice[slice.length - 1].c;
  const k = high === low ? 50 : ((close - low) / (high - low)) * 100;
  // Simplified %D
  const kValues: number[] = [];
  for (let i = candles.length - dPeriod; i < candles.length; i++) {
    const s = candles.slice(Math.max(0, i - kPeriod + 1), i + 1);
    const h = Math.max(...s.map(c => c.h));
    const l = Math.min(...s.map(c => c.l));
    kValues.push(h === l ? 50 : ((candles[i].c - l) / (h - l)) * 100);
  }
  const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;
  return { k, d, signal: k > 80 ? "overbought" : k < 20 ? "oversold" : k > d ? "bullish" : "bearish" };
}

function computeADX(candles: Candle[], period = 14) {
  if (candles.length < period * 2) return { value: 0, signal: "weak" };
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const upMove = candles[i].h - candles[i - 1].h;
    const downMove = candles[i - 1].l - candles[i].l;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    trSum += Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c));
  }
  const plusDI = trSum > 0 ? (plusDM / trSum) * 100 : 0;
  const minusDI = trSum > 0 ? (minusDM / trSum) * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  return { value: dx, plusDI, minusDI, signal: dx > 25 ? "trending" : "ranging" };
}

function computeBollingerBands(closes: number[], period = 20, mult = 2) {
  const s = sma(closes, period);
  const mid = s[s.length - 1];
  const slice = closes.slice(-period);
  const stddev = Math.sqrt(slice.reduce((a, v) => a + (v - mid) ** 2, 0) / period);
  const upper = mid + mult * stddev;
  const lower = mid - mult * stddev;
  const last = closes[closes.length - 1];
  const pctB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { upper, mid, lower, bandwidth: (upper - lower) / mid, pctB, signal: pctB > 1 ? "overbought" : pctB < 0 ? "oversold" : "neutral" };
}

function computeDonchian(candles: Candle[], period = 20) {
  const slice = candles.slice(-period);
  const upper = Math.max(...slice.map(c => c.h));
  const lower = Math.min(...slice.map(c => c.l));
  const mid = (upper + lower) / 2;
  const last = candles[candles.length - 1].c;
  return { upper, mid, lower, signal: last >= upper ? "breakout_high" : last <= lower ? "breakout_low" : "within" };
}

function computeIchimoku(candles: Candle[]) {
  const tenkan = (period: number) => {
    const s = candles.slice(-period);
    return (Math.max(...s.map(c => c.h)) + Math.min(...s.map(c => c.l))) / 2;
  };
  const tenkanSen = tenkan(9);
  const kijunSen = tenkan(26);
  const senkouA = (tenkanSen + kijunSen) / 2;
  const senkouB = tenkan(52);
  const close = candles[candles.length - 1].c;
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  return {
    tenkanSen, kijunSen, senkouA, senkouB,
    signal: close > cloudTop ? "bullish" : close < cloudBottom ? "bearish" : "neutral",
  };
}

function computeSupertrend(candles: Candle[], period = 10, mult = 3) {
  const atrVals = atr(candles, period);
  const last = candles[candles.length - 1];
  const atrVal = atrVals[atrVals.length - 1];
  const hl2 = (last.h + last.l) / 2;
  const upperBand = hl2 + mult * atrVal;
  const lowerBand = hl2 - mult * atrVal;
  return { value: last.c > lowerBand ? lowerBand : upperBand, signal: last.c > lowerBand ? "bullish" : "bearish" };
}

function computeParabolicSAR(candles: Candle[]) {
  let af = 0.02, maxAf = 0.2;
  let bullish = true;
  let sar = candles[0].l;
  let ep = candles[0].h;
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (bullish) {
      if (candles[i].l < sar) { bullish = false; sar = ep; ep = candles[i].l; af = 0.02; }
      else { if (candles[i].h > ep) { ep = candles[i].h; af = Math.min(af + 0.02, maxAf); } }
    } else {
      if (candles[i].h > sar) { bullish = true; sar = ep; ep = candles[i].h; af = 0.02; }
      else { if (candles[i].l < ep) { ep = candles[i].l; af = Math.min(af + 0.02, maxAf); } }
    }
  }
  return { value: sar, signal: bullish ? "bullish" : "bearish" };
}

function computeCCI(candles: Candle[], period = 20) {
  const typicals = candles.map(c => (c.h + c.l + c.c) / 3);
  const slice = typicals.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((a, v) => a + Math.abs(v - mean), 0) / period;
  const cci = meanDev === 0 ? 0 : (typicals[typicals.length - 1] - mean) / (0.015 * meanDev);
  return { value: cci, signal: cci > 100 ? "overbought" : cci < -100 ? "oversold" : "neutral" };
}

function computeKeltner(candles: Candle[], emaPeriod = 20, atrPeriod = 10, mult = 1.5) {
  const closes = candles.map(c => c.c);
  const emaVals = ema(closes, emaPeriod);
  const atrVals = atr(candles, atrPeriod);
  const mid = emaVals[emaVals.length - 1];
  const atrVal = atrVals[atrVals.length - 1];
  const upper = mid + mult * atrVal;
  const lower = mid - mult * atrVal;
  const last = closes[closes.length - 1];
  return { upper, mid, lower, signal: last > upper ? "overbought" : last < lower ? "oversold" : "neutral" };
}

function computeROC(closes: number[], period = 12) {
  const prev = closes[closes.length - 1 - period];
  const curr = closes[closes.length - 1];
  const roc = prev === 0 ? 0 : ((curr - prev) / prev) * 100;
  return { value: roc, signal: roc > 0 ? "bullish" : "bearish" };
}

function computeElderForce(candles: Candle[], period = 13) {
  const forces = candles.map((c, i) => {
    if (i === 0) return 0;
    return (c.c - candles[i - 1].c) * c.v;
  });
  const smoothed = ema(forces, period);
  const val = smoothed[smoothed.length - 1];
  return { value: val, signal: val > 0 ? "bullish" : "bearish" };
}

function computeHeikinAshi(candles: Candle[]): { candles: HeikinAshi[]; signal: string } {
  const ha: HeikinAshi[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.o + c.h + c.l + c.c) / 4;
    const haOpen = i === 0 ? (c.o + c.c) / 2 : (ha[i - 1].o + ha[i - 1].c) / 2;
    ha.push({ o: haOpen, h: Math.max(c.h, haOpen, haClose), l: Math.min(c.l, haOpen, haClose), c: haClose });
  }
  const last = ha[ha.length - 1];
  const bullishCount = ha.slice(-5).filter(h => h.c > h.o).length;
  return { candles: ha.slice(-10), signal: bullishCount >= 4 ? "bullish" : bullishCount <= 1 ? "bearish" : "neutral" };
}

function computePivotPoints(candles: Candle[]) {
  // Use previous candle as "daily" reference
  const prev = candles[candles.length - 2];
  const pivot = (prev.h + prev.l + prev.c) / 3;
  const r1 = 2 * pivot - prev.l;
  const s1 = 2 * pivot - prev.h;
  const r2 = pivot + (prev.h - prev.l);
  const s2 = pivot - (prev.h - prev.l);
  const close = candles[candles.length - 1].c;
  return { pivot, r1, r2, s1, s2, signal: close > r1 ? "above_r1" : close < s1 ? "below_s1" : "near_pivot" };
}

function computeTrendEfficiency(closes: number[], period = 14) {
  const slice = closes.slice(-period - 1);
  const netMove = Math.abs(slice[slice.length - 1] - slice[0]);
  let pathNoise = 0;
  for (let i = 1; i < slice.length; i++) pathNoise += Math.abs(slice[i] - slice[i - 1]);
  const ratio = pathNoise === 0 ? 0 : netMove / pathNoise;
  return { value: ratio, signal: ratio > 0.6 ? "trending" : ratio < 0.3 ? "choppy" : "moderate" };
}

// ── OANDA candle fetcher ──
// Supports optional from/to ISO date params for historical (backtest) mode
async function fetchCandles(instrument: string, granularity: string, count = 200, from?: string, to?: string): Promise<Candle[]> {
  const env = Deno.env.get("OANDA_ENV") || "practice";
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;

  // Build URL: if from/to provided, use date range (backtest mode); otherwise use count (live mode)
  let url: string;
  if (from && to) {
    url = `${host}/v3/instruments/${instrument}/candles?granularity=${granularity}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&price=MBA`;
  } else if (from) {
    url = `${host}/v3/instruments/${instrument}/candles?granularity=${granularity}&from=${encodeURIComponent(from)}&count=${count}&price=MBA`;
  } else {
    url = `${host}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=MBA`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OANDA candle fetch error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.candles || [])
    .filter((c: any) => c.complete !== false)
    .map((c: any) => ({
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
      v: c.volume || 0,
      t: c.time,
    }));
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const instrument = url.searchParams.get("instrument") || "USD_CAD";
    const timeframe = url.searchParams.get("timeframe") || "5m";
    const granularity = GRANULARITY_MAP[timeframe] || "M5";
    const from = url.searchParams.get("from") || undefined; // ISO date for backtest start
    const to = url.searchParams.get("to") || undefined;     // ISO date for backtest end
    const mode = from ? "backtest" : "live";

    console.log(`[FOREX-INDICATORS] ${mode} mode — ${instrument} @ ${timeframe}${from ? ` from=${from}` : ''}${to ? ` to=${to}` : ''}`);

    const candles = await fetchCandles(instrument, granularity, 200, from, to);
    if (candles.length < 60) {
      return new Response(JSON.stringify({ error: "Insufficient candle data", count: candles.length }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const closes = candles.map(c => c.c);

    // Compute raw ATR(14) for exposure in response
    const atrVals14 = atr(candles, 14);
    const currentATR = atrVals14[atrVals14.length - 1];

    const indicators = {
      ema50: computeEMA(closes, 50),
      rsi: computeRSI(closes, 14),
      stochastics: computeStochastics(candles, 14, 3),
      adx: computeADX(candles, 14),
      bollingerBands: computeBollingerBands(closes, 20, 2),
      donchianChannels: computeDonchian(candles, 20),
      ichimoku: computeIchimoku(candles),
      supertrend: computeSupertrend(candles, 10, 3),
      parabolicSAR: computeParabolicSAR(candles),
      cci: computeCCI(candles, 20),
      keltnerChannels: computeKeltner(candles, 20, 10, 1.5),
      roc: computeROC(closes, 12),
      elderForce: computeElderForce(candles, 13),
      heikinAshi: computeHeikinAshi(candles),
      pivotPoints: computePivotPoints(candles),
      trendEfficiency: computeTrendEfficiency(closes, 14),
      atr: { value: currentATR, period: 14 },
    };

    // Consensus signal
    const signals = [
      indicators.ema50.signal === "bullish" ? 1 : -1,
      indicators.rsi.signal === "oversold" ? 1 : indicators.rsi.signal === "overbought" ? -1 : 0,
      indicators.supertrend.signal === "bullish" ? 1 : -1,
      indicators.parabolicSAR.signal === "bullish" ? 1 : -1,
      indicators.ichimoku.signal === "bullish" ? 1 : indicators.ichimoku.signal === "bearish" ? -1 : 0,
      indicators.adx.signal === "trending" ? (indicators.roc.signal === "bullish" ? 1 : -1) : 0,
      indicators.heikinAshi.signal === "bullish" ? 1 : indicators.heikinAshi.signal === "bearish" ? -1 : 0,
      indicators.roc.signal === "bullish" ? 1 : -1,
      indicators.elderForce.signal === "bullish" ? 1 : -1,
    ];
    const bullish = signals.filter(s => s > 0).length;
    const bearish = signals.filter(s => s < 0).length;
    const consensusScore = ((bullish - bearish) / signals.length) * 100;

    // ═══ COMPOSITE REGIME CLASSIFICATION ═══
    // Two-axis scoring: Volatility Score + Directional Persistence Score
    const adxVal = indicators.adx.value || 0;
    const trendEff = indicators.trendEfficiency.value || 0;
    const bbWidth = indicators.bollingerBands.bandwidth || 0;
    const rsiVal = indicators.rsi.value || 50;
    const rocVal = indicators.roc.value || 0;
    const pctB = indicators.bollingerBands.pctB ?? 0.5;
    const stkK = indicators.stochastics.k ?? 50;

    // Classify bearish/bullish momentum strength (same as before)
    const bearishMomentum = (
      (indicators.roc.signal === "bearish" ? 1 : 0) +
      (indicators.elderForce.signal === "bearish" ? 1 : 0) +
      (indicators.ema50.signal === "bearish" ? 1 : 0) +
      (indicators.supertrend.signal === "bearish" ? 1 : 0) +
      (indicators.parabolicSAR.signal === "bearish" ? 1 : 0) +
      (indicators.ichimoku.signal === "bearish" ? 1 : 0) +
      (indicators.heikinAshi.signal === "bearish" ? 1 : 0)
    );
    const bullishMomentum = (
      (indicators.roc.signal === "bullish" ? 1 : 0) +
      (indicators.elderForce.signal === "bullish" ? 1 : 0) +
      (indicators.ema50.signal === "bullish" ? 1 : 0) +
      (indicators.supertrend.signal === "bullish" ? 1 : 0) +
      (indicators.parabolicSAR.signal === "bullish" ? 1 : 0) +
      (indicators.ichimoku.signal === "bullish" ? 1 : 0) +
      (indicators.heikinAshi.signal === "bullish" ? 1 : 0)
    );

    // ── AXIS 1: VOLATILITY SCORE (0-100) ──
    // Component A: ATR Ratio (current ATR vs longer-term baseline)
    const atrVals = atr(candles, 14);
    const currentATR = atrVals[atrVals.length - 1] || 0;
    // Use ATR(50) as the baseline — compare short-term vol to medium-term
    const atrLong = atrVals.length >= 50
      ? atrVals.slice(-50).reduce((a, b) => a + b, 0) / 50
      : atrVals.reduce((a, b) => a + b, 0) / Math.max(atrVals.length, 1);
    const atrRatio = atrLong > 0 ? currentATR / atrLong : 1;
    // Map: <0.7 = low vol (0-20), 0.7-1.3 = normal (30-60), >1.3 = high vol (70-100)
    const atrRatioScore = atrRatio < 0.7
      ? Math.round((atrRatio / 0.7) * 20)
      : atrRatio <= 1.3
        ? Math.round(30 + ((atrRatio - 0.7) / 0.6) * 30)
        : Math.min(100, Math.round(60 + ((atrRatio - 1.3) / 0.7) * 40));

    // Component B: Normalized BB Width (pair-relative via percentile against own history)
    const closes20 = closes.slice(-100);
    const bbWidths: number[] = [];
    for (let i = 20; i <= closes20.length; i++) {
      const slice = closes20.slice(i - 20, i);
      const m = slice.reduce((a, b) => a + b, 0) / 20;
      const sd = Math.sqrt(slice.reduce((a, v) => a + (v - m) ** 2, 0) / 20);
      if (m > 0) bbWidths.push((2 * 2 * sd) / m); // 2*mult*stddev/mid
    }
    let bbPercentile = 50;
    if (bbWidths.length > 10) {
      const sorted = [...bbWidths].sort((a, b) => a - b);
      const rank = sorted.filter(w => w <= bbWidth).length;
      bbPercentile = Math.round((rank / sorted.length) * 100);
    }

    // Component C: Historical Percentile of ATR (current ATR rank in last 100 ATR values)
    const atrWindow = atrVals.slice(-100);
    let atrPercentile = 50;
    if (atrWindow.length > 10) {
      const sorted = [...atrWindow].sort((a, b) => a - b);
      const rank = sorted.filter(v => v <= currentATR).length;
      atrPercentile = Math.round((rank / sorted.length) * 100);
    }

    // Composite Volatility Score: weighted blend
    const volatilityScore = Math.round(
      atrRatioScore * 0.40 +
      bbPercentile * 0.30 +
      atrPercentile * 0.30
    );

    // ── AXIS 2: VOLATILITY ACCELERATION (0-100) ──
    // Measures the RATE OF CHANGE of volatility — are ATR, BB width, and range expanding or contracting?
    // Prevents: false expansions, late trend entries, exhaustion traps
    
    // Component A: ATR acceleration (compare last 3-bar ATR avg vs prior 3-bar ATR avg)
    const atrRecent3 = atrVals.length >= 6
      ? (atrVals[atrVals.length - 1] + atrVals[atrVals.length - 2] + atrVals[atrVals.length - 3]) / 3
      : currentATR;
    const atrPrior3 = atrVals.length >= 6
      ? (atrVals[atrVals.length - 4] + atrVals[atrVals.length - 5] + atrVals[atrVals.length - 6]) / 3
      : currentATR;
    const atrAccelRatio = atrPrior3 > 0 ? atrRecent3 / atrPrior3 : 1;
    // Map: <0.9 = decelerating (0-30), 0.9-1.1 = stable (30-50), >1.1 = accelerating (50-100)
    const atrAccelScore = atrAccelRatio < 0.9
      ? Math.round((atrAccelRatio / 0.9) * 30)
      : atrAccelRatio <= 1.1
        ? Math.round(30 + ((atrAccelRatio - 0.9) / 0.2) * 20)
        : Math.min(100, Math.round(50 + ((atrAccelRatio - 1.1) / 0.4) * 50));

    // Component B: BB width acceleration (3-bar avg vs prior 3-bar avg — matches ATR/range cadence)
    const bbRecent3 = bbWidths.length >= 6
      ? (bbWidths[bbWidths.length - 1] + bbWidths[bbWidths.length - 2] + bbWidths[bbWidths.length - 3]) / 3
      : bbWidth;
    const bbPrior3 = bbWidths.length >= 6
      ? (bbWidths[bbWidths.length - 4] + bbWidths[bbWidths.length - 5] + bbWidths[bbWidths.length - 6]) / 3
      : bbWidth;
    const bbAccelRatio = bbPrior3 > 0 ? bbRecent3 / bbPrior3 : 1;
    const bbAccelScore = bbAccelRatio < 0.9
      ? Math.round((bbAccelRatio / 0.9) * 30)
      : bbAccelRatio <= 1.1
        ? Math.round(30 + ((bbAccelRatio - 0.9) / 0.2) * 20)
        : Math.min(100, Math.round(50 + ((bbAccelRatio - 1.1) / 0.4) * 50));

    // Component C: Range expansion (compare last 3 bars' high-low range vs prior 3 bars)
    const rangeRecent3 = candles.length >= 6
      ? ((candles[candles.length - 1].h - candles[candles.length - 1].l) +
         (candles[candles.length - 2].h - candles[candles.length - 2].l) +
         (candles[candles.length - 3].h - candles[candles.length - 3].l)) / 3
      : 0;
    const rangePrior3 = candles.length >= 6
      ? ((candles[candles.length - 4].h - candles[candles.length - 4].l) +
         (candles[candles.length - 5].h - candles[candles.length - 5].l) +
         (candles[candles.length - 6].h - candles[candles.length - 6].l)) / 3
      : 0;
    const rangeAccelRatio = rangePrior3 > 0 ? rangeRecent3 / rangePrior3 : 1;
    const rangeAccelScore = rangeAccelRatio < 0.9
      ? Math.round((rangeAccelRatio / 0.9) * 30)
      : rangeAccelRatio <= 1.1
        ? Math.round(30 + ((rangeAccelRatio - 0.9) / 0.2) * 20)
        : Math.min(100, Math.round(50 + ((rangeAccelRatio - 1.1) / 0.4) * 50));

    // Composite Volatility Acceleration Score
    const volAcceleration = Math.round(
      atrAccelScore * 0.40 +
      bbAccelScore * 0.30 +
      rangeAccelScore * 0.30
    );
    // Classify: decelerating (<35), stable (35-55), accelerating (>55)
    const accelLevel = volAcceleration < 35 ? "decelerating" : volAcceleration <= 55 ? "stable" : "accelerating";

    // ── AXIS 3: DIRECTIONAL PERSISTENCE SCORE (0-100) ──
    // Component A: Efficiency Ratio (already computed as trendEff, 0-1)
    const efficiencyScore = Math.round(trendEff * 100);

    // Component B: ADX Slope (is ADX rising or falling?)
    const adxPlusDI = (indicators.adx as any).plusDI || 0;
    const adxMinusDI = (indicators.adx as any).minusDI || 0;
    const adxNormalized = Math.min(100, Math.round(adxVal * 2)); // ADX 0-50 → 0-100

    // Component C: Structure Validation — do trend-following indicators agree?
    const trendIndicatorCount = 5;
    const dominantDir = bullishMomentum >= bearishMomentum ? "bullish" : "bearish";
    const structureCount = dominantDir === "bullish" ? bullishMomentum : bearishMomentum;
    const structureScore = Math.round((structureCount / 7) * 100);

    // Composite Directional Persistence Score
    const directionalPersistence = Math.round(
      efficiencyScore * 0.40 +
      adxNormalized * 0.35 +
      structureScore * 0.25
    );

    // ── PRICE PROGRESS VALIDATION (for exhaustion detection) ──
    // Measures whether price is STILL making progress or stalling.
    // Prevents misclassifying "orderly quiet trend" as exhaustion.
    // If persistence is strong + structure prints HH/HL, decelerating vol = orderly trend, NOT exhaustion.

    // Price progress indicator 1: ROC slope (is ROC declining?)
    const rocVal = indicators.roc.value || 0;
    const rocSlice = closes.slice(-15);
    let rocRecent = 0, rocPrior = 0;
    if (rocSlice.length >= 14) {
      const rocR = rocSlice[rocSlice.length - 1] / rocSlice[rocSlice.length - 7] - 1;
      const rocP = rocSlice[rocSlice.length - 7] / rocSlice[rocSlice.length - 13] - 1;
      rocRecent = rocR * 100;
      rocPrior = rocP * 100;
    }
    const rocDeclining = Math.abs(rocRecent) < Math.abs(rocPrior) * 0.7; // ROC magnitude shrinking >30%

    // Price progress indicator 2: Efficiency slope (is efficiency declining?)
    const effSlice = closes.slice(-22);
    let effRecent = 0, effPrior = 0;
    if (effSlice.length >= 22) {
      const recentHalf = effSlice.slice(-7);
      const priorHalf = effSlice.slice(-14, -7);
      const effR = Math.abs(recentHalf[recentHalf.length - 1] - recentHalf[0]);
      const pathR = recentHalf.reduce((s, v, i) => i > 0 ? s + Math.abs(v - recentHalf[i - 1]) : s, 0);
      effRecent = pathR > 0 ? effR / pathR : 0;
      const effP = Math.abs(priorHalf[priorHalf.length - 1] - priorHalf[0]);
      const pathP = priorHalf.reduce((s, v, i) => i > 0 ? s + Math.abs(v - priorHalf[i - 1]) : s, 0);
      effPrior = pathP > 0 ? effP / pathP : 0;
    }
    const efficiencyDeclining = effPrior > 0.1 && effRecent < effPrior * 0.6; // efficiency dropped >40%

    // Price progress indicator 3: Structure still printing HH/HL (bullish) or LL/LH (bearish)?
    const last8 = candles.slice(-8);
    let hhCount = 0, hlCount = 0, llCount = 0, lhCount = 0;
    for (let si = 1; si < last8.length; si++) {
      if (last8[si].h > last8[si - 1].h) hhCount++;
      if (last8[si].l > last8[si - 1].l) hlCount++;
      if (last8[si].l < last8[si - 1].l) llCount++;
      if (last8[si].h < last8[si - 1].h) lhCount++;
    }
    const bullishStructureIntact = hhCount >= 3 && hlCount >= 3; // still making HH+HL
    const bearishStructureIntact = llCount >= 3 && lhCount >= 3; // still making LL+LH
    const structureIntact = dominantDir === "bullish" ? bullishStructureIntact : bearishStructureIntact;

    // Combined price progress stalling = ROC declining + efficiency declining + structure NOT intact
    // If structure is intact despite vol decel → orderly trend, NOT exhaustion
    const priceProgressStalling = (rocDeclining || efficiencyDeclining) && !structureIntact;

    // ── REGIME CLASSIFICATION from three-axis composite ──
    let marketRegime: string;
    let regimeStrength: number;

    // Volatility axis: Low (<30), Normal (30-65), High (>65)
    // Persistence axis: Weak (<30), Moderate (30-60), Strong (>60)
    // Acceleration axis modifies regime confidence and prevents false classifications
    const volLevel = volatilityScore < 30 ? "low" : volatilityScore <= 65 ? "normal" : "high";
    const persLevel = directionalPersistence < 30 ? "weak" : directionalPersistence <= 60 ? "moderate" : "strong";

    if (volLevel === "low" && persLevel === "weak") {
      marketRegime = "compression";
      regimeStrength = Math.max(10, 100 - volatilityScore - directionalPersistence);
    } else if (volLevel === "low" && persLevel === "moderate") {
      marketRegime = "flat";
      regimeStrength = Math.round(directionalPersistence * 0.5 + (100 - volatilityScore) * 0.3);
    } else if (volLevel === "low" && persLevel === "strong") {
      // Low vol + strong direction + accelerating vol → transition (informational only, never trade-authorized)
      // "transition" is purely a diagnostic label — if you want early breakout entries,
      // create "pre-expansion" with stricter requirements (5m+15m bias + spread ok + accel 3 bars).
      if (accelLevel === "accelerating") {
        marketRegime = "transition"; // informational: vol catching up to direction
        regimeStrength = directionalPersistence;
      } else {
        marketRegime = "flat"; // strong direction but vol dying — no real breakout
        regimeStrength = Math.round(directionalPersistence * 0.4);
      }
    } else if (volLevel === "normal" && persLevel === "weak") {
      marketRegime = "flat";
      regimeStrength = Math.round((100 - directionalPersistence) * 0.4);
    } else if (volLevel === "normal" && persLevel === "moderate") {
      if (dominantDir === "bearish" && bearishMomentum >= 4) {
        // Only classify as risk-off if vol is NOT decelerating (prevents late entries)
        marketRegime = accelLevel === "decelerating" ? "flat" : "risk-off";
        regimeStrength = Math.round(directionalPersistence * 0.5 + volatilityScore * 0.2 + volAcceleration * 0.2);
      } else if (dominantDir === "bullish" && bullishMomentum >= 4) {
        // Only classify as momentum if vol is NOT decelerating
        marketRegime = accelLevel === "decelerating" ? "flat" : "momentum";
        regimeStrength = Math.round(directionalPersistence * 0.5 + volatilityScore * 0.2 + volAcceleration * 0.2);
      } else {
        marketRegime = "transition";
        regimeStrength = 40;
      }
    } else if (volLevel === "normal" && persLevel === "strong") {
      if (dominantDir === "bearish") {
        if (accelLevel === "decelerating") {
          // Vol decelerating + strong bearish persistence:
          // If price progress is stalling (ROC/efficiency declining + no LL/LH) → exhaustion
          // If structure intact (still printing LL/LH) → orderly quiet downtrend, classify as risk-off
          marketRegime = priceProgressStalling ? "exhaustion" : "risk-off";
        } else {
          marketRegime = bearishMomentum >= 5 ? "breakdown" : "risk-off";
        }
      } else {
        if (accelLevel === "decelerating") {
          // Vol decelerating + strong bullish persistence:
          // If price progress stalling → exhaustion; if HH/HL intact → orderly quiet uptrend = momentum
          marketRegime = priceProgressStalling ? "exhaustion" : "momentum";
        } else {
          marketRegime = bullishMomentum >= 5 ? "expansion" : "momentum";
        }
      }
      regimeStrength = Math.round(directionalPersistence * 0.4 + volatilityScore * 0.2 + volAcceleration * 0.3);
    } else if (volLevel === "high" && persLevel === "weak") {
      // High vol + no direction: if decelerating + price stalling → exhaustion; otherwise ignition
      if (accelLevel === "decelerating" && priceProgressStalling) {
        marketRegime = "exhaustion";
        regimeStrength = Math.round(volatilityScore * 0.5 + (100 - volAcceleration) * 0.3);
      } else if (accelLevel === "decelerating") {
        // Vol decelerating but no strong price stalling — could be choppy wind-down
        marketRegime = "flat"; // safer than exhaustion — no directional trade
        regimeStrength = Math.round(volatilityScore * 0.3);
      } else {
        marketRegime = "ignition";
        regimeStrength = Math.round(volatilityScore * 0.4 + volAcceleration * 0.3);
      }
    } else if (volLevel === "high" && persLevel === "moderate") {
      if (accelLevel === "decelerating") {
        // High vol decelerating + moderate direction:
        // Only exhaustion if price progress actually stalling; otherwise trend continuation at lower vol
        marketRegime = priceProgressStalling ? "exhaustion" : (dominantDir === "bearish" ? "risk-off" : "momentum");
        regimeStrength = Math.round(volatilityScore * 0.4 + (100 - volAcceleration) * 0.3);
      } else {
        marketRegime = dominantDir === "bearish" ? "risk-off" : "expansion";
        regimeStrength = Math.round(volatilityScore * 0.3 + directionalPersistence * 0.3 + volAcceleration * 0.3);
      }
    } else {
      // high vol + strong persistence
      if (accelLevel === "decelerating") {
        // Strong persistence + vol fading: exhaustion ONLY if price progress stalling
        // If HH/HL or LL/LH intact → orderly trend continuation, NOT exhaustion
        if (priceProgressStalling) {
          marketRegime = "exhaustion";
        } else {
          marketRegime = dominantDir === "bearish"
            ? (bearishMomentum >= 5 ? "breakdown" : "risk-off")
            : (bullishMomentum >= 5 ? "expansion" : "momentum");
        }
        regimeStrength = Math.round(volatilityScore * 0.3 + directionalPersistence * 0.3);
      } else {
        if (dominantDir === "bearish") {
          marketRegime = bearishMomentum >= 5 ? "breakdown" : "risk-off";
        } else {
          marketRegime = "expansion";
        }
        regimeStrength = Math.min(100, Math.round(volatilityScore * 0.3 + directionalPersistence * 0.3 + volAcceleration * 0.3));
      }
    }

    // ═══ REGIME STABILITY: Check if regime has held for last N bars ═══
    // Re-run the composite classification for the last 5 bars to detect flicker
    const STABILITY_LOOKBACK = 5;
    const recentRegimes: string[] = [marketRegime]; // current bar
    if (candles.length > STABILITY_LOOKBACK + 50) { // need enough history
      for (let barOffset = 1; barOffset < STABILITY_LOOKBACK; barOffset++) {
        const subCandles = candles.slice(0, candles.length - barOffset);
        if (subCandles.length < 50) break;
        const subCloses = subCandles.map(c => c.c);
        
        // Mini regime classification for this historical bar
        const subAtrVals = atr(subCandles, 14);
        const subCurrentATR = subAtrVals[subAtrVals.length - 1] || 0;
        const subAtrLong = subAtrVals.length >= 50
          ? subAtrVals.slice(-50).reduce((a, b) => a + b, 0) / 50
          : subAtrVals.reduce((a, b) => a + b, 0) / Math.max(subAtrVals.length, 1);
        const subAtrRatio = subAtrLong > 0 ? subCurrentATR / subAtrLong : 1;
        const subAtrRatioScore = subAtrRatio < 0.7
          ? Math.round((subAtrRatio / 0.7) * 20)
          : subAtrRatio <= 1.3
            ? Math.round(30 + ((subAtrRatio - 0.7) / 0.6) * 30)
            : Math.min(100, Math.round(60 + ((subAtrRatio - 1.3) / 0.7) * 40));
        
        // Sub BB percentile
        const subCloses20 = subCloses.slice(-100);
        const subBBWidths: number[] = [];
        for (let j = 20; j <= subCloses20.length; j++) {
          const sl = subCloses20.slice(j - 20, j);
          const m = sl.reduce((a, b) => a + b, 0) / 20;
          const sd = Math.sqrt(sl.reduce((a, v) => a + (v - m) ** 2, 0) / 20);
          if (m > 0) subBBWidths.push((2 * 2 * sd) / m);
        }
        const subBBCurrent = subBBWidths.length > 0 ? subBBWidths[subBBWidths.length - 1] : 0;
        let subBBPctl = 50;
        if (subBBWidths.length > 10) {
          const sorted = [...subBBWidths].sort((a, b) => a - b);
          subBBPctl = Math.round(sorted.filter(w => w <= subBBCurrent).length / sorted.length * 100);
        }

        const subAtrWindow = subAtrVals.slice(-100);
        let subAtrPctl = 50;
        if (subAtrWindow.length > 10) {
          const sorted = [...subAtrWindow].sort((a, b) => a - b);
          subAtrPctl = Math.round(sorted.filter(v => v <= subCurrentATR).length / sorted.length * 100);
        }

        const subVolScore = Math.round(subAtrRatioScore * 0.40 + subBBPctl * 0.30 + subAtrPctl * 0.30);

        // Sub trend efficiency
        const subTrendEff = (() => {
          const sl = subCloses.slice(-15);
          const net = Math.abs(sl[sl.length - 1] - sl[0]);
          let path = 0;
          for (let k = 1; k < sl.length; k++) path += Math.abs(sl[k] - sl[k - 1]);
          return path === 0 ? 0 : net / path;
        })();
        const subEffScore = Math.round(subTrendEff * 100);
        
        // Sub ADX (simplified — use current since it's smoothed)
        const subAdxNorm = adxNormalized; // ADX is already smoothed, stable across 5 bars
        const subStructScore = structureScore; // Structure won't change drastically bar-to-bar
        const subPersis = Math.round(subEffScore * 0.40 + subAdxNorm * 0.35 + subStructScore * 0.25);

        const subVol = subVolScore < 30 ? "low" : subVolScore <= 65 ? "normal" : "high";
        const subPers = subPersis < 30 ? "weak" : subPersis <= 60 ? "moderate" : "strong";

        // Simplified regime label from axes
        let subRegime: string;
        if (subVol === "low" && subPers === "weak") subRegime = "compression";
        else if (subVol === "low" && subPers === "moderate") subRegime = "flat";
        else if (subVol === "low" && subPers === "strong") subRegime = "transition";
        else if (subVol === "normal" && subPers === "weak") subRegime = "flat";
        else if (subVol === "normal" && subPers === "moderate") subRegime = dominantDir === "bearish" && bearishMomentum >= 4 ? "risk-off" : dominantDir === "bullish" && bullishMomentum >= 4 ? "momentum" : "transition";
        else if (subVol === "normal" && subPers === "strong") subRegime = dominantDir === "bearish" ? "breakdown" : "expansion";
        else if (subVol === "high" && subPers === "weak") subRegime = (rsiVal > 70 || rsiVal < 30) ? "exhaustion" : "ignition";
        else if (subVol === "high" && subPers === "moderate") subRegime = dominantDir === "bearish" ? "risk-off" : "expansion";
        else subRegime = dominantDir === "bearish" ? "breakdown" : "expansion";

        recentRegimes.push(subRegime);
      }
    }

    // Count how many of the last N bars share the current regime
    const holdBars = recentRegimes.filter(r => r === marketRegime).length;

    // ═══ DIRECTION-AWARE REGIME FAMILIES ═══
    // Family grouping must encode bull/bear direction from persistence + momentum,
    // NOT from the regime name alone. "Momentum" can be bullish or bearish.
    const BULLISH_TRADE_REGIMES = ["expansion", "momentum"];
    const BEARISH_TRADE_REGIMES = ["breakdown", "risk-off"];
    const NEUTRAL_NO_TRADE_REGIMES = ["compression", "flat", "exhaustion", "ignition", "transition"];

    // Derive family direction from 15m-equivalent persistence direction (dominantDir)
    // and the regime label. This prevents bullish family from confirming bearish momentum.
    const regimeDirection = dominantDir; // "bullish" or "bearish" — derived from indicator persistence
    let familyLabel: string;
    if (NEUTRAL_NO_TRADE_REGIMES.includes(marketRegime)) {
      familyLabel = "neutral"; // All no-trade regimes grouped as one NEUTRAL family
    } else if (BULLISH_TRADE_REGIMES.includes(marketRegime) && regimeDirection === "bullish") {
      familyLabel = "bullish";
    } else if (BEARISH_TRADE_REGIMES.includes(marketRegime) && regimeDirection === "bearish") {
      familyLabel = "bearish";
    } else {
      // Direction mismatch: e.g., "momentum" label but bearish persistence → treat as neutral
      // This catches the case where bullish family accidentally confirms bearish momentum
      familyLabel = "neutral";
    }

    // Family hold: count bars where BOTH regime family AND direction match
    const familyHoldBars = recentRegimes.filter((r, idx) => {
      if (familyLabel === "neutral") return NEUTRAL_NO_TRADE_REGIMES.includes(r);
      if (familyLabel === "bullish") return BULLISH_TRADE_REGIMES.includes(r);
      if (familyLabel === "bearish") return BEARISH_TRADE_REGIMES.includes(r);
      return r === marketRegime;
    }).length;

    // ═══ ASYMMETRIC PERSISTENCE ═══
    // Entry: require 3+ bars confirmed (slow to enter)
    // Exit/throttle: only 1-2 bars of divergence triggers defense (quick to back off)
    const regimeConfirmed = holdBars >= 3; // exact match held 3+ bars
    const regimeFamilyConfirmed = familyHoldBars >= 3; // family held 3+ bars (entry gate)

    // Divergence detection: how many of last 5 bars DISAGREE with current family?
    const divergentBars = recentRegimes.filter(r => {
      if (familyLabel === "bullish") return !BULLISH_TRADE_REGIMES.includes(r);
      if (familyLabel === "bearish") return !BEARISH_TRADE_REGIMES.includes(r);
      return !NEUTRAL_NO_TRADE_REGIMES.includes(r); // for neutral, divergence = any trade regime appearing
    }).length;
    // If 2+ of last 5 bars diverge from current family → regime is unstable, throttle
    const regimeDiverging = divergentBars >= 2;
    // If 1+ bars diverge → early warning (can be used for tighter stops / reduced sizing)
    const regimeEarlyWarning = divergentBars >= 1 && !regimeDiverging;

    console.log(`[REGIME-COMPOSITE] ${instrument}/${timeframe}: volScore=${volatilityScore} | accel=${volAcceleration}(${accelLevel}) [atr=${atrAccelScore},bb=${bbAccelScore},range=${rangeAccelScore}] | persScore=${directionalPersistence} (eff=${efficiencyScore}, adx=${adxNormalized}, struct=${structureScore}) → ${marketRegime} (${regimeStrength}) | dir=${regimeDirection} family=${familyLabel} | priceStalling=${priceProgressStalling} rocDecl=${rocDeclining} effDecl=${efficiencyDeclining} structIntact=${structureIntact} | hold=${holdBars}/${STABILITY_LOOKBACK} familyHold=${familyHoldBars} confirmed=${regimeFamilyConfirmed} divergent=${divergentBars} diverging=${regimeDiverging} earlyWarn=${regimeEarlyWarning} recentRegimes=[${recentRegimes.join(',')}]`);

    const lastCandle = candles[candles.length - 1];

    return new Response(JSON.stringify({
      instrument,
      timeframe,
      mode,
      lastPrice: lastCandle.c,
      lastTime: lastCandle.t,
      firstTime: candles[0]?.t,
      candleCount: candles.length,
      indicators,
      consensus: {
        score: Math.round(consensusScore),
        direction: consensusScore > 20 ? "bullish" : consensusScore < -20 ? "bearish" : "neutral",
        bullishCount: bullish,
        bearishCount: bearish,
        neutralCount: signals.length - bullish - bearish,
      },
      // ═══ COMPOSITE REGIME: Volatility Score + Acceleration + Directional Persistence + Stability ═══
      regime: {
        label: marketRegime,
        strength: regimeStrength,
        volatilityScore,
        volAcceleration,
        accelLevel,
        atrAccelRatio: Math.round(atrAccelRatio * 1000) / 1000,
        bbAccelRatio: Math.round(bbAccelRatio * 1000) / 1000,
        rangeAccelRatio: Math.round(rangeAccelRatio * 1000) / 1000,
        directionalPersistence,
        atrRatio: Math.round(atrRatio * 100) / 100,
        bbPercentile,
        atrPercentile,
        efficiencyScore,
        structureScore,
        bearishMomentum,
        bullishMomentum,
        adx: adxVal,
        trendEfficiency: trendEff,
        bollingerWidth: bbWidth,
        // ═══ REGIME STABILITY: Direction-aware anti-flicker confirmation ═══
        holdBars,
        familyHoldBars,
        familyLabel,           // "bullish" | "bearish" | "neutral" — direction-aware
        regimeDirection,       // persistence-derived direction ("bullish" | "bearish")
        regimeConfirmed,
        regimeFamilyConfirmed,
        // ═══ ASYMMETRIC PERSISTENCE: Slow entry, fast exit ═══
        divergentBars,         // how many of last 5 bars disagree with current family
        regimeDiverging,       // 2+ bars diverge → throttle/exit signal
        regimeEarlyWarning,    // 1 bar diverges → tighten stops / reduce sizing
        // ═══ PRICE PROGRESS VALIDATION: Prevents false exhaustion on orderly trends ═══
        priceProgressStalling, // true = ROC/efficiency declining + structure broken
        rocDeclining,          // ROC magnitude shrinking >30%
        efficiencyDeclining,   // price path efficiency dropped >40%
        structureIntact,       // HH/HL (bull) or LL/LH (bear) still printing
        recentRegimes,
        shortFriendly: ["breakdown", "risk-off"].includes(marketRegime), // exhaustion removed — it's neutral now
        longFriendly: ["expansion", "momentum", "exhaustion"].includes(marketRegime),
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FOREX-INDICATORS] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
