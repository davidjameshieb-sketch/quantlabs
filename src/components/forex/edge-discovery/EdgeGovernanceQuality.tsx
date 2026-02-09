// Section 8: Governance Quality Check
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import type { GovernanceQuality } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  quality: GovernanceQuality;
}

const StatRow = ({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) => (
  <div className="flex justify-between items-center py-1 border-b border-border/10 last:border-0">
    <span className="text-[10px] text-muted-foreground">{label}</span>
    <span className={`text-xs font-mono font-bold ${colorClass || ''}`}>{value}</span>
  </div>
);

export const EdgeGovernanceQuality = ({ quality }: Props) => {
  const accuracy = (quality.governanceAccuracy * 100).toFixed(1);
  const isGood = quality.governanceAccuracy > 0.6;

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-bold">Governance Quality Check</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${isGood ? 'border-neural-green/50 text-neural-green' : 'border-neural-red/50 text-neural-red'}`}
          >
            {accuracy}% accuracy
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Approved */}
          <div className="border border-neural-green/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle className="w-3.5 h-3.5 text-neural-green" />
              <span className="text-xs font-bold">Approved</span>
            </div>
            <StatRow label="Trades" value={quality.approvedTrades.toString()} />
            <StatRow
              label="Expectancy"
              value={`${quality.approvedExpectancy > 0 ? '+' : ''}${quality.approvedExpectancy}p`}
              colorClass={quality.approvedExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}
            />
            <StatRow
              label="Win Rate"
              value={`${(quality.approvedWinRate * 100).toFixed(1)}%`}
              colorClass={quality.approvedWinRate > 0.5 ? 'text-neural-green' : 'text-neural-red'}
            />
            <StatRow label="False Positives" value={quality.falsePositives.toString()} colorClass="text-neural-orange" />
          </div>

          {/* Rejected */}
          <div className="border border-neural-red/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <XCircle className="w-3.5 h-3.5 text-neural-red" />
              <span className="text-xs font-bold">Rejected</span>
            </div>
            <StatRow label="Trades" value={quality.rejectedTrades.toString()} />
            <StatRow
              label="Expectancy"
              value={`${quality.rejectedExpectancy > 0 ? '+' : ''}${quality.rejectedExpectancy}p`}
              colorClass={quality.rejectedExpectancy < 0 ? 'text-neural-green' : 'text-neural-red'}
            />
            <StatRow
              label="Win Rate"
              value={`${(quality.rejectedWinRate * 100).toFixed(1)}%`}
            />
            <StatRow label="False Negatives" value={quality.falseNegatives.toString()} colorClass="text-neural-orange" />
          </div>

          {/* Throttled */}
          <div className="border border-neural-orange/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3.5 h-3.5 text-neural-orange" />
              <span className="text-xs font-bold">Throttled</span>
            </div>
            <StatRow label="Trades" value={quality.throttledTrades.toString()} />
            <StatRow
              label="Expectancy"
              value={`${quality.throttledExpectancy > 0 ? '+' : ''}${quality.throttledExpectancy}p`}
              colorClass={quality.throttledExpectancy > 0 ? 'text-neural-green' : 'text-neural-red'}
            />
            <StatRow
              label="Win Rate"
              value={`${(quality.throttledWinRate * 100).toFixed(1)}%`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
