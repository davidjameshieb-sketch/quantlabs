import { motion } from 'framer-motion';
import { BookOpen, Activity, Zap, Eye, Shield, TrendingUp, Waves, AlertTriangle, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { Badge } from '@/components/ui/badge';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';
import { cn } from '@/lib/utils';

// ─── Gate Pipeline Visualization ───
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

// ─── Physics Gauge ───
function PhysicsGauge({ label, value, unit, min, max, warn, danger, decimals = 3 }: {
  label: string; value: number; unit?: string; min: number; max: number; warn?: number; danger?: number; decimals?: number;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const color = danger != null && value >= danger ? 'bg-red-500'
    : warn != null && value >= warn ? 'bg-amber-500'
    : 'bg-primary';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono uppercase">{label}</span>
        <span className="text-[11px] font-mono font-bold">{value.toFixed(decimals)}{unit || ''}</span>
      </div>
      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Pair Card ───
function PairCard({ pair, data }: { pair: string; data: any }) {
  const p = data as PairPhysics;
  const biasColor = p.bias === 'BUY' ? 'text-green-400' : p.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const stateColor = p.marketState === 'LIQUID' ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : p.marketState === 'ABSORBING' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : p.marketState === 'SLIPPING' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-muted/30 text-muted-foreground border-border/30';
  const hurstColor = p.hurst?.regime === 'PERSISTENT' ? 'text-green-400'
    : p.hurst?.regime === 'MEAN_REVERTING' ? 'text-red-400' : 'text-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 space-y-3 hover:border-primary/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm">{pair}</span>
          <Badge variant="outline" className={cn('text-[9px] border', stateColor)}>{p.marketState}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-xs font-bold', biasColor)}>{p.bias}</span>
          {p.hiddenPlayer && (
            (p.hiddenPlayer.type as string) === 'LIQUIDITY_HOLE' ? (
              <Badge className="text-[8px] gap-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30">
                <Waves className="w-2.5 h-2.5" />
                ⚡ LIQ HOLE
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[8px] gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {p.hiddenPlayer.type === 'HIDDEN_LIMIT_SELLER' ? '🐋 LIMIT SELL' : '🐋 LIMIT BUY'}
              </Badge>
            )
          )}
        </div>
      </div>

      {/* Physics Gauges — Efficiency is unbounded (real values 1–200+), use log scale */}
      <div className="grid grid-cols-2 gap-2">
        <PhysicsGauge label="Z-OFI" value={p.zOfi} min={-5} max={5} warn={2} danger={3} />
        <PhysicsGauge label="Hurst (H)" value={p.hurst?.H ?? 0.5} min={0} max={1} decimals={3} />
        <PhysicsGauge label="KM Drift" value={Math.abs(p.kramersMoyal?.driftNormalized ?? 0)} min={0} max={3} warn={1} danger={2} decimals={3} />
        <PhysicsGauge label="Efficiency" value={Math.min(p.efficiency, 50)} min={0} max={50} warn={2} danger={10} decimals={1} />
        <PhysicsGauge label="VPIN" value={p.vpin} min={0} max={1} warn={0.4} danger={0.6} decimals={3} />
        <PhysicsGauge label="OFI Ratio" value={Math.abs(p.ofiRatio)} min={0} max={0.5} decimals={3} />
      </div>

      {/* Detail Row */}
      <div className="grid grid-cols-4 gap-2 text-[10px] font-mono">
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Hurst</span>
          <div className={cn('font-bold', hurstColor)}>{p.hurst?.H?.toFixed(3)}</div>
          <div className="text-[9px] text-muted-foreground">{p.hurst?.regime?.replace('_', ' ')}</div>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Eff (E=F/v)</span>
          <div className={cn('font-bold', p.efficiency >= 2 ? 'text-amber-400' : 'text-foreground')}>{p.efficiency?.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground">{p.efficiency >= 2 ? 'ICEBERG' : 'NORMAL'}</div>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">KM α</span>
          <div className="font-bold">{p.kramersMoyal?.alphaAdaptive?.toFixed(4)}</div>
          <div className="text-[9px] text-muted-foreground">D1={p.kramersMoyal?.D1?.toExponential(2)}</div>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Ticks</span>
          <div className="font-bold">{p.ticksAnalyzed?.toLocaleString()}</div>
          <div className="text-[9px] text-muted-foreground">sample</div>
        </div>
      </div>

      {/* Buy/Sell Pressure Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <span className="text-green-400">BUY {p.buyPct}%</span>
          <span className="text-red-400">SELL {p.sellPct}%</span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden flex">
          <div className="bg-green-500/60 h-full transition-all duration-500" style={{ width: `${p.buyPct}%` }} />
          <div className="bg-red-500/60 h-full transition-all duration-500" style={{ width: `${p.sellPct}%` }} />
        </div>
      </div>

      {/* S/R Levels */}
      {p.syntheticDepth && p.syntheticDepth.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground font-mono uppercase">Price Levels</span>
          <div className="flex flex-wrap gap-1">
            {p.syntheticDepth.slice(0, 3).map((lvl, i) => (
              <span key={i} className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                lvl.broken ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-green-500/30 text-green-400 bg-green-500/10'
              )}>
                {lvl.price.toFixed(lvl.price > 10 ? 3 : 5)} ({lvl.hits}H {lvl.bounces}B)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resistance Levels */}
      {p.resistanceLevels && p.resistanceLevels.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground font-mono uppercase">S/R Zones</span>
          <div className="flex flex-wrap gap-1">
            {p.resistanceLevels.slice(0, 3).map((lvl, i) => (
              <span key={i} className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                lvl.type === 'RESISTANCE' ? 'border-red-500/20 text-red-400' : 'border-green-500/20 text-green-400'
              )}>
                {lvl.type[0]} {lvl.price.toFixed(lvl.price > 10 ? 3 : 5)} ×{lvl.strength}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Page ───
const SyntheticOrderBook = () => {
  const { snapshot, loading, lastUpdated, refetch } = useSyntheticOrderBook(8_000);

  const pairs = snapshot?.pairs ? Object.entries(snapshot.pairs).sort((a, b) => {
    // Sort by abs Z-OFI descending (most active first)
    const zA = Math.abs((a[1] as any).zOfi || 0);
    const zB = Math.abs((b[1] as any).zOfi || 0);
    return zB - zA;
  }) : [];

  const activePairs = pairs.filter(([, d]) => (d as any).ticksAnalyzed > 10);
  const hiddenAlerts = pairs.filter(([, d]) => (d as any).hiddenPlayer);
  const absorbingCount = pairs.filter(([, d]) => (d as any).marketState === 'ABSORBING').length;
  const slippingCount = pairs.filter(([, d]) => (d as any).marketState === 'SLIPPING').length;
  const liquidCount = pairs.filter(([, d]) => (d as any).marketState === 'LIQUID').length;

  const ageMs = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
  const ageSec = ageMs ? Math.round(ageMs / 1000) : null;
  const isStale = ageSec != null && ageSec > 120;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-primary" />
              <h1 className="font-display text-xl md:text-2xl font-bold text-gradient-neural">
                Synthetic Order Book
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
          <p className="text-muted-foreground text-sm mt-1">
            100% O(1) Recursive Market Physics — Lean 6 Zero-Lag Protocol
          </p>
        </motion.div>

        {/* Architecture Banner */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
            className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs font-display font-bold text-primary">LEAN 6 PIPELINE</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">{snapshot.version}</Badge>
            </div>
            <GatePipeline gates={snapshot.gates || []} />
          </motion.div>
        )}

        {/* Stats Row */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
            className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Pairs Tracked', value: activePairs.length, icon: Activity },
              { label: 'Ticks Processed', value: snapshot.ticksProcessed?.toLocaleString() || '—', icon: Zap },
              { label: 'Liquid', value: liquidCount, icon: TrendingUp, color: 'text-green-400' },
              { label: 'Absorbing', value: absorbingCount, icon: Shield, color: 'text-amber-400' },
              { label: 'Slipping', value: slippingCount, icon: Waves, color: 'text-red-400' },
              { label: 'Hidden Players', value: hiddenAlerts.length, icon: Eye, color: hiddenAlerts.length > 0 ? 'text-red-400' : 'text-muted-foreground' },
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

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading Synthetic Order Book...</p>
          </div>
        )}

        {/* Pair Grid */}
        {!loading && activePairs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activePairs.map(([pair, data]) => (
                <PairCard key={pair} pair={pair} data={data} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty */}
        {!loading && activePairs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No synthetic book data available yet.</p>
            <p className="text-xs mt-1">The ripple-stream engine populates this when the market is open.</p>
          </div>
        )}

        {/* Capabilities */}
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
