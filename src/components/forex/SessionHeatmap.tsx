// Trading session heatmap — visual grid showing performance by London/NY/Tokyo/Sydney
import { Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionAnalytics, SessionLabel } from '@/hooks/useTradeAnalytics';

interface SessionHeatmapProps {
  sessions: SessionAnalytics[];
}

const sessionConfig: Record<SessionLabel, { color: string; hours: string; emoji: string }> = {
  'Tokyo': { color: 'from-blue-500/20 to-indigo-500/20', hours: '00:00–07:00 UTC', emoji: '🇯🇵' },
  'Sydney': { color: 'from-cyan-500/20 to-teal-500/20', hours: '07:00–08:00 UTC', emoji: '🇦🇺' },
  'London': { color: 'from-amber-500/20 to-yellow-500/20', hours: '08:00–13:00 UTC', emoji: '🇬🇧' },
  'New York': { color: 'from-red-500/20 to-orange-500/20', hours: '13:00–22:00 UTC', emoji: '🇺🇸' },
  'Off-Hours': { color: 'from-gray-500/20 to-slate-500/20', hours: '22:00–00:00 UTC', emoji: '🌙' },
};

export const SessionHeatmap = ({ sessions }: SessionHeatmapProps) => {
  const maxTrades = Math.max(...sessions.map(s => s.tradeCount), 1);
  const totalTrades = sessions.reduce((s, x) => s + x.tradeCount, 0);

  return (
    <div className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
      <div className="p-3 border-b border-border/30 flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold">SESSION PERFORMANCE HEATMAP</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">{totalTrades} total trades</span>
      </div>

      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {sessions.map((s) => {
          const cfg = sessionConfig[s.session];
          const intensity = s.tradeCount / maxTrades;
          const hasTrades = s.tradeCount > 0;

          return (
            <div
              key={s.session}
              className={cn(
                'p-3 rounded-lg border transition-all relative overflow-hidden',
                hasTrades
                  ? `bg-gradient-to-br ${cfg.color} border-border/40`
                  : 'bg-muted/5 border-border/20 opacity-50'
              )}
            >
              {/* Intensity bar */}
              {hasTrades && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-primary/10"
                  style={{ height: `${intensity * 100}%` }}
                />
              )}

              <div className="relative z-10 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{cfg.emoji}</span>
                    <span className="text-[10px] font-display font-bold">{s.session}</span>
                  </div>
                  <span className="text-[8px] text-muted-foreground">{cfg.hours}</span>
                </div>

                {hasTrades ? (
                  <>
                    {/* Win rate bar */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-muted-foreground">Win Rate</span>
                        <span className={cn(
                          'font-mono font-bold',
                          s.winRate >= 0.6 ? 'text-neural-green' :
                          s.winRate >= 0.4 ? 'text-yellow-500' : 'text-neural-red'
                        )}>
                          {(s.winRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            s.winRate >= 0.6 ? 'bg-neural-green' :
                            s.winRate >= 0.4 ? 'bg-yellow-500' : 'bg-neural-red'
                          )}
                          style={{ width: `${s.winRate * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                      <div>
                        <span className="text-muted-foreground">Trades</span>
                        <p className="font-mono font-bold text-foreground">{s.tradeCount}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Net P&L</span>
                        <p className={cn('font-mono font-bold', s.netPnlPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {s.netPnlPips >= 0 ? '+' : ''}{s.netPnlPips}p
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quality</span>
                        <p className="font-mono text-foreground">{s.avgQuality}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Slippage</span>
                        <p className={cn('font-mono', s.avgSlippage <= 0.5 ? 'text-neural-green' : 'text-neural-orange')}>
                          {s.avgSlippage.toFixed(2)}p
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[9px] text-muted-foreground text-center py-2">No trades</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
