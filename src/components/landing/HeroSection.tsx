import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Activity, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-20">
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 bg-primary/10 mb-8"
        >
          <span className="text-sm font-medium text-primary">🚀 Free Access · No Credit Card Required</span>
        </motion.div>

        {/* Main heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-display text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
        >
          <span className="text-foreground">AI-Powered</span>
          <br />
          <span className="text-gradient-neural">Quantitative Trading Intelligence</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6"
        >
          Multiple AI models collaborate to analyze markets in real-time.
          <br className="hidden sm:block" />
          Transparent, data-driven, and performance measurable.
        </motion.p>

        {/* Trust bullets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-10"
        >
          {['Equities, Crypto & Forex', 'Multi-AI Collaboration', 'Quantitative Research Engine'].map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" />
              {item}
            </span>
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
        >
          <Button asChild size="lg" className="text-base px-8 py-6 font-display bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
            <Link to="/dashboard">
              Explore Free Dashboard
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base px-8 py-6 border-border/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground">
            <a href="#pricing">Upgrade to Elite</a>
          </Button>
        </motion.div>

        {/* Low friction reminder */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-xs text-muted-foreground/60 mb-14"
        >
          Free forever with previous-day data. Elite unlocks 15-minute delayed intraday.
        </motion.p>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="space-y-4"
        >
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50">Platform Highlights</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { label: 'AI Trading Dashboards', desc: 'Multi-agent AI analyzing every market condition' },
              { label: 'Quantitative Analytics', desc: 'Efficiency scoring, backtesting & performance tracking' },
              { label: 'Collaborative AI', desc: 'Dynamic coordination — the best AI leads in real-time' },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-4 rounded-lg border border-border/30 bg-card/30 backdrop-blur-sm text-center hover:border-primary/20 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{feature.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Floating icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute top-20 right-10 hidden lg:block"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Activity className="w-16 h-16 text-primary/30" />
        </motion.div>
      </motion.div>
    </section>
  );
};
