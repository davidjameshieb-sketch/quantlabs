// Order Flow Battlefield — Liquidity Heatmap + Footprint Candles + CVD + Wall Absorption
// Three-phase visualization: Identify the Battlefield → Measure Kinetic Effort → Execution Trigger
//
// Layers rendered on Canvas:
//   ① Liquidity Heatmap — glowing horizontal bands where resting orders cluster (Atlas Walls)
//   ② Footprint Candles — each candle split into bid/ask ladder with imbalance highlighting
//   ③ CVD (Cumulative Volume Delta) — running tally of aggressive buyers vs sellers
//   ④ Wall Absorption Meter — shows when a wall is being chewed through
//   ⑤ Gate + Matrix overlay — G1/G2/G3 stamps + SOB strength ribbon

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair, Activity, Zap, Eye, Shield,
  TrendingUp, TrendingDown, Layers, BarChart3,
} from 'lucide-react';
import type { MatrixResult, MatrixSignal } from '@/hooks/useSovereignMatrix';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FootprintLevel {
  price: number;
  bidVol: number;  // volume hitting the bid (sellers)
  askVol: number;  // volume lifting the ask (buyers)
  imbalance: number; // askVol - bidVol normalized
  isWall: boolean;    // is this a significant liquidity cluster
  wallStrength: number; // 0-1 how thick the wall is
  absorbed: number;     // 0-1 how much of the wall has been eaten
}

interface FootprintCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: FootprintLevel[];
  totalBidVol: number;
  totalAskVol: number;
  delta: number;        // askVol - bidVol for the whole candle
  cvd: number;          // cumulative delta up to this candle
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  triplelock: boolean;
  direction: 'long' | 'short' | null;
  sobScore: number;
  wallAbsorption: number; // 0-1 how much of the nearest wall is absorbed
}

interface Props {
  result: MatrixResult;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LONG_C = '#00ffea';
const SHORT_C = '#ff0055';
const WALL_C = '#ff8800';
const WALL_BRIGHT = '#ffcc00';
const IMBALANCE_BUY = '#39ff14';
const IMBALANCE_SELL = '#ff3366';
const CVD_UP = '#00ffea';
const CVD_DN = '#ff0055';
const BG = 'hsl(230, 30%, 3%)';

const PAIRS_WITH_SIGNALS = [
  'AUD_USD', 'NZD_USD', 'EUR_USD', 'GBP_USD', 'USD_JPY',
  'EUR_JPY', 'GBP_JPY', 'EUR_GBP', 'USD_CAD', 'USD_CHF',
];

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

// ─── Synthetic Order Flow Generator ──────────────────────────────────────────
// Generates realistic footprint data anchored to real matrix signal data.
// When real OANDA order book data is available, this will be replaced.

function generateFootprintHistory(
  signal: MatrixSignal,
  result: MatrixResult,
  numCandles = 24,
): FootprintCandle[] {
  const isJPY = signal.instrument.includes('JPY');
  const pipSize = isJPY ? 0.01 : 0.0001;
  const decimals = isJPY ? 3 : 5;
  const basePrice = signal.currentPrice;
  const direction = signal.direction;
  const g2Detail = signal.gate2Detail;

  // Atlas Wall locations (Gate 2 breakout levels)
  const atlasHigh = g2Detail?.highest20 ?? basePrice + 40 * pipSize;
  const atlasLow = g2Detail?.lowest20 ?? basePrice - 40 * pipSize;
  const wallTarget = direction === 'long' ? atlasHigh : atlasLow;

  // Price range for the chart
  const rangeHigh = Math.max(atlasHigh + 20 * pipSize, basePrice + 30 * pipSize);
  const rangeLow = Math.min(atlasLow - 20 * pipSize, basePrice - 30 * pipSize);
  const bucketSize = isJPY ? 0.02 : 0.00020; // price per footprint level
  const numLevels = Math.max(10, Math.ceil((rangeHigh - rangeLow) / bucketSize));

  const now = new Date();
  const candles: FootprintCandle[] = [];
  let prevClose = basePrice - (numCandles * 3 * pipSize * (direction === 'long' ? 1 : -1));
  let cvd = 0;

  // Seed for deterministic-ish randomness
  const seed = signal.instrument.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  for (let i = numCandles - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 30 * 60 * 1000);
    const progress = (numCandles - i) / numCandles; // 0→1 toward now
    const isFinal = i === 0;

    // Price movement toward current price
    const drift = (basePrice - prevClose) * 0.15;
    const vol = (rangeHigh - rangeLow) * 0.03 * (0.5 + rand());
    const open = prevClose;
    const close = isFinal ? basePrice : open + drift + (rand() - 0.5) * vol;
    const high = Math.max(open, close) + rand() * vol * 0.5;
    const low = Math.min(open, close) - rand() * vol * 0.5;

    // Build footprint levels for this candle
    const candleLevels: FootprintLevel[] = [];
    const bodyTop = Math.max(open, close);
    const bodyBot = Math.min(open, close);

    for (let l = 0; l < numLevels; l++) {
      const levelPrice = rangeLow + l * bucketSize;
      if (levelPrice < low - bucketSize || levelPrice > high + bucketSize) continue;

      const inBody = levelPrice >= bodyBot && levelPrice <= bodyTop;
      const distFromPrice = Math.abs(levelPrice - close);
      const distFromWall = Math.abs(levelPrice - wallTarget);

      // Wall detection: is this price near the Atlas Wall?
      const wallProximity = Math.max(0, 1 - distFromWall / (15 * pipSize));
      const isWall = wallProximity > 0.5;
      const wallStrength = isWall ? wallProximity * (0.5 + rand() * 0.5) : 0;

      // Volume distribution
      const baseVol = 50 + rand() * 200;
      const bodyBoost = inBody ? 1.5 : 0.5;
      const wallBoost = isWall ? 2.5 + wallStrength * 3 : 1;

      // Bid/Ask split based on direction + progress
      const buyPressure = direction === 'long'
        ? 0.5 + progress * 0.3 + (rand() - 0.3) * 0.3
        : 0.5 - progress * 0.2 + (rand() - 0.5) * 0.3;

      let askVol = baseVol * bodyBoost * buyPressure;
      let bidVol = baseVol * bodyBoost * (1 - buyPressure);

      // Near the wall: thick resting orders being absorbed
      if (isWall) {
        if (direction === 'long') {
          // Sell limits at the wall being hit by market buys
          askVol *= wallBoost * (0.8 + progress * 1.5); // buyers attacking
          bidVol *= 0.5 + rand() * 0.5; // sellers fading
        } else {
          bidVol *= wallBoost * (0.8 + progress * 1.5);
          askVol *= 0.5 + rand() * 0.5;
        }
      }

      // Absorption: later candles show the wall being eaten
      const absorbed = isWall ? Math.min(1, progress * 1.2 * (0.6 + rand() * 0.4)) : 0;

      const imbalance = askVol > 0 ? (askVol - bidVol) / Math.max(askVol, bidVol) : 0;

      candleLevels.push({
        price: +levelPrice.toFixed(decimals),
        bidVol: Math.round(bidVol),
        askVol: Math.round(askVol),
        imbalance: +imbalance.toFixed(2),
        isWall,
        wallStrength: +wallStrength.toFixed(2),
        absorbed: +absorbed.toFixed(2),
      });
    }

    const totalBid = candleLevels.reduce((s, l) => s + l.bidVol, 0);
    const totalAsk = candleLevels.reduce((s, l) => s + l.askVol, 0);
    const delta = totalAsk - totalBid;
    cvd += delta;

    // Gate states: real for final candle, synthetic walk for history
    let gate1 = false, gate2 = false, gate3 = false, triplelock = false;
    let dir = signal.direction;

    if (isFinal) {
      gate1 = signal.gate1;
      gate2 = signal.gate2;
      gate3 = signal.gate3;
      triplelock = signal.triplelock;
    } else {
      gate1 = signal.gate1 && progress > 0.3;
      gate2 = signal.gate2 && progress > 0.7;
      gate3 = signal.gate3 && progress > 0.8;
      triplelock = gate1 && gate2 && gate3;
    }

    // Wall absorption for the nearest wall
    const nearestWallLevels = candleLevels.filter(l => l.isWall);
    const avgAbsorption = nearestWallLevels.length > 0
      ? nearestWallLevels.reduce((s, l) => s + l.absorbed, 0) / nearestWallLevels.length
      : 0;

    // SOB score walk
    const sobBase = signal.sobScore ?? 0;
    const sobScore = sobBase * (0.3 + progress * 0.7) + (rand() - 0.5) * 0.5;

    candles.push({
      time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      open: +open.toFixed(decimals),
      high: +high.toFixed(decimals),
      low: +low.toFixed(decimals),
      close: +close.toFixed(decimals),
      levels: candleLevels,
      totalBidVol: totalBid,
      totalAskVol: totalAsk,
      delta,
      cvd,
      gate1,
      gate2,
      gate3,
      triplelock,
      direction: dir,
      sobScore,
      wallAbsorption: avgAbsorption,
    });

    prevClose = close;
  }

  return candles;
}

// ─── Canvas Renderer ─────────────────────────────────────────────────────────

interface CanvasProps {
  candles: FootprintCandle[];
  signal: MatrixSignal;
  width: number;
  height: number;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}

function BattlefieldCanvas({ candles, signal, width, height, hoveredIdx, onHover }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isJPY = signal.instrument.includes('JPY');
  const decimals = isJPY ? 3 : 5;
  const pipSize = isJPY ? 0.01 : 0.0001;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const N = candles.length;
    const BAR_W = Math.floor((width - 60) / N);
    const idx = Math.floor((x - 40) / BAR_W);
    onHover(idx >= 0 && idx < N ? idx : null);
  }, [candles.length, width, onHover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
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

    // ── Layout zones ──
    const MARGIN_L = 40;
    const MARGIN_R = 20;
    const PRICE_TOP = 10;
    const PRICE_H = H * 0.48;
    const PRICE_BOT = PRICE_TOP + PRICE_H;
    const ABSORPTION_TOP = PRICE_BOT + 4;
    const ABSORPTION_H = 16;
    const ABSORPTION_BOT = ABSORPTION_TOP + ABSORPTION_H;
    const CVD_TOP = ABSORPTION_BOT + 8;
    const CVD_H = H * 0.18;
    const CVD_BOT = CVD_TOP + CVD_H;
    const DELTA_TOP = CVD_BOT + 8;
    const DELTA_H = H * 0.14;
    const DELTA_BOT = DELTA_TOP + DELTA_H;
    const LABEL_TOP = DELTA_BOT + 2;

    // ── Background ──
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // ── Subtle grid ──
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = PRICE_TOP + (PRICE_H / 6) * i;
      ctx.beginPath(); ctx.moveTo(MARGIN_L, y); ctx.lineTo(W - MARGIN_R, y); ctx.stroke();
    }

    // ── Price range ──
    const allPrices = candles.flatMap(c => [c.high, c.low]);
    const pMin = Math.min(...allPrices);
    const pMax = Math.max(...allPrices);
    const pPad = (pMax - pMin) * 0.1;
    const prMin = pMin - pPad;
    const prMax = pMax + pPad;

    const toY = (p: number) => PRICE_BOT - ((p - prMin) / (prMax - prMin || 1)) * PRICE_H;

    // ── Bar geometry ──
    const N = candles.length;
    const BAR_W = Math.floor((W - MARGIN_L - MARGIN_R) / N);
    const BAR_GAP = Math.max(1, Math.floor(BAR_W * 0.12));
    const BODY_W = BAR_W - BAR_GAP * 2;
    const xLeft = (i: number) => MARGIN_L + i * BAR_W + BAR_GAP;
    const xCenter = (i: number) => MARGIN_L + i * BAR_W + BAR_W / 2;

    // ── PHASE 1: Liquidity Heatmap Background ──
    // Draw glowing horizontal bands at Atlas Wall price levels
    const g2 = signal.gate2Detail;
    if (g2) {
      const wallHigh = g2.highest20;
      const wallLow = g2.lowest20;
      const wallBandWidth = (prMax - prMin) * 0.04;

      // Upper wall (sell limits / resistance)
      const yWallHigh = toY(wallHigh);
      const gradHigh = ctx.createLinearGradient(0, yWallHigh - 20, 0, yWallHigh + 20);
      gradHigh.addColorStop(0, 'transparent');
      gradHigh.addColorStop(0.3, `${WALL_C}15`);
      gradHigh.addColorStop(0.5, `${WALL_BRIGHT}30`);
      gradHigh.addColorStop(0.7, `${WALL_C}15`);
      gradHigh.addColorStop(1, 'transparent');
      ctx.fillStyle = gradHigh;
      ctx.fillRect(MARGIN_L, yWallHigh - 20, W - MARGIN_L - MARGIN_R, 40);

      // Lower wall (buy limits / support)
      const yWallLow = toY(wallLow);
      const gradLow = ctx.createLinearGradient(0, yWallLow - 20, 0, yWallLow + 20);
      gradLow.addColorStop(0, 'transparent');
      gradLow.addColorStop(0.3, `${WALL_C}15`);
      gradLow.addColorStop(0.5, `${WALL_BRIGHT}25`);
      gradLow.addColorStop(0.7, `${WALL_C}15`);
      gradLow.addColorStop(1, 'transparent');
      ctx.fillStyle = gradLow;
      ctx.fillRect(MARGIN_L, yWallLow - 20, W - MARGIN_L - MARGIN_R, 40);

      // Wall labels
      ctx.fillStyle = `${WALL_BRIGHT}99`;
      ctx.font = 'bold 8px Space Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`▲ ATLAS WALL ${wallHigh.toFixed(decimals)}`, MARGIN_L + 4, yWallHigh - 22);
      ctx.fillText(`▼ ATLAS WALL ${wallLow.toFixed(decimals)}`, MARGIN_L + 4, yWallLow + 30);

      // Dashed wall lines
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = `${WALL_BRIGHT}40`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(MARGIN_L, yWallHigh); ctx.lineTo(W - MARGIN_R, yWallHigh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MARGIN_L, yWallLow); ctx.lineTo(W - MARGIN_R, yWallLow); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── PHASE 2: Footprint Candles with Imbalance ──
    candles.forEach((c, i) => {
      const cx = xCenter(i);
      const bL = xLeft(i);
      const isUp = c.close >= c.open;
      const color = isUp ? LONG_C : SHORT_C;

      const yH = toY(c.high);
      const yL = toY(c.low);
      const yO = toY(c.open);
      const yC = toY(c.close);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(2, Math.abs(yC - yO));

      // Triple-lock pillar
      if (c.triplelock) {
        const grad = ctx.createLinearGradient(bL, 0, bL + BODY_W, 0);
        const pc = c.direction === 'long' ? LONG_C : SHORT_C;
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, `${pc}18`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(bL, PRICE_TOP, BODY_W, PRICE_H);
      }

      // Wick
      ctx.strokeStyle = `${color}aa`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, yH); ctx.lineTo(cx, yL); ctx.stroke();

      // ── Footprint inside the candle body ──
      // Draw mini bid/ask bars at each price level within the candle range
      const levelsInRange = c.levels.filter(l => l.price >= c.low && l.price <= c.high);
      const maxLevelVol = Math.max(1, ...levelsInRange.map(l => Math.max(l.bidVol, l.askVol)));

      if (BODY_W > 12 && levelsInRange.length > 0) {
        // Split candle body into left (bid) and right (ask)
        const halfW = Math.floor(BODY_W / 2) - 1;

        levelsInRange.forEach(level => {
          const ly = toY(level.price);
          if (ly < PRICE_TOP || ly > PRICE_BOT) return;
          const levelH = Math.max(1, Math.min(4, PRICE_H / levelsInRange.length * 0.8));

          // Bid side (left) — selling pressure
          const bidW = Math.max(1, (level.bidVol / maxLevelVol) * halfW);
          ctx.fillStyle = level.isWall
            ? `${WALL_BRIGHT}${Math.round(level.wallStrength * 180 + 40).toString(16).padStart(2, '0')}`
            : `${IMBALANCE_SELL}55`;
          ctx.fillRect(bL, ly - levelH / 2, bidW, levelH);

          // Ask side (right) — buying pressure
          const askW = Math.max(1, (level.askVol / maxLevelVol) * halfW);
          const askColor = level.imbalance > 0.4
            ? IMBALANCE_BUY  // stacked buy imbalance
            : `${LONG_C}88`;
          ctx.fillStyle = level.isWall && level.absorbed > 0.5
            ? `${IMBALANCE_BUY}${Math.round(level.absorbed * 200 + 55).toString(16).padStart(2, '0')}`
            : `${askColor}88`;
          ctx.fillRect(bL + halfW + 2, ly - levelH / 2, askW, levelH);

          // Wall glow at this level
          if (level.isWall && level.wallStrength > 0.6) {
            ctx.shadowColor = WALL_BRIGHT;
            ctx.shadowBlur = 6 * level.wallStrength;
            ctx.fillStyle = `${WALL_BRIGHT}22`;
            ctx.fillRect(bL - 2, ly - levelH, BODY_W + 4, levelH * 2);
            ctx.shadowBlur = 0;
          }
        });
      } else {
        // Fallback: simple candle body
        const grad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
        grad.addColorStop(0, `${color}dd`);
        grad.addColorStop(1, `${color}77`);
        ctx.fillStyle = grad;
        ctx.fillRect(bL, bodyTop, BODY_W, bodyH);
      }

      // Body border
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(bL, bodyTop, BODY_W, bodyH);

      // Hovered candle highlight
      if (hoveredIdx === i) {
        ctx.strokeStyle = `${color}88`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bL - 1, bodyTop - 1, BODY_W + 2, bodyH + 2);

        // Crosshair line
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(MARGIN_L, yC); ctx.lineTo(W - MARGIN_R, yC); ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        ctx.fillStyle = `${color}`;
        ctx.font = 'bold 9px Space Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(c.close.toFixed(decimals), MARGIN_L - 3, yC + 3);
        ctx.textAlign = 'left';
      }

      // Gate stamps at bottom of candle
      const stampY = yL + 6;
      const stampR = 2.5;
      if (c.gate1) {
        ctx.beginPath(); ctx.arc(cx - 5, stampY, stampR, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15cc'; ctx.fill();
      }
      if (c.gate2) {
        ctx.beginPath(); ctx.arc(cx, stampY, stampR, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316cc'; ctx.fill();
      }
      if (c.gate3) {
        ctx.beginPath(); ctx.arc(cx + 5, stampY, stampR, 0, Math.PI * 2);
        ctx.fillStyle = '#39ff14cc'; ctx.fill();
      }

      // Time label
      if (i % Math.max(1, Math.floor(N / 8)) === 0 || i === N - 1) {
        ctx.fillStyle = 'rgba(148,163,184,0.4)';
        ctx.font = '7px Space Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(c.time, cx, H - 3);
      }
    });

    // ── Price axis labels ──
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.font = '8px Space Mono, monospace';
    for (let i = 0; i <= 4; i++) {
      const p = prMin + ((prMax - prMin) / 4) * i;
      const y = toY(p);
      ctx.fillText(p.toFixed(decimals), MARGIN_L - 3, y + 3);
    }

    // ── Wall Absorption Meter ──
    ctx.fillStyle = 'rgba(148,163,184,0.25)';
    ctx.font = 'bold 7px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WALL ABSORPTION', MARGIN_L, ABSORPTION_TOP - 1);

    candles.forEach((c, i) => {
      const bL = xLeft(i);
      const abs = c.wallAbsorption;
      const barH = ABSORPTION_H - 2;

      // Background
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(bL, ABSORPTION_TOP, BODY_W, barH);

      // Fill based on absorption
      if (abs > 0) {
        const fillH = barH * abs;
        const grad = ctx.createLinearGradient(0, ABSORPTION_TOP + barH - fillH, 0, ABSORPTION_TOP + barH);
        if (abs > 0.7) {
          grad.addColorStop(0, `${IMBALANCE_BUY}cc`);
          grad.addColorStop(1, `${IMBALANCE_BUY}44`);
        } else if (abs > 0.3) {
          grad.addColorStop(0, `${WALL_BRIGHT}aa`);
          grad.addColorStop(1, `${WALL_BRIGHT}33`);
        } else {
          grad.addColorStop(0, `${WALL_C}88`);
          grad.addColorStop(1, `${WALL_C}22`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(bL, ABSORPTION_TOP + barH - fillH, BODY_W, fillH);
      }
    });

    // ── Zone divider ──
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    [CVD_TOP - 4, DELTA_TOP - 4].forEach(y => {
      ctx.beginPath(); ctx.moveTo(MARGIN_L, y); ctx.lineTo(W - MARGIN_R, y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // ── PHASE 3: CVD (Cumulative Volume Delta) ──
    const cvdVals = candles.map(c => c.cvd);
    const cvdMin = Math.min(...cvdVals);
    const cvdMax = Math.max(...cvdVals);
    const cvdToY = (v: number) => CVD_BOT - ((v - cvdMin) / (cvdMax - cvdMin || 1)) * CVD_H;

    // CVD area fill
    ctx.beginPath();
    ctx.moveTo(xCenter(0), cvdToY(0));
    candles.forEach((c, i) => ctx.lineTo(xCenter(i), cvdToY(c.cvd)));
    ctx.lineTo(xCenter(N - 1), cvdToY(0));
    ctx.lineTo(xCenter(0), cvdToY(0));
    ctx.closePath();

    const cvdGrad = ctx.createLinearGradient(0, CVD_TOP, 0, CVD_BOT);
    const cvdTrend = candles[candles.length - 1]?.cvd ?? 0;
    if (cvdTrend > 0) {
      cvdGrad.addColorStop(0, `${CVD_UP}30`);
      cvdGrad.addColorStop(1, `${CVD_UP}05`);
    } else {
      cvdGrad.addColorStop(0, `${CVD_DN}05`);
      cvdGrad.addColorStop(1, `${CVD_DN}30`);
    }
    ctx.fillStyle = cvdGrad;
    ctx.fill();

    // CVD line
    ctx.beginPath();
    candles.forEach((c, i) => {
      const y = cvdToY(c.cvd);
      if (i === 0) ctx.moveTo(xCenter(i), y);
      else ctx.lineTo(xCenter(i), y);
    });
    ctx.strokeStyle = cvdTrend > 0 ? CVD_UP : CVD_DN;
    ctx.lineWidth = 2;
    ctx.stroke();

    // CVD zero line
    const zeroY = cvdToY(0);
    if (zeroY > CVD_TOP && zeroY < CVD_BOT) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(MARGIN_L, zeroY); ctx.lineTo(W - MARGIN_R, zeroY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // CVD label
    ctx.fillStyle = cvdTrend > 0 ? `${CVD_UP}99` : `${CVD_DN}99`;
    ctx.font = 'bold 7px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CVD ${cvdTrend > 0 ? '▲ BUYERS' : '▼ SELLERS'} DOMINANT`, MARGIN_L, CVD_TOP - 1);

    // CVD dots at current
    const lastCvdY = cvdToY(candles[candles.length - 1]?.cvd ?? 0);
    ctx.beginPath();
    ctx.arc(xCenter(N - 1), lastCvdY, 4, 0, Math.PI * 2);
    ctx.fillStyle = cvdTrend > 0 ? CVD_UP : CVD_DN;
    ctx.shadowColor = cvdTrend > 0 ? CVD_UP : CVD_DN;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Volume Delta Bars ──
    const deltaVals = candles.map(c => c.delta);
    const deltaMax = Math.max(1, ...deltaVals.map(Math.abs));
    const deltaMid = (DELTA_TOP + DELTA_BOT) / 2;

    ctx.fillStyle = 'rgba(148,163,184,0.25)';
    ctx.font = 'bold 7px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VOLUME DELTA', MARGIN_L, DELTA_TOP - 1);

    candles.forEach((c, i) => {
      const bL = xLeft(i);
      const pct = c.delta / deltaMax;
      const barH = Math.abs(pct) * (DELTA_H / 2 - 2);
      const isPos = c.delta >= 0;
      const color = isPos ? `${LONG_C}88` : `${SHORT_C}88`;

      ctx.fillStyle = color;
      if (isPos) {
        ctx.fillRect(bL, deltaMid - barH, BODY_W, barH);
      } else {
        ctx.fillRect(bL, deltaMid, BODY_W, barH);
      }
    });

    // Delta zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MARGIN_L, deltaMid); ctx.lineTo(W - MARGIN_R, deltaMid); ctx.stroke();

    // ── Current price label ──
    const currentY = toY(signal.currentPrice);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Space Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`► ${signal.currentPrice.toFixed(decimals)}`, MARGIN_L - 3, currentY + 3);

  }, [candles, signal, width, height, hoveredIdx, isJPY, decimals]);

  return (
    <canvas
      ref={canvasRef}
      className="cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover(null)}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OrderFlowBattlefield({ result }: Props) {
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 620 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Auto-select best chomp pair or first pair with G1
  const activePair = useMemo(() => {
    if (selectedPair) return selectedPair;
    if (result.bestChompPair) return result.bestChompPair;
    const withGate = result.signals.find(s => s.gate1);
    return withGate?.instrument ?? result.signals[0]?.instrument ?? 'AUD_USD';
  }, [selectedPair, result]);

  const activeSignal = useMemo(
    () => result.signals.find(s => s.instrument === activePair) ?? result.signals[0],
    [result.signals, activePair]
  );

  const candles = useMemo(
    () => activeSignal ? generateFootprintHistory(activeSignal, result) : [],
    [activeSignal, result]
  );

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(500, Math.min(700, width * 0.65)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!activeSignal) return null;

  const hoveredCandle = hoveredIdx !== null ? candles[hoveredIdx] : null;
  const isLong = activeSignal.direction === 'long';
  const dirColor = isLong ? LONG_C : activeSignal.direction === 'short' ? SHORT_C : '#94a3b8';
  const lastCandle = candles[candles.length - 1];
  const cvdTrend = lastCandle?.cvd ?? 0;
  const wallAbs = lastCandle?.wallAbsorption ?? 0;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* ── Header ── */}
      <div className="p-4 border-b border-slate-800/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${dirColor}15`, border: `1px solid ${dirColor}40` }}>
              <Crosshair className="w-4 h-4" style={{ color: dirColor }} />
            </div>
            <div>
              <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase flex items-center gap-2">
                Order Flow Battlefield
                <span className="text-[8px] font-normal text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
                  FOOTPRINT + CVD + HEATMAP
                </span>
              </h2>
              <p className="text-[8px] text-slate-500 mt-0.5 tracking-wider">
                LIQUIDITY WALLS · VOLUME ABSORPTION · KINETIC EFFORT
              </p>
            </div>
          </div>

          {/* Phase indicators */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/30 bg-amber-500/5">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[8px] font-mono text-amber-400">P1 HEATMAP</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: `${IMBALANCE_BUY}44`, background: `${IMBALANCE_BUY}08` }}>
              <div className="w-2 h-2 rounded-full" style={{ background: IMBALANCE_BUY }} />
              <span className="text-[8px] font-mono" style={{ color: IMBALANCE_BUY }}>P2 FOOTPRINT</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: `${dirColor}44`, background: `${dirColor}08` }}>
              <div className="w-2 h-2 rounded-full" style={{ background: dirColor }} />
              <span className="text-[8px] font-mono" style={{ color: dirColor }}>P3 TRIGGER</span>
            </div>
          </div>
        </div>

        {/* Pair selector */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
          {result.signals.map(s => {
            const isActive = s.instrument === activePair;
            const gc = [s.gate1, s.gate2, s.gate3].filter(Boolean).length;
            const pair = s.instrument.replace('_', '/');
            const [base, quote] = s.instrument.split('_');
            const pairColor = s.triplelock ? (s.direction === 'long' ? LONG_C : SHORT_C)
              : gc >= 2 ? '#facc15' : gc === 1 ? '#94a3b8' : '#475569';

            return (
              <button
                key={s.instrument}
                onClick={() => setSelectedPair(s.instrument)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-all shrink-0"
                style={{
                  borderColor: isActive ? `${pairColor}80` : 'rgba(71,85,105,0.3)',
                  background: isActive ? `${pairColor}15` : 'transparent',
                  color: isActive ? pairColor : '#94a3b8',
                }}
              >
                <span>{FLAGS[base]}</span>
                <span className="font-bold">{pair}</span>
                {s.triplelock && <Zap className="w-2.5 h-2.5" />}
                {gc > 0 && !s.triplelock && (
                  <span className="opacity-60">{gc}/3</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="px-4 py-2 border-b border-slate-800/30 flex items-center gap-4 flex-wrap text-[9px] font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">PAIR</span>
          <span className="font-bold" style={{ color: dirColor }}>
            {activePair.replace('_', '/')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">DIR</span>
          <span className="font-bold flex items-center gap-0.5" style={{ color: dirColor }}>
            {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {activeSignal.direction?.toUpperCase() ?? 'NEUTRAL'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">CVD</span>
          <span className="font-bold" style={{ color: cvdTrend > 0 ? CVD_UP : CVD_DN }}>
            {cvdTrend > 0 ? '▲' : '▼'} {Math.abs(cvdTrend).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">WALL ABS</span>
          <span className="font-bold" style={{
            color: wallAbs > 0.7 ? IMBALANCE_BUY : wallAbs > 0.3 ? WALL_BRIGHT : WALL_C
          }}>
            {(wallAbs * 100).toFixed(0)}%
          </span>
        </div>
        {activeSignal.triplelock && (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="px-2 py-0.5 rounded border font-bold"
            style={{ borderColor: `${dirColor}60`, color: dirColor, background: `${dirColor}15` }}
          >
            ⚡ WALL HOLLOWED — EXECUTE NOW
          </motion.span>
        )}

        {/* Hovered candle info */}
        {hoveredCandle && (
          <div className="ml-auto flex items-center gap-3 text-slate-400">
            <span>{hoveredCandle.time}</span>
            <span>O:{hoveredCandle.open.toFixed(activeSignal.instrument.includes('JPY') ? 3 : 5)}</span>
            <span>H:{hoveredCandle.high.toFixed(activeSignal.instrument.includes('JPY') ? 3 : 5)}</span>
            <span>L:{hoveredCandle.low.toFixed(activeSignal.instrument.includes('JPY') ? 3 : 5)}</span>
            <span className="font-bold text-white">C:{hoveredCandle.close.toFixed(activeSignal.instrument.includes('JPY') ? 3 : 5)}</span>
            <span style={{ color: hoveredCandle.delta > 0 ? LONG_C : SHORT_C }}>
              Δ{hoveredCandle.delta > 0 ? '+' : ''}{hoveredCandle.delta.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} className="p-2">
        <BattlefieldCanvas
          candles={candles}
          signal={activeSignal}
          width={dims.w}
          height={dims.h}
          hoveredIdx={hoveredIdx}
          onHover={setHoveredIdx}
        />
      </div>

      {/* ── Legend ── */}
      <div className="px-4 py-2.5 border-t border-slate-800/30 flex items-center gap-4 flex-wrap text-[8px] font-mono text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 rounded-sm" style={{ background: WALL_BRIGHT }} />
          ATLAS WALL
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 rounded-sm" style={{ background: IMBALANCE_BUY }} />
          BUY IMBALANCE
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 rounded-sm" style={{ background: IMBALANCE_SELL }} />
          SELL PRESSURE
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 rounded-sm" style={{ background: LONG_C }} />
          CVD UP
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 rounded-sm" style={{ background: SHORT_C }} />
          CVD DN
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[#facc15]" />
          G1
          <div className="w-2 h-2 rounded-full bg-[#f97316]" />
          G2
          <div className="w-2 h-2 rounded-full bg-[#39ff14]" />
          G3
        </div>
      </div>
    </div>
  );
}
