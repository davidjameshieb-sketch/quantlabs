// Correlation Matrix Heatmap with Decoupling Alerts
import { motion } from 'framer-motion';
import { Grid3X3, Unlink, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CorrelationEntry, DecouplingAlert } from '@/hooks/useIntelligenceState';

interface Props {
  matrix: CorrelationEntry[];
  alerts: DecouplingAlert[];
}

function corrColor(r: number): string {
  if (r > 0.7) return 'bg-[hsl(var(--neural-green))]/80';
  if (r > 0.3) return 'bg-[hsl(var(--neural-green))]/30';
  if (r > -0.3) return 'bg-muted/30';
  if (r > -0.7) return 'bg-[hsl(var(--neural-red))]/30';
  return 'bg-[hsl(var(--neural-red))]/80';
}

function corrText(r: number): string {
  if (r > 0.7) return 'text-[hsl(var(--neural-green))]';
  if (r > 0.3) return 'text-[hsl(var(--neural-green))]/70';
  if (r > -0.3) return 'text-muted-foreground';
  if (r > -0.7) return 'text-[hsl(var(--neural-red))]/70';
  return 'text-[hsl(var(--neural-red))]';
}

export function CorrelationMatrixPanel({ matrix, alerts }: Props) {
  if (!matrix?.length) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Grid3X3 className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-sm font-bold">Correlation Matrix</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run correlation-matrix to populate</p>
      </div>
    );
  }

  // Sort: decoupled first, then by absolute correlation
  const sorted = [...matrix].sort((a, b) => {
    if (a.decoupled && !b.decoupled) return -1;
    if (!a.decoupled && b.decoupled) return 1;
    return Math.abs(b.pearson) - Math.abs(a.pearson);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-sm font-bold">Correlation Heatmap</h3>
          {alerts.length > 0 && (
            <Badge className="text-[8px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30">
              {alerts.length} DECOUPLING{alerts.length > 1 ? 'S' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Decoupling Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-1">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--neural-orange))]/5 border border-[hsl(var(--neural-orange))]/20">
              <Unlink className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
              <span className="text-[9px] text-[hsl(var(--neural-orange))] flex-1">{a.signal}</span>
              {a.tradeable && (
                <Badge className="text-[7px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]">TRADE</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matrix grid */}
      <div className="grid grid-cols-1 gap-1 max-h-[280px] overflow-y-auto">
        {sorted.slice(0, 15).map((entry, i) => (
          <div key={i} className={`flex items-center justify-between p-1.5 rounded ${corrColor(entry.rolling20)} border border-border/10`}>
            <div className="flex items-center gap-1.5 min-w-0">
              {entry.rolling20 > 0
                ? <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))]" />
                : <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))]" />
              }
              <span className="text-[9px] font-mono truncate">
                {entry.pair1.replace('_','/')} ↔ {entry.pair2.replace('_','/')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold ${corrText(entry.rolling20)}`}>
                {entry.rolling20 > 0 ? '+' : ''}{entry.rolling20.toFixed(2)}
              </span>
              {entry.decoupled && (
                <Unlink className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
