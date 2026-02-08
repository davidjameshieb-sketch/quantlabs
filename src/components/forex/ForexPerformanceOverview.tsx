// Forex Performance Overview Panel
// Core metrics display for isolated forex trading performance

import { TrendingUp, TrendingDown, Clock, Shield, BarChart3, Zap, Target, Activity } from 'lucide-react';
import { ForexPerformanceMetrics } from '@/lib/forex/forexTypes';
import { cn } from '@/lib/utils';

interface ForexPerformanceOverviewProps {
  metrics: ForexPerformanceMetrics;
}

const MetricCard = ({
  label,
  value,
  suffix,
  icon: Icon,
  positive,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ElementType;
  positive?: boolean;
}) => (
  <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className={cn(
        'text-lg font-display font-bold',
        positive === true && 'text-neural-green',
        positive === false && 'text-neural-red',
        positive === undefined && 'text-foreground'
      )}>
        {value}
      </span>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

export const ForexPerformanceOverview = ({ metrics }: ForexPerformanceOverviewProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">Forex Performance Overview</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Total Trades"
          value={metrics.totalTrades.toString()}
          icon={Activity}
        />
        <MetricCard
          label="Win Rate"
          value={`${(metrics.winRate * 100).toFixed(1)}`}
          suffix="%"
          icon={Target}
          positive={metrics.winRate > 0.5}
        />
        <MetricCard
          label="Net P&L"
          value={`${metrics.netPnlPercent >= 0 ? '+' : ''}${metrics.netPnlPercent.toFixed(2)}`}
          suffix="%"
          icon={metrics.netPnlPercent >= 0 ? TrendingUp : TrendingDown}
          positive={metrics.netPnlPercent >= 0}
        />
        <MetricCard
          label="Risk:Reward"
          value={metrics.riskRewardRatio.toFixed(2)}
          suffix="R"
          icon={Shield}
          positive={metrics.riskRewardRatio > 1}
        />
        <MetricCard
          label="Avg Duration"
          value={metrics.avgTradeDuration < 60 ? `${Math.round(metrics.avgTradeDuration)}` : `${(metrics.avgTradeDuration / 60).toFixed(1)}`}
          suffix={metrics.avgTradeDuration < 60 ? 'min' : 'hrs'}
          icon={Clock}
        />
        <MetricCard
          label="Avg Drawdown"
          value={metrics.avgDrawdown.toFixed(2)}
          suffix="%"
          icon={TrendingDown}
          positive={metrics.avgDrawdown < 2}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor.toFixed(2)}
          icon={Zap}
          positive={metrics.profitFactor > 1}
        />
        <MetricCard
          label="Sharpe Score"
          value={metrics.sharpeScore.toFixed(2)}
          icon={BarChart3}
          positive={metrics.sharpeScore > 0.5}
        />
      </div>
    </div>
  );
};
