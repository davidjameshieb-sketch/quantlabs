// 3-column Baseline vs Filtered vs Edge-Only metrics comparison
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SimulationMetrics } from '@/lib/forex/filterSimulator';
import { RemovalReasonsChart } from './RemovalReasonsChart';

interface Props {
  baseline: SimulationMetrics;
  filtered: SimulationMetrics;
  edgeOnly: SimulationMetrics;
  removedReasons: Record<string, number>;
  removedCount: number;
  edgeOnlyLowSample: boolean;
}

const MetricRow = ({ label, baseline, filtered, edgeOnly, suffix = '', invert = false }: {
  label: string;
  baseline: number;
  filtered: number;
  edgeOnly: number;
  suffix?: string;
  invert?: boolean;
}) => {
  const delta = filtered - baseline;
  const edgeDelta = edgeOnly - baseline;
  const colorFn = (d: number) => {
    const isGood = invert ? d < 0 : d > 0;
    return isGood ? 'text-neural-green' : d === 0 ? 'text-muted-foreground' : 'text-neural-red';
  };

  return (
    <tr className="border-b border-border/10">
      <td className="py-1.5 px-2 text-xs text-muted-foreground">{label}</td>
      <td className="text-right py-1.5 px-2 text-xs font-mono">{baseline}{suffix}</td>
      <td className="text-right py-1.5 px-2 text-xs font-mono font-bold">{filtered}{suffix}</td>
      <td className={`text-right py-1.5 px-2 text-xs font-mono ${colorFn(delta)}`}>
        {delta > 0 ? '+' : ''}{Math.round(delta * 100) / 100}{suffix}
      </td>
      <td className="text-right py-1.5 px-2 text-xs font-mono font-bold">{edgeOnly}{suffix}</td>
      <td className={`text-right py-1.5 px-2 text-xs font-mono ${colorFn(edgeDelta)}`}>
        {edgeDelta > 0 ? '+' : ''}{Math.round(edgeDelta * 100) / 100}{suffix}
      </td>
    </tr>
  );
};

export const MetricsComparisonPanel = ({ baseline, filtered, edgeOnly, removedReasons, removedCount, edgeOnlyLowSample }: Props) => (
  <div className="space-y-4">
    {/* Summary badges */}
    <div className="grid grid-cols-3 gap-3">
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">BASELINE</div>
          <div className="text-lg font-mono font-bold">{baseline.trades}</div>
          <div className="text-[10px] text-muted-foreground">trades</div>
        </CardContent>
      </Card>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3 text-center">
          <div className="text-[10px] text-primary mb-1">FILTERED SIM</div>
          <div className="text-lg font-mono font-bold">{filtered.trades}</div>
          <div className="text-[10px] text-muted-foreground">{removedCount} removed</div>
        </CardContent>
      </Card>
      <Card className={`${edgeOnlyLowSample ? 'border-neural-orange/20' : 'border-neural-green/20'} bg-card/50`}>
        <CardContent className="p-3 text-center">
          <div className="text-[10px] text-neural-green mb-1">EDGE-ONLY</div>
          <div className="text-lg font-mono font-bold">{edgeOnly.trades}</div>
          <div className="text-[10px] text-muted-foreground">top environments</div>
          {edgeOnlyLowSample && (
            <div className="flex items-center gap-1 justify-center mt-1">
              <AlertTriangle className="w-3 h-3 text-neural-orange" />
              <span className="text-[8px] text-neural-orange">Low sample</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    {/* Comparison table */}
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-muted-foreground border-b border-border/20">
                <th className="text-left py-1 px-2">Metric</th>
                <th className="text-right py-1 px-2">Baseline</th>
                <th className="text-right py-1 px-2">Filtered</th>
                <th className="text-right py-1 px-2">Δ</th>
                <th className="text-right py-1 px-2">Edge-Only</th>
                <th className="text-right py-1 px-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Net P&L" baseline={baseline.netPnl} filtered={filtered.netPnl} edgeOnly={edgeOnly.netPnl} suffix="p" />
              <MetricRow label="Win Rate" baseline={Math.round(baseline.winRate * 1000) / 10} filtered={Math.round(filtered.winRate * 1000) / 10} edgeOnly={Math.round(edgeOnly.winRate * 1000) / 10} suffix="%" />
              <MetricRow label="Expectancy" baseline={baseline.expectancy} filtered={filtered.expectancy} edgeOnly={edgeOnly.expectancy} suffix="p" />
              <MetricRow label="Profit Factor" baseline={baseline.profitFactor} filtered={filtered.profitFactor} edgeOnly={edgeOnly.profitFactor} />
              <MetricRow label="Sharpe" baseline={baseline.sharpe} filtered={filtered.sharpe} edgeOnly={edgeOnly.sharpe} />
              <MetricRow label="Max Drawdown" baseline={baseline.maxDrawdown} filtered={filtered.maxDrawdown} edgeOnly={edgeOnly.maxDrawdown} suffix="p" invert />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    {/* Removal reasons */}
    {Object.keys(removedReasons).length > 0 && (
      <RemovalReasonsChart reasons={removedReasons} totalRemoved={removedCount} />
    )}
  </div>
);
