// Forex Trade Intelligence Engine
// Generates forex-isolated trade data from the multi-agent ledger system

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
  'EUR/USD': 1.0380, 'GBP/USD': 1.2420, 'USD/JPY': 151.80, 'AUD/USD': 0.6280,
  'USD/CAD': 1.4420, 'NZD/USD': 0.5650, 'EUR/GBP': 0.8360, 'EUR/JPY': 157.50,
  'GBP/JPY': 188.60, 'AUD/JPY': 95.30, 'USD/CHF': 0.9060, 'EUR/CHF': 0.9400,
  'EUR/AUD': 1.6530, 'GBP/AUD': 1.9780, 'AUD/NZD': 1.1120, 'USD/SGD': 1.3560,
  'USD/HKD': 7.7850, 'USD/MXN': 20.45, 'USD/ZAR': 18.20, 'EUR/NZD': 1.8370,
  'GBP/NZD': 2.1980, 'GBP/CAD': 1.7910, 'EUR/CAD': 1.4970, 'AUD/CAD': 0.9060,
  'NZD/CAD': 0.8150, 'CHF/JPY': 167.60, 'CAD/JPY': 105.30, 'NZD/JPY': 85.80,
  'CAD/CHF': 0.6280, 'AUD/CHF': 0.5690,
};

/** Normalize symbol: 'AUDCAD' → 'AUD/CAD', already-slashed passes through */
function toDisplaySymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  if (symbol.length === 6) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  if (symbol.length === 7) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`; // e.g. USD/MXN length=7 only with slash
  return symbol;
}

function getRealisticPrice(symbol: string, rng: ForexRNG): number {
  const displaySymbol = toDisplaySymbol(symbol);
  // Prefer live OANDA mid-price when available
  const livePrice = getLivePrice(displaySymbol);
  if (livePrice) {
    // Small random deviation: ±0.3% to simulate recent price movement around live price
    const deviation = rng.range(-0.003, 0.003);
    return livePrice * (1 + deviation);
  }
  // Fallback to hardcoded base prices
  const base = FOREX_BASE_PRICES[displaySymbol];
  if (base) {
    const deviation = rng.range(-0.003, 0.003);
    return base * (1 + deviation);
  }
  // Last resort fallback for unknown pairs
  return displaySymbol.includes('JPY') ? rng.range(80, 195) : rng.range(0.55, 1.85);
}

// ─── Generate Forex Trades ───

export const generateForexTrades = (agents: Record<AgentId, AIAgent>): ForexTradeEntry[] => {
  const trades: ForexTradeEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < 120; i++) {
    const rng = new ForexRNG(hashStr(`forex-trade-${i}`));
    const pair = rng.pick(OANDA_PAIRS);
    const primaryAgentId = rng.pick(FOREX_PRIMARY_AGENTS);
    const primaryDef = AGENT_DEFINITIONS[primaryAgentId];

    const direction = rng.bool(0.52) ? 'long' as const : 'short' as const;
    const isAvoided = rng.bool(0.12);
    const isWin = !isAvoided && rng.bool(0.58);
    const pnl = isAvoided ? 0 : isWin ? rng.range(0.02, 0.85) : rng.range(-0.65, -0.01);

    const entryPrice = getRealisticPrice(pair.symbol, rng);
    const exitPrice = isAvoided ? undefined : entryPrice * (1 + pnl / 100);

    const regime: ForexRegime = rng.pick(['trending', 'ranging', 'high-volatility', 'low-liquidity']);
    const execMode: ExecutionMode = rng.pick(['signal-only', 'assisted-ready', 'auto-eligible']);
    const govStatus = rng.pick(['approved', 'throttled', 'restricted'] as const);

    // Supporting agents (2-4)
    const supportCount = rng.int(2, 5);
    const shuffled = FOREX_SUPPORT_AGENTS.sort(() => rng.next() - 0.5);
    const supportingAgents = shuffled.slice(0, supportCount).map(id => {
      const def = AGENT_DEFINITIONS[id];
      return { id, name: def.name, icon: def.icon, weight: rng.range(0.05, 0.35) };
    });

    const outcome: ForexTradeOutcome = isAvoided ? 'avoided' : isWin ? 'win' : 'loss';

    trades.push({
      id: `fx-${i}-${pair.symbol}`,
      currencyPair: pair.symbol,
      pairName: pair.name,
      direction,
      entryPrice,
      exitPrice,
      pnlPercent: pnl,
      tradeDuration: rng.int(15, 2880),
      primaryAgent: primaryAgentId,
      primaryAgentName: primaryDef.name,
      primaryAgentIcon: primaryDef.icon,
      governanceStatus: govStatus,
      confidenceScore: rng.range(35, 92),
      riskScore: rng.range(15, 75),
      timestamp: now - rng.int(60000, 90 * 86400000),
      outcome,
      executionMode: execMode,
      regime,
      oandaCompatible: true,
      riskCompliant: govStatus !== 'restricted',
      spreadCondition: rng.pick(['tight', 'normal', 'wide'] as const),
      supportingAgents,
      drawdown: rng.range(0.1, 5.5),
      marketRegime: regime,
    });
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
};

// ─── Filter Trades ───

export const filterForexTrades = (
  trades: ForexTradeEntry[],
  filters: ForexDashboardFilters
): ForexTradeEntry[] => {
  const now = Date.now();
  return trades.filter(t => {
    // Period filter
    if (filters.period !== 'inception') {
      const cutoff = filters.period === '5d' ? 5 * 86400000
        : filters.period === '30d' ? 30 * 86400000
        : filters.period === '90d' ? 90 * 86400000
        : 365 * 86400000; // ytd approximation
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
    riskRewardRatio: grossLoss > 0 ? (grossProfit / wins.length) / (grossLoss / losses.length) : 0,
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
