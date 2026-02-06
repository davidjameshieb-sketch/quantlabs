import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export const HeroSection = () => {
  return (
    <section className="relative px-4 pt-24 pb-6">
      {/* Subtle bottom fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/40 bg-primary/10 mb-4"
        >
          <span className="text-sm font-medium text-primary">🚀 Free Access · No Credit Card Required</span>
        </motion.div>

        {/* Main heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-display text-3xl md:text-5xl font-bold mb-3 leading-tight"
        >
          <span className="text-foreground">AI-Powered</span>{' '}
          <span className="text-gradient-neural">Quantitative Trading Intelligence</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-4"
        >
          Multiple AI models collaborate to analyze market behavior in real time —
          transparent, data-driven, and performance measurable.
        </motion.p>

        {/* Trust micro badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
        >
          {[
            'Multi-AI Collaboration Engine',
            'Market Mode Detection & Risk Filtering',
            'Quantitative Backtesting Transparency',
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
