import { motion } from 'framer-motion';
import { Crosshair, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

const MODE_CONFIG = {
  STRIKE: { icon: TrendingUp, color: 'hsl(var(--neural-green))', label: 'STRIKE MODE', desc: 'Maximum authorized leverage — conviction absolute' },
  NORMAL: { icon: Minus, color: 'hsl(var(--foreground))', label: 'NORMAL', desc: 'Standard allocation — balanced edge-to-risk' },
  DEFENSIVE: { icon: TrendingDown, color: 'hsl(var(--neural-orange))', label: 'DEFENSIVE', desc: 'Reduced allocation — edge-to-variance degraded' },
  FLAT: { icon: Crosshair, color: 'hsl(var(--neural-red))', label: 'FLAT-LINE', desc: 'Near-zero allocation — tape is muddy' },
};

export function PredatorySizingPanel({ state }: Props) {
  const config = MODE_CONFIG[state.sizingMode];
  const Icon = config.icon;
  const kellyPct = Math.min(100, state.kellyEdgeRatio * 100);

  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3">
      <div className="flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-[hsl(var(--neural-magenta))]" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Predatory Sizing</h3>
        <Badge variant="outline" className="text-[8px] ml-auto" style={{ color: config.color, borderColor: config.color }}>
          Kelly-Derived
        </Badge>
      </div>

      {/* Sizing Mode Hero */}
      <motion.div
        className="flex items-center justify-between p-4 rounded-lg border"
        style={{
          borderColor: `${config.color}40`,
          background: `${config.color}08`,
        }}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5" style={{ color: config.color }} />
            <span className="text-sm font-bold" style={{ color: config.color }}>{config.label}</span>
          </div>
          <p className="text-[9px] text-muted-foreground max-w-[200px]">{config.desc}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono font-black" style={{ color: config.color }}>
            {state.currentSizingMultiplier.toFixed(1)}x
          </p>
          <p className="text-[8px] text-muted-foreground">Global Multiplier</p>
        </div>
      </motion.div>

      {/* Kelly Edge-to-Variance */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Edge-to-Variance Ratio</span>
          <span className="text-[10px] font-mono font-bold text-foreground">{(state.kellyEdgeRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted/20 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, hsl(var(--neural-red)), hsl(var(--neural-orange)), hsl(var(--neural-green)))` }}
            initial={{ width: 0 }}
            animate={{ width: `${kellyPct}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          {/* Threshold markers */}
          <div className="absolute top-0 bottom-0 left-[25%] w-px bg-muted-foreground/30" />
          <div className="absolute top-0 bottom-0 left-[50%] w-px bg-muted-foreground/30" />
          <div className="absolute top-0 bottom-0 left-[75%] w-px bg-muted-foreground/30" />
        </div>
        <div className="flex justify-between text-[7px] text-muted-foreground">
          <span>FLAT</span>
          <span>DEFENSIVE</span>
          <span>NORMAL</span>
          <span>STRIKE</span>
        </div>
      </div>
    </div>
  );
}
