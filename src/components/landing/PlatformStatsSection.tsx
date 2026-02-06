import { motion } from 'framer-motion';
import { Activity, Brain, BarChart3, Layers } from 'lucide-react';

const stats = [
  {
    icon: Activity,
    value: '12,000+',
    label: 'Markets Monitored Daily',
    description: 'Equities, crypto, forex, and indices',
  },
  {
    icon: Brain,
    value: '6',
    label: 'AI Models Collaborating',
    description: 'Specialized agents working simultaneously',
  },
  {
    icon: BarChart3,
    value: '50,000+',
    label: 'Backtested Scenarios',
    description: 'Strategy validations across conditions',
  },
  {
    icon: Layers,
    value: '4',
    label: 'Regime Classifications',
    description: 'Trending, ranging, volatile, avoidance',
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
            Platform Intelligence
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            <span className="text-gradient-neural">Quantitative Scale</span>
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
