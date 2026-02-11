// Hero meter — Overall system trading confidence toward the Prime Directive
// "Autonomous live profitability with zero agent execution bottlenecks"

import { motion } from 'framer-motion';
import { Brain, Target, Zap, TrendingUp, Shield, AlertTriangle, BookOpen, Activity } from 'lucide-react';
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

  // Score explanation
  const scoreExplanation = useMemo(() => {
    if (score >= 80) return 'System has proven autonomous profitability with stable edge and minimal bottlenecks.';
    if (score >= 60) return 'System is converging toward autonomous operation. Edge is forming but needs more statistical proof.';
    if (score >= 40) return 'System is actively learning from real trades. Patterns emerging but not yet statistically validated.';
    if (score >= 20) return 'System is calibrating its models with early trade data. Needs more volume to establish reliable patterns.';
    return 'System is in bootstrap phase — collecting initial trade data to begin learning. More real trades needed.';
  }, [score]);

  // Current edge & learning focus
  const edgeInsights = useMemo(() => {
    const insights: { icon: string; text: string; status: 'good' | 'warn' | 'bad' }[] = [];

    // Best performing pair
    const pairBreakdown = executionMetrics?.pairBreakdown ?? {};
    const pairs = Object.values(pairBreakdown).filter(p => p.filled >= 3);
    if (pairs.length > 0) {
      const bestPair = pairs.reduce((a, b) => {
        const aWR = a.winCount / Math.max(a.filled, 1);
        const bWR = b.winCount / Math.max(b.filled, 1);
        return bWR > aWR ? b : a;
      });
      const bestWR = (bestPair.winCount / Math.max(bestPair.filled, 1) * 100).toFixed(0);
      insights.push({ icon: '🎯', text: `Best edge: ${bestPair.pair} (${bestWR}% WR, ${bestPair.filled} trades)`, status: 'good' });
    }

    // Learning maturity stage
    const stage = totalClosedTrades >= 500 ? 'Mature' : totalClosedTrades >= 200 ? 'Converging' : totalClosedTrades >= 75 ? 'Growing' : totalClosedTrades >= 20 ? 'Early' : 'Bootstrap';
    const nextMilestone = totalClosedTrades >= 500 ? null : totalClosedTrades >= 200 ? 500 : totalClosedTrades >= 75 ? 200 : totalClosedTrades >= 20 ? 75 : 20;
    insights.push({
      icon: '📊',
      text: `Learning stage: ${stage}${nextMilestone ? ` → next milestone at ${nextMilestone} trades (${nextMilestone - totalClosedTrades} to go)` : ' — fully matured'}`,
      status: stage === 'Mature' ? 'good' : stage === 'Converging' || stage === 'Growing' ? 'warn' : 'bad',
    });

    // Current system focus
    const winRate = executionMetrics?.winRate ?? 0;
    if (winRate < 0.5 && totalClosedTrades > 10) {
      insights.push({ icon: '🔬', text: 'Adapting: Improving win rate — tightening entry filters and governance gates', status: 'warn' });
    } else if (overallSharpe < 1.0 && totalClosedTrades > 20) {
      insights.push({ icon: '🔬', text: 'Adapting: Stabilizing risk-adjusted returns — optimizing position sizing and exit timing', status: 'warn' });
    } else if (totalClosedTrades < 75) {
      insights.push({ icon: '🔬', text: 'Adapting: Gathering statistical significance — all environments under observation', status: 'bad' });
    } else {
      insights.push({ icon: '🔬', text: 'Adapting: Fine-tuning edge allocation multipliers across validated environments', status: 'good' });
    }

    // Edge stability
    const stableEnvs = learningSummary.stableCount;
    const totalEnvs = learningSummary.totalEnvironments;
    if (totalEnvs > 0) {
      insights.push({
        icon: '🧬',
        text: `${stableEnvs}/${totalEnvs} environment signatures stable (avg confidence: ${(learningSummary.avgEdgeConfidence * 100).toFixed(0)}%)`,
        status: stableEnvs > totalEnvs / 2 ? 'good' : stableEnvs > 0 ? 'warn' : 'bad',
      });
    }

    return insights;
  }, [executionMetrics, totalClosedTrades, overallSharpe, learningSummary]);

  // Common loss reasons
  const lossReasons = useMemo(() => {
    const reasons: { reason: string; pct: number; status: 'bad' | 'warn' }[] = [];
    const pairBreakdown = executionMetrics?.pairBreakdown ?? {};
    const pairs = Object.values(pairBreakdown).filter(p => p.filled >= 3);
    const totalLosses = executionMetrics?.lossCount ?? 0;

    if (totalLosses === 0) return reasons;

    // Spread/slippage losses
    const avgSlip = executionMetrics?.avgSlippage ?? 0;
    if (avgSlip > 0.5) {
      reasons.push({ reason: `High spread/slippage (avg ${avgSlip.toFixed(1)}p) eating into thin margins`, pct: Math.min(40, Math.round(avgSlip * 15)), status: 'bad' });
    }

    // Worst pair drag
    if (pairs.length > 0) {
      const worstPair = pairs.reduce((a, b) => {
        const aWR = a.winCount / Math.max(a.filled, 1);
        const bWR = b.winCount / Math.max(b.filled, 1);
        return aWR < bWR ? a : b;
      });
      const worstWR = worstPair.winCount / Math.max(worstPair.filled, 1);
      if (worstWR < 0.45) {
        reasons.push({ reason: `${worstPair.pair} dragging returns (${(worstWR * 100).toFixed(0)}% WR over ${worstPair.filled} trades)`, pct: Math.round((1 - worstWR) * 30), status: 'bad' });
      }
    }

    // Low win rate in general
    const winRate = executionMetrics?.winRate ?? 0;
    if (winRate < 0.5) {
      reasons.push({ reason: `Overall win rate below 50% — system still calibrating entry precision`, pct: Math.round((1 - winRate) * 40), status: 'warn' });
    }

    // Execution quality
    const avgQuality = executionMetrics?.avgExecutionQuality ?? 0;
    if (avgQuality < 60) {
      reasons.push({ reason: `Low execution quality (${avgQuality.toFixed(0)}%) — poor fill timing or adverse price movement`, pct: Math.round((100 - avgQuality) * 0.3), status: 'warn' });
    }

    // Regime misreads (if governance not normal)
    if (governanceState !== 'NORMAL') {
      reasons.push({ reason: `Governance in ${governanceState === 'HALT' ? 'COOLDOWN' : governanceState} — market conditions challenging`, pct: 20, status: 'warn' });
    }

    // Sort by impact
    return reasons.sort((a, b) => b.pct - a.pct).slice(0, 4);
  }, [executionMetrics, governanceState]);

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
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Big gauge */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="relative" style={{ width: svgSize, height: svgSize / 2 + 30 }}>
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
          {/* Score explanation below gauge */}
          <div className="text-center max-w-[220px] mt-1">
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[9px] font-bold border inline-block mb-1',
              score >= 70 ? 'border-neural-green/30 text-neural-green bg-neural-green/10'
                : score >= 40 ? 'border-neural-orange/30 text-neural-orange bg-neural-orange/10'
                : 'border-neural-red/30 text-neural-red bg-neural-red/10'
            )}>
              {maturityLabel}
            </span>
            <p className="text-[9px] text-muted-foreground leading-tight">{scoreExplanation}</p>
          </div>
        </div>

        {/* Right side: label + breakdown + insights */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-display font-bold">PRIME DIRECTIVE CONFIDENCE</h2>
              <p className="text-[10px] text-muted-foreground">
                Autonomous live profitability · {totalClosedTrades.toLocaleString()} real trades processed
              </p>
            </div>
          </div>

          {/* Factor bars */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {factors.map(f => (
              <FactorBar key={f.label} {...f} />
            ))}
          </div>

          {/* Edge Insights — What system is doing */}
          <div className="space-y-1.5 pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">Current Edge & Learning Focus</span>
            </div>
            {edgeInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] mt-0.5">{insight.icon}</span>
                <span className={cn('text-[10px] leading-tight', insight.status === 'good' ? 'text-neural-green' : insight.status === 'warn' ? 'text-neural-orange' : 'text-muted-foreground')}>
                  {insight.text}
                </span>
              </div>
            ))}
          </div>

          {/* Loss Reasons */}
          {lossReasons.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-neural-orange" />
                <span className="text-[10px] font-display font-bold text-neural-orange uppercase tracking-wider">Common Loss Drivers</span>
              </div>
              {lossReasons.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-8">
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div className={cn('h-full rounded-full', r.status === 'bad' ? 'bg-neural-red' : 'bg-neural-orange')} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{r.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Prime directive tagline */}
          <p className="text-[9px] text-muted-foreground italic flex items-center gap-1 pt-1">
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
