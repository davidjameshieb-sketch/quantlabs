// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Router — Execution Grade
// Sections 3, 4, 7, 8 — Authority, Voting, Safety, Logging
// ═══════════════════════════════════════════════════════════════

import { AgentId } from './types';
import {
  AgentPairStats,
  CollaborationLabel,
  CollaborationSnapshot,
  hasEnvironmentContext,
} from './agentCollaborationEngine';

// ─── Types ───────────────────────────────────────────────────

export type InfluenceTier = 'NONE' | 'SOFT' | 'HARD';

export interface AuthorityAdjustment {
  agentId: AgentId;
  baseAuthority: number;
  collaborationMultiplier: number;
  finalAuthority: number;
  reason: string;
  influenceTier: InfluenceTier;
}

export interface CollaborationVote {
  agentId: AgentId;
  authority: number;
  collaborationScore: number;
  edgeConfidence: number;
  weightedScore: number;
}

export interface VotingResult {
  votes: CollaborationVote[];
  totalWeightedConfidence: number;
  threshold: number;
  approved: boolean;
  explanation: string;
}

export interface CollaborationDecisionLog {
  timestamp: number;
  collaboratingAgents: AgentId[];
  collaborationScores: Record<string, CollaborationLabel>;
  authorityAdjustments: AuthorityAdjustment[];
  vetoTriggers: string[];
  baselineVotingResult: VotingResult | null;
  weightedVotingResult: VotingResult | null;
  outcomeChanged: boolean;
  topCollaborationFactors: string[];
  finalDecisionReason: string;
  influenceTierUsed: InfluenceTier;
  budgetExceeded: boolean;
  flipMarginInsufficient: boolean;
}

export interface CollaborationSafetyState {
  collaborationWeightingEnabled: boolean;
  frozenPairs: Set<string>;
  independentRoutingMode: boolean;
  fallbackUntilTs: number | null;
  fallbackReason: string | null;
}

export interface CollaborationImpactStats {
  netPipsSavedByVeto: number;
  netPipsGainedBySynergy: number;
  decisionsChangedByCollaboration: number;
  currentMode: 'enabled' | 'disabled' | 'fallback' | 'independent';
  influenceTier: InfluenceTier;
  budgetUsedToday: number;
  budgetMaxToday: number;
  softInfluenceDisabledUntil: number | null;
}

// ─── Constants ───────────────────────────────────────────────

const SYNERGY_BOOST_MIN = 0.15;
const SYNERGY_BOOST_MAX = 0.30;
const CONFLICT_REDUCE_MIN = 0.30;
const CONFLICT_REDUCE_MAX = 0.60;
const VOTING_THRESHOLD = 0.55;

// Velocity limit: max 10% change per 50 evaluated opportunities
const VELOCITY_MAX_CHANGE = 0.10;
const VELOCITY_WINDOW = 50;

// Fallback: if collaboration-weighted expectancy < baseline by 20% over 100 trades → disable 24h
const FALLBACK_LOOKBACK = 100;
const FALLBACK_DEGRADATION_THRESHOLD = 0.20;
const FALLBACK_DURATION_MS = 24 * 60 * 60 * 1000;

// ─── Soft Influence Constants ────────────────────────────────

/** Tier A: soft influence activates at 10 paired samples */
export const SOFT_MIN_SAMPLE = 10;
/** Tier B: hard influence requires 40 paired samples (unchanged) */
export const HARD_MIN_SAMPLE = 40;
/** Soft tier authority clamp */
export const SOFT_CLAMP_MIN = 0.9;
export const SOFT_CLAMP_MAX = 1.1;
/** Influence budget: max fraction of daily decisions that can be flipped */
export const INFLUENCE_BUDGET_FRACTION = 0.10;
/** Minimum margin for a flip to be allowed */
export const FLIP_MARGIN_MIN = 0.02;
/** Changed-trade rollback: lookback window */
export const CHANGED_TRADE_ROLLBACK_LOOKBACK = 50;
/** Changed-trade rollback: degradation threshold */
export const CHANGED_TRADE_ROLLBACK_THRESHOLD = 0.20;
/** Soft influence disable duration */
export const SOFT_INFLUENCE_DISABLE_MS = 24 * 60 * 60 * 1000;

// ─── Safety State ────────────────────────────────────────────

let safetyState: CollaborationSafetyState = {
  collaborationWeightingEnabled: true,
  frozenPairs: new Set(),
  independentRoutingMode: false,
  fallbackUntilTs: null,
  fallbackReason: null,
};

// Velocity tracking: previous authority per agent
let previousAuthorities: Map<string, number> = new Map();
let evaluationCount = 0;

// Impact tracking
let impactStats: CollaborationImpactStats = {
  netPipsSavedByVeto: 0,
  netPipsGainedBySynergy: 0,
  decisionsChangedByCollaboration: 0,
  currentMode: 'enabled',
  influenceTier: 'NONE',
  budgetUsedToday: 0,
  budgetMaxToday: 0,
  softInfluenceDisabledUntil: null,
};

// ─── Influence Budget State ──────────────────────────────────

let dailyBudget = {
  date: '',
  totalDecisions: 0,
  flippedDecisions: 0,
};

// Changed-trade rollback state
let changedTradeTracker: { expectancyChanged: number; expectancyBaseline: number; count: number }[] = [];
let softInfluenceDisabledUntil: number | null = null;

// ─── Getters / Setters ───────────────────────────────────────

export function getCollaborationSafetyState(): CollaborationSafetyState {
  return { ...safetyState, frozenPairs: new Set(safetyState.frozenPairs) };
}

export function getCollaborationImpactStats(): CollaborationImpactStats {
  const budget = getBudgetStats();
  return {
    ...impactStats,
    currentMode: resolveCurrentMode(),
    influenceTier: isSoftInfluenceDisabled() ? 'NONE' : 'SOFT',
    budgetUsedToday: budget.used,
    budgetMaxToday: budget.max,
    softInfluenceDisabledUntil: getSoftInfluenceDisabledUntil(),
  };
}

function resolveCurrentMode(): CollaborationImpactStats['currentMode'] {
  if (safetyState.independentRoutingMode) return 'independent';
  if (!safetyState.collaborationWeightingEnabled) return 'disabled';
  if (safetyState.fallbackUntilTs && Date.now() < safetyState.fallbackUntilTs) return 'fallback';
  return 'enabled';
}

export function resetImpactStats(): void {
  impactStats = { netPipsSavedByVeto: 0, netPipsGainedBySynergy: 0, decisionsChangedByCollaboration: 0, currentMode: 'enabled', influenceTier: 'NONE', budgetUsedToday: 0, budgetMaxToday: 0, softInfluenceDisabledUntil: null };
}

// ─── Soft Influence Rollback ─────────────────────────────────

export function isSoftInfluenceDisabled(): boolean {
  return softInfluenceDisabledUntil !== null && Date.now() < softInfluenceDisabledUntil;
}

export function disableSoftInfluence(reason: string): void {
  softInfluenceDisabledUntil = Date.now() + SOFT_INFLUENCE_DISABLE_MS;
  console.log(`[COLLAB-ROUTER] SOFT INFLUENCE DISABLED: ${reason}`);
}

export function clearSoftInfluenceDisable(): void {
  softInfluenceDisabledUntil = null;
}

export function getSoftInfluenceDisabledUntil(): number | null {
  return softInfluenceDisabledUntil;
}

// ─── Influence Budget ────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureBudgetDay(): void {
  const today = todayKey();
  if (dailyBudget.date !== today) {
    dailyBudget = { date: today, totalDecisions: 0, flippedDecisions: 0 };
  }
}

export function recordDecision(flipped: boolean): void {
  ensureBudgetDay();
  dailyBudget.totalDecisions++;
  if (flipped) dailyBudget.flippedDecisions++;
}

export function isBudgetExceeded(): boolean {
  ensureBudgetDay();
  if (dailyBudget.totalDecisions === 0) return false;
  return (dailyBudget.flippedDecisions / dailyBudget.totalDecisions) > INFLUENCE_BUDGET_FRACTION;
}

export function getBudgetStats(): { used: number; max: number } {
  ensureBudgetDay();
  const maxFlips = Math.max(1, Math.floor(dailyBudget.totalDecisions * INFLUENCE_BUDGET_FRACTION));
  return { used: dailyBudget.flippedDecisions, max: maxFlips };
}

// ─── Changed-Trade Rollback ──────────────────────────────────

export function recordChangedTradeOutcome(changedExpectancy: number, baselineExpectancy: number): void {
  changedTradeTracker.push({ expectancyChanged: changedExpectancy, expectancyBaseline: baselineExpectancy, count: 1 });
  if (changedTradeTracker.length > CHANGED_TRADE_ROLLBACK_LOOKBACK) {
    changedTradeTracker = changedTradeTracker.slice(-CHANGED_TRADE_ROLLBACK_LOOKBACK);
  }
}

export function checkChangedTradeRollback(): boolean {
  if (changedTradeTracker.length < CHANGED_TRADE_ROLLBACK_LOOKBACK) return false;
  const avgChanged = changedTradeTracker.reduce((s, t) => s + t.expectancyChanged, 0) / changedTradeTracker.length;
  const avgBaseline = changedTradeTracker.reduce((s, t) => s + t.expectancyBaseline, 0) / changedTradeTracker.length;
  if (avgBaseline <= 0) return false;
  const degradation = (avgBaseline - avgChanged) / Math.abs(avgBaseline);
  if (degradation >= CHANGED_TRADE_ROLLBACK_THRESHOLD) {
    disableSoftInfluence(`Changed-trade expectancy ${avgChanged.toFixed(2)}p is ${(degradation * 100).toFixed(0)}% worse than baseline ${avgBaseline.toFixed(2)}p`);
    return true;
  }
  return false;
}

export function resetChangedTradeTracker(): void {
  changedTradeTracker = [];
}

// ─── Influence Tier Resolution ───────────────────────────────

export function resolveInfluenceTier(pairedTrades: number): InfluenceTier {
  if (pairedTrades >= HARD_MIN_SAMPLE) return 'HARD';
  if (pairedTrades >= SOFT_MIN_SAMPLE && !isSoftInfluenceDisabled()) return 'SOFT';
  return 'NONE';
}

/** Check if a flip passes the margin requirement */
export function passesFlipMargin(baselineScore: number, weightedScore: number): boolean {
  return Math.abs(weightedScore - baselineScore) >= FLIP_MARGIN_MIN;
}

export function recordImpact(pipsSavedByVeto: number, pipsGainedBySynergy: number, outcomeChanged: boolean): void {
  impactStats.netPipsSavedByVeto += pipsSavedByVeto;
  impactStats.netPipsGainedBySynergy += pipsGainedBySynergy;
  if (outcomeChanged) impactStats.decisionsChangedByCollaboration++;
}

export function setCollaborationWeightingEnabled(enabled: boolean): void {
  safetyState.collaborationWeightingEnabled = enabled;
}

export function setIndependentRoutingMode(enabled: boolean): void {
  safetyState.independentRoutingMode = enabled;
}

export function freezeAgentPair(agentA: AgentId, agentB: AgentId): void {
  safetyState.frozenPairs.add([agentA, agentB].sort().join('::'));
}

export function unfreezeAgentPair(agentA: AgentId, agentB: AgentId): void {
  safetyState.frozenPairs.delete([agentA, agentB].sort().join('::'));
}

// ─── Fallback Logic ──────────────────────────────────────────

export function checkFallbackTrigger(
  collaborationWeightedExpectancy: number,
  baselineExpectancy: number,
): boolean {
  if (baselineExpectancy <= 0) return false;
  const degradation = (baselineExpectancy - collaborationWeightedExpectancy) / Math.abs(baselineExpectancy);
  if (degradation >= FALLBACK_DEGRADATION_THRESHOLD) {
    safetyState.fallbackUntilTs = Date.now() + FALLBACK_DURATION_MS;
    safetyState.fallbackReason = `Weighted expectancy ${collaborationWeightedExpectancy.toFixed(2)}p is ${(degradation * 100).toFixed(0)}% worse than baseline ${baselineExpectancy.toFixed(2)}p — fallback for 24h`;
    console.log(`[COLLAB-ROUTER] FALLBACK TRIGGERED: ${safetyState.fallbackReason}`);
    return true;
  }
  return false;
}

export function isFallbackActive(): boolean {
  return safetyState.fallbackUntilTs !== null && Date.now() < safetyState.fallbackUntilTs;
}

export function clearFallback(): void {
  safetyState.fallbackUntilTs = null;
  safetyState.fallbackReason = null;
}

// ─── Velocity Clamp ──────────────────────────────────────────

function applyVelocityClamp(agentId: AgentId, rawMultiplier: number): number {
  const prev = previousAuthorities.get(agentId) ?? 1.0;
  const maxDelta = VELOCITY_MAX_CHANGE;
  const clamped = Math.max(prev - maxDelta, Math.min(prev + maxDelta, rawMultiplier));
  return clamped;
}

function isWeightingActive(snapshot?: CollaborationSnapshot | null): boolean {
  if (!safetyState.collaborationWeightingEnabled) return false;
  if (safetyState.independentRoutingMode) return false;
  if (isFallbackActive()) return false;
  // If env context is missing, collaboration does nothing
  if (snapshot?.independentDueToMissingContext) return false;
  return true;
}

// ─── SECTION 3: Trade Authority Adjustment ───────────────────

export function computeAuthorityAdjustments(
  snapshot: CollaborationSnapshot,
  participatingAgents: AgentId[]
): AuthorityAdjustment[] {
  evaluationCount++;

  if (!isWeightingActive(snapshot)) {
    const reason = snapshot?.independentDueToMissingContext
      ? 'Independent mode: insufficient environment context (missing environment/regime on >50% of orders)'
      : safetyState.independentRoutingMode
      ? 'Independent routing mode'
      : isFallbackActive()
        ? `Automatic fallback active: ${safetyState.fallbackReason || 'performance degradation'}`
        : 'Collaboration weighting disabled';

    return participatingAgents.map(id => ({
      agentId: id,
      baseAuthority: 1.0,
      collaborationMultiplier: 1.0,
      finalAuthority: 1.0,
      reason,
      influenceTier: 'NONE' as InfluenceTier,
    }));
  }

  const adjustments: AuthorityAdjustment[] = [];

  for (const agentId of participatingAgents) {
    let multiplier = 1.0;
    const reasons: string[] = [];

    const relevantPairs = snapshot.pairStats.filter(
      p => (p.agentA === agentId || p.agentB === agentId) &&
           participatingAgents.includes(p.agentA) &&
           participatingAgents.includes(p.agentB)
    );

    for (const pair of relevantPairs) {
      const pk = [pair.agentA, pair.agentB].sort().join('::');
      if (safetyState.frozenPairs.has(pk)) {
        reasons.push(`Pair ${pair.agentA}↔${pair.agentB} frozen`);
        continue;
      }

      const partner = pair.agentA === agentId ? pair.agentB : pair.agentA;

      switch (pair.label) {
        case 'SYNERGY': {
          const boost = SYNERGY_BOOST_MIN + (pair.pairedSharpe / 3) * (SYNERGY_BOOST_MAX - SYNERGY_BOOST_MIN);
          multiplier *= 1 + Math.min(boost, SYNERGY_BOOST_MAX);
          reasons.push(`Synergy with ${partner}: +${Math.round(boost * 100)}%`);
          break;
        }
        case 'CONFLICT': {
          const selfExp = snapshot.singleAgentStats[agentId]?.soloExpectancy || 0;
          const partnerExp = snapshot.singleAgentStats[partner]?.soloExpectancy || 0;
          if (selfExp < partnerExp) {
            const reduction = CONFLICT_REDUCE_MIN + pair.conflictFrequency * (CONFLICT_REDUCE_MAX - CONFLICT_REDUCE_MIN);
            multiplier *= 1 - Math.min(reduction, CONFLICT_REDUCE_MAX);
            reasons.push(`Conflict with ${partner}: -${Math.round(reduction * 100)}%`);
          }
          break;
        }
        case 'PREDICTIVE-VETO': {
          const selfExp = snapshot.singleAgentStats[agentId]?.soloExpectancy || 0;
          const partnerExp = snapshot.singleAgentStats[partner]?.soloExpectancy || 0;
          if (selfExp < partnerExp) {
            multiplier *= 0.5;
            reasons.push(`Predictive veto by ${partner}: authority halved`);
          } else {
            multiplier *= 1.1;
            reasons.push(`Veto authority over ${partner}: +10%`);
          }
          break;
        }
      }
    }

    // Apply velocity clamp (max 10% change per window)
    const velocityClamped = applyVelocityClamp(agentId, multiplier);
    if (Math.abs(velocityClamped - multiplier) > 0.001) {
      reasons.push(`Velocity clamped: raw ${multiplier.toFixed(3)} → ${velocityClamped.toFixed(3)}`);
    }

    // Determine influence tier based on max paired trades for this agent
    const maxPairedTrades = relevantPairs.reduce((m, p) => Math.max(m, p.pairedTrades), 0);
    const tier = resolveInfluenceTier(maxPairedTrades);

    // Apply soft clamp if in SOFT tier
    let finalClamped: number;
    if (tier === 'SOFT') {
      finalClamped = Math.round(Math.max(SOFT_CLAMP_MIN, Math.min(SOFT_CLAMP_MAX, velocityClamped)) * 100) / 100;
      if (Math.abs(finalClamped - velocityClamped) > 0.001) {
        reasons.push(`Soft-tier clamp: ${velocityClamped.toFixed(3)} → [${SOFT_CLAMP_MIN}, ${SOFT_CLAMP_MAX}]`);
      }
    } else {
      // Hard clamp [0.1, 2.0]
      finalClamped = Math.round(Math.max(0.1, Math.min(2.0, velocityClamped)) * 100) / 100;
    }

    if (tier !== 'NONE') {
      reasons.push(`Influence tier: ${tier}`);
    }

    // Update velocity tracker
    previousAuthorities.set(agentId, finalClamped);

    adjustments.push({
      agentId,
      baseAuthority: 1.0,
      collaborationMultiplier: Math.round(velocityClamped * 100) / 100,
      finalAuthority: finalClamped,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No active pair relationships',
      influenceTier: tier,
    });
  }

  return adjustments;
}

// ─── SECTION 4: Multi-Agent Decision Voting ──────────────────

export function computeWeightedVote(
  participatingAgents: AgentId[],
  agentConfidences: Record<string, number>,
  authorityAdjustments: AuthorityAdjustment[],
  snapshot: CollaborationSnapshot,
  threshold: number = VOTING_THRESHOLD
): VotingResult {
  const authMap = new Map(authorityAdjustments.map(a => [a.agentId, a.finalAuthority]));
  const votes: CollaborationVote[] = [];

  for (const agentId of participatingAgents) {
    const authority = authMap.get(agentId) || 1.0;
    const edgeConfidence = agentConfidences[agentId] || 0.5;

    const pairScores = snapshot.pairStats
      .filter(p => p.agentA === agentId || p.agentB === agentId)
      .map(p => {
        switch (p.label) {
          case 'SYNERGY': return 1.0;
          case 'PREDICTIVE-VETO': return 0.8;
          case 'NEUTRAL': return 0.5;
          case 'CONFLICT': return 0.2;
          default: return 0.5;
        }
      });

    const collaborationScore = pairScores.length > 0
      ? pairScores.reduce((s, v) => s + v, 0) / pairScores.length
      : 0.5;

    const weightedScore = authority * collaborationScore * edgeConfidence;

    votes.push({
      agentId,
      authority,
      collaborationScore: Math.round(collaborationScore * 100) / 100,
      edgeConfidence,
      weightedScore: Math.round(weightedScore * 1000) / 1000,
    });
  }

  const totalWeight = votes.reduce((s, v) => s + v.authority, 0);
  const totalWeightedConfidence = totalWeight > 0
    ? votes.reduce((s, v) => s + v.weightedScore, 0) / totalWeight
    : 0;

  const approved = totalWeightedConfidence >= threshold;

  return {
    votes,
    totalWeightedConfidence: Math.round(totalWeightedConfidence * 1000) / 1000,
    threshold,
    approved,
    explanation: approved
      ? `Trade approved: weighted confidence ${(totalWeightedConfidence * 100).toFixed(1)}% exceeds ${(threshold * 100).toFixed(0)}% threshold`
      : `Trade blocked: weighted confidence ${(totalWeightedConfidence * 100).toFixed(1)}% below ${(threshold * 100).toFixed(0)}% threshold`,
  };
}

/**
 * Compute baseline vote (all agents with 1.0 authority) for comparison
 */
export function computeBaselineVote(
  participatingAgents: AgentId[],
  agentConfidences: Record<string, number>,
  snapshot: CollaborationSnapshot,
  threshold: number = VOTING_THRESHOLD
): VotingResult {
  const baselineAdjustments: AuthorityAdjustment[] = participatingAgents.map(id => ({
    agentId: id,
    baseAuthority: 1.0,
    collaborationMultiplier: 1.0,
    finalAuthority: 1.0,
    reason: 'baseline',
    influenceTier: 'NONE' as InfluenceTier,
  }));
  return computeWeightedVote(participatingAgents, agentConfidences, baselineAdjustments, snapshot, threshold);
}

// ─── SECTION 8: Explainability Logging ──────────────────────

export function createCollaborationDecisionLog(
  participatingAgents: AgentId[],
  snapshot: CollaborationSnapshot,
  authorityAdjustments: AuthorityAdjustment[],
  agentConfidences: Record<string, number>,
): CollaborationDecisionLog {
  const collaborationScores: Record<string, CollaborationLabel> = {};
  const vetoTriggers: string[] = [];

  for (const pair of snapshot.pairStats) {
    const pk = [pair.agentA, pair.agentB].sort().join('::');
    collaborationScores[pk] = pair.label;
    if (pair.label === 'PREDICTIVE-VETO') {
      vetoTriggers.push(
        `${pair.agentA} ↔ ${pair.agentB}: precision ${(pair.vetoPrecision * 100).toFixed(0)}%, false-veto ${(pair.falseVetoRate * 100).toFixed(0)}%`
      );
    }
  }

  // Compute both baseline and weighted votes
  const baselineVote = computeBaselineVote(participatingAgents, agentConfidences, snapshot);
  const weightedVote = computeWeightedVote(participatingAgents, agentConfidences, authorityAdjustments, snapshot);
  const rawOutcomeChanged = baselineVote.approved !== weightedVote.approved;

  // Determine influence tier used
  const tiers = authorityAdjustments.map(a => a.influenceTier);
  const influenceTierUsed: InfluenceTier = tiers.includes('HARD') ? 'HARD' : tiers.includes('SOFT') ? 'SOFT' : 'NONE';

  // Budget check
  const budgetExceeded = rawOutcomeChanged && isBudgetExceeded();

  // Flip margin check
  const flipMarginInsufficient = rawOutcomeChanged && !passesFlipMargin(
    baselineVote.totalWeightedConfidence,
    weightedVote.totalWeightedConfidence,
  );

  // Final outcomeChanged: only true if passes budget + margin
  const outcomeChanged = rawOutcomeChanged && !budgetExceeded && !flipMarginInsufficient;

  // Record decision in budget tracker
  recordDecision(outcomeChanged);

  // Top 3 collaboration factors
  const topFactors = authorityAdjustments
    .filter(a => a.reason !== 'No active pair relationships' && a.reason !== 'baseline')
    .sort((a, b) => Math.abs(b.collaborationMultiplier - 1.0) - Math.abs(a.collaborationMultiplier - 1.0))
    .slice(0, 3)
    .map(a => `${a.agentId}: ${a.reason}`);

  let finalDecisionReason: string;
  if (budgetExceeded) {
    finalDecisionReason = `Collaboration would change outcome but BUDGET EXCEEDED (>${(INFLUENCE_BUDGET_FRACTION * 100).toFixed(0)}% daily flips). Reverting to baseline.`;
  } else if (flipMarginInsufficient) {
    finalDecisionReason = `Collaboration would change outcome but FLIP MARGIN insufficient (<${FLIP_MARGIN_MIN}). Reverting to baseline.`;
  } else if (outcomeChanged) {
    finalDecisionReason = `Collaboration changed outcome: baseline=${baselineVote.approved ? 'APPROVED' : 'BLOCKED'}, weighted=${weightedVote.approved ? 'APPROVED' : 'BLOCKED'}. Top factors: ${topFactors.join('; ')}`;
  } else {
    finalDecisionReason = `Collaboration confirmed outcome (${weightedVote.approved ? 'APPROVED' : 'BLOCKED'}). Top factors: ${topFactors.join('; ') || 'none'}`;
  }

  return {
    timestamp: Date.now(),
    collaboratingAgents: participatingAgents,
    collaborationScores,
    authorityAdjustments,
    vetoTriggers,
    baselineVotingResult: baselineVote,
    weightedVotingResult: weightedVote,
    outcomeChanged,
    topCollaborationFactors: topFactors,
    finalDecisionReason,
    influenceTierUsed,
    budgetExceeded,
    flipMarginInsufficient,
  };
}

// Legacy compat
export function createCollaborationLog(
  participatingAgents: AgentId[],
  snapshot: CollaborationSnapshot,
  authorityAdjustments: AuthorityAdjustment[],
  votingResult: VotingResult | null
) {
  return {
    timestamp: Date.now(),
    collaboratingAgents: participatingAgents,
    collaborationScores: {} as Record<string, CollaborationLabel>,
    authorityAdjustments,
    vetoTriggers: [] as string[],
    votingResult,
  };
}
