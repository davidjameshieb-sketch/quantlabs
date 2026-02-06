import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Filter, Calendar, BarChart3, Bot } from 'lucide-react';
import { TradeFilters, TradeFilterPeriod, TradeFilterOutcome, TradeFilterAgent } from '@/lib/agents/tradeTypes';
import { AgentId } from '@/lib/agents/types';
import { cn } from '@/lib/utils';

interface TradeHistoryFiltersProps {
  filters: TradeFilters;
  onFiltersChange: (filters: TradeFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const periodOptions: { value: TradeFilterPeriod; label: string }[] = [
  { value: '5d', label: '5 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All' },
];

const outcomeOptions: { value: TradeFilterOutcome; label: string }[] = [
  { value: 'all', label: 'All Trades' },
  { value: 'winning', label: 'Winning' },
  { value: 'losing', label: 'Losing' },
  { value: 'avoided', label: 'Avoided' },
  { value: 'watching', label: 'Watching' },
];

export const TradeHistoryFilters = ({ filters, onFiltersChange, totalCount, filteredCount }: TradeHistoryFiltersProps) => {
  const update = (partial: Partial<TradeFilters>) => onFiltersChange({ ...filters, ...partial });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Trade History</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {filteredCount}/{totalCount} signals
        </Badge>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-1.5">
        {periodOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => update({ period: opt.value })}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
              filters.period === opt.value
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Outcome filter */}
      <div className="flex flex-wrap gap-1.5">
        {outcomeOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => update({ outcome: opt.value })}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
              filters.outcome === opt.value
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Regime filter */}
      <div className="flex flex-wrap gap-1.5">
        {['all', 'trending', 'ranging', 'volatile', 'quiet'].map(r => (
          <button
            key={r}
            onClick={() => update({ regime: r as TradeFilters['regime'] })}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
              filters.regime === r
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
            )}
          >
            {r === 'all' ? 'All Regimes' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
};
