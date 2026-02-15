// OrderBook Heatmap — Visualizes OANDA order book clusters as a retail pain zone map
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useOrderBookData, type PairOrderBook } from '@/hooks/useOrderBookData';

function HeatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-3 w-full rounded-full bg-muted/30 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

function PairHeatmap({ book }: { book: PairOrderBook }) {
  const maxPct = useMemo(() => {
    const allPcts = [
      ...book.longClusters.map(c => c.longPct),
      ...book.shortClusters.map(c => c.shortPct),
    ];
    return Math.max(...allPcts, 1);
  }, [book]);

  return (
    <div className="bg-muted/15 rounded-lg px-3 py-2.5 hover:bg-muted/25 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono font-bold text-foreground text-[11px]">{book.pair}</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
          @{parseFloat(book.currentPrice).toFixed(book.pair.includes('JPY') ? 3 : 5)}
        </Badge>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {book.retailStopZones.length} zones
        </span>
      </div>

      {/* Long clusters (buy stops above) */}
      {book.longClusters.length > 0 && (
        <div className="space-y-0.5 mb-1.5">
          <span className="text-[9px] font-bold text-emerald-400/80 uppercase flex items-center gap-1">
            <TrendingUp className="w-2.5 h-2.5" /> Long Clusters
          </span>
          {book.longClusters.slice(0, 3).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="font-mono text-muted-foreground w-16 text-right">{c.price}</span>
              <div className="flex-1">
                <HeatBar value={c.longPct} max={maxPct} color="bg-gradient-to-r from-emerald-500/60 to-emerald-400/80" />
              </div>
              <span className="font-mono text-emerald-400 w-10 text-right">{c.longPct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Short clusters (sell stops below) */}
      {book.shortClusters.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold text-red-400/80 uppercase flex items-center gap-1">
            <TrendingDown className="w-2.5 h-2.5" /> Short Clusters
          </span>
          {book.shortClusters.slice(0, 3).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="font-mono text-muted-foreground w-16 text-right">{c.price}</span>
              <div className="flex-1">
                <HeatBar value={c.shortPct} max={maxPct} color="bg-gradient-to-r from-red-500/60 to-red-400/80" />
              </div>
              <span className="font-mono text-red-400 w-10 text-right">{c.shortPct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Retail stop zones summary */}
      {book.retailStopZones.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/20">
          <span className="text-[9px] font-bold text-amber-400/80 uppercase flex items-center gap-1">
            <Flame className="w-2.5 h-2.5" /> Wall of Pain
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {book.retailStopZones.map((z, i) => (
              <Badge
                key={i}
                className={`text-[8px] h-4 px-1.5 font-mono border-0 ${
                  z.type === 'long_cluster'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-red-500/15 text-red-400'
                }`}
              >
                {z.price} ({z.pct.toFixed(1)}%)
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderBookHeatmap() {
  const { books, loading } = useOrderBookData(30_000);

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Eye className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Loading order book data…
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Eye className="w-8 h-8 mx-auto mb-2 opacity-20" />
        No order book data available — OANDA Market Intel may be loading
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
        <Flame className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">OrderBook Heatmap</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 font-mono">{books.length}</Badge>
      </div>
      <ScrollArea className="h-[450px]">
        <div className="p-3 space-y-2">
          {books.map((book) => (
            <PairHeatmap key={book.pair} book={book} />
          ))}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
