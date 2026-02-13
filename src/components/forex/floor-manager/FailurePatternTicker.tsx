// Failure Pattern Ticker — Live forensic pattern detection feed
import { useState, useEffect, useCallback } from 'react';
import { Radio, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface PatternAlert {
  id: string;
  pattern: string;
  message: string;
  severity: 'warn' | 'critical';
  timestamp: number;
}

const PATTERN_ICONS: Record<string, string> = {
  'P1': '🪤', // Breakdown Trap
  'P2': '🔗', // Agent Over-Correlation
  'P3': '☠️', // Session Toxicity
  'P4': '🚫', // Governance Over-Filtering
  'P5': '📉', // Profit Capture Decay
  'P6': '💀', // Drawdown Clustering
};

export function FailurePatternTicker() {
  const [alerts, setAlerts] = useState<PatternAlert[]>([]);

  const detectPatterns = useCallback(async () => {
    const detected: PatternAlert[] = [];
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    // P2: Agent Over-Correlation — multiple agents same pair/direction in 5m
    const { data: recentOrders } = await supabase
      .from('oanda_orders')
      .select('agent_id, currency_pair, direction, created_at')
      .in('status', ['filled', 'pending'])
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentOrders) {
      const windows: Record<string, string[]> = {};
      for (const o of recentOrders) {
        const key = `${o.currency_pair}:${o.direction}`;
        if (!windows[key]) windows[key] = [];
        windows[key].push(o.agent_id || 'unknown');
      }
      for (const [key, agents] of Object.entries(windows)) {
        const unique = new Set(agents);
        if (unique.size >= 3) {
          const [pair, dir] = key.split(':');
          detected.push({
            id: `P2-${pair}`,
            pattern: 'P2',
            message: `Pattern 2 (Agent Over-Correlation) on ${pair.replace('_', '/')}. ${unique.size} agents signaling ${dir}. G12 Gate engaged.`,
            severity: 'warn',
            timestamp: now,
          });
        }
      }
    }

    // P5: Profit Capture Decay — trades with high MFE but low realized
    const { data: decayTrades } = await supabase
      .from('oanda_orders')
      .select('currency_pair, mfe_r, r_pips, direction')
      .in('status', ['filled', 'closed'])
      .not('mfe_r', 'is', null)
      .not('r_pips', 'is', null)
      .gte('created_at', oneHourAgo)
      .limit(20);

    if (decayTrades) {
      for (const t of decayTrades) {
        const mfe = Number(t.mfe_r) || 0;
        const realized = Number(t.r_pips) || 0;
        if (mfe > 1.0 && realized < mfe * 0.4 && realized > 0) {
          detected.push({
            id: `P5-${t.currency_pair}-${now}`,
            pattern: 'P5',
            message: `Pattern 5 (Profit Capture Decay) on ${t.currency_pair.replace('_', '/')}. MFE was ${mfe.toFixed(1)}R, realized ${realized.toFixed(1)}p. Tightening trailing stop.`,
            severity: 'warn',
            timestamp: now,
          });
        }
      }
    }

    // P6: Drawdown Clustering — 3+ consecutive losses
    const { data: lastTrades } = await supabase
      .from('oanda_orders')
      .select('r_pips, currency_pair')
      .in('status', ['filled', 'closed'])
      .not('r_pips', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (lastTrades) {
      let streak = 0;
      for (const t of lastTrades) {
        if ((Number(t.r_pips) || 0) < 0) streak++;
        else break;
      }
      if (streak >= 3) {
        detected.push({
          id: `P6-streak-${now}`,
          pattern: 'P6',
          message: `Pattern 6 (Drawdown Clustering) detected. ${streak} consecutive losses. Circuit breaker evaluation triggered.`,
          severity: 'critical',
          timestamp: now,
        });
      }
    }

    // P4: Over-filtering check from counterfactuals
    const { data: cfData } = await supabase
      .from('oanda_orders')
      .select('counterfactual_result')
      .in('status', ['rejected', 'blocked', 'skipped'])
      .not('counterfactual_result', 'is', null)
      .gte('created_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    if (cfData && cfData.length >= 10) {
      const wins = cfData.filter(c => c.counterfactual_result === 'win').length;
      const rate = Math.round((wins / cfData.length) * 100);
      if (rate > 55) {
        detected.push({
          id: `P4-overfilter-${now}`,
          pattern: 'P4',
          message: `Pattern 4 (Governance Over-Filtering) detected. ${rate}% of blocked trades would have been winners. Consider relaxing composite threshold.`,
          severity: 'warn',
          timestamp: now,
        });
      }
    }

    setAlerts(prev => {
      // Merge, dedupe by id, keep latest 20
      const merged = [...detected, ...prev];
      const seen = new Set<string>();
      return merged.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      }).slice(0, 20);
    });
  }, []);

  useEffect(() => {
    detectPatterns();
    const id = setInterval(detectPatterns, 30_000);
    return () => clearInterval(id);
  }, [detectPatterns]);

  return (
    <div className="space-y-3 p-4 rounded-xl bg-card/60 border border-border/40">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-[hsl(var(--neural-red))] animate-pulse" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Failure Pattern Ticker</h3>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="text-[8px] px-1.5">{alerts.length} active</Badge>
        )}
      </div>

      <div className="space-y-1 max-h-[220px] overflow-y-auto scrollbar-thin">
        {alerts.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic text-center py-4">No failure patterns detected</p>
        )}
        {alerts.map(a => (
          <div
            key={a.id}
            className={cn(
              'flex items-start gap-2 px-2.5 py-2 rounded-lg border text-[10px]',
              a.severity === 'critical'
                ? 'border-[hsl(var(--neural-red))]/40 bg-[hsl(var(--neural-red))]/8'
                : 'border-[hsl(var(--neural-orange))]/30 bg-[hsl(var(--neural-orange))]/5'
            )}
          >
            <AlertTriangle className={cn(
              'w-3.5 h-3.5 shrink-0 mt-0.5',
              a.severity === 'critical' ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-orange))]'
            )} />
            <span className="leading-relaxed">
              <span className="mr-1">{PATTERN_ICONS[a.pattern] || '⚠️'}</span>
              {a.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
