// Profile Live Backtest Engine v1.0
// True bar-by-bar simulation of ALL Profile Discovery combos against real OANDA candle data.
// No synthetic PRNG — every trade is simulated with real SL/TP hit detection on H/L.
// Paginated fetch: up to 42,000 M30 candles per pair across 28 crosses.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    ALL_28_CROSSES.push({
      base: ALL_CURRENCIES[i],
      quote: ALL_CURRENCIES[j],
      instrument: `${ALL_CURRENCIES[i]}_${ALL_CURRENCIES[j]}`,
    });
  }
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

const SL_PIPS = [10, 15, 20, 30, 42]; // fixed pip SLs
const TP_RATIOS = [1.5, 2.0, 3.0]; // R:R ratios
// Plus signal-flip exit (no fixed TP)

const SESSIONS = [
  { id: "ALL", hours: null as null | [number, number] },
  { id: "ASIA", hours: [0, 7] as [number, number] },
  { id: "LONDON", hours: [7, 12] as [number, number] },
  { id: "NEW_YORK", hours: [12, 17] as [number, number] },
  { id: "NY_CLOSE", hours: [17, 21] as [number, number] },
];

// ── Candle Fetching (paginated) ──
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

// ── Pillar 2: Atlas Walls (20-period breakout) ──
function checkAtlasWalls(candles: Candle[], idx: number, direction: "long" | "short", lookback = 20): boolean {
  if (idx < lookback + 1) return false;
  const slice = candles.slice(idx - lookback, idx);
  const currentClose = candles[idx].close;
  if (direction === "long") return currentClose > Math.max(...slice.map(c => c.high));
  return currentClose < Math.min(...slice.map(c => c.low));
}

// ── Pillar 3: David Vector (LinReg slope) ──
function computeLinRegSlope(candles: Candle[], idx: number, lookback = 20): number {
  if (idx < lookback) return 0;
  const slice = candles.slice(idx - lookback, idx);
  const n = slice.length;
  if (n < 5) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += slice[i].close; sumXY += i * slice[i].close; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── Session check ──
function getSessionId(isoTime: string): string {
  const hour = new Date(isoTime).getUTCHours();
  if (hour >= 0 && hour < 7) return "ASIA";
  if (hour >= 7 && hour < 12) return "LONDON";
  if (hour >= 12 && hour < 17) return "NEW_YORK";
  if (hour >= 17 && hour < 21) return "NY_CLOSE";
  return "ASIA";
}

function matchesSession(isoTime: string, session: typeof SESSIONS[number]): boolean {
  if (!session.hours) return true; // ALL
  const hour = new Date(isoTime).getUTCHours();
  return hour >= session.hours[0] && hour < session.hours[1];
}

// ── Pip calculation ──
function computePips(entry: number, exit: number, dir: "long" | "short", isJPY: boolean): number {
  const raw = dir === "long" ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

// ── Result interface ──
interface LiveProfileResult {
  predator: number;
  prey: number;
  gates: string;
  slPips: number;
  tpRatio: number | "flip"; // R:R or "flip" for signal-flip exit
  session: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalPips: number;
  netProfit: number;
  maxDrawdown: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  equityCurve: Array<{ time: string; equity: number }> | null;
}

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

    console.log(`[LIVE-BT] Fetching ${candleCount} M30 candles for 28 pairs (${environment})`);

    // ── STEP 1: Fetch all 28 pairs in parallel (batched to avoid overwhelming) ──
    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));
    const BATCH_SIZE = 7;
    const pairCandles: Record<string, Candle[]> = {};

    for (let b = 0; b < availableCrosses.length; b += BATCH_SIZE) {
      const batch = availableCrosses.slice(b, b + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async cross => {
          const candles = await fetchCandles(cross.instrument, candleCount, environment, apiToken);
          return { instrument: cross.instrument, candles };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.candles.length > 0) {
          pairCandles[r.value.instrument] = r.value.candles;
        }
      }
    }

    console.log(`[LIVE-BT] Fetched ${Object.keys(pairCandles).length} pairs, building rank snapshots...`);

    // ── STEP 2: Build unified timeline & rank snapshots ──
    const allTimestamps = new Set<string>();
    for (const candles of Object.values(pairCandles)) {
      for (const c of candles) allTimestamps.add(c.time);
    }
    const sortedTimes = [...allTimestamps].sort();

    if (sortedTimes.length < 100) {
      return new Response(JSON.stringify({ error: "Insufficient data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build time-indexed lookups
    const pairTimeIndex: Record<string, Record<string, number>> = {}; // instrument -> time -> candle array index
    for (const [inst, candles] of Object.entries(pairCandles)) {
      pairTimeIndex[inst] = {};
      for (let i = 0; i < candles.length; i++) {
        pairTimeIndex[inst][candles[i].time] = i;
      }
    }

    // Compute 20-period rolling returns for rank scoring
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

    // Build rank snapshots
    interface RankSnap {
      time: string;
      ranks: Record<string, number>;
      g2: Record<string, boolean>; // Atlas Walls pass per instrument+direction
      g3Slope: Record<string, number>; // LinReg slope per instrument
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

      // Pre-compute gate states for all relevant instruments at this timestamp
      const g2: Record<string, boolean> = {};
      const g3Slope: Record<string, number> = {};

      // We compute gates lazily per instrument — store time index for later
      rankSnaps.push({ time, ranks, g2, g3Slope });
    }

    console.log(`[LIVE-BT] ${rankSnaps.length} rank snapshots. Running ${PREDATOR_RANKS.length * PREY_RANKS.length * GATE_COMBOS.length * SL_PIPS.length * (TP_RATIOS.length + 1) * SESSIONS.length} combos...`);

    // ── STEP 3: Simulation engine ──
    // For each rank combo, walk through all snapshots once and collect trade signals.
    // Then test each SL/TP/session/gate combo against those signals.

    const allResults: LiveProfileResult[] = [];

    for (const predRank of PREDATOR_RANKS) {
      for (const preyRank of PREY_RANKS) {
        // Walk through snapshots and identify trade entries for this rank combo
        interface TradeSignal {
          snapIdx: number;
          time: string;
          instrument: string;
          direction: "long" | "short";
          entryPrice: number;
          isJPY: boolean;
          candleIdx: number; // index in pairCandles[instrument]
          sessionId: string;
          g2Pass: boolean;
          g3Pass: boolean;
        }

        const signals: TradeSignal[] = [];
        let prevInstrument: string | null = null;
        let prevDirection: "long" | "short" | null = null;

        for (let si = 0; si < rankSnaps.length; si++) {
          const snap = rankSnaps[si];
          const strongCur = ALL_CURRENCIES.find(c => snap.ranks[c] === predRank);
          const weakCur = ALL_CURRENCIES.find(c => snap.ranks[c] === preyRank);
          if (!strongCur || !weakCur) continue;

          const directInst = `${strongCur}_${weakCur}`;
          const inverseInst = `${weakCur}_${strongCur}`;
          let instrument: string | null = null;
          let direction: "long" | "short" = "long";

          const directIdx = pairTimeIndex[directInst]?.[snap.time];
          const inverseIdx = pairTimeIndex[inverseInst]?.[snap.time];

          if (directIdx !== undefined) {
            instrument = directInst;
            direction = "long";
          } else if (inverseIdx !== undefined) {
            instrument = inverseInst;
            direction = "short";
          }

          if (!instrument) continue;

          // Only create a new signal when instrument or direction changes (signal flip)
          if (instrument !== prevInstrument || direction !== prevDirection) {
            const candleIdx = pairTimeIndex[instrument][snap.time];
            const candles = pairCandles[instrument];
            const entryPrice = candles[candleIdx].close;
            const isJPY = instrument.includes("JPY");

            // Compute gates
            const g2Pass = checkAtlasWalls(candles, candleIdx, direction);
            const slope = computeLinRegSlope(candles, candleIdx);
            const g3Pass = direction === "long" ? slope > 0 : slope < 0;

            signals.push({
              snapIdx: si,
              time: snap.time,
              instrument,
              direction,
              entryPrice,
              isJPY,
              candleIdx,
              sessionId: getSessionId(snap.time),
              g2Pass,
              g3Pass,
            });

            prevInstrument = instrument;
            prevDirection = direction;
          }
        }

        // Now simulate each gate × session × SL × TP combo using these signals
        const exitModes: Array<{ tpRatio: number | "flip"; slPips: number }> = [];
        for (const sl of SL_PIPS) {
          for (const tp of TP_RATIOS) {
            exitModes.push({ tpRatio: tp, slPips: sl });
          }
          exitModes.push({ tpRatio: "flip", slPips: sl }); // signal-flip exit
        }

        for (const gate of GATE_COMBOS) {
          for (const session of SESSIONS) {
            for (const exit of exitModes) {
              // Filter signals by gate requirements and session
              const filteredSignals = signals.filter(sig => {
                // Gate filter
                if (gate.g1 && (predRank > 3 || preyRank < 6)) return false; // g1 = rank extremity
                if (gate.g2 && !sig.g2Pass) return false;
                if (gate.g3 && !sig.g3Pass) return false;
                // Session filter
                if (session.hours && !matchesSession(sig.time, session)) return false;
                return true;
              });

              if (filteredSignals.length < 3) continue;

              // Simulate trades
              let equity = 1000;
              let peak = 1000;
              let maxDD = 0;
              let wins = 0, losses = 0, totalPips = 0;
              let grossProfit = 0, grossLoss = 0;

              for (let fi = 0; fi < filteredSignals.length; fi++) {
                const sig = filteredSignals[fi];
                const candles = pairCandles[sig.instrument];
                const isJPY = sig.isJPY;
                const pipMul = isJPY ? 100 : 10000;
                const pipVal = isJPY ? 0.01 : 0.0001;
                const slPrice = exit.slPips / pipMul;
                const tpPrice = exit.tpRatio === "flip"
                  ? Infinity
                  : (exit.slPips * exit.tpRatio) / pipMul;

                // Find exit: walk forward from entry candle
                const entryIdx = sig.candleIdx;
                const nextSignalIdx = fi + 1 < filteredSignals.length
                  ? filteredSignals[fi + 1].candleIdx
                  : candles.length;
                // For signal-flip exit on different instruments, use time-based cutoff
                const nextSignalTime = fi + 1 < filteredSignals.length
                  ? filteredSignals[fi + 1].time
                  : null;

                let exitPrice = sig.entryPrice; // fallback
                let exited = false;

                for (let ci = entryIdx + 1; ci < candles.length; ci++) {
                  const bar = candles[ci];

                  // Check signal-flip exit (by time)
                  if (exit.tpRatio === "flip" && nextSignalTime && bar.time >= nextSignalTime) {
                    exitPrice = bar.open;
                    exited = true;
                    break;
                  }

                  // Check SL hit
                  if (sig.direction === "long") {
                    if (bar.low <= sig.entryPrice - slPrice) {
                      exitPrice = sig.entryPrice - slPrice;
                      exited = true;
                      break;
                    }
                    // Check TP hit
                    if (exit.tpRatio !== "flip" && bar.high >= sig.entryPrice + tpPrice) {
                      exitPrice = sig.entryPrice + tpPrice;
                      exited = true;
                      break;
                    }
                  } else {
                    if (bar.high >= sig.entryPrice + slPrice) {
                      exitPrice = sig.entryPrice + slPrice;
                      exited = true;
                      break;
                    }
                    if (exit.tpRatio !== "flip" && bar.low <= sig.entryPrice - tpPrice) {
                      exitPrice = sig.entryPrice - tpPrice;
                      exited = true;
                      break;
                    }
                  }

                  // For signal-flip without nextSignalTime, exit at same-instrument boundary
                  if (exit.tpRatio === "flip" && ci >= nextSignalIdx) {
                    exitPrice = bar.open;
                    exited = true;
                    break;
                  }
                }

                if (!exited) {
                  // Close at last available candle
                  exitPrice = candles[candles.length - 1].close;
                }

                const tradePips = computePips(sig.entryPrice, exitPrice, sig.direction, isJPY);

                // 5% Risk Dynamic Sizing
                const riskAmt = equity * 0.05;
                const dynUnits = exit.slPips > 0 ? riskAmt / (exit.slPips * pipVal) : 2000;
                const equityChange = tradePips * (dynUnits * pipVal);
                equity += equityChange;

                totalPips += tradePips;
                if (tradePips > 0) { wins++; grossProfit += tradePips; }
                else { losses++; grossLoss += Math.abs(tradePips); }

                if (equity > peak) peak = equity;
                const dd = ((equity - peak) / peak) * 100;
                if (dd < maxDD) maxDD = dd;
              }

              const trades = wins + losses;
              if (trades < 3) continue;

              const wr = (wins / trades) * 100;
              const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
              const netProfit = equity - 1000;

              allResults.push({
                predator: predRank,
                prey: preyRank,
                gates: gate.label,
                slPips: exit.slPips,
                tpRatio: exit.tpRatio,
                session: session.id,
                trades,
                wins,
                losses,
                winRate: Math.round(wr * 10) / 10,
                profitFactor: Math.round(pf * 100) / 100,
                totalPips: Math.round(totalPips * 10) / 10,
                netProfit: Math.round(netProfit * 100) / 100,
                maxDrawdown: Math.round(maxDD * 10) / 10,
                expectancy: Math.round((totalPips / trades) * 100) / 100,
                avgWin: wins > 0 ? Math.round((grossProfit / wins) * 10) / 10 : 0,
                avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 10) / 10 : 0,
                equityCurve: null, // populated for top N only
              });
            }
          }
        }
      }
    }

    // Sort by net profit descending
    allResults.sort((a, b) => b.netProfit - a.netProfit);
    const topResults = allResults.slice(0, topN);

    // Rebuild equity curves for top 10
    for (let ri = 0; ri < Math.min(10, topResults.length); ri++) {
      const r = topResults[ri];
      // Re-simulate to get equity curve
      const curve: Array<{ time: string; equity: number }> = [];
      let equity = 1000;

      // Find matching signals
      const filteredSignals: Array<{
        time: string; instrument: string; direction: "long" | "short";
        entryPrice: number; isJPY: boolean; candleIdx: number;
      }> = [];

      let prevInst: string | null = null;
      let prevDir: "long" | "short" | null = null;

      for (const snap of rankSnaps) {
        const strongCur = ALL_CURRENCIES.find(c => snap.ranks[c] === r.predator);
        const weakCur = ALL_CURRENCIES.find(c => snap.ranks[c] === r.prey);
        if (!strongCur || !weakCur) continue;

        const directInst = `${strongCur}_${weakCur}`;
        const inverseInst = `${weakCur}_${strongCur}`;
        let inst: string | null = null;
        let dir: "long" | "short" = "long";

        if (pairTimeIndex[directInst]?.[snap.time] !== undefined) { inst = directInst; dir = "long"; }
        else if (pairTimeIndex[inverseInst]?.[snap.time] !== undefined) { inst = inverseInst; dir = "short"; }

        if (!inst) continue;

        if (inst !== prevInst || dir !== prevDir) {
          const cidx = pairTimeIndex[inst][snap.time];
          const candles = pairCandles[inst];

          // Apply gate filter
          const gate = GATE_COMBOS.find(g => g.label === r.gates)!;
          const g2Pass = checkAtlasWalls(candles, cidx, dir);
          const slope = computeLinRegSlope(candles, cidx);
          const g3Pass = dir === "long" ? slope > 0 : slope < 0;

          if (gate.g2 && !g2Pass) continue;
          if (gate.g3 && !g3Pass) continue;

          // Session filter
          if (r.session !== "ALL") {
            const sess = SESSIONS.find(s => s.id === r.session);
            if (sess && !matchesSession(snap.time, sess)) continue;
          }

          filteredSignals.push({
            time: snap.time,
            instrument: inst,
            direction: dir,
            entryPrice: candles[cidx].close,
            isJPY: inst.includes("JPY"),
            candleIdx: cidx,
          });

          prevInst = inst;
          prevDir = dir;
        }
      }

      // Simulate with equity curve tracking
      for (let fi = 0; fi < filteredSignals.length; fi++) {
        const sig = filteredSignals[fi];
        const candles = pairCandles[sig.instrument];
        const isJPY = sig.isJPY;
        const pipMul = isJPY ? 100 : 10000;
        const pipVal = isJPY ? 0.01 : 0.0001;
        const slPrice = r.slPips / pipMul;
        const tpPrice = r.tpRatio === "flip" ? Infinity : (r.slPips * (r.tpRatio as number)) / pipMul;

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

          if (hit || (r.tpRatio === "flip" && fi + 1 < filteredSignals.length && bar.time >= filteredSignals[fi + 1].time)) {
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

      // Downsample curve
      const step = Math.max(1, Math.floor(curve.length / 300));
      topResults[ri].equityCurve = curve.filter((_, idx) => idx % step === 0);
    }

    const totalCombos = allResults.length;
    const profitable = allResults.filter(r => r.netProfit > 0).length;

    console.log(`[LIVE-BT] Complete. ${totalCombos} combos tested, ${profitable} profitable. Top net profit: $${topResults[0]?.netProfit ?? 0}`);

    return new Response(JSON.stringify({
      success: true,
      version: "1.0",
      timestamp: new Date().toISOString(),
      environment,
      candlesPerPair: Object.values(pairCandles)[0]?.length ?? 0,
      pairsLoaded: Object.keys(pairCandles).length,
      totalSnapshots: rankSnaps.length,
      totalCombos,
      profitableCombos: profitable,
      topResults,
      dateRange: {
        start: sortedTimes[0],
        end: sortedTimes[sortedTimes.length - 1],
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[LIVE-BT] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
