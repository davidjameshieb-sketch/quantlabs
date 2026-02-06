// Adaptive Evolution & Meta-Controller Type System
// Defines the living ecosystem of trading intelligence

import { AgentId, AgentPerformance } from './types';

// ─── Adaptive Parameter Ranges ───

export interface AdaptiveRange {
  current: number;
  min: number;
  max: number;
  baseline: number;       // safe equilibrium point
  elasticity: number;     // 0-1, how freely the param can move
  lastMutation: number;   // timestamp
}

export interface AdaptiveParameters {
  entryTiming: AdaptiveRange;
  signalConfirmationWeight: AdaptiveRange;
  tradeFrequency: AdaptiveRange;
  holdDuration: AdaptiveRange;
  signalPersistence: AdaptiveRange;
  regimeSensitivity: AdaptiveRange;
}

// ─── Risk Stability Anchors (non-overridable) ───

export interface RiskAnchor {
  label: string;
  description: string;
  threshold: number;
  current: number;
  unit: string;
  status: 'safe' | 'warning' | 'critical';
  icon: string;
}

export interface RiskStabilityAnchors {
  maxDrawdown: RiskAnchor;
  riskPerTrade: RiskAnchor;
  exposureConcentration: RiskAnchor;
  volatilityTolerance: RiskAnchor;
  correlationSafety: RiskAnchor;
}

// ─── Multi-Horizon Performance Memory ───

export interface PerformanceMemoryWindow {
  label: string;
  horizon: 'short' | 'medium' | 'long';
  periodDays: number;
  winRate: number;
  avgReturn: number;
  sharpe: number;
  maxDrawdown: number;
  regimeAccuracy: number;
  signalQuality: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface PerformanceMemory {
  shortTerm: PerformanceMemoryWindow;
  mediumTerm: PerformanceMemoryWindow;
  longTerm: PerformanceMemoryWindow;
  validationStatus: 'accepted' | 'pending' | 'rejected';
}

// ─── Behavioral Risk Metrics ───

export interface BehavioralRiskMetric {
  label: string;
  description: string;
  value: number;         // 0-100
  threshold: number;     // trigger point for recalibration
  status: 'healthy' | 'elevated' | 'critical';
  trend: 'improving' | 'stable' | 'degrading';
}

export interface BehavioralRiskProfile {
  signalDegradation: BehavioralRiskMetric;
  regimeMisclassification: BehavioralRiskMetric;
  confidenceVolatility: BehavioralRiskMetric;
  timingDrift: BehavioralRiskMetric;
  overAdaptation: BehavioralRiskMetric;
}

// ─── Confidence Elasticity ───

export interface ConfidenceElasticity {
  currentConfidence: number;
  tradeSizeMultiplier: number;
  entryPatienceLevel: number;     // 0-1, higher = more patient
  exitAggressiveness: number;     // 0-1, higher = more aggressive exits
  signalLifespan: number;         // bars
}

// ─── Capital Allocation ───

export interface CapitalAllocation {
  exploitationPercent: number;    // 70-85%
  explorationPercent: number;     // 15-30%
  exploitationPnl: number;
  explorationPnl: number;
  explorationDiscoveries: number; // successful experimental strategies
  rebalanceHistory: Array<{
    timestamp: number;
    fromExploration: number;
    toExploration: number;
    reason: string;
  }>;
}

// ─── Reversion Checkpoints ───

export interface ReversionCheckpoint {
  timestamp: number;
  agentId: AgentId;
  reason: string;
  parametersBefore: Partial<AdaptiveParameters>;
  parametersAfter: Partial<AdaptiveParameters>;
  performanceDelta: number;
}

// ─── Meta-Controller State ───

export type MetaControllerMode = 'observing' | 'adjusting' | 'intervening' | 'stabilizing';

export interface ModelFreedomLevel {
  agentId: AgentId;
  freedomScore: number;            // 0-100, higher = more freedom
  restrictionReasons: string[];
  lastAdjustment: number;
  capitalWeight: number;            // 0-1, portfolio allocation
}

export interface MetaControllerState {
  mode: MetaControllerMode;
  influenceScore: number;           // 0-100, how actively governing
  agentFreedom: Record<AgentId, ModelFreedomLevel>;
  riskAnchors: RiskStabilityAnchors;
  capitalAllocation: CapitalAllocation;
  systemHealth: number;             // 0-100
  adaptationRate: number;           // mutations per cycle
  stabilityIndex: number;           // 0-100, portfolio stability
  lastGovernanceAction: string;
  lastGovernanceTimestamp: number;
  reversionHistory: ReversionCheckpoint[];
  evolutionCycle: number;           // total cycles since inception
}

// ─── Agent Evolution State (per agent) ───

export interface AgentEvolutionState {
  agentId: AgentId;
  adaptiveParams: AdaptiveParameters;
  confidenceElasticity: ConfidenceElasticity;
  performanceMemory: PerformanceMemory;
  behavioralRisk: BehavioralRiskProfile;
  mutationCount: number;
  lastEvolutionCycle: number;
  generationNumber: number;
  fitnessScore: number;             // 0-100, evolutionary fitness
}

// ─── Full Evolution Ecosystem ───

export interface EvolutionEcosystem {
  metaController: MetaControllerState;
  agentEvolution: Record<AgentId, AgentEvolutionState>;
  ecosystemAge: number;             // cycles
  totalMutations: number;
  survivalRate: number;             // % of mutations that improved performance
}
