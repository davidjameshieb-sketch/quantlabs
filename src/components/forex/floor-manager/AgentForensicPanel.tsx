import { Badge } from '@/components/ui/badge';
import { Users, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FloorManagerState } from '@/hooks/useFloorManagerState';

// Agent config for display
const AGENT_LABELS: Record<string, string> = {
  'forex-scalper': 'Scalper',
  'trend-rider': 'Trend Rider',
  'mean-reverter': 'Mean Reverter',
  'breakout-hunter': 'Breakout',
  'session-sniper': 'Session Sniper',
  'momentum-surfer': 'Momentum',
  'range-trader': 'Range Trader',
  'volatility-harvester': 'Vol Harvester',
};

interface OpenTrade {
  currency_pair: string;
  direction: string;
  trade_health_score: number | null;
  mae_r: number | null;
  agent_id: string | null;
}

interface Props {
  state: FloorManagerState;
  openTrades?: OpenTrade[];
}

export function AgentForensicPanel({ state, openTrades = [] }: Props) {
  const suspendedIds = state.suspendedAgents.map(s => {
    try { const p = JSON.parse(s.reason); return p.agent_id || s.pair; } catch { return s.pair; }
  }).filter(Boolean);

  // All known agents
  const allAgents = Object.keys(AGENT_LABELS);

  // THS vs MAE scatter data
  const scatterData = openTrades
    .filter(t => t.trade_health_score != null && t.mae_r != null)
    .map(t => ({
      pair: t.currency_pair,
      ths: t.trade_health_score!,
      mae: Math.abs(t.mae_r!),
      danger: t.mae_r! > 0.7 && t.trade_health_score! < 40,
      agent: t.agent_id || 'unknown',
    }));

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Agent Forensics</h3>
      </div>

      {/* Agent list with suspension status */}
      <div className="grid grid-cols-2 gap-1.5">
        {allAgents.map(id => {
          const isSuspended = suspendedIds.includes(id);
          return (
            <div key={id} className={cn(
              'flex items-center justify-between px-2 py-1.5 rounded-lg border text-[10px]',
              isSuspended
                ? 'border-[hsl(var(--neural-red))]/30 bg-[hsl(var(--neural-red))]/5 opacity-60'
                : 'border-border/20'
            )}>
              <span className={cn('font-medium', isSuspended && 'line-through text-muted-foreground')}>
                {AGENT_LABELS[id] || id}
              </span>
              {isSuspended ? (
                <Badge variant="destructive" className="text-[7px] px-1 py-0">SUSPENDED</Badge>
              ) : (
                <Badge variant="outline" className="text-[7px] px-1 py-0 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/40">LIVE</Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* THS vs MAE Scatter (simplified text-based) */}
      {scatterData.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Open Trades: THS vs MAE</p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {scatterData.map((d, i) => (
              <div key={i} className={cn(
                'flex items-center justify-between px-2 py-1 rounded border text-[10px]',
                d.danger
                  ? 'border-[hsl(var(--neural-red))]/50 bg-[hsl(var(--neural-red))]/10 animate-pulse'
                  : 'border-border/20'
              )}>
                <div className="flex items-center gap-1.5">
                  {d.danger && <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))]" />}
                  <span className="font-mono">{d.pair}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">THS: <span className={cn('font-bold', d.ths >= 70 ? 'text-[hsl(var(--neural-green))]' : d.ths >= 45 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-red))]')}>{d.ths}</span></span>
                  <span className="text-muted-foreground">MAE: <span className={cn('font-bold', d.mae > 0.7 ? 'text-[hsl(var(--neural-red))]' : 'text-foreground')}>{d.mae.toFixed(2)}R</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {scatterData.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic text-center py-2">No open trades with THS/MAE data</p>
      )}
    </div>
  );
}
