// Alpha Discovery Engine v2.0 — Genetic Algorithm Strategy Breeder
// Evolves trading strategies through natural selection with correlation filtering

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Cpu, ChevronDown, ChevronUp, AlertTriangle, Target, Activity,
  Layers, Fingerprint, Dna, TrendingUp, BarChart3, Shield, Zap, Crosshair,
} from 'lucide-react';
import type { BacktestResult } from '@/hooks/useRankExpectancy';

interface StrategyDNA {
  predatorRankMax: number;
  preyRankMin: number;
  gate1Required: boolean;
  gate2Required: boolean;
  gate3Required: boolean;
  sessionFilter: number;
  slMultiplier: number;
  tpMultiplier: number;
  hurstMin: number;
  hurstMax: number;
  volFilter: number;
  direction: number;
}

interface GAProfile {
  dna: StrategyDNA;
  fitness: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  totalPips: number;
  maxDrawdown: number;
  grossProfit: number;
  grossLoss: number;
  correlation: number;
  equityCurve: number[];
  plainEnglish: string;
}

interface EvolutionEntry {
  gen: number;
  bestFitness: number;
  avgFitness: number;
  bestTrades: number;
}

interface GAResult {
  timestamp: string;
  environment: string;
  dataPoints: number;
  totalSimulations: number;
  gaStats: {
    populationSize: number;
    generations: number;
    mutationRate: number;
    maxCorrelation: number;
    totalSimulations: number;
    finalBestFitness: number;
  };
  evolutionLog: EvolutionEntry[];
  uncorrelatedProfiles: GAProfile[];
  allProfiles: GAProfile[];
  baselineEquityCurve: number[];
  config: { populationSize: number; generations: number; maxCorrelation: number; candleCount: number; mutationRate: number };
}

// ── Mini Equity Curve ──
function EquityCurve({ curve, height = 60 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return null;
  const w = 300;
  const pad = 4;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const points = curve.map((val, i) => {
    const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
    const y = height - pad - ((val - min) / range) * (height - 2 * pad);
    return `${x},${y}`;
  });
  const isPositive = curve[curve.length - 1] >= curve[0];
  const color = isPositive ? '#39ff14' : '#ff0055';

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ga-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`}
        fill={`url(#ga-grad-${color.replace('#', '')})`}
      />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Evolution Chart ──
function EvolutionChart({ log }: { log: EvolutionEntry[] }) {
  if (log.length < 2) return null;
  const w = 400;
  const h = 80;
  const pad = 4;
  const maxF = Math.max(...log.map(l => l.bestFitness), 1);
  const points = log.map((l, i) => {
    const x = pad + (i / (log.length - 1)) * (w - 2 * pad);
    const y = h - pad - (l.bestFitness / maxF) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const avgPoints = log.map((l, i) => {
    const x = pad + (i / (log.length - 1)) * (w - 2 * pad);
    const y = h - pad - (l.avgFitness / maxF) * (h - 2 * pad);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
      <polyline points={avgPoints.join(' ')} fill="none" stroke="#6b7280" strokeWidth="1" strokeDasharray="3,3" />
      <polyline points={points.join(' ')} fill="none" stroke="#39ff14" strokeWidth="2" />
      <circle cx={Number(points[points.length - 1]?.split(',')[0])} cy={Number(points[points.length - 1]?.split(',')[1])} r="3" fill="#39ff14" />
    </svg>
  );
}

// ── Correlation Bar ──
function CorrelationBar({ value, max = 0.2 }: { value: number; max: number }) {
  const pct = Math.min(100, (value / 1) * 100);
  const isAccepted = value <= max;
  const color = isAccepted ? '#39ff14' : '#ff0055';

  return (
    <div className="relative w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
      <div className="absolute top-0 left-0 h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      <div className="absolute top-0 h-full w-px bg-yellow-500" style={{ left: `${max * 100}%` }} />
    </div>
  );
}

// ── DNA Badge Visualization ──
function DNABadges({ dna }: { dna: StrategyDNA }) {
  const sessions = ['Asia', 'London', 'NY', 'NY Close'];
  const dirs = ['LONG', 'SHORT', 'BOTH'];

  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/5">
        Pred ≤{dna.predatorRankMax}
      </span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/5">
        Prey ≥{dna.preyRankMin}
      </span>
      {dna.gate1Required && (
        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G1</span>
      )}
      {dna.gate2Required && (
        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G2</span>
      )}
      {dna.gate3Required && (
        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G3</span>
      )}
      {dna.sessionFilter >= 0 && (
        <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-500/5">
          {sessions[dna.sessionFilter]}
        </span>
      )}
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/5">
        SL {dna.slMultiplier.toFixed(1)}x
      </span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
        TP {dna.tpMultiplier.toFixed(1)}x
      </span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-slate-500/30 text-slate-400 bg-slate-500/5">
        {dirs[dna.direction]}
      </span>
    </div>
  );
}

// ── Main Component ──
export function AlphaDiscoveryEngine({ result }: { result: BacktestResult }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gaResult, setGaResult] = useState<GAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);
  const [populationSize, setPopulationSize] = useState(100);
  const [generations, setGenerations] = useState(50);
  const [maxCorrelation, setMaxCorrelation] = useState(0.2);

  const runGA = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alpha-discovery-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            environment: result.environment,
            populationSize,
            generations,
            maxCorrelation,
            candles: 42000,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'GA evolution failed');
      setGaResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [result, populationSize, generations, maxCorrelation]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Dna className="w-5 h-5 text-emerald-400" />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400"
            />
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Genetic Alpha Discovery Engine
            </h2>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
              Genetic Algorithm · Natural Selection · Correlation Penalty · {generations} Generations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gaResult && (
            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded">
              {gaResult.uncorrelatedProfiles.length} UNCORRELATED · {gaResult.totalSimulations.toLocaleString()} SIMS
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Config Panel */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Population Size</label>
                  <div className="flex items-center gap-2">
                    {[50, 100, 150, 200].map(ps => (
                      <button key={ps} onClick={() => setPopulationSize(ps)}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${
                          populationSize === ps
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >{ps}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Generations</label>
                  <div className="flex items-center gap-2">
                    {[30, 50, 80].map(g => (
                      <button key={g} onClick={() => setGenerations(g)}
                        className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-all ${
                          generations === g
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >{g}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Max Correlation</label>
                  <div className="flex items-center gap-2">
                    {[0.1, 0.2, 0.3, 0.4].map(mc => (
                      <button key={mc} onClick={() => setMaxCorrelation(mc)}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${
                          maxCorrelation === mc
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >{mc}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <button
                onClick={runGA}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-mono text-xs font-bold uppercase tracking-widest"
                style={{
                  borderColor: loading ? '#374151' : '#10b981aa',
                  background: loading ? '#0f172a' : 'linear-gradient(135deg, #10b98115, #0f172a)',
                  color: loading ? '#6b7280' : '#10b981',
                }}
              >
                {loading ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                      <Cpu className="w-4 h-4" />
                    </motion.div>
                    Evolving {populationSize} Strategies × {generations} Generations...
                  </>
                ) : (
                  <>
                    <Dna className="w-4 h-4" />
                    Launch Genetic Evolution · 42,000 Candles
                  </>
                )}
              </button>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-[9px] text-red-400 font-mono">{error}</span>
                </div>
              )}

              {/* Results */}
              {gaResult && (
                <div className="space-y-4">
                  {/* Stats Banner */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Data Points', value: gaResult.dataPoints.toLocaleString(), icon: Activity, color: '#00ffea' },
                      { label: 'Simulations', value: gaResult.totalSimulations.toLocaleString(), icon: Cpu, color: '#a855f7' },
                      { label: 'Best Fitness', value: gaResult.gaStats.finalBestFitness.toFixed(2), icon: Target, color: '#39ff14' },
                      { label: 'Generations', value: gaResult.gaStats.generations, icon: Dna, color: '#ff8800' },
                      { label: 'Uncorrelated', value: gaResult.uncorrelatedProfiles.length, icon: Fingerprint, color: '#10b981' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                        <stat.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: stat.color }} />
                        <div className="text-[10px] font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
                        <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Evolution Chart */}
                  {gaResult.evolutionLog.length > 1 && (
                    <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                            Evolution Fitness Curve
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[7px] font-mono">
                          <span className="text-emerald-400">━ Best</span>
                          <span className="text-slate-500">┄ Average</span>
                        </div>
                      </div>
                      <EvolutionChart log={gaResult.evolutionLog} />
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[6px] text-slate-600 font-mono">Gen 1</span>
                        <span className="text-[6px] text-slate-600 font-mono">Gen {gaResult.gaStats.generations}</span>
                      </div>
                    </div>
                  )}

                  {/* Uncorrelated Profiles Leaderboard */}
                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden">
                    <div className="bg-emerald-950/30 px-4 py-2.5 border-b border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                          Evolved Uncorrelated Strategies (ρ ≤ {maxCorrelation})
                        </span>
                      </div>
                      <span className="text-[7px] text-emerald-500/60 font-mono">
                        {gaResult.allProfiles.length - gaResult.uncorrelatedProfiles.length} rejected by correlation filter
                      </span>
                    </div>

                    {gaResult.uncorrelatedProfiles.length === 0 ? (
                      <div className="p-8 text-center">
                        <AlertTriangle className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-400 font-mono">
                          No uncorrelated strategies survived. Try increasing max correlation or running more generations.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/30">
                        {gaResult.uncorrelatedProfiles.map((profile, idx) => {
                          const isExpanded = expandedProfile === idx;
                          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

                          return (
                            <div key={idx} className="bg-slate-950/20 hover:bg-slate-900/40 transition-colors">
                              <button
                                onClick={() => setExpandedProfile(isExpanded ? null : idx)}
                                className="w-full px-4 py-3 text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-lg w-8 text-center shrink-0">{medal}</span>
                                  <div className="flex-1 min-w-0">
                                    <DNABadges dna={profile.dna} />
                                    <div className="text-[8px] font-mono text-slate-500 mt-1 truncate">
                                      Fitness: {profile.fitness} · {profile.plainEnglish}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono" style={{ color: profile.winRate >= 0.6 ? '#39ff14' : '#00ffea' }}>
                                        {(profile.winRate * 100).toFixed(1)}%
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">WR</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono" style={{ color: profile.profitFactor > 2 ? '#39ff14' : '#00ffea' }}>
                                        {profile.profitFactor}
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">PF</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono text-emerald-400">{profile.correlation}</div>
                                      <div className="text-[6px] text-slate-600 font-mono">ρ</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono text-slate-300">{profile.trades}</div>
                                      <div className="text-[6px] text-slate-600 font-mono">Trades</div>
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                                  </div>
                                </div>
                              </button>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 space-y-3">
                                      {/* Equity Curve */}
                                      <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Strategy Equity Curve</span>
                                          <span className="text-[8px] font-mono font-bold" style={{ color: profile.totalPips >= 0 ? '#39ff14' : '#ff0055' }}>
                                            {profile.totalPips >= 0 ? '+' : ''}{profile.totalPips} pips
                                          </span>
                                        </div>
                                        <EquityCurve curve={profile.equityCurve} height={80} />
                                      </div>

                                      {/* Correlation */}
                                      <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <Layers className="w-3 h-3 text-emerald-400" />
                                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                                            Correlation to Base Strategy
                                          </span>
                                        </div>
                                        <CorrelationBar value={profile.correlation} max={maxCorrelation} />
                                        <div className="flex items-center justify-between mt-1.5">
                                          <span className="text-[7px] text-slate-600 font-mono">0.0 (Independent)</span>
                                          <span className="text-[7px] text-yellow-500/60 font-mono">Threshold: {maxCorrelation}</span>
                                          <span className="text-[7px] text-slate-600 font-mono">1.0 (Identical)</span>
                                        </div>
                                      </div>

                                      {/* Stats Grid */}
                                      <div className="grid grid-cols-6 gap-2">
                                        {[
                                          { label: 'Win Rate', value: `${(profile.winRate * 100).toFixed(1)}%`, color: '#39ff14' },
                                          { label: 'Profit Factor', value: profile.profitFactor.toFixed(2), color: '#00ffea' },
                                          { label: 'Total Pips', value: `${profile.totalPips >= 0 ? '+' : ''}${profile.totalPips}`, color: profile.totalPips >= 0 ? '#39ff14' : '#ff0055' },
                                          { label: 'Max DD', value: `${(profile.maxDrawdown * 100).toFixed(1)}%`, color: '#ff8800' },
                                          { label: 'Fitness', value: profile.fitness.toFixed(2), color: '#a855f7' },
                                          { label: 'Correlation', value: profile.correlation.toFixed(3), color: '#10b981' },
                                        ].map(s => (
                                          <div key={s.label} className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-2 text-center">
                                            <div className="text-[9px] font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                                            <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{s.label}</div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* DNA Blueprint */}
                                      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <Dna className="w-3 h-3 text-emerald-400" />
                                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                                            Strategy DNA Blueprint
                                          </span>
                                        </div>
                                        <p className="text-[9px] font-mono text-emerald-300 leading-relaxed">
                                          {profile.plainEnglish}
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                                          <div className="text-[7px] font-mono text-slate-500">
                                            <span className="text-cyan-400">SL:</span> {profile.dna.slMultiplier.toFixed(2)} × ATR
                                          </div>
                                          <div className="text-[7px] font-mono text-slate-500">
                                            <span className="text-emerald-400">TP:</span> {profile.dna.tpMultiplier.toFixed(2)} × ATR
                                          </div>
                                          <div className="text-[7px] font-mono text-slate-500">
                                            <span className="text-purple-400">Hurst:</span> {profile.dna.hurstMin.toFixed(2)} – {profile.dna.hurstMax.toFixed(2)}
                                          </div>
                                          <div className="text-[7px] font-mono text-slate-500">
                                            <span className="text-yellow-400">R:R:</span> {(profile.dna.tpMultiplier / profile.dna.slMultiplier).toFixed(2)}:1
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* All Profiles Table */}
                  {gaResult.allProfiles.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-2 cursor-pointer text-[8px] text-slate-500 font-mono uppercase tracking-widest hover:text-slate-300 transition-colors py-2">
                        <BarChart3 className="w-3 h-3" />
                        All {gaResult.allProfiles.length} Evolved Strategies (Before Correlation Filter)
                      </summary>
                      <div className="mt-2 bg-slate-950/40 border border-slate-800/30 rounded-lg overflow-hidden">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[7px] text-slate-600 font-mono uppercase border-b border-slate-800/30">
                              <th className="p-2">#</th>
                              <th className="p-2">DNA</th>
                              <th className="p-2 text-right">Fitness</th>
                              <th className="p-2 text-right">WR</th>
                              <th className="p-2 text-right">PF</th>
                              <th className="p-2 text-right">Trades</th>
                              <th className="p-2 text-right">DD</th>
                              <th className="p-2 text-right">ρ</th>
                              <th className="p-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/20">
                            {gaResult.allProfiles.map((profile, idx) => {
                              const accepted = profile.correlation <= maxCorrelation && profile.profitFactor > 1;
                              return (
                                <tr key={idx} className={accepted ? 'bg-emerald-950/10' : 'opacity-50'}>
                                  <td className="p-2 text-[8px] font-mono text-slate-500">{idx + 1}</td>
                                  <td className="p-2 text-[7px] font-mono text-slate-400 max-w-[250px] truncate">{profile.plainEnglish}</td>
                                  <td className="p-2 text-[8px] font-mono text-right text-purple-400">{profile.fitness}</td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: profile.winRate >= 0.6 ? '#39ff14' : '#00ffea' }}>
                                    {(profile.winRate * 100).toFixed(1)}%
                                  </td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: profile.profitFactor > 2 ? '#39ff14' : '#00ffea' }}>
                                    {profile.profitFactor}
                                  </td>
                                  <td className="p-2 text-[8px] font-mono text-right text-slate-400">{profile.trades}</td>
                                  <td className="p-2 text-[8px] font-mono text-right text-orange-400">{(profile.maxDrawdown * 100).toFixed(1)}%</td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: profile.correlation <= maxCorrelation ? '#10b981' : '#ff0055' }}>
                                    {profile.correlation.toFixed(3)}
                                  </td>
                                  <td className="p-2 text-right">
                                    <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                      accepted
                                        ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                                        : 'text-red-400 border-red-400/30 bg-red-400/10'
                                    }`}>
                                      {accepted ? 'PASS' : 'REJECT'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
