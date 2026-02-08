// Live Execution Hero Panel
// At-a-glance summary: real OANDA balance, P&L, open positions, execution health

import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, TrendingDown, Activity, Gauge, Shield,
  Crosshair, Clock, Wifi, WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { OandaAccountSummary } from '@/hooks/useOandaExecution';
import { RealExecutionMetrics } from '@/hooks/useOandaPerformance';

interface LiveExecutionHeroProps {
  account: OandaAccountSummary | null;
  connected: boolean | null;
  openTradeCount: number;
  executionMetrics: RealExecutionMetrics | null;
}

export const LiveExecutionHero = ({
  account,
  connected,
  openTradeCount,
  executionMetrics,
}: LiveExecutionHeroProps) => {
  const balance = account ? parseFloat(account.balance) : 0;
  const unrealizedPL = account ? parseFloat(account.unrealizedPL) : 0;
  const realizedPL = account ? parseFloat(account.pl) : 0;
  const currency = account?.currency || 'USD';

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);

  const hasRealData = executionMetrics?.hasData ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-gradient-to-br from-card/80 to-card/40 border border-border/50 space-y-3"
    >
      {/* Top row: connection + balance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">LIVE EXECUTION SUMMARY</h3>
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-1.5 py-0',
              connected
                ? 'border-neural-green/30 text-neural-green bg-neural-green/10'
                : connected === false
                ? 'border-neural-red/30 text-neural-red bg-neural-red/10'
                : 'border-border/50 text-muted-foreground'
            )}
          >
            {connected ? (
              <><Wifi className="w-2.5 h-2.5 mr-0.5 inline" /> LIVE</>
            ) : connected === false ? (
              <><WifiOff className="w-2.5 h-2.5 mr-0.5 inline" /> OFFLINE</>
            ) : 'Checking…'}
          </Badge>
        </div>
        {hasRealData && (
          <span className="text-[9px] text-muted-foreground">
            {executionMetrics!.totalFilled} fills tracked
          </span>
        )}
      </div>

      {/* Hero metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {/* Balance */}
        <HeroMetric
          icon={Wallet}
          label="Balance"
          value={account ? fmt(balance) : '—'}
          color="text-foreground"
        />

        {/* Unrealized P&L */}
        <HeroMetric
          icon={unrealizedPL >= 0 ? TrendingUp : TrendingDown}
          label="Unrealized P&L"
          value={account ? `${unrealizedPL >= 0 ? '+' : ''}${fmt(unrealizedPL)}` : '—'}
          color={unrealizedPL >= 0 ? 'text-neural-green' : 'text-neural-red'}
        />

        {/* Realized P&L */}
        <HeroMetric
          icon={realizedPL >= 0 ? TrendingUp : TrendingDown}
          label="Realized P&L"
          value={account ? `${realizedPL >= 0 ? '+' : ''}${fmt(realizedPL)}` : '—'}
          color={realizedPL >= 0 ? 'text-neural-green' : 'text-neural-red'}
        />

        {/* Open Positions */}
        <HeroMetric
          icon={Activity}
          label="Open Positions"
          value={account ? openTradeCount.toString() : '—'}
          color="text-foreground"
        />

        {/* Execution Quality */}
        <HeroMetric
          icon={Gauge}
          label="Exec Quality"
          value={hasRealData ? `${executionMetrics!.avgExecutionQuality.toFixed(0)}%` : '—'}
          color={hasRealData && executionMetrics!.avgExecutionQuality >= 70 ? 'text-neural-green' : 'text-neural-orange'}
        />

        {/* Win Rate (from real fills) */}
        <HeroMetric
          icon={Crosshair}
          label="Real Win Rate"
          value={hasRealData && (executionMetrics!.winCount + executionMetrics!.lossCount) > 0
            ? `${(executionMetrics!.winRate * 100).toFixed(0)}%`
            : '—'
          }
          color={hasRealData && executionMetrics!.winRate >= 0.5 ? 'text-neural-green' : 'text-neural-orange'}
          subtitle={hasRealData ? `${executionMetrics!.winCount}W / ${executionMetrics!.lossCount}L` : undefined}
        />
      </div>

      {/* Bottom strip: latency + slippage + friction */}
      {hasRealData && (
        <div className="flex items-center gap-4 text-[9px] text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            Avg Latency: <span className="font-mono text-foreground">{executionMetrics!.avgFillLatency.toFixed(0)}ms</span>
          </span>
          <span className="flex items-center gap-1">
            <TrendingDown className="w-2.5 h-2.5" />
            Avg Slip: <span className="font-mono text-foreground">{executionMetrics!.avgSlippage.toFixed(2)}p</span>
          </span>
          <span className="flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" />
            Friction: <span className="font-mono text-foreground">{executionMetrics!.avgFrictionScore.toFixed(0)}/100</span>
          </span>
        </div>
      )}

      {!connected && connected !== null && (
        <p className="text-[9px] text-neural-orange text-center">
          OANDA disconnected — connect on the Broker page to see live data.
        </p>
      )}
    </motion.div>
  );
};

function HeroMetric({
  icon: Icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/10 border border-border/30 space-y-0.5">
      <div className="flex items-center gap-1">
        <Icon className="w-3 h-3 text-primary" />
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-sm font-display font-bold', color)}>{value}</p>
      {subtitle && (
        <p className="text-[8px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
