// Trade Governance Engine — Intelligence-Driven Context Edition
// Evaluates every proposed trade through intelligence multipliers
// before allowing execution. Tuned for profitable FX scalping:
// major pairs prioritized, short durations, tight friction gates,
// session-aware aggressiveness, and forensic trade logging.
//
// REFACTORED: RNG-based context generation removed.
// Context now derived from real market data via getGovernanceContext().
// QuantLabs directional bias attached only after governance PASS.
// Shadow mode + structured decision logging added.

import type { VolatilityPhase, LiquiditySession } from './microstructureEngine';
import { getGovernanceContextCached, type TradeHistoryEntry } from './governanceContextProvider';
import { getQuantLabsDirection, type DirectionalBias, type QuantLabsDirectionResult } from './quantlabsDirectionProvider';
import {
  logGovernanceDecision,
  type GovernanceDecisionLog,
  type FinalDecision,
} from './governanceDecisionLogger';
import type { Timeframe } from '@/lib/market/types';

// ─── Re-export from microstructureEngine for convenience ───
export type { VolatilityPhase, LiquiditySession } from './microstructureEngine';

// ─── Shadow Mode Configuration ───

let SHADOW_MODE = false;

export function setShadowMode(enabled: boolean): void {
  SHADOW_MODE = enabled;
  console.log(`[GOVERNANCE] Shadow mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function isShadowMode(): boolean {
  return SHADOW_MODE;
}

// ─── Governance Input Types ───

export interface TradeProposal {
  index: number;
  pair: string;
  direction: 'long' | 'short';
  baseWinProbability: number;
  baseWinRange: [number, number];
  baseLossRange: [number, number];
}

export interface GovernanceContext {
  mtfAlignmentScore: number;
  htfSupports: boolean;
  mtfConfirms: boolean;
  ltfClean: boolean;
  volatilityPhase: VolatilityPhase;
  phaseConfidence: number;
  liquidityShockProb: number;
  spreadStabilityRank: number;
  frictionRatio: number;
  pairExpectancy: number;
  pairFavored: boolean;
  isMajorPair: boolean;
  currentSession: LiquiditySession;
  sessionAggressiveness: number;
  edgeDecaying: boolean;
  edgeDecayRate: number;
  overtradingThrottled: boolean;
  sequencingCluster: 'profit-momentum' | 'loss-cluster' | 'mixed' | 'neutral';
}

export type GovernanceDecision = 'approved' | 'rejected' | 'throttled';

export interface GovernanceResult {
  decision: GovernanceDecision;
  adjustedWinProbability: number;
  adjustedWinRange: [number, number];
  adjustedLossRange: [number, number];
  adjustedDuration: { min: number; max: number };
  adjustedDrawdownCap: number;
  multipliers: GovernanceMultipliers;
  rejectionReasons: string[];
  governanceScore: number;
  confidenceBoost: number;
  // ── Forensic fields for scalping dashboard ──
  captureRatio: number;
  expectedExpectancy: number;
  frictionCost: number;
  exitLatencyGrade: string;
  mtfAlignmentLabel: string;
  volatilityLabel: string;
  sessionLabel: string;
  tradeMode: 'scalp' | 'continuation';
}

export interface GovernanceMultipliers {
  mtfAlignment: number;
  regime: number;
  pairPerformance: number;
  microstructure: number;
  exitEfficiency: number;
  session: number;
  sequencing: number;
  composite: number;
}

// ─── Full Decision Output (Section 10 Contract) ───

export interface FullGovernanceDecisionResult {
  governanceDecision: GovernanceDecision;
  directionalBias: DirectionalBias | null;
  finalDecision: FinalDecision;
  finalDecisionReason: string;
  compositeScore: number;
  triggeredGates: string[];
  contextSnapshot: GovernanceContext;
  governanceResult: GovernanceResult;
  quantlabsResult: QuantLabsDirectionResult | null;
  shadowMode: boolean;
}

// ─── Aggregate Governance Stats ───

export interface GovernanceStats {
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  totalThrottled: number;
  rejectionRate: number;
  avgCompositeMultiplier: number;
  avgGovernanceScore: number;
  avgCaptureRatio: number;
  avgExpectancy: number;
  approvedWinRate: number;
  topRejectionReasons: { reason: string; count: number }[];
}

// ─── Session & Phase Labels ───

const SESSION_LABELS: Record<LiquiditySession, string> = {
  asian: 'Asian', 'london-open': 'London', 'ny-overlap': 'NY Overlap', 'late-ny': 'Late NY',
};

const PHASE_LABELS: Record<VolatilityPhase, string> = {
  compression: 'Compression', ignition: 'Ignition', expansion: 'Expansion', exhaustion: 'Exhaustion',
};

// ─── Multiplier Computation (Scalping-Tuned) ───
// PRESERVED EXACTLY from original implementation

const computeMTFMultiplier = (ctx: GovernanceContext): number => {
  if (ctx.htfSupports && ctx.mtfConfirms && ctx.ltfClean) {
    return 1.18 + (ctx.mtfAlignmentScore / 100) * 0.17;
  }
  if (ctx.htfSupports && ctx.mtfConfirms) {
    return 0.98 + (ctx.mtfAlignmentScore / 100) * 0.12;
  }
  if (ctx.htfSupports) {
    return 0.82 + (ctx.mtfAlignmentScore / 100) * 0.08;
  }
  return 0.55 + (ctx.mtfAlignmentScore / 100) * 0.10;
};

const computeRegimeMultiplier = (ctx: GovernanceContext): number => {
  const phaseMultipliers: Record<VolatilityPhase, number> = {
    compression: 0.55,
    ignition: 1.35,
    expansion: 1.25,
    exhaustion: 0.65,
  };
  const base = phaseMultipliers[ctx.volatilityPhase];
  return base * (0.75 + (ctx.phaseConfidence / 100) * 0.25);
};

const computePairMultiplier = (ctx: GovernanceContext): number => {
  const majorBonus = ctx.isMajorPair ? 1.08 : 0.92;
  if (ctx.pairFavored && ctx.pairExpectancy > 68) {
    return majorBonus * (1.05 + (ctx.pairExpectancy - 68) / 100 * 0.25);
  }
  if (ctx.pairExpectancy > 50) {
    return majorBonus * (0.90 + (ctx.pairExpectancy - 50) / 100 * 0.18);
  }
  return majorBonus * (0.65 + (ctx.pairExpectancy / 100) * 0.20);
};

const computeMicrostructureMultiplier = (ctx: GovernanceContext): number => {
  const spreadFactor = ctx.spreadStabilityRank / 100;
  const frictionFactor = Math.min(ctx.frictionRatio / 6, 1);
  const base = (spreadFactor * 0.55 + frictionFactor * 0.45);
  const shockPenalty = ctx.liquidityShockProb > 55 ? 0.78 : ctx.liquidityShockProb > 35 ? 0.90 : 1.0;
  return (0.60 + base * 0.55) * shockPenalty;
};

const computeExitEfficiencyMultiplier = (ctx: GovernanceContext): number => {
  const phaseExit: Record<VolatilityPhase, number> = {
    compression: 0.72,
    ignition: 1.20,
    expansion: 1.15,
    exhaustion: 0.78,
  };
  return phaseExit[ctx.volatilityPhase] * (0.88 + (ctx.spreadStabilityRank / 100) * 0.22);
};

const computeSessionMultiplier = (ctx: GovernanceContext): number => {
  const sessionBoost: Record<LiquiditySession, number> = {
    'london-open': 1.18,
    'ny-overlap': 1.12,
    asian: 0.78,
    'late-ny': 0.68,
  };
  return sessionBoost[ctx.currentSession];
};

const computeSequencingMultiplier = (ctx: GovernanceContext): number => {
  switch (ctx.sequencingCluster) {
    case 'profit-momentum': return 1.12;
    case 'loss-cluster': return 0.70;
    case 'mixed': return 0.85;
    case 'neutral': return 1.0;
  }
};

// ─── Rejection Gating (All 8 Gates PRESERVED) ───

const evaluateRejectionGates = (ctx: GovernanceContext): string[] => {
  const reasons: string[] = [];

  // Gate 1: Friction expectancy < 3×
  if (ctx.frictionRatio < 3) {
    reasons.push(`Friction ratio ${ctx.frictionRatio.toFixed(1)}× < 3× threshold`);
  }

  // Gate 2: No HTF support with poor alignment
  if (!ctx.htfSupports && ctx.mtfAlignmentScore < 35) {
    reasons.push(`MTF alignment ${ctx.mtfAlignmentScore.toFixed(0)}% without HTF support`);
  }

  // Gate 3: Edge decay
  if (ctx.edgeDecaying && ctx.edgeDecayRate > 20) {
    reasons.push(`Edge decaying ${ctx.edgeDecayRate.toFixed(0)}%`);
  }

  // Gate 4: Spread instability
  if (ctx.spreadStabilityRank < 30) {
    reasons.push(`Spread instability ${ctx.spreadStabilityRank.toFixed(0)}%`);
  }

  // Gate 5: Compression + low session
  if (ctx.sessionAggressiveness < 30 && ctx.volatilityPhase === 'compression') {
    reasons.push('Compression + low-activity session');
  }

  // Gate 6: Overtrading governor
  if (ctx.overtradingThrottled) {
    reasons.push('Anti-overtrading governor active');
  }

  // Gate 7: Loss cluster with weak alignment
  if (ctx.sequencingCluster === 'loss-cluster' && ctx.mtfAlignmentScore < 55) {
    reasons.push(`Loss cluster + weak alignment ${ctx.mtfAlignmentScore.toFixed(0)}%`);
  }

  // Gate 8: High shock probability outside ignition
  if (ctx.liquidityShockProb > 70 && ctx.volatilityPhase !== 'ignition') {
    reasons.push(`High shock risk ${ctx.liquidityShockProb.toFixed(0)}% outside ignition`);
  }

  return reasons;
};

// ─── Core Governance Evaluation (PRESERVED) ───

export const evaluateTradeProposal = (
  proposal: TradeProposal,
  ctx: GovernanceContext,
): GovernanceResult => {
  const mtfAlignment = computeMTFMultiplier(ctx);
  const regime = computeRegimeMultiplier(ctx);
  const pairPerformance = computePairMultiplier(ctx);
  const microstructure = computeMicrostructureMultiplier(ctx);
  const exitEfficiency = computeExitEfficiencyMultiplier(ctx);
  const session = computeSessionMultiplier(ctx);
  const sequencing = computeSequencingMultiplier(ctx);

  const composite = mtfAlignment * regime * pairPerformance * microstructure * exitEfficiency * session * sequencing;

  const multipliers: GovernanceMultipliers = {
    mtfAlignment, regime, pairPerformance, microstructure,
    exitEfficiency, session, sequencing, composite,
  };

  const rejectionReasons = evaluateRejectionGates(ctx);

  let decision: GovernanceDecision = 'approved';
  if (rejectionReasons.length >= 2) {
    decision = 'rejected';
  } else if (rejectionReasons.length === 1 || composite < 0.60) {
    decision = 'throttled';
  }

  const adjustedWinProbability = Math.max(0.30, Math.min(0.88,
    proposal.baseWinProbability * (0.70 + composite * 0.45)
  ));

  const winBoost = exitEfficiency * (ctx.spreadStabilityRank / 100);

  const adjustedWinRange: [number, number] = [
    proposal.baseWinRange[0] * (0.90 + winBoost * 0.40),
    proposal.baseWinRange[1] * (0.85 + winBoost * 0.45),
  ];

  const lossShrinker = Math.max(0.35, Math.min(1.0, 1.0 / (microstructure * session)));

  const adjustedLossRange: [number, number] = [
    proposal.baseLossRange[0] * lossShrinker,
    proposal.baseLossRange[1] * lossShrinker,
  ];

  const durationMap: Record<VolatilityPhase, { min: number; max: number }> = {
    compression: { min: 8, max: 45 },
    ignition: { min: 1, max: 15 },
    expansion: { min: 2, max: 25 },
    exhaustion: { min: 1, max: 12 },
  };

  const adjustedDrawdownCap = Math.max(0.15, 3.8 * (1 - (composite - 0.5) * 0.5));

  const governanceScore = Math.max(0, Math.min(100,
    composite * 60 + (rejectionReasons.length === 0 ? 25 : 0) + (ctx.isMajorPair ? 5 : 0)
  ));

  const confidenceBoost = composite > 1.1 ? 18 : composite > 0.9 ? 8 : composite > 0.7 ? -3 : -12;

  const captureRatio = decision === 'approved'
    ? Math.min(0.95, 0.45 + composite * 0.35 + (ctx.spreadStabilityRank / 100) * 0.1)
    : 0;

  const expectedExpectancy = decision === 'approved'
    ? adjustedWinProbability * ((adjustedWinRange[0] + adjustedWinRange[1]) / 2)
      + (1 - adjustedWinProbability) * ((adjustedLossRange[0] + adjustedLossRange[1]) / 2)
    : 0;

  const frictionCost = (1 - ctx.spreadStabilityRank / 100) * 0.15;

  const latencyScore = exitEfficiency * session;
  const exitLatencyGrade = latencyScore > 1.2 ? 'A' : latencyScore > 1.0 ? 'B' : latencyScore > 0.85 ? 'C' : 'D';

  const tradeMode: 'scalp' | 'continuation' =
    ctx.volatilityPhase === 'expansion' && ctx.htfSupports && ctx.mtfConfirms
      ? 'continuation'
      : 'scalp';

  const mtfAlignmentLabel = ctx.htfSupports && ctx.mtfConfirms && ctx.ltfClean
    ? 'Full Alignment'
    : ctx.htfSupports && ctx.mtfConfirms
      ? 'HTF+MTF Aligned'
      : ctx.htfSupports
        ? 'HTF Only'
        : 'Misaligned';

  return {
    decision,
    adjustedWinProbability,
    adjustedWinRange,
    adjustedLossRange,
    adjustedDuration: durationMap[ctx.volatilityPhase],
    adjustedDrawdownCap,
    multipliers,
    rejectionReasons,
    governanceScore,
    confidenceBoost,
    captureRatio,
    expectedExpectancy,
    frictionCost,
    exitLatencyGrade,
    mtfAlignmentLabel,
    volatilityLabel: PHASE_LABELS[ctx.volatilityPhase],
    sessionLabel: SESSION_LABELS[ctx.currentSession],
    tradeMode,
  };
};

// ─── Full Decision Orchestrator (Section 10 Output Contract) ───
// Combines governance evaluation + QuantLabs direction + shadow mode + logging

export const evaluateFullDecision = (
  proposal: TradeProposal,
  timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): FullGovernanceDecisionResult => {
  // ── Failsafe: Get real governance context ──
  let ctx: GovernanceContext;
  try {
    ctx = getGovernanceContextCached(proposal.pair, timeframe, tradeHistory);
  } catch (err) {
    console.error('[GOVERNANCE] Context retrieval failed — HARD BLOCK:', err);
    // Hard block: context failure = no trade
    const emptyMultipliers: GovernanceMultipliers = {
      mtfAlignment: 0, regime: 0, pairPerformance: 0, microstructure: 0,
      exitEfficiency: 0, session: 0, sequencing: 0, composite: 0,
    };
    return {
      governanceDecision: 'rejected',
      directionalBias: null,
      finalDecision: 'SKIP',
      finalDecisionReason: 'Governance context retrieval failed — HARD BLOCK',
      compositeScore: 0,
      triggeredGates: ['CONTEXT_FAILURE'],
      contextSnapshot: {} as GovernanceContext,
      governanceResult: {
        decision: 'rejected',
        adjustedWinProbability: 0,
        adjustedWinRange: [0, 0],
        adjustedLossRange: [0, 0],
        adjustedDuration: { min: 0, max: 0 },
        adjustedDrawdownCap: 0,
        multipliers: emptyMultipliers,
        rejectionReasons: ['Context retrieval failed'],
        governanceScore: 0,
        confidenceBoost: 0,
        captureRatio: 0,
        expectedExpectancy: 0,
        frictionCost: 0,
        exitLatencyGrade: 'F',
        mtfAlignmentLabel: 'Unavailable',
        volatilityLabel: 'Unknown',
        sessionLabel: 'Unknown',
        tradeMode: 'scalp',
      },
      quantlabsResult: null,
      shadowMode: SHADOW_MODE,
    };
  }

  // ── Step 1: Governance evaluation (WHEN to trade) ──
  const govResult = evaluateTradeProposal(proposal, ctx);

  // ── Step 2: Determine direction (only if governance PASS) ──
  let quantlabsResult: QuantLabsDirectionResult | null = null;
  let directionalBias: DirectionalBias | null = null;
  let finalDecision: FinalDecision = 'SKIP';
  let finalDecisionReason = '';

  if (govResult.decision === 'approved') {
    // QuantLabs direction retrieval
    quantlabsResult = getQuantLabsDirection(proposal.pair, timeframe);

    if (!quantlabsResult) {
      // Failsafe: signal retrieval failed → SKIP
      finalDecision = 'SKIP';
      finalDecisionReason = 'Directional signal unavailable';
      directionalBias = null;
    } else if (quantlabsResult.directionalBias === 'NEUTRAL') {
      finalDecision = 'SKIP';
      finalDecisionReason = 'Neutral directional bias';
      directionalBias = 'NEUTRAL';
    } else {
      directionalBias = quantlabsResult.directionalBias;
      finalDecision = directionalBias === 'LONG' ? 'BUY' : 'SELL';
      finalDecisionReason = `Governance approved + QuantLabs ${directionalBias} (confidence: ${(quantlabsResult.directionalConfidence * 100).toFixed(0)}%)`;
    }
  } else if (govResult.decision === 'throttled') {
    finalDecision = 'SKIP';
    finalDecisionReason = `Governance throttled: ${govResult.rejectionReasons[0] || 'composite below threshold'}`;
  } else {
    finalDecision = 'SKIP';
    finalDecisionReason = `Governance rejected: ${govResult.rejectionReasons.join(', ')}`;
  }

  // ── Step 3: Log decision (async, non-blocking) ──
  const decisionLog: GovernanceDecisionLog = {
    timestamp: Date.now(),
    symbol: proposal.pair,
    timeframe,
    governance: {
      multipliers: govResult.multipliers,
      compositeScore: govResult.multipliers.composite,
      gatesTriggered: govResult.rejectionReasons,
      governanceDecision: govResult.decision,
    },
    quantlabs: quantlabsResult ? {
      directionalBias: quantlabsResult.directionalBias,
      directionalConfidence: quantlabsResult.directionalConfidence,
      signalSnapshot: quantlabsResult.sourceSignals,
    } : null,
    finalDecision: {
      decision: finalDecision,
      reason: finalDecisionReason,
    },
    marketContextSnapshot: {
      spread: ctx.frictionRatio > 0 ? 1 / ctx.frictionRatio : 0, // inverse proxy
      atr: 0, // ATR embedded in context indirectly via phase/friction
      volatilityPhase: ctx.volatilityPhase,
      session: ctx.currentSession,
      frictionRatio: ctx.frictionRatio,
      mtfAlignmentScore: ctx.mtfAlignmentScore,
      spreadStabilityRank: ctx.spreadStabilityRank,
      liquidityShockProb: ctx.liquidityShockProb,
    },
  };

  logGovernanceDecision(decisionLog);

  return {
    governanceDecision: govResult.decision,
    directionalBias,
    finalDecision,
    finalDecisionReason,
    compositeScore: govResult.multipliers.composite,
    triggeredGates: govResult.rejectionReasons,
    contextSnapshot: ctx,
    governanceResult: govResult,
    quantlabsResult,
    shadowMode: SHADOW_MODE,
  };
};

// ─── Compute Aggregate Stats ───

export const computeGovernanceStats = (
  results: GovernanceResult[],
): GovernanceStats => {
  const approved = results.filter(r => r.decision === 'approved');
  const rejected = results.filter(r => r.decision === 'rejected');
  const throttled = results.filter(r => r.decision === 'throttled');

  const avgMultiplier = results.length > 0
    ? results.reduce((s, r) => s + r.multipliers.composite, 0) / results.length
    : 1;

  const avgScore = results.length > 0
    ? results.reduce((s, r) => s + r.governanceScore, 0) / results.length
    : 0;

  const avgCaptureRatio = approved.length > 0
    ? approved.reduce((s, r) => s + r.captureRatio, 0) / approved.length
    : 0;

  const avgExpectancy = approved.length > 0
    ? approved.reduce((s, r) => s + r.expectedExpectancy, 0) / approved.length
    : 0;

  const approvedWinRate = approved.length > 0
    ? approved.reduce((s, r) => s + r.adjustedWinProbability, 0) / approved.length
    : 0;

  const reasonCounts: Record<string, number> = {};
  for (const r of results) {
    for (const reason of r.rejectionReasons) {
      const key = reason.split('—')[0].split('(')[0].trim();
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
  }

  const topReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalProposed: results.length,
    totalApproved: approved.length,
    totalRejected: rejected.length,
    totalThrottled: throttled.length,
    rejectionRate: results.length > 0 ? rejected.length / results.length : 0,
    avgCompositeMultiplier: avgMultiplier,
    avgGovernanceScore: avgScore,
    avgCaptureRatio,
    avgExpectancy,
    approvedWinRate,
    topRejectionReasons: topReasons,
  };
};
