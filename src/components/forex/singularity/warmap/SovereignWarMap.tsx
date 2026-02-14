import { motion } from 'framer-motion';
import { Map, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSovereignWarMap } from '@/hooks/useSovereignWarMap';
import { MasterClockQuadrant } from './MasterClockQuadrant';
import { InstitutionalShadowQuadrant } from './InstitutionalShadowQuadrant';
import { PredatoryStrikeQuadrant } from './PredatoryStrikeQuadrant';
import { SelfSynthesisQuadrant } from './SelfSynthesisQuadrant';

export function SovereignWarMap() {
  const state = useSovereignWarMap(15_000);

  const pdColor = state.primeDirectiveScore >= 71 ? 'text-[hsl(var(--neural-green))]' : state.primeDirectiveScore >= 31 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-red))]';
  const sovColor = state.sovereigntyScore >= 85 ? 'text-[hsl(var(--neural-cyan))]' : state.sovereigntyScore >= 50 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="w-5 h-5 text-[hsl(var(--neural-cyan))]" />
          <h2 className="font-display text-lg font-bold">Sovereign War Map</h2>
          <Badge variant="outline" className="text-[9px] border-[hsl(var(--neural-cyan))]/40 text-[hsl(var(--neural-cyan))]">
            LIVE SYNTHESIS
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
          <span>Live · 15s poll</span>
        </div>
      </div>

      {/* 4 Quadrants — 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MasterClockQuadrant state={state} />
        <InstitutionalShadowQuadrant state={state} />
        <PredatoryStrikeQuadrant state={state} />
        <SelfSynthesisQuadrant state={state} />
      </div>

      {/* Footer Scores */}
      <div className="flex items-center justify-center gap-8 p-4 rounded-xl bg-card/60 border border-border/40">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Prime Directive</p>
          <motion.p
            className={cn('text-3xl font-mono font-black', pdColor)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {state.primeDirectiveScore}
          </motion.p>
          <p className="text-[8px] text-muted-foreground">/100</p>
        </div>

        <div className="w-px h-12 bg-border/30" />

        <div className="text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Sovereignty Score</p>
          <motion.p
            className={cn('text-3xl font-mono font-black', sovColor)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {state.sovereigntyScore}
          </motion.p>
          <p className="text-[8px] text-muted-foreground">/100</p>
        </div>
      </div>
    </motion.div>
  );
}
