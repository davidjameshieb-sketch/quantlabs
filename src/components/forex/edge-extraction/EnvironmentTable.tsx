// Environment Table — Top and Worst environments with edge labels
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, AlertTriangle } from 'lucide-react';
import type { EnvironmentStatsEntry } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  topEnvs: EnvironmentStatsEntry[];
  worstEnvs: EnvironmentStatsEntry[];
}

const EnvRow = ({ e, rank }: { e: EnvironmentStatsEntry; rank?: number }) => (
  <tr className="border-b border-border/10">
    {rank != null && <td className="py-1.5 px-2 text-[10px] font-mono text-muted-foreground">{rank}</td>}
    <td className="py-1.5 px-2 text-[10px] font-mono">{e.session}</td>
    <td className="py-1.5 px-2 text-[10px] font-mono">{e.regime}</td>
    <td className="py-1.5 px-2 text-[10px] font-mono">{e.symbol}</td>
    <td className="py-1.5 px-2 text-[10px] font-mono">{e.direction}</td>
    <td className="text-right py-1.5 px-2 text-[10px] font-mono">{e.trades}</td>
    <td className={`text-right py-1.5 px-2 text-[10px] font-mono font-bold ${e.expectancyPips > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
      {e.expectancyPips > 0 ? '+' : ''}{e.expectancyPips}p
    </td>
    <td className="text-right py-1.5 px-2 text-[10px] font-mono">{(e.winRate * 100).toFixed(1)}%</td>
    <td className="text-right py-1.5 px-2 text-[10px] font-mono">{e.profitFactor}</td>
    <td className="text-right py-1.5 px-2 text-[10px] font-mono">{e.sharpe}</td>
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
);

const TableHeader = () => (
  <thead>
    <tr className="text-[9px] text-muted-foreground border-b border-border/20">
      <th className="text-left py-1 px-2">#</th>
      <th className="text-left py-1 px-2">Session</th>
      <th className="text-left py-1 px-2">Regime</th>
      <th className="text-left py-1 px-2">Pair</th>
      <th className="text-left py-1 px-2">Dir</th>
      <th className="text-right py-1 px-2">Trades</th>
      <th className="text-right py-1 px-2">Exp</th>
      <th className="text-right py-1 px-2">WR</th>
      <th className="text-right py-1 px-2">PF</th>
      <th className="text-right py-1 px-2">Sharpe</th>
      <th className="text-center py-1 px-2">Edge</th>
    </tr>
  </thead>
);

export const EnvironmentTable = ({ topEnvs, worstEnvs }: Props) => (
  <div className="space-y-4">
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Trophy className="w-4 h-4 text-neural-green" />
          Top Edge Environments
          <Badge variant="outline" className="text-[9px] ml-1">min 30 trades</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {topEnvs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader />
              <tbody>
                {topEnvs.map((e, i) => <EnvRow key={e.envKey} e={e} rank={i + 1} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No environments with sufficient sample size found.</p>
        )}
      </CardContent>
    </Card>

    <Card className="border-neural-red/20 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-neural-red" />
          Worst Environments (Capital Destroyers)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {worstEnvs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader />
              <tbody>
                {worstEnvs.map((e, i) => <EnvRow key={e.envKey} e={e} rank={i + 1} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No negative-expectancy environments detected.</p>
        )}
      </CardContent>
    </Card>
  </div>
);
