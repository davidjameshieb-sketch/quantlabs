import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ShieldAlert, Timer, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FloorManagerState } from '@/hooks/useFloorManagerState';

interface Props {
  state: FloorManagerState;
}

function parseReason(reason: string): Record<string, string> {
  try { return JSON.parse(reason); } catch { return { reason }; }
}

function ttlLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function GateStatusPanel({ state }: Props) {
  const compositeMin = useMemo(() => {
    const t = state.gateThresholds.find(g => {
      const p = parseReason(g.reason);
      return p.compositeScoreMin != null;
    });
    if (!t) return { value: 0.72, overridden: false, reason: '' };
    const p = parseReason(t.reason);
    return { value: Number(p.compositeScoreMin), overridden: true, reason: p.reason || t.reason };
  }, [state.gateThresholds]);

  const g11Threshold = useMemo(() => {
    const t = state.gateThresholds.find(g => {
      const p = parseReason(g.reason);
      return p.G11_atrStretchThreshold != null;
    });
    if (!t) return { value: 1.8, overridden: false, reason: '' };
    const p = parseReason(t.reason);
    return { value: Number(p.G11_atrStretchThreshold), overridden: true, reason: p.reason || t.reason };
  }, [state.gateThresholds]);

  const allActiveBypasses = [...state.bypasses, ...state.gateThresholds, ...state.blacklists, ...state.evolutionParams];
  const cbTripped = !!state.circuitBreaker;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Gate Status</h3>
      </div>

      {/* Dynamic Thresholds */}
      <div className="grid grid-cols-2 gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('p-2 rounded-lg border text-center', compositeMin.overridden ? 'border-[hsl(var(--neural-orange))]/50 bg-[hsl(var(--neural-orange))]/5' : 'border-border/30')}>
                <p className="text-[9px] text-muted-foreground">Composite Min</p>
                <p className={cn('text-lg font-mono font-bold', compositeMin.overridden ? 'text-[hsl(var(--neural-orange))]' : 'text-foreground')}>
                  {compositeMin.value.toFixed(2)}
                </p>
              </div>
            </TooltipTrigger>
            {compositeMin.overridden && (
              <TooltipContent><p className="text-xs max-w-[200px]">{compositeMin.reason}</p></TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('p-2 rounded-lg border text-center', g11Threshold.overridden ? 'border-[hsl(var(--neural-orange))]/50 bg-[hsl(var(--neural-orange))]/5' : 'border-border/30')}>
                <p className="text-[9px] text-muted-foreground">G11 ATR Stretch</p>
                <p className={cn('text-lg font-mono font-bold', g11Threshold.overridden ? 'text-[hsl(var(--neural-orange))]' : 'text-foreground')}>
                  {g11Threshold.value.toFixed(1)}x
                </p>
              </div>
            </TooltipTrigger>
            {g11Threshold.overridden && (
              <TooltipContent><p className="text-xs max-w-[200px]">{g11Threshold.reason}</p></TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Circuit Breaker */}
      <div className={cn(
        'flex items-center justify-between p-2 rounded-lg border',
        cbTripped
          ? 'border-[hsl(var(--neural-red))]/60 bg-[hsl(var(--neural-red))]/10'
          : 'border-[hsl(var(--neural-green))]/40 bg-[hsl(var(--neural-green))]/5'
      )}>
        <div className="flex items-center gap-2">
          <Zap className={cn('w-4 h-4', cbTripped ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')} />
          <span className="text-xs font-semibold">Master Kill-Switch</span>
        </div>
        <Badge variant="outline" className={cn('text-[9px]', cbTripped ? 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/50' : 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/50')}>
          {cbTripped ? '⚡ TRIPPED' : '✓ ARMED'}
        </Badge>
      </div>

      {/* Active Bypass Registry */}
      {allActiveBypasses.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active Overrides ({allActiveBypasses.length})</p>
          <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1">
            {allActiveBypasses.map(b => (
              <div key={b.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-muted/10 border border-border/20 text-[10px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge variant="outline" className="text-[8px] shrink-0 border-primary/40 text-primary">{b.gate_id}</Badge>
                  <span className="text-muted-foreground truncate">{b.pair || 'Global'}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                  <Timer className="w-3 h-3" />
                  <span>{ttlLabel(b.expires_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
