import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, Timer, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TICKERS, analyzeMarket } from '@/lib/market';
import { cn } from '@/lib/utils';
import type { AnalysisResult, StrategyState } from '@/lib/market/types';

type ViewType = 'long' | 'short' | 'noisy' | 'waiting';

interface ConvictionViewsProps {
  selectedView?: ViewType | 'all';
  limit?: number;
}

interface ViewConfig {
  id: ViewType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  filter: (analysis: AnalysisResult) => boolean;
}

const VIEW_CONFIGS: ViewConfig[] = [
  {
    id: 'long',
    label: 'High-Conviction Long',
    description: 'Strong bullish structure with clean efficiency',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-[hsl(var(--neural-green))]',
    filter: (a) => a.bias === 'bullish' && a.confidencePercent > 70 && a.efficiency.verdict !== 'noisy',
  },
  {
    id: 'short',
    label: 'High-Conviction Short',
    description: 'Strong bearish structure with clean efficiency',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-[hsl(var(--neural-red))]',
    filter: (a) => a.bias === 'bearish' && a.confidencePercent > 70 && a.efficiency.verdict !== 'noisy',
  },
  {
    id: 'noisy',
    label: 'Noisy / Choppy',
    description: 'High noise, unclear structure — avoid',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-[hsl(var(--neural-orange))]',
    filter: (a) => a.efficiency.verdict === 'noisy' || a.strategyState === 'avoiding',
  },
  {
    id: 'waiting',
    label: 'Waiting / Compression',
    description: 'Low volatility, developing conditions',
    icon: <Timer className="w-4 h-4" />,
    color: 'text-muted-foreground',
    filter: (a) => a.strategyState === 'watching' && a.confidencePercent < 50,
  },
];

export const ConvictionViews = ({ selectedView = 'all', limit = 5 }: ConvictionViewsProps) => {
  const analyzedTickers = useMemo(() => {
    return TICKERS.map(ticker => ({
      ticker,
      analysis: analyzeMarket(ticker, '1h'),
    }));
  }, []);

  const getViewResults = (view: ViewConfig) => {
    return analyzedTickers
      .filter(({ analysis }) => view.filter(analysis))
      .sort((a, b) => b.analysis.confidencePercent - a.analysis.confidencePercent)
      .slice(0, limit);
  };

  const viewsToShow = selectedView === 'all' 
    ? VIEW_CONFIGS 
    : VIEW_CONFIGS.filter(v => v.id === selectedView);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {viewsToShow.map((view) => {
        const results = getViewResults(view);
        
        return (
          <Card key={view.id} className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <span className={view.color}>{view.icon}</span>
                  {view.label}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {results.length} found
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{view.description}</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No assets match this view
                  </p>
                ) : (
                  <div className="space-y-2">
                    {results.map(({ ticker, analysis }, index) => (
                      <motion.div
                        key={ticker.symbol}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          to={`/dashboard/ticker/${ticker.symbol}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                {ticker.symbol}
                              </p>
                              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {ticker.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className={cn(
                                "text-xs font-medium",
                                analysis.bias === 'bullish' ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                              )}>
                                {analysis.confidencePercent.toFixed(0)}%
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {analysis.efficiency.verdict}
                              </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
