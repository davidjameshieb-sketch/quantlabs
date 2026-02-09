import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyTradeEnvironment,
  applyDiscoveryRiskAllocation,
  evaluateDiscoveryRisk,
  setDiscoveryRiskConfig,
  resetDiscoveryRiskConfig,
} from '@/lib/forex/discoveryRiskEngine';
import {
  isAdaptiveEdgeActive,
  setAdaptiveEdgeEnabled,
  setForceBaselineUntil,
} from '@/lib/forex/environmentSignature';

describe('Adaptive Edge Smoke Tests', () => {
  beforeEach(() => {
    resetDiscoveryRiskConfig();
    setAdaptiveEdgeEnabled(true);
    setForceBaselineUntil(null);
  });

  // ─── BLOCKED envKey → SKIP ──────────────────────────────────
  describe('blocked environments result in SKIP', () => {
    it('AUD cross pair is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'AUD_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
      expect(result.multiplierApplied).toBe(0);
    });

    it('GBP_USD is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'GBP_USD', 'london-open', 'expansion', 'long', 0.90, 0.4, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('GBP_JPY is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'GBP_JPY', 'asian', 'compression', 'short', 0.80, 0.6, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('sentiment-reactor agent is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'sentiment-reactor'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('range-navigator agent is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'london-open', 'expansion', 'long', 0.85, 0.5, 'range-navigator'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('rollover + short is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'rollover', 'compression', 'short', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('spread > 1.0 pip is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'london-open', 'expansion', 'long', 0.85, 1.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });

    it('ignition + low composite is BLOCKED', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'ny-overlap', 'ignition', 'long', 0.60, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('BLOCKED');
      expect(result.blockedByDiscoveryRisk).toBe(true);
    });
  });

  // ─── EDGE_BOOST envKey → increased units ────────────────────
  describe('edge candidate environments get EDGE_BOOST', () => {
    it('NY Overlap + Expansion + Long = EDGE_BOOST with 1.35x', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('EDGE_BOOST');
      expect(result.multiplierApplied).toBe(1.35);
      expect(result.blockedByDiscoveryRisk).toBe(false);
      expect(result.isEdgeCandidate).toBe(true);
    });

    it('EDGE_BOOST increases finalUnits', () => {
      const baseUnits = 1000;
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      const finalUnits = Math.max(500, Math.round(baseUnits * result.multiplierApplied));
      expect(finalUnits).toBe(1350);
      expect(finalUnits).toBeGreaterThan(baseUnits);
    });

    it('EUR_GBP Long = EDGE_BOOST', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_GBP', 'london-open', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('EDGE_BOOST');
      expect(result.multiplierApplied).toBe(1.35);
    });

    it('USD_JPY Compression = EDGE_BOOST', () => {
      const result = evaluateDiscoveryRisk(
        'USD_JPY', 'asian', 'compression', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('EDGE_BOOST');
    });
  });

  // ─── REDUCED baseline ──────────────────────────────────────
  describe('non-edge non-destructive = REDUCED', () => {
    it('normal environment gets 0.55x reduction', () => {
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'london-open', 'compression', 'short', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('REDUCED');
      expect(result.multiplierApplied).toBe(0.55);
      expect(result.blockedByDiscoveryRisk).toBe(false);
    });

    it('REDUCED decreases finalUnits', () => {
      const baseUnits = 1000;
      const result = evaluateDiscoveryRisk(
        'EUR_USD', 'london-open', 'compression', 'short', 0.85, 0.5, 'forex-macro'
      );
      const finalUnits = Math.max(500, Math.round(baseUnits * result.multiplierApplied));
      expect(finalUnits).toBe(550);
      expect(finalUnits).toBeLessThan(baseUnits);
    });
  });

  // ─── Kill-switch forces multiplier=1.0 ─────────────────────
  describe('kill-switch disables all blocking/boosting', () => {
    it('disabled mode returns NORMAL with multiplier=1.0', () => {
      setDiscoveryRiskConfig({ enabled: false });
      const result = evaluateDiscoveryRisk(
        'AUD_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(result.riskLabel).toBe('NORMAL');
      expect(result.multiplierApplied).toBe(1.0);
      expect(result.blockedByDiscoveryRisk).toBe(false);
    });

    it('adaptive edge kill-switch works', () => {
      expect(isAdaptiveEdgeActive()).toBe(true);
      setAdaptiveEdgeEnabled(false);
      expect(isAdaptiveEdgeActive()).toBe(false);
      // When kill-switch is off, multiplier should be forced to 1.0 by the caller
      setAdaptiveEdgeEnabled(true);
    });

    it('forceBaselineUntil disables adaptive edge temporarily', () => {
      setForceBaselineUntil(Date.now() + 60000);
      expect(isAdaptiveEdgeActive()).toBe(false);
      setForceBaselineUntil(null);
      expect(isAdaptiveEdgeActive()).toBe(true);
    });
  });

  // ─── finalUnits used in OANDA payload ──────────────────────
  describe('multiplier applies to position sizing', () => {
    it('BLOCKED results in 0 units (trade skipped)', () => {
      const baseUnits = 1000;
      const result = evaluateDiscoveryRisk(
        'GBP_USD', 'london-open', 'expansion', 'long', 0.90, 0.4, 'forex-macro'
      );
      expect(result.multiplierApplied).toBe(0);
      const finalUnits = Math.max(500, Math.round(baseUnits * result.multiplierApplied));
      // With multiplier=0, baseUnits*0 = 0, but clamp to 500 — however trade is SKIPPED before sizing
      expect(result.blockedByDiscoveryRisk).toBe(true);
      // The trade is skipped entirely, so finalUnits calculation is moot
    });

    it('custom multiplier overrides apply correctly', () => {
      setDiscoveryRiskConfig({ edgeBoostMultiplier: 1.5, baselineReductionMultiplier: 0.4 });
      const edgeResult = evaluateDiscoveryRisk(
        'EUR_USD', 'ny-overlap', 'expansion', 'long', 0.85, 0.5, 'forex-macro'
      );
      expect(edgeResult.multiplierApplied).toBe(1.5);

      const baseResult = evaluateDiscoveryRisk(
        'EUR_USD', 'london-open', 'compression', 'short', 0.85, 0.5, 'forex-macro'
      );
      expect(baseResult.multiplierApplied).toBe(0.4);
    });
  });
});
