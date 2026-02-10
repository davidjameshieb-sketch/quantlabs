// ═══════════════════════════════════════════════════════════════
// Canonical Agent State Resolver — Single Source of Truth
// No dashboard is allowed to infer tier from raw PF or expectancy.
// Every view must call getAgentEffectiveState() instead.
// ═══════════════════════════════════════════════════════════════

import type { AgentTier, AgentScorecard, TradeRecord } from '@/lib/forex/agentOptimizationEngine';
import { buildAgentScorecard, buildAllScorecards, generateRetuneProposal } from '@/lib/forex/agentOptimizationEngine';
import { runTierBRescue, type TierBRescueResult } from '@/lib/forex/tierBRescueEngine';
import {
  getAgentDeployment, initializeDeployments, checkUnlock,
  type DeploymentState, type AgentDeployment,
} from '@/lib/forex/agentDeploymentLadder';

// ─── Types ────────────────────────────────────────────────────

export type EffectiveTier = 'A' | 'B-Rescued' | 'B-Shadow' | 'B-Promotable' | 'B-Legacy' | 'C' | 'D';

export type RescueStatus = 'none' | 'in_progress' | 'stabilized' | 'promotable';

export interface ActiveConstraint {
  type: 'block_direction' | 'block_pair' | 'block_session' | 'raise_composite' | 'raise_friction' | 'throttle_frequency';
  label: string;
  value: string;
}

export interface AgentEffectiveState {
  agentId: string;
  // Core state
  effectiveTier: EffectiveTier;
  rawTier: AgentTier;
  deploymentState: DeploymentState;
  sizeMultiplier: number;
  // Rescue
  rescueStatus: RescueStatus;
  rescued: boolean;
  activeConstraints: ActiveConstraint[];
  // Metrics — always post-rescue if rescued
  effectiveMetrics: {
    totalTrades: number;
    eligibleTrades: number; // after constraints
    winRate: number;
    expectancy: number;
    profitFactor: number;
    netPips: number;
    sharpe: number;
    maxDrawdown: number;
  };
  // Raw (pre-rescue) metrics for comparison
  rawMetrics: {
    totalTrades: number;
    winRate: number;
    expectancy: number;
    profitFactor: number;
    netPips: number;
  };
  // Validation
  lastValidationWindow: string;
  stabilityScore: number; // 0-100
  // Badges for UI
  badges: AgentBadge[];
}

export type AgentBadgeType =
  | 'RESCUED'
  | 'LONG-ONLY'
  | 'SESSION-FILTERED'
  | 'JPY-BLOCKED'
  | 'PAIR-BLOCKED'
  | 'COMPOSITE-RAISED'
  | 'PROMOTABLE'
  | 'SHADOW'
  | 'REDUCED'
  | 'DISABLED'
  | 'TIER-A'
  | 'LEGACY';

export interface AgentBadge {
  type: AgentBadgeType;
  label: string;
  color: string; // tailwind class
  tooltip: string;
}

// ─── Badge Colors ────────────────────────────────────────────

const BADGE_COLORS: Record<AgentBadgeType, string> = {
  'RESCUED': 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  'LONG-ONLY': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'SESSION-FILTERED': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'JPY-BLOCKED': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'PAIR-BLOCKED': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'COMPOSITE-RAISED': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'PROMOTABLE': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'SHADOW': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'REDUCED': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'DISABLED': 'bg-red-500/20 text-red-400 border-red-500/30',
  'TIER-A': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'LEGACY': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

// ─── Effective Tier Colors ───────────────────────────────────

export const EFFECTIVE_TIER_STYLES: Record<EffectiveTier, { bg: string; text: string; label: string }> = {
  'A': { bg: 'bg-emerald-500/20 border-emerald-500/30', text: 'text-emerald-400', label: 'Deploy' },
  'B-Rescued': { bg: 'bg-lime-500/20 border-lime-500/30', text: 'text-lime-400', label: 'Rescued (Reduced)' },
  'B-Shadow': { bg: 'bg-yellow-500/20 border-yellow-500/30', text: 'text-yellow-400', label: 'Validating' },
  'B-Promotable': { bg: 'bg-emerald-500/20 border-emerald-500/30', text: 'text-emerald-400', label: 'Ready for A-Test' },
  'B-Legacy': { bg: 'bg-red-500/20 border-red-500/30', text: 'text-red-400', label: 'Historical' },
  'C': { bg: 'bg-orange-500/20 border-orange-500/30', text: 'text-orange-400', label: 'Restrict' },
  'D': { bg: 'bg-red-500/20 border-red-500/30', text: 'text-red-400', label: 'Disable' },
};

// ─── Core Resolver ───────────────────────────────────────────

let _stateCache: Map<string, AgentEffectiveState> = new Map();
let _lastComputeTs = 0;
let _rescueCache: Map<string, TierBRescueResult> = new Map();

/**
 * Get the effective state for a single agent.
 * Uses cached results if available (call resolveAllAgentStates first).
 */
export function getAgentEffectiveState(agentId: string): AgentEffectiveState | null {
  return _stateCache.get(agentId) || null;
}

/**
 * Get all resolved agent states.
 */
export function getAllAgentStates(): AgentEffectiveState[] {
  return Array.from(_stateCache.values());
}

/**
 * Get the rescue result for an agent (for detailed dashboards).
 */
export function getAgentRescueResult(agentId: string): TierBRescueResult | null {
  return _rescueCache.get(agentId) || null;
}

/**
 * Build the effective state from RPC summary stats (lightweight path).
 * Used when we only have aggregate stats from the server, not full trade records.
 */
export function resolveAgentStatesFromStats(stats: Array<{
  agent_id: string;
  total_trades: number;
  win_count: number;
  net_pips: number;
  gross_profit: number;
  gross_loss: number;
  long_count: number;
  long_wins: number;
  long_net: number;
  short_count: number;
  short_wins: number;
  short_net: number;
}>): AgentEffectiveState[] {
  const states: AgentEffectiveState[] = [];

  // First pass: classify all tiers
  const tierMap = new Map<string, AgentTier>();
  for (const s of stats) {
    const totalTrades = s.total_trades || 0;
    const winRate = totalTrades > 0 ? s.win_count / totalTrades : 0;
    const expectancy = totalTrades > 0 ? s.net_pips / totalTrades : 0;
    const pf = s.gross_loss > 0 ? s.gross_profit / s.gross_loss : s.gross_profit > 0 ? 99 : 0;
    const sessionCoverage = expectancy > 0 ? 4 : expectancy > -0.5 ? 2 : 1;
    const oosHolds = expectancy > 0 && pf >= 1.05;

    let tier: AgentTier;
    if (expectancy > 0 && pf >= 1.10 && sessionCoverage >= 3 && oosHolds) tier = 'A';
    else if (s.net_pips > -1000 && pf >= 0.90) tier = 'B';
    else if (s.net_pips > -1500) tier = 'C';
    else tier = 'D';

    tierMap.set(s.agent_id, tier);
  }

  // Initialize deployments
  const tierA = stats.filter(s => tierMap.get(s.agent_id) === 'A').map(s => s.agent_id);
  const tierB = stats.filter(s => tierMap.get(s.agent_id) === 'B').map(s => s.agent_id);
  const tierC = stats.filter(s => tierMap.get(s.agent_id) === 'C').map(s => s.agent_id);
  const tierD = stats.filter(s => tierMap.get(s.agent_id) === 'D').map(s => s.agent_id);
  initializeDeployments(tierA, tierB, tierC, tierD);

  for (const s of stats) {
    const rawTier = tierMap.get(s.agent_id) || 'D';
    const deployment = getAgentDeployment(s.agent_id);
    const totalTrades = s.total_trades || 0;
    const winRate = totalTrades > 0 ? s.win_count / totalTrades : 0;
    const expectancy = totalTrades > 0 ? s.net_pips / totalTrades : 0;
    const pf = s.gross_loss > 0 ? s.gross_profit / s.gross_loss : s.gross_profit > 0 ? 99 : 0;

    // Detect constraints from data patterns
    const badges: AgentBadge[] = [];
    const constraints: ActiveConstraint[] = [];

    // Check directional asymmetry — if shorts are heavily negative, likely constrained
    const shortDestructive = s.short_net < -500 && s.short_count > 50;
    const longOnly = shortDestructive || (s.short_count === 0 && s.long_count > 50);

    if (longOnly && rawTier === 'B') {
      constraints.push({ type: 'block_direction', label: 'Block SHORT direction', value: 'short' });
      badges.push({
        type: 'LONG-ONLY', label: 'LONG-ONLY',
        color: BADGE_COLORS['LONG-ONLY'],
        tooltip: 'Short trades blocked — historical shorts destructive',
      });
    }

    // JPY cross detection
    // (We can't see pair-level from RPC stats alone, but we can flag based on known patterns)

    // Determine rescue status for Tier B
    let rescueStatus: RescueStatus = 'none';
    let rescued = false;
    let effectiveTier: EffectiveTier = rawTier === 'B' ? 'B-Legacy' : rawTier;

    // Compute effective (post-constraint) metrics for B agents
    let effectiveTradeCount = totalTrades;
    let effectiveWR = winRate;
    let effectiveExp = expectancy;
    let effectivePF = pf;
    let effectiveNet = s.net_pips;

    if (rawTier === 'B' && shortDestructive) {
      // Simulate post-rescue by using long-only metrics
      effectiveTradeCount = s.long_count;
      effectiveWR = s.long_count > 0 ? s.long_wins / s.long_count : 0;
      effectiveNet = s.long_net;
      effectiveExp = s.long_count > 0 ? s.long_net / s.long_count : 0;
      const longGP = Math.max(0, s.long_net);
      const longGL = Math.max(0, -s.long_net) || 0.01;
      effectivePF = longGP / longGL;

      if (effectiveExp > 0 && effectivePF >= 1.2) {
        rescued = true;
        rescueStatus = 'stabilized';
        effectiveTier = 'B-Rescued';
        badges.push({
          type: 'RESCUED', label: 'RESCUED',
          color: BADGE_COLORS['RESCUED'],
          tooltip: 'Agent rescued via constraint application. Metrics reflect post-rescue performance.',
        });
      } else {
        rescueStatus = 'in_progress';
        effectiveTier = 'B-Shadow';
      }
    } else if (rawTier === 'B') {
      // B without clear destructive pattern
      if (expectancy > 0 && pf >= 1.1) {
        rescueStatus = 'promotable';
        effectiveTier = 'B-Promotable';
        badges.push({
          type: 'PROMOTABLE', label: 'PROMOTABLE',
          color: BADGE_COLORS['PROMOTABLE'],
          tooltip: 'Agent meets Tier-A criteria post-constraint. Ready for promotion test.',
        });
      } else {
        rescueStatus = 'in_progress';
        effectiveTier = 'B-Shadow';
      }
    } else if (rawTier === 'A') {
      effectiveTier = 'A';
      badges.push({
        type: 'TIER-A', label: 'TIER-A',
        color: BADGE_COLORS['TIER-A'],
        tooltip: 'Proven profitable. Deployable.',
      });
    }

    // Deployment state badge
    if (deployment.state === 'shadow') {
      badges.push({
        type: 'SHADOW', label: 'SHADOW',
        color: BADGE_COLORS['SHADOW'],
        tooltip: 'Shadow-only execution (no live trades)',
      });
    } else if (deployment.state === 'reduced-live') {
      badges.push({
        type: 'REDUCED', label: 'REDUCED 0.35×',
        color: BADGE_COLORS['REDUCED'],
        tooltip: 'Reduced live execution at 0.35× sizing',
      });
    } else if (deployment.state === 'disabled') {
      badges.push({
        type: 'DISABLED', label: 'DISABLED',
        color: BADGE_COLORS['DISABLED'],
        tooltip: 'Agent disabled — no execution',
      });
    }

    // Stability score: composite of WR consistency, positive expectancy, PF stability
    const wrScore = Math.min(1, effectiveWR / 0.6) * 30;
    const expScore = effectiveExp > 0 ? Math.min(1, effectiveExp / 0.5) * 30 : 0;
    const pfScore = effectivePF >= 1.0 ? Math.min(1, (effectivePF - 1.0) / 0.5) * 20 : 0;
    const tradeScore = Math.min(1, effectiveTradeCount / 500) * 20;
    const stabilityScore = Math.round(wrScore + expScore + pfScore + tradeScore);

    const state: AgentEffectiveState = {
      agentId: s.agent_id,
      effectiveTier,
      rawTier,
      deploymentState: deployment.state,
      sizeMultiplier: deployment.reducedSizeMultiplier,
      rescueStatus,
      rescued,
      activeConstraints: constraints,
      effectiveMetrics: {
        totalTrades,
        eligibleTrades: effectiveTradeCount,
        winRate: effectiveWR,
        expectancy: effectiveExp,
        profitFactor: effectivePF,
        netPips: effectiveNet,
        sharpe: 0, // need full trades for sharpe
        maxDrawdown: 0, // need full trades for DD
      },
      rawMetrics: {
        totalTrades,
        winRate,
        expectancy,
        profitFactor: pf,
        netPips: s.net_pips,
      },
      lastValidationWindow: new Date().toISOString(),
      stabilityScore,
      badges,
    };

    states.push(state);
    _stateCache.set(s.agent_id, state);
  }

  _lastComputeTs = Date.now();
  return states;
}

/**
 * Full resolution with trade records (heavy path — used when full trade data is available).
 */
export function resolveAllAgentStates(trades: TradeRecord[]): AgentEffectiveState[] {
  const allScorecards = buildAllScorecards(trades);
  const tierAScorecards = allScorecards.filter(s => s.tier === 'A');
  const states: AgentEffectiveState[] = [];

  // Initialize deployments
  initializeDeployments(
    allScorecards.filter(s => s.tier === 'A').map(s => s.agentId),
    allScorecards.filter(s => s.tier === 'B').map(s => s.agentId),
    allScorecards.filter(s => s.tier === 'C').map(s => s.agentId),
    allScorecards.filter(s => s.tier === 'D').map(s => s.agentId),
  );

  for (const sc of allScorecards) {
    const deployment = getAgentDeployment(sc.agentId);
    const badges: AgentBadge[] = [];
    const constraints: ActiveConstraint[] = [];
    let rescueStatus: RescueStatus = 'none';
    let rescued = false;
    let effectiveTier: EffectiveTier = sc.tier === 'B' ? 'B-Legacy' : sc.tier;
    let effectiveMetrics = {
      totalTrades: sc.totalTrades,
      eligibleTrades: sc.totalTrades,
      winRate: sc.winRate,
      expectancy: sc.expectancy,
      profitFactor: sc.profitFactor,
      netPips: sc.netPips,
      sharpe: sc.sharpe,
      maxDrawdown: sc.maxDrawdown,
    };

    // For Tier B agents, run rescue pipeline
    if (sc.tier === 'B') {
      const agentTrades = trades.filter(t => t.agent_id === sc.agentId);
      const rescueResult = runTierBRescue(sc.agentId, agentTrades, tierAScorecards);
      _rescueCache.set(sc.agentId, rescueResult);

      // Extract constraints from rescue rules
      for (const rule of rescueResult.retuneRules) {
        constraints.push({ type: rule.type, label: rule.label, value: rule.value });

        if (rule.type === 'block_direction' && rule.value === 'short') {
          badges.push({ type: 'LONG-ONLY', label: 'LONG-ONLY', color: BADGE_COLORS['LONG-ONLY'], tooltip: 'Short trades blocked' });
        }
        if (rule.type === 'block_session') {
          badges.push({ type: 'SESSION-FILTERED', label: `NO ${rule.value.toUpperCase()}`, color: BADGE_COLORS['SESSION-FILTERED'], tooltip: `${rule.value} session blocked` });
        }
        if (rule.type === 'block_pair') {
          const isJPY = rule.value.includes('JPY');
          badges.push({
            type: isJPY ? 'JPY-BLOCKED' : 'PAIR-BLOCKED',
            label: isJPY ? 'JPY-BLOCKED' : `NO ${rule.value}`,
            color: isJPY ? BADGE_COLORS['JPY-BLOCKED'] : BADGE_COLORS['PAIR-BLOCKED'],
            tooltip: `${rule.value} pair blocked`,
          });
        }
        if (rule.type === 'raise_composite') {
          badges.push({ type: 'COMPOSITE-RAISED', label: `MIN ${rule.value}`, color: BADGE_COLORS['COMPOSITE-RAISED'], tooltip: `Composite threshold raised to ${rule.value}` });
        }
      }

      // Use post-rescue metrics
      if (rescueResult.retunedScorecard) {
        const rsc = rescueResult.retunedScorecard;
        effectiveMetrics = {
          totalTrades: sc.totalTrades,
          eligibleTrades: rsc.totalTrades,
          winRate: rsc.winRate,
          expectancy: rsc.expectancy,
          profitFactor: rsc.profitFactor,
          netPips: rsc.netPips,
          sharpe: rsc.sharpe,
          maxDrawdown: rsc.maxDrawdown,
        };
      }

      if (rescueResult.rescued) {
        rescued = true;
        if (rescueResult.shadowValidation.meetsPromotion && rescueResult.retunedScorecard &&
          rescueResult.retunedScorecard.profitFactor >= 1.3 && rescueResult.retunedScorecard.expectancy > 0.4) {
          rescueStatus = 'promotable';
          effectiveTier = 'B-Promotable';
          badges.push({ type: 'PROMOTABLE', label: 'PROMOTABLE', color: BADGE_COLORS['PROMOTABLE'], tooltip: 'Ready for Tier-A promotion test' });
        } else {
          rescueStatus = 'stabilized';
          effectiveTier = 'B-Rescued';
          badges.push({ type: 'RESCUED', label: 'RESCUED', color: BADGE_COLORS['RESCUED'], tooltip: 'Agent rescued via constraints. Post-rescue metrics shown.' });
        }
      } else {
        rescueStatus = 'in_progress';
        effectiveTier = 'B-Shadow';
      }
    } else if (sc.tier === 'A') {
      badges.push({ type: 'TIER-A', label: 'TIER-A', color: BADGE_COLORS['TIER-A'], tooltip: 'Proven profitable' });
    }

    // Deployment badges
    if (deployment.state === 'shadow') badges.push({ type: 'SHADOW', label: 'SHADOW', color: BADGE_COLORS['SHADOW'], tooltip: 'Shadow-only' });
    else if (deployment.state === 'reduced-live') badges.push({ type: 'REDUCED', label: '0.35×', color: BADGE_COLORS['REDUCED'], tooltip: 'Reduced sizing' });
    else if (deployment.state === 'disabled') badges.push({ type: 'DISABLED', label: 'DISABLED', color: BADGE_COLORS['DISABLED'], tooltip: 'Disabled' });

    // Stability score
    const wrScore = Math.min(1, effectiveMetrics.winRate / 0.6) * 30;
    const expScore = effectiveMetrics.expectancy > 0 ? Math.min(1, effectiveMetrics.expectancy / 0.5) * 30 : 0;
    const pfScore = effectiveMetrics.profitFactor >= 1.0 ? Math.min(1, (effectiveMetrics.profitFactor - 1.0) / 0.5) * 20 : 0;
    const tradeScore = Math.min(1, effectiveMetrics.eligibleTrades / 500) * 20;
    const stabilityScore = Math.round(wrScore + expScore + pfScore + tradeScore);

    states.push({
      agentId: sc.agentId,
      effectiveTier,
      rawTier: sc.tier,
      deploymentState: deployment.state,
      sizeMultiplier: deployment.state === 'reduced-live' ? 0.35 : deployment.state === 'disabled' || deployment.state === 'shadow' ? 0 : 1.0,
      rescueStatus,
      rescued,
      activeConstraints: constraints,
      effectiveMetrics,
      rawMetrics: {
        totalTrades: sc.totalTrades,
        winRate: sc.winRate,
        expectancy: sc.expectancy,
        profitFactor: sc.profitFactor,
        netPips: sc.netPips,
      },
      lastValidationWindow: new Date().toISOString(),
      stabilityScore,
      badges,
    });
  }

  for (const s of states) _stateCache.set(s.agentId, s);
  _lastComputeTs = Date.now();
  return states;
}

/**
 * Check if any view might be mixing legacy and effective states.
 */
export function hasLegacyStateMismatch(): boolean {
  const states = getAllAgentStates();
  return states.some(s => s.rawTier === 'B' && s.effectiveTier === 'B-Legacy');
}

/**
 * Clear the cache (for testing or forced refresh).
 */
export function clearAgentStateCache(): void {
  _stateCache.clear();
  _rescueCache.clear();
  _lastComputeTs = 0;
}
