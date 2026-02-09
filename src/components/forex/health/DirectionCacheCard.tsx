import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge, AlertTriangle } from 'lucide-react';
import type { NeutralDirectionStats } from '@/lib/forex/governanceAnalytics';
import type { CachePerformanceStats } from '@/lib/forex/governanceCacheMonitor';

interface Props {
  neutralStats: NeutralDirectionStats;
  cachePerf: CachePerformanceStats;
}

export function DirectionCacheCard({ neutralStats, cachePerf }: Props) {
  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" />
          Direction & Cache
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Neutral Rate</span>
          <span className={`font-mono ${neutralStats.alertTriggered ? 'text-yellow-400' : 'text-foreground'}`}>
            {(neutralStats.neutralRate * 100).toFixed(1)}%
          </span>
        </div>
        {neutralStats.alertTriggered && (
          <div className="flex items-center gap-1 text-[9px] text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            Above 55% threshold
          </div>
        )}
        <div className="border-t border-border/20 pt-2 mt-2 space-y-1">
          <span className="text-[9px] text-muted-foreground font-semibold">Cache Performance</span>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Slow Hit Rate</span>
            <span className="font-mono">{(cachePerf.slowCacheHitRate * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Fast Hit Rate</span>
            <span className={`font-mono ${cachePerf.staleFastCacheAlert ? 'text-yellow-400' : ''}`}>
              {(cachePerf.fastCacheHitRate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Avg Latency</span>
            <span className="font-mono">{cachePerf.avgContextLatencyMs.toFixed(1)}ms</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
