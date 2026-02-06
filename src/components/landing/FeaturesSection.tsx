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
    icon: Activity,
    title: 'Efficiency Score',
    description: 'Measure how direct price movement is — separating clean trends from choppy conditions with our proprietary net move vs path noise ratio.',
    gradient: 'from-neural-cyan to-neural-purple',
  },
  {
    icon: Bot,
    title: 'Multi-AI Collaboration',
    description: 'Multiple specialized AI models analyze markets simultaneously — equities, forex, and crypto agents coordinate to find the best opportunities.',
    gradient: 'from-neural-purple to-neural-magenta',
  },
  {
    icon: TrendingUp,
    title: 'Quantitative Analysis',
    description: 'Data-driven decision intelligence with volatility analysis, trend detection, and regime classification — all measurable and transparent.',
    gradient: 'from-neural-magenta to-neural-cyan',
  },
  {
    icon: BarChart3,
    title: 'AI Backtesting Engine',
    description: 'Every AI strategy is fully backtested with win/loss ratios, drawdown metrics, Sharpe ratio, and performance by market regime.',
    gradient: 'from-neural-cyan to-neural-green',
  },
  {
    icon: Layers,
    title: 'Multi-Timeframe Analysis',
    description: 'See alignment or divergence across timeframes. When all timeframes agree, structure is strongest.',
    gradient: 'from-neural-green to-neural-purple',
  },
  {
    icon: Eye,
    title: 'AI Decision Overlays',
    description: 'See which AI tools are actively influencing trade logic, real-time decision reasoning, and active strategy components.',
    gradient: 'from-neural-purple to-neural-cyan',
  },
  {
    icon: LineChart,
    title: 'Cross-Market Scanner',
    description: 'Find the strongest and weakest structures across equities, crypto, and forex in one unified view.',
    gradient: 'from-neural-cyan to-neural-orange',
  },
  {
    icon: Shield,
    title: 'Glass Box Transparency',
    description: 'Every AI conclusion is explained in plain English. See what the system sees, how it thinks, and why it concludes.',
    gradient: 'from-neural-orange to-neural-purple',
  },
  {
    icon: Zap,
    title: 'Dynamic AI Coordination',
    description: 'The best-performing AI automatically leads based on current market conditions — adaptive, measurable, and always evolving.',
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
            <span className="text-gradient-neural">AI Trading Intelligence</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Collaborative AI models working together. Transparent, quantitative, 
            and designed for advanced traders who demand measurable performance.
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
