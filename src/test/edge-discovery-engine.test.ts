import { describe, it, expect } from 'vitest';
import {
  buildEnvironmentStats,
  findTopEdgeEnvironments,
  findWorstEnvironments,
  failureAttribution,
  computeMetricsSummary,
  validateOutOfSample,
  type NormalizedTrade,
} from '@/lib/forex/edgeDiscoveryEngine';

function makeTrade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    tradeId: Math.random().toString(36).slice(2),
    environment: 'backtest',
    directionSource: 'quantlabs',
    symbol: 'EUR_USD',
    direction: 'long',
    entryTs: Date.now() - Math.random() * 86400000 * 90,
    exitTs: Date.now() - Math.random() * 86400000 * 89,
    pnlPips: 2.5,
    spreadAtEntry: 0.00012,
    slippage: 0.1,
    compositeScore: 0.82,
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

function generateDataset(n: number): NormalizedTrade[] {
  const sessions = ['ny-overlap', 'london', 'asian', 'rollover'];
  const regimes = ['trending', 'ranging', 'expansion'];
  const symbols = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_JPY'];
  const dirs = ['long', 'short'] as const;

  return Array.from({ length: n }, (_, i) => {
    const session = sessions[i % sessions.length];
    const regime = regimes[i % regimes.length];
    const symbol = symbols[i % symbols.length];
    const direction = dirs[i % 2];
    // rollover and AUD_JPY lose money, others win
    const isEdge = session !== 'rollover' && symbol !== 'AUD_JPY';
    const pnl = isEdge ? 1 + Math.random() * 3 : -(0.5 + Math.random() * 4);

    return makeTrade({
      session,
      regime,
      symbol,
      direction,
      pnlPips: Math.round(pnl * 10) / 10,
      entryTs: Date.now() - (n - i) * 60000 * 30,
      exitTs: Date.now() - (n - i) * 60000 * 29,
      compositeScore: 0.6 + Math.random() * 0.3,
    });
  });
}

describe('edgeDiscoveryEngine', () => {
  const trades = generateDataset(200);

  it('computeMetricsSummary returns correct structure', () => {
    const m = computeMetricsSummary(trades);
    expect(m.trades).toBe(200);
    expect(typeof m.netPnl).toBe('number');
    expect(typeof m.winRate).toBe('number');
    expect(typeof m.expectancy).toBe('number');
    expect(typeof m.profitFactor).toBe('number');
    expect(typeof m.sharpe).toBe('number');
    expect(typeof m.maxDrawdown).toBe('number');
  });

  it('buildEnvironmentStats groups and filters by minTrades', () => {
    const stats = buildEnvironmentStats(trades, { minTrades: 5 });
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      expect(s.trades).toBeGreaterThanOrEqual(5);
      expect(['EDGE', 'NEUTRAL', '-EDGE']).toContain(s.edgeLabel);
    }
  });

  it('findTopEdgeEnvironments returns sorted positive-expectancy envs', () => {
    const stats = buildEnvironmentStats(trades, { minTrades: 5 });
    const { top } = findTopEdgeEnvironments(stats, 5);
    for (const e of top) {
      expect(e.expectancyPips).toBeGreaterThan(0);
    }
  });

  it('findWorstEnvironments returns negative-expectancy envs', () => {
    const stats = buildEnvironmentStats(trades, { minTrades: 5 });
    const worst = findWorstEnvironments(stats, 5);
    for (const e of worst) {
      expect(e.expectancyPips).toBeLessThan(0);
    }
  });

  it('failureAttribution identifies negative P&L drivers', () => {
    const drivers = failureAttribution(trades);
    expect(drivers.length).toBeGreaterThan(0);
    for (const d of drivers) {
      expect(d.totalPnl).toBeLessThan(0);
    }
    // rollover should appear as a failure
    const rolloverFailure = drivers.find(d => d.dimension === 'Session' && d.key === 'rollover');
    expect(rolloverFailure).toBeDefined();
  });

  it('validateOutOfSample splits data chronologically', () => {
    const result = validateOutOfSample(trades, 0.7, 1);
    expect(result.inSampleTrades).toBe(140);
    expect(result.outOfSampleTrades).toBe(60);
    expect(typeof result.edgeHolds).toBe('boolean');
  });
});
