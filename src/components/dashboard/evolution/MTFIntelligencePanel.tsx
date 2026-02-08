import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Layers, ArrowUpRight, ArrowDownRight, AlertTriangle, Shield,
  Target, Zap, Activity, TrendingUp, Clock, BarChart3, Gauge,
  Timer, DollarSign, Brain, CheckCircle2, XCircle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createMTFMetaControllerState, createShadowComparison } from '@/lib/agents/mtfMetaController';
import { createExitEfficiencyState } from '@/lib/agents/exitEfficiencyEngine';
import { createTradeDurationOptimizerState } from '@/lib/agents/tradeDurationOptimizer';
import { createEnhancedForensicReport } from '@/lib/agents/enhancedForensicAuditor';
import type { MTFMetaControllerState, TimeframeLayer, TimeframeAlignmentState } from '@/lib/agents/mtfTypes';
import type { ExitEfficiencyState } from '@/lib/agents/exitEfficiencyEngine';
import type { TradeDurationOptimizerState } from '@/lib/agents/tradeDurationOptimizer';
import type { EnhancedForensicReport, EnhancedLeakageCategory } from '@/lib/agents/enhancedForensicAuditor';

// ─── Constants ───

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
  'late-exit-timing': 'Late Exit Timing',
  'premature-runner-termination': 'Premature Runner Kill',
  'time-stagnation-decay': 'Time Stagnation Decay',
  'regime-mismatch-exit': 'Regime Mismatch Exit',
  'volatility-misalignment-trailing': 'Vol. Misalignment Trail',
  'cross-tf-signal-conflict': 'Cross-TF Conflict',
  'htf-continuation-ignored': 'HTF Continuation Ignored',
  'mtf-regime-misclassification': 'MTF Regime Misclass.',
  'ltf-reversal-ignored': 'LTF Reversal Ignored',
  'cross-tf-volatility-divergence': 'Cross-TF Vol. Divergence',
  'conflicting-tf-exit': 'Conflicting TF Exit',
};

// ─── Main Component ───

export const MTFIntelligencePanel = () => {
  const mtfState = useMemo(() => createMTFMetaControllerState(), []);
  const exitState = useMemo(() => createExitEfficiencyState(), []);
  const durationState = useMemo(() => createTradeDurationOptimizerState(), []);
  const forensicReport = useMemo(() => createEnhancedForensicReport(), []);
  const shadowComparison = useMemo(() => createShadowComparison(mtfState.activeExitPolicy), [mtfState.activeExitPolicy]);

  return (
    <div className="space-y-4">
      {/* Master KPI Strip */}
      <MasterKPIStrip mtf={mtfState} exit={exitState} duration={durationState} forensic={forensicReport} />

      {/* Sub-tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          <TabsTrigger value="exit-engine" className="text-[11px]">Exit Engine</TabsTrigger>
          <TabsTrigger value="duration" className="text-[11px]">Duration</TabsTrigger>
          <TabsTrigger value="forensics" className="text-[11px]">Forensics</TabsTrigger>
          <TabsTrigger value="shadow" className="text-[11px]">Shadow Mode</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StructuralMapCard state={mtfState} />
            <AlignmentCard state={mtfState} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ExitPolicyCard state={mtfState} />
            <ExecutionCard state={mtfState} />
          </div>
        </TabsContent>

        <TabsContent value="exit-engine" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VolatilityTrailingCard exit={exitState} />
            <TimeDecayCard exit={exitState} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RunnerProtectionCard exit={exitState} />
            <PartialProfitCard exit={exitState} />
          </div>
          <ReversalConfirmationCard exit={exitState} />
        </TabsContent>

        <TabsContent value="duration" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DurationBucketsCard duration={durationState} />
            <WinLossDurationCard duration={durationState} />
          </div>
          <StagnationEventsCard duration={durationState} />
          <MomentumPersistenceCard duration={durationState} />
        </TabsContent>

        <TabsContent value="forensics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ForensicLeakageCard forensic={forensicReport} />
            <ExitGradeCard forensic={forensicReport} />
          </div>
          <AgentPerformanceCard forensic={forensicReport} />
        </TabsContent>

        <TabsContent value="shadow" className="space-y-4">
          <ShadowComparisonCard
            baseline={shadowComparison.baselinePolicy}
            candidate={shadowComparison.candidatePolicy}
            baselineCR={shadowComparison.baselineCaptureRatio}
            candidateCR={shadowComparison.candidateCaptureRatio}
            baselineGB={shadowComparison.baselineGiveBack}
            candidateGB={shadowComparison.candidateGiveBack}
            baselineCL={shadowComparison.baselineConflictLosses}
            candidateCL={shadowComparison.candidateConflictLosses}
            samples={shadowComparison.tradeSamples}
            ready={shadowComparison.promotionReady}
            reason={shadowComparison.promotionReason}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Master KPI Strip ───

const MasterKPIStrip = ({ mtf, exit, duration, forensic }: {
  mtf: MTFMetaControllerState;
  exit: ExitEfficiencyState;
  duration: TradeDurationOptimizerState;
  forensic: EnhancedForensicReport;
}) => {
  const kpis = [
    { label: 'Capture Ratio', value: `${(mtf.captureRatio * 100).toFixed(1)}%`, color: mtf.captureRatio > 0.65 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]', icon: <Target className="w-3.5 h-3.5" /> },
    { label: 'Sharpe Ratio', value: exit.sharpeRatio.toFixed(2), color: exit.sharpeRatio > 1.5 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-cyan))]', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { label: 'Profit Factor', value: exit.profitFactor.toFixed(2), color: exit.profitFactor > 2.0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { label: 'Duration Efficiency', value: `${(duration.avgDurationEfficiency * 100).toFixed(0)}%`, color: 'text-[hsl(var(--neural-cyan))]', icon: <Timer className="w-3.5 h-3.5" /> },
    { label: 'Exit Consistency', value: `${exit.exitConsistencyScore.toFixed(0)}%`, color: exit.exitConsistencyScore > 75 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]', icon: <Gauge className="w-3.5 h-3.5" /> },
    { label: 'Capital Utilization', value: `${(exit.capitalUtilizationSpeed * 100).toFixed(0)}%`, color: 'text-primary', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { label: 'Avg Exit Grade', value: forensic.avgExitLatencyGrade, color: forensic.avgExitLatencyGrade === 'A' ? 'text-[hsl(var(--neural-green))]' : forensic.avgExitLatencyGrade === 'B' ? 'text-[hsl(var(--neural-cyan))]' : 'text-[hsl(var(--neural-orange))]', icon: <Brain className="w-3.5 h-3.5" /> },
    { label: 'Dur-Adj Sharpe', value: duration.durationAdjustedSharpe.toFixed(2), color: 'text-[hsl(var(--neural-purple))]', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {kpis.map((kpi, i) => (
        <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
          className="p-2.5 rounded-xl bg-card/50 border border-border/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">{kpi.icon}<span className="text-[9px] uppercase tracking-wider">{kpi.label}</span></div>
          <p className={cn('text-base font-mono font-bold', kpi.color)}>{kpi.value}</p>
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
        <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />Hierarchical Structural Map</CardTitle>
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
                  <Badge variant="outline" className="text-[10px] px-1.5">{structure.timeframe}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {isBullish ? <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" /> : <ArrowDownRight className="w-3.5 h-3.5 text-[hsl(var(--neural-red))]" />}
                  <span className={cn('text-xs font-bold', isBullish ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{structure.bias.toUpperCase()}</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">Persistence</span><p className="font-mono font-semibold">{structure.trendPersistenceScore.toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Momentum</span><p className="font-mono font-semibold">{(structure.momentumCoherence * 100).toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Regime</span><p className="font-mono font-semibold capitalize">{structure.regimeClassification}</p></div>
                <div><span className="text-muted-foreground">Efficiency</span><p className="font-mono font-semibold capitalize">{structure.efficiency}</p></div>
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
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Cross-Timeframe Alignment</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('p-4 rounded-lg border text-center', ALIGNMENT_BG[alignment.state])}>
          <p className={cn('text-3xl font-mono font-bold', ALIGNMENT_COLORS[alignment.state])}>{alignment.alignmentScore.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{alignment.state.replace('-', ' ')}</p>
        </div>
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
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-[hsl(var(--neural-green))]" />Active MTF Exit Policy</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{policy.name}</span>
          <Badge variant="outline" className="text-[10px] capitalize">{policy.trailingMode}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'HTF Runner', active: policy.htfRunnerPermission, detail: `${policy.htfTrailingWidthMultiplier.toFixed(1)}x ATR` },
            { label: 'MTF Trail', active: policy.mtfSwingTrailEnabled, detail: `${(policy.mtfStructuralExitThreshold * 100).toFixed(0)}%` },
            { label: 'LTF Precision', active: policy.ltfPrecisionExitEnabled, detail: `${(policy.ltfMomentumCollapseThreshold * 100).toFixed(0)}%` },
          ].map(m => (
            <div key={m.label} className={cn('p-2 rounded-md border text-center text-[10px]', m.active ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-muted/10 border-border/30')}>
              <p className="font-semibold">{m.label}</p>
              <p className={m.active ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground'}>{m.active ? '● Active' : '○ Off'}</p>
              <p className="text-muted-foreground mt-0.5">{m.detail}</p>
            </div>
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
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-[hsl(var(--neural-orange))]" />Active MTF Executions</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.activeExecutions.map((exec, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold font-mono">{exec.ticker}</span>
                <Badge className={cn('text-[10px] capitalize', URGENCY_STYLES[exec.exitUrgency])}>{exec.exitUrgency === 'none' ? 'Secure' : exec.exitUrgency}</Badge>
              </div>
              <div className="flex gap-2">
                {[
                  { label: 'HTF', ok: exec.htfMomentumStrong },
                  { label: 'MTF', ok: exec.mtfStructureIntact },
                  { label: 'LTF Exit', ok: !exec.ltfExitSignal },
                ].map(ind => (
                  <div key={ind.label} className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full', ind.ok ? 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))]')}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />{ind.label}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{exec.exitReason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Exit Efficiency Cards ───

const VolatilityTrailingCard = ({ exit }: { exit: ExitEfficiencyState }) => {
  const vt = exit.volatilityTrailing;
  const regimeColors: Record<string, string> = {
    contracting: 'text-[hsl(var(--neural-cyan))]',
    stable: 'text-[hsl(var(--neural-green))]',
    expanding: 'text-[hsl(var(--neural-orange))]',
    explosive: 'text-[hsl(var(--neural-red))]',
  };
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Volatility-Adaptive Trailing</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Regime</p><p className={cn('text-sm font-mono font-semibold capitalize', regimeColors[vt.regime])}>{vt.regime}</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Trail Width</p><p className="text-sm font-mono font-semibold">{vt.trailingWidth.toFixed(2)} ATR</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Adjustment</p><p className="text-sm font-mono font-semibold">{vt.adjustmentFactor.toFixed(2)}x</p></div>
        </div>
        <div className={cn('p-2 rounded-md text-[10px] flex items-center gap-2', vt.htfTrendContinuation ? 'bg-[hsl(var(--neural-green))]/5' : 'bg-muted/10')}>
          {vt.htfTrendContinuation ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--neural-green))]" /> : <XCircle className="w-3 h-3 text-muted-foreground" />}
          <span className="text-muted-foreground">{vt.description}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const TimeDecayCard = ({ exit }: { exit: ExitEfficiencyState }) => {
  const td = exit.timeDecay;
  const pct = Math.min(100, (td.currentBarsSinceProgress / td.maxStaleBars) * 100);
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-[hsl(var(--neural-orange))]" />Time Decay Filter</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Bars Since Progress</p><p className="text-sm font-mono font-semibold">{td.currentBarsSinceProgress}/{td.maxStaleBars}</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Stale Penalty</p><p className={cn('text-sm font-mono font-semibold', td.staleTradePenalty > 0 ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{(td.staleTradePenalty * 100).toFixed(0)}%</p></div>
        </div>
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', td.capitalStagnationDetected ? 'bg-[hsl(var(--neural-red))]' : 'bg-[hsl(var(--neural-green))]')} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{td.description}</p>
        </div>
        {td.capitalStagnationDetected && (
          <div className="p-2 rounded-md bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/10 text-[10px] flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))]" />
            <span className="text-[hsl(var(--neural-red))]">Capital stagnation detected — exit recommended</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const RunnerProtectionCard = ({ exit }: { exit: ExitEfficiencyState }) => {
  const rp = exit.runnerProtection;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-[hsl(var(--neural-purple))]" />MTF Runner Protection</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('p-3 rounded-lg border text-center', rp.runnerPermitted ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-[hsl(var(--neural-red))]/5 border-[hsl(var(--neural-red))]/20')}>
          <p className={cn('text-lg font-mono font-bold', rp.runnerPermitted ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{rp.runnerPermitted ? 'RUNNER ACTIVE' : 'RUNNER DISABLED'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">HTF Persistence: {rp.htfPersistenceScore.toFixed(0)}% (min: {rp.htfMinPersistence}%)</p>
        </div>
        {rp.runnerPermitted && (
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Trail Width</span><p className="font-mono font-semibold">{rp.extendedTrailingWidth.toFixed(1)}x ATR</p></div>
            <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Survived</span><p className="font-mono font-semibold">{rp.survivedBars} bars</p></div>
            <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Max Extension</span><p className="font-mono font-semibold">{rp.maxExtension} bars</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PartialProfitCard = ({ exit }: { exit: ExitEfficiencyState }) => {
  const pp = exit.partialProfits;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[hsl(var(--neural-green))]" />Partial Profit Stabilization</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Scaled Out</p><p className="text-sm font-mono font-semibold text-[hsl(var(--neural-green))]">{pp.totalScaled}%</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Runner Remaining</p><p className="text-sm font-mono font-semibold">{pp.runnerRemaining}%</p></div>
        </div>
        <div className="space-y-1.5">
          {pp.tiers.map((tier, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] p-2 rounded-md bg-muted/10">
              <div className="flex items-center gap-2">
                {tier.executedAt ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--neural-green))]" /> : <Clock className="w-3 h-3 text-muted-foreground" />}
                <span className="font-mono">{tier.adjustedTrigger.toFixed(1)}R → {tier.scalePct}%</span>
              </div>
              <span className="text-muted-foreground">{tier.executedAt ? 'Filled' : 'Pending'}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const ReversalConfirmationCard = ({ exit }: { exit: ExitEfficiencyState }) => {
  const rc = exit.reversalConfirmation;
  const checks = [
    { label: 'Structural Break', confirmed: rc.structuralBreakDetected },
    { label: 'Momentum Inversion', confirmed: rc.momentumInversionDetected },
    { label: 'Volatility Shift', confirmed: rc.volatilityShiftDetected },
  ];
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[hsl(var(--neural-red))]" />Reversal Confirmation Exit</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className={cn('p-3 rounded-lg border text-center min-w-[100px]', rc.allConfirmed ? 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20' : 'bg-muted/10 border-border/30')}>
            <p className={cn('text-2xl font-mono font-bold', rc.allConfirmed ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground')}>{rc.confirmationScore}%</p>
            <p className="text-[10px] text-muted-foreground">{rc.allConfirmed ? 'EXIT CONFIRMED' : 'Monitoring'}</p>
          </div>
          <div className="flex-1 space-y-2">
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                {c.confirmed ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--neural-red))]" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className={c.confirmed ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Duration Cards ───

const DurationBucketsCard = ({ duration }: { duration: TradeDurationOptimizerState }) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Timer className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Duration Distribution</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {duration.durationBuckets.map((b, i) => {
          const maxPF = Math.max(...duration.durationBuckets.map(x => x.profitFactor));
          const barWidth = maxPF > 0 ? (b.profitFactor / maxPF) * 100 : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{b.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono">WR: {(b.winRate * 100).toFixed(0)}%</span>
                  <span className={cn('font-mono font-semibold', b.profitFactor > 1.5 ? 'text-[hsl(var(--neural-green))]' : b.profitFactor > 1 ? 'text-[hsl(var(--neural-cyan))]' : 'text-[hsl(var(--neural-red))]')}>PF: {b.profitFactor.toFixed(2)}</span>
                  <span className="text-muted-foreground">n={b.tradeCount}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div className={cn('h-full rounded-full', b.profitFactor > 1.5 ? 'bg-[hsl(var(--neural-green))]' : b.profitFactor > 1 ? 'bg-[hsl(var(--neural-cyan))]' : 'bg-[hsl(var(--neural-red))]')} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

const WinLossDurationCard = ({ duration }: { duration: TradeDurationOptimizerState }) => {
  const wl = duration.winLossComparison;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[hsl(var(--neural-green))]" />Win vs Loss Duration</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-[hsl(var(--neural-green))]/5 border border-[hsl(var(--neural-green))]/20 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Winner</p>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-green))]">{wl.avgWinDuration.toFixed(0)} bars</p>
          </div>
          <div className="p-3 rounded-lg bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/20 text-center">
            <p className="text-[10px] text-muted-foreground">Avg Loser</p>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-red))]">{wl.avgLossDuration.toFixed(0)} bars</p>
          </div>
        </div>
        <div className="p-2 rounded-md bg-muted/10 text-center">
          <p className="text-[10px] text-muted-foreground">Duration Ratio (Win/Loss)</p>
          <p className={cn('text-lg font-mono font-bold', wl.durationRatio > 1.2 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>{wl.durationRatio.toFixed(2)}x</p>
        </div>
        <p className="text-[10px] text-muted-foreground pl-2 border-l-2 border-primary/30">{wl.insight}</p>
      </CardContent>
    </Card>
  );
};

const StagnationEventsCard = ({ duration }: { duration: TradeDurationOptimizerState }) => {
  const events = duration.stagnationEvents;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Capital Stagnation Events
          <Badge variant="outline" className="text-[10px] ml-auto">Cost: ${duration.totalCapitalStagnationCost.toFixed(0)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {events.slice(0, 6).map((e, i) => (
            <div key={i} className="p-2 rounded-md bg-muted/10 border border-border/30 text-[10px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">{e.ticker}</span>
                <Badge variant="outline" className={cn('text-[9px]', e.resolution === 'exited' ? 'text-[hsl(var(--neural-green))]' : e.resolution === 'pending' ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-cyan))]')}>{e.resolution}</Badge>
              </div>
              <p className="text-muted-foreground">{e.durationBars} bars stagnant · ${e.opportunityCost.toFixed(0)} opp. cost</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const MomentumPersistenceCard = ({ duration }: { duration: TradeDurationOptimizerState }) => {
  const mp = duration.momentumPersistence;
  const pct = mp.currentMomentum * 100;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="w-4 h-4 text-[hsl(var(--neural-purple))]" />Momentum Persistence</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Current Momentum</span>
              <span className="font-mono font-semibold">{pct.toFixed(0)}%</span>
            </div>
            <div className="h-3 rounded-full bg-muted/20 overflow-hidden relative">
              <div className="absolute h-full w-0.5 bg-[hsl(var(--neural-red))]/50" style={{ left: `${mp.threshold * 100}%` }} />
              <div className={cn('h-full rounded-full', pct > 60 ? 'bg-[hsl(var(--neural-green))]' : pct > 35 ? 'bg-[hsl(var(--neural-orange))]' : 'bg-[hsl(var(--neural-red))]')} style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div><span className="text-muted-foreground">Decay Rate</span><p className="font-mono font-semibold">{mp.momentumDecayRate.toFixed(3)}/bar</p></div>
              <div><span className="text-muted-foreground">Exit Projection</span><p className="font-mono font-semibold">{mp.projectedExitBar} bars</p></div>
              <div><span className="text-muted-foreground">Dynamic Adj.</span><p className="font-mono font-semibold">{mp.dynamicAdjustment.toFixed(1)}x</p></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Forensic Cards ───

const ForensicLeakageCard = ({ forensic }: { forensic: EnhancedForensicReport }) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Leakage by PnL Impact
          <Badge variant="outline" className="text-[10px] ml-auto text-[hsl(var(--neural-red))]">-${forensic.totalLeakagePnl.toFixed(0)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {forensic.leakageAttributions.slice(0, 5).map((attr, i) => {
          const maxImpact = Math.max(...forensic.leakageAttributions.map(a => a.totalPnlImpact));
          const barWidth = maxImpact > 0 ? (attr.totalPnlImpact / maxImpact) * 100 : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{LEAKAGE_LABELS[attr.category] || attr.category}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-[9px]', attr.severity === 'critical' ? 'text-[hsl(var(--neural-red))]' : attr.severity === 'moderate' ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground')}>{attr.severity}</Badge>
                  <span className="font-mono text-[hsl(var(--neural-red))]">-${attr.totalPnlImpact.toFixed(0)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div className={cn('h-full rounded-full', attr.severity === 'critical' ? 'bg-[hsl(var(--neural-red))]' : 'bg-[hsl(var(--neural-orange))]')} style={{ width: `${barWidth}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground/70 pl-2">{attr.recommendation}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

const ExitGradeCard = ({ forensic }: { forensic: EnhancedForensicReport }) => {
  const grades = forensic.exitGradeDistribution;
  const total = Object.values(grades).reduce((s, v) => s + v, 0);
  const gradeColors: Record<string, string> = { A: 'bg-[hsl(var(--neural-green))]', B: 'bg-[hsl(var(--neural-cyan))]', C: 'bg-[hsl(var(--neural-orange))]', D: 'bg-[hsl(var(--neural-red))]/70', F: 'bg-[hsl(var(--neural-red))]' };

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Exit Quality Distribution</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] text-muted-foreground">Average Grade:</span>
          <span className={cn('text-2xl font-mono font-bold', forensic.avgExitLatencyGrade === 'A' ? 'text-[hsl(var(--neural-green))]' : forensic.avgExitLatencyGrade === 'B' ? 'text-[hsl(var(--neural-cyan))]' : 'text-[hsl(var(--neural-orange))]')}>{forensic.avgExitLatencyGrade}</span>
        </div>
        <div className="space-y-2">
          {(['A', 'B', 'C', 'D', 'F'] as const).map(g => {
            const count = grades[g] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={g} className="flex items-center gap-3 text-[10px]">
                <span className="font-mono font-bold w-4">{g}</span>
                <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
                  <div className={cn('h-full rounded-full', gradeColors[g])} style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-muted-foreground w-12 text-right">{count} ({pct.toFixed(0)}%)</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const AgentPerformanceCard = ({ forensic }: { forensic: EnhancedForensicReport }) => {
  const AGENT_NAMES: Record<string, string> = {
    'equities-alpha': 'Alpha Engine',
    'forex-macro': 'Macro Pulse',
    'crypto-momentum': 'Momentum Grid',
    'liquidity-radar': 'Liquidity Radar',
    'fractal-intelligence': 'Fractal Intelligence',
  };
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-[hsl(var(--neural-purple))]" />Agent Forensic Performance</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {forensic.agentPerformance.map((ap, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{AGENT_NAMES[ap.agentId] || ap.agentId}</span>
                <Badge variant="outline" className="text-[10px]">{ap.tradeCount} trades</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
                <div><span className="text-muted-foreground">Capture</span><p className={cn('font-mono font-semibold', ap.avgCaptureRatio > 0.65 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>{(ap.avgCaptureRatio * 100).toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Exit Grade</span><p className="font-mono font-semibold">{ap.avgExitLatencyGrade}</p></div>
                <div><span className="text-muted-foreground">PnL</span><p className={cn('font-mono font-semibold', ap.totalPnl > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>+${ap.totalPnl.toFixed(0)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Shadow Mode Card ───

const ShadowComparisonCard = ({ baseline, candidate, baselineCR, candidateCR, baselineGB, candidateGB, baselineCL, candidateCL, samples, ready, reason }: {
  baseline: any; candidate: any; baselineCR: number; candidateCR: number; baselineGB: number; candidateGB: number; baselineCL: number; candidateCL: number; samples: number; ready: boolean; reason: string;
}) => {
  const metrics = [
    { label: 'Capture Ratio', base: baselineCR, cand: candidateCR, format: (v: number) => `${(v * 100).toFixed(1)}%`, better: candidateCR > baselineCR },
    { label: 'Give-Back', base: baselineGB, cand: candidateGB, format: (v: number) => `${(v * 100).toFixed(1)}%`, better: candidateGB < baselineGB },
    { label: 'Conflict Losses', base: baselineCL, cand: candidateCL, format: (v: number) => `${(v * 100).toFixed(1)}%`, better: candidateCL < baselineCL },
  ];

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          Shadow Mode Validation
          <Badge variant="outline" className={cn('text-[10px] ml-auto', ready ? 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30' : 'text-[hsl(var(--neural-orange))]')}>{ready ? '✓ Promotion Ready' : '⏳ Evaluating'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/10 border border-border/30 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Baseline Policy</p>
            <p className="text-xs font-semibold mt-1">{baseline.name}</p>
          </div>
          <div className={cn('p-3 rounded-lg border text-center', ready ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-[hsl(var(--neural-cyan))]/5 border-[hsl(var(--neural-cyan))]/20')}>
            <p className="text-[10px] text-muted-foreground uppercase">Candidate Policy</p>
            <p className="text-xs font-semibold mt-1">{candidate.name}</p>
          </div>
        </div>

        <div className="space-y-3">
          {metrics.map(m => (
            <div key={m.label} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{m.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-muted-foreground">{m.format(m.base)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={cn('font-mono font-semibold', m.better ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{m.format(m.cand)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center text-[10px] text-muted-foreground">
          Evaluated across {samples} trade samples
        </div>

        <div className={cn('p-3 rounded-lg border text-xs', ready ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-muted/10 border-border/30')}>
          <p className={ready ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground'}>{reason}</p>
        </div>
      </CardContent>
    </Card>
  );
};
