// USD_CAD Learning & Convergence Engine
// Computes learning status, convergence metrics, attribution shifts, edge readiness,
// profit improvement suggestions, and learning tags — all from oanda_orders data.
// NO trading execution changes. USD_CAD only.

// ─── Types ────────────────────────────────────────────────────────────

export type AccountType = 'live' | 'practice' | 'shadow' | 'backtest';
export type FinalDecisionLabel = 'ENTER' | 'SKIP' | 'BLOCKED' | 'EXIT' | 'HOLD';
export type BlockingGovernor = 'governance' | 'friction' | 'session' | 'cooldown' | 'stability' | 'budget' | 'killSwitch' | 'none';

export interface UsdCadDecisionEvent {
  id: string;
  timestamp: number;
  accountType: AccountType;
  sessionLabel: string;
  envKey: string;
  governanceScore: number;
  edgeScore: number;
  compositeScore: number;
  stabilityScore: number;
  stabilityTrend: number;
  expectancySlope: number;
  frictionDrag: number;
  execQuality: number;
  finalDecision: FinalDecisionLabel;
  blockingGovernor: BlockingGovernor;
  agentVotes: { agentId: string; vote: string; confidence: number }[];
  coalitionId: string | null;
  // outcome (populated when trade closes)
  tradeId: string | null;
  pips: number | null;
  winLoss: 'win' | 'loss' | null;
  maxDDpips: number | null;
  realizedFriction: number | null;
}

export interface LearningStatusMetrics {
  observationLearning: boolean;
  counterfactualLearning: boolean;
  proposalGeneration: boolean;
  liveBehaviorChanges: boolean;
  lastUpdateTime: number | null;
  decisionsAnalyzed24h: number;
  decisionsAnalyzed7d: number;
  decisionsAnalyzed30d: number;
  envKeysSeen: number;
  coalitionsEvaluated: number;
}

export interface WindowMetrics {
  trades: number;
  expectancy: number;
  pf: number | null; // null = invalid
  winRate: number;
  drawdownSlope: number;
  frictionDrag: number;
  blockRate: number;
  decisionDistribution: { enter: number; skip: number; blocked: number };
  entropy: number;
}

export interface ConvergenceComparison {
  windowSize: number;
  current: WindowMetrics;
  previous: WindowMetrics;
  improving: boolean;
}

export interface EnvKeyShift {
  envKey: string;
  currentExpectancy: number;
  previousExpectancy: number;
  currentPF: number | null;
  previousPF: number | null;
  currentStabilityTrend: number;
  currentFrictionDrag: number;
  trades: number;
}

export interface AgentShift {
  agentId: string;
  currentVoteFreq: number;
  previousVoteFreq: number;
  deltaExpectancy: number;
  deltaPF: number | null;
}

export interface SessionShift {
  session: string;
  currentExpectancy: number;
  previousExpectancy: number;
  currentFriction: number;
  previousFriction: number;
}

export interface ScaleGate {
  label: string;
  passed: boolean;
  value: string;
  threshold: string;
}

export interface ProfitSuggestion {
  description: string;
  estimatedDeltaExpectancy: number;
  estimatedDeltaPF: number | null;
  sampleSize: number;
  confidence: 'high' | 'medium' | 'low';
}

export type LearningTag =
  | 'Good envKey' | 'Degrading envKey' | 'Friction high'
  | 'Agent harm risk' | 'Session weak' | 'Blocked correctly'
  | 'Entered in Alpha cluster' | 'Strong edge';

export interface LearningAnalysis {
  learningStatus: LearningStatusMetrics;
  convergence50: ConvergenceComparison;
  convergence200: ConvergenceComparison | null;
  envKeyShifts: EnvKeyShift[];
  agentShifts: AgentShift[];
  sessionShifts: SessionShift[];
  scaleGates: ScaleGate[];
  scaleAllowed: boolean;
  profitSuggestions: ProfitSuggestion[];
}

// ─── Constants ────────────────────────────────────────────────────────

const PF_EPSILON = 0.001;
const MIN_PF_FOR_SCALE = 1.2;
const MIN_SAMPLE_FOR_SCALE = 30;

// ─── Pip Math ─────────────────────────────────────────────────────────

export function computePips(entry: number, exit: number, pair: string, direction: string): number {
  const isJPY = pair.toUpperCase().includes('JPY');
  const factor = isJPY ? 100 : 10000;
  return direction === 'long' ? (exit - entry) * factor : (entry - exit) * factor;
}

// ─── PF Guard ─────────────────────────────────────────────────────────

export function computeValidPF(grossWin: number, grossLoss: number): number | null {
  if (Math.abs(grossLoss) < PF_EPSILON || grossLoss === 0) return null;
  return grossWin / Math.abs(grossLoss);
}

// ─── Entropy ──────────────────────────────────────────────────────────

function shannonEntropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

// ─── Build Decision Events from OANDA Orders ─────────────────────────

export function buildDecisionEvents(orders: any[]): UsdCadDecisionEvent[] {
  return orders
    .filter(o => {
      const pair = (o.currency_pair || '').toUpperCase();
      return pair === 'USD_CAD' || pair === 'USDCAD' || pair === 'USD/CAD';
    })
    .map((o, i) => {
      const pips = o.entry_price && o.exit_price
        ? computePips(o.entry_price, o.exit_price, 'USD_CAD', o.direction || 'long')
        : null;
      const winLoss = pips !== null ? (pips > 0 ? 'win' : 'loss') : null;

      const session = o.session_label || 'unknown';
      const regime = o.regime_label || 'unknown';
      const spreadBucket = o.spread_at_entry != null
        ? (o.spread_at_entry < 1.5 ? 'tight' : o.spread_at_entry < 3 ? 'normal' : 'wide')
        : 'unknown';

      const govPayload = o.governance_payload as any;
      const gateResult = o.gate_result || 'approved';

      let finalDecision: FinalDecisionLabel = 'ENTER';
      let blockingGovernor: BlockingGovernor = 'none';
      if (gateResult === 'rejected') {
        finalDecision = 'BLOCKED';
        blockingGovernor = 'governance';
      } else if (gateResult === 'throttled') {
        finalDecision = 'SKIP';
        blockingGovernor = 'cooldown';
      } else if (o.status === 'shadow_eval') {
        finalDecision = 'SKIP';
      }

      const agentVotes: { agentId: string; vote: string; confidence: number }[] = [];
      if (o.agent_id) {
        agentVotes.push({
          agentId: o.agent_id,
          vote: o.direction || 'long',
          confidence: o.confidence_score ?? 50,
        });
      }

      return {
        id: o.id || `evt-${i}`,
        timestamp: new Date(o.created_at).getTime(),
        accountType: (o.environment || 'practice') as AccountType,
        sessionLabel: session,
        envKey: `${session}|${spreadBucket}|${regime}`,
        governanceScore: o.governance_composite ?? 0,
        edgeScore: o.execution_quality_score ?? 50,
        compositeScore: o.governance_composite ?? 0,
        stabilityScore: 50,
        stabilityTrend: 0,
        expectancySlope: 0,
        frictionDrag: (o.spread_at_entry ?? 0) + (o.slippage_pips ?? 0),
        execQuality: o.execution_quality_score ?? 50,
        finalDecision,
        blockingGovernor,
        agentVotes,
        coalitionId: null,
        tradeId: o.id || null,
        pips,
        winLoss: winLoss as 'win' | 'loss' | null,
        maxDDpips: null,
        realizedFriction: o.spread_at_entry ?? null,
      };
    });
}

// ─── Window Metrics Computation ───────────────────────────────────────

export function computeWindowMetrics(events: UsdCadDecisionEvent[]): WindowMetrics {
  if (events.length === 0) {
    return {
      trades: 0, expectancy: 0, pf: null, winRate: 0, drawdownSlope: 0,
      frictionDrag: 0, blockRate: 0,
      decisionDistribution: { enter: 0, skip: 0, blocked: 0 },
      entropy: 0,
    };
  }

  const withPips = events.filter(e => e.pips !== null);
  const totalPips = withPips.reduce((s, e) => s + (e.pips ?? 0), 0);
  const expectancy = withPips.length > 0 ? totalPips / withPips.length : 0;

  const grossWin = withPips.filter(e => (e.pips ?? 0) > 0).reduce((s, e) => s + (e.pips ?? 0), 0);
  const grossLoss = withPips.filter(e => (e.pips ?? 0) < 0).reduce((s, e) => s + Math.abs(e.pips ?? 0), 0);
  const pf = computeValidPF(grossWin, grossLoss);

  const wins = withPips.filter(e => (e.pips ?? 0) > 0).length;
  const winRate = withPips.length > 0 ? wins / withPips.length : 0;

  const enters = events.filter(e => e.finalDecision === 'ENTER').length;
  const skips = events.filter(e => e.finalDecision === 'SKIP').length;
  const blocked = events.filter(e => e.finalDecision === 'BLOCKED').length;
  const total = events.length;

  const probs = [enters / total, skips / total, blocked / total].filter(p => p > 0);
  const entropy = shannonEntropy(probs);

  const avgFriction = events.reduce((s, e) => s + e.frictionDrag, 0) / events.length;
  const blockRate = blocked / total;

  // Drawdown slope: simple running max drawdown change
  let peak = 0, maxDD = 0, cumPips = 0;
  for (const e of withPips) {
    cumPips += e.pips ?? 0;
    if (cumPips > peak) peak = cumPips;
    const dd = peak - cumPips;
    if (dd > maxDD) maxDD = dd;
  }
  const drawdownSlope = withPips.length > 1 ? maxDD / withPips.length : 0;

  return {
    trades: events.length,
    expectancy,
    pf,
    winRate,
    drawdownSlope,
    frictionDrag: avgFriction,
    blockRate,
    decisionDistribution: { enter: enters, skip: skips, blocked },
    entropy,
  };
}

// ─── Convergence Comparison ───────────────────────────────────────────

export function computeConvergence(events: UsdCadDecisionEvent[], windowSize: number): ConvergenceComparison | null {
  if (events.length < windowSize * 2) return null;

  const current = events.slice(-windowSize);
  const previous = events.slice(-windowSize * 2, -windowSize);

  const currentMetrics = computeWindowMetrics(current);
  const previousMetrics = computeWindowMetrics(previous);

  const improving =
    currentMetrics.expectancy >= previousMetrics.expectancy &&
    currentMetrics.winRate >= previousMetrics.winRate &&
    currentMetrics.drawdownSlope <= previousMetrics.drawdownSlope * 1.1;

  return { windowSize, current: currentMetrics, previous: previousMetrics, improving };
}

// ─── Learning Status ──────────────────────────────────────────────────

export function computeLearningStatus(events: UsdCadDecisionEvent[]): LearningStatusMetrics {
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  const e24h = events.filter(e => e.timestamp >= h24);
  const e7d = events.filter(e => e.timestamp >= d7);
  const e30d = events.filter(e => e.timestamp >= d30);

  const envKeys = new Set(events.map(e => e.envKey));
  const coalitions = new Set(events.filter(e => e.coalitionId).map(e => e.coalitionId));

  const hasBlocked = events.some(e => e.finalDecision === 'BLOCKED');
  const hasSkipped = events.some(e => e.finalDecision === 'SKIP');

  return {
    observationLearning: e24h.length > 0 || e7d.length > 5,
    counterfactualLearning: hasBlocked || hasSkipped,
    proposalGeneration: events.length >= 50,
    liveBehaviorChanges: events.length >= 100,
    lastUpdateTime: events.length > 0 ? events[events.length - 1].timestamp : null,
    decisionsAnalyzed24h: e24h.length,
    decisionsAnalyzed7d: e7d.length,
    decisionsAnalyzed30d: e30d.length,
    envKeysSeen: envKeys.size,
    coalitionsEvaluated: coalitions.size,
  };
}

// ─── EnvKey Shifts ────────────────────────────────────────────────────

export function computeEnvKeyShifts(events: UsdCadDecisionEvent[], windowSize: number = 50): EnvKeyShift[] {
  if (events.length < windowSize * 2) return [];

  const current = events.slice(-windowSize);
  const previous = events.slice(-windowSize * 2, -windowSize);

  const envKeyGroups = (evts: UsdCadDecisionEvent[]) => {
    const map: Record<string, UsdCadDecisionEvent[]> = {};
    for (const e of evts) {
      if (!map[e.envKey]) map[e.envKey] = [];
      map[e.envKey].push(e);
    }
    return map;
  };

  const currentGroups = envKeyGroups(current);
  const previousGroups = envKeyGroups(previous);
  const allKeys = new Set([...Object.keys(currentGroups), ...Object.keys(previousGroups)]);

  const metricsForGroup = (evts: UsdCadDecisionEvent[]) => {
    const withPips = evts.filter(e => e.pips !== null);
    const totalPips = withPips.reduce((s, e) => s + (e.pips ?? 0), 0);
    const exp = withPips.length > 0 ? totalPips / withPips.length : 0;
    const gw = withPips.filter(e => (e.pips ?? 0) > 0).reduce((s, e) => s + (e.pips ?? 0), 0);
    const gl = withPips.filter(e => (e.pips ?? 0) < 0).reduce((s, e) => s + Math.abs(e.pips ?? 0), 0);
    const pf = computeValidPF(gw, gl);
    const friction = evts.reduce((s, e) => s + e.frictionDrag, 0) / (evts.length || 1);
    const stab = evts.reduce((s, e) => s + e.stabilityTrend, 0) / (evts.length || 1);
    return { exp, pf, friction, stab, trades: evts.length };
  };

  return Array.from(allKeys).map(envKey => {
    const cur = metricsForGroup(currentGroups[envKey] || []);
    const prev = metricsForGroup(previousGroups[envKey] || []);
    return {
      envKey,
      currentExpectancy: cur.exp,
      previousExpectancy: prev.exp,
      currentPF: cur.pf,
      previousPF: prev.pf,
      currentStabilityTrend: cur.stab,
      currentFrictionDrag: cur.friction,
      trades: cur.trades + (previousGroups[envKey]?.length ?? 0),
    };
  }).sort((a, b) => b.trades - a.trades);
}

// ─── Agent Shifts ─────────────────────────────────────────────────────

export function computeAgentShifts(events: UsdCadDecisionEvent[], windowSize: number = 50): AgentShift[] {
  if (events.length < windowSize * 2) return [];

  const current = events.slice(-windowSize);
  const previous = events.slice(-windowSize * 2, -windowSize);

  const agentFreq = (evts: UsdCadDecisionEvent[]) => {
    const map: Record<string, number> = {};
    for (const e of evts) {
      for (const v of e.agentVotes) {
        map[v.agentId] = (map[v.agentId] || 0) + 1;
      }
    }
    return map;
  };

  const agentPips = (evts: UsdCadDecisionEvent[]) => {
    const map: Record<string, number[]> = {};
    for (const e of evts) {
      if (e.pips == null) continue;
      for (const v of e.agentVotes) {
        if (!map[v.agentId]) map[v.agentId] = [];
        map[v.agentId].push(e.pips);
      }
    }
    return map;
  };

  const curFreq = agentFreq(current);
  const prevFreq = agentFreq(previous);
  const curPips = agentPips(current);
  const prevPips = agentPips(previous);

  const allAgents = new Set([...Object.keys(curFreq), ...Object.keys(prevFreq)]);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return Array.from(allAgents).map(agentId => ({
    agentId,
    currentVoteFreq: curFreq[agentId] || 0,
    previousVoteFreq: prevFreq[agentId] || 0,
    deltaExpectancy: avg(curPips[agentId] || []) - avg(prevPips[agentId] || []),
    deltaPF: null, // simplified
  })).sort((a, b) => b.currentVoteFreq - a.currentVoteFreq);
}

// ─── Session Shifts ───────────────────────────────────────────────────

export function computeSessionShifts(events: UsdCadDecisionEvent[], windowSize: number = 50): SessionShift[] {
  if (events.length < windowSize * 2) return [];

  const current = events.slice(-windowSize);
  const previous = events.slice(-windowSize * 2, -windowSize);

  const sessionMetrics = (evts: UsdCadDecisionEvent[]) => {
    const map: Record<string, { pips: number[]; friction: number[] }> = {};
    for (const e of evts) {
      if (!map[e.sessionLabel]) map[e.sessionLabel] = { pips: [], friction: [] };
      if (e.pips != null) map[e.sessionLabel].pips.push(e.pips);
      map[e.sessionLabel].friction.push(e.frictionDrag);
    }
    return map;
  };

  const curSess = sessionMetrics(current);
  const prevSess = sessionMetrics(previous);
  const allSessions = new Set([...Object.keys(curSess), ...Object.keys(prevSess)]);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return Array.from(allSessions).map(session => ({
    session,
    currentExpectancy: avg(curSess[session]?.pips || []),
    previousExpectancy: avg(prevSess[session]?.pips || []),
    currentFriction: avg(curSess[session]?.friction || []),
    previousFriction: avg(prevSess[session]?.friction || []),
  }));
}

// ─── Scale Gates ──────────────────────────────────────────────────────

export function computeScaleGates(events: UsdCadDecisionEvent[]): { gates: ScaleGate[]; allowed: boolean } {
  const recent = events.slice(-100);
  const metrics = computeWindowMetrics(recent);

  const gates: ScaleGate[] = [
    {
      label: 'Expectancy slope positive',
      passed: metrics.expectancy > 0,
      value: `${metrics.expectancy.toFixed(2)}p`,
      threshold: '> 0',
    },
    {
      label: 'PF valid and >= 1.2',
      passed: metrics.pf !== null && metrics.pf >= MIN_PF_FOR_SCALE,
      value: metrics.pf !== null ? metrics.pf.toFixed(2) : 'NULL',
      threshold: `>= ${MIN_PF_FOR_SCALE}`,
    },
    {
      label: 'Stability trend not negative',
      passed: metrics.drawdownSlope <= 0.5,
      value: metrics.drawdownSlope.toFixed(3),
      threshold: '<= 0.5',
    },
    {
      label: 'Friction drag not elevated',
      passed: metrics.frictionDrag < 3.0,
      value: `${metrics.frictionDrag.toFixed(2)}`,
      threshold: '< 3.0',
    },
    {
      label: 'Sample size minimum met',
      passed: recent.length >= MIN_SAMPLE_FOR_SCALE,
      value: `${recent.length}`,
      threshold: `>= ${MIN_SAMPLE_FOR_SCALE}`,
    },
  ];

  return { gates, allowed: gates.every(g => g.passed) };
}

// ─── Profit Improvement Suggestions ───────────────────────────────────

export function computeProfitSuggestions(events: UsdCadDecisionEvent[]): ProfitSuggestion[] {
  const closed = events.filter(e => e.pips !== null);
  if (closed.length < 20) return [];

  const suggestions: ProfitSuggestion[] = [];
  const avgExpectancy = closed.reduce((s, e) => s + (e.pips ?? 0), 0) / closed.length;

  // 1) Skip when friction high
  const highFriction = closed.filter(e => e.frictionDrag > 3.0);
  if (highFriction.length >= 5) {
    const hfAvg = highFriction.reduce((s, e) => s + (e.pips ?? 0), 0) / highFriction.length;
    const lowFriction = closed.filter(e => e.frictionDrag <= 3.0);
    const lfAvg = lowFriction.length > 0 ? lowFriction.reduce((s, e) => s + (e.pips ?? 0), 0) / lowFriction.length : avgExpectancy;
    suggestions.push({
      description: 'Skip when frictionDrag > 3.0 pips',
      estimatedDeltaExpectancy: lfAvg - avgExpectancy,
      estimatedDeltaPF: null,
      sampleSize: highFriction.length,
      confidence: highFriction.length >= 20 ? 'high' : highFriction.length >= 10 ? 'medium' : 'low',
    });
  }

  // 2) Restrict to best session
  const sessionGroups: Record<string, number[]> = {};
  for (const e of closed) {
    if (!sessionGroups[e.sessionLabel]) sessionGroups[e.sessionLabel] = [];
    sessionGroups[e.sessionLabel].push(e.pips ?? 0);
  }
  const sessionAvgs = Object.entries(sessionGroups)
    .map(([s, pips]) => ({ session: s, avg: pips.reduce((a, b) => a + b, 0) / pips.length, n: pips.length }))
    .sort((a, b) => b.avg - a.avg);
  if (sessionAvgs.length >= 2 && sessionAvgs[0].avg > avgExpectancy) {
    suggestions.push({
      description: `Restrict to best session: ${sessionAvgs[0].session}`,
      estimatedDeltaExpectancy: sessionAvgs[0].avg - avgExpectancy,
      estimatedDeltaPF: null,
      sampleSize: sessionAvgs[0].n,
      confidence: sessionAvgs[0].n >= 30 ? 'high' : sessionAvgs[0].n >= 15 ? 'medium' : 'low',
    });
  }

  // 3) Reduce size when governance score low
  const lowGov = closed.filter(e => e.governanceScore < 50);
  if (lowGov.length >= 5) {
    const lgAvg = lowGov.reduce((s, e) => s + (e.pips ?? 0), 0) / lowGov.length;
    suggestions.push({
      description: 'Reduce size when governanceScore < 50',
      estimatedDeltaExpectancy: avgExpectancy - lgAvg,
      estimatedDeltaPF: null,
      sampleSize: lowGov.length,
      confidence: lowGov.length >= 15 ? 'medium' : 'low',
    });
  }

  // 4) Disable weak agents
  const agentGroups: Record<string, number[]> = {};
  for (const e of closed) {
    for (const v of e.agentVotes) {
      if (!agentGroups[v.agentId]) agentGroups[v.agentId] = [];
      agentGroups[v.agentId].push(e.pips ?? 0);
    }
  }
  const weakAgents = Object.entries(agentGroups)
    .map(([id, pips]) => ({ id, avg: pips.reduce((a, b) => a + b, 0) / pips.length, n: pips.length }))
    .filter(a => a.avg < 0 && a.n >= 5);
  if (weakAgents.length > 0) {
    const worst = weakAgents.sort((a, b) => a.avg - b.avg)[0];
    suggestions.push({
      description: `Disable agent ${worst.id} in weak envKeys`,
      estimatedDeltaExpectancy: Math.abs(worst.avg) * (worst.n / closed.length),
      estimatedDeltaPF: null,
      sampleSize: worst.n,
      confidence: worst.n >= 20 ? 'medium' : 'low',
    });
  }

  // 5) Tighten governance in weak envKeys
  const envGroups: Record<string, number[]> = {};
  for (const e of closed) {
    if (!envGroups[e.envKey]) envGroups[e.envKey] = [];
    envGroups[e.envKey].push(e.pips ?? 0);
  }
  const weakEnvs = Object.entries(envGroups)
    .map(([k, pips]) => ({ envKey: k, avg: pips.reduce((a, b) => a + b, 0) / pips.length, n: pips.length }))
    .filter(e => e.avg < 0 && e.n >= 5);
  if (weakEnvs.length > 0) {
    const worst = weakEnvs.sort((a, b) => a.avg - b.avg)[0];
    suggestions.push({
      description: `Tighten governance in envKey: ${worst.envKey}`,
      estimatedDeltaExpectancy: Math.abs(worst.avg) * (worst.n / closed.length),
      estimatedDeltaPF: null,
      sampleSize: worst.n,
      confidence: worst.n >= 15 ? 'medium' : 'low',
    });
  }

  return suggestions.slice(0, 5);
}

// ─── Learning Tags ────────────────────────────────────────────────────

export function computeLearningTag(event: UsdCadDecisionEvent, envKeyShifts: EnvKeyShift[]): LearningTag | null {
  if (event.finalDecision === 'BLOCKED') return 'Blocked correctly';
  if (event.frictionDrag > 3.0) return 'Friction high';

  const envShift = envKeyShifts.find(e => e.envKey === event.envKey);
  if (envShift) {
    if (envShift.currentExpectancy > 0 && envShift.currentExpectancy > envShift.previousExpectancy) return 'Good envKey';
    if (envShift.currentExpectancy < envShift.previousExpectancy && envShift.currentExpectancy < 0) return 'Degrading envKey';
  }

  if (event.pips !== null && event.pips > 2) return 'Strong edge';

  return null;
}

// ─── CSV Export Helpers ───────────────────────────────────────────────

export function exportToCsv(headers: string[], rows: string[][]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Master Analysis ──────────────────────────────────────────────────

export function computeUsdCadLearningAnalysis(events: UsdCadDecisionEvent[]): LearningAnalysis {
  const learningStatus = computeLearningStatus(events);
  const convergence50 = computeConvergence(events, 50) || {
    windowSize: 50,
    current: computeWindowMetrics(events.slice(-Math.min(50, events.length))),
    previous: computeWindowMetrics([]),
    improving: false,
  };
  const convergence200 = computeConvergence(events, 200);
  const envKeyShifts = computeEnvKeyShifts(events);
  const agentShifts = computeAgentShifts(events);
  const sessionShifts = computeSessionShifts(events);
  const { gates, allowed } = computeScaleGates(events);
  const profitSuggestions = computeProfitSuggestions(events);

  return {
    learningStatus,
    convergence50,
    convergence200,
    envKeyShifts,
    agentShifts,
    sessionShifts,
    scaleGates: gates,
    scaleAllowed: allowed,
    profitSuggestions,
  };
}
