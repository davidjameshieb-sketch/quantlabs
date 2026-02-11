import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dna, Trophy, Shield, Skull, FlaskConical, Download,
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  BarChart3, Users, Activity, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateMockDarwinismData,
  getDarwinismState,
  type DarwinismState,
  type DarwinismTier,
  type PairSurvivorshipScore,
  type SessionDominance,
  type TierTransitionEvent,
} from '@/lib/forex/pairDarwinismEngine';

// ─── Tier Styling ────────────────────────────────────────────────────

const TIER_META: Record<DarwinismTier, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ALPHA: { label: 'Alpha', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: <Trophy className="w-3.5 h-3.5" /> },
  BETA: { label: 'Beta', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: <Shield className="w-3.5 h-3.5" /> },
  GAMMA: { label: 'Gamma', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: <FlaskConical className="w-3.5 h-3.5" /> },
  EXTINCTION: { label: 'Extinction', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: <Skull className="w-3.5 h-3.5" /> },
};

// ─── CSV Export ───────────────────────────────────────────────────────

function exportCSV(pairs: PairSurvivorshipScore[]) {
  const headers = ['Pair', 'Score', 'Tier', 'Multiplier', 'Expectancy', 'Stability', 'Coalition', 'Sessions', 'Friction Penalty'];
  const rows = pairs.map(p => [
    p.pair, p.overallScore, p.tier, p.multiplier,
    p.frictionAdjustedExpectancy, p.stabilityTrend,
    p.coalitionSynergy, p.sessionDominance, p.frictionPenalty,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pair-darwinism-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export const PairDarwinismDashboard = () => {
  const [selectedPair, setSelectedPair] = useState<string | null>(null);

  const state: DarwinismState = useMemo(() => {
    const existing = getDarwinismState();
    if (existing.pairs.length > 0) return existing;
    return generateMockDarwinismData();
  }, []);

  const { pairs, transitions, safetyTriggers, capitalDistribution, systemHealthScore } = state;

  const tierCounts = useMemo(() => {
    const counts: Record<DarwinismTier, number> = { ALPHA: 0, BETA: 0, GAMMA: 0, EXTINCTION: 0 };
    for (const p of pairs) counts[p.tier]++;
    return counts;
  }, [pairs]);

  const selectedData = selectedPair ? pairs.find(p => p.pair === selectedPair) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dna className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Pair Evolution Control Center</h2>
            <p className="text-xs text-muted-foreground">Darwinism-driven capital rotation • {state.totalTradesEvaluated} trades evaluated</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(pairs)} className="text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </motion.div>

      {/* System Health + Tier Distribution */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-xl bg-card/50 border border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">System Health</p>
          <p className={cn('text-xl font-mono font-bold', systemHealthScore > 70 ? 'text-emerald-400' : systemHealthScore > 50 ? 'text-amber-400' : 'text-red-400')}>
            {systemHealthScore}
          </p>
        </motion.div>
        {(['ALPHA', 'BETA', 'GAMMA', 'EXTINCTION'] as DarwinismTier[]).map((tier, i) => (
          <motion.div key={tier} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * (i + 1) }}
            className={cn('p-3 rounded-xl border text-center', TIER_META[tier].bg)}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{TIER_META[tier].label}</p>
            <p className={cn('text-xl font-mono font-bold', TIER_META[tier].color)}>{tierCounts[tier]}</p>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="rankings" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30">
          <TabsTrigger value="rankings" className="text-xs gap-1.5"><BarChart3 className="w-3 h-3" />Rankings</TabsTrigger>
          <TabsTrigger value="capital" className="text-xs gap-1.5"><Gauge className="w-3 h-3" />Capital</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs gap-1.5"><Clock className="w-3 h-3" />Sessions</TabsTrigger>
          <TabsTrigger value="coalitions" className="text-xs gap-1.5"><Users className="w-3 h-3" />Coalitions</TabsTrigger>
          <TabsTrigger value="events" className="text-xs gap-1.5"><Activity className="w-3 h-3" />Event Log</TabsTrigger>
        </TabsList>

        {/* ─── Rankings ─────────────────────────────────────────── */}
        <TabsContent value="rankings" className="space-y-3">
          {pairs.map((p, i) => (
            <motion.div key={p.pair} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className={cn('cursor-pointer transition-all hover:border-primary/30', selectedPair === p.pair && 'border-primary/50 bg-primary/5')}
                onClick={() => setSelectedPair(selectedPair === p.pair ? null : p.pair)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono w-4">#{i + 1}</span>
                      <span className="font-mono font-bold text-sm">{p.pair.replace('_', '/')}</span>
                      <Badge variant="outline" className={cn('text-[10px] gap-1', TIER_META[p.tier].bg, TIER_META[p.tier].color)}>
                        {TIER_META[p.tier].icon} {TIER_META[p.tier].label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className={cn('font-mono font-bold', p.overallScore >= 70 ? 'text-emerald-400' : p.overallScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                        {p.overallScore}
                      </span>
                      <span className="text-muted-foreground">×{p.multiplier}</span>
                    </div>
                  </div>
                  <Progress value={p.overallScore} className="h-1.5 mb-2" />
                  <div className="grid grid-cols-5 gap-2 text-[10px]">
                    <div><span className="text-muted-foreground">Expectancy</span><br /><span className="font-mono">{p.frictionAdjustedExpectancy}p</span></div>
                    <div><span className="text-muted-foreground">Stability</span><br /><span className="font-mono">{p.stabilityTrend}</span></div>
                    <div><span className="text-muted-foreground">Coalition</span><br /><span className="font-mono">{p.coalitionSynergy.toFixed(0)}</span></div>
                    <div><span className="text-muted-foreground">Sessions</span><br /><span className="font-mono">{p.sessionDominance}</span></div>
                    <div><span className="text-muted-foreground">Friction</span><br /><span className="font-mono text-red-400">-{p.frictionPenalty}</span></div>
                  </div>
                  {/* Drill-down */}
                  {selectedPair === p.pair && <PairDrillDown data={p} />}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        {/* ─── Capital Distribution ──────────────────────────────── */}
        <TabsContent value="capital" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" />Capital Allocation Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pairs.filter(p => p.tier !== 'EXTINCTION').map(p => (
                <div key={p.pair} className="flex items-center gap-3">
                  <span className="font-mono text-xs w-16">{p.pair.replace('_', '/')}</span>
                  <Badge variant="outline" className={cn('text-[9px] w-16 justify-center', TIER_META[p.tier].color)}>{p.tier}</Badge>
                  <div className="flex-1">
                    <Progress value={capitalDistribution[p.pair] || 0} className="h-2" />
                  </div>
                  <span className="font-mono text-xs w-14 text-right">{(capitalDistribution[p.pair] || 0).toFixed(1)}%</span>
                  <span className="font-mono text-xs text-muted-foreground w-10 text-right">×{p.multiplier}</span>
                </div>
              ))}
              {pairs.filter(p => p.tier === 'EXTINCTION').length > 0 && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] text-red-400 flex items-center gap-1"><Skull className="w-3 h-3" />Suppressed (Shadow Only)</p>
                  {pairs.filter(p => p.tier === 'EXTINCTION').map(p => (
                    <p key={p.pair} className="text-xs text-muted-foreground font-mono ml-4">{p.pair.replace('_', '/')} — Score {p.overallScore}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Sessions Heatmap ──────────────────────────────────── */}
        <TabsContent value="sessions" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Session Dominance Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left p-1.5">Pair</th>
                      {['london-open', 'ny-overlap', 'asian', 'rollover'].map(s => (
                        <th key={s} className="text-center p-1.5">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map(p => (
                      <tr key={p.pair} className="border-t border-border/20">
                        <td className="p-1.5 font-mono font-medium">{p.pair.replace('_', '/')}</td>
                        {['london-open', 'ny-overlap', 'asian', 'rollover'].map(session => {
                          const sd = p.sessions.find(s => s.session === session);
                          const score = sd?.compositeScore ?? 0;
                          const approval = sd?.approval ?? 'suppressed';
                          return (
                            <td key={session} className="text-center p-1.5">
                              <span className={cn(
                                'inline-block px-2 py-0.5 rounded text-[10px] font-mono',
                                approval === 'full' ? 'bg-emerald-500/15 text-emerald-400' :
                                  approval === 'restricted' ? 'bg-amber-500/15 text-amber-400' :
                                    'bg-red-500/15 text-red-400'
                              )}>
                                {score.toFixed(0)}
                              </span>
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

        {/* ─── Coalitions ────────────────────────────────────────── */}
        <TabsContent value="coalitions" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Coalition Reinforcement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pairs.map(p => (
                <div key={p.pair} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/20 last:border-0">
                  <span className="font-mono w-16">{p.pair.replace('_', '/')}</span>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-muted-foreground">ΔExp</span>{' '}
                      <span className={cn('font-mono', p.coalitions.deltaExpectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {p.coalitions.deltaExpectancy >= 0 ? '+' : ''}{p.coalitions.deltaExpectancy}p
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Harm</span>{' '}
                      <span className={cn('font-mono', p.coalitions.harmRate < 0.45 ? 'text-emerald-400' : 'text-red-400')}>
                        {(p.coalitions.harmRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pairs</span>{' '}
                      <span className="font-mono">{p.coalitions.pairedOpportunities}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Synergy</span>{' '}
                      <span className="font-mono">{p.coalitions.synergyStrength.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Event Log ──────────────────────────────────────────── */}
        <TabsContent value="events" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />Upgrade/Downgrade Events</CardTitle>
            </CardHeader>
            <CardContent>
              {transitions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No tier transitions recorded yet.</p>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {[...transitions].reverse().map((t, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/20">
                    <span className="text-muted-foreground font-mono text-[10px] w-16">
                      {new Date(t.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="font-mono w-16">{t.pair.replace('_', '/')}</span>
                    <Badge variant="outline" className={cn('text-[9px]', TIER_META[t.fromTier].color)}>{t.fromTier}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline" className={cn('text-[9px]', TIER_META[t.toTier].color)}>{t.toTier}</Badge>
                    <span className="text-muted-foreground flex-1 truncate">{t.reason}</span>
                    <span className="font-mono text-muted-foreground">{t.scoreAtTransition}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Safety Triggers */}
          {safetyTriggers.length > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400"><AlertTriangle className="w-4 h-4" />Safety Triggers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {[...safetyTriggers].reverse().slice(0, 20).map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] py-1">
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="font-mono">{t.pair.replace('_', '/')}</span>
                      <Badge variant="outline" className="text-[9px] text-red-400">{t.type}</Badge>
                      <span className="text-muted-foreground">val={t.value.toFixed(2)} thr={t.threshold.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Pair Drill-Down ─────────────────────────────────────────────────

const PairDrillDown = ({ data }: { data: PairSurvivorshipScore }) => {
  const windows = [
    { label: '20-trade', w: data.rollingWindows.w20 },
    { label: '50-trade', w: data.rollingWindows.w50 },
    { label: '100-trade', w: data.rollingWindows.w100 },
  ];

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-border/30 space-y-3">
      {/* Rolling Windows */}
      <div className="grid grid-cols-3 gap-2">
        {windows.map(({ label, w }) => (
          <div key={label} className="p-2 rounded-lg bg-muted/10 border border-border/20">
            <p className="text-[9px] text-muted-foreground uppercase mb-1">{label}</p>
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Trades</span><span className="font-mono">{w.trades}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Exp</span><span className={cn('font-mono', w.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>{w.expectancy}p</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slope</span>
                <span className="flex items-center gap-0.5 font-mono">
                  {w.expectancySlope >= 0 ? <TrendingUp className="w-2.5 h-2.5 text-emerald-400" /> : <TrendingDown className="w-2.5 h-2.5 text-red-400" />}
                  {w.expectancySlope}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">PF</span><span className="font-mono">{w.profitFactor}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Win%</span><span className="font-mono">{(w.winRate * 100).toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">MaxDD</span><span className="font-mono text-red-400">{w.maxDrawdown}p</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Indicator Survivorship */}
      {data.indicators.length > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground uppercase mb-1">Indicator Survivorship</p>
          <div className="flex flex-wrap gap-1.5">
            {data.indicators.map(ind => (
              <Badge key={ind.indicator} variant="outline" className={cn(
                'text-[9px] font-mono',
                ind.survivorshipScore > 70 ? 'text-emerald-400 border-emerald-500/30' :
                  ind.survivorshipScore < 40 ? 'text-red-400 border-red-500/30' :
                    'text-muted-foreground'
              )}>
                {ind.indicator} {ind.survivorshipScore}%
              </Badge>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};
