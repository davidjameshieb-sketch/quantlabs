// Synthetic Pairs Panel — Shows weighted currency baskets as single tickers
import { motion } from 'framer-motion';
import { Layers, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSyntheticPairs } from '@/hooks/useSyntheticPairs';
import { PREBUILT_BASKETS } from '@/lib/forex/syntheticPairConstructor';

export function SyntheticPairsPanel() {
  const { quotes, loading } = useSyntheticPairs([], 10_000);

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Computing synthetic baskets…
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
        No pricing data available for synthetic baskets
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Layers className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Synthetic Baskets</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 font-mono">{quotes.length}</Badge>
      </div>
      <div className="p-3 space-y-2">
        {quotes.map((q) => {
          const basket = PREBUILT_BASKETS.find(b => b.name === q.name);
          const isUp = q.change > 0;
          const isFlat = q.change === 0;

          return (
            <div key={q.name} className="bg-muted/15 rounded-lg px-3 py-2.5 hover:bg-muted/25 transition-colors">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {isFlat ? (
                    <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : isUp ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className="font-mono font-bold text-foreground text-[11px]">{q.name}</span>
                </div>
                <span className="font-mono text-foreground text-[11px] ml-auto">
                  {q.value.toFixed(5)}
                </span>
                <Badge
                  className={`text-[9px] h-4 px-1.5 font-mono border-0 ${
                    isFlat
                      ? 'bg-muted text-muted-foreground'
                      : isUp
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {isUp ? '+' : ''}{q.changePct.toFixed(2)}%
                </Badge>
              </div>
              {basket?.description && (
                <p className="text-[9px] text-muted-foreground mt-0.5 pl-5">{basket.description}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-1 pl-5">
                {q.legs.map((leg) => (
                  <Badge key={leg.pair} variant="outline" className="text-[8px] h-3.5 px-1 font-mono">
                    {(leg.weight * 100).toFixed(0)}% {leg.pair.replace('_', '/')}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
