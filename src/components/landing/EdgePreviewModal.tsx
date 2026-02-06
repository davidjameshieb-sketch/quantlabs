import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Check, ArrowRight, BarChart3, Brain, Activity, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { TIER_PRICES } from '@/lib/market/tierAccess';

interface EdgePreviewModalProps {
  open: boolean;
  onClose: () => void;
}

const EDGE_HIGHLIGHTS = [
  { icon: Activity, label: '15-min delayed intraday data across all markets' },
  { icon: Brain, label: 'Advanced multi-AI collaboration dashboards' },
  { icon: BarChart3, label: 'Full backtesting & performance analytics' },
  { icon: Shield, label: 'AI decision overlays with reasoning transparency' },
];

export const EdgePreviewModal = ({ open, onClose }: EdgePreviewModalProps) => {
  const isMobile = useIsMobile();
  const price = TIER_PRICES.edge;
  const discount = Math.round(((price.original - price.current) / price.original) * 100);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — dashboard visible behind */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/25 backdrop-blur-sm"
            onClick={onClose}
          />

          {isMobile ? (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[65vh] rounded-t-2xl border-t border-border/30 bg-card/90 backdrop-blur-md shadow-2xl"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="px-6 pb-8 overflow-auto">
                <PreviewContent price={price} discount={discount} onClose={onClose} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] rounded-2xl border border-border/30 bg-card/90 backdrop-blur-md shadow-2xl"
            >
              <button
                onClick={onClose}
                className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="p-8">
                <PreviewContent price={price} discount={discount} onClose={onClose} />
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};

function PreviewContent({
  price,
  discount,
  onClose,
}: {
  price: { current: number; original: number };
  discount: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold text-foreground">QuantLabs Edge Access</h3>
          <p className="text-sm text-muted-foreground mt-1">Full-power AI trading intelligence with intraday data and advanced analytics.</p>
        </div>
      </div>

      {/* Feature highlights with icons */}
      <div className="space-y-3">
        {EDGE_HIGHLIGHTS.map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/10">
            <item.icon className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-2 pt-1">
        <span className="text-3xl font-bold text-gradient-neural">${price.current}</span>
        <span className="text-sm text-muted-foreground">/month</span>
        <span className="text-sm line-through text-muted-foreground/50 ml-1">${price.original}</span>
        <span className="ml-1 px-2 py-0.5 rounded-full bg-neural-green/15 text-neural-green text-xs font-bold">
          {discount}% OFF
        </span>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-2 pt-2">
        <Button asChild size="lg" className="w-full font-display gap-2 py-5 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
          <Link to="/auth" onClick={onClose}>
            Unlock Edge Access
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} className="w-full text-muted-foreground hover:text-foreground">
          Continue Free
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/60 text-center">
        15-day free trial · Cancel anytime · Price locked while subscribed
      </p>
    </div>
  );
}
