import { motion } from 'framer-motion';
import { Activity, Brain, BarChart3, Shield, TrendingUp } from 'lucide-react';

const dashboardPanels = [
  {
    icon: Brain,
    label: 'Scalp Consensus',
    desc: 'Multi-agent agreement',
    value: '92%',
    gradient: 'from-neural-cyan to-neural-purple',
  },
  {
    icon: Activity,
    label: 'Scalping Mode',
    desc: 'High-frequency active',
    value: 'LIVE',
    gradient: 'from-neural-green to-neural-cyan',
  },
  {
    icon: BarChart3,
    label: 'Scalp Win Rate',
    desc: 'Last 5 days',
    value: '78%',
    gradient: 'from-neural-purple to-neural-magenta',
  },
  {
    icon: TrendingUp,
    label: 'Active Scalps',
    desc: 'Open positions',
    value: '6',
    gradient: 'from-neural-orange to-neural-red',
  },
  {
    icon: Shield,
    label: 'Avg Scalp Duration',
    desc: 'Minutes per trade',
    value: '8m',
    gradient: 'from-neural-cyan to-neural-green',
  },
];

export const DemonstrationSection = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl border border-border/30 bg-card/10 backdrop-blur-sm p-6 md:p-10 overflow-hidden"
        >
          {/* Animated background glow */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-neural-purple/5 rounded-full blur-3xl pointer-events-none" />

          {/* Dashboard mock panels */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
            {dashboardPanels.map((panel, i) => (
              <motion.div
                key={panel.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative p-4 rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm group hover:border-primary/30 transition-colors"
              >
                <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${panel.gradient} mb-3`}>
                  <panel.icon className="w-4 h-4 text-background" />
                </div>
                <p className="text-xs text-muted-foreground mb-1">{panel.label}</p>
                <p className="font-display text-lg font-bold text-foreground">{panel.value}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{panel.desc}</p>

                {/* Pulse indicator */}
                <div className="absolute top-3 right-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-neural-green" />
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Animated scan line */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <motion.div
              className="w-full h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
              animate={{ y: [0, 400, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </motion.div>

        {/* Caption */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-sm text-muted-foreground/60 mt-6 font-mono"
        >
          Watch high-frequency FX scalping intelligence execute in real time.
        </motion.p>
      </div>
    </section>
  );
};
