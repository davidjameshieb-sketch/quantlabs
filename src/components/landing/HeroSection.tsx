import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const HeroSection = () => {
  return (
    <section className="relative px-4 pt-24 pb-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60 pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto text-center">
        {/* Brand Identity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-3"
        >
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
            <span className="text-foreground">10 Coordinated AI Trading Intelligences</span>
            <br />
            <span className="text-gradient-neural">Fully Auditable. Fully Adaptive. Performance Verified.</span>
          </h1>
          <p className="font-display text-xs md:text-sm text-muted-foreground mt-3 max-w-2xl mx-auto leading-relaxed">
            Each AI agent maintains publicly verifiable performance history across stocks, crypto, and currency markets.
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
            'Auditable Performance',
            'Evolution Governance',
            'Multi-Market AI Ecosystem',
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
            No simulated backtests. All results reflect verified trade lifecycle tracking.
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
            <a href="#ai-fleet">
              Audit The Intelligence Network
              <ArrowRight className="ml-1.5 w-3 h-3" />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="font-display text-xs px-5 py-2 border-border/40 hover:bg-muted/20 text-muted-foreground hover:text-foreground"
          >
            <Link to="/dashboard">View Real Trade Records</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
