import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, CheckCircle2, XCircle } from 'lucide-react';
import type { ShadowModeIntegrity } from '@/lib/forex/governanceValidation';
import type { DataAvailabilityStats } from '@/lib/forex/governanceAnalytics';

interface Props {
  shadowIntegrity: ShadowModeIntegrity;
  dataAvail: DataAvailabilityStats;
}

export function ShadowDataCard({ shadowIntegrity, dataAvail }: Props) {
  return (
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
            : <XCircle className="w-3.5 h-3.5 text-neural-red" />}
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
  );
}
