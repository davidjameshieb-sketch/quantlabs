// Forex Trade Intelligence Dashboard
// Isolated forex-only trade performance tracking & analysis

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, TrendingUp, Crosshair, BarChart3, FlaskConical, ShieldCheck, SplitSquareHorizontal } from 'lucide-react';
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
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
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
} from '@/lib/forex';
import { ForexDashboardFilters } from '@/lib/forex/forexTypes';
import { createAgents } from '@/lib/agents/agentEngine';
import { useOandaExecution } from '@/hooks/useOandaExecution';
import { useOandaPerformance } from '@/hooks/useOandaPerformance';

const ForexDashboard = () => {
  const [filters, setFilters] = useState<ForexDashboardFilters>({
    period: '30d',
    outcome: 'all',
    regime: 'all',
    pair: 'all',
    agent: 'all',
  });

  const [livePricesReady, setLivePricesReady] = useState(hasLivePrices());

  // Real OANDA data hooks
  const { connected, account, openTrades, fetchAccountSummary } = useOandaExecution();
  const { metrics: executionMetrics } = useOandaPerformance();

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Globe className="w-7 h-7 text-primary" />
                <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                  Forex Trade Intelligence
                </h1>
                <IntelligenceModeBadge />
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
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
            <TabsTrigger value="performance" className="text-xs gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />Performance
            </TabsTrigger>
            <TabsTrigger value="scalp-vs-swing" className="text-xs gap-1.5">
              <SplitSquareHorizontal className="w-3.5 h-3.5" />Scalp vs Swing
            </TabsTrigger>
            <TabsTrigger value="scalping-trades" className="text-xs gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />Scalping Trades
            </TabsTrigger>
            <TabsTrigger value="scalping" className="text-xs gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />Scalping Intelligence
            </TabsTrigger>
            <TabsTrigger value="reanalysis" className="text-xs gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" />Reanalysis
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />Daily Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">
            {/* Live Execution Hero — Real OANDA Data */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
              <LiveExecutionHero
                account={account}
                connected={connected}
                openTradeCount={openTrades.length}
                executionMetrics={executionMetrics}
              />
            </motion.div>

            {/* Filters */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <ForexFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                totalCount={allTrades.length}
                filteredCount={filteredTrades.length}
              />
            </motion.div>

            {/* Performance Overview */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <ForexPerformanceOverview metrics={performance} governanceStats={governanceStats} trades={filteredTrades} />
            </motion.div>

            {/* Live OANDA Trades */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
              <LiveForexTradesPanel />
            </motion.div>

            {/* Execution Status */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
              <ForexExecutionStatus trades={filteredTrades} />
            </motion.div>

            {/* Quality, Risk, Regime, Cross-Asset */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              <ForexQualityPanel quality={quality} />
              <ForexRiskGovernancePanel risk={risk} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              <ForexRegimeTimeline trades={filteredTrades} />
              <CrossAssetInfluencePanel influence={influence} />
            </motion.div>

            {/* Trade History Table */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
              <ForexTradeHistoryTable trades={filteredTrades} />
            </motion.div>
          </TabsContent>

          <TabsContent value="scalp-vs-swing" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ScalpVsSwingView trades={filteredTrades} />
            </motion.div>
          </TabsContent>

          <TabsContent value="scalping-trades" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ScalpingTradesDashboard
                trades={filteredTrades}
                performance={performance}
                governanceStats={governanceStats}
                governanceResults={governanceResults}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="scalping" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ForexScalpingIntelligence />
            </motion.div>
          </TabsContent>

          <TabsContent value="reanalysis" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <PerformanceReanalysisDashboard
                trades={filteredTrades}
                performance={performance}
                governanceStats={governanceStats}
                governanceResults={governanceResults}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <DailyAuditPanel
                trades={filteredTrades}
                performance={performance}
                rollingHealth={rollingHealth}
                shadowMode={shadowMode}
              />
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ForexDashboard;
