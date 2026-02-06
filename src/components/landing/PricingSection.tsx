import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Star, Zap, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const PROMO_DURATION_DAYS = 15;

const useCountdown = () => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const storedEnd = localStorage.getItem('quantlabs_promo_end');
    const endDate = storedEnd
      ? new Date(storedEnd)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + PROMO_DURATION_DAYS);
          localStorage.setItem('quantlabs_promo_end', d.toISOString());
          return d;
        })();

    const tick = () => {
      const now = new Date().getTime();
      const diff = endDate.getTime() - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
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

  return timeLeft;
};

const tiers = [
  {
    name: 'Free Access',
    price: 0,
    description: 'Full dashboard visibility with previous-day market data',
    features: [
      'All markets — Equities, Crypto, Forex',
      'AI trading dashboards',
      'Market scanner & analytics',
      'AI agent coordination view',
      'AI intelligence previews',
      'Previous-day closing data',
    ],
    cta: 'Explore Free',
    ctaLink: '/dashboard',
    popular: false,
    premium: false,
  },
  {
    name: 'QuantLabs Edge Access',
    originalPrice: 95,
    price: 45,
    description: '15-minute delayed intraday intelligence with full AI analytics',
    features: [
      'Everything in Free',
      '15-minute delayed intraday data',
      'Advanced AI collaboration dashboards',
      'Full backtesting analytics',
      'Strategy performance tracking',
      'AI decision overlays & reasoning',
      'Multi-timeframe signal tracking',
      'Priority feature access',
      'Permanent price lock guarantee',
    ],
    cta: 'Unlock Edge Access',
    ctaLink: '/auth',
    popular: true,
    premium: true,
  },
];

export const PricingSection = () => {
  const countdown = useCountdown();

  return (
    <section id="pricing" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">Choose Your Edge</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free with full platform access. Upgrade for real-time AI intelligence.
          </p>
        </motion.div>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex justify-center mb-10"
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-neural-orange/30 bg-neural-orange/10">
            <Clock className="w-5 h-5 text-neural-orange shrink-0" />
            <span className="text-sm font-medium text-neural-orange">Limited-time pricing expires in:</span>
            <div className="flex items-center gap-1 font-mono text-sm font-bold text-foreground">
              <span className="bg-background/50 px-2 py-1 rounded">{String(countdown.days).padStart(2, '0')}d</span>
              <span>:</span>
              <span className="bg-background/50 px-2 py-1 rounded">{String(countdown.hours).padStart(2, '0')}h</span>
              <span>:</span>
              <span className="bg-background/50 px-2 py-1 rounded">{String(countdown.minutes).padStart(2, '0')}m</span>
              <span>:</span>
              <span className="bg-background/50 px-2 py-1 rounded">{String(countdown.seconds).padStart(2, '0')}s</span>
            </div>
          </div>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className={cn(
                "relative flex flex-col p-8 rounded-2xl border transition-all duration-300",
                tier.popular
                  ? "border-primary bg-gradient-to-b from-primary/15 to-card glow-cyan scale-[1.02]"
                  : "border-border/50 bg-card/50 hover:border-primary/30"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  <Star className="w-3 h-3" />
                  RECOMMENDED
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-display text-2xl font-bold text-foreground mb-1">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>

                <div className="flex items-baseline gap-2">
                  {tier.premium && tier.originalPrice ? (
                    <>
                      <span className="text-5xl font-bold text-gradient-neural">${tier.price}</span>
                      <span className="text-muted-foreground">/month</span>
                      <span className="ml-2 text-lg line-through text-muted-foreground/50">${tier.originalPrice}</span>
                      <span className="ml-1 px-2 py-0.5 rounded-full bg-neural-green/20 text-neural-green text-xs font-bold">
                        {Math.round(((tier.originalPrice - tier.price) / tier.originalPrice) * 100)}% OFF
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl font-bold text-foreground">$0</span>
                      <span className="text-muted-foreground">/forever</span>
                    </>
                  )}
                </div>

                {tier.premium && (
                  <p className="text-xs text-neural-green mt-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Price locked while you're subscribed
                  </p>
                )}
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                className={cn(
                  "w-full font-display text-base py-6",
                  tier.popular
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                <Link to={tier.ctaLink}>{tier.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-sm text-muted-foreground mt-12"
        >
          Cancel anytime. No questions asked. 15-day free trial on Edge Access.
        </motion.p>
      </div>
    </section>
  );
};
