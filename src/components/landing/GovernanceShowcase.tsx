import { motion } from 'framer-motion';
import { Shield, ChevronRight } from 'lucide-react';
import { ALL_GOVERNANCE_IDS, GOVERNANCE_DEFINITIONS } from '@/lib/agents/governanceConfig';
import { cn } from '@/lib/utils';

export const GovernanceShowcase = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neural-purple/30 bg-neural-purple/10 text-xs font-medium text-neural-purple mb-4">
            <Shield className="w-3 h-3" />
            Governance Council · 6 Specialized Agents
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">Governance Intelligence Council</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
            Six domain-specialized governance agents provide continuous oversight, mentorship,
            and strategic guidance to every trading and optimization agent in the fleet.
          </p>
        </motion.div>

        {/* Governance grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_GOVERNANCE_IDS.map((id, i) => {
            const agent = GOVERNANCE_DEFINITIONS[id];
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group"
              >
                <div className={cn(
                  'relative h-full rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm',
                  'p-6 transition-all duration-300',
                  'hover:border-neural-purple/40 hover:bg-background/20 hover:shadow-lg hover:shadow-neural-purple/5',
                )}>
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-2xl">{agent.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-display text-sm font-bold text-foreground leading-tight">
                        {agent.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {agent.model}
                      </p>
                    </div>
                    {/* Status */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neural-green/10 border border-neural-green/20">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neural-green" />
                      </span>
                      <span className="text-[9px] font-mono text-neural-green">Active</span>
                    </span>
                  </div>

                  {/* Domains */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded-full bg-neural-purple/10 border border-neural-purple/20 text-[10px] font-mono text-neural-purple">
                      {agent.primaryDomain}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                    <span className="px-2 py-0.5 rounded-full bg-muted/20 border border-border/20 text-[10px] font-mono text-muted-foreground">
                      {agent.secondaryDomain}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4 line-clamp-3">
                    {agent.description.split('.')[0]}.
                  </p>

                  {/* Governance actions */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-display">
                      Governance Actions
                    </span>
                    {agent.governanceActions.slice(0, 3).map((action) => (
                      <div key={action} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-neural-purple/60 shrink-0" />
                        <span className="text-[10px] text-muted-foreground/70">{action}</span>
                      </div>
                    ))}
                  </div>

                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-neural-purple/20" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
