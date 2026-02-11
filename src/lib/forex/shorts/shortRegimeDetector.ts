// ─── Short Regime Detector ───
// Classifies market conditions into short-specific regimes.
// Unlike the long regime ladder (Compression→Ignition→Expansion),
// shorts need: Breakdown Spike → Micro Consolidation → Secondary Breakdown.

import type { VolatilityPhase, LiquiditySession } from '../microstructureEngine';
import type { GovernanceContext } from '../tradeGovernanceEngine';
import type { ShortRegime } from './shortTypes';

export interface ShortRegimeClassification {
  regime: ShortRegime;
  confidence: number;        // 0-100
  isTradeable: boolean;
  suppressionReason: string | null;
}

/**
 * Classify the current market into a short-specific regime.
 * Uses governance context signals to detect breakdown conditions.
 */
export function classifyShortRegime(ctx: GovernanceContext): ShortRegimeClassification {
  const { volatilityPhase, phaseConfidence, liquidityShockProb, spreadStabilityRank,
    mtfAlignmentScore, htfSupports, sequencingCluster, sessionAggressiveness, edgeDecaying } = ctx;

  // ── Suppression checks first ──

  // Orderly uptrend: HTF supports, MTF confirms, expansion/ignition, stable spreads
  if (htfSupports && mtfAlignmentScore > 65 && 
      (volatilityPhase === 'expansion' || volatilityPhase === 'ignition') &&
      spreadStabilityRank > 60) {
    return {
      regime: 'orderly-uptrend',
      confidence: phaseConfidence,
      isTradeable: false,
      suppressionReason: 'Orderly uptrend detected — long territory, shorts suppressed',
    };
  }

  // Balanced chop: compression phase, low alignment, stable spreads
  if (volatilityPhase === 'compression' && mtfAlignmentScore < 50 &&
      spreadStabilityRank > 50 && liquidityShockProb < 30) {
    return {
      regime: 'balanced-chop',
      confidence: 60 + (100 - mtfAlignmentScore) * 0.3,
      isTradeable: false,
      suppressionReason: 'Balanced chop — no directional edge for shorts',
    };
  }

  // Mean reversion rich: exhaustion phase with stable spreads, declining edge
  if (volatilityPhase === 'exhaustion' && edgeDecaying && spreadStabilityRank > 55) {
    return {
      regime: 'mean-reversion-rich',
      confidence: 55 + phaseConfidence * 0.3,
      isTradeable: false,
      suppressionReason: 'Mean-reversion rich environment — fades dominate, shorts suppressed',
    };
  }

  // ── Tradeable short regimes ──

  // Shock breakdown: high shock probability + ignition/expansion + widening spreads
  if (liquidityShockProb > 55 && 
      (volatilityPhase === 'ignition' || volatilityPhase === 'expansion') &&
      spreadStabilityRank < 50) {
    return {
      regime: 'shock-breakdown',
      confidence: Math.min(95, liquidityShockProb * 0.8 + phaseConfidence * 0.3),
      isTradeable: true,
      suppressionReason: null,
    };
  }

  // Liquidity vacuum: very low spread stability + high shock + low session
  if (spreadStabilityRank < 30 && liquidityShockProb > 45 && sessionAggressiveness < 50) {
    return {
      regime: 'liquidity-vacuum',
      confidence: Math.min(90, (100 - spreadStabilityRank) * 0.6 + liquidityShockProb * 0.4),
      isTradeable: true,
      suppressionReason: null,
    };
  }

  // Risk-off impulse: loss cluster + high shock + no HTF support
  if (sequencingCluster === 'loss-cluster' && liquidityShockProb > 40 && !htfSupports) {
    return {
      regime: 'risk-off-impulse',
      confidence: Math.min(85, 50 + liquidityShockProb * 0.4),
      isTradeable: true,
      suppressionReason: null,
    };
  }

  // Breakdown continuation: expansion/ignition with low alignment (bearish HTF)
  if ((volatilityPhase === 'expansion' || volatilityPhase === 'ignition') &&
      !htfSupports && mtfAlignmentScore < 40) {
    return {
      regime: 'breakdown-continuation',
      confidence: Math.min(80, 45 + (100 - mtfAlignmentScore) * 0.4),
      isTradeable: true,
      suppressionReason: null,
    };
  }

  // Default: treat as balanced chop (suppressed)
  return {
    regime: 'balanced-chop',
    confidence: 40,
    isTradeable: false,
    suppressionReason: 'No clear short regime detected — defaulting to suppression',
  };
}
