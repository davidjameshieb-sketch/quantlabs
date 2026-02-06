import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ConfidenceCloseSection = () => {
  return (
    <section className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-3xl pointer-events-none" />

      <div className="container relative z-10 max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-8"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Built for traders who want{' '}
            <span className="text-gradient-neural">transparency</span>,{' '}
            measurable strategy performance, and{' '}
            <span className="text-gradient-neural">AI-driven market intelligence</span>.
          </h2>

          <Button
            asChild
            size="lg"
            className="text-base px-10 py-6 font-display bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Link to="/dashboard">
              Enter the Dashboard
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>

          <p className="text-xs text-muted-foreground/50">
            No credit card required · Full platform access · Previous-day data included free
          </p>
        </motion.div>
      </div>
    </section>
  );
};
