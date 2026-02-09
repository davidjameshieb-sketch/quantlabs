// Adaptive Edge Governance Dashboard
// Displays edge confidence, allocation multipliers, stability, drift warnings,
// shadow validation progress, learning lifecycle, capital flow, and edge cluster heatmap.

import { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Brain, Shield, TrendingUp, TrendingDown, AlertTriangle,
  Activity, Zap, Eye, Gauge, CircleDot, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  getEdgeLearningSummary,
  loadEdgeMemory,
  updateEdgeMemory,
  setDeploymentMode,
  getDeploymentMode,
  type AdaptiveDeploymentMode,
  type LearningState,
  type EdgeLearningSummary,
} from '@/lib/forex/edgeLearningState';
import {
  computeAdaptiveAllocation,
  computeShadowValidation,
  getShadowValidationState,
  type ShadowValidationState,
} from '@/lib/forex/adaptiveCapitalAllocator';
import { runDriftMonitor, type DriftMonitorState, type DriftAlert } from '@/lib/forex/edgeDriftMonitor';
import type { ForexTradeEntry } from '@/lib/forex/forexTypes';
import { buildEnvironmentSignature } from '@/lib/forex/edgeLearningState';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AdaptiveEdgeDashboardProps {
  trades: ForexTradeEntry[];
}

const MODE_LABELS: Record<AdaptiveDeploymentMode, { label: string; color: string; icon: typeof Eye }> = {
  OBSERVATION: { label: 'Observation Only', color: 'text-muted-foreground', icon: Eye },
  DISCOVERY_RISK: { label: 'Discovery Risk', color: 'text-neural-orange', icon: Shield },
  SHADOW_LEARNING: { label: 'Shadow Learning', color: 'text-primary', icon: Brain },
  ALLOCATION_WEIGHT: { label: 'Allocation Weighting', color: 'text-neural-green', icon: Gauge },
  FULLY_ADAPTIVE: { label: 'Fully Adaptive', color: 'text-neural-green', icon: Zap },
};

const LEARNING_STATE_COLORS: Record<LearningState, string> = {
  Learning: 'text-primary',
  Stable: 'text-neural-green',
  Decaying: 'text-neural-orange',
  Reverting: 'text-neural-red',
};

const LEARNING_STATE_BADGES: Record<LearningState, 'default' | 'destructive' | 'outline' | 'secondary'> = {
  Learning: 'outline',
  Stable: 'default',
  Decaying: 'secondary',
  Reverting: 'destructive',
};

export function AdaptiveEdgeDashboard({ trades }: AdaptiveEdgeDashboardProps) {
  const [currentMode, setCurrentMode] = useState<AdaptiveDeploymentMode>(getDeploymentMode());

  // Load persisted memory on mount
  useEffect(() => {
    loadEdgeMemory();
  }, []);

  // Feed trades into learning engine
  useEffect(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    if (executed.length === 0) return;

    const learningTrades = executed.map(t => {
      const session = t.spreadCondition === 'tight' ? 'ny-overlap'
        : t.spreadCondition === 'wide' ? 'asian' : 'london-open';
      const regime = t.regime === 'trending' ? 'expansion'
        : t.regime === 'ranging' ? 'compression'
        : t.regime === 'high-volatility' ? 'ignition' : 'exhaustion';

      return {
        environmentSignature: buildEnvironmentSignature(session, regime, t.currencyPair, t.direction, t.primaryAgent),
        pnlPips: t.pnlPercent * 100,
        session,
        regime,
        compositeScore: t.confidenceScore / 100,
        timestamp: Date.now() - Math.random() * 30 * 86400000,
      };
    });

    updateEdgeMemory(learningTrades);
  }, [trades]);

  const summary = useMemo(() => getEdgeLearningSummary(), [trades]);
  const driftState = useMemo(() => runDriftMonitor(), [trades]);
  const shadowValidation = useMemo(() => {
    // Compute from trade data
    const executed = trades.filter(t => t.outcome !== 'avoided');
    const edgeTrades = executed.filter(t => t.confidenceScore > 75);
    const baselineTrades = executed;

    const edgePnls = edgeTrades.map(t => t.pnlPercent * 100);
    const basePnls = baselineTrades.map(t => t.pnlPercent * 100);

    const edgeExp = edgePnls.length > 0 ? edgePnls.reduce((a, b) => a + b, 0) / edgePnls.length : 0;
    const baseExp = basePnls.length > 0 ? basePnls.reduce((a, b) => a + b, 0) / basePnls.length : 0;

    let edgeDD = 0, baseDD = 0, cumE = 0, cumB = 0, minE = 0, minB = 0;
    for (const p of edgePnls) { cumE += p; minE = Math.min(minE, cumE); edgeDD = Math.max(edgeDD, -minE); }
    for (const p of basePnls) { cumB += p; minB = Math.min(minB, cumB); baseDD = Math.max(baseDD, -minB); }

    return computeShadowValidation(edgeTrades.length, edgeExp, baseExp, edgeDD, baseDD, 0.04);
  }, [trades]);

  const handleModeChange = (mode: AdaptiveDeploymentMode) => {
    setDeploymentMode(mode);
    setCurrentMode(mode);
  };

  const modeInfo = MODE_LABELS[currentMode];
  const ModeIcon = modeInfo.icon;

  // Edge confidence heatmap data
  const heatmapData = useMemo(() => {
    return summary.topConfidenceEnvironments.map(e => ({
      name: e.signature.length > 25 ? e.signature.slice(0, 23) + '…' : e.signature,
      confidence: Math.round(e.confidence * 100),
      expectancy: e.expectancy,
      trades: e.tradeCount,
      state: e.learningState,
      fill: e.learningState === 'Stable' ? 'hsl(var(--neural-green))'
        : e.learningState === 'Learning' ? 'hsl(var(--primary))'
        : e.learningState === 'Decaying' ? 'hsl(var(--neural-orange))'
        : 'hsl(var(--neural-red))',
    }));
  }, [summary]);

  return (
    <div className="space-y-4">
      {/* Header + Mode Selector */}
      <Card className="border-border/30 bg-card/60 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-display">Adaptive Edge Governance</CardTitle>
              <Badge variant="outline" className={`text-[9px] ${modeInfo.color}`}>
                <ModeIcon className="w-3 h-3 mr-1" />
                {modeInfo.label}
              </Badge>
            </div>
            <Select value={currentMode} onValueChange={v => handleModeChange(v as AdaptiveDeploymentMode)}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OBSERVATION">Mode 0: Observation Only</SelectItem>
                <SelectItem value="DISCOVERY_RISK">Mode 1: Discovery Risk</SelectItem>
                <SelectItem value="SHADOW_LEARNING">Mode 2: Shadow Learning</SelectItem>
                <SelectItem value="ALLOCATION_WEIGHT">Mode 3: Allocation Weighting</SelectItem>
                <SelectItem value="FULLY_ADAPTIVE">Mode 4: Fully Adaptive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Supervisory allocation layer — learns edge environments, controls capital flow, detects drift.
          </p>
        </CardHeader>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Brain}
          label="Avg Edge Confidence"
          value={`${(summary.avgEdgeConfidence * 100).toFixed(0)}%`}
          detail={`${summary.totalEnvironments} environments tracked`}
          color="text-primary"
        />
        <MetricCard
          icon={Activity}
          label="Drift Score"
          value={`${(driftState.overallDriftScore * 100).toFixed(0)}%`}
          detail={`${driftState.environmentsDrifting} drifting · ${driftState.alerts.length} alerts`}
          color={driftState.overallDriftScore > 0.5 ? 'text-neural-red' : driftState.overallDriftScore > 0.2 ? 'text-neural-orange' : 'text-neural-green'}
        />
        <MetricCard
          icon={Zap}
          label="Stable Edges"
          value={`${summary.stableCount}`}
          detail={`${summary.learningCount} learning · ${summary.decayingCount} decaying`}
          color="text-neural-green"
        />
        <MetricCard
          icon={RefreshCw}
          label="Trades Processed"
          value={`${summary.totalTradesProcessed}`}
          detail={`${summary.revertingCount} reverting environments`}
          color="text-muted-foreground"
        />
      </div>

      {/* Shadow Validation Progress */}
      <ShadowValidationCard validation={shadowValidation} />

      {/* Learning State Distribution + Drift Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LearningStateCard summary={summary} />
        <DriftAlertsCard driftState={driftState} />
      </div>

      {/* Edge Confidence Heatmap */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-display">Edge Cluster Confidence Map</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {heatmapData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={heatmapData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 9 }} domain={[0, 100]} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 8 }} width={140} />
                <Tooltip
                  contentStyle={{ fontSize: 10, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(value: number) => [`${value}%`, 'Confidence']}
                />
                <Bar dataKey="confidence" radius={[0, 4, 4, 0]}>
                  {heatmapData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-[10px] text-muted-foreground">
              No edge environments learned yet — trades will populate this chart
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reversion Log */}
      {driftState.reversionLog.length > 0 && (
        <Card className="border-border/30 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-neural-orange" />
              <CardTitle className="text-xs font-display">Reversion Log</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {driftState.reversionLog.slice(-10).reverse().map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] p-2 rounded bg-muted/20">
                  <AlertTriangle className="w-3 h-3 text-neural-orange mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{entry.environmentSignature}</div>
                    <div className="text-muted-foreground">{entry.reason}</div>
                    <div className="text-muted-foreground">
                      Confidence: {(entry.previousConfidence * 100).toFixed(0)}% → reverted · Allocation: {entry.previousAllocation.toFixed(2)}× → {entry.newAllocation.toFixed(2)}×
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, detail, color }: {
  icon: typeof Brain; label: string; value: string; detail: string; color: string;
}) {
  return (
    <Card className="border-border/30 bg-card/60">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={`w-3.5 h-3.5 ${color}`} />
          <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        </div>
        <div className={`text-lg font-bold ${color}`}>{value}</div>
        <div className="text-[9px] text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function ShadowValidationCard({ validation }: { validation: ShadowValidationState }) {
  const progress = Math.min(100, (validation.shadowTrades / 150) * 100);

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <CardTitle className="text-xs font-display">Shadow Validation Guardrail</CardTitle>
          <Badge variant={validation.validated ? 'default' : 'outline'} className="text-[9px]">
            {validation.validated ? '✓ VALIDATED' : 'PENDING'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-muted-foreground">Shadow Trades Progress</span>
            <span className="font-medium">{validation.shadowTrades} / 150</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <ValidationCheck
            label="Expectancy Ratio"
            value={validation.expectancyRatio.toFixed(2)}
            threshold="≥ 1.30"
            passed={validation.expectancyRatio >= 1.3}
          />
          <ValidationCheck
            label="DD Ratio"
            value={validation.ddRatio.toFixed(2)}
            threshold="≤ 0.70"
            passed={validation.ddRatio <= 0.70}
          />
          <ValidationCheck
            label="Shadow Trades"
            value={`${validation.shadowTrades}`}
            threshold="≥ 150"
            passed={validation.shadowTrades >= 150}
          />
          <ValidationCheck
            label="Decile Slope"
            value={validation.compositeDecileSlope.toFixed(3)}
            threshold="≥ 0.02"
            passed={validation.compositeDecileSlope >= 0.02}
          />
        </div>

        {validation.failReasons.length > 0 && (
          <div className="space-y-1">
            {validation.failReasons.map((reason, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px] text-neural-orange">
                <XCircle className="w-3 h-3 shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValidationCheck({ label, value, threshold, passed }: {
  label: string; value: string; threshold: string; passed: boolean;
}) {
  return (
    <div className="text-center p-2 rounded bg-muted/20">
      <div className="text-[9px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-bold ${passed ? 'text-neural-green' : 'text-neural-red'}`}>
        {value}
      </div>
      <div className="text-[8px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
        {passed ? <CheckCircle2 className="w-2.5 h-2.5 text-neural-green" /> : <XCircle className="w-2.5 h-2.5 text-neural-red" />}
        {threshold}
      </div>
    </div>
  );
}

function LearningStateCard({ summary }: { summary: EdgeLearningSummary }) {
  const stateData = [
    { state: 'Learning' as LearningState, count: summary.learningCount, color: 'hsl(var(--primary))' },
    { state: 'Stable' as LearningState, count: summary.stableCount, color: 'hsl(var(--neural-green))' },
    { state: 'Decaying' as LearningState, count: summary.decayingCount, color: 'hsl(var(--neural-orange))' },
    { state: 'Reverting' as LearningState, count: summary.revertingCount, color: 'hsl(var(--neural-red))' },
  ].filter(s => s.count > 0);

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-display">Learning Lifecycle Distribution</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {stateData.length > 0 ? (
          <div className="space-y-2">
            {stateData.map(s => (
              <div key={s.state} className="flex items-center gap-2">
                <Badge variant={LEARNING_STATE_BADGES[s.state]} className="text-[9px] w-20 justify-center">
                  {s.state}
                </Badge>
                <Progress
                  value={summary.totalEnvironments > 0 ? (s.count / summary.totalEnvironments) * 100 : 0}
                  className="h-2 flex-1"
                />
                <span className={`text-xs font-bold ${LEARNING_STATE_COLORS[s.state]} w-8 text-right`}>{s.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground text-center py-6">
            No environments in learning memory yet
          </div>
        )}

        {summary.topConfidenceEnvironments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/20">
            <div className="text-[9px] text-muted-foreground mb-2">Top Confidence Environments</div>
            <div className="space-y-1">
              {summary.topConfidenceEnvironments.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-[10px]">
                  <span className="truncate max-w-[60%]">{e.signature}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={LEARNING_STATE_BADGES[e.learningState]} className="text-[8px]">
                      {e.learningState}
                    </Badge>
                    <span className="font-bold">{(e.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DriftAlertsCard({ driftState }: { driftState: DriftMonitorState }) {
  const severityIcon = (severity: DriftAlert['severity']) =>
    severity === 'critical' ? <XCircle className="w-3 h-3 text-neural-red shrink-0" /> : <AlertTriangle className="w-3 h-3 text-neural-orange shrink-0" />;

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-neural-orange" />
          <CardTitle className="text-xs font-display">Drift Alerts</CardTitle>
          {driftState.alerts.length > 0 && (
            <Badge variant="destructive" className="text-[9px]">{driftState.alerts.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {driftState.alerts.length > 0 ? (
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {driftState.alerts.slice(0, 10).map((alert, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] p-2 rounded bg-muted/20">
                {severityIcon(alert.severity)}
                <div>
                  <div className="font-medium">{alert.alertType.replace(/_/g, ' ')}</div>
                  <div className="text-muted-foreground">{alert.message}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    {alert.environmentSignature}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-6 h-6 text-neural-green mb-2" />
            <div className="text-xs font-medium text-neural-green">All Clear</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {driftState.environmentsMonitored} environments stable · {driftState.environmentsStable} verified
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
