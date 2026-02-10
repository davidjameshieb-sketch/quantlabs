// Tests for Long-Only Mode enforcement
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evaluateTradeProposal, type TradeProposal, type GovernanceContext } from '@/lib/forex/tradeGovernanceEngine';
import { setTradingMode, getTradingMode } from '@/lib/config/tradingMode';

// ─── Helpers ───

function makeProposal(direction: 'long' | 'short'): TradeProposal {
  return {
    index: 0,
    pair: 'EUR_USD',
    direction,
    baseWinProbability: 0.65,
    baseWinRange: [1.5, 3.0],
    baseLossRange: [-1.0, -2.0],
  };
}

function makeCleanContext(): GovernanceContext {
  return {
    mtfAlignmentScore: 85,
    htfSupports: true,
    mtfConfirms: true,
    ltfClean: true,
    volatilityPhase: 'expansion',
    phaseConfidence: 80,
    liquidityShockProb: 10,
    spreadStabilityRank: 80,
    frictionRatio: 5.0,
    pairExpectancy: 72,
    pairFavored: true,
    isMajorPair: true,
    currentSession: 'london-open',
    sessionAggressiveness: 90,
    edgeDecaying: false,
    edgeDecayRate: 0,
    overtradingThrottled: false,
    sequencingCluster: 'neutral',
    currentSpread: 0.00008,
    bid: 1.10000,
    ask: 1.10008,
    slippageEstimate: 0.1,
    totalFriction: 0.3,
    atrValue: 0.0012,
    atrAvg: 0.0011,
    priceDataAvailable: true,
    analysisAvailable: true,
  };
}

// ─── Tests ───

describe('Long-Only Mode', () => {
  beforeEach(() => {
    setTradingMode('NORMAL');
  });

  afterEach(() => {
    setTradingMode('NORMAL');
  });

  it('allows short trades when Long-Only is disabled', () => {
    setTradingMode('NORMAL');
    const result = evaluateTradeProposal(makeProposal('short'), makeCleanContext());
    // Should NOT have the long-only gate
    const hasLongOnlyGate = result.triggeredGates.some(g => g.id === 'G_STRAT_LONG_ONLY_BLOCK');
    expect(hasLongOnlyGate).toBe(false);
  });

  it('blocks short trades when Long-Only is enabled', () => {
    setTradingMode('LONG_ONLY');
    const result = evaluateTradeProposal(makeProposal('short'), makeCleanContext());
    const gate = result.triggeredGates.find(g => g.id === 'G_STRAT_LONG_ONLY_BLOCK');
    expect(gate).toBeDefined();
    expect(gate!.message).toContain('Long-only mode enabled');
    expect(result.decision).toBe('rejected');
  });

  it('allows long trades when Long-Only is enabled', () => {
    setTradingMode('LONG_ONLY');
    const result = evaluateTradeProposal(makeProposal('long'), makeCleanContext());
    const hasLongOnlyGate = result.triggeredGates.some(g => g.id === 'G_STRAT_LONG_ONLY_BLOCK');
    expect(hasLongOnlyGate).toBe(false);
    // With clean context, should be approved
    expect(result.decision).toBe('approved');
  });

  it('trading mode toggles correctly', () => {
    expect(getTradingMode()).toBe('NORMAL');
    setTradingMode('LONG_ONLY');
    expect(getTradingMode()).toBe('LONG_ONLY');
    setTradingMode('NORMAL');
    expect(getTradingMode()).toBe('NORMAL');
  });

  it('leak check: no short approval possible in Long-Only mode', () => {
    setTradingMode('LONG_ONLY');
    // Run 20 random short proposals — none should be approved
    for (let i = 0; i < 20; i++) {
      const result = evaluateTradeProposal(makeProposal('short'), makeCleanContext());
      expect(result.decision).toBe('rejected');
    }
  });
});
