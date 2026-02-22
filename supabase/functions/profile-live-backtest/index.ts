// Profile Live Backtest Engine v2.0 — Phased State Machine
// Splits heavy computation across multiple invocations to avoid CPU time limits.
// Phase 1 (init): Fetch candles, build rank snapshots, persist compressed state.
// Phase 2 (compute): Process combos in chunks, persist partial results.
// Phase 3 (extract): Build final results + equity curves.

import { createClient } from "npm:@supabase/supabase-js@2";

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

// ── Profile Discovery Parameter Grid ──
const PREDATOR_RANKS = [1, 2, 3];
const PREY_RANKS = [6, 7, 8];
const GATE_COMBOS = [
  { g1: true, g2: true, g3: true, label: "G1+G2+G3" },
  { g1: true, g2: true, g3: false, label: "G1+G2" },
  { g1: true, g2: false, g3: true, label: "G1+G3" },
  { g1: false, g2: true, g3: true, label: "G2+G3" },
  { g1: true, g2: false, g3: false, label: "G1 only" },
  { g1: false, g2: false, g3: false, label: "No Gates" },
];
const SL_PIPS = [10, 15, 20, 30, 42];
const TP_RATIOS = [1.5, 2.0, 3.0];
const SESSIONS = [
  { id: "ALL", hours: null as null | [number, number] },
  { id: "ASIA", hours: [0, 7] as [number, number] },
  { id: "LONDON", hours: [7, 12] as [number, number] },
  { id: "NEW_YORK", hours: [12, 17] as [number, number] },
  { id: "NY_CLOSE", hours: [17, 21] as [number, number] },
];

// Build full combo list for chunking
interface ComboKey { predRank: number; preyRank: number; gateIdx: number; sessionIdx: number; exitIdx: number; }
function buildAllCombos(): ComboKey[] {
  const exitModes: Array<{ slPips: number; tpRatio: number | "flip" }> = [];
  for (const sl of SL_PIPS) {
    for (const tp of TP_RATIOS) exitModes.push({ slPips: sl, tpRatio: tp });
    exitModes.push({ slPips: sl, tpRatio: "flip" });
  }
  const combos: ComboKey[] = [];
  for (const predRank of PREDATOR_RANKS) {
    for (const preyRank of PREY_RANKS) {
      for (let gi = 0; gi < GATE_COMBOS.length; gi++) {
        for (let si = 0; si < SESSIONS.length; si++) {
          for (let ei = 0; ei < exitModes.length; ei++) {
            combos.push({ predRank, preyRank, gateIdx: gi, sessionIdx: si, exitIdx: ei });
          }
        }
      }
    }
  }
  return combos;
}

// ── Candle Fetching ──
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

// ── Gate helpers ──
function checkAtlasWalls(candles: Candle[], idx: number, direction: "long" | "short", lookback = 20): boolean {
  if (idx < lookback + 1) return false;
  const slice = candles.slice(idx - lookback, idx);
  const currentClose = candles[idx].close;
  if (direction === "long") return currentClose > Math.max(...slice.map(c => c.high));
  return currentClose < Math.min(...slice.map(c => c.low));
}

function computeLinRegSlope(candles: Candle[], idx: number, lookback = 20): number {
  if (idx < lookback) return 0;
  const slice = candles.slice(idx - lookback, idx);
  const n = slice.length;
  if (n < 5) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) { sumX += i; sumY += slice[i].close; sumXY += i * slice[i].close; sumX2 += i * i; }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function getSessionId(isoTime: string): string {
  const hour = new Date(isoTime).getUTCHours();
  if (hour >= 0 && hour < 7) return "ASIA";
  if (hour >= 7 && hour < 12) return "LONDON";
  if (hour >= 12 && hour < 17) return "NEW_YORK";
  if (hour >= 17 && hour < 21) return "NY_CLOSE";
  return "ASIA";
}

function matchesSession(isoTime: string, session: typeof SESSIONS[number]): boolean {
  if (!session.hours) return true;
  const hour = new Date(isoTime).getUTCHours();
  return hour >= session.hours[0] && hour < session.hours[1];
}

function computePips(entry: number, exit: number, dir: "long" | "short", isJPY: boolean): number {
  const raw = dir === "long" ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

// ── Signal generation for a rank pair ──
interface TradeSignal {
  time: string; instrument: string; direction: "long" | "short";
  entryPrice: number; isJPY: boolean; candleIdx: number;
  sessionId: string; g2Pass: boolean; g3Pass: boolean;
}

interface RankSnap { time: string; ranks: Record<string, number>; }

function generateSignals(
  predRank: number, preyRank: number, rankSnaps: RankSnap[],
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>
): TradeSignal[] {
  const signals: TradeSignal[] = [];
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
      const g2Pass = checkAtlasWalls(candles, candleIdx, direction);
      const slope = computeLinRegSlope(candles, candleIdx);
      const g3Pass = direction === "long" ? slope > 0 : slope < 0;

      signals.push({
        time: snap.time, instrument, direction,
        entryPrice: candles[candleIdx].close,
        isJPY: instrument.includes("JPY"),
        candleIdx, sessionId: getSessionId(snap.time),
        g2Pass, g3Pass,
      });
      prevInst = instrument;
      prevDir = direction;
    }
  }
  return signals;
}

// ── Result interface ──
interface LiveProfileResult {
  predator: number; prey: number; gates: string;
  slPips: number; tpRatio: number | "flip"; session: string;
  trades: number; wins: number; losses: number;
  winRate: number; profitFactor: number; totalPips: number;
  netProfit: number; maxDrawdown: number; expectancy: number;
  avgWin: number; avgLoss: number;
  equityCurve: Array<{ time: string; equity: number }> | null;
}

// ── Simulate one combo ──
function simulateCombo(
  combo: ComboKey,
  signalCache: Record<string, TradeSignal[]>,
  pairCandles: Record<string, Candle[]>,
): LiveProfileResult | null {
  const exitModes: Array<{ slPips: number; tpRatio: number | "flip" }> = [];
  for (const sl of SL_PIPS) {
    for (const tp of TP_RATIOS) exitModes.push({ slPips: sl, tpRatio: tp });
    exitModes.push({ slPips: sl, tpRatio: "flip" });
  }

  const gate = GATE_COMBOS[combo.gateIdx];
  const session = SESSIONS[combo.sessionIdx];
  const exit = exitModes[combo.exitIdx];
  const cacheKey = `${combo.predRank}_${combo.preyRank}`;
  const signals = signalCache[cacheKey];
  if (!signals) return null;

  const filtered = signals.filter(sig => {
    if (gate.g1 && (combo.predRank > 3 || combo.preyRank < 6)) return false;
    if (gate.g2 && !sig.g2Pass) return false;
    if (gate.g3 && !sig.g3Pass) return false;
    if (session.hours && !matchesSession(sig.time, session)) return false;
    return true;
  });

  if (filtered.length < 3) return null;

  let equity = 1000, peak = 1000, maxDD = 0, wins = 0, losses = 0, totalPips = 0;
  let grossProfit = 0, grossLoss = 0;

  for (let fi = 0; fi < filtered.length; fi++) {
    const sig = filtered[fi];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const isJPY = sig.isJPY;
    const pipMul = isJPY ? 100 : 10000;
    const pipVal = isJPY ? 0.01 : 0.0001;
    const slPrice = exit.slPips / pipMul;
    const tpPrice = exit.tpRatio === "flip" ? Infinity : (exit.slPips * (exit.tpRatio as number)) / pipMul;

    const nextSignalTime = fi + 1 < filtered.length ? filtered[fi + 1].time : null;
    let exitPrice = sig.entryPrice;

    for (let ci = sig.candleIdx + 1; ci < candles.length; ci++) {
      const bar = candles[ci];
      if (exit.tpRatio === "flip" && nextSignalTime && bar.time >= nextSignalTime) { exitPrice = bar.open; break; }
      if (sig.direction === "long") {
        if (bar.low <= sig.entryPrice - slPrice) { exitPrice = sig.entryPrice - slPrice; break; }
        if (exit.tpRatio !== "flip" && bar.high >= sig.entryPrice + tpPrice) { exitPrice = sig.entryPrice + tpPrice; break; }
      } else {
        if (bar.high >= sig.entryPrice + slPrice) { exitPrice = sig.entryPrice + slPrice; break; }
        if (exit.tpRatio !== "flip" && bar.low <= sig.entryPrice - tpPrice) { exitPrice = sig.entryPrice - tpPrice; break; }
      }
      if (exit.tpRatio === "flip" && !nextSignalTime && ci === candles.length - 1) { exitPrice = bar.close; break; }
    }

    const tradePips = computePips(sig.entryPrice, exitPrice, sig.direction, isJPY);
    const riskAmt = equity * 0.05;
    const dynUnits = exit.slPips > 0 ? riskAmt / (exit.slPips * pipVal) : 2000;
    equity += tradePips * (dynUnits * pipVal);
    totalPips += tradePips;
    if (tradePips > 0) { wins++; grossProfit += tradePips; } else { losses++; grossLoss += Math.abs(tradePips); }
    if (equity > peak) peak = equity;
    const dd = ((equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }

  const trades = wins + losses;
  if (trades < 3) return null;
  const wr = (wins / trades) * 100;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return {
    predator: combo.predRank, prey: combo.preyRank, gates: gate.label,
    slPips: exit.slPips, tpRatio: exit.tpRatio, session: session.id,
    trades, wins, losses,
    winRate: Math.round(wr * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100,
    totalPips: Math.round(totalPips * 10) / 10,
    netProfit: Math.round((equity - 1000) * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    expectancy: Math.round((totalPips / trades) * 100) / 100,
    avgWin: wins > 0 ? Math.round((grossProfit / wins) * 10) / 10 : 0,
    avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 10) / 10 : 0,
    equityCurve: null,
  };
}

// ── Build equity curve for a result ──
function buildEquityCurve(
  r: LiveProfileResult, rankSnaps: RankSnap[],
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>
): Array<{ time: string; equity: number }> {
  const signals = generateSignals(r.predator, r.prey, rankSnaps, pairCandles, pairTimeIndex);
  const gate = GATE_COMBOS.find(g => g.label === r.gates)!;

  const filtered = signals.filter(sig => {
    if (gate.g2 && !sig.g2Pass) return false;
    if (gate.g3 && !sig.g3Pass) return false;
    if (r.session !== "ALL") {
      const sess = SESSIONS.find(s => s.id === r.session);
      if (sess && !matchesSession(sig.time, sess)) return false;
    }
    return true;
  });

  const curve: Array<{ time: string; equity: number }> = [];
  let equity = 1000;

  for (let fi = 0; fi < filtered.length; fi++) {
    const sig = filtered[fi];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const isJPY = sig.isJPY;
    const pipMul = isJPY ? 100 : 10000;
    const pipVal = isJPY ? 0.01 : 0.0001;
    const slPrice = r.slPips / pipMul;
    const tpPrice = r.tpRatio === "flip" ? Infinity : (r.slPips * (r.tpRatio as number)) / pipMul;

    const nextSignalTime = fi + 1 < filtered.length ? filtered[fi + 1].time : null;
    let exitPrice = sig.entryPrice;

    for (let ci = sig.candleIdx + 1; ci < candles.length; ci++) {
      const bar = candles[ci];
      let hit = false;
      if (sig.direction === "long") {
        if (bar.low <= sig.entryPrice - slPrice) { exitPrice = sig.entryPrice - slPrice; hit = true; }
        else if (r.tpRatio !== "flip" && bar.high >= sig.entryPrice + tpPrice) { exitPrice = sig.entryPrice + tpPrice; hit = true; }
      } else {
        if (bar.high >= sig.entryPrice + slPrice) { exitPrice = sig.entryPrice + slPrice; hit = true; }
        else if (r.tpRatio !== "flip" && bar.low <= sig.entryPrice - tpPrice) { exitPrice = sig.entryPrice - tpPrice; hit = true; }
      }
      if (hit || (r.tpRatio === "flip" && nextSignalTime && bar.time >= nextSignalTime)) {
        if (!hit) exitPrice = bar.open;
        break;
      }
    }

    const tradePips = computePips(sig.entryPrice, exitPrice, sig.direction, isJPY);
    const riskAmt = equity * 0.05;
    const dynUnits = r.slPips > 0 ? riskAmt / (r.slPips * pipVal) : 2000;
    equity += tradePips * (dynUnits * pipVal);
    curve.push({ time: sig.time, equity: Math.round(equity * 100) / 100 });
  }

  const step = Math.max(1, Math.floor(curve.length / 300));
  return curve.filter((_, idx) => idx % step === 0);
}

// ── Supabase helper ──
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const STATE_KEY = "live_backtest_state";
const CANDLE_KEY = "live_backtest_candles";
const CHUNK_SIZE = 150; // reduced to avoid CPU timeout

async function loadMemory(sb: ReturnType<typeof createClient>, key: string) {
  const { data } = await sb.from("sovereign_memory").select("payload").eq("memory_key", key).single();
  return data?.payload as Record<string, unknown> | null;
}

async function saveMemory(sb: ReturnType<typeof createClient>, key: string, payload: Record<string, unknown>) {
  const { data: existing } = await sb.from("sovereign_memory")
    .select("id").eq("memory_key", key).single();
  if (existing) {
    await sb.from("sovereign_memory").update({
      payload: payload as unknown,
      updated_at: new Date().toISOString(),
      version: 1,
    }).eq("memory_key", key);
  } else {
    await sb.from("sovereign_memory").insert({
      memory_key: key,
      memory_type: "backtest_state",
      payload: payload as unknown,
      created_by: "profile-live-backtest",
      version: 1,
    });
  }
}

async function clearAll(sb: ReturnType<typeof createClient>) {
  await sb.from("sovereign_memory").delete().eq("memory_key", STATE_KEY);
  await sb.from("sovereign_memory").delete().eq("memory_key", CANDLE_KEY);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const phase: string = body.phase || "init";
    const environment: "practice" | "live" = body.environment || "practice";
    const candleCount: number = Math.min(body.candles || 5000, 42000);
    const topN: number = body.topN || 25;

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = getSupabase();

    // ════════════════════════════════════════════
    // PHASE: INIT — Fetch candles only, persist raw data
    // ════════════════════════════════════════════
    if (phase === "init") {
      console.log(`[LIVE-BT] INIT: Fetching ${candleCount} M30 candles for 28 pairs (${environment})`);

      // Clear any old state
      await clearAll(sb);

      const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));
      const pairCandles: Record<string, Candle[]> = {};
      const BATCH = 7;

      for (let b = 0; b < availableCrosses.length; b += BATCH) {
        const batch = availableCrosses.slice(b, b + BATCH);
        const results = await Promise.allSettled(
          batch.map(async cross => {
            const candles = await fetchCandles(cross.instrument, candleCount, environment, apiToken!);
            return { instrument: cross.instrument, candles };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.candles.length > 0) {
            pairCandles[r.value.instrument] = r.value.candles;
          }
        }
      }

      console.log(`[LIVE-BT] INIT: Fetched ${Object.keys(pairCandles).length} pairs`);

      // Compress and persist candle data only — defer heavy computation to "build" phase
      const compactCandles: Record<string, Array<[string, number, number, number, number]>> = {};
      for (const [inst, candles] of Object.entries(pairCandles)) {
        compactCandles[inst] = candles.map(c => [c.time, c.open, c.high, c.low, c.close]);
      }

      await saveMemory(sb, CANDLE_KEY, { compactCandles });

      // Save minimal state for next phase
      await saveMemory(sb, STATE_KEY, {
        phase: "build",
        environment,
        topN,
        candleCount,
        pairsLoaded: Object.keys(pairCandles).length,
      });

      return new Response(JSON.stringify({
        success: true,
        phase: "init_complete",
        pairsLoaded: Object.keys(pairCandles).length,
        message: `Candles fetched. Call phase=build to compute ranks & signals.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════════
    // PHASE: BUILD — Compute ranks, signals, persist for compute
    // ════════════════════════════════════════════
    if (phase === "build") {
      const state = await loadMemory(sb, STATE_KEY);
      if (!state || state.phase !== "build") {
        return new Response(JSON.stringify({ error: "Run phase=init first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const candleData = await loadMemory(sb, CANDLE_KEY);
      if (!candleData) {
        return new Response(JSON.stringify({ error: "Candle data missing." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const compactCandles = candleData.compactCandles as Record<string, Array<[string, number, number, number, number]>>;
      const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

      // Reconstruct candle objects
      const pairCandles: Record<string, Candle[]> = {};
      for (const [inst, arr] of Object.entries(compactCandles)) {
        pairCandles[inst] = arr.map(([time, open, high, low, close]) => ({
          time: time as string, open: open as number, high: high as number,
          low: low as number, close: close as number, volume: 0,
        }));
      }

      // Build time-indexed lookups
      const pairTimeIndex: Record<string, Record<string, number>> = {};
      for (const [inst, candles] of Object.entries(pairCandles)) {
        pairTimeIndex[inst] = {};
        for (let i = 0; i < candles.length; i++) pairTimeIndex[inst][candles[i].time] = i;
      }

      // Build rank snapshots
      const allTimestamps = new Set<string>();
      for (const candles of Object.values(pairCandles)) {
        for (const c of candles) allTimestamps.add(c.time);
      }
      const sortedTimes = [...allTimestamps].sort();

      if (sortedTimes.length < 100) {
        return new Response(JSON.stringify({ error: "Insufficient data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Compute 20-period rolling returns
      const LOOKBACK = 20;
      const pairReturns: Record<string, Record<string, number>> = {};
      for (const [inst, candles] of Object.entries(pairCandles)) {
        pairReturns[inst] = {};
        for (let i = LOOKBACK; i < candles.length; i++) {
          let totalRet = 0;
          for (let k = i - LOOKBACK; k < i; k++) {
            if (candles[k].open !== 0) totalRet += ((candles[k].close - candles[k].open) / candles[k].open) * 100;
          }
          pairReturns[inst][candles[i].time] = totalRet / LOOKBACK;
        }
      }

      const rankSnaps: RankSnap[] = [];
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

      console.log(`[LIVE-BT] BUILD: ${rankSnaps.length} rank snapshots`);

      // Pre-generate signals for all 9 rank pairs
      const signalCache: Record<string, TradeSignal[]> = {};
      for (const pr of PREDATOR_RANKS) {
        for (const py of PREY_RANKS) {
          signalCache[`${pr}_${py}`] = generateSignals(pr, py, rankSnaps, pairCandles, pairTimeIndex);
        }
      }

      const allCombos = buildAllCombos();

      // Persist enriched candle data (with ranks + signals)
      await saveMemory(sb, CANDLE_KEY, {
        compactCandles,
        pairTimeIndex,
        rankSnaps,
        signalCache,
      });

      // Update state for compute phase
      await saveMemory(sb, STATE_KEY, {
        phase: "compute",
        environment: state.environment,
        topN: state.topN,
        candleCount: state.candleCount,
        allCombos: allCombos.length,
        chunkIdx: 0,
        partialResults: [],
        dateRange: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
        pairsLoaded: state.pairsLoaded,
      });

      return new Response(JSON.stringify({
        success: true,
        phase: "build_complete",
        totalCombos: allCombos.length,
        pairsLoaded: state.pairsLoaded as number,
        totalSnapshots: rankSnaps.length,
        message: `Build complete. ${allCombos.length} combos ready. Call phase=compute.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════════
    // PHASE: COMPUTE — Process a chunk of combos
    // ════════════════════════════════════════════
    if (phase === "compute") {
      const state = await loadMemory(sb, STATE_KEY);
      if (!state || state.phase !== "compute") {
        return new Response(JSON.stringify({ error: "No init state found. Run phase=init first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const candleData = await loadMemory(sb, CANDLE_KEY);
      if (!candleData) {
        return new Response(JSON.stringify({ error: "Candle data missing. Run phase=init first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const chunkIdx = (state.chunkIdx as number) || 0;
      const totalCombos = state.allCombos as number;
      const compactCandles = candleData.compactCandles as Record<string, Array<[string, number, number, number, number]>>;
      const pairTimeIndex = candleData.pairTimeIndex as Record<string, Record<string, number>>;
      const signalCache = candleData.signalCache as Record<string, TradeSignal[]>;
      const partialResults = (state.partialResults as LiveProfileResult[]) || [];

      // Reconstruct candle objects from compact format
      const pairCandles: Record<string, Candle[]> = {};
      for (const [inst, arr] of Object.entries(compactCandles)) {
        pairCandles[inst] = arr.map(([time, open, high, low, close]) => ({
          time: time as string, open: open as number, high: high as number,
          low: low as number, close: close as number, volume: 0,
        }));
      }

      const allCombos = buildAllCombos();
      const startIdx = chunkIdx * CHUNK_SIZE;
      const endIdx = Math.min(startIdx + CHUNK_SIZE, allCombos.length);
      const chunk = allCombos.slice(startIdx, endIdx);

      console.log(`[LIVE-BT] COMPUTE: chunk ${chunkIdx}, combos ${startIdx}-${endIdx} of ${totalCombos}`);

      const newResults: LiveProfileResult[] = [];
      for (const combo of chunk) {
        const result = simulateCombo(combo, signalCache, pairCandles);
        if (result) newResults.push(result);
      }

      // Merge with partials, keep only top 100 to save memory
      const merged = [...partialResults, ...newResults]
        .sort((a, b) => b.netProfit - a.netProfit)
        .slice(0, 100);

      const done = endIdx >= allCombos.length;
      const nextChunkIdx = chunkIdx + 1;

      // Only update lightweight state (not candle data)
      await saveMemory(sb, STATE_KEY, {
        ...state,
        phase: done ? "extract" : "compute",
        chunkIdx: nextChunkIdx,
        partialResults: merged,
        ...(done ? { processedCombos: allCombos.length } : {}),
      });

      return new Response(JSON.stringify({
        success: true,
        phase: done ? "compute_complete" : "computing",
        processedCombos: endIdx,
        totalCombos,
        progress: Math.round((endIdx / totalCombos) * 100),
        topNetProfit: merged[0]?.netProfit ?? 0,
        message: done
          ? `All ${totalCombos} combos done. Call phase=extract.`
          : `Processed ${endIdx}/${totalCombos}. Call phase=compute again.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════════
    // PHASE: EXTRACT — Build final results + equity curves
    // ════════════════════════════════════════════
    if (phase === "extract") {
      const state = await loadMemory(sb, STATE_KEY);
      if (!state || state.phase !== "extract") {
        return new Response(JSON.stringify({ error: "Compute not finished. Run phase=compute until done." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const candleData = await loadMemory(sb, CANDLE_KEY);
      if (!candleData) {
        return new Response(JSON.stringify({ error: "Candle data missing." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const partialResults = state.partialResults as LiveProfileResult[];
      const rankSnaps = candleData.rankSnaps as RankSnap[];
      const compactCandles = candleData.compactCandles as Record<string, Array<[string, number, number, number, number]>>;
      const pairTimeIndex = candleData.pairTimeIndex as Record<string, Record<string, number>>;
      const dateRange = state.dateRange as { start: string; end: string };
      const pairsLoaded = state.pairsLoaded as number;
      const totalCombos = state.allCombos as number;
      const topNVal = (state.topN as number) || 25;

      // Reconstruct candles
      const pairCandles: Record<string, Candle[]> = {};
      for (const [inst, arr] of Object.entries(compactCandles)) {
        pairCandles[inst] = arr.map(([time, open, high, low, close]) => ({
          time: time as string, open: open as number, high: high as number,
          low: low as number, close: close as number, volume: 0,
        }));
      }

      const topResults = partialResults.slice(0, topNVal);

      // Build equity curves for top 10
      for (let i = 0; i < Math.min(10, topResults.length); i++) {
        topResults[i].equityCurve = buildEquityCurve(topResults[i], rankSnaps, pairCandles, pairTimeIndex);
      }

      const profitable = partialResults.filter(r => r.netProfit > 0).length;

      console.log(`[LIVE-BT] EXTRACT: Top net profit: $${topResults[0]?.netProfit ?? 0}`);

      // Clean up state
      await clearAll(sb);

      return new Response(JSON.stringify({
        success: true,
        phase: "complete",
        version: "2.0",
        timestamp: new Date().toISOString(),
        environment,
        candlesPerPair: Object.values(pairCandles)[0]?.length ?? 0,
        pairsLoaded,
        totalSnapshots: rankSnaps.length,
        totalCombos,
        profitableCombos: profitable,
        topResults,
        dateRange,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[LIVE-BT] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
