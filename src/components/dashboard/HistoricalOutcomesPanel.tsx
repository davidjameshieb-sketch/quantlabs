import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Clock, TrendingUp, TrendingDown, AlertTriangle, Zap, History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TickerInfo } from '@/lib/market/types';
import { 
  computeTickerOutcomes, 
  ConditionLabel, 
  OutcomeMetrics,
  getConditionDisplayText,
  getConditionColor,
  formatOutcomeSummary 
} from '@/lib/market/backtestEngine';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { cn } from '@/lib/utils';

interface HistoricalOutcomesPanelProps {
  ticker: TickerInfo;
  className?: string;
}

const HORIZON_LABELS: Record<number, string> = {
  1: '1 Bar',
  3: '3 Bars',
  5: '5 Bars',
  10: '10 Bars',
  20: '20 Bars',
};

export const HistoricalOutcomesPanel = ({ ticker, className }: HistoricalOutcomesPanelProps) => {
  const [selectedCondition, setSelectedCondition] = useState<ConditionLabel>('high-conviction-bullish');
  const [selectedHorizon, setSelectedHorizon] = useState<number>(10);
  
  // Compute outcomes for ticker
  const outcomes = useMemo(() => {
    return computeTickerOutcomes(ticker, '1h', 500);
  }, [ticker]);
  
  const selectedOutcome = outcomes.outcomes[selectedCondition];
  const selectedForwardReturn = selectedOutcome?.forwardReturns.find(fr => fr.horizon === selectedHorizon);
  
  const conditionLabels: ConditionLabel[] = [
    'high-conviction-bullish',
    'high-conviction-bearish',
    'mixed',
    'noisy-avoid',
    'compression-breakout-imminent',
  ];
  
  const getConditionIcon = (label: ConditionLabel) => {
    switch (label) {
      case 'high-conviction-bullish': return <TrendingUp className="w-4 h-4" />;
      case 'high-conviction-bearish': return <TrendingDown className="w-4 h-4" />;
      case 'mixed': return <AlertTriangle className="w-4 h-4" />;
      case 'noisy-avoid': return <AlertTriangle className="w-4 h-4" />;
      case 'compression-breakout-imminent': return <Zap className="w-4 h-4" />;
    }
  };
  
  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <CardTitle className="font-display text-lg">Historical Condition Outcomes</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Shows what historically happened after each market condition was detected. This is pattern analysis, not prediction.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <DataFreshnessBadge level="historical" showTooltip={true} />
            <Badge variant="outline" className="text-xs">
              {outcomes.sampleDepth} bars analyzed
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Condition selector */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {conditionLabels.map(label => (
              <button
                key={label}
                onClick={() => setSelectedCondition(label)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all whitespace-nowrap',
                  selectedCondition === label
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50'
                )}
                style={selectedCondition === label ? { borderColor: getConditionColor(label) } : undefined}
              >
                {getConditionIcon(label)}
                {getConditionDisplayText(label).split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        </ScrollArea>
        
        {/* Horizon selector */}
        <Tabs value={selectedHorizon.toString()} onValueChange={(v) => setSelectedHorizon(parseInt(v))}>
          <TabsList className="w-full bg-muted/50">
            {[1, 3, 5, 10, 20].map(h => (
              <TabsTrigger key={h} value={h.toString()} className="flex-1 text-xs">
                {HORIZON_LABELS[h]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        
        {/* Metrics display */}
        {selectedOutcome && selectedForwardReturn && (
          <motion.div
            key={`${selectedCondition}-${selectedHorizon}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Main metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Avg Return</p>
                <p className={cn(
                  'text-xl font-bold font-display',
                  selectedForwardReturn.avgReturn > 0 ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {(selectedForwardReturn.avgReturn * 100).toFixed(2)}%
                </p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                <p className={cn(
                  'text-xl font-bold font-display',
                  selectedForwardReturn.winRate > 0.5 ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {(selectedForwardReturn.winRate * 100).toFixed(0)}%
                </p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Avg MFE</p>
                <p className="text-xl font-bold font-display text-neural-green">
                  +{(selectedOutcome.avgMFE * 100).toFixed(2)}%
                </p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Avg MAE</p>
                <p className="text-xl font-bold font-display text-neural-red">
                  -{(selectedOutcome.avgMAE * 100).toFixed(2)}%
                </p>
              </div>
            </div>
            
            {/* Distribution info */}
            <div className="p-4 rounded-lg bg-muted/20 border border-border/30">
              <h4 className="text-sm font-medium mb-3">Return Distribution</h4>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>25th Percentile</span>
                    <span>Median</span>
                    <span>75th Percentile</span>
                  </div>
                  <div className="h-3 bg-gradient-to-r from-neural-red via-muted to-neural-green rounded-full relative">
                    <div 
                      className="absolute w-1 h-5 bg-foreground rounded-full -top-1"
                      style={{ left: `${Math.min(100, Math.max(0, 50 + selectedForwardReturn.medianReturn * 500))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-neural-red">{(selectedForwardReturn.percentile25 * 100).toFixed(2)}%</span>
                    <span className="font-medium">{(selectedForwardReturn.medianReturn * 100).toFixed(2)}%</span>
                    <span className="text-neural-green">{(selectedForwardReturn.percentile75 * 100).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Regime stability */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
                <p className="text-lg font-bold">
                  {selectedOutcome.avgDuration.toFixed(1)} bars
                </p>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Condition Stability</p>
                <p className={cn(
                  'text-lg font-bold',
                  selectedOutcome.conditionFlipRate < 0.1 ? 'text-neural-green' : 
                  selectedOutcome.conditionFlipRate > 0.3 ? 'text-neural-red' : 'text-neural-orange'
                )}>
                  {selectedOutcome.conditionFlipRate < 0.1 ? 'Stable' : 
                   selectedOutcome.conditionFlipRate > 0.3 ? 'Volatile' : 'Moderate'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedOutcome.conditionFlipRate * 100).toFixed(1)}% flip rate
                </p>
              </div>
            </div>
            
            {/* Sample size and confidence */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div>
                <p className="text-sm font-medium">Sample Size: {selectedForwardReturn.sampleSize}</p>
                <p className="text-xs text-muted-foreground">
                  Based on {outcomes.sampleDepth} bars of historical data
                </p>
              </div>
              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs',
                  selectedOutcome.confidenceWeight > 0.7 ? 'bg-neural-green/20 text-neural-green' :
                  selectedOutcome.confidenceWeight < 0.3 ? 'bg-neural-red/20 text-neural-red' : 
                  'bg-neural-orange/20 text-neural-orange'
                )}
              >
                {selectedOutcome.confidenceWeight > 0.7 ? 'High' :
                 selectedOutcome.confidenceWeight < 0.3 ? 'Low' : 'Medium'} Confidence
              </Badge>
            </div>
            
            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground text-center italic">
              Historical patterns do not guarantee future outcomes. Use as context, not prediction.
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};
