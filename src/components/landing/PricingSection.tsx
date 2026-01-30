import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tiers = [
  {
    name: 'Observer',
    price: 20,
    description: 'Traders who want clarity without noise',
    features: [
      'All markets, all tickers',
      'Single-timeframe Neural Summary',
      'Efficiency Score + Verdict',
      'Bias (Bullish / Bearish)',
      'Strategy label',
      'Plain-English narrative output',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Analyst',
    price: 40,
    description: 'Traders who want confirmation, not just direction',
    features: [
      'Everything in Observer',
      'Multi-timeframe view (lower + mid TFs)',
      'Confidence % and Conviction',
      'Trend Cloud visualization',
      'Expanded narrative explanations',
      'Historical snapshot',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Strategist',
    price: 60,
    description: 'Traders who think in alignment, not single charts',
    features: [
      'Everything in Analyst',
      'Full multi-timeframe stack',
      'Aggregated Ticker Bias Score',
      'Timeframe alignment detection',
      '"What would need to change?" insight',
      'Cross-market scanner',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Architect',
    price: 80,
    description: 'System builders and serious discretionary traders',
    features: [
      'Everything in Strategist',
      'Historical efficiency regimes',
      'Confidence & efficiency curves',
      'Market-to-market comparisons',
      'Custom dashboard layouts',
      'State-change alerts',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Authority',
    price: 99,
    description: 'Professionals, educators, and power users',
    features: [
      'Everything in Architect',
      'Full transparency view (all metrics)',
      'Multi-market correlation context',
      'Priority feature voting',
      'Early access to new modules',
      'Exportable summaries',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
];

export const PricingSection = () => {
  return (
    <section id="pricing" className="relative py-24 px-4">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background pointer-events-none" />

      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">Choose Your Depth</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            All tiers include access to every market. Higher tiers unlock deeper analysis, 
            foresight, and authority — not basic access.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-neural-green/30 bg-neural-green/10">
            <span className="text-neural-green font-medium">🎉 2-Week Free Trial on All Tiers</span>
          </div>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={cn(
                "relative flex flex-col p-6 rounded-2xl border transition-all duration-300",
                tier.popular
                  ? "border-primary bg-gradient-to-b from-primary/10 to-card glow-cyan"
                  : "border-border/50 bg-card/50 hover:border-primary/30"
              )}
            >
              {/* Popular badge */}
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  <Star className="w-3 h-3" />
                  Most Popular
                </div>
              )}

              {/* Tier name & price */}
              <div className="mb-4">
                <h3 className="font-display text-xl font-bold text-foreground mb-1">
                  {tier.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gradient-neural">${tier.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-3 mb-6">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                asChild
                className={cn(
                  "w-full font-display",
                  tier.popular
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                <Link to="/auth">{tier.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-sm text-muted-foreground mt-12"
        >
          Cancel anytime. No questions asked. Your trial starts when you sign up.
        </motion.p>
      </div>
    </section>
  );
};
