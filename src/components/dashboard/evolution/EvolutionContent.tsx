import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MetaControllerPanel } from './MetaControllerPanel';
import { RiskStabilityMeter } from './RiskStabilityMeter';
import { AdaptiveRangeViz } from './AdaptiveRangeViz';
import { EvolutionConfidenceIndicator } from './EvolutionConfidenceIndicator';
import { BehavioralRiskMonitor } from './BehavioralRiskMonitor';
import { CapitalAllocationChart } from './CapitalAllocationChart';
import { ReversionLog } from './ReversionLog';
import { MTFIntelligencePanel } from './MTFIntelligencePanel';
import { createAgents } from '@/lib/agents/agentEngine';
import { createEvolutionEcosystem } from '@/lib/agents/metaControllerEngine';
import { AgentId } from '@/lib/agents/types';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const AGENT_TABS: Array<{ id: AgentId; label: string; icon: string }> = [
  { id: 'equities-alpha', label: 'Alpha Engine', icon: '📈' },
  { id: 'forex-macro', label: 'Macro Pulse', icon: '🌐' },
  { id: 'crypto-momentum', label: 'Momentum Grid', icon: '⚡' },
];

export const EvolutionContent = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('equities-alpha');

  const { ecosystem, agents } = useMemo(() => {
    const agentsData = createAgents();
    const eco = createEvolutionEcosystem(agentsData);
    return { ecosystem: eco, agents: agentsData };
  }, []);

  const meta = ecosystem.metaController;
  const agentEvo = ecosystem.agentEvolution[selectedAgent];
  const agentMeta = AGENT_TABS.find(t => t.id === selectedAgent)!;

  return (
    <div className="space-y-6">
      {/* Ecosystem Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { label: 'Ecosystem Age', value: `${ecosystem.ecosystemAge} cycles`, color: 'text-primary' },
          { label: 'Total Mutations', value: ecosystem.totalMutations.toString(), color: 'text-[hsl(var(--neural-orange))]' },
          { label: 'Survival Rate', value: `${(ecosystem.survivalRate * 100).toFixed(1)}%`, color: ecosystem.survivalRate > 0.5 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]' },
          { label: 'Adaptation Rate', value: `${meta.adaptationRate.toFixed(1)}/cycle`, color: 'text-[hsl(var(--neural-purple))]' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="p-3 rounded-xl bg-card/50 border border-border/50 text-center"
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className={cn('text-lg font-mono font-bold', stat.color)}>{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="evolution" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30">
          <TabsTrigger value="evolution" className="text-xs">Adaptive Evolution</TabsTrigger>
          <TabsTrigger value="mtf" className="text-xs">MTF Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution" className="space-y-6">
          {/* Row 1: Meta-Controller + Risk Anchors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MetaControllerPanel state={meta} />
            <RiskStabilityMeter anchors={meta.riskAnchors} />
          </div>

          {/* Row 2: Capital Allocation + Evolution Confidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CapitalAllocationChart allocation={meta.capitalAllocation} />
            <EvolutionConfidenceIndicator evolution={ecosystem.agentEvolution} />
          </div>

          {/* Agent-Specific Deep Dive */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-bold text-foreground">Agent Deep Dive</h2>
              <div className="flex gap-2">
                {AGENT_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedAgent(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      selectedAgent === tab.id
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-muted/10 text-muted-foreground border-border/30 hover:bg-muted/20'
                    )}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <motion.div
              key={selectedAgent}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              <AdaptiveRangeViz params={agentEvo.adaptiveParams} agentName={agentMeta.label} />
              <BehavioralRiskMonitor risk={agentEvo.behavioralRisk} agentName={agentMeta.label} />
            </motion.div>
          </div>

          {/* Reversion Log */}
          <ReversionLog checkpoints={meta.reversionHistory} />
        </TabsContent>

        <TabsContent value="mtf" className="space-y-4">
          <MTFIntelligencePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
