// Alpha Discovery Engine v4.0 — Unrestricted Alpha Mining
// Full "Kitchen Sink" indicator library: RSI, MACD, Bollinger Bands, EMAs, Volume, Day-of-Week
// GA genome references ANY combination of indicators — no Sovereign Matrix constraints
//
// Phase 1: Fetch candles, compute 20+ indicators, store in sovereign_memory
// Phase 2: Run N generations per invocation, persist population state
// Phase 3: Extract top 10 mathematically distinct strategies

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// ── Types ──────────────────────────────────────────────────────────────────
interface Candle { time: string; volume: number; high: number; low: number; open: number; close: number; }

// Unrestricted DNA — each gene selects an indicator condition
interface StrategyDNA {
  // Entry indicators (any combination)
  rsiPeriod: number;        // 7, 14, 21
  rsiLow: number;           // 15-45 (buy below)
  rsiHigh: number;          // 55-85 (sell above)
  rsiMode: number;          // 0=off, 1=oversold-buy, 2=overbought-sell, 3=midline-cross

  macdFast: number;         // 8, 12, 16
  macdSlow: number;         // 21, 26, 34
  macdSignal: number;       // 5, 9, 12
  macdMode: number;         // 0=off, 1=signal-cross, 2=zero-cross, 3=histogram-divergence

  bbPeriod: number;         // 14, 20, 30
  bbStdDev: number;         // 1.5, 2.0, 2.5, 3.0
  bbMode: number;           // 0=off, 1=squeeze-breakout, 2=mean-revert, 3=band-walk

  emaFast: number;          // 5, 8, 13, 21
  emaSlow: number;          // 34, 50, 100, 200
  emaMode: number;          // 0=off, 1=crossover, 2=price-above-both, 3=slope-filter

  volMode: number;          // 0=off, 1=high-vol-only, 2=low-vol-only, 3=vol-expansion
  
  sessionFilter: number;    // -1=any, 0=Asia, 1=London, 2=NY, 3=NYClose
  dayFilter: number;        // -1=any, 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri

  direction: number;        // 0=long, 1=short, 2=both

  // Risk
  slMultiplier: number;     // 0.5 - 3.5 ATR
  tpMultiplier: number;     // 0.5 - 6.0 ATR

  // Hurst filter
  hurstMin: number;
  hurstMax: number;
}

interface SimResult {
  trades: number; wins: number; winRate: number; profitFactor: number;
  totalPips: number; maxDrawdown: number; grossProfit: number; grossLoss: number;
  totalReturn: number; equityCurve: number[]; dailyReturns: number[];
}

interface ScoredIndividual {
  dna: StrategyDNA; fitness: number; sim: SimResult;
  correlation: number; strategyName: string; edgeDescription: string;
  entryRules: string[]; exitRules: string[];
}

// Extended feature arrays — "kitchen sink" indicators
interface BarArrays {
  close: number[]; high: number[]; low: number[]; open: number[];
  atr: number[];
  // RSI at periods 7, 14, 21
  rsi7: number[]; rsi14: number[]; rsi21: number[];
  // MACD variants
  macdLine_12_26: number[]; macdSignal_12_26_9: number[]; macdHist_12_26_9: number[];
  macdLine_8_21: number[]; macdSignal_8_21_5: number[]; macdHist_8_21_5: number[];
  // Bollinger Bands (20,2)
  bbUpper: number[]; bbMiddle: number[]; bbLower: number[]; bbWidth: number[];
  // EMAs
  ema5: number[]; ema8: number[]; ema13: number[]; ema21: number[];
  ema34: number[]; ema50: number[]; ema100: number[]; ema200: number[];
  // Volume
  volRatio: number[]; // current vol / 20-period avg vol
  // Time
  session: number[]; dayOfWeek: number[];
  // Hurst
  hurst: number[];
  // Volatility bucket
  volBucket: number[];
  // Bias
  isLongBias: number[];
  // MFE/MAE for simulation
  mfeLong: number[]; maeLong: number[];
  mfeShort: number[]; maeShort: number[];
  isJPY: number[];
  count: number;
}

// ── Indicator Calculations ─────────────────────────────────────────────────

function computeEMA(values: number[], period: number): number[] {
  const ema = new Array(values.length).fill(0);
  if (values.length < period) return ema;
  // SMA for seed
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function computeRSI(closes: number[], period: number): number[] {
  const rsi = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta; else avgLoss -= delta;
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (delta > 0 ? delta : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (delta < 0 ? -delta : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeMACD(closes: number[], fast: number, slow: number, signal: number): { line: number[]; signal: number[]; hist: number[] } {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = computeEMA(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { line: macdLine, signal: signalLine, hist };
}

function computeBollingerBands(closes: number[], period: number, stdDevMult: number): { upper: number[]; middle: number[]; lower: number[]; width: number[] } {
  const n = closes.length;
  const upper = new Array(n).fill(0);
  const middle = new Array(n).fill(0);
  const lower = new Array(n).fill(0);
  const width = new Array(n).fill(0);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const sma = sum / period;
    let ssq = 0;
    for (let j = i - period + 1; j <= i; j++) ssq += (closes[j] - sma) ** 2;
    const std = Math.sqrt(ssq / period);
    middle[i] = sma;
    upper[i] = sma + stdDevMult * std;
    lower[i] = sma - stdDevMult * std;
    width[i] = sma > 0 ? (upper[i] - lower[i]) / sma : 0;
  }
  return { upper, middle, lower, width };
}

function computeATR(candles: Candle[], period = 14): number[] {
  const atrs = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - candles[j - 1].close),
        Math.abs(candles[j].low - candles[j - 1].close)
      );
    }
    atrs[i] = sum / period;
  }
  return atrs;
}

function computeHurst(closes: number[], start: number, window: number): number {
  if (start < window) return 0.5;
  const returns: number[] = [];
  for (let i = start - window + 1; i <= start; i++) {
    if (closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (returns.length < 3) return 0.5;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let cumSum = 0, cumMin = 0, cumMax = 0, ssq = 0;
  for (const r of returns) {
    const d = r - mean;
    cumSum += d;
    if (cumSum > cumMax) cumMax = cumSum;
    if (cumSum < cumMin) cumMin = cumSum;
    ssq += d * d;
  }
  const S = Math.sqrt(ssq / returns.length);
  if (S === 0) return 0.5;
  return Math.log((cumMax - cumMin) / S) / Math.log(returns.length);
}

function getSession(time: string): number {
  const h = new Date(time).getUTCHours();
  if (h < 7) return 0; if (h < 12) return 1; if (h < 17) return 2; return 3;
}

function getDayOfWeek(time: string): number {
  return new Date(time).getUTCDay(); // 0=Sun, 1=Mon...5=Fri
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]; sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i];
  }
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  return den === 0 ? 0 : num / den;
}

// ── Candle Fetching ──────────────────────────────────────────────────────
async function fetchCandlePage(
  instrument: string, count: number, env: "practice" | "live", token: string, to?: string
): Promise<Candle[]> {
  const host = env === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  let url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  if (to) url += `&to=${to}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.candles || [])
    .filter((c: { complete?: boolean }) => c.complete !== false)
    .map((c: { time: string; volume: number; mid: { h: string; l: string; o: string; c: string } }) => ({
      time: c.time, volume: c.volume,
      high: parseFloat(c.mid.h), low: parseFloat(c.mid.l),
      open: parseFloat(c.mid.o), close: parseFloat(c.mid.c),
    }));
}

async function fetchCandles(
  instrument: string, count: number, env: "practice" | "live", token: string
): Promise<Candle[]> {
  const PAGE_SIZE = 5000;
  if (count <= PAGE_SIZE) return fetchCandlePage(instrument, count, env, token);
  let all: Candle[] = [];
  let remaining = count;
  let cursor: string | undefined = undefined;
  while (remaining > 0) {
    const batch = Math.min(remaining, PAGE_SIZE);
    const page = await fetchCandlePage(instrument, batch, env, token, cursor);
    if (page.length === 0) break;
    all = [...page, ...all];
    remaining -= page.length;
    if (page.length < batch) break;
    cursor = page[0].time;
  }
  const seen = new Set<string>();
  return all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
}

// ── Build full indicator library ──────────────────────────────────────────
function buildFeatureArrays(pair: string, candles: Candle[]): BarArrays {
  const isJPY = pair.includes('JPY') ? 1 : 0;
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const opens = candles.map(c => c.open);
  const volumes = candles.map(c => c.volume);

  // Pre-compute all indicators on raw candle data
  const atrs = computeATR(candles, 14);
  const rsi7 = computeRSI(closes, 7);
  const rsi14 = computeRSI(closes, 14);
  const rsi21 = computeRSI(closes, 21);

  const macd1 = computeMACD(closes, 12, 26, 9);
  const macd2 = computeMACD(closes, 8, 21, 5);

  const bb = computeBollingerBands(closes, 20, 2.0);

  const ema5 = computeEMA(closes, 5);
  const ema8 = computeEMA(closes, 8);
  const ema13 = computeEMA(closes, 13);
  const ema21 = computeEMA(closes, 21);
  const ema34 = computeEMA(closes, 34);
  const ema50 = computeEMA(closes, 50);
  const ema100 = computeEMA(closes, 100);
  const ema200 = computeEMA(closes, 200);

  // Volume ratio: current / 20-period average
  const volAvg20: number[] = new Array(n).fill(0);
  for (let i = 19; i < n; i++) {
    let sum = 0; for (let j = i - 19; j <= i; j++) sum += volumes[j];
    volAvg20[i] = sum / 20;
  }

  // Volatility percentiles for bucketing
  const vols: number[] = [];
  for (let i = 20; i < n; i++) {
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) {
      if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; }
    }
    vols.push(Math.sqrt(ssq / 19));
  }
  const sortedVols = [...vols].sort((a, b) => a - b);
  const p33 = sortedVols[Math.floor(sortedVols.length * 0.33)] || 0;
  const p66 = sortedVols[Math.floor(sortedVols.length * 0.66)] || 0;

  // Build bar arrays starting at index 200 (to ensure all indicators are warm)
  const START = 200;
  const bars: BarArrays = {
    close: [], high: [], low: [], open: [], atr: [],
    rsi7: [], rsi14: [], rsi21: [],
    macdLine_12_26: [], macdSignal_12_26_9: [], macdHist_12_26_9: [],
    macdLine_8_21: [], macdSignal_8_21_5: [], macdHist_8_21_5: [],
    bbUpper: [], bbMiddle: [], bbLower: [], bbWidth: [],
    ema5: [], ema8: [], ema13: [], ema21: [],
    ema34: [], ema50: [], ema100: [], ema200: [],
    volRatio: [], session: [], dayOfWeek: [],
    hurst: [], volBucket: [], isLongBias: [],
    mfeLong: [], maeLong: [], mfeShort: [], maeShort: [],
    isJPY: [], count: 0,
  };

  for (let i = START; i < n - 8; i++) {
    const currentATR = atrs[i] || 0.001;
    const hurst = computeHurst(closes, i, 20);

    // Volatility bucket
    const volIdx = i - 20;
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) {
      if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; }
    }
    const rollingVol = Math.sqrt(ssq / 19);
    const volBucket = rollingVol <= p33 ? 0 : rollingVol <= p66 ? 1 : 2;

    // Percent return for bias
    let pctSum = 0;
    for (let j = i - 19; j <= i; j++) {
      if (candles[j].open !== 0) pctSum += ((candles[j].close - candles[j].open) / candles[j].open) * 100;
    }
    const isLongBias = pctSum > 0 ? 1 : 0;

    // Future MFE/MAE over 8 bars — for BOTH directions
    let mfeLong = 0, maeLong = 0, mfeShort = 0, maeShort = 0;
    for (let j = i + 1; j <= i + 8 && j < n; j++) {
      const favL = candles[j].high - candles[i].close;
      const advL = candles[i].close - candles[j].low;
      if (favL > mfeLong) mfeLong = favL;
      if (advL > maeLong) maeLong = advL;
      const favS = candles[i].close - candles[j].low;
      const advS = candles[j].high - candles[i].close;
      if (favS > mfeShort) mfeShort = favS;
      if (advS > maeShort) maeShort = advS;
    }

    const vr = volAvg20[i] > 0 ? volumes[i] / volAvg20[i] : 1;

    bars.close.push(closes[i]); bars.high.push(highs[i]); bars.low.push(lows[i]); bars.open.push(opens[i]);
    bars.atr.push(currentATR);
    bars.rsi7.push(rsi7[i]); bars.rsi14.push(rsi14[i]); bars.rsi21.push(rsi21[i]);
    bars.macdLine_12_26.push(macd1.line[i]); bars.macdSignal_12_26_9.push(macd1.signal[i]); bars.macdHist_12_26_9.push(macd1.hist[i]);
    bars.macdLine_8_21.push(macd2.line[i]); bars.macdSignal_8_21_5.push(macd2.signal[i]); bars.macdHist_8_21_5.push(macd2.hist[i]);
    bars.bbUpper.push(bb.upper[i]); bars.bbMiddle.push(bb.middle[i]); bars.bbLower.push(bb.lower[i]); bars.bbWidth.push(bb.width[i]);
    bars.ema5.push(ema5[i]); bars.ema8.push(ema8[i]); bars.ema13.push(ema13[i]); bars.ema21.push(ema21[i]);
    bars.ema34.push(ema34[i]); bars.ema50.push(ema50[i]); bars.ema100.push(ema100[i]); bars.ema200.push(ema200[i]);
    bars.volRatio.push(Math.round(vr * 100) / 100);
    bars.session.push(getSession(candles[i].time));
    bars.dayOfWeek.push(getDayOfWeek(candles[i].time));
    bars.hurst.push(hurst); bars.volBucket.push(volBucket); bars.isLongBias.push(isLongBias);
    bars.mfeLong.push(mfeLong); bars.maeLong.push(maeLong);
    bars.mfeShort.push(mfeShort); bars.maeShort.push(maeShort);
    bars.isJPY.push(isJPY);
    bars.count++;
  }

  return bars;
}

// ── Simulation Engine ─────────────────────────────────────────────────────

function getRSI(bars: BarArrays, i: number, period: number): number {
  if (period <= 10) return bars.rsi7[i];
  if (period <= 17) return bars.rsi14[i];
  return bars.rsi21[i];
}

function getMACD(bars: BarArrays, i: number, fast: number): { line: number; signal: number; hist: number } {
  if (fast <= 10) return { line: bars.macdLine_8_21[i], signal: bars.macdSignal_8_21_5[i], hist: bars.macdHist_8_21_5[i] };
  return { line: bars.macdLine_12_26[i], signal: bars.macdSignal_12_26_9[i], hist: bars.macdHist_12_26_9[i] };
}

function getEMA(bars: BarArrays, i: number, period: number): number {
  if (period <= 6) return bars.ema5[i];
  if (period <= 10) return bars.ema8[i];
  if (period <= 17) return bars.ema13[i];
  if (period <= 27) return bars.ema21[i];
  if (period <= 42) return bars.ema34[i];
  if (period <= 75) return bars.ema50[i];
  if (period <= 150) return bars.ema100[i];
  return bars.ema200[i];
}

function evaluateEntry(bars: BarArrays, i: number, dna: StrategyDNA): { long: boolean; short: boolean } {
  let longSignals = 0, shortSignals = 0;
  let activeIndicators = 0;

  // RSI
  if (dna.rsiMode > 0) {
    activeIndicators++;
    const rsi = getRSI(bars, i, dna.rsiPeriod);
    if (dna.rsiMode === 1) { if (rsi < dna.rsiLow) longSignals++; if (rsi > dna.rsiHigh) shortSignals++; }
    else if (dna.rsiMode === 2) { if (rsi > dna.rsiHigh) shortSignals++; if (rsi < dna.rsiLow) longSignals++; }
    else if (dna.rsiMode === 3) { if (rsi > 50) longSignals++; else shortSignals++; }
  }

  // MACD
  if (dna.macdMode > 0) {
    activeIndicators++;
    const macd = getMACD(bars, i, dna.macdFast);
    if (dna.macdMode === 1) { if (macd.line > macd.signal) longSignals++; else shortSignals++; }
    else if (dna.macdMode === 2) { if (macd.line > 0) longSignals++; else shortSignals++; }
    else if (dna.macdMode === 3) { if (macd.hist > 0) longSignals++; else shortSignals++; }
  }

  // Bollinger Bands
  if (dna.bbMode > 0) {
    activeIndicators++;
    const c = bars.close[i];
    if (dna.bbMode === 1) { // squeeze breakout
      if (c > bars.bbUpper[i]) longSignals++;
      if (c < bars.bbLower[i]) shortSignals++;
    } else if (dna.bbMode === 2) { // mean reversion
      if (c < bars.bbLower[i]) longSignals++;
      if (c > bars.bbUpper[i]) shortSignals++;
    } else if (dna.bbMode === 3) { // band walk
      if (c > bars.bbMiddle[i] && c < bars.bbUpper[i]) longSignals++;
      if (c < bars.bbMiddle[i] && c > bars.bbLower[i]) shortSignals++;
    }
  }

  // EMA crossover/filter
  if (dna.emaMode > 0) {
    activeIndicators++;
    const fast = getEMA(bars, i, dna.emaFast);
    const slow = getEMA(bars, i, dna.emaSlow);
    if (dna.emaMode === 1) { if (fast > slow) longSignals++; else shortSignals++; }
    else if (dna.emaMode === 2) { if (bars.close[i] > fast && bars.close[i] > slow) longSignals++; if (bars.close[i] < fast && bars.close[i] < slow) shortSignals++; }
    else if (dna.emaMode === 3) { // slope filter (fast EMA rising/falling)
      if (i > 0) {
        const prevFast = getEMA(bars, i - 1, dna.emaFast);
        if (fast > prevFast) longSignals++; else shortSignals++;
      }
    }
  }

  // Volume filter
  if (dna.volMode > 0) {
    if (dna.volMode === 1 && bars.volBucket[i] < 2) return { long: false, short: false };
    if (dna.volMode === 2 && bars.volBucket[i] > 0) return { long: false, short: false };
    if (dna.volMode === 3 && bars.volRatio[i] < 1.5) return { long: false, short: false };
  }

  // Session filter
  if (dna.sessionFilter >= 0 && bars.session[i] !== dna.sessionFilter) return { long: false, short: false };

  // Day filter
  if (dna.dayFilter >= 0 && bars.dayOfWeek[i] !== (dna.dayFilter + 1)) return { long: false, short: false }; // +1 because Mon=1

  // Hurst filter
  if (bars.hurst[i] < dna.hurstMin || bars.hurst[i] > dna.hurstMax) return { long: false, short: false };

  // Need at least 1 active indicator with a signal
  if (activeIndicators === 0) return { long: false, short: false };

  // Majority vote: need > 50% of active indicators agreeing
  const threshold = Math.ceil(activeIndicators / 2);
  const isLong = longSignals >= threshold && longSignals > shortSignals;
  const isShort = shortSignals >= threshold && shortSignals > longSignals;

  // Direction filter
  if (dna.direction === 0) return { long: isLong, short: false };
  if (dna.direction === 1) return { long: false, short: isShort };
  return { long: isLong, short: isShort };
}

function simulateStrategy(bars: BarArrays, dna: StrategyDNA): SimResult {
  const START_EQ = 1000;
  let equity = START_EQ, peak = START_EQ, maxDD = 0;
  let trades = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  const curve: number[] = [START_EQ];
  const dailyReturns: number[] = [];
  let dayCounter = 0, dayStart = equity;

  for (let i = 1; i < bars.count; i++) {
    const entry = evaluateEntry(bars, i, dna);
    const isLong = entry.long;
    const isShort = entry.short;

    dayCounter++;
    if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / (dayStart || 1)); dayStart = equity; dayCounter = 0; }

    if (!isLong && !isShort) continue;

    const sl = bars.atr[i] * dna.slMultiplier;
    const tp = bars.atr[i] * dna.tpMultiplier;
    const pipMult = bars.isJPY[i] ? 100 : 10000;

    let pips: number;
    if (isLong) {
      if (bars.mfeLong[i] >= tp) pips = tp * pipMult;
      else if (bars.maeLong[i] >= sl) pips = -sl * pipMult;
      else pips = (bars.mfeLong[i] - bars.maeLong[i] * 0.5) * pipMult;
    } else {
      if (bars.mfeShort[i] >= tp) pips = tp * pipMult;
      else if (bars.maeShort[i] >= sl) pips = -sl * pipMult;
      else pips = (bars.mfeShort[i] - bars.maeShort[i] * 0.5) * pipMult;
    }

    trades++;
    if (pips > 0) { wins++; grossProfit += pips; } else { grossLoss += Math.abs(pips); }

    equity += pips * 0.01;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;

    if (i % 5 === 0) curve.push(equity);
  }
  curve.push(equity);

  const totalReturn = ((equity - START_EQ) / START_EQ) * 100;

  return {
    trades, wins,
    winRate: trades > 0 ? wins / trades : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0),
    totalPips: grossProfit - grossLoss,
    maxDrawdown: maxDD, grossProfit, grossLoss,
    totalReturn,
    equityCurve: curve, dailyReturns,
  };
}

// ── GA Operators ──────────────────────────────────────────────────────────

const RSI_PERIODS = [7, 14, 21];
const MACD_FASTS = [8, 12, 16];
const MACD_SLOWS = [21, 26, 34];
const MACD_SIGNALS = [5, 9, 12];
const BB_PERIODS = [14, 20, 30];
const BB_STDDEVS = [1.5, 2.0, 2.5, 3.0];
const EMA_FASTS = [5, 8, 13, 21];
const EMA_SLOWS = [34, 50, 100, 200];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randRange(min: number, max: number): number { return min + Math.random() * (max - min); }

// Archetype templates — force the GA to explore ALL indicator families
const ARCHETYPES: Partial<StrategyDNA>[] = [
  // Pure Bollinger strategies
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0 },  // BB squeeze breakout
  { rsiMode: 0, macdMode: 0, bbMode: 2, emaMode: 0 },  // BB mean reversion
  { rsiMode: 0, macdMode: 0, bbMode: 3, emaMode: 0 },  // BB band walk
  // Pure EMA strategies
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 1 },  // EMA crossover
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 2 },  // Price above dual EMA
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 3 },  // EMA slope
  // BB + EMA hybrids
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 1 },  // BB breakout + EMA trend
  { rsiMode: 0, macdMode: 0, bbMode: 2, emaMode: 3 },  // BB revert + EMA slope
  // Volume-driven
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0, volMode: 3 },  // BB squeeze + vol expansion
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 1, volMode: 1 },  // EMA cross + high vol
  // Session-specific
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0, sessionFilter: 1 },  // BB London
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 1, sessionFilter: 2 },  // EMA NY
  // Triple-indicator combos (NO pure RSI+MACD)
  { rsiMode: 1, macdMode: 0, bbMode: 1, emaMode: 1 },  // RSI + BB + EMA
  { rsiMode: 0, macdMode: 1, bbMode: 2, emaMode: 0 },  // MACD + BB revert
  { rsiMode: 1, macdMode: 0, bbMode: 0, emaMode: 2, volMode: 3 },  // RSI + EMA + vol
  // Full kitchen sink
  { rsiMode: 1, macdMode: 1, bbMode: 1, emaMode: 1 },  // All 4 indicators
  { rsiMode: 2, macdMode: 3, bbMode: 2, emaMode: 3 },  // All 4 — alt modes
  // Day-of-week anomalies
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0, dayFilter: 1 },  // BB Tues
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 1, dayFilter: 2 },  // EMA Wed
  // Pure Hurst
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0, hurstMin: 0.55, hurstMax: 1.0 },  // BB + trending regime
  { rsiMode: 0, macdMode: 0, bbMode: 2, emaMode: 0, hurstMin: 0.0, hurstMax: 0.45 },  // BB revert + mean-rev regime
];

function randomDNA(archetype?: Partial<StrategyDNA>): StrategyDNA {
  const base: StrategyDNA = {
    rsiPeriod: pick(RSI_PERIODS), rsiLow: 20 + Math.random() * 25, rsiHigh: 55 + Math.random() * 30,
    rsiMode: Math.floor(Math.random() * 4),
    macdFast: pick(MACD_FASTS), macdSlow: pick(MACD_SLOWS), macdSignal: pick(MACD_SIGNALS),
    macdMode: Math.floor(Math.random() * 4),
    bbPeriod: pick(BB_PERIODS), bbStdDev: pick(BB_STDDEVS),
    bbMode: Math.floor(Math.random() * 4),
    emaFast: pick(EMA_FASTS), emaSlow: pick(EMA_SLOWS),
    emaMode: Math.floor(Math.random() * 4),
    volMode: Math.floor(Math.random() * 4),
    sessionFilter: Math.floor(Math.random() * 5) - 1,
    dayFilter: Math.floor(Math.random() * 6) - 1,
    direction: Math.floor(Math.random() * 3),
    slMultiplier: randRange(0.5, 3.5), tpMultiplier: randRange(0.5, 6.0),
    hurstMin: Math.random() * 0.5, hurstMax: 0.5 + Math.random() * 0.5,
  };
  // Override with archetype constraints
  if (archetype) Object.assign(base, archetype);
  return base;
}

function crossover(a: StrategyDNA, b: StrategyDNA): StrategyDNA {
  const r = () => Math.random() > 0.5;
  return {
    rsiPeriod: r() ? a.rsiPeriod : b.rsiPeriod, rsiLow: r() ? a.rsiLow : b.rsiLow, rsiHigh: r() ? a.rsiHigh : b.rsiHigh,
    rsiMode: r() ? a.rsiMode : b.rsiMode,
    macdFast: r() ? a.macdFast : b.macdFast, macdSlow: r() ? a.macdSlow : b.macdSlow, macdSignal: r() ? a.macdSignal : b.macdSignal,
    macdMode: r() ? a.macdMode : b.macdMode,
    bbPeriod: r() ? a.bbPeriod : b.bbPeriod, bbStdDev: r() ? a.bbStdDev : b.bbStdDev,
    bbMode: r() ? a.bbMode : b.bbMode,
    emaFast: r() ? a.emaFast : b.emaFast, emaSlow: r() ? a.emaSlow : b.emaSlow,
    emaMode: r() ? a.emaMode : b.emaMode,
    volMode: r() ? a.volMode : b.volMode,
    sessionFilter: r() ? a.sessionFilter : b.sessionFilter,
    dayFilter: r() ? a.dayFilter : b.dayFilter,
    direction: r() ? a.direction : b.direction,
    slMultiplier: r() ? a.slMultiplier : b.slMultiplier,
    tpMultiplier: r() ? a.tpMultiplier : b.tpMultiplier,
    hurstMin: r() ? a.hurstMin : b.hurstMin,
    hurstMax: r() ? a.hurstMax : b.hurstMax,
  };
}

function mutate(dna: StrategyDNA, rate = 0.15): StrategyDNA {
  const d = { ...dna };
  if (Math.random() < rate) d.rsiPeriod = pick(RSI_PERIODS);
  if (Math.random() < rate) d.rsiLow = Math.max(10, Math.min(50, d.rsiLow + (Math.random() - 0.5) * 10));
  if (Math.random() < rate) d.rsiHigh = Math.max(50, Math.min(95, d.rsiHigh + (Math.random() - 0.5) * 10));
  if (Math.random() < rate) d.rsiMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.macdFast = pick(MACD_FASTS);
  if (Math.random() < rate) d.macdSlow = pick(MACD_SLOWS);
  if (Math.random() < rate) d.macdSignal = pick(MACD_SIGNALS);
  if (Math.random() < rate) d.macdMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.bbPeriod = pick(BB_PERIODS);
  if (Math.random() < rate) d.bbStdDev = pick(BB_STDDEVS);
  if (Math.random() < rate) d.bbMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.emaFast = pick(EMA_FASTS);
  if (Math.random() < rate) d.emaSlow = pick(EMA_SLOWS);
  if (Math.random() < rate) d.emaMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.volMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.sessionFilter = Math.floor(Math.random() * 5) - 1;
  if (Math.random() < rate) d.dayFilter = Math.floor(Math.random() * 6) - 1;
  if (Math.random() < rate) d.direction = Math.floor(Math.random() * 3);
  if (Math.random() < rate) d.slMultiplier = Math.max(0.3, Math.min(3.5, d.slMultiplier + (Math.random() - 0.5) * 0.6));
  if (Math.random() < rate) d.tpMultiplier = Math.max(0.5, Math.min(6.0, d.tpMultiplier + (Math.random() - 0.5) * 1.0));
  if (Math.random() < rate) d.hurstMin = Math.max(0, Math.min(0.9, d.hurstMin + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.hurstMax = Math.max(d.hurstMin + 0.1, Math.min(1.0, d.hurstMax + (Math.random() - 0.5) * 0.15));
  return d;
}

function tournamentSelect(pop: { dna: StrategyDNA; fitness: number }[], k = 3): { dna: StrategyDNA; fitness: number } {
  let best: { dna: StrategyDNA; fitness: number } | null = null;
  for (let i = 0; i < k; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best!;
}

// ── Strategy naming & description ─────────────────────────────────────────

let nameCounter = 0;

function generateStrategyName(dna: StrategyDNA): string {
  nameCounter++;
  
  const indicators: string[] = [];
  if (dna.rsiMode > 0) indicators.push('RSI');
  if (dna.macdMode > 0) indicators.push('MACD');
  if (dna.bbMode > 0) indicators.push('BB');
  if (dna.emaMode > 0) indicators.push('EMA');
  
  const filters: string[] = [];
  if (dna.volMode > 0) filters.push(['HighVol', 'LowVol', 'VolExpansion'][dna.volMode - 1] || 'Vol');
  const sessions = ['Asia', 'London', 'NewYork', 'NYClose'];
  if (dna.sessionFilter >= 0) filters.push(sessions[dna.sessionFilter]);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (dna.dayFilter >= 0) filters.push(days[dna.dayFilter]);

  // Single-indicator names with mode specificity
  const singleNames: Record<string, Record<number, string>> = {
    BB: { 1: 'The Volatility Squeeze Breakout', 2: 'The Mean Reversion Trap', 3: 'The Band Walker' },
    EMA: { 1: 'The Golden Cross Hunter', 2: 'The Trend Confirmation Engine', 3: 'The Slope Momentum Rider' },
    RSI: { 1: 'The Oversold Reversal Sniper', 2: 'The Overbought Fade Machine', 3: 'The Midline Momentum Pivot' },
    MACD: { 1: 'The Signal Line Snapper', 2: 'The Zero-Line Breakout', 3: 'The Histogram Divergence Play' },
  };

  // Multi-indicator combo names — exhaustive
  const comboNames: Record<string, string[]> = {
    'BB+EMA': ['The Structural Trend-Band Convergence', 'The Bollinger-EMA Fusion Engine', 'The Trend Volatility Hybrid'],
    'BB+RSI': ['The Volatility-Momentum Reversal', 'The Band Squeeze Oscillator', 'The RSI-Bollinger Fade Machine'],
    'BB+MACD': ['The Volatility-Histogram Surge', 'The Bollinger MACD Breakout', 'The Band Momentum Convergence'],
    'EMA+RSI': ['The Trend-Momentum Sniper', 'The EMA-RSI Confirmation Engine', 'The Moving Average Oscillator'],
    'EMA+MACD': ['The Momentum Trend Rider', 'The EMA-MACD Signal Fusion', 'The Trend Histogram Engine'],
    'RSI+MACD': ['The Dual Oscillator Convergence', 'The Momentum Crossfire', 'The Oscillator Sync Engine'],
    'BB+EMA+RSI': ['The Triple-Layer Volatility Filter', 'The Full-Spectrum Reversal Engine'],
    'BB+EMA+MACD': ['The Structural Momentum Machine', 'The Trend-Band-Signal Convergence'],
    'BB+RSI+MACD': ['The Oscillator Volatility Hybrid', 'The Band-Momentum Trifecta'],
    'EMA+RSI+MACD': ['The Triple Oscillator Trend Engine', 'The Momentum Consensus Machine'],
    'BB+EMA+RSI+MACD': ['The Full Kitchen Sink Convergence', 'The Quad-Signal Alpha Engine', 'The Maximum Confluence Machine'],
  };

  if (indicators.length === 0) {
    if (filters.length > 0) return `The ${filters.join(' ')} Anomaly Filter #${nameCounter}`;
    return `The Pure Regime Filter #${nameCounter}`;
  }

  let baseName: string;
  if (indicators.length === 1) {
    const ind = indicators[0];
    const mode = dna[`${ind.toLowerCase()}Mode` as keyof StrategyDNA] as number || 1;
    baseName = singleNames[ind]?.[mode] || `The ${ind} Strategy`;
  } else {
    const key = indicators.sort().join('+');
    const options = comboNames[key] || [`The ${indicators.join('-')} Hybrid`];
    baseName = options[nameCounter % options.length];
  }

  // Append filter suffix for uniqueness
  if (filters.length > 0) baseName += ` (${filters.join(' ')})`;
  return baseName;
}

function generateEdgeDescription(dna: StrategyDNA): string {
  const parts: string[] = [];
  if (dna.rsiMode === 1) parts.push(`RSI(${dna.rsiPeriod}) oversold reversal below ${dna.rsiLow.toFixed(0)}`);
  if (dna.rsiMode === 2) parts.push(`RSI(${dna.rsiPeriod}) overbought fade above ${dna.rsiHigh.toFixed(0)}`);
  if (dna.rsiMode === 3) parts.push(`RSI(${dna.rsiPeriod}) midline cross at 50`);
  if (dna.macdMode === 1) parts.push(`MACD(${dna.macdFast},${dna.macdSlow}) signal crossover`);
  if (dna.macdMode === 2) parts.push(`MACD(${dna.macdFast},${dna.macdSlow}) zero-line cross`);
  if (dna.macdMode === 3) parts.push(`MACD histogram divergence`);
  if (dna.bbMode === 1) parts.push(`Bollinger(${dna.bbPeriod},${dna.bbStdDev}) squeeze breakout`);
  if (dna.bbMode === 2) parts.push(`Bollinger(${dna.bbPeriod},${dna.bbStdDev}) mean reversion`);
  if (dna.bbMode === 3) parts.push(`Bollinger band walk`);
  if (dna.emaMode === 1) parts.push(`EMA(${dna.emaFast}/${dna.emaSlow}) crossover`);
  if (dna.emaMode === 2) parts.push(`Price above EMA(${dna.emaFast}) & EMA(${dna.emaSlow})`);
  if (dna.emaMode === 3) parts.push(`EMA(${dna.emaFast}) slope filter`);
  return parts.join(' + ') || 'Pure time/volatility filter';
}

function generateEntryRules(dna: StrategyDNA): string[] {
  const rules: string[] = [];
  if (dna.rsiMode === 1) rules.push(`RSI(${dna.rsiPeriod}) < ${dna.rsiLow.toFixed(0)} for LONG / > ${dna.rsiHigh.toFixed(0)} for SHORT`);
  if (dna.rsiMode === 2) rules.push(`RSI(${dna.rsiPeriod}) > ${dna.rsiHigh.toFixed(0)} for SHORT / < ${dna.rsiLow.toFixed(0)} for LONG`);
  if (dna.rsiMode === 3) rules.push(`RSI(${dna.rsiPeriod}) crosses above/below 50`);
  if (dna.macdMode === 1) rules.push(`MACD(${dna.macdFast},${dna.macdSlow},${dna.macdSignal}) line crosses signal`);
  if (dna.macdMode === 2) rules.push(`MACD(${dna.macdFast},${dna.macdSlow}) crosses zero line`);
  if (dna.macdMode === 3) rules.push(`MACD histogram turns positive/negative`);
  if (dna.bbMode === 1) rules.push(`Price breaks above/below Bollinger(${dna.bbPeriod}, ${dna.bbStdDev}σ)`);
  if (dna.bbMode === 2) rules.push(`Price touches lower/upper Bollinger Band — fade the move`);
  if (dna.bbMode === 3) rules.push(`Price walks along upper/lower Bollinger Band`);
  if (dna.emaMode === 1) rules.push(`EMA(${dna.emaFast}) crosses EMA(${dna.emaSlow})`);
  if (dna.emaMode === 2) rules.push(`Price > EMA(${dna.emaFast}) AND EMA(${dna.emaSlow}) for LONG`);
  if (dna.emaMode === 3) rules.push(`EMA(${dna.emaFast}) slope rising/falling`);
  if (dna.volMode === 1) rules.push('High volatility regime only');
  if (dna.volMode === 2) rules.push('Low volatility regime only');
  if (dna.volMode === 3) rules.push('Volume expansion > 1.5x average');
  const sessions = ['Asia (00-07 UTC)', 'London (07-12 UTC)', 'New York (12-17 UTC)', 'NY Close (17-24 UTC)'];
  if (dna.sessionFilter >= 0) rules.push(`Session: ${sessions[dna.sessionFilter]}`);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (dna.dayFilter >= 0) rules.push(`Day: ${days[dna.dayFilter]} only`);
  return rules;
}

function generateExitRules(dna: StrategyDNA): string[] {
  return [
    `Stop Loss: ${dna.slMultiplier.toFixed(2)} × ATR(14)`,
    `Take Profit: ${dna.tpMultiplier.toFixed(2)} × ATR(14)`,
    `Risk:Reward = 1:${(dna.tpMultiplier / dna.slMultiplier).toFixed(2)}`,
  ];
}

// ── Supabase ──────────────────────────────────────────────────────────────
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const JOB_KEY = "ga_job_state";
const DATA_KEY_PREFIX = "ga_bars_";

// ── Phase Handlers ────────────────────────────────────────────────────────

async function handlePhase1(body: Record<string, unknown>) {
  const environment = (body.environment as string) || "practice";
  const pair = (body.pair as string) || "EUR_USD";
  const candleCount = Math.min(Number(body.candles) || 5000, 5000);
  const populationSize = Math.min(Number(body.populationSize) || 50, 100);
  const totalGenerations = Math.min(Number(body.generations) || 50, 200);
  const maxCorrelation = Number(body.maxCorrelation) || 0.2;
  const mutationRate = Number(body.mutationRate) || 0.15;
  const gensPerCall = Math.min(Number(body.gensPerCall) || 5, 10);

  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  if (!apiToken) throw new Error("OANDA API token not configured");

  console.log(`[GA-P1] Fetching ${candleCount} M30 candles for ${pair} (${environment})`);
  const candles = await fetchCandles(pair, candleCount, environment, apiToken);
  if (candles.length < 250) throw new Error(`Insufficient candle data: ${candles.length}`);

  console.log(`[GA-P1] Got ${candles.length} candles, building indicator library...`);
  const bars = buildFeatureArrays(pair, candles);
  console.log(`[GA-P1] Built ${bars.count} feature bars with full indicator suite`);

  // Baseline: simple EMA(8)/EMA(34) crossover for correlation checking
  const baseDailyReturns: number[] = [];
  let baseEq = 10000, dayCounter = 0, dayStart = baseEq;
  for (let i = 1; i < bars.count; i++) {
    const isLong = bars.ema8[i] > bars.ema34[i];
    const baseReturn = isLong ? bars.mfeLong[i] * 0.5 : bars.mfeShort[i] * 0.5;
    baseEq += baseReturn * 10000 * 0.001;
    dayCounter++;
    if (dayCounter >= 48) { baseDailyReturns.push((baseEq - dayStart) / (dayStart || 1)); dayStart = baseEq; dayCounter = 0; }
  }

  // Initialize population — seed with forced archetypes to guarantee diversity
  console.log(`[GA-P1] Initializing population of ${populationSize} with ${ARCHETYPES.length} archetype seeds`);
  const population: { dna: StrategyDNA; fitness: number }[] = [];
  // First: seed one individual per archetype
  for (let i = 0; i < Math.min(ARCHETYPES.length, populationSize); i++) {
    const dna = randomDNA(ARCHETYPES[i]);
    const sim = simulateStrategy(bars, dna);
     const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, dna);
    population.push({ dna, fitness });
  }
  // Fill remaining with random (but penalize pure RSI+MACD in fitness)
  while (population.length < populationSize) {
    const dna = randomDNA();
    const sim = simulateStrategy(bars, dna);
     const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, dna);
    population.push({ dna, fitness });
  }
  population.sort((a, b) => b.fitness - a.fitness);

  // Persist
  const sb = getSupabaseAdmin();
  const barsKey = `${DATA_KEY_PREFIX}${pair}`;
  await sb.from("sovereign_memory").delete().eq("memory_key", barsKey).eq("memory_type", "ga_dataset");
  const { error: barsErr } = await sb.from("sovereign_memory").insert({
    memory_key: barsKey, memory_type: "ga_dataset",
    payload: bars, created_by: "alpha-discovery-engine", version: 1,
  });
  if (barsErr) throw new Error(`Failed to save feature bars: ${barsErr.message}`);

  const jobState = {
    status: "evolving", pair, environment, currentGen: 0,
    totalGenerations, populationSize, maxCorrelation, mutationRate, gensPerCall,
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    baseDailyReturns,
    evolutionLog: [{ gen: 0, bestFitness: Math.round(population[0].fitness * 1000) / 1000, avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000, bestTrades: 0 }],
    totalSimulations: populationSize, barCount: bars.count, startedAt: new Date().toISOString(),
    dateRange: { start: candles[0]?.time || '', end: candles[candles.length - 1]?.time || '' },
  };

  await sb.from("sovereign_memory").delete().eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");
  const { error: upsertErr } = await sb.from("sovereign_memory").insert({
    memory_key: JOB_KEY, memory_type: "ga_job",
    payload: jobState, created_by: "alpha-discovery-engine", version: 1,
  });
  if (upsertErr) throw new Error(`Failed to save GA job state: ${upsertErr.message}`);

  console.log(`[GA-P1] Phase 1 complete. ${bars.count} bars, pop=${populationSize}, ready for evolution.`);
  return {
    phase: 1, status: "evolving", pair, barCount: bars.count,
    populationSize, totalGenerations, currentGen: 0,
    bestFitness: population[0].fitness,
    dateRange: { start: candles[0]?.time || '', end: candles[candles.length - 1]?.time || '' },
    message: `Indicator library built. ${bars.count} bars with RSI, MACD, BB, EMA, Volume. Ready to evolve.`,
  };
}

function getEdgeArchetype(dna: StrategyDNA): string {
  const parts: string[] = [];
  if (dna.rsiMode > 0) parts.push('RSI');
  if (dna.macdMode > 0) parts.push('MACD');
  if (dna.bbMode > 0) parts.push('BB');
  if (dna.emaMode > 0) parts.push('EMA');
  if (dna.volMode > 0) parts.push('VOL');
  if (dna.sessionFilter >= 0) parts.push('SES');
  if (dna.dayFilter >= 0) parts.push('DAY');
  return parts.sort().join('+') || 'PURE_FILTER';
}

function computeFitness(sim: SimResult, baseDailyReturns: number[], maxCorrelation: number, dna?: StrategyDNA): number {
  let fitness = 0;
  if (sim.trades >= 20 && sim.maxDrawdown > 0.001) {
    fitness = (sim.profitFactor * sim.winRate * Math.sqrt(sim.trades)) / sim.maxDrawdown;
  } else if (sim.trades >= 20) {
    fitness = sim.profitFactor * sim.winRate * Math.sqrt(sim.trades) * 10;
  }
  // Minimum trade count penalty
  if (sim.trades < 50) fitness *= 0.1;
  else if (sim.trades < 100) fitness *= 0.5;
  // Bonus for high trade count
  if (sim.trades > 300) fitness *= 1.2;

  // Total return bonus
  if (sim.totalReturn > 50) fitness *= 1.3;
  if (sim.totalReturn > 100) fitness *= 1.5;

  // Correlation penalty
  const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
  if (corr > maxCorrelation) fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);

  // ── DIVERSITY INCENTIVE ──
  // Penalize pure RSI+MACD combos (the "rookie" convergence trap)
  if (dna) {
    const hasRSI = dna.rsiMode > 0;
    const hasMACD = dna.macdMode > 0;
    const hasBB = dna.bbMode > 0;
    const hasEMA = dna.emaMode > 0;
    const hasVol = dna.volMode > 0;
    const hasSes = dna.sessionFilter >= 0;
    const hasDay = dna.dayFilter >= 0;

    // Pure RSI+MACD with nothing else = severe penalty
    if (hasRSI && hasMACD && !hasBB && !hasEMA && !hasVol && !hasSes && !hasDay) {
      fitness *= 0.3; // 70% penalty for "rookie" combo
    }
    // RSI-only or MACD-only without structural indicators = moderate penalty
    if ((hasRSI || hasMACD) && !hasBB && !hasEMA) {
      fitness *= 0.6;
    }

    // Bonus for using structural indicators (BB, EMA)
    if (hasBB) fitness *= 1.3;
    if (hasEMA) fitness *= 1.2;
    // Bonus for filters (volume, session, day)
    if (hasVol) fitness *= 1.15;
    if (hasSes) fitness *= 1.1;
    if (hasDay) fitness *= 1.1;

    // Bonus for multi-indicator combos (3+ active)
    const activeCount = [hasRSI, hasMACD, hasBB, hasEMA].filter(Boolean).length;
    if (activeCount >= 3) fitness *= 1.3;
    if (activeCount >= 4) fitness *= 1.2;
  }

  return fitness;
}

async function handlePhase2() {
  const sb = getSupabaseAdmin();
  let jobRow: { payload: unknown } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
    if (data) { jobRow = data; break; }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  if (!jobRow) throw new Error("No active GA job. Run Phase 1 first.");
  const job = jobRow.payload as Record<string, unknown>;
  if (job.status !== "evolving") throw new Error(`Job status is '${job.status}', not 'evolving'`);

  const pair = job.pair as string;
  const maxCorrelation = job.maxCorrelation as number;
  const mutationRate = job.mutationRate as number;
  const gensPerCall = job.gensPerCall as number;
  const totalGenerations = job.totalGenerations as number;
  const currentGen = job.currentGen as number;
  const baseDailyReturns = job.baseDailyReturns as number[];
  let population = job.population as { dna: StrategyDNA; fitness: number }[];
  let evolutionLog = job.evolutionLog as { gen: number; bestFitness: number; avgFitness: number; bestTrades: number }[];
  let totalSimulations = job.totalSimulations as number;

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found. Run Phase 1 first.");
  const bars = barsRow.payload as BarArrays;

  const gensToRun = Math.min(gensPerCall, totalGenerations - currentGen);
  console.log(`[GA-P2] Gen ${currentGen + 1}→${currentGen + gensToRun} of ${totalGenerations}`);

  for (let g = 0; g < gensToRun; g++) {
    const gen = currentGen + g + 1;
    const newPop: { dna: StrategyDNA; fitness: number }[] = [];
    const eliteCount = Math.max(2, Math.floor(population.length * 0.1));
    for (let i = 0; i < eliteCount; i++) newPop.push(population[i]);

    while (newPop.length < population.length) {
      const p1 = tournamentSelect(population);
      const p2 = tournamentSelect(population);
      let child = crossover(p1.dna, p2.dna);
      child = mutate(child, mutationRate);
      const sim = simulateStrategy(bars, child);
      const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, child);
      newPop.push({ dna: child, fitness });
      totalSimulations++;
    }

    population = newPop.sort((a, b) => b.fitness - a.fitness);
    const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
    const bestSim = simulateStrategy(bars, population[0].dna);
    evolutionLog.push({
      gen, bestFitness: Math.round(population[0].fitness * 1000) / 1000,
      avgFitness: Math.round(avgFitness * 1000) / 1000, bestTrades: bestSim.trades,
    });
  }

  const newCurrentGen = currentGen + gensToRun;
  const isComplete = newCurrentGen >= totalGenerations;

  const updatedJob = {
    ...job, currentGen: newCurrentGen, status: isComplete ? "extracting" : "evolving",
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    evolutionLog, totalSimulations,
  };

  await sb.from("sovereign_memory").update({ payload: updatedJob, version: newCurrentGen })
    .eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");

  return {
    phase: 2, status: isComplete ? "extracting" : "evolving",
    currentGen: newCurrentGen, totalGenerations,
    bestFitness: Math.round(population[0].fitness * 1000) / 1000,
    avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000,
    totalSimulations,
    evolutionLog: evolutionLog.slice(-10),
    message: isComplete ? `Evolution complete! Ready for extraction.` : `Gen ${newCurrentGen}/${totalGenerations} complete.`,
  };
}

async function handlePhase3() {
  const sb = getSupabaseAdmin();
  const { data: jobRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
  if (!jobRow) throw new Error("No GA job found.");
  const job = jobRow.payload as Record<string, unknown>;
  const pair = job.pair as string;
  const maxCorrelation = job.maxCorrelation as number;
  const baseDailyReturns = job.baseDailyReturns as number[];
  const population = job.population as { dna: StrategyDNA; fitness: number }[];
  const evolutionLog = job.evolutionLog as { gen: number; bestFitness: number; avgFitness: number; bestTrades: number }[];
  const totalSimulations = job.totalSimulations as number;

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found.");
  const bars = barsRow.payload as BarArrays;

  console.log(`[GA-P3] Extracting top strategies from ${population.length} individuals`);

  // Reset name counter for clean naming
  nameCounter = 0;

  // Deduplicate by full indicator signature (mode + key params)
  const seen = new Set<string>();
  const profiles: ScoredIndividual[] = [];

  for (const p of population.slice(0, 60)) {
    // More granular dedup key — includes indicator modes AND key parameters
    const key = `${p.dna.rsiMode}-${p.dna.rsiPeriod}-${p.dna.macdMode}-${p.dna.macdFast}-${p.dna.bbMode}-${p.dna.bbPeriod}-${p.dna.emaMode}-${p.dna.emaFast}-${p.dna.emaSlow}-${p.dna.direction}-${p.dna.volMode}-${p.dna.sessionFilter}-${p.dna.dayFilter}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sim = simulateStrategy(bars, p.dna);
    if (sim.trades < 30) continue;

    const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));

    const maxPts = 200;
    const stride = Math.max(1, Math.ceil(sim.equityCurve.length / maxPts));
    const dsCurve = sim.equityCurve.filter((_, i) => i % stride === 0);

    profiles.push({
      dna: p.dna, fitness: p.fitness, sim: { ...sim, equityCurve: dsCurve },
      correlation: corr,
      strategyName: generateStrategyName(p.dna),
      edgeDescription: generateEdgeDescription(p.dna),
      entryRules: generateEntryRules(p.dna),
      exitRules: generateExitRules(p.dna),
    });
  }

  // Sort by total return
  profiles.sort((a, b) => b.sim.totalReturn - a.sim.totalReturn);

  // ── DIVERSITY-ENFORCED EXTRACTION ──
  // Max 2 strategies per edge archetype to prevent RSI+MACD flooding
  const MAX_PER_ARCHETYPE = 2;
  const archetypeCounts: Record<string, number> = {};

  function canAddArchetype(dna: StrategyDNA): boolean {
    const arch = getEdgeArchetype(dna);
    const count = archetypeCounts[arch] || 0;
    if (count >= MAX_PER_ARCHETYPE) return false;
    archetypeCounts[arch] = count + 1;
    return true;
  }

  // Extract top 10 diverse + uncorrelated
  const diverseProfiles: ScoredIndividual[] = [];
  for (const p of profiles) {
    if (diverseProfiles.length >= 10) break;
    if (p.correlation > 0.5) continue;
    if (!canAddArchetype(p.dna)) continue;
    diverseProfiles.push(p);
  }

  // If we didn't get 10, relax correlation but keep diversity
  if (diverseProfiles.length < 10) {
    for (const p of profiles) {
      if (diverseProfiles.length >= 10) break;
      if (diverseProfiles.includes(p)) continue;
      if (!canAddArchetype(p.dna)) continue;
      diverseProfiles.push(p);
    }
  }

  const finalUncorrelated = diverseProfiles;

  // All profiles (for leaderboard) — also diversity-limited
  const allArchCounts: Record<string, number> = {};
  const allProfiles = profiles.filter(p => {
    const arch = getEdgeArchetype(p.dna);
    const count = allArchCounts[arch] || 0;
    if (count >= 3) return false; // Max 3 in full leaderboard
    allArchCounts[arch] = count + 1;
    return true;
  }).slice(0, 20);

  const fmt = (p: ScoredIndividual) => ({
    dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000,
    winRate: Math.round(p.sim.winRate * 10000) / 10000,
    profitFactor: Math.round(p.sim.profitFactor * 100) / 100,
    trades: p.sim.trades,
    totalPips: Math.round(p.sim.totalPips * 10) / 10,
    totalReturn: Math.round(p.sim.totalReturn * 100) / 100,
    maxDrawdown: Math.round(p.sim.maxDrawdown * 10000) / 10000,
    grossProfit: Math.round(p.sim.grossProfit * 10) / 10,
    grossLoss: Math.round(p.sim.grossLoss * 10) / 10,
    correlation: Math.round(p.correlation * 1000) / 1000,
    equityCurve: p.sim.equityCurve,
    strategyName: p.strategyName,
    edgeDescription: p.edgeDescription,
    entryRules: p.entryRules,
    exitRules: p.exitRules,
    edgeArchetype: getEdgeArchetype(p.dna),
  });

  await sb.from("sovereign_memory").update({
    payload: { ...(job as object), status: "complete", completedAt: new Date().toISOString() },
  }).eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");

  console.log(`[GA-P3] Extraction complete. ${finalUncorrelated.length} strategies extracted.`);

  return {
    phase: 3, status: "complete",
    timestamp: new Date().toISOString(), environment: job.environment,
    dataPoints: job.barCount, totalSimulations,
    gaStats: {
      populationSize: (job as Record<string, unknown>).populationSize,
      generations: (job as Record<string, unknown>).totalGenerations,
      mutationRate: (job as Record<string, unknown>).mutationRate,
      maxCorrelation, totalSimulations,
      finalBestFitness: population[0]?.fitness || 0,
    },
    evolutionLog: evolutionLog.filter((_, i) => i % Math.max(1, Math.floor(evolutionLog.length / 50)) === 0),
    uncorrelatedProfiles: finalUncorrelated.map(fmt),
    allProfiles: allProfiles.map(fmt),
    correlationFallback: finalUncorrelated.length === 0,
    dateRange: (job as Record<string, unknown>).dateRange || { start: '', end: '' },
    config: { pair, populationSize: (job as Record<string, unknown>).populationSize, generations: (job as Record<string, unknown>).totalGenerations, maxCorrelation, candleCount: (job as Record<string, unknown>).barCount, mutationRate: (job as Record<string, unknown>).mutationRate },
  };
}

async function handleStatus() {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
  if (!data) return { status: "idle", message: "No active GA job." };
  const job = data.payload as Record<string, unknown>;
  return {
    status: job.status, currentGen: job.currentGen, totalGenerations: job.totalGenerations,
    totalSimulations: job.totalSimulations,
    bestFitness: (job.population as { fitness: number }[])?.[0]?.fitness || 0,
    evolutionLog: ((job.evolutionLog as unknown[]) || []).slice(-5),
    pair: job.pair, barCount: job.barCount,
    dateRange: job.dateRange || { start: '', end: '' },
  };
}

// ── Main Router ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body as Record<string, unknown>).action as string || "status";
    let result: unknown;
    switch (action) {
      case "init": result = await handlePhase1(body as Record<string, unknown>); break;
      case "evolve": result = await handlePhase2(); break;
      case "extract": result = await handlePhase3(); break;
      case "status": result = await handleStatus(); break;
      default: throw new Error(`Unknown action: ${action}`);
    }
    return new Response(JSON.stringify({ success: true, ...result as object }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GA] Error:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
