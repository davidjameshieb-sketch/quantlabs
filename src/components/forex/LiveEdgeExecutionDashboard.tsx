// Live Edge Execution Dashboard — Dual-edge (Long + Short) monitoring
// Deterministic rule enforcement only — no optimization, ranking, or training.

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Zap, TrendingUp, TrendingDown, ArrowDownRight, ShieldCheck,
  ShieldAlert, Clock, Activity, CheckCircle2, XCircle, AlertTriangle,
  Radio, Target, Crosshair, Gauge, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateMockLiveEdgeState,
  LONG_AUTHORIZED_PAIRS,
  SHORT_AUTHORIZED_PAIRS,
  LONG_GOVERNANCE_RULES,
  SHORT_GOVERNANCE_RULES,
  SESSION_PRIORITIES,
  type EdgeExecutionDecision,
  type LiveEdgeExecutionState,
  type EntryCheck,
} from '@/lib/forex/liveEdgeExecutionEngine';

// ─── Sub-components ──────────────────────────────────────────────────

const StatusIcon = ({ passed }: { passed: boolean }) => (
  passed
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
);

const DecisionCard = ({ decision }: { decision: EdgeExecutionDecision }) => {
  const isLong = decision.direction === 'long';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-3 rounded-xl border',
        decision.permitted
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-red-500/20 bg-red-500/5'
      )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isLong ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
          <span className="font-mono text-sm font-bold">{decision.pair.replace('_', '/')}</span>
          <Badge variant="outline" className={cn('text-[9px]', isLong ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30')}>
            {decision.direction.toUpperCase()}
          </Badge>
        </div>
        <Badge variant={decision.permitted ? 'default' : 'destructive'} className="text-[9px]">
          {decision.permitted ? 'EXECUTE' : 'BLOCKED'}
        </Badge>
      </div>

      {/* Entry validation checks */}
      <div className="grid grid-cols-2 gap-1 mb-2">
        {decision.entryValidation.checks.map((check, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <StatusIcon passed={check.passed} />
            <span className={cn(check.passed ? 'text-muted-foreground' : 'text-red-400', !check.required && 'opacity-60')}>
              {check.name}
            </span>
          </div>
        ))}
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/20 pt-2">
        <span>Capital ×{decision.capitalMultiplier}</span>
        <span>Session ×{decision.sessionMultiplier}</span>
        <span>Stop {decision.stopGeometry.initialStopR}R</span>
        <span className={cn('font-bold', decision.finalPositionMultiplier > 0 ? 'text-emerald-400' : 'text-red-400')}>
          Final ×{decision.finalPositionMultiplier}
        </span>
      </div>

      {/* Block reasons */}
      {decision.blockReasons.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {decision.blockReasons.map((r, i) => (
            <div key={i} className="text-[9px] text-red-400 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 shrink-0" />
              {r}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────────────

export const LiveEdgeExecutionDashboard = () => {
  const state: LiveEdgeExecutionState = useMemo(() => generateMockLiveEdgeState(), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Live Edge Execution</h2>
            <p className="text-xs text-muted-foreground">
              Dual-edge deployment • Deterministic rule enforcement • Survivorship-confirmed
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="default" className="text-[10px] gap-1">
            <Radio className="w-3 h-3" />
            {state.systemMode.replace(/_/g, ' ')}
          </Badge>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Long Active" value={state.longPairsActive} total={LONG_AUTHORIZED_PAIRS.length} color="emerald" icon={<TrendingUp className="w-4 h-4" />} />
        <SummaryCard label="Short Active" value={state.shortPairsActive} total={SHORT_AUTHORIZED_PAIRS.length} color="red" icon={<ArrowDownRight className="w-4 h-4" />} />
        <SummaryCard label="Total Blocked" value={state.totalBlocked} color={state.totalBlocked > 3 ? 'red' : 'amber'} icon={<ShieldAlert className="w-4 h-4" />} />
        <SummaryCard label="Active Regimes" value={state.activeRegimes.filter(r => r.authorized).length} color="blue" icon={<Activity className="w-4 h-4" />} />
        <SummaryCard label="Safety Gates" value={[...state.longDecisions, ...state.shortDecisions].filter(d => d.safetyPassed).length}
          total={state.longDecisions.length + state.shortDecisions.length} color="emerald" icon={<ShieldCheck className="w-4 h-4" />} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="decisions" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="decisions" className="text-xs gap-1.5"><Target className="w-3 h-3" />Execution Decisions</TabsTrigger>
          <TabsTrigger value="regimes" className="text-xs gap-1.5"><Activity className="w-3 h-3" />Regime Status</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs gap-1.5"><Clock className="w-3 h-3" />Session Intelligence</TabsTrigger>
          <TabsTrigger value="governance" className="text-xs gap-1.5"><ShieldCheck className="w-3 h-3" />Governance Rules</TabsTrigger>
          <TabsTrigger value="safety" className="text-xs gap-1.5"><ShieldAlert className="w-3 h-3" />Safety Controls</TabsTrigger>
        </TabsList>

        {/* ─── Execution Decisions ─── */}
        <TabsContent value="decisions" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-display font-bold text-emerald-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Long Edge Decisions
              </h3>
              {state.longDecisions.map((d, i) => (
                <DecisionCard key={i} decision={d} />
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-display font-bold text-red-400 flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4" /> Short Edge Decisions
              </h3>
              {state.shortDecisions.map((d, i) => (
                <DecisionCard key={i} decision={d} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ─── Regime Status ─── */}
        <TabsContent value="regimes" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Active Regime Landscape
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {state.activeRegimes.map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 text-xs py-2 border-b border-border/10 last:border-0">
                  {r.direction === 'long'
                    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    : <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
                  <span className="font-mono w-16">{r.pair.replace('_', '/')}</span>
                  <Badge variant="outline" className={cn('text-[9px]',
                    r.authorized ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'
                  )}>
                    {r.authorized ? 'AUTHORIZED' : 'BLOCKED'}
                  </Badge>
                  <span className="text-muted-foreground capitalize">{r.regime.replace(/-/g, ' ')}</span>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Session Intelligence ─── */}
        <TabsContent value="sessions" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Session Priority Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left p-2">Session</th>
                    <th className="text-center p-2">Long Priority</th>
                    <th className="text-center p-2">Short Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {SESSION_PRIORITIES.map(sp => (
                    <tr key={sp.session} className="border-b border-border/10">
                      <td className="p-2 font-mono capitalize">{sp.session.replace('-', ' ')}</td>
                      <td className="text-center p-2">
                        <PriorityBadge priority={sp.longPriority} />
                      </td>
                      <td className="text-center p-2">
                        <PriorityBadge priority={sp.shortPriority} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Governance Rules ─── */}
        <TabsContent value="governance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/30 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Long Governance Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {LONG_GOVERNANCE_RULES.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/10 last:border-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-muted-foreground text-[10px]">{rule.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-red-400" />
                  Short Governance Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {SHORT_GOVERNANCE_RULES.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/10 last:border-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-muted-foreground text-[10px]">{rule.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Safety Controls ─── */}
        <TabsContent value="safety" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Execution Safety Gate Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...state.longDecisions, ...state.shortDecisions].map((d, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-3 text-xs py-2 border-b border-border/10 last:border-0">
                  {d.direction === 'long'
                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                  <span className="font-mono w-16">{d.pair.replace('_', '/')}</span>
                  <div className="flex gap-2 flex-1">
                    {d.safetyChecks.map((sc, si) => (
                      <span key={si} className="flex items-center gap-1">
                        <StatusIcon passed={sc.passed} />
                        <span className={cn('text-[9px]', sc.passed ? 'text-muted-foreground' : 'text-red-400')}>{sc.name}</span>
                      </span>
                    ))}
                  </div>
                  <Badge variant={d.safetyPassed ? 'outline' : 'destructive'} className="text-[9px]">
                    {d.safetyPassed ? 'CLEAR' : 'BLOCKED'}
                  </Badge>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          {/* Capital allocation summary */}
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                Capital Allocation
                <span className="text-[9px] text-muted-foreground ml-2">Longs = baseline • Shorts ≤ 25% pair capital</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...state.longDecisions, ...state.shortDecisions]
                .filter(d => d.permitted)
                .sort((a, b) => b.finalPositionMultiplier - a.finalPositionMultiplier)
                .map((d, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  {d.direction === 'long'
                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                  <span className="font-mono w-16">{d.pair.replace('_', '/')}</span>
                  <div className="flex-1">
                    <Progress value={d.finalPositionMultiplier * 50} className="h-1.5" />
                  </div>
                  <span className="font-mono font-bold w-10 text-right text-emerald-400">×{d.finalPositionMultiplier}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, total, color, icon }: {
  label: string; value: number; total?: number; color: string; icon?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    red: 'text-red-400 bg-red-500/10 border-red-500/30',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn('p-3 rounded-xl border text-center', colorMap[color])}>
      <div className="flex items-center justify-center gap-1.5 mb-1 opacity-70">{icon}</div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-mono font-bold">
        {value}{total !== undefined && <span className="text-muted-foreground text-xs">/{total}</span>}
      </p>
    </motion.div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    high: 'bg-emerald-500/15 text-emerald-400',
    medium: 'bg-amber-500/15 text-amber-400',
    low: 'bg-blue-500/15 text-blue-400',
    suppressed: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-[10px] font-mono capitalize', styles[priority] || 'text-muted-foreground')}>
      {priority}
    </span>
  );
}

export default LiveEdgeExecutionDashboard;
