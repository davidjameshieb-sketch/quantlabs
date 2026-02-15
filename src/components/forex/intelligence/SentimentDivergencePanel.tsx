// Sentiment Divergence — Retail vs Institutional Trap Detector
import { motion } from 'framer-motion';
import { Users, Crosshair, Shield, AlertOctagon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SentimentProfile } from '@/hooks/useIntelligenceState';

interface Props {
  profiles: SentimentProfile[];
}

export function SentimentDivergencePanel({ profiles }: Props) {
  if (!profiles?.length) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">Sentiment Divergence</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
      </div>
    );
  }

  const traps = profiles.filter(p => p.actionable);
  const sorted = [...profiles].sort((a, b) => b.divergenceScore - a.divergenceScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">Retail vs Institutional</h3>
          {traps.length > 0 && (
            <Badge className="text-[8px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
              {traps.length} TRAP{traps.length > 1 ? 'S' : ''}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map(p => {
          const isTrap = p.trapDirection !== 'NO_TRAP' && p.actionable;
          const trapColor = p.trapDirection === 'LONG_TRAP'
            ? 'border-[hsl(var(--neural-red))]/30 bg-[hsl(var(--neural-red))]/5'
            : p.trapDirection === 'SHORT_TRAP'
            ? 'border-[hsl(var(--neural-green))]/30 bg-[hsl(var(--neural-green))]/5'
            : 'border-border/20 bg-background/30';

          return (
            <div key={p.instrument} className={`p-2.5 rounded-lg border ${trapColor} space-y-1.5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold">{p.instrument.replace('_', '/')}</span>
                  {isTrap && (
                    <Badge className={`text-[7px] ${
                      p.trapDirection === 'LONG_TRAP'
                        ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
                        : 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]'
                    }`}>
                      {p.trapDirection === 'LONG_TRAP' ? '🎯 LONG TRAP' : '🎯 SHORT TRAP'}
                    </Badge>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  Inst: {p.institutionalBias || 'N/A'}
                </span>
              </div>

              {/* Sentiment bar */}
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-[hsl(var(--neural-green))]">L {p.retailLongPct}%</span>
                <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden flex">
                  <div
                    className="h-full bg-[hsl(var(--neural-green))]/60"
                    style={{ width: `${p.retailLongPct}%` }}
                  />
                  <div
                    className="h-full bg-[hsl(var(--neural-red))]/60"
                    style={{ width: `${p.retailShortPct}%` }}
                  />
                </div>
                <span className="text-[8px] text-[hsl(var(--neural-red))]">S {p.retailShortPct}%</span>
              </div>

              {/* Divergence score */}
              {p.divergenceScore > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertOctagon className="w-2.5 h-2.5 text-[hsl(var(--neural-orange))]" />
                  <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[hsl(var(--neural-orange))]"
                      style={{ width: `${p.divergenceScore}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-[hsl(var(--neural-orange))]">{p.divergenceScore}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
