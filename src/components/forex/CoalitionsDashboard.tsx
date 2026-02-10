// Agent Coalition Performance Dashboard
// Leaderboard, heatmap, envKey drilldown, and recommendations.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, TrendingUp, TrendingDown, Download, Eye, EyeOff,
  ArrowUpRight, ArrowDownRight, Minus, Shield, ShieldAlert,
  Zap, Rocket, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeCoalitions,
  setCoalitionBoostingEnabled,
  getCoalitionBoostingEnabled,
  type CoalitionAnalysisResult,
  type CoalitionEntry,
  type CoalitionLabel,
  type CoalitionRecommendation,
} from '@/lib/agents/coalitionEngine';
import { cn } from '@/lib/utils';

// ─── Label Config ────────────────────────────────────────────────────

const LABEL_CONFIG: Record<CoalitionLabel, { color: string; bg: string; icon: typeof TrendingUp }> = {
  BOOST: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: TrendingUp },
  RISKY: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  HARMFUL: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: TrendingDown },
  INSUFFICIENT_DATA: { color: 'text-muted-foreground', bg: 'bg-muted/10 border-border/30', icon: Eye },
};

const ACTION_CONFIG: Record<string, { color: string; bg: string; icon: typeof Rocket }> = {
  DEPLOY: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: Rocket },
  SHADOW: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: Eye },
  AVOID: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: ShieldAlert },
};

function DeltaValue({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.001;
  return (
    <span className={cn('text-xs font-mono', neutral ? 'text-muted-foreground' : positive ? 'text-emerald-400' : 'text-red-400')}>
      {neutral ? '—' : positive ? '+' : ''}{value.toFixed(3)}{suffix}
    </span>
  );
}

// ─── Heatmap Cell ────────────────────────────────────────────────────

function HeatmapCell({ entry }: { entry: CoalitionEntry | undefined }) {
  if (!entry) return <td className="p-1 text-center text-[9px] text-muted-foreground">—</td>;

  const dE = entry.liftVsBaseline.deltaExpectancy;
  const bg = dE > 0.5 ? 'bg-emerald-500/30' : dE > 0 ? 'bg-emerald-500/10' : dE > -0.5 ? 'bg-red-500/10' : 'bg-red-500/30';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <td className={cn('p-1 text-center text-[10px] font-mono cursor-help border border-border/10 rounded', bg)}>
            {dE > 0 ? '+' : ''}{dE.toFixed(2)}
          </td>
        </TooltipTrigger>
        <TooltipContent className="text-[10px] max-w-xs">
          <div className="space-y-0.5">
            <div>PF: {entry.metrics.profitFactor.toFixed(2)} · DD: {entry.metrics.maxDD.toFixed(1)}p</div>
            <div>Sample: {entry.metrics.trades} · Coverage: {entry.metrics.coveragePct.toFixed(1)}%</div>
            <div>Label: {entry.label} · Status: {entry.provenStatus}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────

function exportCSV(result: CoalitionAnalysisResult) {
  const headers = ['Coalition', 'Size', 'Symbol', 'Session', 'Regime', 'Label', 'Status', 'Trades', 'WinRate', 'Expectancy', 'PF', 'Sharpe', 'MaxDD', 'Stability', 'Coverage%', 'ΔExp', 'ΔPF', 'ΔSharpe'];
  const rows = result.coalitions.map(c => [
    c.coalitionKey, c.size, c.symbol, c.session, c.regime, c.label, c.provenStatus,
    c.metrics.trades, (c.metrics.winRate * 100).toFixed(1), c.metrics.expectancy.toFixed(3),
    c.metrics.profitFactor.toFixed(2), c.metrics.sharpe.toFixed(2), c.metrics.maxDD.toFixed(1),
    c.metrics.stabilityScore.toFixed(3), c.metrics.coveragePct.toFixed(1),
    c.liftVsBaseline.deltaExpectancy.toFixed(3), c.liftVsBaseline.deltaPF.toFixed(2),
    c.liftVsBaseline.deltaSharpe.toFixed(2),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `coalitions-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export function CoalitionsDashboard() {
  const { user } = useAuth();
  const [result, setResult] = useState<CoalitionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeBacktest, setIncludeBacktest] = useState(false);
  const [boostEnabled, setBoostEnabled] = useState(getCoalitionBoostingEnabled());
  const [selectedCoalition, setSelectedCoalition] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');
  const [heatmapMode, setHeatmapMode] = useState<'session' | 'regime'>('session');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let targetUserId = user?.id;
      if (!targetUserId) {
        const { data: ownerRow } = await supabase
          .from('oanda_orders')
          .select('user_id')
          .limit(1)
          .maybeSingle();
        if (ownerRow?.user_id) targetUserId = ownerRow.user_id;
      }
      if (!targetUserId) { setLoading(false); return; }

      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const envFilter = includeBacktest ? ['live', 'practice', 'backtest'] : ['live', 'practice'];
      const { data: orders, error } = await supabase
        .from('oanda_orders')
        .select('agent_id, direction, currency_pair, entry_price, exit_price, session_label, regime_label, spread_at_entry, environment, created_at')
        .eq('user_id', targetUserId)
        .eq('status', 'closed')
        .in('environment', envFilter)
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .not('agent_id', 'is', null)
        .gte('created_at', sixMonthsAgo)
        .order('created_at', { ascending: true })
        .limit(5000);

      if (error || !orders?.length) { setResult(null); setLoading(false); return; }

      const trades = orders.map(o => ({
        agent_id: o.agent_id!,
        direction: o.direction,
        currency_pair: o.currency_pair,
        entry_price: o.entry_price!,
        exit_price: o.exit_price!,
        session_label: o.session_label,
        regime_label: o.regime_label,
        spread_at_entry: o.spread_at_entry,
        environment: o.environment,
        created_at: o.created_at,
      }));

      const learnMode = includeBacktest ? 'backtest' as const : 'live' as const;
      const analysis = analyzeCoalitions(trades, learnMode);
      setResult(analysis);
    } catch (err) {
      console.error('[Coalitions] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, includeBacktest]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBoostToggle = useCallback((enabled: boolean) => {
    setCoalitionBoostingEnabled(enabled);
    setBoostEnabled(enabled);
  }, []);

  // Filter by selected symbol
  const filteredCoalitions = useMemo(() => {
    if (!result) return [];
    if (selectedSymbol === 'all') return result.coalitions;
    return result.coalitions.filter(c => c.symbol === selectedSymbol);
  }, [result, selectedSymbol]);

  const symbols = useMemo(() => {
    if (!result) return [];
    return [...new Set(result.coalitions.map(c => c.symbol))].sort();
  }, [result]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!filteredCoalitions.length) return { keys: [] as string[], rows: [] as { coalition: string; cells: Record<string, CoalitionEntry | undefined> }[] };

    const dimensionKey = heatmapMode === 'session' ? 'session' : 'regime';
    const dimensions = [...new Set(filteredCoalitions.map(c => c[dimensionKey]))].sort();
    const coalitionKeys = [...new Set(filteredCoalitions.map(c => c.coalitionKey))];

    // Pick top 15 coalitions by ΔExpectancy
    const topCoalitions = coalitionKeys
      .map(ck => {
        const entries = filteredCoalitions.filter(c => c.coalitionKey === ck);
        const avgLift = entries.reduce((a, e) => a + e.liftVsBaseline.deltaExpectancy, 0) / entries.length;
        return { ck, avgLift };
      })
      .sort((a, b) => b.avgLift - a.avgLift)
      .slice(0, 15)
      .map(x => x.ck);

    const rows = topCoalitions.map(ck => {
      const cells: Record<string, CoalitionEntry | undefined> = {};
      for (const dim of dimensions) {
        cells[dim] = filteredCoalitions.find(c => c.coalitionKey === ck && c[dimensionKey] === dim);
      }
      return { coalition: ck, cells };
    });

    return { keys: dimensions, rows };
  }, [filteredCoalitions, heatmapMode]);

  // Drilldown data
  const drilldownData = useMemo(() => {
    if (!selectedCoalition || !result) return null;
    const entries = result.coalitions.filter(c => c.coalitionKey === selectedCoalition);
    const best = [...entries].sort((a, b) => b.liftVsBaseline.deltaExpectancy - a.liftVsBaseline.deltaExpectancy).slice(0, 10);
    const worst = [...entries].sort((a, b) => a.liftVsBaseline.deltaExpectancy - b.liftVsBaseline.deltaExpectancy).slice(0, 10);
    return { best, worst, total: entries.length };
  }, [selectedCoalition, result]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analyzing agent coalitions...</p>
        </CardContent>
      </Card>
    );
  }

  if (!result || result.coalitions.length === 0) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No coalition data available. Need co-occurring agent trades within 20-minute windows.</p>
        </CardContent>
      </Card>
    );
  }

  const labelCounts = {
    BOOST: result.coalitions.filter(c => c.label === 'BOOST').length,
    RISKY: result.coalitions.filter(c => c.label === 'RISKY').length,
    HARMFUL: result.coalitions.filter(c => c.label === 'HARMFUL').length,
    INSUFFICIENT_DATA: result.coalitions.filter(c => c.label === 'INSUFFICIENT_DATA').length,
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Agent Coalition Performance
              <span className="text-[10px] text-muted-foreground font-normal ml-2">
                {result.totalTrades.toLocaleString()} trades · {result.coalitions.length} coalitions
              </span>
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch id="coalition-backtest" checked={includeBacktest} onCheckedChange={setIncludeBacktest} className="scale-75" />
                <Label htmlFor="coalition-backtest" className="text-[10px] text-muted-foreground cursor-pointer">Backtest</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch id="coalition-boost" checked={boostEnabled} onCheckedChange={handleBoostToggle} className="scale-75" />
                <Label htmlFor="coalition-boost" className="text-[10px] text-muted-foreground cursor-pointer">Boost (SAFE)</Label>
              </div>
              <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1" onClick={() => exportCSV(result)}>
                <Download className="w-3 h-3" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {(Object.entries(labelCounts) as [CoalitionLabel, number][]).map(([label, count]) => {
              const cfg = LABEL_CONFIG[label];
              const Icon = cfg.icon;
              return (
                <div key={label} className={cn('p-2.5 rounded-lg border text-center', cfg.bg)}>
                  <Icon className={cn('w-4 h-4 mx-auto mb-1', cfg.color)} />
                  <div className={cn('text-lg font-bold', cfg.color)}>{count}</div>
                  <div className="text-[9px] text-muted-foreground">{label.replace('_', ' ')}</div>
                </div>
              );
            })}
          </div>

          {/* Symbol filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant={selectedSymbol === 'all' ? 'default' : 'outline'} size="sm" className="text-[10px] h-6" onClick={() => setSelectedSymbol('all')}>All</Button>
            {symbols.map(s => (
              <Button key={s} variant={selectedSymbol === s ? 'default' : 'outline'} size="sm" className="text-[10px] h-6" onClick={() => setSelectedSymbol(s)}>{s}</Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30">
          <TabsTrigger value="leaderboard" className="text-xs gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Leaderboard</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs gap-1.5"><Zap className="w-3.5 h-3.5" />Heatmap</TabsTrigger>
          <TabsTrigger value="drilldown" className="text-xs gap-1.5"><Eye className="w-3.5 h-3.5" />EnvKey Drilldown</TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs gap-1.5"><Rocket className="w-3.5 h-3.5" />Recommendations</TabsTrigger>
        </TabsList>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-[200px]">Coalition</TableHead>
                      <TableHead className="text-[10px] text-center">Size</TableHead>
                      <TableHead className="text-[10px] text-center">Symbol</TableHead>
                      <TableHead className="text-[10px] text-center">Label</TableHead>
                      <TableHead className="text-[10px] text-center">Status</TableHead>
                      <TableHead className="text-[10px] text-right">Trades</TableHead>
                      <TableHead className="text-[10px] text-right">Win%</TableHead>
                      <TableHead className="text-[10px] text-right">Exp(adj)</TableHead>
                      <TableHead className="text-[10px] text-right">PF</TableHead>
                      <TableHead className="text-[10px] text-right">ΔExp</TableHead>
                      <TableHead className="text-[10px] text-right">ΔPF</TableHead>
                      <TableHead className="text-[10px] text-right">MaxDD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCoalitions.slice(0, 30).map((c, i) => {
                      const lcfg = LABEL_CONFIG[c.label];
                      return (
                        <TableRow
                          key={`${c.coalitionKey}-${c.symbol}-${i}`}
                          className="cursor-pointer hover:bg-muted/20"
                          onClick={() => setSelectedCoalition(c.coalitionKey)}
                        >
                          <TableCell className="text-[10px] font-mono truncate max-w-[200px]">{c.coalitionKey}</TableCell>
                          <TableCell className="text-[10px] text-center">{c.size}</TableCell>
                          <TableCell className="text-[10px] text-center">{c.symbol}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn('text-[9px]', lcfg.bg, lcfg.color)}>{c.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn('text-[9px]',
                              c.provenStatus === 'PROVEN' ? 'bg-emerald-500/10 text-emerald-400' :
                              c.provenStatus === 'CANDIDATE' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-muted/10 text-muted-foreground'
                            )}>{c.provenStatus}</Badge>
                          </TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{c.metrics.trades}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{(c.metrics.winRate * 100).toFixed(1)}%</TableCell>
                          <TableCell className="text-[10px] text-right"><DeltaValue value={c.metrics.expectancy} suffix="p" /></TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{c.metrics.profitFactor.toFixed(2)}</TableCell>
                          <TableCell className="text-[10px] text-right"><DeltaValue value={c.liftVsBaseline.deltaExpectancy} suffix="p" /></TableCell>
                          <TableCell className="text-[10px] text-right"><DeltaValue value={c.liftVsBaseline.deltaPF} /></TableCell>
                          <TableCell className="text-[10px] text-right font-mono text-red-400">{c.metrics.maxDD.toFixed(1)}p</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heatmap */}
        <TabsContent value="heatmap">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs">Coalition × {heatmapMode === 'session' ? 'Session' : 'Regime'} Heatmap (ΔExpectancy)</CardTitle>
                <div className="flex items-center gap-1.5">
                  <Button variant={heatmapMode === 'session' ? 'default' : 'outline'} size="sm" className="text-[10px] h-6" onClick={() => setHeatmapMode('session')}>Session</Button>
                  <Button variant={heatmapMode === 'regime' ? 'default' : 'outline'} size="sm" className="text-[10px] h-6" onClick={() => setHeatmapMode('regime')}>Regime</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {heatmapData.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No heatmap data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr>
                        <th className="text-left p-1 text-muted-foreground font-medium">Coalition</th>
                        {heatmapData.keys.map(k => (
                          <th key={k} className="text-center p-1 text-muted-foreground font-medium">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.rows.map(row => (
                        <tr key={row.coalition} className="hover:bg-muted/10 cursor-pointer" onClick={() => setSelectedCoalition(row.coalition)}>
                          <td className="p-1 font-mono truncate max-w-[150px]">{row.coalition}</td>
                          {heatmapData.keys.map(k => (
                            <HeatmapCell key={k} entry={row.cells[k]} />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EnvKey Drilldown */}
        <TabsContent value="drilldown">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">
                EnvKey Drilldown {selectedCoalition ? `— ${selectedCoalition}` : '(click a coalition to drill down)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!drilldownData ? (
                <p className="text-sm text-muted-foreground text-center py-4">Select a coalition from the leaderboard or heatmap to see envKey breakdown.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-emerald-400 mb-2">✓ Best EnvKeys ({drilldownData.best.length})</h4>
                    <div className="space-y-1">
                      {drilldownData.best.map((c, i) => (
                        <div key={i} className="flex justify-between text-[10px] p-1.5 bg-emerald-500/5 rounded">
                          <span className="font-mono truncate max-w-[60%]">{c.envKey}</span>
                          <span className="font-mono text-emerald-400">ΔE: +{c.liftVsBaseline.deltaExpectancy.toFixed(3)}p · {c.metrics.trades}t</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-red-400 mb-2">✗ Worst EnvKeys ({drilldownData.worst.length})</h4>
                    <div className="space-y-1">
                      {drilldownData.worst.map((c, i) => (
                        <div key={i} className="flex justify-between text-[10px] p-1.5 bg-red-500/5 rounded">
                          <span className="font-mono truncate max-w-[60%]">{c.envKey}</span>
                          <span className="font-mono text-red-400">ΔE: {c.liftVsBaseline.deltaExpectancy.toFixed(3)}p · {c.metrics.trades}t</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations */}
        <TabsContent value="recommendations">
          <div className="space-y-4">
            {(['DEPLOY', 'SHADOW', 'AVOID'] as const).map(action => {
              const recs = result.recommendations.filter(r => r.action === action);
              if (recs.length === 0) return null;
              const cfg = ACTION_CONFIG[action];
              const Icon = cfg.icon;
              return (
                <Card key={action} className="bg-card/50 border-border/30">
                  <CardHeader className="pb-2">
                    <CardTitle className={cn('text-xs flex items-center gap-2', cfg.color)}>
                      <Icon className="w-4 h-4" />
                      {action} ({recs.length})
                      {action === 'DEPLOY' && <span className="text-[9px] text-muted-foreground font-normal">Top coalitions per symbol — suggested multiplier band</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recs.map((r, i) => (
                        <div key={i} className={cn('p-3 rounded-lg border', cfg.bg)}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-bold">{r.coalitionKey}</span>
                            <Badge variant="outline" className="text-[9px]">{r.symbol}</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{r.reasoning}</p>
                          {action === 'DEPLOY' && (
                            <div className="mt-1 text-[10px]">
                              <span className="text-muted-foreground">Multiplier: </span>
                              <span className="font-mono font-bold">{r.suggestedMultiplierBand[0].toFixed(2)}× – {r.suggestedMultiplierBand[1].toFixed(2)}×</span>
                            </div>
                          )}
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {r.metrics.trades}t · WR {(r.metrics.winRate * 100).toFixed(1)}% · PF {r.metrics.profitFactor.toFixed(2)} · Sharpe {r.metrics.sharpe.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
