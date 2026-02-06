import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const freeFeatures = [
  'Full platform navigation',
  'Historical AI performance visibility',
  'Delayed trade execution data',
  'Full AI dashboard exploration',
  'All 10 agent profiles & analytics',
  'Market scanner access',
];

const edgeFeatures = [
  'Live trade execution feeds',
  'Intraday governance intelligence',
  'Real-time AI evolution monitoring',
  'Immediate trade signal visibility',
  'Multi-agent consensus scoring',
  'Priority feature access',
];

export const AccessModelSection = () => {
  return (
    <section id="access" className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            <span className="text-gradient-neural">Access Clarity</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Full platform visibility at every level. Upgrade when you need real-time intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={cn(
              'p-6 rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm',
              'hover:border-primary/20 transition-colors'
            )}
          >
            <div className="flex items-center gap-2 mb-4">
              <Unlock className="w-4 h-4 text-neural-green" />
              <h3 className="font-display text-base font-bold text-foreground">Free Dashboard Access</h3>
            </div>
            <ul className="space-y-2.5 mb-6">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-neural-green mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="w-full font-display text-xs border-border/30 hover:bg-muted/20"
            >
              <Link to="/dashboard">
                Enter Free Dashboard
                <ArrowRight className="ml-1.5 w-3 h-3" />
              </Link>
            </Button>
          </motion.div>

          {/* Edge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={cn(
              'p-6 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm',
              'hover:border-primary/50 transition-colors relative'
            )}
          >
            <div className="absolute -top-2.5 right-4 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-display font-bold">
              EDGE ACCESS
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-primary" />
              <h3 className="font-display text-base font-bold text-foreground">Edge Intelligence</h3>
            </div>
            <ul className="space-y-2.5 mb-6">
              {edgeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="sm"
              className="w-full font-display text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
            >
              <Link to="/auth">
                Unlock Edge Access
                <ArrowRight className="ml-1.5 w-3 h-3" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
