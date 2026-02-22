// Ensemble Meta-Portfolio Engine — Omni-Dashboard
// Ingests Alpha Discovery strategies, decorrelates, weights by inverse vol,
// routes by regime, and displays synthesized portfolio

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  TrendingUp, Shield, Zap, Activity, PieChart, Brain, Target,
  CheckCircle2, XCircle,
} from 'lucide-react';

interface GAProfile {
  pair?: string;
  fitness: number; winRate: number; profitFactor: number;
  trades: number; totalPips: number; totalReturn: number; maxDrawdown: number;
  sharpe?: number;
  equityCurve: number[];
  strategyName: string; edgeDescription: string;
  edgeArchetype?: string;
  regimeScores?: { trend: number; range: number; shock: number };
  bestRegime?: string;
}

interface PortfolioMember {
  id: string; name: string; pair?: string;
  weight: number; regimeWeight: number;
  sharpe: number; maxDrawdown: number; volatility: number;
  normalizedCurve: number[];
  bestRegime?: string; edgeArchetype?: string;
  winRate: number; profitFactor: number; trades: number;
  totalPips: number; totalReturn: number;
  rejected: boolean; rejectionReason?: string;
}

interface CorrelationEntry { stratA: string; stratB: string; correlation: number; }

interface PortfolioResult {
  members: PortfolioMember[];
  synthesizedCurve: number[];
  metrics: { totalReturn: number; maxDrawdown: number; sharpe: number; volatility: number };
  correlationMatrix: CorrelationEntry[];
  regime: string;
  regimeLabel: string;
  acceptedCount: number;
  rejectedCount: number;
  totalStrategies: number;
}

type Regime = 'trend' | 'range' | 'shock';

// ── Mini Equity Curve SVG ──
function PortfolioCurve({ curve, height = 100 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return null;
  const w = 500, pad = 4;
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
        <linearGradient id="ensemble-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`} fill="url(#ensemble-grad)" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
      <circle cx={Number(points[points.length - 1]?.split(',')[0])} cy={Number(points[points.length - 1]?.split(',')[1])} r="3" fill={color} />
    </svg>
  );
}

// ── Capital Allocation Donut Chart ──
function DonutChart({ members }: { members: PortfolioMember[] }) {
  const active = members.filter(m => !m.rejected && m.regimeWeight > 0);
  if (active.length === 0) return null;

  const colors = ['#00ffea', '#39ff14', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#10b981', '#f97316', '#6366f1'];
  const size = 160, cx = size / 2, cy = size / 2, r = 55, innerR = 35;

  let cumAngle = -90; // start at top

  const arcs = active.map((m, i) => {
    const angle = m.regimeWeight * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + innerR * Math.cos(endRad);
    const iy1 = cy + innerR * Math.sin(endRad);
    const ix2 = cx + innerR * Math.cos(startRad);
    const iy2 = cy + innerR * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

    return { path, color: colors[i % colors.length], member: m, pct: m.regimeWeight * 100 };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-36 h-36 shrink-0">
        {arcs.map((arc, i) => (
          <path key={i} d={arc.path} fill={arc.color} opacity={0.85} stroke="#0f172a" strokeWidth="1" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace">CAPITAL</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="bold" fontFamily="monospace">{active.length} STRATS</text>
      </svg>
      <div className="flex flex-col gap-1 overflow-hidden">
        {arcs.slice(0, 8).map((arc, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: arc.color }} />
            <span className="text-slate-400 truncate max-w-[100px]">{arc.member.name}</span>
            <span className="text-white font-bold">{arc.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Regime Indicator ──
function RegimeIndicator({ regime, onChange }: { regime: Regime; onChange: (r: Regime) => void }) {
  const configs: { value: Regime; label: string; icon: string; color: string; bg: string }[] = [
    { value: 'trend', label: 'TREND', icon: '📈', color: '#39ff14', bg: 'bg-emerald-500/10 border-emerald-500/40' },
    { value: 'range', label: 'RANGE', icon: '📊', color: '#06b6d4', bg: 'bg-cyan-500/10 border-cyan-500/40' },
    { value: 'shock', label: 'SHOCK', icon: '⚡', color: '#ef4444', bg: 'bg-red-500/10 border-red-500/40' },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[7px] text-slate-500 font-mono tracking-widest uppercase mr-1">Active Regime:</span>
      {configs.map(c => (
        <button key={c.value} onClick={() => onChange(c.value)}
          className={`text-[8px] font-mono font-bold px-2.5 py-1 rounded border transition-all ${
            regime === c.value ? c.bg : 'border-slate-700 text-slate-600 hover:text-slate-400'
          }`}
          style={regime === c.value ? { color: c.color } : undefined}
        >
          {c.icon} {c.label}
        </button>
      ))}
    </div>
  );
}

// ── Correlation Heatmap Mini ──
function CorrelationMini({ matrix, members }: { matrix: CorrelationEntry[]; members: PortfolioMember[] }) {
  const active = members.filter(m => !m.rejected);
  if (active.length < 2 || matrix.length === 0) return null;

  const maxCorr = Math.max(...matrix.map(e => Math.abs(e.correlation)), 0.01);

  return (
    <div className="space-y-1">
      <div className="text-[7px] text-slate-500 font-mono tracking-widest uppercase">Cross-Correlation Matrix (ρ)</div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(${active.length}, 1fr)` }}>
        {/* Header row */}
        <div />
        {active.map((m, i) => (
          <div key={i} className="text-[6px] font-mono text-slate-500 text-center truncate px-0.5">
            {m.name.slice(0, 6)}
          </div>
        ))}
        {/* Data rows */}
        {active.map((row, ri) => (
          <>
            <div key={`label-${ri}`} className="text-[6px] font-mono text-slate-500 truncate pr-1 flex items-center">
              {row.name.slice(0, 6)}
            </div>
            {active.map((col, ci) => {
              if (ri === ci) return <div key={`${ri}-${ci}`} className="w-full aspect-square bg-slate-800 rounded-sm flex items-center justify-center text-[5px] text-slate-600">1.0</div>;
              const entry = matrix.find(e =>
                (e.stratA === row.id && e.stratB === col.id) ||
                (e.stratA === col.id && e.stratB === row.id)
              );
              const corr = entry?.correlation || 0;
              const absCorr = Math.abs(corr);
              const hue = absCorr > 0.4 ? 0 : absCorr > 0.2 ? 40 : 120;
              return (
                <div key={`${ri}-${ci}`}
                  className="w-full aspect-square rounded-sm flex items-center justify-center text-[5px] font-mono font-bold"
                  style={{ backgroundColor: `hsla(${hue}, 80%, 50%, ${0.1 + absCorr * 0.5})`, color: `hsl(${hue}, 80%, 70%)` }}
                >
                  {corr.toFixed(2)}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──
export function EnsemblePortfolio({ strategies }: { strategies: GAProfile[] }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResult | null>(null);
  const [regime, setRegime] = useState<Regime>('trend');

  const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ensemble-portfolio`;
  const HEADERS = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };

  const inputStrategies = useMemo(() => {
    return strategies.map((s, i) => ({
      id: `strat-${i}`,
      name: s.strategyName,
      pair: s.pair,
      equityCurve: s.equityCurve,
      totalReturn: s.totalReturn,
      maxDrawdown: s.maxDrawdown,
      sharpe: s.sharpe || 0,
      winRate: s.winRate,
      profitFactor: s.profitFactor,
      trades: s.trades,
      totalPips: s.totalPips,
      regimeScores: s.regimeScores,
      bestRegime: s.bestRegime,
      edgeArchetype: s.edgeArchetype,
    }));
  }, [strategies]);

  const runEnsemble = useCallback(async (r: Regime = regime) => {
    if (inputStrategies.length === 0) return;
    setLoading(true); setError(null);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ strategies: inputStrategies, currentRegime: r, maxCorrelation: 0.4 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Ensemble computation failed');
      setPortfolio(data.portfolio);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [inputStrategies, regime]);

  const handleRegimeChange = useCallback((r: Regime) => {
    setRegime(r);
    if (portfolio) runEnsemble(r);
  }, [portfolio, runEnsemble]);

  const hasStrategies = strategies.length > 0;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Layers className="w-5 h-5 text-indigo-400" />
            {loading && (
              <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400" />
            )}
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Ensemble Meta-Portfolio Engine</h2>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
              Inverse Vol Weighting · Decorrelation ρ≤0.4 · Dynamic Regime Routing · Risk Parity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {portfolio && (
            <span className="text-[8px] font-mono text-indigo-400 bg-indigo-400/10 border border-indigo-400/30 px-2 py-0.5 rounded">
              {portfolio.acceptedCount} STRATS · {portfolio.metrics.totalReturn > 0 ? '+' : ''}{portfolio.metrics.totalReturn}% · SR {portfolio.metrics.sharpe}
            </span>
          )}
          {!hasStrategies && (
            <span className="text-[8px] font-mono text-slate-600 border border-slate-700 px-2 py-0.5 rounded">
              NO STRATEGIES — Run Alpha Discovery First
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4">
              {/* Controls */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <RegimeIndicator regime={regime} onChange={handleRegimeChange} />
                <button
                  onClick={() => runEnsemble()}
                  disabled={loading || !hasStrategies}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-40 bg-indigo-500/15 border border-indigo-400/50 text-indigo-400 hover:bg-indigo-500/25"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                  {loading ? 'COMPUTING...' : 'SYNTHESIZE PORTFOLIO'}
                </button>
              </div>

              {/* Strategy Count */}
              <div className="text-[8px] font-mono text-slate-500">
                {inputStrategies.length} strategies available for ensemble ingestion
                {inputStrategies.length > 0 && ` · Pairs: ${[...new Set(inputStrategies.map(s => s.pair).filter(Boolean))].join(', ')}`}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-[9px] text-red-400 font-mono">{error}</span>
                </div>
              )}

              {/* Results */}
              {portfolio && (
                <div className="space-y-4">
                  {/* Portfolio Metrics Bar */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    {[
                      { label: 'Total Return', value: `${portfolio.metrics.totalReturn > 0 ? '+' : ''}${portfolio.metrics.totalReturn}%`, color: portfolio.metrics.totalReturn >= 0 ? '#39ff14' : '#ff0055', icon: TrendingUp },
                      { label: 'Max Drawdown', value: `${(portfolio.metrics.maxDrawdown * 100).toFixed(2)}%`, color: '#f59e0b', icon: Shield },
                      { label: 'Sharpe Ratio', value: portfolio.metrics.sharpe.toFixed(2), color: '#8b5cf6', icon: Target },
                      { label: 'Active Regime', value: portfolio.regimeLabel, color: portfolio.regime === 'shock' ? '#ef4444' : portfolio.regime === 'range' ? '#06b6d4' : '#39ff14', icon: Zap },
                      { label: 'Strategies', value: `${portfolio.acceptedCount}/${portfolio.totalStrategies}`, color: '#6366f1', icon: Activity },
                    ].map((m, i) => (
                      <div key={i} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-3">
                        <div className="flex items-center gap-1 mb-1">
                          <m.icon className="w-2.5 h-2.5" style={{ color: m.color }} />
                          <span className="text-[7px] text-slate-500 font-mono uppercase tracking-widest">{m.label}</span>
                        </div>
                        <div className="text-sm font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Synthesized Equity Curve + Donut */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">Synthesized Portfolio Equity Curve</span>
                        <span className="text-[7px] font-mono text-slate-600 ml-auto">$1,000 base · Risk Parity Weighted</span>
                      </div>
                      <PortfolioCurve curve={portfolio.synthesizedCurve} height={120} />
                      <div className="flex items-center justify-between mt-2 text-[7px] font-mono text-slate-600">
                        <span>Start: ${portfolio.synthesizedCurve[0]?.toFixed(0)}</span>
                        <span>End: ${portfolio.synthesizedCurve[portfolio.synthesizedCurve.length - 1]?.toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <PieChart className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">Capital Allocation</span>
                      </div>
                      <DonutChart members={portfolio.members} />
                    </div>
                  </div>

                  {/* Correlation Matrix */}
                  <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-4">
                    <CorrelationMini matrix={portfolio.correlationMatrix} members={portfolio.members} />
                  </div>

                  {/* Strategy Members Table */}
                  <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-4">
                    <div className="text-[7px] text-slate-500 font-mono tracking-widest uppercase mb-3">Portfolio Members — Inverse Volatility × Regime Routing</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[700px]">
                        <thead>
                          <tr className="text-[7px] text-slate-600 tracking-widest uppercase">
                            <th className="pb-2 pr-2">Status</th>
                            <th className="pb-2 pr-2">Strategy</th>
                            <th className="pb-2 pr-2">Pair</th>
                            <th className="pb-2 pr-2">Regime</th>
                            <th className="pb-2 pr-2 text-right">IV Weight</th>
                            <th className="pb-2 pr-2 text-right">Regime Wt</th>
                            <th className="pb-2 pr-2 text-right">Sharpe</th>
                            <th className="pb-2 pr-2 text-right">MaxDD</th>
                            <th className="pb-2 pr-2 text-right">Win%</th>
                            <th className="pb-2 text-right">Trades</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                          {portfolio.members.map((m, i) => (
                            <tr key={i} className={m.rejected ? 'opacity-40' : 'hover:bg-slate-800/20'}>
                              <td className="py-1.5 pr-2">
                                {m.rejected
                                  ? <XCircle className="w-3 h-3 text-red-500" />
                                  : <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                }
                              </td>
                              <td className="py-1.5 pr-2">
                                <div className="text-[8px] font-mono font-bold text-slate-300 truncate max-w-[140px]">{m.name}</div>
                                {m.rejected && m.rejectionReason && (
                                  <div className="text-[6px] text-red-400 font-mono truncate max-w-[140px]">{m.rejectionReason}</div>
                                )}
                              </td>
                              <td className="py-1.5 pr-2 text-[8px] font-mono text-slate-500">{m.pair?.replace('_', '/') || '—'}</td>
                              <td className="py-1.5 pr-2">
                                <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  m.bestRegime === 'TREND' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' :
                                  m.bestRegime === 'SHOCK' ? 'text-red-400 border-red-500/30 bg-red-500/5' :
                                  'text-cyan-400 border-cyan-500/30 bg-cyan-500/5'
                                }`}>
                                  {m.bestRegime || '—'}
                                </span>
                              </td>
                              <td className="py-1.5 pr-2 text-right text-[8px] font-mono font-bold text-amber-400">
                                {m.rejected ? '—' : `${(m.weight * 100).toFixed(1)}%`}
                              </td>
                              <td className="py-1.5 pr-2 text-right text-[8px] font-mono font-bold text-indigo-400">
                                {m.rejected ? '—' : `${(m.regimeWeight * 100).toFixed(1)}%`}
                              </td>
                              <td className="py-1.5 pr-2 text-right text-[8px] font-mono text-slate-300">{m.sharpe.toFixed(2)}</td>
                              <td className="py-1.5 pr-2 text-right text-[8px] font-mono text-yellow-400">{(m.maxDrawdown * 100).toFixed(1)}%</td>
                              <td className="py-1.5 pr-2 text-right text-[8px] font-mono text-slate-300">{(m.winRate * 100).toFixed(1)}%</td>
                              <td className="py-1.5 text-right text-[8px] font-mono text-slate-400">{m.trades}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!portfolio && !loading && (
                <div className="py-8 text-center space-y-3">
                  <Layers className="w-8 h-8 mx-auto text-indigo-400/30" />
                  <p className="text-[10px] text-slate-500 font-mono">
                    {hasStrategies
                      ? `${strategies.length} strategies ready. Select regime and click Synthesize.`
                      : 'Run the Alpha Discovery Engine first to generate strategies for ensemble synthesis.'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
