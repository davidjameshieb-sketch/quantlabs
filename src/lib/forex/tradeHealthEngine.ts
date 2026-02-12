// ─── Post-Entry Trade Health Governance Engine ───
// Evaluates open trade quality via a composite health score (0-100).
// Drives trailing stop tightening and risk management — NEVER triggers forced exits.
// Does NOT influence entry signals or directional selection.

export type HealthBand = 'healthy' | 'caution' | 'sick' | 'critical';

export interface TradeHealthInput {
  /** Current price */
  currentPrice: number;
  /** Entry price */
  entryPrice: number;
  /** Initial stop-loss price (at entry) */
  initialSlPrice: number;
  /** Trade direction */
  direction: 'long' | 'short';
  /** Currency pair (for pip multiplier) */
  pair: string;
  /** Bars elapsed since entry (1m candles) */
  barsSinceEntry: number;
  /** Max favorable excursion price since entry */
  mfePrice: number;
  /** Regime context */
  regimeConfirmed: boolean;
  regimeEarlyWarning: boolean;
  regimeDiverging: boolean;
  /** Directional persistence score now vs at entry (0-100) */
  persistenceNow: number;
  persistenceAtEntry: number;
  /** Volatility acceleration score now vs at entry (0-100) */
  volAccNow: number;
  volAccAtEntry: number;
  /** Volatility score (0-100) for adaptive window */
  volatilityScore: number;
}

export interface TradeHealthResult {
  /** Composite trade health score 0-100 */
  tradeHealthScore: number;
  /** Health band classification */
  healthBand: HealthBand;
  /** Whether progress validation failed */
  progressFail: boolean;
  /** R = initial risk in pips */
  rPips: number;
  /** MFE in R-multiples */
  mfeR: number;
  /** Unrealized excursion in R-multiples */
  ueR: number;
  /** Validation window (candles) */
  validationWindow: number;
  /** Component scores for telemetry */
  components: {
    P: number;
    D_pers: number;
    D_acc: number;
    S_regime: number;
    A_drift: number;
  };
  /** Governance action to apply */
  governanceAction: TradeGovernanceAction;
}

export interface TradeGovernanceAction {
  /** Action type */
  type: 'maintain' | 'tighten-light' | 'tighten-heavy' | 'tighten-aggressive' | 'consider-exit';
  /** Trailing stop tightening multiplier (1.0 = no change, 0.7 = tighten 30%) */
  trailingTightenFactor: number;
  /** Block position adds */
  blockAdds: boolean;
  /** Human-readable reason */
  reason: string;
}

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeTradeHealth(input: TradeHealthInput): TradeHealthResult {
  const pipMult = getPipMultiplier(input.pair);

  // ─── R = initial risk in pips ───
  const rPips = Math.abs(input.entryPrice - input.initialSlPrice) * pipMult;
  const rSafe = Math.max(rPips, 0.1); // prevent division by zero

  // ─── MFE in R-multiples ───
  const mfePips = input.direction === 'long'
    ? (input.mfePrice - input.entryPrice) * pipMult
    : (input.entryPrice - input.mfePrice) * pipMult;
  const mfeR = Math.max(0, mfePips) / rSafe;

  // ─── UE (unrealized excursion) in R-multiples ───
  const uePips = input.direction === 'long'
    ? (input.currentPrice - input.entryPrice) * pipMult
    : (input.entryPrice - input.currentPrice) * pipMult;
  const ueR = uePips / rSafe;

  // ─── Adaptive validation window ───
  let validationWindow = 3;
  if (input.volatilityScore < 30) validationWindow = 4;
  if (input.volatilityScore > 65) validationWindow = 3; // already default
  validationWindow = clamp(validationWindow, 3, 4);

  // ─── Progress failure ───
  const progressFail = input.barsSinceEntry >= validationWindow && mfeR < 0.25;

  // ─── Component A: Favorable Progress Score ───
  const P = clamp(100 * (mfeR / 0.60), 0, 100);

  // ─── Component B: Persistence Delta ───
  const deltaPers = input.persistenceNow - input.persistenceAtEntry;
  const D_pers = clamp(50 + 1.25 * deltaPers, 0, 100);

  // ─── Component C: Acceleration Delta ───
  const deltaAcc = input.volAccNow - input.volAccAtEntry;
  const D_acc = clamp(50 + 1.0 * deltaAcc, 0, 100);

  // ─── Component D: Regime Confirmation Stability ───
  let S_regime = 50; // neutral default
  if (input.regimeConfirmed) S_regime = 100;
  if (input.regimeEarlyWarning) S_regime = Math.max(0, S_regime - 35);
  if (input.regimeDiverging) S_regime = Math.max(0, S_regime - 70);
  S_regime = clamp(S_regime, 0, 100);

  // ─── Component E: Drift / Adverse Movement Penalty ───
  let A_drift: number;
  if (input.barsSinceEntry < validationWindow) {
    A_drift = 50; // grace period
  } else {
    A_drift = clamp(
      100
      - 120 * Math.max(0, -ueR)
      - 60 * Math.max(0, 0.20 - mfeR),
      0,
      100
    );
  }

  // ─── Composite Trade Health Score ───
  const raw = 0.34 * P + 0.18 * D_pers + 0.14 * D_acc + 0.22 * S_regime + 0.12 * A_drift;
  const tradeHealthScore = Math.round(clamp(raw, 0, 100));

  // ─── Health Band ───
  let healthBand: HealthBand;
  if (tradeHealthScore >= 70) {
    healthBand = 'healthy';
  } else if (tradeHealthScore >= 45) {
    healthBand = 'caution';
  } else if (tradeHealthScore >= 30) {
    healthBand = 'sick';
  } else {
    healthBand = 'critical';
  }

  // Override to critical if progressFail + weak regime
  if (progressFail && (input.regimeDiverging || input.regimeEarlyWarning)) {
    healthBand = 'critical';
  }

  // ─── Governance Actions ───
  let governanceAction: TradeGovernanceAction;
  switch (healthBand) {
    case 'healthy':
      governanceAction = {
        type: 'maintain',
        trailingTightenFactor: 1.0,
        blockAdds: false,
        reason: 'Trade progressing well — normal trailing',
      };
      break;
    case 'caution':
      governanceAction = {
        type: 'tighten-light',
        trailingTightenFactor: 0.80, // tighten 20%
        blockAdds: true,
        reason: `Caution: THS=${tradeHealthScore} — tightening trailing 20%, blocking adds`,
      };
      break;
    case 'sick':
      governanceAction = {
        type: 'tighten-heavy',
        trailingTightenFactor: 0.60, // tighten 40%
        blockAdds: true,
        reason: `Sick: THS=${tradeHealthScore} — tightening trailing 40%${input.regimeDiverging ? ', regime diverging' : ''}`,
      };
      break;
    case 'critical':
      governanceAction = {
        type: ueR < -0.35 ? 'consider-exit' : 'tighten-aggressive',
        trailingTightenFactor: 0.50, // tighten 50%
        blockAdds: true,
        reason: `Critical: THS=${tradeHealthScore}${progressFail ? ' + progressFail' : ''} — aggressive tightening${ueR < -0.35 ? ', consider exit' : ''}`,
      };
      break;
  }

  return {
    tradeHealthScore,
    healthBand,
    progressFail,
    rPips: Math.round(rSafe * 10) / 10,
    mfeR: Math.round(mfeR * 100) / 100,
    ueR: Math.round(ueR * 100) / 100,
    validationWindow,
    components: {
      P: Math.round(P),
      D_pers: Math.round(D_pers),
      D_acc: Math.round(D_acc),
      S_regime: Math.round(S_regime),
      A_drift: Math.round(A_drift),
    },
    governanceAction,
  };
}
