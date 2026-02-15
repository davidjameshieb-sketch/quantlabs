// Dark Pool Proxy — Liquidity Depth Visualization
import { motion } from 'framer-motion';
import { Droplets, AlertTriangle, Target, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DarkPoolProfile } from '@/hooks/useIntelligenceState';

interface Props {
  profiles: DarkPoolProfile[];
}

export function DarkPoolPanel({ profiles }: Props) {
  if (!profiles?.length) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Droplets className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-sm font-bold">Dark Pool Proxy</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run dark-pool-proxy to populate</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-sm font-bold">Liquidity Depth Map</h3>
          <Badge variant="outline" className="text-[8px] border-[hsl(var(--neural-cyan))]/40 text-[hsl(var(--neural-cyan))]">
            DARK POOL
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {profiles.map(p => {
          const depthColor = p.totalDepthScore > 50 ? 'text-[hsl(var(--neural-green))]'
            : p.totalDepthScore > 20 ? 'text-[hsl(var(--neural-orange))]'
            : 'text-[hsl(var(--neural-red))]';

          return (
            <div key={p.instrument} className="p-2 rounded-lg bg-background/30 border border-border/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold">{p.instrument.replace('_', '/')}</span>
                <span className={`text-[10px] font-mono font-bold ${depthColor}`}>
                  {p.totalDepthScore}/100
                </span>
              </div>

              {/* Depth bar */}
              <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${p.totalDepthScore}%`,
                    background: p.totalDepthScore > 50
                      ? 'hsl(var(--neural-green))'
                      : p.totalDepthScore > 20
                      ? 'hsl(var(--neural-orange))'
                      : 'hsl(var(--neural-red))',
                  }}
                />
              </div>

              {/* Thin zones */}
              {p.thinZones.length > 0 && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-[hsl(var(--neural-orange))]" />
                  <span className="text-[8px] text-[hsl(var(--neural-orange))]">
                    {p.thinZones.length} thin zone{p.thinZones.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Optimal entry */}
              {p.optimalEntryZone && (
                <div className="flex items-center gap-1">
                  <Target className="w-2.5 h-2.5 text-[hsl(var(--neural-green))]" />
                  <span className="text-[8px] text-muted-foreground">
                    {p.optimalEntryZone.side} @ {p.optimalEntryZone.price.toFixed(p.instrument.includes('JPY') ? 3 : 5)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
