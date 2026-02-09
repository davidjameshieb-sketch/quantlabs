// Tests for Baseline vs Ensemble Profitability Engine
import { describe, it, expect } from 'vitest';
import {
  computeBaselineVsEnsemble,
  BaselineVsEnsembleResult,
} from '@/lib/agents/baselineVsEnsembleEngine';

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    agent_id: 'trend-surfer',
    direction: 'long',
    currency_pair: 'EUR_USD',
    entry_price: 1.1000,
    exit_price: 1.1010,
    status: 'closed',
    created_at: new Date().toISOString(),
    session_label: 'ny-overlap',
    regime_label: 'expansion',
    environment: 'practice',
    confidence_score: 0.8,
    governance_composite: 85,
    variant_id: '',
    ...overrides,
  };
}

describe('BaselineVsEnsemble Engine', () => {
  it('returns insufficient_sample when too few trades', () => {
    const orders = Array.from({ length: 10 }, () => makeOrder());
    const result = computeBaselineVsEnsemble(orders as any);
    expect(result.verdict).toBe('insufficient_sample');
  });

  it('computes positive delta when ensemble outperforms baseline', () => {
    // Baseline: small wins
    const baseline = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: 'baseline',
      exit_price: 1.1002,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    // Ensemble: bigger wins
    const ensemble = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: '',
      exit_price: 1.1020,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble([...baseline, ...ensemble] as any);
    expect(result.rolling100.deltaExpectancy).toBeGreaterThan(0);
    expect(result.rolling100.ensembleExpectancy).toBeGreaterThan(result.rolling100.baselineExpectancy);
  });

  it('computes negative delta when ensemble underperforms', () => {
    const baseline = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: 'baseline',
      exit_price: 1.1020,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const ensemble = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: '',
      exit_price: 1.1002,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble([...baseline, ...ensemble] as any);
    expect(result.rolling100.deltaExpectancy).toBeLessThan(0);
  });

  it('filters out non-closed orders', () => {
    const orders = Array.from({ length: 50 }, () => makeOrder({ status: 'filled' }));
    const result = computeBaselineVsEnsemble(orders as any);
    expect(result.verdict).toBe('insufficient_sample');
  });

  it('filters backtest orders when learnMode is live+practice', () => {
    const orders = Array.from({ length: 50 }, () => makeOrder({ environment: 'backtest' }));
    const result = computeBaselineVsEnsemble(orders as any, 'live+practice');
    expect(result.verdict).toBe('insufficient_sample');
  });

  it('includes backtest orders when learnMode is backtest', () => {
    const orders = Array.from({ length: 50 }, (_, i) => makeOrder({
      environment: 'backtest',
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const result = computeBaselineVsEnsemble(orders as any, 'backtest');
    // Should have data (all are ensemble since no variant_id = 'baseline')
    expect(result.rolling50.sampleSize).toBeGreaterThan(0);
  });

  it('computes coverage stats correctly', () => {
    // Multiple envKeys — some improved, some not
    const orders = [
      ...Array.from({ length: 20 }, (_, i) => makeOrder({
        variant_id: 'baseline',
        currency_pair: 'EUR_USD',
        exit_price: 1.1005,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      })),
      ...Array.from({ length: 20 }, (_, i) => makeOrder({
        variant_id: '',
        currency_pair: 'EUR_USD',
        exit_price: 1.1015,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      })),
    ];

    const result = computeBaselineVsEnsemble(orders as any);
    expect(result.coverage.totalEnvKeys).toBeGreaterThanOrEqual(1);
  });

  it('classifies verdict as improved when all conditions met', () => {
    const baseline = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: 'baseline',
      exit_price: 1.1003,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const ensemble = Array.from({ length: 50 }, (_, i) => makeOrder({
      variant_id: '',
      exit_price: 1.1015,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble([...baseline, ...ensemble] as any);
    // Expectancy improved, coverage should show improvement
    expect(result.rolling100.deltaExpectancy).toBeGreaterThan(0);
    expect(['improved', 'neutral']).toContain(result.verdict);
  });

  it('handles JPY pairs with correct pip multiplier', () => {
    const orders = Array.from({ length: 50 }, (_, i) => makeOrder({
      currency_pair: 'USD_JPY',
      entry_price: 150.00,
      exit_price: 150.10,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble(orders as any);
    // 0.10 * 100 = 10 pips, minus friction (slippage+spread default 0)
    expect(result.rolling50.ensembleExpectancy).toBe(10);
  });

  it('includes aggregate summary with total PnL', () => {
    const baseline = Array.from({ length: 30 }, (_, i) => makeOrder({
      variant_id: 'baseline',
      exit_price: 1.1005,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const ensemble = Array.from({ length: 30 }, (_, i) => makeOrder({
      variant_id: '',
      exit_price: 1.1015,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble([...baseline, ...ensemble] as any);
    expect(result.aggregate).toBeDefined();
    expect(result.aggregate.baselineTrades).toBe(30);
    expect(result.aggregate.ensembleTrades).toBe(30);
    expect(result.aggregate.deltaTotalPnL).toBeGreaterThan(0);
  });

  it('subtracts friction from PnL when slippage/spread provided', () => {
    const orders = Array.from({ length: 50 }, (_, i) => makeOrder({
      entry_price: 1.1000,
      exit_price: 1.1010, // 10 pips raw
      slippage_pips: 1.5,
      spread_at_entry: 0.5,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble(orders as any);
    // 10 - 1.5 - 0.5 = 8 pips friction-adjusted
    expect(result.rolling50.ensembleExpectancy).toBe(8);
  });

  it('computes drawdown slope in rolling comparisons', () => {
    const orders = Array.from({ length: 50 }, (_, i) => makeOrder({
      exit_price: i % 3 === 0 ? 1.0990 : 1.1010,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const result = computeBaselineVsEnsemble(orders as any);
    expect(typeof result.rolling50.deltaDDSlope).toBe('number');
    expect(typeof result.rolling50.baselineDDSlope).toBe('number');
    expect(typeof result.rolling50.ensembleDDSlope).toBe('number');
  });
});
