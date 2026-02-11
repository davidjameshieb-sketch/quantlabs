// Trade Quality Watchdog — 4 critical columns to monitor
// 1. Indicator consensus / MTF confirmation quality
// 2. Coalition tier distribution (DUO vs TRIO)
// 3. Governance state frequency (NORMAL/DEFENSIVE/THROTTLED)
// 4. Short vs Long expectancy split

import React, { useMemo } from 'react';
import { Eye, Layers, Shield, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { RealExecutionMetrics, RealOrder } from '@/hooks/useOandaPerformance';
import { cn } from '@/lib/utils';

interface TradeQualityWatchdogProps {
  realMetrics?: RealExecutionMetrics | null;
}

function getPipMultiplier(pair: string): number {
  const jpyPairs = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
  return jpyPairs.includes(pair) ? 100 : 10000;
}

function computePips(o: RealOrder): number {
  if (o.entry_price == null || o.exit_price == null) return 0;
  const mult = getPipMultiplier(o.currency_pair);
  return o.direction === 'long'
    ? (o.exit_price - o.entry_price) * mult
    : (o.entry_price - o.exit_price) * mult;
}

const WatchdogCard = ({ title, icon: Icon, children, alert }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  alert?: boolean;
}) => (
  <div className={cn(
    "p-3 rounded-xl bg-card/50 border space-y-2",
    alert ? "border-amber-500/50" : "border-border/50"
  )}>
    <div className="flex items-center gap-1.5">
      <Icon className={cn("w-3.5 h-3.5", alert ? "text-amber-400" : "text-primary")} />
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{title}</span>
      {alert && <AlertTriangle className="w-3 h-3 text-amber-400" />}
    </div>
    {children}
  </div>
);

const StatRow = ({ label, value, suffix, positive }: {
  label: string; value: string; suffix?: string; positive?: boolean;
}) => (
  <div className="flex items-center justify-between text-[11px]">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn(
      'font-mono font-medium',
      positive === true && 'text-neural-green',
      positive === false && 'text-neural-red',
      positive === undefined && 'text-foreground',
    )}>
      {value}{suffix && <span className="text-muted-foreground ml-0.5">{suffix}</span>}
    </span>
  </div>
);

export const TradeQualityWatchdog = ({ realMetrics }: TradeQualityWatchdogProps) => {
  const analysis = useMemo(() => {
    if (!realMetrics?.hasData) return null;

    const closed = realMetrics.recentOrders.filter(
      o => (o.status === 'filled' || o.status === 'closed') && o.entry_price != null && o.exit_price != null
    );
    const all = realMetrics.recentOrders;

    // 1. Indicator Consensus / MTF Confirmation
    const withConfidence = all.filter(o => o.confidence_score != null);
    const avgConfidence = withConfidence.length > 0
      ? withConfidence.reduce((s, o) => s + o.confidence_score!, 0) / withConfidence.length : 0;
    const barelyPassing = withConfidence.filter(o => o.confidence_score! < 55).length;
    const barelyPassingPct = withConfidence.length > 0 ? barelyPassing / withConfidence.length : 0;

    // 2. Governance State Frequency
    const gateResults = all.filter(o => o.gate_result != null);
    const normalCount = gateResults.filter(o => !o.gate_result || o.gate_result === 'PASS' || o.gate_result === 'approved').length;
    const throttledCount = gateResults.filter(o => o.gate_result?.includes('THROTTLE') || o.gate_result?.includes('HALT_RAMP')).length;
    const rejectedCount = gateResults.filter(o => o.gate_result?.includes('REJECT') || o.gate_result === 'rejected').length;
    const defensiveCount = gateResults.filter(o => o.gate_result?.includes('DEFENSIVE')).length;
    const totalGated = gateResults.length;

    // 3. Short vs Long Expectancy Split
    const longs = closed.filter(o => o.direction === 'long');
    const shorts = closed.filter(o => o.direction === 'short');
    const longPips = longs.map(computePips);
    const shortPips = shorts.map(computePips);
    const longExpectancy = longPips.length > 0 ? longPips.reduce((a, b) => a + b, 0) / longPips.length : 0;
    const shortExpectancy = shortPips.length > 0 ? shortPips.reduce((a, b) => a + b, 0) / shortPips.length : 0;
    const longWinRate = longs.length > 0 ? longPips.filter(p => p > 0).length / longs.length : 0;
    const shortWinRate = shorts.length > 0 ? shortPips.filter(p => p > 0).length / shorts.length : 0;
    const longNetPips = longPips.reduce((a, b) => a + b, 0);
    const shortNetPips = shortPips.reduce((a, b) => a + b, 0);

    // 4. Worst pairs/sessions detection
    const pairPnl = new Map<string, { pips: number; count: number; avgSlippage: number }>();
    for (const o of closed) {
      const p = o.currency_pair;
      const existing = pairPnl.get(p) || { pips: 0, count: 0, avgSlippage: 0 };
      existing.pips += computePips(o);
      existing.count++;
      if (o.slippage_pips != null) existing.avgSlippage += o.slippage_pips;
      pairPnl.set(p, existing);
    }
    const worstPairs = Array.from(pairPnl.entries())
      .map(([pair, d]) => ({ pair, pips: d.pips, count: d.count, avgSlippage: d.count > 0 ? d.avgSlippage / d.count : 0 }))
      .filter(p => p.pips < 0)
      .sort((a, b) => a.pips - b.pips)
      .slice(0, 3);

    return {
      avgConfidence, barelyPassingPct, barelyPassing, totalWithConfidence: withConfidence.length,
      normalCount, throttledCount, rejectedCount, defensiveCount, totalGated,
      longExpectancy, shortExpectancy, longWinRate, shortWinRate, longCount: longs.length, shortCount: shorts.length,
      longNetPips, shortNetPips,
      worstPairs,
    };
  }, [realMetrics]);

  if (!analysis) {
    return (
      <div className="p-4 rounded-xl bg-card/30 border border-border/30 text-center">
        <span className="text-xs text-muted-foreground">Watchdog active — waiting for real trade data</span>
      </div>
    );
  }

  const shortsAreDraining = analysis.shortCount >= 3 && analysis.shortExpectancy < -0.5;
  const barelyPassingAlert = analysis.barelyPassingPct > 0.3;
  const throttleHeavy = analysis.totalGated > 0 && (analysis.throttledCount + analysis.defensiveCount) / analysis.totalGated > 0.4;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">Trade Quality Watchdog</h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Indicator Consensus */}
        <WatchdogCard title="Indicator Consensus" icon={Layers} alert={barelyPassingAlert}>
          <StatRow label="Avg Confidence" value={analysis.avgConfidence.toFixed(0)} suffix="/100" positive={analysis.avgConfidence > 60} />
          <StatRow label="Barely Passing (<55)" value={`${analysis.barelyPassing}/${analysis.totalWithConfidence}`} positive={!barelyPassingAlert} />
          <StatRow label="% Marginal" value={`${(analysis.barelyPassingPct * 100).toFixed(0)}`} suffix="%" positive={analysis.barelyPassingPct < 0.2} />
          {barelyPassingAlert && (
            <p className="text-[9px] text-amber-400 mt-1">⚠ Too many entries barely passing threshold</p>
          )}
        </WatchdogCard>

        {/* 2. Governance State */}
        <WatchdogCard title="Governance State" icon={Shield} alert={throttleHeavy}>
          <StatRow label="Normal/Pass" value={analysis.normalCount.toString()} suffix={`/${analysis.totalGated}`} positive={true} />
          <StatRow label="Throttled" value={analysis.throttledCount.toString()} positive={analysis.throttledCount === 0} />
          <StatRow label="Defensive" value={analysis.defensiveCount.toString()} positive={analysis.defensiveCount === 0} />
          <StatRow label="Rejected" value={analysis.rejectedCount.toString()} />
          {throttleHeavy && (
            <p className="text-[9px] text-amber-400 mt-1">⚠ Heavy throttle/defensive frequency</p>
          )}
        </WatchdogCard>

        {/* 3. Short vs Long Split */}
        <WatchdogCard title="Short vs Long" icon={ArrowUpDown} alert={shortsAreDraining}>
          <StatRow label="Long Trades" value={analysis.longCount.toString()} />
          <StatRow label="Long WR" value={`${(analysis.longWinRate * 100).toFixed(0)}`} suffix="%" positive={analysis.longWinRate > 0.5} />
          <StatRow label="Long Net" value={`${analysis.longNetPips >= 0 ? '+' : ''}${analysis.longNetPips.toFixed(1)}`} suffix="pips" positive={analysis.longNetPips > 0} />
          <div className="border-t border-border/20 my-1" />
          <StatRow label="Short Trades" value={analysis.shortCount.toString()} />
          <StatRow label="Short WR" value={`${(analysis.shortWinRate * 100).toFixed(0)}`} suffix="%" positive={analysis.shortWinRate > 0.5} />
          <StatRow label="Short Net" value={`${analysis.shortNetPips >= 0 ? '+' : ''}${analysis.shortNetPips.toFixed(1)}`} suffix="pips" positive={analysis.shortNetPips > 0} />
          {shortsAreDraining && (
            <p className="text-[9px] text-amber-400 mt-1">⚠ Shorts are the drawdown engine</p>
          )}
        </WatchdogCard>

        {/* 4. Worst Pairs / Execution Quality */}
        <WatchdogCard title="Execution Quality" icon={Eye} alert={analysis.worstPairs.length > 0}>
          {analysis.worstPairs.length === 0 ? (
            <p className="text-[10px] text-neural-green">All pairs profitable ✓</p>
          ) : (
            <>
              <p className="text-[9px] text-muted-foreground mb-1">Worst pairs (avoid these):</p>
              {analysis.worstPairs.map(p => (
                <StatRow
                  key={p.pair}
                  label={p.pair.replace('_', '/')}
                  value={`${p.pips.toFixed(1)}`}
                  suffix={`pips (${p.count}t)`}
                  positive={false}
                />
              ))}
              {analysis.worstPairs[0] && (
                <p className="text-[9px] text-amber-400 mt-1">
                  ⚠ {analysis.worstPairs[0].pair.replace('_', '/')} losing {Math.abs(analysis.worstPairs[0].pips).toFixed(1)} pips
                </p>
              )}
            </>
          )}
        </WatchdogCard>
      </div>
    </div>
  );
};
