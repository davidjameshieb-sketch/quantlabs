import { Info } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HelpTooltipProps {
  title: string;
  description: string;
  tip?: string;
  formula?: string;
  className?: string;
  iconClassName?: string;
}

export const HelpTooltip = ({ 
  title, 
  description, 
  tip, 
  formula,
  className,
  iconClassName 
}: HelpTooltipProps) => {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button 
          className={cn(
            "inline-flex items-center justify-center w-4 h-4 rounded-full",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            "transition-colors cursor-help",
            className
          )}
        >
          <Info className={cn("w-3.5 h-3.5", iconClassName)} />
        </button>
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="max-w-xs p-3 bg-popover/95 backdrop-blur-sm border-border/50"
      >
        <div className="space-y-2">
          <p className="font-medium text-foreground text-sm">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
          {formula && (
            <p className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">
              {formula}
            </p>
          )}
          {tip && (
            <p className="text-xs text-primary/80 italic">
              💡 {tip}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// Pre-configured tooltips for common metrics
export const EfficiencyTooltip = () => (
  <HelpTooltip
    title="Movement Efficiency"
    description="Measures how directly price moved toward its goal. Clean = direct path, Noisy = lots of back-and-forth."
    formula="Net Move / Total Path"
    tip="Values above 60% indicate strong trending conditions."
  />
);

export const ConfidenceTooltip = () => (
  <HelpTooltip
    title="Trend Confidence"
    description="How separated the fast and slow trend cores are, relative to volatility. Wide separation = strong conviction."
    formula="(Spread / ATR) × 100"
    tip="Above 70% suggests a committed directional move."
  />
);

export const StrategyTooltip = () => (
  <HelpTooltip
    title="Strategy State"
    description="AI-derived recommendation based on trend strength and movement quality. PRESSING = optimal, AVOIDING = stay away."
    tip="Derived from Macro Strength × Efficiency matrix."
  />
);

export const TrendCoreTooltip = () => (
  <HelpTooltip
    title="Trend Cores"
    description="Fast Core (8-period) shows momentum, Slow Core (21-period) shows underlying structure. Watch the gap between them."
    tip="Widening gap = strengthening trend, narrowing = weakening."
  />
);

export const SignalTooltip = ({ signal }: { signal: string }) => {
  const descriptions: Record<string, { title: string; desc: string; threshold: string }> = {
    trendActive: {
      title: "Trend Active",
      desc: "True when trend cores are sufficiently separated.",
      threshold: "Spread > 0.5 × ATR"
    },
    cleanFlow: {
      title: "Clean Flow",
      desc: "True when price movement is efficient and direct.",
      threshold: "Efficiency > 60%"
    },
    highConviction: {
      title: "High Conviction",
      desc: "True when confidence score is elevated.",
      threshold: "Confidence > 70%"
    },
    structureGaining: {
      title: "Structure Gaining",
      desc: "True when trend cores are diverging.",
      threshold: "SpreadDelta > 0"
    },
    volatilityExpanding: {
      title: "Volatility Expanding",
      desc: "True when current volatility exceeds recent average.",
      threshold: "ATR > 14-period SMA"
    },
    trendingMode: {
      title: "Trending Mode",
      desc: "True when market is trending vs ranging.",
      threshold: "Efficiency ≥ 30%"
    },
  };

  const info = descriptions[signal] || { title: signal, desc: "Signal condition", threshold: "" };

  return (
    <HelpTooltip
      title={info.title}
      description={info.desc}
      formula={info.threshold}
    />
  );
};
