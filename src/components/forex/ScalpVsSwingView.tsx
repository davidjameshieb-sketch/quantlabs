// Scalp vs Swing Split View
// Shows scalping trades (≤15min) and non-scalp FX trades side by side

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Crosshair, Clock, TrendingUp, TrendingDown, Target, Activity, Zap,
  BarChart3, ArrowUp, ArrowDown, Ban, Gauge, Percent, Shield,
} from 'lucide-react';
import { ForexTradeEntry, ForexPerformanceMetrics, FOREX_REGIME_LABELS, FOREX_REGIME_COLORS } from '@/lib/forex/forexTypes';
import { computeForexPerformance } from '@/lib/forex/forexEngine';
import { cn } from '@/lib/utils';

interface ScalpVsSwingViewProps {
  trades: ForexTradeEntry[];
}

// ─── Compact Metric ───

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="p-2 rounded-lg bg-card/50 border border-border/30 text-center">
    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={cn('text-sm font-mono font-bold', color || 'text-foreground')}>{value}</p>
  </div>
);

// ─── Summary Strip for a trade category ───

const CategorySummary = ({ trades, label, icon: Icon, accentColor }: {
  trades: ForexTradeEntry[];
  label: string;
  icon: React.ElementType;
  accentColor: string;
}) => {
  const stats = useMemo(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    const wins = executed.filter(t => t.pnlPercent > 0);
    const losses = executed.filter(t => t.pnlPercent <= 0);
    const totalPnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
    const totalNetPnl = executed.reduce((s, t) => s + t.netExpectancy, 0);
    const avgCapture = executed.length > 0 ? executed.reduce((s, t) => s + t.captureRatio, 0) / executed.length : 0;
    const avgGiveBack = wins.length > 0 ? wins.reduce((s, t) => s + t.giveBackPct, 0) / wins.length : 0;
    const avgDuration = executed.length > 0 ? executed.reduce((s, t) => s + t.tradeDuration, 0) / executed.length : 0;
    const winRate = executed.length > 0 ? wins.length / executed.length : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnlPercent, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const avgWinPnl = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLossPnl = losses.length > 0 ? grossLoss / losses.length : 0;
    const payoff = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : 0;

    return {
      total: trades.length, executed: executed.length,
      wins: wins.length, losses: losses.length,
      totalPnl, totalNetPnl, avgCapture, avgGiveBack,
      avgDuration, winRate, profitFactor, payoff,
      avoided: trades.length - executed.length,
    };
  }, [trades]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4', accentColor)} />
        <h3 className="text-sm font-display font-bold">{label}</h3>
        <Badge variant="outline" className="text-[9px] ml-auto">{stats.total} signals · {stats.executed} executed</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`} color={stats.winRate > 0.55 ? 'text-neural-green' : stats.winRate > 0.45 ? 'text-foreground' : 'text-neural-red'} />
        <Stat label="Net P&L" value={`${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}%`} color={stats.totalPnl >= 0 ? 'text-neural-green' : 'text-neural-red'} />
        <Stat label="Friction-Adj" value={`${stats.totalNetPnl >= 0 ? '+' : ''}${stats.totalNetPnl.toFixed(2)}%`} color={stats.totalNetPnl >= 0 ? 'text-neural-green' : 'text-neural-red'} />
        <Stat label="Profit Factor" value={stats.profitFactor.toFixed(2)} color={stats.profitFactor > 1.2 ? 'text-neural-green' : 'text-neural-orange'} />
        <Stat label="Payoff" value={`${stats.payoff.toFixed(2)}×`} color={stats.payoff > 2 ? 'text-neural-green' : 'text-neural-orange'} />
        <Stat label="Avg Duration" value={stats.avgDuration < 60 ? `${Math.round(stats.avgDuration)}m` : `${(stats.avgDuration / 60).toFixed(1)}h`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Capture" value={`${(stats.avgCapture * 100).toFixed(0)}%`} color={stats.avgCapture > 0.6 ? 'text-neural-green' : 'text-neural-orange'} />
        <Stat label="Give-Back" value={`${stats.avgGiveBack.toFixed(1)}%`} color={stats.avgGiveBack < 30 ? 'text-neural-green' : 'text-neural-red'} />
        <Stat label="W / L" value={`${stats.wins} / ${stats.losses}`} color={stats.wins > stats.losses ? 'text-neural-green' : 'text-neural-red'} />
        <Stat label="Avoided" value={stats.avoided.toString()} color="text-muted-foreground" />
      </div>
    </div>
  );
};

// ─── Compact Trade Table ───

const CompactTradeTable = ({ trades, maxRows = 15 }: { trades: ForexTradeEntry[]; maxRows?: number }) => {
  const displayed = trades.slice(0, maxRows);

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card/50 hover:bg-card/50">
            <TableHead className="text-[10px] font-display">Pair</TableHead>
            <TableHead className="text-[10px] font-display">Dir</TableHead>
            <TableHead className="text-[10px] font-display">P&L</TableHead>
            <TableHead className="text-[10px] font-display">Net</TableHead>
            <TableHead className="text-[10px] font-display">MFE</TableHead>
            <TableHead className="text-[10px] font-display">Capture</TableHead>
            <TableHead className="text-[10px] font-display">Dur</TableHead>
            <TableHead className="text-[10px] font-display">Regime</TableHead>
            <TableHead className="text-[10px] font-display">Result</TableHead>
            <TableHead className="text-[10px] font-display">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.map(trade => (
            <TableRow key={trade.id} className="hover:bg-primary/5 transition-colors">
              <TableCell className="font-mono text-xs font-bold py-1.5">
                <div className="flex items-center gap-1">
                  {trade.pairName}
                  {trade.tradeDuration <= 15 && (
                    <Badge className="text-[7px] px-1 py-0 bg-primary/20 text-primary border-primary/30">S</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-1.5">
                <span className={cn('text-[10px] font-mono font-semibold', trade.direction === 'long' ? 'text-neural-green' : 'text-neural-red')}>
                  {trade.direction === 'long' ? '▲' : '▼'}
                </span>
              </TableCell>
              <TableCell className={cn('font-mono text-[11px] font-bold py-1.5', trade.pnlPercent > 0 ? 'text-neural-green' : trade.pnlPercent < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                {trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent.toFixed(3)}%
              </TableCell>
              <TableCell className={cn('font-mono text-[11px] py-1.5', trade.netExpectancy > 0 ? 'text-neural-green' : trade.netExpectancy < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                {trade.netExpectancy > 0 ? '+' : ''}{trade.netExpectancy.toFixed(3)}%
              </TableCell>
              <TableCell className="font-mono text-[11px] text-neural-green py-1.5">
                {trade.mfe > 0 ? `+${trade.mfe.toFixed(3)}%` : '—'}
              </TableCell>
              <TableCell className={cn('font-mono text-[11px] font-semibold py-1.5', trade.captureRatio > 0.6 ? 'text-neural-green' : trade.captureRatio > 0.3 ? 'text-neural-orange' : 'text-neural-red')}>
                {trade.outcome !== 'avoided' ? `${(trade.captureRatio * 100).toFixed(0)}%` : '—'}
              </TableCell>
              <TableCell className="text-[11px] py-1.5">
                {trade.tradeDuration < 60 ? `${trade.tradeDuration}m` : `${(trade.tradeDuration / 60).toFixed(1)}h`}
              </TableCell>
              <TableCell className="py-1.5">
                <Badge variant="outline" className={cn('text-[8px]', FOREX_REGIME_COLORS[trade.regime])}>
                  {FOREX_REGIME_LABELS[trade.regime].replace(' FX', '')}
                </Badge>
              </TableCell>
              <TableCell className="py-1.5">
                <Badge variant="outline" className={cn('text-[9px]',
                  trade.outcome === 'win' ? 'text-neural-green border-neural-green/30' :
                  trade.outcome === 'loss' ? 'text-neural-red border-neural-red/30' :
                  'text-muted-foreground border-border/50'
                )}>
                  {trade.outcome === 'avoided' && <Ban className="w-2.5 h-2.5 mr-0.5" />}
                  {trade.outcome.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-[10px] text-muted-foreground font-mono whitespace-nowrap py-1.5">
                {new Date(trade.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {trades.length > maxRows && (
        <div className="text-center py-2 text-[10px] text-muted-foreground border-t border-border/30">
          Showing {maxRows} of {trades.length} trades
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───

export const ScalpVsSwingView = ({ trades }: ScalpVsSwingViewProps) => {
  const scalpTrades = useMemo(() => trades.filter(t => t.tradeDuration <= 15), [trades]);
  const swingTrades = useMemo(() => trades.filter(t => t.tradeDuration > 15), [trades]);

  return (
    <div className="space-y-6">
      {/* Comparison Header */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Scalp Trades (≤15m)</p>
            <p className="text-2xl font-display font-bold text-primary">{scalpTrades.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/10 border border-border/30 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Non-Scalp FX (&gt;15m)</p>
            <p className="text-2xl font-display font-bold text-foreground">{swingTrades.length}</p>
          </div>
        </div>
      </motion.div>

      {/* Scalp Section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="bg-card/60 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-primary" />
              Scalping Trades — P&L & History
              <Badge className="text-[8px] bg-primary/20 text-primary border-primary/30 ml-auto">≤ 15 min</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategorySummary trades={scalpTrades} label="Scalping Performance" icon={Crosshair} accentColor="text-primary" />
            <CompactTradeTable trades={scalpTrades} maxRows={20} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Non-Scalp Section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-neural-orange" />
              Non-Scalp FX Trades — P&L & History
              <Badge variant="outline" className="text-[8px] text-neural-orange border-neural-orange/30 ml-auto">&gt; 15 min</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategorySummary trades={swingTrades} label="Non-Scalp Performance" icon={Clock} accentColor="text-neural-orange" />
            <CompactTradeTable trades={swingTrades} maxRows={20} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
