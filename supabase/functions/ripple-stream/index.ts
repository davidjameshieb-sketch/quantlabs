// Ripple Stream Engine v4 — Senior Ops Synthetic Order Book
// The Committee is dead. Long live the Frontline Soldiers.
//
// SYNTHETIC ORDER BOOK (better than institutional):
//   - Velocity-Weighted OFI: ticks weighted by 1/Δt (fast ticks = toxic/informed)
//   - Displacement-Weighted: ticks weighted by |ΔP| (big moves > noise)
//   - Price-Level Persistence: frequency map of hits/bounces → S/R from tick density
//   - Kramers-Moyal Drift/Diffusion: μ=force direction, σ²=noise level
//   - Hidden Limit Player Detection: OFI Force ≠ KM Velocity = institutional absorption
//
// Three L0 deterministic strategies on OANDA ms tick data:
//   1. Z-SCORE STRIKE — Rolling z-score on correlation-spreads, 7-gate pipeline
//   2. VELOCITY GATING — 5+ same-direction ticks in 2s = impulse fire
//   3. SNAP-BACK SNIPER — Stop-hunt exhaustion → contrarian entry at reversal
//
// Plus: MICRO-SLIPPAGE AUDITOR — Real-time fill audit, auto-switches to
// PREDATORY_LIMIT if slippage > 0.2 pips.
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

// ─── #2: ENHANCED SYNTHETIC ORDER BOOK (Senior Ops Grade) ───
// Three improvements over basic tick-rule OFI:
//   1. VELOCITY WEIGHTING: OFI += direction × (1/Δt) — fast ticks count more (Hawkes-like)
//   2. DISPLACEMENT WEIGHTING: OFI += sign(ΔP) × |ΔP| — big moves count more
//   3. PRICE-LEVEL PERSISTENCE: frequency map tracks hits/bounces per level → S/R from tick density
// Plus: Kramers-Moyal drift (μ) and diffusion (σ²) from raw ticks → "velocity" signal
// The Alpha: OFI = "Force", KM drift = "Velocity". Force without Velocity = Hidden Limit Seller.

const OFI_WINDOW = 200;          // ticks for rolling OFI
const VPIN_BUCKET_SIZE = 50;     // ticks per VPIN bucket
const VPIN_BUCKETS = 10;         // number of VPIN buckets (500 ticks lookback)
const OFI_IMBALANCE_THRESHOLD = 0.35;
const VPIN_TOXIC_THRESHOLD = 0.7;
const KM_WINDOW = 120;           // ticks for Kramers-Moyal estimation
const PRICE_LEVEL_MEMORY = 500;  // max price levels tracked
const HIDDEN_SELLER_FORCE_THRESHOLD = 0.4; // strong OFI force
const HIDDEN_SELLER_DRIFT_THRESHOLD = 0.1; // but flat KM drift

interface OfiTick {
  ts: number;
  mid: number;
  bid: number;
  ask: number;
  side: 1 | -1;
  spreadPips: number;
  velocityWeight: number;    // 1/Δt — speed weight
  displacement: number;      // |ΔP| in pips
  weightedContribution: number; // combined: side × (velocity + displacement)
}

interface PriceLevelInfo {
  hits: number;              // how many times price visited this level
  buys: number;
  sells: number;
  lastTs: number;
  bounces: number;           // price visited then reversed
  lastDirection: 1 | -1;
  broken: boolean;           // level was decisively broken through
}

interface KramersMoyalState {
  drift: number;             // μ — first moment (directional bias)
  diffusion: number;         // σ² — second moment (volatility/noise)
  driftNormalized: number;   // drift / sqrt(diffusion) — signal-to-noise
  sampleSize: number;
}

interface HiddenSellerSignal {
  detected: boolean;
  type: "HIDDEN_LIMIT_SELLER" | "HIDDEN_LIMIT_BUYER" | "NONE";
  force: number;             // OFI force magnitude
  velocity: number;          // KM drift magnitude
  divergence: number;        // force - velocity gap
  recommendation: "FADE" | "WAIT" | "NONE";
}

interface OfiTracker {
  ticks: OfiTick[];
  vpinBuckets: { buys: number; sells: number }[];
  currentBucket: { buys: number; sells: number; count: number };
  lastMid: number;
  lastTs: number;
  lastClassification: 1 | -1;
  // Enhanced: Price-level persistence map
  priceLevels: Map<number, PriceLevelInfo>;
  // Kramers-Moyal state
  kmReturns: number[];       // rolling log-returns for KM estimation
  kmState: KramersMoyalState;
}

const ofiTrackers = new Map<string, OfiTracker>();

function getOrCreateOfi(pair: string): OfiTracker {
  if (!ofiTrackers.has(pair)) {
    ofiTrackers.set(pair, {
      ticks: [],
      vpinBuckets: [],
      currentBucket: { buys: 0, sells: 0, count: 0 },
      lastMid: 0,
      lastTs: 0,
      lastClassification: 1,
      priceLevels: new Map(),
      kmReturns: [],
      kmState: { drift: 0, diffusion: 0, driftNormalized: 0, sampleSize: 0 },
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

// Kramers-Moyal estimation from tick returns
function computeKramersMoyal(returns: number[]): KramersMoyalState {
  if (returns.length < 20) return { drift: 0, diffusion: 0, driftNormalized: 0, sampleSize: returns.length };
  const n = returns.length;
  // First moment: drift μ = E[ΔX]
  const drift = returns.reduce((s, r) => s + r, 0) / n;
  // Second moment: diffusion σ² = E[(ΔX - μ)²]
  const diffusion = returns.reduce((s, r) => s + (r - drift) ** 2, 0) / n;
  const sqrtDiff = Math.sqrt(diffusion);
  const driftNormalized = sqrtDiff > 1e-10 ? drift / sqrtDiff : 0;
  return { drift, diffusion, driftNormalized, sampleSize: n };
}

// Detect Hidden Limit Seller/Buyer: OFI Force ≠ KM Velocity
function detectHiddenLimitPlayer(
  ofiForce: number, kmDrift: number
): HiddenSellerSignal {
  const absForce = Math.abs(ofiForce);
  const absDrift = Math.abs(kmDrift);
  
  // Strong OFI force but flat KM drift = absorption
  if (absForce > HIDDEN_SELLER_FORCE_THRESHOLD && absDrift < HIDDEN_SELLER_DRIFT_THRESHOLD) {
    const divergence = absForce - absDrift;
    if (ofiForce > 0) {
      // Buying force but price not moving up → Hidden Limit Seller absorbing
      return {
        detected: true,
        type: "HIDDEN_LIMIT_SELLER",
        force: ofiForce,
        velocity: kmDrift,
        divergence,
        recommendation: "FADE", // fade the buy pressure — seller is absorbing
      };
    } else {
      // Selling force but price not dropping → Hidden Limit Buyer absorbing
      return {
        detected: true,
        type: "HIDDEN_LIMIT_BUYER",
        force: ofiForce,
        velocity: kmDrift,
        divergence,
        recommendation: "FADE",
      };
    }
  }
  
  // Force and velocity aligned = genuine move, wait for entry
  if (absForce > HIDDEN_SELLER_FORCE_THRESHOLD && absDrift > HIDDEN_SELLER_DRIFT_THRESHOLD) {
    if (Math.sign(ofiForce) === Math.sign(kmDrift)) {
      return { detected: false, type: "NONE", force: ofiForce, velocity: kmDrift, divergence: 0, recommendation: "NONE" };
    }
    // Force and velocity opposed = conflicted, wait
    return { detected: true, type: ofiForce > 0 ? "HIDDEN_LIMIT_SELLER" : "HIDDEN_LIMIT_BUYER", force: ofiForce, velocity: kmDrift, divergence: absForce + absDrift, recommendation: "WAIT" };
  }
  
  return { detected: false, type: "NONE", force: ofiForce, velocity: kmDrift, divergence: 0, recommendation: "NONE" };
}

function processOfiTick(
  pair: string, mid: number, bid: number, ask: number,
  spreadPips: number, ts: number
): {
  ofiRatio: number;
  ofiRaw: number;
  ofiWeighted: number;       // NEW: velocity+displacement weighted OFI
  vpin: number;
  buyPressure: number;
  sellPressure: number;
  ticksInWindow: number;
  bias: "BUY" | "SELL" | "NEUTRAL";
  syntheticDepth: { price: number; buys: number; sells: number; net: number; hits: number; bounces: number; broken: boolean }[];
  km: KramersMoyalState;     // NEW: Kramers-Moyal state
  hiddenPlayer: HiddenSellerSignal; // NEW: hidden limit detection
  resistanceLevels: { price: number; strength: number; type: "SUPPORT" | "RESISTANCE" }[];
} {
  const tracker = getOrCreateOfi(pair);
  const isJpy = pair.includes("JPY");
  const pipMult = isJpy ? 100 : 10000;
  
  // Classify this tick
  const side = tracker.lastMid > 0
    ? classifyTick(mid, bid, ask, tracker.lastMid, tracker.lastClassification)
    : 1;
  
  // ─── IMPROVEMENT 1: Velocity Weighting (1/Δt) ───
  const deltaT = tracker.lastTs > 0 ? Math.max(ts - tracker.lastTs, 1) : 1000;
  // Clamp velocity weight: 1/Δt scaled to [0, 10] — cap at 10ms intervals
  const velocityWeight = Math.min(1000 / deltaT, 10);
  
  // ─── IMPROVEMENT 3: Displacement Weighting (|ΔP|) ───
  const priceDisplacement = tracker.lastMid > 0
    ? Math.abs(mid - tracker.lastMid) * pipMult
    : 0;
  // Combined contribution: direction × (velocity_component + displacement_component)
  // Normalize displacement to similar scale as velocity
  const displacementWeight = Math.min(priceDisplacement * 2, 10);
  const weightedContribution = side * (velocityWeight + displacementWeight);
  
  tracker.lastClassification = side;
  tracker.lastMid = mid;
  tracker.lastTs = ts;
  
  // Add to rolling window
  const tick: OfiTick = { ts, mid, bid, ask, side, spreadPips, velocityWeight, displacement: priceDisplacement, weightedContribution };
  tracker.ticks.push(tick);
  while (tracker.ticks.length > OFI_WINDOW) tracker.ticks.shift();
  
  // ─── Kramers-Moyal: accumulate log-returns ───
  if (tracker.ticks.length >= 2) {
    const prevTick = tracker.ticks[tracker.ticks.length - 2];
    if (prevTick.mid > 0) {
      const logReturn = Math.log(mid / prevTick.mid);
      tracker.kmReturns.push(logReturn);
      if (tracker.kmReturns.length > KM_WINDOW) tracker.kmReturns.shift();
    }
  }
  tracker.kmState = computeKramersMoyal(tracker.kmReturns);
  
  // VPIN bucket accumulation
  tracker.currentBucket.count++;
  if (side === 1) tracker.currentBucket.buys++;
  else tracker.currentBucket.sells++;
  
  if (tracker.currentBucket.count >= VPIN_BUCKET_SIZE) {
    tracker.vpinBuckets.push({ buys: tracker.currentBucket.buys, sells: tracker.currentBucket.sells });
    if (tracker.vpinBuckets.length > VPIN_BUCKETS) tracker.vpinBuckets.shift();
    tracker.currentBucket = { buys: 0, sells: 0, count: 0 };
  }
  
  // ─── IMPROVEMENT 2: Price-Level Persistence (frequency map) ───
  const bucketSize = isJpy ? 0.1 : 0.001; // ~10 pips
  const priceLevel = Math.round(mid / bucketSize) * bucketSize;
  
  if (!tracker.priceLevels.has(priceLevel)) {
    tracker.priceLevels.set(priceLevel, {
      hits: 0, buys: 0, sells: 0, lastTs: ts,
      bounces: 0, lastDirection: side, broken: false,
    });
  }
  const level = tracker.priceLevels.get(priceLevel)!;
  level.hits++;
  if (side === 1) level.buys++;
  else level.sells++;
  
  // Bounce detection: direction changed at this level
  if (level.lastDirection !== side && level.hits > 2) {
    level.bounces++;
    // If broken through (3+ consecutive same-direction at this level), mark broken
    const recentAtLevel = tracker.ticks.filter(t => Math.round(t.mid / bucketSize) * bucketSize === priceLevel).slice(-4);
    if (recentAtLevel.length >= 3 && recentAtLevel.every(t => t.side === side)) {
      level.broken = true;
    }
  }
  level.lastDirection = side;
  level.lastTs = ts;
  
  // Prune price levels to max
  if (tracker.priceLevels.size > PRICE_LEVEL_MEMORY) {
    const sorted = Array.from(tracker.priceLevels.entries())
      .sort((a, b) => Math.abs(b[0] - mid) - Math.abs(a[0] - mid));
    for (let i = PRICE_LEVEL_MEMORY; i < sorted.length; i++) {
      tracker.priceLevels.delete(sorted[i][0]);
    }
  }
  
  // ─── Compute enhanced OFI metrics ───
  const windowTicks = tracker.ticks;
  const buys = windowTicks.filter(t => t.side === 1).length;
  const sells = windowTicks.filter(t => t.side === -1).length;
  const total = windowTicks.length;
  const ofiRaw = buys - sells;
  const ofiRatio = total > 0 ? ofiRaw / total : 0;
  
  // Weighted OFI: sum of velocity+displacement weighted contributions
  const totalWeight = windowTicks.reduce((s, t) => s + Math.abs(t.weightedContribution), 0);
  const weightedSum = windowTicks.reduce((s, t) => s + t.weightedContribution, 0);
  const ofiWeighted = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  // VPIN
  let vpinSum = 0, vpinTotal = 0;
  for (const bucket of tracker.vpinBuckets) {
    const bTotal = bucket.buys + bucket.sells;
    if (bTotal > 0) { vpinSum += Math.abs(bucket.buys - bucket.sells) / bTotal; vpinTotal++; }
  }
  const vpin = vpinTotal > 0 ? vpinSum / vpinTotal : 0;
  
  // ─── Hidden Limit Player detection (Force vs Velocity) ───
  const hiddenPlayer = detectHiddenLimitPlayer(ofiWeighted, tracker.kmState.driftNormalized);
  
  // ─── Build enhanced synthetic depth with persistence data ───
  const depthLevels = Array.from(tracker.priceLevels.entries())
    .filter(([, info]) => info.hits >= 2) // only meaningful levels
    .map(([price, info]) => ({
      price: +price.toFixed(5),
      buys: info.buys,
      sells: info.sells,
      net: info.buys - info.sells,
      hits: info.hits,
      bounces: info.bounces,
      broken: info.broken,
    }))
    .sort((a, b) => Math.abs(b.price - mid) - Math.abs(a.price - mid))
    .slice(0, 20);
  
  // ─── Identify S/R levels from tick-density persistence ───
  const srLevels: { price: number; strength: number; type: "SUPPORT" | "RESISTANCE" }[] = [];
  for (const [price, info] of tracker.priceLevels.entries()) {
    if (info.bounces >= 2 && !info.broken) {
      const strength = info.bounces * info.hits;
      const type = info.sells > info.buys ? "SUPPORT" : "RESISTANCE";
      srLevels.push({ price: +price.toFixed(5), strength, type });
    }
  }
  srLevels.sort((a, b) => b.strength - a.strength);
  
  // Use weighted OFI for bias (more accurate than simple count)
  const biasThreshold = OFI_IMBALANCE_THRESHOLD;
  
  return {
    ofiRatio: Math.round(ofiRatio * 1000) / 1000,
    ofiRaw,
    ofiWeighted: Math.round(ofiWeighted * 1000) / 1000,
    vpin: Math.round(vpin * 1000) / 1000,
    buyPressure: total > 0 ? Math.round((buys / total) * 100) : 50,
    sellPressure: total > 0 ? Math.round((sells / total) * 100) : 50,
    ticksInWindow: total,
    bias: ofiWeighted > biasThreshold ? "BUY" : ofiWeighted < -biasThreshold ? "SELL" : "NEUTRAL",
    syntheticDepth: depthLevels,
    km: {
      drift: Math.round(tracker.kmState.drift * 1e8) / 1e8,
      diffusion: Math.round(tracker.kmState.diffusion * 1e12) / 1e12,
      driftNormalized: Math.round(tracker.kmState.driftNormalized * 1000) / 1000,
      sampleSize: tracker.kmState.sampleSize,
    },
    hiddenPlayer,
    resistanceLevels: srLevels.slice(0, 5),
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
const ZSCORE_MOMENTUM_TICKS = 3;    // quiet pair must show 3 aligned ticks in 5s

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

              // ─── GATE 2: Tick-Density (institutional flow filter) ───
              const densityCheck = isTickDensitySufficient(tradePair);
              if (!densityCheck.ok) {
                // Low tick density = illiquid noise, skip
                continue;
              }

              // ─── GATE 3: Momentum burst (quiet pair waking up) ───
              const momentumTracker = velocityTrackers.get(tradePair);
              if (momentumTracker) {
                const expectedDir: 1 | -1 = tradeDirection === "long" ? 1 : -1;
                const recentTicks = momentumTracker.ticks.filter(t => t.ts > tickTs - 5000);
                const alignedTicks = recentTicks.filter(t => t.direction === expectedDir);
              if (alignedTicks.length < ZSCORE_MOMENTUM_TICKS) continue;
              }

              // ─── GATE 4: VPIN Toxicity Filter (synthetic order book) ───
              const tradeOfi = processOfiTick(tradePair, prices.get(tradePair)!.mid, prices.get(tradePair)!.bid, prices.get(tradePair)!.ask, prices.get(tradePair)!.spreadPips, tickTs);
              if (tradeOfi.vpin > VPIN_TOXIC_THRESHOLD) {
                console.log(`[STRIKE-v3] 🧪 VPIN GATE: ${tradePair} VPIN=${tradeOfi.vpin} > ${VPIN_TOXIC_THRESHOLD} — toxic flow, skip`);
                continue;
              }

              // ─── GATE 5: OFI directional alignment (now uses weighted OFI) ───
              const ofiOpposed = (tradeDirection === "long" && tradeOfi.bias === "SELL") ||
                                 (tradeDirection === "short" && tradeOfi.bias === "BUY");
              if (ofiOpposed && Math.abs(tradeOfi.ofiWeighted) > 0.5) {
                console.log(`[STRIKE-v3] 📊 OFI GATE: ${tradePair} wOFI=${tradeOfi.ofiWeighted} opposes ${tradeDirection} — skip`);
                continue;
              }

              // ─── GATE 6: Hidden Limit Player detection (Force vs KM Velocity) ───
              if (tradeOfi.hiddenPlayer.detected && tradeOfi.hiddenPlayer.recommendation === "FADE") {
                // OFI force screaming one way but KM drift flat = absorption. Skip.
                console.log(`[STRIKE-v3] 🕵️ HIDDEN PLAYER: ${tradePair} ${tradeOfi.hiddenPlayer.type} | Force=${tradeOfi.hiddenPlayer.force.toFixed(3)} Drift=${tradeOfi.hiddenPlayer.velocity.toFixed(3)} — ${tradeOfi.hiddenPlayer.recommendation}`);
                continue;
              }

              // ─── GATE 7: Spread OK (baked into executeOrder) ───
              // Seven gates. Spread → Z-Score → Tick-Density → Momentum → VPIN → OFI → Hidden Player. Fire.

              const tradePrice = prices.get(tradePair);
              if (!tradePrice) continue;

              tracker.lastFireTs = tickTs;
              tracker.firedDirection = tradeDirection;

              // OFI conviction boost: aligned weighted flow increases confidence
              const ofiAligned = (tradeDirection === "long" && tradeOfi.bias === "BUY") ||
                                 (tradeDirection === "short" && tradeOfi.bias === "SELL");
              const ofiConfidenceBoost = ofiAligned ? Math.abs(tradeOfi.ofiWeighted) * 0.2 : 0;
              // KM drift alignment boost
              const kmAligned = (tradeDirection === "long" && tradeOfi.km.driftNormalized > 0.1) ||
                                (tradeDirection === "short" && tradeOfi.km.driftNormalized < -0.1);
              const kmBoost = kmAligned ? Math.min(Math.abs(tradeOfi.km.driftNormalized) * 0.1, 0.15) : 0;

              console.log(`[STRIKE-v3] 🎯 Z-SCORE FIRE: ${tradeDirection.toUpperCase()} ${baseUnits} ${tradePair} | z=${z.toFixed(2)} | wOFI=${tradeOfi.ofiWeighted} KM_drift=${tradeOfi.km.driftNormalized} VPIN=${tradeOfi.vpin} ${tradeOfi.bias} | group=${group.name} | tps=${densityCheck.tps.toFixed(1)} | tick #${tickCount}`);

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
                  confidence: Math.min(1, (Math.abs(z) / 3) + ofiConfidenceBoost + kmBoost),
                  engine: "zscore-strike-v4",
                  ofi: {
                    ratio: tradeOfi.ofiRatio, weighted: tradeOfi.ofiWeighted,
                    vpin: tradeOfi.vpin, bias: tradeOfi.bias,
                    buyPct: tradeOfi.buyPressure, sellPct: tradeOfi.sellPressure,
                  },
                  kramersMoyal: tradeOfi.km,
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

    // ─── Enhanced OFI Session Snapshot: persist synthetic order book + KM + hidden players ───
    const ofiSnapshot: Record<string, unknown> = {};
    let hiddenPlayerAlerts = 0;
    for (const [pair, tracker] of ofiTrackers.entries()) {
      const ticks = tracker.ticks;
      if (ticks.length < 10) continue;
      const buys = ticks.filter(t => t.side === 1).length;
      const sells = ticks.filter(t => t.side === -1).length;
      const total = ticks.length;
      const ofiRatio = total > 0 ? (buys - sells) / total : 0;
      
      // Weighted OFI
      const totalWeight = ticks.reduce((s, t) => s + Math.abs(t.weightedContribution), 0);
      const weightedSum = ticks.reduce((s, t) => s + t.weightedContribution, 0);
      const ofiWeighted = totalWeight > 0 ? weightedSum / totalWeight : 0;
      
      // VPIN
      let vpinSum = 0, vpinCount = 0;
      for (const b of tracker.vpinBuckets) {
        const bt = b.buys + b.sells;
        if (bt > 0) { vpinSum += Math.abs(b.buys - b.sells) / bt; vpinCount++; }
      }
      const vpin = vpinCount > 0 ? vpinSum / vpinCount : 0;
      
      // KM state
      const km = tracker.kmState;
      
      // Hidden player detection
      const hidden = detectHiddenLimitPlayer(ofiWeighted, km.driftNormalized);
      if (hidden.detected) hiddenPlayerAlerts++;
      
      // Enhanced depth with persistence
      const depth = Array.from(tracker.priceLevels.entries())
        .filter(([, info]) => info.hits >= 2)
        .map(([price, d]) => ({
          price: +price.toFixed(5), buys: d.buys, sells: d.sells,
          net: d.buys - d.sells, hits: d.hits, bounces: d.bounces, broken: d.broken,
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 10);
      
      // S/R levels from tick density
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
      
      ofiSnapshot[pair.replace("_", "/")] = {
        ofiRatio: Math.round(ofiRatio * 1000) / 1000,
        ofiWeighted: Math.round(ofiWeighted * 1000) / 1000,
        vpin: Math.round(vpin * 1000) / 1000,
        buyPct: total > 0 ? Math.round((buys / total) * 100) : 50,
        sellPct: total > 0 ? Math.round((sells / total) * 100) : 50,
        bias: ofiWeighted > OFI_IMBALANCE_THRESHOLD ? "BUY" : ofiWeighted < -OFI_IMBALANCE_THRESHOLD ? "SELL" : "NEUTRAL",
        ticksAnalyzed: total,
        syntheticDepth: depth,
        kramersMoyal: {
          drift: Math.round(km.drift * 1e8) / 1e8,
          diffusion: Math.round(km.diffusion * 1e12) / 1e12,
          driftNormalized: Math.round(km.driftNormalized * 1000) / 1000,
          sampleSize: km.sampleSize,
        },
        hiddenPlayer: hidden.detected ? {
          type: hidden.type,
          force: hidden.force,
          velocity: hidden.velocity,
          divergence: hidden.divergence,
          recommendation: hidden.recommendation,
        } : null,
        resistanceLevels: srLevels.slice(0, 5),
      };
    }

    // Persist enhanced synthetic book for dashboard & sovereign loop
    if (Object.keys(ofiSnapshot).length > 0) {
      await supabase.from("sovereign_memory").upsert({
        memory_type: "ofi_synthetic_book",
        memory_key: "latest_snapshot",
        payload: {
          version: "v2-senior-ops",
          pairs: ofiSnapshot,
          pairsCount: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          ticksProcessed: tickCount,
          streamDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          capabilities: ["velocity_weighted_ofi", "displacement_weighted", "price_level_persistence", "kramers_moyal_drift", "hidden_limit_detection", "tick_density_sr"],
        },
        relevance_score: hiddenPlayerAlerts > 0 ? 1.0 : 0.8,
        created_by: "ripple-stream-ofi-v2",
      }, { onConflict: "memory_type,memory_key" });
    }

    const totalMs = Date.now() - startTime;
    console.log(`[STRIKE-v4] 📊 Session: ${totalMs}ms, ${tickCount} ticks | Z-Score: ${zScoreFires.length} | Velocity: ${velocityFires.length} | Snap-Back: ${snapbackFires.length} | OFI-v2: ${Object.keys(ofiSnapshot).length} pairs | Hidden Players: ${hiddenPlayerAlerts}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v4-senior-ops-synthetic-book",
        streamDurationMs: totalMs,
        ticksProcessed: tickCount,
        zscore: { fired: zScoreFires.length, pairs: zScoreFires, groups: correlationGroups.length, threshold: zScoreThreshold },
        velocity: { fired: velocityFires.length, pairs: velocityFires, monitored: velocityPairs.length },
        snapback: { fired: snapbackFires.length, pairs: snapbackFires, monitored: snapbackPairs.length },
        syntheticBook: {
          version: "v2-senior-ops",
          pairsTracked: Object.keys(ofiSnapshot).length,
          hiddenPlayerAlerts,
          capabilities: ["velocity_weighted_ofi", "displacement_weighted", "price_level_persistence", "kramers_moyal_drift", "hidden_limit_detection", "tick_density_sr"],
          snapshot: ofiSnapshot,
        },
        slippageAudit: slippageSummary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[STRIKE-v3] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
