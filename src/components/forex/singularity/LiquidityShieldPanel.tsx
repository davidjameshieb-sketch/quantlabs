import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SingularityState } from '@/hooks/useSingularityState';

interface Props {
  state: SingularityState;
}

const SHIELD_ZONES = [
  { label: 'Round Numbers (±5 pips)', risk: 'HIGH', description: 'Institutional sweep zones near .000 and .500 levels' },
  { label: 'Session Open/Close', risk: 'MEDIUM', description: 'Liquidity gaps at London/NY transitions' },
  { label: 'Option Barrier Zones', risk: 'HIGH', description: 'Large expiry clusters create stop-hunt magnets' },
  { label: 'Yesterday High/Low', risk: 'MEDIUM', description: 'Key levels where retail stops accumulate' },
];

export function LiquidityShieldPanel({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-[hsl(var(--neural-green))]" />
        <h3 className="text-xs font-display font-bold uppercase tracking-wider">Adversarial Liquidity Shield</h3>
      </div>

      {/* Status Hero */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg border border-[hsl(var(--neural-green))]/30 bg-[hsl(var(--neural-green))]/5 text-center">
          <CheckCircle className="w-4 h-4 mx-auto text-[hsl(var(--neural-green))] mb-1" />
          <p className="text-xl font-mono font-black text-[hsl(var(--neural-green))]">{state.activeStopProtections}</p>
          <p className="text-[8px] text-muted-foreground">Stops Relocated</p>
        </div>
        <div className="p-3 rounded-lg border border-[hsl(var(--neural-orange))]/30 bg-[hsl(var(--neural-orange))]/5 text-center">
          <AlertTriangle className="w-4 h-4 mx-auto text-[hsl(var(--neural-orange))] mb-1" />
          <p className="text-xl font-mono font-black text-[hsl(var(--neural-orange))]">{state.retailClusterAlerts}</p>
          <p className="text-[8px] text-muted-foreground">Cluster Alerts</p>
        </div>
      </div>

      {/* Shield Zones */}
      <div className="space-y-1.5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Monitored Zones</p>
        {SHIELD_ZONES.map((zone, i) => (
          <motion.div
            key={zone.label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/20"
          >
            <div className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              zone.risk === 'HIGH' ? 'bg-[hsl(var(--neural-red))]' : 'bg-[hsl(var(--neural-orange))]'
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-foreground truncate">{zone.label}</p>
              <p className="text-[8px] text-muted-foreground truncate">{zone.description}</p>
            </div>
            <Badge variant="outline" className={cn(
              'text-[7px] shrink-0',
              zone.risk === 'HIGH'
                ? 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/40'
                : 'text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/40'
            )}>
              {zone.risk}
            </Badge>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
