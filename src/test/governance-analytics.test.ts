import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeGovernancePassStats,
  computeGateFrequency,
  computeNeutralDirectionRate,
  computeCompositeExpectancyCorrelation,
  computeDataAvailability,
} from '@/lib/forex/governanceAnalytics';
import {
  validateUnitConsistency,
  verifyShadowModeIntegrity,
  verifySymbolMapping,
  resetShadowViolationCount,
  reportShadowModeViolation,
} from '@/lib/forex/governanceValidation';
import {
  computeCachePerformance,
  resetCacheMetrics,
  recordSlowCacheHit,
  recordSlowCacheMiss,
  recordFastCacheHit,
  recordFastCacheMiss,
  recordContextRetrieval,
} from '@/lib/forex/governanceCacheMonitor';
import { governanceAlerts } from '@/lib/forex/governanceAlerts';
import type { GovernanceContext } from '@/lib/forex/tradeGovernanceEngine';

// ─── Helper: minimal valid GovernanceContext ───
function makeCtx(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    mtfAlignmentScore: 70,
    htfSupports: true,
    mtfConfirms: true,
    ltfClean: true,
    volatilityPhase: 'expansion',
    phaseConfidence: 75,
    liquidityShockProb: 20,
    spreadStabilityRank: 80,
    frictionRatio: 5,
    pairExpectancy: 65,
    pairFavored: true,
    isMajorPair: true,
    currentSession: 'london-open',
    sessionAggressiveness: 88,
    edgeDecaying: false,
    edgeDecayRate: 0,
    overtradingThrottled: false,
    sequencingCluster: 'neutral',
    currentSpread: 0.00012,
    bid: 1.1000,
    ask: 1.10012,
    slippageEstimate: 0.00002,
    totalFriction: 0.00014,
    atrValue: 0.0008,
    atrAvg: 0.0007,
    priceDataAvailable: true,
    analysisAvailable: true,
    ...overrides,
  };
}

describe('Governance Analytics', () => {
  it('computeGovernancePassStats returns valid structure', () => {
    const stats = computeGovernancePassStats();
    expect(stats).toHaveProperty('totalEvaluations');
    expect(stats).toHaveProperty('approvalRate');
    expect(stats).toHaveProperty('breakdownBySession');
    expect(stats.breakdownBySession).toHaveProperty('asian');
    expect(stats.breakdownBySession).toHaveProperty('london-open');
  });

  it('computeGateFrequency returns array', () => {
    const freq = computeGateFrequency();
    expect(Array.isArray(freq)).toBe(true);
  });

  it('computeNeutralDirectionRate returns valid structure', () => {
    const stats = computeNeutralDirectionRate();
    expect(stats).toHaveProperty('neutralRate');
    expect(typeof stats.neutralRate).toBe('number');
  });

  it('computeCompositeExpectancyCorrelation returns array', () => {
    const corr = computeCompositeExpectancyCorrelation();
    expect(Array.isArray(corr)).toBe(true);
  });

  it('computeDataAvailability returns valid structure', () => {
    const avail = computeDataAvailability();
    expect(avail).toHaveProperty('priceDataAvailabilityRate');
    expect(avail).toHaveProperty('analysisAvailabilityRate');
  });
});

describe('Governance Validation', () => {
  it('validates unit consistency — passes on valid context', () => {
    const result = validateUnitConsistency(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.gate).toBeNull();
  });

  it('G11 triggers on zero ATR', () => {
    const result = validateUnitConsistency(makeCtx({ atrValue: 0 }));
    expect(result.passed).toBe(false);
    expect(result.gate?.id).toBe('G11_INFRA_UNIT_MISMATCH');
  });

  it('G11 triggers on friction ratio out of range', () => {
    const result = validateUnitConsistency(makeCtx({ frictionRatio: 100 }));
    expect(result.passed).toBe(false);
  });

  it('shadow mode integrity tracks violations', () => {
    resetShadowViolationCount();
    const before = verifyShadowModeIntegrity();
    expect(before.executionViolations).toBe(0);
    expect(before.verified).toBe(true);

    reportShadowModeViolation();
    const after = verifyShadowModeIntegrity();
    expect(after.executionViolations).toBe(1);
    expect(after.verified).toBe(false);

    resetShadowViolationCount();
  });

  it('verifySymbolMapping returns structure', () => {
    const result = verifySymbolMapping('EURUSD');
    expect(result).toHaveProperty('displaySymbol', 'EUR/USD');
    expect(result).toHaveProperty('valid');
  });
});

describe('Cache Performance Monitor', () => {
  beforeEach(() => {
    resetCacheMetrics();
  });

  it('tracks hit rates correctly', () => {
    recordSlowCacheHit();
    recordSlowCacheHit();
    recordSlowCacheMiss();
    recordFastCacheHit();
    recordFastCacheMiss();
    recordContextRetrieval(2.5);
    recordContextRetrieval(1.5);

    const stats = computeCachePerformance();
    expect(stats.slowCacheHitRate).toBeCloseTo(2 / 3);
    expect(stats.fastCacheHitRate).toBeCloseTo(0.5);
    expect(stats.avgContextLatencyMs).toBeCloseTo(2.0);
    expect(stats.totalRetrievals).toBe(2);
  });
});

describe('Governance Alerts', () => {
  beforeEach(() => {
    governanceAlerts.clearAlerts();
  });

  it('emits and retrieves alerts', () => {
    governanceAlerts.emit('unit_consistency_failure', { test: true });
    const alerts = governanceAlerts.getRecentAlerts(5);
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe('unit_consistency_failure');
  });

  it('counts alerts by type', () => {
    governanceAlerts.emit('neutral_rate_spike', { rate: 0.6 });
    governanceAlerts.emit('neutral_rate_spike', { rate: 0.7 });
    governanceAlerts.emit('unit_consistency_failure', { v: 1 });
    const counts = governanceAlerts.getAlertCounts();
    expect(counts.neutral_rate_spike).toBe(2);
    expect(counts.unit_consistency_failure).toBe(1);
  });
});
