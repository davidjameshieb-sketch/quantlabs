// Hero meter — Overall system trading confidence toward the Prime Directive
// "Autonomous live profitability with zero agent execution bottlenecks"

import { motion } from 'framer-motion';
import { Brain, Target, Zap, TrendingUp, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import { getEdgeLearningSummary } from '@/lib/forex/edgeLearningState';
import { useMemo } from 'react';

interface SystemConfidenceMeterProps {
  executionMetrics: RealExecutionMetrics | null;
  connected: boolean | null;
  governanceState: string;
  totalClosedTrades: number;
  totalPnlPips: number;
  overallSharpe: number;
}

export const SystemConfidenceMeter = ({
  executionMetrics,
  connected,
  governanceState,
  totalClosedTrades,
  totalPnlPips,
  overallSharpe,
}: SystemConfidenceMeterProps) => {
  const learningSummary = useMemo(() => getEdgeLearningSummary(), []);

  // Compute overall confidence score (0-100) toward prime directive
  const { score, factors } = useMemo(() => {
    let s = 0;
    const f: { label: string; value: number; max: number; status: 'good' | 'warn' | 'bad' }[] = [];

    // 1. Trade volume maturity (0-20)
    const volumeScore = Math.min(20, Math.round((totalClosedTrades / 500) * 20));
    f.push({ label: 'Trade Volume', value: volumeScore, max: 20, status: volumeScore >= 15 ? 'good' : volumeScore >= 8 ? 'warn' : 'bad' });
    s += volumeScore;

    // 2. Profitability (0-25)
    const winRate = executionMetrics?.winRate ?? 0;
    const profitScore = Math.min(25, Math.round(
      (totalPnlPips > 0 ? 10 : 0) + (winRate >= 0.5 ? Math.min(15, winRate * 25) : 0)
    ));
    f.push({ label: 'Profitability', value: profitScore, max: 25, status: profitScore >= 18 ? 'good' : profitScore >= 10 ? 'warn' : 'bad' });
    s += profitScore;

    // 3. Risk-adjusted returns / Sharpe (0-20)
    const sharpeScore = Math.min(20, Math.round(Math.max(0, overallSharpe) * 10));
    f.push({ label: 'Risk-Adjusted', value: sharpeScore, max: 20, status: sharpeScore >= 15 ? 'good' : sharpeScore >= 8 ? 'warn' : 'bad' });
    s += sharpeScore;

    // 4. Edge confidence / learning stability (0-20)
    const edgeScore = Math.min(20, Math.round(
      learningSummary.avgEdgeConfidence * 15 + (learningSummary.stableCount * 2)
    ));
    f.push({ label: 'Edge Stability', value: edgeScore, max: 20, status: edgeScore >= 14 ? 'good' : edgeScore >= 7 ? 'warn' : 'bad' });
    s += edgeScore;

    // 5. Execution readiness (0-15)
    const execScore = Math.min(15, (
      (connected ? 5 : 0) +
      (governanceState === 'NORMAL' ? 5 : governanceState === 'DEFENSIVE' ? 2 : 0) +
      (executionMetrics?.hasData ? 5 : 0)
    ));
    f.push({ label: 'Exec Readiness', value: execScore, max: 15, status: execScore >= 12 ? 'good' : execScore >= 6 ? 'warn' : 'bad' });
    s += execScore;

    return { score: Math.min(100, s), factors: f };
  }, [totalClosedTrades, totalPnlPips, overallSharpe, executionMetrics, connected, governanceState, learningSummary]);

  const maturityLabel = score >= 80 ? 'Autonomous' : score >= 60 ? 'Converging' : score >= 40 ? 'Learning' : score >= 20 ? 'Calibrating' : 'Bootstrap';

  // SVG arc gauge
  const svgSize = 200;
  const strokeWidth = 14;
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = radius * Math.PI; // half circle
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const scoreColor = score >= 70 ? 'text-neural-green' : score >= 40 ? 'text-neural-orange' : 'text-neural-red';
  const strokeColorClass = score >= 70 ? 'stroke-neural-green' : score >= 40 ? 'stroke-neural-orange' : 'stroke-neural-red';

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-xl bg-gradient-to-br from-card/90 to-card/50 border border-border/50"
    >
      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Big gauge */}
        <div className="relative flex-shrink-0" style={{ width: svgSize, height: svgSize / 2 + 30 }}>
          <svg width={svgSize} height={svgSize / 2 + 20} viewBox={`0 0 ${svgSize} ${svgSize / 2 + 20}`}>
            {/* Background arc */}
            <path
              d={`M ${strokeWidth / 2} ${svgSize / 2} A ${radius} ${radius} 0 0 1 ${svgSize - strokeWidth / 2} ${svgSize / 2}`}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Foreground arc */}
            <motion.path
              d={`M ${strokeWidth / 2} ${svgSize / 2} A ${radius} ${radius} 0 0 1 ${svgSize - strokeWidth / 2} ${svgSize / 2}`}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className={strokeColorClass}
            />
          </svg>
          {/* Center value */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className={cn('text-4xl font-display font-bold', scoreColor)}
            >
              {score}
            </motion.span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
        </div>

        {/* Right side: label + breakdown */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-display font-bold">PRIME DIRECTIVE CONFIDENCE</h2>
              <p className="text-[10px] text-muted-foreground">
                Autonomous live profitability · {totalClosedTrades.toLocaleString()} real trades processed
              </p>
            </div>
            <span className={cn(
              'ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold border',
              score >= 70 ? 'border-neural-green/30 text-neural-green bg-neural-green/10'
                : score >= 40 ? 'border-neural-orange/30 text-neural-orange bg-neural-orange/10'
                : 'border-neural-red/30 text-neural-red bg-neural-red/10'
            )}>
              {maturityLabel}
            </span>
          </div>

          {/* Factor bars */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {factors.map(f => (
              <FactorBar key={f.label} {...f} />
            ))}
          </div>

          {/* Prime directive tagline */}
          <p className="text-[9px] text-muted-foreground italic flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" />
            Zero execution bottlenecks · Safety brakes absolute · Learning never stops
          </p>
        </div>
      </div>
    </motion.div>
  );
};

function FactorBar({ label, value, max, status }: { label: string; value: number; max: number; status: 'good' | 'warn' | 'bad' }) {
  const pct = (value / max) * 100;
  const barColor = status === 'good' ? 'bg-neural-green' : status === 'warn' ? 'bg-neural-orange' : 'bg-neural-red';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-muted-foreground truncate">{label}</span>
        <span className="text-[8px] font-mono font-bold text-foreground">{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={cn('h-full rounded-full', barColor)}
        />
      </div>
    </div>
  );
}
