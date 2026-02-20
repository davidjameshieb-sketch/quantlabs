// Sovereign Matrix v20.0 — True Mechanical Chomp Dashboard
// 28-cross mathematical terrain | Rank 1 Predator vs Rank 8 Prey only
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Crosshair, Grid3x3, Lock, RefreshCw, Shield, Target, TrendingDown,
  TrendingUp, Wifi, Zap, Crown, Skull, BarChart3, Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSovereignMatrix, TIER_UNITS, pips } from '@/hooks/useSovereignMatrix';
import type { MatrixSignal, MatrixResult } from '@/hooks/useSovereignMatrix';

type Env = 'practice' | 'live';

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

// ─── Rank color mapping ─────────────────────────────────────────────────────
function getRankColor(rank: number): string {
  if (rank === 1) return '#00ffea'; // Teal - Predator
  if (rank === 2) return '#39ff14'; // Green
  if (rank === 3) return '#7fff00'; // Chartreuse
  if (rank === 4) return '#b8c400'; // Yellow-green
  if (rank === 5) return '#c4a000'; // Gold
  if (rank === 6) return '#ff8800'; // Orange
  if (rank === 7) return '#ff4400'; // Red-orange
  return '#ff0055'; // Rank 8 - Prey - Red
}

function getRankLabel(rank: number): string {
  if (rank === 1) return 'PREDATOR #1';
  if (rank === 8) return 'PREY #8';
  return `RANK #${rank}`;
}

// ─── SECTION: True Matrix Power Radar ──────────────────────────────────────
const PowerRadar = ({ result }: { result: MatrixResult }) => {
  const { currencyScores, currencyRanks, sortedCurrencies, predator, prey } = result;

  // Max absolute score for bar scaling
  const maxAbs = Math.max(0.0001, ...Object.values(currencyScores).map(Math.abs));

  return (
    <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">True Matrix · 28 Cross-Rates</h2>
        </div>
        <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">30M TERRAIN</span>
      </div>

      {/* Currency Rankings */}
      <div className="space-y-1.5">
        {sortedCurrencies.map((cur, idx) => {
          const rank = currencyRanks[cur] ?? idx + 1;
          const score = currencyScores[cur] ?? 0;
          const color = getRankColor(rank);
          const pct = Math.min(100, (Math.abs(score) / maxAbs) * 100);
          const isPredator = rank === 1;
          const isPrey = rank === 8;

          return (
            <motion.div
              key={cur}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                'relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all',
                isPredator && 'border-[#00ffea]/40 bg-[#00ffea]/5 shadow-[0_0_12px_rgba(0,255,234,0.1)]',
                isPrey && 'border-[#ff0055]/40 bg-[#ff0055]/5',
                !isPredator && !isPrey && 'border-slate-800/60 bg-slate-800/20'
              )}
            >
              {/* Rank badge */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold font-mono shrink-0"
                style={{ background: `${color}22`, border: `1px solid ${color}66`, color }}
              >
                {rank}
              </div>

              {/* Flag + currency */}
              <span className="text-base leading-none">{FLAGS[cur]}</span>
              <span className="w-8 font-bold text-white font-mono text-xs">{cur}</span>

              {/* Strength bar */}
              <div className="flex-1 relative h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.05 }}
                  className="absolute top-0 h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }}
                />
              </div>

              {/* Score */}
              <span className="w-16 text-right font-bold font-mono text-[10px] tabular-nums" style={{ color }}>
                {score > 0 ? '+' : ''}{score.toFixed(4)}
              </span>

              {/* Predator/Prey crown/skull */}
              {isPredator && <Crown className="w-3.5 h-3.5 text-[#00ffea] shrink-0" />}
              {isPrey && <Skull className="w-3.5 h-3.5 text-[#ff0055] shrink-0" />}
            </motion.div>
          );
        })}
      </div>

      {/* Best Chomp */}
      <div className="mt-auto bg-gradient-to-br from-yellow-950/40 to-slate-950 border border-yellow-500/30 rounded-xl p-3.5">
        <p className="text-[8px] text-yellow-500/70 mb-2 tracking-[0.2em] uppercase">⚡ Authorized Chomp Terrain</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-center">
              <div className="text-[8px] text-[#00ffea]/60 mb-0.5">PREDATOR</div>
              <div className="flex items-center gap-1">
                <span className="text-sm">{FLAGS[predator]}</span>
                <span className="font-bold text-[#00ffea] font-mono">{predator}</span>
                <Crown className="w-3 h-3 text-[#00ffea]" />
              </div>
              <div className="text-[8px] text-slate-500 font-mono">Rank #1 · {(currencyScores[predator] ?? 0) > 0 ? '+' : ''}{(currencyScores[predator] ?? 0).toFixed(4)}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-yellow-500/60" />
            <div className="text-center">
              <div className="text-[8px] text-[#ff0055]/60 mb-0.5">PREY</div>
              <div className="flex items-center gap-1">
                <span className="text-sm">{FLAGS[prey]}</span>
                <span className="font-bold text-[#ff0055] font-mono">{prey}</span>
                <Skull className="w-3 h-3 text-[#ff0055]" />
              </div>
              <div className="text-[8px] text-slate-500 font-mono">Rank #8 · {(currencyScores[prey] ?? 0).toFixed(4)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-yellow-500/60 mb-0.5">ΔSTRENGTH</div>
            <div className="font-bold text-yellow-400 font-mono text-sm">
              {Math.abs((currencyScores[predator] ?? 0) - (currencyScores[prey] ?? 0)).toFixed(4)}
            </div>
            <div className="text-[8px] text-yellow-500/40">terrain gap</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SECTION: Gate Detail Chip ──────────────────────────────────────────────
const GateChip = ({ open, label, detail, dir }: { open: boolean; label: string; detail?: string; dir?: string }) => {
  const color = open
    ? dir === 'SHORT' ? '#ff0055' : '#00ffea'
    : '#374151';
  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-all',
      open ? 'bg-opacity-10' : 'opacity-40'
    )} style={{
      borderColor: `${color}66`,
      background: `${color}11`,
      color: open ? color : '#6b7280'
    }}>
      <div className={cn('w-1.5 h-1.5 rounded-full', open ? 'animate-pulse' : '')}
        style={{ background: color }} />
      <span className="font-bold">{label}</span>
      {detail && <span className="opacity-60 max-w-[80px] truncate">{detail}</span>}
    </div>
  );
};

// ─── SECTION: Triple-Lock Scanner ──────────────────────────────────────────
const TripleLockScanner = ({ signals, ranks, scores }: {
  signals: MatrixSignal[];
  ranks: Record<string, number>;
  scores: Record<string, number>;
}) => (
  <div className="lg:col-span-8 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
    <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
      <div className="flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-purple-400" />
        <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Triple-Lock Execution Scanner</h2>
      </div>
      <span className="text-[8px] font-mono text-slate-500">
        G1=Rank Elite · G2=Atlas Snap · G3=David Vector
      </span>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[680px]">
        <thead>
          <tr className="text-[9px] text-slate-500 tracking-widest uppercase">
            <th className="pb-2 pr-3">Pair</th>
            <th className="pb-2 pr-3">Ranks</th>
            <th className="pb-2 pr-3">Direction</th>
            <th className="pb-2 pr-3 text-center">G1 Terrain</th>
            <th className="pb-2 pr-3 text-center">G2 Snap</th>
            <th className="pb-2 pr-3 text-center">G3 Vector</th>
            <th className="pb-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/30">
          {signals.map((s, idx) => {
            const isStrike = s.triplelock;
            const dir = s.direction?.toUpperCase() ?? 'NEUTRAL';
            const isLong = s.direction === 'long';
            const isShort = s.direction === 'short';
            const isJPY = s.instrument.includes('JPY');
            const slope = s.gate3Detail?.slope ?? 0;
            const gateCount = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
            const baseColor = getRankColor(s.baseRank ?? 4);
            const quoteColor = getRankColor(s.quoteRank ?? 4);

            return (
              <motion.tr
                key={s.instrument}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className={cn(
                  'hover:bg-slate-800/20 transition-colors',
                  isStrike && 'bg-gradient-to-r from-[#00ffea]/5 to-transparent'
                )}
              >
                {/* Pair */}
                <td className="py-2.5 pr-3">
                  <span className={cn(
                    'font-bold font-mono text-xs',
                    isStrike ? (isLong ? 'text-[#00ffea]' : 'text-[#ff0055]') : 'text-white'
                  )}>
                    {s.instrument.replace('_', '/')}
                  </span>
                </td>

                {/* Ranks */}
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${baseColor}22`, color: baseColor, border: `1px solid ${baseColor}44` }}>
                      #{s.baseRank ?? '?'} {s.baseCurrency}
                    </span>
                    <span className="text-slate-600 text-[8px]">vs</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${quoteColor}22`, color: quoteColor, border: `1px solid ${quoteColor}44` }}>
                      #{s.quoteRank ?? '?'} {s.quoteCurrency}
                    </span>
                  </div>
                </td>

                {/* Direction */}
                <td className="py-2.5 pr-3">
                  <span className={cn(
                    'flex items-center gap-1 text-[10px] font-bold font-mono',
                    isLong ? 'text-[#00ffea]' : isShort ? 'text-[#ff0055]' : 'text-slate-600'
                  )}>
                    {isLong && <TrendingUp className="w-3 h-3" />}
                    {isShort && <TrendingDown className="w-3 h-3" />}
                    {dir}
                  </span>
                </td>

                {/* G1 */}
                <td className="py-2.5 pr-3 text-center">
                  <GateChip
                    open={s.gate1}
                    label="G1"
                    detail={s.gate1 ? `#${s.baseRank}v#${s.quoteRank}` : 'No Elite'}
                    dir={dir}
                  />
                </td>

                {/* G2 */}
                <td className="py-2.5 pr-3 text-center">
                  <GateChip
                    open={s.gate2}
                    label="G2"
                    detail={s.gate2
                      ? `BRK ${isLong ? 'HIGH' : 'LOW'}`
                      : `${Math.abs(s.gate2Detail.close - (isLong ? s.gate2Detail.highest20 : s.gate2Detail.lowest20)).toFixed(isJPY ? 3 : 5)}`}
                    dir={dir}
                  />
                </td>

                {/* G3 */}
                <td className="py-2.5 pr-3 text-center">
                  <GateChip
                    open={s.gate3}
                    label="G3"
                    detail={`m=${slope > 0 ? '+' : ''}${slope.toExponential(1)}`}
                    dir={dir}
                  />
                </td>

                {/* Status */}
                <td className="py-2.5 text-right">
                  {isStrike ? (
                    <motion.span
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider border',
                        isLong
                          ? 'bg-[#00ffea]/10 text-[#00ffea] border-[#00ffea]/50 shadow-[0_0_12px_rgba(0,255,234,0.2)]'
                          : 'bg-[#ff0055]/10 text-[#ff0055] border-[#ff0055]/50 shadow-[0_0_12px_rgba(255,0,85,0.2)]'
                      )}
                    >
                      <Zap className="w-2.5 h-2.5" /> STRIKE
                    </motion.span>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          i < gateCount ? 'bg-yellow-500' : 'bg-slate-700'
                        )} />
                      ))}
                      <span className="text-[9px] text-slate-600 font-mono ml-1">{gateCount}/3</span>
                    </div>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── SECTION: Strike Execution Card ────────────────────────────────────────
const StrikeExecutionCard = ({
  signal, onFireT1, onFireT2, onFireT3, loading, environment,
}: {
  signal: MatrixSignal; onFireT1: () => void; onFireT2: () => void;
  onFireT3: () => void; loading: boolean; environment: Env;
}) => {
  const isLong = signal.direction === 'long';
  const isJPY = signal.instrument.includes('JPY');
  const decimals = isJPY ? 3 : 5;
  const pair = signal.instrument.replace('_', '/');
  const color = isLong ? '#00ffea' : '#ff0055';

  const hardSL = (signal.currentPrice - (isLong ? 1 : -1) * pips(15, signal.instrument)).toFixed(decimals);
  const hardTP = (signal.currentPrice + (isLong ? 1 : -1) * pips(50, signal.instrument)).toFixed(decimals);
  const ratchetAt = (signal.currentPrice + (isLong ? 1 : -1) * pips(20, signal.instrument)).toFixed(decimals);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border p-5 space-y-4"
      style={{
        borderColor: `${color}50`,
        background: `linear-gradient(135deg, ${color}08, transparent)`,
        boxShadow: `0 0 40px ${color}15, inset 0 0 40px ${color}05`,
      }}
    >
      {/* Animated background glow */}
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}30, transparent)` }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
            <Lock className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <div className="font-bold text-sm font-mono" style={{ color }}>
              ⚡ SOVEREIGN STRIKE — {pair}
            </div>
            <div className="text-[9px] text-slate-500 font-mono">
              Rank #{signal.baseRank} {signal.baseCurrency} {isLong ? 'LONG' : 'SHORT'} Rank #{signal.quoteRank} {signal.quoteCurrency}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono px-2 py-0.5 rounded border font-bold"
            style={{ borderColor: `${color}40`, color, background: `${color}10` }}>
            3/3 GATES OPEN
          </span>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
            {signal.direction?.toUpperCase()} @ {signal.currentPrice.toFixed(decimals)}
          </span>
        </div>
      </div>

      {/* Score info row */}
      <div className="relative flex items-center gap-4 flex-wrap text-[9px] font-mono">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
          style={{ borderColor: `${getRankColor(signal.baseRank)}44`, background: `${getRankColor(signal.baseRank)}11` }}>
          <span className="text-white">{FLAGS[signal.baseCurrency]}</span>
          <span style={{ color: getRankColor(signal.baseRank) }}>#{signal.baseRank} {signal.baseCurrency}</span>
          <span className="text-slate-500">{signal.baseScore > 0 ? '+' : ''}{signal.baseScore.toFixed(4)}</span>
        </div>
        <span className="text-slate-600">vs</span>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
          style={{ borderColor: `${getRankColor(signal.quoteRank)}44`, background: `${getRankColor(signal.quoteRank)}11` }}>
          <span className="text-white">{FLAGS[signal.quoteCurrency]}</span>
          <span style={{ color: getRankColor(signal.quoteRank) }}>#{signal.quoteRank} {signal.quoteCurrency}</span>
          <span className="text-slate-500">{signal.quoteScore > 0 ? '+' : ''}{signal.quoteScore.toFixed(4)}</span>
        </div>
        <span className="text-slate-500">· LinReg slope: {signal.gate3Detail?.slope?.toExponential(2)}</span>
      </div>

      {/* Risk Rails */}
      <div className="relative grid grid-cols-3 gap-2 text-[9px]">
        <div className="bg-slate-950 border border-[#ff0055]/30 p-2.5 rounded-lg text-center">
          <span className="text-[#ff0055] block font-bold mb-1 uppercase tracking-wider">Hard SL</span>
          <span className="text-white font-mono text-xs">{hardSL}</span>
          <span className="text-slate-500 block mt-0.5">−15 pips</span>
        </div>
        <div className="bg-slate-950 border border-yellow-500/30 p-2.5 rounded-lg text-center relative">
          <Lock className="w-2.5 h-2.5 text-yellow-500 absolute top-1.5 right-1.5" />
          <span className="text-yellow-500 block font-bold mb-1 uppercase tracking-wider">Ratchet</span>
          <span className="text-white font-mono text-xs">{ratchetAt}</span>
          <span className="text-slate-500 block mt-0.5">+20p → SL+2p</span>
        </div>
        <div className="bg-slate-950 border border-[#00ffea]/30 p-2.5 rounded-lg text-center">
          <span className="text-[#00ffea] block font-bold mb-1 uppercase tracking-wider">Hard TP</span>
          <span className="text-white font-mono text-xs">{hardTP}</span>
          <span className="text-slate-500 block mt-0.5">+50 pips</span>
        </div>
      </div>

      {/* Execution Buttons */}
      <div className="relative grid grid-cols-3 gap-2">
        <button
          onClick={onFireT1}
          disabled={loading}
          className={cn(
            'h-10 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
            loading && 'opacity-50 cursor-not-allowed'
          )}
          style={{
            background: color,
            color: '#0a0f1a',
            boxShadow: `0 0 20px ${color}60`,
          }}
        >
          <Zap className="w-3.5 h-3.5" /> T1 {TIER_UNITS.T1}u
        </button>
        <button
          onClick={onFireT2}
          disabled={loading}
          className={cn(
            'h-10 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider border transition-all',
            loading && 'opacity-50 cursor-not-allowed'
          )}
          style={{ borderColor: `${color}50`, color, background: `${color}10` }}
        >
          T2 +15p {TIER_UNITS.T2}u
        </button>
        <button
          onClick={onFireT3}
          disabled={loading}
          className={cn(
            'h-10 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider border border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10 transition-all',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          T3 +30p 250u
        </button>
      </div>
    </motion.div>
  );
};

// ─── SECTION: Currency Strength Heatmap Row ─────────────────────────────────
const StrengthHeatmap = ({ result }: { result: MatrixResult }) => {
  const { currencyScores, currencyRanks, sortedCurrencies } = result;

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-yellow-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Global Currency Terrain — 28 Cross-Rate Mosaic</h2>
        </div>
        <span className="text-[8px] font-mono text-slate-500">Strongest → Weakest</span>
      </div>

      <div className="grid grid-cols-8 gap-2">
        {sortedCurrencies.map((cur, idx) => {
          const rank = currencyRanks[cur] ?? idx + 1;
          const score = currencyScores[cur] ?? 0;
          const color = getRankColor(rank);
          const isPredator = rank === 1;
          const isPrey = rank === 8;

          return (
            <motion.div
              key={cur}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="relative flex flex-col items-center gap-2 p-3 rounded-xl border text-center"
              style={{
                borderColor: `${color}40`,
                background: `linear-gradient(180deg, ${color}12, ${color}05)`,
                boxShadow: isPredator ? `0 0 20px ${color}25` : isPrey ? `0 0 20px ${color}20` : 'none',
              }}
            >
              {/* Crown/skull */}
              {isPredator && <Crown className="absolute top-1.5 right-1.5 w-3 h-3" style={{ color }} />}
              {isPrey && <Skull className="absolute top-1.5 right-1.5 w-3 h-3" style={{ color }} />}

              {/* Rank number */}
              <div className="text-[8px] font-mono font-bold" style={{ color: `${color}99` }}>#{rank}</div>

              {/* Flag */}
              <span className="text-2xl leading-none">{FLAGS[cur]}</span>

              {/* Currency */}
              <span className="font-bold font-mono text-xs text-white">{cur}</span>

              {/* Score */}
              <span className="text-[9px] font-mono font-bold" style={{ color }}>
                {score > 0 ? '+' : ''}{score.toFixed(4)}
              </span>

              {/* Visual strength pip bar */}
              <div className="w-full grid grid-cols-4 gap-px">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-1 rounded-full" style={{
                    background: i < (8 - rank) / 2 + 1 ? color : `${color}20`
                  }} />
                ))}
              </div>

              {/* Role label */}
              <div className="text-[7px] uppercase tracking-wider font-mono" style={{ color: `${color}80` }}>
                {isPredator ? 'PREDATOR' : isPrey ? 'PREY' : rank <= 3 ? 'STRONG' : rank >= 6 ? 'WEAK' : 'NEUTRAL'}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ─── SECTION: Kinetic Pyramid ───────────────────────────────────────────────
const KineticPyramid = () => (
  <div className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
    <div className="flex items-center gap-2 border-b border-slate-700/40 pb-3">
      <TrendingUp className="w-4 h-4 text-[#00ffea]" />
      <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Kinetic Pyramid — 1,250u Scaling</h2>
    </div>

    <div className="flex justify-around items-end h-28 gap-3 px-2">
      {[
        { label: 'T1 @ STRIKE', units: '500u', desc: 'Market entry', color: '#00ffea', h: 40 },
        { label: 'T2 @ +15 Pips', units: '500u', desc: 'Scale entry', color: '#39ff14', h: 68 },
        { label: 'T3 @ +30 Pips', units: '250u', desc: 'Final scale', color: '#7fff00', h: 96 },
      ].map(({ label, units, desc, color, h }) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: h }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="w-full rounded-t-lg flex items-center justify-center font-bold text-xs font-mono border"
            style={{
              background: `${color}20`,
              borderColor: `${color}60`,
              color,
              boxShadow: `0 0 12px ${color}30`,
            }}
          >
            {units}
          </motion.div>
          <span className="text-[8px] text-slate-500 text-center leading-tight">{label}</span>
          <span className="text-[7px] text-slate-600 text-center">{desc}</span>
        </div>
      ))}
    </div>

    <div className="bg-slate-950 p-3.5 rounded-xl border border-yellow-500/20">
      <p className="text-[8px] text-yellow-500/70 mb-2 uppercase tracking-widest text-center">Weighted Anchor Formula</p>
      <code className="block text-center text-yellow-400 text-[10px] font-mono bg-yellow-500/8 py-2 rounded border border-yellow-500/10">
        P_anchor = (500×P1 + 500×P2 + 250×P3) / 1250
      </code>
      <p className="text-[8px] text-yellow-500/40 mt-1.5 text-center">Unified risk line · Hard SL = P_anchor −15p</p>
    </div>
  </div>
);

// ─── SECTION: Safety Rails ──────────────────────────────────────────────────
const SafetyRails = () => (
  <div className="lg:col-span-7 bg-slate-900/80 backdrop-blur-md border border-[#ff0055]/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
    <div className="flex items-center gap-2 border-b border-slate-700/40 pb-3">
      <Shield className="w-4 h-4 text-[#ff0055]" />
      <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Safety Rails & Exit Protocol</h2>
    </div>

    <div className="grid grid-cols-1 gap-3">
      {[
        {
          color: '#ff0055', icon: AlertTriangle,
          title: 'Rule 1 — Vector Flip (Primary Exit)',
          desc: 'LinReg slope (m) changes sign → EXIT ALL POSITIONS immediately. The terrain has shifted against you.',
        },
        {
          color: '#a855f7', icon: Zap,
          title: 'Rule 2 — Rank Collapse (Matrix Decouple)',
          desc: 'Base or Quote currency rank shifts by 3+ positions → EXIT ALL POSITIONS. The #1 is no longer #1.',
        },
        {
          color: '#f59e0b', icon: Lock,
          title: 'Rule 3 — Ratchet Protocol',
          desc: 'At +20 pips profit → move SL to P_anchor + 2p. You are now trading with house money.',
        },
      ].map(({ color, icon: Icon, title, desc }) => (
        <div key={title} className="flex gap-3 p-3 rounded-xl border"
          style={{ borderColor: `${color}30`, background: `${color}08` }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>{title}</p>
            <p className="text-[9px] text-slate-400 leading-relaxed">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── SECTION: Live Trades Panel ─────────────────────────────────────────────
interface OpenTrade {
  id: string;
  currency_pair: string;
  direction: string;
  units: number;
  entry_price: number | null;
  status: string;
  agent_id: string | null;
  created_at: string;
  environment: string;
  signal_id: string;
}

const LiveTradesPanel = ({ environment }: { environment: Env }) => {
  const [trades, setTrades] = useState<OpenTrade[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchTrades = async () => {
    setFetching(true);
    const { data } = await supabase
      .from('oanda_orders')
      .select('id, currency_pair, direction, units, entry_price, status, agent_id, created_at, environment, signal_id')
      .in('status', ['filled', 'open'])
      .order('created_at', { ascending: false })
      .limit(20);
    setTrades((data as OpenTrade[]) ?? []);
    setFetching(false);
  };

  useEffect(() => { fetchTrades(); }, [environment]);

  useEffect(() => {
    const channel = supabase
      .channel('live-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, () => {
        fetchTrades();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [environment]);

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-yellow-500/20 rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-yellow-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Live Payload Tracking — {environment.toUpperCase()}
          </h2>
        </div>
        {!fetching && trades.length > 0 && (
          <span className="flex items-center gap-1.5 text-[9px] font-mono text-yellow-400">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            {trades.length} ACTIVE
          </span>
        )}
      </div>

      {fetching ? (
        <div className="py-5 text-center text-[10px] text-slate-500 tracking-widest uppercase animate-pulse font-mono">
          Syncing positions…
        </div>
      ) : trades.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-[10px] text-slate-500 tracking-widest uppercase font-mono">No Active Payloads</p>
          <p className="text-[9px] text-slate-700 font-mono">Fire T1 on a SOVEREIGN STRIKE to deploy</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {trades.map((t) => {
            const isLong = t.direction === 'long';
            const isJPY = t.currency_pair.includes('JPY');
            const dp = isJPY ? 3 : 5;
            const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
            const color = isLong ? '#00ffea' : '#ff0055';

            return (
              <div key={t.id} className="flex flex-col gap-2 p-3.5 rounded-xl border"
                style={{ borderColor: `${color}30`, background: `${color}08` }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold font-mono text-sm" style={{ color }}>
                    {t.currency_pair.replace('_', '/')} {t.direction.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-mono"
                    style={{ color: '#00ffea' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ffea] animate-pulse" />
                    LIVE
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[9px]">
                  <div>
                    <div className="text-slate-500 mb-0.5 uppercase tracking-wider text-[7px]">Units</div>
                    <div className="font-bold text-white font-mono">{t.units.toLocaleString()}u</div>
                  </div>
                  <div>
                    <div className="text-yellow-500/70 mb-0.5 uppercase tracking-wider text-[7px]">Entry</div>
                    <div className="font-bold text-yellow-400 font-mono">
                      {t.entry_price ? t.entry_price.toFixed(dp) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-0.5 uppercase tracking-wider text-[7px]">Age</div>
                    <div className="font-bold text-slate-300 font-mono">{age}m</div>
                  </div>
                </div>
                <div className="text-[8px] text-slate-600 font-mono truncate">{t.agent_id ?? 'system'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── MAIN DASHBOARD ─────────────────────────────────────────────────────────
const SovereignMatrix = () => {
  const [environment, setEnvironment] = useState<Env>('live');
  const { loading, matrixResult, error, scanMatrix, fireT1, fireT2, fireT3 } = useSovereignMatrix();

  const handleScan = () => scanMatrix(environment);

  return (
    <div className="min-h-screen text-slate-300 font-mono overflow-x-hidden"
      style={{ background: 'hsl(230 30% 3%)' }}>

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, #00ffea, transparent)' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-8"
          style={{ background: 'radial-gradient(circle, #ff0055, transparent)' }} />
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 backdrop-blur-md border-b border-slate-800/60 px-6 py-3"
        style={{ background: 'hsl(230 30% 3% / 0.85)' }}>
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#00ffea22', border: '1px solid #00ffea44' }}>
                <Activity className="w-4 h-4 text-[#00ffea]" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-lg border border-[#00ffea]"
              />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-tighter leading-none font-display">
                SOVEREIGN MATRIX <span className="text-slate-600 font-light text-xs">v20.0</span>
              </h1>
              <p className="text-[8px] text-slate-500 tracking-[0.15em] mt-0.5">
                28-CROSS TRUE TERRAIN · RANK #1 vs #8 ONLY · 30M MACRO
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/oanda">
              <button className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all">
                <Wifi className="w-3 h-3" /> OANDA
              </button>
            </Link>

            {/* Env toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-700/50 bg-slate-900">
              {(['practice', 'live'] as Env[]).map((env) => (
                <button key={env} onClick={() => setEnvironment(env)}
                  className={cn(
                    'text-[9px] font-mono px-3 py-1.5 rounded transition-all font-bold uppercase tracking-wider',
                    environment === env
                      ? env === 'live'
                        ? 'bg-[#ff0055] text-white shadow-[0_0_10px_rgba(255,0,85,0.4)]'
                        : 'bg-slate-600 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  )}>
                  {env === 'live' && <span className="mr-1">🔴</span>}
                  {env.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={handleScan}
              disabled={loading}
              className={cn(
                'flex items-center gap-2 text-[10px] font-mono px-5 py-2 rounded-lg font-bold uppercase tracking-wider transition-all',
                'text-slate-950 hover:opacity-90',
                loading && 'opacity-60 cursor-not-allowed'
              )}
              style={{
                background: '#00ffea',
                boxShadow: '0 0 20px rgba(0,255,234,0.4)',
              }}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              {loading ? 'Scanning 28 Crosses…' : 'Run True Matrix Scan'}
            </button>
          </div>
        </div>
      </header>

      <div className="relative max-w-[1440px] mx-auto p-6 space-y-5">
        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 p-3.5 rounded-xl border border-[#ff0055]/30 bg-[#ff0055]/10 text-[#ff0055] text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}

        {/* Idle State */}
        {!matrixResult && !loading && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="py-24 text-center space-y-5">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: '#00ffea15', border: '1px solid #00ffea40' }}
            >
              <Grid3x3 className="w-8 h-8 text-[#00ffea]" />
            </motion.div>
            <div>
              <h2 className="text-lg font-bold text-white font-display mb-2">True Matrix · 28 Cross-Rate Terrain</h2>
              <p className="text-sm text-slate-400 mb-1">Mathematically ranks all 8 major currencies from 1 to 8</p>
              <p className="text-[10px] text-slate-600 tracking-widest">
                Only #1 Predator vs #8 Prey can authorize a SOVEREIGN STRIKE
              </p>
            </div>
            <div className="flex items-center justify-center gap-6 text-[9px] font-mono text-slate-600">
              <span>G1 · ELITE RANK FILTER (#1 vs #8)</span>
              <span>·</span>
              <span>G2 · ATLAS SNAP (20-period breakout)</span>
              <span>·</span>
              <span>G3 · DAVID VECTOR (LinReg slope)</span>
            </div>
            <button
              onClick={handleScan}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-slate-950 transition-all hover:opacity-90"
              style={{ background: '#00ffea', boxShadow: '0 0 30px rgba(0,255,234,0.4)' }}
            >
              <Zap className="w-4 h-4" /> Scan 28 Cross-Rate Terrain
            </button>
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="py-16 text-center space-y-4">
            <div className="flex justify-center gap-2">
              {['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'].map((c, i) => (
                <motion.div key={c}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.15 }}
                  className="flex flex-col items-center gap-1">
                  <span className="text-lg">{FLAGS[c]}</span>
                  <span className="text-[8px] font-mono text-slate-500">{c}</span>
                </motion.div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 tracking-widest font-mono animate-pulse">
              COMPUTING 28 CROSS-RATE TERRAIN…
            </p>
          </motion.div>
        )}

        {/* Results */}
        {matrixResult && !loading && (
          <AnimatePresence>
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Meta badges */}
              <div className="flex items-center gap-2 flex-wrap mb-5">
                <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                  🕐 {new Date(matrixResult.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn(
                  'text-[9px] font-mono px-2.5 py-1 rounded-lg border font-bold',
                  matrixResult.strikeCount > 0
                    ? 'border-[#00ffea]/40 text-[#00ffea] bg-[#00ffea]/10 shadow-[0_0_12px_rgba(0,255,234,0.15)]'
                    : 'border-slate-700 text-slate-500 bg-slate-900/50'
                )}>
                  <Zap className="inline w-2.5 h-2.5 mr-1" />
                  {matrixResult.strikeCount} TRIPLE-LOCK {matrixResult.strikeCount !== 1 ? 'STRIKES' : 'STRIKE'}
                </span>
                <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 bg-slate-900/50">
                  {matrixResult.environment.toUpperCase()} · {matrixResult.signals.length} pairs
                </span>
                <span className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-yellow-500/30 text-yellow-500/80 bg-yellow-500/5">
                  28 CROSSES COMPUTED
                </span>
              </div>

              {/* ── Main Layout ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Heatmap row — full width */}
                <StrengthHeatmap result={matrixResult} />

                {/* Power Radar (left) + Scanner (right) */}
                <PowerRadar result={matrixResult} />
                <TripleLockScanner
                  signals={matrixResult.signals}
                  ranks={matrixResult.currencyRanks}
                  scores={matrixResult.currencyScores}
                />

                {/* Strike Cards — full width */}
                {matrixResult.strikes.length > 0 && (
                  <div className="lg:col-span-12 space-y-3">
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      >
                        <Zap className="w-4 h-4 text-[#00ffea]" />
                      </motion.div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                        Sovereign Strikes — Rank #1 vs #8 · All 3 Gates Open · Deploy Payload
                      </p>
                    </div>
                    {matrixResult.strikes.map((signal) => (
                      <StrikeExecutionCard
                        key={signal.instrument}
                        signal={signal}
                        environment={environment}
                        onFireT1={() => fireT1(signal, environment)}
                        onFireT2={() => fireT2(signal, environment)}
                        onFireT3={() => fireT3(signal, environment)}
                        loading={loading}
                      />
                    ))}
                  </div>
                )}

                {/* Live Trades */}
                <LiveTradesPanel environment={environment} />

                {/* Pyramid + Safety Rails */}
                <KineticPyramid />
                <SafetyRails />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default SovereignMatrix;
