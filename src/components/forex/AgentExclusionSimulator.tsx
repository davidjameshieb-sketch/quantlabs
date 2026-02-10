// Agent Exclusion Simulator — "What-if" dashboard
// Toggle agents on/off to see how edge health metrics would change
// Uses canonical agentStateResolver for effective tier display
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ALL_AGENT_IDS, AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import type { AgentId } from '@/lib/agents/types';
import type { HealthColor } from '@/hooks/useEdgeHealthStats';
import { resolveAgentStatesFromStats, type AgentEffectiveState } from '@/lib/agents/agentStateResolver';
import { EffectiveTierBadge, PostRescueMetricsNote } from './AgentStateBadges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowUp, ArrowDown, TrendingUp, TrendingDown,
  FlaskConical, Download, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────────

interface AgentStats {
  agent_id: string;
  total_trades: number;
  win_count: number;
  net_pips: number;
  gross_profit: number;
  gross_loss: number;
  long_count: number;
  long_wins: number;
  long_net: number;
  short_count: number;
  short_wins: number;
  short_net: number;
}

interface SimulatedHealth {
  status: HealthColor;
  statusLabel: string;
  totalTrades: number;
  winRate: number;
  expectancy: number;
  pf: number;
  longWR: number;
  shortWR: number;
  longNet: number;
  shortNet: number;
  sessions: { session: string; netPips: number; color: HealthColor }[];
  topPairs: { pair: string; netPips: number; color: HealthColor }[];
  worstPairs: { pair: string; netPips: number; color: HealthColor }[];
}

interface AgentImpact {
  id: string;
  name: string;
  trades: number;
  winRate: number;
  netPips: number;
  pf: number;
  color: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeHealthFromAgents(agents: AgentStats[]): SimulatedHealth {
  const totalTrades = agents.reduce((s, a) => s + a.total_trades, 0);
  if (totalTrades === 0) {
    return {
      status: 'red', statusLabel: 'No Data', totalTrades: 0,
      winRate: 0, expectancy: 0, pf: 0, longWR: 0, shortWR: 0,
      longNet: 0, shortNet: 0, sessions: [], topPairs: [], worstPairs: [],
    };
  }

  const totalWins = agents.reduce((s, a) => s + a.win_count, 0);
  const grossProfit = agents.reduce((s, a) => s + a.gross_profit, 0);
  const grossLoss = agents.reduce((s, a) => s + a.gross_loss, 0);
  const netPips = agents.reduce((s, a) => s + a.net_pips, 0);
  const pf = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0;
  const expectancy = Math.round((netPips / totalTrades) * 100) / 100;

  const totalLongs = agents.reduce((s, a) => s + a.long_count, 0);
  const totalLongWins = agents.reduce((s, a) => s + a.long_wins, 0);
  const totalShorts = agents.reduce((s, a) => s + a.short_count, 0);
  const totalShortWins = agents.reduce((s, a) => s + a.short_wins, 0);
  const longWR = totalLongs > 0 ? Math.round((totalLongWins / totalLongs) * 1000) / 10 : 0;
  const shortWR = totalShorts > 0 ? Math.round((totalShortWins / totalShorts) * 1000) / 10 : 0;
  const longNet = Math.round(agents.reduce((s, a) => s + a.long_net, 0) * 10) / 10;
  const shortNet = Math.round(agents.reduce((s, a) => s + a.short_net, 0) * 10) / 10;

  const sWR = totalShorts > 0 ? totalShortWins / totalShorts : 0;
  let status: HealthColor = 'yellow';
  let statusLabel = 'Edge Developing';
  if (pf < 1.0 || expectancy <= 0 || sWR < 0.35) { status = 'red'; statusLabel = 'Edge Unhealthy'; }
  else if (pf >= 1.5 && expectancy > 0.3 && sWR > 0.45) { status = 'green'; statusLabel = 'Edge Healthy'; }

  return {
    status, statusLabel, totalTrades,
    winRate: Math.round((totalWins / totalTrades) * 1000) / 10,
    expectancy, pf, longWR, shortWR, longNet, shortNet,
    sessions: [], topPairs: [], worstPairs: [],
  };
}

// ─── Status colors ──────────────────────────────────────────────────

const statusBg: Record<HealthColor, string> = {
  green: 'bg-neural-green/10 border-neural-green/30',
  yellow: 'bg-neural-orange/10 border-neural-orange/30',
  red: 'bg-neural-red/10 border-neural-red/30',
};
const statusText: Record<HealthColor, string> = {
  green: 'text-neural-green',
  yellow: 'text-neural-orange',
  red: 'text-neural-red',
};

// ─── Component ──────────────────────────────────────────────────────

export const AgentExclusionSimulator = () => {
  const { user } = useAuth();
  const [agentStatsMap, setAgentStatsMap] = useState<Map<string, AgentStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [uniqueAgents, setUniqueAgents] = useState<string[]>([]);

  // Fetch aggregated agent stats via server-side RPC (with data-owner fallback)
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        let targetUserId = user.id;
        let { data, error } = await supabase.rpc('get_agent_simulator_stats', {
          p_user_id: targetUserId,
        });

        // If no results for current user, find the actual data owner
        if ((!data || data.length === 0) && !error) {
          const { data: ownerRow } = await supabase
            .from('oanda_orders')
            .select('user_id')
            .limit(1)
            .maybeSingle();
          if (ownerRow?.user_id && ownerRow.user_id !== targetUserId) {
            targetUserId = ownerRow.user_id;
            const result = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId });
            data = result.data;
            error = result.error;
          }
        }

        if (error) throw error;
        if (!data || data.length === 0) { setLoading(false); return; }

        const statsMap = new Map<string, AgentStats>();
        for (const row of data as any[]) {
          statsMap.set(row.agent_id, {
            agent_id: row.agent_id,
            total_trades: Number(row.total_trades),
            win_count: Number(row.win_count),
            net_pips: Number(row.net_pips),
            gross_profit: Number(row.gross_profit),
            gross_loss: Number(row.gross_loss),
            long_count: Number(row.long_count),
            long_wins: Number(row.long_wins),
            long_net: Number(row.long_net),
            short_count: Number(row.short_count),
            short_wins: Number(row.short_wins),
            short_net: Number(row.short_net),
          });
        }
        setAgentStatsMap(statsMap);

        const registeredIds = ALL_AGENT_IDS as string[];
        const dataIds = [...statsMap.keys()];
        const agents = [...new Set([...registeredIds, ...dataIds])];
        setUniqueAgents(agents);
        setEnabledAgents(new Set(agents));
      } catch (err) {
        console.error('[AgentSim] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Toggle helpers
  const toggleAgent = (agentId: string) => {
    setEnabledAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
      return next;
    });
  };
  const selectAll = () => setEnabledAgents(new Set(ALL_AGENT_IDS as string[]));
  const deselectAll = () => setEnabledAgents(new Set());

  // Compute baseline (all agents) and simulated (selected agents)
  const allAgentStats = useMemo(() => [...agentStatsMap.values()], [agentStatsMap]);
  const baseline = useMemo(() => computeHealthFromAgents(allAgentStats), [allAgentStats]);
  const filteredStats = useMemo(
    () => allAgentStats.filter(a => enabledAgents.has(a.agent_id)),
    [allAgentStats, enabledAgents],
  );
  const simulated = useMemo(() => computeHealthFromAgents(filteredStats), [filteredStats]);

  // Per-agent stats
  const agentImpacts: AgentImpact[] = useMemo(() => {
    return uniqueAgents.map(id => {
      const stats = agentStatsMap.get(id);
      const def = AGENT_DEFINITIONS[id as AgentId];
      if (!stats) {
        return {
          id, name: def?.name || id, trades: 0, winRate: 0, netPips: 0, pf: 0, color: def?.color || '#888',
        };
      }
      return {
        id,
        name: def?.name || id,
        trades: stats.total_trades,
        winRate: stats.total_trades > 0 ? Math.round((stats.win_count / stats.total_trades) * 1000) / 10 : 0,
        netPips: Math.round(stats.net_pips * 10) / 10,
        pf: stats.gross_loss > 0 ? Math.round((stats.gross_profit / stats.gross_loss) * 100) / 100 : 0,
        color: def?.color || '#888',
      };
    }).sort((a, b) => b.netPips - a.netPips);
  }, [agentStatsMap, uniqueAgents]);

  // Compute delta values
  const delta = (sim: number, base: number) => {
    const d = Math.round((sim - base) * 100) / 100;
    return d;
  };

  // CSV Export
  const exportCSV = () => {
    const header = 'Agent,Enabled,Trades,WinRate,NetPips,PF\n';
    const rows = agentImpacts.map(a =>
      `${a.name},${enabledAgents.has(a.id)},${a.trades},${a.winRate}%,${a.netPips},${a.pf}`
    ).join('\n');
    const sim = `\nSIMULATED HEALTH\nTrades,${simulated.totalTrades}\nWin Rate,${simulated.winRate}%\nExpectancy,${simulated.expectancy}\nPF,${simulated.pf}\nStatus,${simulated.statusLabel}\n`;
    const blob = new Blob([header + rows + sim], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'agent-exclusion-simulation.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">Loading trade data…</p>
        </CardContent>
      </Card>
    );
  }

  if (agentStatsMap.size === 0) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">No trade data available for simulation.</p>
        </CardContent>
      </Card>
    );
  }

  const excludedCount = uniqueAgents.length - enabledAgents.size;

  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-display">Agent Exclusion Simulator</CardTitle>
            <Badge variant="outline" className="text-[9px]">What-If</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={selectAll}>
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={exportCSV}>
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Toggle agents on/off to simulate how edge health would change.
          {excludedCount > 0 && (
            <span className="text-neural-orange font-bold ml-1">
              {excludedCount} agent{excludedCount > 1 ? 's' : ''} excluded
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {agentImpacts.map(agent => {
            const enabled = enabledAgents.has(agent.id);
            const isHarming = agent.netPips < 0;
            const stats = agentStatsMap.get(agent.id);
            const allStatsArr = [...agentStatsMap.values()];
            const resolved = stats ? resolveAgentStatesFromStats(allStatsArr) : [];
            const es = resolved.find(s => s.agentId === agent.id);
            return (
              <label
                key={agent.id}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-all',
                  enabled
                    ? 'bg-card border-border/40 hover:border-border/60'
                    : 'bg-muted/20 border-border/20 opacity-60',
                )}
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={() => toggleAgent(agent.id)}
                  className="data-[state=checked]:bg-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="text-[11px] font-medium truncate">{agent.name}</span>
                    {es && <EffectiveTierBadge tier={es.effectiveTier} />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                    <span>{es?.rescued ? `${es.effectiveMetrics.eligibleTrades}/${agent.trades}` : agent.trades} trades</span>
                    <span>WR {es?.rescued ? (es.effectiveMetrics.winRate * 100).toFixed(1) : agent.winRate}%</span>
                    <span className={cn('font-mono font-bold', isHarming ? 'text-neural-red' : 'text-neural-green')}>
                      {agent.netPips >= 0 ? '+' : ''}{es?.rescued ? es.effectiveMetrics.netPips.toFixed(0) : agent.netPips}p
                    </span>
                    <span className="font-mono">PF {es?.rescued ? es.effectiveMetrics.profitFactor.toFixed(2) : agent.pf}</span>
                    {es?.rescued && <PostRescueMetricsNote state={es} />}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => {
              const profitable = new Set(agentImpacts.filter(a => a.netPips > 0).map(a => a.id));
              setEnabledAgents(profitable);
            }}
          >
            Only Profitable
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => {
              const good = new Set(agentImpacts.filter(a => a.pf >= 1.0).map(a => a.id));
              setEnabledAgents(good);
            }}
          >
            PF ≥ 1.0 Only
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => {
              const good = new Set(agentImpacts.filter(a => a.winRate >= 50).map(a => a.id));
              setEnabledAgents(good);
            }}
          >
            WR ≥ 50% Only
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={deselectAll}>
            Deselect All
          </Button>
        </div>

        {/* Baseline vs Simulated comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Baseline */}
          <HealthCard
            title="BASELINE (All Agents)"
            health={baseline}
            isBaseline
          />
          {/* Simulated */}
          <HealthCard
            title={`SIMULATED (${enabledAgents.size}/${uniqueAgents.length} agents)`}
            health={simulated}
            baseline={baseline}
          />
        </div>

        {/* Delta summary */}
        {excludedCount > 0 && (
          <div className="bg-muted/30 rounded-lg border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Impact of Exclusion</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DeltaStat label="Trades" value={delta(simulated.totalTrades, baseline.totalTrades)} suffix="" isCount />
              <DeltaStat label="Win Rate" value={delta(simulated.winRate, baseline.winRate)} suffix="%" />
              <DeltaStat label="Expectancy" value={delta(simulated.expectancy, baseline.expectancy)} suffix="p" />
              <DeltaStat label="Profit Factor" value={delta(simulated.pf, baseline.pf)} suffix="" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────

const HealthCard = ({
  title, health, baseline, isBaseline,
}: {
  title: string;
  health: SimulatedHealth;
  baseline?: SimulatedHealth;
  isBaseline?: boolean;
}) => (
  <div className={cn('rounded-lg border p-3 space-y-2', statusBg[health.status])}>
    <div className="flex items-center justify-between">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{title}</p>
      <Badge variant="outline" className={cn('text-[9px] font-bold', statusText[health.status])}>
        {health.statusLabel}
      </Badge>
    </div>

    <div className="grid grid-cols-2 gap-1.5">
      <MiniStat label="Trades" value={health.totalTrades.toLocaleString()} />
      <MiniStat label="Win Rate" value={`${health.winRate}%`} color={health.winRate >= 50 ? 'green' : 'red'} />
      <MiniStat label="Expect." value={`${health.expectancy >= 0 ? '+' : ''}${health.expectancy}p`} color={health.expectancy > 0 ? 'green' : 'red'} />
      <MiniStat label="PF" value={`${health.pf}`} color={health.pf >= 1.5 ? 'green' : health.pf >= 1.0 ? 'yellow' : 'red'} />
    </div>

    {/* Direction */}
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-[10px]">
        <ArrowUp className="w-3 h-3 text-neural-green" />
        <span className="text-muted-foreground">Long</span>
        <span className={cn('font-mono font-bold ml-auto', health.longWR >= 50 ? 'text-neural-green' : 'text-neural-red')}>
          {health.longWR}% · {health.longNet >= 0 ? '+' : ''}{health.longNet}p
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        <ArrowDown className="w-3 h-3 text-neural-red" />
        <span className="text-muted-foreground">Short</span>
        <span className={cn('font-mono font-bold ml-auto', health.shortWR >= 45 ? 'text-neural-green' : 'text-neural-red')}>
          {health.shortWR}% · {health.shortNet >= 0 ? '+' : ''}{health.shortNet}p
        </span>
      </div>
    </div>

    {/* Sessions */}
    {health.sessions.length > 0 && (
      <div className="space-y-0.5">
        <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Sessions</p>
        {health.sessions.slice(0, 4).map(s => (
          <div key={s.session} className="flex items-center gap-1.5 text-[9px]">
            <span className={cn('w-1.5 h-1.5 rounded-full', statusText[s.color].replace('text-', 'bg-'))} />
            <span className="text-muted-foreground truncate flex-1">{s.session}</span>
            <span className={cn('font-mono font-bold', s.netPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
              {s.netPips >= 0 ? '+' : ''}{s.netPips}p
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const MiniStat = ({ label, value, color }: { label: string; value: string; color?: HealthColor }) => (
  <div className="bg-background/40 rounded-md px-2 py-1.5 text-center">
    <p className="text-[8px] text-muted-foreground">{label}</p>
    <p className={cn('text-xs font-mono font-bold', color ? statusText[color] : 'text-foreground')}>{value}</p>
  </div>
);

const DeltaStat = ({ label, value, suffix, isCount }: { label: string; value: number; suffix: string; isCount?: boolean }) => {
  const improved = isCount ? true : value > 0;
  const neutral = value === 0;
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-mono font-bold',
        neutral ? 'text-muted-foreground' : improved ? 'text-neural-green' : 'text-neural-red',
      )}>
        {value > 0 ? '+' : ''}{value}{suffix}
      </p>
    </div>
  );
};
