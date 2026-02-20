// All scanned pairs with gate status — shows partial alignment too
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle } from 'lucide-react';
import { MatrixSignal } from '@/hooks/useSovereignMatrix';

interface Props {
  signals: MatrixSignal[];
}

export const SignalTable = ({ signals }: Props) => {
  if (!signals.length) return null;

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_28px_28px_28px_60px] text-[9px] text-muted-foreground font-mono bg-muted/10 px-3 py-1.5 border-b border-border/30">
        <span>PAIR</span>
        <span>DIRECTION</span>
        <span title="Matrix Alignment">G1</span>
        <span title="Atlas Snap">G2</span>
        <span title="David Vector">G3</span>
        <span>PRICE</span>
      </div>
      <div className="divide-y divide-border/20 max-h-64 overflow-y-auto">
        {signals.map((s) => {
          const gateCount = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
          const isJPY = s.instrument.includes('JPY');
          return (
            <div
              key={s.instrument}
              className={cn(
                'grid grid-cols-[1fr_80px_28px_28px_28px_60px] px-3 py-1.5 text-[10px] font-mono items-center',
                s.triplelock && 'bg-neural-green/5'
              )}
            >
              <span className={cn('font-bold', s.triplelock && 'text-neural-green')}>
                {s.instrument.replace('_', '/')}
              </span>
              <span className={cn(
                'text-[9px]',
                s.direction === 'long' && 'text-neural-green',
                s.direction === 'short' && 'text-neural-red',
                !s.direction && 'text-muted-foreground/40'
              )}>
                {s.direction?.toUpperCase() || '—'}
                {s.direction && <span className="ml-1 opacity-50">({gateCount}/3)</span>}
              </span>
              <GateDot passed={s.gate1} />
              <GateDot passed={s.gate2} />
              <GateDot passed={s.gate3} />
              <span className="text-muted-foreground">{s.currentPrice.toFixed(isJPY ? 3 : 5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function GateDot({ passed }: { passed: boolean }) {
  if (passed) return <CheckCircle2 className="w-3 h-3 text-neural-green" />;
  return <XCircle className="w-3 h-3 text-muted-foreground/20" />;
}
