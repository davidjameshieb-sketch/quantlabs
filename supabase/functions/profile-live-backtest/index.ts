// Profile Live Backtest Engine v5.0 — MapReduce Architecture
// Frontend fires N parallel calls, each processing a subset of predator ranks.
// Optimizations: bitwise gate encoding, pre-computed exits, minimal JSON output.

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
const PREY_RANKS = [6, 7, 8];

// Bitwise gate masks
const GATE_G1 = 0b001;
const GATE_G2 = 0b010;
const GATE_G3 = 0b100;

const GATE_COMBOS = [
  { mask: GATE_G1 | GATE_G2 | GATE_G3, label: "G1+G2+G3" },
  { mask: GATE_G1 | GATE_G2, label: "G1+G2" },
  { mask: GATE_G1 | GATE_G3, label: "G1+G3" },
  { mask: GATE_G2 | GATE_G3, label: "G2+G3" },
  { mask: GATE_G1, label: "G1 only" },
  { mask: 0b000, label: "No Gates" },
];

const SL_PIPS = [10, 15, 20, 30, 42];
const TP_RATIOS = [1.5, 2.0, 3.0];

// Session hour ranges [start, end) — null = ALL
const SESSIONS: Array<{ id: string; hours: [number, number] | null }> = [
  { id: "ALL", hours: null },
  { id: "ASIA", hours: [0, 7] },
  { id: "LONDON", hours: [7, 12] },
  { id: "NEW_YORK", hours: [12, 17] },
  { id: "NY_CLOSE", hours: [17, 21] },
];

// Exit modes built once
const EXIT_MODES: Array<{ slPips: number; tpRatio: number | "flip" }> = [];
for (const sl of SL_PIPS) {
  for (const tp of TP_RATIOS) EXIT_MODES.push({ slPips: sl, tpRatio: tp });
  EXIT_MODES.push({ slPips: sl, tpRatio: "flip" });
}
const NUM_EXITS = EXIT_MODES.length;

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
  const all: Candle[] = [];
  let remaining = count;
  let cursor: string | undefined = undefined;
  while (remaining > 0) {
    const batch = Math.min(remaining, PAGE_SIZE);
    const page = await fetchCandlePage(instrument, batch, env, token, cursor);
    if (page.length === 0) break;
    all.unshift(...page);
    remaining -= page.length;
    if (page.length < batch) break;
    cursor = page[0].time;
  }
  const seen = new Set<string>();
  return all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
}

// ── Gate helpers (return bitwise flags) ──
function computeGateBits(candles: Candle[], idx: number, direction: "long" | "short"): number {
  let bits = GATE_G1; // G1 (rank divergence) always set when signal exists

  // G2: Atlas Walls — 20-period structural breakout
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

  // G3: David Vector — LinReg slope
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
  if (hour >= 0 && hour < 7) return 1;   // ASIA
  if (hour >= 7 && hour < 12) return 2;  // LONDON
  if (hour >= 12 && hour < 17) return 3; // NEW_YORK
  if (hour >= 17 && hour < 21) return 4; // NY_CLOSE
  return 1; // late night → ASIA
}

function computePips(entry: number, exit: number, dir: "long" | "short", isJPY: boolean): number {
  const raw = dir === "long" ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

// ── Compact signal with bitwise gates + pre-computed exits ──
interface CompactSignal {
  time: string;
  instrument: string;
  direction: "long" | "short";
  entryPrice: number;
  isJPY: boolean;
  candleIdx: number;
  gateBits: number;       // bitwise G1|G2|G3
  sessionIdx: number;     // 0=ALL not used here, 1=ASIA..4=NY_CLOSE
  exitPips: Float64Array; // pre-computed for each EXIT_MODE index
}

interface RankSnap { time: string; ranks: Record<string, number>; }

// ── Pre-compute exits for a signal ──
function precomputeExits(
  entryPrice: number, isJPY: boolean, candleIdx: number, direction: "long" | "short",
  candles: Candle[], nextSignalTime: string | null,
): Float64Array {
  const results = new Float64Array(NUM_EXITS);
  const pipMul = isJPY ? 100 : 10000;

  for (let ei = 0; ei < NUM_EXITS; ei++) {
    const exit = EXIT_MODES[ei];
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

// ── Generate signals for one predator/prey rank combo ──
function generateSignals(
  predRank: number, preyRank: number, rankSnaps: RankSnap[],
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>
): CompactSignal[] {
  // Step 1: collect raw signals (no exit computation yet)
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

      raw.push({
        time: snap.time, instrument, direction,
        entryPrice: candles[candleIdx].close,
        isJPY: instrument.includes("JPY"),
        candleIdx, gateBits, sessionIdx: getSessionIdx(hour),
      });
      prevInst = instrument;
      prevDir = direction;
    }
  }

  // Step 2: pre-compute exits
  const signals: CompactSignal[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const sig = raw[i];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const nextTime = i + 1 < raw.length ? raw[i + 1].time : null;
    signals[i] = {
      ...sig,
      exitPips: precomputeExits(sig.entryPrice, sig.isJPY, sig.candleIdx, sig.direction, candles, nextTime),
    };
  }

  return signals.filter(Boolean);
}

// ── Suck Rules Constants ──
const FRICTION_PIPS = 1.5;       // Execution friction: subtract from wins, add to losses
const MAX_ALLOWED_DD = 0.15;     // 15% equity-relative drawdown cap

// ── Result interface ──
interface LiveProfileResult {
  predator: number; prey: number; gates: string;
  slPips: number; tpRatio: number | "flip"; session: string;
  trades: number; wins: number; losses: number;
  winRate: number; profitFactor: number; totalPips: number;
  netProfit: number; maxDrawdown: number; expectancy: number;
  avgWin: number; avgLoss: number;
  stability: "STABLE" | "UNSTABLE";  // Suck Rule #1: DD flag
  equityCurve: Array<{ time: string; equity: number }> | null;
}

// ── Simulate one combo — bitwise gate check, O(1) per trade ──
// Suck Rules applied: #1 (15% DD cap), #3 (1.5-pip friction)
function simulateCombo(
  predRank: number, preyRank: number,
  gateMask: number, gateLabel: string,
  sessionIdx: number, sessionId: string,
  exitIdx: number,
  signals: CompactSignal[],
): LiveProfileResult | null {
  const exit = EXIT_MODES[exitIdx];
  const FLAT_UNITS = 2000;
  let equity = 1000, peak = 1000, maxDD = 0;
  let wins = 0, losses = 0, totalPips = 0, grossProfit = 0, grossLoss = 0;
  let stability: "STABLE" | "UNSTABLE" = "STABLE";

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];

    // Bitwise gate check
    if (gateMask !== 0 && (sig.gateBits & gateMask) !== gateMask) continue;

    // Session filter
    if (sessionIdx !== 0 && sig.sessionIdx !== sessionIdx) continue;

    // Suck Rule #3: Apply 1.5-pip execution friction
    let tradePips = sig.exitPips[exitIdx];
    if (tradePips > 0) {
      tradePips -= FRICTION_PIPS; // Subtract from wins
    } else {
      tradePips -= FRICTION_PIPS; // Add to losses (make them worse)
    }

    const pipVal = sig.isJPY ? 0.01 : 0.0001;
    const pnl = tradePips * FLAT_UNITS * pipVal;
    equity += pnl;
    totalPips += tradePips;

    if (tradePips > 0) { wins++; grossProfit += tradePips; }
    else { losses++; grossLoss += Math.abs(tradePips); }

    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak; // 0..1 scale

    // Suck Rule #1: 15% DD cap — flag as UNSTABLE
    if (dd > MAX_ALLOWED_DD) {
      stability = "UNSTABLE";
    }

    const ddPct = -dd * 100;
    if (ddPct < maxDD) maxDD = ddPct;
  }

  const trades = wins + losses;
  if (trades < 3) return null;

  return {
    predator: predRank, prey: preyRank, gates: gateLabel,
    slPips: exit.slPips, tpRatio: exit.tpRatio, session: sessionId,
    trades, wins, losses,
    winRate: Math.round((wins / trades) * 1000) / 10,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
    totalPips: Math.round(totalPips * 10) / 10,
    netProfit: Math.round((equity - 1000) * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    expectancy: Math.round((totalPips / trades) * 100) / 100,
    avgWin: wins > 0 ? Math.round((grossProfit / wins) * 10) / 10 : 0,
    avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 10) / 10 : 0,
    stability,
    equityCurve: null,
  };
}

// ── Build equity curve for a top result (with friction applied) ──
function buildEquityCurve(r: LiveProfileResult, signals: CompactSignal[], exitIdx: number): Array<{ time: string; equity: number }> {
  const gate = GATE_COMBOS.find(g => g.label === r.gates)!;
  const sessionIdx = SESSIONS.findIndex(s => s.id === r.session);
  const FLAT_UNITS = 2000;
  const curve: Array<{ time: string; equity: number }> = [];
  let equity = 1000;

  for (const sig of signals) {
    if (gate.mask !== 0 && (sig.gateBits & gate.mask) !== gate.mask) continue;
    if (sessionIdx > 0 && sig.sessionIdx !== sessionIdx) continue;

    const pipVal = sig.isJPY ? 0.01 : 0.0001;
    let tradePips = sig.exitPips[exitIdx];
    // Apply same friction as simulation
    if (tradePips > 0) tradePips -= FRICTION_PIPS;
    else tradePips -= FRICTION_PIPS;

    const pnl = tradePips * FLAT_UNITS * pipVal;
    equity += pnl;
    curve.push({ time: sig.time, equity: Math.round(equity * 100) / 100 });
  }

  const step = Math.max(1, Math.floor(curve.length / 300));
  return curve.filter((_, idx) => idx % step === 0);
}

// ════════════════════════════════════════════
// MAIN HANDLER — accepts `predatorRanks` for MapReduce chunking
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
    // MapReduce: which predator ranks this worker processes
    const predatorRanks: number[] = body.predatorRanks || [1, 2, 3];

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    // ── Step 1: Fetch candles in batches of 7 ──
    console.log(`[LIVE-BT v5] Worker for predators [${predatorRanks}] — ${candleCount} candles (${environment})`);
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
    console.log(`[LIVE-BT v5] Loaded ${Object.keys(pairCandles).length} pairs`);

    // ── Step 2: Build time index + rank snapshots ──
    const pairTimeIndex: Record<string, Record<string, number>> = {};
    for (const [inst, candles] of Object.entries(pairCandles)) {
      const idx: Record<string, number> = {};
      for (let i = 0; i < candles.length; i++) idx[candles[i].time] = i;
      pairTimeIndex[inst] = idx;
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

    // Compute currency returns (20-bar lookback)
    const LOOKBACK = 20;
    const pairReturns: Record<string, Record<string, number>> = {};
    for (const [inst, candles] of Object.entries(pairCandles)) {
      const ret: Record<string, number> = {};
      for (let i = LOOKBACK; i < candles.length; i++) {
        let totalRet = 0;
        for (let k = i - LOOKBACK; k < i; k++) {
          if (candles[k].open !== 0) totalRet += ((candles[k].close - candles[k].open) / candles[k].open) * 100;
        }
        ret[candles[i].time] = totalRet / LOOKBACK;
      }
      pairReturns[inst] = ret;
    }

    // Build rank snapshots
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
    console.log(`[LIVE-BT v5] ${rankSnaps.length} rank snapshots`);

    // ── Step 3: Generate signals only for assigned predator ranks ──
    const signalCache: Record<string, CompactSignal[]> = {};
    for (const pr of predatorRanks) {
      for (const py of PREY_RANKS) {
        signalCache[`${pr}_${py}`] = generateSignals(pr, py, rankSnaps, pairCandles, pairTimeIndex);
      }
    }
    console.log(`[LIVE-BT v5] Signals pre-computed for ${Object.keys(signalCache).length} rank combos`);

    // ── Step 4: Simulate combos (bitwise gate, integer session, O(1) exit lookup) ──
    const combosPerPredator = PREY_RANKS.length * GATE_COMBOS.length * SESSIONS.length * NUM_EXITS;
    const totalCombos = predatorRanks.length * combosPerPredator;
    console.log(`[LIVE-BT v5] Simulating ${totalCombos} combos`);

    const allResults: LiveProfileResult[] = [];
    for (const pr of predatorRanks) {
      for (const py of PREY_RANKS) {
        const signals = signalCache[`${pr}_${py}`];
        if (!signals || signals.length < 3) continue;
        for (let gi = 0; gi < GATE_COMBOS.length; gi++) {
          for (let si = 0; si < SESSIONS.length; si++) {
            for (let ei = 0; ei < NUM_EXITS; ei++) {
              const result = simulateCombo(
                pr, py,
                GATE_COMBOS[gi].mask, GATE_COMBOS[gi].label,
                si, SESSIONS[si].id,
                ei, signals
              );
              if (result) allResults.push(result);
            }
          }
        }
      }
    }

    // Suck Rule #2: Sort STABLE before UNSTABLE, then by netProfit
    // Triple-lock (G1+G2+G3) profiles get priority within stability tier
    allResults.sort((a, b) => {
      // Stability first: STABLE > UNSTABLE
      if (a.stability !== b.stability) return a.stability === "STABLE" ? -1 : 1;
      // Triple-lock gate priority within same stability
      const aTriple = a.gates === "G1+G2+G3" ? 1 : 0;
      const bTriple = b.gates === "G1+G2+G3" ? 1 : 0;
      if (aTriple !== bTriple) return bTriple - aTriple;
      // Then by net profit
      return b.netProfit - a.netProfit;
    });
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
    console.log(`[LIVE-BT v5] Done. ${profitable} profitable. Top: $${topResults[0]?.netProfit ?? 0}`);

    return new Response(JSON.stringify({
      success: true, version: "5.0",
      timestamp: new Date().toISOString(), environment,
      candlesPerPair: Object.values(pairCandles)[0]?.length ?? 0,
      pairsLoaded: Object.keys(pairCandles).length,
      totalSnapshots: rankSnaps.length,
      totalCombos, profitableCombos: profitable,
      topResults,
      predatorRanks,
      dateRange: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[LIVE-BT v5] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
