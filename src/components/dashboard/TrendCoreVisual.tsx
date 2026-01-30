import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendCore, BiasDirection } from '@/lib/market/types';
import { cn } from '@/lib/utils';

interface TrendCoreVisualProps {
  trendCore: TrendCore;
  currentPrice: number;
  bias: BiasDirection;
  className?: string;
}

export const TrendCoreVisual = ({
  trendCore,
  currentPrice,
  bias,
  className,
}: TrendCoreVisualProps) => {
  const { fastCore, slowCore, spread, spreadDelta } = trendCore;
  
  // Calculate positions for visualization (normalized 0-100)
  const min = Math.min(fastCore, slowCore, currentPrice) * 0.999;
  const max = Math.max(fastCore, slowCore, currentPrice) * 1.001;
  const range = max - min;
  
  const normalize = (value: number) => ((value - min) / range) * 100;
  
  const fastPos = normalize(fastCore);
  const slowPos = normalize(slowCore);
  const pricePos = normalize(currentPrice);
  
  const isGaining = spreadDelta > 0;

  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-neural-cyan" />
            <div className="w-3 h-3 rounded-full bg-neural-purple" />
          </div>
          Neural Trend Cores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Visual representation */}
          <div className="relative h-32 bg-muted/20 rounded-lg border border-border/30 overflow-hidden">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between py-2 px-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-px w-full bg-border/20" />
              ))}
            </div>

            {/* Spread area */}
            <motion.div
              className="absolute left-0 right-0 bg-gradient-to-b from-neural-cyan/20 to-neural-purple/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                top: `${100 - Math.max(fastPos, slowPos)}%`,
                bottom: `${Math.min(fastPos, slowPos)}%`,
              }}
            />

            {/* Fast Core Line */}
            <motion.div
              className="absolute left-4 right-4 h-0.5 bg-neural-cyan shadow-lg shadow-neural-cyan/50"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.5 }}
              style={{ top: `${100 - fastPos}%` }}
            >
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-neural-cyan" />
              <span className="absolute -right-14 top-1/2 -translate-y-1/2 text-xs text-neural-cyan font-mono">
                FAST
              </span>
            </motion.div>

            {/* Slow Core Line */}
            <motion.div
              className="absolute left-4 right-4 h-0.5 bg-neural-purple shadow-lg shadow-neural-purple/50"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ top: `${100 - slowPos}%` }}
            >
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-neural-purple" />
              <span className="absolute -right-14 top-1/2 -translate-y-1/2 text-xs text-neural-purple font-mono">
                SLOW
              </span>
            </motion.div>

            {/* Current Price Marker */}
            <motion.div
              className={cn(
                'absolute left-1/2 -translate-x-1/2 w-0.5 h-4',
                bias === 'bullish' ? 'bg-neural-green' : 'bg-neural-red'
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ top: `${100 - pricePos - 2}%` }}
            >
              <motion.div
                className={cn(
                  'absolute -top-1 left-1/2 -translate-x-1/2',
                  bias === 'bullish' ? 'text-neural-green' : 'text-neural-red'
                )}
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {bias === 'bullish' ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </motion.div>
            </motion.div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 rounded-lg bg-neural-cyan/10 border border-neural-cyan/20">
              <p className="text-xs text-muted-foreground">Fast Core</p>
              <p className="text-sm font-bold text-neural-cyan font-mono">
                {fastCore.toFixed(4)}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-neural-purple/10 border border-neural-purple/20">
              <p className="text-xs text-muted-foreground">Slow Core</p>
              <p className="text-sm font-bold text-neural-purple font-mono">
                {slowCore.toFixed(4)}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-xs text-muted-foreground">Spread</p>
              <p className="text-sm font-bold text-foreground font-mono">
                {spread.toFixed(5)}
              </p>
            </div>
            <div
              className={cn(
                'text-center p-2 rounded-lg border',
                isGaining
                  ? 'bg-neural-green/10 border-neural-green/20'
                  : 'bg-neural-red/10 border-neural-red/20'
              )}
            >
              <p className="text-xs text-muted-foreground">Delta</p>
              <p
                className={cn(
                  'text-sm font-bold font-mono',
                  isGaining ? 'text-neural-green' : 'text-neural-red'
                )}
              >
                {isGaining ? '+' : ''}
                {spreadDelta.toFixed(5)}
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div
            className={cn(
              'flex items-center justify-center gap-2 p-2 rounded-lg border',
              isGaining
                ? 'bg-neural-green/10 border-neural-green/30 text-neural-green'
                : 'bg-neural-red/10 border-neural-red/30 text-neural-red'
            )}
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className={cn(
                'w-2 h-2 rounded-full',
                isGaining ? 'bg-neural-green' : 'bg-neural-red'
              )}
            />
            <span className="text-sm font-medium">
              Structure {isGaining ? 'Expanding' : 'Contracting'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
