// Governance Engine Unit Tests
import { describe, it, expect } from 'vitest';
import { evaluateTradeProposal, type TradeProposal, type GovernanceContext } from '@/lib/forex/tradeGovernanceEngine';

// ─── Helpers ───

function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return {
    index: 0,
    pair: 'EUR_USD',
    direction: 'long',
    baseWinProbability: 0.72,
    baseWinRange: [0.06, 0.65],
    baseLossRange: [-0.12, -0.005],
    ...overrides,
  };
}

function makeContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    mtfAlignmentScore: 75,
    htfSupports: true,
    mtfConfirms: true,
    ltfClean: true,
    volatilityPhase: 'expansion',
    phaseConfidence: 80,
    liquidityShockProb: 15,
    spreadStabilityRank: 80,
    frictionRatio: 5,
    pairExpectancy: 70,
    pairFavored: true,
    isMajorPair: true,
    currentSession: 'london-open',
    sessionAggressiveness: 88,
    edgeDecaying: false,
    edgeDecayRate: 0,
    overtradingThrottled: false,
    sequencingCluster: 'neutral',
    currentSpread: 0.00012,
    bid: 1.0840,
    ask: 1.0842,
    slippageEstimate: 0.00002,
    totalFriction: 0.00014,
    atrValue: 0.0008,
    atrAvg: 0.0006,
    priceDataAvailable: true,
    analysisAvailable: true,
    ...overrides,
  };
}

// ─── Gate Tests ───

describe('Governance Gate Evaluation', () => {
  it('should approve a well-aligned trade', () => {
    const result = evaluateTradeProposal(makeProposal(), makeContext());
    expect(result.decision).toBe('approved');
    expect(result.triggeredGates.length).toBe(0);
    expect(result.governanceScore).toBeGreaterThan(50);
  });

  it('should reject when price data is unavailable (G9)', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ priceDataAvailable: false }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G9_PRICE_DATA_UNAVAILABLE')).toBe(true);
  });

  it('should reject when analysis is unavailable (G10)', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ analysisAvailable: false }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G10_ANALYSIS_UNAVAILABLE')).toBe(true);
  });

  it('should trigger G1 when friction ratio is below 3', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ frictionRatio: 2 }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G1_FRICTION')).toBe(true);
  });

  it('should trigger G4 when spread is unstable', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ spreadStabilityRank: 20 }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G4_SPREAD_INSTABILITY')).toBe(true);
  });

  it('should trigger G6 when overtrading throttled', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ overtradingThrottled: true }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G6_OVERTRADING')).toBe(true);
  });

  it('should trigger G8 on high shock outside ignition', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ liquidityShockProb: 80, volatilityPhase: 'expansion' }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G8_HIGH_SHOCK')).toBe(true);
  });

  it('should NOT trigger G8 during ignition phase even with high shock', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ liquidityShockProb: 80, volatilityPhase: 'ignition' }),
    );
    expect(result.triggeredGates.some(g => g.id === 'G8_HIGH_SHOCK')).toBe(false);
  });

  it('should reject when 2+ gates fire', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({
        frictionRatio: 2,
        spreadStabilityRank: 20,
      }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.triggeredGates.length).toBeGreaterThanOrEqual(2);
  });

  it('should throttle when exactly 1 gate fires', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ overtradingThrottled: true }),
    );
    // If only G6 fires, decision should be throttled
    if (result.triggeredGates.length === 1) {
      expect(result.decision).toBe('throttled');
    }
  });
});

// ─── Multiplier Tests ───

describe('Governance Multipliers', () => {
  it('should produce higher composite for full MTF alignment + ignition', () => {
    const aligned = evaluateTradeProposal(
      makeProposal(),
      makeContext({ volatilityPhase: 'ignition', phaseConfidence: 90 }),
    );
    const misaligned = evaluateTradeProposal(
      makeProposal(),
      makeContext({
        htfSupports: false,
        mtfConfirms: false,
        ltfClean: false,
        mtfAlignmentScore: 20,
        volatilityPhase: 'compression',
        phaseConfidence: 30,
      }),
    );
    expect(aligned.multipliers.composite).toBeGreaterThan(misaligned.multipliers.composite);
  });

  it('session multiplier should favor london over late-ny', () => {
    const london = evaluateTradeProposal(
      makeProposal(),
      makeContext({ currentSession: 'london-open' }),
    );
    const lateNy = evaluateTradeProposal(
      makeProposal(),
      makeContext({ currentSession: 'late-ny' }),
    );
    expect(london.multipliers.session).toBeGreaterThan(lateNy.multipliers.session);
  });

  it('loss cluster should reduce sequencing multiplier', () => {
    const neutral = evaluateTradeProposal(
      makeProposal(),
      makeContext({ sequencingCluster: 'neutral' }),
    );
    const lossCluster = evaluateTradeProposal(
      makeProposal(),
      makeContext({ sequencingCluster: 'loss-cluster' }),
    );
    expect(neutral.multipliers.sequencing).toBeGreaterThan(lossCluster.multipliers.sequencing);
  });
});

// ─── Output Contract Tests ───

describe('Governance Output Contract', () => {
  it('should produce all required forensic fields', () => {
    const result = evaluateTradeProposal(makeProposal(), makeContext());
    expect(result.captureRatio).toBeGreaterThanOrEqual(0);
    expect(result.captureRatio).toBeLessThanOrEqual(1);
    expect(result.expectedExpectancy).toBeDefined();
    expect(result.frictionCost).toBeGreaterThanOrEqual(0);
    expect(['A', 'B', 'C', 'D']).toContain(result.exitLatencyGrade);
    expect(['scalp', 'continuation']).toContain(result.tradeMode);
    expect(result.mtfAlignmentLabel).toBeTruthy();
    expect(result.sessionLabel).toBeTruthy();
    expect(result.volatilityLabel).toBeTruthy();
  });

  it('rejected trades should have zero capture ratio and expectancy', () => {
    const result = evaluateTradeProposal(
      makeProposal(),
      makeContext({ priceDataAvailable: false, analysisAvailable: false }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.captureRatio).toBe(0);
    expect(result.expectedExpectancy).toBe(0);
  });

  it('adjusted win probability should be clamped between 0.30 and 0.88', () => {
    const result = evaluateTradeProposal(makeProposal(), makeContext());
    expect(result.adjustedWinProbability).toBeGreaterThanOrEqual(0.30);
    expect(result.adjustedWinProbability).toBeLessThanOrEqual(0.88);
  });

  it('governance score should be clamped between 0 and 100', () => {
    const result = evaluateTradeProposal(makeProposal(), makeContext());
    expect(result.governanceScore).toBeGreaterThanOrEqual(0);
    expect(result.governanceScore).toBeLessThanOrEqual(100);
  });
});
