import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Filter, Grid3X3, List, RefreshCw, Layers, Search, X, Globe, ArrowUpDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { ScannerDetailDrawer } from './ScannerDetailDrawer';
import { 
  MARKET_LABELS, 
  getTickersByType,
  getSnapshotTickers,
  getFullMarketCount,
  searchTickers,
} from '@/lib/market';
import { MarketType, BiasDirection, EfficiencyVerdict, StrategyState, TickerInfo, AnalysisResult } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { clearMarketDataCache } from '@/lib/market/dataGenerator';
import { fetchBatchPrices, clearBatchPriceCache, PriceData } from '@/lib/market/batchPriceService';

// Tier-based default ticker counts (only applies to stocks)
const TIER_DENSITY_DEFAULTS: Record<number, number> = {
  1: 10,
  2: 20,
  3: 40,
  4: 60,
  5: 100,
};

const DENSITY_OPTIONS = [10, 20, 40, 60, 100] as const;

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

const FULL_VISIBILITY_MARKETS: MarketType[] = ['crypto', 'forex', 'commodities', 'indices'];
const isFullVisibilityMarket = (market: MarketType): boolean => FULL_VISIBILITY_MARKETS.includes(market);

type SortOption = 'default' | 'confidence-desc' | 'efficiency-desc' | 'noise-asc' | 'updated';

const SORT_LABELS: Record<SortOption, string> = {
  'default': 'Default',
  'confidence-desc': 'Highest Confidence',
  'efficiency-desc': 'Best Efficiency',
  'noise-asc': 'Lowest Noise',
  'updated': 'Most Recent',
};

const getMarketMode = (analysis: AnalysisResult): string => {
  if (analysis.strategyState === 'avoiding') return 'Avoiding';
  if (analysis.efficiency.verdict === 'clean' && analysis.macroStrength === 'strong') return 'Trending';
  if (analysis.efficiency.verdict === 'noisy') return 'Volatile';
  return 'Ranging';
};

export const MarketScanner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedMarket = (searchParams.get('market') as MarketType | 'all') || 'all';
  
  const userTier = 1;
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [biasFilter, setBiasFilter] = useState<BiasDirection | 'all'>('all');
  const [efficiencyFilter, setEfficiencyFilter] = useState<EfficiencyVerdict | 'all'>('all');
  const [strategyFilter, setStrategyFilter] = useState<StrategyState | 'all'>('all');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0);
  const [onlyActionable, setOnlyActionable] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realPrices, setRealPrices] = useState<Record<string, PriceData>>({});
  const [tickerDensity, setTickerDensity] = useState(() => getInitialDensity(userTier));
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [stocksExpanded, setStocksExpanded] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TickerInfo[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Detail drawer state
  const [drawerTicker, setDrawerTicker] = useState<TickerInfo | null>(null);
  const [drawerAnalysis, setDrawerAnalysis] = useState<AnalysisResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const handleDensityChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    setTickerDensity(num);
    sessionStorage.setItem('tickerDensity', value);
  }, []);

  useEffect(() => {
    fetchBatchPrices().then(prices => {
      setRealPrices(prices);
    });
  }, []);

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

  const getTickersForMarket = useCallback((type: MarketType): TickerInfo[] => {
    if (isFullVisibilityMarket(type)) return getTickersByType(type);
    return stocksExpanded ? getTickersByType(type) : getSnapshotTickers(type);
  }, [stocksExpanded]);

  const visibleTickers = useMemo(() => {
    if (selectedMarket === 'all') {
      const allMarkets: MarketType[] = ['stocks', 'crypto', 'forex', 'commodities', 'indices'];
      return allMarkets.flatMap(type => getTickersForMarket(type));
    }
    return getTickersForMarket(selectedMarket);
  }, [selectedMarket, stocksExpanded, getTickersForMarket]);

  // Pre-compute analysis for visible tickers
  const tickerAnalysisMap = useMemo(() => {
    const map = new Map<string, AnalysisResult>();
    for (const t of visibleTickers) {
      map.set(t.symbol, analyzeMarket(t, '1h'));
    }
    return map;
  }, [visibleTickers]);

  const filteredAndSortedTickers = useMemo(() => {
    let tickers = visibleTickers;

    // Apply bias filter
    if (biasFilter !== 'all') {
      tickers = tickers.filter(t => tickerAnalysisMap.get(t.symbol)?.bias === biasFilter);
    }

    // Apply efficiency filter
    if (efficiencyFilter !== 'all') {
      tickers = tickers.filter(t => tickerAnalysisMap.get(t.symbol)?.efficiency.verdict === efficiencyFilter);
    }

    // Apply strategy/trade state filter
    if (strategyFilter !== 'all') {
      tickers = tickers.filter(t => tickerAnalysisMap.get(t.symbol)?.strategyState === strategyFilter);
    }

    // Apply confidence threshold
    if (confidenceThreshold > 0) {
      tickers = tickers.filter(t => {
        const analysis = tickerAnalysisMap.get(t.symbol);
        return analysis && analysis.confidencePercent >= confidenceThreshold;
      });
    }

    // Only actionable toggle: exclude avoiding and watching with low confidence
    if (onlyActionable) {
      tickers = tickers.filter(t => {
        const analysis = tickerAnalysisMap.get(t.symbol);
        return analysis && analysis.strategyState !== 'avoiding' && analysis.confidencePercent >= 30;
      });
    }

    // Apply sorting
    if (sortBy !== 'default') {
      tickers = [...tickers].sort((a, b) => {
        const aA = tickerAnalysisMap.get(a.symbol);
        const bA = tickerAnalysisMap.get(b.symbol);
        if (!aA || !bA) return 0;

        switch (sortBy) {
          case 'confidence-desc':
            return bA.confidencePercent - aA.confidencePercent;
          case 'efficiency-desc':
            return bA.efficiency.score - aA.efficiency.score;
          case 'noise-asc':
            return aA.efficiency.score - bA.efficiency.score; // lower efficiency = more noise
          case 'updated':
            return bA.timestamp - aA.timestamp;
          default:
            return 0;
        }
      });
    }

    return tickers;
  }, [visibleTickers, biasFilter, efficiencyFilter, strategyFilter, confidenceThreshold, onlyActionable, sortBy, tickerAnalysisMap]);

  // Apply density limit for stocks
  const displayedTickers = useMemo(() => {
    if (selectedMarket === 'stocks' || selectedMarket === 'all') {
      if (selectedMarket === 'all') {
        const stockTickers = filteredAndSortedTickers.filter(t => t.type === 'stocks');
        const otherTickers = filteredAndSortedTickers.filter(t => t.type !== 'stocks');
        const limitedStocks = stockTickers.slice(0, tickerDensity);
        return [...limitedStocks, ...otherTickers];
      }
      return filteredAndSortedTickers.slice(0, tickerDensity);
    }
    return filteredAndSortedTickers;
  }, [filteredAndSortedTickers, tickerDensity, selectedMarket]);

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
    handleMarketChange('stocks');
    setBrowseModalOpen(false);
  }, []);

  const handleTickerClick = useCallback((ticker: TickerInfo) => {
    const analysis = tickerAnalysisMap.get(ticker.symbol) || null;
    setDrawerTicker(ticker);
    setDrawerAnalysis(analysis);
    setDrawerOpen(true);
  }, [tickerAnalysisMap]);

  const hasActiveFilters = biasFilter !== 'all' || efficiencyFilter !== 'all' || strategyFilter !== 'all' || confidenceThreshold > 0 || onlyActionable;
  const showDensityControl = selectedMarket === 'stocks' || selectedMarket === 'all';
  const showBrowseButton = (selectedMarket === 'stocks' || selectedMarket === 'all') && !stocksExpanded;

  const getSubtitle = () => {
    if (selectedMarket === 'all') return 'Showing a curated stock snapshot with full visibility across other markets.';
    if (selectedMarket === 'stocks') {
      return stocksExpanded 
        ? `Viewing full stock universe (${getFullMarketCount('stocks')} tickers). Use density control to manage view.`
        : 'Showing curated stock snapshot. Browse full market for complete coverage.';
    }
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
          <p className="text-muted-foreground mt-1 text-sm">{getSubtitle()}</p>
        </div>

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

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px] border-border/50">
              <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showDensityControl && (
            <Select value={tickerDensity.toString()} onValueChange={handleDensityChange}>
              <SelectTrigger className="w-[130px] border-border/50">
                <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Per view" />
              </SelectTrigger>
              <SelectContent>
                {DENSITY_OPTIONS.map((count) => (
                  <SelectItem key={count} value={count.toString()}>{count} tickers</SelectItem>
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
                {hasActiveFilters && <span className="ml-1.5 w-2 h-2 rounded-full bg-primary" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
              <DropdownMenuLabel>Bias</DropdownMenuLabel>
              {(['all', 'bullish', 'bearish'] as const).map(v => (
                <DropdownMenuCheckboxItem key={v} checked={biasFilter === v} onCheckedChange={() => setBiasFilter(v)}>
                  {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Efficiency</DropdownMenuLabel>
              {(['all', 'clean', 'mixed', 'noisy'] as const).map(v => (
                <DropdownMenuCheckboxItem key={v} checked={efficiencyFilter === v} onCheckedChange={() => setEfficiencyFilter(v)}>
                  {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Trade State</DropdownMenuLabel>
              {(['all', 'pressing', 'tracking', 'holding', 'watching', 'avoiding'] as const).map(v => (
                <DropdownMenuCheckboxItem key={v} checked={strategyFilter === v} onCheckedChange={() => setStrategyFilter(v)}>
                  {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Confidence Min</DropdownMenuLabel>
              {[0, 30, 50, 70].map(v => (
                <DropdownMenuCheckboxItem key={v} checked={confidenceThreshold === v} onCheckedChange={() => setConfidenceThreshold(v)}>
                  {v === 0 ? 'No minimum' : `≥ ${v}%`}
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-1.5">
                <Label htmlFor="actionable-toggle" className="text-xs font-normal cursor-pointer flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  Only Actionable
                </Label>
                <Switch
                  id="actionable-toggle"
                  checked={onlyActionable}
                  onCheckedChange={setOnlyActionable}
                  className="scale-75"
                />
              </div>
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

          <div className="flex items-center border border-border/50 rounded-lg p-1">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}>
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}>
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
                <TabsTrigger key={type} value={type} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {showBrowseButton && (
          <Button variant="outline" onClick={() => setBrowseModalOpen(true)} className="border-border/50 shrink-0 hidden sm:flex">
            <Globe className="w-4 h-4 mr-2" />
            Browse Full Stocks
          </Button>
        )}
      </div>

      {showBrowseButton && (
        <Button variant="outline" onClick={() => setBrowseModalOpen(true)} className="w-full border-border/50 sm:hidden">
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
          <div 
            key={ticker.symbol} 
            onClick={(e) => {
              e.preventDefault();
              handleTickerClick(ticker);
            }}
            className="cursor-pointer"
          >
            <TickerCard 
              ticker={ticker} 
              realPriceData={realPrices[ticker.symbol]}
              analysis={tickerAnalysisMap.get(ticker.symbol)}
              showIntelligenceStrip
            />
          </div>
        ))}
      </div>

      {displayedTickers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tickers match your filters</p>
        </div>
      )}

      {/* Browse Market Modal */}
      <BrowseMarketModal
        open={browseModalOpen}
        onOpenChange={setBrowseModalOpen}
        onSelectMarket={handleExpandStocks}
        stocksExpanded={stocksExpanded}
      />

      {/* Scanner Detail Drawer */}
      <ScannerDetailDrawer
        ticker={drawerTicker}
        analysis={drawerAnalysis}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
};
