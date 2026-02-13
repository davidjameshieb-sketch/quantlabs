// Ghost Tape — Blocked Trade Counterfactual Feed
import { useState, useEffect, useCallback } from 'react';
import { Ghost, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface BlockedTrade {
  id: string;
  currency_pair: string;
  direction: string;
  gate_result: string | null;
  gate_reasons: string[] | null;
  counterfactual_pips: number | null;
  counterfactual_result: string | null;
  counterfactual_entry_price: number | null;
  agent_id: string | null;
  created_at: string;
  governance_composite: number | null;
}

export function GhostTapePanel() {
  const [trades, setTrades] = useState<BlockedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocked = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('oanda_orders')
      .select('id, currency_pair, direction, gate_result, gate_reasons, counterfactual_pips, counterfactual_result, counterfactual_entry_price, agent_id, created_at, governance_composite')
      .in('status', ['rejected', 'blocked', 'skipped'])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(40);

    if (data) setTrades(data as BlockedTrade[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBlocked();
    const id = setInterval(fetchBlocked, 30_000);
    return () => clearInterval(id);
  }, [fetchBlocked]);

  const resolved = trades.filter(t => t.counterfactual_result != null);
  const savedCapital = resolved.filter(t => t.counterfactual_result === 'loss');
  const missedWins = resolved.filter(t => t.counterfactual_result === 'win');
  const overFilterRate = resolved.length > 0 ? Math.round((missedWins.length / resolved.length) * 100) : 0;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ghost className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">Ghost Tape</h3>
          <Badge variant="outline" className="text-[8px] px-1.5">{trades.length} blocked</Badge>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className="text-[hsl(var(--neural-green))]">Saved: {savedCapital.length}</span>
          <span className="text-[hsl(var(--neural-orange))]">Missed: {missedWins.length}</span>
          <Badge variant={overFilterRate > 50 ? 'destructive' : 'outline'} className="text-[8px]">
            Over-Filter: {overFilterRate}%
          </Badge>
        </div>
      </div>

      <div className="space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin">
        {loading && <p className="text-[10px] text-muted-foreground text-center py-4">Loading ghost tape...</p>}
        {!loading && trades.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic text-center py-4">No blocked trades in the last 7 days</p>
        )}
        {trades.map(t => {
          const topGate = t.gate_reasons?.[0] || t.gate_result || 'Unknown';
          const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
          const ageLabel = age < 60 ? `${age}m` : age < 1440 ? `${Math.round(age / 60)}h` : `${Math.round(age / 1440)}d`;

          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[10px] opacity-70 hover:opacity-100 transition-opacity',
                t.counterfactual_result === 'win'
                  ? 'border-[hsl(var(--neural-orange))]/30 bg-[hsl(var(--neural-orange))]/5'
                  : t.counterfactual_result === 'loss'
                    ? 'border-[hsl(var(--neural-green))]/30 bg-[hsl(var(--neural-green))]/5'
                    : 'border-border/20'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {t.direction === 'long' ? (
                  <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))] shrink-0" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))] shrink-0" />
                )}
                <span className="font-mono font-medium">{t.currency_pair.replace('_', '/')}</span>
                <span className="text-muted-foreground truncate">{t.agent_id || '—'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[7px] px-1 font-mono max-w-[120px] truncate">
                  <ShieldAlert className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                  {topGate}
                </Badge>
                {t.counterfactual_pips != null ? (
                  <span className={cn(
                    'font-mono font-bold min-w-[45px] text-right',
                    t.counterfactual_pips >= 0 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-green))]'
                  )}>
                    {t.counterfactual_pips >= 0 ? '+' : ''}{t.counterfactual_pips.toFixed(1)}p
                  </span>
                ) : (
                  <span className="text-muted-foreground font-mono min-w-[45px] text-right">pending</span>
                )}
                <span className="text-muted-foreground w-[28px] text-right">{ageLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
