// Forex Performance Overview Panel
// Core metrics + scalping P&L forensics
// Uses ONLY real OANDA pip-based data — no simulated fallback

import React from 'react';
import { TrendingUp, TrendingDown, Clock, Shield, BarChart3, Zap, Target, Activity, Gauge, Crosshair, Percent, AlertTriangle } from 'lucide-react';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import { TradeAnalyticsResult } from '@/hooks/useTradeAnalytics';
import { cn } from '@/lib/utils';

interface ForexPerformanceOverviewProps {
  /** Real OANDA execution data */
  realMetrics?: RealExecutionMetrics | null;
  /** Real trade analytics (pip-based) */
  tradeAnalytics?: TradeAnalyticsResult | null;
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

export const ForexPerformanceOverview = ({ realMetrics, tradeAnalytics }: ForexPerformanceOverviewProps) => {
  const hasReal = realMetrics?.hasData && tradeAnalytics && tradeAnalytics.totalClosedTrades > 0;

  // Compute real pip-based headline metrics from OANDA data
  const headlineMetrics = React.useMemo(() => {
    if (!hasReal || !tradeAnalytics || !realMetrics) return null;

    // Real pip-based calculations
    const totalTrades = tradeAnalytics.totalClosedTrades;
    const totalPnlPips = tradeAnalytics.totalPnlPips;

    const closed = realMetrics.recentOrders.filter(
      o => (o.status === 'filled' || o.status === 'closed') && o.entry_price != null && o.exit_price != null
    );

    let gpPips = 0, glPips = 0;
    const pnlArr: number[] = [];
    for (const o of closed) {
      const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
      const mult = jpyPairs.includes(o.currency_pair) ? 100 : 10000;
      const pips = o.direction === 'long'
        ? (o.exit_price! - o.entry_price!) * mult
        : (o.entry_price! - o.exit_price!) * mult;
      pnlArr.push(pips);
      if (pips > 0) gpPips += pips;
      else glPips += Math.abs(pips);
    }

    const profitFactor = glPips > 0 ? gpPips / glPips : gpPips > 0 ? 99 : 0;

    const durations = closed
      .filter(o => o.closed_at)
      .map(o => (new Date(o.closed_at!).getTime() - new Date(o.created_at).getTime()) / 60000);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const meanPips = pnlArr.length > 0 ? pnlArr.reduce((a, b) => a + b, 0) / pnlArr.length : 0;
    const stdPips = pnlArr.length > 1
      ? Math.sqrt(pnlArr.reduce((s, p) => s + (p - meanPips) ** 2, 0) / (pnlArr.length - 1))
      : 0;
    const sharpe = stdPips > 0 ? (meanPips / stdPips) * Math.sqrt(Math.min(pnlArr.length, 252)) : 0;

    const winPipsArr = pnlArr.filter(p => p > 0);
    const lossPipsArr = pnlArr.filter(p => p <= 0).map(Math.abs);
    const avgWin = winPipsArr.length > 0 ? winPipsArr.reduce((a, b) => a + b, 0) / winPipsArr.length : 0;
    const avgLoss = lossPipsArr.length > 0 ? lossPipsArr.reduce((a, b) => a + b, 0) / lossPipsArr.length : 0;
    const riskReward = avgLoss > 0 ? avgWin / avgLoss : 0;

    return {
      totalTrades,
      winRate: realMetrics.winRate,
      netPnl: totalPnlPips,
      riskReward: Math.round(riskReward * 100) / 100,
      avgDuration,
      profitFactor: Math.round(profitFactor * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
    };
  }, [hasReal, realMetrics, tradeAnalytics]);

  // Compute scalping P&L forensics from real orders
  const scalpForensics = React.useMemo(() => {
    if (!hasReal || !realMetrics) return null;

    const closed = realMetrics.recentOrders.filter(
      o => (o.status === 'filled' || o.status === 'closed') && o.entry_price != null && o.exit_price != null
    );
    if (closed.length === 0) return null;

    const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
    const pipsArr = closed.map(o => {
      const mult = jpyPairs.includes(o.currency_pair) ? 100 : 10000;
      return o.direction === 'long'
        ? (o.exit_price! - o.entry_price!) * mult
        : (o.entry_price! - o.exit_price!) * mult;
    });

    const wins = pipsArr.filter(p => p > 0);
    const losses = pipsArr.filter(p => p <= 0);
    const grossProfit = wins.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
    const avgWinPips = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLossPips = losses.length > 0 ? grossLoss / losses.length : 0;
    const payoffRatio = avgLossPips > 0 ? avgWinPips / avgLossPips : 0;

    const avgSlippage = realMetrics.avgSlippage;
    const avgNetExpectancy = pipsArr.reduce((s, p) => s + p, 0) / pipsArr.length - avgSlippage;
    const cumulativePnl = pipsArr.reduce((s, p) => s + p, 0);
    const cumulativeNetPnl = cumulativePnl - (avgSlippage * pipsArr.length);

    return {
      grossProfit, grossLoss, avgWinPnl: avgWinPips, avgLossPnl: avgLossPips, payoffRatio,
      avgFriction: avgSlippage,
      avgNetExpectancy,
      cumulativePnl, cumulativeNetPnl,
      winCount: wins.length, lossCount: losses.length, executedCount: closed.length,
    };
  }, [hasReal, realMetrics]);

  // No real data — show awaiting state
  if (!headlineMetrics) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-display font-bold">Forex Performance Overview</h3>
        </div>
        <div className="p-6 rounded-xl bg-card/50 border border-border/50 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Awaiting Real Trade Data</p>
          <p className="text-xs text-muted-foreground/70">
            Performance metrics will populate once OANDA executions complete. All simulated data has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">Forex Performance Overview</h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-neural-green/20 text-neural-green font-medium">
          LIVE DATA
        </span>
      </div>

      {/* Core Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard label="Total Trades" value={headlineMetrics.totalTrades.toString()} icon={Activity} />
        <MetricCard label="Win Rate" value={`${(headlineMetrics.winRate * 100).toFixed(1)}`} suffix="%" icon={Target} positive={headlineMetrics.winRate > 0.5} />
        <MetricCard label="Net P&L" value={`${headlineMetrics.netPnl >= 0 ? '+' : ''}${headlineMetrics.netPnl.toFixed(1)}`} suffix="pips" icon={headlineMetrics.netPnl >= 0 ? TrendingUp : TrendingDown} positive={headlineMetrics.netPnl >= 0} />
        <MetricCard label="Risk:Reward" value={headlineMetrics.riskReward.toFixed(2)} suffix="R" icon={Shield} positive={headlineMetrics.riskReward > 1} />
        <MetricCard label="Avg Duration" value={headlineMetrics.avgDuration < 60 ? `${Math.round(headlineMetrics.avgDuration)}` : `${(headlineMetrics.avgDuration / 60).toFixed(1)}`} suffix={headlineMetrics.avgDuration < 60 ? 'min' : 'hrs'} icon={Clock} />
        <MetricCard label="Profit Factor" value={headlineMetrics.profitFactor > 50 ? '∞' : headlineMetrics.profitFactor.toFixed(2)} icon={Zap} positive={headlineMetrics.profitFactor > 1} />
        <MetricCard label="Sharpe" value={headlineMetrics.sharpe.toFixed(2)} icon={BarChart3} positive={headlineMetrics.sharpe > 0.5} />
      </div>

      {/* Scalping P&L Forensics */}
      {scalpForensics && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <Crosshair className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Scalping P&L Forensics (pips)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard label="Gross Profit" value={`+${scalpForensics.grossProfit.toFixed(1)}`} suffix="pips" icon={TrendingUp} positive={true} />
            <MetricCard label="Gross Loss" value={`-${scalpForensics.grossLoss.toFixed(1)}`} suffix="pips" icon={TrendingDown} positive={false} />
            <MetricCard label="Avg Win" value={`+${scalpForensics.avgWinPnl.toFixed(1)}`} suffix="pips" icon={TrendingUp} positive={true} />
            <MetricCard label="Avg Loss" value={`-${scalpForensics.avgLossPnl.toFixed(1)}`} suffix="pips" icon={TrendingDown} positive={false} />
            <MetricCard label="Payoff Ratio" value={scalpForensics.payoffRatio.toFixed(2)} suffix="×" icon={Target} positive={scalpForensics.payoffRatio > 2} />
            <MetricCard label="Net Expectancy" value={`${scalpForensics.avgNetExpectancy >= 0 ? '+' : ''}${scalpForensics.avgNetExpectancy.toFixed(1)}`} suffix="pips" icon={Gauge} positive={scalpForensics.avgNetExpectancy > 0} />
          </div>

          {/* Friction Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard label="Avg Friction" value={scalpForensics.avgFriction.toFixed(2)} suffix="pips" icon={Activity} positive={scalpForensics.avgFriction < 1} />
            <MetricCard label="Net P&L (Fric-Adj)" value={`${scalpForensics.cumulativeNetPnl >= 0 ? '+' : ''}${scalpForensics.cumulativeNetPnl.toFixed(1)}`} suffix="pips" icon={scalpForensics.cumulativeNetPnl >= 0 ? TrendingUp : TrendingDown} positive={scalpForensics.cumulativeNetPnl > 0} />
          </div>
        </div>
      )}
    </div>
  );
};
