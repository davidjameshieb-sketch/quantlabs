import { useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  Clock,
  BarChart3,
  Share2,
  Download,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTickerBySymbol, TIMEFRAME_LABELS, MARKET_LABELS } from '@/lib/market';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { BiasDirection, Timeframe, MarketType } from '@/lib/market/types';
import distributionTerminalTwin from '@/assets/distribution-terminal-twin.jpg';
import { HistoricalOutcomesPanel } from './HistoricalOutcomesPanel';
import { MetricGauge } from './MetricGauge';
import { NeuralSignalMatrix } from './NeuralSignalMatrix';
import { EfficiencyInsight } from './EfficiencyInsight';
import { ConfidenceInsight } from './ConfidenceInsight';
import { StrategyInsight } from './StrategyInsight';
import { TrendCoreVisual } from './TrendCoreVisual';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { TickerSnapshot } from './TickerSnapshot';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// Helper to get freshness level based on market type
const getMarketFreshness = (marketType: MarketType): 'live' | 'nightly' | 'hourly' => {
  // Forex trades 24/5, use hourly for FX
  if (marketType === 'forex') return 'hourly';
  // Crypto trades 24/7, use live
  if (marketType === 'crypto') return 'live';
  // Stocks/indices use nightly (market closes)
  return 'nightly';
};

const biasColors: Record<BiasDirection, string> = {
  bullish: 'text-neural-green',
  bearish: 'text-neural-red',
};

const biasBgColors: Record<BiasDirection, string> = {
  bullish: 'bg-neural-green/20 border-neural-green/30',
  bearish: 'bg-neural-red/20 border-neural-red/30',
};

export const TickerDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const ticker = getTickerBySymbol(symbol || '');
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);

  const analysis = useMemo(() => {
    if (!ticker) return null;
    return analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);
  }, [ticker]);

  const freshnessLevel = ticker ? getMarketFreshness(ticker.type) : 'nightly';

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

  // Calculate MTF aligned signal
  const timeframes = Object.keys(analysis.analyses) as Timeframe[];
  const biases = timeframes.map(tf => analysis.analyses[tf].bias);
  const mtfAligned = biases.every(b => b === biases[0]);
  
  const signalsWithMtf = {
    ...primaryAnalysis.signals,
    mtfAligned,
  };

  return (
    <>
    <div className="space-y-6">
      {/* Back button & header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              {ticker.symbol}
            </h1>
            <Badge variant="outline" className="text-xs">
              {MARKET_LABELS[ticker.type]}
            </Badge>
            <DataFreshnessBadge level={freshnessLevel} />
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSnapshot(true)}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <Share2 className="w-4 h-4 mr-1.5" />
                Snapshot
              </Button>
              <div className={cn('flex items-center gap-1', biasColors[primaryAnalysis.bias])}>
                <BiasIcon className="w-5 h-5" />
                <span className="text-sm font-bold uppercase">{primaryAnalysis.bias}</span>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground">{ticker.name}</p>
        </div>
      </div>

      {/* Digital Twin — Isometric Distribution Terminal */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative rounded-xl overflow-hidden border border-border/50"
        style={{ height: 350 }}
      >
        <img
          src={distributionTerminalTwin}
          alt="David-Atlas Distribution Terminal — Isometric Digital Twin"
          className="w-full h-full object-cover"
        />
        {/* AR overlay — live metric badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 pointer-events-none">
          <span className="font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-black/60 border border-yellow-400/50 text-yellow-300">
            ⚡ MAIN LINE VELOCITY: OPTIMAL (H &gt; 0.62)
          </span>
          <span className="font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-black/60 border border-green-400/50 text-green-300">
            52 TRAILER SURGE · Z-OFI &gt; 2.5σ · MAX VACUUM
          </span>
        </div>
        <div className="absolute top-3 right-3 pointer-events-none">
          <span className="font-mono text-[9px] font-bold px-2 py-1 rounded bg-black/70 border border-primary/40 text-primary">
            DAVID-ATLAS DIGITAL TWIN · {ticker.symbol}
          </span>
        </div>
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="font-mono text-[9px] font-bold px-2 py-1 rounded bg-red-900/80 border border-red-500/60 text-red-300">
            🔴 FLOOR OBSTRUCTION: HIGH FRICTION (E &lt; 0.3) · AVOID LANE
          </span>
        </div>
      </motion.div>

      {/* Neural Signal Matrix */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <NeuralSignalMatrix 
          signals={signalsWithMtf} 
          className="border-border/50 bg-gradient-to-br from-card to-muted/10"
        />
      </motion.div>

      {/* AI Insight Cards - 3 column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <EfficiencyInsight
            efficiency={primaryAnalysis.efficiency}
            reason={primaryAnalysis.efficiencyReason}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <ConfidenceInsight
            confidence={primaryAnalysis.confidencePercent}
            trendCore={primaryAnalysis.trendCore}
            atr={primaryAnalysis.atr}
            macroStrength={primaryAnalysis.macroStrength}
            bias={primaryAnalysis.bias}
            reason={primaryAnalysis.confidenceReason}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <StrategyInsight
            strategyState={primaryAnalysis.strategyState}
            macroStrength={primaryAnalysis.macroStrength}
            efficiencyVerdict={primaryAnalysis.efficiency.verdict}
            confidence={primaryAnalysis.confidencePercent}
            efficiencyScore={primaryAnalysis.efficiency.score}
            reason={primaryAnalysis.strategyReason}
          />
        </motion.div>
      </div>

      {/* Trend Core Visual + Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <TrendCoreVisual
            trendCore={primaryAnalysis.trendCore}
            currentPrice={primaryAnalysis.currentPrice}
            bias={primaryAnalysis.bias}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          <Card className="border-border/50 bg-card/50 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">Performance Gauges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap justify-around gap-4 py-4">
                <MetricGauge
                  value={primaryAnalysis.confidencePercent}
                  label="Confidence"
                  colorClass="text-primary"
                  size="sm"
                />
                <MetricGauge
                  value={primaryAnalysis.efficiency.score * 100}
                  label="Efficiency"
                  colorClass={
                    primaryAnalysis.efficiency.verdict === 'clean' 
                      ? 'text-neural-green' 
                      : primaryAnalysis.efficiency.verdict === 'noisy' 
                      ? 'text-neural-red' 
                      : 'text-neural-orange'
                  }
                  size="sm"
                />
                <MetricGauge
                  value={Math.abs(analysis.aggregatedScore * 100)}
                  label="MTF Score"
                  colorClass={analysis.dominantBias === 'bullish' ? 'text-neural-green' : 'text-neural-red'}
                  size="sm"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Narrative */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      >
        <HistoricalOutcomesPanel ticker={ticker} />
      </motion.div>

      {/* Multi-timeframe analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.8 }}
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
                <motion.div
                  key={tf}
                  className={cn(
                    'p-4 rounded-xl border transition-all hover:scale-[1.02]',
                    biasBgColors[tfAnalysis.bias]
                  )}
                  whileHover={{ boxShadow: '0 0 20px rgba(0,0,0,0.2)' }}
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
                </motion.div>
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

    {/* Snapshot Modal */}
    {showSnapshot && ticker && analysis && (
      <TickerSnapshot
        ticker={ticker}
        analysis={analysis}
        primaryAnalysis={primaryAnalysis}
        onClose={() => setShowSnapshot(false)}
      />
    )}
    </>
  );
};
