import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Activity, Zap, Clock, Brain, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BiasDirection, 
  EfficiencyVerdict, 
  StrategyState,
  TickerInfo,
  AnalysisResult,
} from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { MiniSparkline } from './MiniSparkline';
import { cn } from '@/lib/utils';
import type { PriceData } from '@/lib/market/batchPriceService';

interface TickerCardProps {
  ticker: TickerInfo;
  index?: number;
  realPriceData?: PriceData | null;
  realPrice?: number | null;
  analysis?: AnalysisResult;
  showIntelligenceStrip?: boolean;
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

const getMarketMode = (a: AnalysisResult): string => {
  if (a.strategyState === 'avoiding') return 'Avoiding';
  if (a.efficiency.verdict === 'clean' && a.macroStrength === 'strong') return 'Trending';
  if (a.efficiency.verdict === 'noisy') return 'Volatile';
  return 'Ranging';
};

const getNoiseLabel = (score: number): { label: string; color: string } => {
  if (score > 0.6) return { label: 'Low', color: 'text-neural-green' };
  if (score > 0.3) return { label: 'Med', color: 'text-neural-orange' };
  return { label: 'High', color: 'text-neural-red' };
};

export const TickerCard = memo(({ ticker, realPriceData, realPrice, analysis: providedAnalysis, showIntelligenceStrip }: TickerCardProps) => {
  const analysis = useMemo(() => providedAnalysis || analyzeMarket(ticker, '1h'), [ticker, providedAnalysis]);
  
  const priceData = realPriceData;
  const displayPrice = priceData?.price ?? realPrice ?? analysis.currentPrice;
  const priceSource = priceData?.source;
  const hasRealPrice = !!(priceData?.price || realPrice);
  
  const BiasIcon = biasIcons[analysis.bias];
  const noise = getNoiseLabel(analysis.efficiency.score);

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
              {displayPrice.toLocaleString(undefined, {
                minimumFractionDigits: ticker.type === 'forex' ? 4 : ticker.type === 'crypto' ? 2 : 2,
                maximumFractionDigits: ticker.type === 'forex' ? 5 : ticker.type === 'crypto' ? 6 : 2,
              })}
            </p>
            {/* Source label */}
            {priceSource && hasRealPrice && (
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {priceSource}
              </p>
            )}
            {!hasRealPrice && (
              <p className="text-xs text-neural-orange/70 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Simulated
              </p>
            )}
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

          {/* Intelligence Strip */}
          {showIntelligenceStrip && (
            <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium">{getMarketMode(analysis)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Noise</span>
                  <span className={cn('font-medium', noise.color)}>{noise.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Efficiency</span>
                  <span className="font-medium">{(analysis.efficiency.score * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI</span>
                  <span className={cn('font-medium', biasColors[analysis.bias])}>
                    {analysis.bias.charAt(0).toUpperCase() + analysis.bias.slice(1)} {analysis.confidencePercent.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', strategyColors[analysis.strategyState])}>
                  {analysis.strategyState.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground/70 flex items-center gap-1">
                  <Brain className="w-3 h-3" />
                  Click for details
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
});