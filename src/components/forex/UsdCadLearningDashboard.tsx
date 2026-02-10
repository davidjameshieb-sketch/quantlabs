// USD_CAD Fast Ramp Command Center
// Capital routing map, coalition structures, session density, environment clusters,
// safety governors, edge health, and learning convergence.

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Brain, CheckCircle2, XCircle, TrendingUp, TrendingDown, Activity,
  Download, Shield, Lightbulb, ArrowUpRight, ArrowDownRight, Minus,
  Eye, Beaker, Sparkles, Lock, RefreshCw, Zap, Target, AlertTriangle,
  Rocket, Crown, Users, BarChart3, Gauge, ShieldAlert, Radio,
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

// ─── Fast Ramp Mode Banner ───────────────────────────────────────────

function FastRampBanner({ totalEvents, closedTrades }: { totalEvents: number; closedTrades: number }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                FAST RAMP MODE ACTIVE
                <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[9px] animate-pulse">LIVE</Badge>
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Opportunity density expansion · Adaptive capital routing · Accelerated learning loop
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{totalEvents}</div>
              <div className="text-[9px] text-muted-foreground">Total Decisions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{closedTrades}</div>
              <div className="text-[9px] text-muted-foreground">Closed Trades</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Capital Routing Map ──────────────────────────────────────────────

function CapitalRoutingMap({ events }: { events: UsdCadDecisionEvent[] }) {
  const routing = useMemo(() => {
    const closed = events.filter(e => e.pips !== null);
    const sessions = ['asian', 'london-open', 'ny-overlap', 'late-ny', 'rollover'];

    return sessions.map(session => {
      const sessionTrades = closed.filter(e => e.sessionLabel === session || e.sessionLabel.includes(session));
      const totalPips = sessionTrades.reduce((s, e) => s + (e.pips ?? 0), 0);
      const wins = sessionTrades.filter(e => (e.pips ?? 0) > 0).length;
      const winRate = sessionTrades.length > 0 ? wins / sessionTrades.length : 0;
      const expectancy = sessionTrades.length > 0 ? totalPips / sessionTrades.length : 0;

      // Fast Ramp §6: session density scoring
      const densityMultiplier = expectancy > 0.5 ? 1.0 : expectancy > 0 ? 0.85 : expectancy > -0.5 ? 0.65 : 0.3;

      return {
        session,
        trades: sessionTrades.length,
        netPips: totalPips,
        winRate,
        expectancy,
        densityMultiplier,
        isDominant: expectancy > 0.5 && sessionTrades.length >= 5,
      };
    });
  }, [events]);

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Capital Routing Map
          <Badge variant="outline" className="text-[9px]">Fast Ramp §1 · All Sessions</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[9px] py-1">Session</TableHead>
              <TableHead className="text-[9px] py-1 text-right">Trades</TableHead>
              <TableHead className="text-[9px] py-1 text-right">Net Pips</TableHead>
              <TableHead className="text-[9px] py-1 text-right">Win Rate</TableHead>
              <TableHead className="text-[9px] py-1 text-right">Expectancy</TableHead>
              <TableHead className="text-[9px] py-1 text-right">Density</TableHead>
              <TableHead className="text-[9px] py-1">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routing.map(r => (
              <TableRow key={r.session}>
                <TableCell className="text-[9px] py-1 font-mono font-medium">{r.session}</TableCell>
                <TableCell className="text-[9px] py-1 text-right">{r.trades}</TableCell>
                <TableCell className={`text-[9px] py-1 text-right font-mono ${r.netPips >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {r.netPips >= 0 ? '+' : ''}{r.netPips.toFixed(1)}p
                </TableCell>
                <TableCell className="text-[9px] py-1 text-right font-mono">{(r.winRate * 100).toFixed(0)}%</TableCell>
                <TableCell className={`text-[9px] py-1 text-right font-mono ${r.expectancy >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {r.expectancy.toFixed(2)}p
                </TableCell>
                <TableCell className="text-[9px] py-1 text-right font-mono">{r.densityMultiplier.toFixed(2)}×</TableCell>
                <TableCell className="text-[9px] py-1">
                  {r.isDominant ? (
                    <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[8px]">DOMINANT</Badge>
                  ) : r.trades === 0 ? (
                    <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
                  ) : r.expectancy > 0 ? (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px]">ACTIVE</Badge>
                  ) : (
                    <Badge className="bg-neural-orange/20 text-neural-orange border-neural-orange/30 text-[8px]">DEGRADING</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Environment Cluster Boost Panel ──────────────────────────────────

function EnvironmentClusterPanel({ events }: { events: UsdCadDecisionEvent[] }) {
  const clusters = useMemo(() => {
    const closed = events.filter(e => e.pips !== null);
    const envGroups: Record<string, { pips: number[]; friction: number[] }> = {};

    for (const e of closed) {
      if (!envGroups[e.envKey]) envGroups[e.envKey] = { pips: [], friction: [] };
      envGroups[e.envKey].pips.push(e.pips ?? 0);
      envGroups[e.envKey].friction.push(e.frictionDrag);
    }

    return Object.entries(envGroups)
      .map(([envKey, data]) => {
        const netPips = data.pips.reduce((a, b) => a + b, 0);
        const expectancy = data.pips.length > 0 ? netPips / data.pips.length : 0;
        const wins = data.pips.filter(p => p > 0).length;
        const winRate = data.pips.length > 0 ? wins / data.pips.length : 0;
        const avgFriction = data.friction.reduce((a, b) => a + b, 0) / (data.friction.length || 1);
        const grossWin = data.pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
        const grossLoss = Math.abs(data.pips.filter(p => p < 0).reduce((a, b) => a + b, 0));
        const pf = grossLoss > 0.001 ? grossWin / grossLoss : null;

        // Fast Ramp §7: boost/suppress logic
        const boosted = expectancy > 0.3 && data.pips.length >= 3 && (pf === null || pf >= 1.2);
        const suppressed = expectancy < -0.5 || (pf !== null && pf < 0.8);

        return { envKey, trades: data.pips.length, netPips, expectancy, winRate, avgFriction, pf, boosted, suppressed };
      })
      .sort((a, b) => b.expectancy - a.expectancy);
  }, [events]);

  const boostedCount = clusters.filter(c => c.boosted).length;
  const suppressedCount = clusters.filter(c => c.suppressed).length;

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-neural-orange" />
          Environment Reinforcement
          <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[9px]">{boostedCount} boosted</Badge>
          {suppressedCount > 0 && <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 text-[9px]">{suppressedCount} suppressed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-48 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[9px] py-1">EnvKey</TableHead>
                <TableHead className="text-[9px] py-1 text-right">N</TableHead>
                <TableHead className="text-[9px] py-1 text-right">Exp</TableHead>
                <TableHead className="text-[9px] py-1 text-right">WR</TableHead>
                <TableHead className="text-[9px] py-1 text-right">PF</TableHead>
                <TableHead className="text-[9px] py-1">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.slice(0, 12).map(c => (
                <TableRow key={c.envKey}>
                  <TableCell className="text-[9px] py-1 font-mono max-w-[120px] truncate">{c.envKey}</TableCell>
                  <TableCell className="text-[9px] py-1 text-right">{c.trades}</TableCell>
                  <TableCell className={`text-[9px] py-1 text-right font-mono ${c.expectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {c.expectancy.toFixed(2)}p
                  </TableCell>
                  <TableCell className="text-[9px] py-1 text-right font-mono">{(c.winRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-[9px] py-1 text-right font-mono">
                    {c.pf !== null ? c.pf.toFixed(2) : <span className="text-muted-foreground/50">NULL</span>}
                  </TableCell>
                  <TableCell className="text-[9px] py-1">
                    {c.boosted ? (
                      <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[7px]">BOOSTED</Badge>
                    ) : c.suppressed ? (
                      <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 text-[7px]">SUPPRESSED</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[7px]">NORMAL</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Safety Governors Panel ───────────────────────────────────────────

function SafetyGovernorsPanel({ events }: { events: UsdCadDecisionEvent[] }) {
  const safety = useMemo(() => {
    const closed = events.filter(e => e.pips !== null);
    if (closed.length < 5) return null;

    const recentPips = closed.slice(-50).map(e => e.pips ?? 0);
    const totalPips = recentPips.reduce((a, b) => a + b, 0);
    const expectancy = totalPips / recentPips.length;

    const grossWin = recentPips.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(recentPips.filter(p => p < 0).reduce((a, b) => a + b, 0));
    const pf = grossLoss > 0.001 ? grossWin / grossLoss : null;

    // Expectancy slope (last 5 buckets)
    const bucketSize = Math.floor(recentPips.length / 5);
    const exps: number[] = [];
    for (let i = 0; i < 5 && i * bucketSize < recentPips.length; i++) {
      const slice = recentPips.slice(i * bucketSize, (i + 1) * bucketSize);
      if (slice.length > 0) exps.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    const expSlopePositive = exps.length >= 2 && exps[exps.length - 1] >= exps[0];

    // Max drawdown
    let peak = 0, maxDD = 0, cum = 0;
    for (const p of recentPips) {
      cum += p;
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
    }

    // Stability: stddev of recent pips
    const mean = expectancy;
    const variance = recentPips.reduce((s, p) => s + (p - mean) ** 2, 0) / recentPips.length;
    const stddev = Math.sqrt(variance);
    const stabilityOk = stddev < 5;

    const pfOk = pf === null || pf >= 1.2;
    const allClear = pfOk && expSlopePositive && stabilityOk;

    return {
      expectancy,
      pf,
      pfOk,
      expSlopePositive,
      stabilityOk,
      stddev,
      maxDD,
      allClear,
      sampleSize: recentPips.length,
    };
  }, [events]);

  if (!safety) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Need ≥5 closed trades for safety analysis</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-border/40 ${safety.allClear ? 'bg-neural-green/5' : 'bg-neural-red/5'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          Safety Acceleration Governors
          {safety.allClear ? (
            <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 text-[9px]">ALL CLEAR</Badge>
          ) : (
            <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 text-[9px] animate-pulse">ALERT</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-xs">
            {safety.pfOk ? <CheckCircle2 className="w-4 h-4 text-neural-green" /> : <XCircle className="w-4 h-4 text-neural-red" />}
            <span>PF ≥ 1.2 safety threshold</span>
            <span className="ml-auto font-mono text-muted-foreground">{safety.pf !== null ? safety.pf.toFixed(2) : 'NULL'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {safety.expSlopePositive ? <CheckCircle2 className="w-4 h-4 text-neural-green" /> : <XCircle className="w-4 h-4 text-neural-red" />}
            <span>Expectancy slope positive</span>
            <span className="ml-auto font-mono text-muted-foreground">{safety.expectancy.toFixed(2)}p</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {safety.stabilityOk ? <CheckCircle2 className="w-4 h-4 text-neural-green" /> : <XCircle className="w-4 h-4 text-neural-red" />}
            <span>Stability (σ &lt; 5)</span>
            <span className="ml-auto font-mono text-muted-foreground">σ={safety.stddev.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <span>Max Drawdown</span>
            <span className="ml-auto font-mono text-muted-foreground">{safety.maxDD.toFixed(1)}p</span>
          </div>
        </div>
        {!safety.allClear && (
          <div className="mt-2 p-2 rounded bg-neural-red/10 border border-neural-red/20">
            <p className="text-[10px] text-neural-red font-medium">
              ⚠ Safety governor triggered — capital exposure should be reduced immediately per Fast Ramp §8
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Coalition Structure Panel ────────────────────────────────────────

function CoalitionStructurePanel({ events }: { events: UsdCadDecisionEvent[] }) {
  const coalitions = useMemo(() => {
    const agentStats: Record<string, { trades: number; wins: number; totalPips: number }> = {};
    const closed = events.filter(e => e.pips !== null);

    for (const e of closed) {
      for (const v of e.agentVotes) {
        if (!agentStats[v.agentId]) agentStats[v.agentId] = { trades: 0, wins: 0, totalPips: 0 };
        agentStats[v.agentId].trades++;
        agentStats[v.agentId].totalPips += e.pips ?? 0;
        if ((e.pips ?? 0) > 0) agentStats[v.agentId].wins++;
      }
    }

    return Object.entries(agentStats)
      .map(([agentId, stats]) => ({
        agentId,
        ...stats,
        expectancy: stats.trades > 0 ? stats.totalPips / stats.trades : 0,
        winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
        role: stats.trades > 0 && stats.totalPips / stats.trades > 0 && stats.wins / stats.trades >= 0.55
          ? 'CHAMPION' : stats.totalPips > 0 ? 'STABILIZER' : stats.totalPips > -50 ? 'SPECIALIST' : 'DILUTER',
      }))
      .sort((a, b) => b.expectancy - a.expectancy);
  }, [events]);

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crown className="w-4 h-4 text-neural-orange" />
          Agent Coalition Structure
          <Badge variant="outline" className="text-[9px]">Fast Ramp §5</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {coalitions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No agent data available</p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[9px] py-1">Agent</TableHead>
                  <TableHead className="text-[9px] py-1 text-right">Trades</TableHead>
                  <TableHead className="text-[9px] py-1 text-right">Exp</TableHead>
                  <TableHead className="text-[9px] py-1 text-right">WR</TableHead>
                  <TableHead className="text-[9px] py-1">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coalitions.map(c => (
                  <TableRow key={c.agentId}>
                    <TableCell className="text-[9px] py-1 font-mono">{c.agentId}</TableCell>
                    <TableCell className="text-[9px] py-1 text-right">{c.trades}</TableCell>
                    <TableCell className={`text-[9px] py-1 text-right font-mono ${c.expectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                      {c.expectancy.toFixed(2)}p
                    </TableCell>
                    <TableCell className="text-[9px] py-1 text-right font-mono">{(c.winRate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-[9px] py-1">
                      <Badge className={`text-[7px] ${
                        c.role === 'CHAMPION' ? 'bg-neural-green/20 text-neural-green border-neural-green/30' :
                        c.role === 'STABILIZER' ? 'bg-primary/20 text-primary border-primary/30' :
                        c.role === 'SPECIALIST' ? 'bg-neural-orange/20 text-neural-orange border-neural-orange/30' :
                        'bg-neural-red/20 text-neural-red border-neural-red/30'
                      }`}>{c.role}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Reused sub-components ────────────────────────────────────────────

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/50">
      {active ? <CheckCircle2 className="w-4 h-4 text-neural-green" /> : <XCircle className="w-4 h-4 text-muted-foreground/50" />}
      <span className="text-xs font-medium">{label}</span>
      <Badge variant={active ? 'default' : 'outline'} className="text-[9px] ml-auto">{active ? 'ON' : 'OFF'}</Badge>
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
          <Badge variant="outline" className="text-[9px]">Fast Ramp §4</Badge>
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

        {conv200 && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="text-[10px] text-muted-foreground mb-2 font-medium">Last 200 vs Previous 200</div>
            <MetricDelta label="Expectancy" current={conv200.current.expectancy} previous={conv200.previous.expectancy} unit="p" />
            <MetricDelta label="Win Rate" current={conv200.current.winRate * 100} previous={conv200.previous.winRate * 100} unit="%" />
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
              {g.passed ? <CheckCircle2 className="w-4 h-4 text-neural-green flex-shrink-0" /> : <XCircle className="w-4 h-4 text-neural-red flex-shrink-0" />}
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
                      <span className="text-[9px] text-muted-foreground">Sample: {s.sampleSize}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[8px] ${
                    s.confidence === 'high' ? 'border-neural-green/40 text-neural-green' :
                    s.confidence === 'medium' ? 'border-neural-orange/40 text-neural-orange' :
                    'border-muted-foreground/40'
                  }`}>{s.confidence}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Decision Stream ──────────────────────────────────────────────────

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
                      }`}>{e.finalDecision}</Badge>
                    </TableCell>
                    <TableCell className={`text-[9px] py-1 text-right font-mono ${
                      e.pips != null && e.pips > 0 ? 'text-neural-green' : e.pips != null && e.pips < 0 ? 'text-neural-red' : ''
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
                        }`}>{tag}</Badge>
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
      new Date(e.timestamp).toISOString(), e.accountType, e.sessionLabel, e.envKey,
      e.finalDecision, e.pips?.toFixed(2) ?? '', e.frictionDrag.toFixed(2), e.governanceScore.toFixed(1),
    ]);
    downloadCsv(exportToCsv(headers, rows), 'usdcad_decisions.csv');
  };

  return (
    <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={handleExportDecisions}>
      <Download className="w-3 h-3 mr-1" /> Export
    </Button>
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
          <p className="text-xs text-muted-foreground">Loading Fast Ramp data...</p>
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
          <Rocket className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No USD_CAD data available. Execute trades to populate Fast Ramp analytics.</p>
        </CardContent>
      </Card>
    );
  }

  const closedTrades = events.filter(e => e.pips !== null).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-display font-bold">USD/CAD Fast Ramp Command Center</h2>
          <Badge variant="outline" className="text-[9px]">Long-Only · All Sessions · Live</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons events={events} analysis={analysis} />
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={refresh}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Fast Ramp Banner */}
      <FastRampBanner totalEvents={events.length} closedTrades={closedTrades} />

      {/* Main Tabs */}
      <Tabs defaultValue="command" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-8">
          <TabsTrigger value="command" className="text-[10px] gap-1"><Rocket className="w-3 h-3" />Command Center</TabsTrigger>
          <TabsTrigger value="learning" className="text-[10px] gap-1"><Eye className="w-3 h-3" />Learning & Convergence</TabsTrigger>
          <TabsTrigger value="lab" className="text-[10px] gap-1"><Beaker className="w-3 h-3" />Profit Lab</TabsTrigger>
          <TabsTrigger value="stream" className="text-[10px] gap-1"><Activity className="w-3 h-3" />Decision Stream</TabsTrigger>
        </TabsList>

        {/* Command Center — Capital routing, coalitions, env clusters, safety */}
        <TabsContent value="command" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CapitalRoutingMap events={events} />
            <CoalitionStructurePanel events={events} />
          </div>
          <EnvironmentClusterPanel events={events} />
          <SafetyGovernorsPanel events={events} />
          <EdgeReadinessSection gates={analysis.scaleGates} allowed={analysis.scaleAllowed} />
        </TabsContent>

        {/* Learning & Convergence */}
        <TabsContent value="learning" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LearningStatusSection status={analysis.learningStatus} />
            <ConvergenceSection conv50={analysis.convergence50} conv200={analysis.convergence200} />
          </div>
          <WhatChangedSection
            envKeyShifts={analysis.envKeyShifts}
            agentShifts={analysis.agentShifts}
            sessionShifts={analysis.sessionShifts}
          />
        </TabsContent>

        {/* Profit Lab */}
        <TabsContent value="lab" className="space-y-4">
          <ProfitImprovementLab suggestions={analysis.profitSuggestions} />
        </TabsContent>

        {/* Decision Stream */}
        <TabsContent value="stream" className="space-y-4">
          <DecisionStream events={events} envKeyShifts={analysis.envKeyShifts} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
