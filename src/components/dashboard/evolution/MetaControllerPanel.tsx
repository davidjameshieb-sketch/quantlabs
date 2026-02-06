import { motion } from 'framer-motion';
import { Brain, Eye, Wrench, AlertOctagon, Anchor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MetaControllerState, MetaControllerMode, ModelFreedomLevel } from '@/lib/agents/evolutionTypes';
import { AgentId } from '@/lib/agents/types';

interface MetaControllerPanelProps {
  state: MetaControllerState;
}

const MODE_CONFIG: Record<MetaControllerMode, { label: string; color: string; bg: string; icon: typeof Eye; description: string }> = {
  observing: {
    label: 'OBSERVING',
    color: 'text-[hsl(var(--neural-green))]',
    bg: 'bg-[hsl(var(--neural-green))]/15 border-[hsl(var(--neural-green))]/30',
    icon: Eye,
    description: 'System stable — minimal intervention required',
  },
  adjusting: {
    label: 'ADJUSTING',
    color: 'text-[hsl(var(--neural-orange))]',
    bg: 'bg-[hsl(var(--neural-orange))]/15 border-[hsl(var(--neural-orange))]/30',
    icon: Wrench,
    description: 'Fine-tuning model parameters and allocations',
  },
  intervening: {
    label: 'INTERVENING',
    color: 'text-[hsl(var(--neural-red))]',
    bg: 'bg-[hsl(var(--neural-red))]/15 border-[hsl(var(--neural-red))]/30',
    icon: AlertOctagon,
    description: 'Active restriction on underperforming models',
  },
  stabilizing: {
    label: 'STABILIZING',
    color: 'text-primary',
    bg: 'bg-primary/15 border-primary/30',
    icon: Anchor,
    description: 'Locking in successful adaptations',
  },
};

const AGENT_LABELS: Record<AgentId, { name: string; icon: string }> = {
  'equities-alpha': { name: 'Alpha Engine', icon: '📈' },
  'forex-macro': { name: 'Macro Pulse', icon: '🌐' },
  'crypto-momentum': { name: 'Momentum Grid', icon: '⚡' },
};

const FreedomGauge = ({ freedom }: { freedom: ModelFreedomLevel }) => {
  const agent = AGENT_LABELS[freedom.agentId];
  const fillColor = freedom.freedomScore > 65
    ? 'bg-[hsl(var(--neural-green))]'
    : freedom.freedomScore > 40
      ? 'bg-[hsl(var(--neural-orange))]'
      : 'bg-[hsl(var(--neural-red))]';

  return (
    <div className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{agent.icon}</span>
          <span className="text-xs font-medium text-foreground">{agent.name}</span>
        </div>
        <span className="text-xs font-mono font-bold text-foreground">
          {freedom.freedomScore.toFixed(0)}%
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', fillColor)}
          initial={{ width: 0 }}
          animate={{ width: `${freedom.freedomScore}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Capital: {(freedom.capitalWeight * 100).toFixed(0)}%</span>
        {freedom.restrictionReasons.length > 0 && (
          <span className="text-[hsl(var(--neural-orange))]">
            {freedom.restrictionReasons.length} restriction{freedom.restrictionReasons.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
};

export const MetaControllerPanel = ({ state }: MetaControllerPanelProps) => {
  const modeConfig = MODE_CONFIG[state.mode];
  const ModeIcon = modeConfig.icon;
  const agentIds: AgentId[] = ['equities-alpha', 'forex-macro', 'crypto-momentum'];

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Meta-Controller AI
          </CardTitle>
          <Badge variant="outline" className={cn('text-xs border', modeConfig.bg, modeConfig.color)}>
            <ModeIcon className="w-3 h-3 mr-1" />
            {modeConfig.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{modeConfig.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics Row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Influence', value: `${state.influenceScore.toFixed(0)}%`, color: state.influenceScore > 50 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-green))]' },
            { label: 'Stability', value: `${state.stabilityIndex.toFixed(0)}%`, color: state.stabilityIndex > 75 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]' },
            { label: 'Health', value: `${state.systemHealth.toFixed(0)}%`, color: state.systemHealth > 80 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]' },
            { label: 'Cycle', value: `#${state.evolutionCycle}`, color: 'text-primary' },
          ].map((metric) => (
            <div key={metric.label} className="text-center p-2 rounded-lg bg-muted/10 border border-border/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</p>
              <p className={cn('text-sm font-mono font-bold', metric.color)}>{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Agent Freedom Levels */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Model Freedom Levels</p>
          <div className="space-y-2">
            {agentIds.map((id, i) => (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <FreedomGauge freedom={state.agentFreedom[id]} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Last Governance Action */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Governance Action</p>
          <p className="text-xs text-foreground">{state.lastGovernanceAction}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(state.lastGovernanceTimestamp).toLocaleTimeString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
