import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EdgePreviewModal } from './EdgePreviewModal';

export const HeroSection = () => {
  const [previewOpen, setPreviewOpen] = useState(false);

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
          Multiple AI models collaborate to analyze market behavior in real time —
          <br className="hidden sm:block" />
          transparent, data-driven, and performance measurable.
        </motion.p>

        {/* Trust micro badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-10"
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
          <Button
            variant="outline"
            size="lg"
            className="text-base px-8 py-6 border-border/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground gap-2"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="w-4 h-4" />
            Preview Edge Access
          </Button>
        </motion.div>

        {/* Micro trust copy */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-xs text-muted-foreground/60 mb-0"
        >
          Full platform visibility. Free version uses previous-day market data. Edge Access unlocks intraday intelligence.
        </motion.p>
      </div>

      {/* Edge Access Preview Modal */}
      <EdgePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </section>
  );
};
