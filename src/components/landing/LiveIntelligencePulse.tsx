import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart3, Shield, Zap, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PulseMetric {
  icon: typeof Activity;
  label: string;
  value: number;
  suffix: string;
  color: string;
  increment: number;
}

const baseMetrics: PulseMetric[] = [
  { icon: Activity, label: 'Active AI Agents', value: 10, suffix: ' / 10', color: 'text-neural-green', increment: 0 },
  { icon: BarChart3, label: 'Trades Logged', value: 9008, suffix: '+', color: 'text-neural-cyan', increment: 1 },
  { icon: Shield, label: 'Governance Status', value: 100, suffix: '%', color: 'text-neural-purple', increment: 0 },
  { icon: Zap, label: 'Optimization Active', value: 4, suffix: ' / 4', color: 'text-primary', increment: 0 },
  { icon: Heart, label: 'System Health', value: 97, suffix: '%', color: 'text-neural-green', increment: 0 },
];

const AnimatedCounter = ({ target, suffix, color }: { target: number; suffix: string; color: string }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const stepValue = target / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(stepValue * step), target);
      setCount(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [target]);

  return (
    <span className={cn('font-display text-lg md:text-xl font-bold tabular-nums', color)}>
      {count.toLocaleString()}{suffix}
    </span>
  );
};

export const LiveIntelligencePulse = () => {
  const [metrics, setMetrics] = useState(baseMetrics);

  // Simulate live trade count incrementing
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev =>
        prev.map(m =>
          m.increment > 0
            ? { ...m, value: m.value + (Math.random() > 0.6 ? 1 : 0) }
            : m
        )
      );
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative z-10 mx-auto max-w-5xl px-4 py-4"
    >
      <div className="rounded-2xl border border-border/20 bg-background/10 backdrop-blur-lg overflow-hidden">
        {/* Animated top border glow */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="px-4 py-4 md:px-6">
          {/* Title bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neural-green" />
              </span>
              <span className="text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground/70">
                Live Intelligence Pulse
              </span>
            </div>
            <span className="text-[9px] font-mono text-muted-foreground/40">
              ECOSYSTEM STATUS · REAL-TIME
            </span>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
            {metrics.map((metric, i) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                className="flex flex-col items-center text-center p-3 rounded-xl bg-background/5 border border-border/10 hover:border-primary/20 transition-colors"
              >
                <metric.icon className={cn('w-4 h-4 mb-1.5', metric.color)} />
                <AnimatedCounter target={metric.value} suffix={metric.suffix} color={metric.color} />
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mt-1 leading-tight">
                  {metric.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Animated bottom border glow */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-neural-purple/40 to-transparent" />
      </div>
    </motion.section>
  );
};
