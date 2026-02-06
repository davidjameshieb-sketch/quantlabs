import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap, 
  Shield,
  BarChart3,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createAgents, getCoordinationState } from '@/lib/agents/agentEngine';
import { UpgradeBadge } from './UpgradeBadge';

const REGIME_CONFIG = {
  trending: { label: 'TRENDING', color: 'text-[hsl(var(--neural-green))]', bg: 'bg-[hsl(var(--neural-green))]/15 border-[hsl(var(--neural-green))]/30', icon: TrendingUp },
  ranging: { label: 'RANGING', color: 'text-[hsl(var(--neural-orange))]', bg: 'bg-[hsl(var(--neural-orange))]/15 border-[hsl(var(--neural-orange))]/30', icon: Activity },
  volatile: { label: 'VOLATILE', color: 'text-[hsl(var(--neural-red))]', bg: 'bg-[hsl(var(--neural-red))]/15 border-[hsl(var(--neural-red))]/30', icon: Zap },
  quiet: { label: 'QUIET', color: 'text-muted-foreground', bg: 'bg-muted/30 border-border/50', icon: Shield },
};

export const AIIntelligencePanel = () => {
  const { coordination, agents } = useMemo(() => {
    const agentsData = createAgents();
    const coord = getCoordinationState(agentsData);
    return { coordination: coord, agents: Object.values(agentsData) };
  }, []);

  const regime = REGIME_CONFIG[coordination.marketRegime];
  const RegimeIcon = regime.icon;
  const leadingAgent = agents.find(a => a.id === coordination.leadingAgent);

  // Get latest decisions across all agents
  const latestDecisions = useMemo(() => {
    return agents
      .flatMap(a => a.recentDecisions.map(d => ({ ...d, agentName: a.name, agentIcon: a.icon })))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4);
  }, [agents]);

  return (
    <div className="space-y-4">
      {/* AI Coordination Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">AI Intelligence Layer</h2>
            <p className="text-xs text-muted-foreground">Multi-agent coordination — transparent & measurable</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="border-border/50 gap-2">
          <Link to="/dashboard/agents">
            Full AI Dashboard
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      {/* Top row: Market Regime + Consensus + Leading AI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Market Regime */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Market Mode</p>
            <div className="flex items-center gap-2">
              <div className={cn('p-1.5 rounded-md border', regime.bg)}>
                <RegimeIcon className={cn('w-4 h-4', regime.color)} />
              </div>
              <span className={cn('font-display text-lg font-bold', regime.color)}>
                {regime.label}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Consensus Bias */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">AI Consensus</p>
            <div className="flex items-center gap-2">
              {coordination.consensusBias === 'bullish' ? (
                <TrendingUp className="w-5 h-5 text-[hsl(var(--neural-green))]" />
              ) : (
                <TrendingDown className="w-5 h-5 text-[hsl(var(--neural-red))]" />
              )}
              <span className={cn(
                'font-display text-lg font-bold uppercase',
                coordination.consensusBias === 'bullish' ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
              )}>
                {coordination.consensusBias}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                {coordination.consensusConfidence.toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Leading AI */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Leading AI</p>
            <div className="flex items-center gap-2">
              <span className="text-xl">{leadingAgent?.icon}</span>
              <div>
                <p className="font-display font-bold text-foreground text-sm">{leadingAgent?.name}</p>
                <p className="text-xs text-muted-foreground">{leadingAgent?.model}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {agents.map((agent, index) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className={cn(
              'bg-card/50 border-border/50 transition-all',
              agent.isLeading && 'border-primary/40 bg-primary/5'
            )}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{agent.icon}</span>
                    <div>
                      <p className="font-display font-semibold text-sm text-foreground">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.model}</p>
                    </div>
                  </div>
                  {agent.isLeading && (
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                      Leading
                    </Badge>
                  )}
                </div>

                {/* Active strategy blocks */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.strategyBlocks
                    .filter(b => b.active)
                    .slice(0, 3)
                    .map(block => (
                      <span
                        key={block.id}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border/30"
                      >
                        {block.name}
                      </span>
                    ))}
                </div>

                {/* Performance summary */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Win Rate: <span className="font-medium text-foreground">{(agent.performance.winRate * 100).toFixed(1)}%</span>
                  </span>
                  <span className="text-muted-foreground">
                    Sharpe: <span className="font-medium text-foreground">{agent.performance.sharpeRatio.toFixed(2)}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Latest AI Decisions */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary" />
              Latest AI Decisions
            </CardTitle>
            <UpgradeBadge feature="aiDecisionOverlays" label="Full Overlays" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {latestDecisions.map((decision, i) => (
              <motion.div
                key={`${decision.ticker}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/20 border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm">{decision.agentIcon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/dashboard/ticker/${decision.ticker}`}
                        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {decision.ticker}
                      </Link>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          decision.bias === 'bullish'
                            ? 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30'
                            : 'bg-[hsl(var(--neural-red))]/15 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30'
                        )}
                      >
                        {decision.bias}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[300px]">
                      {decision.reasoning}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{decision.confidence.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">{decision.efficiency}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
