// Scalping Trades Performance Dashboard
// Dedicated forensic view of governance-filtered scalping trade performance

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity, BarChart3, CheckCircle2, Clock, Crosshair, Gauge,
  ShieldCheck, ShieldX, Target, TrendingDown, TrendingUp, Zap,
  ArrowUpRight, ArrowDownRight, Timer, XCircle, Layers, Flame,
} from 'lucide-react';
import { ForexTradeEntry, ForexPerformanceMetrics } from '@/lib/forex/forexTypes';
import { GovernanceResult, GovernanceStats } from '@/lib/forex/tradeGovernanceEngine';

interface ScalpingTradesProps {
  trades: ForexTradeEntry[];
  performance: ForexPerformanceMetrics;
  governanceStats: GovernanceStats | null;
  governanceResults: GovernanceResult[];
}

// ─── Metric Card ───

const MetricCard = ({
  label, value, suffix, icon: Icon, positive, small,
}: {
  label: string; value: string; suffix?: string; icon: React.ElementType; positive?: boolean; small?: boolean;
}) => (
  <div className={cn("p-3 rounded-xl bg-card/50 border border-border/50 space-y-1", small && "p-2")}>
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className={cn(
        small ? 'text-sm' : 'text-lg', 'font-display font-bold',
        positive === true && 'text-neural-green',
        positive === false && 'text-neural-red',
        positive === undefined && 'text-foreground'
      )}>{value}</span>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

// ─── Main Component ───

export const ScalpingTradesDashboard = ({ trades, performance, governanceStats, governanceResults }: ScalpingTradesProps) => {
  // Compute scalping-specific metrics
  const scalpMetrics = useMemo(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    const wins = executed.filter(t => t.pnlPercent > 0);
    const losses = executed.filter(t => t.pnlPercent <= 0);
    const avoided = trades.filter(t => t.outcome === 'avoided');

    // Duration analysis
    const winDurations = wins.map(t => t.tradeDuration);
    const lossDurations = losses.map(t => t.tradeDuration);
    const avgWinDuration = winDurations.length > 0 ? winDurations.reduce((a, b) => a + b, 0) / winDurations.length : 0;
    const avgLossDuration = lossDurations.length > 0 ? lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length : 0;
    const durationEdge = avgLossDuration > 0 ? avgWinDuration / avgLossDuration : 0;

    // Per-pair performance
    const pairMap: Record<string, { wins: number; losses: number; pnl: number; trades: number }> = {};
    for (const t of executed) {
      if (!pairMap[t.currencyPair]) pairMap[t.currencyPair] = { wins: 0, losses: 0, pnl: 0, trades: 0 };
      pairMap[t.currencyPair].trades++;
      pairMap[t.currencyPair].pnl += t.pnlPercent;
      if (t.pnlPercent > 0) pairMap[t.currencyPair].wins++;
      else pairMap[t.currencyPair].losses++;
    }
    const pairPerformance = Object.entries(pairMap)
      .map(([pair, data]) => ({
        pair,
        ...data,
        winRate: data.trades > 0 ? data.wins / data.trades : 0,
        avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // Per-regime performance
    const regimeMap: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of executed) {
      if (!regimeMap[t.regime]) regimeMap[t.regime] = { wins: 0, total: 0, pnl: 0 };
      regimeMap[t.regime].total++;
      regimeMap[t.regime].pnl += t.pnlPercent;
      if (t.pnlPercent > 0) regimeMap[t.regime].wins++;
    }

    // Trade density (trades per day)
    const timestamps = executed.map(t => t.timestamp);
    const span = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 1;
    const tradeDensity = span > 0 ? executed.length / (span / 86400000) : 0;

    // Governance distribution
    const approvedResults = governanceResults.filter(r => r.decision === 'approved');
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0 };
    for (const r of approvedResults) {
      const grade = r.exitLatencyGrade as keyof typeof gradeDistribution;
      if (gradeDistribution[grade] !== undefined) gradeDistribution[grade]++;
    }

    // Mode distribution
    const scalpCount = approvedResults.filter(r => r.tradeMode === 'scalp').length;
    const contCount = approvedResults.filter(r => r.tradeMode === 'continuation').length;

    return {
      executed, wins, losses, avoided,
      avgWinDuration, avgLossDuration, durationEdge,
      pairPerformance, regimeMap, tradeDensity,
      gradeDistribution, scalpCount, contCount,
    };
  }, [trades, governanceResults]);

  return (
    <div className="space-y-4">
      {/* Master KPI Strip */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <MetricCard label="Executed" value={scalpMetrics.executed.length.toString()} icon={Activity} />
          <MetricCard label="Win Rate" value={`${(performance.winRate * 100).toFixed(1)}`} suffix="%" icon={Target} positive={performance.winRate > 0.55} />
          <MetricCard label="Net P&L" value={`${performance.netPnlPercent >= 0 ? '+' : ''}${performance.netPnlPercent.toFixed(2)}`} suffix="%" icon={performance.netPnlPercent >= 0 ? TrendingUp : TrendingDown} positive={performance.netPnlPercent > 0} />
          <MetricCard label="Profit Factor" value={performance.profitFactor.toFixed(2)} icon={Zap} positive={performance.profitFactor > 1.2} />
          <MetricCard label="Sharpe" value={performance.sharpeScore.toFixed(2)} icon={BarChart3} positive={performance.sharpeScore > 0.5} />
          <MetricCard label="Avoided" value={scalpMetrics.avoided.length.toString()} icon={ShieldX} positive={scalpMetrics.avoided.length > 20} />
        </div>
      </motion.div>

      {/* Governance + Capture Row */}
      {governanceStats && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <MetricCard label="Capture Ratio" value={`${(governanceStats.avgCaptureRatio * 100).toFixed(0)}`} suffix="%" icon={Target} positive={governanceStats.avgCaptureRatio > 0.6} />
            <MetricCard label="Avg Expectancy" value={`${governanceStats.avgExpectancy >= 0 ? '+' : ''}${governanceStats.avgExpectancy.toFixed(3)}`} suffix="%" icon={Gauge} positive={governanceStats.avgExpectancy > 0} />
            <MetricCard label="Rejection Rate" value={`${(governanceStats.rejectionRate * 100).toFixed(0)}`} suffix="%" icon={ShieldX} positive={governanceStats.rejectionRate > 0.15} />
            <MetricCard label="Avg Multiplier" value={governanceStats.avgCompositeMultiplier.toFixed(2)} suffix="×" icon={Gauge} positive={governanceStats.avgCompositeMultiplier > 0.85} />
            <MetricCard label="Trade Density" value={scalpMetrics.tradeDensity.toFixed(1)} suffix="/day" icon={Activity} />
            <MetricCard label="Gov Score" value={governanceStats.avgGovernanceScore.toFixed(0)} suffix="/100" icon={ShieldCheck} positive={governanceStats.avgGovernanceScore > 55} />
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Duration Intelligence */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />Duration Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-muted/10">
                  <p className="text-[10px] text-muted-foreground">Avg Win Duration</p>
                  <p className="text-sm font-mono font-bold text-neural-green">
                    {scalpMetrics.avgWinDuration < 60
                      ? `${Math.round(scalpMetrics.avgWinDuration)}m`
                      : `${(scalpMetrics.avgWinDuration / 60).toFixed(1)}h`}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10">
                  <p className="text-[10px] text-muted-foreground">Avg Loss Duration</p>
                  <p className="text-sm font-mono font-bold text-neural-red">
                    {scalpMetrics.avgLossDuration < 60
                      ? `${Math.round(scalpMetrics.avgLossDuration)}m`
                      : `${(scalpMetrics.avgLossDuration / 60).toFixed(1)}h`}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10">
                  <p className="text-[10px] text-muted-foreground">Duration Edge</p>
                  <p className={cn('text-sm font-mono font-bold', scalpMetrics.durationEdge > 1.2 ? 'text-neural-green' : 'text-neural-orange')}>
                    {scalpMetrics.durationEdge.toFixed(2)}×
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {scalpMetrics.avgLossDuration < scalpMetrics.avgWinDuration
                  ? '✓ Losers closing faster than winners — capital efficiency optimal'
                  : '⚠ Losers holding longer than winners — duration optimization needed'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trade Mode Distribution */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-primary" />Trade Mode & Exit Grades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/10 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">Scalp Trades</p>
                  <p className="text-xl font-mono font-bold text-neural-green">{scalpMetrics.scalpCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">Continuation Trades</p>
                  <p className="text-xl font-mono font-bold text-primary">{scalpMetrics.contCount}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Exit Latency Grades</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['A', 'B', 'C', 'D'] as const).map(grade => (
                    <div key={grade} className="p-2 rounded-lg bg-muted/10 text-center">
                      <p className={cn('text-lg font-mono font-bold',
                        grade === 'A' ? 'text-neural-green' :
                        grade === 'B' ? 'text-primary' :
                        grade === 'C' ? 'text-neural-orange' : 'text-neural-red'
                      )}>{scalpMetrics.gradeDistribution[grade]}</p>
                      <p className="text-[10px] text-muted-foreground">Grade {grade}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pair Performance Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />Pair Performance Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Pair</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Trades</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Win Rate</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Net P&L</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Avg P&L</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scalpMetrics.pairPerformance.slice(0, 10).map((p, i) => (
                    <tr key={p.pair} className="border-b border-border/10 hover:bg-muted/5">
                      <td className="py-2 px-2 font-mono font-semibold">{p.pair}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{p.trades}</td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono', p.winRate > 0.55 ? 'text-neural-green' : p.winRate > 0.45 ? 'text-muted-foreground' : 'text-neural-red')}>
                          {(p.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono font-semibold', p.pnl > 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {p.pnl > 0 ? '+' : ''}{p.pnl.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono', p.avgPnl > 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {p.avgPnl > 0 ? '+' : ''}{p.avgPnl.toFixed(3)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <Badge variant="outline" className={cn('text-[9px]',
                          p.pnl > 0 ? 'text-neural-green border-neural-green/30' : 'text-neural-red border-neural-red/30'
                        )}>
                          {p.pnl > 0 ? 'Profitable' : 'Unprofitable'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Regime Performance */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-neural-orange" />Regime Performance Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(scalpMetrics.regimeMap).map(([regime, data]) => {
                const winRate = data.total > 0 ? data.wins / data.total : 0;
                return (
                  <div key={regime} className="p-3 rounded-lg bg-muted/10 text-center space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase">{regime}</p>
                    <p className={cn('text-lg font-mono font-bold', winRate > 0.55 ? 'text-neural-green' : winRate > 0.45 ? 'text-foreground' : 'text-neural-red')}>
                      {(winRate * 100).toFixed(0)}%
                    </p>
                    <p className={cn('text-[10px] font-mono', data.pnl > 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {data.pnl > 0 ? '+' : ''}{data.pnl.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">{data.total} trades</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Rejection Reasons */}
      {governanceStats && governanceStats.topRejectionReasons.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldX className="w-4 h-4 text-neural-red" />Trade Rejection Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {governanceStats.topRejectionReasons.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/5 border border-border/20">
                    <span className="text-xs text-muted-foreground">{r.reason}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-neural-red/20 w-24">
                        <div
                          className="h-full rounded-full bg-neural-red/60"
                          style={{ width: `${Math.min(100, (r.count / governanceStats.totalProposed) * 100 * 3)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-neural-red">{r.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
