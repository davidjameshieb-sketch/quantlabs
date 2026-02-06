import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Cpu, BarChart3, Eye, EyeOff } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AgentCard } from '@/components/dashboard/agents/AgentCard';
import { StrategyBlocksPanel } from '@/components/dashboard/agents/StrategyBlocksPanel';
import { PerformancePanel } from '@/components/dashboard/agents/PerformancePanel';
import { DecisionsFeed } from '@/components/dashboard/agents/DecisionsFeed';
import { CoordinationBar } from '@/components/dashboard/agents/CoordinationBar';
import { TradeIntelligenceDrawer } from '@/components/dashboard/agents/TradeIntelligenceDrawer';
import { TradeHistoryFilters } from '@/components/dashboard/agents/TradeHistoryFilters';
import { AgentScorecardPanel } from '@/components/dashboard/agents/AgentScorecardPanel';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { LiveSignalGate } from '@/components/dashboard/LiveSignalGate';
import { createAgents, getCoordinationState } from '@/lib/agents/agentEngine';
import { generateExpandedDetail, generateAgentScorecard, filterDecisions } from '@/lib/agents/tradeIntelligenceEngine';
import { filterDecisionsByTier, getHiddenTradeCount } from '@/lib/agents/tradeVisibility';
import { AgentId, AgentDecision } from '@/lib/agents/types';
import { TradeFilters } from '@/lib/agents/tradeTypes';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const AIAgentsPage = () => {
  const { subscribed } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('equities-alpha');
  const [selectedDecision, setSelectedDecision] = useState<AgentDecision | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<TradeFilters>({
    period: 'all',
    outcome: 'all',
    agent: 'all',
    regime: 'all',
  });
  
  const agents = useMemo(() => createAgents(), []);
  const coordination = useMemo(() => getCoordinationState(agents), [agents]);
  const scorecards = useMemo(() => Object.values(agents).map(generateAgentScorecard), [agents]);
  
  const agent = agents[selectedAgent];
  const agentIds: AgentId[] = ['equities-alpha', 'forex-macro', 'crypto-momentum'];

  // Aggregate all decisions for filtering (or use selected agent's)
  const allDecisions = useMemo(() => {
    if (filters.agent !== 'all') {
      return agents[filters.agent as AgentId]?.recentDecisions || [];
    }
    return agentIds.flatMap(id => agents[id].recentDecisions).sort((a, b) => b.timestamp - a.timestamp);
  }, [agents, filters.agent]);

  const filteredDecisions = useMemo(() => filterDecisions(allDecisions, filters), [allDecisions, filters]);

  // Apply tier-based visibility filtering
  const visibleDecisions = useMemo(
    () => filterDecisionsByTier(filteredDecisions, subscribed),
    [filteredDecisions, subscribed]
  );
  const hiddenCount = useMemo(
    () => getHiddenTradeCount(filteredDecisions),
    [filteredDecisions]
  );

  // Expand decision into full trade detail
  const expandedTrade = useMemo(() => {
    if (!selectedDecision) return null;
    return generateExpandedDetail(selectedDecision, agents, selectedAgent);
  }, [selectedDecision, agents, selectedAgent]);

  const handleSelectDecision = useCallback((d: AgentDecision) => {
    setSelectedDecision(d);
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Cpu className="w-7 h-7 text-primary" />
                <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                  AI Strategy Agents
                </h1>
                <IntelligenceModeBadge />
              </div>
              <p className="text-muted-foreground text-sm">
                Multi-model coordination — transparent, measurable, auditable AI trade intelligence.
              </p>
            </div>
            {/* Summary / Advanced toggle */}
            <button
              onClick={() => setShowAdvanced(prev => !prev)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showAdvanced
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
              )}
            >
              {showAdvanced ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showAdvanced ? 'Summary View' : 'Full Analytics'}
            </button>
          </div>
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
                onClick={() => {
                  setSelectedAgent(id);
                  setFilters(f => ({ ...f, agent: id }));
                }}
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

          {/* Trade History Filters */}
          <div className="p-4 rounded-xl bg-card/50 border border-border/50">
            <TradeHistoryFilters
              filters={filters}
              onFiltersChange={setFilters}
              totalCount={allDecisions.length}
              filteredCount={visibleDecisions.length}
            />
          </div>

          {/* Live signal gate for free users */}
          {!subscribed && hiddenCount > 0 && (
            <LiveSignalGate hiddenCount={hiddenCount} />
          )}

          {/* Decisions Feed — click opens intelligence drawer */}
          <DecisionsFeed
            decisions={visibleDecisions}
            agentName={agent.name}
            onSelectDecision={handleSelectDecision}
          />

          {/* Advanced Analytics Section */}
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {/* Agent Scorecard Comparison */}
              <AgentScorecardPanel scorecards={scorecards} />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Trade Intelligence Drawer */}
      <TradeIntelligenceDrawer
        trade={expandedTrade}
        onClose={() => setSelectedDecision(null)}
      />
    </DashboardLayout>
  );
};

export default AIAgentsPage;
