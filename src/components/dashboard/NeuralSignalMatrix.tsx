import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Waves, 
  Target, 
  ArrowUpRight, 
  Radio,
  Activity,
  Layers,
  Gauge
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignalToggle } from './SignalToggle';
import { SignalStates } from '@/lib/market/types';

interface NeuralSignalMatrixProps {
  signals: SignalStates;
  className?: string;
}

export const NeuralSignalMatrix = ({ signals, className }: NeuralSignalMatrixProps) => {
  const signalGroups = [
    {
      category: 'STRUCTURE',
      signals: [
        {
          key: 'trendActive',
          label: 'Trend Active',
          active: signals.trendActive,
          description: 'Fast core divergence from slow core exceeds 0.5x ATR. Clear directional structure present.',
          colorClass: 'bg-neural-cyan',
          icon: <TrendingUp className="w-4 h-4" />,
        },
        {
          key: 'structureGaining',
          label: 'Structure Gaining',
          active: signals.structureGaining,
          description: 'Spread delta is positive - trend cores are expanding. Momentum building.',
          colorClass: 'bg-neural-purple',
          icon: <ArrowUpRight className="w-4 h-4" />,
        },
      ],
    },
    {
      category: 'QUALITY',
      signals: [
        {
          key: 'cleanFlow',
          label: 'Clean Flow',
          active: signals.cleanFlow,
          description: 'Efficiency score above 60%. Price moving efficiently with minimal noise.',
          colorClass: 'bg-neural-green',
          icon: <Waves className="w-4 h-4" />,
        },
        {
          key: 'trendingMode',
          label: 'Trending Mode',
          active: signals.trendingMode,
          description: 'Efficiency above 30%. Market in trend mode vs flat/chop mode.',
          colorClass: 'bg-neural-orange',
          icon: <Activity className="w-4 h-4" />,
        },
      ],
    },
    {
      category: 'CONVICTION',
      signals: [
        {
          key: 'highConviction',
          label: 'High Conviction',
          active: signals.highConviction,
          description: 'Confidence above 70%. Strong ATR-normalized core separation.',
          colorClass: 'bg-primary',
          icon: <Target className="w-4 h-4" />,
        },
        {
          key: 'volatilityExpanding',
          label: 'Vol Expanding',
          active: signals.volatilityExpanding,
          description: 'Current ATR exceeds 14-period average. Volatility expansion detected.',
          colorClass: 'bg-neural-orange',
          icon: <Gauge className="w-4 h-4" />,
        },
      ],
    },
    {
      category: 'ALIGNMENT',
      signals: [
        {
          key: 'mtfAligned',
          label: 'MTF Aligned',
          active: signals.mtfAligned || false,
          description: 'All timeframes show the same directional bias. Full alignment.',
          colorClass: 'bg-yellow-500',
          icon: <Layers className="w-4 h-4" />,
        },
      ],
    },
  ];

  const activeCount = Object.values(signals).filter(Boolean).length;
  const totalCount = Object.keys(signals).length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Neural Signal Matrix
          </CardTitle>
          <motion.div
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="text-xs text-muted-foreground">Active:</span>
            <span className="text-sm font-bold text-primary">
              {activeCount}/{totalCount}
            </span>
          </motion.div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {signalGroups.map((group, groupIndex) => (
            <motion.div
              key={group.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: groupIndex * 0.1 }}
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {group.category}
              </h4>
              <div className="space-y-2">
                {group.signals.map((signal) => (
                  <SignalToggle
                    key={signal.key}
                    label={signal.label}
                    active={signal.active}
                    description={signal.description}
                    colorClass={signal.colorClass}
                    icon={signal.icon}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
