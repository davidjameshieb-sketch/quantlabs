// ─── Short Shadow Validation Pipeline ───
// Shadow-first rollout: Shadow → Paper/Demo → Live small → Scale only if stability rises.
// Mandatory promotion gates before any live trading.

import type { ShortShadowResult, ShortShadowStatus, ShortEngineConfig } from './shortTypes';
import { DEFAULT_SHORT_ENGINE_CONFIG } from './shortTypes';

const PF_EPSILON = 0.001;

// ─── Shadow Metrics ───

export interface ShortShadowMetrics {
  tradeCount: number;
  expectancy: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  drawdownDensity: number;
  avgFriction: number;
  executionQualityScore: number;
}

// ─── Baseline Metrics (from long engine or historical shorts) ───

export interface ShortBaselineMetrics {
  expectancy: number;
  drawdownDensity: number;
  avgFriction: number;
}

// ─── Evaluate Shadow Results ───

export function evaluateShortShadow(
  metrics: ShortShadowMetrics,
  baseline: ShortBaselineMetrics,
  config: ShortEngineConfig = DEFAULT_SHORT_ENGINE_CONFIG,
): ShortShadowResult {
  // Status
  let status: ShortShadowStatus = 'collecting';
  if (metrics.tradeCount >= config.shadowMinTrades) {
    status = 'evaluating';
  }

  if (status === 'collecting') {
    return {
      status: 'collecting',
      tradeCount: metrics.tradeCount,
      minTradesRequired: config.shadowMinTrades,
      gates: {
        expectancyPositive: false,
        profitFactorStable: false,
        drawdownNotWorse: false,
        frictionNotWorse: false,
        executionQualityOk: false,
      },
      allGatesPassed: false,
      failureReport: null,
      metricsSnapshot: null,
    };
  }

  // ── Gate Evaluation ──

  // G1: Expectancy positive
  const expectancyPositive = metrics.expectancy > 0;

  // G2: Profit Factor stable (>= 1.2 with validity guard)
  const profitFactor = metrics.grossLoss > PF_EPSILON
    ? metrics.grossProfit / metrics.grossLoss
    : null;
  const profitFactorStable = profitFactor !== null && profitFactor >= 1.2;

  // G3: Drawdown not worse than baseline * 1.1
  const drawdownNotWorse = metrics.drawdownDensity <= baseline.drawdownDensity * 1.1;

  // G4: Friction not worse than baseline * 1.05
  const frictionNotWorse = metrics.avgFriction <= baseline.avgFriction * 1.05;

  // G5: Execution quality OK (>= 70)
  const executionQualityOk = metrics.executionQualityScore >= 70;

  const gates = {
    expectancyPositive,
    profitFactorStable,
    drawdownNotWorse,
    frictionNotWorse,
    executionQualityOk,
  };

  const allGatesPassed = Object.values(gates).every(Boolean);

  // Generate failure report
  let failureReport: string | null = null;
  if (!allGatesPassed) {
    const failures: string[] = [];
    if (!expectancyPositive) failures.push(`Expectancy negative (${metrics.expectancy.toFixed(2)} pips)`);
    if (!profitFactorStable) {
      if (profitFactor === null) {
        failures.push('PF invalid (zero gross loss — insufficient sample diversity)');
      } else {
        failures.push(`PF ${profitFactor.toFixed(2)} < 1.2 threshold`);
      }
    }
    if (!drawdownNotWorse) failures.push(`Drawdown density ${(metrics.drawdownDensity * 100).toFixed(0)}% > baseline ${(baseline.drawdownDensity * 100).toFixed(0)}% * 1.1`);
    if (!frictionNotWorse) failures.push(`Avg friction ${metrics.avgFriction.toFixed(3)} > baseline ${baseline.avgFriction.toFixed(3)} * 1.05`);
    if (!executionQualityOk) failures.push(`Execution quality ${metrics.executionQualityScore} < 70`);
    failureReport = `SHORT SHADOW FAILED: ${failures.join('; ')}`;
  }

  return {
    status: allGatesPassed ? 'promoted' : 'failed',
    tradeCount: metrics.tradeCount,
    minTradesRequired: config.shadowMinTrades,
    gates,
    allGatesPassed,
    failureReport,
    metricsSnapshot: {
      expectancy: metrics.expectancy,
      profitFactor,
      drawdownDensity: metrics.drawdownDensity,
      avgFriction: metrics.avgFriction,
      winRate: metrics.winRate,
    },
  };
}
