// Composite Decile Correlation Panel — Executed Trades
// Shows whether governance composite score predicts trade quality

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import type { CompositeDecilePerformance } from '@/lib/forex/executionPerformanceAnalytics';

interface Props {
  deciles: CompositeDecilePerformance[];
}

export function CompositeDecilePanel({ deciles }: Props) {
  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          Composite Score → Trade Quality (Executed Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {deciles.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            Need 10+ executed trades matched to governance logs for correlation data.
          </p>
        ) : (
          <div className="space-y-1">
            <div className="flex text-[8px] text-muted-foreground font-semibold mb-1">
              <span className="w-24">Score Range</span>
              <span className="w-10 text-right">N</span>
              <span className="w-14 text-right">Win%</span>
              <span className="w-14 text-right">Expect.</span>
              <span className="w-14 text-right">PnL</span>
              <span className="w-14 text-right">MAE</span>
              <span className="w-14 text-right">MFE</span>
            </div>
            {deciles.map((d, i) => (
              <div key={i} className="flex text-[9px] font-mono">
                <span className="w-24 text-muted-foreground">{d.decileRange}</span>
                <span className="w-10 text-right">{d.count}</span>
                <span className={`w-14 text-right ${d.winRate > 0.6 ? 'text-neural-green' : d.winRate < 0.4 ? 'text-neural-red' : ''}`}>
                  {(d.winRate * 100).toFixed(0)}%
                </span>
                <span className="w-14 text-right">{d.avgExpectancy.toFixed(3)}</span>
                <span className={`w-14 text-right ${d.avgPnl >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {d.avgPnl >= 0 ? '+' : ''}{d.avgPnl.toFixed(3)}
                </span>
                <span className="w-14 text-right">{(d.avgMAE * 100).toFixed(2)}</span>
                <span className="w-14 text-right">{(d.avgMFE * 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
