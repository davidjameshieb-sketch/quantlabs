// Indicator Consensus "Engine Room" — 7-indicator LED strip + bias weight
import { useState, useEffect, useCallback } from 'react';
import { Cpu, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface TradeConsensus {
  currency_pair: string;
  direction: string;
  indicators: { name: string; signal: 'bullish' | 'bearish' | 'neutral' }[];
  consensusPercent: number;
  thresholdMet: boolean;
}

const CORE_INDICATORS = ['EMA-50', 'RSI', 'Supertrend', 'ADX', 'Bollinger', 'Ichimoku', 'Stochastics'];

export function IndicatorConsensusPanel() {
  const [trades, setTrades] = useState<TradeConsensus[]>([]);

  const fetchConsensus = useCallback(async () => {
    // Get most recent trades with governance payload
    const { data } = await supabase
      .from('oanda_orders')
      .select('currency_pair, direction, governance_payload')
      .in('status', ['filled', 'pending'])
      .is('exit_price', null)
      .not('governance_payload', 'is', null)
      .order('created_at', { ascending: false })
      .limit(6);

    if (!data) return;

    const parsed: TradeConsensus[] = data.map(row => {
      const gp = row.governance_payload as Record<string, unknown> | null;
      const breakdown = (gp?.indicatorBreakdown as Record<string, unknown>) || {};

      const indicators = CORE_INDICATORS.map(name => {
        const val = breakdown[name] || breakdown[name.toLowerCase()] || breakdown[name.replace('-', '_')];
        let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (typeof val === 'string') {
          signal = val.toLowerCase().includes('bull') || val.toLowerCase().includes('long') ? 'bullish' : val.toLowerCase().includes('bear') || val.toLowerCase().includes('short') ? 'bearish' : 'neutral';
        } else if (typeof val === 'number') {
          signal = val > 0 ? 'bullish' : val < 0 ? 'bearish' : 'neutral';
        } else if (val && typeof val === 'object' && 'signal' in (val as Record<string, unknown>)) {
          const s = (val as Record<string, unknown>).signal as string;
          signal = s === 'bullish' || s === 'long' ? 'bullish' : s === 'bearish' || s === 'short' ? 'bearish' : 'neutral';
        }
        return { name, signal };
      });

      const dirSignal = row.direction === 'long' ? 'bullish' : 'bearish';
      const aligned = indicators.filter(i => i.signal === dirSignal).length;
      const consensusPercent = Math.round((aligned / CORE_INDICATORS.length) * 100);
      const thresholdMet = aligned >= 6; // 6/7 threshold

      return { currency_pair: row.currency_pair, direction: row.direction, indicators, consensusPercent, thresholdMet };
    });

    setTrades(parsed);
  }, []);

  useEffect(() => {
    fetchConsensus();
    const id = setInterval(fetchConsensus, 15_000);
    return () => clearInterval(id);
  }, [fetchConsensus]);

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-[hsl(var(--neural-green))]" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Indicator Engine Room</h3>
      </div>

      {trades.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic text-center py-4">No open trades with indicator data</p>
      ) : (
        <div className="space-y-3">
          {trades.map(t => {
            const dirSignal = t.direction === 'long' ? 'bullish' : 'bearish';
            const aligned = t.indicators.filter(i => i.signal === dirSignal).length;

            return (
              <div key={`${t.currency_pair}-${t.direction}`} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold">{t.currency_pair.replace('_', '/')}</span>
                    <Badge variant="outline" className={cn(
                      'text-[7px] px-1',
                      t.direction === 'long' ? 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/40' : 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/40'
                    )}>
                      {t.direction.toUpperCase()}
                    </Badge>
                  </div>
                  <Badge
                    variant={t.thresholdMet ? 'outline' : 'destructive'}
                    className={cn('text-[8px]', t.thresholdMet && 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/40')}
                  >
                    {aligned}/{CORE_INDICATORS.length} — {t.consensusPercent}%
                  </Badge>
                </div>

                {/* LED Strip */}
                <div className="flex items-center gap-1">
                  {t.indicators.map(ind => {
                    const isAligned = ind.signal === dirSignal;
                    const isOpposing = ind.signal !== 'neutral' && !isAligned;
                    return (
                      <div key={ind.name} className="flex flex-col items-center gap-0.5" title={`${ind.name}: ${ind.signal}`}>
                        <Circle
                          className={cn(
                            'w-4 h-4',
                            isAligned ? 'fill-[hsl(var(--neural-green))] text-[hsl(var(--neural-green))]' :
                              isOpposing ? 'fill-[hsl(var(--neural-red))] text-[hsl(var(--neural-red))]' :
                                'fill-muted/40 text-muted-foreground'
                          )}
                        />
                        <span className="text-[7px] text-muted-foreground truncate max-w-[40px]">{ind.name}</span>
                      </div>
                    );
                  })}
                </div>

                {!t.thresholdMet && (
                  <p className="text-[8px] text-[hsl(var(--neural-orange))] italic">
                    ⚠ Below 6/7 threshold — exit signal pending
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
