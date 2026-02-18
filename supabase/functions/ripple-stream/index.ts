// ═══════════════════════════════════════════════════════════════
// DAVID & ATLAS — Zero-Stop Tunnel Strategy v1.0
// Sole active strategy. All other strategies deactivated.
//
// THE TUNNEL PROTOCOL:
//   Entry  : 4/4 Gate Active State — Hurst, Efficiency, VPIN, Z-OFI all green.
//            Direction locked by leading Z-OFI (positive = LONG, negative = SHORT).
//   Hold   : No stop loss. No take profit. Draft the Whale.
//            Physical probability of continuation is at statistical maximum while
//            4/4 gates remain active.
//   Exit   : Mandatory MarketClose() the INSTANT any gate drops → 3/4.
//            Institutional consensus has evaporated. Tunnel has collapsed.
//            Exit is mandatory whether trade is in profit or loss.
//
// SYNTHETIC ORDER BOOK (O(1) recursive physics engine — unchanged):
//   - Adaptive Z-OFI (Welford's): Z-score of OFI, fires at |Z| > 2.0
//   - Adaptive KM Windowing ("Gear Shift"): α adapts to D2 noise level
//   - Fast Hurst Exponent (Hall-Wood): O(1) regime classification
//   - Recursive VPIN (EWMA): O(1) toxicity — institutional participation check
//   - Efficiency Ratio E = |OFI|/(|D1|+ε): classifies market state
//   - Price-Level Persistence: tick-density S/R map
//
// DEACTIVATED: Z-Score Strike, Velocity Gating, Snap-Back Sniper, Ghost Vacuum
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";
const OANDA_STREAM = "https://stream-fxtrade.oanda.com/v3";
const MAX_STREAM_SECONDS = 110;

// ─── Spread Gate: Block if spread > rolling average OR > 4 pip hard max ───
const SPREAD_HARD_MAX_PIPS = 4.0;
const SPREAD_AVG_WINDOW = 50; // ticks to build rolling average
const spreadHistory = new Map<string, number[]>();

function getAvgSpread(pair: string): number {
  const hist = spreadHistory.get(pair);
  if (!hist || hist.length < 10) return SPREAD_HARD_MAX_PIPS; // not enough data — use hard max
  return hist.reduce((a, b) => a + b, 0) / hist.length;
}

function recordSpread(pair: string, spreadPips: number) {
  if (!spreadHistory.has(pair)) spreadHistory.set(pair, []);
  const hist = spreadHistory.get(pair)!;
  hist.push(spreadPips);
  if (hist.length > SPREAD_AVG_WINDOW) hist.shift();
}

function isSpreadTooWide(pair: string, spreadPips: number): { blocked: boolean; avg: number; reason: string } {
  const avg = getAvgSpread(pair);
  if (spreadPips > SPREAD_HARD_MAX_PIPS) return { blocked: true, avg, reason: `hard max (${spreadPips.toFixed(1)}p > ${SPREAD_HARD_MAX_PIPS}p)` };
  if (spreadPips > avg * 1.5) return { blocked: true, avg, reason: `above avg (${spreadPips.toFixed(1)}p > 1.5x avg ${avg.toFixed(1)}p)` };
  return { blocked: false, avg, reason: "ok" };
}

// ─── Tick-Density Tracker (ticksPerSecond per pair) ───
// High tick density = institutional flow (high conviction)
// Low tick density = illiquid noise (false signals)
const TICK_DENSITY_WINDOW_MS = 5000; // 5-second rolling window
const TICK_DENSITY_MIN_TPS = 0.8; // minimum ticks/sec — avg is ~1.18/pair, 2.0 blocked 61% of scans
const tickTimestamps = new Map<string, number[]>();

// ─── #1: Sub-Second Tick-Buffer (500 ticks with timestamps) ───
// Stores raw tick micro-vibrations for HFT front-running detection
const TICK_BUFFER_SIZE = 500;
interface TickBufferEntry {
  ts: number;
  pair: string;
  bid: number;
  ask: number;
  mid: number;
  spreadPips: number;
}
const tickBuffer: TickBufferEntry[] = [];

function addToTickBuffer(entry: TickBufferEntry) {
  tickBuffer.push(entry);
  if (tickBuffer.length > TICK_BUFFER_SIZE) tickBuffer.shift();
}

function getTickBufferSnapshot(pair?: string, lastMs = 500): TickBufferEntry[] {
  const cutoff = Date.now() - lastMs;
  return tickBuffer.filter(t => t.ts >= cutoff && (!pair || t.pair === pair));
}

// ─── #2: ZERO-LAG SYNTHETIC ORDER BOOK (O(1) Recursive) ───
// ALL computations are O(1) exponentially-weighted recursive updates.
// No rolling windows. No array scans. Same cost at tick 10 or tick 10,000,000.
//
// RECURSIVE KM (Kramers-Moyal):
//   D1(t) = α·(Δx/Δt) + (1-α)·D1(t-1)        ← Drift (velocity/directional force)
//   D2(t) = α·(Δx - D1·Δt)²/Δt + (1-α)·D2(t-1) ← Diffusion (volatility/noise)
//
// RECURSIVE OFI (Velocity+Displacement weighted):
//   OFI(t) = γ·OFI(t-1) + sgn(Δx)·|Δx|·(1/Δt)  ← Force (order flow pressure)
//
// EFFICIENCY RATIO (The Alpha):
//   E = |OFI| / (|D1| + ε)
//   E ≈ 1 → Liquid (orders moving price as expected)
//   E ≪ 1 → Absorbing (Hidden Limit Seller/Buyer — fade the move)
//   E ≫ 1 → Slipping (Liquidity Hole — gap risk)
//
// Price-level persistence still uses a map (inherently O(1) per tick).

const OFI_IMBALANCE_THRESHOLD = 0.35;
const VPIN_TOXIC_THRESHOLD = 0.7;
const PRICE_LEVEL_MEMORY = 500;

// Recursive decay factors (evolvable by sovereign loop per session)
const KM_ALPHA_DEFAULT = 0.05;     // KM smoothing — higher = faster adaptation
const KM_ALPHA_MIN = 0.01;        // Minimum alpha (long memory, high noise)
const KM_ALPHA_MAX = 0.15;        // Maximum alpha (short memory, low noise)
const OFI_GAMMA_DEFAULT = 0.95;    // OFI memory — higher = longer memory
const EFFICIENCY_EPSILON = 1e-10;  // prevent division by zero

// Adaptive Z-OFI threshold (replaces static 0.4)
const Z_OFI_FIRE_THRESHOLD = 2.0; // Welford Z-score: "only fire if |Z| > 2.0"

// Hurst Exponent thresholds
const HURST_PERSISTENCE_THRESHOLD = 0.55; // H > 0.55 = trending (ripple travels)
const HURST_MEANREV_THRESHOLD = 0.45;     // H < 0.45 = mean-reverting (snap back)
const HURST_SCALE = 20;                   // Window for Hall-Wood estimator (was 40 — need 2+ updates per pair per 110s session)

// Efficiency ratio thresholds for market state classification
const EFFICIENCY_ABSORBING_THRESHOLD = 0.3; // E < 0.3 = hidden limit player
const EFFICIENCY_SLIPPING_THRESHOLD = 3.0;  // E > 3.0 = liquidity hole

interface PriceLevelInfo {
  hits: number;
  buys: number;
  sells: number;
  lastTs: number;
  bounces: number;
  lastDirection: 1 | -1;
  broken: boolean;
  consecutiveSameDir: number; // track consecutive same-direction hits for breakout
}

type MarketState = "LIQUID" | "ABSORBING" | "SLIPPING" | "NEUTRAL";

interface KramersMoyalState {
  D1: number;               // Recursive drift (velocity)
  D2: number;               // Recursive diffusion (noise)
  driftNormalized: number;   // D1 / sqrt(D2) — signal-to-noise
  sampleSize: number;
}

interface HiddenSellerSignal {
  detected: boolean;
  type: "HIDDEN_LIMIT_SELLER" | "HIDDEN_LIMIT_BUYER" | "NONE";
  force: number;
  velocity: number;
  divergence: number;
  efficiency: number;        // NEW: the E ratio
  marketState: MarketState;  // NEW: classified state
  recommendation: "FADE" | "WAIT" | "NONE";
}

interface OfiTracker {
  // ─── O(1) Recursive State ───
  prevMid: number;
  prevTs: number;
  D1: number;                // Kramers-Moyal recursive drift
  D2: number;                // Kramers-Moyal recursive diffusion
  ofiRecursive: number;      // Recursive velocity+displacement weighted OFI
  tickCount: number;         // total ticks processed (for warm-up)

  // ─── Decay factors (evolvable per session) ───
  alpha: number;             // KM decay rate (NOW ADAPTIVE via D2 gear shift)
  gamma: number;             // OFI memory factor

  // ─── Adaptive Z-OFI (Welford's Online Algorithm) ───
  ofiMean: number;           // Running mean of OFI
  ofiM2: number;             // Running sum of squared deviations
  ofiWelfordN: number;       // Count for Welford's
  zOfi: number;              // Current Z-score of OFI (the adaptive gate)

  // ─── Fast Hurst Exponent (Hall-Wood O(1)) ───
  sumD1Abs: number;          // Σ|Δx| at scale 1 (single tick)
  sumD2Abs: number;          // Σ|Δx₂| at scale 2 (two-tick returns)
  prevDx: number;            // Previous Δx for scale-2 computation
  hurstN: number;            // Tick counter for Hurst (mod HURST_SCALE)
  hurst: number;             // Current H estimate

  // ─── Recursive VPIN (O(1) EWMA — no bucket scans) ───
  ewmaBuyVol: number;        // EWMA of buy-classified volume
  ewmaSellVol: number;       // EWMA of sell-classified volume
  vpinRecursive: number;     // = |ewmaBuy - ewmaSell| / (ewmaBuy + ewmaSell)

  // ─── Lee-Ready state ───
  lastClassification: 1 | -1;

  // ─── Price-level persistence (O(1) map lookup per tick) ───
  priceLevels: Map<number, PriceLevelInfo>;

  // ─── Running buy/sell counts for simple ratio (O(1) with running totals) ───
  runningBuys: number;
  runningSells: number;
  // Exponentially weighted buy/sell for pressure %
  ewmaBuyPct: number;
  ewmaSellPct: number;
}

const ofiTrackers = new Map<string, OfiTracker>();

function getOrCreateOfi(pair: string): OfiTracker {
  if (!ofiTrackers.has(pair)) {
    ofiTrackers.set(pair, {
      prevMid: 0,
      prevTs: 0,
      D1: 0,
      D2: 0,
      ofiRecursive: 0,
      tickCount: 0,
      alpha: KM_ALPHA_DEFAULT,
      gamma: OFI_GAMMA_DEFAULT,
      // Welford's adaptive Z-OFI
      ofiMean: 0,
      ofiM2: 0,
      ofiWelfordN: 0,
      zOfi: 0,
      // Fast Hurst (Hall-Wood)
      sumD1Abs: 0,
      sumD2Abs: 0,
      prevDx: 0,
      hurstN: 0,
      hurst: 0.55, // warm start: reduces cold-start bias (0.5 → 0.60 took 60+ ticks)
      // BUG FIX: VPIN cold-start — ewmaBuyVol/ewmaSellVol initialized at 0 meant VPIN=0 for
      // first ~20 ticks, killing every scan immediately after warmup passes. Warm-start at
      // balanced 0.5/0.5 proxy volume so VPIN reflects actual flow from the very first ticks.
      ewmaBuyVol: 0.5,
      ewmaSellVol: 0.5,
      vpinRecursive: 0, // will converge from 0 rapidly once real ticks flow in
      lastClassification: 1,
      priceLevels: new Map(),
      runningBuys: 0,
      runningSells: 0,
      ewmaBuyPct: 0.5,
      ewmaSellPct: 0.5,
    });
  }
  return ofiTrackers.get(pair)!;
}

// Lee-Ready tick-rule classification (unchanged — proven)
function classifyTick(
  mid: number, bid: number, ask: number,
  prevMid: number, lastClass: 1 | -1
): 1 | -1 {
  if (mid > prevMid) return 1;
  if (mid < prevMid) return -1;
  const midpoint = (bid + ask) / 2;
  if (mid > midpoint) return 1;
  if (mid < midpoint) return -1;
  return lastClass;
}

// Classify market state from Efficiency Ratio
function classifyMarketState(efficiency: number): MarketState {
  if (efficiency < EFFICIENCY_ABSORBING_THRESHOLD) return "ABSORBING";
  if (efficiency > EFFICIENCY_SLIPPING_THRESHOLD) return "SLIPPING";
  if (efficiency >= 0.7 && efficiency <= 1.5) return "LIQUID";
  return "NEUTRAL";
}

// Detect Hidden Limit Player from Efficiency Ratio
function detectHiddenLimitPlayer(
  ofiForce: number, kmDrift: number, efficiency: number, marketState: MarketState
): HiddenSellerSignal {
  // ABSORBING = high force, low velocity → hidden limit player
  // Threshold calibrated to ofiRecursive typical range (0.1–3.0). 0.01 fired on every single tick.
  // Use 0.3 as the minimum meaningful force signal (roughly 1/3 of a normal imbalance reading).
  if (marketState === "ABSORBING" && Math.abs(ofiForce) > 0.3) {
    if (ofiForce > 0) {
      return {
        detected: true, type: "HIDDEN_LIMIT_SELLER",
        force: ofiForce, velocity: kmDrift,
        divergence: Math.abs(ofiForce) - Math.abs(kmDrift),
        efficiency, marketState,
        recommendation: "FADE",
      };
    } else {
      return {
        detected: true, type: "HIDDEN_LIMIT_BUYER",
        force: ofiForce, velocity: kmDrift,
        divergence: Math.abs(ofiForce) - Math.abs(kmDrift),
        efficiency, marketState,
        recommendation: "FADE",
      };
    }
  }

  // SLIPPING = low force, high velocity → liquidity hole / gap risk.
  // This is NOT a hidden limit player (no iceberg) — it's thin liquidity.
  // Only flag if drift is meaningful (|D1| signal above noise floor) to avoid false alerts
  // on near-zero drift pairs where E is technically high but market is just quiet.
  if (marketState === "SLIPPING" && Math.abs(kmDrift) > 1e-6) {
    return {
      detected: true, type: "LIQUIDITY_HOLE",
      force: ofiForce, velocity: kmDrift,
      divergence: Math.abs(kmDrift) - Math.abs(ofiForce),
      efficiency, marketState,
      recommendation: "WAIT",
    };
  }

  return {
    detected: false, type: "NONE",
    force: ofiForce, velocity: kmDrift, divergence: 0,
    efficiency, marketState,
    recommendation: "NONE",
  };
}

function processOfiTick(
  pair: string, mid: number, bid: number, ask: number,
  spreadPips: number, ts: number
): {
  ofiRatio: number;
  ofiRaw: number;
  ofiWeighted: number;
  vpin: number;
  buyPressure: number;
  sellPressure: number;
  ticksInWindow: number;
  bias: "BUY" | "SELL" | "NEUTRAL";
  syntheticDepth: { price: number; buys: number; sells: number; net: number; hits: number; bounces: number; broken: boolean }[];
  km: KramersMoyalState & { alphaAdaptive: number };
  hiddenPlayer: HiddenSellerSignal;
  resistanceLevels: { price: number; strength: number; type: "SUPPORT" | "RESISTANCE" }[];
  efficiency: number;
  marketState: MarketState;
  // ─── NEW: Senior Ops Recursive Metrics ───
  zOfi: number;              // Welford Z-score of OFI (adaptive intensity)
  hurst: number;             // Fast Hurst exponent (regime: >0.5 trend, <0.5 mean-rev)
  hurstRegime: "PERSISTENT" | "MEAN_REVERTING" | "RANDOM_WALK";
} {
  const tracker = getOrCreateOfi(pair);
  const isJpy = pair.includes("JPY");
  const pipMult = isJpy ? 100 : 10000;

  // Classify this tick (Lee-Ready)
  const side = tracker.prevMid > 0
    ? classifyTick(mid, bid, ask, tracker.prevMid, tracker.lastClassification)
    : 1;
  tracker.lastClassification = side;

  // ─── O(1) CORE: Compute Δx and Δt ───
  const dx = tracker.prevMid > 0 ? mid - tracker.prevMid : 0;
  const dt = tracker.prevTs > 0 ? Math.max(ts - tracker.prevTs, 1) : 1000; // ms
  const dtSec = dt / 1000; // seconds for KM normalization

  // ─── UPGRADE 2: ADAPTIVE KM WINDOWING ("Gear Shift") ───
  // α adapts based on D2 (noise level):
  //   High D2 → low α (long memory, filter chaos)
  //   Low D2 → high α (short memory, hyper-responsive)
  // αAdaptive = αMin + (αMax - αMin) · exp(-κ · D2)
  const kappa = 1e6; // sensitivity to diffusion (tuned to forex pip-scale D2)
  const adaptiveAlpha = KM_ALPHA_MIN + (KM_ALPHA_MAX - KM_ALPHA_MIN) * Math.exp(-kappa * Math.abs(tracker.D2));
  tracker.alpha = adaptiveAlpha;

  // ─── RECURSIVE KRAMERS-MOYAL (O(1)) with ADAPTIVE α ───
  const alpha = tracker.alpha;
  if (tracker.tickCount > 0 && dtSec > 0) {
    const instantDrift = dx / dtSec;
    tracker.D1 = alpha * instantDrift + (1 - alpha) * tracker.D1;

    const residual = dx - tracker.D1 * dtSec;
    const instantDiffusion = (residual * residual) / dtSec;
    tracker.D2 = alpha * instantDiffusion + (1 - alpha) * tracker.D2;
  }

  // ─── RECURSIVE OFI (O(1)) ───
  const gamma = tracker.gamma;
  const dxPips = Math.abs(dx) * pipMult;
  const tickVelocity = 1000 / dt;
  const ofiContribution = side * dxPips * tickVelocity;
  tracker.ofiRecursive = gamma * tracker.ofiRecursive + ofiContribution;

  // ─── UPGRADE 1: ADAPTIVE Z-OFI (Welford's Online Algorithm) ───
  // Instead of static 0.4 threshold, compute how "abnormal" current OFI is.
  // Running mean and M2 update in O(1):
  //   n++; delta = x - mean; mean += delta/n; delta2 = x - mean; M2 += delta*delta2
  //   variance = M2/n; Z = (x - mean) / sqrt(variance)
  tracker.ofiWelfordN++;
  const welfordDelta = tracker.ofiRecursive - tracker.ofiMean;
  tracker.ofiMean += welfordDelta / tracker.ofiWelfordN;
  const welfordDelta2 = tracker.ofiRecursive - tracker.ofiMean;
  tracker.ofiM2 += welfordDelta * welfordDelta2;
  
  const ofiVariance = tracker.ofiWelfordN > 1 ? tracker.ofiM2 / tracker.ofiWelfordN : 1;
  const ofiStd = Math.sqrt(Math.max(ofiVariance, 1e-20));
  tracker.zOfi = (tracker.ofiRecursive - tracker.ofiMean) / ofiStd;

  // ─── UPGRADE 3: FAST HURST EXPONENT (Hall-Wood O(1)) ───
  // Track S1 = Σ|Δx| (scale 1) and S2 = Σ|Δx + prevΔx| (scale 2)
  // H = log2(S2/S1) — computed every HURST_SCALE ticks, then reset
  const absDx = Math.abs(dx);
  tracker.sumD1Abs += absDx;
  const dx2 = dx + tracker.prevDx; // two-tick return
  tracker.sumD2Abs += Math.abs(dx2);
  tracker.prevDx = dx;
  tracker.hurstN++;

  if (tracker.hurstN >= HURST_SCALE && tracker.sumD1Abs > 1e-15) {
    // Hall-Wood estimator: H = log2(S2 / S1)
    // For pure random walk: S2/S1 = sqrt(2), so log2(sqrt(2)) = 0.5 ✓
    // For trending: S2 > sqrt(2)*S1, so H > 0.5
    // For mean-reverting: S2 < sqrt(2)*S1, so H < 0.5
    const ratio = tracker.sumD2Abs / tracker.sumD1Abs;
    const rawH = Math.log2(Math.max(ratio, 1e-10));
    // EWMA smoothing to avoid single-window noise spikes
    tracker.hurst = 0.5 * Math.max(0, Math.min(1, rawH)) + 0.5 * tracker.hurst; // faster convergence (was 0.3/0.7 — took 50s to reach 0.60)
    // Reset accumulators for next window
    tracker.sumD1Abs = 0;
    tracker.sumD2Abs = 0;
    tracker.hurstN = 0;
  }

  const hurstRegime: "PERSISTENT" | "MEAN_REVERTING" | "RANDOM_WALK" =
    tracker.hurst > HURST_PERSISTENCE_THRESHOLD ? "PERSISTENT" :
    tracker.hurst < HURST_MEANREV_THRESHOLD ? "MEAN_REVERTING" : "RANDOM_WALK";

  // ─── EFFICIENCY RATIO (The Alpha) — dimensionless OFI / |D1| ───
  // UNIT FIX: ofiRecursive uses units of (pips · ticks/sec) from ofiContribution = side * dxPips * tickVelocity.
  // D1 is in price/sec (e.g. EUR/USD ~1e-6 price/sec). To make E dimensionless:
  //   ofiRecursive (pip·tps) / pipMult → price·tps (same price units as D1·time)
  //   E = (absOfi / pipMult) / (absD1 + ε)
  // This gives E ≈ 1 for "normal" market (OFI ≈ D1 in price-velocity space),
  // E << 1 for ABSORBING (OFI crushed by hidden limit), E >> 1 for SLIPPING.
  // Previously: ofiNormalized / d1PipVel = (absOfi/pipMult) / (absD1*pipMult)
  // = absOfi / (pipMult² * absD1) — off by pipMult² (1e8 for non-JPY!) → always near zero → always ABSORBING.
  const absD1 = Math.abs(tracker.D1);
  const absOfi = Math.abs(tracker.ofiRecursive);
  const ofiInPriceVel = absOfi / pipMult;   // convert pip·tps → price·tps (price-velocity units)
  const efficiency = ofiInPriceVel / (absD1 + EFFICIENCY_EPSILON);
  const marketState = classifyMarketState(efficiency);

  // ─── Update state for next tick ───
  tracker.prevMid = mid;
  tracker.prevTs = ts;
  tracker.tickCount++;

  // ─── Running buy/sell counts (O(1) with EWMA) ───
  // DECAY CALIBRATION: Each pair gets ~8-10 ticks per 110s session across 8 instruments.
  // 0.95 decay → half-life ~14 ticks — too fast, oscillates around 50% on sparse data.
  // 0.88 decay → half-life ~5.5 ticks — responsive but stable enough for 8-10 ticks/pair.
  // A genuine 4-buy / 0-sell run in 6 ticks pushes ewmaBuyPct to ~53% at 0.88 decay — reachable.
  const buyDecay = 0.88;
  if (side === 1) {
    tracker.runningBuys++;
    tracker.ewmaBuyPct = buyDecay * tracker.ewmaBuyPct + (1 - buyDecay) * 1;
    tracker.ewmaSellPct = buyDecay * tracker.ewmaSellPct + (1 - buyDecay) * 0;
  } else {
    tracker.runningSells++;
    tracker.ewmaBuyPct = buyDecay * tracker.ewmaBuyPct + (1 - buyDecay) * 0;
    tracker.ewmaSellPct = buyDecay * tracker.ewmaSellPct + (1 - buyDecay) * 1;
  }
  const totalTicks = tracker.runningBuys + tracker.runningSells;
  const ofiRatio = totalTicks > 0 ? (tracker.runningBuys - tracker.runningSells) / totalTicks : 0;

  // ─── RECURSIVE VPIN (O(1) EWMA — no bucket scans) ───
  // Track buy/sell volume SEPARATELY, then compute imbalance ratio.
  // VPIN = |ewmaBuy - ewmaSell| / (ewmaBuy + ewmaSell)
  // 0 = balanced flow, 1 = all informed (one-directional)
  // Use a FASTER decay (0.05) so VPIN responds within ~20 ticks, not 200.
  // gamma=0.95 is too slow for 110s sessions with ~70 ticks/pair.
  const vpinDecay = 0.92; // ~12-tick half-life (vs gamma=0.95 → ~20-tick half-life)
  const tradeVol = Math.max(Math.abs(dxPips * tickVelocity), 0.001); // Volume proxy with floor
  const buyInc = side === 1 ? tradeVol : 0;
  const sellInc = side === -1 ? tradeVol : 0;
  tracker.ewmaBuyVol = vpinDecay * tracker.ewmaBuyVol + (1 - vpinDecay) * buyInc;
  tracker.ewmaSellVol = vpinDecay * tracker.ewmaSellVol + (1 - vpinDecay) * sellInc;
  const totalVol = tracker.ewmaBuyVol + tracker.ewmaSellVol;
  tracker.vpinRecursive = totalVol > 1e-9
    ? Math.abs(tracker.ewmaBuyVol - tracker.ewmaSellVol) / totalVol
    : 0;
  const vpin = tracker.vpinRecursive;

  // ─── Price-Level Persistence (O(1) map lookup) ───
  const bucketSize = isJpy ? 0.1 : 0.001;
  const priceLevel = Math.round(mid / bucketSize) * bucketSize;

  if (!tracker.priceLevels.has(priceLevel)) {
    tracker.priceLevels.set(priceLevel, {
      hits: 0, buys: 0, sells: 0, lastTs: ts,
      bounces: 0, lastDirection: side, broken: false,
      consecutiveSameDir: 0,
    });
  }
  const level = tracker.priceLevels.get(priceLevel)!;
  level.hits++;
  if (side === 1) level.buys++;
  else level.sells++;

  // O(1) bounce/breakout detection using consecutive counter
  if (level.lastDirection === side) {
    level.consecutiveSameDir++;
    if (level.consecutiveSameDir >= 3 && level.hits > 2) {
      level.broken = true; // broken through with force
    }
  } else {
    if (level.hits > 2) level.bounces++;
    level.consecutiveSameDir = 1;
  }
  level.lastDirection = side;
  level.lastTs = ts;

  // Prune price levels (only when needed)
  if (tracker.priceLevels.size > PRICE_LEVEL_MEMORY) {
    const sorted = Array.from(tracker.priceLevels.entries())
      .sort((a, b) => Math.abs(b[0] - mid) - Math.abs(a[0] - mid));
    for (let i = PRICE_LEVEL_MEMORY; i < sorted.length; i++) {
      tracker.priceLevels.delete(sorted[i][0]);
    }
  }

  // ─── KM normalized drift (signal-to-noise) ───
  const sqrtD2 = Math.sqrt(Math.abs(tracker.D2));
  const driftNormalized = sqrtD2 > 1e-10 ? tracker.D1 / sqrtD2 : 0;

  // ─── Hidden Limit Player detection via Efficiency Ratio ───
  const hiddenPlayer = detectHiddenLimitPlayer(
    tracker.ofiRecursive, tracker.D1, efficiency, marketState
  );

  // ─── Synthetic depth from persistence map ───
  const depthLevels = Array.from(tracker.priceLevels.entries())
    .filter(([, info]) => info.hits >= 2)
    .map(([price, info]) => ({
      price: +price.toFixed(5),
      buys: info.buys, sells: info.sells,
      net: info.buys - info.sells,
      hits: info.hits, bounces: info.bounces, broken: info.broken,
    }))
    .sort((a, b) => Math.abs(b.price - mid) - Math.abs(a.price - mid))
    .slice(0, 20);

  // ─── S/R from tick-density persistence ───
  const srLevels: { price: number; strength: number; type: "SUPPORT" | "RESISTANCE" }[] = [];
  for (const [price, info] of tracker.priceLevels.entries()) {
    if (info.bounces >= 2 && !info.broken) {
      srLevels.push({
        price: +price.toFixed(5),
        strength: info.bounces * info.hits,
        type: info.sells > info.buys ? "SUPPORT" : "RESISTANCE",
      });
    }
  }
  srLevels.sort((a, b) => b.strength - a.strength);

  // Normalize recursive OFI to [-1, 1] range for bias detection
  // Use tanh to smoothly bound the unbounded recursive value
  const ofiNorm = Math.tanh(tracker.ofiRecursive / 100);

  return {
    ofiRatio: Math.round(ofiRatio * 1000) / 1000,
    ofiRaw: tracker.runningBuys - tracker.runningSells,
    ofiWeighted: Math.round(ofiNorm * 1000) / 1000,
    vpin: Math.round(vpin * 1000) / 1000,
    buyPressure: Math.round(tracker.ewmaBuyPct * 100),
    sellPressure: Math.round(tracker.ewmaSellPct * 100),
    ticksInWindow: tracker.tickCount,
    bias: ofiNorm > OFI_IMBALANCE_THRESHOLD ? "BUY" : ofiNorm < -OFI_IMBALANCE_THRESHOLD ? "SELL" : "NEUTRAL",
    syntheticDepth: depthLevels,
    km: {
      D1: Math.round(tracker.D1 * 1e8) / 1e8,
      D2: Math.round(tracker.D2 * 1e12) / 1e12,
      driftNormalized: Math.round(driftNormalized * 1000) / 1000,
      sampleSize: tracker.tickCount,
      alphaAdaptive: Math.round(tracker.alpha * 10000) / 10000,
    },
    hiddenPlayer,
    resistanceLevels: srLevels.slice(0, 5),
    efficiency: Math.round(efficiency * 1000) / 1000,
    marketState,
    zOfi: Math.round(tracker.zOfi * 1000) / 1000,
    hurst: Math.round(tracker.hurst * 1000) / 1000,
    hurstRegime,
  };
}

// Detect HFT front-running: rapid bid/ask oscillations without mid movement
function detectHftPattern(pair: string): { detected: boolean; pattern: string; confidence: number } {
  const recent = getTickBufferSnapshot(pair, 1000); // last 1s
  if (recent.length < 10) return { detected: false, pattern: "insufficient_data", confidence: 0 };

  // Check for spread oscillation without mid movement
  const midRange = Math.max(...recent.map(t => t.mid)) - Math.min(...recent.map(t => t.mid));
  const spreadVariance = recent.reduce((s, t, i) => {
    if (i === 0) return 0;
    return s + Math.abs(t.spreadPips - recent[i - 1].spreadPips);
  }, 0) / recent.length;

  const pipMult = pair.includes("JPY") ? 100 : 10000;
  const midRangePips = midRange * pipMult;

  if (spreadVariance > 0.3 && midRangePips < 0.5) {
    return { detected: true, pattern: "spread_oscillation", confidence: Math.min(spreadVariance * 2, 1) };
  }

  return { detected: false, pattern: "clean", confidence: 0 };
}

function recordTickTimestamp(pair: string, ts: number) {
  if (!tickTimestamps.has(pair)) tickTimestamps.set(pair, []);
  const hist = tickTimestamps.get(pair)!;
  hist.push(ts);
  // Prune old timestamps outside the window
  const cutoff = ts - TICK_DENSITY_WINDOW_MS;
  while (hist.length > 0 && hist[0] < cutoff) hist.shift();
}

function getTicksPerSecond(pair: string): number {
  const hist = tickTimestamps.get(pair);
  if (!hist || hist.length < 2) return 0;
  const windowMs = hist[hist.length - 1] - hist[0];
  if (windowMs < 500) return 0; // not enough time elapsed
  return (hist.length / windowMs) * 1000; // ticks per second
}

function isTickDensitySufficient(pair: string): { ok: boolean; tps: number; reason: string } {
  const tps = getTicksPerSecond(pair);
  if (tps < TICK_DENSITY_MIN_TPS) {
    return { ok: false, tps, reason: `low density (${tps.toFixed(1)} tps < ${TICK_DENSITY_MIN_TPS} min)` };
  }
  return { ok: true, tps, reason: "ok" };
}

// ─── Z-Score Strike Constants ────────────────────────────
const ZSCORE_WINDOW = 120;          // ticks to build rolling mean/stddev
const ZSCORE_FIRE_THRESHOLD = 2.0;  // z > 2.0 = statistical divergence (overridden by config)
const ZSCORE_EXIT_TARGET = 0.0;     // mean reversion target
const ZSCORE_COOLDOWN_MS = 300_000; // 5 MINUTES between fires on same group (was 10s — caused triple-taps)

// ═══ DAVID & ATLAS — TUNNEL GATE THRESHOLDS ═══
// 4/4 GATES OPEN = Enter / Hold  (Tunnel is active, institutional consensus is absolute)
// Any gate drops to 3/4 = Mandatory MarketClose() — Tunnel collapsed.
//
// GATE 1: HURST   — H ≥ 0.62 (persistent regime — move will travel)
// GATE 2: EFFICIENCY — E ≥ 2.0 (structural vacuum — price moving with minimal resistance)
// GATE 3: Z-OFI   — |Z| ≥ 1.0σ + direction check (statistical abnormality confirmed)
// GATE 4: VPIN    — VPIN ≥ 0.40 (informed institutional flow, not retail noise)
//
// DIRECTION: Z-OFI > 0 = LONG. Z-OFI < 0 = SHORT. No ambiguity.
// NO STOP LOSS. NO TAKE PROFIT. The 3/4 gate drop IS the only exit authority.

const DA_HURST_MIN = 0.62;          // Gate 1: Persistent regime
const DA_EFFICIENCY_MIN = 2.0;       // Gate 2: Structural vacuum
const DA_ZOFI_MIN = 1.0;             // Gate 3: |Z-OFI| ≥ 1.0σ (directional intent confirmed)
const DA_VPIN_MIN = 0.40;            // Gate 4: Institutional flow (not ghost/retail)
const DA_VPIN_GHOST_MAX = 0.15;      // Ghost move block: VPIN < 0.15 = retail-driven, never enter

// Rule of 2: Require 2 consecutive 4/4-gate ticks before entry (anti-noise, anti-lag)
const DA_RULE_OF_2 = 2;

// Exit sensitivity: how many consecutive ticks a gate must fail before firing MarketClose
// Value = 1 = immediate (any single tick drop = flush). Zero-fault tolerance.
const DA_EXIT_FAIL_TICKS = 1;

// Cooldown: 5 minutes between entries per pair
const DA_COOLDOWN_MS = 300_000;

// Minimum hold before exit gates are evaluated (prevents EWMA warm-up false exits)
const DA_MIN_HOLD_MS = 30_000; // 30s minimum hold for David & Atlas (tighter than Predatory Hunter)

// ─── Daily VWAP Tracker (tick-weighted volume price) ───
// Used as failsafe anchor when no institutional wall is within 3 pips.
// Since OANDA stream doesn't provide volume, we use tick-weighted average (TWAP ≈ VWAP proxy).
const vwapTrackers = new Map<string, { sumPriceVol: number; sumVol: number; dayStart: number }>();
function getOrResetVwap(pair: string, mid: number): number {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let vt = vwapTrackers.get(pair);
  // Reset at UTC midnight
  if (!vt || (now - vt.dayStart) > dayMs) {
    vt = { sumPriceVol: mid, sumVol: 1, dayStart: now - (now % dayMs) };
    vwapTrackers.set(pair, vt);
  }
  // Each tick contributes equally (tick-weighted VWAP)
  vt.sumPriceVol += mid;
  vt.sumVol += 1;
  return vt.sumPriceVol / vt.sumVol;
}

// Track last applied SL per trade to enforce unidirectional moves
// BUG FIX: This map is hydrated from OANDA live trades on every session boot.
// Previously initialized empty, causing cold-start amnesia: after a ripple-stream restart
// prevSL=undefined triggered the 2-pip fallback guard which could WIDEN the stop
// if the best wall shifted down. Now we seed from the actual broker SL price.
const lastAppliedSL = new Map<string, number>();

// ─── Velocity Gating Constants ───────────────────────────
const VELOCITY_TICK_THRESHOLD = 5;
const VELOCITY_MAX_AGE_MS = 2000;
const VELOCITY_COOLDOWN_MS = 3000;

// ─── Snap-Back Constants ─────────────────────────────────
const SNAPBACK_VOLUME_WINDOW = 15;
const SNAPBACK_EXHAUSTION_RATIO = 0.7;
const SNAPBACK_MIN_SPIKE_PIPS = 3;

// ─── Shared Constants ────────────────────────────────────
const SLIPPAGE_THRESHOLD_PIPS = 0.2;

// ─── Correlation Groups (pairs that move together) ───────
// Each group: the "spread" between them should be stationary → z-score works.
const DEFAULT_CORRELATION_GROUPS: { name: string; pairA: string; pairB: string }[] = [
  { name: "EUR_GBP_CROSS", pairA: "EUR_USD", pairB: "GBP_USD" },
  { name: "AUD_NZD_CROSS", pairA: "AUD_USD", pairB: "NZD_USD" },
  { name: "EUR_JPY_TRI",   pairA: "EUR_USD", pairB: "USD_JPY" },
  { name: "GBP_JPY_TRI",   pairA: "GBP_USD", pairB: "USD_JPY" },
  { name: "CAD_AUD_CROSS",  pairA: "USD_CAD", pairB: "AUD_USD" },
  { name: "EUR_AUD_CROSS",  pairA: "EUR_USD", pairB: "AUD_USD" },
];

// ─── Z-Score Tracker ─────────────────────────────────────
interface ZScoreTracker {
  spreadHistory: number[];     // rolling spread values
  lastFireTs: number;
  firedDirection: string | null;
  // ═══ PREDATORY HUNTER: Rule of 3 consecutive tick verification ═══
  consecutivePassCount: number;  // How many consecutive ticks all 4 gates passed
  lastPassDirection: string | null; // Direction of the consecutive passes
}

interface VelocityTracker {
  ticks: { ts: number; mid: number; direction: 1 | -1 }[];
  lastFireTs: number;
}

interface SnapBackTracker {
  recentTicks: { ts: number; mid: number; delta: number }[];
  lastMid: number | null;
  lastFireTs: number;
}

interface SlippageRecord {
  totalSlippage: number;
  fills: number;
  switchedToLimit: boolean;
}

function pipMultiplier(pair: string): number {
  return pair.includes("JPY") ? 100 : 10000;
}

function toPips(priceMove: number, pair: string): number {
  return priceMove * pipMultiplier(pair);
}

function fromPips(pips: number, pair: string): number {
  return pips / pipMultiplier(pair);
}

function computeZScore(values: number[]): { mean: number; std: number; z: number } {
  if (values.length < 10) return { mean: 0, std: 0, z: 0 };
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std < 1e-10) return { mean, std: 0, z: 0 };
  const current = values[n - 1];
  const z = (current - mean) / std;
  return { mean, std, z };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OANDA_TOKEN = Deno.env.get("OANDA_LIVE_API_TOKEN");
  const OANDA_ACCOUNT = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LIVE_ENABLED = Deno.env.get("LIVE_TRADING_ENABLED");

  if (!OANDA_TOKEN || !OANDA_ACCOUNT) {
    return new Response(JSON.stringify({ error: "OANDA credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ─── COLD-START SL HYDRATION: Seed lastAppliedSL from OANDA live trade state ───
  // CRITICAL FIX: Without this, a stream restart causes prevSL=undefined for every
  // open trade. The fallback guard (newSL > entryPrice - 2 pips) could widen the
  // stop if the best wall shifted further away. We seed from the live OANDA stopLoss.
  try {
    const slHydrationRes = await fetch(
      `${OANDA_API}/accounts/${OANDA_ACCOUNT}/openTrades`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } },
    );
    if (slHydrationRes.ok) {
      const slHydrationData = await slHydrationRes.json();
      for (const t of (slHydrationData.trades || [])) {
        const slPrice = t.stopLossOrder?.price ? parseFloat(t.stopLossOrder.price) : null;
        if (t.id && slPrice != null) {
          lastAppliedSL.set(t.id, slPrice);
        }
      }
      console.log(`[STRIKE-v3] 🛡️ SL hydration: seeded ${lastAppliedSL.size} trades from OANDA live state`);
    }
  } catch (e) { console.warn("[STRIKE-v3] ⚠️ SL hydration failed (non-critical):", e); }

  // ─── Credit Exhaustion Check: Only Z-Score Strike survives AI blackout ───
  let creditExhausted = false;
  try {
    const { data: ceState } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "credit_exhaustion_state")
      .eq("memory_type", "system")
      .maybeSingle();
    if (ceState?.payload?.exhausted === true) {
      creditExhausted = true;
      console.log("[STRIKE-v3] 🔋 CREDIT EXHAUSTION ACTIVE — Predatory Hunter is sole strategy. DGE fallback engaged.");
    }
  } catch { /* non-critical — default to all strategies enabled */ }

  try {
    const now = new Date();

  // ─── 1. Load David & Atlas governance config ───
    const { data: governanceConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "david_atlas_config")
      .maybeSingle();

    const govPayload = governanceConfig?.payload as Record<string, unknown> | null;
    // ─── SOVEREIGN PULSE PROTOCOL: Fixed 1,250 units per strike. No dynamic sizing. ───
    const baseUnits: number = 1250;
    const blockedPairs: string[] = (govPayload?.blockedPairs as string[]) || [];

    // ─── 2. Load blocked pairs override from circuit breaker ───
    const { data: circuitBypasses } = await supabase
      .from("gate_bypasses")
      .select("gate_id, pair")
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .like("gate_id", "CIRCUIT_BREAKER:%");

    const circuitActive = (circuitBypasses?.length ?? 0) > 0;
    if (circuitActive) {
      console.log(`[DAVID-ATLAS] 🚨 CIRCUIT BREAKER ACTIVE — all entries blocked`);
    }

    // ─── 3. Build instrument set — David & Atlas pairs ───
    const DA_PAIRS = [
      "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
      "EUR_JPY", "GBP_JPY", "EUR_GBP", "NZD_USD", "AUD_JPY",
    ];
    const instruments = new Set<string>(
      DA_PAIRS.filter(p => !blockedPairs.includes(p))
    );

    if (instruments.size === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No instruments — all pairs blocked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[DAVID-ATLAS] ⚡ Tunnel Engine v2 | ${instruments.size} pairs | Hurst≥${DA_HURST_MIN} Eff≥${DA_EFFICIENCY_MIN} |Z-OFI|≥${DA_ZOFI_MIN} VPIN≥${DA_VPIN_MIN} | Rule-of-2`);

    // ─── 4. Open OANDA stream ───
    const instrumentList = Array.from(instruments).join(",");
    const streamRes = await fetch(
      `${OANDA_STREAM}/accounts/${OANDA_ACCOUNT}/pricing/stream?instruments=${instrumentList}&snapshot=true`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } },
    );

    if (!streamRes.ok || !streamRes.body) {
      const errBody = await streamRes.text().catch(() => "");
      console.error(`[STRIKE-v3] Stream open failed ${streamRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `Stream failed: ${streamRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 5. Initialize trackers ───
    const prices = new Map<string, { bid: number; ask: number; mid: number; spread: number; spreadPips: number }>();
    const velocityTrackers = new Map<string, VelocityTracker>();

    // ═══ DAVID & ATLAS: Per-Instrument State ═══
    const davidAtlasState = new Map<string, {
      consecutivePassCount: number;  // consecutive 4/4 tick passes before entry
      lastPassDirection: string | null;
      lastFireTs: number;            // last entry timestamp (cooldown)
    }>();

    // Cross-session cooldown: load recent DA fires from DB
    try {
      const fiveMinAgo = new Date(Date.now() - DA_COOLDOWN_MS).toISOString();
      const { data: recentFires } = await supabase
        .from("oanda_orders")
        .select("currency_pair, created_at")
        .eq("direction_engine", "david-atlas")
        .eq("environment", "live")
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false });

      for (const fire of (recentFires || [])) {
        davidAtlasState.set(fire.currency_pair, {
          consecutivePassCount: 0,
          lastPassDirection: null,
          lastFireTs: new Date(fire.created_at).getTime(),
        });
      }
      if (recentFires?.length) {
        console.log(`[DAVID-ATLAS] 🔁 Cross-session cooldown: ${recentFires.length} recent fires loaded`);
      }
    } catch { /* non-critical */ }

    // ═══ GATE DIAGNOSTICS (single declaration) ═══
    const gateDiag = { total: 0, density: 0, warmup: 0, hurst: 0, efficiency: 0, zofi: 0, vpin: 0, ruleOf2: 0, circuit: 0, passed: 0 };
    let lastDiagTs = 0;

    // ─── David & Atlas: Load open trades for exit monitoring ───
    const { data: openTradesForExit } = await supabase
      .from("oanda_orders")
      .select("id, oanda_trade_id, currency_pair, direction, entry_price, created_at, environment")
      .eq("status", "filled")
      .is("exit_price", null)
      .not("oanda_trade_id", "is", null)
      .not("entry_price", "is", null);

    const exitTradeMap = new Map<string, any>();
    for (const t of (openTradesForExit || [])) {
      exitTradeMap.set(t.currency_pair, t);
    }
    console.log(`[DAVID-ATLAS] 🎯 Tunnel monitoring ${exitTradeMap.size} open trades`);

    // Init velocity trackers for all instruments
    for (const p of instruments) {
      if (!velocityTrackers.has(p)) velocityTrackers.set(p, { ticks: [], lastFireTs: 0 });
    }

    const tunnelFires: string[] = [];
    const tunnelExits: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let lastExitScanTs = 0;
    const EXIT_SCAN_INTERVAL_MS = 500; // Every 500ms — high-precision tunnel gate monitoring

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Get admin user
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    // ─── David & Atlas: Execute MARKET order — no SL, no TP ───
    // TUNNEL PROTOCOL: Zero stop loss, zero take profit.
    // The 3/4 gate flush IS the only exit authority.
    // MARGIN GUARD: Pre-calculates margin required; self-corrects lot size if NAV insufficient.
    // IOC (FOK): Fill at whale-shadow price or not at all — zero partial fill risk.
    async function davidAtlasEnter(
      pair: string,
      direction: string,
      requestedUnits: number,
      currentPrice: { mid: number; spreadPips: number },
    ): Promise<{ success: boolean; tradeId?: string; fillPrice?: number; slippage?: number }> {
      if (LIVE_ENABLED !== "true") {
        console.log(`[DAVID-ATLAS] 🔇 Would fire ${direction} ${requestedUnits} ${pair} — LIVE DISABLED`);
        return { success: false };
      }

      // ─── L0 HARD GATE: Circuit breaker ───
      if (circuitActive) {
        console.log(`[DAVID-ATLAS] 🚨 CIRCUIT BREAKER: Entry blocked — all trading halted`);
        return { success: false };
      }

      // ─── L0 HARD GATE: Spread gate ───
      const spreadCheck = isSpreadTooWide(pair, currentPrice.spreadPips);
      if (spreadCheck.blocked) {
        console.log(`[DAVID-ATLAS] 🛡 SPREAD GATE: ${pair} ${spreadCheck.reason} — BLOCKED`);
        return { success: false };
      }

      // ─── L0 HARD GATE: Late-NY / Rollover block ───
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 20 || utcHour < 1) {
        console.log(`[DAVID-ATLAS] 🛡 SESSION GATE: UTC ${utcHour}h — late-NY/rollover blocked`);
        return { success: false };
      }

      // ─── MARGIN GUARD: Fetch live NAV and pre-calculate required margin ───
      // Self-corrects lot size to fit available margin — prevents rejections on small accounts.
      let units = requestedUnits;
      try {
        const acctRes = await fetch(
          `${OANDA_API}/accounts/${OANDA_ACCOUNT}/summary`,
          { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } },
        );
        if (acctRes.ok) {
          const acctData = await acctRes.json();
          const nav = parseFloat(acctData.account?.NAV || acctData.account?.balance || "0");
          const marginRate = parseFloat(acctData.account?.marginRate || "0.02"); // default 2% margin
          const isJPY = pair.includes("JPY");
          // Approximate notional in account currency (USD base assumption)
          const priceForMargin = currentPrice.mid;
          const notional = isJPY ? (units / priceForMargin) : (units * priceForMargin);
          const requiredMargin = notional * marginRate;
          const marginAvailable = parseFloat(acctData.account?.marginAvailable || String(nav));

          if (requiredMargin > marginAvailable * 0.9) {
            // Self-correct: reduce units to use at most 90% of available margin
            const maxSafeNotional = (marginAvailable * 0.9) / marginRate;
            const correctedUnits = isJPY
              ? Math.floor(maxSafeNotional * priceForMargin / 1000) * 1000
              : Math.floor(maxSafeNotional / priceForMargin / 1000) * 1000;

            if (correctedUnits < 1000) {
              console.log(`[DAVID-ATLAS] 🛡 MARGIN GUARD: Insufficient margin (NAV=$${nav.toFixed(2)}, need $${requiredMargin.toFixed(2)}) — BLOCKED`);
              return { success: false };
            }
            console.log(`[DAVID-ATLAS] 🔧 MARGIN GUARD: Self-corrected ${pair} ${requestedUnits} → ${correctedUnits} units (NAV=$${nav.toFixed(2)}, margin avail=$${marginAvailable.toFixed(2)})`);
            units = correctedUnits;
          }
        }
      } catch (marginErr) {
        console.warn(`[DAVID-ATLAS] ⚠️ Margin guard fetch failed (non-critical):`, marginErr);
      }

      const dirUnits = direction === "long" ? units : -units;

      // NO stopLossOnFill, NO takeProfitOnFill — pure tunnel
      // FOK (Fill or Kill) = atomic IOC: filled at whale-shadow price or cancelled instantly.
      // Eliminates partial fills and dangerous slippage in liquidity vacuums.
      const orderBody = {
        order: {
          type: "MARKET",
          instrument: pair,
          units: String(dirUnits),
          timeInForce: "FOK",
        },
      };

      try {
        const orderRes = await fetch(
          `${OANDA_API}/accounts/${OANDA_ACCOUNT}/orders`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(orderBody),
          },
        );

        const orderData = await orderRes.json();
        const fill = orderData.orderFillTransaction;

        if (fill) {
          const fillPrice = parseFloat(fill.price || "0");
          const tradeId = fill.tradeOpened?.tradeID || fill.id;
          const slippagePips = Math.abs(toPips(fillPrice - currentPrice.mid, pair));

          if (adminRole) {
            await supabase.from("oanda_orders").insert({
              user_id: adminRole.user_id,
              signal_id: `david-atlas-${pair}-${Date.now()}`,
              currency_pair: pair,
              direction: direction.toLowerCase(),
              units,
              entry_price: fillPrice,
              oanda_order_id: fill.id,
              oanda_trade_id: tradeId,
              status: "filled",
              environment: "live",
              direction_engine: "david-atlas",
              sovereign_override_tag: `david-atlas:${pair}`,
              confidence_score: 1.0, // 4/4 gates = maximum institutional consensus
              governance_payload: {
                strategy: "david-atlas-tunnel-v1", pair, direction, slippagePips,
                requestedUnits, actualUnits: units, marginGuardApplied: units !== requestedUnits,
              },
              requested_price: currentPrice.mid,
              slippage_pips: slippagePips,
              spread_at_entry: currentPrice.spreadPips,
            });
          }

          console.log(`[DAVID-ATLAS] ✅ TUNNEL OPEN: ${tradeId} @ ${fillPrice} | ${direction.toUpperCase()} ${units} ${pair} | slip ${slippagePips.toFixed(2)}p | NO SL | NO TP | ATOMIC FOK`);
          return { success: true, tradeId, fillPrice, slippage: slippagePips };
        } else {
          const rejectReason = orderData.orderRejectTransaction?.rejectReason || "Unknown";
          console.warn(`[DAVID-ATLAS] ❌ REJECTED: ${pair} ${rejectReason}`);
          return { success: false };
        }
      } catch (err) {
        console.error(`[DAVID-ATLAS] Execution error:`, err);
        return { success: false };
      }
    }

    // ─── David & Atlas: MarketClose — mandatory tunnel flush ───
    async function davidAtlasFlush(
      openTrade: any,
      instrument: string,
      reason: string,
    ): Promise<void> {
      if (LIVE_ENABLED !== "true") return;
      console.log(`[DAVID-ATLAS] 🚪 TUNNEL FLUSH: ${instrument} ${openTrade.direction} | ${reason}`);
      try {
        const closeRes = await fetch(
          `${OANDA_API}/accounts/${OANDA_ACCOUNT}/trades/${openTrade.oanda_trade_id}/close`,
          { method: "PUT", headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" } },
        );
        if (closeRes.ok) {
          const closeData = await closeRes.json();
          const exitPrice = parseFloat(closeData.orderFillTransaction?.price || "0");
          tunnelExits.push(`${instrument}:${reason}`);
          await supabase.from("oanda_orders").update({
            exit_price: exitPrice,
            status: "closed",
            closed_at: new Date().toISOString(),
            health_governance_action: `TUNNEL_FLUSH: ${reason}`,
          }).eq("id", openTrade.id);
          exitTradeMap.delete(instrument);
          console.log(`[DAVID-ATLAS] ✅ TUNNEL CLOSED ${instrument} @ ${exitPrice} | ${reason}`);
        } else {
          const err = await closeRes.json();
          console.warn(`[DAVID-ATLAS] ⚠️ Close failed ${instrument}: ${JSON.stringify(err)}`);
        }
      } catch (err) {
        console.error(`[DAVID-ATLAS] ❌ Close error ${instrument}:`, err);
      }
    }

    // ─── 7. Process tick stream ───
    try {
      while (true) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > MAX_STREAM_SECONDS) {
          console.log(`[STRIKE-v3] ⏱ Shutdown after ${elapsed.toFixed(0)}s, ${tickCount} ticks`);
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const tick = JSON.parse(trimmed);
            if (tick.type !== "PRICE") continue;

            tickCount++;
            const tickTs = Date.now();
            const instrument = tick.instrument;
            const bid = parseFloat(tick.bids?.[0]?.price || "0");
            const ask = parseFloat(tick.asks?.[0]?.price || "0");
            const mid = (bid + ask) / 2;
            const spread = ask - bid;
            const spreadPips = toPips(spread, instrument);
            const prevPrice = prices.get(instrument);
            prices.set(instrument, { bid, ask, mid, spread, spreadPips });
            recordSpread(instrument, spreadPips); // feed rolling average
            recordTickTimestamp(instrument, tickTs); // feed tick-density tracker

            // ─── OFI: Classify tick & update synthetic order book ───
            const ofi = processOfiTick(instrument, mid, bid, ask, spreadPips, tickTs);

            // Update velocity tracker with Lee-Ready classification for ALL ticks (not just mid-movers)
            // BUG FIX: Previously skipped zero-delta ticks (Math.abs(delta) > 0).
            // In quiet markets, many ticks have zero mid-delta but bid/ask shifts — these were dropped,
            // causing the 20-tick window to span minutes and making OFI ratio unreliable (blocked 62%).
            const vt = velocityTrackers.get(instrument);
            if (vt) {
              const tracker = getOrCreateOfi(instrument);
              const tickDir = tracker.lastClassification; // Lee-Ready direction (handles zero-delta via quote rule)
              vt.ticks.push({ ts: tickTs, mid, direction: tickDir });
              // Keep last 20 ticks for momentum lookback
              while (vt.ticks.length > 20) vt.ticks.shift();
            }

            // ═══════════════════════════════════════════════
            // DAVID & ATLAS — TUNNEL EXIT MONITOR (every 500ms)
            // Every open trade is evaluated against 4/4 gate state.
            // If ANY gate drops → 3/4, fire mandatory MarketClose().
            // ═══════════════════════════════════════════════
            if (tickTs - lastExitScanTs >= EXIT_SCAN_INTERVAL_MS) {
              lastExitScanTs = tickTs;
              const openTrade = exitTradeMap.get(instrument);
              if (openTrade && openTrade.oanda_trade_id) {
                const exitTracker = getOrCreateOfi(instrument);
                if (exitTracker.tickCount >= 10) {
                  // ─── Minimum hold — EWMA needs ~30s to stabilize after entry ───
                  const tradeAgeMs = openTrade.created_at
                    ? Date.now() - new Date(openTrade.created_at).getTime()
                    : DA_MIN_HOLD_MS + 1;

                  if (tradeAgeMs < DA_MIN_HOLD_MS) {
                    console.log(`[DAVID-ATLAS] 🛡️ MIN_HOLD: ${instrument} age=${Math.round(tradeAgeMs/1000)}s < ${DA_MIN_HOLD_MS/1000}s — exit suppressed`);
                  } else {
                    // ─── DAVID & ATLAS: 4-Gate Active State Check ───
                    // Compute exact same gates used for entry. If ANY fails → Tunnel collapsed → FLUSH.
                    const pipMultExit = instrument.includes("JPY") ? 100 : 10000;
                    const absD1Exit = Math.abs(exitTracker.D1);
                    const absOfiExit = Math.abs(exitTracker.ofiRecursive);
                    const ofiScaledExit = absOfiExit / pipMultExit;
                    const efficiencyExit = ofiScaledExit / (absD1Exit + EFFICIENCY_EPSILON);
                    const zOfiExit = exitTracker.zOfi;
                    const isLong = openTrade.direction === "long";

                    // ─── PRIORITY-0 INTERRUPT: Z-OFI Zero-Cross ───
                    // If Z-OFI crosses ZERO (reverses sign), institutional intent has FLIPPED.
                    // This is a secondary exit trigger that fires even if other 3 gates are green.
                    // Fires regardless of gate count — it represents instantaneous consensus reversal.
                    const zOfiZeroCross = isLong ? (zOfiExit <= 0) : (zOfiExit >= 0);
                    if (zOfiZeroCross && exitTracker.tickCount >= 20) {
                      const zeroCrossReason = `Z-OFI_ZERO_CROSS: Z=${zOfiExit.toFixed(3)} crossed zero — institutional intent reversed. Mandatory P0 flush.`;
                      console.log(`[DAVID-ATLAS] ⚡ ZERO-CROSS EXIT: ${instrument} | ${zeroCrossReason}`);
                      await davidAtlasFlush(openTrade, instrument, zeroCrossReason);
                    } else {
                      // Determine direction-aligned Z-OFI gate
                      const zOfiAligned = isLong ? (zOfiExit >= DA_ZOFI_MIN) : (zOfiExit <= -DA_ZOFI_MIN);

                      // Evaluate all 4 gates (same thresholds as entry)
                      const gate1Hurst = exitTracker.hurst >= DA_HURST_MIN;
                      const gate2Efficiency = efficiencyExit >= DA_EFFICIENCY_MIN;
                      const gate3ZOfi = zOfiAligned;
                      const gate4Vpin = exitTracker.vpinRecursive >= DA_VPIN_MIN;

                      const gatesOpen = [gate1Hurst, gate2Efficiency, gate3ZOfi, gate4Vpin].filter(Boolean).length;

                      if (gatesOpen < 4) {
                        // TUNNEL COLLAPSED — mandatory MarketClose()
                        const failedGates = [
                          !gate1Hurst ? `HURST(${exitTracker.hurst.toFixed(3)}<${DA_HURST_MIN})` : null,
                          !gate2Efficiency ? `EFF(${efficiencyExit.toFixed(2)}<${DA_EFFICIENCY_MIN})` : null,
                          !gate3ZOfi ? `ZOFI(${zOfiExit.toFixed(2)} not ${isLong ? "≥" : "≤"}${isLong ? DA_ZOFI_MIN : -DA_ZOFI_MIN})` : null,
                          !gate4Vpin ? `VPIN(${exitTracker.vpinRecursive.toFixed(3)}<${DA_VPIN_MIN})` : null,
                        ].filter(Boolean).join(" | ");

                        const flushReason = `3/4_GATE_FLUSH: ${gatesOpen}/4 gates open. Failed: ${failedGates}`;
                        await davidAtlasFlush(openTrade, instrument, flushReason);
                      } else {
                        // Tunnel still active — log state
                        console.log(`[DAVID-ATLAS] 🟢 TUNNEL ACTIVE: ${instrument} ${openTrade.direction} | 4/4 gates | H=${exitTracker.hurst.toFixed(3)} E=${efficiencyExit.toFixed(2)} Z=${zOfiExit.toFixed(2)} VPIN=${exitTracker.vpinRecursive.toFixed(3)}`);
                      }
                    }
                  }
                }
              }
            }

            // ═══════════════════════════════════════════════
            // DAVID & ATLAS — TUNNEL ENTRY SCANNER
            // Scans all instruments on every tick.
            // Fires ONLY when 4/4 gates are confirmed for DA_RULE_OF_2 consecutive ticks.
            // Direction locked by Z-OFI sign.
            // ═══════════════════════════════════════════════

            // ─── GATE DIAGNOSTICS: Log every 30s ───
            if (tickTs - lastDiagTs > 30_000) {
              lastDiagTs = tickTs;
              if (gateDiag.total > 0) {
                console.log(`[DAVID-ATLAS-DIAG] 📊 Scans=${gateDiag.total} | Density=${gateDiag.density} Warmup=${gateDiag.warmup} Hurst=${gateDiag.hurst} Eff=${gateDiag.efficiency} ZOfi=${gateDiag.zofi} VPIN=${gateDiag.vpin} R2=${gateDiag.ruleOf2} | TUNNELS_OPENED=${gateDiag.passed}`);
              }
            }

            for (const tradePair of instruments) {
              if (blockedPairs.includes(tradePair)) continue;
              gateDiag.total++;

              // Per-instrument David & Atlas state
              if (!davidAtlasState.has(tradePair)) {
                davidAtlasState.set(tradePair, { consecutivePassCount: 0, lastPassDirection: null, lastFireTs: 0 });
              }
              const daState = davidAtlasState.get(tradePair)!;

              // Cooldown: 5 minutes between tunnel entries per pair
              if (tickTs - daState.lastFireTs < DA_COOLDOWN_MS) continue;

              // ─── PRE-GATE: Tick density ───
              const densityCheck = isTickDensitySufficient(tradePair);
              if (!densityCheck.ok) { daState.consecutivePassCount = 0; gateDiag.density++; continue; }

              // ─── Warmup ───
              const daTracker = getOrCreateOfi(tradePair);
              if (daTracker.tickCount < 20) { daState.consecutivePassCount = 0; gateDiag.warmup++; continue; }

              // ─── Double-entry guard ───
              if (exitTradeMap.has(tradePair)) {
                daState.consecutivePassCount = 0;
                continue;
              }

              // ─── Compute physics ───
              const pipMultDA = tradePair.includes("JPY") ? 100 : 10000;
              const absD1DA = Math.abs(daTracker.D1);
              const absOfiDA = Math.abs(daTracker.ofiRecursive);
              const ofiScaledDA = absOfiDA / pipMultDA;
              const d1PipVelDA = absD1DA * pipMultDA;
              const efficiencyDA = ofiScaledDA / (d1PipVelDA + EFFICIENCY_EPSILON);

              // ─── GATE 1: HURST ≥ 0.62 ───
              if (daTracker.hurst < DA_HURST_MIN) {
                daState.consecutivePassCount = 0; gateDiag.hurst++; continue;
              }

              // ─── GATE 2: EFFICIENCY ≥ 2.0 ───
              if (efficiencyDA < DA_EFFICIENCY_MIN) {
                daState.consecutivePassCount = 0; gateDiag.efficiency++; continue;
              }

              // ─── GATE 3: Z-OFI — direction lock ───
              // Z-OFI > 0 = LONG (positive institutional flow)
              // Z-OFI < 0 = SHORT (negative institutional flow)
              const zOfiDA = daTracker.zOfi;
              let tunnelDirection: string | null = null;
              if (zOfiDA >= DA_ZOFI_MIN) {
                tunnelDirection = "long";
              } else if (zOfiDA <= -DA_ZOFI_MIN) {
                tunnelDirection = "short";
              }
              if (!tunnelDirection) {
                daState.consecutivePassCount = 0; gateDiag.zofi++; continue;
              }

              // ─── GATE 4: VPIN ≥ 0.40 ───
              if (daTracker.vpinRecursive < DA_VPIN_GHOST_MAX) {
                console.log(`[DAVID-ATLAS] 👻 GHOST MOVE BLOCKED: ${tradePair} VPIN=${daTracker.vpinRecursive.toFixed(3)}`);
                daState.consecutivePassCount = 0; gateDiag.vpin++; continue;
              }
              if (daTracker.vpinRecursive < DA_VPIN_MIN) {
                daState.consecutivePassCount = 0; gateDiag.vpin++; continue;
              }

              // ─── RULE OF 2: Require DA_RULE_OF_2 consecutive 4/4 ticks ───
              if (daState.lastPassDirection === tunnelDirection) {
                daState.consecutivePassCount++;
              } else {
                daState.consecutivePassCount = 1;
                daState.lastPassDirection = tunnelDirection;
                gateDiag.ruleOf2++;
                continue;
              }

              if (daState.consecutivePassCount < DA_RULE_OF_2) {
                console.log(`[DAVID-ATLAS] ⏳ RULE OF 2: ${tradePair} ${tunnelDirection} — pass ${daState.consecutivePassCount}/${DA_RULE_OF_2} | H=${daTracker.hurst.toFixed(3)} E=${efficiencyDA.toFixed(2)} Z=${zOfiDA.toFixed(2)} VPIN=${daTracker.vpinRecursive.toFixed(3)}`);
                gateDiag.ruleOf2++;
                continue;
              }

              // ═══ ALL 4 GATES CONFIRMED — TUNNEL OPENING ═══
              daState.consecutivePassCount = 0;
              gateDiag.passed++;

              const tradePrice = prices.get(tradePair);
              if (!tradePrice) continue;

              daState.lastFireTs = tickTs;

              console.log(`[DAVID-ATLAS] 🎯 TUNNEL STRIKE: ${tunnelDirection.toUpperCase()} ${baseUnits} ${tradePair} | H=${daTracker.hurst.toFixed(3)} E=${efficiencyDA.toFixed(2)} Z=${zOfiDA.toFixed(2)} VPIN=${daTracker.vpinRecursive.toFixed(3)} | 4/4 GATES — NO SL | NO TP | TUNNEL IS LIVE`);

              const daResult = await davidAtlasEnter(tradePair, tunnelDirection, baseUnits, tradePrice);

              if (daResult.success) {
                tunnelFires.push(`${tradePair}:${tunnelDirection}`);

                // Register in exitTradeMap immediately to prevent double-entry
                exitTradeMap.set(tradePair, {
                  id: daResult.tradeId,
                  oanda_trade_id: daResult.tradeId,
                  currency_pair: tradePair,
                  direction: tunnelDirection,
                  entry_price: daResult.fillPrice,
                  created_at: new Date().toISOString(),
                  environment: "live",
                });

                // Audit record
                await supabase.from("gate_bypasses").insert({
                  gate_id: `DAVID_ATLAS_TUNNEL:${tradePair}`,
                  reason: JSON.stringify({
                    strategy: "david-atlas-tunnel-v1",
                    pair: tradePair,
                    direction: tunnelDirection,
                    hurst: daTracker.hurst,
                    efficiency: efficiencyDA,
                    zOfi: zOfiDA,
                    vpin: daTracker.vpinRecursive,
                    fillPrice: daResult.fillPrice,
                    slippage: daResult.slippage,
                    gateState: "4/4",
                    note: "NO_SL_NO_TP — Tunnel protocol. Exit only on 3/4 gate drop.",
                  }),
                  expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
                  created_by: "david-atlas-engine",
                });
              }
            }

            // ═══ ALL OTHER STRATEGIES DEACTIVATED ═══
            // David & Atlas is the SOLE active strategy.
          } catch { /* skip malformed tick */ }
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }

    // ─── 8. Session summary ───
    const slippageSummary: Record<string, { avgSlippage: number; fills: number; switchedToLimit: boolean }> = {};
    for (const [pair, sa] of slippageAudit.entries()) {
      slippageSummary[pair] = {
        avgSlippage: sa.fills > 0 ? Math.round((sa.totalSlippage / sa.fills) * 100) / 100 : 0,
        fills: sa.fills, switchedToLimit: sa.switchedToLimit,
      };
    }

    // ─── O(1) Recursive Snapshot: read directly from tracker state (no recomputation) ───
    const ofiSnapshot: Record<string, unknown> = {};
    let hiddenPlayerAlerts = 0;
    let absorbingPairs = 0;
    let slippingPairs = 0;
    for (const [pair, tracker] of ofiTrackers.entries()) {
      if (tracker.tickCount < 10) continue;

      // All values are already computed recursively — just read state
      const ofiNorm = Math.tanh(tracker.ofiRecursive / 100);
      const sqrtD2 = Math.sqrt(Math.abs(tracker.D2));
      const driftNorm = sqrtD2 > 1e-10 ? tracker.D1 / sqrtD2 : 0;
      const totalTicks = tracker.runningBuys + tracker.runningSells;
      const ofiRatio = totalTicks > 0 ? (tracker.runningBuys - tracker.runningSells) / totalTicks : 0;

      // Efficiency ratio — same fix as processOfiTick: E = (absOfi/pipMult) / (absD1 + ε)
      // Dimensionless ratio in price-velocity space. Previously used pipMult² scaling → always ~0 → always ABSORBING.
      const absD1 = Math.abs(tracker.D1);
      const absOfi = Math.abs(tracker.ofiRecursive);
      const snapPipMult = pair.includes("JPY") ? 100 : 10000;
      const ofiInPriceVel = absOfi / snapPipMult;   // price·tps units
      const efficiency = ofiInPriceVel / (absD1 + EFFICIENCY_EPSILON);
      const marketState = classifyMarketState(efficiency);

      if (marketState === "ABSORBING") absorbingPairs++;
      if (marketState === "SLIPPING") slippingPairs++;

      // Recursive VPIN — just read the O(1) state
      const vpin = tracker.vpinRecursive;

      // Hidden player
      const hidden = detectHiddenLimitPlayer(tracker.ofiRecursive, tracker.D1, efficiency, marketState);
      if (hidden.detected) hiddenPlayerAlerts++;

      // Depth & S/R from persistence map
      const depth = Array.from(tracker.priceLevels.entries())
        .filter(([, info]) => info.hits >= 2)
        .map(([price, d]) => ({
          price: +price.toFixed(5), buys: d.buys, sells: d.sells,
          net: d.buys - d.sells, hits: d.hits, bounces: d.bounces, broken: d.broken,
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 10);

      const srLevels: { price: number; strength: number; type: string }[] = [];
      for (const [price, info] of tracker.priceLevels.entries()) {
        if (info.bounces >= 2 && !info.broken) {
          srLevels.push({
            price: +price.toFixed(5),
            strength: info.bounces * info.hits,
            type: info.sells > info.buys ? "SUPPORT" : "RESISTANCE",
          });
        }
      }
      srLevels.sort((a, b) => b.strength - a.strength);

      // Hurst regime
      const hurstRegime = tracker.hurst > HURST_PERSISTENCE_THRESHOLD ? "PERSISTENT" :
        tracker.hurst < HURST_MEANREV_THRESHOLD ? "MEAN_REVERTING" : "RANDOM_WALK";

      ofiSnapshot[pair.replace("_", "/")] = {
        ofiRatio: Math.round(ofiRatio * 1000) / 1000,
        ofiWeighted: Math.round(ofiNorm * 1000) / 1000,
        ofiRawRecursive: Math.round(tracker.ofiRecursive * 100) / 100,
        zOfi: Math.round(tracker.zOfi * 1000) / 1000,
        vpin: Math.round(vpin * 1000) / 1000,
        buyPct: Math.round(tracker.ewmaBuyPct * 100),
        sellPct: Math.round(tracker.ewmaSellPct * 100),
        bias: ofiNorm > OFI_IMBALANCE_THRESHOLD ? "BUY" : ofiNorm < -OFI_IMBALANCE_THRESHOLD ? "SELL" : "NEUTRAL",
        ticksAnalyzed: tracker.tickCount,
        syntheticDepth: depth,
        kramersMoyal: {
          D1: Math.round(tracker.D1 * 1e8) / 1e8,
          D2: Math.round(tracker.D2 * 1e12) / 1e12,
          driftNormalized: Math.round(driftNorm * 1000) / 1000,
          alphaAdaptive: Math.round(tracker.alpha * 10000) / 10000,
          sampleSize: tracker.tickCount,
        },
        hurst: {
          H: Math.round(tracker.hurst * 1000) / 1000,
          regime: hurstRegime,
        },
        efficiency: Math.round(efficiency * 1000) / 1000,
        marketState,
        hiddenPlayer: hidden.detected ? {
          type: hidden.type,
          force: hidden.force,
          velocity: hidden.velocity,
          divergence: hidden.divergence,
          efficiency: hidden.efficiency,
          marketState: hidden.marketState,
          recommendation: hidden.recommendation,
        } : null,
        resistanceLevels: srLevels.slice(0, 5),
      };
    }

    // Persist synthetic book snapshot
    if (Object.keys(ofiSnapshot).length > 0) {
      await supabase.from("sovereign_memory").upsert({
        memory_type: "ofi_synthetic_book",
        memory_key: "latest_snapshot",
        payload: {
          version: "david-atlas-v1",
          pairs: ofiSnapshot,
          pairsCount: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          ticksProcessed: tickCount,
          streamDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          architecture: "O(1)_recursive_david_atlas",
          decayFactors: { kmAlphaRange: [KM_ALPHA_MIN, KM_ALPHA_MAX], ofiGamma: OFI_GAMMA_DEFAULT },
          gates: ["1:HURST≥0.62", "2:EFFICIENCY≥2.0", "3:|Z-OFI|≥1.0", "4:VPIN≥0.40"],
          strategy: "david-atlas-tunnel-v1",
          capabilities: [
            "david_atlas_tunnel", "rule_of_2_verification",
            "adaptive_km_gear_shift", "welford_z_ofi", "hall_wood_hurst",
            "recursive_kramers_moyal", "recursive_vpin_ewma",
            "efficiency_ratio_E", "market_state_classification",
            "hidden_limit_detection", "price_level_persistence",
            "mandatory_gate_flush_exit", "no_sl_no_tp_tunnel",
          ],
        },
        relevance_score: hiddenPlayerAlerts > 0 ? 1.0 : 0.8,
        created_by: "ripple-stream-david-atlas-v1",
      }, { onConflict: "memory_type,memory_key" });
    }

    const totalMs = Date.now() - startTime;
    console.log(`[DAVID-ATLAS] 📊 Session: ${totalMs}ms, ${tickCount} ticks | Tunnels opened: ${tunnelFires.length} | Tunnel exits (gate flush): ${tunnelExits.length} | OFI pairs: ${Object.keys(ofiSnapshot).length}`);
    console.log(`[DAVID-ATLAS-DIAG] 📊 FINAL: Scans=${gateDiag.total} | Density=${gateDiag.density} Warmup=${gateDiag.warmup} Hurst=${gateDiag.hurst} Eff=${gateDiag.efficiency} ZOfi=${gateDiag.zofi} VPIN=${gateDiag.vpin} R2=${gateDiag.ruleOf2} | TUNNELS_OPENED=${gateDiag.passed}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "david-atlas-v1",
        strategy: "david-atlas-tunnel",
        activeStrategies: ["david-atlas"],
        deactivated: ["predatory-hunter", "ghost-vacuum", "velocity-gating", "snapback-sniper"],
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        davidAtlas: {
          tunnelsOpened: tunnelFires.length,
          tunnelPairs: tunnelFires,
          tunnelExits: tunnelExits.length,
          tunnelExitPairs: tunnelExits,
          gates: {
            hurst: DA_HURST_MIN,
            efficiency: DA_EFFICIENCY_MIN,
            zOfi: DA_ZOFI_MIN,
            vpinMin: DA_VPIN_MIN,
            ruleOf2: DA_RULE_OF_2,
            exitScanMs: EXIT_SCAN_INTERVAL_MS,
          },
          protocol: "4/4_gates=ENTER | any_gate_drop=MANDATORY_FLUSH | no_sl | no_tp",
        },
        syntheticBook: {
          version: "david-atlas-v1",
          architecture: "O(1)_recursive",
          pairsTracked: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          snapshot: ofiSnapshot,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[DAVID-ATLAS] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
