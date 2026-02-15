// Hook: computes synthetic pair values from live OANDA prices
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  PREBUILT_BASKETS,
  calculateSyntheticValue,
  type SyntheticPair,
  type SyntheticQuote,
} from '@/lib/forex/syntheticPairConstructor';

export function useSyntheticPairs(
  customBaskets: SyntheticPair[] = [],
  pollMs = 10_000,
) {
  const [quotes, setQuotes] = useState<SyntheticQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const prevValues = useRef<Record<string, number>>({});

  const allBaskets = [...PREBUILT_BASKETS, ...customBaskets];

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('oanda-market-intel', {
        body: {},
        headers: { 'Content-Type': 'application/json' },
      });

      if (error || !data?.livePricing) {
        setLoading(false);
        return;
      }

      // Convert livePricing from "EUR/USD" keys to "EUR_USD" keys with mid prices
      const prices: Record<string, number> = {};
      for (const [symbol, info] of Object.entries(data.livePricing)) {
        const pair = symbol.replace('/', '_');
        const p = info as any;
        if (p?.mid) prices[pair] = p.mid;
      }

      const newQuotes: SyntheticQuote[] = [];
      for (const basket of allBaskets) {
        const q = calculateSyntheticValue(basket, prices, prevValues.current[basket.name]);
        if (q) {
          prevValues.current[basket.name] = q.value;
          newQuotes.push(q);
        }
      }

      setQuotes(newQuotes);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [allBaskets.map(b => b.name).join(',')]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { quotes, loading };
}
