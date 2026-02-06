import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, TrendingDown, Activity, Zap, Target, 
  BarChart3, AlertTriangle, Clock, DollarSign, Brain 
} from 'lucide-react';
import { TickerInfo, AnalysisResult } from '@/lib/market/types';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { computeTickerOutcomes, DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, formatDollar } from '@/lib/market/backtestEngine';
import { cn } from '@/lib/utils';

interface ScannerDetailDrawerProps {
  ticker: TickerInfo | null;
  analysis: AnalysisResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getMarketMode = (analysis: AnalysisResult): string => {
  if (analysis.strategyState === 'avoiding') return 'Avoiding';
  if (analysis.efficiency.verdict === 'clean' && analysis.macroStrength === 'strong') return 'Trending';
  if (analysis.efficiency.verdict === 'noisy') return 'Volatile';
  return 'Ranging';
};

const getNoiseLevel = (analysis: AnalysisResult): { label: string; color: string } => {
  const score = analysis.efficiency.score;
  if (score > 0.6) return { label: 'Low', color: 'text-neural-green' };
  if (score > 0.3) return { label: 'Medium', color: 'text-neural-orange' };
  return { label: 'High', color: 'text-neural-red' };
};

export const ScannerDetailDrawer = ({ ticker, analysis, open, onOpenChange }: ScannerDetailDrawerProps) => {
  const outcomes = useMemo(() => {
    if (!ticker) return null;
    return computeTickerOutcomes(ticker, '1h', 500, undefined, DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT);
  }, [ticker]);

  if (!ticker || !analysis) return null;

  const marketMode = getMarketMode(analysis);
  const noise = getNoiseLevel(analysis);
  const bullishOutcome = outcomes?.outcomes['high-conviction-bullish'];
  const fr10 = bullishOutcome?.forwardReturns.find(fr => fr.horizon === 10);
  const ps = bullishOutcome?.positionSizing;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg border-border/50 bg-background">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-display text-xl flex items-center gap-2">
              {ticker.symbol}
              <span className="text-sm font-normal text-muted-foreground">{ticker.name}</span>
            </SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] pr-4">
          <div className="space-y-5">
            {/* AI Reasoning Summary */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">AI Reasoning</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.narrative}</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Efficiency:</span> {analysis.efficiencyReason}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Confidence:</span> {analysis.confidenceReason}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Strategy:</span> {analysis.strategyReason}
                </p>
              </div>
            </div>

            {/* Key Drivers Grid */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Key Drivers
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Market Mode</p>
                  <p className="text-base font-bold">{marketMode}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Trend Strength</p>
                  <p className={cn('text-base font-bold', 
                    analysis.macroStrength === 'strong' ? 'text-neural-green' :
                    analysis.macroStrength === 'moderate' ? 'text-neural-orange' : 'text-neural-red'
                  )}>
                    {analysis.macroStrength.toUpperCase()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Noise Level</p>
                  <p className={cn('text-base font-bold', noise.color)}>{noise.label}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Efficiency Score</p>
                  <p className="text-base font-bold">{(analysis.efficiency.score * 100).toFixed(0)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Volatility (ATR)</p>
                  <p className="text-base font-bold">{analysis.atr.toFixed(4)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">Conviction</p>
                  <p className={cn('text-base font-bold',
                    analysis.conviction === 'gaining' ? 'text-neural-green' : 'text-neural-red'
                  )}>
                    {analysis.conviction.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>

            {/* Backtest Summary */}
            {ps && fr10 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Backtest Summary
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                    <DollarSign className="w-3 h-3 mr-0.5" />
                    ${DEFAULT_ACCOUNT_SIZE.toLocaleString()}
                  </Badge>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="text-lg font-bold">{ps.totalTrades}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className={cn('text-lg font-bold',
                      fr10.winRate > 0.5 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {(fr10.winRate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Avg Return</p>
                    <p className={cn('text-lg font-bold',
                      fr10.avgReturn > 0 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {(fr10.avgReturn * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={cn('text-lg font-bold',
                      ps.totalPnl >= 0 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {formatDollar(ps.totalPnl)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Max Drawdown</p>
                    <p className="text-lg font-bold text-neural-red">
                      -${ps.maxDrawdown.toFixed(0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                    <p className={cn('text-lg font-bold',
                      ps.sharpeRatio > 1 ? 'text-neural-green' : 
                      ps.sharpeRatio > 0 ? 'text-neural-orange' : 'text-neural-red'
                    )}>
                      {ps.sharpeRatio.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Signal States */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Active Signals
              </h3>
              <div className="flex flex-wrap gap-2">
                {analysis.signals.trendActive && (
                  <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30">Trend Active</Badge>
                )}
                {analysis.signals.cleanFlow && (
                  <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30">Clean Flow</Badge>
                )}
                {analysis.signals.highConviction && (
                  <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30">High Conviction</Badge>
                )}
                {analysis.signals.structureGaining && (
                  <Badge className="bg-primary/20 text-primary border-primary/30">Structure Gaining</Badge>
                )}
                {analysis.signals.trendingMode && (
                  <Badge className="bg-primary/20 text-primary border-primary/30">Trending Mode</Badge>
                )}
                {!analysis.signals.trendActive && !analysis.signals.cleanFlow && !analysis.signals.highConviction && (
                  <Badge className="bg-muted text-muted-foreground border-border/50">No Strong Signals</Badge>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center italic pt-2">
              Historical patterns do not guarantee future outcomes. Backtest Capital: ${DEFAULT_ACCOUNT_SIZE.toLocaleString()} (default).
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
