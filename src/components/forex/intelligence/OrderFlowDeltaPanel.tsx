// L0 Order-Flow Delta Tracker Panel
import { motion } from 'framer-motion';
import { Activity, Target, TrendingUp, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OrderFlowDelta {
  pair: string;
  price: number;
  side: string;
  prevPct: number;
  currPct: number;
  deltaPct: number;
  isRoundNumber: boolean;
  pipsDist: number;
}

interface Props {
  data: {
    deltasDetected: number;
    topDeltas: OrderFlowDelta[];
    vacuumTargets: number;
    vacuumsArmed: number;
    pairsScanned: number;
    hadPreviousSnapshot: boolean;
    previousSnapshotAge: number | null;
    scanTime: string;
  } | null;
}

export function OrderFlowDeltaPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Order-Flow Delta</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Waiting for orderflow-delta-tracker to populate</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${
        data.vacuumsArmed > 0
          ? 'border-[hsl(var(--neural-orange))]/50 bg-[hsl(var(--neural-orange))]/5'
          : 'border-border/30 bg-card/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Order-Flow Delta</h3>
          {data.vacuumsArmed > 0 ? (
            <Badge className="text-[8px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30">
              <Crosshair className="w-2.5 h-2.5 mr-1" />
              {data.vacuumsArmed} VACUUM{data.vacuumsArmed > 1 ? 'S' : ''} ARMED
            </Badge>
          ) : data.deltasDetected > 0 ? (
            <Badge className="text-[8px] bg-primary/20 text-primary border-primary/30">
              {data.deltasDetected} DELTA{data.deltasDetected > 1 ? 'S' : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[8px]">STABLE</Badge>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground">{data.pairsScanned} pairs</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[16px] font-mono font-bold text-primary">{data.deltasDetected}</p>
          <p className="text-[8px] text-muted-foreground">Deltas</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[16px] font-mono font-bold text-[hsl(var(--neural-orange))]">{data.vacuumTargets}</p>
          <p className="text-[8px] text-muted-foreground">Targets</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[16px] font-mono font-bold text-[hsl(var(--neural-red))]">{data.vacuumsArmed}</p>
          <p className="text-[8px] text-muted-foreground">Armed</p>
        </div>
      </div>

      {/* Top deltas */}
      {data.topDeltas.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Top Stop Buildups</p>
          {data.topDeltas.slice(0, 5).map((d, i) => (
            <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-background/30">
              <Target className={`w-3 h-3 shrink-0 ${d.isRoundNumber ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground'}`} />
              <span className="text-[10px] font-mono font-bold w-16">{d.pair.replace('_', '/')}</span>
              <span className="text-[9px] text-muted-foreground">{d.side}</span>
              <div className="flex-1" />
              <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-red))]" />
              <span className="text-[10px] font-mono font-bold text-[hsl(var(--neural-red))]">
                +{d.deltaPct}%
              </span>
              {d.isRoundNumber && (
                <Badge className="text-[6px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]">RND</Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-2 rounded-lg bg-background/30 text-center">
          <p className="text-[10px] text-muted-foreground">
            {data.hadPreviousSnapshot ? 'No significant stop buildups detected' : 'Building baseline snapshot...'}
          </p>
        </div>
      )}
    </motion.div>
  );
}
