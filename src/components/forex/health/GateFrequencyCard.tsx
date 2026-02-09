import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import type { GateFrequencyEntry } from '@/lib/forex/governanceAnalytics';

interface Props { gateFreq: GateFrequencyEntry[]; }

export function GateFrequencyCard({ gateFreq }: Props) {
  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
          Gate Trigger Frequency
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {gateFreq.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No gate triggers recorded.</p>
        ) : (
          <div className="space-y-1">
            {gateFreq.map(g => {
              const pct = g.triggerRate * 100;
              const color = g.gateCategory === 'infrastructure'
                ? 'bg-blue-500/60'
                : pct > 30 ? 'bg-neural-red/60' : pct > 15 ? 'bg-yellow-500/60' : 'bg-muted/40';
              return (
                <div key={g.gateId} className="flex items-center gap-2">
                  <div className="w-28 text-[9px] font-mono text-muted-foreground truncate">
                    {g.gateId}
                  </div>
                  <div className="flex-1 h-3 bg-muted/20 rounded-sm overflow-hidden">
                    <div className={`h-full ${color} rounded-sm`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="text-[9px] font-mono w-12 text-right">
                    {g.triggerCount} ({pct.toFixed(0)}%)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[7px] px-1 ${g.gateCategory === 'infrastructure' ? 'border-blue-500/40 text-blue-400' : 'border-yellow-500/40 text-yellow-400'}`}
                  >
                    {g.gateCategory === 'infrastructure' ? 'INFRA' : 'STRAT'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
