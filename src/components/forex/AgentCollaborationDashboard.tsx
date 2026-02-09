// ═══════════════════════════════════════════════════════════════
// Agent Collaboration Dashboard
// Section 6 — Network Graph, Heatmap, Leaderboard, Veto Ranking
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Network, Trophy, AlertTriangle, Shield, ToggleLeft, ToggleRight, Lock, Unlock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import {
  analyzeAgentCollaboration,
  CollaborationSnapshot,
  AgentPairStats,
  CollaborationLabel,
} from '@/lib/agents/agentCollaborationEngine';
import {
  getCollaborationSafetyState,
  setCollaborationWeightingEnabled,
  setIndependentRoutingMode,
  CollaborationSafetyState,
} from '@/lib/agents/agentCollaborationRouter';

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

// ─── Component ───────────────────────────────────────────────

export const AgentCollaborationDashboard = () => {
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [safety, setSafety] = useState<CollaborationSafetyState>(getCollaborationSafetyState());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('agent_id, direction, currency_pair, entry_price, exit_price, status, created_at, confidence_score, session_label, governance_composite')
        .eq('status', 'closed')
        .not('agent_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (data && data.length > 0) {
        const snap = analyzeAgentCollaboration(data as any);
        setSnapshot(snap);
      }
    } catch (err) {
      console.error('[Collaboration] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sorted views
  const synergyLeaderboard = useMemo(() =>
    snapshot?.pairStats
      .filter(p => p.label === 'SYNERGY')
      .sort((a, b) => b.pairedExpectancy - a.pairedExpectancy) || [],
    [snapshot]
  );

  const conflicts = useMemo(() =>
    snapshot?.pairStats
      .filter(p => p.label === 'CONFLICT')
      .sort((a, b) => a.pairedExpectancy - b.pairedExpectancy) || [],
    [snapshot]
  );

  const vetoPairs = useMemo(() =>
    snapshot?.pairStats
      .filter(p => p.label === 'PREDICTIVE-VETO')
      .sort((a, b) => b.vetoSuccessRate - a.vetoSuccessRate) || [],
    [snapshot]
  );

  const allPairs = useMemo(() => snapshot?.pairStats || [], [snapshot]);

  const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
  const agentIcon = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.icon || '🤖';

  // Safety toggles
  const handleToggleWeighting = () => {
    const newVal = !safety.collaborationWeightingEnabled;
    setCollaborationWeightingEnabled(newVal);
    setSafety(getCollaborationSafetyState());
  };

  const handleToggleIndependent = () => {
    const newVal = !safety.independentRoutingMode;
    setIndependentRoutingMode(newVal);
    setSafety(getCollaborationSafetyState());
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
          <Badge variant="outline" className="text-[9px]">
            {allPairs.length} pairs tracked
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchData} className="text-[10px] h-7">
          <RotateCcw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Safety Controls — Section 7 */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-card/30 border border-border/30 flex flex-wrap gap-4 items-center"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Safety Controls</span>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <Switch
            checked={safety.collaborationWeightingEnabled}
            onCheckedChange={handleToggleWeighting}
            className="scale-75"
          />
          Collaboration Weighting
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <Switch
            checked={safety.independentRoutingMode}
            onCheckedChange={handleToggleIndependent}
            className="scale-75"
          />
          Independent Routing
        </label>
      </motion.div>

      {/* Relationship Network Graph (simplified grid) */}
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
            No paired trades detected yet. Pairs form when 2+ agents trade the same instrument within a 5-minute window.
          </p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {allPairs.map((pair, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded border text-[10px]',
                  labelBg[pair.label]
                )}
              >
                <span className="shrink-0">{agentIcon(pair.agentA)}</span>
                <span className="font-medium w-24 truncate">{agentName(pair.agentA)}</span>
                <span className="text-muted-foreground/50">↔</span>
                <span className="shrink-0">{agentIcon(pair.agentB)}</span>
                <span className="font-medium w-24 truncate">{agentName(pair.agentB)}</span>
                <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', labelColor[pair.label])}>
                  {pair.label}
                </Badge>
                <span className="text-muted-foreground ml-auto font-mono">
                  {pair.pairedTrades} trades
                </span>
                <span className={cn('font-mono', pair.pairedExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                  {pair.pairedExpectancy >= 0 ? '+' : ''}{pair.pairedExpectancy}p
                </span>
                <span className="text-muted-foreground font-mono">
                  PF {pair.coApprovalProfitFactor}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Synergy Leaderboard + Conflict + Veto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Synergy Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-xl bg-card/50 border border-neural-green/20"
        >
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

        {/* Conflict Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-xl bg-card/50 border border-neural-red/20"
        >
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

        {/* Veto Efficiency */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-xl bg-card/50 border border-primary/20"
        >
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
                  <span className="ml-auto text-primary font-mono">{(pair.vetoSuccessRate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Pair Performance Delta Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30"
      >
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
                    <td className={cn('text-right py-1 px-2 font-mono font-medium',
                      pair.pairedExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {pair.pairedExpectancy >= 0 ? '+' : ''}{pair.pairedExpectancy}p
                    </td>
                    <td className={cn('text-right py-1 px-2 font-mono',
                      delta >= 0 ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(2)}p
                    </td>
                    <td className="text-right py-1 px-2 font-mono">{pair.pairedWinRate}%</td>
                    <td className="text-right py-1 px-2 font-mono">{pair.pairedSharpe}</td>
                    <td className="text-right py-1 px-2 font-mono">{(pair.conflictFrequency * 100).toFixed(0)}%</td>
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

      {/* Drift Events */}
      {snapshot && snapshot.driftEvents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 rounded-xl bg-card/50 border border-neural-orange/20"
        >
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
