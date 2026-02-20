// Matrix Strength Chart — The World's First Currency Strength + Candlestick Fusion
// Built exclusively for Sovereign Matrix v20.0
//
// What you see per candle:
//   ① Price candlestick (OHLC) drawn natively — no TradingView, no lib
//   ② SOB strength ribbon beneath each candle — the raw matrix power of that currency
//   ③ Gate overlay stamps — G1 (terrain crown), G2 (atlas flash), G3 (vector arrow)
//   ④ Capital flow bars — inflow (cyan) / outflow (red) beneath the chart
//   ⑤ Rank trajectory arc — how rank #N moved over time
//   ⑥ Triple-Lock strike moments — vertical pillar of light at the exact candle

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Skull, TrendingUp, TrendingDown, Activity,
  Zap, Eye, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { MatrixResult, MatrixSignal } from '@/hooks/useSovereignMatrix';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CandleBar {
  time: string;           // ISO or label
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;         // synthetic from Veff
  sobScore: number;       // matrix strength at this candle
  rank: number;           // currency rank at this candle
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  triplelock: boolean;
  direction: 'long' | 'short' | null;
  flow: number;           // +ve = inflow, -ve = outflow
}

interface Props {
  result: MatrixResult;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'USD'] as const;

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

const LONG_C = '#00ffea';
const SHORT_C = '#ff0055';
const G1_C = '#facc15';
const G2_C = '#f97316';
const G3_C = '#39ff14';
const NEUTRAL_C = '#475569';

function getRankColor(rank: number): string {
  if (rank === 1) return '#00ffea';
  if (rank === 2) return '#39ff14';
  if (rank === 3) return '#7fff00';
  if (rank === 4) return '#b8c400';
  if (rank === 5) return '#c4a000';
  if (rank === 6) return '#ff8800';
  if (rank === 7) return '#ff4400';
  return '#ff0055';
}

// ─── Synthetic History Generator ─────────────────────────────────────────────
// Since we receive one real-time snapshot, we simulate a 20-candle history
// anchored to the REAL current data for the selected currency.
// Each prior candle walks backward using a Brownian bridge seeded from real scores.

function generateCandleHistory(
  currency: string,
  result: MatrixResult,
  numCandles = 20
): CandleBar[] {
  const score = result.currencyScores[currency] ?? 0;
  const rank = result.currencyRanks[currency] ?? 4;

  // Signals that involve this currency
  const relatedSignals = result.signals.filter(
    (s) => s.baseCurrency === currency || s.quoteCurrency === currency
  );

  const now = new Date();
  const bars: CandleBar[] = [];

  // Synthetic price base anchored on currency strength
  // Real price chart would require OANDA candles per-currency — this is the MATRIX view
  // We model it as: strength score → normalized price series
  const basePrice = 1.0 + score * 100; // e.g. score=0.004 → price ≈ 1.4

  let prevClose = basePrice;
  let prevScore = score * (0.5 + Math.random() * 0.5);
  let prevRank = Math.max(1, Math.min(8, rank + Math.round(Math.random() * 2 - 1)));

  for (let i = numCandles - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 30 * 60 * 1000);

    // Walk score toward current
    const progress = (numCandles - i) / numCandles;
    const targetScore = score;
    const scoreDrift = (targetScore - prevScore) * 0.3 + (Math.random() - 0.5) * Math.abs(score) * 0.4;
    const curScore = prevScore + scoreDrift;

    // Walk rank toward current
    const rankDrift = Math.round((rank - prevRank) * 0.3 + (Math.random() - 0.5) * 0.8);
    const curRank = Math.max(1, Math.min(8, prevRank + rankDrift));

    // Candle OHLC from score momentum
    const momentum = curScore - prevScore;
    const volatility = Math.max(0.0008, Math.abs(score) * 2) * (1 + Math.random());
    const open = prevClose;
    const close = open + momentum * 120 + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.6;
    const low = Math.min(open, close) - Math.random() * volatility * 0.6;

    // Flow: positive if score rising (inflow), negative if falling (outflow)
    const flow = momentum * 5000 + (Math.random() - 0.5) * 0.3;

    // Gate states — final candle uses real data, others are synthetic walk
    const isFinal = i === 0;
    // Find most relevant signal for this currency
    const bestSignal = relatedSignals.sort((a, b) => {
      const aIsPrimary = a.baseCurrency === currency ? 1 : 0;
      const bIsPrimary = b.baseCurrency === currency ? 1 : 0;
      return bIsPrimary - aIsPrimary;
    })[0];

    let gate1 = false, gate2 = false, gate3 = false, triplelock = false;
    let direction: 'long' | 'short' | null = null;

    if (isFinal && bestSignal) {
      gate1 = bestSignal.gate1;
      gate2 = bestSignal.gate2;
      gate3 = bestSignal.gate3;
      triplelock = bestSignal.triplelock;
      direction = bestSignal.direction;
    } else {
      // Synthetic gate probability ramps up near the end
      const prob = progress;
      gate1 = curRank <= 2 || curRank >= 7;
      gate2 = gate1 && Math.random() < prob * 0.6;
      gate3 = gate2 && Math.random() < prob * 0.5;
      triplelock = gate1 && gate2 && gate3;
      direction = curScore > 0 ? 'long' : curScore < 0 ? 'short' : null;
    }

    bars.push({
      time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      open,
      high,
      low,
      close,
      volume: Math.abs(flow) * 1000 + Math.random() * 500,
      sobScore: curScore,
      rank: curRank,
      gate1,
      gate2,
      gate3,
      triplelock,
      direction,
      flow,
    });

    prevClose = close;
    prevScore = curScore;
    prevRank = curRank;
  }

  return bars;
}

// ─── Canvas Candle Chart Renderer ────────────────────────────────────────────

interface CanvasChartProps {
  bars: CandleBar[];
  currency: string;
  rank: number;
  score: number;
  width: number;
  height: number;
}

function CanvasChart({ bars, currency, rank, score, width, height }: CanvasChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const W = width;
    const H = height;

    // Layout zones
    const RANK_ZONE = 28;        // top — rank arc
    const PRICE_ZONE = H * 0.42; // candlestick area
    const SOB_ZONE = H * 0.14;   // SOB ribbon
    const GATE_ZONE = 22;        // gate stamps row
    const FLOW_ZONE = H * 0.16;  // flow bars
    const LABEL_ZONE = 18;       // time labels

    const PRICE_TOP = RANK_ZONE;
    const PRICE_BOT = PRICE_TOP + PRICE_ZONE;
    const SOB_TOP = PRICE_BOT + 6;
    const SOB_BOT = SOB_TOP + SOB_ZONE;
    const GATE_TOP = SOB_BOT + 6;
    const GATE_BOT = GATE_TOP + GATE_ZONE;
    const FLOW_TOP = GATE_BOT + 6;
    const FLOW_BOT = FLOW_TOP + FLOW_ZONE;

    // ── Background ───────────────────────────────────────────────────────────
    ctx.fillStyle = 'hsl(230 30% 4%)';
    ctx.fillRect(0, 0, W, H);

    const rankColor = getRankColor(rank);

    // Zone dividers
    const drawZoneLine = (y: number) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawZoneLine(PRICE_BOT + 3);
    drawZoneLine(SOB_BOT + 3);
    drawZoneLine(GATE_BOT + 3);

    // ── Grid lines (price zone) ───────────────────────────────────────────────
    const priceValues = bars.map(b => [b.high, b.low]).flat();
    const priceMin = Math.min(...priceValues);
    const priceMax = Math.max(...priceValues);
    const pricePad = (priceMax - priceMin) * 0.12;
    const priceRange = [priceMin - pricePad, priceMax + pricePad];

    const toY = (v: number, min: number, max: number, top: number, bot: number) =>
      bot - ((v - min) / (max - min || 1)) * (bot - top);

    for (let i = 0; i <= 4; i++) {
      const y = PRICE_TOP + (PRICE_ZONE / 4) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const val = priceMax + pricePad - ((priceMax - priceMin + pricePad * 2) / 4) * i;
      ctx.fillStyle = 'rgba(148,163,184,0.3)';
      ctx.font = '8px Space Mono, monospace';
      ctx.fillText(val.toFixed(4), 4, y - 2);
    }

    // ── Bar geometry ──────────────────────────────────────────────────────────
    const N = bars.length;
    const BAR_W = Math.floor((W - 20) / N);
    const BAR_GAP = Math.max(1, Math.floor(BAR_W * 0.18));
    const BODY_W = BAR_W - BAR_GAP * 2;

    const xCenter = (i: number) => 10 + i * BAR_W + BAR_W / 2;

    // ── Triple-Lock Pillars ───────────────────────────────────────────────────
    bars.forEach((b, i) => {
      if (!b.triplelock) return;
      const x = 10 + i * BAR_W;
      const grad = ctx.createLinearGradient(x, 0, x + BAR_W, 0);
      const c = b.direction === 'long' ? LONG_C : SHORT_C;
      grad.addColorStop(0, `${c}00`);
      grad.addColorStop(0.5, `${c}18`);
      grad.addColorStop(1, `${c}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, PRICE_TOP, BAR_W, FLOW_BOT - PRICE_TOP);

      // Vertical edge glow
      ctx.strokeStyle = `${c}40`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xCenter(i), PRICE_TOP);
      ctx.lineTo(xCenter(i), FLOW_BOT);
      ctx.stroke();
    });

    // ── Candlesticks ──────────────────────────────────────────────────────────
    bars.forEach((b, i) => {
      const cx = xCenter(i);
      const bodyL = 10 + i * BAR_W + BAR_GAP;
      const isUp = b.close >= b.open;
      const colorUp = LONG_C;
      const colorDn = SHORT_C;
      const color = isUp ? colorUp : colorDn;

      const yHigh = toY(b.high, priceRange[0], priceRange[1], PRICE_TOP, PRICE_BOT);
      const yLow  = toY(b.low,  priceRange[0], priceRange[1], PRICE_TOP, PRICE_BOT);
      const yOpen = toY(b.open, priceRange[0], priceRange[1], PRICE_TOP, PRICE_BOT);
      const yClose = toY(b.close, priceRange[0], priceRange[1], PRICE_TOP, PRICE_BOT);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, yHigh);
      ctx.lineTo(cx, yLow);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      const grad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
      grad.addColorStop(0, `${color}ee`);
      grad.addColorStop(1, `${color}77`);
      ctx.fillStyle = grad;
      ctx.fillRect(bodyL, bodyTop, BODY_W, bodyH);

      // Triple-lock halo on body
      if (b.triplelock) {
        const haloC = b.direction === 'long' ? LONG_C : SHORT_C;
        ctx.shadowColor = haloC;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `${haloC}33`;
        ctx.fillRect(bodyL - 2, bodyTop - 2, BODY_W + 4, bodyH + 4);
        ctx.shadowBlur = 0;
      }
    });

    // ── SOB Strength Ribbon ───────────────────────────────────────────────────
    // Gradient area chart showing SOB score over time
    const sobVals = bars.map(b => b.sobScore);
    const sobMin = Math.min(...sobVals);
    const sobMax = Math.max(...sobVals);

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(xCenter(0), toY(sobVals[0], sobMin, sobMax, SOB_TOP, SOB_BOT));
    bars.forEach((b, i) => {
      ctx.lineTo(xCenter(i), toY(b.sobScore, sobMin, sobMax, SOB_TOP, SOB_BOT));
    });
    ctx.lineTo(xCenter(N - 1), SOB_BOT);
    ctx.lineTo(xCenter(0), SOB_BOT);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, SOB_TOP, 0, SOB_BOT);
    areaGrad.addColorStop(0, `${rankColor}55`);
    areaGrad.addColorStop(1, `${rankColor}08`);
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(xCenter(0), toY(sobVals[0], sobMin, sobMax, SOB_TOP, SOB_BOT));
    bars.forEach((b, i) => {
      ctx.lineTo(xCenter(i), toY(b.sobScore, sobMin, sobMax, SOB_TOP, SOB_BOT));
    });
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // SOB label
    ctx.fillStyle = `${rankColor}99`;
    ctx.font = 'bold 7px Space Mono, monospace';
    ctx.fillText('SOB STRENGTH', 4, SOB_TOP + 8);

    // ── Gate Stamps ───────────────────────────────────────────────────────────
    const gateY = GATE_TOP + GATE_ZONE / 2;
    bars.forEach((b, i) => {
      const cx = xCenter(i);

      if (b.gate1) {
        ctx.beginPath();
        ctx.arc(cx - 7, gateY, 4, 0, Math.PI * 2);
        ctx.fillStyle = `${G1_C}cc`;
        ctx.shadowColor = G1_C;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (b.gate2) {
        ctx.beginPath();
        ctx.arc(cx, gateY, 4, 0, Math.PI * 2);
        ctx.fillStyle = `${G2_C}cc`;
        ctx.shadowColor = G2_C;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (b.gate3) {
        ctx.beginPath();
        ctx.arc(cx + 7, gateY, 4, 0, Math.PI * 2);
        ctx.fillStyle = `${G3_C}cc`;
        ctx.shadowColor = G3_C;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Gate row labels
    ctx.fillStyle = 'rgba(148,163,184,0.3)';
    ctx.font = '7px Space Mono, monospace';
    ctx.fillText('G1  G2  G3', 4, gateY + 3);

    // ── Capital Flow Bars ─────────────────────────────────────────────────────
    const flowVals = bars.map(b => b.flow);
    const flowMax = Math.max(0.01, ...flowVals.map(Math.abs));
    const flowMid = (FLOW_TOP + FLOW_BOT) / 2;

    bars.forEach((b, i) => {
      const cx = xCenter(i);
      const bL = 10 + i * BAR_W + BAR_GAP;
      const pct = b.flow / flowMax;
      const barH = Math.abs(pct) * (FLOW_ZONE / 2 - 3);
      const isIn = b.flow >= 0;
      const fc = isIn ? LONG_C : SHORT_C;

      ctx.fillStyle = `${fc}88`;
      ctx.shadowColor = fc;
      ctx.shadowBlur = 4;
      if (isIn) {
        ctx.fillRect(bL, flowMid - barH, BODY_W, barH);
      } else {
        ctx.fillRect(bL, flowMid, BODY_W, barH);
      }
      ctx.shadowBlur = 0;
    });

    // Flow axis line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, flowMid);
    ctx.lineTo(W, flowMid);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148,163,184,0.3)';
    ctx.font = '7px Space Mono, monospace';
    ctx.fillText('INFLOW', 4, FLOW_TOP + 9);
    ctx.fillText('OUTFLOW', 4, FLOW_BOT - 3);

    // ── Rank Arc (top zone) ───────────────────────────────────────────────────
    // Show rank number per candle as colored dots along a path at the top
    const rankVals = bars.map(b => b.rank);

    // Draw rank path
    ctx.beginPath();
    bars.forEach((b, i) => {
      const cx = xCenter(i);
      // Rank 1 = top, rank 8 = bottom of RANK_ZONE
      const ry = 4 + ((b.rank - 1) / 7) * (RANK_ZONE - 8);
      if (i === 0) ctx.moveTo(cx, ry);
      else ctx.lineTo(cx, ry);
    });
    ctx.strokeStyle = `${rankColor}50`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rank dots
    bars.forEach((b, i) => {
      const cx = xCenter(i);
      const ry = 4 + ((b.rank - 1) / 7) * (RANK_ZONE - 8);
      const rc = getRankColor(b.rank);
      ctx.beginPath();
      ctx.arc(cx, ry, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rc;
      ctx.shadowColor = rc;
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.fillStyle = 'rgba(148,163,184,0.3)';
    ctx.font = '7px Space Mono, monospace';
    ctx.fillText('RANK', 4, 10);

    // ── Time Labels ───────────────────────────────────────────────────────────
    const step = Math.max(1, Math.floor(N / 6));
    bars.forEach((b, i) => {
      if (i % step !== 0) return;
      const cx = xCenter(i);
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.font = '7px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.time, cx, H - 2);
    });
    ctx.textAlign = 'left';

  }, [bars, currency, rank, score, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block', imageRendering: 'pixelated' }}
    />
  );
}

// ─── Currency Selector ────────────────────────────────────────────────────────

function CurrencyTab({
  cur, rank, score, isSelected, onClick,
}: {
  cur: string; rank: number; score: number; isSelected: boolean; onClick: () => void;
}) {
  const color = getRankColor(rank);
  const isTop = rank <= 3;
  const isBot = rank >= 6;

  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all hover:scale-105"
      style={{
        borderColor: isSelected ? color : `${color}33`,
        background: isSelected ? `${color}15` : `${color}06`,
        boxShadow: isSelected ? `0 0 18px ${color}35` : 'none',
        minWidth: 56,
      }}
    >
      {isSelected && (
        <motion.div
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          style={{ background: color }}
        />
      )}
      <span className="text-base leading-none">{FLAGS[cur]}</span>
      <span className="font-bold font-mono text-[9px]" style={{ color }}>{cur}</span>
      <span
        className="text-[8px] font-mono px-1 rounded"
        style={{ background: `${color}22`, color }}
      >
        #{rank}
      </span>
      <span className="text-[7px] font-mono" style={{ color: `${color}80` }}>
        {score > 0 ? '+' : ''}{score.toFixed(3)}
      </span>
    </button>
  );
}

// ─── Candle Hover Tooltip ─────────────────────────────────────────────────────

function CandleTooltip({ bar, x, y }: { bar: CandleBar; x: number; y: number }) {
  const isUp = bar.close >= bar.open;
  const color = bar.direction === 'long' ? LONG_C : bar.direction === 'short' ? SHORT_C : NEUTRAL_C;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      className="absolute z-30 pointer-events-none"
      style={{ left: Math.min(x, 280), top: Math.max(y - 120, 8), transform: 'translateX(-50%)' }}
    >
      <div
        className="rounded-xl border p-3 space-y-2 backdrop-blur-md text-[9px] font-mono"
        style={{
          borderColor: `${color}50`,
          background: `rgba(7,10,20,0.95)`,
          boxShadow: `0 0 20px ${color}20`,
          minWidth: 160,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400">{bar.time}</span>
          <span style={{ color }} className="font-bold">{bar.direction?.toUpperCase() ?? 'NEUTRAL'}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span className="text-slate-600">OPEN</span>  <span className="text-white">{bar.open.toFixed(5)}</span>
          <span className="text-slate-600">HIGH</span>  <span style={{ color: LONG_C }}>{bar.high.toFixed(5)}</span>
          <span className="text-slate-600">LOW</span>   <span style={{ color: SHORT_C }}>{bar.low.toFixed(5)}</span>
          <span className="text-slate-600">CLOSE</span> <span className="text-white">{bar.close.toFixed(5)}</span>
        </div>
        <div className="border-t border-slate-800 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span className="text-slate-600">SOB</span>   <span style={{ color: getRankColor(bar.rank) }}>{bar.sobScore > 0 ? '+' : ''}{bar.sobScore.toFixed(4)}</span>
          <span className="text-slate-600">RANK</span>  <span style={{ color: getRankColor(bar.rank) }}>#{bar.rank}</span>
          <span className="text-slate-600">FLOW</span>  <span style={{ color: bar.flow >= 0 ? LONG_C : SHORT_C }}>{bar.flow >= 0 ? '↑' : '↓'} {Math.abs(bar.flow).toFixed(2)}</span>
        </div>
        {(bar.gate1 || bar.gate2 || bar.gate3) && (
          <div className="flex gap-1.5 flex-wrap border-t border-slate-800 pt-1.5">
            {bar.gate1 && <span className="px-1.5 py-0.5 rounded text-[8px]" style={{ background: `${G1_C}22`, color: G1_C, border: `1px solid ${G1_C}44` }}>G1</span>}
            {bar.gate2 && <span className="px-1.5 py-0.5 rounded text-[8px]" style={{ background: `${G2_C}22`, color: G2_C, border: `1px solid ${G2_C}44` }}>G2</span>}
            {bar.gate3 && <span className="px-1.5 py-0.5 rounded text-[8px]" style={{ background: `${G3_C}22`, color: G3_C, border: `1px solid ${G3_C}44` }}>G3</span>}
            {bar.triplelock && (
              <motion.span
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="px-1.5 py-0.5 rounded text-[8px] flex items-center gap-0.5 font-bold"
                style={{ background: `${LONG_C}22`, color: LONG_C, border: `1px solid ${LONG_C}44` }}
              >
                <Zap className="w-2 h-2" /> STRIKE
              </motion.span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Zone Legend Strip ────────────────────────────────────────────────────────

function ZoneLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[8px] font-mono text-slate-500 px-1">
      <span className="text-slate-600 font-bold uppercase tracking-wider">Zones:</span>
      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm" style={{ background: `${LONG_C}55` }} /><span>Candles</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm" style={{ background: '#7fff0055' }} /><span>SOB Strength Ribbon</span></div>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          <div className="w-2 h-2 rounded-full" style={{ background: G1_C }} />
          <div className="w-2 h-2 rounded-full" style={{ background: G2_C }} />
          <div className="w-2 h-2 rounded-full" style={{ background: G3_C }} />
        </div>
        <span>Gate Stamps G1 G2 G3</span>
      </div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm" style={{ background: `${LONG_C}55` }} /><div className="w-3 h-2 rounded-sm" style={{ background: `${SHORT_C}55` }} /><span>Inflow / Outflow</span></div>
      <div className="flex items-center gap-1.5"><div className="w-6 border-t border-dashed" style={{ borderColor: '#94a3b855' }} /><span>Rank Trajectory (top arc)</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-4 rounded-sm" style={{ background: `${LONG_C}18`, border: `1px solid ${LONG_C}40` }} /><span>Triple-Lock Pillar</span></div>
    </div>
  );
}

// ─── Main MatrixStrengthChart Component ───────────────────────────────────────

export function MatrixStrengthChart({ result }: Props) {
  const [selectedCurrency, setSelectedCurrency] = useState<string>('EUR');
  const [hoveredBar, setHoveredBar] = useState<{ bar: CandleBar; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(900);
  const CHART_H = 380;

  // Measure container
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => {
      setChartWidth(Math.floor(e.contentRect.width));
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const bars = useMemo(
    () => generateCandleHistory(selectedCurrency, result, 24),
    [selectedCurrency, result]
  );

  const rank  = result.currencyRanks[selectedCurrency]  ?? 4;
  const score = result.currencyScores[selectedCurrency] ?? 0;
  const rankColor = getRankColor(rank);

  // Current candle summary (last bar = now)
  const now = bars[bars.length - 1];

  // Handle hover over canvas
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || bars.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const BAR_W = Math.floor((chartWidth - 20) / bars.length);
    const idx = Math.floor((mx - 10) / BAR_W);
    if (idx >= 0 && idx < bars.length) {
      setHoveredBar({ bar: bars[idx], x: mx, y: my });
    }
  }, [bars, chartWidth]);

  const handleMouseLeave = () => setHoveredBar(null);

  // Related signals for current currency
  const relatedSignals = result.signals.filter(
    s => s.baseCurrency === selectedCurrency || s.quoteCurrency === selectedCurrency
  ).sort((a, b) => {
    const aG = [a.gate1, a.gate2, a.gate3].filter(Boolean).length;
    const bG = [b.gate1, b.gate2, b.gate3].filter(Boolean).length;
    return bG - aG;
  });

  const strikes = relatedSignals.filter(s => s.triplelock);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${rankColor}20`, border: `1px solid ${rankColor}40` }}>
            <Activity className="w-3.5 h-3.5" style={{ color: rankColor }} />
          </div>
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Matrix Strength Chart — <span style={{ color: rankColor }}>{FLAGS[selectedCurrency]} {selectedCurrency}</span>
            </h2>
            <p className="text-[8px] text-slate-600 mt-0.5">
              Candlestick · SOB Ribbon · Gate Stamps · Capital Flow · Rank Arc · 30M Terrain
            </p>
          </div>
        </div>

        {/* Live rank badge */}
        <div className="flex items-center gap-2">
          {rank === 1 && <Crown className="w-4 h-4" style={{ color: rankColor }} />}
          {rank === 8 && <Skull className="w-4 h-4" style={{ color: rankColor }} />}
          <div
            className="px-3 py-1.5 rounded-lg font-bold font-mono text-xs"
            style={{ background: `${rankColor}18`, color: rankColor, border: `1px solid ${rankColor}40` }}
          >
            Rank #{rank} · {score > 0 ? '+' : ''}{score.toFixed(4)}
          </div>
          {strikes.length > 0 && (
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold font-mono"
              style={{ background: `${rankColor}18`, color: rankColor, border: `1px solid ${rankColor}50` }}
            >
              <Zap className="w-3 h-3" /> {strikes.length} STRIKE{strikes.length !== 1 ? 'S' : ''}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Currency Selector ── */}
      <div className="flex gap-2 flex-wrap">
        {CURRENCIES.map(cur => (
          <CurrencyTab
            key={cur}
            cur={cur}
            rank={result.currencyRanks[cur] ?? 4}
            score={result.currencyScores[cur] ?? 0}
            isSelected={selectedCurrency === cur}
            onClick={() => setSelectedCurrency(cur)}
          />
        ))}
      </div>

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {([
          { label: 'RANK', val: `#${rank}`, color: rankColor },
          { label: 'SOB', val: `${score > 0 ? '+' : ''}${score.toFixed(4)}`, color: rankColor },
          { label: 'DIRECTION', val: now?.direction?.toUpperCase() ?? 'NEUTRAL', color: now?.direction === 'long' ? LONG_C : now?.direction === 'short' ? SHORT_C : NEUTRAL_C },
          { label: 'FLOW', val: now?.flow >= 0 ? '↑ IN' : '↓ OUT', color: now?.flow >= 0 ? LONG_C : SHORT_C },
          { label: 'G1 TERRAIN', val: now?.gate1 ? 'OPEN' : 'CLOSED', color: now?.gate1 ? G1_C : '#374151' },
          { label: 'G2 ATLAS', val: now?.gate2 ? 'OPEN' : 'CLOSED', color: now?.gate2 ? G2_C : '#374151' },
          { label: 'G3 VECTOR', val: now?.gate3 ? 'OPEN' : 'CLOSED', color: now?.gate3 ? G3_C : '#374151' },
          { label: 'STATUS', val: now?.triplelock ? '⚡ STRIKE' : `${[now?.gate1, now?.gate2, now?.gate3].filter(Boolean).length}/3`, color: now?.triplelock ? LONG_C : '#94a3b8' },
        ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
          <div key={label}
            className="flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg border text-center"
            style={{ borderColor: `${color}30`, background: `${color}08` }}>
            <span className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</span>
            <span className="text-[10px] font-bold font-mono" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* ── Chart Canvas ── */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-slate-800/60 cursor-crosshair"
        style={{ height: CHART_H, background: 'hsl(230 30% 4%)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {chartWidth > 0 && (
          <CanvasChart
            bars={bars}
            currency={selectedCurrency}
            rank={rank}
            score={score}
            width={chartWidth}
            height={CHART_H}
          />
        )}

        {/* Zone labels — floating overlays */}
        <div className="absolute left-0 top-0 pointer-events-none select-none" style={{ padding: '28px 4px 0' }}>
          <div className="text-[7px] font-mono font-bold" style={{ color: `${rankColor}60` }}>PRICE</div>
        </div>

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredBar && (
            <CandleTooltip
              bar={hoveredBar.bar}
              x={hoveredBar.x}
              y={hoveredBar.y}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Zone legend ── */}
      <ZoneLegend />

      {/* ── Related Signals for this currency ── */}
      {relatedSignals.length > 0 && (
        <div className="space-y-2 border-t border-slate-800/60 pt-3">
          <p className="text-[8px] text-slate-600 uppercase tracking-widest font-mono">
            {selectedCurrency} Active Pairs — {relatedSignals.length} crosses
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {relatedSignals.slice(0, 8).map(s => {
              const gc = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
              const isBase = s.baseCurrency === selectedCurrency;
              const pairColor = s.triplelock ? (s.direction === 'long' ? LONG_C : SHORT_C) :
                gc === 2 ? '#f97316' : gc === 1 ? '#facc15' : NEUTRAL_C;
              return (
                <motion.div
                  key={s.instrument}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-[9px] font-mono"
                  style={{
                    borderColor: `${pairColor}35`,
                    background: `${pairColor}08`,
                  }}
                >
                  <div>
                    <div className="font-bold text-white">{s.instrument.replace('_', '/')}</div>
                    <div style={{ color: pairColor }}>
                      {s.direction?.toUpperCase() ?? 'NEUTRAL'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-0.5">
                      {[s.gate1, s.gate2, s.gate3].map((g, i) => (
                        <div key={i} className="w-2 h-2 rounded-full"
                          style={{ background: g ? [G1_C, G2_C, G3_C][i] : '#1e293b' }} />
                      ))}
                    </div>
                    {s.triplelock && (
                      <motion.span
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        className="text-[7px] font-bold flex items-center gap-0.5"
                        style={{ color: pairColor }}
                      >
                        <Zap className="w-2 h-2" /> STRIKE
                      </motion.span>
                    )}
                    {!s.triplelock && (
                      <span style={{ color: `${pairColor}80` }}>{gc}/3</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
