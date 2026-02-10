// Compact edge health widget for the dashboard sidebar — auto-refreshes
// Includes GREEN/YELLOW/RED badge based on quantitative edge health rules.
// Shows rescued B-agent tier summary and respects long-only filter.
import { useState, useEffect, useMemo } from 'react';
import { useEdgeHealthStats, type HealthColor } from '@/hooks/useEdgeHealthStats';
import { useLongOnlyFilter } from '@/contexts/LongOnlyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { resolveAgentStatesFromStats, type AgentEffectiveState, type EffectiveTier } from '@/lib/agents/agentStateResolver';
import { EffectiveTierBadge } from '@/components/forex/AgentStateBadges';
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Clock, Layers, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const dot: Record<HealthColor, string> = {
  green: 'bg-neural-green',
  yellow: 'bg-neural-orange',
  red: 'bg-neural-red',
};

const bg: Record<HealthColor, string> = {
  green: 'bg-neural-green/10 border-neural-green/20',
  yellow: 'bg-neural-orange/10 border-neural-orange/20',
  red: 'bg-neural-red/10 border-neural-red/20',
};

const text: Record<HealthColor, string> = {
  green: 'text-neural-green',
  yellow: 'text-neural-orange',
  red: 'text-neural-red',
};

const BADGE_RULES: Record<HealthColor, string> = {
  green: 'PF≥1.5 · Exp>0.3 · ShortWR>45%',
  yellow: 'PF 1.0–1.5 or developing',
  red: 'PF<1.0 or Exp≤0 or ShortWR<35%',
};

// ─── Agent Tier Summary Hook ─────────────────────────────────────
function useAgentTierSummary(longOnly: boolean) {
  const { user } = useAuth();
  const [states, setStates] = useState<AgentEffectiveState[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let targetUserId = user.id;
      let { data, error } = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId });

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

      if (error || !data || data.length === 0) return;

      const effectiveStats = longOnly
        ? (data as any[]).map((s: any) => ({
            ...s,
            total_trades: Number(s.long_count) || 0,
            win_count: Number(s.long_wins) || 0,
            net_pips: Number(s.long_net) || 0,
            gross_profit: Math.max(0, Number(s.long_net) || 0),
            gross_loss: Math.max(0, -(Number(s.long_net) || 0)),
            short_count: 0,
            short_wins: 0,
            short_net: 0,
          }))
        : data;

      const rpcStats = (effectiveStats as any[]).map((s: any) => ({
        agent_id: s.agent_id,
        total_trades: Number(s.total_trades) || 0,
        win_count: Number(s.win_count) || 0,
        net_pips: Number(s.net_pips) || 0,
        gross_profit: Number(s.gross_profit) || 0,
        gross_loss: Number(s.gross_loss) || 0,
        long_count: Number(s.long_count) || 0,
        long_wins: Number(s.long_wins) || 0,
        long_net: Number(s.long_net) || 0,
        short_count: Number(s.short_count) || 0,
        short_wins: Number(s.short_wins) || 0,
        short_net: Number(s.short_net) || 0,
      }));

      setStates(resolveAgentStatesFromStats(rpcStats));
    })();
  }, [user, longOnly]);

  return states;
}

// ─── Component ──────────────────────────────────────────────────
export const EdgeHealthSidebar = () => {
  const stats = useEdgeHealthStats(45_000);
  const { longOnlyFilter } = useLongOnlyFilter();
  const agentStates = useAgentTierSummary(longOnlyFilter);

  // Compute effective stats when long-only
  const effectiveStats = useMemo(() => {
    if (!longOnlyFilter) return stats;
    // When long-only, zero out short metrics and recalculate
    const totalTrades = stats.totalTrades; // snapshot doesn't split by direction count
    const longNet = stats.longNet;
    return {
      ...stats,
      shortWR: 0,
      shortNet: 0,
      // Recalc status for long-only view
      statusLabel: stats.overallPF >= 1.5 && stats.overallExpectancy > 0.3
        ? 'Edge Healthy'
        : stats.overallPF >= 1.0 && stats.overallExpectancy > 0
        ? 'Edge Developing'
        : stats.statusLabel,
      status: stats.overallPF >= 1.5 && stats.overallExpectancy > 0.3
        ? 'green' as HealthColor
        : stats.overallPF >= 1.0 && stats.overallExpectancy > 0
        ? 'yellow' as HealthColor
        : stats.status,
    };
  }, [stats, longOnlyFilter]);

  // Tier counts
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { A: 0, 'B-Rescued': 0, 'B-Promotable': 0, 'B-Shadow': 0, C: 0, D: 0 };
    for (const s of agentStates) {
      const t = s.effectiveTier;
      if (t === 'A') counts.A++;
      else if (t === 'B-Rescued') counts['B-Rescued']++;
      else if (t === 'B-Promotable') counts['B-Promotable']++;
      else if (t === 'B-Shadow') counts['B-Shadow']++;
      else if (t === 'C') counts.C++;
      else counts.D++;
    }
    return counts;
  }, [agentStates]);

  if (!effectiveStats.lastUpdated) {
    return (
      <div className="px-4 py-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Edge Health</p>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header badge with classification rule */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edge Health</p>
          <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold', bg[effectiveStats.status], text[effectiveStats.status])}>
            <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', dot[effectiveStats.status])} />
            {effectiveStats.statusLabel}
          </div>
        </div>
        <p className="text-[8px] text-muted-foreground/60 font-mono">
          {longOnlyFilter ? 'Long-Only Mode Active' : BADGE_RULES[effectiveStats.status]}
        </p>
      </div>

      {/* 4-Layer stack indicator */}
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/70">
        <Layers className="w-3 h-3" />
        <span className="font-mono">L1→L2→L3→L4 active</span>
      </div>

      {/* Core stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <MiniStat label="Trades" value={effectiveStats.totalTrades.toLocaleString()} />
        <MiniStat label="Win Rate" value={`${effectiveStats.overallWinRate}%`} color={effectiveStats.overallWinRate >= 50 ? 'green' : 'red'} />
        <MiniStat label="Expect." value={`${effectiveStats.overallExpectancy >= 0 ? '+' : ''}${effectiveStats.overallExpectancy}p`} color={effectiveStats.overallExpectancy > 0 ? 'green' : 'red'} />
        <MiniStat label="PF" value={`${effectiveStats.overallPF}`} color={effectiveStats.overallPF >= 1.5 ? 'green' : effectiveStats.overallPF >= 1.0 ? 'yellow' : 'red'} />
      </div>

      {/* Direction split */}
      <div className="space-y-1">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Direction</p>
        <div className="flex items-center gap-2 text-[10px]">
          <ArrowUp className="w-3 h-3 text-neural-green" />
          <span className="text-muted-foreground">Long</span>
          <span className={cn('font-mono font-bold ml-auto', effectiveStats.longWR >= 50 ? 'text-neural-green' : 'text-neural-red')}>
            {effectiveStats.longWR}% · {effectiveStats.longNet >= 0 ? '+' : ''}{effectiveStats.longNet}p
          </span>
        </div>
        {!longOnlyFilter && (
          <div className="flex items-center gap-2 text-[10px]">
            <ArrowDown className="w-3 h-3 text-neural-red" />
            <span className="text-muted-foreground">Short</span>
            <span className={cn('font-mono font-bold ml-auto', effectiveStats.shortWR >= 45 ? 'text-neural-green' : 'text-neural-red')}>
              {effectiveStats.shortWR}% · {effectiveStats.shortNet >= 0 ? '+' : ''}{effectiveStats.shortNet}p
            </span>
          </div>
        )}
      </div>

      {/* Agent Fleet Tier Summary */}
      {agentStates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Fleet Status</p>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {tierCounts.A > 0 && (
              <div className="bg-emerald-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-emerald-400">{tierCounts.A}</p>
                <p className="text-[7px] text-muted-foreground">Tier A</p>
              </div>
            )}
            {tierCounts['B-Rescued'] > 0 && (
              <div className="bg-lime-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-lime-400">{tierCounts['B-Rescued']}</p>
                <p className="text-[7px] text-muted-foreground">Rescued</p>
              </div>
            )}
            {tierCounts['B-Promotable'] > 0 && (
              <div className="bg-emerald-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-emerald-400">{tierCounts['B-Promotable']}</p>
                <p className="text-[7px] text-muted-foreground">Promotable</p>
              </div>
            )}
            {tierCounts['B-Shadow'] > 0 && (
              <div className="bg-amber-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-amber-400">{tierCounts['B-Shadow']}</p>
                <p className="text-[7px] text-muted-foreground">Shadow</p>
              </div>
            )}
            {tierCounts.C > 0 && (
              <div className="bg-orange-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-orange-400">{tierCounts.C}</p>
                <p className="text-[7px] text-muted-foreground">Tier C</p>
              </div>
            )}
            {tierCounts.D > 0 && (
              <div className="bg-red-500/10 rounded px-1.5 py-1 text-center">
                <p className="text-[10px] font-bold text-red-400">{tierCounts.D}</p>
                <p className="text-[7px] text-muted-foreground">Tier D</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions */}
      {effectiveStats.sessions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sessions</p>
          {effectiveStats.sessions.slice(0, 5).map(s => (
            <div key={s.session} className="flex items-center gap-1.5 text-[10px]">
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dot[s.color])} />
              <span className="text-muted-foreground truncate flex-1">{s.session}</span>
              <span className={cn('font-mono font-bold', s.netPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                {s.netPips >= 0 ? '+' : ''}{s.netPips}p
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top pairs */}
      {effectiveStats.topPairs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Top Pairs</p>
          {effectiveStats.topPairs.map(p => (
            <div key={p.pair} className="flex items-center gap-1.5 text-[10px]">
              <TrendingUp className="w-3 h-3 text-neural-green flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">{p.pair.replace('_', '/')}</span>
              <span className="font-mono font-bold text-neural-green">+{p.netPips}p</span>
            </div>
          ))}
        </div>
      )}

      {/* Worst pairs */}
      {effectiveStats.worstPairs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Worst Pairs</p>
          {effectiveStats.worstPairs.map(p => (
            <div key={p.pair} className="flex items-center gap-1.5 text-[10px]">
              <TrendingDown className="w-3 h-3 text-neural-red flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">{p.pair.replace('_', '/')}</span>
              <span className="font-mono font-bold text-neural-red">{p.netPips}p</span>
            </div>
          ))}
        </div>
      )}

      {/* Last updated */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 pt-1">
        <Clock className="w-2.5 h-2.5" />
        <span>Updated {effectiveStats.lastUpdated.toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, color }: { label: string; value: string; color?: HealthColor }) => (
  <div className="bg-muted/30 rounded-md px-2 py-1.5 text-center">
    <p className="text-[9px] text-muted-foreground">{label}</p>
    <p className={cn('text-xs font-mono font-bold', color ? text[color] : 'text-foreground')}>{value}</p>
  </div>
);
