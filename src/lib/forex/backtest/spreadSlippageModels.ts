// Spread & Slippage Models for Backtest Execution Realism
// Deterministic, session-aware friction simulation for OANDA backtesting.

export type BacktestSession = 'asian' | 'london-open' | 'ny-overlap' | 'late-ny' | 'rollover';

// ─── Pair-Specific Spread Baselines (pips) ───

export const PAIR_SPREAD_BASELINES: Record<string, number> = {
  EUR_USD: 0.6, GBP_USD: 0.9, USD_JPY: 0.7, AUD_USD: 0.8,
  USD_CAD: 1.0, EUR_JPY: 1.1, GBP_JPY: 1.5, EUR_GBP: 0.8,
  NZD_USD: 1.2, AUD_JPY: 1.3, USD_CHF: 1.0, EUR_CHF: 1.2,
  EUR_AUD: 1.6, GBP_AUD: 2.0, AUD_NZD: 1.8,
};

// ─── Session Spread Multipliers ───

const SESSION_SPREAD_MULTIPLIERS: Record<BacktestSession, number> = {
  'london-open': 0.85,
  'ny-overlap': 0.90,
  'asian': 1.30,
  'late-ny': 1.20,
  'rollover': 1.80,
};

// ─── Volatility Spread Multiplier (ATR-based) ───

function volatilitySpreadMultiplier(atr: number, avgAtr: number): number {
  if (avgAtr <= 0) return 1.0;
  const ratio = atr / avgAtr;
  if (ratio < 0.7) return 0.90;  // Low vol → tighter
  if (ratio < 1.3) return 1.00;  // Normal
  if (ratio < 1.8) return 1.15;  // Elevated
  return 1.35;                    // High vol → wider
}

// ─── Detect Session from UTC hour ───

export function detectSessionFromHour(utcHour: number): BacktestSession {
  if (utcHour >= 21 || utcHour < 1) return 'rollover';
  if (utcHour >= 1 && utcHour < 7) return 'asian';
  if (utcHour >= 7 && utcHour < 12) return 'london-open';
  if (utcHour >= 12 && utcHour < 17) return 'ny-overlap';
  return 'late-ny';
}

// ─── Compute Simulated Spread (pips) ───

export interface SpreadModel {
  spreadPips: number;
  spreadRaw: number; // In price units (e.g., 0.00006 for EUR/USD)
  sessionMultiplier: number;
  volatilityMultiplier: number;
  model: 'simulated';
}

export function computeBacktestSpread(
  pair: string,
  utcHour: number,
  atr: number,
  avgAtr: number,
  seed: number = 0,
): SpreadModel {
  const basePips = PAIR_SPREAD_BASELINES[pair] ?? 1.5;
  const session = detectSessionFromHour(utcHour);
  const sessionMult = SESSION_SPREAD_MULTIPLIERS[session];
  const volMult = volatilitySpreadMultiplier(atr, avgAtr);

  // Deterministic jitter from seed
  const jitter = 0.92 + (Math.abs(Math.sin(seed * 12345.6789)) * 0.16);

  const spreadPips = basePips * sessionMult * volMult * jitter;
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;
  const spreadRaw = spreadPips * pipSize;

  return {
    spreadPips,
    spreadRaw,
    sessionMultiplier: sessionMult,
    volatilityMultiplier: volMult,
    model: 'simulated',
  };
}

// ─── Slippage Model ───

export interface SlippageModel {
  slippagePips: number;
  slippageRaw: number;
  baseSlippage: number;
  volatilityAdjustment: number;
  sessionAdjustment: number;
  model: 'simulated';
}

const SESSION_SLIPPAGE_ADJUSTMENT: Record<BacktestSession, number> = {
  'london-open': -0.02,
  'ny-overlap': 0.0,
  'asian': 0.05,
  'late-ny': 0.08,
  'rollover': 0.15,
};

export function computeBacktestSlippage(
  pair: string,
  utcHour: number,
  atr: number,
  avgAtr: number,
  seed: number = 0,
): SlippageModel {
  const session = detectSessionFromHour(utcHour);

  // Base slippage: 0.1–0.3 pips for majors, higher for crosses
  const basePips = (PAIR_SPREAD_BASELINES[pair] ?? 1.5) * 0.15;

  // ATR-based volatility adjustment
  const atrRatio = avgAtr > 0 ? atr / avgAtr : 1;
  const volAdj = Math.max(0, (atrRatio - 1) * 0.1);

  // Session adjustment
  const sessionAdj = SESSION_SLIPPAGE_ADJUSTMENT[session];

  // Deterministic jitter
  const jitter = 0.8 + (Math.abs(Math.cos(seed * 54321.9876)) * 0.4);

  const slippagePips = Math.max(0, (basePips + volAdj + sessionAdj) * jitter);
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;

  return {
    slippagePips,
    slippageRaw: slippagePips * pipSize,
    baseSlippage: basePips,
    volatilityAdjustment: volAdj,
    sessionAdjustment: sessionAdj,
    model: 'simulated',
  };
}

// ─── Fill Price Computation ───

export interface FillResult {
  fillPrice: number;
  spread: SpreadModel;
  slippage: SlippageModel;
  totalFrictionPips: number;
}

export function computeFillPrice(
  direction: 'long' | 'short',
  midPrice: number,
  pair: string,
  utcHour: number,
  atr: number,
  avgAtr: number,
  seed: number,
): FillResult {
  const spread = computeBacktestSpread(pair, utcHour, atr, avgAtr, seed);
  const slippage = computeBacktestSlippage(pair, utcHour, atr, avgAtr, seed + 1);

  const halfSpread = spread.spreadRaw / 2;

  // BUY fills at ask + slippage, SELL fills at bid - slippage
  const fillPrice = direction === 'long'
    ? midPrice + halfSpread + slippage.slippageRaw
    : midPrice - halfSpread - slippage.slippageRaw;

  return {
    fillPrice,
    spread,
    slippage,
    totalFrictionPips: spread.spreadPips + slippage.slippagePips,
  };
}
