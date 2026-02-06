// Extended trade intelligence types for AI agent transparency

import { AgentId, AgentDecision } from './types';
import { EfficiencyVerdict, BiasDirection, StrategyState } from '@/lib/market/types';

export type TradeStatus = 'open' | 'closed' | 'avoided' | 'monitoring';

export type SignalLifecycle = 'entry' | 'monitoring' | 'holding' | 'exit' | 'post-eval' | 'avoided';

export interface TradeRiskIntelligence {
  maxDrawdownPct: number;
  volatilityRegime: 'low' | 'moderate' | 'high' | 'extreme';
  efficiencyDuringTrade: EfficiencyVerdict;
  riskFiltersTriggered: string[];
  avoidanceReason?: string;
}

export interface AgentContribution {
  agentId: AgentId;
  agentName: string;
  confidenceWeight: number;
  model: string;
  icon: string;
}

export interface TradeTransparency {
  agents: AgentContribution[];
  multiAgentAgreement: number; // 0-100
  marketRegime: 'trending' | 'ranging' | 'volatile' | 'quiet';
  reasoningSummary: string;
}

export interface TradeTimeline {
  stage: SignalLifecycle;
  timestamp: number;
  label: string;
  description: string;
}

export interface ExpandedTradeDetail {
  decision: AgentDecision;
  
  // Trade Performance
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  currentPnlPct: number;
  finalPnlPct?: number;
  riskRewardOutcome: number;
  timeInTrade: number; // minutes
  lifecycle: SignalLifecycle;
  
  // Risk Intelligence
  risk: TradeRiskIntelligence;
  
  // AI Transparency
  transparency: TradeTransparency;
  
  // Timeline
  timeline: TradeTimeline[];
}

export type TradeFilterPeriod = '5d' | '30d' | '90d' | 'all';
export type TradeFilterOutcome = 'all' | 'winning' | 'losing' | 'avoided' | 'watching';
export type TradeFilterAgent = 'all' | AgentId;

export interface TradeFilters {
  period: TradeFilterPeriod;
  outcome: TradeFilterOutcome;
  agent: TradeFilterAgent;
  regime: 'all' | 'trending' | 'ranging' | 'volatile' | 'quiet';
}

export interface AgentScorecard {
  agentId: AgentId;
  agentName: string;
  icon: string;
  model: string;
  winRate: number;
  avgReturn: number;
  avgDrawdown: number;
  signalReliability: number; // 0-100
  tradeFrequency: number; // trades per day
  riskEffectiveness: number; // 0-100
  marketStrengthPerformance: Record<string, number>; // regime -> win rate
}
