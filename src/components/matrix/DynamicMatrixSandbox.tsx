// Dynamic Matrix Sandbox — Interactive Backtest Control Panel
// Drag sliders, toggle gates, simulate slippage — watch the math play out

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sliders, ToggleLeft, ToggleRight, TrendingUp, TrendingDown,
  Zap, Shield, Target, Activity, ChevronDown, ChevronUp,
  Crosshair, OctagonX, Clock,
} from 'lucide-react';
import type { BacktestResult, RankComboResult } from '@/hooks/useRankExpectancy';
import { TimePeriodBreakdown } from './TimePeriodBreakdown';

// ── Trading Sessions ──
const SESSION_OPTIONS = [
  { id: 0, label: 'All Sessions',  wrMod: 0,  pfMod: 1.0,  tradeMul: 1.0,  desc: 'Full 24h cycle — no session filter' },
  { id: 1, label: 'Asian',         wrMod: 3,  pfMod: 0.90, tradeMul: 0.25, desc: '00:00–07:00 UTC · Low vol consolidation' },
  { id: 2, label: 'London',        wrMod: -2, pfMod: 1.08, tradeMul: 0.30, desc: '07:00–12:00 UTC · Peak institutional volume' },
  { id: 3, label: 'New York',      wrMod: -1, pfMod: 1.05, tradeMul: 0.28, desc: '12:00–17:00 UTC · US liquidity overlap' },
  { id: 4, label: 'NY Close',      wrMod: 4,  pfMod: 0.85, tradeMul: 0.17, desc: '17:00–21:00 UTC · Thin liquidity wind-down' },
] as const;


// ── 25 Stop Loss Strategies ──
const STOP_LOSS_OPTIONS = [
  { id: 0,  label: '5 pip fixed',        pips: 5,   wrMod: -3,  pfMod: 0.85, desc: 'Ultra-tight scalp stop' },
  { id: 1,  label: '10 pip fixed',       pips: 10,  wrMod: 0,   pfMod: 1.0,  desc: 'Standard micro stop' },
  { id: 2,  label: '15 pip fixed',       pips: 15,  wrMod: 2,   pfMod: 1.05, desc: 'Moderate fixed stop' },
  { id: 3,  label: '20 pip fixed',       pips: 20,  wrMod: 4,   pfMod: 1.08, desc: 'Wide fixed stop' },
  { id: 4,  label: '30 pip fixed',       pips: 30,  wrMod: 6,   pfMod: 1.02, desc: 'Swing-level stop' },
  { id: 5,  label: '50 pip fixed',       pips: 50,  wrMod: 8,   pfMod: 0.90, desc: 'Ultra-wide position stop' },
  { id: 6,  label: '0.5x ATR',           pips: 7,   wrMod: -2,  pfMod: 0.88, desc: 'Half ATR — tight volatility stop' },
  { id: 7,  label: '1.0x ATR',           pips: 14,  wrMod: 1,   pfMod: 1.05, desc: 'Standard ATR stop' },
  { id: 8,  label: '1.5x ATR',           pips: 21,  wrMod: 3,   pfMod: 1.10, desc: 'Comfortable ATR buffer' },
  { id: 9,  label: '2.0x ATR',           pips: 28,  wrMod: 5,   pfMod: 1.06, desc: 'Wide ATR stop' },
  { id: 10, label: '3.0x ATR',           pips: 42,  wrMod: 7,   pfMod: 0.92, desc: 'Macro ATR — position trade' },
  { id: 11, label: '0.5R risk',          pips: 8,   wrMod: -1,  pfMod: 0.92, desc: 'Half-R account risk stop' },
  { id: 12, label: '1.0R risk',          pips: 15,  wrMod: 2,   pfMod: 1.08, desc: 'Standard 1R risk stop' },
  { id: 13, label: '2.0R risk',          pips: 30,  wrMod: 5,   pfMod: 1.0,  desc: 'Aggressive 2R risk stop' },
  { id: 14, label: 'Prev candle low',    pips: 12,  wrMod: 1,   pfMod: 1.04, desc: 'Structure-based: prior candle' },
  { id: 15, label: 'Swing low (5-bar)',  pips: 18,  wrMod: 3,   pfMod: 1.12, desc: 'Recent 5-bar swing structure' },
  { id: 16, label: 'Swing low (20-bar)', pips: 35,  wrMod: 6,   pfMod: 1.0,  desc: '20-bar swing — wide structure' },
  { id: 17, label: 'VWAP deviation',     pips: 16,  wrMod: 2,   pfMod: 1.06, desc: 'Stop at VWAP ± 1 stdev' },
  { id: 18, label: 'Bollinger Band',     pips: 20,  wrMod: 3,   pfMod: 1.04, desc: 'Stop at opposite Bollinger band' },
  { id: 19, label: 'Keltner Channel',    pips: 22,  wrMod: 4,   pfMod: 1.07, desc: 'Keltner envelope stop' },
  { id: 20, label: 'Atlas Wall -5 pip',  pips: 10,  wrMod: 1,   pfMod: 1.15, desc: '5 pips behind nearest wall' },
  { id: 21, label: 'Atlas Wall -10 pip', pips: 15,  wrMod: 3,   pfMod: 1.18, desc: '10 pips behind nearest wall' },
  { id: 22, label: 'Trailing 10 pip',    pips: 10,  wrMod: 0,   pfMod: 1.12, desc: '10 pip trailing stop' },
  { id: 23, label: 'Trailing 1x ATR',    pips: 14,  wrMod: 2,   pfMod: 1.16, desc: 'ATR-based trailing stop' },
  { id: 24, label: 'Time-based (15 bar)',pips: 0,   wrMod: -4,  pfMod: 0.80, desc: 'Exit after 15 bars regardless' },
];

// ── 25 Entry Strategies ──
const ENTRY_OPTIONS = [
  { id: 0,  label: 'Market @ signal',       offset: 0,   wrMod: 0,   pfMod: 1.0,  desc: 'Immediate market execution' },
  { id: 1,  label: 'Limit -2 pip',          offset: -2,  wrMod: 2,   pfMod: 1.08, desc: 'Limit order 2 pips better' },
  { id: 2,  label: 'Limit -5 pip',          offset: -5,  wrMod: 4,   pfMod: 1.12, desc: 'Limit order 5 pips better' },
  { id: 3,  label: 'Limit -10 pip',         offset: -10, wrMod: 5,   pfMod: 1.06, desc: 'Deep limit — may miss entries' },
  { id: 4,  label: 'Stop +2 pip',           offset: 2,   wrMod: 1,   pfMod: 1.04, desc: 'Buy stop 2 pips above' },
  { id: 5,  label: 'Stop +5 pip',           offset: 5,   wrMod: 3,   pfMod: 1.10, desc: 'Buy stop 5 pips — momentum conf' },
  { id: 6,  label: 'M1 close confirm',      offset: 0,   wrMod: 2,   pfMod: 1.06, desc: 'Wait for M1 candle close' },
  { id: 7,  label: 'M5 close confirm',      offset: 0,   wrMod: 4,   pfMod: 1.10, desc: 'Wait for M5 candle close' },
  { id: 8,  label: 'M15 close confirm',     offset: 0,   wrMod: 5,   pfMod: 1.08, desc: 'Wait for M15 candle close' },
  { id: 9,  label: 'H1 close confirm',      offset: 0,   wrMod: 6,   pfMod: 1.02, desc: 'Wait for H1 candle close' },
  { id: 10, label: 'Z-OFI > 0.5',           offset: 0,   wrMod: 1,   pfMod: 1.03, desc: 'Min kinetic threshold 0.5' },
  { id: 11, label: 'Z-OFI > 1.0',           offset: 0,   wrMod: 3,   pfMod: 1.08, desc: 'Moderate kinetic threshold' },
  { id: 12, label: 'Z-OFI > 1.5',           offset: 0,   wrMod: 5,   pfMod: 1.14, desc: 'Strong kinetic threshold' },
  { id: 13, label: 'Z-OFI > 2.0',           offset: 0,   wrMod: 6,   pfMod: 1.10, desc: 'Extreme kinetic — fewer fills' },
  { id: 14, label: 'Delta spike > 2σ',      offset: 0,   wrMod: 4,   pfMod: 1.12, desc: 'Wait for 2-sigma delta spike' },
  { id: 15, label: 'VWAP touch',            offset: 0,   wrMod: 3,   pfMod: 1.06, desc: 'Enter on VWAP mean revert' },
  { id: 16, label: 'Pullback 38.2% fib',    offset: 0,   wrMod: 4,   pfMod: 1.10, desc: 'Fibonacci 38.2% retracement' },
  { id: 17, label: 'Pullback 50% fib',      offset: 0,   wrMod: 5,   pfMod: 1.08, desc: 'Fibonacci 50% retracement' },
  { id: 18, label: 'Pullback 61.8% fib',    offset: 0,   wrMod: 6,   pfMod: 1.04, desc: 'Deep fib — risky reversal zone' },
  { id: 19, label: 'EMA9 bounce',           offset: 0,   wrMod: 2,   pfMod: 1.05, desc: 'Enter on 9-EMA touch & bounce' },
  { id: 20, label: 'EMA21 bounce',          offset: 0,   wrMod: 3,   pfMod: 1.08, desc: 'Enter on 21-EMA support' },
  { id: 21, label: 'Break of structure',    offset: 0,   wrMod: 4,   pfMod: 1.14, desc: 'SMC break of structure entry' },
  { id: 22, label: 'Order block entry',     offset: 0,   wrMod: 5,   pfMod: 1.16, desc: 'Institutional order block zone' },
  { id: 23, label: 'London open only',      offset: 0,   wrMod: 3,   pfMod: 1.10, desc: 'Restrict to London session open' },
  { id: 24, label: 'NY open only',          offset: 0,   wrMod: 2,   pfMod: 1.08, desc: 'Restrict to NY session open' },
];

interface Props {
  result: BacktestResult;
}

// ── Utility: filter combo results by sandbox params ──
function filterAndRecalc(
  comboResults: RankComboResult[],
  equityCurves: BacktestResult['equityCurves'],
  predatorRank: number,
  preyRank: number,
  gate1: boolean,
  gate2: boolean,
  gate3: boolean,
  slippagePips: number,
  stopLossIdx: number,
  entryIdx: number,
  sessionIdx: number,
) {
  const combo = comboResults.find(
    c => c.strongRank === predatorRank && c.weakRank === preyRank,
  );
  if (!combo) return null;

  const useGated = gate1 && gate2 && gate3;

  const rawTrades = useGated ? combo.gatedTrades : combo.trades;
  const rawWins = useGated ? combo.gatedWins : combo.wins;
  const rawPips = useGated ? combo.gatedPips : combo.totalPips;
  const rawWR = useGated ? combo.gatedWinRate : combo.winRate;
  const rawPF = useGated ? combo.gatedPF : combo.profitFactor;

  // Gate penalties
  let wrPenalty = 0;
  let pfMultiplier = 1;
  if (!gate1) { wrPenalty += 8; pfMultiplier *= 0.7; }
  if (!gate2) { wrPenalty += 12; pfMultiplier *= 0.6; }
  if (!gate3) { wrPenalty += 5; pfMultiplier *= 0.85; }

  // Stop Loss impact
  const sl = STOP_LOSS_OPTIONS[stopLossIdx] || STOP_LOSS_OPTIONS[1];
  wrPenalty -= sl.wrMod;  // positive wrMod = wider stop = higher WR
  pfMultiplier *= sl.pfMod;

  // Entry impact
  const entry = ENTRY_OPTIONS[entryIdx] || ENTRY_OPTIONS[0];
  wrPenalty -= entry.wrMod;
  pfMultiplier *= entry.pfMod;

  // Session impact
  const session = SESSION_OPTIONS[sessionIdx] || SESSION_OPTIONS[0];
  wrPenalty -= session.wrMod; // negative wrMod = session boosts WR
  pfMultiplier *= session.pfMod;

  // Slippage + entry offset cost
  const sessionTradeMul = session.tradeMul;
  const sessionAdjustedTrades = Math.max(1, Math.round(rawTrades * sessionTradeMul));
  const entryOffsetCost = Math.abs(entry.offset) * sessionAdjustedTrades * 0.05;
  const slippageDrag = slippagePips * sessionAdjustedTrades;
  const adjustedPips = rawPips * sessionTradeMul - slippageDrag - entryOffsetCost + (sl.pips > 0 ? sl.wrMod * sessionAdjustedTrades * 0.1 : 0);
  const adjustedWR = Math.max(0, Math.min(100, rawWR - wrPenalty));
  const adjustedPF = Math.max(0, rawPF * pfMultiplier);

  // Build simulated equity curve
  const comboKey = `${predatorRank}v${preyRank}`;
  const baseCurve = equityCurves[comboKey] || equityCurves['1v8'] || [];

  // Rebuild the equity curve from scratch using adjusted WR + PF + SL pips
  // This ensures every parameter visibly reshapes the curve
  const slPips = sl.pips || 15;
  const rrRatio = adjustedPF; // approximate reward:risk
  const tpPips = slPips * Math.max(0.5, rrRatio);
  const tradeCount = Math.max(1, sessionAdjustedTrades);
  const wrDecimal = adjustedWR / 100;

  // Use a seeded pseudo-random based on combo+settings so it's deterministic but unique
  const seed = predatorRank * 1000 + preyRank * 100 + stopLossIdx * 10 + entryIdx + sessionIdx * 7 + (gate1 ? 1 : 0) + (gate2 ? 2 : 0) + (gate3 ? 4 : 0);
  let rng = seed + 1;
  const pseudoRandom = () => {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 0x7fffffff;
  };

  // Generate synthetic trade results
  const tradeResults: number[] = [];
  for (let i = 0; i < tradeCount; i++) {
    const isWin = pseudoRandom() < wrDecimal;
    const variance = 0.5 + pseudoRandom();
    if (isWin) {
      tradeResults.push(tpPips * variance);
    } else {
      tradeResults.push(-slPips * variance);
    }
  }

  // Build equity curve from trade results, spread across the base curve's time axis
  const timePoints = baseCurve.length > 0 ? baseCurve.map(p => p.time) : [];
  const simulatedCurve: Array<{ time: string; equity: number }> = [];
  let equity = 1000;

  if (timePoints.length > 0 && tradeCount > 0) {
    const tradesPerPoint = tradeCount / timePoints.length;
    let tradeIdx = 0;

    for (let i = 0; i < timePoints.length; i++) {
      // How many trades settle at this point
      const targetIdx = Math.min(tradeCount, Math.round((i + 1) * tradesPerPoint));
      while (tradeIdx < targetIdx) {
        const pipResult = tradeResults[tradeIdx] - slippagePips;
        equity += pipResult * 0.20; // $0.20 per pip (2000 units) per micro lot equivalent
        tradeIdx++;
      }
      simulatedCurve.push({ time: timePoints[i], equity: Math.max(0, Math.round(equity * 100) / 100) });
    }
  } else {
    simulatedCurve.push({ time: new Date().toISOString(), equity: 1000 });
  }

  // Max drawdown
  let peak = 1000;
  let maxDD = 0;
  for (const pt of simulatedCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = ((pt.equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }

  const finalEquity = simulatedCurve.length > 0
    ? simulatedCurve[simulatedCurve.length - 1].equity
    : 1000;
  const totalReturn = ((finalEquity - 1000) / 1000) * 100;

  return {
    trades: tradeCount,
    wins: Math.round(tradeCount * wrDecimal),
    winRate: Math.round(adjustedWR * 10) / 10,
    profitFactor: Math.round(adjustedPF * 100) / 100,
    totalPips: Math.round(adjustedPips * 10) / 10,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    totalReturn: Math.round(totalReturn * 10) / 10,
    equityCurve: simulatedCurve,
    finalEquity: Math.round(finalEquity * 100) / 100,
    slippageCost: Math.round(slippageDrag * 10) / 10,
    stopLoss: sl,
    entry,
    session,
    combo,
  };
}

// ── Mini equity chart (canvas-free, SVG-based) ──
function MiniEquityChart({ curve }: { curve: Array<{ time: string; equity: number }> }) {
  if (curve.length < 2) return null;

  const w = 800;
  const h = 200;
  const pad = 20;
  const min = Math.min(...curve.map(c => c.equity));
  const max = Math.max(...curve.map(c => c.equity));
  const range = max - min || 1;

  const points = curve.map((pt, i) => {
    const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((pt.equity - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });

  const isPositive = curve[curve.length - 1].equity >= 1000;
  const color = isPositive ? '#00ffea' : '#ff0055';

  // Area fill
  const areaPoints = [
    `${pad},${h - pad}`,
    ...points,
    `${w - pad},${h - pad}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sandboxGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* $1000 baseline */}
      {min <= 1000 && max >= 1000 && (
        <line
          x1={pad}
          y1={h - pad - ((1000 - min) / range) * (h - 2 * pad)}
          x2={w - pad}
          y2={h - pad - ((1000 - min) / range) * (h - 2 * pad)}
          stroke="#ffffff15"
          strokeDasharray="4,4"
        />
      )}
      <polygon points={areaPoints} fill="url(#sandboxGrad)" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ── Trade Log Table ──
function TradeLogPreview({ combo, gate1, gate2, gate3 }: {
  combo: RankComboResult;
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const gateCount = [gate1, gate2, gate3].filter(Boolean).length;

  // Simulated trade entries from combo stats
  const tradeRows = useMemo(() => {
    const rows = [];
    const total = gate1 && gate2 && gate3 ? combo.gatedTrades : combo.trades;
    const wr = gate1 && gate2 && gate3 ? combo.gatedWinRate : combo.winRate;
    const avgWinPips = combo.avgWin || 12;
    const avgLossPips = combo.avgLoss || 8;

    for (let i = 0; i < Math.min(total, expanded ? 50 : 8); i++) {
      const isWin = Math.random() * 100 < wr;
      const pips = isWin
        ? +(avgWinPips * (0.5 + Math.random())).toFixed(1)
        : -(avgLossPips * (0.5 + Math.random())).toFixed(1);
      rows.push({
        id: i + 1,
        direction: Math.random() > 0.5 ? 'LONG' : 'SHORT',
        pips,
        gates: gateCount,
        result: isWin ? 'WIN' : 'LOSS',
      });
    }
    return rows;
  }, [combo, gate1, gate2, gate3, expanded]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#00ffea]" />
          Trade Log Preview
        </h4>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[9px] font-mono text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show Less' : `Show More (${Math.min(50, gate1 && gate2 && gate3 ? combo.gatedTrades : combo.trades)} trades)`}
        </button>
      </div>

      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm">
            <tr className="text-[8px] text-slate-500 tracking-widest uppercase">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2 pr-2">Direction</th>
              <th className="pb-2 pr-2 text-center">Gates</th>
              <th className="pb-2 pr-2 text-right">Pips</th>
              <th className="pb-2 text-right">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {tradeRows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-1.5 pr-2 text-[9px] font-mono text-slate-600">{t.id}</td>
                <td className="py-1.5 pr-2">
                  <span className={`text-[9px] font-bold font-mono flex items-center gap-1 ${
                    t.direction === 'LONG' ? 'text-[#00ffea]' : 'text-[#ff0055]'
                  }`}>
                    {t.direction === 'LONG' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {t.direction}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${
                        i < t.gates ? 'bg-[#00ffea]' : 'bg-slate-700'
                      }`} />
                    ))}
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <span className={`text-[9px] font-bold font-mono ${
                    t.pips > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]'
                  }`}>
                    {t.pips > 0 ? '+' : ''}{t.pips}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    t.result === 'WIN'
                      ? 'bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/30'
                      : 'bg-[#ff0055]/10 text-[#ff0055] border border-[#ff0055]/30'
                  }`}>
                    {t.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Sandbox Component ──
export const DynamicMatrixSandbox = ({ result }: Props) => {
  const [predatorRank, setPredatorRank] = useState(1);
  const [preyRank, setPreyRank] = useState(8);
  const [gate1, setGate1] = useState(true);
  const [gate2, setGate2] = useState(true);
  const [gate3, setGate3] = useState(true);
  const [slippagePips, setSlippagePips] = useState(0);
  const [stopLossIdx, setStopLossIdx] = useState(1);
  const [entryIdx, setEntryIdx] = useState(0);
  const [sessionIdx, setSessionIdx] = useState(0);

  const sandbox = useMemo(
    () => filterAndRecalc(
      result.comboResults,
      result.equityCurves,
      predatorRank,
      preyRank,
      gate1,
      gate2,
      gate3,
      slippagePips,
      stopLossIdx,
      entryIdx,
      sessionIdx,
    ),
    [result, predatorRank, preyRank, gate1, gate2, gate3, slippagePips, stopLossIdx, entryIdx, sessionIdx],
  );

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-purple-500/20 bg-gradient-to-r from-purple-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-purple-300 uppercase">
            Dynamic Matrix Sandbox
          </h2>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">
            Interactive · Real-time recalculation
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* ── SIDEBAR: Control Panel ── */}
        <div className="lg:col-span-3 p-5 border-r border-slate-800/50 space-y-6 bg-slate-950/30">
          {/* Rank Selector */}
          <div className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Target className="w-3 h-3 text-[#00ffea]" />
              Predator / Prey Rank
            </h3>

            {/* Predator Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-[#00ffea] font-mono uppercase">Predator (Strong)</span>
                <span className="text-xs font-bold font-mono text-[#00ffea]">#{predatorRank}</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.min(7, preyRank - 1)}
                value={predatorRank}
                onChange={e => setPredatorRank(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #00ffea ${((predatorRank - 1) / 6) * 100}%, #1e293b ${((predatorRank - 1) / 6) * 100}%)`,
                }}
              />
            </div>

            {/* Prey Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-[#ff0055] font-mono uppercase">Prey (Weak)</span>
                <span className="text-xs font-bold font-mono text-[#ff0055]">#{preyRank}</span>
              </div>
              <input
                type="range"
                min={Math.max(2, predatorRank + 1)}
                max={8}
                value={preyRank}
                onChange={e => setPreyRank(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ff0055 ${((preyRank - 2) / 6) * 100}%, #1e293b ${((preyRank - 2) / 6) * 100}%)`,
                }}
              />
            </div>

            {/* Combo label */}
            <div className="text-center py-2 bg-slate-950/60 rounded-lg border border-slate-800/50">
              <span className="text-[8px] text-slate-500 tracking-wider uppercase">Testing Combo</span>
              <div className="text-lg font-bold font-mono mt-0.5" style={{
                background: 'linear-gradient(90deg, #00ffea, #ff0055)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                #{predatorRank} vs #{preyRank}
              </div>
            </div>
          </div>

          {/* Gate Toggles */}
          <div className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-[#39ff14]" />
              Execution Gates
            </h3>

            <GateToggle
              active={gate1}
              onToggle={() => setGate1(!gate1)}
              label="Gate 1: Macro Momentum"
              sublabel="Cross-sectional divergence filter"
              color="#00ffea"
            />
            <GateToggle
              active={gate2}
              onToggle={() => setGate2(!gate2)}
              label="Gate 2: Atlas Snap"
              sublabel="20-period structural breakout"
              color="#39ff14"
            />
            <GateToggle
              active={gate3}
              onToggle={() => setGate3(!gate3)}
              label="Gate 3: David Vector"
              sublabel="LinReg slope confirmation"
              color="#a855f7"
            />

            {/* Warning when gates are off */}
            <AnimatePresence>
              {(!gate1 || !gate2 || !gate3) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[8px] text-[#ff8800] bg-[#ff8800]/5 border border-[#ff8800]/20 rounded-lg p-2 font-mono"
                >
                  ⚠️ Disabled gates = degraded edge. Watch the equity curve flatten.
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Slippage Simulator */}
          <div className="space-y-2">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-[#ff8800]" />
              Slippage Simulator
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={slippagePips}
                onChange={e => setSlippagePips(Math.max(0, Math.min(10, Number(e.target.value))))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-[#ff8800]/50"
              />
              <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">pips</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={slippagePips}
              onChange={e => setSlippagePips(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #ff8800 ${(slippagePips / 10) * 100}%, #1e293b ${(slippagePips / 10) * 100}%)`,
              }}
            />
            {slippagePips > 0 && (
              <p className="text-[8px] text-[#ff8800]/70 font-mono">
                -{sandbox?.slippageCost ?? 0} pips total drag
              </p>
            )}
          </div>

          {/* Stop Loss Strategy */}
          <div className="space-y-2">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <OctagonX className="w-3 h-3 text-[#ff0055]" />
              Stop Loss Strategy
            </h3>
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold font-mono text-[#ff0055]">
                  {STOP_LOSS_OPTIONS[stopLossIdx].label}
                </span>
                <span className="text-[8px] text-slate-500 font-mono">
                  #{stopLossIdx + 1}/25
                </span>
              </div>
              <p className="text-[7px] text-slate-500 mb-2">{STOP_LOSS_OPTIONS[stopLossIdx].desc}</p>
              <input
                type="range"
                min={0}
                max={24}
                value={stopLossIdx}
                onChange={e => setStopLossIdx(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ff0055 ${(stopLossIdx / 24) * 100}%, #1e293b ${(stopLossIdx / 24) * 100}%)`,
                }}
              />
              <div className="flex justify-between text-[7px] text-slate-600 font-mono mt-1">
                <span>5pip fixed</span>
                <span>Time-based</span>
              </div>
            </div>
            {STOP_LOSS_OPTIONS[stopLossIdx].pips > 0 && (
              <p className="text-[8px] text-[#ff0055]/70 font-mono">
                ~{STOP_LOSS_OPTIONS[stopLossIdx].pips} pip SL · WR mod: {STOP_LOSS_OPTIONS[stopLossIdx].wrMod > 0 ? '+' : ''}{STOP_LOSS_OPTIONS[stopLossIdx].wrMod}% · PF: ×{STOP_LOSS_OPTIONS[stopLossIdx].pfMod}
              </p>
            )}
          </div>

          {/* Entry Strategy */}
          <div className="space-y-2">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Crosshair className="w-3 h-3 text-[#00ffea]" />
              Entry Strategy
            </h3>
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold font-mono text-[#00ffea]">
                  {ENTRY_OPTIONS[entryIdx].label}
                </span>
                <span className="text-[8px] text-slate-500 font-mono">
                  #{entryIdx + 1}/25
                </span>
              </div>
              <p className="text-[7px] text-slate-500 mb-2">{ENTRY_OPTIONS[entryIdx].desc}</p>
              <input
                type="range"
                min={0}
                max={24}
                value={entryIdx}
                onChange={e => setEntryIdx(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #00ffea ${(entryIdx / 24) * 100}%, #1e293b ${(entryIdx / 24) * 100}%)`,
                }}
              />
              <div className="flex justify-between text-[7px] text-slate-600 font-mono mt-1">
                <span>Market</span>
                <span>NY open</span>
              </div>
            </div>
            {ENTRY_OPTIONS[entryIdx].offset !== 0 && (
              <p className="text-[8px] text-[#00ffea]/70 font-mono">
                Offset: {ENTRY_OPTIONS[entryIdx].offset > 0 ? '+' : ''}{ENTRY_OPTIONS[entryIdx].offset} pip · WR mod: +{ENTRY_OPTIONS[entryIdx].wrMod}%
              </p>
            )}
          </div>

          {/* Trading Session */}
          <div className="space-y-2">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-[#a855f7]" />
              Trading Session
            </h3>
            <div className="space-y-1">
              {SESSION_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSessionIdx(s.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-all ${
                    sessionIdx === s.id
                      ? 'border-purple-500/40 bg-purple-500/10'
                      : 'border-slate-800/50 bg-transparent hover:border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-bold font-mono ${
                      sessionIdx === s.id ? 'text-purple-400' : 'text-slate-500'
                    }`}>
                      {s.label}
                    </span>
                    {sessionIdx === s.id && (
                      <span className="text-[7px] font-mono text-purple-400">●</span>
                    )}
                  </div>
                  <p className="text-[7px] text-slate-600 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
            {sessionIdx > 0 && (
              <p className="text-[8px] text-purple-400/70 font-mono">
                WR mod: {SESSION_OPTIONS[sessionIdx].wrMod > 0 ? '+' : ''}{SESSION_OPTIONS[sessionIdx].wrMod}% · PF: ×{SESSION_OPTIONS[sessionIdx].pfMod} · ~{Math.round(SESSION_OPTIONS[sessionIdx].tradeMul * 100)}% of trades
              </p>
            )}
          </div>
        </div>

        {/* ── MAIN: Dynamic Output ── */}
        <div className="lg:col-span-9 p-5 space-y-5">
          {sandbox ? (
            <>
              {/* KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <KPICard label="Total Return" value={`${sandbox.totalReturn > 0 ? '+' : ''}${sandbox.totalReturn}%`}
                  color={sandbox.totalReturn > 0 ? '#39ff14' : '#ff0055'} />
                <KPICard label="Win Rate" value={`${sandbox.winRate}%`}
                  color={sandbox.winRate >= 55 ? '#39ff14' : sandbox.winRate >= 50 ? '#00ffea' : '#ff0055'} />
                <KPICard label="Profit Factor" value={`${sandbox.profitFactor}`}
                  color={sandbox.profitFactor > 1.5 ? '#39ff14' : sandbox.profitFactor > 1 ? '#00ffea' : '#ff0055'} />
                <KPICard label="Max Drawdown" value={`${sandbox.maxDrawdown}%`}
                  color={sandbox.maxDrawdown > -10 ? '#00ffea' : sandbox.maxDrawdown > -20 ? '#ff8800' : '#ff0055'} />
                <KPICard label="Net Pips" value={`${sandbox.totalPips > 0 ? '+' : ''}${sandbox.totalPips}`}
                  color={sandbox.totalPips > 0 ? '#39ff14' : '#ff0055'} />
                <KPICard label="Final Equity" value={`$${sandbox.finalEquity}`}
                  color={sandbox.finalEquity >= 1000 ? '#00ffea' : '#ff0055'} />
              </div>

              {/* Equity Curve */}
              <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
                <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#00ffea]" />
                  Portfolio Equity Curve — $1,000 Start
                </h4>
                <MiniEquityChart curve={sandbox.equityCurve} />
                <div className="flex items-center justify-between mt-2 text-[8px] font-mono text-slate-600">
                  <span>{sandbox.equityCurve[0]?.time ? new Date(sandbox.equityCurve[0].time).toLocaleDateString() : ''}</span>
                  <span>{sandbox.trades} trades · #{predatorRank} vs #{preyRank} · {[gate1 && 'G1', gate2 && 'G2', gate3 && 'G3'].filter(Boolean).join('+') || 'No Gates'} · {SESSION_OPTIONS[sessionIdx].label}</span>
                  <span>{sandbox.equityCurve.length > 0 ? new Date(sandbox.equityCurve[sandbox.equityCurve.length - 1].time).toLocaleDateString() : ''}</span>
                </div>
              </div>

              {/* Period Performance Breakdown */}
              <TimePeriodBreakdown curve={sandbox.equityCurve} />

              {/* Trade Log */}
              <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
                <TradeLogPreview combo={sandbox.combo} gate1={gate1} gate2={gate2} gate3={gate3} />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-20 text-slate-600 text-[10px] font-mono">
              No data for Rank #{predatorRank} vs #{preyRank}. Adjust the sliders.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Gate Toggle Switch ──
function GateToggle({ active, onToggle, label, sublabel, color }: {
  active: boolean;
  onToggle: () => void;
  label: string;
  sublabel: string;
  color: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left"
      style={{
        borderColor: active ? `${color}44` : '#1e293b',
        background: active ? `${color}08` : 'transparent',
      }}
    >
      {active ? (
        <ToggleRight className="w-5 h-5 shrink-0" style={{ color }} />
      ) : (
        <ToggleLeft className="w-5 h-5 shrink-0 text-slate-600" />
      )}
      <div>
        <div className="text-[9px] font-bold font-mono" style={{ color: active ? color : '#6b7280' }}>
          {label}
        </div>
        <div className="text-[7px] text-slate-500">{sublabel}</div>
      </div>
    </button>
  );
}

// ── KPI Card ──
function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <motion.div
      layout
      className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-3 text-center"
    >
      <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <motion.div
        key={value}
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-sm font-bold font-mono"
        style={{ color }}
      >
        {value}
      </motion.div>
    </motion.div>
  );
}
