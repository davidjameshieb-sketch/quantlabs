// ─── Short Engine Tests ───
// Coverage: PF guard, stop activation logic, router integrity, shadow promotion gates

import { describe, it, expect } from 'vitest';
import {
  routeTradeProposal,
  validateRouterIntegrity,
  DEFAULT_SHORT_ENGINE_CONFIG,
} from '@/lib/forex/shorts';
import {
  computeShortInitialStop,
  evaluateShortStopPhase,
  getRegimeStopAdjustment,
} from '@/lib/forex/shorts/shortStopGeometry';
import { evaluateShortShadow } from '@/lib/forex/shorts/shortShadowValidator';
import { computeSnapbackSurvival } from '@/lib/forex/shorts/shortSurvivorshipScorer';
import { classifyShortRegime } from '@/lib/forex/shorts/shortRegimeDetector';
import type { GovernanceContext } from '@/lib/forex/tradeGovernanceEngine';
import type { ShortTradeRecord } from '@/lib/forex/shorts/shortSurvivorshipScorer';

// ─── Helper: mock GovernanceContext ───
function mockCtx(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    mtfAlignmentScore: 50,
    htfSupports: false,
    mtfConfirms: false,
    ltfClean: false,
    volatilityPhase: 'expansion',
    phaseConfidence: 70,
    liquidityShockProb: 60,
    spreadStabilityRank: 40,
    frictionRatio: 5,
    pairExpectancy: 55,
    pairFavored: false,
    isMajorPair: true,
    currentSession: 'ny-overlap',
    sessionAggressiveness: 78,
    edgeDecaying: false,
    edgeDecayRate: 0,
    overtradingThrottled: false,
    sequencingCluster: 'neutral',
    currentSpread: 0.00015,
    bid: 1.1000,
    ask: 1.1002,
    slippageEstimate: 0.00002,
    totalFriction: 0.00017,
    atrValue: 0.0008,
    atrAvg: 0.0007,
    priceDataAvailable: true,
    analysisAvailable: true,
    ...overrides,
  };
}

// ─── Router Tests ───

describe('Short/Long Engine Router', () => {
  it('routes long trades to LONG_ENGINE', () => {
    const d = routeTradeProposal('long', 'EUR_USD', 'forex-macro');
    expect(d.engine).toBe('LONG_ENGINE');
    expect(d.direction).toBe('long');
    expect(validateRouterIntegrity(d)).toBe(true);
  });

  it('blocks shorts when engine is disabled', () => {
    const d = routeTradeProposal('short', 'EUR_USD', 'forex-macro', {
      ...DEFAULT_SHORT_ENGINE_CONFIG,
      enabled: false,
    });
    expect(d.engine).toBe('BLOCKED');
  });

  it('routes shorts to SHORT_ENGINE when enabled + pair + agent allowed', () => {
    const d = routeTradeProposal('short', 'EUR_USD', 'forex-macro', {
      ...DEFAULT_SHORT_ENGINE_CONFIG,
      enabled: true,
      enabledPairs: ['EUR_USD'],
      allowedAgents: ['forex-macro'],
      allowedSessions: {},
    });
    expect(d.engine).toBe('SHORT_ENGINE');
    expect(validateRouterIntegrity(d)).toBe(true);
  });

  it('blocks shorts for unapproved pairs', () => {
    const d = routeTradeProposal('short', 'AUD_NZD', 'forex-macro', {
      ...DEFAULT_SHORT_ENGINE_CONFIG,
      enabled: true,
    });
    expect(d.engine).toBe('BLOCKED');
    expect(d.reason).toContain('not in short-enabled');
  });

  it('blocks shorts for unapproved agents', () => {
    const d = routeTradeProposal('short', 'EUR_USD', 'unknown-agent', {
      ...DEFAULT_SHORT_ENGINE_CONFIG,
      enabled: true,
      enabledPairs: ['EUR_USD'],
    });
    expect(d.engine).toBe('BLOCKED');
    expect(d.reason).toContain('not authorized');
  });

  it('router cannot route long to SHORT_ENGINE', () => {
    const bad = { engine: 'SHORT_ENGINE' as const, reason: '', direction: 'long' as const };
    expect(validateRouterIntegrity(bad)).toBe(false);
  });

  it('router cannot route short to LONG_ENGINE', () => {
    const bad = { engine: 'LONG_ENGINE' as const, reason: '', direction: 'short' as const };
    expect(validateRouterIntegrity(bad)).toBe(false);
  });
});

// ─── Stop Geometry Tests ───

describe('Short Stop Geometry', () => {
  it('uses widest of ATR/spread/swing for initial stop', () => {
    const result = computeShortInitialStop(0.001, 0.0002, 1.1010, 1.1000);
    expect(result.initialStopDistance).toBeGreaterThan(0);
    expect(['atr', 'spread', 'swing']).toContain(result.stopSource);
    expect(result.currentPhase).toBe('A');
  });

  it('stop is at least 2× spread', () => {
    const result = computeShortInitialStop(0.0001, 0.0005, 1.1001, 1.1000);
    expect(result.initialStopDistance).toBeGreaterThanOrEqual(0.0005 * 2);
  });

  it('stays in Phase A for early candles', () => {
    const { phase, shouldActivateTrail } = evaluateShortStopPhase(2, 0.5, 1.0);
    expect(phase).toBe('A');
    expect(shouldActivateTrail).toBe(false);
  });

  it('transitions to Phase B when MFE >= threshold', () => {
    const { phase, shouldActivateTrail } = evaluateShortStopPhase(10, 1.5, 1.0);
    expect(phase).toBe('B');
    expect(shouldActivateTrail).toBe(true);
  });

  it('stays Phase A after N candles if MFE insufficient', () => {
    const { phase, shouldActivateTrail } = evaluateShortStopPhase(10, 0.5, 1.0);
    expect(phase).toBe('A');
    expect(shouldActivateTrail).toBe(false);
  });

  it('shock-breakdown regime gets tighter stops', () => {
    const adj = getRegimeStopAdjustment('shock-breakdown');
    expect(adj.atrMultiplierOverride).toBe(1.2);
    expect(adj.noShrinkOverride).toBe(3);
  });

  it('liquidity-vacuum regime gets wider stops', () => {
    const adj = getRegimeStopAdjustment('liquidity-vacuum');
    expect(adj.atrMultiplierOverride).toBe(2.0);
    expect(adj.noShrinkOverride).toBe(8);
  });
});

// ─── Shadow Validation Tests ───

describe('Short Shadow Validation', () => {
  const baseline = { expectancy: 0.5, drawdownDensity: 0.3, avgFriction: 0.002 };

  it('returns collecting when insufficient trades', () => {
    const result = evaluateShortShadow(
      { tradeCount: 5, expectancy: 1, grossProfit: 10, grossLoss: 5, winRate: 0.6, drawdownDensity: 0.2, avgFriction: 0.001, executionQualityScore: 80 },
      baseline,
    );
    expect(result.status).toBe('collecting');
  });

  it('promotes when all gates pass', () => {
    const result = evaluateShortShadow(
      { tradeCount: 30, expectancy: 0.8, grossProfit: 20, grossLoss: 10, winRate: 0.55, drawdownDensity: 0.25, avgFriction: 0.0019, executionQualityScore: 85 },
      baseline,
    );
    expect(result.status).toBe('promoted');
    expect(result.allGatesPassed).toBe(true);
  });

  it('fails when expectancy negative', () => {
    const result = evaluateShortShadow(
      { tradeCount: 30, expectancy: -0.5, grossProfit: 5, grossLoss: 10, winRate: 0.35, drawdownDensity: 0.25, avgFriction: 0.001, executionQualityScore: 80 },
      baseline,
    );
    expect(result.status).toBe('failed');
    expect(result.failureReport).toContain('Expectancy negative');
  });

  it('fails when PF invalid (zero-loss guard)', () => {
    const result = evaluateShortShadow(
      { tradeCount: 30, expectancy: 1, grossProfit: 30, grossLoss: 0, winRate: 1.0, drawdownDensity: 0, avgFriction: 0.001, executionQualityScore: 80 },
      baseline,
    );
    expect(result.status).toBe('failed');
    expect(result.failureReport).toContain('PF invalid');
  });

  it('fails when drawdown worse than baseline', () => {
    const result = evaluateShortShadow(
      { tradeCount: 30, expectancy: 0.8, grossProfit: 20, grossLoss: 10, winRate: 0.55, drawdownDensity: 0.5, avgFriction: 0.001, executionQualityScore: 80 },
      baseline,
    );
    expect(result.status).toBe('failed');
    expect(result.failureReport).toContain('Drawdown density');
  });
});

// ─── Snapback Survival Tests ───

describe('Snapback Survival Metrics', () => {
  it('returns zeros for empty trades', () => {
    const result = computeSnapbackSurvival([]);
    expect(result.sampleSize).toBe(0);
    expect(result.avgMaeR).toBe(0);
  });

  it('computes snapback metrics correctly', () => {
    const trades: ShortTradeRecord[] = [
      { pair: 'EUR_USD', session: 'ny-overlap', agentId: 'a', regime: 'shock-breakdown', indicatorSignature: 'x', direction: 'short', pnlPips: 3, maeR: 0.8, mfeR: 2.0, spreadPips: 0.5, slippagePips: 0.1, isWin: true, initialRiskR: 1 },
      { pair: 'EUR_USD', session: 'ny-overlap', agentId: 'a', regime: 'shock-breakdown', indicatorSignature: 'x', direction: 'short', pnlPips: -2, maeR: 1.5, mfeR: 0.3, spreadPips: 0.5, slippagePips: 0.2, isWin: false, initialRiskR: 1 },
      { pair: 'EUR_USD', session: 'ny-overlap', agentId: 'a', regime: 'shock-breakdown', indicatorSignature: 'x', direction: 'short', pnlPips: 5, maeR: 0.3, mfeR: 3.0, spreadPips: 0.4, slippagePips: 0.1, isWin: true, initialRiskR: 1 },
    ];
    const result = computeSnapbackSurvival(trades);
    expect(result.sampleSize).toBe(3);
    expect(result.avgMaeR).toBeCloseTo((0.8 + 1.5 + 0.3) / 3, 2);
    // 1 of 2 winners has MAE > 0.6R
    expect(result.pctWinnersWithSnapback).toBe(50);
  });
});

// ─── Regime Detection Tests ───

describe('Short Regime Detection', () => {
  it('detects orderly uptrend and suppresses', () => {
    const result = classifyShortRegime(mockCtx({
      htfSupports: true, mtfAlignmentScore: 80,
      volatilityPhase: 'expansion', spreadStabilityRank: 70,
    }));
    expect(result.regime).toBe('orderly-uptrend');
    expect(result.isTradeable).toBe(false);
  });

  it('detects shock breakdown as tradeable', () => {
    const result = classifyShortRegime(mockCtx({
      liquidityShockProb: 70, volatilityPhase: 'ignition',
      spreadStabilityRank: 35, htfSupports: false,
    }));
    expect(result.regime).toBe('shock-breakdown');
    expect(result.isTradeable).toBe(true);
  });

  it('detects balanced chop as suppressed', () => {
    const result = classifyShortRegime(mockCtx({
      volatilityPhase: 'compression', mtfAlignmentScore: 30,
      spreadStabilityRank: 60, liquidityShockProb: 20,
    }));
    expect(result.regime).toBe('balanced-chop');
    expect(result.isTradeable).toBe(false);
  });
});
