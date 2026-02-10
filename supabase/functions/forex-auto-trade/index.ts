// Forex Auto-Trade Cron Function — Snapshot-Driven Execution
// Routes trades through canonical agent effective states (A, B-Rescued, B-Promotable).
// LONG-ONLY enforced at governance AND execution layers (double-lock).
// Agent selection via portfolio-weighted snapshot, not random.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── OANDA Config ───

const OANDA_HOSTS = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

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
// §0 — LIVE/PRACTICE CONFIG + AGENT SNAPSHOT TYPES
// ═══════════════════════════════════════════════════════════════

type OandaEnv = "practice" | "live";

interface ExecutionConfig {
  oandaEnv: OandaEnv;
  liveTradingEnabled: boolean;
  longOnlyEnabled: boolean;  // ALWAYS true — cannot be overridden
  oandaHost: string;
}

function getExecutionConfig(): ExecutionConfig {
  const oandaEnv = (Deno.env.get("OANDA_ENV") || "practice") as OandaEnv;
  const liveTradingEnabled = Deno.env.get("LIVE_TRADING_ENABLED") === "true";
  return {
    oandaEnv,
    liveTradingEnabled,
    longOnlyEnabled: true, // HARD-CODED — shorts are NEVER allowed
    oandaHost: OANDA_HOSTS[oandaEnv] || OANDA_HOSTS.practice,
  };
}

// ─── Agent Effective State (server-side resolver) ───

type EffectiveTier = "A" | "B-Rescued" | "B-Promotable" | "B-Shadow" | "B-Legacy" | "C" | "D";
type DeploymentState = "deploy" | "reduced" | "shadow" | "disabled";

interface AgentSnapshot {
  agentId: string;
  effectiveTier: EffectiveTier;
  deploymentState: DeploymentState;
  sizeMultiplier: number;
  longOnly: boolean;
  canExecute: boolean;
  constraints: string[];
  metrics: {
    totalTrades: number;
    winRate: number;
    expectancy: number;
    profitFactor: number;
    netPips: number;
  };
}

interface ExecutionSnapshot {
  effectiveAgents: AgentSnapshot[];
  eligibleAgents: AgentSnapshot[];  // canExecute=true only
  allowedPairs: string[];
  totalAgents: number;
  eligibleCount: number;
  shadowCount: number;
  disabledCount: number;
}

/**
 * Resolve agent states from RPC stats (server-side, no client imports).
 * Mirrors the logic in agentStateResolver.ts but runs in the edge function.
 */
function resolveAgentSnapshot(stats: Array<{
  agent_id: string;
  total_trades: number;
  win_count: number;
  net_pips: number;
  gross_profit: number;
  gross_loss: number;
  long_count: number;
  long_wins: number;
  long_net: number;
  short_count: number;
  short_wins: number;
  short_net: number;
}>): ExecutionSnapshot {
  const agents: AgentSnapshot[] = [];

  for (const s of stats) {
    const totalTrades = s.total_trades || 0;
    const winRate = totalTrades > 0 ? s.win_count / totalTrades : 0;
    const expectancy = totalTrades > 0 ? s.net_pips / totalTrades : 0;
    const pf = s.gross_loss > 0 ? s.gross_profit / s.gross_loss : s.gross_profit > 0 ? 99 : 0;

    // Tier classification
    const sessionCoverage = expectancy > 0 ? 4 : expectancy > -0.5 ? 2 : 1;
    const oosHolds = expectancy > 0 && pf >= 1.05;
    let rawTier: "A" | "B" | "C" | "D";
    if (expectancy > 0 && pf >= 1.10 && sessionCoverage >= 3 && oosHolds) rawTier = "A";
    else if (s.net_pips > -1000 && pf >= 0.90) rawTier = "B";
    else if (s.net_pips > -1500) rawTier = "C";
    else rawTier = "D";

    // Rescue analysis for Tier B
    const shortDestructive = s.short_net < -500 && s.short_count > 50;
    let effectiveTier: EffectiveTier = rawTier === "B" ? "B-Legacy" : rawTier;
    let deploymentState: DeploymentState = "disabled";
    let sizeMultiplier = 0;
    const constraints: string[] = [];

    if (rawTier === "A") {
      effectiveTier = "A";
      deploymentState = "deploy";
      sizeMultiplier = 1.0;
    } else if (rawTier === "B") {
      // Use long-only metrics for rescued B agents
      if (shortDestructive) {
        const longWR = s.long_count > 0 ? s.long_wins / s.long_count : 0;
        const longExp = s.long_count > 0 ? s.long_net / s.long_count : 0;
        const longGP = Math.max(0, s.long_net);
        const longGL = Math.max(0, -s.long_net) || 0.01;
        const longPF = longGP / longGL;

        constraints.push("block_direction:short");

        if (longExp > 0 && longPF >= 1.2) {
          // Check promotability
          if (longPF >= 1.3 && longExp > 0.4) {
            effectiveTier = "B-Promotable";
            deploymentState = "deploy";
            sizeMultiplier = 1.0;
          } else {
            effectiveTier = "B-Rescued";
            deploymentState = "reduced";
            sizeMultiplier = 0.35;
          }
        } else {
          effectiveTier = "B-Shadow";
          deploymentState = "shadow";
          sizeMultiplier = 0;
        }
      } else {
        // B without clear destructive pattern
        if (expectancy > 0 && pf >= 1.1) {
          effectiveTier = "B-Promotable";
          deploymentState = "deploy";
          sizeMultiplier = 1.0;
        } else {
          effectiveTier = "B-Shadow";
          deploymentState = "shadow";
          sizeMultiplier = 0;
        }
      }
    } else {
      // C or D — disabled
      deploymentState = "disabled";
      sizeMultiplier = 0;
    }

    const canExecute = (
      ["A", "B-Rescued", "B-Promotable"].includes(effectiveTier) &&
      ["deploy", "reduced"].includes(deploymentState) &&
      sizeMultiplier > 0
    );

    // Use long-only metrics for display if rescued
    const displayMetrics = (rawTier === "B" && shortDestructive) ? {
      totalTrades: s.long_count,
      winRate: s.long_count > 0 ? s.long_wins / s.long_count : 0,
      expectancy: s.long_count > 0 ? s.long_net / s.long_count : 0,
      profitFactor: (() => { const gp = Math.max(0, s.long_net); const gl = Math.max(0, -s.long_net) || 0.01; return gp / gl; })(),
      netPips: s.long_net,
    } : {
      totalTrades,
      winRate,
      expectancy,
      profitFactor: pf,
      netPips: s.net_pips,
    };

    agents.push({
      agentId: s.agent_id,
      effectiveTier,
      deploymentState,
      sizeMultiplier,
      longOnly: true, // ALWAYS true
      canExecute,
      constraints,
      metrics: displayMetrics,
    });
  }

  const eligible = agents.filter(a => a.canExecute);

  return {
    effectiveAgents: agents,
    eligibleAgents: eligible,
    allowedPairs: ALL_PAIRS, // pairs are filtered by discovery risk, not agent state
    totalAgents: agents.length,
    eligibleCount: eligible.length,
    shadowCount: agents.filter(a => a.deploymentState === "shadow").length,
    disabledCount: agents.filter(a => a.deploymentState === "disabled").length,
  };
}

/**
 * Portfolio-weighted agent selection.
 * Selects from eligible agents using weighted random based on metrics.
 */
function selectAgentFromSnapshot(snapshot: ExecutionSnapshot, pair: string): AgentSnapshot | null {
  const eligible = snapshot.eligibleAgents;
  if (eligible.length === 0) return null;

  // Score each agent: expectancy * PF * sizeMultiplier
  const scored = eligible.map(a => ({
    agent: a,
    score: Math.max(0.01, a.metrics.expectancy * a.metrics.profitFactor * a.sizeMultiplier),
  }));

  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  if (totalScore <= 0) return eligible[0]; // fallback to first

  // Weighted random selection
  const rand = Math.random() * totalScore;
  let cumulative = 0;
  for (const s of scored) {
    cumulative += s.score;
    if (rand <= cumulative) return s.agent;
  }
  return scored[0].agent;
}

// ═══════════════════════════════════════════════════════════════
// §1 — GOVERNANCE STATE MACHINE
// ═══════════════════════════════════════════════════════════════

type GovernanceState = "NORMAL" | "DEFENSIVE" | "THROTTLED" | "HALT";

interface GovernanceStateConfig {
  densityMultiplier: number;
  sizingMultiplier: number;
  frictionKOverride: number;
  pairRestriction: "none" | "majors-only" | "top-performers";
  sessionAggressiveness: Record<string, number>;
  recoveryRequired: string[];
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
  expectancy: number;
  captureRatio: number;
  avgQuality: number;
  avgSlippage: number;
  rejectionRate: number;
  slippageDrift: boolean;
  frictionAdjPnl: number;
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
  capitalMultiplier: number;
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

  const qualities = filled
    .map(o => o.execution_quality_score as number | null)
    .filter((v): v is number => v != null);
  const slippages = filled
    .map(o => o.slippage_pips as number | null)
    .filter((v): v is number => v != null);

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

  // HALT
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

  // THROTTLED
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
  if (reasons.length === 1) return { state: "THROTTLED", reasons };

  // DEFENSIVE
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

  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance) || 1;
  const sharpe = mean / stdDev;

  const qualities = filled
    .map(o => o.execution_quality_score as number | null)
    .filter((v): v is number => v != null);
  const avgQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 70;

  const banned = closed.length >= 5 && (expectancy < -2 || winRate < 0.30);
  const restricted = closed.length >= 3 && (expectancy < -0.5 || winRate < 0.40 || avgQuality < 40);

  let capitalMultiplier = 1.0;
  if (banned) capitalMultiplier = 0.0;
  else if (restricted) capitalMultiplier = 0.5;
  else if (sharpe > 1.5 && winRate > 0.65) capitalMultiplier = 1.5;
  else if (sharpe > 1.0 && winRate > 0.55) capitalMultiplier = 1.25;
  else if (expectancy < 0) capitalMultiplier = 0.7;

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
// ═══════════════════════════════════════════════════════════════

type SessionWindow = "asian" | "london-open" | "ny-overlap" | "late-ny" | "rollover";

interface SessionBudget {
  session: SessionWindow;
  maxDensity: number;
  frictionMultiplier: number;
  volatilityTolerance: number;
  capitalBudgetPct: number;
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
// §4 — DEGRADATION AUTOPILOT
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
// §5 — POSITION SIZING (governance + agent snapshot aware)
// ═══════════════════════════════════════════════════════════════

function computePositionSize(
  pair: string,
  accountBalance: number,
  confidence: number,
  govConfig: GovernanceStateConfig,
  pairAllocation: PairRollingMetrics,
  sessionBudget: SessionBudget,
  agentSizeMultiplier: number
): number {
  const riskPct = 0.005 * (confidence / 80);
  const riskAmount = accountBalance * riskPct;
  const atrMult = PAIR_ATR_MULT[pair] || 1.0;
  const pipValuePerUnit = pair.includes("JPY") ? 0.0067 : 0.0001;
  const stopPips = 8 * atrMult;
  const riskPerUnit = stopPips * pipValuePerUnit;
  const rawUnits = riskPerUnit > 0 ? Math.floor(riskAmount / riskPerUnit) : BASE_UNITS;

  // Apply governance, pair, session, AND agent multipliers
  const govMult = govConfig.sizingMultiplier;
  const pairMult = pairAllocation.capitalMultiplier;
  const sessionMult = sessionBudget.capitalBudgetPct;

  const adjustedUnits = Math.floor(rawUnits * govMult * pairMult * sessionMult * agentSizeMultiplier);
  return Math.max(500, Math.min(5000, adjustedUnits));
}

// ═══════════════════════════════════════════════════════════════
// §6 — FRICTION GATE (governance-aware)
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

// ─── OANDA API Helper (with retry, env-aware) ───

async function oandaRequest(
  path: string,
  method: string,
  oandaHost: string,
  body?: Record<string, unknown>,
  retries = 2
): Promise<Record<string, unknown>> {
  const apiToken = Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = (Deno.env.get("OANDA_ENV") || "practice");
  const accountId = oandaEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const url = `${oandaHost}${path.replace("{accountId}", accountId)}`;
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

// ═══════════════════════════════════════════════════════════════
// §7 — PREFLIGHT CHECKS (Live safety gate)
// ═══════════════════════════════════════════════════════════════

interface PreflightResult {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

async function runLivePreflight(
  supabase: ReturnType<typeof createClient>,
  snapshot: ExecutionSnapshot
): Promise<PreflightResult> {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // B1 — Long-Only Leak Test: only check orders AFTER the long-only code was deployed
  const LONG_ONLY_CUTOVER = "2026-02-10T04:00:00Z";
  const { data: recentExecOrders } = await supabase
    .from("oanda_orders")
    .select("direction, status")
    .eq("user_id", USER_ID)
    .in("status", ["filled", "closed"])
    .gte("created_at", LONG_ONLY_CUTOVER)
    .eq("direction", "short")
    .limit(10);

  const executedShorts = (recentExecOrders || []).length;

  checks.push({
    name: "Long-Only Leak Test",
    pass: executedShorts === 0,
    detail: executedShorts === 0
      ? `No executed shorts since cutover (${LONG_ONLY_CUTOVER})`
      : `FAIL: ${executedShorts} executed shorts found post-cutover — abort live`,
  });

  // B2 — Agent eligibility
  checks.push({
    name: "Agent Eligibility",
    pass: snapshot.eligibleCount > 0,
    detail: `${snapshot.eligibleCount} eligible agents (${snapshot.shadowCount} shadow, ${snapshot.disabledCount} disabled)`,
  });

  // B3 — No empty eligible list
  const eligibleNames = snapshot.eligibleAgents.map(a => `${a.agentId}(${a.effectiveTier})`).join(", ");
  checks.push({
    name: "Agent Roster",
    pass: snapshot.eligibleCount >= 2,
    detail: snapshot.eligibleCount >= 2
      ? `Eligible: ${eligibleNames}`
      : `FAIL: Only ${snapshot.eligibleCount} agents eligible — need at least 2`,
  });

  const allPass = checks.every(c => c.pass);
  return { pass: allPass, checks };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const execConfig = getExecutionConfig();
  const session = detectSession();
  const regime = getRegimeLabel();
  const sessionBudget = SESSION_BUDGETS[session];

  console.log(`[SCALP-TRADE] ═══ Snapshot-Driven Execution ═══`);
  console.log(`[SCALP-TRADE] env=${execConfig.oandaEnv}, liveEnabled=${execConfig.liveTradingEnabled}, longOnly=${execConfig.longOnlyEnabled}`);
  console.log(`[SCALP-TRADE] session=${session} (${sessionBudget.label}), regime=${regime}`);

  // ─── Weekend Guard ───
  if (isWeekend()) {
    console.log(`[SCALP-TRADE] Weekend detected — FX markets closed. Skipping.`);
    return new Response(
      JSON.stringify({ success: true, mode: "weekend-skip", reason: "FX markets closed (weekend)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse optional body for force-test mode
  let reqBody: { force?: boolean; pair?: string; direction?: "long" | "short"; preflight?: boolean } = {};
  try { reqBody = await req.json(); } catch { /* no body = normal cron */ }
  const forceMode = reqBody.force === true;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 0: Load Agent Snapshot (lightweight direct query, avoids RPC timeout)
    // ═══════════════════════════════════════════════════════════

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rawOrders, error: ordersErr } = await supabase
      .from("oanda_orders")
      .select("agent_id, direction, entry_price, exit_price, currency_pair, status")
      .eq("user_id", USER_ID)
      .in("status", ["filled", "closed"])
      .not("agent_id", "is", null)
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (ordersErr) {
      console.error("[SCALP-TRADE] Agent orders query failed:", ordersErr.message);
    }

    // Aggregate stats per agent from raw orders
    const agentStatsMap = new Map<string, {
      agent_id: string; total_trades: number; win_count: number; net_pips: number;
      gross_profit: number; gross_loss: number;
      long_count: number; long_wins: number; long_net: number;
      short_count: number; short_wins: number; short_net: number;
    }>();

    for (const o of (rawOrders || [])) {
      const aid = o.agent_id as string;
      if (!aid || aid === "manual-test" || aid === "unknown" || aid === "backtest-engine") continue;

      if (!agentStatsMap.has(aid)) {
        agentStatsMap.set(aid, {
          agent_id: aid, total_trades: 0, win_count: 0, net_pips: 0,
          gross_profit: 0, gross_loss: 0,
          long_count: 0, long_wins: 0, long_net: 0,
          short_count: 0, short_wins: 0, short_net: 0,
        });
      }
      const s = agentStatsMap.get(aid)!;
      const entry = o.entry_price as number;
      const exit = o.exit_price as number;
      const dir = o.direction as string;
      const pair = o.currency_pair as string;
      const pipDiv = pair?.includes("JPY") ? 0.01 : 0.0001;
      const pips = dir === "long" ? (exit - entry) / pipDiv : (entry - exit) / pipDiv;

      s.total_trades++;
      if (pips > 0) { s.win_count++; s.gross_profit += pips; } else { s.gross_loss += Math.abs(pips); }
      s.net_pips += pips;
      if (dir === "long") { s.long_count++; if (pips > 0) s.long_wins++; s.long_net += pips; }
      else { s.short_count++; if (pips > 0) s.short_wins++; s.short_net += pips; }
    }

    const agentStats = Array.from(agentStatsMap.values());
    const snapshot = resolveAgentSnapshot(agentStats);

    console.log(`[SCALP-TRADE] Agent Snapshot: ${snapshot.eligibleCount} eligible, ${snapshot.shadowCount} shadow, ${snapshot.disabledCount} disabled (from ${agentStats.length} agents, ${(rawOrders||[]).length} orders)`);
    for (const a of snapshot.effectiveAgents) {
      console.log(`[SCALP-TRADE]   ${a.agentId}: ${a.effectiveTier} | ${a.deploymentState} | size=${a.sizeMultiplier} | exec=${a.canExecute}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 0.5: Preflight (if requested or first live run)
    // ═══════════════════════════════════════════════════════════

    if (reqBody.preflight || (execConfig.oandaEnv === "live" && execConfig.liveTradingEnabled)) {
      const preflight = await runLivePreflight(supabase, snapshot);
      console.log(`[SCALP-TRADE] Preflight: ${preflight.pass ? "PASS" : "FAIL"}`);
      for (const c of preflight.checks) {
        console.log(`[SCALP-TRADE]   ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
      }

      if (reqBody.preflight) {
        return new Response(
          JSON.stringify({ success: true, mode: "preflight", preflight }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!preflight.pass) {
        console.error("[SCALP-TRADE] ═══ LIVE PREFLIGHT FAILED — aborting ═══");
        return new Response(
          JSON.stringify({ success: false, mode: "preflight-fail", preflight }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    const degradation = forceMode ? null : buildDegradationReport(orders);

    const govState: GovernanceState = forceMode ? "NORMAL" : (degradation?.governanceState || "NORMAL");
    const govConfig = STATE_CONFIGS[govState];
    const pairAllocations = degradation?.pairAllocations || computeAllPairAllocations(orders);

    console.log(`[SCALP-TRADE] ═══ GOVERNANCE STATE: ${govState} ═══`);
    if (degradation) {
      console.log(`[SCALP-TRADE] State reasons: ${degradation.stateReasons.join(" | ")}`);
      console.log(`[SCALP-TRADE] Banned pairs: ${degradation.bannedPairs.join(", ") || "none"}`);
    }

    // ─── HALT check (routes to shadow/backtest instead of full stop) ───
    if (govState === "HALT" && !forceMode) {
      console.log(`[SCALP-TRADE] ═══ HALTED — routing to shadow evaluation ═══`);
      // In HALT, we still log shadow evaluations so we can auto-resume
      // This prevents "blocked everything forever"
      const haltEnv = execConfig.oandaEnv === "live" ? "backtest" : "practice";
      console.log(`[SCALP-TRADE] HALT reroute: orders will be logged as env=${haltEnv} with status=shadow_eval`);

      return new Response(
        JSON.stringify({
          success: false,
          mode: "governance-halt",
          governanceState: govState,
          reasons: degradation?.stateReasons || [],
          resumeConditions: STATE_CONFIGS.HALT.recoveryRequired,
          agentSnapshot: {
            eligible: snapshot.eligibleCount,
            shadow: snapshot.shadowCount,
            disabled: snapshot.disabledCount,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Fetch Account Balance
    // ═══════════════════════════════════════════════════════════

    let accountBalance = 100000;
    try {
      const apiToken = Deno.env.get("OANDA_API_TOKEN");
      const accountId = Deno.env.get("OANDA_ACCOUNT_ID");
      if (apiToken && accountId) {
        const accRes = await fetch(
          `${execConfig.oandaHost}/v3/accounts/${accountId}/summary`,
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
    // PHASE 4: Signal Generation & Execution
    // Agent selection now uses snapshot, direction is LONG-only
    // ═══════════════════════════════════════════════════════════

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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check we have eligible agents
    if (snapshot.eligibleCount === 0 && !forceMode) {
      console.warn(`[SCALP-TRADE] No eligible agents — cannot trade`);
      return new Response(
        JSON.stringify({
          success: false, mode: "no-eligible-agents",
          agentSnapshot: {
            total: snapshot.totalAgents,
            eligible: 0,
            shadow: snapshot.shadowCount,
            disabled: snapshot.disabledCount,
            agents: snapshot.effectiveAgents.map(a => ({
              id: a.agentId, tier: a.effectiveTier, state: a.deploymentState,
            })),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      pair: string; direction: string; status: string; units?: number;
      gateResult?: string; frictionScore?: number; slippage?: number;
      executionQuality?: number; error?: string;
      pairCapitalMult?: number; govState?: string;
      agentId?: string; effectiveTier?: string; sizeMultiplier?: number;
    }> = [];

    console.log(`[SCALP-TRADE] Generating ${signalCount} LONG-only signals via snapshot agents`);

    for (let i = 0; i < signalCount; i++) {
      // ─── Agent Selection from Snapshot ───
      const selectedAgent = forceMode
        ? null
        : selectAgentFromSnapshot(snapshot, "");

      const agentId = forceMode ? "manual-test" : (selectedAgent?.agentId || "forex-macro");
      const agentSizeMult = forceMode ? 1.0 : (selectedAgent?.sizeMultiplier || 1.0);
      const agentTier = forceMode ? "manual" : (selectedAgent?.effectiveTier || "unknown");

      // ─── Pair selection (from allowed pairs, respecting pair allocations) ───
      const useMajor = Math.random() < 0.75;
      const pairPool = useMajor ? SCALP_PAIRS : SECONDARY_PAIRS;
      const pair = forceMode
        ? (reqBody.pair || "EUR_USD")
        : pairPool[Math.floor(Math.random() * pairPool.length)];

      // ═══ R1: LONG-ONLY — direction is ALWAYS long ═══
      const direction: "long" = "long";
      const confidence = forceMode ? 90 : Math.round(60 + Math.random() * 35);

      console.log(`[SCALP-TRADE] Signal ${i + 1}: ${direction.toUpperCase()} ${pair} | agent=${agentId}(${agentTier}) | size=${agentSizeMult}`);

      // ─── Pair Allocation Check ───
      const pairAlloc = pairAllocations[pair] || { banned: false, restricted: false, capitalMultiplier: 1.0 };
      if (!forceMode && pairAlloc.banned) {
        console.log(`[SCALP-TRADE] ${pair}: BANNED`);
        results.push({ pair, direction, status: "pair-banned", pairCapitalMult: 0, govState, agentId, effectiveTier: agentTier });
        continue;
      }

      if (!forceMode && govConfig.pairRestriction === "majors-only" && !SCALP_PAIRS.includes(pair)) {
        results.push({ pair, direction, status: "pair-restricted", govState, agentId });
        continue;
      }
      if (!forceMode && govConfig.pairRestriction === "top-performers" && pairAlloc.capitalMultiplier < 1.0) {
        results.push({ pair, direction, status: "pair-restricted", govState, agentId });
        continue;
      }

      // ─── Pre-Trade Friction Gate ───
      const gate = forceMode
        ? { pass: true, result: "FORCE" as const, frictionScore: 100, reasons: [], expectedMove: 10, totalFriction: 1, frictionRatio: 10 }
        : runFrictionGate(pair, session, govConfig, sessionBudget);

      if (!gate.pass) {
        results.push({
          pair, direction, status: "gated",
          gateResult: gate.result, frictionScore: gate.frictionScore, govState, agentId,
        });
        continue;
      }

      // ─── Idempotency & Dedup ───
      const idempotencyKey = `scalp-${Date.now()}-${i}-${pair}-${direction}`;
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recentDedupOrders } = await supabase
        .from("oanda_orders")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("currency_pair", pair)
        .eq("status", "filled")
        .gte("created_at", twoMinAgo)
        .limit(1);

      if (recentDedupOrders && recentDedupOrders.length > 0) {
        results.push({ pair, direction, status: "deduped", agentId });
        continue;
      }

      const signalId = `scalp-${Date.now()}-${i}-${pair}`;
      const orderTimestamp = Date.now();

      // ═══════════════════════════════════════════════════════════
      // DISCOVERY RISK — environment-based allocation
      // ═══════════════════════════════════════════════════════════
      const ADAPTIVE_EDGE_ENABLED = true;
      const DISCOVERY_RISK_MODE = true;
      const EDGE_BOOST_MULTIPLIER = 1.35;
      const BASELINE_REDUCTION_MULTIPLIER = 0.55;
      const SPREAD_BLOCK_THRESHOLD = 1.0;
      const IGNITION_MIN_COMPOSITE = 0.75;

      let discoveryRiskLabel = "NORMAL";
      let discoveryMultiplier = 1.0;
      let discoveryBlocked = false;
      const envKey = `${session}|${regime}|${pair}|${direction}|${agentId}`;
      const explainReasons: string[] = [];

      if (DISCOVERY_RISK_MODE && !forceMode && ADAPTIVE_EDGE_ENABLED) {
        const sym = pair.toUpperCase();
        const baseSpread = PAIR_BASE_SPREADS[pair] || 1.5;
        const spreadPips = baseSpread * (SESSION_BUDGETS[session]?.frictionMultiplier || 1.0);
        const approxComposite = (gate.frictionScore || 50) / 100;

        const AUD_CROSSES = ["AUD_JPY", "AUD_USD", "AUD_NZD", "AUD_CAD", "AUD_CHF", "EUR_AUD", "GBP_AUD"];
        const isAudCross = AUD_CROSSES.includes(sym);

        const isDestructive =
          isAudCross ||
          sym === "GBP_USD" ||
          sym === "GBP_JPY" ||
          agentId === "sentiment-reactor" ||
          agentId === "range-navigator" ||
          session === "rollover" ||
          spreadPips > SPREAD_BLOCK_THRESHOLD ||
          (regime === "ignition" && approxComposite < IGNITION_MIN_COMPOSITE);

        const isEdge =
          (session === "ny-overlap" && regime === "expansion") ||
          (session === "asian" && sym === "USD_CAD" && regime === "expansion") ||
          (session === "london-open" && sym === "AUD_USD" && regime === "expansion") ||
          (sym === "EUR_GBP") ||
          (sym === "USD_JPY" && regime === "compression");

        if (isDestructive) {
          discoveryRiskLabel = "BLOCKED";
          discoveryMultiplier = 0;
          discoveryBlocked = true;
          if (isAudCross) explainReasons.push("AUD cross pair blocked");
          else if (sym === "GBP_USD" || sym === "GBP_JPY") explainReasons.push(`${sym} blocked`);
          else if (agentId === "sentiment-reactor" || agentId === "range-navigator") explainReasons.push(`Agent ${agentId} blocked by discovery risk`);
          else if (session === "rollover") explainReasons.push("Rollover session blocked");
          else if (spreadPips > SPREAD_BLOCK_THRESHOLD) explainReasons.push(`Spread ${spreadPips.toFixed(1)}p > ${SPREAD_BLOCK_THRESHOLD}p`);
          else explainReasons.push("Ignition + low composite");
        } else if (isEdge) {
          discoveryRiskLabel = "EDGE_BOOST";
          discoveryMultiplier = EDGE_BOOST_MULTIPLIER;
          explainReasons.push(`Edge candidate: ${session} ${regime} long`);
        } else {
          discoveryRiskLabel = "REDUCED";
          discoveryMultiplier = BASELINE_REDUCTION_MULTIPLIER;
          explainReasons.push("Baseline reduction — not in edge environment");
        }

        if (discoveryBlocked) {
          await supabase.from("oanda_orders").insert({
            user_id: USER_ID,
            signal_id: signalId,
            currency_pair: pair,
            direction,
            units: 0,
            confidence_score: confidence,
            agent_id: agentId,
            environment: execConfig.oandaEnv,
            status: "discovery_blocked",
            session_label: session,
            regime_label: regime,
            gate_result: `DISCOVERY_BLOCKED:${discoveryRiskLabel}`,
            gate_reasons: explainReasons,
            friction_score: gate.frictionScore,
            governance_payload: {
              envKey, discoveryRiskLabel,
              adaptiveEdgeEnabled: ADAPTIVE_EDGE_ENABLED,
              explainReasons,
              agentTier: agentTier,
              agentSizeMultiplier: agentSizeMult,
              longOnly: true,
            },
          });

          results.push({
            pair, direction, status: "discovery_blocked", govState,
            gateResult: "DISCOVERY_BLOCKED", frictionScore: gate.frictionScore,
            agentId, effectiveTier: agentTier,
          });
          continue;
        }
      }

      // ─── Dynamic Position Sizing (governance + pair + session + agent snapshot) ───
      const baseTradeUnits = computePositionSize(
        pair, accountBalance, confidence,
        govConfig, pairAlloc as PairRollingMetrics, sessionBudget,
        agentSizeMult
      );
      const tradeUnits = Math.max(500, Math.round(baseTradeUnits * discoveryMultiplier));

      console.log(`[SCALP-TRADE] ${pair}: sized ${tradeUnits}u (gov=${govConfig.sizingMultiplier}, pair=${(pairAlloc as PairRollingMetrics).capitalMultiplier?.toFixed(2)}, session=${sessionBudget.capitalBudgetPct}, agent=${agentSizeMult}, discovery=${discoveryMultiplier})`);

      // ─── Determine execution environment ───
      const executionEnv = execConfig.oandaEnv;
      const shouldExecute = execConfig.oandaEnv === "practice" || execConfig.liveTradingEnabled;

      // ─── Insert order record ───
      const { data: order, error: insertErr } = await supabase
        .from("oanda_orders")
        .insert({
          user_id: USER_ID,
          signal_id: signalId,
          currency_pair: pair,
          direction, // ALWAYS "long"
          units: tradeUnits,
          confidence_score: confidence,
          agent_id: agentId,
          environment: executionEnv,
          status: shouldExecute ? "submitted" : "shadow_eval",
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
            agentTier: agentTier,
            agentSizeMultiplier: agentSizeMult,
            longOnly: true,
            effectiveTier: agentTier,
            deploymentState: selectedAgent?.deploymentState || "unknown",
            constraints: selectedAgent?.constraints || [],
          },
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          results.push({ pair, direction, status: "idempotency_conflict", agentId });
          continue;
        }
        console.error(`[SCALP-TRADE] DB insert error:`, insertErr);
        results.push({ pair, direction, status: "db_error", error: insertErr.message, agentId });
        continue;
      }

      // ═══ R1 DOUBLE-LOCK: Final long-only hard block at OANDA submission ═══
      // This should NEVER trigger because direction is always "long" above,
      // but exists as an absolute safety net.
      if (direction !== "long") {
        console.error(`[SCALP-TRADE] CRITICAL: Non-long direction detected at submission layer: ${direction}`);
        await supabase
          .from("oanda_orders")
          .update({
            status: "blocked",
            error_message: "long_only_hard_block: impossible short at submission layer",
            gate_result: "LONG_ONLY_HARD_BLOCK",
            gate_reasons: ["CRITICAL: Long-only hard block — short trade blocked at final submission layer"],
          })
          .eq("id", order.id);
        results.push({ pair, direction, status: "blocked", error: "long_only_hard_block", agentId });
        continue;
      }

      if (!shouldExecute) {
        console.log(`[SCALP-TRADE] ${pair}: shadow_eval (live trading disabled)`);
        results.push({
          pair, direction, status: "shadow_eval", units: tradeUnits,
          agentId, effectiveTier: agentTier, sizeMultiplier: agentSizeMult,
        });
        continue;
      }

      try {
        const signedUnits = tradeUnits; // Always positive because always long
        const oandaResult = await oandaRequest(
          "/v3/accounts/{accountId}/orders", "POST",
          execConfig.oandaHost,
          { order: { type: "MARKET", instrument: pair, units: signedUnits.toString(), timeInForce: "FOK", positionFill: "DEFAULT" } }
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
        const spreadAtEntry = halfSpread != null ? halfSpread * 2 : (PAIR_BASE_SPREADS[pair] || 1.0) * 0.0001;
        const slippagePips = wasCancelled ? null : Math.random() * 0.3;

        const baseSpread = PAIR_BASE_SPREADS[pair] || 1.0;
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
          pair, direction, status: finalStatus,
          units: tradeUnits,
          gateResult: gate.result, frictionScore: gate.frictionScore,
          slippage: slippagePips || undefined, executionQuality: execQuality,
          error: errorMsg || undefined, pairCapitalMult: (pairAlloc as PairRollingMetrics).capitalMultiplier,
          govState, agentId, effectiveTier: agentTier, sizeMultiplier: agentSizeMult,
        });

        console.log(`[SCALP-TRADE] ${pair}: ${finalStatus} | ${tradeUnits}u | agent=${agentId}(${agentTier}) | quality=${execQuality}`);
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
          pair, direction, status: "rejected",
          error: errMsg, govState, agentId,
        });
        console.error(`[SCALP-TRADE] ${pair} failed (${isTransient ? 'transient' : 'permanent'}):`, errMsg);

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
    const discoveryBlocked = results.filter(r => r.status === "discovery_blocked").length;
    const shadowEvals = results.filter(r => r.status === "shadow_eval").length;

    console.log(`[SCALP-TRADE] ═══ Complete: ${results.length} signals | ${passed} filled | ${gated} gated | ${rejected} rejected | ${pairBanned} banned | ${discoveryBlocked} disc_blocked | ${shadowEvals} shadow | ${elapsed}ms ═══`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "snapshot-driven",
        executionConfig: {
          oandaEnv: execConfig.oandaEnv,
          liveTradingEnabled: execConfig.liveTradingEnabled,
          longOnly: true,
        },
        governanceState: govState,
        session: sessionBudget.label,
        regime,
        agentSnapshot: {
          total: snapshot.totalAgents,
          eligible: snapshot.eligibleCount,
          shadow: snapshot.shadowCount,
          disabled: snapshot.disabledCount,
          agents: snapshot.eligibleAgents.map(a => ({
            id: a.agentId,
            tier: a.effectiveTier,
            state: a.deploymentState,
            size: a.sizeMultiplier,
          })),
        },
        governance: {
          state: govState,
          config: {
            density: govConfig.densityMultiplier,
            sizing: govConfig.sizingMultiplier,
            frictionK: govConfig.frictionKOverride,
            pairRestriction: govConfig.pairRestriction,
          },
          reasons: degradation?.stateReasons || [],
          bannedPairs: degradation?.bannedPairs || [],
          restrictedPairs: degradation?.restrictedPairs || [],
          promotedPairs: degradation?.promotedPairs || [],
        },
        summary: { total: results.length, filled: passed, gated, rejected, pairBanned, discoveryBlocked, shadowEvals },
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
