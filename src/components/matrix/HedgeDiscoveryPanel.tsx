// 4-Pillar Deep Search: Momentum · Counter-Leg · Regime Map · Portfolio Blend
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, Crown, Loader2, BarChart3, RefreshCw,
  TrendingUp, TrendingDown, Layers, Shield, Zap,
  AlertTriangle, ArrowRight, Target, Skull,
} from 'lucide-react';
import { toast } from 'sonner';

type PillarTab = 'momentum' | 'counter' | 'regime' | 'blend';

const TABS: { id: PillarTab; label: string; icon: any; color: string; desc: string }[] = [
  { id: 'momentum', label: 'MOMENTUM', icon: TrendingUp, color: '#39ff14', desc: 'Optimize rank combos, sessions & SL/TP' },
  { id: 'counter', label: 'COUNTER-LEG', icon: TrendingDown, color: '#ff8800', desc: 'Mean-reversion: fade when ranks converge' },
  { id: 'regime', label: 'REGIME MAP', icon: Layers, color: '#00ffea', desc: 'Session & volatility performance breakdown' },
  { id: 'blend', label: 'PORTFOLIO BLEND', icon: Shield, color: '#a855f7', desc: 'Merge momentum + counter into hedged portfolio' },
];

// ── Mini Equity Curve ──
function MiniCurve({ data, height = 60, color = '#39ff14' }: { data: number[]; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const w = 400, h = height, pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`hd-grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill={`url(#hd-grad-${color.replace('#','')})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ── Parallel worker helper ──
async function runParallelDiscovery(params: {
  candles: number;
  environment: string;
  predatorRanks: number[];
  topN: number;
  invertDirection?: boolean;
}): Promise<any> {
  const ranks = params.predatorRanks;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-live-backtest`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  const results = await Promise.allSettled(
    ranks.map(rank =>
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candles: params.candles,
          environment: params.environment,
          predatorRanks: [rank],
          topN: params.topN,
          invertDirection: params.invertDirection || false,
        }),
      }).then(r => r.json())
    )
  );

  let totalCombos = 0, profitableCombos = 0, rejectedCombos = 0;
  let allTopResults: any[] = [];
  let pairsLoaded = 0, totalSnapshots = 0, candlesPerPair = 0;
  let dateRange: any = null, version = '';
  let errors: string[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.success) {
      const d = r.value;
      totalCombos += d.totalCombos || 0;
      profitableCombos += d.profitableCombos || 0;
      rejectedCombos += d.rejectedCombos || 0;
      pairsLoaded = Math.max(pairsLoaded, d.pairsLoaded || 0);
      totalSnapshots = Math.max(totalSnapshots, d.totalSnapshots || 0);
      candlesPerPair = Math.max(candlesPerPair, d.candlesPerPair || 0);
      if (d.dateRange) dateRange = d.dateRange;
      if (d.version) version = d.version;
      if (d.topResults) allTopResults.push(...d.topResults);
    } else {
      const errMsg = r.status === 'rejected' ? r.reason?.message : r.value?.error;
      errors.push(`R${ranks[i]}: ${errMsg || 'Unknown error'}`);
    }
  });

  allTopResults.sort((a, b) => (b.institutionalPF || 0) - (a.institutionalPF || 0));

  return {
    success: allTopResults.length > 0,
    totalCombos, profitableCombos, rejectedCombos,
    pairsLoaded, totalSnapshots, candlesPerPair,
    dateRange, version, errors,
    topResults: allTopResults.slice(0, 15),
  };
}

// ── Results Table ──
function ResultsTable({ results, labelPrefix = '' }: { results: any; labelPrefix?: string }) {
  if (!results) return null;
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Combos Tested', value: results.totalCombos?.toLocaleString(), color: '#ffffff' },
          { label: 'Profitable', value: results.profitableCombos?.toLocaleString(), color: '#39ff14' },
          { label: 'Rejected (20% DD)', value: results.rejectedCombos?.toLocaleString(), color: '#ff0055' },
          { label: 'Pairs Loaded', value: results.pairsLoaded, color: '#00ffea' },
          { label: 'Rank Snapshots', value: results.totalSnapshots?.toLocaleString(), color: '#ffffff' },
        ].map((m, i) => (
          <div key={i} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
            <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
            <div className="text-sm font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="space-y-2">
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
          {labelPrefix}Top Profiles — Ranked by Institutional PF
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] font-mono">
            <thead>
              <tr className="border-b border-slate-800">
                {['#', 'Rank', 'Session', 'SL/TP', 'Trades', 'WR%', 'PF', 'Pips', 'Inst. P/L', 'Agg. P/L', 'Inst. PF', 'Max DD'].map(h => (
                  <th key={h} className="text-left text-[7px] text-slate-500 uppercase tracking-wider px-2 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.topResults?.slice(0, 10).map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                  <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <span className="text-[#00ffea] font-bold">#{r.predator}</span>
                    <span className="text-slate-600"> vs </span>
                    <span className="text-[#ff0055] font-bold">#{r.prey}</span>
                  </td>
                  <td className="px-2 py-2 text-slate-400">{r.session}</td>
                  <td className="px-2 py-2 text-slate-400">{r.slPips}p / {r.tpRatio === 'flip' ? 'Flip' : `${r.tpRatio}R`}</td>
                  <td className="px-2 py-2 text-white">{r.trades}</td>
                  <td className="px-2 py-2" style={{ color: r.winRate >= 50 ? '#39ff14' : '#ff8800' }}>{r.winRate}%</td>
                  <td className="px-2 py-2" style={{ color: r.profitFactor >= 1.5 ? '#39ff14' : r.profitFactor >= 1 ? '#ff8800' : '#ff0055' }}>{r.profitFactor}</td>
                  <td className="px-2 py-2" style={{ color: r.totalPips >= 0 ? '#39ff14' : '#ff0055' }}>
                    {r.totalPips >= 0 ? '+' : ''}{r.totalPips}
                  </td>
                  <td className="px-2 py-2" style={{ color: r.institutionalProfit >= 0 ? '#39ff14' : '#ff0055' }}>
                    ${r.institutionalProfit?.toFixed(0)}
                  </td>
                  <td className="px-2 py-2" style={{ color: r.aggressiveProfit >= 0 ? '#39ff14' : '#ff0055' }}>
                    ${r.aggressiveProfit?.toFixed(0)}
                  </td>
                  <td className="px-2 py-2 font-bold" style={{ color: r.institutionalPF >= 1.5 ? '#39ff14' : r.institutionalPF >= 1 ? '#ff8800' : '#ff0055' }}>
                    {r.institutionalPF}
                  </td>
                  <td className="px-2 py-2" style={{ color: r.maxDrawdown > -20 ? '#39ff14' : '#ff0055' }}>
                    {r.maxDrawdown}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 3 equity curves */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.topResults?.slice(0, 3).map((r: any, i: number) => (
          <div key={i} className="bg-slate-950/60 border border-slate-800/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold font-mono">
                <span className="text-[#00ffea]">#{r.predator}</span>
                <span className="text-slate-600"> vs </span>
                <span className="text-[#ff0055]">#{r.prey}</span>
                <span className="text-slate-500"> · {r.session}</span>
              </span>
              <span className="text-[8px] font-mono font-bold" style={{ color: r.institutionalPF >= 1.5 ? '#39ff14' : '#ff8800' }}>
                PF {r.institutionalPF}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              <div className="text-center">
                <div className="text-[6px] text-slate-600 uppercase">Trades</div>
                <div className="text-[10px] font-bold font-mono text-white">{r.trades}</div>
              </div>
              <div className="text-center">
                <div className="text-[6px] text-slate-600 uppercase">WR</div>
                <div className="text-[10px] font-bold font-mono" style={{ color: r.winRate >= 50 ? '#39ff14' : '#ff8800' }}>{r.winRate}%</div>
              </div>
              <div className="text-center">
                <div className="text-[6px] text-slate-600 uppercase">Inst. Return</div>
                <div className="text-[10px] font-bold font-mono" style={{ color: r.institutionalProfit >= 0 ? '#39ff14' : '#ff0055' }}>
                  ${r.institutionalProfit?.toFixed(0)}
                </div>
              </div>
            </div>
            {r.equityCurve && r.equityCurve.length > 2 ? (
              <MiniCurve data={r.equityCurve.map((pt: any) => pt.equity)} height={60} color={r.institutionalProfit >= 0 ? '#39ff14' : '#ff0055'} />
            ) : (
              <div className="h-[60px] flex items-center justify-center text-[8px] text-slate-600 font-mono">No curve data</div>
            )}
          </div>
        ))}
      </div>

      {/* OOS Validation for Top 3 */}
      <div className="space-y-2">
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">OOS Validation — 70/30 Lie Detector</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {results.topResults?.slice(0, 3).map((r: any, i: number) => {
            const oos = r.oosValidation;
            return (
              <div key={i} className="bg-slate-950/60 border rounded-xl p-4 space-y-3"
                style={{ borderColor: oos?.passed ? '#39ff1440' : oos ? '#ff005540' : '#334155' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono">
                    <span className="text-[#00ffea]">#{r.predator}</span>
                    <span className="text-slate-600"> vs </span>
                    <span className="text-[#ff0055]">#{r.prey}</span>
                    <span className="text-slate-500"> · {r.session}</span>
                  </span>
                  {oos && (
                    <span className="text-[7px] font-mono font-bold px-2 py-0.5 rounded-full"
                      style={{
                        color: oos.passed ? '#39ff14' : '#ff0055',
                        background: oos.passed ? '#39ff1415' : '#ff005515',
                        border: `1px solid ${oos.passed ? '#39ff1440' : '#ff005540'}`,
                      }}>
                      {oos.passed ? '✅ OOS PASSED' : '❌ OVERFIT'}
                    </span>
                  )}
                </div>
                {oos ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr>
                          <th className="p-1 text-[7px] text-slate-500 font-mono text-left">Metric</th>
                          <th className="p-1 text-[7px] text-[#00ffea] font-mono">IS (70%)</th>
                          <th className="p-1 text-[7px] text-[#ff8800] font-mono">OOS (30%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Win Rate', is: `${oos.is?.winRate}%`, oos: `${oos.oos?.winRate}%`, alert: (oos.oos?.winRate || 0) < 40 },
                          { label: 'PF', is: oos.is?.profitFactor, oos: oos.oos?.profitFactor, alert: (oos.oos?.profitFactor || 0) < 1.2 },
                          { label: 'Max DD', is: `${oos.is?.maxDrawdown}%`, oos: `${oos.oos?.maxDrawdown}%`, alert: Math.abs(oos.oos?.maxDrawdown || 0) > Math.abs(oos.is?.maxDrawdown || 0) * 2 },
                          { label: 'Trades', is: oos.is?.trades, oos: oos.oos?.trades, alert: false },
                          { label: 'Net Pips', is: oos.is?.netPips, oos: oos.oos?.netPips, alert: (oos.oos?.netPips || 0) < 0 },
                        ].map((row, ri) => (
                          <tr key={ri} className="border-t border-slate-800/30">
                            <td className="p-1 text-[8px] font-mono font-bold text-slate-300 text-left">{row.label}</td>
                            <td className="p-1 text-[8px] font-mono font-bold text-[#00ffea]">{row.is}</td>
                            <td className="p-1 text-[8px] font-mono font-bold" style={{ color: row.alert ? '#ff0055' : '#ff8800' }}>{row.oos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {oos.failReasons?.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {oos.failReasons.map((reason: string, ri: number) => (
                          <div key={ri} className="text-[7px] font-mono text-[#ff0055] flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[8px] text-slate-600 font-mono text-center py-4">
                    OOS data not returned by engine
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-[7px] text-slate-600 font-mono text-center">
        {results.dateRange?.start?.slice(0, 10)} → {results.dateRange?.end?.slice(0, 10)} · v{results.version} · {results.pairsLoaded} pairs · {results.candlesPerPair?.toLocaleString()} candles/pair · OANDA Live
      </div>
    </div>
  );
}

// ── Regime Breakdown Table ──
function RegimeBreakdown({ momentumResults, counterResults }: { momentumResults: any; counterResults: any }) {
  // Group results by session to show where each approach works
  const sessions = ['LONDON', 'NY', 'ASIA', 'ALL'];
  const buildSessionMap = (results: any) => {
    const map: Record<string, { trades: number; winRate: number; pf: number; pips: number; count: number }> = {};
    sessions.forEach(s => map[s] = { trades: 0, winRate: 0, pf: 0, pips: 0, count: 0 });
    results?.topResults?.forEach((r: any) => {
      const sess = r.session?.toUpperCase() || 'ALL';
      const key = sessions.includes(sess) ? sess : 'ALL';
      map[key].trades += r.trades || 0;
      map[key].winRate += r.winRate || 0;
      map[key].pf += r.institutionalPF || 0;
      map[key].pips += r.totalPips || 0;
      map[key].count += 1;
    });
    // Average the rates
    Object.values(map).forEach(v => {
      if (v.count > 0) { v.winRate /= v.count; v.pf /= v.count; }
    });
    return map;
  };

  const momMap = buildSessionMap(momentumResults);
  const ctrMap = buildSessionMap(counterResults);

  const hasMomentum = momentumResults?.topResults?.length > 0;
  const hasCounter = counterResults?.topResults?.length > 0;

  return (
    <div className="space-y-5">
      {!hasMomentum && !hasCounter ? (
        <div className="py-12 text-center space-y-3">
          <Layers className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-[10px] text-slate-500 font-mono">Run <span className="text-[#39ff14]">Momentum</span> and/or <span className="text-[#ff8800]">Counter-Leg</span> discovery first</p>
          <p className="text-[8px] text-slate-600 font-mono">The Regime Map aggregates results from both pillars to show which sessions and conditions favor each approach.</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-950/60 border border-[#00ffea]/20 rounded-xl p-4">
            <div className="text-[9px] font-bold text-[#00ffea] uppercase tracking-widest mb-3">Session × Strategy Type Matrix</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-[7px] text-slate-500 uppercase px-2 py-2">Session</th>
                    <th className="text-center text-[7px] text-[#39ff14] uppercase px-2 py-2" colSpan={3}>MOMENTUM (Long Strong / Short Weak)</th>
                    <th className="text-center text-[7px] text-[#ff8800] uppercase px-2 py-2" colSpan={3}>COUNTER-LEG (Fade Convergence)</th>
                    <th className="text-center text-[7px] text-[#a855f7] uppercase px-2 py-2">VERDICT</th>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <th className="px-2 py-1"></th>
                    {['Trades', 'WR%', 'PF'].map(h => <th key={`m-${h}`} className="text-[6px] text-slate-600 px-2 py-1">{h}</th>)}
                    {['Trades', 'WR%', 'PF'].map(h => <th key={`c-${h}`} className="text-[6px] text-slate-600 px-2 py-1">{h}</th>)}
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(sess => {
                    const m = momMap[sess];
                    const c = ctrMap[sess];
                    const mScore = (m.pf || 0) * (m.count > 0 ? 1 : 0);
                    const cScore = (c.pf || 0) * (c.count > 0 ? 1 : 0);
                    const verdict = mScore > 1.5 && cScore > 1.5 ? 'BOTH ACTIVE'
                      : mScore > 1.5 ? 'MOMENTUM ONLY'
                      : cScore > 1.5 ? 'COUNTER ONLY'
                      : mScore > 1 || cScore > 1 ? 'MARGINAL'
                      : 'FLAT';
                    const vColor = verdict === 'BOTH ACTIVE' ? '#a855f7' : verdict.includes('MOMENTUM') ? '#39ff14' : verdict.includes('COUNTER') ? '#ff8800' : verdict === 'MARGINAL' ? '#ff8800' : '#ff0055';
                    return (
                      <tr key={sess} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                        <td className="px-2 py-2 font-bold text-white">{sess}</td>
                        <td className="px-2 py-2 text-slate-400">{m.trades || '—'}</td>
                        <td className="px-2 py-2" style={{ color: m.winRate >= 50 ? '#39ff14' : '#ff8800' }}>{m.count > 0 ? `${m.winRate.toFixed(1)}%` : '—'}</td>
                        <td className="px-2 py-2 font-bold" style={{ color: m.pf >= 1.5 ? '#39ff14' : m.pf >= 1 ? '#ff8800' : '#ff0055' }}>{m.count > 0 ? m.pf.toFixed(2) : '—'}</td>
                        <td className="px-2 py-2 text-slate-400">{c.trades || '—'}</td>
                        <td className="px-2 py-2" style={{ color: c.winRate >= 50 ? '#39ff14' : '#ff8800' }}>{c.count > 0 ? `${c.winRate.toFixed(1)}%` : '—'}</td>
                        <td className="px-2 py-2 font-bold" style={{ color: c.pf >= 1.5 ? '#39ff14' : c.pf >= 1 ? '#ff8800' : '#ff0055' }}>{c.count > 0 ? c.pf.toFixed(2) : '—'}</td>
                        <td className="px-2 py-2 text-center font-bold text-[8px]" style={{ color: vColor }}>{verdict}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Insight cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-[#39ff14]/20 rounded-xl p-4">
              <div className="text-[8px] font-bold text-[#39ff14] uppercase tracking-widest mb-2">Best Momentum Session</div>
              {(() => {
                const best = Object.entries(momMap).filter(([,v]) => v.count > 0).sort(([,a],[,b]) => b.pf - a.pf)[0];
                return best ? (
                  <div className="text-center space-y-1">
                    <div className="text-lg font-black font-mono text-[#39ff14]">{best[0]}</div>
                    <div className="text-[9px] text-slate-400">PF {best[1].pf.toFixed(2)} · WR {best[1].winRate.toFixed(1)}% · {best[1].trades} trades</div>
                  </div>
                ) : <div className="text-[9px] text-slate-600 text-center">Run Momentum first</div>;
              })()}
            </div>
            <div className="bg-slate-950/60 border border-[#ff8800]/20 rounded-xl p-4">
              <div className="text-[8px] font-bold text-[#ff8800] uppercase tracking-widest mb-2">Best Counter-Leg Session</div>
              {(() => {
                const best = Object.entries(ctrMap).filter(([,v]) => v.count > 0).sort(([,a],[,b]) => b.pf - a.pf)[0];
                return best ? (
                  <div className="text-center space-y-1">
                    <div className="text-lg font-black font-mono text-[#ff8800]">{best[0]}</div>
                    <div className="text-[9px] text-slate-400">PF {best[1].pf.toFixed(2)} · WR {best[1].winRate.toFixed(1)}% · {best[1].trades} trades</div>
                  </div>
                ) : <div className="text-[9px] text-slate-600 text-center">Run Counter-Leg first</div>;
              })()}
            </div>
            <div className="bg-slate-950/60 border border-[#a855f7]/20 rounded-xl p-4">
              <div className="text-[8px] font-bold text-[#a855f7] uppercase tracking-widest mb-2">Structural Hedge Quality</div>
              {hasMomentum && hasCounter ? (() => {
                const momAvgPF = Object.values(momMap).filter(v => v.count > 0).reduce((s, v) => s + v.pf, 0) / Math.max(1, Object.values(momMap).filter(v => v.count > 0).length);
                const ctrAvgPF = Object.values(ctrMap).filter(v => v.count > 0).reduce((s, v) => s + v.pf, 0) / Math.max(1, Object.values(ctrMap).filter(v => v.count > 0).length);
                const quality = momAvgPF > 1.3 && ctrAvgPF > 1.3 ? 'HIGH' : momAvgPF > 1 && ctrAvgPF > 1 ? 'MODERATE' : 'LOW';
                const qColor = quality === 'HIGH' ? '#39ff14' : quality === 'MODERATE' ? '#ff8800' : '#ff0055';
                return (
                  <div className="text-center space-y-1">
                    <div className="text-lg font-black font-mono" style={{ color: qColor }}>{quality}</div>
                    <div className="text-[9px] text-slate-400">Mom PF {momAvgPF.toFixed(2)} · Ctr PF {ctrAvgPF.toFixed(2)}</div>
                    <div className="text-[8px] text-slate-500">
                      {quality === 'HIGH' ? 'Both pillars profitable — true hedge achievable' : quality === 'MODERATE' ? 'Partial offset — conditional filtering recommended' : 'Weak counter-leg — momentum-only may be safer'}
                    </div>
                  </div>
                );
              })() : <div className="text-[9px] text-slate-600 text-center">Need both pillars</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Portfolio Blend ──
function PortfolioBlend({ momentumResults, counterResults }: { momentumResults: any; counterResults: any }) {
  const hasMomentum = momentumResults?.topResults?.length > 0;
  const hasCounter = counterResults?.topResults?.length > 0;

  if (!hasMomentum && !hasCounter) {
    return (
      <div className="py-12 text-center space-y-3">
        <Shield className="w-10 h-10 mx-auto text-slate-600" />
        <p className="text-[10px] text-slate-500 font-mono">Run <span className="text-[#39ff14]">Momentum</span> and <span className="text-[#ff8800]">Counter-Leg</span> discovery first</p>
        <p className="text-[8px] text-slate-600 font-mono">The Portfolio Blend merges the best strategies from both pillars into a structurally hedged ensemble.</p>
      </div>
    );
  }

  // Take top 3 from each pillar
  const momTop = (momentumResults?.topResults || []).slice(0, 3);
  const ctrTop = (counterResults?.topResults || []).slice(0, 3);

  // Compute blend metrics
  const allStrats = [
    ...momTop.map((s: any) => ({ ...s, type: 'MOMENTUM' as const })),
    ...ctrTop.map((s: any) => ({ ...s, type: 'COUNTER' as const })),
  ];

  const totalTrades = allStrats.reduce((s, r) => s + (r.trades || 0), 0);
  const avgWR = allStrats.length > 0 ? allStrats.reduce((s, r) => s + (r.winRate || 0), 0) / allStrats.length : 0;
  const avgPF = allStrats.length > 0 ? allStrats.reduce((s, r) => s + (r.institutionalPF || 0), 0) / allStrats.length : 0;
  const totalPips = allStrats.reduce((s, r) => s + (r.totalPips || 0), 0);
  const longCount = momTop.length;
  const shortCount = ctrTop.length;
  const dirBalance = Math.min(longCount, shortCount) / Math.max(1, Math.max(longCount, shortCount));

  return (
    <div className="space-y-5">
      {/* Blend overview */}
      <div className="bg-gradient-to-r from-[#a855f7]/10 to-[#39ff14]/10 border border-[#a855f7]/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[#a855f7]" />
          <span className="text-[10px] font-bold text-[#a855f7] uppercase tracking-widest">Ensemble Portfolio Blueprint</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Total Strategies', value: allStrats.length, color: '#ffffff' },
            { label: 'Momentum Legs', value: momTop.length, color: '#39ff14' },
            { label: 'Counter Legs', value: ctrTop.length, color: '#ff8800' },
            { label: 'Combined Trades', value: totalTrades, color: '#00ffea' },
            { label: 'Avg PF', value: avgPF.toFixed(2), color: avgPF >= 1.5 ? '#39ff14' : '#ff8800' },
            { label: 'Direction Balance', value: `${(dirBalance * 100).toFixed(0)}%`, color: dirBalance >= 0.5 ? '#39ff14' : '#ff0055' },
          ].map((m, i) => (
            <div key={i} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
              <div className="text-[6px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
              <div className="text-sm font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy roster */}
      <div className="space-y-2">
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Portfolio Members</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] font-mono">
            <thead>
              <tr className="border-b border-slate-800">
                {['#', 'Type', 'Rank', 'Session', 'Weight', 'Trades', 'WR%', 'Inst. PF', 'Pips', 'Role'].map(h => (
                  <th key={h} className="text-left text-[7px] text-slate-500 uppercase tracking-wider px-2 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allStrats.map((r: any, i: number) => {
                const weight = (1 / allStrats.length * 100).toFixed(0);
                const typeColor = r.type === 'MOMENTUM' ? '#39ff14' : '#ff8800';
                const role = r.type === 'MOMENTUM' ? 'Trend continuation' : 'Mean reversion offset';
                return (
                  <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                    <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-2 font-bold" style={{ color: typeColor }}>{r.type}</td>
                    <td className="px-2 py-2">
                      <span className="text-[#00ffea]">#{r.predator}</span>
                      <span className="text-slate-600"> vs </span>
                      <span className="text-[#ff0055]">#{r.prey}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-400">{r.session}</td>
                    <td className="px-2 py-2 text-white">{weight}%</td>
                    <td className="px-2 py-2 text-white">{r.trades}</td>
                    <td className="px-2 py-2" style={{ color: r.winRate >= 50 ? '#39ff14' : '#ff8800' }}>{r.winRate}%</td>
                    <td className="px-2 py-2 font-bold" style={{ color: r.institutionalPF >= 1.5 ? '#39ff14' : '#ff8800' }}>{r.institutionalPF}</td>
                    <td className="px-2 py-2" style={{ color: r.totalPips >= 0 ? '#39ff14' : '#ff0055' }}>
                      {r.totalPips >= 0 ? '+' : ''}{r.totalPips}
                    </td>
                    <td className="px-2 py-2 text-[8px] text-slate-500">{role}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hedge quality assessment */}
      <div className="bg-slate-950/60 border border-[#a855f7]/20 rounded-xl p-5 space-y-3">
        <div className="text-[9px] font-bold text-[#a855f7] uppercase tracking-widest">Hedge Quality Assessment</div>
        <div className="space-y-2">
          {[
            {
              label: 'Directional Balance',
              pass: longCount >= 2 && shortCount >= 2,
              detail: `${longCount} momentum (directional) + ${shortCount} counter (mean-reversion)`,
              need: 'Need ≥2 of each type for structural offset',
            },
            {
              label: 'Average Profit Factor',
              pass: avgPF >= 1.3,
              detail: `Blended PF: ${avgPF.toFixed(2)}`,
              need: 'Combined PF ≥ 1.3 for portfolio viability',
            },
            {
              label: 'Trade Volume',
              pass: totalTrades >= 50,
              detail: `${totalTrades} total trades across portfolio`,
              need: 'Need ≥50 combined trades for statistical significance',
            },
            {
              label: 'Session Diversification',
              pass: new Set(allStrats.map(s => s.session)).size >= 2,
              detail: `${new Set(allStrats.map(s => s.session)).size} unique sessions`,
              need: 'At least 2 different sessions for temporal diversification',
            },
          ].map((check, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: check.pass ? '#39ff1408' : '#ff005508' }}>
              {check.pass ? (
                <Target className="w-3.5 h-3.5 text-[#39ff14] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-[#ff0055] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-[9px] font-bold" style={{ color: check.pass ? '#39ff14' : '#ff0055' }}>{check.label}</div>
                <div className="text-[8px] text-slate-400">{check.detail}</div>
                {!check.pass && <div className="text-[7px] text-[#ff8800] mt-0.5">{check.need}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ══════════════════════════════════════════════════════════════════════

export default function HedgeDiscoveryPanel() {
  const [activeTab, setActiveTab] = useState<PillarTab>('momentum');
  const [momentumResults, setMomentumResults] = useState<any>(null);
  const [counterResults, setCounterResults] = useState<any>(null);
  const [runningMomentum, setRunningMomentum] = useState(false);
  const [runningCounter, setRunningCounter] = useState(false);

  const runMomentum = useCallback(async () => {
    setRunningMomentum(true);
    try {
      toast.info('Launching 3 parallel momentum workers (R1, R2, R3)...');
      const result = await runParallelDiscovery({
        candles: 15000,
        environment: 'live',
        predatorRanks: [1, 2, 3],
        topN: 10,
        invertDirection: false,
      });
      setMomentumResults(result);
      if (result.success) {
        const top = result.topResults[0];
        toast.success(`Momentum: ${result.totalCombos} combos, ${result.profitableCombos} profitable. Top: #${top?.predator}v#${top?.prey} PF=${top?.institutionalPF}`);
      } else {
        toast.error(`Momentum failed: ${result.errors?.join('; ')}`);
      }
      if (result.errors?.length > 0 && result.success) {
        toast.warning(`${result.errors.length} worker(s) failed: ${result.errors.join('; ')}`);
      }
    } catch (err) {
      toast.error(`Momentum error: ${(err as Error).message}`);
    } finally {
      setRunningMomentum(false);
    }
  }, []);

  const runCounter = useCallback(async () => {
    setRunningCounter(true);
    try {
      toast.info('Launching 3 parallel counter-leg workers (inverted direction)...');
      const result = await runParallelDiscovery({
        candles: 15000,
        environment: 'live',
        predatorRanks: [1, 2, 3],
        topN: 10,
        invertDirection: true,
      });
      setCounterResults(result);
      if (result.success) {
        const top = result.topResults[0];
        toast.success(`Counter-Leg: ${result.totalCombos} combos, ${result.profitableCombos} profitable. Top: #${top?.predator}v#${top?.prey} PF=${top?.institutionalPF}`);
      } else {
        toast.error(`Counter-Leg failed: ${result.errors?.join('; ')}`);
      }
      if (result.errors?.length > 0 && result.success) {
        toast.warning(`${result.errors.length} worker(s) failed: ${result.errors.join('; ')}`);
      }
    } catch (err) {
      toast.error(`Counter-Leg error: ${(err as Error).message}`);
    } finally {
      setRunningCounter(false);
    }
  }, []);

  const isRunning = runningMomentum || runningCounter;
  const activeTabDef = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-[#a855f7]/20 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#a855f720', border: '1px solid #a855f740' }}>
              <Brain className="w-3.5 h-3.5 text-[#a855f7]" />
            </div>
            <div>
              <h2 className="text-[11px] font-black text-white tracking-tighter">ATLAS HEDGE DEEP SEARCH</h2>
              <p className="text-[7px] text-slate-500 tracking-[0.15em]">4-PILLAR OPTIMIZATION · MOMENTUM + COUNTER-LEG + REGIME + PORTFOLIO</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'momentum' && (
              <button
                onClick={runMomentum}
                disabled={isRunning}
                className="flex items-center gap-1.5 text-[9px] font-mono px-4 py-2 rounded-lg border border-[#39ff14]/40 text-[#39ff14] hover:bg-[#39ff14]/10 transition-all disabled:opacity-50"
              >
                {runningMomentum ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                {runningMomentum ? 'RUNNING...' : 'RUN MOMENTUM'}
              </button>
            )}
            {activeTab === 'counter' && (
              <button
                onClick={runCounter}
                disabled={isRunning}
                className="flex items-center gap-1.5 text-[9px] font-mono px-4 py-2 rounded-lg border border-[#ff8800]/40 text-[#ff8800] hover:bg-[#ff8800]/10 transition-all disabled:opacity-50"
              >
                {runningCounter ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingDown className="w-3 h-3" />}
                {runningCounter ? 'RUNNING...' : 'RUN COUNTER-LEG'}
              </button>
            )}
            {activeTab === 'regime' && (
              <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-500">
                <Layers className="w-3 h-3" /> Aggregates Pillar 1 + 2 results
              </div>
            )}
            {activeTab === 'blend' && (
              <div className="flex items-center gap-1.5 text-[8px] font-mono text-slate-500">
                <Shield className="w-3 h-3" /> Auto-blends best from all pillars
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const hasData = tab.id === 'momentum' ? !!momentumResults : tab.id === 'counter' ? !!counterResults : tab.id === 'regime' || tab.id === 'blend' ? (!!momentumResults || !!counterResults) : false;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[9px] font-mono font-bold uppercase tracking-wider transition-all"
                style={{
                  color: active ? tab.color : '#64748b',
                  background: active ? `${tab.color}15` : 'transparent',
                  borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                }}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
                {hasData && (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: tab.color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {/* ── TAB 1: MOMENTUM ── */}
        {activeTab === 'momentum' && (
          <div>
            {runningMomentum ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#39ff14]" />
                <p className="text-[10px] text-slate-400 font-mono">Testing all rank combos × sessions × SL/TP on 15,000 real M30 candles...</p>
                <p className="text-[8px] text-slate-500 font-mono">Pillar 1: Directional momentum — long strong, short weak currencies</p>
              </div>
            ) : momentumResults ? (
              <ResultsTable results={momentumResults} labelPrefix="Momentum · " />
            ) : (
              <div className="py-12 text-center space-y-3">
                <TrendingUp className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-[10px] text-slate-500 font-mono">Pillar 1: Find which rank combos, sessions, and SL/TP produce the best <span className="text-[#39ff14]">directional momentum</span> edge</p>
                <p className="text-[8px] text-slate-600 font-mono">Long the strongest currency, short the weakest — optimized across all parameters</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: COUNTER-LEG ── */}
        {activeTab === 'counter' && (
          <div>
            {runningCounter ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#ff8800]" />
                <p className="text-[10px] text-slate-400 font-mono">Testing inverted direction combos on 15,000 real M30 candles...</p>
                <p className="text-[8px] text-slate-500 font-mono">Pillar 2: Mean-reversion — short the strong, long the weak (fade convergence)</p>
              </div>
            ) : counterResults ? (
              <ResultsTable results={counterResults} labelPrefix="Counter-Leg · " />
            ) : (
              <div className="py-12 text-center space-y-3">
                <TrendingDown className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-[10px] text-slate-500 font-mono">Pillar 2: Find <span className="text-[#ff8800]">mean-reversion</span> strategies that profit when rank spreads converge</p>
                <p className="text-[8px] text-slate-600 font-mono">Short the strong currency, long the weak — these offset momentum losses when trends reverse</p>
                <div className="bg-[#ff8800]/8 border border-[#ff8800]/20 rounded-lg p-3 max-w-md mx-auto mt-2">
                  <p className="text-[8px] text-[#ff8800] font-mono">
                    ⚠️ Uses <span className="font-bold">inverted direction logic</span> — the same rank pairs (#1v#8 etc.) but trading the opposite direction to find when the divergence fades
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: REGIME MAP ── */}
        {activeTab === 'regime' && (
          <RegimeBreakdown momentumResults={momentumResults} counterResults={counterResults} />
        )}

        {/* ── TAB 4: PORTFOLIO BLEND ── */}
        {activeTab === 'blend' && (
          <PortfolioBlend momentumResults={momentumResults} counterResults={counterResults} />
        )}
      </div>
    </div>
  );
}
