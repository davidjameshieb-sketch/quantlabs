import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendCore, MacroStrength, BiasDirection } from '@/lib/market/types';
import { ConfidenceTooltip } from './HelpTooltip';
import { cn } from '@/lib/utils';

interface ConfidenceInsightProps {
  confidence: number;
  trendCore: TrendCore;
  atr: number;
  macroStrength: MacroStrength;
  bias: BiasDirection;
  reason: string;
  className?: string;
}

const strengthColors = {
  strong: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  moderate: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  weak: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

const strengthGlowColors = {
  strong: 'shadow-neural-green/20',
  moderate: 'shadow-neural-orange/20',
  weak: 'shadow-neural-red/20',
};

export const ConfidenceInsight = ({
  confidence,
  trendCore,
  atr,
  macroStrength,
  bias,
  reason,
  className,
}: ConfidenceInsightProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const spreadToAtr = atr > 0 ? trendCore.spread / atr : 0;
  const BiasIcon = bias === 'bullish' ? TrendingUp : TrendingDown;

  return (
    <Card
      className={cn(
        'border-border/50 bg-gradient-to-br from-card to-muted/10 overflow-hidden transition-shadow duration-300',
        isExpanded && `shadow-lg ${strengthGlowColors[macroStrength]}`,
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
            <div className={cn('p-2 rounded-lg', strengthColors[macroStrength])}>
              <Target className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                <p className="text-sm text-muted-foreground">Confidence</p>
                <ConfidenceTooltip />
              </div>
              <div className="flex items-center gap-2">
                <motion.span
                  className="text-2xl font-bold text-foreground"
                  key={confidence}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {confidence.toFixed(0)}%
                </motion.span>
                <Badge
                  variant="outline"
                  className={cn('text-xs', strengthColors[macroStrength])}
                >
                  {macroStrength.toUpperCase()}
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
                    <span className="text-neural-cyan">confidence</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-muted-foreground">min(</span>
                    <span className="text-neural-purple">spread</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-neural-orange">ATR</span>
                    <span className="text-muted-foreground">× 100, 100)</span>
                  </div>
                </div>

                {/* Trend Core Visualization */}
                <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground mb-3">Trend Core Spread</p>
                  <div className="relative h-16">
                    {/* Core lines visualization */}
                    <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                    
                    {/* Fast Core */}
                    <motion.div
                      className="absolute left-1/4 top-1/2 -translate-y-1/2"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-neural-cyan shadow-lg shadow-neural-cyan/50" />
                        <span className="text-xs text-muted-foreground mt-1">Fast</span>
                      </div>
                    </motion.div>

                    {/* Slow Core */}
                    <motion.div
                      className="absolute right-1/4 top-1/2 -translate-y-1/2"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-neural-purple shadow-lg shadow-neural-purple/50" />
                        <span className="text-xs text-muted-foreground mt-1">Slow</span>
                      </div>
                    </motion.div>

                    {/* Spread indicator */}
                    <motion.div
                      className="absolute left-1/4 right-1/4 top-1/2 h-2 -translate-y-1/2 bg-gradient-to-r from-neural-cyan/30 to-neural-purple/30 rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-lg bg-neural-purple/10 border border-neural-purple/20 text-center">
                    <p className="text-xs text-muted-foreground">Spread</p>
                    <p className="text-sm font-bold text-neural-purple">
                      {trendCore.spread.toFixed(5)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-neural-orange/10 border border-neural-orange/20 text-center">
                    <p className="text-xs text-muted-foreground">ATR(14)</p>
                    <p className="text-sm font-bold text-neural-orange">
                      {atr.toFixed(5)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-neural-cyan/10 border border-neural-cyan/20 text-center">
                    <p className="text-xs text-muted-foreground">Ratio</p>
                    <p className="text-sm font-bold text-neural-cyan">
                      {spreadToAtr.toFixed(2)}x
                    </p>
                  </div>
                </div>

                {/* Spread Delta */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                  <span className="text-sm text-muted-foreground">Spread Delta</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-bold',
                        trendCore.spreadDelta > 0 ? 'text-neural-green' : 'text-neural-red'
                      )}
                    >
                      {trendCore.spreadDelta > 0 ? '+' : ''}
                      {trendCore.spreadDelta.toFixed(6)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        trendCore.spreadDelta > 0
                          ? 'bg-neural-green/20 text-neural-green border-neural-green/30'
                          : 'bg-neural-red/20 text-neural-red border-neural-red/30'
                      )}
                    >
                      {trendCore.spreadDelta > 0 ? 'GAINING' : 'LOSING'}
                    </Badge>
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
