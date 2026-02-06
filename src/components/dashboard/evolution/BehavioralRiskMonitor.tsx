import { motion } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BehavioralRiskProfile, BehavioralRiskMetric } from '@/lib/agents/evolutionTypes';

interface BehavioralRiskMonitorProps {
  risk: BehavioralRiskProfile;
  agentName: string;
}

const TrendArrow = ({ trend }: { trend: 'improving' | 'stable' | 'degrading' }) => {
  if (trend === 'improving') return <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-green))]" />;
  if (trend === 'degrading') return <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-red))]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

const RiskMetricRow = ({ metric }: { metric: BehavioralRiskMetric }) => {
  const colors = {
    healthy: { bar: 'bg-[hsl(var(--neural-green))]', text: 'text-[hsl(var(--neural-green))]' },
    elevated: { bar: 'bg-[hsl(var(--neural-orange))]', text: 'text-[hsl(var(--neural-orange))]' },
    critical: { bar: 'bg-[hsl(var(--neural-red))]', text: 'text-[hsl(var(--neural-red))]' },
  };
  const c = colors[metric.status];
  const StatusIcon = metric.status === 'healthy' ? CheckCircle2 : AlertTriangle;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-3 h-3', c.text)} />
          <span className="text-xs font-medium text-foreground">{metric.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendArrow trend={metric.trend} />
          <span className={cn('text-xs font-mono font-bold', c.text)}>
            {metric.value.toFixed(0)}
          </span>
          <span className="text-[10px] text-muted-foreground">/ {metric.threshold}</span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', c.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (metric.value / metric.threshold) * 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{metric.description}</p>
    </div>
  );
};

export const BehavioralRiskMonitor = ({ risk, agentName }: BehavioralRiskMonitorProps) => {
  const metrics = Object.values(risk);
  const healthyCount = metrics.filter(m => m.status === 'healthy').length;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
            Behavioral Risk Monitor
          </CardTitle>
          <span className="text-xs text-muted-foreground">{agentName}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {healthyCount}/{metrics.length} indicators healthy — recalibration triggers at threshold
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <RiskMetricRow metric={metric} />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
};
