// Hook: fetches OANDA liquidity zone data (spread-based depth analysis)
// Replaces order book dependency with pricing depth liquidity zones
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiquidityZone {
  pair: string;
  bidLiquidity: number;
  askLiquidity: number;
  imbalanceRatio: number;
  bias: string;
  spreadPips: number;
}

// Keep legacy interface for backward compatibility
export interface OrderBookCluster {
  price: string;
  longPct: number;
  shortPct: number;
}

export interface PairOrderBook {
  pair: string;
  currentPrice: string;
  bucketWidth: string;
  longClusters: OrderBookCluster[];
  shortClusters: OrderBookCluster[];
  retailStopZones: { price: string; type: string; pct: number }[];
  time: string;
}

export function useOrderBookData(pollMs = 30_000) {
  const [books, setBooks] = useState<PairOrderBook[]>([]);
  const [liquidityZones, setLiquidityZones] = useState<LiquidityZone[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('oanda-market-intel', {
        body: {},
        headers: { 'Content-Type': 'application/json' },
      });

      if (error) {
        console.warn('[OrderBook] Edge function error:', error);
        setLoading(false);
        return;
      }

      // Parse liquidity zones (replacement for order books)
      const zones = data?.liquidityZones || {};
      const parsedZones: LiquidityZone[] = [];
      for (const [pair, zone] of Object.entries(zones)) {
        const z = zone as any;
        parsedZones.push({
          pair,
          bidLiquidity: z.bidLiquidity || 0,
          askLiquidity: z.askLiquidity || 0,
          imbalanceRatio: z.imbalanceRatio || 0,
          bias: z.bias || 'BALANCED',
          spreadPips: z.spreadPips || 0,
        });
      }
      parsedZones.sort((a, b) => Math.abs(b.imbalanceRatio) - Math.abs(a.imbalanceRatio));
      setLiquidityZones(parsedZones);

      // Legacy: empty books since order book API is unavailable
      setBooks([]);
    } catch (err) {
      console.warn('[OrderBook] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { books, liquidityZones, loading, refetch: fetchData };
}
