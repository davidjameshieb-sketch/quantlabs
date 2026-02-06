import { motion } from 'framer-motion';
import { ArrowRight, Brain, Shield, Sparkles, Activity, Dna } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MetaControllerState, MetaControllerMode } from '@/lib/agents/evolutionTypes';

interface MetaControllerSummaryProps {
  state: MetaControllerState;
  totalMutations: number;
  survivalRate: number;
}

const MODE_CONFIG: Record<MetaControllerMode, { label: string; color: string; bg: string }> = {
  observing: { label: 'OBSERVING', color: 'text-[hsl(var(--neural-green))]', bg: 'bg-[hsl(var(--neural-green))]/15 border-[hsl(var(--neural-green))]/30' },
  adjusting: { label: 'ADJUSTING', color: 'text-[hsl(var(--neural-orange))]', bg: 'bg-[hsl(var(--neural-orange))]/15 border-[hsl(var(--neural-orange))]/30' },
  intervening: { label: 'INTERVENING', color: 'text-[hsl(var(--neural-red))]', bg: 'bg-[hsl(var(--neural-red))]/15 border-[hsl(var(--neural-red))]/30' },
  stabilizing: { label: 'STABILIZING', color: 'text-primary', bg: 'bg-primary/15 border-primary/30' },
};

export const MetaControllerSummary = ({ state, totalMutations, survivalRate }: MetaControllerSummaryProps) => {
  const mode = MODE_CONFIG[state.mode];
  const anchorsArr = Object.values(state.riskAnchors);
  const safeAnchors = anchorsArr.filter(a => a.status === 'safe').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--neural-purple))]/10 border border-[hsl(var(--neural-purple))]/20">
            <Dna className="w-5 h-5 text-[hsl(var(--neural-purple))]" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Adaptive Evolution</h2>
            <p className="text-xs text-muted-foreground">Meta-Controller governed ecosystem intelligence</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="border-border/50 gap-2">
          <Link to="/dashboard/evolution">
            Evolution Dashboard
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Meta-Controller Mode */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Controller</p>
            </div>
            <Badge variant="outline" className={cn('text-xs border', mode.bg, mode.color)}>
              {mode.label}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-1">
              Influence: {state.influenceScore.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        {/* Risk Anchors */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Anchors</p>
            </div>
            <p className="text-lg font-mono font-bold text-foreground">
              {safeAnchors}/{anchorsArr.length}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Stability: {state.stabilityIndex.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        {/* Mutations */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--neural-orange))]" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mutations</p>
            </div>
            <p className="text-lg font-mono font-bold text-foreground">{totalMutations}</p>
            <p className="text-[10px] text-muted-foreground">
              Survival: {(survivalRate * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Health</p>
            </div>
            <p className={cn(
              'text-lg font-mono font-bold',
              state.systemHealth > 80 ? 'text-[hsl(var(--neural-green))]' : state.systemHealth > 60 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-red))]'
            )}>
              {state.systemHealth.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              Cycle #{state.evolutionCycle}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Last Action */}
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Last Governance Action</p>
        <p className="text-xs text-foreground">{state.lastGovernanceAction}</p>
      </div>
    </motion.div>
  );
};
