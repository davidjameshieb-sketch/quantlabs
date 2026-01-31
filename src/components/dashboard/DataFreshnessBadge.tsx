import { Clock, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type FreshnessLevel = 'live' | 'nightly' | 'hourly' | 'delayed' | 'historical';

interface DataFreshnessBadgeProps {
  level?: FreshnessLevel;
  lastUpdated?: Date;
  className?: string;
  showTooltip?: boolean;
}

const freshnessConfig: Record<FreshnessLevel, {
  label: string;
  description: string;
  colorClass: string;
}> = {
  live: {
    label: 'Live data',
    description: 'Real market prices updated every 5 minutes from Polygon.io.',
    colorClass: 'bg-neural-green/10 text-neural-green border-neural-green/30',
  },
  nightly: {
    label: 'Updated nightly',
    description: 'Data refreshes overnight. Reflects end-of-day analysis for structure clarity.',
    colorClass: 'bg-muted/50 text-muted-foreground border-border/50',
  },
  hourly: {
    label: 'Hourly refresh',
    description: 'Data updates each hour. Current within the last 60 minutes.',
    colorClass: 'bg-primary/10 text-primary border-primary/30',
  },
  delayed: {
    label: 'Delayed data',
    description: 'Data may be 24-48 hours behind. Upgrade for fresher analysis.',
    colorClass: 'bg-neural-orange/10 text-neural-orange border-neural-orange/30',
  },
  historical: {
    label: 'Historical snapshot',
    description: 'Static historical data used for backtesting and pattern analysis.',
    colorClass: 'bg-neural-purple/10 text-neural-purple border-neural-purple/30',
  },
};

export const DataFreshnessBadge = ({ 
  level = 'nightly', 
  lastUpdated,
  className,
  showTooltip = true,
}: DataFreshnessBadgeProps) => {
  const config = freshnessConfig[level];
  
  const formatLastUpdated = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return 'Less than an hour ago';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'text-xs gap-1.5 font-normal',
        config.colorClass,
        className
      )}
    >
      <Clock className="w-3 h-3" />
      {config.label}
      {lastUpdated && (
        <span className="opacity-70">
          · {formatLastUpdated(lastUpdated)}
        </span>
      )}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">{config.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// Compact inline version for use within cards
export const DataFreshnessInline = ({ 
  level = 'nightly',
  className,
}: Pick<DataFreshnessBadgeProps, 'level' | 'className'>) => {
  const config = freshnessConfig[level];
  
  return (
    <span className={cn('text-xs text-muted-foreground flex items-center gap-1', className)}>
      <Clock className="w-3 h-3" />
      {config.label}
    </span>
  );
};
