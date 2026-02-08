// Daily Audit Summary Panel
// Comprehensive UI showing rolling health metrics, auto-protection status,
// shadow mode validation results, leakage ranking, and actionable fixes.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  CheckCircle2, ChevronRight, Clock, FlaskConical, Gauge, Heart,
  Lightbulb, Lock, Shield, ShieldAlert, ShieldCheck, ShieldX,
  Target, TrendingDown, TrendingUp, XCircle, Zap,
} from 'lucide-react';
import { ForexTradeEntry, ForexPerformanceMetrics } from '@/lib/forex/forexTypes';
import {
  RollingHealthState,
  RollingWindowMetrics,
  RollingWindowSize,
  ROLLING_WINDOW_LABELS,
  DegradationAlert,
  AutoProtectionTrigger,
} from '@/lib/forex/rollingWindowEngine';
import {
  ShadowModeState,
  ShadowTestResult,
} from '@/lib/forex/shadowModeValidator';

interface DailyAuditPanelProps {
  trades: ForexTradeEntry[];
  performance: ForexPerformanceMetrics;
  rollingHealth: RollingHealthState;
  shadowMode: ShadowModeState;
}

// ─── Sub-components ───

const HealthScoreBadge = ({ score, level }: { score: number; level: string }) => {
  const color = score >= 80 ? 'text-neural-green' : score >= 50 ? 'text-neural-orange' : 'text-neural-red';
  const bg = score >= 80 ? 'bg-neural-green/10 border-neural-green/30' : score >= 50 ? 'bg-neural-orange/10 border-neural-orange/30' : 'bg-neural-red/10 border-neural-red/30';
  return (
    <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold', bg, color)}>
      <Heart className="w-3.5 h-3.5" />
      <span>{score}/100</span>
      <span className="text-[10px] font-normal opacity-70">({level})</span>
    </div>
  );
};

const WindowMetricRow = ({ label, metrics }: { label: string; metrics: RollingWindowMetrics }) => (
  <div className="grid grid-cols-7 gap-2 text-[10px] items-center py-1.5 border-b border-border/10 last:border-0">
    <span className="text-muted-foreground font-medium col-span-1">{label}</span>
    <span className="text-center font-mono">{metrics.tradeCount}</span>
    <span className={cn('text-center font-mono font-bold', metrics.winRate >= 0.65 ? 'text-neural-green' : metrics.winRate >= 0.55 ? 'text-foreground' : 'text-neural-red')}>
      {(metrics.winRate * 100).toFixed(1)}%
    </span>
    <span className={cn('text-center font-mono', metrics.payoutAsymmetry >= 3 ? 'text-neural-green' : 'text-neural-orange')}>
      {metrics.payoutAsymmetry.toFixed(1)}:1
    </span>
    <span className={cn('text-center font-mono', metrics.netExpectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>
      {metrics.netExpectancy >= 0 ? '+' : ''}{metrics.netExpectancy.toFixed(3)}%
    </span>
    <span className="text-center font-mono">{metrics.avgDuration.toFixed(0)}m</span>
    <span className={cn('text-center font-mono', metrics.profitFactor >= 1.5 ? 'text-neural-green' : metrics.profitFactor >= 1 ? 'text-foreground' : 'text-neural-red')}>
      {metrics.profitFactor.toFixed(2)}
    </span>
  </div>
);

const AlertCard = ({ alert }: { alert: DegradationAlert }) => (
  <div className={cn(
    'p-2.5 rounded-lg border text-xs flex items-start gap-2',
    alert.severity === 'critical'
      ? 'bg-neural-red/5 border-neural-red/30'
      : 'bg-neural-orange/5 border-neural-orange/30'
  )}>
    {alert.severity === 'critical'
      ? <XCircle className="w-3.5 h-3.5 text-neural-red mt-0.5 shrink-0" />
      : <AlertTriangle className="w-3.5 h-3.5 text-neural-orange mt-0.5 shrink-0" />
    }
    <div>
      <span className={cn('font-semibold', alert.severity === 'critical' ? 'text-neural-red' : 'text-neural-orange')}>
        {alert.metric}
      </span>
      <p className="text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
    </div>
  </div>
);

const ProtectionTriggerCard = ({ trigger }: { trigger: AutoProtectionTrigger }) => {
  const actionLabels: Record<string, string> = {
    'throttle-density': '⚡ Throttle Trade Density',
    'raise-gating': '🔒 Raise Gating Thresholds',
    'tighten-duration': '⏱ Tighten Duration Windows',
    'defensive-exits': '🛡 Switch to Defensive Exits',
    'restrict-pairs': '🎯 Restrict to Top Pairs',
    'reduce-size': '📉 Reduce Position Size',
  };

  return (
    <div className={cn(
      'p-2.5 rounded-lg border text-xs flex items-center justify-between',
      trigger.severity === 'critical' ? 'bg-neural-red/5 border-neural-red/20' : 'bg-neural-orange/5 border-neural-orange/20'
    )}>
      <div className="flex items-center gap-2">
        <Shield className={cn('w-3.5 h-3.5', trigger.severity === 'critical' ? 'text-neural-red' : 'text-neural-orange')} />
        <span className="font-semibold">{actionLabels[trigger.action] || trigger.action}</span>
      </div>
      <Badge variant="outline" className="text-[9px]">
        {(trigger.adjustmentFactor * 100).toFixed(0)}% capacity
      </Badge>
    </div>
  );
};

const ShadowResultRow = ({ result }: { result: ShadowTestResult }) => {
  const decisionColor = result.decision === 'promote' ? 'text-neural-green' : result.decision === 'reject' ? 'text-neural-red' : 'text-neural-orange';
  const decisionIcon = result.decision === 'promote' ? CheckCircle2 : result.decision === 'reject' ? XCircle : Clock;
  const Icon = decisionIcon;

  return (
    <div className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">{result.parameterDelta.name}</span>
        </div>
        <div className={cn('flex items-center gap-1 text-xs font-bold', decisionColor)}>
          <Icon className="w-3.5 h-3.5" />
          <span className="uppercase">{result.decision}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-[10px]">
        <div className="text-center">
          <p className="text-muted-foreground">Capture</p>
          <p className={cn('font-mono font-bold', result.captureRatioDelta > 0 ? 'text-neural-green' : 'text-neural-red')}>
            {result.captureRatioDelta > 0 ? '+' : ''}{(result.captureRatioDelta * 100).toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Expectancy</p>
          <p className={cn('font-mono font-bold', result.expectancyDelta > 0 ? 'text-neural-green' : 'text-neural-red')}>
            {result.expectancyDelta > 0 ? '+' : ''}{result.expectancyDelta.toFixed(4)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Sharpe</p>
          <p className={cn('font-mono font-bold', result.sharpeDelta > 0 ? 'text-neural-green' : 'text-neural-red')}>
            {result.sharpeDelta > 0 ? '+' : ''}{result.sharpeDelta.toFixed(2)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Confidence</p>
          <p className="font-mono font-bold text-foreground">{result.confidence.toFixed(0)}%</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{result.decisionReason}</p>
    </div>
  );
};

// ─── Main Component ───

export const DailyAuditPanel = ({ trades, performance, rollingHealth, shadowMode }: DailyAuditPanelProps) => {
  // MFE/MAE summary
  const mfeMaeSummary = useMemo(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    if (executed.length === 0) return null;
    const avgMfe = executed.reduce((s, t) => s + t.mfe, 0) / executed.length;
    const avgMae = executed.reduce((s, t) => s + t.mae, 0) / executed.length;
    const avgCapture = executed.reduce((s, t) => s + t.captureRatio, 0) / executed.length;
    const avgGiveBack = executed.filter(t => t.pnlPercent > 0).reduce((s, t) => s + t.giveBackPct, 0) / Math.max(1, executed.filter(t => t.pnlPercent > 0).length);
    const avgFriction = executed.reduce((s, t) => s + t.frictionCost, 0) / executed.length;
    return { avgMfe, avgMae, avgCapture, avgGiveBack, avgFriction };
  }, [trades]);

  return (
    <div className="space-y-4">
      {/* Health Score + Protection Status */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-neural-green" />System Health Monitor
              </CardTitle>
              <HealthScoreBadge score={rollingHealth.healthScore} level={rollingHealth.protectionLevel} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rolling Window Comparison Table */}
            <div>
              <div className="grid grid-cols-7 gap-2 text-[9px] text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border/30">
                <span>Window</span>
                <span className="text-center">Trades</span>
                <span className="text-center">Win Rate</span>
                <span className="text-center">Asymmetry</span>
                <span className="text-center">Expectancy</span>
                <span className="text-center">Avg Dur</span>
                <span className="text-center">PF</span>
              </div>
              {(['50', '200', '30d'] as RollingWindowSize[]).map(ws => (
                <WindowMetricRow key={ws} label={ROLLING_WINDOW_LABELS[ws]} metrics={rollingHealth.windows[ws]} />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* MFE/MAE + Give-Back Summary */}
      {mfeMaeSummary && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-neural-green" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg MFE</span>
              </div>
              <span className="text-lg font-display font-bold text-neural-green">{mfeMaeSummary.avgMfe.toFixed(3)}%</span>
            </div>
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-neural-red" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg MAE</span>
              </div>
              <span className="text-lg font-display font-bold text-neural-red">{mfeMaeSummary.avgMae.toFixed(3)}%</span>
            </div>
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Capture</span>
              </div>
              <span className={cn('text-lg font-display font-bold', mfeMaeSummary.avgCapture > 0.6 ? 'text-neural-green' : 'text-neural-orange')}>
                {(mfeMaeSummary.avgCapture * 100).toFixed(0)}%
              </span>
            </div>
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-neural-orange" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Give-Back</span>
              </div>
              <span className={cn('text-lg font-display font-bold', mfeMaeSummary.avgGiveBack < 25 ? 'text-neural-green' : 'text-neural-orange')}>
                {mfeMaeSummary.avgGiveBack.toFixed(0)}%
              </span>
            </div>
            <div className="p-3 rounded-xl bg-card/50 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Friction</span>
              </div>
              <span className="text-lg font-display font-bold text-foreground">{mfeMaeSummary.avgFriction.toFixed(3)}%</span>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Degradation Alerts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-neural-orange" />
                Degradation Alerts
                <Badge variant="outline" className="text-[9px] ml-auto">
                  {rollingHealth.alerts.length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rollingHealth.alerts.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-neural-green/5 border border-neural-green/20 text-xs text-neural-green">
                  <CheckCircle2 className="w-4 h-4" />
                  All metrics within healthy thresholds
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {rollingHealth.alerts.map((alert, i) => (
                    <AlertCard key={i} alert={alert} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Auto-Protection + Fixes */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Protection & Fixes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Protection Triggers */}
              {rollingHealth.protectionTriggers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active Protections</p>
                  {rollingHealth.protectionTriggers.slice(0, 3).map((trigger, i) => (
                    <ProtectionTriggerCard key={i} trigger={trigger} />
                  ))}
                </div>
              )}

              {/* 3 Fixes Now */}
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3 text-neural-orange" />3 Fixes Now
                </p>
                {rollingHealth.topFixes.map((fix, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/5 border border-border/20 text-xs">
                    <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{fix}</span>
                  </div>
                ))}
              </div>

              {/* Do Not Trade */}
              {rollingHealth.doNotTrade.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-neural-red" />Do Not Trade
                  </p>
                  {rollingHealth.doNotTrade.map((condition, i) => (
                    <div key={i} className="p-2 rounded-lg bg-neural-red/5 border border-neural-red/20 text-xs text-neural-red">
                      {condition}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Shadow Mode Validation */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-neural-purple" />Shadow Mode Validation
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] text-neural-green border-neural-green/30">
                  {shadowMode.promotedCount} promoted
                </Badge>
                <Badge variant="outline" className="text-[9px] text-neural-red border-neural-red/30">
                  {shadowMode.rejectedCount} rejected
                </Badge>
                <Badge variant="outline" className="text-[9px] text-neural-orange border-neural-orange/30">
                  {shadowMode.extendedCount} testing
                </Badge>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {shadowMode.walkForwardPeriod} · {shadowMode.validationSummary}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
              {shadowMode.activeCandidates.map((result, i) => (
                <ShadowResultRow key={i} result={result} />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
