import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Eye, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isFoundersEventActive } from '@/lib/foundersEvent';

export const PlatformVisionClose = () => {
  const foundersActive = isFoundersEventActive();

  return (
    <section className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/3 rounded-full blur-3xl pointer-events-none" />

      <div className="container relative z-10 max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground/60">
            A Transparent Coordinated Artificial Intelligence Trading Institution
          </p>

          <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground leading-tight">
            QuantLabs is a coordinated artificial intelligence ecosystem designed to{' '}
            <span className="text-gradient-neural">evolve with financial markets</span>{' '}
            while maintaining transparency, accountability, and performance discipline.
          </h2>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              asChild
              size="lg"
              className="text-base px-10 py-6 font-display bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
            >
              <Link to="/dashboard">
                {foundersActive ? 'Enter Intelligence Command Center' : 'Enter Free Dashboard'}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="text-base px-10 py-6 font-display border-primary/30 hover:bg-primary/10 text-primary hover:text-primary gap-2"
            >
              <Link to="/dashboard">
                <Eye className="w-4 h-4" />
                {foundersActive ? 'Observe AI Fleet Coordination' : 'Explore Intelligence Network'}
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/50">
            {foundersActive
              ? 'Full platform access · All intelligence unlocked · Founders Access active'
              : 'No credit card required · Full platform access · Previous-day data included free'
            }
          </p>
        </motion.div>
      </div>
    </section>
  );
};
