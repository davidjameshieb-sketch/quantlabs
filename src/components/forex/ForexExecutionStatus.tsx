// Forex Execution Compatibility Panel
// Shows OANDA execution readiness status

import { CheckCircle2, Radio, Shield, Activity, Wifi } from 'lucide-react';
import { ForexTradeEntry } from '@/lib/forex/forexTypes';
import { cn } from '@/lib/utils';

interface ForexExecutionStatusProps {
  trades: ForexTradeEntry[];
}

export const ForexExecutionStatus = ({ trades }: ForexExecutionStatusProps) => {
  const oandaCompatible = trades.filter(t => t.oandaCompatible).length;
  const riskCompliant = trades.filter(t => t.riskCompliant).length;
  const execReady = trades.filter(t => t.executionMode !== 'signal-only').length;
  const tightSpread = trades.filter(t => t.spreadCondition === 'tight').length;
  const total = trades.length || 1;

  const stats = [
    {
      label: 'Tradable via OANDA',
      value: oandaCompatible,
      pct: (oandaCompatible / total) * 100,
      icon: CheckCircle2,
      ok: oandaCompatible / total > 0.9,
    },
    {
      label: 'Execution-Ready Signals',
      value: execReady,
      pct: (execReady / total) * 100,
      icon: Radio,
      ok: execReady / total > 0.3,
    },
    {
      label: 'Risk Compliance',
      value: riskCompliant,
      pct: (riskCompliant / total) * 100,
      icon: Shield,
      ok: riskCompliant / total > 0.8,
    },
    {
      label: 'Tight Spread Conditions',
      value: tightSpread,
      pct: (tightSpread / total) * 100,
      icon: Activity,
      ok: tightSpread / total > 0.25,
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
      <div className="flex items-center gap-2">
        <Wifi className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold">Execution Compatibility</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="p-3 rounded-lg bg-muted/10 border border-border/30 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <s.icon className={cn('w-3.5 h-3.5', s.ok ? 'text-neural-green' : 'text-neural-orange')} />
              <span className="text-[10px] font-medium">{s.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-lg font-display font-bold', s.ok ? 'text-neural-green' : 'text-neural-orange')}>
                {s.pct.toFixed(0)}%
              </span>
              <span className="text-[9px] text-muted-foreground">({s.value}/{trades.length})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
