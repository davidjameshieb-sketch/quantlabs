// Forex Nervous System Topology Map
// Interactive animated SVG showing all 8 currencies, 28 cross-rate connections,
// live capital flow direction, and Triple-Lock verification overlays

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Skull, Zap, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import type { MatrixResult, MatrixSignal } from '@/hooks/useSovereignMatrix';
import { cn } from '@/lib/utils';

interface Props {
  result: MatrixResult;
}

// Rank → color mapping
const RANK_COLORS: Record<number, string> = {
  1: '#00ffea',
  2: '#39ff14',
  3: '#7fff00',
  4: '#b8c400',
  5: '#c4a000',
  6: '#ff8800',
  7: '#ff4400',
  8: '#ff0055',
};

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

// Octagon node positions (cx, cy) in a 800x600 SVG
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  EUR: { x: 400, y: 60 },
  GBP: { x: 630, y: 145 },
  AUD: { x: 720, y: 350 },
  NZD: { x: 600, y: 530 },
  USD: { x: 200, y: 530 },
  CAD: { x: 80,  y: 350 },
  CHF: { x: 170, y: 145 },
  JPY: { x: 400, y: 300 }, // center
};

// Build all 28 cross pairs
function buildAllCrosses() {
  const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  const pairs: Array<{ base: string; quote: string; key: string }> = [];
  for (let i = 0; i < CURRENCIES.length; i++) {
    for (let j = i + 1; j < CURRENCIES.length; j++) {
      pairs.push({ base: CURRENCIES[i], quote: CURRENCIES[j], key: `${CURRENCIES[i]}_${CURRENCIES[j]}` });
    }
  }
  return pairs;
}

const ALL_28 = buildAllCrosses();

// Animated flowing particle along an SVG path
function FlowParticle({ x1, y1, x2, y2, color, delay, duration, direction }: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; delay: number; duration: number; direction: 'base' | 'quote';
}) {
  // Swap direction if money flows from quote→base
  const [fx, fy, tx, ty] = direction === 'base'
    ? [x1, y1, x2, y2]
    : [x2, y2, x1, y1];

  return (
    <motion.circle
      r={2.5}
      fill={color}
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      initial={{ cx: fx, cy: fy, opacity: 0 }}
      animate={{
        cx: [fx, (fx + tx) / 2, tx],
        cy: [fy, (fy + ty) / 2, ty],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

// Edge between two currency nodes
function CurrencyEdge({
  base, quote, baseScore, quoteScore, signal, currencyRanks,
}: {
  base: string; quote: string; baseScore: number; quoteScore: number;
  signal: MatrixSignal | undefined; currencyRanks: Record<string, number>;
}) {
  const p1 = NODE_POSITIONS[base];
  const p2 = NODE_POSITIONS[quote];
  if (!p1 || !p2) return null;

  const baseRank = currencyRanks[base] ?? 4;
  const quoteRank = currencyRanks[quote] ?? 4;
  const diff = baseScore - quoteScore;
  const isStrong = Math.abs(diff) > 0.002;
  const isTriple = signal?.triplelock;
  const isGate1 = signal?.gate1;

  // Color: triple-lock gets full predator/prey color, gate1 partial, rest muted
  let edgeColor = '#1e293b';
  let edgeOpacity = 0.3;
  let edgeWidth = 0.5;

  if (isTriple) {
    edgeColor = signal!.direction === 'long' ? '#00ffea' : '#ff0055';
    edgeOpacity = 0.9;
    edgeWidth = 2.5;
  } else if (isGate1) {
    edgeColor = signal!.direction === 'long' ? '#00ffea' : '#ff0055';
    edgeOpacity = 0.5;
    edgeWidth = 1.5;
  } else if (isStrong) {
    // Color by capital flow: positive = base stronger (cyan-tinted), negative = quote stronger (red-tinted)
    edgeColor = diff > 0 ? '#00ffea' : '#ff0055';
    edgeOpacity = Math.min(0.4, Math.abs(diff) * 30);
    edgeWidth = 0.8;
  }

  // Particle count based on edge importance
  const particleCount = isTriple ? 3 : isGate1 ? 2 : isStrong ? 1 : 0;
  const direction: 'base' | 'quote' = diff >= 0 ? 'base' : 'quote';

  return (
    <g>
      {/* Base edge line */}
      <line
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={edgeColor}
        strokeWidth={edgeWidth}
        strokeOpacity={edgeOpacity}
        strokeDasharray={isTriple ? 'none' : isGate1 ? '4 3' : 'none'}
      />

      {/* Flowing particles */}
      {particleCount > 0 && Array.from({ length: particleCount }).map((_, i) => (
        <FlowParticle
          key={i}
          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          color={edgeColor}
          delay={i * (1.8 / particleCount)}
          duration={2.2 + Math.random() * 1.5}
          direction={direction}
        />
      ))}

      {/* Triple-lock glow pulse on edge midpoint */}
      {isTriple && (
        <motion.circle
          cx={(p1.x + p2.x) / 2}
          cy={(p1.y + p2.y) / 2}
          r={4}
          fill="none"
          stroke={edgeColor}
          strokeWidth={1.5}
          animate={{ r: [4, 10, 4], opacity: [0.8, 0, 0.8] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
        />
      )}
    </g>
  );
}

// Currency node circle
function CurrencyNode({
  currency, rank, score, maxAbs, isSelected, onClick,
}: {
  currency: string; rank: number; score: number; maxAbs: number;
  isSelected: boolean; onClick: () => void;
}) {
  const pos = NODE_POSITIONS[currency];
  if (!pos) return null;

  const color = RANK_COLORS[rank] ?? '#64748b';
  const isPredator = rank === 1;
  const isPrey = rank === 8;
  const nodeR = isPredator || isPrey ? 36 : 28;
  const pulseR = nodeR + 12;

  return (
    <g
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Outer pulse ring for predator/prey */}
      {(isPredator || isPrey) && (
        <motion.circle
          cx={pos.x} cy={pos.y} r={pulseR}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.4}
          animate={{ r: [pulseR, pulseR + 16, pulseR], opacity: [0.4, 0, 0.4] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <motion.circle
          cx={pos.x} cy={pos.y} r={nodeR + 8}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 3"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
          style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
        />
      )}

      {/* Rank pulse aura */}
      <circle
        cx={pos.x} cy={pos.y} r={nodeR + 6}
        fill={`${color}08`}
        stroke={`${color}20`}
        strokeWidth={1}
      />

      {/* Main node */}
      <circle
        cx={pos.x} cy={pos.y} r={nodeR}
        fill={`${color}18`}
        stroke={color}
        strokeWidth={isPredator || isPrey ? 2.5 : 1.5}
        style={{ filter: `drop-shadow(0 0 ${isPredator || isPrey ? 12 : 6}px ${color}80)` }}
      />

      {/* Strength fill arc */}
      <circle
        cx={pos.x} cy={pos.y} r={nodeR - 6}
        fill={`${color}${Math.round((Math.abs(score) / maxAbs) * 40 + 10).toString(16).padStart(2, '0')}`}
        stroke="none"
      />

      {/* Flag emoji */}
      <text
        x={pos.x} y={pos.y - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isPredator || isPrey ? 18 : 14}
        style={{ userSelect: 'none' }}
      >
        {FLAGS[currency]}
      </text>

      {/* Currency code */}
      <text
        x={pos.x} y={pos.y + 12}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontFamily="Space Mono, monospace"
        fontWeight="bold"
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {currency}
      </text>

      {/* Rank badge */}
      <g transform={`translate(${pos.x + nodeR - 4}, ${pos.y - nodeR + 4})`}>
        <circle r={10} fill={color} opacity={0.9} />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontFamily="Space Mono, monospace"
          fontWeight="bold"
          fill="#000"
          style={{ userSelect: 'none' }}
        >
          {rank}
        </text>
      </g>

      {/* Predator/prey badge */}
      {isPredator && (
        <text x={pos.x} y={pos.y + nodeR + 14} textAnchor="middle" fontSize={9} fill={color} fontFamily="Space Mono, monospace" style={{ userSelect: 'none' }}>
          ▲ PREDATOR
        </text>
      )}
      {isPrey && (
        <text x={pos.x} y={pos.y + nodeR + 14} textAnchor="middle" fontSize={9} fill={color} fontFamily="Space Mono, monospace" style={{ userSelect: 'none' }}>
          ▼ PREY
        </text>
      )}
    </g>
  );
}

export function ForexTopologyMap({ result }: Props) {
  const { currencyScores, currencyRanks, sortedCurrencies, signals, strikes, predator, prey } = result;
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [hoveredSignal, setHoveredSignal] = useState<MatrixSignal | null>(null);

  const maxAbs = useMemo(() =>
    Math.max(0.0001, ...Object.values(currencyScores).map(Math.abs)),
    [currencyScores]
  );

  // Index signals by instrument for fast lookup
  const signalMap = useMemo(() => {
    const map: Record<string, MatrixSignal> = {};
    for (const s of signals) map[s.instrument] = s;
    return map;
  }, [signals]);

  // Signals relevant to selected currency
  const selectedSignals = useMemo(() => {
    if (!selectedCurrency) return [];
    return signals.filter(s =>
      s.baseCurrency === selectedCurrency || s.quoteCurrency === selectedCurrency
    ).sort((a, b) => {
      if (b.triplelock !== a.triplelock) return b.triplelock ? 1 : -1;
      return [b.gate1, b.gate2, b.gate3].filter(Boolean).length -
             [a.gate1, a.gate2, a.gate3].filter(Boolean).length;
    });
  }, [selectedCurrency, signals]);

  const selectedRank = selectedCurrency ? (currencyRanks[selectedCurrency] ?? 4) : null;
  const selectedScore = selectedCurrency ? (currencyScores[selectedCurrency] ?? 0) : null;
  const selectedColor = selectedRank ? RANK_COLORS[selectedRank] : '#64748b';

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Forex Nervous System · 28-Cross Topology
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {strikes.length > 0 && (
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00ffea]/10 border border-[#00ffea]/40 text-[#00ffea] text-[9px] font-bold font-mono"
            >
              <Zap className="w-3 h-3" /> {strikes.length} STRIKE{strikes.length > 1 ? 'S' : ''} ACTIVE
            </motion.div>
          )}
          <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#00ffea] inline-block" /> CAPITAL FLOW LONG
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#ff0055] inline-block" /> CAPITAL FLOW SHORT
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* SVG Topology Map */}
        <div className="relative flex-1 min-h-[480px] rounded-xl overflow-hidden border border-slate-800/60"
          style={{
            background: 'radial-gradient(ellipse at 40% 40%, rgba(0,255,234,0.04) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(255,0,85,0.04) 0%, transparent 50%), linear-gradient(135deg, hsl(230 30% 5%), hsl(230 25% 3%))'
          }}>

          {/* Scan line animation */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
            <motion.div
              className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00ffea] to-transparent"
              animate={{ top: ['0%', '100%'] }}
              transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
            />
          </div>

          {/* Grid dots */}
          <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#00ffea" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          <svg
            viewBox="0 0 800 620"
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* ── All 28 edges ── */}
            {ALL_28.map(({ base, quote, key }) => {
              const fwdSignal = signalMap[key];
              const revKey = `${quote}_${base}`;
              const revSignal = signalMap[revKey];
              const signal = fwdSignal ?? revSignal;
              return (
                <CurrencyEdge
                  key={key}
                  base={base}
                  quote={quote}
                  baseScore={currencyScores[base] ?? 0}
                  quoteScore={currencyScores[quote] ?? 0}
                  signal={signal}
                  currencyRanks={currencyRanks}
                />
              );
            })}

            {/* ── Triple-lock strike path highlight ── */}
            {strikes.map(s => {
              const p1 = NODE_POSITIONS[s.baseCurrency];
              const p2 = NODE_POSITIONS[s.quoteCurrency];
              if (!p1 || !p2) return null;
              const color = s.direction === 'long' ? '#00ffea' : '#ff0055';
              return (
                <motion.line
                  key={`strike-${s.instrument}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                  animate={{ strokeOpacity: [0.9, 0.4, 0.9], strokeWidth: [3, 5, 3] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              );
            })}

            {/* ── Selected currency highlight edges ── */}
            {selectedCurrency && selectedSignals.map(s => {
              const other = s.baseCurrency === selectedCurrency ? s.quoteCurrency : s.baseCurrency;
              const p1 = NODE_POSITIONS[selectedCurrency];
              const p2 = NODE_POSITIONS[other];
              if (!p1 || !p2) return null;
              const rank = currencyRanks[other] ?? 4;
              const color = RANK_COLORS[rank];
              return (
                <motion.line
                  key={`sel-${s.instrument}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray="5 3"
                  animate={{ strokeDashoffset: [0, -16] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                />
              );
            })}

            {/* ── Currency nodes ── */}
            {sortedCurrencies.map(currency => (
              <CurrencyNode
                key={currency}
                currency={currency}
                rank={currencyRanks[currency] ?? 4}
                score={currencyScores[currency] ?? 0}
                maxAbs={maxAbs}
                isSelected={selectedCurrency === currency}
                onClick={() => setSelectedCurrency(c => c === currency ? null : currency)}
              />
            ))}

            {/* ── Triple-lock labels on midpoints ── */}
            {strikes.map(s => {
              const p1 = NODE_POSITIONS[s.baseCurrency];
              const p2 = NODE_POSITIONS[s.quoteCurrency];
              if (!p1 || !p2) return null;
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              const color = s.direction === 'long' ? '#00ffea' : '#ff0055';
              return (
                <g key={`label-${s.instrument}`}>
                  <rect
                    x={mx - 26} y={my - 9}
                    width={52} height={18}
                    rx={4}
                    fill={`${color}20`}
                    stroke={color}
                    strokeWidth={0.8}
                    strokeOpacity={0.8}
                  />
                  <text
                    x={mx} y={my}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={7}
                    fontFamily="Space Mono, monospace"
                    fontWeight="bold"
                    fill={color}
                    style={{ userSelect: 'none' }}
                  >
                    ⚡ {s.instrument.replace('_', '/')}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* No data state */}
          {sortedCurrencies.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-600 font-mono text-sm">Run matrix scan to activate topology</p>
            </div>
          )}
        </div>

        {/* Right panel: selected currency detail OR legend */}
        <div className="w-full lg:w-64 flex flex-col gap-3">
          <AnimatePresence mode="wait">
            {selectedCurrency ? (
              <motion.div
                key={selectedCurrency}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-3"
              >
                {/* Currency spotlight */}
                <div
                  className="rounded-xl p-4 border flex flex-col gap-3"
                  style={{
                    borderColor: `${selectedColor}40`,
                    background: `linear-gradient(135deg, ${selectedColor}08, transparent)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{FLAGS[selectedCurrency]}</span>
                    <div>
                      <div className="font-bold font-mono text-sm" style={{ color: selectedColor }}>
                        {selectedCurrency}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">
                        Rank #{selectedRank} · {selectedScore! > 0 ? '+' : ''}{selectedScore?.toFixed(4)}
                      </div>
                    </div>
                    {selectedRank === 1 && <Crown className="w-4 h-4 ml-auto" style={{ color: selectedColor }} />}
                    {selectedRank === 8 && <Skull className="w-4 h-4 ml-auto" style={{ color: selectedColor }} />}
                  </div>

                  {/* Strength bar */}
                  <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(Math.abs(selectedScore ?? 0) / maxAbs) * 100}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${selectedColor}80, ${selectedColor})` }}
                    />
                  </div>

                  <div className="text-[9px] font-mono text-slate-400 leading-relaxed">
                    {selectedScore! > 0
                      ? `Capital flowing INTO ${selectedCurrency} — gaining strength against ${7 - (sortedCurrencies.indexOf(selectedCurrency))} other currencies`
                      : `Capital flowing OUT of ${selectedCurrency} — losing against ${sortedCurrencies.indexOf(selectedCurrency)} other currencies`
                    }
                  </div>
                </div>

                {/* Pairs involving this currency */}
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider px-1">
                  Active Pairs ({selectedSignals.length})
                </div>
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto scrollbar-neural pr-1">
                  {selectedSignals.map(s => {
                    const isLong = s.direction === 'long';
                    const isShort = s.direction === 'short';
                    const gateCount = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
                    const pairColor = s.triplelock ? (isLong ? '#00ffea' : '#ff0055') : '#64748b';
                    return (
                      <div
                        key={s.instrument}
                        className="rounded-lg px-2.5 py-2 border flex items-center gap-2 transition-all"
                        style={{
                          borderColor: `${pairColor}30`,
                          background: s.triplelock ? `${pairColor}08` : 'transparent',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold font-mono text-[10px] flex items-center gap-1" style={{ color: pairColor }}>
                            {s.triplelock && <Zap className="w-2.5 h-2.5" />}
                            {s.instrument.replace('_', '/')}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {[0, 1, 2].map(i => (
                              <div key={i} className="w-3 h-1 rounded-full"
                                style={{ background: i < gateCount ? pairColor : '#1e293b' }} />
                            ))}
                            <span className="text-[8px] text-slate-600 font-mono">{gateCount}/3</span>
                          </div>
                        </div>
                        {isLong && <TrendingUp className="w-3 h-3 text-[#00ffea] shrink-0" />}
                        {isShort && <TrendingDown className="w-3 h-3 text-[#ff0055] shrink-0" />}
                        {!s.direction && <span className="text-[8px] text-slate-600">—</span>}
                      </div>
                    );
                  })}
                  {selectedSignals.length === 0 && (
                    <div className="text-[9px] text-slate-600 font-mono px-1">
                      No scanned pairs for {selectedCurrency}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedCurrency(null)}
                  className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-colors text-left px-1"
                >
                  ← Back to overview
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="overview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-2"
              >
                {/* Currency rank legend */}
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider px-1 mb-1">
                  Currency Terrain (click node)
                </div>
                {sortedCurrencies.map((cur, idx) => {
                  const rank = currencyRanks[cur] ?? idx + 1;
                  const score = currencyScores[cur] ?? 0;
                  const color = RANK_COLORS[rank];
                  const pct = (Math.abs(score) / maxAbs) * 100;
                  const isPredator = rank === 1;
                  const isPrey = rank === 8;

                  return (
                    <motion.button
                      key={cur}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      onClick={() => setSelectedCurrency(cur)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left hover:scale-105"
                      style={{
                        borderColor: `${color}${isPredator || isPrey ? '50' : '20'}`,
                        background: `${color}${isPredator || isPrey ? '10' : '05'}`,
                      }}
                    >
                      <span className="text-xs">{FLAGS[cur]}</span>
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                        style={{ background: `${color}22`, color, border: `1px solid ${color}50` }}
                      >
                        {rank}
                      </div>
                      <span className="font-bold font-mono text-[10px] w-6 shrink-0" style={{ color }}>{cur}</span>
                      <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="text-[8px] font-mono tabular-nums shrink-0" style={{ color }}>
                        {score > 0 ? '+' : ''}{score.toFixed(3)}
                      </span>
                      {isPredator && <Crown className="w-2.5 h-2.5 shrink-0" style={{ color }} />}
                      {isPrey && <Skull className="w-2.5 h-2.5 shrink-0" style={{ color }} />}
                    </motion.button>
                  );
                })}

                {/* Active strikes summary */}
                {strikes.length > 0 && (
                  <div className="mt-2 border border-slate-700/50 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                      ⚡ Triple-Lock Strikes
                    </div>
                    {strikes.map(s => {
                      const color = s.direction === 'long' ? '#00ffea' : '#ff0055';
                      return (
                        <motion.div
                          key={s.instrument}
                          animate={{ opacity: [1, 0.6, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="flex items-center gap-2 text-[10px] font-bold font-mono"
                          style={{ color }}
                        >
                          <Zap className="w-3 h-3" />
                          {s.instrument.replace('_', '/')}
                          <span className="ml-auto text-[9px] font-normal opacity-70">
                            #{s.baseRank} v #{s.quoteRank}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Flow legend */}
                <div className="mt-auto border border-slate-800/50 rounded-xl p-3 text-[8px] font-mono text-slate-500 space-y-1.5">
                  <div className="text-slate-400 font-bold mb-2">HOW TO READ</div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-px bg-[#00ffea]" />
                    <span>Capital entering currency</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-px bg-[#ff0055]" />
                    <span>Capital exiting currency</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-[#00ffea]/50 bg-[#00ffea]/10 flex items-center justify-center text-[7px] text-[#00ffea]">1</div>
                    <span>Badge = Matrix rank (1=strongest)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span>Pulsing line = Triple-Lock strike</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
