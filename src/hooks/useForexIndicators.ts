// Hook to fetch live indicator data from the forex-indicators edge function
import { useState, useCallback } from 'react';
import { IndicatorSnapshot } from '@/lib/forex/indicatorTypes';

export function useForexIndicators() {
  const [snapshots, setSnapshots] = useState<Record<string, IndicatorSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const fetchIndicator = useCallback(async (instrument: string, timeframe: string): Promise<IndicatorSnapshot | null> => {
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `${projectUrl}/functions/v1/forex-indicators?instrument=${instrument}&timeframe=${timeframe}`,
        {
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      return await res.json() as IndicatorSnapshot;
    } catch (err) {
      console.error(`[useForexIndicators] ${instrument}@${timeframe} failed:`, err);
      return null;
    }
  }, []);

  const fetchBatch = useCallback(async (pairs: string[], timeframes: string[]) => {
    setLoading(true);
    setError(null);
    const total = pairs.length * timeframes.length;
    setProgress({ done: 0, total });

    const results: Record<string, IndicatorSnapshot> = {};
    let done = 0;

    // Fetch in batches of 3 to avoid overwhelming OANDA
    const tasks: { pair: string; tf: string }[] = [];
    for (const pair of pairs) {
      for (const tf of timeframes) {
        tasks.push({ pair, tf });
      }
    }

    const batchSize = 3;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async ({ pair, tf }) => {
          const snap = await fetchIndicator(pair, tf);
          done++;
          setProgress({ done, total });
          return { key: `${pair}_${tf}`, snap };
        })
      );
      for (const { key, snap } of batchResults) {
        if (snap) results[key] = snap;
      }
    }

    setSnapshots(results);
    setLoading(false);

    if (Object.keys(results).length === 0) {
      setError('No indicator data could be fetched. Check OANDA credentials.');
    }

    return results;
  }, [fetchIndicator]);

  return { snapshots, loading, error, progress, fetchBatch, fetchIndicator };
}
