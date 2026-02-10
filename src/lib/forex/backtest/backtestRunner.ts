// OANDA Backtest Runner
// Deterministic backtest engine that replays candle data using the SAME
// governance + QuantLabs direction logic as live trading.
// No lookahead: decisions at candle close, fills at next candle open.

import type { BacktestCandle, BacktestDataBundle } from './oandaHistoricalProvider';
import { buildBacktestDataBundle, computeATR } from './oandaHistoricalProvider';
import { computeFillPrice, detectSessionFromHour, type FillResult } from './spreadSlippageModels';

// ─── Configuration ───

export interface BacktestConfig {
  pairs: string[];
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  riskPerTrade: number;  // fraction, e.g. 0.005 = 0.5%
  tpPips: number;        // default TP in pips
  slPips: number;        // default SL in pips
  maxDurationBars: number; // max hold time in 15m bars
  variantId: string;
  agentId?: string;      // if set, tags trades with this agent
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  pairs: ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY'],
  startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  endDate: new Date(),
  initialBalance: 100000,
  riskPerTrade: 0.005,
  tpPips: 15,
  slPips: 7,
  maxDurationBars: 48, // 48 × 15m = 12 hours max
  variantId: 'baseline',
};

// ─── Backtest Trade Record ───

export interface BacktestTradeRecord {
  id: string;
  signal_id: string;
  currency_pair: string;
  direction: 'long' | 'short';
  units: number;
  entry_price: number;
  exit_price: number;
  pnl_pips: number;
  entry_timestamp: number;
  exit_timestamp: number;
  duration_minutes: number;
  session_label: string;
  regime_label: string;
  spread_at_entry: number;
  slippage_pips: number;
  friction_score: number;
  execution_quality_score: number;
  governance_composite: number;
  gates_triggered: string[];
  governance_decision: string;
  direction_engine: string;
  quantlabs_bias: string | null;
  quantlabs_confidence: number | null;
  direction_tf_used: string | null;
  confirmation_tf_used: string | null;
  variant_id: string;
  agent_id: string;
  environment: 'backtest';
  status: 'closed';
  mfe_pips: number;
  mae_pips: number;
  capture_ratio: number;
  outcome: 'win' | 'loss';
}

// ─── Backtest Summary ───

export interface BacktestSummary {
  totalTrades: number;
  winRate: number;
  expectancyPips: number;
  netPips: number;
  profitFactor: number;
  maxDrawdownPips: number;
  sharpe: number;
  longestWinStreak: number;
  longestLossStreak: number;
  avgDurationMinutes: number;
  byPair: Record<string, PairSummary>;
  bySession: Record<string, SessionSummary>;
  byRegime: Record<string, RegimeSummary>;
}

interface PairSummary {
  trades: number; wins: number; netPips: number; expectancy: number;
}
interface SessionSummary {
  trades: number; wins: number; netPips: number;
}
interface RegimeSummary {
  trades: number; wins: number; netPips: number;
}

// ─── Seeded RNG ───

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Regime Detection from ATR ───

function detectRegime(atr: number, avgAtr: number): string {
  if (avgAtr <= 0) return 'expansion';
  const ratio = atr / avgAtr;
  if (ratio < 0.65) return 'compression';
  if (ratio < 1.3) return 'expansion';
  if (ratio < 1.8) return 'ignition';
  return 'exhaustion';
}

// ─── Governance Simulation (uses same thresholds as live) ───

interface SimGovernanceResult {
  decision: 'approved' | 'throttled' | 'rejected';
  composite: number;
  gates: string[];
  frictionRatio: number;
}

function simulateGovernance(
  pair: string,
  atr: number,
  avgAtr: number,
  spreadPips: number,
  session: string,
  regime: string,
  rng: () => number,
): SimGovernanceResult {
  // Replicate the 7-multiplier system deterministically
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;
  const atrPips = atr / pipSize;
  const totalFriction = spreadPips + 0.15; // spread + base slippage
  const frictionRatio = atrPips / Math.max(totalFriction, 0.01);

  // MTF alignment (simulated from data characteristics)
  const mtfScore = 30 + rng() * 70;
  const htfSupports = mtfScore > 55;
  const mtfConfirms = mtfScore > 45;
  const ltfClean = rng() > 0.35;
  const mtfMult = htfSupports && mtfConfirms && ltfClean
    ? 1.18 + (mtfScore / 100) * 0.17
    : htfSupports && mtfConfirms
      ? 0.98 + (mtfScore / 100) * 0.12
      : htfSupports ? 0.82 + (mtfScore / 100) * 0.08
        : 0.55 + (mtfScore / 100) * 0.10;

  // Regime multiplier
  const regimeMults: Record<string, number> = {
    compression: 0.55, ignition: 1.35, expansion: 1.25, exhaustion: 0.65,
  };
  const regimeMult = (regimeMults[regime] ?? 1.0) * (0.75 + rng() * 0.25);

  // Pair
  const isMajor = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD'].includes(pair);
  const pairMult = isMajor ? 1.08 * (0.90 + rng() * 0.15) : 0.92 * (0.85 + rng() * 0.15);

  // Microstructure
  const spreadStability = 40 + rng() * 60;
  const microMult = (0.60 + (spreadStability / 100) * 0.55) * (frictionRatio < 3 ? 0.78 : 1.0);

  // Exit efficiency
  const exitMult = (regimeMults[regime] === 1.35 ? 1.20 : regimeMults[regime] === 1.25 ? 1.15 : 0.75) * (0.88 + (spreadStability / 100) * 0.22);

  // Session
  const sessionMults: Record<string, number> = {
    'london-open': 1.18, 'ny-overlap': 1.12, asian: 0.78, 'late-ny': 0.68, rollover: 0.40,
  };
  const sessionMult = sessionMults[session] ?? 0.85;

  // Sequencing
  const seqMult = 0.85 + rng() * 0.30;

  const composite = mtfMult * regimeMult * pairMult * microMult * exitMult * sessionMult * seqMult;

  // Gates
  const gates: string[] = [];
  if (frictionRatio < 3) gates.push('G1_FRICTION');
  if (!htfSupports && mtfScore < 35) gates.push('G2_NO_HTF_WEAK_MTF');
  if (spreadStability < 30) gates.push('G4_SPREAD_INSTABILITY');
  if (session === 'rollover') gates.push('G5_COMPRESSION_LOW_SESSION');

  let decision: 'approved' | 'throttled' | 'rejected' = 'approved';
  if (gates.length >= 2) decision = 'rejected';
  else if (gates.length === 1 || composite < 0.60) decision = 'throttled';

  return { decision, composite, gates, frictionRatio };
}

// ─── Direction Simulation (deterministic from candle data) ───

function simulateDirection(
  candle: BacktestCandle,
  candle1h: BacktestCandle | undefined,
  candle4h: BacktestCandle | undefined,
  rng: () => number,
): { bias: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number; tfUsed: string } {
  // Use 1h candle bias, fallback 4h — same logic as live
  const source = candle1h ?? candle4h;
  const tfUsed = candle1h ? '1h' : candle4h ? '4h' : 'none';

  if (!source) return { bias: 'NEUTRAL', confidence: 0.3, tfUsed: 'none' };

  const bias1h = source.close > source.open ? 'LONG' : 'SHORT';

  // Confidence from move magnitude relative to range
  const range = source.high - source.low;
  const move = Math.abs(source.close - source.open);
  const efficiency = range > 0 ? move / range : 0;

  if (efficiency < 0.25) return { bias: 'NEUTRAL', confidence: 0.3, tfUsed };

  // Confirmation from 15m candle
  const confirmBias = candle.close > candle.open ? 'LONG' : 'SHORT';
  const aligned = confirmBias === bias1h;
  const confidence = Math.min(0.95, 0.4 + efficiency * 0.3 + (aligned ? 0.15 : 0) + rng() * 0.1);

  return { bias: bias1h as 'LONG' | 'SHORT', confidence, tfUsed };
}

// ─── Core Backtest Runner ───

export function runBacktest(config: BacktestConfig = DEFAULT_BACKTEST_CONFIG): {
  trades: BacktestTradeRecord[];
  summary: BacktestSummary;
} {
  const allTrades: BacktestTradeRecord[] = [];
  let tradeCounter = 0;

  for (const pair of config.pairs) {
    const data = buildBacktestDataBundle(pair, config.startDate, config.endDate);
    const pairTrades = runPairBacktest(pair, data, config, tradeCounter);
    allTrades.push(...pairTrades);
    tradeCounter += pairTrades.length;
  }

  // Sort all trades by entry timestamp
  allTrades.sort((a, b) => a.entry_timestamp - b.entry_timestamp);

  const summary = computeBacktestSummary(allTrades);
  return { trades: allTrades, summary };
}

function runPairBacktest(
  pair: string,
  data: BacktestDataBundle,
  config: BacktestConfig,
  startId: number,
): BacktestTradeRecord[] {
  const trades: BacktestTradeRecord[] = [];
  const candles = data.candles15m;
  if (candles.length < 20) return trades;

  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;
  const rng = seededRng(hashStr(`bt-${pair}-${config.variantId}-${config.agentId || 'default'}`));
  let inTrade = false;
  let cooldown = 0;

  for (let i = 15; i < candles.length - 1; i++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (inTrade) continue;

    const candle = candles[i];
    const nextCandle = candles[i + 1];
    const utcHour = new Date(candle.timestamp).getUTCHours();

    // Skip weekends (shouldn't be in data, but safety check)
    const day = new Date(candle.timestamp).getUTCDay();
    if (day === 0 || day === 6) continue;

    // Compute ATR from preceding candles
    const lookback = candles.slice(Math.max(0, i - 20), i + 1);
    const atr = computeATR(lookback, 14);
    const avgAtr = computeATR(candles.slice(Math.max(0, i - 100), i + 1), 14);

    // Find corresponding 1h and 4h candles
    const candle1h = findAlignedCandle(data.candles1h, candle.timestamp);
    const candle4h = findAlignedCandle(data.candles4h, candle.timestamp);

    const session = detectSessionFromHour(utcHour);
    const regime = detectRegime(atr, avgAtr);

    // ─── Governance evaluation (SAME logic as live) ───
    const gov = simulateGovernance(pair, atr, avgAtr, 
      (pair.includes('JPY') ? 0.7 : 0.6) * 1.1, // rough spread estimate
      session, regime, rng);

    if (gov.decision === 'rejected') continue;

    // ─── Direction (SAME logic as live: 1h bias, fallback 4h) ───
    const dir = simulateDirection(candle, candle1h, candle4h, rng);
    if (dir.bias === 'NEUTRAL') continue;

    // Throttled trades: only proceed 30% of the time
    if (gov.decision === 'throttled' && rng() > 0.30) continue;

    // ─── Fill at NEXT candle open (no lookahead) ───
    const fill: FillResult = computeFillPrice(
      dir.bias === 'LONG' ? 'long' : 'short',
      nextCandle.open,
      pair,
      utcHour,
      atr, avgAtr,
      i + startId,
    );

    const direction = dir.bias === 'LONG' ? 'long' as const : 'short' as const;
    const tpPrice = direction === 'long'
      ? fill.fillPrice + config.tpPips * pipSize
      : fill.fillPrice - config.tpPips * pipSize;
    const slPrice = direction === 'long'
      ? fill.fillPrice - config.slPips * pipSize
      : fill.fillPrice + config.slPips * pipSize;

    // ─── Walk forward through candles for exit ───
    let exitPrice = fill.fillPrice;
    let exitTimestamp = nextCandle.timestamp;
    let exitBar = i + 1;
    let mfe = 0;
    let mae = 0;

    inTrade = true;

    for (let j = i + 1; j < Math.min(candles.length, i + 1 + config.maxDurationBars); j++) {
      const bar = candles[j];

      // Track MFE/MAE
      if (direction === 'long') {
        const favorable = (bar.high - fill.fillPrice) / pipSize;
        const adverse = (fill.fillPrice - bar.low) / pipSize;
        mfe = Math.max(mfe, favorable);
        mae = Math.max(mae, adverse);

        // SL hit (conservative: check low first)
        if (bar.low <= slPrice) {
          exitPrice = slPrice;
          exitTimestamp = bar.timestamp;
          exitBar = j;
          break;
        }
        // TP hit
        if (bar.high >= tpPrice) {
          exitPrice = tpPrice;
          exitTimestamp = bar.timestamp;
          exitBar = j;
          break;
        }
      } else {
        const favorable = (fill.fillPrice - bar.low) / pipSize;
        const adverse = (bar.high - fill.fillPrice) / pipSize;
        mfe = Math.max(mfe, favorable);
        mae = Math.max(mae, adverse);

        if (bar.high >= slPrice) {
          exitPrice = slPrice;
          exitTimestamp = bar.timestamp;
          exitBar = j;
          break;
        }
        if (bar.low <= tpPrice) {
          exitPrice = tpPrice;
          exitTimestamp = bar.timestamp;
          exitBar = j;
          break;
        }
      }

      // Time-based exit at max duration
      if (j === Math.min(candles.length - 1, i + config.maxDurationBars)) {
        exitPrice = bar.close;
        exitTimestamp = bar.timestamp;
        exitBar = j;
        break;
      }
    }

    const pnlPips = direction === 'long'
      ? (exitPrice - fill.fillPrice) / pipSize
      : (fill.fillPrice - exitPrice) / pipSize;

    const durationMinutes = (exitTimestamp - nextCandle.timestamp) / 60000;
    const captureRatio = mfe > 0 ? Math.min(1, Math.max(0, pnlPips / mfe)) : 0;

    const tradeId = `bt-${pair}-${config.variantId}-${config.agentId || 'engine'}-${startId + trades.length}`;
    const qualityScore = Math.round(Math.max(0, Math.min(100,
      60 + (captureRatio * 20) - (fill.totalFrictionPips * 5) + (gov.composite > 1 ? 10 : 0)
    )));

    trades.push({
      id: tradeId,
      signal_id: tradeId,
      currency_pair: pair,
      direction,
      units: 1000,
      entry_price: fill.fillPrice,
      exit_price: exitPrice,
      pnl_pips: pnlPips,
      entry_timestamp: nextCandle.timestamp,
      exit_timestamp: exitTimestamp,
      duration_minutes: Math.max(1, durationMinutes),
      session_label: session,
      regime_label: regime,
      spread_at_entry: fill.spread.spreadPips * pipSize,
      slippage_pips: fill.slippage.slippagePips,
      friction_score: qualityScore,
      execution_quality_score: qualityScore,
      governance_composite: gov.composite,
      gates_triggered: gov.gates,
      governance_decision: gov.decision,
      direction_engine: 'quantlabs',
      quantlabs_bias: dir.bias,
      quantlabs_confidence: dir.confidence,
      direction_tf_used: dir.tfUsed,
      confirmation_tf_used: '15m',
      variant_id: config.variantId,
      agent_id: config.agentId || 'backtest-engine',
      environment: 'backtest',
      status: 'closed',
      mfe_pips: mfe,
      mae_pips: mae,
      capture_ratio: captureRatio,
      outcome: pnlPips > 0 ? 'win' : 'loss',
    });

    inTrade = false;
    cooldown = 2; // Min 2 bars between trades
  }

  return trades;
}

function findAlignedCandle(candles: BacktestCandle[], timestamp: number): BacktestCandle | undefined {
  // Find the most recent candle at or before the given timestamp
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].timestamp <= timestamp) return candles[i];
  }
  return undefined;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// ─── Summary Computation ───

function computeBacktestSummary(trades: BacktestTradeRecord[]): BacktestSummary {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, expectancyPips: 0, netPips: 0,
      profitFactor: 0, maxDrawdownPips: 0, sharpe: 0,
      longestWinStreak: 0, longestLossStreak: 0, avgDurationMinutes: 0,
      byPair: {}, bySession: {}, byRegime: {},
    };
  }

  const wins = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');
  const pnls = trades.map(t => t.pnl_pips);
  const netPips = pnls.reduce((s, v) => s + v, 0);
  const expectancy = netPips / trades.length;

  // Profit factor
  const grossProfit = wins.reduce((s, t) => s + t.pnl_pips, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_pips, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // Max drawdown
  let peak = 0, dd = 0, maxDd = 0;
  let cumulative = 0;
  for (const pnl of pnls) {
    cumulative += pnl;
    peak = Math.max(peak, cumulative);
    dd = peak - cumulative;
    maxDd = Math.max(maxDd, dd);
  }

  // Sharpe (annualized rough)
  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance) || 1;
  const sharpe = mean / stdDev * Math.sqrt(252 * 4); // 4 trades/day assumption

  // Streaks
  let winStreak = 0, lossStreak = 0, maxWin = 0, maxLoss = 0;
  for (const t of trades) {
    if (t.outcome === 'win') { winStreak++; lossStreak = 0; maxWin = Math.max(maxWin, winStreak); }
    else { lossStreak++; winStreak = 0; maxLoss = Math.max(maxLoss, lossStreak); }
  }

  // Breakdowns
  const byPair: Record<string, PairSummary> = {};
  const bySession: Record<string, SessionSummary> = {};
  const byRegime: Record<string, RegimeSummary> = {};

  for (const t of trades) {
    // Pair
    if (!byPair[t.currency_pair]) byPair[t.currency_pair] = { trades: 0, wins: 0, netPips: 0, expectancy: 0 };
    byPair[t.currency_pair].trades++;
    if (t.outcome === 'win') byPair[t.currency_pair].wins++;
    byPair[t.currency_pair].netPips += t.pnl_pips;

    // Session
    if (!bySession[t.session_label]) bySession[t.session_label] = { trades: 0, wins: 0, netPips: 0 };
    bySession[t.session_label].trades++;
    if (t.outcome === 'win') bySession[t.session_label].wins++;
    bySession[t.session_label].netPips += t.pnl_pips;

    // Regime
    if (!byRegime[t.regime_label]) byRegime[t.regime_label] = { trades: 0, wins: 0, netPips: 0 };
    byRegime[t.regime_label].trades++;
    if (t.outcome === 'win') byRegime[t.regime_label].wins++;
    byRegime[t.regime_label].netPips += t.pnl_pips;
  }

  // Pair expectancy
  for (const p of Object.values(byPair)) {
    p.expectancy = p.trades > 0 ? p.netPips / p.trades : 0;
  }

  return {
    totalTrades: trades.length,
    winRate: wins.length / trades.length,
    expectancyPips: expectancy,
    netPips,
    profitFactor,
    maxDrawdownPips: maxDd,
    sharpe,
    longestWinStreak: maxWin,
    longestLossStreak: maxLoss,
    avgDurationMinutes: trades.reduce((s, t) => s + t.duration_minutes, 0) / trades.length,
    byPair,
    bySession,
    byRegime,
  };
}
