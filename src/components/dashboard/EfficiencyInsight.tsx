import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Activity, ArrowRight, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EfficiencyMetrics } from '@/lib/market/types';
import { EfficiencyTooltip } from './HelpTooltip';
import { cn } from '@/lib/utils';

interface EfficiencyInsightProps {
  efficiency: EfficiencyMetrics;
  reason: string;
  className?: string;
}

const verdictColors = {
  clean: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  mixed: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  noisy: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

const verdictGlowColors = {
  clean: 'shadow-neural-green/20',
  mixed: 'shadow-neural-orange/20',
  noisy: 'shadow-neural-red/20',
};

export const EfficiencyInsight = ({ efficiency, reason, className }: EfficiencyInsightProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const scorePercent = efficiency.score * 100;

  return (
    <Card
      className={cn(
        'border-border/50 bg-gradient-to-br from-card to-muted/10 overflow-hidden transition-shadow duration-300',
        isExpanded && `shadow-lg ${verdictGlowColors[efficiency.verdict]}`,
        className
      )}
    >
      <CardContent className="p-4">
        {/* Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              verdictColors[efficiency.verdict]
            )}>
              <Activity className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                <p className="text-sm text-muted-foreground">Efficiency Score</p>
                <EfficiencyTooltip />
              </div>
              <div className="flex items-center gap-2">
                <motion.span
                  className="text-2xl font-bold text-foreground"
                  key={scorePercent}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {scorePercent.toFixed(0)}%
                </motion.span>
                <Badge
                  variant="outline"
                  className={cn('text-xs', verdictColors[efficiency.verdict])}
                >
                  {efficiency.verdict.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-border/50 space-y-4">
                {/* Formula visualization */}
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground mb-2 font-mono">FORMULA</p>
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-neural-cyan">efficiency</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-neural-green">net_move</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-neural-orange">path_noise</span>
                  </div>
                </div>

                {/* Metric breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-neural-green/10 border border-neural-green/20">
                    <p className="text-xs text-muted-foreground mb-1">Net Move</p>
                    <p className="text-lg font-bold text-neural-green">
                      {efficiency.netMove.toFixed(5)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-neural-orange/10 border border-neural-orange/20">
                    <p className="text-xs text-muted-foreground mb-1">Path Noise</p>
                    <p className="text-lg font-bold text-neural-orange">
                      {efficiency.pathNoise.toFixed(5)}
                    </p>
                  </div>
                </div>

                {/* Visual ratio bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Efficiency Ratio</span>
                    <span>{scorePercent.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-3 rounded-full bg-muted/50 overflow-hidden">
                    <motion.div
                      className={cn(
                        'h-full rounded-full',
                        efficiency.verdict === 'clean' 
                          ? 'bg-gradient-to-r from-neural-green/80 to-neural-green' 
                          : efficiency.verdict === 'noisy'
                          ? 'bg-gradient-to-r from-neural-red/80 to-neural-red'
                          : 'bg-gradient-to-r from-neural-orange/80 to-neural-orange'
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(scorePercent, 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    />
                    {/* Threshold markers */}
                    <div className="absolute top-0 left-[30%] w-px h-full bg-muted-foreground/30" />
                    <div className="absolute top-0 left-[60%] w-px h-full bg-muted-foreground/30" />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Noisy</span>
                    <span>Mixed</span>
                    <span>Clean</span>
                  </div>
                </div>

                {/* AI Reasoning */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs text-primary mb-2 font-medium uppercase tracking-wide">
                    AI Analysis
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">{reason}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};
