// Alpha Discovery Engine v7.0 — Novel Micro-Structure Alpha Mining
// Replaces ALL traditional indicators (RSI, MACD, BB, EMA, ADX, Stoch, CCI, Donchian)
// with 8 creative micro-structure features:
//   1. Efficiency Ratio (Kaufman) — trend quality measurement
//   2. Close Location Value (CLV) — intra-bar positioning
//   3. Range Expansion/Contraction — volatility cycling
//   4. Consecutive Direction — momentum exhaustion/continuation
//   5. Volume Delta — buy/sell pressure imbalance
//   6. Fractal Dimension — market roughness/smoothness
//   7. Gap Momentum — inter-bar gap patterns
//   8. Candle Anatomy — body/wick structural analysis
//
// High-frequency design: TRADE_COOLDOWN=1, MIN_TRADES=150
// Phase 1: Regime Classification + novel feature computation
// Phase 2: GA evolution with novel genome
// Phase 3: Extract top strategies

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// ── Types ──────────────────────────────────────────────────────────────────
interface Candle { time: string; volume: number; high: number; low: number; open: number; close: number; }

// Novel DNA — 24 genes (down from 34)
interface StrategyDNA {
  // Efficiency Ratio (Kaufman)
  erPeriod: number; erMode: number; // 0=off, 1=high-ER breakout, 2=low-ER reversion, 3=ER acceleration
  // Close Location Value
  clvSmooth: number; clvMode: number; // 0=off, 1=extreme CLV reversal, 2=CLV trend, 3=CLV divergence
  // Range Expansion/Contraction
  rangeExpPeriod: number; rangeExpMode: number; // 0=off, 1=expansion breakout, 2=contraction squeeze, 3=range acceleration
  // Consecutive Direction
  consecThreshold: number; consecMode: number; // 0=off, 1=exhaustion fade, 2=momentum follow, 3=direction change
  // Volume Delta
  volDeltaPeriod: number; volDeltaMode: number; // 0=off, 1=delta breakout, 2=delta divergence, 3=delta acceleration
  // Fractal Dimension
  fdPeriod: number; fdMode: number; // 0=off, 1=low-FD trend, 2=high-FD reversion, 3=FD shift
  // Gap Momentum
  gapMode: number; // 0=off, 1=gap-and-go, 2=gap-fill fade, 3=large-gap filter
  // Candle Anatomy
  candleMode: number; // 0=off, 1=strong-body momentum, 2=indecision breakout, 3=rejection reversal
  // Filters
  volMode: number; sessionFilter: number; dayFilter: number; direction: number;
  // Risk
  slMultiplier: number; tpMultiplier: number;
  // Hurst
  hurstMin: number; hurstMax: number;
  // Advanced exits
  trailingATR: number;
  maxBarsInTrade: number;
  partialTP: number;
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

// Market Regime Classification
type RegimeTag = 0 | 1 | 2;
const REGIME_TREND: RegimeTag = 0;
const REGIME_RANGE: RegimeTag = 1;
const REGIME_SHOCK: RegimeTag = 2;
const REGIME_LABELS = ['TREND', 'RANGE', 'SHOCK'] as const;

// Feature arrays — novel micro-structure indicators
interface BarArrays {
  close: number[]; high: number[]; low: number[]; open: number[];
  atr: number[];
  // Novel indicators
  efficiencyRatio8: number[];  efficiencyRatio13: number[]; efficiencyRatio21: number[];
  clvRaw: number[]; clvSmooth5: number[]; clvSmooth10: number[];
  rangeRatio8: number[]; rangeRatio13: number[]; rangeRatio21: number[];
  consecUp: number[]; consecDown: number[];
  volDelta5: number[]; volDelta10: number[]; volDelta20: number[];
  fractalDim10: number[]; fractalDim20: number[];
  gapSize: number[]; gapDirection: number[];
  bodyRatio: number[]; upperWickRatio: number[]; lowerWickRatio: number[];
  isDoji: number[]; isHammer: number[]; isShootingStar: number[];
  // Regime support (EMA/ATR for regime classification only)
  ema21Internal: number[];
  adx14Internal: number[];
  // Original filters
  volRatio: number[]; session: number[]; dayOfWeek: number[];
  hurst: number[]; volBucket: number[]; isLongBias: number[];
  mfeLong: number[]; maeLong: number[]; mfeShort: number[]; maeShort: number[];
  barHigh: number[]; barLow: number[];
  isJPY: number[];
  regimeTag: RegimeTag[];
  count: number;
}

// ── Core Indicator Calculations (kept for regime + risk) ───────────────────

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

// ADX for regime classification only
function computeADXInternal(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const adx = new Array(n).fill(0);
  const plusDI = new Array(n).fill(0);
  const minusDI = new Array(n).fill(0);
  if (n < period * 2) return adx;

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
  return adx;
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

// ── Novel Indicator Computations ──────────────────────────────────────────

/** Kaufman Efficiency Ratio: |net movement| / total path length */
function computeEfficiencyRatio(closes: number[], period: number): number[] {
  const n = closes.length;
  const er = new Array(n).fill(0.5);
  for (let i = period; i < n; i++) {
    const netChange = Math.abs(closes[i] - closes[i - period]);
    let totalPath = 0;
    for (let j = i - period + 1; j <= i; j++) {
      totalPath += Math.abs(closes[j] - closes[j - 1]);
    }
    er[i] = totalPath > 0 ? netChange / totalPath : 0;
  }
  return er;
}

/** Close Location Value: where close sits within H-L range, [-1 to +1] */
function computeCLV(candles: Candle[]): number[] {
  return candles.map(c => {
    const range = c.high - c.low;
    if (range <= 0) return 0;
    return (2 * c.close - c.high - c.low) / range;
  });
}

/** Range Ratio: current bar range / SMA(range, period) */
function computeRangeRatio(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const rr = new Array(n).fill(1);
  for (let i = period; i < n; i++) {
    let avgRange = 0;
    for (let j = i - period; j < i; j++) {
      avgRange += candles[j].high - candles[j].low;
    }
    avgRange /= period;
    const curRange = candles[i].high - candles[i].low;
    rr[i] = avgRange > 0 ? curRange / avgRange : 1;
  }
  return rr;
}

/** Consecutive direction counts */
function computeConsecutive(candles: Candle[]): { up: number[]; down: number[] } {
  const n = candles.length;
  const up = new Array(n).fill(0);
  const down = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (candles[i].close > candles[i].open) {
      up[i] = up[i - 1] + 1;
      down[i] = 0;
    } else if (candles[i].close < candles[i].open) {
      down[i] = down[i - 1] + 1;
      up[i] = 0;
    } else {
      up[i] = 0;
      down[i] = 0;
    }
  }
  return { up, down };
}

/** Volume Delta: cumulative (up-volume - down-volume) over N bars */
function computeVolumeDelta(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const vd = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    let delta = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const isUp = candles[j].close >= candles[j].open;
      delta += isUp ? candles[j].volume : -candles[j].volume;
    }
    // Normalize by total volume in window
    let totalVol = 0;
    for (let j = i - period + 1; j <= i; j++) totalVol += candles[j].volume;
    vd[i] = totalVol > 0 ? delta / totalVol : 0; // -1 to +1
  }
  return vd;
}

/** Fractal Dimension (Higuchi-inspired): measures market roughness, 1.0=smooth trend, 2.0=pure noise */
function computeFractalDimension(closes: number[], period: number): number[] {
  const n = closes.length;
  const fd = new Array(n).fill(1.5);
  for (let i = period; i < n; i++) {
    // Use two scales: k=1 and k=period/2
    let L1 = 0, L2 = 0;
    const halfP = Math.max(2, Math.floor(period / 2));
    for (let j = i - period + 2; j <= i; j++) {
      L1 += Math.abs(closes[j] - closes[j - 1]);
    }
    L1 = (L1 * (period - 1)) / (period - 1);
    for (let j = i - period + halfP + 1; j <= i; j += halfP) {
      if (j - halfP >= i - period) L2 += Math.abs(closes[j] - closes[j - halfP]);
    }
    const numSteps = Math.floor((period - 1) / halfP);
    if (numSteps > 0) L2 = (L2 * (period - 1)) / (numSteps * halfP);
    if (L2 > 0 && L1 > 0) {
      fd[i] = Math.log(L1 / L2) / Math.log(halfP) + 1;
      fd[i] = Math.max(1.0, Math.min(2.0, fd[i]));
    }
  }
  return fd;
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

// ── Build Novel Feature Arrays ──────────────────────────────────────────
function buildFeatureArrays(pair: string, candles: Candle[]): BarArrays {
  const isJPY = pair.includes('JPY') ? 1 : 0;
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  // Core (for regime + risk)
  const atrs = computeATR(candles, 14);
  const ema21 = computeEMA(closes, 21);
  const adx14 = computeADXInternal(candles, 14);

  // Novel indicators
  const er8 = computeEfficiencyRatio(closes, 8);
  const er13 = computeEfficiencyRatio(closes, 13);
  const er21 = computeEfficiencyRatio(closes, 21);
  const clvRaw = computeCLV(candles);
  const clvSmooth5 = computeEMA(clvRaw, 5);
  const clvSmooth10 = computeEMA(clvRaw, 10);
  const rr8 = computeRangeRatio(candles, 8);
  const rr13 = computeRangeRatio(candles, 13);
  const rr21 = computeRangeRatio(candles, 21);
  const consec = computeConsecutive(candles);
  const vd5 = computeVolumeDelta(candles, 5);
  const vd10 = computeVolumeDelta(candles, 10);
  const vd20 = computeVolumeDelta(candles, 20);
  const fd10 = computeFractalDimension(closes, 10);
  const fd20 = computeFractalDimension(closes, 20);

  // Volume ratio for filter
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

  const START = 100; // Reduced from 200 since we use shorter-period indicators
  const bars: BarArrays = {
    close: [], high: [], low: [], open: [], atr: [],
    efficiencyRatio8: [], efficiencyRatio13: [], efficiencyRatio21: [],
    clvRaw: [], clvSmooth5: [], clvSmooth10: [],
    rangeRatio8: [], rangeRatio13: [], rangeRatio21: [],
    consecUp: [], consecDown: [],
    volDelta5: [], volDelta10: [], volDelta20: [],
    fractalDim10: [], fractalDim20: [],
    gapSize: [], gapDirection: [],
    bodyRatio: [], upperWickRatio: [], lowerWickRatio: [],
    isDoji: [], isHammer: [], isShootingStar: [],
    ema21Internal: [], adx14Internal: [],
    volRatio: [], session: [], dayOfWeek: [],
    hurst: [], volBucket: [], isLongBias: [],
    mfeLong: [], maeLong: [], mfeShort: [], maeShort: [],
    barHigh: [], barLow: [],
    isJPY: [],
    regimeTag: [],
    count: 0,
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

    // Gap analysis
    const gap = i > 0 ? candles[i].open - candles[i - 1].close : 0;
    const gapNorm = currentATR > 0 ? gap / currentATR : 0;

    // Candle anatomy
    const candleRange = candles[i].high - candles[i].low;
    const body = Math.abs(candles[i].close - candles[i].open);
    const upperWick = candles[i].high - Math.max(candles[i].open, candles[i].close);
    const lowerWick = Math.min(candles[i].open, candles[i].close) - candles[i].low;
    const bRatio = candleRange > 0 ? body / candleRange : 0;
    const uwRatio = candleRange > 0 ? upperWick / candleRange : 0;
    const lwRatio = candleRange > 0 ? lowerWick / candleRange : 0;
    const isDoji = bRatio < 0.15 ? 1 : 0;
    const isHammer = lwRatio > 0.6 && bRatio < 0.3 ? 1 : 0;
    const isShootingStar = uwRatio > 0.6 && bRatio < 0.3 ? 1 : 0;

    bars.close.push(closes[i]); bars.high.push(candles[i].high);
    bars.low.push(candles[i].low); bars.open.push(candles[i].open);
    bars.atr.push(currentATR);

    bars.efficiencyRatio8.push(er8[i]); bars.efficiencyRatio13.push(er13[i]); bars.efficiencyRatio21.push(er21[i]);
    bars.clvRaw.push(clvRaw[i]); bars.clvSmooth5.push(clvSmooth5[i]); bars.clvSmooth10.push(clvSmooth10[i]);
    bars.rangeRatio8.push(rr8[i]); bars.rangeRatio13.push(rr13[i]); bars.rangeRatio21.push(rr21[i]);
    bars.consecUp.push(consec.up[i]); bars.consecDown.push(consec.down[i]);
    bars.volDelta5.push(vd5[i]); bars.volDelta10.push(vd10[i]); bars.volDelta20.push(vd20[i]);
    bars.fractalDim10.push(fd10[i]); bars.fractalDim20.push(fd20[i]);
    bars.gapSize.push(Math.abs(gapNorm)); bars.gapDirection.push(gapNorm > 0 ? 1 : gapNorm < 0 ? -1 : 0);
    bars.bodyRatio.push(bRatio); bars.upperWickRatio.push(uwRatio); bars.lowerWickRatio.push(lwRatio);
    bars.isDoji.push(isDoji); bars.isHammer.push(isHammer); bars.isShootingStar.push(isShootingStar);
    bars.ema21Internal.push(ema21[i]); bars.adx14Internal.push(adx14[i]);
    bars.barHigh.push(candles[i].high); bars.barLow.push(candles[i].low);

    bars.volRatio.push(Math.round(vr * 100) / 100);
    bars.session.push(getSession(candles[i].time));
    bars.dayOfWeek.push(getDayOfWeek(candles[i].time));
    bars.hurst.push(hurst); bars.volBucket.push(volBucket); bars.isLongBias.push(isLongBias);
    bars.mfeLong.push(mfeLong); bars.maeLong.push(maeLong);
    bars.mfeShort.push(mfeShort); bars.maeShort.push(maeShort);
    bars.isJPY.push(isJPY);

    // ── Regime Classification ──
    const ema20Val = ema21[i];
    const ema20Prev = i >= 5 ? ema21[i - 5] : ema20Val;
    const emaSlope = ema20Val > 0 ? ((ema20Val - ema20Prev) / ema20Val) * 100 : 0;
    const slopeThreshold = 0.05;

    const ATR_AVG_LOOKBACK = Math.min(672, i);
    let atrAvg = currentATR;
    if (ATR_AVG_LOOKBACK > 20) {
      let atrSum = 0;
      const sliceStart = bars.atr.length - ATR_AVG_LOOKBACK;
      const sliceEnd = bars.atr.length;
      for (let k = Math.max(0, sliceStart); k < sliceEnd; k++) atrSum += bars.atr[k];
      atrAvg = atrSum / (sliceEnd - Math.max(0, sliceStart)) || currentATR;
    }
    const atrRatio = atrAvg > 0 ? currentATR / atrAvg : 1;
    const atrExpanding = atrRatio > 1.15;
    const adxVal = adx14[i];

    let regime: RegimeTag;
    if (atrRatio > 2.0) {
      regime = REGIME_SHOCK;
    } else if (Math.abs(emaSlope) > slopeThreshold && atrExpanding && adxVal > 25) {
      regime = REGIME_TREND;
    } else if (adxVal < 20 || Math.abs(emaSlope) < slopeThreshold * 0.5) {
      regime = REGIME_RANGE;
    } else {
      regime = REGIME_TREND;
    }
    bars.regimeTag.push(regime);

    bars.count++;
  }

  return bars;
}

// ── Entry Evaluation — Novel Micro-Structure Logic ───────────────────────

function getER(bars: BarArrays, i: number, period: number): number {
  if (period <= 10) return bars.efficiencyRatio8[i];
  if (period <= 17) return bars.efficiencyRatio13[i];
  return bars.efficiencyRatio21[i];
}

function getCLV(bars: BarArrays, i: number, smooth: number): number {
  if (smooth <= 7) return bars.clvSmooth5[i];
  return bars.clvSmooth10[i];
}

function getRangeRatio(bars: BarArrays, i: number, period: number): number {
  if (period <= 10) return bars.rangeRatio8[i];
  if (period <= 17) return bars.rangeRatio13[i];
  return bars.rangeRatio21[i];
}

function getVolDelta(bars: BarArrays, i: number, period: number): number {
  if (period <= 7) return bars.volDelta5[i];
  if (period <= 15) return bars.volDelta10[i];
  return bars.volDelta20[i];
}

function getFD(bars: BarArrays, i: number, period: number): number {
  return period <= 15 ? bars.fractalDim10[i] : bars.fractalDim20[i];
}

function evaluateEntry(bars: BarArrays, i: number, dna: StrategyDNA): { long: boolean; short: boolean } {
  let longSignals = 0, shortSignals = 0;
  let activeIndicators = 0;

  // 1. Efficiency Ratio
  if (dna.erMode > 0) {
    activeIndicators++;
    const er = getER(bars, i, dna.erPeriod);
    const prevER = i > 0 ? getER(bars, i - 1, dna.erPeriod) : er;
    if (dna.erMode === 1) {
      // High ER = trending: trade in direction of price move
      if (er > 0.55) {
        if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++;
        else shortSignals++;
      }
    } else if (dna.erMode === 2) {
      // Low ER = choppy: mean-revert
      if (er < 0.35) {
        if (bars.close[i] < bars.close[Math.max(0, i - 3)]) longSignals++; // buy dips
        else shortSignals++; // sell rallies
      }
    } else if (dna.erMode === 3) {
      // ER acceleration: ER rising = trend forming
      if (er > prevER + 0.05) {
        if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++;
      }
    }
  }

  // 2. Close Location Value
  if (dna.clvMode > 0) {
    activeIndicators++;
    const clv = getCLV(bars, i, dna.clvSmooth);
    if (dna.clvMode === 1) {
      // Extreme CLV reversal
      if (clv < -0.6) longSignals++;
      if (clv > 0.6) shortSignals++;
    } else if (dna.clvMode === 2) {
      // CLV trend following
      if (clv > 0.2) longSignals++;
      if (clv < -0.2) shortSignals++;
    } else if (dna.clvMode === 3) {
      // CLV divergence: CLV opposite to recent price direction
      const priceUp = bars.close[i] > bars.close[Math.max(0, i - 5)];
      if (priceUp && clv < -0.3) shortSignals++; // bearish divergence
      if (!priceUp && clv > 0.3) longSignals++; // bullish divergence
    }
  }

  // 3. Range Expansion/Contraction
  if (dna.rangeExpMode > 0) {
    activeIndicators++;
    const rr = getRangeRatio(bars, i, dna.rangeExpPeriod);
    const prevRR = i > 0 ? getRangeRatio(bars, i - 1, dna.rangeExpPeriod) : rr;
    if (dna.rangeExpMode === 1) {
      // Expansion breakout: big bar = momentum
      if (rr > 1.5) {
        if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++;
      }
    } else if (dna.rangeExpMode === 2) {
      // Contraction squeeze: tiny bar = about to break
      if (rr < 0.5 && i > 0) {
        // Trade the break direction of the NEXT bar's bias
        if (bars.isLongBias[i]) longSignals++; else shortSignals++;
      }
    } else if (dna.rangeExpMode === 3) {
      // Range acceleration: expanding from contraction
      if (rr > 1.2 && prevRR < 0.8) {
        if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++;
      }
    }
  }

  // 4. Consecutive Direction
  if (dna.consecMode > 0) {
    activeIndicators++;
    const cUp = bars.consecUp[i];
    const cDown = bars.consecDown[i];
    const threshold = dna.consecThreshold;
    if (dna.consecMode === 1) {
      // Exhaustion fade: too many same-direction bars = reversal
      if (cUp >= threshold) shortSignals++;
      if (cDown >= threshold) longSignals++;
    } else if (dna.consecMode === 2) {
      // Momentum continuation: streak = strength
      if (cUp >= 2) longSignals++;
      if (cDown >= 2) shortSignals++;
    } else if (dna.consecMode === 3) {
      // Direction change trigger: streak just broke
      if (cUp === 1 && i > 0 && bars.consecDown[i - 1] >= threshold) longSignals++;
      if (cDown === 1 && i > 0 && bars.consecUp[i - 1] >= threshold) shortSignals++;
    }
  }

  // 5. Volume Delta
  if (dna.volDeltaMode > 0) {
    activeIndicators++;
    const vd = getVolDelta(bars, i, dna.volDeltaPeriod);
    const prevVD = i > 0 ? getVolDelta(bars, i - 1, dna.volDeltaPeriod) : vd;
    if (dna.volDeltaMode === 1) {
      // Delta breakout: strong positive = buying pressure
      if (vd > 0.3) longSignals++;
      if (vd < -0.3) shortSignals++;
    } else if (dna.volDeltaMode === 2) {
      // Delta divergence: price up but volume selling
      const priceUp = bars.close[i] > bars.close[Math.max(0, i - 3)];
      if (priceUp && vd < -0.15) shortSignals++; // bearish divergence
      if (!priceUp && vd > 0.15) longSignals++; // bullish divergence
    } else if (dna.volDeltaMode === 3) {
      // Delta acceleration
      if (vd > prevVD + 0.1) longSignals++;
      if (vd < prevVD - 0.1) shortSignals++;
    }
  }

  // 6. Fractal Dimension
  if (dna.fdMode > 0) {
    activeIndicators++;
    const fd = getFD(bars, i, dna.fdPeriod);
    const prevFD = i > 0 ? getFD(bars, i - 1, dna.fdPeriod) : fd;
    if (dna.fdMode === 1) {
      // Low FD = smooth trend: trade trend direction
      if (fd < 1.4) {
        if (bars.close[i] > bars.close[Math.max(0, i - 5)]) longSignals++; else shortSignals++;
      }
    } else if (dna.fdMode === 2) {
      // High FD = choppy: mean revert
      if (fd > 1.6) {
        if (bars.close[i] < bars.close[Math.max(0, i - 5)]) longSignals++; else shortSignals++;
      }
    } else if (dna.fdMode === 3) {
      // FD regime shift: sudden drop in FD = trend starting
      if (fd < prevFD - 0.1) {
        if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++;
      }
    }
  }

  // 7. Gap Momentum
  if (dna.gapMode > 0) {
    activeIndicators++;
    const gapDir = bars.gapDirection[i];
    const gapSz = bars.gapSize[i];
    if (dna.gapMode === 1) {
      // Gap-and-go: trade in gap direction
      if (gapSz > 0.3) {
        if (gapDir > 0) longSignals++; else shortSignals++;
      }
    } else if (dna.gapMode === 2) {
      // Gap-fill fade: trade against gap
      if (gapSz > 0.3) {
        if (gapDir > 0) shortSignals++; else longSignals++;
      }
    } else if (dna.gapMode === 3) {
      // Large gap only filter
      if (gapSz > 0.8) {
        if (gapDir > 0) longSignals++; else shortSignals++;
      }
    }
  }

  // 8. Candle Anatomy
  if (dna.candleMode > 0) {
    activeIndicators++;
    if (dna.candleMode === 1) {
      // Strong body momentum: big body = conviction
      if (bars.bodyRatio[i] > 0.7) {
        if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++;
      }
    } else if (dna.candleMode === 2) {
      // Indecision then breakout: doji → next bar direction
      if (bars.isDoji[i] === 1) {
        if (bars.isLongBias[i]) longSignals++; else shortSignals++;
      }
    } else if (dna.candleMode === 3) {
      // Rejection reversal: hammer/shooting star
      if (bars.isHammer[i] === 1) longSignals++;
      if (bars.isShootingStar[i] === 1) shortSignals++;
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

  // Relaxed threshold: just need 1 signal from active indicators for high frequency
  const threshold = activeIndicators === 1 ? 1 : Math.ceil(activeIndicators * 0.5);
  const isLong = longSignals >= threshold && longSignals > shortSignals;
  const isShort = shortSignals >= threshold && shortSignals > longSignals;

  if (dna.direction === 0) return { long: isLong, short: false };
  if (dna.direction === 1) return { long: false, short: isShort };
  return { long: isLong, short: isShort };
}

// ── Simulation Engine ─────────────────────────────────────────────────────
// targetRegime: if set, only open trades when bar's regime matches
function simulateStrategy(bars: BarArrays, dna: StrategyDNA, startIdx = 0, endIdx?: number, targetRegime = -1): SimResult {
  const START_EQ = 1000;
  const RISK_PER_TRADE = 0.01;
  const TRADE_COOLDOWN = 1; // High frequency: only 1-bar cooldown
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

    // Regime gate
    if (targetRegime >= 0 && bars.regimeTag[i] !== targetRegime) continue;

    const sl = bars.atr[i] * dna.slMultiplier;
    const tp = bars.atr[i] * dna.tpMultiplier;
    const pipMult = bars.isJPY[i] ? 100 : 10000;

    let pips: number;

    if (hasTrailing || hasMaxBars || hasPartialTP) {
      const entryPrice = bars.close[i];
      const trailATR = hasTrailing ? bars.atr[i] * dna.trailingATR : 0;
      const maxBars = hasMaxBars ? Math.round(dna.maxBarsInTrade) : 999;
      let trailStop = isLong ? entryPrice - sl : entryPrice + sl;
      const tpPrice = isLong ? entryPrice + tp : entryPrice - tp;
      let partialFilled = false;
      let remainingPct = 1.0;
      let partialPips = 0;
      let exitPips = 0;
      let exited = false;

      for (let b = 1; b <= Math.min(16, maxBars) && (i + b) < end; b++) {
        const barH = bars.barHigh[i + b];
        const barL = bars.barLow[i + b];

        if (hasPartialTP && !partialFilled) {
          const partial1R = isLong ? entryPrice + sl : entryPrice - sl;
          if ((isLong && barH >= partial1R) || (!isLong && barL <= partial1R)) {
            const partialSize = dna.partialTP === 1 ? 0.5 : 0.33;
            partialPips += sl * pipMult * partialSize;
            remainingPct -= partialSize;
            partialFilled = true;
            trailStop = entryPrice;
          }
        }

        if (hasTrailing) {
          if (isLong) {
            const newTrail = barH - trailATR;
            if (newTrail > trailStop) trailStop = newTrail;
          } else {
            const newTrail = barL + trailATR;
            if (newTrail < trailStop) trailStop = newTrail;
          }
        }

        if ((isLong && barH >= tpPrice) || (!isLong && barL <= tpPrice)) {
          exitPips = tp * pipMult * remainingPct;
          exited = true; break;
        }
        if ((isLong && barL <= trailStop) || (!isLong && barH >= trailStop)) {
          const slDist = isLong ? (trailStop - entryPrice) : (entryPrice - trailStop);
          exitPips = slDist * pipMult * remainingPct;
          exited = true; break;
        }
        if (b >= maxBars) {
          const exitPrice = bars.close[Math.min(i + b, end - 1)];
          const dist = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          exitPips = dist * pipMult * remainingPct;
          exited = true; break;
        }
      }

      if (!exited) {
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

    // ── JPY-safe position sizing ──
    // For JPY pairs, pipMult=100 produces ~100x smaller pip values than non-JPY (pipMult=10000).
    // Normalize so dollarPerPip is comparable across all pairs.
    const isJPYTrade = bars.isJPY[i] === 1;
    const dollarRisk = equity * RISK_PER_TRADE;
    const slPips = sl * pipMult;
    const dollarPerPip = slPips > 0 ? dollarRisk / slPips : 0.10;
    // Cap max gain/loss per trade to 10% of equity to prevent compounding overflow
    const maxPnl = equity * 0.10;
    const rawPnl = pips * dollarPerPip;
    const clampedPnl = Math.max(-maxPnl, Math.min(maxPnl, rawPnl));
    equity += clampedPnl;

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

const ER_PERIODS = [8, 13, 21];
const CLV_SMOOTHS = [5, 10];
const RANGE_EXP_PERIODS = [8, 13, 21];
const CONSEC_THRESHOLDS = [2, 3, 4, 5];
const VOL_DELTA_PERIODS = [5, 10, 20];
const FD_PERIODS = [10, 20];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randRange(min: number, max: number): number { return min + Math.random() * (max - min); }

const MAX_ACTIVE_INDICATORS = 3;

/** Count active novel indicator modes */
function countActiveIndicators(dna: StrategyDNA): number {
  let count = 0;
  if (dna.erMode > 0) count++;
  if (dna.clvMode > 0) count++;
  if (dna.rangeExpMode > 0) count++;
  if (dna.consecMode > 0) count++;
  if (dna.volDeltaMode > 0) count++;
  if (dna.fdMode > 0) count++;
  if (dna.gapMode > 0) count++;
  if (dna.candleMode > 0) count++;
  return count;
}

/** Enforce max indicator cap */
function enforceIndicatorCap(dna: StrategyDNA): StrategyDNA {
  const d = { ...dna };
  const modeKeys: (keyof StrategyDNA)[] = [
    'erMode', 'clvMode', 'rangeExpMode', 'consecMode',
    'volDeltaMode', 'fdMode', 'gapMode', 'candleMode',
  ];
  let active = modeKeys.filter(k => (d[k] as number) > 0);
  while (active.length > MAX_ACTIVE_INDICATORS) {
    const removeIdx = Math.floor(Math.random() * active.length);
    (d as Record<string, number>)[active[removeIdx] as string] = 0;
    active.splice(removeIdx, 1);
  }
  return d;
}

// Novel archetypes — each uses max 2-3 novel indicators
const ARCHETYPES: Partial<StrategyDNA>[] = [
  // Pure single-indicator
  { erMode: 1, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { erMode: 2, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { erMode: 3, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { clvMode: 1, erMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { clvMode: 2, erMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { rangeExpMode: 1, erMode: 0, clvMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { rangeExpMode: 2, erMode: 0, clvMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { consecMode: 1, erMode: 0, clvMode: 0, rangeExpMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0, consecThreshold: 3 },
  { consecMode: 2, erMode: 0, clvMode: 0, rangeExpMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { volDeltaMode: 1, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, fdMode: 0, gapMode: 0, candleMode: 0 },
  { fdMode: 1, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, gapMode: 0, candleMode: 0 },
  { fdMode: 2, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, gapMode: 0, candleMode: 0 },
  { candleMode: 1, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0 },
  { candleMode: 3, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, gapMode: 0 },
  { gapMode: 1, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, candleMode: 0 },
  { gapMode: 2, erMode: 0, clvMode: 0, rangeExpMode: 0, consecMode: 0, volDeltaMode: 0, fdMode: 0, candleMode: 0 },
  // Creative combos (2 indicators)
  { erMode: 1, candleMode: 1 }, // Efficiency breakout + strong body
  { erMode: 2, clvMode: 1 },    // Low efficiency + extreme CLV reversal
  { clvMode: 2, consecMode: 2 }, // CLV trend + momentum continuation
  { rangeExpMode: 1, volDeltaMode: 1 }, // Expansion + volume confirmation
  { rangeExpMode: 2, fdMode: 1 },  // Squeeze + smooth trend
  { consecMode: 1, candleMode: 3 }, // Exhaustion + hammer/star reversal
  { volDeltaMode: 2, erMode: 1 },   // Volume divergence + efficiency
  { fdMode: 1, erMode: 1 },         // Smooth trend + high efficiency
  { fdMode: 2, clvMode: 1 },        // Choppy market + CLV reversal
  { gapMode: 1, rangeExpMode: 1 },  // Gap-and-go + range expansion
  { gapMode: 2, consecMode: 1 },    // Gap-fill + exhaustion
  { candleMode: 2, rangeExpMode: 3 }, // Doji breakout + range acceleration
  { candleMode: 3, volDeltaMode: 1 }, // Rejection + volume delta
  // Creative 3-indicator combos
  { erMode: 1, rangeExpMode: 1, candleMode: 1 }, // Triple momentum
  { clvMode: 1, consecMode: 1, fdMode: 2 },       // Reversal trifecta
  { volDeltaMode: 1, erMode: 1, gapMode: 1 },     // Volume + efficiency + gap
  { fdMode: 1, consecMode: 2, candleMode: 1 },    // Trend + continuation + body
  { rangeExpMode: 3, clvMode: 2, volDeltaMode: 3 }, // Acceleration trio
  // Session-filtered
  { erMode: 1, candleMode: 1, sessionFilter: 1 }, // London session
  { clvMode: 1, consecMode: 1, sessionFilter: 2 }, // NY session
  // With advanced exits
  { erMode: 1, candleMode: 1, trailingATR: 1.5 },
  { consecMode: 1, fdMode: 2, maxBarsInTrade: 8 },
  { rangeExpMode: 1, volDeltaMode: 1, partialTP: 1 },
];

function randomDNA(archetype?: Partial<StrategyDNA>): StrategyDNA {
  const base: StrategyDNA = {
    erPeriod: pick(ER_PERIODS), erMode: Math.floor(Math.random() * 4),
    clvSmooth: pick(CLV_SMOOTHS), clvMode: Math.floor(Math.random() * 4),
    rangeExpPeriod: pick(RANGE_EXP_PERIODS), rangeExpMode: Math.floor(Math.random() * 4),
    consecThreshold: pick(CONSEC_THRESHOLDS), consecMode: Math.floor(Math.random() * 4),
    volDeltaPeriod: pick(VOL_DELTA_PERIODS), volDeltaMode: Math.floor(Math.random() * 4),
    fdPeriod: pick(FD_PERIODS), fdMode: Math.floor(Math.random() * 4),
    gapMode: Math.floor(Math.random() * 4),
    candleMode: Math.floor(Math.random() * 4),
    volMode: Math.floor(Math.random() * 4),
    sessionFilter: Math.floor(Math.random() * 5) - 1,
    dayFilter: Math.floor(Math.random() * 6) - 1,
    direction: Math.floor(Math.random() * 3),
    slMultiplier: randRange(0.3, 2.5), tpMultiplier: 0, // will be set below
    hurstMin: Math.random() * 0.5, hurstMax: 0.5 + Math.random() * 0.5,
    trailingATR: Math.random() < 0.3 ? randRange(0.5, 2.5) : 0,
    maxBarsInTrade: Math.random() < 0.3 ? Math.floor(randRange(4, 24)) : 0,
    partialTP: Math.random() < 0.2 ? Math.floor(randRange(1, 3)) : 0,
  };
  // Enforce minimum 1:1 R:R — TP must be >= SL
  base.tpMultiplier = randRange(base.slMultiplier, Math.max(base.slMultiplier * 3, 4.0));
  if (archetype) Object.assign(base, archetype);
  // Re-enforce R:R after archetype override
  if (base.tpMultiplier < base.slMultiplier) base.tpMultiplier = base.slMultiplier * (1 + Math.random());
  return enforceIndicatorCap(base);
}

function crossover(a: StrategyDNA, b: StrategyDNA): StrategyDNA {
  const r = () => Math.random() > 0.5;
  return {
    erPeriod: r() ? a.erPeriod : b.erPeriod, erMode: r() ? a.erMode : b.erMode,
    clvSmooth: r() ? a.clvSmooth : b.clvSmooth, clvMode: r() ? a.clvMode : b.clvMode,
    rangeExpPeriod: r() ? a.rangeExpPeriod : b.rangeExpPeriod, rangeExpMode: r() ? a.rangeExpMode : b.rangeExpMode,
    consecThreshold: r() ? a.consecThreshold : b.consecThreshold, consecMode: r() ? a.consecMode : b.consecMode,
    volDeltaPeriod: r() ? a.volDeltaPeriod : b.volDeltaPeriod, volDeltaMode: r() ? a.volDeltaMode : b.volDeltaMode,
    fdPeriod: r() ? a.fdPeriod : b.fdPeriod, fdMode: r() ? a.fdMode : b.fdMode,
    gapMode: r() ? a.gapMode : b.gapMode,
    candleMode: r() ? a.candleMode : b.candleMode,
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
  if (Math.random() < rate) d.erPeriod = pick(ER_PERIODS);
  if (Math.random() < rate) d.erMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.clvSmooth = pick(CLV_SMOOTHS);
  if (Math.random() < rate) d.clvMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.rangeExpPeriod = pick(RANGE_EXP_PERIODS);
  if (Math.random() < rate) d.rangeExpMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.consecThreshold = pick(CONSEC_THRESHOLDS);
  if (Math.random() < rate) d.consecMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.volDeltaPeriod = pick(VOL_DELTA_PERIODS);
  if (Math.random() < rate) d.volDeltaMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.fdPeriod = pick(FD_PERIODS);
  if (Math.random() < rate) d.fdMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.gapMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.candleMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.volMode = Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.sessionFilter = Math.floor(Math.random() * 5) - 1;
  if (Math.random() < rate) d.dayFilter = Math.floor(Math.random() * 6) - 1;
  if (Math.random() < rate) d.direction = Math.floor(Math.random() * 3);
  if (Math.random() < rate) d.slMultiplier = Math.max(0.2, Math.min(2.5, d.slMultiplier + (Math.random() - 0.5) * 0.5));
  if (Math.random() < rate) d.tpMultiplier = Math.max(0.3, Math.min(4.0, d.tpMultiplier + (Math.random() - 0.5) * 0.8));
  // Enforce minimum 1:1 R:R after mutation
  if (d.tpMultiplier < d.slMultiplier) d.tpMultiplier = d.slMultiplier * (1 + Math.random() * 0.5);
  if (Math.random() < rate) d.hurstMin = Math.max(0, Math.min(0.9, d.hurstMin + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.hurstMax = Math.max(d.hurstMin + 0.1, Math.min(1.0, d.hurstMax + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.trailingATR = Math.random() < 0.3 ? 0 : Math.max(0.5, Math.min(2.5, (d.trailingATR || 1.5) + (Math.random() - 0.5) * 0.6));
  if (Math.random() < rate) d.maxBarsInTrade = Math.random() < 0.3 ? 0 : Math.max(4, Math.min(24, Math.round((d.maxBarsInTrade || 12) + (Math.random() - 0.5) * 8)));
  if (Math.random() < rate) d.partialTP = Math.floor(Math.random() * 3);
  return enforceIndicatorCap(d);
}

function tournamentSelect(pop: { dna: StrategyDNA; fitness: number }[], k = 3): { dna: StrategyDNA; fitness: number } {
  let best: { dna: StrategyDNA; fitness: number } | null = null;
  for (let i = 0; i < k; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best!;
}

// ── Strategy naming & description (Novel indicators) ─────────────────────

let nameCounter = 0;

function generateStrategyName(dna: StrategyDNA): string {
  nameCounter++;

  const indicators: string[] = [];
  if (dna.erMode > 0) indicators.push('ER');
  if (dna.clvMode > 0) indicators.push('CLV');
  if (dna.rangeExpMode > 0) indicators.push('RngX');
  if (dna.consecMode > 0) indicators.push('Consec');
  if (dna.volDeltaMode > 0) indicators.push('VolΔ');
  if (dna.fdMode > 0) indicators.push('FD');
  if (dna.gapMode > 0) indicators.push('Gap');
  if (dna.candleMode > 0) indicators.push('Anatomy');

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
    ER: { 1: 'The Efficiency Breakout Scanner', 2: 'The Chaos Reversion Engine', 3: 'The Efficiency Accelerator' },
    CLV: { 1: 'The Bar Location Reversal', 2: 'The Intra-Bar Trend Rider', 3: 'The CLV Divergence Detector' },
    RngX: { 1: 'The Volatility Expansion Cannon', 2: 'The Squeeze Detonator', 3: 'The Range Acceleration Sniper' },
    Consec: { 1: 'The Exhaustion Fade Machine', 2: 'The Momentum Cascade Rider', 3: 'The Direction Shift Trigger' },
    'VolΔ': { 1: 'The Volume Pressure Breakout', 2: 'The Smart Money Divergence', 3: 'The Delta Acceleration Play' },
    FD: { 1: 'The Fractal Trend Isolator', 2: 'The Roughness Reversion Engine', 3: 'The Dimension Shift Detector' },
    Gap: { 1: 'The Gap-And-Go Momentum', 2: 'The Gap Fill Contrarian', 3: 'The Shock Gap Filter' },
    Anatomy: { 1: 'The Conviction Body Scanner', 2: 'The Indecision Breakout Trap', 3: 'The Wick Rejection Sniper' },
  };

  const comboNames: Record<string, string[]> = {
    'CLV+Consec': ['The Location-Momentum Fusion', 'The CLV Streak Engine'],
    'CLV+ER': ['The Efficiency-Location Hybrid', 'The Bar Intelligence Engine'],
    'CLV+FD': ['The Fractal Reversal Radar', 'The Roughness-Location Engine'],
    'Anatomy+ER': ['The Body-Efficiency Scanner', 'The Conviction Trend Machine'],
    'Anatomy+Consec': ['The Pattern Exhaustion Engine', 'The Body-Streak Reversal'],
    'CLV+RngX': ['The Location-Volatility Engine', 'The Squeeze-Location Hybrid'],
    'Consec+FD': ['The Fractal Streak Machine', 'The Exhaustion Dimension Engine'],
    'ER+Gap': ['The Efficiency Gap Engine', 'The Gap-Trend Momentum'],
    'ER+RngX': ['The Efficiency Expansion Cannon', 'The Trend-Volatility Machine'],
    'ER+VolΔ': ['The Efficiency-Volume Brain', 'The Smart Trend Engine'],
    'FD+RngX': ['The Fractal Squeeze Engine', 'The Dimension-Range Hybrid'],
    'Gap+RngX': ['The Gap Expansion Reactor', 'The Shock Momentum Engine'],
    'RngX+VolΔ': ['The Expansion-Delta Cannon', 'The Volume Breakout Engine'],
    'Anatomy+VolΔ': ['The Body-Delta Intelligence', 'The Smart Conviction Engine'],
    'Consec+Gap': ['The Gap Exhaustion Detector', 'The Streak-Gap Machine'],
    'Gap+VolΔ': ['The Gap Volume Fusion', 'The Smart Gap Engine'],
    'Anatomy+CLV+ER': ['The Triple Micro-Structure Engine', 'The Full Anatomy Scanner'],
    'CLV+Consec+FD': ['The Reversal Trifecta', 'The Exhaustion-Dimension-Location Brain'],
    'ER+Gap+VolΔ': ['The Momentum Intelligence Trifecta', 'The Gap-Delta-Efficiency Engine'],
    'Anatomy+Consec+FD': ['The Pattern Dimension Engine', 'The Exhaustion Anatomy Brain'],
    'CLV+RngX+VolΔ': ['The Acceleration Trio', 'The Location-Expansion-Delta Engine'],
  };

  if (indicators.length === 0) {
    if (filters.length > 0 || exits.length > 0) return `The ${[...filters, ...exits].join(' ')} Anomaly Filter #${nameCounter}`;
    return `The Pure Regime Filter #${nameCounter}`;
  }

  let baseName: string;
  if (indicators.length === 1) {
    const ind = indicators[0];
    const modeKey = ind === 'ER' ? 'erMode' : ind === 'CLV' ? 'clvMode' : ind === 'RngX' ? 'rangeExpMode' :
      ind === 'Consec' ? 'consecMode' : ind === 'VolΔ' ? 'volDeltaMode' : ind === 'FD' ? 'fdMode' :
      ind === 'Gap' ? 'gapMode' : 'candleMode';
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
  if (dna.erMode === 1) parts.push(`Efficiency Ratio(${dna.erPeriod}) > 0.55 = trending breakout`);
  if (dna.erMode === 2) parts.push(`Efficiency Ratio(${dna.erPeriod}) < 0.35 = choppy mean-revert`);
  if (dna.erMode === 3) parts.push(`Efficiency Ratio(${dna.erPeriod}) accelerating = trend forming`);
  if (dna.clvMode === 1) parts.push(`Close Location Value extreme reversal (CLV < -0.6 / > 0.6)`);
  if (dna.clvMode === 2) parts.push(`Close Location Value trend (CLV above/below 0.2)`);
  if (dna.clvMode === 3) parts.push(`CLV divergence from price direction`);
  if (dna.rangeExpMode === 1) parts.push(`Range Expansion > 1.5x = momentum breakout`);
  if (dna.rangeExpMode === 2) parts.push(`Range Contraction < 0.5x = squeeze breakout`);
  if (dna.rangeExpMode === 3) parts.push(`Range accelerating from contraction`);
  if (dna.consecMode === 1) parts.push(`${dna.consecThreshold}+ consecutive bars = exhaustion fade`);
  if (dna.consecMode === 2) parts.push(`2+ consecutive bars = momentum continuation`);
  if (dna.consecMode === 3) parts.push(`Direction change after ${dna.consecThreshold}-bar streak`);
  if (dna.volDeltaMode === 1) parts.push(`Volume Delta(${dna.volDeltaPeriod}) breakout > 0.3 = buying pressure`);
  if (dna.volDeltaMode === 2) parts.push(`Volume Delta divergence from price`);
  if (dna.volDeltaMode === 3) parts.push(`Volume Delta accelerating`);
  if (dna.fdMode === 1) parts.push(`Fractal Dimension(${dna.fdPeriod}) < 1.4 = smooth trend`);
  if (dna.fdMode === 2) parts.push(`Fractal Dimension(${dna.fdPeriod}) > 1.6 = choppy reversion`);
  if (dna.fdMode === 3) parts.push(`Fractal Dimension shift = regime change`);
  if (dna.gapMode === 1) parts.push(`Gap-and-go: trade in gap direction`);
  if (dna.gapMode === 2) parts.push(`Gap-fill: fade the inter-bar gap`);
  if (dna.gapMode === 3) parts.push(`Large shock gap filter`);
  if (dna.candleMode === 1) parts.push(`Strong body > 70% = conviction momentum`);
  if (dna.candleMode === 2) parts.push(`Doji/indecision = breakout trigger`);
  if (dna.candleMode === 3) parts.push(`Hammer/shooting star rejection reversal`);
  if (dna.trailingATR > 0) parts.push(`Trailing stop ${dna.trailingATR.toFixed(1)}× ATR`);
  if (dna.maxBarsInTrade > 0) parts.push(`Time exit after ${Math.round(dna.maxBarsInTrade)} bars`);
  if (dna.partialTP === 1) parts.push(`50% partial TP at 1R then trail`);
  if (dna.partialTP === 2) parts.push(`33% partial TP at each R level`);
  return parts.join(' + ') || 'Pure time/volatility filter';
}

function generateEntryRules(dna: StrategyDNA): string[] {
  const rules: string[] = [];
  if (dna.erMode === 1) rules.push(`Efficiency Ratio(${dna.erPeriod}) > 0.55 → LONG if price rising, SHORT if falling`);
  if (dna.erMode === 2) rules.push(`Efficiency Ratio(${dna.erPeriod}) < 0.35 → LONG on dip, SHORT on rally (mean-revert)`);
  if (dna.erMode === 3) rules.push(`Efficiency Ratio accelerating (+0.05) → trade momentum direction`);
  if (dna.clvMode === 1) rules.push(`Close Location Value < -0.6 → LONG reversal / > 0.6 → SHORT reversal`);
  if (dna.clvMode === 2) rules.push(`CLV(smooth ${dna.clvSmooth}) > 0.2 → LONG trend / < -0.2 → SHORT trend`);
  if (dna.clvMode === 3) rules.push(`CLV diverges from price direction → counter-trend signal`);
  if (dna.rangeExpMode === 1) rules.push(`Bar range > 1.5× average(${dna.rangeExpPeriod}) → momentum breakout trade`);
  if (dna.rangeExpMode === 2) rules.push(`Bar range < 0.5× average → squeeze about to break, trade dominant bias`);
  if (dna.rangeExpMode === 3) rules.push(`Range expanding from contraction (>1.2× after <0.8×) → acceleration trade`);
  if (dna.consecMode === 1) rules.push(`${dna.consecThreshold}+ same-direction bars → exhaustion, fade the move`);
  if (dna.consecMode === 2) rules.push(`2+ consecutive up closes → momentum LONG / down → SHORT`);
  if (dna.consecMode === 3) rules.push(`First bar reversing a ${dna.consecThreshold}-bar streak → direction change trigger`);
  if (dna.volDeltaMode === 1) rules.push(`Volume Delta(${dna.volDeltaPeriod}) > 0.3 → LONG / < -0.3 → SHORT`);
  if (dna.volDeltaMode === 2) rules.push(`Price up but Volume Delta down → bearish divergence SHORT`);
  if (dna.volDeltaMode === 3) rules.push(`Volume Delta accelerating → trade delta direction`);
  if (dna.fdMode === 1) rules.push(`Fractal Dimension(${dna.fdPeriod}) < 1.4 → smooth trend, trade direction`);
  if (dna.fdMode === 2) rules.push(`Fractal Dimension(${dna.fdPeriod}) > 1.6 → choppy, mean-revert`);
  if (dna.fdMode === 3) rules.push(`Fractal Dimension dropping >0.1 → new trend forming, trade direction`);
  if (dna.gapMode === 1) rules.push(`Gap > 0.3× ATR → gap-and-go in gap direction`);
  if (dna.gapMode === 2) rules.push(`Gap > 0.3× ATR → fade the gap (gap-fill trade)`);
  if (dna.gapMode === 3) rules.push(`Large gap > 0.8× ATR → trade in gap direction`);
  if (dna.candleMode === 1) rules.push(`Body > 70% of range → strong conviction, trade body direction`);
  if (dna.candleMode === 2) rules.push(`Doji (body < 15% range) → breakout trigger in dominant bias`);
  if (dna.candleMode === 3) rules.push(`Hammer (lower wick >60%) → LONG / Shooting Star (upper wick >60%) → SHORT`);
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
  if (dna.erMode > 0) parts.push('ER');
  if (dna.clvMode > 0) parts.push('CLV');
  if (dna.rangeExpMode > 0) parts.push('RNGX');
  if (dna.consecMode > 0) parts.push('CONSEC');
  if (dna.volDeltaMode > 0) parts.push('VOLDELTA');
  if (dna.fdMode > 0) parts.push('FD');
  if (dna.gapMode > 0) parts.push('GAP');
  if (dna.candleMode > 0) parts.push('ANATOMY');
  if (dna.volMode > 0) parts.push('VOL');
  if (dna.sessionFilter >= 0) parts.push('SES');
  if (dna.dayFilter >= 0) parts.push('DAY');
  if (dna.trailingATR > 0) parts.push('TRAIL');
  if (dna.partialTP > 0) parts.push('PARTIAL');
  return parts.sort().join('+') || 'PURE_FILTER';
}

function computeFitness(sim: SimResult, baseDailyReturns: number[], maxCorrelation: number, dna?: StrategyDNA, unconstrained = false): number {
  const MIN_TRADES = 150; // High frequency requirement

  // ── R:R Constraint — kill strategies with TP < SL (micro-pip exploits) ──
  if (dna && dna.tpMultiplier < dna.slMultiplier) return 0;

  // ── UNCONSTRAINED MODE ──
  if (unconstrained) {
    if (sim.trades < 20) return 0;

    let fitness = sim.profitFactor * Math.log(Math.max(sim.trades, 2));

    if (sim.sharpe > 0.5) fitness *= 1 + (sim.sharpe * 0.3);
    if (sim.sharpe > 1.5) fitness *= 1.3;

    if (sim.maxDrawdown > 0.001) fitness /= (1 + sim.maxDrawdown * 3);
    if (sim.maxDrawdown > 0.3) fitness *= 0.3;

    // Heavy penalty for low trade count
    if (sim.trades < MIN_TRADES) fitness *= 0.05;
    else if (sim.trades < 200) fitness *= 0.5;

    // Big bonus for high throughput
    if (sim.trades > 300) fitness *= 1.2;
    if (sim.trades > 500) fitness *= 1.2;

    if (sim.totalReturn > 20) fitness *= 1.1;

    if (dna) {
      const activeCount = countActiveIndicators(dna);
      if (activeCount > 3) fitness *= 0.2;
      if (activeCount === 1) fitness *= 1.1;
    }

    return Math.max(fitness, 0);
  }

  // ── CONSTRAINED MODE ──
  if (sim.trades < 20) return 0;

  let fitness = sim.profitFactor * Math.log(Math.max(sim.trades, 2));

  if (sim.sharpe > 0.5) fitness *= 1 + (sim.sharpe * 0.3);
  if (sim.sharpe > 1.5) fitness *= 1.3;
  if (sim.sharpe > 2.5) fitness *= 1.2;

  if (sim.maxDrawdown > 0.001) fitness /= (1 + sim.maxDrawdown * 2);
  if (sim.maxDrawdown > 0.3) fitness *= 0.5;
  if (sim.maxDrawdown > 0.5) fitness *= 0.3;

  // Heavy penalty for low trade count — we want 8+ trades per 3 days
  if (sim.trades < MIN_TRADES) fitness *= 0.05;
  else if (sim.trades < 200) fitness *= 0.5;

  // Big bonus for high throughput
  if (sim.trades > 300) fitness *= 1.2;
  if (sim.trades > 500) fitness *= 1.2;
  if (sim.trades > 800) fitness *= 1.15;

  if (sim.totalReturn > 20) fitness *= 1.1;

  const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
  if (corr > maxCorrelation) fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);

  if (dna) {
    const activeCount = countActiveIndicators(dna);
    if (activeCount === 1) fitness *= 1.2;
    if (activeCount === 2) fitness *= 1.1;
    if (activeCount > 3) fitness *= 0.2;

    if (dna.trailingATR > 0) fitness *= 1.1;
    if (dna.partialTP > 0) fitness *= 1.05;
    if (dna.maxBarsInTrade > 0) fitness *= 1.05;
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
  const targetRegime = Number(body.targetRegime ?? -1);

  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  if (!apiToken) throw new Error("OANDA API token not configured");

  console.log(`[GA-P1] Fetching ${candleCount} M30 candles for ${pair} (${environment})`);
  const candles = await fetchCandles(pair, candleCount, environment, apiToken);
  if (candles.length < 250) throw new Error(`Insufficient candle data: ${candles.length}`);

  console.log(`[GA-P1] Got ${candles.length} candles, building novel micro-structure library...`);
  const bars = buildFeatureArrays(pair, candles);
  console.log(`[GA-P1] Built ${bars.count} feature bars with 8 novel indicators`);

  const IS_SPLIT = Math.floor(bars.count * 0.7);
  console.log(`[GA-P1] Walk-forward split: IS=${IS_SPLIT} bars, OOS=${bars.count - IS_SPLIT} bars, targetRegime=${targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL'}`);

  // Baseline
  const baseDailyReturns: number[] = [];
  let baseEq = 10000, dayCounter = 0, dayStart = baseEq;
  for (let i = 1; i < IS_SPLIT; i++) {
    const isLong = bars.close[i] > bars.close[Math.max(0, i - 10)];
    const baseReturn = isLong ? bars.mfeLong[i] * 0.5 : bars.mfeShort[i] * 0.5;
    baseEq += baseReturn * 10000 * 0.001;
    dayCounter++;
    if (dayCounter >= 48) { baseDailyReturns.push((baseEq - dayStart) / (dayStart || 1)); dayStart = baseEq; dayCounter = 0; }
  }

  console.log(`[GA-P1] Initializing population of ${populationSize} with ${ARCHETYPES.length} archetype seeds`);
  const population: { dna: StrategyDNA; fitness: number }[] = [];
  for (let i = 0; i < Math.min(ARCHETYPES.length, populationSize); i++) {
    const dna = randomDNA(ARCHETYPES[i]);
    const sim = simulateStrategy(bars, dna, 0, IS_SPLIT, targetRegime);
    const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, dna, unconstrained);
    population.push({ dna, fitness });
  }
  while (population.length < populationSize) {
    const dna = randomDNA();
    const sim = simulateStrategy(bars, dna, 0, IS_SPLIT, targetRegime);
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

  const regimeDist = { trend: 0, range: 0, shock: 0 };
  for (let i = 0; i < bars.count; i++) {
    if (bars.regimeTag[i] === REGIME_TREND) regimeDist.trend++;
    else if (bars.regimeTag[i] === REGIME_RANGE) regimeDist.range++;
    else regimeDist.shock++;
  }

  const jobState = {
    status: "evolving", pair, environment, currentGen: 0,
    totalGenerations, populationSize, maxCorrelation, mutationRate, gensPerCall, unconstrained,
    targetRegime,
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    baseDailyReturns, isSplit: IS_SPLIT,
    evolutionLog: [{ gen: 0, bestFitness: Math.round(population[0].fitness * 1000) / 1000, avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000, bestTrades: 0 }],
    totalSimulations: populationSize, barCount: bars.count, startedAt: new Date().toISOString(),
    dateRange: { start: candles[0]?.time || '', end: candles[candles.length - 1]?.time || '' },
    regimeDistribution: regimeDist,
  };

  const JOB_KEY = getJobKey(pair);
  await sb.from("sovereign_memory").delete().eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");
  const { error: upsertErr } = await sb.from("sovereign_memory").insert({
    memory_key: JOB_KEY, memory_type: "ga_job",
    payload: jobState, created_by: "alpha-discovery-engine", version: 1,
  });
  if (upsertErr) throw new Error(`Failed to save GA job state: ${upsertErr.message}`);

  console.log(`[GA-P1] Phase 1 complete. ${bars.count} bars, pop=${populationSize}, regime=${targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL'}, ready for evolution.`);
  return {
    phase: 1, status: "evolving", pair, barCount: bars.count,
    populationSize, totalGenerations, currentGen: 0,
    bestFitness: population[0].fitness,
    targetRegime, targetRegimeLabel: targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL',
    regimeDistribution: regimeDist,
    dateRange: { start: candles[0]?.time || '', end: candles[candles.length - 1]?.time || '' },
    message: `Novel micro-structure library built. ${bars.count} bars. Regime: ${targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL'} (T:${regimeDist.trend} R:${regimeDist.range} S:${regimeDist.shock}). Ready to evolve.`,
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
  const targetRegime = Number(job.targetRegime ?? -1);

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found. Run Phase 1 first.");
  const bars = barsRow.payload as BarArrays;
  const isSplit = (job.isSplit as number) || bars.count;

  const gensToRun = Math.min(gensPerCall, totalGenerations - currentGen);
  console.log(`[GA-P2] Gen ${currentGen + 1}→${currentGen + gensToRun} of ${totalGenerations} (IS=${isSplit}/${bars.count}, regime=${targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL'})`);

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
      const sim = simulateStrategy(bars, child, 0, isSplit, targetRegime);
      const fitness = computeFitness(sim, baseDailyReturns, maxCorrelation, child, unconstrained);
      newPop.push({ dna: child, fitness });
      totalSimulations++;
    }

    population = newPop.sort((a, b) => b.fitness - a.fitness);
    const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
    const bestSim = simulateStrategy(bars, population[0].dna, 0, isSplit, targetRegime);
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
  const targetRegime = Number(job.targetRegime ?? -1);

  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).eq("memory_type", "ga_dataset").maybeSingle();
  if (!barsRow) throw new Error("Feature data not found.");
  const bars = barsRow.payload as BarArrays;
  const isSplit = (job.isSplit as number) || bars.count;

  console.log(`[GA-P3] Extracting top strategies from ${population.length} individuals (full dataset: ${bars.count} bars, regime=${targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL'})`);
  nameCounter = 0;

  const seen = new Set<string>();
  const profiles: (ScoredIndividual & { oosSim?: SimResult; isSim?: SimResult })[] = [];

  for (const p of population.slice(0, 60)) {
    const d = p.dna;
    const key = `${d.erMode}-${d.erPeriod}-${d.clvMode}-${d.clvSmooth}-${d.rangeExpMode}-${d.rangeExpPeriod}-${d.consecMode}-${d.consecThreshold}-${d.volDeltaMode}-${d.fdMode}-${d.gapMode}-${d.candleMode}-${d.direction}-${d.volMode}-${d.sessionFilter}-${d.dayFilter}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sim = simulateStrategy(bars, p.dna, 0, undefined, targetRegime);
    if (sim.trades < (targetRegime >= 0 ? 50 : 100)) continue; // High frequency minimum

    const isSim = isSplit < bars.count ? simulateStrategy(bars, p.dna, 0, isSplit, targetRegime) : sim;
    const oosSim = isSplit < bars.count ? simulateStrategy(bars, p.dna, isSplit, undefined, targetRegime) : undefined;

    if (oosSim && oosSim.trades >= 10) {
      if (oosSim.profitFactor < 1.1) continue;
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
      oosSim, isSim,
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
    oosReturn: p.oosSim ? Math.round(p.oosSim.totalReturn * 100) / 100 : null,
    oosWinRate: p.oosSim ? Math.round(p.oosSim.winRate * 10000) / 10000 : null,
    oosTrades: p.oosSim?.trades ?? null,
    oosProfitFactor: p.oosSim ? Math.round(p.oosSim.profitFactor * 100) / 100 : null,
    oosMaxDrawdown: p.oosSim ? Math.round(p.oosSim.maxDrawdown * 10000) / 10000 : null,
    oosPips: p.oosSim ? Math.round(p.oosSim.totalPips * 10) / 10 : null,
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
    targetRegime, targetRegimeLabel: targetRegime >= 0 ? REGIME_LABELS[targetRegime] : 'ALL',
    regimeDistribution: (job as Record<string, unknown>).regimeDistribution || null,
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
    oosProfitFactor?: number | null; oosMaxDrawdown?: number | null;
    isReturn?: number | null; isWinRate?: number | null; isTrades?: number | null;
    isProfitFactor?: number | null; isMaxDrawdown?: number | null;
    equityCurve: number[];
    regimeScores?: { trend: number; range: number; shock: number };
    bestRegime?: string;
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
      const key = `${d.erMode}-${d.clvMode}-${d.rangeExpMode}-${d.consecMode}-${d.volDeltaMode}-${d.fdMode}-${d.gapMode}-${d.candleMode}-${d.direction}-${d.sessionFilter}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sim = simulateStrategy(bars, ind.dna);
      if (sim.trades < 50) continue;

      const isSim = isSplit < bars.count ? simulateStrategy(bars, ind.dna, 0, isSplit) : sim;
      const oosSim = isSplit < bars.count ? simulateStrategy(bars, ind.dna, isSplit) : undefined;

      if (oosSim && oosSim.trades >= 10) {
        if (oosSim.profitFactor < 1.1) continue;
        if (isSim.maxDrawdown > 0.001 && oosSim.maxDrawdown > isSim.maxDrawdown * 2) continue;
      }

      const trendSim = bars.regimeTag ? simulateStrategy(bars, ind.dna, 0, undefined, REGIME_TREND) : null;
      const rangeSim = bars.regimeTag ? simulateStrategy(bars, ind.dna, 0, undefined, REGIME_RANGE) : null;
      const shockSim = bars.regimeTag ? simulateStrategy(bars, ind.dna, 0, undefined, REGIME_SHOCK) : null;

      const regimeScores = {
        trend: trendSim && trendSim.trades >= 10 ? trendSim.profitFactor * Math.log(Math.max(trendSim.trades, 2)) : 0,
        range: rangeSim && rangeSim.trades >= 10 ? rangeSim.profitFactor * Math.log(Math.max(rangeSim.trades, 2)) : 0,
        shock: shockSim && shockSim.trades >= 5 ? shockSim.profitFactor * Math.log(Math.max(shockSim.trades, 2)) : 0,
      };
      const bestRegime = regimeScores.trend >= regimeScores.range && regimeScores.trend >= regimeScores.shock
        ? 'TREND' : regimeScores.range >= regimeScores.shock ? 'RANGE' : 'SHOCK';

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
        regimeScores,
        bestRegime,
      });
    }
  }

  console.log(`[GA-BATCH] ${allStrategies.length} candidate strategies from ${pairs.length} pairs`);
  allStrategies.sort((a, b) => b.sim.totalReturn - a.sim.totalReturn);

  // ── REGIME MATRIX SELECTION: Top 2 Trend + Top 2 Range + Top 1 Shock ──
  const selected: PairStrategy[] = [];
  const pairCounts: Record<string, number> = {};
  const MAX_PER_PAIR = 2;

  function selectBestForRegime(regime: string, count: number) {
    const sorted = [...allStrategies]
      .filter(s => s.bestRegime === regime)
      .sort((a, b) => {
        const scoreA = regime === 'TREND' ? (a.regimeScores?.trend ?? 0) : regime === 'RANGE' ? (a.regimeScores?.range ?? 0) : (a.regimeScores?.shock ?? 0);
        const scoreB = regime === 'TREND' ? (b.regimeScores?.trend ?? 0) : regime === 'RANGE' ? (b.regimeScores?.range ?? 0) : (b.regimeScores?.shock ?? 0);
        return scoreB - scoreA;
      });
    let added = 0;
    for (const strat of sorted) {
      if (added >= count) break;
      if (selected.includes(strat)) continue;
      const pc = pairCounts[strat.pair] || 0;
      if (pc >= MAX_PER_PAIR) continue;
      let uncorrelated = true;
      for (const existing of selected) {
        if (Math.abs(pearsonCorrelation(strat.sim.dailyReturns, existing.sim.dailyReturns)) > maxInterCorr) { uncorrelated = false; break; }
      }
      if (!uncorrelated) continue;
      selected.push(strat);
      pairCounts[strat.pair] = pc + 1;
      added++;
    }
  }

  selectBestForRegime('TREND', 2);
  selectBestForRegime('RANGE', 2);
  selectBestForRegime('SHOCK', 1);

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

  const regimeDistribution = {
    trend: selected.filter(s => s.bestRegime === 'TREND').length,
    range: selected.filter(s => s.bestRegime === 'RANGE').length,
    shock: selected.filter(s => s.bestRegime === 'SHOCK').length,
  };

  console.log(`[GA-BATCH] Regime Matrix: ${regimeDistribution.trend}T + ${regimeDistribution.range}R + ${regimeDistribution.shock}S = ${selected.length} strategies`);

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
    oosProfitFactor: s.oosProfitFactor,
    oosMaxDrawdown: s.oosMaxDrawdown,
    isReturn: s.isReturn,
    isWinRate: s.isWinRate,
    isTrades: s.isTrades,
    isProfitFactor: s.isProfitFactor,
    isMaxDrawdown: s.isMaxDrawdown,
    regimeScores: s.regimeScores,
    bestRegime: s.bestRegime,
  });

  return {
    action: "batch-extract",
    totalCandidates: allStrategies.length,
    pairsProcessed: pairs.length,
    selected: selected.length,
    pairDistribution: pairCounts,
    maxInterCorrelation: maxInterCorr,
    regimeDistribution,
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
