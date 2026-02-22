// Alpha Discovery Engine v6.0 — Advanced Multi-Indicator Alpha Mining
// Full "Kitchen Sink" indicator library: RSI, MACD, BB, EMAs, ADX, Stochastic, CCI,
// Donchian Channels, Price Action (Engulfing/Pin Bar/Inside Bar), Volume, Day-of-Week
// Advanced exits: Trailing stops, partial TP, time-based exits
//
// Phase 1: Fetch candles, compute 30+ indicators, store in sovereign_memory
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

// Expanded DNA — 34 genes
interface StrategyDNA {
  // RSI
  rsiPeriod: number; rsiLow: number; rsiHigh: number; rsiMode: number;
  // MACD
  macdFast: number; macdSlow: number; macdSignal: number; macdMode: number;
  // Bollinger Bands
  bbPeriod: number; bbStdDev: number; bbMode: number;
  // EMA
  emaFast: number; emaSlow: number; emaMode: number;
  // ADX (trend strength)
  adxPeriod: number; adxMode: number; // 0=off, 1=trend-only(>25), 2=range-only(<20), 3=ADX-rising
  // Stochastic
  stochK: number; stochD: number; stochMode: number; // 0=off, 1=oversold-buy, 2=overbought-sell, 3=K/D-cross
  // CCI
  cciPeriod: number; cciMode: number; // 0=off, 1=breakout(>100), 2=reversal(<-100), 3=zero-cross
  // Donchian Channel
  donchianPeriod: number; donchianMode: number; // 0=off, 1=high-breakout, 2=midline, 3=fade-extremes
  // Price Action
  paMode: number; // 0=off, 1=inside-bar-breakout, 2=engulfing, 3=pin-bar
  // Filters
  volMode: number; sessionFilter: number; dayFilter: number; direction: number;
  // Risk (original)
  slMultiplier: number; tpMultiplier: number;
  // Hurst
  hurstMin: number; hurstMax: number;
  // Advanced exits
  trailingATR: number;    // 0=off, 0.5-3.0 ATR trailing stop
  maxBarsInTrade: number; // 0=off, 4-48 bars max hold
  partialTP: number;      // 0=off, 1=50% at 1R then trail, 2=33% at each R
}

interface SimResult {
  trades: number; wins: number; winRate: number; profitFactor: number;
  totalPips: number; maxDrawdown: number; grossProfit: number; grossLoss: number;
  totalReturn: number; equityCurve: number[]; dailyReturns: number[];
  sharpe: number;
}

interface ScoredIndividual {
  dna: StrategyDNA; fitness: number; sim: SimResult;
  correlation: number; strategyName: string; edgeDescription: string;
  entryRules: string[]; exitRules: string[];
}

// Extended feature arrays
interface BarArrays {
  close: number[]; high: number[]; low: number[]; open: number[];
  atr: number[];
  rsi7: number[]; rsi14: number[]; rsi21: number[];
  macdLine_12_26: number[]; macdSignal_12_26_9: number[]; macdHist_12_26_9: number[];
  macdLine_8_21: number[]; macdSignal_8_21_5: number[]; macdHist_8_21_5: number[];
  bbUpper: number[]; bbMiddle: number[]; bbLower: number[]; bbWidth: number[];
  ema5: number[]; ema8: number[]; ema13: number[]; ema21: number[];
  ema34: number[]; ema50: number[]; ema100: number[]; ema200: number[];
  // NEW indicators
  adx14: number[]; adx20: number[]; plusDI: number[]; minusDI: number[];
  stochK5: number[]; stochD5: number[]; stochK9: number[]; stochD9: number[]; stochK14: number[]; stochD14: number[];
  cci14: number[]; cci20: number[];
  donchianHigh10: number[]; donchianLow10: number[]; donchianMid10: number[];
  donchianHigh20: number[]; donchianLow20: number[]; donchianMid20: number[];
  donchianHigh55: number[]; donchianLow55: number[]; donchianMid55: number[];
  // Price action
  isInsideBar: number[]; isEngulfingBull: number[]; isEngulfingBear: number[];
  isPinBarBull: number[]; isPinBarBear: number[];
  // Original
  volRatio: number[]; session: number[]; dayOfWeek: number[];
  hurst: number[]; volBucket: number[]; isLongBias: number[];
  mfeLong: number[]; maeLong: number[]; mfeShort: number[]; maeShort: number[];
  // For advanced sim: bar-by-bar high/low for trailing
  barHigh: number[]; barLow: number[];
  isJPY: number[];
  count: number;
}

// ── Indicator Calculations ─────────────────────────────────────────────────

function computeEMA(values: number[], period: number): number[] {
  const ema = new Array(values.length).fill(0);
  if (values.length < period) return ema;
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

// ADX (Average Directional Index)
function computeADX(candles: Candle[], period: number): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = candles.length;
  const adx = new Array(n).fill(0);
  const plusDI = new Array(n).fill(0);
  const minusDI = new Array(n).fill(0);
  if (n < period * 2) return { adx, plusDI, minusDI };

  const smoothPlusDM = new Array(n).fill(0);
  const smoothMinusDM = new Array(n).fill(0);
  const smoothTR = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    const pDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const mDM = (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );

    if (i < period) {
      smoothPlusDM[period - 1] += pDM;
      smoothMinusDM[period - 1] += mDM;
      smoothTR[period - 1] += tr;
    } else if (i === period) {
      smoothPlusDM[i] = smoothPlusDM[i - 1] + pDM;
      smoothMinusDM[i] = smoothMinusDM[i - 1] + mDM;
      smoothTR[i] = smoothTR[i - 1] + tr;
    } else {
      smoothPlusDM[i] = smoothPlusDM[i - 1] - (smoothPlusDM[i - 1] / period) + pDM;
      smoothMinusDM[i] = smoothMinusDM[i - 1] - (smoothMinusDM[i - 1] / period) + mDM;
      smoothTR[i] = smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr;
    }

    if (smoothTR[i] > 0) {
      plusDI[i] = (smoothPlusDM[i] / smoothTR[i]) * 100;
      minusDI[i] = (smoothMinusDM[i] / smoothTR[i]) * 100;
    }
    const diSum = plusDI[i] + minusDI[i];
    const dx = diSum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100 : 0;

    if (i === period * 2 - 1) {
      let adxSum = 0;
      for (let j = period; j <= i; j++) {
        const s = plusDI[j] + minusDI[j];
        adxSum += s > 0 ? (Math.abs(plusDI[j] - minusDI[j]) / s) * 100 : 0;
      }
      adx[i] = adxSum / period;
    } else if (i >= period * 2) {
      adx[i] = (adx[i - 1] * (period - 1) + dx) / period;
    }
  }
  return { adx, plusDI, minusDI };
}

// Stochastic Oscillator
function computeStochastic(candles: Candle[], kPeriod: number, dPeriod: number): { k: number[]; d: number[] } {
  const n = candles.length;
  const kArr = new Array(n).fill(50);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    kArr[i] = (hh - ll) > 0 ? ((candles[i].close - ll) / (hh - ll)) * 100 : 50;
  }
  // %D = SMA of %K
  const dArr = new Array(n).fill(50);
  for (let i = kPeriod + dPeriod - 2; i < n; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) sum += kArr[j];
    dArr[i] = sum / dPeriod;
  }
  return { k: kArr, d: dArr };
}

// CCI (Commodity Channel Index)
function computeCCI(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const cci = new Array(n).fill(0);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += (candles[j].high + candles[j].low + candles[j].close) / 3;
    }
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const sma = sum / period;
    let madSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      madSum += Math.abs((candles[j].high + candles[j].low + candles[j].close) / 3 - sma);
    }
    const mad = madSum / period;
    cci[i] = mad > 0 ? (tp - sma) / (0.015 * mad) : 0;
  }
  return cci;
}

// Donchian Channels
function computeDonchian(candles: Candle[], period: number): { high: number[]; low: number[]; mid: number[] } {
  const n = candles.length;
  const dHigh = new Array(n).fill(0);
  const dLow = new Array(n).fill(0);
  const dMid = new Array(n).fill(0);
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    dHigh[i] = hh; dLow[i] = ll; dMid[i] = (hh + ll) / 2;
  }
  return { high: dHigh, low: dLow, mid: dMid };
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
  return new Date(time).getUTCDay();
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

  // Pre-compute all indicators
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

  // NEW: ADX
  const adx14Data = computeADX(candles, 14);
  const adx20Data = computeADX(candles, 20);

  // NEW: Stochastic
  const stoch5 = computeStochastic(candles, 5, 3);
  const stoch9 = computeStochastic(candles, 9, 3);
  const stoch14 = computeStochastic(candles, 14, 5);

  // NEW: CCI
  const cci14 = computeCCI(candles, 14);
  const cci20 = computeCCI(candles, 20);

  // NEW: Donchian Channels
  const don10 = computeDonchian(candles, 10);
  const don20 = computeDonchian(candles, 20);
  const don55 = computeDonchian(candles, 55);

  // Volume ratio
  const volAvg20: number[] = new Array(n).fill(0);
  for (let i = 19; i < n; i++) {
    let sum = 0; for (let j = i - 19; j <= i; j++) sum += volumes[j];
    volAvg20[i] = sum / 20;
  }

  // Volatility percentiles
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

  const START = 200;
  const bars: BarArrays = {
    close: [], high: [], low: [], open: [], atr: [],
    rsi7: [], rsi14: [], rsi21: [],
    macdLine_12_26: [], macdSignal_12_26_9: [], macdHist_12_26_9: [],
    macdLine_8_21: [], macdSignal_8_21_5: [], macdHist_8_21_5: [],
    bbUpper: [], bbMiddle: [], bbLower: [], bbWidth: [],
    ema5: [], ema8: [], ema13: [], ema21: [],
    ema34: [], ema50: [], ema100: [], ema200: [],
    adx14: [], adx20: [], plusDI: [], minusDI: [],
    stochK5: [], stochD5: [], stochK9: [], stochD9: [], stochK14: [], stochD14: [],
    cci14: [], cci20: [],
    donchianHigh10: [], donchianLow10: [], donchianMid10: [],
    donchianHigh20: [], donchianLow20: [], donchianMid20: [],
    donchianHigh55: [], donchianLow55: [], donchianMid55: [],
    isInsideBar: [], isEngulfingBull: [], isEngulfingBear: [],
    isPinBarBull: [], isPinBarBear: [],
    volRatio: [], session: [], dayOfWeek: [],
    hurst: [], volBucket: [], isLongBias: [],
    mfeLong: [], maeLong: [], mfeShort: [], maeShort: [],
    barHigh: [], barLow: [],
    isJPY: [], count: 0,
  };

  const MFE_MAE_HORIZON = 16;
  for (let i = START; i < n - MFE_MAE_HORIZON; i++) {
    const currentATR = atrs[i] || 0.001;
    const hurst = computeHurst(closes, i, 20);

    let ssq = 0;
    for (let j = i - 19; j <= i; j++) {
      if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; }
    }
    const rollingVol = Math.sqrt(ssq / 19);
    const volBucket = rollingVol <= p33 ? 0 : rollingVol <= p66 ? 1 : 2;

    let pctSum = 0;
    for (let j = i - 19; j <= i; j++) {
      if (candles[j].open !== 0) pctSum += ((candles[j].close - candles[j].open) / candles[j].open) * 100;
    }
    const isLongBias = pctSum > 0 ? 1 : 0;

    let mfeLong = 0, maeLong = 0, mfeShort = 0, maeShort = 0;
    for (let j = i + 1; j <= i + MFE_MAE_HORIZON && j < n; j++) {
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

    // Price action patterns
    const bodySize = Math.abs(candles[i].close - candles[i].open);
    const candleRange = candles[i].high - candles[i].low;
    const prevBodySize = Math.abs(candles[i - 1].close - candles[i - 1].open);
    const prevRange = candles[i - 1].high - candles[i - 1].low;

    // Inside bar: current high < prev high AND current low > prev low
    const isInside = candles[i].high < candles[i - 1].high && candles[i].low > candles[i - 1].low ? 1 : 0;

    // Engulfing: current body engulfs previous body
    const isBullEngulf = candles[i].close > candles[i].open &&
      candles[i - 1].close < candles[i - 1].open &&
      candles[i].close > candles[i - 1].open &&
      candles[i].open < candles[i - 1].close ? 1 : 0;
    const isBearEngulf = candles[i].close < candles[i].open &&
      candles[i - 1].close > candles[i - 1].open &&
      candles[i].close < candles[i - 1].open &&
      candles[i].open > candles[i - 1].close ? 1 : 0;

    // Pin bar: small body, long wick (>60% of range on one side)
    const upperWick = candles[i].high - Math.max(candles[i].open, candles[i].close);
    const lowerWick = Math.min(candles[i].open, candles[i].close) - candles[i].low;
    const isPinBull = candleRange > 0 && lowerWick / candleRange > 0.6 && bodySize / candleRange < 0.3 ? 1 : 0;
    const isPinBear = candleRange > 0 && upperWick / candleRange > 0.6 && bodySize / candleRange < 0.3 ? 1 : 0;

    bars.close.push(closes[i]); bars.high.push(highs[i]); bars.low.push(lows[i]); bars.open.push(opens[i]);
    bars.atr.push(currentATR);
    bars.rsi7.push(rsi7[i]); bars.rsi14.push(rsi14[i]); bars.rsi21.push(rsi21[i]);
    bars.macdLine_12_26.push(macd1.line[i]); bars.macdSignal_12_26_9.push(macd1.signal[i]); bars.macdHist_12_26_9.push(macd1.hist[i]);
    bars.macdLine_8_21.push(macd2.line[i]); bars.macdSignal_8_21_5.push(macd2.signal[i]); bars.macdHist_8_21_5.push(macd2.hist[i]);
    bars.bbUpper.push(bb.upper[i]); bars.bbMiddle.push(bb.middle[i]); bars.bbLower.push(bb.lower[i]); bars.bbWidth.push(bb.width[i]);
    bars.ema5.push(ema5[i]); bars.ema8.push(ema8[i]); bars.ema13.push(ema13[i]); bars.ema21.push(ema21[i]);
    bars.ema34.push(ema34[i]); bars.ema50.push(ema50[i]); bars.ema100.push(ema100[i]); bars.ema200.push(ema200[i]);
    // ADX
    bars.adx14.push(adx14Data.adx[i]); bars.adx20.push(adx20Data.adx[i]);
    bars.plusDI.push(adx14Data.plusDI[i]); bars.minusDI.push(adx14Data.minusDI[i]);
    // Stochastic
    bars.stochK5.push(stoch5.k[i]); bars.stochD5.push(stoch5.d[i]);
    bars.stochK9.push(stoch9.k[i]); bars.stochD9.push(stoch9.d[i]);
    bars.stochK14.push(stoch14.k[i]); bars.stochD14.push(stoch14.d[i]);
    // CCI
    bars.cci14.push(cci14[i]); bars.cci20.push(cci20[i]);
    // Donchian
    bars.donchianHigh10.push(don10.high[i]); bars.donchianLow10.push(don10.low[i]); bars.donchianMid10.push(don10.mid[i]);
    bars.donchianHigh20.push(don20.high[i]); bars.donchianLow20.push(don20.low[i]); bars.donchianMid20.push(don20.mid[i]);
    bars.donchianHigh55.push(don55.high[i]); bars.donchianLow55.push(don55.low[i]); bars.donchianMid55.push(don55.mid[i]);
    // Price action
    bars.isInsideBar.push(isInside);
    bars.isEngulfingBull.push(isBullEngulf); bars.isEngulfingBear.push(isBearEngulf);
    bars.isPinBarBull.push(isPinBull); bars.isPinBarBear.push(isPinBear);
    // Bar high/low for trailing sim
    bars.barHigh.push(highs[i]); bars.barLow.push(lows[i]);

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

function getADX(bars: BarArrays, i: number, period: number): number {
  return period <= 16 ? bars.adx14[i] : bars.adx20[i];
}

function getStochK(bars: BarArrays, i: number, k: number): number {
  if (k <= 6) return bars.stochK5[i];
  if (k <= 11) return bars.stochK9[i];
  return bars.stochK14[i];
}
function getStochD(bars: BarArrays, i: number, k: number): number {
  if (k <= 6) return bars.stochD5[i];
  if (k <= 11) return bars.stochD9[i];
  return bars.stochD14[i];
}

function getCCI(bars: BarArrays, i: number, period: number): number {
  return period <= 16 ? bars.cci14[i] : bars.cci20[i];
}

function getDonchian(bars: BarArrays, i: number, period: number): { high: number; low: number; mid: number } {
  if (period <= 15) return { high: bars.donchianHigh10[i], low: bars.donchianLow10[i], mid: bars.donchianMid10[i] };
  if (period <= 37) return { high: bars.donchianHigh20[i], low: bars.donchianLow20[i], mid: bars.donchianMid20[i] };
  return { high: bars.donchianHigh55[i], low: bars.donchianLow55[i], mid: bars.donchianMid55[i] };
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
    if (dna.bbMode === 1) { if (c > bars.bbUpper[i]) longSignals++; if (c < bars.bbLower[i]) shortSignals++; }
    else if (dna.bbMode === 2) { if (c < bars.bbLower[i]) longSignals++; if (c > bars.bbUpper[i]) shortSignals++; }
    else if (dna.bbMode === 3) { if (c > bars.bbMiddle[i] && c < bars.bbUpper[i]) longSignals++; if (c < bars.bbMiddle[i] && c > bars.bbLower[i]) shortSignals++; }
  }

  // EMA
  if (dna.emaMode > 0) {
    activeIndicators++;
    const fast = getEMA(bars, i, dna.emaFast);
    const slow = getEMA(bars, i, dna.emaSlow);
    if (dna.emaMode === 1) { if (fast > slow) longSignals++; else shortSignals++; }
    else if (dna.emaMode === 2) { if (bars.close[i] > fast && bars.close[i] > slow) longSignals++; if (bars.close[i] < fast && bars.close[i] < slow) shortSignals++; }
    else if (dna.emaMode === 3) {
      if (i > 0) { const prevFast = getEMA(bars, i - 1, dna.emaFast); if (fast > prevFast) longSignals++; else shortSignals++; }
    }
  }

  // ADX — trend quality filter / signal
  if (dna.adxMode > 0) {
    const adx = getADX(bars, i, dna.adxPeriod);
    if (dna.adxMode === 1) { // trend-only: require ADX > 25
      if (adx < 25) return { long: false, short: false };
      activeIndicators++;
      if (bars.plusDI[i] > bars.minusDI[i]) longSignals++; else shortSignals++;
    } else if (dna.adxMode === 2) { // range-only: require ADX < 20
      if (adx >= 20) return { long: false, short: false };
      // In range, use mean-reversion bias
    } else if (dna.adxMode === 3) { // ADX rising = strengthening trend
      activeIndicators++;
      if (i > 0 && adx > getADX(bars, i - 1, dna.adxPeriod)) {
        if (bars.plusDI[i] > bars.minusDI[i]) longSignals++; else shortSignals++;
      }
    }
  }

  // Stochastic
  if (dna.stochMode > 0) {
    activeIndicators++;
    const k = getStochK(bars, i, dna.stochK);
    const d = getStochD(bars, i, dna.stochK);
    if (dna.stochMode === 1) { if (k < 20) longSignals++; if (k > 80) shortSignals++; }
    else if (dna.stochMode === 2) { if (k > 80) shortSignals++; if (k < 20) longSignals++; }
    else if (dna.stochMode === 3) { if (k > d) longSignals++; else shortSignals++; }
  }

  // CCI
  if (dna.cciMode > 0) {
    activeIndicators++;
    const cci = getCCI(bars, i, dna.cciPeriod);
    if (dna.cciMode === 1) { if (cci > 100) longSignals++; if (cci < -100) shortSignals++; }
    else if (dna.cciMode === 2) { if (cci < -100) longSignals++; if (cci > 100) shortSignals++; }
    else if (dna.cciMode === 3) { if (cci > 0) longSignals++; else shortSignals++; }
  }

  // Donchian Channel
  if (dna.donchianMode > 0) {
    activeIndicators++;
    const don = getDonchian(bars, i, dna.donchianPeriod);
    const c = bars.close[i];
    if (dna.donchianMode === 1) { if (c >= don.high) longSignals++; if (c <= don.low) shortSignals++; }
    else if (dna.donchianMode === 2) { if (c > don.mid) longSignals++; else shortSignals++; }
    else if (dna.donchianMode === 3) { if (c <= don.low) longSignals++; if (c >= don.high) shortSignals++; } // fade
  }

  // Price Action
  if (dna.paMode > 0) {
    activeIndicators++;
    if (dna.paMode === 1) { // inside bar breakout
      if (bars.isInsideBar[i] === 1) {
        // direction from bias
        if (bars.isLongBias[i]) longSignals++; else shortSignals++;
      }
    } else if (dna.paMode === 2) { // engulfing
      if (bars.isEngulfingBull[i] === 1) longSignals++;
      if (bars.isEngulfingBear[i] === 1) shortSignals++;
    } else if (dna.paMode === 3) { // pin bar
      if (bars.isPinBarBull[i] === 1) longSignals++;
      if (bars.isPinBarBear[i] === 1) shortSignals++;
    }
  }

  // Volume filter
  if (dna.volMode > 0) {
    if (dna.volMode === 1 && bars.volBucket[i] < 2) return { long: false, short: false };
    if (dna.volMode === 2 && bars.volBucket[i] > 0) return { long: false, short: false };
    if (dna.volMode === 3 && bars.volRatio[i] < 1.5) return { long: false, short: false };
  }

  // Session/Day/Hurst filters
  if (dna.sessionFilter >= 0 && bars.session[i] !== dna.sessionFilter) return { long: false, short: false };
  if (dna.dayFilter >= 0 && bars.dayOfWeek[i] !== (dna.dayFilter + 1)) return { long: false, short: false };
  if (bars.hurst[i] < dna.hurstMin || bars.hurst[i] > dna.hurstMax) return { long: false, short: false };

  if (activeIndicators === 0) return { long: false, short: false };

  const threshold = Math.ceil(activeIndicators / 2);
  const isLong = longSignals >= threshold && longSignals > shortSignals;
  const isShort = shortSignals >= threshold && shortSignals > longSignals;

  if (dna.direction === 0) return { long: isLong, short: false };
  if (dna.direction === 1) return { long: false, short: isShort };
  return { long: isLong, short: isShort };
}

// ── Advanced Simulation with trailing stops, partial TP, max bars ──────────
function simulateStrategy(bars: BarArrays, dna: StrategyDNA, startIdx = 0, endIdx?: number): SimResult {
  const START_EQ = 1000;
  const RISK_PER_TRADE = 0.01;
  const TRADE_COOLDOWN = 4;
  let equity = START_EQ, peak = START_EQ, maxDD = 0;
  let trades = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  const curve: number[] = [START_EQ];
  const dailyReturns: number[] = [];
  let dayCounter = 0, dayStart = equity;
  let cooldown = 0;
  const end = endIdx ?? bars.count;

  const hasTrailing = dna.trailingATR > 0;
  const hasMaxBars = dna.maxBarsInTrade > 0;
  const hasPartialTP = dna.partialTP > 0;

  for (let i = Math.max(1, startIdx); i < end; i++) {
    dayCounter++;
    if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / (dayStart || 1)); dayStart = equity; dayCounter = 0; }

    if (cooldown > 0) { cooldown--; continue; }

    const entry = evaluateEntry(bars, i, dna);
    const isLong = entry.long;
    const isShort = entry.short;
    if (!isLong && !isShort) continue;

    const sl = bars.atr[i] * dna.slMultiplier;
    const tp = bars.atr[i] * dna.tpMultiplier;
    const pipMult = bars.isJPY[i] ? 100 : 10000;

    let pips: number;

    if (hasTrailing || hasMaxBars || hasPartialTP) {
      // Advanced bar-by-bar simulation
      const entryPrice = bars.close[i];
      const trailATR = hasTrailing ? bars.atr[i] * dna.trailingATR : 0;
      const maxBars = hasMaxBars ? Math.round(dna.maxBarsInTrade) : 999;
      let trailStop = isLong ? entryPrice - sl : entryPrice + sl;
      let tpPrice = isLong ? entryPrice + tp : entryPrice - tp;
      let partialFilled = false;
      let remainingPct = 1.0;
      let partialPips = 0;
      let exitPips = 0;
      let exited = false;

      for (let b = 1; b <= Math.min(16, maxBars) && (i + b) < end; b++) {
        const barH = bars.barHigh ? bars.barHigh[i + b] : bars.high[i + b];
        const barL = bars.barLow ? bars.barLow[i + b] : bars.low[i + b];

        // Partial TP at 1R
        if (hasPartialTP && !partialFilled) {
          const partial1R = isLong ? entryPrice + sl : entryPrice - sl; // 1R level
          if ((isLong && barH >= partial1R) || (!isLong && barL <= partial1R)) {
            const partialSize = dna.partialTP === 1 ? 0.5 : 0.33;
            partialPips += sl * pipMult * partialSize;
            remainingPct -= partialSize;
            partialFilled = true;
            // Move SL to breakeven
            trailStop = entryPrice;
          }
        }

        // Trailing stop update
        if (hasTrailing) {
          if (isLong) {
            const newTrail = barH - trailATR;
            if (newTrail > trailStop) trailStop = newTrail;
          } else {
            const newTrail = barL + trailATR;
            if (newTrail < trailStop) trailStop = newTrail;
          }
        }

        // Check TP hit
        if ((isLong && barH >= tpPrice) || (!isLong && barL <= tpPrice)) {
          exitPips = tp * pipMult * remainingPct;
          exited = true;
          break;
        }

        // Check SL/trailing stop hit
        if ((isLong && barL <= trailStop) || (!isLong && barH >= trailStop)) {
          const slDist = isLong ? (trailStop - entryPrice) : (entryPrice - trailStop);
          exitPips = slDist * pipMult * remainingPct;
          exited = true;
          break;
        }

        // Max bars exit
        if (b >= maxBars) {
          const exitPrice = bars.close[Math.min(i + b, end - 1)];
          const dist = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          exitPips = dist * pipMult * remainingPct;
          exited = true;
          break;
        }
      }

      if (!exited) {
        // Use MFE/MAE fallback
        if (isLong) {
          if (bars.mfeLong[i] >= tp) exitPips = tp * pipMult * remainingPct;
          else if (bars.maeLong[i] >= sl) exitPips = -sl * pipMult * remainingPct;
          else exitPips = (bars.mfeLong[i] - bars.maeLong[i] * 0.5) * pipMult * remainingPct;
        } else {
          if (bars.mfeShort[i] >= tp) exitPips = tp * pipMult * remainingPct;
          else if (bars.maeShort[i] >= sl) exitPips = -sl * pipMult * remainingPct;
          else exitPips = (bars.mfeShort[i] - bars.maeShort[i] * 0.5) * pipMult * remainingPct;
        }
      }

      pips = partialPips + exitPips;
    } else {
      // Original fast sim
      if (isLong) {
        if (bars.mfeLong[i] >= tp) pips = tp * pipMult;
        else if (bars.maeLong[i] >= sl) pips = -sl * pipMult;
        else pips = (bars.mfeLong[i] - bars.maeLong[i] * 0.5) * pipMult;
      } else {
        if (bars.mfeShort[i] >= tp) pips = tp * pipMult;
        else if (bars.maeShort[i] >= sl) pips = -sl * pipMult;
        else pips = (bars.mfeShort[i] - bars.maeShort[i] * 0.5) * pipMult;
      }
    }

    trades++;
    if (pips > 0) { wins++; grossProfit += pips; } else { grossLoss += Math.abs(pips); }

    const dollarRisk = equity * RISK_PER_TRADE;
    const slPips = sl * pipMult;
    const dollarPerPip = slPips > 0 ? dollarRisk / slPips : 0.10;
    equity += pips * dollarPerPip;

    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;

    cooldown = TRADE_COOLDOWN;
    if (i % 5 === 0) curve.push(equity);
  }
  curve.push(equity);

  let sharpe = 0;
  if (dailyReturns.length > 5) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
  }

  const totalReturn = ((equity - START_EQ) / START_EQ) * 100;

  return {
    trades, wins,
    winRate: trades > 0 ? wins / trades : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0),
    totalPips: grossProfit - grossLoss,
    maxDrawdown: maxDD, grossProfit, grossLoss,
    totalReturn, equityCurve: curve, dailyReturns, sharpe,
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
const ADX_PERIODS = [10, 14, 20];
const STOCH_KS = [5, 9, 14];
const STOCH_DS = [3, 5];
const CCI_PERIODS = [14, 20];
const DONCHIAN_PERIODS = [10, 20, 55];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randRange(min: number, max: number): number { return min + Math.random() * (max - min); }

// Expanded archetypes
const ARCHETYPES: Partial<StrategyDNA>[] = [
  // Pure Bollinger
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 0, adxMode: 0, stochMode: 0, cciMode: 0, donchianMode: 0, paMode: 0 },
  { rsiMode: 0, macdMode: 0, bbMode: 2, emaMode: 0, adxMode: 0, stochMode: 0, cciMode: 0, donchianMode: 0, paMode: 0 },
  { rsiMode: 0, macdMode: 0, bbMode: 3, emaMode: 0 },
  // Pure EMA
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 1 },
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 2 },
  { rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 3 },
  // BB + EMA hybrids
  { rsiMode: 0, macdMode: 0, bbMode: 1, emaMode: 1 },
  { rsiMode: 0, macdMode: 0, bbMode: 2, emaMode: 3 },
  // NEW: ADX trend strategies
  { adxMode: 1, emaMode: 1, rsiMode: 0, macdMode: 0, bbMode: 0 },  // ADX trend + EMA cross
  { adxMode: 1, bbMode: 1, rsiMode: 0, macdMode: 0, emaMode: 0 },  // ADX trend + BB breakout
  { adxMode: 2, bbMode: 2, rsiMode: 0, macdMode: 0, emaMode: 0 },  // ADX range + BB mean revert
  { adxMode: 3, emaMode: 1, macdMode: 1 },  // ADX rising + EMA + MACD
  // NEW: Stochastic strategies
  { stochMode: 1, bbMode: 2, rsiMode: 0, macdMode: 0, emaMode: 0, adxMode: 0 },  // Stoch oversold + BB mean revert
  { stochMode: 3, emaMode: 1, rsiMode: 0, macdMode: 0, adxMode: 0 },  // Stoch K/D cross + EMA trend
  { stochMode: 1, adxMode: 2 },  // Stoch oversold in range (ADX<20)
  // NEW: CCI strategies
  { cciMode: 1, emaMode: 1, rsiMode: 0, macdMode: 0, adxMode: 0 },  // CCI breakout + EMA trend
  { cciMode: 2, bbMode: 2, rsiMode: 0, macdMode: 0 },  // CCI reversal + BB mean revert
  { cciMode: 3, adxMode: 1 },  // CCI zero-cross + ADX trend
  // NEW: Donchian Channel strategies (Turtle-style)
  { donchianMode: 1, adxMode: 1, rsiMode: 0, macdMode: 0, bbMode: 0, emaMode: 0 },  // Donchian breakout + ADX
  { donchianMode: 2, emaMode: 1, rsiMode: 0, macdMode: 0 },  // Donchian midline + EMA
  { donchianMode: 3, stochMode: 1 },  // Donchian fade + stoch
  { donchianMode: 1, donchianPeriod: 55 },  // Turtle 55-day breakout
  // NEW: Price Action strategies
  { paMode: 2, emaMode: 1, rsiMode: 0, macdMode: 0, bbMode: 0 },  // Engulfing + EMA trend
  { paMode: 3, bbMode: 2, rsiMode: 0, macdMode: 0 },  // Pin bar + BB mean revert
  { paMode: 1, adxMode: 1, emaMode: 1 },  // Inside bar + ADX trend + EMA
  { paMode: 2, stochMode: 1 },  // Engulfing + stoch oversold
  { paMode: 3, cciMode: 2 },  // Pin bar + CCI reversal
  // Advanced exit archetypes
  { bbMode: 1, emaMode: 1, trailingATR: 2.0 },  // BB breakout + trailing
  { donchianMode: 1, trailingATR: 1.5, maxBarsInTrade: 24 },  // Donchian + trail + time exit
  { paMode: 2, partialTP: 1, trailingATR: 2.0 },  // Engulfing + partial TP + trail
  // Multi-indicator combos
  { rsiMode: 1, bbMode: 1, emaMode: 1, adxMode: 1 },  // RSI + BB + EMA + ADX (4 indicators)
  { stochMode: 3, cciMode: 1, donchianMode: 1 },  // Stoch + CCI + Donchian
  { paMode: 2, adxMode: 1, stochMode: 1, emaMode: 1 },  // PA + ADX + Stoch + EMA
  // Volume/session combos
  { bbMode: 1, emaMode: 0, volMode: 3, sessionFilter: 1 },
  { emaMode: 1, volMode: 1, sessionFilter: 2 },
  // Hurst regime
  { bbMode: 1, hurstMin: 0.55, hurstMax: 1.0 },
  { bbMode: 2, hurstMin: 0.0, hurstMax: 0.45 },
  // Full kitchen sink
  { rsiMode: 1, macdMode: 1, bbMode: 1, emaMode: 1, adxMode: 1, stochMode: 1 },
  { rsiMode: 2, macdMode: 3, bbMode: 2, emaMode: 3, cciMode: 2, paMode: 3 },
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
    adxPeriod: pick(ADX_PERIODS), adxMode: Math.floor(Math.random() * 4),
    stochK: pick(STOCH_KS), stochD: pick(STOCH_DS), stochMode: Math.floor(Math.random() * 4),
    cciPeriod: pick(CCI_PERIODS), cciMode: Math.floor(Math.random() * 4),
    donchianPeriod: pick(DONCHIAN_PERIODS), donchianMode: Math.floor(Math.random() * 4),
    paMode: Math.floor(Math.random() * 4),
    volMode: Math.floor(Math.random() * 4),
    sessionFilter: Math.floor(Math.random() * 5) - 1,
    dayFilter: Math.floor(Math.random() * 6) - 1,
    direction: Math.floor(Math.random() * 3),
    slMultiplier: randRange(0.5, 3.5), tpMultiplier: randRange(0.5, 6.0),
    hurstMin: Math.random() * 0.5, hurstMax: 0.5 + Math.random() * 0.5,
    trailingATR: Math.random() < 0.3 ? randRange(0.5, 3.0) : 0,
    maxBarsInTrade: Math.random() < 0.25 ? Math.floor(randRange(4, 48)) : 0,
    partialTP: Math.random() < 0.2 ? Math.floor(randRange(1, 3)) : 0,
  };
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
    adxPeriod: r() ? a.adxPeriod : b.adxPeriod, adxMode: r() ? a.adxMode : b.adxMode,
    stochK: r() ? a.stochK : b.stochK, stochD: r() ? a.stochD : b.stochD, stochMode: r() ? a.stochMode : b.stochMode,
    cciPeriod: r() ? a.cciPeriod : b.cciPeriod, cciMode: r() ? a.cciMode : b.cciMode,
    donchianPeriod: r() ? a.donchianPeriod : b.donchianPeriod, donchianMode: r() ? a.donchianMode : b.donchianMode,
    paMode: r() ? a.paMode : b.paMode,
    volMode: r() ? a.volMode : b.volMode,
    sessionFilter: r() ? a.sessionFilter : b.sessionFilter,
    dayFilter: r() ? a.dayFilter : b.dayFilter,
    direction: r() ? a.direction : b.direction,
    slMultiplier: r() ? a.slMultiplier : b.slMultiplier,
    tpMultiplier: r() ? a.tpMultiplier : b.tpMultiplier,
    hurstMin: r() ? a.hurstMin : b.hurstMin,
    hurstMax: r() ? a.hurstMax : b.hurstMax,
    trailingATR: r() ? a.trailingATR : b.trailingATR,
    maxBarsInTrade: r() ? a.maxBarsInTrade : b.maxBarsInTrade,
    partialTP: r() ? a.partialTP : b.partialTP,
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
  // New mutations
  if (Math.random() < rate) d.adxPeriod = pick(ADX_PERIODS);
  if (Math.random() < rate) d.adxMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.stochK = pick(STOCH_KS);
  if (Math.random() < rate) d.stochD = pick(STOCH_DS);
  if (Math.random() < rate) d.stochMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.cciPeriod = pick(CCI_PERIODS);
  if (Math.random() < rate) d.cciMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.donchianPeriod = pick(DONCHIAN_PERIODS);
  if (Math.random() < rate) d.donchianMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.paMode = Math.floor(Math.random() * 4);
  // Original mutations
  if (Math.random() < rate) d.volMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.sessionFilter = Math.floor(Math.random() * 5) - 1;
  if (Math.random() < rate) d.dayFilter = Math.floor(Math.random() * 6) - 1;
  if (Math.random() < rate) d.direction = Math.floor(Math.random() * 3);
  if (Math.random() < rate) d.slMultiplier = Math.max(0.3, Math.min(3.5, d.slMultiplier + (Math.random() - 0.5) * 0.6));
  if (Math.random() < rate) d.tpMultiplier = Math.max(0.5, Math.min(6.0, d.tpMultiplier + (Math.random() - 0.5) * 1.0));
  if (Math.random() < rate) d.hurstMin = Math.max(0, Math.min(0.9, d.hurstMin + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.hurstMax = Math.max(d.hurstMin + 0.1, Math.min(1.0, d.hurstMax + (Math.random() - 0.5) * 0.15));
  // Advanced exit mutations
  if (Math.random() < rate) d.trailingATR = Math.random() < 0.3 ? 0 : Math.max(0.5, Math.min(3.0, (d.trailingATR || 1.5) + (Math.random() - 0.5) * 0.8));
  if (Math.random() < rate) d.maxBarsInTrade = Math.random() < 0.3 ? 0 : Math.max(4, Math.min(48, Math.round((d.maxBarsInTrade || 16) + (Math.random() - 0.5) * 12)));
  if (Math.random() < rate) d.partialTP = Math.floor(Math.random() * 3);
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
  if (dna.adxMode > 0) indicators.push('ADX');
  if (dna.stochMode > 0) indicators.push('Stoch');
  if (dna.cciMode > 0) indicators.push('CCI');
  if (dna.donchianMode > 0) indicators.push('Donch');
  if (dna.paMode > 0) indicators.push('PA');
  
  const filters: string[] = [];
  if (dna.volMode > 0) filters.push(['HighVol', 'LowVol', 'VolExpansion'][dna.volMode - 1] || 'Vol');
  const sessions = ['Asia', 'London', 'NewYork', 'NYClose'];
  if (dna.sessionFilter >= 0) filters.push(sessions[dna.sessionFilter]);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (dna.dayFilter >= 0) filters.push(days[dna.dayFilter]);

  const exits: string[] = [];
  if (dna.trailingATR > 0) exits.push('Trail');
  if (dna.maxBarsInTrade > 0) exits.push('TimeCut');
  if (dna.partialTP > 0) exits.push('PartialTP');

  const singleNames: Record<string, Record<number, string>> = {
    BB: { 1: 'The Volatility Squeeze Breakout', 2: 'The Mean Reversion Trap', 3: 'The Band Walker' },
    EMA: { 1: 'The Golden Cross Hunter', 2: 'The Trend Confirmation Engine', 3: 'The Slope Momentum Rider' },
    RSI: { 1: 'The Oversold Reversal Sniper', 2: 'The Overbought Fade Machine', 3: 'The Midline Momentum Pivot' },
    MACD: { 1: 'The Signal Line Snapper', 2: 'The Zero-Line Breakout', 3: 'The Histogram Divergence Play' },
    ADX: { 1: 'The Trend Strength Scanner', 2: 'The Range-Bound Scalper', 3: 'The Momentum Acceleration Detector' },
    Stoch: { 1: 'The Stochastic Reversal Engine', 2: 'The Overbought Momentum Fade', 3: 'The K/D Crossover Hunter' },
    CCI: { 1: 'The CCI Breakout Charger', 2: 'The CCI Mean Reversion Sniper', 3: 'The Zero-Line Trend Pivots' },
    Donch: { 1: 'The Turtle Channel Breakout', 2: 'The Channel Midline Rider', 3: 'The Channel Fade Contrarian' },
    PA: { 1: 'The Inside Bar Explosion', 2: 'The Engulfing Reversal Cannon', 3: 'The Pin Bar Rejection Sniper' },
  };

  const comboNames: Record<string, string[]> = {
    'ADX+BB': ['The Trend-Volatility Fusion', 'The ADX-Bollinger Power Engine'],
    'ADX+Donch': ['The Turtle Trend Machine', 'The ADX-Donchian Momentum'],
    'ADX+EMA': ['The Trend-Confirmed Crossover', 'The ADX Acceleration Engine'],
    'ADX+Stoch': ['The Trend-Oscillator Hybrid', 'The ADX-Stochastic Convergence'],
    'BB+CCI': ['The Volatility-CCI Breakout', 'The Band-Channel Convergence'],
    'BB+Donch': ['The Dual-Channel Breakout', 'The Bollinger-Donchian Fusion'],
    'BB+EMA': ['The Structural Trend-Band Convergence', 'The Bollinger-EMA Fusion Engine'],
    'BB+PA': ['The Price Action Volatility Engine', 'The Candlestick-Bollinger Hybrid'],
    'BB+RSI': ['The Volatility-Momentum Reversal', 'The Band Squeeze Oscillator'],
    'BB+Stoch': ['The Stochastic Volatility Reversal', 'The BB-Stoch Fade Machine'],
    'CCI+Donch': ['The Channel Breakout Accelerator', 'The CCI-Donchian Momentum'],
    'CCI+EMA': ['The CCI Trend Filter', 'The Channel-Trend Convergence'],
    'CCI+Stoch': ['The Dual Oscillator Momentum', 'The CCI-Stoch Crossfire'],
    'Donch+EMA': ['The Turtle-EMA Trend Machine', 'The Channel Trend Rider'],
    'Donch+PA': ['The Channel Breakout + Price Action', 'The Structural Channel Engine'],
    'EMA+PA': ['The Price Action Trend Sniper', 'The Candlestick Trend Engine'],
    'EMA+Stoch': ['The Stochastic Trend Rider', 'The EMA-Stoch Momentum'],
    'PA+Stoch': ['The Candlestick Oscillator', 'The Price Action Reversal Engine'],
    'BB+EMA+RSI': ['The Triple-Layer Volatility Filter', 'The Full-Spectrum Reversal Engine'],
    'ADX+BB+EMA': ['The Triple Trend-Volatility Machine', 'The ADX-BB-EMA Convergence'],
    'ADX+EMA+Stoch': ['The Trend-Oscillator Trifecta', 'The ADX-Stoch-EMA Fusion'],
    'BB+Donch+EMA': ['The Triple Channel Engine', 'The Multi-Channel Trend Machine'],
    'ADX+CCI+Donch': ['The Channel Breakout Validator', 'The ADX-CCI-Donchian Machine'],
    'BB+EMA+PA': ['The Price Action Trend-Band Engine', 'The PA-BB-EMA Convergence'],
  };

  if (indicators.length === 0) {
    if (filters.length > 0 || exits.length > 0) return `The ${[...filters, ...exits].join(' ')} Anomaly Filter #${nameCounter}`;
    return `The Pure Regime Filter #${nameCounter}`;
  }

  let baseName: string;
  if (indicators.length === 1) {
    const ind = indicators[0];
    const modeKey = ind === 'PA' ? 'paMode' : ind === 'Stoch' ? 'stochMode' : ind === 'Donch' ? 'donchianMode' : `${ind.toLowerCase()}Mode`;
    const mode = (dna as Record<string, number>)[modeKey] || 1;
    baseName = singleNames[ind]?.[mode] || `The ${ind} Strategy`;
  } else {
    const key = indicators.sort().join('+');
    const options = comboNames[key] || [`The ${indicators.join('-')} Hybrid`];
    baseName = options[nameCounter % options.length];
  }

  const suffix: string[] = [];
  if (filters.length > 0) suffix.push(filters.join(' '));
  if (exits.length > 0) suffix.push(exits.join('+'));
  if (suffix.length > 0) baseName += ` (${suffix.join(' · ')})`;
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
  // New indicators
  if (dna.adxMode === 1) parts.push(`ADX(${dna.adxPeriod}) > 25 trend filter with +DI/-DI direction`);
  if (dna.adxMode === 2) parts.push(`ADX(${dna.adxPeriod}) < 20 range-bound filter`);
  if (dna.adxMode === 3) parts.push(`ADX(${dna.adxPeriod}) rising momentum acceleration`);
  if (dna.stochMode === 1) parts.push(`Stochastic(${dna.stochK},${dna.stochD}) oversold <20 buy`);
  if (dna.stochMode === 2) parts.push(`Stochastic(${dna.stochK},${dna.stochD}) overbought >80 sell`);
  if (dna.stochMode === 3) parts.push(`Stochastic %K/%D crossover`);
  if (dna.cciMode === 1) parts.push(`CCI(${dna.cciPeriod}) breakout >100`);
  if (dna.cciMode === 2) parts.push(`CCI(${dna.cciPeriod}) reversal <-100`);
  if (dna.cciMode === 3) parts.push(`CCI(${dna.cciPeriod}) zero-line cross`);
  if (dna.donchianMode === 1) parts.push(`Donchian(${dna.donchianPeriod}) high breakout`);
  if (dna.donchianMode === 2) parts.push(`Donchian(${dna.donchianPeriod}) midline crossover`);
  if (dna.donchianMode === 3) parts.push(`Donchian(${dna.donchianPeriod}) fade extremes`);
  if (dna.paMode === 1) parts.push(`Inside bar breakout pattern`);
  if (dna.paMode === 2) parts.push(`Engulfing candle reversal`);
  if (dna.paMode === 3) parts.push(`Pin bar rejection pattern`);
  // Advanced exits
  if (dna.trailingATR > 0) parts.push(`Trailing stop ${dna.trailingATR.toFixed(1)}× ATR`);
  if (dna.maxBarsInTrade > 0) parts.push(`Time exit after ${Math.round(dna.maxBarsInTrade)} bars`);
  if (dna.partialTP === 1) parts.push(`50% partial TP at 1R then trail`);
  if (dna.partialTP === 2) parts.push(`33% partial TP at each R level`);
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
  // New entry rules
  if (dna.adxMode === 1) rules.push(`ADX(${dna.adxPeriod}) > 25 confirms trending regime; +DI > -DI = LONG`);
  if (dna.adxMode === 2) rules.push(`ADX(${dna.adxPeriod}) < 20 confirms range-bound regime`);
  if (dna.adxMode === 3) rules.push(`ADX(${dna.adxPeriod}) rising = accelerating momentum`);
  if (dna.stochMode === 1) rules.push(`Stochastic %K(${dna.stochK}) < 20 = oversold buy signal`);
  if (dna.stochMode === 2) rules.push(`Stochastic %K(${dna.stochK}) > 80 = overbought sell signal`);
  if (dna.stochMode === 3) rules.push(`%K crosses above %D = LONG; %K below %D = SHORT`);
  if (dna.cciMode === 1) rules.push(`CCI(${dna.cciPeriod}) > 100 = breakout LONG; < -100 = SHORT`);
  if (dna.cciMode === 2) rules.push(`CCI(${dna.cciPeriod}) < -100 = reversal LONG; > 100 = SHORT`);
  if (dna.cciMode === 3) rules.push(`CCI(${dna.cciPeriod}) crosses zero line`);
  if (dna.donchianMode === 1) rules.push(`Price >= Donchian(${dna.donchianPeriod}) High = LONG breakout`);
  if (dna.donchianMode === 2) rules.push(`Price above Donchian(${dna.donchianPeriod}) Midline = LONG`);
  if (dna.donchianMode === 3) rules.push(`Price <= Donchian(${dna.donchianPeriod}) Low = LONG fade`);
  if (dna.paMode === 1) rules.push(`Inside bar detected → breakout in dominant direction`);
  if (dna.paMode === 2) rules.push(`Bullish/bearish engulfing candle reversal pattern`);
  if (dna.paMode === 3) rules.push(`Pin bar rejection: long wick > 60% of range, small body < 30%`);
  // Filters
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
  const rules: string[] = [
    `Stop Loss: ${dna.slMultiplier.toFixed(2)} × ATR(14)`,
    `Take Profit: ${dna.tpMultiplier.toFixed(2)} × ATR(14)`,
    `Risk:Reward = 1:${(dna.tpMultiplier / dna.slMultiplier).toFixed(2)}`,
  ];
  if (dna.trailingATR > 0) rules.push(`Trailing Stop: ${dna.trailingATR.toFixed(1)} × ATR — follows price, locks profit`);
  if (dna.maxBarsInTrade > 0) rules.push(`Time Exit: Close after ${Math.round(dna.maxBarsInTrade)} bars (${(Math.round(dna.maxBarsInTrade) * 0.5).toFixed(1)}h) max hold`);
  if (dna.partialTP === 1) rules.push(`Partial TP: Take 50% profit at 1R, move SL to breakeven, trail remainder`);
  if (dna.partialTP === 2) rules.push(`Partial TP: Take 33% profit at each R level, trail final 34%`);
  return rules;
}

// ── Supabase ──────────────────────────────────────────────────────────────
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const DEFAULT_JOB_KEY = "ga_job_state";
const DATA_KEY_PREFIX = "ga_bars_";
function getJobKey(pair?: string): string {
  return pair ? `ga_job_state_${pair}` : DEFAULT_JOB_KEY;
}

function getEdgeArchetype(dna: StrategyDNA): string {
  const parts: string[] = [];
  if (dna.rsiMode > 0) parts.push('RSI');
  if (dna.macdMode > 0) parts.push('MACD');
  if (dna.bbMode > 0) parts.push('BB');
  if (dna.emaMode > 0) parts.push('EMA');
  if (dna.adxMode > 0) parts.push('ADX');
  if (dna.stochMode > 0) parts.push('STOCH');
  if (dna.cciMode > 0) parts.push('CCI');
  if (dna.donchianMode > 0) parts.push('DONCH');
  if (dna.paMode > 0) parts.push('PA');
  if (dna.volMode > 0) parts.push('VOL');
  if (dna.sessionFilter >= 0) parts.push('SES');
  if (dna.dayFilter >= 0) parts.push('DAY');
  if (dna.trailingATR > 0) parts.push('TRAIL');
  if (dna.partialTP > 0) parts.push('PARTIAL');
  return parts.sort().join('+') || 'PURE_FILTER';
}

function computeFitness(sim: SimResult, baseDailyReturns: number[], maxCorrelation: number, dna?: StrategyDNA, unconstrained = false): number {
  if (unconstrained) {
    if (sim.trades < 15) return 0;
    let fitness = sim.totalReturn * Math.sqrt(Math.max(sim.trades, 1));
    if (sim.maxDrawdown > 0.001) fitness /= (sim.maxDrawdown * 2);
    if (sim.sharpe > 0.5) fitness *= 1 + (sim.sharpe * 0.2);
    if (sim.profitFactor > 1.5) fitness *= 1.2;
    if (sim.profitFactor > 2.0) fitness *= 1.2;
    if (sim.totalReturn > 50) fitness *= 1.3;
    if (sim.totalReturn > 100) fitness *= 1.4;
    if (sim.totalReturn > 200) fitness *= 1.5;
    if (sim.totalReturn > 500) fitness *= 1.5;
    // Bonus for using advanced features
    if (dna) {
      const advCount = [dna.adxMode > 0, dna.stochMode > 0, dna.cciMode > 0, dna.donchianMode > 0, dna.paMode > 0].filter(Boolean).length;
      if (advCount >= 1) fitness *= 1.1;
      if (advCount >= 2) fitness *= 1.15;
      if (dna.trailingATR > 0) fitness *= 1.1;
      if (dna.partialTP > 0) fitness *= 1.05;
    }
    return Math.max(fitness, 0);
  }

  let fitness = 0;
  if (sim.trades >= 20 && sim.maxDrawdown > 0.001) {
    fitness = (sim.profitFactor * sim.winRate * Math.sqrt(sim.trades)) / sim.maxDrawdown;
    if (sim.sharpe > 0.5) fitness *= 1 + (sim.sharpe * 0.3);
    if (sim.sharpe > 1.5) fitness *= 1.3;
    if (sim.sharpe > 2.5) fitness *= 1.2;
  } else if (sim.trades >= 20) {
    fitness = sim.profitFactor * sim.winRate * Math.sqrt(sim.trades) * 10;
  }
  if (sim.trades < 30) fitness *= 0.05;
  else if (sim.trades < 50) fitness *= 0.3;
  else if (sim.trades < 100) fitness *= 0.7;
  if (sim.trades > 200) fitness *= 1.15;
  if (sim.trades > 400) fitness *= 1.15;

  if (sim.totalReturn > 20) fitness *= 1.2;
  if (sim.totalReturn > 50) fitness *= 1.3;
  if (sim.totalReturn > 100) fitness *= 1.4;
  if (sim.totalReturn > 200) fitness *= 1.3;

  if (sim.maxDrawdown > 0.3) fitness *= 0.5;
  if (sim.maxDrawdown > 0.5) fitness *= 0.3;

  const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
  if (corr > maxCorrelation) fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);

  if (dna) {
    const hasRSI = dna.rsiMode > 0;
    const hasMACD = dna.macdMode > 0;
    const hasBB = dna.bbMode > 0;
    const hasEMA = dna.emaMode > 0;
    const hasADX = dna.adxMode > 0;
    const hasStoch = dna.stochMode > 0;
    const hasCCI = dna.cciMode > 0;
    const hasDonch = dna.donchianMode > 0;
    const hasPA = dna.paMode > 0;
    const hasVol = dna.volMode > 0;
    const hasSes = dna.sessionFilter >= 0;
    const hasDay = dna.dayFilter >= 0;

    // Penalize basic RSI+MACD combos
    if (hasRSI && hasMACD && !hasBB && !hasEMA && !hasADX && !hasStoch && !hasCCI && !hasDonch && !hasPA) fitness *= 0.3;
    if ((hasRSI || hasMACD) && !hasBB && !hasEMA && !hasADX && !hasStoch && !hasCCI && !hasDonch && !hasPA) fitness *= 0.6;

    // Reward structural indicators
    if (hasBB) fitness *= 1.3;
    if (hasEMA) fitness *= 1.2;
    if (hasVol) fitness *= 1.15;
    if (hasSes) fitness *= 1.1;
    if (hasDay) fitness *= 1.1;

    // Reward advanced indicators
    if (hasADX) fitness *= 1.25;
    if (hasStoch) fitness *= 1.15;
    if (hasCCI) fitness *= 1.2;
    if (hasDonch) fitness *= 1.25;
    if (hasPA) fitness *= 1.3;

    // Reward advanced exits
    if (dna.trailingATR > 0) fitness *= 1.15;
    if (dna.partialTP > 0) fitness *= 1.1;
    if (dna.maxBarsInTrade > 0) fitness *= 1.05;

    const activeCount = [hasRSI, hasMACD, hasBB, hasEMA, hasADX, hasStoch, hasCCI, hasDonch, hasPA].filter(Boolean).length;
    if (activeCount >= 3) fitness *= 1.3;
    if (activeCount >= 4) fitness *= 1.2;
    if (activeCount >= 5) fitness *= 1.15;
  }

  return fitness;
}

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
  const unconstrained = Boolean(body.unconstrained);

  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  if (!apiToken) throw new Error("OANDA API token not configured");

  console.log(`[GA-P1] Fetching ${candleCount} M30 candles for ${pair} (${environment})`);
  const candles = await fetchCandles(pair, candleCount, environment, apiToken);
  if (candles.length < 250) throw new Error(`Insufficient candle data: ${candles.length}`);

  console.log(`[GA-P1] Got ${candles.length} candles, building indicator library...`);
  const bars = buildFeatureArrays(pair, candles);
  console.log(`[GA-P1] Built ${bars.count} feature bars with 30+ indicator suite`);

  const IS_SPLIT = Math.floor(bars.count * 0.7);
  console.log(`[GA-P1] Walk-forward split: IS=${IS_SPLIT} bars, OOS=${bars.count - IS_SPLIT} bars`);

  // Baseline
  const baseDailyReturns: number[] = [];
  let baseEq = 10000, dayCounter = 0, dayStart = baseEq;
  for (let i = 1; i < IS_SPLIT; i++) {
    const isLong = bars.ema8[i] > bars.ema34[i];
    const baseReturn = isLong ? bars.mfeLong[i] * 0.5 : bars.mfeShort[i] * 0.5;
    baseEq += baseReturn * 10000 * 0.001;
    dayCounter++;
    if (dayCounter >= 48) { baseDailyReturns.push((baseEq - dayStart) / (dayStart || 1)); dayStart = baseEq; dayCounter = 0; }
  }

  console.log(`[GA-P1] Initializing population of ${populationSize} with ${ARCHETYPES.length} archetype seeds`);
  const population: { dna: StrategyDNA; fitness: number }[] = [];
  for (let i = 0; i < Math.min(ARCHETYPES.length, populationSize); i++) {
    const dna = randomDNA(ARCHETYPES[i]);
    const sim = simulateStrategy(bars, dna, 0, IS_SPLIT);
    const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, dna, unconstrained);
    population.push({ dna, fitness });
  }
  while (population.length < populationSize) {
    const dna = randomDNA();
    const sim = simulateStrategy(bars, dna, 0, IS_SPLIT);
    const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, dna, unconstrained);
    population.push({ dna, fitness });
  }
  population.sort((a, b) => b.fitness - a.fitness);

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
    totalGenerations, populationSize, maxCorrelation, mutationRate, gensPerCall, unconstrained,
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    baseDailyReturns, isSplit: IS_SPLIT,
    evolutionLog: [{ gen: 0, bestFitness: Math.round(population[0].fitness * 1000) / 1000, avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000, bestTrades: 0 }],
    totalSimulations: populationSize, barCount: bars.count, startedAt: new Date().toISOString(),
    dateRange: { start: candles[0]?.time || '', end: candles[candles.length - 1]?.time || '' },
  };

  const JOB_KEY = getJobKey(pair);
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
    message: `Indicator library built. ${bars.count} bars with RSI, MACD, BB, EMA, ADX, Stoch, CCI, Donchian, Price Action. Ready to evolve.`,
  };
}

async function handlePhase2(body: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const pairHint = body.pair as string | undefined;
  const keysToTry = pairHint ? [getJobKey(pairHint)] : [getJobKey()];
  let jobRow: { payload: unknown } | null = null;
  let usedKey = keysToTry[0];
  for (const key of keysToTry) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await sb.from("sovereign_memory").select("payload").eq("memory_key", key).eq("memory_type", "ga_job").maybeSingle();
      if (data) { jobRow = data; usedKey = key; break; }
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
    if (jobRow) break;
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
  const unconstrained = Boolean(job.unconstrained);

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found. Run Phase 1 first.");
  const bars = barsRow.payload as BarArrays;
  const isSplit = (job.isSplit as number) || bars.count;

  const gensToRun = Math.min(gensPerCall, totalGenerations - currentGen);
  console.log(`[GA-P2] Gen ${currentGen + 1}→${currentGen + gensToRun} of ${totalGenerations} (IS=${isSplit}/${bars.count})`);

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
      const sim = simulateStrategy(bars, child, 0, isSplit);
      const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, child, unconstrained);
      newPop.push({ dna: child, fitness });
      totalSimulations++;
    }

    population = newPop.sort((a, b) => b.fitness - a.fitness);
    const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
    const bestSim = simulateStrategy(bars, population[0].dna, 0, isSplit);
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
    .eq("memory_key", usedKey).eq("memory_type", "ga_job");

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

async function handlePhase3(body: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const pairHint = body.pair as string | undefined;
  const JOB_KEY = pairHint ? getJobKey(pairHint) : getJobKey();
  const { data: jobRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
  if (!jobRow) throw new Error("No GA job found.");
  const job = jobRow.payload as Record<string, unknown>;
  const pair = job.pair as string;
  const maxCorrelation = job.maxCorrelation as number;
  const baseDailyReturns = job.baseDailyReturns as number[];
  const population = job.population as { dna: StrategyDNA; fitness: number }[];
  const evolutionLog = job.evolutionLog as { gen: number; bestFitness: number; avgFitness: number; bestTrades: number }[];
  const totalSimulations = job.totalSimulations as number;
  const unconstrained = Boolean(job.unconstrained);

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found.");
  const bars = barsRow.payload as BarArrays;
  const isSplit = (job.isSplit as number) || bars.count;

  console.log(`[GA-P3] Extracting top strategies from ${population.length} individuals (full dataset: ${bars.count} bars)`);
  nameCounter = 0;

  const seen = new Set<string>();
  const profiles: (ScoredIndividual & { oosSim?: SimResult; isSim?: SimResult })[] = [];

  for (const p of population.slice(0, 60)) {
    const d = p.dna;
    const key = `${d.rsiMode}-${d.rsiPeriod}-${d.macdMode}-${d.macdFast}-${d.bbMode}-${d.bbPeriod}-${d.emaMode}-${d.emaFast}-${d.emaSlow}-${d.adxMode}-${d.stochMode}-${d.cciMode}-${d.donchianMode}-${d.paMode}-${d.direction}-${d.volMode}-${d.sessionFilter}-${d.dayFilter}-${d.trailingATR > 0 ? 1 : 0}-${d.partialTP}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Full-dataset sim for equity curve display
    const sim = simulateStrategy(bars, p.dna);
    if (sim.trades < 50) continue; // Overfitting filter: require ≥ 50 total trades

    // IS-only sim (candles 0 to isSplit)
    const isSim = isSplit < bars.count ? simulateStrategy(bars, p.dna, 0, isSplit) : sim;
    // OOS sim (candles isSplit to end) — the blind test
    const oosSim = isSplit < bars.count ? simulateStrategy(bars, p.dna, isSplit) : undefined;

    // ── OOS Survival Filter ──
    if (oosSim && oosSim.trades >= 5) {
      // Reject if OOS Profit Factor < 1.2
      if (oosSim.profitFactor < 1.2) continue;
      // Reject if OOS Max Drawdown > 2× IS Max Drawdown
      if (isSim.maxDrawdown > 0.001 && oosSim.maxDrawdown > isSim.maxDrawdown * 2) continue;
    }

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
      oosSim,
      isSim,
    });
  }

  profiles.sort((a, b) => b.sim.totalReturn - a.sim.totalReturn);

  let finalUncorrelated: (ScoredIndividual & { oosSim?: SimResult; isSim?: SimResult })[];

  if (unconstrained) {
    finalUncorrelated = profiles.slice(0, 10);
  } else {
    const MAX_PER_ARCHETYPE = 2;
    const archetypeCounts: Record<string, number> = {};

    function canAddArchetype(dna: StrategyDNA): boolean {
      const arch = getEdgeArchetype(dna);
      const count = archetypeCounts[arch] || 0;
      if (count >= MAX_PER_ARCHETYPE) return false;
      archetypeCounts[arch] = count + 1;
      return true;
    }

    function isUncorrelatedWithPortfolio(candidate: ScoredIndividual, portfolio: ScoredIndividual[]): boolean {
      for (const existing of portfolio) {
        const interCorr = Math.abs(pearsonCorrelation(candidate.sim.dailyReturns, existing.sim.dailyReturns));
        if (interCorr > 0.4) return false;
      }
      return true;
    }

    const diverseProfiles: (ScoredIndividual & { oosSim?: SimResult; isSim?: SimResult })[] = [];
    for (const p of profiles) {
      if (diverseProfiles.length >= 10) break;
      if (p.correlation > maxCorrelation) continue;
      if (!canAddArchetype(p.dna)) continue;
      if (!isUncorrelatedWithPortfolio(p, diverseProfiles)) continue;
      // OOS survival filter already applied above during extraction
      diverseProfiles.push(p);
    }

    if (diverseProfiles.length < 10) {
      for (const p of profiles) {
        if (diverseProfiles.length >= 10) break;
        if (diverseProfiles.includes(p)) continue;
        if (p.correlation > 0.4) continue;
        if (!canAddArchetype(p.dna)) continue;
        if (!isUncorrelatedWithPortfolio(p, diverseProfiles)) continue;
        diverseProfiles.push(p);
      }
    }

    if (diverseProfiles.length < 10) {
      for (const p of profiles) {
        if (diverseProfiles.length >= 10) break;
        if (diverseProfiles.includes(p)) continue;
        if (!canAddArchetype(p.dna)) continue;
        diverseProfiles.push(p);
      }
    }

    finalUncorrelated = diverseProfiles;
  }

  const allArchCounts: Record<string, number> = {};
  const allProfiles = profiles.filter(p => {
    const arch = getEdgeArchetype(p.dna);
    const count = allArchCounts[arch] || 0;
    if (count >= 3) return false;
    allArchCounts[arch] = count + 1;
    return true;
  }).slice(0, 20);

  const fmt = (p: ScoredIndividual & { oosSim?: SimResult; isSim?: SimResult }) => ({
    dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000,
    winRate: Math.round(p.sim.winRate * 10000) / 10000,
    profitFactor: Math.round(p.sim.profitFactor * 100) / 100,
    trades: p.sim.trades,
    totalPips: Math.round(p.sim.totalPips * 10) / 10,
    totalReturn: Math.round(p.sim.totalReturn * 100) / 100,
    maxDrawdown: Math.round(p.sim.maxDrawdown * 10000) / 10000,
    grossProfit: Math.round(p.sim.grossProfit * 10) / 10,
    grossLoss: Math.round(p.sim.grossLoss * 10) / 10,
    sharpe: Math.round((p.sim.sharpe || 0) * 100) / 100,
    correlation: Math.round(p.correlation * 1000) / 1000,
    equityCurve: p.sim.equityCurve,
    strategyName: p.strategyName,
    edgeDescription: p.edgeDescription,
    entryRules: p.entryRules,
    exitRules: p.exitRules,
    edgeArchetype: getEdgeArchetype(p.dna),
    // Full IS/OOS metrics for Lie Detector panel
    oosReturn: p.oosSim ? Math.round(p.oosSim.totalReturn * 100) / 100 : null,
    oosWinRate: p.oosSim ? Math.round(p.oosSim.winRate * 10000) / 10000 : null,
    oosTrades: p.oosSim?.trades ?? null,
    oosProfitFactor: p.oosSim ? Math.round(p.oosSim.profitFactor * 100) / 100 : null,
    oosMaxDrawdown: p.oosSim ? Math.round(p.oosSim.maxDrawdown * 10000) / 10000 : null,
    oosPips: p.oosSim ? Math.round(p.oosSim.totalPips * 10) / 10 : null,
    // IS-only metrics
    isReturn: p.isSim ? Math.round(p.isSim.totalReturn * 100) / 100 : null,
    isWinRate: p.isSim ? Math.round(p.isSim.winRate * 10000) / 10000 : null,
    isTrades: p.isSim?.trades ?? null,
    isProfitFactor: p.isSim ? Math.round(p.isSim.profitFactor * 100) / 100 : null,
    isMaxDrawdown: p.isSim ? Math.round(p.isSim.maxDrawdown * 10000) / 10000 : null,
    isPips: p.isSim ? Math.round(p.isSim.totalPips * 10) / 10 : null,
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

async function handleStatus(body: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const pairHint = body.pair as string | undefined;
  const JOB_KEY = pairHint ? getJobKey(pairHint) : getJobKey();
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

// ── Batch Extract: Cross-pair Top 7 ──────────────────────────────────────
async function handleBatchExtract(body: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const pairs = (body.pairs as string[]) || [];
  if (!pairs.length) throw new Error("pairs array required for batch-extract");

  const topN = Number(body.topN) || 7;
  const maxInterCorr = Number(body.maxInterCorrelation) || 0.4;

  console.log(`[GA-BATCH] Cross-pair extraction across ${pairs.length} pairs, selecting Top ${topN}`);

  interface PairStrategy {
    pair: string; dna: StrategyDNA; fitness: number; sim: SimResult;
    correlation: number; strategyName: string; edgeDescription: string;
    entryRules: string[]; exitRules: string[];
    edgeArchetype: string;
    oosReturn?: number | null; oosWinRate?: number | null; oosTrades?: number | null;
    equityCurve: number[];
  }

  const allStrategies: PairStrategy[] = [];

  for (const p of pairs) {
    const JOB_KEY = getJobKey(p);
    const { data: jobRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
    if (!jobRow) { console.log(`[GA-BATCH] No job found for ${p}, skipping`); continue; }
    const job = jobRow.payload as Record<string, unknown>;
    if (job.status !== "complete" && job.status !== "extracting") {
      console.log(`[GA-BATCH] Job for ${p} is '${job.status}', skipping`); continue;
    }

    const population = job.population as { dna: StrategyDNA; fitness: number }[];
    const isSplit = (job.isSplit as number) || 0;
    const baseDailyReturns = job.baseDailyReturns as number[];

    const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${p}`).eq("memory_type", "ga_dataset").maybeSingle();
    if (!barsRow) continue;
    const bars = barsRow.payload as BarArrays;

    const seen = new Set<string>();
    nameCounter = 0;
    for (const ind of population.slice(0, 30)) {
      const d = ind.dna;
      const key = `${d.rsiMode}-${d.macdMode}-${d.bbMode}-${d.emaMode}-${d.adxMode}-${d.stochMode}-${d.cciMode}-${d.donchianMode}-${d.paMode}-${d.direction}-${d.sessionFilter}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sim = simulateStrategy(bars, ind.dna);
      if (sim.trades < 50) continue; // ≥ 50 trades required

      const isSim = isSplit < bars.count ? simulateStrategy(bars, ind.dna, 0, isSplit) : sim;
      const oosSim = isSplit < bars.count ? simulateStrategy(bars, ind.dna, isSplit) : undefined;

      // OOS Survival Filter
      if (oosSim && oosSim.trades >= 5) {
        if (oosSim.profitFactor < 1.2) continue;
        if (isSim.maxDrawdown > 0.001 && oosSim.maxDrawdown > isSim.maxDrawdown * 2) continue;
      }

      const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));

      const maxPts = 100;
      const stride = Math.max(1, Math.ceil(sim.equityCurve.length / maxPts));
      const dsCurve = sim.equityCurve.filter((_, i) => i % stride === 0);

      allStrategies.push({
        pair: p,
        dna: ind.dna, fitness: ind.fitness,
        sim: { ...sim, equityCurve: dsCurve },
        correlation: corr,
        strategyName: generateStrategyName(ind.dna),
        edgeDescription: generateEdgeDescription(ind.dna),
        entryRules: generateEntryRules(ind.dna),
        exitRules: generateExitRules(ind.dna),
        edgeArchetype: getEdgeArchetype(ind.dna),
        oosReturn: oosSim ? Math.round(oosSim.totalReturn * 100) / 100 : null,
        oosWinRate: oosSim ? Math.round(oosSim.winRate * 10000) / 10000 : null,
        oosTrades: oosSim?.trades ?? null,
        oosProfitFactor: oosSim ? Math.round(oosSim.profitFactor * 100) / 100 : null,
        oosMaxDrawdown: oosSim ? Math.round(oosSim.maxDrawdown * 10000) / 10000 : null,
        isReturn: isSim ? Math.round(isSim.totalReturn * 100) / 100 : null,
        isWinRate: isSim ? Math.round(isSim.winRate * 10000) / 10000 : null,
        isTrades: isSim?.trades ?? null,
        isProfitFactor: isSim ? Math.round(isSim.profitFactor * 100) / 100 : null,
        isMaxDrawdown: isSim ? Math.round(isSim.maxDrawdown * 10000) / 10000 : null,
        equityCurve: dsCurve,
      });
    }
  }

  console.log(`[GA-BATCH] ${allStrategies.length} candidate strategies from ${pairs.length} pairs`);
  allStrategies.sort((a, b) => b.sim.totalReturn - a.sim.totalReturn);

  const selected: PairStrategy[] = [];
  const pairCounts: Record<string, number> = {};
  const MAX_PER_PAIR = 2;

  for (const strat of allStrategies) {
    if (selected.length >= topN) break;
    const pc = pairCounts[strat.pair] || 0;
    if (pc >= MAX_PER_PAIR) continue;
    // OOS survival filter already applied during extraction — no need for extra return check

    let uncorrelated = true;
    for (const existing of selected) {
      const interCorr = Math.abs(pearsonCorrelation(strat.sim.dailyReturns, existing.sim.dailyReturns));
      if (interCorr > maxInterCorr) { uncorrelated = false; break; }
    }
    if (!uncorrelated) continue;

    selected.push(strat);
    pairCounts[strat.pair] = pc + 1;
  }

  if (selected.length < topN) {
    for (const strat of allStrategies) {
      if (selected.length >= topN) break;
      if (selected.includes(strat)) continue;
      const pc = pairCounts[strat.pair] || 0;
      if (pc >= 3) continue;
      let ok = true;
      for (const existing of selected) {
        if (Math.abs(pearsonCorrelation(strat.sim.dailyReturns, existing.sim.dailyReturns)) > 0.6) { ok = false; break; }
      }
      if (!ok) continue;
      selected.push(strat);
      pairCounts[strat.pair] = pc + 1;
    }
  }

  console.log(`[GA-BATCH] Selected ${selected.length} uncorrelated strategies across ${Object.keys(pairCounts).length} pairs`);

  const fmt = (s: PairStrategy) => ({
    pair: s.pair, dna: s.dna,
    fitness: Math.round(s.fitness * 1000) / 1000,
    winRate: Math.round(s.sim.winRate * 10000) / 10000,
    profitFactor: Math.round(s.sim.profitFactor * 100) / 100,
    trades: s.sim.trades,
    totalPips: Math.round(s.sim.totalPips * 10) / 10,
    totalReturn: Math.round(s.sim.totalReturn * 100) / 100,
    maxDrawdown: Math.round(s.sim.maxDrawdown * 10000) / 10000,
    grossProfit: Math.round(s.sim.grossProfit * 10) / 10,
    grossLoss: Math.round(s.sim.grossLoss * 10) / 10,
    sharpe: Math.round((s.sim.sharpe || 0) * 100) / 100,
    correlation: Math.round(s.correlation * 1000) / 1000,
    equityCurve: s.equityCurve,
    strategyName: s.strategyName,
    edgeDescription: s.edgeDescription,
    entryRules: s.entryRules,
    exitRules: s.exitRules,
    edgeArchetype: s.edgeArchetype,
    oosReturn: s.oosReturn,
    oosWinRate: s.oosWinRate,
    oosTrades: s.oosTrades,
  });

  return {
    action: "batch-extract",
    totalCandidates: allStrategies.length,
    pairsProcessed: pairs.length,
    selected: selected.length,
    pairDistribution: pairCounts,
    maxInterCorrelation: maxInterCorr,
    top7: selected.map(fmt),
    allCandidates: allStrategies.slice(0, 30).map(fmt),
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
      case "evolve": result = await handlePhase2(body as Record<string, unknown>); break;
      case "extract": result = await handlePhase3(body as Record<string, unknown>); break;
      case "status": result = await handleStatus(body as Record<string, unknown>); break;
      case "batch-extract": result = await handleBatchExtract(body as Record<string, unknown>); break;
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
