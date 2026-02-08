import { motion } from 'framer-motion';
import { Activity, Brain, BarChart3, Layers } from 'lucide-react';

const stats = [
  {
    icon: Activity,
    value: '500+',
    label: 'Scalp Proposals / Day',
    description: 'Governance-filtered from 500 daily proposals',
  },
  {
    icon: Brain,
    value: '10',
    label: 'AI Scalping Agents',
    description: 'All tuned for high-frequency FX execution',
  },
  {
    icon: BarChart3,
    value: '72%+',
    label: 'Scalp Win Rate',
    description: 'Pro-level hit rate across major pairs',
  },
  {
    icon: Layers,
    value: '<15min',
    label: 'Avg Scalp Duration',
    description: 'Ultra-fast entries and exits on OANDA',
  },
];

export const PlatformStatsSection = () => {
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
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/50 font-mono mb-3">
            Scalping Intelligence Metrics
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            <span className="text-gradient-neural">High-Volume Scalping Scale</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center p-6 rounded-2xl border border-border/20 bg-card/10 backdrop-blur-sm"
            >
              <div className="inline-flex p-2.5 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <p className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">
                {stat.value}
              </p>
              <p className="text-sm font-medium text-foreground/80 mb-0.5">{stat.label}</p>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
