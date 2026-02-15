// Forex Trade Intelligence Engine
// Generates forex-isolated trade data governed by intelligence multipliers.
// Refactored: RNG, pricing, and metrics extracted to dedicated modules.

import { AgentId, AIAgent } from '@/lib/agents/types';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { getTickersByType } from '@/lib/market/tickers';
import {
  ForexTradeEntry,
  ForexRegime,
  ForexDashboardFilters,
  ExecutionMode,
  ForexTradeOutcome,
} from './forexTypes';
import { ForexRNG, hashStr } from './forexRng';
import { getRealisticPrice } from './forexPricing';
import {
  evaluateTradeProposal,
  computeGovernanceStats,
  GovernanceResult,
  GovernanceStats,
  TradeProposal,
} from './tradeGovernanceEngine';
import { getGovernanceContextCached } from './governanceContextProvider';

// Re-export metrics from dedicated module
export {
  computeForexPerformance,
  computeForexQuality,
  computeForexRiskGovernance,
  computeCrossAssetInfluence,
} from './forexMetrics';

// ─── Forex-focused Agents ───

const FOREX_PRIMARY_AGENTS: AgentId[] = ['forex-macro', 'range-navigator'];
const FOREX_SUPPORT_AGENTS: AgentId[] = ['liquidity-radar', 'volatility-architect', 'risk-sentinel', 'fractal-intelligence', 'sentiment-reactor', 'adaptive-learner'];

// ─── OANDA Pairs ───

const OANDA_PAIRS = getTickersByType('forex');

// ─── Regime from governance volatility phase ───

function governancePhaseToRegime(phase: string): ForexRegime {
  switch (phase) {
    case 'ignition': return 'trending';
    case 'expansion': return 'trending';
    case 'compression': return 'ranging';
    case 'exhaustion': return 'high-volatility';
    default: return 'ranging';
  }
}

// ─── Governance-Mapped Execution Mode ───

function governanceToExecMode(decision: string, score: number): ExecutionMode {
  if (decision === 'rejected') return 'signal-only';
  if (score > 75) return 'auto-eligible';
  if (score > 50) return 'assisted-ready';
  return 'signal-only';
}

// ─── Base trade parameters ───

const BASE_WIN_PROBABILITY = 0.72;
const BASE_WIN_RANGE: [number, number] = [0.06, 0.65];
const BASE_LOSS_RANGE: [number, number] = [-0.12, -0.005];
const TOTAL_PROPOSALS = 500;

// ─── Recency-biased timestamp distribution ───

function generateRecencyTimestamp(rng: ForexRNG, now: number): number {
  const r = rng.next();
  if (r < 0.45) {
    return now - rng.int(60000, 5 * 86400000);
  } else if (r < 0.75) {
    return now - rng.int(5 * 86400000, 30 * 86400000);
  } else {
    return now - rng.int(30 * 86400000, 90 * 86400000);
  }
}

function getRecencyBoost(timestamp: number, now: number): { winBoost: number; pnlScale: number; lossReduction: number } {
  const ageMs = now - timestamp;
  const ageDays = ageMs / 86400000;
  if (ageDays <= 5) {
    return { winBoost: 0.08, pnlScale: 1.35, lossReduction: 0.45 };
  } else if (ageDays <= 30) {
    return { winBoost: 0.03, pnlScale: 1.15, lossReduction: 0.70 };
  } else {
    return { winBoost: -0.05, pnlScale: 0.85, lossReduction: 1.0 };
  }
}

// ─── Last governance report (module-level cache) ───

let _lastGovernanceStats: GovernanceStats | null = null;
let _lastGovernanceResults: GovernanceResult[] = [];

export const getLastGovernanceStats = (): GovernanceStats | null => _lastGovernanceStats;
export const getLastGovernanceResults = (): GovernanceResult[] => _lastGovernanceResults;

// ─── Generate Forex Trades (Intelligence-Governed) ───

export const generateForexTrades = (agents: Record<AgentId, AIAgent>): ForexTradeEntry[] => {
  const trades: ForexTradeEntry[] = [];
  const governanceResults: GovernanceResult[] = [];
  const now = Date.now();

  for (let i = 0; i < TOTAL_PROPOSALS; i++) {
    const rng = new ForexRNG(hashStr(`forex-trade-${i}`));
    const pair = rng.pick(OANDA_PAIRS);
    const primaryAgentId = rng.pick(FOREX_PRIMARY_AGENTS);
    const primaryDef = AGENT_DEFINITIONS[primaryAgentId];
    const direction = rng.bool(0.52) ? 'long' as const : 'short' as const;

    const timestamp = generateRecencyTimestamp(rng, now);
    const recencyBoost = getRecencyBoost(timestamp, now);

    const proposal: TradeProposal = {
      index: i,
      pair: pair.symbol,
      direction,
      baseWinProbability: BASE_WIN_PROBABILITY + recencyBoost.winBoost,
      baseWinRange: [
        BASE_WIN_RANGE[0] * recencyBoost.pnlScale,
        BASE_WIN_RANGE[1] * recencyBoost.pnlScale,
      ],
      baseLossRange: [
        BASE_LOSS_RANGE[0] * recencyBoost.lossReduction,
        BASE_LOSS_RANGE[1] * recencyBoost.lossReduction,
      ],
    };

    const govContext = getGovernanceContextCached(pair.symbol, '15m');
    const govResult = evaluateTradeProposal(proposal, govContext);
    governanceResults.push(govResult);

    const isRejected = govResult.decision === 'rejected';
    const isThrottled = govResult.decision === 'throttled';
    const isAvoided = isRejected || isThrottled;

    const isWin = !isAvoided && rng.bool(govResult.adjustedWinProbability);

    const pnl = isAvoided
      ? 0
      : isWin
        ? rng.range(govResult.adjustedWinRange[0], govResult.adjustedWinRange[1])
        : rng.range(govResult.adjustedLossRange[0], govResult.adjustedLossRange[1]);

    const entryPrice = getRealisticPrice(pair.symbol, rng);
    const exitPrice = isAvoided ? undefined : entryPrice * (1 + pnl / 100);

    const regime = governancePhaseToRegime(govContext.volatilityPhase);
    const execMode = governanceToExecMode(govResult.decision, govResult.governanceScore);

    const govStatus = govResult.decision === 'approved' ? 'approved' as const
      : govResult.decision === 'throttled' ? 'throttled' as const
      : 'restricted' as const;

    const supportCount = rng.int(2, 5);
    const shuffled = [...FOREX_SUPPORT_AGENTS].sort(() => rng.next() - 0.5);
    const supportingAgents = shuffled.slice(0, supportCount).map(id => {
      const def = AGENT_DEFINITIONS[id];
      return { id, name: def.name, icon: def.icon, weight: rng.range(0.05, 0.35) };
    });

    const outcome: ForexTradeOutcome = isAvoided ? 'avoided' : isWin ? 'win' : 'loss';

    const duration = rng.int(
      govResult.adjustedDuration.min,
      govResult.adjustedDuration.max,
    );

    const baseConfidence = rng.range(35, 92);
    const confidenceScore = Math.max(10, Math.min(99,
      baseConfidence + govResult.confidenceBoost
    ));

    const drawdown = isAvoided ? 0 : Math.min(
      govResult.adjustedDrawdownCap,
      rng.range(0.1, govResult.adjustedDrawdownCap)
    );

    const spreadCondition = govContext.spreadStabilityRank > 75
      ? 'tight' as const
      : govContext.spreadStabilityRank > 40
        ? 'normal' as const
        : 'wide' as const;

    const absPnl = Math.abs(pnl);
    const mfe = isAvoided ? 0 : isWin
      ? absPnl + rng.range(0.01, absPnl * 0.6)
      : rng.range(0.005, 0.08);
    const mae = isAvoided ? 0 : isWin
      ? rng.range(0.002, absPnl * 0.3)
      : absPnl + rng.range(0.01, absPnl * 0.4);
    const tradeCapture = mfe > 0 ? Math.min(1, Math.max(0, pnl / mfe)) : 0;
    const giveBack = mfe > 0 && isWin ? Math.max(0, (1 - tradeCapture) * 100) : 0;
    const tradeFriction = (1 - govContext.spreadStabilityRank / 100) * rng.range(0.005, 0.025);
    const tradeNetExpectancy = pnl - tradeFriction;

    trades.push({
      id: `fx-${i}-${pair.symbol}`,
      currencyPair: pair.symbol,
      pairName: pair.name,
      direction,
      entryPrice,
      exitPrice,
      pnlPercent: pnl,
      tradeDuration: duration,
      primaryAgent: primaryAgentId,
      primaryAgentName: primaryDef.name,
      primaryAgentIcon: primaryDef.icon,
      governanceStatus: govStatus,
      confidenceScore,
      riskScore: rng.range(15, 75),
      timestamp,
      outcome,
      executionMode: execMode,
      regime,
      oandaCompatible: true,
      riskCompliant: govStatus !== 'restricted',
      spreadCondition,
      supportingAgents,
      drawdown,
      marketRegime: regime,
      mfe,
      mae,
      giveBackPct: giveBack,
      captureRatio: tradeCapture,
      netExpectancy: tradeNetExpectancy,
      frictionCost: tradeFriction,
    });
  }

  _lastGovernanceResults = governanceResults;
  _lastGovernanceStats = computeGovernanceStats(governanceResults);

  return trades.sort((a, b) => b.timestamp - a.timestamp);
};

// ─── Filter Trades ───

export const filterForexTrades = (
  trades: ForexTradeEntry[],
  filters: ForexDashboardFilters
): ForexTradeEntry[] => {
  const now = Date.now();
  return trades.filter(t => {
    if (filters.period !== 'inception') {
      const cutoff = filters.period === '5d' ? 5 * 86400000
        : filters.period === '30d' ? 30 * 86400000
        : filters.period === '90d' ? 90 * 86400000
        : 365 * 86400000;
      if (now - t.timestamp > cutoff) return false;
    }
    if (filters.outcome !== 'all' && t.outcome !== filters.outcome) return false;
    if (filters.regime !== 'all' && t.regime !== filters.regime) return false;
    if (filters.pair !== 'all' && t.currencyPair !== filters.pair) return false;
    if (filters.agent !== 'all' && t.primaryAgent !== filters.agent) return false;
    if (filters.direction && filters.direction !== 'all' && t.direction !== filters.direction) return false;
    return true;
  });
};
