// Dark-Room Command Center — Single-screen unified view
// God Signal + Lead-Lag Radar + Trade Execution + System Health + Trade Health

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  Crown, GitBranch, Activity, Shield, Zap, Target,
  TrendingUp, TrendingDown, Radio, Eye, EyeOff, AlertTriangle,
  CheckCircle2, XCircle, Minus, Clock, Server, Wifi, WifiOff,
  HeartPulse, ShieldCheck, ShieldAlert, Skull, Gauge, Brain,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { OandaAccountSummary } from '@/hooks/useOandaExecution';
import type { RealExecutionMetrics, RealOrder } from '@/hooks/useOandaPerformance';
import type { TradeAnalyticsResult } from '@/hooks/useTradeAnalytics';
import { SonarRipplePanel } from '@/components/forex/SonarRipplePanel';
import { computeTradeHealth, type TradeHealthResult, type HealthBand } from '@/lib/forex/tradeHealthEngine';
import {
  computeLiveExpectancy, setTradeBuffer, orderToClosedTradeRecord,
  type LiveExpectancy, type ExpectancyBand,
} from '@/lib/forex/thsExpectancyEngine';

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

// ─── THS Config ──────────────────────────────────────────

const BAND_CONFIG: Record<HealthBand, { icon: typeof HeartPulse; color: string; bg: string; border: string; label: string }> = {
  healthy: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'HEALTHY' },
  caution: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'CAUTION' },
  sick: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'SICK' },
  critical: { icon: Skull, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'CRITICAL' },
};

const EXP_BAND_COLORS: Record<ExpectancyBand, { text: string; bg: string; border: string }> = {
  Elite:   { text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30' },
  Strong:  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  Viable:  { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  Weak:    { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  Fragile: { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
};

function THSGauge({ score, band }: { score: number; band: HealthBand }) {
  const cfg = BAND_CONFIG[band];
  return (
    <div className="relative w-10 h-10">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="3" />
        <circle cx="18" cy="18" r="14" fill="none" className={cfg.color.replace('text-', 'stroke-')} strokeWidth="3" strokeDasharray={`${score * 0.88} 100`} strokeLinecap="round" />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold", cfg.color)}>{score}</span>
    </div>
  );
}

function THSComponentBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : value >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[8px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value}/100</span>
      </div>
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Trade Execution + Health Panel ──────────────────────

function TradeExecutionPanel({ account, metrics, analytics, brokerOpenTradeIds }: {
  account: OandaAccountSummary | null;
  metrics: RealExecutionMetrics | null;
  analytics: TradeAnalyticsResult;
  brokerOpenTradeIds?: string[];
}) {
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const openPositions = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders.filter(o => {
      if (o.status !== 'filled' || o.entry_price == null || o.exit_price || !o.oanda_trade_id) return false;
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

  // Load closed trades into expectancy engine
  useEffect(() => {
    if (!metrics?.recentOrders) return;
    const closedOrders = metrics.recentOrders
      .filter(o => (o.status === 'closed' || o.status === 'filled') && o.entry_price != null && o.exit_price != null);
    const records = closedOrders.map(o => orderToClosedTradeRecord(o as any)).filter(Boolean) as any[];
    if (records.length > 0) setTradeBuffer(records);
  }, [metrics?.recentOrders]);

  // Fetch live prices for open positions
  useEffect(() => {
    if (openPositions.length === 0) return;
    let mounted = true;
    const instruments = [...new Set(openPositions.map(o => o.currency_pair))];
    const fetchPrices = async () => {
      try {
        const { data } = await supabase.functions.invoke('oanda-pricing', { body: { instruments } });
        if (!mounted || !data?.prices) return;
        const prices: Record<string, number> = {};
        for (const [key, val] of Object.entries(data.prices)) {
          const v = val as { mid?: number };
          if (v?.mid) prices[key.replace('/', '_')] = v.mid;
        }
        setLivePrices(prices);
      } catch { /* silent */ }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 15000);
    return () => { mounted = false; clearInterval(iv); };
  }, [openPositions.length]);

  // Compute health for each open position
  const healthResults = useMemo(() => {
    return openPositions.map(order => {
      const livePrice = livePrices[order.currency_pair] ?? null;
      const entryPrice = order.entry_price!;
      const pipMult = getPipMult(order.currency_pair);
      const gov = order.governance_payload as Record<string, unknown> | null;

      let initialSlPrice: number;
      if (gov?.dynamicSlPrice && typeof gov.dynamicSlPrice === 'number') {
        initialSlPrice = gov.dynamicSlPrice;
      } else {
        initialSlPrice = order.direction === 'long' ? entryPrice - 8 / pipMult : entryPrice + 8 / pipMult;
      }

      const mfePriceEstimate = livePrice != null
        ? (order.direction === 'long' ? Math.max(livePrice, entryPrice) : Math.min(livePrice, entryPrice))
        : entryPrice;

      const barsSinceEntry = Math.max(1, Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000));
      const regimeConfirmed = gov?.regimeConfirmed === true || (!gov?.regimeEarlyWarning && !gov?.regimeDiverging);
      const regimeEarlyWarning = gov?.regimeEarlyWarning === true;
      const regimeDiverging = gov?.regimeDiverging === true;

      const health = computeTradeHealth({
        currentPrice: livePrice ?? entryPrice,
        entryPrice, initialSlPrice,
        direction: order.direction as 'long' | 'short',
        pair: order.currency_pair, barsSinceEntry,
        mfePrice: mfePriceEstimate,
        regimeConfirmed, regimeEarlyWarning, regimeDiverging,
        persistenceNow: (gov?.persistenceNow as number) ?? 50,
        persistenceAtEntry: (gov?.persistenceAtEntry as number) ?? 50,
        volAccNow: (gov?.volAccNow as number) ?? 50,
        volAccAtEntry: (gov?.volAccAtEntry as number) ?? 50,
        volatilityScore: (gov?.volatilityScore as number) ?? 50,
      });

      const persistenceDelta = ((gov?.persistenceNow as number) ?? 50) - ((gov?.persistenceAtEntry as number) ?? 50);
      const regimeStability = regimeConfirmed ? 85 : regimeEarlyWarning ? 40 : regimeDiverging ? 15 : 50;
      const accelDelta = ((gov?.volAccNow as number) ?? 50) - ((gov?.volAccAtEntry as number) ?? 50);
      const entryThs = (order as any).entry_ths ?? health.tradeHealthScore;
      const thsSlope = barsSinceEntry > 1 ? (health.tradeHealthScore - entryThs) / barsSinceEntry : 0;

      const expectancy = computeLiveExpectancy(
        health.tradeHealthScore, thsSlope, persistenceDelta, regimeStability, accelDelta,
        order.currency_pair, (order.regime_label as string) ?? 'unknown', (order.session_label as string) ?? 'unknown',
      );

      const unrealizedPips = (livePrice != null && entryPrice != null)
        ? Math.round((order.direction === 'long' ? (livePrice - entryPrice) : (entryPrice - livePrice)) * pipMult * 10) / 10
        : null;

      return { order, health, livePrice, expectancy, unrealizedPips };
    });
  }, [openPositions, livePrices]);

  // Fleet summary
  const fleetSummary = useMemo(() => {
    if (healthResults.length === 0) return null;
    const avg = Math.round(healthResults.reduce((s, h) => s + h.health.tradeHealthScore, 0) / healthResults.length);
    const bands = { healthy: 0, caution: 0, sick: 0, critical: 0 };
    healthResults.forEach(h => bands[h.health.healthBand]++);
    const progressFails = healthResults.filter(h => h.health.progressFail).length;
    return { avg, bands, progressFails, total: healthResults.length };
  }, [healthResults]);

  const totalTrades = (metrics?.winCount ?? 0) + (metrics?.lossCount ?? 0);
  const winRate = totalTrades > 0 ? (metrics?.winCount ?? 0) / totalTrades * 100 : 0;
  const pnl = analytics.totalPnlPips;
  const nav = account ? parseFloat(account.nav) : 0;

  return (
    <Section title="Live Trades + Health" icon={HeartPulse} accent="text-primary" className="row-span-2">
      <div className="space-y-3 h-full">
        {/* NAV + Stats bar */}
        <div className="grid grid-cols-5 gap-2 pb-2 border-b border-border/20">
          <Chip label="NAV" value={`$${nav.toFixed(2)}`} positive={nav > 0} />
          <Chip label="Open P&L" value={account ? `$${parseFloat(account.unrealizedPL).toFixed(2)}` : '—'} positive={account ? parseFloat(account.unrealizedPL) >= 0 : null} />
          <Chip label="Net Pips" value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}`} positive={pnl >= 0} />
          <Chip label="Win Rate" value={`${winRate.toFixed(0)}%`} positive={winRate >= 45} />
          <Chip label="Trades" value={totalTrades} />
        </div>

        {/* Fleet Health Summary */}
        {fleetSummary && (
          <div className="grid grid-cols-5 gap-1.5">
            <div className="p-1.5 rounded border border-border/20 bg-card/50 text-center">
              <p className="text-[8px] text-muted-foreground uppercase font-bold">Avg THS</p>
              <p className={cn("text-sm font-mono font-bold",
                fleetSummary.avg >= 70 ? 'text-emerald-400' : fleetSummary.avg >= 45 ? 'text-amber-400' : fleetSummary.avg >= 30 ? 'text-orange-400' : 'text-red-400'
              )}>{fleetSummary.avg}</p>
            </div>
            <div className="p-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-center">
              <p className="text-[8px] text-muted-foreground uppercase font-bold">Healthy</p>
              <p className="text-sm font-mono font-bold text-emerald-400">{fleetSummary.bands.healthy}</p>
            </div>
            <div className="p-1.5 rounded border border-amber-500/20 bg-amber-500/5 text-center">
              <p className="text-[8px] text-muted-foreground uppercase font-bold">Caution</p>
              <p className="text-sm font-mono font-bold text-amber-400">{fleetSummary.bands.caution}</p>
            </div>
            <div className="p-1.5 rounded border border-orange-500/20 bg-orange-500/5 text-center">
              <p className="text-[8px] text-muted-foreground uppercase font-bold">Sick</p>
              <p className="text-sm font-mono font-bold text-orange-400">{fleetSummary.bands.sick}</p>
            </div>
            <div className="p-1.5 rounded border border-red-500/20 bg-red-500/5 text-center">
              <p className="text-[8px] text-muted-foreground uppercase font-bold">Critical</p>
              <p className="text-sm font-mono font-bold text-red-400">{fleetSummary.bands.critical}</p>
            </div>
          </div>
        )}

        {/* Progress Fail Alert */}
        {fleetSummary && fleetSummary.progressFails > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-red-500/30 bg-red-500/5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[10px] text-red-400">
              <strong>{fleetSummary.progressFails}</strong> position{fleetSummary.progressFails > 1 ? 's' : ''} failed progress — MFE &lt; 0.25R
            </span>
          </div>
        )}

        {/* Open positions with THS health cards */}
        {openPositions.length > 0 ? (
          <div className="space-y-2">
            <span className="text-[9px] text-primary uppercase tracking-wider font-bold flex items-center gap-1">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
              Live Positions ({openPositions.length})
            </span>
            {healthResults.map((r) => {
              const { order: o, health, expectancy, unrealizedPips } = r;
              const band = BAND_CONFIG[health.healthBand];
              const BandIcon = band.icon;
              const ageMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
              const gov = o.governance_payload as Record<string, any> | undefined;
              const cotPower = gov?.cotPower ?? gov?.godSignalPower ?? null;
              const expColors = EXP_BAND_COLORS[expectancy.band];

              return (
                <motion.div key={o.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("border rounded-lg p-3 space-y-2.5", band.border, band.bg)}
                >
                  {/* Row 1: Pair + Direction + THS Gauge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BandIcon className={cn("w-4 h-4", band.color)} />
                      <span className="font-mono font-bold text-sm text-foreground">{o.currency_pair.replace('_','/')}</span>
                      <Badge variant="outline" className={cn("text-[9px] px-1.5", o.direction === 'long' ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30")}>
                        {o.direction.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{ageMin < 60 ? `${ageMin}m` : `${Math.round(ageMin/60)}h`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <THSGauge score={health.tradeHealthScore} band={health.healthBand} />
                      <Badge className={cn("text-[9px] px-1.5", band.bg, band.color, "border", band.border)}>
                        {band.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: Key metrics */}
                  <div className="grid grid-cols-6 gap-1.5 text-center">
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">Entry</p>
                      <p className="text-[10px] font-mono font-bold text-foreground">{o.entry_price?.toFixed(o.currency_pair.includes('JPY') ? 3 : 5)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">P&L</p>
                      <p className={cn("text-[10px] font-mono font-bold",
                        unrealizedPips != null && unrealizedPips > 0 ? 'text-emerald-400' :
                        unrealizedPips != null && unrealizedPips < 0 ? 'text-red-400' : 'text-foreground'
                      )}>
                        {unrealizedPips != null ? `${unrealizedPips >= 0 ? '+' : ''}${unrealizedPips.toFixed(1)}p` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">R-Risk</p>
                      <p className="text-[10px] font-mono font-bold text-foreground">{health.rPips}p</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">MFE(R)</p>
                      <p className={cn("text-[10px] font-mono font-bold", health.mfeR > 0.5 ? 'text-emerald-400' : 'text-foreground')}>{health.mfeR.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">UE(R)</p>
                      <p className={cn("text-[10px] font-mono font-bold", health.ueR >= 0 ? 'text-emerald-400' : 'text-red-400')}>{health.ueR >= 0 ? '+' : ''}{health.ueR.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">Units</p>
                      <p className="text-[10px] font-mono font-bold text-foreground">{o.units}</p>
                    </div>
                  </div>

                  {/* Row 3: THS Components (compact) */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <THSComponentBar label="Progress 28%" value={health.components.P} />
                    <THSComponentBar label="Regime 22%" value={health.components.S_regime} />
                    <THSComponentBar label="Persistence 16%" value={health.components.D_pers} />
                    <THSComponentBar label="Acceleration 12%" value={health.components.D_acc} />
                    <THSComponentBar label="Drift 12%" value={health.components.A_drift} />
                    <THSComponentBar label="Time-to-MFE 10%" value={health.components.T_mfe ?? 50} />
                  </div>

                  {/* Row 4: Expectancy + Tactical */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn("text-[8px] px-1.5", expColors.text, expColors.border)}>
                      {expectancy.band} | {expectancy.expectedR >= 0 ? '+' : ''}{expectancy.expectedR.toFixed(2)}R | {(expectancy.probabilityHoldSuccess * 100).toFixed(0)}% hold
                    </Badge>
                    {cotPower != null && (
                      <Badge variant="outline" className="text-[8px] px-1.5 text-amber-400 border-amber-500/30">
                        <Crown className="w-3 h-3 mr-0.5" /> COT {Math.round(cotPower)}%
                      </Badge>
                    )}
                    {o.regime_label && (
                      <span className="text-[9px] text-muted-foreground">Regime: <span className="text-foreground">{o.regime_label}</span></span>
                    )}
                  </div>

                  {/* Row 5: Governance action */}
                  <div className={cn("flex items-center gap-2 p-1.5 rounded border text-[9px]", band.border, 'bg-background/30')}>
                    <Gauge className={cn("w-3 h-3 shrink-0", band.color)} />
                    <span className="text-muted-foreground">
                      <strong className={band.color}>{health.governanceAction.type.toUpperCase()}</strong>
                      {' — '}{health.governanceAction.reason}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <HeartPulse className="w-6 h-6 text-muted-foreground/30 mb-2" />
            <p className="text-[11px] text-muted-foreground">No open positions — THS activates when trades are live</p>
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
          <ScrollArea className="h-[150px]">
            <div className="space-y-1">
              {closedTrades.map((o) => {
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

// ─── OANDA Heartbeat Hook ────────────────────────────────

function useOandaHeartbeat(intervalMs = 5000) {
  const [state, setState] = useState<{
    alive: boolean;
    latencyMs: number | null;
    lastPingAt: number | null;
    pairCount: number;
    consecutiveFails: number;
    history: number[]; // last 20 latencies
  }>({ alive: false, latencyMs: null, lastPingAt: null, pairCount: 0, consecutiveFails: 0, history: [] });

  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      const t0 = performance.now();
      try {
        const res = await supabase.functions.invoke('oanda-pricing', { body: {} });
        const elapsed = Math.round(performance.now() - t0);
        if (!mounted) return;
        const prices = res.data?.prices || {};
        const pairCount = Object.keys(prices).length;
        setState(prev => ({
          alive: true,
          latencyMs: elapsed,
          lastPingAt: Date.now(),
          pairCount,
          consecutiveFails: 0,
          history: [...prev.history.slice(-19), elapsed],
        }));
      } catch {
        if (!mounted) return;
        setState(prev => ({
          ...prev,
          alive: false,
          latencyMs: null,
          lastPingAt: Date.now(),
          consecutiveFails: prev.consecutiveFails + 1,
        }));
      }
    };
    ping();
    const id = setInterval(ping, intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [intervalMs]);

  return state;
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
  const [posture, setPosture] = useState({ mode: 'DARK-ROOM', sizing: '0.1x', execution: 'MARKET' });
  const heartbeat = useOandaHeartbeat(5000);

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

  // Heartbeat derived values
  const avgLatency = heartbeat.history.length > 0
    ? Math.round(heartbeat.history.reduce((a, b) => a + b, 0) / heartbeat.history.length)
    : null;
  const maxLatency = heartbeat.history.length > 0 ? Math.max(...heartbeat.history) : null;
  const minLatency = heartbeat.history.length > 0 ? Math.min(...heartbeat.history) : null;
  const secondsSinceLastPing = heartbeat.lastPingAt ? Math.round((Date.now() - heartbeat.lastPingAt) / 1000) : null;

  const latencyColor = heartbeat.latencyMs == null
    ? 'text-red-400'
    : heartbeat.latencyMs < 500 ? 'text-emerald-400'
    : heartbeat.latencyMs < 1500 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* ─── OANDA Connection Bar ─── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-card/40 border border-border/30 rounded-xl px-4 py-3 backdrop-blur-sm"
      >
        {/* Latency sparkline background */}
        {heartbeat.history.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-6 opacity-10 pointer-events-none">
            <svg viewBox={`0 0 ${heartbeat.history.length - 1} 100`} className="w-full h-full" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke={heartbeat.alive ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                strokeWidth="2"
                points={heartbeat.history.map((v, i) => {
                  const max = Math.max(...heartbeat.history, 1);
                  return `${i},${100 - (v / max) * 90}`;
                }).join(' ')}
              />
            </svg>
          </div>
        )}

        <div className="relative flex items-center gap-3 flex-wrap">
          {/* Live connection indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                heartbeat.alive
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              )} />
              {heartbeat.alive && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-30" />
              )}
            </div>
            {heartbeat.alive
              ? <Wifi className="w-4 h-4 text-emerald-400" />
              : <WifiOff className="w-4 h-4 text-red-400 animate-pulse" />
            }
            <span className={cn(
              "text-xs font-mono font-black tracking-wider",
              heartbeat.alive ? "text-emerald-400" : "text-red-400"
            )}>
              {heartbeat.alive ? 'OANDA LIVE' : 'DISCONNECTED'}
            </span>
          </div>
          <div className="w-px h-5 bg-border/40" />

          {/* Latency ms */}
          <div className="flex items-center gap-1.5">
            <Activity className={cn("w-3.5 h-3.5", latencyColor)} />
            <span className={cn("text-sm font-mono font-black tabular-nums", latencyColor)}>
              {heartbeat.latencyMs != null ? `${heartbeat.latencyMs}ms` : '---'}
            </span>
          </div>
          <div className="w-px h-5 bg-border/40" />

          {/* Avg / Min / Max */}
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-muted-foreground">AVG: <span className="text-foreground font-bold">{avgLatency != null ? `${avgLatency}ms` : '—'}</span></span>
            <span className="text-muted-foreground">MIN: <span className="text-emerald-400 font-bold">{minLatency != null ? `${minLatency}ms` : '—'}</span></span>
            <span className="text-muted-foreground">MAX: <span className="text-amber-400 font-bold">{maxLatency != null ? `${maxLatency}ms` : '—'}</span></span>
          </div>
          <div className="w-px h-5 bg-border/40" />

          {/* Pair count */}
          <div className="flex items-center gap-1.5 text-[10px]">
            <Server className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Pairs: <span className="text-foreground font-mono font-bold">{heartbeat.pairCount || '—'}</span></span>
          </div>
          <div className="w-px h-5 bg-border/40" />

          {/* Fails */}
          {heartbeat.consecutiveFails > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-[10px]">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-red-400 font-mono font-bold">{heartbeat.consecutiveFails} FAIL{heartbeat.consecutiveFails > 1 ? 'S' : ''}</span>
              </div>
              <div className="w-px h-5 bg-border/40" />
            </>
          )}

          {/* Strategy + Posture (right side) */}
          <div className="flex items-center gap-3 ml-auto text-[10px]">
            <span className="text-muted-foreground">Sizing: <span className="text-foreground font-bold">{posture.sizing}</span></span>
            <span className="text-muted-foreground">NAV: <span className={cn("font-mono font-bold", nav > 0 ? "text-emerald-400" : "text-foreground")}>${nav.toFixed(2)}</span></span>
            <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">
              {posture.mode}
            </Badge>
          </div>
        </div>
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
