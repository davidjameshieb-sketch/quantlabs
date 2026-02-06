// Multi-AI Agent Engine
// Creates and manages specialized market agents

import { 
  AIAgent, 
  AgentId, 
  AgentPerformance, 
  AgentDecision, 
  StrategyBlock,
  CoordinationState,
  STRATEGY_BLOCK_TEMPLATES,
} from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from './agentConfig';
import { TICKERS } from '@/lib/market/tickers';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { MarketType, BiasDirection } from '@/lib/market/types';
import { StrategyBlockType } from './types';

// Seeded random for consistent simulation
class AgentRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
}

// Generate realistic performance metrics
const generatePerformance = (agentId: AgentId, rng: AgentRNG): AgentPerformance => {
  const def = AGENT_DEFINITIONS[agentId];
  const winRate = def.baseWinRate + rng.range(-0.03, 0.04);
  const totalTrades = Math.floor(rng.range(100, 250));
  const avgReturn = rng.range(0.008, 0.025);
  const totalPnl = totalTrades * avgReturn * 10000 * rng.range(0.6, 1.4);
  
  return {
    totalTrades,
    winRate,
    avgReturn,
    totalPnl,
    sharpeRatio: def.baseSharpe + rng.range(-0.2, 0.3),
    maxDrawdown: rng.range(400, 1200),
    profitFactor: 1.3 + rng.range(0.2, 0.8),
    currentStreak: Math.floor(rng.range(0, 8)),
    last30DayPnl: totalPnl * rng.range(0.08, 0.25),
    bestTrade: rng.range(200, 900),
    worstTrade: rng.range(-400, -80),
    avgHoldingPeriod: rng.range(3, 12),
  };
};

// Generate recent decisions from analysis
const generateDecisions = (market: MarketType, rng: AgentRNG): AgentDecision[] => {
  const marketTickers = TICKERS.filter(t => t.type === market).slice(0, 20);
  const decisions: AgentDecision[] = [];
  
  const rounds = Math.floor(rng.range(8, 15));
  
  for (let round = 0; round < rounds; round++) {
    const tickersThisRound = marketTickers.slice(0, Math.floor(rng.range(3, 10)));
    
    for (const ticker of tickersThisRound) {
      const analysis = analyzeMarket(ticker, '1h');
      
      const blockTypes: StrategyBlockType[] = ['trend-follow', 'momentum', 'breakout'];
      const usedBlocks = blockTypes.filter(() => rng.next() > 0.4);
      
      decisions.push({
        timestamp: Date.now() - Math.floor(rng.range(round * 86400000, (round + 1) * 86400000)),
        ticker: ticker.symbol,
        bias: analysis.bias,
        confidence: analysis.confidencePercent + rng.range(-15, 15),
        strategy: analysis.strategyState,
        efficiency: analysis.efficiency.verdict,
        reasoning: analysis.narrative,
        strategyBlocks: usedBlocks,
        expectedReturn: rng.range(-0.02, 0.04),
        riskReward: rng.range(1.2, 3.5),
      });
    }
  }
  
  return decisions.sort((a, b) => b.timestamp - a.timestamp);
};

// Create strategy blocks for an agent
const createStrategyBlocks = (agentId: AgentId): StrategyBlock[] => {
  const now = Date.now();
  const def = AGENT_DEFINITIONS[agentId];
  const types = def.strategyBlocks;
  
  return types.map((type, i) => ({
    ...STRATEGY_BLOCK_TEMPLATES[type],
    id: `${agentId}-${type}`,
    lastUpdated: now - Math.floor(Math.random() * 3600000),
    active: i < 4,
    weight: STRATEGY_BLOCK_TEMPLATES[type].weight + (i === 0 ? 0.1 : 0),
  }));
};

// Create all agents
export const createAgents = (): Record<AgentId, AIAgent> => {
  const rng = new AgentRNG(42);
  
  const agents: Record<AgentId, AIAgent> = {} as Record<AgentId, AIAgent>;
  
  for (const def of Object.values(AGENT_DEFINITIONS)) {
    const isLeader = def.id === 'equities-alpha';
    agents[def.id] = {
      id: def.id,
      name: def.name,
      description: def.description,
      market: def.market,
      status: isLeader ? 'leading' : 'active',
      model: def.model,
      icon: def.icon,
      color: def.color,
      strategyBlocks: createStrategyBlocks(def.id),
      coreStrategy: def.coreStrategy,
      performance: generatePerformance(def.id, rng),
      recentDecisions: generateDecisions(def.market, rng),
      coordinationScore: def.coordinationScore,
      isLeading: isLeader,
      lastAnalysis: Date.now() - Math.floor(rng.range(60000, 600000)),
    };
  }
  
  return agents;
};

// Get coordination state
export const getCoordinationState = (agents: Record<AgentId, AIAgent>): CoordinationState => {
  const agentList = Object.values(agents);
  const leader = agentList.reduce((best, a) => a.coordinationScore > best.coordinationScore ? a : best);
  
  const bullishVotes = agentList.filter(a => {
    const latestDecision = a.recentDecisions[0];
    return latestDecision?.bias === 'bullish';
  }).length;
  
  const consensusBias: BiasDirection = bullishVotes > agentList.length / 2 ? 'bullish' : 'bearish';
  const consensusConfidence = agentList.reduce((sum, a) => sum + a.coordinationScore, 0) / agentList.length;
  
  const avgEfficiency = agentList.reduce((sum, a) => {
    const cleanCount = a.recentDecisions.filter(d => d.efficiency === 'clean').length;
    return sum + cleanCount / Math.max(1, a.recentDecisions.length);
  }, 0) / agentList.length;
  
  let marketRegime: 'trending' | 'ranging' | 'volatile' | 'quiet';
  if (avgEfficiency > 0.6) marketRegime = 'trending';
  else if (avgEfficiency < 0.3) marketRegime = 'volatile';
  else if (consensusConfidence > 60) marketRegime = 'ranging';
  else marketRegime = 'quiet';
  
  return {
    leadingAgent: leader.id,
    agents,
    consensusBias,
    consensusConfidence,
    lastCoordination: Date.now(),
    marketRegime,
  };
};
