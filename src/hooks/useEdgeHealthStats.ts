// Live edge health stats from oanda_orders — lightweight polling hook
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type HealthColor = 'green' | 'yellow' | 'red';

export interface SessionStat {
  session: string;
  trades: number;
  wins: number;
  netPips: number;
  color: HealthColor;
}

export interface PairStat {
  pair: string;
  trades: number;
  winRate: number;
  netPips: number;
  pf: number;
  color: HealthColor;
}

export interface EdgeHealthStats {
  status: HealthColor;
  statusLabel: string;
  totalTrades: number;
  overallWinRate: number;
  overallExpectancy: number;
  overallPF: number;
  longWR: number;
  shortWR: number;
  longNet: number;
  shortNet: number;
  sessions: SessionStat[];
  topPairs: PairStat[];
  worstPairs: PairStat[];
  lastUpdated: Date | null;
}

const EMPTY: EdgeHealthStats = {
  status: 'red',
  statusLabel: 'No Data',
  totalTrades: 0,
  overallWinRate: 0,
  overallExpectancy: 0,
  overallPF: 0,
  longWR: 0,
  shortWR: 0,
  longNet: 0,
  shortNet: 0,
  sessions: [],
  topPairs: [],
  worstPairs: [],
  lastUpdated: null,
};

function pipMult(pair: string): number {
  return ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'].includes(pair) ? 100 : 10000;
}

function classifySession(s: SessionStat): HealthColor {
  if (s.netPips > 0 && s.wins / Math.max(s.trades, 1) > 0.48) return 'green';
  if (s.netPips < -100 || s.wins / Math.max(s.trades, 1) < 0.35) return 'red';
  return 'yellow';
}

function classifyPair(p: PairStat): HealthColor {
  if (p.pf >= 1.15 && p.netPips > 0) return 'green';
  if (p.pf < 0.95 || p.netPips < -100) return 'red';
  return 'yellow';
}

export function useEdgeHealthStats(pollIntervalMs = 60_000): EdgeHealthStats {
  const { user } = useAuth();
  const [stats, setStats] = useState<EdgeHealthStats>(EMPTY);

  const refresh = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('oanda_orders')
      .select('currency_pair,direction,entry_price,exit_price,session_label,status')
      .in('status', ['filled', 'closed'])
      .not('entry_price', 'is', null)
      .not('exit_price', 'is', null)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error || !data || data.length === 0) {
      setStats(EMPTY);
      return;
    }

    // Compute pips
    const trades = data.map((o: any) => {
      const mult = pipMult(o.currency_pair);
      const pnl = o.direction === 'long'
        ? (o.exit_price - o.entry_price) * mult
        : (o.entry_price - o.exit_price) * mult;
      return { ...o, pips: Math.round(pnl * 10) / 10 };
    });

    const wins = trades.filter(t => t.pips > 0);
    const grossProfit = wins.reduce((s, t) => s + t.pips, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pips <= 0).reduce((s, t) => s + t.pips, 0));
    const pf = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0;
    const netPips = trades.reduce((s, t) => s + t.pips, 0);
    const expectancy = Math.round((netPips / trades.length) * 100) / 100;

    // Direction
    const longs = trades.filter(t => t.direction === 'long');
    const shorts = trades.filter(t => t.direction === 'short');
    const longWins = longs.filter(t => t.pips > 0).length;
    const shortWins = shorts.filter(t => t.pips > 0).length;

    // Sessions
    const sessionMap = new Map<string, { trades: number; wins: number; net: number }>();
    for (const t of trades) {
      const s = t.session_label || 'unknown';
      const cur = sessionMap.get(s) || { trades: 0, wins: 0, net: 0 };
      cur.trades++;
      if (t.pips > 0) cur.wins++;
      cur.net += t.pips;
      sessionMap.set(s, cur);
    }
    const sessions: SessionStat[] = Array.from(sessionMap.entries())
      .map(([session, v]) => {
        const stat: SessionStat = { session, trades: v.trades, wins: v.wins, netPips: Math.round(v.net * 10) / 10, color: 'yellow' };
        stat.color = classifySession(stat);
        return stat;
      })
      .sort((a, b) => b.netPips - a.netPips);

    // Pairs
    const pairMap = new Map<string, { trades: number; wins: number; net: number; gp: number; gl: number }>();
    for (const t of trades) {
      const cur = pairMap.get(t.currency_pair) || { trades: 0, wins: 0, net: 0, gp: 0, gl: 0 };
      cur.trades++;
      if (t.pips > 0) { cur.wins++; cur.gp += t.pips; }
      else cur.gl += Math.abs(t.pips);
      cur.net += t.pips;
      pairMap.set(t.currency_pair, cur);
    }
    const allPairs: PairStat[] = Array.from(pairMap.entries())
      .map(([pair, v]) => {
        const stat: PairStat = {
          pair,
          trades: v.trades,
          winRate: Math.round((v.wins / v.trades) * 1000) / 10,
          netPips: Math.round(v.net * 10) / 10,
          pf: v.gl > 0 ? Math.round((v.gp / v.gl) * 100) / 100 : 0,
          color: 'yellow',
        };
        stat.color = classifyPair(stat);
        return stat;
      })
      .sort((a, b) => b.netPips - a.netPips);

    // Overall status
    let status: HealthColor = 'yellow';
    let statusLabel = 'Edge Developing';
    const shortWR = shorts.length > 0 ? shortWins / shorts.length : 0;
    if (pf < 1.0 || expectancy <= 0 || shortWR < 0.35) {
      status = 'red';
      statusLabel = 'Edge Unhealthy';
    } else if (pf >= 1.5 && expectancy > 0.3 && shortWR > 0.45) {
      status = 'green';
      statusLabel = 'Edge Healthy';
    }

    setStats({
      status,
      statusLabel,
      totalTrades: trades.length,
      overallWinRate: Math.round((wins.length / trades.length) * 1000) / 10,
      overallExpectancy: expectancy,
      overallPF: pf,
      longWR: longs.length > 0 ? Math.round((longWins / longs.length) * 1000) / 10 : 0,
      shortWR: shorts.length > 0 ? Math.round((shortWins / shorts.length) * 1000) / 10 : 0,
      longNet: Math.round(longs.reduce((s, t) => s + t.pips, 0) * 10) / 10,
      shortNet: Math.round(shorts.reduce((s, t) => s + t.pips, 0) * 10) / 10,
      sessions,
      topPairs: allPairs.filter(p => p.color === 'green').slice(0, 3),
      worstPairs: allPairs.filter(p => p.color === 'red').slice(-3).reverse(),
      lastUpdated: new Date(),
    });
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  return stats;
}
