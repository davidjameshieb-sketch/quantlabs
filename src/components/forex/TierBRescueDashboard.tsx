// Tier B Rescue Dashboard
// Displays the 5-step rescue pipeline results for each Tier B agent

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  Target, Zap, BarChart3, Eye, Ban, Rocket, ChevronDown, ChevronUp,
  Activity, Layers, ArrowRight, Crosshair, Wrench, FlaskConical
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildAllScorecards,
  type AgentScorecard, type AgentBreakdown, type TradeRecord,
} from '@/lib/forex/agentOptimizationEngine';
import {
  runAllTierBRescues,
  type TierBRescueResult,
} from '@/lib/forex/tierBRescueEngine';

// ─── Sub-components ──────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'critical'
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : severity === 'moderate'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-muted/20 text-muted-foreground border-muted/30';
  return <Badge variant="outline" className={`text-[9px] ${cls}`}>{severity}</Badge>;
}

function RescueStatusBadge({ rescued }: { rescued: boolean }) {
  return rescued
    ? <Badge variant="outline" className="text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✅ Rescued</Badge>
    : <Badge variant="outline" className="text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">⏳ In Progress</Badge>;
}

function DeployStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    'normal-live': { label: 'Normal', cls: 'text-emerald-400' },
    'reduced-live': { label: 'Reduced 0.35×', cls: 'text-amber-400' },
    'shadow': { label: 'Shadow', cls: 'text-blue-400' },
    'disabled': { label: 'Disabled', cls: 'text-red-400' },
  };
  const { label, cls } = map[state] || { label: state, cls: 'text-muted-foreground' };
  return <span className={`text-[10px] font-medium ${cls}`}>{label}</span>;
}

function MetricDelta({ before, after, unit = '', higherIsBetter = true }: {
  before: number; after: number; unit?: string; higherIsBetter?: boolean;
}) {
  const delta = after - before;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <span className={`text-[10px] font-mono ${improved ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta > 0 ? '+' : ''}{delta.toFixed(unit === 'p' ? 0 : 2)}{unit}
    </span>
  );
}

// ─── Agent Detail Panel ──────────────────────────────────────────────

function AgentRescueDetail({ result }: { result: TierBRescueResult }) {
  const { originalScorecard: orig, retunedScorecard: retuned } = result;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-border/20"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-background/30">
        {/* Step 1: Diagnosis */}
        <Card className="bg-card/30 border-border/20">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
              <Crosshair className="w-3 h-3 text-primary" /> Step 1 — Diagnosis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {/* Positive Subspaces */}
            <div>
              <h5 className="text-[10px] text-muted-foreground mb-1">
                Positive Subspaces ({result.positiveSubspaces.length} found)
              </h5>
              {result.positiveSubspaces.length === 0 ? (
                <p className="text-[10px] text-red-400">No subspaces meet PF ≥ 1.20, Exp ≥ 0.3p, ≥ 100 trades</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {result.positiveSubspaces.slice(0, 8).map((s, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-emerald-400">{s.dimension}: {s.key}</span>
                      <span>PF {s.profitFactor.toFixed(2)} · {s.expectancy.toFixed(2)}p/t · {s.trades}t</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Destructive Segments */}
            <div>
              <h5 className="text-[10px] text-muted-foreground mb-1">
                Destructive Segments ({result.destructiveSegments.length})
              </h5>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {result.destructiveSegments.slice(0, 8).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1">
                      <SeverityBadge severity={s.severity} />
                      <span>{s.dimension}: {s.key}</span>
                      {s.isJPY && <Badge variant="outline" className="text-[8px] border-orange-500/30 text-orange-400">JPY</Badge>}
                    </span>
                    <span className="text-red-400">{s.netPips.toFixed(0)}p · {s.trades}t</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Retune Proposals */}
        <Card className="bg-card/30 border-border/20">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
              <Wrench className="w-3 h-3 text-primary" /> Step 2 — Retune Proposals
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {result.retuneRules.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No actionable constraints identified</p>
            ) : (
              <div className="space-y-2">
                {result.retuneRules.map((rule, i) => (
                  <div key={i} className="p-2 rounded bg-background/50 border border-border/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium">{rule.label}</span>
                      <Badge variant="outline" className={`text-[8px] ${
                        rule.confidence === 'high' ? 'border-emerald-500/30 text-emerald-400'
                        : 'border-amber-500/30 text-amber-400'
                      }`}>{rule.confidence}</Badge>
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{rule.impactEstimate}</div>
                    <div className="text-[9px] mt-0.5">
                      Efficiency: <span className="text-primary font-mono">{rule.liftPerTradeLost.toFixed(2)}p/trade</span>
                      {' · '}Trades lost: <span className="font-mono">{rule.tradeLoss}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Before/After */}
            {retuned && (
              <div className="mt-2 pt-2 border-t border-border/20">
                <h5 className="text-[10px] text-muted-foreground mb-1.5">Before → After Retune</h5>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="text-muted-foreground">Net Pips</div>
                    <div className="font-mono">{orig.netPips.toFixed(0)} → {retuned.netPips.toFixed(0)}</div>
                    <MetricDelta before={orig.netPips} after={retuned.netPips} unit="p" />
                  </div>
                  <div>
                    <div className="text-muted-foreground">PF</div>
                    <div className="font-mono">{orig.profitFactor.toFixed(2)} → {retuned.profitFactor.toFixed(2)}</div>
                    <MetricDelta before={orig.profitFactor} after={retuned.profitFactor} />
                  </div>
                  <div>
                    <div className="text-muted-foreground">Exp</div>
                    <div className="font-mono">{orig.expectancy.toFixed(3)} → {retuned.expectancy.toFixed(3)}</div>
                    <MetricDelta before={orig.expectancy} after={retuned.expectancy} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Shadow Validation */}
        <Card className="bg-card/30 border-border/20">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
              <FlaskConical className="w-3 h-3 text-primary" /> Step 3 — Shadow Validation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <span className="text-muted-foreground">Shadow Trades</span>
                <div className={`font-mono ${result.shadowValidation.totalShadowTrades >= 150 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {result.shadowValidation.totalShadowTrades} / 150
                </div>
                <Progress value={Math.min(100, (result.shadowValidation.totalShadowTrades / 150) * 100)} className="h-1 mt-1" />
              </div>
              <div>
                <span className="text-muted-foreground">Exp Ratio (≥ 1.3×)</span>
                <div className={`font-mono ${result.shadowValidation.expectancyRatio >= 1.3 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.shadowValidation.expectancyRatio}×
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">DD Ratio (≤ 0.70×)</span>
                <div className={`font-mono ${result.shadowValidation.maxDDRatio <= 0.70 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.shadowValidation.maxDDRatio}×
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Sessions Profitable (≥ 3)</span>
                <div className={`font-mono ${result.shadowValidation.sessionsWithPositiveExp >= 3 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.shadowValidation.sessionsWithPositiveExp}
                </div>
              </div>
            </div>

            {/* Rolling stability */}
            {result.shadowValidation.rollingStability.length > 0 && (
              <div className="mt-2">
                <h5 className="text-[9px] text-muted-foreground mb-1">OOS Rolling Windows (50-trade)</h5>
                <div className="flex gap-1">
                  {result.shadowValidation.rollingStability.map((w, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-4 rounded-sm flex items-center justify-center text-[8px] font-mono ${
                        w.expectancy > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}
                      title={`W${w.window}: ${w.expectancy.toFixed(2)}p/t, PF ${w.pf.toFixed(2)}`}
                    >
                      {w.expectancy > 0 ? '+' : '−'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.shadowValidation.failReasons.length > 0 && (
              <div className="space-y-0.5 mt-2">
                {result.shadowValidation.failReasons.map((r, i) => (
                  <div key={i} className="text-[9px] text-red-400 flex items-start gap-1">
                    <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {r}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Steps 4 & 5: Deployment + Portfolio */}
        <Card className="bg-card/30 border-border/20">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
              <Rocket className="w-3 h-3 text-primary" /> Steps 4 & 5 — Deploy & Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {/* Deployment */}
            <div className="p-2 rounded bg-background/50 border border-border/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Deployment State</span>
                <DeployStateBadge state={result.deploymentState} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">{result.deploymentReason}</p>
            </div>

            {/* Portfolio Integration */}
            <div className="p-2 rounded bg-background/50 border border-border/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">Portfolio Integration</span>
                {result.portfolioCheck.eligible
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  : <XCircle className="w-3.5 h-3.5 text-amber-400" />
                }
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Tier A Correlation</span>
                  <div className={`font-mono ${result.portfolioCheck.correlationWithTierA < 0.6 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(result.portfolioCheck.correlationWithTierA * 100).toFixed(0)}% {result.portfolioCheck.correlationWithTierA < 0.6 ? '✓' : '✗'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Diversification</span>
                  <div className="font-mono">{(result.portfolioCheck.diversificationBenefit * 100).toFixed(0)}%</div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">{result.portfolioCheck.reason}</p>
            </div>

            {/* Rescue Summary */}
            <div className={`p-2 rounded border ${
              result.rescued
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <p className="text-[10px]">{result.rescueSummary}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function TierBRescueDashboard() {
  const { user } = useAuth();
  const [results, setResults] = useState<TierBRescueResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [tradeCount, setTradeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchAndAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get agent summary stats to identify tiers
      let targetUserId = user?.id;
      let { data: stats } = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId! });

      if (!stats || stats.length === 0) {
        const { data: ownerRow } = await supabase
          .from('oanda_orders')
          .select('user_id')
          .limit(1)
          .maybeSingle();
        if (ownerRow?.user_id) {
          targetUserId = ownerRow.user_id;
          const result = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId });
          stats = result.data;
        }
      }

      if (!stats || stats.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Classify tiers from summary stats
      const tierMap = new Map<string, 'A' | 'B' | 'C' | 'D'>();
      const EXCLUDED_IDS = ['manual-test', 'unknown', 'backtest-engine'];
      for (const s of stats) {
        if (!s.agent_id || EXCLUDED_IDS.includes(s.agent_id)) continue;
        const totalTrades = Number(s.total_trades) || 0;
        const netPips = Number(s.net_pips) || 0;
        const gp = Number(s.gross_profit) || 0;
        const gl = Number(s.gross_loss) || 0;
        const pf = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
        const exp = totalTrades > 0 ? netPips / totalTrades : 0;

        let tier: 'A' | 'B' | 'C' | 'D';
        if (exp > 0 && pf >= 1.10) tier = 'A';
        else if (netPips > -1000 && pf >= 0.90) tier = 'B';
        else if (netPips > -1500) tier = 'C';
        else tier = 'D';
        tierMap.set(s.agent_id, tier);
      }

      const tierBIds = [...tierMap.entries()].filter(([, t]) => t === 'B').map(([id]) => id);
      const tierAIds = [...tierMap.entries()].filter(([, t]) => t === 'A').map(([id]) => id);

      if (tierBIds.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      // 2. Build Tier A scorecards from RPC stats (no raw trades needed)
      const emptyBD: AgentBreakdown[] = [];
      const tierAScorecards: AgentScorecard[] = stats
        .filter(s => tierAIds.includes(s.agent_id))
        .map(s => {
          const totalTrades = Number(s.total_trades) || 0;
          const netPips = Number(s.net_pips) || 0;
          const gp = Number(s.gross_profit) || 0;
          const gl = Number(s.gross_loss) || 0;
          const winCount = Number(s.win_count) || 0;
          const longWins = Number(s.long_wins) || 0;
          const longCount = Number(s.long_count) || 0;
          const shortWins = Number(s.short_wins) || 0;
          const shortCount = Number(s.short_count) || 0;
          const longNet = Number(s.long_net) || 0;
          const shortNet = Number(s.short_net) || 0;
          return {
            agentId: s.agent_id,
            tier: 'A' as const,
            totalTrades,
            wins: winCount,
            winRate: totalTrades > 0 ? winCount / totalTrades : 0,
            expectancy: totalTrades > 0 ? netPips / totalTrades : 0,
            netPips,
            profitFactor: gl > 0 ? gp / gl : gp > 0 ? 99 : 0,
            grossProfit: gp,
            grossLoss: gl,
            sharpe: 0,
            maxDrawdown: 0,
            longNetPips: longNet,
            longWinRate: longCount > 0 ? longWins / longCount : 0,
            longPF: 0,
            shortNetPips: shortNet,
            shortWinRate: shortCount > 0 ? shortWins / shortCount : 0,
            shortPF: 0,
            sessionBreakdown: emptyBD,
            regimeBreakdown: emptyBD,
            pairBreakdown: emptyBD,
            directionBreakdown: emptyBD,
            spreadBucketBreakdown: emptyBD,
            topEdgeEnvKeys: emptyBD,
            bottomEnvKeys: emptyBD,
            oosInSample: null,
            oosOutSample: null,
            oosHolds: false,
            sessionCoverage: 0,
            topReasons: [],
            recommendedActions: [],
          };
        });

      // 3. Fetch raw trades ONLY for Tier B agents (needed for segmentation)
      //    Cap at 5000 trades per agent to prevent browser hangs
      const MAX_TRADES_PER_AGENT = 5000;
      let tierBTrades: TradeRecord[] = [];
      for (const agentId of tierBIds) {
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        let agentCount = 0;
        while (hasMore && agentCount < MAX_TRADES_PER_AGENT) {
          const { data, error: err } = await supabase
            .from('oanda_orders')
            .select('agent_id, direction, currency_pair, entry_price, exit_price, session_label, regime_label, spread_at_entry, governance_composite, confidence_score, created_at')
            .eq('user_id', targetUserId!)
            .eq('agent_id', agentId)
            .eq('baseline_excluded', false)
            .not('entry_price', 'is', null)
            .not('exit_price', 'is', null)
            .order('created_at', { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (err) { console.warn(`[TierBRescue] fetch error for ${agentId}:`, err.message); break; }
          if (data) {
            tierBTrades = tierBTrades.concat(data as TradeRecord[]);
            agentCount += data.length;
          }
          hasMore = (data?.length ?? 0) === pageSize;
          offset += pageSize;
        }
      }

      setTradeCount(tierBTrades.length);

      // 4. Run rescue pipeline
      const rescueResults = runAllTierBRescues(tierBTrades, tierBIds, tierAScorecards);

      setResults(rescueResults.sort((a, b) => {
        // Rescued first, then by potential lift
        if (a.rescued !== b.rescued) return a.rescued ? -1 : 1;
        return (b.retunedScorecard?.netPips || 0) - (a.retunedScorecard?.netPips || 0);
      }));

    } catch (err: any) {
      setError(err?.message || 'Failed to analyze Tier B agents');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAndAnalyze(); }, [fetchAndAnalyze]);

  const summary = useMemo(() => {
    const rescued = results.filter(r => r.rescued).length;
    const inProgress = results.length - rescued;
    const totalLift = results.reduce((sum, r) =>
      sum + ((r.retunedScorecard?.netPips || 0) - r.originalScorecard.netPips), 0
    );
    return { rescued, inProgress, totalLift, total: results.length };
  }, [results]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Running Tier B rescue pipeline...</p>
          <p className="text-[10px] text-muted-foreground mt-1">Diagnosing → Retuning → Validating → Deploying</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No Tier B agents found — all agents are either deployed (Tier A) or restricted (Tier C/D).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            Tier B Agent Rescue Pipeline
            <span className="text-[10px] text-muted-foreground font-normal ml-2">
              {tradeCount.toLocaleString()} trades analyzed · {summary.total} agents
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-emerald-400">{summary.rescued}</div>
              <div className="text-[10px] text-muted-foreground">Rescued</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-400">{summary.inProgress}</div>
              <div className="text-[10px] text-muted-foreground">In Progress</div>
            </div>
            <div>
              <div className={`text-lg font-bold ${summary.totalLift > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.totalLift > 0 ? '+' : ''}{summary.totalLift.toFixed(0)}p
              </div>
              <div className="text-[10px] text-muted-foreground">Total Pip Lift</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">
                {results.reduce((s, r) => s + r.retuneRules.length, 0)}
              </div>
              <div className="text-[10px] text-muted-foreground">Surgical Constraints</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Table */}
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Agent</TableHead>
                <TableHead className="text-[10px]">Status</TableHead>
                <TableHead className="text-[10px] text-right">Before PF</TableHead>
                <TableHead className="text-[10px] text-right">After PF</TableHead>
                <TableHead className="text-[10px] text-right">Pip Lift</TableHead>
                <TableHead className="text-[10px] text-right">Rules</TableHead>
                <TableHead className="text-[10px]">Deploy</TableHead>
                <TableHead className="text-[10px]">Portfolio</TableHead>
                <TableHead className="text-[10px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {results.map(r => (
                  <TableRow
                    key={r.agentId}
                    className="cursor-pointer hover:bg-primary/5"
                    onClick={() => setExpandedAgent(expandedAgent === r.agentId ? null : r.agentId)}
                  >
                    <TableCell className="text-xs font-mono">{r.agentId}</TableCell>
                    <TableCell><RescueStatusBadge rescued={r.rescued} /></TableCell>
                    <TableCell className={`text-right text-xs font-mono ${r.originalScorecard.profitFactor >= 1.2 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.originalScorecard.profitFactor.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right text-xs font-mono ${(r.retunedScorecard?.profitFactor || 0) >= 1.2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {r.retunedScorecard?.profitFactor.toFixed(2) || '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      <MetricDelta
                        before={r.originalScorecard.netPips}
                        after={r.retunedScorecard?.netPips || 0}
                        unit="p"
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.retuneRules.length}</TableCell>
                    <TableCell><DeployStateBadge state={r.deploymentState} /></TableCell>
                    <TableCell>
                      {r.portfolioCheck.eligible
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        : <span className="text-[10px] text-muted-foreground">Info only</span>
                      }
                    </TableCell>
                    <TableCell>
                      {expandedAgent === r.agentId
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                      }
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          {/* Expanded details */}
          <AnimatePresence>
            {expandedAgent && results.find(r => r.agentId === expandedAgent) && (
              <AgentRescueDetail
                key={`detail-${expandedAgent}`}
                result={results.find(r => r.agentId === expandedAgent)!}
              />
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
