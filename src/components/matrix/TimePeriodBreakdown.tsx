// Shared Time Period Breakdown Component
// Used across all backtest dashboards: BacktestTearSheet, DynamicMatrixSandbox,
// ProfileDiscoveryEngine, ExperimentalStrategies, AlphaDiscoveryEngine
//
// REALISTIC RETURNS: All period stats are calculated as simple (non-compounded)
// returns on $1,000 base equity using $0.10/pip position sizing.

import { Calendar } from 'lucide-react';

const TIME_PERIODS = [
  { label: '3D', days: 3 },
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '45D', days: 45 },
  { label: '60D', days: 60 },
] as const;

const BASE_EQUITY = 1000;
const PIP_VALUE = 0.10; // $0.10 per pip on $1,000

interface PeriodStats {
  simpleReturn: number;   // % return on $1,000 base
  winRate: number;
  profitFactor: number;
  maxDrawdownPips: number;
  netPips: number;
  trades: number;
}

/**
 * Calculates realistic period stats from an equity curve.
 * Instead of compounded returns, it counts net pips in the window
 * and converts to a simple return on $1,000 base.
 */
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

  // Count bar-by-bar changes as pip equivalents
  // Each bar's equity delta reflects the pip movement × compounded sizing.
  // To get realistic pips, we track direction of each bar (win/loss)
  // and estimate pip movement from the first bar's equity as reference.
  let wins = 0, losses = 0, grossProfitPips = 0, grossLossPips = 0;
  let peakPips = 0, runningPips = 0, maxDDPips = 0;

  for (let i = 1; i < slice.length; i++) {
    const prevEq = slice[i - 1].equity;
    const curEq = slice[i].equity;
    if (prevEq <= 0) continue;
    
    // Convert equity change back to simple pips:
    // pips = (equity_change / equity_at_bar) * (equity_at_bar / PIP_VALUE)
    // Simplifies to: approximate pips from percentage move on BASE_EQUITY
    const pctMove = (curEq - prevEq) / prevEq;
    const simplePips = (pctMove * BASE_EQUITY) / PIP_VALUE;

    if (simplePips > 0.01) {
      wins++;
      grossProfitPips += simplePips;
    } else if (simplePips < -0.01) {
      losses++;
      grossLossPips += Math.abs(simplePips);
    }

    runningPips += simplePips;
    if (runningPips > peakPips) peakPips = runningPips;
    const dd = runningPips - peakPips;
    if (dd < maxDDPips) maxDDPips = dd;
  }

  const netPips = runningPips;
  const simpleReturn = (netPips * PIP_VALUE / BASE_EQUITY) * 100;
  const pf = grossLossPips > 0 ? grossProfitPips / grossLossPips : grossProfitPips > 0 ? 999 : 0;
  const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
  const maxDDDollars = (Math.abs(maxDDPips) * PIP_VALUE / BASE_EQUITY) * 100;

  return {
    simpleReturn: Math.round(simpleReturn * 100) / 100,
    winRate: Math.round(wr * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100,
    maxDrawdownPips: Math.round(maxDDDollars * 10) / 10,
    netPips: Math.round(netPips * 10) / 10,
    trades: wins + losses,
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
        <span className="text-[7px] font-bold text-amber-300 uppercase tracking-widest">Realistic Period Expectations ($1K Base)</span>
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
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Trades</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(({ label, stats }) => {
              const s = stats!;
              return (
                <tr key={label} className="border-t border-slate-800/30">
                  <td className="p-1 text-[8px] font-mono font-bold text-slate-300 text-left">{label}</td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.simpleReturn >= 0 ? '#39ff14' : '#ff0055' }}>
                    {s.simpleReturn >= 0 ? '+' : ''}{s.simpleReturn}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.winRate >= 55 ? '#39ff14' : s.winRate >= 50 ? '#00ffea' : '#ff0055' }}>
                    {s.winRate}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.profitFactor > 1.5 ? '#39ff14' : s.profitFactor > 1 ? '#00ffea' : '#ff0055' }}>
                    {s.profitFactor}
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: '#ff0055' }}>
                    -{s.maxDrawdownPips}%
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold" style={{ color: s.netPips >= 0 ? '#39ff14' : '#ff0055' }}>
                    {s.netPips >= 0 ? '+' : ''}{s.netPips}
                  </td>
                  <td className="p-1 text-[8px] font-mono font-bold text-slate-400">
                    {s.trades}
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

/**
 * Compact inline variant — used in AlphaDiscoveryEngine cards.
 * Shows realistic simple returns on $1,000 base, not compounded equity %.
 */
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
      <span className="text-[5px] text-slate-600 font-mono">REALISTIC ($1K):</span>
      {periods.map(p => {
        const startIdx = Math.max(0, totalBars - p.bars);
        // Convert each bar's % move to simple pips, then to $1K return
        let netPips = 0;
        for (let i = startIdx + 1; i < totalBars; i++) {
          const prev = equityCurve[i - 1];
          if (prev <= 0) continue;
          const pctMove = (equityCurve[i] - prev) / prev;
          netPips += (pctMove * BASE_EQUITY) / PIP_VALUE;
        }
        const simpleReturn = (netPips * PIP_VALUE / BASE_EQUITY) * 100;
        const color = simpleReturn >= 0 ? '#39ff14' : '#ff0055';
        return (
          <span key={p.label} className="text-[6px] font-mono px-1 py-0.5 rounded border border-slate-800/50 bg-slate-950/30" style={{ color }}>
            {p.label}: {simpleReturn >= 0 ? '+' : ''}{simpleReturn.toFixed(1)}%
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
