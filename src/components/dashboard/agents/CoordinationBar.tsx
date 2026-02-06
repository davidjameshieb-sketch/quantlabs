import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Crown, Activity, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { CoordinationState } from '@/lib/agents/types';
import { cn } from '@/lib/utils';

interface CoordinationBarProps {
  coordination: CoordinationState;
}

const regimeColors: Record<string, string> = {
  trending: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  ranging: 'bg-primary/20 text-primary border-primary/30',
  volatile: 'bg-neural-red/20 text-neural-red border-neural-red/30',
  quiet: 'bg-muted text-muted-foreground border-border/50',
};

const regimeIcons: Record<string, React.ReactNode> = {
  trending: <TrendingUp className="w-3.5 h-3.5" />,
  ranging: <Activity className="w-3.5 h-3.5" />,
  volatile: <Zap className="w-3.5 h-3.5" />,
  quiet: <Activity className="w-3.5 h-3.5" />,
};

export const CoordinationBar = ({ coordination }: CoordinationBarProps) => {
  const leader = coordination.agents[coordination.leadingAgent];
  const agents = Object.values(coordination.agents);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-card to-muted/30 border border-border/50"
    >
      {/* Leader indicator */}
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-neural-green" />
        <span className="text-sm font-medium">
          <span className="text-muted-foreground">Lead:</span>{' '}
          <span className={leader.color}>{leader.name}</span>
        </span>
      </div>
      
      <div className="w-px h-5 bg-border/50 hidden sm:block" />
      
      {/* Consensus */}
      <div className="flex items-center gap-2">
        {coordination.consensusBias === 'bullish' 
          ? <TrendingUp className="w-4 h-4 text-neural-green" />
          : <TrendingDown className="w-4 h-4 text-neural-red" />
        }
        <span className="text-sm">
          <span className="text-muted-foreground">Consensus:</span>{' '}
          <span className={cn(
            'font-bold uppercase',
            coordination.consensusBias === 'bullish' ? 'text-neural-green' : 'text-neural-red'
          )}>
            {coordination.consensusBias}
          </span>
          {' '}
          <span className="text-muted-foreground text-xs">
            ({coordination.consensusConfidence.toFixed(0)}%)
          </span>
        </span>
      </div>
      
      <div className="w-px h-5 bg-border/50 hidden sm:block" />
      
      {/* Market Regime */}
      <Badge variant="outline" className={cn('text-xs gap-1', regimeColors[coordination.marketRegime])}>
        {regimeIcons[coordination.marketRegime]}
        {coordination.marketRegime.toUpperCase()} REGIME
      </Badge>
      
      {/* Agent scores */}
      <div className="flex items-center gap-2 ml-auto">
        {agents.map(a => (
          <div 
            key={a.id}
            className="flex items-center gap-1 text-xs"
            title={`${a.name}: ${a.coordinationScore}/100`}
          >
            <span>{a.icon}</span>
            <span className={cn(
              'font-mono font-bold',
              a.isLeading ? 'text-neural-green' : 'text-muted-foreground'
            )}>
              {a.coordinationScore}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
