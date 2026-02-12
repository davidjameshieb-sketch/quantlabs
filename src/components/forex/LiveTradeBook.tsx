// LiveTradeBook — Primary trade book dashboard
// Shows each live trade with win/loss meter, expectation analysis, and learning notes

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, Clock, Target, AlertTriangle,
  CheckCircle2, XCircle, Minus, Brain, Lightbulb, ArrowRight,
  Activity
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { RealOrder, RealExecutionMetrics } from '@/hooks/useOandaPerformance';

// ─── Helpers ─────────────────────────────────────────────────────────

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

function computePnlPips(o: RealOrder): number {
  if (o.entry_price == null || o.exit_price == null) return 0;
  const mult = getPipMultiplier(o.currency_pair);
  const raw = o.direction === 'long'
    ? (o.exit_price - o.entry_price) * mult
    : (o.entry_price - o.exit_price) * mult;
  return Math.round(raw * 10) / 10;
}

function getDurationMin(o: RealOrder): number {
  if (!o.closed_at) return 0;
  return Math.round((new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 60000);
}

interface TradeExpectation {
  asExpected: boolean;
  reason: string;
}

function analyzeExpectation(o: RealOrder, pips: number): TradeExpectation {
  const regime = o.regime_label || 'unknown';
  const session = o.session_label || 'unknown';
  const direction = o.direction;
  
  // Compression regime should NOT produce long wins — it's range-bound
  if (regime === 'compression' && direction === 'long') {
    if (pips <= 0) {
      return { asExpected: false, reason: `Long in compression regime — low probability setup. System should block this.` };
    }
    return { asExpected: false, reason: `Won despite compression regime — lucky, not repeatable.` };
  }

  // Exhaustion regime — can go either way
  if (regime === 'exhaustion') {
    if (pips <= 0) {
      return { asExpected: false, reason: `Exhaustion regime entry — trend fading, high reversal risk.` };
    }
    return { asExpected: true, reason: `Captured remaining momentum before exhaustion.` };
  }

  // Low-liquidity sessions
  if (['rollover', 'late-ny', 'asian'].includes(session)) {
    if (pips <= 0) {
      return { asExpected: false, reason: `Traded during ${session} session — low liquidity, wide spreads.` };
    }
    return { asExpected: true, reason: `Won despite ${session} session timing.` };
  }

  // Good setups
  if (['expansion', 'momentum'].includes(regime) && direction === 'long') {
    if (pips > 0) {
      return { asExpected: true, reason: `Long in ${regime} regime — aligned with trend.` };
    }
    return { asExpected: false, reason: `Loss despite favorable ${regime} regime — check exit timing.` };
  }

  if (pips > 0) {
    return { asExpected: true, reason: `Trade executed within expected parameters.` };
  }
  return { asExpected: false, reason: `Loss — review entry conditions and market context.` };
}

function deriveLearning(o: RealOrder, pips: number, expectation: TradeExpectation): string {
  const regime = o.regime_label || 'unknown';
  const session = o.session_label || 'unknown';
  
  if (regime === 'compression' && o.direction === 'long') {
    return `Block longs in compression regimes. Require expansion/momentum for directional entries.`;
  }
  if (['rollover', 'late-ny'].includes(session) && pips < 0) {
    return `Add session filter: block ${session} entries. Focus on London/NY overlap for best liquidity.`;
  }
  if (regime === 'exhaustion' && pips < 0) {
    return `Tighten exhaustion regime gates — only enter with strong momentum consensus (6/7+).`;
  }
  if (pips > 2) {
    return `Good execution. Regime: ${regime}, Session: ${session}. Repeat this setup pattern.`;
  }
  if (pips < -3) {
    return `Large loss. Review: was stop too wide? Was regime validated at entry time?`;
  }
  if (Math.abs(pips) < 1) {
    return `Breakeven/scratch trade. Spread cost may exceed edge — check friction scoring.`;
  }
  return `Monitor this setup pattern. Accumulate more data for statistical significance.`;
}

// ─── Components ──────────────────────────────────────────────────────

function WinLossMeter({ pips }: { pips: number }) {
  const isWin = pips > 0;
  const isScratch = Math.abs(pips) < 0.5;
  const magnitude = Math.min(Math.abs(pips) / 10, 1) * 100; // 10 pips = full bar
  
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1">
        <Progress 
          value={magnitude} 
          className={cn(
            "h-2.5 rounded-full",
            isScratch ? "[&>div]:bg-muted-foreground" :
            isWin ? "[&>div]:bg-emerald-500" : "[&>div]:bg-red-500"
          )} 
        />
      </div>
      <span className={cn(
        "text-xs font-mono font-bold min-w-[50px] text-right",
        isScratch ? "text-muted-foreground" :
        isWin ? "text-emerald-400" : "text-red-400"
      )}>
        {pips >= 0 ? '+' : ''}{pips.toFixed(1)}p
      </span>
    </div>
  );
}

function TradeRow({ order, index }: { order: RealOrder; index: number }) {
  const pips = computePnlPips(order);
  const isWin = pips > 0;
  const isScratch = Math.abs(pips) < 0.5;
  const duration = getDurationMin(order);
  const expectation = analyzeExpectation(order, pips);
  const learning = deriveLearning(order, pips, expectation);
  const pair = order.currency_pair.replace('_', '/');
  const time = new Date(order.created_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "border rounded-lg p-3 space-y-2 transition-colors",
        isScratch ? "border-border/30 bg-card/30" :
        isWin ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
      )}
    >
      {/* Row 1: Trade identity + P&L meter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isWin ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : isScratch ? (
            <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="font-mono font-bold text-sm text-foreground">{pair}</span>
          <Badge variant="outline" className={cn(
            "text-[9px] px-1.5",
            order.direction === 'long' ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"
          )}>
            {order.direction.toUpperCase()}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        <WinLossMeter pips={pips} />
      </div>

      {/* Row 2: Trade details */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {order.entry_price?.toFixed(5)} → {order.exit_price?.toFixed(5) ?? '—'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {duration}m
        </span>
        <Badge variant="outline" className="text-[9px] px-1">
          {order.regime_label || '?'}
        </Badge>
        <Badge variant="outline" className="text-[9px] px-1">
          {order.session_label || '?'}
        </Badge>
        <span>Agent: {order.agent_id || '?'}</span>
        {order.execution_quality_score != null && (
          <span>Quality: {order.execution_quality_score}%</span>
        )}
      </div>

      {/* Row 3: Expectation + Learning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-border/20">
        <div className="flex items-start gap-1.5">
          {expectation.asExpected ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          )}
          <div>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
              {expectation.asExpected ? 'As Expected' : 'Unexpected'}
            </span>
            <p className="text-[10px] text-muted-foreground leading-tight">{expectation.reason}</p>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Learning</span>
            <p className="text-[10px] text-muted-foreground leading-tight">{learning}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

interface LiveTradeBookProps {
  metrics: RealExecutionMetrics | null;
}

export function LiveTradeBook({ metrics }: LiveTradeBookProps) {
  const trades = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders
      .filter(o => 
        (o.status === 'filled' || o.status === 'closed') &&
        o.entry_price != null && o.exit_price != null
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [metrics]);

  const summary = useMemo(() => {
    const wins = trades.filter(t => computePnlPips(t) > 0);
    const losses = trades.filter(t => computePnlPips(t) <= 0);
    const totalPips = trades.reduce((s, t) => s + computePnlPips(t), 0);
    const unexpectedCount = trades.filter(t => !analyzeExpectation(t, computePnlPips(t)).asExpected).length;
    
    // Key pattern: most common losing regime
    const regimeLosses: Record<string, number> = {};
    losses.forEach(t => {
      const r = t.regime_label || 'unknown';
      regimeLosses[r] = (regimeLosses[r] || 0) + 1;
    });
    const worstRegime = Object.entries(regimeLosses).sort((a, b) => b[1] - a[1])[0];

    // Key pattern: most common losing session
    const sessionLosses: Record<string, number> = {};
    losses.forEach(t => {
      const s = t.session_label || 'unknown';
      sessionLosses[s] = (sessionLosses[s] || 0) + 1;
    });
    const worstSession = Object.entries(sessionLosses).sort((a, b) => b[1] - a[1])[0];

    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length * 100) : 0,
      totalPips: Math.round(totalPips * 10) / 10,
      unexpectedCount,
      worstRegime: worstRegime ? `${worstRegime[0]} (${worstRegime[1]} losses)` : null,
      worstSession: worstSession ? `${worstSession[0]} (${worstSession[1]} losses)` : null,
    };
  }, [trades]);

  if (!metrics?.hasData || trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-border/30 rounded-lg bg-card/30">
        <Activity className="w-8 h-8 text-muted-foreground mb-3" />
        <h3 className="font-display text-lg font-bold text-foreground">Awaiting Live Trades</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No live environment trades found. The system will populate this view as trades execute.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Trades" value={`${summary.total}`} />
        <SummaryCard 
          label="Record" 
          value={`${summary.wins}W / ${summary.losses}L`} 
          status={summary.wins > summary.losses ? 'good' : 'bad'} 
        />
        <SummaryCard 
          label="Win Rate" 
          value={`${summary.winRate.toFixed(1)}%`} 
          status={summary.winRate >= 55 ? 'good' : summary.winRate >= 45 ? 'warn' : 'bad'} 
        />
        <SummaryCard 
          label="Net P&L" 
          value={`${summary.totalPips >= 0 ? '+' : ''}${summary.totalPips}p`} 
          status={summary.totalPips >= 0 ? 'good' : 'bad'} 
        />
        <SummaryCard 
          label="Unexpected" 
          value={`${summary.unexpectedCount}/${summary.total}`} 
          status={summary.unexpectedCount > summary.total * 0.5 ? 'bad' : 'warn'} 
        />
      </div>

      {/* Key Insights */}
      {(summary.worstRegime || summary.worstSession) && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Brain className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Key Pattern</span>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {summary.worstRegime && (
                <span>Worst regime: <strong className="text-foreground">{summary.worstRegime}</strong></span>
              )}
              {summary.worstSession && (
                <span>Worst session: <strong className="text-foreground">{summary.worstSession}</strong></span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-primary">
              <ArrowRight className="w-3 h-3" />
              <span>Strategy update: block these patterns in next iteration</span>
            </div>
          </div>
        </div>
      )}

      {/* Trade List */}
      <div className="space-y-2">
        {trades.map((order, i) => (
          <TradeRow key={order.id} order={order} index={i} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="p-2.5 rounded-lg border border-border/30 bg-card/50 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={cn(
        "text-sm font-mono font-bold mt-0.5",
        status === 'good' ? 'text-emerald-400' :
        status === 'bad' ? 'text-red-400' :
        status === 'warn' ? 'text-amber-400' :
        'text-foreground'
      )}>
        {value}
      </p>
    </div>
  );
}
