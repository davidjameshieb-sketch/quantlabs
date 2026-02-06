import { useState } from 'react';
import { Lock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { UpgradeModal } from './UpgradeModal';
import type { TierFeatures } from '@/lib/market/tierAccess';

interface UpgradeBadgeProps {
  feature: keyof TierFeatures;
  label?: string;
  className?: string;
  variant?: 'inline' | 'button';
}

export const UpgradeBadge = ({ feature, label, className, variant = 'inline' }: UpgradeBadgeProps) => {
  const { subscribed } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  // Don't show badge if user has premium subscription
  if (subscribed) return null;

  if (variant === 'button') {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
            'bg-primary/10 border border-primary/20 text-primary',
            'hover:bg-primary/20 transition-colors cursor-pointer',
            'text-xs font-medium',
            className
          )}
        >
          <Zap className="w-3 h-3" />
          {label || 'Upgrade to Unlock'}
        </button>
        <UpgradeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feature={feature}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'bg-primary/10 border border-primary/20',
          'text-primary text-xs font-medium',
          'hover:bg-primary/20 transition-colors cursor-pointer',
          className
        )}
      >
        <Lock className="w-2.5 h-2.5" />
        {label || 'Edge'}
      </button>
      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        feature={feature}
      />
    </>
  );
};
