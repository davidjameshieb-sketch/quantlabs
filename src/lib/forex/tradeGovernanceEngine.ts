// Trade Governance Engine
// Evaluates every proposed trade through intelligence multipliers
// before allowing execution. Replaces static RNG-driven outcomes
// with intelligence-governed probability reweighting.

import type { VolatilityPhase, LiquiditySession } from './microstructureEngine';

// ─── Seeded RNG (shared utility) ───

class GovRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(p = 0.5): boolean { return this.next() < p; }
  int(min: number, max: number): number { return Math.floor(this.range(min, max)); }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// ─── Governance Input Types ───

// Re-export from microstructureEngine for convenience
export type { VolatilityPhase, LiquiditySession } from './microstructureEngine';

export interface TradeProposal {
  index: number;
  pair: string;
  direction: 'long' | 'short';
  baseWinProbability: number;     // 0-1
  baseWinRange: [number, number]; // P&L % for wins
  baseLossRange: [number, number]; // P&L % for losses (negative)
}

export interface GovernanceContext {
  mtfAlignmentScore: number;        // 0-100
  htfSupports: boolean;
  mtfConfirms: boolean;
  ltfClean: boolean;
  volatilityPhase: VolatilityPhase;
  phaseConfidence: number;          // 0-100
  liquidityShockProb: number;       // 0-100
  spreadStabilityRank: number;      // 0-100
  frictionRatio: number;            // expected movement / friction
  pairExpectancy: number;           // 0-100 rolling pair score
  pairFavored: boolean;
  currentSession: LiquiditySession;
  sessionAggressiveness: number;    // 0-100
  edgeDecaying: boolean;
  edgeDecayRate: number;            // 0-100
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
  governanceScore: number;          // composite 0-100
  confidenceBoost: number;          // -20 to +20
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

// ─── Aggregate Governance Stats ───

export interface GovernanceStats {
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  totalThrottled: number;
  rejectionRate: number;
  avgCompositeMultiplier: number;
  avgGovernanceScore: number;
  topRejectionReasons: { reason: string; count: number }[];
}

// ─── Multiplier Computation ───

const computeMTFMultiplier = (ctx: GovernanceContext): number => {
  // Full alignment = 1.25, partial = 0.85-1.1, no alignment = 0.65
  if (ctx.htfSupports && ctx.mtfConfirms && ctx.ltfClean) {
    return 1.15 + (ctx.mtfAlignmentScore / 100) * 0.15; // 1.15-1.30
  }
  if (ctx.htfSupports && ctx.mtfConfirms) {
    return 0.95 + (ctx.mtfAlignmentScore / 100) * 0.15; // 0.95-1.10
  }
  if (ctx.htfSupports) {
    return 0.80 + (ctx.mtfAlignmentScore / 100) * 0.10; // 0.80-0.90
  }
  return 0.60 + (ctx.mtfAlignmentScore / 100) * 0.10;   // 0.60-0.70
};

const computeRegimeMultiplier = (ctx: GovernanceContext): number => {
  const phaseMultipliers: Record<VolatilityPhase, number> = {
    compression: 0.65,
    ignition: 1.30,
    expansion: 1.20,
    exhaustion: 0.70,
  };
  const base = phaseMultipliers[ctx.volatilityPhase];
  // Blend with phase confidence
  return base * (0.7 + (ctx.phaseConfidence / 100) * 0.3);
};

const computePairMultiplier = (ctx: GovernanceContext): number => {
  if (ctx.pairFavored && ctx.pairExpectancy > 70) {
    return 1.10 + (ctx.pairExpectancy - 70) / 100 * 0.3; // 1.10-1.19
  }
  if (ctx.pairExpectancy > 55) {
    return 0.95 + (ctx.pairExpectancy - 55) / 100 * 0.2; // 0.95-1.04
  }
  return 0.70 + (ctx.pairExpectancy / 100) * 0.25;        // 0.70-0.95
};

const computeMicrostructureMultiplier = (ctx: GovernanceContext): number => {
  // Spread stability contributes 50%, friction ratio contributes 50%
  const spreadFactor = ctx.spreadStabilityRank / 100; // 0-1
  const frictionFactor = Math.min(ctx.frictionRatio / 5, 1); // cap at 5x
  const base = (spreadFactor * 0.5 + frictionFactor * 0.5);
  // High liquidity shock probability penalizes
  const shockPenalty = ctx.liquidityShockProb > 60 ? 0.85 : ctx.liquidityShockProb > 40 ? 0.92 : 1.0;
  return (0.65 + base * 0.55) * shockPenalty; // 0.55-1.20 range
};

const computeExitEfficiencyMultiplier = (ctx: GovernanceContext): number => {
  // Based on pair expectancy and volatility phase suitability
  const phaseExit: Record<VolatilityPhase, number> = {
    compression: 0.80,  // exits harder in low vol
    ignition: 1.15,     // clean breakout exits
    expansion: 1.10,    // momentum exits work well
    exhaustion: 0.85,   // choppy exits
  };
  return phaseExit[ctx.volatilityPhase] * (0.85 + (ctx.spreadStabilityRank / 100) * 0.25);
};

const computeSessionMultiplier = (ctx: GovernanceContext): number => {
  return 0.75 + (ctx.sessionAggressiveness / 100) * 0.40; // 0.75-1.15
};

const computeSequencingMultiplier = (ctx: GovernanceContext): number => {
  switch (ctx.sequencingCluster) {
    case 'profit-momentum': return 1.10;
    case 'loss-cluster': return 0.75;
    case 'mixed': return 0.88;
    case 'neutral': return 1.0;
  }
};

// ─── Rejection Gating ───

const evaluateRejectionGates = (ctx: GovernanceContext): string[] => {
  const reasons: string[] = [];

  // Gate 1: Friction expectancy < 3×
  if (ctx.frictionRatio < 3) {
    reasons.push(`Friction ratio ${ctx.frictionRatio.toFixed(1)}× < 3× threshold`);
  }

  // Gate 2: MTF alignment too low (no HTF support)
  if (!ctx.htfSupports && ctx.mtfAlignmentScore < 40) {
    reasons.push(`MTF alignment ${ctx.mtfAlignmentScore.toFixed(0)}% without HTF support`);
  }

  // Gate 3: Edge decay active
  if (ctx.edgeDecaying && ctx.edgeDecayRate > 25) {
    reasons.push(`Edge decaying ${ctx.edgeDecayRate.toFixed(0)}% — setup recalibration needed`);
  }

  // Gate 4: Spread volatility unstable
  if (ctx.spreadStabilityRank < 25) {
    reasons.push(`Spread instability (${ctx.spreadStabilityRank.toFixed(0)}% rank)`);
  }

  // Gate 5: Session unfavorable + compression
  if (ctx.sessionAggressiveness < 30 && ctx.volatilityPhase === 'compression') {
    reasons.push(`Low-aggression session + compression phase`);
  }

  // Gate 6: Overtrading governor throttle
  if (ctx.overtradingThrottled) {
    reasons.push(`Anti-overtrading governor active`);
  }

  // Gate 7: Loss cluster + poor alignment
  if (ctx.sequencingCluster === 'loss-cluster' && ctx.mtfAlignmentScore < 60) {
    reasons.push(`Loss cluster with weak alignment (${ctx.mtfAlignmentScore.toFixed(0)}%)`);
  }

  return reasons;
};

// ─── Main Governance Evaluation ───

export const evaluateTradeProposal = (
  proposal: TradeProposal,
  ctx: GovernanceContext,
): GovernanceResult => {
  // Compute all multipliers
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

  // Check rejection gates
  const rejectionReasons = evaluateRejectionGates(ctx);

  // Determine decision
  let decision: GovernanceDecision = 'approved';
  if (rejectionReasons.length >= 2) {
    decision = 'rejected'; // 2+ gate failures = hard reject
  } else if (rejectionReasons.length === 1 || composite < 0.65) {
    decision = 'throttled'; // 1 gate failure or very low composite = throttled (treated as avoided)
  }

  // Adjusted win probability
  const adjustedWinProbability = Math.max(0.15, Math.min(0.88,
    proposal.baseWinProbability * composite
  ));

  // Adjust P&L ranges based on exit efficiency and microstructure
  const winBoost = exitEfficiency * (ctx.spreadStabilityRank / 100);
  const lossReduction = microstructure * session;

  const adjustedWinRange: [number, number] = [
    proposal.baseWinRange[0] * (0.8 + winBoost * 0.4),
    proposal.baseWinRange[1] * (0.85 + winBoost * 0.35),
  ];

  // Better conditions = tighter max loss (less damage)
  const adjustedLossRange: [number, number] = [
    proposal.baseLossRange[0] * (0.6 + lossReduction * 0.4), // max loss reduced when conditions good
    proposal.baseLossRange[1] * (0.8 + lossReduction * 0.2), // min loss stays close
  ];

  // Duration adjusts by regime
  const durationMap: Record<VolatilityPhase, { min: number; max: number }> = {
    compression: { min: 30, max: 480 },
    ignition: { min: 5, max: 120 },
    expansion: { min: 15, max: 360 },
    exhaustion: { min: 10, max: 90 },
  };

  // Drawdown cap
  const adjustedDrawdownCap = Math.max(0.2, 5.5 * (1 - (composite - 0.5) * 0.4));

  // Governance score (0-100)
  const governanceScore = Math.max(0, Math.min(100, composite * 65 + (rejectionReasons.length === 0 ? 20 : 0)));

  // Confidence boost
  const confidenceBoost = composite > 1.1 ? 15 : composite > 0.9 ? 5 : composite > 0.7 ? -5 : -15;

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
  };
};

// ─── Generate Governance Context for a Trade ───

export const generateGovernanceContext = (
  pair: string,
  tradeIndex: number,
): GovernanceContext => {
  const rng = new GovRNG(hashStr(`gov-${pair}-${tradeIndex}`));

  // MTF alignment
  const htf = rng.bool(0.62);
  const mtf = rng.bool(0.68);
  const ltf = rng.bool(0.58);
  const mtfScore = (htf ? 40 : 0) + (mtf ? 35 : 0) + (ltf ? 25 : 0);

  // Volatility phase
  const phase = rng.pick<VolatilityPhase>(['compression', 'ignition', 'expansion', 'exhaustion']);

  // Session
  const session = rng.pick<LiquiditySession>(['asian', 'london-open', 'ny-overlap', 'late-ny']);
  const sessionAgg: Record<LiquiditySession, number> = {
    asian: 35, 'london-open': 85, 'ny-overlap': 75, 'late-ny': 25,
  };

  // Pair expectancy (some pairs are inherently more tradable)
  const pairSeedOffset = hashStr(pair) % 30;
  const pairExpectancy = rng.range(35 + pairSeedOffset * 0.5, 88);
  const pairFavored = pairExpectancy > 65;

  // Edge decay
  const edgeDecaying = rng.bool(0.18);
  const edgeDecayRate = edgeDecaying ? rng.range(15, 45) : rng.range(0, 10);

  // Sequencing
  const clusters: GovernanceContext['sequencingCluster'][] = ['neutral', 'neutral', 'profit-momentum', 'mixed', 'loss-cluster'];
  const sequencingCluster = rng.pick(clusters);

  // Overtrading
  const overtradingThrottled = rng.bool(0.12);

  return {
    mtfAlignmentScore: mtfScore,
    htfSupports: htf,
    mtfConfirms: mtf,
    ltfClean: ltf,
    volatilityPhase: phase,
    phaseConfidence: rng.range(55, 95),
    liquidityShockProb: rng.range(5, 80),
    spreadStabilityRank: rng.range(20, 98),
    frictionRatio: rng.range(1.5, 8),
    pairExpectancy,
    pairFavored,
    currentSession: session,
    sessionAggressiveness: sessionAgg[session],
    edgeDecaying,
    edgeDecayRate,
    overtradingThrottled,
    sequencingCluster,
  };
};

// ─── Compute Aggregate Stats ───

export const computeGovernanceStats = (
  results: GovernanceResult[],
): GovernanceStats => {
  const approved = results.filter(r => r.decision === 'approved').length;
  const rejected = results.filter(r => r.decision === 'rejected').length;
  const throttled = results.filter(r => r.decision === 'throttled').length;

  const avgMultiplier = results.length > 0
    ? results.reduce((s, r) => s + r.multipliers.composite, 0) / results.length
    : 1;

  const avgScore = results.length > 0
    ? results.reduce((s, r) => s + r.governanceScore, 0) / results.length
    : 0;

  // Top rejection reasons
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
    totalApproved: approved,
    totalRejected: rejected,
    totalThrottled: throttled,
    rejectionRate: results.length > 0 ? rejected / results.length : 0,
    avgCompositeMultiplier: avgMultiplier,
    avgGovernanceScore: avgScore,
    topRejectionReasons: topReasons,
  };
};
