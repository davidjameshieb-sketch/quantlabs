// ─── Post-Entry Trade Health Governance Engine ───
// Evaluates open trade quality via a composite health score (0-100).
// Drives trailing stop tightening and risk management — NEVER triggers forced exits.
// Does NOT influence entry signals or directional selection.

export type HealthBand = 'healthy' | 'caution' | 'sick' | 'critical';

export interface TradeHealthInput {
  currentPrice: number;
  entryPrice: number;
  initialSlPrice: number;
  direction: 'long' | 'short';
  pair: string;
  barsSinceEntry: number;
  mfePrice: number;
  regimeConfirmed: boolean;
  regimeEarlyWarning: boolean;
  regimeDiverging: boolean;
  persistenceNow: number;
  persistenceAtEntry: number;
  volAccNow: number;
  volAccAtEntry: number;
  volatilityScore: number;
  /** Previous time_to_mfe_bars value (null if MFE never achieved) */
  prevTimeToMfeBars?: number | null;
}

export interface TradeHealthResult {
  tradeHealthScore: number;
  healthBand: HealthBand;
  progressFail: boolean;
  rPips: number;
  mfeR: number;
  ueR: number;
  validationWindow: number;
  timeToMfeBars: number | null;
  components: {
    P: number;
    T_mfe: number;
    D_pers: number;
    D_acc: number;
    S_regime: number;
    A_drift: number;
  };
  governanceAction: TradeGovernanceAction;
}

export interface TradeGovernanceAction {
  type: 'maintain' | 'tighten-light' | 'tighten-heavy' | 'tighten-aggressive' | 'consider-exit';
  trailingTightenFactor: number;
  blockAdds: boolean;
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

  const rPips = Math.abs(input.entryPrice - input.initialSlPrice) * pipMult;
  const rSafe = Math.max(rPips, 0.1);

  const mfePips = input.direction === 'long'
    ? (input.mfePrice - input.entryPrice) * pipMult
    : (input.entryPrice - input.mfePrice) * pipMult;
  const mfeR = Math.max(0, mfePips) / rSafe;

  const uePips = input.direction === 'long'
    ? (input.currentPrice - input.entryPrice) * pipMult
    : (input.entryPrice - input.currentPrice) * pipMult;
  const ueR = uePips / rSafe;

  let validationWindow = 3;
  if (input.volatilityScore < 30) validationWindow = 4;
  if (input.volatilityScore > 65) validationWindow = 3;
  validationWindow = clamp(validationWindow, 3, 4);

  const progressFail = input.barsSinceEntry >= validationWindow && mfeR < 0.25;

  // ─── Time-to-MFE tracking ───
  let timeToMfeBars: number | null = input.prevTimeToMfeBars ?? null;
  if (timeToMfeBars === null && mfeR > 0) {
    timeToMfeBars = input.barsSinceEntry;
  }

  // ─── Component A: Favorable Progress Score (28%) ───
  const P = clamp(100 * (mfeR / 0.60), 0, 100);

  // ─── Component F: Time-to-MFE Score (10%) ───
  let T_mfe: number;
  if (timeToMfeBars !== null) {
    if (timeToMfeBars <= 2) T_mfe = 100;
    else if (timeToMfeBars <= validationWindow) T_mfe = 75;
    else if (timeToMfeBars <= validationWindow * 2) T_mfe = 50;
    else T_mfe = 30;
  } else {
    if (input.barsSinceEntry < validationWindow) T_mfe = 50;
    else if (input.barsSinceEntry < validationWindow * 2) T_mfe = 25;
    else T_mfe = 10;
  }

  // ─── Component B: Persistence Delta (16%) ───
  const deltaPers = input.persistenceNow - input.persistenceAtEntry;
  const D_pers = clamp(50 + 1.25 * deltaPers, 0, 100);

  // ─── Component C: Acceleration Delta (12%) ───
  const deltaAcc = input.volAccNow - input.volAccAtEntry;
  const D_acc = clamp(50 + 1.0 * deltaAcc, 0, 100);

  // ─── Component D: Regime Confirmation Stability (22%) ───
  let S_regime = 50;
  if (input.regimeConfirmed) S_regime = 100;
  if (input.regimeEarlyWarning) S_regime = Math.max(0, S_regime - 35);
  if (input.regimeDiverging) S_regime = Math.max(0, S_regime - 70);
  S_regime = clamp(S_regime, 0, 100);

  // ─── Component E: Drift / Adverse Movement Penalty (12%) ───
  let A_drift: number;
  if (input.barsSinceEntry < validationWindow) {
    A_drift = 50;
  } else {
    A_drift = clamp(
      100 - 120 * Math.max(0, -ueR) - 60 * Math.max(0, 0.20 - mfeR),
      0, 100
    );
  }

  // ─── Rebalanced Composite THS ───
  // P:28% + T_mfe:10% + D_pers:16% + D_acc:12% + S_regime:22% + A_drift:12% = 100%
  const raw = 0.28 * P + 0.10 * T_mfe + 0.16 * D_pers + 0.12 * D_acc + 0.22 * S_regime + 0.12 * A_drift;
  const tradeHealthScore = Math.round(clamp(raw, 0, 100));

  let healthBand: HealthBand;
  if (tradeHealthScore >= 70) healthBand = 'healthy';
  else if (tradeHealthScore >= 45) healthBand = 'caution';
  else if (tradeHealthScore >= 30) healthBand = 'sick';
  else healthBand = 'critical';

  if (progressFail && (input.regimeDiverging || input.regimeEarlyWarning)) {
    healthBand = 'critical';
  }

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
        trailingTightenFactor: 0.80,
        blockAdds: true,
        reason: `Caution: THS=${tradeHealthScore} — tightening trailing 20%, blocking adds`,
      };
      break;
    case 'sick':
      governanceAction = {
        type: 'tighten-heavy',
        trailingTightenFactor: 0.60,
        blockAdds: true,
        reason: `Sick: THS=${tradeHealthScore} — tightening trailing 40%${input.regimeDiverging ? ', regime diverging' : ''}`,
      };
      break;
    case 'critical':
      governanceAction = {
        type: ueR < -0.35 ? 'consider-exit' : 'tighten-aggressive',
        trailingTightenFactor: 0.50,
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
    timeToMfeBars,
    components: {
      P: Math.round(P),
      T_mfe: Math.round(T_mfe),
      D_pers: Math.round(D_pers),
      D_acc: Math.round(D_acc),
      S_regime: Math.round(S_regime),
      A_drift: Math.round(A_drift),
    },
    governanceAction,
  };
}
