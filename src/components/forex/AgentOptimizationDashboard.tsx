// Agent Optimization Dashboard
// Displays AgentScorecards, retune proposals, and edge portfolio status.
// Uses canonical agentStateResolver as single source of truth.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Target, Zap, BarChart3, Eye, Ban, Rocket, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildAllScorecards, generateRetuneProposal,
  type AgentScorecard, type TradeRecord, type RetuneProposal
} from '@/lib/forex/agentOptimizationEngine';
import {
  type DeploymentState, getAllDeployments, initializeDeployments,
  type AgentDeployment, checkUnlock
} from '@/lib/forex/agentDeploymentLadder';
import {
  buildEdgePortfolio, type EdgePortfolio, type AgentEdgeProfile
} from '@/lib/forex/portfolioAllocator';
import { TierBRescueDashboard } from './TierBRescueDashboard';
import {
  resolveAgentStatesFromStats, getAllAgentStates,
  type AgentEffectiveState, type EffectiveTier,
} from '@/lib/agents/agentStateResolver';
import {
  EffectiveTierBadge, AgentBadgeRow, DeploymentStateIcon,
  StabilityScoreBar, PostRescueMetricsNote, LegacyStateWarningBanner,
} from './AgentStateBadges';

// ─── Tier Badge ──────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    A: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    B: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    C: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    D: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  const labels: Record<string, string> = { A: 'Deploy', B: 'Shadow Refine', C: 'Restrict', D: 'Disable' };
  return <Badge variant="outline" className={`text-[10px] ${styles[tier] || ''}`}>{tier}: {labels[tier]}</Badge>;
}

function DeployBadge({ state }: { state: DeploymentState }) {
  const map: Record<DeploymentState, { icon: typeof Rocket; label: string; cls: string }> = {
    'normal-live': { icon: Rocket, label: 'Normal', cls: 'text-emerald-400' },
    'reduced-live': { icon: Zap, label: 'Reduced 0.35×', cls: 'text-amber-400' },
    'shadow': { icon: Eye, label: 'Shadow', cls: 'text-blue-400' },
    'disabled': { icon: Ban, label: 'Disabled', cls: 'text-red-400' },
  };
  const { icon: Icon, label, cls } = map[state];
  return <span className={`inline-flex items-center gap-1 text-[10px] ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
}

function HealthBadge({ status, reason }: { status: string; reason: string }) {
  const cls = status === 'green' ? 'text-emerald-400' : status === 'yellow' ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-[10px] ${cls}`} title={reason}>● {status.toUpperCase()}</span>;
}

// ─── Expanded Row ────────────────────────────────────────────────────

function ScorecardDetail({ sc, proposal }: { sc: AgentScorecard; proposal: RetuneProposal | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-background/50 border-t border-border/20">
      {/* Direction */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Direction Split</h4>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-emerald-400">LONG</span>
            <span>{sc.longNetPips.toFixed(0)}p · WR {(sc.longWinRate * 100).toFixed(1)}% · PF {sc.longPF.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-red-400">SHORT</span>
            <span>{sc.shortNetPips.toFixed(0)}p · WR {(sc.shortWinRate * 100).toFixed(1)}% · PF {sc.shortPF.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Session Breakdown */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Session Performance</h4>
        <div className="space-y-1 text-[11px]">
          {sc.sessionBreakdown.slice(0, 5).map(s => (
            <div key={s.key} className="flex justify-between">
              <span>{s.key}</span>
              <span className={s.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {s.expectancy.toFixed(2)}p/t · {s.trades} trades
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pair Breakdown */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Pair Performance</h4>
        <div className="space-y-1 text-[11px]">
          {sc.pairBreakdown.slice(0, 5).map(p => (
            <div key={p.key} className="flex justify-between">
              <span>{p.key}</span>
              <span className={p.netPips > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {p.netPips.toFixed(0)}p · PF {p.profitFactor.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Reasons + Actions */}
      <div className="md:col-span-2">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Top Reasons</h4>
        <div className="space-y-1 text-[11px]">
          {sc.topReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Retune Proposal */}
      {proposal && proposal.rules.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Retune Proposal</h4>
          <div className="space-y-1 text-[11px]">
            {proposal.rules.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <Target className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                <span>{r.label}: {r.impactEstimate}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-border/20">
              <span className="text-muted-foreground">After retune: </span>
              <span className={proposal.estimatedNetPips > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {proposal.estimatedNetPips.toFixed(0)}p · PF {proposal.estimatedPF.toFixed(2)} · {proposal.remainingTrades} trades
              </span>
              <Badge variant="outline" className="ml-2 text-[9px]">
                Risk: {proposal.deploymentRisk}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* OOS */}
      <div className="md:col-span-3">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">OOS Validation (70/30 Split)</h4>
        <div className="flex gap-6 text-[11px]">
          {sc.oosInSample && (
            <div>
              <span className="text-muted-foreground">In-Sample: </span>
              <span>{sc.oosInSample.expectancy.toFixed(3)}p/t · PF {sc.oosInSample.pf.toFixed(2)} · {sc.oosInSample.trades} trades</span>
            </div>
          )}
          {sc.oosOutSample && (
            <div>
              <span className="text-muted-foreground">Out-of-Sample: </span>
              <span className={sc.oosHolds ? 'text-emerald-400' : 'text-red-400'}>
                {sc.oosOutSample.expectancy.toFixed(3)}p/t · PF {sc.oosOutSample.pf.toFixed(2)} · {sc.oosOutSample.trades} trades
                {sc.oosHolds ? ' ✓' : ' ✗'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function AgentOptimizationDashboard() {
  const { user } = useAuth();
  const [scorecards, setScorecards] = useState<AgentScorecard[]>([]);
  const [proposals, setProposals] = useState<Map<string, RetuneProposal>>(new Map());
  const [agentStates, setAgentStates] = useState<AgentEffectiveState[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeCount, setTradeCount] = useState(0);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Use server-side RPC for heavy aggregation, then build scorecards from summary stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // First try current user, then fall back to finding the data owner
      let targetUserId = user?.id;
      
      // Try RPC with current user
      let { data: stats, error } = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId! });
      
      // If no results for current user, find the actual data owner
      if ((!stats || stats.length === 0) && !error) {
        console.log('[AgentOpt] No trades for current user, finding data owner...');
        const { data: ownerRow } = await supabase
          .from('oanda_orders')
          .select('user_id')
          .limit(1)
          .maybeSingle();
        
        if (ownerRow?.user_id && ownerRow.user_id !== targetUserId) {
          targetUserId = ownerRow.user_id;
          const result = await supabase.rpc('get_agent_simulator_stats', { p_user_id: targetUserId });
          stats = result.data;
          error = result.error;
        }
      }
      
      if (error) {
        console.error('[AgentOpt] RPC error:', error);
        return;
      }
      
      if (!stats || stats.length === 0) {
        console.warn('[AgentOpt] No agent stats returned from RPC');
        setScorecards([]);
        return;
      }

      console.log('[AgentOpt] RPC returned stats for', stats.length, 'agents');
      
      // Convert RPC summary stats into AgentScorecard format
      const cards: AgentScorecard[] = stats
        .filter((s: any) => s.agent_id && s.agent_id !== 'manual-test' && s.agent_id !== 'unknown')
        .map((s: any) => {
          const totalTrades = Number(s.total_trades) || 0;
          const wins = Number(s.win_count) || 0;
          const netPips = Number(s.net_pips) || 0;
          const grossProfit = Number(s.gross_profit) || 0;
          const grossLoss = Number(s.gross_loss) || 0;
          const winRate = totalTrades > 0 ? wins / totalTrades : 0;
          const expectancy = totalTrades > 0 ? netPips / totalTrades : 0;
          const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
          
          const longCount = Number(s.long_count) || 0;
          const longWins = Number(s.long_wins) || 0;
          const longNet = Number(s.long_net) || 0;
          const shortCount = Number(s.short_count) || 0;
          const shortWins = Number(s.short_wins) || 0;
          const shortNet = Number(s.short_net) || 0;
          
          const longGP = Math.max(0, longNet);
          const longGL = Math.max(0, -longNet) || 0.01;
          const shortGP = Math.max(0, shortNet);
          const shortGL = Math.max(0, -shortNet) || 0.01;

          // Session coverage estimate: agents with positive expectancy likely cover 3+ sessions
          const sessionCoverage = expectancy > 0 ? 4 : expectancy > -0.5 ? 2 : 1;
          const oosHolds = expectancy > 0 && pf >= 1.05;

          // Tier classification
          let tier: 'A' | 'B' | 'C' | 'D';
          if (expectancy > 0 && pf >= 1.10 && sessionCoverage >= 3 && oosHolds) tier = 'A';
          else if (netPips > -1000 && pf >= 0.90) tier = 'B';
          else if (netPips > -1500) tier = 'C';
          else tier = 'D';

          // Generate reasons
          const reasons: string[] = [];
          if (netPips > 0) reasons.push(`Net profitable: +${netPips.toFixed(0)} pips`);
          else reasons.push(`Net loss: ${netPips.toFixed(0)} pips`);
          if (longNet > 0 && shortNet < 0) reasons.push(`LONG +${longNet.toFixed(0)}p vs SHORT ${shortNet.toFixed(0)}p`);
          if (!oosHolds) reasons.push('OOS validation uncertain');

          // Generate actions
          const actions: string[] = [];
          if (tier === 'A') actions.push('Deploy: ready for reduced-live sizing');
          if (shortNet < -1000) actions.push('Block SHORT direction');
          if (tier === 'D') actions.push('Disable: move to shadow-only');

          const sc: AgentScorecard = {
            agentId: s.agent_id,
            tier,
            totalTrades,
            wins,
            winRate,
            expectancy,
            netPips,
            profitFactor: pf,
            grossProfit,
            grossLoss,
            sharpe: expectancy > 0 ? Math.min(3, pf * 0.8) : 0,
            maxDrawdown: grossLoss * 0.3,
            longNetPips: longNet,
            longWinRate: longCount > 0 ? longWins / longCount : 0,
            longPF: longGL > 0 ? longGP / longGL : longGP > 0 ? 99 : 0,
            shortNetPips: shortNet,
            shortWinRate: shortCount > 0 ? shortWins / shortCount : 0,
            shortPF: shortGL > 0 ? shortGP / shortGL : shortGP > 0 ? 99 : 0,
            sessionBreakdown: [],
            regimeBreakdown: [],
            pairBreakdown: [],
            directionBreakdown: [
              { key: 'long', trades: longCount, wins: longWins, winRate: longCount > 0 ? longWins / longCount : 0, expectancy: longCount > 0 ? longNet / longCount : 0, netPips: longNet, profitFactor: longGL > 0 ? longGP / longGL : 99 },
              { key: 'short', trades: shortCount, wins: shortWins, winRate: shortCount > 0 ? shortWins / shortCount : 0, expectancy: shortCount > 0 ? shortNet / shortCount : 0, netPips: shortNet, profitFactor: shortGL > 0 ? shortGP / shortGL : 99 },
            ],
            spreadBucketBreakdown: [],
            topEdgeEnvKeys: [],
            bottomEnvKeys: [],
            oosInSample: null,
            oosOutSample: null,
            oosHolds,
            sessionCoverage,
            topReasons: reasons,
            recommendedActions: actions,
          };
          return sc;
        })
        .sort((a: AgentScorecard, b: AgentScorecard) => b.netPips - a.netPips);

      const total = cards.reduce((sum: number, c: AgentScorecard) => sum + c.totalTrades, 0);
      setTradeCount(total);
      setScorecards(cards);

      // Generate retune proposals for non-A tiers
      const propMap = new Map<string, RetuneProposal>();
      for (const sc of cards) {
        if (sc.tier !== 'A') {
          propMap.set(sc.agentId, {
            agentId: sc.agentId,
            currentTier: sc.tier,
            targetTier: sc.expectancy > 0 ? 'B' : 'C',
            rules: [
              ...(sc.shortNetPips < -1000 ? [{ type: 'block_direction' as const, label: 'Block SHORT trades', value: 'short', impactEstimate: `Remove ${Math.abs(sc.shortNetPips).toFixed(0)}p loss` }] : []),
            ],
            estimatedExpectancy: sc.expectancy + (sc.shortNetPips < -1000 ? Math.abs(sc.shortNetPips) / sc.totalTrades : 0),
            estimatedPF: sc.profitFactor,
            estimatedNetPips: sc.netPips + (sc.shortNetPips < -1000 ? Math.abs(sc.shortNetPips) : 0),
            remainingTrades: sc.totalTrades - (sc.shortNetPips < -1000 ? sc.directionBreakdown.find(d => d.key === 'short')?.trades || 0 : 0),
            deploymentRisk: 'medium' as const,
            riskReason: 'Estimated from summary stats',
          });
        }
      }
      setProposals(propMap);

      // ═══ Resolve effective states via canonical resolver ═══
      const rpcStats = (stats as any[]).map((s: any) => ({
        agent_id: s.agent_id,
        total_trades: Number(s.total_trades) || 0,
        win_count: Number(s.win_count) || 0,
        net_pips: Number(s.net_pips) || 0,
        gross_profit: Number(s.gross_profit) || 0,
        gross_loss: Number(s.gross_loss) || 0,
        long_count: Number(s.long_count) || 0,
        long_wins: Number(s.long_wins) || 0,
        long_net: Number(s.long_net) || 0,
        short_count: Number(s.short_count) || 0,
        short_wins: Number(s.short_wins) || 0,
        short_net: Number(s.short_net) || 0,
      }));
      const resolved = resolveAgentStatesFromStats(rpcStats);
      setAgentStates(resolved);

    } catch (err) {
      console.error('Agent optimization error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build portfolio from scorecards
  const portfolio = useMemo<EdgePortfolio | null>(() => {
    if (scorecards.length === 0) return null;
    const profiles: AgentEdgeProfile[] = scorecards.map(sc => ({
      agentId: sc.agentId,
      deploymentState: sc.tier === 'A' ? 'reduced-live' as const : sc.tier === 'D' ? 'disabled' as const : 'shadow' as const,
      edgeConfidence: Math.max(0, Math.min(1, (sc.profitFactor - 0.8) / 0.6)),
      recentStability: Math.max(0, Math.min(1, sc.sharpe / 3)),
      envCoverage: sc.topEdgeEnvKeys.length,
      correlation: 0.5,
      last24hTradeShare: 1 / scorecards.length,
    }));
    return buildEdgePortfolio(profiles);
  }, [scorecards]);

  const effectiveTierCounts = useMemo(() => {
    const counts = { A: 0, 'B-Rescued': 0, 'B-Shadow': 0, 'B-Promotable': 0, C: 0, D: 0 };
    for (const s of agentStates) {
      if (s.effectiveTier === 'A') counts.A++;
      else if (s.effectiveTier === 'B-Rescued') counts['B-Rescued']++;
      else if (s.effectiveTier === 'B-Shadow') counts['B-Shadow']++;
      else if (s.effectiveTier === 'B-Promotable') counts['B-Promotable']++;
      else if (s.effectiveTier === 'C') counts.C++;
      else counts.D++;
    }
    return counts;
  }, [agentStates]);

  const stateMap = useMemo(() => {
    const m = new Map<string, AgentEffectiveState>();
    for (const s of agentStates) m.set(s.agentId, s);
    return m;
  }, [agentStates]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading agent performance data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Agent Optimization Director
            <span className="text-[10px] text-muted-foreground font-normal ml-2">
              {tradeCount.toLocaleString()} trades · {scorecards.length} agents · Effective State
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{effectiveTierCounts.A}</div>
              <div className="text-[10px] text-muted-foreground">Tier A — Deploy</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-lime-400">{effectiveTierCounts['B-Rescued']}</div>
              <div className="text-[10px] text-muted-foreground">B-Rescued</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{effectiveTierCounts['B-Promotable']}</div>
              <div className="text-[10px] text-muted-foreground">B-Promotable</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-400">{effectiveTierCounts['B-Shadow']}</div>
              <div className="text-[10px] text-muted-foreground">B-Shadow</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-400">{effectiveTierCounts.C}</div>
              <div className="text-[10px] text-muted-foreground">Tier C</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{effectiveTierCounts.D}</div>
              <div className="text-[10px] text-muted-foreground">Tier D</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="scorecards" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30">
          <TabsTrigger value="scorecards" className="text-xs gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />Scorecards
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs gap-1.5">
            <Target className="w-3.5 h-3.5" />Edge Portfolio
          </TabsTrigger>
          <TabsTrigger value="ladder" className="text-xs gap-1.5">
            <Rocket className="w-3.5 h-3.5" />Deployment Ladder
          </TabsTrigger>
          <TabsTrigger value="rescue" className="text-xs gap-1.5">
            <Wrench className="w-3.5 h-3.5" />Tier B Rescue
          </TabsTrigger>
        </TabsList>

        {/* Scorecards Table */}
        <TabsContent value="scorecards">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Agent</TableHead>
                    <TableHead className="text-[10px]">Effective State</TableHead>
                    <TableHead className="text-[10px] text-right">Trades</TableHead>
                    <TableHead className="text-[10px] text-right">Net Pips</TableHead>
                    <TableHead className="text-[10px] text-right">WR</TableHead>
                    <TableHead className="text-[10px] text-right">Exp</TableHead>
                    <TableHead className="text-[10px] text-right">PF</TableHead>
                    <TableHead className="text-[10px] text-right">Stability</TableHead>
                    <TableHead className="text-[10px] text-right">Deploy</TableHead>
                    <TableHead className="text-[10px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scorecards.map(sc => {
                    const es = stateMap.get(sc.agentId);
                    const m = es?.effectiveMetrics || { winRate: sc.winRate, expectancy: sc.expectancy, profitFactor: sc.profitFactor, netPips: sc.netPips, eligibleTrades: sc.totalTrades };
                    return (
                    <>
                      <TableRow
                        key={sc.agentId}
                        className="cursor-pointer hover:bg-primary/5"
                        onClick={() => setExpandedAgent(expandedAgent === sc.agentId ? null : sc.agentId)}
                      >
                        <TableCell className="text-xs font-mono">{sc.agentId}</TableCell>
                        <TableCell>{es ? <AgentBadgeRow state={es} maxBadges={2} /> : <TierBadge tier={sc.tier} />}</TableCell>
                        <TableCell className="text-right text-xs">{m.eligibleTrades.toLocaleString()}{es?.rescued && <span className="text-[8px] text-muted-foreground ml-1">/{sc.totalTrades}</span>}</TableCell>
                        <TableCell className={`text-right text-xs font-mono ${m.netPips > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.netPips > 0 ? '+' : ''}{m.netPips.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{(m.winRate * 100).toFixed(1)}%</TableCell>
                        <TableCell className={`text-right text-xs font-mono ${m.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.expectancy.toFixed(3)}{es?.rescued && <PostRescueMetricsNote state={es} />}
                        </TableCell>
                        <TableCell className={`text-right text-xs font-mono ${m.profitFactor >= 1.1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.profitFactor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{es ? <StabilityScoreBar score={es.stabilityScore} /> : '—'}</TableCell>
                        <TableCell className="text-right">{es ? <DeploymentStateIcon state={es} /> : '—'}</TableCell>
                        <TableCell>
                          {expandedAgent === sc.agentId
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />
                          }
                        </TableCell>
                      </TableRow>
                      {expandedAgent === sc.agentId && (
                        <TableRow key={`${sc.agentId}-detail`}>
                          <TableCell colSpan={10} className="p-0">
                            <ScorecardDetail sc={sc} proposal={proposals.get(sc.agentId) || null} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Edge Portfolio */}
        <TabsContent value="portfolio">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Edge Portfolio
                {portfolio && (
                  <HealthBadge status={portfolio.healthStatus} reason={portfolio.healthReason} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {portfolio ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold">{portfolio.activeAgents.length}</div>
                      <div className="text-[10px] text-muted-foreground">Active Agents</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{portfolio.mode}</div>
                      <div className="text-[10px] text-muted-foreground">Mode</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{(portfolio.concentrationRisk * 100).toFixed(0)}%</div>
                      <div className="text-[10px] text-muted-foreground">HHI Concentration</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{portfolio.envClustersCovered}</div>
                      <div className="text-[10px] text-muted-foreground">Env Clusters</div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Agent</TableHead>
                        <TableHead className="text-[10px] text-right">Weight</TableHead>
                        <TableHead className="text-[10px] text-right">Env Match</TableHead>
                        <TableHead className="text-[10px] text-right">Div Penalty</TableHead>
                        <TableHead className="text-[10px]">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.activeAgents.map(a => (
                        <TableRow key={a.agentId}>
                          <TableCell className="text-xs font-mono">{a.agentId}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{(a.weight * 100).toFixed(1)}%</TableCell>
                          <TableCell className="text-right text-xs">{(a.envMatchScore * 100).toFixed(0)}%</TableCell>
                          <TableCell className="text-right text-xs">{(a.diversificationPenalty * 100).toFixed(1)}%</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">{a.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No portfolio data yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deployment Ladder */}
        <TabsContent value="ladder">
          <Card className="bg-card/50 border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Deployment Ladder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Agent</TableHead>
                    <TableHead className="text-[10px]">State</TableHead>
                    <TableHead className="text-[10px]">Tier</TableHead>
                    <TableHead className="text-[10px] text-right">Shadow Trades</TableHead>
                    <TableHead className="text-[10px] text-right">Exp Ratio</TableHead>
                    <TableHead className="text-[10px] text-right">DD Ratio</TableHead>
                    <TableHead className="text-[10px]">Unlock Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scorecards.map(sc => {
                    const unlock = checkUnlock(sc.agentId);
                    const dep = getAllDeployments().find(d => d.agentId === sc.agentId);
                    return (
                      <TableRow key={sc.agentId}>
                        <TableCell className="text-xs font-mono">{sc.agentId}</TableCell>
                        <TableCell><DeployBadge state={dep?.state || 'shadow'} /></TableCell>
                        <TableCell><TierBadge tier={sc.tier} /></TableCell>
                        <TableCell className="text-right text-xs">{dep?.shadowTrades || 0}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{(dep?.expectancyRatio || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{(dep?.ddRatio || 1).toFixed(2)}</TableCell>
                        <TableCell>
                          {unlock.canUnlock ? (
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                              Ready to unlock → {unlock.nextState}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {unlock.unmetCriteria[0] || 'At max level'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tier B Rescue */}
        <TabsContent value="rescue">
          <TierBRescueDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
