// USD/CAD Cluster Mining Dashboard — Backtest Truth
// Super Edge Zones, Kill Zones, Noise Kill List, Coalitions, JSON Config

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Pickaxe, TrendingUp, TrendingDown, ShieldAlert, Users, FileJson, Download,
  RefreshCw, Layers, Skull, Zap, AlertTriangle, CheckCircle2, XCircle, Ban,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useClusterMining } from '@/hooks/useClusterMining';
import {
  type ClusterMiningResponse,
  type ClusterMetrics,
  type NoiseIndicator,
  type CoalitionEntry,
  NOISE_VERDICT_LABELS,
  INDICATOR_DISPLAY_NAMES,
} from '@/lib/forex/clusterMiningTypes';

// ── Helpers ──
function downloadCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => {
    const v = r[k];
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v ?? '';
  }).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const pfDisplay = (pf: number | null) => pf === null ? '∞' : pf.toFixed(2);
const pipsColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-muted-foreground';

// ── Cluster Table ──
function ClusterTable({ clusters, title, icon }: { clusters: ClusterMetrics[]; title: string; icon: React.ReactNode }) {
  if (!clusters.length) return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-6 text-center text-sm text-muted-foreground">No qualifying clusters</CardContent>
    </Card>
  );
  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="w-8">#</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Win%</TableHead>
                <TableHead className="text-right">Exp (pips)</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">StdDev</TableHead>
                <TableHead className="text-right">MaxDD</TableHead>
                <TableHead className="text-right">Stability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((c, i) => (
                <TableRow key={i} className="text-[10px] font-mono">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-[300px] truncate" title={c.signature}>
                    <span className="text-[9px]">{c.signature}</span>
                  </TableCell>
                  <TableCell className="text-right">{c.trades}</TableCell>
                  <TableCell className="text-right">{c.win_rate}%</TableCell>
                  <TableCell className={`text-right font-bold ${pipsColor(c.expectancy_pips)}`}>
                    {c.expectancy_pips > 0 ? '+' : ''}{c.expectancy_pips}
                  </TableCell>
                  <TableCell className={`text-right ${pipsColor(c.net_pips)}`}>
                    {c.net_pips > 0 ? '+' : ''}{c.net_pips}
                  </TableCell>
                  <TableCell className="text-right">{pfDisplay(c.pf)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.stddev_pips}</TableCell>
                  <TableCell className="text-right text-red-400">{c.max_dd_pips}</TableCell>
                  <TableCell className={`text-right ${pipsColor(c.stability_score)}`}>{c.stability_score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Noise Kill List ──
function NoiseKillListPanel({ noise }: { noise: NoiseIndicator[] }) {
  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Skull className="w-4 h-4 text-red-400" />Noise Kill List
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="text-[10px]">
              <TableHead>Indicator</TableHead>
              <TableHead className="text-right">Exp Δ</TableHead>
              <TableHead className="text-right">Stability Δ</TableHead>
              <TableHead className="text-right">FP Rate</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {noise.map((n, i) => {
              const v = NOISE_VERDICT_LABELS[n.verdict] || NOISE_VERDICT_LABELS.keep;
              return (
                <TableRow key={i} className="text-[10px]">
                  <TableCell className="font-medium">{INDICATOR_DISPLAY_NAMES[n.indicator] || n.indicator}</TableCell>
                  <TableCell className={`text-right ${pipsColor(n.expectancy_delta)}`}>{n.expectancy_delta}</TableCell>
                  <TableCell className={`text-right ${n.stability_delta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {n.stability_delta > 0 ? '+' : ''}{n.stability_delta}
                  </TableCell>
                  <TableCell className="text-right">{n.false_positive_rate}%</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[9px] ${v.color}`}>{v.label}</Badge>
                  </TableCell>
                  <TableCell className="text-[9px] text-muted-foreground">
                    {n.affected_sessions.length > 0 ? n.affected_sessions.join(', ') : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Coalitions Panel ──
function CoalitionsPanel({ best, doNotPair }: { best: CoalitionEntry[]; doNotPair: CoalitionEntry[] }) {
  return (
    <div className="space-y-4">
      <Card className="border-border/30 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />Best Coalitions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead>Agents</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Exp</TableHead>
                <TableHead className="text-right">Lift</TableHead>
                <TableHead className="text-right">StdDev</TableHead>
                <TableHead className="text-right">MaxDD</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {best.map((c, i) => (
                <TableRow key={i} className="text-[10px]">
                  <TableCell className="font-mono text-[9px]">{c.agents.join(' + ')}</TableCell>
                  <TableCell className="text-right">{c.trades}</TableCell>
                  <TableCell className={`text-right ${pipsColor(c.expectancy)}`}>{c.expectancy}</TableCell>
                  <TableCell className={`text-right font-bold ${pipsColor(c.lift)}`}>
                    {c.lift > 0 ? '+' : ''}{c.lift}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.stddev}</TableCell>
                  <TableCell className="text-right text-red-400">{c.max_dd}</TableCell>
                  <TableCell className="text-right font-bold">{c.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {doNotPair.length > 0 && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-400" />Do Not Pair
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead>Agents</TableHead>
                  <TableHead className="text-right">Lift</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doNotPair.map((c, i) => (
                  <TableRow key={i} className="text-[10px]">
                    <TableCell className="font-mono text-[9px]">{c.agents.join(' + ')}</TableCell>
                    <TableCell className="text-right text-red-400">{c.lift}</TableCell>
                    <TableCell className="text-right text-red-400">{c.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Dashboard ──
export const ClusterMiningDashboard = () => {
  const { data, loading, error, runMining } = useClusterMining();
  const [lookback, setLookback] = useState('21');
  const [selectedTf, setSelectedTf] = useState('5m');
  const [selectedGran, setSelectedGran] = useState('lite');
  const [subTab, setSubTab] = useState('edge-zones');

  const currentResult = useMemo(() => {
    if (!data?.results?.[selectedTf]) return null;
    return data.results[selectedTf][selectedGran] || null;
  }, [data, selectedTf, selectedGran]);

  const currentNoise = useMemo(() => data?.noise_kill_list?.[selectedTf] || [], [data, selectedTf]);
  const currentCoalitions = useMemo(() => data?.coalitions?.[selectedTf] || { best: [], do_not_pair: [] }, [data, selectedTf]);

  // Landing / start screen
  if (!data && !loading) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Pickaxe className="w-12 h-12 text-primary/50" />
          <h3 className="font-display font-bold text-lg">USD/CAD Cluster Mining</h3>
          <p className="text-sm text-muted-foreground text-center max-w-lg">
            Mine indicator combo clusters from OANDA backtest data. Computes rolling 16-indicator signatures at every trade entry, then ranks edge zones, identifies noise generators, and scores agent coalitions.
          </p>
          <div className="flex items-center gap-3">
            <Select value={lookback} onValueChange={setLookback}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="21">21 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => runMining(parseInt(lookback))} className="gap-2">
              <Pickaxe className="w-4 h-4" />Run Cluster Mining
            </Button>
          </div>
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Mining clusters from OANDA backtest data...</p>
          <p className="text-xs text-muted-foreground">Fetching candles → Computing indicators → Building signatures → Ranking clusters</p>
          <Progress value={50} className="w-64 h-2" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const availableTfs = Object.keys(data.results);

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Pickaxe className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">USD/CAD Cluster Mining</h2>
            <Badge variant="outline" className="text-[9px]">
              {data.meta.total_trades} trades · {data.meta.lookback_days}d
            </Badge>
            <Badge variant="secondary" className="text-[9px]">Backtest Only</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedTf} onValueChange={setSelectedTf}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableTfs.map(tf => (
                  <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGran} onValueChange={setSelectedGran}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lite">Lite (6)</SelectItem>
                <SelectItem value="mid">Mid (10)</SelectItem>
                <SelectItem value="full">Full (16)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => runMining(parseInt(lookback))}>
              <RefreshCw className="w-3 h-3" />Re-mine
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card className="border-border/30 bg-card/50 p-3">
          <p className="text-[9px] text-muted-foreground">Trades Analyzed</p>
          <p className="text-lg font-bold font-mono">{data.meta.total_trades}</p>
        </Card>
        <Card className="border-border/30 bg-card/50 p-3">
          <p className="text-[9px] text-muted-foreground">Total Clusters</p>
          <p className="text-lg font-bold font-mono">{currentResult?.total_clusters || 0}</p>
        </Card>
        <Card className="border-border/30 bg-card/50 p-3">
          <p className="text-[9px] text-muted-foreground">Qualifying</p>
          <p className="text-lg font-bold font-mono">{currentResult?.qualifying_clusters || 0}</p>
        </Card>
        <Card className="border-border/30 bg-card/50 p-3">
          <p className="text-[9px] text-muted-foreground">Edge Zones</p>
          <p className="text-lg font-bold font-mono text-emerald-400">{currentResult?.super_edge_zones?.length || 0}</p>
        </Card>
        <Card className="border-border/30 bg-card/50 p-3">
          <p className="text-[9px] text-muted-foreground">Kill Zones</p>
          <p className="text-lg font-bold font-mono text-red-400">{currentResult?.kill_zones?.length || 0}</p>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
          <TabsTrigger value="edge-zones" className="text-xs gap-1"><Zap className="w-3 h-3" />Super Edge Zones</TabsTrigger>
          <TabsTrigger value="kill-zones" className="text-xs gap-1"><Skull className="w-3 h-3" />Kill Zones</TabsTrigger>
          <TabsTrigger value="noise" className="text-xs gap-1"><AlertTriangle className="w-3 h-3" />Noise Kill List</TabsTrigger>
          <TabsTrigger value="coalitions" className="text-xs gap-1"><Users className="w-3 h-3" />Coalitions</TabsTrigger>
          <TabsTrigger value="config" className="text-xs gap-1"><FileJson className="w-3 h-3" />JSON Config</TabsTrigger>
        </TabsList>

        <TabsContent value="edge-zones" className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7"
              onClick={() => downloadCSV(currentResult?.super_edge_zones || [], `edge_zones_${selectedTf}_${selectedGran}.csv`)}>
              <Download className="w-3 h-3" />Export CSV
            </Button>
          </div>
          <ClusterTable
            clusters={currentResult?.super_edge_zones || []}
            title={`Super Edge Zones — ${selectedTf} / ${selectedGran}`}
            icon={<Zap className="w-4 h-4 text-emerald-400" />}
          />
        </TabsContent>

        <TabsContent value="kill-zones" className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7"
              onClick={() => downloadCSV(currentResult?.kill_zones || [], `kill_zones_${selectedTf}_${selectedGran}.csv`)}>
              <Download className="w-3 h-3" />Export CSV
            </Button>
          </div>
          <ClusterTable
            clusters={currentResult?.kill_zones || []}
            title={`Edge Kill Zones — ${selectedTf} / ${selectedGran}`}
            icon={<ShieldAlert className="w-4 h-4 text-red-400" />}
          />
        </TabsContent>

        <TabsContent value="noise" className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7"
              onClick={() => downloadCSV(currentNoise, `noise_kill_list_${selectedTf}.csv`)}>
              <Download className="w-3 h-3" />Export CSV
            </Button>
          </div>
          <NoiseKillListPanel noise={currentNoise} />
        </TabsContent>

        <TabsContent value="coalitions" className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7"
              onClick={() => downloadCSV(currentCoalitions.best, `coalitions_best_${selectedTf}.csv`)}>
              <Download className="w-3 h-3" />Export CSV
            </Button>
          </div>
          <CoalitionsPanel best={currentCoalitions.best} doNotPair={currentCoalitions.do_not_pair} />
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-primary" />Live Router Config
                </CardTitle>
                <Button variant="outline" size="sm" className="text-[10px] gap-1 h-7"
                  onClick={() => downloadJSON(data.json_config, 'usdcad_cluster_config.json')}>
                  <Download className="w-3 h-3" />Download JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-[10px] font-mono bg-muted/20 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                {JSON.stringify(data.json_config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
