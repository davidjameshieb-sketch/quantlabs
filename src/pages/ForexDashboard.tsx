// Forex Command Center — Trade Book + Archive
// Primary view: Live trade book with per-trade analysis
// Archive: All legacy dashboards

import { useState, useMemo, useEffect } from 'react';
import { LongOnlyFilterProvider } from '@/contexts/LongOnlyFilterContext';
import { motion } from 'framer-motion';
import {
  Globe, TrendingUp, BookOpen, Archive, Brain, HeartPulse, Mic, Eye, Atom, Map,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { LongOnlyBadge } from '@/components/forex/LongOnlyBanner';
import { LazyTabContent } from '@/components/forex/LazyTabContent';
import { LiveTradeBook } from '@/components/forex/LiveTradeBook';
import { ThinkingBrainPanel } from '@/components/forex/ThinkingBrainPanel';
import { TradeHealthPanel } from '@/components/forex/TradeHealthPanel';
import { SystemLearningPanel } from '@/components/forex/SystemLearningPanel';
import { SystemConfidenceMeter } from '@/components/forex/SystemConfidenceMeter';
import { GovernanceStateBanner } from '@/components/forex/GovernanceStateBanner';
import { VoiceChatInterface } from '@/components/chat/VoiceChatInterface';
import { FloorManagerView } from '@/components/forex/floor-manager/FloorManagerView';
import { SingularityDashboard } from '@/components/forex/singularity/SingularityDashboard';
import { SovereignWarMap } from '@/components/forex/singularity/warmap/SovereignWarMap';

// Archive (lazy-loaded legacy dashboards)
import { ForexArchiveDashboards } from '@/components/forex/ForexArchiveDashboards';

import {
  generateForexTrades,
  filterForexTrades,
  computeForexPerformance,
  fetchOandaLivePrices,
  hasLivePrices,
  getLastGovernanceStats,
  computeGovernanceDashboard,
} from '@/lib/forex';
import {
  clearEdgeMemory,
  updateEdgeMemory,
  buildEnvironmentSignature,
  type LearningTradeInput,
} from '@/lib/forex/edgeLearningState';
import { ForexDashboardFilters } from '@/lib/forex/forexTypes';
import { createAgents } from '@/lib/agents/agentEngine';
import { useOandaExecution } from '@/hooks/useOandaExecution';
import { useOandaPerformance } from '@/hooks/useOandaPerformance';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';

const ForexDashboard = () => {
  const [longOnlyFilter, setLongOnlyFilter] = useState(false);
  const [filters, setFilters] = useState<ForexDashboardFilters>({
    period: '30d',
    outcome: 'all',
    regime: 'all',
    pair: 'all',
    agent: 'all',
    era: 'post-direction',
    environment: 'all',
    directionEngine: 'all',
    direction: 'all',
  });

  const [livePricesReady, setLivePricesReady] = useState(hasLivePrices());

  const { connected, account, openTrades, fetchAccountSummary } = useOandaExecution();
  const { metrics: executionMetrics } = useOandaPerformance();
  const tradeAnalytics = useTradeAnalytics(executionMetrics);
  useRealtimeOrders({
    onOrderChange: () => fetchAccountSummary('live'),
    enableAlerts: true,
  });

  const [learningReady, setLearningReady] = useState(false);

  useEffect(() => {
    // STRATEGY RESET: Clear stale learning memory, then rebuild from post-revamp trades
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
    if (postRevamp.length === 0) { setLearningReady(true); return; }

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
    setLearningReady(true);
  }, [executionMetrics]);

  // --- Legacy simulated trades kept ONLY for Archive tab ---
  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents, livePricesReady]);
  const filteredTrades = useMemo(() => filterForexTrades(allTrades, filters), [allTrades, filters]);
  const performance = useMemo(() => computeForexPerformance(filteredTrades), [filteredTrades]);
  const governanceStats = useMemo(() => getLastGovernanceStats(), [allTrades]);

  const governanceDashboard = useMemo(() => {
    const realOrders = executionMetrics?.recentOrders ?? [];
    if (realOrders.length > 0) {
      const orderRecords = realOrders
        .filter(o => o.entry_price != null)
        .map(o => ({
          currency_pair: o.currency_pair,
          direction: o.direction,
          status: o.status === 'closed' || (o.exit_price != null) ? 'closed' : o.status,
          entry_price: o.entry_price,
          exit_price: o.exit_price ?? null,
          execution_quality_score: o.execution_quality_score ?? null,
          slippage_pips: o.slippage_pips ?? null,
          session_label: o.session_label ?? null,
        }));
      return computeGovernanceDashboard(orderRecords);
    }
    return computeGovernanceDashboard([]);
  }, [executionMetrics]);

  return (
    <LongOnlyFilterProvider value={{ longOnlyFilter }}>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Globe className="w-7 h-7 text-primary" />
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                    Forex Command Center
                  </h1>
                  <IntelligenceModeBadge />
                  <LongOnlyBadge />
                </div>
                <p className="text-muted-foreground text-sm">
                  Live trade book — every trade analyzed, scored, and learned from.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span>{tradeAnalytics.totalClosedTrades} live trades · {tradeAnalytics.totalPnlPips >= 0 ? '+' : ''}{tradeAnalytics.totalPnlPips}p net</span>
              </div>
            </div>
          </motion.div>

          {/* Governance State Banner */}
          <GovernanceStateBanner
            state={governanceDashboard.currentState}
            reasons={governanceDashboard.stateReasons}
            promotedPairs={governanceDashboard.promotedPairs}
            restrictedPairs={governanceDashboard.restrictedPairs}
            bannedPairs={governanceDashboard.bannedPairs}
            sessionBudgets={governanceDashboard.sessionBudgets}
          />

          {/* Hero Confidence Meter */}
          <SystemConfidenceMeter
            executionMetrics={executionMetrics}
            connected={connected}
            governanceState={governanceDashboard.currentState}
            totalClosedTrades={(executionMetrics?.winCount ?? 0) + (executionMetrics?.lossCount ?? 0)}
            totalPnlPips={tradeAnalytics.totalPnlPips}
            overallSharpe={tradeAnalytics.overallSharpe}
          />

          {/* 2-Tab Layout: Trade Book + Archive */}
          <Tabs defaultValue="trade-book" className="space-y-4">
            <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
              <TabsTrigger value="trade-book" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <BookOpen className="w-3.5 h-3.5" />Trade Book
              </TabsTrigger>
              <TabsTrigger value="thinking-brain" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Brain className="w-3.5 h-3.5" />Thinking Brain
              </TabsTrigger>
              <TabsTrigger value="trade-health" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <HeartPulse className="w-3.5 h-3.5" />Trade Health
              </TabsTrigger>
              <TabsTrigger value="ai-desk" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Mic className="w-3.5 h-3.5" />AI Desk
              </TabsTrigger>
              <TabsTrigger value="fm-view" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Eye className="w-3.5 h-3.5" />FM View
              </TabsTrigger>
              <TabsTrigger value="singularity" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(var(--neural-cyan))] data-[state=active]:text-primary-foreground">
                <Atom className="w-3.5 h-3.5" />Singularity
              </TabsTrigger>
              <TabsTrigger value="war-map" className="text-xs gap-1.5 data-[state=active]:bg-[hsl(var(--neural-magenta))] data-[state=active]:text-primary-foreground">
                <Map className="w-3.5 h-3.5" />War Map
              </TabsTrigger>
              <TabsTrigger value="archive" className="text-xs gap-1.5 text-muted-foreground">
                <Archive className="w-3.5 h-3.5" />Archive
              </TabsTrigger>
            </TabsList>

            {/* ─── TAB 1: Trade Book ─── */}
            <TabsContent value="trade-book" className="space-y-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <SystemLearningPanel executionMetrics={executionMetrics} learningReady={learningReady} />
                <LiveTradeBook metrics={executionMetrics} />
              </motion.div>
            </TabsContent>

            {/* ─── TAB 2: Thinking Brain ─── */}
            <TabsContent value="thinking-brain" className="space-y-4">
              <LazyTabContent label="Thinking Brain">
                <ThinkingBrainPanel executionMetrics={executionMetrics} />
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 3: Trade Health ─── */}
            <TabsContent value="trade-health" className="space-y-4">
              <LazyTabContent label="Trade Health">
                <TradeHealthPanel metrics={executionMetrics} />
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 4: AI Desk ─── */}
            <TabsContent value="ai-desk" className="space-y-4">
              <LazyTabContent label="AI Desk">
                <div className="h-[calc(100vh-320px)] min-h-[500px]">
                  <VoiceChatInterface className="h-full" />
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 5: FM View ─── */}
            <TabsContent value="fm-view" className="space-y-4">
              <LazyTabContent label="FM View">
                <FloorManagerView
                  openTrades={openTrades?.map(t => ({
                    currency_pair: t.instrument || '',
                    direction: Number(t.currentUnits) > 0 ? 'long' : 'short',
                    trade_health_score: null,
                    mae_r: null,
                    agent_id: null,
                  }))}
                />
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 6: Singularity Command Center ─── */}
            <TabsContent value="singularity" className="space-y-4">
              <LazyTabContent label="Singularity">
                <SingularityDashboard />
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 7: Sovereign War Map ─── */}
            <TabsContent value="war-map" className="space-y-4">
              <LazyTabContent label="War Map">
                <SovereignWarMap />
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 8: Archive (all legacy dashboards) ─── */}
            <TabsContent value="archive" className="space-y-4">
              <LazyTabContent label="Archive">
                <ForexArchiveDashboards
                  allTrades={allTrades}
                  filteredTrades={filteredTrades}
                  filters={filters}
                  setFilters={setFilters}
                  performance={performance}
                  governanceStats={governanceStats}
                  executionMetrics={executionMetrics}
                  tradeAnalytics={tradeAnalytics}
                  longOnlyFilter={longOnlyFilter}
                  onLongOnlyToggle={(enabled: boolean) => {
                    setLongOnlyFilter(enabled);
                    setFilters(prev => ({ ...prev, direction: enabled ? 'long' : 'all' }));
                  }}
                />
              </LazyTabContent>
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </LongOnlyFilterProvider>
  );
};

export default ForexDashboard;
