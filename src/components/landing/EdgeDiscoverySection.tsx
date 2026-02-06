import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowRight, Activity, BarChart3, Brain, Shield } from 'lucide-react';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';

const lockedFeatures = [
  {
    icon: Activity,
    title: 'Intraday AI Signal Intelligence',
    description: '15-minute delayed signals across equities, crypto, and forex with real-time AI overlays.',
    feature: 'signalTracking',
  },
  {
    icon: BarChart3,
    title: 'Strategy Performance Deep Analytics',
    description: 'Win/loss ratios, drawdown metrics, and Sharpe ratio across every market regime.',
    feature: 'advancedBacktesting',
  },
  {
    icon: Brain,
    title: 'Multi-Agent Consensus Scoring',
    description: 'See how multiple AI models agree or diverge — and which model leads in each condition.',
    feature: 'aiDecisionOverlays',
  },
  {
    icon: Shield,
    title: 'Advanced Risk Regime Detection',
    description: 'Classify market conditions: trending, ranging, volatile, or avoidance zones.',
    feature: 'performanceBreakdowns',
  },
];

export const EdgeDiscoverySection = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string>('default');

  const handlePreview = (feature: string) => {
    setActiveFeature(feature);
    setModalOpen(true);
  };

  return (
    <section id="edge-features" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">Edge Access Features</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Premium intelligence layers that give you a quantitative market advantage.
          </p>
        </motion.div>

        {/* Locked feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {lockedFeatures.map((feat, i) => (
            <motion.button
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              onClick={() => handlePreview(feat.feature)}
              className="group relative text-left p-6 rounded-2xl border border-border/30 bg-card/10 backdrop-blur-sm hover:border-primary/40 hover:bg-card/20 transition-all duration-300"
            >
              {/* Lock icon */}
              <div className="absolute top-4 right-4">
                <Lock className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 shrink-0 group-hover:bg-primary/15 transition-colors">
                  <feat.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-base font-semibold text-foreground mb-1">
                    {feat.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    {feat.description}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                    Preview Feature
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        feature={activeFeature}
      />
    </section>
  );
};
