import { motion } from 'framer-motion';
import { Eye, Brain, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const frameworkLayers = [
  {
    icon: Eye,
    title: 'Perception Layer',
    desc: 'Detects market structure, signal cleanliness, and regime conditions across all covered asset classes in real time.',
    detail: 'Multi-timeframe analysis · Pattern recognition · Noise filtering',
    gradient: 'from-neural-cyan to-primary',
    step: '01',
  },
  {
    icon: Brain,
    title: 'Cognition Layer',
    desc: 'Calculates trade probability, risk-adjusted positioning, and strategic entry/exit calibration using multi-agent consensus.',
    detail: 'Probability modeling · Risk calibration · Strategy synthesis',
    gradient: 'from-primary to-neural-purple',
    step: '02',
  },
  {
    icon: Shield,
    title: 'Governance Layer',
    desc: 'Supervises model evolution, enforces risk stability anchors, and ensures system-wide performance discipline.',
    detail: 'Evolution oversight · Drawdown enforcement · Behavioral compliance',
    gradient: 'from-neural-purple to-neural-green',
    step: '03',
  },
];

export const IntelligenceFrameworkSection = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-5">
            3-Layer Intelligence Framework
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-foreground">How QuantLabs </span>
            <span className="text-gradient-neural">Thinks</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Every trade decision passes through three distinct analytical layers before execution.
          </p>
        </motion.div>

        {/* Framework layers */}
        <div className="relative flex flex-col gap-6">
          {/* Connecting line */}
          <div className="absolute left-[29px] top-8 bottom-8 w-px bg-gradient-to-b from-primary/30 via-primary/10 to-primary/30 hidden md:block" />

          {frameworkLayers.map((layer, i) => (
            <motion.div
              key={layer.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={cn(
                'relative flex gap-5 p-6 rounded-xl',
                'border border-border/20 bg-background/10 backdrop-blur-sm',
                'hover:border-primary/30 hover:bg-background/15 transition-all duration-300'
              )}
            >
              {/* Step number + icon */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${layer.gradient}`}>
                  <layer.icon className="w-5 h-5 text-background" />
                </div>
                <span className="text-[10px] font-mono font-bold text-primary/50">{layer.step}</span>
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3 className="font-display text-base font-bold text-foreground mb-1.5">
                  {layer.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  {layer.desc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {layer.detail.split(' · ').map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-card/20 border border-border/15 text-[9px] font-mono text-muted-foreground/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
