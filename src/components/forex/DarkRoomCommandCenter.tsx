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
import { SonarRipplePanel } from '@/components/forex/SonarRipplePanel';

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
  const [cotReport, setCotReport] = useState<any>(null);
  const [nlpSignal, setNlpSignal] = useState<any>(null);
  const [bigFiveGate, setBigFiveGate] = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      const [cotRes, nlpRes, gateRes] = await Promise.all([
        supabase.from('sovereign_memory').select('payload, updated_at').eq('memory_key', 'weekly_cot_report').maybeSingle(),
        supabase.from('sovereign_memory').select('payload, updated_at').eq('memory_key', 'god_signal_latest').maybeSingle(),
        supabase.from('gate_bypasses').select('gate_id, reason, created_at')
          .eq('revoked', false).gte('expires_at', new Date().toISOString())
          .like('gate_id', 'GOD_SIGNAL:big5_scan%')
          .order('created_at', { ascending: false }).limit(1),
      ]);
      if (cotRes.data) setCotReport(cotRes.data);
      if (nlpRes.data) setNlpSignal(nlpRes.data);
      if (gateRes.data?.[0]) setBigFiveGate(gateRes.data[0]);
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

  const cotPayload = cotReport?.payload as Record<string, any> | undefined;
  const nlpPayload = nlpSignal?.payload as Record<string, any> | undefined;
  const pairSignals = cotPayload?.pairSignals || {};
  const byCurrency = cotPayload?.byCurrency || {};
  const tradeIdeas = nlpPayload?.nlpAnalysis?.tradeIdeas || [];
  const usdBias = nlpPayload?.nlpAnalysis?.usdBias || '—';
  const usdConf = nlpPayload?.nlpAnalysis?.usdConfidence || 0;
  const masterDirective = cotPayload?.masterDirective || '';
  const cotUpdated = cotReport?.updated_at
    ? `${Math.round((Date.now() - new Date(cotReport.updated_at).getTime()) / 3600000)}h ago`
    : '—';
  const nlpUpdated = nlpSignal?.updated_at
    ? `${Math.round((Date.now() - new Date(nlpSignal.updated_at).getTime()) / 60000)}m ago`
    : '—';

  // Sort pair signals by strength descending
  const topPairs = Object.entries(pairSignals)
    .map(([pair, sig]: [string, any]) => ({ pair, ...sig }))
    .sort((a: any, b: any) => (b.strength || 0) - (a.strength || 0))
    .slice(0, 10);

  return (
    <Section title="God Signal — Institutional Flow" icon={Crown} accent="text-amber-400" className="row-span-2">
      <div className="space-y-3 h-full">
        {/* USD Bias + Big5 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[9px] font-mono px-2",
              usdBias === 'bearish' ? "text-red-400 border-red-500/30" : usdBias === 'bullish' ? "text-emerald-400 border-emerald-500/30" : "border-border/50"
            )}>
              USD {usdBias.toUpperCase()} {usdConf}%
            </Badge>
            {bigFiveGate && (
              <Badge variant="outline" className="text-[8px] font-mono border-amber-500/30 text-amber-400">
                Big 5 Scanned
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>COT: {cotUpdated}</span>
            <span>NLP: {nlpUpdated}</span>
          </div>
        </div>

        {/* Master Directive */}
        {masterDirective && (
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 italic">
            {masterDirective}
          </div>
        )}

        {/* NLP Trade Ideas from Big 5 Desks */}
        {tradeIdeas.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] text-amber-400 uppercase tracking-wider font-bold">Desk Trade Ideas</span>
            {tradeIdeas.map((idea: any, i: number) => (
              <div key={i} className="bg-muted/20 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground">{(idea.pair || '').replace('/', '_').replace('_', '/')}</span>
                  <Badge variant="outline" className={cn(
                    "text-[8px] h-3.5 px-1",
                    idea.direction === 'long' ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
                  )}>
                    {(idea.direction || '').toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className={cn(
                    "text-[8px] h-3.5 px-1",
                    idea.conviction === 'high' ? "text-amber-400 border-amber-500/30" : "border-border/50 text-muted-foreground"
                  )}>
                    {(idea.conviction || '').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{idea.rationale}</p>
              </div>
            ))}
          </div>
        )}

        {/* COT Pair Signals */}
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">COT Pair Positioning</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {topPairs.length > 0 ? topPairs.map((p: any) => {
              const sig = p.signal || 'NEUTRAL';
              const strength = p.strength || 0;
              const isLong = sig.includes('LONG');
              const isShort = sig.includes('SHORT');
              return (
                <div key={p.pair} className="flex items-center gap-1.5 bg-muted/20 rounded px-2 py-1">
                  <span className="font-mono text-[10px] font-bold text-foreground w-14">{p.pair.replace('_', '/')}</span>
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isLong ? "bg-emerald-500" : isShort ? "bg-red-500" : "bg-muted-foreground/40")}
                      style={{ width: `${Math.min(strength, 100)}%` }}
                    />
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-[7px] px-1 font-mono min-w-[50px] text-center h-3.5",
                    isLong ? "text-emerald-400 border-emerald-500/30" : isShort ? "text-red-400 border-red-500/30" : "text-muted-foreground border-border/30"
                  )}>
                    {sig}
                  </Badge>
                  <span className="text-[8px] font-mono text-muted-foreground w-5 text-right">{strength}</span>
                </div>
              );
            }) : (
              <div className="col-span-2 text-center py-6 text-muted-foreground text-xs">
                <Crown className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Awaiting COT data
              </div>
            )}
          </div>
        </div>
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

function TradeExecutionPanel({ account, metrics, analytics, brokerOpenTradeIds }: {
  account: OandaAccountSummary | null;
  metrics: RealExecutionMetrics | null;
  analytics: TradeAnalyticsResult;
  brokerOpenTradeIds?: string[];
}) {
  const openPositions = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders.filter(o => {
      if (o.status !== 'filled' || o.entry_price == null || o.exit_price || !o.oanda_trade_id) return false;
      // If we have broker open trade IDs, only show trades confirmed open on broker
      if (brokerOpenTradeIds && brokerOpenTradeIds.length > 0) {
        return brokerOpenTradeIds.includes(o.oanda_trade_id);
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [metrics, brokerOpenTradeIds]);

  const closedTrades = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders
      .filter(o => ['filled', 'closed'].includes(o.status) && o.entry_price != null && o.exit_price != null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);
  }, [metrics]);

  const rejectedTrades = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders
      .filter(o => o.status === 'rejected' && o.error_message)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
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
            {openPositions.map((o) => {
              const gov = o.governance_payload as Record<string, any> | undefined;
              const cotPower = gov?.cotPower ?? gov?.godSignalPower ?? null;
              const engine = o.direction_engine || 'auto-governance';
              const overrideTag = o.sovereign_override_tag;
              const confidence = o.confidence_score ? Math.round(o.confidence_score * 100) : null;
              const ageMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);

              return (
                <div key={o.id} className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 space-y-1.5">
                  {/* Row 1: Pair + Direction + Entry */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono font-bold text-foreground text-xs">{o.currency_pair.replace('_','/')}</span>
                    <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", o.direction === 'long' ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30")}>
                      {o.direction.toUpperCase()}
                    </Badge>
                    {overrideTag && (
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-amber-400 border-amber-500/30">
                        {overrideTag}
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto font-mono">{o.entry_price?.toFixed(5)}</span>
                    <span className="text-muted-foreground font-mono">{o.units}u</span>
                  </div>
                  {/* Row 2: Tactical Posture */}
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
                    {cotPower != null && (
                      <span className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span className="text-foreground font-bold">{Math.round(cotPower)}%</span> COT
                      </span>
                    )}
                    {confidence != null && (
                      <span>Conv: <span className={cn("font-bold", confidence >= 60 ? "text-emerald-400" : "text-foreground")}>{confidence}%</span></span>
                    )}
                    <span>Engine: <span className="text-foreground">{engine.replace('auto-','').replace('-',' ')}</span></span>
                    <span>Age: <span className="text-foreground">{ageMin < 60 ? `${ageMin}m` : `${Math.round(ageMin/60)}h`}</span></span>
                    {o.regime_label && <span>Regime: <span className="text-foreground">{o.regime_label}</span></span>}
                    {o.session_label && <span>Session: <span className="text-foreground">{o.session_label}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rejected / Blocked trades */}
        {rejectedTrades.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] text-red-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Blocked ({rejectedTrades.length})
            </span>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {rejectedTrades.map((o) => {
                  const time = new Date(o.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const reason = o.error_message?.replace('EDGE LOCK: ', '').replace('GATE BLOCK: ', '') || 'Unknown';
                  return (
                    <div key={o.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-[10px] bg-red-500/5 border border-red-500/10">
                      <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                      <span className="font-mono font-bold text-foreground w-14">{o.currency_pair.replace('_','/')}</span>
                      <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", o.direction === 'long' ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30")}>
                        {o.direction[0].toUpperCase()}
                      </Badge>
                      <span className="text-muted-foreground">{time}</span>
                      <span className="text-[9px] text-red-400/80 ml-auto truncate max-w-[180px]" title={reason}>{reason}</span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
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
  brokerOpenTradeIds?: string[];
}

export function DarkRoomCommandCenter({ account, executionMetrics, tradeAnalytics, connected, brokerOpenTradeIds }: DarkRoomProps) {
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

  const sonarOpenPositions = useMemo(() => {
    if (!executionMetrics?.recentOrders) return [];
    return executionMetrics.recentOrders.filter(o => {
      if (o.status !== 'filled' || o.entry_price == null || o.exit_price || !o.oanda_trade_id) return false;
      if (brokerOpenTradeIds && brokerOpenTradeIds.length > 0) {
        return brokerOpenTradeIds.includes(o.oanda_trade_id);
      }
      return true;
    });
  }, [executionMetrics, brokerOpenTradeIds]);

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
          {connected === true ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
          <span className="text-[10px] text-muted-foreground">{connected === true ? 'OANDA Live' : 'Connecting…'}</span>
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

      {/* ─── Sonar Ripple Dashboard ─── */}
      <SonarRipplePanel openPositions={sonarOpenPositions} />

      {/* ─── 4-Quadrant Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-min">
        <GodSignalPanel />
        <div className="space-y-4">
          <LeadLagRadar />
          <SystemHealthPanel />
        </div>
        <TradeExecutionPanel account={account} metrics={executionMetrics} analytics={tradeAnalytics} brokerOpenTradeIds={brokerOpenTradeIds} />
      </div>
    </div>
  );
}
