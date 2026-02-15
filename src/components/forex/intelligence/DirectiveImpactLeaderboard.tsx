// Directive Impact Leaderboard — ranks directives by measurable P&L impact
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, TrendingUp, TrendingDown, AlertTriangle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface DirectiveImpact {
  key: string;
  name: string;
  pillar: string;
  pnlPips: number;
  tradeCount: number;
  winRate: number;
  gateBlocks: number;
  lastActive: string;
  deadWeight: boolean;
}

const PILLAR_BADGE: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-300 border-red-500/30',
  P1: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  P2: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  P3: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  P4: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

function inferPillar(payload: Record<string, unknown>): string {
  const p = (payload.pillar as string) || '';
  if (p.startsWith('P')) return p.split(' ')[0];
  const all = `${(payload.category as string) || ''} ${(payload.name as string) || ''}`.toLowerCase();
  if (all.includes('foundation') || all.includes('kill') || all.includes('circuit')) return 'P0';
  if (all.includes('adversarial') || all.includes('defense') || all.includes('trap')) return 'P1';
  if (all.includes('anticipat') || all.includes('predict') || all.includes('intermarket')) return 'P2';
  if (all.includes('evolution') || all.includes('adapt') || all.includes('alpha')) return 'P3';
  if (all.includes('microstructure') || all.includes('orderbook') || all.includes('liquidity')) return 'P4';
  return 'P0';
}

export function DirectiveImpactLeaderboard() {
  const [impacts, setImpacts] = useState<DirectiveImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'pnl' | 'trades' | 'winRate'>('pnl');

  const fetchData = useCallback(async () => {
    try {
      // Get directives
      const { data: directives } = await supabase
        .from('sovereign_memory')
        .select('memory_key,payload,updated_at')
        .eq('memory_type', 'directive_override')
        .limit(500);

      // Get attribution data
      const { data: attributions } = await supabase
        .from('sovereign_memory')
        .select('memory_key,payload')
        .eq('memory_type', 'alpha_attribution')
        .limit(200);

      // Get gate block counts
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: gates } = await supabase
        .from('gate_bypasses')
        .select('gate_id')
        .gte('created_at', since)
        .limit(1000);

      if (!directives) return;

      // Build gate count map
      const gateCountMap = new Map<string, number>();
      for (const g of gates || []) {
        const key = g.gate_id.toLowerCase();
        gateCountMap.set(key, (gateCountMap.get(key) || 0) + 1);
      }

      // Build attribution map
      const attrMap = new Map<string, { pnl: number; trades: number; wr: number }>();
      for (const a of attributions || []) {
        const p = (a.payload ?? {}) as Record<string, unknown>;
        const agent = String(p.agentId || p.agent_id || p.agent || a.memory_key || '');
        attrMap.set(agent.toLowerCase(), {
          pnl: (p.pnl as number) || (p.net_pips as number) || 0,
          trades: (p.trades as number) || (p.totalTrades as number) || 0,
          wr: (p.winRate as number) || (p.win_rate as number) || 0,
        });
      }

      const results: DirectiveImpact[] = directives.map(d => {
        const payload = (d.payload ?? {}) as Record<string, unknown>;
        const name = String(payload.name || payload.directiveId || d.memory_key || '').slice(0, 50);
        const pillar = inferPillar(payload);
        
        // Find matching attribution
        const keyLower = d.memory_key.toLowerCase();
        const attr = attrMap.get(keyLower) || { pnl: 0, trades: 0, wr: 0 };
        
        // Find gate blocks
        let gateBlocks = 0;
        for (const [gk, count] of gateCountMap) {
          if (gk.includes(keyLower.replace('directive_', '').slice(0, 15))) {
            gateBlocks += count;
          }
        }

        const daysSinceActive = (Date.now() - new Date(d.updated_at).getTime()) / 86400_000;
        const deadWeight = attr.trades === 0 && gateBlocks === 0 && daysSinceActive > 3;

        return {
          key: d.memory_key,
          name,
          pillar,
          pnlPips: attr.pnl,
          tradeCount: attr.trades,
          winRate: attr.wr,
          gateBlocks,
          lastActive: d.updated_at,
          deadWeight,
        };
      });

      setImpacts(results);
    } catch (e) {
      console.warn('[DirectiveImpact] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 120_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const sorted = useMemo(() => {
    return [...impacts].sort((a, b) => {
      if (sortBy === 'pnl') return b.pnlPips - a.pnlPips;
      if (sortBy === 'trades') return b.tradeCount - a.tradeCount;
      return b.winRate - a.winRate;
    });
  }, [impacts, sortBy]);

  const deadWeightCount = impacts.filter(i => i.deadWeight).length;

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          <Trophy className="w-5 h-5 mx-auto mb-2 animate-pulse opacity-40" />
          Loading impact data…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Directive Impact Leaderboard
          </CardTitle>
          <div className="flex items-center gap-1">
            {(['pnl', 'trades', 'winRate'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`text-[9px] px-2 py-0.5 rounded ${sortBy === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {s === 'pnl' ? 'P&L' : s === 'trades' ? 'Trades' : 'Win%'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {deadWeightCount > 0 && (
          <div className="flex items-center gap-2 text-[9px] text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
            <Trash2 className="w-3 h-3" />
            {deadWeightCount} dead-weight directives flagged for pruning
          </div>
        )}

        <ScrollArea className="h-[280px]">
          <div className="space-y-1 pr-2">
            {sorted.slice(0, 30).map((item, i) => (
              <div
                key={item.key}
                className={`flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg transition-colors ${
                  item.deadWeight ? 'bg-muted/10 opacity-50' : 'bg-muted/20 hover:bg-muted/30'
                }`}
              >
                <span className="text-[9px] font-mono text-muted-foreground w-5 text-right">
                  {i + 1}.
                </span>
                <Badge variant="outline" className={`text-[8px] h-4 px-1 ${PILLAR_BADGE[item.pillar] || ''}`}>
                  {item.pillar}
                </Badge>
                <span className="font-mono text-foreground truncate flex-1">{item.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-mono ${item.pnlPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {item.pnlPips >= 0 ? '+' : ''}{item.pnlPips.toFixed(1)}p
                  </span>
                  <span className="text-muted-foreground font-mono">{item.tradeCount}t</span>
                  {item.winRate > 0 && (
                    <span className={`font-mono ${item.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.winRate.toFixed(0)}%
                    </span>
                  )}
                  {item.gateBlocks > 0 && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1 border-amber-500/30 text-amber-400">
                      {item.gateBlocks} blocks
                    </Badge>
                  )}
                  {item.deadWeight && (
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
