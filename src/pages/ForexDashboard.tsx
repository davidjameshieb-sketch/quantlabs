// Forex War Room — Sovereign Barrage Protocol Command Center
// Single-view predatory dashboard tracking the path to $500

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, TrendingUp, MessageSquare, X } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { WarRoomDashboard } from '@/components/forex/warroom/WarRoomDashboard';
import { VoiceChatInterface } from '@/components/chat/VoiceChatInterface';

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
  const [chatOpen, setChatOpen] = useState(false);
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

        {/* Floating AI Desk */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="fixed bottom-20 right-6 z-50 w-[420px] h-[560px] rounded-xl border border-border/50 bg-card/95 backdrop-blur-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/40">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">AI Floor Manager</span>
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <VoiceChatInterface className="h-[calc(100%-40px)]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB */}
        <button
          onClick={() => setChatOpen(prev => !prev)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        >
          {chatOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>
    </DashboardLayout>
  );
};

export default ForexDashboard;
