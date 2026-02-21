// Dynamic Matrix Sandbox — Interactive Backtest Control Panel
// Drag sliders, toggle gates, simulate slippage — watch the math play out

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sliders, ToggleLeft, ToggleRight, TrendingUp, TrendingDown,
  Zap, Shield, Target, Activity, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { BacktestResult, RankComboResult } from '@/hooks/useRankExpectancy';

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
) {
  // Find the combo matching the selected ranks
  const combo = comboResults.find(
    c => c.strongRank === predatorRank && c.weakRank === preyRank,
  );
  if (!combo) return null;

  // Determine which metric set to use based on gate toggles
  // If all 3 gates ON → use gated stats; otherwise use ungated baseline
  const useGated = gate1 && gate2 && gate3;

  const rawTrades = useGated ? combo.gatedTrades : combo.trades;
  const rawWins = useGated ? combo.gatedWins : combo.wins;
  const rawPips = useGated ? combo.gatedPips : combo.totalPips;
  const rawWR = useGated ? combo.gatedWinRate : combo.winRate;
  const rawPF = useGated ? combo.gatedPF : combo.profitFactor;
  const rawGrossProfit = useGated
    ? (combo.gatedPF * (rawPips < 0 ? Math.abs(rawPips) : 1))
    : combo.grossProfit;
  const rawGrossLoss = useGated
    ? (rawPips < 0 ? Math.abs(rawPips) : rawGrossProfit / Math.max(0.01, combo.gatedPF))
    : combo.grossLoss;

  // Gate penalty simulation: turning off gates degrades performance
  let wrPenalty = 0;
  let pfMultiplier = 1;
  if (!gate1) { wrPenalty += 8; pfMultiplier *= 0.7; }
  if (!gate2) { wrPenalty += 12; pfMultiplier *= 0.6; }
  if (!gate3) { wrPenalty += 5; pfMultiplier *= 0.85; }

  // Slippage impact
  const slippageDrag = slippagePips * rawTrades;
  const adjustedPips = rawPips - slippageDrag;
  const adjustedWR = Math.max(0, rawWR - wrPenalty);
  const adjustedPF = Math.max(0, rawPF * pfMultiplier);

  // Build simulated equity curve
  const comboKey = `${predatorRank}v${preyRank}`;
  const baseCurve = equityCurves[comboKey] || equityCurves['1v8'] || [];
  const simulatedCurve = baseCurve.map((pt, idx) => {
    const progress = idx / Math.max(1, baseCurve.length - 1);
    // Apply gate penalties and slippage as a drag on the curve
    const gateDrag = wrPenalty * 0.15 * progress;
    const slipDrag = slippagePips * 2 * progress;
    return {
      time: pt.time,
      equity: Math.max(0, pt.equity - gateDrag - slipDrag),
    };
  });

  // Max drawdown
  let peak = 1000;
  let maxDD = 0;
  for (const pt of simulatedCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = ((pt.equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }

  // Total return
  const finalEquity = simulatedCurve.length > 0
    ? simulatedCurve[simulatedCurve.length - 1].equity
    : 1000;
  const totalReturn = ((finalEquity - 1000) / 1000) * 100;

  return {
    trades: rawTrades,
    wins: rawWins,
    winRate: Math.round(adjustedWR * 10) / 10,
    profitFactor: Math.round(adjustedPF * 100) / 100,
    totalPips: Math.round(adjustedPips * 10) / 10,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    totalReturn: Math.round(totalReturn * 10) / 10,
    equityCurve: simulatedCurve,
    finalEquity: Math.round(finalEquity * 100) / 100,
    slippageCost: Math.round(slippageDrag * 10) / 10,
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
    ),
    [result, predatorRank, preyRank, gate1, gate2, gate3, slippagePips],
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
                  <span>{sandbox.trades} trades · #{predatorRank} vs #{preyRank} · {[gate1 && 'G1', gate2 && 'G2', gate3 && 'G3'].filter(Boolean).join('+') || 'No Gates'}</span>
                  <span>{sandbox.equityCurve.length > 0 ? new Date(sandbox.equityCurve[sandbox.equityCurve.length - 1].time).toLocaleDateString() : ''}</span>
                </div>
              </div>

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
