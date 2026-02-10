// Tests for USD_CAD Learning & Convergence Engine
import { describe, it, expect } from 'vitest';
import {
  computePips,
  computeValidPF,
  computeWindowMetrics,
  computeConvergence,
  computeLearningStatus,
  computeScaleGates,
  computeProfitSuggestions,
  computeLearningTag,
  buildDecisionEvents,
  type UsdCadDecisionEvent,
} from '@/lib/forex/usdCadLearningEngine';

// ─── Helper ───────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<UsdCadDecisionEvent> = {}): UsdCadDecisionEvent {
  return {
    id: 'test-1',
    timestamp: Date.now(),
    accountType: 'live',
    sessionLabel: 'london',
    envKey: 'london|tight|trending',
    governanceScore: 80,
    edgeScore: 60,
    compositeScore: 80,
    stabilityScore: 50,
    stabilityTrend: 0,
    expectancySlope: 0,
    frictionDrag: 1.0,
    execQuality: 70,
    finalDecision: 'ENTER',
    blockingGovernor: 'none',
    agentVotes: [{ agentId: 'agent-a', vote: 'long', confidence: 70 }],
    coalitionId: null,
    tradeId: null,
    pips: 2.5,
    winLoss: 'win',
    maxDDpips: null,
    realizedFriction: null,
    ...overrides,
  };
}

// ─── Pip Math ─────────────────────────────────────────────────────────

describe('USD_CAD Pip Math', () => {
  it('computes non-JPY pips correctly', () => {
    // 0.0020 * 10000 = 20 pips
    expect(computePips(1.3500, 1.3520, 'USD_CAD', 'long')).toBeCloseTo(20.0, 0);
  });

  it('computes JPY pips correctly', () => {
    expect(computePips(150.00, 150.50, 'USD_JPY', 'long')).toBeCloseTo(50, 1);
  });

  it('computes short pips correctly', () => {
    // (1.3520 - 1.3500) * 10000 = 20 pips
    expect(computePips(1.3520, 1.3500, 'USD_CAD', 'short')).toBeCloseTo(20.0, 0);
  });
});

// ─── PF Validity Guard ───────────────────────────────────────────────

describe('PF Validity Guard', () => {
  it('returns null when gross loss is zero', () => {
    expect(computeValidPF(100, 0)).toBeNull();
  });

  it('returns null when gross loss is below epsilon', () => {
    expect(computeValidPF(100, 0.00005)).toBeNull();
  });

  it('returns valid PF for normal values', () => {
    expect(computeValidPF(200, 100)).toBeCloseTo(2.0, 2);
  });
});

// ─── Window Metrics ───────────────────────────────────────────────────

describe('Window Metrics', () => {
  it('computes correct expectancy', () => {
    const events = [
      makeEvent({ pips: 3.0 }),
      makeEvent({ pips: -1.0 }),
      makeEvent({ pips: 2.0 }),
    ];
    const m = computeWindowMetrics(events);
    expect(m.expectancy).toBeCloseTo(4.0 / 3, 2);
    expect(m.winRate).toBeCloseTo(2 / 3, 2);
    expect(m.trades).toBe(3);
  });

  it('handles empty events', () => {
    const m = computeWindowMetrics([]);
    expect(m.trades).toBe(0);
    expect(m.expectancy).toBe(0);
    expect(m.pf).toBeNull();
  });

  it('computes decision distribution', () => {
    const events = [
      makeEvent({ finalDecision: 'ENTER' }),
      makeEvent({ finalDecision: 'ENTER' }),
      makeEvent({ finalDecision: 'BLOCKED' }),
    ];
    const m = computeWindowMetrics(events);
    expect(m.decisionDistribution.enter).toBe(2);
    expect(m.decisionDistribution.blocked).toBe(1);
  });
});

// ─── Convergence ──────────────────────────────────────────────────────

describe('Convergence', () => {
  it('returns null when insufficient events', () => {
    const events = Array.from({ length: 30 }, () => makeEvent());
    expect(computeConvergence(events, 50)).toBeNull();
  });

  it('computes convergence when enough events', () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent({ pips: i < 50 ? 1.0 : 2.0 })
    );
    const conv = computeConvergence(events, 50);
    expect(conv).not.toBeNull();
    expect(conv!.current.expectancy).toBe(2.0);
    expect(conv!.previous.expectancy).toBe(1.0);
    expect(conv!.improving).toBe(true);
  });
});

// ─── Scale Gates ──────────────────────────────────────────────────────

describe('Scale Gates', () => {
  it('blocks scaling with insufficient sample', () => {
    const events = Array.from({ length: 10 }, () => makeEvent({ pips: 2.0 }));
    const { gates, allowed } = computeScaleGates(events);
    const sampleGate = gates.find(g => g.label.includes('Sample size'));
    expect(sampleGate?.passed).toBe(false);
    expect(allowed).toBe(false);
  });

  it('blocks when expectancy negative', () => {
    const events = Array.from({ length: 50 }, () => makeEvent({ pips: -1.0, winLoss: 'loss' }));
    const { gates } = computeScaleGates(events);
    const expGate = gates.find(g => g.label.includes('Expectancy'));
    expect(expGate?.passed).toBe(false);
  });
});

// ─── Learning Status ──────────────────────────────────────────────────

describe('Learning Status', () => {
  it('detects observation learning from recent events', () => {
    const events = [makeEvent({ timestamp: Date.now() - 1000 })];
    const status = computeLearningStatus(events);
    expect(status.observationLearning).toBe(true);
    expect(status.decisionsAnalyzed24h).toBe(1);
  });

  it('detects counterfactual learning from blocked events', () => {
    const events = [makeEvent({ finalDecision: 'BLOCKED' })];
    const status = computeLearningStatus(events);
    expect(status.counterfactualLearning).toBe(true);
  });
});

// ─── USD_CAD Only Enforcement ─────────────────────────────────────────

describe('USD_CAD Only Enforcement', () => {
  it('filters out non-USD_CAD pairs', () => {
    const orders = [
      { id: '1', currency_pair: 'USD_CAD', direction: 'long', entry_price: 1.35, exit_price: 1.352, created_at: new Date().toISOString(), environment: 'live', status: 'filled' },
      { id: '2', currency_pair: 'EUR_USD', direction: 'long', entry_price: 1.08, exit_price: 1.082, created_at: new Date().toISOString(), environment: 'live', status: 'filled' },
      { id: '3', currency_pair: 'GBP_JPY', direction: 'long', entry_price: 188.0, exit_price: 188.5, created_at: new Date().toISOString(), environment: 'live', status: 'filled' },
    ];
    const events = buildDecisionEvents(orders);
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('1');
  });
});

// ─── Learning Tags ────────────────────────────────────────────────────

describe('Learning Tags', () => {
  it('tags blocked events correctly', () => {
    const tag = computeLearningTag(makeEvent({ finalDecision: 'BLOCKED' }), []);
    expect(tag).toBe('Blocked correctly');
  });

  it('tags high friction events', () => {
    const tag = computeLearningTag(makeEvent({ frictionDrag: 5.0 }), []);
    expect(tag).toBe('Friction high');
  });

  it('tags strong edge', () => {
    const tag = computeLearningTag(makeEvent({ pips: 3.0 }), []);
    expect(tag).toBe('Strong edge');
  });
});

// ─── Profit Suggestions ──────────────────────────────────────────────

describe('Profit Suggestions', () => {
  it('returns no suggestions for tiny sample', () => {
    const events = Array.from({ length: 5 }, () => makeEvent());
    expect(computeProfitSuggestions(events).length).toBe(0);
  });

  it('generates suggestions for sufficient data', () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      makeEvent({
        pips: i % 3 === 0 ? -2.0 : 1.5,
        winLoss: i % 3 === 0 ? 'loss' : 'win',
        frictionDrag: i % 5 === 0 ? 5.0 : 1.0,
        sessionLabel: i % 2 === 0 ? 'london' : 'asian',
      })
    );
    const suggestions = computeProfitSuggestions(events);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});
