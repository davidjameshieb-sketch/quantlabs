// Long-Only Mode Banner — shows on all forex dashboards when active

import { Shield, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isLongOnlyEnabled, isLongOnlyForcedByEnv } from '@/lib/config/tradingMode';

export function LongOnlyBanner() {
  if (!isLongOnlyEnabled()) return null;

  const forced = isLongOnlyForcedByEnv();

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--neural-green))]/8 border border-[hsl(var(--neural-green))]/25">
      <Shield className="w-4 h-4 text-[hsl(var(--neural-green))]" />
      <span className="text-xs font-medium text-[hsl(var(--neural-green))]">
        Long-Only Mode Active
      </span>
      <span className="text-[9px] text-muted-foreground">
        — shorts blocked at governance + execution
      </span>
      <Ban className="w-3 h-3 text-[hsl(var(--neural-red))]/60 ml-1" />
      <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
        {forced ? 'ENV FORCED' : 'UI TOGGLE'}
      </Badge>
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
