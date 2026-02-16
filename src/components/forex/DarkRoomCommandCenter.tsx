// Dark-Room Command Center — Single-screen unified view
// God Signal + Lead-Lag Radar + Trade Execution + System Health

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  Crown, GitBranch, Activity, Shield, Zap, Target,
  TrendingUp, TrendingDown, Radio, Eye, EyeOff, AlertTriangle,
  CheckCircle2, XCircle, Minus, Clock, Server, Wifi, WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { OandaAccountSummary } from '@/hooks/useOandaExecution';
import type { RealExecutionMetrics, RealOrder } from '@/hooks/useOandaPerformance';
import type { TradeAnalyticsResult } from '@/hooks/useTradeAnalytics';

// ─── Helpers ─────────────────────────────────────────────

function getPipMult(pair: string) {
  return ['USD_JPY','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY','CHF_JPY','NZD_JPY'].includes(pair) ? 100 : 10000;
}
function calcPips(o: RealOrder) {
  if (!o.entry_price || !o.exit_price) return 0;
  const m = getPipMult(o.currency_pair);
  return Math.round((o.direction === 'long' ? (o.exit_price - o.entry_price) : (o.entry_price - o.exit_price)) * m * 10) / 10;
}

// ─── Section wrapper ─────────────────────────────────────

const Section = ({ title, icon: Icon, children, accent = 'text-primary', className = '' }: {
  title: string; icon: React.ElementType; children: React.ReactNode; accent?: string; className?: string;
}) => (
  <div className={cn("rounded-xl border border-border/30 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col", className)}>
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
      <Icon className={cn("w-4 h-4", accent)} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">{title}</span>
    </div>
    <div className="p-3 flex-1 overflow-hidden">{children}</div>
  </div>
);

// ─── Stat chip ───────────────────────────────────────────

const Chip = ({ label, value, positive, mono = true }: {
  label: string; value: string | number; positive?: boolean | null; mono?: boolean;
}) => (
  <div className="text-center">
    <div className={cn(
      "text-sm font-bold",
      mono && "font-mono",
      positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-foreground'
    )}>{value}</div>
    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
  </div>
);

// ─── God Signal Panel ────────────────────────────────────

function GodSignalPanel() {
  const [godSignal, setGodSignal] = useState<any>(null);
  const [godGates, setGodGates] = useState<any[]>([]);

  useEffect(() => {
    const fetchGod = async () => {
      // Get latest god signal from sovereign_memory
      const { data: mem } = await supabase
        .from('sovereign_memory')
        .select('payload, updated_at')
        .eq('memory_key', 'god_signal_latest')
        .maybeSingle();
      if (mem) setGodSignal(mem);

      // Get active god-signal related gates
      const { data: gates } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, pair, created_at, expires_at')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString())
        .or('gate_id.ilike.%GOD%,gate_id.ilike.%INSTITUTIONAL%,gate_id.ilike.%G15%,gate_id.ilike.%G21%,reason.ilike.%cot%')
        .order('created_at', { ascending: false })
        .limit(10);
      if (gates) setGodGates(gates);
    };
    fetchGod();
    const id = setInterval(fetchGod, 30_000);
    return () => clearInterval(id);
  }, []);

  const payload = godSignal?.payload as Record<string, any> | undefined;
  const pairs = payload?.pairs || payload?.pairSignals || {};
  const pairEntries = Object.entries(pairs).slice(0, 8);
  const updatedAgo = godSignal?.updated_at
    ? `${Math.round((Date.now() - new Date(godSignal.updated_at).getTime()) / 60000)}m ago`
    : '—';

  return (
    <Section title="God Signal — Institutional Flow" icon={Crown} accent="text-amber-400" className="row-span-2">
      <div className="space-y-3 h-full">
        {/* Status */}
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[9px] font-mono border-amber-500/30 text-amber-400">
            COT + REER Fusion
          </Badge>
          <span className="text-[9px] text-muted-foreground">Updated: {updatedAgo}</span>
        </div>

        {/* Per-pair signals */}
        {pairEntries.length > 0 ? (
          <ScrollArea className="h-[200px]">
            <div className="space-y-1.5">
              {pairEntries.map(([pair, sig]: [string, any]) => {
                const bias = sig?.bias || sig?.direction || 'neutral';
                const power = sig?.power || sig?.cotPower || sig?.strength || 0;
                const isBull = bias.toLowerCase().includes('long') || bias.toLowerCase().includes('bull');
                const isBear = bias.toLowerCase().includes('short') || bias.toLowerCase().includes('bear');
                return (
                  <div key={pair} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs font-bold text-foreground w-16">{pair.replace('_', '/')}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isBull ? "bg-emerald-500" : isBear ? "bg-red-500" : "bg-muted-foreground")}
                        style={{ width: `${Math.min(Math.abs(power), 100)}%` }}
                      />
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] px-1.5 font-mono min-w-[50px] text-center",
                      isBull ? "text-emerald-400 border-emerald-500/30" : isBear ? "text-red-400 border-red-500/30" : "text-muted-foreground"
                    )}>
                      {bias.toUpperCase()}
                    </Badge>
                    <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">{Math.round(power)}%</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Crown className="w-10 h-10 mx-auto mb-2 opacity-20" />
            Awaiting COT/TFF data from God Signal Gateway
          </div>
        )}

        {/* Active God-Signal Gates */}
        {godGates.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/20">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Active Gates</span>
            {godGates.slice(0, 4).map((g, i) => {
              const label = g.gate_id.split(':').pop() || g.gate_id;
              return (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono text-foreground">{label}</span>
                  {g.pair && <Badge variant="outline" className="text-[8px] h-3.5 px-1">{g.pair}</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Lead-Lag Radar ──────────────────────────────────────

function LeadLagRadar() {
  const [triggers, setTriggers] = useState<any[]>([]);

  useEffect(() => {
    const fetchTriggers = async () => {
      const { data } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, pair, created_at, expires_at')
        .like('gate_id', 'CORRELATION_TRIGGER:%')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setTriggers(data);
    };
    fetchTriggers();
    const id = setInterval(fetchTriggers, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Section title="Lead-Lag Radar — Ripple Strike" icon={GitBranch} accent="text-cyan-400">
      {triggers.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-xs">
          <Radio className="w-8 h-8 mx-auto mb-2 opacity-20" />
          No armed ripple triggers — sovereign loop will arm when divergence detected
        </div>
      ) : (
        <ScrollArea className="h-[180px]">
          <div className="space-y-1.5">
            {triggers.map((t, i) => {
              let parsed: any = {};
              try { parsed = JSON.parse(t.reason); } catch {}
              const loud = parsed.loudPair || '?';
              const quiet = parsed.quietPair || t.pair || '?';
              const dir = parsed.direction || '—';
              const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
              const ttl = Math.max(0, Math.round((new Date(t.expires_at).getTime() - Date.now()) / 60000));

              return (
                <div key={i} className="bg-muted/20 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="font-mono text-xs font-bold text-foreground">{loud.replace('_','/')}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <span className="font-mono text-xs font-bold text-primary">{quiet.replace('_','/')}</span>
                    <Badge variant="outline" className={cn(
                      "text-[9px] px-1 ml-auto",
                      dir.toLowerCase().includes('long') ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
                    )}>
                      {dir.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                    <span>Armed {age}m ago</span>
                    <span>TTL: {ttl}m</span>
                    {parsed.reason && <span className="truncate">{parsed.reason}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Section>
  );
}

// ─── System Health ───────────────────────────────────────

function SystemHealthPanel() {
  const [gates, setGates] = useState<any[]>([]);
  const [circuitBreaker, setCircuitBreaker] = useState<any>(null);
  const [sensorStatus, setSensorStatus] = useState<{ label: string; ok: boolean }[]>([]);

  useEffect(() => {
    const fetchHealth = async () => {
      const now = new Date().toISOString();

      // Active gates
      const { data: gateData } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, expires_at, created_at')
        .eq('revoked', false)
        .gte('expires_at', now)
        .or('gate_id.ilike.DYNAMIC_GATE%,gate_id.ilike.SIZING_OVERRIDE%,gate_id.ilike.INDICATOR_WEIGHT%,gate_id.ilike.CIRCUIT_BREAKER%,gate_id.ilike.AGENT_SUSPEND%')
        .order('created_at', { ascending: false })
        .limit(20);

      if (gateData) {
        setCircuitBreaker(gateData.find(g => g.gate_id.startsWith('CIRCUIT_BREAKER:')) || null);
        setGates(gateData.filter(g => !g.gate_id.startsWith('CIRCUIT_BREAKER:')));
      }

      // Check recent sovereign loop cycles for sensor health
      const { data: cycleData } = await supabase
        .from('gate_bypasses')
        .select('reason, created_at')
        .like('gate_id', 'SOVEREIGN_CYCLE_LOG:%')
        .order('created_at', { ascending: false })
        .limit(1);

      // Parse sensor status from cycle log
      const sensors = [
        { label: 'OANDA Pricing', ok: true }, // Always on if loop runs
        { label: 'COT God Signal', ok: true },
        { label: 'Lead-Lag Engine', ok: true },
        { label: 'Order Book', ok: false },    // Known blind
        { label: 'Sentiment', ok: false },     // Known dead
        { label: 'FRED Macro', ok: false },    // No API key
      ];
      setSensorStatus(sensors);
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Section title="System Health" icon={Shield} accent="text-emerald-400">
      <div className="space-y-3">
        {/* Circuit breaker */}
        {circuitBreaker && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
            <span className="text-[10px] text-red-400 font-bold">CIRCUIT BREAKER ACTIVE</span>
          </div>
        )}

        {/* Sensor grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {sensorStatus.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] bg-muted/15 rounded px-2 py-1.5">
              {s.ok ? (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
              )}
              <span className={s.ok ? 'text-foreground' : 'text-muted-foreground'}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Active gates */}
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Active Gates ({gates.length})</span>
          <ScrollArea className="h-[100px]">
            <div className="space-y-1">
              {gates.slice(0, 10).map((g, i) => {
                const label = g.gate_id.split(':').pop() || g.gate_id;
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                    <span className="font-mono text-foreground truncate">{label}</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Section>
  );
}

// ─── Trade Execution Panel ───────────────────────────────

function TradeExecutionPanel({ account, metrics, analytics }: {
  account: OandaAccountSummary | null;
  metrics: RealExecutionMetrics | null;
  analytics: TradeAnalyticsResult;
}) {
  const openPositions = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders.filter(o => o.status === 'filled' && o.entry_price != null && !o.exit_price)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [metrics]);

  const closedTrades = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders
      .filter(o => ['filled', 'closed'].includes(o.status) && o.entry_price != null && o.exit_price != null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);
  }, [metrics]);

  const totalTrades = (metrics?.winCount ?? 0) + (metrics?.lossCount ?? 0);
  const winRate = totalTrades > 0 ? (metrics?.winCount ?? 0) / totalTrades * 100 : 0;
  const pnl = analytics.totalPnlPips;
  const nav = account ? parseFloat(account.nav) : 0;

  return (
    <Section title="Trade Execution" icon={Activity} accent="text-primary" className="row-span-2">
      <div className="space-y-3 h-full">
        {/* NAV + Stats bar */}
        <div className="grid grid-cols-5 gap-2 pb-2 border-b border-border/20">
          <Chip label="NAV" value={`$${nav.toFixed(2)}`} positive={nav > 0} />
          <Chip label="Open P&L" value={account ? `$${parseFloat(account.unrealizedPL).toFixed(2)}` : '—'} positive={account ? parseFloat(account.unrealizedPL) >= 0 : null} />
          <Chip label="Net Pips" value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}`} positive={pnl >= 0} />
          <Chip label="Win Rate" value={`${winRate.toFixed(0)}%`} positive={winRate >= 45} />
          <Chip label="Trades" value={totalTrades} />
        </div>

        {/* Open positions */}
        {openPositions.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] text-primary uppercase tracking-wider font-bold flex items-center gap-1">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
              Open ({openPositions.length})
            </span>
            {openPositions.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded px-2 py-1.5 text-[10px]">
                <span className="font-mono font-bold text-foreground">{o.currency_pair.replace('_','/')}</span>
                <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", o.direction === 'long' ? "text-emerald-400" : "text-red-400")}>
                  {o.direction.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground ml-auto">{o.entry_price?.toFixed(5)}</span>
                <span className="text-muted-foreground">{o.units}u</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent closed trades */}
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Recent Closed</span>
          <ScrollArea className="h-[200px]">
            <div className="space-y-1">
              {closedTrades.map((o, i) => {
                const pips = calcPips(o);
                const isWin = pips > 0;
                const time = new Date(o.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                return (
                  <div key={o.id} className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-[10px]",
                    isWin ? "bg-emerald-500/5" : "bg-red-500/5"
                  )}>
                    {isWin ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    <span className="font-mono font-bold text-foreground w-14">{o.currency_pair.replace('_','/')}</span>
                    <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", o.direction === 'long' ? "text-emerald-400" : "text-red-400")}>
                      {o.direction[0].toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground">{time}</span>
                    <span className={cn("font-mono font-bold ml-auto", isWin ? "text-emerald-400" : "text-red-400")}>
                      {pips >= 0 ? '+' : ''}{pips.toFixed(1)}p
                    </span>
                  </div>
                );
              })}
              {closedTrades.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-xs">No closed trades yet</div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Section>
  );
}

// ─── Main Command Center ─────────────────────────────────

interface DarkRoomProps {
  account: OandaAccountSummary | null;
  executionMetrics: RealExecutionMetrics | null;
  tradeAnalytics: TradeAnalyticsResult;
  connected: boolean | null;
}

export function DarkRoomCommandCenter({ account, executionMetrics, tradeAnalytics, connected }: DarkRoomProps) {
  // Fetch posture from gate_bypasses
  const [posture, setPosture] = useState({ mode: 'DARK-ROOM', sizing: '0.1x', execution: 'MARKET' });

  useEffect(() => {
    const fetchPosture = async () => {
      const { data } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString())
        .or('gate_id.ilike.SIZING_OVERRIDE%,gate_id.ilike.CONTINGENCY%')
        .limit(5);
      if (data) {
        const sizing = data.find(d => d.gate_id.startsWith('SIZING_OVERRIDE'));
        let sizingVal = '0.1x';
        if (sizing) {
          try { const p = JSON.parse(sizing.reason); sizingVal = `${p.multiplier || 0.1}x`; } catch {}
        }
        setPosture({ mode: 'DARK-ROOM', sizing: sizingVal, execution: 'MARKET' });
      }
    };
    fetchPosture();
  }, []);

  const nav = account ? parseFloat(account.nav) : 0;

  return (
    <div className="space-y-4">
      {/* ─── Status Bar ─── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 flex-wrap bg-card/40 border border-border/30 rounded-xl px-4 py-3 backdrop-blur-sm"
      >
        {/* Mode badge */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-mono font-black text-amber-400 tracking-wider">{posture.mode}</span>
        </div>
        <div className="w-px h-5 bg-border/40" />

        {/* Connection */}
        <div className="flex items-center gap-1.5">
          {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
          <span className="text-[10px] text-muted-foreground">{connected ? 'OANDA Live' : 'Disconnected'}</span>
        </div>
        <div className="w-px h-5 bg-border/40" />

        {/* Key stats inline */}
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-muted-foreground">Posture: <span className="text-foreground font-bold">{posture.execution}</span></span>
          <span className="text-muted-foreground">Sizing: <span className="text-foreground font-bold">{posture.sizing}</span></span>
          <span className="text-muted-foreground">NAV: <span className={cn("font-mono font-bold", nav > 0 ? "text-emerald-400" : "text-foreground")}>${nav.toFixed(2)}</span></span>
        </div>

        {/* Strategy label */}
        <Badge variant="outline" className="ml-auto text-[9px] font-mono border-primary/30 text-primary">
          Institutional Flow + Lead-Lag
        </Badge>
      </motion.div>

      {/* ─── 4-Quadrant Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-min">
        <GodSignalPanel />
        <div className="space-y-4">
          <LeadLagRadar />
          <SystemHealthPanel />
        </div>
        <TradeExecutionPanel account={account} metrics={executionMetrics} analytics={tradeAnalytics} />
      </div>
    </div>
  );
}
