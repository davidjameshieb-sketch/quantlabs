// Governance Analytics Engine — Read-Only Post-Refactor Validation
// Sections 1-3, 7, 9: Pass rate, gate frequency, neutral rate,
// composite-expectancy correlation, and data availability monitoring.
// DOES NOT modify trading decisions or execution flow.

import type { GovernanceDecisionLog } from './governanceDecisionLogger';
import { getDecisionLogs } from './governanceDecisionLogger';
import type { GateId } from './tradeGovernanceEngine';
import type { LiquiditySession } from './microstructureEngine';
import { governanceAlerts } from './governanceAlerts';

// ─── Section 1: Pass Rate Sanity Analytics ───

export interface SessionBreakdown {
  session: LiquiditySession;
  total: number;
  approved: number;
  throttled: number;
  rejected: number;
  approvalRate: number;
}

export interface GovernancePassStats {
  totalEvaluations: number;
  approvedCount: number;
  throttledCount: number;
  rejectedCount: number;
  approvalRate: number;
  breakdownBySession: Record<LiquiditySession, SessionBreakdown>;
}

export function computeGovernancePassStats(
  timeRangeMs?: number,
): GovernancePassStats {
  const logs = filterByTimeRange(getDecisionLogs(), timeRangeMs);

  const sessions: LiquiditySession[] = ['asian', 'london-open', 'ny-overlap', 'late-ny'];
  const breakdownBySession = {} as Record<LiquiditySession, SessionBreakdown>;

  for (const s of sessions) {
    const sLogs = logs.filter(l => l.marketContextSnapshot.session === s);
    const approved = sLogs.filter(l => l.governance.governanceDecision === 'approved').length;
    const throttled = sLogs.filter(l => l.governance.governanceDecision === 'throttled').length;
    const rejected = sLogs.filter(l => l.governance.governanceDecision === 'rejected').length;
    breakdownBySession[s] = {
      session: s,
      total: sLogs.length,
      approved,
      throttled,
      rejected,
      approvalRate: sLogs.length > 0 ? approved / sLogs.length : 0,
    };
  }

  const approved = logs.filter(l => l.governance.governanceDecision === 'approved').length;
  const throttled = logs.filter(l => l.governance.governanceDecision === 'throttled').length;
  const rejected = logs.filter(l => l.governance.governanceDecision === 'rejected').length;

  return {
    totalEvaluations: logs.length,
    approvedCount: approved,
    throttledCount: throttled,
    rejectedCount: rejected,
    approvalRate: logs.length > 0 ? approved / logs.length : 0,
    breakdownBySession,
  };
}

// ─── Section 2: Gate Frequency Distribution ───

export interface GateFrequencyEntry {
  gateId: string;
  gateCategory: 'strategy' | 'infrastructure';
  triggerCount: number;
  triggerRate: number;
}

const INFRASTRUCTURE_GATES = new Set<string>([
  'G9_PRICE_DATA_UNAVAILABLE',
  'G10_ANALYSIS_UNAVAILABLE',
  'G11_INFRA_UNIT_MISMATCH',
  'G12_SYMBOL_MAPPING_FAILURE',
]);

export function computeGateFrequency(
  timeRangeMs?: number,
): GateFrequencyEntry[] {
  const logs = filterByTimeRange(getDecisionLogs(), timeRangeMs);
  if (logs.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const l of logs) {
    for (const g of l.governance.gatesTriggered) {
      counts[g.id] = (counts[g.id] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([gateId, triggerCount]) => ({
      gateId,
      gateCategory: INFRASTRUCTURE_GATES.has(gateId)
        ? 'infrastructure' as const
        : 'strategy' as const,
      triggerCount,
      triggerRate: triggerCount / logs.length,
    }))
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 10);
}

// ─── Section 3: Neutral Direction Rate Monitor ───

export interface NeutralDirectionStats {
  totalApproved: number;
  neutralCount: number;
  neutralRate: number;
  alertTriggered: boolean;
}

let NEUTRAL_RATE_THRESHOLD = 0.55;

export function setNeutralRateThreshold(threshold: number): void {
  NEUTRAL_RATE_THRESHOLD = Math.max(0, Math.min(1, threshold));
}

export function computeNeutralDirectionRate(
  timeRangeMs?: number,
): NeutralDirectionStats {
  const logs = filterByTimeRange(getDecisionLogs(), timeRangeMs);
  const approved = logs.filter(l => l.governance.governanceDecision === 'approved');
  const neutral = approved.filter(l =>
    l.quantlabs?.directionalBias === 'NEUTRAL' || l.quantlabs === null,
  );
  const neutralRate = approved.length > 0 ? neutral.length / approved.length : 0;
  const alertTriggered = neutralRate > NEUTRAL_RATE_THRESHOLD;

  if (alertTriggered) {
    governanceAlerts.emit('neutral_rate_spike', {
      neutralRate,
      threshold: NEUTRAL_RATE_THRESHOLD,
      totalApproved: approved.length,
    });
  }

  return {
    totalApproved: approved.length,
    neutralCount: neutral.length,
    neutralRate,
    alertTriggered,
  };
}

// ─── Section 7: Composite Score Correlation Analytics ───

export interface CompositeDecile {
  decileRange: string;
  decileMin: number;
  decileMax: number;
  count: number;
  winRate: number;
  avgExpectancy: number;
  avgMAE: number;
  avgMFE: number;
}

export function computeCompositeExpectancyCorrelation(
  timeRangeMs?: number,
): CompositeDecile[] {
  const logs = filterByTimeRange(getDecisionLogs(), timeRangeMs);
  const approved = logs.filter(l => l.governance.governanceDecision === 'approved');

  if (approved.length < 10) return [];

  // Sort by composite score
  const sorted = [...approved].sort((a, b) =>
    a.governance.compositeScore - b.governance.compositeScore,
  );

  const decileSize = Math.max(1, Math.floor(sorted.length / 10));
  const deciles: CompositeDecile[] = [];

  for (let i = 0; i < 10; i++) {
    const start = i * decileSize;
    const end = i === 9 ? sorted.length : start + decileSize;
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;

    const compositeMin = slice[0].governance.compositeScore;
    const compositeMax = slice[slice.length - 1].governance.compositeScore;

    // Win rate: trades that resulted in BUY or SELL (not SKIP)
    const executed = slice.filter(l => l.finalDecision.decision !== 'SKIP');
    const winRate = executed.length > 0
      ? executed.filter(l => l.finalDecision.decision === 'BUY' || l.finalDecision.decision === 'SELL').length / executed.length
      : 0;

    // Expectancy from market context (friction-adjusted)
    const avgExpectancy = slice.reduce((s, l) =>
      s + (l.marketContextSnapshot.frictionRatio * 0.1), 0) / slice.length;

    // MAE/MFE proxied from spread stability and friction
    const avgMAE = slice.reduce((s, l) =>
      s + (1 - l.marketContextSnapshot.spreadStabilityRank / 100) * 0.1, 0) / slice.length;
    const avgMFE = slice.reduce((s, l) =>
      s + l.marketContextSnapshot.frictionRatio * 0.05, 0) / slice.length;

    deciles.push({
      decileRange: `${compositeMin.toFixed(2)}–${compositeMax.toFixed(2)}`,
      decileMin: compositeMin,
      decileMax: compositeMax,
      count: slice.length,
      winRate,
      avgExpectancy,
      avgMAE,
      avgMFE,
    });
  }

  return deciles;
}

// ─── Section 9: Data Availability Monitoring ───

export interface DataAvailabilityStats {
  totalEvaluations: number;
  priceDataUnavailableCount: number;
  analysisUnavailableCount: number;
  priceDataAvailabilityRate: number;
  analysisAvailabilityRate: number;
  alertTriggered: boolean;
}

let DATA_AVAILABILITY_THRESHOLD = 0.98;

export function setDataAvailabilityThreshold(threshold: number): void {
  DATA_AVAILABILITY_THRESHOLD = Math.max(0, Math.min(1, threshold));
}

export function computeDataAvailability(
  timeRangeMs?: number,
): DataAvailabilityStats {
  const logs = filterByTimeRange(getDecisionLogs(), timeRangeMs);
  if (logs.length === 0) {
    return {
      totalEvaluations: 0,
      priceDataUnavailableCount: 0,
      analysisUnavailableCount: 0,
      priceDataAvailabilityRate: 1,
      analysisAvailabilityRate: 1,
      alertTriggered: false,
    };
  }

  const priceUnavail = logs.filter(l => !l.marketContextSnapshot.priceDataAvailable).length;
  const analysisUnavail = logs.filter(l => !l.marketContextSnapshot.analysisAvailable).length;

  const priceRate = 1 - priceUnavail / logs.length;
  const analysisRate = 1 - analysisUnavail / logs.length;
  const alertTriggered =
    priceRate < DATA_AVAILABILITY_THRESHOLD ||
    analysisRate < DATA_AVAILABILITY_THRESHOLD;

  if (alertTriggered) {
    governanceAlerts.emit('data_availability_degradation', {
      priceDataAvailabilityRate: priceRate,
      analysisAvailabilityRate: analysisRate,
      threshold: DATA_AVAILABILITY_THRESHOLD,
    });
  }

  return {
    totalEvaluations: logs.length,
    priceDataUnavailableCount: priceUnavail,
    analysisUnavailableCount: analysisUnavail,
    priceDataAvailabilityRate: priceRate,
    analysisAvailabilityRate: analysisRate,
    alertTriggered,
  };
}

// ─── Utility ───

function filterByTimeRange(
  logs: GovernanceDecisionLog[],
  timeRangeMs?: number,
): GovernanceDecisionLog[] {
  if (!timeRangeMs) return logs;
  const cutoff = Date.now() - timeRangeMs;
  return logs.filter(l => l.timestamp >= cutoff);
}
