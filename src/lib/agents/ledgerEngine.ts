// Multi-Agent Trade Intelligence Ledger Engine
// Generates full ledger entries with multi-agent contributions, governance, and lifecycle

import { AgentId, AIAgent, AgentDecision } from './types';
import { ALL_AGENT_IDS, AGENT_DEFINITIONS } from './agentConfig';
import {
  LedgerTradeEntry,
  LedgerAgentContribution,
  LedgerTradeStatus,
  LedgerTradeDirection,
  LifecycleEvent,
  LifecyclePhase,
  MetaControllerGovernance,
  TradeQualityScores,
  GovernanceAlert,
  GovernanceAlertType,
  AgentTradeRole,
  StrategicClassification,
  AgentLedgerSummary,
  LedgerFilters,
} from './ledgerTypes';

// ─── Seeded RNG ───

class LedgerRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(probability = 0.5): boolean { return this.next() < probability; }
  int(min: number, max: number): number { return Math.floor(this.range(min, max)); }
}

function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ─── Personality Titles ───

const PERSONALITY_TITLES: Record<AgentId, string> = {
  'equities-alpha': 'Institutional Trend & Momentum Intelligence',
  'forex-macro': 'Global Capital Flow & Regime Tracker',
  'crypto-momentum': 'Digital Asset Momentum Acceleration Engine',
  'liquidity-radar': 'Order Flow Gravity & Liquidity Migration Tracker',
  'range-navigator': 'Market Equilibrium & Oscillation Intelligence',
  'volatility-architect': 'Risk Expansion & Compression Cycle Forecaster',
  'adaptive-learner': 'Experimental Evolution & Edge Discovery Engine',
  'sentiment-reactor': 'Behavioral Crowd Psychology Interpreter',
  'fractal-intelligence': 'Multi-Timeframe Pattern Symmetry Analyzer',
  'risk-sentinel': 'Portfolio Survival & Capital Preservation Guardian',
};

// ─── Role Assignment Weights ───

const ROLE_AFFINITY: Record<AgentId, AgentTradeRole[]> = {
  'equities-alpha': ['primary-initiator', 'signal-validator'],
  'forex-macro': ['primary-initiator', 'environment-context'],
  'crypto-momentum': ['primary-initiator', 'trade-timing'],
  'liquidity-radar': ['trade-timing', 'signal-validator'],
  'range-navigator': ['environment-context', 'risk-advisor'],
  'volatility-architect': ['risk-advisor', 'environment-context'],
  'adaptive-learner': ['signal-validator', 'trade-timing'],
  'sentiment-reactor': ['environment-context', 'signal-validator'],
  'fractal-intelligence': ['signal-validator', 'trade-timing'],
  'risk-sentinel': ['risk-advisor', 'environment-context'],
};

// ─── Trade Reasoning Templates ───

const REASONING_TEMPLATES: Record<AgentTradeRole, string[]> = {
  'primary-initiator': [
    'Detected strong directional signal with structural confirmation across primary timeframes.',
    'Identified high-probability setup with ATR-normalized entry conditions met.',
    'Initiated position based on volatility compression breakout with momentum alignment.',
  ],
  'signal-validator': [
    'Cross-validated directional bias with independent pattern recognition — confirmation achieved.',
    'Multi-timeframe structural alignment confirmed. Signal quality above validation threshold.',
    'Validated initiator signal through fractal symmetry and trend efficiency correlation.',
  ],
  'risk-advisor': [
    'Portfolio risk allocation within acceptable bounds. Correlation exposure balanced.',
    'Drawdown proximity acceptable. Risk-per-trade allocation optimized for current volatility regime.',
    'Capital preservation metrics stable. Trade approved with standard risk parameters.',
  ],
  'environment-context': [
    'Market regime classification supports directional hypothesis. Macro conditions favorable.',
    'Crowd positioning data indicates sufficient room for directional movement.',
    'Liquidity environment analysis confirms adequate depth for position sizing.',
  ],
  'trade-timing': [
    'Entry timing optimized based on volatility compression cycle positioning.',
    'Optimal execution window identified through order flow analysis and session timing.',
    'Timing aligned with liquidity migration patterns and institutional absorption zones.',
  ],
};

// ─── Governance Reasoning Templates ───

const APPROVAL_REASONS = [
  'Multi-agent consensus exceeds approval threshold. Portfolio risk metrics within acceptable parameters. Capital allocation aligns with exploitation strategy.',
  'Strong directional consensus with Risk Sentinel clearance. Trade fits within regime-adaptive framework and expected volatility environment.',
  'High-confidence signal confirmed by majority of agents. Risk alignment score healthy. Evolutionary learning considerations positive.',
];

const THROTTLE_REASONS = [
  'Agent consensus below threshold. Reducing position size until signal confirmation strengthens. Risk parameters borderline.',
  'Volatility regime elevated beyond optimal levels. Throttling trade size while maintaining directional exposure.',
  'Correlation risk detected across multiple positions. Reducing allocation to prevent clustered loss exposure.',
];

const RISK_CONTAINMENT = [
  'Drawdown buffer at 65% capacity. Correlation exposure across agents balanced. No concentration risk flags active.',
  'Portfolio volatility within tolerance bands. Risk anchors stable. Emergency reversion probability low.',
  'Maximum drawdown proximity acceptable. Risk-per-trade within adaptive bounds. Correlation safety margins healthy.',
];

const LIFECYCLE_EXPECTATIONS = [
  'Expected trade duration 2-8 hours based on volatility regime. Target R:R achievable within current market structure.',
  'Trade expected to reach initial target within session. Exit signals monitored by all participating agents.',
  'Position lifecycle projected at medium duration. Adaptive exit triggers configured based on regime sensitivity.',
];

const EVOLUTION_CONSIDERATIONS = [
  'This trade pattern has shown improving win rates over 30-day memory window. Contributing to exploitation confidence.',
  'Signal combination represents stable edge within current market regime. No edge decay detected in recent cycles.',
  'Performance memory validates this setup type across multiple horizons. Fitness score trending positively.',
];

// ─── Main Generation Functions ───

const generateContributions = (
  initiatorId: AgentId,
  agents: Record<AgentId, AIAgent>,
  decision: AgentDecision,
  rng: LedgerRNG
): LedgerAgentContribution[] => {
  // Select 4-6 participating agents (always include initiator)
  const participantCount = rng.int(4, 7);
  const otherIds = ALL_AGENT_IDS.filter(id => id !== initiatorId);
  const shuffled = otherIds.sort(() => rng.next() - 0.5);
  const participantIds = [initiatorId, ...shuffled.slice(0, participantCount - 1)];

  const contributions: LedgerAgentContribution[] = participantIds.map(id => {
    const def = AGENT_DEFINITIONS[id];
    const isInitiator = id === initiatorId;
    const role: AgentTradeRole = isInitiator
      ? 'primary-initiator'
      : rng.pick(ROLE_AFFINITY[id]);

    const confidenceContribution = isInitiator
      ? rng.range(60, 85)
      : rng.range(25, 70);

    const agreementBase = decision.bias === 'bullish' ? 0.65 : 0.55;
    const signalAgreement = rng.range(agreementBase * 80, 95);

    return {
      agentId: id,
      agentName: def.name,
      personalityTitle: PERSONALITY_TITLES[id],
      model: def.model,
      icon: def.icon,
      role,
      confidenceContribution,
      signalAgreementScore: signalAgreement,
      tradeReasonSummary: rng.pick(REASONING_TEMPLATES[role]),
      influenceWeight: 0, // normalized later
      conflictsDetected: !isInitiator && rng.bool(0.15),
    };
  });

  // Normalize influence weights
  const totalConf = contributions.reduce((s, c) => s + c.confidenceContribution, 0);
  contributions.forEach(c => { c.influenceWeight = c.confidenceContribution / totalConf; });

  return contributions.sort((a, b) => b.influenceWeight - a.influenceWeight);
};

const generateGovernance = (
  initiatorId: AgentId,
  contributions: LedgerAgentContribution[],
  rng: LedgerRNG
): MetaControllerGovernance => {
  const consensusHigh = contributions.every(c => c.signalAgreementScore > 60);
  const status = consensusHigh
    ? (rng.bool(0.85) ? 'approved' : 'throttled')
    : (rng.bool(0.4) ? 'approved' : rng.bool(0.7) ? 'throttled' : 'restricted');

  const trustedAgents = contributions
    .filter(c => c.signalAgreementScore > 70)
    .map(c => c.agentId);

  const classifications: StrategicClassification[] = ['opportunistic', 'defensive', 'experimental', 'regime-adaptive'];

  return {
    tradeApprovalStatus: status as 'approved' | 'throttled' | 'restricted',
    portfolioRiskAlignmentScore: rng.range(55, 92),
    capitalAllocationDecision: status === 'approved'
      ? `Full allocation — ${rng.range(2, 5).toFixed(1)}% portfolio exposure authorized.`
      : `Reduced allocation — ${rng.range(0.5, 2).toFixed(1)}% exposure cap applied.`,
    conflictResolutionOutcome: contributions.some(c => c.conflictsDetected)
      ? `Agent conflict detected between ${rng.pick(contributions.filter(c => c.conflictsDetected)).agentName} and consensus. Resolved via majority weighted vote.`
      : 'No conflicts detected. Unanimous agent alignment.',
    modelWeightAdjustments: contributions.slice(0, 3).map(c => ({
      agentId: c.agentId,
      adjustment: rng.range(-0.05, 0.1),
      reason: c.role === 'primary-initiator'
        ? 'Initiator weight maintained at elevated level'
        : `${c.role === 'risk-advisor' ? 'Risk advisory' : 'Validation'} contribution recognized`,
    })),
    tradeAuthorizationConfidence: rng.range(58, 92),
    strategicClassification: rng.pick(classifications),
    thoughtTransparency: {
      approvalReasoning: status === 'approved' ? rng.pick(APPROVAL_REASONS) : rng.pick(THROTTLE_REASONS),
      trustedAgents,
      riskContainmentEvaluation: rng.pick(RISK_CONTAINMENT),
      expectedLifecycleBehavior: rng.pick(LIFECYCLE_EXPECTATIONS),
      evolutionaryConsiderations: rng.pick(EVOLUTION_CONSIDERATIONS),
    },
  };
};

const generateLifecycle = (
  decision: AgentDecision,
  contributions: LedgerAgentContribution[],
  isAvoided: boolean,
  rng: LedgerRNG
): LifecycleEvent[] => {
  const baseTs = decision.timestamp;
  const phases: LifecyclePhase[] = [
    'signal-detection',
    'multi-agent-confirmation',
    'meta-controller-approval',
    'trade-execution',
    'live-monitoring',
    'exit-decision',
    'post-trade-evaluation',
  ];

  const initiator = contributions.find(c => c.role === 'primary-initiator');
  const validators = contributions.filter(c => c.role === 'signal-validator');
  const riskAdvisors = contributions.filter(c => c.role === 'risk-advisor');

  const descriptions: Record<LifecyclePhase, string> = {
    'signal-detection': `${initiator?.agentName || 'Alpha Engine'} detected ${decision.bias} signal on ${decision.ticker} with ${decision.confidence.toFixed(0)}% initial confidence.`,
    'multi-agent-confirmation': `${validators.length + 1} agents confirmed directional bias. Consensus strength: ${(contributions.reduce((s, c) => s + c.signalAgreementScore, 0) / contributions.length).toFixed(0)}%.`,
    'meta-controller-approval': `Meta-Controller evaluated risk alignment and authorized trade with strategic classification.`,
    'trade-execution': `Position executed at optimal entry timing. Risk allocation applied per governance parameters.`,
    'live-monitoring': `All participating agents monitoring position. ${riskAdvisors.length > 0 ? riskAdvisors[0].agentName + ' tracking risk metrics.' : 'Risk metrics stable.'}`,
    'exit-decision': `Exit signal generated based on target achievement and regime transition analysis.`,
    'post-trade-evaluation': `Trade evaluated across all agent perspectives. Performance data integrated into evolution memory.`,
  };

  if (isAvoided) {
    return [
      { phase: 'signal-detection', timestamp: baseTs, contributingAgents: [initiator?.agentId || 'equities-alpha'], description: descriptions['signal-detection'], status: 'completed' },
      { phase: 'multi-agent-confirmation', timestamp: baseTs + 120000, contributingAgents: contributions.map(c => c.agentId), description: 'Multi-agent review flagged excessive risk conditions.', status: 'completed' },
      { phase: 'meta-controller-approval', timestamp: baseTs + 180000, contributingAgents: [], description: 'Meta-Controller rejected trade due to risk threshold breach.', status: 'completed' },
    ];
  }

  const offsets = [0, 120000, 300000, 420000, 900000, rng.int(1800000, 7200000), rng.int(7200000, 14400000)];
  const completedIndex = rng.int(3, 7);

  return phases.map((phase, i) => ({
    phase,
    timestamp: baseTs + offsets[i],
    contributingAgents: i === 0
      ? [initiator?.agentId || 'equities-alpha']
      : i === 1
        ? contributions.map(c => c.agentId)
        : i === 2
          ? []
          : contributions.slice(0, rng.int(2, 4)).map(c => c.agentId),
    description: descriptions[phase],
    status: i < completedIndex ? 'completed' : i === completedIndex ? 'active' : 'pending',
  }));
};

const generateQuality = (rng: LedgerRNG): TradeQualityScores => {
  const entry = rng.range(45, 92);
  const exit = rng.range(40, 90);
  const rr = rng.range(35, 88);
  const persistence = rng.range(50, 85);
  const regime = rng.range(55, 90);
  return {
    entryTimingEfficiency: entry,
    exitPrecision: exit,
    riskRewardAchievement: rr,
    signalPersistenceAccuracy: persistence,
    regimeAlignmentQuality: regime,
    overallQuality: (entry + exit + rr + persistence + regime) / 5,
  };
};

const generateAlerts = (contributions: LedgerAgentContribution[], rng: LedgerRNG): GovernanceAlert[] => {
  if (rng.bool(0.6)) return []; // Most trades have no alerts

  const types: GovernanceAlertType[] = ['risk-throttling', 'trade-cancellation', 'capital-reallocation', 'confidence-reduction', 'emergency-anchor'];
  const count = rng.int(1, 3);

  return Array.from({ length: count }, (_, i) => {
    const type = rng.pick(types);
    const agent = rng.pick(contributions);
    return {
      id: `alert-${i}-${rng.int(1000, 9999)}`,
      type,
      timestamp: Date.now() - rng.int(60000, 3600000),
      agentId: agent.agentId,
      description: `${agent.agentName}: ${
        type === 'risk-throttling' ? 'Risk exposure approaching threshold — position sizing reduced by 30%.'
        : type === 'trade-cancellation' ? 'Trade cancelled due to adverse regime transition detected mid-execution.'
        : type === 'capital-reallocation' ? 'Capital reallocated from exploration to exploitation after volatility spike.'
        : type === 'confidence-reduction' ? 'Model confidence reduced by 15% after signal degradation detected.'
        : 'Emergency risk anchor activated — maximum drawdown proximity triggered capital freeze.'
      }`,
      severity: type === 'emergency-anchor' || type === 'trade-cancellation' ? 'critical' : type === 'risk-throttling' || type === 'confidence-reduction' ? 'warning' : 'info',
      resolved: rng.bool(0.7),
    };
  });
};

// ─── Main Export: Generate Ledger Entries ───

export const generateLedgerEntries = (
  agents: Record<AgentId, AIAgent>
): LedgerTradeEntry[] => {
  const entries: LedgerTradeEntry[] = [];

  for (const agentId of ALL_AGENT_IDS) {
    const agent = agents[agentId];
    const decisions = agent.recentDecisions.slice(0, 8); // Top 8 per agent

    for (const decision of decisions) {
      const rng = new LedgerRNG(hashSeed(decision.ticker + decision.timestamp + agentId));

      const isAvoided = decision.strategy === 'avoiding';
      const isWatching = decision.strategy === 'watching';

      const direction: LedgerTradeDirection = isAvoided ? 'avoided' : decision.bias === 'bullish' ? 'long' : 'short';

      const tradeStatus: LedgerTradeStatus = isAvoided
        ? 'avoided'
        : isWatching
          ? 'watching'
          : rng.pick(['open', 'managing', 'closed'] as LedgerTradeStatus[]);

      const entryPrice = rng.range(50, 500);
      const pnlPct = isAvoided ? 0 : rng.range(-0.06, 0.09);
      const currentPrice = entryPrice * (1 + pnlPct);

      const contributions = generateContributions(agentId, agents, decision, rng);
      const governance = generateGovernance(agentId, contributions, rng);
      const lifecycle = generateLifecycle(decision, contributions, isAvoided, rng);
      const quality = generateQuality(rng);
      const alerts = generateAlerts(contributions, rng);

      const consensusScore = contributions.reduce((s, c) => s + c.signalAgreementScore, 0) / contributions.length;

      entries.push({
        id: `${agentId}-${decision.ticker}-${decision.timestamp}`,
        decision,
        initiatorAgentId: agentId,
        ticker: decision.ticker,
        direction,
        tradeStatus,
        entryPrice,
        currentPrice,
        pnlPercent: pnlPct * 100,
        pnlDollar: pnlPct * 10000 * rng.range(0.5, 2),
        tradeDuration: rng.int(15, 2880),
        riskAllocation: rng.range(1, 5),
        contributions,
        consensusScore,
        conflictDetected: contributions.some(c => c.conflictsDetected),
        governance,
        lifecycle,
        quality,
        alerts,
        volatilityRegime: rng.pick(['low', 'moderate', 'high', 'extreme'] as const),
        marketRegime: rng.pick(['trending', 'ranging', 'volatile', 'quiet'] as const),
      });
    }
  }

  return entries.sort((a, b) => b.decision.timestamp - a.decision.timestamp);
};

// ─── Filter Ledger Entries ───

export const filterLedgerEntries = (
  entries: LedgerTradeEntry[],
  filters: LedgerFilters
): LedgerTradeEntry[] => {
  return entries.filter(entry => {
    if (filters.agent !== 'all' && entry.initiatorAgentId !== filters.agent) return false;
    if (filters.tradeStatus !== 'all' && entry.tradeStatus !== filters.tradeStatus) return false;
    if (filters.direction !== 'all' && entry.direction !== filters.direction) return false;
    if (filters.regime !== 'all' && entry.marketRegime !== filters.regime) return false;
    if (filters.approvalLevel !== 'all' && entry.governance.tradeApprovalStatus !== filters.approvalLevel) return false;
    if (filters.outcome === 'winning' && entry.pnlPercent <= 0) return false;
    if (filters.outcome === 'losing' && entry.pnlPercent > 0) return false;
    if (filters.classification !== 'all' && entry.governance.strategicClassification !== filters.classification) return false;
    if (filters.consensusStrength !== 'all') {
      const cs = entry.consensusScore;
      if (filters.consensusStrength === 'high' && cs < 75) return false;
      if (filters.consensusStrength === 'medium' && (cs < 50 || cs >= 75)) return false;
      if (filters.consensusStrength === 'low' && cs >= 50) return false;
    }
    return true;
  });
};

// ─── Per-Agent Ledger Summary ───

export const generateAgentLedgerSummary = (
  agentId: AgentId,
  entries: LedgerTradeEntry[]
): AgentLedgerSummary => {
  const def = AGENT_DEFINITIONS[agentId];
  const initiated = entries.filter(e => e.initiatorAgentId === agentId);
  const validated = entries.filter(e =>
    e.contributions.some(c => c.agentId === agentId && c.role === 'signal-validator')
  );

  const winningTrades = initiated.filter(e => e.pnlPercent > 0);
  const totalPnl = initiated.reduce((s, e) => s + e.pnlDollar, 0);
  const avgReturn = initiated.length > 0 ? initiated.reduce((s, e) => s + e.pnlPercent, 0) / initiated.length : 0;
  const maxDd = Math.max(...initiated.map(e => Math.abs(Math.min(0, e.pnlPercent))), 0);

  const regimes = ['trending', 'ranging', 'volatile', 'quiet'];
  const regimePerf: Record<string, number> = {};
  for (const r of regimes) {
    const regimeTrades = initiated.filter(e => e.marketRegime === r);
    regimePerf[r] = regimeTrades.length > 0
      ? regimeTrades.filter(e => e.pnlPercent > 0).length / regimeTrades.length
      : 0;
  }

  const avgTiming = initiated.length > 0
    ? initiated.reduce((s, e) => s + e.quality.entryTimingEfficiency, 0) / initiated.length
    : 0;

  return {
    agentId,
    agentName: def.name,
    icon: def.icon,
    model: def.model,
    tradesInitiated: initiated.length,
    tradesValidated: validated.length,
    winRate: initiated.length > 0 ? winningTrades.length / initiated.length : 0,
    avgReturn,
    maxDrawdown: maxDd,
    regimePerformance: regimePerf,
    timingScore: avgTiming,
    totalPnl,
  };
};
