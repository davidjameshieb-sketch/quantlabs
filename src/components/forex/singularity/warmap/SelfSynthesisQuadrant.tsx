import { motion } from 'framer-motion';
import { Dna, ArrowRight, Trophy, AlertCircle, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WarMapState } from '@/hooks/useSovereignWarMap';

interface Props { state: WarMapState }

export function SelfSynthesisQuadrant({ state }: Props) {
  return (
    <div className="p-4 rounded-xl bg-card/60 border border-border/40 space-y-3 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        background: 'radial-gradient(circle at 70% 70%, hsl(var(--neural-green)), transparent 60%)',
      }} />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          <h3 className="text-xs font-display font-bold uppercase tracking-wider">IV. Self-Synthesis</h3>
          <Badge variant="outline" className="text-[8px] ml-auto border-[hsl(var(--neural-green))]/40 text-[hsl(var(--neural-green))]">
            EVOLUTION
          </Badge>
        </div>

        {/* Strategy Pivots (last 4h) */}
        <div className="space-y-1.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Strategy Pivots (4h)</p>
          {state.strategyPivots.length > 0 ? (
            <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
              {state.strategyPivots.map((pivot, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-1.5 px-2 py-1 rounded bg-muted/10 border border-border/20"
                >
                  <ArrowRight className="w-2.5 h-2.5 text-[hsl(var(--neural-green))] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-mono text-foreground truncate">{pivot.description}</p>
                    <p className="text-[7px] text-muted-foreground">
                      {new Date(pivot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground italic">No pivots in last 4 hours</p>
          )}
        </div>

        {/* Agent Audit */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg border border-[hsl(var(--neural-green))]/20 bg-[hsl(var(--neural-green))]/5 text-center">
            <Trophy className="w-3.5 h-3.5 mx-auto text-[hsl(var(--neural-green))] mb-0.5" />
            <p className="text-[8px] text-muted-foreground uppercase">Apex Predator</p>
            <p className="text-[10px] font-mono font-bold text-[hsl(var(--neural-green))] truncate">{state.apexAgent}</p>
          </div>
          <div className="p-2 rounded-lg border border-[hsl(var(--neural-red))]/20 bg-[hsl(var(--neural-red))]/5 text-center">
            <AlertCircle className="w-3.5 h-3.5 mx-auto text-[hsl(var(--neural-red))] mb-0.5" />
            <p className="text-[8px] text-muted-foreground uppercase">Sick Agent</p>
            <p className="text-[10px] font-mono font-bold text-[hsl(var(--neural-red))] truncate">{state.sickAgent}</p>
          </div>
        </div>

        {/* Sovereign Verdict */}
        <div className="p-3 rounded-lg border border-[hsl(var(--neural-cyan))]/30 bg-[hsl(var(--neural-cyan))]/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3 h-3 text-[hsl(var(--neural-cyan))]" />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">The Sovereign Verdict</p>
          </div>
          <p className="text-[10px] text-foreground italic leading-relaxed">{state.sovereignVerdict}</p>
        </div>
      </div>
    </div>
  );
}
