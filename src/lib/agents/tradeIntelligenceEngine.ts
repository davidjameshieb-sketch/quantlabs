// Trade intelligence data generation engine
// Produces expanded trade details, scorecards, and filtered histories

import { AIAgent, AgentId, AgentDecision } from './types';
import {
  ExpandedTradeDetail,
  TradeStatus,
  SignalLifecycle,
  TradeRiskIntelligence,
  TradeTransparency,
  TradeTimeline,
  AgentContribution,
  AgentScorecard,
  TradeFilters,
} from './tradeTypes';

class TradeRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

const VOLATILITY_REGIMES = ['low', 'moderate', 'high', 'extreme'] as const;
const RISK_FILTERS = [
  'ATR Expansion Threshold',
  'Correlation Spike Filter',
  'Liquidity Drought Alert',
  'Regime Transition Warning',
  'Drawdown Limit Proximity',
  'Volatility Skew Alert',
];

export const generateExpandedDetail = (
  decision: AgentDecision,
  agents: Record<AgentId, AIAgent>,
  ownerAgentId: AgentId
): ExpandedTradeDetail => {
  const rng = new TradeRNG(hashString(decision.ticker + decision.timestamp));

  const isAvoided = decision.strategy === 'avoiding';
  const isWatching = decision.strategy === 'watching';
  const status: TradeStatus = isAvoided ? 'avoided' : isWatching ? 'monitoring' : rng.next() > 0.4 ? 'closed' : 'open';

  const entryPrice = 100 + rng.range(-50, 150);
  const pnlPct = isAvoided ? 0 : rng.range(-0.08, 0.12);
  const exitPrice = status === 'closed' ? entryPrice * (1 + pnlPct) : undefined;
  const timeInTrade = Math.floor(rng.range(15, 2880));

  const lifecycle: SignalLifecycle = isAvoided ? 'avoided'
    : status === 'closed' ? 'post-eval'
    : status === 'monitoring' ? 'monitoring'
    : rng.next() > 0.5 ? 'holding' : 'monitoring';

  // Risk intelligence
  const triggeredFilters = RISK_FILTERS.filter(() => rng.next() > 0.7);
  const risk: TradeRiskIntelligence = {
    maxDrawdownPct: rng.range(0.5, 6),
    volatilityRegime: rng.pick([...VOLATILITY_REGIMES]),
    efficiencyDuringTrade: decision.efficiency,
    riskFiltersTriggered: triggeredFilters,
    avoidanceReason: isAvoided
      ? `Market conditions triggered ${triggeredFilters[0] || 'risk threshold'} — efficiency score dropped below actionable level.`
      : undefined,
  };

  // AI Transparency
  const ownerAgent = agents[ownerAgentId];
  const agentList = Object.values(agents);
  const contributions: AgentContribution[] = agentList.map(a => ({
    agentId: a.id,
    agentName: a.name,
    confidenceWeight: a.id === ownerAgentId ? 40 + rng.range(0, 25) : rng.range(10, 30),
    model: a.model,
    icon: a.icon,
  }));
  // Normalize weights
  const totalWeight = contributions.reduce((s, c) => s + c.confidenceWeight, 0);
  contributions.forEach(c => c.confidenceWeight = (c.confidenceWeight / totalWeight) * 100);

  const agreementCount = agentList.filter(a => {
    const latest = a.recentDecisions[0];
    return latest && latest.bias === decision.bias;
  }).length;

  const transparency: TradeTransparency = {
    agents: contributions,
    multiAgentAgreement: (agreementCount / agentList.length) * 100,
    marketRegime: rng.pick(['trending', 'ranging', 'volatile', 'quiet']),
    reasoningSummary: decision.reasoning,
  };

  // Timeline
  const baseTs = decision.timestamp;
  const timeline: TradeTimeline[] = [
    { stage: 'entry', timestamp: baseTs, label: 'Signal Detected', description: `${decision.bias.toUpperCase()} bias identified on ${decision.ticker} with ${decision.confidence.toFixed(0)}% confidence.` },
  ];

  if (!isAvoided) {
    timeline.push(
      { stage: 'monitoring', timestamp: baseTs + 300000, label: 'Monitoring Phase', description: 'AI agents cross-validating signal across timeframes and market conditions.' },
      { stage: 'holding', timestamp: baseTs + 900000, label: 'Position Active', description: `Trade entered with R:R of ${decision.riskReward.toFixed(1)}. Strategy blocks: ${decision.strategyBlocks.join(', ')}.` },
    );
    if (status === 'closed') {
      timeline.push(
        { stage: 'exit', timestamp: baseTs + timeInTrade * 60000, label: 'Exit Signal', description: `Position closed. ${pnlPct >= 0 ? 'Target reached' : 'Stop triggered'} at ${(pnlPct * 100).toFixed(2)}% P&L.` },
        { stage: 'post-eval', timestamp: baseTs + timeInTrade * 60000 + 60000, label: 'Post-Trade Evaluation', description: `AI reviewed trade quality. Efficiency: ${decision.efficiency}. Risk management: ${triggeredFilters.length === 0 ? 'Clean execution' : triggeredFilters.length + ' filters noted'}.` },
      );
    }
  } else {
    timeline.push(
      { stage: 'avoided', timestamp: baseTs + 60000, label: 'Trade Avoided', description: risk.avoidanceReason || 'Risk conditions exceeded threshold.' },
    );
  }

  return {
    decision,
    status,
    entryPrice,
    exitPrice,
    currentPnlPct: status === 'closed' ? pnlPct : rng.range(-0.04, 0.06),
    finalPnlPct: status === 'closed' ? pnlPct : undefined,
    riskRewardOutcome: status === 'closed' ? Math.abs(pnlPct) / (risk.maxDrawdownPct / 100) : decision.riskReward,
    timeInTrade,
    lifecycle,
    risk,
    transparency,
    timeline,
  };
};

export const generateAgentScorecard = (agent: AIAgent): AgentScorecard => {
  const rng = new TradeRNG(hashString(agent.id));
  const perf = agent.performance;

  return {
    agentId: agent.id,
    agentName: agent.name,
    icon: agent.icon,
    model: agent.model,
    winRate: perf.winRate,
    avgReturn: perf.avgReturn,
    avgDrawdown: perf.maxDrawdown / perf.totalTrades,
    signalReliability: 50 + rng.range(0, 40),
    tradeFrequency: perf.totalTrades / 30,
    riskEffectiveness: 40 + rng.range(0, 50),
    marketStrengthPerformance: {
      trending: perf.winRate + rng.range(-0.1, 0.15),
      ranging: perf.winRate + rng.range(-0.15, 0.05),
      volatile: perf.winRate + rng.range(-0.2, 0.1),
      quiet: perf.winRate + rng.range(-0.05, 0.1),
    },
  };
};

export const filterDecisions = (
  decisions: AgentDecision[],
  filters: TradeFilters
): AgentDecision[] => {
  let filtered = [...decisions];

  // Period filter
  const now = Date.now();
  const periodMs: Record<string, number> = {
    '5d': 5 * 86400000,
    '30d': 30 * 86400000,
    '90d': 90 * 86400000,
    'all': Infinity,
  };
  const cutoff = now - (periodMs[filters.period] || Infinity);
  filtered = filtered.filter(d => d.timestamp >= cutoff);

  // Outcome filter
  if (filters.outcome === 'avoided') {
    filtered = filtered.filter(d => d.strategy === 'avoiding');
  } else if (filters.outcome === 'watching') {
    filtered = filtered.filter(d => d.strategy === 'watching');
  } else if (filters.outcome === 'winning') {
    filtered = filtered.filter(d => d.expectedReturn > 0);
  } else if (filters.outcome === 'losing') {
    filtered = filtered.filter(d => d.expectedReturn <= 0);
  }

  // Regime filter (approximate from efficiency)
  if (filters.regime !== 'all') {
    const regimeMap: Record<string, string[]> = {
      trending: ['clean'],
      ranging: ['mixed'],
      volatile: ['noisy'],
      quiet: ['mixed', 'clean'],
    };
    const allowedEff = regimeMap[filters.regime] || [];
    filtered = filtered.filter(d => allowedEff.includes(d.efficiency));
  }

  return filtered;
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
