import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Brain, Bot, Cpu } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AgentCard } from '@/components/dashboard/agents/AgentCard';
import { StrategyBlocksPanel } from '@/components/dashboard/agents/StrategyBlocksPanel';
import { PerformancePanel } from '@/components/dashboard/agents/PerformancePanel';
import { DecisionsFeed } from '@/components/dashboard/agents/DecisionsFeed';
import { CoordinationBar } from '@/components/dashboard/agents/CoordinationBar';
import { createAgents, getCoordinationState } from '@/lib/agents/agentEngine';
import { AgentId } from '@/lib/agents/types';

const AIAgentsPage = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('equities-alpha');
  
  const agents = useMemo(() => createAgents(), []);
  const coordination = useMemo(() => getCoordinationState(agents), [agents]);
  
  const agent = agents[selectedAgent];
  const agentIds: AgentId[] = ['equities-alpha', 'forex-macro', 'crypto-momentum'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-1">
            <Cpu className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              AI Strategy Agents
            </h1>
          </div>
          <p className="text-muted-foreground">
            Multi-model coordination — each AI follows core volatility, trend, and range analysis while adapting modular strategies.
          </p>
        </motion.div>

        {/* Coordination Bar */}
        <CoordinationBar coordination={coordination} />

        {/* Agent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agentIds.map((id, i) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <AgentCard
                agent={agents[id]}
                isSelected={selectedAgent === id}
                onClick={() => setSelectedAgent(id)}
              />
            </motion.div>
          ))}
        </div>

        {/* Selected Agent Detail */}
        <motion.div
          key={selectedAgent}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Agent description */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{agent.icon}</span>
              <h2 className="font-display text-xl font-bold">{agent.name}</h2>
              <span className="text-sm text-muted-foreground">— {agent.model}</span>
            </div>
            <p className="text-sm text-muted-foreground">{agent.coreStrategy}</p>
          </div>

          {/* Performance + Strategy Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PerformancePanel performance={agent.performance} agentName={agent.name} />
            <StrategyBlocksPanel blocks={agent.strategyBlocks} agentName={agent.name} />
          </div>

          {/* Decisions Feed */}
          <DecisionsFeed decisions={agent.recentDecisions} agentName={agent.name} />
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default AIAgentsPage;
