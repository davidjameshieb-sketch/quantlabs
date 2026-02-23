// Blend Live Backtest v3.0 — Portfolio Forward Test using REAL engine parity
// Uses the EXACT same signal generation, pre-computed exits, and simulation logic
// as profile-live-backtest (the "truth" engine), then aggregates per-strategy results.

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

// ── Sovereign-Alpha Constants (identical to profile-live-backtest) ──
const FRICTION_PIPS = 1.5;
const MAX_UNITS = 5_000_000;
const AGGRESSIVE_RISK = 0.05;
const INSTITUTIONAL_RISK = 0.01;
const BASE_EQUITY = 1000;

// ── Bitwise gate masks (identical to profile-live-backtest) ──
const GATE_G1 = 0b001;
const GATE_G2 = 0b010;
const GATE_G3 = 0b100;

// ── Candle Fetching (identical to profile-live-backtest) ──
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

// ── Gate helpers (IDENTICAL to profile-live-backtest) ──
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

// ── Compact signal (IDENTICAL to profile-live-backtest) ──
interface CompactSignal {
  time: string;
  instrument: string;
  direction: "long" | "short";
  entryPrice: number;
  isJPY: boolean;
  candleIdx: number;
  gateBits: number;
  sessionIdx: number;
  exitPips: Float64Array;
}

interface RankSnap { time: string; ranks: Record<string, number>; }

// ── Pre-compute exits for a signal (IDENTICAL to profile-live-backtest) ──
// exitModes is passed in so each strategy can use its own SL/TP
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

// ── Generate signals for rank-based strategy (IDENTICAL to profile-live-backtest) ──
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

  const signals: CompactSignal[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const sig = raw[i];
    const candles = pairCandles[sig.instrument];
    if (!candles) continue;
    const nextTime = i + 1 < raw.length ? raw[i + 1].time : null;
    signals[i] = {
      ...sig,
      exitPips: precomputeExits(sig.entryPrice, sig.isJPY, sig.candleIdx, sig.direction, candles, nextTime, exitModes),
    };
  }
  return signals.filter(Boolean);
}

// ── Generate signals for fixed-pair strategy ──
function generatePairSignals(
  pair: string, direction: "long" | "short" | null,
  pairCandles: Record<string, Candle[]>, pairTimeIndex: Record<string, Record<string, number>>,
  exitModes: Array<{ slPips: number; tpRatio: number | "flip" }>,
  rankSnaps: RankSnap[],
): CompactSignal[] {
  const candles = pairCandles[pair];
  if (!candles || candles.length < 30) return [];

  // For fixed-pair strategies, generate a signal at each rank snapshot where candle data exists
  // Direction comes from LinReg slope (same as G3 logic) if not specified
  const raw: Array<Omit<CompactSignal, 'exitPips'>> = [];
  let prevDir: "long" | "short" | null = null;
  const timeIdx = pairTimeIndex[pair];

  for (const snap of rankSnaps) {
    const candleIdx = timeIdx?.[snap.time];
    if (candleIdx === undefined || candleIdx < 21) continue;

    // Determine direction from LinReg slope if not fixed
    let dir: "long" | "short";
    if (direction) {
      dir = direction;
    } else {
      const n = 20;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        const ci = candleIdx - n + i;
        sumX += i; sumY += candles[ci].close; sumXY += i * candles[ci].close; sumX2 += i * i;
      }
      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      dir = slope >= 0 ? "long" : "short";
    }

    // Only generate signal on direction change (same logic as rank-based)
    if (dir === prevDir) continue;
    prevDir = dir;

    const gateBits = computeGateBits(candles, candleIdx, dir);
    const hour = new Date(snap.time).getUTCHours();

    raw.push({
      time: snap.time, instrument: pair, direction: dir,
      entryPrice: candles[candleIdx].close,
      isJPY: pair.includes("JPY"),
      candleIdx, gateBits, sessionIdx: getSessionIdx(hour),
    });
  }

  const signals: CompactSignal[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const sig = raw[i];
    const nextTime = i + 1 < raw.length ? raw[i + 1].time : null;
    signals[i] = {
      ...sig,
      exitPips: precomputeExits(sig.entryPrice, sig.isJPY, sig.candleIdx, sig.direction, candles, nextTime, exitModes),
    };
  }
  return signals.filter(Boolean);
}

// ── Position sizing (IDENTICAL to profile-live-backtest) ──
function computeUnits(equity: number, riskPct: number, slPips: number, pipVal: number): number {
  const riskAmount = equity * riskPct;
  const rawUnits = riskAmount / (slPips * pipVal);
  return Math.min(rawUnits, MAX_UNITS);
}

// ── Blend Component from request ──
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
  atrSlMultiplier?: number;
  atrTpMultiplier?: number;
}

// ── Per-strategy result ──
interface StrategyResult {
  id: string;
  label: string;
  weight: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPips: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  institutionalProfit: number;
  aggressiveProfit: number;
  maxDrawdown: number;
  equityCurve: Array<{ time: string; pips: number }>;
}

// ── Simulate one strategy using its exact parameters ──
function simulateStrategy(
  comp: BlendComponent,
  signals: CompactSignal[],
  exitIdx: number,
  slPips: number,
): StrategyResult {
  // Resolve gate mask
  let gateMask = GATE_G1;
  const gates = comp.gates || '';
  if (gates.includes('G2')) gateMask |= GATE_G2;
  if (gates.includes('G3')) gateMask |= GATE_G3;
  if (comp.requireG3) gateMask |= GATE_G2 | GATE_G3;

  // Resolve session filter
  const SESSIONS = ["ALL", "ASIA", "LONDON", "NEW_YORK", "NY_CLOSE"];
  const sessionIdx = comp.session ? SESSIONS.indexOf(comp.session.toUpperCase()) : 0;

  let instEquity = 1000, instPeak = 1000, instMaxDD = 0;
  let aggEquity = 1000, aggPeak = 1000;
  let wins = 0, losses = 0, totalPips = 0;
  let grossWinPips = 0, grossLossPips = 0;
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

    // Institutional model (1% risk)
    const instUnits = computeUnits(instEquity, INSTITUTIONAL_RISK, slPips, pipVal);
    instEquity += tradePips * instUnits * pipVal;
    if (instEquity > instPeak) instPeak = instEquity;
    const instDD = (instPeak - instEquity) / instPeak;
    if (instDD > instMaxDD) instMaxDD = instDD;

    // Aggressive model (5% risk)
    const aggUnits = computeUnits(aggEquity, AGGRESSIVE_RISK, slPips, pipVal);
    aggEquity += tradePips * aggUnits * pipVal;

    curve.push({ time: sig.time, pips: tradePips });
  }

  const trades = wins + losses;
  return {
    id: comp.id,
    label: comp.label,
    weight: comp.weight,
    trades,
    wins,
    losses,
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

// ════════════════════════════════════════════
// MAIN HANDLER — v3.0 True Parity
// ════════════════════════════════════════════
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
      atrSlMultiplier: c.atrSlMultiplier || undefined,
      atrTpMultiplier: c.atrTpMultiplier || undefined,
    }));

    if (components.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No components provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[BLEND-BT v3] Starting — ${components.length} strategies, ${candleCount} candles (${environment})`);

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    // ── Step 1: Fetch candles (identical to profile-live-backtest) ──
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
    const pairsLoaded = Object.keys(pairCandles).length;
    const avgCandles = Math.round(Object.values(pairCandles).reduce((s, c) => s + c.length, 0) / pairsLoaded);
    console.log(`[BLEND-BT v3] Loaded ${pairsLoaded} pairs, avg ${avgCandles} candles`);

    // ── Step 2: Build time index + rank snapshots (identical to profile-live-backtest) ──
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
    console.log(`[BLEND-BT v3] ${rankSnaps.length} rank snapshots`);

    // ── Step 3: Simulate each strategy independently using the REAL engine logic ──
    const strategyResults: StrategyResult[] = [];
    const signalCache: Record<string, CompactSignal[]> = {};

    for (const comp of components) {
      // Build exit modes for this specific strategy (just its SL/TP combo)
      const exitModes = [{ slPips: comp.slPips, tpRatio: comp.tpRatio }];
      const exitIdx = 0; // Single exit mode per strategy

      let signals: CompactSignal[];

      if (comp.fixedPair) {
        // Fixed-pair strategy: generate signals on specific pair
        const cacheKey = `pair:${comp.fixedPair}:${comp.id}`;
        if (!signalCache[cacheKey]) {
          // Determine fixed direction from DNA if available
          let fixedDir: "long" | "short" | null = null;
          // No fixed direction — use LinReg slope (same as rank flip logic)
          signalCache[cacheKey] = generatePairSignals(
            comp.fixedPair, fixedDir,
            pairCandles, pairTimeIndex, exitModes, rankSnaps
          );
        }
        signals = signalCache[cacheKey];
      } else if (comp.predatorRank && comp.preyRank) {
        // Rank-based strategy: use exact same signal generation as profile-live-backtest
        const cacheKey = `rank:${comp.predatorRank}_${comp.preyRank}:sl${comp.slPips}:tp${comp.tpRatio}`;
        if (!signalCache[cacheKey]) {
          signalCache[cacheKey] = generateRankSignals(
            comp.predatorRank, comp.preyRank, rankSnaps,
            pairCandles, pairTimeIndex, exitModes
          );
        }
        signals = signalCache[cacheKey];
      } else {
        console.log(`[BLEND-BT v3] Skipping ${comp.id}: no rank or pair defined`);
        continue;
      }

      console.log(`[BLEND-BT v3] ${comp.id}: ${signals.length} signals generated`);
      const result = simulateStrategy(comp, signals, exitIdx, comp.slPips);
      strategyResults.push(result);
      console.log(`[BLEND-BT v3] ${comp.id}: ${result.trades} trades, PF=${result.profitFactor}, Net=${result.totalPips}p, Inst=$${result.institutionalProfit}`);
    }

    // ── Step 4: Build portfolio equity curve by time-merging all strategy trades ──
    // Collect all trades with timestamps and strategy weights
    interface PortfolioTrade { time: string; pips: number; weight: number; slPips: number; isJPY: boolean; strategyId: string; }
    const allPortfolioTrades: PortfolioTrade[] = [];

    for (const sr of strategyResults) {
      const comp = components.find(c => c.id === sr.id)!;
      const isJPY = comp.fixedPair?.includes('JPY') || false;
      for (const pt of sr.equityCurve) {
        allPortfolioTrades.push({
          time: pt.time, pips: pt.pips, weight: sr.weight,
          slPips: comp.slPips, isJPY, strategyId: sr.id,
        });
      }
    }

    // Sort by time for chronological aggregation
    allPortfolioTrades.sort((a, b) => a.time.localeCompare(b.time));

    let portfolioEquity = BASE_EQUITY;
    let peak = BASE_EQUITY;
    let maxDD = 0;
    let aggEquity = BASE_EQUITY;
    let aggPeak = BASE_EQUITY;
    let aggMaxDD = 0;
    let totalWins = 0, totalLosses = 0, totalPips = 0;
    let grossWinPips = 0, grossLossPips = 0;

    const equityCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];
    const aggCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];

    const maxWeight = Math.max(...components.map(c => c.weight), 0.01);

    for (const trade of allPortfolioTrades) {
      const pipVal = trade.isJPY ? 0.01 : 0.0001;
      totalPips += trade.pips;

      if (trade.pips > 0) { totalWins++; grossWinPips += trade.pips; }
      else { totalLosses++; grossLossPips += Math.abs(trade.pips); }

      // Institutional: 1% risk, weighted by strategy allocation
      const instRisk = portfolioEquity * INSTITUTIONAL_RISK * trade.weight / maxWeight;
      const instUnits = trade.slPips > 0 ? Math.min(instRisk / (trade.slPips * pipVal), MAX_UNITS) : 0;
      portfolioEquity += trade.pips * instUnits * pipVal;
      if (portfolioEquity > peak) peak = portfolioEquity;
      const dd = (peak - portfolioEquity) / peak;
      if (dd > maxDD) maxDD = dd;
      equityCurve.push({ time: trade.time, equity: Math.round(portfolioEquity * 100) / 100 });

      // Aggressive: 5% risk
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

    // Period stats
    const actualDays = avgCandles / 44;
    const periods = [
      { label: '3D', days: 3 }, { label: '7D', days: 7 },
      { label: '14D', days: 14 }, { label: '30D', days: 30 }, { label: '60D', days: 60 },
    ];
    const flatUnits = 2000;
    const periodStats = periods.map(p => {
      const fraction = p.days / actualDays;
      const periodPips = totalPips * fraction;
      const periodTrades = Math.round(totalTrades * fraction);
      const periodReturn = periodPips * flatUnits * 0.0001;
      const periodReturnPct = (periodReturn / BASE_EQUITY) * 100;
      return {
        period: p.label,
        returnPct: Math.round(periodReturnPct * 100) / 100,
        winRate: totalTrades > 0 ? Math.round((totalWins / totalTrades) * 1000) / 10 : 0,
        profitFactor,
        maxDD: Math.round(-maxDD * 1000) / 10,
        netPips: Math.round(periodPips * 10) / 10,
        trades: periodTrades,
      };
    });

    // Component summaries
    const componentSummaries = strategyResults.map(sr => ({
      id: sr.id,
      label: sr.label,
      weight: sr.weight,
      trades: sr.trades,
      wins: sr.wins,
      losses: sr.losses,
      winRate: sr.winRate,
      totalPips: sr.totalPips,
      profitFactor: sr.profitFactor,
      avgWin: sr.avgWin,
      avgLoss: sr.avgLoss,
    }));

    const result = {
      success: true,
      version: "blend-bt-3.0-parity",
      timestamp: new Date().toISOString(),
      environment,
      candlesPerPair: avgCandles,
      pairsLoaded,
      totalSnapshots: rankSnaps.length,
      componentsUsed: components.length,
      dateRange: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
      portfolio: {
        totalTrades,
        wins: totalWins,
        losses: totalLosses,
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
      components: componentSummaries,
      periodStats,
      equityCurve: downsample(equityCurve),
      aggressiveEquityCurve: downsample(aggCurve),
    };

    console.log(`[BLEND-BT v3] Done. ${totalTrades} trades, PF=${profitFactor}, Net=${Math.round(totalPips)}p, Inst=$${Math.round(portfolioEquity - BASE_EQUITY)}, Agg=$${Math.round(aggEquity - BASE_EQUITY)}`);

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[BLEND-BT v3] Error:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
