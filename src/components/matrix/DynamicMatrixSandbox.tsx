// Dynamic Matrix Sandbox — Real OANDA Data Interactive Backtest
// Fetches real live backtest results and lets user explore them interactively
// No PRNG — all results are from actual M30 candle validation

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sliders, ToggleLeft, ToggleRight, TrendingUp, TrendingDown,
  Zap, Shield, Target, Activity, ChevronDown, ChevronUp,
  Crosshair, Clock, Cpu,
} from 'lucide-react';
import { TimePeriodBreakdown } from './TimePeriodBreakdown';

// ── Live backtest result type ──
interface LiveResult {
  predator: number; prey: number; gates: string;
  slPips: number; tpRatio: number | string; session: string;
  trades: number; wins: number; losses: number;
  winRate: number; profitFactor: number; totalPips: number;
  institutionalProfit: number; aggressiveProfit: number;
  institutionalPF: number; aggressivePF: number;
  maxDrawdown: number; aggressiveMaxDD: number;
  expectancy: number; avgWin: number; avgLoss: number;
  equityCurve: Array<{ time: string; equity: number; aggressiveEquity?: number }> | null;
}

const PREDATOR_RANKS = [1, 2, 3];
const PREY_RANKS = [6, 7, 8];
const SL_OPTIONS = [10, 15, 20, 30, 42];
const TP_OPTIONS = [1.5, 2.0, 3.0, 'flip'] as const;
const SESSION_OPTIONS = [
  { id: 'ALL', label: 'All Sessions' },
  { id: 'ASIA', label: 'Asian (00-07 UTC)' },
  { id: 'LONDON', label: 'London (07-12 UTC)' },
  { id: 'NEW_YORK', label: 'New York (12-17 UTC)' },
  { id: 'NY_CLOSE', label: 'NY Close (17-21 UTC)' },
];

// ── Mini equity chart ──
function MiniEquityChart({ curve }: { curve: Array<{ time: string; equity: number }> }) {
  if (curve.length < 2) return null;
  const w = 800, h = 200, pad = 20;
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
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
      <defs><linearGradient id="sandboxGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {min <= 1000 && max >= 1000 && (<line x1={pad} y1={h - pad - ((1000 - min) / range) * (h - 2 * pad)} x2={w - pad} y2={h - pad - ((1000 - min) / range) * (h - 2 * pad)} stroke="#ffffff15" strokeDasharray="4,4" />)}
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill="url(#sandboxGrad)" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

interface Props { result?: any; }

export const DynamicMatrixSandbox = ({ result }: Props) => {
  const [predatorRank, setPredatorRank] = useState(1);
  const [preyRank, setPreyRank] = useState(8);
  const [slIdx, setSlIdx] = useState(1); // 15 pip default
  const [tpIdx, setTpIdx] = useState(1); // 2.0R default
  const [sessionIdx, setSessionIdx] = useState(0); // ALL
  const [candleCount, setCandleCount] = useState(15000);
  const [environment, setEnvironment] = useState<'live' | 'practice'>('live');

  // Live backtest state
  const [isLoading, setIsLoading] = useState(false);
  const [allResults, setAllResults] = useState<LiveResult[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const fetchResults = useCallback(async () => {
    setIsLoading(true);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-live-backtest`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Split by predator rank to avoid CPU limits
      const chunks = [1, 2, 3].map(rank =>
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ environment, candles: candleCount, topN: 100, predatorRanks: [rank] }),
        }).then(r => r.json())
      );

      const results = await Promise.all(chunks);
      const failed = results.find(r => !r.success);
      if (failed) throw new Error(failed.error || 'Failed');

      const allTopResults = results.flatMap(r => r.topResults || []);
      allTopResults.sort((a: any, b: any) => b.institutionalPF - a.institutionalPF || b.institutionalProfit - a.institutionalProfit);

      setAllResults(allTopResults.slice(0, 100));
      setDateRange(results[0]?.dateRange || null);
      setHasLoaded(true);
    } catch (err) {
      console.error('[Sandbox] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [environment, candleCount]);

  // Find matching result from fetched data
  const selectedResult = useMemo(() => {
    if (!hasLoaded || allResults.length === 0) return null;
    const targetSL = SL_OPTIONS[slIdx];
    const targetTP = TP_OPTIONS[tpIdx];
    const targetSession = SESSION_OPTIONS[sessionIdx].id;

    // Exact match
    let match = allResults.find(r =>
      r.predator === predatorRank && r.prey === preyRank &&
      r.slPips === targetSL && r.tpRatio === targetTP && r.session === targetSession
    );
    // Fallback: same rank, any params
    if (!match) match = allResults.find(r => r.predator === predatorRank && r.prey === preyRank);
    // Fallback: any result with equity curve
    if (!match) match = allResults.find(r => r.equityCurve && r.equityCurve.length > 0);
    return match || null;
  }, [allResults, predatorRank, preyRank, slIdx, tpIdx, sessionIdx, hasLoaded]);

  const equityCurve = useMemo(() => {
    if (!selectedResult?.equityCurve) return [];
    return selectedResult.equityCurve.map(pt => ({ time: pt.time, equity: pt.equity }));
  }, [selectedResult]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-[#00ffea]/30 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#00ffea]/20 bg-gradient-to-r from-cyan-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-[#00ffea] uppercase">Dynamic Matrix Sandbox</h2>
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20">REAL OANDA DATA</span>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">Interactive Explorer · Live M30 Candle Validated</span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1 font-mono">
          Explore real backtest results across Rank × SL × TP × Session combinations — all powered by actual OANDA market data
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Fetch Button */}
        {!hasLoaded && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-[#00ffea]/10 border-2 border-[#00ffea]/30 flex items-center justify-center">
              <Sliders className="w-8 h-8 text-[#00ffea]" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center max-w-md">
              Load <span className="text-[#39ff14] font-bold">real OANDA market data</span> to explore strategy combinations interactively.
              All results use actual M30 candles with 1.5-pip friction and 20% drawdown kill filter.
            </p>
            <div className="flex items-center gap-3">
              <select value={candleCount} onChange={e => setCandleCount(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300">
                <option value={5000}>5,000 candles (~3 months)</option>
                <option value={15000}>15,000 candles (~14 months)</option>
                <option value={42000}>42,000 candles (~2.6 years)</option>
              </select>
              <select value={environment} onChange={e => setEnvironment(e.target.value as 'live' | 'practice')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300">
                <option value="live">Live</option>
                <option value="practice">Practice</option>
              </select>
            </div>
            <button onClick={fetchResults}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-black font-bold text-xs tracking-widest uppercase rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2">
              <Cpu className="w-4 h-4" />LOAD REAL MARKET DATA
            </button>
          </motion.div>
        )}

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 space-y-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-[#00ffea]/30 border-t-[#00ffea] rounded-full" />
            <p className="text-[10px] text-[#00ffea] font-mono animate-pulse">Fetching real OANDA candles & backtesting all combinations...</p>
            <p className="text-[8px] text-slate-500 font-mono">This may take 30-60 seconds</p>
          </motion.div>
        )}

        {hasLoaded && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Predator Rank */}
              <div className="space-y-2">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Crosshair className="w-3 h-3 text-[#39ff14]" />Predator Rank
                </label>
                <div className="flex gap-1">
                  {PREDATOR_RANKS.map(r => (
                    <button key={r} onClick={() => setPredatorRank(r)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-mono font-bold transition-all ${predatorRank === r ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40' : 'bg-slate-800/50 text-slate-500 border border-slate-700/40 hover:border-slate-600'}`}>
                      #{r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prey Rank */}
              <div className="space-y-2">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Target className="w-3 h-3 text-[#ff0055]" />Prey Rank
                </label>
                <div className="flex gap-1">
                  {PREY_RANKS.map(r => (
                    <button key={r} onClick={() => setPreyRank(r)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-mono font-bold transition-all ${preyRank === r ? 'bg-[#ff0055]/20 text-[#ff0055] border border-[#ff0055]/40' : 'bg-slate-800/50 text-slate-500 border border-slate-700/40 hover:border-slate-600'}`}>
                      #{r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stop Loss */}
              <div className="space-y-2">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-[#ff8800]" />Stop Loss (pips)
                </label>
                <div className="flex gap-1 flex-wrap">
                  {SL_OPTIONS.map((sl, i) => (
                    <button key={sl} onClick={() => setSlIdx(i)}
                      className={`px-2 py-1.5 rounded-lg text-[9px] font-mono font-bold transition-all ${slIdx === i ? 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40' : 'bg-slate-800/50 text-slate-500 border border-slate-700/40'}`}>
                      {sl}p
                    </button>
                  ))}
                </div>
              </div>

              {/* TP Ratio */}
              <div className="space-y-2">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-[#00ffea]" />Take Profit
                </label>
                <div className="flex gap-1 flex-wrap">
                  {TP_OPTIONS.map((tp, i) => (
                    <button key={String(tp)} onClick={() => setTpIdx(i)}
                      className={`px-2 py-1.5 rounded-lg text-[9px] font-mono font-bold transition-all ${tpIdx === i ? 'bg-[#00ffea]/20 text-[#00ffea] border border-[#00ffea]/40' : 'bg-slate-800/50 text-slate-500 border border-slate-700/40'}`}>
                      {tp === 'flip' ? 'Flip' : `${tp}R`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session */}
              <div className="space-y-2">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-[#a855f7]" />Session
                </label>
                <select value={sessionIdx} onChange={e => setSessionIdx(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[9px] font-mono text-slate-300">
                  {SESSION_OPTIONS.map((s, i) => (<option key={s.id} value={i}>{s.label}</option>))}
                </select>
              </div>
            </div>

            {/* Current Selection Label */}
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800/50 rounded-lg p-2.5">
              <span className="text-[8px] font-mono text-slate-400">Selected:</span>
              <span className="text-[9px] font-mono font-bold text-[#00ffea]">
                #{predatorRank} vs #{preyRank} · {SL_OPTIONS[slIdx]}p SL · {TP_OPTIONS[tpIdx] === 'flip' ? 'Flip' : `${TP_OPTIONS[tpIdx]}R`} TP · {SESSION_OPTIONS[sessionIdx].label}
              </span>
              {selectedResult ? (
                <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20 ml-auto">MATCHED</span>
              ) : (
                <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#ff8800]/10 text-[#ff8800] border border-[#ff8800]/20 ml-auto">NO EXACT MATCH — showing closest</span>
              )}
              <button onClick={fetchResults} className="text-[8px] font-mono text-[#00ffea] hover:text-[#00ffea]/80 transition-colors flex items-center gap-1 ml-2">
                <Cpu className="w-3 h-3" />Refresh
              </button>
            </div>

            {/* Results */}
            {selectedResult ? (
              <div className="space-y-4">
                {/* KPI Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {[
                    { l: 'Inst. Profit', v: `$${selectedResult.institutionalProfit.toFixed(0)}`, c: selectedResult.institutionalProfit >= 0 ? '#39ff14' : '#ff0055' },
                    { l: 'Agg. Profit', v: `$${selectedResult.aggressiveProfit.toFixed(0)}`, c: selectedResult.aggressiveProfit >= 0 ? '#ffaa00' : '#ff0055' },
                    { l: 'Win Rate', v: `${selectedResult.winRate}%`, c: selectedResult.winRate >= 55 ? '#39ff14' : '#00ffea' },
                    { l: 'Inst. PF', v: `${selectedResult.institutionalPF}`, c: selectedResult.institutionalPF > 1.5 ? '#39ff14' : selectedResult.institutionalPF > 1 ? '#00ffea' : '#ff0055' },
                    { l: 'Max DD', v: `${selectedResult.maxDrawdown}%`, c: '#ff0055' },
                    { l: 'Net Pips', v: `${selectedResult.totalPips >= 0 ? '+' : ''}${selectedResult.totalPips}`, c: selectedResult.totalPips >= 0 ? '#39ff14' : '#ff0055' },
                    { l: 'Trades', v: `${selectedResult.trades}`, c: '#a855f7' },
                  ].map(kpi => (
                    <div key={kpi.l} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                      <div className="text-[7px] text-slate-500 uppercase tracking-wider">{kpi.l}</div>
                      <div className="text-sm font-bold font-mono" style={{ color: kpi.c }}>{kpi.v}</div>
                    </div>
                  ))}
                </div>

                {/* Equity Curve */}
                {equityCurve.length > 0 && (
                  <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[#00ffea]" />Real Data Equity Curve
                        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20 ml-2">LIVE OANDA</span>
                      </h4>
                      {dateRange && (
                        <span className="text-[7px] font-mono text-slate-600">
                          {new Date(dateRange.start).toLocaleDateString()} → {new Date(dateRange.end).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <MiniEquityChart curve={equityCurve} />
                    <TimePeriodBreakdown curve={equityCurve} />
                  </div>
                )}

                {/* Profile Details */}
                <div className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-3 space-y-2">
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-[#00ffea]" />Validated Profile Details
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8px] font-mono">
                    <div><span className="text-slate-600">Avg Win:</span> <span className="text-[#39ff14]">{selectedResult.avgWin}p</span></div>
                    <div><span className="text-slate-600">Avg Loss:</span> <span className="text-[#ff0055]">{selectedResult.avgLoss}p</span></div>
                    <div><span className="text-slate-600">Expectancy:</span> <span className="text-[#00ffea]">{selectedResult.expectancy}p/trade</span></div>
                    <div><span className="text-slate-600">Agg. Max DD:</span> <span className="text-[#ff0055]">{selectedResult.aggressiveMaxDD}%</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-[10px] text-slate-500 font-mono">No matching profile found for this combination.</p>
                <p className="text-[8px] text-slate-600 font-mono mt-1">Try adjusting Rank, SL, TP, or Session parameters.</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
