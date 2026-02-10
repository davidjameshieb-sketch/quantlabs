// Edge + Governance Filter Simulator Dashboard
// Analysis/simulation only — shows how expectancy changes with governance + edge filters.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Download, ChevronDown, ChevronUp,
  ShieldAlert, TrendingUp, TrendingDown, AlertTriangle,
  Ban, Eye, Minus, Shield, Zap, Target,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeOandaOrders } from '@/lib/forex/edgeDiscoveryEngine';
import {
  runEdgeGovernanceSimulation,
  exportPairSummaryCSV,
  exportScenariosCSV,
  defaultConfig,
  DATE_RANGE_OPTIONS,
  type SimulatorResult,
  type PairSimResult,
  type SimulatorConfig,
  type SimMetrics,
  type EdgeDiminishedScenario,
  type GlobalEdgeKiller,
} from '@/lib/forex/edgeGovernanceSimulator';
import { toDisplaySymbol } from '@/lib/forex/forexSymbolMap';
import { cn } from '@/lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────

function MetricDelta({ baseline, filtered, label, invert }: {
  baseline: number; filtered: number; label: string; invert?: boolean;
}) {
  const delta = filtered - baseline;
  const isGood = invert ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.01;
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn(
        'font-mono font-semibold',
        isNeutral ? 'text-muted-foreground' : isGood ? 'text-emerald-400' : 'text-red-400',
      )}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
      </span>
    </div>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const styles = {
    1: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    2: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    3: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  const labels = { 1: 'TIER 1', 2: 'TIER 2', 3: 'TIER 3' };
  return <Badge variant="outline" className={cn('text-[9px] font-mono', styles[tier])}>{labels[tier]}</Badge>;
}

function RecBadge({ rec }: { rec: string }) {
  if (rec === 'BLOCK') return <Badge variant="outline" className="text-[9px] bg-red-500/20 text-red-400 border-red-500/30 gap-0.5"><Ban className="w-2.5 h-2.5" />BLOCK</Badge>;
  if (rec === 'RESTRICT') return <Badge variant="outline" className="text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30 gap-0.5"><ShieldAlert className="w-2.5 h-2.5" />RESTRICT</Badge>;
  return <Badge variant="outline" className="text-[9px] bg-blue-500/20 text-blue-400 border-blue-500/30 gap-0.5"><Eye className="w-2.5 h-2.5" />SHADOW</Badge>;
}

function MetricCell({ value, suffix, good, bad }: { value: number; suffix?: string; good?: number; bad?: number }) {
  let color = 'text-foreground';
  if (good !== undefined && value >= good) color = 'text-emerald-400';
  else if (bad !== undefined && value <= bad) color = 'text-red-400';
  else if (good !== undefined || bad !== undefined) color = 'text-amber-400';
  return <span className={cn('font-mono text-[11px]', color)}>{value.toFixed(2)}{suffix || ''}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────

export function EdgeGovernanceSimulatorDashboard() {
  const [result, setResult] = useState<SimulatorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<keyof typeof DATE_RANGE_OPTIONS>('6M');
  const [includeBacktest, setIncludeBacktest] = useState(false);
  const [minSample, setMinSample] = useState(40);
  const [collapseThreshold, setCollapseThreshold] = useState(20);

  const config = useMemo<SimulatorConfig>(() => ({
    minSampleThreshold: minSample,
    collapseThresholdPct: collapseThreshold,
    dateRangeMs: DATE_RANGE_OPTIONS[dateRange],
    includeBacktest,
  }), [dateRange, includeBacktest, minSample, collapseThreshold]);

  const fetchAndSimulate = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch raw trades with necessary columns
      const { data: raw } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, environment, direction, direction_engine, entry_price, exit_price, spread_at_entry, slippage_pips, governance_composite, confidence_score, session_label, regime_label, agent_id, friction_score, gate_result, status, created_at, closed_at, execution_quality_score')
        .in('status', ['closed', 'filled'])
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (!raw || raw.length === 0) {
        setResult({ pairs: [], globalKillers: [], config, totalTradesAnalyzed: 0 });
        setLoading(false);
        return;
      }

      const normalized = normalizeOandaOrders(raw);
      const simResult = runEdgeGovernanceSimulation(normalized, config);
      setResult(simResult);
    } catch (e) {
      console.error('Simulator error:', e);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => { fetchAndSimulate(); }, [fetchAndSimulate]);

  const handleExportPairs = useCallback(() => {
    if (!result) return;
    const csv = exportPairSummaryCSV(result.pairs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'edge-governance-pairs.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handleExportScenarios = useCallback(() => {
    if (!result) return;
    const csv = exportScenariosCSV(result.pairs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'edge-diminished-scenarios.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const tiers = useMemo(() => {
    if (!result) return { t1: [], t2: [], t3: [] };
    return {
      t1: result.pairs.filter(p => p.tier === 1),
      t2: result.pairs.filter(p => p.tier === 2),
      t3: result.pairs.filter(p => p.tier === 3),
    };
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-display font-bold">Edge + Governance Filter Simulator</h2>
                <p className="text-[10px] text-muted-foreground">
                  {loading ? 'Analyzing...' : `${result?.totalTradesAnalyzed ?? 0} trades analyzed · ${result?.pairs.length ?? 0} pairs`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as keyof typeof DATE_RANGE_OPTIONS)}>
                <SelectTrigger className="w-20 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(DATE_RANGE_OPTIONS).map(k => (
                    <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Switch checked={includeBacktest} onCheckedChange={setIncludeBacktest} className="scale-75" />
                <span className="text-[10px] text-muted-foreground">Backtest</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Min sample:</span>
                <Select value={String(minSample)} onValueChange={(v) => setMinSample(Number(v))}>
                  <SelectTrigger className="w-16 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[20, 30, 40, 50, 100].map(n => (
                      <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={handleExportPairs}>
                <Download className="w-3 h-3" />Pairs CSV
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={handleExportScenarios}>
                <Download className="w-3 h-3" />Scenarios CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="bg-card/40 border-border/20">
          <CardContent className="p-8 text-center">
            <div className="animate-pulse text-muted-foreground text-sm">Running simulation...</div>
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <Tabs defaultValue="comparison" className="space-y-3">
          <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
            <TabsTrigger value="comparison" className="text-[10px] gap-1"><Target className="w-3 h-3" />Pair Comparison</TabsTrigger>
            <TabsTrigger value="scenarios" className="text-[10px] gap-1"><ShieldAlert className="w-3 h-3" />Edge Diminished</TabsTrigger>
            <TabsTrigger value="global-killers" className="text-[10px] gap-1"><AlertTriangle className="w-3 h-3" />Global Killers</TabsTrigger>
          </TabsList>

          {/* TAB 1: Pair Comparison Table */}
          <TabsContent value="comparison" className="space-y-3">
            {[
              { label: 'Tier 1 — Deploy Capital', pairs: tiers.t1, color: 'text-emerald-400', icon: Zap },
              { label: 'Tier 2 — Conditional Deploy', pairs: tiers.t2, color: 'text-amber-400', icon: Shield },
              { label: 'Tier 3 — Restrict / Shadow', pairs: tiers.t3, color: 'text-red-400', icon: Ban },
            ].map(({ label, pairs, color, icon: Icon }) => pairs.length > 0 && (
              <Card key={label} className="bg-card/50 border-border/30">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <Icon className={cn('w-3.5 h-3.5', color)} />
                    <span className={color}>{label}</span>
                    <Badge variant="outline" className="text-[9px] ml-1">{pairs.length} pairs</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[9px]">
                          <TableHead className="w-20">Pair</TableHead>
                          <TableHead className="text-center">Score</TableHead>
                          <TableHead className="text-center" colSpan={4}>Baseline</TableHead>
                          <TableHead className="text-center" colSpan={4}>Gov Filtered</TableHead>
                          <TableHead className="text-center" colSpan={4}>Edge Filtered</TableHead>
                          <TableHead className="text-center" colSpan={3}>Edge-Only</TableHead>
                          <TableHead>Verdict</TableHead>
                        </TableRow>
                        <TableRow className="text-[8px] text-muted-foreground">
                          <TableHead />
                          <TableHead />
                          <TableHead className="text-center">Exp</TableHead>
                          <TableHead className="text-center">PF</TableHead>
                          <TableHead className="text-center">DD</TableHead>
                          <TableHead className="text-center">Sh</TableHead>
                          <TableHead className="text-center">Exp</TableHead>
                          <TableHead className="text-center">PF</TableHead>
                          <TableHead className="text-center">Cov%</TableHead>
                          <TableHead className="text-center">ΔExp</TableHead>
                          <TableHead className="text-center">Exp</TableHead>
                          <TableHead className="text-center">PF</TableHead>
                          <TableHead className="text-center">Cov%</TableHead>
                          <TableHead className="text-center">Δ</TableHead>
                          <TableHead className="text-center">Exp</TableHead>
                          <TableHead className="text-center">PF</TableHead>
                          <TableHead className="text-center">Cov%</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pairs.map(p => (
                          <PairRow key={p.pair} pair={p} expanded={expandedPair === p.pair} onToggle={() => setExpandedPair(expandedPair === p.pair ? null : p.pair)} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* TAB 2: Edge Diminished Scenarios */}
          <TabsContent value="scenarios" className="space-y-3">
            {result.pairs.filter(p => p.diminishedScenarios.length > 0).map(p => (
              <Card key={p.pair} className="bg-card/50 border-border/30">
                <Collapsible>
                  <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/10 rounded-t-lg transition-colors">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={p.tier} />
                      <span className="text-xs font-mono font-bold">{toDisplaySymbol(p.pair)}</span>
                      <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">
                        {p.diminishedScenarios.length} edge killers
                      </Badge>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[9px]">
                            <TableHead>Session</TableHead>
                            <TableHead>Regime</TableHead>
                            <TableHead>Direction</TableHead>
                            <TableHead>Spread</TableHead>
                            <TableHead>Composite</TableHead>
                            <TableHead className="text-center">Trades</TableHead>
                            <TableHead className="text-center">Exp</TableHead>
                            <TableHead className="text-center">Fric.Adj</TableHead>
                            <TableHead className="text-center">PF</TableHead>
                            <TableHead className="text-center">MaxDD</TableHead>
                            <TableHead className="text-center">Δ Base</TableHead>
                            <TableHead>Cut</TableHead>
                            <TableHead>Reasons</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.diminishedScenarios.map((s, i) => (
                            <TableRow key={i} className="text-[10px]">
                              <TableCell className="font-mono">{s.session}</TableCell>
                              <TableCell className="font-mono">{s.regime}</TableCell>
                              <TableCell className="font-mono">{s.direction}</TableCell>
                              <TableCell className="font-mono">{s.spreadBucket}</TableCell>
                              <TableCell className="font-mono">{s.compositeDecile}</TableCell>
                              <TableCell className="text-center">{s.trades}</TableCell>
                              <TableCell className="text-center">
                                <MetricCell value={s.expectancy} suffix="p" good={0.5} bad={0} />
                              </TableCell>
                              <TableCell className="text-center">
                                <MetricCell value={s.frictionAdjExp} suffix="p" good={0} bad={-0.5} />
                              </TableCell>
                              <TableCell className="text-center">
                                <MetricCell value={s.profitFactor} good={1.0} bad={0.8} />
                              </TableCell>
                              <TableCell className="text-center font-mono text-red-400">{s.maxDD.toFixed(1)}p</TableCell>
                              <TableCell className="text-center">
                                <span className="text-red-400 font-mono">-{s.baselineExpDelta.toFixed(0)}%</span>
                              </TableCell>
                              <TableCell><RecBadge rec={s.recommendation} /></TableCell>
                              <TableCell className="max-w-[200px]">
                                <div className="text-[9px] text-muted-foreground space-y-0.5">
                                  {s.reasons.map((r, j) => <div key={j}>• {r}</div>)}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
            {result.pairs.every(p => p.diminishedScenarios.length === 0) && (
              <Card className="bg-card/40 border-border/20">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No edge-diminished scenarios found with current configuration.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB 3: Global Edge Killers */}
          <TabsContent value="global-killers" className="space-y-3">
            <Card className="bg-card/50 border-border/30">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  Global Edge Killers
                  <span className="text-[9px] text-muted-foreground ml-1">
                    Common patterns destroying edge across multiple pairs
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {result.globalKillers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No cross-pair edge killer patterns detected.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[9px]">
                        <TableHead>Pattern</TableHead>
                        <TableHead className="text-center">Pairs Hit</TableHead>
                        <TableHead className="text-center">Avg Exp</TableHead>
                        <TableHead className="text-center">Total PnL Impact</TableHead>
                        <TableHead>Affected Pairs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.globalKillers.map((k, i) => (
                        <TableRow key={i} className="text-[10px]">
                          <TableCell className="font-mono font-semibold text-red-400">{k.pattern}</TableCell>
                          <TableCell className="text-center">{k.occurrences}</TableCell>
                          <TableCell className="text-center">
                            <MetricCell value={k.avgExpectancy} suffix="p" good={0} bad={-0.5} />
                          </TableCell>
                          <TableCell className="text-center font-mono text-red-400">{k.totalPnlImpact.toFixed(1)}p</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {k.pairs.map(p => (
                                <Badge key={p} variant="outline" className="text-[8px]">{toDisplaySymbol(p)}</Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Pair Row Component ──────────────────────────────────────────────

function PairRow({ pair: p, expanded, onToggle }: {
  pair: PairSimResult; expanded: boolean; onToggle: () => void;
}) {
  const govExpDelta = p.govFiltered.expectancy - p.baseline.expectancy;
  const edgeExpDelta = p.edgeFiltered.expectancy - p.baseline.expectancy;

  return (
    <>
      <TableRow
        className="text-[10px] cursor-pointer hover:bg-accent/10 transition-colors"
        onClick={onToggle}
      >
        <TableCell className="font-mono font-bold">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {toDisplaySymbol(p.pair)}
            <TierBadge tier={p.tier} />
          </div>
        </TableCell>
        <TableCell className="text-center font-mono font-bold">{p.edgeScore}</TableCell>
        {/* Baseline */}
        <TableCell className="text-center"><MetricCell value={p.baseline.expectancy} suffix="p" good={1.0} bad={0} /></TableCell>
        <TableCell className="text-center"><MetricCell value={p.baseline.profitFactor} good={1.5} bad={1.0} /></TableCell>
        <TableCell className="text-center font-mono">{p.baseline.maxDD.toFixed(1)}</TableCell>
        <TableCell className="text-center"><MetricCell value={p.baseline.sharpe} good={0.3} bad={0} /></TableCell>
        {/* Gov Filtered */}
        <TableCell className="text-center"><MetricCell value={p.govFiltered.expectancy} suffix="p" good={1.0} bad={0} /></TableCell>
        <TableCell className="text-center"><MetricCell value={p.govFiltered.profitFactor} good={1.5} bad={1.0} /></TableCell>
        <TableCell className="text-center font-mono">{p.govFiltered.coveragePct}%</TableCell>
        <TableCell className="text-center">
          <span className={cn('font-mono', govExpDelta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {govExpDelta >= 0 ? '+' : ''}{govExpDelta.toFixed(2)}
          </span>
        </TableCell>
        {/* Edge Filtered */}
        <TableCell className="text-center"><MetricCell value={p.edgeFiltered.expectancy} suffix="p" good={1.0} bad={0} /></TableCell>
        <TableCell className="text-center"><MetricCell value={p.edgeFiltered.profitFactor} good={1.5} bad={1.0} /></TableCell>
        <TableCell className="text-center font-mono">{p.edgeFiltered.coveragePct}%</TableCell>
        <TableCell className="text-center">
          <span className={cn('font-mono', edgeExpDelta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {edgeExpDelta >= 0 ? '+' : ''}{edgeExpDelta.toFixed(2)}
          </span>
        </TableCell>
        {/* Edge-Only */}
        <TableCell className="text-center"><MetricCell value={p.edgeOnly.expectancy} suffix="p" good={1.5} bad={0} /></TableCell>
        <TableCell className="text-center"><MetricCell value={p.edgeOnly.profitFactor} good={1.5} bad={1.0} /></TableCell>
        <TableCell className="text-center font-mono">{p.edgeOnly.coveragePct}%</TableCell>
        {/* Verdict */}
        <TableCell>
          <span className="text-[9px] text-muted-foreground line-clamp-1">{p.recommendation}</span>
        </TableCell>
      </TableRow>

      {/* Expanded Detail */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={18} className="p-0 bg-accent/5">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 space-y-3"
            >
              {/* Improvement Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'ΔExpectancy (Gov)', ...metricDeltaCalc(p.baseline.expectancy, p.govFiltered.expectancy) },
                  { label: 'ΔExpectancy (Edge)', ...metricDeltaCalc(p.baseline.expectancy, p.edgeFiltered.expectancy) },
                  { label: 'ΔMaxDD (Gov)', ...metricDeltaCalc(p.baseline.maxDD, p.govFiltered.maxDD, true) },
                  { label: 'ΔSharpe (Edge)', ...metricDeltaCalc(p.baseline.sharpe, p.edgeFiltered.sharpe) },
                ].map((d, i) => (
                  <div key={i} className="bg-background/50 rounded p-2">
                    <div className="text-[9px] text-muted-foreground">{d.label}</div>
                    <div className={cn('text-sm font-mono font-bold', d.isGood ? 'text-emerald-400' : 'text-red-400')}>
                      {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Diminished Scenarios Preview */}
              {p.diminishedScenarios.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-red-400 mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    {p.diminishedScenarios.length} Edge-Diminished Scenarios
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {p.diminishedScenarios.slice(0, 4).map((s, i) => (
                      <div key={i} className="bg-red-500/5 border border-red-500/10 rounded p-2 flex items-center justify-between">
                        <div className="text-[9px] font-mono">
                          {s.session} · {s.regime} · {s.spreadBucket}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-red-400 font-mono">{s.frictionAdjExp.toFixed(2)}p</span>
                          <RecBadge rec={s.recommendation} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Recommendation */}
              <div className="bg-background/30 rounded p-2">
                <div className="text-[9px] text-muted-foreground">Governance Verdict</div>
                <div className="text-[11px]">{p.recommendation}</div>
              </div>
            </motion.div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function metricDeltaCalc(baseline: number, filtered: number, invert = false) {
  const delta = filtered - baseline;
  const isGood = invert ? delta < 0 : delta > 0;
  return { delta, isGood };
}
