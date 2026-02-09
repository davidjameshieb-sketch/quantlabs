// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Router
// Sections 3, 4, 7, 8 — Authority Adjustment, Voting, Safety, Logging
// ═══════════════════════════════════════════════════════════════

import { AgentId } from './types';
import {
  AgentPairStats,
  CollaborationLabel,
  CollaborationSnapshot,
} from './agentCollaborationEngine';

// ─── Types ───────────────────────────────────────────────────

export interface AuthorityAdjustment {
  agentId: AgentId;
  baseAuthority: number;          // 1.0 = default
  collaborationMultiplier: number; // synergy boosts, conflict reduces
  finalAuthority: number;
  reason: string;
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

export interface CollaborationLog {
  timestamp: number;
  collaboratingAgents: AgentId[];
  collaborationScores: Record<string, CollaborationLabel>;
  authorityAdjustments: AuthorityAdjustment[];
  vetoTriggers: string[];
  votingResult: VotingResult | null;
}

export interface CollaborationSafetyState {
  collaborationWeightingEnabled: boolean;
  frozenPairs: Set<string>;
  independentRoutingMode: boolean;
}

// ─── Constants ───────────────────────────────────────────────

const SYNERGY_BOOST_MIN = 0.15;
const SYNERGY_BOOST_MAX = 0.30;
const CONFLICT_REDUCE_MIN = 0.30;
const CONFLICT_REDUCE_MAX = 0.60;
const VOTING_THRESHOLD = 0.55;

// ─── Safety State ────────────────────────────────────────────

let safetyState: CollaborationSafetyState = {
  collaborationWeightingEnabled: true,
  frozenPairs: new Set(),
  independentRoutingMode: false,
};

export function getCollaborationSafetyState(): CollaborationSafetyState {
  return { ...safetyState, frozenPairs: new Set(safetyState.frozenPairs) };
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

// ─── SECTION 3: Trade Authority Adjustment ───────────────────

export function computeAuthorityAdjustments(
  snapshot: CollaborationSnapshot,
  participatingAgents: AgentId[]
): AuthorityAdjustment[] {
  if (!safetyState.collaborationWeightingEnabled || safetyState.independentRoutingMode) {
    return participatingAgents.map(id => ({
      agentId: id,
      baseAuthority: 1.0,
      collaborationMultiplier: 1.0,
      finalAuthority: 1.0,
      reason: safetyState.independentRoutingMode
        ? 'Independent routing mode — no collaboration weighting'
        : 'Collaboration weighting disabled',
    }));
  }

  const adjustments: AuthorityAdjustment[] = [];

  for (const agentId of participatingAgents) {
    let multiplier = 1.0;
    const reasons: string[] = [];

    // Find all pair relationships for this agent
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
          // Secondary agent (lower solo expectancy) gets reduced
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
          // Veto agent keeps authority, target gets reduced
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

    adjustments.push({
      agentId,
      baseAuthority: 1.0,
      collaborationMultiplier: Math.round(multiplier * 100) / 100,
      finalAuthority: Math.round(Math.max(0.1, Math.min(2.0, multiplier)) * 100) / 100,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No active pair relationships',
    });
  }

  return adjustments;
}

// ─── SECTION 4: Multi-Agent Decision Voting ──────────────────

export function computeWeightedVote(
  participatingAgents: AgentId[],
  agentConfidences: Record<string, number>,  // edge confidence per agent
  authorityAdjustments: AuthorityAdjustment[],
  snapshot: CollaborationSnapshot,
  threshold: number = VOTING_THRESHOLD
): VotingResult {
  const authMap = new Map(authorityAdjustments.map(a => [a.agentId, a.finalAuthority]));
  const votes: CollaborationVote[] = [];

  for (const agentId of participatingAgents) {
    const authority = authMap.get(agentId) || 1.0;
    const edgeConfidence = agentConfidences[agentId] || 0.5;

    // Collaboration score: average pair label quality
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

// ─── SECTION 8: Explainability Logging ──────────────────────

export function createCollaborationLog(
  participatingAgents: AgentId[],
  snapshot: CollaborationSnapshot,
  authorityAdjustments: AuthorityAdjustment[],
  votingResult: VotingResult | null
): CollaborationLog {
  const collaborationScores: Record<string, CollaborationLabel> = {};
  const vetoTriggers: string[] = [];

  for (const pair of snapshot.pairStats) {
    const pk = [pair.agentA, pair.agentB].sort().join('::');
    collaborationScores[pk] = pair.label;
    if (pair.label === 'PREDICTIVE-VETO') {
      vetoTriggers.push(
        `${pair.agentA} ↔ ${pair.agentB}: veto success rate ${(pair.vetoSuccessRate * 100).toFixed(0)}%`
      );
    }
  }

  return {
    timestamp: Date.now(),
    collaboratingAgents: participatingAgents,
    collaborationScores,
    authorityAdjustments,
    vetoTriggers,
    votingResult,
  };
}
