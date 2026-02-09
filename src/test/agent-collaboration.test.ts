import { describe, it, expect } from 'vitest';
import {
  computeAgentCollaborationScore,
  filterOrdersByLearnMode,
  type OrderRecord,
} from '@/lib/agents/agentCollaborationEngine';
import {
  computeAuthorityAdjustments,
  checkFallbackTrigger,
  isFallbackActive,
  clearFallback,
  computeWeightedVote,
  computeBaselineVote,
  createCollaborationDecisionLog,
  setCollaborationWeightingEnabled,
  setIndependentRoutingMode,
  getCollaborationSafetyState,
  type CollaborationSafetyState,
} from '@/lib/agents/agentCollaborationRouter';
import { buildEnvKeyFromRaw } from '@/lib/forex/environmentSignature';
import type { CollaborationSnapshot, AgentPairStats, SingleAgentStats } from '@/lib/agents/agentCollaborationEngine';
import type { AgentId } from '@/lib/agents/types';

// ─── envKey consistency ──────────────────────────────────────

describe('envKey consistency', () => {
  it('builds deterministic keys from same inputs', () => {
    const k1 = buildEnvKeyFromRaw('ny-overlap', 'expansion', 'EUR/USD', 'LONG', 'forex-macro');
    const k2 = buildEnvKeyFromRaw('ny-overlap', 'expansion', 'EUR/USD', 'LONG', 'forex-macro');
    expect(k1).toBe(k2);
  });

  it('normalizes symbol format (EUR/USD vs EURUSD)', () => {
    const k1 = buildEnvKeyFromRaw('asian', 'compression', 'EUR/USD', 'SHORT');
    const k2 = buildEnvKeyFromRaw('asian', 'compression', 'EURUSD', 'SHORT');
    expect(k1).toBe(k2);
  });

  it('normalizes session aliases', () => {
    const k1 = buildEnvKeyFromRaw('london', 'ignition', 'GBPUSD', 'LONG');
    const k2 = buildEnvKeyFromRaw('london-open', 'ignition', 'GBPUSD', 'LONG');
    expect(k1).toBe(k2);
  });
});

// ─── Environment filter (learnMode) ─────────────────────────

describe('filterOrdersByLearnMode', () => {
  const orders: OrderRecord[] = [
    { agent_id: 'forex-macro', direction: 'long', currency_pair: 'EURUSD', entry_price: 1.1, exit_price: 1.101, status: 'closed', created_at: '2025-01-01', confidence_score: 0.8, session_label: 'ny-overlap', governance_composite: 0.85, environment: 'practice', regime_label: 'expansion' },
    { agent_id: 'forex-macro', direction: 'long', currency_pair: 'EURUSD', entry_price: 1.1, exit_price: 1.101, status: 'closed', created_at: '2025-01-01', confidence_score: 0.8, session_label: 'ny-overlap', governance_composite: 0.85, environment: 'backtest', regime_label: 'compression' },
    { agent_id: 'forex-macro', direction: 'long', currency_pair: 'EURUSD', entry_price: 1.1, exit_price: 1.101, status: 'closed', created_at: '2025-01-01', confidence_score: 0.8, session_label: 'ny-overlap', governance_composite: 0.85, environment: 'live', regime_label: 'ignition' },
  ];

  it('filters to live+practice by default', () => {
    const result = filterOrdersByLearnMode(orders);
    expect(result.length).toBe(2);
    expect(result.every(o => o.environment !== 'backtest')).toBe(true);
  });

  it('shows only backtest in backtest mode', () => {
    const result = filterOrdersByLearnMode(orders, 'backtest');
    expect(result.length).toBe(1);
    expect(result[0].environment).toBe('backtest');
  });

  it('shows all in all mode', () => {
    expect(filterOrdersByLearnMode(orders, 'all').length).toBe(3);
  });
});

// ─── Veto classification ────────────────────────────────────

describe('veto classification rules', () => {
  it('classifies PREDICTIVE-VETO when precision >= 60% and falseVeto <= 40%', () => {
    const label = computeAgentCollaborationScore(
      { pairedExpectancy: 2.0, pairedTrades: 50, vetoPrecision: 0.65, falseVetoRate: 0.35, vetoSuccessRate: 0.65 },
      1.5,
    );
    expect(label).toBe('PREDICTIVE-VETO');
  });

  it('does NOT classify PREDICTIVE-VETO when false-veto rate > 40%', () => {
    const label = computeAgentCollaborationScore(
      { pairedExpectancy: 2.0, pairedTrades: 50, vetoPrecision: 0.65, falseVetoRate: 0.50, vetoSuccessRate: 0.65 },
      1.5,
    );
    expect(label).not.toBe('PREDICTIVE-VETO');
  });

  it('does NOT classify PREDICTIVE-VETO when precision < 60%', () => {
    const label = computeAgentCollaborationScore(
      { pairedExpectancy: 2.0, pairedTrades: 50, vetoPrecision: 0.50, falseVetoRate: 0.30, vetoSuccessRate: 0.50 },
      1.5,
    );
    expect(label).not.toBe('PREDICTIVE-VETO');
  });

  it('requires minimum 40 paired trades', () => {
    const label = computeAgentCollaborationScore(
      { pairedExpectancy: 5.0, pairedTrades: 30, vetoPrecision: 0.90, falseVetoRate: 0.10, vetoSuccessRate: 0.90 },
      1.0,
    );
    expect(label).toBe('INSUFFICIENT_DATA');
  });
});

// ─── Velocity clamp ─────────────────────────────────────────

describe('velocity clamp on authority', () => {
  it('clamps authority within [0.1, 2.0]', () => {
    // Reset state
    setCollaborationWeightingEnabled(true);
    setIndependentRoutingMode(false);
    clearFallback();

    const snapshot: CollaborationSnapshot = {
      singleAgentStats: {
        'forex-macro': { agentId: 'forex-macro' as AgentId, soloTrades: 100, soloExpectancy: 2.0, soloWinRate: 55, soloSharpe: 1.2 },
      },
      pairStats: [],
      driftEvents: [],
      timestamp: Date.now(),
      learnMode: 'live+practice',
    };

    const adjustments = computeAuthorityAdjustments(snapshot, ['forex-macro' as AgentId]);
    expect(adjustments[0].finalAuthority).toBeGreaterThanOrEqual(0.1);
    expect(adjustments[0].finalAuthority).toBeLessThanOrEqual(2.0);
  });
});

// ─── Fallback disable trigger ───────────────────────────────

describe('fallback disable trigger', () => {
  it('triggers fallback when weighted expectancy is 20%+ worse than baseline', () => {
    clearFallback();
    const triggered = checkFallbackTrigger(0.8, 1.1);
    // degradation = (1.1 - 0.8) / 1.1 ≈ 27% > 20%
    expect(triggered).toBe(true);
    expect(isFallbackActive()).toBe(true);
  });

  it('does not trigger when degradation is under 20%', () => {
    clearFallback();
    const triggered = checkFallbackTrigger(0.95, 1.1);
    // degradation ≈ 13.6% < 20%
    expect(triggered).toBe(false);
    expect(isFallbackActive()).toBe(false);
  });

  it('does not trigger on zero/negative baseline', () => {
    clearFallback();
    const triggered = checkFallbackTrigger(0.5, -1.0);
    expect(triggered).toBe(false);
  });
});

// ─── Routing outcome changes ────────────────────────────────

describe('routing outcome changes', () => {
  it('detects when collaboration changes vote outcome', () => {
    clearFallback();
    setCollaborationWeightingEnabled(true);
    setIndependentRoutingMode(false);

    const agents: AgentId[] = ['forex-macro' as AgentId, 'session-momentum' as AgentId];
    const confidences: Record<string, number> = { 'forex-macro': 0.7, 'session-momentum': 0.4 };

    const snapshot: CollaborationSnapshot = {
      singleAgentStats: {
        'forex-macro': { agentId: 'forex-macro' as AgentId, soloTrades: 100, soloExpectancy: 3.0, soloWinRate: 60, soloSharpe: 1.5 },
        'session-momentum': { agentId: 'session-momentum' as AgentId, soloTrades: 80, soloExpectancy: 1.0, soloWinRate: 50, soloSharpe: 0.8 },
      },
      pairStats: [{
        agentA: 'forex-macro' as AgentId,
        agentB: 'session-momentum' as AgentId,
        pairedTrades: 60,
        pairedExpectancy: 0.5,
        pairedWinRate: 40,
        pairedSharpe: 0.3,
        conflictFrequency: 0.7,
        vetoSuccessRate: 0.3,
        vetoPrecision: 0.3,
        falseVetoRate: 0.7,
        coApprovalProfitFactor: 0.6,
        label: 'CONFLICT',
        lastUpdated: Date.now(),
        envKeyBreakdown: {},
      }],
      driftEvents: [],
      timestamp: Date.now(),
      learnMode: 'live+practice',
    };

    const log = createCollaborationDecisionLog(agents, snapshot, computeAuthorityAdjustments(snapshot, agents), confidences);

    // Log should contain both baseline and weighted outcomes
    expect(log.baselineVotingResult).not.toBeNull();
    expect(log.weightedVotingResult).not.toBeNull();
    expect(typeof log.outcomeChanged).toBe('boolean');
    expect(log.finalDecisionReason.length).toBeGreaterThan(0);
    expect(log.topCollaborationFactors).toBeDefined();
  });
});
