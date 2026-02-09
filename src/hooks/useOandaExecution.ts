// Hook for OANDA v20 trade execution
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface OandaAccountSummary {
  balance: string;
  unrealizedPL: string;
  pl: string;
  currency: string;
  openTradeCount: number;
  marginUsed: string;
  marginAvailable: string;
  nav: string;
}

export interface OandaOpenTrade {
  id: string;
  instrument: string;
  currentUnits: string;
  price: string;
  unrealizedPL: string;
  state: string;
}

export interface OandaOrder {
  id: string;
  signal_id: string;
  currency_pair: string;
  direction: string;
  units: number;
  entry_price: number | null;
  exit_price: number | null;
  oanda_order_id: string | null;
  oanda_trade_id: string | null;
  status: string;
  error_message: string | null;
  confidence_score: number | null;
  agent_id: string | null;
  environment: string;
  created_at: string;
  closed_at: string | null;
}

type OandaEnvironment = 'practice' | 'live';

export function useOandaExecution() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<OandaAccountSummary | null>(null);
  const [openTrades, setOpenTrades] = useState<OandaOpenTrade[]>([]);
  const [orders, setOrders] = useState<OandaOrder[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);

  const getValidSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;

    // Session expired — attempt automatic refresh
    console.log('[OANDA] Session expired, attempting refresh...');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      console.warn('[OANDA] Session refresh failed:', refreshError?.message);
      return null;
    }
    console.log('[OANDA] Session refreshed successfully');
    return refreshData.session;
  }, []);

  const callOanda = useCallback(async (body: Record<string, unknown>) => {
    const session = await getValidSession();
    if (!session) {
      // Silently skip — don't toast or throw for background fetches
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }, [getValidSession]);

  const fetchAccountSummary = useCallback(async (environment: OandaEnvironment = 'practice') => {
    setLoading(true);
    try {
      const data = await callOanda({ action: 'account-summary', environment });
      if (data.success && data.account) {
        setAccount({
          balance: data.account.balance,
          unrealizedPL: data.account.unrealizedPL,
          pl: data.account.pl,
          currency: data.account.currency,
          openTradeCount: data.account.openTradeCount,
          marginUsed: data.account.marginUsed,
          marginAvailable: data.account.marginAvailable,
          nav: data.account.NAV || data.account.nav,
        });
        setOpenTrades(data.openTrades || []);
        setConnected(true);
      }
    } catch (err) {
      console.error('[OANDA] Account fetch error:', err);
      setConnected(false);
      toast.error('Failed to connect to OANDA: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callOanda]);

  const fetchOrderHistory = useCallback(async (environment: OandaEnvironment = 'practice') => {
    try {
      const data = await callOanda({ action: 'status', environment });
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('[OANDA] Order history error:', err);
    }
  }, [callOanda]);

  const executeTrade = useCallback(async (params: {
    signalId: string;
    currencyPair: string;
    direction: 'long' | 'short';
    units: number;
    confidenceScore?: number;
    agentId?: string;
    environment?: OandaEnvironment;
  }) => {
    setLoading(true);
    try {
      const data = await callOanda({
        action: 'execute',
        ...params,
        environment: params.environment || 'practice',
      });

      if (data.success) {
        toast.success(`Order filled: ${params.direction.toUpperCase()} ${params.units} ${params.currencyPair}`);
        // Refresh data
        await Promise.all([
          fetchAccountSummary(params.environment || 'practice'),
          fetchOrderHistory(params.environment || 'practice'),
        ]);
      }
      return data;
    } catch (err) {
      toast.error('Trade execution failed: ' + (err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [callOanda, fetchAccountSummary, fetchOrderHistory]);

  const closeTrade = useCallback(async (oandaTradeId: string, environment: OandaEnvironment = 'practice') => {
    setLoading(true);
    try {
      const data = await callOanda({ action: 'close', oandaTradeId, environment });
      if (data.success) {
        toast.success(`Trade ${oandaTradeId} closed`);
        await Promise.all([
          fetchAccountSummary(environment),
          fetchOrderHistory(environment),
        ]);
      }
      return data;
    } catch (err) {
      toast.error('Close trade failed: ' + (err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [callOanda, fetchAccountSummary, fetchOrderHistory]);

  return {
    loading,
    connected,
    account,
    openTrades,
    orders,
    fetchAccountSummary,
    fetchOrderHistory,
    executeTrade,
    closeTrade,
  };
}
