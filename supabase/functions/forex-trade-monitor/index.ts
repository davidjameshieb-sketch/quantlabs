// Forex Trade Exit Monitor
// Runs on a cron schedule — checks open OANDA trades against TP/SL thresholds
// and time limits, auto-closes positions, records exit_price and closed_at.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};
// USER_ID removed — monitor now scans ALL filled trades regardless of user_id.
// Matrix-fired trades use a system UUID (00000000-...) and would be missed by user_id filter.
const STRATEGY_CUTOFF = "2026-02-12T00:00:00Z";

// ─── Pair-specific thresholds ───

const JPY_PAIRS = ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY"];

function getPipMultiplier(pair: string): number {
  return JPY_PAIRS.includes(pair) ? 0.01 : 0.0001;
}

// PHASE 2: TP thresholds REMOVED — ATR-trailing manages all exits
// Safety ceiling TP set at 5R on the OANDA order. These pip values are only used
// for the legacy computeTrailingStop function (which is now subordinate to R-based trailing).
function getExitThresholds(pair: string): { tpPips: number } {
  // Return very wide safety values — actual exits via ATR-trailing in evaluateExit()
  const highVol = ["GBP_JPY", "GBP_AUD", "EUR_AUD", "AUD_NZD"];
  const medVol = ["GBP_USD", "EUR_JPY", "AUD_JPY", "USD_CAD", "EUR_GBP", "USD_JPY"];
  if (highVol.includes(pair)) return { tpPips: 75 };
  if (medVol.includes(pair)) return { tpPips: 54 };
  return { tpPips: 36 };
}

// ─── Dynamic Stop Loss from 15m Supertrend + ATR ───
// LONG: SL = supertrendValue - max(5 pips, 25% of 15m ATR)
// SHORT: SL = supertrendValue + max(5 pips, 25% of 15m ATR)
// Returns the SL price level and the distance in pips from entry

interface DynamicSL {
  slPrice: number;
  slDistancePips: number;
  source: "supertrend+atr" | "fallback";
}

function computeDynamicSL(
  direction: string,
  entryPrice: number,
  pair: string,
  supertrendValue: number | null,
  atr15m: number | null,
): DynamicSL {
  const pipMult = getPipMultiplier(pair);

  // Fallback if no indicator data available
  if (supertrendValue === null || atr15m === null) {
    const highVol = ["GBP_JPY", "GBP_AUD", "EUR_AUD", "AUD_NZD"];
    const medVol = ["GBP_USD", "EUR_JPY", "AUD_JPY", "USD_CAD", "EUR_GBP", "USD_JPY"];
    const fallbackSlPips = highVol.includes(pair) ? 12 : medVol.includes(pair) ? 9 : 7;
    const slPrice = direction === "long"
      ? entryPrice - fallbackSlPips * pipMult
      : entryPrice + fallbackSlPips * pipMult;
    return { slPrice, slDistancePips: fallbackSlPips, source: "fallback" };
  }

  // Buffer = max(5 pips, 25% of 15m ATR) converted to price units
  const minBufferPrice = 5 * pipMult;
  const atrBufferPrice = 0.25 * atr15m;
  const buffer = Math.max(minBufferPrice, atrBufferPrice);

  let slPrice: number;
  if (direction === "long") {
    // SL below the Supertrend
    slPrice = supertrendValue - buffer;
    // Sanity: SL must be BELOW entry for a long — otherwise it triggers immediately
    if (slPrice >= entryPrice) {
      const fallbackSlPips = 12;
      slPrice = entryPrice - fallbackSlPips * pipMult;
      console.log(`[DYNAMIC-SL] ${pair} long: Supertrend SL ${(supertrendValue - buffer).toFixed(5)} >= entry ${entryPrice.toFixed(5)}, using fallback ${slPrice.toFixed(5)}`);
    }
  } else {
    // SL above the Supertrend
    slPrice = supertrendValue + buffer;
    // Sanity: SL must be ABOVE entry for a short — otherwise it triggers immediately
    if (slPrice <= entryPrice) {
      const fallbackSlPips = 12;
      slPrice = entryPrice + fallbackSlPips * pipMult;
      console.log(`[DYNAMIC-SL] ${pair} short: Supertrend SL ${(supertrendValue + buffer).toFixed(5)} <= entry ${entryPrice.toFixed(5)}, using fallback ${slPrice.toFixed(5)}`);
    }
  }

  const slDistancePips = direction === "long"
    ? (entryPrice - slPrice) / pipMult
    : (slPrice - entryPrice) / pipMult;

  return { slPrice, slDistancePips: Math.abs(slDistancePips), source: "supertrend+atr" };
}

// ─── Trailing stop logic ───
// If trade is >60% to TP, tighten SL to breakeven + 1 pip

function computeTrailingStop(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  pair: string,
  tpPips: number,
  triggerRatio = 0.60
): { adjustedSlPrice: number; isTrailing: boolean } {
  const pipMult = getPipMultiplier(pair);

  const tpPrice = direction === "long"
    ? entryPrice + tpPips * pipMult
    : entryPrice - tpPips * pipMult;

  // Calculate progress toward TP
  const totalDistance = Math.abs(tpPrice - entryPrice);
  const currentDistance = direction === "long"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  const progressRatio = totalDistance > 0 ? currentDistance / totalDistance : 0;

  if (progressRatio >= triggerRatio) {
    const breakEvenPlus = direction === "long"
      ? entryPrice + 1 * pipMult
      : entryPrice - 1 * pipMult;
    return { adjustedSlPrice: breakEvenPlus, isTrailing: true };
  }

  return { adjustedSlPrice: 0, isTrailing: false };
}

// ─── OANDA Order Modification (WRITE PERMISSION) ───
// FloorManager WRITE_PERMISSION for PATCH /v3/accounts/{accountID}/trades/{tradeSpecifier}/orders
// Allows autonomous trailing stop updates, SL tightening, and TP adjustments on live OANDA trades.

interface OrderModificationResult {
  success: boolean;
  tradeId: string;
  action: string;
  newStopLoss?: number;
  newTakeProfit?: number;
  error?: string;
}

async function updateTrailingStop(
  tradeId: string,
  newStopLossPrice: number,
  environment = "live",
  pair = "",
): Promise<OrderModificationResult> {
  // FIX: JPY pairs require 3 decimal places — .toFixed(5) causes PRICE_PRECISION_EXCEEDED rejections
  const slPrecision = pair.includes("JPY") ? 3 : 5;
  try {
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${tradeId}/orders`,
      "PUT",
      {
        stopLoss: {
          price: newStopLossPrice.toFixed(slPrecision),
          timeInForce: "GTC",
        },
      },
      environment,
    );
    console.log(`[FLOOR-MANAGER] ✅ SL updated on trade ${tradeId} → ${newStopLossPrice.toFixed(slPrecision)}`);
    return { success: true, tradeId, action: "updateTrailingStop", newStopLoss: newStopLossPrice };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[FLOOR-MANAGER] ❌ Failed to update SL on trade ${tradeId}: ${msg}`);
    return { success: false, tradeId, action: "updateTrailingStop", error: msg };
  }
}

async function updateTakeProfit(
  tradeId: string,
  newTakeProfitPrice: number,
  environment = "live",
  pair = "",
): Promise<OrderModificationResult> {
  // FIX: JPY pairs require 3 decimal places — .toFixed(5) causes PRICE_PRECISION_EXCEEDED
  const tpPrecision = pair.includes("JPY") ? 3 : 5;
  try {
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${tradeId}/orders`,
      "PUT",
      {
        takeProfit: {
          price: newTakeProfitPrice.toFixed(tpPrecision),
          timeInForce: "GTC",
        },
      },
      environment,
    );
    console.log(`[FLOOR-MANAGER] ✅ TP updated on trade ${tradeId} → ${newTakeProfitPrice.toFixed(tpPrecision)}`);
    return { success: true, tradeId, action: "updateTakeProfit", newTakeProfit: newTakeProfitPrice };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[FLOOR-MANAGER] ❌ Failed to update TP on trade ${tradeId}: ${msg}`);
    return { success: false, tradeId, action: "updateTakeProfit", error: msg };
  }
}

async function updateTradeOrders(
  tradeId: string,
  stopLossPrice?: number,
  takeProfitPrice?: number,
  environment = "live",
  pair = "",
): Promise<OrderModificationResult> {
  // FIX: JPY pairs require 3 decimal places — .toFixed(5) causes PRICE_PRECISION_EXCEEDED
  const pricePrecision = pair.includes("JPY") ? 3 : 5;
  const body: Record<string, unknown> = {};
  if (stopLossPrice != null) {
    body.stopLoss = { price: stopLossPrice.toFixed(pricePrecision), timeInForce: "GTC" };
  }
  if (takeProfitPrice != null) {
    body.takeProfit = { price: takeProfitPrice.toFixed(pricePrecision), timeInForce: "GTC" };
  }
  if (Object.keys(body).length === 0) {
    return { success: false, tradeId, action: "updateTradeOrders", error: "No modifications specified" };
  }
  try {
    await oandaRequest(
      `/v3/accounts/{accountId}/trades/${tradeId}/orders`,
      "PUT",
      body,
      environment,
    );
    console.log(`[FLOOR-MANAGER] ✅ Trade ${tradeId} orders updated: SL=${stopLossPrice?.toFixed(pricePrecision) || 'unchanged'} TP=${takeProfitPrice?.toFixed(pricePrecision) || 'unchanged'}`);
    return { success: true, tradeId, action: "updateTradeOrders", newStopLoss: stopLossPrice, newTakeProfit: takeProfitPrice };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[FLOOR-MANAGER] ❌ Trade ${tradeId} order update failed: ${msg}`);
    return { success: false, tradeId, action: "updateTradeOrders", error: msg };
  }
}

// ─── OANDA API Helper ───

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>, environment = "practice"): Promise<Record<string, unknown>> {
  // Use the environment parameter directly — "practice" should always route to practice API
  const effectiveEnv = environment;
  const apiToken = effectiveEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = effectiveEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[effectiveEnv] || OANDA_HOSTS.practice;
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(`[TRADE-MONITOR] OANDA error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA error: ${response.status}`);
  }

  return data;
}

// ─── Post-Entry Trade Health Engine (inline) ───
// Computes a composite health score (0-100) for open trades.
// Drives trailing stop tightening — NEVER triggers forced exits.

type HealthBand = 'healthy' | 'caution' | 'sick' | 'critical';

interface TradeHealthResult {
  tradeHealthScore: number;
  healthBand: HealthBand;
  progressFail: boolean;
  rPips: number;
  mfeR: number;
  ueR: number;
  validationWindow: number;
  timeToMfeBars: number | null;
  components: { P: number; T_mfe: number; D_pers: number; D_acc: number; S_regime: number; A_drift: number };
  trailingTightenFactor: number;
  governanceActionType: string;
  governanceReason: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function computeTradeHealthScore(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  initialSlPrice: number,
  mfePrice: number,
  pair: string,
  barsSinceEntry: number,
  volatilityScore: number,
  persistenceNow: number,
  persistenceAtEntry: number,
  volAccNow: number,
  volAccAtEntry: number,
  regimeConfirmed: boolean,
  regimeEarlyWarning: boolean,
  regimeDiverging: boolean,
  prevTimeToMfeBars: number | null,
): TradeHealthResult {
  const pipMult = getPipMultiplier(pair);
  // IMPORTANT: pipMult here is the pip SIZE (0.0001 for non-JPY, 0.01 for JPY)
  // To convert price difference to pips, we DIVIDE by pipMult, not multiply
  const rPips = Math.max(Math.abs(entryPrice - initialSlPrice) / pipMult, 0.1);

  const mfePips = direction === "long"
    ? Math.max(0, (mfePrice - entryPrice) / pipMult)
    : Math.max(0, (entryPrice - mfePrice) / pipMult);
  const mfeR = mfePips / rPips;

  const uePips = direction === "long"
    ? (currentPrice - entryPrice) / pipMult
    : (entryPrice - currentPrice) / pipMult;
  const ueR = uePips / rPips;

  let validationWindow = 3;
  if (volatilityScore < 30) validationWindow = 4;
  validationWindow = clamp(validationWindow, 3, 4);

  const progressFail = barsSinceEntry >= validationWindow && mfeR < 0.25;

  // ─── Time-to-MFE tracking ───
  // Records the first bar where MFE goes positive (mfeR > 0).
  // Once set, it never changes for the life of the trade.
  let timeToMfeBars: number | null = prevTimeToMfeBars;
  if (timeToMfeBars === null && mfeR > 0) {
    timeToMfeBars = barsSinceEntry;
  }

  // ─── Component A: Favorable Progress Score (was 34%, now 28%) ───
  const P = clamp(100 * (mfeR / 0.60), 0, 100);

  // ─── Component F: Time-to-MFE Score (new, 10%) ───
  // Winning trades show MFE early. Penalize delayed or absent MFE.
  let T_mfe: number;
  if (timeToMfeBars !== null) {
    // MFE achieved — score based on how quickly
    if (timeToMfeBars <= 2) T_mfe = 100;        // excellent early conviction
    else if (timeToMfeBars <= validationWindow) T_mfe = 75;  // acceptable
    else if (timeToMfeBars <= validationWindow * 2) T_mfe = 50; // slow
    else T_mfe = 30;                              // very late
  } else {
    // MFE never achieved yet
    if (barsSinceEntry < validationWindow) T_mfe = 50; // grace period
    else if (barsSinceEntry < validationWindow * 2) T_mfe = 25; // concerning
    else T_mfe = 10; // very bad — no favorable move after extended time
  }

  // ─── Component B: Persistence Delta (was 18%, now 16%) ───
  const D_pers = clamp(50 + 1.25 * (persistenceNow - persistenceAtEntry), 0, 100);

  // ─── Component C: Acceleration Delta (was 14%, now 12%) ───
  const D_acc = clamp(50 + 1.0 * (volAccNow - volAccAtEntry), 0, 100);

  // ─── Component D: Regime Confirmation Stability (unchanged 22%) ───
  let S_regime = 50;
  if (regimeConfirmed) S_regime = 100;
  if (regimeEarlyWarning) S_regime = Math.max(0, S_regime - 35);
  if (regimeDiverging) S_regime = Math.max(0, S_regime - 70);
  S_regime = clamp(S_regime, 0, 100);

  // ─── Component E: Drift / Adverse Movement Penalty (unchanged 12%) ───
  let A_drift: number;
  if (barsSinceEntry < validationWindow) {
    A_drift = 50;
  } else {
    A_drift = clamp(100 - 120 * Math.max(0, -ueR) - 60 * Math.max(0, 0.20 - mfeR), 0, 100);
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

  if (progressFail && (regimeDiverging || regimeEarlyWarning)) healthBand = 'critical';

  let trailingTightenFactor = 1.0;
  let governanceActionType = 'maintain';
  let governanceReason = 'Trade healthy — normal trailing';

  if (healthBand === 'caution') {
    trailingTightenFactor = 0.80;
    governanceActionType = 'tighten-light';
    governanceReason = `Caution THS=${tradeHealthScore} — tightening 20%`;
  } else if (healthBand === 'sick') {
    trailingTightenFactor = 0.60;
    governanceActionType = 'tighten-heavy';
    governanceReason = `Sick THS=${tradeHealthScore} — tightening 40%`;
  } else if (healthBand === 'critical') {
    trailingTightenFactor = 0.50;
    governanceActionType = ueR < -0.35 ? 'consider-exit' : 'tighten-aggressive';
    governanceReason = `Critical THS=${tradeHealthScore}${progressFail ? '+progFail' : ''} — ${ueR < -0.35 ? 'consider exit' : 'aggressive tighten'}`;
  }

  return {
    tradeHealthScore, healthBand, progressFail,
    rPips: Math.round(rPips * 10) / 10,
    mfeR: Math.round(mfeR * 100) / 100,
    ueR: Math.round(ueR * 100) / 100,
    validationWindow,
    timeToMfeBars,
    components: { P: Math.round(P), T_mfe: Math.round(T_mfe), D_pers: Math.round(D_pers), D_acc: Math.round(D_acc), S_regime: Math.round(S_regime), A_drift: Math.round(A_drift) },
    trailingTightenFactor, governanceActionType, governanceReason,
  };
}

// ─── Exit Decision Engine ───
// ═══ EXIT RULE PRIORITY (STRICT, INVIOLABLE ORDER) ═══
// 1. TP hit          → CLOSE immediately
// 2. Trailing stop   → CLOSE immediately
// 3. SL hit          → CLOSE immediately (dynamic via Supertrend+ATR)
// 4. Hold            → Continue monitoring (NO time limits — let TP/SL/trailing handle exits)
//
// DIVERGENCE DEFENSE is SUBORDINATE to all hard rules:
//   ✅ Can tighten trailing stops (reduce trailing trigger from 60% → 40% of TP)
//   ❌ NEVER widens stops or delays exits

interface ExitDecision {
  action: "hold" | "close-tp" | "close-sl" | "close-trailing";
  reason: string;
  currentPnlPips: number;
  progressToTp: number;
  tradeAgeMinutes: number;
}

function evaluateExit(
  direction: string,
  entryPrice: number,
  currentPrice: number,
  pair: string,
  tradeAgeMinutes: number,
  dynamicSl: DynamicSL,
  governancePayload?: Record<string, unknown>,
  healthTrailingFactor = 1.0,
  rPips?: number | null,
  mfePriceWatermark?: number | null,
  atr15m?: number | null,
): ExitDecision {
  const pipMult = getPipMultiplier(pair);

  // Current P&L in pips
  const currentPnlPips = direction === "long"
    ? (currentPrice - entryPrice) / pipMult
    : (entryPrice - currentPrice) / pipMult;

  // R-multiple based calculations
  const effectiveRPips = rPips && rPips > 0 ? rPips : dynamicSl.slDistancePips;
  const currentR = effectiveRPips > 0 ? currentPnlPips / effectiveRPips : 0;

  // MFE in R-multiples (from watermark prices)
  const mfePips = mfePriceWatermark != null ? (direction === "long"
    ? Math.max(0, (mfePriceWatermark - entryPrice) / pipMult)
    : Math.max(0, (entryPrice - mfePriceWatermark) / pipMult)) : 0;
  const mfeR = effectiveRPips > 0 ? mfePips / effectiveRPips : 0;

  // Progress (TP safety ceiling is 5R — ATR-trailing handles exits before this)
  const progressToTp = currentR / 5.0;

  // ═══ PRIORITY 1: TP safety ceiling (5R) — emergency only, ATR-trailing handles exits ═══
  // PHASE 2: Raised from 2R→5R to let winners run. ATR-trailing at 1.5R/2R manages actual exits.
  if (currentR >= 5.0) {
    return {
      action: "close-tp",
      reason: `TP ceiling hit: +${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R, safety ceiling: 5.0R)`,
      currentPnlPips, progressToTp, tradeAgeMinutes,
    };
  }

  // ═══ PRIORITY 2: ATR-trailing stop (R-multiple based, 2 phases) ═══
  const entryRegimeDiverging = governancePayload?.regimeEarlyWarning === true;

  if (mfeR >= 2.0 && atr15m != null && atr15m > 0) {
    // Phase 2: MFE reached 2R — trail at MFE - 0.75 × ATR(15m)
    const trailDistance = 0.75 * atr15m * healthTrailingFactor;
    const trailingSlPrice = direction === "long"
      ? mfePriceWatermark! - trailDistance
      : mfePriceWatermark! + trailDistance;

    const trailingHit = direction === "long"
      ? currentPrice <= trailingSlPrice
      : currentPrice >= trailingSlPrice;

    if (trailingHit) {
      return {
        action: "close-trailing",
        reason: `ATR-trailing hit: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R | trail@MFE-0.75×ATR`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  } else if (mfeR >= 1.7) {
    // ═══ PHASE 1.5 TRAILING GAP — MFE >= 1.7R: lock in 1.2R ═══
    // BUGFIX: Previously placed AFTER the 1.5R block, making it unreachable (else-if chain).
    // Any trade reaching 1.7R was caught by mfeR >= 1.5 first. Moved above 1.5R to fix.
    const lockR = 1.2 * effectiveRPips * pipMult;
    const phase15SlPrice = direction === "long"
      ? entryPrice + lockR * healthTrailingFactor
      : entryPrice - lockR * healthTrailingFactor;

    const phase15Hit = direction === "long"
      ? currentPrice <= phase15SlPrice
      : currentPrice >= phase15SlPrice;

    if (phase15Hit) {
      return {
        action: "close-trailing",
        reason: `Phase-1.5 trail: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R reached 1.7R — locking 1.2R (pulse-ratchet step)`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  } else if (mfeR >= 1.5) {
    // Phase 1: MFE reached 1.5R — trail at entry + 1R (lock in profit)
    const oneRDistance = effectiveRPips * pipMult;
    let trailingSlPrice: number;
    if (direction === "long") {
      trailingSlPrice = entryPrice + oneRDistance * healthTrailingFactor;
      if (entryRegimeDiverging) trailingSlPrice = entryPrice + oneRDistance * 0.75 * healthTrailingFactor;
    } else {
      trailingSlPrice = entryPrice - oneRDistance * healthTrailingFactor;
      if (entryRegimeDiverging) trailingSlPrice = entryPrice - oneRDistance * 0.75 * healthTrailingFactor;
    }

    const trailingHit = direction === "long"
      ? currentPrice <= trailingSlPrice
      : currentPrice >= trailingSlPrice;

    if (trailingHit) {
      return {
        action: "close-trailing",
        reason: `R-trailing hit: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R | trail@entry+1R${entryRegimeDiverging ? ' (regime early-warn)' : ''}`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  } else if (mfeR >= 1.2) {
    // ═══ ACTIVE HARVEST RULE — MFE >= 1.2R: lock in 0.5R profit ═══
    // Pattern 5 fix: Stop "hoping for home runs" — bank doubles.
    // Prevents healthy trades from round-tripping back to scratch/loss.
    const harvestRDistance = 0.5 * effectiveRPips * pipMult;
    const harvestSlPrice = direction === "long"
      ? entryPrice + harvestRDistance * healthTrailingFactor
      : entryPrice - harvestRDistance * healthTrailingFactor;

    const harvestHit = direction === "long"
      ? currentPrice <= harvestSlPrice
      : currentPrice >= harvestSlPrice;

    if (harvestHit) {
      return {
        action: "close-trailing",
        reason: `Active harvest: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R reached 1.2R — locking 0.5R profit`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  } else if (mfeR >= 1.0) {
    // ═══ BREAKEVEN STOP — once MFE reaches 1.0R, move SL to entry ═══
    const breakevenSlPrice = direction === "long"
      ? entryPrice + 0.5 * pipMult
      : entryPrice - 0.5 * pipMult;

    const breakevenHit = direction === "long"
      ? currentPrice <= breakevenSlPrice
      : currentPrice >= breakevenSlPrice;

    if (breakevenHit) {
      return {
        action: "close-trailing",
        reason: `Breakeven stop: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R reached 1.0R — protecting at entry`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  } else if (mfeR >= 0.8) {
    // ═══ EARLY PROFIT LOCK — once MFE reaches 0.8R, lock 0.2R profit ═══
    const lockRDistance = 0.2 * effectiveRPips * pipMult;
    const earlyTrailSlPrice = direction === "long"
      ? entryPrice + lockRDistance
      : entryPrice - lockRDistance;

    const earlyTrailHit = direction === "long"
      ? currentPrice <= earlyTrailSlPrice
      : currentPrice >= earlyTrailSlPrice;

    if (earlyTrailHit) {
      return {
        action: "close-trailing",
        reason: `Early profit lock: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R reached 0.8R — locking 0.2R`,
        currentPnlPips, progressToTp, tradeAgeMinutes,
      };
    }
  }

  // ═══ PRIORITY 3: Dynamic SL hit (Supertrend + ATR based) ═══
  const slHit = direction === "long"
    ? currentPrice <= dynamicSl.slPrice
    : currentPrice >= dynamicSl.slPrice;

  if (slHit) {
    return {
      action: "close-sl",
      reason: `SL hit (${dynamicSl.source}): ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | SL@${dynamicSl.slPrice.toFixed(5)} (${dynamicSl.slDistancePips.toFixed(1)}p)`,
      currentPnlPips, progressToTp, tradeAgeMinutes,
    };
  }

  return {
    action: "hold",
    reason: `Holding: ${currentPnlPips.toFixed(1)}p (${currentR.toFixed(2)}R) | MFE=${mfeR.toFixed(2)}R | SL@${dynamicSl.slPrice.toFixed(5)} (${dynamicSl.slDistancePips.toFixed(1)}p) | ${tradeAgeMinutes.toFixed(0)}min [${dynamicSl.source}]`,
    currentPnlPips, progressToTp, tradeAgeMinutes,
  };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[TRADE-MONITOR] Starting exit scan at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all filled orders that haven't been closed yet (no exit_price)
    // NOTE: No user_id filter — matrix-fired trades use system UUID (00000000-...) and
    // would be missed. Scan all filled trades since strategy cutoff instead.
    const { data: openOrders, error: fetchErr } = await supabase
      .from("oanda_orders")
      .select("*")
      .eq("status", "filled")
      .is("exit_price", null)
      .not("oanda_trade_id", "is", null)
      .not("entry_price", "is", null)
      .gte("created_at", STRATEGY_CUTOFF)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("[TRADE-MONITOR] DB fetch error:", fetchErr);
      throw fetchErr;
    }

    if (!openOrders || openOrders.length === 0) {
      console.log("[TRADE-MONITOR] No open trades to monitor");
      return new Response(
        JSON.stringify({ success: true, monitored: 0, closed: 0, held: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[TRADE-MONITOR] Found ${openOrders.length} open trades to evaluate`);

    // 2. Get current OANDA open trades for live pricing
    // Group orders by environment for correct OANDA routing
    const ordersByEnv = new Map<string, typeof openOrders>();
    for (const o of openOrders) {
      const env = o.environment || "practice";
      if (!ordersByEnv.has(env)) ordersByEnv.set(env, []);
      ordersByEnv.get(env)!.push(o);
    }

    // Fetch open trades from each environment
    let oandaTrades: Array<{ id: string; instrument: string; currentUnits: string; price: string; unrealizedPL: string }> = [];
    for (const env of ordersByEnv.keys()) {
      try {
        const tradesResult = await oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, env);
        const trades = (tradesResult.trades || []) as typeof oandaTrades;
        oandaTrades.push(...trades);
      } catch (err) {
        console.error(`[TRADE-MONITOR] Failed to fetch OANDA trades for ${env}:`, err);
      }
    }

    // Build a map of OANDA trade ID -> live trade data
    const oandaTradeMap = new Map<string, typeof oandaTrades[0]>();
    for (const t of oandaTrades) {
      oandaTradeMap.set(t.id, t);
    }

    // ═══ FIX: Fetch CURRENT market prices for all instruments with open trades ═══
    // CRITICAL: oandaTrade.price is the ENTRY price, NOT the current market price!
    // Without this, all TP/SL/trailing evaluations see ~0 pips P&L and never trigger.
    const instrumentsNeeded = new Set(openOrders.map(o => o.currency_pair));
    // Store ask AND bid separately so shorts use ASK (cost to close) and longs use BID
    const askPriceMap = new Map<string, number>();
    const bidPriceMap = new Map<string, number>();
    if (instrumentsNeeded.size > 0) {
      try {
        const instruments = [...instrumentsNeeded].join(",");
        const priceRes = await oandaRequest(
          `/v3/accounts/{accountId}/pricing?instruments=${instruments}`, "GET", undefined, "practice"
        ) as { prices?: Array<{ instrument: string; asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
        for (const p of (priceRes.prices || [])) {
          const ask = parseFloat(p.asks?.[0]?.price || "0");
          const bid = parseFloat(p.bids?.[0]?.price || "0");
          if (ask > 0) askPriceMap.set(p.instrument, ask);
          if (bid > 0) bidPriceMap.set(p.instrument, bid);
        }
        console.log(`[TRADE-MONITOR] Fetched live prices for ${askPriceMap.size} instruments`);
      } catch (priceErr) {
        console.error(`[TRADE-MONITOR] Failed to fetch current prices:`, priceErr);
      }
    }

    // ═══ Fetch 15m Supertrend + ATR for dynamic stop loss ═══
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const indicatorMap = new Map<string, { supertrend: number; atr: number }>();

    // Fetch 15m indicators for each unique pair (parallel)
    const indicatorPromises = [...instrumentsNeeded].map(async (pair) => {
      try {
        const url = `${supabaseUrl}/functions/v1/forex-indicators?instrument=${pair}&timeframe=15m`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const stValue = data.indicators?.supertrend?.value;
          const atrValue = data.indicators?.atr?.value;
          if (stValue != null && atrValue != null) {
            indicatorMap.set(pair, { supertrend: stValue, atr: atrValue });
          }
        }
      } catch (err) {
        console.warn(`[TRADE-MONITOR] Failed to fetch 15m indicators for ${pair}:`, (err as Error).message);
      }
    });
    await Promise.all(indicatorPromises);
    console.log(`[TRADE-MONITOR] Fetched 15m indicators (Supertrend+ATR) for ${indicatorMap.size}/${instrumentsNeeded.size} pairs`);

    // 3. Evaluate each open order
    const results: Array<{
      pair: string; direction: string; action: string; reason: string;
      exitPrice?: number; pnlPips?: number;
    }> = [];

    let closedCount = 0;
    let heldCount = 0;

    for (const order of openOrders) {
      const oandaTrade = oandaTradeMap.get(order.oanda_trade_id!);
      
      // If trade is no longer on OANDA (already closed externally)
      if (!oandaTrade) {
        try {
          const tradeDetails = await oandaRequest(
            `/v3/accounts/{accountId}/trades/${order.oanda_trade_id}`,
            "GET",
            undefined,
            order.environment || "practice"
          ) as { trade: { state: string; averageClosePrice?: string; closeTime?: string; realizedPL?: string } };
          
          if (tradeDetails.trade?.state === "CLOSED") {
            const exitPrice = tradeDetails.trade.averageClosePrice 
              ? parseFloat(tradeDetails.trade.averageClosePrice) 
              : null;
            
            // ═══ FIX: Compute realized pips from actual prices ═══
            let realizedPips: number | null = null;
            if (exitPrice != null && order.entry_price != null) {
              const pipDiv = JPY_PAIRS.includes(order.currency_pair) ? 0.01 : 0.0001;
              realizedPips = order.direction === "long"
                ? Math.round(((exitPrice - order.entry_price) / pipDiv) * 10) / 10
                : Math.round(((order.entry_price - exitPrice) / pipDiv) * 10) / 10;
            }
            
            const { data: updateData, error: updateErr } = await supabase
              .from("oanda_orders")
              .update({
                status: "closed",
                exit_price: exitPrice,
                closed_at: tradeDetails.trade.closeTime || new Date().toISOString(),
                r_pips: realizedPips,
              })
              .eq("id", order.id)
              .select("id, status");
            
            if (updateErr) {
              console.error(`[TRADE-MONITOR] ❌ DB UPDATE ERROR for ${order.currency_pair} (${order.id}):`, updateErr.message, updateErr.details, updateErr.hint);
            } else if (!updateData || updateData.length === 0) {
              console.error(`[TRADE-MONITOR] ❌ DB UPDATE 0 ROWS for ${order.currency_pair} (${order.id}) — RLS or constraint blocking? user_id=${order.user_id}`);
            } else {
              console.log(`[TRADE-MONITOR] ✅ DB UPDATE OK for ${order.currency_pair} → status=${updateData[0].status}`);
            }

            console.log(`[TRADE-MONITOR] ${order.currency_pair}: Already closed on OANDA at ${exitPrice}`);
            results.push({
              pair: order.currency_pair,
              direction: order.direction,
              action: "already-closed",
              reason: "Closed externally on OANDA",
              exitPrice: exitPrice || undefined,
            });
            closedCount++;
            continue;
          }
        } catch (fetchErr) {
          const errMsg = (fetchErr as Error).message || "";
          // If OANDA returns 404 (NO_SUCH_TRADE), the trade was closed and purged from open trades.
          // BUG FIX: Previously marked closed with NO exit_price → corrupted P&L/r_pips for all orphans.
          // Fix: Query OANDA /trades endpoint with state=CLOSED to retrieve the actual fill price.
          if (errMsg.includes("NO_SUCH_TRADE") || errMsg.includes("404") || errMsg.includes("does not exist")) {
            console.warn(`[TRADE-MONITOR] ${order.currency_pair}: Trade ${order.oanda_trade_id} purged from open list — querying closed trades for exit price`);
            
            // Try to fetch actual close price from OANDA closed trades list
            let orphanExitPrice: number | null = null;
            let orphanCloseTime: string | null = null;
            let orphanRPips: number | null = null;
            try {
              const closedTradesData = await oandaRequest(
                `/v3/accounts/{accountId}/trades?state=CLOSED&instrument=${order.currency_pair}&count=10`,
                "GET",
                undefined,
                order.environment || "practice"
              ) as { trades: Array<{ id: string; averageClosePrice?: string; closeTime?: string; realizedPL?: string }> };
              
              const matchedTrade = closedTradesData.trades?.find(t => t.id === order.oanda_trade_id);
              if (matchedTrade?.averageClosePrice) {
                orphanExitPrice = parseFloat(matchedTrade.averageClosePrice);
                orphanCloseTime = matchedTrade.closeTime || null;
                if (orphanExitPrice != null && order.entry_price != null) {
                  const pipDiv = JPY_PAIRS.includes(order.currency_pair) ? 0.01 : 0.0001;
                  orphanRPips = order.direction === "long"
                    ? Math.round(((orphanExitPrice - order.entry_price) / pipDiv) * 10) / 10
                    : Math.round(((order.entry_price - orphanExitPrice) / pipDiv) * 10) / 10;
                }
                console.log(`[TRADE-MONITOR] ${order.currency_pair}: Orphan exit recovered — price=${orphanExitPrice} pips=${orphanRPips}`);
              }
            } catch (closedErr) {
              console.warn(`[TRADE-MONITOR] ${order.currency_pair}: Could not recover orphan exit price: ${(closedErr as Error).message}`);
            }
            
            const { error: orphanUpdateErr } = await supabase
              .from("oanda_orders")
              .update({
                status: "closed",
                exit_price: orphanExitPrice,
                r_pips: orphanRPips,
                closed_at: orphanCloseTime || new Date().toISOString(),
                error_message: orphanExitPrice
                  ? null
                  : `Orphan reconciliation: OANDA trade ${order.oanda_trade_id} — exit price unrecoverable`,
              })
              .eq("id", order.id);
            if (orphanUpdateErr) {
              console.error(`[TRADE-MONITOR] ❌ ORPHAN UPDATE FAILED for ${order.currency_pair} (${order.id}):`, orphanUpdateErr.message, orphanUpdateErr.details);
            }
            closedCount++;
            continue;
          }
          console.warn(`[TRADE-MONITOR] Could not fetch trade ${order.oanda_trade_id} details: ${errMsg}`);
        }
        
        heldCount++;
        continue;
      }

      // SHORTS close at ASK, LONGS close at BID — use the correct side for mark-to-market
      const livePrice = order.direction === "short"
        ? askPriceMap.get(order.currency_pair)
        : bidPriceMap.get(order.currency_pair);
      const currentPrice = livePrice || parseFloat(oandaTrade.price);
      if (!livePrice) {
        console.warn(`[TRADE-MONITOR] ${order.currency_pair}: No live ${order.direction === 'short' ? 'ASK' : 'BID'} price, using trade entry as fallback`);
      }
      const entryPrice = order.entry_price!;
      const tradeAgeMs = Date.now() - new Date(order.created_at).getTime();
      const tradeAgeMinutes = tradeAgeMs / 60000;

      // Compute dynamic SL from 15m Supertrend + ATR
      const ind = indicatorMap.get(order.currency_pair);
      const dynamicSl = computeDynamicSL(
        order.direction,
        entryPrice,
        order.currency_pair,
        ind?.supertrend ?? null,
        ind?.atr ?? null,
      );

      // ═══ Compute Trade Health Score ═══
      const govPayload = (order.governance_payload && typeof order.governance_payload === 'object')
        ? order.governance_payload as Record<string, unknown>
        : undefined;

      // ─── FIX: Compute bars from entry timeframe, not raw minutes ───
      const entryTf = (order as Record<string, unknown>).entry_tf as string | null;
      const tfMinutes = entryTf === '5m' ? 5 : entryTf === '15m' ? 15 : 1; // default 1m
      const barsSinceEntry = Math.max(1, Math.floor(tradeAgeMinutes / tfMinutes));

      // ─── FIX: MFE/MAE watermark tracking using stored prices ───
      // Uses persistent mfe_price/mae_price columns as true watermarks
      const pipMult = getPipMultiplier(order.currency_pair);
      const storedMfePrice = typeof (order as Record<string, unknown>).mfe_price === 'number' ? (order as Record<string, unknown>).mfe_price as number : entryPrice;
      const storedMaePrice = typeof (order as Record<string, unknown>).mae_price === 'number' ? (order as Record<string, unknown>).mae_price as number : entryPrice;

      // Get BOTH bid and ask for correct watermark tracking
      const liveBid = bidPriceMap.get(order.currency_pair) ?? currentPrice;
      const liveAsk = askPriceMap.get(order.currency_pair) ?? currentPrice;

      let updatedMfePrice: number;
      let updatedMaePrice: number;
      if (order.direction === "long") {
        // Long: favorable = highest bid, adverse = lowest bid
        updatedMfePrice = Math.max(storedMfePrice, liveBid);
        updatedMaePrice = Math.min(storedMaePrice, liveBid);
      } else {
        // Short: favorable = lowest ask, adverse = highest ask
        updatedMfePrice = Math.min(storedMfePrice, liveAsk);
        updatedMaePrice = Math.max(storedMaePrice, liveAsk);
      }

      // Use real r_pips if available, else fall back to dynamic SL distance
      const rPipsReal = typeof (order as Record<string, unknown>).r_pips === 'number' ? (order as Record<string, unknown>).r_pips as number : null;
      const rPipsEst = rPipsReal ?? Math.max(dynamicSl.slDistancePips, 0.1);

      // Compute MFE/MAE/UE in R-multiples using watermark prices
      const mfePips = order.direction === "long"
        ? Math.max(0, (updatedMfePrice - entryPrice) / pipMult)
        : Math.max(0, (entryPrice - updatedMfePrice) / pipMult);
      const currentMfeR = mfePips / rPipsEst;

      const mfePrice = updatedMfePrice; // pass watermark price to health engine

      const prevTimeToMfeBars = typeof order.time_to_mfe_bars === 'number' ? order.time_to_mfe_bars : null;

      const healthResult = computeTradeHealthScore(
        order.direction,
        entryPrice,
        currentPrice,
        dynamicSl.slPrice,
        mfePrice,
        order.currency_pair,
        barsSinceEntry,
        (govPayload?.volatilityScore as number) ?? 50,
        (govPayload?.persistenceNow as number) ?? 50,
        (govPayload?.persistenceAtEntry as number) ?? 50,
        (govPayload?.volAccNow as number) ?? 50,
        (govPayload?.volAccAtEntry as number) ?? 50,
        govPayload?.regimeConfirmed === true || (!govPayload?.regimeEarlyWarning && !govPayload?.regimeDiverging),
        govPayload?.regimeEarlyWarning === true,
        govPayload?.regimeDiverging === true,
        prevTimeToMfeBars,
      );

      // Apply health-based trailing tightening to exit evaluation
      const decision = evaluateExit(
        order.direction,
        entryPrice,
        currentPrice,
        order.currency_pair,
        tradeAgeMinutes,
        dynamicSl,
        govPayload,
        healthResult.trailingTightenFactor,
        rPipsReal,           // true risk at entry (R-multiple denominator)
        updatedMfePrice,     // MFE watermark price for trailing
        ind?.atr ?? null,    // 15m ATR for Phase 2 trailing
      );

      // ─── THS Expectancy Tracking ───
      // entry_ths: set once on first health evaluation (bars=1)
      // peak_ths: rolling max of THS across trade lifetime
      // mae_r: Maximum Adverse Excursion in R-multiples (from watermark prices)
      const prevEntryThs = typeof order.entry_ths === 'number' ? order.entry_ths : null;
      const prevPeakThs = typeof order.peak_ths === 'number' ? order.peak_ths : 0;

      const entryThsValue = prevEntryThs ?? healthResult.tradeHealthScore; // lock on first eval
      const peakThsValue = Math.max(prevPeakThs, healthResult.tradeHealthScore);

      // MAE from watermark prices (true worst-case drawdown)
      const maePips = order.direction === "long"
        ? Math.max(0, (entryPrice - updatedMaePrice) / pipMult)
        : Math.max(0, (updatedMaePrice - entryPrice) / pipMult);
      const maeRValue = Math.round((maePips / rPipsEst) * 100) / 100;

      // UE from correct bid/ask
      const ueRPips = order.direction === "long"
        ? (liveBid - entryPrice) / pipMult
        : (entryPrice - liveAsk) / pipMult;
      const ueRValue = Math.round((ueRPips / rPipsEst) * 100) / 100;

      // Persist health telemetry + watermark prices on every cycle
      await supabase
        .from("oanda_orders")
        .update({
          trade_health_score: healthResult.tradeHealthScore,
          health_band: healthResult.healthBand,
          mfe_r: Math.round(currentMfeR * 100) / 100,
          ue_r: ueRValue,
          mae_r: maeRValue,
          bars_since_entry: barsSinceEntry,
          progress_fail: healthResult.progressFail,
          health_governance_action: healthResult.governanceActionType,
          time_to_mfe_bars: healthResult.timeToMfeBars,
          entry_ths: entryThsValue,
          peak_ths: peakThsValue,
          mfe_price: updatedMfePrice,
          mae_price: updatedMaePrice,
        })
        .eq("id", order.id);

      // ═══ MAE-BASED KILL SWITCH (0.65R) ═══
      // FIX #1: Guard with MFE < 0.15R — only kill if trade has NOT shown meaningful
      // favorable movement. If MFE >= 0.15R, the trade found its edge and the adverse
      // move is a snapback/retrace, not invalidation. Prevents killing valid trend entries
      // that dip before the move accelerates.
      const MAE_KILL_THRESHOLD = 0.65;
      if (maeRValue >= MAE_KILL_THRESHOLD && decision.action === "hold" && currentMfeR < 0.15) {
        console.log(`[MAE-KILL] ${order.currency_pair} ${order.direction}: MAE=${maeRValue}R >= ${MAE_KILL_THRESHOLD}R AND MFE=${currentMfeR.toFixed(2)}R < 0.15R — KILLING trade (no edge shown, pure adverse)`);
        decision.action = "mae-kill" as typeof decision.action;
        decision.reason = `MAE kill switch: ${maeRValue}R adverse + MFE=${currentMfeR.toFixed(2)}R < 0.15R — edge never materialised`;
      } else if (maeRValue >= MAE_KILL_THRESHOLD && decision.action === "hold" && currentMfeR >= 0.15) {
        console.log(`[MAE-KILL] ${order.currency_pair} ${order.direction}: MAE=${maeRValue}R but MFE=${currentMfeR.toFixed(2)}R >= 0.15R — SNAPBACK GUARD active, not killing`);
      }

      // ═══ SOVEREIGN STOP-HUNT PROTECTION ═══
      // Detects if current SL is near a "Retail Stop Cluster" (round numbers)
      // and autonomously moves it into deep liquidity to avoid being hunted.
      if (decision.action === "hold" && order.oanda_trade_id) {
        const pipMultHunt = getPipMultiplier(order.currency_pair);
        const currentSLPrice = dynamicSl.slPrice;
        
        // Check if SL is within 3 pips of a round number (xx.xx000, xx.xx500)
        const roundUnit50 = 50 * pipMultHunt;
        const roundUnit100 = 100 * pipMultHunt;
        const distTo50 = Math.abs((currentSLPrice % roundUnit50) < roundUnit50 / 2 
          ? (currentSLPrice % roundUnit50) : (roundUnit50 - currentSLPrice % roundUnit50));
        const distTo100 = Math.abs((currentSLPrice % roundUnit100) < roundUnit100 / 2 
          ? (currentSLPrice % roundUnit100) : (roundUnit100 - currentSLPrice % roundUnit100));
        
        const nearestClusterDist = Math.min(distTo50, distTo100) / pipMultHunt;
        
        if (nearestClusterDist <= 3.0 && nearestClusterDist > 0.5) {
          // Move SL 5 pips away from the cluster into deep liquidity
          const adjustment = 5 * pipMultHunt;
          const adjustedSL = order.direction === "long"
            ? currentSLPrice - adjustment  // Push SL further below cluster
            : currentSLPrice + adjustment; // Push SL further above cluster
          
          // Only adjust if it doesn't widen the stop beyond MAE kill threshold
          const adjustedDistPips = order.direction === "long"
            ? (entryPrice - adjustedSL) / pipMultHunt
            : (adjustedSL - entryPrice) / pipMultHunt;
          const adjustedR = rPipsEst > 0 ? adjustedDistPips / rPipsEst : 99;
          
          if (adjustedR < MAE_KILL_THRESHOLD) {
            console.log(`[STOP-HUNT-SHIELD] ${order.currency_pair} ${order.direction}: SL@${currentSLPrice.toFixed(5)} is ${nearestClusterDist.toFixed(1)}p from retail cluster — moving to ${adjustedSL.toFixed(5)} (deep liquidity)`);
            const huntResult = await updateTrailingStop(order.oanda_trade_id, adjustedSL, order.environment || "live", order.currency_pair);
            if (huntResult.success) {
              console.log(`[STOP-HUNT-SHIELD] ✅ SL relocated for ${order.currency_pair} — protected from stop hunt`);
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // AUTONOMOUS EXIT AUTHORITY — AI Floor Manager Controls
      // Three exit triggers that fire WITHOUT human approval:
      // 1. THS-Based Exit Acceleration (behavioral probability collapse)
      // 2. MAE-to-MFE Ratio Decay (profit capture decay detection)
      // 3. Rolling WR Trailing Override (tighten exits when agent is cold)
      // ═══════════════════════════════════════════════════════════

      // ─── Hook 1: THS-Based Exit Acceleration ───
      const THS_EXIT_THRESHOLD = 40;
      if (decision.action === "hold" && ueRValue > 0 && healthResult.tradeHealthScore < THS_EXIT_THRESHOLD) {
        console.log(`[AUTO-EXIT] ${order.currency_pair} ${order.direction}: THS=${healthResult.tradeHealthScore} < ${THS_EXIT_THRESHOLD} while in profit (${ueRValue}R) — AUTONOMOUS EXIT (behavioral edge gone)`);
        decision.action = "ths-exit" as typeof decision.action;
        decision.reason = `AUTONOMOUS EXIT: profitable (${ueRValue}R) but THS=${healthResult.tradeHealthScore} collapsed below ${THS_EXIT_THRESHOLD} — behavioral edge gone`;
      }

      // ─── Hook 2: Profit Capture Decay — MFE Retracement Kill ───
      // FIX #2: Widened band to 0.10–0.40R. Previous 0.15–0.30R band was too narrow —
      // a single cycle blinked straight through it without triggering. Also add 2-cycle
      // confirmation: only fire if we've been in the decay zone for 2+ consecutive monitor
      // cycles (tracked via profit_decay_cycles counter in governance_payload).
      // This eliminates false exits from momentary retraces that resume the trend.
      const DECAY_MFE_THRESHOLD = 0.8;    // MFE must reach this to enable decay tracking
      const DECAY_UE_LOWER = 0.10;        // UE must be above this (still profitable)
      const DECAY_UE_UPPER = 0.40;        // UE must be below this (significant give-back)
      const decayGovPayload = (typeof order.governance_payload === 'object' && order.governance_payload)
        ? order.governance_payload as Record<string, unknown>
        : {};
      const prevDecayCycles = (decayGovPayload.profitDecayCycles as number) ?? 0;

      if (decision.action === "hold" && currentMfeR >= DECAY_MFE_THRESHOLD && ueRValue < DECAY_UE_UPPER && ueRValue > DECAY_UE_LOWER) {
        const newDecayCycles = prevDecayCycles + 1;
        if (newDecayCycles >= 2) {
          console.log(`[AUTO-EXIT] ${order.currency_pair} ${order.direction}: Profit decay confirmed (${newDecayCycles} cycles) — MFE=${currentMfeR.toFixed(2)}R retraced to UE=${ueRValue}R — AUTONOMOUS EXIT`);
          decision.action = "profit-decay-exit" as typeof decision.action;
          decision.reason = `AUTONOMOUS EXIT: MFE=${currentMfeR.toFixed(2)}R retraced to ${ueRValue}R for ${newDecayCycles} consecutive cycles — profit decay confirmed`;
        } else {
          console.log(`[AUTO-EXIT] ${order.currency_pair} ${order.direction}: Profit decay cycle ${newDecayCycles}/2 — watching (MFE=${currentMfeR.toFixed(2)}R UE=${ueRValue}R)`);
          // Persist decay cycle count in governance_payload
          await supabase.from("oanda_orders").update({
            governance_payload: { ...decayGovPayload, profitDecayCycles: newDecayCycles },
          }).eq("id", order.id);
        }
      } else if (prevDecayCycles > 0 && (currentMfeR < DECAY_MFE_THRESHOLD || ueRValue >= DECAY_UE_UPPER || ueRValue <= DECAY_UE_LOWER)) {
        // Reset cycle count if trade exits the decay zone (resumed trend or stopped out separately)
        await supabase.from("oanda_orders").update({
          governance_payload: { ...decayGovPayload, profitDecayCycles: 0 },
        }).eq("id", order.id);
      }

      // ─── Hook 3: Rolling WR Trailing Override ───
      const agentId = order.agent_id || "unknown";
      if (decision.action === "hold" && ueRValue > 0) {
        const agentColdMultiplier = healthResult.trailingTightenFactor < 0.7 ? 0.8 : 1.0;
        if (agentColdMultiplier < 1.0) {
          console.log(`[AUTO-EXIT] ${order.currency_pair}: Agent ${agentId} trailing override — THS factor ${healthResult.trailingTightenFactor} + cold multiplier ${agentColdMultiplier}`);
        }
      }

      // ═══ FRIDAY FLUSH — Close all positions at 20:00 UTC Friday ═══
      const nowUtc = new Date();
      const isFriday = nowUtc.getUTCDay() === 5;
      const hourUtc = nowUtc.getUTCHours();
      if (isFriday && hourUtc >= 20 && decision.action === "hold") {
        console.log(`[FRIDAY-FLUSH] ${order.currency_pair} ${order.direction}: Friday ${hourUtc}:00 UTC — closing all positions`);
        const currentPnlPips = decision.currentPnlPips;
        decision.action = "friday-flush" as typeof decision.action;
        decision.reason = `Friday flush: ${currentPnlPips.toFixed(1)}p — closing before weekend gap (Friday ${hourUtc}:00 UTC)`;
      }

      if (decision.action === "hold") {
        heldCount++;

        // ═══ FLOOR MANAGER WRITE: Push computed trailing SL to OANDA ═══
        // Instead of just tracking trailing stops internally, PATCH them onto the live OANDA trade.
        // This ensures the broker-side SL always reflects the latest governance decisions.
        const oandaTradeId = order.oanda_trade_id;
        const env = order.environment || "live";
        if (oandaTradeId && healthResult.healthBand !== "healthy") {
          // Compute the effective trailing SL the FloorManager wants to enforce
          const effectiveRPips = rPipsEst;
          const pipMultSl = getPipMultiplier(order.currency_pair);

          // Determine target SL based on MFE milestones + health tightening
          let targetSlPrice: number | null = null;
          let slReason = "";

          if (currentMfeR >= 2.0 && ind?.atr) {
            // Phase 2 trailing: MFE - 0.75 × ATR × healthFactor
            const trailDist = 0.75 * ind.atr * healthResult.trailingTightenFactor;
            targetSlPrice = order.direction === "long"
              ? updatedMfePrice - trailDist
              : updatedMfePrice + trailDist;
            slReason = `ATR-trail@MFE-0.75×ATR×${healthResult.trailingTightenFactor.toFixed(2)}`;
          } else if (currentMfeR >= 1.7) {
            // FIX #3 (SL push): Phase 1.5 ratchet — lock entry+1.2R (gap-fill between 1.5R and 2.0R)
            const lockR12 = 1.2 * effectiveRPips * pipMultSl;
            targetSlPrice = order.direction === "long"
              ? entryPrice + lockR12 * healthResult.trailingTightenFactor
              : entryPrice - lockR12 * healthResult.trailingTightenFactor;
            slReason = `phase1.5-ratchet@entry+1.2R×${healthResult.trailingTightenFactor.toFixed(2)}`;
          } else if (currentMfeR >= 1.5) {
            // Phase 1: lock entry+1R × healthFactor
            const oneR = effectiveRPips * pipMultSl;
            targetSlPrice = order.direction === "long"
              ? entryPrice + oneR * healthResult.trailingTightenFactor
              : entryPrice - oneR * healthResult.trailingTightenFactor;
            slReason = `R-trail@entry+1R×${healthResult.trailingTightenFactor.toFixed(2)}`;
          } else if (currentMfeR >= 1.2) {
            // Harvest: lock entry+0.5R
            const halfR = 0.5 * effectiveRPips * pipMultSl;
            targetSlPrice = order.direction === "long"
              ? entryPrice + halfR * healthResult.trailingTightenFactor
              : entryPrice - halfR * healthResult.trailingTightenFactor;
            slReason = `harvest-trail@entry+0.5R×${healthResult.trailingTightenFactor.toFixed(2)}`;
          } else if (currentMfeR >= 1.0) {
            // Breakeven stop
            targetSlPrice = order.direction === "long"
              ? entryPrice + 0.5 * pipMultSl
              : entryPrice - 0.5 * pipMultSl;
            slReason = "breakeven-lock";
          } else if (currentMfeR >= 0.8) {
            // Early profit lock: entry+0.2R
            const earlyR = 0.2 * effectiveRPips * pipMultSl;
            targetSlPrice = order.direction === "long"
              ? entryPrice + earlyR
              : entryPrice - earlyR;
            slReason = "early-profit-lock@0.2R";
          }

          // Only push if target SL is TIGHTER than current dynamic SL (never widen)
          if (targetSlPrice != null) {
            const isTighter = order.direction === "long"
              ? targetSlPrice > dynamicSl.slPrice
              : targetSlPrice < dynamicSl.slPrice;

            if (isTighter) {
              const modResult = await updateTrailingStop(oandaTradeId, targetSlPrice, env, order.currency_pair);
              if (modResult.success) {
                console.log(`[FLOOR-MANAGER] ${order.currency_pair} ${order.direction}: SL pushed to OANDA → ${targetSlPrice.toFixed(5)} (${slReason})`);
              }
            }
          }
        }

        console.log(`[TRADE-MONITOR] ${order.currency_pair} ${order.direction}: THS=${healthResult.tradeHealthScore} [${healthResult.healthBand}] | ${decision.reason}`);
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: "hold",
          reason: `THS=${healthResult.tradeHealthScore} [${healthResult.healthBand}] | ${decision.reason}`,
          pnlPips: decision.currentPnlPips,
        });
        continue;
      }

      // Close the trade
      console.log(`[TRADE-MONITOR] CLOSING ${order.currency_pair} ${order.direction}: ${decision.reason}`);

      try {
        const closeResult = await oandaRequest(
          `/v3/accounts/{accountId}/trades/${order.oanda_trade_id}/close`,
          "PUT",
          {},
          order.environment || "practice"
        ) as { orderFillTransaction?: { price?: string } };

        const exitPrice = closeResult.orderFillTransaction?.price
          ? parseFloat(closeResult.orderFillTransaction.price)
          : currentPrice;

        // Update the order with exit data + exit reason for auditability
        const existingPayload = order.governance_payload || {};
        const updatedPayload = {
          ...(typeof existingPayload === 'object' ? existingPayload : {}),
          exitReason: decision.action,
          exitDetail: decision.reason,
          exitPnlPips: parseFloat(decision.currentPnlPips.toFixed(2)),
          exitProgressToTp: parseFloat((decision.progressToTp * 100).toFixed(1)),
          exitTradeAgeMin: parseFloat(decision.tradeAgeMinutes.toFixed(1)),
        };

        // ═══ FIX: Compute realized pips from actual fill prices ═══
        const realizedPipDiv = JPY_PAIRS.includes(order.currency_pair) ? 0.01 : 0.0001;
        const realizedPips = order.direction === "long"
          ? Math.round(((exitPrice - entryPrice) / realizedPipDiv) * 10) / 10
          : Math.round(((entryPrice - exitPrice) / realizedPipDiv) * 10) / 10;

        const { error: exitUpdateErr } = await supabase
          .from("oanda_orders")
          .update({
            status: "closed",
            exit_price: exitPrice,
            closed_at: new Date().toISOString(),
            r_pips: realizedPips,
            governance_payload: updatedPayload,
            trade_health_score: healthResult.tradeHealthScore,
            health_band: healthResult.healthBand,
            mfe_r: Math.round(currentMfeR * 100) / 100,
            ue_r: ueRValue,
            mae_r: maeRValue,
            bars_since_entry: barsSinceEntry,
            progress_fail: healthResult.progressFail,
            health_governance_action: healthResult.governanceActionType,
            time_to_mfe_bars: healthResult.timeToMfeBars,
            entry_ths: entryThsValue,
            peak_ths: peakThsValue,
            exit_ths: healthResult.tradeHealthScore,
            mfe_price: updatedMfePrice,
            mae_price: updatedMaePrice,
          })
          .eq("id", order.id);
        if (exitUpdateErr) {
          console.error(`[TRADE-MONITOR] ❌ EXIT UPDATE FAILED for ${order.currency_pair} (${order.id}):`, exitUpdateErr.message, exitUpdateErr.details);
        }

        closedCount++;
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: decision.action,
          reason: decision.reason,
          exitPrice,
          pnlPips: decision.currentPnlPips,
        });

        console.log(`[TRADE-MONITOR] ${order.currency_pair}: Closed at ${exitPrice} | ${decision.action} | ${decision.currentPnlPips.toFixed(1)}p`);
      } catch (closeErr) {
        console.error(`[TRADE-MONITOR] Failed to close ${order.currency_pair}:`, closeErr);
        results.push({
          pair: order.currency_pair,
          direction: order.direction,
          action: "close-failed",
          reason: (closeErr as Error).message,
        });
      }

      // Small delay between closes to avoid rate limiting
      if (closedCount > 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PENDING LIMIT ORDER RECONCILIATION — Vacuum + FM limit orders
    // Checks OANDA for fill/expire status on orders stuck in "pending"
    // ═══════════════════════════════════════════════════════════
    let pendingReconciled = 0;
    try {
      const { data: pendingOrders } = await supabase
        .from("oanda_orders")
        .select("id, oanda_order_id, currency_pair, direction, environment, agent_id, units")
        .eq("status", "pending")
        .not("oanda_order_id", "is", null)
        .gte("created_at", STRATEGY_CUTOFF)
        .limit(30);

      if (pendingOrders && pendingOrders.length > 0) {
        console.log(`[TRADE-MONITOR] Reconciling ${pendingOrders.length} pending LIMIT orders`);

        for (const po of pendingOrders) {
          try {
            const env = po.environment || "live";
            const orderDetail = await oandaRequest(
              `/v3/accounts/{accountId}/orders/${po.oanda_order_id}`,
              "GET", undefined, env
            );

            const order = orderDetail.order;
            if (!order) {
              // BUG FIX: Was calling the exact same OANDA endpoint twice — the inner try/catch
              // called `/orders/${po.oanda_order_id}` again which returned the same null result.
              // Fix: directly mark as cancelled on first null — no second API call needed.
              const { error: upErr1 } = await supabase.from("oanda_orders").update({
                status: "cancelled",
                error_message: "OANDA order not found — likely expired or cancelled",
                closed_at: new Date().toISOString(),
              }).eq("id", po.id);
              if (upErr1) console.error(`[PENDING-RECON] DB update failed for ${po.id}:`, upErr1.message);
              pendingReconciled++;
              console.log(`[PENDING-RECON] ${po.currency_pair}: Order ${po.oanda_order_id} not found — marked cancelled`);
              continue;
            }

            const state = order.state; // PENDING, FILLED, CANCELLED, TRIGGERED
            if (state === "FILLED" || state === "TRIGGERED") {
              // Order was filled — find the associated trade
              const tradeId = order.filledTradeID || order.tradeOpenedID || null;
              const fillPrice = order.price ? parseFloat(order.price) : null;
              const fillingTxn = order.fillingTransactionID;

              // Try to get fill details from transaction
              let actualFillPrice = fillPrice;
              let oandaTradeId = tradeId;
              if (fillingTxn) {
                try {
                  const txnDetail = await oandaRequest(
                    `/v3/accounts/{accountId}/transactions/${fillingTxn}`,
                    "GET", undefined, env
                  );
                  const txn = txnDetail.transaction;
                  if (txn) {
                    actualFillPrice = txn.price ? parseFloat(txn.price) : fillPrice;
                    oandaTradeId = txn.tradeOpened?.tradeID || txn.tradeID || tradeId;
                  }
                } catch { /* use order price */ }
              }

              const pipMult = po.currency_pair.includes("JPY") ? 0.01 : 0.0001;
              const spreadEst = order.fullPrice
                ? Math.abs(parseFloat(order.fullPrice.asks?.[0]?.price || "0") - parseFloat(order.fullPrice.bids?.[0]?.price || "0")) / pipMult
                : null;

              await supabase.from("oanda_orders").update({
                status: "filled",
                entry_price: actualFillPrice,
                oanda_trade_id: oandaTradeId,
                spread_at_entry: spreadEst,
                requested_price: fillPrice,
              }).eq("id", po.id);

              pendingReconciled++;
              console.log(`[PENDING-RECON] ${po.currency_pair}: LIMIT order FILLED @ ${actualFillPrice} — Trade ID: ${oandaTradeId}`);

            } else if (state === "CANCELLED") {
              const cancelReason = order.cancelledTime ? `Cancelled at ${order.cancelledTime}` : "Cancelled by broker";
              const { error: upErr3 } = await supabase.from("oanda_orders").update({
                status: "cancelled",
                error_message: `LIMIT cancelled: ${order.cancellingTransactionID || cancelReason}`,
                closed_at: order.cancelledTime || new Date().toISOString(),
              }).eq("id", po.id);
              if (upErr3) console.error(`[PENDING-RECON] DB update failed for ${po.id}:`, upErr3.message);
              pendingReconciled++;
              console.log(`[PENDING-RECON] ${po.currency_pair}: LIMIT order CANCELLED`);

            } else if (state === "PENDING") {
              // Check if GTD expiry has passed
              const gtdTime = order.gtdTime ? new Date(order.gtdTime).getTime() : 0;
              if (gtdTime > 0 && Date.now() > gtdTime) {
                // Expired — cancel on OANDA and mark locally
                try {
                  await oandaRequest(
                    `/v3/accounts/{accountId}/orders/${po.oanda_order_id}/cancel`,
                    "PUT", undefined, env
                  );
                } catch { /* may already be cancelled */ }
                const { error: upErr4 } = await supabase.from("oanda_orders").update({
                  status: "cancelled",
                  error_message: "LIMIT order GTD expired",
                  closed_at: new Date().toISOString(),
                }).eq("id", po.id);
                if (upErr4) console.error(`[PENDING-RECON] DB update failed for ${po.id}:`, upErr4.message);
                pendingReconciled++;
                console.log(`[PENDING-RECON] ${po.currency_pair}: LIMIT order GTD expired — cancelled`);
              }
              // else: still pending, leave it
            }
          } catch (poErr) {
            console.warn(`[PENDING-RECON] Error reconciling ${po.currency_pair} order ${po.oanda_order_id}:`, (poErr as Error).message);
            // If we get a 404, the order is gone
            if ((poErr as Error).message?.includes("404") || (poErr as Error).message?.includes("not found")) {
              const { error: upErr5 } = await supabase.from("oanda_orders").update({
                status: "cancelled",
                error_message: "OANDA order not found (404)",
                closed_at: new Date().toISOString(),
              }).eq("id", po.id);
              if (upErr5) console.error(`[PENDING-RECON] DB update failed for ${po.id}:`, upErr5.message);
              pendingReconciled++;
            }
          }
        }
        console.log(`[TRADE-MONITOR] Pending reconciliation: ${pendingReconciled}/${pendingOrders.length} resolved`);
      }
    } catch (pendErr) {
      console.warn(`[TRADE-MONITOR] Pending reconciliation error:`, (pendErr as Error).message);
    }

    // ═══════════════════════════════════════════════════════════
    // COUNTERFACTUAL MONITOR — Track outcomes for blocked trades
    // ═══════════════════════════════════════════════════════════
    let counterfactualUpdated = 0;
    try {
      // Find rejected orders with counterfactual entry price but missing exit prices
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: cfOrders } = await supabase
        .from("oanda_orders")
        .select("id, currency_pair, direction, counterfactual_entry_price, created_at")
        .in("status", ["rejected", "blocked", "skipped"])
        .not("counterfactual_entry_price", "is", null)
        .is("counterfactual_exit_15m", null)
        .gte("created_at", thirtyMinAgo)
        .lte("created_at", fifteenMinAgo)
        .limit(20);

      if (cfOrders && cfOrders.length > 0) {
        // Group by pair to minimize OANDA API calls
        const pairSet = new Set(cfOrders.map(o => o.currency_pair));
        const pairPrices = new Map<string, number>();

        for (const p of pairSet) {
          try {
            const priceRes = await oandaRequest(
              `/v3/accounts/{accountId}/pricing?instruments=${p}`, "GET", undefined, "live"
            ) as { prices?: Array<{ asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }> };
            const mid = priceRes.prices?.[0];
            if (mid) {
              const ask = parseFloat(mid.asks?.[0]?.price || "0");
              const bid = parseFloat(mid.bids?.[0]?.price || "0");
              pairPrices.set(p, (ask + bid) / 2);
            }
          } catch { /* skip pair */ }
        }

        for (const cfOrder of cfOrders) {
          const currentPrice = pairPrices.get(cfOrder.currency_pair);
          if (!currentPrice || !cfOrder.counterfactual_entry_price) continue;

          const entryPrice = Number(cfOrder.counterfactual_entry_price);
          const pipMult = cfOrder.currency_pair.includes("JPY") ? 0.01 : 0.0001;
          const pnlPips = cfOrder.direction === "long"
            ? (currentPrice - entryPrice) / pipMult
            : (entryPrice - currentPrice) / pipMult;

          const ageMs = Date.now() - new Date(cfOrder.created_at).getTime();
          const ageMin = ageMs / 60000;

          // Determine which time bucket to fill
          const updates: Record<string, unknown> = {};
          if (ageMin >= 5 && ageMin < 10) {
            updates.counterfactual_exit_5m = currentPrice;
          } else if (ageMin >= 10 && ageMin < 15) {
            updates.counterfactual_exit_5m = updates.counterfactual_exit_5m || currentPrice;
            updates.counterfactual_exit_10m = currentPrice;
          } else if (ageMin >= 15) {
            updates.counterfactual_exit_15m = currentPrice;
            updates.counterfactual_pips = pnlPips;
            updates.counterfactual_result = pnlPips > 0 ? "win" : "loss";
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from("oanda_orders")
              .update(updates)
              .eq("id", cfOrder.id);
            counterfactualUpdated++;
          }
        }
        console.log(`[TRADE-MONITOR] Counterfactual: updated ${counterfactualUpdated} blocked trade outcomes`);
      }
    } catch (cfErr) {
      console.warn(`[TRADE-MONITOR] Counterfactual monitor error:`, (cfErr as Error).message);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[TRADE-MONITOR] Complete: ${openOrders.length} monitored | ${closedCount} closed | ${heldCount} held | ${pendingReconciled} pending reconciled | ${counterfactualUpdated} counterfactual | ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        monitored: openOrders.length,
        closed: closedCount,
        held: heldCount,
        pendingReconciled,
        counterfactualUpdated,
        results,
        elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[TRADE-MONITOR] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
