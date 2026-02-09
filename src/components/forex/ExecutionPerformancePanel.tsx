// Execution Performance Panel — displays real executed trade KPIs
// Used inside GovernanceHealthDashboard (Health tab)

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react';
import type { ExecutionAnalyticsReport } from '@/lib/forex/executionPerformanceAnalytics';

interface Props {
  report: ExecutionAnalyticsReport;
}

export function ExecutionPerformancePanel({ report }: Props) {
  const { overall, bySession, byRegime, bySymbol, byDirection, maeStats, mfeStats } = report;

  if (overall.totalTrades === 0) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            Execution Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-[10px] text-muted-foreground">No executed trades yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Overall KPIs */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            Executed Trade Performance
            <Badge variant="outline" className="text-[8px] px-1.5">
              {overall.totalTrades} trades
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCell label="Win Rate" value={`${(overall.winRate * 100).toFixed(1)}%`}
              color={overall.winRate > 0.55 ? 'text-neural-green' : overall.winRate < 0.45 ? 'text-neural-red' : ''} />
            <MetricCell label="Expectancy" value={`${overall.expectancy >= 0 ? '+' : ''}${overall.expectancy.toFixed(3)}%`}
              color={overall.expectancy > 0 ? 'text-neural-green' : 'text-neural-red'} />
            <MetricCell label="Profit Factor" value={overall.profitFactor === Infinity ? '∞' : overall.profitFactor.toFixed(2)}
              color={overall.profitFactor > 1.5 ? 'text-neural-green' : overall.profitFactor < 1 ? 'text-neural-red' : ''} />
            <MetricCell label="Max Drawdown" value={`${overall.maxDrawdownPct.toFixed(2)}%`}
              color={overall.maxDrawdownPct > 5 ? 'text-neural-red' : ''} />
            <MetricCell label="Avg Win" value={`+${overall.avgWinPips.toFixed(3)}%`} color="text-neural-green" />
            <MetricCell label="Avg Loss" value={`-${overall.avgLossPips.toFixed(3)}%`} color="text-neural-red" />
            <MetricCell label="Max Consec Wins" value={String(overall.maxConsecutiveWins)} />
            <MetricCell label="Max Consec Losses" value={String(overall.maxConsecutiveLosses)}
              color={overall.maxConsecutiveLosses > 5 ? 'text-neural-red' : ''} />
          </div>

          {/* MAE/MFE */}
          <div className="border-t border-border/20 pt-2 mt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[9px] text-muted-foreground font-semibold">MAE (Max Adverse Excursion)</span>
              <div className="flex gap-3 text-[9px] font-mono">
                <span>Avg: {(maeStats.avg * 100).toFixed(2)}%</span>
                <span>Med: {(maeStats.median * 100).toFixed(2)}%</span>
                <span>P90: {(maeStats.p90 * 100).toFixed(2)}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-muted-foreground font-semibold">MFE (Max Favorable Excursion)</span>
              <div className="flex gap-3 text-[9px] font-mono">
                <span>Avg: {(mfeStats.avg * 100).toFixed(2)}%</span>
                <span>Med: {(mfeStats.median * 100).toFixed(2)}%</span>
                <span>P90: {(mfeStats.p90 * 100).toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdowns Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* By Direction */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> By Direction
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1">
            {byDirection.map(d => (
              <div key={d.direction} className="flex justify-between text-[9px]">
                <span className="text-muted-foreground capitalize">{d.direction}</span>
                <span className="font-mono">
                  {d.trades}t · {(d.winRate * 100).toFixed(0)}% · {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By Regime */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> By Regime
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1">
            {byRegime.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No data.</p>
            ) : byRegime.map(r => (
              <div key={r.regime} className="flex justify-between text-[9px]">
                <span className="text-muted-foreground">{r.regime}</span>
                <span className="font-mono">
                  {r.trades}t · {(r.winRate * 100).toFixed(0)}% · {r.expectancy >= 0 ? '+' : ''}{r.expectancy.toFixed(3)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Symbols */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> By Symbol (Top 5)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1">
            {bySymbol.slice(0, 5).map(s => (
              <div key={s.symbol} className="flex justify-between text-[9px]">
                <span className="text-muted-foreground font-mono">{s.symbol}</span>
                <span className={`font-mono ${s.pnl >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {s.trades}t · {(s.winRate * 100).toFixed(0)}% · {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCell({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[8px] text-muted-foreground">{label}</span>
      <div className={`text-sm font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}
