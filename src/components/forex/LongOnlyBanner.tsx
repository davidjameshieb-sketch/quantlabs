// Long-Only Mode Banner — shows on all forex dashboards when active
// Includes a data filter toggle to show only long stats across all dashboards

import { Shield, Ban, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { isLongOnlyEnabled, isLongOnlyForcedByEnv } from '@/lib/config/tradingMode';

interface LongOnlyBannerProps {
  /** When true, dashboard data is filtered to longs only */
  longOnlyFilter?: boolean;
  /** Toggle the long-only data filter */
  onToggleFilter?: (enabled: boolean) => void;
}

export function LongOnlyBanner({ longOnlyFilter, onToggleFilter }: LongOnlyBannerProps) {
  const executionActive = isLongOnlyEnabled();
  const forced = isLongOnlyForcedByEnv();

  // Show nothing if execution mode is off AND filter is off
  if (!executionActive && !longOnlyFilter) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[hsl(var(--neural-green))]/8 border border-[hsl(var(--neural-green))]/25">
      <Shield className="w-4 h-4 text-[hsl(var(--neural-green))] shrink-0" />
      <span className="text-xs font-medium text-[hsl(var(--neural-green))]">
        Long-Only Mode Active
      </span>
      <span className="text-[9px] text-muted-foreground hidden sm:inline">
        — shorts blocked at governance + execution
      </span>
      <Ban className="w-3 h-3 text-[hsl(var(--neural-red))]/60 ml-1 shrink-0" />
      <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
        {forced ? 'ENV FORCED' : 'UI TOGGLE'}
      </Badge>

      {/* Data filter toggle */}
      {onToggleFilter && (
        <div className="flex items-center gap-2 ml-auto border-l border-border/30 pl-3">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Show longs only
          </span>
          <Switch
            checked={longOnlyFilter ?? false}
            onCheckedChange={onToggleFilter}
            className="scale-75 origin-right"
          />
        </div>
      )}
    </div>
  );
}

/** Compact badge for dashboard headers */
export function LongOnlyBadge() {
  if (!isLongOnlyEnabled()) return null;
  return (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 border-[hsl(var(--neural-green))]/40 text-[hsl(var(--neural-green))] bg-[hsl(var(--neural-green))]/10">
      <Shield className="w-2.5 h-2.5 mr-1" />
      LONG-ONLY
    </Badge>
  );
}
