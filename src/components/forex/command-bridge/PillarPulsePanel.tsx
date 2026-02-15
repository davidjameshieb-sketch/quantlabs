// Pillar Pulse — Top-level 5-pillar status overview with detailed explanations
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Swords, Crosshair, Dna, Microscope, Zap, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type PillarSummary } from '@/hooks/useSovereignDirectives';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const PILLAR_ICONS: Record<string, React.ElementType> = {
  P0: Shield, P1: Swords, P2: Crosshair, P3: Dna, P4: Microscope,
};

const PILLAR_COLORS: Record<string, string> = {
  P0: 'from-red-500/20 to-red-500/5 border-red-500/30',
  P1: 'from-orange-500/20 to-orange-500/5 border-orange-500/30',
  P2: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
  P3: 'from-purple-500/20 to-purple-500/5 border-purple-500/30',
  P4: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
};

const PILLAR_ACCENT: Record<string, string> = {
  P0: 'text-red-400', P1: 'text-orange-400', P2: 'text-cyan-400',
  P3: 'text-purple-400', P4: 'text-amber-400',
};

const PILLAR_DESCRIPTIONS: Record<string, {
  tagline: string;
  detail: string;
  examples: string[];
  role: string;
}> = {
  P0: {
    tagline: 'Foundation — Always-On Safety Layer',
    detail: 'The bedrock of the trading system. These directives are NEVER overridden and execute deterministically every cycle. They enforce capital preservation, risk budgets, and kill-switches that protect against catastrophic loss.',
    examples: [
      'Circuit breaker: halt all trading if drawdown exceeds -40 pips/hour',
      'Session blacklist: block trading during illiquid windows',
      'Max exposure caps per pair and portfolio-wide',
      'Spread sanity checks before order submission',
    ],
    role: 'Prevents ruin. If P0 fires, all other pillars yield.',
  },
  P1: {
    tagline: 'Adversarial — Defensive Intelligence',
    detail: 'Detects and neutralizes market traps, stop-hunts, and adverse conditions before they damage open positions. These directives act as the system\'s immune system — identifying threats from institutional order flow, news spikes, and liquidity vacuums.',
    examples: [
      'Stop-hunt detection via liquidity cluster analysis',
      'News event shields with automatic position reduction',
      'Sentiment divergence alerts (retail vs institutional)',
      'Flash crash killswitch with sub-second response',
    ],
    role: 'Protects capital from adversarial market conditions.',
  },
  P2: {
    tagline: 'Anticipatory — Offensive Positioning',
    detail: 'Proactive intelligence that positions the system ahead of market moves. Uses intermarket analysis, macro flows, central bank positioning, and lead-lag correlations to anticipate directional shifts before they materialize on the chart.',
    examples: [
      'Intermarket ripple detection (bonds → FX propagation)',
      'Central bank communication sentiment scoring',
      'Carry trade flow analysis for JPY crosses',
      'Predictive regime transition forecasting',
    ],
    role: 'Creates edge by acting before the move, not reacting to it.',
  },
  P3: {
    tagline: 'Evolutionary — R&D & Self-Improvement',
    detail: 'The system\'s R&D lab. These directives enable autonomous evolution — synthesizing new gates, mutating agent DNA, running shadow backtests, and attributing alpha to specific behaviors. This is how the system gets smarter over time without manual intervention.',
    examples: [
      'DNA mutation engine for agent parameter evolution',
      'Alpha attribution matrix linking P&L to specific rules',
      'Shadow agent tournaments for strategy validation',
      'Recursive self-play for adversarial robustness',
    ],
    role: 'Ensures the system continuously evolves and never stagnates.',
  },
  P4: {
    tagline: 'Microstructure — Sub-Second Lens',
    detail: 'Institutional-grade microstructure analysis operating at the tick level. Monitors order book dynamics, ghost liquidity, displacement patterns, and retail stop-cluster positioning to provide a granular view of where real money is flowing.',
    examples: [
      'Ghost order book tracking (phantom bids/asks)',
      'Retail stop-cluster heatmaps via Wall of Pain',
      'Liquidity displacement scoring across correlation blocs',
      'Spread microstructure edge detection',
    ],
    role: 'Sees what retail can\'t — the physics beneath price.',
  },
};

interface Props {
  pillars: PillarSummary[];
  totalDirectives: number;
  loading: boolean;
}

export function PillarPulsePanel({ pillars, totalDirectives, loading }: Props) {
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        <Zap className="w-6 h-6 mx-auto mb-2 opacity-30 animate-pulse" />
        Loading Pillar Pulse…
      </div>
    );
  }

  const toggleExpand = (pillar: string) => {
    setExpandedPillar(prev => prev === pillar ? null : pillar);
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Pillar Pulse</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-[10px]">
                5-pillar sovereignty architecture. Each pillar governs a domain of autonomous intelligence. L0 = hardwired (deterministic, no AI credits). Click any pillar for details.
              </TooltipContent>
            </Tooltip>
          </div>
          <Badge variant="secondary" className="text-[10px] h-5 px-2 font-mono">
            {totalDirectives} directives loaded
          </Badge>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {pillars.map((p, i) => {
            const Icon = PILLAR_ICONS[p.pillar] || Shield;
            const accent = PILLAR_ACCENT[p.pillar] || 'text-primary';
            const bgClass = PILLAR_COLORS[p.pillar] || '';
            const healthPct = p.totalCount > 0 ? Math.min(100, Math.round((p.l0Count / p.totalCount) * 100)) : 0;
            const desc = PILLAR_DESCRIPTIONS[p.pillar];
            const isExpanded = expandedPillar === p.pillar;

            return (
              <motion.div
                key={p.pillar}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl border bg-gradient-to-b ${bgClass} p-3 text-center space-y-2 cursor-pointer hover:brightness-110 transition-all`}
                onClick={() => toggleExpand(p.pillar)}
              >
                <Icon className={`w-5 h-5 mx-auto ${accent}`} />
                <div className="text-[10px] font-bold uppercase tracking-wider text-foreground">{p.pillar}</div>
                <div className="text-lg font-mono font-black text-foreground">{p.totalCount}</div>
                <div className="text-[9px] text-muted-foreground">{p.label.split('(')[0].trim()}</div>
                {/* L0 Hardwire bar */}
                <div className="space-y-0.5">
                  <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${healthPct}%` }}
                      className={`h-full rounded-full ${accent.replace('text-', 'bg-')}`}
                    />
                  </div>
                  <div className="text-[8px] text-muted-foreground">{p.l0Count} L0 · {healthPct}%</div>
                </div>
                {/* Expand indicator */}
                <div className={`${accent} flex justify-center`}>
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Expanded detail panel */}
        <AnimatePresence mode="wait">
          {expandedPillar && PILLAR_DESCRIPTIONS[expandedPillar] && (
            <motion.div
              key={expandedPillar}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {(() => {
                const desc = PILLAR_DESCRIPTIONS[expandedPillar];
                const accent = PILLAR_ACCENT[expandedPillar] || 'text-primary';
                const pillarData = pillars.find(p => p.pillar === expandedPillar);
                const Icon = PILLAR_ICONS[expandedPillar] || Shield;

                return (
                  <div className={`rounded-xl border bg-card/60 p-4 space-y-3 border-border/50`}>
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${accent}`} />
                      <span className={`text-xs font-bold ${accent}`}>{desc.tagline}</span>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-foreground/80 leading-relaxed">
                      {desc.detail}
                    </p>

                    {/* Role callout */}
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 border border-border/30">
                      <Zap className={`w-3 h-3 mt-0.5 flex-shrink-0 ${accent}`} />
                      <span className="text-[10px] text-foreground/70 italic">{desc.role}</span>
                    </div>

                    {/* Examples */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Active Capabilities</span>
                      <ul className="space-y-1">
                        {desc.examples.map((ex, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[10px] text-foreground/70">
                            <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${accent.replace('text-', 'bg-')}`} />
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Stats row */}
                    {pillarData && (
                      <div className="flex items-center gap-4 pt-1 border-t border-border/30">
                        <div className="text-[9px] text-muted-foreground">
                          <span className="font-mono font-bold text-foreground">{pillarData.totalCount}</span> total directives
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          <span className="font-mono font-bold text-foreground">{pillarData.l0Count}</span> L0 hardwired
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          <span className="font-mono font-bold text-foreground">{pillarData.totalCount - pillarData.l0Count}</span> AI-evaluated
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
