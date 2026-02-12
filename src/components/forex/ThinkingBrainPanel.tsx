// ThinkingBrainPanel — Real-time AI Decision Feed + Adaptive Learning Layout
// Shows every decision the system makes with full reasoning chain,
// plus the learning memory state across all environments.

import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Zap, Eye, Shield, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, AlertTriangle, RotateCcw,
  Activity, Cpu, Network, ArrowRightLeft, ChevronDown,
  ChevronUp, Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  getEdgeLearningSummary,
  getEdgeMemory,
  type EdgeMemoryEntry,
  type LearningState,
} from '@/lib/forex/edgeLearningState';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';

// ─── Types ───────────────────────────────────────────────────────────

interface DecisionEvent {
  id: string;
  timestamp: string;
  pair: string;
  direction: string;
  decision: 'ENTERED' | 'SKIPPED' | 'BLOCKED';
  reason: string;
  regime: string;
  session: string;
  confidence: number;
  composite: number;
  gateResult: string;
  gateReasons: string[];
  agentId: string;
  pnlPips?: number;
  status: string;
}

interface CurrencyStrength {
  currency: string;
  netPips: number;
  trades: number;
  winRate: number;
  trend: 'rising' | 'falling' | 'flat';
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getPipMultiplier(pair: string): number {
  return pair.includes('JPY') ? 100 : 10000;
}

function parseDecisionFromOrder(o: any): DecisionEvent {
  const hasEntry = o.entry_price != null;
  const hasClosed = o.exit_price != null;
  const mult = getPipMultiplier(o.currency_pair);
  const pnl = hasClosed
    ? (o.direction === 'long'
        ? (o.exit_price - o.entry_price) * mult
        : (o.entry_price - o.exit_price) * mult)
    : undefined;

  let decision: DecisionEvent['decision'] = 'ENTERED';
  if (o.status === 'shadow_eval' || o.status === 'blocked') decision = 'BLOCKED';
  else if (o.status === 'skipped') decision = 'SKIPPED';

  return {
    id: o.id,
    timestamp: o.created_at,
    pair: o.currency_pair,
    direction: o.direction,
    decision,
    reason: o.gate_reasons?.join(' · ') || 'Passed all gates',
    regime: o.regime_label || 'unknown',
    session: o.session_label || 'unknown',
    confidence: o.confidence_score ?? 0,
    composite: o.governance_composite ?? 0,
    gateResult: o.gate_result || 'passed',
    gateReasons: o.gate_reasons || [],
    agentId: o.agent_id || 'unknown',
    pnlPips: pnl ? Math.round(pnl * 10) / 10 : undefined,
    status: o.status,
  };
}

function computeCurrencyStrength(orders: any[]): CurrencyStrength[] {
  const map: Record<string, { pips: number; wins: number; total: number }> = {};

  for (const o of orders) {
    if (o.entry_price == null || o.exit_price == null) continue;
    const mult = getPipMultiplier(o.currency_pair);
    const pips = o.direction === 'long'
      ? (o.exit_price - o.entry_price) * mult
      : (o.entry_price - o.exit_price) * mult;
    const isWin = pips > 0;

    const [base, quote] = o.currency_pair.split('_');
    if (!base || !quote) continue;

    // If long wins, base is strong; if short wins, quote is strong
    const baseContribution = o.direction === 'long' ? pips : -pips;
    const quoteContribution = -baseContribution;

    if (!map[base]) map[base] = { pips: 0, wins: 0, total: 0 };
    if (!map[quote]) map[quote] = { pips: 0, wins: 0, total: 0 };

    map[base].pips += baseContribution;
    map[base].total++;
    if (baseContribution > 0) map[base].wins++;

    map[quote].pips += quoteContribution;
    map[quote].total++;
    if (quoteContribution > 0) map[quote].wins++;
  }

  return Object.entries(map)
    .map(([currency, data]) => ({
      currency,
      netPips: Math.round(data.pips * 10) / 10,
      trades: data.total,
      winRate: data.total > 0 ? data.wins / data.total : 0,
      trend: data.pips > 2 ? 'rising' as const : data.pips < -2 ? 'falling' as const : 'flat' as const,
    }))
    .sort((a, b) => b.netPips - a.netPips);
}

// ─── Decision Feed Item ──────────────────────────────────────────────

function DecisionItem({ event, index }: { event: DecisionEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const pair = event.pair.replace('_', '/');

  const decisionConfig = {
    ENTERED: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'ENTER' },
    SKIPPED: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'SKIP' },
    BLOCKED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'BLOCK' },
  };
  const cfg = decisionConfig[event.decision];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: index * 0.02, type: 'spring', stiffness: 300 }}
      className={cn('border rounded-lg p-2.5 cursor-pointer transition-all hover:bg-muted/10', cfg.bg)}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <Icon className={cn('w-4 h-4', cfg.color)} />
            {index === 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </div>
          <span className="font-mono font-bold text-xs text-foreground">{pair}</span>
          <Badge variant="outline" className={cn(
            'text-[8px] px-1 py-0',
            event.direction === 'long' ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30',
          )}>
            {event.direction.toUpperCase()}
          </Badge>
          <Badge variant="outline" className={cn('text-[8px] px-1 py-0', cfg.color, `border-current/30`)}>
            {cfg.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {event.pnlPips !== undefined && (
            <span className={cn(
              'text-[10px] font-mono font-bold',
              event.pnlPips > 0 ? 'text-emerald-400' : event.pnlPips < 0 ? 'text-red-400' : 'text-muted-foreground',
            )}>
              {event.pnlPips >= 0 ? '+' : ''}{event.pnlPips}p
            </span>
          )}
          <span className="text-[9px] text-muted-foreground font-mono">{time}</span>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded reasoning */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-border/20 space-y-1.5">
              {/* Reasoning chain */}
              <div className="flex items-start gap-1.5">
                <Cpu className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">Decision Reasoning</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{event.reason || 'All governance gates passed'}</p>
                </div>
              </div>

              {/* Context grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[9px]">
                <div className="p-1.5 rounded bg-muted/10 border border-border/20">
                  <span className="text-muted-foreground">Regime</span>
                  <p className="font-mono font-bold text-foreground">{event.regime}</p>
                </div>
                <div className="p-1.5 rounded bg-muted/10 border border-border/20">
                  <span className="text-muted-foreground">Session</span>
                  <p className="font-mono font-bold text-foreground">{event.session}</p>
                </div>
                <div className="p-1.5 rounded bg-muted/10 border border-border/20">
                  <span className="text-muted-foreground">Composite</span>
                  <p className="font-mono font-bold text-foreground">{(event.composite * 100).toFixed(0)}%</p>
                </div>
                <div className="p-1.5 rounded bg-muted/10 border border-border/20">
                  <span className="text-muted-foreground">Agent</span>
                  <p className="font-mono font-bold text-foreground truncate">{event.agentId}</p>
                </div>
              </div>

              {/* Gate reasons */}
              {event.gateReasons.length > 0 && (
                <div className="space-y-0.5">
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> Gates Triggered
                  </span>
                  {event.gateReasons.map((r, i) => (
                    <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Environment Memory Card ─────────────────────────────────────────

const stateColors: Record<LearningState, string> = {
  Learning: 'text-blue-400',
  Stable: 'text-emerald-400',
  Decaying: 'text-amber-400',
  Reverting: 'text-red-400',
};

const stateIcons: Record<LearningState, React.ElementType> = {
  Learning: Brain,
  Stable: CheckCircle2,
  Decaying: TrendingDown,
  Reverting: RotateCcw,
};

function EnvironmentCard({ entry }: { entry: EdgeMemoryEntry }) {
  const Icon = stateIcons[entry.learningState];
  const color = stateColors[entry.learningState];
  const confPct = Math.round(entry.edgeConfidence * 100);

  // Parse signature into readable parts
  const parts = entry.environmentSignature.split('|');
  const [session, regime, pair, direction] = parts;

  return (
    <div className="p-2.5 rounded-lg bg-card/50 border border-border/30 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3.5 h-3.5', color)} />
          <span className="font-mono text-[10px] font-bold text-foreground">
            {pair?.replace('_', '/') || '?'}
          </span>
          <Badge variant="outline" className={cn(
            'text-[7px] px-1 py-0',
            direction === 'long' ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30',
          )}>
            {direction?.toUpperCase() || '?'}
          </Badge>
        </div>
        <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', color)}>
          {entry.learningState}
        </Badge>
      </div>

      {/* Confidence bar */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[8px]">
          <span className="text-muted-foreground">Edge Confidence</span>
          <span className={cn('font-mono font-bold', color)}>{confPct}%</span>
        </div>
        <Progress value={confPct} className={cn('h-1.5', confPct >= 60 ? '[&>div]:bg-emerald-500' : confPct >= 30 ? '[&>div]:bg-blue-500' : '[&>div]:bg-amber-500')} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 text-[8px]">
        <div className="text-center">
          <p className={cn('font-mono font-bold', entry.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {entry.expectancy >= 0 ? '+' : ''}{entry.expectancy.toFixed(1)}p
          </p>
          <p className="text-muted-foreground">Expectancy</p>
        </div>
        <div className="text-center">
          <p className="font-mono font-bold text-foreground">{entry.tradeCount}</p>
          <p className="text-muted-foreground">Trades</p>
        </div>
        <div className="text-center">
          <p className="font-mono font-bold text-foreground">{entry.sharpeStability.toFixed(2)}</p>
          <p className="text-muted-foreground">Stability</p>
        </div>
      </div>

      {/* Context tags */}
      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant="outline" className="text-[7px] px-1 py-0">{regime || '?'}</Badge>
        <Badge variant="outline" className="text-[7px] px-1 py-0">{session || '?'}</Badge>
      </div>
    </div>
  );
}

// ─── Currency Strength Bar ───────────────────────────────────────────

function CurrencyStrengthBar({ data }: { data: CurrencyStrength[] }) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.netPips)), 1);

  return (
    <div className="space-y-1">
      {data.map((c) => {
        const pct = (Math.abs(c.netPips) / maxAbs) * 100;
        const isPositive = c.netPips >= 0;
        return (
          <div key={c.currency} className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold w-8 text-foreground">{c.currency}</span>
            <div className="flex-1 h-3 bg-muted/20 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className={cn(
                  'h-full rounded-full',
                  isPositive ? 'bg-emerald-500/60' : 'bg-red-500/60',
                )}
              />
            </div>
            <span className={cn(
              'text-[9px] font-mono font-bold min-w-[45px] text-right',
              isPositive ? 'text-emerald-400' : 'text-red-400',
            )}>
              {c.netPips >= 0 ? '+' : ''}{c.netPips}p
            </span>
            <span className="text-[8px] text-muted-foreground min-w-[30px] text-right">
              {(c.winRate * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

interface ThinkingBrainPanelProps {
  executionMetrics: RealExecutionMetrics | null;
}

export function ThinkingBrainPanel({ executionMetrics }: ThinkingBrainPanelProps) {
  const [decisions, setDecisions] = useState<DecisionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPair, setFilterPair] = useState<string>('all');

  const CUTOFF = '2026-02-12T01:00:00Z';

  // Fetch recent decisions
  const fetchDecisions = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('*')
        .gte('created_at', CUTOFF)
        .eq('environment', 'live')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        setDecisions(data.map(parseDecisionFromOrder));
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDecisions();
    const iv = setInterval(fetchDecisions, 30000); // refresh every 30s
    return () => clearInterval(iv);
  }, [fetchDecisions]);

  // Learning memory
  const edgeMemory = useMemo(() => {
    const mem = getEdgeMemory();
    return Array.from(mem.values())
      .sort((a, b) => b.edgeConfidence - a.edgeConfidence);
  }, [executionMetrics]);

  const learningSummary = useMemo(() => getEdgeLearningSummary(), [executionMetrics]);

  // Currency strength from closed orders
  const currencyStrength = useMemo(() => {
    if (!executionMetrics?.recentOrders) return [];
    const closed = executionMetrics.recentOrders.filter(o =>
      o.entry_price != null && o.exit_price != null &&
      new Date(o.created_at).getTime() >= new Date(CUTOFF).getTime()
    );
    return computeCurrencyStrength(closed);
  }, [executionMetrics]);

  // Filter decisions
  const pairs = useMemo(() => {
    const set = new Set(decisions.map(d => d.pair));
    return Array.from(set).sort();
  }, [decisions]);

  const filteredDecisions = useMemo(() => {
    if (filterPair === 'all') return decisions;
    return decisions.filter(d => d.pair === filterPair);
  }, [decisions, filterPair]);

  // Stats
  const stats = useMemo(() => {
    const entered = decisions.filter(d => d.decision === 'ENTERED').length;
    const blocked = decisions.filter(d => d.decision === 'BLOCKED').length;
    const skipped = decisions.filter(d => d.decision === 'SKIPPED').length;
    return { entered, blocked, skipped, total: decisions.length };
  }, [decisions]);

  return (
    <div className="space-y-4">
      {/* Brain Header */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain className="w-5 h-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          </div>
          <h3 className="text-sm font-display font-bold text-foreground">AI Thinking Brain</h3>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-primary border-primary/30">LIVE</Badge>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span>{stats.entered} entered</span>
          <span>{stats.blocked + stats.skipped} filtered</span>
          <span>{learningSummary.totalEnvironments} envs tracked</span>
        </div>
      </motion.div>

      {/* Decision Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={Activity} label="Decisions" value={stats.total.toString()} color="text-foreground" />
        <StatCard icon={CheckCircle2} label="Entered" value={stats.entered.toString()} color="text-emerald-400" />
        <StatCard icon={XCircle} label="Blocked" value={stats.blocked.toString()} color="text-red-400" />
        <StatCard icon={AlertTriangle} label="Skipped" value={stats.skipped.toString()} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Decision Feed */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
              <Cpu className="w-3 h-3 text-primary" /> Decision Feed
            </h4>
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <select
                value={filterPair}
                onChange={(e) => setFilterPair(e.target.value)}
                className="text-[9px] bg-transparent border border-border/30 rounded px-1.5 py-0.5 text-foreground"
              >
                <option value="all">All Pairs</option>
                {pairs.map(p => (
                  <option key={p} value={p}>{p.replace('_', '/')}</option>
                ))}
              </select>
            </div>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-1.5 pr-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Brain className="w-6 h-6 text-primary animate-pulse" />
                  <span className="ml-2 text-xs text-muted-foreground">Loading decisions...</span>
                </div>
              ) : filteredDecisions.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">No decisions yet</div>
              ) : (
                filteredDecisions.map((event, i) => (
                  <DecisionItem key={event.id} event={event} index={i} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Learning State + Currency Strength */}
        <div className="space-y-4">
          {/* Currency Strength Matrix */}
          <div className="p-3 rounded-xl bg-card/50 border border-border/40 space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
              <ArrowRightLeft className="w-3 h-3 text-primary" /> Currency Strength
            </h4>
            {currencyStrength.length > 0 ? (
              <CurrencyStrengthBar data={currencyStrength} />
            ) : (
              <p className="text-[9px] text-muted-foreground text-center py-3">Waiting for closed trades...</p>
            )}
          </div>

          {/* Learning Memory Grid */}
          <div className="p-3 rounded-xl bg-card/50 border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
                <Network className="w-3 h-3 text-primary" /> Adaptive Memory
              </h4>
              <span className="text-[8px] text-muted-foreground">
                {learningSummary.stableCount} stable · {learningSummary.learningCount} learning
              </span>
            </div>

            {/* Confidence summary */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[8px]">
                <span className="text-muted-foreground">Avg Confidence</span>
                <span className="font-mono font-bold text-foreground">{(learningSummary.avgEdgeConfidence * 100).toFixed(0)}%</span>
              </div>
              <Progress value={learningSummary.avgEdgeConfidence * 100} className="h-1.5" />
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-1.5 pr-1">
                {edgeMemory.length > 0 ? (
                  edgeMemory.map((entry, i) => (
                    <EnvironmentCard key={entry.environmentSignature} entry={entry} />
                  ))
                ) : (
                  <p className="text-[9px] text-muted-foreground text-center py-4">Building memory from trades...</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-card/50 border border-border/30 text-center space-y-0.5">
      <Icon className={cn('w-3.5 h-3.5 mx-auto', color)} />
      <p className={cn('text-lg font-display font-bold', color)}>{value}</p>
      <p className="text-[8px] text-muted-foreground">{label}</p>
    </div>
  );
}
