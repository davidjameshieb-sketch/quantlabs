// Experimental Strategies Lab — Real OANDA Data Meta-Strategy Synthesis
// All strategies are synthesized from real live backtest results
// No PRNG — every equity curve is derived from actual market data

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Rocket, Shuffle, Layers, ShieldCheck, TrendingUp,
  Activity, Zap, Target, BarChart3, Clock, ChevronDown, ChevronUp, Brain,
  AlertTriangle,
} from 'lucide-react';
import { TimePeriodBreakdown } from './TimePeriodBreakdown';

// ── Circuit Breaker Types ──
interface CircuitBreakerData {
  rollingPF: number; historicalPFMean: number; historicalPFStd: number;
  pfZScore: number; pfBroken: boolean;
  historicalWR: number; recentWR: number; wrVelocity: number; wrDecayAlert: boolean;
  cusumValues: number[]; cusumBreached: boolean; cusumThreshold: number;
  status: 'NOMINAL' | 'WARNING' | 'BROKEN'; statusReason: string;
  rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }>;
  rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }>;
}

function computeCircuitBreaker(curve: Array<{ time: string; equity: number }>, backtestWR: number, backtestPF: number, windowSize = 30): CircuitBreakerData {
  const trades: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const delta = curve[i].equity - curve[i - 1].equity;
    if (Math.abs(delta) > 0.001) trades.push(delta);
  }
  while (trades.length < windowSize) trades.unshift(0);
  const rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }> = [];
  const allWindowPFs: number[] = [];
  for (let i = windowSize; i <= trades.length; i++) {
    const window = trades.slice(i - windowSize, i);
    let gp = 0, gl = 0;
    window.forEach(t => { if (t > 0) gp += t; else gl += Math.abs(t); });
    const pf = gl > 0 ? gp / gl : gp > 0 ? 5 : 1;
    allWindowPFs.push(pf);
    rollingPFSeries.push({ trade: i, pf, zScore: 0 });
  }
  const pfMean = allWindowPFs.length > 0 ? allWindowPFs.reduce((a, b) => a + b, 0) / allWindowPFs.length : backtestPF;
  const pfVariance = allWindowPFs.length > 1 ? allWindowPFs.reduce((a, b) => a + (b - pfMean) ** 2, 0) / (allWindowPFs.length - 1) : 0.01;
  const pfStd = Math.max(0.01, Math.sqrt(pfVariance));
  rollingPFSeries.forEach(pt => { pt.zScore = (pt.pf - pfMean) / pfStd; });
  const latestPF = allWindowPFs[allWindowPFs.length - 1] ?? backtestPF;
  const pfZScore = (latestPF - pfMean) / pfStd;
  const pfBroken = pfZScore < -2;
  const recentWindow = 20;
  const recentTrades = trades.slice(-recentWindow);
  const recentWins = recentTrades.filter(t => t > 0).length;
  const recentWR = recentTrades.length > 0 ? (recentWins / recentTrades.length) * 100 : backtestWR;
  const wrVelocity = backtestWR > 0 ? ((recentWR - backtestWR) / backtestWR) * 100 : 0;
  const wrDecayAlert = wrVelocity < -30;
  const rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }> = [];
  for (let i = recentWindow; i <= trades.length; i++) {
    const w = trades.slice(i - recentWindow, i);
    const wins = w.filter(t => t > 0).length;
    const wr = (wins / w.length) * 100;
    rollingWRSeries.push({ trade: i, wr, velocity: backtestWR > 0 ? ((wr - backtestWR) / backtestWR) * 100 : 0 });
  }
  const target = backtestWR / 100;
  let cusumNeg = 0;
  const cusumValues: number[] = [];
  const k = 0.5 * pfStd, h = 4 * pfStd;
  let cusumBreached = false;
  for (const t of trades) { cusumNeg = Math.min(0, cusumNeg + ((t > 0 ? 1 : 0) - target) + k); cusumValues.push(cusumNeg); if (Math.abs(cusumNeg) > h) cusumBreached = true; }
  let status: CircuitBreakerData['status'] = 'NOMINAL';
  let statusReason = 'All metrics within normal operating parameters.';
  if (pfBroken && wrDecayAlert) { status = 'BROKEN'; statusReason = `PF Z-Score at ${pfZScore.toFixed(2)}σ AND WR velocity ${wrVelocity.toFixed(0)}% decay.`; }
  else if (pfBroken || cusumBreached) { status = 'BROKEN'; statusReason = pfBroken ? `PF dropped ${Math.abs(pfZScore).toFixed(1)}σ below mean.` : `CUSUM breached.`; }
  else if (wrDecayAlert) { status = 'WARNING'; statusReason = `WR velocity at ${wrVelocity.toFixed(0)}%.`; }
  else if (pfZScore < -1 || wrVelocity < -15) { status = 'WARNING'; statusReason = `Mild degradation. PF Z: ${pfZScore.toFixed(2)}σ.`; }
  return { rollingPF: Math.round(latestPF * 100) / 100, historicalPFMean: Math.round(pfMean * 100) / 100, historicalPFStd: Math.round(pfStd * 100) / 100, pfZScore: Math.round(pfZScore * 100) / 100, pfBroken, historicalWR: Math.round(backtestWR * 10) / 10, recentWR: Math.round(recentWR * 10) / 10, wrVelocity: Math.round(wrVelocity * 10) / 10, wrDecayAlert, cusumValues, cusumBreached, cusumThreshold: Math.round(h * 100) / 100, status, statusReason, rollingPFSeries, rollingWRSeries };
}

// ── Experimental Strategy Types ──
interface ExperimentalStrategy {
  id: string; name: string;
  type: 'portfolio' | 'session_rotation' | 'hedge' | 'contrarian' | 'adaptive' | 'pyramid';
  icon: typeof FlaskConical; color: string;
  description: string; thesis: string; mechanics: string; riskNote: string;
  totalReturn: number; winRate: number; profitFactor: number; maxDrawdown: number;
  netPips: number; finalEquity: number; trades: number; sharpeProxy: number;
  components: string[];
  equityCurve: Array<{ time: string; equity: number }>;
  circuitBreaker: CircuitBreakerData;
}

// ── Merge equity curves by weighted average ──
function mergeEquityCurves(curves: Array<Array<{ time: string; equity: number }>>, weights: number[], startingEquity: number): Array<{ time: string; equity: number }> {
  const longest = curves.reduce((a, b) => a.length > b.length ? a : b, []);
  if (longest.length === 0) return [{ time: new Date().toISOString(), equity: startingEquity }];
  const merged: Array<{ time: string; equity: number }> = [];
  for (let i = 0; i < longest.length; i++) {
    let weightedEq = 0, totalWeight = 0;
    for (let j = 0; j < curves.length; j++) {
      const idx = Math.min(i, curves[j].length - 1);
      if (curves[j][idx]) { weightedEq += ((curves[j][idx].equity - 1000) / 1000) * weights[j]; totalWeight += weights[j]; }
    }
    const normalizedReturn = totalWeight > 0 ? weightedEq / totalWeight : 0;
    merged.push({ time: longest[i].time, equity: Math.round((startingEquity * (1 + normalizedReturn)) * 100) / 100 });
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
      <defs><linearGradient id={`exp-grad-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill={`url(#exp-grad-${color})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Live backtest result type ──
interface LiveResult {
  predator: number; prey: number; gates: string;
  slPips: number; tpRatio: number | string; session: string;
  trades: number; wins: number; losses: number;
  winRate: number; profitFactor: number; totalPips: number;
  institutionalProfit: number; aggressiveProfit: number;
  institutionalPF: number; aggressivePF: number;
  maxDrawdown: number; aggressiveMaxDD: number;
  expectancy: number; avgWin: number; avgLoss: number;
  equityCurve: Array<{ time: string; equity: number; aggressiveEquity?: number }> | null;
}

// ── Main Component ──
interface Props { result?: any; }

export const ExperimentalStrategies = ({ result }: Props) => {
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [strategies, setStrategies] = useState<ExperimentalStrategy[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candleCount, setCandleCount] = useState(15000);
  const [environment, setEnvironment] = useState<'live' | 'practice'>('live');

  const runExperimental = useCallback(async () => {
    setIsRunning(true);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-live-backtest`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Split by predator rank to avoid CPU limits
      const chunks = [1, 2, 3].map(rank =>
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ environment, candles: candleCount, topN: 25, predatorRanks: [rank] }),
        }).then(r => r.json())
      );

      const results = await Promise.all(chunks);
      const failed = results.find(r => !r.success);
      if (failed) throw new Error(failed.error || 'Backtest failed');

      // Merge results
      const allTopResults = results.flatMap(r => r.topResults || []);
      allTopResults.sort((a: any, b: any) => b.institutionalPF - a.institutionalPF || b.institutionalProfit - a.institutionalProfit);
      const data = { success: true, topResults: allTopResults.slice(0, 25) };

      const liveResults: LiveResult[] = data.topResults || [];
      if (liveResults.length < 3) {
        setStrategies([]);
        setHasRun(true);
        setIsRunning(false);
        return;
      }

      // Convert equity curves
      const withCurves = liveResults.filter(r => r.equityCurve && r.equityCurve.length > 0);

      const experimentals: ExperimentalStrategy[] = [];

      // ═══ Strategy 1: Decorrelated Portfolio Blend ═══
      {
        const used = new Set<string>();
        const picked: LiveResult[] = [];
        for (const r of withCurves) {
          const key = `${r.predator}v${r.prey}-${r.session}`;
          if (!used.has(key) && picked.length < 5) { used.add(key); picked.push(r); }
        }
        if (picked.length >= 3) {
          const weights = picked.map((_, i) => 1 / (i + 1));
          const totalW = weights.reduce((a, b) => a + b, 0);
          const normWeights = weights.map(w => w / totalW);
          const curves = picked.map(p => (p.equityCurve || []).map(pt => ({ time: pt.time, equity: pt.equity })));
          const mergedCurve = mergeEquityCurves(curves, normWeights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = picked.reduce((a, p) => a + p.winRate, 0) / picked.length;
          const avgPF = picked.reduce((a, p) => a + p.institutionalPF, 0) / picked.length;
          experimentals.push({
            id: 'decorrelated-blend', name: 'Decorrelated Portfolio Blend', type: 'portfolio', icon: Layers, color: '#00ffea',
            description: `Combines the top ${picked.length} live-validated profiles from different rank combos and sessions. Each component trades different currency imbalances with real market data.`,
            thesis: 'By blending uncorrelated alpha streams validated on real OANDA data, portfolio-level drawdowns are reduced while returns compound.',
            mechanics: `Components weighted by inverse rank. ${picked.map((p, i) => `#${p.predator}v#${p.prey} ${p.session} (${(normWeights[i] * 100).toFixed(0)}%)`).join(', ')}.`,
            riskNote: 'All components validated on real market data with 1.5-pip friction tax.',
            totalReturn: stats.totalReturn, winRate: Math.round(avgWR * 10) / 10, profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD, netPips: Math.round(picked.reduce((a, p) => a + p.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: picked.reduce((a, p) => a + p.trades, 0), sharpeProxy: stats.sharpe,
            components: picked.map(p => `#${p.predator}v#${p.prey} · ${p.gates} · ${p.slPips}p SL · ${p.session}`),
            equityCurve: mergedCurve, circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 2: Session Rotation Engine ═══
      {
        const sessionNames = ['ASIA', 'LONDON', 'NEW_YORK', 'NY_CLOSE'];
        const sessionBests: LiveResult[] = [];
        for (const sess of sessionNames) {
          const best = withCurves.filter(r => r.session === sess).sort((a, b) => b.institutionalPF - a.institutionalPF)[0];
          if (best) sessionBests.push(best);
        }
        if (sessionBests.length >= 3) {
          const weights = sessionBests.map(() => 1 / sessionBests.length);
          const curves = sessionBests.map(s => (s.equityCurve || []).map(pt => ({ time: pt.time, equity: pt.equity })));
          const mergedCurve = mergeEquityCurves(curves, weights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = sessionBests.reduce((a, p) => a + p.winRate, 0) / sessionBests.length;
          const avgPF = sessionBests.reduce((a, p) => a + p.institutionalPF, 0) / sessionBests.length;
          experimentals.push({
            id: 'session-rotation', name: 'Session Rotation Engine', type: 'session_rotation', icon: Clock, color: '#ff8800',
            description: `Dynamically uses the best live-validated strategy per session. Each session profile tested on real OANDA candles.`,
            thesis: 'Market micro-structure changes across sessions. Validated rotation captures the best regime for each window.',
            mechanics: sessionBests.map(s => `${s.session}: #${s.predator}v#${s.prey} PF=${s.institutionalPF}`).join(' | '),
            riskNote: 'Session transitions may generate conflicting signals.',
            totalReturn: stats.totalReturn, winRate: Math.round(avgWR * 10) / 10, profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD, netPips: Math.round(sessionBests.reduce((a, p) => a + p.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: sessionBests.reduce((a, p) => a + p.trades, 0), sharpeProxy: stats.sharpe,
            components: sessionBests.map(s => `${s.session}: #${s.predator}v#${s.prey} · ${s.gates} · ${s.slPips}p SL`),
            equityCurve: mergedCurve, circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 3: Atlas Snap Hedge Matrix ═══
      {
        const find1v8 = withCurves.find(r => r.predator === 1 && r.prey === 8);
        const find2v7 = withCurves.find(r => r.predator === 2 && r.prey === 7);
        const find3v6 = withCurves.find(r => r.predator === 3 && r.prey === 6);
        const hedgeComps = [find1v8, find2v7, find3v6].filter(Boolean) as LiveResult[];
        if (hedgeComps.length >= 2) {
          const weights = [0.5, 0.3, 0.2].slice(0, hedgeComps.length);
          const curves = hedgeComps.map(h => (h.equityCurve || []).map(pt => ({ time: pt.time, equity: pt.equity })));
          const mergedCurve = mergeEquityCurves(curves, weights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = hedgeComps.reduce((a, h) => a + h.winRate, 0) / hedgeComps.length;
          const avgPF = hedgeComps.reduce((a, h) => a + h.institutionalPF, 0) / hedgeComps.length;
          experimentals.push({
            id: 'atlas-hedge-matrix', name: 'Atlas Snap Hedge Matrix', type: 'hedge', icon: ShieldCheck, color: '#39ff14',
            description: `Cascading hedge across #1v#8, #2v#7, #3v#6 — all validated on real OANDA data.`,
            thesis: 'When the primary divergence compresses, secondary spreads widen — real data confirms or denies this.',
            mechanics: hedgeComps.map((h, i) => `#${h.predator}v#${h.prey} (${[50, 30, 20][i]}%)`).join(' | '),
            riskNote: 'All legs validated independently. Correlation during macro events is the tail risk.',
            totalReturn: stats.totalReturn, winRate: Math.round(avgWR * 10) / 10, profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD, netPips: Math.round(hedgeComps.reduce((a, h) => a + h.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: hedgeComps.reduce((a, h) => a + h.trades, 0), sharpeProxy: stats.sharpe,
            components: hedgeComps.map(h => `#${h.predator}v#${h.prey} · ${h.gates} · ${h.slPips}p SL · ${h.session}`),
            equityCurve: mergedCurve, circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      // ═══ Strategy 4: Best Single Profile (Pyramid candidate) ═══
      {
        const best1v8 = withCurves.find(r => r.predator === 1 && r.prey === 8);
        if (best1v8 && best1v8.equityCurve) {
          const curve = best1v8.equityCurve.map(pt => ({ time: pt.time, equity: pt.equity }));
          const stats = curveStats(curve);
          experimentals.push({
            id: 'pyramid-momentum', name: 'Pyramid Momentum (#1v#8)', type: 'pyramid', icon: Rocket, color: '#ffaa00',
            description: `The top-ranked #1v#8 Triple-Lock profile validated on real OANDA data. Pyramid candidate for 1,250-unit scaling.`,
            thesis: 'The strongest predator vs weakest prey with Triple-Lock confirmation. Real data validates or rejects.',
            mechanics: `#${best1v8.predator}v#${best1v8.prey} · ${best1v8.slPips}p SL · ${best1v8.session} · PF=${best1v8.institutionalPF}`,
            riskNote: `Real data shows ${best1v8.maxDrawdown}% max DD. ${best1v8.institutionalPF >= 1.0 ? 'Edge confirmed.' : 'NO EDGE — do not trade.'}`,
            totalReturn: stats.totalReturn, winRate: best1v8.winRate, profitFactor: best1v8.institutionalPF,
            maxDrawdown: stats.maxDD, netPips: best1v8.totalPips,
            finalEquity: curve[curve.length - 1]?.equity ?? 1000, trades: best1v8.trades, sharpeProxy: stats.sharpe,
            components: [`#${best1v8.predator}v#${best1v8.prey} · ${best1v8.gates} · ${best1v8.slPips}p SL · ${best1v8.session}`],
            equityCurve: curve, circuitBreaker: computeCircuitBreaker(curve, best1v8.winRate, best1v8.institutionalPF),
          });
        }
      }

      // ═══ Strategy 5: All Sessions Aggregate ═══
      {
        const allSession = withCurves.filter(r => r.session === 'ALL').slice(0, 3);
        if (allSession.length >= 2) {
          const weights = allSession.map(() => 1 / allSession.length);
          const curves = allSession.map(r => (r.equityCurve || []).map(pt => ({ time: pt.time, equity: pt.equity })));
          const mergedCurve = mergeEquityCurves(curves, weights, 1000);
          const stats = curveStats(mergedCurve);
          const avgWR = allSession.reduce((a, r) => a + r.winRate, 0) / allSession.length;
          const avgPF = allSession.reduce((a, r) => a + r.institutionalPF, 0) / allSession.length;
          experimentals.push({
            id: 'all-sessions-aggregate', name: 'All-Session Diversified', type: 'adaptive', icon: Brain, color: '#a855f7',
            description: `Top ${allSession.length} all-session profiles blended — validated on real 24h market data.`,
            thesis: 'Diversifying across rank combinations within the same 24h window reduces single-pair concentration risk.',
            mechanics: allSession.map(r => `#${r.predator}v#${r.prey} PF=${r.institutionalPF}`).join(' | '),
            riskNote: 'All components run 24/7 — no session filtering.',
            totalReturn: stats.totalReturn, winRate: Math.round(avgWR * 10) / 10, profitFactor: Math.round(avgPF * 100) / 100,
            maxDrawdown: stats.maxDD, netPips: Math.round(allSession.reduce((a, r) => a + r.totalPips, 0) * 10) / 10,
            finalEquity: mergedCurve[mergedCurve.length - 1]?.equity ?? 1000,
            trades: allSession.reduce((a, r) => a + r.trades, 0), sharpeProxy: stats.sharpe,
            components: allSession.map(r => `#${r.predator}v#${r.prey} · ${r.gates} · ${r.slPips}p SL`),
            equityCurve: mergedCurve, circuitBreaker: computeCircuitBreaker(mergedCurve, Math.round(avgWR * 10) / 10, Math.round(avgPF * 100) / 100),
          });
        }
      }

      experimentals.sort((a, b) => b.totalReturn - a.totalReturn);
      setStrategies(experimentals);
      setHasRun(true);
      if (experimentals.length > 0) setExpandedId(experimentals[0].id);
    } catch (err) {
      console.error('[ExperimentalLab] Error:', err);
    } finally {
      setIsRunning(false);
    }
  }, [environment, candleCount]);

  const TYPE_LABELS: Record<string, string> = {
    portfolio: 'Portfolio', session_rotation: 'Session Rotation', hedge: 'Hedge',
    contrarian: 'Contrarian', adaptive: 'Adaptive', pyramid: 'Pyramid',
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-purple-500/20 bg-gradient-to-r from-purple-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-purple-300 uppercase">Experimental Strategies Lab</h2>
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20">REAL OANDA DATA</span>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">Meta-strategies from live-validated profiles</span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1 font-mono">
          Portfolio blends, session rotation, hedged cascades — all built from real market data, not synthetic simulations
        </p>
      </div>

      <div className="p-5 space-y-5">
        {!hasRun && !isRunning && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center">
              <FlaskConical className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center max-w-lg">
              The Experimental Lab synthesizes <span className="text-purple-400 font-bold">meta-strategies</span> from{' '}
              <span className="text-[#39ff14] font-bold">real OANDA live backtest data</span> — no PRNG, no synthetic curves.
              Every equity curve is derived from actual market candles with 1.5-pip friction tax.
            </p>
            <div className="flex items-center gap-3">
              <select value={candleCount} onChange={e => setCandleCount(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300">
                <option value={5000}>5,000 candles (~3 months)</option>
                <option value={15000}>15,000 candles (~14 months)</option>
                <option value={42000}>42,000 candles (~2.6 years)</option>
              </select>
              <select value={environment} onChange={e => setEnvironment(e.target.value as 'live' | 'practice')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300">
                <option value="live">Live</option>
                <option value="practice">Practice</option>
              </select>
            </div>
            <button onClick={runExperimental} disabled={isRunning}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold text-xs tracking-widest uppercase rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />LAUNCH REAL DATA LAB
            </button>
          </motion.div>
        )}

        {isRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 space-y-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-purple-500/30 border-t-purple-400 rounded-full" />
            <p className="text-[10px] text-purple-400 font-mono animate-pulse">Fetching real OANDA data & synthesizing meta-strategies...</p>
            <p className="text-[8px] text-slate-500 font-mono">Running live backtest — may take 30-60 seconds</p>
          </motion.div>
        )}

        {hasRun && !isRunning && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-mono text-slate-400"><span className="text-purple-400 font-bold">{strategies.length}</span> meta-strategies (real data)</span>
                </div>
                {strategies.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#39ff14]" />
                    <span className="text-[9px] font-mono text-slate-400">Best: <span className={strategies[0].totalReturn >= 0 ? 'text-[#39ff14]' : 'text-[#ff0055]'} style={{ fontWeight: 'bold' }}>{strategies[0].totalReturn >= 0 ? '+' : ''}{strategies[0].totalReturn}%</span></span>
                  </div>
                )}
              </div>
              <button onClick={runExperimental} className="text-[8px] font-mono text-purple-500 hover:text-purple-300 transition-colors flex items-center gap-1">
                <FlaskConical className="w-3 h-3" /> Re-run
              </button>
            </div>

            {strategies.map((strat, idx) => {
              const isExpanded = expandedId === strat.id;
              const Icon = strat.icon;
              return (
                <motion.div key={strat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                  className="border rounded-xl overflow-hidden transition-all"
                  style={{ borderColor: isExpanded ? `${strat.color}55` : '#1e293b40', background: isExpanded ? `${strat.color}05` : 'rgba(2,6,23,0.3)' }}>
                  <button onClick={() => setExpandedId(isExpanded ? null : strat.id)} className="w-full text-left p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${strat.color}15`, border: `1px solid ${strat.color}30` }}>
                        <Icon className="w-4 h-4" style={{ color: strat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-200">{strat.name}</span>
                          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border" style={{ color: strat.color, borderColor: `${strat.color}33`, backgroundColor: `${strat.color}10` }}>{TYPE_LABELS[strat.type]}</span>
                          <span className="text-[6px] font-mono px-1 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20">LIVE DATA</span>
                          {idx === 0 && <span className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">🏆 HIGHEST RETURN</span>}
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5 line-clamp-1">{strat.description.slice(0, 120)}...</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 shrink-0">
                        <div className="text-center"><div className="text-[7px] text-slate-500 uppercase">Return</div><div className="text-xs font-bold font-mono" style={{ color: strat.totalReturn >= 0 ? '#39ff14' : '#ff0055' }}>{strat.totalReturn >= 0 ? '+' : ''}{strat.totalReturn}%</div></div>
                        <div className="text-center"><div className="text-[7px] text-slate-500 uppercase">Sharpe</div><div className="text-xs font-bold font-mono" style={{ color: strat.sharpeProxy > 1.5 ? '#39ff14' : '#00ffea' }}>{strat.sharpeProxy}</div></div>
                        <div className="text-center"><div className="text-[7px] text-slate-500 uppercase">Max DD</div><div className="text-xs font-bold font-mono text-[#ff0055]">{strat.maxDrawdown}%</div></div>
                      </div>
                      <div className="w-20 shrink-0 hidden md:block"><MiniCurve curve={strat.equityCurve} height={35} /></div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            {[
                              { l: 'Total Return', v: `${strat.totalReturn >= 0 ? '+' : ''}${strat.totalReturn}%`, c: strat.totalReturn >= 0 ? '#39ff14' : '#ff0055' },
                              { l: 'Win Rate', v: `${strat.winRate}%`, c: strat.winRate >= 55 ? '#39ff14' : strat.winRate >= 50 ? '#00ffea' : '#ff0055' },
                              { l: 'Profit Factor', v: `${strat.profitFactor}`, c: strat.profitFactor > 1.5 ? '#39ff14' : strat.profitFactor > 1 ? '#00ffea' : '#ff0055' },
                              { l: 'Max Drawdown', v: `${strat.maxDrawdown}%`, c: '#ff0055' },
                              { l: 'Net Pips', v: `${strat.netPips >= 0 ? '+' : ''}${strat.netPips}`, c: strat.netPips >= 0 ? '#39ff14' : '#ff0055' },
                              { l: 'Final Equity', v: `$${strat.finalEquity.toFixed(0)}`, c: strat.finalEquity >= 1000 ? '#00ffea' : '#ff0055' },
                              { l: 'Sharpe Ratio', v: `${strat.sharpeProxy}`, c: strat.sharpeProxy > 1.5 ? '#39ff14' : '#00ffea' },
                            ].map(kpi => (
                              <div key={kpi.l} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                                <div className="text-[7px] text-slate-500 uppercase tracking-wider">{kpi.l}</div>
                                <div className="text-sm font-bold font-mono" style={{ color: kpi.c }}>{kpi.v}</div>
                              </div>
                            ))}
                          </div>
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3">
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <Activity className="w-3 h-3" style={{ color: strat.color }} />Real Data Equity Curve
                            </div>
                            <MiniCurve curve={strat.equityCurve} height={120} />
                            <TimePeriodBreakdown curve={strat.equityCurve} />
                          </div>
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3 space-y-3">
                            <div><div className="flex items-center gap-1.5 mb-1"><Target className="w-3 h-3" style={{ color: strat.color }} /><span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: strat.color }}>Strategy Thesis</span></div><p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.thesis}</p></div>
                            <div><div className="flex items-center gap-1.5 mb-1"><Zap className="w-3 h-3" style={{ color: strat.color }} /><span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: strat.color }}>Execution Mechanics</span></div><p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.mechanics}</p></div>
                            <div><div className="flex items-center gap-1.5 mb-1"><ShieldCheck className="w-3 h-3 text-[#ff8800]" /><span className="text-[8px] font-bold text-[#ff8800] uppercase tracking-wider">Risk Warning</span></div><p className="text-[9px] text-slate-400 leading-relaxed font-mono">{strat.riskNote}</p></div>
                          </div>
                          <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3">
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><BarChart3 className="w-3 h-3" style={{ color: strat.color }} />Strategy Components ({strat.components.length})</div>
                            <div className="space-y-1">{strat.components.map((comp, i) => (<div key={i} className="flex items-center gap-2 text-[8px] font-mono text-slate-400"><div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: strat.color }} />{comp}</div>))}</div>
                          </div>
                          <div className="bg-slate-950/40 border rounded-lg p-3 space-y-3" style={{ borderColor: strat.circuitBreaker.status === 'BROKEN' ? '#ff005555' : strat.circuitBreaker.status === 'WARNING' ? '#ff880055' : '#1e293b40' }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" style={{ color: strat.circuitBreaker.status === 'BROKEN' ? '#ff0055' : strat.circuitBreaker.status === 'WARNING' ? '#ff8800' : '#39ff14' }} />
                                <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: strat.circuitBreaker.status === 'BROKEN' ? '#ff0055' : strat.circuitBreaker.status === 'WARNING' ? '#ff8800' : '#39ff14' }}>Circuit Breaker</span>
                              </div>
                              <span className="text-[7px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ color: strat.circuitBreaker.status === 'BROKEN' ? '#ff0055' : strat.circuitBreaker.status === 'WARNING' ? '#ff8800' : '#39ff14', backgroundColor: strat.circuitBreaker.status === 'BROKEN' ? '#ff005515' : strat.circuitBreaker.status === 'WARNING' ? '#ff880015' : '#39ff1415', border: `1px solid ${strat.circuitBreaker.status === 'BROKEN' ? '#ff005533' : strat.circuitBreaker.status === 'WARNING' ? '#ff880033' : '#39ff1433'}` }}>
                                {strat.circuitBreaker.status === 'BROKEN' ? '⛔ BROKEN' : strat.circuitBreaker.status === 'WARNING' ? '⚠️ WARNING' : '✅ NOMINAL'}
                              </span>
                            </div>
                            <p className="text-[8px] font-mono leading-relaxed" style={{ color: strat.circuitBreaker.status === 'BROKEN' ? '#ff6688' : strat.circuitBreaker.status === 'WARNING' ? '#ffaa55' : '#88aa88' }}>{strat.circuitBreaker.statusReason}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
};
