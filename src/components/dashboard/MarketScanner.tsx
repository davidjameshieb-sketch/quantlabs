import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Filter, Grid3X3, List, RefreshCw } from 'lucide-react';
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
import { TICKERS, MARKET_LABELS, getTickersByType } from '@/lib/market';
import { MarketType, BiasDirection, EfficiencyVerdict } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { clearMarketDataCache } from '@/lib/market/dataGenerator';

export const MarketScanner = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMarket = (searchParams.get('market') as MarketType) || 'all';
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [biasFilter, setBiasFilter] = useState<BiasDirection | 'all'>('all');
  const [efficiencyFilter, setEfficiencyFilter] = useState<EfficiencyVerdict | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredTickers = useMemo(() => {
    let tickers = selectedMarket === 'all' 
      ? TICKERS 
      : getTickersByType(selectedMarket as MarketType);

    // Apply bias filter
    if (biasFilter !== 'all') {
      tickers = tickers.filter(t => {
        const analysis = analyzeMarket(t, '1h');
        return analysis.bias === biasFilter;
      });
    }

    // Apply efficiency filter
    if (efficiencyFilter !== 'all') {
      tickers = tickers.filter(t => {
        const analysis = analyzeMarket(t, '1h');
        return analysis.efficiency.verdict === efficiencyFilter;
      });
    }

    return tickers;
  }, [selectedMarket, biasFilter, efficiencyFilter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    clearMarketDataCache();
    // Force re-render
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleMarketChange = (market: string) => {
    if (market === 'all') {
      searchParams.delete('market');
    } else {
      searchParams.set('market', market);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              Market Scanner
            </h1>
            <DataFreshnessBadge level="nightly" />
          </div>
          <p className="text-muted-foreground mt-1">
            Structure analysis across all markets
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
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredTickers.length} {filteredTickers.length === 1 ? 'ticker' : 'tickers'}
      </p>

      {/* Ticker grid */}
      <motion.div
        key={`${selectedMarket}-${biasFilter}-${efficiencyFilter}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'flex flex-col gap-3'
        }
      >
        {filteredTickers.map((ticker, index) => (
          <TickerCard key={ticker.symbol} ticker={ticker} index={index} />
        ))}
      </motion.div>

      {filteredTickers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tickers match your filters</p>
        </div>
      )}
    </div>
  );
};
