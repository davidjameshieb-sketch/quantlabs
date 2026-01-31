import { useState } from 'react';
import { ChevronRight, Globe, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MarketType } from '@/lib/market/types';
import { MARKET_LABELS, getFullMarketCount } from '@/lib/market';
import { SECTOR_ETFS } from '@/lib/market/sectorETFs';

interface BrowseMarketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMarket: (type: MarketType) => void;
  loadState: Record<MarketType, 'snapshot' | 'full'>;
}

interface MarketOption {
  type: MarketType;
  label: string;
  description: string;
  subsets?: { label: string; description: string }[];
}

const MARKET_OPTIONS: MarketOption[] = [
  {
    type: 'stocks',
    label: 'Stocks',
    description: 'S&P 500, NASDAQ-100, and major US equities',
    subsets: [
      { label: 'S&P 500', description: '500 large-cap companies' },
      { label: 'NASDAQ-100', description: 'Top tech & growth stocks' },
    ],
  },
  {
    type: 'crypto',
    label: 'Crypto',
    description: 'Top 100 cryptocurrencies by market cap',
  },
  {
    type: 'forex',
    label: 'Forex',
    description: 'Major, minor, and exotic currency pairs',
  },
  {
    type: 'commodities',
    label: 'Commodities',
    description: 'Precious metals, energy, and agriculture ETFs',
  },
  {
    type: 'indices',
    label: 'Indices & Sectors',
    description: 'Global indices and S&P 500 sector ETFs',
  },
];

export const BrowseMarketModal = ({
  open,
  onOpenChange,
  onSelectMarket,
  loadState,
}: BrowseMarketModalProps) => {
  const [selectedTab, setSelectedTab] = useState<'markets' | 'sectors'>('markets');

  const handleSelectMarket = (type: MarketType) => {
    onSelectMarket(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Browse Full Market Coverage
          </DialogTitle>
          <DialogDescription>
            Expand your view to analyze complete market universes. Select a market to load all available tickers.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'markets' | 'sectors')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="sectors">S&P 500 Sectors</TabsTrigger>
          </TabsList>

          <TabsContent value="markets" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {MARKET_OPTIONS.map((option) => {
                  const isExpanded = loadState[option.type] === 'full';
                  const count = getFullMarketCount(option.type);
                  
                  return (
                    <button
                      key={option.type}
                      onClick={() => handleSelectMarket(option.type)}
                      className="w-full text-left p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {option.label}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {count} tickers
                            </Badge>
                            {isExpanded && (
                              <Badge variant="default" className="text-xs bg-primary/20 text-primary border-primary/30">
                                Loaded
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sectors" className="mt-4">
            <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-sm text-muted-foreground">
                <TrendingUp className="w-4 h-4 inline mr-1.5 text-primary" />
                S&P 500 sector ETFs provide macro context for individual stocks. 
                They are included in the Indices tab for sector rotation analysis.
              </p>
            </div>
            
            <ScrollArea className="h-[340px] pr-4">
              <div className="grid grid-cols-2 gap-2">
                {SECTOR_ETFS.map((etf) => (
                  <div
                    key={etf.symbol}
                    className="p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-foreground">
                        {etf.symbol}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Sector ETF
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {etf.sectorName}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="mt-4">
              <Button
                onClick={() => handleSelectMarket('indices')}
                className="w-full"
                variant="outline"
              >
                Load All Indices & Sectors
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
