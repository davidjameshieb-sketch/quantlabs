// Blend Live Backtest — 100% Forward Test of Portfolio Blend
// Supports dynamic component portfolio from request body OR hardcoded 5-component fallback.
// Tests portfolio against real OANDA M30 candles with gates, entry triggers, bespoke SL/TP.

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

// ── Blend Component Definitions ──

interface BlendComponent {
  id: string;
  predatorRank: number;
  preyRank: number;
  requireG3: boolean;
  slType: 'swing_low_5' | 'atlas_wall_10' | 'atr_2x' | 'fixed_30' | 'fixed_custom';
  entryType: 'z_ofi_2' | 'order_block';
  weight: number;
  label: string;
  fixedPips?: number;
  tpRatio?: number;
}

const DEFAULT_COMPONENTS: BlendComponent[] = [
  { id: '3v8', predatorRank: 3, preyRank: 8, requireG3: true,  slType: 'swing_low_5',   entryType: 'z_ofi_2',     weight: 0.44, label: '#3v#8 · G1+G2+G3 · Swing low (5-bar) · Z-OFI > 2.0' },
  { id: '1v6', predatorRank: 1, preyRank: 6, requireG3: true,  slType: 'atlas_wall_10', entryType: 'order_block', weight: 0.22, label: '#1v#6 · G1+G2+G3 · Atlas Wall -10 · Order block' },
  { id: '1v7', predatorRank: 1, preyRank: 7, requireG3: true,  slType: 'atr_2x',        entryType: 'order_block', weight: 0.15, label: '#1v#7 · G1+G2+G3 · 2.0x ATR · Order block' },
  { id: '3v7', predatorRank: 3, preyRank: 7, requireG3: false, slType: 'fixed_30',      entryType: 'order_block', weight: 0.11, label: '#3v#7 · G1+G2 · 30 pip fixed · Order block' },
  { id: '3v6', predatorRank: 3, preyRank: 6, requireG3: false, slType: 'atr_2x',        entryType: 'order_block', weight: 0.09, label: '#3v#6 · G1+G2 · 2.0x ATR · Order block' },
];

const FRICTION_PIPS = 1.5;
const BASE_EQUITY = 1000;
const TOTAL_RISK_UNITS = 5000;

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

// ── Technical Indicators ──

function pipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

function computeATR(candles: Candle[], endIdx: number, period = 14): number {
  if (endIdx < period) return 0;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += candles[i].high - candles[i].low;
  return sum / period;
}

function computeSwingStop(candles: Candle[], endIdx: number, bars: number, direction: 'long' | 'short'): number {
  const start = Math.max(0, endIdx - bars + 1);
  if (direction === 'long') {
    let min = Infinity;
    for (let i = start; i <= endIdx; i++) if (candles[i].low < min) min = candles[i].low;
    return min;
  }
  let max = -Infinity;
  for (let i = start; i <= endIdx; i++) if (candles[i].high > max) max = candles[i].high;
  return max;
}

function findAtlasBlock(candles: Candle[], endIdx: number, period = 20): { blockHigh: number; blockLow: number } | null {
  const start = Math.max(0, endIdx - period + 1);
  const veffs: number[] = [];
  for (let i = start; i <= endIdx; i++) {
    const range = Math.abs(candles[i].high - candles[i].low);
    veffs.push(range === 0 ? 0 : candles[i].volume / range);
  }
  const avg = veffs.reduce((a, b) => a + b, 0) / veffs.length;
  const threshold = avg * 1.5;
  for (let i = veffs.length - 1; i >= 0; i--) {
    if (veffs[i] > threshold) {
      const ci = start + i;
      return { blockHigh: candles[ci].high, blockLow: candles[ci].low };
    }
  }
  return null;
}

function computeZOFI(candles: Candle[], endIdx: number, period = 20): number {
  if (endIdx < period) return 0;
  const ofiValues: number[] = [];
  for (let i = endIdx - period; i <= endIdx; i++) {
    const range = candles[i].high - candles[i].low || 0.0001;
    ofiValues.push(candles[i].volume * (candles[i].close - candles[i].open) / range);
  }
  const current = ofiValues[ofiValues.length - 1];
  const lookback = ofiValues.slice(0, -1);
  const mean = lookback.reduce((a, b) => a + b, 0) / lookback.length;
  const variance = lookback.reduce((a, b) => a + (b - mean) ** 2, 0) / lookback.length;
  const std = Math.sqrt(variance) || 1;
  return (current - mean) / std;
}

function lrSlope(candles: Candle[], endIdx: number, period = 20): number {
  if (endIdx < period) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < period; i++) {
    const ci = endIdx - period + 1 + i;
    sumX += i; sumY += candles[ci].close; sumXY += i * candles[ci].close; sumX2 += i * i;
  }
  const denom = period * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (period * sumXY - sumX * sumY) / denom;
}

function checkG2(candles: Candle[], idx: number, direction: 'long' | 'short'): boolean {
  if (idx < 21) return false;
  const currentClose = candles[idx].close;
  if (direction === 'long') {
    let highest = -Infinity;
    for (let k = idx - 20; k < idx; k++) if (candles[k].high > highest) highest = candles[k].high;
    return currentClose > highest;
  } else {
    let lowest = Infinity;
    for (let k = idx - 20; k < idx; k++) if (candles[k].low < lowest) lowest = candles[k].low;
    return currentClose < lowest;
  }
}

function checkG3(candles: Candle[], idx: number, direction: 'long' | 'short'): boolean {
  if (idx < 20) return false;
  const slope = lrSlope(candles, idx, 20);
  return direction === 'long' ? slope > 0 : slope < 0;
}

// ── SL computation per component ──
function computeSLDistance(comp: BlendComponent, candles: Candle[], idx: number, direction: 'long' | 'short', currentPrice: number, pv: number): number {
  switch (comp.slType) {
    case 'swing_low_5': {
      const swingLevel = computeSwingStop(candles, idx, 5, direction);
      const dist = Math.abs(currentPrice - swingLevel);
      return dist < 3 * pv ? 10 * pv : dist;
    }
    case 'atlas_wall_10': {
      const block = findAtlasBlock(candles, idx, 20);
      if (block) {
        const wallLevel = direction === 'long' ? block.blockLow : block.blockHigh;
        return Math.abs(currentPrice - wallLevel) + 10 * pv;
      }
      return 15 * pv;
    }
    case 'atr_2x': {
      const atr = computeATR(candles, idx, 14);
      const dist = atr * 2.0;
      return dist < 5 * pv ? 10 * pv : dist;
    }
    case 'fixed_30':
      return (comp.fixedPips || 30) * pv;
    case 'fixed_custom':
      return (comp.fixedPips || 30) * pv;
  }
}

// ── Entry trigger check ──
function checkEntryTrigger(comp: BlendComponent, candles: Candle[], idx: number, direction: 'long' | 'short'): boolean {
  if (comp.entryType === 'z_ofi_2') {
    const zofi = computeZOFI(candles, idx, 20);
    return direction === 'long' ? zofi > 2.0 : zofi < -2.0;
  }
  return findAtlasBlock(candles, idx, 20) !== null;
}

function findInstrument(cur1: string, cur2: string): { instrument: string; inverted: boolean } | null {
  const direct = `${cur1}_${cur2}`;
  if (OANDA_AVAILABLE.has(direct)) return { instrument: direct, inverted: false };
  const inverse = `${cur2}_${cur1}`;
  if (OANDA_AVAILABLE.has(inverse)) return { instrument: inverse, inverted: true };
  return null;
}

interface TradeResult {
  componentId: string;
  instrument: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  slPrice: number;
  tpPrice: number;
  pips: number;
  weight: number;
  entryTime: string;
  exitTime: string;
  slType: string;
  entryType: string;
}

function simulateTradeForward(
  candles: Candle[], entryIdx: number, entryPrice: number,
  slPrice: number, tpPrice: number, direction: 'long' | 'short', isJPY: boolean,
): { exitPrice: number; exitIdx: number } {
  for (let ci = entryIdx + 1; ci < candles.length; ci++) {
    const bar = candles[ci];
    if (direction === 'long') {
      if (bar.low <= slPrice) return { exitPrice: slPrice, exitIdx: ci };
      if (bar.high >= tpPrice) return { exitPrice: tpPrice, exitIdx: ci };
    } else {
      if (bar.high >= slPrice) return { exitPrice: slPrice, exitIdx: ci };
      if (bar.low <= tpPrice) return { exitPrice: tpPrice, exitIdx: ci };
    }
  }
  return { exitPrice: candles[candles.length - 1].close, exitIdx: candles.length - 1 };
}

function computePips(entry: number, exit: number, dir: 'long' | 'short', isJPY: boolean): number {
  const raw = dir === 'long' ? exit - entry : entry - exit;
  return isJPY ? raw * 100 : raw * 10000;
}

interface RankSnap { time: string; ranks: Record<string, number>; }

// ════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "live";
    const candleCount: number = Math.min(body.candles || 15000, 42000);

    // ── Resolve active components ──
    let activeComponents: BlendComponent[] = DEFAULT_COMPONENTS;

    if (body.components && Array.isArray(body.components) && body.components.length > 0) {
      activeComponents = body.components.map((c: any) => ({
        id: c.id || `${c.predatorRank}v${c.preyRank}`,
        predatorRank: c.predatorRank,
        preyRank: c.preyRank,
        requireG3: c.requireG3 ?? false,
        slType: c.slType || 'fixed_custom',
        entryType: c.entryType || 'order_block',
        weight: c.weight,
        label: c.label || `#${c.predatorRank}v${c.preyRank}`,
        fixedPips: c.fixedPips,
        tpRatio: c.tpRatio,
      }));
      console.log(`[BLEND-BT] Using ${activeComponents.length} dynamic components from portfolio`);
    }

    const maxWeight = Math.max(...activeComponents.map(c => c.weight));

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const availableCrosses = ALL_28_CROSSES.filter(c => OANDA_AVAILABLE.has(c.instrument));

    // ── Step 1: Fetch candles in batches of 7 ──
    console.log(`[BLEND-BT] Starting blend backtest — ${candleCount} candles (${environment}), ${activeComponents.length} components`);
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
    console.log(`[BLEND-BT] Loaded ${pairsLoaded} pairs, avg ${avgCandles} candles`);

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
    console.log(`[BLEND-BT] ${rankSnaps.length} rank snapshots`);

    // ── Step 3: Walk through each rank snapshot, evaluate all components ──
    const allTrades: TradeResult[] = [];
    const componentStats: Record<string, { trades: number; wins: number; losses: number; totalPips: number; grossWin: number; grossLoss: number }> = {};
    for (const comp of activeComponents) {
      componentStats[comp.id] = { trades: 0, wins: 0, losses: 0, totalPips: 0, grossWin: 0, grossLoss: 0 };
    }

    const activeTradeEnd: Record<string, number> = {};

    const SAMPLE_STEP = rankSnaps.length > 10000 ? Math.floor(rankSnaps.length / 8000) : 1;

    for (let si = 0; si < rankSnaps.length; si += SAMPLE_STEP) {
      const snap = rankSnaps[si];

      for (const comp of activeComponents) {
        if (activeTradeEnd[comp.id] !== undefined && si <= activeTradeEnd[comp.id]) continue;

        const predCurrency = ALL_CURRENCIES.find(c => snap.ranks[c] === comp.predatorRank);
        const preyCurrency = ALL_CURRENCIES.find(c => snap.ranks[c] === comp.preyRank);
        if (!predCurrency || !preyCurrency) continue;

        const instrInfo = findInstrument(predCurrency, preyCurrency);
        if (!instrInfo) continue;

        const { instrument, inverted } = instrInfo;
        const direction: 'long' | 'short' = inverted ? 'short' : 'long';
        const candles = pairCandles[instrument];
        if (!candles) continue;

        const candleIdx = pairTimeIndex[instrument]?.[snap.time];
        if (candleIdx === undefined || candleIdx < 21) continue;

        if (!checkG2(candles, candleIdx, direction)) continue;
        if (comp.requireG3 && !checkG3(candles, candleIdx, direction)) continue;
        if (!checkEntryTrigger(comp, candles, candleIdx, direction)) continue;

        const currentPrice = candles[candleIdx].close;
        const pv = pipValue(instrument);
        const isJPY = instrument.includes('JPY');
        const slDist = computeSLDistance(comp, candles, candleIdx, direction, currentPrice, pv);
        const compTpRatio = comp.tpRatio || 2.0;
        const slPrice = direction === 'long' ? currentPrice - slDist : currentPrice + slDist;
        const tpPrice = direction === 'long' ? currentPrice + slDist * compTpRatio : currentPrice - slDist * compTpRatio;

        const result = simulateTradeForward(candles, candleIdx, currentPrice, slPrice, tpPrice, direction, isJPY);
        let tradePips = computePips(currentPrice, result.exitPrice, direction, isJPY);
        tradePips = tradePips > 0 ? tradePips - FRICTION_PIPS : tradePips - FRICTION_PIPS;

        const trade: TradeResult = {
          componentId: comp.id,
          instrument,
          direction,
          entryPrice: currentPrice,
          exitPrice: result.exitPrice,
          slPrice,
          tpPrice,
          pips: Math.round(tradePips * 10) / 10,
          weight: comp.weight,
          entryTime: snap.time,
          exitTime: candles[result.exitIdx].time,
          slType: comp.slType,
          entryType: comp.entryType,
        };

        allTrades.push(trade);

        const cs = componentStats[comp.id];
        cs.trades++;
        cs.totalPips += tradePips;
        if (tradePips > 0) { cs.wins++; cs.grossWin += tradePips; }
        else { cs.losses++; cs.grossLoss += Math.abs(tradePips); }

        const exitSnapIdx = rankSnaps.findIndex((s, idx) => idx > si && s.time >= candles[result.exitIdx].time);
        activeTradeEnd[comp.id] = exitSnapIdx >= 0 ? exitSnapIdx : rankSnaps.length;
      }
    }

    console.log(`[BLEND-BT] Total trades: ${allTrades.length}`);

    // ── Step 4: Build portfolio equity curve with weighted sizing ──
    allTrades.sort((a, b) => a.entryTime.localeCompare(b.entryTime));

    let portfolioEquity = BASE_EQUITY;
    let peak = BASE_EQUITY;
    let maxDD = 0;
    const equityCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];

    let aggEquity = BASE_EQUITY;
    let aggPeak = BASE_EQUITY;
    let aggMaxDD = 0;
    const aggCurve: Array<{ time: string; equity: number }> = [{ time: sortedTimes[0] || '', equity: BASE_EQUITY }];

    for (const trade of allTrades) {
      const pv = pipValue(trade.instrument);

      // Institutional: 1% risk per trade, normalized by max weight
      const instRisk = portfolioEquity * 0.01 * trade.weight / maxWeight;
      const slPips = Math.abs(trade.entryPrice - trade.slPrice) / pv;
      const instUnits = slPips > 0 ? Math.min(instRisk / (slPips * pv), 5_000_000) : 0;
      const instPnl = trade.pips * instUnits * pv;
      portfolioEquity += instPnl;
      if (portfolioEquity > peak) peak = portfolioEquity;
      const dd = (peak - portfolioEquity) / peak;
      if (dd > maxDD) maxDD = dd;
      equityCurve.push({ time: trade.exitTime, equity: Math.round(portfolioEquity * 100) / 100 });

      // Aggressive: 5% risk per trade
      const aggRisk = aggEquity * 0.05 * trade.weight / maxWeight;
      const aggUnits = slPips > 0 ? Math.min(aggRisk / (slPips * pv), 5_000_000) : 0;
      const aggPnl = trade.pips * aggUnits * pv;
      aggEquity += aggPnl;
      if (aggEquity > aggPeak) aggPeak = aggEquity;
      const aggDd = (aggPeak - aggEquity) / aggPeak;
      if (aggDd > aggMaxDD) aggMaxDD = aggDd;
      aggCurve.push({ time: trade.exitTime, equity: Math.round(aggEquity * 100) / 100 });
    }

    const downsample = (curve: Array<{ time: string; equity: number }>, maxPts = 300) => {
      if (curve.length <= maxPts) return curve;
      const step = Math.max(1, Math.floor(curve.length / maxPts));
      return curve.filter((_, i) => i % step === 0 || i === curve.length - 1);
    };

    const totalTrades = allTrades.length;
    const wins = allTrades.filter(t => t.pips > 0).length;
    const losses = totalTrades - wins;
    const totalPips = allTrades.reduce((s, t) => s + t.pips, 0);
    const grossWin = allTrades.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const grossLoss = allTrades.filter(t => t.pips <= 0).reduce((s, t) => s + Math.abs(t.pips), 0);
    const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 999 : 0;

    const componentSummaries = activeComponents.map(comp => {
      const cs = componentStats[comp.id];
      return {
        id: comp.id,
        label: comp.label,
        weight: comp.weight,
        trades: cs.trades,
        wins: cs.wins,
        losses: cs.losses,
        winRate: cs.trades > 0 ? Math.round((cs.wins / cs.trades) * 1000) / 10 : 0,
        totalPips: Math.round(cs.totalPips * 10) / 10,
        profitFactor: cs.grossLoss > 0 ? Math.round((cs.grossWin / cs.grossLoss) * 100) / 100 : cs.grossWin > 0 ? 999 : 0,
        avgWin: cs.wins > 0 ? Math.round((cs.grossWin / cs.wins) * 10) / 10 : 0,
        avgLoss: cs.losses > 0 ? Math.round((cs.grossLoss / cs.losses) * 10) / 10 : 0,
      };
    });

    const actualDays = avgCandles / 44;
    const periods = [
      { label: '3D', days: 3 },
      { label: '7D', days: 7 },
      { label: '14D', days: 14 },
      { label: '30D', days: 30 },
      { label: '60D', days: 60 },
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
        winRate: wins > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0,
        profitFactor,
        maxDD: Math.round(-maxDD * 1000) / 10,
        netPips: Math.round(periodPips * 10) / 10,
        trades: periodTrades,
      };
    });

    const result = {
      success: true,
      version: "blend-bt-2.0",
      timestamp: new Date().toISOString(),
      environment,
      candlesPerPair: avgCandles,
      pairsLoaded,
      totalSnapshots: rankSnaps.length,
      componentsUsed: activeComponents.length,
      dateRange: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
      portfolio: {
        totalTrades,
        wins,
        losses,
        winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0,
        profitFactor,
        totalPips: Math.round(totalPips * 10) / 10,
        maxDrawdown: Math.round(-maxDD * 1000) / 10,
        aggressiveMaxDD: Math.round(-aggMaxDD * 1000) / 10,
        institutionalProfit: Math.round((portfolioEquity - BASE_EQUITY) * 100) / 100,
        aggressiveProfit: Math.round((aggEquity - BASE_EQUITY) * 100) / 100,
        finalEquity: Math.round(portfolioEquity * 100) / 100,
        aggressiveFinalEquity: Math.round(aggEquity * 100) / 100,
        expectancy: totalTrades > 0 ? Math.round((totalPips / totalTrades) * 100) / 100 : 0,
        avgWin: wins > 0 ? Math.round((grossWin / wins) * 10) / 10 : 0,
        avgLoss: losses > 0 ? Math.round((grossLoss / losses) * 10) / 10 : 0,
      },
      components: componentSummaries,
      periodStats,
      equityCurve: downsample(equityCurve),
      aggressiveEquityCurve: downsample(aggCurve),
    };

    console.log(`[BLEND-BT] Done. ${totalTrades} trades, PF=${profitFactor}, Net=${Math.round(totalPips)}p, Inst=$${Math.round(portfolioEquity - BASE_EQUITY)}, Agg=$${Math.round(aggEquity - BASE_EQUITY)}`);

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[BLEND-BT] Error:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
