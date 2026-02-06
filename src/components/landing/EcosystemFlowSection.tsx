import { motion } from 'framer-motion';
import { Brain, TrendingUp, Shield, Cpu, Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const layers = [
  {
    icon: TrendingUp,
    title: 'Trading Fleet',
    agentCount: 10,
    desc: '10 specialized AI models executing across equities, crypto, forex, and indices markets with distinct analytical personalities.',
    gradient: 'from-neural-cyan to-primary',
    agents: ['Alpha Engine', 'Macro Pulse', 'Momentum Grid', 'Liquidity Radar', 'Range Navigator', 'Volatility Architect', 'Adaptive Learning Node', 'Sentiment Reactor', 'Fractal Intelligence', 'Risk Sentinel'],
  },
  {
    icon: Zap,
    title: 'Optimization Team',
    agentCount: 4,
    desc: 'Dedicated engines continuously refining risk parameters, trade timing, capital allocation, and performance across the fleet.',
    gradient: 'from-primary to-neural-cyan',
    agents: ['Risk Calibration Engine', 'Timing Precision Engine', 'Capital Flow Optimizer', 'Performance Catalyst'],
  },
  {
    icon: Shield,
    title: 'Governance Council',
    agentCount: 6,
    desc: 'Domain-specialized oversight agents ensuring macro alignment, liquidity compliance, signal integrity, and risk governance.',
    gradient: 'from-neural-purple to-neural-magenta',
    agents: ['Macro Oversight Governor', 'Liquidity Governance Director', 'Technical Standards Auditor', 'Risk Compliance Marshal', 'Behavioral Ethics Monitor', 'Regulatory Alignment Sentinel'],
  },
  {
    icon: Cpu,
    title: 'Evolution Meta-Controller',
    agentCount: 1,
    desc: 'Supervises parameter mutations, capital allocation, and adaptive evolution across the entire 20-agent ecosystem.',
    gradient: 'from-neural-magenta to-neural-green',
    agents: ['Meta-Controller AI'],
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
            Coordination Architecture · 21 AI Agents
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">AI Ecosystem Intelligence</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            A multi-layered adaptive ecosystem where trading agents execute, optimization engines refine,
            and governance councils oversee — all under Meta-Controller supervision.
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
              className="w-full max-w-2xl"
            >
              <div className={cn(
                'relative flex flex-col p-5 rounded-xl',
                'border border-border/20 bg-background/10 backdrop-blur-sm',
                'hover:border-primary/30 hover:bg-background/15 transition-all duration-300 group'
              )}>
                {/* Main row */}
                <div className="flex items-center gap-4">
                  <div className={`shrink-0 p-3 rounded-lg bg-gradient-to-br ${layer.gradient}`}>
                    <layer.icon className="w-5 h-5 text-background" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-display text-sm font-bold text-foreground">
                        {layer.title}
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-mono text-primary">
                        {layer.agentCount} {layer.agentCount === 1 ? 'agent' : 'agents'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {layer.desc}
                    </p>
                  </div>
                  {/* Step indicator */}
                  <div className="absolute -left-3 top-5 w-6 h-6 rounded-full bg-background/20 border border-border/30 backdrop-blur-sm flex items-center justify-center">
                    <span className="text-[10px] font-mono font-bold text-primary">{i + 1}</span>
                  </div>
                </div>

                {/* Agent names pill row */}
                <div className="flex flex-wrap gap-1.5 mt-3 pl-14">
                  {layer.agents.map((name) => (
                    <span
                      key={name}
                      className="px-2 py-0.5 rounded-full bg-card/20 border border-border/15 text-[9px] font-mono text-muted-foreground/70"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Connector arrow */}
              {i < layers.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="flex flex-col items-center">
                    <div className="w-px h-4 bg-gradient-to-b from-primary/40 to-primary/10" />
                    <ChevronDown className="w-3 h-3 text-primary/30 -mt-0.5" />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-center text-xs text-muted-foreground/60 mt-8 max-w-lg mx-auto"
        >
          QuantLabs AI models evolve continuously while operating under strict risk governance
          that preserves stability and performance integrity.
        </motion.p>
      </div>
    </section>
  );
};
