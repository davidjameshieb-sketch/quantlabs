import { motion, AnimatePresence } from 'framer-motion';
import { Map, ArrowUp, ArrowDown, ArrowLeftRight, Shield, AlertTriangle, Zap, Ban, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePairHeatmapData, type PairHeatmapEntry, type PairStatus } from '@/hooks/usePairHeatmapData';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<PairStatus, { label: string; color: string; bg: string; border: string; icon: typeof Zap; pulse?: boolean }> = {
  OPPORTUNITY: {
    label: 'Opportunity',
    color: 'text-[hsl(var(--neural-green))]',
    bg: 'bg-[hsl(var(--neural-green))]/15',
    border: 'border-[hsl(var(--neural-green))]/40',
    icon: TrendingUp,
    pulse: true,
  },
  ACTIVE: {
    label: 'Active Trade',
    color: 'text-[hsl(var(--neural-cyan))]',
    bg: 'bg-[hsl(var(--neural-cyan))]/15',
    border: 'border-[hsl(var(--neural-cyan))]/40',
    icon: Zap,
    pulse: true,
  },
  THROTTLED: {
    label: 'Throttled',
    color: 'text-[hsl(var(--neural-orange))]',
    bg: 'bg-[hsl(var(--neural-orange))]/15',
    border: 'border-[hsl(var(--neural-orange))]/40',
    icon: Shield,
  },
  TRAPPED: {
    label: 'Trap Zone',
    color: 'text-[hsl(var(--neural-red))]',
    bg: 'bg-[hsl(var(--neural-red))]/15',
    border: 'border-[hsl(var(--neural-red))]/40',
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    icon: Ban,
  },
  IDLE: {
    label: 'Idle',
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-border/30',
    icon: Clock,
  },
};

function DirectionIcon({ dir }: { dir: 'long' | 'short' | 'mixed' }) {
  if (dir === 'long') return <ArrowUp className="w-3 h-3 text-[hsl(var(--neural-green))]" />;
  if (dir === 'short') return <ArrowDown className="w-3 h-3 text-[hsl(var(--neural-red))]" />;
  return <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />;
}

function PairCell({ entry }: { entry: PairHeatmapEntry }) {
  const cfg = STATUS_CONFIG[entry.status];
  const Icon = cfg.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'relative rounded-lg border p-2.5 cursor-default transition-all hover:scale-105',
              cfg.bg, cfg.border,
              cfg.pulse && 'animate-pulse',
            )}
            style={{ animationDuration: cfg.pulse ? '3s' : undefined }}
          >
            {/* Status dot */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-xs font-bold">{entry.displayPair}</span>
              <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
            </div>

            {/* PnL + Direction */}
            <div className="flex items-center justify-between">
              <span className={cn(
                'text-[11px] font-mono font-semibold',
                entry.netPips >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
              )}>
                {entry.netPips >= 0 ? '+' : ''}{entry.netPips}p
              </span>
              <DirectionIcon dir={entry.recentDirection} />
            </div>

            {/* Win rate bar */}
            <div className="mt-1.5 h-1 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  entry.winRate >= 55 ? 'bg-[hsl(var(--neural-green))]' :
                  entry.winRate >= 45 ? 'bg-[hsl(var(--neural-orange))]' :
                  'bg-[hsl(var(--neural-red))]'
                )}
                style={{ width: `${Math.min(100, entry.winRate)}%` }}
              />
            </div>

            {/* Trade count */}
            <div className="mt-1 text-[9px] text-muted-foreground text-center">
              {entry.closedTrades} trades · {entry.winRate}% WR
            </div>

            {/* Active trade glow */}
            {entry.status === 'ACTIVE' && (
              <div className="absolute inset-0 rounded-lg border-2 border-[hsl(var(--neural-cyan))]/60 animate-pulse pointer-events-none" />
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{entry.displayPair}</span>
            <Badge variant="outline" className={cn('text-[9px]', cfg.color, cfg.border)}>
              {cfg.label}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-muted-foreground">Net PnL</span>
            <span className={cn('font-mono', entry.netPips >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
              {entry.netPips >= 0 ? '+' : ''}{entry.netPips} pips
            </span>
            <span className="text-muted-foreground">Win Rate</span>
            <span className="font-mono">{entry.winRate}%</span>
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-mono">{entry.avgConfidence}%</span>
            <span className="text-muted-foreground">Closed</span>
            <span className="font-mono">{entry.closedTrades}</span>
            <span className="text-muted-foreground">Rejected</span>
            <span className="font-mono text-[hsl(var(--neural-red))]">{entry.rejectedTrades}</span>
            <span className="text-muted-foreground">Throttled</span>
            <span className="font-mono text-[hsl(var(--neural-orange))]">{entry.throttledTrades}</span>
            <span className="text-muted-foreground">Direction</span>
            <span className="font-mono capitalize">{entry.recentDirection}</span>
          </div>
          {entry.gateFails.length > 0 && (
            <div className="pt-1 border-t border-border/30">
              <span className="text-[9px] text-[hsl(var(--neural-red))]">
                Gates: {entry.gateFails.slice(0, 3).join(', ')}
              </span>
            </div>
          )}
          {entry.openTrades > 0 && (
            <div className="text-[9px] text-[hsl(var(--neural-cyan))] font-semibold">
              ⚡ {entry.openTrades} open position{entry.openTrades > 1 ? 's' : ''}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
        const Icon = cfg.icon;
        return (
          <div key={key} className="flex items-center gap-1 text-[9px]">
            <Icon className={cn('w-3 h-3', cfg.color)} />
            <span className={cfg.color}>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PairOpportunityHeatmap() {
  const { pairs, loading, lastUpdated } = usePairHeatmapData(15_000);

  const opportunities = pairs.filter(p => p.status === 'OPPORTUNITY' || p.status === 'ACTIVE');
  const traps = pairs.filter(p => p.status === 'TRAPPED' || p.status === 'BLOCKED');

  return (
    <Card className="border-border/30 bg-card/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" />
          <h3 className="font-display text-sm font-bold">Live Pair Opportunity Heatmap</h3>
          <Badge variant="outline" className="text-[9px]">
            {pairs.length} pairs · 7d
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {opportunities.length > 0 && (
            <Badge className="text-[9px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
              <TrendingUp className="w-3 h-3 mr-1" />
              {opportunities.length} opportunities
            </Badge>
          )}
          {traps.length > 0 && (
            <Badge className="text-[9px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {traps.length} traps
            </Badge>
          )}
        </div>
      </div>

      {/* Legend */}
      <StatusLegend />

      {/* Heatmap Grid */}
      {loading ? (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {pairs.map(entry => (
              <PairCell key={entry.pair} entry={entry} />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Footer */}
      {lastUpdated && (
        <div className="text-[9px] text-muted-foreground text-right">
          Updated {lastUpdated.toLocaleTimeString()} · auto-refreshing 15s
        </div>
      )}
    </Card>
  );
}
