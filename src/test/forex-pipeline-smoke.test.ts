// Smoke test: Forex pipeline end-to-end
// Verifies that major forex pairs can be found, analyzed, and evaluated by governance.

import { describe, it, expect } from 'vitest';
import { findForexTicker, getTickersByType } from '@/lib/market/tickers';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { checkForexDataReadiness } from '@/lib/forex/forexDataReadiness';
import { toDisplaySymbol, toRawSymbol, toCanonicalSymbol } from '@/lib/forex/forexSymbolMap';
import { evaluateFullDecision, type TradeProposal } from '@/lib/forex/tradeGovernanceEngine';

const MAJOR_PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD'];

describe('Forex Pipeline Smoke Test', () => {
  it('should have forex tickers registered', () => {
    const forexTickers = getTickersByType('forex');
    expect(forexTickers.length).toBeGreaterThanOrEqual(6);
  });

  it('should find major pairs via findForexTicker with any format', () => {
    for (const canonical of MAJOR_PAIRS) {
      const display = toDisplaySymbol(canonical);
      const raw = toRawSymbol(canonical);

      // All three formats should find the same ticker
      const fromCanonical = findForexTicker(canonical);
      const fromDisplay = findForexTicker(display);
      const fromRaw = findForexTicker(raw);

      expect(fromCanonical, `Ticker not found for canonical: ${canonical}`).toBeDefined();
      expect(fromDisplay, `Ticker not found for display: ${display}`).toBeDefined();
      expect(fromRaw, `Ticker not found for raw: ${raw}`).toBeDefined();
      expect(fromCanonical?.symbol).toBe(fromRaw?.symbol);
    }
  });

  it('should produce valid multi-timeframe analysis for major pairs', () => {
    for (const canonical of MAJOR_PAIRS) {
      const ticker = findForexTicker(canonical);
      expect(ticker, `Ticker missing: ${canonical}`).toBeDefined();

      const mtf = analyzeMultiTimeframe(ticker!, ['15m', '1h', '4h']);

      // Verify analyses exist
      expect(mtf.analyses['1h']).toBeDefined();
      expect(mtf.analyses['4h']).toBeDefined();

      // ATR should be > 0 (proves candle data was available)
      expect(mtf.analyses['1h'].atr).toBeGreaterThan(0);
      expect(mtf.analyses['4h'].atr).toBeGreaterThan(0);

      // Score should be finite
      expect(Number.isFinite(mtf.aggregatedScore)).toBe(true);
    }
  });

  it('should report all pairs as analysis-available in readiness check', () => {
    const readiness = checkForexDataReadiness(MAJOR_PAIRS, ['15m', '1h', '4h']);

    for (const result of readiness.results) {
      expect(result.tickerFound, `Ticker missing: ${result.pairDisplay}`).toBe(true);
      expect(result.analysisAvailable, `Analysis unavailable: ${result.pairDisplay} — ${result.blockingReason}`).toBe(true);
    }
  });

  it('should NOT trigger G10 for major pairs in governance evaluation', () => {
    for (const canonical of MAJOR_PAIRS) {
      const proposal: TradeProposal = {
        index: 0,
        pair: canonical,
        direction: 'long',
        baseWinProbability: 0.58,
        baseWinRange: [3, 8],
        baseLossRange: [-2, -5],
      };

      const result = evaluateFullDecision(proposal, '15m', []);

      // G10 should NOT fire
      const g10 = result.triggeredGates.find(g => g.id === 'G10_ANALYSIS_UNAVAILABLE');
      expect(g10, `G10 triggered for ${canonical}: ${g10?.message}`).toBeUndefined();

      // Composite should be a real number
      expect(Number.isFinite(result.compositeScore)).toBe(true);
      expect(result.compositeScore).toBeGreaterThan(0);

      // analysisAvailable in context
      expect(result.contextSnapshot.analysisAvailable).toBe(true);
    }
  });
});
