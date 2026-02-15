// Flash-Crash Kill-Switch Monitor
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, AlertOctagon, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FlashAlert {
  pair: string;
  maxVelocity: number;
  avgVelocity: number;
  threshold: number;
  velocityRatio: number;
  movePips: number;
  direction: string;
  severity: string;
  trigger: string;
}

interface Props {
  data: {
    alertCount: number;
    isCascade: boolean;
    hasExtreme: boolean;
    alerts: FlashAlert[];
    allClear: boolean;
    scannedPairs: number;
  } | null;
}

export function FlashCrashPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[hsl(var(--neural-red))]" />
          <h3 className="text-sm font-bold">Flash-Crash Kill-Switch</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run flash-crash-killswitch to populate</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${
        data.hasExtreme ? 'border-[hsl(var(--neural-red))]/50 bg-[hsl(var(--neural-red))]/5'
        : data.isCascade ? 'border-[hsl(var(--neural-orange))]/50 bg-[hsl(var(--neural-orange))]/5'
        : 'border-border/30 bg-card/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${data.allClear ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'}`} />
          <h3 className="text-sm font-bold">Flash-Crash Kill-Switch</h3>
          {data.allClear ? (
            <Badge className="text-[8px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
              ALL CLEAR
            </Badge>
          ) : (
            <Badge className={`text-[8px] ${
              data.hasExtreme
                ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30'
                : 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30'
            }`}>
              <AlertOctagon className="w-2.5 h-2.5 mr-1" />
              {data.hasExtreme ? 'EXTREME' : data.isCascade ? 'CASCADE' : `${data.alertCount} ALERT${data.alertCount > 1 ? 'S' : ''}`}
            </Badge>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground">
          <Radio className="w-3 h-3 inline mr-1" />
          {data.scannedPairs} pairs scanned
        </span>
      </div>

      {data.allClear ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(var(--neural-green))]/5 border border-[hsl(var(--neural-green))]/20">
          <ShieldCheck className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          <div>
            <p className="text-[10px] font-bold text-[hsl(var(--neural-green))]">No anomalous velocity detected</p>
            <p className="text-[8px] text-muted-foreground">All {data.scannedPairs} pairs within normal tick velocity ranges</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${
              a.severity === 'EXTREME'
                ? 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/30'
                : 'bg-[hsl(var(--neural-orange))]/10 border-[hsl(var(--neural-orange))]/30'
            }`}>
              <Zap className={`w-3.5 h-3.5 shrink-0 ${
                a.severity === 'EXTREME' ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-orange))]'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold">{a.pair.replace('_', '/')}</span>
                  <Badge className={`text-[6px] ${
                    a.direction === 'UP'
                      ? 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]'
                      : 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
                  }`}>
                    {a.direction} {a.movePips > 0 ? '+' : ''}{a.movePips}p
                  </Badge>
                </div>
                <p className="text-[8px] text-muted-foreground">
                  {a.maxVelocity} p/5s ({a.velocityRatio}x normal) · Threshold: {a.threshold}
                </p>
              </div>
              <Badge className={`text-[7px] shrink-0 ${
                a.severity === 'EXTREME'
                  ? 'bg-[hsl(var(--neural-red))]/30 text-[hsl(var(--neural-red))]'
                  : 'bg-[hsl(var(--neural-orange))]/30 text-[hsl(var(--neural-orange))]'
              }`}>
                {a.severity}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
