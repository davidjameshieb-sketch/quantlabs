// Meta-Controller Engine
// Simulates the adaptive evolution ecosystem with hybrid governance

import { AgentId, AIAgent } from './types';
import { ALL_AGENT_IDS } from './agentConfig';
import {
  AdaptiveRange,
  AdaptiveParameters,
  RiskStabilityAnchors,
  RiskAnchor,
  PerformanceMemory,
  PerformanceMemoryWindow,
  BehavioralRiskProfile,
  BehavioralRiskMetric,
  ConfidenceElasticity,
  CapitalAllocation,
  ReversionCheckpoint,
  MetaControllerState,
  ModelFreedomLevel,
  AgentEvolutionState,
  EvolutionEcosystem,
  MetaControllerMode,
} from './evolutionTypes';

// Seeded RNG for consistent simulation
class EvolutionRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ─── Adaptive Parameter Generation ───

const createAdaptiveRange = (
  rng: EvolutionRNG,
  baseline: number,
  minBound: number,
  maxBound: number,
  elasticity: number
): AdaptiveRange => {
  const drift = rng.range(-0.15, 0.15) * (maxBound - minBound);
  const current = Math.max(minBound, Math.min(maxBound, baseline + drift));
  return {
    current,
    min: minBound,
    max: maxBound,
    baseline,
    elasticity: Math.max(0, Math.min(1, elasticity + rng.range(-0.1, 0.1))),
    lastMutation: Date.now() - Math.floor(rng.range(0, 7200000)),
  };
};

// Default adaptive parameter configs per agent
const ADAPTIVE_CONFIGS: Record<AgentId, { timing: number; freq: number; hold: number }> = {
  'equities-alpha': { timing: 0.65, freq: 0.5, hold: 0.6 },
  'forex-macro': { timing: 0.55, freq: 0.4, hold: 0.7 },
  'crypto-momentum': { timing: 0.75, freq: 0.7, hold: 0.4 },
  'liquidity-radar': { timing: 0.6, freq: 0.45, hold: 0.55 },
  'range-navigator': { timing: 0.5, freq: 0.35, hold: 0.75 },
  'volatility-architect': { timing: 0.7, freq: 0.6, hold: 0.45 },
  'adaptive-learner': { timing: 0.6, freq: 0.55, hold: 0.5 },
  'sentiment-reactor': { timing: 0.55, freq: 0.5, hold: 0.6 },
  'fractal-intelligence': { timing: 0.6, freq: 0.4, hold: 0.65 },
  'risk-sentinel': { timing: 0.5, freq: 0.3, hold: 0.8 },
  // FX Specialists
  'session-momentum': { timing: 0.75, freq: 0.65, hold: 0.35 },
  'carry-flow': { timing: 0.5, freq: 0.3, hold: 0.8 },
  'correlation-regime': { timing: 0.55, freq: 0.35, hold: 0.6 },
  'spread-microstructure': { timing: 0.7, freq: 0.55, hold: 0.4 },
  'news-event-shield': { timing: 0.45, freq: 0.25, hold: 0.7 },
  // Cross-Asset Intelligence
  'cross-asset-sync': { timing: 0.5, freq: 0.35, hold: 0.65 },
  'execution-optimizer': { timing: 0.65, freq: 0.5, hold: 0.45 },
  'regime-transition': { timing: 0.6, freq: 0.4, hold: 0.55 },
};

// Capital weight distribution across all agents
const CAPITAL_WEIGHTS: Record<AgentId, number> = {
  'equities-alpha': 0.12,
  'forex-macro': 0.08,
  'crypto-momentum': 0.06,
  'liquidity-radar': 0.07,
  'range-navigator': 0.05,
  'volatility-architect': 0.06,
  'adaptive-learner': 0.04,
  'sentiment-reactor': 0.05,
  'fractal-intelligence': 0.07,
  'risk-sentinel': 0.07,
  // FX Specialists
  'session-momentum': 0.06,
  'carry-flow': 0.05,
  'correlation-regime': 0.04,
  'spread-microstructure': 0.05,
  'news-event-shield': 0.03,
  // Cross-Asset Intelligence
  'cross-asset-sync': 0.04,
  'execution-optimizer': 0.03,
  'regime-transition': 0.03,
};

const createAdaptiveParameters = (agentId: AgentId, rng: EvolutionRNG): AdaptiveParameters => {
  const c = ADAPTIVE_CONFIGS[agentId];

  return {
    entryTiming: createAdaptiveRange(rng, c.timing, 0.2, 0.95, 0.6),
    signalConfirmationWeight: createAdaptiveRange(rng, 0.6, 0.3, 0.9, 0.5),
    tradeFrequency: createAdaptiveRange(rng, c.freq, 0.1, 0.9, 0.7),
    holdDuration: createAdaptiveRange(rng, c.hold, 0.2, 0.9, 0.5),
    signalPersistence: createAdaptiveRange(rng, 0.55, 0.2, 0.85, 0.4),
    regimeSensitivity: createAdaptiveRange(rng, 0.7, 0.4, 1.0, 0.6),
  };
};

// ─── Risk Stability Anchors ───

const createRiskAnchors = (rng: EvolutionRNG): RiskStabilityAnchors => {
  const status = (current: number, threshold: number, inverse = false): 'safe' | 'warning' | 'critical' => {
    const ratio = inverse ? threshold / current : current / threshold;
    if (ratio < 0.7) return 'safe';
    if (ratio < 0.9) return 'warning';
    return 'critical';
  };

  const ddCurrent = rng.range(800, 1600);
  const riskCurrent = rng.range(3.5, 4.8);
  const expCurrent = rng.range(15, 28);
  const volCurrent = rng.range(12, 22);
  const corrCurrent = rng.range(0.15, 0.35);

  return {
    maxDrawdown: {
      label: 'Max Drawdown',
      description: 'Portfolio-level maximum drawdown containment',
      threshold: 2000,
      current: ddCurrent,
      unit: '$',
      status: status(ddCurrent, 2000),
      icon: '🛡️',
    },
    riskPerTrade: {
      label: 'Risk Per Trade',
      description: 'Maximum risk allocation per individual trade',
      threshold: 5.0,
      current: riskCurrent,
      unit: '%',
      status: status(riskCurrent, 5.0),
      icon: '⚖️',
    },
    exposureConcentration: {
      label: 'Exposure Concentration',
      description: 'Maximum exposure in any single asset or sector',
      threshold: 30,
      current: expCurrent,
      unit: '%',
      status: status(expCurrent, 30),
      icon: '🎯',
    },
    volatilityTolerance: {
      label: 'Volatility Tolerance',
      description: 'Acceptable portfolio volatility boundary',
      threshold: 25,
      current: volCurrent,
      unit: '%',
      status: status(volCurrent, 25),
      icon: '📊',
    },
    correlationSafety: {
      label: 'Correlation Safety',
      description: 'Portfolio correlation safety limits between models',
      threshold: 0.4,
      current: corrCurrent,
      unit: 'ρ',
      status: status(corrCurrent, 0.4),
      icon: '🔗',
    },
  };
};

// ─── Performance Memory ───

const createMemoryWindow = (
  rng: EvolutionRNG,
  horizon: 'short' | 'medium' | 'long',
  days: number,
  label: string
): PerformanceMemoryWindow => {
  const baseQuality = horizon === 'long' ? 0.55 : horizon === 'medium' ? 0.6 : 0.65;
  const winRate = baseQuality + rng.range(-0.08, 0.1);
  const trends: Array<'improving' | 'stable' | 'degrading'> = ['improving', 'stable', 'degrading'];

  return {
    label,
    horizon,
    periodDays: days,
    winRate,
    avgReturn: rng.range(0.005, 0.025) * (winRate > 0.5 ? 1 : -0.3),
    sharpe: rng.range(0.8, 1.8),
    maxDrawdown: rng.range(400, 1500),
    regimeAccuracy: rng.range(0.55, 0.85),
    signalQuality: rng.range(0.5, 0.9),
    trend: rng.pick(trends),
  };
};

const createPerformanceMemory = (rng: EvolutionRNG): PerformanceMemory => ({
  shortTerm: createMemoryWindow(rng, 'short', 7, '7-Day Window'),
  mediumTerm: createMemoryWindow(rng, 'medium', 30, '30-Day Window'),
  longTerm: createMemoryWindow(rng, 'long', 90, '90-Day Window'),
  validationStatus: rng.next() > 0.2 ? 'accepted' : 'pending',
});

// ─── Behavioral Risk ───

const createBehavioralMetric = (
  rng: EvolutionRNG,
  label: string,
  description: string,
  baseValue: number,
  threshold: number
): BehavioralRiskMetric => {
  const value = Math.max(0, Math.min(100, baseValue + rng.range(-15, 15)));
  const trends: Array<'improving' | 'stable' | 'degrading'> = ['improving', 'stable', 'degrading'];
  return {
    label,
    description,
    value,
    threshold,
    status: value < threshold * 0.6 ? 'healthy' : value < threshold ? 'elevated' : 'critical',
    trend: rng.pick(trends),
  };
};

const createBehavioralRisk = (rng: EvolutionRNG): BehavioralRiskProfile => ({
  signalDegradation: createBehavioralMetric(rng, 'Signal Degradation', 'Quality decline in signal output', 25, 60),
  regimeMisclassification: createBehavioralMetric(rng, 'Regime Misclass.', 'Incorrect market regime identification', 18, 50),
  confidenceVolatility: createBehavioralMetric(rng, 'Confidence Volatility', 'Instability in confidence scoring', 30, 55),
  timingDrift: createBehavioralMetric(rng, 'Timing Drift', 'Entry/exit timing deviation from optimal', 22, 45),
  overAdaptation: createBehavioralMetric(rng, 'Over-Adaptation', 'Excessive parameter mutation rate', 15, 40),
});

// ─── Confidence Elasticity ───

const createConfidenceElasticity = (_agentId: AgentId, rng: EvolutionRNG): ConfidenceElasticity => {
  const confidence = rng.range(45, 82);
  return {
    currentConfidence: confidence,
    tradeSizeMultiplier: 0.5 + (confidence / 100) * 1.0,
    entryPatienceLevel: confidence > 65 ? rng.range(0.3, 0.6) : rng.range(0.6, 0.9),
    exitAggressiveness: confidence > 65 ? rng.range(0.3, 0.5) : rng.range(0.6, 0.85),
    signalLifespan: Math.floor(rng.range(3, 15)),
  };
};

// ─── Capital Allocation ───

const createCapitalAllocation = (rng: EvolutionRNG): CapitalAllocation => {
  const explorationPct = rng.range(15, 30);
  return {
    exploitationPercent: 100 - explorationPct,
    explorationPercent: explorationPct,
    exploitationPnl: rng.range(2000, 8000),
    explorationPnl: rng.range(-500, 2000),
    explorationDiscoveries: Math.floor(rng.range(2, 8)),
    rebalanceHistory: [
      {
        timestamp: Date.now() - 86400000 * 3,
        fromExploration: 20,
        toExploration: 25,
        reason: 'Exploration models showing positive alpha — increased allocation',
      },
      {
        timestamp: Date.now() - 86400000 * 7,
        fromExploration: 25,
        toExploration: 20,
        reason: 'Elevated market volatility — reduced experimental exposure',
      },
      {
        timestamp: Date.now() - 86400000 * 14,
        fromExploration: 18,
        toExploration: 25,
        reason: 'Stable regime detected — expanded exploration budget',
      },
    ],
  };
};

// ─── Meta-Controller ───

const createModelFreedom = (
  agentId: AgentId,
  performance: { winRate: number; sharpeRatio: number },
  rng: EvolutionRNG
): ModelFreedomLevel => {
  const baseFreedom = performance.winRate > 0.55 ? 75 : performance.winRate > 0.5 ? 55 : 35;
  const freedom = Math.max(20, Math.min(90, baseFreedom + rng.range(-10, 10)));
  const restrictions: string[] = [];

  if (freedom < 50) restrictions.push('Reduced parameter elasticity');
  if (performance.sharpeRatio < 1.0) restrictions.push('Sharpe below threshold');
  if (rng.next() > 0.7) restrictions.push('Regime uncertainty detected');

  return {
    agentId,
    freedomScore: freedom,
    restrictionReasons: restrictions,
    lastAdjustment: Date.now() - Math.floor(rng.range(0, 3600000)),
    capitalWeight: CAPITAL_WEIGHTS[agentId],
  };
};

const createReversionHistory = (rng: EvolutionRNG): ReversionCheckpoint[] => {
  const reasons = [
    'Performance drift exceeding 2σ from baseline',
    'Regime misclassification rate above threshold',
    'Over-adaptation detected — reverting parameters',
    'Drawdown acceleration triggered safety reversion',
  ];

  return Array.from({ length: 5 }, (_, i) => ({
    timestamp: Date.now() - 86400000 * (i + 2),
    agentId: rng.pick(ALL_AGENT_IDS),
    reason: rng.pick(reasons),
    parametersBefore: {},
    parametersAfter: {},
    performanceDelta: rng.range(-0.05, 0.03),
  }));
};

// ─── Main Export: Create Evolution Ecosystem ───

export const createEvolutionEcosystem = (
  agents: Record<AgentId, AIAgent>
): EvolutionEcosystem => {
  const rng = new EvolutionRNG(137);

  // Create per-agent evolution states
  const agentEvolution: Record<AgentId, AgentEvolutionState> = {} as any;
  for (const id of ALL_AGENT_IDS) {
    agentEvolution[id] = {
      agentId: id,
      adaptiveParams: createAdaptiveParameters(id, rng),
      confidenceElasticity: createConfidenceElasticity(id, rng),
      performanceMemory: createPerformanceMemory(rng),
      behavioralRisk: createBehavioralRisk(rng),
      mutationCount: Math.floor(rng.range(45, 200)),
      lastEvolutionCycle: Date.now() - Math.floor(rng.range(0, 1800000)),
      generationNumber: Math.floor(rng.range(12, 48)),
      fitnessScore: rng.range(55, 88),
    };
  }

  // Create agent freedom levels
  const agentFreedom: Record<AgentId, ModelFreedomLevel> = {} as any;
  for (const id of ALL_AGENT_IDS) {
    agentFreedom[id] = createModelFreedom(id, agents[id].performance, rng);
  }

  // Determine meta-controller mode
  const avgFitness = ALL_AGENT_IDS.reduce((s, id) => s + agentEvolution[id].fitnessScore, 0) / ALL_AGENT_IDS.length;
  let mode: MetaControllerMode = 'observing';
  if (avgFitness < 60) mode = 'intervening';
  else if (avgFitness < 70) mode = 'adjusting';
  else if (avgFitness > 80) mode = 'stabilizing';

  const systemHealth = rng.range(72, 92);

  const metaController: MetaControllerState = {
    mode,
    influenceScore: mode === 'observing' ? rng.range(15, 35) : mode === 'stabilizing' ? rng.range(20, 40) : rng.range(50, 80),
    agentFreedom,
    riskAnchors: createRiskAnchors(rng),
    capitalAllocation: createCapitalAllocation(rng),
    systemHealth,
    adaptationRate: rng.range(2, 8),
    stabilityIndex: rng.range(65, 90),
    lastGovernanceAction: mode === 'observing'
      ? 'System stable — no intervention required'
      : mode === 'adjusting'
        ? 'Adjusting crypto-momentum parameter elasticity'
        : mode === 'intervening'
          ? 'Restricting forex-macro after regime misclassification spike'
          : 'Stabilizing portfolio allocation after successful adaptation cycle',
    lastGovernanceTimestamp: Date.now() - Math.floor(rng.range(300000, 1800000)),
    reversionHistory: createReversionHistory(rng),
    evolutionCycle: Math.floor(rng.range(150, 500)),
  };

  return {
    metaController,
    agentEvolution,
    ecosystemAge: metaController.evolutionCycle,
    totalMutations: ALL_AGENT_IDS.reduce((s, id) => s + agentEvolution[id].mutationCount, 0),
    survivalRate: rng.range(0.35, 0.65),
  };
};
