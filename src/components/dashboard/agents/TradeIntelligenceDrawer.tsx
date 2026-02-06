import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, TrendingUp, TrendingDown, Shield, Brain, Clock, 
  AlertTriangle, Activity, Target, BarChart3, Eye, Ban
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ExpandedTradeDetail, SignalLifecycle, TradeStatus } from '@/lib/agents/tradeTypes';
import { cn } from '@/lib/utils';

interface TradeIntelligenceDrawerProps {
  trade: ExpandedTradeDetail | null;
  onClose: () => void;
}

const statusConfig: Record<TradeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'OPEN', color: 'bg-primary/20 text-primary border-primary/30', icon: <Activity className="w-3 h-3" /> },
  closed: { label: 'CLOSED', color: 'bg-neural-green/20 text-neural-green border-neural-green/30', icon: <Target className="w-3 h-3" /> },
  avoided: { label: 'AVOIDED', color: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30', icon: <Ban className="w-3 h-3" /> },
  monitoring: { label: 'MONITORING', color: 'bg-muted text-muted-foreground border-border/50', icon: <Eye className="w-3 h-3" /> },
};

const lifecycleStages: SignalLifecycle[] = ['entry', 'monitoring', 'holding', 'exit', 'post-eval'];

export const TradeIntelligenceDrawer = ({ trade, onClose }: TradeIntelligenceDrawerProps) => {
  if (!trade) return null;

  const { decision, status, risk, transparency, timeline } = trade;
  const statusCfg = statusConfig[status];
  const isPositive = (trade.finalPnlPct ?? trade.currentPnlPct) >= 0;

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
    return `${(mins / 1440).toFixed(1)}d`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-card border-l border-border/50 shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-display text-xl font-bold">{decision.ticker}</h2>
                    <Badge variant="outline" className={cn('text-xs gap-1', statusCfg.color)}>
                      {statusCfg.icon}
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {decision.bias === 'bullish'
                      ? <TrendingUp className="w-4 h-4 text-neural-green" />
                      : <TrendingDown className="w-4 h-4 text-neural-red" />
                    }
                    <span className={cn(
                      'text-sm font-bold uppercase',
                      decision.bias === 'bullish' ? 'text-neural-green' : 'text-neural-red'
                    )}>
                      {decision.bias}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {decision.confidence.toFixed(0)}% confidence
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Trade Performance Summary */}
              <Section title="Trade Performance" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCell label="Entry Price" value={`$${trade.entryPrice.toFixed(2)}`} />
                  <MetricCell
                    label={status === 'closed' ? 'Exit Price' : 'Current Status'}
                    value={trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : statusCfg.label}
                  />
                  <MetricCell
                    label={trade.finalPnlPct !== undefined ? 'Final P&L' : 'Current P&L'}
                    value={`${((trade.finalPnlPct ?? trade.currentPnlPct) * 100).toFixed(2)}%`}
                    positive={isPositive}
                  />
                  <MetricCell label="R:R Outcome" value={trade.riskRewardOutcome.toFixed(2)} />
                  <MetricCell label="Time in Trade" value={formatDuration(trade.timeInTrade)} />
                  <MetricCell label="Lifecycle" value={trade.lifecycle.toUpperCase()} />
                </div>
              </Section>

              {/* Risk Intelligence */}
              <Section title="Risk Intelligence" icon={<Shield className="w-4 h-4 text-neural-orange" />}>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCell label="Max Drawdown" value={`${risk.maxDrawdownPct.toFixed(2)}%`} positive={risk.maxDrawdownPct < 3} />
                  <MetricCell label="Volatility Regime" value={risk.volatilityRegime.toUpperCase()} />
                  <MetricCell label="Efficiency" value={risk.efficiencyDuringTrade.toUpperCase()} />
                  <MetricCell label="Filters Triggered" value={`${risk.riskFiltersTriggered.length}`} />
                </div>
                {risk.riskFiltersTriggered.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {risk.riskFiltersTriggered.map(f => (
                      <Badge key={f} variant="outline" className="text-[10px] bg-neural-red/10 text-neural-red border-neural-red/20">
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" />{f}
                      </Badge>
                    ))}
                  </div>
                )}
                {risk.avoidanceReason && (
                  <div className="mt-3 p-3 rounded-lg bg-neural-orange/10 border border-neural-orange/20">
                    <p className="text-xs text-neural-orange font-medium mb-1">Avoidance Logic</p>
                    <p className="text-xs text-muted-foreground">{risk.avoidanceReason}</p>
                  </div>
                )}
              </Section>

              {/* AI Decision Transparency */}
              <Section title="AI Decision Transparency" icon={<Brain className="w-4 h-4 text-neural-purple" />}>
                <div className="space-y-3">
                  {/* Agent contributions */}
                  <div className="space-y-2">
                    {transparency.agents.map(a => (
                      <div key={a.agentId} className="flex items-center gap-3">
                        <span className="text-lg">{a.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{a.agentName} <span className="text-muted-foreground">({a.model})</span></span>
                            <span className="text-xs font-mono font-bold">{a.confidenceWeight.toFixed(1)}%</span>
                          </div>
                          <Progress value={a.confidenceWeight} className="h-1.5" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator className="bg-border/30" />

                  <div className="grid grid-cols-2 gap-3">
                    <MetricCell label="Agent Agreement" value={`${transparency.multiAgentAgreement.toFixed(0)}%`} positive={transparency.multiAgentAgreement > 60} />
                    <MetricCell label="Market Regime" value={transparency.marketRegime.toUpperCase()} />
                  </div>

                  <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">AI Reasoning</p>
                    <p className="text-xs text-foreground leading-relaxed">{transparency.reasoningSummary}</p>
                  </div>
                </div>
              </Section>

              {/* Trade Timeline */}
              <Section title="Trade Timeline" icon={<Clock className="w-4 h-4 text-primary" />}>
                <div className="relative pl-6 space-y-4">
                  <div className="absolute left-2 top-1 bottom-1 w-px bg-border/50" />
                  {timeline.map((step, i) => (
                    <div key={i} className="relative">
                      <div className={cn(
                        'absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2',
                        step.stage === 'avoided' ? 'bg-neural-orange border-neural-orange/50'
                          : step.stage === 'exit' || step.stage === 'post-eval' ? 'bg-neural-green border-neural-green/50'
                          : 'bg-primary border-primary/50'
                      )} />
                      <div>
                        <p className="text-xs font-medium">{step.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </ScrollArea>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Reusable section wrapper
const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h3 className="font-display text-sm font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

// Metric cell
const MetricCell = ({ label, value, positive }: { label: string; value: string; positive?: boolean }) => (
  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={cn(
      'text-sm font-bold font-display mt-0.5',
      positive !== undefined ? (positive ? 'text-neural-green' : 'text-neural-red') : 'text-foreground'
    )}>{value}</p>
  </div>
);
