// Meta-Orchestrator: 4-Layer Trade Control Stack
// Wires L1 (Proposal) → L2 (Governance) → L3 (Direction) → L4 (Adaptive Edge)
// into a single, auditable pipeline.
//
// CRITICAL: Does NOT modify governance formulas, QuantLabs direction logic,
// multiplier weights, or gate thresholds. This module is ORCHESTRATION ONLY.
//
// Each layer has a single responsibility:
//   L1 — Signal agents generate proposals (symbol, direction intent, agent_id)
//   L2 — Governance decides IF (7 multipliers + 8+ gates → approved/throttled/rejected)
//   L3 — QuantLabs decides WHICH WAY (LONG/SHORT/NEUTRAL → SKIP if neutral)
//   L4 — Adaptive Edge decides HOW MUCH (envKey classification → multiplier)

import type { Timeframe } from '@/lib/market/types';
import type { TradeHistoryEntry } from './governanceContextProvider';
import {
  evaluateFullDecision,
  type TradeProposal,
  type FullGovernanceDecisionResult,
} from './tradeGovernanceEngine';
import {
  isAdaptiveEdgeActive,
  getAdaptiveEdgeEnabled,
  getForceBaselineUntilTs,
  type AdaptiveEdgeExplain,
} from './environmentSignature';
import {
  getDeploymentMode,
  getEdgeLearningSummary,
  type AdaptiveDeploymentMode,
  type EdgeLearningSummary,
} from './edgeLearningState';
import {
  getDiscoveryRiskConfig,
  getDiscoveryRiskStats,
  type DiscoveryRiskStats,
} from './discoveryRiskEngine';
import {
  runDriftMonitor,
  type DriftMonitorState,
} from './edgeDriftMonitor';
import {
  computeAdaptiveAllocation,
  getShadowValidationState,
  type AdaptiveAllocationResult,
  type ShadowValidationState,
} from './adaptiveCapitalAllocator';
import { ALL_AGENT_IDS, AGENT_DEFINITIONS, type AgentDefinition } from '@/lib/agents/agentConfig';

// ─── Layer Descriptions ─────────────────────────────────────────────

export const LAYER_DESCRIPTIONS = {
  L1: {
    name: 'Proposal Layer (Signal Agents)',
    description: 'All 18 trading agents generate proposals. Each proposal contains: symbol, direction intent (long/short), reason tag, expected duration bucket, and risk estimate.',
    owner: 'Trading Fleet (18 agents)',
  },
  L2: {
    name: 'Governance Layer (WHEN to trade)',
    description: '7 multipliers (MTF, Regime, Pair, Microstructure, Exit, Session, Sequencing) + 8+ rejection gates produce a composite score and decision: approved / throttled / rejected.',
    owner: 'tradeGovernanceEngine.ts',
  },
  L3: {
    name: 'Direction Layer (WHICH way to trade)',
    description: 'If governance approves, QuantLabs directional engine is consulted. NEUTRAL or unavailable → automatic SKIP. Direction CANNOT override governance rejection.',
    owner: 'quantlabsDirectionProvider.ts',
  },
  L4: {
    name: 'Adaptive Edge Allocation (HOW MUCH / HOW OFTEN)',
    description: 'Computes environmentSignature → classifies as EDGE / NEUTRAL / BAD → applies allocation multiplier (0.25x–1.75x). Kill-switch forces 1.0x baseline.',
    owner: 'discoveryRiskEngine.ts + adaptiveCapitalAllocator.ts',
  },
} as const;

// ─── Orchestrator Status ─────────────────────────────────────────────

export interface MetaOrchestratorStatus {
  adaptiveEdgeEnabled: boolean;
  adaptiveEdgeActive: boolean;          // enabled AND not force-baseline
  forceBaselineUntil: number | null;
  deploymentMode: AdaptiveDeploymentMode;
  discoveryRiskEnabled: boolean;
  shadowValidated: boolean;
  shadowState: ShadowValidationState | null;
  driftState: DriftMonitorState;
  edgeLearningSummary: EdgeLearningSummary;
  discoveryRiskStats: DiscoveryRiskStats;
  layers: typeof LAYER_DESCRIPTIONS;
}

export function getOrchestratorStatus(): MetaOrchestratorStatus {
  return {
    adaptiveEdgeEnabled: getAdaptiveEdgeEnabled(),
    adaptiveEdgeActive: isAdaptiveEdgeActive(),
    forceBaselineUntil: getForceBaselineUntilTs(),
    deploymentMode: getDeploymentMode(),
    discoveryRiskEnabled: getDiscoveryRiskConfig().enabled,
    shadowValidated: !!getShadowValidationState()?.validated,
    shadowState: getShadowValidationState(),
    driftState: runDriftMonitor(),
    edgeLearningSummary: getEdgeLearningSummary(),
    discoveryRiskStats: getDiscoveryRiskStats(),
    layers: LAYER_DESCRIPTIONS,
  };
}

// ─── Agent Weighting Table ───────────────────────────────────────────

export type AgentCapitalPriority = 'HIGH' | 'STANDARD' | 'REDUCED' | 'BLOCKED';

export interface AgentWeightEntry {
  agentId: string;
  name: string;
  icon: string;
  model: string;
  capitalPriority: AgentCapitalPriority;
  capitalMultiplier: number;          // 0.0–1.5
  reason: string;
  baseWinRate: number;
  baseSharpe: number;
  coordinationScore: number;
  strategyFocus: string;
}

/**
 * Deterministic agent weighting table.
 * Based on audit findings + discovery risk classification.
 *
 * HIGH: Proven edge environments — increased allocation
 * STANDARD: Neutral or developing — baseline allocation
 * REDUCED: Weak signal or limited sample — reduced allocation
 * BLOCKED: Historically destructive — zero allocation
 */
export function getAgentWeightingTable(): AgentWeightEntry[] {
  // Agents proven destructive per audit
  const BLOCKED_AGENTS = new Set(['sentiment-reactor', 'range-navigator']);

  // Agents with proven edge per audit
  const HIGH_PRIORITY_AGENTS = new Set([
    'forex-macro',        // Primary scalping engine, NY overlap specialist
    'session-momentum',   // Session-open breakout expert
    'risk-sentinel',      // Risk guardian — highest coordination score
    'spread-microstructure', // Friction optimization
  ]);

  // Agents with moderate evidence
  const STANDARD_AGENTS = new Set([
    'equities-alpha',
    'liquidity-radar',
    'volatility-architect',
    'fractal-intelligence',
    'carry-flow',
    'correlation-regime',
    'execution-optimizer',
    'cross-asset-sync',
    'regime-transition',
    'news-event-shield',
  ]);

  return ALL_AGENT_IDS.map((agentId): AgentWeightEntry => {
    const def = AGENT_DEFINITIONS[agentId];

    let capitalPriority: AgentCapitalPriority;
    let capitalMultiplier: number;
    let reason: string;

    if (BLOCKED_AGENTS.has(agentId)) {
      capitalPriority = 'BLOCKED';
      capitalMultiplier = 0;
      reason = 'Historically destructive — blocked by Discovery Risk audit';
    } else if (HIGH_PRIORITY_AGENTS.has(agentId)) {
      capitalPriority = 'HIGH';
      capitalMultiplier = 1.35;
      reason = getHighPriorityReason(agentId);
    } else if (STANDARD_AGENTS.has(agentId)) {
      capitalPriority = 'STANDARD';
      capitalMultiplier = 1.0;
      reason = 'Standard allocation — developing or neutral edge evidence';
    } else {
      capitalPriority = 'REDUCED';
      capitalMultiplier = 0.55;
      reason = 'Reduced allocation — insufficient edge evidence or low sample';
    }

    return {
      agentId,
      name: def.name,
      icon: def.icon,
      model: def.model,
      capitalPriority,
      capitalMultiplier,
      reason,
      baseWinRate: def.baseWinRate,
      baseSharpe: def.baseSharpe,
      coordinationScore: def.coordinationScore,
      strategyFocus: def.strategyBlocks[0] || 'general',
    };
  });
}

function getHighPriorityReason(agentId: string): string {
  switch (agentId) {
    case 'forex-macro':
      return 'Primary scalping engine — proven NY overlap edge, highest trade volume';
    case 'session-momentum':
      return 'Session-open breakout specialist — London/NY open momentum capture';
    case 'risk-sentinel':
      return 'Risk guardian — highest coordination score (80), fleet-wide protection';
    case 'spread-microstructure':
      return 'Friction optimization — reduces spread-driven losses across all pairs';
    default:
      return 'High capital priority based on audit performance';
  }
}

// ─── Pipeline Execution (client-side simulation) ─────────────────────

export function executeMetaPipeline(
  proposal: TradeProposal,
  timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): FullGovernanceDecisionResult {
  // The full L1→L2→L3→L4 pipeline is already wired inside evaluateFullDecision.
  // This function exists as the canonical entry point for the meta-orchestrator.
  return evaluateFullDecision(proposal, timeframe, tradeHistory);
}

// ─── Safety Controls ─────────────────────────────────────────────────

export { setAdaptiveEdgeEnabled, setForceBaselineUntil } from './environmentSignature';
export { setShadowMode, isShadowMode } from './tradeGovernanceEngine';
export { setDeploymentMode } from './edgeLearningState';
export { setDiscoveryRiskConfig } from './discoveryRiskEngine';
