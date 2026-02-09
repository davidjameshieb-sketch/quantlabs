// Edge Drift Detector & Reversion Safety System
// Monitors edge environment stability and triggers automatic reversion
// when statistical significance is lost or performance degrades.
//
// CRITICAL: Does NOT modify governance multipliers, gates, or QuantLabs logic.

import { getEdgeMemory, type EdgeMemoryEntry, type LearningState } from './edgeLearningState';

// ─── Types ────────────────────────────────────────────────────────────

export interface DriftAlert {
  id: string;
  environmentSignature: string;
  alertType: 'expectancy_slope' | 'predictive_decay' | 'session_entropy' | 'pair_drift' | 'regime_shock' | 'dd_breach';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  metricValue: number;
  threshold: number;
}

export interface DriftMonitorState {
  alerts: DriftAlert[];
  environmentsMonitored: number;
  environmentsStable: number;
  environmentsDrifting: number;
  environmentsReverting: number;
  overallDriftScore: number;         // 0 = stable, 1 = full drift
  reversionLog: ReversionEntry[];
}

export interface ReversionEntry {
  environmentSignature: string;
  revertedAt: number;
  reason: string;
  previousConfidence: number;
  previousAllocation: number;
  newAllocation: number;
}

export interface DriftMonitorConfig {
  expectancySlopeThreshold: number;     // negative slope that triggers alert
  entropyMaxThreshold: number;          // session entropy above this = drift
  ddBreachMultiplier: number;           // if DD exceeds baseline * this = revert
  minTradesForDriftCheck: number;       // minimum trades before monitoring
  recentWindowSize: number;             // number of recent snapshots to check
}

const DEFAULT_DRIFT_CONFIG: DriftMonitorConfig = {
  expectancySlopeThreshold: -0.3,
  entropyMaxThreshold: 0.85,
  ddBreachMultiplier: 1.3,
  minTradesForDriftCheck: 20,
  recentWindowSize: 5,
};

let _driftConfig: DriftMonitorConfig = { ...DEFAULT_DRIFT_CONFIG };
let _alerts: DriftAlert[] = [];
let _reversionLog: ReversionEntry[] = [];

// ─── Config ──────────────────────────────────────────────────────────

export function getDriftMonitorConfig(): DriftMonitorConfig {
  return { ..._driftConfig };
}

export function setDriftMonitorConfig(partial: Partial<DriftMonitorConfig>): void {
  _driftConfig = { ..._driftConfig, ...partial };
}

// ─── Core Drift Detection ────────────────────────────────────────────

function computeExpectancySlope(history: number[]): number {
  if (history.length < 3) return 0;
  const recent = history.slice(-_driftConfig.recentWindowSize);
  if (recent.length < 2) return 0;

  // Simple linear regression slope
  const n = recent.length;
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i] - yMean);
    den += (i - xMean) ** 2;
  }

  return den !== 0 ? num / den : 0;
}

function computeSessionEntropy(entry: EdgeMemoryEntry): number {
  const sessions = Array.from(entry.sessionsCovered);
  if (sessions.length <= 1) return 0;

  // Uniform distribution entropy (max when evenly spread)
  const n = sessions.length;
  // Approximation: more sessions = higher entropy = less concentrated
  const maxPossibleSessions = 5; // asian, london, ny, lateNY, rollover
  return Math.min(1, n / maxPossibleSessions);
}

export function detectDrift(entry: EdgeMemoryEntry): DriftAlert[] {
  const cfg = _driftConfig;
  const alerts: DriftAlert[] = [];
  const now = Date.now();

  if (entry.tradeCount < cfg.minTradesForDriftCheck) return alerts;

  // 1. Expectancy slope
  const slope = computeExpectancySlope(entry.expectancyHistory);
  if (slope < cfg.expectancySlopeThreshold) {
    alerts.push({
      id: `slope_${entry.environmentSignature}`,
      environmentSignature: entry.environmentSignature,
      alertType: 'expectancy_slope',
      severity: slope < cfg.expectancySlopeThreshold * 2 ? 'critical' : 'warning',
      message: `Expectancy slope ${slope.toFixed(3)} indicates declining edge`,
      timestamp: now,
      metricValue: slope,
      threshold: cfg.expectancySlopeThreshold,
    });
  }

  // 2. Session entropy (too dispersed)
  const entropy = computeSessionEntropy(entry);
  if (entropy > cfg.entropyMaxThreshold && entry.edgeConfidence > 0.3) {
    alerts.push({
      id: `entropy_${entry.environmentSignature}`,
      environmentSignature: entry.environmentSignature,
      alertType: 'session_entropy',
      severity: 'warning',
      message: `Session distribution entropy ${entropy.toFixed(2)} — edge may be too dispersed`,
      timestamp: now,
      metricValue: entropy,
      threshold: cfg.entropyMaxThreshold,
    });
  }

  // 3. Drawdown breach
  if (entry.drawdownProfile > 0) {
    const baselineDD = entry.expectancy > 0
      ? Math.abs(entry.expectancy) * 3
      : 10; // fallback
    if (entry.drawdownProfile > baselineDD * cfg.ddBreachMultiplier) {
      alerts.push({
        id: `dd_${entry.environmentSignature}`,
        environmentSignature: entry.environmentSignature,
        alertType: 'dd_breach',
        severity: 'critical',
        message: `Drawdown ${entry.drawdownProfile.toFixed(1)}p exceeds ${(cfg.ddBreachMultiplier * 100).toFixed(0)}% of baseline`,
        timestamp: now,
        metricValue: entry.drawdownProfile,
        threshold: baselineDD * cfg.ddBreachMultiplier,
      });
    }
  }

  // 4. Predictive decay (confidence dropping while trades increasing)
  if (entry.expectancyHistory.length >= 5) {
    const firstHalf = entry.expectancyHistory.slice(0, Math.floor(entry.expectancyHistory.length / 2));
    const secondHalf = entry.expectancyHistory.slice(Math.floor(entry.expectancyHistory.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (firstAvg > 0 && secondAvg < firstAvg * 0.5) {
      alerts.push({
        id: `pred_decay_${entry.environmentSignature}`,
        environmentSignature: entry.environmentSignature,
        alertType: 'predictive_decay',
        severity: secondAvg < 0 ? 'critical' : 'warning',
        message: `Expectancy degraded from ${firstAvg.toFixed(2)} to ${secondAvg.toFixed(2)}`,
        timestamp: now,
        metricValue: secondAvg,
        threshold: firstAvg * 0.5,
      });
    }
  }

  return alerts;
}

// ─── Full Monitor Scan ───────────────────────────────────────────────

export function runDriftMonitor(): DriftMonitorState {
  const memory = getEdgeMemory();
  const allAlerts: DriftAlert[] = [];
  let stable = 0;
  let drifting = 0;
  let reverting = 0;

  for (const [, entry] of memory) {
    const entryAlerts = detectDrift(entry);
    allAlerts.push(...entryAlerts);

    if (entry.learningState === 'Reverting') {
      reverting++;
    } else if (entryAlerts.some(a => a.severity === 'critical') || entry.learningState === 'Decaying') {
      drifting++;
    } else {
      stable++;
    }
  }

  _alerts = allAlerts;
  const total = memory.size || 1;
  const overallDriftScore = Math.round((drifting + reverting * 1.5) / total * 100) / 100;

  return {
    alerts: allAlerts,
    environmentsMonitored: memory.size,
    environmentsStable: stable,
    environmentsDrifting: drifting,
    environmentsReverting: reverting,
    overallDriftScore: Math.min(1, overallDriftScore),
    reversionLog: [..._reversionLog],
  };
}

// ─── Reversion Safety ────────────────────────────────────────────────

export function triggerReversion(
  environmentSignature: string,
  reason: string,
  previousConfidence: number,
  previousAllocation: number,
): void {
  const entry: ReversionEntry = {
    environmentSignature,
    revertedAt: Date.now(),
    reason,
    previousConfidence,
    previousAllocation,
    newAllocation: 1.0, // revert to baseline
  };

  _reversionLog.push(entry);
  if (_reversionLog.length > 100) {
    _reversionLog = _reversionLog.slice(-100);
  }
}

export function getReversionLog(): ReversionEntry[] {
  return [..._reversionLog];
}

export function getActiveAlerts(): DriftAlert[] {
  return [..._alerts];
}

export function clearDriftMonitor(): void {
  _alerts = [];
  _reversionLog = [];
}
