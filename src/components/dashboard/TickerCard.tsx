import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BiasDirection, 
  EfficiencyVerdict, 
  StrategyState,
  TickerInfo 
} from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { MiniSparkline } from './MiniSparkline';
import { cn } from '@/lib/utils';
interface TickerCardProps {
  ticker: TickerInfo;
  index?: number;
}

const biasColors: Record<BiasDirection, string> = {
  bullish: 'text-neural-green',
  bearish: 'text-neural-red',
};

const biasIcons: Record<BiasDirection, typeof TrendingUp> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
};

const efficiencyColors: Record<EfficiencyVerdict, string> = {
  clean: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  mixed: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  noisy: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

const strategyColors: Record<StrategyState, string> = {
  pressing: 'bg-neural-cyan/20 text-neural-cyan border-neural-cyan/30',
  tracking: 'bg-neural-purple/20 text-neural-purple border-neural-purple/30',
  holding: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  watching: 'bg-muted text-muted-foreground border-border',
  avoiding: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

export const TickerCard = memo(({ ticker, index = 0 }: TickerCardProps) => {
  const analysis = useMemo(() => analyzeMarket(ticker, '1h'), [ticker]);
  
  const BiasIcon = biasIcons[analysis.bias];

  return (
    <Link to={`/dashboard/ticker/${ticker.symbol}`}>
      <Card className="group relative overflow-hidden border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card/80 transition-all duration-300 cursor-pointer">
        {/* Hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5" />
        </div>

        <CardContent className="relative p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-display font-bold text-lg text-foreground">
                {ticker.symbol}
              </h3>
              <p className="text-xs text-muted-foreground">{ticker.name}</p>
            </div>
            <div className={cn('flex items-center gap-1', biasColors[analysis.bias])}>
              <BiasIcon className="w-5 h-5" />
              <span className="font-bold text-sm uppercase">{analysis.bias}</span>
            </div>
          </div>

          {/* Mini Sparkline Chart */}
          <MiniSparkline ticker={ticker} height={50} className="mb-2 -mx-1" />

          {/* Price */}
          <div className="mb-3">
            <p className="text-2xl font-bold text-foreground">
              {analysis.currentPrice.toLocaleString(undefined, {
                minimumFractionDigits: ticker.type === 'forex' ? 4 : ticker.type === 'crypto' ? 2 : 2,
                maximumFractionDigits: ticker.type === 'forex' ? 5 : ticker.type === 'crypto' ? 6 : 2,
              })}
            </p>
          </div>

          {/* Metrics */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge
              variant="outline"
              className={cn('text-xs', efficiencyColors[analysis.efficiency.verdict])}
            >
              <Activity className="w-3 h-3 mr-1" />
              {analysis.efficiency.verdict.toUpperCase()}
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-xs', strategyColors[analysis.strategyState])}
            >
              <Zap className="w-3 h-3 mr-1" />
              {analysis.strategyState.toUpperCase()}
            </Badge>
          </div>

          {/* Confidence bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <span className="text-foreground font-medium">
                {analysis.confidencePercent.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary"
                style={{ width: `${analysis.confidencePercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
