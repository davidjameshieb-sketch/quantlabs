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
