import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Check, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { TIER_PRICES } from '@/lib/market/tierAccess';
import { cn } from '@/lib/utils';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature?: string;
  headline?: string;
  description?: string;
}

const FEATURE_HEADLINES: Record<string, { headline: string; description: string }> = {
  intradayData: {
    headline: 'Unlock Intraday Intelligence',
    description: 'Get 15-minute delayed intraday data across all markets — equities, crypto, and forex.',
  },
  advancedBacktesting: {
    headline: 'Advanced Backtesting Engine',
    description: 'Full AI backtesting with win/loss ratios, drawdown metrics, and performance by market regime.',
  },
  aiDecisionOverlays: {
    headline: 'AI Decision Overlays',
    description: 'See real-time AI decision reasoning, active strategy components, and signal logic overlays.',
  },
  performanceBreakdowns: {
    headline: 'Performance Analytics',
    description: 'Quantitative performance breakdowns by condition, volatility, and market type.',
  },
  signalTracking: {
    headline: 'Full Signal Tracking',
    description: 'Track AI signals across all timeframes with full intraday resolution.',
  },
  default: {
    headline: 'Upgrade Your Trading Edge',
    description: 'Unlock the full power of QuantLabs AI intelligence with Edge Access.',
  },
};

const UPGRADE_FEATURES = [
  '15-minute delayed intraday data',
  'Full AI trading analytics',
  'Advanced backtesting engine',
  'AI decision overlays',
  'Priority feature access',
];

export const UpgradeModal = ({
  open,
  onClose,
  feature,
  headline,
  description,
}: UpgradeModalProps) => {
  const isMobile = useIsMobile();
  const featureConfig = FEATURE_HEADLINES[feature || 'default'] || FEATURE_HEADLINES.default;
  const displayHeadline = headline || featureConfig.headline;
  const displayDescription = description || featureConfig.description;
  const price = TIER_PRICES.edge;
  const discount = Math.round(((price.original - price.current) / price.original) * 100);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          {isMobile ? (
            // Mobile: Bottom sheet
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] rounded-t-2xl border-t border-border bg-card shadow-2xl"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="px-6 pb-8 overflow-auto">
                <ModalContent
                  headline={displayHeadline}
                  description={displayDescription}
                  price={price}
                  discount={discount}
                  onClose={onClose}
                />
              </div>
            </motion.div>
          ) : (
            // Desktop: Centered overlay card
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] rounded-2xl border border-border bg-card shadow-2xl"
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-8">
                <ModalContent
                  headline={displayHeadline}
                  description={displayDescription}
                  price={price}
                  discount={discount}
                  onClose={onClose}
                />
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};

function ModalContent({
  headline,
  description,
  price,
  discount,
  onClose,
}: {
  headline: string;
  description: string;
  price: { current: number; original: number };
  discount: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Icon + headline */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold text-foreground">{headline}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-2 pt-1">
        <span className="text-3xl font-bold text-gradient-neural">${price.current}</span>
        <span className="text-sm text-muted-foreground">/month</span>
        <span className="text-sm line-through text-muted-foreground/50 ml-1">${price.original}</span>
        <span className="ml-1 px-2 py-0.5 rounded-full bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] text-xs font-bold">
          {discount}% OFF
        </span>
      </div>

      {/* Feature list */}
      <ul className="space-y-2">
        {UPGRADE_FEATURES.map((feat, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Check className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">{feat}</span>
          </li>
        ))}
      </ul>

      {/* CTAs */}
      <div className="flex flex-col gap-2 pt-2">
        <Button asChild size="lg" className="w-full font-display gap-2 py-5 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
          <Link to="/auth" onClick={onClose}>
            Upgrade to Edge Access
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          Continue with Free
        </Button>
      </div>

      {/* Trust note */}
      <p className="text-xs text-muted-foreground/60 text-center">
        Cancel anytime · Price locked while subscribed · No credit card to explore
      </p>
    </div>
  );
}
