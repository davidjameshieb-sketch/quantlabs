// Trade Quality Analytics
// Entry timing, exit precision, R:R achievement, signal persistence, regime alignment

import { motion } from 'framer-motion';
import { Star, Target, Clock, TrendingUp, Compass, Award } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { TradeQualityScores } from '@/lib/agents/ledgerTypes';
import { cn } from '@/lib/utils';

interface TradeQualityAnalyticsProps {
  quality: TradeQualityScores;
}

const metrics = [
  { key: 'entryTimingEfficiency' as const, label: 'Entry Timing Efficiency', icon: <Clock className="w-3.5 h-3.5" /> },
  { key: 'exitPrecision' as const, label: 'Exit Precision', icon: <Target className="w-3.5 h-3.5" /> },
  { key: 'riskRewardAchievement' as const, label: 'Risk:Reward Achievement', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'signalPersistenceAccuracy' as const, label: 'Signal Persistence', icon: <Compass className="w-3.5 h-3.5" /> },
  { key: 'regimeAlignmentQuality' as const, label: 'Regime Alignment', icon: <Star className="w-3.5 h-3.5" /> },
];

const getScoreColor = (score: number) =>
  score > 75 ? 'text-neural-green' : score > 55 ? 'text-neural-orange' : 'text-neural-red';

const getGrade = (score: number) =>
  score > 85 ? 'A+' : score > 75 ? 'A' : score > 65 ? 'B' : score > 55 ? 'C' : score > 45 ? 'D' : 'F';

export const TradeQualityAnalytics = ({ quality }: TradeQualityAnalyticsProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-display font-bold">Trade Quality Analytics</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Overall:</span>
          <span className={cn('text-sm font-bold font-display', getScoreColor(quality.overallQuality))}>
            {quality.overallQuality.toFixed(0)}
          </span>
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded',
            quality.overallQuality > 75 ? 'bg-neural-green/20 text-neural-green'
              : quality.overallQuality > 55 ? 'bg-neural-orange/20 text-neural-orange'
                : 'bg-neural-red/20 text-neural-red'
          )}>
            {getGrade(quality.overallQuality)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {metrics.map((metric, i) => {
          const score = quality[metric.key];
          return (
            <motion.div
              key={metric.key}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3"
            >
              <span className={cn('shrink-0', getScoreColor(score))}>{metric.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">{metric.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-xs font-bold font-mono', getScoreColor(score))}>
                      {score.toFixed(0)}
                    </span>
                    <span className={cn(
                      'text-[9px] font-bold px-1 py-0 rounded',
                      score > 75 ? 'bg-neural-green/15 text-neural-green'
                        : score > 55 ? 'bg-neural-orange/15 text-neural-orange'
                          : 'bg-neural-red/15 text-neural-red'
                    )}>
                      {getGrade(score)}
                    </span>
                  </div>
                </div>
                <Progress value={score} className="h-1" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
