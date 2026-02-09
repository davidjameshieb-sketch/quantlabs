// Section 11: Output Summary Report
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, TrendingUp, TrendingDown, AlertTriangle, Shield, Activity } from 'lucide-react';
import type { EdgeDiscoveryResult } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  result: EdgeDiscoveryResult;
}

const Section = ({ icon: Icon, title, children, variant = 'default' }: { icon: any; title: string; children: React.ReactNode; variant?: string }) => (
  <div className={`border rounded-lg p-3 ${variant === 'danger' ? 'border-neural-red/20 bg-neural-red/5' : variant === 'success' ? 'border-neural-green/20 bg-neural-green/5' : 'border-border/20'}`}>
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={`w-3.5 h-3.5 ${variant === 'danger' ? 'text-neural-red' : variant === 'success' ? 'text-neural-green' : 'text-primary'}`} />
      <span className="text-xs font-bold">{title}</span>
    </div>
    <div className="text-[10px] space-y-1">{children}</div>
  </div>
);

export const EdgeOutputSummary = ({ result }: Props) => {
  const topClusters = result.clusters.filter(c => c.expectancy > 0 && !c.isWeak).slice(0, 5);
  const worstClusters = result.clusters.filter(c => c.expectancy < 0).slice(-3);

  // Find best/worst dimensions
  const bestPairs = result.heatmap['Symbol']?.filter(s => s.edgeClass === 'strong-positive').slice(0, 3) || [];
  const worstPairs = result.heatmap['Symbol']?.filter(s => s.edgeClass === 'strong-negative').slice(0, 3) || [];
  const bestSessions = result.heatmap['Session']?.filter(s => s.edgeClass === 'strong-positive') || [];
  const worstSessions = result.heatmap['Session']?.filter(s => s.edgeClass === 'strong-negative') || [];

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-xs font-display font-bold">Edge Discovery Report</span>
          <Badge variant="outline" className="text-[9px]">{result.globalSummary.totalTrades.toLocaleString()} trades analyzed</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Section icon={TrendingUp} title="STRONGEST EDGE ENVIRONMENTS" variant="success">
            {topClusters.length > 0 ? topClusters.map((c, i) => (
              <div key={i} className="font-mono">{c.label} → +{c.expectancy}p ({c.trades} trades)</div>
            )) : <div className="text-muted-foreground">No statistically significant positive edge clusters found.</div>}
            {bestPairs.length > 0 && (
              <div className="mt-1 pt-1 border-t border-border/20">
                <span className="text-muted-foreground">Best pairs: </span>
                {bestPairs.map(p => `${p.key} (+${p.expectancy}p)`).join(', ')}
              </div>
            )}
            {bestSessions.length > 0 && (
              <div>
                <span className="text-muted-foreground">Best sessions: </span>
                {bestSessions.map(s => `${s.key} (+${s.expectancy}p)`).join(', ')}
              </div>
            )}
          </Section>

          <Section icon={TrendingDown} title="WEAKEST ENVIRONMENTS" variant="danger">
            {worstClusters.length > 0 ? worstClusters.map((c, i) => (
              <div key={i} className="font-mono">{c.label} → {c.expectancy}p ({c.trades} trades)</div>
            )) : <div className="text-muted-foreground">No statistically significant negative edge clusters found.</div>}
            {worstPairs.length > 0 && (
              <div className="mt-1 pt-1 border-t border-border/20">
                <span className="text-muted-foreground">Worst pairs: </span>
                {worstPairs.map(p => `${p.key} (${p.expectancy}p)`).join(', ')}
              </div>
            )}
            {worstSessions.length > 0 && (
              <div>
                <span className="text-muted-foreground">Worst sessions: </span>
                {worstSessions.map(s => `${s.key} (${s.expectancy}p)`).join(', ')}
              </div>
            )}
          </Section>

          <Section icon={AlertTriangle} title="GOVERNANCE & DIRECTIONAL FAILURES">
            {result.failures.length > 0 ? result.failures.map((f, i) => (
              <div key={i}>
                <span className="font-mono text-neural-red">{f.dimension}: {f.key}</span>
                <span className="text-muted-foreground"> — {f.expectancy}p exp, {(f.winRate * 100).toFixed(1)}% WR</span>
              </div>
            )) : <div className="text-neural-green">No critical failures detected.</div>}
          </Section>

          <Section icon={Shield} title="SCORING & GOVERNANCE RELIABILITY">
            <div>
              <span className="text-muted-foreground">Scoring: </span>
              <span className={result.overallScoringVerdict === 'SCORING PREDICTIVE' ? 'text-neural-green' : 'text-neural-red'}>
                {result.overallScoringVerdict}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Governance accuracy: </span>
              <span className="font-mono">{(result.governanceQuality.governanceAccuracy * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">False positives: </span>
              <span className="font-mono text-neural-orange">{result.governanceQuality.falsePositives}</span>
              <span className="text-muted-foreground"> | False negatives: </span>
              <span className="font-mono text-neural-orange">{result.governanceQuality.falseNegatives}</span>
            </div>
          </Section>

          <Section icon={Activity} title="EDGE DECAY STATUS" variant={result.edgeDecayStatus === 'CRITICAL' ? 'danger' : result.edgeDecayStatus === 'STABLE' ? 'success' : 'default'}>
            <div className="font-mono font-bold">
              {result.edgeDecayStatus}
            </div>
            {result.decay.length > 0 && (
              <div>
                <span className="text-muted-foreground">Latest rolling exp: </span>
                <span className="font-mono">{result.decay[result.decay.length - 1].expectancy}p</span>
                <span className="text-muted-foreground"> | Sharpe: </span>
                <span className="font-mono">{result.decay[result.decay.length - 1].sharpe}</span>
              </div>
            )}
          </Section>

          <Section icon={FileText} title="SAMPLE CONFIDENCE">
            {Object.entries(result.sectionConfidence).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-muted-foreground capitalize">{k}:</span>
                <span className="font-mono">{v.sampleSize} trades</span>
                <Badge variant="outline" className={`text-[8px] ${v.reliable ? 'border-neural-green/30 text-neural-green' : 'border-neural-orange/30 text-neural-orange'}`}>
                  {v.reliable ? 'RELIABLE' : 'LOW CONFIDENCE'}
                </Badge>
              </div>
            ))}
          </Section>
        </div>
      </CardContent>
    </Card>
  );
};
