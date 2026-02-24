/**
 * AtlasNeuralNet — Bilateral neural web showing 20 strategy nodes
 * connected to a central Sovereign Matrix core via health-mapped SVG veins.
 */

import { useRef, useLayoutEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, Shield } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';

// ── Data Schema ──

interface StrategyNode {
  id: string;
  type: 'MOM' | 'CTR';
  ranks: string;
  health: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
  stats: { trades: number; profitFactor: number; netPips: number };
  diagnostic: string;
}

// ── Mock Engine ──

const MOM_DIAGNOSTICS: Record<string, string> = {
  OPTIMAL: '↳ DIAGNOSTIC: Regime aligned. Volatility expansion perfectly capturing rank divergence.',
  DEGRADED: '↳ DIAGNOSTIC: Partial regime alignment. Trend signal present but noisy, reduced sizing recommended.',
  CRITICAL: '↳ DIAGNOSTIC: Regime collapse. Momentum edge neutralized by range-bound compression.',
};

const CTR_DIAGNOSTICS: Record<string, string> = {
  OPTIMAL: '↳ DIAGNOSTIC: Mean-reversion edge confirmed. Overextension captured with tight R multiples.',
  DEGRADED: '↳ DIAGNOSTIC: Reversion signal weakening. Spread compression limiting entry quality.',
  CRITICAL: '↳ DIAGNOSTIC: Regime mismatch. Mean-reversion edge neutralized by sustained directional flow.',
};

function deriveHealth(pf: number): 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' {
  if (pf > 1.2) return 'OPTIMAL';
  if (pf >= 0.8) return 'DEGRADED';
  return 'CRITICAL';
}

function generateMockNodes(): StrategyNode[] {
  const nodes: StrategyNode[] = [];
  const rankPairs = [
    '#1v#8', '#2v#7', '#1v#6', '#3v#8', '#2v#5',
    '#1v#7', '#3v#6', '#4v#8', '#2v#6', '#1v#5',
  ];
  // MOM stats: higher PF more likely
  const momStats: { trades: number; pf: number; pips: number }[] = [
    { trades: 142, pf: 1.78, pips: 312 },
    { trades: 98, pf: 1.45, pips: 187 },
    { trades: 67, pf: 1.31, pips: 94 },
    { trades: 134, pf: 1.62, pips: 268 },
    { trades: 55, pf: 0.94, pips: -18 },
    { trades: 112, pf: 1.55, pips: 224 },
    { trades: 89, pf: 1.08, pips: 22 },
    { trades: 44, pf: 0.72, pips: -67 },
    { trades: 156, pf: 1.89, pips: 401 },
    { trades: 78, pf: 1.15, pips: 41 },
  ];
  const ctrStats: { trades: number; pf: number; pips: number }[] = [
    { trades: 131, pf: 1.67, pips: 278 },
    { trades: 46, pf: 0.65, pips: -89 },
    { trades: 102, pf: 1.42, pips: 168 },
    { trades: 88, pf: 1.19, pips: 52 },
    { trades: 71, pf: 0.88, pips: -31 },
    { trades: 119, pf: 1.53, pips: 213 },
    { trades: 95, pf: 1.28, pips: 104 },
    { trades: 38, pf: 0.59, pips: -112 },
    { trades: 147, pf: 1.74, pips: 356 },
    { trades: 63, pf: 1.02, pips: 5 },
  ];

  for (let i = 0; i < 10; i++) {
    const m = momStats[i];
    const health = deriveHealth(m.pf);
    nodes.push({
      id: `M${i + 1}`,
      type: 'MOM',
      ranks: rankPairs[i],
      health,
      stats: { trades: m.trades, profitFactor: m.pf, netPips: m.pips },
      diagnostic: MOM_DIAGNOSTICS[health],
    });
  }
  for (let i = 0; i < 10; i++) {
    const c = ctrStats[i];
    const health = deriveHealth(c.pf);
    nodes.push({
      id: `C${i + 1}`,
      type: 'CTR',
      ranks: rankPairs[i],
      health,
      stats: { trades: c.trades, profitFactor: c.pf, netPips: c.pips },
      diagnostic: CTR_DIAGNOSTICS[health],
    });
  }
  return nodes;
}

const STRATEGY_NODES = generateMockNodes();

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
        <div className="grid grid-cols-3 gap-px bg-slate-800/40 mx-3 my-2 rounded overflow-hidden">
          <div className="bg-slate-900/80 p-2 text-center">
            <div className="text-[8px] text-muted-foreground font-mono uppercase">Trades</div>
            <div className="text-[11px] font-mono font-bold text-foreground">{node.stats.trades}</div>
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
              {node.stats.netPips >= 0 ? '+' : ''}{node.stats.netPips}
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

  const momNodes = STRATEGY_NODES.filter(n => n.type === 'MOM');
  const ctrNodes = STRATEGY_NODES.filter(n => n.type === 'CTR');

  // Calculate SVG vein positions after layout
  useLayoutEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      const core = coreRef.current;
      if (!container || !core) return;

      const cRect = container.getBoundingClientRect();
      const kRect = core.getBoundingClientRect();
      const cx = kRect.left - cRect.left + kRect.width / 2;
      const cy = kRect.top - cRect.top + kRect.height / 2;

      const newLines = STRATEGY_NODES.map(node => {
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

    // Wait for layout
    const raf = requestAnimationFrame(compute);
    // Recompute on resize
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
    };
  }, []);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/40 rounded-2xl p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-700/30 pb-3">
        <Activity className="w-4 h-4 text-cyan-400" />
        <h2 className="text-[11px] font-bold tracking-widest text-cyan-400 uppercase font-display">
          Neural Strategy Web
        </h2>
        <span className="text-[8px] font-mono text-muted-foreground ml-auto">
          {STRATEGY_NODES.filter(n => n.health === 'OPTIMAL').length} OPTIMAL · {STRATEGY_NODES.filter(n => n.health === 'DEGRADED').length} DEGRADED · {STRATEGY_NODES.filter(n => n.health === 'CRITICAL').length} CRITICAL
        </span>
      </div>

      {/* Neural Web Container */}
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
    </div>
  );
}
