// ─── Short Survivorship Scorer ───
// Same survivorship concept as longs, but with extra:
// - Snapback survival metric (% of winners that survived > 0.6R MAE)
// - MAE/MFE distribution analysis
// - PF validity guard (zero-loss denominator protection)

import type {
  ShortSurvivorshipEntry,
  SnapbackSurvivalMetrics,
  ShortRegime,
} from './shortTypes';
import type { LiquiditySession } from '../microstructureEngine';

// ─── Trade Record (from oanda_orders) ───

export interface ShortTradeRecord {
  pair: string;
  session: LiquiditySession;
  agentId: string;
  regime: ShortRegime;
  indicatorSignature: string;
  direction: 'short';
  pnlPips: number;
  maeR: number;          // MAE as multiple of initial risk
  mfeR: number;          // MFE as multiple of initial risk
  spreadPips: number;
  slippagePips: number;
  isWin: boolean;
  initialRiskR: number;  // initial risk in R units (1R = stop distance)
}

const PF_EPSILON = 0.001;

// ─── Compute Snapback Survival Metrics ───

export function computeSnapbackSurvival(trades: ShortTradeRecord[]): SnapbackSurvivalMetrics {
  if (trades.length === 0) {
    return {
      avgMaeR: 0,
      winRateWhenMaeGt05R: 0,
      winRateWhenMaeGt1R: 0,
      pctWinnersWithSnapback: 0,
      empiricalStopR: 1.5,
      sampleSize: 0,
    };
  }

  const avgMaeR = trades.reduce((s, t) => s + t.maeR, 0) / trades.length;

  // Win rate when MAE > 0.5R
  const maeGt05 = trades.filter(t => t.maeR > 0.5);
  const winRateWhenMaeGt05R = maeGt05.length > 0
    ? maeGt05.filter(t => t.isWin).length / maeGt05.length
    : 0;

  // Win rate when MAE > 1.0R
  const maeGt1 = trades.filter(t => t.maeR > 1.0);
  const winRateWhenMaeGt1R = maeGt1.length > 0
    ? maeGt1.filter(t => t.isWin).length / maeGt1.length
    : 0;

  // % of winners that survived snapback (> 0.6R adverse)
  const winners = trades.filter(t => t.isWin);
  const winnersWithSnapback = winners.filter(t => t.maeR > 0.6);
  const pctWinnersWithSnapback = winners.length > 0
    ? (winnersWithSnapback.length / winners.length) * 100
    : 0;

  // Empirical stop: find MAE level where 75% of eventual winners survive
  const sortedWinnerMae = winners.map(t => t.maeR).sort((a, b) => a - b);
  const p75Index = Math.floor(sortedWinnerMae.length * 0.75);
  const empiricalStopR = sortedWinnerMae.length > 0
    ? sortedWinnerMae[Math.min(p75Index, sortedWinnerMae.length - 1)] * 1.1  // 10% buffer
    : 1.5;

  return {
    avgMaeR,
    winRateWhenMaeGt05R,
    winRateWhenMaeGt1R,
    pctWinnersWithSnapback,
    empiricalStopR,
    sampleSize: trades.length,
  };
}

// ─── Compute Short Survivorship Entry ───

export function scoreShortSurvivorship(
  trades: ShortTradeRecord[],
  pair: string,
  session: LiquiditySession,
  agentId: string,
  indicatorSignature: string,
  regime: ShortRegime,
): ShortSurvivorshipEntry {
  const filtered = trades.filter(t =>
    t.pair === pair &&
    t.session === session &&
    t.agentId === agentId &&
    t.indicatorSignature === indicatorSignature &&
    t.regime === regime
  );

  const tradeCount = filtered.length;
  const wins = filtered.filter(t => t.isWin);
  const losses = filtered.filter(t => !t.isWin);

  const winRate = tradeCount > 0 ? wins.length / tradeCount : 0;
  const expectancy = tradeCount > 0
    ? filtered.reduce((s, t) => s + t.pnlPips, 0) / tradeCount
    : 0;

  // PF with zero-loss guard
  const grossProfit = wins.reduce((s, t) => s + t.pnlPips, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPips, 0));
  const profitFactor = grossLoss > PF_EPSILON ? grossProfit / grossLoss : null;

  // Snapback
  const snapback = computeSnapbackSurvival(filtered);

  // MAE/MFE
  const avgMae = tradeCount > 0 ? filtered.reduce((s, t) => s + t.maeR, 0) / tradeCount : 0;
  const avgMfe = tradeCount > 0 ? filtered.reduce((s, t) => s + t.mfeR, 0) / tradeCount : 0;
  const avgGiveBack = avgMfe > 0 ? Math.max(0, (1 - (expectancy / (avgMfe * (filtered[0]?.initialRiskR ?? 1)))) * 100) : 0;

  // Drawdown density
  let maxConsecutiveLoss = 0;
  let currentStreak = 0;
  let totalPips = 0;
  for (const t of filtered) {
    totalPips += Math.abs(t.pnlPips);
    if (!t.isWin) {
      currentStreak += Math.abs(t.pnlPips);
      maxConsecutiveLoss = Math.max(maxConsecutiveLoss, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  const drawdownDensity = totalPips > 0 ? maxConsecutiveLoss / totalPips : 0;

  // Friction
  const avgSpread = tradeCount > 0 ? filtered.reduce((s, t) => s + t.spreadPips, 0) / tradeCount : 0;
  const avgSlippage = tradeCount > 0 ? filtered.reduce((s, t) => s + t.slippagePips, 0) / tradeCount : 0;

  // Tier classification
  let tier: ShortSurvivorshipEntry['tier'] = 'suppress';
  let tierReason = '';

  if (tradeCount < 10) {
    tier = 'suppress';
    tierReason = `Insufficient sample (${tradeCount} < 10)`;
  } else if (
    expectancy > 0 &&
    (profitFactor === null || profitFactor >= 1.2) &&
    winRate >= 0.45 &&
    drawdownDensity < 0.5 &&
    snapback.pctWinnersWithSnapback > 30
  ) {
    tier = 'viable';
    tierReason = `Positive expectancy (${expectancy.toFixed(1)} pips), PF ${profitFactor?.toFixed(2) ?? 'N/A'}, snapback survival ${snapback.pctWinnersWithSnapback.toFixed(0)}%`;
  } else if (
    expectancy > -0.5 &&
    winRate >= 0.40 &&
    drawdownDensity < 0.65
  ) {
    tier = 'marginal';
    tierReason = `Borderline: expectancy ${expectancy.toFixed(1)}, WR ${(winRate * 100).toFixed(0)}%, DD density ${(drawdownDensity * 100).toFixed(0)}%`;
  } else {
    tier = 'suppress';
    tierReason = `Poor performance: expectancy ${expectancy.toFixed(1)}, WR ${(winRate * 100).toFixed(0)}%, DD density ${(drawdownDensity * 100).toFixed(0)}%`;
  }

  return {
    pair,
    session,
    agentId,
    indicatorSignature,
    regime,
    expectancy,
    profitFactor,
    winRate,
    tradeCount,
    snapback,
    avgMae,
    avgMfe,
    avgGiveBack,
    drawdownDensity,
    avgSpread,
    avgSlippage,
    tier,
    tierReason,
  };
}
