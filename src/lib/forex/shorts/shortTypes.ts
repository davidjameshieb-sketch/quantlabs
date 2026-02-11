// ─── Short Engine Types ───
// Dedicated type system for the SHORT trading engine.
// Short microstructure is spiky + mean-reverting + liquidity-vacuum-y.
// Completely separate from the long continuation + stability-first system.

import type { LiquiditySession, VolatilityPhase } from '../microstructureEngine';

// ─── Short-Specific Regime Ladder ───
// Shorts skip the long Compression→Ignition→Expansion→Continuation ladder.
// Instead: Compression → Breakdown Spike → Micro Consolidation → Secondary Breakdown OR Full Revert

export type ShortRegime =
  | 'shock-breakdown'        // sudden price drop, stop cascade
  | 'risk-off-impulse'       // broad risk-off move (correlated selling)
  | 'liquidity-vacuum'       // bid-side evaporation
  | 'breakdown-continuation' // second leg lower after consolidation
  | 'orderly-uptrend'        // SUPPRESS — longs territory
  | 'balanced-chop'          // SUPPRESS — no directional edge
  | 'mean-reversion-rich';   // SUPPRESS — fades dominate

export const SHORT_REGIME_LABELS: Record<ShortRegime, string> = {
  'shock-breakdown': 'Shock Breakdown',
  'risk-off-impulse': 'Risk-Off Impulse',
  'liquidity-vacuum': 'Liquidity Vacuum',
  'breakdown-continuation': 'Breakdown Continuation',
  'orderly-uptrend': 'Orderly Uptrend (Suppressed)',
  'balanced-chop': 'Balanced Chop (Suppressed)',
  'mean-reversion-rich': 'Mean Reversion Rich (Suppressed)',
};

export const SHORT_TRADEABLE_REGIMES: ShortRegime[] = [
  'shock-breakdown',
  'risk-off-impulse',
  'liquidity-vacuum',
  'breakdown-continuation',
];

export const SHORT_SUPPRESSED_REGIMES: ShortRegime[] = [
  'orderly-uptrend',
  'balanced-chop',
  'mean-reversion-rich',
];

// ─── Short Stop Geometry ───
// Phase A: No shrink. Let the snapback happen (3–8 candles).
// Phase B: Activate trail only after MFE >= 1.2× initial risk.

export interface ShortStopConfig {
  /** Multiplier for ATR(5) to set initial stop width */
  initialStopAtrMultiplier: number;
  /** Multiplier for spread to ensure stop > friction */
  initialStopSpreadMultiplier: number;
  /** Buffer pips above recent swing high for stop placement */
  swingHighBufferPips: number;
  /** Number of candles before shrink/trail can activate */
  noShrinkCandleCount: number;
  /** MFE threshold as multiple of initial risk to activate trailing */
  trailActivationMfeMultiple: number;
  /** Number of bars to look back for trailing structure */
  trailStructureBars: number;
  /** Buffer pips above trailing structure (last N-bar high) */
  trailBufferPips: number;
}

export const DEFAULT_SHORT_STOP_CONFIG: ShortStopConfig = {
  initialStopAtrMultiplier: 1.5,
  initialStopSpreadMultiplier: 3.0,
  swingHighBufferPips: 2.0,
  noShrinkCandleCount: 5,
  trailActivationMfeMultiple: 1.2,
  trailStructureBars: 3,
  trailBufferPips: 1.5,
};

// ─── Short Execution Gates (stricter than longs) ───

export type ShortGateId =
  | 'GS1_SPREAD_SPIKE'        // spread > median * 1.5
  | 'GS2_SLIPPAGE_CLUSTER'    // widening + slip clustering in last N min
  | 'GS3_SUPPRESSED_REGIME'   // orderly uptrend / balanced chop / mean-reversion
  | 'GS4_NO_BREAKDOWN_CONFIRM' // no follow-through after initial break
  | 'GS5_BOUNCE_TRAP'         // first bounce not cleared
  | 'GS6_CARRY_DRAG'          // pair has positive carry that erodes short edge
  | 'GS7_FRICTION_SHORT';     // friction ratio stricter than longs (4× vs 3×)

export interface ShortGateEntry {
  id: ShortGateId;
  message: string;
}

// ─── Short Entry Confirmation ───
// Two-stage trigger: Setup (regime qualifies) + Trigger (bounce tolerance).

export type ShortEntryStage = 'setup' | 'trigger';

export interface ShortEntrySignal {
  stage: ShortEntryStage;
  /** Which indicator combo detected the setup/trigger */
  indicatorSignature: string;
  /** Breakdown confirmation type */
  confirmationType: 'donchian-break' | 'supertrend-flip' | 'ema-slope-roc' | 'bollinger-squeeze-break' | 'ichimoku-cloud-break' | 'pivot-rejection';
  /** Whether the bounce trap filter passed */
  bounceTolerancePassed: boolean;
  /** Details of the confirmation */
  details: string;
}

// ─── Snapback Survival Metrics ───
// The key differentiator: shorts experience high initial MAE before profit.

export interface SnapbackSurvivalMetrics {
  /** Average MAE as multiple of initial risk (R) */
  avgMaeR: number;
  /** Win rate for trades that experienced MAE > 0.5R */
  winRateWhenMaeGt05R: number;
  /** Win rate for trades that experienced MAE > 1.0R */
  winRateWhenMaeGt1R: number;
  /** Percentage of winning shorts that survived > 0.6R adverse excursion */
  pctWinnersWithSnapback: number;
  /** Empirically derived correct stop level (R units) */
  empiricalStopR: number;
  /** Sample size for these metrics */
  sampleSize: number;
}

// ─── Short Survivorship Score ───

export interface ShortSurvivorshipEntry {
  pair: string;
  session: LiquiditySession;
  agentId: string;
  indicatorSignature: string;
  regime: ShortRegime;
  /** Core metrics */
  expectancy: number;
  profitFactor: number | null; // null when PF is invalid (zero-loss guard)
  winRate: number;
  tradeCount: number;
  /** Snapback survival */
  snapback: SnapbackSurvivalMetrics;
  /** MAE/MFE distributions */
  avgMae: number;
  avgMfe: number;
  avgGiveBack: number;
  /** Drawdown density (max consecutive loss pips / total pips) */
  drawdownDensity: number;
  /** Friction metrics */
  avgSpread: number;
  avgSlippage: number;
  /** Survivorship tier */
  tier: 'viable' | 'marginal' | 'suppress';
  /** Reason for tier classification */
  tierReason: string;
}

// ─── Short Shadow Validation ───

export type ShortShadowStatus = 'collecting' | 'evaluating' | 'promoted' | 'failed';

export interface ShortShadowResult {
  status: ShortShadowStatus;
  /** Number of shadow trades collected */
  tradeCount: number;
  /** Minimum trades required for evaluation */
  minTradesRequired: number;
  /** Promotion gate results */
  gates: {
    expectancyPositive: boolean;
    profitFactorStable: boolean;    // PF >= 1.2 with validity guard
    drawdownNotWorse: boolean;      // dd density <= baseline * 1.1
    frictionNotWorse: boolean;      // avg friction <= baseline * 1.05
    executionQualityOk: boolean;    // execution quality score >= 70
  };
  /** Whether all gates passed */
  allGatesPassed: boolean;
  /** If failed, why */
  failureReport: string | null;
  /** Metrics snapshot at evaluation time */
  metricsSnapshot: {
    expectancy: number;
    profitFactor: number | null;
    drawdownDensity: number;
    avgFriction: number;
    winRate: number;
  } | null;
}

// ─── Short Engine Configuration (JSON-serializable) ───

export interface ShortEngineConfig {
  /** Enabled pairs for short trading */
  enabledPairs: string[];
  /** Allowed sessions per pair */
  allowedSessions: Record<string, LiquiditySession[]>;
  /** Allowed agents */
  allowedAgents: string[];
  /** Stop geometry per pair (overrides default) */
  stopConfigs: Record<string, Partial<ShortStopConfig>>;
  /** Global default stop config */
  defaultStopConfig: ShortStopConfig;
  /** Friction gate multiplier (default 4.0 vs 3.0 for longs) */
  frictionGateK: number;
  /** Spread spike multiplier for GS1 (default 1.5) */
  spreadSpikeMultiplier: number;
  /** Slippage clustering window in minutes for GS2 */
  slippageClusterWindowMinutes: number;
  /** Minimum governance composite for short approval */
  minCompositeThreshold: number;
  /** Shadow mode config */
  shadowMinTrades: number;
  /** Whether the engine is globally enabled */
  enabled: boolean;
  /** Whether currently in shadow-only mode */
  shadowOnly: boolean;
}

export const DEFAULT_SHORT_ENGINE_CONFIG: ShortEngineConfig = {
  enabledPairs: [
    'USD_JPY', 'GBP_USD', 'EUR_USD', 'EUR_JPY', 'GBP_JPY',
  ],
  allowedSessions: {
    'USD_JPY': ['london-open', 'ny-overlap'],
    'GBP_USD': ['london-open', 'ny-overlap'],
    'EUR_USD': ['london-open', 'ny-overlap'],
    'EUR_JPY': ['london-open', 'ny-overlap'],
    'GBP_JPY': ['london-open', 'ny-overlap'],
  },
  allowedAgents: ['forex-macro', 'range-navigator', 'volatility-architect'],
  stopConfigs: {},
  defaultStopConfig: DEFAULT_SHORT_STOP_CONFIG,
  frictionGateK: 4.0,
  spreadSpikeMultiplier: 1.5,
  slippageClusterWindowMinutes: 5,
  minCompositeThreshold: 0.75,
  shadowMinTrades: 30,
  enabled: false,    // OFF by default — must be explicitly enabled
  shadowOnly: true,  // starts in shadow mode
};
