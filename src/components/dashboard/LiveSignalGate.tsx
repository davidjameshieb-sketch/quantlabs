import { useState } from 'react';
import { Lock, Zap, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UpgradeModal } from './UpgradeModal';
import { cn } from '@/lib/utils';

interface LiveSignalGateProps {
  hiddenCount: number;
  className?: string;
}

/**
 * Inline upgrade prompt shown when free users have hidden (delayed) trades.
 * Communicates how many live signals are being withheld.
 */
export const LiveSignalGate = ({ hiddenCount, className }: LiveSignalGateProps) => {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (hiddenCount <= 0) return null;

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between gap-3 p-3 rounded-lg',
          'bg-primary/5 border border-primary/20',
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
            <Lock className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              {hiddenCount} Live Edge Signal{hiddenCount !== 1 ? 's' : ''} Available
            </p>
            <p className="text-xs text-muted-foreground truncate">
              Upgrade to see AI trades when they happen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="default"
            onClick={() => setUpgradeOpen(true)}
            className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
          >
            <Zap className="w-3 h-3" />
            Unlock Edge
          </Button>
        </div>
      </div>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="liveTradeSignals"
        headline="Live Edge Signals Available"
        description={`${hiddenCount} AI trade signal${hiddenCount !== 1 ? 's' : ''} are available right now. Upgrade to Edge Access for near real-time AI intelligence.`}
      />
    </>
  );
};
