// Ledger Filter Bar
// Comprehensive filtering for the Multi-Agent Trade Intelligence Ledger

import { Badge } from '@/components/ui/badge';
import { Filter, Users, Shield, Target, BarChart3 } from 'lucide-react';
import { LedgerFilters, LedgerTradeStatus, LedgerTradeDirection, StrategicClassification } from '@/lib/agents/ledgerTypes';
import { AgentId } from '@/lib/agents/types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

interface LedgerFilterBarProps {
  filters: LedgerFilters;
  onFiltersChange: (filters: LedgerFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const FilterChip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
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

export const LedgerFilterBar = ({ filters, onFiltersChange, totalCount, filteredCount }: LedgerFilterBarProps) => {
  const update = (partial: Partial<LedgerFilters>) => onFiltersChange({ ...filters, ...partial });

  return (
    <div className="space-y-2.5 p-3 rounded-xl bg-card/50 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-xs font-display font-bold">Intelligence Filters</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {filteredCount}/{totalCount} trades
        </Badge>
      </div>

      {/* Row 1: Agent + Status */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filters.agent === 'all'} onClick={() => update({ agent: 'all' })}>
          All Agents
        </FilterChip>
        {ALL_AGENT_IDS.map(id => (
          <FilterChip key={id} active={filters.agent === id} onClick={() => update({ agent: id })}>
            {AGENT_DEFINITIONS[id].icon} {AGENT_DEFINITIONS[id].name}
          </FilterChip>
        ))}
      </div>

      {/* Row 2: Trade Status + Direction */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'watching', 'open', 'managing', 'closed', 'avoided'] as const).map(s => (
          <FilterChip key={s} active={filters.tradeStatus === s} onClick={() => update({ tradeStatus: s })}>
            {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-border/50 self-center mx-1" />
        {(['all', 'long', 'short', 'avoided'] as const).map(d => (
          <FilterChip key={d} active={filters.direction === d} onClick={() => update({ direction: d })}>
            {d === 'all' ? 'All Directions' : d.charAt(0).toUpperCase() + d.slice(1)}
          </FilterChip>
        ))}
      </div>

      {/* Row 3: Regime + Approval + Consensus + Classification + Outcome */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'trending', 'ranging', 'volatile', 'quiet'] as const).map(r => (
          <FilterChip key={r} active={filters.regime === r} onClick={() => update({ regime: r })}>
            {r === 'all' ? 'All Regimes' : r.charAt(0).toUpperCase() + r.slice(1)}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-border/50 self-center mx-1" />
        {(['all', 'approved', 'throttled', 'restricted'] as const).map(a => (
          <FilterChip key={a} active={filters.approvalLevel === a} onClick={() => update({ approvalLevel: a })}>
            {a === 'all' ? 'All Approvals' : a.charAt(0).toUpperCase() + a.slice(1)}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-border/50 self-center mx-1" />
        {(['all', 'high', 'medium', 'low'] as const).map(c => (
          <FilterChip key={c} active={filters.consensusStrength === c} onClick={() => update({ consensusStrength: c })}>
            {c === 'all' ? 'All Consensus' : c.charAt(0).toUpperCase() + c.slice(1) + ' Consensus'}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-border/50 self-center mx-1" />
        {(['all', 'winning', 'losing'] as const).map(o => (
          <FilterChip key={o} active={filters.outcome === o} onClick={() => update({ outcome: o })}>
            {o === 'all' ? 'All Outcomes' : o.charAt(0).toUpperCase() + o.slice(1)}
          </FilterChip>
        ))}
      </div>
    </div>
  );
};
