// Hook for Explosive Growth Config — reads OANDA orders and computes config
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  computeExplosiveGrowthConfig,
  type ExplosiveLiveConfig,
  type ExplosiveTradeRecord,
} from '@/lib/forex/explosiveGrowthEngine';

export function useExplosiveGrowth() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ExplosiveLiveConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAndCompute = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let allOrders: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error: err } = await supabase
          .from('oanda_orders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['filled', 'closed'])
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (err) { setError(err.message); break; }
        allOrders = allOrders.concat(data || []);
        hasMore = (data?.length ?? 0) === pageSize;
        offset += pageSize;
      }

      // Normalize to ExplosiveTradeRecord
      const trades: ExplosiveTradeRecord[] = allOrders
        .filter(o => o.agent_id && o.session_label && o.regime_label)
        .map(o => ({
          agent_id: o.agent_id,
          direction: o.direction,
          currency_pair: o.currency_pair,
          entry_price: o.entry_price,
          exit_price: o.exit_price,
          session_label: o.session_label,
          regime_label: o.regime_label,
          spread_at_entry: o.spread_at_entry ?? 0,
          slippage_pips: o.slippage_pips ?? 0,
          governance_composite: o.governance_composite ?? 0,
          environment: o.environment || 'practice',
          created_at: o.created_at,
        }));

      const result = computeExplosiveGrowthConfig(trades);
      setConfig(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to compute explosive growth config');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAndCompute(); }, [fetchAndCompute]);

  return { config, loading, error, refresh: fetchAndCompute };
}
