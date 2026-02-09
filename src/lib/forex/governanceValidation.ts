// Governance Validation Engine — Runtime Safety Checks
// Sections 4-6: Unit consistency (G11), shadow mode integrity (G5),
// and symbol normalization audit (G12).
// Read-only validators — DO NOT modify trading decisions.

import type { GovernanceContext, GateEntry } from './tradeGovernanceEngine';
import { isShadowMode } from './tradeGovernanceEngine';
import { getTickersByType } from '@/lib/market/tickers';
import { getAllLivePrices } from './oandaPricingService';
import { toDisplaySymbol } from './forexSymbolMap';
import { governanceAlerts } from './governanceAlerts';

// ─── Section 4: Unit Consistency Validation (ATR vs Spread) ───

export interface UnitValidationResult {
  passed: boolean;
  violations: string[];
  gate: GateEntry | null;
}

export function validateUnitConsistency(ctx: GovernanceContext): UnitValidationResult {
  const violations: string[] = [];

  if (ctx.atrValue <= 0) {
    violations.push(`ATR is ${ctx.atrValue} — must be > 0`);
  }

  if (ctx.currentSpread < 0) {
    violations.push(`Spread is ${ctx.currentSpread} — must be >= 0`);
  }

  if (ctx.priceDataAvailable && ctx.currentSpread > 0) {
    if (ctx.frictionRatio < 0.5 || ctx.frictionRatio > 50) {
      violations.push(
        `Friction ratio ${ctx.frictionRatio.toFixed(2)} outside sane range [0.5, 50] — possible unit mismatch`,
      );
    }
  }

  if (ctx.priceDataAvailable && ctx.currentSpread > 0) {
    const expectedFriction = ctx.currentSpread + ctx.slippageEstimate;
    const delta = Math.abs(ctx.totalFriction - expectedFriction);
    if (delta > 0.000001) {
      violations.push(
        `totalFriction ${ctx.totalFriction} ≠ spread(${ctx.currentSpread}) + slippage(${ctx.slippageEstimate})`,
      );
    }
  }

  if (violations.length > 0) {
    governanceAlerts.emit('unit_consistency_failure', { violations });
  }

  return {
    passed: violations.length === 0,
    violations,
    gate: violations.length > 0
      ? { id: 'G11_INFRA_UNIT_MISMATCH' as any, message: `Unit mismatch: ${violations[0]}` }
      : null,
  };
}

// ─── Section 5: Shadow Mode Execution Verification ───

export interface ShadowModeIntegrity {
  shadowModeActive: boolean;
  executionViolations: number;
  verified: boolean;
}

let shadowExecutionViolations = 0;

export function reportShadowModeViolation(): void {
  shadowExecutionViolations++;
  governanceAlerts.emit('shadow_mode_execution_violation', {
    totalViolations: shadowExecutionViolations,
  });
  console.warn(
    `[GOVERNANCE] ⚠️ SHADOW MODE VIOLATION: Execution path reached while shadow mode is ON. Total violations: ${shadowExecutionViolations}`,
  );
}

export function verifyShadowModeIntegrity(): ShadowModeIntegrity {
  return {
    shadowModeActive: isShadowMode(),
    executionViolations: shadowExecutionViolations,
    verified: shadowExecutionViolations === 0,
  };
}

export function resetShadowViolationCount(): void {
  shadowExecutionViolations = 0;
}

/**
 * Guard function to call at the last moment before broker execution.
 * Returns true if execution should proceed, false if blocked.
 */
export function assertNotShadowMode(context: string = 'execution'): boolean {
  if (isShadowMode()) {
    reportShadowModeViolation();
    console.warn(
      `[GOVERNANCE] BLOCKED: ${context} attempted in shadow mode — order NOT placed.`,
    );
    return false;
  }
  return true;
}

// ─── Section 6: Symbol Normalization Audit ───

export interface SymbolMappingResult {
  valid: boolean;
  displaySymbol: string;
  inLivePrices: boolean;
  inTickerRegistry: boolean;
  gate: GateEntry | null;
}

export function verifySymbolMapping(symbol: string): SymbolMappingResult {
  const displaySymbol = toDisplaySymbol(symbol);

  // Check live prices
  const livePrices = getAllLivePrices();
  const inLivePrices = displaySymbol in livePrices;

  // Check ticker registry
  const tickers = getTickersByType('forex');
  const inTickerRegistry = tickers.some(t => t.symbol === displaySymbol);

  const valid = inLivePrices || inTickerRegistry;

  if (!valid) {
    governanceAlerts.emit('symbol_mapping_failure', {
      symbol,
      displaySymbol,
      inLivePrices,
      inTickerRegistry,
    });
  }

  return {
    valid,
    displaySymbol,
    inLivePrices,
    inTickerRegistry,
    gate: !valid
      ? {
          id: 'G12_SYMBOL_MAPPING_FAILURE' as any,
          message: `Symbol ${displaySymbol} not found in ${!inLivePrices ? 'live prices' : 'ticker registry'}`,
        }
      : null,
  };
}
