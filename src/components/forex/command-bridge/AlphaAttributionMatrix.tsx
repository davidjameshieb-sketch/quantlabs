// Alpha Attribution Matrix — P3 Evolutionary: which agents/directives generate alpha
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSovereignMemory } from '@/hooks/useSovereignMemory';

export function AlphaAttributionMatrix() {
  const { entries: attributionEntries, loading: attrLoading } = useSovereignMemory(
    ['alpha_attribution', 'directive_override', 'dna_mutation'], 30_000, 100
  );

  // Build agent alpha scoreboard from directive_override payloads
  const agentAlpha = useMemo(() => {
    const map = new Map<string, { agent: string; pnl: number; trades: number; bestDirective: string; winRate: number }>();

    for (const e of attributionEntries) {
      const p = e.payload;
      const agent = (p.agentId as string) || (p.agent_id as string) || (p.agent as string) || '';
      const directive = (p.name as string) || (p.directiveId as string) || e.memory_key;
      const pnl = (p.pnl as number) || (p.net_pips as number) || 0;
      const trades = (p.trades as number) || (p.totalTrades as number) || 0;
      const wr = (p.winRate as number) || (p.win_rate as number) || 0;

      if (!agent && !directive) continue;
      const key = agent || directive;
      const existing = map.get(key) || { agent: key, pnl: 0, trades: 0, bestDirective: directive, winRate: wr };
      existing.pnl += pnl;
      existing.trades += trades;
      if (wr > existing.winRate) {
        existing.winRate = wr;
        existing.bestDirective = directive;
      }
      map.set(key, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 15);
  }, [attributionEntries]);

  if (attrLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Loading alpha attribution…
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
        <FlaskConical className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Alpha Attribution Matrix</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">P3</Badge>
      </div>
      <div className="p-3">
        {agentAlpha.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            <Target className="w-6 h-6 mx-auto mb-2 opacity-20" />
            Alpha attribution builds as trades close — FM maps each pip to its originating directive
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1.5 pr-2">
              {agentAlpha.map((a, i) => (
                <div key={a.agent} className="flex items-center gap-2 text-[11px] bg-muted/15 rounded-lg px-3 py-2 hover:bg-muted/25 transition-colors">
                  <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}</span>
                  {a.pnl >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-mono font-bold text-foreground truncate flex-1">
                    {a.agent.replace('directive:', '').slice(0, 30)}
                  </span>
                  <span className={`font-mono text-[10px] ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {a.pnl >= 0 ? '+' : ''}{a.pnl.toFixed(1)}p
                  </span>
                  {a.trades > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{a.trades}t</Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </motion.div>
  );
}
