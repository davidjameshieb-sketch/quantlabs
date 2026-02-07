import { motion } from 'framer-motion';
import { AlertTriangle, Shield } from 'lucide-react';

export const AntiHypeTrustSection = () => {
  return (
    <section className="relative py-12 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm p-8 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-muted-foreground/60" />
            <span className="text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground/60">
              Performance Disclaimer
            </span>
          </div>

          <p className="font-display text-lg md:text-xl font-bold text-foreground mb-2">
            QuantLabs does not guarantee profits.
          </p>
          <p className="font-display text-lg md:text-xl font-bold text-primary">
            QuantLabs guarantees transparent performance intelligence.
          </p>

          <div className="flex items-center justify-center gap-2 mt-5">
            <Shield className="w-3 h-3 text-neural-green" />
            <span className="text-[10px] font-mono text-muted-foreground/60">
              All trade records are verified lifecycle events · Past performance does not indicate future results
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
