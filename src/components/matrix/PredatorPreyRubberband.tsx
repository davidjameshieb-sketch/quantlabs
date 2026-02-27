// Predator vs Prey — Live Rubberband Tension Visualizer
// Shows elastic band stretching between #1 and #8 with animated tension physics

import { useMemo, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Crown, Skull, Zap } from 'lucide-react';

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦',
};

interface Props {
  predator: string;
  prey: string;
  predatorScore: number;
  preyScore: number;
  rankGap: number;
}

export default function PredatorPreyRubberband({ predator, prey, predatorScore, preyScore, rankGap }: Props) {
  const delta = Math.abs(predatorScore - preyScore);
  const tension = Math.min(delta / 0.04, 1); // 0→1 normalized (0.04 = max expected gap)
  const [pulse, setPulse] = useState(false);

  // Spring-animated tension value for smooth elastic motion
  const springTension = useSpring(tension, { stiffness: 60, damping: 12, mass: 0.8 });
  const bandWidth = useTransform(springTension, [0, 1], [30, 92]); // percentage width
  const bandOpacity = useTransform(springTension, [0, 0.3, 1], [0.3, 0.6, 1]);
  const glowIntensity = useTransform(springTension, [0, 1], [0, 20]);

  // Pulse effect on high tension
  useEffect(() => {
    if (tension > 0.7) {
      const interval = setInterval(() => setPulse(p => !p), 1200);
      return () => clearInterval(interval);
    }
    setPulse(false);
  }, [tension]);

  const tensionLabel = tension > 0.7 ? 'EXTREME' : tension > 0.4 ? 'HIGH' : tension > 0.2 ? 'MODERATE' : 'LOW';
  const tensionColor = tension > 0.7 ? '#dc2626' : tension > 0.4 ? '#f59e0b' : tension > 0.2 ? '#3b82f6' : '#94a3b8';

  // Generate the SVG elastic band path with wobble
  const bandPath = useMemo(() => {
    const amplitude = tension * 6;
    const segments = 40;
    let d = 'M 0 25';
    for (let i = 1; i <= segments; i++) {
      const x = (i / segments) * 100;
      const wave = Math.sin((i / segments) * Math.PI * 3) * amplitude;
      const secondaryWave = Math.sin((i / segments) * Math.PI * 7) * (amplitude * 0.3);
      const y = 25 + wave + secondaryWave;
      d += ` L ${x} ${y}`;
    }
    return d;
  }, [tension]);

  // Vibration particles along the band when tension is high
  const particles = useMemo(() => {
    if (tension < 0.4) return [];
    const count = Math.floor(tension * 8);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 15 + (70 * (i + 1)) / (count + 1),
      delay: i * 0.15,
    }));
  }, [tension]);

  return (
    <div className="relative rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        border: `1px solid ${tensionColor}40`,
        boxShadow: `0 0 ${tension * 30}px ${tensionColor}15`,
      }}>

      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3" style={{ color: tensionColor }} />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]"
            style={{ color: `${tensionColor}cc` }}>
            Rubberband Tension
          </span>
        </div>
        <motion.span
          animate={{ opacity: pulse ? 0.5 : 1 }}
          transition={{ duration: 0.6 }}
          className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            background: `${tensionColor}20`,
            color: tensionColor,
            border: `1px solid ${tensionColor}40`,
          }}>
          {tensionLabel}
        </motion.span>
      </div>

      {/* Main Band Visualization */}
      <div className="px-4 py-3">
        <div className="relative h-14 flex items-center">
          {/* Predator Node (left) */}
          <motion.div
            className="absolute left-0 z-10 flex flex-col items-center"
            animate={{ x: [0, -2, 0], scale: [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                boxShadow: `0 0 ${12 + tension * 15}px #10b98160`,
              }}>
              <Crown className="w-4 h-4 text-white" />
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ border: '2px solid #10b981' }}
              />
            </div>
            <span className="text-[10px] font-black text-emerald-400 mt-1 font-mono">
              {FLAGS[predator]}{predator}
            </span>
            <span className="text-[8px] text-emerald-500/60 font-mono">
              #{1} · {predatorScore > 0 ? '+' : ''}{predatorScore.toFixed(4)}
            </span>
          </motion.div>

          {/* SVG Elastic Band */}
          <div className="absolute left-12 right-12 top-1/2 -translate-y-1/2 h-14">
            <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="bandGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor={tensionColor} />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
                <filter id="bandGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background faint band */}
              <motion.path
                d={bandPath}
                fill="none"
                stroke="url(#bandGrad)"
                strokeWidth="1"
                strokeOpacity={0.15}
                filter="url(#bandGlow)"
              />

              {/* Main elastic band */}
              <motion.path
                d={bandPath}
                fill="none"
                stroke="url(#bandGrad)"
                strokeWidth={1.5 + tension * 2}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1, strokeOpacity: 0.5 + tension * 0.5 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                filter="url(#bandGlow)"
              />

              {/* Vibration particles */}
              {particles.map(p => (
                <motion.circle
                  key={p.id}
                  cx={p.x}
                  r={1 + tension}
                  fill={tensionColor}
                  initial={{ cy: 25, opacity: 0 }}
                  animate={{
                    cy: [25 - tension * 8, 25 + tension * 8, 25 - tension * 8],
                    opacity: [0.8, 0.3, 0.8],
                  }}
                  transition={{
                    duration: 0.8 + Math.random() * 0.4,
                    repeat: Infinity,
                    delay: p.delay,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </svg>
          </div>

          {/* Prey Node (right) */}
          <motion.div
            className="absolute right-0 z-10 flex flex-col items-center"
            animate={{ x: [0, 2, 0], scale: [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                boxShadow: `0 0 ${12 + tension * 15}px #ef444460`,
              }}>
              <Skull className="w-4 h-4 text-white" />
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                style={{ border: '2px solid #ef4444' }}
              />
            </div>
            <span className="text-[10px] font-black text-red-400 mt-1 font-mono">
              {FLAGS[prey]}{prey}
            </span>
            <span className="text-[8px] text-red-500/60 font-mono">
              #{8} · {preyScore > 0 ? '+' : ''}{preyScore.toFixed(4)}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, #10b981, ${tensionColor}, #ef4444)`,
            }}
            animate={{ width: `${tension * 100}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-mono text-slate-500">Δ</span>
          <span className="text-[11px] font-black font-mono" style={{ color: tensionColor }}>
            {delta.toFixed(4)}
          </span>
          <span className="text-[8px] text-slate-600 font-mono">
            gap {rankGap}
          </span>
        </div>
      </div>
    </div>
  );
}
