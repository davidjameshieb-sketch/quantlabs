// Blend Live Backtest v4.0 — TRUE PARITY Portfolio Forward Test
// Rank-based strategies: identical logic to profile-live-backtest (signal gen, pre-computed exits, gate filtering)
// Alpha-discovery strategies: identical logic to alpha-discovery-engine (8 novel indicators, majority vote, advanced exits)
// This ensures the portfolio backtest produces the SAME results as individual strategy backtests.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";
const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

const OANDA_AVAILABLE = new Set([
  "EUR_USD","EUR_GBP","EUR_AUD","EUR_NZD","EUR_CAD","EUR_CHF","EUR_JPY",
  "GBP_USD","GBP_AUD","GBP_NZD","GBP_CAD","GBP_CHF","GBP_JPY",
  "AUD_USD","AUD_NZD","AUD_CAD","AUD_CHF","AUD_JPY",
  "NZD_USD","NZD_CAD","NZD_CHF","NZD_JPY",
  "USD_CAD","USD_CHF","USD_JPY",
  "CAD_CHF","CAD_JPY","CHF_JPY",
]);

const ALL_28_CROSSES: Array<{ base: string; quote: string; instrument: string }> = [];
for (let i = 0; i < ALL_CURRENCIES.length; i++) {
  for (let j = i + 1; j < ALL_CURRENCIES.length; j++) {
    ALL_28_CROSSES.push({ base: ALL_CURRENCIES[i], quote: ALL_CURRENCIES[j], instrument: `${ALL_CURRENCIES[i]}_${ALL_CURRENCIES[j]}` });
  }
}

interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number; }

// ── Constants ──
const FRICTION_PIPS = 1.5;
const MAX_UNITS = 5_000_000;
const AGGRESSIVE_RISK = 0.05;
const INSTITUTIONAL_RISK = 0.01;
const BASE_EQUITY = 1000;
const GATE_G1 = 0b001;
const GATE_G2 = 0b010;
const GATE_G3 = 0b100;

// ══════════════════════════════════════════════════════════════
// SECTION 1: Shared Utilities (candle fetching, gates)
// ══════════════════════════════════════════════════════════════

async function fetchCandlePage(instrument: string, count: number, env: "practice" | "live", token: string, to?: string): Promise<Candle[]> {
  const host = env === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  let url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  if (to) url += `&to=${to}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
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

async function fetchCandles(instrument: string, count: number, env: "practice" | "live", token: string): Promise<Candle[]> {
  const PAGE_SIZE = 5000;
  if (count <= PAGE_SIZE) return fetchCandlePage(instrument, count, env, token);
  const all: Candle[] = [];
  let remaining = count;
  let cursor: string | undefined = undefined;
  let iteration = 0;
  while (remaining > 0 && iteration < 12) {
    iteration++;
    const batch = Math.min(remaining, PAGE_SIZE);
    const page = await fetchCandlePage(instrument, batch, env, token, cursor);
    if (page.length === 0) break;
    all.unshift(...page);
    remaining -= page.length;
    if (page.length < batch * 0.9) break;
    cursor = page[0].time;
  }
  const seen = new Set<string>();
  return all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
}

function computeGateBits(candles: Candle[], idx: number, direction: "long" | "short"): number {
  let bits = GATE_G1;
  if (idx >= 21) {
    const currentClose = candles[idx].close;
    if (direction === "long") {
      let highest = -Infinity;
      for (let k = idx - 20; k < idx; k++) if (candles[k].high > highest) highest = candles[k].high;
      if (currentClose > highest) bits |= GATE_G2;
    } else {
      let lowest = Infinity;
      for (let k = idx - 20; k < idx; k++) if (candles[k].low < lowest) lowest = candles[k].low;
      if (currentClose < lowest) bits |= GATE_G2;
    }
  }
  if (idx >= 20) {
    const n = 20;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const ci = idx - n + i;
      sumX += i; sumY += candles[ci].close; sumXY += i * candles[ci].close; sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      if ((direction === "long" && slope > 0) || (direction === "short" && slope < 0)) bits |= GATE_G3;
    }
  }
  return bits;
}

function getSessionIdx(hour: number): number {
  if (hour >= 0 && hour < 7) return 1;
  if (hour >= 7 && hour < 12) return 2;
  if (hour >= 12 && hour < 17) return 3;
  if (hour >= 17 && hour < 21) return 4;
  return 1;
}

function computePips(entry: number, exit: number, dir: "long" | "short", isJPY: boolean): number {
  const raw = dir === "long" ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

function computeUnits(equity: number, riskPct: number, slPips: number, pipVal: number): number {
  const riskAmount = equity * riskPct;
  const rawUnits = riskAmount / (slPips * pipVal);
  return Math.min(rawUnits, MAX_UNITS);
}

// ══════════════════════════════════════════════════════════════
// SECTION 2: Rank-Based Strategy Logic (profile-live-backtest parity)
// ══════════════════════════════════════════════════════════════

interface CompactSignal {
  time: string; instrument: string; direction: "long" | "short";
  entryPrice: number; isJPY: boolean; candleIdx: number;
  gateBits: number; sessionIdx: number; exitPips: Float64Array;
}

interface RankSnap { time: string; ranks: Record<string, number>; }

function precomputeExits(
  entryPrice: number, isJPY: boolean, candleIdx: number, direction: "long" | "short",
  candles: Candle[], nextSignalTime: string | null,
  exitModes: Array<{ slPips: number; tpRatio: number | "flip" }>,
): Float64Array {
  const results = new Float64Array(exitModes.length);
  const pipMul = isJPY ? 100 : 10000;
  for (let ei = 0; ei < exitModes.length; ei++) {
    const exit = exitModes[ei];
    const slDist = exit.slPips / pipMul;
    const tpDist = exit.tpRatio === "flip" ? Infinity : (exit.slPips * (exit.tpRatio as number)) / pipMul;
    const isFlip = exit.tpRatio === "flip";
    let exitPrice = entryPrice;
    for (let ci = candleIdx + 1; ci < candles.length; ci++) {
      const bar = candles[ci];
      if (isFlip && nextSignalTime && bar.time >= nextSignalTime) { exitPrice = bar.open; break; }
      if (direction === "long") {
        if (bar.low <= entryPrice - slDist) { exitPrice = entryPrice - slDist; break; }
        if (!isFlip && bar.high >= entryPrice + tpDist) { exitPrice = entryPrice + tpDist; break; }
      } else {
        if (bar.high >= entryPrice + slDist) { exitPrice = entryPrice + slDist; break; }
        if (!isFlip && bar.low <= entryPrice - tpDist) { exitPrice = entryPrice - tpDist; break; }
      }
      if (isFlip && !nextSignalTime && ci === candles.length - 1) { exitPrice = bar.close; break; }
    }
    results[ei] = computePips(entryPrice, exitPrice, direction, isJPY);
  }
  return results;
}

function generateRankSignals(
  predRank: number, preyRank: number, rankSnaps: RankSnap[],
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>,
  exitModes: Array<{ slPips: number; tpRatio: number | "flip" }>,
): CompactSignal[] {
  const raw: Array<Omit<CompactSignal, 'exitPips'>> = [];
  let prevInst: string | null = null;
  let prevDir: "long" | "short" | null = null;
  for (const snap of rankSnaps) {
    const strongCur = ALL_CURRENCIES.find(c => snap.ranks[c] === predRank);
    const weakCur = ALL_CURRENCIES.find(c => snap.ranks[c] === preyRank);
    if (!strongCur || !weakCur) continue;
    const directInst = `${strongCur}_${weakCur}`;
    const inverseInst = `${weakCur}_${strongCur}`;
    let instrument: string | null = null;
    let direction: "long" | "short" = "long";
    if (pairTimeIndex[directInst]?.[snap.time] !== undefined) { instrument = directInst; direction = "long"; }
    else if (pairTimeIndex[inverseInst]?.[snap.time] !== undefined) { instrument = inverseInst; direction = "short"; }
    if (!instrument) continue;
    if (instrument !== prevInst || direction !== prevDir) {
      const candleIdx = pairTimeIndex[instrument][snap.time];
      const candles = pairCandles[instrument];
      const gateBits = computeGateBits(candles, candleIdx, direction);
      const hour = new Date(snap.time).getUTCHours();
      raw.push({ time: snap.time, instrument, direction, entryPrice: candles[candleIdx].close, isJPY: instrument.includes("JPY"), candleIdx, gateBits, sessionIdx: getSessionIdx(hour) });
      prevInst = instrument; prevDir = direction;
    }
  }
  const signals: CompactSignal[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const sig = raw[i];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const nextTime = i + 1 < raw.length ? raw[i + 1].time : null;
    signals[i] = { ...sig, exitPips: precomputeExits(sig.entryPrice, sig.isJPY, sig.candleIdx, sig.direction, candles, nextTime, exitModes) };
  }
  return signals.filter(Boolean);
}

// Simulate rank-based strategy
function simulateRankStrategy(
  comp: BlendComponent, signals: CompactSignal[], exitIdx: number, slPips: number,
): StrategyResult {
  let gateMask = GATE_G1;
  const gates = comp.gates || '';
  if (gates.includes('G2')) gateMask |= GATE_G2;
  if (gates.includes('G3')) gateMask |= GATE_G3;
  if (comp.requireG3) gateMask |= GATE_G2 | GATE_G3;
  const SESSIONS = ["ALL", "ASIA", "LONDON", "NEW_YORK", "NY_CLOSE"];
  const sessionIdx = comp.session ? SESSIONS.indexOf(comp.session.toUpperCase()) : 0;
  let instEquity = 1000, instPeak = 1000, instMaxDD = 0;
  let aggEquity = 1000;
  let wins = 0, losses = 0, totalPips = 0, grossWinPips = 0, grossLossPips = 0;
  const curve: Array<{ time: string; pips: number }> = [];
  for (const sig of signals) {
    if ((sig.gateBits & gateMask) !== gateMask) continue;
    if (sessionIdx > 0 && sig.sessionIdx !== sessionIdx) continue;
    let tradePips = sig.exitPips[exitIdx];
    tradePips = tradePips > 0 ? tradePips - FRICTION_PIPS : tradePips - FRICTION_PIPS;
    const pipVal = sig.isJPY ? 0.01 : 0.0001;
    totalPips += tradePips;
    if (tradePips > 0) { wins++; grossWinPips += tradePips; }
    else { losses++; grossLossPips += Math.abs(tradePips); }
    const instUnits = computeUnits(instEquity, INSTITUTIONAL_RISK, slPips, pipVal);
    instEquity += tradePips * instUnits * pipVal;
    if (instEquity > instPeak) instPeak = instEquity;
    const instDD = (instPeak - instEquity) / instPeak;
    if (instDD > instMaxDD) instMaxDD = instDD;
    const aggUnits = computeUnits(aggEquity, AGGRESSIVE_RISK, slPips, pipVal);
    aggEquity += tradePips * aggUnits * pipVal;
    curve.push({ time: sig.time, pips: tradePips });
  }
  const trades = wins + losses;
  return {
    id: comp.id, label: comp.label, weight: comp.weight, trades, wins, losses,
    winRate: trades > 0 ? Math.round((wins / trades) * 1000) / 10 : 0,
    totalPips: Math.round(totalPips * 10) / 10,
    profitFactor: grossLossPips > 0 ? Math.round((grossWinPips / grossLossPips) * 100) / 100 : grossWinPips > 0 ? 999 : 0,
    avgWin: wins > 0 ? Math.round((grossWinPips / wins) * 10) / 10 : 0,
    avgLoss: losses > 0 ? Math.round((grossLossPips / losses) * 10) / 10 : 0,
    institutionalProfit: Math.round((instEquity - 1000) * 100) / 100,
    aggressiveProfit: Math.round((aggEquity - 1000) * 100) / 100,
    maxDrawdown: Math.round(-instMaxDD * 1000) / 10,
    equityCurve: curve,
  };
}

// ══════════════════════════════════════════════════════════════
// SECTION 3: Alpha DNA Strategy Logic (alpha-discovery-engine parity)
// All 8 novel micro-structure indicators + majority vote + advanced exits
// ══════════════════════════════════════════════════════════════

interface StrategyDNA {
  erPeriod: number; erMode: number;
  clvSmooth: number; clvMode: number;
  rangeExpPeriod: number; rangeExpMode: number;
  consecThreshold: number; consecMode: number;
  volDeltaPeriod: number; volDeltaMode: number;
  fdPeriod: number; fdMode: number;
  gapMode: number;
  candleMode: number;
  volMode: number; sessionFilter: number; dayFilter: number; direction: number;
  slMultiplier: number; tpMultiplier: number;
  hurstMin: number; hurstMax: number;
  trailingATR: number; maxBarsInTrade: number; partialTP: number;
}

interface BarArrays {
  close: number[]; high: number[]; low: number[]; open: number[]; atr: number[];
  efficiencyRatio8: number[]; efficiencyRatio13: number[]; efficiencyRatio21: number[];
  clvRaw: number[]; clvSmooth5: number[]; clvSmooth10: number[];
  rangeRatio8: number[]; rangeRatio13: number[]; rangeRatio21: number[];
  consecUp: number[]; consecDown: number[];
  volDelta5: number[]; volDelta10: number[]; volDelta20: number[];
  fractalDim10: number[]; fractalDim20: number[];
  gapSize: number[]; gapDirection: number[];
  bodyRatio: number[]; upperWickRatio: number[]; lowerWickRatio: number[];
  isDoji: number[]; isHammer: number[]; isShootingStar: number[];
  volRatio: number[]; session: number[]; dayOfWeek: number[];
  hurst: number[]; volBucket: number[]; isLongBias: number[];
  mfeLong: number[]; maeLong: number[]; mfeShort: number[]; maeShort: number[];
  barHigh: number[]; barLow: number[];
  isJPY: number[];
  count: number;
}

// ── Core indicator computations (identical to alpha-discovery-engine) ──

function computeEMA(values: number[], period: number): number[] {
  const ema = new Array(values.length).fill(0);
  if (values.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  return ema;
}

function computeATRArray(candles: Candle[], period = 14): number[] {
  const atrs = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += Math.max(candles[j].high - candles[j].low, Math.abs(candles[j].high - candles[j - 1].close), Math.abs(candles[j].low - candles[j - 1].close));
    }
    atrs[i] = sum / period;
  }
  return atrs;
}

function computeEfficiencyRatio(closes: number[], period: number): number[] {
  const n = closes.length;
  const er = new Array(n).fill(0.5);
  for (let i = period; i < n; i++) {
    const netChange = Math.abs(closes[i] - closes[i - period]);
    let totalPath = 0;
    for (let j = i - period + 1; j <= i; j++) totalPath += Math.abs(closes[j] - closes[j - 1]);
    er[i] = totalPath > 0 ? netChange / totalPath : 0;
  }
  return er;
}

function computeCLV(candles: Candle[]): number[] {
  return candles.map(c => { const range = c.high - c.low; return range <= 0 ? 0 : (2 * c.close - c.high - c.low) / range; });
}

function computeRangeRatio(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const rr = new Array(n).fill(1);
  for (let i = period; i < n; i++) {
    let avgRange = 0;
    for (let j = i - period; j < i; j++) avgRange += candles[j].high - candles[j].low;
    avgRange /= period;
    rr[i] = avgRange > 0 ? (candles[i].high - candles[i].low) / avgRange : 1;
  }
  return rr;
}

function computeConsecutive(candles: Candle[]): { up: number[]; down: number[] } {
  const n = candles.length;
  const up = new Array(n).fill(0), down = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (candles[i].close > candles[i].open) { up[i] = up[i - 1] + 1; down[i] = 0; }
    else if (candles[i].close < candles[i].open) { down[i] = down[i - 1] + 1; up[i] = 0; }
  }
  return { up, down };
}

function computeVolumeDelta(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const vd = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    let delta = 0, totalVol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const isUp = candles[j].close >= candles[j].open;
      delta += isUp ? candles[j].volume : -candles[j].volume;
      totalVol += candles[j].volume;
    }
    vd[i] = totalVol > 0 ? delta / totalVol : 0;
  }
  return vd;
}

function computeFractalDimension(closes: number[], period: number): number[] {
  const n = closes.length;
  const fd = new Array(n).fill(1.5);
  for (let i = period; i < n; i++) {
    let L1 = 0;
    const halfP = Math.max(2, Math.floor(period / 2));
    for (let j = i - period + 2; j <= i; j++) L1 += Math.abs(closes[j] - closes[j - 1]);
    L1 = (L1 * (period - 1)) / (period - 1);
    let L2 = 0;
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
    const d = r - mean; cumSum += d;
    if (cumSum > cumMax) cumMax = cumSum;
    if (cumSum < cumMin) cumMin = cumSum;
    ssq += d * d;
  }
  const S = Math.sqrt(ssq / returns.length);
  return S === 0 ? 0.5 : Math.log((cumMax - cumMin) / S) / Math.log(returns.length);
}

function getSession(time: string): number {
  const h = new Date(time).getUTCHours();
  if (h < 7) return 0; if (h < 12) return 1; if (h < 17) return 2; return 3;
}

// ── Build Feature Arrays (identical to alpha-discovery-engine) ──

function buildFeatureArrays(pair: string, candles: Candle[]): BarArrays {
  const isJPY = pair.includes('JPY') ? 1 : 0;
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const atrs = computeATRArray(candles, 14);
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

  const volAvg20: number[] = new Array(n).fill(0);
  for (let i = 19; i < n; i++) { let sum = 0; for (let j = i - 19; j <= i; j++) sum += volumes[j]; volAvg20[i] = sum / 20; }

  const vols: number[] = [];
  for (let i = 20; i < n; i++) {
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) { if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; } }
    vols.push(Math.sqrt(ssq / 19));
  }
  const sortedVols = [...vols].sort((a, b) => a - b);
  const p33 = sortedVols[Math.floor(sortedVols.length * 0.33)] || 0;
  const p66 = sortedVols[Math.floor(sortedVols.length * 0.66)] || 0;

  const START = 100;
  const MFE_MAE_HORIZON = 16;
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
    volRatio: [], session: [], dayOfWeek: [],
    hurst: [], volBucket: [], isLongBias: [],
    mfeLong: [], maeLong: [], mfeShort: [], maeShort: [],
    barHigh: [], barLow: [],
    isJPY: [],
    count: 0,
  };

  for (let i = START; i < n - MFE_MAE_HORIZON; i++) {
    const currentATR = atrs[i] || 0.001;
    const hurst = computeHurst(closes, i, 20);
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) { if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; } }
    const rollingVol = Math.sqrt(ssq / 19);
    const volBucket = rollingVol <= p33 ? 0 : rollingVol <= p66 ? 1 : 2;
    let pctSum = 0;
    for (let j = i - 19; j <= i; j++) { if (candles[j].open !== 0) pctSum += ((candles[j].close - candles[j].open) / candles[j].open) * 100; }
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
    const gap = i > 0 ? candles[i].open - candles[i - 1].close : 0;
    const gapNorm = currentATR > 0 ? gap / currentATR : 0;
    const candleRange = candles[i].high - candles[i].low;
    const body = Math.abs(candles[i].close - candles[i].open);
    const upperWick = candles[i].high - Math.max(candles[i].open, candles[i].close);
    const lowerWick = Math.min(candles[i].open, candles[i].close) - candles[i].low;
    const bRatio = candleRange > 0 ? body / candleRange : 0;
    const uwRatio = candleRange > 0 ? upperWick / candleRange : 0;
    const lwRatio = candleRange > 0 ? lowerWick / candleRange : 0;

    bars.close.push(closes[i]); bars.high.push(candles[i].high); bars.low.push(candles[i].low); bars.open.push(candles[i].open);
    bars.atr.push(currentATR);
    bars.efficiencyRatio8.push(er8[i]); bars.efficiencyRatio13.push(er13[i]); bars.efficiencyRatio21.push(er21[i]);
    bars.clvRaw.push(clvRaw[i]); bars.clvSmooth5.push(clvSmooth5[i]); bars.clvSmooth10.push(clvSmooth10[i]);
    bars.rangeRatio8.push(rr8[i]); bars.rangeRatio13.push(rr13[i]); bars.rangeRatio21.push(rr21[i]);
    bars.consecUp.push(consec.up[i]); bars.consecDown.push(consec.down[i]);
    bars.volDelta5.push(vd5[i]); bars.volDelta10.push(vd10[i]); bars.volDelta20.push(vd20[i]);
    bars.fractalDim10.push(fd10[i]); bars.fractalDim20.push(fd20[i]);
    bars.gapSize.push(Math.abs(gapNorm)); bars.gapDirection.push(gapNorm > 0 ? 1 : gapNorm < 0 ? -1 : 0);
    bars.bodyRatio.push(bRatio); bars.upperWickRatio.push(uwRatio); bars.lowerWickRatio.push(lwRatio);
    bars.isDoji.push(bRatio < 0.15 ? 1 : 0);
    bars.isHammer.push(lwRatio > 0.6 && bRatio < 0.3 ? 1 : 0);
    bars.isShootingStar.push(uwRatio > 0.6 && bRatio < 0.3 ? 1 : 0);
    bars.barHigh.push(candles[i].high); bars.barLow.push(candles[i].low);
    bars.volRatio.push(Math.round(vr * 100) / 100);
    bars.session.push(getSession(candles[i].time));
    bars.dayOfWeek.push(new Date(candles[i].time).getUTCDay());
    bars.hurst.push(hurst); bars.volBucket.push(volBucket); bars.isLongBias.push(isLongBias);
    bars.mfeLong.push(mfeLong); bars.maeLong.push(maeLong);
    bars.mfeShort.push(mfeShort); bars.maeShort.push(maeShort);
    bars.isJPY.push(isJPY);
    bars.count++;
  }
  return bars;
}

// ── Entry Evaluation (identical to alpha-discovery-engine) ──

function getER(bars: BarArrays, i: number, period: number): number {
  if (period <= 10) return bars.efficiencyRatio8[i]; if (period <= 17) return bars.efficiencyRatio13[i]; return bars.efficiencyRatio21[i];
}
function getCLV(bars: BarArrays, i: number, smooth: number): number {
  return smooth <= 7 ? bars.clvSmooth5[i] : bars.clvSmooth10[i];
}
function getRangeRatio(bars: BarArrays, i: number, period: number): number {
  if (period <= 10) return bars.rangeRatio8[i]; if (period <= 17) return bars.rangeRatio13[i]; return bars.rangeRatio21[i];
}
function getVolDelta(bars: BarArrays, i: number, period: number): number {
  if (period <= 7) return bars.volDelta5[i]; if (period <= 15) return bars.volDelta10[i]; return bars.volDelta20[i];
}
function getFD(bars: BarArrays, i: number, period: number): number {
  return period <= 15 ? bars.fractalDim10[i] : bars.fractalDim20[i];
}

function evaluateEntry(bars: BarArrays, i: number, dna: StrategyDNA): { long: boolean; short: boolean } {
  let longSignals = 0, shortSignals = 0, activeIndicators = 0;

  if (dna.erMode > 0) {
    activeIndicators++;
    const er = getER(bars, i, dna.erPeriod);
    const prevER = i > 0 ? getER(bars, i - 1, dna.erPeriod) : er;
    if (dna.erMode === 1) { if (er > 0.55) { if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++; } }
    else if (dna.erMode === 2) { if (er < 0.35) { if (bars.close[i] < bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++; } }
    else if (dna.erMode === 3) { if (er > prevER + 0.05) { if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++; } }
  }
  if (dna.clvMode > 0) {
    activeIndicators++;
    const clv = getCLV(bars, i, dna.clvSmooth);
    if (dna.clvMode === 1) { if (clv < -0.6) longSignals++; if (clv > 0.6) shortSignals++; }
    else if (dna.clvMode === 2) { if (clv > 0.2) longSignals++; if (clv < -0.2) shortSignals++; }
    else if (dna.clvMode === 3) { const priceUp = bars.close[i] > bars.close[Math.max(0, i - 5)]; if (priceUp && clv < -0.3) shortSignals++; if (!priceUp && clv > 0.3) longSignals++; }
  }
  if (dna.rangeExpMode > 0) {
    activeIndicators++;
    const rr = getRangeRatio(bars, i, dna.rangeExpPeriod);
    const prevRR = i > 0 ? getRangeRatio(bars, i - 1, dna.rangeExpPeriod) : rr;
    if (dna.rangeExpMode === 1) { if (rr > 1.5) { if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++; } }
    else if (dna.rangeExpMode === 2) { if (rr < 0.5 && i > 0) { if (bars.isLongBias[i]) longSignals++; else shortSignals++; } }
    else if (dna.rangeExpMode === 3) { if (rr > 1.2 && prevRR < 0.8) { if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++; } }
  }
  if (dna.consecMode > 0) {
    activeIndicators++;
    const cUp = bars.consecUp[i], cDown = bars.consecDown[i], threshold = dna.consecThreshold;
    if (dna.consecMode === 1) { if (cUp >= threshold) shortSignals++; if (cDown >= threshold) longSignals++; }
    else if (dna.consecMode === 2) { if (cUp >= 2) longSignals++; if (cDown >= 2) shortSignals++; }
    else if (dna.consecMode === 3) { if (cUp === 1 && i > 0 && bars.consecDown[i - 1] >= threshold) longSignals++; if (cDown === 1 && i > 0 && bars.consecUp[i - 1] >= threshold) shortSignals++; }
  }
  if (dna.volDeltaMode > 0) {
    activeIndicators++;
    const vd = getVolDelta(bars, i, dna.volDeltaPeriod);
    const prevVD = i > 0 ? getVolDelta(bars, i - 1, dna.volDeltaPeriod) : vd;
    if (dna.volDeltaMode === 1) { if (vd > 0.3) longSignals++; if (vd < -0.3) shortSignals++; }
    else if (dna.volDeltaMode === 2) { const priceUp = bars.close[i] > bars.close[Math.max(0, i - 3)]; if (priceUp && vd < -0.15) shortSignals++; if (!priceUp && vd > 0.15) longSignals++; }
    else if (dna.volDeltaMode === 3) { if (vd > prevVD + 0.1) longSignals++; if (vd < prevVD - 0.1) shortSignals++; }
  }
  if (dna.fdMode > 0) {
    activeIndicators++;
    const fd = getFD(bars, i, dna.fdPeriod);
    const prevFD = i > 0 ? getFD(bars, i - 1, dna.fdPeriod) : fd;
    if (dna.fdMode === 1) { if (fd < 1.4) { if (bars.close[i] > bars.close[Math.max(0, i - 5)]) longSignals++; else shortSignals++; } }
    else if (dna.fdMode === 2) { if (fd > 1.6) { if (bars.close[i] < bars.close[Math.max(0, i - 5)]) longSignals++; else shortSignals++; } }
    else if (dna.fdMode === 3) { if (fd < prevFD - 0.1) { if (bars.close[i] > bars.close[Math.max(0, i - 3)]) longSignals++; else shortSignals++; } }
  }
  if (dna.gapMode > 0) {
    activeIndicators++;
    const gapDir = bars.gapDirection[i], gapSz = bars.gapSize[i];
    if (dna.gapMode === 1) { if (gapSz > 0.3) { if (gapDir > 0) longSignals++; else shortSignals++; } }
    else if (dna.gapMode === 2) { if (gapSz > 0.3) { if (gapDir > 0) shortSignals++; else longSignals++; } }
    else if (dna.gapMode === 3) { if (gapSz > 0.8) { if (gapDir > 0) longSignals++; else shortSignals++; } }
  }
  if (dna.candleMode > 0) {
    activeIndicators++;
    if (dna.candleMode === 1) { if (bars.bodyRatio[i] > 0.7) { if (bars.close[i] > bars.open[i]) longSignals++; else shortSignals++; } }
    else if (dna.candleMode === 2) { if (bars.isDoji[i] === 1) { if (bars.isLongBias[i]) longSignals++; else shortSignals++; } }
    else if (dna.candleMode === 3) { if (bars.isHammer[i] === 1) longSignals++; if (bars.isShootingStar[i] === 1) shortSignals++; }
  }

  if (dna.volMode > 0) {
    if (dna.volMode === 1 && bars.volBucket[i] < 2) return { long: false, short: false };
    if (dna.volMode === 2 && bars.volBucket[i] > 0) return { long: false, short: false };
    if (dna.volMode === 3 && bars.volRatio[i] < 1.5) return { long: false, short: false };
  }
  if (dna.sessionFilter >= 0 && bars.session[i] !== dna.sessionFilter) return { long: false, short: false };
  if (dna.dayFilter >= 0 && bars.dayOfWeek[i] !== (dna.dayFilter + 1)) return { long: false, short: false };
  if (bars.hurst[i] < dna.hurstMin || bars.hurst[i] > dna.hurstMax) return { long: false, short: false };

  if (activeIndicators === 0) return { long: false, short: false };
  const threshold = activeIndicators === 1 ? 1 : Math.ceil(activeIndicators * 0.5);
  const isLong = longSignals >= threshold && longSignals > shortSignals;
  const isShort = shortSignals >= threshold && shortSignals > longSignals;

  if (dna.direction === 0) return { long: isLong, short: false };
  if (dna.direction === 1) return { long: false, short: isShort };
  return { long: isLong, short: isShort };
}

// ── Alpha DNA Simulation (identical to alpha-discovery-engine) ──

function simulateAlphaStrategy(bars: BarArrays, dna: StrategyDNA, comp: BlendComponent): StrategyResult {
  const TRADE_COOLDOWN = 1;
  let instEquity = 1000, instPeak = 1000, instMaxDD = 0;
  let aggEquity = 1000;
  let wins = 0, losses = 0, totalPips = 0, grossWinPips = 0, grossLossPips = 0;
  let cooldown = 0;
  const curve: Array<{ time: string; pips: number }> = [];

  const hasTrailing = dna.trailingATR > 0;
  const hasMaxBars = dna.maxBarsInTrade > 0;
  const hasPartialTP = dna.partialTP > 0;

  for (let i = 1; i < bars.count; i++) {
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

      for (let b = 1; b <= Math.min(16, maxBars) && (i + b) < bars.count; b++) {
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
          if (isLong) { const newTrail = barH - trailATR; if (newTrail > trailStop) trailStop = newTrail; }
          else { const newTrail = barL + trailATR; if (newTrail < trailStop) trailStop = newTrail; }
        }
        if ((isLong && barH >= tpPrice) || (!isLong && barL <= tpPrice)) { exitPips = tp * pipMult * remainingPct; exited = true; break; }
        if ((isLong && barL <= trailStop) || (!isLong && barH >= trailStop)) {
          const slDist = isLong ? (trailStop - entryPrice) : (entryPrice - trailStop);
          exitPips = slDist * pipMult * remainingPct; exited = true; break;
        }
        if (b >= maxBars) {
          const exitPrice = bars.close[Math.min(i + b, bars.count - 1)];
          const dist = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          exitPips = dist * pipMult * remainingPct; exited = true; break;
        }
      }
      if (!exited) {
        if (isLong) {
          if (bars.mfeLong[i] >= tp) exitPips = tp * pipMult * remainingPct;
          else if (bars.maeLong[i] >= sl) exitPips = -sl * pipMult * remainingPct;
          else exitPips = (bars.mfeLong[i] * 0.5 - bars.maeLong[i] * 0.5) * pipMult * remainingPct;
        } else {
          if (bars.mfeShort[i] >= tp) exitPips = tp * pipMult * remainingPct;
          else if (bars.maeShort[i] >= sl) exitPips = -sl * pipMult * remainingPct;
          else exitPips = (bars.mfeShort[i] * 0.5 - bars.maeShort[i] * 0.5) * pipMult * remainingPct;
        }
      }
      pips = partialPips + exitPips;
    } else {
      if (isLong) {
        if (bars.mfeLong[i] >= tp) pips = tp * pipMult;
        else if (bars.maeLong[i] >= sl) pips = -sl * pipMult;
        else pips = (bars.mfeLong[i] * 0.5 - bars.maeLong[i] * 0.5) * pipMult;
      } else {
        if (bars.mfeShort[i] >= tp) pips = tp * pipMult;
        else if (bars.maeShort[i] >= sl) pips = -sl * pipMult;
        else pips = (bars.mfeShort[i] * 0.5 - bars.maeShort[i] * 0.5) * pipMult;
      }
    }

    // Spread friction
    pips -= FRICTION_PIPS;
    totalPips += pips;
    if (pips > 0) { wins++; grossWinPips += pips; } else { losses++; grossLossPips += Math.abs(pips); }

    // Institutional model (1% risk)
    const slPips = sl * pipMult;
    const pipVal = bars.isJPY[i] ? 0.01 : 0.0001;
    const instUnits = slPips > 0 ? computeUnits(instEquity, INSTITUTIONAL_RISK, slPips, pipVal) : 2000;
    const instPnl = pips * instUnits * pipVal;
    const maxInstPnl = instEquity * 0.10;
    instEquity += Math.max(-maxInstPnl, Math.min(maxInstPnl, instPnl));
    if (instEquity > instPeak) instPeak = instEquity;
    const instDD = (instPeak - instEquity) / instPeak;
    if (instDD > instMaxDD) instMaxDD = instDD;

    // Aggressive model (5% risk)
    const aggUnits = slPips > 0 ? computeUnits(aggEquity, AGGRESSIVE_RISK, slPips, pipVal) : 2000;
    const aggPnl = pips * aggUnits * pipVal;
    const maxAggPnl = aggEquity * 0.10;
    aggEquity += Math.max(-maxAggPnl, Math.min(maxAggPnl, aggPnl));

    cooldown = TRADE_COOLDOWN;
    // Use bar index as approximate time reference
    curve.push({ time: `bar-${i}`, pips });
  }

  const trades = wins + losses;
  return {
    id: comp.id, label: comp.label, weight: comp.weight, trades, wins, losses,
    winRate: trades > 0 ? Math.round((wins / trades) * 1000) / 10 : 0,
    totalPips: Math.round(totalPips * 10) / 10,
    profitFactor: grossLossPips > 0 ? Math.round((grossWinPips / grossLossPips) * 100) / 100 : grossWinPips > 0 ? 999 : 0,
    avgWin: wins > 0 ? Math.round((grossWinPips / wins) * 10) / 10 : 0,
    avgLoss: losses > 0 ? Math.round((grossLossPips / losses) * 10) / 10 : 0,
    institutionalProfit: Math.round((instEquity - 1000) * 100) / 100,
    aggressiveProfit: Math.round((aggEquity - 1000) * 100) / 100,
    maxDrawdown: Math.round(-instMaxDD * 1000) / 10,
    equityCurve: curve,
  };
}

// ══════════════════════════════════════════════════════════════
// SECTION 4: Types + Main Handler
// ══════════════════════════════════════════════════════════════

interface BlendComponent {
  id: string;
  predatorRank?: number;
  preyRank?: number;
  requireG3?: boolean;
  slPips: number;
  tpRatio: number;
  weight: number;
  label: string;
  fixedPair?: string;
  session?: string;
  gates?: string;
  dna?: StrategyDNA;
}

interface StrategyResult {
  id: string; label: string; weight: number;
  trades: number; wins: number; losses: number;
  winRate: number; totalPips: number; profitFactor: number;
  avgWin: number; avgLoss: number;
  institutionalProfit: number; aggressiveProfit: number; maxDrawdown: number;
  equityCurve: Array<{ time: string; pips: number }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "live";
    const candleCount: number = Math.min(body.candles || 15000, 42000);
    const components: BlendComponent[] = (body.components || []).map((c: any) => ({
      id: c.id || 'unknown',
      predatorRank: c.predatorRank || 0,
      preyRank: c.preyRank || 0,
      requireG3: c.requireG3 ?? false,
      slPips: c.fixedPips || c.slPips || 30,
      tpRatio: typeof c.tpRatio === 'number' ? c.tpRatio : 2.0,
      weight: c.weight || 0,
      label: c.label || c.id || 'Unknown',
      fixedPair: c.fixedPair || undefined,
      session: c.session || undefined,
      gates: c.gates || (c.requireG3 ? 'G1+G2+G3' : 'G1+G2'),
      dna: c.dna || undefined,
    }));

    if (components.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No components provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rankBased = components.filter(c => c.predatorRank && c.preyRank && !c.fixedPair);
    const alphaBased = components.filter(c => c.fixedPair);
    console.log(`[BLEND-BT v4] Starting — ${components.length} strategies (${rankBased.length} rank, ${alphaBased.length} alpha), ${candleCount} candles (${environment})`);

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    // ── Step 1: Fetch candles ──
    // For rank-based: need all 28 pairs. For alpha: only the specific pairs.
    const neededPairs = new Set<string>();
    if (rankBased.length > 0) {
      for (const cross of availableCrosses) neededPairs.add(cross.instrument);
    }
    for (const comp of alphaBased) {
      if (comp.fixedPair) neededPairs.add(comp.fixedPair);
    }

    const pairCandles: Record<string, Candle[]> = {};
    const pairsToFetch = [...neededPairs];
    for (let i = 0; i < pairsToFetch.length; i += 7) {
      const batch = pairsToFetch.slice(i, i + 7);
      const results = await Promise.allSettled(
        batch.map(pair => fetchCandles(pair, candleCount, environment, apiToken))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          const candles = (results[j] as PromiseFulfilledResult<Candle[]>).value;
          if (candles.length > 0) pairCandles[batch[j]] = candles;
        }
      }
    }
    const pairsLoaded = Object.keys(pairCandles).length;
    const avgCandles = Math.round(Object.values(pairCandles).reduce((s, c) => s + c.length, 0) / Math.max(pairsLoaded, 1));
    console.log(`[BLEND-BT v4] Loaded ${pairsLoaded} pairs, avg ${avgCandles} candles`);

    // ── Step 2: Build rank infrastructure (only if rank-based strategies exist) ──
    let rankSnaps: RankSnap[] = [];
    const pairTimeIndex: Record<string, Record<string, number>> = {};
    const sortedTimes: string[] = [];

    if (rankBased.length > 0) {
      for (const [inst, candles] of Object.entries(pairCandles)) {
        const idx: Record<string, number> = {};
        for (let i = 0; i < candles.length; i++) idx[candles[i].time] = i;
        pairTimeIndex[inst] = idx;
      }
      const allTimestamps = new Set<string>();
      for (const candles of Object.values(pairCandles)) for (const c of candles) allTimestamps.add(c.time);
      sortedTimes.push(...[...allTimestamps].sort());

      const LOOKBACK = 20;
      const pairReturns: Record<string, Record<string, number>> = {};
      for (const [inst, candles] of Object.entries(pairCandles)) {
        const ret: Record<string, number> = {};
        for (let i = LOOKBACK; i < candles.length; i++) {
          let totalRet = 0;
          for (let k = i - LOOKBACK; k < i; k++) { if (candles[k].open !== 0) totalRet += ((candles[k].close - candles[k].open) / candles[k].open) * 100; }
          ret[candles[i].time] = totalRet / LOOKBACK;
        }
        pairReturns[inst] = ret;
      }
      for (const time of sortedTimes) {
        const flows: Record<string, number[]> = {};
        for (const c of ALL_CURRENCIES) flows[c] = [];
        for (const cross of availableCrosses) {
          const ret = pairReturns[cross.instrument]?.[time];
          if (ret === undefined) continue;
          flows[cross.base].push(ret);
          flows[cross.quote].push(-ret);
        }
        let hasData = false;
        const scores: Record<string, number> = {};
        for (const cur of ALL_CURRENCIES) {
          if (flows[cur].length === 0) { scores[cur] = 0; continue; }
          hasData = true;
          scores[cur] = flows[cur].reduce((a, b) => a + b, 0) / flows[cur].length;
        }
        if (!hasData) continue;
        const sorted = [...ALL_CURRENCIES].sort((a, b) => scores[b] - scores[a]);
        const ranks: Record<string, number> = {};
        sorted.forEach((cur, idx) => { ranks[cur] = idx + 1; });
        rankSnaps.push({ time, ranks });
      }
      console.log(`[BLEND-BT v4] ${rankSnaps.length} rank snapshots`);
    }

    // ── Step 3: Simulate each strategy ──
    const strategyResults: StrategyResult[] = [];
    const signalCache: Record<string, CompactSignal[]> = {};

    // 3a: Rank-based strategies (profile-live-backtest parity)
    for (const comp of rankBased) {
      const exitModes = [{ slPips: comp.slPips, tpRatio: comp.tpRatio }];
      const cacheKey = `rank:${comp.predatorRank}_${comp.preyRank}:sl${comp.slPips}:tp${comp.tpRatio}`;
      if (!signalCache[cacheKey]) {
        signalCache[cacheKey] = generateRankSignals(comp.predatorRank!, comp.preyRank!, rankSnaps, pairCandles, pairTimeIndex, exitModes);
      }
      const signals = signalCache[cacheKey];
      console.log(`[BLEND-BT v4] RANK ${comp.id}: ${signals.length} signals`);
      strategyResults.push(simulateRankStrategy(comp, signals, 0, comp.slPips));
    }

    // 3b: Alpha-based strategies (alpha-discovery-engine parity)
    const featureCache: Record<string, BarArrays> = {};
    for (const comp of alphaBased) {
      if (!comp.fixedPair || !pairCandles[comp.fixedPair]) {
        console.log(`[BLEND-BT v4] ALPHA ${comp.id}: skipped — no candle data for ${comp.fixedPair}`);
        continue;
      }

      if (!comp.dna) {
        console.log(`[BLEND-BT v4] ALPHA ${comp.id}: skipped — no DNA provided, cannot simulate with parity`);
        continue;
      }

      // Build feature arrays (cached per pair)
      if (!featureCache[comp.fixedPair]) {
        console.log(`[BLEND-BT v4] Building feature arrays for ${comp.fixedPair}…`);
        featureCache[comp.fixedPair] = buildFeatureArrays(comp.fixedPair, pairCandles[comp.fixedPair]);
      }
      const bars = featureCache[comp.fixedPair];
      console.log(`[BLEND-BT v4] ALPHA ${comp.id}: ${bars.count} bars, simulating with full DNA…`);
      strategyResults.push(simulateAlphaStrategy(bars, comp.dna, comp));
    }

    // ── Step 4: Aggregate portfolio ──
    interface PortfolioTrade { time: string; pips: number; weight: number; slPips: number; isJPY: boolean; }
    const allPortfolioTrades: PortfolioTrade[] = [];
    for (const sr of strategyResults) {
      const comp = components.find(c => c.id === sr.id)!;
      const isJPY = comp.fixedPair?.includes('JPY') || false;
      for (const pt of sr.equityCurve) {
        allPortfolioTrades.push({ time: pt.time, pips: pt.pips, weight: sr.weight, slPips: comp.slPips, isJPY });
      }
    }
    allPortfolioTrades.sort((a, b) => a.time.localeCompare(b.time));

    let portfolioEquity = BASE_EQUITY, peak = BASE_EQUITY, maxDD = 0;
    let aggEquity = BASE_EQUITY, aggPeak = BASE_EQUITY, aggMaxDD = 0;
    let totalWins = 0, totalLosses = 0, totalPips = 0, grossWinPips = 0, grossLossPips = 0;
    const equityCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];
    const aggCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];
    const maxWeight = Math.max(...components.map(c => c.weight), 0.01);

    for (const trade of allPortfolioTrades) {
      const pipVal = trade.isJPY ? 0.01 : 0.0001;
      totalPips += trade.pips;
      if (trade.pips > 0) { totalWins++; grossWinPips += trade.pips; }
      else { totalLosses++; grossLossPips += Math.abs(trade.pips); }
      const instRisk = portfolioEquity * INSTITUTIONAL_RISK * trade.weight / maxWeight;
      const instUnits = trade.slPips > 0 ? Math.min(instRisk / (trade.slPips * pipVal), MAX_UNITS) : 0;
      portfolioEquity += trade.pips * instUnits * pipVal;
      if (portfolioEquity > peak) peak = portfolioEquity;
      const dd = (peak - portfolioEquity) / peak;
      if (dd > maxDD) maxDD = dd;
      equityCurve.push({ time: trade.time, equity: Math.round(portfolioEquity * 100) / 100 });
      const aggRisk = aggEquity * AGGRESSIVE_RISK * trade.weight / maxWeight;
      const aggUnits = trade.slPips > 0 ? Math.min(aggRisk / (trade.slPips * pipVal), MAX_UNITS) : 0;
      aggEquity += trade.pips * aggUnits * pipVal;
      if (aggEquity > aggPeak) aggPeak = aggEquity;
      const aggDd = (aggPeak - aggEquity) / aggPeak;
      if (aggDd > aggMaxDD) aggMaxDD = aggDd;
      aggCurve.push({ time: trade.time, equity: Math.round(aggEquity * 100) / 100 });
    }

    const totalTrades = totalWins + totalLosses;
    const profitFactor = grossLossPips > 0 ? Math.round((grossWinPips / grossLossPips) * 100) / 100 : grossWinPips > 0 ? 999 : 0;
    const downsample = (curve: Array<{ time: string; equity: number }>, maxPts = 300) => {
      if (curve.length <= maxPts) return curve;
      const step = Math.max(1, Math.floor(curve.length / maxPts));
      return curve.filter((_, i) => i % step === 0 || i === curve.length - 1);
    };

    const actualDays = avgCandles / 44;
    const periods = [{ label: '3D', days: 3 }, { label: '7D', days: 7 }, { label: '14D', days: 14 }, { label: '30D', days: 30 }, { label: '60D', days: 60 }];
    const flatUnits = 2000;
    const periodStats = periods.map(p => {
      const fraction = p.days / actualDays;
      const periodPips = totalPips * fraction;
      const periodReturn = periodPips * flatUnits * 0.0001;
      return {
        period: p.label,
        returnPct: Math.round((periodReturn / BASE_EQUITY) * 10000) / 100,
        winRate: totalTrades > 0 ? Math.round((totalWins / totalTrades) * 1000) / 10 : 0,
        profitFactor,
        maxDD: Math.round(-maxDD * 1000) / 10,
        netPips: Math.round(periodPips * 10) / 10,
        trades: Math.round(totalTrades * fraction),
      };
    });

    const result = {
      success: true,
      version: "blend-bt-4.0-true-parity",
      timestamp: new Date().toISOString(),
      environment,
      candlesPerPair: avgCandles,
      pairsLoaded,
      totalSnapshots: rankSnaps.length,
      componentsUsed: components.length,
      dateRange: { start: sortedTimes[0] || Object.values(pairCandles)[0]?.[0]?.time || '', end: sortedTimes[sortedTimes.length - 1] || Object.values(pairCandles)[0]?.slice(-1)[0]?.time || '' },
      portfolio: {
        totalTrades, wins: totalWins, losses: totalLosses,
        winRate: totalTrades > 0 ? Math.round((totalWins / totalTrades) * 1000) / 10 : 0,
        profitFactor,
        totalPips: Math.round(totalPips * 10) / 10,
        maxDrawdown: Math.round(-maxDD * 1000) / 10,
        aggressiveMaxDD: Math.round(-aggMaxDD * 1000) / 10,
        institutionalProfit: Math.round((portfolioEquity - BASE_EQUITY) * 100) / 100,
        aggressiveProfit: Math.round((aggEquity - BASE_EQUITY) * 100) / 100,
        finalEquity: Math.round(portfolioEquity * 100) / 100,
        aggressiveFinalEquity: Math.round(aggEquity * 100) / 100,
        expectancy: totalTrades > 0 ? Math.round((totalPips / totalTrades) * 100) / 100 : 0,
        avgWin: totalWins > 0 ? Math.round((grossWinPips / totalWins) * 10) / 10 : 0,
        avgLoss: totalLosses > 0 ? Math.round((grossLossPips / totalLosses) * 10) / 10 : 0,
      },
      components: strategyResults.map(sr => ({
        id: sr.id, label: sr.label, weight: sr.weight, trades: sr.trades, wins: sr.wins, losses: sr.losses,
        winRate: sr.winRate, totalPips: sr.totalPips, profitFactor: sr.profitFactor, avgWin: sr.avgWin, avgLoss: sr.avgLoss,
      })),
      periodStats,
      equityCurve: downsample(equityCurve),
      aggressiveEquityCurve: downsample(aggCurve),
    };

    console.log(`[BLEND-BT v4] Done. ${totalTrades} trades, PF=${profitFactor}, Net=${Math.round(totalPips)}p, Inst=$${Math.round(portfolioEquity - BASE_EQUITY)}, Agg=$${Math.round(aggEquity - BASE_EQUITY)}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[BLEND-BT v4] Error:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
