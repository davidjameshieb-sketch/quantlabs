// ═══════════════════════════════════════════════════════════════
// Agent State Badges — Visual language for effective agent states
// Shows rescue status, constraints, deployment, and effective tier
// ═══════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AgentEffectiveState, EffectiveTier, AgentBadge as AgentBadgeType } from '@/lib/agents/agentStateResolver';
import { EFFECTIVE_TIER_STYLES } from '@/lib/agents/agentStateResolver';
import { Shield, Eye, Zap, Ban, Rocket, AlertTriangle, Info } from 'lucide-react';

// ─── Effective Tier Badge ────────────────────────────────────

export function EffectiveTierBadge({ tier, size = 'sm' }: { tier: EffectiveTier; size?: 'sm' | 'md' }) {
  const style = EFFECTIVE_TIER_STYLES[tier];
  const tierCode = tier.startsWith('B-') ? `B` : tier;
  return (
    <Badge
      variant="outline"
      className={cn(
        style.bg, style.text,
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-[11px] px-2 py-0.5',
      )}
    >
      {tierCode}: {style.label}
    </Badge>
  );
}

// ─── Constraint Badge ────────────────────────────────────────

export function AgentConstraintBadge({ badge }: { badge: AgentBadgeType }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', badge.color)}>
            {badge.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs">{badge.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Agent Badge Row (all badges for an agent) ──────────────

export function AgentBadgeRow({ state, maxBadges = 4 }: { state: AgentEffectiveState; maxBadges?: number }) {
  const visibleBadges = state.badges.slice(0, maxBadges);
  const remaining = state.badges.length - maxBadges;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <EffectiveTierBadge tier={state.effectiveTier} />
      {visibleBadges.map((b, i) => (
        <AgentConstraintBadge key={`${b.type}-${i}`} badge={b} />
      ))}
      {remaining > 0 && (
        <span className="text-[9px] text-muted-foreground">+{remaining}</span>
      )}
    </div>
  );
}

// ─── Deployment State Icon ──────────────────────────────────

export function DeploymentStateIcon({ state }: { state: AgentEffectiveState }) {
  const iconMap = {
    'normal-live': { Icon: Rocket, cls: 'text-emerald-400', label: 'Normal Live' },
    'reduced-live': { Icon: Zap, cls: 'text-yellow-400', label: `Reduced ${state.sizeMultiplier}×` },
    'shadow': { Icon: Eye, cls: 'text-blue-400', label: 'Shadow Only' },
    'disabled': { Icon: Ban, cls: 'text-red-400', label: 'Disabled' },
  };
  const { Icon, cls, label } = iconMap[state.deploymentState];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1 text-[10px]', cls)}>
            <Icon className="w-3 h-3" />{label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{label} — {state.sizeMultiplier}× sizing</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Stability Score Bar ────────────────────────────────────

export function StabilityScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted/20 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">{score}</span>
    </div>
  );
}

// ─── Post-Rescue Metrics Tooltip ────────────────────────────

export function PostRescueMetricsNote({ state }: { state: AgentEffectiveState }) {
  if (!state.rescued) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-[9px] text-lime-400/70 cursor-help">
            <Info className="w-3 h-3" />Post-rescue
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <p className="text-xs">
            Metrics shown after rescue constraints applied. Historical losses excluded.
            Raw: {state.rawMetrics.netPips.toFixed(0)}p PF {state.rawMetrics.profitFactor.toFixed(2)} →
            Effective: {state.effectiveMetrics.netPips.toFixed(0)}p PF {state.effectiveMetrics.profitFactor.toFixed(2)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Legacy State Warning Banner ────────────────────────────

export function LegacyStateWarningBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>⚠ Some agent metrics are legacy. Refresh or migrate to see effective post-rescue state.</span>
    </div>
  );
}
