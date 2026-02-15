// Cross-Venue DOM Panel — Institutional Depth Proxy
import { motion } from 'framer-motion';
import { Layers, Shield, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OrderWall {
  price: number;
  side: string;
  pct: number;
  pipsDist: number;
}

interface DOMProfile {
  currentPrice: number;
  depthScore: number;
  retailBias: string;
  retailImbalance: number;
  topOrderWalls: OrderWall[];
  wallOfPain: { price: number; side: string; strength: number; pipsDist: number } | null;
}

interface Props {
  data: {
    profiles: Record<string, DOMProfile>;
    pairsScanned: number;
  } | null;
}

export function CrossVenueDOMPanel({ data }: Props) {
  if (!data || !data.profiles || Object.keys(data.profiles).length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-sm font-bold">Cross-Venue DOM</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run cross-venue-dom to populate (requires open market)</p>
      </div>
    );
  }

  const profiles = Object.entries(data.profiles);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          <h3 className="text-sm font-bold">Cross-Venue DOM</h3>
          <Badge variant="outline" className="text-[8px] border-[hsl(var(--neural-purple))]/40 text-[hsl(var(--neural-purple))]">
            {data.pairsScanned} PAIRS
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {profiles.map(([pair, p]) => {
          const depthColor = p.depthScore > 60 ? 'text-[hsl(var(--neural-green))]'
            : p.depthScore > 30 ? 'text-[hsl(var(--neural-orange))]'
            : 'text-[hsl(var(--neural-red))]';

          const biasIcon = p.retailBias === 'NET_LONG'
            ? <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))]" />
            : <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))]" />;

          return (
            <div key={pair} className="p-2.5 rounded-lg bg-background/30 border border-border/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold">{pair.replace('_', '/')}</span>
                  {biasIcon}
                  <span className="text-[8px] text-muted-foreground">
                    Retail {p.retailBias.replace('NET_', '')} ({p.retailImbalance}% imbalance)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-muted-foreground" />
                  <span className={`text-[10px] font-mono font-bold ${depthColor}`}>
                    {p.depthScore}/100
                  </span>
                </div>
              </div>

              {/* Depth bar */}
              <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${p.depthScore}%`,
                    background: p.depthScore > 60 ? 'hsl(var(--neural-green))'
                      : p.depthScore > 30 ? 'hsl(var(--neural-orange))'
                      : 'hsl(var(--neural-red))',
                  }}
                />
              </div>

              {/* Order walls */}
              {p.topOrderWalls.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.topOrderWalls.slice(0, 3).map((w, i) => (
                    <div key={i} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-mono ${
                      w.side === 'BUY_LIMIT'
                        ? 'bg-[hsl(var(--neural-green))]/10 text-[hsl(var(--neural-green))]'
                        : 'bg-[hsl(var(--neural-red))]/10 text-[hsl(var(--neural-red))]'
                    }`}>
                      <Target className="w-2 h-2" />
                      {w.side.replace('_LIMIT', '')} @ {w.pipsDist}p ({w.pct.toFixed(1)}%)
                    </div>
                  ))}
                </div>
              )}

              {/* Wall of Pain */}
              {p.wallOfPain && (
                <div className="flex items-center gap-1.5 text-[8px] text-[hsl(var(--neural-orange))]">
                  <Target className="w-2.5 h-2.5" />
                  Wall of Pain: {p.wallOfPain.side} @ {p.wallOfPain.pipsDist}p away ({p.wallOfPain.strength.toFixed(1)}%)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
