// Forex Data Readiness Diagnostic
// Reports the status of tickers, live prices, and candle analysis
// for all supported forex pairs. Runs at startup and every 5 minutes.

import type { Timeframe } from '@/lib/market/types';
import { getTickersByType, findForexTicker } from '@/lib/market/tickers';
import { getAllLivePrices } from './oandaPricingService';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { toDisplaySymbol, toCanonicalSymbol, toRawSymbol } from './forexSymbolMap';

// ─── Types ───

export interface PairReadiness {
  pairDisplay: string;
  pairCanonical: string;
  pairRaw: string;
  tickerFound: boolean;
  livePriceFound: boolean;
  candlesFound: Partial<Record<Timeframe, boolean>>;
  analysisAvailable: boolean;
  blockingReason: string | null;
}

export interface ReadinessSummary {
  okCount: number;
  blockedCount: number;
  topBlockingReasons: Array<{ reason: string; count: number }>;
}

export interface ForexDataReadinessResult {
  ts: number;
  results: PairReadiness[];
  summary: ReadinessSummary;
}

// ─── Supported Pairs ───

const SUPPORTED_PAIRS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD',
  'USD_CHF', 'EUR_JPY', 'GBP_JPY', 'NZD_USD', 'EUR_GBP',
  'AUD_JPY', 'EUR_AUD', 'EUR_CHF', 'CAD_JPY', 'GBP_AUD',
  'GBP_CHF', 'AUD_CAD', 'AUD_NZD', 'NZD_JPY', 'CHF_JPY',
];

const REQUIRED_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h'];

// ─── Main Check ───

export function checkForexDataReadiness(
  pairs: string[] = SUPPORTED_PAIRS,
  timeframes: Timeframe[] = REQUIRED_TIMEFRAMES,
): ForexDataReadinessResult {
  const livePrices = getAllLivePrices();
  const results: PairReadiness[] = [];
  const reasonCounts: Record<string, number> = {};

  for (const canonical of pairs) {
    const display = toDisplaySymbol(canonical);
    const raw = toRawSymbol(canonical);

    // 1. Ticker lookup
    const ticker = findForexTicker(canonical);
    const tickerFound = !!ticker;

    // 2. Live price
    const livePriceFound = !!livePrices[display];

    // 3. Candles + analysis
    const candlesFound: Partial<Record<Timeframe, boolean>> = {};
    let analysisAvailable = false;
    let blockingReason: string | null = null;

    if (!tickerFound) {
      blockingReason = 'TICKER_NOT_FOUND';
      for (const tf of timeframes) candlesFound[tf] = false;
    } else {
      try {
        const mtf = analyzeMultiTimeframe(ticker, timeframes);
        analysisAvailable = true;
        for (const tf of timeframes) {
          const analysis = mtf.analyses[tf];
          candlesFound[tf] = !!(analysis && analysis.atr > 0);
        }
      } catch {
        blockingReason = 'ANALYSIS_EXCEPTION';
        for (const tf of timeframes) candlesFound[tf] = false;
      }
    }

    if (!blockingReason && !livePriceFound) {
      blockingReason = 'LIVE_PRICE_MISSING';
    }

    const missingTFs = timeframes.filter(tf => !candlesFound[tf]);
    if (!blockingReason && missingTFs.length > 0) {
      blockingReason = `CANDLES_MISSING:${missingTFs.join(',')}`;
    }

    if (blockingReason) {
      reasonCounts[blockingReason] = (reasonCounts[blockingReason] || 0) + 1;
    }

    results.push({
      pairDisplay: display,
      pairCanonical: canonical,
      pairRaw: raw,
      tickerFound,
      livePriceFound,
      candlesFound,
      analysisAvailable,
      blockingReason,
    });
  }

  const okCount = results.filter(r => r.analysisAvailable && !r.blockingReason).length;
  const blockedCount = results.length - okCount;

  const topBlockingReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    ts: Date.now(),
    results,
    summary: { okCount, blockedCount, topBlockingReasons },
  };
}

// ─── Auto-Run Logger ───

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startReadinessMonitor(intervalMs: number = 5 * 60 * 1000): void {
  // Run immediately
  logReadiness();
  // Then on interval
  intervalId = setInterval(logReadiness, intervalMs);
}

export function stopReadinessMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function logReadiness(): void {
  const result = checkForexDataReadiness();
  const { summary } = result;

  if (summary.blockedCount === 0) {
    console.log(`[ForexReadiness] ✅ All ${summary.okCount} pairs ready`);
  } else {
    console.warn(
      `[ForexReadiness] ⚠️ ${summary.okCount} ready, ${summary.blockedCount} blocked`,
      summary.topBlockingReasons,
    );
    // Log details for blocked pairs
    result.results
      .filter(r => r.blockingReason)
      .forEach(r => {
        console.warn(
          `  [ForexReadiness] ${r.pairDisplay} (raw: ${r.pairRaw}): ${r.blockingReason}`,
          `ticker=${r.tickerFound} price=${r.livePriceFound}`,
        );
      });
  }
}
