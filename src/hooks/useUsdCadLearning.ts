// Hook for USD_CAD Learning & Convergence — fetches oanda_orders and computes analytics
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildDecisionEvents,
  computeUsdCadLearningAnalysis,
  type UsdCadDecisionEvent,
  type LearningAnalysis,
} from '@/lib/forex/usdCadLearningEngine';

export function useUsdCadLearning() {
  const { user } = useAuth();
  const [events, setEvents] = useState<UsdCadDecisionEvent[]>([]);
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
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
          .ilike('currency_pair', '%USD_CAD%')
          .in('status', ['filled', 'closed', 'shadow_eval'])
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (err) { setError(err.message); break; }
        allOrders = allOrders.concat(data || []);
        hasMore = (data?.length ?? 0) === pageSize;
        offset += pageSize;
      }

      const decisionEvents = buildDecisionEvents(allOrders);
      setEvents(decisionEvents);
      setAnalysis(computeUsdCadLearningAnalysis(decisionEvents));
    } catch (err: any) {
      setError(err?.message || 'Failed to compute USD_CAD learning analysis');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAndCompute(); }, [fetchAndCompute]);

  return { events, analysis, loading, error, refresh: fetchAndCompute };
}
