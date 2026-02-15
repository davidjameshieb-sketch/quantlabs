// Directive Saturation Heatmap — shows which directives fired recently, by pillar
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Flame, Zap, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface DirectiveCell {
  key: string;
  name: string;
  pillar: string;
  lastFired: string | null; // ISO timestamp
  fireCount: number;
  dormant: boolean;
}

const PILLAR_COLORS: Record<string, string> = {
  P0: 'bg-red-500', P1: 'bg-orange-500', P2: 'bg-cyan-500',
  P3: 'bg-purple-500', P4: 'bg-amber-500',
};

const PILLAR_GLOW: Record<string, string> = {
  P0: 'shadow-red-500/30', P1: 'shadow-orange-500/30', P2: 'shadow-cyan-500/30',
  P3: 'shadow-purple-500/30', P4: 'shadow-amber-500/30',
};

function inferPillar(payload: Record<string, unknown>): string {
  const p = (payload.pillar as string) || '';
  if (p.startsWith('P')) return p.split(' ')[0];
  const all = `${(payload.category as string) || ''} ${(payload.name as string) || ''}`.toLowerCase();
  if (all.includes('foundation') || all.includes('kill') || all.includes('circuit') || all.includes('risk budget')) return 'P0';
  if (all.includes('adversarial') || all.includes('defense') || all.includes('trap') || all.includes('sentiment')) return 'P1';
  if (all.includes('anticipat') || all.includes('predict') || all.includes('intermarket') || all.includes('macro')) return 'P2';
  if (all.includes('evolution') || all.includes('adapt') || all.includes('alpha') || all.includes('attribution')) return 'P3';
  if (all.includes('microstructure') || all.includes('orderbook') || all.includes('liquidity') || all.includes('ghost')) return 'P4';
  return 'P0';
}

export function DirectiveSaturationHeatmap() {
  const [cells, setCells] = useState<DirectiveCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch all directives
      const { data: directives } = await supabase
        .from('sovereign_memory')
        .select('memory_key,payload,updated_at')
        .eq('memory_type', 'directive_override')
        .order('relevance_score', { ascending: false })
        .limit(500);

      // Fetch recent gate_bypasses to see which directives "fired"
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: fires } = await supabase
        .from('gate_bypasses')
        .select('gate_id,created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!directives) return;

      // Build fire map from gate_bypasses
      const fireMap = new Map<string, { count: number; last: string }>();
      for (const f of fires || []) {
        const key = f.gate_id.toLowerCase();
        const existing = fireMap.get(key);
        if (existing) {
          existing.count++;
          if (f.created_at > existing.last) existing.last = f.created_at;
        } else {
          fireMap.set(key, { count: 1, last: f.created_at });
        }
      }

      const result: DirectiveCell[] = directives.map(d => {
        const payload = (d.payload ?? {}) as Record<string, unknown>;
        const name = String(payload.name || payload.directiveId || d.memory_key || '');
        const pillar = inferPillar(payload);
        
        // Match fires by checking if any gate_id contains part of directive key
        const keyLower = d.memory_key.toLowerCase();
        let fireCount = 0;
        let lastFired: string | null = null;
        
        for (const [gateKey, info] of fireMap.entries()) {
          if (gateKey.includes(keyLower.replace('directive_', '')) || keyLower.includes(gateKey.split(':').pop() || '---')) {
            fireCount += info.count;
            if (!lastFired || info.last > lastFired) lastFired = info.last;
          }
        }

        // Also check if the directive was recently updated (proxy for "active")
        const updatedRecently = Date.now() - new Date(d.updated_at).getTime() < 3600_000;
        if (updatedRecently && fireCount === 0) fireCount = 1;

        return {
          key: d.memory_key,
          name: name.slice(0, 40),
          pillar,
          lastFired,
          fireCount,
          dormant: fireCount === 0,
        };
      });

      // Sort: by pillar then by fire count desc
      result.sort((a, b) => {
        if (a.pillar !== b.pillar) return a.pillar.localeCompare(b.pillar);
        return b.fireCount - a.fireCount;
      });

      setCells(result);
    } catch (e) {
      console.warn('[DirectiveSaturation] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const stats = useMemo(() => {
    const total = cells.length;
    const active = cells.filter(c => !c.dormant).length;
    const dormant = total - active;
    const byPillar: Record<string, { active: number; total: number }> = {};
    for (const c of cells) {
      if (!byPillar[c.pillar]) byPillar[c.pillar] = { active: 0, total: 0 };
      byPillar[c.pillar].total++;
      if (!c.dormant) byPillar[c.pillar].active++;
    }
    return { total, active, dormant, byPillar, saturationPct: total > 0 ? Math.round((active / total) * 100) : 0 };
  }, [cells]);

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          <Flame className="w-5 h-5 mx-auto mb-2 animate-pulse opacity-40" />
          Loading directive saturation…
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" />
              Directive Saturation Heatmap
              <Badge variant="secondary" className="text-[10px] font-mono">
                {stats.saturationPct}% active
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="font-mono">{stats.active}/{stats.total}</span>
              <span>fired in 24h</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          {/* Pillar saturation bars */}
          <div className="grid grid-cols-5 gap-2">
            {['P0', 'P1', 'P2', 'P3', 'P4'].map(p => {
              const data = stats.byPillar[p] || { active: 0, total: 0 };
              const pct = data.total > 0 ? Math.round((data.active / data.total) * 100) : 0;
              return (
                <div key={p} className="text-center space-y-1">
                  <div className="text-[10px] font-bold text-foreground">{p}</div>
                  <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PILLAR_COLORS[p]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[8px] text-muted-foreground">{data.active}/{data.total}</div>
                </div>
              );
            })}
          </div>

          {/* Heatmap grid */}
          <ScrollArea className="h-[180px]">
            <div className="flex flex-wrap gap-[3px]">
              {cells.map((cell) => {
                const bgColor = cell.dormant
                  ? 'bg-muted/20'
                  : cell.fireCount >= 5
                  ? `${PILLAR_COLORS[cell.pillar]}`
                  : cell.fireCount >= 2
                  ? `${PILLAR_COLORS[cell.pillar]}/60`
                  : `${PILLAR_COLORS[cell.pillar]}/30`;

                return (
                  <Tooltip key={cell.key}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-3 h-3 rounded-sm cursor-pointer transition-all ${bgColor} ${
                          hoveredCell === cell.key ? `ring-1 ring-foreground shadow-lg ${PILLAR_GLOW[cell.pillar]}` : ''
                        } ${cell.dormant ? 'opacity-30' : ''}`}
                        onMouseEnter={() => setHoveredCell(cell.key)}
                        onMouseLeave={() => setHoveredCell(null)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-[10px] max-w-xs">
                      <div className="font-bold">{cell.name}</div>
                      <div className="text-muted-foreground">
                        {cell.pillar} · {cell.fireCount} fires · {cell.dormant ? 'Dormant 💤' : 'Active 🔥'}
                      </div>
                      {cell.lastFired && (
                        <div className="text-muted-foreground">
                          Last: {new Date(cell.lastFired).toLocaleTimeString()}
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollArea>

          {/* Dormant warning */}
          {stats.dormant > 20 && (
            <div className="flex items-center gap-2 text-[9px] text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
              <Eye className="w-3 h-3" />
              {stats.dormant} directives dormant — consider pruning or activating
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
