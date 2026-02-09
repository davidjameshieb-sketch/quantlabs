// ═══════════════════════════════════════════════════════════════
// Agent Relationship Models Panel — Read-Only Diagnostics
// Synergy / Conflict / Veto relationship map with envKey drilldown
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, AlertTriangle, Shield, ChevronDown, ChevronRight, Download, Layers, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import type { CollaborationSnapshot } from '@/lib/agents/agentCollaborationEngine';
import {
  computeCollaborationMaturity,
  exportRelationshipCSV,
  type CollaborationMaturityReport,
  type PairMaturity,
  type RelationshipLabel,
} from '@/lib/agents/collaborationMaturityEngine';

const relColor: Record<RelationshipLabel, string> = {
  SYNERGY: 'text-neural-green',
  CONFLICT: 'text-neural-red',
  NEUTRAL: 'text-muted-foreground',
  'PREDICTIVE-VETO': 'text-primary',
  INSUFFICIENT_DATA: 'text-muted-foreground/50',
};

const relBg: Record<RelationshipLabel, string> = {
  SYNERGY: 'bg-neural-green/5 border-neural-green/20',
  CONFLICT: 'bg-neural-red/5 border-neural-red/20',
  NEUTRAL: 'bg-muted/10 border-border/20',
  'PREDICTIVE-VETO': 'bg-primary/5 border-primary/20',
  INSUFFICIENT_DATA: 'bg-muted/5 border-border/10',
};

interface Props {
  snapshot: CollaborationSnapshot | null;
}

const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
const agentIcon = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.icon || '🤖';

const PairRow = ({ pair }: { pair: PairMaturity }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border/10 hover:bg-muted/5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-1.5 px-2 text-[10px]">
          {expanded ? <ChevronDown className="w-3 h-3 inline mr-1" /> : <ChevronRight className="w-3 h-3 inline mr-1" />}
          {agentIcon(pair.agentA)} {agentName(pair.agentA)}
        </td>
        <td className="py-1.5 px-2 text-[10px]">{agentIcon(pair.agentB)} {agentName(pair.agentB)}</td>
        <td className="text-center py-1.5 px-2">
          <Badge variant="outline" className={cn('text-[8px] px-1', relColor[pair.relationshipLabel])}>
            {pair.relationshipLabel}
          </Badge>
        </td>
        <td className={cn('text-right py-1.5 px-2 font-mono text-[10px]', pair.synergyLift >= 0 ? 'text-neural-green' : 'text-neural-red')}>
          {pair.synergyLift >= 0 ? '+' : ''}{pair.synergyLift}p
        </td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px] text-muted-foreground">
          [{pair.liftCI.lower}, {pair.liftCI.upper}]
        </td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px] text-muted-foreground">
          {pair.liftStability}
        </td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px]">{pair.pairedExpectancy}p</td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px]">{pair.soloExpectancyA}p</td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px]">{pair.soloExpectancyB}p</td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px]">{pair.pairedOpportunities}</td>
        <td className="text-right py-1.5 px-2 font-mono text-[10px]">{pair.envKeyCount}</td>
      </tr>
      <AnimatePresence>
        {expanded && pair.envKeyRelationships.length > 0 && (
          <tr>
            <td colSpan={11} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 py-2 bg-muted/5">
                  <div className="text-[9px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> EnvKey Drilldown ({pair.envKeyRelationships.length} environments)
                  </div>
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/10">
                        <th className="text-left py-0.5 px-1.5">EnvKey</th>
                        <th className="text-right py-0.5 px-1.5">Trades</th>
                        <th className="text-right py-0.5 px-1.5">Paired Exp</th>
                        <th className="text-right py-0.5 px-1.5">Solo Avg</th>
                        <th className="text-right py-0.5 px-1.5">Lift</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pair.envKeyRelationships.map((ek, i) => (
                        <tr key={i} className="border-b border-border/5">
                          <td className="py-0.5 px-1.5 font-mono truncate max-w-[200px]">{ek.envKey}</td>
                          <td className="text-right py-0.5 px-1.5 font-mono">{ek.trades}</td>
                          <td className="text-right py-0.5 px-1.5 font-mono">{ek.pairedExpectancy}p</td>
                          <td className="text-right py-0.5 px-1.5 font-mono">{ek.soloAvg}p</td>
                          <td className={cn('text-right py-0.5 px-1.5 font-mono', ek.synergyLift >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                            {ek.synergyLift >= 0 ? '+' : ''}{ek.synergyLift}p
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
};

const RelationshipSection = ({ title, icon, pairs, borderClass }: {
  title: string;
  icon: React.ReactNode;
  pairs: PairMaturity[];
  borderClass: string;
}) => (
  <div className={cn('p-3 rounded-xl bg-card/50 border', borderClass)}>
    <h4 className="text-[10px] font-display font-bold mb-2 flex items-center gap-1.5">
      {icon} {title}
      <Badge variant="outline" className="text-[8px] px-1 ml-1">{pairs.length}</Badge>
    </h4>
    {pairs.length === 0 ? (
      <p className="text-[9px] text-muted-foreground text-center py-3">No pairs in this category</p>
    ) : (
      <div className="space-y-1">
        {pairs.slice(0, 8).map((pair, i) => (
          <div key={i} className={cn('flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border', relBg[pair.relationshipLabel])}>
            <span className="font-bold w-4 text-muted-foreground">#{i + 1}</span>
            <span>{agentIcon(pair.agentA)} {agentName(pair.agentA)}</span>
            <span className="text-muted-foreground/50">↔</span>
            <span>{agentIcon(pair.agentB)} {agentName(pair.agentB)}</span>
            <span className="ml-auto font-mono">
              <span className={pair.synergyLift >= 0 ? 'text-neural-green' : 'text-neural-red'}>
                {pair.synergyLift >= 0 ? '+' : ''}{pair.synergyLift}p lift
              </span>
              <span className="text-muted-foreground ml-2">CI [{pair.liftCI.lower}, {pair.liftCI.upper}]</span>
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const AgentRelationshipPanel = ({ snapshot }: Props) => {
  const report = useMemo<CollaborationMaturityReport | null>(() => {
    if (!snapshot || snapshot.pairStats.length === 0) return null;
    return computeCollaborationMaturity(snapshot);
  }, [snapshot]);

  const synergies = useMemo(() =>
    report?.pairs.filter(p => p.relationshipLabel === 'SYNERGY').sort((a, b) => b.synergyLift - a.synergyLift) || [], [report]);
  const conflicts = useMemo(() =>
    report?.pairs.filter(p => p.relationshipLabel === 'CONFLICT').sort((a, b) => a.synergyLift - b.synergyLift) || [], [report]);
  const vetoPairs = useMemo(() =>
    report?.pairs.filter(p => p.relationshipLabel === 'PREDICTIVE-VETO').sort((a, b) => b.vetoPrecision - a.vetoPrecision) || [], [report]);

  const handleExport = () => {
    if (!report) return;
    const csv = exportRelationshipCSV(report);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-relationships-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30 text-center">
        <Eye className="w-5 h-5 mx-auto text-muted-foreground mb-2" />
        <p className="text-[10px] text-muted-foreground">INSUFFICIENT DATA — No relationship models available yet.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">Agent Relationship Models</h3>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-muted-foreground">READ-ONLY</Badge>
          <Badge variant="outline" className="text-[8px] px-1.5 py-0">
            {synergies.length} synergy · {conflicts.length} conflict · {vetoPairs.length} veto
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={handleExport} className="text-[10px] h-7">
          <Download className="w-3 h-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Relationship Map Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RelationshipSection
          title="Top Synergies"
          icon={<Trophy className="w-3.5 h-3.5 text-neural-green" />}
          pairs={synergies}
          borderClass="border-neural-green/20"
        />
        <RelationshipSection
          title="Top Conflicts"
          icon={<AlertTriangle className="w-3.5 h-3.5 text-neural-red" />}
          pairs={conflicts}
          borderClass="border-neural-red/20"
        />
        <RelationshipSection
          title="Predictive Veto Pairs"
          icon={<Shield className="w-3.5 h-3.5 text-primary" />}
          pairs={vetoPairs}
          borderClass="border-primary/20"
        />
      </div>

      {/* Full Relationship Table with EnvKey Drilldown */}
      <div className="p-3 rounded-xl bg-card/50 border border-border/30">
        <h4 className="text-[10px] font-bold mb-2 flex items-center gap-1">
          <Layers className="w-3 h-3" /> Full Relationship Matrix (click row to drill into envKeys)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/20 text-muted-foreground">
                <th className="text-left py-1 px-2">Agent A</th>
                <th className="text-left py-1 px-2">Agent B</th>
                <th className="text-center py-1 px-2">Label</th>
                <th className="text-right py-1 px-2">Lift</th>
                <th className="text-right py-1 px-2">95% CI</th>
                <th className="text-right py-1 px-2">Stability</th>
                <th className="text-right py-1 px-2">Paired</th>
                <th className="text-right py-1 px-2">Solo A</th>
                <th className="text-right py-1 px-2">Solo B</th>
                <th className="text-right py-1 px-2">Opps</th>
                <th className="text-right py-1 px-2">EnvKeys</th>
              </tr>
            </thead>
            <tbody>
              {report.pairs
                .sort((a, b) => Math.abs(b.synergyLift) - Math.abs(a.synergyLift))
                .slice(0, 30)
                .map((pair, i) => (
                  <PairRow key={i} pair={pair} />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[8px] text-muted-foreground text-center italic">
        This panel is purely diagnostic. No routing, weighting, or authority decisions are made here.
      </p>
    </motion.div>
  );
};
