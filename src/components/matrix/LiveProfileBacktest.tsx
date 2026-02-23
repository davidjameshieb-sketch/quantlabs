// Live Profile Backtest Panel v6.0 — Sovereign-Alpha Mandate
// Fires 3 parallel edge function calls (one per predator rank), merges results.
// Displays dual-metric P&L: Aggressive (5% geometric) + Institutional (1% fixed risk).

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Trophy, AlertTriangle,
  Play, Loader2, ChevronDown, ChevronUp, ShieldCheck, Flame,
} from 'lucide-react';

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
  aggressiveProfit: number;
  institutionalProfit: number;
  aggressivePF: number;
  institutionalPF: number;
  maxDrawdown: number;
  aggressiveMaxDD: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  equityCurve: Array<{ time: string; equity: number; aggressiveEquity: number }> | null;
}

interface ChunkResponse {
  success: boolean;
  version: string;
  timestamp: string;
  environment: string;
  candlesPerPair: number;
  pairsLoaded: number;
  totalSnapshots: number;
  totalCombos: number;
  profitableCombos: number;
  rejectedCombos: number;
  topResults: LiveProfileResult[];
  predatorRanks: number[];
  dateRange: { start: string; end: string };
}

interface MergedResult {
  success: boolean;
  version: string;
  timestamp: string;
  environment: string;
  candlesPerPair: number;
  pairsLoaded: number;
  totalSnapshots: number;
  totalCombos: number;
  profitableCombos: number;
  rejectedCombos: number;
  topResults: LiveProfileResult[];
  dateRange: { start: string; end: string };
}

function DualCurve({ curve, height = 80 }: { curve: Array<{ time: string; equity: number; aggressiveEquity: number }>; height?: number }) {
  if (!curve || curve.length < 2) return null;
  const w = 280;
  const h = height;
  const pad = 4;

  const allVals = curve.flatMap(c => [c.equity, c.aggressiveEquity]);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const mapPoints = (key: 'equity' | 'aggressiveEquity') =>
    curve.map((pt, i) => {
      const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((pt[key] - min) / range) * (h - 2 * pad);
      return `${x},${y}`;
    });

  const instPoints = mapPoints('equity');
  const aggPoints = mapPoints('aggressiveEquity');
  const instPositive = curve[curve.length - 1].equity >= 1000;
  const aggPositive = curve[curve.length - 1].aggressiveEquity >= 1000;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {/* Aggressive curve (behind) */}
      <polyline points={aggPoints.join(' ')} fill="none" stroke={aggPositive ? '#ff6600' : '#ff0055'} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3,2" />
      {/* Institutional curve (front) */}
      <defs>
        <linearGradient id="inst-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={instPositive ? '#39ff14' : '#ff0055'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={instPositive ? '#39ff14' : '#ff0055'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${instPoints.join(' ')} ${w - pad},${h - pad}`}
        fill="url(#inst-grad)"
      />
      <polyline points={instPoints.join(' ')} fill="none" stroke={instPositive ? '#39ff14' : '#ff0055'} strokeWidth="1.5" />
    </svg>
  );
}

export function LiveProfileBacktest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MergedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [candleCount, setCandleCount] = useState(15000);
  const [environment, setEnvironment] = useState<'practice' | 'live'>('live');
  const [progress, setProgress] = useState<{ completed: number; total: number; chunks: string[] }>({ completed: 0, total: 3, chunks: [] });

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress({ completed: 0, total: 3, chunks: [] });

    try {
      const chunks: Array<{ predatorRanks: number[]; label: string }> = [
        { predatorRanks: [1], label: "Predator R1" },
        { predatorRanks: [2], label: "Predator R2" },
        { predatorRanks: [3], label: "Predator R3" },
      ];

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-live-backtest`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const promises = chunks.map(async (chunk) => {
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ environment, candles: candleCount, topN: 25, predatorRanks: chunk.predatorRanks }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => res.statusText);
          throw new Error(`${chunk.label}: ${errBody}`);
        }

        const data = await res.json();
        if (!data?.success) {
          throw new Error(`${chunk.label}: ${data?.error || 'Failed'}`);
        }

        setProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
          chunks: [...prev.chunks, chunk.label],
        }));

        return data as ChunkResponse;
      });

      const results = await Promise.all(promises);

      // Merge results — sort by institutional PF (1% risk model)
      const allTopResults = results.flatMap(r => r.topResults);
      allTopResults.sort((a, b) => {
        if (a.institutionalPF !== b.institutionalPF) return b.institutionalPF - a.institutionalPF;
        return b.institutionalProfit - a.institutionalProfit;
      });

      const merged: MergedResult = {
        success: true,
        version: "6.0-sovereign-alpha",
        timestamp: new Date().toISOString(),
        environment,
        candlesPerPair: results[0]?.candlesPerPair ?? 0,
        pairsLoaded: results[0]?.pairsLoaded ?? 0,
        totalSnapshots: results[0]?.totalSnapshots ?? 0,
        totalCombos: results.reduce((sum, r) => sum + r.totalCombos, 0),
        profitableCombos: results.reduce((sum, r) => sum + r.profitableCombos, 0),
        rejectedCombos: results.reduce((sum, r) => sum + (r.rejectedCombos || 0), 0),
        topResults: allTopResults.slice(0, 25),
        dateRange: results[0]?.dateRange ?? { start: '', end: '' },
      };

      setResult(merged);
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
          <ShieldCheck className="w-4 h-4 text-[#ff6600]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Sovereign-Alpha Mandate · v6.0
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded bg-emerald-500/10">
            TRIPLE-LOCK G1+G2+G3
          </span>
          <span className="text-[8px] font-mono text-[#ff6600] border border-[#ff6600]/30 px-1.5 py-0.5 rounded bg-[#ff6600]/10">
            20% DD REJECT
          </span>
          <span className="text-[8px] font-mono text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">
            50-LOT CAP
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <select
          value={candleCount}
          onChange={e => setCandleCount(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
          disabled={loading}
        >
          <option value={5000}>5,000 candles (~4 months)</option>
          <option value={10000}>10,000 candles (~8 months)</option>
          <option value={15000}>15,000 candles (~14 months)</option>
          <option value={20000}>20,000 candles (~16 months)</option>
        </select>

        <select
          value={environment}
          onChange={e => setEnvironment(e.target.value as 'practice' | 'live')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
          disabled={loading}
        >
          <option value="practice">Practice</option>
          <option value="live">Live</option>
        </select>

        <button
          onClick={runBacktest}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
          style={{
            background: '#ff6600',
            color: '#0f172a',
            boxShadow: '0 0 20px rgba(255,102,0,0.3)',
          }}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {loading ? 'Running…' : 'Run Sovereign-Alpha'}
        </button>
      </div>

      {/* Description */}
      {!result && !loading && !error && (
        <div className="text-[10px] text-slate-500 font-mono leading-relaxed max-w-2xl space-y-1">
          <p>Institutional-grade backtest: Triple-Lock entries (G1+G2+G3), 1.5-pip friction tax, 20% max DD fatal filter, 50-lot position cap.</p>
          <p>Dual-metric benchmarking: <span className="text-[#ff6600]">Aggressive (5% risk)</span> vs <span className="text-emerald-400">Institutional (1% risk)</span>. Sorted by 1% Risk Profit Factor.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 space-y-3">
          <div className="flex items-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
              <Cpu className="w-6 h-6 text-[#ff6600]" />
            </motion.div>
            <div className="flex-1">
              <span className="text-[10px] text-slate-300 font-mono uppercase tracking-widest">
                Sovereign-Alpha: {progress.completed}/{progress.total} workers complete
              </span>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: '#ff6600' }}
                  animate={{ width: `${Math.max(5, (progress.completed / progress.total) * 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex gap-2 mt-2">
                {['Predator R1', 'Predator R2', 'Predator R3'].map((label) => {
                  const done = progress.chunks.includes(label);
                  return (
                    <span
                      key={label}
                      className={`text-[8px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                        done
                          ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                          : 'border-slate-700 text-slate-500 bg-slate-900/50'
                      }`}
                    >
                      {done ? '✓' : '⏳'} {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
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
                {result.totalCombos.toLocaleString()} TESTED
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 bg-red-500/10">
                {result.rejectedCombos.toLocaleString()} REJECTED (20% DD)
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                {result.profitableCombos.toLocaleString()} PROFITABLE
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                {result.candlesPerPair.toLocaleString()} candles · {result.pairsLoaded} pairs
              </span>
              <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                {result.dateRange.start.slice(0, 10)} → {result.dateRange.end.slice(0, 10)}
              </span>
            </div>

            {/* Top Results */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Top {result.topResults.length} Sovereign-Alpha Profiles (sorted by 1% Risk PF)
                </span>
              </div>

              {result.topResults.map((profile, idx) => {
                const isExpanded = expandedIdx === idx;
                const medalColor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : undefined;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-slate-800/60 border border-slate-700/40 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/80 transition-colors"
                    >
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-white">
                            R{profile.predator}v{profile.prey}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
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

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Institutional P&L (primary) */}
                        <div className="text-right">
                          <div className="text-[8px] text-emerald-500 flex items-center gap-0.5 justify-end">
                            <ShieldCheck className="w-2.5 h-2.5" /> 1% Risk
                          </div>
                          <div className={`text-[11px] font-bold font-mono ${profile.institutionalProfit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${profile.institutionalProfit.toLocaleString()}
                          </div>
                        </div>
                        {/* Aggressive P&L */}
                        <div className="text-right">
                          <div className="text-[8px] text-[#ff6600] flex items-center gap-0.5 justify-end">
                            <Flame className="w-2.5 h-2.5" /> 5% Risk
                          </div>
                          <div className={`text-[11px] font-bold font-mono ${profile.aggressiveProfit > 0 ? 'text-[#ff6600]' : 'text-red-400'}`}>
                            ${profile.aggressiveProfit.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">PF</div>
                          <div className={`text-[11px] font-bold font-mono ${profile.institutionalPF >= 1.3 ? 'text-emerald-400' : profile.institutionalPF >= 1.0 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {profile.institutionalPF}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">WR</div>
                          <div className={`text-[11px] font-bold font-mono ${profile.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {profile.winRate}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500">Trades</div>
                          <div className="text-[11px] font-mono text-slate-300">{profile.trades}</div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-700/30"
                        >
                          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Institutional Stats */}
                            <div className="space-y-2">
                              <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1 mb-1">
                                <ShieldCheck className="w-3 h-3" /> Institutional (1% Risk)
                              </div>
                              <StatRow label="Net P&L" value={`$${profile.institutionalProfit.toLocaleString()}`} positive={profile.institutionalProfit > 0} />
                              <StatRow label="Profit Factor" value={`${profile.institutionalPF}`} positive={profile.institutionalPF >= 1.3} />
                              <StatRow label="Max Drawdown" value={`${profile.maxDrawdown}%`} positive={profile.maxDrawdown > -15} />
                            </div>
                            {/* Aggressive Stats */}
                            <div className="space-y-2">
                              <div className="text-[9px] font-bold text-[#ff6600] uppercase tracking-widest flex items-center gap-1 mb-1">
                                <Flame className="w-3 h-3" /> Aggressive (5% Risk)
                              </div>
                              <StatRow label="Net P&L" value={`$${profile.aggressiveProfit.toLocaleString()}`} positive={profile.aggressiveProfit > 0} />
                              <StatRow label="Profit Factor" value={`${profile.aggressivePF}`} positive={profile.aggressivePF >= 1.3} />
                              <StatRow label="Max Drawdown" value={`${profile.aggressiveMaxDD}%`} positive={profile.aggressiveMaxDD > -15} />
                            </div>
                            {/* Pip Stats */}
                            <div className="space-y-2">
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                Pip Performance (after 1.5p tax)
                              </div>
                              <StatRow label="Total Pips" value={`${profile.totalPips > 0 ? '+' : ''}${profile.totalPips}`} positive={profile.totalPips > 0} />
                              <StatRow label="Avg Win" value={`+${profile.avgWin} pips`} positive />
                              <StatRow label="Avg Loss" value={`-${profile.avgLoss} pips`} positive={false} />
                              <StatRow label="Expectancy" value={`${profile.expectancy > 0 ? '+' : ''}${profile.expectancy} pips/trade`} positive={profile.expectancy > 0} />
                              <StatRow label="Win/Loss" value={`${profile.wins}/${profile.losses}`} positive={profile.wins > profile.losses} />
                              <StatRow label="R:R Ratio" value={profile.avgLoss > 0 ? (profile.avgWin / profile.avgLoss).toFixed(2) : '∞'} positive />
                            </div>

                            {/* Dual Equity Curve */}
                            {profile.equityCurve && (
                              <div>
                                <div className="text-[9px] text-slate-500 mb-1 font-mono">DUAL EQUITY CURVE</div>
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="text-[8px] font-mono text-emerald-400">━ 1% Risk</span>
                                  <span className="text-[8px] font-mono text-[#ff6600]">╌ 5% Risk</span>
                                </div>
                                <DualCurve curve={profile.equityCurve} height={80} />
                                <div className="flex justify-between text-[8px] text-slate-600 font-mono mt-1">
                                  <span>{profile.equityCurve[0]?.time.slice(0, 10)}</span>
                                  <span className="text-emerald-500">
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
