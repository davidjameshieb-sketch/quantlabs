import { describe, it, expect } from 'vitest';
import {
  buildAgentScorecard, buildAllScorecards, generateRetuneProposal,
  type TradeRecord
} from '@/lib/forex/agentOptimizationEngine';
import {
  getAgentDeployment, setAgentDeploymentState, checkUnlock,
  getAgentExecutionPermission, resetAllDeployments, initializeDeployments,
  updateDeploymentMetrics
} from '@/lib/forex/agentDeploymentLadder';
import { buildEnvKeyFromRaw } from '@/lib/forex/environmentSignature';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    agent_id: 'test-agent',
    direction: 'long',
    currency_pair: 'EUR_USD',
    entry_price: 1.1000,
    exit_price: 1.1010,
    session_label: 'london-open',
    regime_label: 'expansion',
    spread_at_entry: 0.00008,
    governance_composite: 0.85,
    confidence_score: 72,
    created_at: '2026-01-15T12:00:00Z',
    ...overrides,
  };
}

function makeWinningTrade(agent: string, dir: string = 'long', pair: string = 'EUR_USD'): TradeRecord {
  const isJpy = pair.includes('JPY');
  const entry = isJpy ? 150.000 : 1.1000;
  const offset = isJpy ? 0.05 : 0.0005;
  return makeTrade({
    agent_id: agent,
    direction: dir,
    currency_pair: pair,
    entry_price: entry,
    exit_price: dir === 'long' ? entry + offset : entry - offset,
  });
}

function makeLosingTrade(agent: string, dir: string = 'short', pair: string = 'EUR_USD'): TradeRecord {
  const isJpy = pair.includes('JPY');
  const entry = isJpy ? 150.000 : 1.1000;
  const offset = isJpy ? 0.08 : 0.0008;
  return makeTrade({
    agent_id: agent,
    direction: dir,
    currency_pair: pair,
    entry_price: entry,
    exit_price: dir === 'long' ? entry - offset : entry + offset,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('agentOptimizationEngine', () => {
  describe('buildAgentScorecard', () => {
    it('correctly computes win rate and expectancy', () => {
      const trades = [
        makeWinningTrade('a1'), makeWinningTrade('a1'), makeLosingTrade('a1'),
      ];
      const sc = buildAgentScorecard('a1', trades);
      expect(sc.totalTrades).toBe(3);
      expect(sc.wins).toBe(2);
      expect(sc.winRate).toBeCloseTo(2 / 3, 2);
      expect(sc.netPips).toBeGreaterThan(0);
    });

    it('classifies profitable agent as tier A when stable', () => {
      // 60 winning trades across 3 sessions
      const sessions = ['london-open', 'ny-overlap', 'asian'];
      const trades: TradeRecord[] = [];
      for (let i = 0; i < 60; i++) {
        trades.push(makeWinningTrade('good', 'long', 'EUR_USD'));
        trades[trades.length - 1].session_label = sessions[i % 3];
        trades[trades.length - 1].created_at = new Date(Date.now() - (60 - i) * 3600000).toISOString();
      }
      const sc = buildAgentScorecard('good', trades);
      expect(sc.tier).toBe('A');
      expect(sc.profitFactor).toBeGreaterThan(1.1);
    });

    it('detects direction asymmetry', () => {
      const trades = [
        ...Array(20).fill(null).map(() => makeWinningTrade('asym', 'long')),
        ...Array(20).fill(null).map(() => makeLosingTrade('asym', 'short')),
      ];
      const sc = buildAgentScorecard('asym', trades);
      expect(sc.longNetPips).toBeGreaterThan(0);
      expect(sc.shortNetPips).toBeLessThan(0);
      expect(sc.topReasons.some(r => r.includes('direction asymmetry'))).toBe(true);
    });
  });

  describe('buildAllScorecards', () => {
    it('groups by agent and sorts by net pips', () => {
      const trades = [
        ...Array(10).fill(null).map(() => makeWinningTrade('winner')),
        ...Array(10).fill(null).map(() => makeLosingTrade('loser', 'short')),
      ];
      const cards = buildAllScorecards(trades);
      expect(cards.length).toBe(2);
      expect(cards[0].agentId).toBe('winner');
      expect(cards[1].agentId).toBe('loser');
    });
  });

  describe('generateRetuneProposal', () => {
    it('proposes blocking shorts when destructive', () => {
      const trades = [
        ...Array(30).fill(null).map(() => makeWinningTrade('fixme', 'long')),
        ...Array(200).fill(null).map(() => makeLosingTrade('fixme', 'short')),
      ];
      const sc = buildAgentScorecard('fixme', trades);
      const proposal = generateRetuneProposal(sc, trades);
      expect(proposal.rules.some(r => r.type === 'block_direction')).toBe(true);
      expect(proposal.estimatedNetPips).toBeGreaterThan(sc.netPips);
    });
  });
});

describe('agentDeploymentLadder', () => {
  beforeEach(() => resetAllDeployments());

  it('defaults to shadow state', () => {
    const dep = getAgentDeployment('new-agent');
    expect(dep.state).toBe('shadow');
  });

  it('shadow agents cannot execute', () => {
    const perm = getAgentExecutionPermission('shadow-agent');
    expect(perm.canExecute).toBe(false);
  });

  it('reduced-live agents execute at 0.35x', () => {
    setAgentDeploymentState('agent-r', 'reduced-live', 'test');
    const perm = getAgentExecutionPermission('agent-r');
    expect(perm.canExecute).toBe(true);
    expect(perm.sizeMultiplier).toBe(0.35);
  });

  it('unlock criteria checked correctly', () => {
    setAgentDeploymentState('agent-u', 'shadow', 'test');
    updateDeploymentMetrics('agent-u', {
      shadowTrades: 200,
      shadowExpectancy: 2.0,
      baselineExpectancy: 1.0,
      ddRatio: 0.5,
      profitableSessions: 4,
      daysWithoutDrift: 10,
    });
    const check = checkUnlock('agent-u');
    expect(check.canUnlock).toBe(true);
    expect(check.nextState).toBe('reduced-live');
  });

  it('unlock fails when criteria not met', () => {
    setAgentDeploymentState('agent-f', 'shadow', 'test');
    updateDeploymentMetrics('agent-f', { shadowTrades: 50 }); // below 150
    const check = checkUnlock('agent-f');
    expect(check.canUnlock).toBe(false);
    expect(check.unmetCriteria.length).toBeGreaterThan(0);
  });

  it('initializeDeployments sets correct states', () => {
    initializeDeployments(['a1'], ['b1'], ['c1'], ['d1']);
    expect(getAgentDeployment('a1').state).toBe('reduced-live');
    expect(getAgentDeployment('b1').state).toBe('shadow');
    expect(getAgentDeployment('d1').state).toBe('disabled');
  });

  it('retune rules do not bypass safety gates', () => {
    // Verify disabled agents stay disabled
    setAgentDeploymentState('blocked', 'disabled', 'test');
    const perm = getAgentExecutionPermission('blocked');
    expect(perm.canExecute).toBe(false);
    expect(perm.sizeMultiplier).toBe(0);
  });
});

describe('envKey consistency', () => {
  it('same inputs always produce same key', () => {
    const k1 = buildEnvKeyFromRaw('london-open', 'expansion', 'EUR/USD', 'long', 'carry-flow');
    const k2 = buildEnvKeyFromRaw('london-open', 'expansion', 'EUR/USD', 'long', 'carry-flow');
    expect(k1).toBe(k2);
  });

  it('keys are consistent across symbol formats', () => {
    const k1 = buildEnvKeyFromRaw('asian', 'compression', 'EUR_USD', 'short');
    const k2 = buildEnvKeyFromRaw('asian', 'compression', 'EURUSD', 'short');
    expect(k1).toBe(k2);
  });
});
