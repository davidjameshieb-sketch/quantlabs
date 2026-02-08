// MTF Meta-Controller Engine
// Hierarchical Governor — maintains structural maps, selects exit policies,
// assigns timeframe weighting priority

import { AgentId } from './types';
import { Timeframe, BiasDirection, EfficiencyVerdict } from '@/lib/market/types';
import {
  TimeframeLayer,
  TimeframeStructure,
  CrossTimeframeAlignment,
  TimeframeAlignmentState,
  TimeframeConflict,
  MTFExitPolicy,
  MTFPartialScale,
  MTFMetaControllerState,
  MTFOptimizerState,
  MTFExecutionState,
  MTFExitModuleStatus,
  ExitUrgency,
  TrailingMode,
  LeakageReport,
  LeakageAttribution,
  LeakageCategory,
  TradeForensicRecord,
  ShadowModeComparison,
} from './mtfTypes';

// ─── Seeded RNG ───

class MtfRNG {
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

// ─── Structural Map Generation ───

const generateTimeframeStructure = (
  layer: TimeframeLayer,
  timeframe: Timeframe,
  rng: MtfRNG
): TimeframeStructure => {
  const bias: BiasDirection = rng.bool(0.55) ? 'bullish' : 'bearish';
  const efficiency: EfficiencyVerdict = rng.pick(['clean', 'mixed', 'noisy']);
  const regime = rng.pick(['trending', 'ranging', 'volatile', 'quiet'] as const);

  return {
    layer,
    timeframe,
    bias,
    trendPersistenceScore: rng.range(layer === 'HTF' ? 50 : 30, 95),
    swingBias: rng.pick(['higher-highs', 'lower-lows', 'neutral']),
    efficiency,
    momentumCoherence: rng.range(0.3, 0.95),
    volatilitySyncScore: rng.range(0.4, 0.9),
    liquidityStructure: rng.pick(['accumulation', 'distribution', 'neutral']),
    reversalSignalStrength: layer === 'LTF' ? rng.range(10, 80) : 0,
    continuationProbability: layer === 'HTF' ? rng.range(40, 90) : 0,
    regimeClassification: regime,
    timestamp: Date.now(),
  };
};

// ─── Cross-Timeframe Alignment ───

const computeAlignment = (
  htf: TimeframeStructure,
  mtf: TimeframeStructure,
  ltf: TimeframeStructure,
  rng: MtfRNG
): CrossTimeframeAlignment => {
  const conflicts: TimeframeConflict[] = [];

  // Check directional alignment
  const biasMatch = (htf.bias === mtf.bias && mtf.bias === ltf.bias);
  const biasPartial = (htf.bias === mtf.bias || mtf.bias === ltf.bias);

  if (htf.bias !== mtf.bias) {
    conflicts.push({
      layer1: 'HTF', layer2: 'MTF',
      conflictType: 'directional',
      severity: 'critical',
      description: `HTF ${htf.bias} vs MTF ${mtf.bias} — macro/swing directional disagreement`,
      timestamp: Date.now(),
    });
  }
  if (mtf.bias !== ltf.bias) {
    conflicts.push({
      layer1: 'MTF', layer2: 'LTF',
      conflictType: 'directional',
      severity: 'moderate',
      description: `MTF ${mtf.bias} vs LTF ${ltf.bias} — swing/execution timing divergence`,
      timestamp: Date.now(),
    });
  }

  // Momentum coherence check
  const avgMomentum = (htf.momentumCoherence + mtf.momentumCoherence + ltf.momentumCoherence) / 3;
  if (Math.abs(htf.momentumCoherence - ltf.momentumCoherence) > 0.4) {
    conflicts.push({
      layer1: 'HTF', layer2: 'LTF',
      conflictType: 'momentum',
      severity: 'moderate',
      description: `Momentum divergence: HTF ${(htf.momentumCoherence * 100).toFixed(0)}% vs LTF ${(ltf.momentumCoherence * 100).toFixed(0)}%`,
      timestamp: Date.now(),
    });
  }

  // Volatility sync check
  const avgVolSync = (htf.volatilitySyncScore + mtf.volatilitySyncScore + ltf.volatilitySyncScore) / 3;
  if (avgVolSync < 0.5) {
    conflicts.push({
      layer1: 'HTF', layer2: 'LTF',
      conflictType: 'volatility',
      severity: conflicts.length > 1 ? 'critical' : 'minor',
      description: `Cross-timeframe volatility desynchronization at ${(avgVolSync * 100).toFixed(0)}%`,
      timestamp: Date.now(),
    });
  }

  let state: TimeframeAlignmentState;
  let alignmentScore: number;

  if (biasMatch && avgMomentum > 0.7 && avgVolSync > 0.6) {
    state = 'fully-aligned';
    alignmentScore = rng.range(82, 98);
  } else if (biasPartial && avgMomentum > 0.5) {
    state = 'partially-aligned';
    alignmentScore = rng.range(55, 80);
  } else if (conflicts.some(c => c.severity === 'critical')) {
    state = 'diverging';
    alignmentScore = rng.range(15, 40);
  } else {
    state = 'conflicting';
    alignmentScore = rng.range(30, 55);
  }

  // Determine dominant timeframe & weighting
  const htfWeight = htf.trendPersistenceScore > 70 ? 0.5 : 0.35;
  const ltfWeight = ltf.reversalSignalStrength > 60 ? 0.25 : 0.15;
  const mtfWeight = 1 - htfWeight - ltfWeight;

  return {
    state,
    alignmentScore,
    htfBias: htf.bias,
    mtfBias: mtf.bias,
    ltfBias: ltf.bias,
    momentumCoherence: avgMomentum,
    volatilitySynchronization: avgVolSync,
    conflictSources: conflicts,
    dominantTimeframe: htf.trendPersistenceScore > 70 ? 'HTF' : mtf.regimeClassification === 'trending' ? 'MTF' : 'LTF',
    weightingPriority: { HTF: htfWeight, MTF: mtfWeight, LTF: ltfWeight },
  };
};

// ─── Exit Policy Selection ───

const selectExitPolicy = (
  alignment: CrossTimeframeAlignment,
  htf: TimeframeStructure,
  rng: MtfRNG
): MTFExitPolicy => {
  const isAligned = alignment.state === 'fully-aligned' || alignment.state === 'partially-aligned';
  const htfStrong = htf.trendPersistenceScore > 65;

  let trailingMode: TrailingMode;
  if (isAligned && htfStrong) trailingMode = 'htf-wide';
  else if (isAligned) trailingMode = 'mtf-structural';
  else if (alignment.state === 'diverging') trailingMode = 'ltf-precision';
  else trailingMode = 'adaptive';

  const partialScales: MTFPartialScale[] = [
    {
      triggerR: 1.0,
      scalePct: htfStrong ? 15 : 25,
      htfContinuationMinimum: 70,
      description: htfStrong ? 'Light scale at 1R — HTF continuation strong' : 'Standard scale at 1R',
    },
    {
      triggerR: 2.0,
      scalePct: htfStrong ? 25 : 35,
      htfContinuationMinimum: 55,
      description: 'Mid-scale at 2R based on HTF continuation probability',
    },
    {
      triggerR: 3.0,
      scalePct: 40,
      htfContinuationMinimum: 40,
      description: 'Major scale at 3R — lock significant profits',
    },
  ];

  return {
    id: `mtf-policy-${Date.now()}`,
    name: isAligned ? 'Aligned Trend Runner' : alignment.state === 'diverging' ? 'Defensive Precision Exit' : 'Adaptive Conflict Handler',
    trailingMode,

    htfRunnerPermission: htfStrong && isAligned,
    htfTrailingWidthMultiplier: htfStrong ? rng.range(2.5, 4.0) : rng.range(1.5, 2.5),
    htfMinPersistenceForRunner: 65,

    mtfStructuralExitThreshold: rng.range(0.6, 0.85),
    mtfSwingTrailEnabled: isAligned,
    mtfRegimeExitTrigger: !isAligned,

    ltfPrecisionExitEnabled: true,
    ltfReversalConfirmationRequired: isAligned,
    ltfMomentumCollapseThreshold: rng.range(0.2, 0.4),

    conflictExitEnabled: alignment.conflictSources.length > 1,
    conflictToleranceThreshold: alignment.state === 'diverging' ? 30 : 50,

    partialScaleEnabled: true,
    partialScalePoints: partialScales,

    maxRiskOverride: alignment.state === 'diverging',
    riskEnvelopeMultiplier: rng.range(2.0, 3.5),

    timestamp: Date.now(),
  };
};

// ─── Forensic Auditor ───

const generateForensicRecords = (rng: MtfRNG, count: number): TradeForensicRecord[] => {
  const tickers = ['AAPL', 'EUR/USD', 'BTC/USD', 'SPY', 'GBP/JPY', 'TSLA', 'ETH/USD', 'NVDA'];
  const agentIds: AgentId[] = ['equities-alpha', 'forex-macro', 'crypto-momentum', 'liquidity-radar', 'fractal-intelligence'];

  return Array.from({ length: count }, (_, i) => {
    const mfeHTF = rng.range(0.02, 0.08);
    const mfeMTF = rng.range(0.015, 0.06);
    const mfeLTF = rng.range(0.005, 0.03);
    const overallMFE = Math.max(mfeHTF, mfeMTF, mfeLTF);
    const realizedPnl = overallMFE * rng.range(0.3, 0.95);
    const captureRatio = realizedPnl / overallMFE;

    const entryAlignment = computeAlignment(
      generateTimeframeStructure('HTF', '1d', rng),
      generateTimeframeStructure('MTF', '4h', rng),
      generateTimeframeStructure('LTF', '15m', rng),
      rng
    );
    const exitAlignment = computeAlignment(
      generateTimeframeStructure('HTF', '1d', rng),
      generateTimeframeStructure('MTF', '4h', rng),
      generateTimeframeStructure('LTF', '15m', rng),
      rng
    );

    const tradeBarDuration = Math.floor(rng.range(10, 200));
    const optimalExitBar = Math.floor(tradeBarDuration * rng.range(0.4, 0.9));

    return {
      tradeId: `trade-${i}-${Date.now()}`,
      ticker: rng.pick(tickers),
      agentId: rng.pick(agentIds),
      timestamp: Date.now() - Math.floor(rng.range(0, 30 * 86400000)),
      mfeByLayer: { HTF: mfeHTF, MTF: mfeMTF, LTF: mfeLTF },
      maeByLayer: {
        HTF: rng.range(0.005, 0.03),
        MTF: rng.range(0.003, 0.02),
        LTF: rng.range(0.001, 0.01),
      },
      overallMFE,
      overallMAE: rng.range(0.005, 0.04),
      alignmentAtEntry: entryAlignment,
      alignmentAtExit: exitAlignment,
      alignmentOverLifetime: Array.from({ length: 10 }, () => rng.range(30, 95)),
      htfContinuationProbAtExit: rng.range(20, 85),
      htfTrendPersistenceAtExit: rng.range(30, 80),
      ltfReversalDetected: rng.bool(0.6),
      ltfReversalLatencyBars: Math.floor(rng.range(0, 8)),
      timeframeConflictEvents: entryAlignment.conflictSources,
      realizedPnlPct: realizedPnl,
      captureRatio,
      giveBackPct: 1 - captureRatio,
      tradeBarDuration,
      optimalExitBar,
      durationEfficiency: optimalExitBar / tradeBarDuration,
    };
  });
};

const generateLeakageReport = (forensics: TradeForensicRecord[], rng: MtfRNG): LeakageReport => {
  const categories: LeakageCategory[] = [
    'htf-continuation-ignored',
    'mtf-regime-misclassification',
    'ltf-reversal-ignored',
    'cross-tf-volatility-divergence',
    'conflicting-tf-exit',
  ];

  const descriptions: Record<LeakageCategory, string> = {
    'htf-continuation-ignored': 'HTF trend continuation was still strong but exit was triggered by lower timeframe signals',
    'mtf-regime-misclassification': 'Intermediate timeframe regime was misclassified, leading to premature exit or hold',
    'ltf-reversal-ignored': 'Lower timeframe reversal signal was ignored or detected too late',
    'cross-tf-volatility-divergence': 'Volatility divergence between timeframes caused inappropriate exit timing',
    'conflicting-tf-exit': 'Exit triggered by conflicting signals from different timeframe layers',
  };

  const attributions: LeakageAttribution[] = categories.map(cat => ({
    category: cat,
    leakagePct: rng.range(2, 18),
    description: descriptions[cat],
    severity: rng.pick(['minor', 'moderate', 'critical']),
    occurrenceCount: Math.floor(rng.range(3, 25)),
    avgLeakagePerOccurrence: rng.range(0.5, 4.0),
  }));

  // Sort by leakage impact
  attributions.sort((a, b) => b.leakagePct - a.leakagePct);

  const avgCapture = forensics.reduce((s, f) => s + f.captureRatio, 0) / forensics.length;
  const totalLeakage = attributions.reduce((s, a) => s + a.leakagePct, 0);

  // Determine root cause layer
  const htfLeakage = attributions.filter(a => a.category.startsWith('htf')).reduce((s, a) => s + a.leakagePct, 0);
  const mtfLeakage = attributions.filter(a => a.category.startsWith('mtf')).reduce((s, a) => s + a.leakagePct, 0);
  const ltfLeakage = attributions.filter(a => a.category.startsWith('ltf')).reduce((s, a) => s + a.leakagePct, 0);

  let rootCause: TimeframeLayer = 'MTF';
  if (htfLeakage > mtfLeakage && htfLeakage > ltfLeakage) rootCause = 'HTF';
  else if (ltfLeakage > mtfLeakage) rootCause = 'LTF';

  const sorted = [...forensics].sort((a, b) => a.captureRatio - b.captureRatio);

  return {
    period: '30d',
    totalTrades: forensics.length,
    avgCaptureRatio: avgCapture,
    totalLeakagePct: totalLeakage,
    attributions,
    worstLeakageTrades: sorted.slice(0, 3),
    bestCaptureTrades: sorted.slice(-3).reverse(),
    timeframeRootCause: rootCause,
    recommendations: [
      rootCause === 'HTF' ? 'Increase HTF persistence threshold before permitting exit signals from lower timeframes' : '',
      rootCause === 'MTF' ? 'Improve MTF regime classification accuracy — consider walk-forward validation window expansion' : '',
      rootCause === 'LTF' ? 'Reduce LTF reversal detection latency — implement momentum collapse pre-signals' : '',
      'Enable Shadow Mode for candidate exit policies before live deployment',
      'Increase conflict tolerance threshold when HTF and MTF agree',
    ].filter(Boolean),
  };
};

// ─── Optimizer State ───

const generateOptimizerState = (
  captureRatio: number,
  policy: MTFExitPolicy,
  rng: MtfRNG
): MTFOptimizerState => {
  return {
    activeOptimizations: [
      {
        policyVariant: { ...policy, name: 'Tighter LTF Trailing', ltfMomentumCollapseThreshold: 0.15 },
        regimeLabel: 'Trending + Aligned',
        captureRatioImprovement: rng.range(0.02, 0.08),
        giveBackReduction: rng.range(0.01, 0.05),
        conflictLossReduction: rng.range(0, 0.03),
        walkForwardScore: rng.range(65, 90),
        timeframeOverfitRisk: { HTF: rng.range(5, 20), MTF: rng.range(10, 30), LTF: rng.range(15, 40) },
        validationStatus: rng.pick(['pending', 'accepted', 'rejected']),
        shadowModeEnabled: rng.bool(0.6),
      },
      {
        policyVariant: { ...policy, name: 'Wide HTF Runner', htfTrailingWidthMultiplier: 4.0 },
        regimeLabel: 'Strong HTF Trend',
        captureRatioImprovement: rng.range(0.03, 0.12),
        giveBackReduction: rng.range(-0.02, 0.04),
        conflictLossReduction: rng.range(0.01, 0.06),
        walkForwardScore: rng.range(55, 85),
        timeframeOverfitRisk: { HTF: rng.range(5, 15), MTF: rng.range(8, 25), LTF: rng.range(20, 45) },
        validationStatus: rng.pick(['pending', 'accepted']),
        shadowModeEnabled: rng.bool(0.4),
      },
    ],
    baselineCaptureRatio: captureRatio - rng.range(0.02, 0.06),
    currentCaptureRatio: captureRatio,
    timeframeWeights: { HTF: rng.range(0.35, 0.55), MTF: rng.range(0.25, 0.4), LTF: rng.range(0.1, 0.25) },
    lastOptimizationCycle: Date.now() - Math.floor(rng.range(300000, 3600000)),
    optimizationCycleCount: Math.floor(rng.range(50, 200)),
  };
};

// ─── Execution State ───

const generateExecutionStates = (rng: MtfRNG, count: number): MTFExecutionState[] => {
  const tickers = ['AAPL', 'EUR/USD', 'BTC/USD', 'SPY', 'GBP/JPY'];

  return Array.from({ length: count }, (_, i) => {
    const htfStrong = rng.bool(0.6);
    const mtfIntact = rng.bool(0.7);
    const ltfExit = rng.bool(0.3);

    let urgency: ExitUrgency = 'none';
    let reason = 'All timeframe layers aligned — position secure';

    if (ltfExit && !mtfIntact) {
      urgency = 'execute';
      reason = 'LTF reversal confirmed by MTF structural deterioration';
    } else if (ltfExit && mtfIntact) {
      urgency = 'monitor';
      reason = 'LTF reversal detected but MTF structure still intact — filtering noise';
    } else if (!htfStrong && !mtfIntact) {
      urgency = 'prepare';
      reason = 'HTF momentum weakening and MTF structure degrading — preparing exit';
    }

    const modules: MTFExitModuleStatus[] = [
      { module: 'HTF Trend Runner Protection', active: htfStrong, triggerDistance: htfStrong ? rng.range(10, 40) : rng.range(60, 95), description: htfStrong ? 'HTF directional bias intact — runner permitted' : 'HTF weakening — runner protection disabled' },
      { module: 'MTF Structural Trailing', active: mtfIntact, triggerDistance: rng.range(20, 80), description: mtfIntact ? 'Trailing using MTF swing structure' : 'MTF structure broken — trailing suspended' },
      { module: 'LTF Precision Exit', active: ltfExit, triggerDistance: ltfExit ? rng.range(80, 100) : rng.range(5, 30), description: ltfExit ? 'Microstructure reversal detected' : 'No LTF exit signal' },
      { module: 'Timeframe Conflict Exit', active: !htfStrong && ltfExit, triggerDistance: (!htfStrong && ltfExit) ? rng.range(70, 95) : rng.range(10, 40), description: 'Defensive exit module for divergent timeframe signals' },
      { module: 'MTF Partial Scaling', active: rng.bool(0.5), triggerDistance: rng.range(30, 70), description: 'Partial profit-taking based on HTF continuation probability' },
    ];

    return {
      tradeId: `exec-${i}-${Date.now()}`,
      ticker: rng.pick(tickers),
      htfMomentumStrong: htfStrong,
      mtfStructureIntact: mtfIntact,
      ltfExitSignal: ltfExit,
      htfBiasOverrideActive: !htfStrong && urgency === 'execute',
      ltfNoiseFiltered: ltfExit && mtfIntact,
      mtfConfirmationPending: ltfExit && mtfIntact,
      exitUrgency: urgency,
      exitReason: reason,
      activeModules: modules,
    };
  });
};

// ─── Shadow Mode ───

const generateShadowComparison = (
  basePolicy: MTFExitPolicy,
  rng: MtfRNG
): ShadowModeComparison => {
  const candidatePolicy = {
    ...basePolicy,
    id: `shadow-candidate-${Date.now()}`,
    name: 'Shadow Candidate: Tighter MTF + Wide HTF',
    ltfMomentumCollapseThreshold: 0.18,
    htfTrailingWidthMultiplier: 3.8,
    mtfStructuralExitThreshold: 0.72,
  };

  const baseCR = rng.range(0.55, 0.72);
  const candidateCR = baseCR + rng.range(0.02, 0.1);
  const baseGB = rng.range(0.2, 0.4);
  const candidateGB = baseGB - rng.range(0.02, 0.08);
  const baseCL = rng.range(0.05, 0.15);
  const candidateCL = baseCL - rng.range(0.01, 0.05);

  const ready = candidateCR > baseCR && candidateCL < baseCL;

  return {
    baselinePolicy: basePolicy,
    candidatePolicy,
    baselineCaptureRatio: baseCR,
    candidateCaptureRatio: candidateCR,
    baselineGiveBack: baseGB,
    candidateGiveBack: candidateGB,
    baselineConflictLosses: baseCL,
    candidateConflictLosses: candidateCL,
    tradeSamples: Math.floor(rng.range(50, 200)),
    promotionReady: ready,
    promotionReason: ready
      ? `Candidate captures ${((candidateCR - baseCR) * 100).toFixed(1)}% more profit with ${((baseCL - candidateCL) * 100).toFixed(1)}% fewer conflict losses`
      : 'Candidate does not yet meet promotion criteria — continuing shadow evaluation',
  };
};

// ─── Main Export ───

export const createMTFMetaControllerState = (): MTFMetaControllerState => {
  const rng = new MtfRNG(271);

  // Build structural map
  const htf = generateTimeframeStructure('HTF', '1d', rng);
  const mtf = generateTimeframeStructure('MTF', '4h', rng);
  const ltf = generateTimeframeStructure('LTF', '15m', rng);

  const structuralMap = { HTF: htf, MTF: mtf, LTF: ltf };
  const alignment = computeAlignment(htf, mtf, ltf, rng);
  const activeExitPolicy = selectExitPolicy(alignment, htf, rng);

  // Forensic data
  const forensicRecords = generateForensicRecords(rng, 40);
  const leakageReport = generateLeakageReport(forensicRecords, rng);

  const captureRatio = leakageReport.avgCaptureRatio;
  const optimizerState = generateOptimizerState(captureRatio, activeExitPolicy, rng);
  const activeExecutions = generateExecutionStates(rng, 4);

  // KPIs
  const exitEfficiency: Record<TimeframeAlignmentState, number> = {
    'fully-aligned': rng.range(0.75, 0.92),
    'partially-aligned': rng.range(0.55, 0.75),
    'conflicting': rng.range(0.35, 0.55),
    'diverging': rng.range(0.2, 0.4),
  };

  const giveBackDist: Record<string, number> = {};
  leakageReport.attributions.forEach(a => {
    giveBackDist[a.category] = a.leakagePct;
  });

  return {
    structuralMap,
    alignment,
    activeExitPolicy,
    optimizerState,
    captureRatio,
    exitEfficiencyByAlignment: exitEfficiency,
    giveBackDistribution: giveBackDist as Record<LeakageCategory, number>,
    regimeMisalignmentFrequency: rng.range(0.05, 0.25),
    tradeDurationEfficiency: rng.range(0.5, 0.85),
    slippageAdjustedExpectancy: rng.range(15, 120),
    latestLeakageReport: leakageReport,
    activeExecutions,
    timestamp: Date.now(),
  };
};

export const createShadowComparison = (basePolicy: MTFExitPolicy): ShadowModeComparison => {
  const rng = new MtfRNG(314);
  return generateShadowComparison(basePolicy, rng);
};
