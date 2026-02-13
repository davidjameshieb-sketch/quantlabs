import { motion } from 'framer-motion';
import { History, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

const STATUS_COLORS = {
  ACTIVE: 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/40',
  EXPIRED: 'text-muted-foreground border-border/40',
  REVOKED: 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/40',
};

export function EvolutionAuditLog({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">Evolution Audit Log</h3>
        </div>
        <Badge variant="outline" className="text-[8px] text-muted-foreground">
          {state.totalAutonomousActions} total actions
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg border border-border/30 text-center">
          <p className="text-lg font-mono font-bold text-foreground">{state.agentsSuspended}</p>
          <p className="text-[8px] text-muted-foreground">Agents Suspended</p>
        </div>
        <div className="p-2 rounded-lg border border-border/30 text-center">
          <p className="text-lg font-mono font-bold text-foreground">{state.sessionsBlacklisted}</p>
          <p className="text-[8px] text-muted-foreground">Sessions Blocked</p>
        </div>
        <div className="p-2 rounded-lg border border-border/30 text-center">
          <p className="text-lg font-mono font-bold text-foreground">{state.totalGatesCreated}</p>
          <p className="text-[8px] text-muted-foreground">Gates Created</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-1">
        {state.evolutionEvents.map((event, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/5 hover:bg-muted/10 transition-colors"
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center shrink-0">
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                event.action === 'ACTIVE' ? 'bg-[hsl(var(--neural-green))]' :
                event.action === 'REVOKED' ? 'bg-[hsl(var(--neural-red))]' :
                'bg-muted-foreground/40'
              )} />
              {i < state.evolutionEvents.length - 1 && (
                <div className="w-px h-4 bg-border/30 mt-0.5" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono text-foreground truncate">{event.detail}</span>
            </div>

            {/* Status + Time */}
            <Badge variant="outline" className={cn('text-[7px] shrink-0', STATUS_COLORS[event.action as keyof typeof STATUS_COLORS] || 'text-muted-foreground')}>
              {event.action}
            </Badge>
            <span className="text-[7px] text-muted-foreground shrink-0 w-14 text-right">
              {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
