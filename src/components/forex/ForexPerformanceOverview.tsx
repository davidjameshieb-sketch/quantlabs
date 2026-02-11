// Forex Performance Overview Panel
// Core metrics + scalping P&L forensics + governance intelligence stats
// Now prefers real OANDA pip-based data over simulated pnlPercent data

import React from 'react';
import { TrendingUp, TrendingDown, Clock, Shield, BarChart3, Zap, Target, Activity, ShieldCheck, ShieldX, ShieldAlert, Gauge, Crosshair, Percent } from 'lucide-react';
import { ForexPerformanceMetrics, ForexTradeEntry } from '@/lib/forex/forexTypes';
import { GovernanceStats } from '@/lib/forex/tradeGovernanceEngine';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import { TradeAnalyticsResult } from '@/hooks/useTradeAnalytics';
import { cn } from '@/lib/utils';

interface ForexPerformanceOverviewProps {
  metrics: ForexPerformanceMetrics;
  governanceStats?: GovernanceStats | null;
  trades?: ForexTradeEntry[];
  /** Real OANDA execution data — overrides simulated headline metrics when available */
  realMetrics?: RealExecutionMetrics | null;
  /** Real trade analytics (pip-based) — overrides simulated P&L when available */
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

export const ForexPerformanceOverview = ({ metrics, governanceStats, trades = [], realMetrics, tradeAnalytics }: ForexPerformanceOverviewProps) => {
  // Use real OANDA data when available, otherwise fall back to simulated
  const hasReal = realMetrics?.hasData && tradeAnalytics && tradeAnalytics.totalClosedTrades > 0;

  // Compute real pip-based headline metrics from OANDA data
  const headlineMetrics = React.useMemo(() => {
    if (!hasReal || !tradeAnalytics || !realMetrics) {
      // Fallback to simulated (but cap unrealistic values)
      return {
        totalTrades: metrics.totalTrades,
        winRate: metrics.winRate,
        netPnl: metrics.netPnlPercent,
        netPnlUnit: '%',
        riskReward: metrics.riskRewardRatio,
        avgDuration: metrics.avgTradeDuration,
        avgDrawdown: metrics.avgDrawdown,
        profitFactor: Math.min(metrics.profitFactor, 10), // cap at 10
        sharpe: metrics.sharpeScore,
        isReal: false,
      };
    }

    // Real pip-based calculations
    const pairs = tradeAnalytics.pairAnalytics;
    const totalTrades = tradeAnalytics.totalClosedTrades;
    const totalPnlPips = tradeAnalytics.totalPnlPips;

    // Aggregate gross profit / gross loss in pips across all pairs
    let grossProfitPips = 0;
    let grossLossPips = 0;
    let totalWins = 0;
    let totalLosses = 0;
    for (const p of pairs) {
      // Re-derive from pair stats
      const winPips = p.winCount > 0 && p.netPnlPips > 0
        ? p.netPnlPips + Math.abs(p.worstTradePips) * p.lossCount / Math.max(1, p.tradeCount)
        : p.bestTradePips * p.winCount / Math.max(1, p.tradeCount);
      grossProfitPips += Math.max(0, p.bestTradePips) * p.winCount > 0 ? p.winCount * (p.netPnlPips / p.tradeCount + Math.abs(p.worstTradePips) * p.lossCount / p.tradeCount) : 0;
      grossLossPips += Math.abs(Math.min(0, p.worstTradePips)) * p.lossCount;
      totalWins += p.winCount;
      totalLosses += p.lossCount;
    }

    // Better approach: compute directly from real orders
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
    
    // Avg duration from real data
    const durations = closed
      .filter(o => o.closed_at)
      .map(o => (new Date(o.closed_at!).getTime() - new Date(o.created_at).getTime()) / 60000);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Sharpe from pips
    const meanPips = pnlArr.length > 0 ? pnlArr.reduce((a, b) => a + b, 0) / pnlArr.length : 0;
    const stdPips = pnlArr.length > 1
      ? Math.sqrt(pnlArr.reduce((s, p) => s + (p - meanPips) ** 2, 0) / (pnlArr.length - 1))
      : 0;
    const sharpe = stdPips > 0 ? (meanPips / stdPips) * Math.sqrt(Math.min(pnlArr.length, 252)) : 0;

    // Risk:Reward (avg win pips / avg loss pips)
    const winPipsArr = pnlArr.filter(p => p > 0);
    const lossPipsArr = pnlArr.filter(p => p <= 0).map(Math.abs);
    const avgWin = winPipsArr.length > 0 ? winPipsArr.reduce((a, b) => a + b, 0) / winPipsArr.length : 0;
    const avgLoss = lossPipsArr.length > 0 ? lossPipsArr.reduce((a, b) => a + b, 0) / lossPipsArr.length : 0;
    const riskReward = avgLoss > 0 ? avgWin / avgLoss : 0;

    return {
      totalTrades,
      winRate: realMetrics.winRate,
      netPnl: totalPnlPips,
      netPnlUnit: 'pips',
      riskReward: Math.round(riskReward * 100) / 100,
      avgDuration,
      avgDrawdown: 0, // not available from real data currently
      profitFactor: Math.round(profitFactor * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      isReal: true,
    };
  }, [hasReal, realMetrics, tradeAnalytics, metrics]);

  // Compute scalping P&L forensics from real orders when available, else simulated trades
  const scalpForensics = (() => {
    if (hasReal && realMetrics) {
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
      const avgFriction = realMetrics.avgFrictionScore;
      const avgNetExpectancy = pipsArr.reduce((s, p) => s + p, 0) / pipsArr.length - avgSlippage;
      const cumulativePnl = pipsArr.reduce((s, p) => s + p, 0);
      const cumulativeNetPnl = cumulativePnl - (avgSlippage * pipsArr.length);

      return {
        grossProfit, grossLoss, avgWinPnl: avgWinPips, avgLossPnl: avgLossPips, payoffRatio,
        avgMfe: 0, avgMae: 0, // not tracked per-order in oanda_orders yet
        avgCapture: 0, avgGiveBack: 0,
        avgFriction: avgSlippage,
        avgNetExpectancy,
        cumulativePnl, cumulativeNetPnl,
        winCount: wins.length, lossCount: losses.length, executedCount: closed.length,
        unit: 'pips' as const,
      };
    }

    // Fallback: simulated trade data
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
    const cumulativePnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
    const cumulativeNetPnl = executed.reduce((s, t) => s + t.netExpectancy, 0);

    return {
      grossProfit, grossLoss, avgWinPnl, avgLossPnl, payoffRatio,
      avgMfe, avgMae, avgCapture, avgGiveBack, avgFriction, avgNetExpectancy,
      cumulativePnl, cumulativeNetPnl,
      winCount: wins.length, lossCount: losses.length, executedCount: executed.length,
      unit: '%' as const,
    };
  })();

  const unit = headlineMetrics.netPnlUnit;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">Forex Performance Overview</h3>
        {headlineMetrics.isReal && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neural-green/20 text-neural-green font-medium">
            LIVE DATA
          </span>
        )}
      </div>

      {/* Core Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Total Trades"
          value={headlineMetrics.totalTrades.toString()}
          icon={Activity}
        />
        <MetricCard
          label="Win Rate"
          value={`${(headlineMetrics.winRate * 100).toFixed(1)}`}
          suffix="%"
          icon={Target}
          positive={headlineMetrics.winRate > 0.5}
        />
        <MetricCard
          label="Net P&L"
          value={`${headlineMetrics.netPnl >= 0 ? '+' : ''}${headlineMetrics.netPnl.toFixed(1)}`}
          suffix={unit}
          icon={headlineMetrics.netPnl >= 0 ? TrendingUp : TrendingDown}
          positive={headlineMetrics.netPnl >= 0}
        />
        <MetricCard
          label="Risk:Reward"
          value={headlineMetrics.riskReward.toFixed(2)}
          suffix="R"
          icon={Shield}
          positive={headlineMetrics.riskReward > 1}
        />
        <MetricCard
          label="Avg Duration"
          value={headlineMetrics.avgDuration < 60 ? `${Math.round(headlineMetrics.avgDuration)}` : `${(headlineMetrics.avgDuration / 60).toFixed(1)}`}
          suffix={headlineMetrics.avgDuration < 60 ? 'min' : 'hrs'}
          icon={Clock}
        />
        {headlineMetrics.avgDrawdown > 0 && (
          <MetricCard
            label="Avg Drawdown"
            value={headlineMetrics.avgDrawdown.toFixed(2)}
            suffix="%"
            icon={TrendingDown}
            positive={headlineMetrics.avgDrawdown < 2}
          />
        )}
        <MetricCard
          label="Profit Factor"
          value={headlineMetrics.profitFactor > 50 ? '∞' : headlineMetrics.profitFactor.toFixed(2)}
          icon={Zap}
          positive={headlineMetrics.profitFactor > 1}
        />
        <MetricCard
          label="Sharpe"
          value={headlineMetrics.sharpe.toFixed(2)}
          icon={BarChart3}
          positive={headlineMetrics.sharpe > 0.5}
        />
      </div>

      {/* Scalping P&L Forensics */}
      {scalpForensics && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <Crosshair className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Scalping P&L Forensics ({scalpForensics.unit === 'pips' ? 'pips' : '% account'})
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              label="Gross Profit"
              value={`+${scalpForensics.grossProfit.toFixed(1)}`}
              suffix={scalpForensics.unit}
              icon={TrendingUp}
              positive={true}
            />
            <MetricCard
              label="Gross Loss"
              value={`-${scalpForensics.grossLoss.toFixed(1)}`}
              suffix={scalpForensics.unit}
              icon={TrendingDown}
              positive={false}
            />
            <MetricCard
              label="Avg Win"
              value={`+${scalpForensics.avgWinPnl.toFixed(1)}`}
              suffix={scalpForensics.unit}
              icon={TrendingUp}
              positive={true}
            />
            <MetricCard
              label="Avg Loss"
              value={`-${scalpForensics.avgLossPnl.toFixed(1)}`}
              suffix={scalpForensics.unit}
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
            {scalpForensics.avgCapture > 0 && (
              <MetricCard
                label="Capture Ratio"
                value={`${(scalpForensics.avgCapture * 100).toFixed(0)}`}
                suffix="%"
                icon={Crosshair}
                positive={scalpForensics.avgCapture > 0.6}
              />
            )}
            {scalpForensics.avgGiveBack > 0 && (
              <MetricCard
                label="Avg Give-Back"
                value={scalpForensics.avgGiveBack.toFixed(1)}
                suffix="%"
                icon={Percent}
                positive={scalpForensics.avgGiveBack < 30}
              />
            )}
            <MetricCard
              label="Net Expectancy"
              value={`${scalpForensics.avgNetExpectancy >= 0 ? '+' : ''}${scalpForensics.avgNetExpectancy.toFixed(1)}`}
              suffix={scalpForensics.unit}
              icon={Gauge}
              positive={scalpForensics.avgNetExpectancy > 0}
            />
          </div>

          {/* MFE/MAE & Friction Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {scalpForensics.avgMfe > 0 && (
              <MetricCard
                label="Avg MFE"
                value={scalpForensics.avgMfe.toFixed(3)}
                suffix="%"
                icon={TrendingUp}
                positive={true}
              />
            )}
            {scalpForensics.avgMae > 0 && (
              <MetricCard
                label="Avg MAE"
                value={scalpForensics.avgMae.toFixed(3)}
                suffix="%"
                icon={TrendingDown}
                positive={scalpForensics.avgMae < 0.1}
              />
            )}
            <MetricCard
              label="Avg Friction"
              value={scalpForensics.avgFriction.toFixed(2)}
              suffix={scalpForensics.unit === 'pips' ? 'pips' : '%'}
              icon={Activity}
              positive={scalpForensics.avgFriction < 1}
            />
            <MetricCard
              label="Net P&L (Fric-Adj)"
              value={`${scalpForensics.cumulativeNetPnl >= 0 ? '+' : ''}${scalpForensics.cumulativeNetPnl.toFixed(1)}`}
              suffix={scalpForensics.unit}
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
