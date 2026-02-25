/**
 * AtlasNeuralNet — Bilateral neural web showing 20 strategy nodes
 * connected to a central Sovereign Matrix core via health-mapped SVG veins.
 * Pulls LIVE data from oanda_orders via get_agent_simulator_stats.
 */

import { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, Shield, Loader2 } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

// ── Data Schema ──

interface StrategyNode {
  id: string;
  agentId: string;
  type: 'MOM' | 'CTR';
  ranks: string;
  health: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
  stats: { trades: number; profitFactor: number; netPips: number; winRate: number };
  diagnostic: string;
}

// ── The 20 Atlas Hedge Agents ──

const ATLAS_AGENTS = [
  // 10 Momentum
  { id: 'M1', agentId: 'atlas-hedge-m1', type: 'MOM' as const, ranks: '#1v#8' },
  { id: 'M2', agentId: 'atlas-hedge-m2', type: 'MOM' as const, ranks: '#2v#7' },
  { id: 'M3', agentId: 'atlas-hedge-m3', type: 'MOM' as const, ranks: '#1v#6' },
  { id: 'M4', agentId: 'atlas-hedge-m4', type: 'MOM' as const, ranks: '#3v#8' },
  { id: 'M5', agentId: 'atlas-hedge-m5', type: 'MOM' as const, ranks: '#2v#5' },
  { id: 'M6', agentId: 'atlas-hedge-m6', type: 'MOM' as const, ranks: '#1v#7' },
  { id: 'M7', agentId: 'atlas-hedge-m7', type: 'MOM' as const, ranks: '#3v#6' },
  { id: 'M8', agentId: 'atlas-hedge-m8', type: 'MOM' as const, ranks: '#4v#8' },
  { id: 'M9', agentId: 'atlas-hedge-m9', type: 'MOM' as const, ranks: '#2v#6' },
  { id: 'M10', agentId: 'atlas-hedge-m10', type: 'MOM' as const, ranks: '#1v#5' },
  // 10 Counter-Leg
  { id: 'C1', agentId: 'atlas-hedge-c1', type: 'CTR' as const, ranks: '#1v#8' },
  { id: 'C2', agentId: 'atlas-hedge-c2', type: 'CTR' as const, ranks: '#2v#7' },
  { id: 'C3', agentId: 'atlas-hedge-c3', type: 'CTR' as const, ranks: '#1v#6' },
  { id: 'C4', agentId: 'atlas-hedge-c4', type: 'CTR' as const, ranks: '#3v#8' },
  { id: 'C5', agentId: 'atlas-hedge-c5', type: 'CTR' as const, ranks: '#2v#5' },
  { id: 'C6', agentId: 'atlas-hedge-c6', type: 'CTR' as const, ranks: '#1v#7' },
  { id: 'C7', agentId: 'atlas-hedge-c7', type: 'CTR' as const, ranks: '#3v#6' },
  { id: 'C8', agentId: 'atlas-hedge-c8', type: 'CTR' as const, ranks: '#4v#8' },
  { id: 'C9', agentId: 'atlas-hedge-c9', type: 'CTR' as const, ranks: '#2v#6' },
  { id: 'C10', agentId: 'atlas-hedge-c10', type: 'CTR' as const, ranks: '#1v#5' },
];

// ── Diagnostics ──

function getDiagnostic(type: 'MOM' | 'CTR', health: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL', pf: number, wr: number): string {
  if (type === 'MOM') {
    if (health === 'OPTIMAL') return `↳ DIAGNOSTIC: Regime aligned. PF ${pf.toFixed(2)} with ${wr.toFixed(0)}% WR — momentum edge confirmed.`;
    if (health === 'DEGRADED') return `↳ DIAGNOSTIC: Partial alignment. PF ${pf.toFixed(2)} signals noisy trend — reduced sizing recommended.`;
    return `↳ DIAGNOSTIC: Regime collapse. PF ${pf.toFixed(2)}, WR ${wr.toFixed(0)}% — momentum edge destroyed by compression.`;
  }
  if (health === 'OPTIMAL') return `↳ DIAGNOSTIC: Mean-reversion edge confirmed. PF ${pf.toFixed(2)} capturing overextension efficiently.`;
  if (health === 'DEGRADED') return `↳ DIAGNOSTIC: Reversion signal weakening. PF ${pf.toFixed(2)} — spread compression limiting entries.`;
  return `↳ DIAGNOSTIC: Regime mismatch. PF ${pf.toFixed(2)}, WR ${wr.toFixed(0)}% — reversion neutralized by directional flow.`;
}

function deriveHealth(pf: number): 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' {
  if (pf > 1.2) return 'OPTIMAL';
  if (pf >= 0.8) return 'DEGRADED';
  return 'CRITICAL';
}

// ── Health Color Map ──

const HEALTH_COLORS = {
  OPTIMAL: { stroke: '#10b981', opacity: 0.85, width: 2.5, ring: 'ring-emerald-500/60', text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  DEGRADED: { stroke: '#f59e0b', opacity: 0.55, width: 1.8, ring: 'ring-amber-500/50', text: 'text-amber-400', bg: 'bg-amber-500/15' },
  CRITICAL: { stroke: '#7f1d1d', opacity: 0.35, width: 1.2, ring: 'ring-red-900/40', text: 'text-red-400', bg: 'bg-red-500/10' },
} as const;

// ── Node Component ──

function StrategyNodeCircle({ node, onRef }: { node: StrategyNode; onRef: (id: string, el: HTMLDivElement | null) => void }) {
  const hc = HEALTH_COLORS[node.health];
  const isOptimal = node.health === 'OPTIMAL';

  return (
    <HoverCard openDelay={80} closeDelay={100}>
      <HoverCardTrigger asChild>
        <motion.div
          ref={(el) => onRef(node.id, el)}
          className={`relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ring-2 ${hc.ring} ${hc.bg} backdrop-blur-sm transition-all hover:scale-110`}
          animate={isOptimal ? { boxShadow: [`0 0 8px ${hc.stroke}44`, `0 0 20px ${hc.stroke}66`, `0 0 8px ${hc.stroke}44`] } : {}}
          transition={isOptimal ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : {}}
        >
          <span className="text-[9px] font-mono font-bold text-foreground/90">{node.id}</span>
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        className="w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 p-0 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            {node.type === 'MOM' ? <Zap className="w-3 h-3 text-cyan-400" /> : <Shield className="w-3 h-3 text-violet-400" />}
            <span className="text-[10px] font-mono font-bold text-foreground">
              {node.type} | Ranks: {node.ranks}
            </span>
          </div>
          <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${hc.text} border-current`}>
            {node.health}
          </Badge>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-4 gap-px bg-slate-800/40 mx-3 my-2 rounded overflow-hidden">
          <div className="bg-slate-900/80 p-2 text-center">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">Trades</div>
            <div className="text-[11px] font-mono font-bold text-foreground">{node.stats.trades}</div>
          </div>
          <div className="bg-slate-900/80 p-2 text-center">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">WR%</div>
            <div className={`text-[11px] font-mono font-bold ${node.stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
              {node.stats.winRate.toFixed(1)}
            </div>
          </div>
          <div className="bg-slate-900/80 p-2 text-center">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">PF</div>
            <div className={`text-[11px] font-mono font-bold ${node.stats.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {node.stats.profitFactor.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-900/80 p-2 text-center">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">Pips</div>
            <div className={`text-[11px] font-mono font-bold ${node.stats.netPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {node.stats.netPips >= 0 ? '+' : ''}{node.stats.netPips.toFixed(1)}
            </div>
          </div>
        </div>
        {/* Diagnostic */}
        <div className="px-3 pb-2.5">
          <p className="text-[10px] italic text-muted-foreground font-mono leading-tight">
            {node.diagnostic}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Main Component ──

export default function AtlasNeuralNet() {
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; health: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' }[]>([]);
  const [strategyNodes, setStrategyNodes] = useState<StrategyNode[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch live stats from DB ──
  const fetchLiveStats = useCallback(async () => {
    try {
      // Use a 7-day rolling window so the web has meaningful data
      const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const agentIds = ATLAS_AGENTS.map(a => a.agentId);

      const { data: orders } = await supabase
        .from('oanda_orders')
        .select('agent_id, direction, entry_price, exit_price, currency_pair, oanda_trade_id')
        .in('agent_id', agentIds)
        .eq('status', 'closed')
        .not('exit_price', 'is', null)
        .not('entry_price', 'is', null)
        .not('oanda_trade_id', 'is', null)
        .eq('baseline_excluded', false)
        .gte('closed_at', windowStart);

      const statsMap = new Map<string, { trades: number; wins: number; netPips: number; grossProfit: number; grossLoss: number }>();

      if (orders) {
        for (const o of orders) {
          const isJpy = (o.currency_pair as string).includes('JPY');
          const multiplier = isJpy ? 100 : 10000;
          const pips = o.direction === 'long'
            ? ((o.exit_price as number) - (o.entry_price as number)) * multiplier
            : ((o.entry_price as number) - (o.exit_price as number)) * multiplier;
          const rounded = Math.round(pips * 10) / 10;

          const existing = statsMap.get(o.agent_id!) ?? { trades: 0, wins: 0, netPips: 0, grossProfit: 0, grossLoss: 0 };
          existing.trades += 1;
          existing.netPips += rounded;
          if (rounded > 0) {
            existing.wins += 1;
            existing.grossProfit += rounded;
          } else {
            existing.grossLoss += Math.abs(rounded);
          }
          statsMap.set(o.agent_id!, existing);
        }
      }

      const nodes: StrategyNode[] = ATLAS_AGENTS.map(agent => {
        const s = statsMap.get(agent.agentId);
        const trades = s?.trades ?? 0;
        const wins = s?.wins ?? 0;
        const netPips = s?.netPips ?? 0;
        const grossProfit = s?.grossProfit ?? 0;
        const grossLoss = s?.grossLoss ?? 0;
        const winRate = trades > 0 ? (wins / trades) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 0;
        const health = trades === 0 ? 'DEGRADED' : deriveHealth(profitFactor);
        const diagnostic = trades === 0
          ? `↳ DIAGNOSTIC: Awaiting first closed trade. Live positions pending exit.`
          : getDiagnostic(agent.type, health, profitFactor, winRate);

        return {
          id: agent.id,
          agentId: agent.agentId,
          type: agent.type,
          ranks: agent.ranks,
          health,
          stats: { trades, profitFactor: Math.min(profitFactor, 9.99), netPips, winRate },
          diagnostic,
        };
      });

      setStrategyNodes(nodes);
    } catch (e) {
      console.error('AtlasNeuralNet fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchLiveStats]);

  const momNodes = strategyNodes.filter(n => n.type === 'MOM');
  const ctrNodes = strategyNodes.filter(n => n.type === 'CTR');

  // Calculate SVG vein positions after layout
  useLayoutEffect(() => {
    if (strategyNodes.length === 0) return;
    const compute = () => {
      const container = containerRef.current;
      const core = coreRef.current;
      if (!container || !core) return;

      const cRect = container.getBoundingClientRect();
      const kRect = core.getBoundingClientRect();
      const cx = kRect.left - cRect.left + kRect.width / 2;
      const cy = kRect.top - cRect.top + kRect.height / 2;

      const newLines = strategyNodes.map(node => {
        const el = nodeRefs.current[node.id];
        if (!el) return null;
        const nRect = el.getBoundingClientRect();
        return {
          x1: cx,
          y1: cy,
          x2: nRect.left - cRect.left + nRect.width / 2,
          y2: nRect.top - cRect.top + nRect.height / 2,
          health: node.health,
        };
      }).filter(Boolean) as typeof lines;

      setLines(newLines);
    };

    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
    };
  }, [strategyNodes]);

  // Portfolio totals for header
  const totalPips = strategyNodes.reduce((s, n) => s + n.stats.netPips, 0);
  const totalTrades = strategyNodes.reduce((s, n) => s + n.stats.trades, 0);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/40 rounded-2xl p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-700/30 pb-3">
        <Activity className="w-4 h-4 text-cyan-400" />
        <h2 className="text-[11px] font-bold tracking-widest text-cyan-400 uppercase font-display">
          Neural Strategy Web
        </h2>
        {!loading && (
          <span className="text-[8px] font-mono text-muted-foreground ml-auto">
            {strategyNodes.filter(n => n.health === 'OPTIMAL').length} OPTIMAL · {strategyNodes.filter(n => n.health === 'DEGRADED').length} DEGRADED · {strategyNodes.filter(n => n.health === 'CRITICAL').length} CRITICAL
            <span className="mx-2">|</span>
            <span className={totalPips >= 0 ? 'text-emerald-400' : 'text-red-400'}>{totalPips >= 0 ? '+' : ''}{totalPips.toFixed(1)}p</span>
            <span className="text-muted-foreground ml-1">/ {totalTrades} trades</span>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[420px]">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
          <span className="text-[10px] font-mono text-muted-foreground ml-2">Loading live strategy data…</span>
        </div>
      ) : (
        /* Neural Web Container */
        <div ref={containerRef} className="relative min-h-[420px]">
          {/* SVG Veins Layer */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <defs>
              <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {lines.map((line, i) => {
              const hc = HEALTH_COLORS[line.health];
              return (
                <motion.line
                  key={i}
                  x1={line.x1} y1={line.y1}
                  x2={line.x2} y2={line.y2}
                  stroke={hc.stroke}
                  strokeWidth={hc.width}
                  strokeOpacity={hc.opacity}
                  filter={line.health === 'OPTIMAL' ? 'url(#glow-green)' : line.health === 'DEGRADED' ? 'url(#glow-amber)' : undefined}
                  animate={line.health === 'OPTIMAL' ? { strokeOpacity: [hc.opacity, hc.opacity * 0.5, hc.opacity] } : {}}
                  transition={line.health === 'OPTIMAL' ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : {}}
                />
              );
            })}
          </svg>

          {/* Grid Layout: Left Hemisphere | Core | Right Hemisphere */}
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4" style={{ zIndex: 1 }}>

            {/* Left Hemisphere — Momentum */}
            <div className="flex flex-col items-end gap-3 pr-2">
              <div className="text-[8px] font-mono font-bold text-cyan-400/70 tracking-widest uppercase mb-1">
                Momentum
              </div>
              {momNodes.map(node => (
                <StrategyNodeCircle
                  key={node.id}
                  node={node}
                  onRef={(id, el) => { nodeRefs.current[id] = el; }}
                />
              ))}
            </div>

            {/* Core Node */}
            <div className="flex flex-col items-center justify-center">
              <motion.div
                ref={coreRef}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border-2 border-cyan-500/50 flex flex-col items-center justify-center backdrop-blur-xl ring-4 ring-cyan-500/10 cursor-default"
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(0,255,234,0.15)',
                    '0 0 40px rgba(0,255,234,0.3)',
                    '0 0 20px rgba(0,255,234,0.15)',
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="text-[7px] font-mono font-bold text-cyan-400 tracking-wider uppercase">Sovereign</span>
                <span className="text-[7px] font-mono font-bold text-cyan-400 tracking-wider uppercase">Matrix</span>
              </motion.div>
            </div>

            {/* Right Hemisphere — Counter-Leg */}
            <div className="flex flex-col items-start gap-3 pl-2">
              <div className="text-[8px] font-mono font-bold text-violet-400/70 tracking-widest uppercase mb-1">
                Counter-Leg
              </div>
              {ctrNodes.map(node => (
                <StrategyNodeCircle
                  key={node.id}
                  node={node}
                  onRef={(id, el) => { nodeRefs.current[id] = el; }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
