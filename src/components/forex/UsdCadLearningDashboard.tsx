// USD_CAD Learning & Convergence Dashboard
// 4 sections: Learning Status, Convergence Tracker, What Changed, Edge Readiness
// + Profit Improvement Lab + Decision Stream with Learning Tags + CSV exports

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Brain, CheckCircle2, XCircle, TrendingUp, TrendingDown, Activity,
  Download, Shield, Lightbulb, ArrowUpRight, ArrowDownRight, Minus,
  Eye, Beaker, Sparkles, Lock, RefreshCw,
} from 'lucide-react';
import { useUsdCadLearning } from '@/hooks/useUsdCadLearning';
import {
  computeLearningTag,
  exportToCsv,
  downloadCsv,
  type WindowMetrics,
  type ConvergenceComparison,
  type EnvKeyShift,
  type AgentShift,
  type SessionShift,
  type ScaleGate,
  type ProfitSuggestion,
  type LearningStatusMetrics,
  type UsdCadDecisionEvent,
} from '@/lib/forex/usdCadLearningEngine';

// ─── Sub-components ───────────────────────────────────────────────────

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/50">
      {active
        ? <CheckCircle2 className="w-4 h-4 text-neural-green" />
        : <XCircle className="w-4 h-4 text-muted-foreground/50" />
      }
      <span className="text-xs font-medium">{label}</span>
      <Badge variant={active ? 'default' : 'outline'} className="text-[9px] ml-auto">
        {active ? 'ON' : 'OFF'}
      </Badge>
    </div>
  );
}

function MetricDelta({ label, current, previous, unit, higherIsBetter = true }: {
  label: string; current: number; previous: number; unit?: string; higherIsBetter?: boolean;
}) {
  const delta = current - previous;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const neutral = Math.abs(delta) < 0.01;
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{current.toFixed(2)}{unit}</span>
        {!neutral && (
          <span className={improved ? 'text-neural-green' : 'text-neural-red'}>
            {improved ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
            {Math.abs(delta).toFixed(2)}
          </span>
        )}
        {neutral && <Minus className="w-3 h-3 text-muted-foreground" />}
      </div>
    </div>
  );
}

function PFDisplay({ pf }: { pf: number | null }) {
  if (pf === null) return <span className="text-muted-foreground/50 font-mono text-xs">NULL</span>;
  return <span className={`font-mono text-xs ${pf >= 1.2 ? 'text-neural-green' : pf >= 1.0 ? 'text-neural-orange' : 'text-neural-red'}`}>{pf.toFixed(2)}</span>;
}

// ─── Section 1: Learning Status ───────────────────────────────────────

function LearningStatusSection({ status }: { status: LearningStatusMetrics }) {
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Learning Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatusBadge active={status.observationLearning} label="Observation Learning" />
          <StatusBadge active={status.counterfactualLearning} label="Counterfactual Learning" />
          <StatusBadge active={status.proposalGeneration} label="Proposal Generation" />
          <StatusBadge active={status.liveBehaviorChanges} label="Live Behavior Changes" />
        </div>
        <div className="grid grid-cols-4 gap-3 pt-2">
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{status.decisionsAnalyzed24h}</div>
            <div className="text-[9px] text-muted-foreground">24h decisions</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{status.decisionsAnalyzed7d}</div>
            <div className="text-[9px] text-muted-foreground">7d decisions</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{status.envKeysSeen}</div>
            <div className="text-[9px] text-muted-foreground">EnvKeys seen</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{status.coalitionsEvaluated}</div>
            <div className="text-[9px] text-muted-foreground">Coalitions</div>
          </div>
        </div>
        {status.lastUpdateTime && (
          <div className="text-[9px] text-muted-foreground pt-1">
            Last update: {new Date(status.lastUpdateTime).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 2: Convergence Tracker ───────────────────────────────────

function ConvergenceSection({ conv50, conv200 }: { conv50: ConvergenceComparison; conv200: ConvergenceComparison | null }) {
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Convergence Tracker
          {conv50.improving
            ? <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[9px]">CONVERGING</Badge>
            : <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 text-[9px]">DIVERGING</Badge>
          }
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-[10px] text-muted-foreground mb-2 font-medium">Last 50 vs Previous 50</div>
        <MetricDelta label="Expectancy" current={conv50.current.expectancy} previous={conv50.previous.expectancy} unit="p" />
        <MetricDelta label="Win Rate" current={conv50.current.winRate * 100} previous={conv50.previous.winRate * 100} unit="%" />
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-muted-foreground">Profit Factor</span>
          <div className="flex items-center gap-2">
            <PFDisplay pf={conv50.current.pf} />
            <span className="text-muted-foreground/50">vs</span>
            <PFDisplay pf={conv50.previous.pf} />
          </div>
        </div>
        <MetricDelta label="DD Slope" current={conv50.current.drawdownSlope} previous={conv50.previous.drawdownSlope} higherIsBetter={false} />
        <MetricDelta label="Friction" current={conv50.current.frictionDrag} previous={conv50.previous.frictionDrag} higherIsBetter={false} />
        <MetricDelta label="Block Rate" current={conv50.current.blockRate * 100} previous={conv50.previous.blockRate * 100} unit="%" higherIsBetter={false} />
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-muted-foreground">Entropy</span>
          <span className="font-mono">{conv50.current.entropy.toFixed(3)} <span className="text-muted-foreground/50 text-[9px]">(lower = more consistent)</span></span>
        </div>

        {conv200 && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="text-[10px] text-muted-foreground mb-2 font-medium">Last 200 vs Previous 200</div>
            <MetricDelta label="Expectancy" current={conv200.current.expectancy} previous={conv200.previous.expectancy} unit="p" />
            <MetricDelta label="Win Rate" current={conv200.current.winRate * 100} previous={conv200.previous.winRate * 100} unit="%" />
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground">Profit Factor</span>
              <div className="flex items-center gap-2">
                <PFDisplay pf={conv200.current.pf} />
                <span className="text-muted-foreground/50">vs</span>
                <PFDisplay pf={conv200.previous.pf} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section 3: What Changed ──────────────────────────────────────────

function WhatChangedSection({ envKeyShifts, agentShifts, sessionShifts }: {
  envKeyShifts: EnvKeyShift[]; agentShifts: AgentShift[]; sessionShifts: SessionShift[];
}) {
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          What Changed? (Attribution)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="envkeys" className="space-y-3">
          <TabsList className="bg-muted/30 h-7">
            <TabsTrigger value="envkeys" className="text-[10px] h-5">EnvKeys</TabsTrigger>
            <TabsTrigger value="agents" className="text-[10px] h-5">Agents</TabsTrigger>
            <TabsTrigger value="sessions" className="text-[10px] h-5">Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="envkeys">
            {envKeyShifts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Insufficient data for comparison</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-1">EnvKey</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Exp Now</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Exp Prev</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">PF</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Friction</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">N</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envKeyShifts.slice(0, 10).map(e => (
                      <TableRow key={e.envKey}>
                        <TableCell className="text-[9px] py-1 font-mono max-w-[120px] truncate">{e.envKey}</TableCell>
                        <TableCell className={`text-[9px] py-1 text-right font-mono ${e.currentExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                          {e.currentExpectancy.toFixed(1)}p
                        </TableCell>
                        <TableCell className="text-[9px] py-1 text-right font-mono text-muted-foreground">{e.previousExpectancy.toFixed(1)}p</TableCell>
                        <TableCell className="text-[9px] py-1 text-right"><PFDisplay pf={e.currentPF} /></TableCell>
                        <TableCell className="text-[9px] py-1 text-right font-mono">{e.currentFrictionDrag.toFixed(1)}</TableCell>
                        <TableCell className="text-[9px] py-1 text-right">{e.trades}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="agents">
            {agentShifts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Insufficient data</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-1">Agent</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Freq Now</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Freq Prev</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">ΔExp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentShifts.slice(0, 10).map(a => (
                      <TableRow key={a.agentId}>
                        <TableCell className="text-[9px] py-1 font-mono">{a.agentId}</TableCell>
                        <TableCell className="text-[9px] py-1 text-right">{a.currentVoteFreq}</TableCell>
                        <TableCell className="text-[9px] py-1 text-right text-muted-foreground">{a.previousVoteFreq}</TableCell>
                        <TableCell className={`text-[9px] py-1 text-right font-mono ${a.deltaExpectancy > 0 ? 'text-neural-green' : a.deltaExpectancy < 0 ? 'text-neural-red' : ''}`}>
                          {a.deltaExpectancy > 0 ? '+' : ''}{a.deltaExpectancy.toFixed(2)}p
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sessions">
            {sessionShifts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Insufficient data</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-1">Session</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Exp Now</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Exp Prev</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Friction Now</TableHead>
                      <TableHead className="text-[9px] py-1 text-right">Friction Prev</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionShifts.map(s => (
                      <TableRow key={s.session}>
                        <TableCell className="text-[9px] py-1 font-mono">{s.session}</TableCell>
                        <TableCell className={`text-[9px] py-1 text-right font-mono ${s.currentExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                          {s.currentExpectancy.toFixed(1)}p
                        </TableCell>
                        <TableCell className="text-[9px] py-1 text-right text-muted-foreground font-mono">{s.previousExpectancy.toFixed(1)}p</TableCell>
                        <TableCell className="text-[9px] py-1 text-right font-mono">{s.currentFriction.toFixed(1)}</TableCell>
                        <TableCell className="text-[9px] py-1 text-right text-muted-foreground font-mono">{s.previousFriction.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Section 4: Edge Readiness ────────────────────────────────────────

function EdgeReadinessSection({ gates, allowed }: { gates: ScaleGate[]; allowed: boolean }) {
  return (
    <Card className={`border-border/40 ${allowed ? 'bg-neural-green/5' : 'bg-neural-red/5'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Edge Readiness to Scale
          {allowed
            ? <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[9px]">SCALE ALLOWED</Badge>
            : <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 text-[9px]">SCALE BLOCKED</Badge>
          }
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {gates.map((g, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {g.passed
                ? <CheckCircle2 className="w-4 h-4 text-neural-green flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-neural-red flex-shrink-0" />
              }
              <span className={g.passed ? 'text-foreground' : 'text-neural-red font-medium'}>{g.label}</span>
              <span className="ml-auto font-mono text-muted-foreground text-[9px]">{g.value} (need {g.threshold})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Profit Improvement Lab ───────────────────────────────────────────

function ProfitImprovementLab({ suggestions }: { suggestions: ProfitSuggestion[] }) {
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-neural-orange" />
          Profit Improvement Lab
          <Badge variant="outline" className="text-[9px]">Insight Only — No Auto-Apply</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Need more closed trades for suggestions (min 20)</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="p-3 rounded-lg border border-border/30 bg-muted/10">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium">{i + 1}. {s.description}</p>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-[9px] text-muted-foreground">
                        ΔExp: <span className="text-neural-green font-mono">+{s.estimatedDeltaExpectancy.toFixed(2)}p</span>
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Sample: {s.sampleSize}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[8px] ${
                    s.confidence === 'high' ? 'border-neural-green/40 text-neural-green' :
                    s.confidence === 'medium' ? 'border-neural-orange/40 text-neural-orange' :
                    'border-muted-foreground/40'
                  }`}>
                    {s.confidence}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Decision Stream with Learning Tags ───────────────────────────────

function DecisionStream({ events, envKeyShifts }: { events: UsdCadDecisionEvent[]; envKeyShifts: EnvKeyShift[] }) {
  const recent = events.slice(-20).reverse();
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Decision Stream (Last 20)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[9px] py-1">Time</TableHead>
                <TableHead className="text-[9px] py-1">Env</TableHead>
                <TableHead className="text-[9px] py-1">Decision</TableHead>
                <TableHead className="text-[9px] py-1 text-right">Pips</TableHead>
                <TableHead className="text-[9px] py-1">Session</TableHead>
                <TableHead className="text-[9px] py-1">Learning Tag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(e => {
                const tag = computeLearningTag(e, envKeyShifts);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-[9px] py-1 font-mono">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-[9px] py-1">
                      <Badge variant="outline" className="text-[8px]">{e.accountType}</Badge>
                    </TableCell>
                    <TableCell className="text-[9px] py-1">
                      <Badge className={`text-[8px] ${
                        e.finalDecision === 'ENTER' ? 'bg-neural-green/20 text-neural-green' :
                        e.finalDecision === 'BLOCKED' ? 'bg-neural-red/20 text-neural-red' :
                        'bg-muted/30 text-muted-foreground'
                      }`}>
                        {e.finalDecision}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-[9px] py-1 text-right font-mono ${
                      e.pips != null && e.pips > 0 ? 'text-neural-green' :
                      e.pips != null && e.pips < 0 ? 'text-neural-red' : ''
                    }`}>
                      {e.pips != null ? `${e.pips > 0 ? '+' : ''}${e.pips.toFixed(1)}` : '—'}
                    </TableCell>
                    <TableCell className="text-[9px] py-1 font-mono">{e.sessionLabel}</TableCell>
                    <TableCell className="text-[9px] py-1">
                      {tag && (
                        <Badge variant="outline" className={`text-[7px] ${
                          tag === 'Good envKey' || tag === 'Strong edge' ? 'border-neural-green/40 text-neural-green' :
                          tag === 'Degrading envKey' || tag === 'Agent harm risk' || tag === 'Session weak' ? 'border-neural-red/40 text-neural-red' :
                          tag === 'Friction high' ? 'border-neural-orange/40 text-neural-orange' :
                          'border-primary/40 text-primary'
                        }`}>
                          {tag}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV Export Buttons ───────────────────────────────────────────────

function ExportButtons({ events, analysis }: {
  events: UsdCadDecisionEvent[];
  analysis: NonNullable<ReturnType<typeof useUsdCadLearning>['analysis']>;
}) {
  const handleExportDecisions = () => {
    const headers = ['timestamp', 'accountType', 'session', 'envKey', 'decision', 'pips', 'friction', 'govScore'];
    const rows = events.map(e => [
      new Date(e.timestamp).toISOString(),
      e.accountType,
      e.sessionLabel,
      e.envKey,
      e.finalDecision,
      e.pips?.toFixed(2) ?? '',
      e.frictionDrag.toFixed(2),
      e.governanceScore.toFixed(1),
    ]);
    downloadCsv(exportToCsv(headers, rows), 'usdcad_decisions.csv');
  };

  const handleExportEnvKeys = () => {
    const headers = ['envKey', 'currentExp', 'prevExp', 'currentPF', 'friction', 'trades'];
    const rows = analysis.envKeyShifts.map(e => [
      e.envKey, e.currentExpectancy.toFixed(2), e.previousExpectancy.toFixed(2),
      e.currentPF?.toFixed(2) ?? 'NULL', e.currentFrictionDrag.toFixed(2), String(e.trades),
    ]);
    downloadCsv(exportToCsv(headers, rows), 'usdcad_envkey_shifts.csv');
  };

  const handleExportSuggestions = () => {
    const headers = ['suggestion', 'deltaExpectancy', 'sampleSize', 'confidence'];
    const rows = analysis.profitSuggestions.map(s => [
      s.description, s.estimatedDeltaExpectancy.toFixed(2), String(s.sampleSize), s.confidence,
    ]);
    downloadCsv(exportToCsv(headers, rows), 'usdcad_suggestions.csv');
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={handleExportDecisions}>
        <Download className="w-3 h-3 mr-1" /> Decisions
      </Button>
      <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={handleExportEnvKeys}>
        <Download className="w-3 h-3 mr-1" /> EnvKey Shifts
      </Button>
      <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={handleExportSuggestions}>
        <Download className="w-3 h-3 mr-1" /> Suggestions
      </Button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────

export function UsdCadLearningDashboard() {
  const { events, analysis, loading, error, refresh } = useUsdCadLearning();

  if (loading) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardContent className="p-8 text-center">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Loading USD_CAD learning data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardContent className="p-6">
          <p className="text-xs text-neural-red">Error: {error}</p>
          <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardContent className="p-8 text-center">
          <Brain className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No USD_CAD data available. Execute trades to populate learning analytics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-display font-bold">USD/CAD Learning & Convergence</h2>
          <Badge variant="outline" className="text-[9px]">Long-Only · Live-First</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons events={events} analysis={analysis} />
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={refresh}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="learning" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-8">
          <TabsTrigger value="learning" className="text-[10px] gap-1"><Eye className="w-3 h-3" />Learning & Convergence</TabsTrigger>
          <TabsTrigger value="lab" className="text-[10px] gap-1"><Beaker className="w-3 h-3" />Profit Improvement Lab</TabsTrigger>
          <TabsTrigger value="stream" className="text-[10px] gap-1"><Activity className="w-3 h-3" />Decision Stream</TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="space-y-4">
          {/* Sections 1-4 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LearningStatusSection status={analysis.learningStatus} />
            <ConvergenceSection conv50={analysis.convergence50} conv200={analysis.convergence200} />
          </div>
          <WhatChangedSection
            envKeyShifts={analysis.envKeyShifts}
            agentShifts={analysis.agentShifts}
            sessionShifts={analysis.sessionShifts}
          />
          <EdgeReadinessSection gates={analysis.scaleGates} allowed={analysis.scaleAllowed} />
        </TabsContent>

        <TabsContent value="lab" className="space-y-4">
          <ProfitImprovementLab suggestions={analysis.profitSuggestions} />
        </TabsContent>

        <TabsContent value="stream" className="space-y-4">
          <DecisionStream events={events} envKeyShifts={analysis.envKeyShifts} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
