// Edge Portfolio Allocator
// Phase 4: Selects and weights agents per trade based on edge confidence,
// diversification, and environmental coverage.
//
// Does NOT modify governance multipliers, gates, or QuantLabs logic.
// Only provides allocation recommendations.

import { buildEnvKeyFromRaw, normalizeSession, isAdaptiveEdgeActive } from './environmentSignature';
import { getAgentExecutionPermission, type DeploymentState } from './agentDeploymentLadder';

// ─── Types ────────────────────────────────────────────────────────────

export type PortfolioMode = 'portfolio-weighted' | 'cluster-coverage' | 'defensive';

export interface AgentEdgeProfile {
  agentId: string;
  deploymentState: DeploymentState;
  edgeConfidence: number;       // 0-1
  recentStability: number;      // 0-1 (rolling 50-trade Sharpe normalized)
  envCoverage: number;          // unique profitable env keys
  correlation: number;          // avg correlation with other active agents
  last24hTradeShare: number;    // % of recent trades from this agent
}

export interface PortfolioAllocation {
  agentId: string;
  weight: number;               // 0-1, allocation weight
  envMatchScore: number;
  diversificationPenalty: number;
  finalScore: number;
  reason: string;
}

export interface EdgePortfolio {
  mode: PortfolioMode;
  activeAgents: PortfolioAllocation[];
  totalAgents: number;
  envClustersCovered: number;
  concentrationRisk: number;    // 0-1 (HHI)
  healthStatus: 'green' | 'yellow' | 'red';
  healthReason: string;
}

// ─── Configuration ───────────────────────────────────────────────────

export interface PortfolioConfig {
  maxAgentShare24h: number;     // diversification penalty threshold
  diversificationPenaltyRate: number;
  minActiveAgents: number;
  defensiveAgents: string[];    // fallback agents for defensive mode
  envMatchWeight: number;
  edgeConfidenceWeight: number;
  stabilityWeight: number;
  diversificationWeight: number;
}

const DEFAULT_CONFIG: PortfolioConfig = {
  maxAgentShare24h: 0.40,
  diversificationPenaltyRate: 0.3,
  minActiveAgents: 2,
  defensiveAgents: ['carry-flow', 'spread-microstructure'],
  envMatchWeight: 0.35,
  edgeConfidenceWeight: 0.30,
  stabilityWeight: 0.20,
  diversificationWeight: 0.15,
};

let _config: PortfolioConfig = { ...DEFAULT_CONFIG };
let _currentMode: PortfolioMode = 'portfolio-weighted';

export function setPortfolioConfig(partial: Partial<PortfolioConfig>): void {
  _config = { ..._config, ...partial };
}

export function getPortfolioConfig(): PortfolioConfig {
  return { ..._config };
}

export function setPortfolioMode(mode: PortfolioMode): void {
  _currentMode = mode;
  console.log(`[PORTFOLIO] Mode set to: ${mode}`);
}

export function getPortfolioMode(): PortfolioMode {
  return _currentMode;
}

// ─── Allocation Logic ────────────────────────────────────────────────

export function computeAgentAllocation(
  envKey: string,
  profiles: AgentEdgeProfile[]
): PortfolioAllocation[] {
  if (!isAdaptiveEdgeActive()) {
    // Kill-switch: equal weight to all active agents
    const active = profiles.filter(p => p.deploymentState !== 'disabled' && p.deploymentState !== 'shadow');
    const w = active.length > 0 ? 1 / active.length : 0;
    return active.map(p => ({
      agentId: p.agentId, weight: w, envMatchScore: 1, diversificationPenalty: 0, finalScore: w,
      reason: 'Adaptive edge disabled — equal allocation',
    }));
  }

  const allocations: PortfolioAllocation[] = [];

  for (const profile of profiles) {
    const perm = getAgentExecutionPermission(profile.agentId);
    if (!perm.canExecute) continue;

    // Env match score (simplified — in production would check envKey overlap)
    const envMatchScore = profile.envCoverage > 0 ? Math.min(profile.envCoverage / 20, 1) : 0.5;

    // Diversification penalty
    const overConcentrated = profile.last24hTradeShare > _config.maxAgentShare24h;
    const diversificationPenalty = overConcentrated
      ? (profile.last24hTradeShare - _config.maxAgentShare24h) * _config.diversificationPenaltyRate
      : 0;

    // Composite score
    const finalScore = (
      envMatchScore * _config.envMatchWeight +
      profile.edgeConfidence * _config.edgeConfidenceWeight +
      profile.recentStability * _config.stabilityWeight -
      diversificationPenalty * _config.diversificationWeight
    ) * perm.sizeMultiplier;

    allocations.push({
      agentId: profile.agentId,
      weight: 0, // normalized below
      envMatchScore,
      diversificationPenalty,
      finalScore: Math.max(0, finalScore),
      reason: overConcentrated
        ? `Diversification penalty applied (${(profile.last24hTradeShare * 100).toFixed(0)}% share)`
        : `Edge confidence: ${(profile.edgeConfidence * 100).toFixed(0)}%`,
    });
  }

  // Normalize weights
  const totalScore = allocations.reduce((a, b) => a + b.finalScore, 0);
  if (totalScore > 0) {
    for (const a of allocations) {
      a.weight = a.finalScore / totalScore;
    }
  }

  return allocations.sort((a, b) => b.weight - a.weight);
}

// ─── Portfolio Builder ───────────────────────────────────────────────

export function buildEdgePortfolio(profiles: AgentEdgeProfile[]): EdgePortfolio {
  const mode = _currentMode;

  // In defensive mode, only use defensive agents
  const activeProfiles = mode === 'defensive'
    ? profiles.filter(p => _config.defensiveAgents.includes(p.agentId))
    : profiles.filter(p => p.deploymentState !== 'disabled' && p.deploymentState !== 'shadow');

  const allocations = computeAgentAllocation('global', activeProfiles);

  // Calculate concentration (HHI)
  const hhi = allocations.reduce((a, b) => a + b.weight ** 2, 0);

  // Environment cluster coverage
  const totalEnvCoverage = activeProfiles.reduce((a, p) => a + p.envCoverage, 0);
  const uniqueClusters = new Set(activeProfiles.map(p => p.agentId)).size;

  // Health assessment
  let healthStatus: 'green' | 'yellow' | 'red';
  let healthReason: string;

  if (allocations.length < _config.minActiveAgents) {
    healthStatus = 'red';
    healthReason = `Only ${allocations.length} active agents (minimum ${_config.minActiveAgents})`;
  } else if (hhi > 0.5) {
    healthStatus = 'yellow';
    healthReason = `High concentration: HHI=${hhi.toFixed(2)} — consider diversifying`;
  } else if (mode === 'defensive') {
    healthStatus = 'yellow';
    healthReason = 'Defensive mode active — limited agent pool';
  } else {
    healthStatus = 'green';
    healthReason = `${allocations.length} agents active, HHI=${hhi.toFixed(2)} — well diversified`;
  }

  return {
    mode,
    activeAgents: allocations,
    totalAgents: profiles.length,
    envClustersCovered: uniqueClusters,
    concentrationRisk: hhi,
    healthStatus,
    healthReason,
  };
}

// ─── Select Agent for Trade ──────────────────────────────────────────

export function selectAgentForTrade(
  envKey: string,
  profiles: AgentEdgeProfile[]
): PortfolioAllocation | null {
  const allocations = computeAgentAllocation(envKey, profiles);
  if (allocations.length === 0) return null;

  // Weighted random selection
  const rand = Math.random();
  let cumWeight = 0;
  for (const a of allocations) {
    cumWeight += a.weight;
    if (rand <= cumWeight) return a;
  }
  return allocations[0];
}
