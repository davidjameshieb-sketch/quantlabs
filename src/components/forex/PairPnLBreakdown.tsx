// Per-pair P&L breakdown table with sortable columns
import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown, Trophy, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PairAnalytics } from '@/hooks/useTradeAnalytics';

interface PairPnLBreakdownProps {
  pairs: PairAnalytics[];
}

type SortKey = 'netPnlPips' | 'winRate' | 'tradeCount' | 'profitFactor' | 'avgSlippage';

export const PairPnLBreakdown = ({ pairs }: PairPnLBreakdownProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('netPnlPips');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...pairs].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortAsc ? diff : -diff;
  });

  const best = sorted.length > 0 ? sorted[0].pair : null;
  const worst = sorted.length > 0 ? sorted[sorted.length - 1].pair : null;

  if (pairs.length === 0) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/50 text-center">
        <p className="text-sm text-muted-foreground">No closed trades with exit data yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
      <div className="p-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">PER-PAIR P&L BREAKDOWN</h3>
        </div>
        <span className="text-[9px] text-muted-foreground">{pairs.length} pairs traded</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30 text-[9px] text-muted-foreground uppercase tracking-wider">
              <th className="p-2 text-left font-medium">Pair</th>
              <SortHeader label="Trades" sortKey="tradeCount" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Win Rate" sortKey="winRate" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Net P&L" sortKey="netPnlPips" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="PF" sortKey="profitFactor" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Avg Slip" sortKey="avgSlippage" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <th className="p-2 text-right font-medium">Quality</th>
              <th className="p-2 text-right font-medium">Avg Dur</th>
              <th className="p-2 text-right font-medium">Best / Worst</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.pair} className="border-b border-border/20 hover:bg-muted/5 transition-colors">
                <td className="p-2 font-mono font-bold text-foreground">
                  <div className="flex items-center gap-1.5">
                    {p.pair === best && <Trophy className="w-3 h-3 text-yellow-500" />}
                    {p.pair === worst && sorted.length > 1 && <AlertTriangle className="w-3 h-3 text-neural-red" />}
                    {p.pair.replace('_', '/')}
                  </div>
                </td>
                <td className="p-2 text-center text-muted-foreground">
                  {p.tradeCount}
                  <span className="text-[8px] ml-0.5">({p.winCount}W/{p.lossCount}L)</span>
                </td>
                <td className="p-2 text-center">
                  <Badge variant="outline" className={cn(
                    'text-[9px] px-1.5',
                    p.winRate >= 0.6 ? 'border-neural-green/30 text-neural-green' :
                    p.winRate >= 0.4 ? 'border-yellow-500/30 text-yellow-500' :
                    'border-neural-red/30 text-neural-red'
                  )}>
                    {(p.winRate * 100).toFixed(0)}%
                  </Badge>
                </td>
                <td className={cn('p-2 text-right font-mono font-bold', p.netPnlPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                  <div className="flex items-center justify-end gap-0.5">
                    {p.netPnlPips >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {p.netPnlPips >= 0 ? '+' : ''}{p.netPnlPips}p
                  </div>
                </td>
                <td className={cn('p-2 text-center font-mono', p.profitFactor >= 1.5 ? 'text-neural-green' : p.profitFactor >= 1 ? 'text-foreground' : 'text-neural-red')}>
                  {p.profitFactor === Infinity ? '∞' : p.profitFactor.toFixed(2)}
                </td>
                <td className={cn('p-2 text-center font-mono', p.avgSlippage <= 0.5 ? 'text-neural-green' : 'text-neural-orange')}>
                  {p.avgSlippage.toFixed(2)}p
                </td>
                <td className="p-2 text-right font-mono text-muted-foreground">{p.avgQuality}%</td>
                <td className="p-2 text-right font-mono text-muted-foreground">{p.avgDurationMin}m</td>
                <td className="p-2 text-right font-mono">
                  <span className="text-neural-green">+{p.bestTradePips.toFixed(1)}</span>
                  <span className="text-muted-foreground mx-0.5">/</span>
                  <span className="text-neural-red">{p.worstTradePips.toFixed(1)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function SortHeader({
  label, sortKey, current, asc, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="p-2 text-center font-medium cursor-pointer hover:text-foreground transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <ArrowUpDown className={cn('w-2.5 h-2.5', current === sortKey ? 'text-primary' : 'text-muted-foreground/50')} />
      </span>
    </th>
  );
}
