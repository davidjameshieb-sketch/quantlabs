import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PressureCardProps {
  instrument: string;
  mid: number;
  spread: number;
  nexusProbability: number;
  direction: 'BUY' | 'SELL' | null;
  obiLongPct: number;
  obiShortPct: number;
  wallInfo: string | null;
  adaptiveSL: number;
  adaptiveTP: number;
  atrPips: number;
  avgAtrPips: number;
  breathRatio: number;
  spreadOk: boolean;
  tradeActive?: boolean;
  tradeDirection?: string;
  tradeEntry?: number;
}

const NexusPressureCard: React.FC<PressureCardProps> = ({
  instrument, mid, spread, nexusProbability, direction,
  obiLongPct, obiShortPct, wallInfo,
  adaptiveSL, adaptiveTP, atrPips, avgAtrPips, breathRatio,
  spreadOk, tradeActive, tradeDirection, tradeEntry,
}) => {
  const pct = Math.round(nexusProbability * 100);
  const isJPY = instrument.includes('JPY');
  const prec = isJPY ? 3 : 5;

  // OBI tug-of-war
  const totalOBI = obiLongPct + obiShortPct;
  const longRatio = totalOBI > 0 ? (obiLongPct / totalOBI) * 100 : 50;

  // Probability color
  let probColor = 'hsl(var(--nexus-danger))';
  if (pct >= 88) probColor = 'hsl(var(--nexus-neon-green))';
  else if (pct >= 65) probColor = 'hsl(var(--nexus-neon-cyan))';
  else if (pct >= 45) probColor = 'hsl(var(--nexus-neon-amber))';

  // Breath visualization
  const baseSL = 20;
  const breathPct = Math.min((breathRatio / 2) * 100, 100);

  return (
    <div
      className="rounded-lg border p-4 font-mono relative overflow-hidden"
      style={{
        background: 'hsl(var(--nexus-surface))',
        borderColor: tradeActive ? 'hsl(var(--nexus-neon-green) / 0.5)' : 'hsl(var(--nexus-border))',
      }}
    >
      {tradeActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'hsl(var(--nexus-neon-green))' }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            {instrument.replace('_', '/')}
          </span>
          {direction && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
              color: direction === 'BUY' ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-amber))',
              background: direction === 'BUY' ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-neon-amber) / 0.1)',
            }}>
              {direction === 'BUY' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {direction}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          {mid.toFixed(prec)}
        </span>
      </div>

      {/* Neural Certainty */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>NEURAL CERTAINTY</span>
          <span className="font-bold" style={{ color: probColor }}>{pct}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct}%`, background: probColor }}
          />
        </div>
        <div className="flex justify-between text-[8px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          <span>0%</span>
          <span className="opacity-50">|88% STRIKE|</span>
          <span>100%</span>
        </div>
      </div>

      {/* OBI Tug-of-War */}
      <div className="mb-3">
        <div className="text-[10px] mb-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>ORDER BOOK IMBALANCE</div>
        <div className="flex h-4 rounded overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
          <div
            className="h-full transition-all duration-700 flex items-center justify-end pr-1"
            style={{ width: `${longRatio}%`, background: 'hsl(var(--nexus-neon-green) / 0.3)' }}
          >
            <span className="text-[8px] font-bold" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
              {longRatio.toFixed(0)}%
            </span>
          </div>
          <div
            className="h-full transition-all duration-700 flex items-center pl-1"
            style={{ width: `${100 - longRatio}%`, background: 'hsl(var(--nexus-neon-amber) / 0.3)' }}
          >
            <span className="text-[8px] font-bold" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
              {(100 - longRatio).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="flex justify-between text-[8px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          <span>BIDS (BUY)</span>
          <span>ASKS (SELL)</span>
        </div>
        {wallInfo && (
          <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded" style={{ color: 'hsl(var(--nexus-neon-amber))', background: 'hsl(var(--nexus-neon-amber) / 0.08)' }}>
            🧱 {wallInfo}
          </div>
        )}
      </div>

      {/* Adaptive Volatility Buffer */}
      <div className="mb-3">
        <div className="text-[10px] mb-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>ADAPTIVE VOLATILITY BUFFER</div>
        <div className="relative h-6 rounded" style={{ background: 'hsl(var(--nexus-bg))' }}>
          {/* Base SL line */}
          <div className="absolute top-0 bottom-0 w-px" style={{ left: `${(baseSL / 35) * 100}%`, background: 'hsl(var(--nexus-text-muted) / 0.4)' }} />
          {/* Adaptive SL zone */}
          <div
            className="absolute top-0.5 bottom-0.5 rounded transition-all duration-700"
            style={{
              left: '2%',
              width: `${(adaptiveSL / 35) * 100}%`,
              background: breathRatio > 1.3 ? 'hsl(var(--nexus-neon-amber) / 0.25)' : 'hsl(var(--nexus-neon-cyan) / 0.25)',
              borderRight: `2px solid ${breathRatio > 1.3 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-neon-cyan))'}`,
            }}
          />
          {/* ATR marker */}
          <div
            className="absolute top-0 bottom-0 w-1 rounded"
            style={{
              left: `${Math.min((atrPips / 35) * 100, 95)}%`,
              background: 'hsl(var(--nexus-neon-green))',
              opacity: 0.7,
            }}
          />
        </div>
        <div className="flex justify-between text-[8px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          <span>SL: {adaptiveSL}p</span>
          <span>ATR: {atrPips}p</span>
          <span>Breath: {breathRatio.toFixed(2)}x</span>
        </div>
      </div>

      {/* R:R and Spread */}
      <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid hsl(var(--nexus-border))' }}>
        <div className="flex gap-3 text-[9px]">
          <span style={{ color: 'hsl(var(--nexus-neon-green))' }}>SL: {adaptiveSL}p</span>
          <span style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>TP: {adaptiveTP}p</span>
          <span className="font-bold" style={{ color: 'hsl(var(--nexus-text-primary))' }}>R:R 1:3</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: spreadOk ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }} />
          <span className="text-[9px]" style={{ color: spreadOk ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }}>
            {spread.toFixed(1)}p
          </span>
        </div>
      </div>

      {/* Active trade overlay */}
      {tradeActive && tradeEntry && (
        <div className="mt-2 pt-2 text-[9px]" style={{ borderTop: '1px solid hsl(var(--nexus-neon-green) / 0.2)' }}>
          <span style={{ color: 'hsl(var(--nexus-neon-green))' }}>● LIVE </span>
          <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            {tradeDirection?.toUpperCase()} @ {tradeEntry.toFixed(prec)} | SL {adaptiveSL}p → TP {adaptiveTP}p
          </span>
        </div>
      )}
    </div>
  );
};

export default NexusPressureCard;
