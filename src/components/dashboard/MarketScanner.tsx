import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Filter, Grid3X3, List, RefreshCw, Layers, Search, X, Globe } from 'lucide-react';
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
import { BrowseMarketModal } from './BrowseMarketModal';
import { 
  MARKET_LABELS, 
  getTickersByType,
  getSnapshotTickers,
  getFullMarketCount,
  searchTickers,
} from '@/lib/market';
import { MarketType, BiasDirection, EfficiencyVerdict, TickerInfo } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { clearMarketDataCache } from '@/lib/market/dataGenerator';
import { fetchBatchPrices, clearBatchPriceCache, PriceData } from '@/lib/market/batchPriceService';

// Tier-based default ticker counts (only applies to stocks)
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

// Markets that show full list by default (small universes)
const FULL_VISIBILITY_MARKETS: MarketType[] = ['crypto', 'forex', 'commodities', 'indices'];

// Check if a market should show full visibility
const isFullVisibilityMarket = (market: MarketType): boolean => {
  return FULL_VISIBILITY_MARKETS.includes(market);
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
  const [realPrices, setRealPrices] = useState<Record<string, PriceData>>({});
  const [tickerDensity, setTickerDensity] = useState(() => getInitialDensity(userTier));
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [stocksExpanded, setStocksExpanded] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TickerInfo[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
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

  // Get tickers for a market based on visibility rules
  const getTickersForMarket = useCallback((type: MarketType): TickerInfo[] => {
    // Full visibility markets always show all tickers
    if (isFullVisibilityMarket(type)) {
      return getTickersByType(type);
    }
    
    // Stocks: show snapshot unless expanded
    return stocksExpanded ? getTickersByType(type) : getSnapshotTickers(type);
  }, [stocksExpanded]);

  // Get all visible tickers based on selection
  const visibleTickers = useMemo(() => {
    if (selectedMarket === 'all') {
      // Show snapshots from stocks, full from other markets
      const allMarkets: MarketType[] = ['stocks', 'crypto', 'forex', 'commodities', 'indices'];
      return allMarkets.flatMap(type => getTickersForMarket(type));
    }
    return getTickersForMarket(selectedMarket);
  }, [selectedMarket, stocksExpanded, getTickersForMarket]);

  // Pre-compute analysis for visible tickers only
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

  // Apply density limit ONLY for stocks view
  const displayedTickers = useMemo(() => {
    // If viewing stocks (or all markets), apply density limit
    if (selectedMarket === 'stocks' || selectedMarket === 'all') {
      // For 'all', we need to apply density across stock portion only
      if (selectedMarket === 'all') {
        const stockTickers = filteredTickers.filter(t => t.type === 'stocks');
        const otherTickers = filteredTickers.filter(t => t.type !== 'stocks');
        const limitedStocks = stockTickers.slice(0, tickerDensity);
        return [...limitedStocks, ...otherTickers];
      }
      return filteredTickers.slice(0, tickerDensity);
    }
    // Other markets: show all
    return filteredTickers;
  }, [filteredTickers, tickerDensity, selectedMarket]);

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

  const handleExpandStocks = useCallback(() => {
    setStocksExpanded(true);
    // Navigate to stocks tab when expanding
    handleMarketChange('stocks');
    setBrowseModalOpen(false);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = biasFilter !== 'all' || efficiencyFilter !== 'all';
  
  // Whether to show density control (only for stocks-related views)
  const showDensityControl = selectedMarket === 'stocks' || selectedMarket === 'all';
  
  // Whether to show browse button (only when stocks are in view and not expanded)
  const showBrowseButton = (selectedMarket === 'stocks' || selectedMarket === 'all') && !stocksExpanded;

  // Dynamic subtitle based on current view
  const getSubtitle = () => {
    if (selectedMarket === 'all') {
      return 'Showing a curated stock snapshot with full visibility across other markets.';
    }
    if (selectedMarket === 'stocks') {
      return stocksExpanded 
        ? `Viewing full stock universe (${getFullMarketCount('stocks')} tickers). Use density control to manage view.`
        : 'Showing curated stock snapshot. Browse full market for complete coverage.';
    }
    // Full visibility markets
    return `Viewing all ${MARKET_LABELS[selectedMarket]} (${getFullMarketCount(selectedMarket)} instruments).`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              Market Snapshot
            </h1>
            <DataFreshnessBadge level="live" />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {getSubtitle()}
          </p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search bar */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search any ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] sm:w-[200px] pl-9 pr-8 border-border/50"
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

          {/* Tickers per view - ONLY for stocks views */}
          {showDensityControl && (
            <Select value={tickerDensity.toString()} onValueChange={handleDensityChange}>
              <SelectTrigger className="w-[130px] border-border/50">
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
          )}

          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className={`border-border/50 ${hasActiveFilters ? 'border-primary/50 bg-primary/5' : ''}`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-primary" />
                )}
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

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-border/50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

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
      <div className="flex items-center justify-between gap-4">
        <Tabs value={selectedMarket} onValueChange={handleMarketChange} className="flex-1">
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
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {/* Browse Full Market - only for stocks */}
        {showBrowseButton && (
          <Button
            variant="outline"
            onClick={() => setBrowseModalOpen(true)}
            className="border-border/50 shrink-0 hidden sm:flex"
          >
            <Globe className="w-4 h-4 mr-2" />
            Browse Full Stocks
          </Button>
        )}
      </div>

      {/* Mobile browse button - only for stocks */}
      {showBrowseButton && (
        <Button
          variant="outline"
          onClick={() => setBrowseModalOpen(true)}
          className="w-full border-border/50 sm:hidden"
        >
          <Globe className="w-4 h-4 mr-2" />
          Browse Full Stock Universe
        </Button>
      )}

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
            realPriceData={realPrices[ticker.symbol]}
          />
        ))}
      </div>

      {displayedTickers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tickers match your filters</p>
        </div>
      )}

      {/* Browse Market Modal - focused on stocks */}
      <BrowseMarketModal
        open={browseModalOpen}
        onOpenChange={setBrowseModalOpen}
        onSelectMarket={handleExpandStocks}
        stocksExpanded={stocksExpanded}
      />
    </div>
  );
};
