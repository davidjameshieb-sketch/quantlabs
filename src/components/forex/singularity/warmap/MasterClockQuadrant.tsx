import { motion } from 'framer-motion';
import { Clock, Volume2, Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WarMapState } from '@/hooks/useSovereignWarMap';

interface Props { state: WarMapState }

const REGIME_COLORS: Record<string, string> = {
  'RISK-ON': 'text-[hsl(var(--neural-green))]',
  'SYSTEMIC STRESS': 'text-[hsl(var(--neural-red))]',
  'LIQUIDITY TRAP': 'text-[hsl(var(--neural-orange))]',
};

const REGIME_BG: Record<string, string> = {
  'RISK-ON': 'border-[hsl(var(--neural-green))]/30 bg-[hsl(var(--neural-green))]/5',
  'SYSTEMIC STRESS': 'border-[hsl(var(--neural-red))]/30 bg-[hsl(var(--neural-red))]/5',
  'LIQUIDITY TRAP': 'border-[hsl(var(--neural-orange))]/30 bg-[hsl(var(--neural-orange))]/5',
};

export function MasterClockQuadrant({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3 relative overflow-hidden">
      {/* Background pulse */}
      <div className="absolute inset-0 opacity-5" style={{
        background: 'radial-gradient(circle at 30% 30%, hsl(var(--neural-cyan)), transparent 60%)',
      }} />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">I. The Master Clock</h3>
          <Badge variant="outline" className="text-[8px] ml-auto border-[hsl(var(--neural-cyan))]/40 text-[hsl(var(--neural-cyan))]">
            MACRO & SENTIMENT
          </Badge>
        </div>

        {/* Current Regime */}
        <motion.div
          className={cn('p-3 rounded-lg border text-center', REGIME_BG[state.currentRegime] || 'border-border/30')}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
        >
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Current Regime</p>
          <p className={cn('text-xl font-display font-black tracking-wider', REGIME_COLORS[state.currentRegime] || 'text-foreground')}>
            {state.currentRegime}
          </p>
        </motion.div>

        {/* Loudest Indicator */}
        <div className="p-2.5 rounded-lg border border-border/30 bg-muted/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-[hsl(var(--neural-magenta))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Lead Indicator (Loudest)</p>
          </div>
          <p className="text-sm font-mono font-bold text-[hsl(var(--neural-magenta))]">{state.loudestIndicator}</p>
          <p className="text-[9px] text-muted-foreground">{state.loudestDetail}</p>
        </div>

        {/* Sentiment Heatmap */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Thermometer className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sentiment Cross-Reference</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Crypto F&G', value: state.sentimentHeatmap.cryptoFearGreed != null ? String(state.sentimentHeatmap.cryptoFearGreed) : '—', sub: 'CoinGecko' },
              { label: 'CNN F&G', value: state.sentimentHeatmap.cnnFearGreed != null ? String(state.sentimentHeatmap.cnnFearGreed) : '—', sub: 'Markets' },
              { label: 'OANDA Bias', value: state.sentimentHeatmap.oandaRetailBias, sub: 'Retail' },
            ].map(s => (
              <div key={s.label} className="p-2 rounded border border-border/20 text-center">
                <p className="text-[7px] text-muted-foreground uppercase">{s.label}</p>
                <p className="text-sm font-mono font-bold text-foreground">{s.value}</p>
                <p className="text-[7px] text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
