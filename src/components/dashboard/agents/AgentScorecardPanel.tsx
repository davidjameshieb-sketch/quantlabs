import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, BarChart3, Shield, Activity, Zap, Target } from 'lucide-react';
import { AgentScorecard } from '@/lib/agents/tradeTypes';
import { cn } from '@/lib/utils';

interface AgentScorecardPanelProps {
  scorecards: AgentScorecard[];
}

const metricLabels = [
  { key: 'winRate', label: 'Win Rate', format: (v: number) => `${(v * 100).toFixed(1)}%`, icon: <Target className="w-3.5 h-3.5" />, threshold: 0.5 },
  { key: 'avgReturn', label: 'Avg Return', format: (v: number) => `${(v * 100).toFixed(2)}%`, icon: <BarChart3 className="w-3.5 h-3.5" />, threshold: 0.01 },
  { key: 'signalReliability', label: 'Signal Reliability', format: (v: number) => `${v.toFixed(0)}%`, icon: <Zap className="w-3.5 h-3.5" />, threshold: 60 },
  { key: 'riskEffectiveness', label: 'Risk Mgmt', format: (v: number) => `${v.toFixed(0)}%`, icon: <Shield className="w-3.5 h-3.5" />, threshold: 60 },
  { key: 'tradeFrequency', label: 'Trades/Day', format: (v: number) => v.toFixed(1), icon: <Activity className="w-3.5 h-3.5" />, threshold: 3 },
] as const;

const regimeLabels = ['trending', 'ranging', 'volatile', 'quiet'];

export const AgentScorecardPanel = ({ scorecards }: AgentScorecardPanelProps) => {
  // Find best per metric for highlighting
  const bestPerMetric: Record<string, string> = {};
  metricLabels.forEach(m => {
    let best = scorecards[0];
    scorecards.forEach(sc => {
      const val = (sc as any)[m.key];
      const bestVal = (best as any)[m.key];
      if (val > bestVal) best = sc;
    });
    bestPerMetric[m.key] = best.agentId;
  });

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <CardTitle className="font-display text-lg">Agent Performance Comparison</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Comparative metric bars */}
        {metricLabels.map(metric => (
          <div key={metric.key} className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {metric.icon}
              <span className="font-medium">{metric.label}</span>
            </div>
            <div className="space-y-1.5">
              {scorecards.map(sc => {
                const val = (sc as any)[metric.key] as number;
                const isBest = bestPerMetric[metric.key] === sc.agentId;
                const normalizedVal = metric.key === 'winRate'
                  ? val * 100
                  : metric.key === 'avgReturn'
                    ? Math.min(100, Math.abs(val) * 1000)
                    : metric.key === 'tradeFrequency'
                      ? Math.min(100, val * 10)
                      : val;

                return (
                  <div key={sc.agentId} className="flex items-center gap-3">
                    <span className="text-base w-6">{sc.icon}</span>
                    <span className="text-xs w-20 truncate">{sc.agentName}</span>
                    <div className="flex-1">
                      <Progress value={normalizedVal} className={cn('h-2', isBest && '[&>div]:bg-neural-green')} />
                    </div>
                    <span className={cn(
                      'text-xs font-mono font-bold w-14 text-right',
                      isBest ? 'text-neural-green' : 'text-foreground'
                    )}>
                      {metric.format(val)}
                    </span>
                    {isBest && (
                      <Trophy className="w-3 h-3 text-neural-green shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Market Regime Heatmap */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Win Rate by Market Regime</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 text-muted-foreground font-medium">Agent</th>
                  {regimeLabels.map(r => (
                    <th key={r} className="text-center py-1 text-muted-foreground font-medium capitalize">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecards.map(sc => (
                  <tr key={sc.agentId} className="border-t border-border/20">
                    <td className="py-1.5">
                      <span className="mr-1">{sc.icon}</span>
                      <span className="font-medium">{sc.agentName}</span>
                    </td>
                    {regimeLabels.map(r => {
                      const wr = sc.marketStrengthPerformance[r] || 0;
                      return (
                        <td key={r} className="text-center py-1.5">
                          <span className={cn(
                            'font-mono font-bold px-1.5 py-0.5 rounded',
                            wr > 0.55 ? 'text-neural-green bg-neural-green/10'
                              : wr > 0.45 ? 'text-neural-orange bg-neural-orange/10'
                              : 'text-neural-red bg-neural-red/10'
                          )}>
                            {(wr * 100).toFixed(0)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
