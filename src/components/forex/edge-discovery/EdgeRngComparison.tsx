// Section 7: RNG vs QuantLabs Comparison
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCompare } from 'lucide-react';
import type { EnvironmentComparison } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  comparison: EnvironmentComparison[] | null;
}

export const EdgeRngComparison = ({ comparison }: Props) => {
  if (!comparison) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No RNG baseline trades found. Run backtest with RNG direction source to enable comparison.
        </CardContent>
      </Card>
    );
  }

  const [ql, rng] = comparison;
  const expDelta = ql.expectancy - rng.expectancy;
  const wrDelta = ql.winRate - rng.winRate;

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" />
          <span className="text-xs font-display font-bold">QuantLabs vs RNG Baseline</span>
          <Badge
            variant="outline"
            className={`text-[9px] ${expDelta > 0 ? 'border-neural-green/50 text-neural-green' : 'border-neural-red/50 text-neural-red'}`}
          >
            {expDelta > 0 ? '+' : ''}{expDelta.toFixed(2)}p edge
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[ql, rng].map((env, i) => (
            <div key={i} className={`border rounded-lg p-3 ${i === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/5'}`}>
              <div className="text-xs font-bold mb-2">{env.label}</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <div className="text-muted-foreground">Trades</div>
                  <div className="font-mono font-bold">{env.trades}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Win Rate</div>
                  <div className={`font-mono font-bold ${env.winRate > 0.5 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {(env.winRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Expectancy</div>
                  <div className={`font-mono font-bold ${env.expectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                    {env.expectancy > 0 ? '+' : ''}{env.expectancy}p
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">PF</div>
                  <div className="font-mono font-bold">{env.profitFactor}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Sharpe</div>
                  <div className="font-mono font-bold">{env.sharpe}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/20 pt-3">
          <div className="text-[10px] text-muted-foreground mb-1">Delta Summary</div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Expectancy: </span>
              <span className={`font-mono font-bold ${expDelta > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                {expDelta > 0 ? '+' : ''}{expDelta.toFixed(2)}p
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Win Rate: </span>
              <span className={`font-mono font-bold ${wrDelta > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                {wrDelta > 0 ? '+' : ''}{(wrDelta * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">PF: </span>
              <span className={`font-mono font-bold ${ql.profitFactor > rng.profitFactor ? 'text-neural-green' : 'text-neural-red'}`}>
                {ql.profitFactor > rng.profitFactor ? '+' : ''}{(ql.profitFactor - rng.profitFactor).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
