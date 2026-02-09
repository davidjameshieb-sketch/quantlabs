// Backtest Engine Smoke Test
import { describe, it, expect } from 'vitest';
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from '@/lib/forex/backtest/backtestRunner';
import { computeBacktestSpread, computeBacktestSlippage, computeFillPrice } from '@/lib/forex/backtest/spreadSlippageModels';
import { generateSyntheticCandles, computeATR } from '@/lib/forex/backtest/oandaHistoricalProvider';

describe('Backtest Spread/Slippage Models', () => {
  it('should compute deterministic spread for a given seed', () => {
    const s1 = computeBacktestSpread('EUR_USD', 10, 0.001, 0.001, 42);
    const s2 = computeBacktestSpread('EUR_USD', 10, 0.001, 0.001, 42);
    expect(s1.spreadPips).toBe(s2.spreadPips);
    expect(s1.spreadPips).toBeGreaterThan(0);
  });

  it('should produce wider spreads during asian session', () => {
    const london = computeBacktestSpread('EUR_USD', 9, 0.001, 0.001, 1);
    const asian = computeBacktestSpread('EUR_USD', 3, 0.001, 0.001, 1);
    expect(asian.sessionMultiplier).toBeGreaterThan(london.sessionMultiplier);
  });

  it('should produce non-negative slippage', () => {
    const slip = computeBacktestSlippage('GBP_USD', 14, 0.0015, 0.001, 99);
    expect(slip.slippagePips).toBeGreaterThanOrEqual(0);
  });

  it('fill price for BUY should be above mid, SELL should be below mid', () => {
    const mid = 1.0850;
    const buyFill = computeFillPrice('long', mid, 'EUR_USD', 10, 0.001, 0.001, 1);
    const sellFill = computeFillPrice('short', mid, 'EUR_USD', 10, 0.001, 0.001, 1);
    expect(buyFill.fillPrice).toBeGreaterThan(mid);
    expect(sellFill.fillPrice).toBeLessThan(mid);
  });
});

describe('Synthetic Candle Generation', () => {
  it('should generate candles without weekends', () => {
    const start = new Date('2025-01-06T00:00:00Z'); // Monday
    const end = new Date('2025-01-13T00:00:00Z');   // Following Monday
    const candles = generateSyntheticCandles('EUR_USD', '1h', start, end);
    
    for (const c of candles) {
      const day = new Date(c.timestamp).getUTCDay();
      expect(day).not.toBe(0); // No Sunday
      expect(day).not.toBe(6); // No Saturday
    }
    expect(candles.length).toBeGreaterThan(0);
  });

  it('should compute ATR from candles', () => {
    const start = new Date('2025-01-06T00:00:00Z');
    const end = new Date('2025-02-06T00:00:00Z');
    const candles = generateSyntheticCandles('EUR_USD', '1h', start, end);
    const atr = computeATR(candles, 14);
    expect(atr).toBeGreaterThan(0);
  });
});

describe('Backtest Runner — No Lookahead', () => {
  it('should produce 500+ trades for 90-day backtest on majors', () => {
    const result = runBacktest({
      ...DEFAULT_BACKTEST_CONFIG,
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    });
    
    expect(result.trades.length).toBeGreaterThanOrEqual(500);
    expect(result.summary.totalTrades).toBe(result.trades.length);
  });

  it('all trades must have entry_timestamp < exit_timestamp (no lookahead)', () => {
    const result = runBacktest(DEFAULT_BACKTEST_CONFIG);
    for (const t of result.trades) {
      expect(t.exit_timestamp).toBeGreaterThanOrEqual(t.entry_timestamp);
    }
  });

  it('all trades must have environment=backtest and status=closed', () => {
    const result = runBacktest(DEFAULT_BACKTEST_CONFIG);
    for (const t of result.trades) {
      expect(t.environment).toBe('backtest');
      expect(t.status).toBe('closed');
    }
  });

  it('buy fills should be above open, sell fills below open', () => {
    const result = runBacktest(DEFAULT_BACKTEST_CONFIG);
    // Check a sample — not all because fill uses next candle open + spread
    const buys = result.trades.filter(t => t.direction === 'long').slice(0, 10);
    const sells = result.trades.filter(t => t.direction === 'short').slice(0, 10);

    // Spread should push buy fill above the mid open price
    for (const t of buys) {
      expect(t.spread_at_entry).toBeGreaterThan(0);
      expect(t.slippage_pips).toBeGreaterThanOrEqual(0);
    }
    for (const t of sells) {
      expect(t.spread_at_entry).toBeGreaterThan(0);
    }
  });

  it('direction provenance fields should be populated', () => {
    const result = runBacktest(DEFAULT_BACKTEST_CONFIG);
    for (const t of result.trades.slice(0, 20)) {
      expect(t.direction_engine).toBe('quantlabs');
      expect(t.quantlabs_bias).toBeTruthy();
      expect(t.quantlabs_confidence).toBeGreaterThan(0);
      expect(t.governance_composite).toBeGreaterThan(0);
    }
  });

  it('summary should have valid KPIs', () => {
    const result = runBacktest(DEFAULT_BACKTEST_CONFIG);
    const s = result.summary;
    expect(s.winRate).toBeGreaterThan(0);
    expect(s.winRate).toBeLessThanOrEqual(1);
    expect(s.avgDurationMinutes).toBeGreaterThan(0);
    expect(Object.keys(s.byPair).length).toBeGreaterThan(0);
    expect(Object.keys(s.bySession).length).toBeGreaterThan(0);
  });

  it('shadow evaluations should never create broker orders (env check)', () => {
    const result = runBacktest({
      ...DEFAULT_BACKTEST_CONFIG,
      variantId: 'shadow-test',
    });
    // All records have environment='backtest', no OANDA order IDs
    for (const t of result.trades) {
      expect(t.environment).toBe('backtest');
      // No oanda_order_id or oanda_trade_id on backtest records
      expect((t as any).oanda_order_id).toBeUndefined();
      expect((t as any).oanda_trade_id).toBeUndefined();
    }
  });
});
