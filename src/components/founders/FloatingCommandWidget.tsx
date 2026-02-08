import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Activity, ChevronUp, ChevronDown, Zap, Radio } from 'lucide-react';
import { useFoundersCountdown } from '@/hooks/useFoundersEvent';
import { cn } from '@/lib/utils';

/** Floating transparent command panel — bottom-right corner */
export const FloatingCommandWidget = () => {
  const { time, active } = useFoundersCountdown();
  const [expanded, setExpanded] = useState(false);

  if (!active) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[55]">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'mb-2 w-64 rounded-xl border border-primary/25 p-4',
              'bg-background/80 backdrop-blur-xl shadow-2xl shadow-primary/10'
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-display font-bold text-primary tracking-wider uppercase">
                Intelligence Status
              </span>
            </div>

            {/* Countdown */}
            <div className="mb-3 p-2.5 rounded-lg border border-primary/15 bg-primary/5">
              <p className="text-[9px] text-muted-foreground mb-1 uppercase tracking-wider">Access window closes in</p>
              <p className="font-mono text-sm font-bold text-foreground tabular-nums">
                {String(time.days).padStart(2, '0')}d {String(time.hours).padStart(2, '0')}h{' '}
                {String(time.minutes).padStart(2, '0')}m {String(time.seconds).padStart(2, '0')}s
              </p>
            </div>

            {/* Fleet Status */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">AI Fleet Status</span>
                <span className="text-neural-green font-bold flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neural-green" />
                  </span>
                  10/10 Active
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Intelligence Mode</span>
                <span className="text-primary font-bold">Full Access</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Governance</span>
                <span className="text-neural-purple font-bold">Monitoring</span>
              </div>
            </div>

            {/* CTA */}
            <Link
              to="/dashboard"
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-primary/15 border border-primary/25 text-primary text-[11px] font-display font-medium hover:bg-primary/25 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Enter Intelligence Command Center
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl',
          'border border-primary/30 bg-background/80 backdrop-blur-xl',
          'shadow-lg shadow-primary/10 hover:border-primary/50 transition-colors',
          'text-xs font-display font-medium text-primary'
        )}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="font-mono text-[11px] tabular-nums">
          {String(time.days).padStart(2, '0')}:{String(time.hours).padStart(2, '0')}:{String(time.minutes).padStart(2, '0')}:{String(time.seconds).padStart(2, '0')}
        </span>
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </motion.button>
    </div>
  );
};
