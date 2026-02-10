// Agent Optimization Dashboard
// Displays AgentScorecards, retune proposals, and edge portfolio status.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Target, Zap, BarChart3, Eye, Ban, Rocket, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [rawTrades, setRawTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Fetch all trades via paginated queries
  const fetchTrades = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allTrades: TradeRecord[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('oanda_orders')
          .select('agent_id, direction, currency_pair, entry_price, exit_price, session_label, regime_label, spread_at_entry, governance_composite, confidence_score, created_at')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .not('agent_id', 'is', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) { console.error('Fetch error:', error); break; }
        if (!data || data.length === 0) { hasMore = false; break; }
        
        allTrades.push(...(data as TradeRecord[]));
        offset += pageSize;
        if (data.length < pageSize) hasMore = false;
      }

      setRawTrades(allTrades);

      // Build scorecards
      const cards = buildAllScorecards(allTrades);
      setScorecards(cards);

      // Generate retune proposals for non-A tiers
      const propMap = new Map<string, RetuneProposal>();
      for (const sc of cards) {
        if (sc.tier !== 'A') {
          const agentTrades = allTrades.filter(t => t.agent_id === sc.agentId);
          propMap.set(sc.agentId, generateRetuneProposal(sc, agentTrades));
        }
      }
      setProposals(propMap);

      // Initialize deployment ladder
      const tierA = cards.filter(c => c.tier === 'A').map(c => c.agentId);
      const tierB = cards.filter(c => c.tier === 'B').map(c => c.agentId);
      const tierC = cards.filter(c => c.tier === 'C').map(c => c.agentId);
      const tierD = cards.filter(c => c.tier === 'D').map(c => c.agentId);
      initializeDeployments(tierA, tierB, tierC, tierD);

    } catch (err) {
      console.error('Agent optimization error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

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

  const tierCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (const sc of scorecards) counts[sc.tier]++;
    return counts;
  }, [scorecards]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analyzing {rawTrades.length.toLocaleString()} trades across all agents...</p>
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
              {rawTrades.length.toLocaleString()} trades · {scorecards.length} agents analyzed
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{tierCounts.A}</div>
              <div className="text-[10px] text-muted-foreground">Tier A — Deploy</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-400">{tierCounts.B}</div>
              <div className="text-[10px] text-muted-foreground">Tier B — Shadow</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-400">{tierCounts.C}</div>
              <div className="text-[10px] text-muted-foreground">Tier C — Restrict</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{tierCounts.D}</div>
              <div className="text-[10px] text-muted-foreground">Tier D — Disable</div>
            </div>
            <div className="text-center">
              {portfolio && <HealthBadge status={portfolio.healthStatus} reason={portfolio.healthReason} />}
              <div className="text-[10px] text-muted-foreground mt-1">Portfolio Health</div>
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
        </TabsList>

        {/* Scorecards Table */}
        <TabsContent value="scorecards">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Agent</TableHead>
                    <TableHead className="text-[10px]">Tier</TableHead>
                    <TableHead className="text-[10px] text-right">Trades</TableHead>
                    <TableHead className="text-[10px] text-right">Net Pips</TableHead>
                    <TableHead className="text-[10px] text-right">WR</TableHead>
                    <TableHead className="text-[10px] text-right">Exp</TableHead>
                    <TableHead className="text-[10px] text-right">PF</TableHead>
                    <TableHead className="text-[10px] text-right">Sharpe</TableHead>
                    <TableHead className="text-[10px] text-right">MaxDD</TableHead>
                    <TableHead className="text-[10px] text-right">Sessions</TableHead>
                    <TableHead className="text-[10px] text-right">OOS</TableHead>
                    <TableHead className="text-[10px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scorecards.map(sc => (
                    <>
                      <TableRow
                        key={sc.agentId}
                        className="cursor-pointer hover:bg-primary/5"
                        onClick={() => setExpandedAgent(expandedAgent === sc.agentId ? null : sc.agentId)}
                      >
                        <TableCell className="text-xs font-mono">{sc.agentId}</TableCell>
                        <TableCell><TierBadge tier={sc.tier} /></TableCell>
                        <TableCell className="text-right text-xs">{sc.totalTrades.toLocaleString()}</TableCell>
                        <TableCell className={`text-right text-xs font-mono ${sc.netPips > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {sc.netPips > 0 ? '+' : ''}{sc.netPips.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{(sc.winRate * 100).toFixed(1)}%</TableCell>
                        <TableCell className={`text-right text-xs font-mono ${sc.expectancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {sc.expectancy.toFixed(3)}
                        </TableCell>
                        <TableCell className={`text-right text-xs font-mono ${sc.profitFactor >= 1.1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {sc.profitFactor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{sc.sharpe.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{sc.maxDrawdown.toFixed(0)}</TableCell>
                        <TableCell className="text-right text-xs">{sc.sessionCoverage}/5</TableCell>
                        <TableCell className="text-right">
                          {sc.oosHolds
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                            : <XCircle className="w-3.5 h-3.5 text-red-400 inline" />
                          }
                        </TableCell>
                        <TableCell>
                          {expandedAgent === sc.agentId
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />
                          }
                        </TableCell>
                      </TableRow>
                      {expandedAgent === sc.agentId && (
                        <TableRow key={`${sc.agentId}-detail`}>
                          <TableCell colSpan={12} className="p-0">
                            <ScorecardDetail sc={sc} proposal={proposals.get(sc.agentId) || null} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
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
      </Tabs>
    </div>
  );
}
