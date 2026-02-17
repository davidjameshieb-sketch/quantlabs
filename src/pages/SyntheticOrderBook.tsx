import { motion } from 'framer-motion';
import {
  BookOpen, Activity, Zap, Eye, Shield, TrendingUp, Waves,
  AlertTriangle, RefreshCw, Crosshair, Radio, Siren,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { Badge } from '@/components/ui/badge';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';
import { cn } from '@/lib/utils';

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveTacticalState(p: PairPhysics): 'FATIGUE' | 'ACTIVE' | 'CLIMAX' | 'STRIKE_READY' | 'SCANNING' {
  const H = p.hurst?.H ?? 0;
  const eff = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;

  // FATIGUE: Hurst collapsed — momentum dying
  if (H < 0.45) return 'FATIGUE';

  // CLIMAX: institutional sweep in progress
  if (eff >= 7 && vpin >= 0.65) return 'CLIMAX';

  // ACTIVE: all gates open
  if (H >= 0.62 && eff >= 2 && vpin >= 0.4 && Math.abs(p.zOfi) >= 1) return 'ACTIVE';

  // STRIKE READY: nearly aligned
  if (H >= 0.55 && eff >= 1.5) return 'STRIKE_READY';

  return 'SCANNING';
}

function getPulseSpeed(ueR: number): string {
  if (ueR > 1.0) return '0.5s';
  if (ueR < -0.5) return '3.0s';
  return '1.5s';
}

function buildCommandFeed(pair: string, p: PairPhysics): string {
  const H = p.hurst?.H?.toFixed(3) ?? '—';
  const regime = p.hurst?.regime?.replace('_', ' ') ?? '—';
  const eff = p.efficiency?.toFixed(1) ?? '—';
  const state = p.marketState;
  const bias = p.bias;
  const wall = p.syntheticDepth?.find(l => !l.broken);
  const wallStr = wall ? ` behind ${wall.price.toFixed(5)} wall` : '';
  const zOfi = Math.abs(p.zOfi).toFixed(2);

  if (p.hiddenPlayer) {
    const hp = p.hiddenPlayer;
    if (hp.type === 'LIQUIDITY_HOLE') {
      return `${pair}: VACUUM DETECTED. Thin liquidity${wallStr}. Efficiency=${eff}× — Tsunami slap risk if velocity holds.`;
    }
    const side = hp.type === 'HIDDEN_LIMIT_SELLER' ? 'SELL' : 'BUY';
    return `${pair}: 🐋 WHALE DETECTED. Drafting 0.3 pips${wallStr}. Hurst=${H} (${regime}). ${side} wall absorption active — ${hp.recommendation || 'holding fire'}.`;
  }

  if (state === 'ABSORBING') {
    return `${pair}: ICEBERG IN PLAY. High force (Z=${zOfi}σ) vs low velocity — institutional absorption${wallStr}. Hurst=${H}.`;
  }
  if (state === 'SLIPPING') {
    return `${pair}: SLIPPAGE WARNING. Thin order book${wallStr}. Efficiency=${eff}× — price slipping on light flow.`;
  }
  if (bias !== 'NEUTRAL') {
    return `${pair}: ${bias} SIGNAL. Hurst=${H} (${regime}), Efficiency=${eff}×. Z-OFI=${zOfi}σ — flow pressure ${bias === 'BUY' ? 'bullish' : 'bearish'}.`;
  }
  return `${pair}: Monitoring. Hurst=${H} (${regime}). Efficiency=${eff}×. Z-OFI=${zOfi}σ — no institutional signal yet.`;
}

function getLeadIndicator(p: PairPhysics): string {
  if (p.hiddenPlayer?.type === 'LIQUIDITY_HOLE') return 'VACUUM HUNTING';
  if (p.hiddenPlayer) return 'WHALE SHADOWING';
  if (p.marketState === 'ABSORBING') return 'ICEBERG WATCH';
  if (p.marketState === 'SLIPPING') return 'SLIPPAGE ALERT';
  if (p.efficiency >= 7) return 'TSUNAMI IMMINENT';
  if (p.hurst?.regime === 'PERSISTENT') return 'TREND LOCK';
  if (p.hurst?.regime === 'MEAN_REVERTING') return 'FADE MODE';
  return 'SCANNING FLOW';
}

// ─── Lightning SVG ─────────────────────────────────────────────────────────

function LightningSVG({ speed }: { speed: string }) {
  return (
    <svg
      width="18" height="32" viewBox="0 0 18 32"
      className="absolute -top-1 -right-1 opacity-80"
      aria-hidden="true"
    >
      <polyline
        points="10,0 4,14 9,14 8,32 14,16 9,16 10,0"
        fill="none"
        stroke="hsl(50 100% 60%)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="lightning-path"
        style={{ '--pulse-speed': speed } as React.CSSProperties}
      />
    </svg>
  );
}

// ─── Gating Metric Bar ─────────────────────────────────────────────────────

function GateBar({ label, value, min, max, warn, danger, decimals = 3, passing }: {
  label: string; value: number; min: number; max: number;
  warn?: number; danger?: number; decimals?: number; passing: boolean;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const barColor = passing ? 'bg-green-500' : danger != null && value >= danger ? 'bg-red-500' : warn != null && value >= warn ? 'bg-amber-500' : 'bg-muted-foreground/40';

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={cn('text-[9px] font-mono font-bold', passing ? 'text-green-400' : 'text-muted-foreground')}>
          {value.toFixed(decimals)}
        </span>
      </div>
      <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Tactical Unit Card ────────────────────────────────────────────────────

function TacticalUnit({ pair, data }: { pair: string; data: PairPhysics }) {
  const p = data;
  const state = deriveTacticalState(p);

  // Approximate ue_r from zOfi as proxy (real ue_r lives on oanda_orders)
  const ueR = p.zOfi ?? 0;
  const pulseSpeed = getPulseSpeed(ueR);

  const tacticalClass = {
    CLIMAX:       'tactical-climax',
    ACTIVE:       'tactical-active',
    STRIKE_READY: 'tactical-strike-ready',
    FATIGUE:      'tactical-fatigue',
    SCANNING:     '',
  }[state];

  const stateMeta = {
    CLIMAX:       { label: 'CLIMAX',       color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    ACTIVE:       { label: 'ACTIVE TRADE', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    STRIKE_READY: { label: 'STRIKE READY', color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/30' },
    FATIGUE:      { label: 'FATIGUE',      color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800/40' },
    SCANNING:     { label: 'SCANNING',     color: 'text-muted-foreground', bg: 'bg-muted/20 border-border/20' },
  }[state];

  const leadIndicator = getLeadIndicator(p);
  const commandFeed = buildCommandFeed(pair, p);

  // Gate passing checks
  const hurstPass = (p.hurst?.H ?? 0) >= 0.55;
  const effPass = p.efficiency >= 2;
  const vpinPass = p.vpin >= 0.4;
  const ofiPass = Math.abs(p.zOfi) >= 1;

  const biasColor = p.bias === 'BUY' ? 'text-green-400' : p.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative rounded-xl border-2 bg-card/70 backdrop-blur-sm p-4 space-y-3 transition-colors overflow-hidden',
        tacticalClass,
        state === 'SCANNING' && 'border-border/30'
      )}
      style={{ '--pulse-speed': pulseSpeed } as React.CSSProperties}
    >
      {/* Lightning overlay for active/climax */}
      {(state === 'ACTIVE' || state === 'CLIMAX') && <LightningSVG speed={pulseSpeed} />}

      {/* ── Tactical HUD Header ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className={cn('w-3.5 h-3.5', stateMeta.color)} />
            <span className="font-display font-black text-base tracking-widest">{pair}</span>
          </div>
          <Badge variant="outline" className={cn('text-[8px] font-mono font-bold border uppercase', stateMeta.bg, stateMeta.color)}>
            {stateMeta.label}
          </Badge>
        </div>

        {/* Lead Indicator */}
        <div className="flex items-center justify-between">
          <span className={cn('text-[11px] font-mono font-bold tracking-widest uppercase', stateMeta.color)}>
            {leadIndicator}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-mono font-bold', biasColor)}>
              {p.bias}
            </span>
            {p.hiddenPlayer && (
              p.hiddenPlayer.type === 'LIQUIDITY_HOLE' ? (
                <Badge className="text-[7px] gap-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5">
                  ⚡ LIQ HOLE
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[7px] gap-0.5 px-1.5">
                  🐋 {p.hiddenPlayer.type === 'HIDDEN_LIMIT_SELLER' ? 'LIMIT SELL' : 'LIMIT BUY'}
                </Badge>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Command Feed ── */}
      <div className={cn('rounded-md border px-2.5 py-1.5 overflow-hidden', stateMeta.bg)}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Radio className={cn('w-2.5 h-2.5 flex-shrink-0', stateMeta.color)} />
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Sovereign Feed</span>
        </div>
        <div className="overflow-hidden">
          <div className={cn('text-[9px] font-mono leading-relaxed', stateMeta.color, commandFeed.length > 80 && 'command-feed-scroll inline-block')}>
            {commandFeed}&nbsp;&nbsp;•&nbsp;&nbsp;{commandFeed}
          </div>
        </div>
      </div>

      {/* ── Buy/Sell Pressure ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <span className="text-green-400">BUY {p.buyPct}%</span>
          <span className="text-red-400">SELL {p.sellPct}%</span>
        </div>
        <div className="h-2 bg-muted/20 rounded-full overflow-hidden flex">
          <div className="bg-green-500/70 h-full transition-all duration-500" style={{ width: `${p.buyPct}%` }} />
          <div className="bg-red-500/70 h-full transition-all duration-500" style={{ width: `${p.sellPct}%` }} />
        </div>
      </div>

      {/* ── 4 Gating Metrics ── */}
      <div className="space-y-1.5">
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Gate Status</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <GateBar label="Hurst (H)" value={p.hurst?.H ?? 0} min={0} max={1} warn={0.55} decimals={3} passing={hurstPass} />
          <GateBar label="Efficiency" value={Math.min(p.efficiency, 20)} min={0} max={20} warn={2} danger={7} decimals={1} passing={effPass} />
          <GateBar label="VPIN" value={p.vpin} min={0} max={1} warn={0.4} danger={0.65} decimals={3} passing={vpinPass} />
          <GateBar label="Z-OFI" value={Math.abs(p.zOfi)} min={0} max={5} warn={1} danger={3} decimals={2} passing={ofiPass} />
        </div>
      </div>

      {/* ── Gate Pass Count ── */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex gap-1.5">
          {[hurstPass, effPass, vpinPass, ofiPass].map((pass, i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full border',
                pass ? 'bg-green-500 border-green-400' : 'bg-muted/30 border-border/30'
              )}
            />
          ))}
          <span className="text-[9px] font-mono text-muted-foreground ml-1">
            {[hurstPass, effPass, vpinPass, ofiPass].filter(Boolean).length}/4 GATES
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground">
          {p.ticksAnalyzed?.toLocaleString()} ticks
        </span>
      </div>

      {/* ── S/R Zones (top 2) ── */}
      {p.syntheticDepth && p.syntheticDepth.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {p.syntheticDepth.slice(0, 2).map((lvl, i) => (
            <span key={i} className={cn(
              'text-[8px] font-mono px-1.5 py-0.5 rounded border',
              lvl.broken ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-green-500/30 text-green-400 bg-green-500/10'
            )}>
              {lvl.price.toFixed(lvl.price > 10 ? 3 : 5)} ({lvl.hits}H)
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Gate Pipeline Banner ──────────────────────────────────────────────────

function GatePipeline({ gates }: { gates: string[] }) {
  const gateColors = [
    'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bg-green-500/20 text-green-400 border-green-500/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'bg-red-500/20 text-red-400 border-red-500/30',
    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  ];
  const gateIcons = [Zap, Shield, Waves, TrendingUp, Activity, Eye];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {gates.map((g, i) => {
        const Icon = gateIcons[i] || Zap;
        return (
          <div key={g} className="flex items-center gap-1.5">
            <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold', gateColors[i])}>
              <Icon className="w-3 h-3" />
              {g}
            </div>
            {i < gates.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const SyntheticOrderBook = () => {
  const { snapshot, loading, lastUpdated, refetch } = useSyntheticOrderBook(8_000);

  const pairs = snapshot?.pairs ? Object.entries(snapshot.pairs).sort((a, b) => {
    const zA = Math.abs((a[1] as any).zOfi || 0);
    const zB = Math.abs((b[1] as any).zOfi || 0);
    return zB - zA;
  }) : [];

  const activePairs = pairs.filter(([, d]) => (d as any).ticksAnalyzed > 10);
  const hiddenAlerts = pairs.filter(([, d]) => (d as any).hiddenPlayer);
  const absorbingCount = pairs.filter(([, d]) => (d as any).marketState === 'ABSORBING').length;
  const slippingCount  = pairs.filter(([, d]) => (d as any).marketState === 'SLIPPING').length;
  const liquidCount    = pairs.filter(([, d]) => (d as any).marketState === 'LIQUID').length;
  const activeCount    = activePairs.filter(([, d]) => deriveTacticalState(d as PairPhysics) === 'ACTIVE' || deriveTacticalState(d as PairPhysics) === 'CLIMAX').length;

  const ageMs  = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
  const ageSec = ageMs ? Math.round(ageMs / 1000) : null;
  const isStale = ageSec != null && ageSec > 120;

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Siren className="w-6 h-6 text-yellow-400" />
              <h1 className="font-display text-xl md:text-2xl font-black tracking-widest text-gradient-neural uppercase">
                Tactical War Room
              </h1>
              <IntelligenceModeBadge />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={refetch} className="text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              {ageSec != null && (
                <Badge variant={isStale ? 'destructive' : 'outline'} className="text-[9px] font-mono">
                  {isStale ? '⚠ STALE' : '●'} {ageSec}s ago
                </Badge>
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            Predatory Hunter v2.0 — Physics-Driven Tactical Feed
          </p>
        </motion.div>

        {/* ── Pipeline Banner ── */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
            className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs font-display font-bold text-primary tracking-widest">LEAN 6 PIPELINE</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">{snapshot.version}</Badge>
            </div>
            <GatePipeline gates={snapshot.gates || []} />
          </motion.div>
        )}

        {/* ── Stat Row ── */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
            className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Units Tracked',  value: activePairs.length,                   icon: Activity,   color: undefined },
              { label: 'Active / Climax',value: activeCount,                           icon: Zap,        color: 'text-yellow-400' },
              { label: 'Liquid',         value: liquidCount,                           icon: TrendingUp, color: 'text-green-400' },
              { label: 'Absorbing',      value: absorbingCount,                        icon: Shield,     color: 'text-amber-400' },
              { label: 'Slipping',       value: slippingCount,                         icon: Waves,      color: 'text-red-400' },
              { label: 'Whale Alerts',   value: hiddenAlerts.length,                   icon: Eye,        color: hiddenAlerts.length > 0 ? 'text-orange-400' : 'text-muted-foreground' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('w-3.5 h-3.5', color || 'text-primary')} />
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">{label}</span>
                </div>
                <span className={cn('text-lg font-display font-bold', color || 'text-foreground')}>{value}</span>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm font-mono">Initialising Tactical War Room...</p>
          </div>
        )}

        {/* ── Tactical Unit Grid ── */}
        {!loading && activePairs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activePairs.map(([pair, data]) => (
                <TacticalUnit key={pair} pair={pair} data={data as PairPhysics} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Empty ── */}
        {!loading && activePairs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tactical data available yet.</p>
            <p className="text-xs mt-1 font-mono">The ripple-stream engine populates this when the market is open.</p>
          </div>
        )}

        {/* ── Capabilities ── */}
        {snapshot?.capabilities && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="p-3 rounded-lg border border-border/30 bg-card/30">
            <span className="text-[10px] text-muted-foreground font-mono uppercase">Architecture Capabilities</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {snapshot.capabilities.map(c => (
                <span key={c} className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-muted/40 text-muted-foreground border border-border/20">
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default SyntheticOrderBook;
