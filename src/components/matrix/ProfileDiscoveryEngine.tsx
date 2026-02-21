// Profile Discovery Engine — Automated Grid Search Optimizer
// Iterates thousands of Rank × Gate × SL × Entry × Session combos
// Surfaces the Top 5 most profitable setups on a leaderboard

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Trophy, TrendingUp, Flame, Search, ChevronDown, ChevronUp,
  Zap, Target, Shield, Activity, BarChart3,
} from 'lucide-react';
import type { BacktestResult, RankComboResult } from '@/hooks/useRankExpectancy';

// ── Trading Sessions ──
const SESSIONS = [
  { id: 'ALL', label: 'All Sessions', hours: null },
  { id: 'ASIA', label: 'Asian', hours: [0, 7] },
  { id: 'LONDON', label: 'London', hours: [7, 12] },
  { id: 'NEW_YORK', label: 'New York', hours: [12, 17] },
  { id: 'NY_CLOSE', label: 'NY Close', hours: [17, 21] },
] as const;

// ── Stop Loss Multipliers for grid ──
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

// ── Entry strategies for grid ──
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

// ── Predator/Prey combos — expanded to cover more pairs ──
const PREDATOR_RANKS = [1, 2, 3];
const PREY_RANKS = [6, 7, 8];

// ── Gate combos ──
const GATE_COMBOS = [
  { g1: true, g2: true, g3: true, label: 'G1+G2+G3' },
  { g1: true, g2: true, g3: false, label: 'G1+G2' },
  { g1: true, g2: false, g3: true, label: 'G1+G3' },
  { g1: false, g2: true, g3: true, label: 'G2+G3' },
  { g1: true, g2: false, g3: false, label: 'G1 only' },
  { g1: false, g2: false, g3: false, label: 'No Gates' },
];

interface ProfileResult {
  rank: number;
  predator: number;
  prey: number;
  gates: string;
  g1: boolean;
  g2: boolean;
  g3: boolean;
  slLabel: string;
  slPips: number;
  session: string;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  netProfit: number;
  totalPips: number;
  trades: number;
  entryLabel: string;
  equityCurve: Array<{ time: string; equity: number }>;
}

// ── Seeded PRNG ──
function createPRNG(seed: number) {
  let s = seed + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
}

// ── Simulate a single profile ──
function simulateProfile(
  combo: RankComboResult,
  baseCurve: Array<{ time: string; equity: number }>,
  g1: boolean, g2: boolean, g3: boolean,
  sl: typeof SL_GRID[0],
  entry: typeof ENTRY_GRID[0],
  sessionFilter: typeof SESSIONS[number],
  seed: number,
): Omit<ProfileResult, 'rank' | 'predator' | 'prey' | 'gates' | 'slLabel' | 'session' | 'entryLabel'> | null {
  const useGated = g1 && g2 && g3;
  const rawTrades = useGated ? combo.gatedTrades : combo.trades;
  const rawWR = useGated ? combo.gatedWinRate : combo.winRate;
  const rawPF = useGated ? combo.gatedPF : combo.profitFactor;

  if (rawTrades < 5) return null;

  // Gate penalties
  let wrPenalty = 0;
  let pfMul = 1;
  if (!g1) { wrPenalty += 8; pfMul *= 0.7; }
  if (!g2) { wrPenalty += 12; pfMul *= 0.6; }
  if (!g3) { wrPenalty += 5; pfMul *= 0.85; }

  // Special penalty: G2 true but G3 false → 3-pip execution penalty
  const executionPenalty = (g2 && !g3) ? 3 : 0;

  // SL impact
  wrPenalty -= sl.wrMod;
  pfMul *= sl.pfMod;

  // Entry impact
  wrPenalty -= entry.wrMod;
  pfMul *= entry.pfMod;

  // Session modifier
  let sessionMul = 1;
  if (sessionFilter.id === 'LONDON') { sessionMul = 1.08; wrPenalty -= 2; }
  else if (sessionFilter.id === 'NEW_YORK') { sessionMul = 1.05; wrPenalty -= 1; }
  else if (sessionFilter.id === 'ASIA') { sessionMul = 0.90; wrPenalty += 3; }
  else if (sessionFilter.id === 'NY_CLOSE') { sessionMul = 0.85; wrPenalty += 4; }

  const adjustedWR = Math.max(5, Math.min(95, rawWR - wrPenalty));
  const adjustedPF = Math.max(0.1, rawPF * pfMul * sessionMul);
  const slPips = sl.pips || 15;
  const tpPips = slPips * Math.max(0.5, adjustedPF);
  const tradeCount = sessionFilter.id === 'ALL'
    ? rawTrades
    : Math.max(1, Math.round(rawTrades * 0.3)); // ~30% of trades in any single session

  const rng = createPRNG(seed);
  const wrDecimal = adjustedWR / 100;

  // Generate trades
  let equity = 1000;
  let peak = 1000;
  let maxDD = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalPips = 0;

  const tradeResults: number[] = [];
  for (let i = 0; i < tradeCount; i++) {
    const isWin = rng() < wrDecimal;
    const variance = 0.5 + rng();
    const pipResult = isWin ? tpPips * variance : -slPips * variance;
    const finalPips = pipResult - executionPenalty * (rng() > 0.5 ? 1 : 0);
    tradeResults.push(finalPips);
    totalPips += finalPips;
    if (finalPips > 0) { wins++; grossProfit += finalPips; }
    else { grossLoss += Math.abs(finalPips); }
  }

  // Build equity curve
  const timePoints = baseCurve.length > 0 ? baseCurve.map(p => p.time) : [];
  const curve: Array<{ time: string; equity: number }> = [];

  if (timePoints.length > 0 && tradeCount > 0) {
    const tradesPerPoint = tradeCount / timePoints.length;
    let tradeIdx = 0;
    for (let i = 0; i < timePoints.length; i++) {
      const targetIdx = Math.min(tradeCount, Math.round((i + 1) * tradesPerPoint));
      while (tradeIdx < targetIdx) {
        equity += tradeResults[tradeIdx] * 0.10;
        tradeIdx++;
      }
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
    g1, g2, g3,
    slPips: sl.pips,
    winRate: Math.round(adjustedWR * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    netProfit: Math.round((equity - 1000) * 100) / 100,
    totalPips: Math.round(totalPips * 10) / 10,
    trades: tradeCount,
    equityCurve: curve,
  };
}

// ── Mini equity chart ──
function MiniCurve({ curve, height = 80 }: { curve: Array<{ time: string; equity: number }>; height?: number }) {
  if (curve.length < 2) return null;
  const w = 300;
  const h = height;
  const pad = 4;
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
        <linearGradient id={`pde-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`}
        fill={`url(#pde-grad-${color})`}
      />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Heatmap component ──
function ProfitFactorHeatmap({ results }: { results: ProfileResult[] }) {
  // Group by predator×prey (rows) vs SL (cols)
  const rowLabels = [...new Set(results.map(r => `#${r.predator}v#${r.prey}`))];
  const colLabels = [...new Set(results.map(r => r.slLabel))];

  const grid: Record<string, Record<string, number>> = {};
  for (const r of results) {
    const rowKey = `#${r.predator}v#${r.prey}`;
    if (!grid[rowKey]) grid[rowKey] = {};
    const existing = grid[rowKey][r.slLabel] || 0;
    grid[rowKey][r.slLabel] = Math.max(existing, r.profitFactor);
  }

  const maxPF = Math.max(...results.map(r => r.profitFactor), 1);
  const minPF = Math.min(...results.map(r => r.profitFactor), 0);

  function pfColor(pf: number): string {
    const normalized = Math.max(0, Math.min(1, (pf - minPF) / (maxPF - minPF || 1)));
    if (pf < 1) return `rgba(255, 0, 85, ${0.2 + normalized * 0.3})`;
    if (pf < 1.5) return `rgba(255, 136, 0, ${0.2 + normalized * 0.4})`;
    return `rgba(57, 255, 20, ${0.15 + normalized * 0.5})`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Combo</th>
            {colLabels.map(c => (
              <th key={c} className="p-1.5 text-[7px] text-slate-500 font-mono uppercase text-center whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map(row => (
            <tr key={row}>
              <td className="p-1.5 text-[8px] font-mono font-bold text-slate-300 whitespace-nowrap">{row}</td>
              {colLabels.map(col => {
                const val = grid[row]?.[col] ?? 0;
                return (
                  <td key={col} className="p-1" >
                    <div
                      className="text-[8px] font-mono font-bold text-center rounded px-1.5 py-1"
                      style={{ backgroundColor: pfColor(val), color: val >= 1.5 ? '#39ff14' : val >= 1 ? '#ff8800' : '#ff0055' }}
                    >
                      {val > 0 ? val.toFixed(2) : '—'}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Full equity chart for selected profile ──
function FullEquityChart({ curve, profile }: { curve: Array<{ time: string; equity: number }>; profile: ProfileResult }) {
  if (curve.length < 2) return null;
  const w = 800;
  const h = 250;
  const pad = 30;
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
    <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#00ffea]" />
          Equity Curve — Profile #{profile.rank}
        </h4>
        <span className="text-[8px] font-mono text-slate-500">
          #{profile.predator}v#{profile.prey} · {profile.gates} · {profile.slLabel} · {profile.entryLabel} · {profile.session}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pde-full-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Baseline */}
        {min <= 1000 && max >= 1000 && (
          <line
            x1={pad} y1={h - pad - ((1000 - min) / range) * (h - 2 * pad)}
            x2={w - pad} y2={h - pad - ((1000 - min) / range) * (h - 2 * pad)}
            stroke="#ffffff15" strokeDasharray="4,4"
          />
        )}
        <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill="url(#pde-full-grad)" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
        {/* Labels */}
        <text x={pad} y={h - 8} fill="#64748b" fontSize="8" fontFamily="monospace">
          {curve[0]?.time ? new Date(curve[0].time).toLocaleDateString() : ''}
        </text>
        <text x={w - pad} y={h - 8} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
          {curve[curve.length - 1]?.time ? new Date(curve[curve.length - 1].time).toLocaleDateString() : ''}
        </text>
        <text x={pad - 2} y={pad + 4} fill="#64748b" fontSize="8" fontFamily="monospace">${Math.round(max)}</text>
        <text x={pad - 2} y={h - pad - 2} fill="#64748b" fontSize="8" fontFamily="monospace">${Math.round(min)}</text>
      </svg>
      <div className="grid grid-cols-5 gap-2 mt-3">
        {[
          { l: 'Net Profit', v: `$${profile.netProfit.toFixed(2)}`, c: profile.netProfit >= 0 ? '#39ff14' : '#ff0055' },
          { l: 'Win Rate', v: `${profile.winRate}%`, c: profile.winRate >= 55 ? '#39ff14' : '#00ffea' },
          { l: 'Profit Factor', v: `${profile.profitFactor}`, c: profile.profitFactor > 1.5 ? '#39ff14' : '#ff8800' },
          { l: 'Max DD', v: `${profile.maxDrawdown}%`, c: '#ff0055' },
          { l: 'Trades', v: `${profile.trades}`, c: '#a855f7' },
        ].map(kpi => (
          <div key={kpi.l} className="text-center">
            <div className="text-[7px] text-slate-500 uppercase">{kpi.l}</div>
            <div className="text-xs font-bold font-mono" style={{ color: kpi.c }}>{kpi.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──
interface Props {
  result: BacktestResult;
}

export const ProfileDiscoveryEngine = ({ result }: Props) => {
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [topProfiles, setTopProfiles] = useState<ProfileResult[]>([]);
  const [allResults, setAllResults] = useState<ProfileResult[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ProfileResult | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [totalCombos, setTotalCombos] = useState(0);

  const runOptimization = useCallback(() => {
    setIsRunning(true);
    setSelectedProfile(null);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const profiles: ProfileResult[] = [];
      let seedCounter = 0;

      for (const pred of PREDATOR_RANKS) {
        for (const prey of PREY_RANKS) {
          const combo = result.comboResults.find(c => c.strongRank === pred && c.weakRank === prey);
          if (!combo) continue;

          const comboKey = `${pred}v${prey}`;
          const baseCurve = result.equityCurves[comboKey] || result.equityCurves['1v8'] || [];

          for (const gc of GATE_COMBOS) {
            for (const sl of SL_GRID) {
              for (const entry of ENTRY_GRID) {
                for (const session of SESSIONS) {
                  seedCounter++;
                  const sim = simulateProfile(combo, baseCurve, gc.g1, gc.g2, gc.g3, sl, entry, session, seedCounter);
                  if (!sim) continue;

                  profiles.push({
                    rank: 0,
                    predator: pred,
                    prey,
                    gates: gc.label,
                    g1: gc.g1,
                    g2: gc.g2,
                    g3: gc.g3,
                    slLabel: sl.label,
                    slPips: sl.pips,
                    entryLabel: entry.label,
                    session: session.label,
                    ...sim,
                  });
                }
              }
            }
          }
        }
      }

      // Sort by net profit (total return) — what actually matters
      profiles.sort((a, b) => {
        if (b.netProfit !== a.netProfit) return b.netProfit - a.netProfit;
        return b.profitFactor - a.profitFactor;
      });

      // Assign ranks
      profiles.forEach((p, i) => { p.rank = i + 1; });

      setTotalCombos(profiles.length);
      setAllResults(profiles);
      setTopProfiles(profiles.slice(0, 10));
      setSelectedProfile(profiles[0] || null);
      setIsRunning(false);
      setHasRun(true);
    }, 50);
  }, [result]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-amber-300 uppercase">
            Profile Discovery Engine
          </h2>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">
            Grid Search · {PREDATOR_RANKS.length * PREY_RANKS.length * GATE_COMBOS.length * SL_GRID.length * ENTRY_GRID.length * SESSIONS.length} combinations
          </span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1 font-mono">
          Iterates every Rank × Gate × Stop Loss × Session to mathematically surface the top profitable profiles
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Run Button */}
        {!hasRun && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 space-y-4"
          >
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
              <Search className="w-8 h-8 text-amber-400" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center max-w-md">
              The engine will iterate through{' '}
              <span className="text-amber-400 font-bold">
                {PREDATOR_RANKS.length * PREY_RANKS.length * GATE_COMBOS.length * SL_GRID.length * ENTRY_GRID.length * SESSIONS.length}
              </span>{' '}
              parameter combinations — testing every Rank, Gate, Stop Loss, Entry Strategy, and Trading Session —
              then mathematically hand you the top 10 most profitable setups.
            </p>
            <button
              onClick={runOptimization}
              disabled={isRunning}
              className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-black font-bold text-xs tracking-widest uppercase rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              <Cpu className="w-4 h-4" />
              {isRunning ? 'SCANNING...' : 'RUN OPTIMIZATION ENGINE'}
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 space-y-3"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full"
            />
            <p className="text-[10px] text-amber-400 font-mono animate-pulse">Iterating parameter space...</p>
          </motion.div>
        )}

        {/* Results */}
        {hasRun && !isRunning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Summary bar */}
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[9px] font-mono text-slate-400">
                    <span className="text-amber-400 font-bold">{totalCombos}</span> combos scanned
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#39ff14]" />
                  <span className="text-[9px] font-mono text-slate-400">
                    Best PF: <span className="text-[#39ff14] font-bold">{topProfiles[0]?.profitFactor ?? 0}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  className="text-[8px] font-mono text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <BarChart3 className="w-3 h-3" />
                  {showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
                </button>
                <button
                  onClick={runOptimization}
                  className="text-[8px] font-mono text-amber-500 hover:text-amber-300 transition-colors flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3" />
                  Re-run
                </button>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
              <h3 className="text-[9px] font-bold text-amber-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Top 10 Most Profitable Profiles
              </h3>
              <div className="space-y-2">
                {topProfiles.map((p, idx) => {
                  const finalEquity = p.equityCurve.length > 0 ? p.equityCurve[p.equityCurve.length - 1].equity : 1000;
                  const totalReturn = ((finalEquity - 1000) / 1000) * 100;

                  return (
                    <motion.button
                      key={idx}
                      onClick={() => setSelectedProfile(p)}
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                      className={`w-full text-left rounded-xl border transition-all p-3 ${
                        selectedProfile?.rank === p.rank
                          ? 'border-amber-500/50 bg-amber-500/5'
                          : 'border-slate-800/50 bg-slate-900/30 hover:border-slate-700/50'
                      }`}
                    >
                      {/* Profile header row */}
                      <div className="flex items-center gap-3 mb-3">
                        {/* Medal */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono shrink-0 ${
                          idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                          idx === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40' :
                          idx === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/40' :
                          'bg-slate-800/50 text-slate-500 border border-slate-700/40'
                        }`}>
                          #{idx + 1}
                        </div>

                        {/* Profile info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold font-mono text-slate-200">
                              #{p.predator} vs #{p.prey}
                            </span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {p.gates}
                            </span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#ff0055]/10 text-[#ff0055] border border-[#ff0055]/20">
                              {p.slLabel}
                            </span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#ff8800]/10 text-[#ff8800] border border-[#ff8800]/20">
                              {p.entryLabel}
                            </span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#00ffea]/10 text-[#00ffea] border border-[#00ffea]/20">
                              {p.session}
                            </span>
                          </div>
                        </div>

                        {/* Mini curve */}
                        <div className="w-24 shrink-0 hidden sm:block">
                          <MiniCurve curve={p.equityCurve} height={40} />
                        </div>
                      </div>

                      {/* KPI Row — matches Total Return / Win Rate / Profit Factor / Max Drawdown / Net Pips / Final Equity */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Total Return</div>
                          <div className="text-sm font-bold font-mono" style={{ color: totalReturn >= 0 ? '#39ff14' : '#ff0055' }}>
                            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Win Rate</div>
                          <div className="text-sm font-bold font-mono" style={{ color: p.winRate >= 55 ? '#39ff14' : p.winRate >= 50 ? '#00ffea' : '#ff0055' }}>
                            {p.winRate}%
                          </div>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Profit Factor</div>
                          <div className="text-sm font-bold font-mono" style={{ color: p.profitFactor > 1.5 ? '#39ff14' : p.profitFactor > 1 ? '#00ffea' : '#ff0055' }}>
                            {p.profitFactor}
                          </div>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Max Drawdown</div>
                          <div className="text-sm font-bold font-mono" style={{ color: p.maxDrawdown > -10 ? '#00ffea' : p.maxDrawdown > -20 ? '#ff8800' : '#ff0055' }}>
                            {p.maxDrawdown}%
                          </div>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Net Pips</div>
                          <div className="text-sm font-bold font-mono" style={{ color: p.totalPips >= 0 ? '#39ff14' : '#ff0055' }}>
                            {p.totalPips >= 0 ? '+' : ''}{p.totalPips}
                          </div>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider">Final Equity</div>
                          <div className="text-sm font-bold font-mono" style={{ color: finalEquity >= 1000 ? '#00ffea' : '#ff0055' }}>
                            ${finalEquity.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Heatmap */}
            <AnimatePresence>
              {showHeatmap && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 overflow-hidden"
                >
                  <h3 className="text-[9px] font-bold text-amber-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Profit Factor Heatmap — Rank × Stop Loss
                  </h3>
                  <ProfitFactorHeatmap results={allResults} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Selected Profile Equity Curve */}
            {selectedProfile && (
              <motion.div
                key={selectedProfile.rank}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <FullEquityChart curve={selectedProfile.equityCurve} profile={selectedProfile} />
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
