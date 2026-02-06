import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RiskStabilityAnchors, RiskAnchor } from '@/lib/agents/evolutionTypes';

interface RiskStabilityMeterProps {
  anchors: RiskStabilityAnchors;
}

const AnchorMeter = ({ anchor }: { anchor: RiskAnchor }) => {
  const ratio = anchor.current / anchor.threshold;
  const fillPercent = Math.min(100, ratio * 100);

  const statusColors = {
    safe: { bar: 'bg-[hsl(var(--neural-green))]', text: 'text-[hsl(var(--neural-green))]', glow: 'shadow-[0_0_8px_hsl(var(--neural-green)/0.3)]' },
    warning: { bar: 'bg-[hsl(var(--neural-orange))]', text: 'text-[hsl(var(--neural-orange))]', glow: 'shadow-[0_0_8px_hsl(var(--neural-orange)/0.3)]' },
    critical: { bar: 'bg-[hsl(var(--neural-red))]', text: 'text-[hsl(var(--neural-red))]', glow: 'shadow-[0_0_8px_hsl(var(--neural-red)/0.3)]' },
  };

  const colors = statusColors[anchor.status];
  const StatusIcon = anchor.status === 'safe' ? CheckCircle2 : anchor.status === 'warning' ? AlertTriangle : AlertTriangle;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{anchor.icon}</span>
          <span className="text-xs font-medium text-foreground">{anchor.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-3 h-3', colors.text)} />
          <span className={cn('text-xs font-mono font-bold', colors.text)}>
            {anchor.unit === '$' ? `$${anchor.current.toFixed(0)}` : `${anchor.current.toFixed(1)}${anchor.unit}`}
          </span>
          <span className="text-xs text-muted-foreground">
            / {anchor.unit === '$' ? `$${anchor.threshold}` : `${anchor.threshold}${anchor.unit}`}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', colors.bar, colors.glow)}
          initial={{ width: 0 }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground leading-tight">{anchor.description}</p>
    </div>
  );
};

export const RiskStabilityMeter = ({ anchors }: RiskStabilityMeterProps) => {
  const anchorList = Object.values(anchors);
  const safeCount = anchorList.filter(a => a.status === 'safe').length;
  const overallHealth = (safeCount / anchorList.length) * 100;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-[hsl(var(--neural-green))]" />
            Risk Stability Anchors
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-2 h-2 rounded-full',
              overallHealth >= 80 ? 'bg-[hsl(var(--neural-green))]' : overallHealth >= 60 ? 'bg-[hsl(var(--neural-orange))]' : 'bg-[hsl(var(--neural-red))]'
            )} />
            <span className="text-xs font-mono text-muted-foreground">
              {safeCount}/{anchorList.length} Safe
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Non-overridable biological survival boundaries</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {anchorList.map((anchor, i) => (
          <motion.div
            key={anchor.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <AnchorMeter anchor={anchor} />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
};
