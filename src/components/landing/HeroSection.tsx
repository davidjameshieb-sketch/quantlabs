import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isFoundersEventActive } from '@/lib/foundersEvent';

export const HeroSection = () => {
  const foundersActive = isFoundersEventActive();

  return (
    <section className="relative px-4 pt-24 pb-4" style={{ marginTop: foundersActive ? '36px' : '0px' }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60 pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto text-center">
        {/* Founders Access Badge */}
        {foundersActive && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-display font-medium text-primary">
              <Zap className="w-3 h-3" />
              Founders Intelligence Access — Full Platform Unlocked
            </span>
          </motion.div>
        )}

        {/* Brand Identity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-3"
        >
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
            <span className="text-foreground">High-Volume FX Scalping Intelligence</span>
            <br />
            <span className="text-gradient-neural">18 AI Agents. Sub-15min Trades. OANDA Execution.</span>
          </h1>
          <p className="font-display text-xs md:text-sm text-muted-foreground mt-3 max-w-2xl mx-auto leading-relaxed">
            500+ daily trade proposals. 72%+ win rate. Ultra-tight stops. Governance-filtered scalping across major forex pairs.
          </p>
        </motion.div>

        {/* Trust Micro Badges */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground mb-4"
        >
          {[
            'High-Frequency Scalping',
            'Governance-Filtered Execution',
            'OANDA Auto-Trading',
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-primary" />
              {item}
            </span>
          ))}
        </motion.div>

        {/* Trust Statement */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-4"
        >
          <Shield className="w-3 h-3 text-neural-green" />
          <span className="text-[10px] font-mono text-muted-foreground/70">
            Real trade lifecycle tracking. Wins avg ~0.35%. Losses avg ~0.06%. Scalping edge through volume.
          </span>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex items-center justify-center gap-3"
        >
          <Button
            asChild
            size="sm"
            className="font-display text-xs px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Link to="/dashboard/forex">
              {foundersActive ? 'Enter Scalping Command Center' : 'View Live Scalping Intelligence'}
              <ArrowRight className="ml-1.5 w-3 h-3" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="font-display text-xs px-5 py-2 border-border/40 hover:bg-muted/20 text-muted-foreground hover:text-foreground"
          >
            <a href="#ai-fleet">
              {foundersActive ? 'Explore Scalping Fleet Performance' : 'View Scalp Trade Records'}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
