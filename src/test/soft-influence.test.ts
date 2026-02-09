import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveInfluenceTier,
  passesFlipMargin,
  isBudgetExceeded,
  recordDecision,
  checkChangedTradeRollback,
  recordChangedTradeOutcome,
  resetChangedTradeTracker,
  clearSoftInfluenceDisable,
  isSoftInfluenceDisabled,
  computeAuthorityAdjustments,
  setCollaborationWeightingEnabled,
  setIndependentRoutingMode,
  clearFallback,
  SOFT_MIN_SAMPLE,
  HARD_MIN_SAMPLE,
  SOFT_CLAMP_MIN,
  SOFT_CLAMP_MAX,
  FLIP_MARGIN_MIN,
  CHANGED_TRADE_ROLLBACK_LOOKBACK,
  type InfluenceTier,
} from '@/lib/agents/agentCollaborationRouter';
import type { CollaborationSnapshot } from '@/lib/agents/agentCollaborationEngine';
import type { AgentId } from '@/lib/agents/types';

// Reset state before each test
beforeEach(() => {
  setCollaborationWeightingEnabled(true);
  setIndependentRoutingMode(false);
  clearFallback();
  clearSoftInfluenceDisable();
  resetChangedTradeTracker();
});

// ─── Tier Resolution ─────────────────────────────────────────

describe('resolveInfluenceTier', () => {
  it('returns NONE when paired trades < SOFT_MIN_SAMPLE', () => {
    expect(resolveInfluenceTier(5)).toBe('NONE');
    expect(resolveInfluenceTier(9)).toBe('NONE');
  });

  it('returns SOFT when paired trades >= 10 and < 40', () => {
    expect(resolveInfluenceTier(10)).toBe('SOFT');
    expect(resolveInfluenceTier(25)).toBe('SOFT');
    expect(resolveInfluenceTier(39)).toBe('SOFT');
  });

  it('returns HARD when paired trades >= 40', () => {
    expect(resolveInfluenceTier(40)).toBe('HARD');
    expect(resolveInfluenceTier(100)).toBe('HARD');
  });

  it('returns NONE for soft range when soft influence is disabled', () => {
    // Simulate soft disable
    for (let i = 0; i < CHANGED_TRADE_ROLLBACK_LOOKBACK; i++) {
      recordChangedTradeOutcome(0.5, 1.0); // 50% degradation
    }
    checkChangedTradeRollback();
    expect(isSoftInfluenceDisabled()).toBe(true);
    expect(resolveInfluenceTier(15)).toBe('NONE');
    // Hard still works
    expect(resolveInfluenceTier(40)).toBe('HARD');
  });
});

// ─── Soft Clamp ──────────────────────────────────────────────

describe('soft tier authority clamp', () => {
  it('clamps authority within [0.9, 1.1] for soft tier', () => {
    const snapshot: CollaborationSnapshot = {
      singleAgentStats: {
        'forex-macro': { agentId: 'forex-macro' as AgentId, soloTrades: 100, soloExpectancy: 2.0, soloWinRate: 55, soloSharpe: 1.2 },
        'session-momentum': { agentId: 'session-momentum' as AgentId, soloTrades: 80, soloExpectancy: 1.5, soloWinRate: 52, soloSharpe: 1.0 },
      },
      pairStats: [{
        agentA: 'forex-macro' as AgentId,
        agentB: 'session-momentum' as AgentId,
        pairedTrades: 15, // SOFT tier
        pairedExpectancy: 3.0,
        pairedWinRate: 60,
        pairedSharpe: 1.5,
        conflictFrequency: 0.1,
        vetoSuccessRate: 0,
        vetoPrecision: 0,
        falseVetoRate: 0,
        coApprovalProfitFactor: 2.0,
        label: 'SYNERGY',
        lastUpdated: Date.now(),
        envKeyBreakdown: {},
      }],
      driftEvents: [],
      timestamp: Date.now(),
      learnMode: 'live+practice',
    };

    const adjustments = computeAuthorityAdjustments(snapshot, ['forex-macro' as AgentId, 'session-momentum' as AgentId]);
    for (const adj of adjustments) {
      expect(adj.finalAuthority).toBeGreaterThanOrEqual(SOFT_CLAMP_MIN);
      expect(adj.finalAuthority).toBeLessThanOrEqual(SOFT_CLAMP_MAX);
      expect(adj.influenceTier).toBe('SOFT');
    }
  });
});

// ─── Flip Margin ─────────────────────────────────────────────

describe('flip margin', () => {
  it('requires minimum margin for flip', () => {
    expect(passesFlipMargin(0.52, 0.55)).toBe(true);  // margin = 0.03 >= 0.02
    expect(passesFlipMargin(0.52, 0.53)).toBe(false);  // margin = 0.01 < 0.02
    expect(passesFlipMargin(0.55, 0.52)).toBe(true);   // abs margin = 0.03 >= 0.02
  });
});

// ─── Influence Budget ────────────────────────────────────────

describe('influence budget', () => {
  it('does not exceed 10% flips per day', () => {
    // Record 10 decisions, 0 flipped - not exceeded
    for (let i = 0; i < 10; i++) recordDecision(false);
    expect(isBudgetExceeded()).toBe(false);

    // Now flip one more → 1/11 ≈ 9% < 10%, still ok
    recordDecision(true);
    expect(isBudgetExceeded()).toBe(false);

    // Flip another → 2/12 ≈ 16.7% > 10%, exceeded
    recordDecision(true);
    expect(isBudgetExceeded()).toBe(true);
  });
});

// ─── Changed-Trade Rollback ──────────────────────────────────

describe('changed-trade safety rollback', () => {
  it('disables soft influence when changed trades underperform by 20%+', () => {
    // Record 50 changed trades where changed expectancy is 50% worse than baseline
    for (let i = 0; i < CHANGED_TRADE_ROLLBACK_LOOKBACK; i++) {
      recordChangedTradeOutcome(0.4, 1.0);
    }
    const triggered = checkChangedTradeRollback();
    expect(triggered).toBe(true);
    expect(isSoftInfluenceDisabled()).toBe(true);
  });

  it('does NOT disable when changed trades perform well', () => {
    for (let i = 0; i < CHANGED_TRADE_ROLLBACK_LOOKBACK; i++) {
      recordChangedTradeOutcome(1.2, 1.0); // changed is better
    }
    const triggered = checkChangedTradeRollback();
    expect(triggered).toBe(false);
    expect(isSoftInfluenceDisabled()).toBe(false);
  });

  it('does NOT trigger with insufficient sample', () => {
    for (let i = 0; i < 10; i++) {
      recordChangedTradeOutcome(0.1, 1.0);
    }
    const triggered = checkChangedTradeRollback();
    expect(triggered).toBe(false);
  });
});

// ─── Hard tier unchanged ─────────────────────────────────────

describe('hard tier unchanged', () => {
  it('still requires minSample >= 40 for PREDICTIVE-VETO', () => {
    expect(resolveInfluenceTier(39)).not.toBe('HARD');
    expect(resolveInfluenceTier(40)).toBe('HARD');
  });
});
