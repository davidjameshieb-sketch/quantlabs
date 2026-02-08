// Live Forex Trades Panel
// Shows real OANDA open positions and recent executed orders from the database

import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Wifi, RefreshCw, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, Clock, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOandaExecution, OandaOpenTrade, OandaOrder } from '@/hooks/useOandaExecution';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';

export const LiveForexTradesPanel = () => {
  const {
    loading,
    connected,
    account,
    openTrades,
    orders,
    fetchAccountSummary,
    fetchOrderHistory,
  } = useOandaExecution();

  const handleRefresh = useCallback(() => {
    fetchAccountSummary('practice');
    fetchOrderHistory('practice');
  }, [fetchAccountSummary, fetchOrderHistory]);

  // Realtime: auto-refresh when orders change (alerts handled by the hook)
  useRealtimeOrders({ onOrderChange: handleRefresh, enableAlerts: false });

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const recentOrders = orders.slice(0, 10);

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">LIVE FOREX TRADES</h3>
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-1.5 py-0',
              connected
                ? 'border-neural-green/30 text-neural-green bg-neural-green/10'
                : connected === false
                ? 'border-neural-red/30 text-neural-red bg-neural-red/10'
                : 'border-border/50 text-muted-foreground'
            )}
          >
            {connected ? 'OANDA Live' : connected === false ? 'Disconnected' : 'Checking…'}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Account summary bar */}
      {account && (
        <div className="flex items-center gap-4 text-[10px] px-2 py-1.5 rounded-lg bg-muted/10 border border-border/30">
          <span className="text-muted-foreground">Balance:</span>
          <span className="font-mono font-bold text-foreground">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(parseFloat(account.balance))}
          </span>
          <span className="text-muted-foreground ml-2">P&L:</span>
          <span className={cn(
            'font-mono font-bold',
            parseFloat(account.unrealizedPL) >= 0 ? 'text-neural-green' : 'text-neural-red'
          )}>
            {parseFloat(account.unrealizedPL) >= 0 ? '+' : ''}
            {parseFloat(account.unrealizedPL).toFixed(2)}
          </span>
          <span className="text-muted-foreground ml-2">Open:</span>
          <span className="font-mono font-bold text-foreground">{account.openTradeCount}</span>
        </div>
      )}

      {/* Open Positions */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <Wifi className="w-3 h-3" />
          Open Positions ({openTrades.length})
        </p>
        {openTrades.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/60 py-2 text-center">
            No open positions on OANDA practice account.
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {openTrades.map((trade: OandaOpenTrade) => {
              const isLong = parseInt(trade.currentUnits) > 0;
              const pnl = parseFloat(trade.unrealizedPL);
              return (
                <motion.div
                  key={trade.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border/20"
                >
                  <div className="flex items-center gap-2">
                    {isLong ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-neural-green" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-neural-red" />
                    )}
                    <span className="font-mono font-bold text-xs">
                      {trade.instrument.replace('_', '/')}
                    </span>
                    <Badge variant="outline" className={cn(
                      'text-[8px] px-1 py-0',
                      isLong ? 'text-neural-green border-neural-green/30' : 'text-neural-red border-neural-red/30'
                    )}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-muted-foreground font-mono">
                      {Math.abs(parseInt(trade.currentUnits))} units
                    </span>
                    <span className="text-muted-foreground font-mono">
                      @{parseFloat(trade.price).toFixed(5)}
                    </span>
                    <span className={cn(
                      'font-mono font-bold',
                      pnl >= 0 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Executed Orders */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Recent Orders ({orders.length})
        </p>
        {recentOrders.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/60 py-2 text-center">
            No orders executed yet. Enable auto-execution on the OANDA Broker page.
          </p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {recentOrders.map((order: OandaOrder) => {
              const isFilled = order.status === 'filled';
              const isRejected = order.status === 'rejected';
              const isClosed = order.status === 'closed';
              const StatusIcon = isFilled ? CheckCircle2 : isRejected ? XCircle : Clock;
              const statusColor = isFilled ? 'text-neural-green' : isRejected ? 'text-neural-red' : 'text-neural-orange';

              return (
                <div
                  key={order.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20 text-[10px]"
                >
                  <StatusIcon className={cn('w-3 h-3 shrink-0', statusColor)} />
                  {order.direction === 'long' ? (
                    <ArrowUpRight className="w-3 h-3 shrink-0 text-neural-green" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 shrink-0 text-neural-red" />
                  )}
                  <span className="font-mono font-medium w-16 shrink-0">{order.currency_pair}</span>
                  <span className="text-muted-foreground shrink-0">{order.units}u</span>
                  <Badge variant="outline" className={cn('text-[8px] px-1 py-0 shrink-0', statusColor)}>
                    {order.status}
                  </Badge>
                  {order.entry_price && (
                    <span className="font-mono text-muted-foreground">
                      @{Number(order.entry_price).toFixed(5)}
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

      {!connected && connected !== null && (
        <p className="text-[10px] text-neural-orange text-center">
          OANDA is disconnected. Check your API credentials in Cloud secrets.
        </p>
      )}
    </div>
  );
};
