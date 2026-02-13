import { motion } from 'framer-motion';
import { Layers, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

function ttlLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function DynamicGatesRegistry({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">Self-Synthesized Gates</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[8px] border-[hsl(var(--neural-purple))]/40 text-[hsl(var(--neural-purple))]">
            {state.dynamicGates.length} active
          </Badge>
          <Badge variant="outline" className="text-[8px] text-muted-foreground">
            {state.totalGatesCreated} total created
          </Badge>
        </div>
      </div>

      {state.dynamicGates.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Zap className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-[10px]">No self-synthesized gates active</p>
          <p className="text-[8px]">The Sovereign Intelligence creates gates when failure patterns emerge</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
          {state.dynamicGates.map((gate, i) => (
            <motion.div
              key={gate.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-3 rounded-lg border border-[hsl(var(--neural-purple))]/20 bg-[hsl(var(--neural-purple))]/5 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[hsl(var(--neural-purple))]" />
                  <span className="text-[11px] font-mono font-bold text-[hsl(var(--neural-purple))]">{gate.gateId}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {gate.pair && (
                    <Badge variant="outline" className="text-[7px]">{gate.pair}</Badge>
                  )}
                  <div className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{ttlLabel(gate.expiresAt)}</span>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                {typeof gate.parsedReason === 'object' && gate.parsedReason.reason
                  ? String(gate.parsedReason.reason)
                  : gate.reason.slice(0, 120)}
              </p>
              <p className="text-[7px] text-muted-foreground/60">
                Created: {new Date(gate.createdAt).toLocaleString()}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
