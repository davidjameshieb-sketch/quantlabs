import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Eye, Crown, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isFoundersEventActive } from '@/lib/foundersEvent';

const accessFeatures = [
  'Real-time AI trade signals',
  'Full AI Fleet performance dashboards',
  'Live trade verification panels',
  'Governance Meta-Controller visibility',
  'Optimization evolution tracking',
  'Multi-agent consensus scoring',
  'Advanced backtesting analytics',
  'Intelligence coordination visualization',
];

const verificationItems = [
  { label: 'Entire AI Fleet Active', icon: Zap },
  { label: 'Verified Trade History Public', icon: Shield },
  { label: 'Multi-Agent Governance Active', icon: Crown },
  { label: 'Institutional Intelligence Network Enabled', icon: Eye },
];

export const AccessModelSection = () => {
  const foundersActive = isFoundersEventActive();

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
            <span className="text-gradient-neural">
              {foundersActive ? 'Full Intelligence Unlocked' : 'Access Clarity'}
            </span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            {foundersActive
              ? 'During the Founders Access window, the entire QuantLabs intelligence ecosystem is open to all users.'
              : 'Full platform visibility at every level. Founding members lock in discounted rates permanently.'
            }
          </p>
        </motion.div>

        {foundersActive ? (
          /* Founders Access — single unified card */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto"
          >
            <div className={cn(
              'p-8 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm relative'
            )}>
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-display font-bold">
                FOUNDERS ACCESS — FULL PLATFORM
              </div>

              <div className="text-center mb-6">
                <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                  Complete Intelligence Access
                </h3>
                <p className="text-sm text-muted-foreground">
                  Zero restrictions. Zero payment required. Full AI ecosystem visibility.
                </p>
              </div>

              {/* Verification strip */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {verificationItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 p-2.5 rounded-lg bg-background/10 border border-border/20">
                    <item.icon className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Feature list */}
              <ul className="space-y-2.5 mb-6">
                {accessFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <Check className="w-3.5 h-3.5 text-neural-green mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                className="w-full font-display text-base py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              >
                <Link to="/dashboard">
                  Enter Intelligence Command Center
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        ) : (
          /* Post-event: show Free vs Edge tiers */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="p-6 rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm hover:border-primary/20 transition-colors"
            >
              <h3 className="font-display text-base font-bold text-foreground mb-2">Free Dashboard Access</h3>
              <p className="text-[11px] text-muted-foreground/70 mb-4">Delayed intelligence with full platform navigation.</p>
              <Button asChild size="sm" variant="outline" className="w-full font-display text-xs">
                <Link to="/dashboard">Enter Free Dashboard <ArrowRight className="ml-1.5 w-3 h-3" /></Link>
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="p-6 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm hover:border-primary/50 transition-colors"
            >
              <h3 className="font-display text-base font-bold text-foreground mb-2">Edge Intelligence</h3>
              <p className="text-[11px] text-muted-foreground/70 mb-4">Full live intelligence and governance visibility.</p>
              <Button asChild size="sm" className="w-full font-display text-xs bg-primary hover:bg-primary/90">
                <Link to="/auth">Unlock Edge Access <ArrowRight className="ml-1.5 w-3 h-3" /></Link>
              </Button>
            </motion.div>
          </div>
        )}
      </div>
    </section>
  );
};
