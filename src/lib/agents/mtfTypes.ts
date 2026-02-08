// Multi-Timeframe (MTF) Intelligence Type System
// Hierarchical timeframe analysis for entry, exit, optimization, and forensic layers

import { AgentId } from './types';
import { Timeframe, BiasDirection, EfficiencyVerdict, StrategyState } from '@/lib/market/types';

// ─── Timeframe Hierarchy ───

export type TimeframeLayer = 'HTF' | 'MTF' | 'LTF';

export const TIMEFRAME_LAYER_MAP: Record<TimeframeLayer, Timeframe[]> = {
  HTF: ['1d', '1w'],
  MTF: ['1h', '4h'],
  LTF: ['5m', '15m'],
};

export const TIMEFRAME_TO_LAYER: Record<Timeframe, TimeframeLayer> = {
  '1m': 'LTF',
  '5m': 'LTF',
  '15m': 'LTF',
  '1h': 'MTF',
  '4h': 'MTF',
  '1d': 'HTF',
  '1w': 'HTF',
};

// ─── Structural Map Per Layer ───

export interface TimeframeStructure {
  layer: TimeframeLayer;
  timeframe: Timeframe;
  bias: BiasDirection;
  trendPersistenceScore: number;       // 0-100
  swingBias: 'higher-highs' | 'lower-lows' | 'neutral';
  efficiency: EfficiencyVerdict;
  momentumCoherence: number;           // 0-1
  volatilitySyncScore: number;         // 0-1
  liquidityStructure: 'accumulation' | 'distribution' | 'neutral';
  reversalSignalStrength: number;      // 0-100 (LTF only)
  continuationProbability: number;     // 0-100 (HTF only)
  regimeClassification: 'trending' | 'ranging' | 'volatile' | 'quiet';
  timestamp: number;
}

// ─── Cross-Timeframe Alignment ───

export type TimeframeAlignmentState = 'fully-aligned' | 'partially-aligned' | 'conflicting' | 'diverging';

export interface CrossTimeframeAlignment {
  state: TimeframeAlignmentState;
  alignmentScore: number;              // 0-100
  htfBias: BiasDirection;
  mtfBias: BiasDirection;
  ltfBias: BiasDirection;
  momentumCoherence: number;           // 0-1
  volatilitySynchronization: number;   // 0-1
  conflictSources: TimeframeConflict[];
  dominantTimeframe: TimeframeLayer;
  weightingPriority: Record<TimeframeLayer, number>;  // 0-1
}

export interface TimeframeConflict {
  layer1: TimeframeLayer;
  layer2: TimeframeLayer;
  conflictType: 'directional' | 'momentum' | 'volatility' | 'regime';
  severity: 'minor' | 'moderate' | 'critical';
  description: string;
  timestamp: number;
}

// ─── MTF Exit Policy ───

export type TrailingMode = 'htf-wide' | 'mtf-structural' | 'ltf-precision' | 'adaptive';
export type ExitUrgency = 'none' | 'monitor' | 'prepare' | 'execute';

export interface MTFExitPolicy {
  id: string;
  name: string;
  trailingMode: TrailingMode;
  
  // HTF controls
  htfRunnerPermission: boolean;           // allow extended trailing if HTF strong
  htfTrailingWidthMultiplier: number;     // ATR multiplier for wide trailing
  htfMinPersistenceForRunner: number;     // min HTF persistence to permit runners
  
  // MTF controls
  mtfStructuralExitThreshold: number;     // swing structure break threshold
  mtfSwingTrailEnabled: boolean;          // trail using MTF swing highs/lows
  mtfRegimeExitTrigger: boolean;          // exit on MTF regime degradation
  
  // LTF controls
  ltfPrecisionExitEnabled: boolean;       // use microstructure for final exit timing
  ltfReversalConfirmationRequired: boolean;  // LTF reversal needs MTF confirmation
  ltfMomentumCollapseThreshold: number;   // threshold for momentum collapse exit
  
  // Conflict resolution
  conflictExitEnabled: boolean;           // exit on timeframe divergence
  conflictToleranceThreshold: number;     // 0-100, below = trigger exit
  
  // Partial scaling
  partialScaleEnabled: boolean;
  partialScalePoints: MTFPartialScale[];
  
  // Risk envelope
  maxRiskOverride: boolean;               // can risk override HTF bias?
  riskEnvelopeMultiplier: number;         // ATR-based risk envelope
  
  timestamp: number;
}

export interface MTFPartialScale {
  triggerR: number;                        // R-multiple trigger
  scalePct: number;                        // % of position to scale
  htfContinuationMinimum: number;          // min HTF continuation prob to skip scaling
  description: string;
}

// ─── MTF Forensic Auditor ───

export type LeakageCategory =
  | 'htf-continuation-ignored'
  | 'mtf-regime-misclassification'
  | 'ltf-reversal-ignored'
  | 'cross-tf-volatility-divergence'
  | 'conflicting-tf-exit';

export interface TradeForensicRecord {
  tradeId: string;
  ticker: string;
  agentId: AgentId;
  timestamp: number;
  
  // MFE / MAE by timeframe context
  mfeByLayer: Record<TimeframeLayer, number>;
  maeByLayer: Record<TimeframeLayer, number>;
  overallMFE: number;
  overallMAE: number;
  
  // Alignment tracking
  alignmentAtEntry: CrossTimeframeAlignment;
  alignmentAtExit: CrossTimeframeAlignment;
  alignmentOverLifetime: number[];           // alignment scores sampled over time
  
  // HTF context at exit
  htfContinuationProbAtExit: number;
  htfTrendPersistenceAtExit: number;
  
  // LTF reversal detection
  ltfReversalDetected: boolean;
  ltfReversalLatencyBars: number;            // bars late detecting reversal
  
  // Structural events
  timeframeConflictEvents: TimeframeConflict[];
  
  // Realized vs potential
  realizedPnlPct: number;
  captureRatio: number;                      // realized / MFE
  giveBackPct: number;                       // (MFE - realized) / MFE
  
  // Duration efficiency
  tradeBarDuration: number;
  optimalExitBar: number;                    // bar at which MFE occurred
  durationEfficiency: number;                // optimalExitBar / tradeBarDuration
}

export interface LeakageAttribution {
  category: LeakageCategory;
  leakagePct: number;                        // % of MFE lost to this cause
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
  occurrenceCount: number;
  avgLeakagePerOccurrence: number;
}

export interface LeakageReport {
  period: string;
  totalTrades: number;
  avgCaptureRatio: number;
  totalLeakagePct: number;
  attributions: LeakageAttribution[];
  worstLeakageTrades: TradeForensicRecord[];
  bestCaptureTrades: TradeForensicRecord[];
  timeframeRootCause: TimeframeLayer;        // which layer caused most leakage
  recommendations: string[];
}

// ─── MTF Optimizer ───

export interface MTFOptimizationResult {
  policyVariant: MTFExitPolicy;
  regimeLabel: string;
  captureRatioImprovement: number;           // vs baseline
  giveBackReduction: number;                 // vs baseline
  conflictLossReduction: number;             // vs baseline
  walkForwardScore: number;                  // 0-100
  timeframeOverfitRisk: Record<TimeframeLayer, number>;  // 0-100 per layer
  validationStatus: 'pending' | 'accepted' | 'rejected';
  shadowModeEnabled: boolean;
}

export interface MTFOptimizerState {
  activeOptimizations: MTFOptimizationResult[];
  baselineCaptureRatio: number;
  currentCaptureRatio: number;
  timeframeWeights: Record<TimeframeLayer, number>;
  lastOptimizationCycle: number;
  optimizationCycleCount: number;
}

// ─── MTF Trader Execution ───

export interface MTFExecutionState {
  tradeId: string;
  ticker: string;
  
  // Synchronized triggers
  htfMomentumStrong: boolean;
  mtfStructureIntact: boolean;
  ltfExitSignal: boolean;
  
  // Safety checks
  htfBiasOverrideActive: boolean;            // risk envelope forced exit despite HTF
  ltfNoiseFiltered: boolean;                 // LTF reversal rejected as noise
  mtfConfirmationPending: boolean;           // waiting for MTF to confirm LTF signal
  
  // Current exit urgency
  exitUrgency: ExitUrgency;
  exitReason: string;
  
  // Active exit modules
  activeModules: MTFExitModuleStatus[];
}

export interface MTFExitModuleStatus {
  module: string;
  active: boolean;
  triggerDistance: number;                    // 0-100, how close to triggering
  description: string;
}

// ─── MTF Meta-Controller State ───

export interface MTFMetaControllerState {
  structuralMap: Record<TimeframeLayer, TimeframeStructure>;
  alignment: CrossTimeframeAlignment;
  activeExitPolicy: MTFExitPolicy;
  optimizerState: MTFOptimizerState;
  
  // KPIs
  captureRatio: number;                      // Primary: Realized / MFE
  exitEfficiencyByAlignment: Record<TimeframeAlignmentState, number>;
  giveBackDistribution: Record<LeakageCategory, number>;
  regimeMisalignmentFrequency: number;       // 0-1
  tradeDurationEfficiency: number;           // 0-1
  slippageAdjustedExpectancy: number;        // $/trade
  
  // Forensic
  latestLeakageReport: LeakageReport;
  
  // Execution
  activeExecutions: MTFExecutionState[];
  
  timestamp: number;
}

// ─── Shadow Mode ───

export interface ShadowModeComparison {
  baselinePolicy: MTFExitPolicy;
  candidatePolicy: MTFExitPolicy;
  baselineCaptureRatio: number;
  candidateCaptureRatio: number;
  baselineGiveBack: number;
  candidateGiveBack: number;
  baselineConflictLosses: number;
  candidateConflictLosses: number;
  tradeSamples: number;
  promotionReady: boolean;                   // candidate beats baseline AND conflict losses decline
  promotionReason: string;
}
