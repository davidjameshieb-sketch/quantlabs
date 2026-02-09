// Section 1: Global Edge Summary
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EdgeDiscoveryResult } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  summary: EdgeDiscoveryResult['globalSummary'];
}

const MetricCell = ({ label, value, suffix, positive }: { label: string; value: string | number; suffix?: string; positive?: boolean | null }) => (
  <div className="text-center">
    <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
    <div className={`text-sm font-mono font-bold ${positive === true ? 'text-neural-green' : positive === false ? 'text-neural-red' : 'text-foreground'}`}>
      {value}{suffix}
    </div>
  </div>
);

export const EdgeGlobalSummary = ({ summary }: Props) => (
  <Card className="border-border/30 bg-card/50">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-display font-bold">Global Edge Summary</span>
        <Badge variant="outline" className="text-[9px]">{summary.totalTrades.toLocaleString()} trades</Badge>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        <MetricCell label="Total Trades" value={summary.totalTrades.toLocaleString()} />
        <MetricCell label="Win Rate" value={`${(summary.winRate * 100).toFixed(1)}`} suffix="%" positive={summary.winRate > 0.5} />
        <MetricCell label="Expectancy" value={summary.expectancy} suffix="p" positive={summary.expectancy > 0 ? true : summary.expectancy < 0 ? false : null} />
        <MetricCell label="Profit Factor" value={summary.profitFactor} positive={summary.profitFactor > 1} />
        <MetricCell label="Sharpe" value={summary.sharpe} positive={summary.sharpe > 1} />
        <MetricCell label="Max DD" value={summary.maxDrawdown} suffix="p" positive={false} />
        <MetricCell label="Avg Friction" value={summary.avgFriction} />
        <MetricCell label="Avg Composite" value={summary.avgComposite} />
      </div>
    </CardContent>
  </Card>
);
