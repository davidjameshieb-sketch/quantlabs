// Hook for Edge Discovery — reads from snapshot layer instead of raw DB scans
// Falls back to computing on-demand if no snapshot exists
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOandaOrders, computeEdgeDiscovery, type EdgeDiscoveryResult, type NormalizedTrade } from '@/lib/forex/edgeDiscoveryEngine';

export function useEdgeDiscovery() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<NormalizedTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Only fetch last 90 days with created_at filter — index-supported
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
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
          .gte('created_at', cutoff)
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (err) { setError(err.message); break; }
        allOrders = allOrders.concat(data || []);
        hasMore = (data?.length ?? 0) === pageSize;
        offset += pageSize;
      }

      const normalized = normalizeOandaOrders(allOrders);
      setTrades(normalized);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const result = useMemo<EdgeDiscoveryResult | null>(() => {
    if (trades.length === 0) return null;
    return computeEdgeDiscovery(trades);
  }, [trades]);

  return { result, trades, loading, error, refresh: fetchTrades };
}
