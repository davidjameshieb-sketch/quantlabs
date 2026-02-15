// Sovereign Command Bridge — 6-panel layout: Physics of the Solve
import { motion } from 'framer-motion';
import { PillarPulsePanel } from './PillarPulsePanel';
import { KillSwitchHUD } from './KillSwitchHUD';
import { AlphaAttributionMatrix } from './AlphaAttributionMatrix';
import { IntermarketRippleMap } from './IntermarketRippleMap';
import { GhostOrderBook } from './GhostOrderBook';
import { SovereignVoiceConsole } from './SovereignVoiceConsole';
import { useSovereignDirectives } from '@/hooks/useSovereignDirectives';
import { useFloorManagerState } from '@/hooks/useFloorManagerState';

export function CommandBridge() {
  const { pillars, totalCount, loading } = useSovereignDirectives(20_000);
  const fmState = useFloorManagerState(15_000);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Row 1: Pillar Pulse (full width) */}
      <PillarPulsePanel pillars={pillars} totalDirectives={totalCount} loading={loading} />

      {/* Row 2: 3-column grid — Kill-Switch | Ghost Book | Intermarket */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KillSwitchHUD state={fmState} />
        <GhostOrderBook />
        <IntermarketRippleMap />
      </div>

      {/* Row 3: 2-column — Alpha Attribution | Voice Console */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AlphaAttributionMatrix />
        <SovereignVoiceConsole />
      </div>
    </motion.div>
  );
}
