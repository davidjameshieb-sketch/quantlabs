/**
 * DockChartCard — lightweight-charts v5 candlestick chart per pair
 * with a supply-chain "Distribution Centre Brief" beneath it.
 *
 * Uses synthetic candles seeded from live physics snapshot data.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  IChartApi,
  OhlcData,
  Time,
} from 'lightweight-charts';
import { cn } from '@/lib/utils';
import type { PairPhysics } from '@/hooks/useSyntheticOrderBook';

// ─── Supply-chain brief ───────────────────────────────────────────────────────

function buildBrief(pair: string, p: PairPhysics) {
  const E    = p.efficiency ?? 0;
  const H    = p.hurst?.H ?? 0;
  const Z    = p.zOfi ?? 0;
  const vpin = p.vpin ?? 0;

  const floorPass  = E >= 100;
  const docksPass  = Math.abs(Z) > 2.5;
  const rhythmPass = H >= 0.62;
  const vipPass    = vpin > 0.60;
  const passed     = [floorPass, docksPass, rhythmPass, vipPass].filter(Boolean).length;

  // ── Situation ──
  let situation = '';
  if (passed === 4) {
    situation = `🚀 LOGISTICS BREAKTHROUGH — all 4 gates green. Floor polished (${E.toFixed(0)}×), 40 trucks at docks (Z=${Z>=0?'+':''}${Z.toFixed(1)}σ), workers in rhythm (H=${H.toFixed(2)}), VIP manifest confirmed (VPIN=${vpin.toFixed(2)}). Strike executing.`;
  } else if (passed === 3) {
    const missing = !floorPass ? '🏭 floor friction' : !docksPass ? '🚛 dock surge' : !rhythmPass ? '🚶 worker rhythm' : '🏗 VIP manifest';
    situation = `⚙️ 3/4 gates green. One away from Logistics Breakthrough. Waiting on ${missing}.`;
  } else if (passed === 2) {
    situation = `🔍 Partial coil — 2/4 gates lit. Belt running but no surge yet. Staging area loading. Monitoring for convergence.`;
  } else if (passed === 1) {
    situation = `💤 Normal warehouse activity — 1/4 gates. Belt at baseline, no priority manifests. Stand by.`;
  } else {
    situation = `💤 Quiet dock. No active manifests. Business as usual — warehouse waits.`;
  }

  // ── Environment ──
  let environment = '';
  let environmentColor = 'text-muted-foreground';
  if (E >= 100) {
    environment = `🏭 POLISHED EPOXY (${E.toFixed(0)}×) — zero resistance. Pallet slides to truck with no drag.`;
    environmentColor = 'text-yellow-400';
  } else if (E >= 50) {
    environment = `🏭 SWEPT CONCRETE (${E.toFixed(0)}×) — moderate drag. Freight moves but not frictionless.`;
    environmentColor = 'text-amber-400';
  } else {
    environment = `🏭 CRACKED CONCRETE (${E.toFixed(0)}×) — high drag. Broken pallet on the floor. No strike.`;
    environmentColor = 'text-muted-foreground';
  }
  if (H >= 0.62) environment += ` · 🚶 Straight lines (H=${H.toFixed(2)}) — flow continuous.`;
  else if (H < 0.45) environment += ` · 🚶⚠ WORKERS LOST (H=${H.toFixed(2)}) — Rule 5.3 abort if in trade.`;
  else environment += ` · 🚶 Drifting (H=${H.toFixed(2)}) — not efficient yet.`;

  if (Math.abs(Z) > 2.5) environment += ` · 🚛 DOCK SURGE (Z=${Z>=0?'+':''}${Z.toFixed(1)}σ) — Whale arrived.`;
  else if (Math.abs(Z) > 1.5) environment += ` · 🚛 Trucks gathering (Z=${Z>=0?'+':''}${Z.toFixed(1)}σ) — building.`;
  else environment += ` · 🚛 Normal traffic (Z=${Z>=0?'+':''}${Z.toFixed(1)}σ).`;

  // ── Action ──
  let action = '';
  if (passed === 4) action = '🎯 ACTION: LIMIT order pre-staged at BID WALL ±0.1p. 1,250-unit pallet awaiting fill. PID ratchet at +3.0p. TP=+10p · SL=−10p.';
  else if (passed >= 3) action = '⏳ WATCH: Hold. One gate from a Strike. Do not force entry — wait for the missing gate.';
  else if (H < 0.45) action = '🛑 STANDBY: Worker rhythm collapsed. Engine in FATIGUE mode. No pallets until H>0.55.';
  else action = '👁 MONITOR: Normal pace. Warehouse signals when conditions shift toward Breakthrough.';

  return { situation, environment, environmentColor, gatesCount: passed, gatesLabel: `${passed}/4`, action };
}

// ─── Synthetic candles from physics snapshot ──────────────────────────────────

function generateSyntheticCandles(pair: string, p: PairPhysics, count = 80): OhlcData<Time>[] {
  const basePrice = (() => {
    if (pair.includes('JPY')) return 140 + (pair.charCodeAt(0) % 20) + (pair.charCodeAt(4) % 10) * 0.3;
    if (pair.startsWith('GBP')) return 1.24 + (pair.charCodeAt(3) % 10) * 0.01;
    if (pair.startsWith('EUR')) return 1.07 + (pair.charCodeAt(3) % 10) * 0.005;
    if (pair.startsWith('AUD')) return 0.63 + (pair.charCodeAt(3) % 10) * 0.003;
    if (pair.startsWith('NZD')) return 0.58 + (pair.charCodeAt(3) % 10) * 0.003;
    if (pair.startsWith('USD')) return 1.00 + (pair.charCodeAt(3) % 10) * 0.008;
    return 1.08 + (pair.charCodeAt(0) % 10) * 0.01;
  })();

  const H     = p.hurst?.H ?? 0.5;
  const Z     = p.zOfi ?? 0;
  const eff   = p.efficiency ?? 1;
  const drift = (p.kramersMoyal?.D1 ?? 0) * 500 + (p.bias === 'BUY' ? 0.00003 : p.bias === 'SELL' ? -0.00003 : 0);
  const vol   = Math.sqrt(Math.max(p.kramersMoyal?.D2 ?? 0.0000001, 1e-10)) * 0.4 + 0.00008;

  // Simple deterministic RNG seeded from pair name
  let seed = pair.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const now = Math.floor(Date.now() / 1000);
  const interval = 300; // 5-min candles
  const candles: OhlcData<Time>[] = [];
  let price = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const t = (now - i * interval) as Time;
    const hurstFactor = H > 0.5 ? (1 + (H - 0.5) * 0.6) : (1 - (0.5 - H) * 0.4);
    const zBoost  = Math.abs(Z) > 2 ? 1.25 : 1.0;
    const effBoost = eff > 100 ? 1.1 : 1.0;
    const move = (rng() - 0.488 + drift * 50) * vol * hurstFactor * zBoost * effBoost;
    const open  = price;
    const close = price + move;
    const wick  = vol * rng() * 0.4;
    const high  = Math.max(open, close) + wick;
    const low   = Math.min(open, close) - wick * 0.6;
    candles.push({ time: t, open, high, low, close });
    price = close;
  }
  return candles;
}

// ─── Chart component ──────────────────────────────────────────────────────────

interface DockChartCardProps {
  pair: string;
  data: PairPhysics;
  activeTrade: any | null;
}

export function DockChartCard({ pair, data, activeTrade }: DockChartCardProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const brief = buildBrief(pair, data);

  const cardBorder = brief.gatesCount === 4
    ? 'border-green-500/40'
    : brief.gatesCount === 3
    ? 'border-yellow-500/30'
    : 'border-border/30';

  const gateChipColor = brief.gatesCount === 4
    ? 'text-green-400 border-green-500/40 bg-green-500/10'
    : brief.gatesCount === 3
    ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
    : brief.gatesCount === 2
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
    : 'text-muted-foreground border-border/30 bg-muted/10';

  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const c = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor:  'rgba(148,163,184,0.7)',
        fontSize:   9,
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.025)' },
        horzLines: { color: 'rgba(255,255,255,0.035)' },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
      timeScale: {
        borderColor:    'rgba(255,255,255,0.05)',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  chartContainerRef.current.clientWidth,
      height: 155,
    });

    const isHot = brief.gatesCount >= 3;
    const series = c.addSeries(CandlestickSeries, {
      upColor:         isHot ? '#22c55e' : '#4ade80',
      downColor:       isHot ? '#ef4444' : '#f87171',
      borderUpColor:   isHot ? '#16a34a' : '#22c55e',
      borderDownColor: isHot ? '#dc2626' : '#ef4444',
      wickUpColor:     'rgba(74,222,128,0.5)',
      wickDownColor:   'rgba(248,113,113,0.5)',
    });

    series.setData(generateSyntheticCandles(pair, data));
    c.timeScale().fitContent();
    chartRef.current = c;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, [pair, data, brief.gatesCount]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Climax v2.0 gate pills
  const gates = [
    { pass: (data.efficiency ?? 0) >= 100, label: '🏭 Floor',  tip: 'Efficiency ≥100× — polished epoxy floor' },
    { pass: Math.abs(data.zOfi ?? 0) > 2.5, label: '🚛 Docks',  tip: 'Z-OFI >2.5σ — Whale truck surge' },
    { pass: (data.hurst?.H ?? 0) >= 0.62,   label: '🚶 Rhythm', tip: 'Hurst ≥0.62 — workers in straight lines' },
    { pass: (data.vpin ?? 0) > 0.60,        label: '🏗 VIP',    tip: 'VPIN >0.60 — market makers fleeing' },
  ];

  return (
    <div className={cn(
      'rounded-xl border bg-card/70 overflow-hidden transition-all duration-500',
      cardBorder,
      brief.gatesCount === 4 && 'shadow-lg shadow-green-500/10',
    )}>
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-1.5 flex-wrap">
        <span className="font-display font-black text-sm tracking-widest">{pair.replace('_', '/')}</span>
        <span className={cn('text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border', gateChipColor)}>
          {brief.gatesLabel}
          {brief.gatesCount === 4 && ' ⚡ BREAKTHROUGH'}
          {brief.gatesCount === 3 && ' ⏳ ONE AWAY'}
          {brief.gatesCount <= 1 && ' 💤 IDLE'}
        </span>
        {activeTrade && (
          <span className={cn('text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border',
            activeTrade.direction === 'long'
              ? 'text-green-400 border-green-500/40 bg-green-500/10'
              : 'text-red-400 border-red-500/40 bg-red-500/10'
          )}>
            🛡 {activeTrade.direction === 'long' ? '📈 OUTBOUND' : '📉 INBOUND'}
          </span>
        )}
        <span className={cn('ml-auto text-[8px] font-mono font-bold',
          data.bias === 'BUY' ? 'text-green-400' : data.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground/40'
        )}>
          {data.bias}
        </span>
      </div>

      {/* ── Chart canvas with gate overlay ── */}
      <div className="relative bg-card/40">
        <div ref={chartContainerRef} className="w-full" />
        {/* Gate pills overlaid top-left of chart */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 pointer-events-none">
          {gates.map(({ pass, label }) => (
            <div key={label} className={cn(
              'text-[6px] font-mono font-bold px-1 py-0.5 rounded border',
              pass
                ? 'bg-green-500/30 text-green-300 border-green-500/40'
                : 'bg-card/70 text-muted-foreground/25 border-border/10',
            )}>
              {pass ? '✓' : '○'} {label}
            </div>
          ))}
        </div>
        {/* Market state badge top-right */}
        <div className="absolute top-1.5 right-1.5 pointer-events-none">
          <span className={cn('text-[6px] font-mono px-1 py-0.5 rounded border',
            data.marketState === 'LIQUID'    ? 'text-green-400 border-green-500/30 bg-green-500/10' :
            data.marketState === 'ABSORBING' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' :
            data.marketState === 'SLIPPING'  ? 'text-red-400 border-red-500/30 bg-red-500/10' :
            'text-muted-foreground/30 border-border/10 bg-card/50'
          )}>
            {data.marketState ?? 'NEUTRAL'}
          </span>
        </div>
      </div>

      {/* ── Supply Chain Distribution Centre Brief ── */}
      <div className="px-3 py-2.5 space-y-2 border-t border-border/20">

        {/* Situation */}
        <div>
          <div className="text-[7px] font-mono font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">
            📋 Situation Report
          </div>
          <p className="text-[9px] font-mono text-foreground/75 leading-relaxed">{brief.situation}</p>
        </div>

        {/* Environment */}
        <div>
          <div className="text-[7px] font-mono font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">
            🏗 Distribution Centre Environment
          </div>
          <p className={cn('text-[9px] font-mono leading-relaxed', brief.environmentColor)}>
            {brief.environment}
          </p>
        </div>

        {/* Action recommendation */}
        <div className={cn(
          'rounded-lg border px-2 py-1.5 text-[9px] font-mono leading-relaxed',
          brief.gatesCount === 4
            ? 'border-green-500/30 bg-green-500/8 text-green-300'
            : brief.gatesCount === 3
            ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'
            : 'border-border/20 bg-muted/10 text-muted-foreground',
        )}>
          {brief.action}
        </div>

        {/* Raw telemetry strip */}
        <div className="flex items-center gap-3 flex-wrap text-[7px] font-mono text-muted-foreground/40 border-t border-border/10 pt-1.5">
          <span>🏭 {(data.efficiency??0).toFixed(0)}×</span>
          <span>🚛 {(data.zOfi??0)>=0?'+':''}{(data.zOfi??0).toFixed(1)}σ</span>
          <span>🚶 H={(data.hurst?.H??0).toFixed(2)}</span>
          <span>🏗 VPIN={(data.vpin??0).toFixed(2)}</span>
          <span>📡 {data.ticksAnalyzed??0} ticks</span>
          <span className="ml-auto">{(data.buyPct??0)}% buy · {(data.sellPct??0)}% sell</span>
        </div>
      </div>
    </div>
  );
}
