// Explosive Growth (Controlled) Dashboard
// 3 panels: Control Panel, Edge Dominance Clusters, Safety & Rollback Monitor

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Shield, Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  XCircle, Activity, Download, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useExplosiveGrowth } from '@/hooks/useExplosiveGrowth';
import { EnvironmentBadge, EnvironmentFilter, type EnvFilterValue } from '@/components/forex/EnvironmentGuards';
import type {
  ExplosiveLiveConfig, EdgeDominanceCluster, AgentClassification,
  PairAllocation, SessionDensityRule, EnvKeyBoost, SafetyTrigger,
} from '@/lib/forex/explosiveGrowthEngine';

// ─── CSV Export ───
function exportCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => {
    const v = r[h];
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '');
  }).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Mode Badge ───
function ModeBadge({ mode }: { mode: ExplosiveLiveConfig['mode'] }) {
  const styles = {
    OFF: 'bg-muted text-muted-foreground',
    BETA: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
    ALPHA: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  };
  return <Badge variant="outline" className={`${styles[mode]} text-xs font-mono`}>{mode}</Badge>;
}

// ─── Tier Badge ───
function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    ALPHA: 'bg-neural-green/20 text-neural-green',
    BETA: 'bg-neural-orange/20 text-neural-orange',
    GAMMA: 'bg-muted text-muted-foreground',
  };
  return <Badge variant="outline" className={`${styles[tier] || ''} text-[9px]`}>{tier}</Badge>;
}

function AgentClassBadge({ cls }: { cls: string }) {
  const styles: Record<string, string> = {
    CHAMPION: 'bg-neural-green/20 text-neural-green',
    SPECIALIST: 'bg-primary/20 text-primary',
    DILUTER: 'bg-neural-red/20 text-neural-red',
  };
  return <Badge variant="outline" className={`${styles[cls] || ''} text-[9px]`}>{cls}</Badge>;
}

function PFDisplay({ pf, valid }: { pf: number | null; valid: boolean }) {
  if (!valid || pf === null) return <span className="text-muted-foreground text-[10px]">N/A</span>;
  return <span className={pf >= 1.6 ? 'text-neural-green' : pf >= 1.0 ? 'text-neural-orange' : 'text-neural-red'}>{pf.toFixed(2)}</span>;
}

// ─── Filter State ───
function useFilter() {
  const [pair, setPair] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<EnvFilterValue>('live+practice');
  return { pair, setPair, envFilter, setEnvFilter };
}

// ─── Control Panel ───
function ControlPanel({ config }: { config: ExplosiveLiveConfig }) {
  const alphaClusters = config.clusters.filter(c => c.tier === 'ALPHA');
  const betaClusters = config.clusters.filter(c => c.tier === 'BETA');
  const gammaClusters = config.clusters.filter(c => c.tier === 'GAMMA');

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-neural-orange" />
          Explosive Growth Control Panel
          <ModeBadge mode={config.mode} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Edge Health Gate */}
        <div className="flex items-center gap-4 p-2 rounded bg-background/50 border border-border/20">
          <span className="text-[10px] text-muted-foreground font-mono">EDGE HEALTH GATE</span>
          <div className="flex items-center gap-1.5">
            {config.edgeHealthGate.expectancySlopeOk
              ? <CheckCircle2 className="w-3.5 h-3.5 text-neural-green" />
              : <XCircle className="w-3.5 h-3.5 text-neural-red" />}
            <span className="text-[10px]">Exp Slope</span>
          </div>
          <div className="flex items-center gap-1.5">
            {config.edgeHealthGate.stabilityOk
              ? <CheckCircle2 className="w-3.5 h-3.5 text-neural-green" />
              : <XCircle className="w-3.5 h-3.5 text-neural-red" />}
            <span className="text-[10px]">Stability</span>
          </div>
          <Badge variant="outline" className={`text-[9px] ${config.edgeHealthGate.gatePass ? 'text-neural-green' : 'text-neural-red'}`}>
            {config.edgeHealthGate.gatePass ? 'PASS' : 'BLOCKED'}
          </Badge>
        </div>

        {/* Tier Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded bg-neural-green/5 border border-neural-green/20 text-center">
            <div className="text-lg font-bold text-neural-green">{alphaClusters.length}</div>
            <div className="text-[9px] text-muted-foreground">Alpha Clusters</div>
          </div>
          <div className="p-2 rounded bg-neural-orange/5 border border-neural-orange/20 text-center">
            <div className="text-lg font-bold text-neural-orange">{betaClusters.length}</div>
            <div className="text-[9px] text-muted-foreground">Beta Clusters</div>
          </div>
          <div className="p-2 rounded bg-muted/30 border border-border/20 text-center">
            <div className="text-lg font-bold text-muted-foreground">{gammaClusters.length}</div>
            <div className="text-[9px] text-muted-foreground">Gamma (Shadow)</div>
          </div>
        </div>

        {/* Pair Allocations */}
        <div>
          <div className="text-[10px] text-muted-foreground font-mono mb-1">PAIR ALLOCATIONS</div>
          <div className="space-y-1">
            {config.pairAllocations.map(pa => (
              <div key={pa.pair} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-background/30 border border-border/10">
                <span className="font-mono font-medium">{pa.pair}</span>
                <Badge variant="outline" className={`text-[8px] ${pa.role === 'PRIMARY' ? 'text-neural-green' : pa.role === 'SECONDARY' ? 'text-neural-orange' : 'text-muted-foreground'}`}>
                  {pa.role}
                </Badge>
                <span className="text-muted-foreground">{pa.multiplierRange[0]}x–{pa.multiplierRange[1]}x</span>
                <span className={pa.metrics.expectancy >= 0 ? 'text-neural-green' : 'text-neural-red'}>
                  {pa.metrics.expectancy >= 0 ? '+' : ''}{pa.metrics.expectancy}p
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Session Density */}
        <div>
          <div className="text-[10px] text-muted-foreground font-mono mb-1">SESSION DENSITY</div>
          <div className="flex gap-2 flex-wrap">
            {config.sessionDensity.map(sd => (
              <div key={sd.session} className={`text-[9px] px-2 py-1 rounded border ${sd.isDominant ? 'border-neural-green/30 text-neural-green' : 'border-border/20 text-muted-foreground'}`}>
                {sd.session}: {sd.densityMultiplier}x
              </div>
            ))}
          </div>
        </div>

        {/* Data Window */}
        <div className="text-[9px] text-muted-foreground">
          Data: {config.dataWindow.trades} trades · {config.dataWindow.start ? new Date(config.dataWindow.start).toLocaleDateString() : '—'} → {config.dataWindow.end ? new Date(config.dataWindow.end).toLocaleDateString() : '—'}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Edge Dominance Clusters Table ───
function ClustersPanel({ clusters, pairFilter }: { clusters: EdgeDominanceCluster[]; pairFilter: string }) {
  const filtered = pairFilter === 'all' ? clusters : clusters.filter(c => c.pair === pairFilter);

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Edge Dominance Clusters ({filtered.length})
        </CardTitle>
        <Button size="sm" variant="ghost" className="text-[9px] h-6" onClick={() => exportCSV(
          filtered.map(c => ({
            pair: c.pair, session: c.session, tier: c.tier, multiplier: c.multiplier,
            trades: c.metrics.trades, expectancy: c.metrics.expectancy,
            pf: c.metrics.profitFactor ?? 'N/A', sharpe: c.metrics.sharpe,
            govScore: c.governanceScore, rankScore: c.rankScore,
            eligible: c.eligible, failReasons: c.failReasons.join('; '),
          })),
          'explosive-clusters.csv'
        )}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left p-1">Pair</th>
                <th className="text-left p-1">Session</th>
                <th className="text-left p-1">Coalition</th>
                <th className="text-center p-1">Tier</th>
                <th className="text-right p-1">Mult</th>
                <th className="text-right p-1">Trades</th>
                <th className="text-right p-1">Exp</th>
                <th className="text-right p-1">PF</th>
                <th className="text-right p-1">Sharpe</th>
                <th className="text-right p-1">Gov</th>
                <th className="text-right p-1">Rank</th>
                <th className="text-left p-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map(c => (
                <tr key={c.clusterKey} className="border-b border-border/10 hover:bg-background/30">
                  <td className="p-1 font-mono">{c.pair}</td>
                  <td className="p-1">{c.session}</td>
                  <td className="p-1 font-mono text-[9px] max-w-[120px] truncate">{c.coalitionId}</td>
                  <td className="p-1 text-center"><TierBadge tier={c.tier} /></td>
                  <td className="p-1 text-right font-mono">{c.multiplier}x</td>
                  <td className="p-1 text-right">{c.metrics.trades}</td>
                  <td className={`p-1 text-right ${c.metrics.expectancy >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {c.metrics.expectancy >= 0 ? '+' : ''}{c.metrics.expectancy}p
                  </td>
                  <td className="p-1 text-right"><PFDisplay pf={c.metrics.profitFactor} valid={c.metrics.pfValid} /></td>
                  <td className="p-1 text-right">{c.metrics.sharpe}</td>
                  <td className="p-1 text-right">{c.governanceScore}</td>
                  <td className="p-1 text-right">{c.rankScore}</td>
                  <td className="p-1">
                    {c.eligible
                      ? <CheckCircle2 className="w-3 h-3 text-neural-green inline" />
                      : <span className="text-neural-red text-[9px]" title={c.failReasons.join(', ')}>
                          {c.failReasons.length} fail{c.failReasons.length > 1 ? 's' : ''}
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Agent Classifications ───
function AgentClassPanel({ agents }: { agents: AgentClassification[] }) {
  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Agent Classifications ({agents.length})
        </CardTitle>
        <Button size="sm" variant="ghost" className="text-[9px] h-6" onClick={() => exportCSV(
          agents.map(a => ({ agent: a.agentId, class: a.agentClass, deltaExp: a.systemDeltaExp, deltaPF: a.systemDeltaPF, ddImpact: a.ddImpact, multiplierCap: a.multiplierCap })),
          'explosive-agents.csv'
        )}>
          <Download className="w-3 h-3 mr-1" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left p-1">Agent</th>
                <th className="text-center p-1">Class</th>
                <th className="text-right p-1">ΔExp</th>
                <th className="text-right p-1">ΔPF</th>
                <th className="text-right p-1">DD Impact</th>
                <th className="text-right p-1">Mult Cap</th>
                <th className="text-left p-1">Allowed Pairs</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.agentId} className="border-b border-border/10 hover:bg-background/30">
                  <td className="p-1 font-mono">{a.agentId}</td>
                  <td className="p-1 text-center"><AgentClassBadge cls={a.agentClass} /></td>
                  <td className={`p-1 text-right ${a.systemDeltaExp >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {a.systemDeltaExp >= 0 ? '+' : ''}{a.systemDeltaExp}p
                  </td>
                  <td className={`p-1 text-right ${a.systemDeltaPF >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {a.systemDeltaPF >= 0 ? '+' : ''}{a.systemDeltaPF}
                  </td>
                  <td className="p-1 text-right">{a.ddImpact >= 0 ? '+' : ''}{a.ddImpact}p</td>
                  <td className="p-1 text-right font-mono">{a.multiplierCap}x</td>
                  <td className="p-1 text-[9px] max-w-[150px] truncate">{a.allowedPairs.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Safety & Rollback Monitor ───
function SafetyPanel({ config }: { config: ExplosiveLiveConfig }) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-neural-orange" />
          Safety & Rollback Monitor
          {config.safetyTriggers.length > 0 && (
            <Badge variant="destructive" className="text-[9px]">{config.safetyTriggers.length} active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Active Triggers */}
        {config.safetyTriggers.length > 0 ? (
          <div className="space-y-1.5">
            {config.safetyTriggers.map((t, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-neural-red/5 border border-neural-red/20">
                <AlertTriangle className="w-3.5 h-3.5 text-neural-red mt-0.5 shrink-0" />
                <div>
                  <div className="text-[10px] font-mono text-neural-red">{t.type}</div>
                  <div className="text-[9px] text-muted-foreground">{t.detail}</div>
                  <div className="text-[9px] text-neural-orange">→ {t.action}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded bg-neural-green/5 border border-neural-green/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-neural-green" />
            <span className="text-[10px] text-neural-green">No safety triggers active — system healthy</span>
          </div>
        )}

        {/* Rollback Triggers */}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Rollback Trigger Rules ({config.rollbackTriggers.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-0.5 mt-1">
              {config.rollbackTriggers.map((r, i) => (
                <div key={i} className="text-[9px] text-muted-foreground pl-4">• {r}</div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Edge Health Timeline (simplified) */}
        <div className="p-2 rounded bg-background/50 border border-border/20">
          <div className="text-[10px] text-muted-foreground font-mono mb-1">EDGE HEALTH</div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex items-center gap-1.5">
              {config.edgeHealthGate.expectancySlopeOk
                ? <TrendingUp className="w-3 h-3 text-neural-green" />
                : <TrendingDown className="w-3 h-3 text-neural-red" />}
              <span>Expectancy Slope: {config.edgeHealthGate.expectancySlopeOk ? 'Rising' : 'Falling'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {config.edgeHealthGate.stabilityOk
                ? <TrendingUp className="w-3 h-3 text-neural-green" />
                : <TrendingDown className="w-3 h-3 text-neural-red" />}
              <span>Stability: {config.edgeHealthGate.stabilityOk ? 'Improving' : 'Degrading'}</span>
            </div>
          </div>
        </div>

        {/* EnvKey Boosts summary */}
        <div>
          <div className="text-[10px] text-muted-foreground font-mono mb-1">ENVKEY BOOSTS</div>
          <div className="text-[10px]">
            <span className="text-neural-green">{config.envKeyBoosts.filter(e => e.boosted).length} boosted</span>
            {' / '}
            <span className="text-muted-foreground">{config.envKeyBoosts.filter(e => !e.boosted).length} suppressed</span>
            {' / '}
            <span>{config.envKeyBoosts.length} total</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───
export function ExplosiveGrowthDashboard() {
  const { config, loading, error, refresh } = useExplosiveGrowth();
  const { pair, setPair, envFilter, setEnvFilter } = useFilter();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground animate-pulse">Computing Explosive Growth Config…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded bg-neural-red/10 border border-neural-red/20 text-[11px] text-neural-red">
        Error: {error}
      </div>
    );
  }

  if (!config || config.dataWindow.trades === 0) {
    return (
      <div className="p-4 rounded bg-muted/30 border border-border/20 text-[11px] text-muted-foreground">
        No trade data available. Execute trades to generate explosive growth analysis.
      </div>
    );
  }

  const pairs = [...new Set(config.clusters.map(c => c.pair))].sort();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Environment + Pair Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <EnvironmentBadge env={envFilter === 'live+practice' ? 'live' : (envFilter === 'all' ? 'practice' : envFilter as any)} />
        <EnvironmentFilter value={envFilter} onChange={setEnvFilter} />
        <span className="text-[10px] text-muted-foreground ml-2">Pair:</span>
        <div className="flex gap-1 flex-wrap">
          <Badge
            variant={pair === 'all' ? 'default' : 'outline'}
            className="text-[9px] cursor-pointer"
            onClick={() => setPair('all')}
          >All</Badge>
          {pairs.map(p => (
            <Badge
              key={p}
              variant={pair === p ? 'default' : 'outline'}
              className="text-[9px] cursor-pointer font-mono"
              onClick={() => setPair(p)}
            >{p}</Badge>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="text-[9px] h-6 ml-auto" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="control" className="space-y-3">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
          <TabsTrigger value="control" className="text-[10px] gap-1"><Zap className="w-3 h-3" />Control Panel</TabsTrigger>
          <TabsTrigger value="clusters" className="text-[10px] gap-1"><Target className="w-3 h-3" />Clusters</TabsTrigger>
          <TabsTrigger value="agents" className="text-[10px] gap-1"><Activity className="w-3 h-3" />Agents</TabsTrigger>
          <TabsTrigger value="safety" className="text-[10px] gap-1"><Shield className="w-3 h-3" />Safety</TabsTrigger>
        </TabsList>

        <TabsContent value="control"><ControlPanel config={config} /></TabsContent>
        <TabsContent value="clusters"><ClustersPanel clusters={config.clusters} pairFilter={pair} /></TabsContent>
        <TabsContent value="agents"><AgentClassPanel agents={config.agentClassifications} /></TabsContent>
        <TabsContent value="safety"><SafetyPanel config={config} /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
