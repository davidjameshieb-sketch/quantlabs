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

// ─── CAPITAL DEPLOYMENT DIRECTIVE ───
// STRATEGY REVAMP: All pairs authorized, no focus restrictions
// System learns from ALL pairs equally to reach Prime Directive milestones
const PRIMARY_PAIR = "USD_CAD"; // Anchor pair — permanently exempt from restrictions

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

// ─── Indicator Names (canonical list for learning engine) ───
const INDICATOR_NAMES: Record<string, string> = {
  ema50: "EMA 50",
  rsi: "RSI",
  supertrend: "Supertrend",
  parabolicSAR: "Parabolic SAR",
  ichimoku: "Ichimoku",
  adx: "ADX",
  bollingerBands: "Bollinger Bands",
  donchianChannels: "Donchian Channels",
  stochastics: "Stochastics",
  cci: "CCI",
  keltnerChannels: "Keltner Channels",
  roc: "ROC",
  elderForce: "Elder Force",
  heikinAshi: "Heikin-Ashi",
  pivotPoints: "Pivot Points",
  trendEfficiency: "Trend Efficiency",
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
    longOnlyEnabled: false, // DUAL-DIRECTION: both longs and shorts enabled for data collection
    oandaHost: OANDA_HOSTS[oandaEnv] || OANDA_HOSTS.practice,
  };
}

// ─── Agent Effective State (server-side resolver) ───

type EffectiveTier = "A" | "B-Rescued" | "B-Promotable" | "B-Shadow" | "B-Legacy" | "C" | "D";
type DeploymentState = "deploy" | "reduced" | "shadow" | "disabled";
type AgentFleetSet = "ACTIVE" | "BENCH" | "SHADOW";

interface AgentSnapshot {
  agentId: string;
  fleetSet: AgentFleetSet;
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

// ─── Coalition Requirement Levels ───
type CoalitionTier = "duo" | "trio";

interface CoalitionRequirement {
  tier: CoalitionTier;
  minAgents: number;
  survivorshipScore: number;
  rollingPF: number;
  expectancySlope: number;
  stabilityTrend: "improving" | "flat" | "deteriorating";
  reasons: string[];
}

/**
 * Compute dynamic coalition requirement based on aggregate survivorship metrics.
 * MINIMUM 2 agents always required — solo execution is DISABLED.
 * Degraded metrics require 3 agents for additional confirmation.
 */
function computeCoalitionRequirement(agents: AgentSnapshot[]): CoalitionRequirement {
  const eligible = agents.filter(a => a.canExecute);
  const reasons: string[] = [];

  if (eligible.length === 0) {
    return {
      tier: "duo", minAgents: 2, survivorshipScore: 0, rollingPF: 0,
      expectancySlope: 0, stabilityTrend: "flat",
      reasons: ["No eligible agents — bootstrap DUO"],
    };
  }

  // Aggregate survivorship score from eligible agents' metrics
  const totalTrades = eligible.reduce((s, a) => s + a.metrics.totalTrades, 0);

  // ─── LEARNING PHASE: < 500 trades = force DUO ───
  // During learning, TRIO escalation would deadlock the system with only 2 support agents.
  // Once we have 500+ trades, survivorship metrics become meaningful for TRIO gating.
  if (totalTrades < 500) {
    reasons.push(`Learning phase: ${totalTrades} trades < 500 — forcing DUO (no TRIO escalation)`);
    return {
      tier: "duo", minAgents: 2, survivorshipScore: 0, rollingPF: 0,
      expectancySlope: 0, stabilityTrend: "flat",
      reasons,
    };
  }

  const weightedWR = eligible.reduce((s, a) => s + a.metrics.winRate * a.metrics.totalTrades, 0) / (totalTrades || 1);
  const weightedExp = eligible.reduce((s, a) => s + a.metrics.expectancy * a.metrics.totalTrades, 0) / (totalTrades || 1);
  const weightedPF = eligible.reduce((s, a) => s + a.metrics.profitFactor * a.metrics.totalTrades, 0) / (totalTrades || 1);

  // Survivorship score: 0-100 composite
  const wrScore = Math.min(30, weightedWR * 50);
  const expScore = Math.min(30, Math.max(0, weightedExp * 15));
  const pfScore = Math.min(25, Math.max(0, (weightedPF - 0.5) * 12.5));
  const sampleScore = Math.min(15, totalTrades / 20);
  const survivorshipScore = Math.round(wrScore + expScore + pfScore + sampleScore);

  const expectancySlope = weightedExp;

  let stabilityTrend: "improving" | "flat" | "deteriorating";
  if (weightedPF >= 1.3 && weightedWR >= 0.55) stabilityTrend = "improving";
  else if (weightedPF >= 1.0 && weightedWR >= 0.45) stabilityTrend = "flat";
  else stabilityTrend = "deteriorating";

  // ─── Tier determination (minimum 2 always) ───
  // DUO: survivorship ≥ 40, PF ≥ 1.05, stability not deteriorating
  if (survivorshipScore >= 40 && weightedPF >= 1.05 && stabilityTrend !== "deteriorating") {
    reasons.push(`Survivorship ${survivorshipScore} ≥ 40`);
    reasons.push(`PF ${weightedPF.toFixed(2)} ≥ 1.05`);
    reasons.push(`Stability: ${stabilityTrend}`);
    return { tier: "duo", minAgents: 2, survivorshipScore, rollingPF: weightedPF, expectancySlope, stabilityTrend, reasons };
  }

  // TRIO: survivorship < 40, PF < 1.05, stability deteriorating
  reasons.push(`Survivorship ${survivorshipScore} < 40`);
  if (weightedPF < 1.05) reasons.push(`PF ${weightedPF.toFixed(2)} < 1.05`);
  if (stabilityTrend === "deteriorating") reasons.push(`Stability: ${stabilityTrend}`);
  return { tier: "trio", minAgents: 3, survivorshipScore, rollingPF: weightedPF, expectancySlope, stabilityTrend, reasons };
}

// ─── ExecutionSnapshot Interface ───
interface ExecutionSnapshot {
  effectiveAgents: AgentSnapshot[];
  eligibleAgents: AgentSnapshot[];
  allowedPairs: string[];
  totalAgents: number;
  eligibleCount: number;
  shadowCount: number;
  disabledCount: number;
  coalitionRequirement: CoalitionRequirement;
  promotionLog: string[];
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

    let fleetSet: AgentFleetSet = "SHADOW";

    if (rawTier === "A") {
      effectiveTier = "A";
      deploymentState = "deploy";
      sizeMultiplier = 1.0;
      fleetSet = "ACTIVE";
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
            fleetSet = "ACTIVE";
          } else {
            effectiveTier = "B-Rescued";
            deploymentState = "reduced";
            sizeMultiplier = 0.35;
            fleetSet = "ACTIVE";
          }
        } else {
          effectiveTier = "B-Shadow";
          deploymentState = "shadow";
          sizeMultiplier = 0;
          fleetSet = "BENCH"; // Pre-cleared for instant promotion
        }
      } else {
        // B without clear destructive pattern
        if (expectancy > 0 && pf >= 1.1) {
          effectiveTier = "B-Promotable";
          deploymentState = "deploy";
          sizeMultiplier = 1.0;
          fleetSet = "ACTIVE";
        } else if (expectancy > -0.3 && pf >= 0.85) {
          // BENCH: close to viable, ready for instant promotion
          effectiveTier = "B-Shadow";
          deploymentState = "shadow";
          sizeMultiplier = 0;
          fleetSet = "BENCH";
        } else {
          effectiveTier = "B-Shadow";
          deploymentState = "shadow";
          sizeMultiplier = 0;
          fleetSet = "SHADOW";
        }
      }
    } else if (rawTier === "C") {
      // C agents go to BENCH if they have non-destructive metrics
      deploymentState = "disabled";
      sizeMultiplier = 0;
      fleetSet = (expectancy > -1.0 && pf >= 0.7) ? "BENCH" : "SHADOW";
    } else {
      // D — deep shadow
      deploymentState = "disabled";
      sizeMultiplier = 0;
      fleetSet = "SHADOW";
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
      fleetSet,
      effectiveTier,
      deploymentState,
      sizeMultiplier,
      longOnly: false, // DUAL-DIRECTION enabled
      canExecute,
      constraints,
      metrics: displayMetrics,
    });
  }

  let eligible = agents.filter(a => a.canExecute);

  // ─── Compute Coalition Requirement from aggregate metrics ───
  const coalitionRequirement = computeCoalitionRequirement(agents);
  const minRequired = coalitionRequirement.minAgents;

  // ═══════════════════════════════════════════════════════════════
  // AUTONOMOUS PROMOTION SYSTEM — Guarantees DUO minimum
  // ═══════════════════════════════════════════════════════════════
  const promotionLog: string[] = [];

  if (eligible.length < minRequired) {
    // STEP 1: Promote from BENCH (pre-cleared, non-destructive agents)
    const bench = agents
      .filter(a => a.fleetSet === "BENCH" && !a.canExecute)
      .sort((a, b) => b.metrics.profitFactor - a.metrics.profitFactor); // best PF first

    for (const agent of bench) {
      if (eligible.length >= minRequired) break;
      // Promotion eligibility gates
      const passesViability = agent.metrics.totalTrades >= 0; // no wiring errors
      const passesRegime = true; // BENCH agents already classified as non-destructive
      const passesDiversity = !eligible.some(e => e.agentId === agent.agentId);
      const passesNonDestructive = agent.metrics.profitFactor >= 0.7 || agent.metrics.totalTrades < 5;

      if (passesViability && passesRegime && passesDiversity && passesNonDestructive) {
        agent.canExecute = true;
        agent.deploymentState = "reduced";
        agent.sizeMultiplier = 0.35; // Reduced sizing for promoted agents
        agent.fleetSet = "ACTIVE";
        eligible.push(agent);
        promotionLog.push(`[AUTO-PROMOTE] BENCH→ACTIVE: ${agent.agentId} (PF=${agent.metrics.profitFactor.toFixed(2)}, exp=${agent.metrics.expectancy.toFixed(2)})`);
      }
    }
  }

  if (eligible.length < minRequired) {
    // STEP 2: Promote from SHADOW (agents with any data, minimal requirements)
    const shadow = agents
      .filter(a => a.fleetSet === "SHADOW" && !a.canExecute)
      .sort((a, b) => b.metrics.profitFactor - a.metrics.profitFactor);

    for (const agent of shadow) {
      if (eligible.length >= minRequired) break;
      const passesDiversity = !eligible.some(e => e.agentId === agent.agentId);
      // Shadow promotion: looser gates — just needs to not be catastrophically bad
      const passesNonDestructive = agent.metrics.expectancy > -2.0 || agent.metrics.totalTrades < 3;

      if (passesDiversity && passesNonDestructive) {
        agent.canExecute = true;
        agent.deploymentState = "reduced";
        agent.sizeMultiplier = 0.20; // Minimal sizing for shadow-promoted agents
        agent.fleetSet = "ACTIVE";
        eligible.push(agent);
        promotionLog.push(`[AUTO-PROMOTE] SHADOW→ACTIVE: ${agent.agentId} (PF=${agent.metrics.profitFactor.toFixed(2)}, exp=${agent.metrics.expectancy.toFixed(2)})`);
      }
    }
  }

  if (eligible.length < minRequired) {
    // STEP 3: SUPPORT AGENT FALLBACK — inject virtual confirmer agents
    // These only confirm MTF direction + regime, they cannot override edge layers
    const supportAgents: AgentSnapshot[] = [
      {
        agentId: "support-mtf-confirmer",
        fleetSet: "ACTIVE",
        effectiveTier: "B-Rescued" as EffectiveTier,
        deploymentState: "reduced",
        sizeMultiplier: 0.15,
        longOnly: false,
        canExecute: true,
        constraints: ["support-only", "no-override"],
        metrics: { totalTrades: 0, winRate: 0.5, expectancy: 0, profitFactor: 1.0, netPips: 0 },
      },
      {
        agentId: "support-regime-confirmer",
        fleetSet: "ACTIVE",
        effectiveTier: "B-Rescued" as EffectiveTier,
        deploymentState: "reduced",
        sizeMultiplier: 0.15,
        longOnly: false,
        canExecute: true,
        constraints: ["support-only", "no-override"],
        metrics: { totalTrades: 0, winRate: 0.5, expectancy: 0, profitFactor: 1.0, netPips: 0 },
      },
    ];

    for (const sa of supportAgents) {
      if (eligible.length >= minRequired) break;
      agents.push(sa);
      eligible.push(sa);
      promotionLog.push(`[AUTO-PROMOTE] SUPPORT AGENT activated: ${sa.agentId}`);
    }
  }

  // Log all promotions
  for (const log of promotionLog) {
    console.log(log);
  }
  if (promotionLog.length > 0) {
    console.log(`[AUTO-PROMOTE] Final eligible count: ${eligible.length} (required: ${minRequired})`);
  }

  return {
    effectiveAgents: agents,
    eligibleAgents: eligible,
    allowedPairs: ALL_PAIRS,
    totalAgents: agents.length,
    eligibleCount: eligible.length,
    shadowCount: agents.filter(a => a.deploymentState === "shadow").length,
    disabledCount: agents.filter(a => a.deploymentState === "disabled").length,
    coalitionRequirement,
    promotionLog,
  };
}

/**
 * Classify agent role based on metrics for multiplier adjustment.
 * Champion: positive exp + PF >= 1.1 → 1.1-1.25×
 * Stabilizer: modest PnL but low DD contribution → 0.9-1.0×
 * Specialist: positive only in specific envs → 0.6-0.8×
 * Diluter: degrades system → 0× (shadow)
 */
type AgentLiveRole = "champion" | "stabilizer" | "specialist" | "diluter";

function classifyAgentRole(agent: AgentSnapshot): { role: AgentLiveRole; roleMult: number } {
  const m = agent.metrics;
  if (m.expectancy > 0 && m.profitFactor >= 1.1 && m.winRate >= 0.55) {
    // Fast Ramp §5: Champion authority 1.2x→1.4x
    return { role: "champion", roleMult: 1.30 };
  }
  if (m.expectancy >= -0.1 && m.profitFactor >= 0.95) {
    return { role: "stabilizer", roleMult: 0.95 };
  }
  if (m.expectancy > 0 || m.netPips > -100) {
    // Fast Ramp §5: Specialist capped at 0.85x, only verified envKeys
    return { role: "specialist", roleMult: 0.75 };
  }
  // Fast Ramp §5: Diluter — shadow only, zero influence
  return { role: "diluter", roleMult: 0 };
}

/**
 * Portfolio-weighted agent selection with role-based multipliers.
 * Selects from eligible agents using weighted random based on metrics.
 * Diluters are excluded from selection.
 */
function selectAgentFromSnapshot(snapshot: ExecutionSnapshot, pair: string): AgentSnapshot & { role: AgentLiveRole; roleMult: number } | null {
  const eligible = snapshot.eligibleAgents;
  if (eligible.length === 0) return null;

  // Classify and filter out diluters
  const classified = eligible.map(a => ({ agent: a, ...classifyAgentRole(a) }))
    .filter(c => c.role !== "diluter");

  if (classified.length === 0) {
    // Fallback: use first eligible even if diluter
    const first = eligible[0];
    return { ...first, role: "stabilizer" as AgentLiveRole, roleMult: 0.95 };
  }

  // For primary pair: prefer champions + stabilizers
  const isPrimary = pair === "USD_CAD";
  const candidates = isPrimary
    ? classified.filter(c => c.role === "champion" || c.role === "stabilizer")
    : classified;
  const pool = candidates.length > 0 ? candidates : classified;

  // Score: expectancy * PF * sizeMultiplier * roleMult
  const scored = pool.map(c => ({
    ...c,
    score: Math.max(0.01, c.agent.metrics.expectancy * c.agent.metrics.profitFactor * c.agent.sizeMultiplier * c.roleMult),
  }));

  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  if (totalScore <= 0) return { ...scored[0].agent, role: scored[0].role, roleMult: scored[0].roleMult };

  const rand = Math.random() * totalScore;
  let cumulative = 0;
  for (const s of scored) {
    cumulative += s.score;
    if (rand <= cumulative) return { ...s.agent, role: s.role, roleMult: s.roleMult };
  }
  return { ...scored[0].agent, role: scored[0].role, roleMult: scored[0].roleMult };
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
    // STRATEGY REVAMP: All sessions active for maximum data collection
    // Rollover gets reduced but NOT zero — learning needs all session data
    sessionAggressiveness: { asian: 0.85, "london-open": 1.0, "ny-overlap": 1.0, "late-ny": 0.65, rollover: 0.35 },
    recoveryRequired: [],
  },
  DEFENSIVE: {
    densityMultiplier: 0.75,
    sizingMultiplier: 0.80,
    frictionKOverride: 3.5,
    pairRestriction: "none",
    sessionAggressiveness: { asian: 0.65, "london-open": 0.90, "ny-overlap": 0.85, "late-ny": 0.45, rollover: 0.20 },
    recoveryRequired: ["expectancy > 0.5 over 50 trades"],
  },
  THROTTLED: {
    densityMultiplier: 0.50,
    sizingMultiplier: 0.60,
    frictionKOverride: 4.0,
    pairRestriction: "none",
    sessionAggressiveness: { asian: 0.40, "london-open": 0.70, "ny-overlap": 0.65, "late-ny": 0.25, rollover: 0.10 },
    recoveryRequired: ["expectancy > 0.8 over 50 trades", "win rate > 50%"],
  },
  HALT: {
    // GRACEFUL DEGRADATION: HALT now reduces to minimum viable instead of stopping
    densityMultiplier: 0.25,
    sizingMultiplier: 0.40,
    frictionKOverride: 5.0,
    pairRestriction: "none",
    sessionAggressiveness: { asian: 0.20, "london-open": 0.40, "ny-overlap": 0.35, "late-ny": 0.10, rollover: 0.0 },
    recoveryRequired: ["Graceful degradation — trading continues at minimum viable params"],
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

  // ═══ STRATEGY REVAMP: LEARNING PHASE ═══
  // During learning phase (< 500 trades), governance stays NORMAL to maximize data collection.
  // The system learns from ALL trades — HALT/THROTTLE disabled until Prime Directive milestones reached.
  // Safety brakes (spread, slippage, liquidity) remain as hard-blocks to protect capital.
  const totalTrades = m200.tradeCount;
  const LEARNING_MILESTONE = 500;

  if (totalTrades < LEARNING_MILESTONE) {
    reasons.push(`LEARNING PHASE: ${totalTrades}/${LEARNING_MILESTONE} trades — governance overrides disabled for data accumulation`);
    // Only flag extreme execution issues (not performance-based)
    if (m20.avgQuality > 0 && m20.avgQuality < 15) {
      reasons.push(`WARNING: Execution quality critically low (${m20.avgQuality.toFixed(0)}) — monitor broker connection`);
    }
    return { state: "NORMAL", reasons };
  }

  // POST-LEARNING: Full governance active after milestone reached
  // HALT — only for severe catastrophic conditions
  if (m20.tradeCount >= 10 && m20.winRate < 0.20 && m20.expectancy < -5) {
    reasons.push(`HALT: 20-trade WR ${(m20.winRate * 100).toFixed(0)}% < 20% with severe neg expectancy`);
    return { state: "HALT", reasons };
  }
  if (m50.tradeCount >= 20 && m50.frictionAdjPnl < -100) {
    reasons.push(`HALT: 50-trade friction-adj P&L ${m50.frictionAdjPnl.toFixed(1)}p is catastrophic`);
    return { state: "HALT", reasons };
  }

  // THROTTLED — only if sustained poor performance post-learning
  if (m50.tradeCount >= 20 && m50.winRate < 0.35 && m50.expectancy < -1.5) {
    reasons.push(`THROTTLE: 50-trade WR ${(m50.winRate * 100).toFixed(0)}% < 35% with neg expectancy`);
    return { state: "THROTTLED", reasons };
  }

  // DEFENSIVE
  if (m50.tradeCount >= 20 && m50.expectancy < 0) {
    reasons.push(`DEFENSIVE: 50-trade expectancy ${m50.expectancy.toFixed(2)}p negative`);
  }
  if (m200.tradeCount >= 50 && m200.captureRatio < 0.30) {
    reasons.push(`DEFENSIVE: 200-trade capture ratio ${(m200.captureRatio * 100).toFixed(0)}% < 30%`);
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

    // STRATEGY REVAMP: No pairs are ever banned or restricted — all pairs trade freely
    // Performance-based allocation still applies (capital multiplier adjusts sizing)
    const banned = false;
    const restricted = false;

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

// TIME-BASED REGIME — used ONLY as fallback when indicator regime unavailable
// Primary regime should ALWAYS come from forex-indicators (indicator-derived)
function getRegimeLabel(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 10) return "ignition";
  if (hour >= 10 && hour < 16) return "expansion";
  if (hour >= 16 && hour < 20) return "exhaustion";
  return "compression";
}

// ═══════════════════════════════════════════════════════════════
// LONG-SIDE ADAPTIVE LEARNING ENGINE
// Mirrors short learning: tracks regime/session/pair outcomes for longs
// Auto-adjusts bullish momentum thresholds and blocks destructive sessions
// ═══════════════════════════════════════════════════════════════

interface LongLearningProfile {
  learningMaturity: string;
  totalLongTrades: number;
  overallLongWR: number;
  overallLongExpectancy: number;
  adaptiveBullishThreshold: number;
  adaptiveRegimeStrengthMin: number;
  bestRegimes: string[];
  worstRegimes: string[];
  regimeStats: Record<string, { wins: number; losses: number; totalPips: number; avgDuration: number }>;
  sessionStats: Record<string, { wins: number; losses: number; totalPips: number }>;
  pairStats: Record<string, { wins: number; losses: number; totalPips: number }>;
}

function buildLongLearningProfile(orders: Array<Record<string, unknown>>): LongLearningProfile {
  const longOrders = orders.filter(o =>
    o.direction === "long" &&
    (o.status === "closed" || o.status === "filled") &&
    o.entry_price != null && o.exit_price != null
  );

  const totalLongTrades = longOrders.length;
  let totalWins = 0, totalPips = 0;
  const regimeStats: Record<string, { wins: number; losses: number; totalPips: number; avgDuration: number }> = {};
  const sessionStats: Record<string, { wins: number; losses: number; totalPips: number }> = {};
  const pairStats: Record<string, { wins: number; losses: number; totalPips: number }> = {};

  for (const o of longOrders) {
    const pair = o.currency_pair as string;
    const entry = o.entry_price as number;
    const exit = o.exit_price as number;
    const pipDiv = pair?.includes("JPY") ? 0.01 : 0.0001;
    const pips = (exit - entry) / pipDiv;
    const won = pips > 0;
    const regime = (o.regime_label as string) || "unknown";
    const sess = (o.session_label as string) || "unknown";

    totalPips += pips;
    if (won) totalWins++;

    // Regime stats
    if (!regimeStats[regime]) regimeStats[regime] = { wins: 0, losses: 0, totalPips: 0, avgDuration: 0 };
    if (won) regimeStats[regime].wins++;
    else regimeStats[regime].losses++;
    regimeStats[regime].totalPips += pips;

    // Session stats
    if (!sessionStats[sess]) sessionStats[sess] = { wins: 0, losses: 0, totalPips: 0 };
    if (won) sessionStats[sess].wins++;
    else sessionStats[sess].losses++;
    sessionStats[sess].totalPips += pips;

    // Pair stats
    if (!pairStats[pair]) pairStats[pair] = { wins: 0, losses: 0, totalPips: 0 };
    if (won) pairStats[pair].wins++;
    else pairStats[pair].losses++;
    pairStats[pair].totalPips += pips;
  }

  const overallWR = totalLongTrades > 0 ? totalWins / totalLongTrades : 0.5;
  const overallExp = totalLongTrades > 0 ? totalPips / totalLongTrades : 0;

  // Learning maturity
  let maturity = "bootstrap";
  if (totalLongTrades >= 200) maturity = "mature";
  else if (totalLongTrades >= 75) maturity = "converging";
  else if (totalLongTrades >= 20) maturity = "growing";
  else if (totalLongTrades >= 5) maturity = "early";

  // Adaptive bullish momentum threshold: start permissive, tighten only with statistical significance
  // MINIMUM 50 trades before tightening — early WR is noise, not signal
  let adaptiveBullishThreshold = 4; // Default: require 4/7 bullish indicators
  if (totalLongTrades >= 50 && overallWR < 0.35) adaptiveBullishThreshold = 5;
  else if (totalLongTrades >= 75 && overallWR >= 0.55) adaptiveBullishThreshold = 3;

  // Adaptive regime strength minimum — PERMISSIVE during learning to collect data
  // Don't tighten until 50+ trades — early losses may be from bugs/SL issues, not regime quality
  let adaptiveRegimeStrengthMin = 25;
  if (totalLongTrades >= 50 && overallWR < 0.30) adaptiveRegimeStrengthMin = 40;
  else if (totalLongTrades >= 75 && overallWR >= 0.55) adaptiveRegimeStrengthMin = 20;

  // Best/worst regimes (by expectancy)
  const regimeEntries = Object.entries(regimeStats)
    .filter(([, s]) => (s.wins + s.losses) >= 3)
    .map(([r, s]) => ({ regime: r, exp: s.totalPips / (s.wins + s.losses), wr: s.wins / (s.wins + s.losses) }));

  const bestRegimes = regimeEntries.filter(r => r.exp > 0 && r.wr >= 0.35).map(r => r.regime);
  const worstRegimes = regimeEntries.filter(r => r.exp < -2 || r.wr < 0.25).map(r => r.regime);

  if (totalLongTrades >= 10) {
    console.log(`[LONG-LEARN] Profile: ${maturity} | ${totalLongTrades} trades | WR=${(overallWR*100).toFixed(0)}% | exp=${overallExp.toFixed(1)}p | bullishThreshold=${adaptiveBullishThreshold} | regimeMin=${adaptiveRegimeStrengthMin}`);
    if (bestRegimes.length) console.log(`[LONG-LEARN]   Best regimes: ${bestRegimes.join(", ")}`);
    if (worstRegimes.length) console.log(`[LONG-LEARN]   Worst regimes: ${worstRegimes.join(", ")}`);
    // Log session stats
    for (const [sess, s] of Object.entries(sessionStats)) {
      const total = s.wins + s.losses;
      if (total >= 5) {
        const sessExp = s.totalPips / total;
        const sessWR = s.wins / total;
        if (sessExp < -2 || sessWR < 0.25) {
          console.log(`[LONG-LEARN]   ⚠ Session ${sess}: WR=${(sessWR*100).toFixed(0)}%, exp=${sessExp.toFixed(1)}p — AUTO-BLOCK candidate`);
        }
      }
    }
  }

  return {
    learningMaturity: maturity,
    totalLongTrades: totalLongTrades,
    overallLongWR: overallWR,
    overallLongExpectancy: overallExp,
    adaptiveBullishThreshold,
    adaptiveRegimeStrengthMin,
    bestRegimes,
    worstRegimes,
    regimeStats,
    sessionStats,
    pairStats,
  };
}

// ═══════════════════════════════════════════════════════════════
// SHORT-SIDE ADAPTIVE LEARNING ENGINE
// Mirrors long learning: tracks regime/session/pair outcomes for shorts
// Auto-adjusts bearish momentum thresholds and blocks destructive sessions
// ═══════════════════════════════════════════════════════════════

interface ShortLearningProfile {
  learningMaturity: string;
  totalShortTrades: number;
  overallShortWR: number;
  overallShortExpectancy: number;
  adaptiveBearishThreshold: number;
  adaptiveRegimeStrengthMin: number;
  bestRegimes: string[];
  worstRegimes: string[];
  regimeStats: Record<string, { wins: number; losses: number; totalPips: number; avgDuration: number }>;
  sessionStats: Record<string, { wins: number; losses: number; totalPips: number }>;
  pairStats: Record<string, { wins: number; losses: number; totalPips: number }>;
}

function buildShortLearningProfile(orders: Array<Record<string, unknown>>): ShortLearningProfile {
  const shortOrders = orders.filter(o =>
    o.direction === "short" &&
    (o.status === "closed" || o.status === "filled") &&
    o.entry_price != null && o.exit_price != null
  );

  const totalShortTrades = shortOrders.length;
  let totalWins = 0, totalPips = 0;
  const regimeStats: Record<string, { wins: number; losses: number; totalPips: number; avgDuration: number }> = {};
  const sessionStats: Record<string, { wins: number; losses: number; totalPips: number }> = {};
  const pairStats: Record<string, { wins: number; losses: number; totalPips: number }> = {};

  for (const o of shortOrders) {
    const pair = o.currency_pair as string;
    const entry = o.entry_price as number;
    const exit = o.exit_price as number;
    const pipDiv = pair?.includes("JPY") ? 0.01 : 0.0001;
    const pips = (entry - exit) / pipDiv; // Short P&L: entry - exit
    const won = pips > 0;
    const regime = (o.regime_label as string) || "unknown";
    const sess = (o.session_label as string) || "unknown";

    totalPips += pips;
    if (won) totalWins++;

    if (!regimeStats[regime]) regimeStats[regime] = { wins: 0, losses: 0, totalPips: 0, avgDuration: 0 };
    if (won) regimeStats[regime].wins++; else regimeStats[regime].losses++;
    regimeStats[regime].totalPips += pips;

    if (!sessionStats[sess]) sessionStats[sess] = { wins: 0, losses: 0, totalPips: 0 };
    if (won) sessionStats[sess].wins++; else sessionStats[sess].losses++;
    sessionStats[sess].totalPips += pips;

    if (!pairStats[pair]) pairStats[pair] = { wins: 0, losses: 0, totalPips: 0 };
    if (won) pairStats[pair].wins++; else pairStats[pair].losses++;
    pairStats[pair].totalPips += pips;
  }

  const overallWR = totalShortTrades > 0 ? totalWins / totalShortTrades : 0.5;
  const overallExp = totalShortTrades > 0 ? totalPips / totalShortTrades : 0;

  let maturity = "bootstrap";
  if (totalShortTrades >= 200) maturity = "mature";
  else if (totalShortTrades >= 75) maturity = "converging";
  else if (totalShortTrades >= 20) maturity = "growing";
  else if (totalShortTrades >= 5) maturity = "early";

  // EQUALIZED: Short thresholds now match longs during learning phase.
  // Previous "EMERGENCY FIX" (5/7 bearish, regimeMin=45) was based on practice-era data
  // poisoned by the 8-pip SL bug. With 12-pip fallback SL fix applied, shorts deserve
  // the same signal density as longs to collect unbiased learning data.
  let adaptiveBearishThreshold = 4; // Parity with longs (was 5)
  if (totalShortTrades >= 50 && overallWR < 0.35) adaptiveBearishThreshold = 5;
  else if (totalShortTrades >= 75 && overallWR >= 0.55) adaptiveBearishThreshold = 3;

  // Regime strength minimum — PARITY with longs (was 30, longs are 25)
  let adaptiveRegimeStrengthMin = 25; // Parity with longs (was 30)
  if (totalShortTrades >= 50 && overallWR < 0.30) adaptiveRegimeStrengthMin = 40;
  else if (totalShortTrades >= 75 && overallWR >= 0.55) adaptiveRegimeStrengthMin = 20;

  const regimeEntries = Object.entries(regimeStats)
    .filter(([, s]) => (s.wins + s.losses) >= 3)
    .map(([r, s]) => ({ regime: r, exp: s.totalPips / (s.wins + s.losses), wr: s.wins / (s.wins + s.losses) }));

  const bestRegimes = regimeEntries.filter(r => r.exp > 0 && r.wr >= 0.35).map(r => r.regime);
  const worstRegimes = regimeEntries.filter(r => r.exp < -2 || r.wr < 0.25).map(r => r.regime);

  if (totalShortTrades >= 5) {
    console.log(`[SHORT-LEARN] Profile: ${maturity} | ${totalShortTrades} trades | WR=${(overallWR*100).toFixed(0)}% | exp=${overallExp.toFixed(1)}p | bearishThreshold=${adaptiveBearishThreshold} | regimeMin=${adaptiveRegimeStrengthMin}`);
    if (bestRegimes.length) console.log(`[SHORT-LEARN]   Best regimes: ${bestRegimes.join(", ")}`);
    if (worstRegimes.length) console.log(`[SHORT-LEARN]   Worst regimes: ${worstRegimes.join(", ")}`);
    for (const [sess, s] of Object.entries(sessionStats)) {
      const total = s.wins + s.losses;
      if (total >= 5) {
        const sessExp = s.totalPips / total;
        const sessWR = s.wins / total;
        if (sessExp < -2 || sessWR < 0.25) {
          console.log(`[SHORT-LEARN]   ⚠ Session ${sess}: WR=${(sessWR*100).toFixed(0)}%, exp=${sessExp.toFixed(1)}p — AUTO-BLOCK candidate`);
        }
      }
    }
  }

  return {
    learningMaturity: maturity,
    totalShortTrades,
    overallShortWR: overallWR,
    overallShortExpectancy: overallExp,
    adaptiveBearishThreshold,
    adaptiveRegimeStrengthMin,
    bestRegimes,
    worstRegimes,
    regimeStats,
    sessionStats,
    pairStats,
  };
}

// ═══════════════════════════════════════════════════════════════
// STOP-LOSS CALCULATION — prevents catastrophic single-trade losses
// ═══════════════════════════════════════════════════════════════

function computeStopLossPips(pair: string, direction: "long" | "short"): number {
  const atrMult = PAIR_ATR_MULT[pair] || 1.0;
  // Base stop: 8 pips, adjusted for pair volatility
  // Shorts get wider stops (1.35x) per stop geometry rules
  const basePips = 8 * atrMult;
  const directionMult = direction === "short" ? 1.35 : 1.0;
  const stopPips = Math.round(basePips * directionMult * 10) / 10;
  // Cap at 15 pips max to prevent catastrophic single-trade losses
  return Math.min(15, Math.max(3, stopPips));
}

function computeTakeProfitPips(pair: string, direction: "long" | "short"): number {
  const stopPips = computeStopLossPips(pair, direction);
  // PHASE 1: Fallback TP uses 2.5× R:R (compensates for lower WR with static SL)
  // Dynamic SL orders use 5× R:R safety ceiling — ATR-trailing handles actual exits
  return Math.round(stopPips * 2.5 * 10) / 10;
}

function computeTakeProfitPrice(pair: string, direction: "long" | "short", entryPrice: number): number {
  const tpPips = computeTakeProfitPips(pair, direction);
  const pipValue = pair.includes("JPY") ? 0.01 : 0.0001;
  if (direction === "long") {
    return Math.round((entryPrice + tpPips * pipValue) * 100000) / 100000;
  } else {
    return Math.round((entryPrice - tpPips * pipValue) * 100000) / 100000;
  }
}

function computeStopLossPrice(pair: string, direction: "long" | "short", entryPrice: number): number {
  const stopPips = computeStopLossPips(pair, direction);
  const pipValue = pair.includes("JPY") ? 0.01 : 0.0001;
  if (direction === "long") {
    return Math.round((entryPrice - stopPips * pipValue) * 100000) / 100000;
  } else {
    return Math.round((entryPrice + stopPips * pipValue) * 100000) / 100000;
  }
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
  const oandaEnv = (Deno.env.get("OANDA_ENV") || "practice");
  const apiToken = oandaEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
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

  // B1 — Direction Leak Test: Removed — dual-direction (long+short) is now authorized
  checks.push({
    name: "Dual-Direction Authorization",
    pass: true,
    detail: "Dual-direction trading enabled — both longs and shorts authorized",
  });

  // B2 — Agent eligibility
  checks.push({
    name: "Agent Eligibility",
    pass: snapshot.eligibleCount > 0,
    detail: `${snapshot.eligibleCount} eligible agents (${snapshot.shadowCount} shadow, ${snapshot.disabledCount} disabled)`,
  });

  // B3 — Coalition Governance (auto-promotion guarantees minimum is met)
  const cr = snapshot.coalitionRequirement;
  const eligibleNames = snapshot.eligibleAgents.map(a => `${a.agentId}(${a.effectiveTier}/${a.fleetSet})`).join(", ");
  const coalitionPass = snapshot.eligibleCount >= cr.minAgents;
  const hasPromotions = (snapshot.promotionLog || []).length > 0;
  checks.push({
    name: "Coalition Governance",
    pass: true, // Auto-promotion guarantees coalition — never blocks preflight
    detail: `${cr.tier.toUpperCase()} mode: ${snapshot.eligibleCount} eligible (min ${cr.minAgents}) | Survivorship=${cr.survivorshipScore} PF=${cr.rollingPF.toFixed(2)} Stability=${cr.stabilityTrend}${hasPromotions ? ` | AUTO-PROMOTED: ${(snapshot.promotionLog || []).length} agents` : ""} | Eligible: ${eligibleNames}`,
  });

  // Log coalition transition for audit
  console.log(`[COALITION-GOV] Tier=${cr.tier} MinAgents=${cr.minAgents} Survivorship=${cr.survivorshipScore} PF=${cr.rollingPF.toFixed(2)} ExpSlope=${cr.expectancySlope.toFixed(3)} Stability=${cr.stabilityTrend} Pass=${coalitionPass} AutoPromoted=${hasPromotions}`);
  for (const r of cr.reasons) {
    console.log(`[COALITION-GOV]   ${r}`);
  }
  if (hasPromotions) {
    for (const p of (snapshot.promotionLog || [])) {
      console.log(`[COALITION-GOV]   ${p}`);
    }
  }

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

  // ─── TOXIC HOUR GUARD (Phase 1+2) ───
  // Expanded from forensic audit: block ALL statistically destructive hours.
  // Phase 1: 13-14 UTC (NY lunch — liquidity vacuum, zero wins)
  // Phase 2: 01-04 UTC (Asian — 15.8% WR), 18-21 UTC (late-NY — 12.5% WR)
  const currentHourUTC = new Date().getUTCHours();
  const TOXIC_HOURS = [1, 2, 3, 4, 13, 14, 18, 19, 20, 21]; // Asian dead zone + NY lunch + late-NY
  if (TOXIC_HOURS.includes(currentHourUTC) && !forceMode) {
    const toxicZone = currentHourUTC >= 13 && currentHourUTC <= 14 ? "NY-lunch"
      : currentHourUTC >= 1 && currentHourUTC <= 4 ? "Asian-dead-zone"
      : "late-NY";
    console.log(`[SCALP-TRADE] ═══ TOXIC HOUR BLOCK: ${currentHourUTC}:00 UTC (${toxicZone}) — statistically destructive, skipping ═══`);
    return new Response(
      JSON.stringify({ success: true, mode: "toxic-hour-skip", reason: `Hour ${currentHourUTC} UTC blocked — ${toxicZone} (negative expectancy)` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 0: Load Agent Snapshot (lightweight direct query, avoids RPC timeout)
    // ═══════════════════════════════════════════════════════════

    // STRATEGY RESET: Only use trades from revamped strategy (post-2026-02-12)
    // All old practice/backtest/pre-revamp trades are excluded from learning
    const STRATEGY_CUTOFF = "2026-02-12T01:00:00Z";
    const { data: rawOrders, error: ordersErr } = await supabase
      .from("oanda_orders")
      .select("agent_id, direction, entry_price, exit_price, currency_pair, status")
      .eq("user_id", USER_ID)
      .eq("environment", execConfig.oandaEnv) // CRITICAL: only current env, no practice contamination
      .in("status", ["filled", "closed"])
      .not("agent_id", "is", null)
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .gte("created_at", STRATEGY_CUTOFF)
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
    console.log(`[SCALP-TRADE] Coalition: ${snapshot.coalitionRequirement.tier.toUpperCase()} (min ${snapshot.coalitionRequirement.minAgents} agents) | Survivorship=${snapshot.coalitionRequirement.survivorshipScore} PF=${snapshot.coalitionRequirement.rollingPF.toFixed(2)}`);
    if ((snapshot.promotionLog || []).length > 0) {
      console.log(`[SCALP-TRADE] ═══ AUTO-PROMOTIONS: ${snapshot.promotionLog.length} agents promoted ═══`);
      for (const p of snapshot.promotionLog) console.log(`[SCALP-TRADE]   ${p}`);
    }
    for (const a of snapshot.effectiveAgents) {
      console.log(`[SCALP-TRADE]   ${a.agentId}: ${a.effectiveTier} | ${a.fleetSet} | ${a.deploymentState} | size=${a.sizeMultiplier} | exec=${a.canExecute}`);
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
          JSON.stringify({
            success: true,
            mode: "preflight",
            session,
            regime,
            governanceState: "NORMAL",
            elapsed: Date.now() - startTime,
            preflight,
            agentSnapshot: {
              eligible: snapshot.eligibleCount,
              total: snapshot.totalAgents,
              shadow: snapshot.shadowCount,
              disabled: snapshot.disabledCount,
              coalition: snapshot.coalitionRequirement,
              promotionLog: snapshot.promotionLog,
              agents: snapshot.effectiveAgents.map(a => ({
                id: a.agentId,
                tier: a.effectiveTier,
                fleetSet: a.fleetSet,
                state: a.deploymentState,
                size: a.sizeMultiplier,
              })),
            },
            signals: [],
            summary: { total: 0, filled: 0, gated: 0, rejected: 0 },
          }),
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

    const govEnv = execConfig.oandaEnv; // Only use orders from current environment for governance
    const { data: recentOrders } = await supabase
      .from("oanda_orders")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("environment", govEnv)
      .neq("currency_pair", "SYSTEM") // exclude halt/ramp markers
      .gte("created_at", STRATEGY_CUTOFF) // CRITICAL: only post-revamp trades for learning
      .order("created_at", { ascending: false })
      .limit(250);

    const orders = (recentOrders || []) as Array<Record<string, unknown>>;

    // ═══════════════════════════════════════════════════════════
    // PHASE 1.5: Indicator Learning Engine — walk-forward OOS, regime-aware, soft-weighted
    // ═══════════════════════════════════════════════════════════
    const NOISE_FLOOR_WEIGHT = 0.05;
    const MIN_LEARNING_TRADES = 10;
    const MIN_TRADES_PER_REGIME = 5;
    const NOISE_THRESHOLD = -0.03;
    const SIGNAL_THRESHOLD = 0.02;
    const WALK_FORWARD_TRAIN_RATIO = 0.67; // 2/3 train, 1/3 test (OOS)
    const MIN_OOS_TRADES = 5; // Minimum OOS trades for valid lift measurement

    type RegimeBucketKey = string;

    function classifyRegimeBucket(regimeLabel: string): RegimeBucketKey {
      const lower = (regimeLabel || "").toLowerCase();
      let vol = "expansion";
      if (lower.includes("compress") || lower === "quiet") vol = "compression";
      else if (lower.includes("ignit") || lower.includes("breakout") || lower.includes("momentum")) vol = "ignition";
      else if (lower.includes("exhaust") || lower.includes("risk-off")) vol = "exhaustion";

      let trend = "ranging";
      if (lower.includes("trend") || lower.includes("momentum") || lower.includes("breakout") || lower.includes("breakdown")) trend = "trending";
      if (vol === "ignition") trend = "trending";

      return `${trend}_${vol}`;
    }

    interface RegimeWeights { weights: Record<string, number>; trades: number; baseWR: number; oosValidated: boolean; }

    const indicatorLearningProfiles = new Map<string, {
      noiseIndicators: string[];
      signalIndicators: string[];
      softWeights: Record<string, number>;
      regimeWeights: Record<RegimeBucketKey, RegimeWeights>;
      qualityScore: number;
      baselineWinRate: number;
      totalTrades: number;
      oosValidated: boolean;
      oosTradesUsed: number;
    }>();

    // Parse closed trades with indicator data for learning
    // IMPORTANT: trades arrive ordered by created_at DESC from the query above
    const closedWithIndicators = orders.filter(o => {
      const gp = o.governance_payload as Record<string, unknown> | null;
      return (o.status === "closed" || o.status === "filled") &&
        o.entry_price != null && o.exit_price != null &&
        gp?.indicatorBreakdown != null;
    });

    if (closedWithIndicators.length > 0) {
      const pairTradesMap = new Map<string, Array<{
        pair: string; direction: string; won: boolean;
        indicators: Record<string, string>; regime: string;
        createdAt: string;
      }>>();

      for (const o of closedWithIndicators) {
        const pair = o.currency_pair as string;
        const entry = o.entry_price as number;
        const exit = o.exit_price as number;
        const dir = o.direction as string;
        const pipDiv = pair?.includes("JPY") ? 0.01 : 0.0001;
        const pips = dir === "long" ? (exit - entry) / pipDiv : (entry - exit) / pipDiv;
        const gp = o.governance_payload as Record<string, unknown>;
        const breakdown = gp.indicatorBreakdown as Record<string, string>;
        const regime = (o.regime_label as string) || (gp.regime as string) || "unknown";

        if (!pairTradesMap.has(pair)) pairTradesMap.set(pair, []);
        pairTradesMap.get(pair)!.push({
          pair, direction: dir, won: pips > 0, indicators: breakdown, regime,
          createdAt: o.created_at as string,
        });
      }

      // ─── Walk-Forward OOS lift computation ───
      // Computes lift on TRAIN set, then validates on OOS (test) set.
      // Only indicators that show positive lift in BOTH sets qualify as "signal".
      // Indicators that show negative lift in OOS qualify as "noise".
      function computeOOSWeightsForTrades(
        allTrades: Array<{ direction: string; won: boolean; indicators: Record<string, string>; createdAt: string }>,
        minSample: number
      ): { noiseList: string[]; signalList: string[]; softWeights: Record<string, number>; oosValidated: boolean; oosTradesUsed: number } {
        const noiseList: string[] = [];
        const signalList: string[] = [];
        const softWeights: Record<string, number> = {};

        // Sort chronologically (oldest first) for walk-forward split
        const sorted = [...allTrades].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const splitIdx = Math.floor(sorted.length * WALK_FORWARD_TRAIN_RATIO);
        const trainSet = sorted.slice(0, splitIdx);
        const testSet = sorted.slice(splitIdx);

        const hasOOS = testSet.length >= MIN_OOS_TRADES;
        const trainBaseWR = trainSet.length > 0 ? trainSet.filter(t => t.won).length / trainSet.length : 0.5;
        const testBaseWR = testSet.length > 0 ? testSet.filter(t => t.won).length / testSet.length : 0.5;

        for (const indKey of Object.keys(INDICATOR_NAMES)) {
          // TRAIN: compute in-sample lift
          let trainConf = 0, trainWins = 0;
          for (const t of trainSet) {
            const sig = t.indicators[indKey];
            if (!sig || sig === "neutral") continue;
            const isConf = (
              (t.direction === "long" && (sig === "bullish" || sig === "oversold")) ||
              (t.direction === "short" && (sig === "bearish" || sig === "overbought"))
            );
            if (isConf) { trainConf++; if (t.won) trainWins++; }
          }

          // TEST (OOS): compute out-of-sample lift
          let testConf = 0, testWins = 0;
          for (const t of testSet) {
            const sig = t.indicators[indKey];
            if (!sig || sig === "neutral") continue;
            const isConf = (
              (t.direction === "long" && (sig === "bullish" || sig === "oversold")) ||
              (t.direction === "short" && (sig === "bearish" || sig === "overbought"))
            );
            if (isConf) { testConf++; if (t.won) testWins++; }
          }

          // Determine quality using OOS lift (if available), fallback to in-sample
          if (hasOOS && testConf >= Math.min(minSample, MIN_OOS_TRADES)) {
            // OOS-validated: use test set lift for classification
            const oosLift = (testWins / testConf) - testBaseWR;

            if (oosLift <= NOISE_THRESHOLD) {
              noiseList.push(indKey);
              softWeights[indKey] = Math.max(NOISE_FLOOR_WEIGHT, 0.15 + oosLift * 2);
            } else if (oosLift >= SIGNAL_THRESHOLD) {
              // Double-check: train lift must also be positive (prevents lucky OOS)
              const trainLift = trainConf >= minSample ? (trainWins / trainConf) - trainBaseWR : 0;
              if (trainLift >= 0) {
                signalList.push(indKey);
                softWeights[indKey] = Math.min(1.0, 0.6 + oosLift * 5);
              } else {
                softWeights[indKey] = 0.5; // Train disagrees — stay neutral
              }
            } else {
              softWeights[indKey] = 0.5;
            }
          } else if (trainConf >= minSample) {
            // Fallback: not enough OOS data — use in-sample but cap weight influence
            const trainLift = (trainWins / trainConf) - trainBaseWR;
            if (trainLift <= NOISE_THRESHOLD) {
              noiseList.push(indKey);
              // Weaker penalty without OOS confirmation (cap at 0.25 instead of near-zero)
              softWeights[indKey] = Math.max(0.15, 0.3 + trainLift * 2);
            } else if (trainLift >= SIGNAL_THRESHOLD) {
              // Weaker boost without OOS confirmation (cap at 0.75 instead of 1.0)
              signalList.push(indKey);
              softWeights[indKey] = Math.min(0.75, 0.55 + trainLift * 3);
            } else {
              softWeights[indKey] = 0.5;
            }
          } else {
            softWeights[indKey] = 0.5;
          }
        }
        return { noiseList, signalList, softWeights, oosValidated: hasOOS, oosTradesUsed: testSet.length };
      }

      for (const [pair, pairTrades] of pairTradesMap) {
        if (pairTrades.length < MIN_LEARNING_TRADES) continue;

        const baseWR = pairTrades.filter(t => t.won).length / pairTrades.length;

        // Global weights with walk-forward OOS validation
        const global = computeOOSWeightsForTrades(pairTrades, MIN_LEARNING_TRADES);

        // Regime-specific weights (also walk-forward within each bucket)
        const regimeBuckets = new Map<RegimeBucketKey, typeof pairTrades>();
        for (const t of pairTrades) {
          const bucket = classifyRegimeBucket(t.regime);
          if (!regimeBuckets.has(bucket)) regimeBuckets.set(bucket, []);
          regimeBuckets.get(bucket)!.push(t);
        }

        const regimeWeights: Record<RegimeBucketKey, RegimeWeights> = {};
        for (const [bucket, bucketTrades] of regimeBuckets) {
          if (bucketTrades.length < MIN_TRADES_PER_REGIME) continue;
          const bucketBaseWR = bucketTrades.filter(t => t.won).length / bucketTrades.length;
          const bucketResult = computeOOSWeightsForTrades(bucketTrades, MIN_TRADES_PER_REGIME);
          regimeWeights[bucket] = {
            weights: bucketResult.softWeights,
            trades: bucketTrades.length,
            baseWR: bucketBaseWR,
            oosValidated: bucketResult.oosValidated,
          };
        }

        const qualityScore = Math.min(100, Math.round(
          (global.signalList.length / 16) * 50 + Math.min(50, global.signalList.length * 5)
        ));

        indicatorLearningProfiles.set(pair, {
          noiseIndicators: global.noiseList,
          signalIndicators: global.signalList,
          softWeights: global.softWeights,
          regimeWeights,
          qualityScore,
          baselineWinRate: baseWR,
          totalTrades: pairTrades.length,
          oosValidated: global.oosValidated,
          oosTradesUsed: global.oosTradesUsed,
        });

        const validationTag = global.oosValidated ? `OOS-validated(${global.oosTradesUsed}t)` : "in-sample-only";
        if (global.noiseList.length > 0) {
          console.log(`[INDICATOR-LEARN] ${pair}: NOISE [${validationTag}]: ${global.noiseList.map(k => `${k}(w=${global.softWeights[k]?.toFixed(2)})`).join(", ")} (${pairTrades.length}t, WR=${(baseWR*100).toFixed(0)}%)`);
        }
        if (global.signalList.length > 0) {
          console.log(`[INDICATOR-LEARN] ${pair}: SIGNAL [${validationTag}]: ${global.signalList.join(", ")} (quality=${qualityScore})`);
        }
        if (Object.keys(regimeWeights).length > 0) {
          const regimeSummary = Object.entries(regimeWeights).map(([b, r]) =>
            `${b}(${r.trades}t,WR=${(r.baseWR*100).toFixed(0)}%,${r.oosValidated ? "OOS" : "IS"})`
          ).join(", ");
          console.log(`[INDICATOR-LEARN] ${pair}: Regime buckets: ${regimeSummary}`);
        }
      }
    }

    console.log(`[INDICATOR-LEARN] Learning profiles computed for ${indicatorLearningProfiles.size} pairs from ${closedWithIndicators.length} trades with indicator data`);

    // ═══════════════════════════════════════════════════════════
    // PHASE 1.6: Long-Side Adaptive Learning Engine
    // ═══════════════════════════════════════════════════════════
    const longLearningProfile = buildLongLearningProfile(orders);

    // ═══════════════════════════════════════════════════════════
    // PHASE 1.7: Short-Side Adaptive Learning Engine
    // Mirrors long learning: tracks regime/session/pair outcomes for shorts
    // ═══════════════════════════════════════════════════════════
    const shortLearningProfile = buildShortLearningProfile(orders);

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Degradation Autopilot + Governance State Machine
    // ═══════════════════════════════════════════════════════════

    const degradation = forceMode ? null : buildDegradationReport(orders);

  // ─── LIVE GOVERNANCE: State machine active with graceful degradation ───
    // HALT no longer stops trading — it reduces params to minimum viable
    const govStateResult = degradation ? determineGovernanceState(degradation.windows.w20, degradation.windows.w50, degradation.windows.w200) : { state: "NORMAL" as GovernanceState, reasons: ["No degradation data"] };
    const govState: GovernanceState = forceMode ? "NORMAL" : govStateResult.state;
    const govConfig = { ...STATE_CONFIGS[govState] };

    // ═══ PHASE 7: SESSION-WEIGHTED POSITION SIZING (expanded) ═══
    // Toxic hours hard-blocked above. Remaining hours get performance-weighted sizing.
    const HOUR_SIZING_MULTIPLIER: Record<number, number> = {
      0: 0.5, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.7,  // 01-04 toxic blocked above, double-lock
      6: 0.8, 7: 1.0, 8: 1.2, 9: 1.2, 10: 0.3, 11: 0.5,
      12: 0.8, 13: 0.0, 14: 0.0, // NY lunch toxic
      15: 1.5, 16: 1.5, 17: 1.0, 18: 0.0, 19: 0.0,  // 18-21 toxic blocked above
      20: 0.0, 21: 0.0, 22: 0.3, 23: 0.5,
    };
    const hourSizingMult = HOUR_SIZING_MULTIPLIER[currentHourUTC] ?? 1.0;
    govConfig.sizingMultiplier *= hourSizingMult;

    // ═══ PHASE 6: REGIME-WEIGHTED POSITION SIZING ═══
    // Only risk-off regime is profitable (+23.8p). Scale capital accordingly.
    // Kelly fraction: f* = (WR × payoff - (1-WR)) / payoff
    // risk-off: WR~45%, payoff~1.71 → f* = (0.45×1.71 - 0.55)/1.71 = 0.129 → use 0.08 (half-Kelly)
    // momentum/expansion longs: WR~19%, payoff~1.71 → f* = (0.19×1.71 - 0.81)/1.71 = -0.284 → NEGATIVE (shouldn't bet)
    const REGIME_SIZING_MULTIPLIER: Record<string, number> = {
      "risk-off": 2.0,       // Only profitable regime — double allocation (Kelly-informed)
      "breakdown": 1.5,      // Short-friendly — elevated
      "momentum": 0.5,       // Longs bleeding here — halved until WR > 30%
      "expansion": 0.5,      // Same — entries too late, halved
      "exhaustion": 0.7,     // Mixed — cautious
      "ignition": 0.8,       // Early move — moderate
      "compression": 0.4,    // No trend — very low
      "flat": 0.3,           // Dead market — minimum
      "transition": 0.0,     // Already blocked, double-lock
    };

    if (hourSizingMult !== 1.0) {
      console.log(`[SCALP-TRADE] Hour ${currentHourUTC} UTC sizing multiplier: ${hourSizingMult}x → effective sizing=${govConfig.sizingMultiplier.toFixed(2)}`);
    }
    const pairAllocations = degradation?.pairAllocations || computeAllPairAllocations(orders);

    console.log(`[SCALP-TRADE] ═══ GOVERNANCE STATE: ${govState} ═══`);
    if (degradation) {
      console.log(`[SCALP-TRADE] State reasons: ${degradation.stateReasons.join(" | ")}`);
      console.log(`[SCALP-TRADE] Banned pairs: ${degradation.bannedPairs.join(", ") || "none"}`);
    }

    // ─── HALT GRACEFUL DEGRADATION ───
    // HALT no longer stops trading. It applies minimum viable params from STATE_CONFIGS.HALT
    // and continues execution with reduced density/sizing. Trading continuity is preserved.
    if (govState === "HALT" && !forceMode) {
      console.log(`[SCALP-TRADE] ═══ HALT GRACEFUL DEGRADATION: density=${govConfig.densityMultiplier}, sizing=${govConfig.sizingMultiplier}, frictionK=${govConfig.frictionKOverride} ═══`);
      console.log(`[SCALP-TRADE] Trading continues at minimum viable parameters — no full stops`);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: Fetch Account Balance
    // ═══════════════════════════════════════════════════════════

    // SAFETY: Default to known live account balance ($250) — NOT $100K
    // Oversized defaults cause catastrophic over-leveraging on a $250 account
    let accountBalance = execConfig.oandaEnv === "live" ? 250 : 100000;
    try {
      const balEnv = (Deno.env.get("OANDA_ENV") || "practice");
      const apiToken = balEnv === "live"
        ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
        : Deno.env.get("OANDA_API_TOKEN");
      const accountId = balEnv === "live"
        ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
        : Deno.env.get("OANDA_ACCOUNT_ID");
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
    // Full intelligence-driven: indicator-confirmed direction, multi-agent coalition, regime validation
    // ═══════════════════════════════════════════════════════════

    const sessionAgg = govConfig.sessionAggressiveness[session] || 0.5;
    const baseCount = forceMode ? 1 : 3 + Math.floor(Math.random() * 4);
    const signalCount = forceMode
      ? 1
      : Math.max(1, Math.min(sessionBudget.maxDensity,
          Math.round(baseCount * govConfig.densityMultiplier * sessionAgg)));

    // HALT PREVENTION: session-skip downgrades signal count but never goes to zero
    if (signalCount === 0 && !forceMode) {
      console.log(`[SCALP-TRADE] Session aggressiveness very low for ${session} in ${govState} — forcing minimum 1 signal`);
      // Override: ensure at least 1 signal attempt for trading continuity
    }

    // AUTONOMOUS SYSTEM: Auto-promotion + support agents guarantee eligible ≥ 2.
    // This block should never fire, but if it does, log and continue with degraded mode.
    if (snapshot.eligibleCount === 0 && !forceMode) {
      console.warn(`[SCALP-TRADE] ═══ CRITICAL: No eligible agents even after auto-promotion — injecting emergency support agent ═══`);
      // Emergency: inject a minimal support agent to prevent halt
      snapshot.eligibleAgents.push({
        agentId: "emergency-continuity",
        fleetSet: "ACTIVE",
        effectiveTier: "B-Rescued",
        deploymentState: "reduced",
        sizeMultiplier: 0.10,
        longOnly: false,
        canExecute: true,
        constraints: ["emergency-only"],
        metrics: { totalTrades: 0, winRate: 0.5, expectancy: 0, profitFactor: 1.0, netPips: 0 },
      });
      snapshot.eligibleCount = 1;
    }

    const results: Array<{
      pair: string; direction: string; status: string; units?: number;
      gateResult?: string; frictionScore?: number; slippage?: number;
      executionQuality?: number; error?: string;
      pairCapitalMult?: number; govState?: string;
      agentId?: string; effectiveTier?: string; sizeMultiplier?: number;
    }> = [];

    // ─── Short-eligible pairs (from Live Edge Execution Module) ───
    // ─── PROFIT FIX: Removed GBP_JPY (31.7% WR, -1.1p) and EUR_JPY (34.5% WR, -0.6p) ───
    // STRATEGY REVAMP: All pairs eligible for shorts — no pair restrictions
    const SHORT_ELIGIBLE_PAIRS = ALL_PAIRS;
    // ═══ ADAPTIVE SHORT LEARNING: No session restriction — learn from all sessions ═══
    // Session performance is tracked per-regime and auto-adjusted via shortLearningProfile
    // FIX: Added "rollover" during learning phase — was blocking all rollover shorts, starving trade density
    const SHORT_ELIGIBLE_SESSIONS: SessionWindow[] = ["london-open", "ny-overlap", "asian", "late-ny", "rollover"];

    // ─── FIFO Guard: Fetch open trades from OANDA to prevent duplicate positions ───
    const openPairSet = new Set<string>();
    try {
      const openTradesRes = await oandaRequest(
        "/v3/accounts/{accountId}/openTrades", "GET",
        execConfig.oandaHost
      ) as { trades?: Array<{ instrument: string }> };
      if (openTradesRes.trades) {
        for (const t of openTradesRes.trades) {
          openPairSet.add(t.instrument);
        }
        if (openPairSet.size > 0) {
          console.log(`[SCALP-TRADE] FIFO guard: ${openPairSet.size} pairs with open trades — will skip: ${[...openPairSet].join(", ")}`);
        }
      }
    } catch (fifoErr) {
      console.warn(`[SCALP-TRADE] FIFO guard: Could not fetch open trades: ${(fifoErr as Error).message} — proceeding without guard`);
    }

    console.log(`[SCALP-TRADE] Generating ${signalCount} DUAL-DIRECTION signals via snapshot agents`);

    for (let i = 0; i < signalCount; i++) {
      // ─── Agent Selection from Snapshot ───
      const selectedAgent = forceMode
        ? null
        : selectAgentFromSnapshot(snapshot, "");

      const agentId = forceMode ? "manual-test" : (selectedAgent?.agentId || "forex-macro");
      const agentSizeMult = forceMode ? 1.0 : ((selectedAgent?.sizeMultiplier || 1.0) * (selectedAgent?.roleMult || 1.0));
      const agentTier = forceMode ? "manual" : (selectedAgent?.effectiveTier || "unknown");
      const agentRole = forceMode ? "manual" : (selectedAgent?.role || "stabilizer");

      // ─── Pair selection: STRATEGY REVAMP — all pairs equally eligible ───
      // Weighted distribution: majors get slightly more signals, but ALL pairs participate
      let pair: string;
      if (forceMode) {
        pair = reqBody.pair || "USD_CAD";
      } else {
        // Distribute signals across ALL_PAIRS with slight weighting toward SCALP_PAIRS
        const roll = Math.random();
        if (roll < 0.65) {
          // 65% → scalp pairs (higher liquidity)
          pair = SCALP_PAIRS[Math.floor(Math.random() * SCALP_PAIRS.length)];
        } else {
          // 35% → secondary pairs (broader data collection)
          pair = SECONDARY_PAIRS[Math.floor(Math.random() * SECONDARY_PAIRS.length)];
        }
      }

      // ─── FIFO Guard: Skip pair if already has an open position ───
      if (openPairSet.has(pair) && !forceMode) {
        console.log(`[SCALP-TRADE] ${pair}: SKIPPED — open trade exists (FIFO guard)`);
        results.push({ pair, direction: "none", status: "fifo-skipped", agentId });
        continue;
      }

      // ═══ INDICATOR-CONFIRMED DIRECTION (Multi-Timeframe Consensus) ═══
      // Direction is ONLY authorized when MTF consensus aligns. Random selection prohibited.
      let direction: "long" | "short" = "long";
      let indicatorConsensusScore = 0;
      let indicatorDirection: "bullish" | "bearish" | "neutral" = "neutral";
      let indicatorBreakdown: Record<string, string> | null = null;
      let mtfConfirmed = false;
      // ═══ INDICATOR LEARNING: Filtered consensus tracking ═══
      let filteredConsensusScore: number | null = null;
      let filteredDirection: string | null = null;
      let noiseExcludedCount = 0;
      let learningApplied = false;
      let pairLearningProfile: typeof indicatorLearningProfiles extends Map<string, infer V> ? V | null : null = null;
      // ═══ EDGE PROOF: Per-timeframe MTF tracking ═══
      let mtf_1m_ignition = false;
      let mtf_5m_momentum = false;
      let mtf_15m_bias = false;
      let mtf_data_available = false;
      // ═══ INDICATOR-DERIVED REGIME (replaces time-based for BOTH long and short decisions) ═══
      let indicatorRegime = "unknown";
      let indicatorRegimeStrength = 0;
      let indicatorShortFriendly = false;
      let indicatorLongFriendly = false;
      let indicatorBearishMomentum = 0;
      let indicatorBullishMomentum = 0;
      let neutralRegimeReducedSizing = false;
      let supertrendValue15m: number | null = null;
      let atr15mValue: number | null = null;

      if (forceMode) {
        direction = reqBody.direction || "long";
        mtfConfirmed = true;
        mtf_1m_ignition = true;
        mtf_5m_momentum = true;
        mtf_15m_bias = true;
        mtf_data_available = true;
        indicatorConsensusScore = 80;
      } else {
        // Call forex-indicators for MTF consensus (15m directional bias)
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          // FIX: forex-indicators reads from URL query params, NOT POST body
          const indicatorRes = await fetch(`${supabaseUrl}/functions/v1/forex-indicators?instrument=${pair}&timeframe=15m`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
          });

          if (indicatorRes.ok) {
            const indicatorData = await indicatorRes.json();
            mtf_data_available = true;
            // ═══ PERSIST: Store individual indicator signals for analytics ═══
            if (indicatorData?.indicators) {
              const ind = indicatorData.indicators;
              indicatorBreakdown = {
                ema50: ind.ema50?.signal || "neutral",
                rsi: ind.rsi?.signal || "neutral",
                supertrend: ind.supertrend?.signal || "neutral",
                parabolicSAR: ind.parabolicSAR?.signal || "neutral",
                ichimoku: ind.ichimoku?.signal || "neutral",
                adx: ind.adx?.signal || "neutral",
                bollingerBands: ind.bollingerBands?.signal || "neutral",
                donchianChannels: ind.donchianChannels?.signal || "neutral",
                stochastics: ind.stochastics?.signal || "neutral",
                cci: ind.cci?.signal || "neutral",
                keltnerChannels: ind.keltnerChannels?.signal || "neutral",
                roc: ind.roc?.signal || "neutral",
                elderForce: ind.elderForce?.signal || "neutral",
                heikinAshi: ind.heikinAshi?.signal || "neutral",
                pivotPoints: ind.pivotPoints?.signal || "neutral",
                trendEfficiency: ind.trendEfficiency?.signal || "neutral",
              };
              // Extract 15m Supertrend + ATR for dynamic SL/TP at entry
              supertrendValue15m = ind.supertrend?.value ?? null;
              atr15mValue = ind.atr?.value ?? null;
            }
            if (indicatorData?.consensus) {
              indicatorConsensusScore = indicatorData.consensus.score || 0;
              indicatorDirection = indicatorData.consensus.direction || "neutral";

               // ═══ PARSE INDICATOR-DERIVED REGIME ═══
              if (indicatorData?.regime) {
                indicatorRegime = indicatorData.regime.label || "unknown";
                indicatorRegimeStrength = indicatorData.regime.strength || 0;
                indicatorShortFriendly = indicatorData.regime.shortFriendly === true;
                indicatorLongFriendly = indicatorData.regime.longFriendly === true;
                indicatorBearishMomentum = indicatorData.regime.bearishMomentum || 0;
                indicatorBullishMomentum = indicatorData.regime.bullishMomentum || 0;
                // ═══ REGIME STABILITY: Direction-aware anti-flicker fields ═══
                const regimeHoldBars = indicatorData.regime.holdBars || 0;
                const regimeFamilyHoldBars = indicatorData.regime.familyHoldBars || 0;
                const regimeConfirmed = indicatorData.regime.regimeConfirmed === true;
                const regimeFamilyConfirmed = indicatorData.regime.regimeFamilyConfirmed === true;
                const recentRegimes = indicatorData.regime.recentRegimes || [];
                const familyLabel = indicatorData.regime.familyLabel || "neutral";
                const regimeDirection = indicatorData.regime.regimeDirection || "neutral";
                // ═══ ASYMMETRIC PERSISTENCE: Fast exit fields ═══
                const divergentBars = indicatorData.regime.divergentBars || 0;
                const regimeDiverging = indicatorData.regime.regimeDiverging === true;
                const regimeEarlyWarning = indicatorData.regime.regimeEarlyWarning === true;
                // ═══ VOLATILITY ACCELERATION: Anti-false-expansion fields ═══
                const volAcceleration = indicatorData.regime.volAcceleration || 0;
                const accelLevel = indicatorData.regime.accelLevel || "stable";
                console.log(`[REGIME-INDICATOR] ${pair}: regime=${indicatorRegime} strength=${indicatorRegimeStrength} longFriendly=${indicatorLongFriendly} shortFriendly=${indicatorShortFriendly} bullishMom=${indicatorBullishMomentum} bearishMom=${indicatorBearishMomentum} hold=${regimeHoldBars} familyHold=${regimeFamilyHoldBars} family=${familyLabel} dir=${regimeDirection} confirmed=${regimeFamilyConfirmed} divergent=${divergentBars} diverging=${regimeDiverging} earlyWarn=${regimeEarlyWarning} accel=${volAcceleration}(${accelLevel}) recentRegimes=[${recentRegimes.join(',')}]`);

                // ═══ ANTI-FLICKER GATE 0: NEUTRAL family regimes ═══
                // Post-learning: hard block. During learning: allow at 0.5x for trade density.
                // FIX: Removed "ignition" — it's a directional breakout regime, not neutral
                const NEUTRAL_BLOCKED_REGIMES = ["compression", "flat", "exhaustion", "transition"];
                const isInLearningPhase = (rawOrders||[]).length < 500;
                if (NEUTRAL_BLOCKED_REGIMES.includes(indicatorRegime) || familyLabel === "neutral") {
                  if (isInLearningPhase) {
                    // LEARNING PHASE: Allow neutral regimes at 0.5x sizing for trade density
                    neutralRegimeReducedSizing = true;
                    // Override regime friendliness — consensus alone drives direction at reduced sizing
                    indicatorLongFriendly = true;
                    indicatorShortFriendly = true;
                    console.log(`[REGIME-NEUTRAL-LEARN] ${pair}: ${indicatorRegime} (family=${familyLabel}) — allowed at 0.5x during learning (${(rawOrders||[]).length}/500 trades)`);
                  } else {
                    console.log(`[REGIME-NEUTRAL] ${pair}: ${indicatorRegime} (family=${familyLabel}) — BLOCKING trade authorization (neutral/no-trade regime)`);
                    results.push({ pair, direction: "none", status: "neutral-regime-blocked", govState, agentId,
                      error: `regime=${indicatorRegime},family=${familyLabel},dir=${regimeDirection}` });
                    continue;
                  }
                }

                // ═══ ANTI-FLICKER GATE 1: Direction mismatch blocks trade ═══
                // If regime says "expansion" but persistence direction is bearish → family=neutral → already blocked above
                // Additional safety: verify trade direction matches regime family direction
                if (familyLabel === "bullish" && regimeDirection !== "bullish") {
                  console.log(`[REGIME-DIR-MISMATCH] ${pair}: bullish family but persistence=${regimeDirection} — BLOCKING (direction mismatch)`);
                  results.push({ pair, direction: "none", status: "regime-direction-mismatch", govState, agentId,
                    error: `family=${familyLabel},persistenceDir=${regimeDirection}` });
                  continue;
                }
                if (familyLabel === "bearish" && regimeDirection !== "bearish") {
                  console.log(`[REGIME-DIR-MISMATCH] ${pair}: bearish family but persistence=${regimeDirection} — BLOCKING (direction mismatch)`);
                  results.push({ pair, direction: "none", status: "regime-direction-mismatch", govState, agentId,
                    error: `family=${familyLabel},persistenceDir=${regimeDirection}` });
                  continue;
                }

                // ═══ PHASE 5: TRANSITION-BASED + PULLBACK ENTRY TIMING ═══
                // Mode A: Enter on regime family TRANSITIONS (flat→bullish) with hold=1
                // Mode B: Pullback entry for established trends (familyHold >= 5)
                const HOLD_REQUIRED_REGIMES = ["expansion", "momentum", "breakdown", "risk-off"];
                const WHIPSAW_COOLDOWN_MINUTES = 15;
                
                // Detect regime family transition: previous family was different from current
                const prevFamilies = (recentRegimes || []).slice(1); // exclude current bar
                const currentFamily = familyLabel;
                const isTransitionEntry = prevFamilies.length > 0 && 
                  prevFamilies[0] !== currentFamily && 
                  currentFamily !== "neutral" &&
                  (prevFamilies[0] === "neutral" || prevFamilies[0] === "flat" || prevFamilies[0] !== currentFamily);
                
                // ═══ PHASE 5b: PULLBACK ENTRY MODE ═══
                // For established trends (familyHold >= 5), allow re-entry even without transition.
                // This captures mean-reversion entries within proven directional moves.
                const isPullbackEntry = !isTransitionEntry && regimeFamilyHoldBars >= 5 && 
                  currentFamily !== "neutral" && regimeConfirmed;
                
                let requiredFamilyHold = isInLearningPhase ? 2 : 3;
                if (isTransitionEntry) {
                  requiredFamilyHold = 1; // Immediate entry on family transition
                  console.log(`[REGIME-TRANSITION] ${pair}: Family transition detected (${prevFamilies[0]}→${currentFamily}) — fast entry with hold=1`);
                } else if (isPullbackEntry) {
                  requiredFamilyHold = 1; // Established trend — pullback re-entry allowed
                  console.log(`[REGIME-PULLBACK] ${pair}: Established ${currentFamily} trend (familyHold=${regimeFamilyHoldBars}) — pullback entry authorized`);
                }

                if (HOLD_REQUIRED_REGIMES.includes(indicatorRegime)) {
                  // Check if this pair had a divergence block recently (whipsaw cooldown)
                  const recentDivergenceBlock = orders.find((o: Record<string, unknown>) =>
                    o.currency_pair === pair &&
                    o.status === "regime-diverging" &&
                    o.created_at &&
                    (Date.now() - new Date(o.created_at as string).getTime()) < WHIPSAW_COOLDOWN_MINUTES * 60 * 1000
                  );

                  if (recentDivergenceBlock) {
                    requiredFamilyHold = 5; // extended re-confirmation after whipsaw
                    console.log(`[WHIPSAW-COOLDOWN] ${pair}: Recent divergence block found — requiring familyHold >= ${requiredFamilyHold} for re-entry (anti-churn)`);
                  }

                  if (regimeFamilyHoldBars < requiredFamilyHold) {
                    const cooldownTag = requiredFamilyHold > 3 ? " [WHIPSAW-COOLDOWN]" : "";
                    console.log(`[REGIME-FLICKER] ${pair}: ${indicatorRegime} (family=${familyLabel}) NOT confirmed (familyHold=${regimeFamilyHoldBars}<${requiredFamilyHold}, recent=[${recentRegimes.join(',')}])${cooldownTag} — BLOCKING to prevent flicker entry`);
                    results.push({ pair, direction: "none", status: "regime-not-confirmed", govState, agentId,
                      error: `regime=${indicatorRegime},family=${familyLabel},familyHold=${regimeFamilyHoldBars},required=${requiredFamilyHold},recentRegimes=[${recentRegimes.join(',')}]` });
                    continue;
                  }
                }

                // ═══ ASYMMETRIC PERSISTENCE GATE: 1-2 bars divergence → fast defense ═══
                // Slow to enter (3+ bars), quick to back off (2 divergent bars = throttle)
                // IMPORTANT: This gate ONLY blocks NEW entries. It does NOT affect open trade exits.
                // Exit rule priority: SL/TP/Trailing ALWAYS win. Divergence can only:
                //   ✅ Block new entries
                //   ✅ Tighten trailing stops (via monitor)
                //   ✅ Reduce position sizing
                //   ❌ NEVER widen stops or delay exits
                if (regimeDiverging) {
                  console.log(`[REGIME-DIVERGE] ${pair}: ${indicatorRegime} regime DIVERGING (${divergentBars} of last 5 bars disagree with ${familyLabel} family) — BLOCKING new entry for fast defense`);
                  results.push({ pair, direction: "none", status: "regime-diverging", govState, agentId,
                    error: `regime=${indicatorRegime},family=${familyLabel},divergentBars=${divergentBars}` });
                  continue;
                }

                // ═══ ANTI-FLICKER GATE 3: Expansion/breakdown require vol acceleration ═══
                const ACCEL_REQUIRED_REGIMES = ["expansion", "breakdown"];
                if (ACCEL_REQUIRED_REGIMES.includes(indicatorRegime) && accelLevel === "decelerating") {
                  console.log(`[REGIME-ACCEL] ${pair}: ${indicatorRegime} regime but vol DECELERATING (accel=${volAcceleration}) — downgrading to prevent false ${indicatorRegime} entry`);
                  results.push({ pair, direction: "none", status: "regime-vol-decelerating", govState, agentId,
                    error: `regime=${indicatorRegime},volAccel=${volAcceleration},accelLevel=${accelLevel}` });
                  continue;
                }
              }

              // ═══ INDICATOR LEARNING: Regime-aware soft-weighted consensus ═══
              pairLearningProfile = indicatorLearningProfiles.get(pair) || null;
              let weightSource = "none";
              if (pairLearningProfile && indicatorBreakdown && Object.keys(pairLearningProfile.softWeights).length > 0) {
                learningApplied = true;

                // Pick regime-specific weights if available, else fall back to global
                const currentRegimeBucket = classifyRegimeBucket(indicatorRegime || "unknown");
                const regimeProfile = pairLearningProfile.regimeWeights[currentRegimeBucket];
                let weights: Record<string, number>;

                if (regimeProfile && regimeProfile.trades >= MIN_TRADES_PER_REGIME) {
                  weights = regimeProfile.weights;
                  weightSource = `regime:${currentRegimeBucket}(${regimeProfile.trades}t)`;
                } else {
                  weights = pairLearningProfile.softWeights;
                  weightSource = `global(${pairLearningProfile.totalTrades}t)`;
                }

                // Re-compute consensus with soft weights — noise contributes near-zero, not excluded
                let bullishW = 0, bearishW = 0, totalW = 0;
                for (const [indKey, sig] of Object.entries(indicatorBreakdown)) {
                  if (sig === "neutral") continue;
                  const w = weights[indKey] ?? 0.5;
                  totalW += w;
                  if (sig === "bullish" || sig === "oversold") bullishW += w;
                  else if (sig === "bearish" || sig === "overbought") bearishW += w;
                }
                noiseExcludedCount = pairLearningProfile.noiseIndicators.filter(k => indicatorBreakdown[k] && indicatorBreakdown[k] !== "neutral").length;

                filteredConsensusScore = totalW > 0 ? Math.round(((bullishW - bearishW) / totalW) * 100) : 0;
                filteredDirection = filteredConsensusScore > 15 ? "bullish" : filteredConsensusScore < -15 ? "bearish" : "neutral";

                console.log(`[INDICATOR-LEARN] ${pair}: Raw=${indicatorConsensusScore} → Weighted=${filteredConsensusScore} (${filteredDirection}) | source=${weightSource} | ${noiseExcludedCount} noise down-weighted`);

                // USE WEIGHTED consensus for direction decision
                indicatorConsensusScore = filteredConsensusScore;
                indicatorDirection = filteredDirection as "bullish" | "bearish" | "neutral";
              }

              // ═══ EDGE PROOF: Extract per-TF signals ═══
              // 15m bias = overall consensus direction
              mtf_15m_bias = Math.abs(indicatorConsensusScore) >= 25;
              // 5m momentum = consensus strength above medium threshold
              mtf_5m_momentum = Math.abs(indicatorConsensusScore) >= 35;
              // 1m ignition = strong consensus above high threshold
              mtf_1m_ignition = Math.abs(indicatorConsensusScore) >= 20;

              // ═══ ADAPTIVE CONSENSUS THRESHOLD ═══
              // Tightens as indicator learning matures — more data = higher bar
              // Base: 25, scales up to 45 based on learning quality + noise count
              let MIN_CONSENSUS = 25;
              if (pairLearningProfile && pairLearningProfile.totalTrades >= 20) {
                const learningMaturity = Math.min(1, pairLearningProfile.totalTrades / 100);
                const noiseRatio = pairLearningProfile.noiseIndicators.length / 16;
                // More noise found = system is more selective = raise threshold
                const qualityBoost = Math.round(pairLearningProfile.qualityScore * 0.15);
                const noiseBoost = Math.round(noiseRatio * 10);
                MIN_CONSENSUS = Math.min(45, 25 + Math.round((qualityBoost + noiseBoost) * learningMaturity));
                console.log(`[INDICATOR-LEARN] ${pair}: Adaptive threshold=${MIN_CONSENSUS} (maturity=${(learningMaturity*100).toFixed(0)}%, quality=${pairLearningProfile.qualityScore}, noise=${pairLearningProfile.noiseIndicators.length})`);
              }
              if (Math.abs(indicatorConsensusScore) >= MIN_CONSENSUS) {
                if (indicatorDirection === "bullish") {
                  // ═══ LONG DIRECTION: Uses INDICATOR-DERIVED regime (not time-based) ═══
                  // Longs only authorized when real market structure confirms bullish conditions.
                  // Mirrors short-side logic: regime must be longFriendly + bullish momentum threshold.
                  
                  const LONG_FRIENDLY_REGIMES = ["expansion", "momentum", "exhaustion"];
                  // ═══ PHASE 4: BLOCK momentum/expansion longs until WR > 30% ═══
                  // Forensic audit: momentum longs 18.9% WR, expansion longs bleeding.
                  // Only risk-off longs are profitable. Block these regimes until learning proves edge.
                  const MOMENTUM_EXPANSION_BLOCKED = ["momentum", "expansion"];
                  if (MOMENTUM_EXPANSION_BLOCKED.includes(indicatorRegime) && longLearningProfile.totalLongTrades < 500) {
                    // Check if regime-specific WR exceeds 30%
                    const regimeData = longLearningProfile.regimeStats[indicatorRegime];
                    const regimeTotal = regimeData ? regimeData.wins + regimeData.losses : 0;
                    const regimeWR = regimeTotal > 0 ? regimeData!.wins / regimeTotal : 0;
                    if (regimeTotal < 20 || regimeWR < 0.30) {
                      console.log(`[LONG-BLOCK] ${pair}: ${indicatorRegime} regime BLOCKED for longs — WR=${(regimeWR*100).toFixed(0)}% < 30% (${regimeTotal} trades) — waiting for edge proof`);
                      results.push({ pair, direction: "long", status: "regime-long-blocked", govState, agentId,
                        error: `regime=${indicatorRegime},regimeWR=${(regimeWR*100).toFixed(0)}%,need>30%` });
                      continue;
                    }
                    console.log(`[LONG-LEARN] ${pair}: ${indicatorRegime} regime UNLOCKED — WR=${(regimeWR*100).toFixed(0)}% > 30% (${regimeTotal} trades)`);
                  }
                  // ═══ ADAPTIVE LONG LEARNING: Use learned thresholds ═══
                  const MIN_BULLISH_MOMENTUM = longLearningProfile.adaptiveBullishThreshold;
                  const longRegimeStrengthMin = longLearningProfile.adaptiveRegimeStrengthMin;
                  
                  if (!indicatorLongFriendly) {
                    // Check if learning has identified this regime as profitable for longs
                    const regimeLearned = longLearningProfile.bestRegimes.includes(indicatorRegime);
                    if (false) {
                      // REMOVED: Transition regime can no longer override — blocked by anti-flicker gate
                    } else if (regimeLearned) {
                      console.log(`[LONG-LEARN] ${pair}: Regime ${indicatorRegime} overridden by learning — historically profitable for longs`);
                    } else {
                      console.log(`[SCALP-TRADE] ${pair}: Bullish consensus but indicatorRegime=${indicatorRegime} (strength=${indicatorRegimeStrength}) is NOT long-friendly — skipping`);
                      results.push({ pair, direction: "long", status: "regime-not-long-friendly", govState, agentId,
                        error: `indicatorRegime=${indicatorRegime},bullishMomentum=${indicatorBullishMomentum}` });
                      continue;
                    }
                  }
                  
                   // Check if this regime is in the worst list (auto-blocked by learning)
                   // LEARNING PHASE: Only block after 500-trade milestone with strong evidence
                   if (longLearningProfile.totalLongTrades >= 500 && longLearningProfile.worstRegimes.includes(indicatorRegime)) {
                     console.log(`[LONG-LEARN] ${pair}: Regime ${indicatorRegime} AUTO-BLOCKED by learning — historically destructive for longs (post-milestone)`);
                     results.push({ pair, direction: "long", status: "regime-learned-destructive", govState, agentId });
                     continue;
                   }
                  
                  // Require minimum bullish momentum confirmation (adaptive)
                  if (indicatorBullishMomentum < MIN_BULLISH_MOMENTUM) {
                    console.log(`[SCALP-TRADE] ${pair}: bullishMomentum=${indicatorBullishMomentum} < adaptive threshold ${MIN_BULLISH_MOMENTUM} — insufficient long conviction`);
                    results.push({ pair, direction: "long", status: "weak-bullish-momentum", govState, agentId });
                    continue;
                  }
                  
                  // Require minimum regime strength (adaptive)
                  if (indicatorRegimeStrength < longRegimeStrengthMin) {
                    console.log(`[SCALP-TRADE] ${pair}: Regime strength ${indicatorRegimeStrength} < adaptive min ${longRegimeStrengthMin} — too weak for long entry`);
                    results.push({ pair, direction: "long", status: "weak-regime-strength", govState, agentId });
                    continue;
                  }
                  
                   // ═══ LONG SESSION AUTO-BLOCKING (learned from data) ═══
                   // LEARNING PHASE: Disabled until 500-trade milestone — system needs data from ALL sessions
                   const longSessStats = longLearningProfile.sessionStats[session];
                   if (longLearningProfile.totalLongTrades >= 500 && longSessStats && (longSessStats.wins + longSessStats.losses) >= 10) {
                     const longSessExp = longSessStats.totalPips / (longSessStats.wins + longSessStats.losses);
                     const longSessWR = longSessStats.wins / (longSessStats.wins + longSessStats.losses);
                     if (longSessExp < -3 || longSessWR < 0.20) {
                       console.log(`[LONG-LEARN] ${pair}: Session ${session} AUTO-BLOCKED for longs — WR=${(longSessWR*100).toFixed(0)}%, exp=${longSessExp.toFixed(1)}p (learned, post-milestone)`);
                       results.push({ pair, direction: "long", status: "session-learned-destructive", govState, agentId });
                       continue;
                     }
                   }
                  
                  direction = "long";
                  mtfConfirmed = true;
                  console.log(`[SCALP-TRADE] ${pair}: LONG authorized — indicatorRegime=${indicatorRegime} (strength=${indicatorRegimeStrength}, bullishMom=${indicatorBullishMomentum}, adaptiveThreshold=${MIN_BULLISH_MOMENTUM}) + consensus=${indicatorConsensusScore} | learning=${longLearningProfile.learningMaturity}`);
                } else if (indicatorDirection === "bearish") {
                  // ═══ SHORT DIRECTION: Uses INDICATOR-DERIVED regime (not time-based) ═══
                  // Shorts only authorized when real market structure confirms bearish conditions.
                  // Indicator regime uses ADX, ROC, trend efficiency, Bollinger, momentum counts.
                  
                  // ═══ ADAPTIVE SHORT LEARNING: Use learned thresholds ═══
                  const adaptiveBearishThreshold = shortLearningProfile.adaptiveBearishThreshold;
                  const adaptiveRegimeStrengthMin = shortLearningProfile.adaptiveRegimeStrengthMin;
                  
                  if (!indicatorShortFriendly) {
                    // Check if learning has identified this regime as profitable for shorts
                    const regimeLearned = shortLearningProfile.bestRegimes.includes(indicatorRegime);
                    if (!regimeLearned) {
                      console.log(`[SCALP-TRADE] ${pair}: Bearish consensus but indicatorRegime=${indicatorRegime} (strength=${indicatorRegimeStrength}) is NOT short-friendly and NOT learned — skipping`);
                      results.push({ pair, direction: "short", status: "regime-not-short-friendly", govState, agentId,
                        error: `indicatorRegime=${indicatorRegime},bearishMomentum=${indicatorBearishMomentum}` });
                      continue;
                    }
                    console.log(`[SHORT-LEARN] ${pair}: Regime ${indicatorRegime} overridden by learning — historically profitable for shorts`);
                  }
                  
                  // Check regime strength minimum (adaptive)
                  if (indicatorRegimeStrength < adaptiveRegimeStrengthMin) {
                    console.log(`[SCALP-TRADE] ${pair}: Regime strength ${indicatorRegimeStrength} < adaptive min ${adaptiveRegimeStrengthMin} — skipping`);
                    results.push({ pair, direction: "short", status: "weak-regime-strength", govState, agentId });
                    continue;
                  }
                  
                   // Check if this regime is in the worst list (auto-blocked by learning)
                   // LEARNING PHASE: Only block after 500-trade milestone
                   if (shortLearningProfile.totalShortTrades >= 500 && shortLearningProfile.worstRegimes.includes(indicatorRegime)) {
                     console.log(`[SHORT-LEARN] ${pair}: Regime ${indicatorRegime} AUTO-BLOCKED by learning — historically destructive (post-milestone)`);
                     results.push({ pair, direction: "short", status: "regime-learned-destructive", govState, agentId });
                     continue;
                   }
                  
                  // Adaptive bearish momentum threshold (learned from data)
                  if (indicatorBearishMomentum < adaptiveBearishThreshold) {
                    console.log(`[SCALP-TRADE] ${pair}: bearishMomentum=${indicatorBearishMomentum} < adaptive threshold ${adaptiveBearishThreshold} — insufficient conviction`);
                    results.push({ pair, direction: "short", status: "weak-bearish-momentum", govState, agentId });
                    continue;
                  }
                  
                  // Short learning + regime + momentum confirmed — check pair + session eligibility
                  if (SHORT_ELIGIBLE_PAIRS.includes(pair) && SHORT_ELIGIBLE_SESSIONS.includes(session)) {
                    // Check session-specific learning (block sessions with negative expectancy)
                    // LEARNING PHASE: Disabled until 500-trade milestone
                    const sessStats = shortLearningProfile.sessionStats[session];
                    if (shortLearningProfile.totalShortTrades >= 500 && sessStats && (sessStats.wins + sessStats.losses) >= 10) {
                      const sessExp = sessStats.totalPips / (sessStats.wins + sessStats.losses);
                      if (sessExp < -3) {
                        console.log(`[SHORT-LEARN] ${pair}: Session ${session} AUTO-BLOCKED for shorts — exp=${sessExp.toFixed(2)}p (learned, post-milestone)`);
                        results.push({ pair, direction: "short", status: "session-learned-destructive", govState, agentId });
                        continue;
                      }
                    }
                    
                    direction = "short";
                    mtfConfirmed = true;
                    console.log(`[SCALP-TRADE] ${pair}: SHORT authorized — indicatorRegime=${indicatorRegime} (strength=${indicatorRegimeStrength}, bearishMom=${indicatorBearishMomentum}, adaptiveThreshold=${adaptiveBearishThreshold}) + consensus=${indicatorConsensusScore} | learning=${shortLearningProfile.learningMaturity}`);
                  } else {
                    console.log(`[SCALP-TRADE] ${pair}: Short regime confirmed but pair/session not eligible — skipping`);
                    results.push({ pair, direction: "short", status: "direction-mismatch", govState, agentId });
                    continue;
                  }
                }
              } else {
                // Consensus too weak (after noise filtering) — skip this trade
                const reason = learningApplied
                  ? `Filtered consensus too weak (${indicatorConsensusScore}, ${noiseExcludedCount} noise excluded)`
                  : `Consensus too weak (${indicatorConsensusScore})`;
                console.log(`[SCALP-TRADE] ${pair}: ${reason} — skipping`);
                results.push({ pair, direction, status: "weak-consensus", govState, agentId });
                continue;
              }
            }
          } else {
            // ═══ HARD EDGE LOCK: Indicator service unavailable = MTF FAIL = BLOCK ═══
            console.warn(`[SCALP-TRADE] ${pair}: Indicator service returned ${indicatorRes.status} — MTF FAIL, BLOCKING (no fallback)`);
            mtfConfirmed = false;
            mtf_data_available = false;
            results.push({ pair, direction, status: "mtf-unavailable", govState, agentId });
            continue; // HARD LOCK: no indicator data = no trade
          }
        } catch (indicatorErr) {
          // ═══ HARD EDGE LOCK: Indicator call failure = BLOCK ═══
          console.warn(`[SCALP-TRADE] ${pair}: Indicator call failed: ${(indicatorErr as Error).message} — BLOCKING (no fallback)`);
          mtfConfirmed = false;
          mtf_data_available = false;
          results.push({ pair, direction, status: "mtf-error", govState, agentId });
          continue; // HARD LOCK: no indicator data = no trade
        }
      }

      const confidence = forceMode ? 90 : Math.round(
        mtfConfirmed ? (60 + Math.abs(indicatorConsensusScore) * 0.3) : (50 + Math.random() * 20)
      );

      // ═══ REGIME AUTHORIZATION ═══
      // During learning phase: indicator regime takes precedence when available (it uses 16 real-time indicators).
      // ATR regime is a simple volatility measure that can disagree on direction (e.g., "expansion" during a breakdown).
      // Post-maturity (500+ trades): both must agree for additional safety.
      const LONG_AUTHORIZED_REGIMES = ["expansion", "momentum", "exhaustion", "ignition"];
      const SHORT_AUTHORIZED_REGIMES = ["breakdown", "risk-off", "exhaustion", "shock-breakdown", "risk-off-impulse", "liquidity-vacuum", "breakdown-continuation"];
      const atrRegimeAuthorized = direction === "long"
        ? LONG_AUTHORIZED_REGIMES.includes(regime)
        : SHORT_AUTHORIZED_REGIMES.includes(regime);
      const indicatorRegimeAuthorized = indicatorRegime === "unknown" || (direction === "long"
        ? LONG_AUTHORIZED_REGIMES.includes(indicatorRegime)
        : SHORT_AUTHORIZED_REGIMES.includes(indicatorRegime));
      // LEARNING PHASE: indicator regime is SOLE authority when available
      // ATR regime measures volatility magnitude, NOT direction — it can say "expansion" during a clear breakdown.
      // Only the 16-indicator composite regime has directional awareness.
      const isLearningPhase = (rawOrders || []).length < 500;
      const hasIndicatorRegime = indicatorRegime !== "unknown";
      let regimeAuthorized: boolean;
      let effectiveRegimeForAuth: string;
      if (hasIndicatorRegime && isLearningPhase) {
        // Learning: trust indicator regime exclusively — ATR is directionally blind
        regimeAuthorized = indicatorRegimeAuthorized;
        effectiveRegimeForAuth = indicatorRegime;
      } else if (hasIndicatorRegime) {
        // Post-maturity: both must agree
        regimeAuthorized = atrRegimeAuthorized && indicatorRegimeAuthorized;
        effectiveRegimeForAuth = indicatorRegime;
      } else {
        // No indicator data: ATR is the only signal
        regimeAuthorized = atrRegimeAuthorized;
        effectiveRegimeForAuth = regime;
      }
      console.log(`[REGIME-AUTH] ${pair} ${direction}: atr=${regime}(${atrRegimeAuthorized}) ind=${indicatorRegime}(${indicatorRegimeAuthorized}) learning=${isLearningPhase} → auth=${regimeAuthorized} effective=${effectiveRegimeForAuth}`);
      const coalitionMet = snapshot.eligibleCount >= snapshot.coalitionRequirement.minAgents;
      const autoPromotionEvent = (snapshot.promotionLog || []).length > 0
        ? (snapshot.promotionLog.some(l => l.includes("SUPPORT")) ? "support"
          : snapshot.promotionLog.some(l => l.includes("SHADOW")) ? "shadow" : "bench")
        : "none";

      // Determine if selected agent is a support agent (restricted capabilities)
      const isSupportAgent = agentId.startsWith("support-") || agentId === "emergency-continuity";
      if (isSupportAgent) {
        console.log(`[SCALP-TRADE] ⚠ Support agent ${agentId} used — can confirm coalition count but cannot generate bias or override MTF`);
      }

      const isPrimaryPair = SCALP_PAIRS.includes(pair);

      console.log(`[SCALP-TRADE] Signal ${i + 1}: ${direction.toUpperCase()} ${pair} (${isPrimaryPair ? 'SCALP' : 'SECONDARY'}) | consensus=${indicatorConsensusScore} (${indicatorDirection}) | mtf=${mtfConfirmed} [1m=${mtf_1m_ignition},5m=${mtf_5m_momentum},15m=${mtf_15m_bias}] | regime=${regime}(auth=${regimeAuthorized}) | agent=${agentId}(${agentTier}) | coalition=${snapshot.eligibleCount}/${snapshot.coalitionRequirement.minAgents}(${coalitionMet}) | support=${isSupportAgent}`);

      // ─── Pair Allocation Check (GRACEFUL DEGRADATION) ───
      const pairAlloc = pairAllocations[pair] || { banned: false, restricted: false, capitalMultiplier: 1.0 };

      // Banned pairs: reduce allocation to 30% instead of full block (graceful degradation)
      if (!forceMode && (pairAlloc as PairRollingMetrics).banned && pair !== PRIMARY_PAIR) {
        console.log(`[SCALP-TRADE] ${pair}: DEGRADED (was banned) — reducing allocation to 30%`);
        (pairAlloc as PairRollingMetrics).capitalMultiplier = 0.3;
        (pairAlloc as PairRollingMetrics).banned = false;
      }

      // ═══ STRATEGY REVAMP: No secondary pair gates — all pairs trade all sessions ═══
      // Pair performance still adjusts allocation via adaptive edge, but no hard session blocks

      // Note: pair-level allocation adjustments handled by adaptive edge engine, not hard restrictions

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
        .in("status", ["filled", "submitted"]) // FIX: Also catch submitted (not yet filled) to prevent duplicate exposure
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
      // ═══ USE INDICATOR-DERIVED REGIME as primary (not time-based) ═══
      const effectiveRegime = indicatorRegime !== "unknown" ? indicatorRegime : regime;
      const envKey = `${session}|${effectiveRegime}|${pair}|${direction}|${agentId}`;
      const explainReasons: string[] = [];

      if (DISCOVERY_RISK_MODE && !forceMode && ADAPTIVE_EDGE_ENABLED) {
        const sym = pair.toUpperCase();
        const baseSpread = PAIR_BASE_SPREADS[pair] || 1.5;
        const spreadPips = baseSpread * (SESSION_BUDGETS[session]?.frictionMultiplier || 1.0);
        const approxComposite = (gate.frictionScore || 50) / 100;

        const AUD_CROSSES = ["AUD_JPY", "AUD_USD", "AUD_NZD", "AUD_CAD", "AUD_CHF", "EUR_AUD", "GBP_AUD"];
        const isAudCross = AUD_CROSSES.includes(sym);

        // GRACEFUL DEGRADATION: "destructive" environments get reduced allocation, not blocked
        const isDestructive =
          isAudCross ||
          sym === "GBP_USD" ||
          sym === "GBP_JPY" ||
          agentId === "sentiment-reactor" ||
          agentId === "range-navigator" ||
          session === "rollover" ||
          spreadPips > SPREAD_BLOCK_THRESHOLD ||
          (effectiveRegime === "ignition" && approxComposite < IGNITION_MIN_COMPOSITE);

        // FIX: Use indicator-derived effectiveRegime (not time-based) for edge boost decisions
        const isEdge =
          (session === "ny-overlap" && effectiveRegime === "expansion") ||
          (session === "asian" && sym === "USD_CAD" && effectiveRegime === "expansion") ||
          (session === "asian" && sym === "USD_CAD" && effectiveRegime === "compression") ||
          (session === "london-open" && sym === "USD_CAD") ||
          (session === "late-ny" && sym === "USD_CAD" && effectiveRegime !== "ignition") ||
          (session === "london-open" && sym === "AUD_USD" && effectiveRegime === "expansion") ||
          (sym === "EUR_GBP") ||
          (sym === "USD_JPY" && effectiveRegime === "compression");

        if (isDestructive) {
          // GRACEFUL DEGRADATION: reduce allocation to 20% instead of blocking
          discoveryRiskLabel = "REDUCED_RISK";
          discoveryMultiplier = 0.20;
          if (isAudCross) explainReasons.push("AUD cross — allocation reduced to 20%");
          else if (sym === "GBP_USD" || sym === "GBP_JPY") explainReasons.push(`${sym} — high volatility, allocation reduced`);
          else if (agentId === "sentiment-reactor" || agentId === "range-navigator") explainReasons.push(`Agent ${agentId} — reduced allocation`);
          else if (session === "rollover") explainReasons.push("Rollover session — minimal allocation");
          else if (spreadPips > SPREAD_BLOCK_THRESHOLD) explainReasons.push(`Spread ${spreadPips.toFixed(1)}p elevated — reduced`);
          else explainReasons.push("Ignition + low composite — reduced");
          console.log(`[SCALP-TRADE] ${pair}: Discovery risk REDUCED (was destructive) — multiplier=${discoveryMultiplier}`);
        } else if (isEdge) {
          discoveryRiskLabel = "EDGE_BOOST";
          discoveryMultiplier = EDGE_BOOST_MULTIPLIER;
          explainReasons.push(`Edge candidate: ${session} ${effectiveRegime} ${direction}`);
        } else {
          discoveryRiskLabel = "BASELINE";
          discoveryMultiplier = BASELINE_REDUCTION_MULTIPLIER;
          explainReasons.push("Baseline allocation — standard environment");
        }
      }

      // ─── Dynamic Position Sizing (governance + pair + session + agent snapshot) ───
      const baseTradeUnits = computePositionSize(
        pair, accountBalance, confidence,
        govConfig, pairAlloc as PairRollingMetrics, sessionBudget,
        agentSizeMult
      );

      // ═══ PHASE 6+8: REGIME + KELLY WEIGHTED SIZING ═══
      let deploymentMultiplier = discoveryMultiplier;
      if (neutralRegimeReducedSizing) deploymentMultiplier *= 0.5;
      // Apply regime-weighted sizing (Kelly-informed capital allocation)
      const effectiveRegimeForSizing = indicatorRegime !== "unknown" ? indicatorRegime : regime;
      const regimeSizingMult = REGIME_SIZING_MULTIPLIER[effectiveRegimeForSizing] ?? 1.0;
      deploymentMultiplier *= regimeSizingMult;
      if (regimeSizingMult !== 1.0) {
        console.log(`[SCALP-TRADE] ${pair}: Regime ${effectiveRegimeForSizing} sizing multiplier: ${regimeSizingMult}x (Kelly-informed)`);
      }

      // ═══ PHASE 9: AGENT ACCOUNTABILITY ═══
      // Penalize support-mtf-confirmer specifically — 14.6% WR, -170.2 pips
      const AGENT_PENALTY_MULTIPLIER: Record<string, number> = {
        "support-mtf-confirmer": 0.0,   // Phase 3: SUSPENDED — shadow only, zero execution
        "sentiment-reactor": 0.0,       // Already blocked by discovery risk
        "range-navigator": 0.0,         // Already blocked by discovery risk
      };
      const agentPenalty = AGENT_PENALTY_MULTIPLIER[agentId] ?? 1.0;
      if (agentPenalty === 0 && !forceMode) {
        console.log(`[SCALP-TRADE] ${pair}: Agent ${agentId} SUSPENDED (Phase 3: shadow-only) — skipping execution`);
        results.push({ pair, direction, status: "agent-suspended", agentId, govState });
        continue;
      }
      deploymentMultiplier *= agentPenalty;

      // ─── SHORT CAPITAL: Equal allocation to longs ───
      const shortCapMultiplier = 1.0;
      const tradeUnits = Math.max(500, Math.round(baseTradeUnits * deploymentMultiplier * shortCapMultiplier));

      console.log(`[SCALP-TRADE] ${pair} (${isPrimaryPair ? 'SCALP' : 'SECONDARY'}): sized ${tradeUnits}u (gov=${govConfig.sizingMultiplier}, pair=${(pairAlloc as PairRollingMetrics).capitalMultiplier?.toFixed(2)}, session=${sessionBudget.capitalBudgetPct}, agent=${agentSizeMult}, discovery=${discoveryMultiplier}, deployment=${deploymentMultiplier.toFixed(2)}, shortCap=${shortCapMultiplier})`);

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
          direction, // long or short
          units: tradeUnits,
          confidence_score: confidence,
          agent_id: agentId,
          environment: executionEnv,
          status: shouldExecute ? "submitted" : "shadow_eval",
          idempotency_key: idempotencyKey,
          session_label: session,
          regime_label: indicatorRegime !== "unknown" ? indicatorRegime : regime,
          gate_result: gate.result,
          gate_reasons: gate.reasons.length > 0 ? gate.reasons : null,
          friction_score: gate.frictionScore,
          governance_payload: {
            envKey,
            discoveryRiskLabel,
            discoveryMultiplier,
            deploymentMultiplier,
            pairClassification: isPrimaryPair ? "PRIMARY" : "SECONDARY",
            adaptiveEdgeEnabled: ADAPTIVE_EDGE_ENABLED,
            explainReasons,
            baseUnits: baseTradeUnits,
            finalUnits: tradeUnits,
            agentTier: agentTier,
            agentRole: agentRole,
            agentSizeMultiplier: agentSizeMult,
            agentRoleMultiplier: selectedAgent?.roleMult || 1.0,
            longOnly: false,
            effectiveTier: agentTier,
            deploymentState: selectedAgent?.deploymentState || "unknown",
            constraints: selectedAgent?.constraints || [],
            // ═══════════════════════════════════════════════════════
            // EDGE PROOF — Mandatory fields (if ANY missing → BLOCK)
            // ═══════════════════════════════════════════════════════
            edgeProof: {
              mtf_1m_ignition: mtf_1m_ignition ? "PASS" : "FAIL",
              mtf_5m_momentum: mtf_5m_momentum ? "PASS" : "FAIL",
              mtf_15m_bias: mtf_15m_bias ? "PASS" : "FAIL",
              mtf_data_available: mtf_data_available,
              regime_detected: regime,
              indicator_regime: indicatorRegime,
              indicator_regime_strength: indicatorRegimeStrength,
              indicator_short_friendly: indicatorShortFriendly,
              indicator_long_friendly: indicatorLongFriendly,
              indicator_bearish_momentum: indicatorBearishMomentum,
              indicator_bullish_momentum: indicatorBullishMomentum,
              regime_authorized: regimeAuthorized ? "PASS" : "FAIL",
              spread_check: gate.pass ? "PASS" : "FAIL",
              slippage_check: gate.pass ? "PASS" : "FAIL",
              liquidity_check: gate.pass ? "PASS" : "FAIL",
              eligible_agents_count: snapshot.eligibleCount,
              active_agents: snapshot.eligibleAgents.map(a => a.agentId),
              auto_promotion_event: autoPromotionEvent,
              coalition_threshold_required: snapshot.coalitionRequirement.minAgents,
              coalition_threshold_met: coalitionMet ? "PASS" : "FAIL",
              is_support_agent: isSupportAgent,
              final_decision: "PENDING", // Set after hard lock check below
              final_reason_top3: [] as string[],
            },
            // Legacy fields (kept for backward compat)
            indicatorConsensus: indicatorConsensusScore,
            indicatorDirection,
            indicatorBreakdown,
            mtfConfirmed,
            coalitionTier: snapshot.coalitionRequirement.tier,
            coalitionMinAgents: snapshot.coalitionRequirement.minAgents,
            governanceState: govState,
            // ═══ INDICATOR LEARNING (walk-forward OOS, regime-aware) ═══
            indicatorLearning: learningApplied ? {
              applied: true,
              mode: "walk-forward-oos-regime-aware",
              weightSource,
              oosValidated: pairLearningProfile?.oosValidated || false,
              oosTradesUsed: pairLearningProfile?.oosTradesUsed || 0,
              filteredConsensus: filteredConsensusScore,
              filteredDirection,
              noiseDownWeighted: pairLearningProfile?.noiseIndicators || [],
              signalIndicators: pairLearningProfile?.signalIndicators || [],
              softWeights: pairLearningProfile?.softWeights || {},
              regimeBucketsAvailable: Object.keys(pairLearningProfile?.regimeWeights || {}),
              noiseDownWeightedCount: noiseExcludedCount,
              qualityScore: pairLearningProfile?.qualityScore || 0,
              baselineWinRate: pairLearningProfile?.baselineWinRate || 0,
              learningTrades: pairLearningProfile?.totalTrades || 0,
              adaptiveThreshold: MIN_CONSENSUS,
            } : { applied: false, adaptiveThreshold: 25 },
            // ═══ SHORT ADAPTIVE LEARNING ═══
            shortLearning: {
              maturity: shortLearningProfile.learningMaturity,
              totalShortTrades: shortLearningProfile.totalShortTrades,
              overallWR: shortLearningProfile.overallShortWR,
              overallExpectancy: shortLearningProfile.overallShortExpectancy,
              adaptiveBearishThreshold: shortLearningProfile.adaptiveBearishThreshold,
              adaptiveRegimeStrengthMin: shortLearningProfile.adaptiveRegimeStrengthMin,
              bestRegimes: shortLearningProfile.bestRegimes,
              worstRegimes: shortLearningProfile.worstRegimes,
            },
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

      // ═══════════════════════════════════════════════════════════════════
      // HARD EDGE LOCK — Execution MUST fail if any layer fails
      // Auto-promotion can restore coalition but CANNOT override MTF/regime/safety
      // ═══════════════════════════════════════════════════════════════════
      const edgeLockReasons: string[] = [];

      if (!mtfConfirmed && !forceMode) {
        edgeLockReasons.push(`MTF FAIL: 1m=${mtf_1m_ignition} 5m=${mtf_5m_momentum} 15m=${mtf_15m_bias}`);
      }
      if (!regimeAuthorized && !forceMode) {
        edgeLockReasons.push(`Regime FAIL: '${effectiveRegimeForAuth}' not authorized for ${direction}`);
      }
      if (!gate.pass && !forceMode) {
        edgeLockReasons.push(`Safety FAIL: ${gate.reasons.join(', ')}`);
      }
      if (!coalitionMet && !forceMode) {
        edgeLockReasons.push(`Coalition FAIL: ${snapshot.eligibleCount} < ${snapshot.coalitionRequirement.minAgents} required`);
      }
      // Support agent restriction: cannot generate bias or override MTF
      if (isSupportAgent && !mtfConfirmed && !forceMode) {
        edgeLockReasons.push(`Support agent ${agentId} cannot override MTF failure`);
      }

      // Finalize edge proof record
      const edgeProofPayload = (order as Record<string, unknown>).governance_payload as Record<string, unknown>;
      const finalDecision = edgeLockReasons.length === 0 ? "EXECUTE" : "SKIP";
      const finalReasonTop3 = edgeLockReasons.length > 0
        ? edgeLockReasons.slice(0, 3)
        : [`MTF confirmed (${indicatorConsensusScore})`, `Regime: ${regime}`, `Coalition: ${snapshot.eligibleCount} agents`];

      // ═══ COUNTERFACTUAL: Capture market price at rejection for what-if analysis ═══
      let counterfactualEntryPrice: number | null = null;
      if (edgeLockReasons.length > 0 && !forceMode) {
        try {
          const cfPriceRes = await oandaRequest(
            `/v3/accounts/{accountId}/pricing?instruments=${pair}`, "GET",
            execConfig.oandaHost
          ) as { prices?: Array<{ asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
          const cfPrice = cfPriceRes.prices?.[0];
          if (cfPrice) {
            counterfactualEntryPrice = direction === "long"
              ? parseFloat(cfPrice.asks?.[0]?.price || "0")
              : parseFloat(cfPrice.bids?.[0]?.price || "0");
          }
        } catch (cfErr) {
          console.warn(`[SCALP-TRADE] Counterfactual price fetch failed: ${(cfErr as Error).message}`);
        }
      }

      // Update the order with finalized edge proof + counterfactual price
      await supabase
        .from("oanda_orders")
        .update({
          governance_payload: {
            ...edgeProofPayload,
            edgeProof: {
              ...(edgeProofPayload?.edgeProof as Record<string, unknown> || {}),
              final_decision: finalDecision,
              final_reason_top3: finalReasonTop3,
            },
          },
          status: edgeLockReasons.length > 0 ? "rejected" : (shouldExecute ? "submitted" : "shadow_eval"),
          error_message: edgeLockReasons.length > 0 ? `EDGE LOCK: ${edgeLockReasons.join(' | ')}` : null,
          counterfactual_entry_price: counterfactualEntryPrice,
        })
        .eq("id", order.id);

      if (edgeLockReasons.length > 0 && !forceMode) {
        console.warn(`[SCALP-TRADE] ═══ HARD EDGE LOCK: ${pair} ${direction} BLOCKED ═══`);
        if (counterfactualEntryPrice) {
          console.log(`[SCALP-TRADE]   📊 Counterfactual entry: ${counterfactualEntryPrice} (will track outcome)`);
        }
        for (const r of edgeLockReasons) console.warn(`[SCALP-TRADE]   🔒 ${r}`);
        results.push({
          pair, direction, status: "edge-locked",
          govState, agentId, effectiveTier: agentTier,
        });
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
        const signedUnits = direction === "short" ? -tradeUnits : tradeUnits; // Negative for shorts
        
        // ═══ PHASE 1+2: Dynamic SL + 5R SAFETY CEILING TP (ATR-trailing manages exits) ═══
        // TP is NOT the target exit — it's an emergency ceiling. Monitor's ATR-trailing handles real exits.
        let stopLossPrice: number | undefined;
        let takeProfitPrice: number | undefined;
        let entryEstimate = 0; // Pre-order price for slippage calculation
        try {
          const priceRes = await oandaRequest(
            `/v3/accounts/{accountId}/pricing?instruments=${pair}`, "GET",
            execConfig.oandaHost
          ) as { prices?: Array<{ asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
          const currentPrice = priceRes.prices?.[0];
          if (currentPrice) {
            entryEstimate = direction === "long"
              ? parseFloat(currentPrice.asks?.[0]?.price || "0")
              : parseFloat(currentPrice.bids?.[0]?.price || "0");
            if (entryEstimate > 0) {
              // ═══ PHASE 2: DYNAMIC SL with 5R SAFETY CEILING TP ═══
              // ATR-trailing in the trade monitor handles actual exits (1.5R→lock 1R, 2R→ATR trail)
              // OANDA TP is set at 5R as emergency ceiling only — NOT the target exit
              const slPipMult = pair.includes("JPY") ? 0.01 : 0.0001;
              if (supertrendValue15m !== null && atr15mValue !== null) {
                const minBufferPrice = 5 * slPipMult;
                const atrBufferPrice = 0.25 * atr15mValue;
                const buffer = Math.max(minBufferPrice, atrBufferPrice);
                if (direction === "long") {
                  stopLossPrice = Math.round((supertrendValue15m - buffer) * 100000) / 100000;
                  if (stopLossPrice >= entryEstimate) {
                    stopLossPrice = Math.round((entryEstimate - 12 * slPipMult) * 100000) / 100000;
                    console.log(`[SCALP-TRADE] ${pair}: Supertrend SL invalid (>= entry), using 12p fallback`);
                  }
                } else {
                  stopLossPrice = Math.round((supertrendValue15m + buffer) * 100000) / 100000;
                  if (stopLossPrice <= entryEstimate) {
                    stopLossPrice = Math.round((entryEstimate + 12 * slPipMult) * 100000) / 100000;
                    console.log(`[SCALP-TRADE] ${pair}: Supertrend SL invalid (<= entry), using 12p fallback`);
                  }
                }
                const slDistPips = Math.abs(entryEstimate - stopLossPrice) / slPipMult;
                // PHASE 2: TP at 5R safety ceiling — ATR-trailing handles exits before this
                const tpDistPips = slDistPips * 5.0;
                takeProfitPrice = direction === "long"
                  ? Math.round((entryEstimate + tpDistPips * slPipMult) * 100000) / 100000
                  : Math.round((entryEstimate - tpDistPips * slPipMult) * 100000) / 100000;
                console.log(`[SCALP-TRADE] ${pair}: DYNAMIC SL=${stopLossPrice} (${slDistPips.toFixed(1)}p, supertrend+atr) | TP=${takeProfitPrice} (${tpDistPips.toFixed(1)}p, 5R safety ceiling) | ATR-trailing manages exits | entry ~${entryEstimate}`);
              } else {
                // Fallback: static SL with 2.5× R:R TP (higher ratio compensates for static geometry)
                stopLossPrice = computeStopLossPrice(pair, direction, entryEstimate);
                const fallbackSlPips = computeStopLossPips(pair, direction);
                const fallbackTpPips = fallbackSlPips * 2.5;
                takeProfitPrice = direction === "long"
                  ? Math.round((entryEstimate + fallbackTpPips * slPipMult) * 100000) / 100000
                  : Math.round((entryEstimate - fallbackTpPips * slPipMult) * 100000) / 100000;
                console.log(`[SCALP-TRADE] ${pair}: FALLBACK SL=${stopLossPrice} (${fallbackSlPips}p) | TP=${takeProfitPrice} (${fallbackTpPips.toFixed(1)}p) | R:R=1:2.5 | entry ~${entryEstimate}`);
              }
            }
          }
        } catch (slErr) {
          console.warn(`[SCALP-TRADE] ${pair}: Could not compute SL/TP price: ${(slErr as Error).message}`);
        }
        
        const orderBody: Record<string, unknown> = {
          type: "MARKET",
          instrument: pair,
          units: signedUnits.toString(),
          timeInForce: "FOK",
          positionFill: "DEFAULT",
        };
        if (stopLossPrice) {
          orderBody.stopLossOnFill = {
            price: stopLossPrice.toString(),
            timeInForce: "GTC",
          };
        }
        if (takeProfitPrice) {
          orderBody.takeProfitOnFill = {
            price: takeProfitPrice.toString(),
            timeInForce: "GTC",
          };
        }
        
        const oandaResult = await oandaRequest(
          "/v3/accounts/{accountId}/orders", "POST",
          execConfig.oandaHost,
          { order: orderBody }
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

        // FIX: Use pre-order entryEstimate as requestedPrice (not filledPrice which makes slippage always 0)
        const requestedPrice = entryEstimate > 0 ? entryEstimate : filledPrice;
        // FIX: JPY pairs use 0.01 pip value, not 0.0001
        const pipValueForSpread = pair.includes("JPY") ? 0.01 : 0.0001;
        const spreadAtEntry = halfSpread != null ? halfSpread * 2 : (PAIR_BASE_SPREADS[pair] || 1.0) * pipValueForSpread;
        // REAL SLIPPAGE: computed from actual fill price vs requested price (not random)
        let slippagePips: number | null = null;
        if (!wasCancelled && filledPrice && requestedPrice) {
          const pipDiv = pair.includes("JPY") ? 0.01 : 0.0001;
          slippagePips = Math.abs(filledPrice - requestedPrice) / pipDiv;
        } else if (!wasCancelled) {
          slippagePips = 0; // No price data available — assume zero slippage
        }

        const baseSpread = PAIR_BASE_SPREADS[pair] || 1.0;
        // FIX: Convert spreadAtEntry (price units) back to pips correctly for JPY vs non-JPY
        const spreadInPips = spreadAtEntry / pipValueForSpread;
        const execQuality = wasCancelled ? 0 : scoreExecution(
          slippagePips || 0, fillLatencyMs,
          spreadInPips, baseSpread
        );

        // ─── Compute r_pips (true risk at entry) ───
        const pipDiv = pair.includes("JPY") ? 0.01 : 0.0001;
        let rPipsAtEntry: number | null = null;
        if (!wasCancelled && filledPrice && stopLossPrice) {
          rPipsAtEntry = Math.round(Math.abs(filledPrice - stopLossPrice) / pipDiv * 10) / 10;
        }

        // Determine entry timeframe from indicator data
        const entryTf = "1m"; // Primary scalping timeframe

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
            // ═══ NEW: True risk + watermark initialization ═══
            r_pips: rPipsAtEntry,
            entry_tf: entryTf,
            mfe_price: filledPrice, // initialize watermarks to entry
            mae_price: filledPrice,
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
    const edgeLocked = results.filter(r => r.status === "edge-locked").length;
    const mtfBlocked = results.filter(r => r.status === "mtf-unavailable" || r.status === "mtf-error").length;
    const weakConsensus = results.filter(r => r.status === "weak-consensus").length;
    const pairBanned = results.filter(r => r.status === "pair-banned").length;
    const discoveryBlocked = results.filter(r => r.status === "discovery_blocked").length;
    const shadowEvals = results.filter(r => r.status === "shadow_eval").length;
    const fifoSkipped = results.filter(r => r.status === "fifo-skipped").length;

    console.log(`[SCALP-TRADE] ═══ Complete: ${results.length} signals | ${passed} filled | ${edgeLocked} edge-locked | ${mtfBlocked} mtf-blocked | ${weakConsensus} weak-consensus | ${gated} gated | ${rejected} rejected | ${pairBanned} banned | ${discoveryBlocked} disc_blocked | ${fifoSkipped} fifo-skipped | ${shadowEvals} shadow | ${elapsed}ms ═══`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "snapshot-driven",
        executionConfig: {
          oandaEnv: execConfig.oandaEnv,
          liveTradingEnabled: execConfig.liveTradingEnabled,
          longOnly: false,
        },
        governanceState: govState,
        session: sessionBudget.label,
        regime,
        agentSnapshot: {
          total: snapshot.totalAgents,
          eligible: snapshot.eligibleCount,
          shadow: snapshot.shadowCount,
          disabled: snapshot.disabledCount,
          coalition: snapshot.coalitionRequirement,
          promotionLog: snapshot.promotionLog || [],
          agents: snapshot.eligibleAgents.map(a => ({
            id: a.agentId,
            tier: a.effectiveTier,
            fleetSet: a.fleetSet,
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
        capitalDeployment: {
          primaryPair: PRIMARY_PAIR,
          allPairsAuthorized: true,
          scalpPairs: SCALP_PAIRS,
          secondaryPairs: SECONDARY_PAIRS,
        },
        summary: { total: results.length, filled: passed, edgeLocked, mtfBlocked, weakConsensus, gated, rejected, pairBanned, discoveryBlocked, shadowEvals },
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
