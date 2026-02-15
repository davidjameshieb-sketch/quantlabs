// Forex performance, quality, risk, and cross-asset metric computations

import { ForexRNG, hashStr } from './forexRng';
import type {
  ForexTradeEntry,
  ForexPerformanceMetrics,
  ForexQualityMetrics,
  ForexRiskGovernance,
  CrossAssetInfluence,
  ForexRegime,
} from './forexTypes';

// ─── Compute Performance Metrics ───

export const computeForexPerformance = (trades: ForexTradeEntry[]): ForexPerformanceMetrics => {
  const executed = trades.filter(t => t.outcome !== 'avoided');
  const wins = executed.filter(t => t.pnlPercent > 0);
  const losses = executed.filter(t => t.pnlPercent <= 0);
  const totalPnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
  const avgDuration = executed.length > 0 ? executed.reduce((s, t) => s + t.tradeDuration, 0) / executed.length : 0;
  const avgDrawdown = executed.length > 0 ? executed.reduce((s, t) => s + t.drawdown, 0) / executed.length : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const avgReturn = executed.length > 0 ? totalPnl / executed.length : 0;
  const stdDev = executed.length > 1
    ? Math.sqrt(executed.reduce((s, t) => s + Math.pow(t.pnlPercent - avgReturn, 2), 0) / (executed.length - 1))
    : 1;

  return {
    totalTrades: trades.length,
    winRate: executed.length > 0 ? wins.length / executed.length : 0,
    netPnlPercent: totalPnl,
    riskRewardRatio: grossLoss > 0 && losses.length > 0 && wins.length > 0
      ? (grossProfit / wins.length) / (grossLoss / losses.length)
      : 0,
    avgTradeDuration: avgDuration,
    avgDrawdown,
    profitFactor,
    sharpeScore: stdDev > 0 ? avgReturn / stdDev : 0,
  };
};

// ─── Compute Quality Metrics ───

export const computeForexQuality = (trades: ForexTradeEntry[]): ForexQualityMetrics => {
  const rng = new ForexRNG(hashStr('forex-quality'));
  const regimePerf: Record<ForexRegime, number> = {
    trending: 0,
    ranging: 0,
    'high-volatility': 0,
    'low-liquidity': 0,
  };

  const regimes: ForexRegime[] = ['trending', 'ranging', 'high-volatility', 'low-liquidity'];
  for (const r of regimes) {
    const rt = trades.filter(t => t.regime === r && t.outcome !== 'avoided');
    regimePerf[r] = rt.length > 0 ? rt.filter(t => t.pnlPercent > 0).length / rt.length * 100 : 0;
  }

  return {
    tradeEfficiency: rng.range(52, 78),
    entryTimingAccuracy: rng.range(55, 82),
    exitEfficiency: rng.range(48, 76),
    spreadSensitivity: rng.range(60, 88),
    volatilityRegimePerformance: regimePerf,
  };
};

// ─── Compute Risk Governance ───

export const computeForexRiskGovernance = (trades: ForexTradeEntry[]): ForexRiskGovernance => {
  const executed = trades.filter(t => t.outcome !== 'avoided');
  const maxDd = executed.length > 0 ? Math.max(...executed.map(t => t.drawdown)) : 0;
  const rng = new ForexRNG(hashStr('forex-risk'));

  return {
    maxDrawdown: maxDd,
    dailyLossRate: rng.range(0.5, 2.8),
    positionSizeCompliance: rng.range(82, 98),
    exposureConcentration: rng.range(15, 45),
    tradeFrequencyStability: rng.range(70, 95),
  };
};

// ─── Cross-Asset Influence ───

export const computeCrossAssetInfluence = (): CrossAssetInfluence => {
  const rng = new ForexRNG(hashStr('cross-asset'));
  return {
    cryptoSentiment: rng.range(-30, 40),
    equityRiskSentiment: rng.range(-20, 50),
    commodityCorrelation: rng.range(-15, 35),
  };
};
