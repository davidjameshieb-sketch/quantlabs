// Slippage & Vacuum Forecaster — Tachometer gauge for order book density decay
import { useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Gauge, AlertTriangle, Zap } from 'lucide-react';
import type { MatrixResult, MatrixSignal } from '@/hooks/useSovereignMatrix';

interface Props {
  result: MatrixResult;
}

export const VacuumForecaster = ({ result }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);

  const { signals, strikes, currencyScores, predator, prey } = result;

  // Compute "vacuum" metrics from signals
  const metrics = useMemo(() => {
    // Best strike or best signal
    const bestSignal = strikes[0] ?? signals[0];
    if (!bestSignal) return { density: 0.5, spread: 0, wallStrength: 0.5, vacuumPct: 0, isRedline: false, pair: 'N/A' };

    // Simulate order book density from gate data
    // G2 breakout proximity = how close to Atlas Snap
    const isLong = bestSignal.direction === 'long';
    const d = bestSignal.gate2Detail;
    const range = d.highest20 - d.lowest20;
    const breakoutTarget = isLong ? d.highest20 : d.lowest20;
    const distToBreakout = Math.abs(d.close - breakoutTarget);
    const densityRatio = range > 0 ? 1 - (distToBreakout / range) : 0.5;

    // Wall strength decays as G2 is breached
    const wallStrength = bestSignal.gate2 ? 0.1 : Math.max(0, 1 - densityRatio);

    // Spread proxy from slope magnitude
    const slopeMag = Math.abs(bestSignal.gate3Detail?.slope ?? 0);
    const spreadDecay = Math.min(1, slopeMag * 10000);

    // Vacuum = how hollow the wall is
    const vacuumPct = bestSignal.triplelock
      ? 0.95 + Math.random() * 0.05
      : bestSignal.gate2
        ? 0.7 + densityRatio * 0.2
        : densityRatio * 0.5;

    const isRedline = vacuumPct > 0.85;

    return {
      density: 1 - vacuumPct,
      spread: spreadDecay,
      wallStrength,
      vacuumPct,
      isRedline,
      pair: bestSignal.instrument.replace('_', '/'),
      signal: bestSignal,
    };
  }, [signals, strikes]);

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
    const W = rect.width;
    const H = rect.height;

    const cx = W / 2;
    const cy = H * 0.58;
    const outerR = Math.min(cx, cy) - 20;
    const innerR = outerR * 0.65;

    // Gauge arc: from 210° to 330° (sweep of 240°)
    const startAngle = (210 * Math.PI) / 180;
    const endAngle = (330 * Math.PI) / 180;
    const totalSweep = endAngle - startAngle + Math.PI * 2; // wrap
    const sweep = ((330 - 210 + 360) % 360) * Math.PI / 180; // 240°

    const draw = () => {
      frameRef.current++;
      const t = frameRef.current;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = 'rgba(5,8,18,0.95)';
      ctx.fillRect(0, 0, W, H);

      // Draw gauge track
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.strokeStyle = 'rgba(50,60,80,0.4)';
      ctx.lineWidth = outerR - innerR;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // Colored gauge segments (green → yellow → red)
      const segments = [
        { start: 0, end: 0.33, color: '#39ff14' },
        { start: 0.33, end: 0.5, color: '#7fff00' },
        { start: 0.5, end: 0.7, color: '#ffaa00' },
        { start: 0.7, end: 0.85, color: '#ff6600' },
        { start: 0.85, end: 1, color: '#ff0033' },
      ];

      segments.forEach(seg => {
        ctx.beginPath();
        const a1 = startAngle + sweep * seg.start;
        const a2 = startAngle + sweep * seg.end;
        ctx.arc(cx, cy, outerR, a1, a2);
        ctx.strokeStyle = seg.color + '30';
        ctx.lineWidth = outerR - innerR;
        ctx.stroke();
      });

      // Active fill up to needle position
      const needleTarget = metrics.vacuumPct;
      const needlePulse = metrics.isRedline ? Math.sin(t * 0.1) * 0.03 : 0;
      const needlePos = Math.min(1, needleTarget + needlePulse);
      const needleAngle = startAngle + sweep * needlePos;

      // Active arc glow
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, needleAngle);
      const activeColor = needlePos > 0.85 ? '#ff0033' : needlePos > 0.7 ? '#ff6600' : needlePos > 0.5 ? '#ffaa00' : '#39ff14';
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = outerR - innerR - 4;
      ctx.lineCap = 'round';
      if (metrics.isRedline) {
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 20 + Math.sin(t * 0.1) * 10;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Tick marks
      for (let i = 0; i <= 10; i++) {
        const pct = i / 10;
        const angle = startAngle + sweep * pct;
        const tickOuter = outerR + 8;
        const tickInner = outerR + 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
        ctx.lineTo(cx + Math.cos(angle) * tickOuter, cy + Math.sin(angle) * tickOuter);
        ctx.strokeStyle = i >= 9 ? '#ff0033aa' : '#ffffff30';
        ctx.lineWidth = i % 5 === 0 ? 2 : 1;
        ctx.stroke();

        // Labels at major ticks
        if (i % 2 === 0) {
          ctx.font = '7px monospace';
          ctx.fillStyle = '#ffffff40';
          ctx.textAlign = 'center';
          const lx = cx + Math.cos(angle) * (tickOuter + 10);
          const ly = cy + Math.sin(angle) * (tickOuter + 10);
          ctx.fillText(`${(pct * 100).toFixed(0)}`, lx, ly + 3);
        }
      }

      // Needle
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle);
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(outerR - 5, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fillStyle = metrics.isRedline ? '#ff0033' : '#ffffff';
      ctx.shadowColor = metrics.isRedline ? '#ff0033' : '#ffffff';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();

      // Center hub
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
      hubGrad.addColorStop(0, '#ffffff30');
      hubGrad.addColorStop(1, '#ffffff08');
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.strokeStyle = '#ffffff20';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Center value
      ctx.font = `bold 22px 'Orbitron', monospace`;
      ctx.fillStyle = activeColor;
      ctx.textAlign = 'center';
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = metrics.isRedline ? 15 : 5;
      ctx.fillText(`${(needlePos * 100).toFixed(0)}`, cx, cy + 45);
      ctx.shadowBlur = 0;

      ctx.font = '8px monospace';
      ctx.fillStyle = '#ffffff50';
      ctx.fillText('VACUUM %', cx, cy + 58);

      // REDLINE warning
      if (metrics.isRedline) {
        const flash = Math.sin(t * 0.08) > 0;
        if (flash) {
          ctx.font = `bold 10px 'Orbitron', monospace`;
          ctx.fillStyle = '#ff0033';
          ctx.shadowColor = '#ff0033';
          ctx.shadowBlur = 20;
          ctx.fillText('⚠ ATLAS SNAP IMMINENT', cx, 24);
          ctx.shadowBlur = 0;
        }
      }

      // Pair label
      ctx.font = `bold 9px 'Orbitron', monospace`;
      ctx.fillStyle = '#ffffff60';
      ctx.fillText(metrics.pair, cx, cy - innerR + 20);

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [metrics]);

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#ff6600]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-display">
            Vacuum Forecaster
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {metrics.isRedline && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="text-[8px] font-mono px-2 py-0.5 rounded border border-[#ff0033]/60 text-[#ff0033] bg-[#ff0033]/15 font-bold"
            >
              <AlertTriangle className="inline w-2.5 h-2.5 mr-0.5" /> REDLINE
            </motion.span>
          )}
          <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded">SLIPPAGE ENGINE</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full" style={{ height: 280 }}>
        <canvas ref={canvasRef} className="w-full h-full rounded-xl" />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="text-center p-2 rounded-lg bg-slate-900/50 border border-slate-800/50">
          <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Wall Strength</div>
          <div className="text-sm font-bold font-mono" style={{ color: metrics.wallStrength < 0.3 ? '#ff0033' : metrics.wallStrength < 0.6 ? '#ffaa00' : '#39ff14' }}>
            {(metrics.wallStrength * 100).toFixed(0)}%
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-900/50 border border-slate-800/50">
          <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Spread Decay</div>
          <div className="text-sm font-bold font-mono" style={{ color: metrics.spread > 0.7 ? '#ff0033' : '#ffaa00' }}>
            {(metrics.spread * 100).toFixed(0)}%
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-slate-900/50 border border-slate-800/50">
          <div className="text-[7px] font-mono text-slate-500 uppercase mb-1">Density</div>
          <div className="text-sm font-bold font-mono" style={{ color: metrics.density < 0.2 ? '#ff0033' : '#39ff14' }}>
            {(metrics.density * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
};
