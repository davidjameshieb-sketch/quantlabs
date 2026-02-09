// Governance State Banner
// Compact top-level indicator of adaptive governance operating state

import { motion } from 'framer-motion';
import {
  Shield, ShieldAlert, ShieldOff, ShieldCheck, AlertTriangle,
  TrendingUp, TrendingDown, Ban, Star, Minus, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  GovernanceState,
  GovernanceStateConfig,
  GOVERNANCE_STATE_CONFIGS,
  PairAllocation,
  SessionBudget,
} from '@/lib/forex/adaptiveGovernanceEngine';

interface GovernanceStateBannerProps {
  state: GovernanceState;
  reasons: string[];
  promotedPairs: string[];
  restrictedPairs: string[];
  bannedPairs: string[];
  sessionBudgets: SessionBudget[];
}

const stateUI: Record<GovernanceState, {
  icon: React.ElementType;
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = {
  NORMAL: {
    icon: ShieldCheck,
    bg: 'bg-[hsl(var(--neural-green))]/5',
    border: 'border-[hsl(var(--neural-green))]/30',
    text: 'text-[hsl(var(--neural-green))]',
    badge: 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30',
  },
  DEFENSIVE: {
    icon: Shield,
    bg: 'bg-[hsl(var(--neural-orange))]/5',
    border: 'border-[hsl(var(--neural-orange))]/30',
    text: 'text-[hsl(var(--neural-orange))]',
    badge: 'bg-[hsl(var(--neural-orange))]/15 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30',
  },
  THROTTLED: {
    icon: ShieldAlert,
    bg: 'bg-[hsl(var(--neural-orange))]/10',
    border: 'border-[hsl(var(--neural-orange))]/40',
    text: 'text-[hsl(var(--neural-orange))]',
    badge: 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/40',
  },
  HALT: {
    icon: ShieldOff,
    bg: 'bg-[hsl(var(--neural-red))]/10',
    border: 'border-[hsl(var(--neural-red))]/40',
    text: 'text-[hsl(var(--neural-red))]',
    badge: 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/40',
  },
};

export const GovernanceStateBanner = ({
  state,
  reasons,
  promotedPairs,
  restrictedPairs,
  bannedPairs,
  sessionBudgets,
}: GovernanceStateBannerProps) => {
  const config = GOVERNANCE_STATE_CONFIGS[state];
  const ui = stateUI[state];
  const Icon = ui.icon;

  const activeSessions = sessionBudgets.filter(s => s.maxDensity > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('p-3 rounded-xl border space-y-2', ui.bg, ui.border)}
    >
      {/* Top row: state badge + config */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', ui.text)} />
          <Badge variant="outline" className={cn('text-[10px] font-bold px-2 py-0.5', ui.badge)}>
            {config.label.toUpperCase()}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            Density {(config.densityMultiplier * 100).toFixed(0)}% · Sizing {(config.sizingMultiplier * 100).toFixed(0)}% · K={config.frictionK}
          </span>
        </div>

        {/* Pair status summary */}
        <div className="flex items-center gap-2 text-[9px]">
          {promotedPairs.length > 0 && (
            <span className="flex items-center gap-0.5 text-[hsl(var(--neural-green))]">
              <Star className="w-2.5 h-2.5" />{promotedPairs.length} promoted
            </span>
          )}
          {restrictedPairs.length > 0 && (
            <span className="flex items-center gap-0.5 text-[hsl(var(--neural-orange))]">
              <Minus className="w-2.5 h-2.5" />{restrictedPairs.length} restricted
            </span>
          )}
          {bannedPairs.length > 0 && (
            <span className="flex items-center gap-0.5 text-[hsl(var(--neural-red))]">
              <Ban className="w-2.5 h-2.5" />{bannedPairs.length} banned
            </span>
          )}
        </div>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && state !== 'NORMAL' && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-muted/10 px-1.5 py-0.5 rounded">
              <AlertTriangle className="w-2 h-2" />{r}
            </span>
          ))}
        </div>
      )}

      {/* Recovery conditions for non-NORMAL */}
      {state !== 'NORMAL' && config.recoveryConditions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider mr-1">Recovery:</span>
          {config.recoveryConditions.map((c, i) => (
            <span key={i} className="text-[8px] text-muted-foreground/70 bg-muted/5 px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
};
