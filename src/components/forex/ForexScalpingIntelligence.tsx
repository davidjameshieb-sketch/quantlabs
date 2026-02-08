import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  Brain, CheckCircle2, Clock, Gauge, Layers, Shield, Target,
  TrendingDown, TrendingUp, XCircle, Zap, Radio, Crosshair,
  Timer, Ban, Flame, Eye
} from 'lucide-react';
import {
  createForexMicrostructureState,
  VOLATILITY_PHASE_CONFIG,
  SESSION_CONFIG,
  FOREX_LEAKAGE_LABELS,
} from '@/lib/forex/microstructureEngine';
import type {
  ForexMicrostructureState,
  PairPersonality,
  ScalpingDecisionPacket,
  ForexLeakageAttribution,
  VolatilityPhase,
  LiquiditySession,
} from '@/lib/forex/microstructureEngine';

// ─── Main Component ───

export const ForexScalpingIntelligence = () => {
  const state = useMemo(() => createForexMicrostructureState(), []);

  return (
    <div className="space-y-4">
      {/* Master KPI Strip */}
      <ScalpingKPIStrip state={state} />

      <Tabs defaultValue="microstructure" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="microstructure" className="text-[11px]">Microstructure</TabsTrigger>
          <TabsTrigger value="gating" className="text-[11px]">Entry Gating</TabsTrigger>
          <TabsTrigger value="pairs" className="text-[11px]">Pair Profiles</TabsTrigger>
          <TabsTrigger value="sequencing" className="text-[11px]">Sequencing</TabsTrigger>
          <TabsTrigger value="governance" className="text-[11px]">Governance</TabsTrigger>
          <TabsTrigger value="leakage" className="text-[11px]">Leakage A-H</TabsTrigger>
          <TabsTrigger value="decisions" className="text-[11px]">Decisions</TabsTrigger>
        </TabsList>

        <TabsContent value="microstructure" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SpreadStabilityCard state={state} />
            <LiquidityShockCard state={state} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VolatilityLadderCard state={state} />
            <SessionCard state={state} />
          </div>
        </TabsContent>

        <TabsContent value="gating" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FrictionGateCard state={state} />
            <MTFGateCard state={state} />
          </div>
        </TabsContent>

        <TabsContent value="pairs" className="space-y-4">
          <PairPersonalitiesCard pairs={state.pairPersonalities} />
        </TabsContent>

        <TabsContent value="sequencing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TradeSequencingCard state={state} />
            <EdgeDecayCard state={state} />
          </div>
        </TabsContent>

        <TabsContent value="governance" className="space-y-4">
          <GovernorCard state={state} />
        </TabsContent>

        <TabsContent value="leakage" className="space-y-4">
          <ForexLeakageCard leakage={state.forexLeakage} />
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          <DecisionPacketsCard packets={state.decisionPackets} mode={state.metaControllerMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── KPI Strip ───

const ScalpingKPIStrip = ({ state }: { state: ForexMicrostructureState }) => {
  const phaseConfig = VOLATILITY_PHASE_CONFIG[state.volatilityState.phase];
  const kpis = [
    { label: 'Trade Mode', value: state.metaControllerMode.toUpperCase(), color: state.metaControllerMode === 'scalp' ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-cyan))]', icon: <Crosshair className="w-3.5 h-3.5" /> },
    { label: 'Vol Phase', value: phaseConfig.label, color: phaseConfig.color, icon: <Activity className="w-3.5 h-3.5" /> },
    { label: 'Session', value: SESSION_CONFIG[state.sessionQualification.currentSession].label.split(' ')[0], color: state.sessionQualification.isQualified ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]', icon: <Clock className="w-3.5 h-3.5" /> },
    { label: 'Spread Rank', value: `${state.spreadStability.spreadStabilityRank.toFixed(0)}%`, color: state.spreadStability.spreadStabilityRank > 70 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { label: 'Friction Gate', value: state.frictionExpectancy.passesGate ? 'PASS' : 'FAIL', color: state.frictionExpectancy.passesGate ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]', icon: <Shield className="w-3.5 h-3.5" /> },
    { label: 'MTF Aligned', value: `${state.mtfGate.alignmentScore}%`, color: state.mtfGate.overallPass ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]', icon: <Layers className="w-3.5 h-3.5" /> },
    { label: 'Shock Risk', value: `${state.liquidityShock.shockProbability.toFixed(0)}%`, color: state.liquidityShock.shockProbability > 50 ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]', icon: <Zap className="w-3.5 h-3.5" /> },
    { label: 'Governor', value: state.governor.isThrottled ? 'THROTTLED' : 'ACTIVE', color: state.governor.isThrottled ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]', icon: <Ban className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {kpis.map((kpi, i) => (
        <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
          className="p-2.5 rounded-xl bg-card/50 border border-border/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">{kpi.icon}<span className="text-[9px] uppercase tracking-wider">{kpi.label}</span></div>
          <p className={cn('text-xs font-mono font-bold', kpi.color)}>{kpi.value}</p>
        </motion.div>
      ))}
    </motion.div>
  );
};

// ─── Spread Stability ───

const SpreadStabilityCard = ({ state }: { state: ForexMicrostructureState }) => {
  const ss = state.spreadStability;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Spread Stability Monitor</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Current</p><p className="text-sm font-mono font-semibold">{ss.currentSpread.toFixed(1)} pips</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Average</p><p className="text-sm font-mono font-semibold">{ss.avgSpread.toFixed(1)} pips</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Volatility</p><p className={cn('text-sm font-mono font-semibold', ss.spreadVolatility > 0.8 ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{ss.spreadVolatility.toFixed(2)}σ</p></div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Stability Rank</span><span className="font-mono">{ss.spreadStabilityRank.toFixed(0)}%</span></div>
          <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
            <div className={cn('h-full rounded-full', ss.spreadStabilityRank > 70 ? 'bg-[hsl(var(--neural-green))]' : ss.spreadStabilityRank > 40 ? 'bg-[hsl(var(--neural-orange))]' : 'bg-[hsl(var(--neural-red))]')} style={{ width: `${ss.spreadStabilityRank}%` }} />
          </div>
        </div>
        {ss.driftDetected && (
          <div className="p-2 rounded-md bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/10 text-[10px] flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))]" /><span className="text-[hsl(var(--neural-red))]">Spread widening drift detected</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Liquidity Shock ───

const LiquidityShockCard = ({ state }: { state: ForexMicrostructureState }) => {
  const ls = state.liquidityShock;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-[hsl(var(--neural-orange))]" />Liquidity Shock Detector</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('p-3 rounded-lg border text-center', ls.breakoutSignal ? 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20' : 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20')}>
          <p className={cn('text-2xl font-mono font-bold', ls.breakoutSignal ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{ls.shockProbability.toFixed(0)}%</p>
          <p className="text-[10px] text-muted-foreground">{ls.breakoutSignal ? 'SHOCK LIKELY — Stop Cascade Risk' : 'Liquidity Normal'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Acceleration</span><p className="font-mono font-semibold">{(ls.priceAcceleration * 100).toFixed(0)}%</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Imbalance</span><p className={cn('font-mono font-semibold', ls.orderImbalance > 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{ls.orderImbalance > 0 ? '+' : ''}{(ls.orderImbalance * 100).toFixed(0)}%</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Cascade Risk</span><p className={cn('font-mono font-semibold', ls.stopCascadeRisk > 60 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground')}>{ls.stopCascadeRisk.toFixed(0)}%</p></div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Volatility Ladder ───

const VolatilityLadderCard = ({ state }: { state: ForexMicrostructureState }) => {
  const vs = state.volatilityState;
  const phases: VolatilityPhase[] = ['compression', 'ignition', 'expansion', 'exhaustion'];
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4 text-[hsl(var(--neural-orange))]" />Volatility State Ladder</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {phases.map(phase => {
            const config = VOLATILITY_PHASE_CONFIG[phase];
            const isActive = vs.phase === phase;
            return (
              <div key={phase} className={cn('p-2.5 rounded-lg border flex items-center justify-between', isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/5 border-border/20')}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30')} />
                  <span className={cn('text-xs font-semibold', isActive ? config.color : 'text-muted-foreground')}>{config.label}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{config.scalpingPolicy}</div>
                {isActive && <Badge variant="outline" className="text-[9px]">{vs.phaseConfidence.toFixed(0)}%</Badge>}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">ATR Current</span><p className="font-mono font-semibold">{vs.atrCurrent.toFixed(1)}</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Compression Ratio</span><p className="font-mono font-semibold">{vs.compressionRatio.toFixed(2)}x</p></div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Session Card ───

const SessionCard = ({ state }: { state: ForexMicrostructureState }) => {
  const sq = state.sessionQualification;
  const sessions: LiquiditySession[] = ['asian', 'london-open', 'ny-overlap', 'late-ny'];
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Liquidity Session Qualifier</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {sessions.map(session => {
          const config = SESSION_CONFIG[session];
          const isActive = sq.currentSession === session;
          return (
            <div key={session} className={cn('p-2.5 rounded-lg border flex items-center justify-between', isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/5 border-border/20')}>
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30')} />
                <span className={cn('text-xs font-semibold', isActive ? 'text-foreground' : 'text-muted-foreground')}>{config.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{config.strategy.substring(0, 40)}…</span>
                <Badge variant="outline" className={cn('text-[9px]', config.aggressiveness > 60 ? 'text-[hsl(var(--neural-green))]' : config.aggressiveness > 30 ? 'text-[hsl(var(--neural-cyan))]' : 'text-[hsl(var(--neural-orange))]')}>{config.aggressiveness}%</Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

// ─── Friction Gate ───

const FrictionGateCard = ({ state }: { state: ForexMicrostructureState }) => {
  const fe = state.frictionExpectancy;
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-[hsl(var(--neural-green))]" />Friction Expectancy Gate</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('p-4 rounded-lg border text-center', fe.passesGate ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20')}>
          <p className={cn('text-3xl font-mono font-bold', fe.passesGate ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{fe.frictionRatio.toFixed(1)}×</p>
          <p className="text-[10px] text-muted-foreground mt-1">{fe.passesGate ? 'GATE PASSED — Movement ≥ 3× Friction' : 'GATE FAILED — Insufficient expectancy'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Expected Movement</p><p className="text-sm font-mono font-semibold">{fe.expectedMovement.toFixed(1)} pips</p></div>
          <div className="p-2 rounded-md bg-muted/10"><p className="text-[10px] text-muted-foreground">Total Friction</p><p className="text-sm font-mono font-semibold text-[hsl(var(--neural-orange))]">{fe.totalFriction.toFixed(1)} pips</p></div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── MTF Gate ───

const MTFGateCard = ({ state }: { state: ForexMicrostructureState }) => {
  const gate = state.mtfGate;
  const checks = [
    { label: 'HTF Directional Support', ok: gate.htfSupports, weight: '40%' },
    { label: 'MTF Structural Confirm', ok: gate.mtfConfirms, weight: '35%' },
    { label: 'LTF Execution Clean', ok: gate.ltfClean, weight: '25%' },
  ];
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-[hsl(var(--neural-purple))]" />MTF Alignment Gate</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('p-4 rounded-lg border text-center', gate.overallPass ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20')}>
          <p className={cn('text-3xl font-mono font-bold', gate.overallPass ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{gate.alignmentScore}%</p>
          <p className="text-[10px] text-muted-foreground mt-1">{gate.overallPass ? 'ALL LAYERS ALIGNED' : 'ENTRY BLOCKED — Timeframe conflict'}</p>
        </div>
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/10">
              <div className="flex items-center gap-2">
                {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" /> : <XCircle className="w-3.5 h-3.5 text-[hsl(var(--neural-red))]" />}
                <span>{c.label}</span>
              </div>
              <Badge variant="outline" className="text-[9px]">{c.weight}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Pair Personalities ───

const PairPersonalitiesCard = ({ pairs }: { pairs: PairPersonality[] }) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Radio className="w-4 h-4 text-[hsl(var(--neural-cyan))]" />Pair Personality Profiles</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pairs.map(pair => (
            <div key={pair.pair} className={cn('p-3 rounded-lg border space-y-2', pair.favored ? 'bg-[hsl(var(--neural-green))]/3 border-[hsl(var(--neural-green))]/15' : 'bg-muted/5 border-border/30')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold">{pair.pair}</span>
                  {pair.favored && <Badge className="text-[9px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">FAVORED</Badge>}
                </div>
                <span className={cn('text-xs font-mono font-bold', pair.rollingExpectancy > 65 ? 'text-[hsl(var(--neural-green))]' : pair.rollingExpectancy > 45 ? 'text-[hsl(var(--neural-cyan))]' : 'text-[hsl(var(--neural-orange))]')}>{pair.rollingExpectancy.toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">Duration</span><p className="font-mono">{pair.optimalDurationWindow.min}-{pair.optimalDurationWindow.max}m</p></div>
                <div><span className="text-muted-foreground">Vol Response</span><p className="font-mono">{pair.volatilityResponsiveness.toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Spread Rank</span><p className="font-mono">{pair.spreadStabilityRank.toFixed(0)}%</p></div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(Object.entries(pair.sessionExpectancy) as [LiquiditySession, number][]).map(([session, rate]) => (
                  <Badge key={session} variant="outline" className={cn('text-[8px] px-1.5', rate > 60 ? 'text-[hsl(var(--neural-green))]' : rate > 45 ? 'text-muted-foreground' : 'text-[hsl(var(--neural-red))]')}>
                    {SESSION_CONFIG[session].label.split(' ')[0]}: {rate.toFixed(0)}%
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Trade Sequencing ───

const TradeSequencingCard = ({ state }: { state: ForexMicrostructureState }) => {
  const seq = state.tradeSequencing;
  const clusterColors: Record<string, string> = {
    'profit-momentum': 'text-[hsl(var(--neural-green))]',
    'loss-cluster': 'text-[hsl(var(--neural-red))]',
    'mixed': 'text-[hsl(var(--neural-orange))]',
    'neutral': 'text-muted-foreground',
  };
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[hsl(var(--neural-green))]" />Trade Sequencing Intelligence</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1 justify-center">
          {seq.recentOutcomes.map((o, i) => (
            <div key={i} className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold', o === 'win' ? 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]')}>
              {o === 'win' ? 'W' : 'L'}
            </div>
          ))}
        </div>
        <div className={cn('p-3 rounded-lg border text-center', seq.clusterType === 'profit-momentum' ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : seq.clusterType === 'loss-cluster' ? 'bg-[hsl(var(--neural-red))]/5 border-[hsl(var(--neural-red))]/20' : 'bg-muted/10 border-border/30')}>
          <p className={cn('text-sm font-semibold capitalize', clusterColors[seq.clusterType])}>{seq.clusterType.replace('-', ' ')}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{seq.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Confidence Adj</span><p className={cn('font-mono font-semibold', seq.confidenceAdjustment > 0 ? 'text-[hsl(var(--neural-green))]' : seq.confidenceAdjustment < 0 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground')}>{seq.confidenceAdjustment > 0 ? '+' : ''}{seq.confidenceAdjustment}%</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Density Adj</span><p className={cn('font-mono font-semibold', seq.densityAdjustment > 0 ? 'text-[hsl(var(--neural-green))]' : seq.densityAdjustment < 0 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground')}>{seq.densityAdjustment > 0 ? '+' : ''}{seq.densityAdjustment}%</p></div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Edge Decay ───

const EdgeDecayCard = ({ state }: { state: ForexMicrostructureState }) => {
  const ed = state.edgeDecay;
  const healthPct = Math.min(100, (ed.rollingExpectancy / ed.baselineExpectancy) * 100);
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-[hsl(var(--neural-purple))]" />Edge Decay Monitor</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('p-3 rounded-lg border text-center', ed.isDecaying ? 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20' : 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20')}>
          <p className={cn('text-2xl font-mono font-bold', ed.isDecaying ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{healthPct.toFixed(0)}%</p>
          <p className="text-[10px] text-muted-foreground">{ed.isDecaying ? `DECAYING — ${ed.decayRate.toFixed(0)}% below baseline` : 'Edge stable'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Rolling</span><p className="font-mono font-semibold">{ed.rollingExpectancy.toFixed(2)}</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Baseline</span><p className="font-mono font-semibold">{ed.baselineExpectancy.toFixed(2)}</p></div>
          <div className="p-2 rounded-md bg-muted/10"><span className="text-muted-foreground">Filter Tight.</span><p className={cn('font-mono font-semibold', ed.filterTightening > 0 ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground')}>{ed.filterTightening.toFixed(0)}%</p></div>
        </div>
        {ed.throttleActive && (
          <div className="p-2 rounded-md bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/10 text-[10px] flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))]" /><span className="text-[hsl(var(--neural-red))]">Throttle active — frequency reduced</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Governor ───

const GovernorCard = ({ state }: { state: ForexMicrostructureState }) => {
  const gov = state.governor;
  const trendIcon = (t: string) => t === 'improving' ? <ArrowUpRight className="w-3 h-3 text-[hsl(var(--neural-green))]" /> : t === 'declining' || t === 'worsening' ? <ArrowDownRight className="w-3 h-3 text-[hsl(var(--neural-red))]" /> : <Activity className="w-3 h-3 text-muted-foreground" />;
  const trendColor = (t: string) => t === 'improving' ? 'text-[hsl(var(--neural-green))]' : t === 'declining' || t === 'worsening' ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground';

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Ban className="w-4 h-4 text-[hsl(var(--neural-red))]" />Anti-Overtrading Governor</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('p-4 rounded-lg border text-center', gov.isThrottled ? 'bg-[hsl(var(--neural-red))]/10 border-[hsl(var(--neural-red))]/20' : 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20')}>
          <p className={cn('text-lg font-mono font-bold', gov.isThrottled ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{gov.isThrottled ? '⚠ THROTTLED' : '✓ OPERATING NORMALLY'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{gov.description}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Capture Ratio', trend: gov.captureRatioTrend },
            { label: 'Spread Friction', trend: gov.spreadFrictionTrend },
            { label: 'Duration Eff.', trend: gov.durationEfficiencyTrend },
            { label: 'Win Rate', trend: `${gov.winRateRolling.toFixed(0)}% / ${gov.winRateThreshold}%` },
          ].map((m, i) => (
            <div key={i} className="p-2 rounded-md bg-muted/10 text-center text-[10px]">
              <p className="text-muted-foreground">{m.label}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                {typeof m.trend === 'string' && !m.trend.includes('%') && trendIcon(m.trend)}
                <span className={cn('font-semibold capitalize', typeof m.trend === 'string' && !m.trend.includes('%') ? trendColor(m.trend) : gov.winRateRolling > gov.winRateThreshold ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{m.trend}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/10">
          <span className="text-muted-foreground">Trade Density</span>
          <span className={cn('font-mono font-semibold', gov.currentDensity > gov.tradeDensityLimit ? 'text-[hsl(var(--neural-red))]' : 'text-[hsl(var(--neural-green))]')}>{gov.currentDensity} / {gov.tradeDensityLimit} per session</span>
        </div>

        {gov.throttleReasons.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Throttle Reasons</p>
            {gov.throttleReasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] p-2 rounded-md bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/10">
                <AlertTriangle className="w-3 h-3 text-[hsl(var(--neural-red))]" /><span className="text-muted-foreground">{r}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Forex Leakage A-H ───

const ForexLeakageCard = ({ leakage }: { leakage: ForexLeakageAttribution[] }) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          Forex Scalping Leakage Attribution (A-H)
          <Badge variant="outline" className="text-[10px] ml-auto text-[hsl(var(--neural-red))]">-${leakage.reduce((s, l) => s + l.totalPnlImpact, 0).toFixed(0)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {leakage.map((attr, i) => {
          const maxImpact = Math.max(...leakage.map(a => a.totalPnlImpact));
          const barWidth = maxImpact > 0 ? (attr.totalPnlImpact / maxImpact) * 100 : 0;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground font-medium">{FOREX_LEAKAGE_LABELS[attr.category]}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('text-[9px]', attr.severity === 'critical' ? 'text-[hsl(var(--neural-red))]' : attr.severity === 'moderate' ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground')}>{attr.severity}</Badge>
                  <span className="font-mono text-[hsl(var(--neural-red))]">-${attr.totalPnlImpact.toFixed(0)}</span>
                  <span className="text-muted-foreground">({attr.percentOfTotal.toFixed(0)}%)</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div className={cn('h-full rounded-full', attr.severity === 'critical' ? 'bg-[hsl(var(--neural-red))]' : 'bg-[hsl(var(--neural-orange))]')} style={{ width: `${barWidth}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground/70 pl-2">{attr.recommendation}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

// ─── Decision Packets ───

const DecisionPacketsCard = ({ packets, mode }: { packets: ScalpingDecisionPacket[]; mode: string }) => {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
          Scalping Decision Packets
          <Badge variant="outline" className="text-[10px] ml-auto capitalize">{mode} Mode</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {packets.map((pkt, i) => (
            <div key={i} className={cn('p-3 rounded-lg border space-y-2', pkt.gatingPassed ? 'bg-[hsl(var(--neural-green))]/3 border-[hsl(var(--neural-green))]/15' : 'bg-[hsl(var(--neural-red))]/3 border-[hsl(var(--neural-red))]/15')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold">{pkt.pair}</span>
                  <Badge variant="outline" className={cn('text-[9px] capitalize', pkt.direction === 'long' ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{pkt.direction}</Badge>
                  <Badge variant="outline" className="text-[9px] capitalize">{pkt.tradeMode}</Badge>
                </div>
                <Badge className={cn('text-[9px]', pkt.gatingPassed ? 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]')}>{pkt.gatingPassed ? '✓ APPROVED' : '✗ BLOCKED'}</Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">MTF</span><p className={cn('font-mono', pkt.mtfAlignment.overallPass ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{pkt.mtfAlignment.alignmentScore}%</p></div>
                <div><span className="text-muted-foreground">Shock</span><p className="font-mono">{pkt.liquidityShockScore.toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Spread</span><p className="font-mono">{pkt.spreadEfficiency.toFixed(0)}%</p></div>
                <div><span className="text-muted-foreground">Risk</span><p className="font-mono">{pkt.riskEnvelope.toFixed(1)}%</p></div>
              </div>
              <p className="text-[9px] text-muted-foreground border-l-2 border-primary/20 pl-2">{pkt.justification}</p>
              {pkt.gatingFailures.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {pkt.gatingFailures.map((f, j) => (
                    <Badge key={j} variant="outline" className="text-[8px] text-[hsl(var(--neural-red))]">{f}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
