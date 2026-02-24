// Atlas Snap Hedge Matrix — Historical Backtest Engine
// Backtests the 3-leg rank-divergence hedge strategy across real OANDA M30 candles
// Computes rolling currency rankings at every bar, simulates G2+G3 gated entries

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];

// All 28 crosses
const ALL_PAIRS: string[] = [];
for (let i = 0; i < CURRENCIES.length; i++) {
  for (let j = i + 1; j < CURRENCIES.length; j++) {
    ALL_PAIRS.push(`${CURRENCIES[i]}_${CURRENCIES[j]}`);
  }
}

// OANDA instrument availability mapping
const OANDA_INSTRUMENTS = new Set([
  'EUR_USD','EUR_GBP','EUR_AUD','EUR_NZD','EUR_CAD','EUR_CHF','EUR_JPY',
  'GBP_USD','GBP_AUD','GBP_NZD','GBP_CAD','GBP_CHF','GBP_JPY',
  'AUD_USD','AUD_NZD','AUD_CAD','AUD_CHF','AUD_JPY',
  'NZD_USD','NZD_CAD','NZD_CHF','NZD_JPY',
  'USD_CAD','USD_CHF','USD_JPY',
  'CAD_CHF','CAD_JPY','CHF_JPY',
]);

const HEDGE_LEGS = [
  { id: 'leg1', strongRank: 1, weakRank: 8, weight: 0.50, label: '#1 vs #8', slPips: 25, tpRatio: 2.0 },
  { id: 'leg2', strongRank: 2, weakRank: 7, weight: 0.30, label: '#2 vs #7', slPips: 25, tpRatio: 2.0 },
  { id: 'leg3', strongRank: 3, weakRank: 6, weight: 0.20, label: '#3 vs #6', slPips: 30, tpRatio: 1.8 },
];

const FRICTION_PIPS = 1.5;
const STARTING_EQUITY = 1000;
const RISK_FRACTION_1PCT = 0.01; // Institutional
const RISK_FRACTION_5PCT = 0.05; // Aggressive

interface Bar { time: string; open: number; high: number; low: number; close: number; volume: number; }

// ── Fetch candles from OANDA ──
async function fetchCandles(instrument: string, count: number, apiToken: string, host: string): Promise<Bar[]> {
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.candles || [])
      .filter((c: any) => c.complete !== false)
      .map((c: any) => ({
        time: c.time, volume: c.volume,
        open: parseFloat(c.mid.o), high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l), close: parseFloat(c.mid.c),
      }));
  } catch { return []; }
}

function pipValue(pair: string): number { return pair.includes('JPY') ? 0.01 : 0.0001; }

function findInstrument(cur1: string, cur2: string): { instrument: string; inverted: boolean } | null {
  const d = `${cur1}_${cur2}`;
  if (OANDA_INSTRUMENTS.has(d)) return { instrument: d, inverted: false };
  const inv = `${cur2}_${cur1}`;
  if (OANDA_INSTRUMENTS.has(inv)) return { instrument: inv, inverted: true };
  return null;
}

// ── SOB-based currency ranking (Structural Order Book) ──
function computeRankings(
  pairBars: Map<string, Bar[]>,
  barIndex: number,
  lookback: number
): string[] {
  const scores: Record<string, number> = {};
  for (const c of CURRENCIES) scores[c] = 0;

  for (const [pair, bars] of pairBars) {
    if (barIndex < lookback || barIndex >= bars.length) continue;
    const cur1 = pair.split('_')[0];
    const cur2 = pair.split('_')[1];

    const slice = bars.slice(barIndex - lookback, barIndex);
    const currentClose = bars[barIndex].close;

    // Compute Veff (Volume Efficiency) for each bar
    const veffs = slice.map(b => {
      const range = b.high - b.low;
      return range === 0 ? 0 : b.volume / range;
    });
    const avgVeff = veffs.reduce((a, b) => a + b, 0) / veffs.length;
    const stdVeff = Math.sqrt(veffs.reduce((a, b) => a + (b - avgVeff) ** 2, 0) / veffs.length) || 1;
    const threshold = avgVeff + 1.5 * stdVeff;

    // Count structural blocks broken
    let sobScore = 0;
    for (let i = 0; i < slice.length; i++) {
      if (veffs[i] > threshold) {
        if (currentClose > slice[i].high) sobScore += 1;
        else if (currentClose < slice[i].low) sobScore -= 1;
      }
    }

    scores[cur1] += sobScore;
    scores[cur2] -= sobScore;
  }

  return CURRENCIES.slice().sort((a, b) => scores[b] - scores[a]);
}

// ── Gates ──
function atlasSnapGate(bars: Bar[], idx: number, direction: 'long' | 'short', lookback = 20): boolean {
  if (idx < lookback + 1) return false;
  const slice = bars.slice(idx - lookback, idx);
  const highest = Math.max(...slice.map(b => b.high));
  const lowest = Math.min(...slice.map(b => b.low));
  const close = bars[idx].close;
  return direction === 'long' ? close > highest : close < lowest;
}

function davidVectorGate(bars: Bar[], idx: number, direction: 'long' | 'short'): boolean {
  const start = Math.max(0, idx - 19);
  const closes = bars.slice(start, idx + 1).map(b => b.close);
  const n = closes.length;
  if (n < 2) return false;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) { sumX += i; sumY += closes[i]; sumXY += i * closes[i]; sumX2 += i * i; }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return direction === 'long' ? slope > 0 : slope < 0;
}

function computeATR(bars: Bar[], idx: number, period = 14): number {
  const start = Math.max(0, idx - period + 1);
  const slice = bars.slice(start, idx + 1);
  return slice.reduce((s, b) => s + (b.high - b.low), 0) / slice.length;
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const candleCount = Math.min(body.candles || 5000, 15000);
    const environment = body.environment || 'live';

    const host = environment === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';
    const apiToken = environment === 'live'
      ? (Deno.env.get('OANDA_LIVE_API_TOKEN') || Deno.env.get('OANDA_API_TOKEN')!)
      : Deno.env.get('OANDA_API_TOKEN')!;

    console.log(`[HEDGE-BT] Starting backtest: ${candleCount} candles, env=${environment}`);

    // ── Fetch all 28 pairs in batches of 7 ──
    const pairBars = new Map<string, Bar[]>();
    const pairList = [...OANDA_INSTRUMENTS];

    for (let batch = 0; batch < pairList.length; batch += 7) {
      const chunk = pairList.slice(batch, batch + 7);
      const results = await Promise.all(
        chunk.map(p => fetchCandles(p, candleCount, apiToken, host))
      );
      chunk.forEach((p, i) => {
        if (results[i].length > 100) pairBars.set(p, results[i]);
      });
      console.log(`[HEDGE-BT] Fetched batch ${batch / 7 + 1}: ${chunk.length} pairs (${pairBars.size} total loaded)`);
    }

    if (pairBars.size < 20) throw new Error(`Only ${pairBars.size} pairs loaded, need at least 20`);

    // Find common bar count (minimum across all pairs)
    const barCounts = [...pairBars.values()].map(b => b.length);
    const totalBars = Math.min(...barCounts);
    console.log(`[HEDGE-BT] Common bars: ${totalBars} across ${pairBars.size} pairs`);

    // ── Simulation state ──
    const LOOKBACK = 20;
    const startBar = LOOKBACK + 5; // need enough history

    interface OpenTrade {
      legId: string; instrument: string; direction: 'long' | 'short';
      entryPrice: number; slPrice: number; tpPrice: number; entryBar: number;
      units1pct: number; units5pct: number;
    }

    let equity1pct = STARTING_EQUITY;
    let equity5pct = STARTING_EQUITY;
    let peak1pct = STARTING_EQUITY;
    let peak5pct = STARTING_EQUITY;
    let maxDD1pct = 0;
    let maxDD5pct = 0;

    const trades: Array<{
      legId: string; pair: string; direction: string; entryBar: number; exitBar: number;
      entryPrice: number; exitPrice: number; pips: number; result: 'win' | 'loss';
      pnl1pct: number; pnl5pct: number;
    }> = [];
    const openTrades: OpenTrade[] = [];
    const equityCurve1pct: number[] = [];
    const equityCurve5pct: number[] = [];
    const legStats: Record<string, { wins: number; losses: number; totalPips: number }> = {
      leg1: { wins: 0, losses: 0, totalPips: 0 },
      leg2: { wins: 0, losses: 0, totalPips: 0 },
      leg3: { wins: 0, losses: 0, totalPips: 0 },
    };
    let cooldownBars: Record<string, number> = {};

    // ── Bar-by-bar simulation ──
    for (let bar = startBar; bar < totalBars; bar++) {
      // Check open trades for SL/TP hits
      for (let t = openTrades.length - 1; t >= 0; t--) {
        const trade = openTrades[t];
        const bars = pairBars.get(trade.instrument);
        if (!bars || bar >= bars.length) continue;

        const candle = bars[bar];
        const pv = pipValue(trade.instrument);
        let exitPrice: number | null = null;
        let hitType = '';

        if (trade.direction === 'long') {
          if (candle.low <= trade.slPrice) { exitPrice = trade.slPrice; hitType = 'SL'; }
          else if (candle.high >= trade.tpPrice) { exitPrice = trade.tpPrice; hitType = 'TP'; }
        } else {
          if (candle.high >= trade.slPrice) { exitPrice = trade.slPrice; hitType = 'SL'; }
          else if (candle.low <= trade.tpPrice) { exitPrice = trade.tpPrice; hitType = 'TP'; }
        }

        // Max hold time: 100 bars (~50h) — force close
        if (!exitPrice && bar - trade.entryBar > 100) {
          exitPrice = candle.close;
          hitType = 'TIME';
        }

        if (exitPrice !== null) {
          const rawPips = trade.direction === 'long'
            ? (exitPrice - trade.entryPrice) / pv
            : (trade.entryPrice - exitPrice) / pv;
          const pips = rawPips - FRICTION_PIPS;
          const result = pips > 0 ? 'win' : 'loss';

          // P&L
          const pnl1pct = pips * pv * trade.units1pct;
          const pnl5pct = pips * pv * trade.units5pct;
          equity1pct += pnl1pct;
          equity5pct += pnl5pct;

          peak1pct = Math.max(peak1pct, equity1pct);
          peak5pct = Math.max(peak5pct, equity5pct);
          const dd1 = (peak1pct - equity1pct) / peak1pct * 100;
          const dd5 = (peak5pct - equity5pct) / peak5pct * 100;
          maxDD1pct = Math.max(maxDD1pct, dd1);
          maxDD5pct = Math.max(maxDD5pct, dd5);

          trades.push({
            legId: trade.legId, pair: trade.instrument, direction: trade.direction,
            entryBar: trade.entryBar, exitBar: bar,
            entryPrice: trade.entryPrice, exitPrice,
            pips: Math.round(pips * 10) / 10, result,
            pnl1pct: Math.round(pnl1pct * 100) / 100,
            pnl5pct: Math.round(pnl5pct * 100) / 100,
          });

          const ls = legStats[trade.legId];
          if (result === 'win') ls.wins++; else ls.losses++;
          ls.totalPips += pips;

          openTrades.splice(t, 1);
          cooldownBars[trade.legId] = bar + 2; // 2-bar cooldown
        }
      }

      // Record equity every 10 bars for curve
      if (bar % 10 === 0) {
        equityCurve1pct.push(Math.round(equity1pct * 100) / 100);
        equityCurve5pct.push(Math.round(equity5pct * 100) / 100);
      }

      // Skip entry evaluation if all 3 legs are open
      const openLegIds = new Set(openTrades.map(t => t.legId));
      if (openLegIds.size >= 3) continue;

      // Compute currency rankings at this bar
      const sorted = computeRankings(pairBars, bar, LOOKBACK);

      // Evaluate each hedge leg
      for (const leg of HEDGE_LEGS) {
        if (openLegIds.has(leg.id)) continue;
        if (cooldownBars[leg.id] && bar < cooldownBars[leg.id]) continue;

        const strongCcy = sorted[leg.strongRank - 1];
        const weakCcy = sorted[leg.weakRank - 1];
        const instrInfo = findInstrument(strongCcy, weakCcy);
        if (!instrInfo) continue;

        const { instrument, inverted } = instrInfo;
        const direction: 'long' | 'short' = inverted ? 'short' : 'long';
        const bars = pairBars.get(instrument);
        if (!bars || bar >= bars.length) continue;

        // Gate 2: Atlas Snap
        if (!atlasSnapGate(bars, bar, direction)) continue;

        // Gate 3: David Vector
        if (!davidVectorGate(bars, bar, direction)) continue;

        const currentPrice = bars[bar].close;
        const pv = pipValue(instrument);

        // SL: max(ATR*2, leg.slPips)
        const atr = computeATR(bars, bar, 14);
        const slDist = Math.max(atr * 2.0, leg.slPips * pv);
        const tpDist = slDist * leg.tpRatio;

        const slPrice = direction === 'long' ? currentPrice - slDist : currentPrice + slDist;
        const tpPrice = direction === 'long' ? currentPrice + tpDist : currentPrice - tpDist;

        // Position sizing
        const risk1 = equity1pct * RISK_FRACTION_1PCT * leg.weight;
        const risk5 = equity5pct * RISK_FRACTION_5PCT * leg.weight;
        const units1pct = Math.max(1, Math.round(risk1 / slDist));
        const units5pct = Math.max(1, Math.round(risk5 / slDist));

        openTrades.push({
          legId: leg.id, instrument, direction,
          entryPrice: currentPrice, slPrice, tpPrice,
          entryBar: bar, units1pct, units5pct,
        });
      }
    }

    // Force close remaining
    for (const trade of openTrades) {
      const bars = pairBars.get(trade.instrument);
      if (!bars) continue;
      const exitPrice = bars[totalBars - 1]?.close || trade.entryPrice;
      const pv = pipValue(trade.instrument);
      const rawPips = trade.direction === 'long'
        ? (exitPrice - trade.entryPrice) / pv
        : (trade.entryPrice - exitPrice) / pv;
      const pips = rawPips - FRICTION_PIPS;
      trades.push({
        legId: trade.legId, pair: trade.instrument, direction: trade.direction,
        entryBar: trade.entryBar, exitBar: totalBars - 1,
        entryPrice: trade.entryPrice, exitPrice,
        pips: Math.round(pips * 10) / 10, result: pips > 0 ? 'win' : 'loss',
        pnl1pct: 0, pnl5pct: 0,
      });
      const ls = legStats[trade.legId];
      if (pips > 0) ls.wins++; else ls.losses++;
      ls.totalPips += pips;
    }

    // ── Compute final metrics ──
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === 'win').length;
    const winRate = totalTrades > 0 ? (wins / totalTrades * 100) : 0;
    const totalPips = trades.reduce((s, t) => s + t.pips, 0);
    const grossProfit = trades.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pips <= 0).reduce((s, t) => s + t.pips, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const avgPips = totalTrades > 0 ? totalPips / totalTrades : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = (totalTrades - wins) > 0 ? grossLoss / (totalTrades - wins) : 0;
    const rRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;
    const expectancyR = winRate / 100 * rRatio - (1 - winRate / 100);

    // OOS split (70/30)
    const oosStart = Math.floor(totalTrades * 0.7);
    const isTrades = trades.slice(0, oosStart);
    const oosTrades = trades.slice(oosStart);
    const isWinRate = isTrades.length > 0 ? isTrades.filter(t => t.result === 'win').length / isTrades.length * 100 : 0;
    const oosWinRate = oosTrades.length > 0 ? oosTrades.filter(t => t.result === 'win').length / oosTrades.length * 100 : 0;
    const isPips = isTrades.reduce((s, t) => s + t.pips, 0);
    const oosPips = oosTrades.reduce((s, t) => s + t.pips, 0);
    const isGP = isTrades.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const isGL = Math.abs(isTrades.filter(t => t.pips <= 0).reduce((s, t) => s + t.pips, 0));
    const oosGP = oosTrades.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const oosGL = Math.abs(oosTrades.filter(t => t.pips <= 0).reduce((s, t) => s + t.pips, 0));
    const isPF = isGL > 0 ? isGP / isGL : 99;
    const oosPF = oosGL > 0 ? oosGP / oosGL : 99;

    // First/last bar dates
    const firstDate = pairBars.values().next().value?.[startBar]?.time || '';
    const lastDate = pairBars.values().next().value?.[totalBars - 1]?.time || '';

    const return1pct = ((equity1pct - STARTING_EQUITY) / STARTING_EQUITY) * 100;
    const return5pct = ((equity5pct - STARTING_EQUITY) / STARTING_EQUITY) * 100;

    console.log(`[HEDGE-BT] Complete: ${totalTrades} trades, ${winRate.toFixed(1)}% WR, ${totalPips.toFixed(1)} pips, PF=${profitFactor.toFixed(2)}`);
    console.log(`[HEDGE-BT] 1% Risk: $${equity1pct.toFixed(2)} (${return1pct.toFixed(1)}%), MaxDD=${maxDD1pct.toFixed(1)}%`);
    console.log(`[HEDGE-BT] 5% Risk: $${equity5pct.toFixed(2)} (${return5pct.toFixed(1)}%), MaxDD=${maxDD5pct.toFixed(1)}%`);

    return new Response(JSON.stringify({
      success: true,
      backtest: {
        totalBars, pairsLoaded: pairBars.size, candlesPerPair: candleCount,
        dateRange: { start: firstDate, end: lastDate },
        environment,
        // Core metrics
        totalTrades, wins, losses: totalTrades - wins,
        winRate: Math.round(winRate * 10) / 10,
        totalPips: Math.round(totalPips * 10) / 10,
        avgPipsPerTrade: Math.round(avgPips * 10) / 10,
        profitFactor: Math.round(profitFactor * 100) / 100,
        rRatio: Math.round(rRatio * 100) / 100,
        expectancyR: Math.round(expectancyR * 1000) / 1000,
        grossProfit: Math.round(grossProfit * 10) / 10,
        grossLoss: Math.round(grossLoss * 10) / 10,
        // Equity
        equity1pct: { final: Math.round(equity1pct * 100) / 100, returnPct: Math.round(return1pct * 10) / 10, maxDD: Math.round(maxDD1pct * 10) / 10 },
        equity5pct: { final: Math.round(equity5pct * 100) / 100, returnPct: Math.round(return5pct * 10) / 10, maxDD: Math.round(maxDD5pct * 10) / 10 },
        equityCurve1pct, equityCurve5pct,
        // OOS validation
        oos: {
          isTrades: isTrades.length, oosTrades: oosTrades.length,
          isWinRate: Math.round(isWinRate * 10) / 10, oosWinRate: Math.round(oosWinRate * 10) / 10,
          isPips: Math.round(isPips * 10) / 10, oosPips: Math.round(oosPips * 10) / 10,
          isPF: Math.round(isPF * 100) / 100, oosPF: Math.round(oosPF * 100) / 100,
        },
        // Per-leg breakdown
        legs: Object.entries(legStats).map(([id, stats]) => ({
          id, ...stats,
          totalPips: Math.round(stats.totalPips * 10) / 10,
          winRate: (stats.wins + stats.losses) > 0 ? Math.round(stats.wins / (stats.wins + stats.losses) * 1000) / 10 : 0,
          trades: stats.wins + stats.losses,
        })),
        // Sample trades (last 20)
        recentTrades: trades.slice(-20).map(t => ({
          ...t, pips: Math.round(t.pips * 10) / 10,
        })),
      },
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[HEDGE-BT] Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
