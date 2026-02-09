// Agent Accountability Panel
// Tracks each agent's real signal-to-P&L contribution from OANDA execution data

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Star, Ban, Target } from 'lucide-react';
import { RealOrder, RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import { AGENT_DEFINITIONS, AgentDefinition } from '@/lib/agents/agentConfig';

interface AgentPnL {
  agentId: string;
  agentName: string;
  icon: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnlPips: number;
  avgPnlPips: number;
  avgQuality: number;
  avgSlippage: number;
  contribution: number; // % of total P&L
  status: 'outperforming' | 'neutral' | 'underperforming' | 'throttle-candidate';
}

interface AgentAccountabilityPanelProps {
  metrics: RealExecutionMetrics | null;
}

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

export const AgentAccountabilityPanel = ({ metrics }: AgentAccountabilityPanelProps) => {
  const agentData = useMemo((): AgentPnL[] => {
    if (!metrics?.hasData) return [];

    const closed = metrics.recentOrders.filter(
      o => o.status === 'closed' && o.entry_price != null && o.exit_price != null
    );

    if (closed.length === 0) return [];

    // Group by agent
    const agentMap = new Map<string, RealOrder[]>();
    for (const o of closed) {
      const id = o.agent_id || 'unknown';
      const arr = agentMap.get(id) || [];
      arr.push(o);
      agentMap.set(id, arr);
    }

    // Calculate per-agent P&L
    const results: AgentPnL[] = [];
    let totalAbsPnl = 0;

    for (const [agentId, orders] of agentMap) {
      const pips = orders.map(o => {
        const mult = getPipMultiplier(o.currency_pair);
        return o.direction === 'long'
          ? (o.exit_price! - o.entry_price!) * mult
          : (o.entry_price! - o.exit_price!) * mult;
      });

      const wins = pips.filter(p => p > 0);
      const losses = pips.filter(p => p <= 0);
      const netPnl = pips.reduce((s, p) => s + p, 0);
      totalAbsPnl += Math.abs(netPnl);

      const slippages = orders.map(o => o.slippage_pips).filter((v): v is number => v != null);
      const qualities = orders.map(o => o.execution_quality_score).filter((v): v is number => v != null);

      const config: AgentDefinition | undefined = Object.values(AGENT_DEFINITIONS).find(c => c.id === agentId);

      results.push({
        agentId,
        agentName: config?.name || agentId,
        icon: config?.icon || '🤖',
        tradeCount: orders.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate: wins.length / orders.length,
        netPnlPips: Math.round(netPnl * 10) / 10,
        avgPnlPips: Math.round((netPnl / orders.length) * 10) / 10,
        avgQuality: qualities.length ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length) : 0,
        avgSlippage: slippages.length ? Math.round(slippages.reduce((a, b) => a + b, 0) / slippages.length * 100) / 100 : 0,
        contribution: 0, // calculated after
        status: 'neutral',
      });
    }

    // Calculate contribution % and status
    for (const agent of results) {
      agent.contribution = totalAbsPnl > 0 ? (agent.netPnlPips / totalAbsPnl) * 100 : 0;
      if (agent.winRate >= 0.6 && agent.netPnlPips > 0) {
        agent.status = 'outperforming';
      } else if (agent.winRate < 0.4 || agent.netPnlPips < -2) {
        agent.status = agent.tradeCount >= 3 ? 'throttle-candidate' : 'underperforming';
      } else if (agent.netPnlPips < 0) {
        agent.status = 'underperforming';
      }
    }

    return results.sort((a, b) => b.netPnlPips - a.netPnlPips);
  }, [metrics]);

  const statusConfig = {
    'outperforming': { icon: Star, color: 'text-[hsl(var(--neural-green))]', bg: 'bg-[hsl(var(--neural-green))]/10', border: 'border-[hsl(var(--neural-green))]/30', label: 'OUTPERFORMING' },
    'neutral': { icon: Target, color: 'text-muted-foreground', bg: 'bg-muted/10', border: 'border-border/30', label: 'NEUTRAL' },
    'underperforming': { icon: TrendingDown, color: 'text-[hsl(var(--neural-orange))]', bg: 'bg-[hsl(var(--neural-orange))]/10', border: 'border-[hsl(var(--neural-orange))]/30', label: 'UNDERPERFORMING' },
    'throttle-candidate': { icon: Ban, color: 'text-[hsl(var(--neural-red))]', bg: 'bg-[hsl(var(--neural-red))]/10', border: 'border-[hsl(var(--neural-red))]/30', label: 'THROTTLE' },
  };

  if (agentData.length === 0) {
    return (
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />Agent Accountability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-6">
            Need closed trades with agent attribution to display accountability data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Agent Accountability Scoreboard
          <Badge variant="outline" className="text-[9px] ml-auto">
            {agentData.length} active agents
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium text-[9px]">Agent</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Trades</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">W/L</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Win Rate</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Net P&L</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Avg P&L</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Quality</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium text-[9px]">Slippage</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-[9px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {agentData.map((agent, i) => {
                const cfg = statusConfig[agent.status];
                const StatusIcon = cfg.icon;
                return (
                  <motion.tr
                    key={agent.agentId}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border/10 hover:bg-muted/5"
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{agent.icon}</span>
                        <span className="font-medium text-[10px] truncate max-w-[120px]">{agent.agentName}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-[10px]">{agent.tradeCount}</td>
                    <td className="py-2 px-2 text-center font-mono text-[10px]">
                      <span className="text-[hsl(var(--neural-green))]">{agent.winCount}</span>
                      /
                      <span className="text-[hsl(var(--neural-red))]">{agent.lossCount}</span>
                    </td>
                    <td className={cn('py-2 px-2 text-center font-mono text-[10px] font-bold',
                      agent.winRate >= 0.55 ? 'text-[hsl(var(--neural-green))]' : agent.winRate >= 0.45 ? 'text-foreground' : 'text-[hsl(var(--neural-red))]'
                    )}>
                      {(agent.winRate * 100).toFixed(0)}%
                    </td>
                    <td className={cn('py-2 px-2 text-center font-mono text-[10px] font-bold',
                      agent.netPnlPips > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                    )}>
                      {agent.netPnlPips >= 0 ? '+' : ''}{agent.netPnlPips}p
                    </td>
                    <td className={cn('py-2 px-2 text-center font-mono text-[10px]',
                      agent.avgPnlPips > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                    )}>
                      {agent.avgPnlPips >= 0 ? '+' : ''}{agent.avgPnlPips}p
                    </td>
                    <td className={cn('py-2 px-2 text-center font-mono text-[10px]',
                      agent.avgQuality >= 70 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]'
                    )}>
                      {agent.avgQuality}
                    </td>
                    <td className={cn('py-2 px-2 text-center font-mono text-[10px]',
                      agent.avgSlippage < 0.2 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]'
                    )}>
                      {agent.avgSlippage}p
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0 gap-0.5', cfg.color, cfg.border, cfg.bg)}>
                        <StatusIcon className="w-2 h-2" />{cfg.label}
                      </Badge>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
