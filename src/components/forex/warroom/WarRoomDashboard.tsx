// War Room Dashboard — 6-panel predatory command center for the Sovereign Barrage Protocol
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  Target, Zap, Radio, Shield, GitBranch, Lock,
  TrendingUp, TrendingDown, Activity, Skull, Crown,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { DirectiveSaturationHeatmap } from './DirectiveSaturationHeatmap';
import type { OandaAccountSummary } from '@/hooks/useOandaExecution';
import type { RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import type { TradeAnalyticsResult } from '@/hooks/useTradeAnalytics';

interface WarRoomProps {
  account: OandaAccountSummary | null;
  executionMetrics: RealExecutionMetrics | null;
  tradeAnalytics: TradeAnalyticsResult;
  connected: boolean | null;
}

// ─── Panel wrapper ───
const Panel = ({ title, icon: Icon, children, accent = 'primary' }: {
  title: string; icon: React.ElementType; children: React.ReactNode; accent?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden"
  >
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
      <Icon className={`w-4 h-4 text-${accent}`} />
      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
    </div>
    <div className="p-4">{children}</div>
  </motion.div>
);

// ─── Stat chip ───
const Stat = ({ label, value, sub, positive }: {
  label: string; value: string | number; sub?: string; positive?: boolean | null;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    <span className={`text-lg font-mono font-bold ${positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-foreground'}`}>
      {value}
    </span>
    {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
  </div>
);

export function WarRoomDashboard({ account, executionMetrics, tradeAnalytics, connected }: WarRoomProps) {
  const [hardwires, setHardwires] = useState<{ gate_id: string; reason: string; expires_at: string }[]>([]);
  const [leadLags, setLeadLags] = useState<{ gate_id: string; reason: string; created_at: string }[]>([]);
  const [godSignals, setGodSignals] = useState<{ gate_id: string; reason: string; pair: string | null }[]>([]);

  // Fetch gate_bypasses for hardwires, lead-lag, and god signals
  useEffect(() => {
    const fetchGates = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, expires_at, created_at, pair, revoked')
        .eq('revoked', false)
        .gte('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!data) return;

      setHardwires(data.filter(d => d.reason?.includes('architect-hardwire') || d.gate_id.startsWith('EVOLUTION_PARAM') || d.gate_id.startsWith('SIZING_OVERRIDE') || d.gate_id.startsWith('GATE_THRESHOLD') || d.gate_id.startsWith('DYNAMIC_GATE')));
      setLeadLags(data.filter(d => d.gate_id.includes('LEAD_LAG') || d.reason?.toLowerCase().includes('lead-lag') || d.reason?.toLowerCase().includes('lead_lag')));
      setGodSignals(data.filter(d => d.reason?.toLowerCase().includes('god') || d.reason?.toLowerCase().includes('cot') || d.reason?.toLowerCase().includes('divergence')));
    };
    fetchGates();
    const id = setInterval(fetchGates, 15_000);
    return () => clearInterval(id);
  }, []);

  // ─── Derived metrics ───
  const nav = account ? parseFloat(account.nav) : 0;
  const TARGET = 500;
  const progress = Math.min(100, Math.max(0, (nav / TARGET) * 100));
  const remaining = Math.max(0, TARGET - nav);

  const totalTrades = (executionMetrics?.winCount ?? 0) + (executionMetrics?.lossCount ?? 0);
  const winRate = totalTrades > 0 ? ((executionMetrics?.winCount ?? 0) / totalTrades * 100) : 0;
  const pnl = tradeAnalytics.totalPnlPips;

  // Sovereignty score: count of active hardwires / 6 * 100
  const sovereigntyScore = Math.min(100, Math.round((hardwires.length / 6) * 100));

  // ─── ETA to $500 ───
  const etaLabel = useMemo(() => {
    if (nav >= TARGET) return '🏁 TARGET HIT';
    if (!executionMetrics?.recentOrders || executionMetrics.recentOrders.length < 2) return 'Calculating...';
    const closed = executionMetrics.recentOrders
      .filter(o => o.closed_at && o.entry_price != null && o.exit_price != null)
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
    if (closed.length < 2) return 'Insufficient data';

    const firstTime = new Date(closed[0].closed_at!).getTime();
    const lastTime = new Date(closed[closed.length - 1].closed_at!).getTime();
    const hoursElapsed = (lastTime - firstTime) / 3_600_000;
    if (hoursElapsed < 0.01) return 'Calculating...';

    // Compute realized $ P&L from closed trades
    const JPY_PAIRS = ['USD_JPY','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY','CHF_JPY','NZD_JPY'];
    let totalDollarPnl = 0;
    for (const o of closed) {
      const mult = JPY_PAIRS.includes(o.currency_pair) ? 100 : 10000;
      const pipPnl = o.direction === 'long'
        ? (o.exit_price! - o.entry_price!) * mult
        : (o.entry_price! - o.exit_price!) * mult;
      // Rough $ estimate: ~$0.10 per pip per unit (micro lot approximation)
      totalDollarPnl += pipPnl * (Math.abs(o.units) / 10000);
    }

    const dollarPerHour = totalDollarPnl / hoursElapsed;
    if (dollarPerHour <= 0) return 'Negative velocity — recalibrating';

    const hoursToTarget = remaining / dollarPerHour;
    if (hoursToTarget > 720) return `${Math.round(hoursToTarget / 24)}d at current pace`;
    if (hoursToTarget > 48) return `~${Math.round(hoursToTarget / 24)}d ${Math.round(hoursToTarget % 24)}h`;
    if (hoursToTarget > 1) return `~${Math.round(hoursToTarget)}h`;
    return `~${Math.round(hoursToTarget * 60)}min`;
  }, [nav, remaining, executionMetrics]);

  return (
    <div className="space-y-4">
      {/* ─── 1. VELOCITY TO $500 ─── */}
      <Panel title="Velocity to $500" icon={Target} accent="primary">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-mono font-black text-foreground">
              ${nav.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              ${remaining.toFixed(2)} remaining
            </span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>$0</span>
            <span className="font-bold text-primary">${TARGET}</span>
          </div>
          <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-muted/40 border border-border/20">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono font-bold text-foreground">ETA to $500:</span>
            <span className="text-xs font-mono text-primary">{etaLabel}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/20">
            <Stat label="NAV Velocity" value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}p`} positive={pnl >= 0} />
            <Stat label="Open P&L" value={account ? `$${parseFloat(account.unrealizedPL).toFixed(2)}` : '—'} positive={account ? parseFloat(account.unrealizedPL) >= 0 : null} />
            <Stat label="Open Trades" value={account?.openTradeCount ?? 0} />
          </div>
        </div>
      </Panel>

      {/* ─── 2-col layout ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ─── 2. MEAT GRINDER STATS ─── */}
        <Panel title="Meat Grinder — Live Turnover" icon={Skull}>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Total Trades" value={totalTrades} />
            <Stat label="Win Rate" value={`${winRate.toFixed(1)}%`} positive={winRate >= 40} />
            <Stat label="Wins" value={executionMetrics?.winCount ?? 0} positive={true} />
            <Stat label="Losses" value={executionMetrics?.lossCount ?? 0} positive={false} />
            <Stat label="Net PnL (pips)" value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}`} positive={pnl >= 0} />
            <Stat label="Avg Slippage" value={`${(executionMetrics?.avgSlippage ?? 0).toFixed(2)}p`} />
            <Stat label="Avg Exec Quality" value={`${executionMetrics?.avgExecutionQuality ?? 0}%`} positive={(executionMetrics?.avgExecutionQuality ?? 0) >= 70} />
            <Stat label="Avg Friction" value={`${executionMetrics?.avgFrictionScore ?? 0}`} />
          </div>
        </Panel>

        {/* ─── 3. GOD-SIGNAL ALIGNMENT ─── */}
        <Panel title="God-Signal Alignment Map" icon={Radio}>
          {godSignals.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs">
              <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No active God-Signals — awaiting COT/TFF divergence
            </div>
          ) : (
            <div className="space-y-2">
              {godSignals.slice(0, 5).map((gs, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-lg px-3 py-2">
                  <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-foreground font-medium">{gs.pair || 'GLOBAL'}</span>
                  <span className="text-muted-foreground truncate">{gs.reason}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ─── 4. SOVEREIGNTY SCORE ─── */}
        <Panel title="Sovereignty Score" icon={Shield}>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={sovereigntyScore >= 80 ? 'hsl(var(--primary))' : sovereigntyScore >= 50 ? 'hsl(45, 90%, 55%)' : 'hsl(0, 70%, 55%)'}
                  strokeWidth="8"
                  strokeDasharray={`${sovereigntyScore * 2.64} 264`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-mono font-black text-foreground">
                {sovereigntyScore}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase">
              {sovereigntyScore >= 80 ? 'FULL SOVEREIGNTY' : sovereigntyScore >= 50 ? 'PARTIAL CONTROL' : 'DEGRADED'}
            </span>
          </div>
        </Panel>

        {/* ─── 5. LEAD-LAG PULSE ─── */}
        <Panel title="Lead-Lag Pulse" icon={GitBranch}>
          {leadLags.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No active lead-lag opportunities detected
            </div>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {leadLags.slice(0, 6).map((ll, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 rounded-lg px-3 py-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{ll.reason}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ─── 6. ARCHITECT HARDWIRE STATUS ─── */}
        <Panel title="Architect Hardwire" icon={Lock}>
          <div className="space-y-2">
            {hardwires.length === 0 ? (
              <span className="text-xs text-muted-foreground">No hardwires active</span>
            ) : (
              hardwires.slice(0, 8).map((hw, i) => {
                const label = hw.gate_id.split(':').pop() || hw.gate_id;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="font-mono text-foreground font-medium">{label}</span>
                    <span className="text-muted-foreground truncate text-[10px]">
                      → {new Date(hw.expires_at).getFullYear()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      {/* Row 4: Directive Saturation Heatmap */}
      <DirectiveSaturationHeatmap />
    </div>
  );
}
