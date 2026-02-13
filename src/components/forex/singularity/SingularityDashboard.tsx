import { motion } from 'framer-motion';
import { Atom, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSingularityState } from '@/hooks/useSingularityState';
import { SovereigntyScoreGauge } from './SovereigntyScoreGauge';
import { LeadLagRadar } from './LeadLagRadar';
import { PredatorySizingPanel } from './PredatorySizingPanel';
import { LiquidityShieldPanel } from './LiquidityShieldPanel';
import { DynamicGatesRegistry } from './DynamicGatesRegistry';
import { EvolutionAuditLog } from './EvolutionAuditLog';

export function SingularityDashboard() {
  const state = useSingularityState(15_000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Atom className="w-5 h-5 text-[hsl(var(--neural-cyan))]" />
          <h2 className="font-display text-lg font-bold">Singularity Command Center</h2>
          <Badge variant="outline" className="text-[9px] border-[hsl(var(--neural-cyan))]/40 text-[hsl(var(--neural-cyan))]">
            SOVEREIGN INTELLIGENCE
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
          <span>Live · 15s poll</span>
        </div>
      </div>

      {/* Row 1: Sovereignty Score + Predatory Sizing + Liquidity Shield */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SovereigntyScoreGauge state={state} />
        <PredatorySizingPanel state={state} />
        <LiquidityShieldPanel state={state} />
      </div>

      {/* Row 2: Lead-Lag Radar + Dynamic Gates Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadLagRadar state={state} />
        <DynamicGatesRegistry state={state} />
      </div>

      {/* Row 3: Evolution Audit Log (full width) */}
      <EvolutionAuditLog state={state} />
    </motion.div>
  );
}
