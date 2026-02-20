// STRIKE signal card — fired when all 3 gates pass
import { motion } from 'framer-motion';
import { Zap, ArrowUpRight, ArrowDownRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MatrixSignal, TIER_UNITS, pips } from '@/hooks/useSovereignMatrix';
import { GateIndicator } from './GateIndicator';

interface Props {
  signal: MatrixSignal;
  onFireT1: () => void;
  onFireT2: () => void;
  onFireT3: () => void;
  loading: boolean;
}

export const StrikeCard = ({ signal, onFireT1, onFireT2, onFireT3, loading }: Props) => {
  const isLong = signal.direction === 'long';
  const DirIcon = isLong ? ArrowUpRight : ArrowDownRight;
  const pair = signal.instrument.replace('_', '/');
  const isJPY = signal.instrument.includes('JPY');

  const hardSL = (signal.currentPrice - (isLong ? 1 : -1) * pips(15, signal.instrument)).toFixed(isJPY ? 3 : 5);
  const hardTP = (signal.currentPrice + (isLong ? 1 : -1) * pips(50, signal.instrument)).toFixed(isJPY ? 3 : 5);
  const ratchetAt = (signal.currentPrice + (isLong ? 1 : -1) * pips(20, signal.instrument)).toFixed(isJPY ? 3 : 5);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-4 rounded-xl border border-neural-green/40 bg-neural-green/5 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-neural-green" />
          <span className="font-display font-bold text-sm text-neural-green">TRIPLE-LOCK STRIKE</span>
          <Badge className="text-[8px] h-4 px-1.5 bg-neural-green/20 text-neural-green border-0">
            3/3 GATES
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <DirIcon className={cn('w-4 h-4', isLong ? 'text-neural-green' : 'text-neural-red')} />
          <span className={cn('font-mono font-bold text-xs', isLong ? 'text-neural-green' : 'text-neural-red')}>
            {signal.direction?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Pair + Price */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono font-bold text-lg">{pair}</span>
        <span className="font-mono text-sm text-muted-foreground">
          @ {signal.currentPrice.toFixed(isJPY ? 3 : 5)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {signal.baseCurrency} ({signal.baseScore > 0 ? '+' : ''}{signal.baseScore}) vs {signal.quoteCurrency} ({signal.quoteScore > 0 ? '+' : ''}{signal.quoteScore})
        </span>
      </div>

      {/* Gate breakdown */}
      <div className="flex flex-wrap gap-1.5">
        <GateIndicator
          label="G1 Matrix"
          passed={signal.gate1}
          detail={`${signal.baseCurrency}${signal.baseScore >= 0 ? '+' : ''}${signal.baseScore} / ${signal.quoteCurrency}${signal.quoteScore >= 0 ? '+' : ''}${signal.quoteScore}`}
        />
        <GateIndicator
          label="G2 Atlas Snap"
          passed={signal.gate2}
          detail={isLong
            ? `C ${signal.gate2Detail.close.toFixed(isJPY ? 3 : 5)} > H20 ${signal.gate2Detail.highest20.toFixed(isJPY ? 3 : 5)}`
            : `C ${signal.gate2Detail.close.toFixed(isJPY ? 3 : 5)} < L20 ${signal.gate2Detail.lowest20.toFixed(isJPY ? 3 : 5)}`
          }
        />
        <GateIndicator
          label="G3 David Vector"
          passed={signal.gate3}
          detail={`m ${signal.gate3Detail.slope > 0 ? '+' : ''}${signal.gate3Detail.slope.toExponential(2)}`}
        />
      </div>

      {/* Risk rails */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="p-1.5 rounded bg-neural-red/10 border border-neural-red/20 text-center">
          <span className="text-neural-red block font-mono font-bold">Hard SL</span>
          <span className="text-muted-foreground font-mono">{hardSL}</span>
          <span className="text-neural-red/60"> (-15p)</span>
        </div>
        <div className="p-1.5 rounded bg-primary/10 border border-primary/20 text-center">
          <span className="text-primary block font-mono font-bold">Ratchet @</span>
          <span className="text-muted-foreground font-mono">{ratchetAt}</span>
          <span className="text-primary/60"> (+20p)</span>
        </div>
        <div className="p-1.5 rounded bg-neural-green/10 border border-neural-green/20 text-center">
          <span className="text-neural-green block font-mono font-bold">Hard TP</span>
          <span className="text-muted-foreground font-mono">{hardTP}</span>
          <span className="text-neural-green/60"> (+50p)</span>
        </div>
      </div>

      {/* Tier execution buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          size="sm"
          onClick={onFireT1}
          disabled={loading}
          className={cn(
            'text-[10px] h-8 font-mono font-bold',
            isLong
              ? 'bg-neural-green hover:bg-neural-green/80 text-background'
              : 'bg-neural-red hover:bg-neural-red/80 text-background'
          )}
        >
          <Zap className="w-3 h-3 mr-1" />
          T1 {TIER_UNITS.T1}u
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFireT2}
          disabled={loading}
          className="text-[10px] h-8 font-mono border-neural-green/30 text-neural-green hover:bg-neural-green/10"
        >
          T2 +15p {TIER_UNITS.T2}u
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFireT3}
          disabled={loading}
          className="text-[10px] h-8 font-mono border-primary/30 text-primary hover:bg-primary/10"
        >
          T3 +30p 250u
        </Button>
      </div>
    </motion.div>
  );
};
