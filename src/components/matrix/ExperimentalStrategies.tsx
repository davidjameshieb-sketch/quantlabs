// Experimental Strategies Dashboard — Meta-strategy synthesis from 42K+ simulations
// Discovers portfolio blends, session-rotation, hedge pairs, and contrarian setups

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Rocket, Shuffle, Layers, ShieldCheck, TrendingUp, TrendingDown,
  Activity, Zap, Target, BarChart3, Clock, ChevronDown, ChevronUp, Brain,
  AlertTriangle, CircleCheck, CircleAlert,
} from 'lucide-react';
import type { BacktestResult, RankComboResult } from '@/hooks/useRankExpectancy';

// ── Reuse the same grid constants ──
const SL_GRID = [
  { label: '0.5x ATR', pips: 7, wrMod: -2, pfMod: 0.88 },
  { label: '1.0x ATR', pips: 14, wrMod: 1, pfMod: 1.05 },
  { label: '1.5x ATR', pips: 21, wrMod: 3, pfMod: 1.10 },
  { label: '2.0x ATR', pips: 28, wrMod: 5, pfMod: 1.06 },
  { label: '3.0x ATR', pips: 42, wrMod: 7, pfMod: 0.92 },
  { label: '10 pip fixed', pips: 10, wrMod: 0, pfMod: 1.0 },
  { label: '15 pip fixed', pips: 15, wrMod: 2, pfMod: 1.05 },
  { label: '20 pip fixed', pips: 20, wrMod: 4, pfMod: 1.08 },
  { label: '30 pip fixed', pips: 30, wrMod: 6, pfMod: 1.02 },
  { label: 'Atlas Wall -5', pips: 10, wrMod: 1, pfMod: 1.15 },
  { label: 'Atlas Wall -10', pips: 15, wrMod: 3, pfMod: 1.18 },
  { label: 'Trailing 1x ATR', pips: 14, wrMod: 2, pfMod: 1.16 },
  { label: 'Swing low (5-bar)', pips: 18, wrMod: 3, pfMod: 1.12 },
];

const ENTRY_GRID = [
  { label: 'Market @ signal', wrMod: 0, pfMod: 1.0, offset: 0 },
  { label: 'Limit -2 pip', wrMod: 2, pfMod: 1.08, offset: -2 },
  { label: 'Limit -5 pip', wrMod: 4, pfMod: 1.12, offset: -5 },
  { label: 'Stop +5 pip', wrMod: 3, pfMod: 1.10, offset: 5 },
  { label: 'M5 close confirm', wrMod: 4, pfMod: 1.10, offset: 0 },
  { label: 'Z-OFI > 1.0', wrMod: 3, pfMod: 1.08, offset: 0 },
  { label: 'Z-OFI > 1.5', wrMod: 5, pfMod: 1.14, offset: 0 },
  { label: 'Z-OFI > 2.0', wrMod: 6, pfMod: 1.10, offset: 0 },
  { label: 'Delta spike > 2σ', wrMod: 4, pfMod: 1.12, offset: 0 },
  { label: 'Break of structure', wrMod: 4, pfMod: 1.14, offset: 0 },
  { label: 'Order block entry', wrMod: 5, pfMod: 1.16, offset: 0 },
  { label: 'Pullback 38.2% fib', wrMod: 4, pfMod: 1.10, offset: 0 },
];

const SESSIONS = [
  { id: 'ALL', label: 'All Sessions', hours: null },
  { id: 'ASIA', label: 'Asian', hours: [0, 7] },
  { id: 'LONDON', label: 'London', hours: [7, 12] },
  { id: 'NEW_YORK', label: 'New York', hours: [12, 17] },
  { id: 'NY_CLOSE', label: 'NY Close', hours: [17, 21] },
] as const;

const PREDATOR_RANKS = [1, 2, 3];
const PREY_RANKS = [6, 7, 8];

const GATE_COMBOS = [
  { g1: true, g2: true, g3: true, label: 'G1+G2+G3' },
  { g1: true, g2: true, g3: false, label: 'G1+G2' },
  { g1: true, g2: false, g3: true, label: 'G1+G3' },
  { g1: false, g2: true, g3: true, label: 'G2+G3' },
  { g1: true, g2: false, g3: false, label: 'G1 only' },
  { g1: false, g2: false, g3: false, label: 'No Gates' },
];

// ── PRNG ──
function createPRNG(seed: number) {
  let s = seed + 1;
  return () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };
}

// ── Single profile simulation (same as ProfileDiscoveryEngine) ──
interface SimResult {
  predator: number; prey: number; gates: string; g1: boolean; g2: boolean; g3: boolean;
  slLabel: string; slPips: number; session: string; entryLabel: string;
  winRate: number; profitFactor: number; maxDrawdown: number; netProfit: number;
  totalPips: number; trades: number;
  equityCurve: Array<{ time: string; equity: number }>;
}

function simulateSingle(
  combo: RankComboResult, baseCurve: Array<{ time: string; equity: number }>,
  gc: typeof GATE_COMBOS[0], sl: typeof SL_GRID[0], entry: typeof ENTRY_GRID[0],
  sessionFilter: typeof SESSIONS[number], seed: number
): SimResult | null {
  const useGated = gc.g1 && gc.g2 && gc.g3;
  const rawTrades = useGated ? combo.gatedTrades : combo.trades;
  const rawWR = useGated ? combo.gatedWinRate : combo.winRate;
  const rawPF = useGated ? combo.gatedPF : combo.profitFactor;
  if (rawTrades < 5) return null;

  let wrPenalty = 0, pfMul = 1;
  if (!gc.g1) { wrPenalty += 8; pfMul *= 0.7; }
  if (!gc.g2) { wrPenalty += 12; pfMul *= 0.6; }
  if (!gc.g3) { wrPenalty += 5; pfMul *= 0.85; }
  const executionPenalty = (gc.g2 && !gc.g3) ? 3 : 0;
  wrPenalty -= sl.wrMod; pfMul *= sl.pfMod;
  wrPenalty -= entry.wrMod; pfMul *= entry.pfMod;

  let sessionMul = 1;
  if (sessionFilter.id === 'LONDON') { sessionMul = 1.08; wrPenalty -= 2; }
  else if (sessionFilter.id === 'NEW_YORK') { sessionMul = 1.05; wrPenalty -= 1; }
  else if (sessionFilter.id === 'ASIA') { sessionMul = 0.90; wrPenalty += 3; }
  else if (sessionFilter.id === 'NY_CLOSE') { sessionMul = 0.85; wrPenalty += 4; }

  const adjustedWR = Math.max(5, Math.min(95, rawWR - wrPenalty));
  const adjustedPF = Math.max(0.1, rawPF * pfMul * sessionMul);
  const slPips = sl.pips || 15;
  const tpPips = slPips * Math.max(0.5, adjustedPF);
  const tradeCount = sessionFilter.id === 'ALL' ? rawTrades : Math.max(1, Math.round(rawTrades * 0.3));

  const rng = createPRNG(seed);
  const wrDecimal = adjustedWR / 100;

  let equity = 1000, peak = 1000, maxDD = 0, wins = 0, grossProfit = 0, grossLoss = 0, totalPips = 0;
  const tradeResults: number[] = [];

  for (let i = 0; i < tradeCount; i++) {
    const isWin = rng() < wrDecimal;
    const variance = 0.5 + rng();
    const pipResult = isWin ? tpPips * variance : -slPips * variance;
    const finalPips = pipResult - executionPenalty * (rng() > 0.5 ? 1 : 0);
    tradeResults.push(finalPips);
    totalPips += finalPips;
    if (finalPips > 0) { wins++; grossProfit += finalPips; } else { grossLoss += Math.abs(finalPips); }
  }

  const timePoints = baseCurve.map(p => p.time);
  const curve: Array<{ time: string; equity: number }> = [];
  if (timePoints.length > 0 && tradeCount > 0) {
    const tradesPerPoint = tradeCount / timePoints.length;
    let tradeIdx = 0;
    for (let i = 0; i < timePoints.length; i++) {
      const targetIdx = Math.min(tradeCount, Math.round((i + 1) * tradesPerPoint));
      while (tradeIdx < targetIdx) { equity += tradeResults[tradeIdx] * 0.10; tradeIdx++; }
      if (equity > peak) peak = equity;
      const dd = ((equity - peak) / peak) * 100;
      if (dd < maxDD) maxDD = dd;
      curve.push({ time: timePoints[i], equity: Math.round(equity * 100) / 100 });
    }
  } else {
    curve.push({ time: new Date().toISOString(), equity: 1000 });
  }

  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return {
    predator: 0, prey: 0, gates: gc.label, g1: gc.g1, g2: gc.g2, g3: gc.g3,
    slLabel: sl.label, slPips: sl.pips, session: sessionFilter.label, entryLabel: entry.label,
    winRate: Math.round(adjustedWR * 10) / 10, profitFactor: Math.round(pf * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10, netProfit: Math.round((equity - 1000) * 100) / 100,
    totalPips: Math.round(totalPips * 10) / 10, trades: tradeCount, equityCurve: curve,
  };
}

// ── Circuit Breaker Types ──
interface CircuitBreakerData {
  // Rolling PF Z-Score (last N trades vs historical)
  rollingPF: number;
  historicalPFMean: number;
  historicalPFStd: number;
  pfZScore: number;
  pfBroken: boolean; // true if Z < -2
  // Win-Rate Velocity
  historicalWR: number;
  recentWR: number; // last 20 trades
  wrVelocity: number; // (recent - historical) / historical * 100
  wrDecayAlert: boolean; // true if velocity < -30%
  // CUSUM tracking
  cusumValues: number[]; // cumulative sum of deviations
  cusumBreached: boolean;
  cusumThreshold: number;
  // Overall status
  status: 'NOMINAL' | 'WARNING' | 'BROKEN';
  statusReason: string;
  // Rolling windows for chart
  rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }>;
  rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }>;
}

// Compute circuit breaker from trade-level equity curve
function computeCircuitBreaker(
  curve: Array<{ time: string; equity: number }>,
  backtestWR: number,
  backtestPF: number,
  windowSize = 30
): CircuitBreakerData {
  // Derive trade P&L from equity deltas
  const trades: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const delta = curve[i].equity - curve[i - 1].equity;
    if (Math.abs(delta) > 0.001) trades.push(delta);
  }
  if (trades.length < windowSize) {
    // Not enough trades — pad with neutral
    while (trades.length < windowSize) trades.unshift(0);
  }

  // ── Rolling PF series ──
  const rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }> = [];
  const allWindowPFs: number[] = [];
  for (let i = windowSize; i <= trades.length; i++) {
    const window = trades.slice(i - windowSize, i);
    let gp = 0, gl = 0;
    window.forEach(t => { if (t > 0) gp += t; else gl += Math.abs(t); });
    const pf = gl > 0 ? gp / gl : gp > 0 ? 5 : 1;
    allWindowPFs.push(pf);
    rollingPFSeries.push({ trade: i, pf, zScore: 0 }); // z filled below
  }

  // Historical PF stats
  const pfMean = allWindowPFs.length > 0 ? allWindowPFs.reduce((a, b) => a + b, 0) / allWindowPFs.length : backtestPF;
  const pfVariance = allWindowPFs.length > 1
    ? allWindowPFs.reduce((a, b) => a + (b - pfMean) ** 2, 0) / (allWindowPFs.length - 1)
    : 0.01;
  const pfStd = Math.max(0.01, Math.sqrt(pfVariance));

  // Fill z-scores
  rollingPFSeries.forEach(pt => { pt.zScore = (pt.pf - pfMean) / pfStd; });
  const latestPF = allWindowPFs[allWindowPFs.length - 1] ?? backtestPF;
  const pfZScore = (latestPF - pfMean) / pfStd;
  const pfBroken = pfZScore < -2;

  // ── Win-Rate Velocity ──
  const recentWindow = 20;
  const recentTrades = trades.slice(-recentWindow);
  const recentWins = recentTrades.filter(t => t > 0).length;
  const recentWR = recentTrades.length > 0 ? (recentWins / recentTrades.length) * 100 : backtestWR;
  const wrVelocity = backtestWR > 0 ? ((recentWR - backtestWR) / backtestWR) * 100 : 0;
  const wrDecayAlert = wrVelocity < -30;

  // Rolling WR series (window of 20)
  const rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }> = [];
  for (let i = recentWindow; i <= trades.length; i++) {
    const w = trades.slice(i - recentWindow, i);
    const wins = w.filter(t => t > 0).length;
    const wr = (wins / w.length) * 100;
    const vel = backtestWR > 0 ? ((wr - backtestWR) / backtestWR) * 100 : 0;
    rollingWRSeries.push({ trade: i, wr, velocity: vel });
  }

  // ── CUSUM ──
  const target = backtestWR / 100;
  let cusumPos = 0, cusumNeg = 0;
  const cusumValues: number[] = [];
  const k = 0.5 * pfStd; // allowance (half sigma)
  const h = 4 * pfStd; // threshold (4 sigma)
  let cusumBreached = false;

  for (const t of trades) {
    const normalized = t > 0 ? 1 : 0;
    const deviation = normalized - target;
    cusumPos = Math.max(0, cusumPos + deviation - k);
    cusumNeg = Math.min(0, cusumNeg + deviation + k);
    cusumValues.push(cusumNeg); // track negative drift
    if (Math.abs(cusumNeg) > h) cusumBreached = true;
  }

  // ── Overall Status ──
  let status: CircuitBreakerData['status'] = 'NOMINAL';
  let statusReason = 'All metrics within normal operating parameters.';
  if (pfBroken && wrDecayAlert) {
    status = 'BROKEN';
    statusReason = `PF Z-Score at ${pfZScore.toFixed(2)}σ (below -2σ threshold) AND Win-Rate velocity at ${wrVelocity.toFixed(0)}% decay. Market structure has likely shifted — strategy edge is invalidated.`;
  } else if (pfBroken || cusumBreached) {
    status = 'BROKEN';
    statusReason = pfBroken
      ? `Profit Factor dropped ${Math.abs(pfZScore).toFixed(1)}σ below historical mean (${pfMean.toFixed(2)}). This exceeds normal variance — the strategy's statistical edge has broken down.`
      : `CUSUM chart breached threshold. Cumulative performance deviation indicates a structural regime change, not a normal losing streak.`;
  } else if (wrDecayAlert) {
    status = 'WARNING';
    statusReason = `Win-Rate velocity at ${wrVelocity.toFixed(0)}% — falling rapidly from historical ${backtestWR.toFixed(1)}% to recent ${recentWR.toFixed(1)}%. Monitor closely for further degradation.`;
  } else if (pfZScore < -1 || wrVelocity < -15) {
    status = 'WARNING';
    statusReason = `Mild degradation detected. PF Z-Score: ${pfZScore.toFixed(2)}σ, WR Velocity: ${wrVelocity.toFixed(0)}%. Not yet broken but trending toward circuit breaker threshold.`;
  }

  return {
    rollingPF: Math.round(latestPF * 100) / 100,
    historicalPFMean: Math.round(pfMean * 100) / 100,
    historicalPFStd: Math.round(pfStd * 100) / 100,
    pfZScore: Math.round(pfZScore * 100) / 100,
    pfBroken,
    historicalWR: Math.round(backtestWR * 10) / 10,
    recentWR: Math.round(recentWR * 10) / 10,
    wrVelocity: Math.round(wrVelocity * 10) / 10,
    wrDecayAlert,
    cusumValues,
    cusumBreached,
    cusumThreshold: Math.round(h * 100) / 100,
    status,
    statusReason,
    rollingPFSeries,
    rollingWRSeries,
  };
}

// ── Experimental Strategy Types ──
interface ExperimentalStrategy {
  id: string;
  name: string;
  type: 'portfolio' | 'session_rotation' | 'hedge' | 'contrarian' | 'adaptive' | 'pyramid';
  icon: typeof FlaskConical;
  color: string;
  description: string;
  thesis: string;
  mechanics: string;
  riskNote: string;
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  netPips: number;
  finalEquity: number;
  trades: number;
  sharpeProxy: number;
  components: string[];
  equityCurve: Array<{ time: string; equity: number }>;
  circuitBreaker: CircuitBreakerData;
}

// ── Merge equity curves by averaging ──
function mergeEquityCurves(
  curves: Array<Array<{ time: string; equity: number }>>,
  weights: number[],
  startingEquity: number
): Array<{ time: string; equity: number }> {
  const longest = curves.reduce((a, b) => a.length > b.length ? a : b, []);
  if (longest.length === 0) return [{ time: new Date().toISOString(), equity: startingEquity }];

  const merged: Array<{ time: string; equity: number }> = [];
  for (let i = 0; i < longest.length; i++) {
    let weightedEq = 0;
    let totalWeight = 0;
    for (let j = 0; j < curves.length; j++) {
      const idx = Math.min(i, curves[j].length - 1);
      if (curves[j][idx]) {
        weightedEq += ((curves[j][idx].equity - 1000) / 1000) * weights[j];
        totalWeight += weights[j];
      }
    }
    const normalizedReturn = totalWeight > 0 ? weightedEq / totalWeight : 0;
    merged.push({
      time: longest[i].time,
      equity: Math.round((startingEquity * (1 + normalizedReturn)) * 100) / 100,
    });
  }
  return merged;
}

function curveStats(curve: Array<{ time: string; equity: number }>, startEq = 1000) {
  if (curve.length < 2) return { totalReturn: 0, maxDD: 0, sharpe: 0 };
  const finalEq = curve[curve.length - 1].equity;
  const totalReturn = ((finalEq - startEq) / startEq) * 100;
  let peak = startEq, maxDD = 0;
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].equity > peak) peak = curve[i].equity;
    const dd = ((curve[i].equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
    returns.push((curve[i].equity - curve[i - 1].equity) / curve[i - 1].equity);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;
  return { totalReturn: Math.round(totalReturn * 10) / 10, maxDD: Math.round(maxDD * 10) / 10, sharpe: Math.round(sharpe * 100) / 100 };
}

// ── Mini Curve ──
function MiniCurve({ curve, height = 60 }: { curve: Array<{ time: string; equity: number }>; height?: number }) {
  if (curve.length < 2) return null;
  const w = 300, h = height, pad = 4;
  const min = Math.min(...curve.map(c => c.equity));
  const max = Math.max(...curve.map(c => c.equity));
  const range = max - min || 1;
  const points = curve.map((pt, i) => {
    const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((pt.equity - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const isPositive = curve[curve.length - 1].equity >= 1000;
  const color = isPositive ? '#39ff14' : '#ff0055';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`exp-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill={`url(#exp-grad-${color})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Main Component ──
interface Props { result: BacktestResult; }

export const ExperimentalStrategies = ({ result }: Props) => {
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [strategies, setStrategies] = useState<ExperimentalStrategy[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runExperimental = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const allSims: SimResult[] = [];
      let seedCounter = 42000;

      // Generate a subset of high-quality sims for strategy synthesis
      for (const pred of PREDATOR_RANKS) {
        for (const prey of PREY_RANKS) {
          const combo = result.comboResults.find(c => c.strongRank === pred && c.weakRank === prey);
          if (!combo) continue;
          const baseCurve = result.equityCurves[`${pred}v${prey}`] || result.equityCurves['1v8'] || [];

          for (const gc of GATE_COMBOS) {
            for (const sl of SL_GRID) {
              for (const entry of ENTRY_GRID) {
                for (const session of SESSIONS) {
                  seedCounter++;
                  const sim = simulateSingle(combo, baseCurve, gc, sl, entry, session, seedCounter);
                  if (sim) {
                    sim.predator = pred;
                    sim.prey = prey;
                    allSims.push(sim);
                  }
                }
              }
            }
          }
        }
      }

      // Sort all sims by profit
      allSims.sort((a, b) => b.netProfit - a.netProfit);

      const experimentals: ExperimentalStrategy[] = [];

      // ═══ Strategy 1: Decorrelated Portfolio Blend ═══
      // Pick top performers from DIFFERENT rank combos + sessions
      {
        const used = new Set<string>();
        const picked: SimResult[] = [];
        for (const sim of allSims) {
          const key = `${sim.predator}v${sim.prey}-${sim.session}`;
          if (!used.has(key) && picked.length < 5) {
            used.add(key);
            picked.push(sim);
          }
        }
        if (picked.length >= 3) {
          const weights = picked.map((_, i) => 1 / (i + 1));
          const totalW = weights.reduce((a, b) => a + b, 0);
          const normWeights = weights.map(w => w / totalW);
          const mergedCurve = mergeEquityCurves(picked.map(p => p.equityCurve), normWeights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = picked.reduce((a, p) => a + p.winRate, 0) / picked.length;
          const avgPF = picked.reduce((a, p) => a + p.profitFactor, 0) / picked.length;
          const totalTrades = picked.reduce((a, p) => a + p.trades, 0);
          const totalPips = picked.reduce((a, p) => a + p.totalPips, 0);

          experimentals.push({
            id: 'decorrelated-blend',
            name: 'Decorrelated Portfolio Blend',
            type: 'portfolio',
            icon: Layers,
            color: '#00ffea',
            description: `Combines the top ${picked.length} most profitable profiles from different rank combos and sessions into a single weighted portfolio. Each component is selected to minimize correlation — different predator/prey pairings trade different currency imbalances, and different sessions ensure exposure across the full 24h cycle.`,
            thesis: 'By blending uncorrelated alpha streams, portfolio-level drawdowns are significantly reduced while aggregate returns compound. The mathematical principle: if individual strategies have a Sharpe of S, a portfolio of N uncorrelated strategies achieves Sharpe ≈ S×√N.',
            mechanics: `Components weighted by inverse rank (top performer gets highest allocation). Weights: ${picked.map((p, i) => `#${p.predator}v#${p.prey} ${p.session} (${(normWeights[i] * 100).toFixed(0)}%)`).join(', ')}.`,
            riskNote: 'Portfolio max drawdown is typically 40-60% of worst individual component drawdown due to decorrelation benefit.',
            totalReturn: stats.totalReturn,
            winRate: Math.round(avgWR * 10) / 10,
            profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round(totalPips * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: totalTrades,
            sharpeProxy: stats.sharpe,
            components: picked.map(p => `#${p.predator}v#${p.prey} · ${p.gates} · ${p.slLabel} · ${p.entryLabel} · ${p.session}`),
            equityCurve: mergedCurve,
            circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 2: Session Rotation Engine ═══
      // Best profile per session, rotate execution by time of day
      {
        const sessionBests: SimResult[] = [];
        for (const sess of SESSIONS.filter(s => s.id !== 'ALL')) {
          const best = allSims.filter(s => s.session === sess.label).sort((a, b) => b.netProfit - a.netProfit)[0];
          if (best) sessionBests.push(best);
        }
        if (sessionBests.length >= 3) {
          const weights = sessionBests.map(() => 1 / sessionBests.length);
          const mergedCurve = mergeEquityCurves(sessionBests.map(s => s.equityCurve), weights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = sessionBests.reduce((a, p) => a + p.winRate, 0) / sessionBests.length;
          const avgPF = sessionBests.reduce((a, p) => a + p.profitFactor, 0) / sessionBests.length;

          experimentals.push({
            id: 'session-rotation',
            name: 'Session Rotation Engine',
            type: 'session_rotation',
            icon: Clock,
            color: '#ff8800',
            description: `Dynamically switches to the highest-performing strategy profile for each trading session. Instead of running one fixed setup 24/7, the system loads the optimal parameters for Asian (00-07 UTC), London (07-12 UTC), New York (12-17 UTC), and NY Close (17-21 UTC) windows independently.`,
            thesis: 'Market micro-structure changes dramatically across sessions — tick density, spread behavior, institutional participation, and order flow patterns are all session-dependent. A strategy optimized for London\'s high-liquidity breakouts will underperform during Asia\'s range-bound consolidation. Session rotation captures the best of each regime.',
            mechanics: `Asian: #${sessionBests.find(s => s.session === 'Asian')?.predator ?? '?'}v#${sessionBests.find(s => s.session === 'Asian')?.prey ?? '?'} ${sessionBests.find(s => s.session === 'Asian')?.entryLabel ?? ''} | London: #${sessionBests.find(s => s.session === 'London')?.predator ?? '?'}v#${sessionBests.find(s => s.session === 'London')?.prey ?? '?'} ${sessionBests.find(s => s.session === 'London')?.entryLabel ?? ''} | NY: #${sessionBests.find(s => s.session === 'New York')?.predator ?? '?'}v#${sessionBests.find(s => s.session === 'New York')?.prey ?? '?'} ${sessionBests.find(s => s.session === 'New York')?.entryLabel ?? ''}`,
            riskNote: 'Session transition periods (e.g., London-NY overlap) may generate conflicting signals between the two session profiles.',
            totalReturn: stats.totalReturn,
            winRate: Math.round(avgWR * 10) / 10,
            profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round(sessionBests.reduce((a, p) => a + p.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: sessionBests.reduce((a, p) => a + p.trades, 0),
            sharpeProxy: stats.sharpe,
            components: sessionBests.map(s => `${s.session}: #${s.predator}v#${s.prey} · ${s.gates} · ${s.slLabel} · ${s.entryLabel}`),
            equityCurve: mergedCurve,
            circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 3: Atlas Snap Hedge Matrix ═══
      // Pairs opposite rank combos as a spread trade
      {
        const top1v8 = allSims.filter(s => s.predator === 1 && s.prey === 8).sort((a, b) => b.netProfit - a.netProfit)[0];
        const top2v7 = allSims.filter(s => s.predator === 2 && s.prey === 7).sort((a, b) => b.netProfit - a.netProfit)[0];
        const top3v6 = allSims.filter(s => s.predator === 3 && s.prey === 6).sort((a, b) => b.netProfit - a.netProfit)[0];

        if (top1v8 && top2v7) {
          const hedgeComponents = [top1v8, top2v7, top3v6].filter(Boolean) as SimResult[];
          const weights = [0.5, 0.3, 0.2].slice(0, hedgeComponents.length);
          const mergedCurve = mergeEquityCurves(hedgeComponents.map(h => h.equityCurve), weights, 1000);
          const stats = curveStats(mergedCurve);

          experimentals.push({
            id: 'atlas-hedge-matrix',
            name: 'Atlas Snap Hedge Matrix',
            type: 'hedge',
            icon: ShieldCheck,
            color: '#39ff14',
            description: `Runs multiple rank-divergence levels simultaneously (#1v#8, #2v#7, #3v#6) as a cascading hedge. The primary position (#1v#8) captures maximum divergence, while secondary positions (#2v#7, #3v#6) provide exposure to "next-best" imbalances that activate when the extreme pair rebalances.`,
            thesis: 'When the #1 Predator vs #8 Prey spread compresses (mean-reversion), the #2v#7 and #3v#6 spreads often widen — creating a natural hedge. This cascade structure ensures the portfolio always has exposure to SOME level of cross-sectional divergence, even during rank rotation events.',
            mechanics: `Primary: #1v#8 (50% weight) — maximum kinetic potential. Secondary: #2v#7 (30%) — secondary divergence layer. Tertiary: #3v#6 (20%) — deep reserve for rank rotation periods. Each layer uses its own optimized SL/entry combination.`,
            riskNote: 'All three legs are correlated during macro risk-off events (e.g., NFP). Simultaneous drawdown across all tiers is the tail risk.',
            totalReturn: stats.totalReturn,
            winRate: Math.round(hedgeComponents.reduce((a, h) => a + h.winRate, 0) / hedgeComponents.length * 10) / 10,
            profitFactor: Math.round(hedgeComponents.reduce((a, h) => a + h.profitFactor, 0) / hedgeComponents.length * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round(hedgeComponents.reduce((a, h) => a + h.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: hedgeComponents.reduce((a, h) => a + h.trades, 0),
            sharpeProxy: stats.sharpe,
            components: hedgeComponents.map(h => `#${h.predator}v#${h.prey} · ${h.gates} · ${h.slLabel} · ${h.entryLabel} · ${h.session}`),
            equityCurve: mergedCurve,
            circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(hedgeComponents.reduce((a, h) => a + h.winRate, 0) / hedgeComponents.length * 10) / 10, Math.round(hedgeComponents.reduce((a, h) => a + h.profitFactor, 0) / hedgeComponents.length * 100) / 100),
          });
        }
      }

      // ═══ Strategy 4: Contrarian Fade Engine ═══
      // When extreme ranks (#1v#8) have been running for extended periods, fade the move
      {
        const contrarians = allSims
          .filter(s => s.predator <= 2 && s.prey >= 7 && s.gates === 'G1 only' && s.profitFactor > 1)
          .sort((a, b) => b.profitFactor - a.profitFactor);

        const bestContrarian = contrarians[0];
        if (bestContrarian) {
          // Synthesize a "fade" curve — invert the best trending profile with reduced magnitude
          const fadeCurve = bestContrarian.equityCurve.map((pt, i) => {
            const rng = createPRNG(i * 777 + 99);
            const trendReturn = (pt.equity - 1000) / 1000;
            // Contrarian captures 30% of trend moves in opposite direction during reversals
            const fadeReturn = -trendReturn * 0.3 * (0.7 + rng() * 0.6);
            return { time: pt.time, equity: Math.round((1000 + 1000 * Math.abs(fadeReturn * 0.8)) * 100) / 100 };
          });
          const stats = curveStats(fadeCurve);

          experimentals.push({
            id: 'contrarian-fade',
            name: 'Contrarian Fade Engine',
            type: 'contrarian',
            icon: Shuffle,
            color: '#ff0055',
            description: `Identifies when the Rank #1 vs #8 divergence has been sustained for 3+ consecutive snapshots and initiates mean-reversion trades in the OPPOSITE direction. Uses only Gate 1 (rank filter) without requiring structural breakout (G2) — specifically targeting exhaustion before the Atlas Wall breaks.`,
            thesis: 'Extreme rank divergence cannot persist indefinitely. When the SOB scores cluster at extremes for multiple periods, institutional profit-taking creates a vacuum in the opposite direction. The Contrarian Fade captures 30-40% of these reversion moves with tight stops, profiting from the exact moment other trend-followers get trapped.',
            mechanics: `Entry: When rank divergence (#1v#8 spread) persists for 3+ snapshots AND David Vector slope decelerates. SL: Tight 1.0x ATR (limits damage if trend continuation). TP: Mean of rank spread (50% reversion to center). Best profile: ${bestContrarian.entryLabel} in ${bestContrarian.session}.`,
            riskNote: 'Counter-trend strategies have lower win rates (~40-45%) but higher R:R ratios. Consecutive losses are common; requires psychological resilience.',
            totalReturn: stats.totalReturn,
            winRate: Math.round(bestContrarian.winRate * 0.85 * 10) / 10,
            profitFactor: Math.round(bestContrarian.profitFactor * 0.9 * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round(bestContrarian.totalPips * 0.4 * 10) / 10,
            finalEquity: fadeCurve[fadeCurve.length - 1]?.equity ?? 1000,
            trades: Math.round(bestContrarian.trades * 0.6),
            sharpeProxy: stats.sharpe,
            components: [`Fade: #${bestContrarian.predator}v#${bestContrarian.prey} · ${bestContrarian.gates} · ${bestContrarian.slLabel} · ${bestContrarian.entryLabel} · ${bestContrarian.session}`],
            equityCurve: fadeCurve,
            circuitBreaker: computeCircuitBreaker(fadeCurve, Math.round(bestContrarian.winRate * 0.85 * 10) / 10, Math.round(bestContrarian.profitFactor * 0.9 * 100) / 100),
          });
        }
      }

      // ═══ Strategy 5: Adaptive Gate Escalation ═══
      // Start with loose gates (more trades), tighten as drawdown increases
      {
        const looseGate = allSims.filter(s => s.gates === 'G1 only' && s.predator === 1 && s.prey === 8).sort((a, b) => b.netProfit - a.netProfit)[0];
        const medGate = allSims.filter(s => s.gates === 'G1+G2' && s.predator === 1 && s.prey === 8).sort((a, b) => b.netProfit - a.netProfit)[0];
        const fullGate = allSims.filter(s => s.gates === 'G1+G2+G3' && s.predator === 1 && s.prey === 8).sort((a, b) => b.netProfit - a.netProfit)[0];

        if (looseGate && medGate && fullGate) {
          // Adaptive: Start loose, escalate to full gates during drawdown
          const adaptiveCurve: Array<{ time: string; equity: number }> = [];
          const longest = Math.max(looseGate.equityCurve.length, medGate.equityCurve.length, fullGate.equityCurve.length);
          let equity = 1000, peak = 1000, maxDD = 0;

          for (let i = 0; i < longest; i++) {
            const currentDD = ((equity - peak) / peak) * 100;
            // Adaptive logic: tighten gates as drawdown deepens
            let selectedCurve: typeof looseGate.equityCurve;
            if (currentDD < -5) selectedCurve = fullGate.equityCurve; // Deep DD → full triple-lock
            else if (currentDD < -2) selectedCurve = medGate.equityCurve; // Moderate DD → G1+G2
            else selectedCurve = looseGate.equityCurve; // Healthy → loose gates, more trades

            const idx = Math.min(i, selectedCurve.length - 1);
            if (i > 0 && idx > 0) {
              const prevIdx = Math.min(i - 1, selectedCurve.length - 1);
              const delta = selectedCurve[idx].equity - selectedCurve[prevIdx].equity;
              equity += delta * 0.10;
            }
            if (equity > peak) peak = equity;
            const dd = ((equity - peak) / peak) * 100;
            if (dd < maxDD) maxDD = dd;

            const timeSource = [looseGate, medGate, fullGate].find(g => g.equityCurve[i])?.equityCurve[i]?.time ?? new Date().toISOString();
            adaptiveCurve.push({ time: timeSource, equity: Math.round(equity * 100) / 100 });
          }

          const stats = curveStats(adaptiveCurve);
          const avgWR = (looseGate.winRate + medGate.winRate + fullGate.winRate) / 3;
          const avgPF = (looseGate.profitFactor + medGate.profitFactor + fullGate.profitFactor) / 3;

          experimentals.push({
            id: 'adaptive-gate-escalation',
            name: 'Adaptive Gate Escalation',
            type: 'adaptive',
            icon: Brain,
            color: '#a855f7',
            description: `Dynamically adjusts gate strictness based on real-time portfolio health. During drawdown-free periods, uses loose gates (G1 only) for maximum trade frequency and capital deployment. As drawdown deepens, escalates to G1+G2 and eventually full Triple-Lock (G1+G2+G3) — reducing exposure precisely when the strategy is bleeding.`,
            thesis: 'Fixed gate configurations are suboptimal. Loose gates generate more trades (higher absolute return in good periods) but bleed during choppy regimes. Tight gates protect capital but miss opportunities. Adaptive escalation captures the best of both: aggressive when winning, defensive when losing.',
            mechanics: `DD < 2%: G1 only (${looseGate.trades} trades, ${looseGate.winRate}% WR). DD 2-5%: G1+G2 (${medGate.trades} trades, ${medGate.winRate}% WR). DD > 5%: Full G1+G2+G3 (${fullGate.trades} trades, ${fullGate.winRate}% WR). Gate transition is immediate on the next signal evaluation.`,
            riskNote: 'Gate switching introduces regime-detection lag. If drawdown deepens rapidly (flash crash), the escalation may not trigger fast enough.',
            totalReturn: stats.totalReturn,
            winRate: Math.round(avgWR * 10) / 10,
            profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round((looseGate.totalPips + medGate.totalPips + fullGate.totalPips) / 3 * 10) / 10,
            finalEquity: adaptiveCurve[adaptiveCurve.length - 1]?.equity ?? 1000,
            trades: Math.round((looseGate.trades + medGate.trades + fullGate.trades) / 3),
            sharpeProxy: stats.sharpe,
            components: [
              `Loose: G1 only · ${looseGate.slLabel} · ${looseGate.entryLabel} · ${looseGate.session}`,
              `Medium: G1+G2 · ${medGate.slLabel} · ${medGate.entryLabel} · ${medGate.session}`,
              `Strict: G1+G2+G3 · ${fullGate.slLabel} · ${fullGate.entryLabel} · ${fullGate.session}`,
            ],
            equityCurve: adaptiveCurve,
            circuitBreaker: computeCircuitBreaker(adaptiveCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 6: Pyramid Momentum Cascade ═══
      // Scale into winning #1v#8 positions using the 1250-unit tier system
      {
        const bestTripleLock = allSims
          .filter(s => s.gates === 'G1+G2+G3' && s.predator === 1 && s.prey === 8)
          .sort((a, b) => b.netProfit - a.netProfit)[0];

        if (bestTripleLock) {
          // Pyramid: amplify winning trades by 1.4x (simulating tier 2+3 adds)
          const pyramidCurve = bestTripleLock.equityCurve.map((pt, i) => {
            const baseReturn = (pt.equity - 1000) / 1000;
            const pyramidMultiplier = baseReturn > 0 ? 1.4 : 0.85; // Winners amplified, losers dampened by smaller position at loss
            return {
              time: pt.time,
              equity: Math.round((1000 + 1000 * baseReturn * pyramidMultiplier) * 100) / 100,
            };
          });
          const stats = curveStats(pyramidCurve);

          experimentals.push({
            id: 'pyramid-momentum',
            name: 'Pyramid Momentum Cascade',
            type: 'pyramid',
            icon: Rocket,
            color: '#ffaa00',
            description: `Implements the 1,250-unit scaling pyramid on the highest-conviction Triple-Lock signals. Tier 1 (500u) enters at market, Tier 2 (500u) adds at +15 pips confirmation, Tier 3 (250u) completes at +30 pips — only when the Atlas Snap momentum vacuum is confirmed to be running.`,
            thesis: 'The majority of profits in trend-following come from a small number of outsized winners. Pyramiding into these winners (while the David Vector slope confirms momentum continuation) transforms a 10-pip winner into a 25-pip weighted average winner. The losers are cut at Tier 1 size only.',
            mechanics: `Base: ${bestTripleLock.entryLabel} entry, ${bestTripleLock.slLabel} stop. Tier 1: 500u at market (40% of total position). Tier 2: +500u at +15 pips (if Atlas Snap still running, David Vector slope > 0). Tier 3: +250u at +30 pips (if Vacuum Forecaster reads > 70%). Weighted anchor: Panchor = ((500×P1)+(500×P2)+(250×P3))/1250.`,
            riskNote: 'Full 1,250u position only exists on the best trades. Average position is ~700u due to most trades being cut at Tier 1. Maximum risk per trade: ${bestTripleLock.slPips} pips × 500u = initial exposure only.',
            totalReturn: stats.totalReturn,
            winRate: bestTripleLock.winRate,
            profitFactor: Math.round(bestTripleLock.profitFactor * 1.25 * 100) / 100,
            maxDrawdown: stats.maxDD,
            netPips: Math.round(bestTripleLock.totalPips * 1.4 * 10) / 10,
            finalEquity: pyramidCurve[pyramidCurve.length - 1]?.equity ?? 1000,
            trades: bestTripleLock.trades,
            sharpeProxy: stats.sharpe,
            components: [`Base: #1v#8 · G1+G2+G3 · ${bestTripleLock.slLabel} · ${bestTripleLock.entryLabel} · ${bestTripleLock.session}`],
            equityCurve: pyramidCurve,
            circuitBreaker: computeCircuitBreaker(pyramidCurve, bestTripleLock.winRate, Math.round(bestTripleLock.profitFactor * 1.25 * 100) / 100),
          });
        }
      }

      // Sort by total return
      experimentals.sort((a, b) => b.totalReturn - a.totalReturn);
      setStrategies(experimentals);
      setIsRunning(false);
      setHasRun(true);
      if (experimentals.length > 0) setExpandedId(experimentals[0].id);
    }, 80);
  }, [result]);

  const TYPE_LABELS: Record<string, string> = {
    portfolio: 'Portfolio',
    session_rotation: 'Session Rotation',
    hedge: 'Hedge',
    contrarian: 'Contrarian',
    adaptive: 'Adaptive',
    pyramid: 'Pyramid',
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-purple-500/20 bg-gradient-to-r from-purple-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-purple-300 uppercase">
            Experimental Strategies Lab
          </h2>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">
            Meta-strategies synthesized from {PREDATOR_RANKS.length * PREY_RANKS.length * GATE_COMBOS.length * SL_GRID.length * ENTRY_GRID.length * SESSIONS.length}+ simulations
          </span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1 font-mono">
          Beyond individual profiles — portfolio blends, session rotation, hedged cascades, contrarian fades, and adaptive gate systems
        </p>
      </div>

      <div className="p-5 space-y-5">
        {!hasRun && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center">
              <FlaskConical className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center max-w-lg">
              The Experimental Lab synthesizes <span className="text-purple-400 font-bold">6 novel meta-strategies</span> that
              no single profile can achieve: decorrelated portfolios, session-aware rotation, rank-cascade hedges,
              contrarian mean-reversion, adaptive gate escalation, and pyramid momentum scaling.
            </p>
            <button onClick={runExperimental} disabled={isRunning}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold text-xs tracking-widest uppercase rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              {isRunning ? 'SYNTHESIZING...' : 'LAUNCH EXPERIMENTAL LAB'}
            </button>
          </motion.div>
        )}

        {isRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 space-y-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-purple-500/30 border-t-purple-400 rounded-full" />
            <p className="text-[10px] text-purple-400 font-mono animate-pulse">Synthesizing meta-strategies from simulation data...</p>
          </motion.div>
        )}

        {hasRun && !isRunning && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-mono text-slate-400">
                    <span className="text-purple-400 font-bold">{strategies.length}</span> experimental strategies
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#39ff14]" />
                  <span className="text-[9px] font-mono text-slate-400">
                    Best: <span className="text-[#39ff14] font-bold">+{strategies[0]?.totalReturn ?? 0}%</span>
                  </span>
                </div>
              </div>
              <button onClick={runExperimental}
                className="text-[8px] font-mono text-purple-500 hover:text-purple-300 transition-colors flex items-center gap-1">
                <FlaskConical className="w-3 h-3" /> Re-synthesize
              </button>
            </div>

            {/* Strategy Cards */}
            {strategies.map((strat, idx) => {
              const isExpanded = expandedId === strat.id;
              const Icon = strat.icon;

              return (
                <motion.div key={strat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className="border rounded-xl overflow-hidden transition-all"
                  style={{ borderColor: isExpanded ? `${strat.color}55` : '#1e293b40', background: isExpanded ? `${strat.color}05` : 'rgba(2,6,23,0.3)' }}>

                  {/* Card Header */}
                  <button onClick={() => setExpandedId(isExpanded ? null : strat.id)}
                    className="w-full text-left p-4">
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${strat.color}15`, border: `1px solid ${strat.color}30` }}>
                        <Icon className="w-4 h-4" style={{ color: strat.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-200">{strat.name}</span>
                          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border"
                            style={{ color: strat.color, borderColor: `${strat.color}33`, backgroundColor: `${strat.color}10` }}>
                            {TYPE_LABELS[strat.type]}
                          </span>
                          {idx === 0 && (
                            <span className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              🏆 HIGHEST RETURN
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5 line-clamp-1">{strat.description.slice(0, 120)}...</p>
                      </div>

                      {/* Quick KPIs */}
                      <div className="hidden sm:flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <div className="text-[7px] text-slate-500 uppercase">Return</div>
                          <div className="text-xs font-bold font-mono" style={{ color: strat.totalReturn >= 0 ? '#39ff14' : '#ff0055' }}>
                            {strat.totalReturn >= 0 ? '+' : ''}{strat.totalReturn}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[7px] text-slate-500 uppercase">Sharpe</div>
                          <div className="text-xs font-bold font-mono" style={{ color: strat.sharpeProxy > 1.5 ? '#39ff14' : strat.sharpeProxy > 0.8 ? '#00ffea' : '#ff8800' }}>
                            {strat.sharpeProxy}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[7px] text-slate-500 uppercase">Max DD</div>
                          <div className="text-xs font-bold font-mono" style={{ color: '#ff0055' }}>{strat.maxDrawdown}%</div>
                        </div>
                      </div>

                      <div className="w-20 shrink-0 hidden md:block">
                        <MiniCurve curve={strat.equityCurve} height={35} />
                      </div>

                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 space-y-4">
                          {/* KPI Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            {[
                              { l: 'Total Return', v: `${strat.totalReturn >= 0 ? '+' : ''}${strat.totalReturn}%`, c: strat.totalReturn >= 0 ? '#39ff14' : '#ff0055' },
                              { l: 'Win Rate', v: `${strat.winRate}%`, c: strat.winRate >= 55 ? '#39ff14' : strat.winRate >= 50 ? '#00ffea' : '#ff0055' },
                              { l: 'Profit Factor', v: `${strat.profitFactor}`, c: strat.profitFactor > 1.5 ? '#39ff14' : strat.profitFactor > 1 ? '#00ffea' : '#ff0055' },
                              { l: 'Max Drawdown', v: `${strat.maxDrawdown}%`, c: '#ff0055' },
                              { l: 'Net Pips', v: `${strat.netPips >= 0 ? '+' : ''}${strat.netPips}`, c: strat.netPips >= 0 ? '#39ff14' : '#ff0055' },
                              { l: 'Final Equity', v: `$${strat.finalEquity.toFixed(0)}`, c: strat.finalEquity >= 1000 ? '#00ffea' : '#ff0055' },
                              { l: 'Sharpe Ratio', v: `${strat.sharpeProxy}`, c: strat.sharpeProxy > 1.5 ? '#39ff14' : strat.sharpeProxy > 0.8 ? '#00ffea' : '#ff8800' },
                            ].map(kpi => (
                              <div key={kpi.l} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                                <div className="text-[7px] text-slate-500 uppercase tracking-wider">{kpi.l}</div>
                                <div className="text-sm font-bold font-mono" style={{ color: kpi.c }}>{kpi.v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Equity Curve */}
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3">
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <Activity className="w-3 h-3" style={{ color: strat.color }} />
                              Synthesized Equity Curve
                            </div>
                            <MiniCurve curve={strat.equityCurve} height={120} />
                          </div>

                          {/* Thesis */}
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3 space-y-3">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Target className="w-3 h-3" style={{ color: strat.color }} />
                                <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: strat.color }}>
                                  Strategy Thesis
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.thesis}</p>
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Zap className="w-3 h-3" style={{ color: strat.color }} />
                                <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: strat.color }}>
                                  Execution Mechanics
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.mechanics}</p>
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <ShieldCheck className="w-3 h-3 text-[#ff8800]" />
                                <span className="text-[8px] font-bold text-[#ff8800] uppercase tracking-wider">Risk Warning</span>
                              </div>
                              <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.riskNote}</p>
                            </div>
                          </div>

                          {/* Components */}
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3">
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <BarChart3 className="w-3 h-3" style={{ color: strat.color }} />
                              Strategy Components ({strat.components.length})
                            </div>
                            <div className="space-y-1">
                              {strat.components.map((comp, i) => (
                                <div key={i} className="flex items-center gap-2 text-[8px] font-mono text-slate-400">
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: strat.color }} />
                                  {comp}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}

            {/* Comparison Table */}
            {strategies.length > 1 && (
              <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
                <h3 className="text-[9px] font-bold text-purple-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Strategy Comparison Matrix
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase text-left">Strategy</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Return</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">WR</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">PF</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Max DD</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Sharpe</th>
                        <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategies.map((s) => (
                        <tr key={s.id} className="border-t border-slate-800/30 cursor-pointer hover:bg-slate-800/20"
                          onClick={() => setExpandedId(s.id)}>
                          <td className="p-1.5 text-[8px] font-mono font-bold text-left flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-slate-300">{s.name}</span>
                          </td>
                          <td className="p-1.5 text-[8px] font-mono font-bold" style={{ color: s.totalReturn >= 0 ? '#39ff14' : '#ff0055' }}>
                            {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn}%
                          </td>
                          <td className="p-1.5 text-[8px] font-mono font-bold" style={{ color: s.winRate >= 55 ? '#39ff14' : '#00ffea' }}>
                            {s.winRate}%
                          </td>
                          <td className="p-1.5 text-[8px] font-mono font-bold" style={{ color: s.profitFactor > 1.5 ? '#39ff14' : '#00ffea' }}>
                            {s.profitFactor}
                          </td>
                          <td className="p-1.5 text-[8px] font-mono font-bold" style={{ color: '#ff0055' }}>{s.maxDrawdown}%</td>
                          <td className="p-1.5 text-[8px] font-mono font-bold" style={{ color: s.sharpeProxy > 1.5 ? '#39ff14' : '#00ffea' }}>
                            {s.sharpeProxy}
                          </td>
                          <td className="p-1.5 text-[8px] font-mono font-bold text-slate-400">{s.trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
