import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NeuralBackground } from '@/components/landing/NeuralBackground';
import { useAuth } from '@/contexts/AuthContext';

const BillingSuccess = () => {
  const { checkSubscription } = useAuth();

  useEffect(() => {
    // Refresh subscription status after successful checkout
    const timer = setTimeout(() => {
      checkSubscription();
    }, 2000);
    return () => clearTimeout(timer);
  }, [checkSubscription]);

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <NeuralBackground />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Activity className="w-10 h-10 text-primary" />
          <span className="font-display font-bold text-2xl text-gradient-neural">QuantLabs</span>
        </Link>

        <Card className="border-border/50 bg-card/80 backdrop-blur-xl">
          <CardContent className="p-8 text-center space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <CheckCircle className="w-16 h-16 text-[hsl(var(--neural-green))] mx-auto" />
            </motion.div>

            <div>
              <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                Edge Access Activated
              </h1>
              <p className="text-muted-foreground">
                Welcome to QuantLabs Edge. Your premium intelligence is now live across all markets.
              </p>
            </div>

            <div className="space-y-3 text-sm text-left">
              {[
                '15-minute delayed intraday data',
                'Advanced AI analytics dashboards',
                'Full backtesting intelligence',
                'Real-time signal overlays',
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>

            <Button asChild size="lg" className="w-full font-display gap-2">
              <Link to="/dashboard">
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default BillingSuccess;
