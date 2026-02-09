// Filter Simulator — Post-trade simulation layer
// Simulates "would not have traded" by applying configurable gating rules
// Does NOT change governance logic — analysis + simulation only

import {
  type NormalizedTrade,
  computeMetricsSummary,
  buildEnvironmentStats,
  findTopEdgeEnvironments,
} from './edgeDiscoveryEngine';

// ─── Types ────────────────────────────────────────────────────────────

export interface ConditionalRule {
  id: string;
  label: string;
  enabled: boolean;
  condition: (t: NormalizedTrade) => boolean;
  /** If condition matches, this trade is BLOCKED */
}

export interface FilterRuleSet {
  name: string;
  blockSessions: string[];
  blockPairs: string[];
  blockDirections: ('long' | 'short')[];
  requireSessionAllowlist: string[];
  requireRegimeAllowlist: string[];
  minCompositeScore: number | null;
  minQuantLabsConfidence: number | null;
  maxSpreadPips: number | null;
  maxFriction: number | null;
  blockAgents: string[];
  conditionalRules: ConditionalRule[];
}

export interface SimulationMetrics {
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  ciLower: number;
  ciUpper: number;
}

export interface SimulationResult {
  keptTrades: NormalizedTrade[];
  removedTrades: NormalizedTrade[];
  removedReasonCounts: Record<string, number>;
  metricsKept: SimulationMetrics;
  metricsRemoved: SimulationMetrics;
  metricsBaseline: SimulationMetrics;
}

// ─── Rule Application ────────────────────────────────────────────────

function getRemovalReason(trade: NormalizedTrade, rules: FilterRuleSet): string | null {
  if (rules.blockSessions.includes(trade.session)) return `blocked_session:${trade.session}`;
  if (rules.blockPairs.includes(trade.symbol)) return `blocked_pair:${trade.symbol}`;
  if (rules.blockDirections.includes(trade.direction as 'long' | 'short')) return `blocked_direction:${trade.direction}`;
  if (rules.blockAgents.includes(trade.agentId)) return `blocked_agent:${trade.agentId}`;

  if (rules.requireSessionAllowlist.length > 0 && !rules.requireSessionAllowlist.includes(trade.session))
    return `session_not_allowed:${trade.session}`;
  if (rules.requireRegimeAllowlist.length > 0 && !rules.requireRegimeAllowlist.includes(trade.regime))
    return `regime_not_allowed:${trade.regime}`;

  if (rules.minCompositeScore != null && trade.compositeScore < rules.minCompositeScore)
    return `low_composite:${trade.compositeScore.toFixed(2)}`;
  if (rules.minQuantLabsConfidence != null && trade.confidenceScore < rules.minQuantLabsConfidence)
    return `low_ql_confidence:${trade.confidenceScore.toFixed(2)}`;
  if (rules.maxSpreadPips != null && trade.spreadAtEntry * 10000 > rules.maxSpreadPips)
    return `high_spread:${(trade.spreadAtEntry * 10000).toFixed(1)}p`;
  if (rules.maxFriction != null && trade.frictionRatio > rules.maxFriction)
    return `high_friction:${trade.frictionRatio.toFixed(2)}`;

  for (const rule of rules.conditionalRules) {
    if (rule.enabled && rule.condition(trade)) return `conditional:${rule.id}`;
  }

  return null;
}

export function simulateTrades(
  trades: NormalizedTrade[],
  rules: FilterRuleSet
): SimulationResult {
  const kept: NormalizedTrade[] = [];
  const removed: NormalizedTrade[] = [];
  const reasonCounts: Record<string, number> = {};

  for (const t of trades) {
    const reason = getRemovalReason(t, rules);
    if (reason) {
      removed.push(t);
      const reasonKey = reason.split(':')[0];
      reasonCounts[reasonKey] = (reasonCounts[reasonKey] || 0) + 1;
    } else {
      kept.push(t);
    }
  }

  return {
    keptTrades: kept,
    removedTrades: removed,
    removedReasonCounts: reasonCounts,
    metricsKept: computeMetricsSummary(kept) as SimulationMetrics,
    metricsRemoved: computeMetricsSummary(removed) as SimulationMetrics,
    metricsBaseline: computeMetricsSummary(trades) as SimulationMetrics,
  };
}

// ─── Edge-Only Mode ──────────────────────────────────────────────────

export function computeEdgeOnlyTrades(
  trades: NormalizedTrade[],
  topN = 10,
  minTrades = 30
): { kept: NormalizedTrade[]; metrics: SimulationMetrics; envKeys: string[] } {
  const stats = buildEnvironmentStats(trades, { minTrades });
  const { top } = findTopEdgeEnvironments(stats, topN);
  const topKeys = new Set(top.map(e => e.envKey));

  const makeKey = (t: NormalizedTrade) => `${t.session}|${t.regime}|${t.symbol}|${t.direction}`;
  const kept = trades.filter(t => topKeys.has(makeKey(t)));

  return {
    kept,
    metrics: computeMetricsSummary(kept) as SimulationMetrics,
    envKeys: [...topKeys],
  };
}

// ─── Presets ─────────────────────────────────────────────────────────

function makeConditionalRules(): ConditionalRule[] {
  return [
    {
      id: 'rollover_block',
      label: 'Hard block: rollover session',
      enabled: true,
      condition: t => t.session === 'rollover',
    },
    {
      id: 'short_expansion_gate',
      label: 'Shorts in expansion: require composite ≥ 0.75 + QL confidence ≥ 0.65',
      enabled: true,
      condition: t =>
        t.direction === 'short' &&
        t.regime === 'expansion' &&
        (t.compositeScore < 0.75 || t.confidenceScore < 0.65),
    },
    {
      id: 'london_open_gate',
      label: 'London open: require composite ≥ 0.78 + QL confidence ≥ 0.65',
      enabled: true,
      condition: t =>
        t.session === 'london-open' &&
        (t.compositeScore < 0.78 || t.confidenceScore < 0.65),
    },
    {
      id: 'high_spread_gate',
      label: 'High spread (>1.0p): require composite ≥ 0.80',
      enabled: true,
      condition: t => t.spreadAtEntry * 10000 > 10 && t.compositeScore < 0.80,
    },
    {
      id: 'weak_agent_gate',
      label: 'Block sentiment-reactor + range-navigator unless composite ≥ 0.80',
      enabled: true,
      condition: t =>
        (t.agentId === 'sentiment-reactor' || t.agentId === 'range-navigator') &&
        t.compositeScore < 0.80,
    },
  ];
}

export function createEmptyRuleSet(name = 'Custom'): FilterRuleSet {
  return {
    name,
    blockSessions: [],
    blockPairs: [],
    blockDirections: [],
    requireSessionAllowlist: [],
    requireRegimeAllowlist: [],
    minCompositeScore: null,
    minQuantLabsConfidence: null,
    maxSpreadPips: null,
    maxFriction: null,
    blockAgents: [],
    conditionalRules: [],
  };
}

export function createRecommendedV1(): FilterRuleSet {
  return {
    name: 'Recommended v1',
    blockSessions: ['rollover'],
    blockPairs: ['AUD_JPY', 'AUD_USD', 'AUD_NZD'],
    blockDirections: [],
    requireSessionAllowlist: [],
    requireRegimeAllowlist: [],
    minCompositeScore: null,
    minQuantLabsConfidence: null,
    maxSpreadPips: null,
    maxFriction: null,
    blockAgents: [],
    conditionalRules: makeConditionalRules(),
  };
}

export function createConservative(): FilterRuleSet {
  return {
    ...createRecommendedV1(),
    name: 'Conservative',
    minCompositeScore: 0.75,
    minQuantLabsConfidence: 0.60,
    maxSpreadPips: 15,
  };
}

export function createAggressive(): FilterRuleSet {
  return {
    name: 'Aggressive',
    blockSessions: ['rollover'],
    blockPairs: [],
    blockDirections: [],
    requireSessionAllowlist: [],
    requireRegimeAllowlist: [],
    minCompositeScore: null,
    minQuantLabsConfidence: null,
    maxSpreadPips: null,
    maxFriction: null,
    blockAgents: [],
    conditionalRules: [makeConditionalRules()[0]], // only rollover block
  };
}

// ─── Persistence ─────────────────────────────────────────────────────

const STORAGE_KEY = 'edge-filter-rulesets';

export interface SerializableRuleSet {
  name: string;
  blockSessions: string[];
  blockPairs: string[];
  blockDirections: ('long' | 'short')[];
  requireSessionAllowlist: string[];
  requireRegimeAllowlist: string[];
  minCompositeScore: number | null;
  minQuantLabsConfidence: number | null;
  maxSpreadPips: number | null;
  maxFriction: number | null;
  blockAgents: string[];
  // Conditional rules stored by ID + enabled state
  conditionalRuleStates: Record<string, boolean>;
}

export function saveRuleSet(rules: FilterRuleSet): void {
  const existing = loadRuleSets();
  const serializable: SerializableRuleSet = {
    name: rules.name,
    blockSessions: rules.blockSessions,
    blockPairs: rules.blockPairs,
    blockDirections: rules.blockDirections,
    requireSessionAllowlist: rules.requireSessionAllowlist,
    requireRegimeAllowlist: rules.requireRegimeAllowlist,
    minCompositeScore: rules.minCompositeScore,
    minQuantLabsConfidence: rules.minQuantLabsConfidence,
    maxSpreadPips: rules.maxSpreadPips,
    maxFriction: rules.maxFriction,
    blockAgents: rules.blockAgents,
    conditionalRuleStates: Object.fromEntries(rules.conditionalRules.map(r => [r.id, r.enabled])),
  };
  const idx = existing.findIndex(r => r.name === rules.name);
  if (idx >= 0) existing[idx] = serializable;
  else existing.push(serializable);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadRuleSets(): SerializableRuleSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteRuleSet(name: string): void {
  const existing = loadRuleSets().filter(r => r.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function hydrateRuleSet(s: SerializableRuleSet): FilterRuleSet {
  const conditionalRules = makeConditionalRules().map(r => ({
    ...r,
    enabled: s.conditionalRuleStates[r.id] ?? r.enabled,
  }));
  return {
    name: s.name,
    blockSessions: s.blockSessions,
    blockPairs: s.blockPairs,
    blockDirections: s.blockDirections,
    requireSessionAllowlist: s.requireSessionAllowlist,
    requireRegimeAllowlist: s.requireRegimeAllowlist,
    minCompositeScore: s.minCompositeScore,
    minQuantLabsConfidence: s.minQuantLabsConfidence,
    maxSpreadPips: s.maxSpreadPips,
    maxFriction: s.maxFriction,
    blockAgents: s.blockAgents,
    conditionalRules,
  };
}
