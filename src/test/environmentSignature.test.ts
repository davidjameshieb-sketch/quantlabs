import { describe, it, expect } from 'vitest';
import {
  buildEnvironmentFeatures,
  buildEnvironmentKey,
  buildEnvKeyFromRaw,
  normalizeSession,
  normalizeRegime,
  normalizeDirection,
  normalizeSymbol,
  computeSpreadBucket,
  computeCompositeDecile,
  isAdaptiveEdgeActive,
  setAdaptiveEdgeEnabled,
  setForceBaselineUntil,
} from '@/lib/forex/environmentSignature';

describe('environmentSignature', () => {
  describe('symbol normalization', () => {
    it('maps EUR/USD, EUR_USD, EURUSD to same canonical', () => {
      expect(normalizeSymbol('EUR/USD')).toBe('EURUSD');
      expect(normalizeSymbol('EUR_USD')).toBe('EURUSD');
      expect(normalizeSymbol('EURUSD')).toBe('EURUSD');
    });

    it('handles lowercase', () => {
      expect(normalizeSymbol('eur/usd')).toBe('EURUSD');
      expect(normalizeSymbol('eur_usd')).toBe('EURUSD');
    });
  });

  describe('session normalization', () => {
    it('maps synonyms to canonical', () => {
      expect(normalizeSession('tokyo')).toBe('asian');
      expect(normalizeSession('asia')).toBe('asian');
      expect(normalizeSession('asian')).toBe('asian');
      expect(normalizeSession('ny')).toBe('ny-overlap');
      expect(normalizeSession('london')).toBe('london-open');
    });
  });

  describe('regime normalization', () => {
    it('maps synonyms to canonical', () => {
      expect(normalizeRegime('ranging')).toBe('compression');
      expect(normalizeRegime('trending')).toBe('expansion');
      expect(normalizeRegime('expansion')).toBe('expansion');
    });
  });

  describe('direction normalization', () => {
    it('maps BUY/SELL to LONG/SHORT', () => {
      expect(normalizeDirection('buy')).toBe('LONG');
      expect(normalizeDirection('sell')).toBe('SHORT');
      expect(normalizeDirection('long')).toBe('LONG');
      expect(normalizeDirection('SKIP')).toBe('NEUTRAL');
    });
  });

  describe('spread buckets', () => {
    it('buckets correctly', () => {
      expect(computeSpreadBucket(0.3)).toBe('<=0.5');
      expect(computeSpreadBucket(0.7)).toBe('0.5-1.0');
      expect(computeSpreadBucket(1.2)).toBe('1.0-1.5');
      expect(computeSpreadBucket(2.0)).toBe('>1.5');
    });
  });

  describe('composite decile', () => {
    it('maps correctly', () => {
      expect(computeCompositeDecile(0.05)).toBe('D1');
      expect(computeCompositeDecile(0.55)).toBe('D6');
      expect(computeCompositeDecile(0.95)).toBe('D10');
      expect(computeCompositeDecile(1.0)).toBe('D10');
    });
  });

  describe('key consistency', () => {
    it('same input yields same key every time', () => {
      const k1 = buildEnvKeyFromRaw('london-open', 'expansion', 'EUR/USD', 'long', 'forex-macro');
      const k2 = buildEnvKeyFromRaw('london-open', 'expansion', 'EUR/USD', 'long', 'forex-macro');
      expect(k1).toBe(k2);
    });

    it('different symbol formats yield same key', () => {
      const k1 = buildEnvKeyFromRaw('asian', 'compression', 'EUR/USD', 'long');
      const k2 = buildEnvKeyFromRaw('asian', 'compression', 'EUR_USD', 'long');
      const k3 = buildEnvKeyFromRaw('asian', 'compression', 'EURUSD', 'long');
      expect(k1).toBe(k2);
      expect(k2).toBe(k3);
    });

    it('session synonyms yield same key', () => {
      const k1 = buildEnvKeyFromRaw('tokyo', 'expansion', 'USDJPY', 'short');
      const k2 = buildEnvKeyFromRaw('asian', 'expansion', 'USDJPY', 'short');
      expect(k1).toBe(k2);
    });

    it('regime synonyms yield same key', () => {
      const k1 = buildEnvKeyFromRaw('london-open', 'trending', 'EURUSD', 'long');
      const k2 = buildEnvKeyFromRaw('london-open', 'expansion', 'EURUSD', 'long');
      expect(k1).toBe(k2);
    });

    it('no near-duplicate keys from formatting', () => {
      const features1 = buildEnvironmentFeatures({
        symbol: 'eur/usd', session: 'London', regime: 'Trending', direction: 'Buy',
      });
      const features2 = buildEnvironmentFeatures({
        symbol: 'EUR_USD', session: 'london-open', regime: 'expansion', direction: 'LONG',
      });
      expect(buildEnvironmentKey(features1)).toBe(buildEnvironmentKey(features2));
    });
  });

  describe('kill-switch', () => {
    it('disables adaptive edge when toggled off', () => {
      setAdaptiveEdgeEnabled(true);
      expect(isAdaptiveEdgeActive()).toBe(true);
      setAdaptiveEdgeEnabled(false);
      expect(isAdaptiveEdgeActive()).toBe(false);
      setAdaptiveEdgeEnabled(true);
    });

    it('force baseline until timestamp works', () => {
      setAdaptiveEdgeEnabled(true);
      setForceBaselineUntil(Date.now() + 60000); // 1 min in future
      expect(isAdaptiveEdgeActive()).toBe(false);
      setForceBaselineUntil(Date.now() - 1000); // past
      expect(isAdaptiveEdgeActive()).toBe(true);
      setForceBaselineUntil(null);
    });
  });
});
