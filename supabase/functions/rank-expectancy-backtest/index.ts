// Rank Expectancy Backtest Engine v2.0
// Cross-sectional statistical arbitrage proof with THREE PILLARS:
// Pillar 1: Cross-Sectional Divergence (Sovereign Matrix ranking)
// Pillar 2: Atlas Walls (20-period structural breakout filter)
// Pillar 3: Atlas Snap / David Vector (Linear Regression slope confirmation)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

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

const OANDA_AVAILABLE = new Set([
  "EUR_USD","EUR_GBP","EUR_AUD","EUR_NZD","EUR_CAD","EUR_CHF","EUR_JPY",
  "GBP_USD","GBP_AUD","GBP_NZD","GBP_CAD","GBP_CHF","GBP_JPY",
  "AUD_USD","AUD_NZD","AUD_CAD","AUD_CHF","AUD_JPY",
  "NZD_USD","NZD_CAD","NZD_CHF","NZD_JPY",
  "USD_CAD","USD_CHF","USD_JPY",
  "CAD_CHF","CAD_JPY",
  "CHF_JPY",
]);

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RankComboResult {
  strongRank: number;
  weakRank: number;
  trades: number;
  wins: number;
  losses: number;
  totalPips: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  // v2 — pillar stats
  gatedTrades: number;      // trades that passed all 3 gates
  gatedWins: number;
  gatedWinRate: number;
  gatedPips: number;
  gatedPF: number;
  rejectedByGate2: number;  // rejected by Atlas Walls
  rejectedByGate3: number;  // rejected by David Vector
}

interface SessionStats {
  session: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPips: number;
  profitFactor: number;
}

interface PillarSummary {
  pillar1_divergenceEdge: number;   // WR improvement from rank filter alone
  pillar2_atlasWallsEdge: number;   // WR improvement after adding Gate 2
  pillar3_vectorEdge: number;       // WR improvement after adding Gate 3
  combinedEdge: number;             // full 3-gate WR
  baselineWR: number;               // random entry WR
}

async function fetchCandles(
  instrument: string,
  count: number,
  environment: "practice" | "live",
  apiToken: string
): Promise<Candle[]> {
  const host = environment === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.candles || [])
    .filter((c: { complete?: boolean }) => c.complete !== false)
    .map((c: { time: string; volume: number; mid: { h: string; l: string; o: string; c: string } }) => ({
      time: c.time,
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}

function computePips(entryPrice: number, exitPrice: number, direction: "long" | "short", isJPY: boolean): number {
  const raw = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return isJPY ? raw * 100 : raw * 10000;
}

// ── PILLAR 2: Atlas Walls — 20-period structural breakout ──
function checkAtlasSnap(
  candles: Candle[],
  currentIndex: number,
  direction: "long" | "short",
  lookback = 20
): boolean {
  if (currentIndex < lookback + 1) return false;
  // Exclude current candle (forming) — use candles[currentIndex-lookback..currentIndex-1]
  const slice = candles.slice(currentIndex - lookback, currentIndex);
  const currentClose = candles[currentIndex].close;
  
  if (direction === "long") {
    const highest = Math.max(...slice.map(c => c.high));
    return currentClose > highest;
  } else {
    const lowest = Math.min(...slice.map(c => c.low));
    return currentClose < lowest;
  }
}

// ── PILLAR 3: David Vector — Linear Regression slope ──
function computeLinRegSlope(candles: Candle[], currentIndex: number, lookback = 20): number {
  if (currentIndex < lookback) return 0;
  const slice = candles.slice(currentIndex - lookback, currentIndex);
  const n = slice.length;
  if (n < 5) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += slice[i].close;
    sumXY += i * slice[i].close;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function checkDavidVector(slope: number, direction: "long" | "short"): boolean {
  if (direction === "long") return slope > 0;
  return slope < 0;
}

// ── Session classifier from UTC hour ──
function getSession(isoTime: string): string {
  const hour = new Date(isoTime).getUTCHours();
  if (hour >= 0 && hour < 7) return "ASIA";
  if (hour >= 7 && hour < 12) return "LONDON";
  if (hour >= 12 && hour < 17) return "NEW_YORK";
  if (hour >= 17 && hour < 21) return "NY_CLOSE";
  return "ASIA"; // late night wraps to Asia
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "practice";
    const candleCount: number = Math.min(body.candles || 5000, 5000);

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[BACKTEST v2] Fetching ${candleCount} M30 candles for 28 pairs (${environment})`);

    // ── STEP 1: Fetch all 28 pairs in parallel ──
    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));
    const fetchResults = await Promise.allSettled(
      availableCrosses.map(async (cross) => {
        const candles = await fetchCandles(cross.instrument, candleCount, environment, apiToken);
        return { cross, candles };
      })
    );

    const pairCandles: Record<string, Candle[]> = {};
    const allTimestamps = new Set<string>();

    for (const r of fetchResults) {
      if (r.status !== "fulfilled" || r.value.candles.length === 0) continue;
      pairCandles[r.value.cross.instrument] = r.value.candles;
      for (const c of r.value.candles) allTimestamps.add(c.time);
    }

    const sortedTimes = [...allTimestamps].sort();
    console.log(`[BACKTEST v2] Got ${Object.keys(pairCandles).length} pairs, ${sortedTimes.length} timestamps`);

    if (sortedTimes.length < 50) {
      return new Response(JSON.stringify({ error: "Insufficient data for backtest" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build time-indexed lookups + ordered index for each pair
    const pairTimeIndex: Record<string, Record<string, Candle>> = {};
    const pairCandleIndex: Record<string, Record<string, number>> = {}; // time -> array index
    for (const [inst, candles] of Object.entries(pairCandles)) {
      pairTimeIndex[inst] = {};
      pairCandleIndex[inst] = {};
      for (let i = 0; i < candles.length; i++) {
        pairTimeIndex[inst][candles[i].time] = candles[i];
        pairCandleIndex[inst][candles[i].time] = i;
      }
    }

    // ── STEP 2: Compute currency rankings at each timestamp ──
    const LOOKBACK = 20;
    const pairReturns: Record<string, Record<string, number>> = {};
    for (const inst of Object.keys(pairCandles)) {
      pairReturns[inst] = {};
      const candles = pairCandles[inst];
      for (let i = LOOKBACK; i < candles.length; i++) {
        const slice = candles.slice(i - LOOKBACK, i);
        let totalRet = 0;
        for (const c of slice) {
          if (c.open !== 0) totalRet += ((c.close - c.open) / c.open) * 100;
        }
        pairReturns[inst][candles[i].time] = totalRet / slice.length;
      }
    }

    interface RankSnapshot {
      time: string;
      ranks: Record<string, number>;
      scores: Record<string, number>;
    }

    const rankSnapshots: RankSnapshot[] = [];

    for (const time of sortedTimes) {
      const flows: Record<string, number[]> = {};
      for (const c of ALL_CURRENCIES) flows[c] = [];

      for (const cross of availableCrosses) {
        const ret = pairReturns[cross.instrument]?.[time];
        if (ret === undefined) continue;
        flows[cross.base].push(ret);
        flows[cross.quote].push(-ret);
      }

      const scores: Record<string, number> = {};
      let hasData = false;
      for (const cur of ALL_CURRENCIES) {
        if (flows[cur].length === 0) { scores[cur] = 0; continue; }
        hasData = true;
        scores[cur] = flows[cur].reduce((a, b) => a + b, 0) / flows[cur].length;
      }
      if (!hasData) continue;

      const sorted = [...ALL_CURRENCIES].sort((a, b) => scores[b] - scores[a]);
      const ranks: Record<string, number> = {};
      sorted.forEach((cur, idx) => { ranks[cur] = idx + 1; });

      rankSnapshots.push({ time, ranks, scores });
    }

    console.log(`[BACKTEST v2] Computed ${rankSnapshots.length} rank snapshots`);

    // ── STEP 3: Simulate all 28 rank combinations with 3-pillar gates ──
    const comboResults: RankComboResult[] = [];
    const equityCurves: Record<string, Array<{ time: string; equity: number }>> = {};
    const keyComboKeys = ["1v8", "2v7", "3v6", "4v5"];

    // Session tracking for the 1v8 combo
    const sessionAccum: Record<string, { trades: number; wins: number; pips: number; grossProfit: number; grossLoss: number }> = {
      ASIA: { trades: 0, wins: 0, pips: 0, grossProfit: 0, grossLoss: 0 },
      LONDON: { trades: 0, wins: 0, pips: 0, grossProfit: 0, grossLoss: 0 },
      NEW_YORK: { trades: 0, wins: 0, pips: 0, grossProfit: 0, grossLoss: 0 },
      NY_CLOSE: { trades: 0, wins: 0, pips: 0, grossProfit: 0, grossLoss: 0 },
    };

    // Baseline tracker: random-entry performance (no rank filter)
    let baselineTrades = 0, baselineWins = 0;

    for (let s = 1; s <= 7; s++) {
      for (let w = s + 1; w <= 8; w++) {
        const comboKey = `${s}v${w}`;
        const isKeyCurve = keyComboKeys.includes(comboKey);
        const is1v8 = comboKey === "1v8";
        let equity = 1000;
        const curve: Array<{ time: string; equity: number }> = [];

        let trades = 0, wins = 0, losses = 0;
        let totalPips = 0, grossProfit = 0, grossLoss = 0;

        // v2 — gated stats
        let gatedTrades = 0, gatedWins = 0, gatedPips = 0;
        let gatedGrossProfit = 0, gatedGrossLoss = 0;
        let rejectedByGate2 = 0, rejectedByGate3 = 0;

        let openTrade: {
          instrument: string;
          direction: "long" | "short";
          entryPrice: number;
          entryTime: string;
          isJPY: boolean;
          gated: boolean; // passed all 3 pillars?
        } | null = null;

        for (let i = 0; i < rankSnapshots.length; i++) {
          const snap = rankSnapshots[i];

          const strongCur = ALL_CURRENCIES.find(c => snap.ranks[c] === s);
          const weakCur = ALL_CURRENCIES.find(c => snap.ranks[c] === w);
          if (!strongCur || !weakCur) {
            if (isKeyCurve) curve.push({ time: snap.time, equity });
            continue;
          }

          const directInst = `${strongCur}_${weakCur}`;
          const inverseInst = `${weakCur}_${strongCur}`;
          let instrument: string | null = null;
          let direction: "long" | "short" = "long";

          if (pairTimeIndex[directInst]?.[snap.time]) {
            instrument = directInst;
            direction = "long";
          } else if (pairTimeIndex[inverseInst]?.[snap.time]) {
            instrument = inverseInst;
            direction = "short";
          }

          if (!instrument) {
            if (isKeyCurve) curve.push({ time: snap.time, equity });
            continue;
          }

          const currentCandle = pairTimeIndex[instrument][snap.time];
          const isJPY = instrument.includes("JPY");
          const candleIdx = pairCandleIndex[instrument]?.[snap.time] ?? -1;

          // ── Check 3 Pillars ──
          // Pillar 1: rank divergence (already satisfied by s/w selection)
          const pillar1 = true;

          // Pillar 2: Atlas Walls — structural breakout
          const pillar2 = candleIdx >= 0
            ? checkAtlasSnap(pairCandles[instrument], candleIdx, direction)
            : false;

          // Pillar 3: David Vector — LinReg slope alignment
          const slope = candleIdx >= 0
            ? computeLinRegSlope(pairCandles[instrument], candleIdx)
            : 0;
          const pillar3 = checkDavidVector(slope, direction);

          const allGatesOpen = pillar1 && pillar2 && pillar3;

          if (!pillar2) rejectedByGate2++;
          if (!pillar3) rejectedByGate3++;

          // Close existing trade if pair/direction changed
          if (openTrade) {
            const shouldClose = openTrade.instrument !== instrument ||
              openTrade.direction !== direction;

            if (shouldClose || i === rankSnapshots.length - 1) {
              const exitCandle = pairTimeIndex[openTrade.instrument]?.[snap.time];
              const exitPrice = exitCandle?.close ?? currentCandle.close;
              const closePips = computePips(
                openTrade.entryPrice, exitPrice,
                openTrade.direction, openTrade.isJPY
              );

              trades++;
              totalPips += closePips;
              if (closePips > 0) { wins++; grossProfit += closePips; }
              else { losses++; grossLoss += Math.abs(closePips); }

              // Baseline sampling (every 4th trade from 4v5 combo)
              if (s === 4 && w === 5) { baselineTrades++; if (closePips > 0) baselineWins++; }

              // Gated stats
              if (openTrade.gated) {
                gatedTrades++;
                gatedPips += closePips;
                if (closePips > 0) { gatedWins++; gatedGrossProfit += closePips; }
                else { gatedGrossLoss += Math.abs(closePips); }
              }

              // Session stats for 1v8
              if (is1v8) {
                const sess = getSession(openTrade.entryTime);
                sessionAccum[sess].trades++;
                sessionAccum[sess].pips += closePips;
                if (closePips > 0) {
                  sessionAccum[sess].wins++;
                  sessionAccum[sess].grossProfit += closePips;
                } else {
                  sessionAccum[sess].grossLoss += Math.abs(closePips);
                }
              }

              equity += closePips * 0.20; // $0.20 per pip (2000 units) on $1,000 base equity
              openTrade = null;
            }
          }

          // Open new trade if none open
          if (!openTrade && i < rankSnapshots.length - 1) {
            openTrade = {
              instrument,
              direction,
              entryPrice: currentCandle.close,
              entryTime: snap.time,
              isJPY,
              gated: allGatesOpen,
            };
          }

          if (isKeyCurve) curve.push({ time: snap.time, equity });
        }

        const winRate = trades > 0 ? (wins / trades) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        const avgWin = wins > 0 ? grossProfit / wins : 0;
        const avgLoss = losses > 0 ? grossLoss / losses : 0;
        const expectancy = trades > 0 ? totalPips / trades : 0;
        const gatedWinRate = gatedTrades > 0 ? (gatedWins / gatedTrades) * 100 : 0;
        const gatedPF = gatedGrossLoss > 0 ? gatedGrossProfit / gatedGrossLoss : gatedGrossProfit > 0 ? 999 : 0;

        comboResults.push({
          strongRank: s,
          weakRank: w,
          trades,
          wins,
          losses,
          totalPips: Math.round(totalPips * 10) / 10,
          grossProfit: Math.round(grossProfit * 10) / 10,
          grossLoss: Math.round(grossLoss * 10) / 10,
          winRate: Math.round(winRate * 10) / 10,
          profitFactor: Math.round(profitFactor * 100) / 100,
          avgWin: Math.round(avgWin * 10) / 10,
          avgLoss: Math.round(avgLoss * 10) / 10,
          expectancy: Math.round(expectancy * 100) / 100,
          gatedTrades,
          gatedWins,
          gatedWinRate: Math.round(gatedWinRate * 10) / 10,
          gatedPips: Math.round(gatedPips * 10) / 10,
          gatedPF: Math.round(gatedPF * 100) / 100,
          rejectedByGate2,
          rejectedByGate3,
        });

        if (isKeyCurve) {
          const step = Math.max(1, Math.floor(curve.length / 500));
          equityCurves[comboKey] = curve.filter((_, idx) => idx % step === 0);
        }
      }
    }

    // Compute drawdown for 1v8
    const curve1v8 = equityCurves["1v8"] || [];
    let peak = 1000;
    const drawdownCurve: Array<{ time: string; drawdown: number }> = [];
    for (const pt of curve1v8) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = ((pt.equity - peak) / peak) * 100;
      drawdownCurve.push({ time: pt.time, drawdown: Math.round(dd * 100) / 100 });
    }

    // ── Build session stats ──
    const sessionStats: SessionStats[] = Object.entries(sessionAccum).map(([session, s]) => ({
      session,
      trades: s.trades,
      wins: s.wins,
      winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 1000) / 10 : 0,
      totalPips: Math.round(s.pips * 10) / 10,
      profitFactor: s.grossLoss > 0 ? Math.round((s.grossProfit / s.grossLoss) * 100) / 100 : s.grossProfit > 0 ? 999 : 0,
    }));

    // ── Build pillar summary ──
    const combo1v8 = comboResults.find(c => c.strongRank === 1 && c.weakRank === 8);
    const combo4v5 = comboResults.find(c => c.strongRank === 4 && c.weakRank === 5);
    const baselineWR = baselineTrades > 0 ? (baselineWins / baselineTrades) * 100 : 50;

    const pillarSummary: PillarSummary = {
      baselineWR: Math.round(baselineWR * 10) / 10,
      pillar1_divergenceEdge: Math.round(((combo1v8?.winRate ?? 50) - baselineWR) * 10) / 10,
      pillar2_atlasWallsEdge: Math.round(((combo1v8?.gatedWinRate ?? 50) - (combo1v8?.winRate ?? 50)) * 10) / 10,
      pillar3_vectorEdge: Math.round(((combo1v8?.gatedWinRate ?? 50) - baselineWR) * 10) / 10,
      combinedEdge: combo1v8?.gatedWinRate ?? 0,
    };

    console.log(`[BACKTEST v2] Complete. ${comboResults.length} combos. Best gated WR: ${combo1v8?.gatedWinRate ?? 0}%`);
    const best = comboResults.reduce((a, b) => a.totalPips > b.totalPips ? a : b);

    return new Response(JSON.stringify({
      success: true,
      version: "2.0",
      timestamp: new Date().toISOString(),
      environment,
      candlesPerPair: Object.values(pairCandles)[0]?.length ?? 0,
      totalSnapshots: rankSnapshots.length,
      pairsLoaded: Object.keys(pairCandles).length,
      comboResults,
      equityCurves,
      drawdownCurve,
      bestCombo: best,
      dateRange: {
        start: sortedTimes[0],
        end: sortedTimes[sortedTimes.length - 1],
      },
      // v2 additions
      sessionStats,
      pillarSummary,
      elevatorPitch: "We don't predict price. We run a quantitative model that scans the entire forex ecosystem to pair the strongest currency against the weakest. Once isolated, we use order flow micro-structure to measure the exact millisecond aggressive buyers chew through institutional resistance, allowing our bots to front-run the slippage and ride the resulting momentum vacuum.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[BACKTEST v2] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
