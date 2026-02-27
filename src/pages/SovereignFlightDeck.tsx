import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brain, Crosshair, Shield, AlertTriangle, Zap, Radio, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'] as const;

interface PricingData { bid: number; ask: number; spread: number; mid: number; }
interface OrderBookBucket { price: number; longPct: number; shortPct: number; }
interface ActiveTrade {
  id: string;
  instrument: string;
  direction: string;
  entry_price: number;
  units: number;
  r_pips: number | null;
  mfe_r: number | null;
  mae_r: number | null;
  governance_payload: any;
  status: string;
  created_at: string;
  adaptiveSL?: number;
  adaptiveTP?: number;
}

// ═══════════════════════════════════════════════════════════
// MACRO CORTEX — Top Bar
// ═══════════════════════════════════════════════════════════
const MacroCortex: React.FC<{
  painWeight: number;
  wins: number;
  losses: number;
  maxConsecL: number;
  dollarStrength: number;
  confirmedCrosses: number;
  totalCrosses: number;
  isRetailHunt: boolean;
  isBlocked: boolean;
  blockReason: string;
  isLive: boolean;
}> = ({ painWeight, wins, losses, maxConsecL, dollarStrength, confirmedCrosses, totalCrosses, isRetailHunt, isBlocked, blockReason, isLive }) => {
  const painPct = painWeight * 100;
  const isCritical = painWeight < 0.65;
  const isHurting = painWeight < 0.85;
  const painColor = isCritical ? 'hsl(var(--nexus-danger))' : isHurting ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-neon-green))';
  const adiColor = isRetailHunt ? 'hsl(var(--nexus-neon-amber))' : dollarStrength >= 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-cyan))';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Pain Memory */}
      <div className="p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: `1px solid ${isCritical ? 'hsl(var(--nexus-danger) / 0.4)' : 'hsl(var(--nexus-border))'}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} style={{ color: painColor }} />
          <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: painColor }}>PAIN MEMORY</span>
          <span className="ml-auto text-[9px] font-mono" style={{ color: 'hsl(var(--nexus-text-muted))' }}>W:{wins} L:{losses} C:{maxConsecL}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold font-display tabular-nums" style={{ color: painColor }}>
            {painPct.toFixed(0)}
          </div>
          <div className="flex-1">
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${painPct}%`, background: painColor }} />
            </div>
            <div className="flex justify-between text-[7px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
              <span>TURTLE 55</span>
              <span>FULL 100</span>
            </div>
          </div>
        </div>
        {isHurting && (
          <div className="mt-2 text-[8px] px-2 py-1 rounded" style={{ background: 'hsl(var(--nexus-danger) / 0.08)', color: 'hsl(var(--nexus-danger))' }}>
            <AlertTriangle size={9} className="inline mr-1" /> ARMOR MODE — thresholds raised
          </div>
        )}
      </div>

      {/* Global ADI */}
      <div className="p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: `1px solid ${isRetailHunt ? 'hsl(var(--nexus-neon-amber) / 0.4)' : 'hsl(var(--nexus-border))'}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} style={{ color: adiColor }} />
          <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: adiColor }}>GLOBAL ADI</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold font-display tabular-nums" style={{ color: adiColor }}>
            {(dollarStrength * 100).toFixed(0)}
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-[10px] font-bold" style={{ color: adiColor }}>
              {dollarStrength >= 0.3 ? 'USD BULL' : dollarStrength <= -0.3 ? 'USD BEAR' : 'NEUTRAL'}
            </div>
            <div className="text-[9px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
              {confirmedCrosses}/{totalCrosses} crosses confirmed
            </div>
            {isRetailHunt && (
              <div className="text-[9px] font-bold nexus-pulse" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
                ⚠ RETAIL LIQUIDITY HUNT
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Circuit Breaker */}
      <div className="p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: `1px solid ${isBlocked ? 'hsl(var(--nexus-danger) / 0.4)' : 'hsl(var(--nexus-neon-green) / 0.3)'}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} style={{ color: isBlocked ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))' }} />
          <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: isBlocked ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))' }}>
            CIRCUIT BREAKER
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
              background: isBlocked ? 'hsl(var(--nexus-danger) / 0.15)' : 'hsl(var(--nexus-neon-green) / 0.1)',
              border: `2px solid ${isBlocked ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))'}`,
            }}>
              {isBlocked ? (
                <span className="text-lg">🛑</span>
              ) : isLive ? (
                <span className="text-lg">🟢</span>
              ) : (
                <span className="text-lg">⏳</span>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: isBlocked ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))' }}>
              {isBlocked ? 'HARD HALT' : isLive ? 'HUNTING' : 'STANDBY'}
            </div>
            <div className="text-[9px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
              {isBlocked ? blockReason : isLive ? 'All systems active' : 'Awaiting invocation'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PREDATORY LIQUIDITY MATRIX — Per-tentacle order book X-ray
// ═══════════════════════════════════════════════════════════
const TentacleLiquidityCard: React.FC<{
  instrument: string;
  mid: number;
  spread: number;
  buckets: OrderBookBucket[];
  velocityRatio: number;
  elephantAction: string;
  elephantDistance: number;
  direction: 'BUY' | 'SELL' | null;
  nexusTier: string;
}> = ({ instrument, mid, buckets, spread, velocityRatio, elephantAction, elephantDistance, direction, nexusTier }) => {
  const isJPY = instrument.includes('JPY');
  const prec = isJPY ? 3 : 5;
  const pv = isJPY ? 0.01 : 0.0001;

  // Find ceiling and floor elephants
  const range = 50 * pv;
  const nearby = buckets.filter(b => Math.abs(b.price - mid) < range).sort((a, b) => b.price - a.price);
  const allPcts = nearby.flatMap(b => [b.longPct, b.shortPct]).filter(v => v > 0).sort((a, b) => a - b);
  const p80 = allPcts.length > 0 ? allPcts[Math.floor(allPcts.length * 0.80)] : 0;
  const elephantThreshold = Math.max(p80, 0.001);

  const ceiling = nearby.find(b => b.price > mid && (b.longPct >= elephantThreshold || b.shortPct >= elephantThreshold));
  const floor = nearby.find(b => b.price < mid && (b.longPct >= elephantThreshold || b.shortPct >= elephantThreshold));

  const ceilingDist = ceiling ? ((ceiling.price - mid) / pv).toFixed(1) : '—';
  const floorDist = floor ? ((mid - floor.price) / pv).toFixed(1) : '—';

  // Kill zone saturation: how much retail is clustered behind nearest wall
  const nearWall = direction === 'BUY' ? ceiling : floor;
  const killZoneSaturation = nearWall ? Math.min(Math.max(nearWall.longPct + nearWall.shortPct, 0) * 10, 100).toFixed(0) : '—';

  // Velocity color
  const velColor = velocityRatio >= 1.8 ? 'hsl(var(--nexus-neon-green))' : velocityRatio >= 1.2 ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-muted))';
  const velFlashing = velocityRatio >= 1.8;

  const tierColors: Record<string, string> = {
    'OMNI_STRIKE': 'hsl(var(--nexus-neon-green))',
    'PROBE': 'hsl(var(--nexus-neon-cyan))',
    'SOVEREIGN_ONLY': 'hsl(var(--nexus-neon-amber))',
    'BLOCKED': 'hsl(var(--nexus-danger))',
  };

  return (
    <div className="p-3 rounded-lg" style={{ background: 'hsl(var(--nexus-bg))', border: '1px solid hsl(var(--nexus-border))' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            {instrument.replace('_', '/')}
          </span>
          {direction && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
              color: direction === 'BUY' ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-amber))',
              background: direction === 'BUY' ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-neon-amber) / 0.1)',
            }}>
              {direction === 'BUY' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {direction}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            {mid.toFixed(prec)}
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{
            color: tierColors[nexusTier] || 'hsl(var(--nexus-text-muted))',
            background: `${tierColors[nexusTier] || 'hsl(var(--nexus-text-muted))'}15`,
          }}>
            {nexusTier}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {/* Ceiling */}
        <div className="p-2 rounded text-center" style={{ background: 'hsl(var(--nexus-surface))' }}>
          <div className="text-[7px] tracking-wider" style={{ color: 'hsl(var(--nexus-text-muted))' }}>🐘 CEILING</div>
          <div className="text-sm font-bold tabular-nums" style={{ color: ceiling ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-text-muted))' }}>
            {ceilingDist}
          </div>
          <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>pips</div>
        </div>

        {/* Floor */}
        <div className="p-2 rounded text-center" style={{ background: 'hsl(var(--nexus-surface))' }}>
          <div className="text-[7px] tracking-wider" style={{ color: 'hsl(var(--nexus-text-muted))' }}>🐘 FLOOR</div>
          <div className="text-sm font-bold tabular-nums" style={{ color: floor ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))' }}>
            {floorDist}
          </div>
          <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>pips</div>
        </div>

        {/* KZ Saturation */}
        <div className="p-2 rounded text-center" style={{ background: 'hsl(var(--nexus-surface))' }}>
          <div className="text-[7px] tracking-wider" style={{ color: 'hsl(var(--nexus-text-muted))' }}>⚠ KZ SAT</div>
          <div className="text-sm font-bold tabular-nums" style={{ color: Number(killZoneSaturation) >= 70 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-text-primary))' }}>
            {killZoneSaturation}%
          </div>
        </div>
      </div>

      {/* Velocity Bar */}
      <div className="flex items-center gap-2 p-2 rounded" style={{ background: 'hsl(var(--nexus-surface))' }}>
        <span className="text-[8px] tracking-wider" style={{ color: 'hsl(var(--nexus-text-muted))' }}>⚡ VELOCITY</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${Math.min(velocityRatio / 3 * 100, 100)}%`,
            background: velColor,
          }} />
        </div>
        <span className={`text-sm font-bold tabular-nums ${velFlashing ? 'nexus-pulse' : ''}`} style={{ color: velColor }}>
          {velocityRatio.toFixed(1)}x
        </span>
      </div>

      {/* Spread */}
      <div className="flex items-center justify-between mt-2 text-[9px]">
        <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>SPREAD</span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: spread <= 3 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }} />
          <span style={{ color: spread <= 3 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }}>
            {spread.toFixed(1)}p
          </span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// KILL-CHAIN TRACKER — Live trade progress with Scale-Out
// ═══════════════════════════════════════════════════════════
const KillChainCard: React.FC<{
  trade: ActiveTrade;
  mid: number;
}> = ({ trade, mid }) => {
  const isJPY = trade.instrument.includes('JPY');
  const prec = isJPY ? 3 : 5;
  const scale = isJPY ? 100 : 10000;
  const entry = trade.entry_price;
  const isLong = trade.direction === 'long';

  // Calculate live P&L
  const pnlPips = isLong ? (mid - entry) * scale : (entry - mid) * scale;

  // R calculation
  const rPips = trade.r_pips || 20;
  const currentR = pnlPips / rPips;
  const mfeR = trade.mfe_r || Math.max(currentR, 0);
  const maeR = trade.mae_r || Math.min(currentR, 0);

  // Scale-out state from governance_payload
  const gov = trade.governance_payload || {};
  const scaleOutDone = gov.scaleOutDone || false;
  const tp1FillPrice = gov.tp1FillPrice;
  const tp1Pips = gov.tp1Pips;
  const tp2Target = gov.tp2TargetPrice;

  // SL/TP
  const sl = isLong ? entry - (rPips / scale) : entry + (rPips / scale);
  const tp1 = isLong ? entry + (rPips / scale) : entry - (rPips / scale);

  // Progress toward TP1 (0-100%)
  const totalRange = Math.abs(tp1 - entry);
  const currentProgress = totalRange > 0 ? Math.min(Math.max(((isLong ? mid - entry : entry - mid) / totalRange) * 100, -50), 150) : 0;

  // Void scanner active?
  const isInVoid = currentR < -0.3;
  const voidTimerActive = gov.voidTimerStart;

  // Trade age
  const ageMs = Date.now() - new Date(trade.created_at).getTime();
  const ageMin = Math.floor(ageMs / 60000);
  const ageStr = ageMin < 60 ? `${ageMin}m` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m`;

  const dirColor = isLong ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-amber))';

  return (
    <div className="p-3 rounded-lg" style={{
      background: 'hsl(var(--nexus-bg))',
      border: `1px solid ${scaleOutDone ? 'hsl(var(--nexus-neon-green) / 0.5)' : isInVoid ? 'hsl(var(--nexus-danger) / 0.5)' : 'hsl(var(--nexus-border))'}`,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: dirColor }} />
          <span className="text-xs font-bold" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            {trade.instrument.replace('_', '/')}
          </span>
          <span className="text-[9px] font-bold" style={{ color: dirColor }}>
            {trade.direction.toUpperCase()} @ {entry.toFixed(prec)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>{ageStr}</span>
          <span className="text-xs font-bold tabular-nums" style={{
            color: pnlPips >= 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))',
          }}>
            {pnlPips >= 0 ? '+' : ''}{pnlPips.toFixed(1)}p
          </span>
        </div>
      </div>

      {/* Progress Bar: SL → Entry → TP1 → TP2 */}
      <div className="mb-2">
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-surface))' }}>
          {/* Entry marker at ~33% */}
          <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: '33%', background: 'hsl(var(--nexus-text-muted))' }} />
          {/* TP1 marker at ~66% */}
          <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: '66%', background: 'hsl(var(--nexus-neon-green) / 0.5)' }} />

          {/* Current price position */}
          <div className="absolute top-0 bottom-0 rounded-full z-20 transition-all duration-500" style={{
            left: `${Math.min(Math.max(33 + (currentProgress * 0.33), 2), 98)}%`,
            width: '4px',
            background: pnlPips >= 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))',
            boxShadow: `0 0 6px ${pnlPips >= 0 ? 'hsl(var(--nexus-neon-green) / 0.6)' : 'hsl(var(--nexus-danger) / 0.6)'}`,
          }} />

          {/* Fill to current */}
          <div className="absolute top-0 bottom-0 rounded-full transition-all duration-500" style={{
            left: pnlPips >= 0 ? '33%' : `${Math.max(33 + (currentProgress * 0.33), 2)}%`,
            width: `${Math.abs(currentProgress * 0.33)}%`,
            background: pnlPips >= 0 ? 'hsl(var(--nexus-neon-green) / 0.3)' : 'hsl(var(--nexus-danger) / 0.3)',
          }} />
        </div>
        <div className="flex justify-between text-[7px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          <span>SL ({rPips.toFixed(0)}p)</span>
          <span>ENTRY</span>
          <span>TP1 (1R)</span>
          {tp2Target && <span>TP2</span>}
        </div>
      </div>

      {/* Scale-Out Status Indicators */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* TP1 Surge Capture */}
        <div className="p-1.5 rounded text-center" style={{
          background: scaleOutDone ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-surface))',
          border: `1px solid ${scaleOutDone ? 'hsl(var(--nexus-neon-green) / 0.3)' : 'hsl(var(--nexus-border))'}`,
        }}>
          <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>TP1 SURGE</div>
          <div className="text-[10px] font-bold" style={{
            color: scaleOutDone ? 'hsl(var(--nexus-neon-green))' : currentR >= 0.8 ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-muted))',
          }}>
            {scaleOutDone ? `✅ +${tp1Pips?.toFixed(1) || '?'}p` : `${Math.min(currentR / 1.0 * 100, 100).toFixed(0)}%`}
          </div>
        </div>

        {/* Break-Even Armor */}
        <div className="p-1.5 rounded text-center" style={{
          background: scaleOutDone ? 'hsl(var(--nexus-neon-cyan) / 0.1)' : 'hsl(var(--nexus-surface))',
          border: `1px solid ${scaleOutDone ? 'hsl(var(--nexus-neon-cyan) / 0.3)' : 'hsl(var(--nexus-border))'}`,
        }}>
          <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>🛡️ ARMOR</div>
          <div className="text-[10px] font-bold" style={{
            color: scaleOutDone ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-muted))',
          }}>
            {scaleOutDone ? 'SL → BE' : 'STANDBY'}
          </div>
        </div>

        {/* Void Scanner */}
        <div className="p-1.5 rounded text-center" style={{
          background: isInVoid ? 'hsl(var(--nexus-danger) / 0.1)' : 'hsl(var(--nexus-surface))',
          border: `1px solid ${isInVoid ? 'hsl(var(--nexus-danger) / 0.3)' : 'hsl(var(--nexus-border))'}`,
        }}>
          <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>VOID SCAN</div>
          <div className={`text-[10px] font-bold ${isInVoid ? 'nexus-pulse' : ''}`} style={{
            color: isInVoid ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))',
          }}>
            {isInVoid ? '🚨 SINKING' : '✓ CLEAR'}
          </div>
        </div>
      </div>

      {/* TP2 Runner */}
      {scaleOutDone && tp2Target && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1 rounded text-[9px]" style={{
          background: 'hsl(var(--nexus-neon-green) / 0.05)',
          border: '1px solid hsl(var(--nexus-neon-green) / 0.15)',
        }}>
          <span style={{ color: 'hsl(var(--nexus-neon-green))' }}>🏃 RISK-FREE RUNNER</span>
          <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>→ TP2: {tp2Target.toFixed(prec)}</span>
          <span className="ml-auto font-bold" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
            {trade.units ? `${Math.round(trade.units / 2)}u` : '50%'}
          </span>
        </div>
      )}

      {/* Void Alert */}
      {isInVoid && !scaleOutDone && (
        <div className="mt-2 px-2 py-1 rounded text-[9px] nexus-pulse" style={{
          background: 'hsl(var(--nexus-danger) / 0.08)',
          border: '1px solid hsl(var(--nexus-danger) / 0.3)',
          color: 'hsl(var(--nexus-danger))',
        }}>
          🚨 VOID SCANNER: Price in liquidity void — {voidTimerActive ? 'Timer active...' : 'monitoring structure'}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// NEURAL TERMINAL — Raw streaming log
// ═══════════════════════════════════════════════════════════
const NeuralTerminal: React.FC<{ logs: string[]; onClear: () => void }> = ({ logs, onClear }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const colorize = (line: string) => {
    if (line.includes('✅') || line.includes('FILLED') || line.includes('SCALE-OUT')) return 'hsl(var(--nexus-neon-green))';
    if (line.includes('❌') || line.includes('REJECTED') || line.includes('Fatal') || line.includes('VOID')) return 'hsl(var(--nexus-danger))';
    if (line.includes('⚠') || line.includes('HUNT') || line.includes('BLOCKED') || line.includes('WALL')) return 'hsl(var(--nexus-neon-amber))';
    if (line.includes('🔺') || line.includes('PILLAR') || line.includes('ADI') || line.includes('OBI')) return 'hsl(var(--nexus-neon-cyan))';
    if (line.includes('🧠') || line.includes('BREATH') || line.includes('NEXUS') || line.includes('PAIN')) return 'hsl(150 80% 65%)';
    if (line.includes('🚀') || line.includes('EXECUTING')) return 'hsl(185 100% 70%)';
    if (line.includes('SOVEREIGN') || line.includes('SOV')) return 'hsl(270 60% 70%)';
    if (line.includes('[SYSTEM]')) return 'hsl(var(--nexus-neon-cyan))';
    return 'hsl(var(--nexus-text-muted))';
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))', border: '1px solid hsl(var(--nexus-border))' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid hsl(var(--nexus-border))' }}>
        <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
          NEURAL TERMINAL // RAW FEED
        </span>
        <button onClick={onClear} className="text-[10px] transition-colors hover:opacity-80" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          CLEAR
        </button>
      </div>
      <div ref={scrollRef} className="p-3 h-48 overflow-y-auto scrollbar-neural space-y-0.5 font-mono">
        {logs.map((line, i) => (
          <div key={i} className="text-[10px] leading-relaxed" style={{ color: colorize(line) }}>{line}</div>
        ))}
        <div className="nexus-pulse text-[10px]" style={{ color: 'hsl(var(--nexus-neon-green))' }}>_</div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// SOVEREIGN FLIGHT DECK — Main Page
// ═══════════════════════════════════════════════════════════
const SovereignFlightDeck = () => {
  const [pricing, setPricing] = useState<Record<string, PricingData>>({});
  const [orderBooks, setOrderBooks] = useState<Record<string, { buckets: OrderBookBucket[] }>>({});
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [cycleCount, setCycleCount] = useState(0);

  // Macro state
  const [painWeight, setPainWeight] = useState(1.0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [maxConsecL, setMaxConsecL] = useState(0);
  const [adiState, setAdiState] = useState({ dollarStrength: 0, confirmedCrosses: 0, totalCrosses: 0, isRetailHunt: false });
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  // Per-tentacle state
  const [tentacleData, setTentacleData] = useState<Record<string, {
    direction: 'BUY' | 'SELL' | null;
    velocityRatio: number;
    elephantAction: string;
    elephantDistance: number;
    nexusTier: string;
  }>>({});

  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Sovereign Flight Deck initialized',
    '[SYSTEM] CustomQuantLabs // Neuro-Matrix v3',
    '[SYSTEM] Awaiting invocation...',
  ]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const fetchPricing = useCallback(async () => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/oanda-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
      });
      const data = await res.json();
      if (data.prices) {
        const mapped: Record<string, PricingData> = {};
        for (const inst of INSTRUMENTS) {
          const display = inst.replace('_', '/');
          if (data.prices[display]) {
            const p = data.prices[display];
            const pv = inst.includes('JPY') ? 100 : 10000;
            mapped[inst] = { bid: p.bid, ask: p.ask, mid: p.mid, spread: (p.ask - p.bid) * pv };
          }
        }
        setPricing(mapped);
      }
    } catch (e) { console.error('[FLIGHT-DECK] Pricing error:', e); }
  }, [supabaseUrl, apiKey]);

  const fetchOrderBooks = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('market_liquidity_map')
        .select('currency_pair, all_buckets, current_price')
        .in('currency_pair', [...INSTRUMENTS]);
      if (data) {
        const mapped: Record<string, { buckets: OrderBookBucket[] }> = {};
        for (const row of data) {
          mapped[row.currency_pair] = { buckets: ((row as any).all_buckets || []) as OrderBookBucket[] };
        }
        setOrderBooks(mapped);
      }
    } catch { /* empty */ }
  }, []);

  const fetchActiveTrades = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, entry_price, units, r_pips, mfe_r, mae_r, governance_payload, status, created_at')
        .eq('agent_id', 'nyc-love')
        .in('status', ['filled', 'open', 'submitted'])
        .eq('environment', 'practice');
      if (data) {
        setActiveTrades(data.map(d => ({
          id: d.id,
          instrument: d.currency_pair,
          direction: d.direction,
          entry_price: d.entry_price || 0,
          units: d.units,
          r_pips: d.r_pips,
          mfe_r: d.mfe_r,
          mae_r: d.mae_r,
          governance_payload: d.governance_payload,
          status: d.status,
          created_at: d.created_at,
        })));
      }
    } catch { /* empty */ }
  }, []);

  const fetchAdi = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('sovereign_memory')
        .select('payload')
        .eq('memory_key', 'live_strength_index')
        .eq('memory_type', 'currency_strength')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (data?.payload) {
        const payload = data.payload as { strengths?: { currency: string; rank: number }[] };
        if (payload.strengths) {
          const usd = payload.strengths.find(s => s.currency === 'USD');
          if (usd) {
            const normalized = 1 - ((usd.rank - 1) / 7) * 2;
            const totalCurrencies = payload.strengths.length;
            const weakerCount = payload.strengths.filter(s => s.rank > usd.rank).length;
            setAdiState({ dollarStrength: Math.round(normalized * 100) / 100, confirmedCrosses: weakerCount, totalCrosses: totalCurrencies - 1, isRetailHunt: false });
          }
        }
      }
    } catch { /* empty */ }
  }, []);

  const runAgent = useCallback(async () => {
    setLoading(true);
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${ts}] 🚀 Invoking Neuro-Matrix v3...`]);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/nyc-love-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
      });
      const data = await res.json();
      setCycleCount(c => c + 1);

      // Parse pain
      if (data.painWeight != null) setPainWeight(data.painWeight);
      if (data.log) {
        setLogs(prev => [...prev, ...data.log.map((l: string) => `[${ts}] ${l}`)]);

        const painLine = data.log.find((l: string) => l.includes('PAIN MEMORY'));
        if (painLine) {
          const wM = painLine.match(/W=(\d+)/); const lM = painLine.match(/L=(\d+)/); const cM = painLine.match(/maxConsecL=(\d+)/);
          if (wM) setWins(parseInt(wM[1])); if (lM) setLosses(parseInt(lM[1])); if (cM) setMaxConsecL(parseInt(cM[1]));
        }

        // Parse per-tentacle
        const td: Record<string, any> = {};
        for (const inst of INSTRUMENTS) {
          const tag = `[${inst}]`;
          const sovLine = data.log.find((l: string) => l.includes(tag) && l.includes('SOVEREIGN:'));
          let dir: 'BUY' | 'SELL' | null = null;
          if (sovLine?.includes('→ BUY')) dir = 'BUY';
          else if (sovLine?.includes('→ SELL')) dir = 'SELL';

          const nexusLine = data.log.find((l: string) => l.includes(tag) && l.includes('NEXUS:'));
          let nexusTier = 'BLOCKED';
          if (nexusLine?.includes('OMNI_STRIKE')) nexusTier = 'OMNI_STRIKE';
          else if (nexusLine?.includes('PROBE')) nexusTier = 'PROBE';
          else if (nexusLine?.includes('SOVEREIGN_ONLY')) nexusTier = 'SOVEREIGN_ONLY';

          const obiLine = data.log.find((l: string) => l.includes(tag) && l.includes('OBI:'));
          let eAction = 'PATH_CLEAR', eDist = 0;
          if (obiLine) {
            for (const a of ['STRIKE_THROUGH', 'STOP_RUN_CAPTURE', 'ELEPHANT_REJECTION', 'WAIT_FOR_ABSORPTION', 'PATH_CLEAR']) {
              if (obiLine.includes(a)) { eAction = a; break; }
            }
            const dm = obiLine.match(/(\d+\.?\d*)p away/);
            if (dm) eDist = parseFloat(dm[1]);
          }

          td[inst] = { direction: dir, velocityRatio: 0, elephantAction: eAction, elephantDistance: eDist, nexusTier };
        }
        setTentacleData(td);

        // ADI from logs
        const adiLine = data.log.find((l: string) => l.includes('ADI:'));
        if (adiLine) {
          const adiMatch = adiLine.match(/ADI=(-?\d+\.?\d*)/);
          const confMatch = adiLine.match(/confirmed=(\d+)\/(\d+)/);
          if (adiMatch || confMatch) {
            setAdiState({
              dollarStrength: adiMatch ? parseFloat(adiMatch[1]) / 100 : adiState.dollarStrength,
              confirmedCrosses: confMatch ? parseInt(confMatch[1]) : adiState.confirmedCrosses,
              totalCrosses: confMatch ? parseInt(confMatch[2]) : adiState.totalCrosses,
              isRetailHunt: adiLine.includes('hunt=true'),
            });
          }
        }

        // Blocked status
        const blocked = data.reason === 'session_gate' || data.log.some((l: string) => l.includes('All tentacles blocked'));
        setIsBlocked(blocked);
        if (data.reason === 'session_gate') setBlockReason(data.detail || 'Session gate');
        else if (blocked) setBlockReason('No divergence / all blocked');
      }

      // Refresh trades
      fetchActiveTrades();
    } catch (e) {
      setLogs(prev => [...prev, `[${ts}] ❌ Error: ${(e as Error).message}`]);
    } finally {
      setLoading(false);
    }
  }, [supabaseUrl, apiKey, fetchActiveTrades]);

  // Data loops
  useEffect(() => {
    fetchPricing(); fetchOrderBooks(); fetchActiveTrades(); fetchAdi();
    const iv = setInterval(() => { fetchPricing(); fetchActiveTrades(); }, 15_000);
    const iv2 = setInterval(() => { fetchOrderBooks(); fetchAdi(); }, 60_000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, [fetchPricing, fetchOrderBooks, fetchActiveTrades, fetchAdi]);

  // Auto-mode
  useEffect(() => {
    if (!autoMode) return;
    runAgent();
    const iv = setInterval(runAgent, 5 * 60_000);
    return () => clearInterval(iv);
  }, [autoMode, runAgent]);

  return (
    <div className="min-h-screen cyber-grid-bg font-mono" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-50 px-5 py-3 flex justify-between items-center backdrop-blur-md"
        style={{ background: 'hsl(var(--nexus-bg) / 0.9)', borderBottom: '1px solid hsl(var(--nexus-border))' }}>
        <div className="flex items-center gap-3">
          <Link to="/nyc-love" className="transition-colors hover:opacity-80" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-base font-bold tracking-tight" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
            SOVEREIGN FLIGHT DECK
          </h1>
          <span className="text-[9px] px-2 py-0.5 rounded" style={{
            color: 'hsl(var(--nexus-neon-green))',
            background: 'hsl(var(--nexus-neon-green) / 0.1)',
            border: '1px solid hsl(var(--nexus-neon-green) / 0.2)',
          }}>CustomQuantLabs</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] px-2 py-1 rounded" style={{
            background: 'hsl(var(--nexus-surface))',
            border: '1px solid hsl(var(--nexus-border))',
            color: Object.keys(pricing).length > 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
          }}>
            OANDA: {Object.keys(pricing).length > 0 ? 'LIVE' : '—'}
          </span>
          <span className="text-[9px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>C:{cycleCount}</span>
          <button
            onClick={runAgent}
            disabled={loading}
            className="text-[9px] px-3 py-1.5 rounded font-bold tracking-wider transition-all"
            style={{
              background: loading ? 'hsl(var(--nexus-surface))' : 'hsl(var(--nexus-neon-cyan) / 0.15)',
              border: '1px solid hsl(var(--nexus-neon-cyan) / 0.4)',
              color: loading ? 'hsl(var(--nexus-text-muted))' : 'hsl(var(--nexus-neon-cyan))',
            }}
          >
            <Zap size={10} className="inline mr-1" />
            {loading ? 'SCANNING...' : 'INVOKE'}
          </button>
          <button
            onClick={() => setAutoMode(!autoMode)}
            className="text-[9px] px-3 py-1.5 rounded font-bold tracking-wider transition-all"
            style={{
              background: autoMode ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-surface))',
              border: `1px solid ${autoMode ? 'hsl(var(--nexus-neon-green) / 0.4)' : 'hsl(var(--nexus-border))'}`,
              color: autoMode ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
            }}
          >
            <Radio size={10} className="inline mr-1" />
            {autoMode ? 'AUTO' : 'MANUAL'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 1. MACRO CORTEX */}
        <MacroCortex
          painWeight={painWeight}
          wins={wins}
          losses={losses}
          maxConsecL={maxConsecL}
          dollarStrength={adiState.dollarStrength}
          confirmedCrosses={adiState.confirmedCrosses}
          totalCrosses={adiState.totalCrosses}
          isRetailHunt={adiState.isRetailHunt}
          isBlocked={isBlocked}
          blockReason={blockReason}
          isLive={cycleCount > 0 && !isBlocked}
        />

        {/* 2 + 3. LIQUIDITY MATRIX + KILL-CHAIN */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Predatory Liquidity Matrix */}
          <div className="rounded-lg p-4 space-y-3" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid hsl(var(--nexus-border))' }}>
              <Crosshair size={14} style={{ color: 'hsl(var(--nexus-neon-amber))' }} />
              <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
                PREDATORY LIQUIDITY MATRIX
              </span>
            </div>
            {INSTRUMENTS.map(inst => {
              const p = pricing[inst];
              const ob = orderBooks[inst];
              const td = tentacleData[inst];
              return (
                <TentacleLiquidityCard
                  key={inst}
                  instrument={inst}
                  mid={p?.mid || 0}
                  spread={p?.spread || 0}
                  buckets={ob?.buckets || []}
                  velocityRatio={td?.velocityRatio || 0}
                  elephantAction={td?.elephantAction || 'PATH_CLEAR'}
                  elephantDistance={td?.elephantDistance || 0}
                  direction={td?.direction || null}
                  nexusTier={td?.nexusTier || 'BLOCKED'}
                />
              );
            })}
          </div>

          {/* Active Kill-Chain */}
          <div className="rounded-lg p-4 space-y-3" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid hsl(var(--nexus-border))' }}>
              <Crosshair size={14} style={{ color: 'hsl(var(--nexus-neon-green))' }} />
              <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
                ACTIVE KILL-CHAIN TRACKER
              </span>
              <span className="ml-auto text-[9px] px-2 py-0.5 rounded" style={{
                color: activeTrades.length > 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
                background: activeTrades.length > 0 ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'transparent',
              }}>
                {activeTrades.length} LIVE
              </span>
            </div>
            {activeTrades.length > 0 ? (
              activeTrades.map(trade => (
                <KillChainCard
                  key={trade.id}
                  trade={trade}
                  mid={pricing[trade.instrument]?.mid || trade.entry_price}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-2xl mb-2">🎯</div>
                <div className="text-xs" style={{ color: 'hsl(var(--nexus-text-muted))' }}>NO ACTIVE POSITIONS</div>
                <div className="text-[9px] mt-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
                  Engine is scanning for high-conviction entries...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. NEURAL TERMINAL */}
        <NeuralTerminal logs={logs} onClear={() => setLogs(['[SYSTEM] Terminal cleared'])} />
      </div>
    </div>
  );
};

export default SovereignFlightDeck;
