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
      // 21-day lookback to prevent database statement timeouts
      const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error: err } = await supabase
        .from('oanda_orders')
        .select('*')
        .eq('user_id', user.id)
        .ilike('currency_pair', '%USD_CAD%')
        .in('status', ['filled', 'closed', 'shadow_eval'])
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(5000);

      if (err) { setError(err.message); setLoading(false); return; }
      const allOrders = data || [];

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
