// Performance Reanalysis Dashboard
// Before vs After governance comparison, leakage attribution,
// session/pair analysis, sequencing, and tuning recommendations.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2,
  Clock, Crosshair, FlaskConical, Gauge, Layers, Lightbulb, Scale,
  ShieldCheck, ShieldX, Target, Timer, TrendingDown, TrendingUp,
  Zap, AlertTriangle, Globe, LineChart,
} from 'lucide-react';
import { ForexTradeEntry, ForexPerformanceMetrics } from '@/lib/forex/forexTypes';
import { GovernanceResult, GovernanceStats } from '@/lib/forex/tradeGovernanceEngine';
import {
  computePerformanceReanalysis,
  PerformanceReanalysis,
  BeforeAfterComparison,
  LeakageSource,
  SessionPerformance,
  PairOptimization,
  TuningRecommendation,
} from '@/lib/forex/performanceReanalysisEngine';

interface ReanalysisProps {
  trades: ForexTradeEntry[];
  performance: ForexPerformanceMetrics;
  governanceStats: GovernanceStats | null;
  governanceResults: GovernanceResult[];
}

// ─── Delta Indicator ───

const DeltaIndicator = ({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) => {
  const positive = invert ? value < 0 : value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold',
      positive ? 'text-neural-green' : value === 0 ? 'text-muted-foreground' : 'text-neural-red'
    )}>
      <Icon className="w-3 h-3" />
      {value > 0 ? '+' : ''}{typeof value === 'number' ? value.toFixed(2) : value}{suffix}
    </span>
  );
};

// ─── Scorecard Ring ───

const ScoreRing = ({ label, score, size = 'md' }: { label: string; score: number; size?: 'sm' | 'md' }) => {
  const radius = size === 'sm' ? 24 : 32;
  const stroke = size === 'sm' ? 4 : 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(score, 100) / 100);
  const color = score > 75 ? 'text-neural-green' : score > 55 ? 'text-primary' : score > 35 ? 'text-neural-orange' : 'text-neural-red';
  const dim = (radius + stroke) * 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={radius + stroke} cy={radius + stroke} r={radius}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} opacity={0.3} />
        <circle cx={radius + stroke} cy={radius + stroke} r={radius}
          fill="none" stroke="currentColor" strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className={color} />
      </svg>
      <span className={cn('font-mono font-bold', size === 'sm' ? 'text-sm' : 'text-lg', color)}>
        {Math.round(score)}
      </span>
      <span className="text-[9px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
};

// ─── Comparison Table Row ───

const CompRow = ({ label, before, after, delta, suffix = '', invert = false }: {
  label: string; before: number; after: number; delta: number; suffix?: string; invert?: boolean;
}) => (
  <tr className="border-b border-border/10">
    <td className="py-2 px-2 text-xs text-muted-foreground">{label}</td>
    <td className="py-2 px-2 text-xs font-mono text-right">{before.toFixed(2)}{suffix}</td>
    <td className="py-2 px-2 text-xs font-mono text-right font-semibold">{after.toFixed(2)}{suffix}</td>
    <td className="py-2 px-2 text-right"><DeltaIndicator value={delta} suffix={suffix} invert={invert} /></td>
  </tr>
);

// ─── Main Component ───

export const PerformanceReanalysisDashboard = ({
  trades, performance, governanceStats, governanceResults,
}: ReanalysisProps) => {
  const analysis = useMemo(() =>
    computePerformanceReanalysis(trades, performance, governanceStats, governanceResults),
    [trades, performance, governanceStats, governanceResults]
  );

  const { comparison, leakageSources, sessionPerformance, pairOptimization, sequencing, governanceImpact, recommendations, scorecard } = analysis;

  return (
    <div className="space-y-4">
      {/* Verdict Banner */}
      <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn('border-l-4',
          comparison.verdict === 'improved' ? 'border-l-neural-green bg-neural-green/5'
          : comparison.verdict === 'degraded' ? 'border-l-neural-red bg-neural-red/5'
          : 'border-l-neural-orange bg-neural-orange/5'
        )}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              {comparison.verdict === 'improved' ? (
                <CheckCircle2 className="w-5 h-5 text-neural-green mt-0.5 shrink-0" />
              ) : comparison.verdict === 'degraded' ? (
                <AlertTriangle className="w-5 h-5 text-neural-red mt-0.5 shrink-0" />
              ) : (
                <Scale className="w-5 h-5 text-neural-orange mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold mb-1">
                  Governance Impact: {comparison.verdict === 'improved' ? 'Performance Improved' : comparison.verdict === 'degraded' ? 'Performance Degraded' : 'Mixed Results'}
                </p>
                <p className="text-xs text-muted-foreground">{comparison.summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scorecard */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Performance Scorecard
              <Badge variant="outline" className={cn('ml-auto text-xs font-mono',
                scorecard.overallGrade === 'A' ? 'text-neural-green border-neural-green/30'
                : scorecard.overallGrade === 'B' ? 'text-primary border-primary/30'
                : scorecard.overallGrade === 'C' ? 'text-neural-orange border-neural-orange/30'
                : 'text-neural-red border-neural-red/30'
              )}>
                Grade {scorecard.overallGrade}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around flex-wrap gap-4">
              <ScoreRing label="Profit Consistency" score={scorecard.profitConsistency} />
              <ScoreRing label="Capture Ratio" score={scorecard.captureRatioScore} />
              <ScoreRing label="Sharpe Stability" score={scorecard.sharpeStability} />
              <ScoreRing label="Stagnation Reduction" score={scorecard.stagnationReduction} />
              <ScoreRing label="Drawdown Control" score={scorecard.drawdownControl} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Before vs After Comparison */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />Before vs After Governance Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Metric</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Before</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">After</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Δ Change</th>
                  </tr>
                </thead>
                <tbody>
                  <CompRow label="Win Rate" before={comparison.baseline.winRate * 100} after={comparison.governed.winRate * 100} delta={comparison.delta.winRate * 100} suffix="%" />
                  <CompRow label="Net P&L" before={comparison.baseline.netPnl} after={comparison.governed.netPnl} delta={comparison.delta.netPnl} suffix="%" />
                  <CompRow label="Profit Factor" before={comparison.baseline.profitFactor} after={comparison.governed.profitFactor} delta={comparison.delta.profitFactor} />
                  <CompRow label="Sharpe Ratio" before={comparison.baseline.sharpe} after={comparison.governed.sharpe} delta={comparison.delta.sharpe} />
                  <CompRow label="Capture Ratio" before={comparison.baseline.captureRatio * 100} after={comparison.governed.captureRatio * 100} delta={comparison.delta.captureRatio * 100} suffix="%" />
                  <CompRow label="Expectancy/Trade" before={comparison.baseline.expectancyPerTrade * 100} after={comparison.governed.expectancyPerTrade * 100} delta={comparison.delta.expectancy * 100} suffix="%" />
                  <CompRow label="Avg Duration" before={comparison.baseline.avgTradeDuration} after={comparison.governed.avgTradeDuration} delta={comparison.delta.avgDuration} suffix="min" invert />
                  <CompRow label="Avg Drawdown" before={comparison.baseline.avgDrawdown} after={comparison.governed.avgDrawdown} delta={comparison.delta.avgDrawdown} suffix="%" invert />
                  <CompRow label="Trade Count" before={comparison.baseline.tradeCount} after={comparison.governed.tradeCount} delta={comparison.governed.tradeCount - comparison.baseline.tradeCount} />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leakage Attribution */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-neural-red" />Leakage Attribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {leakageSources.map((leak, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-muted/5 border border-border/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[9px]',
                        leak.severity === 'critical' ? 'text-neural-red border-neural-red/30'
                        : leak.severity === 'moderate' ? 'text-neural-orange border-neural-orange/30'
                        : 'text-muted-foreground border-border/50'
                      )}>
                        {leak.severity}
                      </Badge>
                      <span className="text-xs font-medium">{leak.category}</span>
                    </div>
                    <span className="text-xs font-mono text-neural-red font-semibold">
                      -{leak.pnlImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{leak.tradeCount} trades</span>
                    <span>avg -{leak.avgImpact.toFixed(3)}%/trade</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80 italic">{leak.recommendation}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Governance Impact */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />Governance Impact Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Rejection Quality', value: governanceImpact.rejectionQualityScore, desc: 'How well governance identifies bad trades' },
                { label: 'Approval Quality', value: governanceImpact.approvalQualityScore, desc: 'Average quality score of approved trades' },
                { label: 'Probability Adjustment', value: governanceImpact.probabilityAdjustmentEffectiveness, desc: 'Effectiveness of dynamic win probability reweighting' },
                { label: 'Exit Policy', value: governanceImpact.exitPolicyImprovement, desc: 'Percentage of trades achieving Grade A exit latency' },
                { label: 'Anti-Overtrading', value: governanceImpact.overtradingGovernorEffectiveness, desc: 'Filtering effectiveness of frequency governance' },
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={cn('text-xs font-mono font-semibold',
                      item.value > 65 ? 'text-neural-green' : item.value > 40 ? 'text-primary' : 'text-neural-orange'
                    )}>
                      {item.value.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/20">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        item.value > 65 ? 'bg-neural-green/60' : item.value > 40 ? 'bg-primary/60' : 'bg-neural-orange/60'
                      )}
                      style={{ width: `${Math.min(100, item.value)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground/70">{item.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Session Performance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />Session Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sessionPerformance.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/5 border border-border/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold">{s.session}</span>
                      </div>
                      <Badge variant="outline" className={cn('text-[9px] font-mono',
                        s.grade === 'A' ? 'text-neural-green border-neural-green/30'
                        : s.grade === 'B' ? 'text-primary border-primary/30'
                        : s.grade === 'C' ? 'text-neural-orange border-neural-orange/30'
                        : 'text-neural-red border-neural-red/30'
                      )}>
                        Grade {s.grade}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[9px] text-muted-foreground">Win Rate</p>
                        <p className={cn('text-xs font-mono font-bold', s.winRate > 0.55 ? 'text-neural-green' : 'text-foreground')}>
                          {(s.winRate * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground">Net P&L</p>
                        <p className={cn('text-xs font-mono font-bold', s.netPnl > 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {s.netPnl > 0 ? '+' : ''}{s.netPnl.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground">Trades</p>
                        <p className="text-xs font-mono font-bold">{s.tradeCount}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sequencing Analysis */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />Trade Sequencing Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/10 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground">After Win Streaks</p>
                  <p className={cn('text-lg font-mono font-bold',
                    sequencing.afterWinStreak.winRate > 0.55 ? 'text-neural-green' : 'text-foreground'
                  )}>
                    {(sequencing.afterWinStreak.winRate * 100).toFixed(0)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">{sequencing.afterWinStreak.count} instances</p>
                  <p className={cn('text-[10px] font-mono',
                    sequencing.afterWinStreak.avgPnl > 0 ? 'text-neural-green' : 'text-neural-red'
                  )}>
                    {sequencing.afterWinStreak.avgPnl > 0 ? '+' : ''}{sequencing.afterWinStreak.avgPnl.toFixed(3)}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground">After Loss Streaks</p>
                  <p className={cn('text-lg font-mono font-bold',
                    sequencing.afterLossStreak.winRate > 0.50 ? 'text-neural-green' : 'text-neural-red'
                  )}>
                    {(sequencing.afterLossStreak.winRate * 100).toFixed(0)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">{sequencing.afterLossStreak.count} instances</p>
                  <p className={cn('text-[10px] font-mono',
                    sequencing.afterLossStreak.avgPnl > 0 ? 'text-neural-green' : 'text-neural-red'
                  )}>
                    {sequencing.afterLossStreak.avgPnl > 0 ? '+' : ''}{sequencing.afterLossStreak.avgPnl.toFixed(3)}%
                  </p>
                </div>
              </div>
              <div className={cn('p-3 rounded-lg border',
                sequencing.clusteringDetected
                  ? 'bg-neural-red/5 border-neural-red/20'
                  : 'bg-neural-green/5 border-neural-green/20'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  {sequencing.clusteringDetected ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-neural-red" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-neural-green" />
                  )}
                  <span className="text-xs font-medium">
                    {sequencing.clusteringDetected ? 'Loss Clustering Detected' : 'No Significant Clustering'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{sequencing.adaptiveDensityImpact}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pair Optimization Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <LineChart className="w-4 h-4 text-primary" />Pair Performance Optimization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Pair</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Expectancy</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Win Rate</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Net P&L</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Trades</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Friction</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pairOptimization.slice(0, 12).map((p, i) => (
                    <tr key={p.pair} className="border-b border-border/10 hover:bg-muted/5">
                      <td className="py-2 px-2 font-mono font-semibold">{p.pair}</td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono', p.expectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {p.expectancy > 0 ? '+' : ''}{(p.expectancy * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono', p.winRate > 0.55 ? 'text-neural-green' : p.winRate > 0.45 ? 'text-foreground' : 'text-neural-red')}>
                          {(p.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className={cn('font-mono font-semibold', p.netPnl > 0 ? 'text-neural-green' : 'text-neural-red')}>
                          {p.netPnl > 0 ? '+' : ''}{p.netPnl.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{p.tradeCount}</td>
                      <td className="text-right py-2 px-2">
                        <span className="font-mono text-muted-foreground">{(p.frictionCost * 100).toFixed(1)}%</span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <Badge variant="outline" className={cn('text-[9px]',
                          p.recommendedWeight === 'increase' ? 'text-neural-green border-neural-green/30'
                          : p.recommendedWeight === 'maintain' ? 'text-primary border-primary/30'
                          : p.recommendedWeight === 'decrease' ? 'text-neural-orange border-neural-orange/30'
                          : 'text-neural-red border-neural-red/30'
                        )}>
                          {p.recommendedWeight}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tuning Recommendations */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-neural-orange" />Ranked Optimization Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/5 border border-border/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">#{rec.rank}</span>
                    <span className="text-xs font-semibold">{rec.area}</span>
                  </div>
                  <Badge variant="outline" className={cn('text-[9px]',
                    rec.priority === 'high' ? 'text-neural-red border-neural-red/30'
                    : rec.priority === 'medium' ? 'text-neural-orange border-neural-orange/30'
                    : 'text-muted-foreground border-border/50'
                  )}>
                    {rec.priority}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Current: </span>
                    <span>{rec.current}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Recommended: </span>
                    <span className="text-primary">{rec.recommended}</span>
                  </div>
                </div>
                <p className="text-[10px] text-neural-green font-medium">
                  Expected: {rec.expectedImpact}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
