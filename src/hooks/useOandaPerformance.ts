// Hook to fetch real OANDA execution performance
// Now uses snapshot layer for heavy analytics, with lightweight recent-orders fetch for live data

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';

export interface RealExecutionMetrics {
  totalFilled: number;
  totalRejected: number;
  totalSubmitted: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  realizedPnl: number;
  avgSlippage: number;
  maxSlippage: number;
  avgExecutionQuality: number;
  avgFillLatency: number;
  avgFrictionScore: number;
  pairBreakdown: Record<string, {
    pair: string;
    filled: number;
    avgQuality: number;
    avgSlippage: number;
    winCount: number;
    lossCount: number;
  }>;
  agentBreakdown: Record<string, {
    agentId: string;
    filled: number;
    avgQuality: number;
  }>;
  recentOrders: RealOrder[];
  hasData: boolean;
}

export interface RealOrder {
  id: string;
  signal_id: string;
  currency_pair: string;
  direction: string;
  units: number;
  entry_price: number | null;
  exit_price: number | null;
  status: string;
  error_message: string | null;
  confidence_score: number | null;
  agent_id: string | null;
  slippage_pips: number | null;
  fill_latency_ms: number | null;
  friction_score: number | null;
  execution_quality_score: number | null;
  spread_at_entry: number | null;
  session_label: string | null;
  regime_label: string | null;
  gate_result: string | null;
  gate_reasons: string[] | null;
  governance_payload: Record<string, unknown> | null;
  trade_health_score: number | null;
  health_band: string | null;
  mfe_r: number | null;
  ue_r: number | null;
  bars_since_entry: number | null;
  progress_fail: boolean | null;
  health_governance_action: string | null;
  direction_engine: string | null;
  sovereign_override_tag: string | null;
  created_at: string;
  closed_at: string | null;
}

export function useOandaPerformance() {
  const [metrics, setMetrics] = useState<RealExecutionMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);

    try {
      // STRATEGY RESET: Only show trades from revamped strategy (post-2026-02-13)
      const cutoff = '2026-02-13T00:00:00Z';
      const { data: orders, error } = await supabase
        .from('oanda_orders')
        .select('*')
        .eq('environment', 'live')
        .eq('baseline_excluded', false)
        .in('status', ['filled', 'closed', 'rejected', 'submitted', 'pending'])
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const allOrders = (orders || []).filter(
        (o: any) => !o.error_message || !o.error_message.startsWith('cleared:')
      ) as RealOrder[];
      
      const filled = allOrders.filter(o => 
        (o.status === 'filled' || o.status === 'closed') && o.entry_price != null
      );
      const rejected = allOrders.filter(o => o.status === 'rejected');
      const submitted = allOrders.filter(o => o.status === 'submitted');

      const wins = filled.filter(o => {
        if (o.exit_price != null && o.entry_price != null) {
          const pnl = o.direction === 'long' 
            ? o.exit_price - o.entry_price 
            : o.entry_price - o.exit_price;
          return pnl > 0;
        }
        return false;
      });
      const losses = filled.filter(o => {
        if (o.exit_price != null && o.entry_price != null) {
          const pnl = o.direction === 'long'
            ? o.exit_price - o.entry_price
            : o.entry_price - o.exit_price;
          return pnl <= 0;
        }
        return false;
      });

      const closedTrades = wins.length + losses.length;
      const winRate = closedTrades > 0 ? wins.length / closedTrades : 0;

      const realizedPnl = filled
        .filter(o => o.exit_price != null && o.entry_price != null)
        .reduce((sum, o) => {
          const pnl = o.direction === 'long'
            ? (o.exit_price! - o.entry_price!) * o.units
            : (o.entry_price! - o.exit_price!) * o.units;
          return sum + pnl;
        }, 0);

      const slippages = filled.map(o => o.slippage_pips).filter((v): v is number => v != null);
      const qualities = filled.map(o => o.execution_quality_score).filter((v): v is number => v != null);
      const latencies = filled.map(o => o.fill_latency_ms).filter((v): v is number => v != null);
      const frictions = filled.map(o => o.friction_score).filter((v): v is number => v != null);

      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const pairBreakdown: RealExecutionMetrics['pairBreakdown'] = {};
      for (const o of filled) {
        const p = o.currency_pair;
        if (!pairBreakdown[p]) {
          pairBreakdown[p] = { pair: p, filled: 0, avgQuality: 0, avgSlippage: 0, winCount: 0, lossCount: 0 };
        }
        pairBreakdown[p].filled++;
        if (o.execution_quality_score != null) pairBreakdown[p].avgQuality += o.execution_quality_score;
        if (o.slippage_pips != null) pairBreakdown[p].avgSlippage += o.slippage_pips;
      }
      for (const p of Object.values(pairBreakdown)) {
        if (p.filled > 0) {
          p.avgQuality = Math.round(p.avgQuality / p.filled);
          p.avgSlippage = p.avgSlippage / p.filled;
        }
      }

      const agentBreakdown: RealExecutionMetrics['agentBreakdown'] = {};
      for (const o of filled) {
        const a = o.agent_id || 'unknown';
        if (!agentBreakdown[a]) {
          agentBreakdown[a] = { agentId: a, filled: 0, avgQuality: 0 };
        }
        agentBreakdown[a].filled++;
        if (o.execution_quality_score != null) agentBreakdown[a].avgQuality += o.execution_quality_score;
      }
      for (const a of Object.values(agentBreakdown)) {
        if (a.filled > 0) {
          a.avgQuality = Math.round(a.avgQuality / a.filled);
        }
      }

      setMetrics({
        totalFilled: filled.length,
        totalRejected: rejected.length,
        totalSubmitted: submitted.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate,
        realizedPnl,
        avgSlippage: avg(slippages),
        maxSlippage: slippages.length ? Math.max(...slippages) : 0,
        avgExecutionQuality: avg(qualities),
        avgFillLatency: avg(latencies),
        avgFrictionScore: avg(frictions),
        pairBreakdown,
        agentBreakdown,
        recentOrders: allOrders,
        hasData: filled.length > 0,
      });
    } catch (err) {
      console.error('[OANDA-PERF] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeOrders({ onOrderChange: fetchPerformance });

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  return { metrics, loading, refresh: fetchPerformance };
}
