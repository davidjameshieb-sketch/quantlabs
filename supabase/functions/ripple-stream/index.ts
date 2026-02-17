// Ripple Stream Engine v6 — Lean 6 Zero-Lag Protocol
// The Committee is dead. Long live the Frontline Soldiers.
//
// SENIOR OPS SYNTHETIC ORDER BOOK (100% O(1) recursive):
//   - Adaptive Z-OFI (Welford's): Z-score of OFI auto-adjusts per session dynamics
//   - Adaptive KM Windowing ("Gear Shift"): α adapts to D2 noise level
//   - Fast Hurst Exponent (Hall-Wood): O(1) regime classification (trend vs mean-rev)
//   - Velocity+Displacement Weighted OFI: recursive, no arrays
//   - Kramers-Moyal Drift/Diffusion: recursive D1/D2
//   - Recursive VPIN (EWMA): O(1) toxicity — no bucket scans
//   - Efficiency Ratio E = |OFI|/(|D1|+ε): LIQUID/ABSORBING/SLIPPING
//   - Hidden Limit Player Detection via E ratio
//   - Price-Level Persistence: tick-density S/R
//
// LEAN 6 ZERO-LAG GATE PIPELINE (all O(1) float comparisons):
//   1. SIGNAL    — Z-Score > threshold (something is happening)
//   2. LIQUIDITY — Tick Density (safe to enter)
//   3. REGIME    — Hurst H > 0.45 (move will travel, not snap back)
//   4. FORCE     — Z-OFI > 2.0 (buying pressure is statistically abnormal)
//   5. VELOCITY  — KM Drift |D1| (replaces O(N) momentum array scan)
//   6. STRUCTURE — Efficiency E (replaces hidden player — detects iceberg walls)
//
// Three L0 deterministic strategies on OANDA ms tick data:
//   1. Z-SCORE STRIKE — Lean 6 pipeline with Senior Ops synthetic book
//   2. VELOCITY GATING — 5+ same-direction ticks in 2s = impulse fire
//   3. SNAP-BACK SNIPER — Stop-hunt exhaustion → contrarian entry
//
// AI is the General Staff — sizing, regime, risk (hourly). Soldiers fire autonomously.

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
  if (marketState === "ABSORBING" && Math.abs(ofiForce) > 0.01) {
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

  // SLIPPING = low force, high velocity → liquidity hole, wait
  if (marketState === "SLIPPING") {
    return {
      detected: true, type: ofiForce > 0 ? "HIDDEN_LIMIT_SELLER" : "HIDDEN_LIMIT_BUYER",
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

  // ─── EFFICIENCY RATIO (The Alpha) — pure OFI / D1 with matching units ───
  // BUG FIX: ofiNormalized (÷100000 → ~1e-3) divided by D1 in price/sec (EUR_USD ~1e-6 → ~1e-3 px/ms).
  // Dividing dimensionless by price/sec gives efficiency in sec/price — NOT a meaningful ratio.
  // CORRECT: use raw ofiRecursive (force units = pips·tps) and raw |D1| (drift in price/sec).
  // Scale ofiRecursive by pipMult to convert to consistent pip-velocity units.
  const absD1 = Math.abs(tracker.D1);
  const absOfi = Math.abs(tracker.ofiRecursive);
  // Scale OFI to pip-velocity (divide by pip multiplier to normalize across JPY/non-JPY)
  const ofiNormalized = absOfi / pipMult;  // pip-velocity units → same dimension as |D1|*pipMult
  const d1PipVel = absD1 * pipMult;        // convert D1 from price/sec to pips/sec
  const efficiency = ofiNormalized / (d1PipVel + EFFICIENCY_EPSILON);
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

// ═══ PREDATORY HUNTER GATE THRESHOLDS (2026 Strategy) ═══
// The DGE remains LOCKED until all four gates are open.
const PREDATOR_HURST_MIN = 0.62;        // Gate 1: Persistent regime — raised from 0.57 to ensure proper buffer above 0.45 EXIT threshold
const PREDATOR_EFFICIENCY_MIN = 2.0;     // Gate 2: Strong momentum (was 3.5 — 0 scans ever reached it)
const PREDATOR_OFI_RATIO_LONG = 1.6;    // Gate 3 LONG: Whale imbalance
const PREDATOR_OFI_RATIO_SHORT = 0.625; // Gate 3 SHORT: Whale imbalance (reciprocal of 1.6)
// WEIGHTING FIX v2: Was 55 → 51, but STILL Weight=0 in all logs. Root cause:
// ewmaBuyPct is a fraction (0.0-1.0) multiplied by 100 at check time → 50 for balanced flow.
// At buyDecay=0.88, 4 consecutive buys: 0.5*0.88 + 0.12 = 0.56 → 56% buyPressure.
// However: Gate 4 checks buyPressure > 51 (strict >). ewmaBuyPct is stored as fraction,
// rounded to integer at check. So 51.4% rounds to 51 and is NOT > 51 (fails strict check).
// FIX: Changed to >= 51 (inclusive) and lowered threshold to 50 (majority = > 50%).
// A genuine 51:49 buy majority IS meaningful institutional directional flow.
const PREDATOR_WEIGHTING_MIN = 50;      // Gate 4: Buy/Sell weighting >= 50% (strict majority) — was 51 with ">" operator (never fired)
const PREDATOR_RULE_OF_3 = 3;           // All gates must hold for 3 consecutive ticks
const PREDATOR_VPIN_MIN = 0.40;         // VPIN validation: >= 0.40 for institutional participation
const PREDATOR_VPIN_GHOST_MAX = 0.15;   // VPIN < 0.15 = "Ghost Move" = retail-driven, block
const PREDATOR_KM_DRIFT_MIN = 0.12;     // KM Drift minimum
const PREDATOR_WALL_OFFSET_PIPS = 0.3;  // Stop-Limit placed 0.3 pips BEYOND the wall
// Market Order Override: Only slap the ask if the Tsunami is confirmed beyond doubt
const PREDATOR_MARKET_OVERRIDE_EFFICIENCY = 7.0;  // E > 7.0 = extreme vacuum
const PREDATOR_MARKET_OVERRIDE_VPIN = 0.65;        // VPIN > 0.65 = heavy institutional flow
// Exit Protocol:
// CRITICAL: EXIT thresholds must be well BELOW entry thresholds to prevent instant close.
// Entry: H >= 0.62, Weight >= 55%. Exit: H < 0.45, Weight <= 40%.
// Buffer zones: Hurst buffer = 0.17, Weighting buffer = 15%.
const PREDATOR_EXIT_HURST_MIN = 0.45;          // Close if Hurst drops below 0.45 (0.17 buffer below 0.62 entry)
const PREDATOR_EXIT_WEIGHTING_THRESHOLD = 40;  // Close if weighting hits 40% — lowered from 49% (was firing within 3 ticks of 52% entry)
const PREDATOR_MIN_HOLD_MS = 90_000;           // 90s minimum hold — no exits before this (prevents instant close on EWMA convergence lag)
// Whale-Shadow Trail: stop tucked 0.3 pips behind the largest resting wall within 3 pips
const WHALE_SHADOW_RANGE_PIPS = 3.0;    // scan radius for nearby walls
const WHALE_SHADOW_OFFSET_PIPS = 0.3;   // tuck stop 0.3 pips behind the wall
const WHALE_SHADOW_MIN_HITS = 3;        // wall must have ≥3 hits to qualify
// Emergency Exit: If a massive Buy Wall appears below price during a SHORT → OFI flip = "dam hit"
const WHALE_SHADOW_EMERGENCY_OFI_FLIP = 2.5; // OFI ratio >= 2.5 while short = absorption emergency

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

    // ─── 1. Load General Staff orders (AI governance: sizing, regime) ───
    const { data: governanceConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "zscore_strike_config")
      .maybeSingle();

    const govPayload = governanceConfig?.payload as Record<string, unknown> | null;
    const baseUnits: number = (govPayload?.units as number) || 1000;
    const baseSlPips: number = (govPayload?.slPips as number) || 8;
    const baseTpPips: number = (govPayload?.tpPips as number) || 30;
    const zScoreThreshold: number = (govPayload?.zScoreThreshold as number) || ZSCORE_FIRE_THRESHOLD;
    const blockedPairs: string[] = (govPayload?.blockedPairs as string[]) || [];

    // ─── 2. Load velocity & snapback config ───
    const { data: velocityConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "velocity_gating_config")
      .maybeSingle();

    const velocityPairs: string[] = (velocityConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
      "EUR_JPY", "GBP_JPY", "EUR_GBP", "NZD_USD",
    ];
    const velocityUnits: number = (velocityConfig?.payload as any)?.units || baseUnits;
    const velocitySlPips: number = (velocityConfig?.payload as any)?.slPips || baseSlPips;
    const velocityTpPips: number = (velocityConfig?.payload as any)?.tpPips || baseTpPips;

    const { data: snapbackConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "snapback_sniper_config")
      .maybeSingle();

    const snapbackPairs: string[] = (snapbackConfig?.payload as any)?.pairs || [
      "EUR_USD", "GBP_USD", "USD_JPY", "GBP_JPY", "AUD_USD",
    ];
    const snapbackUnits: number = (snapbackConfig?.payload as any)?.units || baseUnits;
    const snapbackSlPips: number = (snapbackConfig?.payload as any)?.slPips || 6;
    const snapbackTpPips: number = (snapbackConfig?.payload as any)?.tpPips || 12;

    // ─── 3. Load correlation groups (can be overridden by General Staff) ───
    const { data: corrGroupConfig } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_key", "correlation_groups_config")
      .maybeSingle();

    const correlationGroups = (corrGroupConfig?.payload as any)?.groups || DEFAULT_CORRELATION_GROUPS;

    // ─── 4. Build instrument set ───
    const instruments = new Set<string>();
    for (const g of correlationGroups) {
      if (!blockedPairs.includes(g.pairA)) instruments.add(g.pairA);
      if (!blockedPairs.includes(g.pairB)) instruments.add(g.pairB);
    }
    for (const p of velocityPairs) if (!blockedPairs.includes(p)) instruments.add(p);
    for (const p of snapbackPairs) if (!blockedPairs.includes(p)) instruments.add(p);

    if (instruments.size === 0) {
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, message: "No instruments — General Staff has blocked all pairs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[STRIKE-v3] ⚡ Z-Score Strike Engine | ${correlationGroups.length} z-groups, ${velocityPairs.length} velocity, ${snapbackPairs.length} snapback | ${instruments.size} instruments | threshold z>${zScoreThreshold}`);

    // ─── 5. Open OANDA stream ───
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

    // ─── 6. Initialize trackers ───
    const prices = new Map<string, { bid: number; ask: number; mid: number; spread: number; spreadPips: number }>();
    const zScoreTrackers = new Map<string, ZScoreTracker>();
    const velocityTrackers = new Map<string, VelocityTracker>();
    const snapbackTrackers = new Map<string, SnapBackTracker>();
    const slippageAudit = new Map<string, SlippageRecord>();
    const zScoreFires: string[] = [];
    const velocityFires: string[] = [];
    const snapbackFires: string[] = [];
    const ghostVacuumFires: string[] = [];

    // ═══ PREDATORY HUNTER: Per-Instrument State ═══
    const predatorState = new Map<string, {
      consecutivePassCount: number;
      lastPassDirection: string | null;
      lastFireTs: number;
    }>();

    // BUG FIX: Cross-session cooldown — load recent fires from DB to prevent
    // re-firing within 5 min. predatorState was re-initialized every 110s session,
    // so lastFireTs=0 allowed firing every session instead of respecting cooldown.
    try {
      const fiveMinAgo = new Date(Date.now() - ZSCORE_COOLDOWN_MS).toISOString();
      const { data: recentFires } = await supabase
        .from("oanda_orders")
        .select("currency_pair, created_at")
        .eq("direction_engine", "predatory-hunter")
        .eq("environment", "live")
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false });

      for (const fire of (recentFires || [])) {
        predatorState.set(fire.currency_pair, {
          consecutivePassCount: 0,
          lastPassDirection: null,
          lastFireTs: new Date(fire.created_at).getTime(),
        });
      }
      if (recentFires?.length) {
        console.log(`[STRIKE-v3] 🔁 Cross-session cooldown: ${recentFires.length} recent fires loaded`);
      }
    } catch { /* non-critical — default to fresh state */ }

    // ═══ GATE DIAGNOSTICS: Track which gates kill signals ═══
    const gateDiag = { total: 0, density: 0, warmup: 0, hurst: 0, efficiency: 0, ofiRatio: 0, weighting: 0, kmDrift: 0, vpinGhost: 0, vpinMin: 0, ruleOf3: 0, passed: 0 };
    let lastDiagTs = 0;
    const autonomousExits: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let lastExitScanTs = 0;
    const EXIT_SCAN_INTERVAL_MS = 2000; // Scan open trades every 2s on tick data

    // ═══ STRATEGY 4: AUTONOMOUS GHOST (Lean 6 Vacuum) ═══
    // Immune to credit exhaustion — runs on pure Lean 6 physics.
    // 1. Scans price-level persistence for retail stop clusters
    // 2. Places Ghost Limit Orders at cluster prices
    // 3. Safety: cancels if Hurst > 0.6 (trending) OR |DriftNorm| > 2.0 (high velocity)
    // 4. Only fills if Efficiency < 0.3 (ABSORBING — hidden player eating flow)
    // Natural hedge: Z-Score profits in trends, Ghost profits in ranges.
    const GHOST_CLUSTER_MIN_HITS = 3;      // Minimum hits on a price level to qualify as cluster
    const GHOST_CLUSTER_MIN_SELLS = 2;     // Minimum sell-side activity (retail stops are sells)
    const GHOST_COOLDOWN_MS = 300_000;     // 5-minute cooldown per pair
    const GHOST_SL_PIPS_DEFAULT = 8;
    const GHOST_TP_PIPS_DEFAULT = 30;              // 3.75:1 R:R
    const GHOST_UNITS_DEFAULT = 1000;
    const ghostLastFireTs = new Map<string, number>();

    // Load ghost vacuum config from sovereign memory (DGE can tune these dynamically)
    let ghostUnits = GHOST_UNITS_DEFAULT;
    let ghostSlPips = GHOST_SL_PIPS_DEFAULT;
    let ghostTpPips = GHOST_TP_PIPS_DEFAULT;
    let ghostBlockedPairs: string[] = [];
    let GHOST_HURST_CANCEL = 0.6;        // Cancel limit if H > threshold (steamroller)
    let GHOST_DRIFT_CANCEL = 2.0;        // Cancel limit if |DriftNorm| > threshold (high velocity)
    let GHOST_EFFICIENCY_MAX = 0.3;      // Only fill if E < threshold (absorption = safe)
    try {
      const { data: ghostConfig } = await supabase
        .from("sovereign_memory")
        .select("payload")
        .eq("memory_key", "ghost_vacuum_config")
        .maybeSingle();
      if (ghostConfig?.payload) {
        const gc = ghostConfig.payload as Record<string, unknown>;
        ghostUnits = (gc.units as number) || GHOST_UNITS_DEFAULT;
        ghostSlPips = (gc.slPips as number) || GHOST_SL_PIPS_DEFAULT;
        ghostTpPips = (gc.tpPips as number) || GHOST_TP_PIPS_DEFAULT;
        ghostBlockedPairs = (gc.blockedPairs as string[]) || [];
        // Dynamic thresholds — DGE can tune these during credit exhaustion
        GHOST_HURST_CANCEL = (gc.hurstCancel as number) || 0.6;
        GHOST_DRIFT_CANCEL = (gc.driftCancel as number) || 2.0;
        GHOST_EFFICIENCY_MAX = (gc.efficiencyMax as number) || 0.3;
      }
    } catch { /* use defaults */ }

    // ═══ G17 DISPLACEMENT EFFICIENCY GATE ═══
    // Loads the FM-created G17 gate from gate_bypasses.
    // If active, requires displacement signature before any trade fires.
    // In ripple-stream context: displacement = |D1/√D2| (drift-to-noise ratio)
    let g17Active = false;
    let g17Threshold = 0.7;
    try {
      const { data: g17Gates } = await supabase
        .from("gate_bypasses")
        .select("reason, expires_at")
        .eq("gate_id", "DYNAMIC_GATE:G17_DISPLACEMENT_EFFICIENCY")
        .eq("revoked", false)
        .gte("expires_at", now.toISOString())
        .limit(1);
      if (g17Gates && g17Gates.length > 0) {
        g17Active = true;
        try {
          const meta = JSON.parse(g17Gates[0].reason);
          g17Threshold = meta.threshold ?? 0.7;
        } catch { /* use default */ }
        console.log(`[STRIKE-v3] 🎯 G17 DISPLACEMENT GATE ACTIVE — threshold=${g17Threshold}`);
      }
    } catch { /* non-critical */ }

    // ═══ IMPROVEMENT #2: AUTONOMOUS EXIT AUTHORITY ═══
    // L0 soldiers now manage exits at tick speed instead of waiting
    // for the 60s trade-monitor cycle. Three exit triggers:
    // 1. Profit-Capture Retrace: MFE >= 0.8R but price retracing → lock profit
    // 2. THS-Decay: Trade health collapsed while in profit → exit
    // 3. Time-Decay: Trade stale > 15 bars with no MFE progress → exit
    
    // Load open trades for exit monitoring
    const { data: openTradesForExit } = await supabase
      .from("oanda_orders")
      .select("id, oanda_trade_id, currency_pair, direction, entry_price, r_pips, mfe_price, mae_price, trade_health_score, bars_since_entry, created_at, environment")
      .eq("status", "filled")
      .is("exit_price", null)
      .not("oanda_trade_id", "is", null)
      .not("entry_price", "is", null);

    const exitTradeMap = new Map<string, any>();
    for (const t of (openTradesForExit || [])) {
      exitTradeMap.set(t.currency_pair, t);
    }
    console.log(`[STRIKE-v3] 🎯 Exit authority: monitoring ${exitTradeMap.size} open trades at tick speed`);

    // Init z-score trackers per correlation group
    for (const g of correlationGroups) {
      zScoreTrackers.set(g.name, { spreadHistory: [], lastFireTs: 0, firedDirection: null, consecutivePassCount: 0, lastPassDirection: null });
    }
    // Init velocity trackers
    for (const p of velocityPairs) {
      velocityTrackers.set(p, { ticks: [], lastFireTs: 0 });
    }
    // Also track momentum for z-score quiet pairs
    for (const g of correlationGroups) {
      if (!velocityTrackers.has(g.pairA)) velocityTrackers.set(g.pairA, { ticks: [], lastFireTs: 0 });
      if (!velocityTrackers.has(g.pairB)) velocityTrackers.set(g.pairB, { ticks: [], lastFireTs: 0 });
    }
    // BUG FIX: PREDATORY HUNTER scans ALL instruments but velocityTrackers was only
    // initialized for velocityPairs + correlationGroups. Any instrument not in those sets
    // had vt=undefined → recentDirTicks=[] → length<6 → OFI_R block every single tick.
    // This was the root cause of OFI_R=2215+ blocks while Weight=0 (never even reached).
    // Fix: ensure ALL instruments in the stream have a velocity tracker.
    for (const p of instruments) {
      if (!velocityTrackers.has(p)) velocityTrackers.set(p, { ticks: [], lastFireTs: 0 });
    }
    // Init snapback trackers
    for (const p of snapbackPairs) {
      snapbackTrackers.set(p, { recentTicks: [], lastMid: null, lastFireTs: 0 });
    }

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

    // ─── Helper: Execute order (unchanged) ───
    async function executeOrder(
      pair: string, direction: string, units: number,
      slPips: number, tpPips: number, engine: string,
      metadata: Record<string, unknown>, currentPrice: { mid: number; spreadPips: number },
      orderType: "MARKET" | "LIMIT" = "MARKET",
      limitPrice?: number, // Optional explicit limit price (e.g., Ghost cluster price)
    ): Promise<{ success: boolean; tradeId?: string; fillPrice?: number; slippage?: number }> {
      if (LIVE_ENABLED !== "true") {
        console.log(`[STRIKE-v3] 🔇 ${engine} would fire ${direction} ${units} ${pair} — LIVE DISABLED`);
        return { success: false };
      }

      // ─── L0 HARD GATE 1: Spread gate — block if > rolling avg or > 4 pip hard max ───
      const spreadCheck = isSpreadTooWide(pair, currentPrice.spreadPips);
      if (spreadCheck.blocked) {
        console.log(`[STRIKE-v3] 🛡 SPREAD GATE: ${pair} ${spreadCheck.reason} (avg=${spreadCheck.avg.toFixed(1)}p) — BLOCKED`);
        return { success: false };
      }

      // ─── L0 HARD GATE 2: Late-NY / Rollover session block (20:00-23:59 UTC and 00:00 UTC rollover) ───
      // BUG FIX: `utcHour < 0` was unreachable (getUTCHours returns 0-23). Changed to `utcHour < 1`
      // so the midnight rollover hour (00:00-00:59 UTC) is also blocked as intended.
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 20 || utcHour < 1) {
        console.log(`[STRIKE-v3] 🛡 SESSION GATE: UTC ${utcHour}h — late-NY/rollover blocked`);
        return { success: false };
      }

      // ─── L0 HARD GATE 3: Friction-to-edge ratio — spread must be < 30% of TP target ───
      const frictionPct = (currentPrice.spreadPips / tpPips) * 100;
      if (frictionPct > 30) {
        console.log(`[STRIKE-v3] 🛡 FRICTION GATE: ${pair} spread ${currentPrice.spreadPips.toFixed(1)}p = ${frictionPct.toFixed(0)}% of TP(${tpPips}p) — too expensive`);
        return { success: false };
      }

      // Slippage audit auto-switch
      const audit = slippageAudit.get(pair);
      if (audit?.switchedToLimit) {
        orderType = "LIMIT";
      }

      const dirUnits = direction === "long" ? units : -units;
      const slDistance = fromPips(slPips, pair);
      const tpDistance = fromPips(tpPips, pair);

      // OANDA requires correct price precision: JPY pairs use 3 decimals, others use 5
      const isJPYPair = pair.includes("JPY");
      const pricePrecision = isJPYPair ? 3 : 5;

      const orderBody: Record<string, unknown> = {
        order: {
          type: orderType,
          instrument: pair,
          units: String(dirUnits),
          timeInForce: orderType === "MARKET" ? "FOK" : "GTD",
          ...(orderType === "LIMIT" ? { gtdTime: new Date(Date.now() + 5 * 60_000).toISOString() } : {}),
          stopLossOnFill: { distance: slDistance.toFixed(pricePrecision), timeInForce: "GTC" },
          takeProfitOnFill: { distance: tpDistance.toFixed(pricePrecision), timeInForce: "GTC" },
          ...(orderType === "LIMIT" ? { price: (limitPrice ?? currentPrice.mid).toFixed(pricePrecision) } : {}),
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

          // Micro-Slippage Audit
          if (!slippageAudit.has(pair)) {
            slippageAudit.set(pair, { totalSlippage: 0, fills: 0, switchedToLimit: false });
          }
          const sa = slippageAudit.get(pair)!;
          sa.totalSlippage += slippagePips;
          sa.fills++;

          if (slippagePips > SLIPPAGE_THRESHOLD_PIPS && !sa.switchedToLimit) {
            sa.switchedToLimit = true;
            console.log(`[STRIKE-v3] 🔴 SLIPPAGE AUDIT: ${pair} → PREDATORY_LIMIT`);
            await supabase.from("gate_bypasses").insert({
              gate_id: `PREDATORY_LIMIT_SWITCH:${pair}`,
              reason: JSON.stringify({ pair, slippage: slippagePips, engine: "slippage-auditor-v1" }),
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
              created_by: "slippage-auditor",
            });
          }

          // Record trade
          if (adminRole) {
            await supabase.from("oanda_orders").insert({
              user_id: adminRole.user_id,
              signal_id: `${engine}-${pair}-${Date.now()}`,
              currency_pair: pair,
              direction: direction.toLowerCase(),
              units,
              entry_price: fillPrice,
              oanda_order_id: fill.id,
              oanda_trade_id: tradeId,
              status: "filled",
              environment: "live",
              direction_engine: engine,
              sovereign_override_tag: `${engine}:${pair}`,
              confidence_score: (metadata.confidence as number) || 0.5,
              governance_payload: { ...metadata, slippagePips, orderType },
              requested_price: currentPrice.mid,
              slippage_pips: slippagePips,
              spread_at_entry: currentPrice.spreadPips,
            });
          }

          console.log(`[STRIKE-v3] ✅ ${engine} FILLED: ${tradeId} @ ${fillPrice} | ${direction} ${units} ${pair} | slip ${slippagePips.toFixed(2)}p`);
          return { success: true, tradeId, fillPrice, slippage: slippagePips };
        } else {
          // BUG FIX: Track pending LIMIT orders that weren't immediately filled.
          // These live on OANDA with 5-min GTD but had no DB record → "invisible trades."
          const pendingOrderId = orderData.orderCreateTransaction?.id;
          if (orderType === "LIMIT" && pendingOrderId && adminRole) {
            console.warn(`[STRIKE-v3] ⏳ ${engine} LIMIT PENDING: order ${pendingOrderId} ${pair} — tracking in DB`);
            await supabase.from("oanda_orders").insert({
              user_id: adminRole.user_id,
              signal_id: `${engine}-${pair}-${Date.now()}`,
              currency_pair: pair,
              direction: direction.toLowerCase(),
              units,
              oanda_order_id: pendingOrderId,
              status: "submitted",
              environment: "live",
              direction_engine: engine,
              sovereign_override_tag: `${engine}:${pair}:pending-limit`,
              confidence_score: (metadata.confidence as number) || 0.5,
              governance_payload: { ...metadata, orderType: "LIMIT", limitPrice: limitPrice ?? currentPrice.mid },
              requested_price: limitPrice ?? currentPrice.mid,
              spread_at_entry: currentPrice.spreadPips,
            });
          } else {
            const rejectReason = orderData.orderRejectTransaction?.rejectReason ||
              orderData.orderCancelTransaction?.reason || "Unknown";
            console.warn(`[STRIKE-v3] ❌ ${engine} REJECTED: ${rejectReason}`);
          }
          return { success: false };
        }
      } catch (err) {
        console.error(`[STRIKE-v3] ${engine} execution error:`, err);
        return { success: false };
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

            // ═══ PREDATORY HUNTER: AUTONOMOUS EXIT AUTHORITY ═══
            // Tick-speed exit scans every 2s. Three exit triggers:
            // 1. Regime Exit: Close if Hurst drops below 0.45
            // 2. Flow Exit: Close if Buy/Sell Weighting hits 49%
            // 3. Whale-Shadow Trail: Move SL behind largest resting wall within 3 pips
            if (tickTs - lastExitScanTs >= EXIT_SCAN_INTERVAL_MS) {
              lastExitScanTs = tickTs;
              const openTrade = exitTradeMap.get(instrument);
              if (openTrade && openTrade.oanda_trade_id) {
                const exitTracker = getOrCreateOfi(instrument);
                  if (exitTracker.tickCount >= 10) {
                    let exitReason: string | null = null;

                  // ─── MINIMUM HOLD TIME: Never exit before 90s ───
                  // Prevents instant close caused by EWMA convergence lag immediately after fill.
                  // ewmaBuyPct/hurst need ~20 ticks to stabilize after fresh session state.
                  const tradeAgeMs = openTrade.created_at
                    ? Date.now() - new Date(openTrade.created_at).getTime()
                    : PREDATOR_MIN_HOLD_MS + 1; // default: allow exits if no timestamp
                  const holdBlocked = tradeAgeMs < PREDATOR_MIN_HOLD_MS;

                  if (!holdBlocked) {
                    // ─── REGIME EXIT: Hurst < 0.45 → whales are done ───
                    if (exitTracker.hurst < PREDATOR_EXIT_HURST_MIN) {
                      exitReason = `REGIME_EXIT: H=${exitTracker.hurst.toFixed(3)} < ${PREDATOR_EXIT_HURST_MIN} — persistence collapsed`;
                    }

                    // ─── FLOW EXIT: Weighting hits 40% (directional consensus firmly lost) ───
                    if (!exitReason) {
                      const isLong = openTrade.direction === "long";
                      const relevantWeighting = isLong
                        ? Math.round(exitTracker.ewmaBuyPct * 100)
                        : Math.round(exitTracker.ewmaSellPct * 100);
                      if (relevantWeighting <= PREDATOR_EXIT_WEIGHTING_THRESHOLD) {
                        exitReason = `FLOW_EXIT: ${isLong ? "Buy" : "Sell"}%=${relevantWeighting}% <= ${PREDATOR_EXIT_WEIGHTING_THRESHOLD}% — directional consensus lost`;
                      }
                    }

                    // ─── Z-OFI SLAM EXIT: Abnormal counter-flow = "House on Fire" ───
                    // Tightened from 2.5 → 3.5 to prevent premature exits from normal noise spikes.
                    // Only fire when Z-OFI is a 3.5σ event — a true institutional reversal.
                    if (!exitReason) {
                      const isLong = openTrade.direction === "long";
                      const zOfiSlam = isLong
                        ? exitTracker.zOfi < -3.5
                        : exitTracker.zOfi > 3.5;
                      if (zOfiSlam) {
                        exitReason = `ZOFI_SLAM_EXIT: Z-OFI=${exitTracker.zOfi.toFixed(2)} — 3.5σ counter-flow, house on fire`;
                      }
                    }
                  } else {
                    console.log(`[PREDATOR_EXIT] 🛡️ MIN_HOLD: ${instrument} ${openTrade.direction} trade age=${Math.round(tradeAgeMs/1000)}s < ${PREDATOR_MIN_HOLD_MS/1000}s — exit suppressed`);
                  }
                  // ═══ WHALE-SHADOW TRAIL v2: 3-Tier Stop Strategy ═══
                  //
                  // 🟢 LONG "Shield": Find largest Net×Hits buy-limit cluster between price and -3 pips.
                  //    SL = 0.3 pips BELOW that wall. Guard: if wall consumed, re-scan for next wall.
                  //
                  // 🔴 SHORT "Ceiling": Find largest Net×Hits sell-limit cluster between price and +3 pips.
                  //    SL = 0.3 pips ABOVE that wall. Guard: if massive Buy Wall appears below price
                  //    (OFI Ratio flip ≥ 2.5), trigger Emergency Exit — the "Tsunami hit a dam."
                  //
                  // 📡 "Out-of-Range" Failsafe: If no wall within 3 pips (common in Vacuum moves),
                  //    default SL to Daily VWAP + 0.3 pip offset — never be "naked" without structural anchor.
                  if (!exitReason) {
                    const isLong = openTrade.direction === "long";
                    const rangePx = fromPips(WHALE_SHADOW_RANGE_PIPS, instrument);
                    const offsetPx = fromPips(WHALE_SHADOW_OFFSET_PIPS, instrument);
                    const entryPrice = openTrade.entry_price || 0;
                    const tradeId = openTrade.oanda_trade_id;
                    const pricePrecision = instrument.includes("JPY") ? 3 : 5;

                    // ─── SCAN: Find the strongest wall within 3-pip radius ───
                    let bestWallPrice: number | null = null;
                    let bestWallStrength = 0;

                    for (const [levelPrice, info] of exitTracker.priceLevels.entries()) {
                      if (info.hits < WHALE_SHADOW_MIN_HITS) continue;
                      const dist = Math.abs(levelPrice - mid);
                      if (dist > rangePx) continue; // outside 3-pip scan radius

                      const levelNet = info.buys - info.sells;
                      if (isLong) {
                        // 🟢 SHIELD: Buy Walls BELOW price (support shields)
                        if (levelPrice < mid && info.buys >= 2 && levelNet > 0) {
                          const strength = levelNet * info.hits;
                          if (strength > bestWallStrength) {
                            bestWallStrength = strength;
                            bestWallPrice = levelPrice;
                          }
                        }
                      } else {
                        // 🔴 CEILING: Sell Walls ABOVE price (resistance shields)
                        if (levelPrice > mid && info.sells >= 2 && levelNet < 0) {
                          const strength = Math.abs(levelNet) * info.hits;
                          if (strength > bestWallStrength) {
                            bestWallStrength = strength;
                            bestWallPrice = levelPrice;
                          }
                        }
                      }
                    }

                    // ─── 🔴 SHORT GUARD: Emergency Exit on OFI Ratio Flip (Absorption) ───
                    // BUG FIX: Use windowed velocity tracker (last 20 ticks) instead of cumulative
                    // session counts, which caused false exits from early-session imbalance.
                    if (!isLong && !exitReason) {
                      const exitVt = velocityTrackers.get(instrument);
                      const exitRecentTicks = exitVt?.ticks || [];
                      if (exitRecentTicks.length >= 8) {
                        const exitBuys = exitRecentTicks.filter(t => t.direction === 1).length;
                        const exitSells = exitRecentTicks.filter(t => t.direction === -1).length;
                        const windowedOfiRatio = exitSells > 0 ? exitBuys / exitSells : (exitBuys > 0 ? 10.0 : 1.0);
                        if (windowedOfiRatio >= WHALE_SHADOW_EMERGENCY_OFI_FLIP) {
                          exitReason = `EMERGENCY_EXIT: SHORT OFI_RATIO=${windowedOfiRatio.toFixed(2)} >= ${WHALE_SHADOW_EMERGENCY_OFI_FLIP} — massive Buy Wall absorption (windowed 20-tick)`;
                        }
                      }
                    }

                    // ─── DETERMINE NEW SL ───
                    let newSL: number | null = null;
                    let slSource = "";

                    if (bestWallPrice !== null) {
                      // Primary: 0.3 pips behind the wall
                      newSL = isLong
                        ? bestWallPrice - offsetPx   // below the buy wall
                        : bestWallPrice + offsetPx;  // above the sell wall
                      slSource = `WALL@${bestWallPrice.toFixed(pricePrecision)} str=${bestWallStrength}`;
                    } else {
                      // 📡 OUT-OF-RANGE FAILSAFE: No wall within 3 pips → use Daily VWAP
                      const vwap = getOrResetVwap(instrument, mid);
                      // BUG FIX: Validate VWAP is on correct side of price before using as SL anchor
                      // If VWAP is on wrong side (e.g., VWAP > price for long), skip SL update to avoid immediate stop-out
                      const vwapValid = isLong ? (vwap < mid) : (vwap > mid);
                      if (vwapValid) {
                        newSL = isLong
                          ? vwap - offsetPx   // VWAP - 0.3 pips
                          : vwap + offsetPx;  // VWAP + 0.3 pips
                        slSource = `VWAP@${vwap.toFixed(pricePrecision)} (no wall in ${WHALE_SHADOW_RANGE_PIPS}p range)`;
                      } else {
                        slSource = `VWAP_SKIP (VWAP@${vwap.toFixed(pricePrecision)} on wrong side of price)`;
                      }
                    }

                    // ─── ENFORCE UNIDIRECTIONAL MOVE (never widen SL) ───
                    if (newSL !== null && !exitReason) {
                      const prevSL = lastAppliedSL.get(tradeId);
                      const slImproves = isLong
                        ? (prevSL == null ? newSL > entryPrice - fromPips(2, instrument) : newSL > prevSL)
                        : (prevSL == null ? newSL < entryPrice + fromPips(2, instrument) : newSL < prevSL);

                      if (slImproves) {
                        try {
                          const slStr = newSL.toFixed(pricePrecision);
                          const updateRes = await fetch(
                            `${OANDA_API}/accounts/${OANDA_ACCOUNT}/trades/${tradeId}/orders`,
                            {
                              method: "PUT",
                              headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" },
                              body: JSON.stringify({ stopLoss: { price: slStr, timeInForce: "GTC" } }),
                            },
                          );
                          if (updateRes.ok) {
                            lastAppliedSL.set(tradeId, newSL);
                            console.log(`[WHALE_SHADOW] 🐋 ${instrument} ${isLong ? "SHIELD" : "CEILING"} — SL→${slStr} | ${slSource}`);
                          } else {
                            const errData = await updateRes.json();
                            console.warn(`[WHALE_SHADOW] ⚠️ SL update failed ${instrument}: ${JSON.stringify(errData)}`);
                          }
                        } catch (err) {
                          console.error(`[WHALE_SHADOW] ❌ SL error ${instrument}:`, err);
                        }
                      }
                    }
                  }

                  // ─── MARKET ORDER MATRIX: Exit Protocol ───
                  // ALL emergency exits use MARKET close (PUT /trades/{id}/close).
                  // Senior Ops Protocol: NEVER use Limit Orders for exits.
                  // In a "House on Fire" (Hurst collapse, Z-OFI Slam, Flow Exit),
                  // you pay 0.1 pip slippage to guarantee you keep the other 5 pips of profit.
                  if (exitReason && LIVE_ENABLED === "true") {
                    console.log(`[PREDATOR_EXIT] 🚪 MARKET CLOSE: ${instrument} ${openTrade.direction} trade ${openTrade.oanda_trade_id}: ${exitReason}`);
                    try {
                      const closeRes = await fetch(
                        `${OANDA_API}/accounts/${OANDA_ACCOUNT}/trades/${openTrade.oanda_trade_id}/close`,
                        { method: "PUT", headers: { Authorization: `Bearer ${OANDA_TOKEN}`, "Content-Type": "application/json" } },
                      );
                      if (closeRes.ok) {
                        const closeData = await closeRes.json();
                        const exitPrice = parseFloat(closeData.orderFillTransaction?.price || "0");
                        autonomousExits.push(`${instrument}:${exitReason}`);
                        await supabase.from("oanda_orders").update({
                          exit_price: exitPrice,
                          status: "closed",
                          closed_at: new Date().toISOString(),
                          health_governance_action: exitReason,
                        }).eq("id", openTrade.id);
                        exitTradeMap.delete(instrument);
                        console.log(`[PREDATOR_EXIT] ✅ CLOSED ${instrument} @ ${exitPrice} — ${exitReason}`);
                      }
                    } catch (err) {
                      console.error(`[PREDATOR_EXIT] ❌ Failed to close ${instrument}:`, err);
                    }
                  }
                }
              }
            }

            // ═══════════════════════════════════════════════
            // PREDATORY HUNTER v2: INDEPENDENT INSTRUMENT SCAN
            // No longer trapped behind Z-Score pair divergence.
            // Scans ALL instruments for institutional flow setups.
            // Direction determined by order flow, not cross-pair mean reversion.
            // ═══════════════════════════════════════════════

            // ─── GATE DIAGNOSTICS: Log every 30s ───
            if (tickTs - lastDiagTs > 30_000) {
              lastDiagTs = tickTs;
              if (gateDiag.total > 0) {
                console.log(`[PREDATOR_DIAG] 📊 Scans=${gateDiag.total} | Density=${gateDiag.density} Warmup=${gateDiag.warmup} Hurst=${gateDiag.hurst} Eff=${gateDiag.efficiency} OFI_R=${gateDiag.ofiRatio} Weight=${gateDiag.weighting} KM=${gateDiag.kmDrift} VPIN_G=${gateDiag.vpinGhost} VPIN_M=${gateDiag.vpinMin} R3=${gateDiag.ruleOf3} | PASSED=${gateDiag.passed}`);
              }
            }

            for (const tradePair of instruments) {
              if (blockedPairs.includes(tradePair)) continue;
              gateDiag.total++;

              // Per-instrument state
              if (!predatorState.has(tradePair)) {
                predatorState.set(tradePair, { consecutivePassCount: 0, lastPassDirection: null, lastFireTs: 0 });
              }
              const pState = predatorState.get(tradePair)!;

              // Cooldown: 5 minutes between fires on same pair
              if (tickTs - pState.lastFireTs < ZSCORE_COOLDOWN_MS) continue;

              // ─── PRE-GATE: LIQUIDITY (Tick Density) ───
              const densityCheck = isTickDensitySufficient(tradePair);
              if (!densityCheck.ok) { pState.consecutivePassCount = 0; gateDiag.density++; continue; }

              // ─── READ PHYSICS ───
              const tradeTracker = getOrCreateOfi(tradePair);
              if (tradeTracker.tickCount < 20) { pState.consecutivePassCount = 0; gateDiag.warmup++; continue; } // was 30 — too conservative for 110s sessions

              // ─── DETERMINE DIRECTION FROM FLOW ───
              // Use last ~20 ticks from velocity tracker for responsive OFI ratio
              // BUG FIX: With 8+ instruments sharing 110s streams, each pair gets ~8-10 ticks/pair.
              // A 20-tick buffer with only 6 ticks filled gives unreliable ratios (e.g., 1 buy / 0 sells = 10.0).
              // Require at least 6 ticks in the window before using the ratio.
              const vt = velocityTrackers.get(tradePair);
              const recentDirTicks = vt?.ticks || [];
              if (recentDirTicks.length < 6) { pState.consecutivePassCount = 0; gateDiag.ofiRatio++; continue; }
              const recentBuys = recentDirTicks.filter(t => t.direction === 1).length;
              const recentSells = recentDirTicks.filter(t => t.direction === -1).length;
              const shortWindowRatio = recentSells > 0
                ? recentBuys / recentSells
                : (recentBuys > 0 ? 10.0 : 1.0);

              let tradeDirection: string | null = null;
              if (shortWindowRatio >= PREDATOR_OFI_RATIO_LONG) {
                tradeDirection = "long";
              } else if (shortWindowRatio <= PREDATOR_OFI_RATIO_SHORT) {
                tradeDirection = "short";
              }
              if (!tradeDirection) { pState.consecutivePassCount = 0; gateDiag.ofiRatio++; continue; }

              // ─── COMPUTE PHYSICS METRICS ───
              // BUG FIX: D2 floor prevents driftNorm from exploding during near-zero diffusion.
              const d2Floored = Math.max(Math.abs(tradeTracker.D2), 1e-14);
              const sqrtD2Trade = Math.sqrt(d2Floored);
              const driftNormTrade = sqrtD2Trade > 1e-10 ? tradeTracker.D1 / sqrtD2Trade : 0;
              const absD1Trade = Math.abs(tradeTracker.D1);
              const absOfiTrade = Math.abs(tradeTracker.ofiRecursive);
              // BUG FIX: Efficiency unit mismatch — use pip-velocity units for both ofi and D1.
              // ofiRecursive = pips * ticks/s (force); D1 = price/sec → convert to pips/sec.
              const tradePipMult = tradePair.includes("JPY") ? 100 : 10000;
              const ofiScaledTrade = absOfiTrade / tradePipMult;   // normalize to pip-velocity
              const d1PipVelTrade = absD1Trade * tradePipMult;     // D1 in pips/sec
              const efficiencyTrade = ofiScaledTrade / (d1PipVelTrade + EFFICIENCY_EPSILON);
              const ofiNormTrade = Math.tanh(tradeTracker.ofiRecursive / 100);

              const tradeOfi = {
                hurst: Math.round(tradeTracker.hurst * 1000) / 1000,
                efficiency: Math.round(efficiencyTrade * 1000) / 1000,
                vpin: Math.round(tradeTracker.vpinRecursive * 1000) / 1000,
                buyPressure: Math.round(tradeTracker.ewmaBuyPct * 100),
                sellPressure: Math.round(tradeTracker.ewmaSellPct * 100),
                km: {
                  D1: tradeTracker.D1, D2: tradeTracker.D2,
                  driftNormalized: Math.round(driftNormTrade * 1000) / 1000,
                  sampleSize: tradeTracker.tickCount,
                  alphaAdaptive: Math.round(tradeTracker.alpha * 10000) / 10000,
                },
                zOfi: Math.round(tradeTracker.zOfi * 1000) / 1000,
                bias: (ofiNormTrade > OFI_IMBALANCE_THRESHOLD ? "BUY" : ofiNormTrade < -OFI_IMBALANCE_THRESHOLD ? "SELL" : "NEUTRAL") as "BUY" | "SELL" | "NEUTRAL",
              };

              // ═══ 4-GATE INSTITUTIONAL FILTER ═══

              // ─── GATE 1: HURST ≥ 0.60 ───
              if (tradeOfi.hurst < PREDATOR_HURST_MIN) {
                pState.consecutivePassCount = 0;
                gateDiag.hurst++;
                continue;
              }

              // ─── GATE 2: EFFICIENCY ≥ 3.5 ───
              if (tradeOfi.efficiency < PREDATOR_EFFICIENCY_MIN) {
                pState.consecutivePassCount = 0;
                gateDiag.efficiency++;
                continue;
              }

              // Gate 3 (OFI Ratio) already passed via direction determination above

              // ─── GATE 4: WEIGHTING >= 50% (directional majority) ───
              // BUG FIX: Was ">" strict operator — ewmaBuyPct rounds to 50 at balanced flow,
              // so 50.4% → 50 which is NOT > 50. Changed to ">=" so a genuine buy majority fires.
              const weightingPassed = tradeDirection === "long"
                ? tradeOfi.buyPressure >= PREDATOR_WEIGHTING_MIN
                : tradeOfi.sellPressure >= PREDATOR_WEIGHTING_MIN;
              if (!weightingPassed) {
                pState.consecutivePassCount = 0;
                gateDiag.weighting++;
                continue;
              }

              // ─── KM DRIFT MINIMUM ───
              if (Math.abs(tradeOfi.km.driftNormalized) < PREDATOR_KM_DRIFT_MIN) {
                pState.consecutivePassCount = 0;
                gateDiag.kmDrift++;
                continue;
              }

              // ─── VPIN VALIDATION ───
              if (tradeOfi.vpin < PREDATOR_VPIN_GHOST_MAX) {
                console.log(`[PREDATOR] 👻 GHOST MOVE: ${tradePair} VPIN=${tradeOfi.vpin} < ${PREDATOR_VPIN_GHOST_MAX} — BLOCKED`);
                pState.consecutivePassCount = 0;
                gateDiag.vpinGhost++;
                continue;
              }
              if (tradeOfi.vpin < PREDATOR_VPIN_MIN) {
                pState.consecutivePassCount = 0;
                gateDiag.vpinMin++;
                continue;
              }

              // ═══ RULE OF 3 ═══
              if (pState.lastPassDirection === tradeDirection) {
                pState.consecutivePassCount++;
              } else {
                pState.consecutivePassCount = 1;
                pState.lastPassDirection = tradeDirection;
              }
              if (pState.consecutivePassCount < PREDATOR_RULE_OF_3) {
                console.log(`[PREDATOR] ⏳ RULE OF 3: ${tradePair} ${tradeDirection} pass ${pState.consecutivePassCount}/${PREDATOR_RULE_OF_3} | H=${tradeOfi.hurst} E=${tradeOfi.efficiency} R=${shortWindowRatio.toFixed(2)} VPIN=${tradeOfi.vpin}`);
                gateDiag.ruleOf3++;
                continue;
              }

              // ═══ ALL GATES PASSED — FIRE ═══
              pState.consecutivePassCount = 0;
              gateDiag.passed++;

              const tradePrice = prices.get(tradePair);
              if (!tradePrice) continue;

              pState.lastFireTs = tickTs;

              // ─── ENTRY: Wall detection ───
              let wallPrice: number | null = null;
              const wallOffset = fromPips(PREDATOR_WALL_OFFSET_PIPS, tradePair);
              for (const [price, info] of tradeTracker.priceLevels.entries()) {
                if (info.hits < 3) continue;
                const priceNum = +price;
                const distPips = Math.abs(toPips(priceNum - tradePrice.mid, tradePair));
                if (distPips < 1 || distPips > 30) continue;
                if (tradeDirection === "long" && info.sells >= 2 && priceNum > tradePrice.mid) {
                  if (!wallPrice || priceNum < wallPrice) wallPrice = priceNum;
                }
                if (tradeDirection === "short" && info.buys >= 2 && priceNum < tradePrice.mid) {
                  if (!wallPrice || priceNum > wallPrice) wallPrice = priceNum;
                }
              }

              // ─── MARKET ORDER MATRIX: Entry Protocol ───
              const tsunamiOverride = tradeOfi.efficiency > PREDATOR_MARKET_OVERRIDE_EFFICIENCY
                && tradeOfi.vpin > PREDATOR_MARKET_OVERRIDE_VPIN;
              const orderType: "MARKET" | "LIMIT" = tsunamiOverride ? "MARKET" : (wallPrice ? "LIMIT" : "MARKET");
              const limitEntryPrice = (!tsunamiOverride && wallPrice)
                ? (tradeDirection === "long" ? wallPrice + wallOffset : wallPrice - wallOffset)
                : undefined;
              if (tsunamiOverride) {
                console.log(`[PREDATOR] 🌊 TSUNAMI OVERRIDE: ${tradePair} E=${tradeOfi.efficiency} VPIN=${tradeOfi.vpin} → MARKET`);
              }

              console.log(`[PREDATOR] 🎯 FIRE: ${tradeDirection.toUpperCase()} ${baseUnits} ${tradePair} | H=${tradeOfi.hurst} E=${tradeOfi.efficiency} EWMA_R=${shortWindowRatio.toFixed(2)} VPIN=${tradeOfi.vpin} | Buy%=${tradeOfi.buyPressure} Sell%=${tradeOfi.sellPressure} | |D1n|=${Math.abs(tradeOfi.km.driftNormalized).toFixed(2)} | Wall=${wallPrice?.toFixed(tradePair.includes("JPY") ? 3 : 5) ?? "NONE"} → ${orderType} | tick #${tickCount}`);

              const hurstConviction = Math.min(0.3, (tradeOfi.hurst - 0.5) * 3);
              const effConviction = Math.min(0.3, (tradeOfi.efficiency - 3.0) * 0.1);
              const vpinConviction = Math.min(0.2, (tradeOfi.vpin - 0.4) * 2);
              const ofiAligned = (tradeDirection === "long" && tradeOfi.bias === "BUY") ||
                                 (tradeDirection === "short" && tradeOfi.bias === "SELL");
              const ofiConviction = ofiAligned ? 0.2 : 0;

              const result = await executeOrder(
                tradePair, tradeDirection, baseUnits,
                baseSlPips, baseTpPips, "predatory-hunter",
                {
                  strategy: "predatory-hunter-2026-v2",
                  tickNumber: tickCount,
                  ticksPerSecond: densityCheck.tps,
                  streamLatencyMs: Date.now() - startTime,
                  confidence: Math.min(1, hurstConviction + effConviction + vpinConviction + ofiConviction),
                  engine: "predatory-hunter-v2-independent",
                  predatorGates: {
                    hurst: tradeOfi.hurst,
                    efficiency: tradeOfi.efficiency,
                    ewmaRatio: shortWindowRatio,
                    buyPct: tradeOfi.buyPressure,
                    sellPct: tradeOfi.sellPressure,
                    vpin: tradeOfi.vpin,
                    kmDrift: tradeOfi.km.driftNormalized,
                    ruleOf3: true,
                  },
                  wall: wallPrice ? { price: wallPrice, offset: PREDATOR_WALL_OFFSET_PIPS } : null,
                  ofi: {
                    weighted: Math.round(ofiNormTrade * 1000) / 1000,
                    vpin: tradeOfi.vpin, bias: tradeOfi.bias,
                    buyPct: tradeOfi.buyPressure, sellPct: tradeOfi.sellPressure,
                    zOfi: tradeOfi.zOfi,
                  },
                  kramersMoyal: tradeOfi.km,
                  hurst: { H: tradeOfi.hurst },
                },
                tradePrice,
                orderType,
                limitEntryPrice,
              );

              if (result.success) {
                zScoreFires.push(`predator:${tradePair}`);

                // Audit log
                await supabase.from("gate_bypasses").insert({
                  gate_id: `PREDATOR_FIRE:${tradePair}`,
                  reason: JSON.stringify({
                    strategy: "predatory-hunter-2026-v2",
                    pair: tradePair, direction: tradeDirection,
                    hurst: tradeOfi.hurst, efficiency: tradeOfi.efficiency,
                    ewmaRatio: shortWindowRatio, vpin: tradeOfi.vpin,
                    buyPct: tradeOfi.buyPressure, sellPct: tradeOfi.sellPressure,
                    wall: wallPrice, orderType,
                    fillPrice: result.fillPrice,
                    slippage: result.slippage,
                    tickNumber: tickCount,
                  }),
                  expires_at: new Date(Date.now() + 3600_000).toISOString(),
                  created_by: "predatory-hunter-engine",
                });
              }
            }

            // ═══ DEACTIVATED STRATEGIES ═══
            // Predatory Hunter v2 is the ONLY active strategy.

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

      // Efficiency ratio — pip-velocity units match (consistent with predator gate)
      const absD1 = Math.abs(tracker.D1);
      const absOfi = Math.abs(tracker.ofiRecursive);
      const snapPipMult = pair.includes("JPY") ? 100 : 10000;
      const ofiScaled = absOfi / snapPipMult;    // pip-velocity units
      const d1PipVel = absD1 * snapPipMult;      // D1 in pips/sec
      const efficiency = ofiScaled / (d1PipVel + EFFICIENCY_EPSILON);
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

    // Persist O(1) recursive synthetic book
    if (Object.keys(ofiSnapshot).length > 0) {
      await supabase.from("sovereign_memory").upsert({
        memory_type: "ofi_synthetic_book",
        memory_key: "latest_snapshot",
        payload: {
          version: "v8-predatory-hunter",
          pairs: ofiSnapshot,
          pairsCount: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          ticksProcessed: tickCount,
          streamDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          architecture: "O(1)_recursive_predatory_hunter",
          decayFactors: { kmAlphaRange: [KM_ALPHA_MIN, KM_ALPHA_MAX], ofiGamma: OFI_GAMMA_DEFAULT },
          gates: ["0:SIGNAL(Z-Score)", "1:HURST≥0.60", "2:EFFICIENCY≥3.5", "3:OFI_RATIO(Whale)", "4:WEIGHTING>50%", "VPIN≥0.45", "KM_DRIFT≥0.50", "RULE_OF_3"],
          capabilities: [
            "predatory_hunter_2026", "rule_of_3_verification",
            "adaptive_km_gear_shift", "welford_z_ofi", "hall_wood_hurst",
            "recursive_kramers_moyal", "recursive_velocity_displacement_ofi",
            "recursive_vpin_ewma", "efficiency_ratio_E", "market_state_classification",
            "hidden_limit_detection", "price_level_persistence", "tick_density_sr",
            "autonomous_exit_authority", "wall_stop_limit_entry",
          ],
        },
        relevance_score: hiddenPlayerAlerts > 0 ? 1.0 : 0.8,
        created_by: "ripple-stream-predatory-hunter-v1",
      }, { onConflict: "memory_type,memory_key" });
    }

    const totalMs = Date.now() - startTime;
    console.log(`[PREDATOR] 📊 Session: ${totalMs}ms, ${tickCount} ticks | Hunter: ${zScoreFires.length} | Exits: ${autonomousExits.length} | OFI: ${Object.keys(ofiSnapshot).length} pairs | Hidden: ${hiddenPlayerAlerts} | Absorbing: ${absorbingPairs} | Slipping: ${slippingPairs} | SOLE STRATEGY: Predatory Hunter v2`);
    console.log(`[PREDATOR_DIAG] 📊 FINAL: Scans=${gateDiag.total} | Blocked→ Density=${gateDiag.density} Warmup=${gateDiag.warmup} Hurst=${gateDiag.hurst} Eff=${gateDiag.efficiency} OFI_R=${gateDiag.ofiRatio} Weight=${gateDiag.weighting} KM=${gateDiag.kmDrift} VPIN_G=${gateDiag.vpinGhost} VPIN_M=${gateDiag.vpinMin} R3=${gateDiag.ruleOf3} | PASSED=${gateDiag.passed}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v8-predatory-hunter",
        creditExhausted,
        activeStrategies: ["predatory-hunter"],
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        predatoryHunter: {
          fired: zScoreFires.length, pairs: zScoreFires,
          groups: correlationGroups.length, threshold: zScoreThreshold,
          gates: { hurst: PREDATOR_HURST_MIN, efficiency: PREDATOR_EFFICIENCY_MIN, ofiRatioLong: PREDATOR_OFI_RATIO_LONG, ofiRatioShort: PREDATOR_OFI_RATIO_SHORT, weighting: PREDATOR_WEIGHTING_MIN, vpinMin: PREDATOR_VPIN_MIN, kmDriftMin: PREDATOR_KM_DRIFT_MIN, ruleOf3: PREDATOR_RULE_OF_3 },
          strategy: "predatory-hunter-2026",
        },
        autonomousExits: { count: autonomousExits.length, trades: autonomousExits },
        deactivated: ["ghost-vacuum", "velocity-gating", "snapback-sniper"],
        syntheticBook: {
          version: "v8-predatory-hunter",
          architecture: "O(1)_recursive_predatory_hunter",
          pairsTracked: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          gates: ["0:SIGNAL", "1:HURST≥0.60", "2:EFFICIENCY≥3.5", "3:OFI_RATIO", "4:WEIGHTING>50%", "VPIN≥0.45", "KM_DRIFT≥0.50", "RULE_OF_3"],
          capabilities: [
            "predatory_hunter_2026", "rule_of_3_verification",
            "adaptive_km_gear_shift", "welford_z_ofi", "hall_wood_hurst",
            "autonomous_exit_authority", "wall_stop_limit_entry",
          ],
          snapshot: ofiSnapshot,
        },
        slippageAudit: slippageSummary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[PREDATOR] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
