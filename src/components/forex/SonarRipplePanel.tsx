// Sonar Ripple Dashboard — Lead-Lag Correlation, Price Ripple Rings, Stream Engine Status
// Redesigned for maximum visual impact and clarity

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Radio, Crosshair, Zap, Target, Activity, Wifi, Clock, ArrowRight } from 'lucide-react';
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

interface StreamFire {
  pair: string;
  direction: string;
  tickNumber: number;
  streamLatencyMs: number;
  firedAt: string;
}

interface SonarRipplePanelProps {
  openPositions: RealOrder[];
}

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

// ─── Sonar Ring Animation (enhanced) ─────────────────────

function SonarRings({ triggers, openPositions }: { triggers: RippleTrigger[]; openPositions: RealOrder[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

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
    const maxR = Math.min(cx, cy) - 24;
    let tick = 0;

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      tick += 0.5;

      // Background glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2);
      bgGrad.addColorStop(0, 'rgba(34, 197, 94, 0.03)');
      bgGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.01)');
      bgGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Grid rings with subtle glow
      for (let i = 1; i <= 4; i++) {
        const r = (maxR / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = i === 4 ? 1 : 0.5;
        ctx.stroke();
      }

      // Cross lines
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Sonar sweep with enhanced glow
      const sweepAngle = (tick * 0.018) % (Math.PI * 2);
      
      // Sweep cone (wider, more dramatic)
      for (let trail = 0; trail <= 20; trail++) {
        const trailAngle = sweepAngle - trail * 0.015;
        const alpha = 0.25 - trail * 0.012;
        if (alpha <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(trailAngle) * maxR, cy + Math.sin(trailAngle) * maxR);
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = trail === 0 ? 2 : 1;
        ctx.stroke();
      }

      // Plot currency nodes
      CURRENCIES.forEach((ccy, i) => {
        const angle = (Math.PI * 2 / CURRENCIES.length) * i - Math.PI / 2;
        const r = maxR * 0.82;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const isActive = Array.from(activePairs).some(p => p.includes(ccy));

        // Outer glow for active
        if (isActive) {
          const glowR = 12 + Math.sin(tick * 0.06 + i) * 4;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          glow.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
          glow.addColorStop(1, 'rgba(34, 197, 94, 0)');
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Node dot
        ctx.beginPath();
        ctx.arc(x, y, isActive ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#22c55e' : 'rgba(148, 163, 184, 0.35)';
        ctx.fill();
        if (isActive) {
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Label
        ctx.font = `${isActive ? 'bold 11px' : '10px'} monospace`;
        ctx.fillStyle = isActive ? '#4ade80' : 'rgba(148, 163, 184, 0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelR = maxR * 0.97;
        ctx.fillText(ccy, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
      });

      // Ripple waves and connections
      triggers.forEach((t, ti) => {
        const loudCcy = t.loudPair.split('_')[0];
        const loudIdx = CURRENCIES.indexOf(loudCcy);
        if (loudIdx === -1) return;

        const angle = (Math.PI * 2 / CURRENCIES.length) * loudIdx - Math.PI / 2;
        const sx = cx + Math.cos(angle) * maxR * 0.82;
        const sy = cy + Math.sin(angle) * maxR * 0.82;

        // Expanding ripple rings
        for (let wave = 0; wave < 4; wave++) {
          const waveR = ((tick * 0.7 + wave * 25 + ti * 35) % 80) * 0.8;
          const alpha = Math.max(0, 0.35 - waveR / 80);
          ctx.beginPath();
          ctx.arc(sx, sy, waveR, 0, Math.PI * 2);
          ctx.strokeStyle = t.fired ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Connection to quiet pair
        const quietCcy = t.quietPair.split('_')[0];
        const quietIdx = CURRENCIES.indexOf(quietCcy);
        if (quietIdx === -1) return;

        const qAngle = (Math.PI * 2 / CURRENCIES.length) * quietIdx - Math.PI / 2;
        const qx = cx + Math.cos(qAngle) * maxR * 0.82;
        const qy = cy + Math.sin(qAngle) * maxR * 0.82;

        // Glowing connection line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(qx, qy);
        const lineGrad = ctx.createLinearGradient(sx, sy, qx, qy);
        const lineColor = t.fired ? '239, 68, 68' : '34, 197, 94';
        lineGrad.addColorStop(0, `rgba(${lineColor}, 0.4)`);
        lineGrad.addColorStop(0.5, `rgba(${lineColor}, 0.15)`);
        lineGrad.addColorStop(1, `rgba(${lineColor}, 0.4)`);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated particle
        const progress = ((tick * 0.012 + ti * 0.3) % 1);
        const px = sx + (qx - sx) * progress;
        const py = sy + (qy - sy) * progress;
        
        const particleGlow = ctx.createRadialGradient(px, py, 0, px, py, 8);
        particleGlow.addColorStop(0, t.fired ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)');
        particleGlow.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = particleGlow;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = t.fired ? '#ef4444' : '#22c55e';
        ctx.fill();
      });

      // Center pulse
      const centerPulse = 4 + Math.sin(tick * 0.05) * 1.5;
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerPulse * 3);
      centerGlow.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
      centerGlow.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, centerPulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = centerGlow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, centerPulse, 0, Math.PI * 2);
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

// ─── Correlation Matrix Heatmap (enhanced) ───────────────

function CorrelationMatrix({ activeCurrencies }: { activeCurrencies: Set<string> }) {
  return (
    <div className="space-y-0.5">
      {/* Header row */}
      <div className="flex gap-[2px] pl-8">
        {CURRENCIES.map(c => (
          <div key={c} className={cn(
            "w-8 h-5 flex items-center justify-center text-[8px] font-mono font-bold rounded-t-sm",
            activeCurrencies.has(c) ? "text-primary bg-primary/5" : "text-muted-foreground/50"
          )}>{c}</div>
        ))}
      </div>
      {/* Matrix rows */}
      {CURRENCIES.map(row => (
        <div key={row} className="flex gap-[2px] items-center">
          <span className={cn(
            "w-8 text-[8px] font-mono font-bold text-right pr-1.5",
            activeCurrencies.has(row) ? "text-primary" : "text-muted-foreground/50"
          )}>{row}</span>
          {CURRENCIES.map(col => {
            const val = CORRELATION_MAP[row]?.[col] ?? 0;
            const isActive = activeCurrencies.has(row) && activeCurrencies.has(col);
            const abs = Math.abs(val);
            const isDiagonal = row === col;
            return (
              <motion.div
                key={col}
                whileHover={{ scale: 1.15 }}
                className={cn(
                  "w-8 h-7 rounded-[3px] flex items-center justify-center text-[8px] font-mono font-semibold transition-all cursor-default",
                  isDiagonal ? "bg-muted/20 text-muted-foreground/30" : ""
                )}
                style={{
                  backgroundColor: isDiagonal
                    ? undefined
                    : isActive
                    ? val > 0
                      ? `rgba(34, 197, 94, ${abs * 0.3})`
                      : `rgba(239, 68, 68, ${abs * 0.3})`
                    : `rgba(148, 163, 184, ${abs * 0.05})`,
                  color: isDiagonal
                    ? undefined
                    : isActive
                    ? val > 0 ? '#4ade80' : '#f87171'
                    : 'rgba(148, 163, 184, 0.3)',
                  boxShadow: isActive && !isDiagonal && abs > 0.7
                    ? val > 0
                      ? '0 0 8px rgba(34, 197, 94, 0.15)'
                      : '0 0 8px rgba(239, 68, 68, 0.15)'
                    : undefined,
                }}
              >
                {isDiagonal ? '—' : val.toFixed(1)}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Stream Engine Status Bar ────────────────────────────

function StreamEngineStatus({ recentFires }: { recentFires: StreamFire[] }) {
  const [pulse, setPulse] = useState(true);
  
  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10">
      {/* Live indicator */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <div className={cn(
            "w-2 h-2 rounded-full bg-emerald-400 transition-all duration-700",
            pulse ? "opacity-100 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "opacity-60"
          )} />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
        </div>
        <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider">STREAM LIVE</span>
      </div>
      
      <div className="w-px h-3 bg-emerald-500/20" />
      
      {/* Engine info */}
      <div className="flex items-center gap-1">
        <Wifi className="w-3 h-3 text-emerald-400/70" />
        <span className="text-[8px] text-emerald-300/70 font-mono">OANDA WebSocket</span>
      </div>
      
      <div className="w-px h-3 bg-emerald-500/20" />
      
      <div className="flex items-center gap-1">
        <Activity className="w-3 h-3 text-emerald-400/70" />
        <span className="text-[8px] text-emerald-300/70 font-mono">~100-500ms ticks</span>
      </div>
      
      <div className="w-px h-3 bg-emerald-500/20" />
      
      <div className="flex items-center gap-1">
        <Zap className="w-3 h-3 text-emerald-400/70" />
        <span className="text-[8px] text-emerald-300/70 font-mono">Sub-second execution</span>
      </div>

      {/* Recent fires count */}
      {recentFires.length > 0 && (
        <>
          <div className="w-px h-3 bg-emerald-500/20" />
          <Badge className="text-[7px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-1.5 py-0">
            {recentFires.length} FIRED (1h)
          </Badge>
        </>
      )}
    </div>
  );
}

// ─── Enhanced Trigger Card ───────────────────────────────

function TriggerCard({ trigger, index }: { trigger: RippleTrigger; index: number }) {
  const timeSinceArmed = useMemo(() => {
    const ms = Date.now() - new Date(trigger.armedAt).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }, [trigger.armedAt]);

  const isLong = trigger.direction === 'long';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="group relative rounded-lg border border-border/30 bg-gradient-to-br from-muted/10 to-transparent p-3 space-y-2 hover:border-primary/30 transition-all duration-300"
    >
      {/* Glow accent line */}
      <div className={cn(
        "absolute left-0 top-2 bottom-2 w-0.5 rounded-full",
        isLong ? "bg-emerald-400/60" : "bg-red-400/60"
      )} />

      <div className="flex items-center justify-between pl-2">
        <div className="flex items-center gap-2">
          <Crosshair className={cn("w-3.5 h-3.5", isLong ? "text-emerald-400" : "text-red-400")} />
          <span className="text-[11px] font-mono font-bold text-foreground">
            {trigger.loudPair.replace('_', '/')}
          </span>
          <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
          <span className="text-[11px] font-mono font-bold text-foreground">
            {trigger.quietPair.replace('_', '/')}
          </span>
          <Badge className={cn(
            "text-[8px] px-1.5 py-0 font-bold",
            isLong
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
          )}>
            {trigger.direction.toUpperCase()}
          </Badge>
        </div>
        <span className="text-[9px] text-muted-foreground font-mono">{timeSinceArmed}</span>
      </div>

      {/* Threshold progress bar */}
      <div className="flex items-center gap-2 pl-2">
        <span className="text-[9px] text-muted-foreground w-16 font-medium">Threshold</span>
        <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden relative">
          <motion.div
            className={cn(
              "h-full rounded-full",
              isLong
                ? "bg-gradient-to-r from-emerald-600/60 via-emerald-500 to-emerald-400"
                : "bg-gradient-to-r from-red-600/60 via-red-500 to-red-400"
            )}
            initial={{ width: 0 }}
            animate={{ width: '65%' }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: index * 0.1 }}
          />
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
          />
        </div>
        <span className={cn(
          "text-[10px] font-mono font-bold min-w-[24px] text-right",
          isLong ? "text-emerald-400" : "text-red-400"
        )}>{trigger.thresholdPips}p</span>
      </div>

      {/* Trade params */}
      <div className="flex items-center gap-4 pl-2 text-[9px]">
        <span className="text-muted-foreground">
          Units: <span className="text-foreground font-mono font-bold">{trigger.units.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground">
          SL: <span className="text-red-400 font-mono font-bold">{trigger.slPips}p</span>
        </span>
        <span className="text-muted-foreground">
          TP: <span className="text-emerald-400 font-mono font-bold">{trigger.tpPips}p</span>
        </span>
      </div>

      {trigger.reason && (
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed pl-2 italic">{trigger.reason}</p>
      )}
    </motion.div>
  );
}

// ─── Main Sonar Panel ────────────────────────────────────

export function SonarRipplePanel({ openPositions }: SonarRipplePanelProps) {
  const [triggers, setTriggers] = useState<RippleTrigger[]>([]);
  const [recentFires, setRecentFires] = useState<StreamFire[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch armed triggers
      const { data: triggerData } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, pair, created_at, revoked')
        .ilike('gate_id', 'CORRELATION_TRIGGER%')
        .eq('revoked', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (triggerData) {
        const parsed: RippleTrigger[] = triggerData.map(d => {
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
          } catch { return null; }
        }).filter(Boolean) as RippleTrigger[];
        setTriggers(parsed);
      }

      // Fetch recent stream fires
      const { data: fireData } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, created_at')
        .ilike('gate_id', 'RIPPLE_STREAM_FIRED:%')
        .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (fireData) {
        const fires: StreamFire[] = fireData.map(f => {
          try {
            const p = JSON.parse(f.reason);
            return { pair: p.quietPair, direction: p.direction, tickNumber: p.tickNumber, streamLatencyMs: p.streamLatencyMs, firedAt: p.firedAt };
          } catch { return null; }
        }).filter(Boolean) as StreamFire[];
        setRecentFires(fires);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 12000);
    return () => clearInterval(interval);
  }, []);

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
      className="rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/10"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/20 bg-gradient-to-r from-muted/30 to-transparent">
        <div className="relative">
          <Radio className="w-4.5 h-4.5 text-primary" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground/90">Sonar — Ripple Intelligence</span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/5 px-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            {triggers.length} ARMED
          </Badge>
          <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary bg-primary/5 px-2">
            {openPositions.length} LIVE
          </Badge>
        </div>
      </div>

      {/* Stream Engine Status Bar */}
      <StreamEngineStatus recentFires={recentFires} />

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border/15">
        {/* Left: Sonar ring visualization */}
        <div className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Price Ripple Propagation</span>
            <Target className="w-3 h-3 text-primary/40" />
          </div>
          <div className="aspect-square max-h-[240px] w-full mx-auto">
            <SonarRings triggers={triggers} openPositions={openPositions} />
          </div>
        </div>

        {/* Center: Active triggers / lead-lag cards */}
        <div className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Lead-Lag Triggers</span>
            <Crosshair className="w-3 h-3 text-primary/40" />
          </div>
          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {triggers.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                <Target className="w-8 h-8 text-muted-foreground/20" />
                <span className="text-[11px] text-muted-foreground/40 font-medium">No armed triggers</span>
                <span className="text-[9px] text-muted-foreground/30">FM will arm when divergence detected</span>
              </div>
            )}
            <AnimatePresence>
              {triggers.slice(0, 5).map((t, i) => (
                <TriggerCard key={t.triggerId} trigger={t} index={i} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Correlation matrix */}
        <div className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">8-CCY Correlation Matrix</span>
            <Activity className="w-3 h-3 text-primary/40" />
          </div>
          <CorrelationMatrix activeCurrencies={activeCurrencies} />
        </div>
      </div>

      {/* Recent Fires Footer */}
      {recentFires.length > 0 && (
        <div className="border-t border-border/15 px-4 py-2 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/80">Recent Stream Fires</span>
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {recentFires.map((fire, i) => (
              <div key={i} className="flex items-center gap-2 text-[8px] font-mono bg-muted/10 rounded px-2 py-1 border border-border/20 shrink-0">
                <span className={cn("font-bold", fire.direction === 'long' ? 'text-emerald-400' : 'text-red-400')}>
                  {fire.direction.toUpperCase()}
                </span>
                <span className="text-foreground">{fire.pair?.replace('_', '/')}</span>
                <span className="text-muted-foreground">tick #{fire.tickNumber}</span>
                <span className="text-primary">{fire.streamLatencyMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
