import { motion } from 'framer-motion';
import { Brain, TrendingUp, Shield, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

const layers = [
  {
    icon: TrendingUp,
    title: 'Trading Agents',
    desc: '10 specialized AI models executing across equities, crypto, and forex markets.',
    gradient: 'from-neural-cyan to-primary',
  },
  {
    icon: Brain,
    title: 'Optimization Mentors',
    desc: 'Multi-agent consensus scoring validates signal quality before execution.',
    gradient: 'from-primary to-neural-purple',
  },
  {
    icon: Shield,
    title: 'Governance Council',
    desc: 'Risk stability anchors enforce drawdown ceilings and exposure limits.',
    gradient: 'from-neural-purple to-neural-magenta',
  },
  {
    icon: Cpu,
    title: 'Evolution Meta-Controller',
    desc: 'Supervises parameter mutations and capital allocation across the fleet.',
    gradient: 'from-neural-magenta to-neural-green',
  },
];

export const EcosystemFlowSection = () => {
  return (
    <section className="relative py-20 px-4">
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
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-5">
            Coordination Architecture
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">AI Ecosystem Intelligence</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            QuantLabs AI models evolve continuously while operating under strict risk governance
            that preserves stability and performance integrity.
          </p>
        </motion.div>

        {/* Flow visualization */}
        <div className="relative flex flex-col items-center gap-3">
          {layers.map((layer, i) => (
            <motion.div
              key={layer.title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="w-full max-w-lg"
            >
              <div className={cn(
                'relative flex items-center gap-4 p-5 rounded-xl',
                'border border-border/20 bg-background/10 backdrop-blur-sm',
                'hover:border-primary/30 hover:bg-background/15 transition-all duration-300 group'
              )}>
                <div className={`shrink-0 p-3 rounded-lg bg-gradient-to-br ${layer.gradient}`}>
                  <layer.icon className="w-5 h-5 text-background" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground mb-0.5">
                    {layer.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {layer.desc}
                  </p>
                </div>
                {/* Step indicator */}
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background/20 border border-border/30 backdrop-blur-sm flex items-center justify-center">
                  <span className="text-[10px] font-mono font-bold text-primary">{i + 1}</span>
                </div>
              </div>

              {/* Connector line */}
              {i < layers.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-6 bg-gradient-to-b from-primary/40 to-primary/10" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
