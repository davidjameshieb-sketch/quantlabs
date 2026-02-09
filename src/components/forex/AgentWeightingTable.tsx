// Agent Weighting Table — shows which agents get capital priority and why
import { useMemo } from 'react';
import { getAgentWeightingTable, type AgentCapitalPriority } from '@/lib/forex/metaOrchestrator';
import { cn } from '@/lib/utils';

const priorityColors: Record<AgentCapitalPriority, string> = {
  HIGH: 'text-neural-green bg-neural-green/10 border-neural-green/30',
  STANDARD: 'text-primary bg-primary/10 border-primary/30',
  REDUCED: 'text-neural-orange bg-neural-orange/10 border-neural-orange/30',
  BLOCKED: 'text-neural-red bg-neural-red/10 border-neural-red/30',
};

const priorityLabels: Record<AgentCapitalPriority, string> = {
  HIGH: '↑ High',
  STANDARD: '● Standard',
  REDUCED: '↓ Reduced',
  BLOCKED: '✕ Blocked',
};

export const AgentWeightingTable = () => {
  const agents = useMemo(() => getAgentWeightingTable(), []);

  const grouped = useMemo(() => {
    const order: AgentCapitalPriority[] = ['HIGH', 'STANDARD', 'REDUCED', 'BLOCKED'];
    return order.map(priority => ({
      priority,
      agents: agents.filter(a => a.capitalPriority === priority),
    })).filter(g => g.agents.length > 0);
  }, [agents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Agent Capital Weighting</h3>
        <div className="flex items-center gap-2">
          {(['HIGH', 'STANDARD', 'REDUCED', 'BLOCKED'] as AgentCapitalPriority[]).map(p => (
            <span key={p} className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', priorityColors[p])}>
              {agents.filter(a => a.capitalPriority === p).length} {priorityLabels[p]}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Agent</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Priority</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Multiplier</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">WR</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Sharpe</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(group =>
              group.agents.map((agent, idx) => (
                <tr
                  key={agent.agentId}
                  className={cn(
                    'border-b border-border/20 hover:bg-muted/20 transition-colors',
                    agent.capitalPriority === 'BLOCKED' && 'opacity-60'
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{agent.icon}</span>
                      <span className="font-medium text-foreground">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{agent.model}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('px-2 py-0.5 rounded border text-[10px] font-bold', priorityColors[agent.capitalPriority])}>
                      {priorityLabels[agent.capitalPriority]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono font-bold text-foreground">
                    {agent.capitalMultiplier === 0 ? '—' : `${agent.capitalMultiplier}×`}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                    {(agent.baseWinRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                    {agent.baseSharpe.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={agent.reason}>
                    {agent.reason}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
