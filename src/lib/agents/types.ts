// Multi-AI Agent System Types
// Each agent specializes in a market and follows core volatility/trend/range strategy

import { MarketType, BiasDirection, StrategyState, EfficiencyVerdict } from '@/lib/market/types';

export type AgentId = 
  | 'equities-alpha' 
  | 'forex-macro' 
  | 'crypto-momentum'
  | 'liquidity-radar'
  | 'range-navigator'
  | 'volatility-architect'
  | 'adaptive-learner'
  | 'sentiment-reactor'
  | 'fractal-intelligence'
  | 'risk-sentinel';

export type AgentStatus = 'active' | 'idle' | 'analyzing' | 'leading';

export type StrategyBlockType = 
  | 'trend-follow'
  | 'mean-reversion'
  | 'breakout'
  | 'momentum'
  | 'volatility-compression'
  | 'range-trading'
  | 'macro-overlay';

export interface StrategyBlock {
  id: string;
  type: StrategyBlockType;
  name: string;
  description: string;
  weight: number; // 0-1, how much this block contributes
  active: boolean;
  parameters: Record<string, number>;
  lastUpdated: number;
}

export interface AgentPerformance {
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  currentStreak: number; // positive = wins, negative = losses
  last30DayPnl: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldingPeriod: number; // in bars
}

export interface AgentDecision {
  timestamp: number;
  ticker: string;
  bias: BiasDirection;
  confidence: number;
  strategy: StrategyState;
  efficiency: EfficiencyVerdict;
  reasoning: string;
  strategyBlocks: string[]; // which blocks contributed
  expectedReturn: number;
  riskReward: number;
}

export interface AIAgent {
  id: AgentId;
  name: string;
  description: string;
  market: MarketType;
  status: AgentStatus;
  model: string; // AI model powering this agent
  icon: string; // emoji icon
  color: string; // CSS color class
  
  // Strategy configuration
  strategyBlocks: StrategyBlock[];
  coreStrategy: string; // text description of approach
  
  // Performance
  performance: AgentPerformance;
  
  // Recent decisions
  recentDecisions: AgentDecision[];
  
  // Coordination
  coordinationScore: number; // 0-100, determines leadership
  isLeading: boolean;
  lastAnalysis: number;
}

export interface CoordinationState {
  leadingAgent: AgentId;
  agents: Record<AgentId, AIAgent>;
  consensusBias: BiasDirection;
  consensusConfidence: number;
  lastCoordination: number;
  marketRegime: 'trending' | 'ranging' | 'volatile' | 'quiet';
}

// Strategy block templates
export const STRATEGY_BLOCK_TEMPLATES: Record<StrategyBlockType, Omit<StrategyBlock, 'id' | 'lastUpdated'>> = {
  'trend-follow': {
    type: 'trend-follow',
    name: 'Trend Following',
    description: 'Core trend-tracking using Neural Cores — fast/slow separation with ATR-normalized confidence.',
    weight: 0.35,
    active: true,
    parameters: { lookback: 21, sensitivity: 0.6, minEfficiency: 0.3 },
  },
  'mean-reversion': {
    type: 'mean-reversion',
    name: 'Mean Reversion',
    description: 'Fades extended moves when efficiency collapses and structure is noisy.',
    weight: 0.15,
    active: false,
    parameters: { threshold: 2.0, cooldown: 5, maxExposure: 0.3 },
  },
  'breakout': {
    type: 'breakout',
    name: 'Breakout Detection',
    description: 'Identifies compression zones and trades the initial breakout expansion.',
    weight: 0.2,
    active: true,
    parameters: { compressionBars: 10, volumeMultiplier: 1.5, atrExpansion: 1.2 },
  },
  'momentum': {
    type: 'momentum',
    name: 'Momentum Scoring',
    description: 'Ranks assets by rate of change and conviction acceleration.',
    weight: 0.15,
    active: true,
    parameters: { rocPeriod: 10, accelerationWeight: 0.6, minConviction: 0.4 },
  },
  'volatility-compression': {
    type: 'volatility-compression',
    name: 'Volatility Compression',
    description: 'Detects low-volatility squeezes before explosive moves.',
    weight: 0.1,
    active: true,
    parameters: { bbPeriod: 20, sqzThreshold: 0.8, minBars: 5 },
  },
  'range-trading': {
    type: 'range-trading',
    name: 'Range Trading',
    description: 'Trades support/resistance bounces when efficiency is noisy.',
    weight: 0.05,
    active: false,
    parameters: { rangePeriod: 50, bounceThreshold: 0.02, stopMultiple: 1.5 },
  },
  'macro-overlay': {
    type: 'macro-overlay',
    name: 'Macro Overlay',
    description: 'Adjusts position sizing based on cross-market correlation and regime.',
    weight: 0.1,
    active: true,
    parameters: { correlationWindow: 30, regimeSmoothing: 0.7, maxAllocation: 0.8 },
  },
};
