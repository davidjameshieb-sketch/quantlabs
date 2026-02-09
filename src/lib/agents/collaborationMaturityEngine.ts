// ═══════════════════════════════════════════════════════════════
// Collaboration Maturity & Readiness Engine — Read-Only Diagnostics
// Pure observation: never modifies weights, authority, or routing.
// ═══════════════════════════════════════════════════════════════

import type { AgentId } from './types';
import type {
  AgentPairStats,
  CollaborationSnapshot,
  SingleAgentStats,
  PairedOpportunityStats,
  CollaborationLabel,
} from './agentCollaborationEngine';
import type { EnvironmentKey } from '@/lib/forex/environmentSignature';
import { AGENT_DEFINITIONS } from './agentConfig';

// ─── Constants ───────────────────────────────────────────────

const SOFT_THRESHOLD = 10;
const HARD_THRESHOLD = 40;

// ─── Types ───────────────────────────────────────────────────

export type MaturityLevel = 'Observation' | 'Soft Eligible' | 'Hard Eligible';

export type RelationshipLabel = 'SYNERGY' | 'CONFLICT' | 'NEUTRAL' | 'PREDICTIVE-VETO' | 'INSUFFICIENT_DATA';

export interface LiftConfidenceInterval {
  lower: number;
  upper: number;
  mean: number;
  sampleSize: number;
}

export interface EnvKeyRelationship {
  envKey: string;
  pairedExpectancy: number;
  trades: number;
  soloAvg: number;
  synergyLift: number;
}

export interface PairMaturity {
  agentA: AgentId;
  agentB: AgentId;
  pairedOpportunities: number;
  executedPairs: number;
  shadowPairs: number;
  sampleProgressSoft: number;   // 0–1 (clamped)
  sampleProgressHard: number;   // 0–1 (clamped)
  maturityLevel: MaturityLevel;
  pairedExpectancy: number;
  soloExpectancyA: number;
  soloExpectancyB: number;
  delta: number;                // paired - avg solo
  /** synergyLift = pairedExpectancy − weightedAvg(soloA, soloB) */
  synergyLift: number;
  /** Variance of synergyLift across envKeys */
  liftStability: number;
  /** 95% confidence interval for synergyLift */
  liftCI: LiftConfidenceInterval;
  deltaStability: number;       // lower = more stable (std dev of envKey deltas)
  label: CollaborationLabel;
  /** Relationship label derived from synergyLift + stability */
  relationshipLabel: RelationshipLabel;
  envKeyCount: number;
  positiveEnvKeys: number;      // envKeys where paired > solo avg
  /** Per-envKey relationship breakdown */
  envKeyRelationships: EnvKeyRelationship[];
  earlySignal: 'Early Synergy Candidate' | 'Early Conflict Candidate' | 'Neutral';
  // Veto metrics (from pair stats)
  vetoPrecision: number;
  falseVetoRate: number;
  vetoSuccessRate: number;
}

export interface MaturityDistribution {
  observation: number;
  softEligible: number;
  hardEligible: number;
  total: number;
}

export interface AuthorityEmergenceForecast {
  /** 0–100 probability score */
  probability: number;
  factors: {
    opportunityGrowthScore: number;    // 0–25
    deltaDirectionScore: number;       // 0–25
    varianceReductionScore: number;    // 0–25
    envKeyConsistencyScore: number;    // 0–15
    driftAbsenceScore: number;         // 0–10
  };
  verdict: 'Trending Useful' | 'Neutral' | 'Stagnating' | 'Insufficient Data';
}

export interface OutcomeChangedForecast {
  expectedRateLow: number;     // %
  expectedRateBase: number;    // %
  expectedRateHigh: number;    // %
  expectedFractionInfluenced: number; // %
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export interface CollaborationMaturityReport {
  pairs: PairMaturity[];
  distribution: MaturityDistribution;
  emergence: AuthorityEmergenceForecast;
  outcomeChangedForecast: OutcomeChangedForecast;
  topPairsNearThreshold: PairMaturity[];
  driftRisk: 'Low' | 'Medium' | 'High';
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function classifyMaturity(opps: number): MaturityLevel {
  if (opps >= HARD_THRESHOLD) return 'Hard Eligible';
  if (opps >= SOFT_THRESHOLD) return 'Soft Eligible';
  return 'Observation';
}

function classifyEarlySignal(delta: number, opps: number): PairMaturity['earlySignal'] {
  if (opps < 3) return 'Neutral';
  if (delta > 0.5) return 'Early Synergy Candidate';
  if (delta < -0.5) return 'Early Conflict Candidate';
  return 'Neutral';
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Compute 95% CI using t-distribution approximation (z=1.96 for large n) */
function computeCI(values: number[]): LiftConfidenceInterval {
  const n = values.length;
  if (n === 0) return { lower: 0, upper: 0, mean: 0, sampleSize: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { lower: mean, upper: mean, mean: r2(mean), sampleSize: 1 };
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const se = stdDev / Math.sqrt(n);
  const z = 1.96;
  return { lower: r2(mean - z * se), upper: r2(mean + z * se), mean: r2(mean), sampleSize: n };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }

/** Classify relationship from synergyLift + stability + veto metrics */
function classifyRelationship(
  synergyLift: number,
  liftCI: LiftConfidenceInterval,
  opps: number,
  vetoPrecision: number,
  falseVetoRate: number,
): RelationshipLabel {
  if (opps < 5) return 'INSUFFICIENT_DATA';
  // Predictive-VETO check (strict)
  if (opps >= HARD_THRESHOLD && vetoPrecision >= 0.60 && falseVetoRate <= 0.40) return 'PREDICTIVE-VETO';
  // Stable synergy: lift CI lower bound > 0
  if (synergyLift > 0 && liftCI.lower > 0) return 'SYNERGY';
  // Stable conflict: lift CI upper bound < 0
  if (synergyLift < 0 && liftCI.upper < 0) return 'CONFLICT';
  return 'NEUTRAL';
}

// ─── Core Analysis ──────────────────────────────────────────

export function computeCollaborationMaturity(
  snapshot: CollaborationSnapshot
): CollaborationMaturityReport {
  const { pairStats, singleAgentStats, driftEvents, opportunityStats } = snapshot;

  // Build pair maturity entries
  const pairs: PairMaturity[] = pairStats.map(pair => {
    const soloA = singleAgentStats[pair.agentA]?.soloExpectancy || 0;
    const soloB = singleAgentStats[pair.agentB]?.soloExpectancy || 0;
    // Sample-weighted average of solo expectancies
    const soloTradesA = singleAgentStats[pair.agentA]?.soloTrades || 0;
    const soloTradesB = singleAgentStats[pair.agentB]?.soloTrades || 0;
    const totalSoloTrades = soloTradesA + soloTradesB;
    const weightedAvgSolo = totalSoloTrades > 0
      ? (soloA * soloTradesA + soloB * soloTradesB) / totalSoloTrades
      : (soloA + soloB) / 2;
    const avgSolo = (soloA + soloB) / 2;
    const delta = pair.pairedExpectancy - avgSolo;
    const synergyLift = r2(pair.pairedExpectancy - weightedAvgSolo);

    // Compute delta stability and envKey relationships
    const envDeltas: number[] = [];
    const envLifts: number[] = [];
    let positiveEnvKeys = 0;
    const envKeyRelationships: EnvKeyRelationship[] = [];
    for (const [ek, data] of Object.entries(pair.envKeyBreakdown)) {
      const envDelta = data.expectancy - avgSolo;
      const envLift = data.expectancy - weightedAvgSolo;
      envDeltas.push(envDelta);
      envLifts.push(envLift);
      if (envDelta > 0) positiveEnvKeys++;
      envKeyRelationships.push({
        envKey: ek,
        pairedExpectancy: data.expectancy,
        trades: data.trades,
        soloAvg: r2(weightedAvgSolo),
        synergyLift: r2(envLift),
      });
    }
    const meanEnvDelta = envDeltas.length > 0
      ? envDeltas.reduce((s, d) => s + d, 0) / envDeltas.length
      : 0;
    const deltaStability = envDeltas.length > 1
      ? Math.sqrt(envDeltas.reduce((s, d) => s + (d - meanEnvDelta) ** 2, 0) / envDeltas.length)
      : 0;

    // Lift stability = variance of synergyLift across envKeys
    const liftStability = envLifts.length > 1
      ? r2(Math.sqrt(envLifts.reduce((s, v) => s + (v - synergyLift) ** 2, 0) / envLifts.length))
      : 0;
    const liftCI = computeCI(envLifts.length > 0 ? envLifts : [synergyLift]);

    const opps = pair.pairedTrades;
    const relationshipLabel = classifyRelationship(synergyLift, liftCI, opps, pair.vetoPrecision, pair.falseVetoRate);

    return {
      agentA: pair.agentA,
      agentB: pair.agentB,
      pairedOpportunities: opps,
      executedPairs: opps,
      shadowPairs: 0,
      sampleProgressSoft: clamp01(opps / SOFT_THRESHOLD),
      sampleProgressHard: clamp01(opps / HARD_THRESHOLD),
      maturityLevel: classifyMaturity(opps),
      pairedExpectancy: pair.pairedExpectancy,
      soloExpectancyA: soloA,
      soloExpectancyB: soloB,
      delta: r2(delta),
      synergyLift,
      liftStability,
      liftCI,
      deltaStability: r2(deltaStability),
      label: pair.label,
      relationshipLabel,
      envKeyCount: Object.keys(pair.envKeyBreakdown).length,
      positiveEnvKeys,
      envKeyRelationships: envKeyRelationships.sort((a, b) => b.trades - a.trades),
      earlySignal: classifyEarlySignal(delta, opps),
      vetoPrecision: pair.vetoPrecision,
      falseVetoRate: pair.falseVetoRate,
      vetoSuccessRate: pair.vetoSuccessRate,
    };
  });

  // Distribution
  const distribution: MaturityDistribution = {
    observation: pairs.filter(p => p.maturityLevel === 'Observation').length,
    softEligible: pairs.filter(p => p.maturityLevel === 'Soft Eligible').length,
    hardEligible: pairs.filter(p => p.maturityLevel === 'Hard Eligible').length,
    total: pairs.length,
  };

  // Authority Emergence Probability
  const emergence = computeEmergenceProbability(pairs, opportunityStats, driftEvents.length);

  // OutcomeChanged Forecast
  const outcomeChangedForecast = computeOutcomeChangedForecast(pairs, distribution);

  // Top pairs closest to thresholds (not yet eligible, sorted by progress)
  const topPairsNearThreshold = pairs
    .filter(p => p.maturityLevel === 'Observation' && p.pairedOpportunities >= 3)
    .sort((a, b) => b.sampleProgressSoft - a.sampleProgressSoft)
    .slice(0, 5);

  // Drift risk
  const driftRisk = driftEvents.length >= 3 ? 'High' : driftEvents.length >= 1 ? 'Medium' : 'Low';

  return {
    pairs,
    distribution,
    emergence,
    outcomeChangedForecast,
    topPairsNearThreshold,
    driftRisk,
    timestamp: Date.now(),
  };
}

function computeEmergenceProbability(
  pairs: PairMaturity[],
  opportunityStats: PairedOpportunityStats | undefined,
  driftCount: number,
): AuthorityEmergenceForecast {
  if (pairs.length === 0) {
    return {
      probability: 0,
      factors: { opportunityGrowthScore: 0, deltaDirectionScore: 0, varianceReductionScore: 0, envKeyConsistencyScore: 0, driftAbsenceScore: 0 },
      verdict: 'Insufficient Data',
    };
  }

  // Factor 1: Opportunity growth (0–25)
  let opportunityGrowthScore = 0;
  if (opportunityStats) {
    const growth7dTo30d = opportunityStats.opportunities30d > 0
      ? (opportunityStats.opportunities7d / opportunityStats.opportunities30d) * 30 / 7
      : 0;
    // Accelerating = good (ratio > 1 means 7d pace > 30d pace)
    opportunityGrowthScore = Math.min(25, Math.round(growth7dTo30d * 12.5));
  }

  // Factor 2: Delta direction (0–25) — are pairs trending positive?
  const positiveDeltaPairs = pairs.filter(p => p.delta > 0 && p.pairedOpportunities >= 3).length;
  const eligiblePairs = pairs.filter(p => p.pairedOpportunities >= 3).length;
  const deltaDirectionScore = eligiblePairs > 0
    ? Math.round((positiveDeltaPairs / eligiblePairs) * 25)
    : 0;

  // Factor 3: Variance reduction (0–25) — lower delta stability = better
  const avgStability = pairs.length > 0
    ? pairs.reduce((s, p) => s + p.deltaStability, 0) / pairs.length
    : 10;
  const varianceReductionScore = Math.min(25, Math.max(0, Math.round(25 - avgStability * 5)));

  // Factor 4: EnvKey consistency (0–15)
  const pairsWithMultiEnv = pairs.filter(p => p.envKeyCount >= 2).length;
  const consistentPairs = pairs.filter(p => p.envKeyCount >= 2 && p.positiveEnvKeys / p.envKeyCount > 0.5).length;
  const envKeyConsistencyScore = pairsWithMultiEnv > 0
    ? Math.round((consistentPairs / pairsWithMultiEnv) * 15)
    : 0;

  // Factor 5: Drift absence (0–10)
  const driftAbsenceScore = driftCount === 0 ? 10 : driftCount <= 2 ? 5 : 0;

  const probability = Math.min(100, opportunityGrowthScore + deltaDirectionScore + varianceReductionScore + envKeyConsistencyScore + driftAbsenceScore);

  let verdict: AuthorityEmergenceForecast['verdict'] = 'Neutral';
  if (eligiblePairs < 2) verdict = 'Insufficient Data';
  else if (probability >= 60) verdict = 'Trending Useful';
  else if (probability <= 25) verdict = 'Stagnating';

  return {
    probability,
    factors: { opportunityGrowthScore, deltaDirectionScore, varianceReductionScore, envKeyConsistencyScore, driftAbsenceScore },
    verdict,
  };
}

function computeOutcomeChangedForecast(
  pairs: PairMaturity[],
  distribution: MaturityDistribution,
): OutcomeChangedForecast {
  const softEligible = pairs.filter(p => p.maturityLevel !== 'Observation');
  if (softEligible.length === 0) {
    return {
      expectedRateLow: 0,
      expectedRateBase: 0,
      expectedRateHigh: 0,
      expectedFractionInfluenced: 0,
      confidence: 'low',
      reasoning: 'No pairs have reached soft eligibility threshold (10 opportunities).',
    };
  }

  // Estimate: soft influence clamp 0.9–1.1 means ~10% max shift per decision
  // Fraction influenced = pairs with |delta| > 0 / total eligible * coverage factor
  const activeInfluencePairs = softEligible.filter(p => Math.abs(p.delta) > 0.2).length;
  const coverageFraction = distribution.total > 0 ? activeInfluencePairs / distribution.total : 0;

  // OutcomeChanged rate depends on how often soft influence crosses the flip margin (0.02)
  // With 0.9–1.1 clamp, flips happen rarely — estimate 2–8% of decisions
  const baseRate = Math.min(15, coverageFraction * 20);
  const low = Math.max(0, Math.round((baseRate * 0.5) * 10) / 10);
  const base = Math.round(baseRate * 10) / 10;
  const high = Math.round((baseRate * 1.8) * 10) / 10;

  const confidence: OutcomeChangedForecast['confidence'] =
    softEligible.length >= 5 ? 'high' :
    softEligible.length >= 2 ? 'medium' : 'low';

  return {
    expectedRateLow: low,
    expectedRateBase: base,
    expectedRateHigh: high,
    expectedFractionInfluenced: Math.round(coverageFraction * 100),
    confidence,
    reasoning: `${softEligible.length} pair(s) at soft+ maturity, ${activeInfluencePairs} with meaningful delta. Soft clamp (0.9–1.1) limits flip rate.`,
  };
}

// ─── CSV Export ──────────────────────────────────────────────

export function exportMaturityCSV(report: CollaborationMaturityReport): string {
  const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
  const lines = [
    'Agent A,Agent B,Opportunities,Soft Progress,Hard Progress,Maturity,Paired Exp,Solo A Exp,Solo B Exp,Delta,Synergy Lift,Lift CI Lower,Lift CI Upper,Lift Stability,Delta Stability,EnvKeys,Positive EnvKeys,Relationship,Early Signal,Label,Veto Precision,False Veto Rate',
    ...report.pairs.map(p =>
      [
        agentName(p.agentA),
        agentName(p.agentB),
        p.pairedOpportunities,
        (p.sampleProgressSoft * 100).toFixed(0) + '%',
        (p.sampleProgressHard * 100).toFixed(0) + '%',
        p.maturityLevel,
        p.pairedExpectancy,
        p.soloExpectancyA,
        p.soloExpectancyB,
        p.delta,
        p.synergyLift,
        p.liftCI.lower,
        p.liftCI.upper,
        p.liftStability,
        p.deltaStability,
        p.envKeyCount,
        p.positiveEnvKeys,
        p.relationshipLabel,
        p.earlySignal,
        p.label,
        (p.vetoPrecision * 100).toFixed(0) + '%',
        (p.falseVetoRate * 100).toFixed(0) + '%',
      ].join(',')
    ),
  ];
  return lines.join('\n');
}

/** Export relationship report as CSV with envKey drilldowns */
export function exportRelationshipCSV(report: CollaborationMaturityReport): string {
  const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
  const lines = [
    'Agent A,Agent B,Relationship,Synergy Lift,Lift CI Lower,Lift CI Upper,Lift Stability,EnvKey,EnvKey Trades,EnvKey Paired Exp,EnvKey Solo Avg,EnvKey Lift',
  ];
  for (const p of report.pairs) {
    if (p.envKeyRelationships.length === 0) {
      lines.push([
        agentName(p.agentA), agentName(p.agentB), p.relationshipLabel,
        p.synergyLift, p.liftCI.lower, p.liftCI.upper, p.liftStability,
        'N/A', 0, 0, 0, 0,
      ].join(','));
    } else {
      for (const ek of p.envKeyRelationships) {
        lines.push([
          agentName(p.agentA), agentName(p.agentB), p.relationshipLabel,
          p.synergyLift, p.liftCI.lower, p.liftCI.upper, p.liftStability,
          ek.envKey, ek.trades, ek.pairedExpectancy, ek.soloAvg, ek.synergyLift,
        ].join(','));
      }
    }
  }
  return lines.join('\n');
}
