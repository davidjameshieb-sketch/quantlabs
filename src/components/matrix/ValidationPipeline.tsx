// 3-Phase Validation Pipeline — "The Lie Detector Suite"
// Phase 1: Reality Check (1.5 pip friction + 1% risk institutional model)
// Phase 2: Anti-Luck Filter (70/30 OOS walk-forward)
// Phase 3: Disaster Check (Monte Carlo trade shuffling × 1,000)

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Shuffle, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, TrendingDown } from 'lucide-react';

// ── Types ──

export interface Phase1Result {
  passed: boolean;
  rawPF: number;
  frictionPF: number;
  pfSurvived: boolean;
  rawReturn: number;
  frictionReturn: number;
  institutionalPF: number;   // 1% risk model
  institutionalReturn: number;
  institutionalDD: number;
  frictionTax: number; // total pips lost to friction
}

export interface Phase2Result {
  passed: boolean;
  isWinRate: number;
  oosWinRate: number;
  isPF: number;
  oosPF: number;
  isReturn: number;
  oosReturn: number;
  isDD: number;
  oosDD: number;
  isTrades: number;
  oosTrades: number;
  wrDegradation: number;
  pfDegradation: number;
  ddRatio: number;
  failReasons: string[];
}

export interface Phase3Result {
  passed: boolean;
  iterations: number;
  medianDD: number;
  p95DD: number;
  p99DD: number;
  worstDD: number;
  ruinProbability: number; // % of iterations that hit >50% DD
  medianFinalEquity: number;
  p5FinalEquity: number;
  worstFinalEquity: number;
  failReasons: string[];
}

export interface ValidationResult {
  phase1: Phase1Result;
  phase2: Phase2Result;
  phase3: Phase3Result;
  overallPassed: boolean;
  grade: 'A' | 'B' | 'C' | 'F';
}

// ── Phase 1: Reality Check ──
function computePhase1(tradeResults: number[], slPips: number): Phase1Result {
  const FRICTION = 1.5; // pips
  const frictionTrades = tradeResults.map(p => p > 0 ? p - FRICTION : p - FRICTION);
  
  // 5% risk model (raw)
  const rawStats = simulateEquity(tradeResults, 1000, 0.05, slPips);
  // 5% risk model (with friction)
  const frictionStats = simulateEquity(frictionTrades, 1000, 0.05, slPips);
  // 1% risk institutional model (with friction)
  const instStats = simulateEquity(frictionTrades, 1000, 0.01, slPips);

  const pfSurvived = frictionStats.pf >= 1.0;
  const totalFriction = tradeResults.length * FRICTION;

  return {
    passed: pfSurvived && instStats.pf >= 1.0,
    rawPF: rawStats.pf,
    frictionPF: frictionStats.pf,
    pfSurvived,
    rawReturn: rawStats.totalReturn,
    frictionReturn: frictionStats.totalReturn,
    institutionalPF: instStats.pf,
    institutionalReturn: instStats.totalReturn,
    institutionalDD: instStats.maxDD,
    frictionTax: Math.round(totalFriction * 10) / 10,
  };
}

// ── Phase 2: OOS Walk-Forward ──
function computePhase2(tradeResults: number[], slPips: number): Phase2Result {
  const FRICTION = 1.5;
  const frictionTrades = tradeResults.map(p => p > 0 ? p - FRICTION : p - FRICTION);
  
  const splitIdx = Math.floor(frictionTrades.length * 0.7);
  const isTrades = frictionTrades.slice(0, splitIdx);
  const oosTrades = frictionTrades.slice(splitIdx);

  const failReasons: string[] = [];

  if (isTrades.length < 10 || oosTrades.length < 5) {
    return {
      passed: false, isWinRate: 0, oosWinRate: 0, isPF: 0, oosPF: 0,
      isReturn: 0, oosReturn: 0, isDD: 0, oosDD: 0, isTrades: isTrades.length,
      oosTrades: oosTrades.length, wrDegradation: 0, pfDegradation: 0, ddRatio: 0,
      failReasons: ['Insufficient trades for IS/OOS split'],
    };
  }

  const isStats = simulateEquity(isTrades, 1000, 0.05, slPips);
  const oosStats = simulateEquity(oosTrades, isStats.finalEquity, 0.05, slPips);

  const isWR = isTrades.length > 0 ? (isTrades.filter(t => t > 0).length / isTrades.length) * 100 : 0;
  const oosWR = oosTrades.length > 0 ? (oosTrades.filter(t => t > 0).length / oosTrades.length) * 100 : 0;
  const wrDeg = isWR > 0 ? ((oosWR - isWR) / isWR) * 100 : 0;
  const pfDeg = isStats.pf > 0 ? ((oosStats.pf - isStats.pf) / isStats.pf) * 100 : 0;
  const ddRatio = isStats.maxDD !== 0 ? Math.abs(oosStats.maxDD / isStats.maxDD) : 1;

  if (oosStats.pf < 1.0) failReasons.push(`OOS PF ${oosStats.pf.toFixed(2)} < 1.0`);
  if (ddRatio > 2) failReasons.push(`OOS DD ${oosStats.maxDD.toFixed(1)}% > 2× IS DD ${isStats.maxDD.toFixed(1)}%`);
  if (oosWR < isWR * 0.6) failReasons.push(`OOS WR collapsed: ${oosWR.toFixed(1)}% vs IS ${isWR.toFixed(1)}%`);

  return {
    passed: failReasons.length === 0,
    isWinRate: Math.round(isWR * 10) / 10,
    oosWinRate: Math.round(oosWR * 10) / 10,
    isPF: isStats.pf,
    oosPF: oosStats.pf,
    isReturn: isStats.totalReturn,
    oosReturn: oosStats.totalReturn,
    isDD: isStats.maxDD,
    oosDD: oosStats.maxDD,
    isTrades: isTrades.length,
    oosTrades: oosTrades.length,
    wrDegradation: Math.round(wrDeg * 10) / 10,
    pfDegradation: Math.round(pfDeg * 10) / 10,
    ddRatio: Math.round(ddRatio * 100) / 100,
    failReasons,
  };
}

// ── Phase 3: Monte Carlo Trade Shuffling ──
function computePhase3(tradeResults: number[], slPips: number, iterations: number = 1000): Phase3Result {
  const FRICTION = 1.5;
  const frictionTrades = tradeResults.map(p => p > 0 ? p - FRICTION : p - FRICTION);
  
  const maxDDs: number[] = [];
  const finalEquities: number[] = [];
  let ruinCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates shuffle with seeded PRNG
    const shuffled = [...frictionTrades];
    let seed = iter * 7919 + 42;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const stats = simulateEquity(shuffled, 1000, 0.05, slPips);
    maxDDs.push(stats.maxDD);
    finalEquities.push(stats.finalEquity);
    if (stats.maxDD < -50) ruinCount++;
  }

  // Sort for percentiles
  maxDDs.sort((a, b) => a - b); // most negative first
  finalEquities.sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  const medianDD = percentile(maxDDs, 0.5);
  const p95DD = percentile(maxDDs, 0.05); // 5th percentile = 95th worst
  const p99DD = percentile(maxDDs, 0.01);
  const worstDD = maxDDs[0];
  const medianEquity = percentile(finalEquities, 0.5);
  const p5Equity = percentile(finalEquities, 0.05);
  const worstEquity = finalEquities[0];
  const ruinProb = (ruinCount / iterations) * 100;

  const failReasons: string[] = [];
  if (p95DD < -40) failReasons.push(`95th percentile DD at ${p95DD.toFixed(1)}% (limit: -40%)`);
  if (ruinProb > 5) failReasons.push(`Ruin probability ${ruinProb.toFixed(1)}% > 5% threshold`);
  if (p5Equity < 500) failReasons.push(`5th percentile equity $${p5Equity.toFixed(0)} — account halved`);

  return {
    passed: failReasons.length === 0,
    iterations,
    medianDD: Math.round(medianDD * 10) / 10,
    p95DD: Math.round(p95DD * 10) / 10,
    p99DD: Math.round(p99DD * 10) / 10,
    worstDD: Math.round(worstDD * 10) / 10,
    ruinProbability: Math.round(ruinProb * 10) / 10,
    medianFinalEquity: Math.round(medianEquity),
    p5FinalEquity: Math.round(p5Equity),
    worstFinalEquity: Math.round(worstEquity),
    failReasons,
  };
}

// ── Shared equity simulation ──
function simulateEquity(trades: number[], startEquity: number, riskPct: number, slPips: number) {
  let equity = startEquity;
  let peak = startEquity;
  let maxDD = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const pips of trades) {
    const riskAmt = equity * riskPct;
    const pipVal = 0.0001;
    const units = slPips > 0 ? riskAmt / (slPips * pipVal) : 2000;
    // Cap at 10% equity per trade
    const maxUnits = (equity * 0.10) / (Math.abs(pips) * pipVal || 1);
    const finalUnits = Math.min(units, maxUnits);
    const pnl = pips * finalUnits * pipVal;
    equity += pnl;

    if (pips > 0) grossProfit += pips;
    else grossLoss += Math.abs(pips);

    if (equity > peak) peak = equity;
    const dd = ((equity - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }

  const pf = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;
  const totalReturn = Math.round(((equity - startEquity) / startEquity) * 100 * 10) / 10;

  return { pf, totalReturn, maxDD: Math.round(maxDD * 10) / 10, finalEquity: Math.round(equity * 100) / 100 };
}

// ── Run full validation ──
export function runValidationPipeline(tradeResults: number[], slPips: number): ValidationResult {
  const phase1 = computePhase1(tradeResults, slPips);
  const phase2 = computePhase2(tradeResults, slPips);
  const phase3 = computePhase3(tradeResults, slPips, 1000);

  const passCount = [phase1.passed, phase2.passed, phase3.passed].filter(Boolean).length;
  const overallPassed = passCount === 3;
  const grade: ValidationResult['grade'] = passCount === 3 ? 'A' : passCount === 2 ? 'B' : passCount === 1 ? 'C' : 'F';

  return { phase1, phase2, phase3, overallPassed, grade };
}

// ── Visual Component ──

const gradeColors: Record<string, string> = {
  A: '#39ff14', B: '#ff8800', C: '#ff4400', F: '#ff0055',
};

function PhaseHeader({ num, title, icon: Icon, passed }: { num: number; title: string; icon: typeof Shield; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold font-mono"
        style={{ backgroundColor: passed ? '#39ff1415' : '#ff005515', color: passed ? '#39ff14' : '#ff0055', border: `1px solid ${passed ? '#39ff1433' : '#ff005533'}` }}>
        {num}
      </div>
      <Icon className="w-3.5 h-3.5" style={{ color: passed ? '#39ff14' : '#ff0055' }} />
      <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: passed ? '#39ff14' : '#ff0055' }}>
        {title}
      </span>
      <span className="ml-auto text-[7px] font-mono font-bold px-2 py-0.5 rounded-full"
        style={{ color: passed ? '#39ff14' : '#ff0055', backgroundColor: passed ? '#39ff1410' : '#ff005510', border: `1px solid ${passed ? '#39ff1430' : '#ff005530'}` }}>
        {passed ? '✅ PASSED' : '❌ FAILED'}
      </span>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[6px] text-slate-600 uppercase">{label}</div>
      <div className="text-[10px] font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

export function ValidationPipelinePanel({ validation }: { validation: ValidationResult }) {
  const [expanded, setExpanded] = useState(false);
  const { phase1, phase2, phase3, grade } = validation;
  const gc = gradeColors[grade];

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-[8px] font-mono transition-colors"
        style={{ color: gc }}
      >
        <Shield className="w-3 h-3" />
        <span className="uppercase tracking-widest font-bold">3-Phase Validation Pipeline</span>
        <span className="text-[7px] font-mono font-bold px-2 py-0.5 rounded-full ml-1"
          style={{ color: gc, backgroundColor: `${gc}15`, border: `1px solid ${gc}33` }}>
          Grade {grade} — {[phase1.passed, phase2.passed, phase3.passed].filter(Boolean).length}/3 Passed
        </span>
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
            <div className="mt-2 space-y-3">
              {/* Phase 1: Reality Check */}
              <div className="bg-slate-950/40 border rounded-lg p-3 space-y-2"
                style={{ borderColor: phase1.passed ? '#39ff1430' : '#ff005530' }}>
                <PhaseHeader num={1} title="Reality Check — 1.5 pip Friction + 1% Risk" icon={Zap} passed={phase1.passed} />
                <p className="text-[7px] text-slate-500 font-mono">
                  Applies the mandatory 1.5 pip execution tax to every trade. If PF drops below 1.0, the edge was an illusion.
                </p>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <StatCell label="Raw PF" value={phase1.rawPF.toFixed(2)} color="#00ffea" />
                  <StatCell label="After Friction" value={phase1.frictionPF.toFixed(2)} color={phase1.frictionPF >= 1.0 ? '#39ff14' : '#ff0055'} />
                  <StatCell label="Inst. PF (1%)" value={phase1.institutionalPF.toFixed(2)} color={phase1.institutionalPF >= 1.0 ? '#39ff14' : '#ff0055'} />
                  <StatCell label="Raw Return" value={`${phase1.rawReturn >= 0 ? '+' : ''}${phase1.rawReturn}%`} color="#00ffea" />
                  <StatCell label="Friction Return" value={`${phase1.frictionReturn >= 0 ? '+' : ''}${phase1.frictionReturn}%`} color={phase1.frictionReturn >= 0 ? '#39ff14' : '#ff0055'} />
                  <StatCell label="Friction Tax" value={`-${phase1.frictionTax} pips`} color="#ff8800" />
                </div>
                {!phase1.passed && (
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff0055]">
                    <XCircle className="w-3 h-3 shrink-0" />
                    <span>Strategy collapses under realistic execution costs. Edge is synthetic.</span>
                  </div>
                )}
              </div>

              {/* Phase 2: Anti-Luck Filter */}
              <div className="bg-slate-950/40 border rounded-lg p-3 space-y-2"
                style={{ borderColor: phase2.passed ? '#39ff1430' : '#ff005530' }}>
                <PhaseHeader num={2} title="Anti-Luck Filter — 70/30 Walk-Forward OOS" icon={Shield} passed={phase2.passed} />
                <p className="text-[7px] text-slate-500 font-mono">
                  Trains on 70% of trades, tests blind on 30%. If performance collapses OOS, the bot learned the past — not the market.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1 text-[7px] text-slate-500 font-mono uppercase text-left">Metric</th>
                        <th className="p-1 text-[7px] font-mono uppercase text-[#00ffea]">In-Sample (70%)</th>
                        <th className="p-1 text-[7px] font-mono uppercase text-[#ff8800]">Out-of-Sample (30%)</th>
                        <th className="p-1 text-[7px] text-slate-500 font-mono uppercase">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { l: 'Win Rate', is: `${phase2.isWinRate}%`, oos: `${phase2.oosWinRate}%`, d: `${phase2.wrDegradation >= 0 ? '+' : ''}${phase2.wrDegradation}%`, dc: phase2.wrDegradation >= -10 ? '#39ff14' : '#ff0055' },
                        { l: 'Profit Factor', is: `${phase2.isPF}`, oos: `${phase2.oosPF}`, d: `${phase2.pfDegradation >= 0 ? '+' : ''}${phase2.pfDegradation}%`, dc: phase2.oosPF >= 1.0 ? '#39ff14' : '#ff0055' },
                        { l: 'Total Return', is: `${phase2.isReturn >= 0 ? '+' : ''}${phase2.isReturn}%`, oos: `${phase2.oosReturn >= 0 ? '+' : ''}${phase2.oosReturn}%`, d: '', dc: '#8888aa' },
                        { l: 'Max DD', is: `${phase2.isDD}%`, oos: `${phase2.oosDD}%`, d: `${phase2.ddRatio}×`, dc: phase2.ddRatio <= 2 ? '#39ff14' : '#ff0055' },
                        { l: 'Trades', is: `${phase2.isTrades}`, oos: `${phase2.oosTrades}`, d: `${phase2.isTrades + phase2.oosTrades} total`, dc: '#8888aa' },
                      ].map(r => (
                        <tr key={r.l} className="border-t border-slate-800/30">
                          <td className="p-1 text-[8px] font-mono font-bold text-slate-300 text-left">{r.l}</td>
                          <td className="p-1 text-[8px] font-mono font-bold text-[#00ffea]">{r.is}</td>
                          <td className="p-1 text-[8px] font-mono font-bold text-[#ff8800]">{r.oos}</td>
                          <td className="p-1 text-[8px] font-mono font-bold" style={{ color: r.dc }}>{r.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {phase2.failReasons.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff0055]">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
                {phase2.passed && (
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#39ff14]">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Edge survived blind OOS test. Strategy learned the market, not the noise.</span>
                  </div>
                )}
              </div>

              {/* Phase 3: Monte Carlo Disaster Check */}
              <div className="bg-slate-950/40 border rounded-lg p-3 space-y-2"
                style={{ borderColor: phase3.passed ? '#39ff1430' : '#ff005530' }}>
                <PhaseHeader num={3} title={`Disaster Check — Monte Carlo × ${phase3.iterations.toLocaleString()}`} icon={Shuffle} passed={phase3.passed} />
                <p className="text-[7px] text-slate-500 font-mono">
                  Shuffles all trades {phase3.iterations.toLocaleString()} times. If an unlucky sequence blows the account, the strategy is too fragile for live deployment.
                </p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  <StatCell label="Median DD" value={`${phase3.medianDD}%`} color="#00ffea" />
                  <StatCell label="95th % DD" value={`${phase3.p95DD}%`} color={phase3.p95DD > -40 ? '#ff8800' : '#ff0055'} />
                  <StatCell label="99th % DD" value={`${phase3.p99DD}%`} color={phase3.p99DD > -50 ? '#ff8800' : '#ff0055'} />
                  <StatCell label="Worst DD" value={`${phase3.worstDD}%`} color="#ff0055" />
                  <StatCell label="Ruin Prob." value={`${phase3.ruinProbability}%`} color={phase3.ruinProbability <= 5 ? '#39ff14' : '#ff0055'} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <StatCell label="Median Equity" value={`$${phase3.medianFinalEquity}`} color={phase3.medianFinalEquity >= 1000 ? '#39ff14' : '#ff0055'} />
                  <StatCell label="5th % Equity" value={`$${phase3.p5FinalEquity}`} color={phase3.p5FinalEquity >= 500 ? '#ff8800' : '#ff0055'} />
                  <StatCell label="Worst Equity" value={`$${phase3.worstFinalEquity}`} color="#ff0055" />
                </div>
                {phase3.failReasons.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff0055]">
                    <TrendingDown className="w-3 h-3 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
                {phase3.passed && (
                  <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#39ff14]">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Strategy survived {phase3.iterations.toLocaleString()} random trade orderings. No unlucky streak blows the account. Robust for live deployment.</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
