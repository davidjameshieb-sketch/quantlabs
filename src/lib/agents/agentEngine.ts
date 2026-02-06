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
  // All models use Alpha Engine-calibrated profitable baselines
  const baseWinRate = agentId === 'equities-alpha' ? 0.61 : agentId === 'forex-macro' ? 0.57 : 0.55;
  const baseSharpe = agentId === 'equities-alpha' ? 1.6 : agentId === 'forex-macro' ? 1.4 : 1.3;
  
  const winRate = baseWinRate + rng.range(-0.03, 0.04);
  const totalTrades = Math.floor(rng.range(100, 250));
  // Positive average return for all models — Alpha Engine-focused conviction
  const avgReturn = rng.range(0.008, 0.025);
  const totalPnl = totalTrades * avgReturn * 10000 * rng.range(0.6, 1.4); // scaled to $10k account
  
  return {
    totalTrades,
    winRate,
    avgReturn,
    totalPnl,
    sharpeRatio: baseSharpe + rng.range(-0.2, 0.3),
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
  
  // Generate multiple rounds of decisions to create a realistic trade history
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
  
  // All agents now share Alpha Engine-focused strategy blocks: trend-follow + momentum primary
  const blockConfigs: Record<AgentId, StrategyBlockType[]> = {
    'equities-alpha': ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
    'forex-macro': ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
    'crypto-momentum': ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
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
      description: 'Forex-focused AI using Alpha Engine methodology — trend-following with momentum overlay adapted for 24/5 currency markets. ATR-normalized confidence and volatility compression entry timing.',
      market: 'forex',
      status: 'active',
      model: 'GPT-5',
      icon: '🌐',
      color: 'text-primary',
      strategyBlocks: createStrategyBlocks('forex-macro'),
      coreStrategy: 'Alpha Engine-calibrated trend-following with momentum overlay. Measures volatility compression for entry timing across forex pairs, tracks efficiency for clean vs noisy conditions, and uses ATR-normalized confidence for position sizing. Session-based liquidity adaptation layered on top.',
      performance: generatePerformance('forex-macro', rng),
      recentDecisions: generateDecisions('forex', rng),
      coordinationScore: 72,
      isLeading: false,
      lastAnalysis: Date.now() - 300000,
    },
    'crypto-momentum': {
      id: 'crypto-momentum',
      name: 'Momentum Grid',
      description: 'Crypto-focused AI using Alpha Engine methodology — trend-following with momentum overlay adapted for 24/7 digital asset markets. Volatility compression detection and ATR-based conviction scaling.',
      market: 'crypto',
      status: 'active',
      model: 'Gemini Flash',
      icon: '⚡',
      color: 'text-neural-orange',
      strategyBlocks: createStrategyBlocks('crypto-momentum'),
      coreStrategy: 'Alpha Engine-calibrated trend-following with momentum confirmation. Uses volatility compression detection for early entry in squeeze setups, tracks trend efficiency for clean directional moves, and scales positions via ATR-normalized confidence. Optimized for high-volatility digital asset environments.',
      performance: generatePerformance('crypto-momentum', rng),
      recentDecisions: generateDecisions('crypto', rng),
      coordinationScore: 68,
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
