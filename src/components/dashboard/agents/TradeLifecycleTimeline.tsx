// Trade Lifecycle Timeline
// Full AI decision timeline showing all 7 phases with contributing agents

import { motion } from 'framer-motion';
import { Clock, CheckCircle, Loader2, Circle, SkipForward } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LifecycleEvent, LIFECYCLE_PHASE_LABELS } from '@/lib/agents/ledgerTypes';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

interface TradeLifecycleTimelineProps {
  lifecycle: LifecycleEvent[];
}

const statusConfig = {
  completed: { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-neural-green border-neural-green/50 text-neural-green', dotColor: 'bg-neural-green' },
  active: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: 'bg-primary border-primary/50 text-primary', dotColor: 'bg-primary' },
  pending: { icon: <Circle className="w-3.5 h-3.5" />, color: 'bg-muted border-border/50 text-muted-foreground', dotColor: 'bg-muted-foreground/30' },
  skipped: { icon: <SkipForward className="w-3.5 h-3.5" />, color: 'bg-muted border-border/50 text-muted-foreground', dotColor: 'bg-muted-foreground/20' },
};

const formatTimestamp = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const TradeLifecycleTimeline = ({ lifecycle }: TradeLifecycleTimelineProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-display font-bold">Trade Lifecycle Timeline</h4>
      </div>

      <div className="relative pl-5 space-y-0">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border/40" />

        {lifecycle.map((event, i) => {
          const config = statusConfig[event.status];
          return (
            <motion.div
              key={event.phase}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative pb-3 last:pb-0"
            >
              {/* Dot */}
              <div className={cn(
                'absolute -left-[12px] top-1.5 w-3 h-3 rounded-full border-2',
                config.dotColor,
                event.status === 'active' && 'ring-2 ring-primary/30'
              )} />

              <div className="ml-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold">{LIFECYCLE_PHASE_LABELS[event.phase]}</span>
                  <Badge
                    variant="outline"
                    className={cn('text-[9px] gap-0.5 px-1.5 py-0', config.color)}
                  >
                    {config.icon}
                    {event.status.toUpperCase()}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{formatTimestamp(event.timestamp)}</span>
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed mb-1">{event.description}</p>

                {/* Contributing agents */}
                {event.contributingAgents.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] text-muted-foreground">Agents:</span>
                    {event.contributingAgents.map(id => {
                      const def = AGENT_DEFINITIONS[id];
                      return (
                        <span key={id} className="text-[10px]" title={def.name}>
                          {def.icon}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
