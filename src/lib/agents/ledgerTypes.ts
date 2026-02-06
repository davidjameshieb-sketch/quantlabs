// Multi-Agent Trade Intelligence Ledger Types
// Extended type system for collaborative AI trade events

import { AgentId, AgentDecision } from './types';
import { EfficiencyVerdict } from '@/lib/market/types';

// ─── Agent Roles in Trade Decisions ───

export type AgentTradeRole =
  | 'primary-initiator'
  | 'signal-validator'
  | 'risk-advisor'
  | 'environment-context'
  | 'trade-timing';

export const AGENT_ROLE_LABELS: Record<AgentTradeRole, string> = {
  'primary-initiator': 'Primary Initiator',
  'signal-validator': 'Signal Validator',
  'risk-advisor': 'Risk Advisor',
  'environment-context': 'Environment Context Provider',
  'trade-timing': 'Trade Timing Specialist',
};

export const AGENT_ROLE_COLORS: Record<AgentTradeRole, string> = {
  'primary-initiator': 'bg-primary/20 text-primary border-primary/30',
  'signal-validator': 'bg-neural-green/20 text-neural-green border-neural-green/30',
  'risk-advisor': 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  'environment-context': 'bg-cyan-400/20 text-cyan-400 border-cyan-400/30',
  'trade-timing': 'bg-violet-400/20 text-violet-400 border-violet-400/30',
};

// ─── Enhanced Agent Contribution ───

export interface LedgerAgentContribution {
  agentId: AgentId;
  agentName: string;
  personalityTitle: string; // e.g. "Order Flow Gravity & Liquidity Migration Tracker"
  model: string;
  icon: string;
  role: AgentTradeRole;
  confidenceContribution: number; // 0-100
  signalAgreementScore: number; // 0-100
  tradeReasonSummary: string;
  influenceWeight: number; // 0-1, normalized weight
  conflictsDetected: boolean;
}

// ─── Trade Lifecycle Phases ───

export type LifecyclePhase =
  | 'signal-detection'
  | 'multi-agent-confirmation'
  | 'meta-controller-approval'
  | 'trade-execution'
  | 'live-monitoring'
  | 'exit-decision'
  | 'post-trade-evaluation';

export const LIFECYCLE_PHASE_LABELS: Record<LifecyclePhase, string> = {
  'signal-detection': 'Signal Detection',
  'multi-agent-confirmation': 'Multi-Agent Confirmation',
  'meta-controller-approval': 'Meta-Controller Approval',
  'trade-execution': 'Trade Execution',
  'live-monitoring': 'Live Monitoring',
  'exit-decision': 'Exit Decision',
  'post-trade-evaluation': 'Post-Trade Evaluation',
};

export interface LifecycleEvent {
  phase: LifecyclePhase;
  timestamp: number;
  contributingAgents: AgentId[];
  description: string;
  status: 'completed' | 'active' | 'pending' | 'skipped';
}

// ─── Meta-Controller Governance ───

export type StrategicClassification = 'opportunistic' | 'defensive' | 'experimental' | 'regime-adaptive';

export const CLASSIFICATION_LABELS: Record<StrategicClassification, string> = {
  opportunistic: 'Opportunistic',
  defensive: 'Defensive',
  experimental: 'Experimental',
  'regime-adaptive': 'Regime Adaptive',
};

export const CLASSIFICATION_COLORS: Record<StrategicClassification, string> = {
  opportunistic: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  defensive: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  experimental: 'bg-violet-400/20 text-violet-400 border-violet-400/30',
  'regime-adaptive': 'bg-primary/20 text-primary border-primary/30',
};

export interface MetaControllerGovernance {
  tradeApprovalStatus: 'approved' | 'throttled' | 'restricted' | 'override';
  portfolioRiskAlignmentScore: number; // 0-100
  capitalAllocationDecision: string;
  conflictResolutionOutcome: string;
  modelWeightAdjustments: Array<{ agentId: AgentId; adjustment: number; reason: string }>;
  tradeAuthorizationConfidence: number; // 0-100
  strategicClassification: StrategicClassification;
  thoughtTransparency: {
    approvalReasoning: string;
    trustedAgents: AgentId[];
    riskContainmentEvaluation: string;
    expectedLifecycleBehavior: string;
    evolutionaryConsiderations: string;
  };
}

// ─── Trade Quality Analytics ───

export interface TradeQualityScores {
  entryTimingEfficiency: number; // 0-100
  exitPrecision: number; // 0-100
  riskRewardAchievement: number; // 0-100
  signalPersistenceAccuracy: number; // 0-100
  regimeAlignmentQuality: number; // 0-100
  overallQuality: number; // 0-100
}

// ─── Governance Alerts ───

export type GovernanceAlertType =
  | 'risk-throttling'
  | 'trade-cancellation'
  | 'capital-reallocation'
  | 'confidence-reduction'
  | 'emergency-anchor';

export const ALERT_LABELS: Record<GovernanceAlertType, string> = {
  'risk-throttling': 'Model Risk Throttling',
  'trade-cancellation': 'Trade Cancellation Override',
  'capital-reallocation': 'Capital Reallocation Event',
  'confidence-reduction': 'Model Confidence Reduction',
  'emergency-anchor': 'Emergency Risk Anchor Activation',
};

export const ALERT_SEVERITY: Record<GovernanceAlertType, 'info' | 'warning' | 'critical'> = {
  'risk-throttling': 'warning',
  'trade-cancellation': 'critical',
  'capital-reallocation': 'info',
  'confidence-reduction': 'warning',
  'emergency-anchor': 'critical',
};

export interface GovernanceAlert {
  id: string;
  type: GovernanceAlertType;
  timestamp: number;
  agentId: AgentId;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  resolved: boolean;
}

// ─── Trade Book Ledger Entry ───

export type LedgerTradeStatus = 'watching' | 'open' | 'managing' | 'closed' | 'avoided';

export const LEDGER_STATUS_LABELS: Record<LedgerTradeStatus, string> = {
  watching: 'WATCHING',
  open: 'OPEN',
  managing: 'MANAGING',
  closed: 'CLOSED',
  avoided: 'AVOIDED',
};

export const LEDGER_STATUS_COLORS: Record<LedgerTradeStatus, string> = {
  watching: 'bg-muted/30 text-muted-foreground border-border/50',
  open: 'bg-primary/20 text-primary border-primary/30',
  managing: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  closed: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  avoided: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

export type LedgerTradeDirection = 'long' | 'short' | 'avoided';

export interface LedgerTradeEntry {
  id: string;
  decision: AgentDecision;
  initiatorAgentId: AgentId;

  // Core display
  ticker: string;
  direction: LedgerTradeDirection;
  tradeStatus: LedgerTradeStatus;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  pnlDollar: number;
  tradeDuration: number; // minutes
  riskAllocation: number; // percent of capital

  // Multi-agent contributions
  contributions: LedgerAgentContribution[];
  consensusScore: number; // 0-100
  conflictDetected: boolean;

  // Meta-Controller governance
  governance: MetaControllerGovernance;

  // Trade lifecycle
  lifecycle: LifecycleEvent[];

  // Quality analytics
  quality: TradeQualityScores;

  // Governance alerts for this trade
  alerts: GovernanceAlert[];

  // Volatility & regime
  volatilityRegime: 'low' | 'moderate' | 'high' | 'extreme';
  marketRegime: 'trending' | 'ranging' | 'volatile' | 'quiet';
}

// ─── Ledger Filter Extensions ───

export interface LedgerFilters {
  agent: 'all' | AgentId;
  tradeStatus: 'all' | LedgerTradeStatus;
  direction: 'all' | LedgerTradeDirection;
  regime: 'all' | 'trending' | 'ranging' | 'volatile' | 'quiet';
  approvalLevel: 'all' | 'approved' | 'throttled' | 'restricted';
  consensusStrength: 'all' | 'high' | 'medium' | 'low';
  classification: 'all' | StrategicClassification;
  outcome: 'all' | 'winning' | 'losing';
}

// ─── Per-Agent Ledger View ───

export interface AgentLedgerSummary {
  agentId: AgentId;
  agentName: string;
  icon: string;
  model: string;
  tradesInitiated: number;
  tradesValidated: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  regimePerformance: Record<string, number>;
  timingScore: number; // 0-100
  totalPnl: number;
}
