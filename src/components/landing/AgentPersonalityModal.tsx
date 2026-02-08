import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Shield, Zap, Target, BarChart3, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentDefinition } from '@/lib/agents/agentConfig';

interface AgentPersonalityModalProps {
  agent: AgentDefinition | null;
  data: {
    inceptionDate: string;
    profitPct: number;
    totalTrades: number;
    winRate: number;
  } | null;
  open: boolean;
  onClose: () => void;
}

export const AgentPersonalityModal = ({ agent, data, open, onClose }: AgentPersonalityModalProps) => {
  if (!agent || !data) return null;

  const isPositive = data.profitPct >= 0;

  // Extract market conditions strengths from strategy blocks
  const strategyStrengths: Record<string, { label: string; level: 'high' | 'medium' | 'low' }> = {
    'trend-follow': { label: 'Trending Markets', level: 'high' },
    'momentum': { label: 'Momentum Environments', level: 'high' },
    'breakout': { label: 'Breakout Conditions', level: 'medium' },
    'range-trading': { label: 'Range-Bound Markets', level: 'medium' },
    'mean-reversion': { label: 'Mean Reversion', level: 'medium' },
    'volatility-compression': { label: 'Low Volatility Squeezes', level: 'high' },
    'macro-overlay': { label: 'Macro Regime Alignment', level: 'low' },
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl"
          >
            {/* Top glow bar */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <div className="p-6">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="flex items-start gap-3 mb-5">
                <span className="text-3xl">{agent.icon}</span>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">{agent.name}</h3>
                  <p className="text-xs font-mono text-muted-foreground">{agent.model} · {agent.market}</p>
                </div>
              </div>

              {/* Performance snapshot */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-3 rounded-lg bg-background/30 border border-border/15 text-center">
                  <p className={cn('font-display text-xl font-bold', isPositive ? 'text-neural-green' : 'text-neural-red')}>
                    {isPositive ? '+' : ''}{data.profitPct.toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Since {data.inceptionDate}</p>
                </div>
                <div className="p-3 rounded-lg bg-background/30 border border-border/15 text-center">
                  <p className="font-display text-xl font-bold text-primary">{data.winRate}%</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Win Rate</p>
                </div>
                <div className="p-3 rounded-lg bg-background/30 border border-border/15 text-center">
                  <p className="font-display text-xl font-bold text-foreground">{data.totalTrades.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Total Trades</p>
                </div>
              </div>

              {/* Thinking Style */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5 text-neural-purple" />
                  <span className="text-[10px] font-display uppercase tracking-[0.15em] text-muted-foreground/70">
                    Thinking Style
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {agent.description.split('.').slice(0, 2).join('.')}.
                </p>
              </div>

              {/* Strategy Philosophy */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-display uppercase tracking-[0.15em] text-muted-foreground/70">
                    Strategy Philosophy
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {agent.coreStrategy.split('.').slice(0, 2).join('.')}.
                </p>
              </div>

              {/* Market Conditions Strength */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-neural-cyan" />
                  <span className="text-[10px] font-display uppercase tracking-[0.15em] text-muted-foreground/70">
                    Market Condition Strengths
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {agent.strategyBlocks.map((block) => {
                    const s = strategyStrengths[block];
                    if (!s) return null;
                    return (
                      <div key={block} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background/20 border border-border/10">
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          s.level === 'high' ? 'bg-neural-green' : s.level === 'medium' ? 'bg-neural-cyan' : 'bg-muted-foreground/40'
                        )} />
                        <span className="text-[10px] text-muted-foreground">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Governance & Optimization */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background/20 border border-border/10">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-neural-green" />
                  <span className="text-[10px] font-mono text-neural-green">Governed</span>
                </div>
                <div className="w-px h-4 bg-border/20" />
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-neural-cyan" />
                  <span className="text-[10px] font-mono text-neural-cyan">Optimized</span>
                </div>
                <div className="w-px h-4 bg-border/20" />
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-mono text-primary">Stable</span>
                </div>
              </div>
            </div>

            {/* Bottom glow bar */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-neural-purple/40 to-transparent" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
