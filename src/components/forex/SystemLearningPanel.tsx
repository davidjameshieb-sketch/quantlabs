// System Learning Status Panel
// Shows edge learning progress, environment confidence, and governance recovery metrics

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  RotateCcw, Eye, Zap, BarChart3, Shield,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  getEdgeLearningSummary,
  type EdgeLearningSummary,
  type LearningState,
  type AdaptiveDeploymentMode,
} from '@/lib/forex/edgeLearningState';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';

interface SystemLearningPanelProps {
  executionMetrics: RealExecutionMetrics | null;
}

const learningStateUI: Record<LearningState, { color: string; icon: React.ElementType; label: string }> = {
  Learning: { color: 'text-blue-400', icon: Brain, label: 'Learning' },
  Stable: { color: 'text-neural-green', icon: CheckCircle2, label: 'Stable' },
  Decaying: { color: 'text-neural-orange', icon: TrendingDown, label: 'Decaying' },
  Reverting: { color: 'text-neural-red', icon: RotateCcw, label: 'Reverting' },
};

const deploymentModeLabels: Record<AdaptiveDeploymentMode, { label: string; color: string }> = {
  OBSERVATION: { label: 'Observation', color: 'text-muted-foreground' },
  DISCOVERY_RISK: { label: 'Discovery Risk', color: 'text-blue-400' },
  SHADOW_LEARNING: { label: 'Shadow Learning', color: 'text-neural-orange' },
  ALLOCATION_WEIGHT: { label: 'Allocation Weight', color: 'text-primary' },
  FULLY_ADAPTIVE: { label: 'Fully Adaptive', color: 'text-neural-green' },
};

export const SystemLearningPanel = ({ executionMetrics }: SystemLearningPanelProps) => {
  const summary = useMemo<EdgeLearningSummary>(() => getEdgeLearningSummary(), []);

  const hasRealData = executionMetrics?.hasData ?? false;
  const totalTrades = executionMetrics
    ? executionMetrics.winCount + executionMetrics.lossCount
    : 0;
  const winRate = executionMetrics?.winRate ?? 0;

  const deploymentInfo = deploymentModeLabels[summary.deploymentMode];

  // Compute a simple "system health" score based on available metrics
  const healthScore = useMemo(() => {
    if (!hasRealData || totalTrades < 5) return null;
    let score = 50; // baseline
    // Win rate contribution
    if (winRate >= 0.55) score += 15;
    else if (winRate >= 0.45) score += 5;
    else score -= 10;
    // Edge confidence contribution
    score += Math.round(summary.avgEdgeConfidence * 20);
    // Stable environments boost
    score += summary.stableCount * 5;
    // Decaying penalty
    score -= summary.decayingCount * 3;
    // Reverting penalty
    score -= summary.revertingCount * 8;
    return Math.max(0, Math.min(100, score));
  }, [hasRealData, totalTrades, winRate, summary]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-gradient-to-br from-card/80 to-card/40 border border-border/50 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">SYSTEM LEARNING STATUS</h3>
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', deploymentInfo.color)}>
            {deploymentInfo.label}
          </Badge>
        </div>
        <span className="text-[9px] text-muted-foreground">
          {summary.totalTradesProcessed} trades processed
        </span>
      </div>

      {/* Environment Learning Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatBox
          icon={BarChart3}
          label="Environments"
          value={summary.totalEnvironments.toString()}
          color="text-foreground"
        />
        <StatBox
          icon={Brain}
          label="Learning"
          value={summary.learningCount.toString()}
          color="text-blue-400"
        />
        <StatBox
          icon={CheckCircle2}
          label="Stable"
          value={summary.stableCount.toString()}
          color="text-neural-green"
        />
        <StatBox
          icon={TrendingDown}
          label="Decaying"
          value={summary.decayingCount.toString()}
          color="text-neural-orange"
        />
        <StatBox
          icon={RotateCcw}
          label="Reverting"
          value={summary.revertingCount.toString()}
          color="text-neural-red"
        />
      </div>

      {/* Edge Confidence Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" /> Avg Edge Confidence
          </span>
          <span className="text-[10px] font-mono font-bold text-foreground">
            {(summary.avgEdgeConfidence * 100).toFixed(0)}%
          </span>
        </div>
        <Progress
          value={summary.avgEdgeConfidence * 100}
          className="h-1.5"
        />
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span>0% — Reverting</span>
          <span>60% — Stable threshold</span>
          <span>100%</span>
        </div>
      </div>

      {/* System Health Score */}
      {healthScore !== null && (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/10 border border-border/30">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-display font-bold border-2',
            healthScore >= 70
              ? 'border-neural-green/50 text-neural-green bg-neural-green/10'
              : healthScore >= 40
              ? 'border-neural-orange/50 text-neural-orange bg-neural-orange/10'
              : 'border-neural-red/50 text-neural-red bg-neural-red/10'
          )}>
            {healthScore}
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-foreground">
              System Health: {healthScore >= 70 ? 'Improving' : healthScore >= 40 ? 'Adapting' : 'Recovering'}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {healthScore >= 70
                ? 'Edge confidence growing — scaling up eligible.'
                : healthScore >= 40
                ? 'Collecting data — environments learning from recent trades.'
                : 'Governance throttled — system reverting weak environments to baseline.'}
            </p>
          </div>
        </div>
      )}

      {/* Top Environments */}
      {summary.topConfidenceEnvironments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" /> Top Environments by Confidence
          </p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {summary.topConfidenceEnvironments.slice(0, 5).map((env, i) => {
              const stateInfo = learningStateUI[env.learningState];
              const StateIcon = stateInfo.icon;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-1 px-2 rounded bg-muted/5 border border-border/20 text-[9px]"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <StateIcon className={cn('w-3 h-3 flex-shrink-0', stateInfo.color)} />
                    <span className="font-mono text-foreground truncate">{env.signature}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn('font-mono', env.expectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {env.expectancy >= 0 ? '+' : ''}{env.expectancy}p
                    </span>
                    <span className="text-muted-foreground">{env.tradeCount} trades</span>
                    <Badge variant="outline" className={cn('text-[8px] px-1 py-0', stateInfo.color)}>
                      {(env.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real execution learning metrics */}
      {hasRealData && (
        <div className="flex items-center gap-4 text-[9px] text-muted-foreground px-1 pt-1 border-t border-border/20">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-2.5 h-2.5" />
            Real Win Rate: <span className={cn('font-mono', winRate >= 0.5 ? 'text-neural-green' : 'text-neural-orange')}>
              {(winRate * 100).toFixed(0)}%
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-2.5 h-2.5" />
            Closed Trades: <span className="font-mono text-foreground">{totalTrades}</span>
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Environments Watched: <span className="font-mono text-foreground">{summary.totalEnvironments}</span>
          </span>
        </div>
      )}
    </motion.div>
  );
};

function StatBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-2 rounded-lg bg-muted/10 border border-border/30 text-center space-y-0.5">
      <Icon className={cn('w-3 h-3 mx-auto', color)} />
      <p className={cn('text-sm font-display font-bold', color)}>{value}</p>
      <p className="text-[8px] text-muted-foreground">{label}</p>
    </div>
  );
}
