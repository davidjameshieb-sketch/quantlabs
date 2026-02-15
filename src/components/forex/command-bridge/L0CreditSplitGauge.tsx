// L0 vs AI Credit Split Gauge — real-time deterministic vs AI-evaluated ratio
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Cpu, Zap, Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export function L0CreditSplitGauge() {
  const [l0Count, setL0Count] = useState(0);
  const [aiCount, setAiCount] = useState(0);
  const [totalDirectives, setTotalDirectives] = useState(0);
  const [aiTokens24h, setAiTokens24h] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Get directives and count L0 vs AI
      const { data: directives } = await supabase
        .from('sovereign_memory')
        .select('payload')
        .eq('memory_type', 'directive_override')
        .limit(500);

      if (directives) {
        setTotalDirectives(directives.length);
        let l0 = 0;
        for (const d of directives) {
          const p = (d.payload ?? {}) as Record<string, unknown>;
          const c = ((p.complexity as string) || '').toLowerCase();
          if (c === 'low' || c.includes('l0') || c.includes('hardwir')) l0++;
        }
        setL0Count(l0);
        setAiCount(directives.length - l0);
      }

      // Get AI token usage in last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: aiLogs } = await supabase
        .from('gate_bypasses')
        .select('reason')
        .like('gate_id', 'AI_MODEL_LOG:%')
        .gte('created_at', since)
        .limit(200);

      if (aiLogs) {
        let tokens = 0;
        for (const log of aiLogs) {
          const match = log.reason?.match(/total=(\d+)/);
          if (match) tokens += parseInt(match[1]);
        }
        setAiTokens24h(tokens);
      }
    } catch (e) {
      console.warn('[L0CreditSplit] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const l0Pct = totalDirectives > 0 ? Math.round((l0Count / totalDirectives) * 100) : 0;
  const aiPct = 100 - l0Pct;
  const l0Target = 70;
  const onTrack = l0Pct >= l0Target;

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <Cpu className="w-5 h-5 mx-auto mb-2 animate-pulse opacity-40" />
          Loading credit split…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          L0 vs AI Credit Split
          <Badge
            variant="outline"
            className={`text-[9px] ${onTrack ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
          >
            {onTrack ? `✓ On track (${l0Pct}% L0)` : `↑ Push to ${l0Target}% L0`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Split bar */}
        <div className="space-y-1.5">
          <div className="h-6 w-full rounded-full bg-muted/30 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 flex items-center justify-center transition-all"
              style={{ width: `${l0Pct}%` }}
            >
              {l0Pct >= 15 && (
                <span className="text-[9px] font-mono font-bold text-white">{l0Pct}% L0</span>
              )}
            </div>
            <div
              className="h-full bg-violet-500 flex items-center justify-center transition-all"
              style={{ width: `${aiPct}%` }}
            >
              {aiPct >= 15 && (
                <span className="text-[9px] font-mono font-bold text-white">{aiPct}% AI</span>
              )}
            </div>
          </div>
          {/* Target line */}
          <div className="relative h-1">
            <div
              className="absolute top-0 w-px h-3 bg-foreground/50 -mt-1"
              style={{ left: `${l0Target}%` }}
            />
            <span
              className="absolute text-[8px] text-muted-foreground -mt-0.5"
              style={{ left: `${l0Target}%`, transform: 'translateX(-50%)' }}
            >
              Target {l0Target}%
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] text-muted-foreground">L0 Hardwired</span>
            </div>
            <div className="text-lg font-mono font-black text-emerald-400">{l0Count}</div>
            <div className="text-[9px] text-muted-foreground">Zero credit cost</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Brain className="w-3 h-3 text-violet-400" />
              <span className="text-[9px] text-muted-foreground">AI Evaluated</span>
            </div>
            <div className="text-lg font-mono font-black text-violet-400">{aiCount}</div>
            <div className="text-[9px] text-muted-foreground">Requires AI credits</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Cpu className="w-3 h-3 text-primary" />
              <span className="text-[9px] text-muted-foreground">Tokens (24h)</span>
            </div>
            <div className="text-lg font-mono font-black text-foreground">
              {aiTokens24h > 1000 ? `${(aiTokens24h / 1000).toFixed(1)}K` : aiTokens24h}
            </div>
            <div className="text-[9px] text-muted-foreground">AI consumption</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
