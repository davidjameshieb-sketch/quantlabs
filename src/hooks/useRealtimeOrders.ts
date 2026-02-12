// Realtime subscription hook for oanda_orders
// Provides instant updates when trades open, close, or change status

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RealtimeOrderPayload {
  id: string;
  currency_pair: string;
  direction: string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  units: number;
  slippage_pips: number | null;
  execution_quality_score: number | null;
  fill_latency_ms: number | null;
  error_message: string | null;
}

interface UseRealtimeOrdersOptions {
  onOrderChange?: () => void;
  enableAlerts?: boolean;
}

export function useRealtimeOrders({ onOrderChange, enableAlerts = true }: UseRealtimeOrdersOptions = {}) {
  const onChangeRef = useRef(onOrderChange);
  onChangeRef.current = onOrderChange;

  useEffect(() => {
    const channel = supabase
      .channel('oanda-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'oanda_orders',
        },
        (payload) => {
          const newRecord = payload.new as RealtimeOrderPayload | undefined;
          const oldRecord = payload.old as RealtimeOrderPayload | undefined;

          if (!newRecord) return;

          // Fire data refresh callback
          onChangeRef.current?.();

          if (!enableAlerts) return;

          const pair = newRecord.currency_pair?.replace('_', '/') || 'Unknown';
          const direction = newRecord.direction?.toUpperCase() || '';

          // ─── Execution Quality Alerts ───
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            // Trade filled
            if (newRecord.status === 'filled' && oldRecord?.status !== 'filled') {
              const quality = newRecord.execution_quality_score;
              const latency = newRecord.fill_latency_ms;
              const slippage = newRecord.slippage_pips;

              if (quality != null && quality < 40) {
                toast.warning(`⚠️ Low execution quality on ${pair}`, {
                  description: `Quality: ${quality}/100 | Slippage: ${slippage?.toFixed(2) || '?'}p | Latency: ${latency || '?'}ms`,
                  duration: 8000,
                });
              } else if (slippage != null && slippage > 0.5) {
                toast.warning(`⚠️ High slippage on ${pair}: ${slippage.toFixed(2)} pips`, {
                  description: `Quality: ${quality || '?'}/100 | Latency: ${latency || '?'}ms`,
                  duration: 6000,
                });
              } else {
                toast.success(`✅ ${direction} ${pair} filled`, {
                  description: `${newRecord.units}u @ ${newRecord.entry_price?.toFixed(5) || '?'} | Quality: ${quality || '?'}/100`,
                  duration: 4000,
                });
              }
            }

            // Trade closed by monitor
            if (newRecord.status === 'closed' && oldRecord?.status !== 'closed') {
              const entry = newRecord.entry_price;
              const exit = newRecord.exit_price;
              if (entry != null && exit != null) {
                const pnlPips = newRecord.direction === 'long'
                  ? (exit - entry) * (pair.includes('JPY') ? 100 : 10000)
                  : (entry - exit) * (pair.includes('JPY') ? 100 : 10000);
                const isWin = pnlPips > 0;
                
                if (isWin) {
                  toast.success(`🎯 ${pair} closed +${pnlPips.toFixed(1)}p`, {
                    description: `${direction} ${newRecord.units}u | Entry: ${entry.toFixed(5)} → Exit: ${exit.toFixed(5)}`,
                    duration: 6000,
                  });
                } else {
                  toast.error(`📉 ${pair} closed ${pnlPips.toFixed(1)}p`, {
                    description: `${direction} ${newRecord.units}u | Entry: ${entry.toFixed(5)} → Exit: ${exit.toFixed(5)}`,
                    duration: 6000,
                  });
                }
              }
            }

            // Trade rejected
            if (newRecord.status === 'rejected' && oldRecord?.status !== 'rejected') {
              const errMsg = newRecord.error_message || 'Unknown error';
              const isKillSwitch = errMsg.includes('KILL SWITCH');
              
              if (isKillSwitch) {
                toast.error(`🛑 KILL SWITCH activated`, {
                  description: `Execution halted: ${errMsg}`,
                  duration: 15000,
                });
              } else {
                toast.error(`❌ ${pair} ${direction} rejected`, {
                  description: errMsg,
                  duration: 5000,
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enableAlerts]);
}
