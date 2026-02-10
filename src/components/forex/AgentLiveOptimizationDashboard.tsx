// Agent Live Optimization Dashboard
// Displays agent contribution analysis with role classification,
// what-if exclusion comparison, multiplier recommendations, and pair×agent alignment.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Shield, Crosshair, EyeOff, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Download, Zap, Target, BarChart3,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeAgentContributions,
  type AgentOptimizationResult,
  type AgentContribution,
  type AgentRole,
} from '@/lib/forex/agentContributionEngine';
import { cn } from '@/lib/utils';

// ─── Role Config ─────────────────────────────────────────────────────

const ROLE_CONFIG: Record<AgentRole, { icon: typeof Crown; label: string; color: string; bg: string }> = {
  champion: { icon: Crown, label: 'Champion', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  stabilizer: { icon: Shield, label: 'Stabilizer', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  specialist: { icon: Crosshair, label: 'Specialist', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  diluter: { icon: EyeOff, label: 'Diluter', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

function RoleBadge({ role }: { role: AgentRole }) {
  const cfg = ROLE_CONFIG[role];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1', cfg.bg, cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function DeltaValue({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.001;
  return (
    <span className={cn('text-xs font-mono', neutral ? 'text-muted-foreground' : positive ? 'text-emerald-400' : 'text-red-400')}>
      {neutral ? <Minus className="w-3 h-3 inline" /> : positive ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
      {Math.abs(value).toFixed(3)}{suffix}
    </span>
  );
}

// ─── Expanded Agent Detail ───────────────────────────────────────────

function AgentDetail({ agent }: { agent: AgentContribution }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-background/50 border-t border-border/20">
      {/* Exclusion Impact */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">System Impact (Without Agent)</h4>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span>ΔExpectancy</span>
            <DeltaValue value={agent.exclusionDelta.deltaExpectancy} suffix="p" />
          </div>
          <div className="flex justify-between">
            <span>ΔProfit Factor</span>
            <DeltaValue value={agent.exclusionDelta.deltaPF} />
          </div>
          <div className="flex justify-between">
            <span>ΔMax DD</span>
            <DeltaValue value={agent.exclusionDelta.deltaMaxDD} suffix="p" invert />
          </div>
          <div className="flex justify-between">
            <span>ΔSharpe</span>
            <DeltaValue value={agent.exclusionDelta.deltaSharpe} />
          </div>
          <div className="flex justify-between">
            <span>ΔHarm Rate</span>
            <DeltaValue value={agent.exclusionDelta.deltaHarmRate} suffix="%" invert />
          </div>
        </div>
      </div>

      {/* Pair Performance */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Pair Performance</h4>
        <div className="space-y-1 text-[11px]">
          {agent.pairMetrics.slice(0, 5).map(p => (
            <div key={p.pair} className="flex justify-between">
              <span className={agent.allowedPairs.includes(p.pair) ? 'text-foreground' : 'text-muted-foreground line-through'}>{p.pair}</span>
              <span className={p.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {p.expectancy.toFixed(2)}p · {p.trades}t · PF {p.profitFactor.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Session + Regime */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Session Performance</h4>
        <div className="space-y-1 text-[11px]">
          {agent.sessionMetrics.slice(0, 5).map(s => (
            <div key={s.session} className="flex justify-between">
              <span className={agent.allowedSessions.includes(s.session) ? 'text-foreground' : 'text-muted-foreground'}>{s.session}</span>
              <span className={s.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {s.expectancy.toFixed(2)}p · {s.trades}t
              </span>
            </div>
          ))}
        </div>
        <h4 className="text-xs font-semibold mb-2 mt-3 text-muted-foreground">Regime Performance</h4>
        <div className="space-y-1 text-[11px]">
          {agent.regimeMetrics.slice(0, 4).map(r => (
            <div key={r.regime} className="flex justify-between">
              <span>{r.regime}</span>
              <span className={r.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {r.expectancy.toFixed(2)}p · {r.trades}t
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Reasoning + Deployment */}
      <div className="md:col-span-2">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Classification Reasoning</h4>
        <div className="space-y-1 text-[11px]">
          {agent.reasoning.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Multiplier + Alignment */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Live Deployment</h4>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span>Priority</span>
            <Badge variant="outline" className="text-[9px]">{agent.priority}</Badge>
          </div>
          <div className="flex justify-between">
            <span>Multiplier</span>
            <span className="font-mono font-bold">{agent.recommendedMultiplier.toFixed(2)}×</span>
          </div>
          <div className="flex justify-between">
            <span>Range</span>
            <span className="font-mono text-muted-foreground">{agent.multiplierRange[0]}× – {agent.multiplierRange[1]}×</span>
          </div>
          <div className="flex justify-between">
            <span>Pair Alignment</span>
            <Badge variant="outline" className={cn('text-[9px]',
              agent.pairAlignment === 'primary' ? 'bg-emerald-500/10 text-emerald-400' :
              agent.pairAlignment === 'secondary' ? 'bg-amber-500/10 text-amber-400' :
              'bg-red-500/10 text-red-400'
            )}>{agent.pairAlignment}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Allowed pairs: </span>
            <span>{agent.allowedPairs.length > 0 ? agent.allowedPairs.join(', ') : 'None (shadow only)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────

function exportCSV(result: AgentOptimizationResult) {
  const headers = ['Agent', 'Role', 'Priority', 'Trades', 'WinRate', 'Expectancy', 'NetPips', 'PF', 'Sharpe', 'MaxDD', 'HarmRate', 'Multiplier', 'Alignment', 'AllowedPairs', 'ΔExp', 'ΔPF', 'ΔDD'];
  const rows = result.contributions.map(c => [
    c.agentId, c.role, c.priority, c.trades,
    (c.winRate * 100).toFixed(1), c.expectancy.toFixed(3), c.netPips.toFixed(1),
    c.profitFactor.toFixed(2), c.sharpe.toFixed(2), c.maxDrawdown.toFixed(1),
    (c.harmRate * 100).toFixed(1), c.recommendedMultiplier.toFixed(2),
    c.pairAlignment, c.allowedPairs.join(';'),
    c.exclusionDelta.deltaExpectancy.toFixed(3),
    c.exclusionDelta.deltaPF.toFixed(2),
    c.exclusionDelta.deltaMaxDD.toFixed(1),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-optimization-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export function AgentLiveOptimizationDashboard() {
  const { user } = useAuth();
  const [result, setResult] = useState<AgentOptimizationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let targetUserId = user?.id;

      // Find data owner if needed
      if (!targetUserId) {
        const { data: ownerRow } = await supabase
          .from('oanda_orders')
          .select('user_id')
          .limit(1)
          .maybeSingle();
        if (ownerRow?.user_id) targetUserId = ownerRow.user_id;
      }

      if (!targetUserId) { setLoading(false); return; }

      // Fetch closed trades with full metadata
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: orders, error } = await supabase
        .from('oanda_orders')
        .select('agent_id, direction, currency_pair, entry_price, exit_price, session_label, regime_label, spread_at_entry, governance_composite, confidence_score, created_at')
        .eq('user_id', targetUserId)
        .eq('status', 'closed')
        .in('environment', ['live', 'practice', 'backtest'])
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .not('agent_id', 'is', null)
        .gte('created_at', sixMonthsAgo)
        .order('created_at', { ascending: true })
        .limit(5000);

      if (error) { console.error('[AgentOptLive] Query error:', error); return; }
      if (!orders || orders.length === 0) { setResult(null); return; }

      const trades = orders.map(o => ({
        agent_id: o.agent_id!,
        direction: o.direction,
        currency_pair: o.currency_pair,
        entry_price: o.entry_price!,
        exit_price: o.exit_price!,
        session_label: o.session_label,
        regime_label: o.regime_label,
        spread_at_entry: o.spread_at_entry,
        governance_composite: o.governance_composite,
        confidence_score: o.confidence_score,
        created_at: o.created_at,
      }));

      const analysis = analyzeAgentContributions(trades);
      setResult(analysis);
    } catch (err) {
      console.error('[AgentOptLive] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analyzing agent contributions...</p>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No trade data available for analysis.</p>
        </CardContent>
      </Card>
    );
  }

  const roleCounts = {
    champion: result.contributions.filter(c => c.role === 'champion').length,
    stabilizer: result.contributions.filter(c => c.role === 'stabilizer').length,
    specialist: result.contributions.filter(c => c.role === 'specialist').length,
    diluter: result.contributions.filter(c => c.role === 'diluter').length,
  };

  const imp = result.improvementSummary;

  return (
    <div className="space-y-6">
      {/* Improvement Summary */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Agent Live Optimization
              <span className="text-[10px] text-muted-foreground font-normal ml-2">
                {result.systemBaseline.trades.toLocaleString()} trades · {result.contributions.length} agents
              </span>
            </CardTitle>
            <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1" onClick={() => exportCSV(result)}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {(['champion', 'stabilizer', 'specialist', 'diluter'] as AgentRole[]).map(role => {
              const cfg = ROLE_CONFIG[role];
              const Icon = cfg.icon;
              return (
                <div key={role} className={cn('p-3 rounded-lg border text-center', cfg.bg)}>
                  <Icon className={cn('w-5 h-5 mx-auto mb-1', cfg.color)} />
                  <div className={cn('text-xl font-bold', cfg.color)}>{roleCounts[role]}</div>
                  <div className="text-[10px] text-muted-foreground">{cfg.label}s</div>
                </div>
              );
            })}
          </div>

          {/* Before/After comparison */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Expectancy</div>
              <div className="text-xs text-muted-foreground line-through">{imp.baselineExpectancy.toFixed(3)}p</div>
              <div className={cn('text-sm font-bold font-mono', imp.optimizedExpectancy > imp.baselineExpectancy ? 'text-emerald-400' : 'text-foreground')}>
                {imp.optimizedExpectancy.toFixed(3)}p
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Profit Factor</div>
              <div className="text-xs text-muted-foreground line-through">{imp.baselinePF.toFixed(2)}</div>
              <div className={cn('text-sm font-bold font-mono', imp.optimizedPF > imp.baselinePF ? 'text-emerald-400' : 'text-foreground')}>
                {imp.optimizedPF.toFixed(2)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Max Drawdown</div>
              <div className="text-xs text-muted-foreground line-through">{imp.baselineDD.toFixed(1)}p</div>
              <div className={cn('text-sm font-bold font-mono', imp.optimizedDD < imp.baselineDD ? 'text-emerald-400' : 'text-foreground')}>
                {imp.optimizedDD.toFixed(1)}p
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Agents</div>
              <div className="text-sm font-bold">
                <span className="text-emerald-400">{imp.agentsEnabled}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-red-400">{imp.agentsShadowed} shadow</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30">
          <TabsTrigger value="roles" className="text-xs gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Agent Roles</TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs gap-1.5"><TrendingUp className="w-3.5 h-3.5" />With/Without</TabsTrigger>
          <TabsTrigger value="alignment" className="text-xs gap-1.5"><Target className="w-3.5 h-3.5" />Pair × Agent</TabsTrigger>
        </TabsList>

        {/* Agent Role Table */}
        <TabsContent value="roles">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Agent</TableHead>
                    <TableHead className="text-[10px]">Role</TableHead>
                    <TableHead className="text-[10px]">Priority</TableHead>
                    <TableHead className="text-[10px] text-right">Trades</TableHead>
                    <TableHead className="text-[10px] text-right">Net Pips</TableHead>
                    <TableHead className="text-[10px] text-right">WR</TableHead>
                    <TableHead className="text-[10px] text-right">Exp</TableHead>
                    <TableHead className="text-[10px] text-right">PF</TableHead>
                    <TableHead className="text-[10px] text-right">Harm</TableHead>
                    <TableHead className="text-[10px] text-right">Mult</TableHead>
                    <TableHead className="text-[10px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.contributions.map(c => (
                    <>
                      <TableRow
                        key={c.agentId}
                        className="cursor-pointer hover:bg-primary/5"
                        onClick={() => setExpandedAgent(expandedAgent === c.agentId ? null : c.agentId)}
                      >
                        <TableCell className="text-xs font-mono">{c.agentId}</TableCell>
                        <TableCell><RoleBadge role={c.role} /></TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]">{c.priority}</Badge></TableCell>
                        <TableCell className="text-right text-xs">{c.trades.toLocaleString()}</TableCell>
                        <TableCell className={cn('text-right text-xs font-mono', c.netPips > 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.netPips > 0 ? '+' : ''}{c.netPips.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{(c.winRate * 100).toFixed(1)}%</TableCell>
                        <TableCell className={cn('text-right text-xs font-mono', c.expectancy > 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.expectancy.toFixed(3)}
                        </TableCell>
                        <TableCell className={cn('text-right text-xs font-mono', c.profitFactor >= 1.1 ? 'text-emerald-400' : 'text-red-400')}>
                          {c.profitFactor.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn('text-right text-xs', c.harmRate > 0.1 ? 'text-red-400' : 'text-muted-foreground')}>
                          {(c.harmRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold">
                          {c.recommendedMultiplier.toFixed(2)}×
                        </TableCell>
                        <TableCell>
                          {expandedAgent === c.agentId ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </TableCell>
                      </TableRow>
                      {expandedAgent === c.agentId && (
                        <TableRow key={`${c.agentId}-detail`}>
                          <TableCell colSpan={11} className="p-0">
                            <AgentDetail agent={c} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* With/Without Comparison */}
        <TabsContent value="comparison">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display">System With vs Without Each Agent</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Agent</TableHead>
                    <TableHead className="text-[10px]">Role</TableHead>
                    <TableHead className="text-[10px] text-right">Sys Exp (with)</TableHead>
                    <TableHead className="text-[10px] text-right">Sys Exp (without)</TableHead>
                    <TableHead className="text-[10px] text-right">ΔExp</TableHead>
                    <TableHead className="text-[10px] text-right">ΔPF</TableHead>
                    <TableHead className="text-[10px] text-right">ΔMaxDD</TableHead>
                    <TableHead className="text-[10px] text-right">ΔSharpe</TableHead>
                    <TableHead className="text-[10px] text-center">Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.contributions.map(c => {
                    const keeps = c.exclusionDelta.deltaExpectancy > 0;
                    return (
                      <TableRow key={c.agentId}>
                        <TableCell className="text-xs font-mono">{c.agentId}</TableCell>
                        <TableCell><RoleBadge role={c.role} /></TableCell>
                        <TableCell className="text-right text-xs font-mono">{result.systemBaseline.expectancy.toFixed(3)}p</TableCell>
                        <TableCell className="text-right text-xs font-mono">{c.exclusionDelta.systemWithout.expectancy.toFixed(3)}p</TableCell>
                        <TableCell className="text-right"><DeltaValue value={c.exclusionDelta.deltaExpectancy} suffix="p" /></TableCell>
                        <TableCell className="text-right"><DeltaValue value={c.exclusionDelta.deltaPF} /></TableCell>
                        <TableCell className="text-right"><DeltaValue value={c.exclusionDelta.deltaMaxDD} suffix="p" invert /></TableCell>
                        <TableCell className="text-right"><DeltaValue value={c.exclusionDelta.deltaSharpe} /></TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn('text-[9px]', keeps ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                            {keeps ? 'KEEP' : 'SHADOW'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pair × Agent Alignment */}
        <TabsContent value="alignment">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display">Pair × Agent Alignment Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Primary pair */}
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400">PRIMARY</Badge>
                    <span className="text-sm font-bold font-mono">USD_CAD</span>
                    <span className="text-[10px] text-muted-foreground">— Champions + Stabilizers only</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.contributions
                      .filter(c => c.allowedPairs.includes('USD_CAD'))
                      .map(c => (
                        <div key={c.agentId} className="flex items-center gap-1 text-[11px] bg-card/50 px-2 py-1 rounded border border-border/30">
                          <RoleBadge role={c.role} />
                          <span className="font-mono">{c.agentId}</span>
                          <span className="text-muted-foreground">({c.recommendedMultiplier}×)</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Secondary pairs */}
                {['AUD_USD', 'EUR_USD', 'EUR_GBP'].map(pair => {
                  const agents = result.contributions.filter(c => c.allowedPairs.includes(pair));
                  return (
                    <div key={pair} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400">SECONDARY</Badge>
                        <span className="text-sm font-bold font-mono">{pair}</span>
                        <span className="text-[10px] text-muted-foreground">— Prime sessions only (London→NY)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {agents.length > 0 ? agents.map(c => (
                          <div key={c.agentId} className="flex items-center gap-1 text-[11px] bg-card/50 px-2 py-1 rounded border border-border/30">
                            <RoleBadge role={c.role} />
                            <span className="font-mono">{c.agentId}</span>
                          </div>
                        )) : (
                          <span className="text-[11px] text-muted-foreground italic">No agents qualified</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Shadowed agents */}
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400">SHADOW</Badge>
                    <span className="text-[10px] text-muted-foreground">— No live influence</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.contributions
                      .filter(c => c.role === 'diluter')
                      .map(c => (
                        <div key={c.agentId} className="flex items-center gap-1 text-[11px] bg-card/50 px-2 py-1 rounded border border-border/30">
                          <RoleBadge role={c.role} />
                          <span className="font-mono">{c.agentId}</span>
                          <span className="text-muted-foreground">({c.reasoning[0]})</span>
                        </div>
                      ))}
                    {result.contributions.filter(c => c.role === 'diluter').length === 0 && (
                      <span className="text-[11px] text-emerald-400 italic">No diluters detected ✓</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
