// Forex War Room — Sovereign Barrage Protocol Command Center
// Single-view predatory dashboard tracking the path to $500

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { WarRoomDashboard } from '@/components/forex/warroom/WarRoomDashboard';

import { fetchOandaLivePrices, hasLivePrices } from '@/lib/forex';
import {
  clearEdgeMemory,
  updateEdgeMemory,
  buildEnvironmentSignature,
  type LearningTradeInput,
} from '@/lib/forex/edgeLearningState';
import { useOandaExecution } from '@/hooks/useOandaExecution';
import { useOandaPerformance } from '@/hooks/useOandaPerformance';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';

const ForexDashboard = () => {
  const [livePricesReady, setLivePricesReady] = useState(hasLivePrices());

  const { connected, account, openTrades, fetchAccountSummary } = useOandaExecution();
  const { metrics: executionMetrics } = useOandaPerformance();
  const tradeAnalytics = useTradeAnalytics(executionMetrics);
  useRealtimeOrders({
    onOrderChange: () => fetchAccountSummary('live'),
    enableAlerts: true,
  });

  useEffect(() => {
    try {
      localStorage.removeItem('quantlabs_edge_learning_memory');
      localStorage.removeItem('quantlabs_indicator_learning');
      localStorage.removeItem('quantlabs_learning_state');
    } catch { /* ignore */ }
    clearEdgeMemory();
    fetchOandaLivePrices().then(() => setLivePricesReady(true));
    fetchAccountSummary('live');
  }, [fetchAccountSummary]);

  // Rebuild learning memory from post-revamp real trades
  useEffect(() => {
    if (!executionMetrics?.recentOrders) return;
    const CUTOFF = new Date('2026-02-13T00:00:00Z').getTime();
    const postRevamp = executionMetrics.recentOrders.filter(o =>
      new Date(o.created_at).getTime() >= CUTOFF &&
      (o.status === 'filled' || o.status === 'closed') &&
      o.entry_price != null && o.exit_price != null
    );
    if (postRevamp.length === 0) return;

    const JPY = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
    const inputs: LearningTradeInput[] = postRevamp.map(o => {
      const mult = JPY.includes(o.currency_pair) ? 100 : 10000;
      const pnl = o.direction === 'long'
        ? (o.exit_price! - o.entry_price!) * mult
        : (o.entry_price! - o.exit_price!) * mult;
      const sig = buildEnvironmentSignature(
        o.session_label || 'unknown',
        o.regime_label || 'unknown',
        o.currency_pair,
        o.direction,
        o.agent_id || undefined,
      );
      return {
        environmentSignature: sig,
        pnlPips: Math.round(pnl * 10) / 10,
        session: o.session_label || 'unknown',
        regime: o.regime_label || 'unknown',
        compositeScore: o.confidence_score ?? 0.5,
        timestamp: new Date(o.created_at).getTime(),
      };
    });

    clearEdgeMemory();
    updateEdgeMemory(inputs);
  }, [executionMetrics]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Globe className="w-7 h-7 text-primary" />
                <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                  Sovereign War Room
                </h1>
                <IntelligenceModeBadge />
              </div>
              <p className="text-muted-foreground text-sm">
                Barrage Protocol active — hunting $500 NAV target.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span>{tradeAnalytics.totalClosedTrades} trades · {tradeAnalytics.totalPnlPips >= 0 ? '+' : ''}{tradeAnalytics.totalPnlPips.toFixed(1)}p net</span>
            </div>
          </div>
        </motion.div>

        {/* War Room — 6 panels */}
        <WarRoomDashboard
          account={account}
          executionMetrics={executionMetrics}
          tradeAnalytics={tradeAnalytics}
          connected={connected}
        />
      </div>
    </DashboardLayout>
  );
};

export default ForexDashboard;
