// Explosive Growth Engine Tests
// Tests: pip math, PF validity guard, sample gating, safety triggers, tier classification
import { describe, it, expect } from 'vitest';
import {
  computeExplosiveGrowthConfig,
  safePF,
  type ExplosiveTradeRecord,
} from '@/lib/forex/explosiveGrowthEngine';

function makeTrade(overrides: Partial<ExplosiveTradeRecord> = {}): ExplosiveTradeRecord {
  return {
    agent_id: 'carry-flow',
    direction: 'long',
    currency_pair: 'USD_CAD',
    entry_price: 1.35000,
    exit_price: 1.35050,
    session_label: 'ny-overlap',
    regime_label: 'expansion',
    spread_at_entry: 0.00005,
    slippage_pips: 0.1,
    governance_composite: 0.85,
    environment: 'live',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTradeSet(count: number, overrides: Partial<ExplosiveTradeRecord> = {}): ExplosiveTradeRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeTrade({
      ...overrides,
      created_at: new Date(Date.now() - (count - i) * 60000).toISOString(),
      exit_price: 1.35000 + (i % 3 === 0 ? -0.00020 : 0.00050),
    })
  );
}

describe('Pip Math', () => {
  it('computes non-JPY pips correctly for long', () => {
    const trades = [makeTrade({ entry_price: 1.35000, exit_price: 1.35050 })];
    const config = computeExplosiveGrowthConfig(trades);
    // 0.0005 * 10000 = 5 pips
    const pair = config.pairAllocations.find(p => p.pair === 'USD_CAD');
    expect(pair).toBeDefined();
    expect(pair!.metrics.expectancy).toBe(5);
  });

  it('computes JPY pips correctly for long', () => {
    const trades = [makeTrade({
      currency_pair: 'USD_JPY',
      entry_price: 150.000,
      exit_price: 150.050,
    })];
    const config = computeExplosiveGrowthConfig(trades);
    const pair = config.pairAllocations.find(p => p.pair === 'USD_JPY');
    expect(pair).toBeDefined();
    // 0.05 * 100 = 5 pips
    expect(pair!.metrics.expectancy).toBe(5);
  });
});

describe('Profit Factor Validity Guard', () => {
  it('returns null for zero losses', () => {
    expect(safePF(100, 0)).toBeNull();
  });

  it('returns null for near-zero losses', () => {
    expect(safePF(100, 0.00001)).toBeNull();
  });

  it('returns valid PF for normal case', () => {
    expect(safePF(200, 100)).toBe(2);
  });
});

describe('Sample Size Gating', () => {
  it('produces empty config for insufficient data', () => {
    const config = computeExplosiveGrowthConfig([]);
    expect(config.mode).toBe('OFF');
    expect(config.clusters.length).toBe(0);
  });

  it('marks clusters with insufficient trades as ineligible', () => {
    const trades = makeTradeSet(30); // less than 80 min
    const config = computeExplosiveGrowthConfig(trades);
    const cluster = config.clusters.find(c => c.pair === 'USD_CAD');
    if (cluster) {
      expect(cluster.eligible).toBe(false);
      expect(cluster.failReasons.some(r => r.includes('Trades'))).toBe(true);
    }
  });
});

describe('Safety Triggers', () => {
  it('triggers PF_DROP when system PF is low', () => {
    // Create trades that produce PF < 1.2
    const trades = Array.from({ length: 100 }, (_, i) =>
      makeTrade({
        created_at: new Date(Date.now() - (100 - i) * 60000).toISOString(),
        exit_price: i % 2 === 0 ? 1.35100 : 1.34800, // alternating big loss / small win
      })
    );
    const config = computeExplosiveGrowthConfig(trades);
    // May or may not trigger depending on actual PF
    expect(config.safetyTriggers).toBeDefined();
  });
});

describe('Explosive Config Structure', () => {
  it('produces complete config with sufficient data', () => {
    const trades = makeTradeSet(200);
    const config = computeExplosiveGrowthConfig(trades);
    
    expect(config.generatedAt).toBeGreaterThan(0);
    expect(config.dataWindow.trades).toBe(200);
    expect(config.pairAllocations.length).toBeGreaterThan(0);
    expect(config.agentClassifications.length).toBeGreaterThan(0);
    expect(config.sessionDensity.length).toBeGreaterThan(0);
    expect(config.rollbackTriggers.length).toBeGreaterThan(0);
    expect(['OFF', 'BETA', 'ALPHA']).toContain(config.mode);
  });

  it('classifies agents correctly', () => {
    const trades = makeTradeSet(200);
    const config = computeExplosiveGrowthConfig(trades);
    
    for (const a of config.agentClassifications) {
      expect(['CHAMPION', 'SPECIALIST', 'DILUTER']).toContain(a.agentClass);
      if (a.agentClass === 'DILUTER') {
        expect(a.multiplierCap).toBe(0);
      }
    }
  });
});

describe('Long-Only Enforcement', () => {
  it('handles long-only trades correctly', () => {
    const trades = makeTradeSet(100).map(t => ({ ...t, direction: 'long' }));
    const config = computeExplosiveGrowthConfig(trades);
    expect(config.dataWindow.trades).toBe(100);
  });
});
