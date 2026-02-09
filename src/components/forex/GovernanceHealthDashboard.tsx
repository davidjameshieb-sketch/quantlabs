// Governance Health Dashboard — Section 10
// Read-only monitoring panel: pass rates, gate heatmap, neutral rate,
// composite correlation, data availability, shadow mode, cache metrics,
// + executed trade performance analytics.

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import {
  computeGovernancePassStats,
  computeGateFrequency,
  computeNeutralDirectionRate,
  computeDataAvailability,
} from '@/lib/forex/governanceAnalytics';
import { verifyShadowModeIntegrity } from '@/lib/forex/governanceValidation';
import { computeCachePerformance } from '@/lib/forex/governanceCacheMonitor';
import { governanceAlerts } from '@/lib/forex/governanceAlerts';
import { computeExecutionAnalytics } from '@/lib/forex/executionPerformanceAnalytics';
import type { ForexTradeEntry } from '@/lib/forex/forexTypes';
import { GovernancePassRateCard } from './health/GovernancePassRateCard';
import { ShadowDataCard } from './health/ShadowDataCard';
import { DirectionCacheCard } from './health/DirectionCacheCard';
import { GateFrequencyCard } from './health/GateFrequencyCard';
import { GovernanceAlertsCard } from './health/GovernanceAlertsCard';
import { DataReadinessCard } from './health/DataReadinessCard';
import { ExecutionPerformancePanel } from './ExecutionPerformancePanel';
import { CompositeDecilePanel } from './CompositeDecilePanel';
import { computeCompositeExpectancyCorrelation } from '@/lib/forex/governanceAnalytics';

interface Props {
  trades?: ForexTradeEntry[];
}

export function GovernanceHealthDashboard({ trades = [] }: Props) {
  const passStats = useMemo(() => computeGovernancePassStats(), []);
  const gateFreq = useMemo(() => computeGateFrequency(), []);
  const neutralStats = useMemo(() => computeNeutralDirectionRate(), []);
  const decisionDeciles = useMemo(() => computeCompositeExpectancyCorrelation(), []);
  const dataAvail = useMemo(() => computeDataAvailability(), []);
  const shadowIntegrity = useMemo(() => verifyShadowModeIntegrity(), []);
  const cachePerf = useMemo(() => computeCachePerformance(), []);
  const recentAlerts = useMemo(() => governanceAlerts.getRecentAlerts(10), []);

  // Execution performance from real trades
  const execReport = useMemo(() => computeExecutionAnalytics(trades), [trades]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-display font-bold">Governance Health Monitor</h2>
        <Badge variant="outline" className="text-[9px]">
          {passStats.totalEvaluations} evaluations
        </Badge>
        {trades.length > 0 && (
          <Badge variant="outline" className="text-[9px]">
            {trades.filter(t => t.outcome !== 'avoided').length} executed
          </Badge>
        )}
      </div>

      {/* Row 1: Pass Rates + Shadow Mode + Data Availability */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GovernancePassRateCard passStats={passStats} />
        <ShadowDataCard shadowIntegrity={shadowIntegrity} dataAvail={dataAvail} />
        <DirectionCacheCard neutralStats={neutralStats} cachePerf={cachePerf} />
        <DataReadinessCard />
      </div>

      {/* Row 2: Gate Frequency + Decision Composite Correlation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GateFrequencyCard gateFreq={gateFreq} />
        {/* Decision-level decile (from governance logs, not executed trades) */}
        <CompositeDecilePanel deciles={execReport.byCompositeDecile.length > 0 ? execReport.byCompositeDecile : decisionDeciles.map(d => ({
          ...d,
          avgPnl: d.avgExpectancy,
        }))} />
      </div>

      {/* Row 3: Executed Trade Performance */}
      <ExecutionPerformancePanel report={execReport} />

      {/* Row 4: Alerts */}
      <GovernanceAlertsCard alerts={recentAlerts} />
    </div>
  );
}
