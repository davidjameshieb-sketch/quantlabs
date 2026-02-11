// Forex Command Center — Consolidated live trading dashboard
// 4 tabs: Command Center, Performance, Governance, Archive

import { useState, useMemo, useEffect, useCallback } from 'react';
import { LongOnlyFilterProvider } from '@/contexts/LongOnlyFilterContext';
import { motion } from 'framer-motion';
import {
  Globe, TrendingUp, Shield, BarChart3, ChevronDown,
  Zap, PieChart, Activity,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { LongOnlyBadge } from '@/components/forex/LongOnlyBanner';
import { LazyTabContent } from '@/components/forex/LazyTabContent';

// Command Center components
import { ExecutionProofPanel } from '@/components/forex/ExecutionProofPanel';
import { LiveEdgeExecutionDashboard } from '@/components/forex/LiveEdgeExecutionDashboard';
import { LiveForexTradesPanel } from '@/components/forex/LiveForexTradesPanel';
import { LiveExecutionHero } from '@/components/forex/LiveExecutionHero';
import { GovernanceStateBanner } from '@/components/forex/GovernanceStateBanner';

// Performance components
import { EquityCurveChart } from '@/components/forex/EquityCurveChart';
import { AgentAccountabilityPanel } from '@/components/forex/AgentAccountabilityPanel';
import { SessionHeatmap } from '@/components/forex/SessionHeatmap';
import { PairPnLBreakdown } from '@/components/forex/PairPnLBreakdown';
import { RollingSharpeChart } from '@/components/forex/RollingSharpeChart';
import { ForexPerformanceOverview } from '@/components/forex/ForexPerformanceOverview';
import { ForexTradeHistoryTable } from '@/components/forex/ForexTradeHistoryTable';

// Governance components
import { AdaptiveGovernancePanel } from '@/components/forex/AdaptiveGovernancePanel';
import { GovernanceHealthDashboard } from '@/components/forex/GovernanceHealthDashboard';
import { LongOnlySettingsPanel } from '@/components/forex/LongOnlySettingsPanel';

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

  useEffect(() => {
    fetchOandaLivePrices().then(() => setLivePricesReady(true));
    fetchAccountSummary('live');
  }, [fetchAccountSummary]);

  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents, livePricesReady]);
  const filteredTrades = useMemo(() => filterForexTrades(allTrades, filters), [allTrades, filters]);
  const performance = useMemo(() => computeForexPerformance(filteredTrades), [filteredTrades]);
  const governanceStats = useMemo(() => getLastGovernanceStats(), [allTrades]);

  const governanceDashboard = useMemo(() => {
    const orderRecords = filteredTrades
      .filter(t => t.outcome !== 'avoided')
      .map(t => ({
        currency_pair: t.currencyPair.replace('/', '_'),
        direction: t.direction,
        status: t.outcome === 'win' || t.outcome === 'loss' ? 'closed' : 'filled',
        entry_price: t.entryPrice,
        exit_price: t.exitPrice ?? null,
        execution_quality_score: Math.round(t.captureRatio * 100),
        slippage_pips: t.frictionCost * 10000,
        session_label: null,
      }));
    return computeGovernanceDashboard(orderRecords);
  }, [filteredTrades]);

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
                  Live execution intelligence — indicator-confirmed, coalition-governed, safety-gated.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span>{tradeAnalytics.totalClosedTrades} closed trades · {tradeAnalytics.totalPnlPips >= 0 ? '+' : ''}{tradeAnalytics.totalPnlPips}p net</span>
              </div>
            </div>
          </motion.div>

          {/* Governance State Banner — always visible */}
          <GovernanceStateBanner
            state={governanceDashboard.currentState}
            reasons={governanceDashboard.stateReasons}
            promotedPairs={governanceDashboard.promotedPairs}
            restrictedPairs={governanceDashboard.restrictedPairs}
            bannedPairs={governanceDashboard.bannedPairs}
            sessionBudgets={governanceDashboard.sessionBudgets}
          />

          {/* 4-Tab Layout */}
          <Tabs defaultValue="command-center" className="space-y-4">
            <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
              <TabsTrigger value="command-center" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Zap className="w-3.5 h-3.5" />Command Center
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <BarChart3 className="w-3.5 h-3.5" />Performance
              </TabsTrigger>
              <TabsTrigger value="governance" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Shield className="w-3.5 h-3.5" />Governance
              </TabsTrigger>
              <TabsTrigger value="archive" className="text-xs gap-1.5 text-muted-foreground">
                <ChevronDown className="w-3.5 h-3.5" />Archive
              </TabsTrigger>
            </TabsList>

            {/* ─── TAB 1: Command Center ─── */}
            <TabsContent value="command-center" className="space-y-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Live Execution Hero */}
                <LiveExecutionHero
                  account={account}
                  connected={connected}
                  openTradeCount={openTrades.length}
                  executionMetrics={executionMetrics}
                />

                {/* Execution Proof — Integrity verification */}
                <ExecutionProofPanel />

                {/* Live Trades — Open positions & recent orders */}
                <LiveForexTradesPanel />

                {/* Live Edge Execution — Dual-edge decisions */}
                <LiveEdgeExecutionDashboard />
              </motion.div>
            </TabsContent>

            {/* ─── TAB 2: Performance ─── */}
            <TabsContent value="performance" className="space-y-4">
              <LazyTabContent label="Performance">
                <div className="space-y-4">
                  {/* Equity Curve */}
                  <EquityCurveChart
                    data={tradeAnalytics.rollingSharpe}
                    totalPnlPips={tradeAnalytics.totalPnlPips}
                    totalTrades={tradeAnalytics.totalClosedTrades}
                  />

                  {/* Performance Overview */}
                  <ForexPerformanceOverview
                    metrics={performance}
                    governanceStats={governanceStats}
                    trades={filteredTrades}
                  />

                  {/* Agent Accountability */}
                  <AgentAccountabilityPanel metrics={executionMetrics} />

                  {/* Rolling Sharpe */}
                  <RollingSharpeChart
                    data={tradeAnalytics.rollingSharpe}
                    overallSharpe={tradeAnalytics.overallSharpe}
                  />

                  {/* Session Heatmap & Pair P&L */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SessionHeatmap sessions={tradeAnalytics.sessionAnalytics} />
                    <PairPnLBreakdown pairs={tradeAnalytics.pairAnalytics} />
                  </div>

                  {/* Trade History Table */}
                  <ForexTradeHistoryTable trades={filteredTrades} />
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 3: Governance ─── */}
            <TabsContent value="governance" className="space-y-4">
              <LazyTabContent label="Governance">
                <div className="space-y-4">
                  <LongOnlySettingsPanel />
                  <AdaptiveGovernancePanel data={governanceDashboard} />
                  <GovernanceHealthDashboard trades={filteredTrades} />
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 4: Archive ─── */}
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
