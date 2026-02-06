import { motion } from 'framer-motion';
import { Eye, History, Shield, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

const pillars = [
  {
    icon: History,
    title: 'Public Trade History',
    desc: 'Every AI trade is logged with entry, exit, and performance — fully auditable.',
  },
  {
    icon: Brain,
    title: 'Strategy Identity',
    desc: 'Each agent maintains a documented personality, specialization, and behavioral profile.',
  },
  {
    icon: Shield,
    title: 'Governance Auditing',
    desc: 'Risk stability anchors and Meta-Controller decisions are transparently recorded.',
  },
  {
    icon: Eye,
    title: 'Evolution Tracking',
    desc: 'Parameter mutations, capital rebalancing, and adaptive learning are fully visible.',
  },
];

export const TransparencyPhilosophySection = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">Radical Transparency</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Each QuantLabs AI maintains complete accountability across every dimension of its operation.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pillars.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={cn(
                'flex items-start gap-4 p-6 rounded-xl',
                'border border-border/20 bg-background/10 backdrop-blur-sm',
                'hover:border-primary/30 transition-colors'
              )}
            >
              <div className="shrink-0 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <pillar.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground mb-1">{pillar.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{pillar.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
