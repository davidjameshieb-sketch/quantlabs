// OANDA Execution Order Log
// Only shows trades that passed ALL 4 SPP v2.0 physics gates (Hurst ≥ 0.62, E > 100x, |Z-OFI| > 2.5σ, VPIN > 0.60)
// i.e. gate_result = 'PASS' AND oanda_trade_id IS NOT NULL (broker-confirmed fills only)

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface ConfirmedStrike {
  id: string;
  currency_pair: string;
  direction: string;
  units: number;
  entry_price: number | null;
  exit_price: number | null;
  oanda_trade_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  closed_at: string | null;
  gate_result: string | null;
  governance_payload: Record<string, unknown> | null;
  r_pips: number | null;
  session_label: string | null;
}

export const OandaOrderLog = () => {
  const [orders, setOrders] = useState<ConfirmedStrike[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConfirmedStrikes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, units, entry_price, exit_price, oanda_trade_id, status, error_message, created_at, closed_at, gate_result, governance_payload, r_pips, session_label')
        .eq('gate_result', 'PASS')
        .not('oanda_trade_id', 'is', null)
        .not('entry_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setOrders(data as ConfirmedStrike[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfirmedStrikes();
  }, [fetchConfirmedStrikes]);

  const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
    filled: { icon: CheckCircle2, color: 'text-neural-green' },
    rejected: { icon: XCircle, color: 'text-neural-red' },
    pending: { icon: Clock, color: 'text-neural-orange' },
    submitted: { icon: Clock, color: 'text-primary' },
    closed: { icon: CheckCircle2, color: 'text-muted-foreground' },
    cancelled: { icon: XCircle, color: 'text-muted-foreground' },
  };

  // Extract gate physics from governance_payload for display
  const getGateSnapshot = (payload: Record<string, unknown> | null) => {
    if (!payload) return null;
    const h = payload.hurst as number | undefined;
    const e = payload.efficiency as number | undefined;
    const z = payload.zofi as number | undefined;
    const v = payload.vpin as number | undefined;
    if (h == null && e == null) return null;
    return { h, e, z, v };
  };

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-display font-bold">Confirmed Strikes</h3>
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-primary/20 text-primary">
            4/4 Gates
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={fetchConfirmedStrikes}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p className="text-[9px] text-muted-foreground/60">
        Only broker-confirmed fills that cleared all SPP v2.0 thresholds: H≥0.62 · E&gt;100x · |Z|&gt;2.5σ · VPIN&gt;0.60
      </p>

      {orders.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <Zap className="w-6 h-6 mx-auto text-muted-foreground/20" />
          <p className="text-[10px] text-muted-foreground">
            No confirmed 4/4-gate strikes yet.
          </p>
          <p className="text-[9px] text-muted-foreground/60">
            Trades appear here only when all physics gates pass simultaneously and OANDA confirms the fill.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {orders.map((order) => {
            const cfg = statusConfig[order.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const DirIcon = order.direction === 'long' ? ArrowUpRight : ArrowDownRight;
            const gates = getGateSnapshot(order.governance_payload);
            const isClosed = !!order.closed_at;
            const rPips = order.r_pips;

            return (
              <div
                key={order.id}
                className="flex flex-col gap-1 px-2 py-2 rounded bg-muted/10 border border-border/20 text-[10px]"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon className={cn('w-3 h-3 shrink-0', cfg.color)} />
                  <DirIcon
                    className={cn(
                      'w-3 h-3 shrink-0',
                      order.direction === 'long' ? 'text-neural-green' : 'text-neural-red'
                    )}
                  />
                  <span className="font-mono font-bold w-16 shrink-0">{order.currency_pair}</span>
                  <Badge
                    variant="outline"
                    className={cn('text-[8px] px-1 py-0 shrink-0', cfg.color)}
                  >
                    {order.status}
                  </Badge>
                  {order.entry_price && (
                    <span className="font-mono text-muted-foreground">
                      @{Number(order.entry_price).toFixed(5)}
                    </span>
                  )}
                  {rPips != null && (
                    <span className={cn('font-mono ml-auto shrink-0 font-bold', rPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {rPips >= 0 ? '+' : ''}{rPips.toFixed(1)}p
                    </span>
                  )}
                  <span className="text-muted-foreground/60 ml-auto shrink-0">
                    {new Date(order.created_at).toLocaleTimeString()}
                  </span>
                </div>

                {/* Gate physics snapshot */}
                {gates && (
                  <div className="flex items-center gap-2 pl-6 flex-wrap">
                    {gates.h != null && (
                      <span className={cn('font-mono text-[9px]', gates.h >= 0.62 ? 'text-emerald-400' : 'text-red-400')}>
                        H={gates.h.toFixed(2)}
                      </span>
                    )}
                    {gates.e != null && (
                      <span className={cn('font-mono text-[9px]', gates.e > 100 ? 'text-emerald-400' : 'text-red-400')}>
                        E={gates.e.toFixed(0)}x
                      </span>
                    )}
                    {gates.z != null && (
                      <span className={cn('font-mono text-[9px]', Math.abs(gates.z) > 2.5 ? 'text-emerald-400' : 'text-red-400')}>
                        Z={gates.z.toFixed(2)}σ
                      </span>
                    )}
                    {gates.v != null && (
                      <span className={cn('font-mono text-[9px]', gates.v > 0.60 ? 'text-emerald-400' : 'text-red-400')}>
                        V={gates.v.toFixed(2)}
                      </span>
                    )}
                    {order.session_label && (
                      <span className="text-[9px] text-muted-foreground/60 ml-auto">{order.session_label}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
