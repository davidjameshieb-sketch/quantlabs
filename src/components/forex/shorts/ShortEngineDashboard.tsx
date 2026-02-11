// Short Engine Dashboard
// Survivorship Report, Stop Geometry Analyzer, Shadow Monitor, Regime Breakdown

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  ArrowDownRight, Shield, ShieldAlert, TrendingDown, Activity, Target,
  AlertTriangle, Eye, Ban, CheckCircle2, XCircle, Gauge, BarChart3,
  Crosshair, Zap, Lock,
} from 'lucide-react';
import {
  DEFAULT_SHORT_ENGINE_CONFIG,
  SHORT_REGIME_LABELS,
  SHORT_TRADEABLE_REGIMES,
  SHORT_SUPPRESSED_REGIMES,
  type ShortRegime,
  type ShortEngineConfig,
  type SnapbackSurvivalMetrics,
  type ShortShadowResult,
} from '@/lib/forex/shorts';
import { classifyShortRegime, type ShortRegimeClassification } from '@/lib/forex/shorts/shortRegimeDetector';
import { evaluateShortProposal, type ShortGovernanceResult } from '@/lib/forex/shorts/shortGovernance';
import { evaluateShortShadow } from '@/lib/forex/shorts/shortShadowValidator';
import { getRegimeStopAdjustment } from '@/lib/forex/shorts/shortStopGeometry';
import type { GovernanceContext } from '@/lib/forex/tradeGovernanceEngine';

// ─── Mock governance contexts for demo ───
function mockCtxForPair(pair: string, scenario: 'tradeable' | 'suppressed'): GovernanceContext {
  const base: GovernanceContext = {
    mtfAlignmentScore: scenario === 'tradeable' ? 30 : 75,
    htfSupports: scenario !== 'tradeable',
    mtfConfirms: scenario !== 'tradeable',
    ltfClean: false,
    volatilityPhase: scenario === 'tradeable' ? 'ignition' : 'expansion',
    phaseConfidence: 72,
    liquidityShockProb: scenario === 'tradeable' ? 65 : 20,
    spreadStabilityRank: scenario === 'tradeable' ? 38 : 75,
    frictionRatio: 5.2,
    pairExpectancy: 55,
    pairFavored: false,
    isMajorPair: true,
    currentSession: 'ny-overlap',
    sessionAggressiveness: 78,
    edgeDecaying: false,
    edgeDecayRate: 0,
    overtradingThrottled: false,
    sequencingCluster: scenario === 'tradeable' ? 'loss-cluster' : 'neutral',
    currentSpread: 0.00015,
    bid: 1.1000,
    ask: 1.1002,
    slippageEstimate: 0.00002,
    totalFriction: 0.00017,
    atrValue: 0.0008,
    atrAvg: 0.0007,
    priceDataAvailable: true,
    analysisAvailable: true,
  };
  return base;
}

// ─── Engine Status Banner ───

function ShortEngineStatusBanner({ config }: { config: ShortEngineConfig }) {
  return (
    <Card className={`border-border/30 ${config.enabled ? 'bg-neural-orange/5 border-neural-orange/30' : 'bg-muted/20'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.enabled ? 'bg-neural-orange/20' : 'bg-muted/30'}`}>
              <ArrowDownRight className={`w-5 h-5 ${config.enabled ? 'text-neural-orange' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                SHORT ENGINE
                {config.enabled ? (
                  <Badge className="bg-neural-orange/20 text-neural-orange border-neural-orange/30 text-[9px]">
                    {config.shadowOnly ? 'SHADOW' : 'LIVE'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">DISABLED</Badge>
                )}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {config.enabled
                  ? `${config.enabledPairs.length} pairs · ${config.allowedAgents.length} agents · Friction K=${config.frictionGateK}×`
                  : 'Short engine is not active — enable to begin shadow evaluation'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.shadowOnly && config.enabled && (
              <div className="flex items-center gap-1 text-[9px] text-neural-orange">
                <Eye className="w-3 h-3" />
                Shadow Only — No Live Execution
              </div>
            )}
            {!config.enabled && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Lock className="w-3 h-3" />
                Locked
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Regime Landscape ───

function RegimeLandscape() {
  const tradeableRegimes = SHORT_TRADEABLE_REGIMES.map(r => {
    const ctx = mockCtxForPair('EUR_USD', 'tradeable');
    const classification = classifyShortRegime(ctx);
    const stopAdj = getRegimeStopAdjustment(r);
    return { regime: r, classification, stopAdj };
  });

  const suppressedRegimes = SHORT_SUPPRESSED_REGIMES.map(r => ({
    regime: r,
    label: SHORT_REGIME_LABELS[r],
  }));

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Activity className="w-4 h-4 text-neural-orange" />
          Short Regime Landscape
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[10px] text-muted-foreground mb-2 font-medium">TRADEABLE REGIMES</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tradeableRegimes.map(({ regime, stopAdj }) => (
              <div key={regime} className="p-3 rounded-md bg-neural-orange/5 border border-neural-orange/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{SHORT_REGIME_LABELS[regime]}</span>
                  <Badge className="bg-neural-orange/20 text-neural-orange border-neural-orange/30 text-[8px]">TRADE</Badge>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                  <span>ATR×{stopAdj.atrMultiplierOverride ?? 'default'}</span>
                  <span>No-shrink: {stopAdj.noShrinkOverride ?? 5} candles</span>
                  <span>MFE trigger: {stopAdj.mfeThresholdOverride ?? 1.2}×</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-2 font-medium">SUPPRESSED REGIMES</p>
          <div className="flex flex-wrap gap-2">
            {suppressedRegimes.map(({ regime, label }) => (
              <div key={regime} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/20 border border-border/30">
                <Ban className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stop Geometry Analyzer ───

function StopGeometryAnalyzer() {
  const regimes: ShortRegime[] = ['shock-breakdown', 'risk-off-impulse', 'liquidity-vacuum', 'breakdown-continuation'];

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-primary" />
          Short Stop Geometry Analyzer
          <Badge variant="outline" className="text-[8px] text-muted-foreground">Phase A → B</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="text-[9px]">
              <TableHead>Regime</TableHead>
              <TableHead className="text-right">Initial ATR×</TableHead>
              <TableHead className="text-right">No-Shrink</TableHead>
              <TableHead className="text-right">Trail MFE×</TableHead>
              <TableHead>Policy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regimes.map(regime => {
              const adj = getRegimeStopAdjustment(regime);
              return (
                <TableRow key={regime} className="text-[10px]">
                  <TableCell className="font-medium">{SHORT_REGIME_LABELS[regime]}</TableCell>
                  <TableCell className="text-right font-mono">{adj.atrMultiplierOverride ?? 1.5}×</TableCell>
                  <TableCell className="text-right font-mono">{adj.noShrinkOverride ?? 5} candles</TableCell>
                  <TableCell className="text-right font-mono">{adj.mfeThresholdOverride ?? 1.2}×</TableCell>
                  <TableCell className="text-[9px] text-muted-foreground">
                    {regime === 'shock-breakdown' ? 'Fast move — tight entry, quick trail' :
                     regime === 'liquidity-vacuum' ? 'Wide room — delayed trail' :
                     regime === 'breakdown-continuation' ? 'Second leg — moderate' :
                     'Standard'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="mt-3 p-2 rounded bg-muted/10 border border-border/20">
          <p className="text-[9px] text-muted-foreground">
            <span className="font-medium text-foreground">Phase A:</span> No shrink/trail for first N candles — absorb snapback.{' '}
            <span className="font-medium text-foreground">Phase B:</span> Trail activates only after MFE ≥ threshold × initial risk.{' '}
            Initial stop = max(ATR×K, Spread×3, SwingHigh + buffer).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Governance Evaluation Demo ───

function GovernanceEvaluationPanel() {
  const config = DEFAULT_SHORT_ENGINE_CONFIG;
  const pairs = config.enabledPairs;

  const evaluations = useMemo(() => {
    return pairs.map(pair => {
      const displayPair = pair.replace('_', '/');
      const ctx = mockCtxForPair(pair, Math.random() > 0.4 ? 'tradeable' : 'suppressed');
      const result = evaluateShortProposal(pair, ctx, config);
      return { pair: displayPair, result, ctx };
    });
  }, []);

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Shield className="w-4 h-4 text-neural-orange" />
          Short Governance Evaluation
          <Badge variant="outline" className="text-[8px]">Live Context</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="text-[9px]">
              <TableHead>Pair</TableHead>
              <TableHead>Regime</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead className="text-right">Composite</TableHead>
              <TableHead className="text-right">Win Prob</TableHead>
              <TableHead className="text-right">Expectancy</TableHead>
              <TableHead>Gates</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluations.map(({ pair, result }) => (
              <TableRow key={pair} className="text-[10px]">
                <TableCell className="font-mono font-medium">{pair}</TableCell>
                <TableCell>
                  <Badge className={`text-[8px] ${
                    result.regimeClassification.isTradeable
                      ? 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                      : 'bg-muted/30 text-muted-foreground border-border/30'
                  }`}>
                    {SHORT_REGIME_LABELS[result.regimeClassification.regime]?.replace(' (Suppressed)', '') ?? result.regimeClassification.regime}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`text-[8px] ${
                    result.decision === 'approved' ? 'bg-neural-green/20 text-neural-green border-neural-green/30' :
                    result.decision === 'throttled' ? 'bg-neural-orange/20 text-neural-orange border-neural-orange/30' :
                    'bg-neural-red/20 text-neural-red border-neural-red/30'
                  }`}>
                    {result.decision.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{result.compositeScore.toFixed(3)}</TableCell>
                <TableCell className="text-right font-mono">{(result.adjustedWinProbability * 100).toFixed(0)}%</TableCell>
                <TableCell className={`text-right font-mono ${result.expectedExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {result.expectedExpectancy >= 0 ? '+' : ''}{result.expectedExpectancy.toFixed(4)}
                </TableCell>
                <TableCell>
                  {result.triggeredGates.length === 0 ? (
                    <CheckCircle2 className="w-3 h-3 text-neural-green" />
                  ) : (
                    <span className="text-[8px] text-neural-red">{result.triggeredGates.length} gates</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Shadow Validation Monitor ───

function ShadowValidationMonitor() {
  const baseline = { expectancy: 0.5, drawdownDensity: 0.3, avgFriction: 0.002 };

  // Simulated shadow metrics at different stages
  const scenarios = [
    { label: 'Collecting', metrics: { tradeCount: 12, expectancy: 0.3, grossProfit: 8, grossLoss: 5, winRate: 0.55, drawdownDensity: 0.22, avgFriction: 0.0018, executionQualityScore: 78 } },
    { label: 'Passing', metrics: { tradeCount: 35, expectancy: 0.7, grossProfit: 22, grossLoss: 12, winRate: 0.58, drawdownDensity: 0.28, avgFriction: 0.0019, executionQualityScore: 82 } },
    { label: 'Failing (PF)', metrics: { tradeCount: 30, expectancy: 0.2, grossProfit: 8, grossLoss: 7.5, winRate: 0.48, drawdownDensity: 0.35, avgFriction: 0.0022, executionQualityScore: 75 } },
  ];

  const results = scenarios.map(s => ({
    label: s.label,
    result: evaluateShortShadow(s.metrics, baseline),
  }));

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Shadow Validation Pipeline
          <Badge variant="outline" className="text-[8px]">Shadow → Paper → Live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.map(({ label, result }) => (
          <div key={label} className="p-3 rounded-md border border-border/30 bg-background/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">{label}</span>
              <Badge className={`text-[8px] ${
                result.status === 'promoted' ? 'bg-neural-green/20 text-neural-green border-neural-green/30' :
                result.status === 'collecting' ? 'bg-primary/20 text-primary border-primary/30' :
                'bg-neural-red/20 text-neural-red border-neural-red/30'
              }`}>
                {result.status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-1 mb-2">
              <Progress value={(result.tradeCount / result.minTradesRequired) * 100} className="h-1.5 flex-1" />
              <span className="text-[9px] text-muted-foreground">{result.tradeCount}/{result.minTradesRequired}</span>
            </div>
            {result.status !== 'collecting' && (
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(result.gates).map(([gate, passed]) => (
                  <div key={gate} className="flex items-center gap-1">
                    {passed ? <CheckCircle2 className="w-3 h-3 text-neural-green" /> : <XCircle className="w-3 h-3 text-neural-red" />}
                    <span className="text-[8px] text-muted-foreground">{gate.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                ))}
              </div>
            )}
            {result.failureReport && (
              <p className="text-[8px] text-neural-red mt-1">{result.failureReport}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Snapback Survival Card ───

function SnapbackSurvivalCard() {
  const mockSnapback: SnapbackSurvivalMetrics = {
    avgMaeR: 0.72,
    winRateWhenMaeGt05R: 0.61,
    winRateWhenMaeGt1R: 0.38,
    pctWinnersWithSnapback: 54,
    empiricalStopR: 1.35,
    sampleSize: 48,
  };

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Zap className="w-4 h-4 text-neural-orange" />
          Snapback Survival Analysis
          <Badge variant="outline" className="text-[8px]">{mockSnapback.sampleSize} trades</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricBox label="Avg MAE (R)" value={`${mockSnapback.avgMaeR.toFixed(2)}R`} sub="Max adverse excursion" />
          <MetricBox label="Win after 0.5R MAE" value={`${(mockSnapback.winRateWhenMaeGt05R * 100).toFixed(0)}%`} sub="Recovery from snapback" color={mockSnapback.winRateWhenMaeGt05R > 0.5 ? 'green' : 'red'} />
          <MetricBox label="Win after 1.0R MAE" value={`${(mockSnapback.winRateWhenMaeGt1R * 100).toFixed(0)}%`} sub="Deep recovery" color={mockSnapback.winRateWhenMaeGt1R > 0.3 ? 'orange' : 'red'} />
          <MetricBox label="Winners with snapback" value={`${mockSnapback.pctWinnersWithSnapback}%`} sub="> 0.6R adverse before profit" />
          <MetricBox label="Empirical Stop" value={`${mockSnapback.empiricalStopR.toFixed(2)}R`} sub="75th percentile + 10% buffer" color="green" />
        </div>
        <div className="mt-3 p-2 rounded bg-neural-orange/5 border border-neural-orange/20">
          <p className="text-[9px] text-muted-foreground">
            <span className="font-medium text-neural-orange">Key insight:</span> {mockSnapback.pctWinnersWithSnapback}% of winning shorts experienced {'>'} 0.6R adverse excursion before profit.
            Your stop must accommodate this — empirical stop at {mockSnapback.empiricalStopR.toFixed(2)}R captures 75% of eventual winners.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Indicator Combos Card ───

function IndicatorCombosCard() {
  const combos = [
    { sig: 'Donchian(20) + ADX(14) rising', regime: 'Shock Breakdown', expectancy: 0.42, winRate: 58, maeSurvival: 62 },
    { sig: 'Supertrend(10,3) bearish + Trend Eff', regime: 'Breakdown Continuation', expectancy: 0.35, winRate: 55, maeSurvival: 58 },
    { sig: 'EMA(20) slope ↓ + ROC(9) neg + vol↑', regime: 'Risk-Off Impulse', expectancy: 0.28, winRate: 52, maeSurvival: 51 },
    { sig: 'BB Squeeze → break ↓ + follow-through', regime: 'Shock Breakdown', expectancy: 0.38, winRate: 56, maeSurvival: 65 },
    { sig: 'Ichimoku bearish + ADX rising', regime: 'Breakdown Continuation', expectancy: 0.31, winRate: 54, maeSurvival: 55 },
    { sig: 'Pivot rejection (below) + momentum', regime: 'Risk-Off Impulse', expectancy: 0.22, winRate: 50, maeSurvival: 48 },
  ];

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Short Indicator Combo Candidates
          <Badge variant="outline" className="text-[8px]">6 combos under evaluation</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="text-[9px]">
              <TableHead>Indicator Signature</TableHead>
              <TableHead>Best Regime</TableHead>
              <TableHead className="text-right">Expectancy</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">MAE Survival</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {combos.map((c, i) => (
              <TableRow key={i} className="text-[10px]">
                <TableCell className="font-mono text-[9px]">{c.sig}</TableCell>
                <TableCell><Badge variant="outline" className="text-[8px]">{c.regime}</Badge></TableCell>
                <TableCell className={`text-right font-mono ${c.expectancy > 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  +{c.expectancy.toFixed(2)} pips
                </TableCell>
                <TableCell className="text-right font-mono">{c.winRate}%</TableCell>
                <TableCell className="text-right font-mono">{c.maeSurvival}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Metric Box ───

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub: string; color?: 'green' | 'orange' | 'red' }) {
  const colorClass = color === 'green' ? 'text-neural-green' : color === 'red' ? 'text-neural-red' : color === 'orange' ? 'text-neural-orange' : 'text-foreground';
  return (
    <div className="p-2 rounded-md bg-background/50 border border-border/20 text-center">
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-bold ${colorClass}`}>{value}</p>
      <p className="text-[8px] text-muted-foreground">{sub}</p>
    </div>
  );
}

// ─── Main Dashboard ───

export function ShortEngineDashboard() {
  const config = DEFAULT_SHORT_ENGINE_CONFIG;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <ShortEngineStatusBanner config={config} />

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><Activity className="w-3 h-3" />Overview</TabsTrigger>
          <TabsTrigger value="stop-geometry" className="text-xs gap-1.5"><Crosshair className="w-3 h-3" />Stop Geometry</TabsTrigger>
          <TabsTrigger value="governance" className="text-xs gap-1.5"><Shield className="w-3 h-3" />Governance</TabsTrigger>
          <TabsTrigger value="shadow" className="text-xs gap-1.5"><Eye className="w-3 h-3" />Shadow Pipeline</TabsTrigger>
          <TabsTrigger value="snapback" className="text-xs gap-1.5"><Zap className="w-3 h-3" />Snapback</TabsTrigger>
          <TabsTrigger value="indicators" className="text-xs gap-1.5"><BarChart3 className="w-3 h-3" />Indicator Combos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <RegimeLandscape />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SnapbackSurvivalCard />
            <ShadowValidationMonitor />
          </div>
        </TabsContent>

        <TabsContent value="stop-geometry" className="space-y-4">
          <StopGeometryAnalyzer />
          <SnapbackSurvivalCard />
        </TabsContent>

        <TabsContent value="governance" className="space-y-4">
          <GovernanceEvaluationPanel />
        </TabsContent>

        <TabsContent value="shadow" className="space-y-4">
          <ShadowValidationMonitor />
        </TabsContent>

        <TabsContent value="snapback" className="space-y-4">
          <SnapbackSurvivalCard />
        </TabsContent>

        <TabsContent value="indicators" className="space-y-4">
          <IndicatorCombosCard />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
