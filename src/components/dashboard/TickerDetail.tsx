import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap, 
  Target,
  BarChart3,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getTickerBySymbol, TIMEFRAME_LABELS, MARKET_LABELS } from '@/lib/market';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { BiasDirection, EfficiencyVerdict, StrategyState, Timeframe } from '@/lib/market/types';
import { cn } from '@/lib/utils';

const biasColors: Record<BiasDirection, string> = {
  bullish: 'text-neural-green',
  bearish: 'text-neural-red',
};

const biasBgColors: Record<BiasDirection, string> = {
  bullish: 'bg-neural-green/20 border-neural-green/30',
  bearish: 'bg-neural-red/20 border-neural-red/30',
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

export const TickerDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const ticker = getTickerBySymbol(symbol || '');

  const analysis = useMemo(() => {
    if (!ticker) return null;
    return analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);
  }, [ticker]);

  if (!ticker || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-display font-bold mb-2">Ticker Not Found</h2>
        <p className="text-muted-foreground mb-4">The requested ticker doesn't exist.</p>
        <Button asChild>
          <Link to="/dashboard">Back to Scanner</Link>
        </Button>
      </div>
    );
  }

  const primaryAnalysis = analysis.analyses['1h'];
  const BiasIcon = primaryAnalysis.bias === 'bullish' ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6">
      {/* Back button & header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              {ticker.symbol}
            </h1>
            <Badge variant="outline" className="text-xs">
              {MARKET_LABELS[ticker.type]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{ticker.name}</p>
        </div>
      </div>

      {/* Main metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Price & Bias */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Current Price</span>
                <div className={cn('flex items-center gap-1', biasColors[primaryAnalysis.bias])}>
                  <BiasIcon className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">{primaryAnalysis.bias}</span>
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {primaryAnalysis.currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: ticker.type === 'forex' ? 4 : 2,
                  maximumFractionDigits: ticker.type === 'forex' ? 5 : 2,
                })}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Efficiency */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Efficiency</span>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-foreground">
                  {(primaryAnalysis.efficiency.score * 100).toFixed(0)}%
                </p>
                <Badge
                  variant="outline"
                  className={cn('text-xs', efficiencyColors[primaryAnalysis.efficiency.verdict])}
                >
                  {primaryAnalysis.efficiency.verdict.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Confidence */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Confidence</span>
                <Target className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-foreground">
                  {primaryAnalysis.confidencePercent.toFixed(0)}%
                </p>
                <Progress value={primaryAnalysis.confidencePercent} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Strategy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Strategy State</span>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </div>
              <Badge
                variant="outline"
                className={cn('text-lg px-4 py-2', strategyColors[primaryAnalysis.strategyState])}
              >
                {primaryAnalysis.strategyState.toUpperCase()}
              </Badge>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Narrative */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Neural Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg text-foreground leading-relaxed">
              {primaryAnalysis.narrative}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Multi-timeframe analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Multi-Timeframe View
              </CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  analysis.alignmentLevel === 'aligned'
                    ? 'bg-neural-green/20 text-neural-green border-neural-green/30'
                    : analysis.alignmentLevel === 'conflicting'
                    ? 'bg-neural-red/20 text-neural-red border-neural-red/30'
                    : 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                )}
              >
                {analysis.alignmentLevel.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(analysis.analyses).map(([tf, tfAnalysis]) => (
                <div
                  key={tf}
                  className={cn(
                    'p-4 rounded-xl border',
                    biasBgColors[tfAnalysis.bias]
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-display font-bold">
                      {TIMEFRAME_LABELS[tf as Timeframe]}
                    </span>
                    <span className={cn('text-sm font-bold uppercase', biasColors[tfAnalysis.bias])}>
                      {tfAnalysis.bias}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efficiency</span>
                      <span className="font-medium">
                        {tfAnalysis.efficiency.verdict.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-medium">{tfAnalysis.confidencePercent.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Strategy</span>
                      <span className="font-medium">{tfAnalysis.strategyState.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Aggregated score */}
            <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Aggregated Bias Score</p>
                  <p className="font-display text-2xl font-bold">
                    {analysis.aggregatedScore > 0 ? '+' : ''}
                    {(analysis.aggregatedScore * 100).toFixed(1)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-lg px-4 py-2', biasBgColors[analysis.dominantBias])}
                >
                  {analysis.dominantBias.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
