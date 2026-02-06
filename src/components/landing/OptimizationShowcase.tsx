import { motion } from 'framer-motion';
import { Zap, ChevronRight } from 'lucide-react';
import { ALL_OPTIMIZATION_IDS, OPTIMIZATION_DEFINITIONS } from '@/lib/agents/optimizationConfig';
import { cn } from '@/lib/utils';

export const OptimizationShowcase = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neural-cyan/30 bg-neural-cyan/10 text-xs font-medium text-neural-cyan mb-4">
            <Zap className="w-3 h-3" />
            Optimization Team · 4 Dedicated Engines
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">Optimization Intelligence</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
            Four dedicated optimization engines continuously refine risk management, trade timing,
            capital allocation, and performance — ensuring the fleet evolves without compromising stability.
          </p>
        </motion.div>

        {/* Optimization grid - 2x2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ALL_OPTIMIZATION_IDS.map((id, i) => {
            const agent = OPTIMIZATION_DEFINITIONS[id];
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="group"
              >
                <div className={cn(
                  'relative h-full rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm',
                  'p-6 transition-all duration-300',
                  'hover:border-neural-cyan/40 hover:bg-background/20 hover:shadow-lg hover:shadow-neural-cyan/5',
                )}>
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-2xl">{agent.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-display text-sm font-bold text-foreground leading-tight">
                        {agent.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {agent.title}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-muted/20 border border-border/20 text-[10px] font-mono text-muted-foreground">
                      {agent.model}
                    </span>
                  </div>

                  {/* Focus badge */}
                  <div className="mb-3">
                    <span className="px-2.5 py-1 rounded-full bg-neural-cyan/10 border border-neural-cyan/20 text-[10px] font-mono text-neural-cyan">
                      Focus: {agent.optimizationFocus}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4 line-clamp-3">
                    {agent.description.split('.')[0]}.
                  </p>

                  {/* Methodology */}
                  <div className="rounded-lg bg-card/20 border border-border/10 p-3 mb-4">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-display block mb-1.5">
                      Methodology
                    </span>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      {agent.methodology}
                    </p>
                  </div>

                  {/* Optimization targets */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {agent.optimizationTargets.map((target) => (
                      <div key={target} className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-neural-cyan/60 shrink-0" />
                        <span className="text-[10px] text-muted-foreground/70 truncate">{target}</span>
                      </div>
                    ))}
                  </div>

                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-neural-cyan/20" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
