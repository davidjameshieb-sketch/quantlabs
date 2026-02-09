// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Engine — Execution Grade
// Sections 1, 2, 5 — Pair Performance Matrix, Scoring, Drift
// Uses environmentSignature.ts envKey as primary grouping key.
// ═══════════════════════════════════════════════════════════════

import { AgentId } from './types';
import { ALL_AGENT_IDS } from './agentConfig';
import {
  buildEnvKeyFromRaw,
  type EnvironmentKey,
} from '@/lib/forex/environmentSignature';

// ─── Types ───────────────────────────────────────────────────

export type CollaborationLabel =
  | 'SYNERGY'
  | 'NEUTRAL'
  | 'CONFLICT'
  | 'PREDICTIVE-VETO'
  | 'INSUFFICIENT_DATA';

export type LearnMode = 'live+practice' | 'backtest' | 'all';

export interface AgentPairStats {
  agentA: AgentId;
  agentB: AgentId;
  pairedTrades: number;
  pairedExpectancy: number;       // pips
  pairedWinRate: number;
  pairedSharpe: number;
  conflictFrequency: number;      // 0-1
  vetoSuccessRate: number;
  vetoPrecision: number;          // true-positive rate
  falseVetoRate: number;          // false-positive rate
  coApprovalProfitFactor: number;
  label: CollaborationLabel;
  lastUpdated: number;
  /** Per-pair time delta distribution in minutes */
  pairTimeDeltaMinutes: number[];
  // envKey-level breakdowns
  envKeyBreakdown: Record<EnvironmentKey, { expectancy: number; trades: number }>;
}

export interface SingleAgentStats {
  agentId: AgentId;
  soloTrades: number;
  soloExpectancy: number;
  soloWinRate: number;
  soloSharpe: number;
}

export interface CollaborationDriftEvent {
  pairKey: string;
  previousLabel: CollaborationLabel;
  currentLabel: CollaborationLabel;
  timestamp: number;
  reason: string;
}

export interface PairedOpportunityStats {
  totalOpportunities: number;
  executedPairs: number;
  shadowPairs: number;
  /** Percentiles of pairTimeDeltaMinutes across all pairs */
  timeDeltaP50: number;
  timeDeltaP75: number;
  timeDeltaP90: number;
  /** Rolling window counts */
  opportunities24h: number;
  opportunities7d: number;
  opportunities30d: number;
}

export interface CollaborationSnapshot {
  singleAgentStats: Record<string, SingleAgentStats>;
  pairStats: AgentPairStats[];
  driftEvents: CollaborationDriftEvent[];
  timestamp: number;
  learnMode: LearnMode;
  /** True when env context is insufficient — collaboration runs independently */
  independentDueToMissingContext?: boolean;
  /** Paired opportunity statistics (includes non-executed proposals) */
  opportunityStats?: PairedOpportunityStats;
}

// ─── Constants ───────────────────────────────────────────────

const MIN_PAIRED_SAMPLE = 40;
const SYNERGY_THRESHOLD = 1.25;
const CONFLICT_THRESHOLD = 0.80;
const VETO_PRECISION_THRESHOLD = 0.60;
const FALSE_VETO_MAX = 0.40;

// ─── Order Record Interface ─────────────────────────────────

export interface OrderRecord {
  agent_id: string | null;
  direction: string;
  currency_pair: string;
  entry_price: number | null;
  exit_price: number | null;
  status: string;
  created_at: string;
  confidence_score: number | null;
  session_label: string | null;
  governance_composite: number | null;
  environment?: string;
  regime_label?: string | null;
}

// ─── Environment Filter ──────────────────────────────────────

const LIVE_PRACTICE_ENVS = new Set(['live', 'practice']);
/** Shadow environment is used for collaboration learning only */
const LEARNING_ENVS = new Set(['live', 'practice', 'shadow']);

export function filterOrdersByLearnMode(
  orders: OrderRecord[],
  mode: LearnMode = 'live+practice',
): OrderRecord[] {
  // Step 1: Require environment + regime_label for collaboration learning
  const withContext = orders.filter(o => {
    const hasEnv = !!o.environment;
    const hasRegime = !!o.regime_label;
    return hasEnv && hasRegime;
  });

  if (mode === 'all') return withContext;
  if (mode === 'backtest') return withContext.filter(o => o.environment === 'backtest');
  return withContext.filter(o => LIVE_PRACTICE_ENVS.has(o.environment!));
}

/**
 * Check if orders have sufficient environment context for collaboration.
 * If not, collaboration should run in independent mode.
 */
export function hasEnvironmentContext(orders: OrderRecord[]): boolean {
  if (orders.length === 0) return false;
  const withContext = orders.filter(o => o.environment && o.regime_label);
  return withContext.length / orders.length >= 0.5;
}

// ─── Core Engine ─────────────────────────────────────────────

function pairKey(a: AgentId, b: AgentId): string {
  return [a, b].sort().join('::');
}

function computePnlPips(entry: number | null, exit: number | null, pair: string): number {
  if (!entry || !exit) return 0;
  const isJpy = pair.includes('JPY');
  return (exit - entry) * (isJpy ? 100 : 10000);
}

function buildOrderEnvKey(o: OrderRecord): EnvironmentKey {
  return buildEnvKeyFromRaw(
    o.session_label || 'unknown',
    o.regime_label || 'unknown',
    o.currency_pair,
    o.direction,
    o.agent_id || undefined,
  );
}

/**
 * Build single-agent performance stats from order records
 */
export function computeSingleAgentStats(
  orders: OrderRecord[]
): Record<string, SingleAgentStats> {
  const stats: Record<string, SingleAgentStats> = {};

  for (const agentId of ALL_AGENT_IDS) {
    const agentOrders = orders.filter(
      o => o.agent_id === agentId && o.status === 'closed' && o.entry_price && o.exit_price
    );

    if (agentOrders.length === 0) {
      stats[agentId] = { agentId, soloTrades: 0, soloExpectancy: 0, soloWinRate: 0, soloSharpe: 0 };
      continue;
    }

    const pnls = agentOrders.map(o => computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
    const wins = pnls.filter(p => p > 0).length;
    const avg = pnls.reduce((s, p) => s + p, 0) / pnls.length;
    const stdDev = Math.sqrt(pnls.reduce((s, p) => s + (p - avg) ** 2, 0) / pnls.length) || 1;

    stats[agentId] = {
      agentId,
      soloTrades: agentOrders.length,
      soloExpectancy: Math.round(avg * 100) / 100,
      soloWinRate: Math.round((wins / agentOrders.length) * 1000) / 10,
      soloSharpe: Math.round((avg / stdDev) * 100) / 100,
    };
  }

  return stats;
}

/** Pairing window in minutes — widened to 20 to detect more collaboration events */
export const PAIR_WINDOW_MINUTES = 20;

/** Statuses that count as paired opportunities (not only executed trades) */
const OPPORTUNITY_STATUSES = new Set(['closed', 'shadow_eval', 'rejected', 'throttled', 'gated']);

/**
 * Detect co-occurring events: same instrument, same 20-minute window.
 * Includes non-executed proposals/votes/vetoes as "paired opportunities".
 */
function findPairedOpportunities(orders: OrderRecord[]): Map<string, { groups: OrderRecord[][]; timeDeltas: number[]; executedGroups: number; shadowGroups: number }> {
  const pairs = new Map<string, { groups: OrderRecord[][]; timeDeltas: number[]; executedGroups: number; shadowGroups: number }>();
  // Include all records with an agent_id (not just closed trades)
  const eligible = orders.filter(o => o.agent_id && OPPORTUNITY_STATUSES.has(o.status));

  const buckets = new Map<string, OrderRecord[]>();
  for (const o of eligible) {
    const ts = new Date(o.created_at).getTime();
    const bucket = Math.floor(ts / (PAIR_WINDOW_MINUTES * 60_000));
    const key = `${o.currency_pair}::${bucket}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(o);
  }

  for (const [, group] of buckets) {
    if (group.length < 2) continue;
    const agentIds = [...new Set(group.map(o => o.agent_id!))];
    if (agentIds.length < 2) continue;

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const pk = pairKey(agentIds[i] as AgentId, agentIds[j] as AgentId);
        if (!pairs.has(pk)) pairs.set(pk, { groups: [], timeDeltas: [], executedGroups: 0, shadowGroups: 0 });
        const aOrders = group.filter(o => o.agent_id === agentIds[i]);
        const bOrders = group.filter(o => o.agent_id === agentIds[j]);
        const combined = [...aOrders, ...bOrders];
        pairs.get(pk)!.groups.push(combined);
        // Track whether this group has executed trades or is shadow-only
        const hasExecuted = combined.some(o => o.status === 'closed');
        const isShadow = combined.every(o => o.status === 'shadow_eval' || o.environment === 'shadow');
        if (hasExecuted) pairs.get(pk)!.executedGroups++;
        if (isShadow) pairs.get(pk)!.shadowGroups++;
        // Calculate time delta
        const aTs = Math.min(...aOrders.map(o => new Date(o.created_at).getTime()));
        const bTs = Math.min(...bOrders.map(o => new Date(o.created_at).getTime()));
        pairs.get(pk)!.timeDeltas.push(Math.abs(aTs - bTs) / 60_000);
      }
    }
  }

  return pairs;
}

/** Legacy wrapper: only closed trades for PnL calculations */
function findPairedTrades(orders: OrderRecord[]): Map<string, { groups: OrderRecord[][]; timeDeltas: number[] }> {
  const result = new Map<string, { groups: OrderRecord[][]; timeDeltas: number[] }>();
  const closed = orders.filter(o => o.status === 'closed');
  const allPairs = findPairedOpportunities(closed);
  for (const [pk, data] of allPairs) {
    result.set(pk, { groups: data.groups, timeDeltas: data.timeDeltas });
  }
  return result;
}

/** Compute percentile from sorted array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Compute paired opportunity statistics from all order records */
export function computeOpportunityStats(orders: OrderRecord[]): PairedOpportunityStats {
  const allPairs = findPairedOpportunities(orders);
  const now = Date.now();
  const DAY = 24 * 60 * 60_000;

  let totalOpportunities = 0;
  let executedPairs = 0;
  let shadowPairs = 0;
  let opp24h = 0, opp7d = 0, opp30d = 0;
  const allDeltas: number[] = [];

  for (const [, data] of allPairs) {
    totalOpportunities += data.groups.length;
    executedPairs += data.executedGroups;
    shadowPairs += data.shadowGroups;
    allDeltas.push(...data.timeDeltas);

    // Count by time window
    for (const group of data.groups) {
      const latestTs = Math.max(...group.map(o => new Date(o.created_at).getTime()));
      const age = now - latestTs;
      if (age <= DAY) opp24h++;
      if (age <= 7 * DAY) opp7d++;
      if (age <= 30 * DAY) opp30d++;
    }
  }

  const sorted = allDeltas.sort((a, b) => a - b);

  return {
    totalOpportunities,
    executedPairs,
    shadowPairs,
    timeDeltaP50: Math.round(percentile(sorted, 50) * 100) / 100,
    timeDeltaP75: Math.round(percentile(sorted, 75) * 100) / 100,
    timeDeltaP90: Math.round(percentile(sorted, 90) * 100) / 100,
    opportunities24h: opp24h,
    opportunities7d: opp7d,
    opportunities30d: opp30d,
  };
}

// ─── SECTION 2: Collaboration Scoring (execution-grade) ─────

export function computeAgentCollaborationScore(
  pairStat: {
    pairedExpectancy: number;
    pairedTrades: number;
    vetoPrecision: number;
    falseVetoRate: number;
    vetoSuccessRate: number;
  },
  avgIndividualExpectancy: number
): CollaborationLabel {
  if (pairStat.pairedTrades < MIN_PAIRED_SAMPLE) return 'INSUFFICIENT_DATA';

  // PREDICTIVE-VETO: strict precision + false-veto guard
  if (
    pairStat.vetoPrecision >= VETO_PRECISION_THRESHOLD &&
    pairStat.falseVetoRate <= FALSE_VETO_MAX &&
    pairStat.pairedTrades >= MIN_PAIRED_SAMPLE
  ) {
    return 'PREDICTIVE-VETO';
  }

  if (avgIndividualExpectancy <= 0) {
    if (pairStat.pairedExpectancy > 0) return 'SYNERGY';
    return 'CONFLICT';
  }

  const ratio = pairStat.pairedExpectancy / avgIndividualExpectancy;
  if (ratio >= SYNERGY_THRESHOLD) return 'SYNERGY';
  if (ratio < CONFLICT_THRESHOLD) return 'CONFLICT';
  return 'NEUTRAL';
}

/**
 * Build the full pair performance matrix from order records
 */
export function buildCollaborationMatrix(
  orders: OrderRecord[]
): AgentPairStats[] {
  const singleStats = computeSingleAgentStats(orders);
  const pairedTrades = findPairedTrades(orders);
  const results: AgentPairStats[] = [];

  for (const [pk, pairData] of pairedTrades) {
    const { groups: tradeGroups, timeDeltas } = pairData;
    const [agentA, agentB] = pk.split('::') as [AgentId, AgentId];
    const allPnls: number[] = [];
    let conflicts = 0;
    let vetoPreventedLoss = 0;
    let vetoTotal = 0;
    let vetoFalsePositive = 0;
    let grossWin = 0;
    let grossLoss = 0;
    const envBreakdown: Record<EnvironmentKey, { expectancy: number; trades: number; totalPnl: number }> = {};

    for (const group of tradeGroups) {
      const aOrders = group.filter(o => o.agent_id === agentA);
      const bOrders = group.filter(o => o.agent_id === agentB);

      // Check for directional conflict
      const aDirs = new Set(aOrders.map(o => o.direction));
      const bDirs = new Set(bOrders.map(o => o.direction));
      if ((aDirs.has('long') && bDirs.has('short')) || (aDirs.has('short') && bDirs.has('long'))) {
        conflicts++;
        vetoTotal++;
        const netPnl = group.reduce((s, o) => s + computePnlPips(o.entry_price, o.exit_price, o.currency_pair), 0);
        if (netPnl > 0) {
          vetoPreventedLoss++;
        } else {
          vetoFalsePositive++;
        }
      }

      for (const o of group) {
        const pnl = computePnlPips(o.entry_price, o.exit_price, o.currency_pair);
        allPnls.push(pnl);
        if (pnl > 0) grossWin += pnl;
        else grossLoss += Math.abs(pnl);

        // EnvKey breakdown
        const ek = buildOrderEnvKey(o);
        if (!envBreakdown[ek]) envBreakdown[ek] = { expectancy: 0, trades: 0, totalPnl: 0 };
        envBreakdown[ek].trades++;
        envBreakdown[ek].totalPnl += pnl;
      }
    }

    // Finalize envKey breakdown expectancy
    const envKeyBreakdown: Record<EnvironmentKey, { expectancy: number; trades: number }> = {};
    for (const [ek, data] of Object.entries(envBreakdown)) {
      envKeyBreakdown[ek] = {
        expectancy: data.trades > 0 ? Math.round((data.totalPnl / data.trades) * 100) / 100 : 0,
        trades: data.trades,
      };
    }

    const wins = allPnls.filter(p => p > 0).length;
    const avg = allPnls.length > 0 ? allPnls.reduce((s, p) => s + p, 0) / allPnls.length : 0;
    const stdDev = allPnls.length > 1
      ? Math.sqrt(allPnls.reduce((s, p) => s + (p - avg) ** 2, 0) / allPnls.length)
      : 1;

    const avgIndExp = ((singleStats[agentA]?.soloExpectancy || 0) + (singleStats[agentB]?.soloExpectancy || 0)) / 2;
    const vetoPrecision = vetoTotal > 0 ? vetoPreventedLoss / vetoTotal : 0;
    const falseVetoRate = vetoTotal > 0 ? vetoFalsePositive / vetoTotal : 0;

    const stat: AgentPairStats = {
      agentA,
      agentB,
      pairedTrades: tradeGroups.length,
      pairedExpectancy: Math.round(avg * 100) / 100,
      pairedWinRate: allPnls.length > 0 ? Math.round((wins / allPnls.length) * 1000) / 10 : 0,
      pairedSharpe: Math.round((avg / stdDev) * 100) / 100,
      conflictFrequency: tradeGroups.length > 0 ? Math.round((conflicts / tradeGroups.length) * 100) / 100 : 0,
      vetoSuccessRate: vetoTotal > 0 ? Math.round((vetoPreventedLoss / vetoTotal) * 100) / 100 : 0,
      vetoPrecision: Math.round(vetoPrecision * 100) / 100,
      falseVetoRate: Math.round(falseVetoRate * 100) / 100,
      coApprovalProfitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99 : 0,
      label: 'NEUTRAL',
      lastUpdated: Date.now(),
      pairTimeDeltaMinutes: timeDeltas.map(d => Math.round(d * 100) / 100),
      envKeyBreakdown,
    };

    stat.label = computeAgentCollaborationScore(stat, avgIndExp);
    results.push(stat);
  }

  return results.sort((a, b) => b.pairedTrades - a.pairedTrades);
}

// ─── SECTION 5: Drift Monitoring ─────────────────────────────

let previousSnapshot: CollaborationSnapshot | null = null;

export function detectCollaborationDrift(
  currentMatrix: AgentPairStats[]
): CollaborationDriftEvent[] {
  const events: CollaborationDriftEvent[] = [];
  const now = Date.now();

  if (previousSnapshot) {
    const prevMap = new Map(
      previousSnapshot.pairStats.map(p => [pairKey(p.agentA, p.agentB), p])
    );

    for (const current of currentMatrix) {
      const pk = pairKey(current.agentA, current.agentB);
      const prev = prevMap.get(pk);

      if (prev && prev.label !== current.label && current.label !== 'INSUFFICIENT_DATA') {
        const isDowngrade =
          (prev.label === 'SYNERGY' && current.label !== 'SYNERGY') ||
          (prev.label === 'NEUTRAL' && current.label === 'CONFLICT');

        events.push({
          pairKey: pk,
          previousLabel: prev.label,
          currentLabel: current.label,
          timestamp: now,
          reason: isDowngrade
            ? `Collaboration degraded: expectancy dropped from ${prev.pairedExpectancy}p to ${current.pairedExpectancy}p`
            : `Collaboration improved: expectancy rose from ${prev.pairedExpectancy}p to ${current.pairedExpectancy}p`,
        });
      }
    }
  }

  previousSnapshot = {
    singleAgentStats: {},
    pairStats: currentMatrix,
    driftEvents: events,
    timestamp: now,
    learnMode: 'live+practice',
  };

  return events;
}

/**
 * Full collaboration analysis: build matrix + detect drift
 */
export function analyzeAgentCollaboration(
  orders: OrderRecord[],
  learnMode: LearnMode = 'live+practice',
): CollaborationSnapshot {
  const filtered = filterOrdersByLearnMode(orders, learnMode);
  const envContextOk = hasEnvironmentContext(orders);
  const singleAgentStats = computeSingleAgentStats(filtered);
  const pairStats = envContextOk ? buildCollaborationMatrix(filtered) : [];
  const driftEvents = envContextOk ? detectCollaborationDrift(pairStats) : [];
  // Compute opportunity stats from ALL eligible records (including shadow_eval)
  const opportunityStats = envContextOk ? computeOpportunityStats(filtered) : undefined;

  return {
    singleAgentStats,
    pairStats,
    driftEvents,
    timestamp: Date.now(),
    learnMode,
    independentDueToMissingContext: !envContextOk,
    opportunityStats,
  };
}
