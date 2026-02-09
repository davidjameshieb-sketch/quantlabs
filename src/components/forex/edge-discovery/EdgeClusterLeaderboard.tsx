// Section 4: Edge Cluster Leaderboard
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Trophy } from 'lucide-react';
import type { EdgeCluster } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  clusters: EdgeCluster[];
}

export const EdgeClusterLeaderboard = ({ clusters }: Props) => {
  const top = clusters.filter(c => c.expectancy > 0).slice(0, 15);
  const bottom = clusters.filter(c => c.expectancy < 0).slice(-10).reverse();

  return (
    <div className="space-y-4">
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-neural-green" />
            <span className="text-xs font-display font-bold">Top Edge Clusters</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left py-1 px-2">#</th>
                  <th className="text-left py-1 px-2">Cluster</th>
                  <th className="text-right py-1 px-2">Trades</th>
                  <th className="text-right py-1 px-2">Exp</th>
                  <th className="text-right py-1 px-2">WR</th>
                  <th className="text-right py-1 px-2">PF</th>
                  <th className="text-center py-1 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c, i) => (
                  <tr key={i} className="border-b border-border/10">
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 px-2">
                      <div className="flex flex-wrap gap-1">
                        {c.keys.map((k, j) => (
                          <Badge key={j} variant="outline" className="text-[8px]">{k}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-2 font-mono">{c.trades}</td>
                    <td className="text-right py-1.5 px-2 font-mono font-bold text-neural-green">+{c.expectancy}p</td>
                    <td className="text-right py-1.5 px-2 font-mono">{(c.winRate * 100).toFixed(1)}%</td>
                    <td className="text-right py-1.5 px-2 font-mono">{c.profitFactor}</td>
                    <td className="text-center py-1.5 px-2">
                      {c.isWeak
                        ? <span title="Low sample"><AlertTriangle className="w-3 h-3 text-neural-orange inline" /></span>
                        : <Badge className="text-[8px] bg-neural-green/20 text-neural-green border-neural-green/30">✓</Badge>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {bottom.length > 0 && (
        <Card className="border-neural-red/20 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-neural-red" />
              <span className="text-xs font-display font-bold">Worst Clusters (Capital Destroyers)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/20">
                    <th className="text-left py-1 px-2">Cluster</th>
                    <th className="text-right py-1 px-2">Trades</th>
                    <th className="text-right py-1 px-2">Exp</th>
                    <th className="text-right py-1 px-2">WR</th>
                    <th className="text-right py-1 px-2">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {bottom.map((c, i) => (
                    <tr key={i} className="border-b border-border/10 bg-neural-red/5">
                      <td className="py-1.5 px-2">
                        <div className="flex flex-wrap gap-1">
                          {c.keys.map((k, j) => (
                            <Badge key={j} variant="outline" className="text-[8px] border-neural-red/20">{k}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">{c.trades}</td>
                      <td className="text-right py-1.5 px-2 font-mono font-bold text-neural-red">{c.expectancy}p</td>
                      <td className="text-right py-1.5 px-2 font-mono text-neural-red">{(c.winRate * 100).toFixed(1)}%</td>
                      <td className="text-right py-1.5 px-2 font-mono">{c.profitFactor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
