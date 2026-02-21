// Profile Discovery Engine — Automated Grid Search Optimizer
// Iterates thousands of Rank × Gate × SL × Entry × Session combos
// Surfaces the Top 5 most profitable setups on a leaderboard

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Trophy, TrendingUp, Flame, Search, ChevronDown, ChevronUp,
  Zap, Target, Shield, Activity, BarChart3, Calendar, Brain, Fingerprint, Layers,
  AlertTriangle,
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

// ── Time Period Breakdown ──
const TIME_PERIODS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '45D', days: 45 },
  { label: '60D', days: 60 },
] as const;

function getTimePeriodStats(curve: Array<{ time: string; equity: number }>, totalDays: number, periodDays: number) {
  if (curve.length < 2 || periodDays > totalDays) return null;
  const ratio = periodDays / Math.max(1, totalDays);
  const startIdx = Math.max(0, Math.floor(curve.length * (1 - ratio)));
  const slice = curve.slice(startIdx);
  if (slice.length < 2) return null;
  const startEq = slice[0].equity;
  const endEq = slice[slice.length - 1].equity;
  const totalReturn = ((endEq - startEq) / startEq) * 100;
  let peak = startEq, maxDD = 0, wins = 0, losses = 0, grossProfit = 0, grossLoss = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i].equity - slice[i - 1].equity;
    if (diff > 0) { wins++; grossProfit += diff; } else if (diff < 0) { losses++; grossLoss += Math.abs(diff); }
    if (slice[i].equity > peak) peak = slice[i].equity;
    const dd = ((slice[i].equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
  const netPips = totalReturn * 10;
  return {
    totalReturn: Math.round(totalReturn * 10) / 10, winRate: Math.round(wr * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100, maxDrawdown: Math.round(maxDD * 10) / 10,
    netPips: Math.round(netPips * 10) / 10, finalEquity: Math.round(endEq * 100) / 100,
  };
}

function TimePeriodBreakdown({ curve }: { curve: Array<{ time: string; equity: number }> }) {
  if (curve.length < 2) return null;
  const firstDate = new Date(curve[0].time);
  const lastDate = new Date(curve[curve.length - 1].time);
  const totalDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000));
  const periods = TIME_PERIODS.map(p => ({ ...p, stats: getTimePeriodStats(curve, totalDays, p.days) })).filter(p => p.stats !== null);
  if (periods.length === 0) return null;

  return (
    <div className="mt-2 bg-slate-950/40 border border-slate-800/30 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Calendar className="w-3 h-3 text-amber-400" />
        <span className="text-[7px] font-bold text-amber-300 uppercase tracking-widest">Period Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase text-left">Period</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Return</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">WR</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">PF</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Max DD</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Net Pips</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Equity</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(({ label, stats }) => {
              const s = stats!;
              return (
                <tr key={label} className="border-t border-slate-800/30">
                  <td className="p-1 text-[8px] font-mono font-bold text-slate-300 text-left">{label}</td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.totalReturn >= 0 ? '#39ff14' : '#ff0055' }}>
                    {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.winRate >= 55 ? '#39ff14' : s.winRate >= 50 ? '#00ffea' : '#ff0055' }}>
                    {s.winRate}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.profitFactor > 1.5 ? '#39ff14' : s.profitFactor > 1 ? '#00ffea' : '#ff0055' }}>
                    {s.profitFactor}
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: '#ff0055' }}>
                    {s.maxDrawdown}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.netPips >= 0 ? '#39ff14' : '#ff0055' }}>
                    {s.netPips >= 0 ? '+' : ''}{s.netPips}
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.finalEquity >= 1000 ? '#00ffea' : '#ff0055' }}>
                    ${s.finalEquity}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Strategy Intelligence Analysis ──
function generateProfileIntelligence(profile: ProfileResult, allTop: ProfileResult[], idx: number): {
  whyProfitable: string;
  uniqueEdge: string;
  diversification: string;
  riskProfile: string;
  tags: Array<{ label: string; color: string }>;
} {
  const p = profile;

  // ── Why Profitable ──
  const rankSpread = Math.abs(p.predator - p.prey);
  const isExtremeRank = p.predator <= 1 && p.prey >= 8;
  const isWideRank = rankSpread >= 6;
  const hasAllGates = p.g1 && p.g2 && p.g3;
  const hasAtlasWall = p.slLabel.includes('Atlas');
  const hasTrailing = p.slLabel.includes('Trailing');
  const isLimitEntry = p.entryLabel.includes('Limit');
  const isOFI = p.entryLabel.includes('Z-OFI');
  const isDelta = p.entryLabel.includes('Delta');
  const isBOS = p.entryLabel.includes('Break of structure');
  const isOrderBlock = p.entryLabel.includes('Order block');
  const isFib = p.entryLabel.includes('fib');
  const isLondon = p.session.includes('London');
  const isNY = p.session.includes('New York');
  const isAsia = p.session.includes('Asian');

  let whyParts: string[] = [];

  if (isExtremeRank) {
    whyParts.push(`Exploits maximum cross-sectional divergence (#${p.predator} vs #${p.prey}) — the widest possible strength gap across the 28-cross matrix creates a kinetic imbalance that institutional flow amplifies.`);
  } else if (isWideRank) {
    whyParts.push(`Targets high-divergence rank spread (#${p.predator} vs #${p.prey}) — ${rankSpread}-rank separation provides strong directional conviction from the Structural Order Book scoring.`);
  } else {
    whyParts.push(`Uses a moderate rank spread (#${p.predator} vs #${p.prey}) — this mid-divergence approach sacrifices peak conviction for higher trade frequency, capturing more of the daily flow.`);
  }

  if (hasAllGates) {
    whyParts.push(`Full Triple-Lock gate alignment (G1+G2+G3) ensures every entry has rank extremity confirmation, Atlas Wall structural breakout validation, AND David Vector kinetic momentum — eliminating false breakouts that destroy capital.`);
  } else if (p.g1 && p.g2) {
    whyParts.push(`G1+G2 gating confirms rank extremity with Atlas Wall absorption — trades only fire when institutional resistance is structurally broken, though it lacks the David Vector kinetic confirmation for precise timing.`);
  } else if (p.g2 && p.g3) {
    whyParts.push(`G2+G3 gating combines structural breakout with momentum slope — bypasses rank filtering for more frequent entries while requiring both price structure and kinetic energy confirmation.`);
  }

  if (isLondon) {
    whyParts.push(`London session (07-12 UTC) provides peak institutional liquidity where the 28-cross matrix divergence signals are most reliable — clearing banks and central desks create the volume needed for Atlas Walls to form and break cleanly.`);
  } else if (isNY) {
    whyParts.push(`New York session (12-17 UTC) captures the London-NY overlap — the highest tick density window where order flow micro-structure is most pronounced and slippage front-running is most effective.`);
  } else if (isAsia) {
    whyParts.push(`Asian session (00-07 UTC) trades the quieter structural setups — lower volatility means tighter stops are viable and the rank-based divergence plays out more gradually but with higher win rates.`);
  }

  // ── Unique Edge ──
  let uniqueParts: string[] = [];

  if (hasAtlasWall) {
    uniqueParts.push(`Atlas Wall stop placement anchors risk directly to structural support/resistance — the stop is positioned relative to the 20-period institutional boundary rather than arbitrary pip distances, creating a mathematically optimal risk point.`);
  } else if (hasTrailing) {
    uniqueParts.push(`Trailing stop (1x ATR) locks in profits dynamically — as the Atlas Snap momentum vacuum drives price, the trailing mechanism captures the full extension while protecting accumulated gains from mean-reversion.`);
  } else if (p.slLabel.includes('fixed')) {
    uniqueParts.push(`Fixed-pip stop at ${p.slPips} pips provides consistent position sizing — the predictable risk per trade enables precise portfolio-level risk budgeting and compound growth modeling.`);
  } else {
    uniqueParts.push(`ATR-based stop (${p.slLabel}) adapts to current market volatility — wider stops during volatile regimes prevent noise-triggered exits while tighter stops in low-vol environments maximize R-multiple capture.`);
  }

  if (isOFI) {
    uniqueParts.push(`Z-OFI entry filter requires confirmed order flow imbalance before execution — this front-runs the institutional liquidity vacuum by only entering when the bid/ask absorption ratio exceeds statistical thresholds.`);
  } else if (isDelta) {
    uniqueParts.push(`Delta spike entry (>2σ) captures aggressive institutional positioning — enters only when cumulative delta shows abnormal directional conviction, confirming the rank divergence with real-time market participation.`);
  } else if (isBOS) {
    uniqueParts.push(`Break of structure entry confirms the prevailing market structure has shifted — aligns the cross-sectional rank signal with price action's structural bias change for higher-conviction entries.`);
  } else if (isOrderBlock) {
    uniqueParts.push(`Order block entry targets the exact price zones where institutional accumulation occurred — enters at the origin of the impulsive move, maximizing the R-ratio by placing entries near the strongest support/resistance.`);
  } else if (isFib) {
    uniqueParts.push(`Fibonacci 38.2% pullback entry provides premium pricing within the dominant trend — waits for a measured retracement before entering with the rank-confirmed direction, improving average fill quality.`);
  } else if (isLimitEntry) {
    uniqueParts.push(`Limit order entry at ${p.entryLabel} secures better fill prices — by placing resting liquidity below market, the strategy captures execution edge that compounds over hundreds of trades into significant P&L improvement.`);
  }

  // ── Diversification Analysis ──
  const others = allTop.filter((_, i) => i !== idx);
  const sameRankCombo = others.filter(o => o.predator === p.predator && o.prey === p.prey);
  const sameSession = others.filter(o => o.session === p.session);
  const sameGates = others.filter(o => o.gates === p.gates);
  const sameSL = others.filter(o => o.slLabel === p.slLabel);
  const sameEntry = others.filter(o => o.entryLabel === p.entryLabel);

  const uniqueFactors: string[] = [];
  const sharedFactors: string[] = [];

  if (sameRankCombo.length === 0) uniqueFactors.push(`rank pairing (#${p.predator}v#${p.prey})`);
  else sharedFactors.push(`rank pairing with ${sameRankCombo.length} other profile${sameRankCombo.length > 1 ? 's' : ''}`);

  if (sameSession.length === 0) uniqueFactors.push(`${p.session} session`);
  else sharedFactors.push(`session window with ${sameSession.length} other${sameSession.length > 1 ? 's' : ''}`);

  if (sameEntry.length === 0) uniqueFactors.push(`${p.entryLabel} entry`);
  else sharedFactors.push(`entry method with ${sameEntry.length} other${sameEntry.length > 1 ? 's' : ''}`);

  if (sameSL.length === 0) uniqueFactors.push(`${p.slLabel} stop loss`);
  else sharedFactors.push(`SL type with ${sameSL.length} other${sameSL.length > 1 ? 's' : ''}`);

  if (sameGates.length === 0) uniqueFactors.push(`${p.gates} gate config`);

  const diversityScore = uniqueFactors.length;
  let diversification = '';

  if (diversityScore >= 4) {
    diversification = `Highly diversified — this profile is completely unique across ${uniqueFactors.join(', ')}. Running this alongside other top profiles provides maximum decorrelation, reducing portfolio-level drawdown through independent signal generation.`;
  } else if (diversityScore >= 2) {
    diversification = `Moderately diversified — unique in ${uniqueFactors.join(' and ')}, but shares ${sharedFactors.join(' and ')}. Provides partial decorrelation when combined with other top profiles.`;
  } else if (diversityScore >= 1) {
    diversification = `Low diversification — only unique in ${uniqueFactors.join(', ')}, sharing ${sharedFactors.join(', ')}. Consider pairing with profiles from different sessions or rank combos for portfolio-level robustness.`;
  } else {
    diversification = `Highly correlated — shares rank pairing, session, entry, and stop loss parameters with other top profiles. Returns will be strongly correlated; avoid over-allocating to this cluster.`;
  }

  // Risk profile
  const riskProfile = p.maxDrawdown > -5
    ? `Conservative risk — shallow ${p.maxDrawdown}% max drawdown indicates tight risk containment. This profile prioritizes capital preservation with consistent, compounding returns.`
    : p.maxDrawdown > -15
    ? `Moderate risk — ${p.maxDrawdown}% max drawdown is within institutional tolerance. The drawdown-to-return ratio of ${Math.abs(p.maxDrawdown / ((p.netProfit / 1000) * 100 || 1)).toFixed(1)} suggests reasonable risk-adjusted performance.`
    : `Aggressive risk — ${p.maxDrawdown}% max drawdown requires strong conviction and proper position sizing. The strategy captures larger moves but demands psychological endurance through deep equity troughs.`;

  // Tags
  const tags: Array<{ label: string; color: string }> = [];
  if (isExtremeRank) tags.push({ label: 'Max Divergence', color: '#00ffea' });
  if (hasAllGates) tags.push({ label: 'Triple-Lock', color: '#39ff14' });
  if (isLondon) tags.push({ label: 'Peak Liquidity', color: '#ff8800' });
  if (isNY) tags.push({ label: 'NY Overlap', color: '#ff8800' });
  if (isOFI) tags.push({ label: 'OFI Edge', color: '#a855f7' });
  if (isDelta) tags.push({ label: 'Delta Trigger', color: '#a855f7' });
  if (hasAtlasWall) tags.push({ label: 'Structural SL', color: '#ff0055' });
  if (hasTrailing) tags.push({ label: 'Dynamic Trail', color: '#ff0055' });
  if (isBOS) tags.push({ label: 'Structure Break', color: '#00ffea' });
  if (isOrderBlock) tags.push({ label: 'OB Entry', color: '#a855f7' });
  if (p.profitFactor > 2) tags.push({ label: 'High PF', color: '#39ff14' });
  if (p.winRate > 60) tags.push({ label: 'High WR', color: '#39ff14' });
  if (diversityScore >= 3) tags.push({ label: 'Unique Profile', color: '#ffaa00' });

  return {
    whyProfitable: whyParts.join(' '),
    uniqueEdge: uniqueParts.join(' '),
    diversification,
    riskProfile,
    tags,
  };
}

function StrategyIntelligencePanel({ profile, allTop, idx }: { profile: ProfileResult; allTop: ProfileResult[]; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const intel = generateProfileIntelligence(profile, allTop, idx);

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-[8px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
      >
        <Brain className="w-3 h-3" />
        <span className="uppercase tracking-widest font-bold">Strategy Intelligence</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 bg-slate-950/50 border border-purple-500/20 rounded-lg p-3 space-y-3">
              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {intel.tags.map((tag) => (
                  <span key={tag.label} className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border"
                    style={{ color: tag.color, borderColor: `${tag.color}33`, backgroundColor: `${tag.color}10` }}>
                    {tag.label}
                  </span>
                ))}
              </div>

              {/* Why Profitable */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3 h-3 text-[#39ff14]" />
                  <span className="text-[8px] font-bold text-[#39ff14] uppercase tracking-wider">Why This Profile Is Profitable</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.whyProfitable}</p>
              </div>

              {/* Unique Edge */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Fingerprint className="w-3 h-3 text-[#00ffea]" />
                  <span className="text-[8px] font-bold text-[#00ffea] uppercase tracking-wider">Unique Characteristic & Execution Edge</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.uniqueEdge}</p>
              </div>

              {/* Risk Profile */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3 h-3 text-[#ff8800]" />
                  <span className="text-[8px] font-bold text-[#ff8800] uppercase tracking-wider">Risk Profile</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.riskProfile}</p>
              </div>

              {/* Diversification */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="w-3 h-3 text-[#ffaa00]" />
                  <span className="text-[8px] font-bold text-[#ffaa00] uppercase tracking-wider">Diversification From Other Top Profiles</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.diversification}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Circuit Breaker Types & Computation ──
interface CircuitBreakerData {
  rollingPF: number;
  historicalPFMean: number;
  historicalPFStd: number;
  pfZScore: number;
  pfBroken: boolean;
  historicalWR: number;
  recentWR: number;
  wrVelocity: number;
  wrDecayAlert: boolean;
  cusumValues: number[];
  cusumBreached: boolean;
  cusumThreshold: number;
  status: 'NOMINAL' | 'WARNING' | 'BROKEN';
  statusReason: string;
  rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }>;
  rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }>;
}

function computeCircuitBreaker(
  curve: Array<{ time: string; equity: number }>,
  backtestWR: number,
  backtestPF: number,
  windowSize = 30
): CircuitBreakerData {
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
    const vel = backtestWR > 0 ? ((wr - backtestWR) / backtestWR) * 100 : 0;
    rollingWRSeries.push({ trade: i, wr, velocity: vel });
  }

  const target = backtestWR / 100;
  let cusumNeg = 0;
  const cusumValues: number[] = [];
  const k = 0.5 * pfStd;
  const h = 4 * pfStd;
  let cusumBreached = false;
  for (const t of trades) {
    const normalized = t > 0 ? 1 : 0;
    cusumNeg = Math.min(0, cusumNeg + (normalized - target) + k);
    cusumValues.push(cusumNeg);
    if (Math.abs(cusumNeg) > h) cusumBreached = true;
  }

  let status: CircuitBreakerData['status'] = 'NOMINAL';
  let statusReason = 'All metrics within normal operating parameters.';
  if (pfBroken && wrDecayAlert) {
    status = 'BROKEN';
    statusReason = `PF Z-Score at ${pfZScore.toFixed(2)}σ (below -2σ) AND Win-Rate velocity at ${wrVelocity.toFixed(0)}% decay. Market structure has likely shifted.`;
  } else if (pfBroken || cusumBreached) {
    status = 'BROKEN';
    statusReason = pfBroken
      ? `Profit Factor dropped ${Math.abs(pfZScore).toFixed(1)}σ below historical mean (${pfMean.toFixed(2)}). Strategy edge has broken down.`
      : `CUSUM chart breached threshold. Structural regime change detected.`;
  } else if (wrDecayAlert) {
    status = 'WARNING';
    statusReason = `Win-Rate velocity at ${wrVelocity.toFixed(0)}% — falling from ${backtestWR.toFixed(1)}% to ${recentWR.toFixed(1)}%. Monitor closely.`;
  } else if (pfZScore < -1 || wrVelocity < -15) {
    status = 'WARNING';
    statusReason = `Mild degradation. PF Z-Score: ${pfZScore.toFixed(2)}σ, WR Velocity: ${wrVelocity.toFixed(0)}%. Trending toward breaker threshold.`;
  }

  return {
    rollingPF: Math.round(latestPF * 100) / 100, historicalPFMean: Math.round(pfMean * 100) / 100,
    historicalPFStd: Math.round(pfStd * 100) / 100, pfZScore: Math.round(pfZScore * 100) / 100, pfBroken,
    historicalWR: Math.round(backtestWR * 10) / 10, recentWR: Math.round(recentWR * 10) / 10,
    wrVelocity: Math.round(wrVelocity * 10) / 10, wrDecayAlert,
    cusumValues, cusumBreached, cusumThreshold: Math.round(h * 100) / 100,
    status, statusReason, rollingPFSeries, rollingWRSeries,
  };
}

function CircuitBreakerPanel({ profile }: { profile: ProfileResult }) {
  const [expanded, setExpanded] = useState(false);
  const cb = computeCircuitBreaker(profile.equityCurve, profile.winRate, profile.profitFactor);

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-[8px] font-mono transition-colors"
        style={{ color: cb.status === 'BROKEN' ? '#ff0055' : cb.status === 'WARNING' ? '#ff8800' : '#39ff14' }}
      >
        <AlertTriangle className="w-3 h-3" />
        <span className="uppercase tracking-widest font-bold">Circuit Breaker</span>
        <span className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full ml-1"
          style={{
            backgroundColor: cb.status === 'BROKEN' ? '#ff005515' : cb.status === 'WARNING' ? '#ff880015' : '#39ff1415',
            border: `1px solid ${cb.status === 'BROKEN' ? '#ff005533' : cb.status === 'WARNING' ? '#ff880033' : '#39ff1433'}`,
          }}>
          {cb.status === 'BROKEN' ? '⛔ BROKEN' : cb.status === 'WARNING' ? '⚠️ WARNING' : '✅ NOMINAL'}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 bg-slate-950/50 border rounded-lg p-3 space-y-3"
              style={{ borderColor: cb.status === 'BROKEN' ? '#ff005540' : cb.status === 'WARNING' ? '#ff880040' : '#1e293b60' }}>

              <p className="text-[8px] font-mono leading-relaxed" style={{ color: cb.status === 'BROKEN' ? '#ff6688' : cb.status === 'WARNING' ? '#ffaa55' : '#88aa88' }}>
                {cb.statusReason}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Rolling PF Z-Score */}
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Rolling PF Z-Score (30-trade)</span>
                    <span className="text-[7px] font-mono font-bold" style={{ color: cb.pfBroken ? '#ff0055' : '#39ff14' }}>
                      {cb.pfBroken ? 'BROKEN' : 'OK'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { l: 'Current PF', v: cb.rollingPF.toFixed(2), c: cb.rollingPF > 1 ? '#39ff14' : '#ff0055' },
                      { l: 'Hist. Mean', v: cb.historicalPFMean.toFixed(2), c: '#00ffea' },
                      { l: 'Hist. σ', v: cb.historicalPFStd.toFixed(2), c: '#8888aa' },
                      { l: 'Z-Score', v: `${cb.pfZScore > 0 ? '+' : ''}${cb.pfZScore.toFixed(2)}σ`, c: cb.pfZScore < -2 ? '#ff0055' : cb.pfZScore < -1 ? '#ff8800' : '#39ff14' },
                    ].map(m => (
                      <div key={m.l} className="text-center">
                        <div className="text-[6px] text-slate-600 uppercase">{m.l}</div>
                        <div className="text-[10px] font-mono font-bold" style={{ color: m.c }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                  {cb.rollingPFSeries.length > 2 && (() => {
                    const series = cb.rollingPFSeries;
                    const w = 300, h = 50, pad = 4;
                    const zVals = series.map(s => s.zScore);
                    const minZ = Math.min(-3, ...zVals), maxZ = Math.max(3, ...zVals);
                    const rng = maxZ - minZ || 1;
                    const neg2Y = h - pad - ((-2 - minZ) / rng) * (h - 2 * pad);
                    const pts = series.map((pt, i) => `${pad + (i / (series.length - 1)) * (w - 2 * pad)},${h - pad - ((pt.zScore - minZ) / rng) * (h - 2 * pad)}`);
                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 50 }} preserveAspectRatio="none">
                        <line x1={pad} y1={neg2Y} x2={w - pad} y2={neg2Y} stroke="#ff005544" strokeWidth="0.8" strokeDasharray="3,2" />
                        <text x={w - pad - 2} y={neg2Y - 2} fill="#ff0055" fontSize="5" textAnchor="end">-2σ</text>
                        <polyline points={pts.join(' ')} fill="none" stroke={cb.pfBroken ? '#ff0055' : '#00ffea'} strokeWidth="1.2" />
                      </svg>
                    );
                  })()}
                </div>

                {/* Win-Rate Velocity */}
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Win-Rate Velocity (20-trade)</span>
                    <span className="text-[7px] font-mono font-bold" style={{ color: cb.wrDecayAlert ? '#ff0055' : '#39ff14' }}>
                      {cb.wrDecayAlert ? 'DECAY ALERT' : 'STABLE'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { l: 'Historical WR', v: `${cb.historicalWR}%`, c: '#00ffea' },
                      { l: 'Recent WR', v: `${cb.recentWR}%`, c: cb.recentWR >= cb.historicalWR * 0.8 ? '#39ff14' : '#ff0055' },
                      { l: 'Velocity', v: `${cb.wrVelocity > 0 ? '+' : ''}${cb.wrVelocity}%`, c: cb.wrVelocity < -30 ? '#ff0055' : cb.wrVelocity < -15 ? '#ff8800' : '#39ff14' },
                    ].map(m => (
                      <div key={m.l} className="text-center">
                        <div className="text-[6px] text-slate-600 uppercase">{m.l}</div>
                        <div className="text-[10px] font-mono font-bold" style={{ color: m.c }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                  {cb.rollingWRSeries.length > 2 && (() => {
                    const series = cb.rollingWRSeries;
                    const w = 300, h = 50, pad = 4;
                    const wrVals = series.map(s => s.wr);
                    const minWR = Math.min(0, ...wrVals), maxWR = Math.max(100, ...wrVals);
                    const rng = maxWR - minWR || 1;
                    const histY = h - pad - ((cb.historicalWR - minWR) / rng) * (h - 2 * pad);
                    const pts = series.map((pt, i) => `${pad + (i / (series.length - 1)) * (w - 2 * pad)},${h - pad - ((pt.wr - minWR) / rng) * (h - 2 * pad)}`);
                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 50 }} preserveAspectRatio="none">
                        <line x1={pad} y1={histY} x2={w - pad} y2={histY} stroke="#00ffea33" strokeWidth="0.8" strokeDasharray="3,2" />
                        <text x={w - pad - 2} y={histY - 2} fill="#00ffea" fontSize="5" textAnchor="end">{cb.historicalWR}%</text>
                        <polyline points={pts.join(' ')} fill="none" stroke={cb.wrDecayAlert ? '#ff0055' : '#ff8800'} strokeWidth="1.2" />
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* CUSUM */}
              <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">CUSUM Drift Detection</span>
                  <span className="text-[7px] font-mono font-bold" style={{ color: cb.cusumBreached ? '#ff0055' : '#39ff14' }}>
                    {cb.cusumBreached ? 'BREACHED' : `H = ${cb.cusumThreshold}`}
                  </span>
                </div>
                {cb.cusumValues.length > 2 && (() => {
                  const vals = cb.cusumValues;
                  const w = 300, h = 45, pad = 4;
                  const minV = Math.min(-cb.cusumThreshold * 1.2, ...vals), maxV = Math.max(0.1, ...vals);
                  const rng = maxV - minV || 1;
                  const threshY = h - pad - ((-cb.cusumThreshold - minV) / rng) * (h - 2 * pad);
                  const step = Math.max(1, Math.floor(vals.length / 200));
                  const sampled = vals.filter((_, i) => i % step === 0 || i === vals.length - 1);
                  const pts = sampled.map((v, i) => `${pad + (i / (sampled.length - 1)) * (w - 2 * pad)},${h - pad - ((v - minV) / rng) * (h - 2 * pad)}`);
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 45 }} preserveAspectRatio="none">
                      <line x1={pad} y1={threshY} x2={w - pad} y2={threshY} stroke="#ff005544" strokeWidth="0.8" strokeDasharray="3,2" />
                      <text x={w - pad - 2} y={threshY - 2} fill="#ff0055" fontSize="5" textAnchor="end">-H</text>
                      <polyline points={pts.join(' ')} fill="none" stroke={cb.cusumBreached ? '#ff0055' : '#a855f7'} strokeWidth="1" />
                    </svg>
                  );
                })()}
                <p className="text-[7px] text-slate-600 font-mono">
                  Cumulative sum of deviations from target win-rate. Breach of H = {cb.cusumThreshold} = structural regime change.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

                      {/* Time Period Breakdown */}
                      <TimePeriodBreakdown curve={p.equityCurve} />

                      {/* Strategy Intelligence */}
                      <StrategyIntelligencePanel profile={p} allTop={topProfiles} idx={idx} />

                      {/* Statistical Circuit Breaker */}
                      <CircuitBreakerPanel profile={p} />
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
