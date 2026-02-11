// ─── Short/Long Engine Router ───
// Single entry point that determines which engine handles a trade proposal.
// CRITICAL: The two engines are completely isolated.
// The router CANNOT mix engine contexts.

import type { ShortEngineConfig } from './shortTypes';
import { DEFAULT_SHORT_ENGINE_CONFIG } from './shortTypes';
import type { LiquiditySession } from '../microstructureEngine';
import { isLongOnlyEnabled } from '@/lib/config/tradingMode';
import { detectLiquiditySession } from '../governanceContextProvider';

export type EngineSelection = 'LONG_ENGINE' | 'SHORT_ENGINE' | 'BLOCKED';

export interface RouterDecision {
  engine: EngineSelection;
  reason: string;
  direction: 'long' | 'short';
}

/**
 * Route a trade proposal to the correct engine.
 * Returns which engine should handle the trade, or BLOCKED if neither should.
 */
export function routeTradeProposal(
  direction: 'long' | 'short',
  pair: string,
  agentId: string,
  config: ShortEngineConfig = DEFAULT_SHORT_ENGINE_CONFIG,
): RouterDecision {
  // ── Long trades always go to the long engine ──
  if (direction === 'long') {
    return {
      engine: 'LONG_ENGINE',
      reason: 'Long direction → Long Engine',
      direction: 'long',
    };
  }

  // ── Short trades: check if short engine is available ──

  // Global long-only mode override
  if (isLongOnlyEnabled()) {
    return {
      engine: 'BLOCKED',
      reason: 'Global Long-Only mode active — shorts blocked',
      direction: 'short',
    };
  }

  // Short engine disabled
  if (!config.enabled) {
    return {
      engine: 'BLOCKED',
      reason: 'Short engine is disabled',
      direction: 'short',
    };
  }

  // Pair not in enabled list
  const normalizedPair = pair.replace('/', '_');
  if (!config.enabledPairs.includes(normalizedPair)) {
    return {
      engine: 'BLOCKED',
      reason: `Pair ${pair} not in short-enabled pairs list`,
      direction: 'short',
    };
  }

  // Agent not in allowed list
  if (!config.allowedAgents.includes(agentId)) {
    return {
      engine: 'BLOCKED',
      reason: `Agent ${agentId} not authorized for short trading`,
      direction: 'short',
    };
  }

  // Session check
  const currentSession = detectLiquiditySession();
  const allowedSessions = config.allowedSessions[normalizedPair] ?? [];
  if (allowedSessions.length > 0 && !allowedSessions.includes(currentSession)) {
    return {
      engine: 'BLOCKED',
      reason: `Current session ${currentSession} not in allowed sessions for ${pair} shorts`,
      direction: 'short',
    };
  }

  // All checks passed → route to short engine
  return {
    engine: 'SHORT_ENGINE',
    reason: config.shadowOnly
      ? 'Short Engine (SHADOW MODE — no live execution)'
      : 'Short Engine (LIVE)',
    direction: 'short',
  };
}

/**
 * Validate that a router decision is consistent.
 * Used in tests to ensure the router cannot mix engines.
 */
export function validateRouterIntegrity(decision: RouterDecision): boolean {
  if (decision.direction === 'long' && decision.engine === 'SHORT_ENGINE') {
    console.error('[ROUTER INTEGRITY] VIOLATION: Long trade routed to Short Engine');
    return false;
  }
  if (decision.direction === 'short' && decision.engine === 'LONG_ENGINE') {
    console.error('[ROUTER INTEGRITY] VIOLATION: Short trade routed to Long Engine');
    return false;
  }
  return true;
}
