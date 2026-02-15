// Intermarket Ripple Map — P2 Anticipatory: lead-lag correlations across pairs
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Waves, ArrowRight, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSovereignMemory } from '@/hooks/useSovereignMemory';

interface RippleLink {
  leader: string;
  follower: string;
  lagMs: number;
  correlation: number;
  direction: 'same' | 'inverse';
  strength: 'strong' | 'moderate' | 'weak';
}

export function IntermarketRippleMap() {
  const { entries, loading } = useSovereignMemory(
    ['correlation_trigger', 'intermarket_signal', 'lead_lag', 'directive_override'], 20_000, 80
  );

  const ripples = useMemo<RippleLink[]>(() => {
    const links: RippleLink[] = [];

    for (const e of entries) {
      const p = e.payload;
      const leader = (p.leaderPair as string) || (p.leader as string) || '';
      const follower = (p.followerPair as string) || (p.follower as string) || (p.pair as string) || '';
      const corr = (p.correlation as number) || (p.corr as number) || 0;
      const lag = (p.lagMs as number) || (p.lag_ms as number) || 0;

      if (!leader && !follower) continue;

      const absCorr = Math.abs(corr);
      links.push({
        leader: leader || '?',
        follower: follower || '?',
        lagMs: lag,
        correlation: corr,
        direction: corr >= 0 ? 'same' : 'inverse',
        strength: absCorr > 0.8 ? 'strong' : absCorr > 0.5 ? 'moderate' : 'weak',
      });
    }

    return links
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, 20);
  }, [entries]);

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <Waves className="w-8 h-8 mx-auto mb-2 opacity-20 animate-pulse" />
        Scanning intermarket ripples…
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
        <Waves className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Intermarket Ripple Map</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">P2</Badge>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
          {ripples.length} links
        </Badge>
      </div>
      <div className="p-3">
        {ripples.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-20" />
            Lead-lag ripples populate during live sessions — the FM detects correlated pair movements and maps propagation delays
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1.5 pr-2">
              {ripples.map((r, i) => {
                const strengthColor = r.strength === 'strong' 
                  ? 'text-cyan-400' 
                  : r.strength === 'moderate' 
                    ? 'text-blue-400' 
                    : 'text-muted-foreground';
                const corrColor = r.direction === 'same' ? 'text-emerald-400' : 'text-red-400';
                
                return (
                  <motion.div
                    key={`${r.leader}-${r.follower}-${i}`}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-2 text-[11px] bg-muted/15 rounded-lg px-3 py-2 hover:bg-cyan-500/10 transition-colors"
                  >
                    <span className={`font-mono font-bold ${strengthColor}`}>{r.leader.replace('_', '/')}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="font-mono font-medium text-foreground">{r.follower.replace('_', '/')}</span>
                    
                    <span className={`font-mono text-[10px] ml-auto ${corrColor}`}>
                      {r.correlation > 0 ? '+' : ''}{r.correlation.toFixed(2)}
                    </span>
                    {r.lagMs > 0 && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                        {r.lagMs}ms
                      </Badge>
                    )}
                    <Badge 
                      variant="outline" 
                      className={`text-[9px] h-4 px-1 font-mono ${
                        r.strength === 'strong' ? 'border-cyan-500/40 text-cyan-300' :
                        r.strength === 'moderate' ? 'border-blue-500/30 text-blue-300' :
                        'border-border/30'
                      }`}
                    >
                      {r.direction === 'inverse' ? 'INV' : 'SYN'}
                    </Badge>
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
