import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Zap, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StrategyState, MacroStrength, EfficiencyVerdict } from '@/lib/market/types';
import { cn } from '@/lib/utils';

interface StrategyInsightProps {
  strategyState: StrategyState;
  macroStrength: MacroStrength;
  efficiencyVerdict: EfficiencyVerdict;
  confidence: number;
  efficiencyScore: number;
  reason: string;
  className?: string;
}

const strategyColors: Record<StrategyState, string> = {
  pressing: 'bg-neural-cyan/20 text-neural-cyan border-neural-cyan/30',
  tracking: 'bg-neural-purple/20 text-neural-purple border-neural-purple/30',
  holding: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  watching: 'bg-muted text-muted-foreground border-border',
  avoiding: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

const strategyGlowColors: Record<StrategyState, string> = {
  pressing: 'shadow-neural-cyan/20',
  tracking: 'shadow-neural-purple/20',
  holding: 'shadow-neural-orange/20',
  watching: 'shadow-muted/20',
  avoiding: 'shadow-neural-red/20',
};

const decisionTree = [
  { state: 'pressing' as StrategyState, strength: 'strong', efficiency: 'clean' },
  { state: 'tracking' as StrategyState, strength: 'strong', efficiency: 'mixed' },
  { state: 'holding' as StrategyState, strength: 'strong', efficiency: 'noisy' },
  { state: 'watching' as StrategyState, strength: 'moderate/weak', efficiency: 'clean/mixed' },
  { state: 'avoiding' as StrategyState, strength: 'moderate/weak', efficiency: 'noisy' },
];

export const StrategyInsight = ({
  strategyState,
  macroStrength,
  efficiencyVerdict,
  confidence,
  efficiencyScore,
  reason,
  className,
}: StrategyInsightProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isStrong = macroStrength === 'strong';

  return (
    <Card
      className={cn(
        'border-border/50 bg-gradient-to-br from-card to-muted/10 overflow-hidden transition-shadow duration-300',
        isExpanded && `shadow-lg ${strategyGlowColors[strategyState]}`,
        className
      )}
    >
      <CardContent className="p-4">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', strategyColors[strategyState])}>
              <Zap className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm text-muted-foreground">Strategy State</p>
              <Badge
                variant="outline"
                className={cn('text-lg px-3 py-1', strategyColors[strategyState])}
              >
                {strategyState.toUpperCase()}
              </Badge>
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
                {/* Current conditions */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1">Macro Strength</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-sm',
                          isStrong
                            ? 'bg-neural-green/20 text-neural-green border-neural-green/30'
                            : macroStrength === 'moderate'
                            ? 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                            : 'bg-neural-red/20 text-neural-red border-neural-red/30'
                        )}
                      >
                        {macroStrength.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({confidence.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1">Efficiency</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-sm',
                          efficiencyVerdict === 'clean'
                            ? 'bg-neural-green/20 text-neural-green border-neural-green/30'
                            : efficiencyVerdict === 'mixed'
                            ? 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                            : 'bg-neural-red/20 text-neural-red border-neural-red/30'
                        )}
                      >
                        {efficiencyVerdict.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({(efficiencyScore * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decision Tree Visualization */}
                <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground mb-3 font-mono">DECISION TREE</p>
                  <div className="space-y-2">
                    {decisionTree.map((node) => {
                      const isActive = node.state === strategyState;
                      return (
                        <motion.div
                          key={node.state}
                          className={cn(
                            'flex items-center gap-3 p-2 rounded-lg transition-all',
                            isActive
                              ? strategyColors[node.state]
                              : 'bg-transparent opacity-50'
                          )}
                          initial={isActive ? { scale: 1 } : {}}
                          animate={isActive ? { scale: [1, 1.02, 1] } : {}}
                          transition={{ duration: 0.3 }}
                        >
                          {isActive ? (
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm uppercase flex-shrink-0 w-20">
                            {node.state}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {node.strength} + {node.efficiency}
                          </span>
                        </motion.div>
                      );
                    })}
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
