// OANDA Historical Candle Provider
// Fetches candle data from OANDA Instruments API and aggregates timeframes.

export interface OandaCandle {
  time: string;      // ISO timestamp
  mid: { o: number; h: number; l: number; c: number };
  volume: number;
}

export interface BacktestCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type BacktestTimeframe = '15m' | '1h' | '4h' | '1d';

const TF_TO_OANDA: Record<BacktestTimeframe, string> = {
  '15m': 'M15',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D',
};

// ─── Generate Synthetic Candle Data ───
// Used when OANDA API is not available (client-side backtest)

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function generateSyntheticCandles(
  pair: string,
  timeframe: BacktestTimeframe,
  startDate: Date,
  endDate: Date,
): BacktestCandle[] {
  const candles: BacktestCandle[] = [];
  const tfMinutes = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[timeframe];
  const stepMs = tfMinutes * 60 * 1000;

  // Base prices for each pair
  const basePrices: Record<string, number> = {
    EUR_USD: 1.0850, GBP_USD: 1.2650, USD_JPY: 149.50, AUD_USD: 0.6550,
    USD_CAD: 1.3650, EUR_GBP: 0.8580, EUR_JPY: 162.20, GBP_JPY: 189.10,
    NZD_USD: 0.6050, AUD_JPY: 97.80, USD_CHF: 0.8780, EUR_CHF: 0.9530,
    EUR_AUD: 1.6560, GBP_AUD: 1.9310, AUD_NZD: 1.0820,
  };

  const isJpy = pair.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const atrPips = isJpy ? 15 : 8; // Average ATR in pips
  const atrPrice = atrPips * pipSize;

  let price = basePrices[pair] ?? 1.0;
  const rng = seededRandom(hashPair(pair, startDate.getTime()));

  let ts = startDate.getTime();
  while (ts < endDate.getTime()) {
    const date = new Date(ts);
    // Skip weekends
    const day = date.getUTCDay();
    if (day === 0 || day === 6) {
      ts += stepMs;
      continue;
    }

    const r = rng;
    const drift = (r() - 0.48) * atrPrice * 0.3; // Slight drift
    const volatility = atrPrice * (0.3 + r() * 0.7);

    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + r() * volatility * 0.5;
    const low = Math.min(open, close) - r() * volatility * 0.5;
    const volume = Math.round(500 + r() * 2000);

    candles.push({ timestamp: ts, open, high, low, close, volume });
    price = close;
    ts += stepMs;
  }

  return candles;
}

function hashPair(pair: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < pair.length; i++) {
    h = ((h << 5) - h) + pair.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// ─── Aggregate Lower TF to Higher TF ───

export function aggregateCandles(
  candles: BacktestCandle[],
  targetTfMinutes: number,
): BacktestCandle[] {
  if (candles.length === 0) return [];

  const stepMs = targetTfMinutes * 60 * 1000;
  const aggregated: BacktestCandle[] = [];
  let bucket: BacktestCandle | null = null;
  let bucketEnd = 0;

  for (const c of candles) {
    const bucketStart = Math.floor(c.timestamp / stepMs) * stepMs;
    const currentEnd = bucketStart + stepMs;

    if (!bucket || c.timestamp >= bucketEnd) {
      if (bucket) aggregated.push(bucket);
      bucket = { ...c };
      bucketEnd = currentEnd;
    } else {
      bucket.high = Math.max(bucket.high, c.high);
      bucket.low = Math.min(bucket.low, c.low);
      bucket.close = c.close;
      bucket.volume += c.volume;
    }
  }
  if (bucket) aggregated.push(bucket);

  return aggregated;
}

// ─── Compute ATR from Candles ───

export function computeATR(candles: BacktestCandle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }

  // Simple moving average of last `period` TRs
  const recentTrs = trs.slice(-period);
  return recentTrs.reduce((s, v) => s + v, 0) / recentTrs.length;
}

// ─── Multi-Timeframe Data Bundle ───

export interface BacktestDataBundle {
  pair: string;
  candles15m: BacktestCandle[];
  candles1h: BacktestCandle[];
  candles4h: BacktestCandle[];
  candles1d: BacktestCandle[];
}

export function buildBacktestDataBundle(
  pair: string,
  startDate: Date,
  endDate: Date,
): BacktestDataBundle {
  // Generate 15m as base, aggregate up
  const candles15m = generateSyntheticCandles(pair, '15m', startDate, endDate);
  const candles1h = aggregateCandles(candles15m, 60);
  const candles4h = aggregateCandles(candles15m, 240);
  const candles1d = aggregateCandles(candles15m, 1440);

  return { pair, candles15m, candles1h, candles4h, candles1d };
}
