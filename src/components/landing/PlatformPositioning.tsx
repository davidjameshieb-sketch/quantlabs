import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';

export const PlatformPositioning = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative z-10 mx-auto max-w-3xl px-4 py-8"
    >
      <div className="text-center space-y-3">
        <Brain className="w-5 h-5 text-primary mx-auto opacity-40" />
        <p className="font-display text-sm md:text-base text-muted-foreground/60 leading-relaxed italic">
          "QuantLabs is not a trading signal platform.
          <br className="hidden sm:block" />
          It is a coordinated AI intelligence ecosystem."
        </p>
        <div className="flex items-center justify-center gap-2">
          <div className="w-8 h-px bg-gradient-to-r from-transparent to-primary/30" />
          <span className="text-[9px] font-display uppercase tracking-[0.2em] text-muted-foreground/40">
            No Hype · Fully Logged · Auditable Intelligence
          </span>
          <div className="w-8 h-px bg-gradient-to-l from-transparent to-primary/30" />
        </div>
      </div>
    </motion.div>
  );
};
