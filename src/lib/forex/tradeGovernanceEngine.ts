// Trade Governance Engine
// Evaluates every proposed trade through intelligence multipliers
// before allowing execution. Tuned for profitable FX scalping:
// major pairs prioritized, short durations, tight friction gates,
// session-aware aggressiveness, and forensic trade logging.

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

// ─── Priority Pairs (major FX with lowest friction) ───

const MAJOR_PAIRS = new Set([
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/JPY', 'GBP/JPY',
]);

// ─── Multiplier Computation (Scalping-Tuned) ───

const computeMTFMultiplier = (ctx: GovernanceContext): number => {
  if (ctx.htfSupports && ctx.mtfConfirms && ctx.ltfClean) {
    return 1.18 + (ctx.mtfAlignmentScore / 100) * 0.17; // 1.18-1.35
  }
  if (ctx.htfSupports && ctx.mtfConfirms) {
    return 0.98 + (ctx.mtfAlignmentScore / 100) * 0.12; // 0.98-1.10
  }
  if (ctx.htfSupports) {
    return 0.82 + (ctx.mtfAlignmentScore / 100) * 0.08; // 0.82-0.90
  }
  return 0.55 + (ctx.mtfAlignmentScore / 100) * 0.10;   // 0.55-0.65 — penalize harder
};

const computeRegimeMultiplier = (ctx: GovernanceContext): number => {
  // Scalping thrives in ignition/expansion, struggles in compression/exhaustion
  const phaseMultipliers: Record<VolatilityPhase, number> = {
    compression: 0.55,   // scalping dies in compression
    ignition: 1.35,      // breakout scalps excel
    expansion: 1.25,     // momentum continuation
    exhaustion: 0.65,    // high chop risk
  };
  const base = phaseMultipliers[ctx.volatilityPhase];
  return base * (0.75 + (ctx.phaseConfidence / 100) * 0.25);
};

const computePairMultiplier = (ctx: GovernanceContext): number => {
  // Major pairs get a structural bonus for lower friction
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
  const frictionFactor = Math.min(ctx.frictionRatio / 6, 1); // tighter: need 6x for max
  const base = (spreadFactor * 0.55 + frictionFactor * 0.45);
  // Liquidity shock penalizes scalping more aggressively
  const shockPenalty = ctx.liquidityShockProb > 55 ? 0.78 : ctx.liquidityShockProb > 35 ? 0.90 : 1.0;
  return (0.60 + base * 0.55) * shockPenalty;
};

const computeExitEfficiencyMultiplier = (ctx: GovernanceContext): number => {
  // Scalping exit efficiency is regime-dependent
  const phaseExit: Record<VolatilityPhase, number> = {
    compression: 0.72,
    ignition: 1.20,
    expansion: 1.15,
    exhaustion: 0.78,
  };
  return phaseExit[ctx.volatilityPhase] * (0.88 + (ctx.spreadStabilityRank / 100) * 0.22);
};

const computeSessionMultiplier = (ctx: GovernanceContext): number => {
  // London/NY get boosted, Asian/Late-NY penalized for scalping
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
    case 'loss-cluster': return 0.70;  // more aggressive penalty
    case 'mixed': return 0.85;
    case 'neutral': return 1.0;
  }
};

// ─── Rejection Gating (Scalping-Tuned) ───

const evaluateRejectionGates = (ctx: GovernanceContext): string[] => {
  const reasons: string[] = [];

  // Gate 1: Friction expectancy < 3× (hard scalping requirement)
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

  // Gate 4: Spread instability (critical for scalping)
  if (ctx.spreadStabilityRank < 30) {
    reasons.push(`Spread instability ${ctx.spreadStabilityRank.toFixed(0)}%`);
  }

  // Gate 5: Compression + low session = no scalping opportunity
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

  // Gate 8: High shock probability during scalping
  if (ctx.liquidityShockProb > 70 && ctx.volatilityPhase !== 'ignition') {
    reasons.push(`High shock risk ${ctx.liquidityShockProb.toFixed(0)}% outside ignition`);
  }

  return reasons;
};

// ─── Session Labels ───

const SESSION_LABELS: Record<LiquiditySession, string> = {
  asian: 'Asian', 'london-open': 'London', 'ny-overlap': 'NY Overlap', 'late-ny': 'Late NY',
};

const PHASE_LABELS: Record<VolatilityPhase, string> = {
  compression: 'Compression', ignition: 'Ignition', expansion: 'Expansion', exhaustion: 'Exhaustion',
};

// ─── Main Governance Evaluation ───

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

  // Scalping-tuned win probability
  const adjustedWinProbability = Math.max(0.18, Math.min(0.85,
    proposal.baseWinProbability * composite
  ));

  // P&L range shaping
  const winBoost = exitEfficiency * (ctx.spreadStabilityRank / 100);
  const lossReduction = microstructure * session;

  const adjustedWinRange: [number, number] = [
    proposal.baseWinRange[0] * (0.85 + winBoost * 0.35),
    proposal.baseWinRange[1] * (0.88 + winBoost * 0.30),
  ];

  // Scalping: tighter losses in good conditions, losers close faster
  const adjustedLossRange: [number, number] = [
    proposal.baseLossRange[0] * (0.50 + lossReduction * 0.40),
    proposal.baseLossRange[1] * (0.75 + lossReduction * 0.20),
  ];

  // Ultra-scalping duration windows (minutes) — high-volume, fast turnover
  const durationMap: Record<VolatilityPhase, { min: number; max: number }> = {
    compression: { min: 8, max: 45 },      // even compression = short scalps
    ignition: { min: 1, max: 15 },         // lightning breakout scalps
    expansion: { min: 2, max: 25 },        // quick momentum capture
    exhaustion: { min: 1, max: 12 },       // fastest exits, minimal exposure
  };

  // Drawdown cap (tighter for scalping)
  const adjustedDrawdownCap = Math.max(0.15, 3.8 * (1 - (composite - 0.5) * 0.5));

  const governanceScore = Math.max(0, Math.min(100,
    composite * 60 + (rejectionReasons.length === 0 ? 25 : 0) + (ctx.isMajorPair ? 5 : 0)
  ));

  const confidenceBoost = composite > 1.1 ? 18 : composite > 0.9 ? 8 : composite > 0.7 ? -3 : -12;

  // Forensic fields
  const captureRatio = decision === 'approved'
    ? Math.min(0.95, 0.45 + composite * 0.35 + (ctx.spreadStabilityRank / 100) * 0.1)
    : 0;

  const expectedExpectancy = decision === 'approved'
    ? adjustedWinProbability * ((adjustedWinRange[0] + adjustedWinRange[1]) / 2)
      + (1 - adjustedWinProbability) * ((adjustedLossRange[0] + adjustedLossRange[1]) / 2)
    : 0;

  const frictionCost = (1 - ctx.spreadStabilityRank / 100) * 0.15;

  // Exit latency grade
  const latencyScore = exitEfficiency * session;
  const exitLatencyGrade = latencyScore > 1.2 ? 'A' : latencyScore > 1.0 ? 'B' : latencyScore > 0.85 ? 'C' : 'D';

  // Trade mode
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

// ─── Generate Governance Context for a Trade ───

export const generateGovernanceContext = (
  pair: string,
  tradeIndex: number,
): GovernanceContext => {
  const rng = new GovRNG(hashStr(`gov-${pair}-${tradeIndex}`));
  const displayPair = pair.includes('/') ? pair : `${pair.slice(0,3)}/${pair.slice(3)}`;
  const isMajor = MAJOR_PAIRS.has(displayPair);

  // Major pairs get structurally better microstructure conditions
  const majorBias = isMajor ? 0.12 : 0;

  const htf = rng.bool(0.60 + majorBias);
  const mtf = rng.bool(0.65 + majorBias);
  const ltf = rng.bool(0.58 + majorBias * 0.5);
  const mtfScore = (htf ? 40 : 0) + (mtf ? 35 : 0) + (ltf ? 25 : 0);

  // Volatility phase — scalping favors ignition/expansion
  const phases: VolatilityPhase[] = isMajor
    ? ['ignition', 'expansion', 'expansion', 'ignition', 'compression', 'exhaustion'] // bias toward actionable
    : ['compression', 'ignition', 'expansion', 'exhaustion'];
  const phase = rng.pick(phases);

  // Session — weight toward active sessions
  const sessions: LiquiditySession[] = isMajor
    ? ['london-open', 'ny-overlap', 'london-open', 'ny-overlap', 'asian', 'late-ny']
    : ['asian', 'london-open', 'ny-overlap', 'late-ny'];
  const session = rng.pick(sessions);
  const sessionAgg: Record<LiquiditySession, number> = {
    asian: 35, 'london-open': 88, 'ny-overlap': 78, 'late-ny': 22,
  };

  // Pair expectancy — majors inherently higher
  const pairSeedOffset = hashStr(pair) % 30;
  const baseExpectancy = isMajor ? 52 : 35;
  const pairExpectancy = rng.range(baseExpectancy + pairSeedOffset * 0.4, 90);
  const pairFavored = pairExpectancy > 65;

  const edgeDecaying = rng.bool(0.15);
  const edgeDecayRate = edgeDecaying ? rng.range(12, 40) : rng.range(0, 8);

  const clusters: GovernanceContext['sequencingCluster'][] = [
    'neutral', 'neutral', 'profit-momentum', 'profit-momentum', 'mixed', 'loss-cluster',
  ];
  const sequencingCluster = rng.pick(clusters);

  const overtradingThrottled = rng.bool(0.10);

  return {
    mtfAlignmentScore: mtfScore,
    htfSupports: htf,
    mtfConfirms: mtf,
    ltfClean: ltf,
    volatilityPhase: phase,
    phaseConfidence: rng.range(58, 96),
    liquidityShockProb: isMajor ? rng.range(3, 55) : rng.range(8, 75),
    spreadStabilityRank: isMajor ? rng.range(45, 98) : rng.range(20, 85),
    frictionRatio: isMajor ? rng.range(2.5, 9) : rng.range(1.2, 7),
    pairExpectancy,
    pairFavored,
    isMajorPair: isMajor,
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

  // Estimate approved win rate from adjusted probabilities
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
