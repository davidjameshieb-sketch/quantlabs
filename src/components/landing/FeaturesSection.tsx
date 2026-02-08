import { motion } from 'framer-motion';
import { 
  Activity, 
  BarChart3, 
  Bot, 
  Eye, 
  Layers, 
  LineChart, 
  Shield, 
  TrendingUp,
  Zap 
} from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'High-Frequency Scalping',
    description: '500+ daily trade proposals filtered through 7-layer governance. Sub-15-minute average hold times with 72%+ win rate across major FX pairs.',
    gradient: 'from-neural-cyan to-neural-purple',
  },
  {
    icon: Bot,
    title: '10-Agent Scalping Fleet',
    description: 'Every AI agent is tuned for FX scalping — from Macro Pulse momentum scalps to Range Navigator fade trades. Coordinated, specialized, relentless.',
    gradient: 'from-neural-purple to-neural-magenta',
  },
  {
    icon: TrendingUp,
    title: 'Asymmetric Payoff Engine',
    description: 'Wins average ~0.35% while losses are capped at ~0.06%. The system profits through volume × asymmetry — not individual trade size.',
    gradient: 'from-neural-magenta to-neural-cyan',
  },
  {
    icon: BarChart3,
    title: 'Governance-Filtered Execution',
    description: 'Every scalp proposal passes through friction gates, MTF alignment checks, session scoring, and spread stability validation before execution.',
    gradient: 'from-neural-cyan to-neural-green',
  },
  {
    icon: Layers,
    title: 'Session-Optimized Trading',
    description: 'London and NY overlap sessions get aggressive scalping. Asian/Late-NY sessions are throttled. The system knows when to trade and when to wait.',
    gradient: 'from-neural-green to-neural-purple',
  },
  {
    icon: Eye,
    title: 'Full Scalp Transparency',
    description: 'Every scalp shows entry/exit reasoning, governance multipliers, spread conditions, and which agents contributed to the decision.',
    gradient: 'from-neural-purple to-neural-cyan',
  },
  {
    icon: Activity,
    title: 'OANDA Auto-Execution',
    description: 'Direct OANDA v20 API integration. 3-6 scalps per cron cycle, 1000-unit positions, practice account tested. From signal to fill in milliseconds.',
    gradient: 'from-neural-cyan to-neural-orange',
  },
  {
    icon: Shield,
    title: 'Risk-First Architecture',
    description: 'Ultra-tight drawdown caps, anti-overtrading governors, correlation clustering prevention, and daily loss circuit breakers protect every scalp.',
    gradient: 'from-neural-orange to-neural-purple',
  },
  {
    icon: LineChart,
    title: 'Volatility Regime Scalping',
    description: 'Ignition phases trigger breakout scalps. Expansion drives momentum captures. Compression and exhaustion are throttled. The AI reads the regime.',
    gradient: 'from-neural-purple to-neural-green',
  },
];

export const FeaturesSection = () => {
  return (
    <section id="features" className="relative py-24 px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background pointer-events-none" />

      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">FX Scalping Intelligence</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            10 specialized AI agents running high-frequency scalps on major forex pairs.
            Governance-filtered. OANDA-executed. Fully transparent.
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <div className="relative h-full p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-card/80">
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} mb-4`}>
                  <feature.icon className="w-6 h-6 text-background" />
                </div>

                {/* Content */}
                <h3 className="font-display text-xl font-semibold mb-2 text-foreground">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover glow effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-5`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
