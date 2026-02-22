// Shared Time Period Breakdown Component
// Used across all backtest dashboards: BacktestTearSheet, DynamicMatrixSandbox,
// ProfileDiscoveryEngine, ExperimentalStrategies, AlphaDiscoveryEngine

import { Calendar } from 'lucide-react';

const TIME_PERIODS = [
  { label: '3D', days: 3 },
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '45D', days: 45 },
  { label: '60D', days: 60 },
] as const;

interface PeriodStats {
  totalReturn: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  netPips: number;
  finalEquity: number;
}

function getTimePeriodStats(
  curve: Array<{ time: string; equity: number }>,
  totalDays: number,
  periodDays: number
): PeriodStats | null {
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
    totalReturn: Math.round(totalReturn * 10) / 10,
    winRate: Math.round(wr * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10) / 10,
    netPips: Math.round(netPips * 10) / 10,
    finalEquity: Math.round(endEq * 100) / 100,
  };
}

/** Full table variant — used in ProfileDiscoveryEngine, ExperimentalStrategies, etc. */
export function TimePeriodBreakdown({ curve }: { curve: Array<{ time: string; equity: number }> }) {
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
        <span className="text-[7px] font-bold text-amber-300 uppercase tracking-widest">Period Performance</span>
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

/** Compact inline variant — used in AlphaDiscoveryEngine cards */
export function PeriodPerformanceRow({ equityCurve, dateRange }: { equityCurve: number[]; dateRange?: { start: string; end: string } }) {
  if (!equityCurve || equityCurve.length < 10) return null;
  const totalBars = equityCurve.length;
  const periods = [
    { label: '3D', bars: Math.min(Math.round(totalBars * 0.02), totalBars) },
    { label: '7D', bars: Math.min(Math.round(totalBars * 0.05), totalBars) },
    { label: '14D', bars: Math.min(Math.round(totalBars * 0.1), totalBars) },
    { label: '30D', bars: Math.min(Math.round(totalBars * 0.2), totalBars) },
    { label: '45D', bars: Math.min(Math.round(totalBars * 0.3), totalBars) },
    { label: '60D', bars: Math.min(Math.round(totalBars * 0.4), totalBars) },
  ];

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className="text-[5px] text-slate-600 font-mono">PERIOD:</span>
      {periods.map(p => {
        const startIdx = Math.max(0, totalBars - p.bars);
        const startVal = equityCurve[startIdx] || equityCurve[0];
        const endVal = equityCurve[totalBars - 1];
        const pctChange = ((endVal - startVal) / (startVal || 1)) * 100;
        const color = pctChange >= 0 ? '#39ff14' : '#ff0055';
        return (
          <span key={p.label} className="text-[6px] font-mono px-1 py-0.5 rounded border border-slate-800/50 bg-slate-950/30" style={{ color }}>
            {p.label}: {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
          </span>
        );
      })}
    </div>
  );
}

/** Equity curve period breakdown — converts equity curve with times to period table */
export function EquityCurvePeriodBreakdown({ curve }: { curve: Array<{ time: string; equity: number }> }) {
  return <TimePeriodBreakdown curve={curve} />;
}
