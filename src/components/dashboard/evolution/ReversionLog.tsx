import { motion } from 'framer-motion';
import { RotateCcw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ReversionCheckpoint } from '@/lib/agents/evolutionTypes';
import { AgentId } from '@/lib/agents/types';

interface ReversionLogProps {
  checkpoints: ReversionCheckpoint[];
}

const AGENT_META: Record<AgentId, { name: string; icon: string }> = {
  'equities-alpha': { name: 'Alpha Engine', icon: '📈' },
  'forex-macro': { name: 'Macro Pulse', icon: '🌐' },
  'crypto-momentum': { name: 'Momentum Grid', icon: '⚡' },
};

export const ReversionLog = ({ checkpoints }: ReversionLogProps) => {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[hsl(var(--neural-red))]" />
          Reversion Checkpoints
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Models forced to revert when drifting outside validated performance zones
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {checkpoints.map((cp, i) => {
            const agent = AGENT_META[cp.agentId];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-3 rounded-lg bg-muted/10 border border-border/30"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{agent.icon}</span>
                    <span className="text-xs font-medium text-foreground">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1.5 py-0',
                        cp.performanceDelta < 0
                          ? 'bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30'
                          : 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30'
                      )}
                    >
                      {cp.performanceDelta >= 0 ? '+' : ''}{(cp.performanceDelta * 100).toFixed(1)}%
                    </Badge>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(cp.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{cp.reason}</p>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
