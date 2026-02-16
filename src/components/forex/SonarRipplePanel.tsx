// Sonar Ripple Dashboard — Lead-Lag Correlation, Price Ripple Rings, Correlation Matrix
// Visualizes active ripple triggers and live trade correlation data

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Radio, Crosshair, Zap, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RealOrder } from '@/hooks/useOandaPerformance';

// ─── Types ───────────────────────────────────────────────

interface RippleTrigger {
  triggerId: string;
  loudPair: string;
  quietPair: string;
  direction: string;
  thresholdPips: number;
  units: number;
  loudBaseline: number | null;
  quietBaseline: number | null;
  armedAt: string;
  fired: boolean;
  reason: string;
  slPips: number;
  tpPips: number;
}

interface SonarRipplePanelProps {
  openPositions: RealOrder[];
}

// Major currency groups for the correlation matrix
const CURRENCIES = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

const CORRELATION_MAP: Record<string, Record<string, number>> = {
  EUR: { EUR: 1, GBP: 0.87, USD: -0.83, JPY: 0.42, AUD: 0.62, NZD: 0.58, CAD: -0.48, CHF: 0.91 },
  GBP: { EUR: 0.87, GBP: 1, USD: -0.76, JPY: 0.38, AUD: 0.55, NZD: 0.51, CAD: -0.42, CHF: 0.72 },
  USD: { EUR: -0.83, GBP: -0.76, USD: 1, JPY: -0.31, AUD: -0.71, NZD: -0.65, CAD: 0.62, CHF: -0.78 },
  JPY: { EUR: 0.42, GBP: 0.38, USD: -0.31, JPY: 1, AUD: 0.28, NZD: 0.25, CAD: -0.22, CHF: 0.55 },
  AUD: { EUR: 0.62, GBP: 0.55, USD: -0.71, JPY: 0.28, AUD: 1, NZD: 0.92, CAD: -0.35, CHF: 0.48 },
  NZD: { EUR: 0.58, GBP: 0.51, USD: -0.65, JPY: 0.25, AUD: 0.92, NZD: 1, CAD: -0.31, CHF: 0.44 },
  CAD: { EUR: -0.48, GBP: -0.42, USD: 0.62, JPY: -0.22, AUD: -0.35, NZD: -0.31, CAD: 1, CHF: -0.41 },
  CHF: { EUR: 0.91, GBP: 0.72, USD: -0.78, JPY: 0.55, AUD: 0.48, NZD: 0.44, CAD: -0.41, CHF: 1 },
};

// ─── Sonar Ring Animation ────────────────────────────────

function SonarRings({ triggers, openPositions }: { triggers: RippleTrigger[]; openPositions: RealOrder[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Get involved pairs for highlighting
  const activePairs = useMemo(() => {
    const pairs = new Set<string>();
    openPositions.forEach(o => pairs.add(o.currency_pair.replace('_', '/')));
    triggers.forEach(t => {
      pairs.add(t.loudPair.replace('_', '/'));
      pairs.add(t.quietPair.replace('_', '/'));
    });
    return pairs;
  }, [triggers, openPositions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxR = Math.min(cx, cy) - 20;
    let tick = 0;

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      tick += 0.5;

      // Background grid rings
      for (let i = 1; i <= 4; i++) {
        const r = (maxR / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(var(--border), 0.15)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Cross lines
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.strokeStyle = `hsla(var(--border), 0.1)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Sonar sweep line
      const sweepAngle = (tick * 0.02) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      const sweepGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      sweepGrad.addColorStop(0, 'rgba(34, 197, 94, 0.6)');
      sweepGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');
      ctx.strokeStyle = sweepGrad;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Sweep fade trail
      for (let trail = 1; trail <= 8; trail++) {
        const trailAngle = sweepAngle - trail * 0.04;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(trailAngle) * maxR, cy + Math.sin(trailAngle) * maxR);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.08 - trail * 0.01})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Plot currency nodes around the circle
      CURRENCIES.forEach((ccy, i) => {
        const angle = (Math.PI * 2 / CURRENCIES.length) * i - Math.PI / 2;
        const r = maxR * 0.85;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        // Check if involved in active trades
        const isActive = Array.from(activePairs).some(p => p.includes(ccy));

        // Blip glow
        if (isActive) {
          const pulseR = 8 + Math.sin(tick * 0.08 + i) * 3;
          ctx.beginPath();
          ctx.arc(x, y, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
          ctx.fill();
        }

        // Node dot
        ctx.beginPath();
        ctx.arc(x, y, isActive ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#22c55e' : 'rgba(148, 163, 184, 0.4)';
        ctx.fill();

        // Label
        ctx.font = `${isActive ? 'bold ' : ''}10px monospace`;
        ctx.fillStyle = isActive ? '#22c55e' : 'rgba(148, 163, 184, 0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelR = maxR * 0.97;
        ctx.fillText(ccy, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
      });

      // Draw ripple waves from loud pairs outward
      triggers.forEach((t, ti) => {
        const loudCcy = t.loudPair.split('_')[0];
        const loudIdx = CURRENCIES.indexOf(loudCcy);
        if (loudIdx === -1) return;

        const angle = (Math.PI * 2 / CURRENCIES.length) * loudIdx - Math.PI / 2;
        const sx = cx + Math.cos(angle) * maxR * 0.85;
        const sy = cy + Math.sin(angle) * maxR * 0.85;

        // Expanding ripple rings from loud pair
        for (let wave = 0; wave < 3; wave++) {
          const waveR = ((tick * 0.8 + wave * 30 + ti * 40) % 100) * 0.6;
          const alpha = Math.max(0, 0.4 - waveR / 100);
          ctx.beginPath();
          ctx.arc(sx, sy, waveR, 0, Math.PI * 2);
          ctx.strokeStyle = t.fired ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Connection line from loud to quiet
        const quietCcy = t.quietPair.split('_')[0];
        const quietIdx = CURRENCIES.indexOf(quietCcy);
        if (quietIdx === -1) return;

        const qAngle = (Math.PI * 2 / CURRENCIES.length) * quietIdx - Math.PI / 2;
        const qx = cx + Math.cos(qAngle) * maxR * 0.85;
        const qy = cy + Math.sin(qAngle) * maxR * 0.85;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(qx, qy);
        ctx.strokeStyle = t.fired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated particle along the line
        const progress = ((tick * 0.01 + ti * 0.3) % 1);
        const px = sx + (qx - sx) * progress;
        const py = sy + (qy - sy) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = t.fired ? '#ef4444' : '#22c55e';
        ctx.fill();
      });

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [triggers, activePairs]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ─── Correlation Matrix Heatmap ──────────────────────────

function CorrelationMatrix({ activeCurrencies }: { activeCurrencies: Set<string> }) {
  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex gap-0.5 pl-7">
        {CURRENCIES.map(c => (
          <div key={c} className={cn(
            "w-7 h-5 flex items-center justify-center text-[7px] font-mono font-bold",
            activeCurrencies.has(c) ? "text-primary" : "text-muted-foreground/60"
          )}>{c}</div>
        ))}
      </div>
      {/* Matrix rows */}
      {CURRENCIES.map(row => (
        <div key={row} className="flex gap-0.5 items-center">
          <span className={cn(
            "w-7 text-[7px] font-mono font-bold text-right pr-1",
            activeCurrencies.has(row) ? "text-primary" : "text-muted-foreground/60"
          )}>{row}</span>
          {CURRENCIES.map(col => {
            const val = CORRELATION_MAP[row]?.[col] ?? 0;
            const isActive = activeCurrencies.has(row) && activeCurrencies.has(col);
            const abs = Math.abs(val);
            return (
              <div
                key={col}
                className={cn(
                  "w-7 h-6 rounded-sm flex items-center justify-center text-[7px] font-mono font-medium transition-all",
                  row === col
                    ? "bg-muted/30 text-muted-foreground/40"
                    : isActive
                    ? val > 0
                      ? "text-emerald-300"
                      : "text-red-300"
                    : "text-muted-foreground/30"
                )}
                style={{
                  backgroundColor: row === col
                    ? undefined
                    : isActive
                    ? val > 0
                      ? `rgba(34, 197, 94, ${abs * 0.25})`
                      : `rgba(239, 68, 68, ${abs * 0.25})`
                    : `rgba(148, 163, 184, ${abs * 0.06})`,
                }}
              >
                {row === col ? '—' : val.toFixed(1)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Trigger Card ────────────────────────────────────────

function TriggerCard({ trigger }: { trigger: RippleTrigger }) {
  const timeSinceArmed = useMemo(() => {
    const ms = Date.now() - new Date(trigger.armedAt).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }, [trigger.armedAt]);

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-mono font-bold text-foreground">
            {trigger.loudPair.replace('_', '/')} → {trigger.quietPair.replace('_', '/')}
          </span>
          <Badge variant="outline" className={cn(
            "text-[8px] px-1 py-0",
            trigger.direction === 'long'
              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
              : "border-red-500/30 text-red-400 bg-red-500/10"
          )}>
            {trigger.direction.toUpperCase()}
          </Badge>
        </div>
        <span className="text-[8px] text-muted-foreground">{timeSinceArmed}</span>
      </div>

      {/* Divergence bar */}
      <div className="flex items-center gap-2">
        <span className="text-[8px] text-muted-foreground w-12">Threshold</span>
        <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
            initial={{ width: 0 }}
            animate={{ width: '65%' }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[8px] font-mono text-primary">{trigger.thresholdPips}p</span>
      </div>

      <div className="flex items-center gap-3 text-[8px] text-muted-foreground">
        <span>Units: <span className="text-foreground font-mono">{trigger.units}</span></span>
        <span>SL: <span className="text-red-400 font-mono">{trigger.slPips}p</span></span>
        <span>TP: <span className="text-emerald-400 font-mono">{trigger.tpPips}p</span></span>
      </div>

      <p className="text-[8px] text-muted-foreground/80 leading-relaxed">{trigger.reason}</p>
    </div>
  );
}

// ─── Main Sonar Panel ────────────────────────────────────

export function SonarRipplePanel({ openPositions }: SonarRipplePanelProps) {
  const [triggers, setTriggers] = useState<RippleTrigger[]>([]);

  useEffect(() => {
    const fetchTriggers = async () => {
      const { data } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, pair, created_at, revoked')
        .ilike('gate_id', 'CORRELATION_TRIGGER%')
        .eq('revoked', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        const parsed: RippleTrigger[] = data.map(d => {
          try {
            const p = JSON.parse(d.reason);
            return {
              triggerId: p.triggerId || d.gate_id,
              loudPair: p.loudPair || '',
              quietPair: p.quietPair || d.pair || '',
              direction: p.direction || 'long',
              thresholdPips: p.thresholdPips || 5,
              units: p.units || 500,
              loudBaseline: p.loudBaseline,
              quietBaseline: p.quietBaseline,
              armedAt: p.armedAt || d.created_at,
              fired: p.fired || false,
              reason: p.reason || '',
              slPips: p.slPips || 12,
              tpPips: p.tpPips || 25,
            };
          } catch {
            return null;
          }
        }).filter(Boolean) as RippleTrigger[];
        setTriggers(parsed);
      }
    };

    fetchTriggers();
    const interval = setInterval(fetchTriggers, 15000);
    return () => clearInterval(interval);
  }, []);

  // Extract active currencies from open trades and triggers
  const activeCurrencies = useMemo(() => {
    const set = new Set<string>();
    openPositions.forEach(o => {
      const [base, quote] = o.currency_pair.split('_');
      set.add(base);
      set.add(quote);
    });
    triggers.forEach(t => {
      const [lb] = t.loudPair.split('_');
      const [qb] = t.quietPair.split('_');
      set.add(lb);
      set.add(qb);
    });
    return set;
  }, [openPositions, triggers]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 bg-muted/20">
        <Radio className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">Sonar — Ripple Intelligence</span>
        <Badge variant="outline" className="ml-auto text-[8px] font-mono border-primary/30 text-primary">
          {triggers.length} ARMED · {openPositions.length} LIVE
        </Badge>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/20">
        {/* Left: Sonar ring visualization */}
        <div className="p-3 flex flex-col">
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Price Ripple Propagation</span>
          <div className="aspect-square max-h-[220px] w-full mx-auto">
            <SonarRings triggers={triggers} openPositions={openPositions} />
          </div>
        </div>

        {/* Center: Active triggers / lead-lag cards */}
        <div className="p-3 flex flex-col">
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Lead-Lag Triggers</span>
          <div className="space-y-2 flex-1">
            {triggers.length === 0 && (
              <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/50">
                No armed triggers
              </div>
            )}
            <AnimatePresence>
              {triggers.slice(0, 4).map(t => (
                <motion.div
                  key={t.triggerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <TriggerCard trigger={t} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Correlation matrix heatmap */}
        <div className="p-3 flex flex-col">
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-2">8-CCY Correlation Matrix</span>
          <CorrelationMatrix activeCurrencies={activeCurrencies} />
        </div>
      </div>
    </motion.div>
  );
}
