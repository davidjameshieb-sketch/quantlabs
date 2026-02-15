// Shadow Order Splitter Panel — Shows recent ghost-split executions
import { motion } from 'framer-motion';
import { Ghost, Layers, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ShadowExecution {
  signalId: string;
  agentId: string;
  primaryPair: string;
  direction: string;
  totalUnits: number;
  primaryUnits: number;
  shadowLegs: number;
  allFilled: boolean;
  executedAt: string;
  executionResults: Array<{
    pair: string;
    direction: string;
    units: number;
    role: string;
    status: string;
  }>;
}

interface Props {
  data: ShadowExecution | null;
}

export function ShadowSplitterPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Ghost className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Shadow Splitter</h3>
          <Badge variant="outline" className="text-[8px]">STANDBY</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">No shadow splits executed yet</p>
      </div>
    );
  }

  const timeSince = data.executedAt
    ? `${Math.round((Date.now() - new Date(data.executedAt).getTime()) / 60000)}m ago`
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ghost className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Shadow Splitter</h3>
          {data.allFilled ? (
            <Badge className="text-[8px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />ALL FILLED
            </Badge>
          ) : (
            <Badge className="text-[8px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
              <XCircle className="w-2.5 h-2.5 mr-1" />PARTIAL
            </Badge>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground">{timeSince}</span>
      </div>

      {/* Split summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[10px] font-mono font-bold">{data.primaryPair.replace('_', '/')}</p>
          <p className="text-[8px] text-muted-foreground">Primary</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[14px] font-mono font-bold text-primary">{data.shadowLegs}</p>
          <p className="text-[8px] text-muted-foreground">Shadow Legs</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className="text-[14px] font-mono font-bold">{data.totalUnits}</p>
          <p className="text-[8px] text-muted-foreground">Total Units</p>
        </div>
      </div>

      {/* Execution legs */}
      <div className="space-y-1">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Execution Legs</p>
        {data.executionResults.map((leg, i) => (
          <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-background/30">
            <Layers className={`w-3 h-3 shrink-0 ${leg.role === 'PRIMARY' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-[10px] font-mono font-bold w-16">{leg.pair.replace('_', '/')}</span>
            <Badge className={`text-[7px] ${
              leg.direction === 'long'
                ? 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]'
                : 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
            }`}>
              {leg.direction.toUpperCase()}
            </Badge>
            <span className="text-[9px] text-muted-foreground">{leg.units}u</span>
            <div className="flex-1" />
            <Badge className={`text-[6px] ${
              leg.role === 'PRIMARY' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {leg.role}
            </Badge>
            {leg.status === 'FILLED' || leg.status === 'SIMULATED' ? (
              <CheckCircle2 className="w-3 h-3 text-[hsl(var(--neural-green))]" />
            ) : (
              <XCircle className="w-3 h-3 text-[hsl(var(--neural-red))]" />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
