// ─── Short Governance Engine ───
// Separate governance layer for short trades.
// Uses the SAME GovernanceContext but applies SHORT-SPECIFIC:
// - Regime ladder (short regimes vs long regimes)
// - Execution gates (stricter friction, spread spike, slippage cluster)
// - Stop geometry (wider initial, delayed trail)
// - Entry confirmation (two-stage: setup + trigger)
//
// Does NOT modify the long engine in any way.

import type { GovernanceContext, GovernanceDecision, GovernanceMultipliers, GateEntry } from '../tradeGovernanceEngine';
import type { ShortGateEntry, ShortGateId, ShortEngineConfig, ShortEntrySignal } from './shortTypes';
import { DEFAULT_SHORT_ENGINE_CONFIG } from './shortTypes';
import { classifyShortRegime, type ShortRegimeClassification } from './shortRegimeDetector';

// ─── Short Governance Result ───

export interface ShortGovernanceResult {
  decision: GovernanceDecision;
  regimeClassification: ShortRegimeClassification;
  triggeredGates: ShortGateEntry[];
  multipliers: ShortGovernanceMultipliers;
  compositeScore: number;
  governanceScore: number;
  /** Entry signal (if regime is tradeable) */
  entrySignal: ShortEntrySignal | null;
  /** Stop geometry recommendation */
  stopRecommendation: {
    initialStopR: number;
    noShrinkCandles: number;
    trailActivationMfe: number;
  };
  /** Adjusted parameters */
  adjustedWinProbability: number;
  adjustedWinRange: [number, number];
  adjustedLossRange: [number, number];
  /** Forensics */
  expectedExpectancy: number;
  frictionCost: number;
}

export interface ShortGovernanceMultipliers {
  regimeStrength: number;
  microstructureSafety: number;
  sessionFit: number;
  breakdownMomentum: number;
  frictionPenalty: number;
  composite: number;
}

// ─── Short-Specific Multipliers ───

function computeShortRegimeMultiplier(regime: ShortRegimeClassification): number {
  if (!regime.isTradeable) return 0;
  const regimeBoosts: Record<string, number> = {
    'shock-breakdown': 1.25,
    'risk-off-impulse': 1.15,
    'liquidity-vacuum': 0.85,     // risky but tradeable
    'breakdown-continuation': 1.10,
  };
  const base = regimeBoosts[regime.regime] ?? 0.5;
  return base * (0.6 + (regime.confidence / 100) * 0.4);
}

function computeShortMicrostructureSafety(ctx: GovernanceContext): number {
  // Shorts are MORE sensitive to spread and friction
  const spreadFactor = ctx.spreadStabilityRank / 100;
  const frictionFactor = Math.min(ctx.frictionRatio / 8, 1); // stricter than longs (8× vs 6×)
  const shockFactor = ctx.liquidityShockProb > 70 ? 0.7 : ctx.liquidityShockProb > 50 ? 0.85 : 1.0;
  return (spreadFactor * 0.4 + frictionFactor * 0.6) * shockFactor;
}

function computeShortSessionFit(ctx: GovernanceContext): number {
  // Shorts work best during high-liquidity sessions (less snapback risk)
  const sessionMultipliers: Record<string, number> = {
    'london-open': 1.10,
    'ny-overlap': 1.15,
    'asian': 0.60,       // much worse for shorts
    'late-ny': 0.50,     // worst for shorts
  };
  return sessionMultipliers[ctx.currentSession] ?? 0.7;
}

function computeBreakdownMomentum(ctx: GovernanceContext): number {
  // Use MTF alignment inverted: low alignment = bearish = good for shorts
  const bearishSignal = (100 - ctx.mtfAlignmentScore) / 100;
  // HTF NOT supporting = bearish bias = good for shorts
  const htfBearish = ctx.htfSupports ? 0.5 : 1.2;
  return bearishSignal * htfBearish;
}

function computeFrictionPenalty(ctx: GovernanceContext, config: ShortEngineConfig): number {
  // Shorts use stricter friction gate (K=4.0 vs K=3.0 for longs)
  if (ctx.frictionRatio < config.frictionGateK) {
    return Math.max(0.3, ctx.frictionRatio / config.frictionGateK);
  }
  return 1.0;
}

// ─── Short Execution Gates ───

function evaluateShortGates(
  ctx: GovernanceContext,
  regime: ShortRegimeClassification,
  config: ShortEngineConfig,
): ShortGateEntry[] {
  const gates: ShortGateEntry[] = [];

  // GS1: Spread spike veto
  // Uses spread stability rank as proxy — low rank = spread spiking
  if (ctx.spreadStabilityRank < (100 / config.spreadSpikeMultiplier)) {
    gates.push({
      id: 'GS1_SPREAD_SPIKE',
      message: `Spread instability ${ctx.spreadStabilityRank.toFixed(0)}% — spike detected, shorts blocked`,
    });
  }

  // GS2: Slippage clustering veto
  // High shock probability + low spread stability = slippage risk
  if (ctx.liquidityShockProb > 65 && ctx.spreadStabilityRank < 40) {
    gates.push({
      id: 'GS2_SLIPPAGE_CLUSTER',
      message: `Slippage cluster risk: shock ${ctx.liquidityShockProb.toFixed(0)}% + spread rank ${ctx.spreadStabilityRank.toFixed(0)}%`,
    });
  }

  // GS3: Suppressed regime
  if (!regime.isTradeable) {
    gates.push({
      id: 'GS3_SUPPRESSED_REGIME',
      message: regime.suppressionReason ?? 'Short regime suppressed',
    });
  }

  // GS6: Carry drag (simplified — would need swap rate data in production)
  // For now, suppress shorts on pairs where carry is known to be adverse
  // This is a placeholder for future swap rate integration

  // GS7: Friction ratio stricter than longs
  if (ctx.frictionRatio < config.frictionGateK) {
    gates.push({
      id: 'GS7_FRICTION_SHORT',
      message: `Friction ratio ${ctx.frictionRatio.toFixed(1)}× < ${config.frictionGateK}× short threshold`,
    });
  }

  return gates;
}

// ─── Core Short Governance Evaluation ───

export function evaluateShortProposal(
  pair: string,
  ctx: GovernanceContext,
  config: ShortEngineConfig = DEFAULT_SHORT_ENGINE_CONFIG,
): ShortGovernanceResult {
  // Step 1: Classify regime
  const regime = classifyShortRegime(ctx);

  // Step 2: Compute multipliers
  const regimeStrength = computeShortRegimeMultiplier(regime);
  const microstructureSafety = computeShortMicrostructureSafety(ctx);
  const sessionFit = computeShortSessionFit(ctx);
  const breakdownMomentum = computeBreakdownMomentum(ctx);
  const frictionPenalty = computeFrictionPenalty(ctx, config);

  const composite = regimeStrength * microstructureSafety * sessionFit * breakdownMomentum * frictionPenalty;

  const multipliers: ShortGovernanceMultipliers = {
    regimeStrength,
    microstructureSafety,
    sessionFit,
    breakdownMomentum,
    frictionPenalty,
    composite,
  };

  // Step 3: Evaluate gates
  const triggeredGates = evaluateShortGates(ctx, regime, config);

  // Step 4: Decision
  let decision: GovernanceDecision = 'approved';
  if (!regime.isTradeable || triggeredGates.length >= 2) {
    decision = 'rejected';
  } else if (triggeredGates.length === 1 || composite < config.minCompositeThreshold) {
    decision = 'throttled';
  }

  // Step 5: Adjusted parameters (shorts have different baseline)
  const baseShortWinProb = 0.58; // lower baseline than longs (0.72)
  const adjustedWinProbability = Math.max(0.25, Math.min(0.75,
    baseShortWinProb * (0.65 + composite * 0.50)
  ));

  // Shorts have tighter win range (smaller targets)
  const adjustedWinRange: [number, number] = [
    0.04 * (0.80 + microstructureSafety * 0.40),
    0.45 * (0.75 + microstructureSafety * 0.45),
  ];

  // Shorts have wider loss range (more adverse excursion)
  const adjustedLossRange: [number, number] = [
    -0.18 * frictionPenalty,
    -0.008 * frictionPenalty,
  ];

  // Step 6: Governance score
  const governanceScore = Math.max(0, Math.min(100,
    composite * 55 + (triggeredGates.length === 0 ? 30 : 0) + (regime.isTradeable ? 15 : 0)
  ));

  // Step 7: Expected expectancy
  const expectedExpectancy = decision === 'approved'
    ? adjustedWinProbability * ((adjustedWinRange[0] + adjustedWinRange[1]) / 2)
      + (1 - adjustedWinProbability) * ((adjustedLossRange[0] + adjustedLossRange[1]) / 2)
    : 0;

  const frictionCost = (1 - ctx.spreadStabilityRank / 100) * 0.20; // higher than longs (0.15)

  // Step 8: Entry signal (only if regime is tradeable)
  let entrySignal: ShortEntrySignal | null = null;
  if (regime.isTradeable && decision !== 'rejected') {
    entrySignal = {
      stage: 'trigger',
      indicatorSignature: getDefaultIndicatorSignature(regime.regime),
      confirmationType: getDefaultConfirmationType(regime.regime),
      bounceTolerancePassed: true, // Would be computed from price action in production
      details: `${regime.regime} confirmed with ${getDefaultConfirmationType(regime.regime)}`,
    };
  }

  // Step 9: Stop recommendation
  const stopRecommendation = {
    initialStopR: 1.5 + (1 - microstructureSafety) * 0.5,
    noShrinkCandles: config.defaultStopConfig.noShrinkCandleCount,
    trailActivationMfe: config.defaultStopConfig.trailActivationMfeMultiple,
  };

  return {
    decision,
    regimeClassification: regime,
    triggeredGates,
    multipliers,
    compositeScore: composite,
    governanceScore,
    entrySignal,
    stopRecommendation,
    adjustedWinProbability,
    adjustedWinRange,
    adjustedLossRange,
    expectedExpectancy,
    frictionCost,
  };
}

// ─── Helpers ───

function getDefaultIndicatorSignature(regime: string): string {
  switch (regime) {
    case 'shock-breakdown': return 'donchian20+adx14';
    case 'risk-off-impulse': return 'ema20-slope+roc9+vol';
    case 'liquidity-vacuum': return 'supertrend10+trendEff';
    case 'breakdown-continuation': return 'ichimoku-cloud+adx';
    default: return 'ema50+rsi14';
  }
}

function getDefaultConfirmationType(regime: string): ShortEntrySignal['confirmationType'] {
  switch (regime) {
    case 'shock-breakdown': return 'donchian-break';
    case 'risk-off-impulse': return 'ema-slope-roc';
    case 'liquidity-vacuum': return 'supertrend-flip';
    case 'breakdown-continuation': return 'ichimoku-cloud-break';
    default: return 'pivot-rejection';
  }
}
