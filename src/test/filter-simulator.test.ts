import { describe, it, expect } from 'vitest';
import {
  simulateTrades,
  computeEdgeOnlyTrades,
  createRecommendedV1,
  createConservative,
  createEmptyRuleSet,
  type FilterRuleSet,
} from '@/lib/forex/filterSimulator';
import type { NormalizedTrade } from '@/lib/forex/edgeDiscoveryEngine';

function makeTrade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    tradeId: Math.random().toString(36).slice(2),
    environment: 'backtest',
    directionSource: 'quantlabs',
    symbol: 'EUR_USD',
    direction: 'long',
    entryTs: Date.now(),
    exitTs: Date.now() + 300000,
    pnlPips: 2.0,
    spreadAtEntry: 0.00008,
    slippage: 0.1,
    compositeScore: 0.85,
    session: 'ny-overlap',
    regime: 'trending',
    agentId: 'momentum-alpha',
    mtfAlignmentScore: 0.7,
    frictionRatio: 0.4,
    volatilityPhase: 'trending',
    governanceDecision: 'approved',
    tradeMode: 'scalp',
    durationMinutes: 8,
    confidenceScore: 75,
    ...overrides,
  };
}

describe('filterSimulator', () => {
  const trades: NormalizedTrade[] = [
    makeTrade({ session: 'ny-overlap', pnlPips: 3.0 }),
    makeTrade({ session: 'rollover', pnlPips: -2.0 }),
    makeTrade({ session: 'london', symbol: 'AUD_JPY', pnlPips: -1.5 }),
    makeTrade({ session: 'asian', compositeScore: 0.60, pnlPips: -0.5 }),
    makeTrade({ session: 'ny-overlap', direction: 'short', regime: 'expansion', compositeScore: 0.70, pnlPips: -1.0 }),
    makeTrade({ session: 'london-open', compositeScore: 0.75, confidenceScore: 60, pnlPips: -0.3 }),
    makeTrade({ agentId: 'sentiment-reactor', compositeScore: 0.70, pnlPips: -0.8 }),
  ];

  it('empty rules keep all trades', () => {
    const result = simulateTrades(trades, createEmptyRuleSet());
    expect(result.keptTrades.length).toBe(trades.length);
    expect(result.removedTrades.length).toBe(0);
  });

  it('recommended v1 blocks rollover and AUD pairs', () => {
    const result = simulateTrades(trades, createRecommendedV1());
    expect(result.removedTrades.some(t => t.session === 'rollover')).toBe(true);
    expect(result.removedTrades.some(t => t.symbol === 'AUD_JPY')).toBe(true);
  });

  it('blockSessions removes matching trades', () => {
    const rules = createEmptyRuleSet();
    rules.blockSessions = ['rollover'];
    const result = simulateTrades(trades, rules);
    expect(result.keptTrades.every(t => t.session !== 'rollover')).toBe(true);
    expect(result.removedReasonCounts['blocked_session']).toBe(1);
  });

  it('minCompositeScore filters low composite', () => {
    const rules = createEmptyRuleSet();
    rules.minCompositeScore = 0.80;
    const result = simulateTrades(trades, rules);
    expect(result.keptTrades.every(t => t.compositeScore >= 0.80)).toBe(true);
  });

  it('conditional rules fire correctly', () => {
    const result = simulateTrades(trades, createRecommendedV1());
    // The short+expansion trade with composite 0.70 should be removed
    const shortExpansionRemoved = result.removedTrades.find(
      t => t.direction === 'short' && t.regime === 'expansion' && t.compositeScore < 0.75
    );
    expect(shortExpansionRemoved).toBeDefined();
  });

  it('conservative preset applies composite and spread thresholds', () => {
    const rules = createConservative();
    expect(rules.minCompositeScore).toBe(0.75);
    expect(rules.minQuantLabsConfidence).toBe(0.60);
    expect(rules.maxSpreadPips).toBe(15);
  });

  it('metrics are computed for kept and removed', () => {
    const result = simulateTrades(trades, createRecommendedV1());
    expect(result.metricsKept.trades + result.metricsRemoved.trades).toBe(trades.length);
    expect(typeof result.metricsKept.expectancy).toBe('number');
    expect(typeof result.metricsRemoved.expectancy).toBe('number');
  });
});
