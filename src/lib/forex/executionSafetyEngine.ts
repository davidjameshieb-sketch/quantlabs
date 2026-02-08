// ─── OANDA Execution Safety Engine ───
// Pre-trade gating, friction scoring, slippage tracking,
// auto-protection triggers, and kill-switch logic for live execution.

// ─── Types ───

export type GateResult = 'PASS' | 'REJECT' | 'THROTTLE';

export interface FrictionBudget {
  pair: string;
  spreadMean: number;       // pips
  spreadVolatility: number; // pips std dev
  slippageEstimate: number; // pips
  latencyDrift: number;     // pips equivalent
  totalFriction: number;    // sum of above
  frictionK: number;        // K multiplier (default 3.0, raised under stress)
}

export interface PreTradeGateResult {
  result: GateResult;
  frictionScore: number;       // 0-100 (100 = best)
  spreadStabilityScore: number;
  sessionLabel: string;
  regimeLabel: string;
  reasons: string[];
  expectedMove: number;
  totalFriction: number;
  frictionRatio: number;
}

export interface ExecutionTelemetry {
  requestedPrice: number | null;
  filledPrice: number | null;
  slippagePips: number | null;
  fillLatencyMs: number | null;
  spreadAtEntry: number | null;
  frictionScore: number;
  executionQualityScore: number; // 0-100
  idempotencyKey: string;
  sessionLabel: string;
  regimeLabel: string;
  gateResult: GateResult;
  gateReasons: string[];
}

export interface ExecutionHealthMetrics {
  avgSlippage: number;
  maxSlippage: number;
  slippageDriftAlert: boolean;
  avgFillLatency: number;
  avgFrictionScore: number;
  avgExecutionQuality: number;
  orderRejectionRate: number;
  partialFillRate: number;
  netExpectancyAfterFriction: number;
  killSwitchActive: boolean;
  protectionLevel: 'normal' | 'elevated' | 'critical';
  activeProtections: string[];
  rollingSlippage: number[];       // last 20 trades
  rollingQuality: number[];        // last 20 trades
  pairHealthMap: Record<string, PairExecutionHealth>;
}

export interface PairExecutionHealth {
  pair: string;
  avgSlippage: number;
  avgSpread: number;
  frictionBudget: number;
  withinBudget: boolean;
  tradeCount: number;
  qualityScore: number;
}

export interface ExecutionAutoProtection {
  triggered: boolean;
  level: 'normal' | 'elevated' | 'critical';
  actions: string[];
  frictionKOverride: number | null;
  densityMultiplier: number;       // 0.0-1.0 (1.0 = no throttle)
  restrictedPairs: string[];
  reason: string;
}

// ─── Seeded RNG for deterministic simulation ───

class ExecRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(p = 0.5): boolean { return this.next() < p; }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// ─── Session Detection ───

type SessionWindow = 'asian' | 'london-open' | 'ny-overlap' | 'late-ny' | 'rollover';

const SESSION_FRICTION_MULT: Record<SessionWindow, number> = {
  'asian': 1.3,        // wider spreads
  'london-open': 0.8,  // tightest
  'ny-overlap': 0.85,
  'late-ny': 1.2,
  'rollover': 2.0,     // avoid
};

const SESSION_LABELS: Record<SessionWindow, string> = {
  'asian': 'Asian Session',
  'london-open': 'London Open',
  'ny-overlap': 'NY Overlap',
  'late-ny': 'Late NY',
  'rollover': 'Rollover (Avoid)',
};

function detectSession(): SessionWindow {
  const hour = new Date().getUTCHours();
  if (hour >= 21 || hour < 1) return 'rollover';
  if (hour >= 1 && hour < 7) return 'asian';
  if (hour >= 7 && hour < 12) return 'london-open';
  if (hour >= 12 && hour < 17) return 'ny-overlap';
  return 'late-ny';
}

// ─── Friction Budget Per Pair ───

const PAIR_BASE_SPREADS: Record<string, number> = {
  'EUR_USD': 0.6, 'GBP_USD': 0.9, 'USD_JPY': 0.7, 'AUD_USD': 0.8,
  'USD_CAD': 1.0, 'EUR_JPY': 1.1, 'GBP_JPY': 1.5, 'EUR_GBP': 0.8,
  'NZD_USD': 1.2, 'AUD_JPY': 1.3, 'USD_CHF': 1.0, 'EUR_CHF': 1.2,
  'EUR_AUD': 1.6, 'GBP_AUD': 2.0, 'AUD_NZD': 1.8,
};

export function computeFrictionBudget(pair: string, session: SessionWindow): FrictionBudget {
  const rng = new ExecRNG(hashStr(`friction-${pair}-${session}`));
  const baseSpread = PAIR_BASE_SPREADS[pair] || 1.5;
  const sessionMult = SESSION_FRICTION_MULT[session];

  const spreadMean = baseSpread * sessionMult * rng.range(0.9, 1.1);
  const spreadVol = spreadMean * rng.range(0.1, 0.4);
  const slippage = rng.range(0.05, 0.3);
  const latency = rng.range(0.01, 0.1);
  const total = spreadMean + spreadVol + slippage + latency;

  // K defaults to 3.0 but increases during rollover/high-vol
  const frictionK = session === 'rollover' ? 5.0 : session === 'asian' ? 3.5 : 3.0;

  return { pair, spreadMean, spreadVolatility: spreadVol, slippageEstimate: slippage, latencyDrift: latency, totalFriction: total, frictionK };
}

// ─── Pre-Trade Execution Gate ───

export function runPreTradeGate(
  pair: string,
  expectedMovePips: number,
  regime: string = 'trending',
  overrideK?: number
): PreTradeGateResult {
  const session = detectSession();
  const budget = computeFrictionBudget(pair, session);
  const K = overrideK ?? budget.frictionK;
  const reasons: string[] = [];

  // 1. Friction expectancy gate
  const frictionRatio = expectedMovePips / budget.totalFriction;
  const frictionPass = frictionRatio >= K;
  if (!frictionPass) {
    reasons.push(`Friction ratio ${frictionRatio.toFixed(1)}× < required ${K.toFixed(1)}×`);
  }

  // 2. Spread stability gate
  const spreadStability = Math.max(0, 100 - budget.spreadVolatility * 80);
  const spreadStable = spreadStability >= 40;
  if (!spreadStable) {
    reasons.push(`Spread volatility ${budget.spreadVolatility.toFixed(2)} exceeds stability threshold`);
  }

  // 3. Session/liquidity gate
  const sessionOk = session !== 'rollover';
  if (!sessionOk) {
    reasons.push('Rollover window — liquidity insufficient');
  }

  // 4. Regime adjustment
  const regimeRisk = regime === 'high-volatility' || regime === 'low-liquidity';
  if (regimeRisk) {
    reasons.push(`Regime ${regime} — elevated execution risk`);
  }

  // Composite friction score (0-100, higher = better)
  const frictionScore = Math.round(
    Math.min(100, Math.max(0,
      (frictionPass ? 40 : 0) + (spreadStable ? 25 : 0) + (sessionOk ? 20 : 0) + (!regimeRisk ? 15 : 0)
    ))
  );

  let result: GateResult = 'PASS';
  if (!frictionPass || !sessionOk) result = 'REJECT';
  else if (!spreadStable || regimeRisk) result = 'THROTTLE';

  return {
    result,
    frictionScore,
    spreadStabilityScore: Math.round(spreadStability),
    sessionLabel: SESSION_LABELS[session],
    regimeLabel: regime,
    reasons,
    expectedMove: expectedMovePips,
    totalFriction: budget.totalFriction,
    frictionRatio,
  };
}

// ─── Idempotency Key Generator ───

export function generateIdempotencyKey(
  signalId: string,
  pair: string,
  direction: string,
  timestamp: number
): string {
  return `exec-${signalId}-${pair}-${direction}-${timestamp}`;
}

// ─── Execution Quality Scoring ───

export function scoreExecutionQuality(
  slippagePips: number,
  fillLatencyMs: number,
  spreadAtEntry: number,
  expectedSpread: number
): number {
  // Slippage component (0-40 points, lower slippage = higher score)
  const slippageScore = Math.max(0, 40 - Math.abs(slippagePips) * 20);

  // Latency component (0-25 points, faster = better)
  const latencyScore = Math.max(0, 25 - (fillLatencyMs / 100) * 5);

  // Spread component (0-20 points, tighter = better)
  const spreadRatio = spreadAtEntry / Math.max(expectedSpread, 0.1);
  const spreadScore = spreadRatio <= 1.2 ? 20 : spreadRatio <= 1.5 ? 12 : spreadRatio <= 2.0 ? 5 : 0;

  // Fill quality bonus (0-15 points)
  const fillBonus = slippagePips <= 0.1 ? 15 : slippagePips <= 0.3 ? 10 : slippagePips <= 0.5 ? 5 : 0;

  return Math.round(Math.min(100, slippageScore + latencyScore + spreadScore + fillBonus));
}

// ─── Execution Auto-Protection ───

export function evaluateExecutionProtection(
  recentSlippages: number[],
  recentQualities: number[],
  rejectionRate: number,
  netExpectancy: number
): ExecutionAutoProtection {
  const actions: string[] = [];
  let level: 'normal' | 'elevated' | 'critical' = 'normal';
  let frictionKOverride: number | null = null;
  let densityMult = 1.0;
  const restricted: string[] = [];

  // Check slippage drift
  if (recentSlippages.length >= 5) {
    const avgSlip = recentSlippages.reduce((a, b) => a + b, 0) / recentSlippages.length;
    const recentAvg = recentSlippages.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (recentAvg > avgSlip * 1.5) {
      actions.push('Slippage drift detected — raising friction K');
      frictionKOverride = 4.0;
      level = 'elevated';
    }
  }

  // Check execution quality degradation
  if (recentQualities.length >= 5) {
    const recentAvg = recentQualities.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (recentAvg < 50) {
      actions.push('Execution quality below threshold — reducing density');
      densityMult = 0.6;
      level = level === 'elevated' ? 'critical' : 'elevated';
    }
  }

  // Check rejection rate
  if (rejectionRate > 0.2) {
    actions.push('High rejection rate — throttling order flow');
    densityMult = Math.min(densityMult, 0.5);
    level = level === 'normal' ? 'elevated' : level;
  }

  // Check net expectancy
  if (netExpectancy < 0) {
    actions.push('Negative net expectancy — CRITICAL: reduce all positions');
    densityMult = Math.min(densityMult, 0.3);
    level = 'critical';
  }

  // Kill switch
  if (level === 'critical' && actions.length >= 3) {
    actions.push('KILL SWITCH: suspending live order routing');
    densityMult = 0;
  }

  return {
    triggered: actions.length > 0,
    level,
    actions,
    frictionKOverride,
    densityMultiplier: densityMult,
    restrictedPairs: restricted,
    reason: actions.length > 0 ? actions[0] : 'All execution metrics within tolerance',
  };
}

// ─── Compute Execution Health From Recent Orders ───

export function computeExecutionHealth(
  orders: Array<{
    slippage_pips?: number | null;
    fill_latency_ms?: number | null;
    friction_score?: number | null;
    execution_quality_score?: number | null;
    spread_at_entry?: number | null;
    currency_pair?: string;
    status?: string;
    entry_price?: number | null;
  }>
): ExecutionHealthMetrics {
  // Only count orders that have actual execution telemetry (entry_price set means real fill)
  const filled = orders.filter(o =>
    (o.status === 'filled' || o.status === 'closed') && o.entry_price != null
  );
  const rejected = orders.filter(o => o.status === 'rejected');
  // Total = orders with meaningful status (exclude bulk-cleared legacy)
  const meaningful = orders.filter(o =>
    o.entry_price != null || o.status === 'rejected' || o.status === 'submitted'
  );
  const total = meaningful.length || 1;

  const slippages = filled
    .map(o => o.slippage_pips)
    .filter((v): v is number => v != null);
  const latencies = filled
    .map(o => o.fill_latency_ms)
    .filter((v): v is number => v != null);
  const frictions = filled
    .map(o => o.friction_score)
    .filter((v): v is number => v != null);
  const qualities = filled
    .map(o => o.execution_quality_score)
    .filter((v): v is number => v != null);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const maxVal = (arr: number[]) => arr.length ? Math.max(...arr) : 0;

  const avgSlip = avg(slippages);
  const recentSlip = slippages.slice(-5);
  const recentAvgSlip = avg(recentSlip);
  const slippageDrift = recentSlip.length >= 3 && recentAvgSlip > avgSlip * 1.4;

  const rejectionRate = rejected.length / total;
  const avgQuality = avg(qualities);
  const netExpectancy = avgQuality > 60 ? avgQuality * 0.01 - avgSlip * 0.1 : -(avgSlip * 0.2);

  const protection = evaluateExecutionProtection(
    slippages.slice(-20),
    qualities.slice(-20),
    rejectionRate,
    netExpectancy
  );

  // Per-pair health
  const pairMap: Record<string, PairExecutionHealth> = {};
  for (const o of filled) {
    const pair = o.currency_pair || 'UNKNOWN';
    if (!pairMap[pair]) {
      pairMap[pair] = {
        pair,
        avgSlippage: 0,
        avgSpread: 0,
        frictionBudget: PAIR_BASE_SPREADS[pair] || 1.5,
        withinBudget: true,
        tradeCount: 0,
        qualityScore: 0,
      };
    }
    pairMap[pair].tradeCount++;
    if (o.slippage_pips != null) pairMap[pair].avgSlippage += o.slippage_pips;
    if (o.spread_at_entry != null) pairMap[pair].avgSpread += o.spread_at_entry;
    if (o.execution_quality_score != null) pairMap[pair].qualityScore += o.execution_quality_score;
  }
  for (const p of Object.values(pairMap)) {
    if (p.tradeCount > 0) {
      p.avgSlippage /= p.tradeCount;
      p.avgSpread /= p.tradeCount;
      p.qualityScore = Math.round(p.qualityScore / p.tradeCount);
      p.withinBudget = (p.avgSlippage + p.avgSpread) <= p.frictionBudget * 2;
    }
  }

  return {
    avgSlippage: avgSlip,
    maxSlippage: maxVal(slippages),
    slippageDriftAlert: slippageDrift,
    avgFillLatency: avg(latencies),
    avgFrictionScore: avg(frictions),
    avgExecutionQuality: avgQuality,
    orderRejectionRate: rejectionRate,
    partialFillRate: 0, // OANDA FOK doesn't do partials
    netExpectancyAfterFriction: netExpectancy,
    killSwitchActive: protection.level === 'critical' && protection.densityMultiplier === 0,
    protectionLevel: protection.level,
    activeProtections: protection.actions,
    rollingSlippage: slippages.slice(-20),
    rollingQuality: qualities.slice(-20),
    pairHealthMap: pairMap,
  };
}

// ─── Simulated Execution Health (for dashboard when no live data) ───

export function createSimulatedExecutionHealth(): ExecutionHealthMetrics {
  const rng = new ExecRNG(hashStr('exec-health-sim'));

  const slippages = Array.from({ length: 20 }, () => rng.range(0.02, 0.45));
  const qualities = Array.from({ length: 20 }, () => rng.int(55, 98));

  const pairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'EUR_GBP', 'GBP_JPY', 'EUR_JPY'];
  const pairMap: Record<string, PairExecutionHealth> = {};
  for (const pair of pairs) {
    const budget = PAIR_BASE_SPREADS[pair] || 1.5;
    const avgSlip = rng.range(0.03, 0.3);
    const avgSpread = budget * rng.range(0.85, 1.25);
    pairMap[pair] = {
      pair,
      avgSlippage: avgSlip,
      avgSpread,
      frictionBudget: budget * 2,
      withinBudget: (avgSlip + avgSpread) <= budget * 2,
      tradeCount: rng.int(5, 40),
      qualityScore: rng.int(62, 96),
    };
  }

  const avgSlip = slippages.reduce((a, b) => a + b, 0) / slippages.length;
  const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;

  return {
    avgSlippage: avgSlip,
    maxSlippage: Math.max(...slippages),
    slippageDriftAlert: false,
    avgFillLatency: rng.range(45, 180),
    avgFrictionScore: rng.range(68, 92),
    avgExecutionQuality: avgQuality,
    orderRejectionRate: rng.range(0.02, 0.08),
    partialFillRate: 0,
    netExpectancyAfterFriction: rng.range(0.15, 0.65),
    killSwitchActive: false,
    protectionLevel: 'normal',
    activeProtections: [],
    rollingSlippage: slippages,
    rollingQuality: qualities,
    pairHealthMap: pairMap,
  };
}
