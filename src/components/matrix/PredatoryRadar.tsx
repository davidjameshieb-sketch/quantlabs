// Predatory Liquidity Radar — Radial 3D scope showing predator/prey hunt vectors
import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, Zap } from 'lucide-react';
import type { MatrixResult } from '@/hooks/useSovereignMatrix';

const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

interface Props {
  result: MatrixResult;
}

export const PredatoryRadar = ({ result }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);
  const [hoveredCur, setHoveredCur] = useState<string | null>(null);

  const { currencyScores, currencyRanks, predator, prey, signals } = result;

  // Check which gate combos are active for strike vectors
  const activeVectors = signals.filter(s => s.gate1 && s.gate3 && s.direction);

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
    const cy = H / 2;
    const maxR = Math.min(cx, cy) - 40;

    const draw = () => {
      frameRef.current++;
      const t = frameRef.current;
      ctx.clearRect(0, 0, W, H);

      // Background radial gradient
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR + 30);
      bgGrad.addColorStop(0, 'rgba(0,255,234,0.03)');
      bgGrad.addColorStop(0.5, 'rgba(10,15,30,0.8)');
      bgGrad.addColorStop(1, 'rgba(5,8,20,0.95)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Rotating sweep line
      const sweepAngle = ((t * 0.008) % (Math.PI * 2));
      // Sweep visual
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - 0.3, sweepAngle, false);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,255,234,0.3)';
      ctx.fill();
      ctx.restore();

      // Concentric rings
      for (let i = 1; i <= 4; i++) {
        const r = (maxR / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,120,150,${0.08 + i * 0.03})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Crosshair lines
      ctx.strokeStyle = 'rgba(100,120,150,0.12)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Diagonal crosses
      for (let a = Math.PI / 4; a < Math.PI * 2; a += Math.PI / 2) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * maxR * 0.3, cy + Math.sin(a) * maxR * 0.3);
        ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
        ctx.strokeStyle = 'rgba(100,120,150,0.06)';
        ctx.stroke();
      }

      // Position currencies on the radar
      // Rank 1 = center-ish (strongest), Rank 8 = outer edge (weakest/prey)
      // Angle: evenly distributed
      const positions: Record<string, { x: number; y: number; angle: number; radius: number }> = {};

      CURRENCIES.forEach((cur, i) => {
        const rank = currencyRanks[cur] ?? 4;
        const angle = (i / CURRENCIES.length) * Math.PI * 2 - Math.PI / 2;
        // Rank 1 closer to center, rank 8 at edge
        const radius = maxR * 0.2 + (maxR * 0.7 * ((rank - 1) / 7));
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        positions[cur] = { x, y, angle, radius };
      });

      // Draw strike vector lines (G1+G3 active)
      activeVectors.forEach((sig) => {
        const base = positions[sig.baseCurrency];
        const quote = positions[sig.quoteCurrency];
        if (!base || !quote) return;

        const isLong = sig.direction === 'long';
        const fromPos = isLong ? base : quote;
        const toPos = isLong ? quote : base;
        const color = isLong ? 'rgba(0,255,234,' : 'rgba(255,0,85,';

        // Pulsing thickness based on gate count
        const gateCount = [sig.gate1, sig.gate2, sig.gate3].filter(Boolean).length;
        const pulse = 1 + Math.sin(t * 0.05) * 0.5;
        const thickness = gateCount * 1.5 * pulse;

        // Glow
        ctx.save();
        ctx.shadowColor = isLong ? '#00ffea' : '#ff0055';
        ctx.shadowBlur = sig.triplelock ? 20 : 8;

        // Vector line
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);
        ctx.strokeStyle = `${color}${sig.triplelock ? '0.9)' : '0.4)'}`;
        ctx.lineWidth = thickness;
        ctx.stroke();

        // Arrowhead
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const ux = dx / len;
          const uy = dy / len;
          const arrowLen = 8;
          const ax = toPos.x - ux * arrowLen;
          const ay = toPos.y - uy * arrowLen;
          ctx.beginPath();
          ctx.moveTo(toPos.x, toPos.y);
          ctx.lineTo(ax - uy * 5, ay + ux * 5);
          ctx.lineTo(ax + uy * 5, ay - ux * 5);
          ctx.closePath();
          ctx.fillStyle = `${color}0.8)`;
          ctx.fill();
        }

        // Triple-lock: pulsing ring at midpoint
        if (sig.triplelock) {
          const mx = (fromPos.x + toPos.x) / 2;
          const my = (fromPos.y + toPos.y) / 2;
          const ringR = 6 + Math.sin(t * 0.08) * 3;
          ctx.beginPath();
          ctx.arc(mx, my, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}0.8)`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = `${color}0.2)`;
          ctx.fill();
        }

        ctx.restore();
      });

      // Draw currency nodes
      CURRENCIES.forEach((cur) => {
        const pos = positions[cur];
        if (!pos) return;
        const rank = currencyRanks[cur] ?? 4;
        const score = currencyScores[cur] ?? 0;
        const isPredator = cur === predator;
        const isPrey = cur === prey;

        // Node glow
        const nodeColor = isPredator ? '#00ffea' : isPrey ? '#ff0055' : rank <= 3 ? '#39ff14' : rank >= 6 ? '#ff8800' : '#8888aa';
        const nodeRadius = isPredator ? 18 : isPrey ? 16 : 12;
        const glowPulse = isPredator || isPrey ? 1 + Math.sin(t * 0.06) * 0.3 : 1;

        // Outer glow
        ctx.save();
        ctx.shadowColor = nodeColor;
        ctx.shadowBlur = (isPredator || isPrey) ? 25 * glowPulse : 8;

        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius * glowPulse, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, nodeRadius * glowPulse);
        grad.addColorStop(0, nodeColor + '40');
        grad.addColorStop(0.7, nodeColor + '20');
        grad.addColorStop(1, nodeColor + '08');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = nodeColor + '90';
        ctx.lineWidth = isPredator || isPrey ? 2 : 1;
        ctx.stroke();
        ctx.restore();

        // Currency label
        ctx.font = `bold ${isPredator || isPrey ? 11 : 9}px 'Orbitron', monospace`;
        ctx.fillStyle = nodeColor;
        ctx.textAlign = 'center';
        ctx.fillText(cur, pos.x, pos.y + 4);

        // Rank badge
        ctx.font = `bold 7px monospace`;
        ctx.fillStyle = nodeColor + 'aa';
        ctx.fillText(`#${rank}`, pos.x, pos.y - nodeRadius - 4);

        // Score
        ctx.font = `8px monospace`;
        ctx.fillStyle = '#ffffff60';
        ctx.fillText(`${score > 0 ? '+' : ''}${score.toFixed(4)}`, pos.x, pos.y + nodeRadius + 12);
      });

      // Center label
      ctx.font = `bold 8px 'Orbitron', monospace`;
      ctx.fillStyle = '#00ffea50';
      ctx.textAlign = 'center';
      ctx.fillText('SOVEREIGN', cx, cy - 6);
      ctx.fillText('RADAR', cx, cy + 6);

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [currencyScores, currencyRanks, predator, prey, activeVectors]);

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-display">
            Predatory Liquidity Radar
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {activeVectors.length > 0 && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-[8px] font-mono px-2 py-0.5 rounded border border-[#00ffea]/40 text-[#00ffea] bg-[#00ffea]/10"
            >
              <Zap className="inline w-2.5 h-2.5 mr-0.5" />
              {activeVectors.length} VECTOR{activeVectors.length > 1 ? 'S' : ''} ACTIVE
            </motion.span>
          )}
          <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded">THE HUNT</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative aspect-square max-h-[460px] w-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-xl"
          style={{ background: 'rgba(5,8,20,0.9)' }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[8px] font-mono text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#00ffea]" /> Predator (center)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#ff0055]" /> Prey (edge)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-6 h-0.5 bg-[#00ffea]" /> Strike Vector
        </span>
      </div>
    </div>
  );
};
