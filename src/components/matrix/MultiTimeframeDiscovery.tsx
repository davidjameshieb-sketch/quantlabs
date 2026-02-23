// Multi-Timeframe Alpha Discovery Engine
// Scans M5/M15/M30 for high-frequency strategies targeting 8+ pips, 50+ trades/day
import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, Cpu, ChevronDown, ChevronUp, Target, Activity, Zap, Loader2,
  CheckCircle2, Sparkles, Globe, Trophy, Clock, BarChart3,
} from 'lucide-react';
import { StrategyActivationButtons } from './StrategyActivationButtons';

interface StrategyDNA {
  erPeriod: number; erMode: number; clvSmooth: number; clvMode: number;
  rangeExpPeriod: number; rangeExpMode: number; consecThreshold: number; consecMode: number;
  volDeltaPeriod: number; volDeltaMode: number; fdPeriod: number; fdMode: number;
  gapMode: number; candleMode: number; volMode: number; sessionFilter: number;
  dayFilter: number; direction: number; slMultiplier: number; tpMultiplier: number;
  hurstMin: number; hurstMax: number; trailingATR: number; maxBarsInTrade: number; partialTP: number;
}

interface GAProfile {
  pair?: string; dna: StrategyDNA; fitness: number; winRate: number; profitFactor: number;
  trades: number; totalPips: number; totalReturn: number; maxDrawdown: number;
  grossProfit: number; grossLoss: number; correlation: number; sharpe?: number;
  equityCurve: number[]; strategyName: string; edgeDescription: string;
  entryRules: string[]; exitRules: string[];
  oosReturn?: number | null; oosTrades?: number | null; oosProfitFactor?: number | null;
  regimeScores?: { trend: number; range: number; shock: number }; bestRegime?: string;
}

interface EvolutionEntry { gen: number; bestFitness: number; avgFitness: number; bestTrades: number; }

interface PairProgress {
  pair: string; status: 'pending' | 'initializing' | 'evolving' | 'extracting' | 'complete' | 'error';
  currentGen: number; totalGen: number; bestFitness: number; error?: string;
}

type JobPhase = 'idle' | 'batch-running' | 'batch-extracting' | 'batch-complete' | 'error';

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
        <linearGradient id={`mtf-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`} fill={`url(#mtf-grad-${color.replace('#', '')})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

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

export function MultiTimeframeDiscovery() {
  const [expanded, setExpanded] = useState(true);
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [batchResult, setBatchResult] = useState<{
    top7: GAProfile[]; totalCandidates: number; pairsProcessed: number;
    regimeDistribution?: any; hedgeBalance?: { longOnly: number; shortOnly: number; bidirectional: number };
    portfolioProjection?: {
      startEquity: number; month1Equity: number; month3Equity: number; month6Equity: number; month12Equity: number;
      maxDrawdown: number; tradesPerDay: number; netPipsPerDay: number; avgPipsPerTrade: number;
      avgWinRate: number; avgProfitFactor: number; equityCurve: number[];
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);
  const [pairProgress, setPairProgress] = useState<PairProgress[]>([]);

  const [granularity, setGranularity] = useState<'M5' | 'M15' | 'M30'>('M5');
  const [generations, setGenerations] = useState(80);
  const [candleCount, setCandleCount] = useState(5000);
  const abortRef = useRef(false);

  const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alpha-discovery-engine`;
  const HEADERS = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };

  const callEngine = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Engine call failed');
    return data;
  }, []);

  const BATCH_PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'EUR_GBP', 'USD_CAD', 'NZD_USD'];

  const runDiscovery = useCallback(async () => {
    setPhase('batch-running'); setError(null); setBatchResult(null); abortRef.current = false;

    const progress: PairProgress[] = BATCH_PAIRS.map(p => ({
      pair: p, status: 'pending', currentGen: 0, totalGen: generations, bestFitness: 0,
    }));
    setPairProgress([...progress]);

    try {
      for (let pIdx = 0; pIdx < BATCH_PAIRS.length; pIdx++) {
        if (abortRef.current) break;
        const p = BATCH_PAIRS[pIdx];

        progress[pIdx].status = 'initializing';
        setPairProgress([...progress]);

        try {
          await callEngine({
            action: 'init', environment: 'live', pair: p,
            candles: candleCount, populationSize: 50, generations,
            maxCorrelation: 999, gensPerCall: 10, unconstrained: true,
            granularity,
          });

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

      setPhase('batch-extracting');
      const batchRes = await callEngine({
        action: 'batch-extract', pairs: BATCH_PAIRS, topN: 10, maxInterCorrelation: 0.4,
      });
      setBatchResult(batchRes);
      setPhase('batch-complete');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  }, [granularity, generations, candleCount, callEngine]);

  const barsPerDay: Record<string, number> = { M5: 288, M15: 96, M30: 48 };
  const dataDays = Math.round(candleCount / (barsPerDay[granularity] || 48));

  const profiles = batchResult?.top7 || [];

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-purple-500/30 rounded-2xl p-5 shadow-2xl">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <h2 className="text-[12px] font-bold tracking-widest text-slate-200 uppercase">
            Multi-Timeframe Alpha Discovery
          </h2>
          <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-purple-500/30 text-purple-300 bg-purple-500/10">
            {granularity} · {BATCH_PAIRS.length} PAIRS · HIGH FREQUENCY
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Timeframe */}
            <div>
              <label className="text-[8px] text-slate-500 uppercase tracking-widest block mb-1">Timeframe</label>
              <div className="flex gap-1">
                {(['M5', 'M15', 'M30'] as const).map(tf => (
                  <button key={tf} onClick={() => setGranularity(tf)}
                    className={`flex-1 text-[10px] font-mono font-bold py-1.5 rounded border transition-all ${
                      granularity === tf
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                        : 'border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Candles */}
            <div>
              <label className="text-[8px] text-slate-500 uppercase tracking-widest block mb-1">Candles ({dataDays}d data)</label>
              <input type="number" value={candleCount} onChange={e => setCandleCount(Math.min(5000, Number(e.target.value) || 5000))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300" />
            </div>

            {/* Generations */}
            <div>
              <label className="text-[8px] text-slate-500 uppercase tracking-widest block mb-1">GA Generations</label>
              <input type="number" value={generations} onChange={e => setGenerations(Number(e.target.value) || 80)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300" />
            </div>

            {/* Target Info */}
            <div>
              <label className="text-[8px] text-slate-500 uppercase tracking-widest block mb-1">Targets</label>
              <div className="text-[8px] font-mono text-yellow-400 space-y-0.5">
                <div>≥ 8 pips/trade (after 1.5p friction)</div>
                <div>≥ 50 trades/day across 7 pairs</div>
                <div>≤ 15% max drawdown</div>
              </div>
            </div>

            {/* Launch */}
            <div className="flex items-end">
              {phase === 'idle' || phase === 'batch-complete' || phase === 'error' ? (
                <button onClick={runDiscovery}
                  className="w-full flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2.5 rounded-lg font-bold uppercase tracking-wider text-slate-950 hover:opacity-90 transition-all"
                  style={{ background: '#a855f7', boxShadow: '0 0 20px rgba(168,85,247,0.4)' }}>
                  <Sparkles className="w-3.5 h-3.5" /> Mine {granularity} Alpha
                </button>
              ) : (
                <button onClick={() => { abortRef.current = true; setPhase('idle'); }}
                  className="w-full flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2.5 rounded-lg font-bold uppercase tracking-wider border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all">
                  <Zap className="w-3.5 h-3.5" /> ABORT
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {phase === 'batch-running' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] text-yellow-400 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mining {granularity} alpha across {BATCH_PAIRS.length} pairs…
              </div>
              <PairProgressGrid pairProgress={pairProgress} />
            </div>
          )}

          {phase === 'batch-extracting' && (
            <div className="flex items-center gap-2 text-[10px] text-purple-400 font-mono animate-pulse">
              <Cpu className="w-3.5 h-3.5 animate-spin" />
              Cross-correlating {BATCH_PAIRS.length} pairs → selecting uncorrelated portfolio…
            </div>
          )}

          {error && (
            <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 font-mono">{error}</div>
          )}

          {/* Results */}
          {profiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">
                    Elite {granularity} Strategies — Top {profiles.length}
                  </span>
                </div>
                <span className="text-[8px] font-mono text-slate-500">
                  {batchResult?.totalCandidates} candidates · {batchResult?.pairsProcessed} pairs
                </span>
              </div>

              {/* Summary Table */}
              <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[850px]">
                  <thead>
                    <tr className="text-[8px] text-slate-500 uppercase tracking-widest">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">Pair</th>
                      <th className="pb-2 pr-2">Strategy</th>
                      <th className="pb-2 pr-2 text-right">Trades</th>
                      <th className="pb-2 pr-2 text-right">Win%</th>
                      <th className="pb-2 pr-2 text-right">PF</th>
                      <th className="pb-2 pr-2 text-right">Pips/Trade</th>
                      <th className="pb-2 pr-2 text-right">Flat Return</th>
                      <th className="pb-2 pr-2 text-right">Compounded</th>
                      <th className="pb-2 pr-2 text-right">Max DD</th>
                      <th className="pb-2 pr-2 text-right">Regime</th>
                      <th className="pb-2 text-center">Equity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/30">
                    {profiles.map((p, i) => {
                      const pipsPerTrade = p.trades > 0 ? Math.round((p.totalPips / p.trades) * 10) / 10 : 0;
                      const tradesPerDay = p.trades > 0 ? Math.round((p.trades / dataDays) * 10) / 10 : 0;
                      // Flat return: totalPips × $0.20/pip on $1,000 base
                      const flatDollarReturn = p.totalPips * 0.20;
                      const flatPctReturn = (flatDollarReturn / 1000) * 100;
                      const meetsTarget = pipsPerTrade >= 8 && p.maxDrawdown <= 0.15;
                      
                      return (
                        <tr key={i} onClick={() => setExpandedProfile(expandedProfile === i ? null : i)}
                          className="cursor-pointer hover:bg-slate-800/20 transition-colors">
                          <td className="py-2 pr-2">
                            <span className="text-[9px] font-mono font-bold" style={{ color: i < 3 ? '#39ff14' : '#f59e0b' }}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-[9px] font-mono font-bold text-white">
                            {(p.pair || 'EUR/USD').replace('_', '/')}
                          </td>
                          <td className="py-2 pr-2">
                            <div className="text-[9px] font-bold text-slate-200 truncate max-w-[200px]">{p.strategyName}</div>
                            <div className="text-[7px] text-slate-500">{tradesPerDay} trades/day</div>
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono text-slate-300">{p.trades}</td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono" style={{ color: p.winRate >= 0.55 ? '#39ff14' : '#f59e0b' }}>
                            {(p.winRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono" style={{ color: p.profitFactor >= 1.5 ? '#39ff14' : p.profitFactor >= 1.2 ? '#f59e0b' : '#ff0055' }}>
                            {p.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono font-bold" style={{ color: pipsPerTrade >= 8 ? '#39ff14' : '#ff0055' }}>
                            {pipsPerTrade >= 0 ? '+' : ''}{pipsPerTrade}
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono font-bold" style={{ color: flatPctReturn >= 50 ? '#39ff14' : flatPctReturn >= 0 ? '#f59e0b' : '#ff0055' }}>
                            {flatPctReturn >= 0 ? '+' : ''}{flatPctReturn.toFixed(1)}%
                            <div className="text-[6px] text-slate-500 font-normal">${(1000 + flatDollarReturn).toFixed(0)}</div>
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono" style={{ color: p.totalReturn >= 100 ? '#39ff14' : '#f59e0b' }}>
                            {p.totalReturn >= 0 ? '+' : ''}{p.totalReturn.toFixed(0)}%
                          </td>
                          <td className="py-2 pr-2 text-right text-[9px] font-mono" style={{ color: p.maxDrawdown <= 0.15 ? '#39ff14' : p.maxDrawdown <= 0.25 ? '#f59e0b' : '#ff0055' }}>
                            {(p.maxDrawdown * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <span className={`text-[7px] font-mono px-1.5 py-0.5 rounded border ${
                              p.bestRegime === 'TREND' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' :
                              p.bestRegime === 'RANGE' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                              'border-red-500/30 text-red-400 bg-red-500/10'
                            }`}>
                              {p.bestRegime || '—'}
                            </span>
                          </td>
                          <td className="py-2 w-20">
                            <EquityCurve curve={p.equityCurve} height={30} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded Profile Detail */}
              {expandedProfile !== null && profiles[expandedProfile] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-slate-950/60 border border-slate-700/30 rounded-xl p-4 space-y-3"
                >
                  {(() => {
                    const p = profiles[expandedProfile];
                    const pipsPerTrade = p.trades > 0 ? (p.totalPips / p.trades) : 0;
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-bold text-white">{p.strategyName}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">{p.edgeDescription}</div>
                          </div>
                          <StrategyActivationButtons
                            strategy={{
                              strategyId: `mtf-${granularity}-${(p.pair || 'EUR_USD')}-${expandedProfile}`,
                              strategyName: p.strategyName,
                              engineSource: 'alpha-discovery',
                              pair: p.pair || 'EUR_USD',
                              dna: p.dna as unknown as Record<string, unknown>,
                              entryRules: p.entryRules,
                              exitRules: p.exitRules,
                              winRate: p.winRate,
                              profitFactor: p.profitFactor,
                              maxDrawdown: p.maxDrawdown,
                              trades: p.trades,
                              totalPips: p.totalPips,
                            }}
                          />
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-5 lg:grid-cols-10 gap-2 text-center">
                          {[
                            { label: 'TRADES', value: p.trades.toString(), color: '#39ff14' },
                            { label: 'WIN RATE', value: `${(p.winRate * 100).toFixed(1)}%`, color: p.winRate >= 0.55 ? '#39ff14' : '#f59e0b' },
                            { label: 'PROFIT FACTOR', value: p.profitFactor.toFixed(2), color: p.profitFactor >= 1.5 ? '#39ff14' : '#f59e0b' },
                            { label: 'PIPS/TRADE', value: `${pipsPerTrade >= 0 ? '+' : ''}${pipsPerTrade.toFixed(1)}`, color: pipsPerTrade >= 8 ? '#39ff14' : '#ff0055' },
                            { label: 'TOTAL RETURN', value: `${p.totalReturn.toFixed(0)}%`, color: p.totalReturn >= 100 ? '#39ff14' : '#f59e0b' },
                            { label: 'FLAT RETURN', value: `${((p.totalPips * 0.20) / 1000 * 100).toFixed(1)}%`, color: (p.totalPips * 0.20 / 1000 * 100) >= 50 ? '#39ff14' : '#f59e0b' },
                            { label: 'FLAT $', value: `$${(1000 + p.totalPips * 0.20).toFixed(0)}`, color: p.totalPips > 0 ? '#39ff14' : '#ff0055' },
                            { label: 'MAX DD', value: `${(p.maxDrawdown * 100).toFixed(1)}%`, color: p.maxDrawdown <= 0.15 ? '#39ff14' : '#ff0055' },
                            { label: 'SHARPE', value: (p.sharpe || 0).toFixed(2), color: (p.sharpe || 0) >= 1 ? '#39ff14' : '#f59e0b' },
                            { label: 'GROSS P/L', value: `${p.grossProfit.toFixed(0)}/${p.grossLoss.toFixed(0)}`, color: '#a855f7' },
                          ].map(m => (
                            <div key={m.label} className="bg-slate-900/50 border border-slate-800/40 rounded-lg p-2">
                              <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
                              <div className="text-[11px] font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Entry/Exit Rules */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-1">Entry Rules</div>
                            {p.entryRules.map((r, i) => (
                              <div key={i} className="text-[8px] text-slate-300 font-mono flex items-start gap-1.5 mb-0.5">
                                <span className="text-purple-400">→</span> {r}
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-1">Exit Rules</div>
                            {p.exitRules.map((r, i) => (
                              <div key={i} className="text-[8px] text-slate-300 font-mono flex items-start gap-1.5 mb-0.5">
                                <span className="text-red-400">←</span> {r}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Equity Curve */}
                        <EquityCurve curve={p.equityCurve} height={100} />
                      </>
                    );
                  })()}
                </motion.div>
              )}
            </div>
          )}

          {/* ── Portfolio Compound Simulator ── */}
          {profiles.length > 0 && batchResult?.portfolioProjection && (
            <div className="bg-slate-950/60 border border-yellow-500/30 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-yellow-400" />
                  <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">
                    Portfolio Compound Simulator — 5% Risk · Full Hedge · 25% DD Ceiling
                  </span>
                </div>
                {batchResult.hedgeBalance && (
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                      {batchResult.hedgeBalance.longOnly}L
                    </span>
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/10">
                      {batchResult.hedgeBalance.shortOnly}S
                    </span>
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/10">
                      {batchResult.hedgeBalance.bidirectional}B
                    </span>
                  </div>
                )}
              </div>

              {/* Key Metrics */}
              {(() => {
                const proj = batchResult.portfolioProjection!;
                const month1Pct = ((proj.month1Equity - 1000) / 1000 * 100);
                const annualPct = ((proj.month12Equity - 1000) / 1000 * 100);
                return (
                  <>
                    <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 text-center">
                      {[
                        { label: 'TRADES/DAY', value: `${proj.tradesPerDay}`, color: proj.tradesPerDay >= 50 ? '#39ff14' : '#f59e0b' },
                        { label: 'NET PIPS/DAY', value: `${proj.netPipsPerDay >= 0 ? '+' : ''}${proj.netPipsPerDay}`, color: proj.netPipsPerDay >= 14 ? '#39ff14' : '#f59e0b' },
                        { label: 'PIPS/TRADE', value: `${proj.avgPipsPerTrade >= 0 ? '+' : ''}${proj.avgPipsPerTrade}`, color: proj.avgPipsPerTrade >= 8 ? '#39ff14' : '#ff0055' },
                        { label: 'WIN RATE', value: `${proj.avgWinRate}%`, color: proj.avgWinRate >= 55 ? '#39ff14' : '#f59e0b' },
                        { label: 'MONTH 1', value: `${month1Pct >= 0 ? '+' : ''}${month1Pct.toFixed(0)}%`, color: month1Pct >= 100 ? '#39ff14' : '#f59e0b' },
                        { label: 'MONTH 1 $', value: `$${proj.month1Equity.toLocaleString()}`, color: '#39ff14' },
                        { label: 'ANNUAL', value: `${annualPct >= 0 ? '+' : ''}${annualPct.toFixed(0)}%`, color: annualPct >= 1000 ? '#39ff14' : '#f59e0b' },
                        { label: 'MAX DD', value: `${proj.maxDrawdown.toFixed(1)}%`, color: proj.maxDrawdown <= 25 ? '#39ff14' : '#ff0055' },
                      ].map(m => (
                        <div key={m.label} className="bg-slate-900/50 border border-slate-800/40 rounded-lg p-2">
                          <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
                          <div className="text-[11px] font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Equity Projection Table */}
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {[
                        { label: 'START', value: '$1,000', sub: 'Day 0' },
                        { label: '1 MONTH', value: `$${proj.month1Equity.toLocaleString()}`, sub: `+${month1Pct.toFixed(0)}%` },
                        { label: '3 MONTHS', value: `$${proj.month3Equity.toLocaleString()}`, sub: `+${((proj.month3Equity - 1000) / 10).toFixed(0)}%` },
                        { label: '6 MONTHS', value: `$${proj.month6Equity.toLocaleString()}`, sub: `+${((proj.month6Equity - 1000) / 10).toFixed(0)}%` },
                        { label: '12 MONTHS', value: `$${proj.month12Equity.toLocaleString()}`, sub: `+${annualPct.toFixed(0)}%` },
                      ].map(m => (
                        <div key={m.label} className="bg-gradient-to-b from-yellow-950/30 to-slate-950 border border-yellow-500/20 rounded-lg p-3">
                          <div className="text-[7px] text-yellow-500/60 uppercase tracking-wider mb-1">{m.label}</div>
                          <div className="text-[13px] font-bold font-mono text-yellow-400">{m.value}</div>
                          <div className="text-[8px] text-slate-500 font-mono mt-0.5">{m.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Projected Equity Curve */}
                    {proj.equityCurve.length > 2 && (
                      <div>
                        <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">12-Month Compound Equity Projection (5% Risk · Full Hedge)</div>
                        <EquityCurve curve={proj.equityCurve} height={120} />
                      </div>
                    )}

                    {/* Hedge Status */}
                    <div className="flex items-center gap-4 text-[8px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${batchResult.hedgeBalance && batchResult.hedgeBalance.longOnly > 0 && batchResult.hedgeBalance.shortOnly > 0 ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className="text-slate-400">
                          {batchResult.hedgeBalance && batchResult.hedgeBalance.longOnly > 0 && batchResult.hedgeBalance.shortOnly > 0
                            ? '✓ STRUCTURALLY HEDGED — Long & Short strategies active'
                            : '⚠ UNHEDGED — Missing directional coverage'}
                        </span>
                      </div>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">DD Ceiling: <span className="text-yellow-400">25%</span></span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">Risk/Trade: <span className="text-yellow-400">5%</span></span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">PF: <span className="text-yellow-400">{proj.avgProfitFactor}</span></span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Idle State */}
          {phase === 'idle' && profiles.length === 0 && (
            <div className="py-8 text-center space-y-2">
              <Brain className="w-10 h-10 mx-auto text-purple-400/40" />
              <p className="text-[10px] text-slate-500 font-mono">
                Select timeframe and hit "Mine Alpha" to discover high-frequency strategies
              </p>
              <p className="text-[8px] text-slate-600 font-mono">
                GA will evolve 50 strategies × {generations} generations × {BATCH_PAIRS.length} pairs = {50 * generations * BATCH_PAIRS.length} simulations
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
