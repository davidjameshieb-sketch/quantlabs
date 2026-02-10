// Edge Discovery & Failure Mapping Dashboard
// Full analytics module for conditional edge identification
// Uses canonical agentStateResolver for effective tier display

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Radar, TrendingUp, AlertTriangle, Layers, Brain, Activity, GitCompare, Shield, BarChart3, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEdgeDiscovery } from '@/hooks/useEdgeDiscovery';
import { EdgeGlobalSummary } from './EdgeGlobalSummary';
import { EdgeHeatmap } from './EdgeHeatmap';
import { EdgeFailureRadar } from './EdgeFailureRadar';
import { EdgeClusterLeaderboard } from './EdgeClusterLeaderboard';
import { EdgePredictiveValidation } from './EdgePredictiveValidation';
import { EdgeDecayTimeline } from './EdgeDecayTimeline';
import { EdgeRngComparison } from './EdgeRngComparison';
import { EdgeGovernanceQuality } from './EdgeGovernanceQuality';
import { EdgeOutputSummary } from './EdgeOutputSummary';
import { getAllAgentStates } from '@/lib/agents/agentStateResolver';
import { LegacyStateWarningBanner } from '@/components/forex/AgentStateBadges';

export const EdgeDiscoveryDashboard = () => {
  const { result, trades, loading, error } = useEdgeDiscovery();
  const [activeTab, setActiveTab] = useState('heatmap');
  const hasLegacyStates = getAllAgentStates().some(s => s.effectiveTier === 'B-Legacy');

  if (loading) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Failed to load trade data: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result || trades.length === 0) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No closed trades found. Run a backtest or accumulate live trades to enable Edge Discovery.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legacy State Warning */}
      {hasLegacyStates && <LegacyStateWarningBanner />}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Edge Discovery & Failure Mapping</h2>
            <Badge variant="outline" className="text-[9px] ml-1">
              {trades.length.toLocaleString()} trades
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[9px] ${
                result.overallScoringVerdict === 'SCORING PREDICTIVE'
                  ? 'border-neural-green/50 text-neural-green'
                  : result.overallScoringVerdict === 'SCORING NON-PREDICTIVE'
                    ? 'border-neural-red/50 text-neural-red'
                    : 'border-border/50 text-muted-foreground'
              }`}
            >
              {result.overallScoringVerdict}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[9px] ${
                result.edgeDecayStatus === 'STABLE'
                  ? 'border-neural-green/50 text-neural-green'
                  : result.edgeDecayStatus === 'DEGRADING'
                    ? 'border-neural-orange/50 text-neural-orange'
                    : result.edgeDecayStatus === 'CRITICAL'
                      ? 'border-neural-red/50 text-neural-red'
                      : 'border-border/50 text-muted-foreground'
              }`}
            >
              Edge: {result.edgeDecayStatus}
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Global Summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
        <EdgeGlobalSummary summary={result.globalSummary} />
      </motion.div>

      {/* Tabs for sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="heatmap" className="text-xs gap-1">
            <BarChart3 className="w-3 h-3" />Heatmap
          </TabsTrigger>
          <TabsTrigger value="failures" className="text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />Failures
          </TabsTrigger>
          <TabsTrigger value="clusters" className="text-xs gap-1">
            <Layers className="w-3 h-3" />Clusters
          </TabsTrigger>
          <TabsTrigger value="predictive" className="text-xs gap-1">
            <Brain className="w-3 h-3" />Predictive
          </TabsTrigger>
          <TabsTrigger value="decay" className="text-xs gap-1">
            <Activity className="w-3 h-3" />Decay
          </TabsTrigger>
          <TabsTrigger value="rng" className="text-xs gap-1">
            <GitCompare className="w-3 h-3" />RNG
          </TabsTrigger>
          <TabsTrigger value="governance" className="text-xs gap-1">
            <Shield className="w-3 h-3" />Governance
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-xs gap-1">
            <FileText className="w-3 h-3" />Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap">
          <EdgeHeatmap heatmap={result.heatmap} />
        </TabsContent>
        <TabsContent value="failures">
          <EdgeFailureRadar failures={result.failures} />
        </TabsContent>
        <TabsContent value="clusters">
          <EdgeClusterLeaderboard clusters={result.clusters} />
        </TabsContent>
        <TabsContent value="predictive">
          <EdgePredictiveValidation checks={result.predictiveChecks} verdict={result.overallScoringVerdict} />
        </TabsContent>
        <TabsContent value="decay">
          <EdgeDecayTimeline decay={result.decay} status={result.edgeDecayStatus} />
        </TabsContent>
        <TabsContent value="rng">
          <EdgeRngComparison comparison={result.rngComparison} />
        </TabsContent>
        <TabsContent value="governance">
          <EdgeGovernanceQuality quality={result.governanceQuality} />
        </TabsContent>
        <TabsContent value="summary">
          <EdgeOutputSummary result={result} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
