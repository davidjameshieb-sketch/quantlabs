// Alpha Discovery Engine — Unsupervised Decision Tree Rule Miner
// Discovers uncorrelated, high-probability trading rules from M30 data

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Cpu, Search, TrendingUp, Shield, Zap, ChevronDown, ChevronUp,
  AlertTriangle, Target, Activity, Layers, Fingerprint, GitBranch,
} from 'lucide-react';
import type { BacktestResult } from '@/hooks/useRankExpectancy';

interface RuleCondition {
  feature: string;
  operator: '<=' | '>';
  threshold: number;
}

interface DiscoveredRule {
  conditions: RuleCondition[];
  winRate: number;
  samples: number;
  profitFactor: number;
  totalPips: number;
  trades: number;
  equityCurve: number[];
  correlationToBase: number;
  plainEnglish: string;
}

interface AlphaResult {
  timestamp: string;
  environment: string;
  dataPoints: number;
  treeStats: {
    totalLeaves: number;
    highProbLeaves: number;
    maxDepthReached: number;
    totalSamples: number;
    perfectTradeRate: string;
  };
  featureNames: string[];
  featureLabels: Record<string, string>;
  uncorrelatedRules: DiscoveredRule[];
  allRules: DiscoveredRule[];
  baselineEquityCurve: number[];
  config: { maxDepth: number; minWinRate: number; maxCorrelation: number; candleCount: number };
}

// ── Mini Equity Curve ──
function RuleCurve({ curve, height = 60 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return null;
  const w = 280;
  const h = height;
  const pad = 4;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const points = curve.map((val, i) => {
    const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((val - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const isPositive = curve[curve.length - 1] >= curve[0];
  const color = isPositive ? '#39ff14' : '#ff0055';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ade-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`}
        fill={`url(#ade-grad-${color.replace('#', '')})`}
      />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
      {/* Start/End markers */}
      <circle cx={pad} cy={Number(points[0]?.split(',')[1])} r="2" fill={color} />
      <circle cx={w - pad} cy={Number(points[points.length - 1]?.split(',')[1])} r="2" fill={color} />
    </svg>
  );
}

// ── Correlation Bar ──
function CorrelationBar({ value, max = 0.3 }: { value: number; max: number }) {
  const pct = Math.min(100, (value / 1) * 100);
  const isAccepted = value <= max;
  const color = isAccepted ? '#39ff14' : '#ff0055';
  const thresholdPct = max * 100;

  return (
    <div className="relative w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {/* Threshold marker */}
      <div
        className="absolute top-0 h-full w-px bg-yellow-500"
        style={{ left: `${thresholdPct}%` }}
      />
    </div>
  );
}

// ── Decision Tree Path Visualization ──
function TreePathViz({ conditions, featureLabels }: { conditions: RuleCondition[]; featureLabels: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {conditions.map((cond, idx) => {
        const label = featureLabels[cond.feature] || cond.feature;
        const isGate = cond.feature.startsWith('gate');
        let displayValue: string;
        if (isGate) {
          displayValue = cond.operator === '<=' && cond.threshold < 0.5 ? 'FALSE' : 'TRUE';
        } else if (cond.feature === 'session') {
          const sessions = ['Asia', 'London', 'NY', 'NY Close'];
          displayValue = sessions[Math.round(cond.threshold)] || String(cond.threshold);
        } else {
          displayValue = cond.threshold < 1 ? cond.threshold.toFixed(4) : cond.threshold.toFixed(1);
        }

        return (
          <span key={idx} className="flex items-center gap-0.5">
            {idx > 0 && <span className="text-[7px] text-yellow-500/60 font-mono mx-0.5">AND</span>}
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border bg-slate-900/80"
              style={{
                borderColor: isGate ? '#a855f766' : '#00ffea44',
                color: isGate ? '#a855f7' : '#00ffea',
              }}>
              {label} {isGate ? `= ${displayValue}` : `${cond.operator} ${displayValue}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ── Main Component ──
export function AlphaDiscoveryEngine({ result }: { result: BacktestResult }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alphaResult, setAlphaResult] = useState<AlphaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);
  const [maxDepth, setMaxDepth] = useState(4);
  const [minWinRate, setMinWinRate] = useState(65);
  const [maxCorrelation, setMaxCorrelation] = useState(0.3);

  const runDiscovery = useCallback(async () => {
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
            maxDepth,
            minWinRate: minWinRate / 100,
            maxCorrelation,
            candles: result.candlesPerPair || 5000,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Discovery failed');
      setAlphaResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [result, maxDepth, minWinRate, maxCorrelation]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Brain className="w-5 h-5 text-emerald-400" />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400"
            />
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Unsupervised Alpha Discovery Engine
            </h2>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">
              Decision Tree Classifier · CART Algorithm · Correlation Filter · max_depth={maxDepth}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alphaResult && (
            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded">
              {alphaResult.uncorrelatedRules.length} UNCORRELATED RULES
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
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Tree Depth</label>
                  <div className="flex items-center gap-2">
                    {[3, 4, 5].map(d => (
                      <button
                        key={d}
                        onClick={() => setMaxDepth(d)}
                        className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border transition-all ${
                          maxDepth === d
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        D{d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Min Win Rate</label>
                  <div className="flex items-center gap-2">
                    {[55, 60, 65, 70].map(wr => (
                      <button
                        key={wr}
                        onClick={() => setMinWinRate(wr)}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${
                          minWinRate === wr
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {wr}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3">
                  <label className="text-[7px] text-slate-500 font-mono uppercase tracking-widest block mb-1.5">Max Correlation</label>
                  <div className="flex items-center gap-2">
                    {[0.2, 0.3, 0.4, 0.5].map(mc => (
                      <button
                        key={mc}
                        onClick={() => setMaxCorrelation(mc)}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded border transition-all ${
                          maxCorrelation === mc
                            ? 'bg-emerald-400/10 border-emerald-400/50 text-emerald-400'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {mc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <button
                onClick={runDiscovery}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all font-mono text-xs font-bold uppercase tracking-widest"
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
                    Training Decision Tree · Mining Rules...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Launch Alpha Discovery · CART Classifier
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
              {alphaResult && (
                <div className="space-y-4">
                  {/* Stats Banner */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Data Points', value: alphaResult.dataPoints.toLocaleString(), icon: Activity, color: '#00ffea' },
                      { label: 'Tree Leaves', value: alphaResult.treeStats.totalLeaves, icon: GitBranch, color: '#a855f7' },
                      { label: 'High-Prob Paths', value: alphaResult.treeStats.highProbLeaves, icon: Target, color: '#39ff14' },
                      { label: 'Perfect Trade %', value: `${alphaResult.treeStats.perfectTradeRate}%`, icon: Zap, color: '#ff8800' },
                      { label: 'Uncorrelated', value: alphaResult.uncorrelatedRules.length, icon: Fingerprint, color: '#10b981' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                        <stat.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: stat.color }} />
                        <div className="text-[10px] font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
                        <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Uncorrelated Rules Leaderboard */}
                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden">
                    <div className="bg-emerald-950/30 px-4 py-2.5 border-b border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                          Uncorrelated Alpha Rules (ρ ≤ {maxCorrelation})
                        </span>
                      </div>
                      <span className="text-[7px] text-emerald-500/60 font-mono">
                        Rejected {alphaResult.allRules.length - alphaResult.uncorrelatedRules.length} correlated rules
                      </span>
                    </div>

                    {alphaResult.uncorrelatedRules.length === 0 ? (
                      <div className="p-8 text-center">
                        <AlertTriangle className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                        <p className="text-[10px] text-slate-400 font-mono">
                          No uncorrelated rules found. Try increasing max correlation or lowering min win rate.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/30">
                        {alphaResult.uncorrelatedRules.map((rule, idx) => {
                          const isExpanded = expandedRule === idx;
                          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

                          return (
                            <div key={idx} className="bg-slate-950/20 hover:bg-slate-900/40 transition-colors">
                              <button
                                onClick={() => setExpandedRule(isExpanded ? null : idx)}
                                className="w-full px-4 py-3 text-left"
                              >
                                <div className="flex items-center gap-3">
                                  {/* Rank Medal */}
                                  <span className="text-lg w-8 text-center shrink-0">{medal}</span>

                                  {/* Rule Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[9px] font-mono text-slate-300 truncate mb-1">
                                      {rule.plainEnglish}
                                    </div>
                                    <TreePathViz
                                      conditions={rule.conditions}
                                      featureLabels={alphaResult.featureLabels}
                                    />
                                  </div>

                                  {/* Stats */}
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono" style={{ color: rule.winRate >= 70 ? '#39ff14' : '#00ffea' }}>
                                        {(rule.winRate * 100).toFixed(1)}%
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">WR</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono" style={{ color: rule.profitFactor > 2 ? '#39ff14' : '#00ffea' }}>
                                        {rule.profitFactor}
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">PF</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono text-emerald-400">
                                        {rule.correlationToBase}
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">ρ</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="text-[8px] font-bold font-mono text-slate-300">
                                        {rule.trades}
                                      </div>
                                      <div className="text-[6px] text-slate-600 font-mono">Trades</div>
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                                  </div>
                                </div>
                              </button>

                              {/* Expanded Detail */}
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
                                          <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">
                                            Rule Equity Curve
                                          </span>
                                          <span className="text-[8px] font-mono font-bold" style={{
                                            color: rule.totalPips >= 0 ? '#39ff14' : '#ff0055'
                                          }}>
                                            {rule.totalPips >= 0 ? '+' : ''}{rule.totalPips} pips
                                          </span>
                                        </div>
                                        <RuleCurve curve={rule.equityCurve} height={80} />
                                      </div>

                                      {/* Correlation Analysis */}
                                      <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <Layers className="w-3 h-3 text-emerald-400" />
                                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                                            Correlation to Base Strategy
                                          </span>
                                        </div>
                                        <CorrelationBar value={rule.correlationToBase} max={maxCorrelation} />
                                        <div className="flex items-center justify-between mt-1.5">
                                          <span className="text-[7px] text-slate-600 font-mono">0.0 (Independent)</span>
                                          <span className="text-[7px] text-yellow-500/60 font-mono">
                                            Threshold: {maxCorrelation}
                                          </span>
                                          <span className="text-[7px] text-slate-600 font-mono">1.0 (Identical)</span>
                                        </div>
                                        <p className="text-[8px] text-slate-500 font-mono mt-2">
                                          {rule.correlationToBase < 0.1
                                            ? '✅ Highly independent — this rule generates returns from a completely different market dynamic than your base strategy.'
                                            : rule.correlationToBase < 0.2
                                            ? '✅ Low correlation — minimal overlap with base strategy returns. Safe to run in parallel.'
                                            : '⚠️ Moderate correlation — some shared exposure with base strategy. Monitor aggregate risk.'}
                                        </p>
                                      </div>

                                      {/* Detailed Stats Grid */}
                                      <div className="grid grid-cols-4 gap-2">
                                        {[
                                          { label: 'Win Rate', value: `${(rule.winRate * 100).toFixed(1)}%`, color: '#39ff14' },
                                          { label: 'Profit Factor', value: rule.profitFactor.toFixed(2), color: '#00ffea' },
                                          { label: 'Total Pips', value: `${rule.totalPips >= 0 ? '+' : ''}${rule.totalPips}`, color: rule.totalPips >= 0 ? '#39ff14' : '#ff0055' },
                                          { label: 'Correlation ρ', value: rule.correlationToBase.toFixed(3), color: '#10b981' },
                                        ].map(s => (
                                          <div key={s.label} className="bg-slate-950/40 border border-slate-800/30 rounded-lg p-2 text-center">
                                            <div className="text-[10px] font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                                            <div className="text-[6px] text-slate-600 font-mono uppercase mt-0.5">{s.label}</div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Plain English Rule */}
                                      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                          <Search className="w-3 h-3 text-emerald-400" />
                                          <span className="text-[7px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                                            Plain English Rule
                                          </span>
                                        </div>
                                        <p className="text-[10px] font-mono text-emerald-300 leading-relaxed">
                                          {rule.plainEnglish}
                                        </p>
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

                  {/* All Rules (Before Correlation Filter) */}
                  {alphaResult.allRules.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-2 cursor-pointer text-[8px] text-slate-500 font-mono uppercase tracking-widest hover:text-slate-300 transition-colors py-2">
                        <GitBranch className="w-3 h-3" />
                        All {alphaResult.allRules.length} Discovered Rules (Before Correlation Filter)
                      </summary>
                      <div className="mt-2 bg-slate-950/40 border border-slate-800/30 rounded-lg overflow-hidden">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[7px] text-slate-600 font-mono uppercase border-b border-slate-800/30">
                              <th className="p-2">#</th>
                              <th className="p-2">Rule</th>
                              <th className="p-2 text-right">WR</th>
                              <th className="p-2 text-right">PF</th>
                              <th className="p-2 text-right">Trades</th>
                              <th className="p-2 text-right">ρ</th>
                              <th className="p-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/20">
                            {alphaResult.allRules.map((rule, idx) => {
                              const accepted = rule.correlationToBase <= maxCorrelation && rule.profitFactor > 1;
                              return (
                                <tr key={idx} className={accepted ? 'bg-emerald-950/10' : 'opacity-50'}>
                                  <td className="p-2 text-[8px] font-mono text-slate-500">{idx + 1}</td>
                                  <td className="p-2 text-[8px] font-mono text-slate-400 max-w-[300px] truncate">{rule.plainEnglish}</td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: rule.winRate >= 0.65 ? '#39ff14' : '#00ffea' }}>
                                    {(rule.winRate * 100).toFixed(1)}%
                                  </td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: rule.profitFactor > 2 ? '#39ff14' : '#00ffea' }}>
                                    {rule.profitFactor}
                                  </td>
                                  <td className="p-2 text-[8px] font-mono text-right text-slate-400">{rule.trades}</td>
                                  <td className="p-2 text-[8px] font-mono text-right" style={{ color: rule.correlationToBase <= maxCorrelation ? '#10b981' : '#ff0055' }}>
                                    {rule.correlationToBase.toFixed(3)}
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
