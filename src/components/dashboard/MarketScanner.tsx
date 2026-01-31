import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Grid3X3, List, RefreshCw, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TickerCard } from './TickerCard';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { 
  MARKET_LABELS, 
  getTickersByType,
  getSnapshotTickers,
  getFullMarketCount,
  SNAPSHOT_SIZE,
  MARKET_FULL_LABELS,
} from '@/lib/market';
import { MarketType, BiasDirection, EfficiencyVerdict, TickerInfo } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { clearMarketDataCache } from '@/lib/market/dataGenerator';
import { fetchBatchPrices, clearBatchPriceCache } from '@/lib/market/batchPriceService';

type LoadState = Record<MarketType, 'snapshot' | 'full'>;

export const MarketScanner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMarket = (searchParams.get('market') as MarketType | 'all') || 'all';
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [biasFilter, setBiasFilter] = useState<BiasDirection | 'all'>('all');
  const [efficiencyFilter, setEfficiencyFilter] = useState<EfficiencyVerdict | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realPrices, setRealPrices] = useState<Record<string, { price: number }>>({});
  
  // Track which markets are expanded vs snapshot
  const [loadState, setLoadState] = useState<LoadState>({
    stocks: 'snapshot',
    crypto: 'snapshot',
    forex: 'snapshot',
    commodities: 'snapshot',
    indices: 'snapshot',
  });
  
  // Loading state for individual markets
  const [loadingMarket, setLoadingMarket] = useState<MarketType | null>(null);

  // Fetch real prices on mount
  useEffect(() => {
    fetchBatchPrices().then(prices => {
      setRealPrices(prices);
    });
  }, []);

  // Get tickers based on load state
  const getTickersForMarket = useCallback((type: MarketType): TickerInfo[] => {
    return loadState[type] === 'full' 
      ? getTickersByType(type)
      : getSnapshotTickers(type);
  }, [loadState]);

  // Get all visible tickers based on selection and load state
  const visibleTickers = useMemo(() => {
    if (selectedMarket === 'all') {
      // Show snapshots from all markets
      const allMarkets: MarketType[] = ['stocks', 'crypto', 'forex', 'commodities', 'indices'];
      return allMarkets.flatMap(type => getTickersForMarket(type));
    }
    return getTickersForMarket(selectedMarket);
  }, [selectedMarket, loadState, getTickersForMarket]);

  // Pre-compute analysis for visible tickers only (not all tickers)
  const tickerAnalysisMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof analyzeMarket>>();
    for (const t of visibleTickers) {
      map.set(t.symbol, analyzeMarket(t, '1h'));
    }
    return map;
  }, [visibleTickers]);

  const filteredTickers = useMemo(() => {
    let tickers = visibleTickers;

    // Apply bias filter using cached analysis
    if (biasFilter !== 'all') {
      tickers = tickers.filter(t => {
        const analysis = tickerAnalysisMap.get(t.symbol);
        return analysis?.bias === biasFilter;
      });
    }

    // Apply efficiency filter using cached analysis
    if (efficiencyFilter !== 'all') {
      tickers = tickers.filter(t => {
        const analysis = tickerAnalysisMap.get(t.symbol);
        return analysis?.efficiency.verdict === efficiencyFilter;
      });
    }

    return tickers;
  }, [visibleTickers, biasFilter, efficiencyFilter, tickerAnalysisMap]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    clearMarketDataCache();
    clearBatchPriceCache();
    const prices = await fetchBatchPrices();
    setRealPrices(prices);
    setIsRefreshing(false);
  };

  const handleMarketChange = (market: string) => {
    if (market === 'all') {
      searchParams.delete('market');
    } else {
      searchParams.set('market', market);
    }
    setSearchParams(searchParams);
  };

  const handleLoadFullMarket = useCallback(async (type: MarketType) => {
    setLoadingMarket(type);
    // Small delay to show loading state, then load full market
    await new Promise(resolve => setTimeout(resolve, 100));
    setLoadState(prev => ({ ...prev, [type]: 'full' }));
    setLoadingMarket(null);
  }, []);

  // Check if current view is in snapshot mode
  const isInSnapshotMode = selectedMarket === 'all' 
    ? Object.values(loadState).some(s => s === 'snapshot')
    : loadState[selectedMarket] === 'snapshot';

  // Get counts for display
  const getDisplayCounts = () => {
    if (selectedMarket === 'all') {
      const snapshotCount = Object.entries(loadState)
        .reduce((acc, [type, state]) => {
          return acc + (state === 'snapshot' ? SNAPSHOT_SIZE : getFullMarketCount(type as MarketType));
        }, 0);
      return { showing: filteredTickers.length, total: snapshotCount };
    }
    const fullCount = getFullMarketCount(selectedMarket);
    const isSnapshot = loadState[selectedMarket] === 'snapshot';
    return { 
      showing: filteredTickers.length, 
      total: isSnapshot ? SNAPSHOT_SIZE : fullCount,
      fullAvailable: fullCount,
      isSnapshot,
    };
  };

  const counts = getDisplayCounts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              {isInSnapshotMode ? 'Market Snapshot' : 'Market Scanner'}
            </h1>
            <DataFreshnessBadge level="live" />
            {isInSnapshotMode && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="w-3 h-3" />
                Quick View
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {isInSnapshotMode 
              ? 'Top picks across markets • Expand any market for full analysis'
              : 'Full structure analysis across all markets'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-border/50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-border/50">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Bias</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={biasFilter === 'all'}
                onCheckedChange={() => setBiasFilter('all')}
              >
                All
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={biasFilter === 'bullish'}
                onCheckedChange={() => setBiasFilter('bullish')}
              >
                Bullish
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={biasFilter === 'bearish'}
                onCheckedChange={() => setBiasFilter('bearish')}
              >
                Bearish
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Efficiency</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={efficiencyFilter === 'all'}
                onCheckedChange={() => setEfficiencyFilter('all')}
              >
                All
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={efficiencyFilter === 'clean'}
                onCheckedChange={() => setEfficiencyFilter('clean')}
              >
                Clean
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={efficiencyFilter === 'mixed'}
                onCheckedChange={() => setEfficiencyFilter('mixed')}
              >
                Mixed
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={efficiencyFilter === 'noisy'}
                onCheckedChange={() => setEfficiencyFilter('noisy')}
              >
                Noisy
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View toggle */}
          <div className="flex items-center border border-border/50 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Market tabs */}
      <Tabs value={selectedMarket} onValueChange={handleMarketChange}>
        <div className="overflow-x-auto pb-2 -mb-2">
          <TabsList className="bg-muted/50 border border-border/50 inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              All Markets
            </TabsTrigger>
            {Object.entries(MARKET_LABELS).map(([type, label]) => (
              <TabsTrigger
                key={type}
                value={type}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
              >
                {label}
                {loadState[type as MarketType] === 'snapshot' && (
                  <span className="ml-1 text-xs opacity-60">({SNAPSHOT_SIZE})</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Results count + Load Full CTA */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {counts.showing} {counts.showing === 1 ? 'ticker' : 'tickers'}
          {selectedMarket !== 'all' && counts.isSnapshot && (
            <span className="text-muted-foreground/60"> of {counts.fullAvailable} available</span>
          )}
        </p>
        
        {selectedMarket !== 'all' && loadState[selectedMarket] === 'snapshot' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleLoadFullMarket(selectedMarket)}
            disabled={loadingMarket === selectedMarket}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            {loadingMarket === selectedMarket ? (
              <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
            ) : (
              <ChevronDown className="w-3 h-3 mr-2" />
            )}
            Load {MARKET_FULL_LABELS[selectedMarket]}
          </Button>
        )}
      </div>

      {/* Ticker grid */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'flex flex-col gap-3'
        }
      >
        {filteredTickers.map((ticker) => (
          <TickerCard 
            key={ticker.symbol} 
            ticker={ticker} 
            realPrice={realPrices[ticker.symbol]?.price}
          />
        ))}
      </div>

      {/* Load More CTAs when viewing "All Markets" in snapshot mode */}
      {selectedMarket === 'all' && Object.values(loadState).some(s => s === 'snapshot') && (
        <div className="border-t border-border/30 pt-6 mt-6">
          <p className="text-sm text-muted-foreground mb-4">
            Expand markets for full analysis:
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(loadState) as [MarketType, 'snapshot' | 'full'][])
              .filter(([, state]) => state === 'snapshot')
              .map(([type]) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadFullMarket(type)}
                  disabled={loadingMarket === type}
                  className="border-border/50"
                >
                  {loadingMarket === type ? (
                    <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3 h-3 mr-2" />
                  )}
                  {MARKET_LABELS[type]} ({getFullMarketCount(type)})
                </Button>
              ))}
          </div>
        </div>
      )}

      {filteredTickers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tickers match your filters</p>
        </div>
      )}
    </div>
  );
};
