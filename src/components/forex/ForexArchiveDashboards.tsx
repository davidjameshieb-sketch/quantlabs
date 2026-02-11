// Archive wrapper for legacy forex dashboards
// All previous experimental/R&D dashboards accessible under a single collapsible interface

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ForexDashboardFilters } from '@/lib/forex/forexTypes';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';

// Lazy imports for all archive dashboards
import { ForexFilterBar } from '@/components/forex/ForexFilterBar';
import { ForexScalpingIntelligence } from '@/components/forex/ForexScalpingIntelligence';
import { ScalpingTradesDashboard } from '@/components/forex/ScalpingTradesDashboard';
import { PerformanceReanalysisDashboard } from '@/components/forex/PerformanceReanalysisDashboard';
import { DailyAuditPanel } from '@/components/forex/DailyAuditPanel';
import { ScalpVsSwingView } from '@/components/forex/ScalpVsSwingView';
import { ShadowModePanel } from '@/components/forex/ShadowModePanel';
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
import { CoalitionsDashboard } from '@/components/forex/CoalitionsDashboard';
import { ExplosiveGrowthDashboard } from '@/components/forex/ExplosiveGrowthDashboard';
import { UsdCadLearningDashboard } from '@/components/forex/UsdCadLearningDashboard';
import { IndicatorComparisonDashboard } from '@/components/forex/indicators/IndicatorComparisonDashboard';
import { ClusterMiningDashboard } from '@/components/forex/cluster-mining/ClusterMiningDashboard';
import { PairDarwinismDashboard } from '@/components/forex/PairDarwinismDashboard';
import { LiveTradingProofPanel } from '@/components/forex/EnvironmentGuards';
import { ShortEngineDashboard } from '@/components/forex/shorts/ShortEngineDashboard';
import { DarwinControlDashboard } from '@/components/forex/DarwinControlDashboard';
import {
  getLastGovernanceResults,
  computeRollingHealth,
  computeShadowModeState,
} from '@/lib/forex';

interface ArchiveSection {
  id: string;
  label: string;
  category: 'analysis' | 'agents' | 'edge' | 'experimental';
}

const ARCHIVE_SECTIONS: ArchiveSection[] = [
  { id: 'focus-pairs', label: 'Focus Pairs', category: 'analysis' },
  { id: 'scalp-vs-swing', label: 'Scalp vs Swing', category: 'analysis' },
  { id: 'scalping-trades', label: 'Scalping Trades', category: 'analysis' },
  { id: 'scalping', label: 'Scalping Intelligence', category: 'analysis' },
  { id: 'reanalysis', label: 'Reanalysis', category: 'analysis' },
  { id: 'audit', label: 'Daily Audit', category: 'analysis' },
  { id: 'collaboration', label: 'Agent Collaboration', category: 'agents' },
  { id: 'ensemble', label: 'Ensemble Health', category: 'agents' },
  { id: 'agent-simulator', label: 'Agent Simulator', category: 'agents' },
  { id: 'agent-optimization', label: 'Agent Optimization', category: 'agents' },
  { id: 'agent-live-opt', label: 'Agent Live Opt', category: 'agents' },
  { id: 'edge-discovery', label: 'Edge Discovery', category: 'edge' },
  { id: 'edge-extraction', label: 'Edge Extraction', category: 'edge' },
  { id: 'edge-golive', label: 'Go-Live', category: 'edge' },
  { id: 'discovery-risk', label: 'Discovery Risk', category: 'edge' },
  { id: 'adaptive-edge', label: 'Adaptive Edge', category: 'edge' },
  { id: 'edge-sim', label: 'Edge Simulator', category: 'edge' },
  { id: 'coalitions', label: 'Coalitions', category: 'experimental' },
  { id: 'explosive', label: 'Explosive Growth', category: 'experimental' },
  { id: 'usdcad-learning', label: 'USD/CAD Learning', category: 'experimental' },
  { id: 'indicators', label: 'Indicators', category: 'experimental' },
  { id: 'cluster-mining', label: 'Cluster Mining', category: 'experimental' },
  { id: 'darwinism', label: 'Pair Darwinism', category: 'experimental' },
  { id: 'darwin-control', label: 'Darwin Control', category: 'experimental' },
  { id: 'short-engine', label: 'Short Engine', category: 'experimental' },
  { id: 'shadow', label: 'Shadow Mode', category: 'experimental' },
];

const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'Trade Analysis',
  agents: 'Agent R&D',
  edge: 'Edge Research',
  experimental: 'Experimental',
};

interface ForexArchiveDashboardsProps {
  allTrades: any[];
  filteredTrades: any[];
  filters: ForexDashboardFilters;
  setFilters: (f: ForexDashboardFilters) => void;
  performance: any;
  governanceStats: any;
  executionMetrics: RealExecutionMetrics;
  tradeAnalytics: any;
  longOnlyFilter: boolean;
  onLongOnlyToggle: (enabled: boolean) => void;
}

export const ForexArchiveDashboards = ({
  allTrades,
  filteredTrades,
  filters,
  setFilters,
  performance,
  governanceStats,
  executionMetrics,
  tradeAnalytics,
  longOnlyFilter,
  onLongOnlyToggle,
}: ForexArchiveDashboardsProps) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const governanceResults = getLastGovernanceResults();
  const rollingHealth = computeRollingHealth(allTrades);
  const shadowMode = computeShadowModeState(allTrades);

  const categories = ['analysis', 'agents', 'edge', 'experimental'];

  const renderSection = (id: string) => {
    switch (id) {
      case 'focus-pairs':
        return <><LiveTradingProofPanel /><FocusPairsEdgeDashboard /></>;
      case 'scalp-vs-swing':
        return <ScalpVsSwingView trades={filteredTrades} />;
      case 'scalping-trades':
        return <ScalpingTradesDashboard trades={filteredTrades} performance={performance} governanceStats={governanceStats} governanceResults={governanceResults} />;
      case 'scalping':
        return <ForexScalpingIntelligence />;
      case 'reanalysis':
        return <PerformanceReanalysisDashboard trades={filteredTrades} performance={performance} governanceStats={governanceStats} governanceResults={governanceResults} />;
      case 'audit':
        return <DailyAuditPanel trades={filteredTrades} performance={performance} rollingHealth={rollingHealth} shadowMode={shadowMode} />;
      case 'collaboration':
        return <><AgentCollaborationDashboard /><BaselineVsEnsembleCard mode="full" /></>;
      case 'ensemble':
        return <><BaselineVsEnsembleCard /><EnsembleHealthDashboard /></>;
      case 'agent-simulator':
        return <AgentExclusionSimulator longOnlyFilter={longOnlyFilter} />;
      case 'agent-optimization':
        return <AgentOptimizationDashboard longOnlyFilter={longOnlyFilter} />;
      case 'agent-live-opt':
        return <AgentLiveOptimizationDashboard />;
      case 'edge-discovery':
        return <EdgeDiscoveryDashboard />;
      case 'edge-extraction':
        return <EdgeExtractionDashboard />;
      case 'edge-golive':
        return <EdgeGoLivePanel />;
      case 'discovery-risk':
        return <DiscoveryRiskPanel trades={filteredTrades} />;
      case 'adaptive-edge':
        return <><AdaptiveEdgeDashboard trades={filteredTrades} /><AgentWeightingTable /><AgentPriorityReasoningPanel /></>;
      case 'edge-sim':
        return <EdgeGovernanceSimulatorDashboard />;
      case 'coalitions':
        return <CoalitionsDashboard />;
      case 'explosive':
        return <ExplosiveGrowthDashboard />;
      case 'usdcad-learning':
        return <UsdCadLearningDashboard />;
      case 'indicators':
        return <IndicatorComparisonDashboard />;
      case 'cluster-mining':
        return <ClusterMiningDashboard />;
      case 'darwinism':
        return <PairDarwinismDashboard />;
      case 'darwin-control':
        return <DarwinControlDashboard />;
      case 'short-engine':
        return <ShortEngineDashboard />;
      case 'shadow':
        return <ShadowModePanel state={shadowMode} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Archive className="w-5 h-5 text-muted-foreground" />
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Archived Dashboards</h2>
          <p className="text-xs text-muted-foreground">
            Legacy R&D and experimental dashboards from previous strategy iterations.
            Click any section to expand.
          </p>
        </div>
        <Badge variant="outline" className="text-[9px] text-muted-foreground ml-auto">
          {ARCHIVE_SECTIONS.length} dashboards
        </Badge>
      </div>

      {categories.map(cat => {
        const sections = ARCHIVE_SECTIONS.filter(s => s.category === cat);
        return (
          <div key={cat} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-1">
              {sections.map(section => (
                <div key={section.id}>
                  <button
                    onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors',
                      expandedSection === section.id
                        ? 'bg-primary/10 text-foreground border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    )}
                  >
                    <ChevronRight className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      expandedSection === section.id && 'rotate-90'
                    )} />
                    <span className="font-medium">{section.label}</span>
                  </button>

                  <AnimatePresence>
                    {expandedSection === section.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 mt-1 rounded-lg border border-border/30 bg-card/30 space-y-4">
                          {renderSection(section.id)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
