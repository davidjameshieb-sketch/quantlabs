// Governance Context Provider — Real Market-Derived Context
// Replaces RNG-based generateGovernanceContext with real-time
// analysis engine output, live OANDA pricing, and execution history.

import type { GovernanceContext } from './tradeGovernanceEngine';
import type { VolatilityPhase, LiquiditySession } from './microstructureEngine';
import type { Timeframe } from '@/lib/market/types';
import { analyzeMultiTimeframe } from '@/lib/market/analysisEngine';
import { getTickersByType } from '@/lib/market/tickers';
import { getLivePrice, getAllLivePrices } from './oandaPricingService';

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

// Cache for spread observations
const spreadHistory: Record<string, { spread: number; ts: number }[]> = {};
const SPREAD_HISTORY_WINDOW = 60_000; // 60s rolling window

function observeSpread(symbol: string): { spreadStabilityRank: number; currentSpread: number } {
  const prices = getAllLivePrices();
  const p = prices[symbol];
  if (!p) return { spreadStabilityRank: 50, currentSpread: 0 };

  const currentSpread = p.ask - p.bid;
  const now = Date.now();

  // Track history
  if (!spreadHistory[symbol]) spreadHistory[symbol] = [];
  spreadHistory[symbol].push({ spread: currentSpread, ts: now });
  // Prune old
  spreadHistory[symbol] = spreadHistory[symbol].filter(s => now - s.ts < SPREAD_HISTORY_WINDOW);

  const history = spreadHistory[symbol];
  if (history.length < 2) return { spreadStabilityRank: 60, currentSpread };

  const avg = history.reduce((s, h) => s + h.spread, 0) / history.length;
  const variance = history.reduce((s, h) => s + Math.pow(h.spread - avg, 2), 0) / history.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 0; // coefficient of variation

  // Lower CV = more stable = higher rank
  const rank = Math.max(0, Math.min(100, 100 - cv * 200));
  return { spreadStabilityRank: rank, currentSpread };
}

// ─── Friction Ratio ───

function computeFrictionRatio(
  atr: number,
  currentSpread: number,
  slippageEstimate: number = 0.00002, // ~0.2 pip default
): number {
  const totalFriction = currentSpread + slippageEstimate;
  return totalFriction > 0 ? atr / totalFriction : 10;
}

// ─── Liquidity Shock Proxy ───

function estimateLiquidityShockProb(
  spreadStabilityRank: number,
  volatilityPhase: VolatilityPhase,
  session: LiquiditySession,
): number {
  // High spread instability + exhaustion/compression + off-hours = high shock risk
  let base = 100 - spreadStabilityRank; // inversely correlated with stability
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

// ─── Sequencing from Trade History ───

function computeSequencing(
  recentTrades: TradeHistoryEntry[],
): { cluster: GovernanceContext['sequencingCluster']; edgeDecaying: boolean; edgeDecayRate: number } {
  if (recentTrades.length < 3) {
    return { cluster: 'neutral', edgeDecaying: false, edgeDecayRate: 0 };
  }

  // Last 5 trades with recency weighting
  const last5 = recentTrades.slice(0, 5);
  const wins = last5.filter(t => t.isWin).length;
  const losses = last5.length - wins;

  let cluster: GovernanceContext['sequencingCluster'] = 'neutral';
  if (wins >= 4) cluster = 'profit-momentum';
  else if (losses >= 4) cluster = 'loss-cluster';
  else if (losses >= 3) cluster = 'mixed';

  // Edge decay: compare last 10 vs previous 10
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
  symbol: string,
  trades: TradeHistoryEntry[],
): { pairExpectancy: number; pairFavored: boolean } {
  const pairTrades = trades.filter(t => t.pair === symbol || t.pair === symbol.replace('/', '_'));
  if (pairTrades.length < 3) {
    // Default: neutral expectancy
    return { pairExpectancy: 55, pairFavored: false };
  }

  const winRate = pairTrades.filter(t => t.isWin).length / pairTrades.length;
  const avgPnl = pairTrades.reduce((s, t) => s + t.pnlPips, 0) / pairTrades.length;

  // Normalize to 0-100 scale: 50 = breakeven
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
  const sessionWindowMs = 30 * 60 * 1000; // 30 min window
  const sessionTrades = recentTrades.filter(t => now - t.timestamp < sessionWindowMs);

  const sessionLimits: Record<LiquiditySession, number> = {
    'london-open': 12,
    'ny-overlap': 10,
    asian: 6,
    'late-ny': 4,
  };

  return sessionTrades.length >= (sessionLimits[session] || 8);
}

// ─── Main Context Provider ───

export function getGovernanceContext(
  symbol: string,
  _timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): GovernanceContext {
  const displayPair = symbol.includes('/') ? symbol : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  const isMajor = MAJOR_PAIRS.has(displayPair);

  // ── 1. MTF Alignment — from QuantLabs analysis engine ──
  const ticker = getTickersByType('forex').find(t => t.symbol === displayPair);
  let htfSupports = false;
  let mtfConfirms = false;
  let ltfClean = false;
  let mtfAlignmentScore = 0;
  let atrValue = 0;
  let atrAvg = 0;

  if (ticker) {
    const mtfAnalysis = analyzeMultiTimeframe(ticker, ['15m', '1h', '4h', '1d']);
    const analyses = mtfAnalysis.analyses;

    // HTF: 4h + 1d agree on direction
    const htfBias4h = analyses['4h']?.bias;
    const htfBias1d = analyses['1d']?.bias;
    htfSupports = htfBias4h === htfBias1d && htfBias4h != null;

    // MTF: 1h aligns with HTF
    const mtfBias = analyses['1h']?.bias;
    mtfConfirms = mtfBias === htfBias4h;

    // LTF: 15m is clean (efficiency > 0.4)
    ltfClean = (analyses['15m']?.efficiency?.score ?? 0) > 0.4;

    // Score
    mtfAlignmentScore = mtfAnalysis.mtfAlignmentScore ?? (
      (htfSupports ? 40 : 0) + (mtfConfirms ? 35 : 0) + (ltfClean ? 25 : 0)
    );

    // ATR from 1h for volatility classification
    atrValue = analyses['1h']?.atr ?? 0;
    // Use 4h ATR as "average" baseline
    atrAvg = analyses['4h']?.atr ?? atrValue;
  }

  // ── 2. Regime Phase — from ATR analysis ──
  const { phase: volatilityPhase, confidence: phaseConfidence } = classifyVolatilityPhase(atrValue, atrAvg);

  // ── 3. Microstructure — from live OANDA prices ──
  const { spreadStabilityRank, currentSpread } = observeSpread(displayPair);
  const frictionRatio = computeFrictionRatio(atrValue, currentSpread);

  // ── 4. Session — from UTC time ──
  const currentSession = detectLiquiditySession();
  const sessionAggressiveness = SESSION_AGGRESSIVENESS[currentSession];

  // ── 5. Liquidity shock proxy ──
  const liquidityShockProb = estimateLiquidityShockProb(spreadStabilityRank, volatilityPhase, currentSession);

  // ── 6. Sequencing — from trade history ──
  const { cluster: sequencingCluster, edgeDecaying, edgeDecayRate } = computeSequencing(tradeHistory);

  // ── 7. Pair Performance — from trade history ──
  const { pairExpectancy, pairFavored } = computePairPerformance(displayPair, tradeHistory);

  // ── 8. Overtrading detection ──
  const overtradingThrottled = isOvertradingThrottled(tradeHistory, currentSession);

  return {
    mtfAlignmentScore,
    htfSupports,
    mtfConfirms,
    ltfClean,
    volatilityPhase,
    phaseConfidence,
    liquidityShockProb,
    spreadStabilityRank,
    frictionRatio,
    pairExpectancy,
    pairFavored,
    isMajorPair: isMajor,
    currentSession,
    sessionAggressiveness,
    edgeDecaying,
    edgeDecayRate,
    overtradingThrottled,
    sequencingCluster,
  };
}

// ─── Context Cache (per-symbol, short TTL) ───

const contextCache: Record<string, { ctx: GovernanceContext; ts: number }> = {};
const CONTEXT_CACHE_TTL = 5_000; // 5s cache per symbol

export function getGovernanceContextCached(
  symbol: string,
  timeframe: Timeframe = '15m',
  tradeHistory: TradeHistoryEntry[] = [],
): GovernanceContext {
  const key = `${symbol}:${timeframe}`;
  const now = Date.now();
  const cached = contextCache[key];

  if (cached && now - cached.ts < CONTEXT_CACHE_TTL) {
    return cached.ctx;
  }

  const ctx = getGovernanceContext(symbol, timeframe, tradeHistory);
  contextCache[key] = { ctx, ts: now };
  return ctx;
}
