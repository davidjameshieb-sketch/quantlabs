import { motion } from 'framer-motion';
import { Atom } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

const RINGS = [
  { key: 'serverPersistence', label: 'Server Persistence', max: 25 },
  { key: 'agentControl', label: 'Agent Control', max: 25 },
  { key: 'circuitBreakers', label: 'Circuit Breakers', max: 20 },
  { key: 'dynamicGates', label: 'Dynamic Gates', max: 15 },
  { key: 'adaptiveSizing', label: 'Adaptive Sizing', max: 15 },
] as const;

const RING_COLORS = [
  'hsl(var(--neural-cyan))',
  'hsl(var(--neural-purple))',
  'hsl(var(--neural-magenta))',
  'hsl(var(--neural-green))',
  'hsl(var(--neural-orange))',
];

export function SovereigntyScoreGauge({ state }: Props) {
  const score = state.sovereigntyScore;
  const tier = score >= 85 ? 'SINGULARITY' : score >= 70 ? 'SOVEREIGN' : score >= 50 ? 'AUTONOMOUS' : score >= 30 ? 'MANAGED' : 'NASCENT';
  const tierColor = score >= 85 ? 'text-[hsl(var(--neural-cyan))]' : score >= 70 ? 'text-[hsl(var(--neural-green))]' : score >= 50 ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground';

  return (
    <div className="relative p-5 rounded-xl bg-card/60 border border-border/40 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 opacity-10" style={{
        background: `radial-gradient(circle at 50% 50%, hsl(var(--neural-cyan)), transparent 70%)`,
      }} />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <Atom className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">Sovereignty Score</h3>
        </div>

        {/* Central Score */}
        <div className="relative">
          <svg viewBox="0 0 120 120" className="w-28 h-28">
            {/* Background ring */}
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="6" opacity="0.3" />
            {/* Score arc */}
            <motion.circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="hsl(var(--neural-cyan))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
              initial={{ strokeDasharray: '0 327' }}
              animate={{ strokeDasharray: `${(score / 100) * 327} 327` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-3xl font-mono font-black text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {score}
            </motion.span>
            <span className={cn('text-[9px] font-bold tracking-widest', tierColor)}>{tier}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="w-full space-y-1.5">
          {RINGS.map((ring, i) => {
            const val = state.scoreBreakdown[ring.key];
            const pct = (val / ring.max) * 100;
            return (
              <div key={ring.key} className="flex items-center gap-2">
                <span className="text-[8px] text-muted-foreground w-24 text-right truncate">{ring.label}</span>
                <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: RING_COLORS[i] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: i * 0.1 }}
                  />
                </div>
                <span className="text-[8px] font-mono text-muted-foreground w-8">{val}/{ring.max}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
