// Section 3: Failure Radar
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { FailureEntry } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  failures: FailureEntry[];
}

export const EdgeFailureRadar = ({ failures }: Props) => {
  if (failures.length === 0) {
    return (
      <Card className="border-neural-green/20 bg-card/50">
        <CardContent className="p-6 text-center text-sm text-neural-green">
          No critical failure zones detected across any dimension.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-neural-red" />
          <span className="text-xs font-display font-bold">Failure Detection Engine</span>
          <Badge variant="outline" className="text-[9px] border-neural-red/30 text-neural-red">
            {failures.length} failures
          </Badge>
        </div>

        <div className="space-y-2">
          {failures.map((f, i) => (
            <div key={i} className="border border-neural-red/20 bg-neural-red/5 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{f.dimension}</Badge>
                  <span className="text-sm font-mono font-bold text-neural-red">{f.key}</span>
                </div>
                <Badge className="text-[9px] bg-neural-red/20 text-neural-red border-neural-red/30">
                  {f.expectancy > 0 ? '+' : ''}{f.expectancy}p exp
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs mb-2">
                <div>
                  <span className="text-muted-foreground">Trades:</span>{' '}
                  <span className="font-mono">{f.trades}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Win Rate:</span>{' '}
                  <span className="font-mono text-neural-red">{(f.winRate * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">PF:</span>{' '}
                  <span className="font-mono">{f.profitFactor}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-neural-orange">
                <ArrowRight className="w-3 h-3" />
                {f.suggestion}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
