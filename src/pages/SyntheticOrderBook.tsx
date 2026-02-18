import { motion } from 'framer-motion';
import {
  BookOpen, Activity, Zap, Eye, Shield, TrendingUp, Waves,
  RefreshCw, Crosshair, Radio, Siren, Brain, Target,
  ArrowUp, ArrowDown, Minus, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { Badge } from '@/components/ui/badge';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';
import { cn } from '@/lib/utils';

// ─── Tactical State ─────────────────────────────────────────────────────────

type TacticalState = 'FATIGUE' | 'ACTIVE' | 'CLIMAX' | 'STRIKE_READY' | 'SCANNING';

function deriveTacticalState(p: PairPhysics): TacticalState {
  const H = p.hurst?.H ?? 0;
  const eff = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  if (H < 0.45) return 'FATIGUE';
  if (eff >= 7 && vpin >= 0.65) return 'CLIMAX';
  if (H >= 0.62 && eff >= 2 && vpin >= 0.4 && Math.abs(p.zOfi) >= 1) return 'ACTIVE';
  if (H >= 0.55 && eff >= 1.5) return 'STRIKE_READY';
  return 'SCANNING';
}

function getPulseSpeed(zOfi: number): string {
  if (Math.abs(zOfi) > 2.5) return '0.5s';
  if (Math.abs(zOfi) < 0.5) return '3.0s';
  return '1.5s';
}

// ─── Intelligence Interpretation Engine ────────────────────────────────────

interface MetricMeaning {
  label: string;       // Short metric label
  value: string;       // Formatted value
  meaning: string;     // Plain-English what this means RIGHT NOW
  implication: string; // What it implies for a trade
  status: 'good' | 'warn' | 'danger' | 'neutral';
  passing: boolean;
}

function interpretMetrics(p: PairPhysics): MetricMeaning[] {
  const H = p.hurst?.H ?? 0;
  const regime = p.hurst?.regime ?? 'RANDOM_WALK';
  const eff = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const zOfi = p.zOfi ?? 0;
  const drift = Math.abs(p.kramersMoyal?.driftNormalized ?? 0);

  const metrics: MetricMeaning[] = [];

  // ── Hurst Exponent ──
  {
    let meaning = '';
    let implication = '';
    let status: MetricMeaning['status'] = 'neutral';
    const passing = H >= 0.55;

    if (H >= 0.7) {
      meaning = 'Strong trending momentum. Price movement is self-reinforcing — each tick is more likely to continue in the same direction.';
      implication = 'High conviction trend-following entry. Whale continuation likely.';
      status = 'good';
    } else if (H >= 0.62) {
      meaning = 'Persistent trend. Institutional flow is directionally committed — price is not randomly bouncing.';
      implication = 'Predatory Hunter entry gate open. Momentum is real.';
      status = 'good';
    } else if (H >= 0.55) {
      meaning = 'Mild persistence. Trend exists but conviction is building — not fully committed yet.';
      implication = 'Strike Ready zone. Watch for Z-OFI surge to confirm.';
      status = 'warn';
    } else if (H >= 0.45) {
      meaning = 'Random walk. No clear directional bias — the market is "coin-flipping" right now.';
      implication = 'Hurst gate closed. No trend-follow entry. Stand by.';
      status = 'neutral';
    } else {
      meaning = 'Mean-reverting. Price is being pushed back to center — any trend is fighting against natural reversion forces.';
      implication = 'Fade mode only. Trend entries are likely traps here.';
      status = 'danger';
    }

    metrics.push({
      label: 'Hurst (H)',
      value: H.toFixed(3),
      meaning,
      implication,
      status,
      passing,
    });
  }

  // ── Efficiency Ratio ──
  {
    let meaning = '';
    let implication = '';
    let status: MetricMeaning['status'] = 'neutral';
    const passing = eff >= 2;

    if (eff >= 10) {
      meaning = 'Tsunami state — price is rocketing with almost zero order flow resistance. The book is empty on one side.';
      implication = 'Tsunami Market Order override eligible. Enter immediately if VPIN confirms.';
      status = 'danger';
    } else if (eff >= 7) {
      meaning = 'Extreme efficiency — institutional player is sweeping through a vacuum. Major move in progress.';
      implication = 'Climax-level event. High urgency. Trailing stop must be active.';
      status = 'danger';
    } else if (eff >= 2) {
      meaning = 'Iceberg detected. A hidden institutional order is absorbing flow — OFI force is disproportionately high vs actual price movement.';
      implication = 'Whale shadowing active. Price is being held — eventual breakout probable.';
      status = 'good';
    } else if (eff >= 1) {
      meaning = 'Normal market. Order flow and price movement are proportional — no hidden players detected.';
      implication = 'Efficiency gate closing. Market behaving normally.';
      status = 'warn';
    } else {
      meaning = 'Price moving more than flow justifies. Thin liquidity — small orders causing outsized movement.';
      implication = 'Slippage risk elevated. Use limit orders only.';
      status = 'neutral';
    }

    metrics.push({
      label: 'Efficiency (E=F/v)',
      value: `${eff.toFixed(1)}×`,
      meaning,
      implication,
      status,
      passing,
    });
  }

  // ── VPIN (Toxicity) ──
  {
    let meaning = '';
    let implication = '';
    let status: MetricMeaning['status'] = 'neutral';
    const passing = vpin >= 0.4;

    if (vpin >= 0.75) {
      meaning = 'Critically toxic flow. Informed traders (institutions) are dominating. Market makers are pulling bids — extreme informed order flow.';
      implication = 'DGE Limit-Order Decay triggered. Cancel all pending limits. Market order only.';
      status = 'danger';
    } else if (vpin >= 0.65) {
      meaning = 'High toxicity. Strong institutional participation — volume is being "won" by informed directional players.';
      implication = 'Tsunami override eligible. Flow is real and sustained.';
      status = 'good';
    } else if (vpin >= 0.4) {
      meaning = 'Meaningful informed flow. Institutional traders are participating — more order flow than usual is directionally motivated.';
      implication = 'VPIN gate open. Entry participation confirmed.';
      status = 'good';
    } else if (vpin >= 0.2) {
      meaning = 'Mixed flow. Both retail and institutional activity present — no clear winner yet.';
      implication = 'VPIN gate closed. Wait for institutional commitment to build.';
      status = 'warn';
    } else {
      meaning = 'Clean retail flow. No institutional toxicity — this is purely speculative retail order flow.';
      implication = 'No edge. Pure noise trading. Avoid.';
      status = 'neutral';
    }

    metrics.push({
      label: 'VPIN (Toxicity)',
      value: vpin.toFixed(3),
      meaning,
      implication,
      status,
      passing,
    });
  }

  // ── Z-OFI ──
  {
    const absZ = Math.abs(zOfi);
    let meaning = '';
    let implication = '';
    let status: MetricMeaning['status'] = 'neutral';
    const passing = absZ >= 1;
    const direction = zOfi > 0 ? 'BUY' : 'SELL';

    if (absZ >= 3) {
      meaning = `Extreme ${direction} order flow — ${absZ.toFixed(1)}σ above normal. A statistical outlier. This level of imbalance almost never occurs without institutional intent.`;
      implication = 'Highest-priority signal. Institutional force confirmed. Do not fade this.';
      status = 'danger';
    } else if (absZ >= 2) {
      meaning = `Strong ${direction} imbalance (${absZ.toFixed(1)}σ). Flow is heavily skewed — far more ${direction === 'BUY' ? 'aggressive buyers' : 'aggressive sellers'} than normal.`;
      implication = 'Z-OFI gate fully open. Directional flow is statistically significant.';
      status = 'good';
    } else if (absZ >= 1) {
      meaning = `Moderate ${direction} pressure (${absZ.toFixed(1)}σ). More than average flow imbalance — directional bias is present.`;
      implication = 'Gate passing. Flow tilted. Watch for Hurst and Efficiency to align.';
      status = 'good';
    } else {
      meaning = `Balanced flow (${absZ.toFixed(2)}σ). Buys and sells are roughly equal — no directional edge in order flow.`;
      implication = 'Z-OFI gate closed. Market is undecided. Wait.';
      status = 'neutral';
    }

    metrics.push({
      label: 'Z-OFI',
      value: `${zOfi >= 0 ? '+' : ''}${zOfi.toFixed(2)}σ`,
      meaning,
      implication,
      status,
      passing,
    });
  }

  // ── KM Drift ──
  {
    let meaning = '';
    let implication = '';
    let status: MetricMeaning['status'] = 'neutral';
    const passing = drift >= 0.12;

    if (drift >= 2) {
      meaning = 'Explosive velocity. Price is in free-fall or rocket mode — KM drift is at maximal acceleration. Order book physics are extreme.';
      implication = 'Tsunami or Flash Crash state. Risk is very high. Tight stops essential.';
      status = 'danger';
    } else if (drift >= 0.5) {
      meaning = 'Strong directional velocity. Price is moving fast with physical momentum backing it — not a wick, this is real movement.';
      implication = 'Drift confirms entry direction. Valid momentum continuation expected.';
      status = 'good';
    } else if (drift >= 0.12) {
      meaning = 'Detectable drift. Price has a physical lean — more likely to continue than reverse over the next few ticks.';
      implication = 'KM Drift validation passed. Minimum velocity threshold met.';
      status = 'good';
    } else {
      meaning = 'Near-zero drift. Price is essentially stationary from a physics perspective — no meaningful directional velocity.';
      implication = 'KM validation fails. No physical momentum to ride. Avoid.';
      status = 'neutral';
    }

    metrics.push({
      label: 'KM Drift',
      value: drift.toFixed(4),
      meaning,
      implication,
      status,
      passing,
    });
  }

  return metrics;
}

// ─── Market State Intelligence Brief ───────────────────────────────────────

interface IntelBrief {
  headline: string;
  situation: string;
  risk: string;
  watch: string;
  action: string;
}

function buildIntelBrief(pair: string, p: PairPhysics, state: TacticalState): IntelBrief {
  const H = p.hurst?.H ?? 0;
  const eff = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0;
  const zOfi = p.zOfi ?? 0;
  const wall = p.syntheticDepth?.find(l => !l.broken);
  const wallStr = wall ? `${wall.price.toFixed(5)}` : 'no wall detected';
  const biasFull = p.bias === 'BUY' ? 'bullish' : p.bias === 'SELL' ? 'bearish' : 'neutral';

  if (p.hiddenPlayer) {
    const hp = p.hiddenPlayer;
    if (hp.type === 'LIQUIDITY_HOLE') {
      return {
        headline: 'Liquidity Vacuum Active',
        situation: `The order book has a structural hole near ${wallStr}. Small orders are causing disproportionately large price movement (Efficiency ${eff.toFixed(1)}×) — there is no institutional wall absorbing flow.`,
        risk: 'Slippage is extreme. A market order here could gap through multiple price levels. The vacuum can be filled suddenly and violently.',
        watch: 'Watch for Efficiency to drop below 2× (book fills) or VPIN to spike above 0.65 (institutions rushing in to provide liquidity).',
        action: `${p.bias !== 'NEUTRAL' ? `${p.bias} bias present but ` : ''}Do NOT use market orders. Limit orders only. Avoid until book depth rebuilds.`,
      };
    }
    const side = hp.type === 'HIDDEN_LIMIT_SELLER' ? 'SELL' : 'BUY';
    const oppSide = side === 'SELL' ? 'selling' : 'buying';
    return {
      headline: `Institutional Whale Detected — Hidden ${side} Wall`,
      situation: `A large institution is quietly ${oppSide} using a hidden iceberg order near ${wallStr}. OFI force is ${Math.abs(zOfi).toFixed(2)}σ but price barely moves — their limit order is absorbing all flow (Efficiency ${eff.toFixed(1)}×, Hurst ${H.toFixed(3)}).`,
      risk: `When the whale is filled, price will break sharply ${side === 'SELL' ? 'downward' : 'upward'}. If you\'re on the wrong side when they finish, the stop-hunt will be violent.`,
      watch: `If Efficiency drops below 2× suddenly, the iceberg is consumed. If Z-OFI flips direction, the whale reversed. VPIN ${vpin.toFixed(3)} — ${vpin >= 0.65 ? 'extremely' : vpin >= 0.4 ? 'meaningfully' : 'mildly'} elevated toxicity.`,
      action: `Shadow the whale: draft a stop-limit 0.3 pips ${side === 'SELL' ? 'below' : 'above'} ${wallStr}. Enter in the direction of the eventual breakout when Hurst confirms (≥0.62).`,
    };
  }

  if (state === 'CLIMAX') {
    return {
      headline: 'Tsunami Event — Institutional Sweep in Progress',
      situation: `Price is accelerating through a near-empty order book (Efficiency ${eff.toFixed(1)}×). Informed flow is overwhelming (VPIN ${vpin.toFixed(3)}). This is an institutional sweep — a single large player is consuming all available liquidity on one side.`,
      risk: 'Momentum can reverse violently when the sweep exhausts itself. Do not chase. This is the most dangerous entry point.',
      watch: 'Watch for Efficiency to collapse (book refills). If VPIN starts dropping from peak, the sweep is ending. Z-OFI reversal will signal the dam.',
      action: 'If already in trade: Tsunami override eligible — move stop to breakeven immediately. If watching: Wait for momentum to exhaust before considering fade entry.',
    };
  }

  if (state === 'ACTIVE') {
    return {
      headline: 'All 4 Gates Aligned — Institutional Entry Zone',
      situation: `Every physics gate is confirmed: Hurst ${H.toFixed(3)} (persistent trend), Efficiency ${eff.toFixed(1)}× (iceberg flow), VPIN ${vpin.toFixed(3)} (informed participation), Z-OFI ${zOfi >= 0 ? '+' : ''}${zOfi.toFixed(2)}σ (${biasFull} imbalance). A ${biasFull} institutional flow event is in progress.`,
      risk: `Risk: Hurst dropping below 0.45 means momentum is dying — fatigue exit. Counter-direction Z-OFI spike (>${Math.abs(zOfi).toFixed(1)}σ opposite) means reversal.`,
      watch: `Primary watch: Efficiency (currently ${eff.toFixed(1)}×). If it drops to <2×, the iceberg is consumed and breakout imminent. Secondary: VPIN peak. Near ${wallStr}.`,
      action: 'Predatory Hunter entry eligible. Place stop-limit 0.3 pips beyond nearest wall. Rule of 3 consecutive tick confirmation required before fill.',
    };
  }

  if (state === 'STRIKE_READY') {
    const missing: string[] = [];
    if (H < 0.62) missing.push(`Hurst needs ${(0.62 - H).toFixed(3)} more (currently ${H.toFixed(3)})`);
    if (eff < 2) missing.push(`Efficiency needs ${(2 - eff).toFixed(1)}× more (currently ${eff.toFixed(1)}×)`);
    if (vpin < 0.4) missing.push(`VPIN needs ${(0.4 - vpin).toFixed(3)} more (currently ${vpin.toFixed(3)})`);
    if (Math.abs(zOfi) < 1) missing.push(`Z-OFI needs ${(1 - Math.abs(zOfi)).toFixed(2)}σ more (currently ${Math.abs(zOfi).toFixed(2)}σ)`);

    return {
      headline: 'Near-Alignment — Gates Partially Open',
      situation: `${4 - missing.length}/4 physics gates are open. The pair is building institutional momentum but has not yet reached full conviction. ${biasFull !== 'neutral' ? `Flow is tilted ${biasFull}.` : 'Flow is balanced.'}`,
      risk: 'Do not enter early. Partial gate alignment means the signal is not confirmed. Premature entry is the most common failure mode.',
      watch: missing.length > 0 ? `Watching for: ${missing.join('; ')}.` : 'Virtually all gates open — final confirmation tick imminent.',
      action: 'Stand by. Set alerts on Hurst ≥0.62 and Z-OFI ≥1.0. Do not enter until all 4 gates flip green simultaneously.',
    };
  }

  if (state === 'FATIGUE') {
    return {
      headline: 'Momentum Collapse — Do Not Trade',
      situation: `Hurst has dropped to ${H.toFixed(3)} — below the 0.45 threshold. The market is mean-reverting. Any trend that existed is now actively being reversed by the physics of the order book. Price will oscillate, not trend.`,
      risk: 'Trading in this state means fighting the market\'s natural tendency to revert. Stop-losses will be hit repeatedly. Trend-following strategies will lose money here.',
      watch: 'Wait for Hurst to rebuild above 0.55 (Strike Ready) or 0.62 (Active). This typically takes 30-90 minutes of consolidation.',
      action: 'Exit any open positions if Hurst is falling. Close trend-follow trades. Consider mean-reversion fades only with tight stops.',
    };
  }

  return {
    headline: 'Passive Scan — No Signal',
    situation: `Market is being monitored but no institutional signal detected. Hurst ${H.toFixed(3)} (${p.hurst?.regime?.replace('_', ' ') ?? 'random'}), VPIN ${vpin.toFixed(3)} (retail flow), Z-OFI ${Math.abs(zOfi).toFixed(2)}σ (balanced). ${biasFull !== 'neutral' ? `Mild ${biasFull} lean.` : ''}`,
    risk: 'No current edge. The market is in a noise phase — any pattern visible is likely random.',
    watch: 'Watching for Z-OFI to cross 1.0σ, Hurst to climb past 0.55, and VPIN to cross 0.4 simultaneously.',
    action: 'No action. This pair is in queue. The system is sampling every tick and will escalate automatically when gates align.',
  };
}

// ─── Lead Indicator ─────────────────────────────────────────────────────────

function getLeadIndicator(p: PairPhysics): string {
  if (p.hiddenPlayer?.type === 'LIQUIDITY_HOLE') return 'VACUUM HUNTING';
  if (p.hiddenPlayer) return 'WHALE SHADOWING';
  if (p.marketState === 'ABSORBING') return 'ICEBERG WATCH';
  if (p.marketState === 'SLIPPING') return 'SLIPPAGE ALERT';
  if (p.efficiency >= 7) return 'TSUNAMI IMMINENT';
  if (p.hurst?.regime === 'PERSISTENT') return 'TREND LOCK';
  if (p.hurst?.regime === 'MEAN_REVERTING') return 'FADE MODE';
  return 'SCANNING FLOW';
}

// ─── Lightning SVG ──────────────────────────────────────────────────────────

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

function MetricRow({ m, index }: { m: MetricMeaning; index: number }) {
  const [open, setOpen] = React.useState(false);

  const statusColors = {
    good:    { bar: 'bg-green-500',  text: 'text-green-400',  badge: 'bg-green-500/15 border-green-500/30 text-green-400' },
    warn:    { bar: 'bg-amber-500',  text: 'text-amber-400',  badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
    danger:  { bar: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/15 border-red-500/30 text-red-400' },
    neutral: { bar: 'bg-muted-foreground/40', text: 'text-muted-foreground', badge: 'bg-muted/20 border-border/30 text-muted-foreground' },
  }[m.status];

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            m.passing ? 'bg-green-500' : 'bg-muted/40 border border-border/50'
          )} />
          <span className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors truncate">
            {m.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-[10px] font-mono font-bold', statusColors.text)}>{m.value}</span>
          <ChevronRight className={cn('w-3 h-3 text-muted-foreground/50 transition-transform', open && 'rotate-90')} />
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted/20 rounded-full overflow-hidden ml-3.5">
        <div
          className={cn('h-full rounded-full transition-all duration-700', statusColors.bar)}
          style={{ width: m.passing ? '100%' : '35%' }}
        />
      </div>

      {/* Expandable meaning */}
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="ml-3.5 space-y-1.5 pt-1"
        >
          <div className={cn('text-[9px] font-mono leading-relaxed rounded px-2 py-1.5 border', statusColors.badge)}>
            {m.meaning}
          </div>
          <div className="flex items-start gap-1.5">
            <ChevronRight className="w-2.5 h-2.5 text-primary flex-shrink-0 mt-0.5" />
            <span className="text-[8px] font-mono text-primary leading-relaxed">{m.implication}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Intelligence Brief Panel ────────────────────────────────────────────────

function IntelBriefPanel({ brief, stateMeta }: { brief: IntelBrief; stateMeta: { color: string; bg: string } }) {
  const sections = [
    { icon: Brain,         label: 'Situation',  text: brief.situation,  textColor: 'text-foreground' },
    { icon: AlertTriangle, label: 'Risk',       text: brief.risk,       textColor: 'text-amber-400' },
    { icon: Eye,           label: 'Watch For',  text: brief.watch,      textColor: 'text-muted-foreground' },
    { icon: Target,        label: 'Action',     text: brief.action,     textColor: 'text-primary' },
  ];

  return (
    <div className={cn('rounded-lg border space-y-0 overflow-hidden', stateMeta.bg)}>
      <div className={cn('px-2.5 py-1.5 border-b border-border/20 flex items-center gap-1.5', stateMeta.bg)}>
        <Radio className={cn('w-2.5 h-2.5 flex-shrink-0', stateMeta.color)} />
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Intelligence Brief</span>
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

// ─── Tactical Unit Card ──────────────────────────────────────────────────────

import React, { useState } from 'react';

function TacticalUnit({ pair, data, activeTrade }: { pair: string; data: PairPhysics; activeTrade?: { direction: string; created_at: string } | null }) {
  const p = data;
  const state = deriveTacticalState(p);
  const pulseSpeed = getPulseSpeed(p.zOfi ?? 0);
  const [showBrief, setShowBrief] = useState(false);

  const tacticalClass = {
    CLIMAX:       'tactical-climax',
    ACTIVE:       'tactical-active',
    STRIKE_READY: '', // no pulse — not yet a real signal
    FATIGUE:      'tactical-fatigue',
    SCANNING:     '',
  }[state];

  const stateMeta = {
    CLIMAX:       { label: 'CLIMAX',         color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    ACTIVE:       { label: 'ACTIVE TRADE',   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    STRIKE_READY: { label: 'WARMING UP',     color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
    FATIGUE:      { label: 'FATIGUE',        color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800/40' },
    SCANNING:     { label: 'SCANNING',       color: 'text-muted-foreground', bg: 'bg-muted/20 border-border/20' },
  }[state];

  const leadIndicator = getLeadIndicator(p);
  const metrics = interpretMetrics(p);
  const brief = buildIntelBrief(pair, p, state);

  const gatesPassed = metrics.slice(0, 4).filter(m => m.passing).length;
  const biasColor = p.bias === 'BUY' ? 'text-green-400' : p.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const BiasIcon = p.bias === 'BUY' ? ArrowUp : p.bias === 'SELL' ? ArrowDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative rounded-xl border-2 bg-card/70 backdrop-blur-sm space-y-0 transition-colors overflow-hidden',
        tacticalClass,
        state === 'SCANNING' && 'border-border/30'
      )}
      style={{ '--pulse-speed': pulseSpeed } as React.CSSProperties}
    >
      {(state === 'ACTIVE' || state === 'CLIMAX') && <LightningSVG speed={pulseSpeed} />}

      {/* ── Active Trade Banner ── */}
      {activeTrade && (
        <div className={cn(
          'flex items-center justify-between px-3 py-1.5 text-[9px] font-mono font-bold tracking-widest uppercase border-b',
          activeTrade.direction === 'long'
            ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : 'bg-red-500/20 text-red-300 border-red-500/30'
        )}>
          <span>⚡ TUNNEL ACTIVE — {activeTrade.direction.toUpperCase()}</span>
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

        <div className="flex items-center justify-between">
          <span className={cn('text-[11px] font-mono font-bold tracking-widest uppercase', stateMeta.color)}>
            {leadIndicator}
          </span>
          <div className="flex items-center gap-1.5">
            <BiasIcon className={cn('w-3 h-3', biasColor)} />
            <span className={cn('text-[10px] font-mono font-bold', biasColor)}>{p.bias}</span>
            {p.hiddenPlayer && (
              p.hiddenPlayer.type === 'LIQUIDITY_HOLE' ? (
                <Badge className="text-[7px] gap-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5">⚡ LIQ HOLE</Badge>
              ) : (
                <Badge variant="destructive" className="text-[7px] gap-0.5 px-1.5">
                  🐋 {p.hiddenPlayer.type === 'HIDDEN_LIMIT_SELLER' ? 'LIMIT SELL' : 'LIMIT BUY'}
                </Badge>
              )
            )}
          </div>
        </div>

        {/* Gate dots */}
        <div className="flex items-center gap-1.5">
          {metrics.slice(0, 4).map((m, i) => (
            <div key={i} className="flex items-center gap-0.5">
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                m.passing ? 'bg-green-500' : 'bg-muted/40 border border-border/40'
              )} />
            </div>
          ))}
          <span className="text-[8px] font-mono text-muted-foreground ml-0.5">{gatesPassed}/4 gates</span>
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

      {/* ── Metric Rows (expandable) ── */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Physics Metrics</span>
          <span className="text-[8px] font-mono text-primary cursor-default">tap to interpret ↓</span>
        </div>
        {metrics.map((m, i) => <MetricRow key={m.label} m={m} index={i} />)}
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
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="px-4 pb-4"
        >
          <IntelBriefPanel brief={brief} stateMeta={stateMeta} />
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Sovereign Entry Protocol HUD ───────────────────────────────────────────

function SovereignProtocolHUD() {
  const rows = [
    {
      gates: '4/4',
      pulse: true,
      state: 'Active Pulse',
      regime: 'Tsunami / Vacuum Strike',
      action: 'ENTER / HOLD',
      actionColor: 'text-green-400 bg-green-500/10 border-green-500/30',
      gateColor: 'text-yellow-300',
      desc: 'Physics are leading.',
    },
    {
      gates: '3/4',
      pulse: false,
      state: 'Decay Phase',
      regime: 'Absorption / Random Walk',
      action: 'EXIT',
      actionColor: 'text-red-400 bg-red-500/10 border-red-500/30',
      gateColor: 'text-amber-400',
      desc: 'Edge has evaporated.',
    },
    {
      gates: '1/4',
      pulse: false,
      state: 'Fade Mode',
      regime: 'Momentum Collapse',
      action: 'AVOID',
      actionColor: 'text-muted-foreground bg-muted/10 border-border/30',
      gateColor: 'text-red-400',
      desc: 'Retail noise dominance.',
    },
  ];

  const gates = [
    { id: 'H', label: 'Hurst', threshold: '≥ 0.62', desc: 'Persistent trend' },
    { id: 'E', label: 'Efficiency', threshold: '≥ 2.0×', desc: 'Iceberg / Vacuum' },
    { id: 'V', label: 'VPIN', threshold: '≥ 0.40', desc: 'Informed flow' },
    { id: 'Z', label: 'Z-OFI', threshold: '|Z| ≥ 1.0σ', desc: 'Directional intent' },
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
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-yellow-300">Sovereign Barrage Protocol</span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground">Direction: Z-OFI &gt; 0 = LONG · Z-OFI &lt; 0 = SHORT</span>
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Gate Alignment Table */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Gate State → Action</span>
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.gates} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 bg-card/40 border border-border/30">
                <div className="flex items-center gap-1.5 w-10 flex-shrink-0">
                  <span className={`text-[11px] font-mono font-black ${row.gateColor}`}>{row.gates}</span>
                  {row.pulse && <Zap className="w-2.5 h-2.5 text-yellow-400 animate-pulse" />}
                </div>
                <span className="text-[8px] font-mono text-muted-foreground w-28 flex-shrink-0">{row.state}</span>
                <span className="text-[8px] font-mono text-muted-foreground flex-1 hidden md:block">{row.regime}</span>
                <div className={`flex items-center px-2 py-0.5 rounded border text-[8px] font-mono font-bold flex-shrink-0 ${row.actionColor}`}>
                  {row.action}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 Gate Requirements */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">4/4 Gate Requirements</span>
          <div className="grid grid-cols-2 gap-1">
            {gates.map((g) => (
              <div key={g.id} className="flex items-start gap-2 rounded-md px-2.5 py-1.5 bg-card/40 border border-border/30">
                <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[7px] font-mono font-black text-green-400">{g.id}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-bold text-foreground">{g.label}</span>
                    <span className="text-[8px] font-mono text-yellow-300 font-bold">{g.threshold}</span>
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground">{g.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md px-2.5 py-1.5 bg-amber-500/5 border border-amber-500/20 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-[8px] font-mono text-amber-300">Exit the <strong>exact second</strong> the dashboard drops to 3/4 — the yellow pulse extinguishes.</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Gate Pipeline Banner ────────────────────────────────────────────────────

function GatePipeline({ gates }: { gates: string[] }) {
  const gateColors = [
    'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bg-green-500/20 text-green-400 border-green-500/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'bg-red-500/20 text-red-400 border-red-500/30',
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

  const activePairs   = pairs.filter(([, d]) => (d as any).ticksAnalyzed > 10);
  const hiddenAlerts  = pairs.filter(([, d]) => (d as any).hiddenPlayer);
  const absorbingCount = pairs.filter(([, d]) => (d as any).marketState === 'ABSORBING').length;
  const slippingCount  = pairs.filter(([, d]) => (d as any).marketState === 'SLIPPING').length;
  const liquidCount    = pairs.filter(([, d]) => (d as any).marketState === 'LIQUID').length;
  const activeCount    = activePairs.filter(([, d]) => {
    const s = deriveTacticalState(d as PairPhysics);
    return s === 'ACTIVE' || s === 'CLIMAX';
  }).length;

  const ageMs  = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
  const ageSec = ageMs ? Math.round(ageMs / 1000) : null;
  const isStale = ageSec != null && ageSec > 120;

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
            Predatory Hunter v2.0 — Tap any metric to decode its meaning
          </p>
        </motion.div>

        {/* Sovereign Protocol HUD */}
        <SovereignProtocolHUD />

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
              { label: 'Units Tracked',  value: activePairs.length,  icon: Activity,   color: undefined },
              { label: 'Active/Climax',  value: activeCount,          icon: Zap,        color: 'text-yellow-400' },
              { label: 'Liquid',         value: liquidCount,           icon: TrendingUp, color: 'text-green-400' },
              { label: 'Absorbing',      value: absorbingCount,        icon: Shield,     color: 'text-amber-400' },
              { label: 'Slipping',       value: slippingCount,         icon: Waves,      color: 'text-red-400' },
              { label: 'Whale Alerts',   value: hiddenAlerts.length,   icon: Eye,        color: hiddenAlerts.length > 0 ? 'text-orange-400' : 'text-muted-foreground' },
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
            <p className="text-sm font-mono">Initialising Tactical War Room...</p>
          </div>
        )}

        {!loading && activePairs.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activePairs.map(([pair, data]) => {
                const normalizedPair = pair.replace('/', '_');
                const trade = activeTrades.find(t => t.currency_pair === normalizedPair || t.currency_pair === pair) || null;
                return <TacticalUnit key={pair} pair={pair} data={data as PairPhysics} activeTrade={trade} />;
              })}
            </div>
          </motion.div>
        )}

        {!loading && activePairs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tactical data available yet.</p>
            <p className="text-xs mt-1 font-mono">The ripple-stream engine populates this when the market is open.</p>
          </div>
        )}

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
