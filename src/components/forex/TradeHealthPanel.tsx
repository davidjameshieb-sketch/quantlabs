// ─── Trade Health Governance Panel ───
// Real-time visualization of post-entry trade health scores for open positions.
// Includes THS Expectancy Intelligence Layer.

import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  HeartPulse, ShieldCheck, ShieldAlert, AlertTriangle, Skull,
  TrendingUp, TrendingDown, Activity, Gauge, BarChart3, Brain, Target
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { RealOrder, RealExecutionMetrics } from '@/hooks/useOandaPerformance';
import { supabase } from '@/integrations/supabase/client';
import { computeTradeHealth, type TradeHealthResult, type HealthBand } from '@/lib/forex/tradeHealthEngine';
import {
  computeLiveExpectancy, setTradeBuffer, orderToClosedTradeRecord,
  getGlobalBandSummary, type LiveExpectancy, type BandStats, type ExpectancyBand,
} from '@/lib/forex/thsExpectancyEngine';

// ─── Helpers ─────────────────────────────────────────────

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

const BAND_CONFIG: Record<HealthBand, { icon: typeof HeartPulse; color: string; bg: string; border: string; label: string }> = {
  healthy: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'HEALTHY' },
  caution: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'CAUTION' },
  sick: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'SICK' },
  critical: { icon: Skull, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'CRITICAL' },
};

const EXPECTANCY_BAND_COLORS: Record<ExpectancyBand, { text: string; bg: string; border: string }> = {
  Elite:   { text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30' },
  Strong:  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  Viable:  { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  Weak:    { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  Fragile: { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
};

// ─── Component Score Bar ─────────────────────────────────

function ComponentBar({ label, value, maxLabel }: { label: string; value: number; maxLabel?: string }) {
  const color = value >= 70 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : value >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value}{maxLabel || '/100'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Expectancy Badge ────────────────────────────────────

function ExpectancyBadge({ expectancy }: { expectancy: LiveExpectancy }) {
  const colors = EXPECTANCY_BAND_COLORS[expectancy.band];
  const hasSample = expectancy.sampleSize >= 5;

  return (
    <div className={cn("p-2.5 rounded-md border space-y-2", colors.border, colors.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className={cn("w-3.5 h-3.5", colors.text)} />
          <span className={cn("text-[10px] font-bold uppercase tracking-wider", colors.text)}>
            {expectancy.band} Expectancy
          </span>
        </div>
        {hasSample && (
          <span className="text-[9px] text-muted-foreground font-mono">
            n={expectancy.sampleSize}
          </span>
        )}
      </div>

      {hasSample ? (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[8px] text-muted-foreground uppercase">Exp R</p>
            <p className={cn("text-xs font-mono font-bold",
              expectancy.expectedR > 0 ? 'text-emerald-400' : expectancy.expectedR < 0 ? 'text-red-400' : 'text-foreground'
            )}>
              {expectancy.expectedR >= 0 ? '+' : ''}{expectancy.expectedR.toFixed(2)}R
            </p>
          </div>
          <div>
            <p className="text-[8px] text-muted-foreground uppercase">Win Rate</p>
            <p className="text-xs font-mono font-bold text-foreground">
              {expectancy.historicalWinRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[8px] text-muted-foreground uppercase">Hold Prob</p>
            <p className={cn("text-xs font-mono font-bold",
              expectancy.probabilityHoldSuccess >= 0.6 ? 'text-emerald-400' :
              expectancy.probabilityHoldSuccess >= 0.4 ? 'text-amber-400' : 'text-red-400'
            )}>
              {(expectancy.probabilityHoldSuccess * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-[8px] text-muted-foreground uppercase">Risk Mult</p>
            <p className={cn("text-xs font-mono font-bold",
              expectancy.adaptiveRiskMultiplier > 1.1 ? 'text-emerald-400' :
              expectancy.adaptiveRiskMultiplier < 0.9 ? 'text-red-400' : 'text-foreground'
            )}>
              {expectancy.adaptiveRiskMultiplier.toFixed(2)}x
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">
          Insufficient data — need ≥5 closed trades in this band
        </p>
      )}
    </div>
  );
}

// ─── Trade Health Card ───────────────────────────────────

interface TradeHealthCardProps {
  order: RealOrder;
  health: TradeHealthResult;
  livePrice: number | null;
  expectancy: LiveExpectancy;
  index: number;
}

function TradeHealthCard({ order, health, livePrice, expectancy, index }: TradeHealthCardProps) {
  const pair = order.currency_pair.replace('_', '/');
  const band = BAND_CONFIG[health.healthBand];
  const Icon = band.icon;
  const ageMin = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000);

  const unrealizedPips = useMemo(() => {
    if (order.entry_price == null || livePrice == null) return null;
    const mult = getPipMultiplier(order.currency_pair);
    return Math.round((order.direction === 'long'
      ? (livePrice - order.entry_price) * mult
      : (order.entry_price - livePrice) * mult) * 10) / 10;
  }, [order, livePrice]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn("border rounded-lg p-3 space-y-3", band.border, band.bg)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", band.color)} />
          <span className="font-mono font-bold text-sm text-foreground">{pair}</span>
          <Badge variant="outline" className={cn(
            "text-[9px] px-1.5",
            order.direction === 'long' ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"
          )}>
            {order.direction.toUpperCase()}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{ageMin}m open</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Health Score Gauge */}
          <div className="flex items-center gap-1.5">
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  className={band.color.replace('text-', 'stroke-')}
                  strokeWidth="3"
                  strokeDasharray={`${health.tradeHealthScore * 0.88} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold", band.color)}>
                {health.tradeHealthScore}
              </span>
            </div>
          </div>
          <Badge className={cn("text-[9px] px-1.5", band.bg, band.color, "border", band.border)}>
            {band.label}
          </Badge>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-5 gap-2 text-center">
        <div>
          <p className="text-[8px] text-muted-foreground uppercase">R (Risk)</p>
          <p className="text-xs font-mono font-bold text-foreground">{health.rPips}p</p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground uppercase">MFE (R)</p>
          <p className={cn("text-xs font-mono font-bold", health.mfeR > 0.5 ? 'text-emerald-400' : 'text-foreground')}>
            {health.mfeR.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground uppercase">UE (R)</p>
          <p className={cn("text-xs font-mono font-bold", health.ueR >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {health.ueR >= 0 ? '+' : ''}{health.ueR.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground uppercase">P&L</p>
          <p className={cn("text-xs font-mono font-bold",
            unrealizedPips != null && unrealizedPips > 0 ? 'text-emerald-400' :
            unrealizedPips != null && unrealizedPips < 0 ? 'text-red-400' : 'text-foreground'
          )}>
            {unrealizedPips != null ? `${unrealizedPips >= 0 ? '+' : ''}${unrealizedPips.toFixed(1)}p` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground uppercase">Window</p>
          <p className="text-xs font-mono font-bold text-foreground">
            {health.progressFail ? '❌' : '✓'} {Math.min((order as any).bars_since_entry ?? health.components.P > 0 ? health.validationWindow : 0, health.validationWindow)}/{health.validationWindow}
          </p>
        </div>
      </div>

      {/* THS Components */}
      <div className="grid grid-cols-1 gap-1.5">
        <ComponentBar label="Progress (P) 28%" value={health.components.P} />
        <ComponentBar label="Time-to-MFE (T) 10%" value={health.components.T_mfe ?? 50} />
        <ComponentBar label="Persistence (D_pers) 16%" value={health.components.D_pers} />
        <ComponentBar label="Acceleration (D_acc) 12%" value={health.components.D_acc} />
        <ComponentBar label="Regime Stability (S) 22%" value={health.components.S_regime} />
        <ComponentBar label="Drift Penalty (A) 12%" value={health.components.A_drift} />
      </div>

      {/* Expectancy Intelligence */}
      <ExpectancyBadge expectancy={expectancy} />

      {/* Governance Action */}
      <div className={cn("flex items-center gap-2 p-2 rounded-md border text-[10px]", band.border, 'bg-background/30')}>
        <Gauge className={cn("w-3.5 h-3.5 shrink-0", band.color)} />
        <span className="text-muted-foreground">
          <strong className={band.color}>{health.governanceAction.type.toUpperCase()}</strong>
          {' — '}{health.governanceAction.reason}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Band Summary Table ──────────────────────────────────

function BandSummaryTable({ bands }: { bands: BandStats[] }) {
  const activeBands = bands.filter(b => b.tradeCount > 0);
  if (activeBands.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
        <Target className="w-3 h-3" /> Expectancy Bands (Rolling {activeBands.reduce((s, b) => s + b.tradeCount, 0)} trades)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border/20">
              <th className="text-left py-1 pr-2">Band</th>
              <th className="text-right py-1 px-1">n</th>
              <th className="text-right py-1 px-1">Win%</th>
              <th className="text-right py-1 px-1">Avg R</th>
              <th className="text-right py-1 px-1">Med R</th>
              <th className="text-right py-1 px-1">MFE</th>
              <th className="text-right py-1 px-1">MAE</th>
              <th className="text-right py-1 pl-1">PF</th>
            </tr>
          </thead>
          <tbody>
            {activeBands.map(b => {
              const colors = EXPECTANCY_BAND_COLORS[b.band];
              return (
                <tr key={b.band} className="border-b border-border/10">
                  <td className={cn("py-1 pr-2 font-bold", colors.text)}>{b.band}</td>
                  <td className="text-right py-1 px-1 font-mono text-foreground">{b.tradeCount}</td>
                  <td className={cn("text-right py-1 px-1 font-mono",
                    b.winRate >= 55 ? 'text-emerald-400' : b.winRate >= 40 ? 'text-amber-400' : 'text-red-400'
                  )}>{b.winRate.toFixed(1)}%</td>
                  <td className={cn("text-right py-1 px-1 font-mono",
                    b.avgR > 0 ? 'text-emerald-400' : 'text-red-400'
                  )}>{b.avgR >= 0 ? '+' : ''}{b.avgR.toFixed(2)}</td>
                  <td className="text-right py-1 px-1 font-mono text-foreground">{b.medianR.toFixed(2)}</td>
                  <td className="text-right py-1 px-1 font-mono text-foreground">{b.avgMfeR.toFixed(2)}</td>
                  <td className="text-right py-1 px-1 font-mono text-foreground">{b.avgMaeR.toFixed(2)}</td>
                  <td className={cn("text-right py-1 pl-1 font-mono font-bold",
                    b.profitFactor >= 1.5 ? 'text-emerald-400' : b.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400'
                  )}>{b.profitFactor.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────

interface TradeHealthPanelProps {
  metrics: RealExecutionMetrics | null;
}

export function TradeHealthPanel({ metrics }: TradeHealthPanelProps) {
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [expectancyLoaded, setExpectancyLoaded] = useState(false);

  const openPositions = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    return metrics.recentOrders
      .filter(o => o.status === 'filled' && o.entry_price != null && o.exit_price == null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [metrics]);

  // Load closed trades into expectancy engine
  useEffect(() => {
    if (!metrics?.recentOrders) return;
    const closedOrders = metrics.recentOrders
      .filter(o => (o.status === 'closed' || o.status === 'filled') && o.entry_price != null && o.exit_price != null);

    const records = closedOrders
      .map(o => orderToClosedTradeRecord(o as any))
      .filter(Boolean) as any[];

    if (records.length > 0) {
      setTradeBuffer(records);
      setExpectancyLoaded(true);
    }
  }, [metrics?.recentOrders]);

  // Fetch live prices
  useEffect(() => {
    if (openPositions.length === 0) return;
    let mounted = true;
    const instruments = [...new Set(openPositions.map(o => o.currency_pair))];

    const fetch_ = async () => {
      try {
        const { data } = await supabase.functions.invoke('oanda-pricing', {
          body: { instruments },
        });
        if (!mounted || !data?.prices) return;
        const prices: Record<string, number> = {};
        for (const [key, val] of Object.entries(data.prices)) {
          const v = val as { mid?: number };
          if (v?.mid) prices[key.replace('/', '_')] = v.mid;
        }
        setLivePrices(prices);
      } catch { /* silent */ }
    };
    fetch_();
    const iv = setInterval(fetch_, 15000);
    return () => { mounted = false; clearInterval(iv); };
  }, [openPositions.length]);

  // Compute health + expectancy for each open position
  const healthResults = useMemo(() => {
    return openPositions.map(order => {
      const livePrice = livePrices[order.currency_pair] ?? null;
      const entryPrice = order.entry_price!;
      const pipMult = getPipMultiplier(order.currency_pair);

      const gov = order.governance_payload as Record<string, unknown> | null;
      let initialSlPrice: number;
      if (gov?.dynamicSlPrice && typeof gov.dynamicSlPrice === 'number') {
        initialSlPrice = gov.dynamicSlPrice;
      } else {
        initialSlPrice = order.direction === 'long'
          ? entryPrice - 8 / pipMult
          : entryPrice + 8 / pipMult;
      }

      const mfePriceEstimate = livePrice != null
        ? (order.direction === 'long'
          ? Math.max(livePrice, entryPrice)
          : Math.min(livePrice, entryPrice))
        : entryPrice;

      const barsSinceEntry = Math.max(1, Math.round(
        (Date.now() - new Date(order.created_at).getTime()) / 60000
      ));

      const regimeConfirmed = gov?.regimeConfirmed === true || (!gov?.regimeEarlyWarning && !gov?.regimeDiverging);
      const regimeEarlyWarning = gov?.regimeEarlyWarning === true;
      const regimeDiverging = gov?.regimeDiverging === true;

      const health = computeTradeHealth({
        currentPrice: livePrice ?? entryPrice,
        entryPrice,
        initialSlPrice,
        direction: order.direction as 'long' | 'short',
        pair: order.currency_pair,
        barsSinceEntry,
        mfePrice: mfePriceEstimate,
        regimeConfirmed,
        regimeEarlyWarning,
        regimeDiverging,
        persistenceNow: (gov?.persistenceNow as number) ?? 50,
        persistenceAtEntry: (gov?.persistenceAtEntry as number) ?? 50,
        volAccNow: (gov?.volAccNow as number) ?? 50,
        volAccAtEntry: (gov?.volAccAtEntry as number) ?? 50,
        volatilityScore: (gov?.volatilityScore as number) ?? 50,
      });

      // Compute live expectancy
      const persistenceDelta = ((gov?.persistenceNow as number) ?? 50) - ((gov?.persistenceAtEntry as number) ?? 50);
      const regimeStability = regimeConfirmed ? 85 : regimeEarlyWarning ? 40 : regimeDiverging ? 15 : 50;
      const accelDelta = ((gov?.volAccNow as number) ?? 50) - ((gov?.volAccAtEntry as number) ?? 50);

      // THS slope: approximate from current vs entry_ths
      const entryThs = (order as any).entry_ths ?? health.tradeHealthScore;
      const thsSlope = barsSinceEntry > 1 ? (health.tradeHealthScore - entryThs) / barsSinceEntry : 0;

      const expectancy = computeLiveExpectancy(
        health.tradeHealthScore,
        thsSlope,
        persistenceDelta,
        regimeStability,
        accelDelta,
        order.currency_pair,
        (order.regime_label as string) ?? 'unknown',
        (order.session_label as string) ?? 'unknown',
      );

      return { order, health, livePrice, expectancy };
    });
  }, [openPositions, livePrices, expectancyLoaded]);

  // Summary stats
  const summary = useMemo(() => {
    if (healthResults.length === 0) return null;
    const avg = Math.round(healthResults.reduce((s, h) => s + h.health.tradeHealthScore, 0) / healthResults.length);
    const bands = { healthy: 0, caution: 0, sick: 0, critical: 0 };
    healthResults.forEach(h => bands[h.health.healthBand]++);
    const progressFails = healthResults.filter(h => h.health.progressFail).length;
    return { avg, bands, progressFails, total: healthResults.length };
  }, [healthResults]);

  const globalBands = useMemo(() => getGlobalBandSummary(), [expectancyLoaded]);

  if (openPositions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center p-12 text-center border border-border/30 rounded-lg bg-card/30">
          <HeartPulse className="w-8 h-8 text-muted-foreground mb-3" />
          <h3 className="font-display text-lg font-bold text-foreground">No Open Positions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Trade health governance activates when positions are open. Health scores, progress validation,
            and adaptive trailing will appear here in real-time.
          </p>
        </div>
        {/* Show expectancy bands even with no open trades */}
        {globalBands.length > 0 && <BandSummaryTable bands={globalBands} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Fleet Health Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="p-2.5 rounded-lg border border-border/30 bg-card/50 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Open</p>
            <p className="text-sm font-mono font-bold text-foreground">{summary.total}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-border/30 bg-card/50 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Avg THS</p>
            <p className={cn("text-sm font-mono font-bold",
              summary.avg >= 70 ? 'text-emerald-400' : summary.avg >= 45 ? 'text-amber-400' :
              summary.avg >= 30 ? 'text-orange-400' : 'text-red-400'
            )}>{summary.avg}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Healthy</p>
            <p className="text-sm font-mono font-bold text-emerald-400">{summary.bands.healthy}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Caution</p>
            <p className="text-sm font-mono font-bold text-amber-400">{summary.bands.caution}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-orange-500/20 bg-orange-500/5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Sick</p>
            <p className="text-sm font-mono font-bold text-orange-400">{summary.bands.sick}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Critical</p>
            <p className="text-sm font-mono font-bold text-red-400">{summary.bands.critical}</p>
          </div>
        </div>
      )}

      {/* Progress Fail Alert */}
      {summary && summary.progressFails > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-500/30 bg-red-500/5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400">
            <strong>{summary.progressFails}</strong> position{summary.progressFails > 1 ? 's' : ''} failed progress validation
            — MFE &lt; 0.25R after validation window
          </span>
        </div>
      )}

      {/* Individual Trade Health Cards */}
      <div className="space-y-3">
        {healthResults.map((r, i) => (
          <TradeHealthCard
            key={r.order.id}
            order={r.order}
            health={r.health}
            livePrice={r.livePrice}
            expectancy={r.expectancy}
            index={i}
          />
        ))}
      </div>

      {/* Expectancy Band Summary Table */}
      {globalBands.length > 0 && <BandSummaryTable bands={globalBands} />}

      {/* Legend */}
      <div className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-1.5">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> Component Weights
        </p>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span><strong>P</strong> Progress 28%</span>
          <span><strong>T</strong> Time-to-MFE 10%</span>
          <span><strong>D_pers</strong> Persistence 16%</span>
          <span><strong>D_acc</strong> Acceleration 12%</span>
          <span><strong>S</strong> Regime 22%</span>
          <span><strong>A</strong> Drift 12%</span>
        </div>
      </div>
    </div>
  );
}
