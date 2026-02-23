// Profile Discovery Engine — Real OANDA Data Grid Search
// Calls profile-live-backtest edge function for real market validation
// No PRNG — every result is backed by actual M30 candle data

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Trophy, TrendingUp, Flame, Search, ChevronDown, ChevronUp,
  Zap, Target, Shield, Activity, BarChart3, Brain, Fingerprint, Layers,
  AlertTriangle,
} from 'lucide-react';
import { TimePeriodBreakdown } from './TimePeriodBreakdown';
import { computeOOSValidation, OOSValidationPanel, type OOSValidationResult } from './OOSValidationPanel';

interface ProfileResult {
  rank: number;
  predator: number;
  prey: number;
  gates: string;
  g1: boolean;
  g2: boolean;
  g3: boolean;
  slLabel: string;
  slPips: number;
  session: string;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  netProfit: number;
  totalPips: number;
  trades: number;
  entryLabel: string;
  equityCurve: Array<{ time: string; equity: number }>;
  // Live backtest specific
  institutionalProfit: number;
  aggressiveProfit: number;
  institutionalPF: number;
  aggressivePF: number;
  aggressiveMaxDD: number;
  tpRatio: number | string;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
}

// ── Mini equity chart ──
function MiniCurve({ curve, height = 80 }: { curve: Array<{ time: string; equity: number }>; height?: number }) {
  if (curve.length < 2) return null;
  const w = 300, h = height, pad = 4;
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
        <linearGradient id={`pde-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill={`url(#pde-grad-${color})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Strategy Intelligence Analysis ──
function generateProfileIntelligence(profile: ProfileResult, allTop: ProfileResult[], idx: number): {
  whyProfitable: string;
  uniqueEdge: string;
  diversification: string;
  riskProfile: string;
  tags: Array<{ label: string; color: string }>;
} {
  const p = profile;
  const rankSpread = Math.abs(p.predator - p.prey);
  const isExtremeRank = p.predator <= 1 && p.prey >= 8;
  const isWideRank = rankSpread >= 6;
  const hasAllGates = p.g1 && p.g2 && p.g3;
  const isLondon = p.session.includes('LONDON');
  const isNY = p.session.includes('NEW_YORK');
  const isAsia = p.session.includes('ASIA');

  let whyParts: string[] = [];
  if (isExtremeRank) {
    whyParts.push(`Exploits maximum cross-sectional divergence (#${p.predator} vs #${p.prey}) — the widest possible strength gap across the 28-cross matrix.`);
  } else if (isWideRank) {
    whyParts.push(`Targets high-divergence rank spread (#${p.predator} vs #${p.prey}) — ${rankSpread}-rank separation provides strong directional conviction.`);
  } else {
    whyParts.push(`Uses moderate rank spread (#${p.predator} vs #${p.prey}) for higher trade frequency.`);
  }
  if (hasAllGates) {
    whyParts.push(`Full Triple-Lock gate alignment (G1+G2+G3) eliminates false breakouts.`);
  }
  if (isLondon) whyParts.push(`London session provides peak institutional liquidity.`);
  else if (isNY) whyParts.push(`New York session captures London-NY overlap.`);
  else if (isAsia) whyParts.push(`Asian session trades quieter structural setups.`);

  const tpLabel = p.tpRatio === 'flip' ? 'Flip Exit' : `${p.tpRatio}R TP`;
  const uniqueEdge = `${p.slPips}-pip stop loss with ${tpLabel}. Validated against ${p.trades} real trades on live OANDA M30 candles with 1.5-pip friction tax per trade. Institutional (1%) model P&L: $${p.institutionalProfit.toFixed(2)}. Aggressive (5%) model: $${p.aggressiveProfit.toFixed(2)}.`;

  const others = allTop.filter((_, i) => i !== idx);
  const sameRank = others.filter(o => o.predator === p.predator && o.prey === p.prey);
  const sameSession = others.filter(o => o.session === p.session);
  const sameSL = others.filter(o => o.slPips === p.slPips);
  const uniqueFactors: string[] = [];
  if (sameRank.length === 0) uniqueFactors.push(`rank pairing (#${p.predator}v#${p.prey})`);
  if (sameSession.length === 0) uniqueFactors.push(`${p.session} session`);
  if (sameSL.length === 0) uniqueFactors.push(`${p.slPips}p SL`);

  const diversification = uniqueFactors.length >= 2
    ? `Highly diversified — unique in ${uniqueFactors.join(', ')}.`
    : uniqueFactors.length >= 1
    ? `Moderately diversified — unique in ${uniqueFactors.join(', ')}.`
    : `Correlated with other top profiles.`;

  const riskProfile = p.maxDrawdown > -5
    ? `Conservative risk — ${p.maxDrawdown}% max drawdown.`
    : p.maxDrawdown > -15
    ? `Moderate risk — ${p.maxDrawdown}% max drawdown.`
    : `Aggressive risk — ${p.maxDrawdown}% max drawdown.`;

  const tags: Array<{ label: string; color: string }> = [];
  tags.push({ label: 'REAL DATA', color: '#39ff14' });
  if (isExtremeRank) tags.push({ label: 'Max Divergence', color: '#00ffea' });
  if (hasAllGates) tags.push({ label: 'Triple-Lock', color: '#39ff14' });
  if (p.profitFactor > 2) tags.push({ label: 'High PF', color: '#39ff14' });
  if (p.winRate > 55) tags.push({ label: 'High WR', color: '#39ff14' });

  return { whyProfitable: whyParts.join(' '), uniqueEdge, diversification, riskProfile, tags };
}

function StrategyIntelligencePanel({ profile, allTop, idx }: { profile: ProfileResult; allTop: ProfileResult[]; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const intel = generateProfileIntelligence(profile, allTop, idx);

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-[8px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
      >
        <Brain className="w-3 h-3" />
        <span className="uppercase tracking-widest font-bold">Strategy Intelligence</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 bg-slate-950/50 border border-purple-500/20 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {intel.tags.map((tag) => (
                  <span key={tag.label} className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border"
                    style={{ color: tag.color, borderColor: `${tag.color}33`, backgroundColor: `${tag.color}10` }}>
                    {tag.label}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3 h-3 text-[#39ff14]" />
                  <span className="text-[8px] font-bold text-[#39ff14] uppercase tracking-wider">Why This Profile Is Profitable</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.whyProfitable}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Fingerprint className="w-3 h-3 text-[#00ffea]" />
                  <span className="text-[8px] font-bold text-[#00ffea] uppercase tracking-wider">Validated Edge</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.uniqueEdge}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3 h-3 text-[#ff8800]" />
                  <span className="text-[8px] font-bold text-[#ff8800] uppercase tracking-wider">Risk Profile</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.riskProfile}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="w-3 h-3 text-[#ffaa00]" />
                  <span className="text-[8px] font-bold text-[#ffaa00] uppercase tracking-wider">Diversification</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">{intel.diversification}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Circuit Breaker ──
interface CircuitBreakerData {
  rollingPF: number; historicalPFMean: number; historicalPFStd: number;
  pfZScore: number; pfBroken: boolean;
  historicalWR: number; recentWR: number; wrVelocity: number; wrDecayAlert: boolean;
  cusumValues: number[]; cusumBreached: boolean; cusumThreshold: number;
  status: 'NOMINAL' | 'WARNING' | 'BROKEN'; statusReason: string;
  rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }>;
  rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }>;
}

function computeCircuitBreaker(curve: Array<{ time: string; equity: number }>, backtestWR: number, backtestPF: number, windowSize = 30): CircuitBreakerData {
  const trades: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const delta = curve[i].equity - curve[i - 1].equity;
    if (Math.abs(delta) > 0.001) trades.push(delta);
  }
  while (trades.length < windowSize) trades.unshift(0);

  const rollingPFSeries: Array<{ trade: number; pf: number; zScore: number }> = [];
  const allWindowPFs: number[] = [];
  for (let i = windowSize; i <= trades.length; i++) {
    const window = trades.slice(i - windowSize, i);
    let gp = 0, gl = 0;
    window.forEach(t => { if (t > 0) gp += t; else gl += Math.abs(t); });
    const pf = gl > 0 ? gp / gl : gp > 0 ? 5 : 1;
    allWindowPFs.push(pf);
    rollingPFSeries.push({ trade: i, pf, zScore: 0 });
  }
  const pfMean = allWindowPFs.length > 0 ? allWindowPFs.reduce((a, b) => a + b, 0) / allWindowPFs.length : backtestPF;
  const pfVariance = allWindowPFs.length > 1 ? allWindowPFs.reduce((a, b) => a + (b - pfMean) ** 2, 0) / (allWindowPFs.length - 1) : 0.01;
  const pfStd = Math.max(0.01, Math.sqrt(pfVariance));
  rollingPFSeries.forEach(pt => { pt.zScore = (pt.pf - pfMean) / pfStd; });
  const latestPF = allWindowPFs[allWindowPFs.length - 1] ?? backtestPF;
  const pfZScore = (latestPF - pfMean) / pfStd;
  const pfBroken = pfZScore < -2;

  const recentWindow = 20;
  const recentTrades = trades.slice(-recentWindow);
  const recentWins = recentTrades.filter(t => t > 0).length;
  const recentWR = recentTrades.length > 0 ? (recentWins / recentTrades.length) * 100 : backtestWR;
  const wrVelocity = backtestWR > 0 ? ((recentWR - backtestWR) / backtestWR) * 100 : 0;
  const wrDecayAlert = wrVelocity < -30;

  const rollingWRSeries: Array<{ trade: number; wr: number; velocity: number }> = [];
  for (let i = recentWindow; i <= trades.length; i++) {
    const w = trades.slice(i - recentWindow, i);
    const wins = w.filter(t => t > 0).length;
    const wr = (wins / w.length) * 100;
    const vel = backtestWR > 0 ? ((wr - backtestWR) / backtestWR) * 100 : 0;
    rollingWRSeries.push({ trade: i, wr, velocity: vel });
  }

  const target = backtestWR / 100;
  let cusumNeg = 0;
  const cusumValues: number[] = [];
  const k = 0.5 * pfStd;
  const h = 4 * pfStd;
  let cusumBreached = false;
  for (const t of trades) {
    const normalized = t > 0 ? 1 : 0;
    cusumNeg = Math.min(0, cusumNeg + (normalized - target) + k);
    cusumValues.push(cusumNeg);
    if (Math.abs(cusumNeg) > h) cusumBreached = true;
  }

  let status: CircuitBreakerData['status'] = 'NOMINAL';
  let statusReason = 'All metrics within normal operating parameters.';
  if (pfBroken && wrDecayAlert) { status = 'BROKEN'; statusReason = `PF Z-Score at ${pfZScore.toFixed(2)}σ AND Win-Rate velocity at ${wrVelocity.toFixed(0)}% decay.`; }
  else if (pfBroken || cusumBreached) { status = 'BROKEN'; statusReason = pfBroken ? `PF dropped ${Math.abs(pfZScore).toFixed(1)}σ below mean.` : `CUSUM breached — structural regime change.`; }
  else if (wrDecayAlert) { status = 'WARNING'; statusReason = `Win-Rate velocity at ${wrVelocity.toFixed(0)}%.`; }
  else if (pfZScore < -1 || wrVelocity < -15) { status = 'WARNING'; statusReason = `Mild degradation. PF Z: ${pfZScore.toFixed(2)}σ, WR Vel: ${wrVelocity.toFixed(0)}%.`; }

  return { rollingPF: Math.round(latestPF * 100) / 100, historicalPFMean: Math.round(pfMean * 100) / 100, historicalPFStd: Math.round(pfStd * 100) / 100, pfZScore: Math.round(pfZScore * 100) / 100, pfBroken, historicalWR: Math.round(backtestWR * 10) / 10, recentWR: Math.round(recentWR * 10) / 10, wrVelocity: Math.round(wrVelocity * 10) / 10, wrDecayAlert, cusumValues, cusumBreached, cusumThreshold: Math.round(h * 100) / 100, status, statusReason, rollingPFSeries, rollingWRSeries };
}

function CircuitBreakerPanel({ profile }: { profile: ProfileResult }) {
  const [expanded, setExpanded] = useState(false);
  const cb = computeCircuitBreaker(profile.equityCurve, profile.winRate, profile.profitFactor);

  return (
    <div className="mt-2">
      <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-[8px] font-mono transition-colors"
        style={{ color: cb.status === 'BROKEN' ? '#ff0055' : cb.status === 'WARNING' ? '#ff8800' : '#39ff14' }}>
        <AlertTriangle className="w-3 h-3" />
        <span className="uppercase tracking-widest font-bold">Circuit Breaker</span>
        <span className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full ml-1"
          style={{ backgroundColor: cb.status === 'BROKEN' ? '#ff005515' : cb.status === 'WARNING' ? '#ff880015' : '#39ff1415', border: `1px solid ${cb.status === 'BROKEN' ? '#ff005533' : cb.status === 'WARNING' ? '#ff880033' : '#39ff1433'}` }}>
          {cb.status === 'BROKEN' ? '⛔ BROKEN' : cb.status === 'WARNING' ? '⚠️ WARNING' : '✅ NOMINAL'}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 bg-slate-950/50 border rounded-lg p-3 space-y-3" style={{ borderColor: cb.status === 'BROKEN' ? '#ff005540' : cb.status === 'WARNING' ? '#ff880040' : '#1e293b60' }}>
              <p className="text-[8px] font-mono leading-relaxed" style={{ color: cb.status === 'BROKEN' ? '#ff6688' : cb.status === 'WARNING' ? '#ffaa55' : '#88aa88' }}>{cb.statusReason}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Rolling PF Z-Score (30-trade)</span>
                    <span className="text-[7px] font-mono font-bold" style={{ color: cb.pfBroken ? '#ff0055' : '#39ff14' }}>{cb.pfBroken ? 'BROKEN' : 'OK'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { l: 'Current PF', v: cb.rollingPF.toFixed(2), c: cb.rollingPF > 1 ? '#39ff14' : '#ff0055' },
                      { l: 'Hist. Mean', v: cb.historicalPFMean.toFixed(2), c: '#00ffea' },
                      { l: 'Hist. σ', v: cb.historicalPFStd.toFixed(2), c: '#8888aa' },
                      { l: 'Z-Score', v: `${cb.pfZScore > 0 ? '+' : ''}${cb.pfZScore.toFixed(2)}σ`, c: cb.pfZScore < -2 ? '#ff0055' : cb.pfZScore < -1 ? '#ff8800' : '#39ff14' },
                    ].map(m => (<div key={m.l} className="text-center"><div className="text-[6px] text-slate-600 uppercase">{m.l}</div><div className="text-[10px] font-mono font-bold" style={{ color: m.c }}>{m.v}</div></div>))}
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Win-Rate Velocity (20-trade)</span>
                    <span className="text-[7px] font-mono font-bold" style={{ color: cb.wrDecayAlert ? '#ff0055' : '#39ff14' }}>{cb.wrDecayAlert ? 'DECAY' : 'STABLE'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { l: 'Historical WR', v: `${cb.historicalWR}%`, c: '#00ffea' },
                      { l: 'Recent WR', v: `${cb.recentWR}%`, c: cb.recentWR >= cb.historicalWR * 0.8 ? '#39ff14' : '#ff0055' },
                      { l: 'Velocity', v: `${cb.wrVelocity > 0 ? '+' : ''}${cb.wrVelocity}%`, c: cb.wrVelocity < -30 ? '#ff0055' : cb.wrVelocity < -15 ? '#ff8800' : '#39ff14' },
                    ].map(m => (<div key={m.l} className="text-center"><div className="text-[6px] text-slate-600 uppercase">{m.l}</div><div className="text-[10px] font-mono font-bold" style={{ color: m.c }}>{m.v}</div></div>))}
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

// ── Heatmap component ──
function ProfitFactorHeatmap({ results }: { results: ProfileResult[] }) {
  const rowLabels = [...new Set(results.map(r => `#${r.predator}v#${r.prey}`))];
  const colLabels = [...new Set(results.map(r => r.slLabel))];
  const grid: Record<string, Record<string, number>> = {};
  for (const r of results) {
    const rowKey = `#${r.predator}v#${r.prey}`;
    if (!grid[rowKey]) grid[rowKey] = {};
    grid[rowKey][r.slLabel] = Math.max(grid[rowKey][r.slLabel] || 0, r.profitFactor);
  }
  const maxPF = Math.max(...results.map(r => r.profitFactor), 1);
  const minPF = Math.min(...results.map(r => r.profitFactor), 0);
  function pfColor(pf: number): string {
    const normalized = Math.max(0, Math.min(1, (pf - minPF) / (maxPF - minPF || 1)));
    if (pf < 1) return `rgba(255, 0, 85, ${0.2 + normalized * 0.3})`;
    if (pf < 1.5) return `rgba(255, 136, 0, ${0.2 + normalized * 0.4})`;
    return `rgba(57, 255, 20, ${0.15 + normalized * 0.5})`;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead><tr><th className="p-1.5 text-[7px] text-slate-500 font-mono uppercase">Combo</th>
          {colLabels.map(c => (<th key={c} className="p-1.5 text-[7px] text-slate-500 font-mono uppercase text-center whitespace-nowrap">{c}</th>))}
        </tr></thead>
        <tbody>{rowLabels.map(row => (
          <tr key={row}><td className="p-1.5 text-[8px] font-mono font-bold text-slate-300 whitespace-nowrap">{row}</td>
            {colLabels.map(col => { const val = grid[row]?.[col] ?? 0; return (
              <td key={col} className="p-1"><div className="text-[8px] font-mono font-bold text-center rounded px-1.5 py-1"
                style={{ backgroundColor: pfColor(val), color: val >= 1.5 ? '#39ff14' : val >= 1 ? '#ff8800' : '#ff0055' }}>{val > 0 ? val.toFixed(2) : '—'}</div></td>
            ); })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── Full equity chart ──
function FullEquityChart({ curve, profile }: { curve: Array<{ time: string; equity: number }>; profile: ProfileResult }) {
  if (curve.length < 2) return null;
  const w = 800, h = 250, pad = 30;
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
    <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#00ffea]" /> Equity Curve — Profile #{profile.rank}
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20 ml-2">REAL OANDA DATA</span>
        </h4>
        <span className="text-[8px] font-mono text-slate-500">#{profile.predator}v#{profile.prey} · {profile.gates} · {profile.slLabel} · {profile.session}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56" preserveAspectRatio="none">
        <defs><linearGradient id="pde-full-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {min <= 1000 && max >= 1000 && (<line x1={pad} y1={h - pad - ((1000 - min) / range) * (h - 2 * pad)} x2={w - pad} y2={h - pad - ((1000 - min) / range) * (h - 2 * pad)} stroke="#ffffff15" strokeDasharray="4,4" />)}
        <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill="url(#pde-full-grad)" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
        <text x={pad} y={h - 8} fill="#64748b" fontSize="8" fontFamily="monospace">{curve[0]?.time ? new Date(curve[0].time).toLocaleDateString() : ''}</text>
        <text x={w - pad} y={h - 8} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">{curve[curve.length - 1]?.time ? new Date(curve[curve.length - 1].time).toLocaleDateString() : ''}</text>
      </svg>
    </div>
  );
}

// ── Map live backtest result to ProfileResult ──
function mapLiveResult(r: any, rank: number): ProfileResult {
  const tpLabel = r.tpRatio === 'flip' ? 'Flip Exit' : `${r.tpRatio}R TP`;
  const equityCurve = (r.equityCurve || []).map((pt: any) => ({ time: pt.time, equity: pt.equity }));
  return {
    rank,
    predator: r.predator,
    prey: r.prey,
    gates: r.gates || 'G1+G2+G3',
    g1: true, g2: true, g3: true,
    slLabel: `${r.slPips}p SL · ${tpLabel}`,
    slPips: r.slPips,
    session: r.session,
    winRate: r.winRate,
    profitFactor: r.institutionalPF || r.profitFactor,
    maxDrawdown: r.maxDrawdown,
    netProfit: r.institutionalProfit,
    totalPips: r.totalPips,
    trades: r.trades,
    entryLabel: 'Triple-Lock G1+G2+G3',
    equityCurve,
    institutionalProfit: r.institutionalProfit || 0,
    aggressiveProfit: r.aggressiveProfit || 0,
    institutionalPF: r.institutionalPF || r.profitFactor || 0,
    aggressivePF: r.aggressivePF || 0,
    aggressiveMaxDD: r.aggressiveMaxDD || 0,
    tpRatio: r.tpRatio,
    avgWin: r.avgWin || 0,
    avgLoss: r.avgLoss || 0,
    expectancy: r.expectancy || 0,
  };
}

// ── Main Component ──
interface Props {
  result?: any; // Optional — no longer needed for simulation
}

export const ProfileDiscoveryEngine = ({ result }: Props) => {
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [topProfiles, setTopProfiles] = useState<ProfileResult[]>([]);
  const [allResults, setAllResults] = useState<ProfileResult[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ProfileResult | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [totalCombos, setTotalCombos] = useState(0);
  const [rejectedCombos, setRejectedCombos] = useState(0);
  const [candleCount, setCandleCount] = useState(15000);
  const [environment, setEnvironment] = useState<'live' | 'practice'>('live');
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const runOptimization = useCallback(async () => {
    setIsRunning(true);
    setSelectedProfile(null);

    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-live-backtest`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Split by predator rank to avoid CPU limits
      const chunks = [1, 2, 3].map(rank =>
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ environment, candles: candleCount, topN: 25, predatorRanks: [rank] }),
        }).then(r => r.json())
      );

      const results = await Promise.all(chunks);
      const failed = results.find(r => !r.success);
      if (failed) throw new Error(failed.error || 'Backtest failed');

      // Merge and re-sort by institutional PF
      const allTopResults = results.flatMap(r => r.topResults || []);
      allTopResults.sort((a: any, b: any) => {
        if (a.institutionalPF !== b.institutionalPF) return b.institutionalPF - a.institutionalPF;
        return b.institutionalProfit - a.institutionalProfit;
      });
      const top25 = allTopResults.slice(0, 25);

      const profiles: ProfileResult[] = top25.map((r: any, i: number) => mapLiveResult(r, i + 1));

      setTotalCombos(results.reduce((s, r) => s + (r.totalCombos || 0), 0));
      setRejectedCombos(results.reduce((s, r) => s + (r.rejectedCombos || 0), 0));
      setAllResults(profiles);
      setTopProfiles(profiles.slice(0, 10));
      setSelectedProfile(profiles[0] || null);
      setDateRange(results[0]?.dateRange || null);
      setHasRun(true);
    } catch (err) {
      console.error('[ProfileDiscovery] Error:', err);
    } finally {
      setIsRunning(false);
    }
  }, [environment, candleCount]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/30 to-slate-900/50">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-amber-300 uppercase">Profile Discovery Engine</h2>
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20">REAL OANDA DATA</span>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">Live M30 Candle Backtest · Institutional-Grade Validation</span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1 font-mono">
          Tests every Rank × Gate × SL × TP × Session against real OANDA market data — no synthetic simulation
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Run Button */}
        {!hasRun && !isRunning && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
              <Search className="w-8 h-8 text-amber-400" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono text-center max-w-md">
              The engine will test <span className="text-amber-400 font-bold">thousands of strategy combinations</span> against{' '}
              <span className="text-[#39ff14] font-bold">real OANDA M30 candles</span> — no random data, no PRNG simulation.
              Every result is validated with 1.5-pip friction tax and 20% drawdown kill filter.
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
            <button onClick={runOptimization} disabled={isRunning}
              className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-black font-bold text-xs tracking-widest uppercase rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2">
              <Cpu className="w-4 h-4" />RUN LIVE DATA OPTIMIZATION
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {isRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 space-y-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full" />
            <p className="text-[10px] text-amber-400 font-mono animate-pulse">Fetching real OANDA candles & running bar-by-bar simulation...</p>
            <p className="text-[8px] text-slate-500 font-mono">This uses live market data — may take 30-60 seconds</p>
          </motion.div>
        )}

        {/* Results */}
        {hasRun && !isRunning && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Summary bar */}
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[9px] font-mono text-slate-400">
                    <span className="text-amber-400 font-bold">{totalCombos}</span> combos tested ·{' '}
                    <span className="text-[#ff0055] font-bold">{rejectedCombos}</span> rejected (20% DD)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#39ff14]" />
                  <span className="text-[9px] font-mono text-slate-400">
                    Best Inst. PF: <span className="text-[#39ff14] font-bold">{topProfiles[0]?.institutionalPF ?? 0}</span>
                  </span>
                </div>
                {dateRange && (
                  <span className="text-[8px] font-mono text-slate-600">
                    {new Date(dateRange.start).toLocaleDateString()} → {new Date(dateRange.end).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHeatmap(!showHeatmap)}
                  className="text-[8px] font-mono text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />{showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
                </button>
                <button onClick={runOptimization}
                  className="text-[8px] font-mono text-amber-500 hover:text-amber-300 transition-colors flex items-center gap-1">
                  <Cpu className="w-3 h-3" />Re-run
                </button>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4">
              <h3 className="text-[9px] font-bold text-amber-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Top 10 Profiles — Ranked by Institutional Profit Factor (Real Data)
              </h3>
              <div className="space-y-2">
                {topProfiles.map((p, idx) => {
                  const finalEquity = p.equityCurve.length > 0 ? p.equityCurve[p.equityCurve.length - 1].equity : 1000;
                  const totalReturn = ((finalEquity - 1000) / 1000) * 100;
                  return (
                    <motion.button key={idx} onClick={() => setSelectedProfile(p)} whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}
                      className={`w-full text-left rounded-xl border transition-all p-3 ${selectedProfile?.rank === p.rank ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800/50 bg-slate-900/30 hover:border-slate-700/50'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono shrink-0 ${idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : idx === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40' : idx === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/40' : 'bg-slate-800/50 text-slate-500 border border-slate-700/40'}`}>
                          #{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold font-mono text-slate-200">#{p.predator} vs #{p.prey}</span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">{p.gates}</span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#ff0055]/10 text-[#ff0055] border border-[#ff0055]/20">{p.slLabel}</span>
                            <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#00ffea]/10 text-[#00ffea] border border-[#00ffea]/20">{p.session}</span>
                            <span className="text-[6px] font-mono px-1 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20">LIVE DATA</span>
                          </div>
                        </div>
                        <div className="w-24 shrink-0 hidden sm:block"><MiniCurve curve={p.equityCurve} height={40} /></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                        {[
                          { l: 'Inst. Profit', v: `$${p.institutionalProfit.toFixed(0)}`, c: p.institutionalProfit >= 0 ? '#39ff14' : '#ff0055' },
                          { l: 'Agg. Profit', v: `$${p.aggressiveProfit.toFixed(0)}`, c: p.aggressiveProfit >= 0 ? '#ffaa00' : '#ff0055' },
                          { l: 'Win Rate', v: `${p.winRate}%`, c: p.winRate >= 55 ? '#39ff14' : p.winRate >= 50 ? '#00ffea' : '#ff0055' },
                          { l: 'Inst. PF', v: `${p.institutionalPF}`, c: p.institutionalPF > 1.5 ? '#39ff14' : p.institutionalPF > 1 ? '#00ffea' : '#ff0055' },
                          { l: 'Max DD', v: `${p.maxDrawdown}%`, c: '#ff0055' },
                          { l: 'Net Pips', v: `${p.totalPips >= 0 ? '+' : ''}${p.totalPips}`, c: p.totalPips >= 0 ? '#39ff14' : '#ff0055' },
                          { l: 'Trades', v: `${p.trades}`, c: '#a855f7' },
                        ].map(kpi => (
                          <div key={kpi.l} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                            <div className="text-[7px] text-slate-500 uppercase tracking-wider">{kpi.l}</div>
                            <div className="text-sm font-bold font-mono" style={{ color: kpi.c }}>{kpi.v}</div>
                          </div>
                        ))}
                      </div>
                      <TimePeriodBreakdown curve={p.equityCurve} />
                      <StrategyIntelligencePanel profile={p} allTop={topProfiles} idx={idx} />
                      <CircuitBreakerPanel profile={p} />
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Heatmap */}
            <AnimatePresence>
              {showHeatmap && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 overflow-hidden">
                  <h3 className="text-[9px] font-bold text-amber-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />Profit Factor Heatmap — Rank × Stop Loss (Real Data)
                  </h3>
                  <ProfitFactorHeatmap results={allResults} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Selected Profile Equity Curve */}
            {selectedProfile && (
              <motion.div key={selectedProfile.rank} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <FullEquityChart curve={selectedProfile.equityCurve} profile={selectedProfile} />
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
