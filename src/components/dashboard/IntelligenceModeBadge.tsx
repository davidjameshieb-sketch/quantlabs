import { useState } from 'react';
import { Clock, Zap, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getIntelligenceMode } from '@/lib/agents/tradeVisibility';
import { UpgradeModal } from './UpgradeModal';
import { cn } from '@/lib/utils';

interface IntelligenceModeBadgeProps {
  className?: string;
  showDescription?: boolean;
  compact?: boolean;
}

export const IntelligenceModeBadge = ({ className, showDescription = false, compact = false }: IntelligenceModeBadgeProps) => {
  const { subscribed } = useAuth();
  const mode = getIntelligenceMode(subscribed);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (subscribed) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-xs border-neural-green/30 bg-neural-green/10 text-neural-green gap-1',
          className
        )}
      >
        <Zap className={cn('shrink-0', compact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
        {compact ? 'Edge' : mode.label}
        {showDescription && (
          <span className="text-neural-green/70 ml-1">— {mode.description}</span>
        )}
      </Badge>
    );
  }

  return (
    <>
      <button onClick={() => setUpgradeOpen(true)}>
        <Badge
          variant="outline"
          className={cn(
            'text-xs border-border/50 bg-muted/30 text-muted-foreground gap-1 cursor-pointer hover:bg-muted/50 transition-colors',
            className
          )}
        >
          <Clock className={cn('shrink-0', compact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
          {compact ? 'Delayed' : mode.label}
          {showDescription && (
            <span className="text-muted-foreground/70 ml-1">— {mode.description}</span>
          )}
        </Badge>
      </button>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="liveTradeSignals"
        headline="Live Edge Signals Available"
        description="Upgrade to see AI trades when they happen — near real-time intelligence instead of 24-hour delay."
      />
    </>
  );
};
