import { motion } from 'framer-motion';
import { Dna, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AdaptiveParameters, AdaptiveRange } from '@/lib/agents/evolutionTypes';

interface AdaptiveRangeVizProps {
  params: AdaptiveParameters;
  agentName: string;
}

const RangeBar = ({ range, label }: { range: AdaptiveRange; label: string }) => {
  const totalSpan = range.max - range.min;
  const currentPos = ((range.current - range.min) / totalSpan) * 100;
  const baselinePos = ((range.baseline - range.min) / totalSpan) * 100;
  const drift = Math.abs(range.current - range.baseline) / totalSpan;

  const driftColor = drift < 0.1
    ? 'text-[hsl(var(--neural-green))]'
    : drift < 0.25
      ? 'text-[hsl(var(--neural-orange))]'
      : 'text-[hsl(var(--neural-red))]';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Elasticity: {(range.elasticity * 100).toFixed(0)}%
          </span>
          <span className={cn('text-[10px] font-mono font-bold', driftColor)}>
            {range.current.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Range visualization */}
      <div className="relative h-3 rounded-full bg-muted/20 border border-border/30 overflow-hidden">
        {/* Elastic zone */}
        <div
          className="absolute top-0 bottom-0 bg-primary/10 border-x border-primary/20"
          style={{
            left: `${Math.max(0, baselinePos - range.elasticity * 50)}%`,
            width: `${range.elasticity * 100}%`,
          }}
        />

        {/* Baseline marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/40"
          style={{ left: `${baselinePos}%` }}
        />

        {/* Current position */}
        <motion.div
          className="absolute top-0.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]"
          initial={{ left: `${baselinePos}%` }}
          animate={{ left: `${currentPos}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>

      <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
        <span>{range.min.toFixed(1)}</span>
        <span>{range.max.toFixed(1)}</span>
      </div>
    </div>
  );
};

export const AdaptiveRangeViz = ({ params, agentName }: AdaptiveRangeVizProps) => {
  const paramEntries: Array<{ key: string; label: string; range: AdaptiveRange }> = [
    { key: 'entryTiming', label: 'Entry Timing', range: params.entryTiming },
    { key: 'signalConfirmationWeight', label: 'Signal Confirmation', range: params.signalConfirmationWeight },
    { key: 'tradeFrequency', label: 'Trade Frequency', range: params.tradeFrequency },
    { key: 'holdDuration', label: 'Hold Duration', range: params.holdDuration },
    { key: 'signalPersistence', label: 'Signal Persistence', range: params.signalPersistence },
    { key: 'regimeSensitivity', label: 'Regime Sensitivity', range: params.regimeSensitivity },
  ];

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Dna className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
            Adaptive Parameter Ranges
          </CardTitle>
          <span className="text-xs text-muted-foreground">{agentName}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Dot = current value · Shaded zone = elastic mutation range · Line = baseline
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {paramEntries.map((entry, i) => (
          <motion.div
            key={entry.key}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <RangeBar range={entry.range} label={entry.label} />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
};
