import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PairPhysics {
  pair: string;
  ofiRatio: number;
  ofiWeighted: number;
  ofiRawRecursive: number;
  zOfi: number;
  vpin: number;
  buyPct: number;
  sellPct: number;
  bias: 'BUY' | 'SELL' | 'NEUTRAL';
  ticksAnalyzed: number;
  kramersMoyal: {
    D1: number;
    D2: number;
    driftNormalized: number;
    alphaAdaptive: number;
    sampleSize: number;
  };
  hurst: {
    H: number;
    regime: 'PERSISTENT' | 'MEAN_REVERTING' | 'RANDOM_WALK';
  };
  efficiency: number;
  marketState: 'LIQUID' | 'ABSORBING' | 'SLIPPING' | 'NEUTRAL';
  hiddenPlayer: {
    type: 'HIDDEN_LIMIT_SELLER' | 'HIDDEN_LIMIT_BUYER' | 'LIQUIDITY_HOLE' | string;
    force: number;
    velocity: number;
    divergence: number;
    efficiency: number;
    marketState: string;
    recommendation: string;
  } | null;
  resistanceLevels: { price: number; strength: number; type: string }[];
  syntheticDepth: { price: number; buys: number; sells: number; net: number; hits: number; bounces: number; broken: boolean }[];
}

export interface SyntheticBookSnapshot {
  version: string;
  pairs: Record<string, PairPhysics>;
  pairsCount: number;
  hiddenPlayerAlerts: number;
  absorbingPairs: number;
  slippingPairs: number;
  ticksProcessed: number;
  streamDurationMs: number;
  timestamp: string;
  architecture: string;
  gates: string[];
  capabilities: string[];
}

export interface ActiveTrade {
  id: string;
  currency_pair: string;
  direction: string;
  status: string;
  created_at: string;
  entry_price: number | null;
  units: number;
  direction_engine: string | null;
}

export function useSyntheticOrderBook(pollMs = 3_000) {
  const [snapshot, setSnapshot] = useState<SyntheticBookSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);

  const fetchSnapshot = useCallback(async () => {
    const { data } = await supabase
      .from('sovereign_memory')
      .select('payload, updated_at')
      .eq('memory_type', 'ofi_synthetic_book')
      .eq('memory_key', 'latest_snapshot')
      .maybeSingle();

    if (data?.payload) {
      const p = data.payload as any;
      setSnapshot(p);
      setLastUpdated(data.updated_at);
    }
    setLoading(false);
  }, []);

  const fetchActiveTrades = useCallback(async () => {
    const { data } = await supabase
      .from('oanda_orders')
      .select('id, currency_pair, direction, status, created_at, entry_price, units, direction_engine')
      .eq('status', 'open')
      .eq('environment', 'live')
      .order('created_at', { ascending: false });
    setActiveTrades(data || []);
  }, []);

  useEffect(() => {
    fetchSnapshot();
    fetchActiveTrades();

    // Poll physics snapshot every 3s
    const iv = setInterval(fetchSnapshot, pollMs);

    // Realtime subscription for instant trade open/close detection
    const channel = supabase
      .channel('active-trades-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oanda_orders' },
        () => { fetchActiveTrades(); }
      )
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [fetchSnapshot, fetchActiveTrades, pollMs]);

  return { snapshot, loading, lastUpdated, refetch: fetchSnapshot, activeTrades };
}
