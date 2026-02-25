// Live Roster Hook — fetches real-time data for all 20 atlas-hedge strategies
// NO MOCK DATA. All queries filter on oanda_trade_id IS NOT NULL (real OANDA fills only).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentRosterEntry {
  agentId: string;
  label: string;
  type: 'MOM' | 'CTR';
  isActive: boolean;
  predatorRank: number;
  preyRank: number;
  slPips: number;
  tpRatio: number;
  // Live data
  dailyPnl: number;
  totalTrades: number;
  todayTrades: number;
  status: 'ACTIVE' | 'PENDING_LIMIT' | 'DORMANT';
  currentPair: string | null;
  currentDirection: string | null;
  // Live trade details
  entryPrice: number | null;
  units: number | null;
  tradeOpenedAt: string | null;
  oandaTradeId: string | null;
  tradeStatus: string | null; // 'filled' | 'open' | 'submitted'
  requestedPrice: number | null;
  // Auto-scaler
  scalerMultiplier: number; // 1.0 or 0.8
  isScaledDown: boolean;
  lastThreeResults: number[]; // pips of last 3 closed trades
}

export interface RosterData {
  agents: AgentRosterEntry[];
  autoScalerEnabled: boolean;
  loading: boolean;
  error: string | null;
}

function computePips(trade: any): number {
  const isJPY = trade.currency_pair?.includes('JPY');
  const mult = isJPY ? 100 : 10000;
  return trade.direction === 'long'
    ? ((trade.exit_price || 0) - (trade.entry_price || 0)) * mult
    : ((trade.entry_price || 0) - (trade.exit_price || 0)) * mult;
}

export function useLiveRoster() {
  const [data, setData] = useState<RosterData>({
    agents: [],
    autoScalerEnabled: true,
    loading: true,
    error: null,
  });

  const fetchRoster = useCallback(async () => {
    try {
      // Parallel fetches
      const [agentsRes, settingsRes, openTradesRes, closedTodayRes, last3Res] = await Promise.all([
        // 1. All atlas-hedge agent configs
        supabase
          .from('agent_configs')
          .select('agent_id, config, is_active')
          .like('agent_id', 'atlas-hedge-%')
          .order('agent_id'),

        // 2. Auto-scaler setting
        supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'auto_scaler_enabled')
          .single(),

        // 3. Currently open/pending trades (includes limit orders awaiting fill)
        supabase
          .from('oanda_orders')
          .select('agent_id, currency_pair, direction, oanda_trade_id, entry_price, units, created_at, status, requested_price')
          .like('agent_id', 'atlas-hedge-%')
          .in('status', ['filled', 'open', 'submitted'])
          .is('closed_at', null)
          .eq('baseline_excluded', false),

        // 4. Closed trades today (real fills only)
        supabase
          .from('oanda_orders')
          .select('agent_id, currency_pair, direction, entry_price, exit_price, oanda_trade_id')
          .like('agent_id', 'atlas-hedge-%')
          .eq('status', 'closed')
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .not('oanda_trade_id', 'is', null)
          .eq('baseline_excluded', false)
          .gte('closed_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

        // 5. Last 3 closed trades per agent (for scaler calculation)
        supabase
          .from('oanda_orders')
          .select('agent_id, currency_pair, direction, entry_price, exit_price, oanda_trade_id, closed_at')
          .like('agent_id', 'atlas-hedge-%')
          .eq('status', 'closed')
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .not('oanda_trade_id', 'is', null)
          .eq('baseline_excluded', false)
          .order('closed_at', { ascending: false })
          .limit(200), // Get enough to find last 3 per agent
      ]);

      const agents = agentsRes.data || [];
      const autoScalerEnabled = (settingsRes.data?.value as any)?.enabled ?? true;
      const openTrades = openTradesRes.data || [];
      const closedToday = closedTodayRes.data || [];
      const allClosed = last3Res.data || [];

      // Build maps
      const openByAgent = new Map<string, any>();
      openTrades.forEach(t => {
        if (!openByAgent.has(t.agent_id)) openByAgent.set(t.agent_id, t);
      });

      const dailyPnlByAgent = new Map<string, { pnl: number; count: number }>();
      closedToday.forEach(t => {
        const aid = t.agent_id || '';
        if (!dailyPnlByAgent.has(aid)) dailyPnlByAgent.set(aid, { pnl: 0, count: 0 });
        const entry = dailyPnlByAgent.get(aid)!;
        entry.pnl += computePips(t);
        entry.count++;
      });

      // Last 3 closed per agent
      const last3ByAgent = new Map<string, number[]>();
      allClosed.forEach(t => {
        const aid = t.agent_id || '';
        if (!last3ByAgent.has(aid)) last3ByAgent.set(aid, []);
        const arr = last3ByAgent.get(aid)!;
        if (arr.length < 3) arr.push(computePips(t));
      });

      const roster: AgentRosterEntry[] = agents.map(agent => {
        const cfg = (agent.config || {}) as any;
        const isMom = agent.agent_id.startsWith('atlas-hedge-m');
        const openTrade = openByAgent.get(agent.agent_id);
        const daily = dailyPnlByAgent.get(agent.agent_id);
        const last3 = last3ByAgent.get(agent.agent_id) || [];

        // Scaler: if last 3 are ALL negative → 0.8x
        const allNegative = last3.length >= 3 && last3.every(p => p < 0);
        // Reset if last trade positive
        const lastPositive = last3.length > 0 && last3[0] > 0;
        const isScaledDown = autoScalerEnabled && allNegative && !lastPositive;

        const isFilled = openTrade?.status === 'filled' && openTrade?.oanda_trade_id;
        const isPendingLimit = openTrade && !isFilled; // status='open'/'submitted' or no oanda_trade_id yet

        return {
          agentId: agent.agent_id,
          label: `#${cfg.predatorRank || '?'} vs #${cfg.preyRank || '?'}`,
          type: isMom ? 'MOM' : 'CTR',
          isActive: agent.is_active ?? false,
          predatorRank: cfg.predatorRank || 0,
          preyRank: cfg.preyRank || 0,
          slPips: cfg.slPips || 25,
          tpRatio: cfg.tpRatio || 2.0,
          dailyPnl: daily?.pnl ?? 0,
          totalTrades: daily?.count ?? 0,
          todayTrades: daily?.count ?? 0,
          status: isFilled ? 'ACTIVE' : isPendingLimit ? 'PENDING_LIMIT' : 'DORMANT',
          currentPair: openTrade?.currency_pair?.replace('_', '/') || null,
          currentDirection: openTrade?.direction || null,
          entryPrice: openTrade?.entry_price ?? null,
          units: openTrade?.units ?? null,
          tradeOpenedAt: openTrade?.created_at ?? null,
          oandaTradeId: openTrade?.oanda_trade_id ?? null,
          tradeStatus: openTrade?.status ?? null,
          requestedPrice: openTrade?.requested_price ?? null,
          scalerMultiplier: isScaledDown ? 0.8 : 1.0,
          isScaledDown,
          lastThreeResults: last3,
        };
      });

      setData({
        agents: roster,
        autoScalerEnabled,
        loading: false,
        error: null,
      });
    } catch (err) {
      setData(prev => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, []);

  const toggleAutoScaler = useCallback(async (enabled: boolean) => {
    const { error } = await supabase
      .from('system_settings')
      .update({ value: { enabled } as any, updated_at: new Date().toISOString() })
      .eq('key', 'auto_scaler_enabled');

    if (error) throw error;
    setData(prev => ({ ...prev, autoScalerEnabled: enabled }));
  }, []);

  useEffect(() => {
    fetchRoster();
    const interval = setInterval(fetchRoster, 30_000);

    const channel = supabase
      .channel('roster-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, () => fetchRoster())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => fetchRoster())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchRoster]);

  return { ...data, refetch: fetchRoster, toggleAutoScaler };
}
