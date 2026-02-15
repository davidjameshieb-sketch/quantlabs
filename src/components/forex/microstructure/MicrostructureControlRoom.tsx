// Microstructure Control Room — The Architect's HUD
// Three panels: Displacement Heatmap, Internalization Alpha, Stop-Hunt Radar

import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { LiquidityDisplacementHeatmap } from './LiquidityDisplacementHeatmap';
import { InternalizationAlphaTracker } from './InternalizationAlphaTracker';
import { RetailStopHuntRadar } from './RetailStopHuntRadar';

export function MicrostructureControlRoom() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Cpu className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
          Microstructure Control Room
        </span>
        <span className="text-[9px] text-muted-foreground ml-auto">
          Pressure in the pipes — not charts
        </span>
      </div>

      {/* Primary: Displacement Heatmap (full width) */}
      <LiquidityDisplacementHeatmap />

      {/* Secondary: Alpha + Radar side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InternalizationAlphaTracker />
        <RetailStopHuntRadar />
      </div>
    </motion.div>
  );
}
