// Edge Learning Memory Engine
// Persistent learning memory per environment signature.
// Tracks edge confidence, stability, drawdown, and learning state.
//
// CRITICAL: Does NOT modify governance multipliers, gates, or QuantLabs logic.
// Only provides confidence scores for capital allocation adaptation.

import { avg, computeMaxDD } from './edgeDiscoveryEngine';
import { buildEnvKeyFromRaw, type EnvironmentKey } from './environmentSignature';

// ─── Types ────────────────────────────────────────────────────────────

export type LearningState = 'Learning' | 'Stable' | 'Decaying' | 'Reverting';

export type AdaptiveDeploymentMode =
  | 'OBSERVATION'       // Mode 0
  | 'DISCOVERY_RISK'    // Mode 1
  | 'SHADOW_LEARNING'   // Mode 2
  | 'ALLOCATION_WEIGHT' // Mode 3
  | 'FULLY_ADAPTIVE';   // Mode 4

export interface EdgeMemoryEntry {
  environmentSignature: string;
  tradeCount: number;
  expectancy: number;
  sharpeStability: number;
  drawdownProfile: number;       // max DD in pips
  edgeConfidence: number;        // 0–1
  stabilityHalfLife: number;     // trades until confidence halves if no new data
  lastValidationTimestamp: number;
  learningState: LearningState;
  sessionsCovered: Set<string>;
  regimesCovered: Set<string>;
  // Historical expectancy snapshots for decay detection
  expectancyHistory: number[];
  allocationHistory: number[];   // for reversion safety
}

export interface EdgeLearningConfig {
  deploymentMode: AdaptiveDeploymentMode;
  minSampleForConfidence: number;     // 75
  confidenceGrowthRate: number;       // per qualifying batch
  confidenceDecayRate: number;        // per failing check
  recalcIntervalTrades: number;       // 50
  stabilityWindowDays: number;        // 5
  maxHistorySnapshots: number;        // 20
}

const DEFAULT_LEARNING_CONFIG: EdgeLearningConfig = {
  deploymentMode: 'SHADOW_LEARNING',
  minSampleForConfidence: 75,
  confidenceGrowthRate: 0.08,
  confidenceDecayRate: 0.12,
  recalcIntervalTrades: 50,
  stabilityWindowDays: 5,
  maxHistorySnapshots: 20,
};

let _config: EdgeLearningConfig = { ...DEFAULT_LEARNING_CONFIG };
let _memory: Map<string, EdgeMemoryEntry> = new Map();
let _totalTradesProcessed = 0;
let _lastRecalcAt = 0;

// ─── Config Management ───────────────────────────────────────────────

export function getEdgeLearningConfig(): EdgeLearningConfig {
  return { ..._config };
}

export function setEdgeLearningConfig(partial: Partial<EdgeLearningConfig>): void {
  _config = { ..._config, ...partial };
}

export function resetEdgeLearningConfig(): void {
  _config = { ...DEFAULT_LEARNING_CONFIG };
}

export function setDeploymentMode(mode: AdaptiveDeploymentMode): void {
  _config.deploymentMode = mode;
}

export function getDeploymentMode(): AdaptiveDeploymentMode {
  return _config.deploymentMode;
}

// ─── Memory Access ───────────────────────────────────────────────────

export function getEdgeMemory(): Map<string, EdgeMemoryEntry> {
  return new Map(_memory);
}

export function getEdgeMemoryEntry(sig: string): EdgeMemoryEntry | undefined {
  return _memory.get(sig);
}

export function clearEdgeMemory(): void {
  _memory = new Map();
  _totalTradesProcessed = 0;
  _lastRecalcAt = 0;
}

// ─── Environment Signature Builder (delegates to unified module) ─────

export function buildEnvironmentSignature(
  session: string,
  regime: string,
  symbol: string,
  direction: string,
  agentId?: string,
): EnvironmentKey {
  return buildEnvKeyFromRaw(session, regime, symbol, direction, agentId);
}

// ─── Trade Data for Learning ─────────────────────────────────────────

export interface LearningTradeInput {
  environmentSignature: string;
  pnlPips: number;
  session: string;
  regime: string;
  compositeScore: number;
  timestamp: number;
}

// ─── Core Learning Update ────────────────────────────────────────────

export function updateEdgeMemory(trades: LearningTradeInput[]): void {
  if (trades.length === 0) return;

  // Group by environment signature
  const groups: Map<string, LearningTradeInput[]> = new Map();
  for (const t of trades) {
    const existing = groups.get(t.environmentSignature) || [];
    existing.push(t);
    groups.set(t.environmentSignature, existing);
  }

  for (const [sig, sigTrades] of groups) {
    let entry = _memory.get(sig);

    if (!entry) {
      entry = {
        environmentSignature: sig,
        tradeCount: 0,
        expectancy: 0,
        sharpeStability: 0,
        drawdownProfile: 0,
        edgeConfidence: 0,
        stabilityHalfLife: 100,
        lastValidationTimestamp: Date.now(),
        learningState: 'Learning',
        sessionsCovered: new Set(),
        regimesCovered: new Set(),
        expectancyHistory: [],
        allocationHistory: [1.0],
      };
    }

    const pnls = sigTrades.map(t => t.pnlPips);
    const allPnls = [...entry.expectancyHistory.map(() => entry!.expectancy), ...pnls];

    entry.tradeCount += sigTrades.length;
    entry.expectancy = (entry.expectancy * (entry.tradeCount - sigTrades.length) + pnls.reduce((a, b) => a + b, 0)) / entry.tradeCount;

    // Track sessions and regimes
    for (const t of sigTrades) {
      entry.sessionsCovered.add(t.session);
      entry.regimesCovered.add(t.regime);
    }

    // Update drawdown
    const dd = computeMaxDD(pnls);
    entry.drawdownProfile = Math.max(entry.drawdownProfile, dd);

    // Sharpe stability: stddev of rolling expectancy snapshots
    entry.expectancyHistory.push(entry.expectancy);
    if (entry.expectancyHistory.length > _config.maxHistorySnapshots) {
      entry.expectancyHistory = entry.expectancyHistory.slice(-_config.maxHistorySnapshots);
    }

    if (entry.expectancyHistory.length >= 3) {
      const mean = avg(entry.expectancyHistory);
      const variance = entry.expectancyHistory.reduce((s, e) => s + (e - mean) ** 2, 0) / entry.expectancyHistory.length;
      const sd = Math.sqrt(variance);
      entry.sharpeStability = mean !== 0 ? Math.abs(mean) / (sd || 1) : 0;
    }

    // Update learning state + confidence
    entry = updateLearningState(entry);
    entry.lastValidationTimestamp = Date.now();

    _memory.set(sig, entry);
  }

  _totalTradesProcessed += trades.length;
}

// ─── Learning State Transitions ──────────────────────────────────────

function updateLearningState(entry: EdgeMemoryEntry): EdgeMemoryEntry {
  const cfg = _config;

  // EDGE CONFIDENCE GROWTH
  if (
    entry.tradeCount >= cfg.minSampleForConfidence &&
    entry.expectancy > 0 &&
    entry.sessionsCovered.size >= 2
  ) {
    // Increase confidence
    const growthAmount = cfg.confidenceGrowthRate *
      Math.min(1, entry.sharpeStability / 1.5) *
      Math.min(1, entry.tradeCount / 150);
    entry.edgeConfidence = Math.min(1, entry.edgeConfidence + growthAmount);

    if (entry.edgeConfidence >= 0.6 && entry.sharpeStability >= 0.8) {
      entry.learningState = 'Stable';
    } else {
      entry.learningState = 'Learning';
    }
  }

  // EDGE CONFIDENCE DECAY
  if (entry.expectancyHistory.length >= 3) {
    const recent3 = entry.expectancyHistory.slice(-3);
    const recentAvg = avg(recent3);

    if (recentAvg < 0) {
      entry.edgeConfidence = Math.max(0, entry.edgeConfidence - cfg.confidenceDecayRate);
      entry.learningState = 'Decaying';
    }

    // Check for dispersion increase (cluster instability)
    if (entry.expectancyHistory.length >= 5) {
      const early = entry.expectancyHistory.slice(0, Math.floor(entry.expectancyHistory.length / 2));
      const late = entry.expectancyHistory.slice(Math.floor(entry.expectancyHistory.length / 2));
      const earlyVar = early.reduce((s, e) => s + (e - avg(early)) ** 2, 0) / early.length;
      const lateVar = late.reduce((s, e) => s + (e - avg(late)) ** 2, 0) / late.length;

      if (lateVar > earlyVar * 1.5) {
        entry.edgeConfidence = Math.max(0, entry.edgeConfidence - cfg.confidenceDecayRate * 0.5);
        if (entry.learningState !== 'Decaying') {
          entry.learningState = 'Decaying';
        }
      }
    }
  }

  // REVERSION trigger
  if (entry.edgeConfidence < 0.15 && entry.learningState === 'Decaying') {
    entry.learningState = 'Reverting';
  }

  return entry;
}

// ─── Velocity Control ────────────────────────────────────────────────

export function shouldRecalculate(): boolean {
  return (_totalTradesProcessed - _lastRecalcAt) >= _config.recalcIntervalTrades;
}

export function markRecalculated(): void {
  _lastRecalcAt = _totalTradesProcessed;
}

export function getTotalTradesProcessed(): number {
  return _totalTradesProcessed;
}

// ─── Serialization (for localStorage persistence) ────────────────────

interface SerializedMemoryEntry {
  environmentSignature: string;
  tradeCount: number;
  expectancy: number;
  sharpeStability: number;
  drawdownProfile: number;
  edgeConfidence: number;
  stabilityHalfLife: number;
  lastValidationTimestamp: number;
  learningState: LearningState;
  sessionsCovered: string[];
  regimesCovered: string[];
  expectancyHistory: number[];
  allocationHistory: number[];
}

export function serializeEdgeMemory(): string {
  const entries: SerializedMemoryEntry[] = [];
  for (const [, entry] of _memory) {
    entries.push({
      ...entry,
      sessionsCovered: Array.from(entry.sessionsCovered),
      regimesCovered: Array.from(entry.regimesCovered),
    });
  }
  return JSON.stringify({ entries, totalProcessed: _totalTradesProcessed, lastRecalc: _lastRecalcAt, config: _config });
}

export function deserializeEdgeMemory(json: string): void {
  try {
    const data = JSON.parse(json);
    _memory = new Map();
    for (const entry of data.entries || []) {
      _memory.set(entry.environmentSignature, {
        ...entry,
        sessionsCovered: new Set(entry.sessionsCovered || []),
        regimesCovered: new Set(entry.regimesCovered || []),
      });
    }
    _totalTradesProcessed = data.totalProcessed || 0;
    _lastRecalcAt = data.lastRecalc || 0;
    if (data.config) {
      _config = { ..._config, ...data.config };
    }
  } catch {
    console.warn('[EDGE-LEARNING] Failed to deserialize memory');
  }
}

// ─── Persistence Helpers ─────────────────────────────────────────────

const STORAGE_KEY = 'quantlabs_edge_learning_memory';

export function persistEdgeMemory(): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeEdgeMemory());
  } catch {
    console.warn('[EDGE-LEARNING] Failed to persist memory');
  }
}

export function loadEdgeMemory(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      deserializeEdgeMemory(stored);
      return true;
    }
  } catch {
    console.warn('[EDGE-LEARNING] Failed to load memory');
  }
  return false;
}

// ─── Summary for Dashboard ───────────────────────────────────────────

export interface EdgeLearningSummary {
  totalEnvironments: number;
  learningCount: number;
  stableCount: number;
  decayingCount: number;
  revertingCount: number;
  avgEdgeConfidence: number;
  topConfidenceEnvironments: Array<{
    signature: string;
    confidence: number;
    expectancy: number;
    tradeCount: number;
    learningState: LearningState;
  }>;
  deploymentMode: AdaptiveDeploymentMode;
  totalTradesProcessed: number;
}

export function getEdgeLearningSummary(): EdgeLearningSummary {
  const entries = Array.from(_memory.values());
  const learning = entries.filter(e => e.learningState === 'Learning');
  const stable = entries.filter(e => e.learningState === 'Stable');
  const decaying = entries.filter(e => e.learningState === 'Decaying');
  const reverting = entries.filter(e => e.learningState === 'Reverting');

  const avgConf = entries.length > 0
    ? entries.reduce((s, e) => s + e.edgeConfidence, 0) / entries.length
    : 0;

  const top = [...entries]
    .sort((a, b) => b.edgeConfidence - a.edgeConfidence)
    .slice(0, 10)
    .map(e => ({
      signature: e.environmentSignature,
      confidence: Math.round(e.edgeConfidence * 100) / 100,
      expectancy: Math.round(e.expectancy * 100) / 100,
      tradeCount: e.tradeCount,
      learningState: e.learningState,
    }));

  return {
    totalEnvironments: entries.length,
    learningCount: learning.length,
    stableCount: stable.length,
    decayingCount: decaying.length,
    revertingCount: reverting.length,
    avgEdgeConfidence: Math.round(avgConf * 100) / 100,
    topConfidenceEnvironments: top,
    deploymentMode: _config.deploymentMode,
    totalTradesProcessed: _totalTradesProcessed,
  };
}
