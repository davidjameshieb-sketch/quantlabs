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
  StrategyBlockType,
} from './types';
import { TICKERS } from '@/lib/market/tickers';
import { analyzeMarket } from '@/lib/market/analysisEngine';
import { MarketType, BiasDirection } from '@/lib/market/types';

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
  const baseWinRate = agentId === 'equities-alpha' ? 0.58 : agentId === 'forex-macro' ? 0.52 : 0.48;
  const baseSharpe = agentId === 'equities-alpha' ? 1.4 : agentId === 'forex-macro' ? 1.1 : 0.9;
  
  const winRate = baseWinRate + rng.range(-0.05, 0.05);
  const totalTrades = Math.floor(rng.range(80, 250));
  const avgReturn = rng.range(0.005, 0.025) * (winRate > 0.5 ? 1 : -0.5);
  const totalPnl = totalTrades * avgReturn * 1000 * rng.range(0.5, 1.5); // scaled to $1k account
  
  return {
    totalTrades,
    winRate,
    avgReturn,
    totalPnl,
    sharpeRatio: baseSharpe + rng.range(-0.3, 0.3),
    maxDrawdown: rng.range(50, 200),
    profitFactor: 1 + rng.range(0.1, 0.8),
    currentStreak: Math.floor(rng.range(-5, 8)),
    last30DayPnl: totalPnl * rng.range(0.05, 0.2),
    bestTrade: rng.range(15, 80),
    worstTrade: rng.range(-60, -10),
    avgHoldingPeriod: rng.range(3, 15),
  };
};

// Generate recent decisions from analysis
const generateDecisions = (market: MarketType, rng: AgentRNG): AgentDecision[] => {
  const marketTickers = TICKERS.filter(t => t.type === market).slice(0, 10);
  const decisions: AgentDecision[] = [];
  
  for (const ticker of marketTickers.slice(0, 5)) {
    const analysis = analyzeMarket(ticker, '1h');
    
    const blockTypes: StrategyBlockType[] = ['trend-follow', 'momentum', 'breakout'];
    const usedBlocks = blockTypes.filter(() => rng.next() > 0.4);
    
    decisions.push({
      timestamp: Date.now() - Math.floor(rng.range(0, 3600000 * 12)),
      ticker: ticker.symbol,
      bias: analysis.bias,
      confidence: analysis.confidencePercent,
      strategy: analysis.strategyState,
      efficiency: analysis.efficiency.verdict,
      reasoning: analysis.narrative,
      strategyBlocks: usedBlocks,
      expectedReturn: rng.range(-0.02, 0.04),
      riskReward: rng.range(1.2, 3.5),
    });
  }
  
  return decisions.sort((a, b) => b.timestamp - a.timestamp);
};

// Create strategy blocks for an agent
const createStrategyBlocks = (agentId: AgentId): StrategyBlock[] => {
  const now = Date.now();
  
  const blockConfigs: Record<AgentId, StrategyBlockType[]> = {
    'equities-alpha': ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
    'forex-macro': ['trend-follow', 'range-trading', 'mean-reversion', 'macro-overlay', 'breakout'],
    'crypto-momentum': ['momentum', 'breakout', 'trend-follow', 'volatility-compression', 'mean-reversion'],
  };
  
  const types = blockConfigs[agentId];
  return types.map((type, i) => ({
    ...STRATEGY_BLOCK_TEMPLATES[type],
    id: `${agentId}-${type}`,
    lastUpdated: now - Math.floor(Math.random() * 3600000),
    active: i < 4, // first 4 active
    weight: STRATEGY_BLOCK_TEMPLATES[type].weight + (i === 0 ? 0.1 : 0),
  }));
};

// Create all agents
export const createAgents = (): Record<AgentId, AIAgent> => {
  const rng = new AgentRNG(42);
  
  const agents: Record<AgentId, AIAgent> = {
    'equities-alpha': {
      id: 'equities-alpha',
      name: 'Alpha Engine',
      description: 'Equities-focused AI measuring volatility, trends, and ranges across S&P 500. Emphasizes quantitative trading with trend-following and momentum strategies.',
      market: 'stocks',
      status: 'leading',
      model: 'Gemini Pro',
      icon: '📈',
      color: 'text-neural-green',
      strategyBlocks: createStrategyBlocks('equities-alpha'),
      coreStrategy: 'Trend-following with momentum overlay. Measures volatility compression for entry timing, tracks efficiency for clean vs noisy conditions, and uses ATR-normalized confidence for position sizing.',
      performance: generatePerformance('equities-alpha', rng),
      recentDecisions: generateDecisions('stocks', rng),
      coordinationScore: 78,
      isLeading: true,
      lastAnalysis: Date.now() - 120000,
    },
    'forex-macro': {
      id: 'forex-macro',
      name: 'Macro Pulse',
      description: 'Forex-focused AI for 24/5 currency markets. Combines macro-economic insights with core volatility and range analysis. Adapts to session-based liquidity patterns.',
      market: 'forex',
      status: 'active',
      model: 'GPT-5',
      icon: '🌐',
      color: 'text-primary',
      strategyBlocks: createStrategyBlocks('forex-macro'),
      coreStrategy: 'Range and macro overlay approach. Identifies session-based volatility patterns, measures trend efficiency across pairs, and uses correlation analysis for hedging. Strong in ranging and mean-reversion conditions.',
      performance: generatePerformance('forex-macro', rng),
      recentDecisions: generateDecisions('forex', rng),
      coordinationScore: 62,
      isLeading: false,
      lastAnalysis: Date.now() - 300000,
    },
    'crypto-momentum': {
      id: 'crypto-momentum',
      name: 'Momentum Grid',
      description: 'Crypto-focused AI for 24/7 digital asset markets. Aggressive momentum and breakout strategies adapted for high-volatility environments.',
      market: 'crypto',
      status: 'active',
      model: 'Gemini Flash',
      icon: '⚡',
      color: 'text-neural-orange',
      strategyBlocks: createStrategyBlocks('crypto-momentum'),
      coreStrategy: 'Momentum-first with breakout confirmation. Exploits high volatility environments with aggressive position scaling on clean trends. Uses volatility compression detection for early entry in squeeze setups.',
      performance: generatePerformance('crypto-momentum', rng),
      recentDecisions: generateDecisions('crypto', rng),
      coordinationScore: 55,
      isLeading: false,
      lastAnalysis: Date.now() - 180000,
    },
  };
  
  return agents;
};

// Get coordination state
export const getCoordinationState = (agents: Record<AgentId, AIAgent>): CoordinationState => {
  // Find leading agent (highest coordination score)
  const agentList = Object.values(agents);
  const leader = agentList.reduce((best, a) => a.coordinationScore > best.coordinationScore ? a : best);
  
  // Consensus bias
  const bullishVotes = agentList.filter(a => {
    const latestDecision = a.recentDecisions[0];
    return latestDecision?.bias === 'bullish';
  }).length;
  
  const consensusBias: BiasDirection = bullishVotes > agentList.length / 2 ? 'bullish' : 'bearish';
  const consensusConfidence = agentList.reduce((sum, a) => sum + a.coordinationScore, 0) / agentList.length;
  
  // Market regime
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
