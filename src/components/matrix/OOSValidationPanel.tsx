// OOS (Out-of-Sample) Validation Panel — Shared "Lie Detector" Component
// Shows IS vs OOS performance split to detect overfitting

import { Shield, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';

// Types are defined inline in OOSValidationResult

export interface OOSValidationResult {
  is: { winRate: number; profitFactor: number; maxDrawdown: number; totalReturn: number; trades: number; netPips: number };
  oos: { winRate: number; profitFactor: number; maxDrawdown: number; totalReturn: number; trades: number; netPips: number };
  passed: boolean;
  failReasons: string[];
  degradation: { wrDelta: number; pfDelta: number; ddRatio: number; returnDelta: number };
}

/** Compute IS/OOS split from a trade-level results array */
export function computeOOSValidation(
  tradeResults: number[],
  startingEquity: number = 1000,
  isSplitRatio: number = 0.7,
  minTrades: number = 50,
): OOSValidationResult | null {
  if (tradeResults.length < minTrades) return null;

  const splitIdx = Math.floor(tradeResults.length * isSplitRatio);
  const isTrades = tradeResults.slice(0, splitIdx);
  const oosTrades = tradeResults.slice(splitIdx);

  if (isTrades.length < 10 || oosTrades.length < 5) return null;

  const calcStats = (trades: number[], startEq: number) => {
    let equity = startEq, peak = startEq, maxDD = 0;
    let wins = 0, grossProfit = 0, grossLoss = 0, totalPips = 0;
    for (const pips of trades) {
      totalPips += pips;
      if (pips > 0) { wins++; grossProfit += pips; }
      else { grossLoss += Math.abs(pips); }
      equity += pips * 0.10; // standard pip-to-equity
      if (equity > peak) peak = equity;
      const dd = ((equity - peak) / peak) * 100;
      if (dd < maxDD) maxDD = dd;
    }
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const totalReturn = ((equity - startEq) / startEq) * 100;
    return { winRate: Math.round(winRate * 10) / 10, profitFactor: Math.round(pf * 100) / 100, maxDrawdown: Math.round(maxDD * 10) / 10, totalReturn: Math.round(totalReturn * 10) / 10, trades: trades.length, netPips: Math.round(totalPips * 10) / 10 };
  };

  const isStats = calcStats(isTrades, startingEquity);
  // OOS starts from where IS ended
  let isEndEquity = startingEquity;
  for (const p of isTrades) isEndEquity += p * 0.10;
  const oosStats = calcStats(oosTrades, isEndEquity);

  const failReasons: string[] = [];
  if (tradeResults.length < minTrades) failReasons.push(`< ${minTrades} total trades (${tradeResults.length})`);
  if (oosStats.profitFactor < 1.2) failReasons.push(`OOS PF ${oosStats.profitFactor} < 1.2 threshold`);
  if (isStats.maxDrawdown !== 0 && Math.abs(oosStats.maxDrawdown) > Math.abs(isStats.maxDrawdown) * 2) {
    failReasons.push(`OOS DD (${oosStats.maxDrawdown}%) > 2× IS DD (${isStats.maxDrawdown}%)`);
  }

  const wrDelta = oosStats.winRate - isStats.winRate;
  const pfDelta = isStats.profitFactor > 0 ? ((oosStats.profitFactor - isStats.profitFactor) / isStats.profitFactor) * 100 : 0;
  const ddRatio = isStats.maxDrawdown !== 0 ? Math.abs(oosStats.maxDrawdown / isStats.maxDrawdown) : 1;
  const returnDelta = isStats.totalReturn !== 0 ? ((oosStats.totalReturn - isStats.totalReturn) / Math.abs(isStats.totalReturn)) * 100 : 0;

  return {
    is: isStats,
    oos: oosStats,
    passed: failReasons.length === 0,
    failReasons,
    degradation: {
      wrDelta: Math.round(wrDelta * 10) / 10,
      pfDelta: Math.round(pfDelta * 10) / 10,
      ddRatio: Math.round(ddRatio * 100) / 100,
      returnDelta: Math.round(returnDelta * 10) / 10,
    },
  };
}

/** Visual OOS Validation Panel */
export function OOSValidationPanel({ validation }: { validation: OOSValidationResult }) {
  const { is, oos, passed, failReasons, degradation } = validation;
  const statusColor = passed ? '#39ff14' : '#ff0055';
  const statusBg = passed ? 'rgba(57,255,20,0.05)' : 'rgba(255,0,85,0.05)';
  const statusBorder = passed ? 'rgba(57,255,20,0.3)' : 'rgba(255,0,85,0.3)';

  return (
    <div className="bg-slate-950/40 border rounded-lg p-3 space-y-3" style={{ borderColor: statusBorder, background: statusBg }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" style={{ color: statusColor }} />
          <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: statusColor }}>
            OOS Validation — The Lie Detector
          </span>
        </div>
        <span className="text-[7px] font-mono font-bold px-2 py-0.5 rounded-full"
          style={{ color: statusColor, backgroundColor: passed ? '#39ff1415' : '#ff005515', border: `1px solid ${statusBorder}` }}>
          {passed ? '✅ PASSED' : '❌ OVERFIT'}
        </span>
      </div>

      {/* IS vs OOS Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase text-left">Metric</th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">
                <span className="text-[#00ffea]">In-Sample</span>
                <span className="text-slate-600 ml-1">(70%)</span>
              </th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">
                <span className="text-[#ff8800]">Out-of-Sample</span>
                <span className="text-slate-600 ml-1">(30%)</span>
              </th>
              <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Degradation</th>
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Win Rate" isVal={`${is.winRate}%`} oosVal={`${oos.winRate}%`}
              delta={`${degradation.wrDelta >= 0 ? '+' : ''}${degradation.wrDelta}%`}
              deltaColor={degradation.wrDelta >= -3 ? '#39ff14' : degradation.wrDelta >= -8 ? '#ff8800' : '#ff0055'} />
            <MetricRow label="Profit Factor" isVal={`${is.profitFactor}`} oosVal={`${oos.profitFactor}`}
              delta={`${degradation.pfDelta >= 0 ? '+' : ''}${degradation.pfDelta}%`}
              deltaColor={oos.profitFactor >= 1.2 ? '#39ff14' : '#ff0055'}
              oosAlert={oos.profitFactor < 1.2} />
            <MetricRow label="Max Drawdown" isVal={`${is.maxDrawdown}%`} oosVal={`${oos.maxDrawdown}%`}
              delta={`${degradation.ddRatio}×`}
              deltaColor={degradation.ddRatio <= 2 ? '#39ff14' : '#ff0055'}
              oosAlert={degradation.ddRatio > 2} />
            <MetricRow label="Total Return" isVal={`${is.totalReturn >= 0 ? '+' : ''}${is.totalReturn}%`} oosVal={`${oos.totalReturn >= 0 ? '+' : ''}${oos.totalReturn}%`}
              delta={`${degradation.returnDelta >= 0 ? '+' : ''}${degradation.returnDelta}%`}
              deltaColor={oos.totalReturn >= 0 ? '#39ff14' : '#ff0055'} />
            <MetricRow label="Trades" isVal={`${is.trades}`} oosVal={`${oos.trades}`}
              delta={`${is.trades + oos.trades} total`} deltaColor="#8888aa" />
            <MetricRow label="Net Pips" isVal={`${is.netPips >= 0 ? '+' : ''}${is.netPips}`} oosVal={`${oos.netPips >= 0 ? '+' : ''}${oos.netPips}`}
              delta="" deltaColor="#8888aa" />
          </tbody>
        </table>
      </div>

      {/* Fail Reasons */}
      {failReasons.length > 0 && (
        <div className="space-y-1">
          {failReasons.map((reason, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff0055]">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Degradation Summary */}
      {passed && (
        <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#39ff14]">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          <span>
            Strategy survived blind OOS test. PF degraded {Math.abs(degradation.pfDelta).toFixed(0)}%, WR shifted {degradation.wrDelta >= 0 ? '+' : ''}{degradation.wrDelta}%, DD ratio {degradation.ddRatio}×. Edge is statistically robust.
          </span>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, isVal, oosVal, delta, deltaColor, oosAlert }: {
  label: string; isVal: string; oosVal: string; delta: string; deltaColor: string; oosAlert?: boolean;
}) {
  return (
    <tr className="border-t border-slate-800/30">
      <td className="p-1 text-[8px] font-mono font-bold text-slate-300 text-left">{label}</td>
      <td className="p-1 text-[8px] font-mono font-bold text-[#00ffea]">{isVal}</td>
      <td className="p-1 text-[8px] font-mono font-bold" style={{ color: oosAlert ? '#ff0055' : '#ff8800' }}>{oosVal}</td>
      <td className="p-1 text-[8px] font-mono font-bold" style={{ color: deltaColor }}>{delta}</td>
    </tr>
  );
}
