// Alpha Discovery Engine v2.0 — Genetic Algorithm Strategy Breeder
// Evolves millions of parameter combinations through natural selection
// Fitness: (ProfitFactor * WinRate) / MaxDrawdown with correlation penalty
// Genes: Ranks, Gates, Sessions, SL/TP ATR multipliers, Hurst thresholds

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const PAIRS = [
  "EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD",
  "USD_CAD", "USD_CHF", "USD_JPY",
  "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
];

// ── Types ──────────────────────────────────────────────────────────────────
interface Candle {
  time: string;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

// Strategy DNA — each gene is a parameter the GA can mutate
interface StrategyDNA {
  predatorRankMax: number;   // 1-4: buy when predator rank ≤ this
  preyRankMin: number;       // 5-8: buy when prey rank ≥ this
  gate1Required: boolean;
  gate2Required: boolean;
  gate3Required: boolean;
  sessionFilter: number;     // -1=all, 0=asia, 1=london, 2=ny, 3=nyclose
  slMultiplier: number;      // SL in ATR multiples (0.5-3.0)
  tpMultiplier: number;      // TP in ATR multiples (1.0-5.0)
  hurstMin: number;          // min hurst threshold (0.0-1.0)
  hurstMax: number;          // max hurst threshold (0.0-1.0)
  volFilter: number;         // 0=no filter, 1=high vol only, 2=low vol only
  direction: number;         // 0=long only, 1=short only, 2=both
}

interface SimResult {
  trades: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  totalPips: number;
  maxDrawdown: number;
  grossProfit: number;
  grossLoss: number;
  equityCurve: number[];
  dailyReturns: number[];
}

interface ScoredIndividual {
  dna: StrategyDNA;
  fitness: number;
  sim: SimResult;
  correlation: number;
  plainEnglish: string;
}

// ── Precomputed Feature Row (flat arrays for speed) ──
interface BarData {
  close: number;
  atr: number;
  hurst: number;
  predatorRank: number;
  preyRank: number;
  gate1: number;  // 0 or 1
  gate2: number;
  gate3: number;
  session: number;
  volBucket: number; // 0=low, 1=mid, 2=high
  isLongBias: number; // 1=long, 0=short
  mfe: number;
  mae: number;
  isJPY: number;
}

// ── Helper Functions ───────────────────────────────────────────────────────

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
  if (count <= PAGE_SIZE) {
    return fetchCandlePage(instrument, count, env, token);
  }
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

function computeATR(candles: Candle[], period = 14): number[] {
  const atrs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { atrs.push(0); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tr = Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - candles[j - 1].close),
        Math.abs(candles[j].low - candles[j - 1].close)
      );
      sum += tr;
    }
    atrs.push(sum / period);
  }
  return atrs;
}

function computeHurst(closes: number[], window = 20): number {
  if (closes.length < window) return 0.5;
  const slice = closes.slice(-window);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const deviations = returns.map(r => r - mean);
  const cumDev: number[] = [];
  let cumSum = 0;
  for (const d of deviations) { cumSum += d; cumDev.push(cumSum); }
  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(deviations.reduce((a, d) => a + d * d, 0) / deviations.length);
  if (S === 0) return 0.5;
  return Math.log(R / S) / Math.log(returns.length);
}

function getSession(time: string): number {
  const h = new Date(time).getUTCHours();
  if (h < 7) return 0;
  if (h < 12) return 1;
  if (h < 17) return 2;
  return 3;
}

function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function computePercentReturn(candles: Candle[], periods = 20): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(periods, candles.length));
  let total = 0;
  for (const c of slice) {
    if (c.open !== 0) total += ((c.close - c.open) / c.open) * 100;
  }
  return total / slice.length;
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

// ── Vectorized Simulation Engine ──────────────────────────────────────────
// Operates on flat arrays — no objects, no iteration overhead

function simulateStrategy(bars: BarData[], dna: StrategyDNA): SimResult {
  let equity = 10000;
  let peak = equity;
  let maxDD = 0;
  let trades = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  const curve: number[] = [];
  const dailyReturns: number[] = [];
  let dayCounter = 0;
  let dayStart = equity;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];

    // ── Gene filters ──
    if (b.predatorRank > dna.predatorRankMax) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (b.preyRank < dna.preyRankMin) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.gate1Required && b.gate1 === 0) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.gate2Required && b.gate2 === 0) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.gate3Required && b.gate3 === 0) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.sessionFilter >= 0 && b.session !== dna.sessionFilter) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (b.hurst < dna.hurstMin || b.hurst > dna.hurstMax) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.volFilter === 1 && b.volBucket < 2) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.volFilter === 2 && b.volBucket > 0) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.direction === 0 && b.isLongBias === 0) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }
    if (dna.direction === 1 && b.isLongBias === 1) { curve.push(equity); dayCounter++; if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / dayStart); dayStart = equity; dayCounter = 0; } continue; }

    // ── SL/TP evaluation ──
    const sl = b.atr * dna.slMultiplier;
    const tp = b.atr * dna.tpMultiplier;
    const pipMult = b.isJPY ? 100 : 10000;

    let pips: number;
    if (b.mfe >= tp) {
      pips = tp * pipMult;
    } else if (b.mae >= sl) {
      pips = -sl * pipMult;
    } else {
      // Partial: net of MFE - MAE
      pips = (b.mfe - b.mae * 0.5) * pipMult;
    }

    trades++;
    if (pips > 0) { wins++; grossProfit += pips; }
    else { grossLoss += Math.abs(pips); }

    equity += pips * 0.01; // $0.01 per pip
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;

    curve.push(equity);
    dayCounter++;
    if (dayCounter >= 48) {
      dailyReturns.push((equity - dayStart) / dayStart);
      dayStart = equity;
      dayCounter = 0;
    }
  }

  const winRate = trades > 0 ? wins / trades : 0;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const totalPips = grossProfit - grossLoss;

  return {
    trades, wins, winRate, profitFactor: pf, totalPips,
    maxDrawdown: maxDD, grossProfit, grossLoss,
    equityCurve: curve, dailyReturns,
  };
}

// ── Genetic Algorithm Core ────────────────────────────────────────────────

function randomDNA(): StrategyDNA {
  return {
    predatorRankMax: 1 + Math.floor(Math.random() * 4),     // 1-4
    preyRankMin: 5 + Math.floor(Math.random() * 4),          // 5-8
    gate1Required: Math.random() > 0.5,
    gate2Required: Math.random() > 0.5,
    gate3Required: Math.random() > 0.5,
    sessionFilter: Math.floor(Math.random() * 5) - 1,        // -1 to 3
    slMultiplier: 0.5 + Math.random() * 2.5,                 // 0.5-3.0
    tpMultiplier: 1.0 + Math.random() * 4.0,                 // 1.0-5.0
    hurstMin: Math.random() * 0.5,                            // 0.0-0.5
    hurstMax: 0.5 + Math.random() * 0.5,                      // 0.5-1.0
    volFilter: Math.floor(Math.random() * 3),                 // 0-2
    direction: Math.floor(Math.random() * 3),                 // 0-2
  };
}

function crossover(a: StrategyDNA, b: StrategyDNA): StrategyDNA {
  return {
    predatorRankMax: Math.random() > 0.5 ? a.predatorRankMax : b.predatorRankMax,
    preyRankMin: Math.random() > 0.5 ? a.preyRankMin : b.preyRankMin,
    gate1Required: Math.random() > 0.5 ? a.gate1Required : b.gate1Required,
    gate2Required: Math.random() > 0.5 ? a.gate2Required : b.gate2Required,
    gate3Required: Math.random() > 0.5 ? a.gate3Required : b.gate3Required,
    sessionFilter: Math.random() > 0.5 ? a.sessionFilter : b.sessionFilter,
    slMultiplier: Math.random() > 0.5 ? a.slMultiplier : b.slMultiplier,
    tpMultiplier: Math.random() > 0.5 ? a.tpMultiplier : b.tpMultiplier,
    hurstMin: Math.random() > 0.5 ? a.hurstMin : b.hurstMin,
    hurstMax: Math.random() > 0.5 ? a.hurstMax : b.hurstMax,
    volFilter: Math.random() > 0.5 ? a.volFilter : b.volFilter,
    direction: Math.random() > 0.5 ? a.direction : b.direction,
  };
}

function mutate(dna: StrategyDNA, rate = 0.15): StrategyDNA {
  const d = { ...dna };
  if (Math.random() < rate) d.predatorRankMax = 1 + Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.preyRankMin = 5 + Math.floor(Math.random() * 4);
  if (Math.random() < rate) d.gate1Required = !d.gate1Required;
  if (Math.random() < rate) d.gate2Required = !d.gate2Required;
  if (Math.random() < rate) d.gate3Required = !d.gate3Required;
  if (Math.random() < rate) d.sessionFilter = Math.floor(Math.random() * 5) - 1;
  if (Math.random() < rate) d.slMultiplier = Math.max(0.3, Math.min(3.5, d.slMultiplier + (Math.random() - 0.5) * 0.6));
  if (Math.random() < rate) d.tpMultiplier = Math.max(0.5, Math.min(6.0, d.tpMultiplier + (Math.random() - 0.5) * 1.0));
  if (Math.random() < rate) d.hurstMin = Math.max(0, Math.min(0.9, d.hurstMin + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.hurstMax = Math.max(d.hurstMin + 0.1, Math.min(1.0, d.hurstMax + (Math.random() - 0.5) * 0.15));
  if (Math.random() < rate) d.volFilter = Math.floor(Math.random() * 3);
  if (Math.random() < rate) d.direction = Math.floor(Math.random() * 3);
  return d;
}

function tournamentSelect(pop: ScoredIndividual[], k = 3): ScoredIndividual {
  let best: ScoredIndividual | null = null;
  for (let i = 0; i < k; i++) {
    const candidate = pop[Math.floor(Math.random() * pop.length)];
    if (!best || candidate.fitness > best.fitness) best = candidate;
  }
  return best!;
}

function dnaToEnglish(dna: StrategyDNA): string {
  const sessions = ['Asia', 'London', 'New York', 'NY Close'];
  const dirs = ['LONG only', 'SHORT only', 'BOTH directions'];
  const parts: string[] = [];
  parts.push(`Predator Rank ≤ ${dna.predatorRankMax}`);
  parts.push(`Prey Rank ≥ ${dna.preyRankMin}`);
  if (dna.gate1Required) parts.push('Gate 1 (Momentum) = ON');
  if (dna.gate2Required) parts.push('Gate 2 (Breakout) = ON');
  if (dna.gate3Required) parts.push('Gate 3 (Vector) = ON');
  if (dna.sessionFilter >= 0) parts.push(`Session = ${sessions[dna.sessionFilter]}`);
  parts.push(`SL = ${dna.slMultiplier.toFixed(1)} ATR`);
  parts.push(`TP = ${dna.tpMultiplier.toFixed(1)} ATR`);
  parts.push(`Hurst ${dna.hurstMin.toFixed(2)}–${dna.hurstMax.toFixed(2)}`);
  if (dna.volFilter === 1) parts.push('High Vol Only');
  if (dna.volFilter === 2) parts.push('Low Vol Only');
  parts.push(dirs[dna.direction]);
  return parts.join(' · ');
}

// ── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "live";
    const populationSize = Math.min(body.populationSize || 100, 200);
    const generations = Math.min(body.generations || 50, 80);
    const maxCorrelation = body.maxCorrelation || 0.2;
    const candleCount = body.candles || 42000;
    const mutationRate = body.mutationRate || 0.15;

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GA ENGINE] Fetching ${candleCount} M30 candles for ${PAIRS.length} pairs (env: ${environment})`);

    // ── Step 1: Fetch all candle data ──
    const pairResults = await Promise.allSettled(
      PAIRS.map(async (pair) => {
        const candles = await fetchCandles(pair, candleCount, environment, apiToken);
        return { pair, candles };
      })
    );

    // ── Step 2: Build flat feature arrays ──
    const allBars: BarData[] = [];
    const baselineReturns: number[] = [];

    for (const result of pairResults) {
      if (result.status !== "fulfilled" || !result.value.candles || result.value.candles.length < 30) continue;
      const { pair, candles } = result.value;
      const isJPY = pair.includes('JPY') ? 1 : 0;
      const atrs = computeATR(candles, 14);

      // Compute rolling volatility percentiles for this pair
      const allVols: number[] = [];
      for (let i = 20; i < candles.length; i++) {
        const window = candles.slice(i - 20, i);
        const closes = window.map(c => c.close);
        if (closes.length > 1) {
          const vol = Math.sqrt(closes.slice(1).reduce((s, c, idx) => s + Math.pow(Math.log(c / closes[idx]), 2), 0) / (closes.length - 1));
          allVols.push(vol);
        }
      }
      allVols.sort((a, b) => a - b);
      const p33 = allVols[Math.floor(allVols.length * 0.33)] || 0;
      const p66 = allVols[Math.floor(allVols.length * 0.66)] || 0;

      for (let i = 20; i < candles.length - 8; i++) {
        const window = candles.slice(i - 20, i);
        const closes = window.map(c => c.close);
        const currentATR = atrs[i] || atrs[i - 1] || 0.001;

        const pctReturn = computePercentReturn(window, 20);
        const predatorRank = pctReturn > 0.02 ? 1 : pctReturn > 0.01 ? 2 : pctReturn > 0.005 ? 3 : pctReturn > 0 ? 4 : pctReturn > -0.005 ? 5 : pctReturn > -0.01 ? 6 : pctReturn > -0.02 ? 7 : 8;
        const preyRank = (-pctReturn) > 0.02 ? 1 : (-pctReturn) > 0.01 ? 2 : (-pctReturn) > 0.005 ? 3 : (-pctReturn) > 0 ? 4 : (-pctReturn) > -0.005 ? 5 : (-pctReturn) > -0.01 ? 6 : (-pctReturn) > -0.02 ? 7 : 8;

        const snap20High = Math.max(...window.map(c => c.high));
        const snap20Low = Math.min(...window.map(c => c.low));
        const gate1 = (predatorRank <= 3 && preyRank >= 6) ? 1 : 0;
        const gate2 = (candles[i].close > snap20High || candles[i].close < snap20Low) ? 1 : 0;
        const slope = linearRegressionSlope(closes);
        const gate3 = (Math.abs(slope) > currentATR * 0.01) ? 1 : 0;

        const hurst = computeHurst(closes, 20);

        const rollingVol = closes.length > 1
          ? Math.sqrt(closes.slice(1).reduce((s, c, idx) => s + Math.pow(Math.log(c / closes[idx]), 2), 0) / (closes.length - 1))
          : 0;
        const volBucket = rollingVol <= p33 ? 0 : rollingVol <= p66 ? 1 : 2;

        const isLongBias = pctReturn > 0 ? 1 : 0;

        // Future MFE/MAE over next 8 bars
        const futureSlice = candles.slice(i + 1, i + 9);
        let mfe = 0, mae = 0;
        for (const fc of futureSlice) {
          if (isLongBias) {
            const fav = fc.high - candles[i].close;
            const adv = candles[i].close - fc.low;
            if (fav > mfe) mfe = fav;
            if (adv > mae) mae = adv;
          } else {
            const fav = candles[i].close - fc.low;
            const adv = fc.high - candles[i].close;
            if (fav > mfe) mfe = fav;
            if (adv > mae) mae = adv;
          }
        }

        // Baseline strategy return
        const baseReturn = (gate1 && gate2 && gate3) ? mfe : 0;
        baselineReturns.push(baseReturn);

        allBars.push({
          close: candles[i].close, atr: currentATR, hurst,
          predatorRank, preyRank, gate1, gate2, gate3,
          session: getSession(candles[i].time),
          volBucket, isLongBias, mfe, mae, isJPY,
        });
      }
    }

    console.log(`[GA ENGINE] Built ${allBars.length} feature bars from ${PAIRS.length} pairs`);

    if (allBars.length < 200) {
      return new Response(
        JSON.stringify({ error: "Insufficient data for GA evolution", barCount: allBars.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Subsample bars for speed if very large
    let simBars = allBars;
    if (allBars.length > 15000) {
      const stride = Math.ceil(allBars.length / 15000);
      simBars = allBars.filter((_, i) => i % stride === 0);
      console.log(`[GA ENGINE] Subsampled ${allBars.length} → ${simBars.length} bars for GA simulation`);
    }

    // Baseline daily returns for correlation check
    const baseEquity: number[] = [];
    let baseEq = 10000;
    for (const br of baselineReturns) {
      baseEq += br * 10000 * 0.001;
      baseEquity.push(baseEq);
    }
    const baseDailyReturns: number[] = [];
    for (let i = 48; i < baseEquity.length; i += 48) {
      baseDailyReturns.push((baseEquity[i] - baseEquity[i - 48]) / baseEquity[i - 48]);
    }

    // ── Step 3: Genetic Algorithm Evolution ──
    console.log(`[GA ENGINE] Initializing population=${populationSize}, generations=${generations}`);

    const evolutionLog: Array<{ gen: number; bestFitness: number; avgFitness: number; bestTrades: number }> = [];
    let totalSimulations = 0;

    // Fitness function with correlation penalty
    function evaluateIndividual(dna: StrategyDNA): ScoredIndividual {
      totalSimulations++;
      const sim = simulateStrategy(simBars, dna);

      // Core fitness: (PF * WR) / MaxDD
      let fitness = 0;
      if (sim.trades >= 20 && sim.maxDrawdown > 0.001) {
        fitness = (sim.profitFactor * sim.winRate) / sim.maxDrawdown;
      } else if (sim.trades >= 20 && sim.maxDrawdown <= 0.001) {
        fitness = sim.profitFactor * sim.winRate * 10; // Reward tiny drawdowns
      }

      // Penalty: too few trades
      if (sim.trades < 20) fitness *= 0.01;
      if (sim.trades < 50) fitness *= 0.5;

      // Bonus: more trades = more statistical significance
      if (sim.trades > 200) fitness *= 1.1;
      if (sim.trades > 500) fitness *= 1.15;

      // Correlation penalty
      const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
      if (corr > maxCorrelation) {
        fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);
      }

      return {
        dna, fitness, sim,
        correlation: corr,
        plainEnglish: dnaToEnglish(dna),
      };
    }

    // Initialize population
    let population: ScoredIndividual[] = [];
    for (let i = 0; i < populationSize; i++) {
      population.push(evaluateIndividual(randomDNA()));
    }
    population.sort((a, b) => b.fitness - a.fitness);

    // Evolution loop
    for (let gen = 0; gen < generations; gen++) {
      const newPop: ScoredIndividual[] = [];

      // Elitism: keep top 10%
      const eliteCount = Math.max(2, Math.floor(populationSize * 0.1));
      for (let i = 0; i < eliteCount; i++) {
        newPop.push(population[i]);
      }

      // Fill rest with crossover + mutation
      while (newPop.length < populationSize) {
        const parent1 = tournamentSelect(population);
        const parent2 = tournamentSelect(population);
        let child = crossover(parent1.dna, parent2.dna);
        child = mutate(child, mutationRate);
        newPop.push(evaluateIndividual(child));
      }

      population = newPop.sort((a, b) => b.fitness - a.fitness);

      const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
      evolutionLog.push({
        gen: gen + 1,
        bestFitness: Math.round(population[0].fitness * 1000) / 1000,
        avgFitness: Math.round(avgFitness * 1000) / 1000,
        bestTrades: population[0].sim.trades,
      });

      if (gen % 10 === 0) {
        console.log(`[GA ENGINE] Gen ${gen + 1}: best=${population[0].fitness.toFixed(3)}, avg=${avgFitness.toFixed(3)}, trades=${population[0].sim.trades}`);
      }
    }

    console.log(`[GA ENGINE] Evolution complete. ${totalSimulations} total simulations evaluated.`);

    // ── Step 4: Extract top individuals ──
    // Re-simulate top candidates on FULL data for final stats
    const topCandidates = population
      .filter(p => p.sim.trades >= 20 && p.sim.profitFactor > 1.0)
      .slice(0, 20);

    // Deduplicate similar strategies (same gate/rank combo)
    const seen = new Set<string>();
    const uniqueTop: ScoredIndividual[] = [];
    for (const c of topCandidates) {
      const key = `${c.dna.predatorRankMax}-${c.dna.preyRankMin}-${c.dna.gate1Required}-${c.dna.gate2Required}-${c.dna.gate3Required}-${c.dna.sessionFilter}-${c.dna.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Re-simulate on full data
      const fullSim = allBars.length !== simBars.length ? simulateStrategy(allBars, c.dna) : c.sim;
      const fullCorr = Math.abs(pearsonCorrelation(baseDailyReturns, fullSim.dailyReturns));

      uniqueTop.push({
        ...c,
        sim: fullSim,
        correlation: fullCorr,
        fitness: fullSim.trades >= 20 && fullSim.maxDrawdown > 0.001
          ? (fullSim.profitFactor * fullSim.winRate) / fullSim.maxDrawdown
          : fullSim.profitFactor * fullSim.winRate * 10,
      });
    }

    // Final filter & sort
    const uncorrelatedProfiles = uniqueTop
      .filter(p => p.correlation <= maxCorrelation && p.sim.profitFactor > 1.0 && p.sim.trades >= 20)
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 10);

    const allProfiles = uniqueTop
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 20);

    // Downsample equity curves for response size
    function downsampleCurve(curve: number[], maxPoints = 200): number[] {
      if (curve.length <= maxPoints) return curve;
      const stride = Math.ceil(curve.length / maxPoints);
      return curve.filter((_, i) => i % stride === 0);
    }

    const formatProfile = (p: ScoredIndividual) => ({
      dna: p.dna,
      fitness: Math.round(p.fitness * 1000) / 1000,
      winRate: Math.round(p.sim.winRate * 10000) / 10000,
      profitFactor: Math.round(p.sim.profitFactor * 100) / 100,
      trades: p.sim.trades,
      totalPips: Math.round(p.sim.totalPips * 10) / 10,
      maxDrawdown: Math.round(p.sim.maxDrawdown * 10000) / 10000,
      grossProfit: Math.round(p.sim.grossProfit * 10) / 10,
      grossLoss: Math.round(p.sim.grossLoss * 10) / 10,
      correlation: Math.round(p.correlation * 1000) / 1000,
      equityCurve: downsampleCurve(p.sim.equityCurve),
      plainEnglish: p.plainEnglish,
    });

    console.log(`[GA ENGINE] ${uncorrelatedProfiles.length} uncorrelated profiles (ρ ≤ ${maxCorrelation}), ${allProfiles.length} total profiles`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        environment,
        dataPoints: allBars.length,
        totalSimulations,
        gaStats: {
          populationSize,
          generations,
          mutationRate,
          maxCorrelation,
          totalSimulations,
          finalBestFitness: population[0]?.fitness || 0,
        },
        evolutionLog: evolutionLog.filter((_, i) => i % Math.max(1, Math.floor(evolutionLog.length / 50)) === 0),
        uncorrelatedProfiles: uncorrelatedProfiles.map(formatProfile),
        allProfiles: allProfiles.map(formatProfile),
        baselineEquityCurve: downsampleCurve(baseEquity),
        config: { populationSize, generations, maxCorrelation, candleCount, mutationRate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[GA ENGINE] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
