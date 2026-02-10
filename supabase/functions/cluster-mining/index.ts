// Cluster Mining Edge Function
// Analyzes USD_CAD backtest trades with rolling indicator computation at entry times
// Produces: Super Edge Zones, Kill Zones, Noise Kill List, Coalitions, JSON Config

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  "1m": "M1", "5m": "M5", "15m": "M15",
};

// ── Candle type ──
interface Candle { o: number; h: number; l: number; c: number; v: number; t: string; }

// ── Math helpers ──
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
  for (let i = 1; i < data.length; i++) out.push(data[i] * k + out[i - 1] * (1 - k));
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
  return ema(trueRange(candles), period);
}

// ── Indicator implementations (same as forex-indicators) ──
function computeEMA(closes: number[], period: number) {
  const vals = ema(closes, period);
  const last = vals[vals.length - 1];
  return { signal: closes[closes.length - 1] > last ? "bull" : "bear" };
}

function computeRSI(closes: number[], period = 14) {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rs = losses === 0 ? 100 : (gains / period) / (losses / period);
  const rsi = 100 - 100 / (1 + rs);
  return { value: rsi, signal: rsi < 45 ? "<45" : rsi > 55 ? ">55" : "45-55" };
}

function computeStochastics(candles: Candle[], kPeriod = 14) {
  const slice = candles.slice(-kPeriod);
  const high = Math.max(...slice.map(c => c.h));
  const low = Math.min(...slice.map(c => c.l));
  const k = high === low ? 50 : ((slice[slice.length - 1].c - low) / (high - low)) * 100;
  return { signal: k < 20 ? "oversold" : k > 80 ? "overbought" : "neutral" };
}

function computeADX(candles: Candle[], period = 14) {
  if (candles.length < period * 2) return { signal: "weak" };
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
  return { signal: dx > 25 ? "trend" : "range" };
}

function computeBollinger(closes: number[], period = 20, mult = 2) {
  const s = sma(closes, period);
  const mid = s[s.length - 1];
  const slice = closes.slice(-period);
  const stddev = Math.sqrt(slice.reduce((a, v) => a + (v - mid) ** 2, 0) / period);
  const upper = mid + mult * stddev;
  const lower = mid - mult * stddev;
  const pctB = upper === lower ? 0.5 : (closes[closes.length - 1] - lower) / (upper - lower);
  return { signal: pctB > 1 ? "above" : pctB < 0 ? "below" : "within" };
}

function computeDonchian(candles: Candle[], period = 20) {
  const slice = candles.slice(-period);
  const upper = Math.max(...slice.map(c => c.h));
  const lower = Math.min(...slice.map(c => c.l));
  const last = candles[candles.length - 1].c;
  return { signal: last >= upper ? "breakout_high" : last <= lower ? "breakout_low" : "within" };
}

function computeIchimoku(candles: Candle[]) {
  const tenkan = (p: number) => {
    const s = candles.slice(-p);
    return (Math.max(...s.map(c => c.h)) + Math.min(...s.map(c => c.l))) / 2;
  };
  const senkouA = (tenkan(9) + tenkan(26)) / 2;
  const senkouB = tenkan(52);
  const close = candles[candles.length - 1].c;
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  return { signal: close > cloudTop ? "bull" : close < cloudBottom ? "bear" : "neutral" };
}

function computeSupertrend(candles: Candle[], period = 10, mult = 3) {
  const atrVals = atr(candles, period);
  const last = candles[candles.length - 1];
  const atrVal = atrVals[atrVals.length - 1];
  const lowerBand = (last.h + last.l) / 2 - mult * atrVal;
  return { signal: last.c > lowerBand ? "bull" : "bear" };
}

function computeParabolicSAR(candles: Candle[]) {
  let af = 0.02, maxAf = 0.2, bullish = true, sar = candles[0].l, ep = candles[0].h;
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (bullish) {
      if (candles[i].l < sar) { bullish = false; sar = ep; ep = candles[i].l; af = 0.02; }
      else if (candles[i].h > ep) { ep = candles[i].h; af = Math.min(af + 0.02, maxAf); }
    } else {
      if (candles[i].h > sar) { bullish = true; sar = ep; ep = candles[i].h; af = 0.02; }
      else if (candles[i].l < ep) { ep = candles[i].l; af = Math.min(af + 0.02, maxAf); }
    }
  }
  return { signal: bullish ? "bull" : "bear" };
}

function computeCCI(candles: Candle[], period = 20) {
  const typicals = candles.map(c => (c.h + c.l + c.c) / 3);
  const slice = typicals.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((a, v) => a + Math.abs(v - mean), 0) / period;
  const cci = meanDev === 0 ? 0 : (typicals[typicals.length - 1] - mean) / (0.015 * meanDev);
  return { signal: cci > 100 ? "overbought" : cci < -100 ? "oversold" : "neutral" };
}

function computeKeltner(candles: Candle[], emaPeriod = 20, atrPeriod = 10, mult = 1.5) {
  const closes = candles.map(c => c.c);
  const emaVals = ema(closes, emaPeriod);
  const atrVals = atr(candles, atrPeriod);
  const mid = emaVals[emaVals.length - 1];
  const atrVal = atrVals[atrVals.length - 1];
  const last = closes[closes.length - 1];
  return { signal: last > mid + mult * atrVal ? "overbought" : last < mid - mult * atrVal ? "oversold" : "neutral" };
}

function computeROC(closes: number[], period = 12) {
  const prev = closes[closes.length - 1 - period];
  const curr = closes[closes.length - 1];
  return { signal: prev === 0 ? "neutral" : ((curr - prev) / prev) > 0 ? "positive" : "negative" };
}

function computeElderForce(candles: Candle[], period = 13) {
  const forces = candles.map((c, i) => i === 0 ? 0 : (c.c - candles[i - 1].c) * c.v);
  const smoothed = ema(forces, period);
  return { signal: smoothed[smoothed.length - 1] > 0 ? "positive" : "negative" };
}

function computeHeikinAshi(candles: Candle[]) {
  const ha: { o: number; c: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.o + c.h + c.l + c.c) / 4;
    const haOpen = i === 0 ? (c.o + c.c) / 2 : (ha[i - 1].o + ha[i - 1].c) / 2;
    ha.push({ o: haOpen, c: haClose });
  }
  const bullCount = ha.slice(-5).filter(h => h.c > h.o).length;
  return { signal: bullCount >= 4 ? "bull" : bullCount <= 1 ? "bear" : "neutral" };
}

function computePivotPoints(candles: Candle[]) {
  const prev = candles[candles.length - 2];
  const pivot = (prev.h + prev.l + prev.c) / 3;
  const r1 = 2 * pivot - prev.l;
  const s1 = 2 * pivot - prev.h;
  const close = candles[candles.length - 1].c;
  return { signal: close > r1 ? "above_r1" : close < s1 ? "below_s1" : "near_pivot" };
}

function computeTrendEfficiency(closes: number[], period = 14) {
  const slice = closes.slice(-period - 1);
  const netMove = Math.abs(slice[slice.length - 1] - slice[0]);
  let pathNoise = 0;
  for (let i = 1; i < slice.length; i++) pathNoise += Math.abs(slice[i] - slice[i - 1]);
  const ratio = pathNoise === 0 ? 0 : netMove / pathNoise;
  return { signal: ratio > 0.6 ? "trend" : ratio < 0.3 ? "chop" : "moderate" };
}

// ── Compute all indicators from a candle slice ──
function computeAllSignals(candles: Candle[]): Record<string, string> | null {
  if (candles.length < 60) return null;
  const closes = candles.map(c => c.c);
  try {
    return {
      ema50: computeEMA(closes, 50).signal,
      supertrend: computeSupertrend(candles).signal,
      adx: computeADX(candles).signal,
      rsi: computeRSI(closes).signal,
      trendEff: computeTrendEfficiency(closes).signal,
      pivots: computePivotPoints(candles).signal,
      bollinger: computeBollinger(closes).signal,
      ichimoku: computeIchimoku(candles).signal,
      heikinAshi: computeHeikinAshi(candles).signal,
      stochastics: computeStochastics(candles).signal,
      donchian: computeDonchian(candles).signal,
      parabolicSAR: computeParabolicSAR(candles).signal,
      cci: computeCCI(candles).signal,
      keltner: computeKeltner(candles).signal,
      roc: computeROC(closes).signal,
      elderForce: computeElderForce(candles).signal,
    };
  } catch { return null; }
}

// ── Signature builders ──
const LITE_KEYS = ['ema50', 'supertrend', 'adx', 'rsi', 'trendEff', 'pivots'];
const MID_KEYS = [...LITE_KEYS, 'bollinger', 'ichimoku', 'heikinAshi', 'stochastics'];
const FULL_KEYS = [...MID_KEYS, 'donchian', 'parabolicSAR', 'cci', 'keltner', 'roc', 'elderForce'];

function buildSignature(signals: Record<string, string>, keys: string[]): string {
  return keys.map(k => `${k}:${signals[k]}`).join('|');
}

// ── OANDA paginated candle fetcher ──
async function fetchCandlesPaginated(instrument: string, granularity: string, from: string, to: string): Promise<Candle[]> {
  const env = Deno.env.get("OANDA_ENV") || "practice";
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  if (!apiToken) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  const allCandles: Candle[] = [];
  let currentFrom = from;
  const toTs = new Date(to).getTime();

  while (new Date(currentFrom).getTime() < toTs) {
    // OANDA rule: cannot use count + from + to together. Use from + count for pagination.
    const url = `${host}/v3/instruments/${instrument}/candles?granularity=${granularity}&from=${encodeURIComponent(currentFrom)}&count=5000&price=MBA`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OANDA ${res.status}: ${body}`);
    }
    const data = await res.json();
    const candles = (data.candles || [])
      .filter((c: any) => c.complete !== false)
      .map((c: any) => ({
        o: parseFloat(c.mid.o), h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l), c: parseFloat(c.mid.c),
        v: c.volume || 0, t: c.time,
      }));

    if (candles.length === 0) break;
    // Only keep candles within our target range
    const filtered = candles.filter((c: Candle) => new Date(c.t).getTime() <= toTs);
    allCandles.push(...filtered);
    // Move start past last candle
    const lastTime = new Date(candles[candles.length - 1].t).getTime();
    currentFrom = new Date(lastTime + 1000).toISOString();
    if (candles.length < 4900 || lastTime >= toTs) break;
  }

  return allCandles;
}

// ── Binary search for nearest candle ──
function findCandleIndex(candles: Candle[], tradeTime: string): number {
  const ts = new Date(tradeTime).getTime();
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (new Date(candles[mid].t).getTime() <= ts) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ── Cluster metrics ──
interface ClusterEntry {
  signature: string;
  trades: number;
  wins: number;
  net_pips: number;
  gross_profit: number;
  gross_loss: number;
  pips_list: number[];
}

function computePips(entry: number, exit: number, direction: string, pair: string): number {
  const mult = pair.includes('JPY') ? 100 : 10000;
  return direction === 'long' ? (exit - entry) * mult : (entry - exit) * mult;
}

function buildClusterMetrics(entries: Map<string, ClusterEntry>, minTrades: number) {
  const results: any[] = [];
  for (const [sig, e] of entries) {
    if (e.trades < minTrades) continue;
    const winRate = e.wins / e.trades;
    const expectancy = e.net_pips / e.trades;
    const mean = expectancy;
    const variance = e.pips_list.reduce((a, p) => a + (p - mean) ** 2, 0) / e.trades;
    const stddev = Math.sqrt(variance);
    const downside = e.pips_list.filter(p => p < 0);
    const downsideDev = downside.length > 0
      ? Math.sqrt(downside.reduce((a, p) => a + p ** 2, 0) / downside.length)
      : 0;

    // Max drawdown approximation from cumulative pips
    let peak = 0, maxDd = 0, cum = 0;
    for (const p of e.pips_list) {
      cum += p;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    // PF validity guard
    const absLoss = Math.abs(e.gross_loss);
    const pf = absLoss < 0.01 ? null : e.gross_profit / absLoss;

    const stability = stddev > 0 ? expectancy / stddev : 0;

    results.push({
      signature: sig,
      trades: e.trades,
      win_rate: Math.round(winRate * 1000) / 10,
      expectancy_pips: Math.round(expectancy * 100) / 100,
      net_pips: Math.round(e.net_pips * 100) / 100,
      pf: pf !== null ? Math.round(pf * 100) / 100 : null,
      stddev_pips: Math.round(stddev * 100) / 100,
      max_dd_pips: Math.round(maxDd * 100) / 100,
      downside_deviation: Math.round(downsideDev * 100) / 100,
      stability_score: Math.round(stability * 100) / 100,
    });
  }
  return results;
}

// ── Noise analysis ──
function computeNoiseAnalysis(
  trades: { pips: number; signals: Record<string, string>; session: string }[],
) {
  const indicators = FULL_KEYS;
  const results: any[] = [];

  for (const ind of indicators) {
    // Group trades by indicator state
    const groups: Record<string, { pips: number[]; sessions: Set<string> }> = {};
    for (const t of trades) {
      const state = t.signals[ind];
      if (!state) continue;
      if (!groups[state]) groups[state] = { pips: [], sessions: new Set() };
      groups[state].pips.push(t.pips);
      groups[state].sessions.add(t.session);
    }

    const states = Object.keys(groups);
    if (states.length < 2) continue;

    // Find best and worst states
    const stateMetrics = states.map(s => {
      const pips = groups[s].pips;
      const avg = pips.reduce((a, b) => a + b, 0) / pips.length;
      const stddev = Math.sqrt(pips.reduce((a, p) => a + (p - avg) ** 2, 0) / pips.length);
      const fpRate = pips.filter(p => p < 0).length / pips.length;
      return { state: s, avg, stddev, fpRate, count: pips.length, sessions: [...groups[s].sessions] };
    });

    const bestState = stateMetrics.reduce((a, b) => a.avg > b.avg ? a : b);
    const worstState = stateMetrics.reduce((a, b) => a.avg < b.avg ? a : b);
    const expectancyDelta = bestState.avg - worstState.avg;
    const stabilityDelta = worstState.stddev - bestState.stddev;

    // Determine verdict
    let verdict = 'keep';
    const allSessions = [...new Set(trades.map(t => t.session))];
    const affectedSessions: string[] = [];

    if (expectancyDelta < 0.5 && Math.abs(stabilityDelta) < 1) {
      verdict = 'ignore';
    } else if (worstState.fpRate > 0.6) {
      verdict = 'blocker_only';
    } else {
      // Check if indicator only works in certain sessions
      const sessionResults: Record<string, number> = {};
      for (const sess of allSessions) {
        const sessTrades = trades.filter(t => t.session === sess);
        const withBull = sessTrades.filter(t => t.signals[ind] === bestState.state);
        const withBear = sessTrades.filter(t => t.signals[ind] === worstState.state);
        if (withBull.length > 5 && withBear.length > 5) {
          const bullAvg = withBull.reduce((a, t) => a + t.pips, 0) / withBull.length;
          const bearAvg = withBear.reduce((a, t) => a + t.pips, 0) / withBear.length;
          sessionResults[sess] = bullAvg - bearAvg;
          if (bullAvg - bearAvg < 0) affectedSessions.push(sess);
        }
      }
      if (affectedSessions.length > 0 && affectedSessions.length < allSessions.length) {
        verdict = 'session_conditional';
      }
    }

    results.push({
      indicator: ind,
      expectancy_delta: Math.round(expectancyDelta * 100) / 100,
      stability_delta: Math.round(stabilityDelta * 100) / 100,
      false_positive_rate: Math.round(worstState.fpRate * 1000) / 10,
      verdict,
      affected_sessions: affectedSessions,
      states: stateMetrics.map(s => ({
        state: s.state,
        count: s.count,
        avg_pips: Math.round(s.avg * 100) / 100,
        fp_rate: Math.round(s.fpRate * 1000) / 10,
      })),
    });
  }

  return results.sort((a, b) => a.expectancy_delta - b.expectancy_delta);
}

// ── Coalition analysis ──
function computeCoalitions(
  trades: { pips: number; agent_id: string; session: string }[],
) {
  const agents = [...new Set(trades.map(t => t.agent_id))];
  const agentTrades: Record<string, number[]> = {};
  for (const a of agents) {
    agentTrades[a] = trades.filter(t => t.agent_id === a).map(t => t.pips);
  }

  // Individual baselines
  const baselines: Record<string, { expectancy: number; stddev: number }> = {};
  for (const a of agents) {
    const pips = agentTrades[a];
    if (pips.length < 10) continue;
    const avg = pips.reduce((s, p) => s + p, 0) / pips.length;
    const std = Math.sqrt(pips.reduce((s, p) => s + (p - avg) ** 2, 0) / pips.length);
    baselines[a] = { expectancy: avg, stddev: std };
  }

  const validAgents = Object.keys(baselines);
  const coalitions: any[] = [];

  // Generate combinations (sizes 2-4)
  function combos(arr: string[], size: number): string[][] {
    if (size === 1) return arr.map(a => [a]);
    const result: string[][] = [];
    for (let i = 0; i <= arr.length - size; i++) {
      const rest = combos(arr.slice(i + 1), size - 1);
      for (const r of rest) result.push([arr[i], ...r]);
    }
    return result;
  }

  for (const size of [2, 3, 4]) {
    const combosArr = combos(validAgents, size);
    for (const combo of combosArr) {
      const pool = trades.filter(t => combo.includes(t.agent_id)).map(t => t.pips);
      if (pool.length < 20) continue;

      const avg = pool.reduce((s, p) => s + p, 0) / pool.length;
      const std = Math.sqrt(pool.reduce((s, p) => s + (p - avg) ** 2, 0) / pool.length);

      // Max drawdown
      let peak = 0, maxDd = 0, cum = 0;
      for (const p of pool) {
        cum += p;
        if (cum > peak) peak = cum;
        if (peak - cum > maxDd) maxDd = peak - cum;
      }

      // Compare to individual baselines
      const avgBaseline = combo.reduce((s, a) => s + baselines[a].expectancy, 0) / combo.length;
      const lift = avg - avgBaseline;

      coalitions.push({
        agents: combo,
        size: combo.length,
        trades: pool.length,
        expectancy: Math.round(avg * 100) / 100,
        baseline_avg: Math.round(avgBaseline * 100) / 100,
        lift: Math.round(lift * 100) / 100,
        stddev: Math.round(std * 100) / 100,
        max_dd: Math.round(maxDd * 100) / 100,
        score: Math.round((avg + lift * 0.5 - maxDd * 0.1) * 100) / 100,
      });
    }
  }

  coalitions.sort((a, b) => b.score - a.score);
  return {
    best: coalitions.filter(c => c.lift > 0).slice(0, 20),
    do_not_pair: coalitions.filter(c => c.lift < -0.5).sort((a, b) => a.score - b.score).slice(0, 10),
  };
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lookbackDays = parseInt(url.searchParams.get("lookback") || "21");
    const timeframesParam = url.searchParams.get("timeframes") || "1m,5m,15m";
    const timeframes = timeframesParam.split(",").filter(t => GRANULARITY_MAP[t]);

    console.log(`[CLUSTER-MINING] Starting: ${lookbackDays}d lookback, TFs: ${timeframes.join(",")}`);

    // Create supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch USD_CAD backtest long trades
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: rawTrades, error: dbErr } = await supabase
      .from("oanda_orders")
      .select("created_at, entry_price, exit_price, direction, agent_id, session_label")
      .eq("currency_pair", "USD_CAD")
      .eq("environment", "backtest")
      .eq("direction", "long")
      .in("status", ["filled", "closed"])
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .not("agent_id", "in", '("manual-test","unknown","backtest-engine")')
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(8000);

    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);
    const trades = rawTrades || [];
    console.log(`[CLUSTER-MINING] Fetched ${trades.length} trades`);

    if (trades.length < 50) {
      return new Response(JSON.stringify({ error: "Insufficient trades", count: trades.length }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine candle fetch window (extend 300 candles before earliest trade)
    const earliestTrade = trades[0].created_at;
    const latestTrade = trades[trades.length - 1].created_at;

    // Results per timeframe
    const tfResults: Record<string, any> = {};
    const tfNoise: Record<string, any> = {};
    const tfCoalitions: Record<string, any> = {};

    for (const tf of timeframes) {
      console.log(`[CLUSTER-MINING] Processing ${tf}...`);

      // Extend start by 300 periods for indicator lookback
      const periodMs = tf === "1m" ? 60000 : tf === "5m" ? 300000 : 900000;
      const candleFrom = new Date(new Date(earliestTrade).getTime() - 300 * periodMs).toISOString();

      const candles = await fetchCandlesPaginated("USD_CAD", GRANULARITY_MAP[tf], candleFrom, latestTrade);
      console.log(`[CLUSTER-MINING] ${tf}: ${candles.length} candles fetched`);

      if (candles.length < 100) {
        console.log(`[CLUSTER-MINING] ${tf}: insufficient candles, skipping`);
        continue;
      }

      // Map each trade to indicator signals
      const enrichedTrades: {
        pips: number;
        agent_id: string;
        session: string;
        signals: Record<string, string>;
      }[] = [];

      for (const trade of trades) {
        const idx = findCandleIndex(candles, trade.created_at);
        if (idx < 60) continue; // not enough lookback

        const slice = candles.slice(Math.max(0, idx - 200), idx + 1);
        const signals = computeAllSignals(slice);
        if (!signals) continue;

        const pips = computePips(
          parseFloat(trade.entry_price),
          parseFloat(trade.exit_price),
          trade.direction,
          "USD_CAD"
        );

        enrichedTrades.push({
          pips,
          agent_id: trade.agent_id || "unknown",
          session: trade.session_label || "unknown",
          signals,
        });
      }

      console.log(`[CLUSTER-MINING] ${tf}: ${enrichedTrades.length} trades mapped to indicators`);

      // Build clusters for each granularity
      const granularities: { name: string; keys: string[]; minTrades: number }[] = [
        { name: "lite", keys: LITE_KEYS, minTrades: 200 },
        { name: "mid", keys: MID_KEYS, minTrades: 150 },
        { name: "full", keys: FULL_KEYS, minTrades: 100 },
      ];

      const clusterResults: Record<string, any> = {};

      for (const gran of granularities) {
        const clusters = new Map<string, ClusterEntry>();

        for (const t of enrichedTrades) {
          const sig = buildSignature(t.signals, gran.keys);
          const entry = clusters.get(sig) || {
            signature: sig,
            trades: 0, wins: 0, net_pips: 0,
            gross_profit: 0, gross_loss: 0, pips_list: [],
          };
          entry.trades++;
          if (t.pips > 0) { entry.wins++; entry.gross_profit += t.pips; }
          else { entry.gross_loss += t.pips; }
          entry.net_pips += t.pips;
          entry.pips_list.push(t.pips);
          clusters.set(sig, entry);
        }

        const metrics = buildClusterMetrics(clusters, gran.minTrades);

        // Sort by expectancy for top/bottom
        const sorted = [...metrics].sort((a, b) => b.expectancy_pips - a.expectancy_pips);
        const superEdge = sorted.filter(m => m.expectancy_pips > 0).slice(0, 20);
        const killZones = sorted.filter(m => m.expectancy_pips < 0).reverse().slice(0, 20);

        clusterResults[gran.name] = {
          total_clusters: clusters.size,
          qualifying_clusters: metrics.length,
          super_edge_zones: superEdge,
          kill_zones: killZones,
        };
      }

      tfResults[tf] = clusterResults;
      tfNoise[tf] = computeNoiseAnalysis(enrichedTrades);
      tfCoalitions[tf] = computeCoalitions(enrichedTrades);
    }

    // Build JSON config
    const bestSessions = new Set<string>();
    const blockedSessions = new Set<string>();
    for (const tf of timeframes) {
      const noise = tfNoise[tf] || [];
      for (const n of noise) {
        if (n.verdict === 'session_conditional') {
          n.affected_sessions.forEach((s: string) => blockedSessions.add(s));
        }
      }
    }

    // Extract top approved clusters from 5m (decision TF)
    const fiveMResults = tfResults["5m"];
    const approvedClusters = fiveMResults?.lite?.super_edge_zones?.slice(0, 5)?.map((c: any) => c.signature) || [];
    const blockedClusters = fiveMResults?.lite?.kill_zones?.slice(0, 5)?.map((c: any) => c.signature) || [];

    // Best coalition per TF
    const recommendedCoalition: Record<string, string[]> = {};
    for (const tf of timeframes) {
      const best = tfCoalitions[tf]?.best?.[0];
      if (best) recommendedCoalition[tf] = best.agents;
    }

    const jsonConfig = {
      pair: "USD_CAD",
      direction: "long",
      lookback_days: lookbackDays,
      timeframe_hierarchy: {
        decision: "5m",
        execution_filter: "1m",
        regime_veto: "15m",
      },
      allowed_sessions: ["asian", "london-open", "ny-overlap", "late-ny"].filter(s => !blockedSessions.has(s)),
      blocked_sessions: [...blockedSessions],
      approved_clusters: approvedClusters,
      blocked_clusters: blockedClusters,
      recommended_coalition: recommendedCoalition,
    };

    const response = {
      results: tfResults,
      noise_kill_list: tfNoise,
      coalitions: tfCoalitions,
      json_config: jsonConfig,
      meta: {
        total_trades: trades.length,
        lookback_days: lookbackDays,
        timeframes,
        generated_at: new Date().toISOString(),
      },
    };

    console.log(`[CLUSTER-MINING] Complete. Trades: ${trades.length}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[CLUSTER-MINING] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
