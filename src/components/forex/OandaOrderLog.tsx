// OANDA Execution Order Log — broker-confirmed fills

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface OandaOrderRow {
  id: string;
  currency_pair: string;
  direction: string;
  units: number;
  entry_price: number | null;
  exit_price: number | null;
  oanda_trade_id: string | null;
  status: string;
  error_message: string | null;
  agent_id: string | null;
  environment: string;
  created_at: string;
  closed_at: string | null;
  r_pips: number | null;
}

export const OandaOrderLog = () => {
  const [orders, setOrders] = useState<OandaOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, units, entry_price, exit_price, oanda_trade_id, status, error_message, agent_id, environment, created_at, closed_at, r_pips')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setOrders(data as OandaOrderRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
    filled: { icon: CheckCircle2, color: 'text-neural-green' },
    rejected: { icon: XCircle, color: 'text-neural-red' },
    pending: { icon: Clock, color: 'text-neural-orange' },
    submitted: { icon: Clock, color: 'text-primary' },
    closed: { icon: CheckCircle2, color: 'text-muted-foreground' },
    cancelled: { icon: XCircle, color: 'text-muted-foreground' },
  };

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display font-bold">Execution Log</h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={fetchOrders}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p className="text-[9px] text-muted-foreground/60">
        All broker-confirmed fills and rejected orders, newest first.
      </p>

      {orders.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <Zap className="w-6 h-6 mx-auto text-muted-foreground/20" />
          <p className="text-[10px] text-muted-foreground">No orders yet.</p>
          <p className="text-[9px] text-muted-foreground/60">
            Executed trades will appear here once OANDA confirms the fill.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {orders.map((order) => {
            const cfg = statusConfig[order.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const DirIcon = order.direction === 'long' ? ArrowUpRight : ArrowDownRight;
            const isJPY = order.currency_pair.includes('JPY');
            const rPips = order.r_pips;

            return (
              <div
                key={order.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20 text-[10px] font-mono"
              >
                <StatusIcon className={cn('w-3 h-3 shrink-0', cfg.color)} />
                <DirIcon
                  className={cn(
                    'w-3 h-3 shrink-0',
                    order.direction === 'long' ? 'text-neural-green' : 'text-neural-red'
                  )}
                />
                <span className="font-bold w-16 shrink-0">{order.currency_pair}</span>
                <Badge variant="outline" className={cn('text-[8px] px-1 py-0 shrink-0 border-0', cfg.color)}>
                  {order.status}
                </Badge>
                <span className="text-muted-foreground shrink-0">{order.units}u</span>
                {order.entry_price && (
                  <span className="text-muted-foreground">
                    @{Number(order.entry_price).toFixed(isJPY ? 3 : 5)}
                  </span>
                )}
                {rPips != null && (
                  <span className={cn('ml-auto shrink-0 font-bold', rPips >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                    {rPips >= 0 ? '+' : ''}{rPips.toFixed(1)}p
                  </span>
                )}
                {order.agent_id && (
                  <span className="text-muted-foreground/40 shrink-0 truncate max-w-20">{order.agent_id}</span>
                )}
                <span className="text-muted-foreground/50 ml-auto shrink-0">
                  {new Date(order.created_at).toLocaleTimeString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
