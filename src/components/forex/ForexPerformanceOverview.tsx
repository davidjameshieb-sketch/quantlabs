// Forex Performance Overview Panel
// Core metrics + scalping P&L forensics + governance intelligence stats

import React from 'react';
import { TrendingUp, TrendingDown, Clock, Shield, BarChart3, Zap, Target, Activity, ShieldCheck, ShieldX, ShieldAlert, Gauge, Crosshair, Percent } from 'lucide-react';
import { ForexPerformanceMetrics, ForexTradeEntry } from '@/lib/forex/forexTypes';
import { GovernanceStats } from '@/lib/forex/tradeGovernanceEngine';
import { cn } from '@/lib/utils';

interface ForexPerformanceOverviewProps {
  metrics: ForexPerformanceMetrics;
  governanceStats?: GovernanceStats | null;
  trades?: ForexTradeEntry[];
}

const MetricCard = React.forwardRef<HTMLDivElement, {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ElementType;
  positive?: boolean;
}>(({ label, value, suffix, icon: Icon, positive }, ref) => (
  <div ref={ref} className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
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
));

MetricCard.displayName = 'MetricCard';

export const ForexPerformanceOverview = ({ metrics, governanceStats, trades = [] }: ForexPerformanceOverviewProps) => {
  // Compute scalping P&L forensics from trade-level data
  const scalpForensics = (() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    if (executed.length === 0) return null;

    const wins = executed.filter(t => t.pnlPercent > 0);
    const losses = executed.filter(t => t.pnlPercent <= 0);

    const grossProfit = wins.reduce((s, t) => s + t.pnlPercent, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));
    const avgWinPnl = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLossPnl = losses.length > 0 ? grossLoss / losses.length : 0;
    const payoffRatio = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : 0;

    const avgMfe = executed.reduce((s, t) => s + t.mfe, 0) / executed.length;
    const avgMae = executed.reduce((s, t) => s + t.mae, 0) / executed.length;
    const avgCapture = executed.reduce((s, t) => s + t.captureRatio, 0) / executed.length;
    const avgGiveBack = wins.length > 0 ? wins.reduce((s, t) => s + t.giveBackPct, 0) / wins.length : 0;
    const avgFriction = executed.reduce((s, t) => s + t.frictionCost, 0) / executed.length;
    const avgNetExpectancy = executed.reduce((s, t) => s + t.netExpectancy, 0) / executed.length;

    // Cumulative P&L
    const cumulativePnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
    const cumulativeNetPnl = executed.reduce((s, t) => s + t.netExpectancy, 0);

    return {
      grossProfit, grossLoss, avgWinPnl, avgLossPnl, payoffRatio,
      avgMfe, avgMae, avgCapture, avgGiveBack, avgFriction, avgNetExpectancy,
      cumulativePnl, cumulativeNetPnl,
      winCount: wins.length, lossCount: losses.length, executedCount: executed.length,
    };
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">Forex Performance Overview</h3>
      </div>

      {/* Core Performance Metrics */}
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

      {/* Scalping P&L Forensics */}
      {scalpForensics && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <Crosshair className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Scalping P&L Forensics
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              label="Gross Profit"
              value={`+${scalpForensics.grossProfit.toFixed(2)}`}
              suffix="%"
              icon={TrendingUp}
              positive={true}
            />
            <MetricCard
              label="Gross Loss"
              value={`-${scalpForensics.grossLoss.toFixed(2)}`}
              suffix="%"
              icon={TrendingDown}
              positive={false}
            />
            <MetricCard
              label="Avg Win"
              value={`+${scalpForensics.avgWinPnl.toFixed(3)}`}
              suffix="%"
              icon={TrendingUp}
              positive={true}
            />
            <MetricCard
              label="Avg Loss"
              value={`-${scalpForensics.avgLossPnl.toFixed(3)}`}
              suffix="%"
              icon={TrendingDown}
              positive={false}
            />
            <MetricCard
              label="Payoff Ratio"
              value={scalpForensics.payoffRatio.toFixed(2)}
              suffix="×"
              icon={Target}
              positive={scalpForensics.payoffRatio > 2}
            />
            <MetricCard
              label="Capture Ratio"
              value={`${(scalpForensics.avgCapture * 100).toFixed(0)}`}
              suffix="%"
              icon={Crosshair}
              positive={scalpForensics.avgCapture > 0.6}
            />
            <MetricCard
              label="Avg Give-Back"
              value={scalpForensics.avgGiveBack.toFixed(1)}
              suffix="%"
              icon={Percent}
              positive={scalpForensics.avgGiveBack < 30}
            />
            <MetricCard
              label="Net Expectancy"
              value={`${scalpForensics.avgNetExpectancy >= 0 ? '+' : ''}${scalpForensics.avgNetExpectancy.toFixed(3)}`}
              suffix="%"
              icon={Gauge}
              positive={scalpForensics.avgNetExpectancy > 0}
            />
          </div>

          {/* MFE/MAE & Friction Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              label="Avg MFE"
              value={scalpForensics.avgMfe.toFixed(3)}
              suffix="%"
              icon={TrendingUp}
              positive={true}
            />
            <MetricCard
              label="Avg MAE"
              value={scalpForensics.avgMae.toFixed(3)}
              suffix="%"
              icon={TrendingDown}
              positive={scalpForensics.avgMae < 0.1}
            />
            <MetricCard
              label="Avg Friction"
              value={scalpForensics.avgFriction.toFixed(4)}
              suffix="%"
              icon={Activity}
              positive={scalpForensics.avgFriction < 0.015}
            />
            <MetricCard
              label="Net P&L (Fric-Adj)"
              value={`${scalpForensics.cumulativeNetPnl >= 0 ? '+' : ''}${scalpForensics.cumulativeNetPnl.toFixed(2)}`}
              suffix="%"
              icon={scalpForensics.cumulativeNetPnl >= 0 ? TrendingUp : TrendingDown}
              positive={scalpForensics.cumulativeNetPnl > 0}
            />
          </div>
        </div>
      )}

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
