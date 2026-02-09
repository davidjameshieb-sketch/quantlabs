import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import type { GovernancePassStats } from '@/lib/forex/governanceAnalytics';

const SESSION_LABELS: Record<string, string> = {
  asian: 'Asian', 'london-open': 'London', 'ny-overlap': 'NY Overlap', 'late-ny': 'Late NY',
};

interface Props { passStats: GovernancePassStats; }

export function GovernancePassRateCard({ passStats }: Props) {
  return (
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
  );
}
