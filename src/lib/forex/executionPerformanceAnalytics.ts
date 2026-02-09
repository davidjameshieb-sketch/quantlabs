// Execution Performance Analytics — Read-Only
// Computes trading KPIs from EXECUTED trades only (not decision logs).
// Separates "decision metrics" from "execution metrics" per spec.

import type { GovernanceDecisionLog } from './governanceDecisionLogger';
import { getDecisionLogs } from './governanceDecisionLogger';
import type { ForexTradeEntry } from './forexTypes';
import type { LiquiditySession } from './microstructureEngine';

// ─── Types ───

export interface ExecutionPerformanceMetrics {
  totalTrades: number;
  winRate: number;
  expectancy: number;         // avg pips per trade
  profitFactor: number;       // gross profit / gross loss
  avgWinPips: number;
  avgLossPips: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  maxDrawdownPct: number;
  sharpeEstimate: number;
}

export interface SessionPerformanceBreakdown {
  session: string;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
}

export interface RegimePerformanceBreakdown {
  regime: string;
  trades: number;
  winRate: number;
  expectancy: number;
}

export interface CompositeDecilePerformance {
  decileRange: string;
  decileMin: number;
  decileMax: number;
  count: number;
  winRate: number;
  avgExpectancy: number;
  avgPnl: number;
  avgMAE: number;
  avgMFE: number;
}

export interface ExecutionAnalyticsReport {
  overall: ExecutionPerformanceMetrics;
  bySession: SessionPerformanceBreakdown[];
  byRegime: RegimePerformanceBreakdown[];
  byCompositeDecile: CompositeDecilePerformance[];
  bySymbol: { symbol: string; trades: number; winRate: number; pnl: number }[];
  byDirection: { direction: string; trades: number; winRate: number; pnl: number }[];
  maeStats: { avg: number; median: number; p90: number };
  mfeStats: { avg: number; median: number; p90: number };
}

// ─── Helpers ───

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStreaks(outcomes: boolean[]): { maxWins: number; maxLosses: number } {
  let maxWins = 0, maxLosses = 0, wins = 0, losses = 0;
  for (const isWin of outcomes) {
    if (isWin) { wins++; losses = 0; maxWins = Math.max(maxWins, wins); }
    else { losses++; wins = 0; maxLosses = Math.max(maxLosses, losses); }
  }
  return { maxWins, maxLosses };
}

function computeMetrics(trades: ForexTradeEntry[]): ExecutionPerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, expectancy: 0, profitFactor: 0,
      avgWinPips: 0, avgLossPips: 0, maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0, maxDrawdownPct: 0, sharpeEstimate: 0,
    };
  }

  const wins = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');

  const grossProfit = wins.reduce((s, t) => s + Math.abs(t.pnlPercent), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnlPercent), 0);

  const pnls = trades.map(t => t.pnlPercent);
  const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const stdDev = pnls.length > 1
    ? Math.sqrt(pnls.reduce((s, p) => s + (p - avgPnl) ** 2, 0) / (pnls.length - 1))
    : 0;

  // Max drawdown from cumulative PnL
  let peak = 0, maxDD = 0, running = 0;
  for (const pnl of pnls) {
    running += pnl;
    peak = Math.max(peak, running);
    maxDD = Math.max(maxDD, peak - running);
  }

  const streaks = computeStreaks(trades.map(t => t.outcome === 'win'));

  return {
    totalTrades: trades.length,
    winRate: wins.length / trades.length,
    expectancy: avgPnl,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgWinPips: wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0,
    avgLossPips: losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / losses.length : 0,
    maxConsecutiveWins: streaks.maxWins,
    maxConsecutiveLosses: streaks.maxLosses,
    maxDrawdownPct: maxDD,
    sharpeEstimate: stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(252) : 0,
  };
}

// ─── Main Analytics ───

export function computeExecutionAnalytics(
  trades: ForexTradeEntry[],
  decisionLogs?: GovernanceDecisionLog[],
): ExecutionAnalyticsReport {
  // Filter to executed trades only (not "avoided")
  const executed = trades.filter(t => t.outcome !== 'avoided');

  const overall = computeMetrics(executed);

  // By session — derive from trade regime/timing
  const sessionMap = new Map<string, ForexTradeEntry[]>();
  for (const t of executed) {
    // Use marketRegime as session proxy if available
    const session = t.marketRegime || 'unknown';
    if (!sessionMap.has(session)) sessionMap.set(session, []);
    sessionMap.get(session)!.push(t);
  }
  const bySession = Array.from(sessionMap.entries()).map(([session, sTrades]) => {
    const m = computeMetrics(sTrades);
    return { session, trades: sTrades.length, winRate: m.winRate, expectancy: m.expectancy, profitFactor: m.profitFactor };
  });

  // By regime
  const regimeMap = new Map<string, ForexTradeEntry[]>();
  for (const t of executed) {
    if (!regimeMap.has(t.regime)) regimeMap.set(t.regime, []);
    regimeMap.get(t.regime)!.push(t);
  }
  const byRegime = Array.from(regimeMap.entries()).map(([regime, rTrades]) => {
    const m = computeMetrics(rTrades);
    return { regime, trades: rTrades.length, winRate: m.winRate, expectancy: m.expectancy };
  });

  // By symbol
  const symbolMap = new Map<string, ForexTradeEntry[]>();
  for (const t of executed) {
    if (!symbolMap.has(t.currencyPair)) symbolMap.set(t.currencyPair, []);
    symbolMap.get(t.currencyPair)!.push(t);
  }
  const bySymbol = Array.from(symbolMap.entries()).map(([symbol, sTrades]) => ({
    symbol,
    trades: sTrades.length,
    winRate: sTrades.filter(t => t.outcome === 'win').length / sTrades.length,
    pnl: sTrades.reduce((s, t) => s + t.pnlPercent, 0),
  })).sort((a, b) => b.pnl - a.pnl);

  // By direction
  const byDirection = ['long', 'short'].map(dir => {
    const dTrades = executed.filter(t => t.direction === dir);
    return {
      direction: dir,
      trades: dTrades.length,
      winRate: dTrades.length > 0 ? dTrades.filter(t => t.outcome === 'win').length / dTrades.length : 0,
      pnl: dTrades.reduce((s, t) => s + t.pnlPercent, 0),
    };
  });

  // MAE/MFE stats
  const maes = executed.map(t => t.mae).filter(v => v > 0);
  const mfes = executed.map(t => t.mfe).filter(v => v > 0);
  const maeStats = { avg: avg(maes), median: percentile(maes, 50), p90: percentile(maes, 90) };
  const mfeStats = { avg: avg(mfes), median: percentile(mfes, 50), p90: percentile(mfes, 90) };

  // Composite decile correlation — match executed trades to decision logs
  const logs = decisionLogs || getDecisionLogs();
  const byCompositeDecile = computeExecutedCompositeDeciles(executed, logs);

  return {
    overall,
    bySession,
    byRegime,
    byCompositeDecile,
    bySymbol,
    byDirection,
    maeStats,
    mfeStats,
  };
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Composite Decile Correlation (Executed Trades Only) ───

function computeExecutedCompositeDeciles(
  trades: ForexTradeEntry[],
  logs: GovernanceDecisionLog[],
): CompositeDecilePerformance[] {
  // Match trades to their governance decision logs by symbol + timestamp proximity
  interface MatchedTrade {
    trade: ForexTradeEntry;
    compositeScore: number;
  }

  const matched: MatchedTrade[] = [];
  for (const trade of trades) {
    // Find the closest approved log for this symbol within 60s
    const candidateLogs = logs.filter(l =>
      l.governance.governanceDecision === 'approved' &&
      l.symbol.replace('/', '_').includes(trade.currencyPair.replace('/', '_').slice(0, 3)) &&
      Math.abs(l.timestamp - trade.timestamp) < 60_000,
    );
    if (candidateLogs.length > 0) {
      // Pick closest by timestamp
      candidateLogs.sort((a, b) =>
        Math.abs(a.timestamp - trade.timestamp) - Math.abs(b.timestamp - trade.timestamp),
      );
      matched.push({ trade, compositeScore: candidateLogs[0].governance.compositeScore });
    }
  }

  if (matched.length < 10) return [];

  // Sort by composite score and split into deciles
  matched.sort((a, b) => a.compositeScore - b.compositeScore);
  const decileSize = Math.max(1, Math.floor(matched.length / 10));
  const deciles: CompositeDecilePerformance[] = [];

  for (let i = 0; i < 10; i++) {
    const start = i * decileSize;
    const end = i === 9 ? matched.length : start + decileSize;
    const slice = matched.slice(start, end);
    if (slice.length === 0) continue;

    const wins = slice.filter(m => m.trade.outcome === 'win');
    deciles.push({
      decileRange: `${slice[0].compositeScore.toFixed(2)}–${slice[slice.length - 1].compositeScore.toFixed(2)}`,
      decileMin: slice[0].compositeScore,
      decileMax: slice[slice.length - 1].compositeScore,
      count: slice.length,
      winRate: wins.length / slice.length,
      avgExpectancy: avg(slice.map(m => m.trade.netExpectancy)),
      avgPnl: avg(slice.map(m => m.trade.pnlPercent)),
      avgMAE: avg(slice.map(m => m.trade.mae)),
      avgMFE: avg(slice.map(m => m.trade.mfe)),
    });
  }

  return deciles;
}
