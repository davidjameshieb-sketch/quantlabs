// Forex Trade Intelligence Dashboard
// Isolated forex-only trade performance tracking & analysis

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ForexPerformanceOverview } from '@/components/forex/ForexPerformanceOverview';
import { ForexTradeHistoryTable } from '@/components/forex/ForexTradeHistoryTable';
import { ForexQualityPanel, ForexRiskGovernancePanel } from '@/components/forex/ForexQualityAndRisk';
import { CrossAssetInfluencePanel, ForexRegimeTimeline } from '@/components/forex/ForexCrossAssetAndRegime';
import { ForexExecutionStatus } from '@/components/forex/ForexExecutionStatus';
import { ForexFilterBar } from '@/components/forex/ForexFilterBar';
import { OandaConnectionPanel } from '@/components/forex/OandaConnectionPanel';
import { OandaOrderLog } from '@/components/forex/OandaOrderLog';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import {
  generateForexTrades,
  filterForexTrades,
  computeForexPerformance,
  computeForexQuality,
  computeForexRiskGovernance,
  computeCrossAssetInfluence,
} from '@/lib/forex';
import { ForexDashboardFilters } from '@/lib/forex/forexTypes';
import { createAgents } from '@/lib/agents/agentEngine';

const ForexDashboard = () => {
  const [filters, setFilters] = useState<ForexDashboardFilters>({
    period: '30d',
    outcome: 'all',
    regime: 'all',
    pair: 'all',
    agent: 'all',
  });

  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents]);
  const filteredTrades = useMemo(() => filterForexTrades(allTrades, filters), [allTrades, filters]);

  const performance = useMemo(() => computeForexPerformance(filteredTrades), [filteredTrades]);
  const quality = useMemo(() => computeForexQuality(filteredTrades), [filteredTrades]);
  const risk = useMemo(() => computeForexRiskGovernance(filteredTrades), [filteredTrades]);
  const influence = useMemo(() => computeCrossAssetInfluence(), []);

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
          <ForexPerformanceOverview metrics={performance} />
        </motion.div>

        {/* OANDA Broker Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
          <OandaConnectionPanel />
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

        {/* OANDA Execution Log */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <OandaOrderLog />
        </motion.div>

        {/* Trade History Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <ForexTradeHistoryTable trades={filteredTrades} />
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ForexDashboard;
