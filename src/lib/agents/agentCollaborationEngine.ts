// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Engine
// Sections 1, 2, 5 — Pair Performance Matrix, Scoring, Drift
// ═══════════════════════════════════════════════════════════════

import { AgentId } from './types';
import { ALL_AGENT_IDS } from './agentConfig';

// ─── Types ───────────────────────────────────────────────────

export type CollaborationLabel =
  | 'SYNERGY'
  | 'NEUTRAL'
  | 'CONFLICT'
  | 'PREDICTIVE-VETO'
  | 'INSUFFICIENT_DATA';

export interface AgentPairStats {
  agentA: AgentId;
  agentB: AgentId;
  pairedTrades: number;
  pairedExpectancy: number;       // pips
  pairedWinRate: number;
  pairedSharpe: number;
  conflictFrequency: number;      // 0-1, how often they disagree
  vetoSuccessRate: number;        // when A vetoes B, how often that prevented a loss
  coApprovalProfitFactor: number;
  label: CollaborationLabel;
  lastUpdated: number;
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

export interface CollaborationSnapshot {
  singleAgentStats: Record<string, SingleAgentStats>;
  pairStats: AgentPairStats[];
  driftEvents: CollaborationDriftEvent[];
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────

const MIN_PAIRED_SAMPLE = 40;
const SYNERGY_THRESHOLD = 1.25;       // paired exp >= 1.25x individual
const CONFLICT_THRESHOLD = 0.80;      // paired exp < 0.80x individual
const VETO_SUCCESS_THRESHOLD = 0.60;  // 60%+ of vetoed trades would have lost
const DRIFT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Order Record Interface ─────────────────────────────────

interface OrderRecord {
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

/**
 * Detect co-occurring trades: same pair, same 5-minute window
 */
function findPairedTrades(orders: OrderRecord[]): Map<string, OrderRecord[][]> {
  const pairs = new Map<string, OrderRecord[][]>();
  const closed = orders.filter(o => o.status === 'closed' && o.agent_id && o.entry_price && o.exit_price);

  // Group by currency pair + 5-min bucket
  const buckets = new Map<string, OrderRecord[]>();
  for (const o of closed) {
    const ts = new Date(o.created_at).getTime();
    const bucket = Math.floor(ts / (5 * 60_000));
    const key = `${o.currency_pair}::${bucket}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(o);
  }

  // Extract pairs from buckets with 2+ agents
  for (const [, group] of buckets) {
    if (group.length < 2) continue;
    const agentIds = [...new Set(group.map(o => o.agent_id!))];
    if (agentIds.length < 2) continue;

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const pk = pairKey(agentIds[i] as AgentId, agentIds[j] as AgentId);
        if (!pairs.has(pk)) pairs.set(pk, []);
        const aOrders = group.filter(o => o.agent_id === agentIds[i]);
        const bOrders = group.filter(o => o.agent_id === agentIds[j]);
        pairs.get(pk)!.push([...aOrders, ...bOrders]);
      }
    }
  }

  return pairs;
}

/**
 * SECTION 2: Compute collaboration score for a pair
 */
export function computeAgentCollaborationScore(
  pairStat: { pairedExpectancy: number; pairedTrades: number; vetoSuccessRate: number },
  avgIndividualExpectancy: number
): CollaborationLabel {
  if (pairStat.pairedTrades < MIN_PAIRED_SAMPLE) return 'INSUFFICIENT_DATA';

  // Predictive veto takes priority
  if (pairStat.vetoSuccessRate >= VETO_SUCCESS_THRESHOLD) return 'PREDICTIVE-VETO';

  if (avgIndividualExpectancy <= 0) {
    // If individual agents lose money, any positive pair is synergy
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

  for (const [pk, tradeGroups] of pairedTrades) {
    const [agentA, agentB] = pk.split('::') as [AgentId, AgentId];
    const allPnls: number[] = [];
    let conflicts = 0;
    let vetoPreventedLoss = 0;
    let vetoTotal = 0;
    let grossWin = 0;
    let grossLoss = 0;

    for (const group of tradeGroups) {
      const aOrders = group.filter(o => o.agent_id === agentA);
      const bOrders = group.filter(o => o.agent_id === agentB);

      // Check for directional conflict
      const aDirs = new Set(aOrders.map(o => o.direction));
      const bDirs = new Set(bOrders.map(o => o.direction));
      if (aDirs.has('long') && bDirs.has('short') || aDirs.has('short') && bDirs.has('long')) {
        conflicts++;
        // Check if conflict (veto) prevented loss
        vetoTotal++;
        const netPnl = group.reduce((s, o) => s + computePnlPips(o.entry_price, o.exit_price, o.currency_pair), 0);
        if (netPnl > 0) vetoPreventedLoss++;
      }

      for (const o of group) {
        const pnl = computePnlPips(o.entry_price, o.exit_price, o.currency_pair);
        allPnls.push(pnl);
        if (pnl > 0) grossWin += pnl;
        else grossLoss += Math.abs(pnl);
      }
    }

    const wins = allPnls.filter(p => p > 0).length;
    const avg = allPnls.length > 0 ? allPnls.reduce((s, p) => s + p, 0) / allPnls.length : 0;
    const stdDev = allPnls.length > 1
      ? Math.sqrt(allPnls.reduce((s, p) => s + (p - avg) ** 2, 0) / allPnls.length)
      : 1;

    const avgIndExp = ((singleStats[agentA]?.soloExpectancy || 0) + (singleStats[agentB]?.soloExpectancy || 0)) / 2;

    const stat: AgentPairStats = {
      agentA,
      agentB,
      pairedTrades: tradeGroups.length,
      pairedExpectancy: Math.round(avg * 100) / 100,
      pairedWinRate: allPnls.length > 0 ? Math.round((wins / allPnls.length) * 1000) / 10 : 0,
      pairedSharpe: Math.round((avg / stdDev) * 100) / 100,
      conflictFrequency: tradeGroups.length > 0 ? Math.round((conflicts / tradeGroups.length) * 100) / 100 : 0,
      vetoSuccessRate: vetoTotal > 0 ? Math.round((vetoPreventedLoss / vetoTotal) * 100) / 100 : 0,
      coApprovalProfitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99 : 0,
      label: 'NEUTRAL',
      lastUpdated: Date.now(),
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

  // Update snapshot
  previousSnapshot = {
    singleAgentStats: {},
    pairStats: currentMatrix,
    driftEvents: events,
    timestamp: now,
  };

  return events;
}

/**
 * Full collaboration analysis: build matrix + detect drift
 */
export function analyzeAgentCollaboration(
  orders: OrderRecord[]
): CollaborationSnapshot {
  const singleAgentStats = computeSingleAgentStats(orders);
  const pairStats = buildCollaborationMatrix(orders);
  const driftEvents = detectCollaborationDrift(pairStats);

  return {
    singleAgentStats,
    pairStats,
    driftEvents,
    timestamp: Date.now(),
  };
}
