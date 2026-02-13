// Hook: polls oanda_orders to build live pair heatmap data
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PairStatus = 'OPPORTUNITY' | 'ACTIVE' | 'THROTTLED' | 'TRAPPED' | 'BLOCKED' | 'IDLE';

export interface PairHeatmapEntry {
  pair: string;
  displayPair: string;
  status: PairStatus;
  totalTrades7d: number;
  closedTrades: number;
  rejectedTrades: number;
  throttledTrades: number;
  openTrades: number;
  winRate: number;
  netPips: number;
  avgConfidence: number;
  recentDirection: 'long' | 'short' | 'mixed';
  lastTradeAt: string | null;
  gateFails: string[];
  intensity: number; // 0-100 for color gradient
}

export interface PairHeatmapState {
  pairs: PairHeatmapEntry[];
  loading: boolean;
  lastUpdated: Date | null;
}

const JPY_PAIRS = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];

function toDisplay(pair: string): string {
  if (pair.includes('/')) return pair;
  if (pair.includes('_')) return pair.replace('_', '/');
  if (pair.length === 6) return `${pair.slice(0, 3)}/${pair.slice(3)}`;
  return pair;
}

export function usePairHeatmapData(pollMs = 15_000): PairHeatmapState {
  const [state, setState] = useState<PairHeatmapState>({
    pairs: [],
    loading: true,
    lastUpdated: null,
  });

  const fetchData = useCallback(async () => {
    try {
      // Get recent orders (7 days) with PnL data
      const { data: orders } = await supabase
        .from('oanda_orders')
        .select('currency_pair, direction, status, gate_result, gate_reasons, confidence_score, entry_price, exit_price, trade_health_score, created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!orders) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      // Also fetch active gate_bypasses for blocked/blacklisted pairs
      const { data: bypasses } = await supabase
        .from('gate_bypasses')
        .select('*')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString());

      const blacklistedPairs = new Set(
        (bypasses || [])
          .filter(b => b.gate_id === 'SESSION_BLACKLIST' && b.pair)
          .map(b => b.pair!)
      );

      // Group by pair
      const pairMap = new Map<string, typeof orders>();
      for (const o of orders) {
        const p = o.currency_pair;
        if (!p || p === 'SYSTEM') continue;
        if (!pairMap.has(p)) pairMap.set(p, []);
        pairMap.get(p)!.push(o);
      }

      const entries: PairHeatmapEntry[] = [];

      for (const [pair, pairOrders] of pairMap) {
        const closed = pairOrders.filter(o => (o.status === 'filled' || o.status === 'closed') && o.exit_price != null);
        const rejected = pairOrders.filter(o => o.status === 'rejected');
        const throttled = pairOrders.filter(o => o.gate_result === 'throttled');
        const open = pairOrders.filter(o => o.status === 'filled' && o.exit_price == null);

        // Calculate PnL
        const isJpy = JPY_PAIRS.includes(pair);
        const mult = isJpy ? 100 : 10000;
        let totalPips = 0;
        let wins = 0;
        for (const o of closed) {
          if (o.entry_price == null || o.exit_price == null) continue;
          const pnl = o.direction === 'long'
            ? (o.exit_price - o.entry_price) * mult
            : (o.entry_price - o.exit_price) * mult;
          totalPips += pnl;
          if (pnl > 0) wins++;
        }

        const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
        const avgConf = pairOrders.reduce((s, o) => s + (o.confidence_score ?? 0), 0) / pairOrders.length;

        // Recent direction
        const recentLongs = pairOrders.slice(0, 10).filter(o => o.direction === 'long').length;
        const recentDirection: 'long' | 'short' | 'mixed' = recentLongs > 7 ? 'long' : recentLongs < 3 ? 'short' : 'mixed';

        // Gate fail reasons
        const gateFails: string[] = [];
        for (const o of rejected) {
          if (o.gate_reasons) {
            for (const r of o.gate_reasons) {
              if (!gateFails.includes(r)) gateFails.push(r);
            }
          }
        }

        // Determine status
        let status: PairStatus = 'IDLE';
        const rejectRate = pairOrders.length > 0 ? rejected.length / pairOrders.length : 0;
        const throttleRate = pairOrders.length > 0 ? throttled.length / pairOrders.length : 0;

        if (blacklistedPairs.has(pair)) {
          status = 'BLOCKED';
        } else if (open.length > 0) {
          status = 'ACTIVE';
        } else if (rejectRate > 0.4) {
          status = 'TRAPPED';
        } else if (throttleRate > 0.3) {
          status = 'THROTTLED';
        } else if (winRate > 50 && totalPips > 0 && closed.length >= 5) {
          status = 'OPPORTUNITY';
        } else if (closed.length > 0) {
          status = totalPips >= 0 ? 'OPPORTUNITY' : 'TRAPPED';
        }

        // Intensity (0-100): higher = more activity + better performance
        const activityScore = Math.min(50, pairOrders.length / 5);
        const perfScore = Math.min(50, Math.max(0, (winRate - 30) * 1.5));
        const intensity = Math.round(activityScore + perfScore);

        entries.push({
          pair,
          displayPair: toDisplay(pair),
          status,
          totalTrades7d: pairOrders.length,
          closedTrades: closed.length,
          rejectedTrades: rejected.length,
          throttledTrades: throttled.length,
          openTrades: open.length,
          winRate: Math.round(winRate * 10) / 10,
          netPips: Math.round(totalPips * 10) / 10,
          avgConfidence: Math.round(avgConf),
          recentDirection,
          lastTradeAt: pairOrders[0]?.created_at ?? null,
          gateFails,
          intensity,
        });
      }

      // Sort: ACTIVE first, then OPPORTUNITY, then THROTTLED, then TRAPPED, then BLOCKED, then IDLE
      const ORDER: Record<PairStatus, number> = { ACTIVE: 0, OPPORTUNITY: 1, THROTTLED: 2, TRAPPED: 3, BLOCKED: 4, IDLE: 5 };
      entries.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.totalTrades7d - a.totalTrades7d);

      setState({ pairs: entries, loading: false, lastUpdated: new Date() });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return state;
}
