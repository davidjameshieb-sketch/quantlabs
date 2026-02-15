// Forex War Room — Sovereign Barrage Protocol Command Center
// Two tabs: War Room + AI Floor Manager

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, TrendingUp, Mic, Swords, Brain, Terminal, Radar } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { WarRoomDashboard } from '@/components/forex/warroom/WarRoomDashboard';
import { VoiceChatInterface } from '@/components/chat/VoiceChatInterface';
import { SovereignIntelligencePanel } from '@/components/forex/warroom/SovereignIntelligencePanel';
import { SovereignTerminal } from '@/components/forex/warroom/SovereignTerminal';
import { StrategyWorldDashboard } from '@/components/forex/intelligence/StrategyWorldDashboard';

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

        {/* Tabs: War Room + AI Floor Manager */}
        <Tabs defaultValue="war-room" className="space-y-4">
          <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
            <TabsTrigger value="war-room" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Swords className="w-3.5 h-3.5" />War Room
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Brain className="w-3.5 h-3.5" />Sovereign Intelligence
            </TabsTrigger>
            <TabsTrigger value="ai-desk" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Mic className="w-3.5 h-3.5" />AI Floor Manager
            </TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Terminal className="w-3.5 h-3.5" />Sovereign Terminal
            </TabsTrigger>
            <TabsTrigger value="strategy-world" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Radar className="w-3.5 h-3.5" />Strategy World
            </TabsTrigger>
          </TabsList>

          <TabsContent value="war-room" className="space-y-4">
            <WarRoomDashboard
              account={account}
              executionMetrics={executionMetrics}
              tradeAnalytics={tradeAnalytics}
              connected={connected}
            />
          </TabsContent>

          <TabsContent value="intelligence" className="space-y-4">
            <SovereignIntelligencePanel />
          </TabsContent>

          <TabsContent value="ai-desk" className="space-y-4">
            <div className="h-[calc(100vh-280px)] min-h-[500px]">
              <VoiceChatInterface className="h-full" />
            </div>
          </TabsContent>

          <TabsContent value="terminal" className="space-y-4">
            <SovereignTerminal />
          </TabsContent>

          <TabsContent value="strategy-world" className="space-y-4">
            <StrategyWorldDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ForexDashboard;
