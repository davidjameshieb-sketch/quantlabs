import { useEffect, useMemo, useState } from "react";
import {
  fetchBatchPrices,
  getLastUpdatedISO,
  getTickerPrice,
  type PriceData,
} from "@/lib/market/batchPriceService";
import type { MarketType } from "@/lib/market/types";

type UseTickerQuoteResult = {
  priceData: PriceData | null;
  lastUpdatedISO: string;
  isLoading: boolean;
};

const getRefreshMs = (market: MarketType): number => {
  // All markets now have 15-min delayed data; poll every 2 minutes
  if (market === "crypto") return 60_000;
  if (market === "forex") return 90_000;
  return 120_000;
};

/**
 * Canonical quote for display (separate from chart representation).
 * Uses backend batch quote cache and exposes provider source + UTC timestamp.
 */
export function useTickerQuote(symbol: string | undefined, market: MarketType): UseTickerQuoteResult {
  const [isLoading, setIsLoading] = useState(true);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [lastUpdatedISO, setLastUpdatedISO] = useState<string>(getLastUpdatedISO());

  const refreshMs = useMemo(() => getRefreshMs(market), [market]);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;

    const refresh = async () => {
      try {
        setIsLoading(true);
        await fetchBatchPrices([symbol]);
        if (!isMounted) return;
        setPriceData(getTickerPrice(symbol));
        setLastUpdatedISO(getLastUpdatedISO());
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    refresh();
    const interval = window.setInterval(refresh, refreshMs);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [symbol, refreshMs]);

  return { priceData, lastUpdatedISO, isLoading };
}
