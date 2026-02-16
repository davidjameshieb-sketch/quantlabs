// ═══════════════════════════════════════════════════════════════
// Baseline vs Ensemble Performance Card — Measurement Only
// Answers: Did the global ensemble outperform thin-slice baseline?
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Scale, TrendingUp, TrendingDown, Minus, AlertCircle,
  CheckCircle2, XCircle, HelpCircle, BarChart3, Map, Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  computeBaselineVsEnsemble,
  BaselineVsEnsembleResult,
  RollingComparison,
  Verdict,
} from '@/lib/agents/baselineVsEnsembleEngine';
import { LearnMode } from '@/lib/agents/agentCollaborationEngine';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── Verdict Display ─────────────────────────────────────────

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  improved:            { label: 'IMPROVED',            color: 'text-neural-green',     icon: CheckCircle2 },
  neutral:             { label: 'NEUTRAL',             color: 'text-neural-orange',    icon: Minus },
  worse:               { label: 'WORSE',               color: 'text-neural-red',       icon: XCircle },
  insufficient_sample: { label: 'INSUFFICIENT SAMPLE', color: 'text-muted-foreground', icon: HelpCircle },
};

// ─── Metric Cell ─────────────────────────────────────────────

const DeltaCell = ({ label, value, suffix = 'p', positiveGood = true }: {
  label: string; value: number; suffix?: string; positiveGood?: boolean;
}) => {
  const positive = positiveGood ? value > 0 : value < 0;
  const negative = positiveGood ? value < 0 : value > 0;
  return (
    <div className="p-2 rounded-lg bg-muted/10 border border-border/20 text-center">
      <div className="text-[9px] text-muted-foreground mb-0.5">{label}</div>
      <div className={cn(
        'font-mono text-sm font-bold',
        positive && 'text-neural-green',
        negative && 'text-neural-red',
        !positive && !negative && 'text-muted-foreground',
      )}>
        {value > 0 ? '+' : ''}{value}{suffix}
      </div>
    </div>
  );
};

// ─── Rolling Row ─────────────────────────────────────────────

const RollingRow = ({ label, data }: { label: string; data: RollingComparison }) => (
  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 border border-border/20">
    <span className="text-[10px] text-muted-foreground w-8 shrink-0 font-medium">{label}</span>
    <div className="flex-1 grid grid-cols-5 gap-2 text-[10px]">
      <div>
        <div className="text-muted-foreground">Δ Expect.</div>
        <div className={cn('font-mono font-bold', data.deltaExpectancy > 0 ? 'text-neural-green' : data.deltaExpectancy < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
          {data.deltaExpectancy > 0 ? '+' : ''}{data.deltaExpectancy}p
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Δ PF</div>
        <div className={cn('font-mono font-bold', data.deltaPF > 0 ? 'text-neural-green' : data.deltaPF < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
          {data.deltaPF > 0 ? '+' : ''}{data.deltaPF}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Δ Max DD</div>
        <div className={cn('font-mono font-bold', data.deltaMaxDD <= 0 ? 'text-neural-green' : 'text-neural-red')}>
          {data.deltaMaxDD > 0 ? '+' : ''}{data.deltaMaxDD}p
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Δ DD Slope</div>
        <div className={cn('font-mono font-bold', data.deltaDDSlope <= 0 ? 'text-neural-green' : 'text-neural-red')}>
          {data.deltaDDSlope > 0 ? '+' : ''}{data.deltaDDSlope}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Changed</div>
        <div className="font-mono font-bold text-foreground">
          {(data.outcomeChangedRate * 100).toFixed(1)}%
        </div>
      </div>
    </div>
    <Badge variant="outline" className="text-[8px]">{data.sampleSize}t</Badge>
  </div>
);

// ─── Main Component ──────────────────────────────────────────

export const BaselineVsEnsembleCard = ({ mode = 'compact' }: { mode?: 'compact' | 'full' }) => {
  const [result, setResult] = useState<BaselineVsEnsembleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnMode, setLearnMode] = useState<LearnMode>(mode === 'full' ? 'backtest' : 'live+practice');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // For 6-month proof, fetch up to 5000 backtest+live orders
      const limit = mode === 'full' ? 5000 : 1000;
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      let query = supabase
        .from('oanda_orders')
        .select('agent_id, direction, currency_pair, entry_price, exit_price, status, created_at, session_label, regime_label, environment, variant_id, slippage_pips, spread_at_entry')
        .in('status', ['closed'])
        .eq('baseline_excluded', false)
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (mode === 'full') {
        query = query.gte('created_at', sixMonthsAgo.toISOString());
      }

      const { data } = await query;

      if (data && data.length > 0) {
        const r = computeBaselineVsEnsemble(data as any, learnMode);
        setResult(r);
      }
    } catch (err) {
      console.error('[BaselineVsEnsemble] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [learnMode, mode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/30 text-center">
        <div className="animate-pulse text-muted-foreground text-sm">Comparing baseline vs ensemble...</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/30 text-center text-muted-foreground text-sm">
        No closed trade data available for comparison.
      </div>
    );
  }

  const vc = VERDICT_CONFIG[result.verdict];
  const VerdictIcon = vc.icon;
  const isFullMode = mode === 'full';

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-card/50 border border-border/30 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h2 className="font-display text-sm font-bold">
            {isFullMode ? 'Baseline vs Global Ensemble (6 Months)' : 'Baseline vs Ensemble Performance'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={learnMode} onValueChange={(v) => setLearnMode(v as LearnMode)}>
            <SelectTrigger className="h-7 text-[10px] w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="live+practice">Live + Practice</SelectItem>
              <SelectItem value="backtest">Backtest</SelectItem>
              <SelectItem value="all">All Data</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={fetchData} className="text-[10px] h-7">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Verdict Banner */}
      <div className={cn(
        'p-3 rounded-lg border flex items-center gap-3',
        result.verdict === 'improved' && 'bg-neural-green/5 border-neural-green/20',
        result.verdict === 'neutral' && 'bg-neural-orange/5 border-neural-orange/20',
        result.verdict === 'worse' && 'bg-neural-red/5 border-neural-red/20',
        result.verdict === 'insufficient_sample' && 'bg-muted/5 border-border/20',
      )}>
        <VerdictIcon className={cn('w-5 h-5 shrink-0', vc.color)} />
        <div>
          <div className={cn('text-xs font-bold', vc.color)}>{vc.label}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{result.verdictReason}</div>
        </div>
      </div>

      {/* Key Deltas */}
      <div className={cn('grid gap-2', isFullMode ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-5')}>
        <DeltaCell label="Δ Expectancy" value={result.rolling100.deltaExpectancy} />
        <DeltaCell label="Δ Profit Factor" value={result.rolling100.deltaPF} suffix="" />
        <DeltaCell label="Δ Max DD" value={result.rolling100.deltaMaxDD} positiveGood={false} />
        <DeltaCell label="Δ Stability" value={result.rolling100.deltaDDSlope} suffix="" positiveGood={false} />
        <DeltaCell label="Coverage ↑" value={result.coverage.coveragePercent} suffix="%" />
        {isFullMode && (
          <>
            <DeltaCell label="Δ Total PnL" value={result.aggregate.deltaTotalPnL} />
            <DeltaCell label="Δ Win Rate" value={result.rolling100.deltaWinRate} suffix="%" />
          </>
        )}
      </div>

      {/* Rolling Windows */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
          <BarChart3 className="w-3 h-3" /> Rolling Comparison
        </div>
        <RollingRow label="R20" data={result.rolling20} />
        <RollingRow label="R50" data={result.rolling50} />
        <RollingRow label="R100" data={result.rolling100} />
      </div>

      {/* Decision Impact Attribution (full mode only) */}
      {isFullMode && (
        <div className="p-3 rounded-lg bg-muted/10 border border-border/20 space-y-2">
          <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Decision Impact Attribution
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
            <div>
              <div className="text-muted-foreground">Changed Trades</div>
              <div className="font-mono font-bold text-foreground">{result.aggregate.changedTradesCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Changed PnL</div>
              <div className={cn('font-mono font-bold', result.aggregate.changedTradesPnL > 0 ? 'text-neural-green' : result.aggregate.changedTradesPnL < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                {result.aggregate.changedTradesPnL > 0 ? '+' : ''}{result.aggregate.changedTradesPnL}p
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Unchanged Trades</div>
              <div className="font-mono font-bold text-foreground">{result.aggregate.unchangedTradesCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Unchanged PnL</div>
              <div className={cn('font-mono font-bold', result.aggregate.unchangedTradesPnL > 0 ? 'text-neural-green' : result.aggregate.unchangedTradesPnL < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                {result.aggregate.unchangedTradesPnL > 0 ? '+' : ''}{result.aggregate.unchangedTradesPnL}p
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] pt-1 border-t border-border/10">
            <div>
              <div className="text-muted-foreground">Changed Expect.</div>
              <div className={cn('font-mono font-bold', result.rolling100.changedTradeExpectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>
                {result.rolling100.changedTradeExpectancy > 0 ? '+' : ''}{result.rolling100.changedTradeExpectancy}p
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Unchanged Expect.</div>
              <div className={cn('font-mono font-bold', result.rolling100.unchangedTradeExpectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>
                {result.rolling100.unchangedTradeExpectancy > 0 ? '+' : ''}{result.rolling100.unchangedTradeExpectancy}p
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Outcome Δ Rate</div>
              <div className="font-mono font-bold text-foreground">
                {(result.rolling100.outcomeChangedRate * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Changed PnL Contrib.</div>
              <div className={cn('font-mono font-bold', result.rolling100.changedTradePnL > 0 ? 'text-neural-green' : 'text-neural-red')}>
                {result.rolling100.changedTradePnL > 0 ? '+' : ''}{result.rolling100.changedTradePnL}p
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aggregate Summary (full mode only) */}
      {isFullMode && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
          <div className="p-2 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-muted-foreground mb-0.5">Baseline Total PnL</div>
            <div className={cn('font-mono font-bold', result.aggregate.baselineTotalPnL > 0 ? 'text-neural-green' : 'text-neural-red')}>
              {result.aggregate.baselineTotalPnL > 0 ? '+' : ''}{result.aggregate.baselineTotalPnL}p
            </div>
            <div className="text-muted-foreground mt-0.5">{result.aggregate.baselineTrades} trades · {result.aggregate.baselineWinRate}% WR</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-muted-foreground mb-0.5">Ensemble Total PnL</div>
            <div className={cn('font-mono font-bold', result.aggregate.ensembleTotalPnL > 0 ? 'text-neural-green' : 'text-neural-red')}>
              {result.aggregate.ensembleTotalPnL > 0 ? '+' : ''}{result.aggregate.ensembleTotalPnL}p
            </div>
            <div className="text-muted-foreground mt-0.5">{result.aggregate.ensembleTrades} trades · {result.aggregate.ensembleWinRate}% WR</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-muted-foreground mb-0.5">Δ Total PnL</div>
            <div className={cn('font-mono text-sm font-bold', result.aggregate.deltaTotalPnL > 0 ? 'text-neural-green' : 'text-neural-red')}>
              {result.aggregate.deltaTotalPnL > 0 ? '+' : ''}{result.aggregate.deltaTotalPnL}p
            </div>
          </div>
          <div className="p-2 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-muted-foreground mb-0.5">Outcome Changed Rate</div>
            <div className="font-mono text-sm font-bold text-foreground">
              {(result.rolling100.outcomeChangedRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Coverage Detail */}
      <div className="flex items-center gap-3 text-[10px]">
        <Map className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-muted-foreground">
          <span className="font-mono font-bold text-foreground">{result.coverage.totalEnvKeys}</span> envKeys compared ·
          Baseline profitable: <span className="font-mono font-bold">{result.coverage.baselineProfitableKeys}</span> ·
          Ensemble profitable: <span className="font-mono font-bold">{result.coverage.ensembleProfitableKeys}</span> ·
          Improved: <span className={cn('font-mono font-bold', result.coverage.improvedEnvKeys > result.coverage.baselineProfitableKeys ? 'text-neural-green' : 'text-muted-foreground')}>
            {result.coverage.improvedEnvKeys}
          </span>
        </span>
      </div>
    </motion.div>
  );
};
