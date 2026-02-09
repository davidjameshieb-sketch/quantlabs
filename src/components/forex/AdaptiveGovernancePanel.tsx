// Adaptive Governance Dashboard Panel
// Full governance visualization: rolling windows, pair allocations,
// session budgets, shadow candidates.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity, BarChart3, Ban, CheckCircle2, Clock, FlaskConical,
  Gauge, Shield, ShieldAlert, ShieldCheck, Star, Target,
  TrendingDown, TrendingUp, Minus, AlertTriangle, Zap, Lock,
} from 'lucide-react';
import {
  GovernanceDashboardData,
  RollingWindow,
  PairAllocation,
  SessionBudget,
  ShadowCandidate,
} from '@/lib/forex/adaptiveGovernanceEngine';
import { GovernanceStateBanner } from './GovernanceStateBanner';

interface AdaptiveGovernancePanelProps {
  data: GovernanceDashboardData;
}

// ─── Rolling Window Row ───

const WindowRow = ({ w }: { w: RollingWindow }) => (
  <div className="grid grid-cols-8 gap-2 text-[10px] items-center py-1.5 border-b border-border/10 last:border-0">
    <span className="text-muted-foreground font-medium">{w.label}</span>
    <span className="text-center font-mono">{w.tradeCount}</span>
    <span className={cn('text-center font-mono font-bold', w.winRate >= 0.55 ? 'text-neural-green' : w.winRate >= 0.45 ? 'text-foreground' : 'text-neural-red')}>
      {(w.winRate * 100).toFixed(1)}%
    </span>
    <span className={cn('text-center font-mono', w.expectancy >= 0.5 ? 'text-neural-green' : w.expectancy >= 0 ? 'text-foreground' : 'text-neural-red')}>
      {w.expectancy >= 0 ? '+' : ''}{w.expectancy.toFixed(2)}p
    </span>
    <span className={cn('text-center font-mono', w.captureRatio >= 0.5 ? 'text-neural-green' : 'text-neural-orange')}>
      {(w.captureRatio * 100).toFixed(0)}%
    </span>
    <span className={cn('text-center font-mono', w.avgQuality >= 70 ? 'text-neural-green' : 'text-neural-orange')}>
      {w.avgQuality.toFixed(0)}
    </span>
    <span className={cn('text-center font-mono', w.avgSlippage < 0.3 ? 'text-neural-green' : 'text-neural-orange')}>
      {w.avgSlippage.toFixed(2)}p
    </span>
    <span className="text-center">
      {w.slippageDrift ? (
        <Badge variant="outline" className="text-[8px] px-1 py-0 text-neural-red border-neural-red/30">DRIFT</Badge>
      ) : (
        <Badge variant="outline" className="text-[8px] px-1 py-0 text-neural-green border-neural-green/30">OK</Badge>
      )}
    </span>
  </div>
);

// ─── Pair Allocation Row ───

const pairStatusConfig = {
  promoted: { icon: Star, color: 'text-neural-green', border: 'border-neural-green/30', bg: 'bg-neural-green/10', label: 'PROMOTED' },
  normal: { icon: Minus, color: 'text-muted-foreground', border: 'border-border/50', bg: 'bg-muted/5', label: 'NORMAL' },
  restricted: { icon: AlertTriangle, color: 'text-neural-orange', border: 'border-neural-orange/30', bg: 'bg-neural-orange/10', label: 'RESTRICTED' },
  banned: { icon: Ban, color: 'text-neural-red', border: 'border-neural-red/30', bg: 'bg-neural-red/10', label: 'BANNED' },
};

const PairRow = ({ pair }: { pair: PairAllocation }) => {
  const cfg = pairStatusConfig[pair.status];
  const StatusIcon = cfg.icon;
  return (
    <tr className="border-b border-border/10 hover:bg-muted/5">
      <td className="py-1.5 px-2 font-mono text-xs font-bold">{pair.displayPair}</td>
      <td className="py-1.5 px-2 text-center">
        <span className={cn('font-mono text-[10px]', pair.winRate > 0.55 ? 'text-neural-green' : pair.winRate > 0.45 ? 'text-foreground' : 'text-neural-red')}>
          {(pair.winRate * 100).toFixed(0)}%
        </span>
      </td>
      <td className="py-1.5 px-2 text-center">
        <span className={cn('font-mono text-[10px]', pair.expectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>
          {pair.expectancy >= 0 ? '+' : ''}{pair.expectancy.toFixed(2)}p
        </span>
      </td>
      <td className="py-1.5 px-2 text-center">
        <span className={cn('font-mono text-[10px]', pair.sharpe > 1 ? 'text-neural-green' : pair.sharpe > 0 ? 'text-foreground' : 'text-neural-red')}>
          {pair.sharpe.toFixed(2)}
        </span>
      </td>
      <td className="py-1.5 px-2 text-center">
        <span className={cn('font-mono text-[10px]', pair.netPnlPips > 0 ? 'text-neural-green' : 'text-neural-red')}>
          {pair.netPnlPips >= 0 ? '+' : ''}{pair.netPnlPips.toFixed(1)}p
        </span>
      </td>
      <td className="py-1.5 px-2 text-center text-[10px] text-muted-foreground">{pair.tradeCount}</td>
      <td className="py-1.5 px-2 text-center">
        <span className="font-mono text-[10px] font-bold">{pair.capitalMultiplier.toFixed(2)}×</span>
      </td>
      <td className="py-1.5 px-2 text-right">
        <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', cfg.color, cfg.border, cfg.bg)}>
          <StatusIcon className="w-2 h-2 mr-0.5 inline" />{cfg.label}
        </Badge>
      </td>
    </tr>
  );
};

// ─── Session Budget Card ───

const SessionCard = ({ budget }: { budget: SessionBudget }) => {
  const agg = budget.currentAggressiveness;
  const color = agg >= 0.8 ? 'text-neural-green' : agg >= 0.5 ? 'text-foreground' : agg >= 0.3 ? 'text-neural-orange' : 'text-neural-red';
  return (
    <div className="p-2.5 rounded-lg bg-card/50 border border-border/30 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold">{budget.label}</span>
        <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', color)}>
          {budget.maxDensity === 0 ? 'PAUSED' : `${budget.maxDensity} max`}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[9px] text-muted-foreground">
        <div className="text-center">
          <span className="block">Friction</span>
          <span className="font-mono font-bold text-foreground">{budget.frictionMultiplier.toFixed(1)}×</span>
        </div>
        <div className="text-center">
          <span className="block">Vol Tol</span>
          <span className="font-mono font-bold text-foreground">{budget.volatilityTolerance.toFixed(2)}</span>
        </div>
        <div className="text-center">
          <span className="block">Capital</span>
          <span className="font-mono font-bold text-foreground">{(budget.capitalBudgetPct * 100).toFixed(0)}%</span>
        </div>
      </div>
      {/* Aggressiveness bar */}
      <div className="h-1 rounded-full bg-muted/20">
        <div
          className={cn('h-full rounded-full transition-all',
            agg >= 0.8 ? 'bg-neural-green/60' : agg >= 0.5 ? 'bg-primary/60' : agg >= 0.3 ? 'bg-neural-orange/60' : 'bg-neural-red/60'
          )}
          style={{ width: `${Math.min(100, agg * 100)}%` }}
        />
      </div>
    </div>
  );
};

// ─── Shadow Candidate Card ───

const ShadowCard = ({ candidate }: { candidate: ShadowCandidate }) => (
  <div className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">{candidate.parameter}</span>
      </div>
      <Badge variant="outline" className={cn('text-[9px]',
        candidate.eligible ? 'text-neural-green border-neural-green/30' : 'text-neural-orange border-neural-orange/30'
      )}>
        {candidate.eligible ? 'ELIGIBLE' : 'COLLECTING'}
      </Badge>
    </div>
    <div className="grid grid-cols-4 gap-2 text-[9px]">
      <div className="text-center">
        <p className="text-muted-foreground">Current</p>
        <p className="font-mono font-bold">{candidate.currentValue}</p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">Proposed</p>
        <p className="font-mono font-bold text-primary">{candidate.proposedValue}</p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">Shadow Exp.</p>
        <p className={cn('font-mono font-bold', candidate.shadowExpectancy > candidate.baselineExpectancy ? 'text-neural-green' : 'text-neural-red')}>
          {candidate.shadowExpectancy.toFixed(2)}p
        </p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">Sample</p>
        <p className="font-mono font-bold">{candidate.sampleSize}/{candidate.minSampleRequired}</p>
      </div>
    </div>
    <p className="text-[9px] text-muted-foreground">{candidate.reason}</p>
  </div>
);

// ─── Main Component ───

export const AdaptiveGovernancePanel = ({ data }: AdaptiveGovernancePanelProps) => {
  return (
    <div className="space-y-4">
      {/* State Banner */}
      <GovernanceStateBanner
        state={data.currentState}
        reasons={data.stateReasons}
        promotedPairs={data.promotedPairs}
        restrictedPairs={data.restrictedPairs}
        bannedPairs={data.bannedPairs}
        sessionBudgets={data.sessionBudgets}
      />

      {/* Rolling Windows */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />Rolling Performance Windows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-8 gap-2 text-[9px] text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border/30">
              <span>Window</span>
              <span className="text-center">Trades</span>
              <span className="text-center">Win Rate</span>
              <span className="text-center">Expectancy</span>
              <span className="text-center">Capture</span>
              <span className="text-center">Quality</span>
              <span className="text-center">Slippage</span>
              <span className="text-center">Drift</span>
            </div>
            <WindowRow w={data.windows.w20} />
            <WindowRow w={data.windows.w50} />
            <WindowRow w={data.windows.w200} />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pair Allocations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />Adaptive Pair Capital Allocation
                <Badge variant="outline" className="text-[9px] ml-auto">
                  {data.pairAllocations.length} active pairs
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.pairAllocations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No pair data available yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Pair</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">WR</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Exp.</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Sharpe</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Net P&L</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Trades</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Capital</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-medium text-[9px]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pairAllocations.map(pair => (
                        <PairRow key={pair.pair} pair={pair} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Session Budgets */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="bg-card/60 border-border/40 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />Session Risk Budgets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.sessionBudgets.map(budget => (
                  <SessionCard key={budget.session} budget={budget} />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Shadow Candidates */}
      {data.shadowCandidates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-[hsl(var(--neural-purple))]" />Shadow Model Candidates
                <Badge variant="outline" className="text-[9px] ml-auto">
                  {data.shadowCandidates.filter(c => c.eligible).length} eligible
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.shadowCandidates.map(candidate => (
                <ShadowCard key={candidate.id} candidate={candidate} />
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
