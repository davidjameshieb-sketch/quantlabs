// Rank Expectancy Backtest Engine
// Cross-sectional statistical arbitrage proof: tests ALL 28 rank combinations
// across 5000 M30 candles to prove #1 vs #8 dominance

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

// All 28 unique cross-rate pairs
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

    console.log(`[BACKTEST] Fetching ${candleCount} M30 candles for 28 pairs (${environment})`);

    // ── STEP 1: Fetch all 28 pairs in parallel ──
    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));
    const fetchResults = await Promise.allSettled(
      availableCrosses.map(async (cross) => {
        const candles = await fetchCandles(cross.instrument, candleCount, environment, apiToken);
        return { cross, candles };
      })
    );

    // Build time-aligned data: Map<timestamp, Map<instrument, close>>
    const pairCandles: Record<string, Candle[]> = {};
    const allTimestamps = new Set<string>();

    for (const r of fetchResults) {
      if (r.status !== "fulfilled" || r.value.candles.length === 0) continue;
      pairCandles[r.value.cross.instrument] = r.value.candles;
      for (const c of r.value.candles) allTimestamps.add(c.time);
    }

    const sortedTimes = [...allTimestamps].sort();
    console.log(`[BACKTEST] Got ${Object.keys(pairCandles).length} pairs, ${sortedTimes.length} timestamps`);

    if (sortedTimes.length < 50) {
      return new Response(JSON.stringify({ error: "Insufficient data for backtest" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build time-indexed lookups
    const pairTimeIndex: Record<string, Record<string, Candle>> = {};
    for (const [inst, candles] of Object.entries(pairCandles)) {
      pairTimeIndex[inst] = {};
      for (const c of candles) pairTimeIndex[inst][c.time] = c;
    }

    // ── STEP 2: At each timestamp, compute currency rankings ──
    // We use a rolling 20-candle % return like sovereign-matrix
    const LOOKBACK = 20;

    // Pre-compute per-pair returns at each timestamp
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

    // ── STEP 3: Build rankings at each timestamp ──
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

    console.log(`[BACKTEST] Computed ${rankSnapshots.length} rank snapshots`);

    // ── STEP 4: Simulate all 28 rank combinations ──
    // Rank combo (S, W) means: go long the currency ranked S, short the currency ranked W
    // S < W always (e.g., 1v8 means long Rank1, short Rank8)

    const comboResults: RankComboResult[] = [];
    // Track equity curves for key combos
    const equityCurves: Record<string, Array<{ time: string; equity: number }>> = {};
    const keyComboKeys = ["1v8", "2v7", "3v6", "4v5"];

    for (let s = 1; s <= 7; s++) {
      for (let w = s + 1; w <= 8; w++) {
        const comboKey = `${s}v${w}`;
        const isKeyCurve = keyComboKeys.includes(comboKey);
        let equity = 1000;
        const curve: Array<{ time: string; equity: number }> = [];

        let trades = 0, wins = 0, losses = 0;
        let totalPips = 0, grossProfit = 0, grossLoss = 0;

        // Track open position
        let openTrade: {
          instrument: string;
          direction: "long" | "short";
          entryPrice: number;
          entryTime: string;
          isJPY: boolean;
        } | null = null;

        for (let i = 0; i < rankSnapshots.length; i++) {
          const snap = rankSnapshots[i];

          // Find currencies at ranks s and w
          const strongCur = ALL_CURRENCIES.find(c => snap.ranks[c] === s);
          const weakCur = ALL_CURRENCIES.find(c => snap.ranks[c] === w);
          if (!strongCur || !weakCur) {
            if (isKeyCurve) curve.push({ time: snap.time, equity });
            continue;
          }

          // Find the OANDA instrument for this pair
          const directInst = `${strongCur}_${weakCur}`;
          const inverseInst = `${weakCur}_${strongCur}`;
          let instrument: string | null = null;
          let direction: "long" | "short" = "long";

          if (pairTimeIndex[directInst]?.[snap.time]) {
            instrument = directInst;
            direction = "long"; // long the strong currency (base)
          } else if (pairTimeIndex[inverseInst]?.[snap.time]) {
            instrument = inverseInst;
            direction = "short"; // short the instrument (strong is quote, we want to buy it)
          }

          if (!instrument) {
            if (isKeyCurve) curve.push({ time: snap.time, equity });
            continue;
          }

          const currentCandle = pairTimeIndex[instrument][snap.time];
          const isJPY = instrument.includes("JPY");

          // Check if we have an open trade that needs closing
          if (openTrade) {
            // Close if: different pair now, or ranks shifted
            const shouldClose = openTrade.instrument !== instrument ||
              openTrade.direction !== direction;

            if (shouldClose || i === rankSnapshots.length - 1) {
              // Close at current candle close
              const exitPrice = currentCandle.close;
              // Get the entry candle's instrument price for proper close
              const closePips = computePips(
                openTrade.entryPrice,
                pairTimeIndex[openTrade.instrument]?.[snap.time]?.close ?? exitPrice,
                openTrade.direction,
                openTrade.isJPY
              );

              trades++;
              totalPips += closePips;
              if (closePips > 0) { wins++; grossProfit += closePips; }
              else { losses++; grossLoss += Math.abs(closePips); }

              // Update equity: assume 1% risk per trade, PnL proportional to pips
              // Simple: each pip = $0.10 on micro lot for $1000 account
              equity += closePips * 0.10;
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
            };
          }

          if (isKeyCurve) curve.push({ time: snap.time, equity });
        }

        const winRate = trades > 0 ? (wins / trades) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        const avgWin = wins > 0 ? grossProfit / wins : 0;
        const avgLoss = losses > 0 ? grossLoss / losses : 0;
        const expectancy = trades > 0 ? totalPips / trades : 0;

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
        });

        if (isKeyCurve) {
          // Downsample curve to max 500 points for transfer
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

    console.log(`[BACKTEST] Complete. ${comboResults.length} rank combinations simulated.`);
    const best = comboResults.reduce((a, b) => a.totalPips > b.totalPips ? a : b);
    console.log(`[BACKTEST] Best combo: ${best.strongRank}v${best.weakRank} — ${best.totalPips} pips, WR ${best.winRate}%`);

    return new Response(JSON.stringify({
      success: true,
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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[BACKTEST] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
