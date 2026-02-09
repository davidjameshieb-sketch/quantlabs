// Shadow Mode Validation Panel
// Visualizes 8 parameter candidates being shadow-tested with promote/reject/extend status

import { motion } from 'framer-motion';
import { FlaskConical, CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown, Shield, Zap, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ShadowModeState, ShadowTestResult } from '@/lib/forex/shadowModeValidator';

interface ShadowModePanelProps {
  state: ShadowModeState;
}

const decisionConfig = {
  'promote': { icon: CheckCircle2, color: 'text-[hsl(var(--neural-green))]', bg: 'bg-[hsl(var(--neural-green))]/10', border: 'border-[hsl(var(--neural-green))]/30', label: 'PROMOTE' },
  'reject': { icon: XCircle, color: 'text-[hsl(var(--neural-red))]', bg: 'bg-[hsl(var(--neural-red))]/10', border: 'border-[hsl(var(--neural-red))]/30', label: 'REJECT' },
  'extend-test': { icon: Clock, color: 'text-[hsl(var(--neural-orange))]', bg: 'bg-[hsl(var(--neural-orange))]/10', border: 'border-[hsl(var(--neural-orange))]/30', label: 'EXTENDING' },
};

const MetricDelta = ({ label, baseline, shadow, higherIsBetter = true }: {
  label: string;
  baseline: number;
  shadow: number;
  higherIsBetter?: boolean;
}) => {
  const delta = shadow - baseline;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <div className="text-center space-y-0.5">
      <p className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-mono text-[10px] text-muted-foreground">{baseline.toFixed(3)}</p>
      <p className={cn('font-mono text-[10px] font-bold', improved ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(3)}
      </p>
    </div>
  );
};

const CandidateCard = ({ result }: { result: ShadowTestResult }) => {
  const cfg = decisionConfig[result.decision];
  const DecisionIcon = cfg.icon;
  const regimePassed = Object.values(result.regimeConsistency).filter(Boolean).length;
  const sessionPassed = Object.values(result.sessionConsistency).filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('p-3 rounded-xl border space-y-2.5', cfg.bg, cfg.border)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold">{result.parameterDelta.name}</span>
        </div>
        <Badge variant="outline" className={cn('text-[9px] font-bold gap-1', cfg.color, cfg.border)}>
          <DecisionIcon className="w-2.5 h-2.5" />{cfg.label}
        </Badge>
      </div>

      {/* Parameter Change */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground font-mono">{result.parameterDelta.currentValue}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono font-bold text-primary">{result.parameterDelta.proposedValue}</span>
        <span className={cn('font-mono text-[9px]',
          result.parameterDelta.changePercent > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]'
        )}>
          ({result.parameterDelta.changePercent > 0 ? '+' : ''}{result.parameterDelta.changePercent.toFixed(1)}%)
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-1.5">
        <MetricDelta label="Capture" baseline={result.baselineCaptureRatio} shadow={result.shadowCaptureRatio} />
        <MetricDelta label="Expectancy" baseline={result.baselineExpectancy} shadow={result.shadowExpectancy} />
        <MetricDelta label="Sharpe" baseline={result.baselineSharpe} shadow={result.shadowSharpe} />
        <MetricDelta label="Drawdown" baseline={result.baselineDrawdown} shadow={result.shadowDrawdown} higherIsBetter={false} />
      </div>

      {/* Regime & Session Consistency */}
      <div className="flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-1.5">
          <Activity className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">Regimes: </span>
          <span className={cn('font-mono font-bold', regimePassed >= 3 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>
            {regimePassed}/4
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">Sessions: </span>
          <span className={cn('font-mono font-bold', sessionPassed >= 3 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>
            {sessionPassed}/4
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">Conf: </span>
          <span className="font-mono font-bold text-foreground">{result.confidence.toFixed(0)}%</span>
        </div>
      </div>

      {/* Decision Reason */}
      <p className="text-[9px] text-muted-foreground leading-relaxed">{result.decisionReason}</p>
    </motion.div>
  );
};

export const ShadowModePanel = ({ state }: ShadowModePanelProps) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          Shadow Mode Validation
          <span className="text-[9px] text-muted-foreground ml-auto font-normal">
            {state.walkForwardPeriod}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-[hsl(var(--neural-green))]/5 border border-[hsl(var(--neural-green))]/20 text-center">
            <p className="text-[9px] text-muted-foreground">Promoted</p>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-green))]">{state.promotedCount}</p>
          </div>
          <div className="p-2 rounded-lg bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/20 text-center">
            <p className="text-[9px] text-muted-foreground">Rejected</p>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-red))]">{state.rejectedCount}</p>
          </div>
          <div className="p-2 rounded-lg bg-[hsl(var(--neural-orange))]/5 border border-[hsl(var(--neural-orange))]/20 text-center">
            <p className="text-[9px] text-muted-foreground">Extending</p>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-orange))]">{state.extendedCount}</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-center">
            <p className="text-[9px] text-muted-foreground">Avg Conf.</p>
            <p className="text-lg font-mono font-bold text-primary">{state.overallConfidence.toFixed(0)}%</p>
          </div>
        </div>

        {/* Candidate Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {state.activeCandidates.map(result => (
            <CandidateCard key={result.parameterDelta.id} result={result} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
