import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NodeDef {
  x: number;
  y: number;
  label: string;
  icon: string;
  tier: 'trading' | 'optimization' | 'governance' | 'meta';
}

const nodes: NodeDef[] = [
  // Trading fleet (bottom arc)
  { x: 10, y: 80, label: 'Alpha Engine', icon: '📈', tier: 'trading' },
  { x: 22, y: 88, label: 'Macro Pulse', icon: '🌐', tier: 'trading' },
  { x: 34, y: 92, label: 'Momentum Grid', icon: '⚡', tier: 'trading' },
  { x: 46, y: 94, label: 'Liquidity Radar', icon: '🌀', tier: 'trading' },
  { x: 58, y: 92, label: 'Range Nav', icon: '🧭', tier: 'trading' },
  { x: 70, y: 88, label: 'Vol Architect', icon: '🌪', tier: 'trading' },
  { x: 82, y: 80, label: 'Adaptive', icon: '🧪', tier: 'trading' },
  { x: 90, y: 70, label: 'Sentiment', icon: '📊', tier: 'trading' },
  { x: 94, y: 58, label: 'Fractal', icon: '🔬', tier: 'trading' },
  { x: 6, y: 68, label: 'Risk Sentinel', icon: '🛡', tier: 'trading' },

  // Optimization (middle)
  { x: 30, y: 55, label: 'Risk Calibration', icon: '⚙️', tier: 'optimization' },
  { x: 50, y: 50, label: 'Timing Precision', icon: '⏱️', tier: 'optimization' },
  { x: 70, y: 55, label: 'Capital Flow', icon: '💰', tier: 'optimization' },
  { x: 50, y: 65, label: 'Performance', icon: '📐', tier: 'optimization' },

  // Governance (upper)
  { x: 20, y: 30, label: 'Macro Governor', icon: '🏛️', tier: 'governance' },
  { x: 38, y: 25, label: 'Liquidity Dir.', icon: '🔍', tier: 'governance' },
  { x: 56, y: 22, label: 'Tech Auditor', icon: '📋', tier: 'governance' },
  { x: 74, y: 25, label: 'Risk Marshal', icon: '⚖️', tier: 'governance' },
  { x: 84, y: 35, label: 'Ethics Monitor', icon: '🧠', tier: 'governance' },
  { x: 12, y: 40, label: 'Regulatory', icon: '📜', tier: 'governance' },

  // Meta-Controller (top center)
  { x: 50, y: 8, label: 'Meta-Controller', icon: '🎯', tier: 'meta' },
];

const tierColors = {
  trading: { bg: 'bg-neural-green/20', border: 'border-neural-green/40', glow: 'hsl(150 100% 45%)' },
  optimization: { bg: 'bg-neural-cyan/20', border: 'border-neural-cyan/40', glow: 'hsl(185 100% 50%)' },
  governance: { bg: 'bg-neural-purple/20', border: 'border-neural-purple/40', glow: 'hsl(270 60% 50%)' },
  meta: { bg: 'bg-primary/20', border: 'border-primary/40', glow: 'hsl(198 93% 59%)' },
};

const ConnectionLines = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();

    let frame = 0;
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // Draw connections from meta to governance
      const metaNode = nodes.find(n => n.tier === 'meta')!;
      const governanceNodes = nodes.filter(n => n.tier === 'governance');
      const optimizationNodes = nodes.filter(n => n.tier === 'optimization');
      const tradingNodes = nodes.filter(n => n.tier === 'trading');

      // Meta -> Governance
      governanceNodes.forEach((g, i) => {
        const pulse = Math.sin(frame * 0.02 + i * 0.5) * 0.3 + 0.4;
        ctx.strokeStyle = `hsla(270, 60%, 50%, ${pulse})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(metaNode.x * w / 100, metaNode.y * h / 100);
        ctx.lineTo(g.x * w / 100, g.y * h / 100);
        ctx.stroke();
      });

      // Governance -> Optimization
      governanceNodes.forEach((g, gi) => {
        optimizationNodes.forEach((o, oi) => {
          const pulse = Math.sin(frame * 0.015 + gi * 0.3 + oi * 0.7) * 0.2 + 0.15;
          ctx.strokeStyle = `hsla(185, 100%, 50%, ${pulse})`;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(g.x * w / 100, g.y * h / 100);
          ctx.lineTo(o.x * w / 100, o.y * h / 100);
          ctx.stroke();
        });
      });

      // Optimization -> Trading
      optimizationNodes.forEach((o, oi) => {
        tradingNodes.forEach((t, ti) => {
          const pulse = Math.sin(frame * 0.01 + oi * 0.4 + ti * 0.2) * 0.15 + 0.1;
          ctx.strokeStyle = `hsla(150, 100%, 45%, ${pulse})`;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(o.x * w / 100, o.y * h / 100);
          ctx.lineTo(t.x * w / 100, t.y * h / 100);
          ctx.stroke();
        });
      });

      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
};

export const GovernanceEcosystemViz = () => {
  return (
    <section className="relative py-16 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neural-purple/30 bg-neural-purple/10 text-xs font-medium text-neural-purple mb-4">
            Coordinated Intelligence Architecture
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">Ecosystem Intelligence Map</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            21 AI agents connected through oversight, optimization, and execution pathways —
            visualizing how intelligence flows through the QuantLabs ecosystem.
          </p>
        </motion.div>

        {/* Visualization container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative aspect-[16/10] rounded-2xl border border-border/20 bg-background/10 backdrop-blur-sm overflow-hidden"
        >
          <ConnectionLines />

          {/* Node dots */}
          {nodes.map((node, i) => {
            const tier = tierColors[node.tier];
            return (
              <motion.div
                key={node.label}
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.03 }}
                className="absolute group"
                style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className={cn(
                  'relative flex items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-125',
                  node.tier === 'meta' ? 'w-10 h-10' : 'w-7 h-7',
                  tier.bg,
                  'border',
                  tier.border,
                )}>
                  <span className={cn('text-center', node.tier === 'meta' ? 'text-base' : 'text-xs')}>
                    {node.icon}
                  </span>
                </div>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  <span className="px-2 py-1 rounded bg-card/90 border border-border/30 text-[9px] font-mono text-foreground shadow-lg">
                    {node.label}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-background/30 backdrop-blur-sm border border-border/15">
            {([
              ['Trading Fleet', 'bg-neural-green'],
              ['Optimization', 'bg-neural-cyan'],
              ['Governance', 'bg-neural-purple'],
              ['Meta-Controller', 'bg-primary'],
            ] as const).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', color)} />
                <span className="text-[8px] font-mono text-muted-foreground/70">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
