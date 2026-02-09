// Governance Health Dashboard — Section 10
// Read-only monitoring panel: pass rates, gate heatmap, neutral rate,
// composite correlation, data availability, shadow mode, cache metrics.

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, ShieldAlert, Activity, BarChart3, Database,
  Eye, Gauge, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  computeGovernancePassStats,
  computeGateFrequency,
  computeNeutralDirectionRate,
  computeCompositeExpectancyCorrelation,
  computeDataAvailability,
} from '@/lib/forex/governanceAnalytics';
import { verifyShadowModeIntegrity } from '@/lib/forex/governanceValidation';
import { computeCachePerformance } from '@/lib/forex/governanceCacheMonitor';
import { governanceAlerts } from '@/lib/forex/governanceAlerts';

const SESSION_LABELS: Record<string, string> = {
  asian: 'Asian',
  'london-open': 'London',
  'ny-overlap': 'NY Overlap',
  'late-ny': 'Late NY',
};

export function GovernanceHealthDashboard() {
  const passStats = useMemo(() => computeGovernancePassStats(), []);
  const gateFreq = useMemo(() => computeGateFrequency(), []);
  const neutralStats = useMemo(() => computeNeutralDirectionRate(), []);
  const compositeCorr = useMemo(() => computeCompositeExpectancyCorrelation(), []);
  const dataAvail = useMemo(() => computeDataAvailability(), []);
  const shadowIntegrity = useMemo(() => verifyShadowModeIntegrity(), []);
  const cachePerf = useMemo(() => computeCachePerformance(), []);
  const recentAlerts = useMemo(() => governanceAlerts.getRecentAlerts(10), []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-display font-bold">Governance Health Monitor</h2>
        <Badge variant="outline" className="text-[9px]">
          {passStats.totalEvaluations} evaluations
        </Badge>
      </div>

      {/* Row 1: Pass Rates + Shadow Mode + Data Availability */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Pass Rate Card */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-neural-green" />
              Pass / Throttle / Reject
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Approved</span>
              <span className="text-neural-green font-mono">
                {passStats.approvedCount} ({(passStats.approvalRate * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Throttled</span>
              <span className="text-yellow-400 font-mono">{passStats.throttledCount}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Rejected</span>
              <span className="text-neural-red font-mono">{passStats.rejectedCount}</span>
            </div>

            {/* Session breakdown */}
            <div className="border-t border-border/20 pt-2 mt-2 space-y-1">
              <span className="text-[9px] text-muted-foreground font-semibold">By Session</span>
              {(['london-open', 'ny-overlap', 'asian', 'late-ny'] as const).map(s => {
                const sb = passStats.breakdownBySession[s];
                return (
                  <div key={s} className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">{SESSION_LABELS[s]}</span>
                    <span className="font-mono">
                      {sb.approved}/{sb.total} ({(sb.approvalRate * 100).toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Shadow Mode + Data Availability */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Shadow Mode & Data
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Shadow Active</span>
              <Badge variant={shadowIntegrity.shadowModeActive ? 'default' : 'outline'} className="text-[8px] px-1.5">
                {shadowIntegrity.shadowModeActive ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Exec Violations</span>
              <span className={`font-mono ${shadowIntegrity.executionViolations > 0 ? 'text-neural-red' : 'text-neural-green'}`}>
                {shadowIntegrity.executionViolations}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Integrity</span>
              {shadowIntegrity.verified
                ? <CheckCircle2 className="w-3.5 h-3.5 text-neural-green" />
                : <XCircle className="w-3.5 h-3.5 text-neural-red" />
              }
            </div>

            <div className="border-t border-border/20 pt-2 mt-2 space-y-1">
              <span className="text-[9px] text-muted-foreground font-semibold">Data Availability</span>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Price Data</span>
                <span className={`font-mono ${dataAvail.priceDataAvailabilityRate < 0.98 ? 'text-yellow-400' : 'text-neural-green'}`}>
                  {(dataAvail.priceDataAvailabilityRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Analysis</span>
                <span className={`font-mono ${dataAvail.analysisAvailabilityRate < 0.98 ? 'text-yellow-400' : 'text-neural-green'}`}>
                  {(dataAvail.analysisAvailabilityRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Neutral Rate + Cache */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              Direction & Cache
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Neutral Rate</span>
              <span className={`font-mono ${neutralStats.alertTriggered ? 'text-yellow-400' : 'text-foreground'}`}>
                {(neutralStats.neutralRate * 100).toFixed(1)}%
              </span>
            </div>
            {neutralStats.alertTriggered && (
              <div className="flex items-center gap-1 text-[9px] text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                Above 55% threshold
              </div>
            )}

            <div className="border-t border-border/20 pt-2 mt-2 space-y-1">
              <span className="text-[9px] text-muted-foreground font-semibold">Cache Performance</span>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Slow Hit Rate</span>
                <span className="font-mono">{(cachePerf.slowCacheHitRate * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Fast Hit Rate</span>
                <span className={`font-mono ${cachePerf.staleFastCacheAlert ? 'text-yellow-400' : ''}`}>
                  {(cachePerf.fastCacheHitRate * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Avg Latency</span>
                <span className="font-mono">{cachePerf.avgContextLatencyMs.toFixed(1)}ms</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Gate Frequency + Composite Correlation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Gate Frequency Heatmap */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
              Gate Trigger Frequency
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {gateFreq.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No gate triggers recorded.</p>
            ) : (
              <div className="space-y-1">
                {gateFreq.map(g => {
                  const pct = g.triggerRate * 100;
                  const color = g.gateCategory === 'infrastructure'
                    ? 'bg-blue-500/60'
                    : pct > 30 ? 'bg-neural-red/60' : pct > 15 ? 'bg-yellow-500/60' : 'bg-muted/40';
                  return (
                    <div key={g.gateId} className="flex items-center gap-2">
                      <div className="w-28 text-[9px] font-mono text-muted-foreground truncate">
                        {g.gateId}
                      </div>
                      <div className="flex-1 h-3 bg-muted/20 rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-sm`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono w-12 text-right">
                        {g.triggerCount} ({pct.toFixed(0)}%)
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[7px] px-1 ${g.gateCategory === 'infrastructure' ? 'border-blue-500/40 text-blue-400' : 'border-yellow-500/40 text-yellow-400'}`}
                      >
                        {g.gateCategory === 'infrastructure' ? 'INFRA' : 'STRAT'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Composite Score vs Expectancy */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              Composite Score ↔ Quality (Deciles)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {compositeCorr.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">Need 10+ approved evaluations for correlation data.</p>
            ) : (
              <div className="space-y-1">
                <div className="flex text-[8px] text-muted-foreground font-semibold mb-1">
                  <span className="w-24">Range</span>
                  <span className="w-10 text-right">N</span>
                  <span className="w-14 text-right">Win%</span>
                  <span className="w-14 text-right">Expect.</span>
                  <span className="w-14 text-right">MAE</span>
                </div>
                {compositeCorr.map((d, i) => (
                  <div key={i} className="flex text-[9px] font-mono">
                    <span className="w-24 text-muted-foreground">{d.decileRange}</span>
                    <span className="w-10 text-right">{d.count}</span>
                    <span className={`w-14 text-right ${d.winRate > 0.6 ? 'text-neural-green' : d.winRate < 0.4 ? 'text-neural-red' : ''}`}>
                      {(d.winRate * 100).toFixed(0)}%
                    </span>
                    <span className="w-14 text-right">{d.avgExpectancy.toFixed(3)}</span>
                    <span className="w-14 text-right">{d.avgMAE.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Alerts */}
      {recentAlerts.length > 0 && (
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
              Recent Alerts ({recentAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentAlerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[9px]">
                  <span className="text-muted-foreground font-mono">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-[7px] px-1">{a.type}</Badge>
                  <span className="text-muted-foreground truncate">
                    {JSON.stringify(a.details).slice(0, 80)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
