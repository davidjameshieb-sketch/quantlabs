// Agent Confidence vs Competence Radar
import { useState, useEffect, useCallback } from 'react';
import { Target, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface AgentStats {
  agent_id: string;
  avgThs: number;    // Confidence — avg THS reported
  winRate: number;   // Competence — actual win rate
  trades: number;
  netPips: number;
  delusional: boolean;
}

export function ConfidenceCompetencePanel() {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    // Get last 20 closed trades per agent
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('oanda_orders')
      .select('agent_id, trade_health_score, r_pips, entry_ths, status')
      .in('status', ['filled', 'closed'])
      .not('agent_id', 'is', null)
      .not('entry_price', 'is', null)
      .not('exit_price', 'is', null)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!data) { setLoading(false); return; }

    // Group by agent, take last 20
    const groups: Record<string, typeof data> = {};
    for (const row of data) {
      const aid = row.agent_id || 'unknown';
      if (!groups[aid]) groups[aid] = [];
      if (groups[aid].length < 20) groups[aid].push(row);
    }

    const stats: AgentStats[] = Object.entries(groups)
      .filter(([, rows]) => rows.length >= 3)
      .map(([agent_id, rows]) => {
        const thsValues = rows.filter(r => r.entry_ths != null).map(r => r.entry_ths!);
        const avgThs = thsValues.length > 0 ? Math.round(thsValues.reduce((a, b) => a + b, 0) / thsValues.length) : 50;
        const wins = rows.filter(r => (r.r_pips ?? 0) > 0).length;
        const winRate = Math.round((wins / rows.length) * 100);
        const netPips = rows.reduce((s, r) => s + (Number(r.r_pips) || 0), 0);
        const delusional = avgThs >= 80 && winRate < 40;
        return { agent_id, avgThs, winRate, trades: rows.length, netPips: Math.round(netPips * 10) / 10, delusional };
      })
      .sort((a, b) => (b.delusional ? 1 : 0) - (a.delusional ? 1 : 0) || b.trades - a.trades);

    setAgents(stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const delusionalCount = agents.filter(a => a.delusional).length;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[hsl(var(--neural-magenta))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">Confidence vs Competence</h3>
        </div>
        {delusionalCount > 0 && (
          <Badge variant="destructive" className="text-[8px] px-1.5 animate-pulse gap-1">
            <AlertCircle className="w-2.5 h-2.5" />
            {delusionalCount} DELUSIONAL
          </Badge>
        )}
      </div>

      {loading ? (
        <p className="text-[10px] text-muted-foreground text-center py-4">Analyzing agent competence...</p>
      ) : agents.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic text-center py-4">Insufficient trade data</p>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {agents.map(a => {
            const gap = a.avgThs - a.winRate;
            return (
              <div
                key={a.agent_id}
                className={cn(
                  'px-2.5 py-2 rounded-lg border text-[10px]',
                  a.delusional
                    ? 'border-[hsl(var(--neural-red))]/40 bg-[hsl(var(--neural-red))]/8'
                    : 'border-border/20'
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {a.delusional && <AlertCircle className="w-3 h-3 text-[hsl(var(--neural-red))]" />}
                    <span className="font-medium">{a.agent_id}</span>
                    {a.delusional && (
                      <Badge variant="destructive" className="text-[7px] px-1">DELUSIONAL</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">{a.trades} trades · {a.netPips >= 0 ? '+' : ''}{a.netPips}p</span>
                </div>
                {/* Dual bar */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-[65px] text-[9px] text-muted-foreground">Confidence</span>
                    <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--neural-cyan))]"
                        style={{ width: `${Math.min(a.avgThs, 100)}%` }}
                      />
                    </div>
                    <span className="w-[28px] text-right font-mono text-[hsl(var(--neural-cyan))]">{a.avgThs}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-[65px] text-[9px] text-muted-foreground">Competence</span>
                    <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          a.winRate >= 50 ? 'bg-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]'
                        )}
                        style={{ width: `${Math.min(a.winRate, 100)}%` }}
                      />
                    </div>
                    <span className={cn(
                      'w-[28px] text-right font-mono',
                      a.winRate >= 50 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                    )}>{a.winRate}%</span>
                  </div>
                </div>
                {gap > 30 && (
                  <p className="text-[8px] text-[hsl(var(--neural-red))] mt-1 italic">
                    ⚠ {gap}pt gap — auto-demotion pending
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
