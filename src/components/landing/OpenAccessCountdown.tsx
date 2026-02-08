import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Open Access event: 30 days from a fixed launch date
const EVENT_START = new Date('2026-02-08T00:00:00Z');
const EVENT_END = new Date(EVENT_START.getTime() + 30 * 24 * 60 * 60 * 1000);

const TimeUnit = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center">
    <div className="relative">
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl border border-primary/30 bg-background/10 backdrop-blur-sm flex items-center justify-center">
        <span className="font-display text-2xl md:text-3xl font-bold text-primary tabular-nums">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      {/* Subtle glow */}
      <div className="absolute inset-0 rounded-xl bg-primary/5 blur-sm pointer-events-none" />
    </div>
    <span className="text-[9px] font-display uppercase tracking-[0.15em] text-muted-foreground/60 mt-2">
      {label}
    </span>
  </div>
);

export const OpenAccessCountdown = () => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const diff = EVENT_END.getTime() - now.getTime();

      if (diff <= 0) {
        setIsExpired(true);
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative py-16 md:py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container relative z-10 max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary">
            <Sparkles className="w-3 h-3" />
            Limited Time Open Access Event
          </span>

          {/* Headline */}
          <h2 className="font-display text-2xl md:text-4xl font-bold">
            <span className="text-foreground">QuantLabs Open Access — </span>
            <span className="text-gradient-neural">30 Days Full Intelligence</span>
          </h2>

          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Explore the complete AI ecosystem with unrestricted access.
            After the event ends, the platform transitions to Free (Delayed Intelligence) and Premium (Live Intelligence).
          </p>

          {/* Countdown */}
          {!isExpired ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex items-center justify-center gap-3 md:gap-5 py-4"
            >
              <TimeUnit value={timeLeft.days} label="Days" />
              <span className="text-xl font-display text-primary/40 mt-[-20px]">:</span>
              <TimeUnit value={timeLeft.hours} label="Hours" />
              <span className="text-xl font-display text-primary/40 mt-[-20px]">:</span>
              <TimeUnit value={timeLeft.minutes} label="Minutes" />
              <span className="text-xl font-display text-primary/40 mt-[-20px]">:</span>
              <TimeUnit value={timeLeft.seconds} label="Seconds" />
            </motion.div>
          ) : (
            <div className="py-6">
              <p className="text-sm font-display text-muted-foreground">
                Open Access event has concluded. Platform now operates in tiered mode.
              </p>
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="text-base px-8 py-6 font-display bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
            >
              <Link to="/dashboard">
                Enter Free Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="text-base px-8 py-6 font-display border-primary/30 hover:bg-primary/10 text-primary hover:text-primary gap-2"
            >
              <Link to="/auth">
                <Lock className="w-4 h-4" />
                Lock Founder Pricing
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
