// OANDA Broker Connection Status & Account Overview Panel

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, DollarSign, TrendingUp, Shield, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOandaExecution, OandaOpenTrade } from '@/hooks/useOandaExecution';

export const OandaConnectionPanel = () => {
  const {
    loading,
    connected,
    account,
    openTrades,
    fetchAccountSummary,
  } = useOandaExecution();

  useEffect(() => {
    fetchAccountSummary('practice');
  }, [fetchAccountSummary]);

  const formatCurrency = (val: string | undefined, currency = 'USD') => {
    if (!val) return '—';
    const num = parseFloat(val);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="w-4 h-4 text-neural-green" />
          ) : connected === false ? (
            <WifiOff className="w-4 h-4 text-neural-red" />
          ) : (
            <Activity className="w-4 h-4 text-muted-foreground animate-pulse" />
          )}
          <h3 className="text-xs font-display font-bold">OANDA Practice Account</h3>
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
            {connected ? 'Connected' : connected === false ? 'Disconnected' : 'Checking…'}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => fetchAccountSummary('practice')}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Account Summary */}
      {account && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <AccountStat
            icon={DollarSign}
            label="Balance"
            value={formatCurrency(account.balance, account.currency)}
            ok
          />
          <AccountStat
            icon={TrendingUp}
            label="Unrealized P&L"
            value={formatCurrency(account.unrealizedPL, account.currency)}
            ok={parseFloat(account.unrealizedPL) >= 0}
          />
          <AccountStat
            icon={Shield}
            label="Margin Available"
            value={formatCurrency(account.marginAvailable, account.currency)}
            ok
          />
          <AccountStat
            icon={Activity}
            label="Open Trades"
            value={String(account.openTradeCount)}
            ok={account.openTradeCount < 20}
          />
        </div>
      )}

      {/* Open Trades */}
      {openTrades.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Live Open Positions</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {openTrades.slice(0, 8).map((t: OandaOpenTrade) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-2 py-1 rounded bg-muted/10 border border-border/20 text-[10px]"
              >
                <span className="font-mono font-medium">{t.instrument.replace('_', '/')}</span>
                <span className={cn(
                  'font-mono',
                  parseInt(t.currentUnits) > 0 ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {parseInt(t.currentUnits) > 0 ? 'LONG' : 'SHORT'} {Math.abs(parseInt(t.currentUnits))}
                </span>
                <span className={cn(
                  'font-mono',
                  parseFloat(t.unrealizedPL) >= 0 ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {parseFloat(t.unrealizedPL) >= 0 ? '+' : ''}{parseFloat(t.unrealizedPL).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!connected && connected !== null && (
        <p className="text-[10px] text-neural-orange">
          Check your OANDA API credentials. Ensure your practice account token and account ID are correctly configured.
        </p>
      )}
    </div>
  );
};

function AccountStat({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/10 border border-border/30 space-y-1">
      <div className="flex items-center gap-1">
        <Icon className={cn('w-3 h-3', ok ? 'text-neural-green' : 'text-neural-orange')} />
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-sm font-display font-bold', ok ? 'text-foreground' : 'text-neural-orange')}>
        {value}
      </p>
    </div>
  );
}
