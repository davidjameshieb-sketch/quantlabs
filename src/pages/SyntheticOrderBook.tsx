import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, Activity, Zap, Eye, Shield, TrendingUp, Waves,
  RefreshCw, Crosshair, Radio, Siren, Brain, Target,
  ArrowUp, ArrowDown, Minus, ChevronRight, AlertTriangle,
  Lock, Flame, Search, GitBranch, TriangleAlert,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { Badge } from '@/components/ui/badge';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';
import { ClimaxBacktestLog } from '@/components/forex/floor-manager/ClimaxBacktestLog';
import { cn } from '@/lib/utils';

// ─── SPP v2.0 "Black Box" — 6-Formula Physics Taxonomy ─────────────────────
//
// Step 1 — HUNT:   Sr < 1.0 (Volatility Compression) + Ar > 0.7 (Structural Fragility)
// Step 2 — SET:    NOI > 0.8 or < -0.8 (Institutional Shadow) + T_lambda > 300s
// Step 3 — STRIKE: VoI spike + |Z| > 2.5σ  + Efficiency > 100× (Dud Rule: < 50× in 3 ticks → abort)
// Step 4 — GUARD:  Ratchet SL at +3.0p, 0.5-pip steps · Kill if 3/4 gates decay

// ── Derived "synthetic" proxies from PairPhysics ──
// Sr   ≈ 1 / (normalized Efficiency)   → lower E = lower Sr (compression)
// Ar   ≈ VPIN   → fragility proxy; high toxicity = fragile book
// NOI  ≈ ofiRatio (–1..+1 normalized)  → institutional order imbalance
// VoI  ≈ |zOfi| spike                  → volume-of-intent firing pin
// H    = Hurst exponent (persistence gate)
// E    = Efficiency ratio (F/v) — vacuum gate

// ── Thresholds ──
const E_VACUUM_MIN   = 100;  // E > 100× to confirm vacuum (Dud Rule: < 50× = abort)
const E_DUD_ABORT    = 50;
const Z_STRIKE       = 2.5;  // |Z| > 2.5σ — firing pin
const VPIN_FRAGILITY = 0.70; // Ar > 0.7 proxy
const HURST_PERSIST  = 0.62; // H ≥ 0.62
const NOI_WHALE      = 0.8;  // |NOI| > 0.8 for institutional shadow

// Tactical states
type TacticalState = 'HUNT' | 'SET' | 'STRIKE' | 'GUARD' | 'DUD' | 'FATIGUE' | 'SCANNING';

function deriveSPPState(p: PairPhysics): TacticalState {
  const H    = p.hurst?.H ?? 0;
  const eff  = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const absZ = Math.abs(p.zOfi ?? 0);
  // Derive synthetic metrics
  const Sr   = eff > 0 ? Math.min(1.5, 1 / Math.max(eff, 0.01)) : 1.5; // Sr < 1.0 = compression
  const Ar   = vpin;                                                      // Ar > 0.7 = fragile
  const NOI  = Math.max(-1, Math.min(1, (p.ofiRatio ?? 0)));             // –1..+1

  // Step 4 — GUARD (active trade with 4/4 → now 3/4 = exit trigger)
  // We use GUARD for pairs where all gates were open and a trade is running
  // (external: activeTrade + 4/4 passing)

  // Step 3 — STRIKE: vacuum + firing pin
  if (eff >= E_VACUUM_MIN && absZ > Z_STRIKE && vpin > VPIN_FRAGILITY && H >= HURST_PERSIST) return 'STRIKE';

  // Step 3 — DUD: entered but E < 50× within 3 ticks
  if (eff < E_DUD_ABORT && absZ > Z_STRIKE && vpin > 0.4) return 'DUD';

  // Step 2 — SET: coil confirmed, whale located
  if (Sr < 1.0 && Ar > VPIN_FRAGILITY && Math.abs(NOI) > NOI_WHALE) return 'SET';

  // Step 1 — HUNT: volatility compression + structural fragility, center-of-mass
  if (Sr < 1.0 && Ar > 0.5) return 'HUNT';

  // Fatigue
  if (H < 0.45) return 'FATIGUE';

  return 'SCANNING';
}

function getPulseSpeed(state: TacticalState, zOfi: number): string {
  if (state === 'STRIKE') return '0.4s';
  if (state === 'SET')    return '0.8s';
  if (Math.abs(zOfi) > 2.5) return '0.5s';
  return '2.0s';
}

// ─── SPP Metric Interpretation Engine ───────────────────────────────────────

interface MetricMeaning {
  label: string;
  value: string;
  meaning: string;
  implication: string;
  status: 'good' | 'warn' | 'danger' | 'neutral';
  passing: boolean;
  step: 1 | 2 | 3 | 4 | 0;  // which execution step this feeds
}

function interpretSPPMetrics(p: PairPhysics): MetricMeaning[] {
  const H    = p.hurst?.H ?? 0;
  const eff  = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const zOfi = p.zOfi ?? 0;
  const absZ = Math.abs(zOfi);
  const NOI  = Math.max(-1, Math.min(1, p.ofiRatio ?? 0));
  const Sr   = eff > 0 ? Math.min(2, 1 / Math.max(eff, 0.01)) : 2;
  const drift = Math.abs(p.kramersMoyal?.driftNormalized ?? 0);

  const metrics: MetricMeaning[] = [];

  // ── Sr — Volatility Compression Ratio (Step 1) ──
  {
    const passing = Sr < 1.0;
    const srVal   = Sr.toFixed(3);
    metrics.push({
      label: 'Sr (Volatility Compression)',
      value: srVal,
      meaning: Sr < 0.5
        ? `Deep spring-loading. Volatility is compressed to ${srVal} — below the 1.0 trigger. Potential energy is maximally coiled; the breakout will be violent.`
        : Sr < 1.0
          ? `Coiling in progress. Sr ${srVal} < 1.0 confirms the spring is loading. Market is building potential energy for an expansion.`
          : `No compression. Sr ${srVal} ≥ 1.0 — volatility is normal or expanded. No coil to trade.`,
      implication: passing
        ? 'Step 1 HUNT gate open. Spring is loaded — watch Ar for structural confirmation.'
        : 'Step 1 HUNT gate closed. Wait for compression below 1.0 before entering the hunt.',
      status: passing ? 'good' : 'neutral',
      passing,
      step: 1,
    });
  }

  // ── Ar — Structural Fragility (Step 1) ──
  {
    const passing = vpin > VPIN_FRAGILITY;  // Ar proxy = VPIN
    metrics.push({
      label: 'Ar (Structural Fragility)',
      value: vpin.toFixed(3),
      meaning: vpin >= 0.75
        ? `Book is critically fragile (Ar ${vpin.toFixed(3)} > 0.75). Market makers have withdrawn bids. A small order will shatter this structure.`
        : vpin >= 0.70
          ? `Structural fragility confirmed (Ar ${vpin.toFixed(3)} > 0.70). The order book is paper-thin — prime trap conditions.`
          : vpin >= 0.50
            ? `Moderate fragility (Ar ${vpin.toFixed(3)}). Book is thinning but not yet at the snap threshold.`
            : `Stable book structure (Ar ${vpin.toFixed(3)}). Too many market makers present for a clean trap. No fragility.`,
      implication: passing
        ? 'Step 1 SET confirmation: book is structurally fragile. System may now Set the limit trap.'
        : 'Step 1 incomplete. Book has sufficient depth — trap will not spring cleanly. Wait.',
      status: vpin >= 0.75 ? 'danger' : vpin >= 0.70 ? 'good' : vpin >= 0.50 ? 'warn' : 'neutral',
      passing,
      step: 1,
    });
  }

  // ── NOI — Net Order Imbalance (Step 2: Institutional Shadow) ──
  {
    const passing = Math.abs(NOI) >= NOI_WHALE;
    const dir = NOI > 0 ? 'BUY' : 'SELL';
    metrics.push({
      label: 'NOI (Institutional Shadow)',
      value: `${NOI >= 0 ? '+' : ''}${NOI.toFixed(3)}`,
      meaning: Math.abs(NOI) >= 0.9
        ? `Extreme ${dir} imbalance (NOI ${NOI.toFixed(3)}). An institutional whale is hiding a massive ${dir === 'BUY' ? 'bid' : 'ask'} wall. The trap is set.`
        : Math.abs(NOI) >= NOI_WHALE
          ? `Strong ${dir} shadow (NOI ${NOI.toFixed(3)} > ±0.8). Institutional order is visible in the flow data. Place limit ${NOI > 0 ? 'above bid wall' : 'below ask ceiling'}.`
          : Math.abs(NOI) >= 0.5
            ? `Moderate ${dir} lean (NOI ${NOI.toFixed(3)}). Some institutional interest but not enough for the trap to be reliably SET.`
            : `Balanced flow (NOI ${NOI.toFixed(3)}). No institutional shadow detected. Cannot identify the whale's wall.`,
      implication: passing
        ? `Step 2 SET: ${dir === 'BUY' ? 'Place Limit Buy at Bid Wall + 0.1 pip' : 'Place Limit Sell at Ask Ceiling − 0.1 pip'}.`
        : 'Step 2 blocked. NOI < ±0.8 — institutional position not large enough to shadow reliably.',
      status: Math.abs(NOI) >= 0.9 ? 'danger' : passing ? 'good' : Math.abs(NOI) >= 0.5 ? 'warn' : 'neutral',
      passing,
      step: 2,
    });
  }

  // ── VoI — Volume of Intent / Firing Pin (Step 3) ──
  {
    const passing = absZ >= Z_STRIKE;
    metrics.push({
      label: 'VoI / Z-OFI (Firing Pin)',
      value: `${zOfi >= 0 ? '+' : ''}${zOfi.toFixed(2)}σ`,
      meaning: absZ >= 3.5
        ? `Firing pin at maximum. VoI ${absZ.toFixed(1)}σ — a statistical event occurring < 0.1% of the time. Institutional sweep is live.`
        : absZ >= Z_STRIKE
          ? `Firing pin tripped. VoI ${absZ.toFixed(1)}σ > 2.5σ threshold. Aggressive ${zOfi > 0 ? 'buyers' : 'sellers'} are overwhelming the book — ignition confirmed.`
          : absZ >= 1.5
            ? `Building pressure (${absZ.toFixed(1)}σ). VoI is approaching the firing threshold but not there yet.`
            : `No ignition (${absZ.toFixed(1)}σ). Flow is balanced — the firing pin has not tripped.`,
      implication: passing
        ? `Step 3 STRIKE: VoI confirmed. Fill must coincide with this spike. Set TP = +10.0 pips, SL = −10.0 pips immediately.`
        : 'Step 3 waiting. VoI must cross 2.5σ simultaneously with E > 100× before the Strike fires.',
      status: absZ >= 3.5 ? 'danger' : passing ? 'good' : absZ >= 1.5 ? 'warn' : 'neutral',
      passing,
      step: 3,
    });
  }

  // ── H — Hurst Persistence (Step 4: Guard) ──
  {
    const passing = H >= HURST_PERSIST;
    metrics.push({
      label: 'H — Persistence (Guard)',
      value: H.toFixed(3),
      meaning: H >= 0.75
        ? `Maximum persistence. The 10-pip wave will not stall — price is in a self-reinforcing directional loop.`
        : H >= HURST_PERSIST
          ? `Persistence confirmed (H ${H.toFixed(3)} ≥ 0.62). The vacuum is directionally committed — ride continues.`
          : H >= 0.50
            ? `Weakening persistence (H ${H.toFixed(3)}). Momentum is degrading — Guard ratchet is at risk.`
            : `Momentum collapse (H ${H.toFixed(3)}). Mean-reversion is now dominant. Exit immediately.`,
      implication: passing
        ? 'Step 4 GUARD: Hurst gate maintained. Continue ratchet. Trail SL +0.5 pip steps from +3.0 pip profit.'
        : 'Step 4 GUARD: Hurst gate LOST (3/4 decay). Fire MarketClose() — this is the kill-switch trigger.',
      status: H >= 0.75 ? 'danger' : passing ? 'good' : H >= 0.50 ? 'warn' : 'neutral',
      passing,
      step: 4,
    });
  }

  // ── E — Efficiency / Vacuum Gate (Step 3) ──
  {
    const passing = eff >= E_DUD_ABORT;
    const isDud   = eff < E_DUD_ABORT && Math.abs(zOfi) > 1.5;
    metrics.push({
      label: 'E (Vacuum Gate / Dud Rule)',
      value: `${eff.toFixed(1)}×`,
      meaning: eff >= E_VACUUM_MIN
        ? `VACUUM CONFIRMED. E = ${eff.toFixed(0)}× > 100× — the order book is empty on one side. The "ghost move" is in progress. Zero friction.`
        : eff >= E_DUD_ABORT
          ? `Partial vacuum (E ${eff.toFixed(1)}×). Book is thinning but not fully empty. Below 100× the vacuum is not clean.`
          : isDud
            ? `DUD SIGNAL. E = ${eff.toFixed(1)}× < 50× — the book refilled. This trade has no vacuum to ride. Fire MarketClose() immediately.`
            : `Normal market friction (E ${eff.toFixed(1)}×). No vacuum present. The "ghost move" cannot activate.`,
      implication: eff >= E_VACUUM_MIN
        ? 'Step 3 VACUUM: Maximum priority. Enter if NOI and VoI confirm simultaneously.'
        : isDud
          ? '⚠ DUD RULE TRIGGERED: E < 50× within 3 ticks of fill. MarketClose() immediately — the ghost move failed.'
          : 'Efficiency gate below strike threshold. Wait for E > 100× before executing Step 3.',
      status: eff >= E_VACUUM_MIN ? 'danger' : eff >= E_DUD_ABORT ? 'good' : isDud ? 'danger' : 'neutral',
      passing,
      step: 3,
    });
  }

  return metrics;
}

// ─── SPP Intelligence Brief ──────────────────────────────────────────────────

interface IntelBrief {
  headline: string;
  situation: string;
  risk: string;
  watch: string;
  action: string;
}

function buildSPPBrief(pair: string, p: PairPhysics, state: TacticalState): IntelBrief {
  const H   = p.hurst?.H ?? 0;
  const eff = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const zOfi = p.zOfi ?? 0;
  const NOI  = Math.max(-1, Math.min(1, p.ofiRatio ?? 0));
  const dir  = zOfi > 0 ? 'LONG' : 'SHORT';
  const Sr   = eff > 0 ? Math.min(2, 1 / Math.max(eff, 0.01)) : 2;

  if (state === 'STRIKE') {
    return {
      headline: `⚡ STRIKE IGNITION — ${pair} ${dir}`,
      situation: `All 6 physics formulas are synchronized. E = ${eff.toFixed(0)}× (vacuum confirmed), VoI = ${Math.abs(zOfi).toFixed(1)}σ (firing pin tripped), H = ${H.toFixed(3)} (persistence), Ar = ${vpin.toFixed(3)} (fragile book), NOI = ${NOI >= 0 ? '+' : ''}${NOI.toFixed(3)} (whale positioned). Kinetic energy is releasing.`,
      risk: 'The DUD Rule is active: if E drops below 50× within 3 ticks of fill, fire MarketClose() immediately — the ghost move has failed.',
      watch: `TP = +10.0 pips, SL = −10.0 pips set on fill. At +3.0 pips profit, begin ratchet at 0.5-pip steps. Kill-switch fires if H, E, Z, or V drop (3/4 gate decay).`,
      action: `ENTER ${dir} at ${dir === 'LONG' ? 'Bid Wall + 0.1 pip' : 'Ask Ceiling − 0.1 pip'}. Use limit order. Confirm VoI spike coincides with fill. Guard ratchet activates at +3.0 pips.`,
    };
  }

  if (state === 'SET') {
    const whaleSide = NOI > 0 ? 'Bid Wall (BUY pressure)' : 'Ask Ceiling (SELL pressure)';
    const limitDir  = NOI > 0 ? 'Limit Buy at Wall + 0.1 pip' : 'Limit Sell at Ceiling − 0.1 pip';
    return {
      headline: `🎯 SET — Trap Positioned for ${pair}`,
      situation: `Spring is loaded (Sr ${Sr.toFixed(3)} < 1.0) and the book is structurally fragile (Ar ${vpin.toFixed(3)} > 0.7). NOI = ${NOI >= 0 ? '+' : ''}${NOI.toFixed(3)} reveals an institutional whale hiding a ${whaleSide}.`,
      risk: `Vacuum duration check required: T_lambda must exceed 300 seconds. If the predicted gap collapses early, the limit will not fill cleanly.`,
      watch: `Wait for VoI to spike above 2.5σ and E to cross 100× simultaneously — that is the firing pin. Do not enter before both conditions fire together.`,
      action: `Place ${limitDir}. Stand by for Step 3 STRIKE ignition. Do not use market orders.`,
    };
  }

  if (state === 'HUNT') {
    return {
      headline: `🔍 HUNT — Passive Coil Detected on ${pair}`,
      situation: `The system is in Passive Hunt mode. Volatility is compressing (Sr ${Sr.toFixed(3)} < 1.0) indicating spring-loading. Fragility is building but not yet at the 0.7 threshold (Ar = ${vpin.toFixed(3)}).`,
      risk: 'False breakouts are common during the coiling phase. Do not enter until the full SET conditions are confirmed.',
      watch: `NOI must cross ±0.8 to identify the whale's shadow. Ar (VPIN) must cross 0.70 to confirm structural fragility. Sr must remain below 1.0.`,
      action: 'Remain in Passive Hunt. Monitor. System will automatically escalate to SET when all Step 1 + Step 2 conditions align.',
    };
  }

  if (state === 'DUD') {
    return {
      headline: `💥 DUD — Ghost Move Failed on ${pair}`,
      situation: `Trade fired but E = ${eff.toFixed(1)}× failed to maintain above 50× threshold within 3 ticks. The book refilled — there is no vacuum to ride. This is the Dud Rule activation.`,
      risk: 'Continuing this trade has zero edge. The order book has sufficient depth to absorb the move. Holding will result in unnecessary slippage-driven losses.',
      watch: 'Monitor if E rebounds above 100× quickly — in rare cases the vacuum temporarily fills and then re-opens.',
      action: '⚠ FIRE MarketClose() IMMEDIATELY. The Dud Rule is absolute. There are no exceptions.',
    };
  }

  if (state === 'FATIGUE') {
    return {
      headline: `😴 FATIGUE — Momentum Collapse on ${pair}`,
      situation: `Hurst has dropped to ${H.toFixed(3)} — below 0.45. Mean-reversion is now the dominant regime. Any open tunnel trades must be closed — the 10-pip wave will not complete.`,
      risk: 'Every tick in FATIGUE is fighting the market\'s natural reversion tendency. Trailing stops will be hit. The "winning machine" cannot function.',
      watch: 'Wait for H to rebuild above 0.55 (HUNT eligible) or 0.62 (GUARD-eligible). This typically requires 30-90 minutes of consolidation.',
      action: 'EXIT all positions. Close tunnel trades. System returns to SCANNING until Hurst rebuilds.',
    };
  }

  return {
    headline: `📡 SCANNING — ${pair} Queue`,
    situation: `No institutional signal detected. H = ${H.toFixed(3)}, E = ${eff.toFixed(1)}×, VPIN = ${vpin.toFixed(3)}, Z = ${Math.abs(zOfi).toFixed(2)}σ. System is sampling every tick for Sr < 1.0 coil conditions.`,
    risk: 'No current edge. The market is in a noise phase.',
    watch: 'Watching for Sr to compress below 1.0 (Step 1) and Ar to cross 0.70 (Step 2 fragility trigger).',
    action: 'No action. Pair is queued. System will escalate automatically when HUNT conditions form.',
  };
}

// ─── LightningSVG ────────────────────────────────────────────────────────────

function LightningSVG({ speed }: { speed: string }) {
  return (
    <svg width="18" height="32" viewBox="0 0 18 32"
      className="absolute -top-1 -right-1 opacity-80" aria-hidden="true">
      <polyline
        points="10,0 4,14 9,14 8,32 14,16 9,16 10,0"
        fill="none" stroke="hsl(50 100% 60%)" strokeWidth="1.5" strokeLinejoin="round"
        className="lightning-path"
        style={{ '--pulse-speed': speed } as React.CSSProperties}
      />
    </svg>
  );
}

// ─── Metric Row ──────────────────────────────────────────────────────────────

function MetricRow({ m }: { m: MetricMeaning }) {
  const [open, setOpen] = useState(false);
  const stepLabel = m.step > 0
    ? { 1: 'HUNT', 2: 'SET', 3: 'STRIKE', 4: 'GUARD' }[m.step] ?? ''
    : '';
  const stepColors: Record<number, string> = {
    1: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    2: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    3: 'bg-red-500/10 text-red-400 border-red-500/30',
    4: 'bg-green-500/10 text-green-400 border-green-500/30',
    0: 'bg-muted/10 text-muted-foreground border-border/20',
  };

  const statusColors = {
    good:    { bar: 'bg-green-500',   text: 'text-green-400',   badge: 'bg-green-500/15 border-green-500/30 text-green-400' },
    warn:    { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
    danger:  { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/15 border-red-500/30 text-red-400' },
    neutral: { bar: 'bg-muted-foreground/40', text: 'text-muted-foreground', badge: 'bg-muted/20 border-border/30 text-muted-foreground' },
  }[m.status];

  return (
    <div className="space-y-1">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 group">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', m.passing ? 'bg-green-500' : 'bg-muted/40 border border-border/50')} />
          <span className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors truncate">{m.label}</span>
          {stepLabel && (
            <span className={cn('text-[7px] font-mono border px-1 rounded', stepColors[m.step])}>{stepLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-[10px] font-mono font-bold', statusColors.text)}>{m.value}</span>
          <ChevronRight className={cn('w-3 h-3 text-muted-foreground/50 transition-transform', open && 'rotate-90')} />
        </div>
      </button>

      <div className="h-0.5 bg-muted/20 rounded-full overflow-hidden ml-3.5">
        <div className={cn('h-full rounded-full transition-all duration-700', statusColors.bar)} style={{ width: m.passing ? '100%' : '30%' }} />
      </div>

      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="ml-3.5 space-y-1.5 pt-1">
          <div className={cn('text-[9px] font-mono leading-relaxed rounded px-2 py-1.5 border', statusColors.badge)}>{m.meaning}</div>
          <div className="flex items-start gap-1.5">
            <ChevronRight className="w-2.5 h-2.5 text-primary flex-shrink-0 mt-0.5" />
            <span className="text-[8px] font-mono text-primary leading-relaxed">{m.implication}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Intel Brief Panel ───────────────────────────────────────────────────────

function IntelBriefPanel({ brief, stateMeta }: { brief: IntelBrief; stateMeta: { color: string; bg: string } }) {
  const sections = [
    { icon: Brain,         label: 'Situation', text: brief.situation, textColor: 'text-foreground' },
    { icon: AlertTriangle, label: 'Risk',      text: brief.risk,      textColor: 'text-amber-400' },
    { icon: Eye,           label: 'Watch For', text: brief.watch,     textColor: 'text-muted-foreground' },
    { icon: Target,        label: 'Action',    text: brief.action,    textColor: 'text-primary' },
  ];

  return (
    <div className={cn('rounded-lg border space-y-0 overflow-hidden', stateMeta.bg)}>
      <div className={cn('px-2.5 py-1.5 border-b border-border/20 flex items-center gap-1.5', stateMeta.bg)}>
        <Radio className={cn('w-2.5 h-2.5 flex-shrink-0', stateMeta.color)} />
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">SPP v2.0 Intelligence Brief</span>
      </div>
      <div className="px-2.5 pt-2 pb-1">
        <p className={cn('text-[10px] font-mono font-bold mb-2', stateMeta.color)}>{brief.headline}</p>
        <div className="space-y-2">
          {sections.map(({ icon: Icon, label, text, textColor }) => (
            <div key={label} className="flex gap-2">
              <div className="flex-shrink-0 w-3.5 pt-0.5">
                <Icon className="w-2.5 h-2.5 text-muted-foreground/60" />
              </div>
              <div className="min-w-0">
                <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/60 block">{label}</span>
                <span className={cn('text-[9px] font-mono leading-relaxed', textColor)}>{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SPP Step Badge ───────────────────────────────────────────────────────────

function SPPStepBadge({ step, active }: { step: 1 | 2 | 3 | 4; active: boolean }) {
  const cfg = {
    1: { label: 'HUNT', icon: Search,      color: active ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'  : 'bg-muted/10 text-muted-foreground/30 border-border/20' },
    2: { label: 'SET',  icon: Lock,        color: active ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-muted/10 text-muted-foreground/30 border-border/20' },
    3: { label: 'STRIKE', icon: Flame,     color: active ? 'bg-red-500/20 text-red-300 border-red-500/40'    : 'bg-muted/10 text-muted-foreground/30 border-border/20' },
    4: { label: 'GUARD', icon: Shield,     color: active ? 'bg-green-500/20 text-green-300 border-green-500/40' : 'bg-muted/10 text-muted-foreground/30 border-border/20' },
  }[step];
  const Icon = cfg.icon;
  return (
    <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border text-[7px] font-mono font-bold', cfg.color)}>
      <Icon className="w-2 h-2" />{cfg.label}
    </div>
  );
}

// ─── Tactical Unit Card (SPP v2.0) ───────────────────────────────────────────

function TacticalUnit({ pair, data, activeTrade }: {
  pair: string;
  data: PairPhysics;
  activeTrade?: { direction: string; created_at: string } | null;
}) {
  const p = data;
  const [showBrief, setShowBrief] = useState(false);

  const physicsState = deriveSPPState(p);
  // Override with GUARD if live trade is running with 4/4 gates
  const state: TacticalState = activeTrade
    ? (physicsState === 'STRIKE' ? 'GUARD' : physicsState)
    : physicsState;

  const pulseSpeed = getPulseSpeed(state, p.zOfi ?? 0);

  const stateMeta = {
    STRIKE:  { label: '⚡ STRIKE',      color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/30', border: 'border-yellow-500/60' },
    GUARD:   { label: '🛡 GUARD',       color: 'text-green-300',  bg: 'bg-green-500/10 border-green-500/30',  border: 'border-green-500/60' },
    SET:     { label: '🎯 SET',         color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/30',  border: 'border-amber-500/40' },
    HUNT:    { label: '🔍 HUNT',        color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/20',    border: 'border-blue-500/30' },
    DUD:     { label: '💥 DUD',         color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800/40',      border: 'border-red-700/50' },
    FATIGUE: { label: '😴 FATIGUE',     color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800/40',      border: 'border-red-700/40' },
    SCANNING:{ label: 'SCANNING',       color: 'text-muted-foreground', bg: 'bg-muted/20 border-border/20', border: 'border-border/30' },
  }[state];

  const stepStates: Record<TacticalState, (1|2|3|4)[]> = {
    HUNT:    [1],
    SET:     [1, 2],
    STRIKE:  [1, 2, 3],
    GUARD:   [1, 2, 3, 4],
    DUD:     [],
    FATIGUE: [],
    SCANNING:[],
  };
  const activeSteps = stepStates[state] ?? [];

  const metrics = interpretSPPMetrics(p);
  const brief   = buildSPPBrief(pair, p, state);

  const biasColor = p.bias === 'BUY' ? 'text-green-400' : p.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const BiasIcon  = p.bias === 'BUY' ? ArrowUp : p.bias === 'SELL' ? ArrowDown : Minus;

  const showLightning = state === 'STRIKE' || state === 'GUARD';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative rounded-xl border-2 bg-card/70 backdrop-blur-sm overflow-hidden transition-colors',
        stateMeta.border,
        state === 'SCANNING' && 'border-border/30'
      )}
      style={{ '--pulse-speed': pulseSpeed } as React.CSSProperties}
    >
      {showLightning && <LightningSVG speed={pulseSpeed} />}

      {/* ── Active Trade Banner ── */}
      {activeTrade && (
        <div className={cn(
          'flex items-center justify-between px-3 py-1.5 text-[9px] font-mono font-bold tracking-widest uppercase border-b',
          activeTrade.direction === 'long'
            ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : 'bg-red-500/20 text-red-300 border-red-500/30'
        )}>
          <span>🛡 TUNNEL GUARD — {activeTrade.direction.toUpperCase()}</span>
          <span>{Math.round((Date.now() - new Date(activeTrade.created_at).getTime()) / 1000)}s</span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className={cn('w-3.5 h-3.5', stateMeta.color)} />
            <span className="font-display font-black text-base tracking-widest">{pair}</span>
          </div>
          <Badge variant="outline" className={cn('text-[8px] font-mono font-bold border uppercase', stateMeta.bg, stateMeta.color)}>
            {stateMeta.label}
          </Badge>
        </div>

        {/* SPP Step pipeline */}
        <div className="flex items-center gap-1">
          {([1, 2, 3, 4] as const).map(s => (
            <SPPStepBadge key={s} step={s} active={activeSteps.includes(s)} />
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <BiasIcon className={cn('w-3 h-3', biasColor)} />
            <span className={cn('text-[10px] font-mono font-bold', biasColor)}>{p.bias}</span>
          </div>
        </div>

        {p.hiddenPlayer && (
          <div className="flex items-center gap-1.5">
            {p.hiddenPlayer.type === 'LIQUIDITY_HOLE' ? (
              <Badge className="text-[7px] gap-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5">⚡ LIQUIDITY HOLE</Badge>
            ) : (
              <Badge variant="destructive" className="text-[7px] gap-0.5 px-1.5">
                🐋 {p.hiddenPlayer.type === 'HIDDEN_LIMIT_SELLER' ? 'HIDDEN LIMIT SELL' : 'HIDDEN LIMIT BUY'}
              </Badge>
            )}
            <span className="text-[8px] font-mono text-muted-foreground">Force {p.hiddenPlayer.force?.toFixed(2)}</span>
          </div>
        )}

        {/* Gate bar — 4 physics gates */}
        <div className="flex items-center gap-1.5">
          {metrics.slice(0, 4).map((m, i) => (
            <div key={i} className={cn('w-1.5 h-1.5 rounded-full', m.passing ? 'bg-green-500' : 'bg-muted/40 border border-border/40')} />
          ))}
          <span className="text-[8px] font-mono text-muted-foreground ml-0.5">
            {metrics.filter(m => m.passing).length}/{metrics.length} formulas passing
          </span>
          <span className="text-[8px] font-mono text-muted-foreground ml-auto">{p.ticksAnalyzed?.toLocaleString()} ticks</span>
        </div>
      </div>

      {/* ── Buy/Sell Pressure ── */}
      <div className="px-4 pb-3 space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono">
          <span className="text-green-400">BUY {p.buyPct}%</span>
          <span className="text-red-400">SELL {p.sellPct}%</span>
        </div>
        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden flex">
          <div className="bg-green-500/70 h-full transition-all duration-500" style={{ width: `${p.buyPct}%` }} />
          <div className="bg-red-500/70 h-full transition-all duration-500" style={{ width: `${p.sellPct}%` }} />
        </div>
      </div>

      <div className="border-t border-border/20" />

      {/* ── Physics Metrics ── */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">SPP v2.0 Physics</span>
          <span className="text-[8px] font-mono text-primary cursor-default">tap to decode ↓</span>
        </div>
        {metrics.map((m) => <MetricRow key={m.label} m={m} />)}
      </div>

      <div className="border-t border-border/20" />

      {/* ── Intelligence Brief Toggle ── */}
      <div className="px-4 py-2">
        <button
          onClick={() => setShowBrief(v => !v)}
          className={cn(
            'w-full flex items-center justify-between text-[9px] font-mono uppercase tracking-widest transition-colors',
            showBrief ? stateMeta.color : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div className="flex items-center gap-1.5">
            <Brain className="w-3 h-3" />
            Intelligence Brief
          </div>
          <ChevronRight className={cn('w-3 h-3 transition-transform', showBrief && 'rotate-90')} />
        </button>
      </div>

      {showBrief && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-4 pb-4">
          <IntelBriefPanel brief={brief} stateMeta={stateMeta} />
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── SPP v2.0 Execution Thread HUD ───────────────────────────────────────────

function SPPExecutionHUD() {
  const steps = [
    {
      num: 1, label: 'HUNT', icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30',
      title: 'Passive Hunt — Coil Identification',
      conditions: ['Sr < 1.0 (Volatility Compression)', 'Ar > 0.7 (Structural Fragility)', 'MRD < 1.0 (Center of mass)'],
      result: 'State → COILING',
    },
    {
      num: 2, label: 'SET', icon: Lock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30',
      title: "Set — Position the Limit Trap",
      conditions: ['NOI > +0.8 → Limit Buy at Bid Wall + 0.1p', 'NOI < −0.8 → Limit Sell at Ask Ceiling − 0.1p', 'T_lambda > 300s (vacuum duration check)'],
      result: 'Limit order placed in whale shadow',
    },
    {
      num: 3, label: 'STRIKE', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30',
      title: 'Strike — Ignition & Ghost Move',
      conditions: ['VoI spike coincides with fill', '|Z| > 2.5σ confirmed', 'E > 100× (vacuum gate)', 'Dud Rule: E < 50× in 3 ticks → abort'],
      result: 'TP = +10.0p · SL = −10.0p',
    },
    {
      num: 4, label: 'GUARD', icon: Shield, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30',
      title: 'Guard — The Winning Machine',
      conditions: ['Ratchet SL: at +3.0p → crawl +0.5p steps', 'Kill-Switch: 3/4 gate decay → MarketClose()', 'H, E, Z, V — any 1 falling = exit signal'],
      result: 'Target: +10.0 pips · Zero-Stop Tunnel',
    },
  ];

  const formulas = [
    { sym: 'Sr',  role: 'Potential Energy',       gate: 'Sr < 1.0',      color: 'text-blue-400' },
    { sym: 'Ar',  role: 'Structural Fragility',   gate: 'Ar > 0.7',      color: 'text-amber-400' },
    { sym: 'NOI', role: 'Institutional Shadow',   gate: '|NOI| > 0.8',   color: 'text-purple-400' },
    { sym: 'VoI', role: 'The Firing Pin',         gate: 'Z-OFI spike',   color: 'text-red-400' },
    { sym: 'H',   role: 'Persistence',            gate: 'H ≥ 0.62',      color: 'text-green-400' },
    { sym: 'E',   role: 'The Vacuum',             gate: 'E > 100×',      color: 'text-yellow-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 }}
      className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-yellow-500/15 bg-yellow-500/5">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-yellow-300">
            SPP v2.0 "Black Box" — 6-Formula Zero-Fault Execution Thread
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground hidden md:block">
          HUNT → SET → STRIKE → GUARD
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* 4 Execution Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className={cn('rounded-lg border p-2.5 space-y-1.5', s.bg)}>
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('w-3 h-3', s.color)} />
                  <span className={cn('text-[9px] font-mono font-black uppercase tracking-wider', s.color)}>
                    Step {s.num}: {s.label}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-foreground font-medium">{s.title}</p>
                <ul className="space-y-0.5">
                  {s.conditions.map((c, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className={cn('text-[7px] mt-0.5 flex-shrink-0', s.color)}>●</span>
                      <span className="text-[8px] font-mono text-muted-foreground">{c}</span>
                    </li>
                  ))}
                </ul>
                <div className={cn('text-[8px] font-mono font-bold rounded px-1.5 py-0.5 border text-center', s.bg, s.color)}>
                  {s.result}
                </div>
              </div>
            );
          })}
        </div>

        {/* Physics Audit Table */}
        <div className="space-y-1">
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">System Integrity — Physics Audit</span>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-1.5">
            {formulas.map((f) => (
              <div key={f.sym} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 bg-card/40 border border-border/30">
                <span className={cn('text-[11px] font-mono font-black w-8 flex-shrink-0', f.color)}>{f.sym}</span>
                <div className="min-w-0">
                  <div className={cn('text-[8px] font-mono font-bold', f.color)}>{f.gate}</div>
                  <div className="text-[7px] font-mono text-muted-foreground truncate">{f.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Kill-switch reminder */}
        <div className="rounded-md px-2.5 py-1.5 bg-amber-500/5 border border-amber-500/20 flex items-center gap-2">
          <TriangleAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[8px] font-mono text-amber-300">
            <strong>Zero-Fault Rules:</strong> Dud Rule (E &lt; 50× in 3 ticks → instant exit) · Kill-Switch (3/4 gate decay → MarketClose()) · Ratchet begins at +3.0 pips, moves in +0.5 pip steps.
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Gate Pipeline Banner ────────────────────────────────────────────────────

function GatePipeline({ gates }: { gates: string[] }) {
  const gateColors = [
    'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'bg-red-500/20 text-red-400 border-red-500/30',
    'bg-green-500/20 text-green-400 border-green-500/30',
    'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  ];
  const gateIcons = [Zap, Shield, Waves, TrendingUp, Activity, Eye];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {gates.map((g, i) => {
        const Icon = gateIcons[i] || Zap;
        return (
          <div key={g} className="flex items-center gap-1.5">
            <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold', gateColors[i])}>
              <Icon className="w-3 h-3" />{g}
            </div>
            {i < gates.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const SyntheticOrderBook = () => {
  const { snapshot, loading, lastUpdated, refetch, activeTrades } = useSyntheticOrderBook(3_000);

  const pairs = snapshot?.pairs ? Object.entries(snapshot.pairs).sort((a, b) =>
    Math.abs((b[1] as any).zOfi || 0) - Math.abs((a[1] as any).zOfi || 0)
  ) : [];

  const activePairs    = pairs.filter(([, d]) => (d as any).ticksAnalyzed > 10);
  const hiddenAlerts   = pairs.filter(([, d]) => (d as any).hiddenPlayer);
  const strikePairs    = activePairs.filter(([, d]) => deriveSPPState(d as PairPhysics) === 'STRIKE');
  const setPairs       = activePairs.filter(([, d]) => deriveSPPState(d as PairPhysics) === 'SET');
  const huntPairs      = activePairs.filter(([, d]) => deriveSPPState(d as PairPhysics) === 'HUNT');
  const dudPairs       = activePairs.filter(([, d]) => deriveSPPState(d as PairPhysics) === 'DUD');
  const vacuumCount    = activePairs.filter(([, d]) => (d as any).efficiency >= E_VACUUM_MIN).length;

  const ageMs  = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
  const ageSec = ageMs ? Math.round(ageMs / 1000) : null;
  const isStale = ageSec != null && ageSec > 120;

  const MARKET_GROUPS: { label: string; emoji: string; pairs: string[] }[] = [
    { label: 'USD Majors',       emoji: '🇺🇸', pairs: ['EUR_USD','GBP_USD','USD_JPY','USD_CHF','AUD_USD','USD_CAD','NZD_USD'] },
    { label: 'EUR Crosses',      emoji: '🇪🇺', pairs: ['EUR_GBP','EUR_JPY','EUR_CHF','EUR_AUD','EUR_CAD','EUR_NZD'] },
    { label: 'GBP Crosses',      emoji: '🇬🇧', pairs: ['GBP_JPY','GBP_CHF','GBP_AUD','GBP_CAD','GBP_NZD'] },
    { label: 'JPY Crosses',      emoji: '🇯🇵', pairs: ['AUD_JPY','CAD_JPY','CHF_JPY','NZD_JPY'] },
    { label: 'Commodity & Minors', emoji: '🌏', pairs: ['AUD_CAD','AUD_CHF','AUD_NZD','CAD_CHF','NZD_CAD','NZD_CHF'] },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Siren className="w-6 h-6 text-yellow-400" />
              <h1 className="font-display text-xl md:text-2xl font-black tracking-widest text-gradient-neural uppercase">
                Tactical War Room
              </h1>
              <IntelligenceModeBadge />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={refetch} className="text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              {ageSec != null && (
                <Badge variant={isStale ? 'destructive' : 'outline'} className="text-[9px] font-mono">
                  {isStale ? '⚠ STALE' : '●'} {ageSec}s ago
                </Badge>
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            SPP v2.0 "Black Box" — 6-Formula Market Microstructure Predation Engine
          </p>
        </motion.div>

        {/* SPP Execution HUD */}
        <SPPExecutionHUD />

        {/* Pipeline Banner */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
            className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs font-display font-bold text-primary tracking-widest">LEAN 6 PIPELINE</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">{snapshot.version}</Badge>
            </div>
            <GatePipeline gates={snapshot.gates || []} />
          </motion.div>
        )}

        {/* Stats */}
        {snapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
            className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Units Tracked', value: activePairs.length,    icon: Activity, color: undefined },
              { label: 'STRIKE',        value: strikePairs.length,     icon: Flame,    color: strikePairs.length > 0 ? 'text-yellow-400' : undefined },
              { label: 'SET',           value: setPairs.length,        icon: Lock,     color: setPairs.length > 0 ? 'text-amber-400' : undefined },
              { label: 'HUNT',          value: huntPairs.length,       icon: Search,   color: huntPairs.length > 0 ? 'text-blue-400' : undefined },
              { label: 'VACUUM (E>100×)', value: vacuumCount,          icon: Waves,    color: vacuumCount > 0 ? 'text-red-400' : undefined },
              { label: 'Whale Alerts',  value: hiddenAlerts.length,    icon: Eye,      color: hiddenAlerts.length > 0 ? 'text-orange-400' : 'text-muted-foreground' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('w-3.5 h-3.5', color || 'text-primary')} />
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">{label}</span>
                </div>
                <span className={cn('text-lg font-display font-bold', color || 'text-foreground')}>{value}</span>
              </div>
            ))}
          </motion.div>
        )}

        {loading && (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm font-mono">Initialising SPP v2.0 Physics Engine...</p>
          </div>
        )}

        {/* DUD alerts — always show at top if any */}
        {!loading && dudPairs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono font-black uppercase tracking-widest text-red-400">
                ⚠ DUD ALERTS — {dudPairs.length} pair{dudPairs.length > 1 ? 's' : ''} — MarketClose() Required
              </span>
              <div className="flex-1 h-px bg-red-500/20" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dudPairs.map(([pair, data]) => {
                const trade = activeTrades.find(t => (t.currency_pair === (pair as string).replace('/', '_') || t.currency_pair === pair) && (t.status === 'filled' || t.status === 'pending')) || null;
                return <TacticalUnit key={pair as string} pair={pair as string} data={data as PairPhysics} activeTrade={trade} />;
              })}
            </div>
          </motion.div>
        )}

        {!loading && activePairs.length > 0 && (() => {
          const renderCard = ([pair, data]: [string, unknown]) => {
            const normalizedPair = (pair as string).replace('/', '_');
            const trade = activeTrades.find(t =>
              (t.currency_pair === normalizedPair || t.currency_pair === pair) &&
              (t.status === 'filled' || t.status === 'pending')
            ) || null;
            return <TacticalUnit key={pair as string} pair={pair as string} data={data as PairPhysics} activeTrade={trade} />;
          };

          // Priority order: STRIKE → SET → HUNT → rest by group
          const stateOrder: TacticalState[] = ['STRIKE', 'SET', 'HUNT'];
          const sectionMeta: Record<string, { icon: React.ElementType; color: string; label: string }> = {
            STRIKE: { icon: Flame,  color: 'text-yellow-300', label: '⚡ STRIKE — Vacuum Ignition' },
            SET:    { icon: Lock,   color: 'text-amber-300',  label: '🎯 SET — Trap Positioned' },
            HUNT:   { icon: Search, color: 'text-blue-300',   label: '🔍 HUNT — Coil Detected' },
          };

          const placed = new Set<string>();
          const prioritySections = stateOrder.map(s => {
            const members = activePairs.filter(([p, d]) => {
              const norm = (p as string).replace('/', '_');
              if (placed.has(norm)) return false;
              if (deriveSPPState(d as PairPhysics) === s && s !== 'DUD') { placed.add(norm); return true; }
              return false;
            });
            return { state: s, members, meta: sectionMeta[s] };
          }).filter(g => g.members.length > 0);

          // Place remaining into market groups
          const groups = MARKET_GROUPS.map(g => {
            const members = activePairs.filter(([p, d]) => {
              const norm = (p as string).replace('/', '_');
              if (placed.has(norm)) return false;
              if (dudPairs.find(([dp]) => dp === p)) return false; // already shown
              if (g.pairs.includes(norm)) { placed.add(norm); return true; }
              return false;
            });
            return { ...g, members };
          }).filter(g => g.members.length > 0);

          const otherPairs = activePairs.filter(([p, d]) => {
            const norm = (p as string).replace('/', '_');
            if (placed.has(norm)) return false;
            if (dudPairs.find(([dp]) => dp === p)) return false;
            return true;
          });

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-6">
              {/* Priority sections: STRIKE, SET, HUNT */}
              {prioritySections.map(({ state, members, meta }) => (
                <div key={state} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full animate-pulse', state === 'STRIKE' ? 'bg-yellow-400' : state === 'SET' ? 'bg-amber-400' : 'bg-blue-400')} />
                    <span className={cn('text-xs font-mono font-black uppercase tracking-widest', meta.color)}>
                      {meta.label} — {members.length} pair{members.length > 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {members.map(renderCard)}
                  </div>
                </div>
              ))}

              {/* Market groups */}
              {groups.map(g => (
                <div key={g.label} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{g.emoji}</span>
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">{g.label}</span>
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[9px] font-mono text-muted-foreground">{g.members.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {g.members.map(renderCard)}
                  </div>
                </div>
              ))}

              {otherPairs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">🔀 Other</span>
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[9px] font-mono text-muted-foreground">{otherPairs.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {otherPairs.map(renderCard)}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })()}

        {!loading && activePairs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tactical data available yet.</p>
            <p className="text-xs mt-1 font-mono">The ripple-stream engine populates this when the market is open.</p>
          </div>
        )}

        {/* Climax Backtest Log */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <ClimaxBacktestLog />
        </motion.div>

        {snapshot?.capabilities && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="p-3 rounded-lg border border-border/30 bg-card/30">
            <span className="text-[10px] text-muted-foreground font-mono uppercase">Architecture Capabilities</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {snapshot.capabilities.map(c => (
                <span key={c} className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-muted/40 text-muted-foreground border border-border/20">{c}</span>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default SyntheticOrderBook;
