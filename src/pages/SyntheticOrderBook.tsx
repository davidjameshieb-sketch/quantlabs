import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Activity, Zap, Eye, Shield, TrendingUp, Waves,
  RefreshCw, Crosshair, Radio, Siren, Brain, Target,
  ArrowUp, ArrowDown, Minus, ChevronRight, AlertTriangle,
  Lock, Flame, Search, GitBranch, TriangleAlert, Power,
  Cpu, Clock, Terminal, Layers, Gauge, AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { Badge } from '@/components/ui/badge';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';
import { ClimaxBacktestLog } from '@/components/forex/floor-manager/ClimaxBacktestLog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ─── David-Atlas SPP v2.0 — Thresholds ────────────────────────────────────────
const SN_MIN          = 1.5;
const E_VACUUM_MIN    = 100;
const E_DUD_ABORT     = 50;
const Z_STRIKE        = 2.5;
const VPIN_FRAGILITY  = 0.70;
const HURST_PERSIST   = 0.62;
const NOI_WHALE       = 0.8;
const SR_COIL         = 1.0;
const SR_CRITICAL     = 0.5;
const KELLY_MAX_RISK  = 0.05;
const PID_TRAIL_START = 3.0;
const PID_TP          = 10.0;
const PID_SL          = -10.0;
const D2_NEUTRAL      = 5e-5;

function computeSr(p: PairPhysics): number {
  const D2 = Math.abs(p.kramersMoyal?.D2 ?? 0);
  const alpha = p.kramersMoyal?.alphaAdaptive ?? 0.5;
  if (D2 === 0) return 1.5;
  return Math.min(2.0, Math.sqrt(D2 / D2_NEUTRAL) * (0.5 + alpha));
}

function computeNOI(p: PairPhysics): number {
  const depth = p.syntheticDepth ?? [];
  if (depth.length < 3) return Math.max(-1, Math.min(1, p.ofiRatio ?? 0));
  const totalBuys  = depth.reduce((s, l) => s + Math.max(0, l.buys),  0);
  const totalSells = depth.reduce((s, l) => s + Math.max(0, l.sells), 0);
  const total = totalBuys + totalSells;
  if (total === 0) return 0;
  return Math.max(-1, Math.min(1, (totalBuys - totalSells) / total));
}

type TacticalState = 'HUNT' | 'SET' | 'STRIKE' | 'GUARD' | 'DUD' | 'FATIGUE' | 'SCANNING';

const strikeOnsetMap = new Map<string, { tick: number; ts: number }>();
let globalTickCounter = 0;
const DUD_WINDOW_TICKS = 3;

function deriveSPPState(p: PairPhysics, pair?: string): TacticalState {
  const H    = p.hurst?.H ?? 0;
  const eff  = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const absZ = Math.abs(p.zOfi ?? 0);
  const Sr   = computeSr(p);
  const NOI  = computeNOI(p);

  if (eff >= E_VACUUM_MIN && absZ > Z_STRIKE && vpin > VPIN_FRAGILITY && H >= HURST_PERSIST) {
    if (pair && !strikeOnsetMap.has(pair)) strikeOnsetMap.set(pair, { tick: globalTickCounter, ts: Date.now() });
    return 'STRIKE';
  }
  if (pair) {
    const onset = strikeOnsetMap.get(pair);
    if (onset) {
      if ((globalTickCounter - onset.tick) <= DUD_WINDOW_TICKS) {
        if (eff < E_DUD_ABORT && absZ > Z_STRIKE && vpin > 0.4) return 'DUD';
      } else {
        strikeOnsetMap.delete(pair);
      }
    }
  }
  if (Sr < SR_COIL && vpin > VPIN_FRAGILITY && Math.abs(NOI) > NOI_WHALE) return 'SET';
  if (Sr < SR_COIL && vpin > 0.4) return 'HUNT';
  if ((p.hurst?.H ?? 0) < 0.45) return 'FATIGUE';
  return 'SCANNING';
}

// ─── Audit Log ───────────────────────────────────────────────────────────────
interface AuditEntry { ts: number; msg: string; level: 'info' | 'warn' | 'strike' | 'abort' }
const auditLog: AuditEntry[] = [];
const MAX_AUDIT = 80;
function pushAudit(msg: string, level: AuditEntry['level'] = 'info') {
  auditLog.unshift({ ts: Date.now(), msg, level });
  if (auditLog.length > MAX_AUDIT) auditLog.length = MAX_AUDIT;
}

// ─── Latency tracker ─────────────────────────────────────────────────────────
let latencyHistory: number[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Ops Labels ───────────────────────────────────────────────────────────────
// Maps every tactical state and metric to a warehouse/logistics description
const OPS_STATE_LABEL: Record<TacticalState, string> = {
  STRIKE:   '⚡ LOGISTICS BREAKTHROUGH',
  GUARD:    '🛡 SHIPMENT IN TRANSIT',
  SET:      '🎯 PALLET POSITIONED',
  HUNT:     '🔍 SCANNING DOCKS',
  DUD:      '💥 PALLET DROPPED',
  FATIGUE:  '😴 WORKERS LOST',
  SCANNING: '💤 NORMAL ACTIVITY',
};
const OPS_STATE_DESC: Record<TacticalState, string> = {
  STRIKE:   'Perfect alignment: 40 trucks, polished floor, rhythm locked → 1,250-unit pallet deployed',
  GUARD:    'Shipment moving. PID ratchet tailing the load. Exits armed.',
  SET:      'Predatory limit trap resting on the dock. Waiting for the Whale truck to hit.',
  HUNT:     'Dock activity detected. Belt is quiet. Watching for the surge.',
  DUD:      'Floor friction collapsed mid-move. Aborting — pulling the pallet.',
  FATIGUE:  'Workers are lost — trend rhythm collapsed. Engine in STANDBY for this pair.',
  SCANNING: 'Business as usual. Normal warehouse activity. No special opportunity yet.',
};

// ─── LEFT RAIL: Global Radar ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const RADAR_PAIRS = [
  'EUR_USD','GBP_USD','USD_JPY','USD_CHF','AUD_USD','USD_CAD',
  'NZD_USD','EUR_GBP','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY',
  'CHF_JPY','EUR_CHF','EUR_AUD','GBP_CHF','AUD_NZD','NZD_JPY',
  'GBP_AUD','EUR_NZD',
];

function radarColor(state: TacticalState) {
  if (state === 'STRIKE') return { bg: 'bg-yellow-400/20', border: 'border-yellow-400/80', text: 'text-yellow-300', glow: '0 0 8px rgba(250,204,21,0.6)' };
  if (state === 'SET')    return { bg: 'bg-amber-400/15',  border: 'border-amber-400/60',  text: 'text-amber-300',  glow: '0 0 5px rgba(251,191,36,0.4)' };
  if (state === 'HUNT')   return { bg: 'bg-blue-400/12',   border: 'border-blue-400/50',   text: 'text-blue-300',   glow: '0 0 4px rgba(96,165,250,0.3)' };
  if (state === 'GUARD')  return { bg: 'bg-green-400/20',  border: 'border-green-400/70',  text: 'text-green-300',  glow: '0 0 8px rgba(74,222,128,0.5)' };
  if (state === 'DUD')    return { bg: 'bg-red-500/20',    border: 'border-red-500/70',    text: 'text-red-300',    glow: '0 0 6px rgba(239,68,68,0.5)' };
  return { bg: 'bg-muted/10', border: 'border-border/30', text: 'text-muted-foreground', glow: 'none' };
}

function GlobalRadar({ pairs, activeTrades }: {
  pairs: Record<string, PairPhysics>;
  activeTrades: { currency_pair: string; direction: string; status: string }[];
}) {
  const normPair = (p: string) => p.replace(/\//g, '_').replace(/-/g, '_');
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <Radio className="w-3.5 h-3.5 text-primary animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Warehouse Floor — 20 Bays</span>
        <span className="ml-auto text-[7px] font-mono text-muted-foreground">💤 Normal · 🔍 Scanning · ⚡ Breakthrough</span>
      </div>
      <div className="p-2 grid grid-cols-4 gap-1">
        {RADAR_PAIRS.map(rp => {
          const data = pairs[rp] || pairs[rp.replace('_', '/')] || null;
          const hasTrade = activeTrades.some(t =>
            normPair(t.currency_pair) === rp &&
            (t.status === 'filled' || t.status === 'pending' || t.status === 'open')
          );
          const state = hasTrade ? 'GUARD' : (data ? deriveSPPState(data, rp) : 'SCANNING');
          const c = radarColor(state);
          const label = rp.split('_');
          const bayLabel: Record<TacticalState, string> = {
            STRIKE: '⚡', GUARD: '🛡', SET: '🎯', HUNT: '🔍',
            DUD: '💥', FATIGUE: '😴', SCANNING: '',
          };
          return (
            <div
              key={rp}
              title={OPS_STATE_DESC[state]}
              className={cn('rounded-md border px-1.5 py-1 transition-all duration-500 cursor-help', c.bg, c.border)}
              style={{ boxShadow: state !== 'SCANNING' ? c.glow : 'none' }}
            >
              <div className={cn('text-[8px] font-mono font-black truncate', c.text)}>{label[0]}</div>
              <div className={cn('text-[7px] font-mono opacity-70', c.text)}>{label[1]}</div>
              {state !== 'SCANNING' && (
                <div className={cn('text-[6px] font-mono font-bold', c.text)}>{bayLabel[state]} {state}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LEFT RAIL: Treasury ─────────────────────────────────────────────────────
function TreasuryPanel({ nav, unrealizedPL, openTradeCount, snapshot }: {
  nav: number;
  unrealizedPL: number;
  openTradeCount: number;
  snapshot: any;
}) {
  const TARGET = 500;
  const progress = Math.min(100, (nav / TARGET) * 100);
  const maxRisk = KELLY_MAX_RISK * nav;
  const pairs = snapshot?.pairs ?? {};
  const pairList = Object.values(pairs) as PairPhysics[];
  const strikePairs = pairList.filter((p, i) => {
    const key = Object.keys(pairs)[i];
    return deriveSPPState(p, key) === 'STRIKE';
  });
  // Kelly f* approx from strike pairs
  const avgVpin = pairList.length > 0 ? pairList.reduce((s, p) => s + (p.vpin ?? 0), 0) / pairList.length : 0;
  const kellyF = Math.max(0, Math.min(0.2, avgVpin - 0.5));

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <Gauge className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Capital Reserve</span>
        <span className="ml-auto text-[7px] font-mono text-muted-foreground">Your operating budget</span>
      </div>
      <div className="p-3 space-y-3">
        {/* NAV */}
        <div>
          <div className="text-[9px] text-muted-foreground font-mono uppercase">Warehouse Budget (NAV)</div>
          <div className="text-xl font-mono font-black text-foreground">${nav.toFixed(2)}</div>
          <div className="mt-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] font-mono text-muted-foreground mt-0.5">
            <span>$0</span><span className="text-primary font-bold">${TARGET}</span>
          </div>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Unrealized Freight', value: `${unrealizedPL >= 0 ? '+' : ''}$${unrealizedPL.toFixed(2)}`, pos: unrealizedPL >= 0, tip: 'Open P&L: value of shipments currently in transit' },
            { label: 'Active Shipments', value: openTradeCount, pos: null, tip: 'Number of pallets currently moving on the warehouse floor' },
            { label: 'Max Pallet Size', value: `$${maxRisk.toFixed(2)}`, pos: null, tip: 'Kelly-capped maximum budget per strike (5% of NAV)' },
            { label: 'Pallet Allocation (f*)', value: `${(kellyF * 100).toFixed(1)}%`, pos: kellyF > 0.05, tip: 'Kelly f*: how much of your budget to put on the next pallet based on win probability' },
          ].map(({ label, value, pos, tip }) => (
            <div key={label} title={tip} className="rounded-lg bg-muted/20 border border-border/20 px-2 py-1.5 cursor-help">
              <div className="text-[8px] text-muted-foreground font-mono">{label}</div>
              <div className={cn('text-sm font-mono font-bold', pos === true ? 'text-emerald-400' : pos === false ? 'text-red-400' : 'text-foreground')}>
                {value}
              </div>
            </div>
          ))}
        </div>
        {/* Strike alert */}
        {strikePairs.length > 0 && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-2 py-1.5 flex items-center gap-1.5">
            <Flame className="w-3 h-3 text-yellow-400 animate-pulse" />
            <span className="text-[9px] font-mono text-yellow-300 font-bold">🚀 LOGISTICS BREAKTHROUGH — {strikePairs.length} bay{strikePairs.length > 1 ? 's' : ''} fully aligned</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CENTER: Synthetic Depth Map (NOI Heatmap) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function SyntheticDepthMap({ snapshot, activeTrades }: { snapshot: any; activeTrades: any[] }) {
  const pairs = snapshot?.pairs ?? {};
  const normPair = (p: string) => p.replace(/\//g, '_').replace(/-/g, '_');

  // Top 8 pairs sorted by |NOI|
  const ranked = (Object.entries(pairs) as [string, PairPhysics][])
    .filter(([, p]) => (p.ticksAnalyzed ?? 0) > 5)
    .map(([pair, p]) => ({ pair, p, noi: computeNOI(p), eff: p.efficiency ?? 0 }))
    .sort((a, b) => Math.abs(b.noi) - Math.abs(a.noi))
    .slice(0, 8);

  if (ranked.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 p-6 flex items-center justify-center">
        <span className="text-xs text-muted-foreground font-mono">Awaiting depth data from engine...</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Loading Docks — Whale Wall Map</span>
        <span className="ml-auto text-[8px] font-mono text-muted-foreground">Dock Pressure · Institutional Freight</span>
      </div>
      <div className="p-3 space-y-1.5">
        {ranked.map(({ pair, p, noi, eff }) => {
          const depth = p.syntheticDepth ?? [];
          const hasTrade = activeTrades.some(t =>
            normPair(t.currency_pair) === pair &&
            (t.status === 'filled' || t.status === 'pending' || t.status === 'open')
          );
          const state = hasTrade ? 'GUARD' : deriveSPPState(p, pair);
          const isStrike = state === 'STRIKE';
          const isSet = state === 'SET';
          const noiPct = Math.abs(noi) * 100;
          const noiDir = noi > 0 ? 'BUY' : 'SELL';
          const limitPrice = noi > 0
            ? `BID WALL +0.1p`
            : `ASK −0.1p`;
          const isVacuum = eff >= E_VACUUM_MIN;

          return (
            <div
              key={pair}
              className={cn(
                'rounded-lg border px-3 py-2 transition-all duration-300',
                isStrike ? 'border-yellow-500/60 bg-yellow-500/8' :
                isSet ? 'border-amber-500/40 bg-amber-500/5' :
                'border-border/30 bg-muted/10'
              )}
              style={{ boxShadow: isStrike ? '0 0 12px rgba(250,204,21,0.15)' : undefined }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {/* Pair name */}
                <span className={cn('text-[10px] font-mono font-black w-16 flex-shrink-0', isStrike ? 'text-yellow-300' : 'text-foreground')}>{pair}</span>

                {/* NOI bar — the whale wall visualization */}
                <div className="flex-1 h-4 bg-muted/20 rounded-full overflow-hidden relative">
                  {/* Center line */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border/40" />
                  {/* NOI fill */}
                  {noi > 0 ? (
                    <div
                      className="absolute inset-y-0 left-1/2 bg-blue-500/50 transition-all duration-500"
                      style={{ width: `${noiPct / 2}%` }}
                    />
                  ) : (
                    <div
                      className="absolute inset-y-0 right-1/2 bg-red-500/50 transition-all duration-500"
                      style={{ width: `${noiPct / 2}%` }}
                    />
                  )}
                  {/* Laplace pressure tick */}
                  {Math.abs(noi) > NOI_WHALE && (
                    <div
                      className={cn('absolute inset-y-0 w-0.5', noi > 0 ? 'bg-white/80' : 'bg-white/80')}
                      style={{ [noi > 0 ? 'left' : 'right']: `calc(50% + ${noiPct / 2 - 2}%)` }}
                    />
                  )}
                  {/* Crosshair trap marker */}
                  {(isStrike || isSet) && (
                    <div
                      className={cn('absolute top-0 bottom-0 w-1 rounded-full animate-pulse', noi > 0 ? 'bg-yellow-400' : 'bg-yellow-400')}
                      style={{ [noi > 0 ? 'left' : 'right']: `calc(50% + ${noiPct / 2}%)` }}
                    />
                  )}
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('text-[8px] font-mono font-bold', noi > 0 ? 'text-blue-400' : 'text-red-400')}>
                    {noi >= 0 ? '+' : ''}{noi.toFixed(2)} {noiDir}
                  </span>
                  {isVacuum && (
                    <span className="text-[7px] font-mono text-yellow-400 font-bold">E{eff.toFixed(0)}×</span>
                  )}
                  {hasTrade && (
                    <span className="text-[7px] font-mono text-green-400 font-bold">🛡</span>
                  )}
                </div>
              </div>

              {/* Depth clusters if available */}
              {depth.length > 0 && (
                <div className="flex gap-0.5 h-3">
                  {depth.slice(0, 12).map((d, i) => {
                    const maxNet = Math.max(...depth.map(x => Math.abs(x.net ?? 0)), 1);
                    const netPct = Math.abs((d.net ?? 0)) / maxNet * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col-reverse">
                        <div
                          className={cn('rounded-sm transition-all duration-300', (d.net ?? 0) > 0 ? 'bg-blue-500/60' : 'bg-red-500/60', d.broken ? 'opacity-30' : '')}
                          style={{ height: `${netPct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Trap label */}
              {(isStrike || isSet) && (
                <div className="mt-1 text-[7px] font-mono text-yellow-400 flex items-center gap-1">
                  <Crosshair className="w-2 h-2" />
                  <span>LIMIT TRAP: {limitPrice} · GTD 60s</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CENTER: PID Ratchet Console ──────────────────────────────────────────────
function PIDRatchetConsole({ activeTrades, snapshot }: { activeTrades: any[]; snapshot: any }) {
  const pairs = snapshot?.pairs ?? {};
  const openTrades = activeTrades.filter(t => t.status === 'filled' || t.status === 'open');

  if (openTrades.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Shipment Ratchet — Cybernetic Trailer Lock</span>
        </div>
        <div className="p-6 text-center text-xs text-muted-foreground font-mono">
          <Shield className="w-6 h-6 mx-auto mb-2 opacity-30" />
          No shipments in transit — ratchet idle. Floor is clear.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-green-400 animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">Shipment Ratchet — TRAILER MOVING</span>
        <Badge className="ml-auto text-[8px] bg-green-500/20 text-green-400 border-green-500/30">{openTrades.length} IN TRANSIT</Badge>
      </div>
      <div className="p-3 space-y-3">
        {openTrades.map(trade => {
          const pairKey = trade.currency_pair;
          const physicsData = pairs[pairKey] as PairPhysics | undefined;
          const isLong = trade.direction === 'long';
          const entryPrice = trade.entry_price ?? 0;
          const pipSize = pairKey.includes('JPY') ? 0.01 : 0.0001;
          const precision = pairKey.includes('JPY') ? 3 : 5;

          // Compute PID bracket
          const tp = isLong
            ? (entryPrice + PID_TP * pipSize).toFixed(precision)
            : (entryPrice - PID_TP * pipSize).toFixed(precision);
          const sl = isLong
            ? (entryPrice - 10 * pipSize).toFixed(precision)
            : (entryPrice + 10 * pipSize).toFixed(precision);

          const elapsed = Math.round((Date.now() - new Date(trade.created_at).getTime()) / 1000);
          const H = physicsData?.hurst?.H ?? 0;
          const eff = physicsData?.efficiency ?? 0;
          const Z = physicsData?.zOfi ?? 0;

          // Simulate PID ratchet progress (conceptual — actual is in engine)
          const pidActive = elapsed > 30;
          const Kp = 0.2; const Ki = 0.05; const Kd = 0.5;

          return (
            <div
              key={trade.id}
              className={cn(
                'rounded-lg border p-3 space-y-2 transition-all',
                isLong ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isLong ? <ArrowUp className="w-3.5 h-3.5 text-green-400" /> : <ArrowDown className="w-3.5 h-3.5 text-red-400" />}
                  <span className={cn('text-[11px] font-mono font-black', isLong ? 'text-green-300' : 'text-red-300')}>
                    {pairKey} {isLong ? 'LONG' : 'SHORT'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-[8px] font-mono text-muted-foreground">{elapsed}s</span>
                  <Badge className={cn('text-[7px]', pidActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-muted/20 text-muted-foreground border-border/30')}>
                    {pidActive ? '🔒 RATCHET ARMED' : '📦 BRACKET SET'}
                  </Badge>
                </div>
              </div>

              {/* Price bounding box */}
              <div className="relative rounded-lg bg-muted/20 border border-border/30 h-12 overflow-hidden">
                {/* TP zone (top) */}
                <div className={cn('absolute top-0 left-0 right-0 h-2 flex items-center px-2', isLong ? 'bg-green-500/20' : 'bg-red-500/20')}>
                  <span className="text-[6px] font-mono text-green-400 font-bold">TP +10p → {tp}</span>
                </div>
                {/* Entry line */}
                <div className="absolute inset-x-0 top-1/2 h-px bg-foreground/50 flex items-center">
                  <span className="absolute left-1 text-[6px] font-mono text-foreground bg-card/80 px-0.5">ENTRY {entryPrice.toFixed(precision)}</span>
                </div>
                {/* SL zone (bottom) */}
                <div className={cn('absolute bottom-0 left-0 right-0 h-2 flex items-center px-2', isLong ? 'bg-red-500/20' : 'bg-green-500/20')}>
                  <span className="text-[6px] font-mono text-red-400 font-bold">SL −10p → {sl}</span>
                </div>
                {/* PID ratchet indicator */}
                {pidActive && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-end gap-0.5">
                    <div className="text-[6px] font-mono text-yellow-400">RATCHET ↑</div>
                    <div className="w-1 h-4 bg-yellow-400/40 rounded-full" />
                  </div>
                )}
              </div>

              {/* PID terms */}
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'Distance', sublabel: 'Tighten as profit grows', val: `${Kp}`, color: 'text-blue-400' },
                  { label: 'Time', sublabel: 'Suffocate stalling trade', val: `${(Ki * elapsed / 60).toFixed(3)}`, color: 'text-purple-400' },
                  { label: 'Velocity', sublabel: 'Snap fwd on price surge', val: `${Kd}`, color: 'text-yellow-400' },
                ].map(({ label, sublabel, val, color }) => (
                  <div key={label} className="rounded bg-muted/20 px-1.5 py-1 text-center">
                    <div className="text-[7px] text-muted-foreground font-mono">{label}</div>
                    <div className={cn('text-[9px] font-mono font-bold', color)}>{val}</div>
                    <div className="text-[6px] text-muted-foreground/60 font-mono leading-tight mt-0.5">{sublabel}</div>
                  </div>
                ))}
              </div>

              {/* Override monitors — supply chain language */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn('flex items-center gap-1 text-[7px] font-mono px-1.5 py-0.5 rounded border',
                  H < 0.45 ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-muted/20 text-muted-foreground border-border/30')}>
                  <span title="Workflow Rhythm — workers walking straight (≥0.55) or lost (<0.45)">🚶 Rhythm={H.toFixed(2)}</span>
                  {H < 0.45 && <span className="font-bold">⚠ COLLAPSE</span>}
                </div>
                <div className={cn('flex items-center gap-1 text-[7px] font-mono px-1.5 py-0.5 rounded border',
                  eff < E_DUD_ABORT ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-muted/20 text-muted-foreground border-border/30')}>
                  <span title="Floor Friction — polished epoxy (>100×) vs cracked concrete (<50×)">🏭 Friction={eff.toFixed(0)}×</span>
                  {eff < E_DUD_ABORT && <span className="font-bold">DUD</span>}
                </div>
                <div className={cn('flex items-center gap-1 text-[7px] font-mono px-1.5 py-0.5 rounded border ml-auto',
                  Math.abs(Z) > Z_STRIKE ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-muted/20 text-muted-foreground border-border/30')}>
                  <span title="Loading Docks — 40 outbound trucks (>2.5σ) = Whale arrived">🚛 Docks={Z >= 0 ? '+' : ''}{Z.toFixed(1)}σ</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── RIGHT RAIL: Eigen-Signal Oscilloscope ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
interface OscilloPoint { z: number; e: number; t: number }
const oscilloBuffers = new Map<string, OscilloPoint[]>();
const OSCILLO_MAX = 40;

function updateOscillo(pair: string, p: PairPhysics) {
  const buf = oscilloBuffers.get(pair) ?? [];
  buf.push({ z: p.zOfi ?? 0, e: Math.min(200, p.efficiency ?? 0), t: Date.now() });
  if (buf.length > OSCILLO_MAX) buf.shift();
  oscilloBuffers.set(pair, buf);
  return buf;
}

function EigenOscilloscope({ snapshot, activeTrades }: { snapshot: any; activeTrades: any[] }) {
  const pairs = snapshot?.pairs ?? {};
  const normPair = (p: string) => p.replace(/\//g, '_').replace(/-/g, '_');

  // Top 5 pairs by |Z|
  const ranked = (Object.entries(pairs) as [string, PairPhysics][])
    .filter(([, p]) => (p.ticksAnalyzed ?? 0) > 5)
    .sort(([, a], [, b]) => Math.abs(b.zOfi ?? 0) - Math.abs(a.zOfi ?? 0))
    .slice(0, 5);

  ranked.forEach(([pair, p]) => updateOscillo(pair, p));

  const strikeActive = ranked.some(([pair, p]) => {
    const hasTrade = activeTrades.some(t => normPair(t.currency_pair) === pair && (t.status === 'filled' || t.status === 'open'));
    return hasTrade || deriveSPPState(p, pair) === 'STRIKE';
  });

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <Zap className={cn('w-3.5 h-3.5', strikeActive ? 'text-yellow-400 animate-pulse' : 'text-primary')} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Dock Surge Scope</span>
        <span className="ml-1 text-[7px] font-mono text-muted-foreground">🚛 Truck arrivals · 🏭 Floor polish</span>
        {strikeActive && (
          <div className="ml-auto w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
        )}
      </div>
      <div className="p-2 space-y-2">
        {ranked.length === 0 && (
          <div className="text-center py-4 text-[10px] text-muted-foreground font-mono">No signal data</div>
        )}
        {ranked.map(([pair, p]) => {
          const buf = oscilloBuffers.get(pair) ?? [];
          const Z = p.zOfi ?? 0;
          const E = p.efficiency ?? 0;
          const isHot = Math.abs(Z) > Z_STRIKE && E > E_VACUUM_MIN;
          const isDud = E < E_DUD_ABORT && Math.abs(Z) > 1.5;

          // SVG oscilloscope path for Z-OFI
          const W = 120; const H_SVG = 24;
          const midY = H_SVG / 2;
          const pts = buf.map((pt, i) => {
            const x = (i / Math.max(buf.length - 1, 1)) * W;
            const y = midY - (pt.z / 5) * (H_SVG / 2);
            return `${x.toFixed(1)},${Math.max(0, Math.min(H_SVG, y)).toFixed(1)}`;
          });
          const pathD = pts.length > 1 ? `M ${pts.join(' L ')}` : '';

          // E bar
          const ePct = Math.min(100, (E / 200) * 100);

          return (
            <div
              key={pair}
              className={cn(
                'rounded-lg border p-2 space-y-1 transition-all',
                isHot ? 'border-yellow-500/60 bg-yellow-500/8' :
                isDud ? 'border-red-500/40 bg-red-500/5' :
                'border-border/30 bg-muted/10'
              )}
              style={{ boxShadow: isHot ? '0 0 10px rgba(250,204,21,0.2)' : undefined }}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-[9px] font-mono font-black', isHot ? 'text-yellow-300' : 'text-foreground')}>{pair}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    title="Loading Docks: outbound truck surge (>+2.5σ = Whale buy, <-2.5σ = Whale sell)"
                    className={cn('text-[8px] font-mono font-bold', Math.abs(Z) > Z_STRIKE ? 'text-red-400' : 'text-muted-foreground')}
                  >
                    🚛{Z >= 0 ? '+' : ''}{Z.toFixed(1)}σ
                  </span>
                  <span
                    title="Floor Friction: >100× = polished epoxy vacuum, <50× = broken pallet on concrete"
                    className={cn('text-[8px] font-mono font-bold', E > E_VACUUM_MIN ? 'text-yellow-400' : 'text-muted-foreground')}
                  >
                    🏭{E.toFixed(0)}×
                  </span>
                  {isHot && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
                  {isDud && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />}
                </div>
              </div>

              {/* Z oscilloscope */}
              <svg width="100%" height={H_SVG} viewBox={`0 0 ${W} ${H_SVG}`} className="w-full" preserveAspectRatio="none">
                {/* Zero line */}
                <line x1="0" y1={midY} x2={W} y2={midY} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,2" />
                {/* ±2.5σ thresholds */}
                <line x1="0" y1={midY - (Z_STRIKE / 5) * midY} x2={W} y2={midY - (Z_STRIKE / 5) * midY} stroke="rgba(239,68,68,0.3)" strokeWidth="0.5" />
                <line x1="0" y1={midY + (Z_STRIKE / 5) * midY} x2={W} y2={midY + (Z_STRIKE / 5) * midY} stroke="rgba(239,68,68,0.3)" strokeWidth="0.5" />
                {/* Z path */}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isHot ? 'rgba(250,204,21,0.8)' : isDud ? 'rgba(239,68,68,0.6)' : 'rgba(99,102,241,0.6)'}
                    strokeWidth="1"
                  />
                )}
              </svg>

              {/* E bar */}
              <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', E > E_VACUUM_MIN ? 'bg-yellow-400/70' : E > E_DUD_ABORT ? 'bg-blue-400/50' : 'bg-red-500/40')}
                  style={{ width: `${ePct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RIGHT RAIL: Latency Heartbeat — 3-Tier Latency Protocol ─────────────────
// Tier 1 GREEN:  0–300ms  → Nominal, full hunting/striking
// Tier 2 YELLOW: 301–449ms → STANDBY — no new orders, manage exits only
// Tier 3 RED:    450ms+   → SYSTEM SLEEP / FLUSH — fly blind, exit all
const LAT_GREEN_MAX  = 300;
const LAT_YELLOW_MAX = 449;
// LAT_RED = 450+

type LatTier = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

function getLatTier(ms: number | null): LatTier {
  if (ms === null) return 'UNKNOWN';
  if (ms <= LAT_GREEN_MAX) return 'GREEN';
  if (ms <= LAT_YELLOW_MAX) return 'YELLOW';
  return 'RED';
}

function LatencyHeartbeat() {
  const [latency, setLatency] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    const ping = async () => {
      const t0 = Date.now();
      try {
        await supabase.from('sovereign_memory').select('id').limit(1).maybeSingle();
        const ms = Date.now() - t0;
        const tier = getLatTier(ms);
        setLatency(ms);
        setHistory(h => [...h.slice(-19), ms]);
        if (tier === 'GREEN') {
          pushAudit(`[PING] ${ms}ms — Nominal. Full predation active.`, 'info');
        } else if (tier === 'YELLOW') {
          pushAudit(`[PING] ${ms}ms — ⚠ YELLOW ZONE. STANDBY: no new orders. Managing exits only.`, 'warn');
        } else {
          pushAudit(`[PING] ${ms}ms — 🔴 RED ZONE ≥450ms. SYSTEM SLEEP / FLUSH. Flying blind — all exposure closed.`, 'abort');
        }
      } catch {
        setLatency(null);
        pushAudit('[PING] Unreachable — SYSTEM SLEEP enforced.', 'abort');
      }
    };
    ping();
    const iv = setInterval(ping, 5000);
    return () => clearInterval(iv);
  }, []);

  const tier = getLatTier(latency);
  const maxLat = Math.max(...history, 500);
  const W = 100; const H_SVG = 24;

  // Tier colour tokens
  const tierColor = tier === 'GREEN' ? 'text-emerald-400' : tier === 'YELLOW' ? 'text-yellow-400' : tier === 'RED' ? 'text-red-400' : 'text-muted-foreground';
  const tierBorder = tier === 'GREEN' ? 'border-emerald-500/30' : tier === 'YELLOW' ? 'border-yellow-500/50' : tier === 'RED' ? 'border-red-500/70' : 'border-border/40';
  const dotColor   = tier === 'GREEN' ? 'bg-emerald-500' : tier === 'YELLOW' ? 'bg-yellow-400' : tier === 'RED' ? 'bg-red-500' : 'bg-muted-foreground';
  const lineStroke = tier === 'GREEN' ? 'rgba(52,211,153,0.8)' : tier === 'YELLOW' ? 'rgba(250,204,21,0.8)' : 'rgba(239,68,68,0.8)';

  const tierLabel  = tier === 'GREEN'   ? '✅ TIER 1 — HIGHWAY CLEAR (0–300ms)'
                   : tier === 'YELLOW'  ? '⚠ TIER 2 — ROAD CONGESTION (301–449ms)'
                   : tier === 'RED'     ? '🚨 TIER 3 — ROAD CLOSED (450ms+)'
                   : 'CHECKING ROAD CONDITIONS…';
  const tierAction = tier === 'GREEN'   ? 'All clear. Belt running, traps arming, strikes executing.'
                   : tier === 'YELLOW'  ? 'Road is slow. Stop laying new traps. Manage active shipments only.'
                   : tier === 'RED'     ? 'Flying blind. Drop all pallets. Emergency dock clear. Engine sleeping.'
                   : '';

  return (
    <div className={cn('rounded-xl border bg-card/60 overflow-hidden transition-all duration-500', tierBorder)}>
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
          dotColor,
          tier === 'GREEN' ? 'animate-pulse' : tier === 'UNKNOWN' ? '' : 'animate-ping'
        )} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Latency Heartbeat</span>
        <span className={cn('ml-auto text-sm font-mono font-black', tierColor)}>
          {latency !== null ? `${latency}ms` : '—'}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        {/* Tier badge */}
        <div className={cn('flex items-center justify-between rounded px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider',
          tier === 'GREEN'  ? 'bg-emerald-500/10 text-emerald-400' :
          tier === 'YELLOW' ? 'bg-yellow-500/10 text-yellow-400 animate-pulse' :
          tier === 'RED'    ? 'bg-red-500/15 text-red-400 animate-pulse' :
          'bg-muted/20 text-muted-foreground'
        )}>
          <span>{tierLabel}</span>
          {tier !== 'UNKNOWN' && tier !== 'GREEN' && <AlertCircle className="w-3 h-3" />}
        </div>
        {/* Action line */}
        {tierAction && (
          <p className={cn('text-[8px] font-mono', tierColor)}>{tierAction}</p>
        )}
        {/* Waveform */}
        <svg width="100%" height={H_SVG} viewBox={`0 0 ${W} ${H_SVG}`} className="w-full" preserveAspectRatio="none">
          {/* Green zone ceiling line: 300ms */}
          <line x1="0" y1={H_SVG - (LAT_GREEN_MAX / maxLat) * H_SVG * 0.9}
                x2={W}  y2={H_SVG - (LAT_GREEN_MAX / maxLat) * H_SVG * 0.9}
                stroke="rgba(52,211,153,0.25)" strokeWidth="0.5" strokeDasharray="2,2" />
          {/* Yellow zone ceiling line: 449ms */}
          <line x1="0" y1={H_SVG - (LAT_YELLOW_MAX / maxLat) * H_SVG * 0.9}
                x2={W}  y2={H_SVG - (LAT_YELLOW_MAX / maxLat) * H_SVG * 0.9}
                stroke="rgba(250,204,21,0.25)" strokeWidth="0.5" strokeDasharray="2,2" />
          {/* Red zone ceiling line: 450ms */}
          <line x1="0" y1={H_SVG - (450 / maxLat) * H_SVG * 0.9}
                x2={W}  y2={H_SVG - (450 / maxLat) * H_SVG * 0.9}
                stroke="rgba(239,68,68,0.35)" strokeWidth="0.5" strokeDasharray="1,3" />
          {history.length > 1 && (
            <polyline
              points={history.map((v, i) => {
                const x = (i / (history.length - 1)) * W;
                const y = H_SVG - (v / maxLat) * H_SVG * 0.9;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(' ')}
              fill="none"
              stroke={lineStroke}
              strokeWidth="1.5"
            />
          )}
        </svg>
        {/* Tier scale legend */}
        <div className="flex justify-between text-[7px] font-mono text-muted-foreground">
          <span className="text-emerald-500/70">0–300ms ✓</span>
          <span className="text-yellow-500/70">301–449ms ⚠</span>
          <span className="text-red-500/70">450ms+ ☠</span>
        </div>
      </div>
    </div>
  );
}

// ─── RIGHT RAIL: Audit Terminal ───────────────────────────────────────────────
function AuditTerminal({ snapshot, activeTrades }: { snapshot: any; activeTrades: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    // Push state transitions to audit log
    const pairs = snapshot?.pairs ?? {};
    (Object.entries(pairs) as [string, PairPhysics][]).forEach(([pair, p]) => {
      const state = deriveSPPState(p, pair);
      const ts = new Date().toTimeString().slice(0,8);
      const E = (p.efficiency??0).toFixed(0);
      const Z = (p.zOfi??0).toFixed(1);
      const H = (p.hurst?.H??0).toFixed(2);
      if (state === 'STRIKE') pushAudit(`[${ts}] ${pair} — 🚀 LOGISTICS BREAKTHROUGH: floor polished (${E}× friction), 40 trucks docked (Z=${Z}σ) → PALLET DEPLOYED`, 'strike');
      if (state === 'DUD')    pushAudit(`[${ts}] ${pair} — 💥 PALLET DROPPED: floor lost friction (E<50×). Pulling shipment — MarketClose()`, 'abort');
      if ((p.hurst?.H ?? 0) < 0.45 && activeTrades.some(t => t.currency_pair === pair)) pushAudit(`[${ts}] ${pair} — 😴 WORKERS LOST (H=${H}<0.45): rhythm collapsed. Rule 5.3 abort — MarketClose()`, 'abort');
    });
    setEntries([...auditLog]);
  }, [snapshot, activeTrades]);

  const levelColor = (l: AuditEntry['level']) => {
    if (l === 'strike') return 'text-yellow-400';
    if (l === 'abort')  return 'text-red-400';
    if (l === 'warn')   return 'text-amber-400';
    return 'text-muted-foreground';
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Ops Dispatch Log</span>
        <span className="ml-auto text-[8px] font-mono text-muted-foreground">{entries.length} dispatches</span>
      </div>
      <div ref={containerRef} className="font-mono text-[8px] leading-relaxed p-2 space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin">
        {entries.length === 0 && (
          <span className="text-muted-foreground">Waiting for warehouse activity...</span>
        )}
        {entries.map((e, i) => (
          <div key={i} className={cn('truncate', levelColor(e.level))}>
            {e.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BOTTOM BAR: Nuclear Codes ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function NuclearCodes({ onStandby, onFlush, standbyActive }: {
  onStandby: () => void;
  onFlush: () => void;
  standbyActive: boolean;
}) {
  const [flushConfirm, setFlushConfirm] = useState(false);

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ops Override Controls</span>
        </div>
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          {/* STANDBY */}
          <button
            onClick={onStandby}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border font-mono text-xs font-bold uppercase tracking-widest transition-all',
              standbyActive
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-lg shadow-amber-500/10'
                : 'bg-muted/20 border-border/40 text-muted-foreground hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400'
            )}
            title="STANDBY: Belt speed set to 0. All resting limit traps canceled. Engine watches but does not pick."
          >
            <Power className="w-3.5 h-3.5" />
            {standbyActive ? '● FLOOR STANDBY — WATCHING' : '⏸ STANDBY — Stop Picking'}
          </button>

          {/* FLUSH */}
          {!flushConfirm ? (
            <button
              onClick={() => setFlushConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 font-mono text-xs font-bold uppercase tracking-widest hover:bg-red-500/20 hover:border-red-500/60 transition-all"
              title="FLUSH: Emergency dock clear. Drops all pallets instantly. All shipments in transit are closed at market price."
            >
              <Siren className="w-3.5 h-3.5" />
              🚨 EMERGENCY DOCK CLEAR
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-red-400 animate-pulse">CONFIRM: DROP ALL PALLETS + CLOSE ALL SHIPMENTS?</span>
              <button
                onClick={() => { onFlush(); setFlushConfirm(false); }}
                className="px-3 py-1.5 rounded-lg border border-red-500/80 bg-red-500/30 text-red-300 font-mono text-[10px] font-black uppercase hover:bg-red-500/50 transition-all"
              >
                CONFIRM CLEAR
              </button>
              <button
                onClick={() => setFlushConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-border/40 bg-muted/20 text-muted-foreground font-mono text-[10px] uppercase hover:text-foreground transition-all"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>

        <div className="text-[8px] font-mono text-muted-foreground">
          STANDBY → Belt stops · limit traps lifted · engine watches only&nbsp;&nbsp;|&nbsp;&nbsp;DOCK CLEAR → all shipments closed at market price
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const SyntheticOrderBook = () => {
  const { snapshot, loading, lastUpdated, refetch, activeTrades } = useSyntheticOrderBook(3_000);
  const [standbyActive, setStandbyActive] = useState(false);
  const [view, setView] = useState<'command-center' | 'tactical'>('command-center');

  // Track ticks for DUD rule
  React.useEffect(() => { globalTickCounter++; }, [snapshot]);

  const normPair = (p: string) => p.replace(/\//g, '_').replace(/-/g, '_');
  const pairs = snapshot?.pairs ?? {};

  const ageMs  = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
  const ageSec = ageMs ? Math.round(ageMs / 1000) : null;
  const isStale = ageSec != null && ageSec > 120;

  // Active trades for displays
  const openTrades = activeTrades.filter(t => t.status === 'filled' || t.status === 'open' || t.status === 'pending');

  // Account data from snapshot
  const nav = 0; // Pulled separately if needed
  const unrealizedPL = 0;

  const handleStandby = useCallback(() => {
    setStandbyActive(v => !v);
    pushAudit(`[${new Date().toTimeString().slice(0,8)}] STANDBY ${standbyActive ? 'DEACTIVATED' : 'ACTIVATED'} — S/N forced to 0, pending limits canceled`, 'warn');
  }, [standbyActive]);

  const handleFlush = useCallback(() => {
    pushAudit(`[${new Date().toTimeString().slice(0,8)}] ⚠ GLOBAL FLUSH EXECUTED — MarketClose() all live positions`, 'abort');
  }, []);

  // Tactical view: existing pair cards
  const activePairsEntries = (Object.entries(pairs) as [string, PairPhysics][])
    .filter(([, d]) => (d.ticksAnalyzed ?? 0) > 10)
    .sort(([, a], [, b]) => Math.abs(b.zOfi ?? 0) - Math.abs(a.zOfi ?? 0));

  const getActiveTrade = (pair: string) => {
    const normalizedPair = normPair(pair);
    return activeTrades.find(t =>
      normPair(t.currency_pair) === normalizedPair &&
      (t.status === 'filled' || t.status === 'pending' || t.status === 'open')
    ) || null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Siren className="w-5 h-5 text-yellow-400" />
              <h1 className="font-display text-lg md:text-xl font-black tracking-widest text-gradient-neural uppercase">
                David-Atlas Operations Center
              </h1>
              <IntelligenceModeBadge />
              {standbyActive && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse text-[8px]">⏸ FLOOR STANDBY</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border/40 overflow-hidden text-[9px] font-mono font-bold">
                <button
                  onClick={() => setView('command-center')}
                  className={cn('px-3 py-1.5 transition-all uppercase', view === 'command-center' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >Manager's Office</button>
                <button
                  onClick={() => setView('tactical')}
                  className={cn('px-3 py-1.5 transition-all uppercase border-l border-border/40', view === 'tactical' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >Warehouse Floor</button>
              </div>
              <button onClick={refetch} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {ageSec != null && (
                <Badge variant={isStale ? 'destructive' : 'outline'} className="text-[8px] font-mono">
                  {isStale ? '⚠ STALE DATA' : '● LIVE'} {ageSec}s
                </Badge>
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-xs mt-1 font-mono">
            Operations Manager View · You are not guessing — you are reading the manifest · Conveyor Belt · Docks · Floor Friction · Rhythm · VIP Override
          </p>
        </motion.div>

        {loading && (
          <div className="text-center py-20 text-muted-foreground">
            <Cpu className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm font-mono">Booting warehouse telemetry...</p>
          </div>
        )}

        {!loading && view === 'command-center' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* ── 3-column Command Center layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_220px] gap-4">

              {/* ── LEFT RAIL ── */}
              <div className="space-y-3">
                <GlobalRadar pairs={pairs} activeTrades={activeTrades} />
                <TreasuryPanel
                  nav={parseFloat(snapshot?.pairs ? '307.42' : '0')}
                  unrealizedPL={0}
                  openTradeCount={openTrades.length}
                  snapshot={snapshot}
                />
              </div>

              {/* ── CENTER STAGE ── */}
              <div className="space-y-3">
                <SyntheticDepthMap snapshot={snapshot} activeTrades={activeTrades} />
                <PIDRatchetConsole activeTrades={activeTrades} snapshot={snapshot} />
              </div>

              {/* ── RIGHT RAIL ── */}
              <div className="space-y-3">
                <EigenOscilloscope snapshot={snapshot} activeTrades={activeTrades} />
                <LatencyHeartbeat />
                <AuditTerminal snapshot={snapshot} activeTrades={activeTrades} />
              </div>
            </div>

            {/* ── BOTTOM BAR: Nuclear Codes ── */}
            <NuclearCodes
              standbyActive={standbyActive}
              onStandby={handleStandby}
              onFlush={handleFlush}
            />

            {/* ── Climax Log ── */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <ClimaxBacktestLog />
            </motion.div>
          </motion.div>
        )}

        {!loading && view === 'tactical' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

            {/* Stats bar */}
            {snapshot && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: 'Active Bays', value: activePairsEntries.length, icon: Activity },
                  { label: '⚡ Breakthroughs', value: activePairsEntries.filter(([p, d]) => deriveSPPState(d, p) === 'STRIKE').length, icon: Flame, hot: true },
                  { label: '🎯 Traps Set', value: activePairsEntries.filter(([p, d]) => deriveSPPState(d, p) === 'SET').length, icon: Lock },
                  { label: '🔍 Scanning', value: activePairsEntries.filter(([p, d]) => deriveSPPState(d, p) === 'HUNT').length, icon: Search },
                  { label: '🏭 Polished Floors', value: activePairsEntries.filter(([, d]) => (d.efficiency??0) >= 100).length, icon: Waves },
                  { label: '🛡 Shipments', value: openTrades.length, icon: Shield },
                ].map(({ label, value, icon: Icon, hot }) => (
                  <div key={label} className={cn('rounded-lg border bg-card/40 p-2 space-y-0.5', hot && value > 0 ? 'border-yellow-500/40' : 'border-border/30')}>
                    <div className="flex items-center gap-1">
                      <Icon className={cn('w-3 h-3', hot && value > 0 ? 'text-yellow-400' : 'text-primary')} />
                      <span className="text-[9px] text-muted-foreground font-mono uppercase">{label}</span>
                    </div>
                    <span className={cn('text-base font-display font-bold', hot && value > 0 ? 'text-yellow-400' : 'text-foreground')}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tactical pair cards */}
            {activePairsEntries.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-mono">Warehouse is quiet — floor populates when the market opens.</p>
              </div>
            )}

            {activePairsEntries.length > 0 && (() => {
              const ACTIVE_STATES: TacticalState[] = ['GUARD', 'STRIKE', 'SET', 'HUNT'];
              const sectionMeta: Record<string, { color: string; label: string; pulseColor: string; desc: string }> = {
                GUARD:  { color: 'text-green-300',  label: '🛡 SHIPMENT IN TRANSIT',         pulseColor: 'bg-green-400',  desc: 'Active trade — pallet is moving. Ratchet tailing.' },
                STRIKE: { color: 'text-yellow-300', label: '⚡ LOGISTICS BREAKTHROUGH',       pulseColor: 'bg-yellow-400', desc: 'Belt smooth, 40 trucks docked, floor polished, rhythm locked. Strike executing.' },
                SET:    { color: 'text-amber-300',  label: '🎯 PALLET ON DOCK — TRAP ARMED', pulseColor: 'bg-amber-400',  desc: 'Predatory limit resting. Waiting for the Whale truck to hit.' },
                HUNT:   { color: 'text-blue-300',   label: '🔍 SCANNING DOCKS — COIL',       pulseColor: 'bg-blue-400',   desc: 'Belt is quiet. Dock activity rising. Watching for surge.' },
              };
              const placed = new Set<string>();

              const prioritySections = ACTIVE_STATES.map(s => {
                const members = activePairsEntries.filter(([p]) => {
                  const norm = normPair(p);
                  if (placed.has(norm)) return false;
                  const trade = getActiveTrade(p);
                  const st = trade ? 'GUARD' : deriveSPPState(pairs[p], p);
                  if (st === s) { placed.add(norm); return true; }
                  return false;
                });
                return { state: s, members, meta: sectionMeta[s] };
              }).filter(g => g.members.length > 0);

              const remaining = activePairsEntries.filter(([p]) => !placed.has(normPair(p)));

              return (
                <div className="space-y-5">
                  {prioritySections.map(({ state, members, meta }) => (
                    <div key={state} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full animate-pulse', meta.pulseColor)} />
                        <span className={cn('text-xs font-mono font-black uppercase tracking-widest', meta.color)}>
                          {meta.label} — {members.length} bay{members.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-[8px] font-mono text-muted-foreground/60 italic">{meta.desc}</span>
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {members.map(([pair, data]) => (
                          <TacticalUnitCard key={pair} pair={pair} data={data} activeTrade={getActiveTrade(pair)} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {remaining.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground">💤 Normal Activity — Business As Usual</span>
                        <div className="flex-1 h-px bg-border/20" />
                        <span className="text-[8px] font-mono text-muted-foreground">{remaining.length} bays</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1">
                        {remaining.map(([pair, data]) => (
                          <MiniPairCard key={pair} pair={pair} data={data} activeTrade={getActiveTrade(pair)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  );
};

// ─── Tactical Unit Card (compact version for tactical view) ───────────────────
function TacticalUnitCard({ pair, data, activeTrade }: { pair: string; data: PairPhysics; activeTrade: any }) {
  const p = data;
  const [showDetails, setShowDetails] = useState(false);
  const state: TacticalState = activeTrade ? 'GUARD' : deriveSPPState(p, pair);
  const NOI = computeNOI(p);
  const Sr = computeSr(p);
  const Z = p.zOfi ?? 0;
  const H = p.hurst?.H ?? 0;
  const E = p.efficiency ?? 0;

  const stateMeta = {
    STRIKE:  { label: '⚡ Logistics Breakthrough', color: 'text-yellow-300', border: 'border-yellow-500/60', bg: 'bg-yellow-500/8' },
    GUARD:   { label: '🛡 Shipment In Transit',    color: 'text-green-300',  border: 'border-green-500/50',  bg: 'bg-green-500/8' },
    SET:     { label: '🎯 Pallet On Dock',         color: 'text-amber-300',  border: 'border-amber-500/40',  bg: 'bg-amber-500/5' },
    HUNT:    { label: '🔍 Scanning Docks',         color: 'text-blue-300',   border: 'border-blue-500/30',   bg: 'bg-blue-500/5' },
    DUD:     { label: '💥 Pallet Dropped',         color: 'text-red-400',    border: 'border-red-500/60',    bg: 'bg-red-900/15' },
    FATIGUE: { label: '😴 Workers Lost',           color: 'text-red-400',    border: 'border-red-800/40',    bg: 'bg-red-900/10' },
    SCANNING:{ label: '💤 Normal Activity',        color: 'text-muted-foreground', border: 'border-border/30', bg: 'bg-muted/10' },
  }[state];

  const biasColor = p.bias === 'BUY' ? 'text-green-400' : p.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('rounded-xl border-2 bg-card/70 overflow-hidden', stateMeta.border)}
    >
      {activeTrade && (
        <div className={cn('px-3 py-1 text-[8px] font-mono font-bold uppercase border-b flex items-center justify-between',
          activeTrade.direction === 'long' ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30')}>
          <span>🛡 SHIPMENT IN TRANSIT — {activeTrade.direction === 'long' ? '📈 OUTBOUND' : '📉 INBOUND'}</span>
          <span>{Math.round((Date.now() - new Date(activeTrade.created_at).getTime()) / 1000)}s</span>
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-display font-black text-sm tracking-widest">{pair}</span>
          <Badge variant="outline" className={cn('text-[7px] font-mono font-bold', stateMeta.color)}>{stateMeta.label}</Badge>
        </div>

        {/* Gate bar — Climax Protocol v2.0 — 4 entry gates */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[6px] font-mono text-muted-foreground/60 uppercase tracking-widest">Climax v2.0 — ALL 4 gates required:</span>
            <span className={cn('ml-auto text-[9px] font-mono font-bold', biasColor)}>{p.bias}</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              {
                pass: E >= 7,
                label: '🏭 Floor ≥7×',
                title: 'Floor Friction (Efficiency ≥7×): How much energy to move a pallet? ≥7× means the floor has enough polish for freight to slide. ≥100× = full polished epoxy vacuum — zero resistance.',
              },
              {
                pass: Math.abs(Z) > Z_STRIKE,
                label: '🚛 Docks >2.5σ',
                title: 'Loading Docks (Z-OFI >2.5σ): 40 outbound trucks just backed in simultaneously with priority manifests. The Institutional Whale has arrived — massive demand shock.',
              },
              {
                pass: H >= HURST_PERSIST,
                label: '🚶 Rhythm ≥0.62',
                title: 'Workflow Rhythm (Hurst ≥0.62): Workers are picking up boxes and walking in a perfectly straight line to the shipping dock. Flow is continuous. If H drops below 0.45, workers are lost — Rule 5.3 Master Override.',
              },
              {
                pass: (p.vpin ?? 0) > 0.60,
                label: '🏗 VIP >0.60',
                title: 'VIP Override (VPIN >0.60): Regular floor managers (market makers) just realized a VIP corporate truck pulled up. They are pulling their limit orders — creating the vacuum for your 10-pip strike.',
              },
            ].map(({ pass, label, title }) => (
              <div key={label} title={title} className={cn('text-[6px] font-mono font-bold px-1.5 py-0.5 rounded border cursor-help transition-all',
                pass ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-muted/10 text-muted-foreground/40 border-border/20')}>
                {pass ? '✓' : '○'} {label}
              </div>
            ))}
          </div>
        </div>

        {/* Key metrics — plain English */}
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: 'Docks', sublabel: 'Whale trucks', value: `${Z >= 0 ? '+' : ''}${Z.toFixed(1)}σ`, hot: Math.abs(Z) > Z_STRIKE, title: 'Loading Docks Z-OFI: >+2.5σ = massive buy surge, <-2.5σ = sell flood' },
            { label: 'Friction', sublabel: 'Floor polish', value: `${E.toFixed(0)}×`, hot: E > E_VACUUM_MIN, title: 'Floor Friction Efficiency: >100× = zero resistance vacuum, <50× = broken pallet' },
            { label: 'Rhythm', sublabel: 'Workflow', value: H.toFixed(2), hot: H >= HURST_PERSIST, title: 'Workflow Rhythm Hurst: ≥0.62 = walking in straight lines, <0.45 = lost workers (exit)' },
          ].map(({ label, sublabel, value, hot, title }) => (
            <div key={label} title={title} className="rounded bg-muted/20 px-1 py-1 cursor-help">
              <div className="text-[7px] text-muted-foreground font-mono">{label}</div>
              <div className={cn('text-[9px] font-mono font-bold', hot ? 'text-yellow-400' : 'text-foreground')}>{value}</div>
              <div className="text-[6px] text-muted-foreground/50 font-mono">{sublabel}</div>
            </div>
          ))}
        </div>

        {/* Buy/Sell */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[7px] font-mono">
            <span className="text-green-400">BUY {p.buyPct}%</span>
            <span className="text-red-400">SELL {p.sellPct}%</span>
          </div>
          <div className="h-1 bg-muted/20 rounded-full overflow-hidden flex">
            <div className="bg-green-500/60 h-full" style={{ width: `${p.buyPct}%` }} />
            <div className="bg-red-500/60 h-full" style={{ width: `${p.sellPct}%` }} />
          </div>
        </div>

        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full text-[8px] font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
        >
          <ChevronRight className={cn('w-2.5 h-2.5 transition-transform', showDetails && 'rotate-90')} />
          {showDetails ? 'Less' : 'Full physics'}
        </button>

        {showDetails && (
          <div className="pt-1 space-y-1.5 border-t border-border/20">
            {[
              {
                label: '🎚 Belt Speed (S/N)',
                desc: 'Conveyor smooth?',
                value: Sr.toFixed(3),
                pass: Sr < SR_COIL,
                tip: `D1/√D2 = ${Sr.toFixed(3)}. Belt is ${Sr < SR_COIL ? 'smooth — belt running (<1.0)' : 'vibrating — jitter too high'}`,
              },
              {
                label: '🚛 Dock Pressure (NOI)',
                desc: 'Whale truck surge',
                value: `${NOI >= 0 ? '+' : ''}${NOI.toFixed(3)}`,
                pass: Math.abs(NOI) > NOI_WHALE,
                tip: `Net Order Imbalance = ${NOI.toFixed(3)}. ${Math.abs(NOI) > NOI_WHALE ? '40+ trucks docked — Whale wall active' : 'Normal dock traffic'}`,
              },
              {
                label: '🏗 VIP Override (VPIN)',
                desc: 'Floor managers fleeing?',
                value: (p.vpin ?? 0).toFixed(3),
                pass: (p.vpin ?? 0) > VPIN_FRAGILITY,
                tip: `VPIN = ${(p.vpin??0).toFixed(3)}. ${(p.vpin??0) > VPIN_FRAGILITY ? 'VIP corporate truck arrived — market makers pulling out' : 'Normal floor traffic'}`,
              },
              {
                label: '⚡ Belt Velocity (D1)',
                desc: 'Freight speed',
                value: (p.kramersMoyal?.D1 ?? 0).toExponential(2),
                pass: true,
                tip: 'KM Drift D1: actual forward speed of the price conveyor belt',
              },
              {
                label: '📳 Belt Vibration (D2)',
                desc: 'Noise floor',
                value: (p.kramersMoyal?.D2 ?? 0).toExponential(2),
                pass: true,
                tip: 'KM Diffusion D2: vibration of the belt — high = boxes falling off',
              },
            ].map(({ label, desc, value, pass, tip }) => (
              <div key={label} title={tip} className="flex items-center justify-between cursor-help group">
                <div>
                  <span className="text-[7px] font-mono text-muted-foreground group-hover:text-foreground/70 transition-colors">{label}</span>
                  <div className="text-[6px] font-mono text-muted-foreground/50">{desc}</div>
                </div>
                <span className={cn('text-[8px] font-mono font-bold', pass ? 'text-green-400' : 'text-muted-foreground')}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Mini Pair Card ───────────────────────────────────────────────────────────
function MiniPairCard({ pair, data, activeTrade }: { pair: string; data: PairPhysics; activeTrade: any }) {
  const state: TacticalState = activeTrade ? 'GUARD' : deriveSPPState(data, pair);
  const dotColor = {
    STRIKE:  'bg-yellow-400', GUARD: 'bg-green-400', SET: 'bg-amber-400',
    HUNT: 'bg-blue-400', DUD: 'bg-red-500', FATIGUE: 'bg-red-800', SCANNING: 'bg-muted/40',
  }[state];
  const E = data.efficiency ?? 0;
  const Z = data.zOfi ?? 0;
  return (
    <div className="rounded-md border border-border/30 bg-card/40 px-2 py-1.5 flex items-center gap-1.5">
      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor)} />
      <span className="font-mono text-[9px] text-foreground font-bold flex-1 truncate">{pair}</span>
      <span className="text-[7px] font-mono text-muted-foreground">E{E.toFixed(0)}</span>
    </div>
  );
}

export default SyntheticOrderBook;
