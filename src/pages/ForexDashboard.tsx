// Forex Trade Intelligence Dashboard
// Isolated forex-only trade performance tracking & analysis

import { useState, useMemo, useEffect, useCallback } from 'react';
import { LongOnlyFilterProvider } from '@/contexts/LongOnlyFilterContext';
import { motion } from 'framer-motion';
import { Globe, TrendingUp, Crosshair, BarChart3, FlaskConical, ShieldCheck, SplitSquareHorizontal, PieChart, Shield, HeartPulse, Radar, Filter, Rocket, ShieldAlert, Brain, GitBranch, UserX, Wrench, Target, Beaker, Crown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ForexPerformanceOverview } from '@/components/forex/ForexPerformanceOverview';
import { ForexTradeHistoryTable } from '@/components/forex/ForexTradeHistoryTable';
import { ForexQualityPanel, ForexRiskGovernancePanel } from '@/components/forex/ForexQualityAndRisk';
import { CrossAssetInfluencePanel, ForexRegimeTimeline } from '@/components/forex/ForexCrossAssetAndRegime';
import { ForexExecutionStatus } from '@/components/forex/ForexExecutionStatus';
import { ForexFilterBar } from '@/components/forex/ForexFilterBar';
import { LiveForexTradesPanel } from '@/components/forex/LiveForexTradesPanel';
import { LiveExecutionHero } from '@/components/forex/LiveExecutionHero';
import { ForexScalpingIntelligence } from '@/components/forex/ForexScalpingIntelligence';
import { ScalpingTradesDashboard } from '@/components/forex/ScalpingTradesDashboard';
import { PerformanceReanalysisDashboard } from '@/components/forex/PerformanceReanalysisDashboard';
import { DailyAuditPanel } from '@/components/forex/DailyAuditPanel';
import { ScalpVsSwingView } from '@/components/forex/ScalpVsSwingView';
import { PairPnLBreakdown } from '@/components/forex/PairPnLBreakdown';
import { SessionHeatmap } from '@/components/forex/SessionHeatmap';
import { RollingSharpeChart } from '@/components/forex/RollingSharpeChart';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { GovernanceStateBanner } from '@/components/forex/GovernanceStateBanner';
import { LongOnlyBanner, LongOnlyBadge } from '@/components/forex/LongOnlyBanner';
import { LongOnlySettingsPanel } from '@/components/forex/LongOnlySettingsPanel';
import { AdaptiveGovernancePanel } from '@/components/forex/AdaptiveGovernancePanel';
import { ShadowModePanel } from '@/components/forex/ShadowModePanel';
import { EquityCurveChart } from '@/components/forex/EquityCurveChart';
import { AgentAccountabilityPanel } from '@/components/forex/AgentAccountabilityPanel';
import { GovernanceHealthDashboard } from '@/components/forex/GovernanceHealthDashboard';
import { EdgeDiscoveryDashboard } from '@/components/forex/edge-discovery/EdgeDiscoveryDashboard';
import { EdgeExtractionDashboard } from '@/components/forex/edge-extraction/EdgeExtractionDashboard';
import { EdgeGoLivePanel } from '@/components/forex/edge-discovery/EdgeGoLivePanel';
import { DiscoveryRiskPanel } from '@/components/forex/DiscoveryRiskPanel';
import { AdaptiveEdgeDashboard } from '@/components/forex/AdaptiveEdgeDashboard';
import { AgentWeightingTable } from '@/components/forex/AgentWeightingTable';
import { AgentPriorityReasoningPanel } from '@/components/forex/AgentPriorityReasoningPanel';
import { AgentCollaborationDashboard } from '@/components/forex/AgentCollaborationDashboard';
import { EnsembleHealthDashboard } from '@/components/forex/EnsembleHealthDashboard';
import { BaselineVsEnsembleCard } from '@/components/forex/BaselineVsEnsembleCard';
import { AgentExclusionSimulator } from '@/components/forex/AgentExclusionSimulator';
import { AgentOptimizationDashboard } from '@/components/forex/AgentOptimizationDashboard';
import { FocusPairsEdgeDashboard } from '@/components/forex/FocusPairsEdgeDashboard';
import { EdgeGovernanceSimulatorDashboard } from '@/components/forex/EdgeGovernanceSimulator';
import { AgentLiveOptimizationDashboard } from '@/components/forex/AgentLiveOptimizationDashboard';
import { LazyTabContent } from '@/components/forex/LazyTabContent';
import {
  generateForexTrades,
  filterForexTrades,
  computeForexPerformance,
  computeForexQuality,
  computeForexRiskGovernance,
  computeCrossAssetInfluence,
  fetchOandaLivePrices,
  hasLivePrices,
  getLastGovernanceStats,
  getLastGovernanceResults,
  computeRollingHealth,
  computeShadowModeState,
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

  const handleLongOnlyFilterToggle = useCallback((enabled: boolean) => {
    setLongOnlyFilter(enabled);
    setFilters(prev => ({ ...prev, direction: enabled ? 'long' : 'all' }));
  }, []);

  const [livePricesReady, setLivePricesReady] = useState(hasLivePrices());

  // Real OANDA data hooks
  const { connected, account, openTrades, fetchAccountSummary } = useOandaExecution();
  const { metrics: executionMetrics } = useOandaPerformance();
  const tradeAnalytics = useTradeAnalytics(executionMetrics);
  useRealtimeOrders({
    onOrderChange: () => fetchAccountSummary('practice'),
    enableAlerts: true,
  });

  useEffect(() => {
    fetchOandaLivePrices().then(() => {
      setLivePricesReady(true);
    });
    fetchAccountSummary('practice');
  }, [fetchAccountSummary]);

  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents, livePricesReady]);
  const filteredTrades = useMemo(() => filterForexTrades(allTrades, filters), [allTrades, filters]);

  const performance = useMemo(() => computeForexPerformance(filteredTrades), [filteredTrades]);
  const governanceStats = useMemo(() => getLastGovernanceStats(), [allTrades]);
  const governanceResults = useMemo(() => getLastGovernanceResults(), [allTrades]);
  const quality = useMemo(() => computeForexQuality(filteredTrades), [filteredTrades]);
  const risk = useMemo(() => computeForexRiskGovernance(filteredTrades), [filteredTrades]);
  const influence = useMemo(() => computeCrossAssetInfluence(), []);
  const rollingHealth = useMemo(() => computeRollingHealth(allTrades), [allTrades]);
  const shadowMode = useMemo(() => computeShadowModeState(allTrades), [allTrades]);

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
                  Forex Trade Intelligence
                </h1>
                <IntelligenceModeBadge />
                <LongOnlyBadge />
              </div>
              <p className="text-muted-foreground text-sm">
                Isolated forex-only performance tracking — OANDA-aligned execution intelligence.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-neural-green" />
              <span>{allTrades.length} total forex signals</span>
            </div>
          </div>
        </motion.div>

        {/* Master Tabs */}
        <Tabs defaultValue="focus-pairs" className="space-y-4">
          <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
            <TabsTrigger value="focus-pairs" className="text-xs gap-1.5"><Target className="w-3.5 h-3.5" />Focus Pairs</TabsTrigger>
            <TabsTrigger value="performance" className="text-xs gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Performance</TabsTrigger>
            <TabsTrigger value="scalp-vs-swing" className="text-xs gap-1.5"><SplitSquareHorizontal className="w-3.5 h-3.5" />Scalp vs Swing</TabsTrigger>
            <TabsTrigger value="scalping-trades" className="text-xs gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Scalping Trades</TabsTrigger>
            <TabsTrigger value="scalping" className="text-xs gap-1.5"><Crosshair className="w-3.5 h-3.5" />Scalping Intelligence</TabsTrigger>
            <TabsTrigger value="reanalysis" className="text-xs gap-1.5"><FlaskConical className="w-3.5 h-3.5" />Reanalysis</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Daily Audit</TabsTrigger>
            <TabsTrigger value="governance" className="text-xs gap-1.5"><Shield className="w-3.5 h-3.5" />Governance</TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs gap-1.5"><PieChart className="w-3.5 h-3.5" />Deep Analytics</TabsTrigger>
            <TabsTrigger value="health" className="text-xs gap-1.5"><HeartPulse className="w-3.5 h-3.5" />Health</TabsTrigger>
            <TabsTrigger value="edge-discovery" className="text-xs gap-1.5"><Radar className="w-3.5 h-3.5" />Edge Discovery</TabsTrigger>
            <TabsTrigger value="edge-extraction" className="text-xs gap-1.5"><Filter className="w-3.5 h-3.5" />Edge Extraction</TabsTrigger>
            <TabsTrigger value="edge-golive" className="text-xs gap-1.5"><Rocket className="w-3.5 h-3.5" />Go-Live</TabsTrigger>
            <TabsTrigger value="discovery-risk" className="text-xs gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />Discovery Risk</TabsTrigger>
            <TabsTrigger value="adaptive-edge" className="text-xs gap-1.5"><Brain className="w-3.5 h-3.5" />Adaptive Edge</TabsTrigger>
            <TabsTrigger value="collaboration" className="text-xs gap-1.5"><GitBranch className="w-3.5 h-3.5" />Collaboration</TabsTrigger>
            <TabsTrigger value="ensemble" className="text-xs gap-1.5"><HeartPulse className="w-3.5 h-3.5" />Ensemble</TabsTrigger>
            <TabsTrigger value="agent-simulator" className="text-xs gap-1.5"><UserX className="w-3.5 h-3.5" />Agent Simulator</TabsTrigger>
            <TabsTrigger value="agent-optimization" className="text-xs gap-1.5"><Wrench className="w-3.5 h-3.5" />Agent Optimization</TabsTrigger>
            <TabsTrigger value="agent-live-opt" className="text-xs gap-1.5"><Crown className="w-3.5 h-3.5" />Agent Live Opt</TabsTrigger>
            <TabsTrigger value="edge-sim" className="text-xs gap-1.5"><Beaker className="w-3.5 h-3.5" />Edge Simulator</TabsTrigger>
          </TabsList>

          {/* Focus Pairs — loads immediately */}
          <TabsContent value="focus-pairs" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <FocusPairsEdgeDashboard />
            </motion.div>
          </TabsContent>

          {/* All other tabs — click "Load" to render */}
          <TabsContent value="performance" className="space-y-6">
            <LazyTabContent label="Performance">
              <LongOnlyBanner longOnlyFilter={longOnlyFilter} onToggleFilter={handleLongOnlyFilterToggle} />
              <GovernanceStateBanner state={governanceDashboard.currentState} reasons={governanceDashboard.stateReasons} promotedPairs={governanceDashboard.promotedPairs} restrictedPairs={governanceDashboard.restrictedPairs} bannedPairs={governanceDashboard.bannedPairs} sessionBudgets={governanceDashboard.sessionBudgets} />
              <LiveExecutionHero account={account} connected={connected} openTradeCount={openTrades.length} executionMetrics={executionMetrics} />
              <ForexFilterBar filters={filters} onFiltersChange={setFilters} totalCount={allTrades.length} filteredCount={filteredTrades.length} />
              <ForexPerformanceOverview metrics={performance} governanceStats={governanceStats} trades={filteredTrades} />
              <LiveForexTradesPanel />
              <ForexExecutionStatus trades={filteredTrades} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ForexQualityPanel quality={quality} />
                <ForexRiskGovernancePanel risk={risk} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ForexRegimeTimeline trades={filteredTrades} />
                <CrossAssetInfluencePanel influence={influence} />
              </div>
              <ForexTradeHistoryTable trades={filteredTrades} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="scalp-vs-swing" className="space-y-4">
            <LazyTabContent label="Scalp vs Swing">
              <ScalpVsSwingView trades={filteredTrades} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="scalping-trades" className="space-y-4">
            <LazyTabContent label="Scalping Trades">
              <ScalpingTradesDashboard trades={filteredTrades} performance={performance} governanceStats={governanceStats} governanceResults={governanceResults} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="scalping" className="space-y-4">
            <LazyTabContent label="Scalping Intelligence">
              <ForexScalpingIntelligence />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="reanalysis" className="space-y-4">
            <LazyTabContent label="Reanalysis">
              <PerformanceReanalysisDashboard trades={filteredTrades} performance={performance} governanceStats={governanceStats} governanceResults={governanceResults} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <LazyTabContent label="Daily Audit">
              <DailyAuditPanel trades={filteredTrades} performance={performance} rollingHealth={rollingHealth} shadowMode={shadowMode} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="governance" className="space-y-4">
            <LazyTabContent label="Governance">
              <LongOnlySettingsPanel />
              <AdaptiveGovernancePanel data={governanceDashboard} />
              <ShadowModePanel state={shadowMode} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <LazyTabContent label="Deep Analytics">
              <div className="flex items-center gap-2 mb-1">
                <PieChart className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-display font-bold">Deep Trade Analytics</h2>
                <span className="text-[9px] text-muted-foreground">
                  {tradeAnalytics.totalClosedTrades} closed trades · {tradeAnalytics.totalPnlPips >= 0 ? '+' : ''}{tradeAnalytics.totalPnlPips}p net
                </span>
              </div>
              <EquityCurveChart data={tradeAnalytics.rollingSharpe} totalPnlPips={tradeAnalytics.totalPnlPips} totalTrades={tradeAnalytics.totalClosedTrades} />
              <AgentAccountabilityPanel metrics={executionMetrics} />
              <RollingSharpeChart data={tradeAnalytics.rollingSharpe} overallSharpe={tradeAnalytics.overallSharpe} />
              <SessionHeatmap sessions={tradeAnalytics.sessionAnalytics} />
              <PairPnLBreakdown pairs={tradeAnalytics.pairAnalytics} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <LazyTabContent label="Health">
              <GovernanceHealthDashboard trades={filteredTrades} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="edge-discovery" className="space-y-4">
            <LazyTabContent label="Edge Discovery">
              <EdgeDiscoveryDashboard />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="edge-extraction" className="space-y-4">
            <LazyTabContent label="Edge Extraction">
              <EdgeExtractionDashboard />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="edge-golive" className="space-y-4">
            <LazyTabContent label="Go-Live">
              <EdgeGoLivePanel />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="discovery-risk" className="space-y-4">
            <LazyTabContent label="Discovery Risk">
              <DiscoveryRiskPanel trades={filteredTrades} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="adaptive-edge" className="space-y-4">
            <LazyTabContent label="Adaptive Edge">
              <AdaptiveEdgeDashboard trades={filteredTrades} />
              <AgentWeightingTable />
              <AgentPriorityReasoningPanel />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="collaboration" className="space-y-4">
            <LazyTabContent label="Collaboration">
              <AgentCollaborationDashboard />
              <BaselineVsEnsembleCard mode="full" />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="ensemble" className="space-y-4">
            <LazyTabContent label="Ensemble">
              <BaselineVsEnsembleCard />
              <EnsembleHealthDashboard />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="agent-simulator" className="space-y-4">
            <LazyTabContent label="Agent Simulator">
              <AgentExclusionSimulator longOnlyFilter={longOnlyFilter} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="agent-optimization" className="space-y-4">
            <LazyTabContent label="Agent Optimization">
              <AgentOptimizationDashboard longOnlyFilter={longOnlyFilter} />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="agent-live-opt" className="space-y-4">
            <LazyTabContent label="Agent Live Optimization">
              <AgentLiveOptimizationDashboard />
            </LazyTabContent>
          </TabsContent>

          <TabsContent value="edge-sim" className="space-y-4">
            <LazyTabContent label="Edge Simulator">
              <EdgeGovernanceSimulatorDashboard />
            </LazyTabContent>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
    </LongOnlyFilterProvider>
  );
};

export default ForexDashboard;
