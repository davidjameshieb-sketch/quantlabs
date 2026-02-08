// Exit Efficiency Engine
// Implements dynamic exit intelligence: volatility-adaptive trailing,
// time decay filters, runner protection, partial profit stabilization,
// and reversal confirmation exits.

import { TimeframeLayer, TimeframeAlignmentState, CrossTimeframeAlignment } from './mtfTypes';

// ─── Seeded RNG ───

class ExitRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(prob = 0.5): boolean { return this.next() < prob; }
}

// ─── Types ───

export type VolatilityRegime = 'contracting' | 'stable' | 'expanding' | 'explosive';

export interface VolatilityAdaptiveTrailing {
  currentATR: number;
  trailingWidth: number;           // ATR multiple
  regime: VolatilityRegime;
  htfTrendContinuation: boolean;
  adjustmentFactor: number;        // multiplier applied based on regime
  description: string;
}

export interface TimeDecayFilter {
  maxStaleBars: number;            // candles allowed without progression
  currentBarsSinceProgress: number;
  progressThreshold: number;       // min R-multiple move to reset decay
  capitalStagnationDetected: boolean;
  staleTradePenalty: number;       // 0-1, applied to position confidence
  description: string;
}

export interface RunnerProtection {
  htfPersistenceScore: number;
  runnerPermitted: boolean;
  extendedTrailingWidth: number;   // wider ATR multiple
  htfMinPersistence: number;
  survivedBars: number;
  maxExtension: number;            // max bars runner can extend
  description: string;
}

export interface PartialProfitTier {
  triggerR: number;
  scalePct: number;
  volatilityAdjusted: boolean;
  executedAt: number | null;       // timestamp or null if pending
  adjustedTrigger: number;         // after volatility adjustment
}

export interface PartialProfitStabilization {
  tiers: PartialProfitTier[];
  totalScaled: number;             // % already scaled out
  runnerRemaining: number;         // % still running
  adaptiveTrailingOnRunner: boolean;
  description: string;
}

export interface ReversalConfirmation {
  structuralBreakDetected: boolean;
  momentumInversionDetected: boolean;
  volatilityShiftDetected: boolean;
  allConfirmed: boolean;           // all 3 must be true
  confirmationScore: number;       // 0-100
  description: string;
}

export interface ExitEfficiencyModule {
  id: string;
  name: string;
  active: boolean;
  triggerDistance: number;          // 0-100
  priority: number;                // 1=highest
  description: string;
}

export interface ExitEfficiencyState {
  volatilityTrailing: VolatilityAdaptiveTrailing;
  timeDecay: TimeDecayFilter;
  runnerProtection: RunnerProtection;
  partialProfits: PartialProfitStabilization;
  reversalConfirmation: ReversalConfirmation;
  activeModules: ExitEfficiencyModule[];

  // Performance KPIs
  sharpeRatio: number;
  profitFactor: number;
  capitalUtilizationSpeed: number; // 0-1, measures capital efficiency
  exitConsistencyScore: number;    // 0-100 across regimes
  avgExitLatencyBars: number;
  
  timestamp: number;
}

// ─── Engine ───

const computeVolatilityRegime = (rng: ExitRNG): VolatilityRegime => {
  const r = rng.next();
  if (r < 0.25) return 'contracting';
  if (r < 0.55) return 'stable';
  if (r < 0.8) return 'expanding';
  return 'explosive';
};

const generateVolatilityTrailing = (
  regime: VolatilityRegime,
  htfStrong: boolean,
  rng: ExitRNG
): VolatilityAdaptiveTrailing => {
  const baseATR = rng.range(0.8, 2.5);
  const adjustments: Record<VolatilityRegime, number> = {
    contracting: 0.7,   // tighten
    stable: 1.0,
    expanding: 1.3,
    explosive: 1.6,
  };
  const factor = adjustments[regime];
  const htfBoost = htfStrong ? 1.2 : 1.0;

  return {
    currentATR: baseATR,
    trailingWidth: baseATR * factor * htfBoost,
    regime,
    htfTrendContinuation: htfStrong,
    adjustmentFactor: factor * htfBoost,
    description: regime === 'contracting'
      ? 'Volatility contracting — trailing tightened to lock gains'
      : htfStrong
        ? `${regime} volatility but HTF trend strong — trailing relaxed with ${(factor * htfBoost).toFixed(1)}x adjustment`
        : `${regime} volatility — standard ${factor.toFixed(1)}x trailing adjustment`,
  };
};

const generateTimeDecay = (rng: ExitRNG): TimeDecayFilter => {
  const maxStale = Math.floor(rng.range(8, 25));
  const current = Math.floor(rng.range(0, maxStale + 5));
  const stagnant = current >= maxStale;

  return {
    maxStaleBars: maxStale,
    currentBarsSinceProgress: current,
    progressThreshold: rng.range(0.3, 0.8),
    capitalStagnationDetected: stagnant,
    staleTradePenalty: stagnant ? rng.range(0.3, 0.7) : 0,
    description: stagnant
      ? `Capital stagnation: ${current} bars without ${(0.5 * 100).toFixed(0)}% R progression — exit recommended`
      : `Trade progressing: ${current}/${maxStale} bars since last progress checkpoint`,
  };
};

const generateRunnerProtection = (htfPersistence: number, rng: ExitRNG): RunnerProtection => {
  const minPersistence = 65;
  const permitted = htfPersistence >= minPersistence;

  return {
    htfPersistenceScore: htfPersistence,
    runnerPermitted: permitted,
    extendedTrailingWidth: permitted ? rng.range(3.0, 5.0) : 0,
    htfMinPersistence: minPersistence,
    survivedBars: permitted ? Math.floor(rng.range(15, 80)) : 0,
    maxExtension: Math.floor(rng.range(50, 150)),
    description: permitted
      ? `HTF persistence ${htfPersistence.toFixed(0)}% ≥ ${minPersistence}% — runner protected with extended trailing`
      : `HTF persistence ${htfPersistence.toFixed(0)}% < ${minPersistence}% — runner protection disabled`,
  };
};

const generatePartialProfits = (regime: VolatilityRegime, rng: ExitRNG): PartialProfitStabilization => {
  const volMultiplier = regime === 'expanding' ? 1.3 : regime === 'contracting' ? 0.8 : 1.0;

  const tiers: PartialProfitTier[] = [
    { triggerR: 1.0, scalePct: 20, volatilityAdjusted: true, executedAt: rng.bool(0.6) ? Date.now() - rng.range(1e5, 1e7) : null, adjustedTrigger: 1.0 * volMultiplier },
    { triggerR: 2.0, scalePct: 25, volatilityAdjusted: true, executedAt: rng.bool(0.4) ? Date.now() - rng.range(1e5, 1e7) : null, adjustedTrigger: 2.0 * volMultiplier },
    { triggerR: 3.5, scalePct: 30, volatilityAdjusted: true, executedAt: rng.bool(0.2) ? Date.now() - rng.range(1e5, 1e7) : null, adjustedTrigger: 3.5 * volMultiplier },
  ];

  const totalScaled = tiers.filter(t => t.executedAt !== null).reduce((s, t) => s + t.scalePct, 0);

  return {
    tiers,
    totalScaled,
    runnerRemaining: 100 - totalScaled,
    adaptiveTrailingOnRunner: totalScaled > 40,
    description: `${totalScaled}% scaled out across ${tiers.filter(t => t.executedAt).length} tiers — ${100 - totalScaled}% runner with ${totalScaled > 40 ? 'adaptive' : 'standard'} trailing`,
  };
};

const generateReversalConfirmation = (rng: ExitRNG): ReversalConfirmation => {
  const structural = rng.bool(0.35);
  const momentum = rng.bool(0.4);
  const volatility = rng.bool(0.3);
  const all = structural && momentum && volatility;
  const score = (structural ? 33 : 0) + (momentum ? 33 : 0) + (volatility ? 34 : 0);

  return {
    structuralBreakDetected: structural,
    momentumInversionDetected: momentum,
    volatilityShiftDetected: volatility,
    allConfirmed: all,
    confirmationScore: score,
    description: all
      ? 'Full reversal confirmed: structural break + momentum inversion + volatility shift'
      : `Partial reversal: ${[structural && 'structural', momentum && 'momentum', volatility && 'volatility'].filter(Boolean).join(' + ') || 'none detected'}`,
  };
};

// ─── Main Export ───

export const createExitEfficiencyState = (): ExitEfficiencyState => {
  const rng = new ExitRNG(421);

  const regime = computeVolatilityRegime(rng);
  const htfStrong = rng.bool(0.6);
  const htfPersistence = rng.range(40, 92);

  const volatilityTrailing = generateVolatilityTrailing(regime, htfStrong, rng);
  const timeDecay = generateTimeDecay(rng);
  const runnerProtection = generateRunnerProtection(htfPersistence, rng);
  const partialProfits = generatePartialProfits(regime, rng);
  const reversalConfirmation = generateReversalConfirmation(rng);

  const modules: ExitEfficiencyModule[] = [
    { id: 'vol-trailing', name: 'Volatility-Adaptive Trailing', active: true, triggerDistance: rng.range(20, 80), priority: 1, description: volatilityTrailing.description },
    { id: 'time-decay', name: 'Time Decay Filter', active: timeDecay.capitalStagnationDetected, triggerDistance: timeDecay.capitalStagnationDetected ? rng.range(75, 100) : rng.range(10, 40), priority: 2, description: timeDecay.description },
    { id: 'runner-protect', name: 'MTF Runner Protection', active: runnerProtection.runnerPermitted, triggerDistance: runnerProtection.runnerPermitted ? rng.range(5, 30) : 0, priority: 3, description: runnerProtection.description },
    { id: 'partial-profit', name: 'Partial Profit Stabilization', active: true, triggerDistance: rng.range(30, 70), priority: 4, description: partialProfits.description },
    { id: 'reversal-confirm', name: 'Reversal Confirmation Exit', active: reversalConfirmation.confirmationScore > 50, triggerDistance: reversalConfirmation.confirmationScore, priority: 5, description: reversalConfirmation.description },
  ];

  return {
    volatilityTrailing,
    timeDecay,
    runnerProtection,
    partialProfits,
    reversalConfirmation,
    activeModules: modules,

    sharpeRatio: rng.range(1.1, 2.8),
    profitFactor: rng.range(1.4, 3.2),
    capitalUtilizationSpeed: rng.range(0.55, 0.92),
    exitConsistencyScore: rng.range(62, 95),
    avgExitLatencyBars: rng.range(1.2, 5.5),

    timestamp: Date.now(),
  };
};
