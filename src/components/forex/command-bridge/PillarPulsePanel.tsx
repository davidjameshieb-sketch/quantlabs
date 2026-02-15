// Pillar Pulse — Top-level 5-pillar status overview
import { motion } from 'framer-motion';
import { Shield, Swords, Crosshair, Dna, Microscope, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type PillarSummary } from '@/hooks/useSovereignDirectives';

const PILLAR_ICONS: Record<string, React.ElementType> = {
  P0: Shield, P1: Swords, P2: Crosshair, P3: Dna, P4: Microscope,
};

const PILLAR_COLORS: Record<string, string> = {
  P0: 'from-red-500/20 to-red-500/5 border-red-500/30',
  P1: 'from-orange-500/20 to-orange-500/5 border-orange-500/30',
  P2: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
  P3: 'from-purple-500/20 to-purple-500/5 border-purple-500/30',
  P4: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
};

const PILLAR_ACCENT: Record<string, string> = {
  P0: 'text-red-400', P1: 'text-orange-400', P2: 'text-cyan-400',
  P3: 'text-purple-400', P4: 'text-amber-400',
};

interface Props {
  pillars: PillarSummary[];
  totalDirectives: number;
  loading: boolean;
}

export function PillarPulsePanel({ pillars, totalDirectives, loading }: Props) {
  if (loading) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        <Zap className="w-6 h-6 mx-auto mb-2 opacity-30 animate-pulse" />
        Loading Pillar Pulse…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Pillar Pulse</span>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5 px-2 font-mono">
          {totalDirectives} directives loaded
        </Badge>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[p.pillar] || Shield;
          const accent = PILLAR_ACCENT[p.pillar] || 'text-primary';
          const bgClass = PILLAR_COLORS[p.pillar] || '';
          const healthPct = p.totalCount > 0 ? Math.min(100, Math.round((p.l0Count / p.totalCount) * 100)) : 0;

          return (
            <motion.div
              key={p.pillar}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-xl border bg-gradient-to-b ${bgClass} p-3 text-center space-y-2`}
            >
              <Icon className={`w-5 h-5 mx-auto ${accent}`} />
              <div className="text-[10px] font-bold uppercase tracking-wider text-foreground">{p.pillar}</div>
              <div className="text-lg font-mono font-black text-foreground">{p.totalCount}</div>
              <div className="text-[9px] text-muted-foreground">{p.label.split('(')[0].trim()}</div>
              {/* L0 Hardwire bar */}
              <div className="space-y-0.5">
                <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${healthPct}%` }}
                    className={`h-full rounded-full ${accent.replace('text-', 'bg-')}`}
                  />
                </div>
                <div className="text-[8px] text-muted-foreground">{p.l0Count} L0 · {healthPct}%</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
