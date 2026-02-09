// Hook to compute Edge Go-Live Ladder from all environments
import { useMemo } from 'react';
import { useEdgeDiscovery } from './useEdgeDiscovery';
import { computeEdgeGoLive, type GoLiveResult } from '@/lib/forex/edgeGoLiveEngine';

export function useEdgeGoLive() {
  const { trades, loading, error, refresh } = useEdgeDiscovery();

  const result = useMemo<GoLiveResult | null>(() => {
    if (trades.length === 0) return null;
    return computeEdgeGoLive(trades);
  }, [trades]);

  return { result, trades, loading, error, refresh };
}
