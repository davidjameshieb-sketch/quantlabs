import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Filter, Grid3X3, List, RefreshCw, ChevronDown, Sparkles, Layers, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TickerCard } from './TickerCard';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { 
  MARKET_LABELS, 
  getTickersByType,
  getSnapshotTickers,
  getFullMarketCount,
  SNAPSHOT_SIZE,
  MARKET_FULL_LABELS,
  searchTickers,
} from '@/lib/market';
import { MarketType, BiasDirection, EfficiencyVerdict, TickerInfo } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { clearMarketDataCache } from '@/lib/market/dataGenerator';
import { fetchBatchPrices, clearBatchPriceCache } from '@/lib/market/batchPriceService';

type LoadState = Record<MarketType, 'snapshot' | 'full'>;

// Tier-based default ticker counts
const TIER_DENSITY_DEFAULTS: Record<number, number> = {
  1: 10,  // Observer
  2: 20,  // Analyst
  3: 40,  // Strategist
  4: 60,  // Architect
  5: 100, // Mastermind
};

const DENSITY_OPTIONS = [10, 20, 40, 60, 100] as const;

// Get from session storage or use tier default
const getInitialDensity = (tier: number = 1): number => {
  const stored = sessionStorage.getItem('tickerDensity');
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (DENSITY_OPTIONS.includes(parsed as typeof DENSITY_OPTIONS[number])) {
      return parsed;
    }
  }
  return TIER_DENSITY_DEFAULTS[tier] || 20;
};

export const MarketScanner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedMarket = (searchParams.get('market') as MarketType | 'all') || 'all';
  
  // TODO: Replace with actual user tier from auth context
  const userTier = 1;
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [biasFilter, setBiasFilter] = useState<BiasDirection | 'all'>('all');
  const [efficiencyFilter, setEfficiencyFilter] = useState<EfficiencyVerdict | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realPrices, setRealPrices] = useState<Record<string, { price: number }>>({});
  const [tickerDensity, setTickerDensity] = useState(() => getInitialDensity(userTier));
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TickerInfo[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
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
  
  // Persist density preference
  const handleDensityChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    setTickerDensity(num);
    sessionStorage.setItem('tickerDensity', value);
  }, []);

  // Fetch real prices on mount
  useEffect(() => {
    fetchBatchPrices().then(prices => {
      setRealPrices(prices);
    });
  }, []);

  // Search handler - searches across ALL tickers, independent of loaded universe
  useEffect(() => {
    if (searchQuery.length >= 1) {
      const results = searchTickers(searchQuery, 8);
      setSearchResults(results);
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  const handleSearchSelect = useCallback((ticker: TickerInfo) => {
    setSearchQuery('');
    setShowSearchResults(false);
    navigate(`/dashboard/ticker/${ticker.symbol}`);
  }, [navigate]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setShowSearchResults(false);
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

  // Apply density limit - only render what user wants to see
  const displayedTickers = useMemo(() => {
    return filteredTickers.slice(0, tickerDensity);
  }, [filteredTickers, tickerDensity]);

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

  const hasMoreTickers = filteredTickers.length > tickerDensity;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              Market Snapshot
            </h1>
            <DataFreshnessBadge level="live" />
            {isInSnapshotMode && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="w-3 h-3" />
                Focused View
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Showing a focused view across markets. Expand or increase ticker count for deeper analysis.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search bar - searches ALL tickers */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search any ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] sm:w-[220px] pl-9 pr-8 border-border/50"
                onFocus={() => searchQuery && setShowSearchResults(true)}
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
            
            {/* Search results dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[300px] overflow-auto">
                {searchResults.map((ticker) => (
                  <button
                    key={ticker.symbol}
                    onClick={() => handleSearchSelect(ticker)}
                    className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div>
                      <span className="font-medium text-foreground">{ticker.symbol}</span>
                      <span className="text-xs text-muted-foreground ml-2 truncate">{ticker.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{ticker.type}</span>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 p-3">
                <p className="text-sm text-muted-foreground">No tickers found for "{searchQuery}"</p>
              </div>
            )}
          </div>

          {/* Tickers per view control */}
          <Select value={tickerDensity.toString()} onValueChange={handleDensityChange}>
            <SelectTrigger className="w-[140px] border-border/50">
              <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Per view" />
            </SelectTrigger>
            <SelectContent>
              {DENSITY_OPTIONS.map((count) => (
                <SelectItem key={count} value={count.toString()}>
                  {count} tickers
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
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

      {/* Expand Market Coverage - PRIMARY LOCATION */}
      {Object.values(loadState).some(s => s === 'snapshot') && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <span className="text-sm font-medium text-muted-foreground mr-2">
            Expand Market Coverage:
          </span>
          {(Object.entries(loadState) as [MarketType, 'snapshot' | 'full'][])
            .filter(([, state]) => state === 'snapshot')
            .map(([type]) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => handleLoadFullMarket(type)}
                disabled={loadingMarket === type}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                {loadingMarket === type ? (
                  <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <ChevronDown className="w-3 h-3 mr-1.5" />
                )}
                {MARKET_LABELS[type]} ({getFullMarketCount(type)})
              </Button>
            ))}
        </div>
      )}

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

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {displayedTickers.length} of {filteredTickers.length} {filteredTickers.length === 1 ? 'ticker' : 'tickers'}
          {hasMoreTickers && (
            <span className="text-muted-foreground/60"> • Increase "tickers per view" for more</span>
          )}
        </p>
      </div>

      {/* Ticker grid */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'flex flex-col gap-3'
        }
      >
        {displayedTickers.map((ticker) => (
          <TickerCard 
            key={ticker.symbol} 
            ticker={ticker} 
            realPrice={realPrices[ticker.symbol]?.price}
          />
        ))}
      </div>

      {/* Progressive disclosure prompt */}
      {hasMoreTickers && (
        <div className="text-center py-4 border-t border-border/30">
          <p className="text-sm text-muted-foreground">
            {filteredTickers.length - tickerDensity} more tickers available.{' '}
            <button 
              onClick={() => handleDensityChange(Math.min(tickerDensity + 20, 100).toString())}
              className="text-primary hover:underline font-medium"
            >
              Increase ticker count
            </button>
            {' '}or expand market for deeper analysis.
          </p>
        </div>
      )}

      {displayedTickers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tickers match your filters</p>
        </div>
      )}
    </div>
  );
};
