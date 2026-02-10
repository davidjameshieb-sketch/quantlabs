// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Dashboard — Execution Grade
// Section 6 — Network Graph, Heatmap, Leaderboard, Veto Ranking
// + Collaboration Impact Card (Section 6 addition)
// Uses canonical agentStateResolver for effective tier display
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Network, Trophy, AlertTriangle, Shield, RotateCcw, Activity, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import {
  analyzeAgentCollaboration,
  CollaborationSnapshot,
  AgentPairStats,
  CollaborationLabel,
  LearnMode,
  PairedOpportunityStats,
} from '@/lib/agents/agentCollaborationEngine';
import {
  getCollaborationSafetyState,
  setCollaborationWeightingEnabled,
  setIndependentRoutingMode,
  getCollaborationImpactStats,
  CollaborationSafetyState,
  CollaborationImpactStats,
  InfluenceTier,
} from '@/lib/agents/agentCollaborationRouter';
import { CollaborationMaturityPanel } from './CollaborationMaturityPanel';
import { AgentRelationshipPanel } from './AgentRelationshipPanel';
import { getAllAgentStates, type AgentEffectiveState } from '@/lib/agents/agentStateResolver';
import { EffectiveTierBadge } from './AgentStateBadges';
import { EnvironmentBadge } from '@/components/forex/EnvironmentGuards';

// ─── Color helpers ───────────────────────────────────────────

const labelColor: Record<CollaborationLabel, string> = {
  SYNERGY: 'text-neural-green',
  NEUTRAL: 'text-muted-foreground',
  CONFLICT: 'text-neural-red',
  'PREDICTIVE-VETO': 'text-primary',
  INSUFFICIENT_DATA: 'text-muted-foreground/50',
};

const labelBg: Record<CollaborationLabel, string> = {
  SYNERGY: 'bg-neural-green/10 border-neural-green/30',
  NEUTRAL: 'bg-muted/20 border-border/30',
  CONFLICT: 'bg-neural-red/10 border-neural-red/30',
  'PREDICTIVE-VETO': 'bg-primary/10 border-primary/30',
  INSUFFICIENT_DATA: 'bg-muted/10 border-border/20',
};

const modeColors: Record<CollaborationImpactStats['currentMode'], string> = {
  enabled: 'text-neural-green',
  disabled: 'text-muted-foreground',
  fallback: 'text-neural-orange',
  independent: 'text-primary',
};

const modeDescriptions: Record<CollaborationImpactStats['currentMode'], string> = {
  enabled: 'Active — influencing trade decisions',
  disabled: 'Manually disabled',
  fallback: 'Auto-disabled for 24h (performance safety)',
  independent: 'Independent — insufficient env context',
};

// ─── Component ───────────────────────────────────────────────

export const AgentCollaborationDashboard = () => {
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [safety, setSafety] = useState<CollaborationSafetyState>(getCollaborationSafetyState());
  const [impact, setImpact] = useState<CollaborationImpactStats>(getCollaborationImpactStats());
  const [loading, setLoading] = useState(true);
  const [learnMode, setLearnMode] = useState<LearnMode>('live+practice');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('agent_id, direction, currency_pair, entry_price, exit_price, status, created_at, confidence_score, session_label, governance_composite, environment, regime_label')
        .in('status', ['closed', 'shadow_eval', 'rejected', 'throttled', 'gated'])
        .not('agent_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (data && data.length > 0) {
        const snap = analyzeAgentCollaboration(data as any, learnMode);
        setSnapshot(snap);
      }
      setImpact(getCollaborationImpactStats());
    } catch (err) {
      console.error('[Collaboration] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [learnMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const synergyLeaderboard = useMemo(() =>
    snapshot?.pairStats.filter(p => p.label === 'SYNERGY').sort((a, b) => b.pairedExpectancy - a.pairedExpectancy) || [],
    [snapshot]
  );

  const conflicts = useMemo(() =>
    snapshot?.pairStats.filter(p => p.label === 'CONFLICT').sort((a, b) => a.pairedExpectancy - b.pairedExpectancy) || [],
    [snapshot]
  );

  const vetoPairs = useMemo(() =>
    snapshot?.pairStats.filter(p => p.label === 'PREDICTIVE-VETO').sort((a, b) => b.vetoSuccessRate - a.vetoSuccessRate) || [],
    [snapshot]
  );

  const allPairs = useMemo(() => snapshot?.pairStats || [], [snapshot]);

  const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
  const agentIcon = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.icon || '🤖';
  const agentStates = useMemo(() => {
    const map = new Map<string, AgentEffectiveState>();
    for (const s of getAllAgentStates()) map.set(s.agentId, s);
    return map;
  }, [snapshot]);
  const getEffState = (id: string) => agentStates.get(id);

  const handleToggleWeighting = () => {
    const newVal = !safety.collaborationWeightingEnabled;
    setCollaborationWeightingEnabled(newVal);
    setSafety(getCollaborationSafetyState());
    setImpact(getCollaborationImpactStats());
  };

  const handleToggleIndependent = () => {
    const newVal = !safety.independentRoutingMode;
    setIndependentRoutingMode(newVal);
    setSafety(getCollaborationSafetyState());
    setImpact(getCollaborationImpactStats());
  };

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/30 text-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading collaboration data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h2 className="font-display text-sm font-bold">Agent Collaboration Graph</h2>
          <EnvironmentBadge env={learnMode === 'backtest' ? 'backtest' : 'live'} />
          <Badge variant="outline" className="text-[9px]">
            {allPairs.length} pairs tracked
          </Badge>
          <Badge variant="outline" className="text-[9px]">
            {snapshot?.learnMode || learnMode}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={learnMode} onValueChange={(v) => setLearnMode(v as LearnMode)}>
            <SelectTrigger className="h-7 text-[10px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live+practice">Live + Practice</SelectItem>
              <SelectItem value="backtest">Backtest Only</SelectItem>
              <SelectItem value="all">All Environments</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={fetchData} className="text-[10px] h-7">
            <RotateCcw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Collaboration Impact Card */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30"
      >
        <h3 className="text-xs font-display font-bold mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" /> Collaboration Impact
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-[9px] text-muted-foreground mb-1">Pips Saved (Veto/Conflict)</div>
            <div className={cn('font-mono text-sm font-bold', impact.netPipsSavedByVeto >= 0 ? 'text-neural-green' : 'text-neural-red')}>
              {impact.netPipsSavedByVeto >= 0 ? '+' : ''}{impact.netPipsSavedByVeto.toFixed(1)}p
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-[9px] text-muted-foreground mb-1">Pips Gained (Synergy)</div>
            <div className={cn('font-mono text-sm font-bold', impact.netPipsGainedBySynergy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
              {impact.netPipsGainedBySynergy >= 0 ? '+' : ''}{impact.netPipsGainedBySynergy.toFixed(1)}p
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-[9px] text-muted-foreground mb-1">Decisions Changed</div>
            <div className="font-mono text-sm font-bold text-foreground">
              {impact.decisionsChangedByCollaboration}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-[9px] text-muted-foreground mb-1">Influence Tier</div>
            <div className={cn('text-sm font-bold uppercase', 
              impact.influenceTier === 'HARD' ? 'text-primary' : 
              impact.influenceTier === 'SOFT' ? 'text-neural-orange' : 
              'text-muted-foreground'
            )}>
              {impact.influenceTier}
            </div>
            <div className="text-[8px] text-muted-foreground mt-0.5">
              Budget: {impact.budgetUsedToday}/{impact.budgetMaxToday} flips
              {impact.softInfluenceDisabledUntil && (
                <span className="text-neural-red ml-1">• Soft disabled</span>
              )}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
            <div className="text-[9px] text-muted-foreground mb-1">Mode</div>
            <div className={cn('text-sm font-bold uppercase', modeColors[impact.currentMode])}>
              {impact.currentMode}
            </div>
            <div className="text-[8px] text-muted-foreground mt-0.5">
              {modeDescriptions[impact.currentMode]}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Paired Opportunity Stats */}
      {snapshot?.opportunityStats && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.015 }}
          className="p-4 rounded-xl bg-card/50 border border-border/30"
        >
          <h3 className="text-xs font-display font-bold mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> Paired Opportunities
          </h3>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Last 24h</div>
              <div className="font-mono text-sm font-bold text-foreground">{snapshot.opportunityStats.opportunities24h}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Last 7d</div>
              <div className="font-mono text-sm font-bold text-foreground">{snapshot.opportunityStats.opportunities7d}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Last 30d</div>
              <div className="font-mono text-sm font-bold text-foreground">{snapshot.opportunityStats.opportunities30d}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Executed Pairs</div>
              <div className="font-mono text-sm font-bold text-neural-green">{snapshot.opportunityStats.executedPairs}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Shadow Pairs</div>
              <div className="font-mono text-sm font-bold text-primary">{snapshot.opportunityStats.shadowPairs}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
              <div className="text-[9px] text-muted-foreground mb-1">Δt Percentiles</div>
              <div className="font-mono text-[10px] text-foreground">
                p50: {snapshot.opportunityStats.timeDeltaP50}m
                <span className="text-muted-foreground mx-1">|</span>
                p75: {snapshot.opportunityStats.timeDeltaP75}m
                <span className="text-muted-foreground mx-1">|</span>
                p90: {snapshot.opportunityStats.timeDeltaP90}m
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.02 }}
        className="p-3 rounded-lg bg-card/30 border border-border/30 flex flex-wrap gap-4 items-center"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Safety Controls</span>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <Switch checked={safety.collaborationWeightingEnabled} onCheckedChange={handleToggleWeighting} className="scale-75" />
          Collaboration Weighting
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <Switch checked={safety.independentRoutingMode} onCheckedChange={handleToggleIndependent} className="scale-75" />
          Independent Routing
        </label>
      </motion.div>

      {/* Conflict Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30"
      >
        <h3 className="text-xs font-display font-bold mb-3 flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5" /> Conflict Heatmap
        </h3>
        {allPairs.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-4">
            No paired trades detected yet. Pairs form when 2+ agents trade the same instrument within a 20-minute window.
          </p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {allPairs.map((pair, i) => (
              <div
                key={i}
                className={cn('flex items-center gap-2 px-2 py-1.5 rounded border text-[10px]', labelBg[pair.label])}
              >
                <span className="shrink-0">{agentIcon(pair.agentA)}</span>
                <span className="font-medium w-24 truncate">{agentName(pair.agentA)}</span>
                {getEffState(pair.agentA) && <EffectiveTierBadge tier={getEffState(pair.agentA)!.effectiveTier} />}
                <span className="text-muted-foreground/50">↔</span>
                <span className="shrink-0">{agentIcon(pair.agentB)}</span>
                <span className="font-medium w-24 truncate">{agentName(pair.agentB)}</span>
                {getEffState(pair.agentB) && <EffectiveTierBadge tier={getEffState(pair.agentB)!.effectiveTier} />}
                <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', labelColor[pair.label])}>
                  {pair.label}
                </Badge>
                <span className="text-muted-foreground ml-auto font-mono">{pair.pairedTrades} trades</span>
                <span className={cn('font-mono', pair.pairedExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                  {pair.pairedExpectancy >= 0 ? '+' : ''}{pair.pairedExpectancy}p
                </span>
                <span className="text-muted-foreground font-mono">PF {pair.coApprovalProfitFactor}</span>
                {pair.pairTimeDeltaMinutes && pair.pairTimeDeltaMinutes.length > 0 && (
                  <span className="text-muted-foreground font-mono text-[8px]">
                    Δt {(pair.pairTimeDeltaMinutes.reduce((s, v) => s + v, 0) / pair.pairTimeDeltaMinutes.length).toFixed(1)}m
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Synergy + Conflict + Veto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-4 rounded-xl bg-card/50 border border-neural-green/20">
          <h3 className="text-xs font-display font-bold mb-2 flex items-center gap-1.5 text-neural-green">
            <Trophy className="w-3.5 h-3.5" /> Synergy Leaderboard
          </h3>
          {synergyLeaderboard.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-3 text-center">No synergy pairs detected</p>
          ) : (
            <div className="space-y-1">
              {synergyLeaderboard.map((pair, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-neural-green/5">
                  <span className="text-neural-green font-bold w-4">#{i + 1}</span>
                  <span>{agentIcon(pair.agentA)} {agentName(pair.agentA)}</span>
                  <span className="text-muted-foreground/50">+</span>
                  <span>{agentIcon(pair.agentB)} {agentName(pair.agentB)}</span>
                  <span className="ml-auto text-neural-green font-mono">+{pair.pairedExpectancy}p</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-4 rounded-xl bg-card/50 border border-neural-red/20">
          <h3 className="text-xs font-display font-bold mb-2 flex items-center gap-1.5 text-neural-red">
            <AlertTriangle className="w-3.5 h-3.5" /> Conflict Zone
          </h3>
          {conflicts.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-3 text-center">No conflicts detected</p>
          ) : (
            <div className="space-y-1">
              {conflicts.map((pair, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-neural-red/5">
                  <span className="text-neural-red font-bold w-4">⚠</span>
                  <span>{agentIcon(pair.agentA)} {agentName(pair.agentA)}</span>
                  <span className="text-muted-foreground/50">vs</span>
                  <span>{agentIcon(pair.agentB)} {agentName(pair.agentB)}</span>
                  <span className="ml-auto text-neural-red font-mono">{pair.pairedExpectancy}p</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-4 rounded-xl bg-card/50 border border-primary/20">
          <h3 className="text-xs font-display font-bold mb-2 flex items-center gap-1.5 text-primary">
            <Shield className="w-3.5 h-3.5" /> Veto Efficiency
          </h3>
          {vetoPairs.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-3 text-center">No predictive vetoes detected</p>
          ) : (
            <div className="space-y-1">
              {vetoPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-primary/5">
                  <span>{agentIcon(pair.agentA)} {agentName(pair.agentA)}</span>
                  <span className="text-primary">→ veto →</span>
                  <span>{agentIcon(pair.agentB)} {agentName(pair.agentB)}</span>
                  <span className="ml-auto font-mono">
                    <span className="text-primary">{(pair.vetoPrecision * 100).toFixed(0)}%</span>
                    <span className="text-muted-foreground mx-1">prec</span>
                    <span className="text-neural-red">{(pair.falseVetoRate * 100).toFixed(0)}%</span>
                    <span className="text-muted-foreground ml-1">false</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Pair Performance Delta Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="p-4 rounded-xl bg-card/50 border border-border/30">
        <h3 className="text-xs font-display font-bold mb-3">Pair Performance Delta</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/20 text-muted-foreground">
                <th className="text-left py-1 px-2">Agent A</th>
                <th className="text-left py-1 px-2">Agent B</th>
                <th className="text-right py-1 px-2">Solo A Exp</th>
                <th className="text-right py-1 px-2">Solo B Exp</th>
                <th className="text-right py-1 px-2">Paired Exp</th>
                <th className="text-right py-1 px-2">Delta</th>
                <th className="text-right py-1 px-2">WR%</th>
                <th className="text-right py-1 px-2">Sharpe</th>
                <th className="text-right py-1 px-2">Conflict%</th>
                <th className="text-right py-1 px-2">Veto Prec</th>
                <th className="text-center py-1 px-2">Label</th>
              </tr>
            </thead>
            <tbody>
              {allPairs.slice(0, 20).map((pair, i) => {
                const soloA = snapshot?.singleAgentStats[pair.agentA]?.soloExpectancy || 0;
                const soloB = snapshot?.singleAgentStats[pair.agentB]?.soloExpectancy || 0;
                const avgSolo = (soloA + soloB) / 2;
                const delta = pair.pairedExpectancy - avgSolo;
                return (
                  <tr key={i} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-1 px-2">{agentIcon(pair.agentA)} {agentName(pair.agentA)}</td>
                    <td className="py-1 px-2">{agentIcon(pair.agentB)} {agentName(pair.agentB)}</td>
                    <td className="text-right py-1 px-2 font-mono">{soloA}p</td>
                    <td className="text-right py-1 px-2 font-mono">{soloB}p</td>
                    <td className={cn('text-right py-1 px-2 font-mono font-medium', pair.pairedExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {pair.pairedExpectancy >= 0 ? '+' : ''}{pair.pairedExpectancy}p
                    </td>
                    <td className={cn('text-right py-1 px-2 font-mono', delta >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(2)}p
                    </td>
                    <td className="text-right py-1 px-2 font-mono">{pair.pairedWinRate}%</td>
                    <td className="text-right py-1 px-2 font-mono">{pair.pairedSharpe}</td>
                    <td className="text-right py-1 px-2 font-mono">{(pair.conflictFrequency * 100).toFixed(0)}%</td>
                    <td className="text-right py-1 px-2 font-mono">{(pair.vetoPrecision * 100).toFixed(0)}%</td>
                    <td className="text-center py-1 px-2">
                      <Badge variant="outline" className={cn('text-[8px] px-1 py-0', labelColor[pair.label])}>
                        {pair.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Collaboration Maturity & Readiness */}
      <CollaborationMaturityPanel snapshot={snapshot} />

      {/* Agent Relationship Models */}
      <AgentRelationshipPanel snapshot={snapshot} />

      {/* Drift Events */}
      {snapshot && snapshot.driftEvents.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="p-4 rounded-xl bg-card/50 border border-neural-orange/20">
          <h3 className="text-xs font-display font-bold mb-2 flex items-center gap-1.5 text-neural-orange">
            <AlertTriangle className="w-3.5 h-3.5" /> Collaboration Drift Events
          </h3>
          <div className="space-y-1">
            {snapshot.driftEvents.map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-neural-orange/5">
                <Badge variant="outline" className={cn('text-[8px] px-1', labelColor[event.previousLabel])}>
                  {event.previousLabel}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="outline" className={cn('text-[8px] px-1', labelColor[event.currentLabel])}>
                  {event.currentLabel}
                </Badge>
                <span className="text-muted-foreground truncate">{event.reason}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
