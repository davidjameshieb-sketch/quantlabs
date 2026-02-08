// ─── Execution Health & Safety Dashboard Panel ───
// Displays slippage tracking, friction scores, auto-protection status,
// execution quality grades, per-pair health, and kill-switch state.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, AlertTriangle, Activity, TrendingDown, Gauge, Radio,
  CheckCircle, XCircle, Zap, Lock, BarChart3
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  createSimulatedExecutionHealth,
  computeExecutionHealth,
  type ExecutionHealthMetrics,
  type PairExecutionHealth,
} from '@/lib/forex/executionSafetyEngine';

interface ExecutionHealthPanelProps {
  orders?: Array<{
    slippage_pips?: number | null;
    fill_latency_ms?: number | null;
    friction_score?: number | null;
    execution_quality_score?: number | null;
    spread_at_entry?: number | null;
    currency_pair?: string;
    status?: string;
    entry_price?: number | null;
  }>;
}

export const ExecutionHealthPanel = ({ orders }: ExecutionHealthPanelProps) => {
  const health = useMemo<ExecutionHealthMetrics>(() => {
    if (orders && orders.length > 0) {
      return computeExecutionHealth(orders);
    }
    return createSimulatedExecutionHealth();
  }, [orders]);

  const protectionColor =
    health.protectionLevel === 'critical' ? 'text-neural-red' :
    health.protectionLevel === 'elevated' ? 'text-neural-orange' :
    'text-neural-green';

  const protectionBg =
    health.protectionLevel === 'critical' ? 'bg-neural-red/10 border-neural-red/30' :
    health.protectionLevel === 'elevated' ? 'bg-neural-orange/10 border-neural-orange/30' :
    'bg-neural-green/10 border-neural-green/30';

  const pairList = Object.values(health.pairHealthMap)
    .sort((a, b) => b.qualityScore - a.qualityScore);

  return (
    <div className="space-y-4">
      {/* Kill Switch Banner */}
      {health.killSwitchActive && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-neural-red/20 border border-neural-red/40 flex items-center gap-3"
        >
          <Lock className="w-5 h-5 text-neural-red animate-pulse" />
          <div>
            <p className="text-xs font-bold text-neural-red">KILL SWITCH ACTIVE</p>
            <p className="text-[10px] text-neural-red/80">
              Live order routing suspended. Execution degradation exceeded tolerance. Manual reactivation required.
            </p>
          </div>
        </motion.div>
      )}

      {/* Protection Status Bar */}
      <div className={cn('p-3 rounded-lg border flex items-center justify-between', protectionBg)}>
        <div className="flex items-center gap-2">
          <Shield className={cn('w-4 h-4', protectionColor)} />
          <span className="text-xs font-display font-bold">Execution Protection</span>
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', protectionColor)}>
            {health.protectionLevel.toUpperCase()}
          </Badge>
        </div>
        <span className={cn('text-[10px]', protectionColor)}>
          {health.activeProtections.length > 0
            ? `${health.activeProtections.length} active safeguard${health.activeProtections.length > 1 ? 's' : ''}`
            : 'All systems nominal'}
        </span>
      </div>

      {/* Core Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard
          icon={TrendingDown}
          label="Avg Slippage"
          value={`${health.avgSlippage.toFixed(2)} pips`}
          ok={health.avgSlippage < 0.3}
          alert={health.slippageDriftAlert ? 'Drift ↑' : undefined}
        />
        <MetricCard
          icon={Gauge}
          label="Execution Quality"
          value={`${health.avgExecutionQuality.toFixed(0)}%`}
          ok={health.avgExecutionQuality >= 70}
        />
        <MetricCard
          icon={Activity}
          label="Avg Fill Latency"
          value={`${health.avgFillLatency.toFixed(0)}ms`}
          ok={health.avgFillLatency < 200}
        />
        <MetricCard
          icon={Radio}
          label="Net Expectancy"
          value={health.netExpectancyAfterFriction >= 0
            ? `+${health.netExpectancyAfterFriction.toFixed(2)}`
            : health.netExpectancyAfterFriction.toFixed(2)
          }
          ok={health.netExpectancyAfterFriction > 0}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric
          label="Friction Score"
          value={`${health.avgFrictionScore.toFixed(0)}/100`}
          ok={health.avgFrictionScore >= 65}
        />
        <MiniMetric
          label="Rejection Rate"
          value={`${(health.orderRejectionRate * 100).toFixed(1)}%`}
          ok={health.orderRejectionRate < 0.15}
        />
        <MiniMetric
          label="Max Slippage"
          value={`${health.maxSlippage.toFixed(2)} pips`}
          ok={health.maxSlippage < 0.5}
        />
      </div>

      {/* Active Protections */}
      {health.activeProtections.length > 0 && (
        <div className="p-3 rounded-lg bg-card/50 border border-border/50 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-neural-orange" />
            <span className="text-[10px] font-bold">Active Safeguards</span>
          </div>
          <div className="space-y-1">
            {health.activeProtections.map((action, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-neural-orange/80">
                <Zap className="w-2.5 h-2.5" />
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slippage Sparkline */}
      {health.rollingSlippage.length > 3 && (
        <div className="p-3 rounded-lg bg-card/50 border border-border/50 space-y-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold">Rolling Slippage (Last 20 Fills)</span>
            {health.slippageDriftAlert && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 border-neural-orange/30 text-neural-orange">
                DRIFT ↑
              </Badge>
            )}
          </div>
          <div className="flex items-end gap-[2px] h-10">
            {health.rollingSlippage.map((s, i) => {
              const maxS = Math.max(...health.rollingSlippage, 0.5);
              const h = Math.max(2, (s / maxS) * 100);
              const color = s > 0.3 ? 'bg-neural-red/60' : s > 0.15 ? 'bg-neural-orange/60' : 'bg-neural-green/60';
              return (
                <div
                  key={i}
                  className={cn('flex-1 rounded-t', color)}
                  style={{ height: `${h}%` }}
                  title={`${s.toFixed(3)} pips`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground">
            <span>Oldest</span>
            <span>Most Recent</span>
          </div>
        </div>
      )}

      {/* Per-Pair Execution Health */}
      {pairList.length > 0 && (
        <div className="p-3 rounded-lg bg-card/50 border border-border/50 space-y-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold">Pair Execution Health</span>
          </div>
          <div className="space-y-1">
            {pairList.map(p => (
              <PairRow key={p.pair} pair={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ───

function MetricCard({
  icon: Icon,
  label,
  value,
  ok,
  alert,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  ok: boolean;
  alert?: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-card/50 border border-border/50 space-y-1">
      <div className="flex items-center gap-1">
        <Icon className={cn('w-3 h-3', ok ? 'text-neural-green' : 'text-neural-orange')} />
        <span className="text-[9px] text-muted-foreground">{label}</span>
        {alert && (
          <Badge variant="outline" className="text-[7px] px-1 py-0 border-neural-red/30 text-neural-red ml-auto">
            {alert}
          </Badge>
        )}
      </div>
      <p className={cn('text-sm font-display font-bold', ok ? 'text-foreground' : 'text-neural-orange')}>
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-muted/10 border border-border/30 space-y-0.5">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <p className={cn('text-xs font-display font-bold', ok ? 'text-foreground' : 'text-neural-orange')}>
        {value}
      </p>
    </div>
  );
}

function PairRow({ pair }: { pair: PairExecutionHealth }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded bg-muted/10 border border-border/20 text-[10px]">
      <div className="flex items-center gap-1.5">
        {pair.withinBudget ? (
          <CheckCircle className="w-3 h-3 text-neural-green" />
        ) : (
          <XCircle className="w-3 h-3 text-neural-red" />
        )}
        <span className="font-mono font-medium">{pair.pair.replace('_', '/')}</span>
      </div>
      <span className="text-muted-foreground">{pair.tradeCount} trades</span>
      <span className={cn('font-mono', pair.avgSlippage < 0.2 ? 'text-neural-green' : 'text-neural-orange')}>
        {pair.avgSlippage.toFixed(2)}p slip
      </span>
      <span className={cn('font-mono', pair.qualityScore >= 75 ? 'text-neural-green' : 'text-neural-orange')}>
        Q{pair.qualityScore}
      </span>
    </div>
  );
}
