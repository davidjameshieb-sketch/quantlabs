// Forex Market Microstructure Intelligence Engine
// Spread stability, liquidity shock detection, volatility state ladder,
// session qualification, pair personality modeling, trade sequencing,
// edge decay monitoring, and anti-overtrading governance.

// ─── Seeded RNG ───

class MicroRNG {
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

// ─── Volatility State Ladder ───

export type VolatilityPhase = 'compression' | 'ignition' | 'expansion' | 'exhaustion';

export const VOLATILITY_PHASE_CONFIG: Record<VolatilityPhase, {
  label: string;
  scalpingPolicy: string;
  aggressiveness: 'avoid' | 'aggressive' | 'momentum' | 'defensive';
  color: string;
}> = {
  compression: {
    label: 'Compression',
    scalpingPolicy: 'Avoid or prepare breakout setups',
    aggressiveness: 'avoid',
    color: 'text-muted-foreground',
  },
  ignition: {
    label: 'Ignition',
    scalpingPolicy: 'Aggressive breakout scalping permitted',
    aggressiveness: 'aggressive',
    color: 'text-[hsl(var(--neural-green))]',
  },
  expansion: {
    label: 'Expansion',
    scalpingPolicy: 'Momentum continuation scalps',
    aggressiveness: 'momentum',
    color: 'text-[hsl(var(--neural-cyan))]',
  },
  exhaustion: {
    label: 'Exhaustion',
    scalpingPolicy: 'Defensive exit bias — tighten stops',
    aggressiveness: 'defensive',
    color: 'text-[hsl(var(--neural-orange))]',
  },
};

// ─── Liquidity Session ───

export type LiquiditySession = 'asian' | 'london-open' | 'ny-overlap' | 'late-ny';

export const SESSION_CONFIG: Record<LiquiditySession, {
  label: string;
  strategy: string;
  aggressiveness: number; // 0-100
}> = {
  asian: { label: 'Asian Session', strategy: 'Range/mean reversion if volatility supports', aggressiveness: 35 },
  'london-open': { label: 'London Open', strategy: 'Breakout ignition scalps prioritized', aggressiveness: 85 },
  'ny-overlap': { label: 'NY Overlap', strategy: 'Momentum continuation scalps', aggressiveness: 75 },
  'late-ny': { label: 'Late NY', strategy: 'Reduce aggressiveness — tighten exits', aggressiveness: 25 },
};

// ─── Forex Scalping Leakage (Extended A-H) ───

export type ForexLeakageCategory =
  | 'spread-friction-loss'
  | 'premature-htf-exit'
  | 'late-ltf-reversal-exit'
  | 'stagnation-time-decay'
  | 'chop-regime-overtrading'
  | 'trailing-vol-mismatch'
  | 'liquidity-shock-misread'
  | 'trade-sequencing-degradation';

export const FOREX_LEAKAGE_LABELS: Record<ForexLeakageCategory, string> = {
  'spread-friction-loss': 'A. Spread Friction Loss',
  'premature-htf-exit': 'B. Premature HTF Exit',
  'late-ltf-reversal-exit': 'C. Late LTF Reversal Exit',
  'stagnation-time-decay': 'D. Stagnation Time Decay',
  'chop-regime-overtrading': 'E. Chop Regime Overtrading',
  'trailing-vol-mismatch': 'F. Trailing Vol Mismatch',
  'liquidity-shock-misread': 'G. Liquidity Shock Misread',
  'trade-sequencing-degradation': 'H. Sequencing Degradation',
};

// ─── Scalping Trade Mode ───

export type ScalpTradeMode = 'scalp' | 'continuation';

// ─── Core Microstructure Types ───

export interface SpreadStability {
  currentSpread: number;         // pips
  avgSpread: number;
  spreadVolatility: number;      // std dev of spread
  spreadStabilityRank: number;   // 0-100
  driftDetected: boolean;
  description: string;
}

export interface LiquidityShockDetector {
  shockProbability: number;      // 0-100
  priceAcceleration: number;     // normalized 0-1
  orderImbalance: number;        // -1 to 1
  stopCascadeRisk: number;       // 0-100
  breakoutSignal: boolean;
  description: string;
}

export interface FrictionExpectancy {
  expectedMovement: number;      // pips
  totalFriction: number;         // spread + slippage
  frictionRatio: number;         // movement / friction
  passesGate: boolean;           // ratio >= 3
  description: string;
}

export interface VolatilityState {
  phase: VolatilityPhase;
  atrCurrent: number;
  atrAverage: number;
  compressionRatio: number;      // current/avg
  phaseConfidence: number;       // 0-100
}

export interface SessionQualification {
  currentSession: LiquiditySession;
  sessionAggressiveness: number; // 0-100
  isQualified: boolean;
  constraint: string;
}

export interface MTFAlignmentGate {
  htfSupports: boolean;
  mtfConfirms: boolean;
  ltfClean: boolean;
  overallPass: boolean;
  alignmentScore: number;       // 0-100
  description: string;
}

// ─── Pair Personality ───

export interface PairPersonality {
  pair: string;
  optimalDurationWindow: { min: number; max: number }; // minutes
  volatilityResponsiveness: number; // 0-100
  spreadStabilityRank: number;      // 0-100
  sessionExpectancy: Record<LiquiditySession, number>; // win rate by session
  scalpingSuccessRate: Record<VolatilityPhase, number>; // by regime
  rollingExpectancy: number;        // overall expectancy score 0-100
  favored: boolean;                 // top-tier pair
}

// ─── Trade Sequencing ───

export interface TradeSequencing {
  recentOutcomes: ('win' | 'loss')[];
  clusterType: 'profit-momentum' | 'loss-cluster' | 'mixed' | 'neutral';
  confidenceAdjustment: number;     // -20 to +20
  densityAdjustment: number;        // -30 to +30 (% change)
  edgeDegradation: boolean;
  description: string;
}

// ─── Edge Decay ───

export interface EdgeDecayMonitor {
  rollingExpectancy: number;        // current
  baselineExpectancy: number;       // historical
  decayRate: number;                // % decline
  isDecaying: boolean;
  throttleActive: boolean;
  filterTightening: number;         // 0-100
  description: string;
}

// ─── Anti-Overtrading Governor ───

export interface AntiOvertradingGovernor {
  captureRatioTrend: 'improving' | 'stable' | 'declining';
  spreadFrictionTrend: 'improving' | 'stable' | 'worsening';
  durationEfficiencyTrend: 'improving' | 'stable' | 'declining';
  winRateRolling: number;
  winRateThreshold: number;
  isThrottled: boolean;
  throttleReasons: string[];
  tradeDensityLimit: number;        // max trades per session
  currentDensity: number;
  description: string;
}

// ─── Scalping Decision Packet ───

export interface ScalpingDecisionPacket {
  tradeMode: ScalpTradeMode;
  pair: string;
  direction: 'long' | 'short';
  mtfAlignment: MTFAlignmentGate;
  volatilityState: VolatilityState;
  liquidityShockScore: number;
  spreadEfficiency: number;         // 0-100
  expectedDuration: { min: number; max: number }; // minutes
  exitPolicyName: string;
  riskEnvelope: number;             // % of capital
  justification: string;
  gatingPassed: boolean;
  gatingFailures: string[];
}

// ─── Forex Leakage Attribution ───

export interface ForexLeakageAttribution {
  category: ForexLeakageCategory;
  totalPnlImpact: number;
  occurrenceCount: number;
  avgImpactPerTrade: number;
  severity: 'minor' | 'moderate' | 'critical';
  percentOfTotal: number;
  recommendation: string;
}

// ─── Composite State ───

export interface ForexMicrostructureState {
  spreadStability: SpreadStability;
  liquidityShock: LiquidityShockDetector;
  frictionExpectancy: FrictionExpectancy;
  volatilityState: VolatilityState;
  sessionQualification: SessionQualification;
  mtfGate: MTFAlignmentGate;
  pairPersonalities: PairPersonality[];
  tradeSequencing: TradeSequencing;
  edgeDecay: EdgeDecayMonitor;
  governor: AntiOvertradingGovernor;
  decisionPackets: ScalpingDecisionPacket[];
  forexLeakage: ForexLeakageAttribution[];
  metaControllerMode: ScalpTradeMode;
  timestamp: number;
}

// ─── Engine ───

const TOP_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/GBP', 'GBP/JPY', 'EUR/JPY', 'AUD/JPY', 'NZD/USD',
];

const generateSpreadStability = (rng: MicroRNG): SpreadStability => {
  const current = rng.range(0.3, 3.5);
  const avg = rng.range(0.5, 2.0);
  const vol = rng.range(0.1, 1.2);
  const rank = Math.max(0, Math.min(100, 100 - vol * 60));
  const drift = vol > 0.8;
  return {
    currentSpread: current,
    avgSpread: avg,
    spreadVolatility: vol,
    spreadStabilityRank: rank,
    driftDetected: drift,
    description: drift
      ? `Spread volatility elevated (${vol.toFixed(2)}σ) — widening drift detected`
      : `Spreads stable at ${current.toFixed(1)} pips — ${rank.toFixed(0)}% stability`,
  };
};

const generateLiquidityShock = (rng: MicroRNG): LiquidityShockDetector => {
  const shockProb = rng.range(5, 85);
  const accel = rng.range(0, 1);
  const imbalance = rng.range(-1, 1);
  const cascade = rng.range(0, 100);
  const breakout = shockProb > 60 && accel > 0.6;
  return {
    shockProbability: shockProb,
    priceAcceleration: accel,
    orderImbalance: imbalance,
    stopCascadeRisk: cascade,
    breakoutSignal: breakout,
    description: breakout
      ? `Liquidity shock likely (${shockProb.toFixed(0)}%) — stop cascade risk ${cascade.toFixed(0)}%`
      : `Liquidity normal — shock probability ${shockProb.toFixed(0)}%`,
  };
};

const generateFrictionExpectancy = (rng: MicroRNG): FrictionExpectancy => {
  const movement = rng.range(3, 25);
  const friction = rng.range(0.5, 5);
  const ratio = movement / friction;
  const passes = ratio >= 3;
  return {
    expectedMovement: movement,
    totalFriction: friction,
    frictionRatio: ratio,
    passesGate: passes,
    description: passes
      ? `Expectancy ${ratio.toFixed(1)}× friction — trade permitted`
      : `Expectancy ${ratio.toFixed(1)}× friction < 3× — trade REJECTED`,
  };
};

const generateVolatilityState = (rng: MicroRNG): VolatilityState => {
  const phase = rng.pick<VolatilityPhase>(['compression', 'ignition', 'expansion', 'exhaustion']);
  const atrCurrent = rng.range(5, 30);
  const atrAvg = rng.range(8, 20);
  return {
    phase,
    atrCurrent,
    atrAverage: atrAvg,
    compressionRatio: atrCurrent / atrAvg,
    phaseConfidence: rng.range(55, 95),
  };
};

const generateSessionQualification = (rng: MicroRNG): SessionQualification => {
  const session = rng.pick<LiquiditySession>(['asian', 'london-open', 'ny-overlap', 'late-ny']);
  const config = SESSION_CONFIG[session];
  const qualified = config.aggressiveness > 30;
  return {
    currentSession: session,
    sessionAggressiveness: config.aggressiveness,
    isQualified: qualified,
    constraint: qualified ? config.strategy : 'Session conditions unfavorable — reduce activity',
  };
};

const generateMTFGate = (rng: MicroRNG): MTFAlignmentGate => {
  const htf = rng.bool(0.65);
  const mtf = rng.bool(0.7);
  const ltf = rng.bool(0.6);
  const pass = htf && mtf && ltf;
  const score = ((htf ? 40 : 0) + (mtf ? 35 : 0) + (ltf ? 25 : 0));
  return {
    htfSupports: htf,
    mtfConfirms: mtf,
    ltfClean: ltf,
    overallPass: pass,
    alignmentScore: score,
    description: pass
      ? `All timeframes aligned (${score}%) — entry permitted`
      : `MTF conflict detected (${score}%) — entry BLOCKED`,
  };
};

const generatePairPersonalities = (rng: MicroRNG): PairPersonality[] => {
  return TOP_PAIRS.map(pair => {
    const sessions: Record<LiquiditySession, number> = {
      asian: rng.range(30, 65),
      'london-open': rng.range(45, 80),
      'ny-overlap': rng.range(40, 75),
      'late-ny': rng.range(25, 55),
    };
    const regimes: Record<VolatilityPhase, number> = {
      compression: rng.range(20, 50),
      ignition: rng.range(50, 85),
      expansion: rng.range(45, 75),
      exhaustion: rng.range(20, 45),
    };
    const expectancy = rng.range(35, 88);
    return {
      pair,
      optimalDurationWindow: { min: rng.int(3, 15), max: rng.int(20, 90) },
      volatilityResponsiveness: rng.range(40, 95),
      spreadStabilityRank: rng.range(50, 98),
      sessionExpectancy: sessions,
      scalpingSuccessRate: regimes,
      rollingExpectancy: expectancy,
      favored: expectancy > 65,
    };
  }).sort((a, b) => b.rollingExpectancy - a.rollingExpectancy);
};

const generateTradeSequencing = (rng: MicroRNG): TradeSequencing => {
  const outcomes: ('win' | 'loss')[] = Array.from({ length: 10 }, () => rng.bool(0.58) ? 'win' : 'loss');
  const recentLosses = outcomes.slice(-5).filter(o => o === 'loss').length;
  const recentWins = outcomes.slice(-5).filter(o => o === 'win').length;

  let cluster: TradeSequencing['clusterType'] = 'neutral';
  let confAdj = 0;
  let densAdj = 0;
  let degradation = false;

  if (recentLosses >= 4) {
    cluster = 'loss-cluster';
    confAdj = -15;
    densAdj = -25;
    degradation = true;
  } else if (recentWins >= 4) {
    cluster = 'profit-momentum';
    confAdj = 10;
    densAdj = 15;
  } else if (recentLosses >= 3) {
    cluster = 'mixed';
    confAdj = -5;
    densAdj = -10;
    degradation = true;
  }

  return {
    recentOutcomes: outcomes,
    clusterType: cluster,
    confidenceAdjustment: confAdj,
    densityAdjustment: densAdj,
    edgeDegradation: degradation,
    description: cluster === 'loss-cluster'
      ? `Loss cluster detected (${recentLosses}/5) — confidence reduced, density throttled`
      : cluster === 'profit-momentum'
        ? `Profit momentum (${recentWins}/5) — increased aggressiveness permitted`
        : degradation
          ? `Mixed outcomes — edge degradation flagged`
          : 'Outcome pattern neutral — standard operating mode',
  };
};

const generateEdgeDecay = (rng: MicroRNG): EdgeDecayMonitor => {
  const rolling = rng.range(0.3, 1.2);
  const baseline = rng.range(0.6, 1.0);
  const decayRate = ((baseline - rolling) / baseline) * 100;
  const decaying = rolling < baseline * 0.85;
  return {
    rollingExpectancy: rolling,
    baselineExpectancy: baseline,
    decayRate: Math.max(0, decayRate),
    isDecaying: decaying,
    throttleActive: decaying,
    filterTightening: decaying ? rng.range(20, 60) : 0,
    description: decaying
      ? `Edge decaying ${decayRate.toFixed(0)}% below baseline — filters tightened ${decaying ? 'YES' : 'NO'}`
      : `Edge stable — rolling expectancy ${((rolling / baseline) * 100).toFixed(0)}% of baseline`,
  };
};

const generateGovernor = (rng: MicroRNG): AntiOvertradingGovernor => {
  const captureT = rng.pick<'improving' | 'stable' | 'declining'>(['improving', 'stable', 'declining']);
  const spreadT = rng.pick<'improving' | 'stable' | 'worsening'>(['improving', 'stable', 'worsening']);
  const durT = rng.pick<'improving' | 'stable' | 'declining'>(['improving', 'stable', 'declining']);
  const wr = rng.range(42, 72);
  const wrThreshold = 50;
  const reasons: string[] = [];

  if (captureT === 'declining') reasons.push('Capture ratio declining');
  if (spreadT === 'worsening') reasons.push('Spread friction increasing');
  if (durT === 'declining') reasons.push('Duration efficiency dropping');
  if (wr < wrThreshold) reasons.push(`Win rate ${wr.toFixed(0)}% below ${wrThreshold}% threshold`);

  const throttled = reasons.length >= 2;
  const limit = throttled ? rng.int(3, 8) : rng.int(8, 20);
  const current = rng.int(1, limit + 3);

  return {
    captureRatioTrend: captureT,
    spreadFrictionTrend: spreadT,
    durationEfficiencyTrend: durT,
    winRateRolling: wr,
    winRateThreshold: wrThreshold,
    isThrottled: throttled,
    throttleReasons: reasons,
    tradeDensityLimit: limit,
    currentDensity: current,
    description: throttled
      ? `THROTTLED — ${reasons.length} degradation signals active`
      : `Operating normally — ${reasons.length > 0 ? reasons[0] : 'all metrics within tolerance'}`,
  };
};

const generateDecisionPackets = (rng: MicroRNG, pairs: PairPersonality[]): ScalpingDecisionPacket[] => {
  return pairs.slice(0, 5).map(p => {
    const mtf = generateMTFGate(rng);
    const vol = generateVolatilityState(rng);
    const friction = generateFrictionExpectancy(rng);
    const failures: string[] = [];
    if (!mtf.overallPass) failures.push('MTF alignment failed');
    if (!friction.passesGate) failures.push('Friction expectancy below 3×');
    if (vol.phase === 'compression') failures.push('Volatility in compression');

    const mode: ScalpTradeMode = vol.phase === 'expansion' ? 'continuation' : 'scalp';

    return {
      tradeMode: mode,
      pair: p.pair,
      direction: rng.bool(0.52) ? 'long' as const : 'short' as const,
      mtfAlignment: mtf,
      volatilityState: vol,
      liquidityShockScore: rng.range(5, 80),
      spreadEfficiency: p.spreadStabilityRank,
      expectedDuration: p.optimalDurationWindow,
      exitPolicyName: mode === 'scalp' ? 'Rapid Micro-Trail' : 'MTF Runner Protection',
      riskEnvelope: rng.range(0.5, 2.5),
      justification: failures.length === 0
        ? `${p.pair} — ${mode} mode, MTF aligned, vol ${vol.phase}, friction clear`
        : `${p.pair} — BLOCKED: ${failures.join(', ')}`,
      gatingPassed: failures.length === 0,
      gatingFailures: failures,
    };
  });
};

const generateForexLeakage = (rng: MicroRNG): ForexLeakageAttribution[] => {
  const cats: ForexLeakageCategory[] = [
    'spread-friction-loss', 'premature-htf-exit', 'late-ltf-reversal-exit',
    'stagnation-time-decay', 'chop-regime-overtrading', 'trailing-vol-mismatch',
    'liquidity-shock-misread', 'trade-sequencing-degradation',
  ];
  const recs: Record<ForexLeakageCategory, string> = {
    'spread-friction-loss': 'Reject trades where expected move < 3× spread+slippage',
    'premature-htf-exit': 'Require HTF persistence >65% before allowing runner exit',
    'late-ltf-reversal-exit': 'Implement momentum collapse pre-signals on LTF',
    'stagnation-time-decay': 'Enforce max stale-bar thresholds per regime',
    'chop-regime-overtrading': 'Disable scalping during confirmed ranging/chop regimes',
    'trailing-vol-mismatch': 'Use adaptive ATR trailing — tighten in contraction, relax in expansion',
    'liquidity-shock-misread': 'Improve shock classification — distinguish cascade from spike',
    'trade-sequencing-degradation': 'Reduce density after 3+ consecutive losses',
  };

  const raw = cats.map(cat => ({
    category: cat,
    totalPnlImpact: rng.range(15, 250),
    occurrenceCount: rng.int(2, 20),
    avgImpactPerTrade: 0,
    severity: 'minor' as const,
    percentOfTotal: 0,
    recommendation: recs[cat],
  }));

  const total = raw.reduce((s, r) => s + r.totalPnlImpact, 0);
  return raw.map(r => ({
    ...r,
    avgImpactPerTrade: r.occurrenceCount > 0 ? r.totalPnlImpact / r.occurrenceCount : 0,
    severity: (r.totalPnlImpact > 180 ? 'critical' : r.totalPnlImpact > 80 ? 'moderate' : 'minor') as 'critical' | 'moderate' | 'minor',
    percentOfTotal: total > 0 ? (r.totalPnlImpact / total) * 100 : 0,
  })).sort((a, b) => b.totalPnlImpact - a.totalPnlImpact);
};

// ─── Main Export ───

export const createForexMicrostructureState = (): ForexMicrostructureState => {
  const rng = new MicroRNG(hashStr('forex-micro-scalp'));

  const pairs = generatePairPersonalities(rng);
  const vol = generateVolatilityState(rng);
  const mode: ScalpTradeMode = vol.phase === 'expansion' || vol.phase === 'ignition' ? 'scalp' : 'continuation';

  return {
    spreadStability: generateSpreadStability(rng),
    liquidityShock: generateLiquidityShock(rng),
    frictionExpectancy: generateFrictionExpectancy(rng),
    volatilityState: vol,
    sessionQualification: generateSessionQualification(rng),
    mtfGate: generateMTFGate(rng),
    pairPersonalities: pairs,
    tradeSequencing: generateTradeSequencing(rng),
    edgeDecay: generateEdgeDecay(rng),
    governor: generateGovernor(rng),
    decisionPackets: generateDecisionPackets(rng, pairs),
    forexLeakage: generateForexLeakage(rng),
    metaControllerMode: mode,
    timestamp: Date.now(),
  };
};
