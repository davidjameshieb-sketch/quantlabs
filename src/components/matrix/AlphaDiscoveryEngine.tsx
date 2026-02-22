// Alpha Discovery Engine v5.0 — Multi-Pair Unrestricted Alpha Mining
// Runs GA across multiple pairs simultaneously, then cross-correlates for Top 7

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Cpu, ChevronDown, ChevronUp, AlertTriangle, Target, Activity,
  Layers, Fingerprint, Dna, TrendingUp, BarChart3, Shield, Zap, Crosshair,
  Loader2, CheckCircle2, Clock, Sparkles, Atom, Globe, Trophy,
} from 'lucide-react';
import type { BacktestResult } from '@/hooks/useRankExpectancy';
import { PeriodPerformanceRow } from './TimePeriodBreakdown';
import { OOSValidationPanel, type OOSValidationResult } from './OOSValidationPanel';

interface StrategyDNA {
  rsiPeriod: number; rsiLow: number; rsiHigh: number; rsiMode: number;
  macdFast: number; macdSlow: number; macdSignal: number; macdMode: number;
  bbPeriod: number; bbStdDev: number; bbMode: number;
  emaFast: number; emaSlow: number; emaMode: number;
  adxPeriod: number; adxMode: number;
  stochK: number; stochD: number; stochMode: number;
  cciPeriod: number; cciMode: number;
  donchianPeriod: number; donchianMode: number;
  paMode: number;
  volMode: number; sessionFilter: number; dayFilter: number; direction: number;
  slMultiplier: number; tpMultiplier: number; hurstMin: number; hurstMax: number;
  trailingATR: number; maxBarsInTrade: number; partialTP: number;
}

interface GAProfile {
  pair?: string;
  dna: StrategyDNA; fitness: number; winRate: number; profitFactor: number;
  trades: number; totalPips: number; totalReturn: number; maxDrawdown: number;
  grossProfit: number; grossLoss: number; correlation: number;
  sharpe?: number;
  equityCurve: number[];
  strategyName: string; edgeDescription: string;
  entryRules: string[]; exitRules: string[];
  edgeArchetype?: string;
  oosReturn?: number | null; oosWinRate?: number | null; oosTrades?: number | null;
  oosProfitFactor?: number | null; oosMaxDrawdown?: number | null; oosPips?: number | null;
  isReturn?: number | null; isWinRate?: number | null; isTrades?: number | null;
  isProfitFactor?: number | null; isMaxDrawdown?: number | null; isPips?: number | null;
}

interface EvolutionEntry { gen: number; bestFitness: number; avgFitness: number; bestTrades: number; }

interface GAResult {
  timestamp: string; environment: string; dataPoints: number; totalSimulations: number;
  gaStats: { populationSize: number; generations: number; mutationRate: number; maxCorrelation: number; totalSimulations: number; finalBestFitness: number; };
  evolutionLog: EvolutionEntry[];
  uncorrelatedProfiles: GAProfile[]; allProfiles: GAProfile[];
  correlationFallback?: boolean;
  dateRange?: { start: string; end: string };
  config: { pair: string; populationSize: number; generations: number; maxCorrelation: number; candleCount: number; mutationRate: number };
}

interface BatchResult {
  totalCandidates: number; pairsProcessed: number; selected: number;
  pairDistribution: Record<string, number>;
  top7: GAProfile[]; allCandidates: GAProfile[];
}

interface PairProgress {
  pair: string; status: 'pending' | 'initializing' | 'evolving' | 'extracting' | 'complete' | 'error';
  currentGen: number; totalGen: number; bestFitness: number; error?: string;
}

type JobPhase = 'idle' | 'initializing' | 'evolving' | 'extracting' | 'complete' | 'error' | 'batch-running' | 'batch-extracting' | 'batch-complete';

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

// ── Indicator DNA Badges ──
function IndicatorBadges({ dna }: { dna: StrategyDNA }) {
  const badges: { label: string; color: string; bg: string }[] = [];
  const rsiModes = ['', 'Oversold Buy', 'Overbought Sell', 'Midline Cross'];
  const macdModes = ['', 'Signal Cross', 'Zero Cross', 'Histogram'];
  const bbModes = ['', 'Squeeze Break', 'Mean Revert', 'Band Walk'];
  const emaModes = ['', 'Crossover', 'Price Above', 'Slope Filter'];
  const adxModes = ['', 'Trend >25', 'Range <20', 'ADX Rising'];
  const stochModes = ['', 'Oversold Buy', 'Overbought Sell', 'K/D Cross'];
  const cciModes = ['', 'Breakout >100', 'Reversal <-100', 'Zero Cross'];
  const donchModes = ['', 'High Breakout', 'Midline', 'Fade Extremes'];
  const paModes = ['', 'Inside Bar', 'Engulfing', 'Pin Bar'];
  const volModes = ['', 'HiVol', 'LoVol', 'Vol Expansion'];
  const dirs = ['LONG', 'SHORT', 'BOTH'];
  const sessions = ['Asia', 'London', 'NY', 'NYClose'];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  if (dna.rsiMode > 0) badges.push({ label: `RSI(${dna.rsiPeriod}) ${rsiModes[dna.rsiMode]}`, color: 'text-orange-400', bg: 'border-orange-500/30 bg-orange-500/5' });
  if (dna.macdMode > 0) badges.push({ label: `MACD(${dna.macdFast},${dna.macdSlow}) ${macdModes[dna.macdMode]}`, color: 'text-blue-400', bg: 'border-blue-500/30 bg-blue-500/5' });
  if (dna.bbMode > 0) badges.push({ label: `BB(${dna.bbPeriod},${dna.bbStdDev}σ) ${bbModes[dna.bbMode]}`, color: 'text-purple-400', bg: 'border-purple-500/30 bg-purple-500/5' });
  if (dna.emaMode > 0) badges.push({ label: `EMA(${dna.emaFast}/${dna.emaSlow}) ${emaModes[dna.emaMode]}`, color: 'text-cyan-400', bg: 'border-cyan-500/30 bg-cyan-500/5' });
  // New indicator badges
  if (dna.adxMode > 0) badges.push({ label: `ADX(${dna.adxPeriod}) ${adxModes[dna.adxMode]}`, color: 'text-rose-400', bg: 'border-rose-500/30 bg-rose-500/5' });
  if (dna.stochMode > 0) badges.push({ label: `Stoch(${dna.stochK},${dna.stochD}) ${stochModes[dna.stochMode]}`, color: 'text-amber-400', bg: 'border-amber-500/30 bg-amber-500/5' });
  if (dna.cciMode > 0) badges.push({ label: `CCI(${dna.cciPeriod}) ${cciModes[dna.cciMode]}`, color: 'text-lime-400', bg: 'border-lime-500/30 bg-lime-500/5' });
  if (dna.donchianMode > 0) badges.push({ label: `Donch(${dna.donchianPeriod}) ${donchModes[dna.donchianMode]}`, color: 'text-sky-400', bg: 'border-sky-500/30 bg-sky-500/5' });
  if (dna.paMode > 0) badges.push({ label: `${paModes[dna.paMode]}`, color: 'text-fuchsia-400', bg: 'border-fuchsia-500/30 bg-fuchsia-500/5' });
  // Filters
  if (dna.volMode > 0) badges.push({ label: volModes[dna.volMode], color: 'text-yellow-400', bg: 'border-yellow-500/30 bg-yellow-500/5' });
  if (dna.sessionFilter >= 0) badges.push({ label: sessions[dna.sessionFilter], color: 'text-pink-400', bg: 'border-pink-500/30 bg-pink-500/5' });
  if (dna.dayFilter >= 0) badges.push({ label: days[dna.dayFilter], color: 'text-teal-400', bg: 'border-teal-500/30 bg-teal-500/5' });
  badges.push({ label: dirs[dna.direction], color: dna.direction === 0 ? 'text-emerald-400' : dna.direction === 1 ? 'text-red-400' : 'text-slate-400', bg: dna.direction === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : dna.direction === 1 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-500/30 bg-slate-500/5' });
  // Advanced exit badges
  if (dna.trailingATR > 0) badges.push({ label: `Trail ${dna.trailingATR.toFixed(1)}ATR`, color: 'text-indigo-400', bg: 'border-indigo-500/30 bg-indigo-500/5' });
  if (dna.maxBarsInTrade > 0) badges.push({ label: `TimeCut ${Math.round(dna.maxBarsInTrade)}b`, color: 'text-stone-400', bg: 'border-stone-500/30 bg-stone-500/5' });
  if (dna.partialTP > 0) badges.push({ label: dna.partialTP === 1 ? '50% PartialTP' : '33% PartialTP', color: 'text-violet-400', bg: 'border-violet-500/30 bg-violet-500/5' });

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={`text-[7px] font-mono px-1.5 py-0.5 rounded border ${b.color} ${b.bg}`}>{b.label}</span>
      ))}
    </div>
  );
}

// ── Pair Progress Tracker ──
function PairProgressGrid({ pairProgress }: { pairProgress: PairProgress[] }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-7 gap-1.5">
      {pairProgress.map(pp => {
        const statusColor = pp.status === 'complete' ? '#39ff14' : pp.status === 'error' ? '#ff0055' : pp.status === 'pending' ? '#475569' : '#f59e0b';
        const pct = pp.totalGen > 0 ? (pp.currentGen / pp.totalGen) * 100 : 0;
        return (
          <div key={pp.pair} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2 text-center">
            <div className="text-[8px] font-mono font-bold text-slate-300 mb-1">{pp.pair.replace('_', '/')}</div>
            <div className="relative w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mb-1">
              <div className="absolute top-0 left-0 h-full rounded-full transition-all" style={{ width: `${pp.status === 'complete' ? 100 : pct}%`, backgroundColor: statusColor }} />
            </div>
            <div className="text-[6px] font-mono" style={{ color: statusColor }}>
              {pp.status === 'complete' ? '✓ DONE' : pp.status === 'error' ? '✗ ERR' : pp.status === 'pending' ? 'QUEUED' : `${pp.currentGen}/${pp.totalGen}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──
export function AlphaDiscoveryEngine({ result }: { result: BacktestResult }) {
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [gaResult, setGaResult] = useState<GAResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  const [populationSize, setPopulationSize] = useState(50);
  const [generations, setGenerations] = useState(50);
  const [maxCorrelation, setMaxCorrelation] = useState(0.2);
  const [pair, setPair] = useState('EUR_USD');
  const [candleCount, setCandleCount] = useState(5000);
  const [gensPerCall, setGensPerCall] = useState(5);
  const [unconstrained, setUnconstrained] = useState(false);

  const [currentGen, setCurrentGen] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [totalSims, setTotalSims] = useState(0);
  const [evolutionLog, setEvolutionLog] = useState<EvolutionEntry[]>([]);
  const [pairProgress, setPairProgress] = useState<PairProgress[]>([]);
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

  // ── Single Pair GA Run ──
  const runGA = useCallback(async () => {
    setPhase('initializing'); setError(null); setGaResult(null); setBatchResult(null);
    setCurrentGen(0); setBestFitness(0); setTotalSims(0); setEvolutionLog([]); abortRef.current = false;

    try {
      const initResult = await callEngine({
        action: 'init', environment: result.environment, pair,
        candles: candleCount, populationSize, generations,
        maxCorrelation: unconstrained ? 999 : maxCorrelation,
        gensPerCall, unconstrained,
      });
      setBestFitness(initResult.bestFitness || 0);

      await new Promise(r => setTimeout(r, 1500));
      setPhase('evolving');
      let done = false;
      while (!done && !abortRef.current) {
        const evolveResult = await callEngine({ action: 'evolve', pair });
        setCurrentGen(evolveResult.currentGen);
        setBestFitness(evolveResult.bestFitness || 0);
        setTotalSims(evolveResult.totalSimulations || 0);
        if (evolveResult.evolutionLog) {
          setEvolutionLog(prev => {
            const newEntries = (evolveResult.evolutionLog as EvolutionEntry[]).filter(e => !prev.some(p => p.gen === e.gen));
            return [...prev, ...newEntries];
          });
        }
        if (evolveResult.status === 'extracting') { done = true; } else { await new Promise(r => setTimeout(r, 500)); }
      }
      if (abortRef.current) { setPhase('idle'); return; }

      setPhase('extracting');
      const extractResult = await callEngine({ action: 'extract', pair });
      setGaResult(extractResult);
      setPhase('complete');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  }, [result, pair, candleCount, populationSize, generations, maxCorrelation, gensPerCall, unconstrained, callEngine]);

  // ── Multi-Pair Batch Run ──
  const BATCH_PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'EUR_GBP', 'USD_CAD', 'NZD_USD'];

  const runBatchGA = useCallback(async () => {
    setPhase('batch-running'); setError(null); setGaResult(null); setBatchResult(null);
    abortRef.current = false;

    const progress: PairProgress[] = BATCH_PAIRS.map(p => ({
      pair: p, status: 'pending', currentGen: 0, totalGen: generations, bestFitness: 0,
    }));
    setPairProgress([...progress]);

    try {
      // Run each pair sequentially (state machine constraint)
      for (let pIdx = 0; pIdx < BATCH_PAIRS.length; pIdx++) {
        if (abortRef.current) break;
        const p = BATCH_PAIRS[pIdx];

        // Init
        progress[pIdx].status = 'initializing';
        setPairProgress([...progress]);

        try {
          await callEngine({
            action: 'init', environment: result.environment, pair: p,
            candles: candleCount, populationSize, generations,
            maxCorrelation: 999, gensPerCall: 10, unconstrained: true,
          });

          // Evolve
          progress[pIdx].status = 'evolving';
          setPairProgress([...progress]);

          let done = false;
          while (!done && !abortRef.current) {
            const ev = await callEngine({ action: 'evolve', pair: p });
            progress[pIdx].currentGen = ev.currentGen;
            progress[pIdx].bestFitness = ev.bestFitness || 0;
            setPairProgress([...progress]);
            if (ev.status === 'extracting') done = true;
            else await new Promise(r => setTimeout(r, 300));
          }

          // Extract per-pair
          progress[pIdx].status = 'extracting';
          setPairProgress([...progress]);
          await callEngine({ action: 'extract', pair: p });

          progress[pIdx].status = 'complete';
          setPairProgress([...progress]);
        } catch (pairErr) {
          progress[pIdx].status = 'error';
          progress[pIdx].error = (pairErr as Error).message;
          setPairProgress([...progress]);
        }
      }

      if (abortRef.current) { setPhase('idle'); return; }

      // Cross-pair batch extract for Top 7
      setPhase('batch-extracting');
      const completedPairs = progress.filter(p => p.status === 'complete').map(p => p.pair);
      if (completedPairs.length === 0) throw new Error('No pairs completed successfully');

      const batchData = await callEngine({
        action: 'batch-extract', pairs: completedPairs, topN: 7, maxInterCorrelation: 0.4,
      });
      setBatchResult(batchData);
      setPhase('batch-complete');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  }, [result, candleCount, populationSize, generations, callEngine]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const isRunning = phase === 'initializing' || phase === 'evolving' || phase === 'extracting' || phase === 'batch-running' || phase === 'batch-extracting';
  const progressPct = generations > 0 ? (currentGen / generations) * 100 : 0;

  const PAIRS = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'];

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Atom className="w-5 h-5 text-emerald-400" />
            {isRunning && (
              <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Unrestricted Alpha Mining Engine</h2>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">RSI · MACD · Bollinger · EMA · Volume · Session · Day-of-Week · {generations} Gen</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-[8px] font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded animate-pulse">
              {phase === 'batch-running' ? `BATCH: ${pairProgress.filter(p => p.status === 'complete').length}/${BATCH_PAIRS.length} PAIRS` :
               phase === 'batch-extracting' ? 'CROSS-PAIR EXTRACTION...' :
               phase === 'initializing' ? 'BUILDING INDICATORS...' : phase === 'extracting' ? 'EXTRACTING ALPHA...' : `GEN ${currentGen}/${generations}`}
            </span>
          )}
          {(phase === 'complete' && gaResult) && (
            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded">
              {gaResult.uncorrelatedProfiles.length} STRATEGIES · {totalSims.toLocaleString()} SIMS
            </span>
          )}
          {phase === 'batch-complete' && batchResult && (
            <span className="text-[8px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">
              🏆 TOP {batchResult.selected} · {batchResult.pairsProcessed} PAIRS · {batchResult.totalCandidates} CANDIDATES
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
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Pair (Single)</label>
                  <select value={pair} onChange={e => setPair(e.target.value)} disabled={isRunning} className="w-full text-[9px] font-mono bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300">
                    {PAIRS.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
                  </select>
                </div>
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

              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Search Mode</label>
                  <button onClick={() => setUnconstrained(!unconstrained)} disabled={isRunning}
                    className={`w-full text-[9px] font-mono font-bold px-2 py-1.5 rounded border transition-all ${
                      unconstrained ? 'bg-red-500/15 border-red-400/50 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]' : 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                    }`}>
                    {unconstrained ? '🔓 UNCONSTRAINED' : '🔒 FILTERED (ρ ≤ ' + maxCorrelation + ')'}
                  </button>
                </div>

                {!unconstrained && (
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
                )}

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
                    Invocations: ~{Math.ceil(generations / gensPerCall) + 2} · {unconstrained ? 'UNCONSTRAINED' : 'Filtered'}
                  </div>
                </div>
              </div>

              {/* Batch Progress */}
              {(phase === 'batch-running' || phase === 'batch-extracting') && pairProgress.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3 h-3 text-amber-400 animate-pulse" />
                      <span className="text-[9px] font-mono text-amber-400 uppercase tracking-widest font-bold">
                        {phase === 'batch-extracting' ? 'Cross-Pair Correlation Analysis...' : `Multi-Pair Discovery: ${pairProgress.filter(p => p.status === 'complete').length}/${BATCH_PAIRS.length} Complete`}
                      </span>
                    </div>
                    <button onClick={() => { stopPolling(); setPhase('idle'); }} className="text-[8px] font-mono text-red-400 hover:text-red-300">⏹ Cancel</button>
                  </div>
                  <PairProgressGrid pairProgress={pairProgress} />
                </div>
              )}

              {/* Single-pair Progress */}
              {(phase === 'initializing' || phase === 'evolving' || phase === 'extracting') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
                      <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                        {phase === 'initializing' ? 'Phase 1: Building RSI · MACD · BB · EMA Library...' :
                         phase === 'extracting' ? 'Phase 3: Mining Top Alpha Strategies...' :
                         `Phase 2: Evolving (Gen ${currentGen}/${generations})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[8px] font-mono text-slate-500">
                      <span>Best: <span className="text-emerald-400">{bestFitness.toFixed(2)}</span></span>
                      <span>Sims: <span className="text-purple-400">{totalSims.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <div className="relative w-full h-2 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                    <motion.div className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      initial={{ width: '0%' }} animate={{ width: `${phase === 'initializing' ? 5 : phase === 'extracting' ? 95 : progressPct}%` }}
                      transition={{ ease: 'easeOut', duration: 0.3 }}
                    />
                  </div>
                  <button onClick={() => { stopPolling(); setPhase('idle'); }} className="text-[8px] font-mono text-red-400 hover:text-red-300 transition-colors">⏹ Cancel</button>
                </div>
              )}

              {/* Live Evolution Chart */}
              {(phase === 'evolving' || phase === 'extracting') && evolutionLog.length > 1 && (
                <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Live Evolution Curve</span>
                  </div>
                  <EvolutionChart log={evolutionLog} />
                </div>
              )}

              {/* Launch Buttons */}
              {!isRunning && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={runGA}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-mono text-xs font-bold uppercase tracking-widest"
                    style={{ borderColor: '#10b981aa', background: 'linear-gradient(135deg, #10b98115, #0f172a)', color: '#10b981' }}
                  >
                    <Atom className="w-4 h-4" />
                    Mine {pair.replace('_', '/')} · {generations} Gen
                  </button>
                  <button onClick={runBatchGA}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-mono text-xs font-bold uppercase tracking-widest"
                    style={{ borderColor: '#f59e0baa', background: 'linear-gradient(135deg, #f59e0b15, #0f172a)', color: '#f59e0b' }}
                  >
                    <Globe className="w-4 h-4" />
                    🏆 Run All 7 Pairs → Top 7
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-[9px] text-red-400 font-mono">{error}</span>
                </div>
              )}

              {/* ═══ BATCH RESULTS: Top 7 Cross-Pair Uncorrelated Strategies ═══ */}
              {phase === 'batch-complete' && batchResult && (
                <div className="space-y-4">
                  {/* Batch Stats */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3 text-center">
                      <Trophy className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                      <div className="text-[12px] font-bold font-mono text-amber-400">{batchResult.selected}</div>
                      <div className="text-[6px] text-amber-500/60 font-mono uppercase">Selected Strategies</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                      <Globe className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                      <div className="text-[12px] font-bold font-mono text-cyan-400">{batchResult.pairsProcessed}</div>
                      <div className="text-[6px] text-slate-500 font-mono uppercase">Pairs Analyzed</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                      <Cpu className="w-4 h-4 mx-auto mb-1 text-purple-400" />
                      <div className="text-[12px] font-bold font-mono text-purple-400">{batchResult.totalCandidates}</div>
                      <div className="text-[6px] text-slate-500 font-mono uppercase">Total Candidates</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                      <Shield className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                      <div className="text-[12px] font-bold font-mono text-emerald-400">ρ ≤ 0.4</div>
                      <div className="text-[6px] text-slate-500 font-mono uppercase">Max Inter-Correlation</div>
                    </div>
                  </div>

                  {/* Pair Distribution */}
                  <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3">
                    <div className="text-[7px] font-mono text-slate-500 uppercase tracking-widest mb-2">Pair Distribution</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(batchResult.pairDistribution).map(([p, count]) => (
                        <span key={p} className="text-[8px] font-mono px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          {p.replace('_', '/')} × {count}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top 7 Strategy Cards */}
                  <div className="border border-amber-500/30 rounded-xl overflow-hidden">
                    <div className="bg-amber-950/30 px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                          🏆 Top {batchResult.selected} Cross-Pair Uncorrelated Strategies
                        </span>
                      </div>
                      <span className="text-[7px] text-amber-500/60 font-mono">Ready for Execution</span>
                    </div>
                    <div className="divide-y divide-slate-800/30">
                      {batchResult.top7.map((profile, idx) => (
                        <StrategyCard key={idx} profile={profile} idx={idx} expandedProfile={expandedProfile}
                          setExpandedProfile={setExpandedProfile} maxCorrelation={0.4} showPair />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ SINGLE PAIR RESULTS ═══ */}
              {gaResult && phase === 'complete' && (
                <div className="space-y-4">
                  {gaResult.dateRange?.start && (
                    <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 flex items-center justify-center gap-3">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span className="text-[9px] font-mono text-slate-400">
                        Backtest Period: <span className="text-cyan-400 font-bold">{new Date(gaResult.dateRange.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        <span className="text-slate-600 mx-1.5">→</span>
                        <span className="text-cyan-400 font-bold">{new Date(gaResult.dateRange.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Data Points', value: gaResult.dataPoints?.toLocaleString() || '—', icon: Activity, color: '#00ffea' },
                      { label: 'Simulations', value: totalSims.toLocaleString(), icon: Cpu, color: '#a855f7' },
                      { label: 'Best Fitness', value: gaResult.gaStats.finalBestFitness.toFixed(2), icon: Target, color: '#39ff14' },
                      { label: 'Generations', value: gaResult.gaStats.generations, icon: Dna, color: '#ff8800' },
                      { label: 'Strategies', value: gaResult.uncorrelatedProfiles.length, icon: Sparkles, color: '#10b981' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                        <stat.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: stat.color }} />
                        <div className="text-[10px] font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
                        <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>

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

                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden">
                    <div className="bg-emerald-950/30 px-4 py-2.5 border-b border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                          {unconstrained ? `Mined Alpha Strategies (UNCONSTRAINED)` : gaResult.correlationFallback ? `Mined Alpha Strategies (relaxed ρ ≤ 0.5)` : `Mined Alpha Strategies (ρ ≤ ${maxCorrelation})`}
                        </span>
                      </div>
                      <span className="text-[7px] text-emerald-500/60 font-mono">{gaResult.config.pair?.replace('_', '/')}</span>
                    </div>
                    {gaResult.uncorrelatedProfiles.length === 0 ? (
                      <div className="p-8 text-center">
                        <AlertTriangle className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-400 font-mono">No strategies survived extraction.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/30">
                        {gaResult.uncorrelatedProfiles.map((profile, idx) => (
                          <StrategyCard key={idx} profile={profile} idx={idx} expandedProfile={expandedProfile} setExpandedProfile={setExpandedProfile} maxCorrelation={maxCorrelation} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Strategy Card ──
function StrategyCard({ profile, idx, expandedProfile, setExpandedProfile, maxCorrelation, offset = 0, dateRange, showPair = false }: {
  profile: GAProfile; idx: number; expandedProfile: number | null;
  setExpandedProfile: (v: number | null) => void; maxCorrelation: number; offset?: number;
  dateRange?: { start: string; end: string }; showPair?: boolean;
}) {
  const cardIdx = idx + offset;
  const isExp = expandedProfile === cardIdx;
  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
  const isPositive = (profile.totalReturn ?? profile.totalPips) >= 0;

  return (
    <div className="bg-slate-950/20 hover:bg-slate-900/40 transition-colors">
      <button onClick={() => setExpandedProfile(isExp ? null : cardIdx)} className="w-full px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          <span className="text-lg w-8 text-center shrink-0">{medal}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {showPair && profile.pair && (
                <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
                  {profile.pair.replace('_', '/')}
                </span>
              )}
              <div className="text-[10px] font-bold text-slate-200">{profile.strategyName || 'Unnamed Strategy'}</div>
              {profile.edgeArchetype && (
                <span className="text-[6px] font-mono px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 uppercase tracking-wider">
                  {profile.edgeArchetype}
                </span>
              )}
            </div>
            <IndicatorBadges dna={profile.dna} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isExp ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
          </div>
        </div>
        {/* Stats Row — 8 KPIs */}
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5 mt-2.5">
          <StatBox label="Total Return" value={formatReturn(profile.totalReturn ?? 0)} color={isPositive ? '#39ff14' : '#ff0055'} />
          <StatBox label="Win Rate" value={`${(profile.winRate * 100).toFixed(1)}%`} color={profile.winRate >= 0.6 ? '#39ff14' : '#00ffea'} />
          <StatBox label="Profit Factor" value={profile.profitFactor.toFixed(2)} color={profile.profitFactor > 2 ? '#39ff14' : '#00ffea'} />
          <StatBox label="Sharpe Ratio" value={`${(profile.sharpe ?? 0).toFixed(2)}`} color={(profile.sharpe ?? 0) > 1.5 ? '#39ff14' : (profile.sharpe ?? 0) > 0.5 ? '#00ffea' : '#ff0055'} />
          <StatBox label="Max Drawdown" value={`-${((profile.maxDrawdown ?? 0) * 100).toFixed(1)}%`} color={(profile.maxDrawdown ?? 0) < 0.1 ? '#00ffea' : '#ff0055'} />
          <StatBox label="Net Pips" value={`${profile.totalPips >= 0 ? '+' : ''}${Math.round(profile.totalPips)}`} color={profile.totalPips >= 0 ? '#39ff14' : '#ff0055'} />
          <StatBox label="Final Equity" value={formatEquity(profile.equityCurve?.length ? profile.equityCurve[profile.equityCurve.length - 1] : 1000)} color={
            (profile.equityCurve?.length ? profile.equityCurve[profile.equityCurve.length - 1] : 1000) >= 1000 ? '#39ff14' : '#ff0055'
          } />
          <StatBox label="OOS Return" value={profile.oosReturn != null ? formatReturn(profile.oosReturn) : '—'} color={
            profile.oosReturn != null ? (profile.oosReturn >= 0 ? '#39ff14' : '#ff0055') : '#475569'
          } />
        </div>
      </button>
      <AnimatePresence>
        {isExp && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">The Mathematical Edge</span>
                </div>
                <p className="text-[9px] font-mono text-emerald-300 leading-relaxed">{profile.edgeDescription || 'Pure filter strategy'}</p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Strategy Equity Curve</span>
                  <span className="text-[8px] font-mono font-bold" style={{ color: isPositive ? '#39ff14' : '#ff0055' }}>
                    {formatReturn(profile.totalReturn ?? 0)} return
                  </span>
                </div>
                <EquityCurve curve={profile.equityCurve} height={80} />
                <PeriodPerformanceRow equityCurve={profile.equityCurve} dateRange={dateRange} />
              </div>

              <div className="bg-blue-950/20 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Crosshair className="w-3 h-3 text-blue-400" />
                  <span className="text-[7px] font-mono text-blue-400 uppercase tracking-widest font-bold">Entry Rules</span>
                </div>
                <div className="space-y-1">
                  {(profile.entryRules || []).map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-[8px] font-mono text-blue-300">
                      <span className="text-blue-500 mt-0.5">▸</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Shield className="w-3 h-3 text-purple-400" />
                  <span className="text-[7px] font-mono text-purple-400 uppercase tracking-widest font-bold">Exit Rules</span>
                </div>
                <div className="space-y-1">
                  {(profile.exitRules || []).map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-[8px] font-mono text-purple-300">
                      <span className="text-purple-500 mt-0.5">▸</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── OOS Validation — The Lie Detector ── */}
              {profile.isReturn != null && profile.oosReturn != null && (() => {
                const oosValidation: OOSValidationResult = {
                  is: {
                    winRate: Math.round((profile.isWinRate ?? 0) * 100 * 10) / 10,
                    profitFactor: profile.isProfitFactor ?? 0,
                    maxDrawdown: Math.round((profile.isMaxDrawdown ?? 0) * 100 * 10) / 10,
                    totalReturn: profile.isReturn ?? 0,
                    trades: profile.isTrades ?? 0,
                    netPips: profile.isPips ?? 0,
                  },
                  oos: {
                    winRate: Math.round((profile.oosWinRate ?? 0) * 100 * 10) / 10,
                    profitFactor: profile.oosProfitFactor ?? 0,
                    maxDrawdown: Math.round((profile.oosMaxDrawdown ?? 0) * 100 * 10) / 10,
                    totalReturn: profile.oosReturn ?? 0,
                    trades: profile.oosTrades ?? 0,
                    netPips: profile.oosPips ?? 0,
                  },
                  passed: (profile.oosProfitFactor ?? 0) >= 1.2 &&
                    ((profile.isMaxDrawdown ?? 0) < 0.001 || (profile.oosMaxDrawdown ?? 0) <= (profile.isMaxDrawdown ?? 0) * 2),
                  failReasons: [],
                  degradation: {
                    wrDelta: Math.round(((profile.oosWinRate ?? 0) - (profile.isWinRate ?? 0)) * 100 * 10) / 10,
                    pfDelta: (profile.isProfitFactor ?? 1) > 0 ? Math.round(((profile.oosProfitFactor ?? 0) - (profile.isProfitFactor ?? 0)) / (profile.isProfitFactor ?? 1) * 100 * 10) / 10 : 0,
                    ddRatio: (profile.isMaxDrawdown ?? 0) > 0.001 ? Math.round((profile.oosMaxDrawdown ?? 0) / (profile.isMaxDrawdown ?? 1) * 100) / 100 : 1,
                    returnDelta: (profile.isReturn ?? 0) !== 0 ? Math.round(((profile.oosReturn ?? 0) - (profile.isReturn ?? 0)) / Math.abs(profile.isReturn ?? 1) * 100 * 10) / 10 : 0,
                  },
                };
                if ((profile.oosProfitFactor ?? 0) < 1.2) oosValidation.failReasons.push(`OOS PF ${profile.oosProfitFactor} < 1.2`);
                if ((profile.isMaxDrawdown ?? 0) > 0.001 && (profile.oosMaxDrawdown ?? 0) > (profile.isMaxDrawdown ?? 0) * 2) {
                  oosValidation.failReasons.push(`OOS DD > 2× IS DD`);
                }
                return <OOSValidationPanel validation={oosValidation} />;
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3">
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest block mb-1.5">Baseline Correlation (ρ)</span>
                  <CorrelationBar value={profile.correlation} max={maxCorrelation} />
                  <div className="flex justify-between mt-1 text-[7px] font-mono">
                    <span style={{ color: profile.correlation <= maxCorrelation ? '#39ff14' : '#ff0055' }}>ρ = {profile.correlation.toFixed(3)}</span>
                    <span className="text-slate-600">max: {maxCorrelation}</span>
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/40 rounded-lg p-3 space-y-1.5">
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest block">Details</span>
                  <div className="text-[8px] font-mono text-slate-400">Trades: <span className="text-slate-200 font-bold">{profile.trades}</span></div>
                  <div className="text-[8px] font-mono text-slate-400">Gross P/L: <span className="text-emerald-400">+{profile.grossProfit.toFixed(1)}</span> / <span className="text-red-400">-{profile.grossLoss.toFixed(1)}</span></div>
                  <div className="text-[8px] font-mono text-slate-400">R:R: <span className="text-cyan-400">{profile.dna.slMultiplier.toFixed(1)}:{profile.dna.tpMultiplier.toFixed(1)}</span></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatReturn(val: number): string {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T%`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B%`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M%`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}K%`;
  return `${sign}${abs.toFixed(1)}%`;
}

function formatEquity(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e4) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-slate-950/50 border border-slate-800/30 rounded-md p-1.5 text-center">
      <div className="text-[9px] font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[5px] text-slate-600 font-mono uppercase">{label}</div>
    </div>
  );
}

// PeriodPerformanceRow imported from ./TimePeriodBreakdown