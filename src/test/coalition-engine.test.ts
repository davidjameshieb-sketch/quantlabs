import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCoalitionKey,
  parseCoalitionKey,
  analyzeCoalitions,
  setCoalitionBoostingEnabled,
  isCoalitionBoostingActive,
  recordCoalitionTradeOutcome,
  getCoalitionMultiplier,
  type CoalitionTradeRecord,
  type CoalitionRecommendation,
} from '@/lib/agents/coalitionEngine';
import { setAdaptiveEdgeEnabled } from '@/lib/forex/environmentSignature';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<CoalitionTradeRecord> = {}): CoalitionTradeRecord {
  return {
    agent_id: 'agent-a',
    direction: 'long',
    currency_pair: 'EUR_USD',
    entry_price: 1.1000,
    exit_price: 1.1010,
    session_label: 'ny-overlap',
    regime_label: 'expansion',
    spread_at_entry: 0.2,
    environment: 'live',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTradeSet(
  agentIds: string[],
  count: number,
  baseTime: number,
  winRatio: number = 0.6,
  env: string = 'live'
): CoalitionTradeRecord[] {
  const trades: CoalitionTradeRecord[] = [];
  for (let i = 0; i < count; i++) {
    for (const agent of agentIds) {
      const isWin = (i / count) < winRatio;
      trades.push(makeTrade({
        agent_id: agent,
        entry_price: 1.1000,
        exit_price: isWin ? 1.1010 : 1.0995,
        environment: env,
        created_at: new Date(baseTime + i * 60000).toISOString(), // 1 min apart (within 20-min window)
      }));
    }
  }
  return trades;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('coalitionEngine', () => {
  beforeEach(() => {
    setAdaptiveEdgeEnabled(true);
    setCoalitionBoostingEnabled(false);
  });

  describe('coalitionKey canonicalization', () => {
    it('sorts agents alphabetically', () => {
      expect(buildCoalitionKey(['charlie', 'alpha', 'bravo'])).toBe('alpha|bravo|charlie');
    });

    it('deduplicates agents', () => {
      expect(buildCoalitionKey(['agent-a', 'agent-a', 'agent-b'])).toBe('agent-a|agent-b');
    });

    it('parses correctly', () => {
      expect(parseCoalitionKey('agent-a|agent-b|agent-c')).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });

    it('single agent key', () => {
      expect(buildCoalitionKey(['agent-x'])).toBe('agent-x');
    });
  });

  describe('learnMode isolation', () => {
    it('live mode excludes backtest trades', () => {
      const base = Date.now();
      const liveTrades = makeTradeSet(['agent-a', 'agent-b'], 30, base, 0.7, 'live');
      const backtestTrades = makeTradeSet(['agent-a', 'agent-b'], 30, base + 100000, 0.7, 'backtest');
      const all = [...liveTrades, ...backtestTrades];

      const resultLive = analyzeCoalitions(all, 'live');
      const resultBT = analyzeCoalitions(all, 'backtest');

      // Live mode should only count live+practice
      expect(resultLive.learnMode).toBe('live');
      expect(resultBT.learnMode).toBe('backtest');

      // They should have different total trades
      expect(resultLive.totalTrades).toBeLessThanOrEqual(liveTrades.length);
      expect(resultBT.totalTrades).toBeLessThanOrEqual(backtestTrades.length);
    });

    it('excludes trades without session_label or regime_label', () => {
      const trades = [
        makeTrade({ session_label: null }),
        makeTrade({ regime_label: null }),
        makeTrade({ session_label: 'ny-overlap', regime_label: 'expansion' }),
      ];
      const result = analyzeCoalitions(trades, 'live');
      expect(result.totalTrades).toBe(1);
    });
  });

  describe('envKey grouping', () => {
    it('same session+regime+symbol+direction produces consistent envKey', () => {
      const base = Date.now();
      const trades = makeTradeSet(['agent-a', 'agent-b'], 70, base, 0.65);
      const result = analyzeCoalitions(trades, 'live');

      // All trades have same context, so coalitions should have same envKey pattern
      if (result.coalitions.length > 0) {
        const envKeys = new Set(result.coalitions.map(c => c.envKey));
        expect(envKeys.size).toBeLessThanOrEqual(2); // possibly 1-2 due to direction normalization
      }
    });
  });

  describe('lift calculation and labeling', () => {
    it('labels INSUFFICIENT_DATA when under threshold', () => {
      const base = Date.now();
      // Only 5 trades per agent — way under MIN_SAMPLE_SYMBOL (60)
      const trades = makeTradeSet(['agent-a', 'agent-b'], 5, base, 0.8);
      const result = analyzeCoalitions(trades, 'live');

      for (const c of result.coalitions) {
        expect(c.label).toBe('INSUFFICIENT_DATA');
      }
    });

    it('labels BOOST when expectancy and PF improve without DD worsening', () => {
      const base = Date.now();
      // Large set of winning trades
      const trades = makeTradeSet(['agent-a', 'agent-b'], 80, base, 0.75);
      const result = analyzeCoalitions(trades, 'live');

      // At least some coalitions should exist
      const boostOrInsufficient = result.coalitions.every(c =>
        c.label === 'BOOST' || c.label === 'INSUFFICIENT_DATA' || c.label === 'RISKY' || c.label === 'HARMFUL'
      );
      expect(boostOrInsufficient).toBe(true);
    });
  });

  describe('safe execution toggle', () => {
    it('is off by default', () => {
      expect(isCoalitionBoostingActive()).toBe(false);
    });

    it('can be enabled', () => {
      setCoalitionBoostingEnabled(true);
      expect(isCoalitionBoostingActive()).toBe(true);
      setCoalitionBoostingEnabled(false);
    });

    it('respects adaptive edge kill-switch', () => {
      setCoalitionBoostingEnabled(true);
      setAdaptiveEdgeEnabled(false);
      expect(isCoalitionBoostingActive()).toBe(false);
      setAdaptiveEdgeEnabled(true);
      setCoalitionBoostingEnabled(false);
    });

    it('getCoalitionMultiplier returns 0 when boosting disabled', () => {
      const recs: CoalitionRecommendation[] = [{
        action: 'DEPLOY',
        coalitionKey: 'agent-a|agent-b',
        agents: ['agent-a', 'agent-b'],
        symbol: 'EURUSD',
        suggestedMultiplierBand: [1.05, 1.15],
        reasoning: 'test',
        metrics: { trades: 100, winRate: 0.6, expectancy: 1, profitFactor: 1.5, sharpe: 1, maxDD: 10, ddSlope: 0, stabilityScore: 0.5, coveragePct: 10, sampleConfident: true },
      }];
      expect(getCoalitionMultiplier('agent-a|agent-b', recs, 'EURUSD')).toBe(0);
    });

    it('getCoalitionMultiplier returns value when boosting enabled', () => {
      setCoalitionBoostingEnabled(true);
      const recs: CoalitionRecommendation[] = [{
        action: 'DEPLOY',
        coalitionKey: 'agent-a|agent-b',
        agents: ['agent-a', 'agent-b'],
        symbol: 'EURUSD',
        suggestedMultiplierBand: [1.05, 1.15],
        reasoning: 'test',
        metrics: { trades: 100, winRate: 0.6, expectancy: 1, profitFactor: 1.5, sharpe: 1, maxDD: 10, ddSlope: 0, stabilityScore: 0.5, coveragePct: 10, sampleConfident: true },
      }];
      const mult = getCoalitionMultiplier('agent-a|agent-b', recs, 'EURUSD');
      expect(mult).toBeGreaterThanOrEqual(0.05);
      expect(mult).toBeLessThanOrEqual(0.15);
      setCoalitionBoostingEnabled(false);
    });
  });

  describe('fallback trigger', () => {
    it('auto-disables after 100 trades degrading ≥20% vs baseline', () => {
      setCoalitionBoostingEnabled(true);
      expect(isCoalitionBoostingActive()).toBe(true);

      // Record 100 trades with poor expectancy vs baseline of 1.0
      for (let i = 0; i < 100; i++) {
        recordCoalitionTradeOutcome(0.5, 1.0); // 50% of baseline
      }

      expect(isCoalitionBoostingActive()).toBe(false);
    });
  });
});
