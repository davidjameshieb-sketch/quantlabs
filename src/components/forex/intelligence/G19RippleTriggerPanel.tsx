// G19 Correlation-Matrix Ripple Trigger — Currency Strength Heatmap + Anchor/Laggard Signals
import { motion } from 'framer-motion';
import { Zap, Target, TrendingUp, TrendingDown, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CurrencyStrength {
  currency: string;
  netPips: number;
  pairsUp: number;
  pairsDown: number;
  avgPips: number;
}

interface AnchorSignal {
  anchorCurrency: string;
  dominance: string;
  laggardPair: string;
  laggardGapPips: number;
  frontRunDirection: string;
  signal: string;
}

interface LaggardSignal {
  currency: string;
  loudCount: number;
  laggardPair: string;
  laggardMove: number;
  avgLoudMove: number;
  gapPips: number;
  direction: string;
  sizingMultiplier: number;
  signal: string;
}

interface Props {
  data: {
    strengths: CurrencyStrength[];
    anchorSignals: AnchorSignal[];
    laggardSignals: LaggardSignal[];
    strongest: string;
    weakest: string;
    generatedAt: string;
  } | null;
}

function strengthBar(netPips: number, maxAbs: number) {
  const pct = maxAbs > 0 ? Math.abs(netPips) / maxAbs : 0;
  const width = Math.max(pct * 100, 4);
  const isPos = netPips >= 0;
  return { width: `${width}%`, isPos };
}

export function G19RippleTriggerPanel({ data }: Props) {
  if (!data?.strengths?.length) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-sm font-bold">G19 Ripple Trigger</h3>
          <Badge variant="outline" className="text-[8px]">AWAITING DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run correlation-matrix to populate live currency strength</p>
      </div>
    );
  }

  const { strengths, anchorSignals, laggardSignals, strongest, weakest } = data;
  const maxAbs = Math.max(...strengths.map(s => Math.abs(s.netPips)), 1);
  const totalSignals = (anchorSignals?.length || 0) + (laggardSignals?.length || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-sm font-bold">G19 Currency Strength Heatmap</h3>
          {totalSignals > 0 && (
            <Badge className="text-[8px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30">
              {totalSignals} SIGNAL{totalSignals > 1 ? 'S' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-[7px] bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
            ↑ {strongest}
          </Badge>
          <Badge className="text-[7px] bg-[hsl(var(--neural-red))]/15 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
            ↓ {weakest}
          </Badge>
        </div>
      </div>

      {/* Currency Strength Bars */}
      <div className="space-y-1">
        {strengths.map((cs) => {
          const bar = strengthBar(cs.netPips, maxAbs);
          return (
            <div key={cs.currency} className="flex items-center gap-2 py-1">
              <span className="text-[10px] font-mono font-bold w-8 text-right">{cs.currency}</span>
              <div className="flex-1 h-4 rounded bg-muted/20 relative overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${
                    bar.isPos
                      ? 'bg-[hsl(var(--neural-green))]/60 ml-[50%]'
                      : 'bg-[hsl(var(--neural-red))]/60'
                  }`}
                  style={{
                    width: `calc(${bar.width} / 2)`,
                    ...(bar.isPos ? {} : { marginLeft: `calc(50% - ${bar.width} / 2)` }),
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-px h-full bg-border/40" />
                </div>
              </div>
              <div className="flex items-center gap-1 w-24 justify-end">
                <span className={`text-[9px] font-mono font-bold ${
                  (cs.netPips ?? 0) > 0 ? 'text-[hsl(var(--neural-green))]' : (cs.netPips ?? 0) < 0 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground'
                }`}>
                  {(cs.netPips ?? 0) > 0 ? '+' : ''}{(cs.netPips ?? 0).toFixed(1)}p
                </span>
                <span className="text-[8px] text-muted-foreground">
                  {cs.pairsUp}↑{cs.pairsDown}↓
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Anchor Signals */}
      {anchorSignals && anchorSignals.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
            <span className="text-[9px] font-bold text-[hsl(var(--neural-orange))] uppercase tracking-wider">Anchor Detections</span>
          </div>
          {anchorSignals.map((a, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--neural-orange))]/5 border border-[hsl(var(--neural-orange))]/20">
              {a.frontRunDirection === 'long'
                ? <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))] shrink-0" />
                : <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))] shrink-0" />
              }
              <span className="text-[8px] text-muted-foreground flex-1 leading-tight">
                <span className="text-[hsl(var(--neural-orange))] font-bold">{a.anchorCurrency}</span> {a.dominance} — 
151:                 Laggard <span className="font-mono font-bold">{a.laggardPair?.replace('_','/')}</span> gap {(a.laggardGapPips ?? 0).toFixed(1)}p
              </span>
              <Badge className="text-[7px] bg-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))]">
                FRONT-RUN {a.frontRunDirection?.toUpperCase()}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Laggard Sniper Signals */}
      {laggardSignals && laggardSignals.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowRightLeft className="w-3 h-3 text-[hsl(var(--neural-purple))]" />
            <span className="text-[9px] font-bold text-[hsl(var(--neural-purple))] uppercase tracking-wider">Laggard Sniper</span>
          </div>
          {laggardSignals.map((l, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--neural-purple))]/5 border border-[hsl(var(--neural-purple))]/20">
              <ShieldAlert className="w-3 h-3 text-[hsl(var(--neural-purple))] shrink-0" />
              <span className="text-[8px] text-muted-foreground flex-1 leading-tight">
                <span className="font-mono font-bold">{l.laggardPair?.replace('_','/')}</span> flat ({(l.laggardMove ?? 0).toFixed(1)}p) while {l.currency}-bloc avg {(l.avgLoudMove ?? 0).toFixed(1)}p
              </span>
              <Badge className="text-[7px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]">
                {l.direction?.toUpperCase()} 1.5x
              </Badge>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
