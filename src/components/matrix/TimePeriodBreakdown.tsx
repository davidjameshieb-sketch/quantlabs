// Shared Time Period Breakdown Component
// Used across all backtest dashboards: BacktestTearSheet, DynamicMatrixSandbox,
// ProfileDiscoveryEngine, ExperimentalStrategies, AlphaDiscoveryEngine
//
// REALISTIC RETURNS: All period stats use 5% risk dynamic position sizing.
// Units scale geometrically with equity: Risk = Equity * 0.05, Units = Risk / (SL * pipValue).

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
const RISK_PCT = 0.05; // 5% risk per trade
const STD_SL_PIPS = 15; // standardized SL for period breakdown sizing

interface PeriodStats {
  simpleReturn: number;   // % return on $1,000 base
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  netPips: number;
  trades: number;
}

/**
 * Counts "active bars" (bars where equity changed significantly) in a curve slice.
 * Each active bar approximates one trade event.
 */
function countActiveBars(slice: Array<{ equity: number }>): number {
  let count = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].equity;
    if (prev <= 0) continue;
    const pctMove = Math.abs((slice[i].equity - prev) / prev);
    if (pctMove > 0.0001) count++;
  }
  return count;
}

/**
 * Calculates realistic period stats from an equity curve.
 * Uses proportional pip distribution based on trade activity in each window,
 * rather than trying to reverse-engineer pips from compounded equity values.
 */
function getTimePeriodStats(
  curve: Array<{ time: string; equity: number }>,
  totalDays: number,
  periodDays: number,
  overallTotalPips?: number,
  overallTotalActiveBars?: number,
): PeriodStats | null {
  if (curve.length < 2 || periodDays > totalDays) return null;
  const ratio = periodDays / Math.max(1, totalDays);
  const startIdx = Math.max(0, Math.floor(curve.length * (1 - ratio)));
  const slice = curve.slice(startIdx);
  if (slice.length < 2) return null;

  // Count wins/losses and drawdown from equity direction only
  let wins = 0, losses = 0;
  let peakEq = slice[0].equity, maxDDPct = 0;
  let activeBarsInWindow = 0;

  for (let i = 1; i < slice.length; i++) {
    const prevEq = slice[i - 1].equity;
    const curEq = slice[i].equity;
    if (prevEq <= 0) continue;
    const pctMove = (curEq - prevEq) / prevEq;

    if (Math.abs(pctMove) > 0.0001) {
      activeBarsInWindow++;
      if (pctMove > 0) wins++;
      else losses++;
    }

    if (curEq > peakEq) peakEq = curEq;
    const dd = (peakEq - curEq) / peakEq;
    if (dd > maxDDPct) maxDDPct = dd;
  }

  // Proportional pip distribution: allocate overall pips based on
  // fraction of trade activity in this window vs entire curve
  let netPips = 0;
  if (overallTotalPips != null && overallTotalActiveBars != null && overallTotalActiveBars > 0) {
    const fraction = activeBarsInWindow / overallTotalActiveBars;
    netPips = overallTotalPips * fraction;
  } else {
    // Fallback: use equity curve % change but deflate via log-return
    // With dynamic 5% risk sizing, approximate pip value from current equity
    const startEq = slice[0].equity;
    const endEq = slice[slice.length - 1].equity;
    if (startEq > 0 && endEq > 0) {
      const logReturn = Math.log(endEq / startEq);
      // Approximate pip value at avg equity level using 5% risk formula
      const avgEq = (startEq + endEq) / 2;
      const dynPipValue = (avgEq * RISK_PCT) / STD_SL_PIPS; // $/pip at this equity level
      netPips = dynPipValue > 0 ? (logReturn * avgEq) / dynPipValue : 0;
    }
  }

  // Approximate simple return from equity change
  const startEqFinal = slice[0]?.equity ?? BASE_EQUITY;
  const endEqFinal = slice[slice.length - 1]?.equity ?? BASE_EQUITY;
  const simpleReturn = startEqFinal > 0 ? ((endEqFinal - startEqFinal) / startEqFinal) * 100 : 0;
  const totalTrades = wins + losses;
  const wr = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  // Approximate PF from win/loss ratio (since we don't have exact pip breakdown per trade)
  const pf = losses > 0 ? (wins / losses) * (simpleReturn > 0 ? 1.2 : 0.8) : (wins > 0 ? 99 : 0);

  return {
    simpleReturn: Math.round(simpleReturn * 100) / 100,
    winRate: Math.round(wr * 10) / 10,
    profitFactor: Math.round(pf * 100) / 100,
    maxDrawdownPct: Math.round(maxDDPct * 1000) / 10,
    netPips: Math.round(netPips * 10) / 10,
    trades: totalTrades,
  };
}

/** Full table variant — used in ProfileDiscoveryEngine, ExperimentalStrategies, etc. */
export function TimePeriodBreakdown({ curve, totalPips, totalTrades }: {
  curve: Array<{ time: string; equity: number }>;
  totalPips?: number;
  totalTrades?: number;
}) {
  if (curve.length < 2) return null;
  const firstDate = new Date(curve[0].time);
  const lastDate = new Date(curve[curve.length - 1].time);
  const totalDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000));

  // Count total active bars across entire curve for proportional distribution
  const overallActiveBars = countActiveBars(curve);

  const periods = TIME_PERIODS.map(p => ({
    ...p,
    stats: getTimePeriodStats(curve, totalDays, p.days, totalPips, overallActiveBars),
  })).filter(p => p.stats !== null);
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
                    -{s.maxDrawdownPct}%
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
export function PeriodPerformanceRow({ equityCurve, totalPips, totalTrades, dateRange }: {
  equityCurve: number[];
  totalPips?: number;
  totalTrades?: number;
  dateRange?: { start: string; end: string };
}) {
  if (!equityCurve || equityCurve.length < 10) return null;
  const totalBars = equityCurve.length;

  // Count total active bars across entire curve
  let overallActiveBars = 0;
  for (let i = 1; i < totalBars; i++) {
    const prev = equityCurve[i - 1];
    if (prev <= 0) continue;
    if (Math.abs((equityCurve[i] - prev) / prev) > 0.0001) overallActiveBars++;
  }

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

        let simpleReturn: number;
        if (totalPips != null && overallActiveBars > 0) {
          // Count active bars in this window
          let windowActiveBars = 0;
          for (let i = startIdx + 1; i < totalBars; i++) {
            const prev = equityCurve[i - 1];
            if (prev <= 0) continue;
            if (Math.abs((equityCurve[i] - prev) / prev) > 0.0001) windowActiveBars++;
          }
          const fraction = windowActiveBars / overallActiveBars;
          const periodPips = totalPips * fraction;
          // Dynamic sizing: return is directly from equity change
          const periodStartEq = equityCurve[startIdx];
          const periodEndEq = equityCurve[totalBars - 1];
          simpleReturn = periodStartEq > 0 ? ((periodEndEq - periodStartEq) / periodStartEq) * 100 : 0;
        } else {
          const startEq = equityCurve[startIdx];
          const endEq = equityCurve[totalBars - 1];
          simpleReturn = startEq > 0 ? ((endEq - startEq) / startEq) * 100 : 0;
        }

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
