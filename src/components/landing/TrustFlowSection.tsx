import { motion } from 'framer-motion';
import { Brain, LineChart, BarChart3 } from 'lucide-react';

const columns = [
  {
    icon: Brain,
    title: 'AI Intelligence',
    description: 'Multiple AI models interpret volatility, trend structure, and risk conditions — collaborating to surface the clearest market signals.',
    gradient: 'from-neural-cyan to-neural-purple',
  },
  {
    icon: LineChart,
    title: 'Market Evidence',
    description: 'AI overlays signals directly onto price charts and market structure behavior — every conclusion mapped visually to the data.',
    gradient: 'from-neural-purple to-neural-magenta',
  },
  {
    icon: BarChart3,
    title: 'Performance Proof',
    description: 'Backtesting dashboards validate strategy performance across multiple market environments — measurable, transparent, verifiable.',
    gradient: 'from-neural-magenta to-neural-green',
  },
];

export const TrustFlowSection = () => {
  return (
    <section id="intelligence" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">How QuantLabs Thinks</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AI conclusion → Market evidence → Performance proof.
            Every insight follows this trust chain.
          </p>
        </motion.div>

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col, i) => (
            <motion.div
              key={col.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="group relative"
            >
              <div className="relative h-full p-8 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 text-center">
                {/* Step number */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background border border-border text-xs font-mono text-muted-foreground">
                  Step {i + 1}
                </div>

                {/* Icon */}
                <div className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${col.gradient} mb-5 mt-2`}>
                  <col.icon className="w-7 h-7 text-background" />
                </div>

                {/* Content */}
                <h3 className="font-display text-xl font-semibold mb-3 text-foreground">
                  {col.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {col.description}
                </p>

                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${col.gradient} opacity-5`} />
                </div>
              </div>

              {/* Connector arrow (between columns) */}
              {i < columns.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <div className="w-6 h-px bg-gradient-to-r from-primary/50 to-primary/20" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
