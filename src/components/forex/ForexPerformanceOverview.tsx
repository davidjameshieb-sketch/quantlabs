// Forex Performance Overview Panel
// Core metrics + governance intelligence stats

import { TrendingUp, TrendingDown, Clock, Shield, BarChart3, Zap, Target, Activity, ShieldCheck, ShieldX, ShieldAlert, Gauge } from 'lucide-react';
import { ForexPerformanceMetrics } from '@/lib/forex/forexTypes';
import { GovernanceStats } from '@/lib/forex/tradeGovernanceEngine';
import { cn } from '@/lib/utils';

interface ForexPerformanceOverviewProps {
  metrics: ForexPerformanceMetrics;
  governanceStats?: GovernanceStats | null;
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

export const ForexPerformanceOverview = ({ metrics, governanceStats }: ForexPerformanceOverviewProps) => {
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

      {/* Governance Intelligence Strip */}
      {governanceStats && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Intelligence Governance
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              label="Proposed"
              value={governanceStats.totalProposed.toString()}
              icon={Activity}
            />
            <MetricCard
              label="Approved"
              value={governanceStats.totalApproved.toString()}
              icon={ShieldCheck}
              positive={true}
            />
            <MetricCard
              label="Rejected"
              value={governanceStats.totalRejected.toString()}
              icon={ShieldX}
              positive={governanceStats.rejectionRate < 0.3}
            />
            <MetricCard
              label="Throttled"
              value={governanceStats.totalThrottled.toString()}
              icon={ShieldAlert}
            />
            <MetricCard
              label="Rejection Rate"
              value={`${(governanceStats.rejectionRate * 100).toFixed(1)}`}
              suffix="%"
              icon={ShieldX}
              positive={governanceStats.rejectionRate > 0.15}
            />
            <MetricCard
              label="Avg Multiplier"
              value={governanceStats.avgCompositeMultiplier.toFixed(2)}
              suffix="×"
              icon={Gauge}
              positive={governanceStats.avgCompositeMultiplier > 0.9}
            />
            <MetricCard
              label="Gov Score"
              value={governanceStats.avgGovernanceScore.toFixed(0)}
              suffix="/100"
              icon={ShieldCheck}
              positive={governanceStats.avgGovernanceScore > 60}
            />
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Top Rejection</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                {governanceStats.topRejectionReasons[0]?.reason || 'None'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
