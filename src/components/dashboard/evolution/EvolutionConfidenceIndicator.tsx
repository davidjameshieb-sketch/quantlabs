import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AgentEvolutionState } from '@/lib/agents/evolutionTypes';
import { AgentId } from '@/lib/agents/types';
import { AGENT_META_MAP } from '@/lib/agents/agentMeta';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';

interface EvolutionConfidenceIndicatorProps {
  evolution: Record<AgentId, AgentEvolutionState>;
}

const TrendIcon = ({ trend }: { trend: 'improving' | 'stable' | 'degrading' }) => {
  if (trend === 'improving') return <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))]" />;
  if (trend === 'degrading') return <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

export const EvolutionConfidenceIndicator = ({ evolution }: EvolutionConfidenceIndicatorProps) => {
  const agentIds = ALL_AGENT_IDS;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Evolution Confidence
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Fitness scores, generation progress, and multi-horizon memory validation
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {agentIds.map((id, i) => {
          const evo = evolution[id];
          const meta = AGENT_META_MAP[id];
          const memory = evo.performanceMemory;
          const ce = evo.confidenceElasticity;

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{meta.icon}</span>
                  <span className="text-xs font-medium text-foreground">{meta.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40">
                    Gen #{evo.generationNumber}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Fitness:</span>
                  <span className={cn(
                    'text-xs font-mono font-bold',
                    evo.fitnessScore > 75 ? 'text-[hsl(var(--neural-green))]' : evo.fitnessScore > 55 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-red))]'
                  )}>
                    {evo.fitnessScore.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* Confidence Elasticity */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Size×', value: ce.tradeSizeMultiplier.toFixed(2) },
                  { label: 'Patience', value: `${(ce.entryPatienceLevel * 100).toFixed(0)}%` },
                  { label: 'Exit Agg.', value: `${(ce.exitAggressiveness * 100).toFixed(0)}%` },
                  { label: 'Signal Life', value: `${ce.signalLifespan}b` },
                ].map((item) => (
                  <div key={item.label} className="text-center py-1 px-1.5 rounded bg-muted/15 border border-border/20">
                    <p className="text-[9px] text-muted-foreground">{item.label}</p>
                    <p className="text-[10px] font-mono font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Memory Horizons */}
              <div className="grid grid-cols-3 gap-1.5">
                {[memory.shortTerm, memory.mediumTerm, memory.longTerm].map((window) => (
                  <div key={window.horizon} className="p-1.5 rounded bg-muted/10 border border-border/20">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-muted-foreground">{window.label}</span>
                      <TrendIcon trend={window.trend} />
                    </div>
                    <p className="text-[10px] font-mono text-foreground">
                      WR: {(window.winRate * 100).toFixed(0)}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      S: {window.sharpe.toFixed(1)} · Q: {(window.signalQuality * 100).toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Mutations: {evo.mutationCount}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] px-1 py-0',
                    memory.validationStatus === 'accepted'
                      ? 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30'
                      : 'bg-[hsl(var(--neural-orange))]/10 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30'
                  )}
                >
                  {memory.validationStatus}
                </Badge>
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
};
