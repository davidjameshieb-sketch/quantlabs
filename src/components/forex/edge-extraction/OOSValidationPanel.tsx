// Out-of-Sample Validation Panel
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { OOSValidation } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  result: OOSValidation | null;
  totalTrades: number;
}

export const OOSValidationPanel = ({ result, totalTrades }: Props) => {
  if (!result) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-muted-foreground text-sm flex items-center gap-2 justify-center">
          <AlertTriangle className="w-4 h-4 text-neural-orange" />
          Minimum 100 trades required for OOS validation. Current: {totalTrades}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          Out-of-Sample Validation (70/30 Split)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">In-Sample Trades</div>
            <div className="text-sm font-mono font-bold">{result.inSampleTrades.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">OOS Trades</div>
            <div className="text-sm font-mono font-bold">{result.outOfSampleTrades.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">In-Sample Expectancy</div>
            <div className={`text-sm font-mono font-bold ${result.inSampleExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
              {result.inSampleExpectancy}p
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">OOS Expectancy</div>
            <div className={`text-sm font-mono font-bold ${result.outOfSampleExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
              {result.outOfSampleExpectancy}p
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 py-2">
          {result.edgeHolds ? (
            <>
              <CheckCircle className="w-5 h-5 text-neural-green" />
              <span className="text-sm font-bold text-neural-green">Edge Holds in OOS</span>
              <Badge variant="outline" className="text-[9px] border-neural-green/50 text-neural-green">VALIDATED</Badge>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-neural-red" />
              <span className="text-sm font-bold text-neural-red">Edge Does Not Hold in OOS</span>
              <Badge variant="outline" className="text-[9px] border-neural-red/50 text-neural-red">OVERFIT WARNING</Badge>
            </>
          )}
        </div>

        {result.topEnvsOOS.length > 0 && (
          <div>
            <h4 className="text-[10px] text-muted-foreground mb-2">Top In-Sample Environments Evaluated in OOS</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-muted-foreground border-b border-border/20">
                    <th className="text-left py-1 px-2">Env Key</th>
                    <th className="text-right py-1 px-2">Trades</th>
                    <th className="text-right py-1 px-2">Exp</th>
                    <th className="text-right py-1 px-2">WR</th>
                    <th className="text-center py-1 px-2">Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {result.topEnvsOOS.slice(0, 10).map(e => (
                    <tr key={e.envKey} className="border-b border-border/10">
                      <td className="py-1.5 px-2 font-mono text-[9px]">{e.envKey.replace(/\|/g, ' → ')}</td>
                      <td className="text-right py-1.5 px-2 font-mono">{e.trades}</td>
                      <td className={`text-right py-1.5 px-2 font-mono font-bold ${e.expectancyPips > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                        {e.expectancyPips}p
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">{(e.winRate * 100).toFixed(1)}%</td>
                      <td className="text-center py-1.5 px-2">
                        <Badge
                          variant="outline"
                          className={`text-[8px] ${
                            e.edgeLabel === 'EDGE' ? 'border-neural-green/50 text-neural-green' :
                            e.edgeLabel === '-EDGE' ? 'border-neural-red/50 text-neural-red' :
                            'border-border/50 text-muted-foreground'
                          }`}
                        >
                          {e.edgeLabel}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
