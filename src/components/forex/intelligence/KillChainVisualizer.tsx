// Kill-Chain Strategy Visualizer — The FM's 4-Stage Recursive Kill-Chain
import { motion } from 'framer-motion';
import { Swords, Eye, Crosshair, ShieldCheck, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { IntelligenceState } from '@/hooks/useIntelligenceState';

interface Props {
  state: IntelligenceState;
}

interface StageStatus {
  label: string;
  subtitle: string;
  icon: typeof Swords;
  color: string;
  active: boolean;
  detail: string;
}

export function KillChainVisualizer({ state }: Props) {
  const traps = state.sentiment?.profiles?.filter(p => p.actionable) || [];
  const decouplings = state.correlation?.alerts?.filter(a => a.tradeable) || [];
  const adversarial = state.slippage?.profiles?.filter(p => p.patternDetected !== 'CLEAN') || [];

  const stages: StageStatus[] = [
    {
      label: 'STAGE 1',
      subtitle: 'God-Signal Filter',
      icon: Eye,
      color: 'neural-cyan',
      active: !!state.godSignal || !!state.hawkometer,
      detail: state.godSignal ? 'Institutional North Star active' : 'Awaiting God Signal data',
    },
    {
      label: 'STAGE 2',
      subtitle: 'Liquidity Vacuum',
      icon: Crosshair,
      color: 'neural-orange',
      active: traps.length > 0 || (state.darkPool?.profiles?.length || 0) > 0,
      detail: traps.length > 0
        ? `${traps.length} trap${traps.length > 1 ? 's' : ''} detected`
        : 'Scanning sentiment divergence',
    },
    {
      label: 'STAGE 3',
      subtitle: 'Precision Strike',
      icon: Swords,
      color: 'neural-purple',
      active: decouplings.length > 0 || adversarial.length > 0,
      detail: decouplings.length > 0
        ? `${decouplings.length} correlation gap${decouplings.length > 1 ? 's' : ''}`
        : adversarial.length > 0
        ? `${adversarial.length} suspect fill${adversarial.length > 1 ? 's' : ''}`
        : 'No strike opportunities',
    },
    {
      label: 'STAGE 4',
      subtitle: 'Adaptive Exit',
      icon: ShieldCheck,
      color: 'neural-green',
      active: (state.darkPool?.profiles?.length || 0) > 0,
      detail: state.darkPool?.profiles?.some(p => p.thinZones.length > 0)
        ? 'Thin zones mapped for SL placement'
        : 'Vol-surface SL/TP calibrating',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Swords className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold">4-Stage Recursive Kill-Chain</h3>
        <Badge variant="outline" className="text-[8px] border-primary/40 text-primary">
          SOVEREIGN STRATEGY
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`flex-1 p-2.5 rounded-lg border transition-all ${
                stage.active
                  ? `border-[hsl(var(--${stage.color}))]/40 bg-[hsl(var(--${stage.color}))]/5`
                  : 'border-border/20 bg-background/20 opacity-50'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3 h-3 ${stage.active ? `text-[hsl(var(--${stage.color}))]` : 'text-muted-foreground'}`} />
                  <span className="text-[8px] font-bold text-muted-foreground">{stage.label}</span>
                </div>
                <p className={`text-[9px] font-bold ${stage.active ? `text-[hsl(var(--${stage.color}))]` : 'text-muted-foreground'}`}>
                  {stage.subtitle}
                </p>
                <p className="text-[7px] text-muted-foreground mt-0.5">{stage.detail}</p>
              </div>
              {i < stages.length - 1 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
