import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
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
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            <span className="text-gradient-neural">QuantLabs</span>
          </h1>
          <p className="font-display text-xs md:text-sm tracking-[0.25em] uppercase text-muted-foreground mt-2">
            Multi-Agent Trading Intelligence Platform
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
              Explore AI Fleet
              <ArrowRight className="ml-1.5 w-3 h-3" />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="font-display text-xs px-5 py-2 border-border/40 hover:bg-muted/20 text-muted-foreground hover:text-foreground"
          >
            <Link to="/dashboard">Enter Free Dashboard</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
