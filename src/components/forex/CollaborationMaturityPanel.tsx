// ═══════════════════════════════════════════════════════════════
// Collaboration Maturity & Readiness Panel — Read-Only Diagnostics
// Pure observation: never modifies weights, authority, or routing.
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Target, TrendingUp, AlertTriangle, Download, Gauge, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import type { CollaborationSnapshot } from '@/lib/agents/agentCollaborationEngine';
import {
  computeCollaborationMaturity,
  exportMaturityCSV,
  type CollaborationMaturityReport,
  type MaturityLevel,
} from '@/lib/agents/collaborationMaturityEngine';

const maturityColor: Record<MaturityLevel, string> = {
  'Observation': 'text-muted-foreground',
  'Soft Eligible': 'text-neural-orange',
  'Hard Eligible': 'text-neural-green',
};

const maturityBg: Record<MaturityLevel, string> = {
  'Observation': 'bg-muted/20',
  'Soft Eligible': 'bg-neural-orange/10',
  'Hard Eligible': 'bg-neural-green/10',
};

const verdictColor: Record<string, string> = {
  'Trending Useful': 'text-neural-green',
  'Neutral': 'text-muted-foreground',
  'Stagnating': 'text-neural-red',
  'Insufficient Data': 'text-muted-foreground/50',
};

interface Props {
  snapshot: CollaborationSnapshot | null;
}

export const CollaborationMaturityPanel = ({ snapshot }: Props) => {
  const report = useMemo<CollaborationMaturityReport | null>(() => {
    if (!snapshot || snapshot.pairStats.length === 0) return null;
    return computeCollaborationMaturity(snapshot);
  }, [snapshot]);

  const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
  const agentIcon = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.icon || '🤖';

  const handleExportCSV = () => {
    if (!report) return;
    const csv = exportMaturityCSV(report);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collaboration-maturity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30 text-center"
      >
        <Eye className="w-5 h-5 mx-auto text-muted-foreground mb-2" />
        <p className="text-[10px] text-muted-foreground">INSUFFICIENT DATA — No paired opportunities detected yet.</p>
      </motion.div>
    );
  }

  const { distribution, emergence, outcomeChangedForecast, topPairsNearThreshold, driftRisk, pairs } = report;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">Collaboration Maturity & Readiness</h3>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-muted-foreground">READ-ONLY DIAGNOSTIC</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={handleExportCSV} className="text-[10px] h-7">
          <Download className="w-3 h-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Top Row: Distribution + Emergence + Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Maturity Distribution */}
        <div className="p-3 rounded-xl bg-card/50 border border-border/30">
          <h4 className="text-[10px] font-bold mb-2 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Maturity Distribution
          </h4>
          <div className="space-y-2">
            {([
              { level: 'Hard Eligible' as MaturityLevel, count: distribution.hardEligible, threshold: '≥40 opps' },
              { level: 'Soft Eligible' as MaturityLevel, count: distribution.softEligible, threshold: '10–39 opps' },
              { level: 'Observation' as MaturityLevel, count: distribution.observation, threshold: '<10 opps' },
            ]).map(({ level, count, threshold }) => (
              <div key={level} className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', maturityBg[level])} />
                <span className={cn('text-[10px] w-20', maturityColor[level])}>{level}</span>
                <div className="flex-1">
                  <Progress
                    value={distribution.total > 0 ? (count / distribution.total) * 100 : 0}
                    className="h-1.5"
                  />
                </div>
                <span className="text-[10px] font-mono w-6 text-right">{count}</span>
                <span className="text-[8px] text-muted-foreground w-16">{threshold}</span>
              </div>
            ))}
            <div className="text-[9px] text-muted-foreground mt-1 text-right">
              {distribution.total} total pairs tracked
            </div>
          </div>
        </div>

        {/* Authority Emergence Probability */}
        <div className="p-3 rounded-xl bg-card/50 border border-border/30">
          <h4 className="text-[10px] font-bold mb-2 flex items-center gap-1">
            <Target className="w-3 h-3" /> Authority Emergence Probability
          </h4>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl font-mono font-bold text-foreground">{emergence.probability}%</div>
            <Badge variant="outline" className={cn('text-[9px]', verdictColor[emergence.verdict])}>
              {emergence.verdict}
            </Badge>
          </div>
          <div className="space-y-1">
            {([
              { label: 'Opportunity Growth', score: emergence.factors.opportunityGrowthScore, max: 25 },
              { label: 'Delta Direction', score: emergence.factors.deltaDirectionScore, max: 25 },
              { label: 'Variance Reduction', score: emergence.factors.varianceReductionScore, max: 25 },
              { label: 'EnvKey Consistency', score: emergence.factors.envKeyConsistencyScore, max: 15 },
              { label: 'Drift Absence', score: emergence.factors.driftAbsenceScore, max: 10 },
            ]).map(({ label, score, max }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-28">{label}</span>
                <Progress value={(score / max) * 100} className="h-1 flex-1" />
                <span className="text-[9px] font-mono w-10 text-right">{score}/{max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* OutcomeChanged Forecast */}
        <div className="p-3 rounded-xl bg-card/50 border border-border/30">
          <h4 className="text-[10px] font-bold mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> OutcomeChanged Forecast
          </h4>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-[9px] text-muted-foreground">Expected Rate:</span>
            <span className="text-[10px] font-mono text-muted-foreground">{outcomeChangedForecast.expectedRateLow}%</span>
            <span className="text-muted-foreground/50 text-[10px]">/</span>
            <span className="text-sm font-mono font-bold text-foreground">{outcomeChangedForecast.expectedRateBase}%</span>
            <span className="text-muted-foreground/50 text-[10px]">/</span>
            <span className="text-[10px] font-mono text-muted-foreground">{outcomeChangedForecast.expectedRateHigh}%</span>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Decisions Influenced</span>
              <span className="font-mono">{outcomeChangedForecast.expectedFractionInfluenced}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confidence</span>
              <Badge variant="outline" className={cn('text-[8px] px-1',
                outcomeChangedForecast.confidence === 'high' ? 'text-neural-green' :
                outcomeChangedForecast.confidence === 'medium' ? 'text-neural-orange' :
                'text-muted-foreground'
              )}>
                {outcomeChangedForecast.confidence}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Drift Risk</span>
              <Badge variant="outline" className={cn('text-[8px] px-1',
                driftRisk === 'Low' ? 'text-neural-green' :
                driftRisk === 'Medium' ? 'text-neural-orange' :
                'text-neural-red'
              )}>
                {driftRisk}
              </Badge>
            </div>
          </div>
          <p className="text-[8px] text-muted-foreground mt-2 leading-relaxed">{outcomeChangedForecast.reasoning}</p>
        </div>
      </div>

      {/* Pairs Closest to Threshold */}
      {topPairsNearThreshold.length > 0 && (
        <div className="p-3 rounded-xl bg-card/50 border border-primary/20">
          <h4 className="text-[10px] font-bold mb-2 flex items-center gap-1">
            <Target className="w-3 h-3 text-primary" /> Pairs Closest to Soft Threshold (10 opps)
          </h4>
          <div className="space-y-1.5">
            {topPairsNearThreshold.map((pair, i) => {
              const remaining = Math.max(0, 10 - pair.pairedOpportunities);
              return (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span>{agentIcon(pair.agentA)}</span>
                  <span className="w-20 truncate">{agentName(pair.agentA)}</span>
                  <span className="text-muted-foreground/50">×</span>
                  <span>{agentIcon(pair.agentB)}</span>
                  <span className="w-20 truncate">{agentName(pair.agentB)}</span>
                  <Progress value={pair.sampleProgressSoft * 100} className="h-1.5 flex-1 max-w-24" />
                  <span className="font-mono text-muted-foreground w-12 text-right">{pair.pairedOpportunities}/10</span>
                  <span className="text-[8px] text-muted-foreground">({remaining} needed)</span>
                  <Badge variant="outline" className={cn('text-[8px] px-1',
                    pair.earlySignal === 'Early Synergy Candidate' ? 'text-neural-green' :
                    pair.earlySignal === 'Early Conflict Candidate' ? 'text-neural-red' :
                    'text-muted-foreground'
                  )}>
                    {pair.earlySignal}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Pair Maturity Table */}
      <div className="p-3 rounded-xl bg-card/50 border border-border/30">
        <h4 className="text-[10px] font-bold mb-2">Full Pair Maturity Matrix</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/20 text-muted-foreground">
                <th className="text-left py-1 px-1.5">Agent A</th>
                <th className="text-left py-1 px-1.5">Agent B</th>
                <th className="text-right py-1 px-1.5">Opps</th>
                <th className="text-center py-1 px-1.5">Soft %</th>
                <th className="text-center py-1 px-1.5">Hard %</th>
                <th className="text-center py-1 px-1.5">Maturity</th>
                <th className="text-right py-1 px-1.5">Δ Exp</th>
                <th className="text-right py-1 px-1.5">Δ Stab</th>
                <th className="text-right py-1 px-1.5">EnvKeys</th>
                <th className="text-center py-1 px-1.5">Signal</th>
              </tr>
            </thead>
            <tbody>
              {pairs.sort((a, b) => b.pairedOpportunities - a.pairedOpportunities).slice(0, 25).map((pair, i) => (
                <tr key={i} className="border-b border-border/10 hover:bg-muted/5">
                  <td className="py-1 px-1.5">{agentIcon(pair.agentA)} {agentName(pair.agentA)}</td>
                  <td className="py-1 px-1.5">{agentIcon(pair.agentB)} {agentName(pair.agentB)}</td>
                  <td className="text-right py-1 px-1.5 font-mono">{pair.pairedOpportunities}</td>
                  <td className="text-center py-1 px-1.5">
                    <Progress value={pair.sampleProgressSoft * 100} className="h-1 w-12 mx-auto" />
                  </td>
                  <td className="text-center py-1 px-1.5">
                    <Progress value={pair.sampleProgressHard * 100} className="h-1 w-12 mx-auto" />
                  </td>
                  <td className="text-center py-1 px-1.5">
                    <Badge variant="outline" className={cn('text-[8px] px-1', maturityColor[pair.maturityLevel])}>
                      {pair.maturityLevel}
                    </Badge>
                  </td>
                  <td className={cn('text-right py-1 px-1.5 font-mono', pair.delta >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                    {pair.delta >= 0 ? '+' : ''}{pair.delta}p
                  </td>
                  <td className="text-right py-1 px-1.5 font-mono text-muted-foreground">{pair.deltaStability}</td>
                  <td className="text-right py-1 px-1.5 font-mono">
                    {pair.positiveEnvKeys}/{pair.envKeyCount}
                  </td>
                  <td className="text-center py-1 px-1.5">
                    <Badge variant="outline" className={cn('text-[8px] px-1',
                      pair.earlySignal === 'Early Synergy Candidate' ? 'text-neural-green' :
                      pair.earlySignal === 'Early Conflict Candidate' ? 'text-neural-red' :
                      'text-muted-foreground'
                    )}>
                      {pair.earlySignal === 'Neutral' ? '—' : pair.earlySignal.replace('Early ', '').replace(' Candidate', '')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[8px] text-muted-foreground text-center italic">
        This panel is purely diagnostic. No routing, weighting, or authority decisions are made here.
      </p>
    </motion.div>
  );
};
