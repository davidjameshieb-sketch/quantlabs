// Live Profile Backtest Panel — True bar-by-bar validation of all Profile Discovery combos
// against real OANDA candle data (no synthetic PRNG)

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Trophy, TrendingUp, Flame, Shield, Activity, AlertTriangle,
  Play, Loader2, ChevronDown, ChevronUp, BarChart3,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LiveProfileResult {
  predator: number;
  prey: number;
  gates: string;
  slPips: number;
  tpRatio: number | "flip";
  session: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalPips: number;
  netProfit: number;
  maxDrawdown: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  equityCurve: Array<{ time: string; equity: number }> | null;
}

interface LiveBacktestResponse {
  success: boolean;
  version: string;
  timestamp: string;
  environment: string;
  candlesPerPair: number;
  pairsLoaded: number;
  totalSnapshots: number;
  totalCombos: number;
  profitableCombos: number;
  topResults: LiveProfileResult[];
  dateRange: { start: string; end: string };
}

// ── Mini equity chart ──
function MiniCurve({ curve, height = 70 }: { curve: Array<{ time: string; equity: number }>; height?: number }) {
  if (!curve || curve.length < 2) return null;
  const w = 280;
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
        <linearGradient id={`lbt-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`}
        fill={`url(#lbt-grad-${color})`}
      />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function LiveProfileBacktest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveBacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [candleCount, setCandleCount] = useState(5000);
  const [environment, setEnvironment] = useState<'practice' | 'live'>('practice');

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('profile-live-backtest', {
        body: { environment, candles: candleCount, topN: 25 },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Unknown error');
      setResult(data as LiveBacktestResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatTP = (tp: number | "flip") => tp === "flip" ? "Signal Flip" : `${tp}R`;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#ff6600]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Live Profile Backtest · True Bar-by-Bar Simulation
          </h2>
        </div>
        <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
          NO SYNTHETIC DATA
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <select
          value={candleCount}
          onChange={e => setCandleCount(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
        >
          <option value={5000}>5,000 candles (~4 months)</option>
          <option value={10000}>10,000 candles (~8 months)</option>
          <option value={20000}>20,000 candles (~16 months)</option>
          <option value={42000}>42,000 candles (~2.6 years)</option>
        </select>

        <select
          value={environment}
          onChange={e => setEnvironment(e.target.value as 'practice' | 'live')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
        >
          <option value="practice">Practice</option>
          <option value="live">Live</option>
        </select>

        <button
          onClick={runBacktest}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
          style={{
            background: loading ? '#334155' : '#ff6600',
            color: loading ? '#94a3b8' : '#0f172a',
            boxShadow: loading ? 'none' : '0 0 20px rgba(255,102,0,0.3)',
          }}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {loading ? 'Running…' : 'Run Live Backtest'}
        </button>
      </div>

      {/* Description */}
      {!result && !loading && !error && (
        <div className="text-[10px] text-slate-500 font-mono leading-relaxed max-w-2xl">
          Tests all Profile Discovery combos (Rank × Gates × SL × TP × Session) against REAL historical candle data.
          Every trade is simulated bar-by-bar with actual SL/TP hit detection on High/Low — zero synthetic randomness.
          Uses 5% Risk Dynamic Sizing on $1,000 starting equity.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center space-y-3">
          <div className="flex justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            >
              <Cpu className="w-8 h-8 text-[#ff6600]" />
            </motion.div>
          </div>
          <p className="text-[10px] text-slate-400 tracking-widest font-mono animate-pulse">
            FETCHING {candleCount.toLocaleString()} CANDLES × 28 PAIRS · SIMULATING ALL COMBOS…
          </p>
          <p className="text-[9px] text-slate-600 font-mono">
            This may take 30-60 seconds depending on data depth
          </p>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Summary badges */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-[#ff6600]/30 text-[#ff6600] bg-[#ff6600]/10">
                {result.totalCombos.toLocaleString()} COMBOS TESTED
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                {result.profitableCombos.toLocaleString()} PROFITABLE ({Math.round(result.profitableCombos / result.totalCombos * 100)}%)
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                {result.candlesPerPair.toLocaleString()} candles/pair · {result.pairsLoaded} pairs
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                {result.dateRange.start.slice(0, 10)} → {result.dateRange.end.slice(0, 10)}
              </span>
            </div>

            {/* Top Results Table */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Top {result.topResults.length} Live-Validated Profiles
                </span>
              </div>

              {result.topResults.map((profile, idx) => {
                const isExpanded = expandedIdx === idx;
                const isProfit = profile.netProfit > 0;
                const medalColor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : undefined;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-slate-800/60 border border-slate-700/40 rounded-xl overflow-hidden"
                  >
                    {/* Row header */}
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/80 transition-colors"
                    >
                      {/* Rank badge */}
                      <span
                        className="text-[10px] font-bold font-mono w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: medalColor ? `${medalColor}20` : 'rgba(100,116,139,0.15)',
                          color: medalColor || '#94a3b8',
                          border: `1px solid ${medalColor ? medalColor + '40' : '#334155'}`,
                        }}
                      >
                        #{idx + 1}
                      </span>

                      {/* Config */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-white">
                            R{profile.predator}v{profile.prey}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            {profile.gates}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            SL:{profile.slPips}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            TP:{formatTP(profile.tpRatio)}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            {profile.session}
                          </span>
                        </div>
                      </div>

                      {/* Key stats */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">Net P&L</div>
                          <div className={`text-[11px] font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${profile.netProfit.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">WR</div>
                          <div className={`text-[11px] font-bold font-mono ${profile.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {profile.winRate}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">PF</div>
                          <div className={`text-[11px] font-bold font-mono ${profile.profitFactor >= 1.2 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                            {profile.profitFactor}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">Trades</div>
                          <div className="text-[11px] font-mono text-slate-300">{profile.trades}</div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                      </div>
                    </button>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-700/30"
                        >
                          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Stats grid */}
                            <div className="space-y-2">
                              <StatRow label="Total Pips" value={`${profile.totalPips > 0 ? '+' : ''}${profile.totalPips}`} positive={profile.totalPips > 0} />
                              <StatRow label="Avg Win" value={`+${profile.avgWin} pips`} positive />
                              <StatRow label="Avg Loss" value={`-${profile.avgLoss} pips`} positive={false} />
                              <StatRow label="Expectancy" value={`${profile.expectancy > 0 ? '+' : ''}${profile.expectancy} pips/trade`} positive={profile.expectancy > 0} />
                            </div>
                            <div className="space-y-2">
                              <StatRow label="Max Drawdown" value={`${profile.maxDrawdown}%`} positive={profile.maxDrawdown > -20} />
                              <StatRow label="Win/Loss" value={`${profile.wins}/${profile.losses}`} positive={profile.wins > profile.losses} />
                              <StatRow label="R:R Ratio" value={profile.avgLoss > 0 ? (profile.avgWin / profile.avgLoss).toFixed(2) : '∞'} positive />
                            </div>

                            {/* Equity Curve */}
                            {profile.equityCurve && (
                              <div className="col-span-2">
                                <div className="text-[9px] text-slate-500 mb-1 font-mono">EQUITY CURVE (REAL DATA)</div>
                                <MiniCurve curve={profile.equityCurve} height={80} />
                                <div className="flex justify-between text-[8px] text-slate-600 font-mono mt-1">
                                  <span>{profile.equityCurve[0]?.time.slice(0, 10)}</span>
                                  <span className={isProfit ? 'text-emerald-500' : 'text-red-500'}>
                                    ${profile.equityCurve[profile.equityCurve.length - 1]?.equity.toLocaleString()}
                                  </span>
                                  <span>{profile.equityCurve[profile.equityCurve.length - 1]?.time.slice(0, 10)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Stat row helper ──
function StatRow({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-slate-500 font-mono">{label}</span>
      <span className={`text-[10px] font-bold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  );
}
