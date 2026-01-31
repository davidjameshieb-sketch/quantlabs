import { ChevronRight, TrendingUp, BarChart3 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getFullMarketCount } from '@/lib/market';
import { SECTOR_ETFS } from '@/lib/market/sectorETFs';

interface BrowseMarketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMarket: () => void;
  stocksExpanded: boolean;
}

interface StockSubset {
  label: string;
  description: string;
  count: string;
}

const STOCK_SUBSETS: StockSubset[] = [
  { label: 'S&P 500', description: 'Large-cap US equities', count: '500' },
  { label: 'NASDAQ-100', description: 'Top tech & growth stocks', count: '100' },
  { label: 'Russell 2000', description: 'Small-cap stocks (via IWM)', count: 'ETF' },
];

export const BrowseMarketModal = ({
  open,
  onOpenChange,
  onSelectMarket,
  stocksExpanded,
}: BrowseMarketModalProps) => {
  const stockCount = getFullMarketCount('stocks');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Browse Full Stock Universe
          </DialogTitle>
          <DialogDescription>
            Expand your view to analyze the complete stock universe. Other markets (crypto, forex, commodities, indices) already show full visibility.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {/* Main expand action */}
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      All Stocks
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {stockCount} tickers
                    </Badge>
                    {stocksExpanded && (
                      <Badge variant="default" className="text-xs bg-primary/20 text-primary border-primary/30">
                        Loaded
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    S&P 500, NASDAQ-100, and major US equities
                  </p>
                </div>
              </div>
              
              <Button
                onClick={onSelectMarket}
                disabled={stocksExpanded}
                className="w-full"
              >
                {stocksExpanded ? 'Already Expanded' : 'Load Full Stock Universe'}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {/* Stock subsets info */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Included Universes
              </p>
              {STOCK_SUBSETS.map((subset) => (
                <div
                  key={subset.label}
                  className="p-3 rounded-lg border border-border/50 bg-muted/20"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">
                      {subset.label}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {subset.count}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {subset.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Sector ETFs reference */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  S&P 500 Sector ETFs
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Sector ETFs are available in the Indices & Sectors tab with full visibility. Use them for macro context and rotation analysis.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SECTOR_ETFS.slice(0, 6).map((etf) => (
                  <Badge key={etf.symbol} variant="outline" className="text-xs">
                    {etf.symbol}
                  </Badge>
                ))}
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  +{SECTOR_ETFS.length - 6} more
                </Badge>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
