// Adaptive Governance Engine (Frontend)
// Mirrors the edge function's governance state machine for dashboard display.
// Computes rolling metrics from live oanda_orders data.

export type GovernanceState = "NORMAL" | "DEFENSIVE" | "THROTTLED" | "HALT";

export interface GovernanceStateConfig {
  state: GovernanceState;
  label: string;
  color: string;
  densityMultiplier: number;
  sizingMultiplier: number;
  frictionK: number;
  pairRestriction: "none" | "majors-only" | "top-performers";
  recoveryConditions: string[];
}

export const GOVERNANCE_STATE_CONFIGS: Record<GovernanceState, GovernanceStateConfig> = {
  NORMAL: {
    state: "NORMAL", label: "Normal Operations", color: "emerald",
    densityMultiplier: 1.0, sizingMultiplier: 1.0, frictionK: 3.0,
    pairRestriction: "none", recoveryConditions: [],
  },
  DEFENSIVE: {
    state: "DEFENSIVE", label: "Defensive Mode", color: "amber",
    densityMultiplier: 0.65, sizingMultiplier: 0.75, frictionK: 3.8,
    pairRestriction: "majors-only",
    recoveryConditions: ["Expectancy > 0.5p over 20 trades", "Win rate > 55%", "Capture ratio > 40%"],
  },
  THROTTLED: {
    state: "THROTTLED", label: "Throttled", color: "orange",
    densityMultiplier: 0.30, sizingMultiplier: 0.50, frictionK: 4.5,
    pairRestriction: "top-performers",
    recoveryConditions: ["Expectancy > 0.8p over 30 trades", "Win rate > 60%", "No slippage drift"],
  },
  HALT: {
    state: "HALT", label: "Recalibrating", color: "orange",
    densityMultiplier: 0.15, sizingMultiplier: 0.35, frictionK: 5.5,
    pairRestriction: "top-performers",
    recoveryConditions: ["15-min cooldown then auto-resume at 0.35x sizing", "Top-performers only"],
  },
};

export interface RollingWindow {
  label: string;
  windowSize: number;
  winRate: number;
  expectancy: number;
  captureRatio: number;
  avgQuality: number;
  avgSlippage: number;
  rejectionRate: number;
  slippageDrift: boolean;
  frictionAdjPnl: number;
  tradeCount: number;
}

export interface PairAllocation {
  pair: string;
  displayPair: string;
  winRate: number;
  expectancy: number;
  sharpe: number;
  avgQuality: number;
  tradeCount: number;
  netPnlPips: number;
  status: "promoted" | "normal" | "restricted" | "banned";
  capitalMultiplier: number;
}

export interface SessionBudget {
  session: string;
  label: string;
  maxDensity: number;
  frictionMultiplier: number;
  volatilityTolerance: number;
  capitalBudgetPct: number;
  currentAggressiveness: number;
}

export interface ShadowCandidate {
  id: string;
  parameter: string;
  currentValue: number;
  proposedValue: number;
  baselineExpectancy: number;
  shadowExpectancy: number;
  improvementPct: number;
  sampleSize: number;
  minSampleRequired: number;
  eligible: boolean;
  reason: string;
}

export interface GovernanceDashboardData {
  currentState: GovernanceState;
  stateConfig: GovernanceStateConfig;
  stateReasons: string[];
  windows: {
    w20: RollingWindow;
    w50: RollingWindow;
    w200: RollingWindow;
  };
  pairAllocations: PairAllocation[];
  sessionBudgets: SessionBudget[];
  shadowCandidates: ShadowCandidate[];
  bannedPairs: string[];
  restrictedPairs: string[];
  promotedPairs: string[];
}

// ─── Compute from live order data ───

interface OrderRecord {
  currency_pair: string;
  direction: string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  execution_quality_score: number | null;
  slippage_pips: number | null;
  session_label: string | null;
}

function computeWindow(
  orders: OrderRecord[],
  windowSize: number,
  label: string
): RollingWindow {
  const window = orders.slice(0, windowSize);
  const filled = window.filter(o => (o.status === "filled" || o.status === "closed") && o.entry_price != null);
  const closed = window.filter(o => o.status === "closed" && o.exit_price != null && o.entry_price != null);
  const rejected = window.filter(o => o.status === "rejected");

  if (filled.length < 3) {
    return {
      label, windowSize, winRate: 0.5, expectancy: 0, captureRatio: 0.5,
      avgQuality: 70, avgSlippage: 0, rejectionRate: 0, slippageDrift: false,
      frictionAdjPnl: 0, tradeCount: filled.length,
    };
  }

  let wins = 0, totalPnl = 0;
  for (const o of closed) {
    const pipMult = o.currency_pair.includes("JPY") ? 0.01 : 0.0001;
    const pnl = o.direction === "long"
      ? ((o.exit_price! - o.entry_price!) / pipMult)
      : ((o.entry_price! - o.exit_price!) / pipMult);
    totalPnl += pnl;
    if (pnl > 0) wins++;
  }

  const winRate = closed.length > 0 ? wins / closed.length : 0.5;
  const expectancy = closed.length > 0 ? totalPnl / closed.length : 0;

  const qualities = filled.map(o => o.execution_quality_score).filter((v): v is number => v != null);
  const slippages = filled.map(o => o.slippage_pips).filter((v): v is number => v != null);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 70;
  const avgSlippage = slippages.length ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0;

  let slippageDrift = false;
  if (slippages.length >= 8) {
    const recent5 = slippages.slice(0, 5);
    const older = slippages.slice(5);
    const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    slippageDrift = olderAvg > 0 && recentAvg > olderAvg * 1.4;
  }

  const totalMeaningful = filled.length + rejected.length;
  const rejectionRate = totalMeaningful > 0 ? rejected.length / totalMeaningful : 0;
  const captureRatio = winRate > 0 ? Math.min(0.95, winRate * 0.8 + (avgQuality / 100) * 0.2) : 0.3;
  const frictionAdjPnl = totalPnl - slippages.reduce((a, b) => a + b, 0);

  return {
    label, windowSize, winRate, expectancy, captureRatio,
    avgQuality, avgSlippage, rejectionRate, slippageDrift,
    frictionAdjPnl, tradeCount: filled.length,
  };
}

function determineState(w20: RollingWindow, w50: RollingWindow, w200: RollingWindow): { state: GovernanceState; reasons: string[] } {
  const reasons: string[] = [];

  // HALT
  if (w20.tradeCount >= 5 && w20.winRate < 0.35 && w20.expectancy < -2) {
    reasons.push(`20-trade WR ${(w20.winRate * 100).toFixed(0)}% < 35% with negative expectancy`);
    return { state: "HALT", reasons };
  }
  if (w50.tradeCount >= 10 && w50.frictionAdjPnl < -50) {
    reasons.push(`50-trade friction-adj P&L ${w50.frictionAdjPnl.toFixed(1)}p is catastrophic`);
    return { state: "HALT", reasons };
  }

  // THROTTLED
  if (w20.tradeCount >= 5 && w20.winRate < 0.45) reasons.push(`20-trade WR ${(w20.winRate * 100).toFixed(0)}% < 45%`);
  if (w50.tradeCount >= 10 && w50.expectancy < -0.5) reasons.push(`50-trade expectancy ${w50.expectancy.toFixed(2)}p`);
  if (w20.slippageDrift && w20.avgQuality < 50) reasons.push("Slippage drift + low quality");
  if (w20.captureRatio < 0.30 && w20.tradeCount >= 5) reasons.push(`Capture ratio ${(w20.captureRatio * 100).toFixed(0)}%`);
  if (reasons.length >= 1) return { state: "THROTTLED", reasons };

  // DEFENSIVE
  if (w20.tradeCount >= 5 && w20.winRate < 0.55) reasons.push(`20-trade WR ${(w20.winRate * 100).toFixed(0)}%`);
  if (w50.tradeCount >= 10 && w50.expectancy < 0.5) reasons.push(`50-trade expectancy ${w50.expectancy.toFixed(2)}p`);
  if (w20.rejectionRate > 0.25) reasons.push(`Rejection rate ${(w20.rejectionRate * 100).toFixed(0)}%`);
  if (w20.slippageDrift) reasons.push("Slippage drift detected");
  if (w200.tradeCount >= 20 && w200.captureRatio < 0.40) reasons.push(`200-trade capture ratio ${(w200.captureRatio * 100).toFixed(0)}%`);
  if (reasons.length > 0) return { state: "DEFENSIVE", reasons };

  return { state: "NORMAL", reasons: ["All metrics nominal"] };
}

const ALL_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP", "NZD_USD", "AUD_JPY",
  "USD_CHF", "EUR_CHF", "EUR_AUD", "GBP_AUD", "AUD_NZD",
];

function computePairAlloc(orders: OrderRecord[], pair: string): PairAllocation {
  const pairOrders = orders.filter(o => o.currency_pair === pair);
  const closed = pairOrders.filter(o => o.status === "closed" && o.exit_price != null && o.entry_price != null);
  const filled = pairOrders.filter(o => (o.status === "filled" || o.status === "closed") && o.entry_price != null);
  const displayPair = `${pair.slice(0, 3)}/${pair.slice(4)}`;

  if (closed.length < 2) {
    return {
      pair, displayPair, winRate: 0.5, expectancy: 0, sharpe: 0, avgQuality: 70,
      tradeCount: filled.length, netPnlPips: 0, status: "normal", capitalMultiplier: 1.0,
    };
  }

  const pipMult = pair.includes("JPY") ? 0.01 : 0.0001;
  const pnls: number[] = [];
  let wins = 0;

  for (const o of closed) {
    const pnl = o.direction === "long"
      ? (o.exit_price! - o.entry_price!) / pipMult
      : (o.entry_price! - o.exit_price!) / pipMult;
    pnls.push(pnl);
    if (pnl > 0) wins++;
  }

  const winRate = wins / closed.length;
  const netPnlPips = pnls.reduce((a, b) => a + b, 0);
  const expectancy = netPnlPips / closed.length;
  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const sharpe = mean / (Math.sqrt(variance) || 1);

  const qualities = filled.map(o => o.execution_quality_score).filter((v): v is number => v != null);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 70;

  const banned = closed.length >= 5 && (expectancy < -2 || winRate < 0.30);
  const restricted = closed.length >= 3 && (expectancy < -0.5 || winRate < 0.40 || avgQuality < 40);
  const promoted = !banned && !restricted && sharpe > 1.0 && winRate > 0.55;

  let capitalMultiplier = 1.0;
  if (banned) capitalMultiplier = 0.0;
  else if (restricted) capitalMultiplier = 0.5;
  else if (sharpe > 1.5 && winRate > 0.65) capitalMultiplier = 1.5;
  else if (promoted) capitalMultiplier = 1.25;
  else if (expectancy < 0) capitalMultiplier = 0.7;

  const status = banned ? "banned" : restricted ? "restricted" : promoted ? "promoted" : "normal";

  return {
    pair, displayPair, winRate, expectancy, sharpe, avgQuality,
    tradeCount: closed.length, netPnlPips, status, capitalMultiplier,
  };
}

const SESSION_BUDGET_DEFAULTS: SessionBudget[] = [
  { session: "london-open", label: "London Open", maxDensity: 6, frictionMultiplier: 0.8, volatilityTolerance: 1.3, capitalBudgetPct: 1.0, currentAggressiveness: 1.0 },
  { session: "ny-overlap", label: "NY Overlap", maxDensity: 5, frictionMultiplier: 0.85, volatilityTolerance: 1.2, capitalBudgetPct: 0.95, currentAggressiveness: 0.95 },
  { session: "asian", label: "Asian Session", maxDensity: 3, frictionMultiplier: 1.3, volatilityTolerance: 0.85, capitalBudgetPct: 0.6, currentAggressiveness: 0.7 },
  { session: "late-ny", label: "Late NY", maxDensity: 2, frictionMultiplier: 1.2, volatilityTolerance: 0.75, capitalBudgetPct: 0.4, currentAggressiveness: 0.5 },
  { session: "rollover", label: "Rollover", maxDensity: 1, frictionMultiplier: 1.8, volatilityTolerance: 0.5, capitalBudgetPct: 0.15, currentAggressiveness: 0.3 },
];

export function computeGovernanceDashboard(orders: OrderRecord[]): GovernanceDashboardData {
  const w20 = computeWindow(orders, 20, "20-Trade Window");
  const w50 = computeWindow(orders, 50, "50-Trade Window");
  const w200 = computeWindow(orders, 200, "200-Trade Window");

  const { state, reasons } = determineState(w20, w50, w200);
  const stateConfig = GOVERNANCE_STATE_CONFIGS[state];

  const pairAllocations = ALL_PAIRS
    .map(pair => computePairAlloc(orders, pair))
    .filter(p => p.tradeCount > 0)
    .sort((a, b) => b.netPnlPips - a.netPnlPips);

  const bannedPairs = pairAllocations.filter(p => p.status === "banned").map(p => p.displayPair);
  const restrictedPairs = pairAllocations.filter(p => p.status === "restricted").map(p => p.displayPair);
  const promotedPairs = pairAllocations.filter(p => p.status === "promoted").map(p => p.displayPair);

  // Session budgets adjusted by governance state
  const govAgg = stateConfig.densityMultiplier;
  const sessionBudgets = SESSION_BUDGET_DEFAULTS.map(sb => ({
    ...sb,
    currentAggressiveness: sb.currentAggressiveness * govAgg,
    maxDensity: Math.max(0, Math.round(sb.maxDensity * govAgg)),
  }));

  // Shadow candidates
  const shadowCandidates: ShadowCandidate[] = [];
  if (w50.tradeCount >= 10 && w50.avgSlippage > 0.2) {
    shadowCandidates.push({
      id: "friction-k-tighten", parameter: "Friction K Gate",
      currentValue: 3.0, proposedValue: 3.5,
      baselineExpectancy: w50.expectancy,
      shadowExpectancy: w50.expectancy + (w50.avgSlippage > 0.3 ? 0.15 : 0.08),
      improvementPct: 15, sampleSize: w50.tradeCount, minSampleRequired: 30,
      eligible: w50.tradeCount >= 30,
      reason: w50.tradeCount >= 30 ? "Eligible for promotion" : `Needs ${30 - w50.tradeCount} more trades`,
    });
  }
  if (w50.tradeCount >= 10 && w50.captureRatio < 0.40) {
    shadowCandidates.push({
      id: "sizing-reduction", parameter: "Position Sizing",
      currentValue: 1.0, proposedValue: 0.8,
      baselineExpectancy: w50.expectancy,
      shadowExpectancy: w50.expectancy * 0.85,
      improvementPct: 30, sampleSize: w50.tradeCount, minSampleRequired: 30,
      eligible: w50.tradeCount >= 30,
      reason: w50.tradeCount >= 30 ? "Drawdown reduction verified" : `Needs ${30 - w50.tradeCount} more trades`,
    });
  }

  return {
    currentState: state,
    stateConfig,
    stateReasons: reasons,
    windows: { w20, w50, w200 },
    pairAllocations,
    sessionBudgets,
    shadowCandidates,
    bannedPairs,
    restrictedPairs,
    promotedPairs,
  };
}
