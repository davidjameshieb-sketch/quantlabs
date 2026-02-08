// Forex Filter Bar
// Period, outcome, regime, and pair filters for the Forex dashboard

import { Filter, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ForexDashboardFilters,
  ForexTimePeriod,
  FOREX_PERIOD_LABELS,
  ForexTradeOutcome,
  ForexRegime,
  FOREX_REGIME_LABELS,
} from '@/lib/forex/forexTypes';
import { getTickersByType } from '@/lib/market/tickers';
import { cn } from '@/lib/utils';

interface ForexFilterBarProps {
  filters: ForexDashboardFilters;
  onFiltersChange: (f: ForexDashboardFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors border whitespace-nowrap',
      active
        ? 'bg-primary/20 text-primary border-primary/30'
        : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
    )}
  >
    {children}
  </button>
);

const forexPairs = getTickersByType('forex');

export const ForexFilterBar = ({ filters, onFiltersChange, totalCount, filteredCount }: ForexFilterBarProps) => {
  const update = (partial: Partial<ForexDashboardFilters>) => onFiltersChange({ ...filters, ...partial });

  return (
    <div className="space-y-2.5 p-3 rounded-xl bg-card/50 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-xs font-display font-bold">Forex Intelligence Filters</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {filteredCount}/{totalCount} trades
        </Badge>
      </div>

      {/* Period */}
      <div className="flex flex-wrap gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground self-center" />
        {(Object.keys(FOREX_PERIOD_LABELS) as ForexTimePeriod[]).map(p => (
          <Chip key={p} active={filters.period === p} onClick={() => update({ period: p })}>
            {FOREX_PERIOD_LABELS[p]}
          </Chip>
        ))}
      </div>

      {/* Outcome + Regime */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'win', 'loss', 'avoided'] as const).map(o => (
          <Chip key={o} active={filters.outcome === o} onClick={() => update({ outcome: o })}>
            {o === 'all' ? 'All Outcomes' : o.charAt(0).toUpperCase() + o.slice(1)}
          </Chip>
        ))}
        <span className="w-px h-5 bg-border/50 self-center mx-1" />
        <Chip active={filters.regime === 'all'} onClick={() => update({ regime: 'all' })}>All Regimes</Chip>
        {(Object.keys(FOREX_REGIME_LABELS) as ForexRegime[]).map(r => (
          <Chip key={r} active={filters.regime === r} onClick={() => update({ regime: r })}>
            {FOREX_REGIME_LABELS[r]}
          </Chip>
        ))}
      </div>

      {/* Pair filter */}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={filters.pair === 'all'} onClick={() => update({ pair: 'all' })}>All Pairs</Chip>
        {forexPairs.slice(0, 10).map(p => (
          <Chip key={p.symbol} active={filters.pair === p.symbol} onClick={() => update({ pair: p.symbol })}>
            {p.name}
          </Chip>
        ))}
        {forexPairs.length > 10 && (
          <span className="text-[9px] text-muted-foreground self-center">+{forexPairs.length - 10} more</span>
        )}
      </div>
    </div>
  );
};
