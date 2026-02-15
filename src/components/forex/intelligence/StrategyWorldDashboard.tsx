// Sovereign Strategy World — Full dashboard combining all intelligence panels
import { motion } from 'framer-motion';
import { Brain, RefreshCw, Wifi } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useIntelligenceState } from '@/hooks/useIntelligenceState';
import { KillChainVisualizer } from './KillChainVisualizer';
import { GodSignalPanel } from './GodSignalPanel';
import { SentimentDivergencePanel } from './SentimentDivergencePanel';
import { DarkPoolPanel } from './DarkPoolPanel';
import { CorrelationMatrixPanel } from './CorrelationMatrixPanel';
import { AdversarialSlippagePanel } from './AdversarialSlippagePanel';

export function StrategyWorldDashboard() {
  const state = useIntelligenceState(30_000);

  const feedCount = [
    state.darkPool, state.correlation, state.sentiment,
    state.slippage, state.hawkometer, state.godSignal,
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Sovereign Strategy World</h2>
          <Badge variant="outline" className="text-[8px] border-primary/40 text-primary">
            {feedCount}/6 FEEDS ACTIVE
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Live · 30s poll</span>
        </div>
      </div>

      {/* Kill-Chain Overview (full width) */}
      <KillChainVisualizer state={state} />

      {/* Row 1: God Signal + Sentiment Divergence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GodSignalPanel godSignal={state.godSignal} hawkometer={state.hawkometer} />
        <SentimentDivergencePanel profiles={state.sentiment?.profiles || []} />
      </div>

      {/* Row 2: Dark Pool + Correlation Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DarkPoolPanel profiles={state.darkPool?.profiles || []} />
        <CorrelationMatrixPanel
          matrix={state.correlation?.matrix || []}
          alerts={state.correlation?.alerts || []}
        />
      </div>

      {/* Row 3: Execution Quality (full width) */}
      <AdversarialSlippagePanel profiles={state.slippage?.profiles || []} />
    </motion.div>
  );
}
