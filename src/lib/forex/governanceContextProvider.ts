// Governance Context Provider — Real Market-Derived Context
// Replaces RNG-based generateGovernanceContext with real-time
// analysis engine output, live OANDA pricing, and execution history.
//
// FIXES APPLIED:
// - Split caching: slow (5s) vs fast microstructure (500ms)
// - Trade history sorted descending before use
// - Hard block when live prices or analysis unavailable
// - Real spread/ATR/bid/ask fields added to context
// - Symbol normalization via forexSymbolMap

import type { GovernanceContext } from './tradeGovernanceEngine';
import type { VolatilityPhase, LiquiditySession } from './microstructureEngine';
import type { Timeframe } from '@/lib/market/types';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { getTickersByType } from '@/lib/market/tickers';
import { getAllLivePrices } from './oandaPricingService';
import { toDisplaySymbol } from './forexSymbolMap';
import {
  recordSlowCacheHit, recordSlowCacheMiss,
  recordFastCacheHit, recordFastCacheMiss,
  recordContextRetrieval,
} from './governanceCacheMonitor';

// ─── Session Detection (UTC-based, deterministic) ───

export function detectLiquiditySession(): LiquiditySession {
  const hour = new Date().getUTCHours();
  if (hour >= 1 && hour < 7) return 'asian';
  if (hour >= 7 && hour < 12) return 'london-open';
  if (hour >= 12 && hour < 17) return 'ny-overlap';
  return 'late-ny';
}

const SESSION_AGGRESSIVENESS: Record<LiquiditySession, number> = {
  asian: 35,
  'london-open': 88,
  'ny-overlap': 78,
  'late-ny': 22,
};

// ─── Major Pairs ───

const MAJOR_PAIRS = new Set([
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/JPY', 'GBP/JPY',
]);

// ─── Volatility Phase Classification from ATR ───

function classifyVolatilityPhase(
  atrCurrent: number,
  atrAverage: number,
): { phase: VolatilityPhase; confidence: number } {
  const ratio = atrAverage > 0 ? atrCurrent / atrAverage : 1;

  if (ratio < 0.65) return { phase: 'compression', confidence: 70 + (0.65 - ratio) * 80 };
  if (ratio >= 0.65 && ratio < 0.95) return { phase: 'compression', confidence: 55 + ratio * 15 };
  if (ratio >= 0.95 && ratio < 1.3) return { phase: 'expansion', confidence: 60 + (ratio - 0.95) * 80 };
  if (ratio >= 1.3 && ratio < 1.8) return { phase: 'ignition', confidence: 70 + (ratio - 1.3) * 50 };
  return { phase: 'exhaustion', confidence: 65 + Math.min((ratio - 1.8) * 30, 25) };
}

// ─── Spread Stability from Live Prices ───

const spreadHistory: Record<string, { spread: number; ts: number }[]> = {};
const SPREAD_HISTORY_WINDOW = 60_000; // 60s rolling window

function observeSpread(displaySymbol: string): {
  spreadStabilityRank: number;
  currentSpread: number;
  bid: number;
  ask: number;
  dataAvailable: boolean;
} {
  const prices = getAllLivePrices();
  const p = prices[displaySymbol];

  if (!p) {
    // HARD: no live prices → mark as unavailable
    return { spreadStabilityRank: 0, currentSpread: 0, bid: 0, ask: 0, dataAvailable: false };
  }

  const currentSpread = p.ask - p.bid;
  const now = Date.now();

  // Track history
  if (!spreadHistory[displaySymbol]) spreadHistory[displaySymbol] = [];
  spreadHistory[displaySymbol].push({ spread: currentSpread, ts: now });
  // Prune old
  spreadHistory[displaySymbol] = spreadHistory[displaySymbol].filter(s => now - s.ts < SPREAD_HISTORY_WINDOW);

  const history = spreadHistory[displaySymbol];
  if (history.length < 2) {
    return { spreadStabilityRank: 60, currentSpread, bid: p.bid, ask: p.ask, dataAvailable: true };
  }

  const avg = history.reduce((s, h) => s + h.spread, 0) / history.length;
  const variance = history.reduce((s, h) => s + Math.pow(h.spread - avg, 2), 0) / history.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 0;

  const rank = Math.max(0, Math.min(100, 100 - cv * 200));
  return { spreadStabilityRank: rank, currentSpread, bid: p.bid, ask: p.ask, dataAvailable: true };
}

// ─── Friction Ratio ───

const DEFAULT_SLIPPAGE_ESTIMATE = 0.00002; // ~0.2 pip

function computeFrictionRatio(
  atr: number,
  currentSpread: number,
  slippageEstimate: number = DEFAULT_SLIPPAGE_ESTIMATE,
): { frictionRatio: number; totalFriction: number; slippageEstimate: number } {
  const totalFriction = currentSpread + slippageEstimate;
  const frictionRatio = totalFriction > 0 ? atr / totalFriction : 10;
  return { frictionRatio, totalFriction, slippageEstimate };
}

// ─── Liquidity Shock Proxy ───

function estimateLiquidityShockProb(
  spreadStabilityRank: number,
  volatilityPhase: VolatilityPhase,
  session: LiquiditySession,
): number {
  let base = 100 - spreadStabilityRank;
  if (volatilityPhase === 'exhaustion') base += 15;
  if (volatilityPhase === 'compression') base += 5;
  if (session === 'late-ny') base += 10;
  if (session === 'asian') base += 5;
  return Math.max(0, Math.min(100, base));
}

// ─── Trade History Types ───

export interface TradeHistoryEntry {
  pair: string;
  direction: 'long' | 'short';
  pnlPips: number;
  timestamp: number;
  isWin: boolean;
}

// ─── Sort Trade History (recent-first) — Fix #2 ───

function sortTradeHistoryDescending(trades: TradeHistoryEntry[]): TradeHistoryEntry[] {
  return [...trades].sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Sequencing from Trade History ───

function computeSequencing(
  recentTrades: TradeHistoryEntry[],
): { cluster: GovernanceContext['sequencingCluster']; edgeDecaying: boolean; edgeDecayRate: number } {
  if (recentTrades.length < 3) {
    return { cluster: 'neutral', edgeDecaying: false, edgeDecayRate: 0 };
  }

  const last5 = recentTrades.slice(0, 5);
  const wins = last5.filter(t => t.isWin).length;
  const losses = last5.length - wins;

  let cluster: GovernanceContext['sequencingCluster'] = 'neutral';
  if (wins >= 4) cluster = 'profit-momentum';
  else if (losses >= 4) cluster = 'loss-cluster';
  else if (losses >= 3) cluster = 'mixed';

  const recent10 = recentTrades.slice(0, 10);
  const older10 = recentTrades.slice(10, 20);

  let edgeDecaying = false;
  let edgeDecayRate = 0;

  if (recent10.length >= 5 && older10.length >= 5) {
    const recentWR = recent10.filter(t => t.isWin).length / recent10.length;
    const olderWR = older10.filter(t => t.isWin).length / older10.length;
    if (olderWR > 0 && recentWR < olderWR * 0.85) {
      edgeDecaying = true;
      edgeDecayRate = ((olderWR - recentWR) / olderWR) * 100;
    }
  }

  return { cluster, edgeDecaying, edgeDecayRate };
}

// ─── Pair Performance from History ───

function computePairPerformance(
  displaySymbol: string,
  trades: TradeHistoryEntry[],
): { pairExpectancy: number; pairFavored: boolean } {
  const pairTrades = trades.filter(t => {
    const tDisplay = toDisplaySymbol(t.pair);
    return tDisplay === displaySymbol;
  });

  if (pairTrades.length < 3) {
    return { pairExpectancy: 55, pairFavored: false };
  }

  const winRate = pairTrades.filter(t => t.isWin).length / pairTrades.length;
  const avgPnl = pairTrades.reduce((s, t) => s + t.pnlPips, 0) / pairTrades.length;

  const pairExpectancy = Math.max(0, Math.min(100,
    50 + winRate * 30 + Math.min(avgPnl * 2, 20)
  ));

  return { pairExpectancy, pairFavored: pairExpectancy > 65 };
}

// ─── Anti-Overtrading Detection ───

function isOvertradingThrottled(
  recentTrades: TradeHistoryEntry[],
  session: LiquiditySession,
): boolean {
  const now = Date.now();
  const sessionWindowMs = 30 * 60 * 1000;
  const sessionTrades = recentTrades.filter(t => now - t.timestamp < sessionWindowMs);

  const sessionLimits: Record<LiquiditySession, number> = {
    'london-open': 12,
    'ny-overlap': 10,
    asian: 6,
    'late-ny': 4,
  };

  return sessionTrades.length >= (sessionLimits[session] || 8);
}

// ─── Slow Context (MTF, regime, session, pair, sequencing) ───

interface SlowContext {
  mtfAlignmentScore: number;
  htfSupports: boolean;
  mtfConfirms: boolean;
  ltfClean: boolean;
  volatilityPhase: VolatilityPhase;
  phaseConfidence: number;
  currentSession: LiquiditySession;
  sessionAggressiveness: number;
  pairExpectancy: number;
  pairFavored: boolean;
  isMajorPair: boolean;
  sequencingCluster: GovernanceContext['sequencingCluster'];
  edgeDecaying: boolean;
  edgeDecayRate: number;
  overtradingThrottled: boolean;
  // Raw ATR for logging
  atrValue: number;
  atrAvg: number;
  // Whether ticker analysis was available
  analysisAvailable: boolean;
}

function computeSlowContext(
  displaySymbol: string,
  _timeframe: Timeframe,
  sortedHistory: TradeHistoryEntry[],
): SlowContext {
  const isMajor = MAJOR_PAIRS.has(displaySymbol);

  // ── 1. MTF Alignment — from QuantLabs analysis engine ──
  const ticker = getTickersByType('forex').find(t => t.symbol === displaySymbol);
  let htfSupports = false;
  let mtfConfirms = false;
  let ltfClean = false;
  let mtfAlignmentScore = 0;
  let atrValue = 0;
  let atrAvg = 0;
  let analysisAvailable = false;

  if (ticker) {
    const mtfAnalysis = analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);
    const analyses = mtfAnalysis.analyses;
    analysisAvailable = true;

    const htfBias4h = analyses['4h']?.bias;
    const htfBias1d = analyses['1d']?.bias;
    htfSupports = htfBias4h === htfBias1d && htfBias4h != null;

    const mtfBias = analyses['1h']?.bias;
    mtfConfirms = mtfBias === htfBias4h;

    ltfClean = (analyses['15m']?.efficiency?.score ?? 0) > 0.4;

    mtfAlignmentScore = mtfAnalysis.mtfAlignmentScore ?? (
      (htfSupports ? 40 : 0) + (mtfConfirms ? 35 : 0) + (ltfClean ? 25 : 0)
    );

    atrValue = analyses['1h']?.atr ?? 0;
    atrAvg = analyses['4h']?.atr ?? atrValue;
  }

  // ── 2. Regime Phase ──
  const { phase: volatilityPhase, confidence: phaseConfidence } = classifyVolatilityPhase(atrValue, atrAvg);

  // ── 3. Session ──
  const currentSession = detectLiquiditySession();
  const sessionAggressiveness = SESSION_AGGRESSIVENESS[currentSession];

  // ── 4. Sequencing ──
  const { cluster: sequencingCluster, edgeDecaying, edgeDecayRate } = computeSequencing(sortedHistory);

  // ── 5. Pair Performance ──
  const { pairExpectancy, pairFavored } = computePairPerformance(displaySymbol, sortedHistory);

  // ── 6. Overtrading ──
  const overtradingThrottled = isOvertradingThrottled(sortedHistory, currentSession);

  return {
    mtfAlignmentScore, htfSupports, mtfConfirms, ltfClean,
    volatilityPhase, phaseConfidence,
    currentSession, sessionAggressiveness,
    pairExpectancy, pairFavored, isMajorPair: isMajor,
    sequencingCluster, edgeDecaying, edgeDecayRate, overtradingThrottled,
    atrValue, atrAvg, analysisAvailable,
  };
}

// ─── Fast Microstructure Context ───

interface FastContext {
  spreadStabilityRank: number;
  currentSpread: number;
  bid: number;
  ask: number;
  frictionRatio: number;
  totalFriction: number;
  slippageEstimate: number;
  liquidityShockProb: number;
  priceDataAvailable: boolean;
}

function computeFastContext(
  displaySymbol: string,
  volatilityPhase: VolatilityPhase,
  currentSession: LiquiditySession,
  atrValue: number,
): FastContext {
  const spreadObs = observeSpread(displaySymbol);
  const friction = computeFrictionRatio(atrValue, spreadObs.currentSpread);
  const liquidityShockProb = estimateLiquidityShockProb(
    spreadObs.spreadStabilityRank, volatilityPhase, currentSession,
  );

  return {
    spreadStabilityRank: spreadObs.spreadStabilityRank,
    currentSpread: spreadObs.currentSpread,
    bid: spreadObs.bid,
    ask: spreadObs.ask,
    frictionRatio: friction.frictionRatio,
    totalFriction: friction.totalFriction,
    slippageEstimate: friction.slippageEstimate,
    liquidityShockProb,
    priceDataAvailable: spreadObs.dataAvailable,
  };
}

// ─── Main Context Provider ───

export function getGovernanceContext(
  symbol: string,
  timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): GovernanceContext {
  const displayPair = toDisplaySymbol(symbol);

  // FIX #2: Sort trade history descending before any use
  const sortedHistory = sortTradeHistoryDescending(tradeHistory);

  const slow = computeSlowContext(displayPair, timeframe, sortedHistory);
  const fast = computeFastContext(displayPair, slow.volatilityPhase, slow.currentSession, slow.atrValue);

  return {
    mtfAlignmentScore: slow.mtfAlignmentScore,
    htfSupports: slow.htfSupports,
    mtfConfirms: slow.mtfConfirms,
    ltfClean: slow.ltfClean,
    volatilityPhase: slow.volatilityPhase,
    phaseConfidence: slow.phaseConfidence,
    liquidityShockProb: fast.liquidityShockProb,
    spreadStabilityRank: fast.spreadStabilityRank,
    frictionRatio: fast.frictionRatio,
    pairExpectancy: slow.pairExpectancy,
    pairFavored: slow.pairFavored,
    isMajorPair: slow.isMajorPair,
    currentSession: slow.currentSession,
    sessionAggressiveness: slow.sessionAggressiveness,
    edgeDecaying: slow.edgeDecaying,
    edgeDecayRate: slow.edgeDecayRate,
    overtradingThrottled: slow.overtradingThrottled,
    sequencingCluster: slow.sequencingCluster,
    // Extended fields (Fix #1 + #7)
    currentSpread: fast.currentSpread,
    bid: fast.bid,
    ask: fast.ask,
    slippageEstimate: fast.slippageEstimate,
    totalFriction: fast.totalFriction,
    atrValue: slow.atrValue,
    atrAvg: slow.atrAvg,
    priceDataAvailable: fast.priceDataAvailable,
    analysisAvailable: slow.analysisAvailable,
  };
}

// ─── Split Context Cache (Fix #4) ───

const SLOW_CACHE_TTL = 5_000;  // 5s for MTF, regime, session, etc.
const FAST_CACHE_TTL = 500;    // 500ms for microstructure

interface SlowCacheEntry { ctx: SlowContext; ts: number; }
interface FastCacheEntry { ctx: FastContext; ts: number; }

const slowCache: Record<string, SlowCacheEntry> = {};
const fastCache: Record<string, FastCacheEntry> = {};

export function getGovernanceContextCached(
  symbol: string,
  timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): GovernanceContext {
  const displayPair = toDisplaySymbol(symbol);
  const slowKey = `${displayPair}:${timeframe}`;
  const fastKey = displayPair;
  const now = Date.now();

  const startTime = performance.now();

  // FIX #2: Sort trade history descending before any use
  const sortedHistory = sortTradeHistoryDescending(tradeHistory);

  // Slow context: use cache if fresh
  let slow: SlowContext;
  const cachedSlow = slowCache[slowKey];
  if (cachedSlow && now - cachedSlow.ts < SLOW_CACHE_TTL) {
    slow = cachedSlow.ctx;
    recordSlowCacheHit();
  } else {
    slow = computeSlowContext(displayPair, timeframe, sortedHistory);
    slowCache[slowKey] = { ctx: slow, ts: now };
    recordSlowCacheMiss();
  }

  // Fast context: always recompute or use very short cache
  let fast: FastContext;
  const cachedFast = fastCache[fastKey];
  if (cachedFast && now - cachedFast.ts < FAST_CACHE_TTL) {
    fast = cachedFast.ctx;
    recordFastCacheHit();
  } else {
    fast = computeFastContext(displayPair, slow.volatilityPhase, slow.currentSession, slow.atrValue);
    fastCache[fastKey] = { ctx: fast, ts: now };
    recordFastCacheMiss();
  }

  recordContextRetrieval(performance.now() - startTime);

  return {
    mtfAlignmentScore: slow.mtfAlignmentScore,
    htfSupports: slow.htfSupports,
    mtfConfirms: slow.mtfConfirms,
    ltfClean: slow.ltfClean,
    volatilityPhase: slow.volatilityPhase,
    phaseConfidence: slow.phaseConfidence,
    liquidityShockProb: fast.liquidityShockProb,
    spreadStabilityRank: fast.spreadStabilityRank,
    frictionRatio: fast.frictionRatio,
    pairExpectancy: slow.pairExpectancy,
    pairFavored: slow.pairFavored,
    isMajorPair: slow.isMajorPair,
    currentSession: slow.currentSession,
    sessionAggressiveness: slow.sessionAggressiveness,
    edgeDecaying: slow.edgeDecaying,
    edgeDecayRate: slow.edgeDecayRate,
    overtradingThrottled: slow.overtradingThrottled,
    sequencingCluster: slow.sequencingCluster,
    currentSpread: fast.currentSpread,
    bid: fast.bid,
    ask: fast.ask,
    slippageEstimate: fast.slippageEstimate,
    totalFriction: fast.totalFriction,
    atrValue: slow.atrValue,
    atrAvg: slow.atrAvg,
    priceDataAvailable: fast.priceDataAvailable,
    analysisAvailable: slow.analysisAvailable,
  };
}
