// Explosive Growth (Controlled) Engine
// Implements: Edge Dominance Cluster discovery, Dynamic Capital Concentration (3 tiers),
// Coalition Reinforcement Intelligence, Session Dominance, EnvKey RL, Safety Governors.
//
// CRITICAL: Does NOT modify governance multipliers, gates, or QuantLabs logic.
// Only outputs configuration and multiplier recommendations.

// ─── Types ────────────────────────────────────────────────────────────

export type ExplosiveTier = 'ALPHA' | 'BETA' | 'GAMMA';
export type AgentClass = 'CHAMPION' | 'SPECIALIST' | 'DILUTER';
export type SafetyTriggerType = 'PF_DROP' | 'EXP_SLOPE_NEG' | 'STABILITY_DOWN' | 'DD_SPIKE' | 'FRICTION_SPIKE' | 'COALITION_DEGRADE';

export interface ExplosiveConfig {
  // Cluster thresholds
  minGovernanceScore: number;       // default 85
  minPF: number;                    // default 1.6
  minClusterTrades: number;         // default 80
  frictionPercentile: number;       // default 50 (p50)
  // Ramp limits
  maxRampPerWindow: number;         // default 0.05 per 25 trades
  maxImmediateDrop: number;         // default 0.10
  // Tier multiplier bounds
  alphaMin: number; alphaMax: number; // 1.25 - 1.75
  betaMin: number;  betaMax: number;  // 0.75 - 1.0
  // Agent class multiplier caps
  championMax: number;              // 1.4
  specialistMax: number;            // 0.85
  // Safety thresholds
  safetyMinPF: number;             // 1.2
  safetyFrictionP80: number;       // friction above p80 triggers de-escalation
  // Rank weights
  w1: number; w2: number; w3: number; w4: number; w5: number;
  // EnvKey RL thresholds
  envKeyMinTrades: number;         // 60
  envKeyMinPF: number;             // 1.4
  // Shadow validation
  shadowMinTrades: number;         // 50
}

const DEFAULT_CONFIG: ExplosiveConfig = {
  minGovernanceScore: 85,
  minPF: 1.6,
  minClusterTrades: 80,
  frictionPercentile: 50,
  maxRampPerWindow: 0.05,
  maxImmediateDrop: 0.10,
  alphaMin: 1.25, alphaMax: 1.75,
  betaMin: 0.75,  betaMax: 1.0,
  championMax: 1.4,
  specialistMax: 0.85,
  safetyMinPF: 1.2,
  safetyFrictionP80: 0,
  w1: 0.35, w2: 0.25, w3: 0.20, w4: 0.10, w5: 0.10,
  envKeyMinTrades: 60,
  envKeyMinPF: 1.4,
  shadowMinTrades: 50,
};

// ─── Trade Record (input) ─────────────────────────────────────────────

export interface ExplosiveTradeRecord {
  agent_id: string;
  direction: string;
  currency_pair: string;
  entry_price: number;
  exit_price: number;
  session_label: string;
  regime_label: string;
  spread_at_entry: number;
  slippage_pips: number;
  governance_composite: number;
  environment: string;
  created_at: string;
}

// ─── Pip Math ─────────────────────────────────────────────────────────

const EPSILON = 0.0001;

function pipFactor(pair: string): number {
  return pair.includes('JPY') ? 100 : 10000;
}

function calcPips(t: ExplosiveTradeRecord): number {
  const pf = pipFactor(t.currency_pair);
  return t.direction === 'long'
    ? (t.exit_price - t.entry_price) * pf
    : (t.entry_price - t.exit_price) * pf;
}

// ─── Profit Factor with validity guard ────────────────────────────────

export function safePF(grossProfit: number, grossLoss: number): number | null {
  const absLoss = Math.abs(grossLoss);
  if (absLoss < EPSILON) return null; // invalid
  return grossProfit / absLoss;
}

// ─── Group Metrics ────────────────────────────────────────────────────

export interface GroupMetrics {
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  pfValid: boolean;
  sharpe: number;
  maxDD: number;
  avgSpread: number;
  avgSlippage: number;
  frictionDrag: number;
  rollingStddev: number;
  ddSlope: number;
  stabilityUp: boolean;
  expectancySlope: number;
}

function computeGroupMetrics(trades: ExplosiveTradeRecord[]): GroupMetrics {
  if (trades.length === 0) {
    return {
      trades: 0, wins: 0, winRate: 0, expectancy: 0, netPips: 0,
      grossProfit: 0, grossLoss: 0, profitFactor: null, pfValid: false,
      sharpe: 0, maxDD: 0, avgSpread: 0, avgSlippage: 0, frictionDrag: 0,
      rollingStddev: 0, ddSlope: 0, stabilityUp: false, expectancySlope: 0,
    };
  }

  const pips = trades.map(calcPips);
  const wins = pips.filter(p => p > 0).length;
  const gp = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const gl = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const net = pips.reduce((a, b) => a + b, 0);
  const exp = net / trades.length;
  const pf = safePF(gp, gl);

  // Sharpe
  const variance = pips.length > 1
    ? pips.reduce((s, p) => s + (p - exp) ** 2, 0) / (pips.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (exp / std) * Math.sqrt(252) : 0;

  // Max DD + slope
  let peak = 0, maxDD = 0, cumPnl = 0;
  const ddPoints: number[] = [];
  for (const p of pips) {
    cumPnl += p;
    if (cumPnl > peak) peak = cumPnl;
    ddPoints.push(peak - cumPnl);
    if (peak - cumPnl > maxDD) maxDD = peak - cumPnl;
  }

  const ddSlope = linearSlope(ddPoints.slice(-50));

  // Rolling stddev (last 100 pips)
  const recentPips = pips.slice(-100);
  const recentMean = recentPips.reduce((a, b) => a + b, 0) / recentPips.length;
  const rollingStddev = recentPips.length > 1
    ? Math.sqrt(recentPips.reduce((s, p) => s + (p - recentMean) ** 2, 0) / (recentPips.length - 1))
    : 0;

  // Expectancy slope (last 5 buckets of 20 trades each)
  const expectancySlope = computeExpectancySlope(pips, 5);

  // Stability: stddev decreasing/flat AND ddSlope improving/flat
  const olderPips = pips.slice(0, Math.floor(pips.length / 2));
  const olderMean = olderPips.length > 0 ? olderPips.reduce((a, b) => a + b, 0) / olderPips.length : 0;
  const olderStddev = olderPips.length > 1
    ? Math.sqrt(olderPips.reduce((s, p) => s + (p - olderMean) ** 2, 0) / (olderPips.length - 1))
    : 0;
  const stabilityUp = rollingStddev <= olderStddev * 1.05 && ddSlope <= 0.01;

  const avgSpread = trades.reduce((s, t) => s + (t.spread_at_entry || 0), 0) / trades.length;
  const avgSlippage = trades.reduce((s, t) => s + Math.abs(t.slippage_pips || 0), 0) / trades.length;

  return {
    trades: trades.length,
    wins,
    winRate: wins / trades.length,
    expectancy: round2(exp),
    netPips: round1(net),
    grossProfit: round1(gp),
    grossLoss: round1(gl),
    profitFactor: pf !== null ? round2(pf) : null,
    pfValid: pf !== null,
    sharpe: round2(sharpe),
    maxDD: round1(maxDD),
    avgSpread: round5(avgSpread),
    avgSlippage: round2(avgSlippage),
    frictionDrag: round2(avgSpread * pipFactor(trades[0]?.currency_pair || 'EUR_USD') + avgSlippage),
    rollingStddev: round2(rollingStddev),
    ddSlope: round4(ddSlope),
    stabilityUp,
    expectancySlope: round4(expectancySlope),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
function round5(n: number): number { return Math.round(n * 100000) / 100000; }

function linearSlope(arr: number[]): number {
  if (arr.length < 3) return 0;
  const n = arr.length;
  const xMean = (n - 1) / 2;
  const yMean = arr.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (arr[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

function computeExpectancySlope(pips: number[], buckets: number): number {
  if (pips.length < buckets * 5) return 0;
  const bSize = Math.floor(pips.length / buckets);
  const exps: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const slice = pips.slice(i * bSize, (i + 1) * bSize);
    exps.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return linearSlope(exps);
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = fn(item);
    (map[k] ??= []).push(item);
  }
  return map;
}

// ─── Edge Dominance Cluster ───────────────────────────────────────────

export interface EdgeDominanceCluster {
  clusterKey: string;
  pair: string;
  session: string;
  envKeyBucket: string;
  coalitionId: string;
  tier: ExplosiveTier;
  multiplier: number;
  metrics: GroupMetrics;
  governanceScore: number;
  coalitionDeltaExp: number;
  rankScore: number;
  eligible: boolean;
  failReasons: string[];
}

function buildClusterKey(pair: string, session: string, envBucket: string, coalitionId: string): string {
  return `${pair}|${session}|${envBucket}|${coalitionId}`;
}

// ─── Agent Classification ─────────────────────────────────────────────

export interface AgentClassification {
  agentId: string;
  agentClass: AgentClass;
  systemDeltaExp: number;
  systemDeltaPF: number;
  ddImpact: number;
  stabilityContribution: number;
  multiplierCap: number;
  allowedPairs: string[];
  allowedSessions: string[];
}

// ─── Safety Trigger ───────────────────────────────────────────────────

export interface SafetyTrigger {
  type: SafetyTriggerType;
  timestamp: number;
  detail: string;
  action: string;
  clusterKey?: string;
}

// ─── Explosive Live Config (output) ───────────────────────────────────

export interface ExplosiveLiveConfig {
  mode: 'OFF' | 'BETA' | 'ALPHA';
  generatedAt: number;
  dataWindow: { start: string; end: string; trades: number };
  clusters: EdgeDominanceCluster[];
  agentClassifications: AgentClassification[];
  pairAllocations: PairAllocation[];
  sessionDensity: SessionDensityRule[];
  envKeyBoosts: EnvKeyBoost[];
  safetyTriggers: SafetyTrigger[];
  edgeHealthGate: { expectancySlopeOk: boolean; stabilityOk: boolean; gatePass: boolean };
  projectedDelta: {
    expectancyDelta: number;
    pfDelta: number;
    ddDelta: number;
  };
  rollbackTriggers: string[];
}

export interface PairAllocation {
  pair: string;
  role: 'PRIMARY' | 'SECONDARY' | 'SHADOW';
  multiplierRange: [number, number];
  allowedSessions: string[];
  metrics: GroupMetrics;
}

export interface SessionDensityRule {
  session: string;
  densityMultiplier: number;
  metrics: GroupMetrics;
  isDominant: boolean;
}

export interface EnvKeyBoost {
  envKey: string;
  pair: string;
  session: string;
  boosted: boolean;
  multiplier: number;
  metrics: GroupMetrics;
  eligible: boolean;
  failReasons: string[];
}

// ─── Main Engine ──────────────────────────────────────────────────────

export function computeExplosiveGrowthConfig(
  trades: ExplosiveTradeRecord[],
  config: Partial<ExplosiveConfig> = {},
): ExplosiveLiveConfig {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Filter valid trades
  const valid = trades.filter(t =>
    t.entry_price && t.exit_price &&
    t.agent_id && t.agent_id !== 'manual-test' && t.agent_id !== 'unknown' && t.agent_id !== 'backtest-engine' &&
    t.session_label && t.regime_label
  );

  if (valid.length === 0) {
    return emptyConfig();
  }

  const sorted = [...valid].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Global metrics for edge health gate
  const globalMetrics = computeGroupMetrics(sorted);
  const edgeHealthGate = {
    expectancySlopeOk: globalMetrics.expectancySlope > 0,
    stabilityOk: globalMetrics.stabilityUp,
    gatePass: globalMetrics.expectancySlope > 0 && globalMetrics.stabilityUp,
  };

  // ── Step 1: Pair Allocations ──
  const pairGroups = groupBy(sorted, t => t.currency_pair);
  const allFrictions = sorted.map(t => t.spread_at_entry * pipFactor(t.currency_pair) + Math.abs(t.slippage_pips || 0));
  const frictionThreshold = percentile(allFrictions, cfg.frictionPercentile);
  cfg.safetyFrictionP80 = percentile(allFrictions, 80);

  const pairAllocations: PairAllocation[] = Object.entries(pairGroups)
    .map(([pair, pts]) => {
      const m = computeGroupMetrics(pts);
      const sessions = [...new Set(pts.map(t => t.session_label))];
      const govScore = computeGovernanceScore(m);
      const role: PairAllocation['role'] =
        govScore >= cfg.minGovernanceScore && m.pfValid && (m.profitFactor ?? 0) >= cfg.minPF
          ? 'PRIMARY'
          : m.expectancy > 0 && m.pfValid && (m.profitFactor ?? 0) >= 1.0
            ? 'SECONDARY'
            : 'SHADOW';

      const multiplierRange: [number, number] =
        role === 'PRIMARY' ? [cfg.alphaMin, cfg.alphaMax] :
        role === 'SECONDARY' ? [cfg.betaMin, cfg.betaMax] :
        [0, 0];

      const allowedSessions = role === 'PRIMARY'
        ? sessions
        : role === 'SECONDARY'
          ? sessions.filter(s => {
              const sessionTrades = pts.filter(t => t.session_label === s);
              const sm = computeGroupMetrics(sessionTrades);
              return sm.expectancy > 0 && sm.pfValid && (sm.profitFactor ?? 0) >= 1.0;
            })
          : [];

      return { pair, role, multiplierRange, allowedSessions, metrics: m };
    })
    .sort((a, b) => b.metrics.expectancy - a.metrics.expectancy);

  // ── Step 2: Agent Classification ──
  const agentGroups = groupBy(sorted, t => t.agent_id);
  const systemExpectancy = globalMetrics.expectancy;

  const agentClassifications: AgentClassification[] = Object.entries(agentGroups)
    .map(([agentId, agentTrades]) => {
      // With/without analysis
      const withoutAgent = sorted.filter(t => t.agent_id !== agentId);
      const withoutMetrics = computeGroupMetrics(withoutAgent);
      const agentMetrics = computeGroupMetrics(agentTrades);

      const deltaExp = systemExpectancy - withoutMetrics.expectancy;
      const deltaPF = (globalMetrics.profitFactor ?? 0) - (withoutMetrics.profitFactor ?? 0);
      const ddImpact = withoutMetrics.maxDD - globalMetrics.maxDD; // positive = agent helps reduce DD
      const stabilityContribution = agentMetrics.stabilityUp ? 1 : 0;

      const agentClass: AgentClass =
        deltaExp > 0 && agentMetrics.expectancy > 0 && (agentMetrics.profitFactor ?? 0) >= 1.1
          ? 'CHAMPION'
          : agentMetrics.expectancy > 0
            ? 'SPECIALIST'
            : 'DILUTER';

      const multiplierCap =
        agentClass === 'CHAMPION' ? cfg.championMax :
        agentClass === 'SPECIALIST' ? cfg.specialistMax :
        0;

      // Allowed pairs: only where agent has positive expectancy
      const agentPairGroups = groupBy(agentTrades, t => t.currency_pair);
      const allowedPairs = Object.entries(agentPairGroups)
        .filter(([, ts]) => {
          const m = computeGroupMetrics(ts);
          return m.expectancy > 0 && ts.length >= 20;
        })
        .map(([p]) => p);

      // Allowed sessions
      const agentSessionGroups = groupBy(agentTrades, t => t.session_label);
      const allowedSessions = Object.entries(agentSessionGroups)
        .filter(([, ts]) => {
          const m = computeGroupMetrics(ts);
          return m.expectancy > 0;
        })
        .map(([s]) => s);

      return {
        agentId,
        agentClass,
        systemDeltaExp: round2(deltaExp),
        systemDeltaPF: round2(deltaPF),
        ddImpact: round1(ddImpact),
        stabilityContribution,
        multiplierCap,
        allowedPairs,
        allowedSessions,
      };
    })
    .sort((a, b) => b.systemDeltaExp - a.systemDeltaExp);

  // ── Step 3: Edge Dominance Clusters ──
  const clusters: EdgeDominanceCluster[] = [];
  const pairSessionGroups = groupBy(sorted, t => `${t.currency_pair}|${t.session_label}`);

  for (const [key, psTrades] of Object.entries(pairSessionGroups)) {
    const [pair, session] = key.split('|');
    const m = computeGroupMetrics(psTrades);
    const govScore = computeGovernanceScore(m);

    // Determine dominant coalition in this pair×session
    const agentCounts = groupBy(psTrades, t => t.agent_id);
    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([a]) => a);
    const coalitionId = topAgents.join('+');

    const failReasons: string[] = [];
    if (govScore < cfg.minGovernanceScore) failReasons.push(`Gov score ${govScore} < ${cfg.minGovernanceScore}`);
    if (!m.pfValid) failReasons.push('PF invalid (zero denominator)');
    else if ((m.profitFactor ?? 0) < cfg.minPF) failReasons.push(`PF ${m.profitFactor} < ${cfg.minPF}`);
    if (m.expectancy <= 0) failReasons.push(`Expectancy ${m.expectancy} <= 0`);
    if (m.trades < cfg.minClusterTrades) failReasons.push(`Trades ${m.trades} < ${cfg.minClusterTrades}`);
    if (!m.stabilityUp) failReasons.push('Stability trending down');
    if (m.frictionDrag > frictionThreshold) failReasons.push(`Friction ${m.frictionDrag.toFixed(2)} > p50 ${frictionThreshold.toFixed(2)}`);

    const eligible = failReasons.length === 0;

    const rankScore = (m.expectancy * cfg.w1) +
      (m.expectancySlope * cfg.w2 * 100) +
      (m.stabilityUp ? cfg.w3 : 0) -
      (m.frictionDrag * cfg.w4) -
      (m.ddSlope * cfg.w5 * 100);

    const tier: ExplosiveTier = eligible ? 'ALPHA' : m.expectancy > 0 ? 'BETA' : 'GAMMA';
    const multiplier = tier === 'ALPHA'
      ? Math.min(cfg.alphaMax, cfg.alphaMin + rankScore * 0.1)
      : tier === 'BETA'
        ? Math.min(cfg.betaMax, cfg.betaMin)
        : 0;

    clusters.push({
      clusterKey: buildClusterKey(pair, session, `${m.winRate > 0.5 ? 'H' : 'L'}WR`, coalitionId),
      pair,
      session,
      envKeyBucket: `${pair}|${session}`,
      coalitionId,
      tier,
      multiplier: round2(Math.max(0, multiplier)),
      metrics: m,
      governanceScore: govScore,
      coalitionDeltaExp: 0, // simplified
      rankScore: round2(rankScore),
      eligible,
      failReasons,
    });
  }

  clusters.sort((a, b) => b.rankScore - a.rankScore);

  // ── Step 4: Session Density ──
  const sessionGroups = groupBy(sorted, t => t.session_label);
  const sessionDensity: SessionDensityRule[] = Object.entries(sessionGroups)
    .map(([session, sts]) => {
      const m = computeGroupMetrics(sts);
      const isDominant = m.expectancy > 0 && m.pfValid && (m.profitFactor ?? 0) >= 1.2 && m.stabilityUp;
      return {
        session,
        densityMultiplier: isDominant ? 1.25 : m.expectancy > 0 ? 1.0 : 0.5,
        metrics: m,
        isDominant,
      };
    })
    .sort((a, b) => b.metrics.expectancy - a.metrics.expectancy);

  // ── Step 5: EnvKey Boosts ──
  const envKeyGroups = groupBy(sorted, t => `${t.currency_pair}|${t.session_label}|${t.regime_label}`);
  const envKeyBoosts: EnvKeyBoost[] = Object.entries(envKeyGroups)
    .filter(([, ts]) => ts.length >= 20)
    .map(([ek, ts]) => {
      const m = computeGroupMetrics(ts);
      const [pair, session] = ek.split('|');
      const failReasons: string[] = [];
      if (m.expectancy <= 0) failReasons.push('Negative expectancy');
      if (!m.pfValid) failReasons.push('PF invalid');
      else if ((m.profitFactor ?? 0) < cfg.envKeyMinPF) failReasons.push(`PF < ${cfg.envKeyMinPF}`);
      if (!m.stabilityUp) failReasons.push('Stability down');
      if (ts.length < cfg.envKeyMinTrades) failReasons.push(`Trades < ${cfg.envKeyMinTrades}`);

      const eligible = failReasons.length === 0;
      return {
        envKey: ek,
        pair,
        session,
        boosted: eligible && edgeHealthGate.gatePass,
        multiplier: eligible ? 1.15 : 1.0,
        metrics: m,
        eligible,
        failReasons,
      };
    })
    .sort((a, b) => b.metrics.expectancy - a.metrics.expectancy);

  // ── Step 6: Safety Triggers ──
  const safetyTriggers: SafetyTrigger[] = [];
  if (globalMetrics.pfValid && (globalMetrics.profitFactor ?? 0) < cfg.safetyMinPF) {
    safetyTriggers.push({
      type: 'PF_DROP',
      timestamp: Date.now(),
      detail: `System PF ${globalMetrics.profitFactor} < ${cfg.safetyMinPF}`,
      action: 'De-escalate all multipliers to Beta',
    });
  }
  if (globalMetrics.expectancySlope < 0) {
    safetyTriggers.push({
      type: 'EXP_SLOPE_NEG',
      timestamp: Date.now(),
      detail: `Expectancy slope ${globalMetrics.expectancySlope.toFixed(4)} < 0`,
      action: 'De-escalate Alpha clusters to Beta',
    });
  }
  if (!globalMetrics.stabilityUp) {
    safetyTriggers.push({
      type: 'STABILITY_DOWN',
      timestamp: Date.now(),
      detail: 'Stability trending down (stddev rising or DD slope worsening)',
      action: 'Freeze multiplier ramps',
    });
  }

  // Determine mode
  const mode: ExplosiveLiveConfig['mode'] =
    safetyTriggers.length > 0 ? 'BETA' :
    edgeHealthGate.gatePass && clusters.some(c => c.tier === 'ALPHA') ? 'ALPHA' :
    'OFF';

  // Projected delta
  const alphaCount = clusters.filter(c => c.tier === 'ALPHA').length;
  const avgAlphaExp = alphaCount > 0
    ? clusters.filter(c => c.tier === 'ALPHA').reduce((s, c) => s + c.metrics.expectancy, 0) / alphaCount
    : 0;

  return {
    mode,
    generatedAt: Date.now(),
    dataWindow: {
      start: sorted[0]?.created_at || '',
      end: sorted[sorted.length - 1]?.created_at || '',
      trades: sorted.length,
    },
    clusters,
    agentClassifications,
    pairAllocations,
    sessionDensity,
    envKeyBoosts,
    safetyTriggers,
    edgeHealthGate,
    projectedDelta: {
      expectancyDelta: round2(avgAlphaExp - globalMetrics.expectancy),
      pfDelta: 0,
      ddDelta: 0,
    },
    rollbackTriggers: [
      `System PF < ${cfg.safetyMinPF} → revert to 1.0x`,
      'Expectancy slope < 0 → de-escalate Alpha',
      'Stability trend reversal → freeze ramps',
      `Friction > p80 (${cfg.safetyFrictionP80.toFixed(2)}) → kill switch`,
      'Coalition ΔExpectancy < 0 rolling → disable boost 24h',
      'Champion agent degrades >20% → revert multiplier',
    ],
  };
}

// ─── Governance Score (0-100) ─────────────────────────────────────────

function computeGovernanceScore(m: GroupMetrics): number {
  let score = 0;
  // Expectancy component (0-30)
  score += Math.min(30, Math.max(0, m.expectancy * 15));
  // PF component (0-25)
  if (m.pfValid && m.profitFactor !== null) {
    score += Math.min(25, Math.max(0, (m.profitFactor - 1) * 25));
  }
  // Sharpe component (0-20)
  score += Math.min(20, Math.max(0, m.sharpe * 5));
  // Win rate component (0-15)
  score += Math.min(15, Math.max(0, (m.winRate - 0.4) * 50));
  // Stability (0-10)
  score += m.stabilityUp ? 10 : 0;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Empty Config ─────────────────────────────────────────────────────

function emptyConfig(): ExplosiveLiveConfig {
  return {
    mode: 'OFF',
    generatedAt: Date.now(),
    dataWindow: { start: '', end: '', trades: 0 },
    clusters: [],
    agentClassifications: [],
    pairAllocations: [],
    sessionDensity: [],
    envKeyBoosts: [],
    safetyTriggers: [],
    edgeHealthGate: { expectancySlopeOk: false, stabilityOk: false, gatePass: false },
    projectedDelta: { expectancyDelta: 0, pfDelta: 0, ddDelta: 0 },
    rollbackTriggers: [],
  };
}

// ─── Export config getter ─────────────────────────────────────────────

export function getDefaultExplosiveConfig(): ExplosiveConfig {
  return { ...DEFAULT_CONFIG };
}
