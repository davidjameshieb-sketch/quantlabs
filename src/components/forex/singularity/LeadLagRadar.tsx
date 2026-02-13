import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

const CLUSTER_COLORS: Record<string, string> = {
  'EUR-BLOC': 'hsl(var(--neural-cyan))',
  'JPY-CARRY': 'hsl(var(--neural-orange))',
  'COMMODITY': 'hsl(var(--neural-green))',
  'USD-INVERSE': 'hsl(var(--neural-purple))',
};

export function LeadLagRadar({ state }: Props) {
  const clusters = new Map<string, typeof state.leadLagPairs>();
  state.leadLagPairs.forEach(p => {
    if (!clusters.has(p.cluster)) clusters.set(p.cluster, []);
    clusters.get(p.cluster)!.push(p);
  });

  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Lead-Lag Radar</h3>
        <Badge variant="outline" className="text-[8px] ml-auto border-[hsl(var(--neural-cyan))]/40 text-[hsl(var(--neural-cyan))]">
          {state.leadLagPairs.length} pairs tracked
        </Badge>
      </div>

      <div className="space-y-3">
        {Array.from(clusters.entries()).map(([cluster, pairs]) => (
          <div key={cluster} className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CLUSTER_COLORS[cluster] || 'hsl(var(--muted))' }} />
              <span className="text-[9px] font-bold tracking-wider text-muted-foreground">{cluster}</span>
            </div>
            {pairs.map((pair, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20"
              >
                <span className="text-[10px] font-mono font-bold text-foreground w-16">{pair.leader}</span>
                <div className="flex-1 relative h-1.5 bg-muted/20 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ backgroundColor: CLUSTER_COLORS[cluster] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pair.correlation * 100}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">{pair.follower}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    'text-[8px] font-mono',
                    pair.correlation > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                  )}>
                    {pair.correlation > 0 ? '+' : ''}{(pair.correlation * 100).toFixed(0)}%
                  </span>
                  <span className="text-[7px] text-muted-foreground">{pair.lagMinutes}m lag</span>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
