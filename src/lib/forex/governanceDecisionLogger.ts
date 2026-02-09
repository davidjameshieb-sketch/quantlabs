// Governance Decision Logger
// Structured, persistent decision logging for every governance evaluation.
//
// FIXES APPLIED:
// - Real spread/ATR/bid/ask in marketContextSnapshot (Fix #1)
// - Gate IDs stored for analytics stability (Fix #6)
// - shadowMode flag in every log entry (Fix #8)
// - Analytics counts gate IDs instead of parsing strings

import type { GovernanceMultipliers, GovernanceDecision, GateEntry, GateId } from './tradeGovernanceEngine';
import type { DirectionalBias, QuantLabsSignalSnapshot } from './quantlabsDirectionProvider';
import type { RiskLabel } from './discoveryRiskEngine';
import type { AdaptiveEdgeExplain, EnvironmentKey } from './environmentSignature';
import { supabase } from '@/integrations/supabase/client';

// ─── Decision Log Types ───

export type FinalDecision = 'BUY' | 'SELL' | 'SKIP';

export interface GovernanceDecisionLog {
  timestamp: number;
  symbol: string;
  timeframe: string;
  shadowMode: boolean;

  governance: {
    multipliers: GovernanceMultipliers;
    compositeScore: number;
    gatesTriggered: GateEntry[];
    governanceDecision: GovernanceDecision;
  };

  quantlabs: {
    directionalBias: DirectionalBias | null;
    directionalConfidence: number;
    signalSnapshot: QuantLabsSignalSnapshot | null;
    directionTimeframeUsed?: string;
    confirmationTimeframeUsed?: string;
  } | null;

  finalDecision: {
    decision: FinalDecision;
    reason: string;
  };

  marketContextSnapshot: {
    spread: number;
    bid: number;
    ask: number;
    slippageEstimate: number;
    totalFriction: number;
    atrValue: number;
    atrAvg: number;
    volatilityPhase: string;
    session: string;
    frictionRatio: number;
    mtfAlignmentScore: number;
    spreadStabilityRank: number;
    liquidityShockProb: number;
    priceDataAvailable: boolean;
    analysisAvailable: boolean;
  };

  discoveryRisk?: {
    environmentLabel: string;
    riskLabel: RiskLabel;
    positionMultiplier: number;
    blockedByDiscoveryRisk: boolean;
  };

  adaptiveEdgeExplain?: AdaptiveEdgeExplain;
  environmentKey?: EnvironmentKey;
}

// ─── In-Memory Decision Log Store ───

const MAX_LOG_ENTRIES = 1000;
let decisionLogs: GovernanceDecisionLog[] = [];

export function logGovernanceDecision(log: GovernanceDecisionLog): void {
  decisionLogs.push(log);

  if (decisionLogs.length > MAX_LOG_ENTRIES) {
    decisionLogs = decisionLogs.slice(-MAX_LOG_ENTRIES);
  }

  if (typeof queueMicrotask !== 'undefined') {
    queueMicrotask(() => {
      const gateIds = log.governance.gatesTriggered.map(g => g.id).join(',');
      console.log(
        `[GOV-LOG] ${log.symbol} | ${log.governance.governanceDecision} → ${log.finalDecision.decision} | composite=${log.governance.compositeScore.toFixed(3)} | gates=[${gateIds}] | shadow=${log.shadowMode}`,
      );
    });
  }
}

// ─── Query Interface ───

export function getDecisionLogs(): GovernanceDecisionLog[] {
  return decisionLogs;
}

export function getDecisionLogsBySymbol(symbol: string): GovernanceDecisionLog[] {
  return decisionLogs.filter(l => l.symbol === symbol);
}

export function getRecentDecisionLogs(count: number = 50): GovernanceDecisionLog[] {
  return decisionLogs.slice(-count);
}

export function clearDecisionLogs(): void {
  decisionLogs = [];
}

// ─── Shadow Evaluation Persistence ───

let _shadowPersistenceHealthy = true;

export function isShadowPersistenceHealthy(): boolean {
  return _shadowPersistenceHealthy;
}

export async function persistShadowEvaluation(log: GovernanceDecisionLog): Promise<void> {
  if (!log.shadowMode) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // No auth session — skip silently (background process)
      return;
    }

    const direction = log.finalDecision.decision === 'BUY' ? 'long'
      : log.finalDecision.decision === 'SELL' ? 'short' : 'long';

    const { error } = await supabase.from('oanda_orders').insert({
      user_id: session.user.id,
      signal_id: `shadow-${Date.now()}-${log.symbol}`,
      currency_pair: log.symbol.replace('/', '_').toUpperCase(),
      direction,
      units: 0,
      environment: 'shadow',
      status: 'shadow_eval',
      session_label: log.marketContextSnapshot.session,
      regime_label: log.marketContextSnapshot.volatilityPhase,
      gate_result: log.governance.governanceDecision,
      gate_reasons: log.governance.gatesTriggered.map(g => g.message),
      governance_composite: log.governance.compositeScore,
      governance_payload: {
        multipliers: log.governance.multipliers,
        quantlabs: log.quantlabs,
        finalDecision: log.finalDecision,
        discoveryRisk: log.discoveryRisk,
        adaptiveEdgeExplain: log.adaptiveEdgeExplain,
        environmentKey: log.environmentKey,
      } as any,
      confidence_score: log.quantlabs?.directionalConfidence
        ? Math.round(log.quantlabs.directionalConfidence * 100)
        : null,
      quantlabs_bias: log.quantlabs?.directionalBias || null,
      quantlabs_confidence: log.quantlabs?.directionalConfidence || null,
      direction_engine: 'shadow-eval',
      spread_at_entry: log.marketContextSnapshot.spread,
      agent_id: log.adaptiveEdgeExplain?.envKey?.split('|')[4] || null,
    });

    if (error) {
      console.warn('[GOV-LOG] Shadow persistence error:', error.message);
      _shadowPersistenceHealthy = false;
    } else {
      _shadowPersistenceHealthy = true;
    }
  } catch (err) {
    console.warn('[GOV-LOG] Shadow persistence failed:', (err as Error).message);
    _shadowPersistenceHealthy = false;
  }
}

// ─── Analytics Helpers (Fix #6: count by gate ID) ───

export interface DecisionAnalytics {
  totalEvaluations: number;
  approvedCount: number;
  rejectedCount: number;
  throttledCount: number;
  skipCount: number;
  buyCount: number;
  sellCount: number;
  avgCompositeScore: number;
  topGateIds: { id: GateId; count: number }[];
  topGateReasons: { reason: string; count: number }[];
  neutralBiasRate: number;
}

export function computeDecisionAnalytics(logs?: GovernanceDecisionLog[]): DecisionAnalytics {
  const source = logs || decisionLogs;
  if (source.length === 0) {
    return {
      totalEvaluations: 0, approvedCount: 0, rejectedCount: 0, throttledCount: 0,
      skipCount: 0, buyCount: 0, sellCount: 0, avgCompositeScore: 0,
      topGateIds: [], topGateReasons: [], neutralBiasRate: 0,
    };
  }

  const approved = source.filter(l => l.governance.governanceDecision === 'approved');
  const rejected = source.filter(l => l.governance.governanceDecision === 'rejected');
  const throttled = source.filter(l => l.governance.governanceDecision === 'throttled');
  const buys = source.filter(l => l.finalDecision.decision === 'BUY');
  const sells = source.filter(l => l.finalDecision.decision === 'SELL');
  const skips = source.filter(l => l.finalDecision.decision === 'SKIP');

  const avgComposite = source.reduce((s, l) => s + l.governance.compositeScore, 0) / source.length;

  // Gate ID frequency (Fix #6)
  const gateIdCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  for (const l of source) {
    for (const g of l.governance.gatesTriggered) {
      gateIdCounts[g.id] = (gateIdCounts[g.id] || 0) + 1;
      const key = g.message.split('—')[0].split('(')[0].trim();
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
  }

  const topGateIds = Object.entries(gateIdCounts)
    .map(([id, count]) => ({ id: id as GateId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topGateReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const neutralBiasRate = source.length > 0
    ? source.filter(l => l.quantlabs?.directionalBias === 'NEUTRAL').length / source.length
    : 0;

  return {
    totalEvaluations: source.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    throttledCount: throttled.length,
    skipCount: skips.length,
    buyCount: buys.length,
    sellCount: sells.length,
    avgCompositeScore: avgComposite,
    topGateIds,
    topGateReasons,
    neutralBiasRate,
  };
}
