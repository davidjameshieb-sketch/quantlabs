// ═══════════════════════════════════════════════════════════════
// Ensemble Health Engine — Tests
// Metrics correctness, dataset isolation, rollback triggering
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeRollingMetrics,
  computeAgentContributions,
  evaluateEnsembleRollback,
  resetEnsembleRollback,
  computeEnsembleHealth,
  exportContributionsCSV,
  exportHealthCSV,
} from '@/lib/agents/ensembleHealthEngine';
import { filterOrdersByLearnMode, OrderRecord } from '@/lib/agents/agentCollaborationEngine';

// ─── Helpers ─────────────────────────────────────────────────

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    agent_id: 'forex-macro',
    direction: 'long',
    currency_pair: 'EUR_USD',
    entry_price: 1.1000,
    exit_price: 1.1010,
    status: 'closed',
    created_at: new Date().toISOString(),
    confidence_score: 0.8,
    session_label: 'london-open',
    governance_composite: 0.75,
    environment: 'practice',
    regime_label: 'expansion',
    ...overrides,
  };
}

// ─── Rolling Metrics ─────────────────────────────────────────

describe('computeRollingMetrics', () => {
  it('computes expectancy correctly for positive trades', () => {
    const orders = Array.from({ length: 10 }, () => makeOrder());
    const m = computeRollingMetrics(orders, 20);
    expect(m.expectancy).toBeGreaterThan(0);
    expect(m.profitFactor).toBeGreaterThan(0);
    expect(m.tradeCount).toBe(10);
  });

  it('computes negative expectancy for losing trades', () => {
    const orders = Array.from({ length: 10 }, () =>
      makeOrder({ exit_price: 1.0990 })
    );
    const m = computeRollingMetrics(orders, 20);
    expect(m.expectancy).toBeLessThan(0);
  });

  it('returns zero for empty orders', () => {
    const m = computeRollingMetrics([], 20);
    expect(m.expectancy).toBe(0);
    expect(m.tradeCount).toBe(0);
  });

  it('limits to window size', () => {
    const orders = Array.from({ length: 100 }, () => makeOrder());
    const m = computeRollingMetrics(orders, 20);
    expect(m.tradeCount).toBe(20);
  });

  it('calculates max drawdown', () => {
    const orders = [
      makeOrder({ exit_price: 1.1020 }), // +20 pips
      makeOrder({ exit_price: 1.0980 }), // -20 pips
      makeOrder({ exit_price: 1.0970 }), // -30 pips
    ];
    const m = computeRollingMetrics(orders, 10);
    expect(m.maxDrawdown).toBeGreaterThan(0);
  });
});

// ─── Dataset Isolation ───────────────────────────────────────

describe('dataset isolation', () => {
  it('filters out backtest data in live+practice mode', () => {
    const orders = [
      makeOrder({ environment: 'practice' }),
      makeOrder({ environment: 'live' }),
      makeOrder({ environment: 'backtest' }),
    ];
    const filtered = filterOrdersByLearnMode(orders, 'live+practice');
    expect(filtered.length).toBe(2);
    expect(filtered.every(o => o.environment !== 'backtest')).toBe(true);
  });

  it('only includes backtest in backtest mode', () => {
    const orders = [
      makeOrder({ environment: 'practice' }),
      makeOrder({ environment: 'backtest' }),
    ];
    const filtered = filterOrdersByLearnMode(orders, 'backtest');
    expect(filtered.length).toBe(1);
    expect(filtered[0].environment).toBe('backtest');
  });

  it('excludes orders missing environment or regime', () => {
    const orders = [
      makeOrder({ environment: 'practice', regime_label: 'expansion' }),
      makeOrder({ environment: undefined, regime_label: 'expansion' }),
      makeOrder({ environment: 'practice', regime_label: undefined }),
    ];
    const filtered = filterOrdersByLearnMode(orders, 'live+practice');
    expect(filtered.length).toBe(1);
  });
});

// ─── Agent Contributions ─────────────────────────────────────

describe('computeAgentContributions', () => {
  it('computes delta expectancy per agent', () => {
    const orders = [
      ...Array.from({ length: 20 }, () => makeOrder({ agent_id: 'forex-macro', exit_price: 1.1015 })),
      ...Array.from({ length: 20 }, () => makeOrder({ agent_id: 'risk-sentinel', exit_price: 1.0995 })),
    ];
    const contribs = computeAgentContributions(orders);
    const macro = contribs.find(c => c.agentId === 'forex-macro');
    const sentinel = contribs.find(c => c.agentId === 'risk-sentinel');
    expect(macro).toBeDefined();
    expect(sentinel).toBeDefined();
    expect(macro!.deltaExpectancy).toBeGreaterThan(sentinel!.deltaExpectancy);
  });

  it('flags harmful agents with sufficient sample + high harm rate', () => {
    const orders = Array.from({ length: 35 }, () =>
      makeOrder({ agent_id: 'range-navigator', exit_price: 1.0985 })
    );
    const contribs = computeAgentContributions(orders);
    const rn = contribs.find(c => c.agentId === 'range-navigator');
    // 35 trades < 30 threshold, so not harmful (all losing but need 30+ sample)
    expect(rn).toBeDefined();
    expect(rn!.harmRate).toBeGreaterThan(0.5);
    expect(rn!.isFlaggedHarmful).toBe(true);
  });

  it('does not flag agents below minimum sample', () => {
    const orders = Array.from({ length: 5 }, () =>
      makeOrder({ agent_id: 'adaptive-learner', exit_price: 1.0985 })
    );
    const contribs = computeAgentContributions(orders);
    const al = contribs.find(c => c.agentId === 'adaptive-learner');
    expect(al).toBeDefined();
    expect(al!.isFlaggedHarmful).toBe(false);
  });
});

// ─── Rollback Logic ──────────────────────────────────────────

describe('evaluateEnsembleRollback', () => {
  beforeEach(() => resetEnsembleRollback());

  it('triggers rollback when ensemble degrades 20%+ vs baseline', () => {
    const result = evaluateEnsembleRollback(0.75, 1.0); // 25% degradation
    expect(result.active).toBe(true);
    expect(result.reason).toContain('worse');
  });

  it('does not trigger rollback for minor degradation', () => {
    const result = evaluateEnsembleRollback(0.9, 1.0); // 10% degradation
    expect(result.active).toBe(false);
  });

  it('recovers when ensemble exceeds baseline + recovery threshold', () => {
    // Trigger first
    evaluateEnsembleRollback(0.7, 1.0);
    // Recover: needs > 1.0 * 1.05 = 1.05
    const result = evaluateEnsembleRollback(1.1, 1.0);
    expect(result.active).toBe(false);
  });

  it('stays in rollback if recovery threshold not met', () => {
    evaluateEnsembleRollback(0.7, 1.0);
    // Not enough: 1.02 < 1.05
    const result = evaluateEnsembleRollback(1.02, 1.0);
    expect(result.active).toBe(true);
  });

  it('does not trigger rollback if baseline is zero', () => {
    const result = evaluateEnsembleRollback(-0.5, 0);
    expect(result.active).toBe(false);
  });
});

// ─── Full Health Snapshot ────────────────────────────────────

describe('computeEnsembleHealth', () => {
  it('produces valid rolling metrics', () => {
    const orders = Array.from({ length: 50 }, (_, i) =>
      makeOrder({
        exit_price: i % 3 === 0 ? 1.0990 : 1.1012,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      })
    );
    const health = computeEnsembleHealth(orders);
    expect(health.rolling20.tradeCount).toBeLessThanOrEqual(20);
    expect(health.rolling50.tradeCount).toBeLessThanOrEqual(50);
    expect(health.timestamp).toBeGreaterThan(0);
  });
});

// ─── CSV Export ──────────────────────────────────────────────

describe('CSV exports', () => {
  it('exportContributionsCSV produces valid CSV', () => {
    const orders = Array.from({ length: 10 }, () => makeOrder());
    const contribs = computeAgentContributions(orders);
    const csv = exportContributionsCSV(contribs);
    expect(csv).toContain('Agent,Delta Expectancy');
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });

  it('exportHealthCSV produces valid CSV', () => {
    const orders = Array.from({ length: 10 }, () => makeOrder());
    const health = computeEnsembleHealth(orders);
    const csv = exportHealthCSV(health);
    expect(csv).toContain('Window,Expectancy');
    expect(csv.split('\n').length).toBe(4); // header + 3 rows
  });
});
