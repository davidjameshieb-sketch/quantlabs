import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, TrendingDown, BarChart3, Target, 
  AlertTriangle, Trophy, Clock, DollarSign
} from 'lucide-react';
import { AgentPerformance } from '@/lib/agents/types';
import { formatDollar, DEFAULT_ACCOUNT_SIZE } from '@/lib/market/backtestEngine';
import { cn } from '@/lib/utils';

interface PerformancePanelProps {
  performance: AgentPerformance;
  agentName: string;
}

export const PerformancePanel = ({ performance: perf, agentName }: PerformancePanelProps) => {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <CardTitle className="font-display text-lg">Performance</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {perf.totalTrades} trades
          </Badge>
          <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
            <DollarSign className="w-3 h-3 mr-1" />
            Backtest Capital: ${DEFAULT_ACCOUNT_SIZE.toLocaleString()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Hero metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricBox 
            label="Total P&L" 
            value={formatDollar(perf.totalPnl)} 
            positive={perf.totalPnl >= 0}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricBox 
            label="Win Rate" 
            value={`${(perf.winRate * 100).toFixed(1)}%`}
            positive={perf.winRate > 0.5}
            icon={<Target className="w-4 h-4" />}
          />
          <MetricBox 
            label="Sharpe Ratio" 
            value={perf.sharpeRatio.toFixed(2)}
            positive={perf.sharpeRatio > 1}
            icon={<Trophy className="w-4 h-4" />}
          />
          <MetricBox 
            label="Max Drawdown" 
            value={`-$${perf.maxDrawdown.toFixed(0)}`}
            positive={perf.maxDrawdown < 100}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
        </div>
        
        {/* Secondary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className={cn(
              'text-base font-bold',
              perf.profitFactor > 1.5 ? 'text-neural-green' : perf.profitFactor > 1 ? 'text-neural-orange' : 'text-neural-red'
            )}>
              {perf.profitFactor.toFixed(2)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">30-Day P&L</p>
            <p className={cn(
              'text-base font-bold',
              perf.last30DayPnl >= 0 ? 'text-neural-green' : 'text-neural-red'
            )}>
              {formatDollar(perf.last30DayPnl)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Avg Hold</p>
            <p className="text-base font-bold text-foreground">
              {perf.avgHoldingPeriod.toFixed(1)} bars
            </p>
          </div>
        </div>
        
        {/* Streak + Best/Worst */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Current Streak</p>
            <div className="flex items-center gap-1">
              {perf.currentStreak > 0 
                ? <TrendingUp className="w-4 h-4 text-neural-green" />
                : <TrendingDown className="w-4 h-4 text-neural-red" />
              }
              <span className={cn(
                'font-bold text-sm',
                perf.currentStreak > 0 ? 'text-neural-green' : 'text-neural-red'
              )}>
                {Math.abs(perf.currentStreak)} {perf.currentStreak > 0 ? 'wins' : 'losses'}
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Best</p>
            <p className="text-sm font-bold text-neural-green">{formatDollar(perf.bestTrade)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Worst</p>
            <p className="text-sm font-bold text-neural-red">{formatDollar(perf.worstTrade)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Reusable metric box
const MetricBox = ({ label, value, positive, icon }: { 
  label: string; value: string; positive: boolean; icon: React.ReactNode;
}) => (
  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
    <p className={cn(
      'text-xl font-bold font-display',
      positive ? 'text-neural-green' : 'text-neural-red'
    )}>
      {value}
    </p>
  </div>
);
