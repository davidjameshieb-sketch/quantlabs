// Deep trade analytics from real oanda_orders data
// Per-pair P&L, session heatmaps, rolling Sharpe ratio

import { useMemo } from 'react';
import { RealOrder, RealExecutionMetrics } from './useOandaPerformance';

// ─── Types ───────────────────────────────────────────────────────────

export interface PairAnalytics {
  pair: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnlPips: number;
  avgPnlPips: number;
  avgSlippage: number;
  avgQuality: number;
  avgDurationMin: number;
  profitFactor: number;
  bestTradePips: number;
  worstTradePips: number;
}

export type SessionLabel = 'London' | 'New York' | 'Tokyo' | 'Sydney' | 'Off-Hours';

export interface SessionAnalytics {
  session: SessionLabel;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnlPips: number;
  avgPnlPips: number;
  avgQuality: number;
  avgSlippage: number;
}

export interface SharpePoint {
  date: string; // YYYY-MM-DD
  sharpe: number;
  tradeCount: number;
  cumPnlPips: number;
}

export interface TradeAnalyticsResult {
  pairAnalytics: PairAnalytics[];
  sessionAnalytics: SessionAnalytics[];
  rollingSharpe: SharpePoint[];
  overallSharpe: number;
  totalClosedTrades: number;
  totalPnlPips: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

function computePnlPips(order: RealOrder): number {
  if (order.entry_price == null || order.exit_price == null) return 0;
  const mult = getPipMultiplier(order.currency_pair);
  const raw = order.direction === 'long'
    ? (order.exit_price - order.entry_price) * mult
    : (order.entry_price - order.exit_price) * mult;
  return Math.round(raw * 10) / 10;
}

function getSessionFromHour(hour: number): SessionLabel {
  // UTC hours for major sessions
  if (hour >= 0 && hour < 7) return 'Tokyo';      // 00:00 - 07:00 UTC
  if (hour >= 7 && hour < 8) return 'Sydney';      // overlap / Sydney close
  if (hour >= 8 && hour < 13) return 'London';     // 08:00 - 13:00 UTC
  if (hour >= 13 && hour < 17) return 'New York';  // 13:00 - 17:00 UTC (overlap + NY)
  if (hour >= 17 && hour < 22) return 'New York';  // NY afternoon
  return 'Off-Hours';                               // 22:00 - 00:00 UTC gap
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualize: assume ~252 trading days, but we use per-trade Sharpe
  return (mean / std) * Math.sqrt(Math.min(returns.length, 252));
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useTradeAnalytics(metrics: RealExecutionMetrics | null): TradeAnalyticsResult {
  return useMemo(() => {
    const empty: TradeAnalyticsResult = {
      pairAnalytics: [],
      sessionAnalytics: [],
      rollingSharpe: [],
      overallSharpe: 0,
      totalClosedTrades: 0,
      totalPnlPips: 0,
    };

    if (!metrics?.hasData) return empty;

    // Only closed trades with both entry and exit
    const closed = metrics.recentOrders.filter(
      o => (o.status === 'filled' || o.status === 'closed') &&
           o.entry_price != null && o.exit_price != null
    );

    if (closed.length === 0) return empty;

    // ─── Per-Pair P&L ──────────────────────────────────────────────
    const pairMap = new Map<string, RealOrder[]>();
    for (const o of closed) {
      const arr = pairMap.get(o.currency_pair) || [];
      arr.push(o);
      pairMap.set(o.currency_pair, arr);
    }

    const pairAnalytics: PairAnalytics[] = Array.from(pairMap.entries()).map(([pair, orders]) => {
      const pips = orders.map(computePnlPips);
      const wins = pips.filter(p => p > 0);
      const losses = pips.filter(p => p <= 0);
      const grossProfit = wins.reduce((s, p) => s + p, 0);
      const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
      const netPnl = pips.reduce((s, p) => s + p, 0);

      const slippages = orders.map(o => o.slippage_pips).filter((v): v is number => v != null);
      const qualities = orders.map(o => o.execution_quality_score).filter((v): v is number => v != null);

      // Duration in minutes (created_at → closed_at)
      const durations = orders
        .filter(o => o.closed_at)
        .map(o => (new Date(o.closed_at!).getTime() - new Date(o.created_at).getTime()) / 60000);

      return {
        pair,
        tradeCount: orders.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate: wins.length / orders.length,
        netPnlPips: Math.round(netPnl * 10) / 10,
        avgPnlPips: Math.round((netPnl / orders.length) * 10) / 10,
        avgSlippage: slippages.length ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0,
        avgQuality: qualities.length ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length) : 0,
        avgDurationMin: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : 0,
        profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? Infinity : 0,
        bestTradePips: pips.length ? Math.max(...pips) : 0,
        worstTradePips: pips.length ? Math.min(...pips) : 0,
      };
    }).sort((a, b) => b.netPnlPips - a.netPnlPips);

    // ─── Session Heatmap ───────────────────────────────────────────
    const sessionMap = new Map<SessionLabel, RealOrder[]>();
    const allSessions: SessionLabel[] = ['London', 'New York', 'Tokyo', 'Sydney', 'Off-Hours'];
    for (const s of allSessions) sessionMap.set(s, []);

    for (const o of closed) {
      // Use session_label from DB if available, otherwise derive from created_at
      let session: SessionLabel;
      if (o.session_label) {
        const normalized = o.session_label.charAt(0).toUpperCase() + o.session_label.slice(1).toLowerCase();
        session = allSessions.find(s => normalized.startsWith(s.split(' ')[0])) || getSessionFromHour(new Date(o.created_at).getUTCHours());
      } else {
        session = getSessionFromHour(new Date(o.created_at).getUTCHours());
      }
      sessionMap.get(session)!.push(o);
    }

    const sessionAnalytics: SessionAnalytics[] = allSessions.map(session => {
      const orders = sessionMap.get(session)!;
      if (orders.length === 0) {
        return { session, tradeCount: 0, winCount: 0, lossCount: 0, winRate: 0, netPnlPips: 0, avgPnlPips: 0, avgQuality: 0, avgSlippage: 0 };
      }
      const pips = orders.map(computePnlPips);
      const wins = pips.filter(p => p > 0);
      const losses = pips.filter(p => p <= 0);
      const netPnl = pips.reduce((s, p) => s + p, 0);
      const slippages = orders.map(o => o.slippage_pips).filter((v): v is number => v != null);
      const qualities = orders.map(o => o.execution_quality_score).filter((v): v is number => v != null);

      return {
        session,
        tradeCount: orders.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate: wins.length / orders.length,
        netPnlPips: Math.round(netPnl * 10) / 10,
        avgPnlPips: Math.round((netPnl / orders.length) * 10) / 10,
        avgQuality: qualities.length ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length) : 0,
        avgSlippage: slippages.length ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0,
      };
    });

    // ─── Rolling Sharpe (20-trade window) ──────────────────────────
    const sortedClosed = [...closed].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const allPips = sortedClosed.map(computePnlPips);
    const windowSize = 20;
    const rollingSharpe: SharpePoint[] = [];
    let cumPnl = 0;

    for (let i = 0; i < allPips.length; i++) {
      cumPnl += allPips[i];
      if (i >= windowSize - 1) {
        const window = allPips.slice(i - windowSize + 1, i + 1);
        const sharpe = computeSharpe(window);
        rollingSharpe.push({
          date: new Date(sortedClosed[i].created_at).toISOString().slice(0, 10),
          sharpe: Math.round(sharpe * 100) / 100,
          tradeCount: i + 1,
          cumPnlPips: Math.round(cumPnl * 10) / 10,
        });
      }
    }

    const overallSharpe = computeSharpe(allPips);
    const totalPnlPips = Math.round(allPips.reduce((s, p) => s + p, 0) * 10) / 10;

    return {
      pairAnalytics,
      sessionAnalytics,
      rollingSharpe,
      overallSharpe: Math.round(overallSharpe * 100) / 100,
      totalClosedTrades: closed.length,
      totalPnlPips,
    };
  }, [metrics]);
}
