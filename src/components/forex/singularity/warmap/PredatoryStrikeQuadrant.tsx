import { motion } from 'framer-motion';
import { Crosshair, ArrowRightLeft, Target, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WarMapState } from '@/hooks/useSovereignWarMap';

interface Props { state: WarMapState }

const MODE_COLORS: Record<string, string> = {
  STRIKE: 'text-[hsl(var(--neural-green))]',
  NORMAL: 'text-foreground',
  DEFENSIVE: 'text-[hsl(var(--neural-orange))]',
  FLAT: 'text-[hsl(var(--neural-red))]',
};

export function PredatoryStrikeQuadrant({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        background: 'radial-gradient(circle at 30% 70%, hsl(var(--neural-magenta)), transparent 60%)',
      }} />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[hsl(var(--neural-magenta))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">III. Predatory Strike Zone</h3>
          <Badge variant="outline" className="text-[8px] ml-auto border-[hsl(var(--neural-magenta))]/40 text-[hsl(var(--neural-magenta))]">
            TACTICAL
          </Badge>
        </div>

        {/* Lead-Lag Gap */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ArrowRightLeft className="w-3 h-3 text-[hsl(var(--neural-cyan))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Lead-Lag Gap</p>
          </div>
          {state.leadLagGaps.length > 0 ? state.leadLagGaps.map((gap, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20"
            >
              <span className="text-[10px] font-mono font-bold text-[hsl(var(--neural-cyan))]">{gap.loud}</span>
              <span className="text-[8px] text-muted-foreground">→</span>
              <span className="text-[10px] font-mono text-muted-foreground">{gap.quiet}</span>
              <Badge variant="outline" className="text-[7px] ml-auto">{gap.gapMinutes}m lag</Badge>
            </motion.div>
          )) : (
            <p className="text-[9px] text-muted-foreground italic">No lag divergence detected</p>
          )}
        </div>

        {/* Stop-Hunt Target */}
        <div className="p-2.5 rounded-lg border border-[hsl(var(--neural-red))]/20 bg-[hsl(var(--neural-red))]/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-[hsl(var(--neural-red))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Stop-Hunt Target</p>
          </div>
          <p className="text-[10px] font-mono text-foreground">{state.stopHuntTarget}</p>
        </div>

        {/* Active Authority */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg border border-border/30 text-center">
            <p className="text-[8px] text-muted-foreground uppercase">Sizing</p>
            <p className={cn('text-xl font-mono font-black', MODE_COLORS[state.sizingMode])}>
              {state.sizingMultiplier.toFixed(1)}x
            </p>
            <Badge variant="outline" className={cn('text-[7px]', MODE_COLORS[state.sizingMode])}>
              {state.sizingMode}
            </Badge>
          </div>
          <div className="p-2.5 rounded-lg border border-border/30 text-center">
            <p className="text-[8px] text-muted-foreground uppercase">Gatekeeper</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <Shield className="w-3.5 h-3.5 text-[hsl(var(--neural-orange))]" />
              <p className="text-[10px] font-mono font-bold text-foreground truncate">{state.gatekeeperGate}</p>
            </div>
            <p className="text-[7px] text-muted-foreground mt-0.5">Most blocks</p>
          </div>
        </div>
      </div>
    </div>
  );
}
