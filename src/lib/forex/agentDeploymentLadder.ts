// Agent Deployment Ladder
// Phase 3: Manages per-agent deployment states (Shadow → Reduced → Normal)
//
// Does NOT modify governance multipliers, gates, or QuantLabs logic.
// Only controls agent-level execution permissions and sizing.

import { isAdaptiveEdgeActive } from './environmentSignature';

// ─── Types ────────────────────────────────────────────────────────────

export type DeploymentState = 'shadow' | 'reduced-live' | 'normal-live' | 'disabled';

export interface AgentDeployment {
  agentId: string;
  state: DeploymentState;
  shadowTrades: number;
  shadowExpectancy: number;
  baselineExpectancy: number;
  expectancyRatio: number;
  ddRatio: number;
  profitableSessions: number;
  daysWithoutDrift: number;
  lastStateChange: number;
  reducedSizeMultiplier: number;
  stateHistory: { state: DeploymentState; ts: number; reason: string }[];
}

export interface DeploymentUnlockCriteria {
  minShadowTrades: number;
  minExpectancyRatio: number;
  maxDDRatio: number;
  minProfitableSessions: number;
  minDaysWithoutDrift: number;
}

// ─── Configuration ───────────────────────────────────────────────────

const UNLOCK_CRITERIA: Record<string, DeploymentUnlockCriteria> = {
  'shadow-to-reduced': {
    minShadowTrades: 150,
    minExpectancyRatio: 1.3,
    maxDDRatio: 0.70,
    minProfitableSessions: 3,
    minDaysWithoutDrift: 7,
  },
  'reduced-to-normal': {
    minShadowTrades: 300,
    minExpectancyRatio: 1.2,
    maxDDRatio: 0.60,
    minProfitableSessions: 4,
    minDaysWithoutDrift: 14,
  },
};

const REDUCED_SIZE_MULTIPLIER = 0.35;

// ─── State Management ────────────────────────────────────────────────

let _deployments: Map<string, AgentDeployment> = new Map();

export function getAgentDeployment(agentId: string): AgentDeployment {
  if (!_deployments.has(agentId)) {
    _deployments.set(agentId, createDefaultDeployment(agentId));
  }
  return _deployments.get(agentId)!;
}

export function getAllDeployments(): AgentDeployment[] {
  return Array.from(_deployments.values());
}

export function setAgentDeploymentState(
  agentId: string,
  newState: DeploymentState,
  reason: string
): AgentDeployment {
  const deployment = getAgentDeployment(agentId);
  const oldState = deployment.state;
  deployment.state = newState;
  deployment.lastStateChange = Date.now();
  deployment.stateHistory.push({ state: newState, ts: Date.now(), reason });
  deployment.reducedSizeMultiplier = newState === 'reduced-live' ? REDUCED_SIZE_MULTIPLIER : 1.0;

  console.log(`[DEPLOY-LADDER] ${agentId}: ${oldState} → ${newState} (${reason})`);
  _deployments.set(agentId, deployment);
  return deployment;
}

function createDefaultDeployment(agentId: string): AgentDeployment {
  return {
    agentId,
    state: 'shadow',
    shadowTrades: 0,
    shadowExpectancy: 0,
    baselineExpectancy: 0,
    expectancyRatio: 0,
    ddRatio: 1.0,
    profitableSessions: 0,
    daysWithoutDrift: 0,
    lastStateChange: Date.now(),
    reducedSizeMultiplier: 1.0,
    stateHistory: [{ state: 'shadow', ts: Date.now(), reason: 'initial' }],
  };
}

// ─── Unlock Logic ────────────────────────────────────────────────────

export interface UnlockCheck {
  canUnlock: boolean;
  unmetCriteria: string[];
  metCriteria: string[];
  nextState: DeploymentState | null;
}

export function checkUnlock(agentId: string): UnlockCheck {
  const dep = getAgentDeployment(agentId);
  
  if (dep.state === 'disabled') {
    return { canUnlock: false, unmetCriteria: ['Agent is disabled'], metCriteria: [], nextState: null };
  }
  if (dep.state === 'normal-live') {
    return { canUnlock: false, unmetCriteria: [], metCriteria: ['Already at normal-live'], nextState: null };
  }

  const criteriaKey = dep.state === 'shadow' ? 'shadow-to-reduced' : 'reduced-to-normal';
  const criteria = UNLOCK_CRITERIA[criteriaKey];
  const nextState: DeploymentState = dep.state === 'shadow' ? 'reduced-live' : 'normal-live';

  const met: string[] = [];
  const unmet: string[] = [];

  if (dep.shadowTrades >= criteria.minShadowTrades) met.push(`Shadow trades: ${dep.shadowTrades} ≥ ${criteria.minShadowTrades}`);
  else unmet.push(`Shadow trades: ${dep.shadowTrades} < ${criteria.minShadowTrades}`);

  if (dep.expectancyRatio >= criteria.minExpectancyRatio) met.push(`Expectancy ratio: ${dep.expectancyRatio.toFixed(2)} ≥ ${criteria.minExpectancyRatio}`);
  else unmet.push(`Expectancy ratio: ${dep.expectancyRatio.toFixed(2)} < ${criteria.minExpectancyRatio}`);

  if (dep.ddRatio <= criteria.maxDDRatio) met.push(`DD ratio: ${dep.ddRatio.toFixed(2)} ≤ ${criteria.maxDDRatio}`);
  else unmet.push(`DD ratio: ${dep.ddRatio.toFixed(2)} > ${criteria.maxDDRatio}`);

  if (dep.profitableSessions >= criteria.minProfitableSessions) met.push(`Sessions profitable: ${dep.profitableSessions} ≥ ${criteria.minProfitableSessions}`);
  else unmet.push(`Sessions profitable: ${dep.profitableSessions} < ${criteria.minProfitableSessions}`);

  if (dep.daysWithoutDrift >= criteria.minDaysWithoutDrift) met.push(`Days without drift: ${dep.daysWithoutDrift} ≥ ${criteria.minDaysWithoutDrift}`);
  else unmet.push(`Days without drift: ${dep.daysWithoutDrift} < ${criteria.minDaysWithoutDrift}`);

  return { canUnlock: unmet.length === 0, unmetCriteria: unmet, metCriteria: met, nextState };
}

// ─── Execution Gate ──────────────────────────────────────────────────

export interface AgentExecutionPermission {
  canExecute: boolean;
  sizeMultiplier: number;
  reason: string;
}

export function getAgentExecutionPermission(agentId: string): AgentExecutionPermission {
  // Kill-switch override
  if (!isAdaptiveEdgeActive()) {
    return { canExecute: true, sizeMultiplier: 1.0, reason: 'Adaptive edge disabled — baseline mode' };
  }

  const dep = getAgentDeployment(agentId);

  switch (dep.state) {
    case 'disabled':
      return { canExecute: false, sizeMultiplier: 0, reason: `Agent ${agentId} disabled` };
    case 'shadow':
      return { canExecute: false, sizeMultiplier: 0, reason: `Agent ${agentId} in shadow-only mode` };
    case 'reduced-live':
      return { canExecute: true, sizeMultiplier: REDUCED_SIZE_MULTIPLIER, reason: `Agent ${agentId} at reduced size (${REDUCED_SIZE_MULTIPLIER}x)` };
    case 'normal-live':
      return { canExecute: true, sizeMultiplier: 1.0, reason: `Agent ${agentId} at normal size` };
    default:
      return { canExecute: false, sizeMultiplier: 0, reason: 'Unknown state' };
  }
}

// ─── Update Metrics ──────────────────────────────────────────────────

export function updateDeploymentMetrics(
  agentId: string,
  metrics: Partial<Pick<AgentDeployment, 'shadowTrades' | 'shadowExpectancy' | 'baselineExpectancy' | 'ddRatio' | 'profitableSessions' | 'daysWithoutDrift'>>
): void {
  const dep = getAgentDeployment(agentId);
  Object.assign(dep, metrics);
  if (dep.baselineExpectancy > 0) {
    dep.expectancyRatio = dep.shadowExpectancy / dep.baselineExpectancy;
  }
  _deployments.set(agentId, dep);
}

// ─── Reset ───────────────────────────────────────────────────────────

export function resetAllDeployments(): void {
  _deployments.clear();
}

export function initializeDeployments(
  tierA: string[], tierB: string[], tierC: string[], tierD: string[]
): void {
  for (const id of tierA) setAgentDeploymentState(id, 'reduced-live', 'Tier A — data-proven profitable');
  for (const id of tierB) setAgentDeploymentState(id, 'shadow', 'Tier B — needs retune validation');
  for (const id of tierC) setAgentDeploymentState(id, 'shadow', 'Tier C — restricted, needs deep retune');
  for (const id of tierD) setAgentDeploymentState(id, 'disabled', 'Tier D — disabled until further evidence');
}
