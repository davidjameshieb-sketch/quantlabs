import { Badge } from '@/components/ui/badge';
import { Scale, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FloorManagerState } from '@/hooks/useFloorManagerState';

const SESSIONS = ['Asian', 'London', 'NY', 'NY-Overlap'] as const;
const PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CAD', 'AUD_USD', 'NZD_USD', 'EUR_GBP', 'GBP_JPY'];

interface Props {
  state: FloorManagerState;
}

function parseSizingMultiplier(reason: string): number {
  try {
    const p = JSON.parse(reason);
    return Number(p.multiplier ?? p.position_sizing_multiplier ?? 1);
  } catch {
    return 1;
  }
}

function parseBlacklist(reason: string): { pair?: string; session?: string; multiplier?: number } {
  try { return JSON.parse(reason); } catch { return {}; }
}

export function ExecutionSizingPanel({ state }: Props) {
  const sizingMult = state.sizingOverride
    ? parseSizingMultiplier(state.sizingOverride.reason)
    : 1.0;

  const isExpanded = sizingMult > 1;
  const isContracted = sizingMult < 1;
  const isDefault = sizingMult === 1;

  // Build blacklist map: session -> pair[]
  const blacklistMap = new Map<string, Set<string>>();
  state.blacklists.forEach(b => {
    const parsed = parseBlacklist(b.reason);
    const session = parsed.session || 'All';
    const pair = parsed.pair || b.pair || 'All';
    if (!blacklistMap.has(session)) blacklistMap.set(session, new Set());
    blacklistMap.get(session)!.add(pair);
  });

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2 mb-1">
        <Scale className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Execution & Sizing</h3>
      </div>

      {/* Sizing Multiplier */}
      <div className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        isExpanded && 'border-[hsl(var(--neural-green))]/50 bg-[hsl(var(--neural-green))]/5',
        isContracted && 'border-[hsl(var(--neural-red))]/50 bg-[hsl(var(--neural-red))]/5',
        isDefault && 'border-border/30',
      )}>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase">Position Sizing</p>
          <p className={cn(
            'text-2xl font-mono font-black',
            isExpanded && 'text-[hsl(var(--neural-green))]',
            isContracted && 'text-[hsl(var(--neural-red))]',
            isDefault && 'text-foreground',
          )}>
            {sizingMult.toFixed(1)}x
          </p>
        </div>
        <Badge variant="outline" className={cn(
          'text-[9px]',
          isExpanded && 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/50',
          isContracted && 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/50',
          isDefault && 'text-muted-foreground',
        )}>
          {isExpanded ? '▲ EXPANDED' : isContracted ? '▼ CONTRACTED' : '— DEFAULT'}
        </Badge>
      </div>

      {/* Session Blacklist Map */}
      <div className="space-y-1.5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Session Blacklist Map</p>
        <div className="grid grid-cols-4 gap-1">
          {SESSIONS.map(session => (
            <div key={session} className="space-y-0.5">
              <p className="text-[8px] font-semibold text-center text-muted-foreground">{session}</p>
              {PAIRS.slice(0, 4).map(pair => {
                const shortPair = pair.replace('_', '/');
                const isBlocked = blacklistMap.has(session) && (blacklistMap.get(session)!.has(pair) || blacklistMap.get(session)!.has('All'));
                const isGlobalBlocked = blacklistMap.has('All') && (blacklistMap.get('All')!.has(pair) || blacklistMap.get('All')!.has('All'));
                const blocked = isBlocked || isGlobalBlocked;
                return (
                  <div key={pair} className={cn(
                    'text-[7px] text-center py-0.5 rounded font-mono',
                    blocked
                      ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] line-through'
                      : 'bg-muted/10 text-muted-foreground'
                  )}>
                    {shortPair}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
