// ─── Live Edge Execution Engine ───
// Dual-edge (LONG + SHORT) production execution controller.
// Deterministic rule enforcement only — no model training, optimization, or parameter discovery.
// Integrates with Darwin governance and survivorship scoring.
//
// GLOBAL PHILOSOPHY: Trade ONLY when edge is confirmed across:
// • Live trade survivorship
// • Shadow validation pipeline
// • Indicator coalition confirmation
// • Regime alignment
//
// If survivorship deteriorates → throttle exposure (not optimize, not retrain).

import type { ShortRegime } from './shorts/shortTypes';

// ─── Regime Types ────────────────────────────────────────────────────

export type LongRegime =
  | 'expansion-breakout'
  | 'momentum-continuation'
  | 'liquidity-expansion'
  | 'carry-flow-reinforcement'
  | 'compression-decay'       // BLOCKED
  | 'volatility-collapse'     // BLOCKED
  | 'reversal-shock-onset';   // BLOCKED

export const LONG_AUTHORIZED_REGIMES: LongRegime[] = [
  'expansion-breakout',
  'momentum-continuation',
  'liquidity-expansion',
  'carry-flow-reinforcement',
];

export const LONG_BLOCKED_REGIMES: LongRegime[] = [
  'compression-decay',
  'volatility-collapse',
  'reversal-shock-onset',
];

export const SHORT_AUTHORIZED_REGIMES: ShortRegime[] = [
  'shock-breakdown',
  'risk-off-impulse',
  'liquidity-vacuum',
  'breakdown-continuation',
];

// ─── Session Intelligence ────────────────────────────────────────────

export interface SessionPriority {
  session: string;
  longPriority: 'high' | 'medium' | 'low' | 'suppressed';
  shortPriority: 'high' | 'medium' | 'low' | 'suppressed';
}

export const SESSION_PRIORITIES: SessionPriority[] = [
  { session: 'london-open',  longPriority: 'high',   shortPriority: 'high' },
  { session: 'ny-overlap',   longPriority: 'high',   shortPriority: 'high' },
  { session: 'asian',        longPriority: 'medium', shortPriority: 'medium' },
  { session: 'late-ny',      longPriority: 'low',    shortPriority: 'low' },
  { session: 'rollover',     longPriority: 'suppressed', shortPriority: 'suppressed' },
];

function getSessionMultiplier(session: string, direction: 'long' | 'short'): number {
  const sp = SESSION_PRIORITIES.find(s => s.session === session);
  if (!sp) return 0.5;
  const priority = direction === 'long' ? sp.longPriority : sp.shortPriority;
  switch (priority) {
    case 'high': return 1.15;
    case 'medium': return 0.85;
    case 'low': return 0.55;
    case 'suppressed': return 0;
  }
}

// ─── Pair Authorization ──────────────────────────────────────────────

export const LONG_AUTHORIZED_PAIRS = ['USD_CAD', 'USD_JPY', 'EUR_USD', 'NZD_USD'];
export const SHORT_AUTHORIZED_PAIRS = ['USD_JPY', 'GBP_JPY', 'EUR_USD', 'GBP_USD'];
export const SHORT_RESTRICTED_PAIRS: Record<string, string> = {
  'USD_CAD': 'Restricted during carry dominance',
};

// ─── Entry Validation ────────────────────────────────────────────────

export interface EntryValidation {
  passed: boolean;
  checks: EntryCheck[];
  direction: 'long' | 'short';
}

export interface EntryCheck {
  name: string;
  passed: boolean;
  detail: string;
  required: boolean;
}

export function validateLongEntry(ctx: EdgeExecutionContext): EntryValidation {
  const checks: EntryCheck[] = [
    {
      name: 'Expansion Ignition',
      passed: ctx.volatilityPhase === 'ignition' || ctx.volatilityPhase === 'expansion',
      detail: `Phase: ${ctx.volatilityPhase}`,
      required: true,
    },
    {
      name: 'Coalition Confirmation',
      passed: ctx.coalitionConfirmation,
      detail: ctx.coalitionConfirmation ? 'Indicator ensemble confirms' : 'No coalition confirmation',
      required: true,
    },
    {
      name: 'Volatility Transition',
      passed: ctx.volatilityTransitionValid,
      detail: ctx.volatilityTransitionValid ? 'Compression→Ignition→Expansion confirmed' : 'No valid transition',
      required: true,
    },
    {
      name: 'Momentum Persistence',
      passed: ctx.trendEfficiency > 0.55 || ctx.adxStrength > 25,
      detail: `TrendEff: ${ctx.trendEfficiency.toFixed(2)}, ADX: ${ctx.adxStrength.toFixed(0)}`,
      required: true,
    },
    {
      name: 'Spread Stability',
      passed: ctx.spreadStability > 50,
      detail: `Spread rank: ${ctx.spreadStability.toFixed(0)}%`,
      required: false,
    },
    {
      name: 'Session Alignment',
      passed: getSessionMultiplier(ctx.session, 'long') >= 0.85,
      detail: `Session: ${ctx.session}`,
      required: false,
    },
  ];

  const requiredPassed = checks.filter(c => c.required).every(c => c.passed);
  return { passed: requiredPassed, checks, direction: 'long' };
}

export function validateShortEntry(ctx: EdgeExecutionContext): EntryValidation {
  const checks: EntryCheck[] = [
    {
      name: 'Donchian Breakdown',
      passed: ctx.donchianBreakout,
      detail: ctx.donchianBreakout ? 'Lower band breakout confirmed' : 'No Donchian break',
      required: true,
    },
    {
      name: 'ADX Rising',
      passed: ctx.adxStrength > 20 && ctx.adxRising,
      detail: `ADX: ${ctx.adxStrength.toFixed(0)}, Rising: ${ctx.adxRising}`,
      required: true,
    },
    {
      name: 'Supertrend Bearish',
      passed: ctx.supertrendBearish,
      detail: ctx.supertrendBearish ? 'Supertrend confirms bearish' : 'Supertrend not bearish',
      required: true,
    },
    {
      name: 'Post-Break Ignition',
      passed: ctx.postBreakIgnition,
      detail: ctx.postBreakIgnition ? 'Ignition candle after break confirmed' : 'Awaiting post-break ignition',
      required: true,
    },
    {
      name: 'Volatility Expansion',
      passed: ctx.volatilityExpansion,
      detail: ctx.volatilityExpansion ? 'Vol expansion spike detected' : 'No vol expansion',
      required: false,
    },
    {
      name: 'Liquidity Thinning',
      passed: ctx.liquidityThinning,
      detail: ctx.liquidityThinning ? 'Bid-side thinning confirmed' : 'Normal liquidity',
      required: false,
    },
  ];

  const requiredPassed = checks.filter(c => c.required).every(c => c.passed);
  return { passed: requiredPassed, checks, direction: 'short' };
}

// ─── Stop Geometry ───────────────────────────────────────────────────

export interface StopGeometry {
  direction: 'long' | 'short';
  phase: 'snapback-absorption' | 'expansion-capture';
  initialStopR: number;
  trailingEnabled: boolean;
  trailingActivationThreshold: string;
  adaptiveToVolatility: boolean;
}

export function computeLongStopGeometry(ctx: EdgeExecutionContext): StopGeometry {
  const initialR = 1.0 + (1 - ctx.spreadStability / 100) * 0.5;
  return {
    direction: 'long',
    phase: 'snapback-absorption',
    initialStopR: Math.round(initialR * 100) / 100,
    trailingEnabled: false,
    trailingActivationThreshold: 'Expansion persistence threshold',
    adaptiveToVolatility: true,
  };
}

export function computeShortStopGeometry(ctx: EdgeExecutionContext): StopGeometry {
  // Shorts need wider initial stop (1.35R–1.5R)
  const initialR = 1.35 + (1 - ctx.spreadStability / 100) * 0.15;
  return {
    direction: 'short',
    phase: 'snapback-absorption',
    initialStopR: Math.round(initialR * 100) / 100,
    trailingEnabled: false,
    trailingActivationThreshold: 'Expansion continuation threshold (delayed)',
    adaptiveToVolatility: true,
  };
}

// ─── Execution Context ───────────────────────────────────────────────

export interface EdgeExecutionContext {
  pair: string;
  session: string;
  agentId: string;
  direction: 'long' | 'short';
  // Volatility
  volatilityPhase: 'compression' | 'ignition' | 'expansion' | 'exhaustion';
  volatilityTransitionValid: boolean;
  volatilityExpansion: boolean;
  // Indicators
  coalitionConfirmation: boolean;
  trendEfficiency: number;
  adxStrength: number;
  adxRising: boolean;
  donchianBreakout: boolean;
  supertrendBearish: boolean;
  postBreakIgnition: boolean;
  liquidityThinning: boolean;
  // Market quality
  spreadStability: number;       // 0-100
  slippageTolerance: boolean;
  liquidityConfirmed: boolean;
  // Survivorship
  survivorshipScore: number;     // 0-100
  survivorshipStable: boolean;
  indicatorSurvivorshipActive: boolean;
  // Regime
  longRegime: LongRegime | null;
  shortRegime: ShortRegime | null;
}

// ─── Execution Decision ──────────────────────────────────────────────

export interface EdgeExecutionDecision {
  direction: 'long' | 'short';
  pair: string;
  agentId: string;
  session: string;
  // Core
  permitted: boolean;
  blockReasons: string[];
  // Validation
  regimeAuthorized: boolean;
  entryValidation: EntryValidation;
  // Stop
  stopGeometry: StopGeometry;
  // Capital
  capitalMultiplier: number;
  shortCapitalCap: number;       // max 0.25 for shorts
  // Session
  sessionMultiplier: number;
  // Safety
  safetyPassed: boolean;
  safetyChecks: { name: string; passed: boolean; detail: string }[];
  // Survivorship
  survivorshipAdaptation: SurvivorshipAdaptation;
  // Final
  finalPositionMultiplier: number;
}

export interface SurvivorshipAdaptation {
  indicatorsActive: number;
  indicatorsDowngraded: number;
  indicatorsDisabled: number;
  weightAdjustmentApplied: boolean;
  reasoning: string;
}

// ─── Core Execution Decision Logic ──────────────────────────────────

export function computeEdgeExecutionDecision(ctx: EdgeExecutionContext): EdgeExecutionDecision {
  const blockReasons: string[] = [];

  // 1. Pair authorization
  const authorizedPairs = ctx.direction === 'long' ? LONG_AUTHORIZED_PAIRS : SHORT_AUTHORIZED_PAIRS;
  const pairNorm = ctx.pair.replace('/', '_');
  if (!authorizedPairs.includes(pairNorm)) {
    blockReasons.push(`${pairNorm} not authorized for ${ctx.direction} trading`);
  }

  // Short restriction check
  if (ctx.direction === 'short' && SHORT_RESTRICTED_PAIRS[pairNorm]) {
    blockReasons.push(`${pairNorm}: ${SHORT_RESTRICTED_PAIRS[pairNorm]}`);
  }

  // 2. Regime authorization
  let regimeAuthorized = false;
  if (ctx.direction === 'long' && ctx.longRegime) {
    regimeAuthorized = LONG_AUTHORIZED_REGIMES.includes(ctx.longRegime);
    if (!regimeAuthorized) blockReasons.push(`Long regime '${ctx.longRegime}' not authorized`);
  } else if (ctx.direction === 'short' && ctx.shortRegime) {
    regimeAuthorized = SHORT_AUTHORIZED_REGIMES.includes(ctx.shortRegime);
    if (!regimeAuthorized) blockReasons.push(`Short regime '${ctx.shortRegime}' not authorized`);
  } else {
    blockReasons.push(`No ${ctx.direction} regime detected`);
  }

  // 3. Entry validation
  const entryValidation = ctx.direction === 'long'
    ? validateLongEntry(ctx)
    : validateShortEntry(ctx);

  if (!entryValidation.passed) {
    const failedRequired = entryValidation.checks.filter(c => c.required && !c.passed);
    blockReasons.push(`Entry validation failed: ${failedRequired.map(c => c.name).join(', ')}`);
  }

  // 4. Session intelligence
  const sessionMultiplier = getSessionMultiplier(ctx.session, ctx.direction);
  if (sessionMultiplier === 0) {
    blockReasons.push(`Session ${ctx.session} suppressed for ${ctx.direction} trades`);
  }

  // 5. Execution safety
  const safetyChecks = [
    {
      name: 'Spread Threshold',
      passed: ctx.spreadStability >= 40,
      detail: `Spread stability: ${ctx.spreadStability}%`,
    },
    {
      name: 'Liquidity Viability',
      passed: ctx.liquidityConfirmed,
      detail: ctx.liquidityConfirmed ? 'Execution viable' : 'Insufficient liquidity',
    },
    {
      name: 'Slippage Tolerance',
      passed: ctx.slippageTolerance,
      detail: ctx.slippageTolerance ? 'Within band' : 'Slippage exceeds tolerance',
    },
  ];

  const safetyPassed = safetyChecks.every(c => c.passed);
  if (!safetyPassed) {
    const failed = safetyChecks.filter(c => !c.passed);
    blockReasons.push(`Safety failed: ${failed.map(c => c.name).join(', ')}`);
  }

  // 6. Stop geometry
  const stopGeometry = ctx.direction === 'long'
    ? computeLongStopGeometry(ctx)
    : computeShortStopGeometry(ctx);

  // 7. Capital allocation
  let capitalMultiplier = 1.0;
  const shortCapitalCap = 0.25;

  if (ctx.survivorshipScore >= 75) capitalMultiplier = 1.2;
  else if (ctx.survivorshipScore >= 60) capitalMultiplier = 1.0;
  else if (ctx.survivorshipScore >= 45) capitalMultiplier = 0.7;
  else if (ctx.survivorshipScore >= 25) capitalMultiplier = 0.4;
  else capitalMultiplier = 0;

  if (ctx.direction === 'short') {
    capitalMultiplier = Math.min(capitalMultiplier, shortCapitalCap);
  }

  // 8. Survivorship adaptation
  const survivorshipAdaptation: SurvivorshipAdaptation = {
    indicatorsActive: ctx.indicatorSurvivorshipActive ? 6 : 3,
    indicatorsDowngraded: ctx.indicatorSurvivorshipActive ? 1 : 3,
    indicatorsDisabled: ctx.indicatorSurvivorshipActive ? 0 : 1,
    weightAdjustmentApplied: !ctx.survivorshipStable,
    reasoning: ctx.survivorshipStable
      ? 'Survivorship stable — maintaining current weights'
      : 'Survivorship degrading — reducing indicator participation',
  };

  // 9. Final decision
  const finalPositionMultiplier = blockReasons.length > 0
    ? 0
    : Math.max(0, Math.min(2.0,
        capitalMultiplier * sessionMultiplier * (ctx.survivorshipScore / 75)
      ));

  const permitted = blockReasons.length === 0 && finalPositionMultiplier > 0;

  return {
    direction: ctx.direction,
    pair: ctx.pair,
    agentId: ctx.agentId,
    session: ctx.session,
    permitted,
    blockReasons,
    regimeAuthorized,
    entryValidation,
    stopGeometry,
    capitalMultiplier: Math.round(capitalMultiplier * 100) / 100,
    shortCapitalCap,
    sessionMultiplier: Math.round(sessionMultiplier * 100) / 100,
    safetyPassed,
    safetyChecks,
    survivorshipAdaptation,
    finalPositionMultiplier: Math.round(finalPositionMultiplier * 100) / 100,
  };
}

// ─── Long Governance Rules ───────────────────────────────────────────

export interface GovernanceRule {
  name: string;
  description: string;
  direction: 'long' | 'short';
}

export const LONG_GOVERNANCE_RULES: GovernanceRule[] = [
  { name: 'Continuation Bias', description: 'Maintain trades through minor volatility noise', direction: 'long' },
  { name: 'Expansion Priority', description: 'Prioritize expansion persistence over early exit', direction: 'long' },
  { name: 'Regime Exit Only', description: 'Terminate ONLY when expansion momentum decays or regime invalidates', direction: 'long' },
];

export const SHORT_GOVERNANCE_RULES: GovernanceRule[] = [
  { name: 'Reversal Volatility', description: 'Accept higher volatility environment', direction: 'short' },
  { name: 'Lower Win Tolerance', description: 'Allow lower win-rate tolerance for larger R:R', direction: 'short' },
  { name: 'Fast Capture', description: 'Capture fast directional expansions', direction: 'short' },
  { name: 'Regime Exit', description: 'Terminate when regime exits authorized list', direction: 'short' },
  { name: 'Expansion Decay Exit', description: 'Terminate when expansion continuation disappears', direction: 'short' },
  { name: 'Volatility Collapse Exit', description: 'Terminate when volatility collapses', direction: 'short' },
];

// ─── Mock Context Generator (for dashboard) ─────────────────────────

export function generateMockEdgeContext(
  pair: string,
  direction: 'long' | 'short',
  session: string = 'ny-overlap',
): EdgeExecutionContext {
  const isLong = direction === 'long';
  const phases = ['compression', 'ignition', 'expansion', 'exhaustion'] as const;
  const phase = phases[Math.floor(Math.random() * 4)];
  const score = 30 + Math.random() * 60;

  return {
    pair,
    session,
    agentId: 'forex-macro',
    direction,
    volatilityPhase: phase,
    volatilityTransitionValid: phase === 'ignition' || phase === 'expansion',
    volatilityExpansion: phase === 'expansion',
    coalitionConfirmation: Math.random() > 0.3,
    trendEfficiency: 0.35 + Math.random() * 0.45,
    adxStrength: 15 + Math.random() * 30,
    adxRising: Math.random() > 0.4,
    donchianBreakout: !isLong && Math.random() > 0.35,
    supertrendBearish: !isLong && Math.random() > 0.3,
    postBreakIgnition: !isLong && Math.random() > 0.4,
    liquidityThinning: Math.random() > 0.6,
    spreadStability: 35 + Math.random() * 55,
    slippageTolerance: Math.random() > 0.15,
    liquidityConfirmed: Math.random() > 0.1,
    survivorshipScore: score,
    survivorshipStable: score > 55,
    indicatorSurvivorshipActive: score > 50,
    longRegime: isLong
      ? (LONG_AUTHORIZED_REGIMES[Math.floor(Math.random() * LONG_AUTHORIZED_REGIMES.length)])
      : null,
    shortRegime: !isLong
      ? (SHORT_AUTHORIZED_REGIMES[Math.floor(Math.random() * SHORT_AUTHORIZED_REGIMES.length)])
      : null,
  };
}

// ─── Generate full mock execution state (for dashboard) ──────────────

export interface CoalitionRequirementDisplay {
  tier: 'duo' | 'trio';
  minAgents: number;
  survivorshipScore: number;
  rollingPF: number;
  expectancySlope: number;
  stabilityTrend: 'improving' | 'flat' | 'deteriorating';
  reasons: string[];
  autoPromotions: number;
  promotionLog: string[];
}

export interface LiveEdgeExecutionState {
  longDecisions: EdgeExecutionDecision[];
  shortDecisions: EdgeExecutionDecision[];
  activeRegimes: { direction: 'long' | 'short'; regime: string; pair: string; authorized: boolean }[];
  sessionStatus: SessionPriority[];
  governanceRules: GovernanceRule[];
  systemMode: 'DUAL_EDGE_ACTIVE' | 'LONG_ONLY' | 'FALLBACK';
  longPairsActive: number;
  shortPairsActive: number;
  totalBlocked: number;
  coalitionRequirement: CoalitionRequirementDisplay;
}

export function generateMockLiveEdgeState(): LiveEdgeExecutionState {
  const SESSIONS = ['london-open', 'ny-overlap', 'asian'];
  const longDecisions: EdgeExecutionDecision[] = [];
  const shortDecisions: EdgeExecutionDecision[] = [];
  const activeRegimes: LiveEdgeExecutionState['activeRegimes'] = [];

  for (const pair of LONG_AUTHORIZED_PAIRS) {
    const session = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const ctx = generateMockEdgeContext(pair, 'long', session);
    const decision = computeEdgeExecutionDecision(ctx);
    longDecisions.push(decision);
    if (ctx.longRegime) {
      activeRegimes.push({
        direction: 'long',
        regime: ctx.longRegime,
        pair,
        authorized: LONG_AUTHORIZED_REGIMES.includes(ctx.longRegime),
      });
    }
  }

  for (const pair of SHORT_AUTHORIZED_PAIRS) {
    const session = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const ctx = generateMockEdgeContext(pair, 'short', session);
    const decision = computeEdgeExecutionDecision(ctx);
    shortDecisions.push(decision);
    if (ctx.shortRegime) {
      activeRegimes.push({
        direction: 'short',
        regime: ctx.shortRegime,
        pair,
        authorized: SHORT_AUTHORIZED_REGIMES.includes(ctx.shortRegime),
      });
    }
  }

  const totalBlocked = [...longDecisions, ...shortDecisions].filter(d => !d.permitted).length;

  return {
    longDecisions,
    shortDecisions,
    activeRegimes,
    sessionStatus: SESSION_PRIORITIES,
    governanceRules: [...LONG_GOVERNANCE_RULES, ...SHORT_GOVERNANCE_RULES],
    systemMode: 'DUAL_EDGE_ACTIVE',
    longPairsActive: longDecisions.filter(d => d.permitted).length,
    shortPairsActive: shortDecisions.filter(d => d.permitted).length,
    totalBlocked,
    coalitionRequirement: {
      tier: 'duo',
      minAgents: 2,
      survivorshipScore: 42,
      rollingPF: 0.95,
      expectancySlope: -0.12,
      stabilityTrend: 'flat',
      reasons: ['Survivorship 42 ≥ 40', 'PF 0.95 ≥ 1.05', 'Stability: flat', 'Minimum 2-agent coalition enforced'],
      autoPromotions: 1,
      promotionLog: ['[AUTO-PROMOTE] BENCH→ACTIVE: regime-transition (PF=1.05, exp=0.12)'],
    },
  };
}
