// Darwin Control Dashboard
// Unified monitoring for the Live Darwin Execution Engine
// Shows: survivorship trends, tier transitions, capital weights, agent authority,
// coalition reinforcement, indicator evolution, session routing, safety event log.

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dna, Trophy, Shield, Skull, FlaskConical,
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  BarChart3, Users, Activity, Gauge, Brain,
  Zap, ShieldAlert, Minus, ChevronRight, Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateMockLiveDarwinState,
  getLiveDarwinState,
  type LiveDarwinState,
  type AgentAuthority,
  type SessionAuthority,
  type CoalitionReinforcement,
  type IndicatorWeight,
  type SafetyReaction,
  type ExpectancySlopeWarning,
} from '@/lib/forex/liveDarwinEngine';
import type { DarwinismTier } from '@/lib/forex/pairDarwinismEngine';

// ─── Tier Styling ────────────────────────────────────────────────────

const TIER_META: Record<DarwinismTier, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ALPHA: { label: 'Alpha', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: <Trophy className="w-3.5 h-3.5" /> },
  BETA: { label: 'Beta', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: <Shield className="w-3.5 h-3.5" /> },
  GAMMA: { label: 'Gamma', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: <FlaskConical className="w-3.5 h-3.5" /> },
  EXTINCTION: { label: 'Extinction', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: <Skull className="w-3.5 h-3.5" /> },
};

const ROLE_STYLE: Record<string, { color: string; label: string }> = {
  FULL_TRADE: { color: 'text-emerald-400', label: 'Full Trade' },
  CONFIRMATION_ONLY: { color: 'text-amber-400', label: 'Confirm Only' },
  DISABLED: { color: 'text-red-400', label: 'Disabled' },
};

const PERMISSION_STYLE: Record<string, { color: string; label: string }> = {
  BOOSTED: { color: 'text-emerald-400', label: 'Boosted' },
  NEUTRAL: { color: 'text-muted-foreground', label: 'Neutral' },
  REDUCED: { color: 'text-amber-400', label: 'Reduced' },
  BLOCKED: { color: 'text-red-400', label: 'Blocked' },
};

// ─── Main Dashboard ──────────────────────────────────────────────────

export const DarwinControlDashboard = () => {
  const state: LiveDarwinState = useMemo(() => {
    const existing = getLiveDarwinState();
    if (existing.darwinism.pairs.length > 0) return existing;
    return generateMockLiveDarwinState();
  }, []);

  const { darwinism, agentAuthorities, sessionAuthorities, coalitionReinforcements,
    indicatorWeights, safetyReactions, expectancyWarnings, mode, tradesProcessed } = state;

  const tierCounts = useMemo(() => {
    const counts: Record<DarwinismTier, number> = { ALPHA: 0, BETA: 0, GAMMA: 0, EXTINCTION: 0 };
    for (const p of darwinism.pairs) counts[p.tier]++;
    return counts;
  }, [darwinism.pairs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dna className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Darwin Execution Control</h2>
            <p className="text-xs text-muted-foreground">
              Live adaptive capital routing • {tradesProcessed} trades processed
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant={mode === 'ACTIVE' ? 'default' : 'destructive'} className="text-[10px] gap-1">
            <Radio className="w-3 h-3" />
            {mode === 'ACTIVE' ? 'Darwin Active' : 'Fallback Governance'}
          </Badge>
        </div>
      </motion.div>

      {/* System Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <SummaryCard label="System Health" value={darwinism.systemHealthScore} color={darwinism.systemHealthScore > 70 ? 'emerald' : darwinism.systemHealthScore > 50 ? 'amber' : 'red'} />
        {(['ALPHA', 'BETA', 'GAMMA', 'EXTINCTION'] as DarwinismTier[]).map((tier, i) => (
          <motion.div key={tier} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * (i + 1) }}
            className={cn('p-3 rounded-xl border text-center', TIER_META[tier].bg)}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{TIER_META[tier].label}</p>
            <p className={cn('text-xl font-mono font-bold', TIER_META[tier].color)}>{tierCounts[tier]}</p>
          </motion.div>
        ))}
        <SummaryCard label="Safety Events" value={safetyReactions.length}
          color={safetyReactions.length === 0 ? 'emerald' : safetyReactions.length <= 2 ? 'amber' : 'red'} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="capital" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="capital" className="text-xs gap-1.5"><Gauge className="w-3 h-3" />Capital Allocation</TabsTrigger>
          <TabsTrigger value="agents" className="text-xs gap-1.5"><Brain className="w-3 h-3" />Agent Authority</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs gap-1.5"><Clock className="w-3 h-3" />Session Routing</TabsTrigger>
          <TabsTrigger value="coalitions" className="text-xs gap-1.5"><Users className="w-3 h-3" />Coalition Map</TabsTrigger>
          <TabsTrigger value="indicators" className="text-xs gap-1.5"><Activity className="w-3 h-3" />Indicator Weights</TabsTrigger>
          <TabsTrigger value="warnings" className="text-xs gap-1.5"><TrendingDown className="w-3 h-3" />Early Warnings</TabsTrigger>
          <TabsTrigger value="safety" className="text-xs gap-1.5"><ShieldAlert className="w-3 h-3" />Safety Log</TabsTrigger>
        </TabsList>

        {/* ─── Capital Allocation ─── */}
        <TabsContent value="capital" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                Live Capital Weight Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {darwinism.pairs.map((p, i) => {
                const level = p.overallScore >= 75 ? 'TOP_TIER' : p.overallScore >= 60 ? 'STRONG' : p.overallScore >= 45 ? 'NEUTRAL' : p.overallScore >= 25 ? 'WEAK' : 'FAILING';
                const expWarning = expectancyWarnings.find(w => w.pair === p.pair);
                return (
                  <motion.div key={p.pair} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3">
                    <span className="font-mono text-xs w-16 shrink-0">{p.pair.replace('_', '/')}</span>
                    <Badge variant="outline" className={cn('text-[9px] w-20 justify-center gap-1', TIER_META[p.tier].color, TIER_META[p.tier].bg)}>
                      {TIER_META[p.tier].icon} {p.tier}
                    </Badge>
                    <div className="flex-1">
                      <Progress value={p.overallScore} className="h-2" />
                    </div>
                    <span className={cn('font-mono text-xs w-10 text-right font-bold',
                      p.overallScore >= 70 ? 'text-emerald-400' : p.overallScore >= 50 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {p.overallScore}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground w-10 text-right">×{p.multiplier}</span>
                    <span className={cn('text-[9px] w-14 text-right',
                      level === 'TOP_TIER' ? 'text-emerald-400' : level === 'STRONG' ? 'text-emerald-400/70' :
                        level === 'NEUTRAL' ? 'text-amber-400' : level === 'WEAK' ? 'text-amber-400/70' : 'text-red-400'
                    )}>
                      {level.replace('_', ' ')}
                    </span>
                    {expWarning && expWarning.direction !== 'FLAT' && (
                      <span className={cn('text-[9px]',
                        expWarning.direction === 'RISING' ? 'text-emerald-400' : 'text-red-400'
                      )}>
                        {expWarning.direction === 'RISING' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Agent Authority ─── */}
        <TabsContent value="agents" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                Agent Authority Rankings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {agentAuthorities.map((a, i) => (
                <motion.div key={a.agentId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  className="p-3 rounded-lg border border-border/20 bg-background/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-4">#{i + 1}</span>
                      <span className="font-mono text-sm font-medium">{a.agentId}</span>
                      <Badge variant="outline" className={cn('text-[9px]', ROLE_STYLE[a.role]?.color)}>
                        {ROLE_STYLE[a.role]?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={cn('font-mono font-bold',
                        a.authorityScore >= 60 ? 'text-emerald-400' : a.authorityScore >= 40 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {a.authorityScore}
                      </span>
                      <span className="text-muted-foreground">×{a.capitalMultiplier}</span>
                      <span className={cn('font-mono text-[10px]',
                        a.expectancySlope > 0 ? 'text-emerald-400' : a.expectancySlope < 0 ? 'text-red-400' : 'text-muted-foreground'
                      )}>
                        {a.expectancySlope > 0 ? '↑' : a.expectancySlope < 0 ? '↓' : '—'} {a.expectancySlope}p
                      </span>
                    </div>
                  </div>
                  <Progress value={a.authorityScore} className="h-1.5 mb-1.5" />
                  <div className="flex gap-2 flex-wrap">
                    {a.reasoning.map((r, ri) => (
                      <span key={ri} className="text-[9px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{r}</span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Session Routing ─── */}
        <TabsContent value="sessions" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Session × Pair Trade Authorization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/30">
                      <th className="text-left p-2">Pair</th>
                      {['london-open', 'ny-overlap', 'asian', 'rollover'].map(s => (
                        <th key={s} className="text-center p-2 capitalize">{s.replace('-', ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {darwinism.pairs.map(p => (
                      <tr key={p.pair} className="border-b border-border/10">
                        <td className="p-2 font-mono font-medium">{p.pair.replace('_', '/')}</td>
                        {['london-open', 'ny-overlap', 'asian', 'rollover'].map(session => {
                          const sa = sessionAuthorities.find(s => s.pair === p.pair && s.session === session);
                          return (
                            <td key={session} className="text-center p-2">
                              {sa ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={cn(
                                    'inline-block px-2 py-0.5 rounded text-[10px] font-mono',
                                    sa.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                  )}>
                                    ×{sa.positionSizeMultiplier}
                                  </span>
                                  <span className="text-[8px] text-muted-foreground">
                                    {(sa.weight * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Coalition Map ─── */}
        <TabsContent value="coalitions" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Coalition Reinforcement Map
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {coalitionReinforcements.map((c, i) => (
                <motion.div key={c.coalitionKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 text-xs py-2 border-b border-border/20 last:border-0">
                  <span className="font-mono w-16">{c.coalitionKey.replace('_', '/')}</span>
                  <Badge variant="outline" className={cn('text-[9px] w-16 justify-center', PERMISSION_STYLE[c.permission]?.color)}>
                    {PERMISSION_STYLE[c.permission]?.label}
                  </Badge>
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-muted-foreground">ΔExp </span>
                      <span className={cn('font-mono', c.deltaExpectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {c.deltaExpectancy >= 0 ? '+' : ''}{c.deltaExpectancy}p
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Harm </span>
                      <span className={cn('font-mono', c.harmRate < 0.3 ? 'text-emerald-400' : c.harmRate < 0.5 ? 'text-amber-400' : 'text-red-400')}>
                        {(c.harmRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Auth </span>
                      <span className="font-mono">×{c.authorityMultiplier}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Indicator Weights ─── */}
        <TabsContent value="indicators" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Indicator Survivorship Weights
                <span className="text-[9px] text-muted-foreground ml-2">Weight = Backtest×0.4 + Live×0.6</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {indicatorWeights.map((ind, i) => (
                <motion.div key={ind.indicator} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3">
                  <span className="font-mono text-xs w-20 shrink-0">{ind.indicator}</span>
                  <Badge variant="outline" className={cn('text-[9px] w-20 justify-center',
                    ind.status === 'ACTIVE' ? 'text-emerald-400 border-emerald-500/30' :
                      ind.status === 'DOWNGRADED' ? 'text-amber-400 border-amber-500/30' :
                        'text-red-400 border-red-500/30'
                  )}>
                    {ind.status}
                  </Badge>
                  <div className="flex-1 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[9px]">Backtest</span>
                      <div className="flex items-center gap-1">
                        <Progress value={ind.backtestScore} className="h-1 flex-1" />
                        <span className="font-mono w-8 text-right text-[10px]">{ind.backtestScore}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[9px]">Live</span>
                      <div className="flex items-center gap-1">
                        <Progress value={ind.liveScore} className="h-1 flex-1" />
                        <span className="font-mono w-8 text-right text-[10px]">{ind.liveScore}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[9px]">Combined</span>
                      <div className="flex items-center gap-1">
                        <span className={cn('font-mono font-bold text-[11px]',
                          ind.compositeWeight >= 60 ? 'text-emerald-400' : ind.compositeWeight >= 40 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {ind.compositeWeight}
                        </span>
                        {ind.trend === 'rising' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                        {ind.trend === 'falling' && <TrendingDown className="w-3 h-3 text-red-400" />}
                        {ind.trend === 'stable' && <Minus className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Early Warnings ─── */}
        <TabsContent value="warnings" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" />
                Expectancy Slope Early Warning System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expectancyWarnings.map((w, i) => (
                <motion.div key={w.pair} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className={cn(
                    'flex items-center gap-3 text-xs py-2.5 px-3 rounded-lg border',
                    w.direction === 'RISING' ? 'bg-emerald-500/5 border-emerald-500/20' :
                      w.direction === 'FALLING' ? 'bg-red-500/5 border-red-500/20' :
                        'bg-muted/20 border-border/20'
                  )}>
                  <span className="font-mono font-medium w-16">{w.pair.replace('_', '/')}</span>
                  {w.direction === 'RISING' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
                    w.direction === 'FALLING' ? <TrendingDown className="w-4 h-4 text-red-400" /> :
                      <Minus className="w-4 h-4 text-muted-foreground" />}
                  <span className={cn('font-mono font-bold',
                    w.slope > 0 ? 'text-emerald-400' : w.slope < 0 ? 'text-red-400' : 'text-muted-foreground'
                  )}>
                    {w.slope > 0 ? '+' : ''}{w.slope}p/trade
                  </span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className={cn('text-[9px]',
                    w.action === 'INCREASE_ALLOCATION' ? 'text-emerald-400 border-emerald-500/30' :
                      w.action === 'REDUCE_FREQUENCY' ? 'text-red-400 border-red-500/30' :
                        'text-muted-foreground'
                  )}>
                    {w.action.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    {w.confidence}% conf
                  </span>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Safety Log ─── */}
        <TabsContent value="safety" className="space-y-3">
          {safetyReactions.length === 0 ? (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="py-8 text-center">
                <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-400 font-medium">No Safety Triggers Active</p>
                <p className="text-xs text-muted-foreground mt-1">All pairs operating within normal parameters.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                  Active Safety Reactions ({safetyReactions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {safetyReactions.map((sr, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    className="p-3 rounded-lg border border-red-500/20 bg-background/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">
                        {sr.trigger.type}
                      </Badge>
                      <span className="font-mono text-xs">{sr.trigger.pair.replace('_', '/')}</span>
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {new Date(sr.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{sr.action}</p>
                    <div className="flex gap-3 mt-1.5 text-[9px]">
                      {sr.capitalReduction > 0 && (
                        <span className="text-red-400">Capital −{(sr.capitalReduction * 100).toFixed(0)}%</span>
                      )}
                      {sr.freezeCoalitions && (
                        <span className="text-amber-400">Coalitions Frozen</span>
                      )}
                      {sr.restrictToTopAgent && (
                        <span className="text-amber-400">Top Agent Only</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Shared Components ───────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-xl bg-card/50 border border-border/50 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn('text-xl font-mono font-bold',
        color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-red-400'
      )}>
        {value}
      </p>
    </motion.div>
  );
}
