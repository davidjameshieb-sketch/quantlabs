// Edge Extraction Dashboard — 3-column comparison + Rules Editor + OOS Validation
import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Radar, Filter, TrendingUp, AlertTriangle, Shield, Save, Trash2, BarChart3, FlaskConical, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEdgeDiscovery } from '@/hooks/useEdgeDiscovery';
import { Skeleton } from '@/components/ui/skeleton';
import {
  simulateTrades,
  computeEdgeOnlyTrades,
  createRecommendedV1,
  createConservative,
  createAggressive,
  createEmptyRuleSet,
  saveRuleSet,
  loadRuleSets,
  deleteRuleSet,
  hydrateRuleSet,
  type FilterRuleSet,
  type SimulationMetrics,
} from '@/lib/forex/filterSimulator';
import {
  buildEnvironmentStats,
  findTopEdgeEnvironments,
  findWorstEnvironments,
  failureAttribution,
  validateOutOfSample,
  computeMetricsSummary,
  type NormalizedTrade,
  type EnvironmentStatsEntry,
} from '@/lib/forex/edgeDiscoveryEngine';
import { FilterRulesEditor } from './FilterRulesEditor';
import { MetricsComparisonPanel } from './MetricsComparisonPanel';
import { EnvironmentTable } from './EnvironmentTable';
import { RemovalReasonsChart } from './RemovalReasonsChart';
import { OOSValidationPanel } from './OOSValidationPanel';

export const EdgeExtractionDashboard = () => {
  const { trades, loading, error } = useEdgeDiscovery();
  const [rules, setRules] = useState<FilterRuleSet>(createRecommendedV1());
  const [activeTab, setActiveTab] = useState('comparison');

  // Simulation results
  const simResult = useMemo(() => {
    if (trades.length === 0) return null;
    return simulateTrades(trades, rules);
  }, [trades, rules]);

  const edgeOnly = useMemo(() => {
    if (trades.length === 0) return null;
    return computeEdgeOnlyTrades(trades, 10, 30);
  }, [trades]);

  // Environment stats
  const envStats = useMemo(() => {
    if (trades.length === 0) return [];
    return buildEnvironmentStats(trades, { minTrades: 30 });
  }, [trades]);

  const topEnvs = useMemo(() => findTopEdgeEnvironments(envStats, 10), [envStats]);
  const worstEnvs = useMemo(() => findWorstEnvironments(envStats, 10), [envStats]);
  const failures = useMemo(() => failureAttribution(trades), [trades]);

  // OOS Validation
  const oosResult = useMemo(() => {
    if (trades.length < 100) return null;
    return validateOutOfSample(trades, 0.7, 20);
  }, [trades]);

  // Preset handlers
  const handlePreset = useCallback((preset: string) => {
    switch (preset) {
      case 'recommended': setRules(createRecommendedV1()); break;
      case 'conservative': setRules(createConservative()); break;
      case 'aggressive': setRules(createAggressive()); break;
      case 'none': setRules(createEmptyRuleSet('No Filters')); break;
    }
  }, []);

  const handleSave = useCallback(() => {
    const name = prompt('Rule set name:', rules.name);
    if (!name) return;
    saveRuleSet({ ...rules, name });
  }, [rules]);

  const handleLoad = useCallback((name: string) => {
    const sets = loadRuleSets();
    const found = sets.find(s => s.name === name);
    if (found) setRules(hydrateRuleSet(found));
  }, []);

  if (loading) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || trades.length === 0) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          {error || 'No closed trades found. Run a backtest or accumulate live trades.'}
        </CardContent>
      </Card>
    );
  }

  const baselineMetrics = simResult?.metricsBaseline;
  const filteredMetrics = simResult?.metricsKept;
  const edgeOnlyMetrics = edgeOnly?.metrics;

  // Guardrails
  const lowSampleWarning = filteredMetrics && filteredMetrics.trades < 300;
  const edgeOnlyLowSample = edgeOnly && edgeOnly.kept.length < 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Edge Extraction & Filter Simulator</h2>
            <Badge variant="outline" className="text-[9px]">{trades.length.toLocaleString()} trades</Badge>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => handlePreset('none')}>No Filters</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => handlePreset('recommended')}>Recommended v1</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => handlePreset('conservative')}>Conservative</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => handlePreset('aggressive')}>Aggressive</Button>
            <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1" onClick={handleSave}>
              <Save className="w-3 h-3" />Save
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Warnings */}
      {lowSampleWarning && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-neural-orange/30 bg-neural-orange/5">
            <CardContent className="p-3 flex items-center gap-2 text-xs text-neural-orange">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Filtered sample is only {filteredMetrics!.trades} trades — results may not be statistically significant (minimum 300 recommended).</span>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="comparison" className="text-xs gap-1">
            <ArrowRightLeft className="w-3 h-3" />Comparison
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs gap-1">
            <Filter className="w-3 h-3" />Rules Editor
          </TabsTrigger>
          <TabsTrigger value="environments" className="text-xs gap-1">
            <BarChart3 className="w-3 h-3" />Environments
          </TabsTrigger>
          <TabsTrigger value="failures" className="text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />Failures
          </TabsTrigger>
          <TabsTrigger value="oos" className="text-xs gap-1">
            <FlaskConical className="w-3 h-3" />OOS Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="space-y-4">
          {baselineMetrics && filteredMetrics && edgeOnlyMetrics && (
            <MetricsComparisonPanel
              baseline={baselineMetrics}
              filtered={filteredMetrics}
              edgeOnly={edgeOnlyMetrics}
              removedReasons={simResult?.removedReasonCounts || {}}
              removedCount={simResult?.removedTrades.length || 0}
              edgeOnlyLowSample={!!edgeOnlyLowSample}
            />
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <FilterRulesEditor
            rules={rules}
            onChange={setRules}
            trades={trades}
            savedSets={loadRuleSets()}
            onLoad={handleLoad}
            onDelete={deleteRuleSet}
          />
        </TabsContent>

        <TabsContent value="environments" className="space-y-4">
          <EnvironmentTable
            topEnvs={topEnvs.top}
            worstEnvs={worstEnvs}
          />
        </TabsContent>

        <TabsContent value="failures" className="space-y-4">
          {failures.length > 0 ? (
            <Card className="border-border/30 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-neural-red" />
                  Failure Attribution — Top Capital Destroyers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/20">
                        <th className="text-left py-1 px-2">Dimension</th>
                        <th className="text-left py-1 px-2">Key</th>
                        <th className="text-right py-1 px-2">Trades</th>
                        <th className="text-right py-1 px-2">Total P&L</th>
                        <th className="text-right py-1 px-2">Exp</th>
                        <th className="text-right py-1 px-2">Max DD</th>
                        <th className="text-left py-1 px-2">Suggestion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.slice(0, 20).map((f, i) => (
                        <tr key={i} className="border-b border-border/10">
                          <td className="py-1.5 px-2">{f.dimension}</td>
                          <td className="py-1.5 px-2 font-mono">{f.key}</td>
                          <td className="text-right py-1.5 px-2 font-mono">{f.trades}</td>
                          <td className="text-right py-1.5 px-2 font-mono text-neural-red">{f.totalPnl}p</td>
                          <td className="text-right py-1.5 px-2 font-mono text-neural-red">{f.expectancy}p</td>
                          <td className="text-right py-1.5 px-2 font-mono">{f.maxDDContribution}p</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{f.suggestion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/30 bg-card/50">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No negative-expectancy failure drivers detected.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="oos" className="space-y-4">
          <OOSValidationPanel result={oosResult} totalTrades={trades.length} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
