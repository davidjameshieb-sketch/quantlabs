// Alpha Discovery Engine v3.0 — Phased GA State Machine
// Phase 1: Fetch candles, compute features, store in sovereign_memory
// Phase 2: Run 1 generation per invocation, persist population state
// Phase 3: Extract top strategies, verify on full data, return results
//
// This architecture bypasses edge function CPU limits by splitting
// the GA across many short-lived invocations with DB-backed state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

// ── Types ──────────────────────────────────────────────────────────────────
interface Candle { time: string; volume: number; high: number; low: number; open: number; close: number; }

interface StrategyDNA {
  predatorRankMax: number; preyRankMin: number;
  gate1Required: boolean; gate2Required: boolean; gate3Required: boolean;
  sessionFilter: number; slMultiplier: number; tpMultiplier: number;
  hurstMin: number; hurstMax: number; volFilter: number; direction: number;
}

interface SimResult {
  trades: number; wins: number; winRate: number; profitFactor: number;
  totalPips: number; maxDrawdown: number; grossProfit: number; grossLoss: number;
  equityCurve: number[]; dailyReturns: number[];
}

interface ScoredIndividual {
  dna: StrategyDNA; fitness: number; sim: SimResult;
  correlation: number; plainEnglish: string;
}

// Flat bar for simulation — stored as parallel arrays for compact serialization
interface BarArrays {
  close: number[]; atr: number[]; hurst: number[];
  predatorRank: number[]; preyRank: number[];
  gate1: number[]; gate2: number[]; gate3: number[];
  session: number[]; volBucket: number[]; isLongBias: number[];
  mfe: number[]; mae: number[]; isJPY: number[];
  count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function computeATR(candles: Candle[], period = 14): number[] {
  const atrs: number[] = new Array(candles.length);
  for (let i = 0; i < period; i++) atrs[i] = 0;
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

function linearRegressionSlope(closes: number[], start: number, window: number): number {
  if (window < 2 || start < window - 1) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < window; i++) {
    const y = closes[start - window + 1 + i];
    sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
  }
  const denom = window * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (window * sumXY - sumX * sumY) / denom;
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

// ── Build feature arrays from candles ──────────────────────────────────────
function buildFeatureArrays(pair: string, candles: Candle[]): BarArrays {
  const isJPY = pair.includes('JPY') ? 1 : 0;
  const atrs = computeATR(candles, 14);
  const closes = candles.map(c => c.close);
  const n = candles.length;

  // Precompute volatility percentiles
  const vols: number[] = [];
  for (let i = 20; i < n; i++) {
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) {
      if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; }
    }
    vols.push(Math.sqrt(ssq / 19));
  }
  vols.sort((a, b) => a - b);
  const p33 = vols[Math.floor(vols.length * 0.33)] || 0;
  const p66 = vols[Math.floor(vols.length * 0.66)] || 0;

  const bars: BarArrays = {
    close: [], atr: [], hurst: [], predatorRank: [], preyRank: [],
    gate1: [], gate2: [], gate3: [], session: [], volBucket: [],
    isLongBias: [], mfe: [], mae: [], isJPY: [], count: 0,
  };

  for (let i = 20; i < n - 8; i++) {
    const currentATR = atrs[i] || 0.001;

    // Percent return over last 20 bars
    let pctReturnSum = 0;
    for (let j = i - 19; j <= i; j++) {
      if (candles[j].open !== 0) pctReturnSum += ((candles[j].close - candles[j].open) / candles[j].open) * 100;
    }
    const pctReturn = pctReturnSum / 20;

    const predatorRank = pctReturn > 0.02 ? 1 : pctReturn > 0.01 ? 2 : pctReturn > 0.005 ? 3 : pctReturn > 0 ? 4 : pctReturn > -0.005 ? 5 : pctReturn > -0.01 ? 6 : pctReturn > -0.02 ? 7 : 8;
    const negRet = -pctReturn;
    const preyRank = negRet > 0.02 ? 1 : negRet > 0.01 ? 2 : negRet > 0.005 ? 3 : negRet > 0 ? 4 : negRet > -0.005 ? 5 : negRet > -0.01 ? 6 : negRet > -0.02 ? 7 : 8;

    // Gates
    let snap20High = -Infinity, snap20Low = Infinity;
    for (let j = i - 20; j < i; j++) {
      if (candles[j].high > snap20High) snap20High = candles[j].high;
      if (candles[j].low < snap20Low) snap20Low = candles[j].low;
    }
    const gate1 = (predatorRank <= 3 && preyRank >= 6) ? 1 : 0;
    const gate2 = (candles[i].close > snap20High || candles[i].close < snap20Low) ? 1 : 0;
    const slope = linearRegressionSlope(closes, i, 20);
    const gate3 = (Math.abs(slope) > currentATR * 0.01) ? 1 : 0;

    const hurst = computeHurst(closes, i, 20);

    // Volatility bucket
    let ssq = 0;
    for (let j = i - 19; j <= i; j++) {
      if (closes[j - 1] > 0) { const lr = Math.log(closes[j] / closes[j - 1]); ssq += lr * lr; }
    }
    const rollingVol = Math.sqrt(ssq / 19);
    const volBucket = rollingVol <= p33 ? 0 : rollingVol <= p66 ? 1 : 2;

    const isLongBias = pctReturn > 0 ? 1 : 0;

    // Future MFE/MAE over 8 bars
    let mfe = 0, mae = 0;
    for (let j = i + 1; j <= i + 8 && j < n; j++) {
      if (isLongBias) {
        const fav = candles[j].high - candles[i].close;
        const adv = candles[i].close - candles[j].low;
        if (fav > mfe) mfe = fav;
        if (adv > mae) mae = adv;
      } else {
        const fav = candles[i].close - candles[j].low;
        const adv = candles[j].high - candles[i].close;
        if (fav > mfe) mfe = fav;
        if (adv > mae) mae = adv;
      }
    }

    bars.close.push(candles[i].close); bars.atr.push(currentATR); bars.hurst.push(hurst);
    bars.predatorRank.push(predatorRank); bars.preyRank.push(preyRank);
    bars.gate1.push(gate1); bars.gate2.push(gate2); bars.gate3.push(gate3);
    bars.session.push(getSession(candles[i].time)); bars.volBucket.push(volBucket);
    bars.isLongBias.push(isLongBias); bars.mfe.push(mfe); bars.mae.push(mae);
    bars.isJPY.push(isJPY);
    bars.count++;
  }

  return bars;
}

// ── Simulation engine on parallel arrays ──────────────────────────────────
function simulateStrategy(bars: BarArrays, dna: StrategyDNA): SimResult {
  let equity = 10000, peak = 10000, maxDD = 0;
  let trades = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  const curve: number[] = [];
  const dailyReturns: number[] = [];
  let dayCounter = 0, dayStart = equity;

  for (let i = 0; i < bars.count; i++) {
    // Gene filters (branch-free style)
    if (bars.predatorRank[i] > dna.predatorRankMax ||
        bars.preyRank[i] < dna.preyRankMin ||
        (dna.gate1Required && bars.gate1[i] === 0) ||
        (dna.gate2Required && bars.gate2[i] === 0) ||
        (dna.gate3Required && bars.gate3[i] === 0) ||
        (dna.sessionFilter >= 0 && bars.session[i] !== dna.sessionFilter) ||
        (bars.hurst[i] < dna.hurstMin || bars.hurst[i] > dna.hurstMax) ||
        (dna.volFilter === 1 && bars.volBucket[i] < 2) ||
        (dna.volFilter === 2 && bars.volBucket[i] > 0) ||
        (dna.direction === 0 && bars.isLongBias[i] === 0) ||
        (dna.direction === 1 && bars.isLongBias[i] === 1)) {
      // Skip bar — still track equity curve sparsely
      dayCounter++;
      if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / (dayStart || 1)); dayStart = equity; dayCounter = 0; }
      continue;
    }

    const sl = bars.atr[i] * dna.slMultiplier;
    const tp = bars.atr[i] * dna.tpMultiplier;
    const pipMult = bars.isJPY[i] ? 100 : 10000;

    let pips: number;
    if (bars.mfe[i] >= tp) pips = tp * pipMult;
    else if (bars.mae[i] >= sl) pips = -sl * pipMult;
    else pips = (bars.mfe[i] - bars.mae[i] * 0.5) * pipMult;

    trades++;
    if (pips > 0) { wins++; grossProfit += pips; } else { grossLoss += Math.abs(pips); }

    equity += pips * 0.01;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;

    dayCounter++;
    if (dayCounter >= 48) { dailyReturns.push((equity - dayStart) / (dayStart || 1)); dayStart = equity; dayCounter = 0; }
  }

  // Only store sparse equity curve (every 50th trade for size)
  curve.push(equity);

  return {
    trades, wins,
    winRate: trades > 0 ? wins / trades : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0),
    totalPips: grossProfit - grossLoss,
    maxDrawdown: maxDD, grossProfit, grossLoss,
    equityCurve: curve, dailyReturns,
  };
}

// ── GA operators ──────────────────────────────────────────────────────────
function randomDNA(): StrategyDNA {
  return {
    predatorRankMax: 1 + Math.floor(Math.random() * 4),
    preyRankMin: 5 + Math.floor(Math.random() * 4),
    gate1Required: Math.random() > 0.5, gate2Required: Math.random() > 0.5,
    gate3Required: Math.random() > 0.5,
    sessionFilter: Math.floor(Math.random() * 5) - 1,
    slMultiplier: 0.5 + Math.random() * 2.5, tpMultiplier: 1.0 + Math.random() * 4.0,
    hurstMin: Math.random() * 0.5, hurstMax: 0.5 + Math.random() * 0.5,
    volFilter: Math.floor(Math.random() * 3), direction: Math.floor(Math.random() * 3),
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

function tournamentSelect(pop: { dna: StrategyDNA; fitness: number }[], k = 3): { dna: StrategyDNA; fitness: number } {
  let best: { dna: StrategyDNA; fitness: number } | null = null;
  for (let i = 0; i < k; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best!;
}

function dnaToEnglish(dna: StrategyDNA): string {
  const sessions = ['Asia', 'London', 'New York', 'NY Close'];
  const dirs = ['LONG only', 'SHORT only', 'BOTH directions'];
  const parts: string[] = [];
  parts.push(`Predator ≤${dna.predatorRankMax}`);
  parts.push(`Prey ≥${dna.preyRankMin}`);
  if (dna.gate1Required) parts.push('G1:ON');
  if (dna.gate2Required) parts.push('G2:ON');
  if (dna.gate3Required) parts.push('G3:ON');
  if (dna.sessionFilter >= 0) parts.push(sessions[dna.sessionFilter]);
  parts.push(`SL=${dna.slMultiplier.toFixed(1)}ATR`);
  parts.push(`TP=${dna.tpMultiplier.toFixed(1)}ATR`);
  parts.push(`H:${dna.hurstMin.toFixed(2)}-${dna.hurstMax.toFixed(2)}`);
  if (dna.volFilter === 1) parts.push('HiVol');
  if (dna.volFilter === 2) parts.push('LoVol');
  parts.push(dirs[dna.direction]);
  return parts.join(' · ');
}

// ── Supabase client helper ────────────────────────────────────────────────
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const JOB_KEY = "ga_job_state";
const DATA_KEY_PREFIX = "ga_bars_";

// ── Phase handlers ────────────────────────────────────────────────────────

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
  if (candles.length < 50) throw new Error(`Insufficient candle data: ${candles.length}`);

  console.log(`[GA-P1] Got ${candles.length} candles, building features...`);
  const bars = buildFeatureArrays(pair, candles);
  console.log(`[GA-P1] Built ${bars.count} feature bars`);

  // Compute baseline daily returns for correlation checking
  const baseDailyReturns: number[] = [];
  let baseEq = 10000;
  let dayCounter = 0, dayStart = baseEq;
  for (let i = 0; i < bars.count; i++) {
    const baseReturn = (bars.gate1[i] && bars.gate2[i] && bars.gate3[i]) ? bars.mfe[i] : 0;
    baseEq += baseReturn * 10000 * 0.001;
    dayCounter++;
    if (dayCounter >= 48) {
      baseDailyReturns.push((baseEq - dayStart) / (dayStart || 1));
      dayStart = baseEq;
      dayCounter = 0;
    }
  }

  // Initialize population
  console.log(`[GA-P1] Initializing population of ${populationSize}`);
  const population: { dna: StrategyDNA; fitness: number }[] = [];
  for (let i = 0; i < populationSize; i++) {
    const dna = randomDNA();
    const sim = simulateStrategy(bars, dna);
    let fitness = 0;
    if (sim.trades >= 20 && sim.maxDrawdown > 0.001) fitness = (sim.profitFactor * sim.winRate) / sim.maxDrawdown;
    else if (sim.trades >= 20) fitness = sim.profitFactor * sim.winRate * 10;
    if (sim.trades < 20) fitness *= 0.01;
    if (sim.trades < 50) fitness *= 0.5;
    if (sim.trades > 200) fitness *= 1.1;
    const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
    if (corr > maxCorrelation) fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);
    population.push({ dna, fitness });
  }
  population.sort((a, b) => b.fitness - a.fitness);

  // Store state in sovereign_memory
  const sb = getSupabaseAdmin();

  // Store bars
  await sb.from("sovereign_memory").upsert({
    memory_key: `${DATA_KEY_PREFIX}${pair}`,
    memory_type: "ga_dataset",
    payload: bars,
    created_by: "alpha-discovery-engine",
    version: 1,
  }, { onConflict: "memory_key" });

  // Store job state
  const jobState = {
    status: "evolving",
    pair,
    environment,
    currentGen: 0,
    totalGenerations,
    populationSize,
    maxCorrelation,
    mutationRate,
    gensPerCall,
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    baseDailyReturns,
    evolutionLog: [{ gen: 0, bestFitness: Math.round(population[0].fitness * 1000) / 1000, avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000, bestTrades: 0 }],
    totalSimulations: populationSize,
    barCount: bars.count,
    startedAt: new Date().toISOString(),
  };

  // Delete any existing job first, then insert fresh
  await sb.from("sovereign_memory").delete().eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");
  const { error: upsertErr } = await sb.from("sovereign_memory").insert({
    memory_key: JOB_KEY,
    memory_type: "ga_job",
    payload: jobState,
    created_by: "alpha-discovery-engine",
    version: 1,
  });
  if (upsertErr) {
    console.error("[GA-P1] Failed to persist job state:", upsertErr);
    throw new Error(`Failed to save GA job state: ${upsertErr.message}`);
  }

  console.log(`[GA-P1] Phase 1 complete. ${bars.count} bars, pop=${populationSize}, ready for evolution.`);

  return {
    phase: 1,
    status: "evolving",
    pair,
    barCount: bars.count,
    populationSize,
    totalGenerations,
    currentGen: 0,
    bestFitness: population[0].fitness,
    message: `Data fetched & population initialized. Ready to evolve ${totalGenerations} generations.`,
  };
}

async function handlePhase2() {
  const sb = getSupabaseAdmin();

  // Load job state — retry once after 2s if not found (race with Phase 1 write)
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

  // Load bars
  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).single();
  if (!barsRow) throw new Error("Feature data not found. Run Phase 1 first.");
  const bars = barsRow.payload as BarArrays;

  const gensToRun = Math.min(gensPerCall, totalGenerations - currentGen);
  console.log(`[GA-P2] Gen ${currentGen + 1}→${currentGen + gensToRun} of ${totalGenerations} (${bars.count} bars, pop=${population.length})`);

  for (let g = 0; g < gensToRun; g++) {
    const gen = currentGen + g + 1;
    const newPop: { dna: StrategyDNA; fitness: number }[] = [];

    // Elitism
    const eliteCount = Math.max(2, Math.floor(population.length * 0.1));
    for (let i = 0; i < eliteCount; i++) newPop.push(population[i]);

    // Breed
    while (newPop.length < population.length) {
      const p1 = tournamentSelect(population);
      const p2 = tournamentSelect(population);
      let child = crossover(p1.dna, p2.dna);
      child = mutate(child, mutationRate);

      const sim = simulateStrategy(bars, child);
      let fitness = 0;
      if (sim.trades >= 20 && sim.maxDrawdown > 0.001) fitness = (sim.profitFactor * sim.winRate) / sim.maxDrawdown;
      else if (sim.trades >= 20) fitness = sim.profitFactor * sim.winRate * 10;
      if (sim.trades < 20) fitness *= 0.01;
      if (sim.trades < 50) fitness *= 0.5;
      if (sim.trades > 200) fitness *= 1.1;
      const corr = Math.abs(pearsonCorrelation(baseDailyReturns, sim.dailyReturns));
      if (corr > maxCorrelation) fitness *= Math.max(0.01, 1 - (corr - maxCorrelation) * 5);

      newPop.push({ dna: child, fitness });
      totalSimulations++;
    }

    population = newPop.sort((a, b) => b.fitness - a.fitness);

    const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
    // Get trade count for best individual
    const bestSim = simulateStrategy(bars, population[0].dna);
    evolutionLog.push({
      gen,
      bestFitness: Math.round(population[0].fitness * 1000) / 1000,
      avgFitness: Math.round(avgFitness * 1000) / 1000,
      bestTrades: bestSim.trades,
    });
  }

  const newCurrentGen = currentGen + gensToRun;
  const isComplete = newCurrentGen >= totalGenerations;

  // Update job state
  const updatedJob = {
    ...job,
    currentGen: newCurrentGen,
    status: isComplete ? "extracting" : "evolving",
    population: population.map(p => ({ dna: p.dna, fitness: Math.round(p.fitness * 1000) / 1000 })),
    evolutionLog,
    totalSimulations,
  };

  await sb.from("sovereign_memory").update({
    payload: updatedJob,
    version: newCurrentGen,
  }).eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");

  console.log(`[GA-P2] Gen ${newCurrentGen}/${totalGenerations} done. Best: ${population[0].fitness.toFixed(3)}. Status: ${isComplete ? 'COMPLETE' : 'evolving'}`);

  return {
    phase: 2,
    status: isComplete ? "extracting" : "evolving",
    currentGen: newCurrentGen,
    totalGenerations,
    bestFitness: Math.round(population[0].fitness * 1000) / 1000,
    avgFitness: Math.round(population.reduce((s, p) => s + p.fitness, 0) / population.length * 1000) / 1000,
    totalSimulations,
    evolutionLog: evolutionLog.slice(-10),
    message: isComplete
      ? `Evolution complete! ${totalSimulations} total simulations. Ready for extraction.`
      : `Gen ${newCurrentGen}/${totalGenerations} complete. Polling for next batch...`,
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

  // Load bars for full simulation
  const { data: barsRow } = await sb.from("sovereign_memory").select("payload").eq("memory_key", `${DATA_KEY_PREFIX}${pair}`).single();
  if (!barsRow) throw new Error("Feature data not found.");
  const bars = barsRow.payload as BarArrays;

  console.log(`[GA-P3] Extracting top strategies from ${population.length} individuals`);

  // Full simulation of top candidates
  const seen = new Set<string>();
  const profiles: ScoredIndividual[] = [];

  for (const p of population.slice(0, 30)) {
    const key = `${p.dna.predatorRankMax}-${p.dna.preyRankMin}-${p.dna.gate1Required}-${p.dna.gate2Required}-${p.dna.gate3Required}-${p.dna.sessionFilter}-${p.dna.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sim = simulateStrategy(bars, p.dna);
    if (sim.trades < 20) continue;

    // Build full equity curve for this one
    let equity = 10000, peak2 = 10000, maxDD2 = 0;
    const fullCurve: number[] = [];
    const fullDailyReturns: number[] = [];
    let dc = 0, ds = equity;
    for (let i = 0; i < bars.count; i++) {
      if (bars.predatorRank[i] > p.dna.predatorRankMax ||
          bars.preyRank[i] < p.dna.preyRankMin ||
          (p.dna.gate1Required && bars.gate1[i] === 0) ||
          (p.dna.gate2Required && bars.gate2[i] === 0) ||
          (p.dna.gate3Required && bars.gate3[i] === 0) ||
          (p.dna.sessionFilter >= 0 && bars.session[i] !== p.dna.sessionFilter) ||
          (bars.hurst[i] < p.dna.hurstMin || bars.hurst[i] > p.dna.hurstMax) ||
          (p.dna.volFilter === 1 && bars.volBucket[i] < 2) ||
          (p.dna.volFilter === 2 && bars.volBucket[i] > 0) ||
          (p.dna.direction === 0 && bars.isLongBias[i] === 0) ||
          (p.dna.direction === 1 && bars.isLongBias[i] === 1)) {
        dc++; if (dc >= 48) { fullDailyReturns.push((equity - ds) / (ds || 1)); ds = equity; dc = 0; }
        continue;
      }
      const sl = bars.atr[i] * p.dna.slMultiplier;
      const tp = bars.atr[i] * p.dna.tpMultiplier;
      const pm = bars.isJPY[i] ? 100 : 10000;
      let pips: number;
      if (bars.mfe[i] >= tp) pips = tp * pm;
      else if (bars.mae[i] >= sl) pips = -sl * pm;
      else pips = (bars.mfe[i] - bars.mae[i] * 0.5) * pm;
      equity += pips * 0.01;
      if (equity > peak2) peak2 = equity;
      const dd = (peak2 - equity) / peak2;
      if (dd > maxDD2) maxDD2 = dd;
      if (fullCurve.length === 0 || i % 5 === 0) fullCurve.push(equity);
      dc++; if (dc >= 48) { fullDailyReturns.push((equity - ds) / (ds || 1)); ds = equity; dc = 0; }
    }
    fullCurve.push(equity);

    const corr = Math.abs(pearsonCorrelation(baseDailyReturns, fullDailyReturns));

    profiles.push({
      dna: p.dna,
      fitness: p.fitness,
      sim: { ...sim, equityCurve: fullCurve, dailyReturns: fullDailyReturns, maxDrawdown: maxDD2 },
      correlation: corr,
      plainEnglish: dnaToEnglish(p.dna),
    });
  }

  const uncorrelated = profiles
    .filter(p => p.correlation <= maxCorrelation && p.sim.profitFactor > 1.0)
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, 10);

  const allProfiles = profiles.sort((a, b) => b.fitness - a.fitness).slice(0, 20);

  // Downsample curves
  function ds(curve: number[], max = 200): number[] {
    if (curve.length <= max) return curve;
    const stride = Math.ceil(curve.length / max);
    return curve.filter((_, i) => i % stride === 0);
  }

  const fmt = (p: ScoredIndividual) => ({
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
    equityCurve: ds(p.sim.equityCurve),
    plainEnglish: p.plainEnglish,
  });

  // Mark job as complete
  await sb.from("sovereign_memory").update({
    payload: { ...(job as object), status: "complete", completedAt: new Date().toISOString() },
  }).eq("memory_key", JOB_KEY).eq("memory_type", "ga_job");

  console.log(`[GA-P3] Extraction complete. ${uncorrelated.length} uncorrelated, ${allProfiles.length} total.`);

  return {
    phase: 3,
    status: "complete",
    timestamp: new Date().toISOString(),
    environment: job.environment,
    dataPoints: job.barCount,
    totalSimulations,
    gaStats: {
      populationSize: (job as Record<string, unknown>).populationSize,
      generations: (job as Record<string, unknown>).totalGenerations,
      mutationRate: (job as Record<string, unknown>).mutationRate,
      maxCorrelation,
      totalSimulations,
      finalBestFitness: population[0]?.fitness || 0,
    },
    evolutionLog: evolutionLog.filter((_, i) => i % Math.max(1, Math.floor(evolutionLog.length / 50)) === 0),
    uncorrelatedProfiles: uncorrelated.map(fmt),
    allProfiles: allProfiles.map(fmt),
    config: {
      pair,
      populationSize: (job as Record<string, unknown>).populationSize,
      generations: (job as Record<string, unknown>).totalGenerations,
      maxCorrelation,
      candleCount: (job as Record<string, unknown>).barCount,
      mutationRate: (job as Record<string, unknown>).mutationRate,
    },
  };
}

// ── Status check (no heavy compute) ──────────────────────────────────────
async function handleStatus() {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("sovereign_memory").select("payload").eq("memory_key", JOB_KEY).eq("memory_type", "ga_job").maybeSingle();
  if (!data) return { status: "idle", message: "No active GA job." };
  const job = data.payload as Record<string, unknown>;
  return {
    status: job.status,
    currentGen: job.currentGen,
    totalGenerations: job.totalGenerations,
    totalSimulations: job.totalSimulations,
    bestFitness: (job.population as { fitness: number }[])?.[0]?.fitness || 0,
    evolutionLog: ((job.evolutionLog as unknown[]) || []).slice(-5),
    pair: job.pair,
    barCount: job.barCount,
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
      case "init":
        result = await handlePhase1(body as Record<string, unknown>);
        break;
      case "evolve":
        result = await handlePhase2();
        break;
      case "extract":
        result = await handlePhase3();
        break;
      case "status":
        result = await handleStatus();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result as object }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GA ENGINE] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
