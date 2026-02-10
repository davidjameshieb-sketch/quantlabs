// Adaptive Capital Allocator
// Computes final allocation multiplier using edge confidence, stability, and sample confidence.
// Includes shadow validation guardrail and velocity control.
//
// CRITICAL: Does NOT modify governance multipliers, gates, or QuantLabs logic.
// Only outputs a position sizing multiplier.

import { getEdgeMemoryEntry, type AdaptiveDeploymentMode, getDeploymentMode } from './edgeLearningState';

// ─── Types ────────────────────────────────────────────────────────────

export interface AdaptiveAllocationResult {
  allocationMultiplier: number;
  baselineMultiplier: number;
  edgeConfidence: number;
  stabilityScore: number;
  sampleConfidence: number;
  velocityCapped: boolean;
  shadowValidated: boolean;
  deploymentMode: AdaptiveDeploymentMode;
}

export interface ShadowValidationState {
  shadowTrades: number;
  edgeExpectancy: number;
  baselineExpectancy: number;
  expectancyRatio: number;
  edgeMaxDD: number;
  baselineMaxDD: number;
  ddRatio: number;
  compositeDecileSlope: number;
  validated: boolean;
  failReasons: string[];
}

// ─── Configuration ───────────────────────────────────────────────────

export interface AdaptiveAllocatorConfig {
  minMultiplier: number;        // 0.25
  maxMultiplier: number;        // 1.75
  velocityMaxChangePer50: number; // 0.10
  shadowMinTrades: number;      // 150
  shadowMinExpRatio: number;    // 1.3
  shadowMaxDDRatio: number;     // 0.70
  shadowMinDecileSlope: number; // 0.02
}

const DEFAULT_ALLOCATOR_CONFIG: AdaptiveAllocatorConfig = {
  minMultiplier: 0.25,
  maxMultiplier: 1.75,
  // Fast Ramp §3: velocity max change per evaluation
  velocityMaxChangePer50: 0.10,
  // Fast Ramp §4: Faster shadow validation threshold
  shadowMinTrades: 100,
  shadowMinExpRatio: 1.2,
  shadowMaxDDRatio: 0.75,
  shadowMinDecileSlope: 0.015,
};

let _allocConfig: AdaptiveAllocatorConfig = { ...DEFAULT_ALLOCATOR_CONFIG };
let _lastAllocationByEnv: Map<string, number> = new Map();
let _shadowState: ShadowValidationState | null = null;

export function getAdaptiveAllocatorConfig(): AdaptiveAllocatorConfig {
  return { ..._allocConfig };
}

export function setAdaptiveAllocatorConfig(partial: Partial<AdaptiveAllocatorConfig>): void {
  _allocConfig = { ..._allocConfig, ...partial };
}

export function resetAdaptiveAllocatorConfig(): void {
  _allocConfig = { ...DEFAULT_ALLOCATOR_CONFIG };
  _lastAllocationByEnv = new Map();
  _shadowState = null;
}

// ─── Shadow Validation ───────────────────────────────────────────────

export function updateShadowValidation(state: ShadowValidationState): void {
  _shadowState = state;
}

export function getShadowValidationState(): ShadowValidationState | null {
  return _shadowState;
}

export function isShadowValidated(): boolean {
  if (!_shadowState) return false;
  return _shadowState.validated;
}

export function computeShadowValidation(
  shadowTrades: number,
  edgeExpectancy: number,
  baselineExpectancy: number,
  edgeMaxDD: number,
  baselineMaxDD: number,
  compositeDecileSlope: number,
): ShadowValidationState {
  const cfg = _allocConfig;
  const failReasons: string[] = [];

  const expectancyRatio = baselineExpectancy !== 0
    ? edgeExpectancy / baselineExpectancy
    : edgeExpectancy > 0 ? 99 : 0;

  const ddRatio = baselineMaxDD > 0
    ? edgeMaxDD / baselineMaxDD
    : edgeMaxDD === 0 ? 0 : 1;

  if (shadowTrades < cfg.shadowMinTrades) {
    failReasons.push(`Shadow trades ${shadowTrades} < ${cfg.shadowMinTrades} required`);
  }
  if (expectancyRatio < cfg.shadowMinExpRatio) {
    failReasons.push(`Expectancy ratio ${expectancyRatio.toFixed(2)} < ${cfg.shadowMinExpRatio}`);
  }
  if (ddRatio > cfg.shadowMaxDDRatio) {
    failReasons.push(`DD ratio ${ddRatio.toFixed(2)} > ${cfg.shadowMaxDDRatio}`);
  }
  if (compositeDecileSlope < cfg.shadowMinDecileSlope) {
    failReasons.push(`Composite decile slope ${compositeDecileSlope.toFixed(3)} < ${cfg.shadowMinDecileSlope}`);
  }

  const state: ShadowValidationState = {
    shadowTrades,
    edgeExpectancy,
    baselineExpectancy,
    expectancyRatio: Math.round(expectancyRatio * 100) / 100,
    edgeMaxDD,
    baselineMaxDD,
    ddRatio: Math.round(ddRatio * 100) / 100,
    compositeDecileSlope,
    validated: failReasons.length === 0,
    failReasons,
  };

  _shadowState = state;
  return state;
}

// ─── Core Allocation Computation ─────────────────────────────────────

export function computeAdaptiveAllocation(
  environmentSignature: string,
  baselineMultiplier: number = 1.0,
): AdaptiveAllocationResult {
  const cfg = _allocConfig;
  const mode = getDeploymentMode();

  // Mode 0: Observation only — no adjustment
  if (mode === 'OBSERVATION') {
    return {
      allocationMultiplier: 1.0,
      baselineMultiplier,
      edgeConfidence: 0,
      stabilityScore: 0,
      sampleConfidence: 0,
      velocityCapped: false,
      shadowValidated: false,
      deploymentMode: mode,
    };
  }

  // Mode 1: Discovery Risk only — use existing discoveryRiskEngine multiplier
  if (mode === 'DISCOVERY_RISK') {
    return {
      allocationMultiplier: baselineMultiplier,
      baselineMultiplier,
      edgeConfidence: 0,
      stabilityScore: 0,
      sampleConfidence: 0,
      velocityCapped: false,
      shadowValidated: false,
      deploymentMode: mode,
    };
  }

  const entry = getEdgeMemoryEntry(environmentSignature);
  const shadowValidated = isShadowValidated();

  if (!entry) {
    return {
      allocationMultiplier: baselineMultiplier,
      baselineMultiplier,
      edgeConfidence: 0,
      stabilityScore: 0,
      sampleConfidence: 0,
      velocityCapped: false,
      shadowValidated,
      deploymentMode: mode,
    };
  }

  // Mode 2: Shadow Learning — log but don't adjust
  if (mode === 'SHADOW_LEARNING') {
    return {
      allocationMultiplier: baselineMultiplier,
      baselineMultiplier,
      edgeConfidence: entry.edgeConfidence,
      stabilityScore: entry.sharpeStability,
      sampleConfidence: Math.min(1, entry.tradeCount / 150),
      velocityCapped: false,
      shadowValidated,
      deploymentMode: mode,
    };
  }

  // Modes 3-4: Active allocation adjustment (requires shadow validation)
  if (!shadowValidated) {
    // Not validated — stay at baseline
    return {
      allocationMultiplier: baselineMultiplier,
      baselineMultiplier,
      edgeConfidence: entry.edgeConfidence,
      stabilityScore: entry.sharpeStability,
      sampleConfidence: Math.min(1, entry.tradeCount / 150),
      velocityCapped: false,
      shadowValidated: false,
      deploymentMode: mode,
    };
  }

  // Compute allocation weight
  const edgeConfidence = entry.edgeConfidence;
  const stabilityScore = Math.min(1, entry.sharpeStability / 2);
  const sampleConfidence = Math.min(1, entry.tradeCount / 150);

  let rawMultiplier = baselineMultiplier * edgeConfidence * stabilityScore * sampleConfidence;

  // Clamp
  rawMultiplier = Math.max(cfg.minMultiplier, Math.min(cfg.maxMultiplier, rawMultiplier));

  // Velocity control: max 10% change per 50 trades
  const lastAlloc = _lastAllocationByEnv.get(environmentSignature) ?? baselineMultiplier;
  const maxDelta = cfg.velocityMaxChangePer50;
  let velocityCapped = false;

  if (Math.abs(rawMultiplier - lastAlloc) > maxDelta) {
    rawMultiplier = lastAlloc + Math.sign(rawMultiplier - lastAlloc) * maxDelta;
    velocityCapped = true;
  }

  // Re-clamp after velocity
  rawMultiplier = Math.max(cfg.minMultiplier, Math.min(cfg.maxMultiplier, rawMultiplier));

  _lastAllocationByEnv.set(environmentSignature, rawMultiplier);

  return {
    allocationMultiplier: Math.round(rawMultiplier * 100) / 100,
    baselineMultiplier,
    edgeConfidence,
    stabilityScore: Math.round(stabilityScore * 100) / 100,
    sampleConfidence: Math.round(sampleConfidence * 100) / 100,
    velocityCapped,
    shadowValidated,
    deploymentMode: mode,
  };
}
