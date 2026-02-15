// Regime Mismatch Heatmap — MTF Alignment Matrix
import { useState, useEffect, useCallback } from 'react';
import { Layers, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface OpenOrder {
  id: string;
  currency_pair: string;
  direction: string;
  regime_label: string | null;
  mae_r: number | null;
  trade_health_score: number | null;
  governance_payload: Record<string, unknown> | null;
}

const REGIME_COLORS: Record<string, string> = {
  expansion: 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]',
  breakout: 'bg-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))]',
  compression: 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]',
  breakdown: 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]',
  transition: 'bg-[hsl(var(--neural-purple))]/20 text-[hsl(var(--neural-purple))]',
  unknown: 'bg-muted/20 text-muted-foreground',
};

function getRegimeColor(regime: string) {
  return REGIME_COLORS[regime.toLowerCase()] || REGIME_COLORS.unknown;
}

function isMismatch(m15: string, h4: string): boolean {
  const bulls = ['expansion', 'breakout'];
  const bears = ['breakdown', 'compression'];
  return (bulls.includes(m15.toLowerCase()) && bears.includes(h4.toLowerCase())) ||
    (bears.includes(m15.toLowerCase()) && bulls.includes(h4.toLowerCase()));
}

export function RegimeMismatchPanel() {
  const [orders, setOrders] = useState<OpenOrder[]>([]);

  const fetchOpen = useCallback(async () => {
    const { data } = await supabase
      .from('oanda_orders')
      .select('id, currency_pair, direction, regime_label, mae_r, trade_health_score, governance_payload')
      .in('status', ['filled', 'pending'])
      .is('exit_price', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      const typed: OpenOrder[] = data.map(row => ({
        id: row.id,
        currency_pair: row.currency_pair,
        direction: row.direction,
        regime_label: row.regime_label,
        mae_r: row.mae_r ? Number(row.mae_r) : null,
        trade_health_score: row.trade_health_score,
        governance_payload: (row.governance_payload ?? null) as Record<string, unknown> | null,
      }));
      setOrders(typed);
    }
  }, []);

  useEffect(() => {
    fetchOpen();
    const id = setInterval(fetchOpen, 15_000);
    return () => clearInterval(id);
  }, [fetchOpen]);

  // Extract regime info per timeframe from governance_payload
  const pairRegimes = orders.map(o => {
    const gp = o.governance_payload as Record<string, unknown> | null;
    const m15 = o.regime_label || 'unknown';
    // Try to extract from governance payload
    const h1 = (gp?.h1Regime as string) || (gp?.regimeH1 as string) || 'unknown';
    const h4 = (gp?.h4Regime as string) || (gp?.regimeH4 as string) || 'unknown';
    const mismatch = isMismatch(m15, h4);
    const trapped = mismatch && (o.mae_r ?? 0) > 0.5;

    return { ...o, m15, h1, h4, mismatch, trapped };
  });

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Regime Mismatch Matrix</h3>
        {pairRegimes.some(p => p.mismatch) && (
          <Badge variant="destructive" className="text-[7px] px-1.5 animate-pulse">CONFLICT</Badge>
        )}
      </div>

      {pairRegimes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic text-center py-4">No open trades to analyze</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="pb-1.5 pr-2 font-medium">Pair</th>
                <th className="pb-1.5 px-1 font-medium text-center">M15</th>
                <th className="pb-1.5 px-1 font-medium text-center">H1</th>
                <th className="pb-1.5 px-1 font-medium text-center">H4</th>
                <th className="pb-1.5 pl-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {pairRegimes.map(p => (
                <tr
                  key={p.id}
                  className={cn(
                    'border-t border-border/10',
                    p.trapped && 'ring-1 ring-[hsl(var(--neural-orange))]/50 animate-pulse rounded'
                  )}
                >
                  <td className="py-1.5 pr-2 font-mono font-medium">{p.currency_pair.replace('_', '/')}</td>
                  <td className="py-1.5 px-1 text-center">
                    <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-semibold', getRegimeColor(p.m15))}>
                      {p.m15}
                    </span>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-semibold', getRegimeColor(p.h1))}>
                      {p.h1}
                    </span>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-semibold', getRegimeColor(p.h4))}>
                      {p.h4}
                    </span>
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    {p.trapped ? (
                      <div className="flex items-center justify-end gap-1">
                        <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
                        <span className="text-[hsl(var(--neural-orange))] font-semibold">TRAPPED</span>
                      </div>
                    ) : p.mismatch ? (
                      <span className="text-[hsl(var(--neural-purple))] font-semibold">Correction Scalp</span>
                    ) : (
                      <span className="text-[hsl(var(--neural-green))]">Aligned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
