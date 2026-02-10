// Hook for USD_CAD Cluster Mining — calls the cluster-mining edge function
import { useState, useCallback } from 'react';
import type { ClusterMiningResponse } from '@/lib/forex/clusterMiningTypes';

export function useClusterMining() {
  const [data, setData] = useState<ClusterMiningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runMining = useCallback(async (lookbackDays = 21) => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${projectUrl}/functions/v1/cluster-mining?lookback=${lookbackDays}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const result: ClusterMiningResponse = await res.json();
      setData(result);
      return result;
    } catch (err: any) {
      const msg = err?.message || 'Cluster mining failed';
      setError(msg);
      console.error('[useClusterMining]', msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, runMining };
}
