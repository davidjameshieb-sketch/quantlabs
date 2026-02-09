import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import type { GovernanceAlert } from '@/lib/forex/governanceAlerts';

interface Props { alerts: GovernanceAlert[]; }

export function GovernanceAlertsCard({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
          Recent Alerts ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {alerts.map((a, i) => (
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
  );
}
