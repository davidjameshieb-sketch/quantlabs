// Alpha Discovery Engine v3.0 — Phased GA State Machine UI
// Drives a multi-invocation GA via init → evolve (loop) → extract

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Cpu, ChevronDown, ChevronUp, AlertTriangle, Target, Activity,
  Layers, Fingerprint, Dna, TrendingUp, BarChart3, Shield, Zap, Crosshair,
  Loader2, CheckCircle2, Clock,
} from 'lucide-react';
import type { BacktestResult } from '@/hooks/useRankExpectancy';

interface StrategyDNA {
  predatorRankMax: number; preyRankMin: number;
  gate1Required: boolean; gate2Required: boolean; gate3Required: boolean;
  sessionFilter: number; slMultiplier: number; tpMultiplier: number;
  hurstMin: number; hurstMax: number; volFilter: number; direction: number;
}

interface GAProfile {
  dna: StrategyDNA; fitness: number; winRate: number; profitFactor: number;
  trades: number; totalPips: number; maxDrawdown: number; grossProfit: number;
  grossLoss: number; correlation: number; equityCurve: number[]; plainEnglish: string;
}

interface EvolutionEntry { gen: number; bestFitness: number; avgFitness: number; bestTrades: number; }

interface GAResult {
  timestamp: string; environment: string; dataPoints: number; totalSimulations: number;
  gaStats: { populationSize: number; generations: number; mutationRate: number; maxCorrelation: number; totalSimulations: number; finalBestFitness: number; };
  evolutionLog: EvolutionEntry[];
  uncorrelatedProfiles: GAProfile[]; allProfiles: GAProfile[];
  correlationFallback?: boolean;
  config: { pair: string; populationSize: number; generations: number; maxCorrelation: number; candleCount: number; mutationRate: number };
}

type JobPhase = 'idle' | 'initializing' | 'evolving' | 'extracting' | 'complete' | 'error';

// ── Mini Equity Curve ──
function EquityCurve({ curve, height = 60 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return null;
  const w = 300, pad = 4;
  const min = Math.min(...curve), max = Math.max(...curve), range = max - min || 1;
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
      <polygon points={`${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`} fill={`url(#ga-grad-${color.replace('#', '')})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Evolution Chart ──
function EvolutionChart({ log }: { log: EvolutionEntry[] }) {
  if (log.length < 2) return null;
  const w = 400, h = 80, pad = 4;
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

function DNABadges({ dna }: { dna: StrategyDNA }) {
  const sessions = ['Asia', 'London', 'NY', 'NY Close'];
  const dirs = ['LONG', 'SHORT', 'BOTH'];
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/5">Pred ≤{dna.predatorRankMax}</span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/5">Prey ≥{dna.preyRankMin}</span>
      {dna.gate1Required && <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G1</span>}
      {dna.gate2Required && <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G2</span>}
      {dna.gate3Required && <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/5">G3</span>}
      {dna.sessionFilter >= 0 && <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-500/5">{sessions[dna.sessionFilter]}</span>}
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/5">SL {dna.slMultiplier.toFixed(1)}x</span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">TP {dna.tpMultiplier.toFixed(1)}x</span>
      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-slate-500/30 text-slate-400 bg-slate-500/5">{dirs[dna.direction]}</span>
    </div>
  );
}

// ── Main Component ──
export function AlphaDiscoveryEngine({ result }: { result: BacktestResult }) {
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [gaResult, setGaResult] = useState<GAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  // Config
  const [populationSize, setPopulationSize] = useState(50);
  const [generations, setGenerations] = useState(50);
  const [maxCorrelation, setMaxCorrelation] = useState(0.2);
  const [pair, setPair] = useState('EUR_USD');
  const [candleCount, setCandleCount] = useState(5000);
  const [gensPerCall, setGensPerCall] = useState(5);

  // Progress
  const [currentGen, setCurrentGen] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [totalSims, setTotalSims] = useState(0);
  const [evolutionLog, setEvolutionLog] = useState<EvolutionEntry[]>([]);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alpha-discovery-engine`;
  const HEADERS = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };

  const callEngine = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Engine call failed');
    return data;
  }, []);

  const stopPolling = useCallback(() => {
    abortRef.current = true;
    if (pollingRef.current) { clearTimeout(pollingRef.current); pollingRef.current = null; }
  }, []);

  // Phase loop: init → evolve (repeat) → extract
  const runGA = useCallback(async () => {
    setPhase('initializing');
    setError(null);
    setGaResult(null);
    setCurrentGen(0);
    setBestFitness(0);
    setTotalSims(0);
    setEvolutionLog([]);
    abortRef.current = false;

    try {
      // Phase 1: Init
      const initResult = await callEngine({
        action: 'init',
        environment: result.environment,
        pair,
        candles: candleCount,
        populationSize,
        generations,
        maxCorrelation,
        gensPerCall,
      });
      console.log('[GA-UI] Phase 1 complete:', initResult);
      setBestFitness(initResult.bestFitness || 0);

      // Phase 2: Evolve loop — wait for DB write to propagate
      await new Promise(r => setTimeout(r, 1500));
      setPhase('evolving');
      let done = false;
      while (!done && !abortRef.current) {
        const evolveResult = await callEngine({ action: 'evolve' });
        setCurrentGen(evolveResult.currentGen);
        setBestFitness(evolveResult.bestFitness || 0);
        setTotalSims(evolveResult.totalSimulations || 0);
        if (evolveResult.evolutionLog) {
          setEvolutionLog(prev => {
            const newEntries = (evolveResult.evolutionLog as EvolutionEntry[]).filter(
              e => !prev.some(p => p.gen === e.gen)
            );
            return [...prev, ...newEntries];
          });
        }

        if (evolveResult.status === 'extracting') {
          done = true;
        } else {
          // Small delay to avoid hammering
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (abortRef.current) {
        setPhase('idle');
        return;
      }

      // Phase 3: Extract
      setPhase('extracting');
      const extractResult = await callEngine({ action: 'extract' });
      setGaResult(extractResult);
      setPhase('complete');
      console.log('[GA-UI] Evolution complete:', extractResult);

    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  }, [result, pair, candleCount, populationSize, generations, maxCorrelation, gensPerCall, callEngine]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const isRunning = phase === 'initializing' || phase === 'evolving' || phase === 'extracting';
  const progressPct = generations > 0 ? (currentGen / generations) * 100 : 0;

  const PAIRS = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'];

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
            {isRunning && (
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400"
              />
            )}
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Genetic Alpha Discovery Engine
            </h2>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
              Phased State Machine · {generations} Generations · {gensPerCall}/call
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-[8px] font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded animate-pulse">
              {phase === 'initializing' ? 'FETCHING DATA...' :
               phase === 'extracting' ? 'EXTRACTING TOP DNA...' :
               `GEN ${currentGen}/${generations}`}
            </span>
          )}
          {phase === 'complete' && gaResult && (
            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded">
              {gaResult.uncorrelatedProfiles.length} UNCORRELATED · {totalSims.toLocaleString()} SIMS
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4">
              {/* Config Panel */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Pair selector */}
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Pair</label>
                  <select
                    value={pair}
                    onChange={e => setPair(e.target.value)}
                    disabled={isRunning}
                    className="w-full text-[9px] font-mono bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300"
                  >
                    {PAIRS.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
                  </select>
                </div>
                {/* Candles */}
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Candles</label>
                  <div className="flex items-center gap-1.5">
                    {[2000, 5000].map(c => (
                      <button key={c} onClick={() => setCandleCount(c)} disabled={isRunning}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${candleCount === c ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      >{c / 1000}K</button>
                    ))}
                  </div>
                </div>
                {/* Population */}
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Population</label>
                  <div className="flex items-center gap-1.5">
                    {[30, 50, 80, 100].map(ps => (
                      <button key={ps} onClick={() => setPopulationSize(ps)} disabled={isRunning}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${populationSize === ps ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      >{ps}</button>
                    ))}
                  </div>
                </div>
                {/* Generations */}
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Generations</label>
                  <div className="flex items-center gap-1.5">
                    {[30, 50, 80, 100].map(g => (
                      <button key={g} onClick={() => setGenerations(g)} disabled={isRunning}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${generations === g ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      >{g}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Advanced config row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Max Correlation (ρ)</label>
                  <div className="flex items-center gap-1.5">
                    {[0.1, 0.2, 0.3, 0.4].map(mc => (
                      <button key={mc} onClick={() => setMaxCorrelation(mc)} disabled={isRunning}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${maxCorrelation === mc ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      >{mc}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Gens per Call</label>
                  <div className="flex items-center gap-1.5">
                    {[1, 3, 5, 10].map(g => (
                      <button key={g} onClick={() => setGensPerCall(g)} disabled={isRunning}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${gensPerCall === g ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                      >{g}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 flex items-end">
                  <div className="text-[7px] font-mono text-slate-600">
                    Total invocations: ~{Math.ceil(generations / gensPerCall) + 2}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {isRunning && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
                      <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                        {phase === 'initializing' ? 'Phase 1: Fetching & Computing Features...' :
                         phase === 'extracting' ? 'Phase 3: Extracting Top DNA...' :
                         `Phase 2: Evolving (Gen ${currentGen}/${generations})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[8px] font-mono text-slate-500">
                      <span>Best: <span className="text-emerald-400">{bestFitness.toFixed(2)}</span></span>
                      <span>Sims: <span className="text-purple-400">{totalSims.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <div className="relative w-full h-2 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                    <motion.div
                      className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      initial={{ width: '0%' }}
                      animate={{ width: `${phase === 'initializing' ? 5 : phase === 'extracting' ? 95 : progressPct}%` }}
                      transition={{ ease: 'easeOut', duration: 0.3 }}
                    />
                  </div>
                  <button
                    onClick={() => { stopPolling(); setPhase('idle'); }}
                    className="text-[8px] font-mono text-red-400 hover:text-red-300 transition-colors"
                  >
                    ⏹ Cancel
                  </button>
                </div>
              )}

              {/* Live Evolution Chart during evolving */}
              {(phase === 'evolving' || phase === 'extracting') && evolutionLog.length > 1 && (
                <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Live Evolution Curve</span>
                  </div>
                  <EvolutionChart log={evolutionLog} />
                </div>
              )}

              {/* Launch Button */}
              {!isRunning && (
                <button
                  onClick={runGA}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-mono text-xs font-bold uppercase tracking-widest"
                  style={{
                    borderColor: '#10b981aa',
                    background: 'linear-gradient(135deg, #10b98115, #0f172a)',
                    color: '#10b981',
                  }}
                >
                  <Dna className="w-4 h-4" />
                  Launch Phased GA · {pair.replace('_', '/')} · {candleCount / 1000}K Candles · {generations} Gen
                </button>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-[9px] text-red-400 font-mono">{error}</span>
                </div>
              )}

              {/* Results */}
              {gaResult && phase === 'complete' && (
                <div className="space-y-4">
                  {/* Stats Banner */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Data Points', value: gaResult.dataPoints?.toLocaleString() || '—', icon: Activity, color: '#00ffea' },
                      { label: 'Simulations', value: totalSims.toLocaleString(), icon: Cpu, color: '#a855f7' },
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
                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Evolution Fitness Curve</span>
                        </div>
                        <div className="flex items-center gap-3 text-[7px] font-mono">
                          <span className="text-emerald-400">━ Best</span>
                          <span className="text-slate-500">┄ Average</span>
                        </div>
                      </div>
                      <EvolutionChart log={gaResult.evolutionLog} />
                    </div>
                  )}

                  {/* Evolved Strategies — Primary Results */}
                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden">
                    <div className="bg-emerald-950/30 px-4 py-2.5 border-b border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                          {gaResult.correlationFallback
                            ? `Top Evolved Strategies (relaxed ρ ≤ 0.5)`
                            : `Evolved Uncorrelated Strategies (ρ ≤ ${maxCorrelation})`}
                        </span>
                      </div>
                      <span className="text-[7px] text-emerald-500/60 font-mono">
                        Pair: {gaResult.config.pair?.replace('_', '/')}
                      </span>
                    </div>

                    {gaResult.uncorrelatedProfiles.length === 0 ? (
                      <div className="p-8 text-center">
                        <AlertTriangle className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-400 font-mono">No strategies survived extraction. Try increasing generations or population.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/30">
                        {gaResult.uncorrelatedProfiles.map((profile, idx) => (
                          <StrategyCard key={idx} profile={profile} idx={idx} expandedProfile={expandedProfile} setExpandedProfile={setExpandedProfile} maxCorrelation={maxCorrelation} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* All Profiles — Full Leaderboard */}
                  {gaResult.allProfiles.length > 0 && (
                    <div className="border border-purple-500/20 rounded-xl overflow-hidden">
                      <div className="bg-purple-950/20 px-4 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-[9px] font-bold text-purple-300 uppercase tracking-widest">
                            All {gaResult.allProfiles.length} Evolved Strategies — Full Leaderboard
                          </span>
                        </div>
                        <span className="text-[7px] text-purple-500/60 font-mono">
                          Ranked by Fitness Score
                        </span>
                      </div>
                      <div className="divide-y divide-slate-800/30">
                        {gaResult.allProfiles.map((profile, idx) => (
                          <StrategyCard
                            key={`all-${idx}`}
                            profile={profile}
                            idx={idx}
                            expandedProfile={expandedProfile === null ? null : expandedProfile}
                            setExpandedProfile={(v) => setExpandedProfile(v === null ? null : v !== null ? v + 1000 : null)}
                            maxCorrelation={maxCorrelation}
                            offset={1000}
                          />
                        ))}
                      </div>
                    </div>
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

// ── Strategy Card (matches Profile Discovery Engine style) ──
function StrategyCard({ profile, idx, expandedProfile, setExpandedProfile, maxCorrelation, offset = 0 }: {
  profile: GAProfile; idx: number; expandedProfile: number | null;
  setExpandedProfile: (v: number | null) => void; maxCorrelation: number; offset?: number;
}) {
  const cardIdx = idx + offset;
  const isExp = expandedProfile === cardIdx;
  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
  const isPositive = profile.totalPips >= 0;

  return (
    <div className="bg-slate-950/20 hover:bg-slate-900/40 transition-colors">
      <button onClick={() => setExpandedProfile(isExp ? null : cardIdx)} className="w-full px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          <span className="text-lg w-8 text-center shrink-0">{medal}</span>
          <div className="flex-1 min-w-0">
            <DNABadges dna={profile.dna} />
            <div className="text-[8px] font-mono text-slate-500 mt-1 truncate">{profile.plainEnglish}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatCell label="WR" value={`${(profile.winRate * 100).toFixed(1)}%`} color={profile.winRate >= 0.6 ? '#39ff14' : '#00ffea'} />
            <StatCell label="PF" value={profile.profitFactor.toFixed(2)} color={profile.profitFactor > 2 ? '#39ff14' : '#00ffea'} />
            <StatCell label="Pips" value={`${isPositive ? '+' : ''}${profile.totalPips.toFixed(0)}`} color={isPositive ? '#39ff14' : '#ff0055'} />
            <StatCell label="Trades" value={`${profile.trades}`} color="#94a3b8" />
            <StatCell label="ρ" value={profile.correlation.toFixed(3)} color={profile.correlation <= maxCorrelation ? '#10b981' : '#f59e0b'} />
            {isExp ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
          </div>
        </div>
      </button>
      <AnimatePresence>
        {isExp && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              {/* Equity Curve */}
              <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Strategy Equity Curve</span>
                  <span className="text-[8px] font-mono font-bold" style={{ color: isPositive ? '#39ff14' : '#ff0055' }}>
                    {isPositive ? '+' : ''}{profile.totalPips.toFixed(1)} pips
                  </span>
                </div>
                <EquityCurve curve={profile.equityCurve} height={80} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  { label: 'Win Rate', value: `${(profile.winRate * 100).toFixed(1)}%`, color: '#39ff14' },
                  { label: 'Profit Factor', value: profile.profitFactor.toFixed(2), color: '#00ffea' },
                  { label: 'Total Pips', value: `${isPositive ? '+' : ''}${profile.totalPips.toFixed(1)}`, color: isPositive ? '#39ff14' : '#ff0055' },
                  { label: 'Max Drawdown', value: `${(profile.maxDrawdown * 100).toFixed(1)}%`, color: '#ff8800' },
                  { label: 'Fitness Score', value: profile.fitness.toFixed(2), color: '#a855f7' },
                  { label: 'Gross Profit', value: `+${profile.grossProfit.toFixed(0)}`, color: '#39ff14' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-2 text-center">
                    <div className="text-[9px] font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Correlation Bar */}
              <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Correlation to Baseline</span>
                  <span className="text-[7px] font-mono ml-auto" style={{ color: profile.correlation <= maxCorrelation ? '#39ff14' : '#f59e0b' }}>
                    ρ = {profile.correlation.toFixed(3)} {profile.correlation <= maxCorrelation ? '✓ Decorrelated' : '⚠ Correlated'}
                  </span>
                </div>
                <CorrelationBar value={profile.correlation} max={maxCorrelation} />
              </div>

              {/* DNA Blueprint */}
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Dna className="w-3 h-3 text-emerald-400" />
                  <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Strategy DNA Blueprint</span>
                </div>
                <p className="text-[9px] font-mono text-emerald-300 leading-relaxed">{profile.plainEnglish}</p>
                <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                  <div className="text-[7px] font-mono text-slate-500"><span className="text-cyan-400">SL:</span> {profile.dna.slMultiplier.toFixed(2)} × ATR</div>
                  <div className="text-[7px] font-mono text-slate-500"><span className="text-emerald-400">TP:</span> {profile.dna.tpMultiplier.toFixed(2)} × ATR</div>
                  <div className="text-[7px] font-mono text-slate-500"><span className="text-purple-400">Hurst:</span> {profile.dna.hurstMin.toFixed(2)} – {profile.dna.hurstMax.toFixed(2)}</div>
                  <div className="text-[7px] font-mono text-slate-500"><span className="text-yellow-400">R:R:</span> {(profile.dna.tpMultiplier / profile.dna.slMultiplier).toFixed(2)}:1</div>
                </div>
              </div>

              {/* Strategy Intelligence */}
              <div className="bg-cyan-950/10 border border-cyan-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Brain className="w-3 h-3 text-cyan-400" />
                  <span className="text-[7px] font-mono text-cyan-400 uppercase tracking-widest font-bold">Strategy Intelligence</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[8px] font-mono text-slate-400">
                  <div>
                    <span className="text-slate-600">Edge Type: </span>
                    <span className="text-cyan-300">
                      {profile.dna.gate1Required && profile.dna.gate2Required && profile.dna.gate3Required ? 'Triple-Lock Confirmed' :
                       profile.dna.gate2Required ? 'Structural Breakout' :
                       profile.dna.gate3Required ? 'Momentum Drift' : 'Rank Divergence'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600">Risk Profile: </span>
                    <span style={{ color: profile.maxDrawdown < 0.05 ? '#39ff14' : profile.maxDrawdown < 0.15 ? '#f59e0b' : '#ff0055' }}>
                      {profile.maxDrawdown < 0.05 ? 'Conservative' : profile.maxDrawdown < 0.15 ? 'Moderate' : 'Aggressive'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600">Expectancy/Trade: </span>
                    <span className="text-emerald-300">{profile.trades > 0 ? (profile.totalPips / profile.trades).toFixed(1) : '0'} pips</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Gross Loss: </span>
                    <span className="text-red-400">-{profile.grossLoss.toFixed(0)} pips</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[8px] font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[6px] text-slate-600 font-mono">{label}</div>
    </div>
  );
}
