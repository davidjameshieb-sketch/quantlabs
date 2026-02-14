import { motion } from 'framer-motion';
import { Eye, Zap, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WarMapState } from '@/hooks/useSovereignWarMap';

interface Props { state: WarMapState }

export function InstitutionalShadowQuadrant({ state }: Props) {
  const hasGodSignal = !!state.godSignalPair;

  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        background: 'radial-gradient(circle at 70% 30%, hsl(var(--neural-purple)), transparent 60%)',
      }} />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">II. Institutional Shadow</h3>
          <Badge variant="outline" className="text-[8px] ml-auto border-[hsl(var(--neural-purple))]/40 text-[hsl(var(--neural-purple))]">
            COT & TFF
          </Badge>
        </div>

        {/* God Signal */}
        <motion.div
          className={cn(
            'p-3 rounded-lg border text-center',
            hasGodSignal
              ? 'border-[hsl(var(--neural-green))]/40 bg-[hsl(var(--neural-green))]/5'
              : 'border-border/30 bg-muted/5',
          )}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
        >
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Zap className={cn('w-3.5 h-3.5', hasGodSignal ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground')} />
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest">The God Signal (80/80)</p>
          </div>
          {hasGodSignal ? (
            <>
              <p className="text-xl font-mono font-black text-[hsl(var(--neural-green))]">{state.godSignalPair}</p>
              <p className="text-[9px] text-muted-foreground mt-1">{state.godSignalDetail}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">No 80/80 divergence active</p>
          )}
        </motion.div>

        {/* Leveraged Flow */}
        <div className="p-2.5 rounded-lg border border-border/30 bg-muted/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Leveraged Flow (Fast Money)</p>
          </div>
          <p className="text-[10px] font-mono text-foreground">{state.leveragedFlowSummary}</p>
        </div>

        {/* Smart Money Verdict */}
        <div className="p-2.5 rounded-lg border border-border/30 bg-muted/5 space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Smart Money Verdict</p>
          <p className={cn(
            'text-sm font-bold',
            state.smartMoneyVerdict.includes('Accumulating') ? 'text-[hsl(var(--neural-green))]'
              : state.smartMoneyVerdict.includes('Liquidating') ? 'text-[hsl(var(--neural-red))]'
                : 'text-muted-foreground',
          )}>
            {state.smartMoneyVerdict}
          </p>
        </div>
      </div>
    </div>
  );
}
