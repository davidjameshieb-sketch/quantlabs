// G21 COT God Signal Panel — CFTC Smart Money vs Retail Divergence
import { motion } from 'framer-motion';
import { Crown, Shield, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface COTCurrency {
  currency: string;
  specPctLong: number;
  retailPctLong: number;
  smartMoneyBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  retailBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  godSignal: string | null;
  godSignalStrength: number;
  weeklyChange: {
    specNetChange: number;
    commNetChange: number;
    retailNetChange: number;
    oiChange: number;
  } | null;
}

interface PairSignal {
  pair: string;
  signal: string;
  strength: number;
  baseCOT: string;
  quoteCOT: string;
}

interface Props {
  data: {
    masterDirective: string;
    godSignals: string[];
    byCurrency: Record<string, COTCurrency>;
    strongestPairSignals: PairSignal[];
    timestamp: string;
  } | null;
}

function biasColor(bias: string) {
  if (bias === 'LONG') return 'text-[hsl(var(--neural-green))]';
  if (bias === 'SHORT') return 'text-[hsl(var(--neural-red))]';
  return 'text-muted-foreground';
}

function biasBg(bias: string) {
  if (bias === 'LONG') return 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30';
  if (bias === 'SHORT') return 'bg-[hsl(var(--neural-red))]/15 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30';
  return 'bg-muted/15 text-muted-foreground border-border/30';
}

function strengthBg(strength: number) {
  if (strength >= 80) return 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/40';
  if (strength >= 50) return 'bg-[hsl(var(--neural-cyan))]/15 text-[hsl(var(--neural-cyan))] border-[hsl(var(--neural-cyan))]/30';
  return 'bg-muted/10 text-muted-foreground border-border/20';
}

export function COTGodSignalPanel({ data }: Props) {
  if (!data?.byCurrency || Object.keys(data.byCurrency).length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">G21 COT God Signal</h3>
          <Badge variant="outline" className="text-[8px]">AWAITING DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run forex-cot-data to fetch CFTC positioning</p>
      </div>
    );
  }

  const currencies = Object.values(data.byCurrency).sort((a, b) => b.godSignalStrength - a.godSignalStrength);
  const godActive = currencies.filter(c => c.godSignalStrength >= 50);
  const { masterDirective, strongestPairSignals } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">G21 COT God Signal</h3>
          {godActive.length > 0 && (
            <Badge className={`text-[8px] ${godActive[0].godSignalStrength >= 80
              ? 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/40'
              : 'bg-[hsl(var(--neural-cyan))]/15 text-[hsl(var(--neural-cyan))] border-[hsl(var(--neural-cyan))]/30'
            }`}>
              {godActive.length} GOD SIGNAL{godActive.length > 1 ? 'S' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Master Directive */}
      <div className={`p-2 rounded-lg border text-[9px] leading-relaxed ${
        masterDirective.includes('GOD SIGNAL ACTIVE')
          ? 'bg-[hsl(var(--neural-orange))]/5 border-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]'
          : masterDirective.includes('DIVERGENCE')
          ? 'bg-[hsl(var(--neural-cyan))]/5 border-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))]'
          : 'bg-muted/5 border-border/20 text-muted-foreground'
      }`}>
        {masterDirective}
      </div>

      {/* Currency Positioning Grid */}
      <div className="space-y-1 max-h-[220px] overflow-y-auto">
        {currencies.map((c) => (
          <div key={c.currency} className="flex items-center gap-2 p-1.5 rounded bg-background/20 border border-border/10">
            <span className="text-[10px] font-mono font-bold w-8">{c.currency}</span>
            
            {/* Spec vs Retail bar */}
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-3 rounded-full bg-muted/15 overflow-hidden relative">
                {/* Spec long % */}
                <div
                  className="absolute inset-y-0 left-0 bg-[hsl(var(--neural-cyan))]/50 rounded-l-full"
                  style={{ width: `${c.specPctLong}%` }}
                />
                {/* Retail long % as thin overlay */}
                <div
                  className="absolute inset-y-0 left-0 border-r-2 border-[hsl(var(--neural-red))]"
                  style={{ width: `${c.retailPctLong}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-px h-full bg-border/40" style={{ marginLeft: '50%' }} />
                </div>
              </div>
            </div>

            {/* Labels */}
            <div className="flex items-center gap-1 w-28 justify-end">
              <span className={`text-[8px] font-mono ${biasColor(c.smartMoneyBias)}`}>
                S:{c.specPctLong.toFixed(0)}%
              </span>
              <span className={`text-[8px] font-mono ${biasColor(c.retailBias)}`}>
                R:{c.retailPctLong.toFixed(0)}%
              </span>
              {c.godSignalStrength >= 50 && (
                <Badge className={`text-[6px] px-1 py-0 ${strengthBg(c.godSignalStrength)}`}>
                  {c.godSignalStrength}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Strongest Pair Signals */}
      {strongestPairSignals && strongestPairSignals.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
            <span className="text-[9px] font-bold text-[hsl(var(--neural-orange))] uppercase tracking-wider">Institutional Pair Signals</span>
          </div>
          {strongestPairSignals.slice(0, 6).map((ps, i) => {
            const isLong = ps.signal.includes('LONG');
            return (
              <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-background/20 border border-border/10">
                {isLong
                  ? <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))] shrink-0" />
                  : <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))] shrink-0" />
                }
                <span className="text-[9px] font-mono font-bold">{ps.pair.replace('_','/')}</span>
                <span className="text-[8px] text-muted-foreground flex-1 truncate">{ps.signal}</span>
                <Badge className={`text-[7px] ${biasBg(isLong ? 'LONG' : 'SHORT')}`}>
                  {ps.strength}%
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
