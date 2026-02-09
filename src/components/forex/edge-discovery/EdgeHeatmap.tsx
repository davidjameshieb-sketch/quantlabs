// Section 2: Edge Heatmap — Primary Output
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import type { DimensionStats } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  heatmap: Record<string, DimensionStats[]>;
}

const edgeColor = (ec: DimensionStats['edgeClass']) =>
  ec === 'strong-positive' ? 'bg-neural-green/15 border-neural-green/30'
    : ec === 'strong-negative' ? 'bg-neural-red/15 border-neural-red/30'
    : 'bg-muted/10 border-border/20';

const edgeBadge = (ec: DimensionStats['edgeClass']) =>
  ec === 'strong-positive' ? <Badge className="text-[8px] bg-neural-green/20 text-neural-green border-neural-green/30">+EDGE</Badge>
    : ec === 'strong-negative' ? <Badge className="text-[8px] bg-neural-red/20 text-neural-red border-neural-red/30">−EDGE</Badge>
    : <Badge variant="outline" className="text-[8px]">NEUTRAL</Badge>;

export const EdgeHeatmap = ({ heatmap }: Props) => {
  const dims = Object.keys(heatmap);
  const [selected, setSelected] = useState(dims[0] || '');

  const stats = heatmap[selected] || [];

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-display font-bold">Edge Heatmap</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-48 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dims.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-1.5 px-2 font-medium">{selected}</th>
                <th className="text-right py-1.5 px-2 font-medium">Trades</th>
                <th className="text-right py-1.5 px-2 font-medium">Win Rate</th>
                <th className="text-right py-1.5 px-2 font-medium">Expectancy</th>
                <th className="text-right py-1.5 px-2 font-medium">PF</th>
                <th className="text-right py-1.5 px-2 font-medium">Sharpe</th>
                <th className="text-right py-1.5 px-2 font-medium">CI</th>
                <th className="text-center py-1.5 px-2 font-medium">Edge</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.key} className={`border-b border-border/10 ${edgeColor(s.edgeClass)}`}>
                  <td className="py-1.5 px-2 font-mono flex items-center gap-1">
                    {s.key}
                    {s.isWeak && <span title="<30 trades"><AlertTriangle className="w-3 h-3 text-neural-orange" /></span>}
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">{s.trades}</td>
                  <td className={`text-right py-1.5 px-2 font-mono ${s.winRate > 0.5 ? 'text-neural-green' : s.winRate < 0.4 ? 'text-neural-red' : ''}`}>
                    {(s.winRate * 100).toFixed(1)}%
                  </td>
                  <td className={`text-right py-1.5 px-2 font-mono font-bold ${s.expectancy > 0 ? 'text-neural-green' : s.expectancy < 0 ? 'text-neural-red' : ''}`}>
                    {s.expectancy > 0 ? '+' : ''}{s.expectancy}p
                  </td>
                  <td className={`text-right py-1.5 px-2 font-mono ${s.profitFactor > 1 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {s.profitFactor}
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">{s.sharpe}</td>
                  <td className="text-right py-1.5 px-2 font-mono text-muted-foreground">
                    [{s.ciLower}, {s.ciUpper}]
                  </td>
                  <td className="text-center py-1.5 px-2">{edgeBadge(s.edgeClass)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
