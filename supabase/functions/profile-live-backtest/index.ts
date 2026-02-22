// Profile Live Backtest Engine v4.0 — CPU-Optimized Single-Call
// Pre-computes trade exits once per signal, then combos just filter+aggregate.

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

// ── Parameter Grid ──
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

// Exit modes built once
const EXIT_MODES: Array<{ slPips: number; tpRatio: number | "flip" }> = [];
for (const sl of SL_PIPS) {
  for (const tp of TP_RATIOS) EXIT_MODES.push({ slPips: sl, tpRatio: tp });
  EXIT_MODES.push({ slPips: sl, tpRatio: "flip" });
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

function matchesSession(isoTime: string, session: typeof SESSIONS[number]): boolean {
  if (!session.hours) return true;
  const hour = new Date(isoTime).getUTCHours();
  return hour >= session.hours[0] && hour < session.hours[1];
}

function computePips(entry: number, exit: number, dir: "long" | "short", isJPY: boolean): number {
  const raw = dir === "long" ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

function getSessionId(isoTime: string): string {
  const hour = new Date(isoTime).getUTCHours();
  if (hour >= 0 && hour < 7) return "ASIA";
  if (hour >= 7 && hour < 12) return "LONDON";
  if (hour >= 12 && hour < 17) return "NEW_YORK";
  if (hour >= 17 && hour < 21) return "NY_CLOSE";
  return "ASIA";
}

// ── Signal with pre-computed exits ──
interface TradeSignal {
  time: string; instrument: string; direction: "long" | "short";
  entryPrice: number; isJPY: boolean; candleIdx: number;
  sessionId: string; g2Pass: boolean; g3Pass: boolean;
  // Pre-computed exit pips for each exit mode index
  exitPips: Float64Array;
}

interface RankSnap { time: string; ranks: Record<string, number>; }

// ── Pre-compute exits for a signal across all exit modes ──
function precomputeExits(
  sig: { entryPrice: number; isJPY: boolean; candleIdx: number; direction: "long" | "short"; instrument: string },
  candles: Candle[],
  nextSignalTime: string | null,
): Float64Array {
  const results = new Float64Array(EXIT_MODES.length);
  const isJPY = sig.isJPY;
  const pipMul = isJPY ? 100 : 10000;

  for (let ei = 0; ei < EXIT_MODES.length; ei++) {
    const exit = EXIT_MODES[ei];
    const slPrice = exit.slPips / pipMul;
    const tpPrice = exit.tpRatio === "flip" ? Infinity : (exit.slPips * (exit.tpRatio as number)) / pipMul;
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

    results[ei] = computePips(sig.entryPrice, exitPrice, sig.direction, isJPY);
  }
  return results;
}

function generateSignals(
  predRank: number, preyRank: number, rankSnaps: RankSnap[],
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>
): TradeSignal[] {
  const rawSignals: Array<Omit<TradeSignal, 'exitPips'>> = [];
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

      rawSignals.push({
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

  // Pre-compute exits for all signals (the expensive part, done ONCE)
  const signals: TradeSignal[] = [];
  for (let i = 0; i < rawSignals.length; i++) {
    const sig = rawSignals[i];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const nextTime = i + 1 < rawSignals.length ? rawSignals[i + 1].time : null;
    const exitPips = precomputeExits(sig, candles, nextTime);
    signals.push({ ...sig, exitPips });
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

// ── Simulate one combo — now just filter + aggregate, NO candle walking ──
function simulateCombo(
  predRank: number, preyRank: number, gateIdx: number, sessionIdx: number, exitIdx: number,
  signals: TradeSignal[],
): LiveProfileResult | null {
  const gate = GATE_COMBOS[gateIdx];
  const session = SESSIONS[sessionIdx];
  const exit = EXIT_MODES[exitIdx];

  // Fast filter
  const filtered: TradeSignal[] = [];
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (gate.g2 && !sig.g2Pass) continue;
    if (gate.g3 && !sig.g3Pass) continue;
    if (session.hours && !matchesSession(sig.time, session)) continue;
    filtered.push(sig);
  }

  if (filtered.length < 3) return null;

  let equity = 1000, peak = 1000, maxDD = 0, wins = 0, losses = 0, totalPips = 0;
  let grossProfit = 0, grossLoss = 0;

  for (let fi = 0; fi < filtered.length; fi++) {
    const sig = filtered[fi];
    const isJPY = sig.isJPY;
    const pipVal = isJPY ? 0.01 : 0.0001;

    // Use pre-computed exit pips — O(1) instead of walking candles
    const tradePips = sig.exitPips[exitIdx];
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
    predator: predRank, prey: preyRank, gates: gate.label,
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

// ── Build equity curve for top results ──
function buildEquityCurve(r: LiveProfileResult, signals: TradeSignal[], exitIdx: number): Array<{ time: string; equity: number }> {
  const gate = GATE_COMBOS.find(g => g.label === r.gates)!;
  const exit = EXIT_MODES[exitIdx];

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

  for (const sig of filtered) {
    const pipVal = sig.isJPY ? 0.01 : 0.0001;
    const tradePips = sig.exitPips[exitIdx];
    const riskAmt = equity * 0.05;
    const dynUnits = exit.slPips > 0 ? riskAmt / (exit.slPips * pipVal) : 2000;
    equity += tradePips * (dynUnits * pipVal);
    curve.push({ time: sig.time, equity: Math.round(equity * 100) / 100 });
  }

  const step = Math.max(1, Math.floor(curve.length / 300));
  return curve.filter((_, idx) => idx % step === 0);
}

// ════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
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

    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    // ── Step 1: Fetch candles ──
    console.log(`[LIVE-BT v4] Fetching ${candleCount} candles for ${availableCrosses.length} pairs (${environment})`);
    const pairCandles: Record<string, Candle[]> = {};
    for (let i = 0; i < availableCrosses.length; i += 7) {
      const batch = availableCrosses.slice(i, i + 7);
      const results = await Promise.allSettled(
        batch.map(cross => fetchCandles(cross.instrument, candleCount, environment, apiToken))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") {
          const candles = (results[j] as PromiseFulfilledResult<Candle[]>).value;
          if (candles.length > 0) pairCandles[batch[j].instrument] = candles;
        }
      }
    }
    console.log(`[LIVE-BT v4] Loaded ${Object.keys(pairCandles).length} pairs`);

    // ── Step 2: Build time index + rank snapshots ──
    const pairTimeIndex: Record<string, Record<string, number>> = {};
    for (const [inst, candles] of Object.entries(pairCandles)) {
      pairTimeIndex[inst] = {};
      for (let i = 0; i < candles.length; i++) pairTimeIndex[inst][candles[i].time] = i;
    }

    const allTimestamps = new Set<string>();
    for (const candles of Object.values(pairCandles)) {
      for (const c of candles) allTimestamps.add(c.time);
    }
    const sortedTimes = [...allTimestamps].sort();

    if (sortedTimes.length < 100) {
      return new Response(JSON.stringify({ error: "Insufficient data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    console.log(`[LIVE-BT v4] ${rankSnaps.length} rank snapshots`);

    // ── Step 3: Generate signals WITH pre-computed exits (one-time candle walk) ──
    const signalCache: Record<string, TradeSignal[]> = {};
    for (const pr of PREDATOR_RANKS) {
      for (const py of PREY_RANKS) {
        signalCache[`${pr}_${py}`] = generateSignals(pr, py, rankSnaps, pairCandles, pairTimeIndex);
      }
    }
    console.log(`[LIVE-BT v4] Signals pre-computed with exits`);

    // ── Step 4: Simulate all combos (now O(1) per trade — no candle walking) ──
    const totalCombos = PREDATOR_RANKS.length * PREY_RANKS.length * GATE_COMBOS.length * SESSIONS.length * EXIT_MODES.length;
    console.log(`[LIVE-BT v4] Simulating ${totalCombos} combos (fast aggregate)`);

    const allResults: LiveProfileResult[] = [];
    for (const pr of PREDATOR_RANKS) {
      for (const py of PREY_RANKS) {
        const signals = signalCache[`${pr}_${py}`];
        if (!signals || signals.length < 3) continue;
        for (let gi = 0; gi < GATE_COMBOS.length; gi++) {
          for (let si = 0; si < SESSIONS.length; si++) {
            for (let ei = 0; ei < EXIT_MODES.length; ei++) {
              const result = simulateCombo(pr, py, gi, si, ei, signals);
              if (result) allResults.push(result);
            }
          }
        }
      }
    }

    allResults.sort((a, b) => b.netProfit - a.netProfit);
    const topResults = allResults.slice(0, topN);

    // Build equity curves for top 10
    for (let i = 0; i < Math.min(10, topResults.length); i++) {
      const r = topResults[i];
      const signals = signalCache[`${r.predator}_${r.prey}`];
      const exitIdx = EXIT_MODES.findIndex(e => e.slPips === r.slPips && e.tpRatio === r.tpRatio);
      if (signals && exitIdx >= 0) {
        topResults[i].equityCurve = buildEquityCurve(r, signals, exitIdx);
      }
    }

    const profitable = allResults.filter(r => r.netProfit > 0).length;
    console.log(`[LIVE-BT v4] Done. ${profitable} profitable. Top: $${topResults[0]?.netProfit ?? 0}`);

    return new Response(JSON.stringify({
      success: true, version: "4.0",
      timestamp: new Date().toISOString(), environment,
      candlesPerPair: Object.values(pairCandles)[0]?.length ?? 0,
      pairsLoaded: Object.keys(pairCandles).length,
      totalSnapshots: rankSnaps.length,
      totalCombos, profitableCombos: profitable,
      topResults,
      dateRange: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[LIVE-BT v4] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
