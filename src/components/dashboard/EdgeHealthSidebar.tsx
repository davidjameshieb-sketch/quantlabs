// Compact edge health widget for the dashboard sidebar — auto-refreshes
// Includes GREEN/YELLOW/RED badge based on quantitative edge health rules.
import { useEdgeHealthStats, type HealthColor } from '@/hooks/useEdgeHealthStats';
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Clock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const dot: Record<HealthColor, string> = {
  green: 'bg-neural-green',
  yellow: 'bg-neural-orange',
  red: 'bg-neural-red',
};

const bg: Record<HealthColor, string> = {
  green: 'bg-neural-green/10 border-neural-green/20',
  yellow: 'bg-neural-orange/10 border-neural-orange/20',
  red: 'bg-neural-red/10 border-neural-red/20',
};

const text: Record<HealthColor, string> = {
  green: 'text-neural-green',
  yellow: 'text-neural-orange',
  red: 'text-neural-red',
};

const BADGE_RULES: Record<HealthColor, string> = {
  green: 'PF≥1.5 · Exp>0.3 · ShortWR>45%',
  yellow: 'PF 1.0–1.5 or developing',
  red: 'PF<1.0 or Exp≤0 or ShortWR<35%',
};

export const EdgeHealthSidebar = () => {
  const stats = useEdgeHealthStats(45_000);

  if (!stats.lastUpdated) {
    return (
      <div className="px-4 py-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Edge Health</p>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header badge with classification rule */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edge Health</p>
          <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold', bg[stats.status], text[stats.status])}>
            <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', dot[stats.status])} />
            {stats.statusLabel}
          </div>
        </div>
        <p className="text-[8px] text-muted-foreground/60 font-mono">{BADGE_RULES[stats.status]}</p>
      </div>

      {/* 4-Layer stack indicator */}
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/70">
        <Layers className="w-3 h-3" />
        <span className="font-mono">L1→L2→L3→L4 active</span>
      </div>

      {/* Core stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <MiniStat label="Trades" value={stats.totalTrades.toLocaleString()} />
        <MiniStat label="Win Rate" value={`${stats.overallWinRate}%`} color={stats.overallWinRate >= 50 ? 'green' : 'red'} />
        <MiniStat label="Expect." value={`${stats.overallExpectancy >= 0 ? '+' : ''}${stats.overallExpectancy}p`} color={stats.overallExpectancy > 0 ? 'green' : 'red'} />
        <MiniStat label="PF" value={`${stats.overallPF}`} color={stats.overallPF >= 1.5 ? 'green' : stats.overallPF >= 1.0 ? 'yellow' : 'red'} />
      </div>

      {/* Direction split */}
      <div className="space-y-1">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Direction</p>
        <div className="flex items-center gap-2 text-[10px]">
          <ArrowUp className="w-3 h-3 text-neural-green" />
          <span className="text-muted-foreground">Long</span>
          <span className={cn('font-mono font-bold ml-auto', stats.longWR >= 50 ? 'text-neural-green' : 'text-neural-red')}>
            {stats.longWR}% · {stats.longNet >= 0 ? '+' : ''}{stats.longNet}p
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <ArrowDown className="w-3 h-3 text-neural-red" />
          <span className="text-muted-foreground">Short</span>
          <span className={cn('font-mono font-bold ml-auto', stats.shortWR >= 45 ? 'text-neural-green' : 'text-neural-red')}>
            {stats.shortWR}% · {stats.shortNet >= 0 ? '+' : ''}{stats.shortNet}p
          </span>
        </div>
      </div>

      {/* Sessions */}
      {stats.sessions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sessions</p>
          {stats.sessions.slice(0, 5).map(s => (
            <div key={s.session} className="flex items-center gap-1.5 text-[10px]">
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dot[s.color])} />
              <span className="text-muted-foreground truncate flex-1">{s.session}</span>
              <span className={cn('font-mono font-bold', s.netPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                {s.netPips >= 0 ? '+' : ''}{s.netPips}p
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top pairs */}
      {stats.topPairs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Top Pairs</p>
          {stats.topPairs.map(p => (
            <div key={p.pair} className="flex items-center gap-1.5 text-[10px]">
              <TrendingUp className="w-3 h-3 text-neural-green flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">{p.pair.replace('_', '/')}</span>
              <span className="font-mono font-bold text-neural-green">+{p.netPips}p</span>
            </div>
          ))}
        </div>
      )}

      {/* Worst pairs */}
      {stats.worstPairs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Worst Pairs</p>
          {stats.worstPairs.map(p => (
            <div key={p.pair} className="flex items-center gap-1.5 text-[10px]">
              <TrendingDown className="w-3 h-3 text-neural-red flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">{p.pair.replace('_', '/')}</span>
              <span className="font-mono font-bold text-neural-red">{p.netPips}p</span>
            </div>
          ))}
        </div>
      )}

      {/* Last updated */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 pt-1">
        <Clock className="w-2.5 h-2.5" />
        <span>Updated {stats.lastUpdated.toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, color }: { label: string; value: string; color?: HealthColor }) => (
  <div className="bg-muted/30 rounded-md px-2 py-1.5 text-center">
    <p className="text-[9px] text-muted-foreground">{label}</p>
    <p className={cn('text-xs font-mono font-bold', color ? text[color] : 'text-foreground')}>{value}</p>
  </div>
);
