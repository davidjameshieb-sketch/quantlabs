// Hook: fetches OANDA order book data for heatmap visualization
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

      // The edge function returns { orderBook: { "EUR/USD": {...}, ... } }
      const orderBook = data?.orderBook || {};
      const parsed: PairOrderBook[] = [];

      for (const [pair, book] of Object.entries(orderBook)) {
        const b = book as any;
        if (!b) continue;
        parsed.push({
          pair,
          currentPrice: b.price || '0',
          bucketWidth: b.bucketWidth || '0',
          longClusters: b.longClusters || [],
          shortClusters: b.shortClusters || [],
          retailStopZones: b.retailStopZones || [],
          time: b.time || '',
        });
      }

      // Sort by number of stop zones (most interesting first)
      parsed.sort((a, b) => b.retailStopZones.length - a.retailStopZones.length);
      setBooks(parsed);
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

  return { books, loading, refetch: fetchData };
}
