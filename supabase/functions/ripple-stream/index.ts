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
const TICK_DENSITY_MIN_TPS = 2.0; // minimum ticks/sec for Z-Score conviction
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
      hurst: 0.5, // neutral start
      ewmaBuyVol: 0,
      ewmaSellVol: 0,
      vpinRecursive: 0,
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
    tracker.hurst = 0.3 * Math.max(0, Math.min(1, rawH)) + 0.7 * tracker.hurst;
    // Reset accumulators for next window
    tracker.sumD1Abs = 0;
    tracker.sumD2Abs = 0;
    tracker.hurstN = 0;
  }

  const hurstRegime: "PERSISTENT" | "MEAN_REVERTING" | "RANDOM_WALK" =
    tracker.hurst > HURST_PERSISTENCE_THRESHOLD ? "PERSISTENT" :
    tracker.hurst < HURST_MEANREV_THRESHOLD ? "MEAN_REVERTING" : "RANDOM_WALK";

  // ─── EFFICIENCY RATIO (The Alpha) ───
  const absD1 = Math.abs(tracker.D1);
  const absOfi = Math.abs(tracker.ofiRecursive);
  const ofiNormalized = absOfi / (pipMult * 10);
  const efficiency = ofiNormalized / (absD1 + EFFICIENCY_EPSILON);
  const marketState = classifyMarketState(efficiency);

  // ─── Update state for next tick ───
  tracker.prevMid = mid;
  tracker.prevTs = ts;
  tracker.tickCount++;

  // ─── Running buy/sell counts (O(1) with EWMA) ───
  const buyDecay = 0.99;
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
// (Momentum gate removed — replaced by KM Drift in Lean 6 pipeline)

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
    const autonomousExits: string[] = [];
    const startTime = Date.now();
    let tickCount = 0;
    let lastExitScanTs = 0;
    const EXIT_SCAN_INTERVAL_MS = 2000; // Scan open trades every 2s on tick data

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
      zScoreTrackers.set(g.name, { spreadHistory: [], lastFireTs: 0, firedDirection: null });
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

      // ─── L0 HARD GATE 2: Late-NY / Rollover session block (20:00-23:59 UTC) ───
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 20 || utcHour < 0) {
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

      const orderBody: Record<string, unknown> = {
        order: {
          type: orderType,
          instrument: pair,
          units: String(dirUnits),
          timeInForce: orderType === "MARKET" ? "FOK" : "IOC",
          stopLossOnFill: { distance: slDistance.toFixed(5), timeInForce: "GTC" },
          takeProfitOnFill: { distance: tpDistance.toFixed(5), timeInForce: "GTC" },
          ...(orderType === "LIMIT" ? { price: currentPrice.mid.toFixed(5) } : {}),
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
          const rejectReason = orderData.orderRejectTransaction?.rejectReason ||
            orderData.orderCancelTransaction?.reason || "Unknown";
          console.warn(`[STRIKE-v3] ❌ ${engine} REJECTED: ${rejectReason}`);
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

            // Update velocity tracker (used by both Velocity Gating AND Z-Score momentum filter)
            const vt = velocityTrackers.get(instrument);
            if (vt && prevPrice) {
              const delta = mid - prevPrice.mid;
              if (Math.abs(delta) > 0) {
                const dir: 1 | -1 = delta > 0 ? 1 : -1;
                vt.ticks.push({ ts: tickTs, mid, direction: dir });
                // Keep last 20 ticks for momentum lookback
                while (vt.ticks.length > 20) vt.ticks.shift();
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 1: Z-SCORE STRIKE
            // No triggers. No arming. No AI. Pure statistics.
            // Compute rolling z-score on the "spread" between correlated pairs.
            // Fire when z > threshold + momentum burst on the lagging pair.
            // ═══════════════════════════════════════════════
            for (const group of correlationGroups) {
              const priceA = prices.get(group.pairA);
              const priceB = prices.get(group.pairB);
              if (!priceA || !priceB) continue;

              // Correlation spread = normalized difference between pair mids
              // For JPY pairs, normalize to comparable pip scale
              const normA = priceA.mid * pipMultiplier(group.pairA);
              const normB = priceB.mid * pipMultiplier(group.pairB);
              const corrSpread = normA - normB;

              const tracker = zScoreTrackers.get(group.name)!;
              tracker.spreadHistory.push(corrSpread);
              if (tracker.spreadHistory.length > ZSCORE_WINDOW) {
                tracker.spreadHistory.shift();
              }

              // Need enough history
              if (tracker.spreadHistory.length < 30) continue;

              const { z, mean, std } = computeZScore(tracker.spreadHistory);

              // Cooldown check
              if (tickTs - tracker.lastFireTs < ZSCORE_COOLDOWN_MS) continue;

              // ─── GATE 1: Z-Score threshold (the only "committee" is math) ───
              if (Math.abs(z) < zScoreThreshold) continue;

              // z > 2: pairA is expensive relative to pairB → SHORT pairA or LONG pairB
              // z < -2: pairA is cheap relative to pairB → LONG pairA or SHORT pairB
              // We trade the LAGGING pair (the one that hasn't moved yet)
              const aMovePips = prevPrice ? Math.abs(toPips(priceA.mid - (prices.get(group.pairA)?.mid || priceA.mid), group.pairA)) : 0;
              
              let tradePair: string;
              let tradeDirection: string;
              
              if (z > zScoreThreshold) {
                // pairA overextended up relative to pairB → pairB should catch up (long) OR pairA should revert (short)
                // Trade the quieter pair in the catch-up direction
                tradePair = group.pairB;
                tradeDirection = "long";
              } else {
                // z < -threshold: pairA underextended → pairB should drop OR pairA should rise
                tradePair = group.pairB;
                tradeDirection = "short";
              }

              if (blockedPairs.includes(tradePair)) continue;

              // ═══ LEAN 6 ZERO-LAG PIPELINE ═══
              // Gate 1 (SIGNAL / Z-Score) already passed above — kills 99% of ticks.

              // ─── GATE 2: LIQUIDITY (Tick Density — is it safe to trade?) ───
              // Cost: Low (Map lookup). Kills: Illiquid pairs or bad sessions.
              const densityCheck = isTickDensitySufficient(tradePair);
              if (!densityCheck.ok) continue;

              // ─── READ PHYSICS (already computed at line 1029 for all instruments) ───
              // DO NOT call processOfiTick again — double-updating corrupts recursive state
              // (dt≈0 → Infinity velocity → NaN cascade). Read from tracker directly.
              const tradeTracker = getOrCreateOfi(tradePair);
              if (tradeTracker.tickCount < 10) continue; // not enough data
              const sqrtD2Trade = Math.sqrt(Math.abs(tradeTracker.D2));
              const driftNormTrade = sqrtD2Trade > 1e-10 ? tradeTracker.D1 / sqrtD2Trade : 0;
              const absD1Trade = Math.abs(tradeTracker.D1);
              const absOfiTrade = Math.abs(tradeTracker.ofiRecursive);
              const pipMultTrade = tradePair.includes("JPY") ? 100 : 10000;
              const ofiScaledTrade = absOfiTrade / (pipMultTrade * 10);
              const efficiencyTrade = ofiScaledTrade / (absD1Trade + EFFICIENCY_EPSILON);
              const marketStateTrade = classifyMarketState(efficiencyTrade);
              const hiddenPlayerTrade = detectHiddenLimitPlayer(tradeTracker.ofiRecursive, tradeTracker.D1, efficiencyTrade, marketStateTrade);
              const hurstRegimeTrade = tradeTracker.hurst > HURST_PERSISTENCE_THRESHOLD ? "PERSISTENT" :
                tradeTracker.hurst < HURST_MEANREV_THRESHOLD ? "MEAN_REVERTING" : "RANDOM_WALK";
              const ofiNormTrade = Math.tanh(tradeTracker.ofiRecursive / 100);
              const tradeOfi = {
                ofiRatio: 0, ofiRaw: 0,
                ofiWeighted: Math.round(ofiNormTrade * 1000) / 1000,
                vpin: Math.round(tradeTracker.vpinRecursive * 1000) / 1000,
                buyPressure: Math.round(tradeTracker.ewmaBuyPct * 100),
                sellPressure: Math.round(tradeTracker.ewmaSellPct * 100),
                ticksInWindow: tradeTracker.tickCount,
                bias: (ofiNormTrade > OFI_IMBALANCE_THRESHOLD ? "BUY" : ofiNormTrade < -OFI_IMBALANCE_THRESHOLD ? "SELL" : "NEUTRAL") as "BUY" | "SELL" | "NEUTRAL",
                syntheticDepth: [] as any[],
                km: {
                  D1: tradeTracker.D1, D2: tradeTracker.D2,
                  driftNormalized: Math.round(driftNormTrade * 1000) / 1000,
                  sampleSize: tradeTracker.tickCount,
                  alphaAdaptive: Math.round(tradeTracker.alpha * 10000) / 10000,
                },
                hiddenPlayer: hiddenPlayerTrade,
                resistanceLevels: [] as any[],
                efficiency: Math.round(efficiencyTrade * 1000) / 1000,
                marketState: marketStateTrade,
                zOfi: Math.round(tradeTracker.zOfi * 1000) / 1000,
                hurst: Math.round(tradeTracker.hurst * 1000) / 1000,
                hurstRegime: hurstRegimeTrade,
              };

              // ─── GATE 3: REGIME (Hurst — will the ripple travel?) ───
              // Cost: Zero (reading computed float). The "Weather Report" — don't sail in a storm.
              if (tradeOfi.hurst < 0.45) {
                console.log(`[LEAN6] 🔬 HURST REJECT: ${tradePair} H=${tradeOfi.hurst} < 0.45 — mean-reverting, skip`);
                continue;
              }

              // ─── GATE 4: FORCE (Z-OFI — is this move statistically abnormal for NOW?) ───
              // Cost: Zero (reading computed float). Kills: "Normal" noise that coincidentally had a Z-score.
              // ALWAYS enforce — no warm-up bypass. Early ticks with low Z-OFI = noise.
              if (Math.abs(tradeOfi.zOfi) < Z_OFI_FIRE_THRESHOLD) {
                continue;
              }

              // ─── GATE 5: VELOCITY (KM Drift — is price actually moving?) ───
              // Cost: Zero (replaces O(N) momentum array scan). Kills: high-force moves fighting gravity.
              // driftNormalized = D1/√D2 (signal-to-noise ratio). Typical forex values: 1-20.
              // Threshold 2.0 ensures meaningful directional velocity above noise.
              if (Math.abs(tradeOfi.km.driftNormalized) < 2.0) {
                continue;
              }

              // ─── GATE 6: STRUCTURE (Efficiency — the "Final Boss") ───
              // Cost: Zero (reading computed float). Kills: Hidden Limit Players / Icebergs.
              if (tradeOfi.hiddenPlayer.detected && tradeOfi.hiddenPlayer.recommendation === "FADE") {
                console.log(`[LEAN6] 🕵️ EFFICIENCY REJECT: ${tradePair} ${tradeOfi.hiddenPlayer.type} | E=${tradeOfi.efficiency} ${tradeOfi.marketState}`);
                continue;
              }

              // ═══ ALL 6 GATES PASSED — FIRE ═══

              const tradePrice = prices.get(tradePair);
              if (!tradePrice) continue;

              tracker.lastFireTs = tickTs;
              tracker.firedDirection = tradeDirection;



              console.log(`[LEAN6] 🎯 FIRE: ${tradeDirection.toUpperCase()} ${baseUnits} ${tradePair} | z=${z.toFixed(2)} | Z_OFI=${tradeOfi.zOfi.toFixed(2)} H=${tradeOfi.hurst} ${tradeOfi.hurstRegime} | D1_norm=${tradeOfi.km.driftNormalized} | E=${tradeOfi.efficiency} ${tradeOfi.marketState} | KM_α=${tradeOfi.km.alphaAdaptive} | group=${group.name} | tps=${densityCheck.tps.toFixed(1)} | tick #${tickCount}`);

              // Conviction: combine z-score + OFI alignment + KM + Hurst
              const ofiAligned = (tradeDirection === "long" && tradeOfi.bias === "BUY") ||
                                 (tradeDirection === "short" && tradeOfi.bias === "SELL");
              const ofiConfidenceBoost = ofiAligned ? Math.abs(tradeOfi.ofiWeighted) * 0.2 : 0;
              const kmAligned = (tradeDirection === "long" && tradeOfi.km.driftNormalized > 0.1) ||
                                (tradeDirection === "short" && tradeOfi.km.driftNormalized < -0.1);
              const kmBoost = kmAligned ? Math.min(Math.abs(tradeOfi.km.driftNormalized) * 0.1, 0.15) : 0;
              const hurstBoost = tradeOfi.hurst > 0.6 ? 0.1 : 0; // extra confidence in strong trend

              const result = await executeOrder(
                tradePair, tradeDirection, baseUnits,
                baseSlPips, baseTpPips, "zscore-strike",
                {
                  zScore: z, mean, std,
                  group: group.name,
                  pairA: group.pairA, pairB: group.pairB,
                  tickNumber: tickCount,
                  ticksPerSecond: densityCheck.tps,
                  streamLatencyMs: Date.now() - startTime,
                  confidence: Math.min(1, (Math.abs(z) / 3) + ofiConfidenceBoost + kmBoost + hurstBoost),
                  engine: "zscore-strike-v6-lean6",
                  ofi: {
                    ratio: tradeOfi.ofiRatio, weighted: tradeOfi.ofiWeighted,
                    vpin: tradeOfi.vpin, bias: tradeOfi.bias,
                    buyPct: tradeOfi.buyPressure, sellPct: tradeOfi.sellPressure,
                    zOfi: tradeOfi.zOfi,
                  },
                  kramersMoyal: tradeOfi.km,
                  hurst: { H: tradeOfi.hurst, regime: tradeOfi.hurstRegime },
                  hiddenPlayer: tradeOfi.hiddenPlayer.detected ? tradeOfi.hiddenPlayer : null,
                  resistanceLevels: tradeOfi.resistanceLevels,
                },
                tradePrice,
              );

              if (result.success) {
                zScoreFires.push(`${group.name}:${tradePair}`);

                // Audit log
                await supabase.from("gate_bypasses").insert({
                  gate_id: `ZSCORE_FIRE:${group.name}:${tradePair}`,
                  reason: JSON.stringify({
                    group: group.name, pair: tradePair,
                    direction: tradeDirection, zScore: z,
                    mean, std, threshold: zScoreThreshold,
                    fillPrice: result.fillPrice,
                    slippage: result.slippage,
                    tickNumber: tickCount,
                  }),
                  expires_at: new Date(Date.now() + 3600_000).toISOString(),
                  created_by: "zscore-strike-engine",
                });
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 2: VELOCITY GATING (unchanged — already L0)
            // 5+ same-direction ticks in 2s = impulse fire
            // ═══════════════════════════════════════════════
            if (vt && prevPrice && velocityPairs.includes(instrument)) {
              if (vt.ticks.length >= VELOCITY_TICK_THRESHOLD && (tickTs - vt.lastFireTs) > VELOCITY_COOLDOWN_MS) {
                const recentVTicks = vt.ticks.slice(-VELOCITY_TICK_THRESHOLD);
                const windowAge = tickTs - recentVTicks[0].ts;
                const allSameDir = recentVTicks.every(t => t.direction === recentVTicks[0].direction);

                if (allSameDir && windowAge <= VELOCITY_MAX_AGE_MS) {
                  const direction = recentVTicks[0].direction === 1 ? "long" : "short";
                  const movePips = Math.abs(toPips(recentVTicks[recentVTicks.length - 1].mid - recentVTicks[0].mid, instrument));
                  const avgTickInterval = Math.round(windowAge / (recentVTicks.length - 1));

                  if (movePips >= 1.0) {
                    vt.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] ⚡ VELOCITY: ${instrument} ${recentVTicks.length} ticks ${direction} in ${windowAge}ms | ${movePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, direction, velocityUnits,
                      velocitySlPips, velocityTpPips, "velocity-gating",
                      {
                        ticksInWindow: recentVTicks.length,
                        windowAgeMs: windowAge, avgTickIntervalMs: avgTickInterval,
                        movePips, tickNumber: tickCount,
                        streamLatencyMs: Date.now() - startTime,
                        confidence: Math.min(1, movePips / 3),
                        engine: "velocity-gating-v3",
                      },
                      { mid, spreadPips },
                    );

                    if (result.success) {
                      velocityFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `VELOCITY_FIRE:${instrument}`,
                        reason: JSON.stringify({
                          pair: instrument, direction, movePips,
                          ticksInWindow: recentVTicks.length,
                          windowAgeMs: windowAge, fillPrice: result.fillPrice,
                          slippage: result.slippage, tickNumber: tickCount,
                        }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "velocity-gating-engine",
                      });
                    }
                    vt.ticks = [];
                  }
                }
              }
            }

            // ═══════════════════════════════════════════════
            // STRATEGY 3: SNAP-BACK SNIPER (unchanged — already L0)
            // ═══════════════════════════════════════════════
            const sb = snapbackTrackers.get(instrument);
            if (sb && prevPrice) {
              const delta = mid - prevPrice.mid;
              const deltaPips = toPips(delta, instrument);
              sb.recentTicks.push({ ts: tickTs, mid, delta: deltaPips });

              if (sb.recentTicks.length > SNAPBACK_VOLUME_WINDOW) sb.recentTicks.shift();

              if (sb.recentTicks.length >= SNAPBACK_VOLUME_WINDOW && (tickTs - sb.lastFireTs) > 5000) {
                const ticks = sb.recentTicks;
                const totalMovePips = Math.abs(ticks[ticks.length - 1].mid - ticks[0].mid) * pipMultiplier(instrument);
                const lastFewTicks = ticks.slice(-3);
                const mainWindowTicks = ticks.slice(0, -3);

                if (mainWindowTicks.length >= 5) {
                  const mainDownRatio = mainWindowTicks.filter(t => t.delta < 0).length / mainWindowTicks.length;
                  const mainUpRatio = mainWindowTicks.filter(t => t.delta > 0).length / mainWindowTicks.length;
                  const lastFewDirection = lastFewTicks.reduce((sum, t) => sum + t.delta, 0);

                  // Down-flush → snap-back up
                  if (mainDownRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection > 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] 🎯 SNAP-BACK: ${instrument} down-flush → reversal | ${totalMovePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, "long", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      { huntDirection: "down", exhaustionRatio: mainDownRatio, spikePips: totalMovePips, tickNumber: tickCount, confidence: Math.min(1, totalMovePips / 5), engine: "snapback-sniper-v3" },
                      { mid, spreadPips },
                    );
                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({ pair: instrument, direction: "long", exhaustionRatio: mainDownRatio, spikePips: totalMovePips, tickNumber: tickCount }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "snapback-sniper-engine",
                      });
                    }
                    sb.recentTicks = [];
                  }

                  // Up-flush → snap-back down
                  if (mainUpRatio >= SNAPBACK_EXHAUSTION_RATIO && lastFewDirection < 0 && totalMovePips >= SNAPBACK_MIN_SPIKE_PIPS) {
                    sb.lastFireTs = tickTs;
                    console.log(`[STRIKE-v3] 🎯 SNAP-BACK: ${instrument} up-flush → reversal | ${totalMovePips.toFixed(1)}p`);

                    const result = await executeOrder(
                      instrument, "short", snapbackUnits,
                      snapbackSlPips, snapbackTpPips, "snapback-sniper",
                      { huntDirection: "up", exhaustionRatio: mainUpRatio, spikePips: totalMovePips, tickNumber: tickCount, confidence: Math.min(1, totalMovePips / 5), engine: "snapback-sniper-v3" },
                      { mid, spreadPips },
                    );
                    if (result.success) {
                      snapbackFires.push(instrument);
                      await supabase.from("gate_bypasses").insert({
                        gate_id: `SNAPBACK_FIRE:${instrument}`,
                        reason: JSON.stringify({ pair: instrument, direction: "short", exhaustionRatio: mainUpRatio, spikePips: totalMovePips, tickNumber: tickCount }),
                        expires_at: new Date(Date.now() + 3600_000).toISOString(),
                        created_by: "snapback-sniper-engine",
                      });
                    }
                    sb.recentTicks = [];
                  }
                }
              }
              sb.lastMid = mid;
            }
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

      // Efficiency ratio
      const absD1 = Math.abs(tracker.D1);
      const absOfi = Math.abs(tracker.ofiRecursive);
      const pipMult = pair.includes("JPY") ? 100 : 10000;
      const ofiScaled = absOfi / (pipMult * 10);
      const efficiency = ofiScaled / (absD1 + EFFICIENCY_EPSILON);
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
          version: "v6-lean6-zero-lag",
          pairs: ofiSnapshot,
          pairsCount: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          ticksProcessed: tickCount,
          streamDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          architecture: "O(1)_recursive_welford_hurst",
          decayFactors: { kmAlphaRange: [KM_ALPHA_MIN, KM_ALPHA_MAX], ofiGamma: OFI_GAMMA_DEFAULT },
          gates: ["1:SIGNAL(Z-Score)", "2:LIQUIDITY(Density)", "3:REGIME(Hurst)", "4:FORCE(Z-OFI)", "5:VELOCITY(KM_Drift)", "6:STRUCTURE(Efficiency)"],
          capabilities: [
            "adaptive_km_gear_shift", "welford_z_ofi", "hall_wood_hurst",
            "recursive_kramers_moyal", "recursive_velocity_displacement_ofi",
            "recursive_vpin_ewma", "efficiency_ratio_E", "market_state_classification",
            "hidden_limit_detection", "price_level_persistence", "tick_density_sr",
            "lean_6_pipeline",
          ],
        },
        relevance_score: hiddenPlayerAlerts > 0 ? 1.0 : 0.8,
        created_by: "ripple-stream-ofi-v4-senior-ops",
      }, { onConflict: "memory_type,memory_key" });
    }

    const totalMs = Date.now() - startTime;
    console.log(`[LEAN6] 📊 Session: ${totalMs}ms, ${tickCount} ticks | Z-Score: ${zScoreFires.length} | Velocity: ${velocityFires.length} | Snap-Back: ${snapbackFires.length} | OFI: ${Object.keys(ofiSnapshot).length} pairs | Hidden: ${hiddenPlayerAlerts} | Absorbing: ${absorbingPairs} | Slipping: ${slippingPairs}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v6-lean6-zero-lag",
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        zscore: { fired: zScoreFires.length, pairs: zScoreFires, groups: correlationGroups.length, threshold: zScoreThreshold },
        velocity: { fired: velocityFires.length, pairs: velocityFires, monitored: velocityPairs.length },
        snapback: { fired: snapbackFires.length, pairs: snapbackFires, monitored: snapbackPairs.length },
        syntheticBook: {
          version: "v6-lean6-zero-lag",
          architecture: "O(1)_100pct_recursive",
          pairsTracked: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          absorbingPairs,
          slippingPairs,
          gates: ["1:SIGNAL", "2:LIQUIDITY", "3:REGIME", "4:FORCE", "5:VELOCITY", "6:STRUCTURE"],
          capabilities: [
            "adaptive_km_gear_shift", "welford_z_ofi", "hall_wood_hurst",
            "recursive_kramers_moyal", "recursive_velocity_displacement_ofi",
            "recursive_vpin_ewma", "efficiency_ratio_E", "market_state_classification",
            "hidden_limit_detection", "price_level_persistence", "lean_6_pipeline",
          ],
          snapshot: ofiSnapshot,
        },
        slippageAudit: slippageSummary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[STRIKE-v4] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
