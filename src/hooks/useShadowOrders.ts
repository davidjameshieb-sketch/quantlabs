// Hook: reads shadow agent orders from oanda_orders
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShadowOrder {
  id: string;
  agent_id: string;
  currency_pair: string;
  direction: string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  created_at: string;
  closed_at: string | null;
  environment: string;
  r_pips: number | null;
  confidence_score: number | null;
  regime_label: string | null;
  session_label: string | null;
}

export interface ShadowAgentStats {
  agentId: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPips: number;
  avgR: number;
}

export function useShadowOrders(pollMs = 15_000) {
  const [orders, setOrders] = useState<ShadowOrder[]>([]);
  const [stats, setStats] = useState<ShadowAgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('oanda_orders')
        .select('id, agent_id, currency_pair, direction, status, entry_price, exit_price, created_at, closed_at, environment, r_pips, confidence_score, regime_label, session_label')
        .like('agent_id', 'shadow-%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        const typed: ShadowOrder[] = data.map(row => ({
          id: row.id,
          agent_id: row.agent_id ?? '',
          currency_pair: row.currency_pair,
          direction: row.direction,
          status: row.status,
          entry_price: row.entry_price ? Number(row.entry_price) : null,
          exit_price: row.exit_price ? Number(row.exit_price) : null,
          created_at: row.created_at,
          closed_at: row.closed_at,
          environment: row.environment,
          r_pips: row.r_pips ? Number(row.r_pips) : null,
          confidence_score: row.confidence_score ? Number(row.confidence_score) : null,
          regime_label: row.regime_label,
          session_label: row.session_label,
        }));
        setOrders(typed);

        // Compute per-agent stats
        const map = new Map<string, { wins: number; losses: number; pips: number; rSum: number; count: number }>();
        for (const o of typed) {
          if (!o.agent_id) continue;
          const s = map.get(o.agent_id) || { wins: 0, losses: 0, pips: 0, rSum: 0, count: 0 };
          if (o.status === 'filled' || o.status === 'closed') {
            if (o.entry_price && o.exit_price) {
              const isJpy = o.currency_pair.includes('JPY');
              const mult = isJpy ? 100 : 10000;
              const pips = o.direction === 'long'
                ? (o.exit_price - o.entry_price) * mult
                : (o.entry_price - o.exit_price) * mult;
              s.pips += pips;
              s.count++;
              if (pips > 0) s.wins++;
              else s.losses++;
              if (o.r_pips) s.rSum += Number(o.r_pips);
            }
          }
          map.set(o.agent_id, s);
        }

        const agentStats: ShadowAgentStats[] = [];
        map.forEach((v, k) => {
          agentStats.push({
            agentId: k,
            totalTrades: v.count,
            wins: v.wins,
            losses: v.losses,
            winRate: v.count > 0 ? (v.wins / v.count) * 100 : 0,
            netPips: Math.round(v.pips * 10) / 10,
            avgR: v.count > 0 ? Math.round((v.rSum / v.count) * 100) / 100 : 0,
          });
        });
        agentStats.sort((a, b) => b.netPips - a.netPips);
        setStats(agentStats);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { orders, stats, loading };
}
