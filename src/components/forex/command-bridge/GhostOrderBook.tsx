// Ghost Order Book — P4 Microstructure: armed limit orders, vacuum traps, pending ghosts
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Ghost, Target, Clock, CheckCircle2, XCircle, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSovereignMemory } from '@/hooks/useSovereignMemory';

interface GhostOrder {
  id: string;
  pair: string;
  direction: string;
  price: number;
  status: 'armed' | 'pending' | 'filled' | 'expired';
  type: 'ghost_limit' | 'vacuum' | 'predatory_limit' | 'standard';
  reason: string;
  createdAt: string;
}

export function GhostOrderBook() {
  const { entries, loading } = useSovereignMemory(
    ['ghost_order', 'liquidity_vacuum', 'predatory_limit', 'gate_bypass'], 15_000, 60
  );

  const orders = useMemo<GhostOrder[]>(() => {
    const ghosts: GhostOrder[] = [];

    for (const e of entries) {
      const p = e.payload;
      const pair = (p.pair as string) || (p.instrument as string) || (p.currency_pair as string) || '';
      const price = (p.price as number) || (p.targetPrice as number) || (p.entry_price as number) || 0;
      const dir = (p.direction as string) || 'long';
      const status = (p.status as string) || 'armed';
      const reason = (p.reason as string) || (p.trigger as string) || e.memory_key;
      const type = e.memory_type === 'liquidity_vacuum' ? 'vacuum'
        : e.memory_type === 'predatory_limit' ? 'predatory_limit'
        : e.memory_type === 'ghost_order' ? 'ghost_limit'
        : 'standard';

      if (!pair) continue;

      ghosts.push({
        id: e.id,
        pair,
        direction: dir,
        price,
        status: (status === 'armed' || status === 'pending' || status === 'filled' || status === 'expired')
          ? status as GhostOrder['status'] : 'armed',
        type,
        reason: typeof reason === 'string' ? reason.slice(0, 80) : JSON.stringify(reason).slice(0, 80),
        createdAt: e.created_at,
      });
    }

    return ghosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 25);
  }, [entries]);

  const armed = orders.filter(o => o.status === 'armed').length;
  const filled = orders.filter(o => o.status === 'filled').length;

  const statusIcons: Record<string, React.ElementType> = {
    armed: Crosshair,
    pending: Clock,
    filled: CheckCircle2,
    expired: XCircle,
  };
  const statusColors: Record<string, string> = {
    armed: 'text-amber-400',
    pending: 'text-blue-400',
    filled: 'text-emerald-400',
    expired: 'text-muted-foreground',
  };
  const typeLabels: Record<string, string> = {
    ghost_limit: 'GHOST',
    vacuum: 'VACUUM',
    predatory_limit: 'PRED',
    standard: 'STD',
  };
  const typeColors: Record<string, string> = {
    ghost_limit: 'border-amber-500/40 text-amber-300',
    vacuum: 'border-red-500/40 text-red-300',
    predatory_limit: 'border-purple-500/40 text-purple-300',
    standard: 'border-border/30',
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Ghost className="w-8 h-8 mx-auto mb-2 opacity-20 animate-pulse" />
        Loading ghost book…
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden h-full"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Ghost className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Ghost Order Book</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">P4</Badge>
        {armed > 0 && (
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-amber-500/20 text-amber-300 animate-pulse">
            {armed} ARMED
          </Badge>
        )}
        {filled > 0 && (
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-emerald-500/20 text-emerald-300">
            {filled} FILLED
          </Badge>
        )}
      </div>
      <div className="p-3">
        {orders.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            <Target className="w-6 h-6 mx-auto mb-2 opacity-20" />
            Ghost orders appear when the FM deploys Liquidity Vacuum traps or PREDATORY_LIMIT entries at retail stop clusters
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1.5 pr-2">
              {orders.map((o, i) => {
                const StatusIcon = statusIcons[o.status] || Clock;
                const sColor = statusColors[o.status] || 'text-muted-foreground';
                const tColor = typeColors[o.type] || '';

                return (
                  <motion.div
                    key={o.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-2 text-[11px] bg-muted/15 rounded-lg px-3 py-2 hover:bg-amber-500/10 transition-colors"
                  >
                    <StatusIcon className={`w-3 h-3 flex-shrink-0 ${sColor}`} />
                    <Badge variant="outline" className={`text-[9px] h-4 px-1 font-mono ${tColor}`}>
                      {typeLabels[o.type]}
                    </Badge>
                    <span className="font-mono font-bold text-foreground w-14 flex-shrink-0">
                      {o.pair.replace('_', '/')}
                    </span>
                    <span className={`text-[10px] font-mono ${o.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {o.direction === 'long' ? '▲' : '▼'}
                    </span>
                    {o.price > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        @{o.price.toFixed(o.pair.includes('JPY') ? 3 : 5)}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/60 truncate flex-1 ml-1">
                      {o.reason}
                    </span>
                    <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">
                      {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </motion.div>
  );
}
