// Data Readiness Card — shows forex pipeline health
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { checkForexDataReadiness, type ForexDataReadinessResult } from '@/lib/forex/forexDataReadiness';

export function DataReadinessCard() {
  const readiness: ForexDataReadinessResult = useMemo(() => checkForexDataReadiness(), []);

  const { summary, results } = readiness;
  const blockedPairs = results.filter(r => r.blockingReason);

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-primary" />
          Data Readiness
          {summary.blockedCount === 0 ? (
            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> All Clear
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> {summary.blockedCount} blocked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="text-center">
            <div className="text-muted-foreground">Tickers OK</div>
            <div className="font-mono font-bold text-foreground">
              {results.filter(r => r.tickerFound).length}/{results.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Prices OK</div>
            <div className="font-mono font-bold text-foreground">
              {results.filter(r => r.livePriceFound).length}/{results.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Analysis OK</div>
            <div className="font-mono font-bold text-foreground">
              {results.filter(r => r.analysisAvailable).length}/{results.length}
            </div>
          </div>
        </div>

        {/* Top Blocking Reasons */}
        {summary.topBlockingReasons.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] text-muted-foreground font-medium">Top Blockers</div>
            {summary.topBlockingReasons.slice(0, 3).map(({ reason, count }) => (
              <div key={reason} className="flex items-center justify-between text-[9px]">
                <span className="text-amber-400 truncate max-w-[160px]">{reason}</span>
                <span className="text-muted-foreground font-mono">{count}×</span>
              </div>
            ))}
          </div>
        )}

        {/* Blocked Pairs Detail */}
        {blockedPairs.length > 0 && blockedPairs.length <= 5 && (
          <div className="space-y-0.5">
            <div className="text-[9px] text-muted-foreground font-medium">Blocked Pairs</div>
            {blockedPairs.map(p => (
              <div key={p.pairCanonical} className="flex items-center gap-1 text-[9px]">
                <XCircle className="w-2.5 h-2.5 text-destructive flex-shrink-0" />
                <span className="font-mono">{p.pairDisplay}</span>
                <span className="text-muted-foreground truncate">— {p.blockingReason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Candle Coverage */}
        <div className="text-[9px] text-muted-foreground">
          Last check: {new Date(readiness.ts).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
