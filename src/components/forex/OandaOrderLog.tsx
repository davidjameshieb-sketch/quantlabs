// OANDA Execution Order Log
// Shows recent orders forwarded to OANDA with status tracking

import { useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOandaExecution, OandaOrder } from '@/hooks/useOandaExecution';

export const OandaOrderLog = () => {
  const { orders, fetchOrderHistory, loading } = useOandaExecution();

  useEffect(() => {
    fetchOrderHistory('practice');
  }, [fetchOrderHistory]);

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
        <h3 className="text-xs font-display font-bold">OANDA Execution Log</h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => fetchOrderHistory('practice')}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {orders.length === 0 ? (
        <p className="text-[10px] text-muted-foreground py-4 text-center">
          No orders executed yet. Trades will appear here once AI signals are forwarded to OANDA.
        </p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {orders.map((order: OandaOrder) => {
            const cfg = statusConfig[order.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const DirIcon = order.direction === 'long' ? ArrowUpRight : ArrowDownRight;

            return (
              <div
                key={order.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20 text-[10px]"
              >
                <StatusIcon className={cn('w-3 h-3 shrink-0', cfg.color)} />
                <DirIcon
                  className={cn(
                    'w-3 h-3 shrink-0',
                    order.direction === 'long' ? 'text-neural-green' : 'text-neural-red'
                  )}
                />
                <span className="font-mono font-medium w-16 shrink-0">{order.currency_pair}</span>
                <span className="text-muted-foreground shrink-0">{order.units} units</span>
                <Badge
                  variant="outline"
                  className={cn('text-[8px] px-1 py-0 shrink-0', cfg.color)}
                >
                  {order.status}
                </Badge>
                {order.entry_price && (
                  <span className="font-mono text-muted-foreground ml-auto">
                    @{Number(order.entry_price).toFixed(5)}
                  </span>
                )}
                {order.error_message && (
                  <span className="text-neural-red truncate max-w-[120px] ml-auto" title={order.error_message}>
                    {order.error_message}
                  </span>
                )}
                <span className="text-muted-foreground/60 ml-auto shrink-0">
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
