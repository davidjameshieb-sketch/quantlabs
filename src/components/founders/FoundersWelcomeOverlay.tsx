import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Shield, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFoundersCountdown } from '@/hooks/useFoundersEvent';
import { WELCOME_SEEN_KEY } from '@/lib/foundersEvent';

/** Cinematic welcome overlay shown once when a user first enters the dashboard */
export const FoundersWelcomeOverlay = () => {
  const { time, active } = useFoundersCountdown();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const seen = localStorage.getItem(WELCOME_SEEN_KEY);
    if (!seen) {
      setShow(true);
    }
  }, [active]);

  const dismiss = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'radial-gradient(ellipse at center, hsl(var(--background) / 0.95), hsl(var(--background) / 0.98))' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative max-w-lg w-full text-center space-y-6"
          >
            {/* Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/8 rounded-full blur-3xl pointer-events-none" />

            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
              className="relative mx-auto w-16 h-16 rounded-2xl border border-primary/30 bg-primary/10 flex items-center justify-center"
            >
              <Activity className="w-8 h-8 text-primary" />
              <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl" />
            </motion.div>

            {/* Text */}
            <div className="relative z-10 space-y-3">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                Welcome to QuantLabs
                <br />
                <span className="text-gradient-neural">Intelligence Network</span>
              </h2>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                For the next {time.days} days, you have unrestricted visibility into coordinated AI trading intelligence.
              </p>

              <div className="flex items-center justify-center gap-6 pt-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Eye className="w-3.5 h-3.5 text-neural-green" />
                  Observe
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  Analyze
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Shield className="w-3.5 h-3.5 text-neural-purple" />
                  Experience
                </div>
              </div>
            </div>

            {/* Countdown */}
            <div className="relative z-10 inline-flex items-center gap-3 px-5 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Access window</span>
              <span className="font-mono text-sm font-bold text-primary tabular-nums">
                {String(time.days).padStart(2, '0')}d {String(time.hours).padStart(2, '0')}h {String(time.minutes).padStart(2, '0')}m
              </span>
            </div>

            {/* CTA */}
            <div className="relative z-10">
              <Button
                size="lg"
                onClick={dismiss}
                className="font-display text-base px-10 py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 gap-2"
              >
                Enter Intelligence Command Center
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
