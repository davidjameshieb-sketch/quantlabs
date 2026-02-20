// Gate Flow Chart — Currency Pair Gate Progress Visualization
// Each pair shown as a vertical "candle-like" bar:
//   - Height maps to gate score (0–3 gates open)
//   - Color = Long (cyan) / Short (red) / Neutral (slate)
//   - Inner segments show G1 / G2 / G3 individually
//   - Particle shimmer on Triple-Lock strikes

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, Minus, Filter, ChevronDown } from 'lucide-react';
import type { MatrixSignal } from '@/hooks/useSovereignMatrix';

interface Props {
  signals: MatrixSignal[];
}

type FlowFilter = 'all' | 'long' | 'short' | 'neutral';
type SortMode = 'gates' | 'pair' | 'strength';

const LONG_COLOR  = '#00ffea';
const SHORT_COLOR = '#ff0055';
const NEUTRAL_COLOR = '#475569';
const G1_COLOR = '#facc15'; // yellow
const G2_COLOR = '#f97316'; // orange
const G3_COLOR = '#39ff14'; // neon green

function gateCount(s: MatrixSignal) {
  return [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
}

function flowColor(s: MatrixSignal): string {
  if (s.triplelock) return s.direction === 'long' ? LONG_COLOR : SHORT_COLOR;
  if (s.direction === 'long') return LONG_COLOR;
  if (s.direction === 'short') return SHORT_COLOR;
  return NEUTRAL_COLOR;
}

// ── Gate Segment Bar ─────────────────────────────────────────────────────────
function GateBar({ signal, isSelected, onClick }: {
  signal: MatrixSignal;
  isSelected: boolean;
  onClick: () => void;
}) {
  const gc = gateCount(signal);
  const isLong = signal.direction === 'long';
  const isShort = signal.direction === 'short';
  const isStrike = signal.triplelock;
  const primary = flowColor(signal);

  // Bar height: triple=100%, 2/3=66%, 1/3=33%, 0/3=12%
  const fillPct = gc === 3 ? 100 : gc === 2 ? 66 : gc === 1 ? 33 : 12;

  // Strength delta — bigger gap = taller shadow wick
  const strengthDelta = Math.abs(signal.baseScore - signal.quoteScore);

  const pair = signal.instrument.replace('_', '/');
  const baseTag = signal.baseCurrency;
  const quoteTag = signal.quoteCurrency;
  const isJPY = signal.instrument.includes('JPY');
  const pipsAway = signal.direction
    ? Math.abs(signal.gate2Detail.close - (isLong ? signal.gate2Detail.highest20 : signal.gate2Detail.lowest20))
    : null;
  const pipsStr = pipsAway != null
    ? `${(pipsAway / (isJPY ? 0.01 : 0.0001)).toFixed(1)}p`
    : '—';

  return (
    <motion.div
      onClick={onClick}
      className="relative flex flex-col items-center cursor-pointer group"
      style={{ width: 52, minWidth: 52 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Strike badge */}
      {isStrike && (
        <motion.div
          className="absolute -top-5 left-1/2 -translate-x-1/2 z-10"
          animate={{ opacity: [1, 0.5, 1], y: [0, -2, 0] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: primary }} />
        </motion.div>
      )}

      {/* ── Candle body + wick ── */}
      <div className="relative flex flex-col items-center" style={{ height: 120, width: 28 }}>
        {/* Top wick — represents strength delta */}
        <div
          className="rounded-full mx-auto"
          style={{
            width: 2,
            height: Math.max(4, Math.round(strengthDelta * 18000)),
            background: `${primary}55`,
          }}
        />

        {/* Main body: gate fill from bottom */}
        <div
          className="relative w-full flex-1 rounded overflow-hidden border"
          style={{
            borderColor: `${primary}44`,
            background: '#0f172a',
            boxShadow: isStrike ? `0 0 14px ${primary}50` : undefined,
          }}
        >
          {/* Gate fill layer — G1, G2, G3 stacked */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse" style={{ height: `${fillPct}%` }}>
            {/* G1 bottom segment */}
            <motion.div
              className="w-full"
              style={{
                height: '33.3%',
                background: signal.gate1
                  ? `linear-gradient(180deg, ${G1_COLOR}cc, ${G1_COLOR}77)`
                  : `${G1_COLOR}15`,
                borderTop: `1px solid ${G1_COLOR}33`,
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
            {/* G2 middle segment */}
            <motion.div
              className="w-full"
              style={{
                height: '33.3%',
                background: signal.gate2
                  ? `linear-gradient(180deg, ${G2_COLOR}cc, ${G2_COLOR}77)`
                  : `${G2_COLOR}15`,
                borderTop: `1px solid ${G2_COLOR}33`,
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
            {/* G3 top segment */}
            <motion.div
              className="w-full"
              style={{
                height: '33.3%',
                background: signal.gate3
                  ? `linear-gradient(180deg, ${G3_COLOR}cc, ${G3_COLOR}77)`
                  : `${G3_COLOR}15`,
                borderTop: `1px solid ${G3_COLOR}33`,
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            />
          </div>

          {/* Flow direction arrow overlay */}
          {signal.direction && (
            <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-60 transition-opacity">
              {isLong && <TrendingUp className="w-4 h-4" style={{ color: LONG_COLOR }} />}
              {isShort && <TrendingDown className="w-4 h-4" style={{ color: SHORT_COLOR }} />}
            </div>
          )}
        </div>

        {/* Bottom wick */}
        <div
          className="rounded-full mx-auto"
          style={{
            width: 2,
            height: Math.max(4, Math.round(strengthDelta * 10000)),
            background: `${primary}33`,
          }}
        />
      </div>

      {/* Pair label */}
      <div
        className="mt-1.5 text-center"
        style={{ fontSize: 8, fontFamily: 'Space Mono, monospace', color: isSelected ? primary : '#94a3b8', fontWeight: isSelected ? 700 : 400 }}
      >
        <div>{baseTag}</div>
        <div style={{ color: `${primary}80` }}>/</div>
        <div>{quoteTag}</div>
      </div>

      {/* Gate count pip row */}
      <div className="flex gap-0.5 mt-1">
        {[signal.gate1, signal.gate2, signal.gate3].map((open, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 5, height: 5,
              background: open ? [G1_COLOR, G2_COLOR, G3_COLOR][i] : '#1e293b',
              boxShadow: open ? `0 0 4px ${[G1_COLOR, G2_COLOR, G3_COLOR][i]}` : undefined,
            }}
          />
        ))}
      </div>

      {/* Pips away from G2 snap */}
      {!signal.gate2 && signal.direction && (
        <div style={{ fontSize: 7, fontFamily: 'Space Mono, monospace', color: '#64748b', marginTop: 2 }}>
          {pipsStr}
        </div>
      )}

      {/* Selection highlight border */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded border pointer-events-none"
          style={{ borderColor: `${primary}80` }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}
    </motion.div>
  );
}

// ── Selected Signal Detail Panel ─────────────────────────────────────────────
function SignalDetailPanel({ signal, onClose }: { signal: MatrixSignal; onClose: () => void }) {
  const isLong = signal.direction === 'long';
  const isShort = signal.direction === 'short';
  const primary = flowColor(signal);
  const pair = signal.instrument.replace('_', '/');
  const isJPY = signal.instrument.includes('JPY');
  const dec = isJPY ? 3 : 5;

  const g2Distance = signal.direction
    ? Math.abs(signal.gate2Detail.close - (isLong ? signal.gate2Detail.highest20 : signal.gate2Detail.lowest20))
    : null;
  const pipsToG2 = g2Distance != null ? (g2Distance / (isJPY ? 0.01 : 0.0001)).toFixed(1) : '—';

  const slope = signal.gate3Detail?.slope ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="relative rounded-xl border p-4 space-y-3"
      style={{
        borderColor: `${primary}40`,
        background: `linear-gradient(135deg, ${primary}08, #0f172a)`,
        boxShadow: `0 0 30px ${primary}15`,
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors text-xs"
      >✕</button>

      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="px-2.5 py-1 rounded font-bold font-mono text-sm"
          style={{ background: `${primary}18`, color: primary, border: `1px solid ${primary}40` }}
        >
          {pair}
        </div>
        <div className="flex items-center gap-1 text-xs font-mono" style={{ color: primary }}>
          {isLong && <><TrendingUp className="w-3.5 h-3.5" /> LONG FLOW</>}
          {isShort && <><TrendingDown className="w-3.5 h-3.5" /> SHORT FLOW</>}
          {!signal.direction && <><Minus className="w-3.5 h-3.5" /> NEUTRAL</>}
        </div>
        {signal.triplelock && (
          <motion.div
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.3 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold font-mono"
            style={{ background: `${primary}18`, color: primary, border: `1px solid ${primary}50` }}
          >
            <Zap className="w-2.5 h-2.5" /> SOVEREIGN STRIKE
          </motion.div>
        )}
      </div>

      {/* Currency rank duel */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-slate-500 mb-0.5">BASE</span>
          <span className="font-bold text-white">{signal.baseCurrency}</span>
          <span className="text-[9px]" style={{ color: '#00ffea' }}>Rank #{signal.baseRank}</span>
          <span className="text-[9px] text-slate-500">{signal.baseScore > 0 ? '+' : ''}{signal.baseScore.toFixed(4)}</span>
        </div>
        <div className="text-slate-600 text-sm">⚔️</div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-slate-500 mb-0.5">QUOTE</span>
          <span className="font-bold text-white">{signal.quoteCurrency}</span>
          <span className="text-[9px]" style={{ color: '#ff4400' }}>Rank #{signal.quoteRank}</span>
          <span className="text-[9px] text-slate-500">{signal.quoteScore > 0 ? '+' : ''}{signal.quoteScore.toFixed(4)}</span>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[9px] text-slate-500">Δ STRENGTH</div>
          <div className="font-bold text-yellow-400">{Math.abs(signal.baseScore - signal.quoteScore).toFixed(4)}</div>
          <div className="text-[9px] text-slate-500">SOB delta</div>
        </div>
      </div>

      {/* Gate breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {/* G1 */}
        <div
          className="rounded-lg p-2.5 space-y-1"
          style={{
            background: signal.gate1 ? `${G1_COLOR}12` : '#0f172a',
            border: `1px solid ${signal.gate1 ? G1_COLOR : '#1e293b'}55`,
          }}
        >
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: signal.gate1 ? G1_COLOR : '#374151' }} />
            <span className="text-[9px] font-bold font-mono" style={{ color: signal.gate1 ? G1_COLOR : '#6b7280' }}>G1 TERRAIN</span>
          </div>
          <div className="text-[8px] text-slate-400 leading-tight">
            Matrix rank elite filter<br />
            <span className="font-mono" style={{ color: signal.gate1 ? G1_COLOR : '#6b7280' }}>
              #{signal.baseRank} vs #{signal.quoteRank}
            </span>
          </div>
          <div className="text-[9px] font-mono font-bold" style={{ color: signal.gate1 ? G1_COLOR : '#4b5563' }}>
            {signal.gate1 ? '✓ OPEN' : '✗ BLOCKED'}
          </div>
        </div>

        {/* G2 */}
        <div
          className="rounded-lg p-2.5 space-y-1"
          style={{
            background: signal.gate2 ? `${G2_COLOR}12` : '#0f172a',
            border: `1px solid ${signal.gate2 ? G2_COLOR : '#1e293b'}55`,
          }}
        >
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: signal.gate2 ? G2_COLOR : '#374151' }} />
            <span className="text-[9px] font-bold font-mono" style={{ color: signal.gate2 ? G2_COLOR : '#6b7280' }}>G2 ATLAS</span>
          </div>
          <div className="text-[8px] text-slate-400 leading-tight">
            20-period structural snap<br />
            <span className="font-mono" style={{ color: signal.gate2 ? G2_COLOR : '#6b7280' }}>
              {signal.gate2
                ? `BRK ${isLong ? 'HIGH' : 'LOW'}`
                : `${pipsToG2}p away`}
            </span>
          </div>
          <div className="text-[8px] font-mono text-slate-500">
            H:{signal.gate2Detail.highest20.toFixed(dec)} L:{signal.gate2Detail.lowest20.toFixed(dec)}
          </div>
        </div>

        {/* G3 */}
        <div
          className="rounded-lg p-2.5 space-y-1"
          style={{
            background: signal.gate3 ? `${G3_COLOR}12` : '#0f172a',
            border: `1px solid ${signal.gate3 ? G3_COLOR : '#1e293b'}55`,
          }}
        >
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: signal.gate3 ? G3_COLOR : '#374151' }} />
            <span className="text-[9px] font-bold font-mono" style={{ color: signal.gate3 ? G3_COLOR : '#6b7280' }}>G3 VECTOR</span>
          </div>
          <div className="text-[8px] text-slate-400 leading-tight">
            Linear regression slope<br />
            <span className="font-mono" style={{ color: signal.gate3 ? G3_COLOR : '#6b7280' }}>
              m={slope > 0 ? '+' : ''}{slope.toExponential(2)}
            </span>
          </div>
          <div className="text-[9px] font-mono font-bold" style={{ color: signal.gate3 ? G3_COLOR : '#4b5563' }}>
            {signal.gate3 ? (slope > 0 ? '↗ BULLISH' : '↘ BEARISH') : '✗ FLAT'}
          </div>
        </div>
      </div>

      {/* Price context */}
      <div className="flex items-center gap-4 text-[9px] font-mono text-slate-500 border-t border-slate-800/60 pt-2">
        <span>PRICE <span className="text-slate-300">{signal.currentPrice.toFixed(dec)}</span></span>
        <span>20H <span className="text-slate-300">{signal.gate2Detail.highest20.toFixed(dec)}</span></span>
        <span>20L <span className="text-slate-300">{signal.gate2Detail.lowest20.toFixed(dec)}</span></span>
        <span>SOB <span className="text-yellow-400">{signal.sobScore?.toFixed(4) ?? '—'}</span></span>
      </div>
    </motion.div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] font-mono text-slate-500">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm" style={{ background: `${G1_COLOR}99`, border: `1px solid ${G1_COLOR}` }} />
        <span>G1 Rank Elite</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm" style={{ background: `${G2_COLOR}99`, border: `1px solid ${G2_COLOR}` }} />
        <span>G2 Atlas Snap</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm" style={{ background: `${G3_COLOR}99`, border: `1px solid ${G3_COLOR}` }} />
        <span>G3 David Vector</span>
      </div>
      <div className="w-px h-4 bg-slate-700 mx-1" />
      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full" style={{ background: LONG_COLOR }} /><span>Long Flow</span></div>
      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full" style={{ background: SHORT_COLOR }} /><span>Short Flow</span></div>
      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full" style={{ background: NEUTRAL_COLOR }} /><span>Neutral</span></div>
      <div className="w-px h-4 bg-slate-700 mx-1" />
      <div className="flex items-center gap-1"><Zap className="w-2.5 h-2.5 text-yellow-400" /><span>Sovereign Strike</span></div>
      <div className="text-slate-600 text-[8px] ml-auto">bar height = gate depth · wick = SOB strength delta · dots below = pips to G2 snap</div>
    </div>
  );
}

// ── Main GateFlowChart ────────────────────────────────────────────────────────
export function GateFlowChart({ signals }: Props) {
  const [selected, setSelected] = useState<MatrixSignal | null>(null);
  const [filter, setFilter] = useState<FlowFilter>('all');
  const [sort, setSort] = useState<SortMode>('gates');

  const filtered = useMemo(() => {
    let s = [...signals];
    if (filter === 'long') s = s.filter(x => x.direction === 'long');
    else if (filter === 'short') s = s.filter(x => x.direction === 'short');
    else if (filter === 'neutral') s = s.filter(x => !x.direction);

    if (sort === 'gates') s.sort((a, b) => gateCount(b) - gateCount(a));
    else if (sort === 'pair') s.sort((a, b) => a.instrument.localeCompare(b.instrument));
    else if (sort === 'strength') s.sort((a, b) =>
      Math.abs(b.baseScore - b.quoteScore) - Math.abs(a.baseScore - a.quoteScore));

    return s;
  }, [signals, filter, sort]);

  const strikes = filtered.filter(s => s.triplelock);
  const twoGate = filtered.filter(s => gateCount(s) === 2);
  const oneGate = filtered.filter(s => gateCount(s) === 1);
  const noGate = filtered.filter(s => gateCount(s) === 0);

  const FILTERS: { label: string; value: FlowFilter; color: string }[] = [
    { label: 'ALL', value: 'all', color: '#94a3b8' },
    { label: 'LONG', value: 'long', color: LONG_COLOR },
    { label: 'SHORT', value: 'short', color: SHORT_COLOR },
    { label: 'NEUTRAL', value: 'neutral', color: NEUTRAL_COLOR },
  ];
  const SORTS: { label: string; value: SortMode }[] = [
    { label: 'Gates ↓', value: 'gates' },
    { label: 'Pair A–Z', value: 'pair' },
    { label: 'Strength ↓', value: 'strength' },
  ];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart2Icon />
          <h3 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Gate Flow Chart</h3>
          <span className="text-[8px] font-mono text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">
            {filtered.length} PAIRS
          </span>
          {strikes.length > 0 && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${LONG_COLOR}18`, color: LONG_COLOR, border: `1px solid ${LONG_COLOR}40` }}
            >
              <Zap className="w-2 h-2 inline mr-0.5" />{strikes.length} STRIKE{strikes.length > 1 ? 'S' : ''}
            </motion.span>
          )}
        </div>

        {/* Filter + Sort controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className="px-2 py-0.5 rounded text-[8px] font-bold font-mono transition-all"
                style={{
                  background: filter === f.value ? `${f.color}20` : 'transparent',
                  color: filter === f.value ? f.color : '#64748b',
                  border: `1px solid ${filter === f.value ? f.color + '60' : '#1e293b'}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-1">
            {SORTS.map(s => (
              <button
                key={s.value}
                onClick={() => setSort(s.value)}
                className="px-2 py-0.5 rounded text-[8px] font-mono transition-all"
                style={{
                  background: sort === s.value ? '#1e293b' : 'transparent',
                  color: sort === s.value ? '#94a3b8' : '#475569',
                  border: `1px solid ${sort === s.value ? '#334155' : 'transparent'}`,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '3/3 STRIKE', count: strikes.length, color: LONG_COLOR, pulse: true },
          { label: '2/3 ARMED', count: twoGate.length, color: G2_COLOR, pulse: false },
          { label: '1/3 WATCH', count: oneGate.length, color: G1_COLOR, pulse: false },
          { label: '0/3 QUIET', count: noGate.length, color: '#475569', pulse: false },
        ].map(({ label, count, color, pulse }) => (
          <div key={label}
            className="flex flex-col items-center py-2 rounded-lg"
            style={{ background: `${color}0a`, border: `1px solid ${color}25` }}
          >
            {pulse && count > 0 ? (
              <motion.span
                className="text-lg font-bold font-mono"
                style={{ color }}
                animate={{ textShadow: [`0 0 8px ${color}`, `0 0 20px ${color}`, `0 0 8px ${color}`] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >{count}</motion.span>
            ) : (
              <span className="text-lg font-bold font-mono" style={{ color }}>{count}</span>
            )}
            <span className="text-[7px] font-mono tracking-wider" style={{ color: `${color}80` }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Chart Area ── */}
      <div className="relative">
        <div
          className="overflow-x-auto pb-3 rounded-xl border border-slate-800/60"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, #0f2030 0%, #080f1a 100%)' }}
        >
          {/* Y-axis label */}
          <div className="flex">
            <div className="flex flex-col justify-between py-4 pr-2 pl-3 text-[7px] font-mono text-slate-700 select-none" style={{ minWidth: 32 }}>
              <span>3/3</span>
              <span>2/3</span>
              <span>1/3</span>
              <span>0/3</span>
            </div>

            {/* Grid lines */}
            <div className="flex-1 relative" style={{ minHeight: 180 }}>
              {/* Horizontal grid lines at each gate level */}
              {[0, 33, 66, 100].map(pct => (
                <div
                  key={pct}
                  className="absolute left-0 right-0 border-t border-slate-800/40"
                  style={{ bottom: `${pct}%`, transform: 'translateY(50%)' }}
                />
              ))}

              {/* Strike zone shading */}
              <div
                className="absolute left-0 right-0"
                style={{
                  bottom: '88%', top: 0,
                  background: `${LONG_COLOR}06`,
                  borderBottom: `1px dashed ${LONG_COLOR}30`,
                }}
              />

              {/* Bars */}
              <div className="flex items-end gap-2 px-3 pt-6 pb-4" style={{ minWidth: filtered.length * 60 }}>
                {filtered.map((sig) => (
                  <GateBar
                    key={sig.instrument}
                    signal={sig}
                    isSelected={selected?.instrument === sig.instrument}
                    onClick={() => setSelected(selected?.instrument === sig.instrument ? null : sig)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-mono">
            No pairs match the current filter
          </div>
        )}
      </div>

      {/* Legend */}
      <Legend />

      {/* Selected detail panel */}
      <AnimatePresence>
        {selected && (
          <SignalDetailPanel
            signal={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Inline icon to avoid import issue
function BarChart2Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
