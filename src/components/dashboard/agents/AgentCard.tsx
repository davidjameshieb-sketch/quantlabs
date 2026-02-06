import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, TrendingDown, Crown, Activity, 
  Zap, Clock, Target, BarChart3
} from 'lucide-react';
import { AIAgent, AgentStatus } from '@/lib/agents/types';
import { cn } from '@/lib/utils';
import { formatDollar } from '@/lib/market/backtestEngine';

interface AgentCardProps {
  agent: AIAgent;
  isSelected: boolean;
  onClick: () => void;
}

const statusColors: Record<AgentStatus, string> = {
  leading: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  active: 'bg-primary/20 text-primary border-primary/30',
  analyzing: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  idle: 'bg-muted text-muted-foreground border-border/50',
};

const statusLabels: Record<AgentStatus, string> = {
  leading: 'LEADING',
  active: 'ACTIVE',
  analyzing: 'ANALYZING',
  idle: 'IDLE',
};

export const AgentCard = ({ agent, isSelected, onClick }: AgentCardProps) => {
  const perf = agent.performance;
  const latestDecision = agent.recentDecisions[0];
  const timeSinceAnalysis = Math.floor((Date.now() - agent.lastAnalysis) / 60000);

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <Card 
        className={cn(
          'cursor-pointer transition-all border-border/50 bg-card/50 hover:bg-card/80',
          isSelected && 'ring-2 ring-primary border-primary/50',
          agent.isLeading && 'border-neural-green/30'
        )}
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{agent.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-base">{agent.name}</h3>
                  {agent.isLeading && <Crown className="w-4 h-4 text-neural-green" />}
                </div>
                <p className="text-xs text-muted-foreground">{agent.model}</p>
              </div>
            </div>
            <Badge variant="outline" className={cn('text-xs', statusColors[agent.status])}>
              {agent.status === 'leading' && <Activity className="w-3 h-3 mr-1 animate-pulse" />}
              {statusLabels[agent.status]}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className={cn(
                'text-lg font-bold font-display',
                perf.winRate > 0.55 ? 'text-neural-green' : perf.winRate < 0.45 ? 'text-neural-red' : 'text-neural-orange'
              )}>
                {(perf.winRate * 100).toFixed(0)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total P&L</p>
              <p className={cn(
                'text-lg font-bold font-display',
                perf.totalPnl >= 0 ? 'text-neural-green' : 'text-neural-red'
              )}>
                {formatDollar(perf.totalPnl)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Sharpe</p>
              <p className={cn(
                'text-lg font-bold font-display',
                perf.sharpeRatio > 1.5 ? 'text-neural-green' : perf.sharpeRatio > 0.8 ? 'text-neural-orange' : 'text-neural-red'
              )}>
                {perf.sharpeRatio.toFixed(1)}
              </p>
            </div>
          </div>
          
          {/* Coordination Score */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Coordination Score</span>
              <span className="font-medium">{agent.coordinationScore}/100</span>
            </div>
            <Progress value={agent.coordinationScore} className="h-1.5" />
          </div>

          {/* Latest Decision */}
          {latestDecision && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2">
                {latestDecision.bias === 'bullish' 
                  ? <TrendingUp className="w-3.5 h-3.5 text-neural-green" />
                  : <TrendingDown className="w-3.5 h-3.5 text-neural-red" />
                }
                <span className="text-xs font-medium">{latestDecision.ticker}</span>
                <span className={cn(
                  'text-xs font-bold uppercase',
                  latestDecision.bias === 'bullish' ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {latestDecision.bias}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {latestDecision.confidence.toFixed(0)}%
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              <span>{perf.totalTrades} trades</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{timeSinceAnalysis}m ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
