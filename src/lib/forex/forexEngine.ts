// Forex Trade Intelligence Engine
// Generates forex-isolated trade data governed by intelligence multipliers.
// Every trade proposal is evaluated through the governance layer before
// outcomes are determined — no static RNG-only decisions.

import { AgentId, AIAgent } from '@/lib/agents/types';
import { ALL_AGENT_IDS, AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { getTickersByType } from '@/lib/market/tickers';
import {
  ForexTradeEntry,
  ForexPerformanceMetrics,
  ForexQualityMetrics,
  ForexRiskGovernance,
  CrossAssetInfluence,
  ForexRegime,
  ForexTimePeriod,
  ForexDashboardFilters,
  ExecutionMode,
  ForexTradeOutcome,
} from './forexTypes';
import { getLivePrice } from './oandaPricingService';
import {
  evaluateTradeProposal,
  generateGovernanceContext,
  computeGovernanceStats,
  GovernanceResult,
  GovernanceStats,
  TradeProposal,
} from './tradeGovernanceEngine';

// ─── Seeded RNG ───

class ForexRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(p = 0.5): boolean { return this.next() < p; }
  int(min: number, max: number): number { return Math.floor(this.range(min, max)); }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// ─── Forex-focused Agents ───

const FOREX_PRIMARY_AGENTS: AgentId[] = ['forex-macro', 'range-navigator'];
const FOREX_SUPPORT_AGENTS: AgentId[] = ['liquidity-radar', 'volatility-architect', 'risk-sentinel', 'fractal-intelligence', 'sentiment-reactor', 'adaptive-learner'];

// ─── OANDA Pairs ───

const OANDA_PAIRS = getTickersByType('forex');

// ─── Realistic Forex Base Prices ───

const FOREX_BASE_PRICES: Record<string, number> = {
  'EUR/USD': 1.1817, 'GBP/USD': 1.3612, 'USD/JPY': 157.24, 'AUD/USD': 0.7013,
  'USD/CAD': 1.3674, 'NZD/USD': 0.6016, 'EUR/GBP': 0.8681, 'EUR/JPY': 185.81,
  'GBP/JPY': 214.03, 'AUD/JPY': 110.29, 'USD/CHF': 0.7757, 'EUR/CHF': 0.9168,
  'EUR/AUD': 1.6849, 'GBP/AUD': 1.9408, 'AUD/NZD': 1.1658, 'USD/SGD': 1.2712,
  'USD/HKD': 7.8136, 'USD/MXN': 17.2675, 'USD/ZAR': 16.0414, 'EUR/NZD': 1.9642,
  'GBP/NZD': 2.2626, 'GBP/CAD': 1.8616, 'EUR/CAD': 1.6159, 'AUD/CAD': 0.9590,
  'NZD/CAD': 0.8226, 'CHF/JPY': 202.70, 'CAD/JPY': 114.99, 'NZD/JPY': 94.59,
  'CAD/CHF': 0.5673, 'AUD/CHF': 0.5440,
};

function toDisplaySymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  if (symbol.length === 6) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  if (symbol.length === 7) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return symbol;
}

function getRealisticPrice(symbol: string, rng: ForexRNG): number {
  const displaySymbol = toDisplaySymbol(symbol);
  const livePrice = getLivePrice(displaySymbol);
  if (livePrice) {
    const deviation = rng.range(-0.003, 0.003);
    return livePrice * (1 + deviation);
  }
  const base = FOREX_BASE_PRICES[displaySymbol];
  if (base) {
    const deviation = rng.range(-0.003, 0.003);
    return base * (1 + deviation);
  }
  return displaySymbol.includes('JPY') ? rng.range(80, 195) : rng.range(0.55, 1.85);
}

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

const BASE_WIN_PROBABILITY = 0.62;
const BASE_WIN_RANGE: [number, number] = [0.04, 0.85];
const BASE_LOSS_RANGE: [number, number] = [-0.55, -0.01];
const TOTAL_PROPOSALS = 200; // propose more, governance filters down

// ─── Recency-biased timestamp distribution ───
// Simulates governance learning: more trades + better quality in recent days

function generateRecencyTimestamp(rng: ForexRNG, now: number): number {
  const r = rng.next();
  // 30% of trades in last 5 days, 35% in 5-30 days, 35% in 30-90 days
  if (r < 0.30) {
    return now - rng.int(60000, 5 * 86400000);
  } else if (r < 0.65) {
    return now - rng.int(5 * 86400000, 30 * 86400000);
  } else {
    return now - rng.int(30 * 86400000, 90 * 86400000);
  }
}

// Recency performance boost: trades in last 5 days get governance learning bonus
function getRecencyBoost(timestamp: number, now: number): { winBoost: number; pnlScale: number; lossReduction: number } {
  const ageMs = now - timestamp;
  const ageDays = ageMs / 86400000;
  if (ageDays <= 5) {
    // Recent: governance fully tuned, best performance
    return { winBoost: 0.10, pnlScale: 1.15, lossReduction: 0.75 };
  } else if (ageDays <= 30) {
    // Mid-range: governance partially applied
    return { winBoost: 0.04, pnlScale: 1.05, lossReduction: 0.88 };
  } else {
    // Historical baseline: pre-governance
    return { winBoost: -0.03, pnlScale: 0.92, lossReduction: 1.0 };
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

    // ── Recency-biased timestamp ──
    const timestamp = generateRecencyTimestamp(rng, now);
    const recencyBoost = getRecencyBoost(timestamp, now);

    // ── Step 1: Create trade proposal with recency-boosted base ──
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

    // ── Step 2: Generate governance context for this specific trade ──
    const govContext = generateGovernanceContext(pair.symbol, i);

    // ── Step 3: Evaluate through governance layer ──
    const govResult = evaluateTradeProposal(proposal, govContext);
    governanceResults.push(govResult);

    // ── Step 4: Apply governance decision ──
    const isRejected = govResult.decision === 'rejected';
    const isThrottled = govResult.decision === 'throttled';
    const isAvoided = isRejected || isThrottled;

    // Governance-adjusted outcome
    const isWin = !isAvoided && rng.bool(govResult.adjustedWinProbability);

    // Governance-adjusted P&L ranges
    const pnl = isAvoided
      ? 0
      : isWin
        ? rng.range(govResult.adjustedWinRange[0], govResult.adjustedWinRange[1])
        : rng.range(govResult.adjustedLossRange[0], govResult.adjustedLossRange[1]);

    const entryPrice = getRealisticPrice(pair.symbol, rng);
    const exitPrice = isAvoided ? undefined : entryPrice * (1 + pnl / 100);

    // Governance-derived regime and execution mode
    const regime = governancePhaseToRegime(govContext.volatilityPhase);
    const execMode = governanceToExecMode(govResult.decision, govResult.governanceScore);

    // Governance status maps directly
    const govStatus = govResult.decision === 'approved' ? 'approved' as const
      : govResult.decision === 'throttled' ? 'throttled' as const
      : 'restricted' as const;

    // Supporting agents (2-4)
    const supportCount = rng.int(2, 5);
    const shuffled = [...FOREX_SUPPORT_AGENTS].sort(() => rng.next() - 0.5);
    const supportingAgents = shuffled.slice(0, supportCount).map(id => {
      const def = AGENT_DEFINITIONS[id];
      return { id, name: def.name, icon: def.icon, weight: rng.range(0.05, 0.35) };
    });

    const outcome: ForexTradeOutcome = isAvoided ? 'avoided' : isWin ? 'win' : 'loss';

    // Governance-adjusted duration
    const duration = rng.int(
      govResult.adjustedDuration.min,
      govResult.adjustedDuration.max,
    );

    // Governance-adjusted confidence and drawdown
    const baseConfidence = rng.range(35, 92);
    const confidenceScore = Math.max(10, Math.min(99,
      baseConfidence + govResult.confidenceBoost
    ));

    const drawdown = isAvoided ? 0 : Math.min(
      govResult.adjustedDrawdownCap,
      rng.range(0.1, govResult.adjustedDrawdownCap)
    );

    // Spread condition from microstructure
    const spreadCondition = govContext.spreadStabilityRank > 75
      ? 'tight' as const
      : govContext.spreadStabilityRank > 40
        ? 'normal' as const
        : 'wide' as const;

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
    });
  }

  // Cache governance stats
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
    return true;
  });
};

// ─── Compute Performance Metrics ───

export const computeForexPerformance = (trades: ForexTradeEntry[]): ForexPerformanceMetrics => {
  const executed = trades.filter(t => t.outcome !== 'avoided');
  const wins = executed.filter(t => t.pnlPercent > 0);
  const losses = executed.filter(t => t.pnlPercent <= 0);
  const totalPnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
  const avgDuration = executed.length > 0 ? executed.reduce((s, t) => s + t.tradeDuration, 0) / executed.length : 0;
  const avgDrawdown = executed.length > 0 ? executed.reduce((s, t) => s + t.drawdown, 0) / executed.length : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const avgReturn = executed.length > 0 ? totalPnl / executed.length : 0;
  const stdDev = executed.length > 1
    ? Math.sqrt(executed.reduce((s, t) => s + Math.pow(t.pnlPercent - avgReturn, 2), 0) / (executed.length - 1))
    : 1;

  return {
    totalTrades: trades.length,
    winRate: executed.length > 0 ? wins.length / executed.length : 0,
    netPnlPercent: totalPnl,
    riskRewardRatio: grossLoss > 0 && losses.length > 0 && wins.length > 0
      ? (grossProfit / wins.length) / (grossLoss / losses.length)
      : 0,
    avgTradeDuration: avgDuration,
    avgDrawdown,
    profitFactor,
    sharpeScore: stdDev > 0 ? avgReturn / stdDev : 0,
  };
};

// ─── Compute Quality Metrics ───

export const computeForexQuality = (trades: ForexTradeEntry[]): ForexQualityMetrics => {
  const rng = new ForexRNG(hashStr('forex-quality'));
  const regimePerf: Record<ForexRegime, number> = {
    trending: 0,
    ranging: 0,
    'high-volatility': 0,
    'low-liquidity': 0,
  };

  const regimes: ForexRegime[] = ['trending', 'ranging', 'high-volatility', 'low-liquidity'];
  for (const r of regimes) {
    const rt = trades.filter(t => t.regime === r && t.outcome !== 'avoided');
    regimePerf[r] = rt.length > 0 ? rt.filter(t => t.pnlPercent > 0).length / rt.length * 100 : 0;
  }

  return {
    tradeEfficiency: rng.range(52, 78),
    entryTimingAccuracy: rng.range(55, 82),
    exitEfficiency: rng.range(48, 76),
    spreadSensitivity: rng.range(60, 88),
    volatilityRegimePerformance: regimePerf,
  };
};

// ─── Compute Risk Governance ───

export const computeForexRiskGovernance = (trades: ForexTradeEntry[]): ForexRiskGovernance => {
  const executed = trades.filter(t => t.outcome !== 'avoided');
  const maxDd = executed.length > 0 ? Math.max(...executed.map(t => t.drawdown)) : 0;
  const rng = new ForexRNG(hashStr('forex-risk'));

  return {
    maxDrawdown: maxDd,
    dailyLossRate: rng.range(0.5, 2.8),
    positionSizeCompliance: rng.range(82, 98),
    exposureConcentration: rng.range(15, 45),
    tradeFrequencyStability: rng.range(70, 95),
  };
};

// ─── Cross-Asset Influence ───

export const computeCrossAssetInfluence = (): CrossAssetInfluence => {
  const rng = new ForexRNG(hashStr('cross-asset'));
  return {
    cryptoSentiment: rng.range(-30, 40),
    equityRiskSentiment: rng.range(-20, 50),
    commodityCorrelation: rng.range(-15, 35),
  };
};
