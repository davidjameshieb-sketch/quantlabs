// Forex Nervous System Topology Map — World-Class Interactive Edition
// Fully clickable nodes, animated capital flow, deep currency strength education

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Skull, Zap, Activity, TrendingUp, TrendingDown,
  Globe, DollarSign, BarChart2, Lock, ArrowUpRight, ArrowDownRight, X,
} from 'lucide-react';
import type { MatrixResult, MatrixSignal } from '@/hooks/useSovereignMatrix';

interface Props { result: MatrixResult }

// ── Color system ──────────────────────────────────────────────────────────────
const RANK_COLOR: Record<number, string> = {
  1: '#00ffea', 2: '#39ff14', 3: '#7fff00', 4: '#b8c400',
  5: '#c4a000', 6: '#ff8800', 7: '#ff4400', 8: '#ff0055',
};
const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

// What DRIVES each currency's strength / weakness
const CURRENCY_DRIVERS: Record<string, {
  label: string;
  strengthDrivers: string[];
  weaknessDrivers: string[];
  centralBank: string;
  ratePolicy: string;
  correlated: string[];
}> = {
  USD: {
    label: 'US Dollar',
    strengthDrivers: [
      'Fed rate hike cycle / hawkish pivot',
      'Strong NFP / CPI beats',
      'Risk-off "safe haven" flight',
      'USD as global reserve currency',
      'Widening US yield premium',
    ],
    weaknessDrivers: [
      'Dovish Fed / rate cut expectations',
      'Weak employment data',
      'Risk-on environment → capital leaving USD',
      'Falling US Treasury yields',
    ],
    centralBank: 'Federal Reserve (Fed)',
    ratePolicy: 'Dual mandate — inflation + employment',
    correlated: ['DXY Index', 'US 10Y Yield', 'SPX inverse'],
  },
  EUR: {
    label: 'Euro',
    strengthDrivers: [
      'ECB hawkish stance / rate hikes',
      'Strong Eurozone PMI data',
      'Narrowing EUR/USD rate differential',
      'German industrial output beat',
    ],
    weaknessDrivers: [
      'ECB dovish pivot',
      'Eurozone energy crisis / recession fears',
      'EUR/USD rate differential widening',
      'Political fragmentation (Italy risk)',
    ],
    centralBank: 'European Central Bank (ECB)',
    ratePolicy: 'Single mandate — price stability 2%',
    correlated: ['German Bund 10Y', 'EURUSD', 'Eurozone PMI'],
  },
  GBP: {
    label: 'British Pound',
    strengthDrivers: [
      'BoE rate hike surprise',
      'Strong UK CPI / wage growth',
      'Post-Brexit trade deal progress',
      'Risk appetite + commodity rally',
    ],
    weaknessDrivers: [
      'BoE dovish signal / pausing hikes',
      'UK recession / stagflation concerns',
      'Political uncertainty (PM changes)',
      'UK trade deficit widening',
    ],
    centralBank: 'Bank of England (BoE)',
    ratePolicy: '2% inflation target',
    correlated: ['UK Gilt 10Y', 'FTSE 100', 'UK CPI'],
  },
  JPY: {
    label: 'Japanese Yen',
    strengthDrivers: [
      'BoJ rate hike / YCC policy exit',
      'Global risk-off (JPY safe haven)',
      'Falling US-JP yield differential',
      'Repatriation of Japanese capital',
    ],
    weaknessDrivers: [
      'BoJ ultra-dovish YCC cap maintenance',
      'Carry trade demand (JPY borrowed to buy risk)',
      'Widening US-JP yield spread',
      'Risk-on / commodity bull market',
    ],
    centralBank: 'Bank of Japan (BoJ)',
    ratePolicy: 'Yield Curve Control (YCC) + 2% CPI',
    correlated: ['US-JP 10Y spread', 'Gold', 'VIX inverse'],
  },
  AUD: {
    label: 'Australian Dollar',
    strengthDrivers: [
      'RBA hawkish rate hike cycle',
      'Iron ore / commodity price surge',
      'Strong China demand (AUD proxy)',
      'Global risk-on environment',
    ],
    weaknessDrivers: [
      'RBA rate pause / cut',
      'China slowdown fears',
      'Falling commodity prices',
      'Global risk-off sentiment',
    ],
    centralBank: 'Reserve Bank of Australia (RBA)',
    ratePolicy: '2–3% inflation target band',
    correlated: ['Iron Ore', 'Copper', 'China PMI', 'AUDUSD'],
  },
  NZD: {
    label: 'New Zealand Dollar',
    strengthDrivers: [
      'RBNZ rate hike / hawkish tone',
      'Dairy / commodity price strength',
      'Risk-on global environment',
      'Narrowing NZD-USD rate diff',
    ],
    weaknessDrivers: [
      'RBNZ cut / pause',
      'Commodity price weakness',
      'China demand slowdown',
      'Global risk-off flight',
    ],
    centralBank: 'Reserve Bank of NZ (RBNZ)',
    ratePolicy: '1–3% inflation target',
    correlated: ['Dairy prices', 'AUD correlation', 'China trade'],
  },
  CAD: {
    label: 'Canadian Dollar',
    strengthDrivers: [
      'BoC rate hike / hawkish pivot',
      'Oil price rally (Canada = major exporter)',
      'Strong Canada employment data',
      'Risk-on + commodity demand',
    ],
    weaknessDrivers: [
      'BoC dovish pivot / rate cuts',
      'WTI oil price decline',
      'Weak Canadian jobs data',
      'Housing market stress',
    ],
    centralBank: 'Bank of Canada (BoC)',
    ratePolicy: '2% CPI midpoint target',
    correlated: ['WTI Crude Oil', 'US-CA yield spread', 'TSX'],
  },
  CHF: {
    label: 'Swiss Franc',
    strengthDrivers: [
      'SNB rate hike / FX intervention buy',
      'Global risk-off (CHF safe haven)',
      'SNB FX reserves policy shift',
      'Geopolitical crisis = CHF demand',
    ],
    weaknessDrivers: [
      'SNB negative rates / dovish',
      'SNB FX intervention to weaken CHF',
      'Risk-on melt-up reducing safe haven',
      'Eurozone stability = less CHF demand',
    ],
    centralBank: 'Swiss National Bank (SNB)',
    ratePolicy: 'Price stability, FX management',
    correlated: ['Gold', 'EUR/CHF floor', 'VIX', 'Geopolitics'],
  },
};

// Gate explanations for the WHY panel
const GATE_EXPLANATIONS = {
  G1: {
    title: 'Gate 1 - Matrix Rank Elite',
    icon: '⚔️',
    color: '#b8c400',
    desc: 'Only the widest mathematical capital flow imbalance qualifies. The Predator (Rank #1) must face the Prey (Rank #7-8). This ensures you are trading the single strongest force against the single weakest, not random noise.',
  },
  G2: {
    title: 'Gate 2 - Atlas Snap Breakout',
    icon: '💥',
    color: '#ff8800',
    desc: 'Price must have broken beyond the 20-period structural high (for longs) or low (for shorts). This confirms the market structure agrees with the currency strength ranking, momentum and terrain aligned.',
  },
  G3: {
    title: 'Gate 3 - David Vector Slope',
    icon: '📐',
    color: '#39ff14',
    desc: 'The linear regression slope of the last 20 candles must confirm directional momentum. A positive slope for longs, negative for shorts. Institutional order flow must already be moving in your direction.',
  },
};

// ── Canvas layout ─────────────────────────────────────────────────────────────
const W = 900;
const H = 680;
const CX = 450;
const CY = 330;
const RADIUS = 240;

const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];

// Place 7 on a ring, JPY in the center
function getNodePos(cur: string, idx: number): { x: number; y: number } {
  if (cur === 'JPY') return { x: CX, y: CY };
  const ringCurrencies = CURRENCIES.filter(c => c !== 'JPY');
  const ringIdx = ringCurrencies.indexOf(cur);
  const angle = (ringIdx / ringCurrencies.length) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CX + RADIUS * Math.cos(angle),
    y: CY + RADIUS * Math.sin(angle),
  };
}

const NODE_POS: Record<string, { x: number; y: number }> = {};
CURRENCIES.forEach((c, i) => { NODE_POS[c] = getNodePos(c, i); });

function buildAll28() {
  const pairs: Array<{ base: string; quote: string; key: string }> = [];
  for (let i = 0; i < CURRENCIES.length; i++)
    for (let j = i + 1; j < CURRENCIES.length; j++)
      pairs.push({ base: CURRENCIES[i], quote: CURRENCIES[j], key: `${CURRENCIES[i]}_${CURRENCIES[j]}` });
  return pairs;
}
const ALL_28 = buildAll28();

// ── Sub-components ────────────────────────────────────────────────────────────

function FlowParticle({ x1, y1, x2, y2, color, delay, duration, direction }: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; delay: number; duration: number; direction: 'base' | 'quote';
}) {
  const [fx, fy, tx, ty] = direction === 'base' ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  return (
    <motion.circle
      r={2.8}
      fill={color}
      style={{ filter: `drop-shadow(0 0 5px ${color})` }}
      initial={{ cx: fx, cy: fy, opacity: 0 }}
      animate={{ cx: [fx, (fx + tx) / 2, tx], cy: [fy, (fy + ty) / 2, ty], opacity: [0, 1, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function Edge({ base, quote, baseScore, quoteScore, signal, hovered, onClick }: {
  base: string; quote: string; baseScore: number; quoteScore: number;
  signal: MatrixSignal | undefined; hovered: boolean;
  onClick: () => void;
}) {
  const p1 = NODE_POS[base];
  const p2 = NODE_POS[quote];
  if (!p1 || !p2) return null;

  const diff = baseScore - quoteScore;
  const isStrong = Math.abs(diff) > 0.0015;
  const isTriple = signal?.triplelock;
  const isGate1 = signal?.gate1;

  let edgeColor = '#1e293b';
  let edgeOpacity = isStrong ? 0.25 : 0.12;
  let edgeWidth = 0.6;

  if (isTriple) {
    edgeColor = signal!.direction === 'long' ? '#00ffea' : '#ff0055';
    edgeOpacity = 1;
    edgeWidth = 2.5;
  } else if (isGate1) {
    edgeColor = signal!.direction === 'long' ? '#00ffea' : '#ff0055';
    edgeOpacity = 0.55;
    edgeWidth = 1.5;
  } else if (isStrong) {
    edgeColor = diff > 0 ? '#00ccbb' : '#cc0044';
    edgeOpacity = Math.min(0.35, Math.abs(diff) * 40);
    edgeWidth = 0.8;
  }

  if (hovered) { edgeOpacity = Math.min(1, edgeOpacity + 0.4); edgeWidth += 1; }

  const particleCount = isTriple ? 4 : isGate1 ? 2 : isStrong ? 1 : 0;
  const direction: 'base' | 'quote' = diff >= 0 ? 'base' : 'quote';

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  return (
    <g style={{ cursor: signal ? 'pointer' : 'default' }} onClick={signal ? onClick : undefined}>
      {/* Wider invisible hit area */}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke="transparent" strokeWidth={12} />

      {/* Visible edge */}
      <motion.line
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={edgeColor}
        strokeWidth={edgeWidth}
        strokeOpacity={edgeOpacity}
        strokeDasharray={isGate1 && !isTriple ? '5 4' : undefined}
        animate={isTriple ? { strokeOpacity: [edgeOpacity, edgeOpacity * 0.5, edgeOpacity], strokeWidth: [edgeWidth, edgeWidth + 1.5, edgeWidth] } : undefined}
        transition={isTriple ? { repeat: Infinity, duration: 1.6 } : undefined}
      />

      {/* Particles */}
      {particleCount > 0 && Array.from({ length: particleCount }).map((_, i) => (
        <FlowParticle
          key={i}
          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          color={edgeColor}
          delay={i * (2.2 / particleCount)}
          duration={2.0 + (i % 3) * 0.6}
          direction={direction}
        />
      ))}

      {/* Triple-lock midpoint pulse */}
      {isTriple && (
        <>
          <motion.circle cx={mx} cy={my} r={5} fill="none"
            stroke={edgeColor} strokeWidth={1.5}
            animate={{ r: [5, 14, 5], opacity: [0.9, 0, 0.9] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
          />
          <rect x={mx - 28} y={my - 10} width={56} height={20} rx={4}
            fill={`${edgeColor}22`} stroke={edgeColor} strokeWidth={0.8} strokeOpacity={0.9} />
          <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
            fontSize={7.5} fontFamily="Space Mono, monospace" fontWeight="bold"
            fill={edgeColor} style={{ userSelect: 'none' }}>
            ⚡ {base}/{quote}
          </text>
        </>
      )}
    </g>
  );
}

function Node({ currency, rank, score, maxAbs, isSelected, isHighlighted, onClick }: {
  currency: string; rank: number; score: number; maxAbs: number;
  isSelected: boolean; isHighlighted: boolean; onClick: () => void;
}) {
  const pos = NODE_POS[currency];
  if (!pos) return null;
  const color = RANK_COLOR[rank] ?? '#64748b';
  const isPredator = rank === 1;
  const isPrey = rank === 8;
  const r = isPredator || isPrey ? 38 : isSelected ? 36 : 30;
  const dimmed = !isSelected && !isHighlighted && (isSelected !== null);

  return (
    <g
      onClick={onClick}
      style={{ cursor: 'pointer' }}
      opacity={dimmed ? 0.4 : 1}
    >
      {/* Outer aura */}
      {(isPredator || isPrey) && (
        <motion.circle cx={pos.x} cy={pos.y} r={r + 18}
          fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.25}
          animate={{ r: [r + 18, r + 32, r + 18], opacity: [0.25, 0, 0.25] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        />
      )}

      {/* Selection dash ring */}
      {isSelected && (
        <motion.circle cx={pos.x} cy={pos.y} r={r + 10}
          fill="none" stroke={color} strokeWidth={1.8} strokeDasharray="6 3"
          animate={{ rotate: [0, 360] }}
          style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
          transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
        />
      )}

      {/* Hover glow fill */}
      <circle cx={pos.x} cy={pos.y} r={r + 5}
        fill={`${color}08`} stroke={`${color}20`} strokeWidth={1} />

      {/* Main node */}
      <circle cx={pos.x} cy={pos.y} r={r}
        fill={`${color}18`} stroke={color}
        strokeWidth={isPredator || isPrey ? 2.5 : isSelected ? 2 : 1.5}
        style={{ filter: `drop-shadow(0 0 ${isPredator || isPrey ? 14 : 7}px ${color}90)` }}
      />

      {/* Strength fill */}
      <circle cx={pos.x} cy={pos.y} r={r - 7}
        fill={`${color}${Math.max(12, Math.round((Math.abs(score) / maxAbs) * 45)).toString(16).padStart(2, '0')}`}
        stroke="none"
      />

      {/* Flag */}
      <text x={pos.x} y={pos.y - 5}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isPredator || isPrey ? 20 : 16}
        style={{ userSelect: 'none' }}>
        {FLAGS[currency]}
      </text>

      {/* Currency code */}
      <text x={pos.x} y={pos.y + 13}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={8.5} fontFamily="Space Mono, monospace" fontWeight="bold"
        fill={color} style={{ userSelect: 'none' }}>
        {currency}
      </text>

      {/* Rank badge */}
      <circle cx={pos.x + r - 4} cy={pos.y - r + 4} r={11} fill={color} opacity={0.92} />
      <text x={pos.x + r - 4} y={pos.y - r + 4}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={9} fontFamily="Space Mono, monospace" fontWeight="bold"
        fill="#000" style={{ userSelect: 'none' }}>
        {rank}
      </text>

      {/* Label below */}
      {isPredator && (
        <text x={pos.x} y={pos.y + r + 15} textAnchor="middle"
          fontSize={8} fill={color} fontFamily="Space Mono, monospace"
          style={{ userSelect: 'none' }}>▲ PREDATOR</text>
      )}
      {isPrey && (
        <text x={pos.x} y={pos.y + r + 15} textAnchor="middle"
          fontSize={8} fill={color} fontFamily="Space Mono, monospace"
          style={{ userSelect: 'none' }}>▼ PREY</text>
      )}
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ForexTopologyMap({ result }: Props) {
  const { currencyScores, currencyRanks, sortedCurrencies, signals, strikes, predator, prey } = result;

  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MatrixSignal | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [showGates, setShowGates] = useState(false);

  const maxAbs = useMemo(() =>
    Math.max(0.0001, ...Object.values(currencyScores).map(Math.abs)), [currencyScores]);

  const signalMap = useMemo(() => {
    const m: Record<string, MatrixSignal> = {};
    for (const s of signals) m[s.instrument] = s;
    return m;
  }, [signals]);

  const connectedCurrencies = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    signals.forEach(s => {
      if (s.baseCurrency === selected) set.add(s.quoteCurrency);
      if (s.quoteCurrency === selected) set.add(s.baseCurrency);
    });
    return set;
  }, [selected, signals]);

  const selectedSignals = useMemo(() => {
    if (!selected) return [];
    return signals
      .filter(s => s.baseCurrency === selected || s.quoteCurrency === selected)
      .sort((a, b) => {
        if (b.triplelock !== a.triplelock) return b.triplelock ? 1 : -1;
        return [b.gate1, b.gate2, b.gate3].filter(Boolean).length -
               [a.gate1, a.gate2, a.gate3].filter(Boolean).length;
      });
  }, [selected, signals]);

  const drivers = selected ? CURRENCY_DRIVERS[selected] : null;
  const selectedRank = selected ? (currencyRanks[selected] ?? 4) : null;
  const selectedScore = selected ? (currencyScores[selected] ?? 0) : null;
  const selectedColor = selectedRank ? RANK_COLOR[selectedRank] : '#64748b';

  const handleNodeClick = useCallback((cur: string) => {
    setSelectedSignal(null);
    setSelected(c => c === cur ? null : cur);
  }, []);

  const handleEdgeClick = useCallback((s: MatrixSignal) => {
    setSelected(null);
    setSelectedSignal(prev => prev?.instrument === s.instrument ? null : s);
  }, []);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40 flex-wrap gap-2"
        style={{ background: 'linear-gradient(90deg, rgba(0,255,234,0.04), transparent)' }}>
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Forex Nervous System · 28-Cross Topology
          </h2>
          <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
            LIVE CAPITAL FLOW
          </span>
        </div>
        <div className="flex items-center gap-3">
          {strikes.length > 0 && (
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold font-mono"
              style={{ background: 'rgba(0,255,234,0.1)', border: '1px solid rgba(0,255,234,0.4)', color: '#00ffea' }}>
              <Zap className="w-3 h-3" /> {strikes.length} STRIKE{strikes.length > 1 ? 'S' : ''} ACTIVE
            </motion.div>
          )}
          <button
            onClick={() => setShowGates(g => !g)}
            className="text-[9px] font-mono text-slate-500 hover:text-slate-300 transition-colors border border-slate-700 hover:border-slate-500 px-2.5 py-1 rounded-lg">
            {showGates ? '← Hide' : 'Why Triple-Lock?'}
          </button>
          <div className="hidden sm:flex items-center gap-3 text-[9px] font-mono text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-px bg-[#00ffea]" /> LONG FLOW</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-px bg-[#ff0055]" /> SHORT FLOW</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-px bg-slate-700" /> NEUTRAL</span>
          </div>
        </div>
      </div>

      {/* ── Gate Explanation Banner ── */}
      <AnimatePresence>
        {showGates && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-0 border-b border-slate-700/40">
              {Object.entries(GATE_EXPLANATIONS).map(([key, g]) => (
                <div key={key} className="p-4 border-r border-slate-700/30 last:border-0"
                  style={{ background: `${g.color}06` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{g.icon}</span>
                    <span className="text-[10px] font-bold font-mono" style={{ color: g.color }}>{g.title}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-relaxed">{g.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col xl:flex-row">

        {/* ── SVG Map ── */}
        <div className="relative flex-1 min-h-[560px]"
          style={{
            background: `radial-gradient(ellipse at 35% 40%, rgba(0,255,234,0.05) 0%, transparent 55%),
                         radial-gradient(ellipse at 72% 65%, rgba(255,0,85,0.05) 0%, transparent 50%),
                         linear-gradient(135deg, hsl(230 35% 4%), hsl(230 28% 3%))`,
          }}>

          {/* Scan line */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-15">
            <motion.div
              className="absolute inset-x-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, #00ffea, transparent)' }}
              animate={{ top: ['0%', '100%'] }}
              transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
            />
          </div>

          {/* Grid dots */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="topoGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#00ffea" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#topoGrid)" />
          </svg>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* ── Edges (drawn first, below nodes) ── */}
            {ALL_28.map(({ base, quote, key }) => {
              const fwd = signalMap[key];
              const rev = signalMap[`${quote}_${base}`];
              const sig = fwd ?? rev;
              return (
                <Edge
                  key={key}
                  base={base} quote={quote}
                  baseScore={currencyScores[base] ?? 0}
                  quoteScore={currencyScores[quote] ?? 0}
                  signal={sig}
                  hovered={hoveredEdge === key}
                  onClick={() => sig && handleEdgeClick(sig)}
                />
              );
            })}

            {/* ── Strike path glow overlay ── */}
            {strikes.map(s => {
              const p1 = NODE_POS[s.baseCurrency];
              const p2 = NODE_POS[s.quoteCurrency];
              if (!p1 || !p2) return null;
              const color = s.direction === 'long' ? '#00ffea' : '#ff0055';
              return (
                <motion.line key={`sg-${s.instrument}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={color} strokeWidth={4} strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 10px ${color})` }}
                  animate={{ strokeOpacity: [0.9, 0.3, 0.9], strokeWidth: [4, 6, 4] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                />
              );
            })}

            {/* ── Selected currency: highlight all its edges ── */}
            {selected && selectedSignals.map(s => {
              const other = s.baseCurrency === selected ? s.quoteCurrency : s.baseCurrency;
              const p1 = NODE_POS[selected];
              const p2 = NODE_POS[other];
              if (!p1 || !p2) return null;
              const color = RANK_COLOR[currencyRanks[other] ?? 4];
              return (
                <motion.line key={`hl-${s.instrument}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={color} strokeWidth={1.8} strokeOpacity={0.7}
                  strokeDasharray="5 3"
                  animate={{ strokeDashoffset: [0, -16] }}
                  transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
                />
              );
            })}

            {/* ── Nodes (drawn on top) ── */}
            {sortedCurrencies.map(cur => (
              <Node
                key={cur}
                currency={cur}
                rank={currencyRanks[cur] ?? 4}
                score={currencyScores[cur] ?? 0}
                maxAbs={maxAbs}
                isSelected={selected === cur}
                isHighlighted={!selected || selected === cur || connectedCurrencies.has(cur)}
                onClick={() => handleNodeClick(cur)}
              />
            ))}
          </svg>

          {/* No data */}
          {sortedCurrencies.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-600 font-mono text-sm">Run matrix scan to activate topology</p>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="w-full xl:w-72 border-t xl:border-t-0 xl:border-l border-slate-700/40 flex flex-col"
          style={{ background: 'linear-gradient(180deg, hsl(230 30% 5%), hsl(230 28% 4%))' }}>

          <AnimatePresence mode="wait">

            {/* ── Signal detail panel ── */}
            {selectedSignal ? (
              <motion.div key="signal-detail"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-0 h-full">
                <div className="flex items-center justify-between p-4 border-b border-slate-700/40">
                  <div>
                    <div className="text-[10px] font-bold font-mono text-white">
                      {selectedSignal.instrument.replace('_', '/')}
                    </div>
                    <div className="text-[8px] text-slate-500 font-mono mt-0.5">
                      Edge Signal Detail
                    </div>
                  </div>
                  <button onClick={() => setSelectedSignal(null)}
                    className="text-slate-600 hover:text-slate-300 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
                  {/* Direction + status */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold font-mono"
                      style={{ color: selectedSignal.direction === 'long' ? '#00ffea' : selectedSignal.direction === 'short' ? '#ff0055' : '#64748b' }}>
                      {selectedSignal.direction ? (selectedSignal.direction === 'long' ? '▲ LONG' : '▼ SHORT') : '— NEUTRAL'}
                    </span>
                    {selectedSignal.triplelock && (
                      <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                        className="text-[9px] font-bold font-mono px-2 py-0.5 rounded"
                        style={{ background: 'rgba(0,255,234,0.15)', color: '#00ffea', border: '1px solid rgba(0,255,234,0.4)' }}>
                        ⚡ TRIPLE-LOCK
                      </motion.span>
                    )}
                  </div>

                  {/* Rank matchup */}
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-700/50 bg-slate-800/30">
                    <div className="flex-1 text-center">
                      <div className="text-[8px] text-slate-500 mb-1">BASE</div>
                      <div className="text-lg">{FLAGS[selectedSignal.baseCurrency]}</div>
                      <div className="text-[9px] font-bold font-mono"
                        style={{ color: RANK_COLOR[selectedSignal.baseRank ?? 4] }}>
                        #{selectedSignal.baseRank} {selectedSignal.baseCurrency}
                      </div>
                      <div className="text-[8px] text-slate-500 font-mono">
                        {selectedSignal.baseScore > 0 ? '+' : ''}{selectedSignal.baseScore.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-slate-600 text-xs">vs</div>
                    <div className="flex-1 text-center">
                      <div className="text-[8px] text-slate-500 mb-1">QUOTE</div>
                      <div className="text-lg">{FLAGS[selectedSignal.quoteCurrency]}</div>
                      <div className="text-[9px] font-bold font-mono"
                        style={{ color: RANK_COLOR[selectedSignal.quoteRank ?? 4] }}>
                        #{selectedSignal.quoteRank} {selectedSignal.quoteCurrency}
                      </div>
                      <div className="text-[8px] text-slate-500 font-mono">
                        {selectedSignal.quoteScore > 0 ? '+' : ''}{selectedSignal.quoteScore.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {/* Gates */}
                  <div className="space-y-1.5">
                    {[
                      { key: 'G1', open: selectedSignal.gate1, label: 'Gate 1 — Rank Elite', detail: `#${selectedSignal.baseRank} vs #${selectedSignal.quoteRank}` },
                      { key: 'G2', open: selectedSignal.gate2, label: 'Gate 2 — Atlas Snap', detail: selectedSignal.gate2 ? `BRK ${selectedSignal.direction === 'long' ? 'HIGH' : 'LOW'}` : `${Math.abs(selectedSignal.gate2Detail.close - (selectedSignal.direction === 'long' ? selectedSignal.gate2Detail.highest20 : selectedSignal.gate2Detail.lowest20)).toFixed(5)} to break` },
                      { key: 'G3', open: selectedSignal.gate3, label: 'Gate 3 — David Vector', detail: `slope ${selectedSignal.gate3Detail?.slope?.toExponential(2)}` },
                    ].map(g => {
                      const gInfo = GATE_EXPLANATIONS[g.key as keyof typeof GATE_EXPLANATIONS];
                      return (
                        <div key={g.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
                          style={{
                            borderColor: g.open ? `${gInfo.color}40` : '#1e293b',
                            background: g.open ? `${gInfo.color}08` : 'transparent',
                          }}>
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: g.open ? gInfo.color : '#374151' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-bold font-mono"
                              style={{ color: g.open ? gInfo.color : '#4b5563' }}>
                              {g.key}: {g.open ? '✓' : '✗'}
                            </div>
                            <div className="text-[8px] text-slate-500 truncate">{g.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[8px] text-slate-600 font-mono border border-slate-800 rounded-lg p-2.5 leading-relaxed">
                    All 3 gates lock simultaneously = <span className="text-[#00ffea]">SOVEREIGN STRIKE</span>. 
                    The matrix confirms the strongest currency is mathematically draining capital from the weakest, 
                    price structure agrees (G2), and momentum vector confirms (G3).
                  </div>
                </div>
              </motion.div>
            ) : selected ? (
              /* ── Currency deep-dive panel ── */
              <motion.div key={selected}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex flex-col h-full overflow-y-auto">

                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-700/40"
                  style={{ background: `${selectedColor}08` }}>
                  <span className="text-3xl">{FLAGS[selected]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold font-mono text-sm" style={{ color: selectedColor }}>
                      {selected} — {drivers?.label}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      Rank #{selectedRank} · Score {selectedScore! > 0 ? '+' : ''}{selectedScore?.toFixed(4)}
                    </div>
                  </div>
                  {selectedRank === 1 && <Crown className="w-5 h-5 shrink-0" style={{ color: selectedColor }} />}
                  {selectedRank === 8 && <Skull className="w-5 h-5 shrink-0" style={{ color: selectedColor }} />}
                  <button onClick={() => setSelected(null)} className="text-slate-600 hover:text-slate-300 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Strength bar */}
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-mono text-slate-500">Net Capital Flow Strength</span>
                    <span className="text-[8px] font-mono font-bold" style={{ color: selectedColor }}>
                      {((Math.abs(selectedScore ?? 0) / maxAbs) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <motion.div initial={{ width: 0 }}
                      animate={{ width: `${(Math.abs(selectedScore ?? 0) / maxAbs) * 100}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${selectedColor}80, ${selectedColor})` }}
                    />
                  </div>
                  <p className="text-[8px] text-slate-500 font-mono mt-1.5 leading-relaxed">
                    {selectedScore! > 0
                      ? `Capital ENTERING ${selected} across ${connectedCurrencies.size} measured pairs — gaining strength`
                      : `Capital EXITING ${selected} across ${connectedCurrencies.size} measured pairs — losing strength`}
                  </p>
                </div>

                {/* Central Bank */}
                {drivers && (
                  <div className="px-4 pb-2">
                    <div className="rounded-lg border border-slate-700/50 p-2.5 space-y-1"
                      style={{ background: `${selectedColor}05` }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Globe className="w-3 h-3" style={{ color: selectedColor }} />
                        <span className="text-[9px] font-bold font-mono" style={{ color: selectedColor }}>
                          {drivers.centralBank}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-400 leading-relaxed">{drivers.ratePolicy}</div>
                    </div>
                  </div>
                )}

                {/* What makes it STRONG */}
                {drivers && (
                  <div className="px-4 pb-2">
                    <div className="text-[8px] font-mono font-bold text-[#39ff14] mb-1.5 flex items-center gap-1.5">
                      <ArrowUpRight className="w-3 h-3" /> WHAT MAKES {selected} STRONG
                    </div>
                    <ul className="space-y-1">
                      {drivers.strengthDrivers.map((d, i) => (
                        <li key={i} className="text-[8px] text-slate-400 leading-snug flex items-start gap-1.5">
                          <span className="text-[#39ff14] mt-0.5 shrink-0">+</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* What makes it WEAK */}
                {drivers && (
                  <div className="px-4 pb-2">
                    <div className="text-[8px] font-mono font-bold text-[#ff0055] mb-1.5 flex items-center gap-1.5">
                      <ArrowDownRight className="w-3 h-3" /> WHAT MAKES {selected} WEAK
                    </div>
                    <ul className="space-y-1">
                      {drivers.weaknessDrivers.map((d, i) => (
                        <li key={i} className="text-[8px] text-slate-400 leading-snug flex items-start gap-1.5">
                          <span className="text-[#ff0055] mt-0.5 shrink-0">−</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Correlated assets */}
                {drivers && (
                  <div className="px-4 pb-2">
                    <div className="text-[8px] font-mono font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                      <BarChart2 className="w-3 h-3" /> CORRELATED ASSETS
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {drivers.correlated.map(c => (
                        <span key={c} className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active pairs */}
                <div className="px-4 pb-4 mt-auto">
                  <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mb-2">
                    Active Pairs ({selectedSignals.length})
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {selectedSignals.map(s => {
                      const pc = s.triplelock ? (s.direction === 'long' ? '#00ffea' : '#ff0055') : '#64748b';
                      const gc = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
                      return (
                        <button key={s.instrument}
                          onClick={() => { setSelected(null); setSelectedSignal(s); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left hover:opacity-80"
                          style={{ borderColor: `${pc}25`, background: s.triplelock ? `${pc}08` : 'transparent' }}>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold font-mono text-[10px] flex items-center gap-1" style={{ color: pc }}>
                              {s.triplelock && <Zap className="w-2.5 h-2.5" />}
                              {s.instrument.replace('_', '/')}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {[0, 1, 2].map(i => (
                                <div key={i} className="w-3.5 h-1 rounded-full"
                                  style={{ background: i < gc ? pc : '#1e293b' }} />
                              ))}
                              <span className="text-[7px] text-slate-600 font-mono">{gc}/3</span>
                            </div>
                          </div>
                          {s.direction === 'long' && <TrendingUp className="w-3 h-3 shrink-0" style={{ color: '#00ffea' }} />}
                          {s.direction === 'short' && <TrendingDown className="w-3 h-3 shrink-0" style={{ color: '#ff0055' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : (

              /* ── Default overview panel ── */
              <motion.div key="overview"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-0 h-full">

                <div className="p-4 border-b border-slate-700/40">
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-3">
                    Currency Terrain — Click any node
                  </div>
                  <div className="space-y-1.5">
                    {sortedCurrencies.map((cur, idx) => {
                      const rank = currencyRanks[cur] ?? idx + 1;
                      const score = currencyScores[cur] ?? 0;
                      const color = RANK_COLOR[rank];
                      const pct = (Math.abs(score) / maxAbs) * 100;
                      return (
                        <motion.button key={cur}
                          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          onClick={() => handleNodeClick(cur)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left hover:scale-[1.02]"
                          style={{
                            borderColor: `${color}${rank <= 2 || rank >= 7 ? '50' : '20'}`,
                            background: `${color}${rank <= 2 || rank >= 7 ? '0e' : '06'}`,
                          }}>
                          <span className="text-sm">{FLAGS[cur]}</span>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                            style={{ background: `${color}22`, color, border: `1px solid ${color}50` }}>
                            {rank}
                          </div>
                          <span className="font-bold font-mono text-[10px] w-7 shrink-0" style={{ color }}>{cur}</span>
                          <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className="text-[8px] font-mono tabular-nums shrink-0" style={{ color }}>
                            {score > 0 ? '+' : ''}{score.toFixed(3)}
                          </span>
                          {rank === 1 && <Crown className="w-3 h-3 shrink-0" style={{ color }} />}
                          {rank === 8 && <Skull className="w-3 h-3 shrink-0" style={{ color }} />}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Active strikes */}
                {strikes.length > 0 && (
                  <div className="p-4 border-b border-slate-700/40">
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2">
                      ⚡ Triple-Lock Strikes
                    </div>
                    {strikes.map(s => {
                      const c = s.direction === 'long' ? '#00ffea' : '#ff0055';
                      return (
                        <motion.button key={s.instrument}
                          animate={{ opacity: [1, 0.6, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          onClick={() => handleEdgeClick(s)}
                          className="w-full flex items-center gap-2 text-[10px] font-bold font-mono mb-1.5 px-2 py-1.5 rounded border transition-all hover:opacity-80"
                          style={{ color: c, borderColor: `${c}30`, background: `${c}08` }}>
                          <Zap className="w-3 h-3" />
                          {s.instrument.replace('_', '/')}
                          <span className="ml-auto text-[9px] font-normal opacity-70">
                            #{s.baseRank} v #{s.quoteRank}
                          </span>
                          <Lock className="w-3 h-3" />
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Flow legend */}
                <div className="p-4 mt-auto">
                  <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2">How to Read</div>
                  <div className="space-y-1.5 text-[8px] font-mono text-slate-500">
                    {[
                      { color: '#00ffea', label: 'Cyan particles → capital entering currency' },
                      { color: '#ff0055', label: 'Red particles → capital exiting currency' },
                      { color: '#b8c400', label: 'Pulsing edge = Gate 1 (rank elite match)' },
                      { color: '#00ffea', label: 'Bright + label = Triple-Lock strike' },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-start gap-2">
                        <div className="w-3 h-1 mt-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="leading-snug">{label}</span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-slate-800 text-[7px] text-slate-600 leading-relaxed">
                      Click any currency node to see what drives it strong or weak. Click a lit edge to inspect its Triple-Lock gate status.
                    </div>
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
