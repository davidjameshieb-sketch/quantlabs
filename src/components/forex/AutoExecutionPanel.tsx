// Auto-Execution Control Panel for OANDA Broker page
import { motion } from 'framer-motion';
import { Play, Square, RotateCcw, Zap, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AutoExecStatus, AutoExecLogEntry } from '@/hooks/useAutoExecution';

interface AutoExecutionPanelProps {
  status: AutoExecStatus;
  onToggle: () => void;
  onRunBatch: () => void;
  onReset: () => void;
  tradeCount: number;
  connected: boolean | null;
}

export const AutoExecutionPanel = ({
  status,
  onToggle,
  onRunBatch,
  onReset,
  tradeCount,
  connected,
}: AutoExecutionPanelProps) => {
  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className={cn('w-4 h-4', status.enabled ? 'text-neural-green' : 'text-muted-foreground')} />
          <h3 className="text-xs font-display font-bold">AUTO-EXECUTION BRIDGE</h3>
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-1.5 py-0',
              status.enabled
                ? 'border-neural-green/30 text-neural-green bg-neural-green/10'
                : 'border-border/50 text-muted-foreground'
            )}
          >
            {status.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={status.enabled}
            onCheckedChange={onToggle}
            disabled={!connected}
          />
        </div>
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox label="Mode" value="All Signals" ok />
        <StatBox label="Units" value="1,000" ok />
        <StatBox label="Threshold" value="None" ok />
        <StatBox label="Account" value="Practice" ok />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={status.processing ? 'destructive' : 'default'}
          className="h-8 text-xs gap-1.5"
          onClick={status.processing ? onToggle : onRunBatch}
          disabled={!connected || (!status.enabled && !status.processing)}
        >
          {status.processing ? (
            <>
              <Square className="w-3 h-3" />
              Stop Execution
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Execute {tradeCount} Trades
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs gap-1.5"
          onClick={onReset}
          disabled={status.processing}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </Button>

        {!connected && (
          <span className="text-[10px] text-neural-orange flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Connect OANDA first
          </span>
        )}
      </div>

      {/* Execution counters */}
      {(status.totalExecuted > 0 || status.totalFailed > 0 || status.processing) && (
        <div className="flex items-center gap-4 text-[10px]">
          {status.processing && (
            <span className="flex items-center gap-1 text-primary">
              <Clock className="w-3 h-3 animate-pulse" />
              {status.totalQueued} queued
            </span>
          )}
          <span className="flex items-center gap-1 text-neural-green">
            <CheckCircle className="w-3 h-3" />
            {status.totalExecuted} filled
          </span>
          {status.totalFailed > 0 && (
            <span className="flex items-center gap-1 text-neural-red">
              <XCircle className="w-3 h-3" />
              {status.totalFailed} failed
            </span>
          )}
        </div>
      )}

      {/* Execution log */}
      {status.log.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Recent Execution Log</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {status.log.slice(0, 10).map((entry, i) => (
              <LogRow key={`${entry.signalId}-${i}`} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function StatBox({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-muted/10 border border-border/30 space-y-0.5">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <p className={cn('text-xs font-display font-bold', ok ? 'text-foreground' : 'text-neural-orange')}>
        {value}
      </p>
    </div>
  );
}

function LogRow({ entry }: { entry: AutoExecLogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/10 border border-border/20 text-[10px]">
      <span className="text-muted-foreground">{time}</span>
      <span className="font-mono font-medium">{entry.pair}</span>
      <span className={cn('font-mono', entry.direction === 'long' ? 'text-neural-green' : 'text-neural-red')}>
        {entry.direction.toUpperCase()}
      </span>
      <Badge
        variant="outline"
        className={cn(
          'text-[8px] px-1 py-0',
          entry.status === 'filled'
            ? 'border-neural-green/30 text-neural-green'
            : entry.status === 'rejected'
            ? 'border-neural-red/30 text-neural-red'
            : 'border-border/50 text-muted-foreground'
        )}
      >
        {entry.status}
      </Badge>
    </div>
  );
}
