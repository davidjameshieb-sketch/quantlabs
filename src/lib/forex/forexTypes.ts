// Forex Trade Intelligence Types
// Isolated type system for Forex-only trade performance tracking

import { AgentId } from '@/lib/agents/types';
import { LedgerTradeEntry } from '@/lib/agents/ledgerTypes';

// ─── Time Filter ───

export type ForexTimePeriod = '5d' | '30d' | '90d' | 'ytd' | 'inception';

export const FOREX_PERIOD_LABELS: Record<ForexTimePeriod, string> = {
  '5d': 'Last 5 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  ytd: 'Year-To-Date',
  inception: 'Since Inception',
};

// ─── Execution Mode ───

export type ExecutionMode = 'signal-only' | 'assisted-ready' | 'auto-eligible';

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  'signal-only': 'Intelligence Signal Only',
  'assisted-ready': 'Assisted Execution Ready',
  'auto-eligible': 'Fully Automated Execution Eligible',
};

export const EXECUTION_MODE_COLORS: Record<ExecutionMode, string> = {
  'signal-only': 'bg-muted/30 text-muted-foreground border-border/50',
  'assisted-ready': 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  'auto-eligible': 'bg-neural-green/20 text-neural-green border-neural-green/30',
};

// ─── Forex Regime ───

export type ForexRegime = 'trending' | 'ranging' | 'high-volatility' | 'low-liquidity';

export const FOREX_REGIME_LABELS: Record<ForexRegime, string> = {
  trending: 'Trending FX',
  ranging: 'Ranging FX',
  'high-volatility': 'High Volatility FX',
  'low-liquidity': 'Low Liquidity FX',
};

export const FOREX_REGIME_COLORS: Record<ForexRegime, string> = {
  trending: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  ranging: 'bg-primary/20 text-primary border-primary/30',
  'high-volatility': 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  'low-liquidity': 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

// ─── Trade Outcome ───

export type ForexTradeOutcome = 'win' | 'loss' | 'avoided';

// ─── Core Performance Metrics ───

export interface ForexPerformanceMetrics {
  totalTrades: number;
  winRate: number;
  netPnlPercent: number;
  riskRewardRatio: number;
  avgTradeDuration: number; // minutes
  avgDrawdown: number;
  profitFactor: number;
  sharpeScore: number;
}

// ─── Trade Quality Metrics ───

export interface ForexQualityMetrics {
  tradeEfficiency: number; // 0-100
  entryTimingAccuracy: number; // 0-100
  exitEfficiency: number; // 0-100
  spreadSensitivity: number; // 0-100
  volatilityRegimePerformance: Record<ForexRegime, number>;
}

// ─── Risk Governance Metrics ───

export interface ForexRiskGovernance {
  maxDrawdown: number;
  dailyLossRate: number;
  positionSizeCompliance: number; // 0-100
  exposureConcentration: number; // 0-100
  tradeFrequencyStability: number; // 0-100
}

// ─── Cross-Asset Influence ───

export interface CrossAssetInfluence {
  cryptoSentiment: number; // -100 to 100
  equityRiskSentiment: number;
  commodityCorrelation: number;
}

// ─── Forex Trade Entry (extends ledger) ───

export interface ForexTradeEntry {
  id: string;
  currencyPair: string;
  pairName: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice?: number;
  pnlPercent: number;
  tradeDuration: number; // minutes
  primaryAgent: AgentId;
  primaryAgentName: string;
  primaryAgentIcon: string;
  governanceStatus: 'approved' | 'throttled' | 'restricted';
  confidenceScore: number;
  riskScore: number;
  timestamp: number;
  outcome: ForexTradeOutcome;
  executionMode: ExecutionMode;
  regime: ForexRegime;
  oandaCompatible: boolean;
  riskCompliant: boolean;
  spreadCondition: 'tight' | 'normal' | 'wide';
  supportingAgents: { id: AgentId; name: string; icon: string; weight: number }[];
  drawdown: number;
  marketRegime: string;
  // ─── MFE/MAE + Give-Back Fields ───
  mfe: number;           // Max Favorable Excursion (% from entry)
  mae: number;           // Max Adverse Excursion (% from entry, always positive)
  giveBackPct: number;   // % of peak unrealized profit given back (0-100)
  captureRatio: number;  // Realized / MFE (0-1)
  netExpectancy: number; // Expected value after friction costs
  frictionCost: number;  // Spread + slippage cost estimate (%)
}

// ─── Direction Engine ───

export type DirectionEngineType = 'quantlabs' | 'fallback' | 'random' | 'manual' | 'auto-governance';

export const DIRECTION_ENGINE_LABELS: Record<DirectionEngineType, string> = {
  'quantlabs': 'QuantLabs',
  'fallback': 'Fallback',
  'random': 'Random',
  'manual': 'Manual',
  'auto-governance': 'Auto-Governance',
};

// ─── Era Segmentation ───

export type EraFilter = 'all' | 'pre-direction' | 'post-direction';

export const ERA_LABELS: Record<EraFilter, string> = {
  all: 'All Eras',
  'pre-direction': 'Pre-Direction',
  'post-direction': 'Post-Direction',
};

// QuantLabs direction system enabled date
export const QUANTLABS_DIRECTION_ENABLED_AT = new Date('2025-01-15T00:00:00Z');

// ─── Environment Filter ───

export type EnvironmentFilter = 'all' | 'live' | 'backtest' | 'shadow';

export const ENVIRONMENT_LABELS: Record<EnvironmentFilter, string> = {
  all: 'All',
  live: 'Live',
  backtest: 'Backtest',
  shadow: 'Shadow',
};

// ─── Forex Dashboard State ───

export interface ForexDashboardFilters {
  period: ForexTimePeriod;
  outcome: 'all' | ForexTradeOutcome;
  regime: 'all' | ForexRegime;
  pair: 'all' | string;
  agent: 'all' | AgentId;
  era: EraFilter;
  environment: EnvironmentFilter;
  directionEngine: 'all' | DirectionEngineType;
  direction: 'all' | 'long' | 'short';
}
