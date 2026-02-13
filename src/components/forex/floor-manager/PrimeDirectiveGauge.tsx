import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { FloorManagerState } from '@/hooks/useFloorManagerState';

interface Props {
  state: FloorManagerState;
}

export function PrimeDirectiveGauge({ state }: Props) {
  const score = useMemo(() => {
    let s = 0;
    // Full server-side persistence active
    s += 20;
    // FM has write access (bypasses exist or can be created)
    s += 20;
    // Zero agent bottlenecks — always true in current architecture
    s += 20;
    // Circuit breaker armed
    if (state.circuitBreaker) s += 15;
    else s += 10; // available but not tripped
    // Active gate management
    if (state.gateThresholds.length > 0 || state.bypasses.length > 0) s += 15;
    else s += 5;
    // Sizing control
    if (state.sizingOverride) s += 10;
    else s += 5;
    return Math.min(100, s);
  }, [state]);

  const band = score >= 71 ? 'elite' : score >= 31 ? 'partial' : 'bottleneck';
  const bandColors = {
    elite: 'text-[hsl(var(--neural-green))]',
    partial: 'text-[hsl(var(--neural-orange))]',
    bottleneck: 'text-[hsl(var(--neural-red))]',
  };
  const bandLabel = {
    elite: 'Full Autonomous Authority',
    partial: 'FM Active — Client-Side Only',
    bottleneck: 'Bottlenecks Detected',
  };
  const ringColor = {
    elite: 'stroke-[hsl(150,100%,45%)]',
    partial: 'stroke-[hsl(30,100%,55%)]',
    bottleneck: 'stroke-[hsl(0,100%,60%)]',
  };

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/60 border border-border/40">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Prime Directive</p>
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--border))" strokeWidth="8" opacity="0.3" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            className={ringColor[band]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-mono font-black', bandColors[band])}>{score}</span>
          <span className="text-[9px] text-muted-foreground">/100</span>
        </div>
      </div>
      <p className={cn('text-xs font-semibold', bandColors[band])}>{bandLabel[band]}</p>
    </div>
  );
}
