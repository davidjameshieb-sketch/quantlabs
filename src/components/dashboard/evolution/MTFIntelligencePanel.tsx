import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, ArrowUpRight, ArrowDownRight, AlertTriangle, Shield, Target, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createMTFMetaControllerState } from '@/lib/agents/mtfMetaController';
import type { MTFMetaControllerState, TimeframeLayer, TimeframeAlignmentState, LeakageCategory } from '@/lib/agents/mtfTypes';

const LAYER_LABELS: Record<TimeframeLayer, { label: string; icon: React.ReactNode; color: string }> = {
  HTF: { label: 'Higher TF', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-[hsl(var(--neural-purple))]' },
  MTF: { label: 'Swing TF', icon: <Activity className="w-3.5 h-3.5" />, color: 'text-[hsl(var(--neural-cyan))]' },
  LTF: { label: 'Execution TF', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-[hsl(var(--neural-orange))]' },
};

const ALIGNMENT_COLORS: Record<TimeframeAlignmentState, string> = {
  'fully-aligned': 'text-[hsl(var(--neural-green))]',
  'partially-aligned': 'text-[hsl(var(--neural-cyan))]',
  'conflicting': 'text-[hsl(var(--neural-orange))]',
  'diverging': 'text-[hsl(var(--neural-red))]',
};

const ALIGNMENT_BG: Record<TimeframeAlignmentState, string> = {
  'fully-aligned': 'bg-[hsl(var(--neural-green))]/10 border-[hsl(var(--neural-green))]/20',
  'partially-aligned': 'bg-[hsl(var(--neural-cyan))]/10 border-[hsl(var(--neural-cyan))]/20',
  'conflicting': 'bg-[hsl(var(--neural-orange))]/10 border-[hsl(var(--neural-orange))]/20',
  'diverging': 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20',
};

const LEAKAGE_LABELS: Record<string, string> = {
  'htf-continuation-ignored': 'HTF Continuation Ignored',
  'mtf-regime-misclassification': 'MTF Regime Misclass.',
  'ltf-reversal-ignored': 'LTF Reversal Ignored',
  'cross-tf-volatility-divergence': 'Cross-TF Vol. Divergence',
  'conflicting-tf-exit': 'Conflicting TF Exit',
};

export const MTFIntelligencePanel = () => {
  const mtfState = useMemo(() => createMTFMetaControllerState(), []);

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <KPIStrip state={mtfState} />

      {/* Row 1: Structural Map + Alignment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StructuralMapCard state={mtfState} />
        <AlignmentCard state={mtfState} />
      </div>

      {/* Row 2: Exit Policy + Leakage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExitPolicyCard state={mtfState} />
        <LeakageCard state={mtfState} />
      </div>

      {/* Row 3: Active Executions */}
      <ExecutionCard state={mtfState} />
    </div>
  );
};

// ─── KPI Strip ───

const KPIStrip = ({ state }: { state: MTFMetaControllerState }) => {
  const kpis = [
    { label: 'Capture Ratio', value: `${(state.captureRatio * 100).toFixed(1)}%`, color: state.captureRatio > 0.65 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]' },
    { label: 'Duration Efficiency', value: `${(state.tradeDurationEfficiency * 100).toFixed(1)}%`, color: 'text-[hsl(var(--neural-cyan))]' },
    { label: 'Regime Misalignment', value: `${(state.regimeMisalignmentFrequency * 100).toFixed(1)}%`, color: state.regimeMisalignmentFrequency < 0.15 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]' },
    { label: 'Slippage Expectancy', value: `$${state.slippageAdjustedExpectancy.toFixed(0)}/trade`, color: 'text-primary' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => (
        <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
          className="p-3 rounded-xl bg-card/50 border border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
          <p className={cn('text-lg font-mono font-bold', kpi.color)}>{kpi.value}</p>
        </motion.div>
      ))}
    </motion.div>
  );
};

// ─── Structural Map ───

const StructuralMapCard = ({ state }: { state: MTFMetaControllerState }) => {
  const layers: TimeframeLayer[] = ['HTF', 'MTF', 'LTF'];

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          Hierarchical Structural Map
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {layers.map(layer => {
          const structure = state.structuralMap[layer];
          const meta = LAYER_LABELS[layer];
          const isBullish = structure.bias === 'bullish';

          return (
            <div key={layer} className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="text-xs font-semibold">{meta.label}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {structure.timeframe}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {isBullish
                    ? <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" />
                    : <ArrowDownRight className="w-3.5 h-3.5 text-[hsl(var(--neural-red))]" />}
                  <span className={cn('text-xs font-bold', isBullish ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
                    {structure.bias.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Persistence</span>
                  <p className="font-mono font-semibold">{structure.trendPersistenceScore.toFixed(0)}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Momentum</span>
                  <p className="font-mono font-semibold">{(structure.momentumCoherence * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Regime</span>
                  <p className="font-mono font-semibold capitalize">{structure.regimeClassification}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

// ─── Alignment Card ───

const AlignmentCard = ({ state }: { state: MTFMetaControllerState }) => {
  const { alignment } = state;

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          Cross-Timeframe Alignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score */}
        <div className={cn('p-4 rounded-lg border text-center', ALIGNMENT_BG[alignment.state])}>
          <p className={cn('text-3xl font-mono font-bold', ALIGNMENT_COLORS[alignment.state])}>
            {alignment.alignmentScore.toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{alignment.state.replace('-', ' ')}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Directional Agreement', value: `${(alignment.momentumCoherence * 100).toFixed(0)}%` },
            { label: 'Volatility Sync', value: `${(alignment.volatilitySynchronization * 100).toFixed(0)}%` },
            { label: 'Dominant TF', value: alignment.dominantTimeframe },
            { label: 'Conflicts', value: alignment.conflictSources.length.toString() },
          ].map(m => (
            <div key={m.label} className="p-2 rounded-md bg-muted/10 text-center">
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
              <p className="text-sm font-mono font-semibold">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Conflicts */}
        {alignment.conflictSources.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Conflicts</p>
            {alignment.conflictSources.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] p-2 rounded-md bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/10">
                <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))] mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{c.description}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Exit Policy Card ───

const ExitPolicyCard = ({ state }: { state: MTFMetaControllerState }) => {
  const policy = state.activeExitPolicy;

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          Active MTF Exit Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{policy.name}</span>
          <Badge variant="outline" className="text-[10px] capitalize">{policy.trailingMode}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'HTF Runner', active: policy.htfRunnerPermission, detail: `${policy.htfTrailingWidthMultiplier.toFixed(1)}x ATR` },
            { label: 'MTF Swing Trail', active: policy.mtfSwingTrailEnabled, detail: `Threshold: ${(policy.mtfStructuralExitThreshold * 100).toFixed(0)}%` },
            { label: 'LTF Precision', active: policy.ltfPrecisionExitEnabled, detail: `Collapse: ${(policy.ltfMomentumCollapseThreshold * 100).toFixed(0)}%` },
          ].map(m => (
            <div key={m.label} className={cn('p-2 rounded-md border text-center text-[10px]', m.active ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-muted/10 border-border/30')}>
              <p className="font-semibold">{m.label}</p>
              <p className={m.active ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground'}>{m.active ? '● Active' : '○ Off'}</p>
              <p className="text-muted-foreground mt-0.5">{m.detail}</p>
            </div>
          ))}
        </div>

        {/* Partial Scales */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Partial Scale Points</p>
          {policy.partialScalePoints.map((ps, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-muted/10">
              <span className="font-mono">{ps.triggerR}R → {ps.scalePct}%</span>
              <span className="text-muted-foreground">Min HTF: {ps.htfContinuationMinimum}%</span>
            </div>
          ))}
        </div>

        {/* Conflict Exit */}
        <div className="flex items-center justify-between text-[10px] p-2 rounded-md bg-muted/10">
          <span>Conflict Exit Gate</span>
          <span className={policy.conflictExitEnabled ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground'}>
            {policy.conflictExitEnabled ? `Tolerance: ${policy.conflictToleranceThreshold}%` : 'Disabled'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Leakage Card ───

const LeakageCard = ({ state }: { state: MTFMetaControllerState }) => {
  const report = state.latestLeakageReport;

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Leakage Attribution ({report.period})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/10">
            <p className="text-[10px] text-muted-foreground">Avg Capture</p>
            <p className="font-mono font-bold text-sm">{(report.avgCaptureRatio * 100).toFixed(1)}%</p>
          </div>
          <div className="p-2 rounded-md bg-muted/10">
            <p className="text-[10px] text-muted-foreground">Total Leakage</p>
            <p className="font-mono font-bold text-sm text-[hsl(var(--neural-red))]">{report.totalLeakagePct.toFixed(1)}%</p>
          </div>
          <div className="p-2 rounded-md bg-muted/10">
            <p className="text-[10px] text-muted-foreground">Root Cause</p>
            <p className="font-mono font-bold text-sm">{report.timeframeRootCause}</p>
          </div>
        </div>

        {/* Attribution bars */}
        <div className="space-y-2">
          {report.attributions.slice(0, 4).map((attr, i) => {
            const maxLeak = Math.max(...report.attributions.map(a => a.leakagePct));
            const pct = maxLeak > 0 ? (attr.leakagePct / maxLeak) * 100 : 0;

            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">{LEAKAGE_LABELS[attr.category] || attr.category}</span>
                  <span className={cn('font-mono', attr.severity === 'critical' ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-orange))]')}>
                    {attr.leakagePct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div className={cn('h-full rounded-full', attr.severity === 'critical' ? 'bg-[hsl(var(--neural-red))]' : 'bg-[hsl(var(--neural-orange))]')}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recommendations */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recommendations</p>
          {report.recommendations.slice(0, 2).map((rec, i) => (
            <p key={i} className="text-[10px] text-muted-foreground pl-2 border-l-2 border-primary/30">{rec}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Execution Card ───

const ExecutionCard = ({ state }: { state: MTFMetaControllerState }) => {
  const URGENCY_STYLES: Record<string, string> = {
    none: 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))]',
    monitor: 'bg-[hsl(var(--neural-cyan))]/10 text-[hsl(var(--neural-cyan))]',
    prepare: 'bg-[hsl(var(--neural-orange))]/10 text-[hsl(var(--neural-orange))]',
    execute: 'bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))]',
  };

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Active MTF Executions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.activeExecutions.map((exec, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold font-mono">{exec.ticker}</span>
                <Badge className={cn('text-[10px] capitalize', URGENCY_STYLES[exec.exitUrgency])}>
                  {exec.exitUrgency === 'none' ? 'Secure' : exec.exitUrgency}
                </Badge>
              </div>

              {/* TF Sync indicators */}
              <div className="flex gap-2">
                {[
                  { label: 'HTF', ok: exec.htfMomentumStrong },
                  { label: 'MTF', ok: exec.mtfStructureIntact },
                  { label: 'LTF Exit', ok: !exec.ltfExitSignal },
                ].map(ind => (
                  <div key={ind.label} className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full',
                    ind.ok ? 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))]'
                  )}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {ind.label}
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">{exec.exitReason}</p>

              {/* Safety flags */}
              <div className="flex gap-2 flex-wrap">
                {exec.ltfNoiseFiltered && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--neural-cyan))]/10 text-[hsl(var(--neural-cyan))]">
                    LTF Noise Filtered
                  </span>
                )}
                {exec.htfBiasOverrideActive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))]">
                    HTF Override Active
                  </span>
                )}
                {exec.mtfConfirmationPending && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--neural-orange))]/10 text-[hsl(var(--neural-orange))]">
                    Awaiting MTF Confirm
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
