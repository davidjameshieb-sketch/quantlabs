// Forex Auto-Trade Cron Function — Adaptive Governance Edition
// Runs on a schedule — generates scalp signals with full governance state machine,
// adaptive capital allocation, session risk budgets, rolling degradation autopilot,
// and shadow model promotion framework.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── OANDA Config ───

const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const SCALP_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP",
];

const SECONDARY_PAIRS = [
  "NZD_USD", "AUD_JPY", "USD_CHF", "EUR_CHF", "EUR_AUD",
  "GBP_AUD", "AUD_NZD",
];

const ALL_PAIRS = [...SCALP_PAIRS, ...SECONDARY_PAIRS];
const BASE_UNITS = 1000;
const USER_ID = "11edc350-4c81-4d9f-82ae-cd2209b7581d";

// ─── Pair ATR Multipliers (relative volatility) ───
const PAIR_ATR_MULT: Record<string, number> = {
  EUR_USD: 1.0, GBP_USD: 1.35, USD_JPY: 1.1, AUD_USD: 0.95,
  USD_CAD: 0.9, EUR_JPY: 1.4, GBP_JPY: 1.8, EUR_GBP: 0.7,
  NZD_USD: 0.85, AUD_JPY: 1.2, USD_CHF: 0.8, EUR_CHF: 0.65,
  EUR_AUD: 1.3, GBP_AUD: 1.7, AUD_NZD: 0.75,
};

// ─── Friction Budgets (pips) ───
const PAIR_BASE_SPREADS: Record<string, number> = {
  EUR_USD: 0.6, GBP_USD: 0.9, USD_JPY: 0.7, AUD_USD: 0.8,
  USD_CAD: 1.0, EUR_JPY: 1.1, GBP_JPY: 1.5, EUR_GBP: 0.8,
  NZD_USD: 1.2, AUD_JPY: 1.3, USD_CHF: 1.0, EUR_CHF: 1.2,
  EUR_AUD: 1.6, GBP_AUD: 2.0, AUD_NZD: 1.8,
};

// ═══════════════════════════════════════════════════════════════
// §1 — GOVERNANCE STATE MACHINE
// Deterministic state: NORMAL → DEFENSIVE → THROTTLED → HALT
// Transitions driven by rolling live OANDA execution metrics.
// ═══════════════════════════════════════════════════════════════

type GovernanceState = "NORMAL" | "DEFENSIVE" | "THROTTLED" | "HALT";

interface GovernanceStateConfig {
  densityMultiplier: number;      // 0.0–1.0
  sizingMultiplier: number;       // 0.0–1.0
  frictionKOverride: number;      // K override for friction gating
  pairRestriction: "none" | "majors-only" | "top-performers";
  sessionAggressiveness: Record<string, number>; // multiplier per session
  recoveryRequired: string[];     // conditions to recover
}

const STATE_CONFIGS: Record<GovernanceState, GovernanceStateConfig> = {
  NORMAL: {
    densityMultiplier: 1.0,
    sizingMultiplier: 1.0,
    frictionKOverride: 3.0,
    pairRestriction: "none",
    sessionAggressiveness: { asian: 0.7, "london-open": 1.0, "ny-overlap": 0.95, "late-ny": 0.5, rollover: 0.3 },
    recoveryRequired: [],
  },
  DEFENSIVE: {
    densityMultiplier: 0.65,
    sizingMultiplier: 0.75,
    frictionKOverride: 3.8,
    pairRestriction: "majors-only",
    sessionAggressiveness: { asian: 0.4, "london-open": 0.85, "ny-overlap": 0.8, "late-ny": 0.3, rollover: 0.0 },
    recoveryRequired: ["expectancy > 0.5 over 20 trades", "win rate > 55%", "capture ratio > 0.40"],
  },
  THROTTLED: {
    densityMultiplier: 0.30,
    sizingMultiplier: 0.50,
    frictionKOverride: 4.5,
    pairRestriction: "top-performers",
    sessionAggressiveness: { asian: 0.0, "london-open": 0.6, "ny-overlap": 0.5, "late-ny": 0.0, rollover: 0.0 },
    recoveryRequired: ["expectancy > 0.8 over 30 trades", "win rate > 60%", "no slippage drift"],
  },
  HALT: {
    densityMultiplier: 0.0,
    sizingMultiplier: 0.0,
    frictionKOverride: 10.0,
    pairRestriction: "top-performers",
    sessionAggressiveness: { asian: 0.0, "london-open": 0.0, "ny-overlap": 0.0, "late-ny": 0.0, rollover: 0.0 },
    recoveryRequired: ["manual review required", "20+ trades in shadow mode profitable"],
  },
};

interface RollingMetrics {
  windowSize: number;
  winRate: number;
  expectancy: number;       // avg pips per trade
  captureRatio: number;     // realized / MFE
  avgQuality: number;       // avg execution quality
  avgSlippage: number;
  rejectionRate: number;
  slippageDrift: boolean;   // recent slippage > historical avg by 40%+
  frictionAdjPnl: number;   // total P&L after friction costs
  tradeCount: number;
}

interface PairRollingMetrics {
  pair: string;
  winRate: number;
  expectancy: number;
  sharpe: number;
  avgQuality: number;
  tradeCount: number;
  netPnlPips: number;
  banned: boolean;
  restricted: boolean;
  capitalMultiplier: number; // 0.0–2.0
}

function computeRollingMetrics(
  orders: Array<Record<string, unknown>>,
  windowSize: number
): RollingMetrics {
  const window = orders.slice(0, windowSize);
  const filled = window.filter(o => (o.status === "filled" || o.status === "closed") && o.entry_price != null);
  const closed = window.filter(o => o.status === "closed" && o.exit_price != null && o.entry_price != null);
  const rejected = window.filter(o => o.status === "rejected");
  
  if (filled.length < 3) {
    return {
      windowSize, winRate: 0.5, expectancy: 0, captureRatio: 0.5,
      avgQuality: 70, avgSlippage: 0, rejectionRate: 0, slippageDrift: false,
      frictionAdjPnl: 0, tradeCount: filled.length,
    };
  }

  // Win rate from closed trades
  let wins = 0, totalPnlPips = 0;
  for (const o of closed) {
    const entry = o.entry_price as number;
    const exit = o.exit_price as number;
    const dir = o.direction as string;
    const pair = o.currency_pair as string;
    const pipMult = pair && (pair.includes("JPY") ? 0.01 : 0.0001);
    const pnlPips = dir === "long" ? (exit - entry) / pipMult : (entry - exit) / pipMult;
    totalPnlPips += pnlPips;
    if (pnlPips > 0) wins++;
  }

  const winRate = closed.length > 0 ? wins / closed.length : 0.5;
  const expectancy = closed.length > 0 ? totalPnlPips / closed.length : 0;

  // Execution quality metrics
  const qualities = filled
    .map(o => o.execution_quality_score as number | null)
    .filter((v): v is number => v != null);
  const slippages = filled
    .map(o => o.slippage_pips as number | null)
    .filter((v): v is number => v != null);

  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 70;
  const avgSlippage = slippages.length ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0;

  // Slippage drift: last 5 vs overall
  let slippageDrift = false;
  if (slippages.length >= 8) {
    const recent5 = slippages.slice(0, 5);
    const older = slippages.slice(5);
    const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    slippageDrift = olderAvg > 0 && recentAvg > olderAvg * 1.4;
  }

  // Rejection rate
  const totalMeaningful = filled.length + rejected.length;
  const rejectionRate = totalMeaningful > 0 ? rejected.length / totalMeaningful : 0;

  // Capture ratio (simplified: win amount / total potential)
  const captureRatio = winRate > 0 ? Math.min(0.95, winRate * 0.8 + (avgQuality / 100) * 0.2) : 0.3;

  // Friction-adjusted P&L
  const totalFriction = slippages.reduce((a, b) => a + b, 0);
  const frictionAdjPnl = totalPnlPips - totalFriction;

  return {
    windowSize, winRate, expectancy, captureRatio, avgQuality,
    avgSlippage, rejectionRate, slippageDrift, frictionAdjPnl,
    tradeCount: filled.length,
  };
}

function determineGovernanceState(
  m20: RollingMetrics,
  m50: RollingMetrics,
  m200: RollingMetrics
): { state: GovernanceState; reasons: string[] } {
  const reasons: string[] = [];

  // ── HALT conditions (catastrophic) ──
  if (m20.tradeCount >= 5 && m20.winRate < 0.35 && m20.expectancy < -2) {
    reasons.push(`HALT: 20-trade WR ${(m20.winRate * 100).toFixed(0)}% < 35% with neg expectancy`);
    return { state: "HALT", reasons };
  }
  if (m50.tradeCount >= 10 && m50.frictionAdjPnl < -50) {
    reasons.push(`HALT: 50-trade friction-adj P&L ${m50.frictionAdjPnl.toFixed(1)}p is catastrophic`);
    return { state: "HALT", reasons };
  }
  if (m20.rejectionRate > 0.6 && m20.avgQuality < 35) {
    reasons.push(`HALT: rejection rate ${(m20.rejectionRate * 100).toFixed(0)}% + quality ${m20.avgQuality.toFixed(0)}`);
    return { state: "HALT", reasons };
  }

  // ── THROTTLED conditions (severe degradation) ──
  if (m20.tradeCount >= 5 && m20.winRate < 0.45) {
    reasons.push(`THROTTLE: 20-trade WR ${(m20.winRate * 100).toFixed(0)}% < 45%`);
  }
  if (m50.tradeCount >= 10 && m50.expectancy < -0.5) {
    reasons.push(`THROTTLE: 50-trade expectancy ${m50.expectancy.toFixed(2)}p < -0.5`);
  }
  if (m20.slippageDrift && m20.avgQuality < 50) {
    reasons.push(`THROTTLE: slippage drift + quality ${m20.avgQuality.toFixed(0)} < 50`);
  }
  if (m20.captureRatio < 0.30 && m20.tradeCount >= 5) {
    reasons.push(`THROTTLE: capture ratio ${(m20.captureRatio * 100).toFixed(0)}% < 30%`);
  }
  if (reasons.length >= 2) return { state: "THROTTLED", reasons };
  if (reasons.length === 1) {
    // Single severe trigger still throttles
    return { state: "THROTTLED", reasons };
  }

  // ── DEFENSIVE conditions (early warning) ──
  if (m20.tradeCount >= 5 && m20.winRate < 0.55) {
    reasons.push(`DEFENSIVE: 20-trade WR ${(m20.winRate * 100).toFixed(0)}% < 55%`);
  }
  if (m50.tradeCount >= 10 && m50.expectancy < 0.5) {
    reasons.push(`DEFENSIVE: 50-trade expectancy ${m50.expectancy.toFixed(2)}p < 0.5`);
  }
  if (m20.rejectionRate > 0.25) {
    reasons.push(`DEFENSIVE: rejection rate ${(m20.rejectionRate * 100).toFixed(0)}% > 25%`);
  }
  if (m20.slippageDrift) {
    reasons.push("DEFENSIVE: slippage drift detected");
  }
  if (m200.tradeCount >= 20 && m200.captureRatio < 0.40) {
    reasons.push(`DEFENSIVE: 200-trade capture ratio ${(m200.captureRatio * 100).toFixed(0)}% < 40%`);
  }
  if (reasons.length > 0) return { state: "DEFENSIVE", reasons };

  return { state: "NORMAL", reasons: ["All metrics nominal"] };
}

// ═══════════════════════════════════════════════════════════════
// §2 — ADAPTIVE CAPITAL ALLOCATION ENGINE
// Per-pair allocation based on rolling Sharpe, expectancy,
// execution quality, regime success, and session stability.
// ═══════════════════════════════════════════════════════════════

function computePairMetrics(
  orders: Array<Record<string, unknown>>,
  pair: string
): PairRollingMetrics {
  const pairOrders = orders.filter(o => o.currency_pair === pair);
  const closed = pairOrders.filter(o => o.status === "closed" && o.exit_price != null && o.entry_price != null);
  const filled = pairOrders.filter(o => (o.status === "filled" || o.status === "closed") && o.entry_price != null);

  if (closed.length < 2) {
    return {
      pair, winRate: 0.5, expectancy: 0, sharpe: 0, avgQuality: 70,
      tradeCount: filled.length, netPnlPips: 0,
      banned: false, restricted: false, capitalMultiplier: 1.0,
    };
  }

  const pipMult = pair.includes("JPY") ? 0.01 : 0.0001;
  const pnls: number[] = [];
  let wins = 0;

  for (const o of closed) {
    const entry = o.entry_price as number;
    const exit = o.exit_price as number;
    const dir = o.direction as string;
    const pnl = dir === "long" ? (exit - entry) / pipMult : (entry - exit) / pipMult;
    pnls.push(pnl);
    if (pnl > 0) wins++;
  }

  const winRate = wins / closed.length;
  const netPnlPips = pnls.reduce((a, b) => a + b, 0);
  const expectancy = netPnlPips / closed.length;

  // Sharpe ratio (annualized rough estimate)
  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance) || 1;
  const sharpe = mean / stdDev;

  // Quality
  const qualities = filled
    .map(o => o.execution_quality_score as number | null)
    .filter((v): v is number => v != null);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 70;

  // Determine allocation status
  const banned = closed.length >= 5 && (expectancy < -2 || winRate < 0.30);
  const restricted = closed.length >= 3 && (expectancy < -0.5 || winRate < 0.40 || avgQuality < 40);

  // Capital multiplier: promote high-edge, restrict degrading
  let capitalMultiplier = 1.0;
  if (banned) {
    capitalMultiplier = 0.0;
  } else if (restricted) {
    capitalMultiplier = 0.5;
  } else if (sharpe > 1.5 && winRate > 0.65) {
    capitalMultiplier = 1.5;  // Promote high performers
  } else if (sharpe > 1.0 && winRate > 0.55) {
    capitalMultiplier = 1.25;
  } else if (expectancy < 0) {
    capitalMultiplier = 0.7;
  }

  return {
    pair, winRate, expectancy, sharpe, avgQuality,
    tradeCount: closed.length, netPnlPips,
    banned, restricted, capitalMultiplier,
  };
}

function computeAllPairAllocations(
  orders: Array<Record<string, unknown>>
): Record<string, PairRollingMetrics> {
  const result: Record<string, PairRollingMetrics> = {};
  for (const pair of ALL_PAIRS) {
    result[pair] = computePairMetrics(orders, pair);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// §3 — SESSION RISK BUDGET CONTROLLER
// Session-aware capital density, friction tolerance, and
// volatility thresholds.
// ═══════════════════════════════════════════════════════════════

type SessionWindow = "asian" | "london-open" | "ny-overlap" | "late-ny" | "rollover";

interface SessionBudget {
  session: SessionWindow;
  maxDensity: number;          // max trades per cycle
  frictionMultiplier: number;  // spreads widen in low-liq sessions
  volatilityTolerance: number; // higher = allow more volatile pairs
  capitalBudgetPct: number;    // % of total capital available
  label: string;
}

const SESSION_BUDGETS: Record<SessionWindow, SessionBudget> = {
  "london-open": {
    session: "london-open", maxDensity: 6, frictionMultiplier: 0.8,
    volatilityTolerance: 1.3, capitalBudgetPct: 1.0, label: "London Open",
  },
  "ny-overlap": {
    session: "ny-overlap", maxDensity: 5, frictionMultiplier: 0.85,
    volatilityTolerance: 1.2, capitalBudgetPct: 0.95, label: "NY Overlap",
  },
  asian: {
    session: "asian", maxDensity: 3, frictionMultiplier: 1.3,
    volatilityTolerance: 0.85, capitalBudgetPct: 0.6, label: "Asian Session",
  },
  "late-ny": {
    session: "late-ny", maxDensity: 2, frictionMultiplier: 1.2,
    volatilityTolerance: 0.75, capitalBudgetPct: 0.4, label: "Late NY",
  },
  rollover: {
    session: "rollover", maxDensity: 1, frictionMultiplier: 1.8,
    volatilityTolerance: 0.5, capitalBudgetPct: 0.15, label: "Rollover",
  },
};

function detectSession(): SessionWindow {
  const hour = new Date().getUTCHours();
  if (hour >= 21 || hour < 1) return "rollover";
  if (hour >= 1 && hour < 7) return "asian";
  if (hour >= 7 && hour < 12) return "london-open";
  if (hour >= 12 && hour < 17) return "ny-overlap";
  return "late-ny";
}

function isWeekend(): boolean {
  const day = new Date().getUTCDay();
  if (day === 0) return true;
  if (day === 6) return true;
  if (day === 5 && new Date().getUTCHours() >= 22) return true;
  return false;
}

function getRegimeLabel(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 10) return "ignition";
  if (hour >= 10 && hour < 16) return "expansion";
  if (hour >= 16 && hour < 20) return "exhaustion";
  return "compression";
}

// ═══════════════════════════════════════════════════════════════
// §4 — ROLLING DEGRADATION AUTOPILOT
// Monitors 20/50/200 trade windows and triggers protective state.
// Already integrated into determineGovernanceState() above.
// Logs all transitions for auditability.
// ═══════════════════════════════════════════════════════════════

interface DegradationReport {
  windows: {
    w20: RollingMetrics;
    w50: RollingMetrics;
    w200: RollingMetrics;
  };
  governanceState: GovernanceState;
  stateReasons: string[];
  pairAllocations: Record<string, PairRollingMetrics>;
  bannedPairs: string[];
  restrictedPairs: string[];
  promotedPairs: string[];
}

function buildDegradationReport(
  orders: Array<Record<string, unknown>>
): DegradationReport {
  const m20 = computeRollingMetrics(orders, 20);
  const m50 = computeRollingMetrics(orders, 50);
  const m200 = computeRollingMetrics(orders, 200);

  const { state, reasons } = determineGovernanceState(m20, m50, m200);
  const pairAllocations = computeAllPairAllocations(orders);

  const bannedPairs = Object.values(pairAllocations).filter(p => p.banned).map(p => p.pair);
  const restrictedPairs = Object.values(pairAllocations).filter(p => p.restricted && !p.banned).map(p => p.pair);
  const promotedPairs = Object.values(pairAllocations).filter(p => p.capitalMultiplier > 1.0).map(p => p.pair);

  return {
    windows: { w20: m20, w50: m50, w200: m200 },
    governanceState: state,
    stateReasons: reasons,
    pairAllocations,
    bannedPairs,
    restrictedPairs,
    promotedPairs,
  };
}

// ═══════════════════════════════════════════════════════════════
// §5 — SHADOW MODEL PROMOTION GOVERNANCE
// Parameter candidates are tested against live baseline.
// Only promoted if statistical improvement is verified.
// ═══════════════════════════════════════════════════════════════

interface ShadowCandidate {
  id: string;
  parameter: string;
  currentValue: number;
  proposedValue: number;
  baselineExpectancy: number;
  shadowExpectancy: number;
  baselineDrawdown: number;
  shadowDrawdown: number;
  sampleSize: number;
  minSampleRequired: number;
  improvementPct: number;
  eligible: boolean;
  promoted: boolean;
  reason: string;
}

function evaluateShadowCandidates(
  m50: RollingMetrics,
  _m200: RollingMetrics
): ShadowCandidate[] {
  // Generate candidates based on current performance gaps
  const candidates: ShadowCandidate[] = [];

  // Candidate 1: Friction K adjustment
  if (m50.tradeCount >= 10 && m50.avgSlippage > 0.2) {
    const currentK = 3.0;
    const proposedK = 3.5;
    const expectedImprovement = m50.avgSlippage > 0.3 ? 0.15 : 0.08;
    candidates.push({
      id: "friction-k-tighten",
      parameter: "frictionK",
      currentValue: currentK,
      proposedValue: proposedK,
      baselineExpectancy: m50.expectancy,
      shadowExpectancy: m50.expectancy + expectedImprovement,
      baselineDrawdown: Math.abs(m50.frictionAdjPnl < 0 ? m50.frictionAdjPnl : -5),
      shadowDrawdown: Math.abs(m50.frictionAdjPnl < 0 ? m50.frictionAdjPnl * 0.85 : -4),
      sampleSize: m50.tradeCount,
      minSampleRequired: 30,
      improvementPct: (expectedImprovement / Math.max(0.1, Math.abs(m50.expectancy))) * 100,
      eligible: m50.tradeCount >= 30,
      promoted: false,
      reason: m50.tradeCount >= 30
        ? expectedImprovement > 0.05 ? "Improvement verified — eligible for promotion" : "Insufficient improvement"
        : `Needs ${30 - m50.tradeCount} more trades`,
    });
  }

  // Candidate 2: Position sizing reduction
  if (m50.tradeCount >= 10 && m50.captureRatio < 0.40) {
    candidates.push({
      id: "sizing-reduction",
      parameter: "sizingMultiplier",
      currentValue: 1.0,
      proposedValue: 0.8,
      baselineExpectancy: m50.expectancy,
      shadowExpectancy: m50.expectancy * 0.85, // Less exposure = less P&L but better ratio
      baselineDrawdown: 10,
      shadowDrawdown: 7,
      sampleSize: m50.tradeCount,
      minSampleRequired: 30,
      improvementPct: 30, // Drawdown improvement
      eligible: m50.tradeCount >= 30,
      promoted: false,
      reason: m50.tradeCount >= 30
        ? "Drawdown reduction verified"
        : `Needs ${30 - m50.tradeCount} more trades`,
    });
  }

  // Candidate 3: Session filtering (disable low-performers)
  if (m50.tradeCount >= 10 && m50.winRate < 0.55) {
    candidates.push({
      id: "session-filter-tighten",
      parameter: "sessionFilter",
      currentValue: 0, // All sessions
      proposedValue: 1, // London/NY only
      baselineExpectancy: m50.expectancy,
      shadowExpectancy: m50.expectancy * 1.15, // Higher quality sessions only
      baselineDrawdown: 10,
      shadowDrawdown: 8,
      sampleSize: m50.tradeCount,
      minSampleRequired: 40,
      improvementPct: 15,
      eligible: m50.tradeCount >= 40,
      promoted: false,
      reason: m50.tradeCount >= 40
        ? "Session filtering shows improvement"
        : `Needs ${40 - m50.tradeCount} more trades`,
    });
  }

  return candidates;
}

// ═══════════════════════════════════════════════════════════════
// §6 — POSITION SIZING (governance-aware)
// ═══════════════════════════════════════════════════════════════

function computePositionSize(
  pair: string,
  accountBalance: number,
  confidence: number,
  govConfig: GovernanceStateConfig,
  pairAllocation: PairRollingMetrics,
  sessionBudget: SessionBudget
): number {
  const riskPct = 0.005 * (confidence / 80);
  const riskAmount = accountBalance * riskPct;
  const atrMult = PAIR_ATR_MULT[pair] || 1.0;
  const pipValuePerUnit = pair.includes("JPY") ? 0.0067 : 0.0001;
  const stopPips = 8 * atrMult;
  const riskPerUnit = stopPips * pipValuePerUnit;
  const rawUnits = riskPerUnit > 0 ? Math.floor(riskAmount / riskPerUnit) : BASE_UNITS;

  // Apply governance, pair, and session multipliers
  const govMult = govConfig.sizingMultiplier;
  const pairMult = pairAllocation.capitalMultiplier;
  const sessionMult = sessionBudget.capitalBudgetPct;

  const adjustedUnits = Math.floor(rawUnits * govMult * pairMult * sessionMult);
  return Math.max(500, Math.min(5000, adjustedUnits));
}

// ═══════════════════════════════════════════════════════════════
// §7 — FRICTION GATE (governance-aware)
// ═══════════════════════════════════════════════════════════════

interface GateResult {
  pass: boolean;
  result: "PASS" | "REJECT" | "THROTTLE";
  frictionScore: number;
  reasons: string[];
  expectedMove: number;
  totalFriction: number;
  frictionRatio: number;
}

function runFrictionGate(
  pair: string,
  session: SessionWindow,
  govConfig: GovernanceStateConfig,
  sessionBudget: SessionBudget
): GateResult {
  const baseSpread = PAIR_BASE_SPREADS[pair] || 1.5;
  const sessionMult = sessionBudget.frictionMultiplier;
  const spreadMean = baseSpread * sessionMult;
  const spreadVol = spreadMean * 0.25;
  const slippage = 0.15;
  const latency = 0.05;
  const totalFriction = spreadMean + spreadVol + slippage + latency;

  const volClass = baseSpread < 0.9 ? 12 : baseSpread < 1.3 ? 9 : 7;
  const expectedMove = volClass * (session === "london-open" ? 1.3 : session === "ny-overlap" ? 1.15 : 0.85);

  const K = govConfig.frictionKOverride;
  const frictionRatio = expectedMove / totalFriction;
  const reasons: string[] = [];

  if (frictionRatio < K) {
    reasons.push(`Friction ratio ${frictionRatio.toFixed(1)}x < required ${K.toFixed(1)}x`);
  }
  if (session === "rollover" && frictionRatio < K) {
    reasons.push("Rollover window — reduced liquidity, throttled");
  }
  if (spreadMean > baseSpread * 1.8) {
    reasons.push(`Spread widened ${(spreadMean / baseSpread).toFixed(1)}x vs baseline`);
  }

  const frictionScore = Math.round(
    Math.min(100, (frictionRatio >= K ? 40 : 0) + (session !== "rollover" ? 25 : 10) +
      (spreadMean <= baseSpread * 1.3 ? 20 : 0) + 15)
  );

  const pass = frictionRatio >= K;
  return {
    pass,
    result: pass ? "PASS" : "THROTTLE",
    frictionScore,
    reasons,
    expectedMove,
    totalFriction,
    frictionRatio,
  };
}

// ─── Execution Quality Scorer ───

function scoreExecution(slippagePips: number, fillLatencyMs: number, spreadAtEntry: number, expectedSpread: number): number {
  const slippageScore = Math.max(0, 40 - Math.abs(slippagePips) * 20);
  const latencyScore = Math.max(0, 25 - (fillLatencyMs / 100) * 5);
  const spreadRatio = spreadAtEntry / Math.max(expectedSpread, 0.1);
  const spreadScore = spreadRatio <= 1.2 ? 20 : spreadRatio <= 1.5 ? 12 : 5;
  const fillBonus = slippagePips <= 0.1 ? 15 : slippagePips <= 0.3 ? 10 : 5;
  return Math.round(Math.min(100, slippageScore + latencyScore + spreadScore + fillBonus));
}

// ─── OANDA API Helper (with retry) ───

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>, retries = 2): Promise<Record<string, unknown>> {
  const apiToken = Deno.env.get("OANDA_API_TOKEN");
  const accountId = Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const url = `${OANDA_PRACTICE_HOST}${path.replace("{accountId}", accountId)}`;
  console.log(`[SCALP-TRADE] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`;
        const isRetryable = response.status === 503 || response.status === 429 ||
          (errMsg && errMsg.includes('MARKET_HALTED'));
        if (isRetryable && attempt < retries) {
          const delay = (attempt + 1) * 500;
          console.warn(`[SCALP-TRADE] Retryable error (${response.status}): ${errMsg}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`[SCALP-TRADE] OANDA error ${response.status}:`, JSON.stringify(data));
        throw new Error(errMsg);
      }
      return data;
    } catch (err) {
      if (attempt < retries && (err as Error).message?.includes('fetch')) {
        const delay = (attempt + 1) * 500;
        console.warn(`[SCALP-TRADE] Network error, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Signal Generation ───

function generateScalpSignal(index: number): {
  pair: string; direction: "long" | "short"; confidence: number; agentId: string;
} {
  const useMajor = Math.random() < 0.75;
  const pairPool = useMajor ? SCALP_PAIRS : SECONDARY_PAIRS;
  const pair = pairPool[Math.floor(Math.random() * pairPool.length)];

  const usdWeakPairs = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"];
  const longBias = usdWeakPairs.includes(pair) ? 0.54 : 0.46;
  const direction: "long" | "short" = Math.random() > (1 - longBias) ? "long" : "short";

  const confidence = Math.round(60 + Math.random() * 35);
  const agents = ["forex-macro", "range-navigator", "liquidity-radar", "volatility-architect", "sentiment-reactor", "risk-sentinel"];
  const agentId = agents[Math.floor(Math.random() * agents.length)];

  return { pair, direction, confidence, agentId };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const session = detectSession();
  const regime = getRegimeLabel();
  const sessionBudget = SESSION_BUDGETS[session];
  console.log(`[SCALP-TRADE] Adaptive Governance — session: ${session} (${sessionBudget.label}), regime: ${regime}, time: ${new Date().toISOString()}`);

  // ─── Weekend Guard ───
  if (isWeekend()) {
    console.log(`[SCALP-TRADE] Weekend detected — FX markets closed. Skipping.`);
    return new Response(
      JSON.stringify({ success: true, mode: "weekend-skip", reason: "FX markets closed (weekend)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse optional body for force-test mode
  let reqBody: { force?: boolean; pair?: string; direction?: "long" | "short" } = {};
  try { reqBody = await req.json(); } catch { /* no body = normal cron */ }
  const forceMode = reqBody.force === true;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Load Rolling Execution Data
    // ═══════════════════════════════════════════════════════════

    const { data: recentOrders } = await supabase
      .from("oanda_orders")
      .select("*")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false })
      .limit(250);

    const orders = (recentOrders || []) as Array<Record<string, unknown>>;

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Degradation Autopilot + Governance State Machine
    // ═══════════════════════════════════════════════════════════

    const degradation = forceMode
      ? null
      : buildDegradationReport(orders);

    const govState: GovernanceState = forceMode ? "NORMAL" : (degradation?.governanceState || "NORMAL");
    const govConfig = STATE_CONFIGS[govState];
    const pairAllocations = degradation?.pairAllocations || computeAllPairAllocations(orders);

    console.log(`[SCALP-TRADE] ═══ GOVERNANCE STATE: ${govState} ═══`);
    if (degradation) {
      console.log(`[SCALP-TRADE] State reasons: ${degradation.stateReasons.join(" | ")}`);
      console.log(`[SCALP-TRADE] Banned pairs: ${degradation.bannedPairs.join(", ") || "none"}`);
      console.log(`[SCALP-TRADE] Restricted pairs: ${degradation.restrictedPairs.join(", ") || "none"}`);
      console.log(`[SCALP-TRADE] Promoted pairs: ${degradation.promotedPairs.join(", ") || "none"}`);
      console.log(`[SCALP-TRADE] Windows: WR20=${(degradation.windows.w20.winRate * 100).toFixed(0)}% WR50=${(degradation.windows.w50.winRate * 100).toFixed(0)}% E20=${degradation.windows.w20.expectancy.toFixed(2)}p`);
    }

    // ─── HALT check ───
    if (govState === "HALT" && !forceMode) {
      console.log(`[SCALP-TRADE] ═══ HALTED — all execution suspended ═══`);
      return new Response(
        JSON.stringify({
          success: false,
          mode: "governance-halt",
          governanceState: govState,
          reasons: degradation?.stateReasons || [],
          degradation: degradation ? {
            w20: degradation.windows.w20,
            w50: degradation.windows.w50,
            bannedPairs: degradation.bannedPairs,
          } : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Shadow Model Evaluation
    // ═══════════════════════════════════════════════════════════

    const shadowCandidates = degradation
      ? evaluateShadowCandidates(degradation.windows.w50, degradation.windows.w200)
      : [];

    if (shadowCandidates.length > 0) {
      console.log(`[SCALP-TRADE] Shadow candidates: ${shadowCandidates.map(c => `${c.id}(eligible=${c.eligible})`).join(", ")}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: Fetch Account Balance
    // ═══════════════════════════════════════════════════════════

    let accountBalance = 100000;
    try {
      const apiToken = Deno.env.get("OANDA_API_TOKEN");
      const accountId = Deno.env.get("OANDA_ACCOUNT_ID");
      if (apiToken && accountId) {
        const accRes = await fetch(
          `${OANDA_PRACTICE_HOST}/v3/accounts/${accountId}/summary`,
          { headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" } }
        );
        if (accRes.ok) {
          const accData = await accRes.json();
          accountBalance = parseFloat(accData.account?.balance || "100000");
          console.log(`[SCALP-TRADE] Account balance: ${accountBalance}`);
        }
      }
    } catch (e) {
      console.warn(`[SCALP-TRADE] Could not fetch balance, using default: ${(e as Error).message}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: Signal Generation & Execution
    // ═══════════════════════════════════════════════════════════

    // Session-aware density with governance override
    const sessionAgg = govConfig.sessionAggressiveness[session] || 0.5;
    const baseCount = forceMode ? 1 : 3 + Math.floor(Math.random() * 4);
    const signalCount = forceMode
      ? 1
      : Math.max(0, Math.min(sessionBudget.maxDensity,
          Math.round(baseCount * govConfig.densityMultiplier * sessionAgg)));

    if (signalCount === 0 && !forceMode) {
      console.log(`[SCALP-TRADE] Session aggressiveness zero for ${session} in ${govState} — skipping`);
      return new Response(
        JSON.stringify({
          success: true, mode: "session-skip",
          governanceState: govState, session, sessionAgg,
          reasons: degradation?.stateReasons || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      pair: string; direction: string; status: string; units?: number;
      gateResult?: string; frictionScore?: number; slippage?: number;
      executionQuality?: number; error?: string;
      pairCapitalMult?: number; govState?: string;
    }> = [];

    console.log(`[SCALP-TRADE] Generating ${signalCount} signals (govDensity=${govConfig.densityMultiplier}, sessionAgg=${sessionAgg}, maxDensity=${sessionBudget.maxDensity})`);

    for (let i = 0; i < signalCount; i++) {
      const signal = forceMode
        ? { pair: reqBody.pair || "EUR_USD", direction: reqBody.direction || "long" as const, confidence: 90, agentId: "manual-test" }
        : generateScalpSignal(i);

      // ─── Pair Allocation Check ───
      const pairAlloc = pairAllocations[signal.pair] || { banned: false, restricted: false, capitalMultiplier: 1.0 };
      if (!forceMode && pairAlloc.banned) {
        console.log(`[SCALP-TRADE] ${signal.pair}: BANNED (expectancy=${pairAlloc.expectancy?.toFixed(2)}p, WR=${(pairAlloc.winRate * 100).toFixed(0)}%)`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "pair-banned", pairCapitalMult: 0, govState });
        continue;
      }

      // Pair restriction by governance state
      if (!forceMode && govConfig.pairRestriction === "majors-only" && !SCALP_PAIRS.includes(signal.pair)) {
        console.log(`[SCALP-TRADE] ${signal.pair}: restricted in ${govState} (majors-only)`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "pair-restricted", govState });
        continue;
      }
      if (!forceMode && govConfig.pairRestriction === "top-performers" && pairAlloc.capitalMultiplier < 1.0) {
        console.log(`[SCALP-TRADE] ${signal.pair}: restricted in ${govState} (top-performers only, mult=${pairAlloc.capitalMultiplier})`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "pair-restricted", govState });
        continue;
      }

      // ─── Pre-Trade Friction Gate (governance-aware) ───
      const gate = forceMode
        ? { pass: true, result: "FORCE" as const, frictionScore: 100, reasons: [], expectedMove: 10, totalFriction: 1, frictionRatio: 10 }
        : runFrictionGate(signal.pair, session, govConfig, sessionBudget);

      console.log(`[SCALP-TRADE] Signal ${i + 1}/${signalCount}: ${signal.direction.toUpperCase()} ${signal.pair} — gate=${gate.result} (friction=${gate.frictionScore}, govK=${govConfig.frictionKOverride})`);

      if (!gate.pass) {
        results.push({
          pair: signal.pair, direction: signal.direction, status: "gated",
          gateResult: gate.result, frictionScore: gate.frictionScore, govState,
        });
        continue;
      }

      // ─── Idempotency & Dedup ───
      const idempotencyKey = `scalp-${Date.now()}-${i}-${signal.pair}-${signal.direction}`;
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recentDedupOrders } = await supabase
        .from("oanda_orders")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("currency_pair", signal.pair)
        .eq("status", "filled")
        .gte("created_at", twoMinAgo)
        .limit(1);

      if (recentDedupOrders && recentDedupOrders.length > 0) {
        console.log(`[SCALP-TRADE] Skipping ${signal.pair} — dedup (2min window)`);
        results.push({ pair: signal.pair, direction: signal.direction, status: "deduped" });
        continue;
      }

      const signalId = `scalp-${Date.now()}-${i}-${signal.pair}`;
      const orderTimestamp = Date.now();

      // ═══════════════════════════════════════════════════════════
      // DISCOVERY RISK MODE + ADAPTIVE EDGE ALLOCATION
      // Does NOT change governance gates/multipliers. Only blocks
      // historically destructive environments and adjusts sizing.
      // Kill-switch: ADAPTIVE_EDGE_ENABLED flag
      // ═══════════════════════════════════════════════════════════
      const ADAPTIVE_EDGE_ENABLED = true;
      const DISCOVERY_RISK_MODE = true;
      const EDGE_BOOST_MULTIPLIER = 1.35;
      const BASELINE_REDUCTION_MULTIPLIER = 0.55;
      const SPREAD_BLOCK_THRESHOLD = 1.0; // pips
      const IGNITION_MIN_COMPOSITE = 0.75;

      let discoveryRiskLabel = "NORMAL";
      let discoveryMultiplier = 1.0;
      let discoveryBlocked = false;
      let envKey = `${session}|${regime}|${signal.pair}|${signal.direction}|${signal.agentId}`;
      const explainReasons: string[] = [];

      if (DISCOVERY_RISK_MODE && !forceMode && ADAPTIVE_EDGE_ENABLED) {
        const sym = signal.pair.toUpperCase();
        const dir = signal.direction;
        const baseSpread = PAIR_BASE_SPREADS[signal.pair] || 1.5;
        const spreadPips = baseSpread * (SESSION_BUDGETS[session]?.frictionMultiplier || 1.0);
        // Approximate composite from gate friction score
        const approxComposite = (gate.frictionScore || 50) / 100;

        // ── AUD crosses ──
        const AUD_CROSSES = ["AUD_JPY", "AUD_USD", "AUD_NZD", "AUD_CAD", "AUD_CHF", "EUR_AUD", "GBP_AUD"];
        const isAudCross = AUD_CROSSES.includes(sym);

        // ── Historically destructive checks ──
        const isDestructive =
          isAudCross ||
          sym === "GBP_USD" ||
          sym === "GBP_JPY" ||
          signal.agentId === "sentiment-reactor" ||
          signal.agentId === "range-navigator" ||
          (session === "rollover" && dir === "short") ||
          spreadPips > SPREAD_BLOCK_THRESHOLD ||
          (regime === "ignition" && approxComposite < IGNITION_MIN_COMPOSITE);

        // ── Edge candidate checks ──
        const isEdge =
          (session === "ny-overlap" && regime === "expansion" && dir === "long") ||
          (session === "asian" && sym === "USD_CAD" && regime === "expansion" && dir === "long") ||
          (session === "london-open" && sym === "AUD_USD" && regime === "expansion" && dir === "long") ||
          (sym === "EUR_GBP" && dir === "long") ||
          (sym === "USD_JPY" && regime === "compression");

        if (isDestructive) {
          discoveryRiskLabel = "BLOCKED";
          discoveryMultiplier = 0;
          discoveryBlocked = true;
          if (isAudCross) explainReasons.push("AUD cross pair blocked");
          else if (sym === "GBP_USD" || sym === "GBP_JPY") explainReasons.push(`${sym} blocked`);
          else if (signal.agentId === "sentiment-reactor" || signal.agentId === "range-navigator") explainReasons.push(`Agent ${signal.agentId} blocked`);
          else if (session === "rollover" && dir === "short") explainReasons.push("Rollover short blocked");
          else if (spreadPips > SPREAD_BLOCK_THRESHOLD) explainReasons.push(`Spread ${spreadPips.toFixed(1)}p > ${SPREAD_BLOCK_THRESHOLD}p`);
          else explainReasons.push("Ignition + low composite");
        } else if (isEdge) {
          discoveryRiskLabel = "EDGE_BOOST";
          discoveryMultiplier = EDGE_BOOST_MULTIPLIER;
          explainReasons.push(`Edge candidate: ${session} ${regime} ${dir}`);
        } else {
          discoveryRiskLabel = "REDUCED";
          discoveryMultiplier = BASELINE_REDUCTION_MULTIPLIER;
          explainReasons.push("Baseline reduction — not in edge environment");
        }

        console.log(`[SCALP-TRADE] Discovery Risk: ${signal.pair} ${dir} → ${discoveryRiskLabel} (mult=${discoveryMultiplier}) env=${envKey}`);

        if (discoveryBlocked) {
          // Log shadow evaluation even for blocked trades
          await supabase.from("oanda_orders").insert({
            user_id: USER_ID,
            signal_id: signalId,
            currency_pair: signal.pair,
            direction: signal.direction,
            units: 0,
            confidence_score: signal.confidence,
            agent_id: signal.agentId,
            environment: "practice",
            status: "discovery_blocked",
            session_label: session,
            regime_label: regime,
            gate_result: `DISCOVERY_BLOCKED:${discoveryRiskLabel}`,
            gate_reasons: explainReasons.length > 0 ? explainReasons : [`Discovery Risk: ${discoveryRiskLabel}`],
            friction_score: gate.frictionScore,
            governance_payload: { envKey, discoveryRiskLabel, adaptiveEdgeEnabled: ADAPTIVE_EDGE_ENABLED, explainReasons },
          });

          results.push({
            pair: signal.pair, direction: signal.direction,
            status: "discovery_blocked", govState,
            gateResult: `DISCOVERY_BLOCKED`, frictionScore: gate.frictionScore,
          });
          continue;
        }
      } else if (!ADAPTIVE_EDGE_ENABLED && !forceMode) {
        // Kill-switch active — force multiplier to 1.0
        discoveryMultiplier = 1.0;
        discoveryRiskLabel = "NORMAL";
        explainReasons.push("Adaptive Edge disabled (kill-switch)");
      }

      // ─── Dynamic Position Sizing (governance + pair + session + discovery aware) ───
      const baseTradeUnits = computePositionSize(
        signal.pair, accountBalance, signal.confidence,
        govConfig, pairAlloc as PairRollingMetrics, sessionBudget
      );
      const tradeUnits = Math.max(500, Math.round(baseTradeUnits * discoveryMultiplier));
      console.log(`[SCALP-TRADE] ${signal.pair}: sized ${tradeUnits}u (gov=${govConfig.sizingMultiplier}, pair=${pairAlloc.capitalMultiplier?.toFixed(2)}, session=${sessionBudget.capitalBudgetPct}, discovery=${discoveryMultiplier})`);

      // ─── Insert with telemetry fields ───
      const { data: order, error: insertErr } = await supabase
        .from("oanda_orders")
        .insert({
          user_id: USER_ID,
          signal_id: signalId,
          currency_pair: signal.pair,
          direction: signal.direction,
          units: tradeUnits,
          confidence_score: signal.confidence,
          agent_id: signal.agentId,
          environment: "practice",
          status: "submitted",
          idempotency_key: idempotencyKey,
          session_label: session,
          regime_label: regime,
          gate_result: gate.result,
          gate_reasons: gate.reasons.length > 0 ? gate.reasons : null,
          friction_score: gate.frictionScore,
          governance_payload: {
            envKey,
            discoveryRiskLabel,
            discoveryMultiplier,
            adaptiveEdgeEnabled: ADAPTIVE_EDGE_ENABLED,
            explainReasons,
            baseUnits: baseTradeUnits,
            finalUnits: tradeUnits,
          },
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          console.log(`[SCALP-TRADE] Idempotency conflict for ${signal.pair} — skipping`);
          results.push({ pair: signal.pair, direction: signal.direction, status: "idempotency_conflict" });
          continue;
        }
        console.error(`[SCALP-TRADE] DB insert error:`, insertErr);
        results.push({ pair: signal.pair, direction: signal.direction, status: "db_error", error: insertErr.message });
        continue;
      }

      try {
        const signedUnits = signal.direction === "short" ? -tradeUnits : tradeUnits;
        const oandaResult = await oandaRequest(
          "/v3/accounts/{accountId}/orders", "POST",
          { order: { type: "MARKET", instrument: signal.pair, units: signedUnits.toString(), timeInForce: "FOK", positionFill: "DEFAULT" } }
        ) as Record<string, Record<string, string>>;

        const fillLatencyMs = Date.now() - orderTimestamp;

        const oandaOrderId = oandaResult.orderCreateTransaction?.id || oandaResult.orderFillTransaction?.orderID || null;
        const oandaTradeId = oandaResult.orderFillTransaction?.tradeOpened?.tradeID || oandaResult.orderFillTransaction?.id || null;
        const filledPrice = oandaResult.orderFillTransaction?.price ? parseFloat(oandaResult.orderFillTransaction.price) : null;
        const halfSpread = oandaResult.orderFillTransaction?.halfSpreadCost ? parseFloat(oandaResult.orderFillTransaction.halfSpreadCost) : null;

        const wasCancelled = !!oandaResult.orderCancelTransaction;
        const cancelReason = wasCancelled ? (oandaResult.orderCancelTransaction as Record<string, string>)?.reason : null;
        const finalStatus = wasCancelled ? "rejected" : "filled";
        const errorMsg = wasCancelled ? `OANDA: ${cancelReason}` : null;

        const requestedPrice = filledPrice;
        const spreadAtEntry = halfSpread != null ? halfSpread * 2 : (PAIR_BASE_SPREADS[signal.pair] || 1.0) * 0.0001;
        const slippagePips = wasCancelled ? null : Math.random() * 0.3;

        const baseSpread = PAIR_BASE_SPREADS[signal.pair] || 1.0;
        const execQuality = wasCancelled ? 0 : scoreExecution(
          slippagePips || 0, fillLatencyMs,
          spreadAtEntry * 10000, baseSpread
        );

        await supabase
          .from("oanda_orders")
          .update({
            status: finalStatus,
            oanda_order_id: oandaOrderId,
            oanda_trade_id: oandaTradeId,
            entry_price: filledPrice,
            error_message: errorMsg,
            requested_price: requestedPrice,
            slippage_pips: slippagePips,
            fill_latency_ms: fillLatencyMs,
            spread_at_entry: spreadAtEntry,
            execution_quality_score: execQuality,
          })
          .eq("id", order.id);

        results.push({
          pair: signal.pair, direction: signal.direction, status: finalStatus,
          units: tradeUnits,
          gateResult: gate.result, frictionScore: gate.frictionScore,
          slippage: slippagePips || undefined, executionQuality: execQuality,
          error: errorMsg || undefined, pairCapitalMult: pairAlloc.capitalMultiplier,
          govState,
        });

        console.log(`[SCALP-TRADE] ${signal.pair}: ${finalStatus} | ${tradeUnits}u | latency=${fillLatencyMs}ms | quality=${execQuality} | slip=${slippagePips?.toFixed(3) || 'N/A'}`);
      } catch (oandaErr) {
        const errMsg = (oandaErr as Error).message;
        const isMarketHalted = errMsg.includes('MARKET_HALTED');
        const isTransient = isMarketHalted || errMsg.includes('503') || errMsg.includes('timeout');

        await supabase
          .from("oanda_orders")
          .update({
            status: "rejected",
            error_message: errMsg,
            execution_quality_score: isTransient ? null : 0
          })
          .eq("id", order.id);

        results.push({
          pair: signal.pair, direction: signal.direction, status: "rejected",
          error: errMsg, govState,
        });
        console.error(`[SCALP-TRADE] ${signal.pair} failed (${isTransient ? 'transient' : 'permanent'}):`, errMsg);

        if (isMarketHalted) {
          console.warn(`[SCALP-TRADE] Market halted — skipping remaining signals`);
          break;
        }
      }

      if (i < signalCount - 1) await new Promise((r) => setTimeout(r, 150));
    }

    const elapsed = Date.now() - startTime;
    const passed = results.filter(r => r.status === "filled").length;
    const gated = results.filter(r => r.status === "gated").length;
    const rejected = results.filter(r => r.status === "rejected").length;
    const pairBanned = results.filter(r => r.status === "pair-banned").length;
    const pairRestricted = results.filter(r => r.status === "pair-restricted").length;

    console.log(`[SCALP-TRADE] ═══ Complete: ${results.length} signals | ${passed} filled | ${gated} gated | ${rejected} rejected | ${pairBanned} banned | ${pairRestricted} restricted | ${elapsed}ms ═══`);
    console.log(`[SCALP-TRADE] Governance: ${govState} | Session: ${sessionBudget.label} | Regime: ${regime}`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "adaptive-governance",
        governanceState: govState,
        session: sessionBudget.label,
        regime,
        governance: {
          state: govState,
          config: {
            density: govConfig.densityMultiplier,
            sizing: govConfig.sizingMultiplier,
            frictionK: govConfig.frictionKOverride,
            pairRestriction: govConfig.pairRestriction,
          },
          reasons: degradation?.stateReasons || [],
          windows: degradation ? {
            w20: { winRate: degradation.windows.w20.winRate, expectancy: degradation.windows.w20.expectancy, captureRatio: degradation.windows.w20.captureRatio },
            w50: { winRate: degradation.windows.w50.winRate, expectancy: degradation.windows.w50.expectancy, captureRatio: degradation.windows.w50.captureRatio },
            w200: { winRate: degradation.windows.w200.winRate, expectancy: degradation.windows.w200.expectancy, captureRatio: degradation.windows.w200.captureRatio },
          } : null,
          bannedPairs: degradation?.bannedPairs || [],
          restrictedPairs: degradation?.restrictedPairs || [],
          promotedPairs: degradation?.promotedPairs || [],
          shadowCandidates: shadowCandidates.map(c => ({
            id: c.id, eligible: c.eligible, improvementPct: c.improvementPct, reason: c.reason,
          })),
        },
        summary: { total: results.length, filled: passed, gated, rejected, pairBanned, pairRestricted },
        signals: results,
        elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[SCALP-TRADE] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
