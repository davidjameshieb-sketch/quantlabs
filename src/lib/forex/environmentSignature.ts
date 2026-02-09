// Environment Signature — Single Source of Truth
// The ONLY place that defines canonical environment keys across all modules.
//
// Used by: edgeLearningState, adaptiveCapitalAllocator, edgeDriftMonitor,
// edgeDiscoveryEngine, filterSimulator, governance logs, dashboards.
//
// CRITICAL: Does NOT modify governance multipliers, gates, or QuantLabs logic.

import { toRawSymbol, toDisplaySymbol } from './forexSymbolMap';

// ─── Types ────────────────────────────────────────────────────────────

export interface EnvironmentFeatures {
  symbol: string;           // canonical raw: "EURUSD"
  symbolDisplay: string;    // for UI: "EUR/USD"
  session: string;          // normalized session label
  regime: string;           // normalized volatility phase
  direction: string;        // LONG | SHORT | NEUTRAL
  agentId: string;          // agent_id or "unknown"
  spreadBucket: string;     // <=0.5 | 0.5-1.0 | 1.0-1.5 | >1.5
  compositeDecile: string;  // D1 | D2 | ... | D10
}

export type EnvironmentKey = string;

// ─── Session Normalization ────────────────────────────────────────────

const SESSION_CANONICAL: Record<string, string> = {
  'asian': 'asian',
  'asia': 'asian',
  'tokyo': 'asian',
  'london-open': 'london-open',
  'london': 'london-open',
  'ny-overlap': 'ny-overlap',
  'ny': 'ny-overlap',
  'late-ny': 'late-ny',
  'lateny': 'late-ny',
  'rollover': 'rollover',
};

export function normalizeSession(session: string): string {
  const lower = session.toLowerCase().trim();
  return SESSION_CANONICAL[lower] || lower;
}

// ─── Regime Normalization ─────────────────────────────────────────────

const REGIME_CANONICAL: Record<string, string> = {
  'compression': 'compression',
  'ranging': 'compression',
  'ignition': 'ignition',
  'expansion': 'expansion',
  'trending': 'expansion',
  'exhaustion': 'exhaustion',
};

export function normalizeRegime(regime: string): string {
  const lower = regime.toLowerCase().trim();
  return REGIME_CANONICAL[lower] || lower;
}

// ─── Direction Normalization ──────────────────────────────────────────

export function normalizeDirection(direction: string): string {
  const upper = direction.toUpperCase().trim();
  if (upper === 'LONG' || upper === 'BUY') return 'LONG';
  if (upper === 'SHORT' || upper === 'SELL') return 'SHORT';
  if (upper === 'NEUTRAL' || upper === 'SKIP') return 'NEUTRAL';
  return upper;
}

// ─── Symbol Normalization ─────────────────────────────────────────────

export function normalizeSymbol(symbol: string): string {
  return toRawSymbol(symbol);
}

export function normalizeSymbolDisplay(symbol: string): string {
  return toDisplaySymbol(symbol);
}

// ─── Spread Bucketing ─────────────────────────────────────────────────

export function computeSpreadBucket(spreadPips: number): string {
  if (spreadPips <= 0.5) return '<=0.5';
  if (spreadPips <= 1.0) return '0.5-1.0';
  if (spreadPips <= 1.5) return '1.0-1.5';
  return '>1.5';
}

// ─── Composite Decile ─────────────────────────────────────────────────

export function computeCompositeDecile(compositeScore: number): string {
  const clamped = Math.max(0, Math.min(1, compositeScore));
  const d = Math.min(Math.floor(clamped * 10), 9);
  return `D${d + 1}`;
}

// ─── Build Features ───────────────────────────────────────────────────

export interface EnvironmentInput {
  symbol: string;
  session: string;
  regime: string;
  direction: string;
  agentId?: string;
  spreadPips?: number;
  compositeScore?: number;
}

export function buildEnvironmentFeatures(input: EnvironmentInput): EnvironmentFeatures {
  return {
    symbol: normalizeSymbol(input.symbol),
    symbolDisplay: normalizeSymbolDisplay(input.symbol),
    session: normalizeSession(input.session),
    regime: normalizeRegime(input.regime),
    direction: normalizeDirection(input.direction),
    agentId: (input.agentId || 'unknown').toLowerCase().trim(),
    spreadBucket: computeSpreadBucket(input.spreadPips ?? 0),
    compositeDecile: computeCompositeDecile(input.compositeScore ?? 0),
  };
}

// ─── Build Canonical Key ──────────────────────────────────────────────

/**
 * Standard env key: session|regime|symbol|direction|agent
 * Used for learning memory, drift monitoring, allocator.
 */
export function buildEnvironmentKey(features: EnvironmentFeatures): EnvironmentKey {
  return [
    features.session,
    features.regime,
    features.symbol,
    features.direction,
    features.agentId,
  ].join('|');
}

/**
 * Extended key including spread bucket and composite decile.
 * Used for Edge Discovery fine-grained heatmap.
 */
export function buildExtendedEnvironmentKey(features: EnvironmentFeatures): EnvironmentKey {
  return [
    features.session,
    features.regime,
    features.symbol,
    features.direction,
    features.agentId,
    features.spreadBucket,
    features.compositeDecile,
  ].join('|');
}

/**
 * Short key without agent: session|regime|symbol|direction
 * Used by Discovery Risk and dashboard summaries.
 */
export function buildShortEnvironmentKey(features: EnvironmentFeatures): EnvironmentKey {
  return [
    features.session,
    features.regime,
    features.symbol,
    features.direction,
  ].join('|');
}

// ─── Convenience: Build key directly from raw inputs ──────────────────

export function buildEnvKeyFromRaw(
  session: string,
  regime: string,
  symbol: string,
  direction: string,
  agentId?: string,
): EnvironmentKey {
  const features = buildEnvironmentFeatures({ symbol, session, regime, direction, agentId });
  return buildEnvironmentKey(features);
}

// ─── Adaptive Edge Kill Switch & Rollback ─────────────────────────────

let _adaptiveEdgeEnabled = true;
let _forceBaselineUntilTs: number | null = null;

export function isAdaptiveEdgeActive(): boolean {
  if (!_adaptiveEdgeEnabled) return false;
  if (_forceBaselineUntilTs && Date.now() < _forceBaselineUntilTs) return false;
  return true;
}

export function setAdaptiveEdgeEnabled(enabled: boolean): void {
  _adaptiveEdgeEnabled = enabled;
  console.log(`[ENV-SIG] Adaptive Edge ${enabled ? 'ENABLED' : 'DISABLED (kill-switch)'}`);
}

export function getAdaptiveEdgeEnabled(): boolean {
  return _adaptiveEdgeEnabled;
}

export function setForceBaselineUntil(ts: number | null): void {
  _forceBaselineUntilTs = ts;
  if (ts) {
    console.log(`[ENV-SIG] Force baseline until ${new Date(ts).toISOString()}`);
  } else {
    console.log(`[ENV-SIG] Force baseline cleared`);
  }
}

export function getForceBaselineUntilTs(): number | null {
  return _forceBaselineUntilTs;
}

// ─── Explainability ───────────────────────────────────────────────────

export interface AdaptiveEdgeExplain {
  envKey: EnvironmentKey;
  riskLabel: 'BLOCKED' | 'REDUCED' | 'EDGE_BOOST' | 'NORMAL' | 'KILL_SWITCH';
  allocationMultiplier: number;
  topReasons: string[];      // max 3
  learningState: string;     // Learning | Stable | Decaying | Reverting | N/A
  sampleSize: number;
  confidenceScore: number;
}

export function buildExplainability(
  envKey: EnvironmentKey,
  riskLabel: AdaptiveEdgeExplain['riskLabel'],
  allocationMultiplier: number,
  reasons: string[],
  learningState: string = 'N/A',
  sampleSize: number = 0,
  confidenceScore: number = 0,
): AdaptiveEdgeExplain {
  return {
    envKey,
    riskLabel,
    allocationMultiplier,
    topReasons: reasons.slice(0, 3),
    learningState,
    sampleSize,
    confidenceScore,
  };
}
