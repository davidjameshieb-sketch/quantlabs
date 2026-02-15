// Sovereign Strategy World — Full dashboard combining all intelligence panels
// with strategy descriptions explaining how each component fits the kill-chain
import { motion } from 'framer-motion';
import { Brain, RefreshCw, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useIntelligenceState } from '@/hooks/useIntelligenceState';
import { KillChainVisualizer } from './KillChainVisualizer';
import { GodSignalPanel } from './GodSignalPanel';
import { SentimentDivergencePanel } from './SentimentDivergencePanel';
import { DarkPoolPanel } from './DarkPoolPanel';
import { CorrelationMatrixPanel } from './CorrelationMatrixPanel';
import { AdversarialSlippagePanel } from './AdversarialSlippagePanel';
import { FixingVolatilityPanel } from './FixingVolatilityPanel';
import { CrossVenueDOMPanel } from './CrossVenueDOMPanel';
import { FlashCrashPanel } from './FlashCrashPanel';

interface StrategySection {
  title: string;
  description: string;
  role: string;
  children: React.ReactNode;
}

function SectionWrapper({ title, description, role, children }: StrategySection) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 px-1">
        <Info className="w-3 h-3 mt-0.5 text-primary/50 shrink-0" />
        <div>
          <h4 className="text-[10px] font-bold text-primary/80 uppercase tracking-wider">{title}</h4>
          <p className="text-[9px] text-muted-foreground leading-relaxed">{description}</p>
          <p className="text-[8px] text-primary/40 italic mt-0.5">Kill-Chain Role: {role}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function StrategyWorldDashboard() {
  const state = useIntelligenceState(30_000);

  const feedCount = [
    state.darkPool, state.correlation, state.sentiment,
    state.slippage, state.hawkometer, state.godSignal,
    state.fixingVolatility, state.crossVenueDom, state.flashCrash,
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Sovereign Strategy World</h2>
          <Badge variant="outline" className="text-[8px] border-primary/40 text-primary">
            {feedCount}/9 FEEDS ACTIVE
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Live · 30s poll</span>
        </div>
      </div>

      {/* Strategy Overview */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
        <h3 className="text-xs font-bold text-primary">THE SOVEREIGN STRATEGY</h3>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          A <span className="text-primary font-bold">4-Stage Recursive Kill-Chain</span> that combines institutional positioning, 
          retail sentiment traps, cross-asset correlation, and adaptive execution into a unified predatory framework. 
          The system identifies where institutions are positioned (God Signal), detects where retail traders are trapped (Sentiment Divergence), 
          finds precision entry via correlation dislocations and liquidity voids (Dark Pool + DOM), then executes with volatility-surface-adjusted 
          risk and tick-velocity circuit breakers. Every component feeds the next — no signal trades in isolation.
        </p>
      </div>

      {/* Kill-Chain Overview */}
      <SectionWrapper
        title="Kill-Chain Pipeline"
        description="The master flow: institutional direction → retail trap detection → precision strike via correlation gaps → adaptive exit through liquidity voids. Each stage gates the next — a trade only fires when all 4 stages align."
        role="Orchestrator — sequences all intelligence into actionable trades"
      >
        <KillChainVisualizer state={state} />
      </SectionWrapper>

      {/* Stage 1: Institutional Direction */}
      <SectionWrapper
        title="Stage 1 — Institutional Direction"
        description="God Signal aggregates CFTC COT smart-money positioning with institutional FX desk research (JPM, GS, Citi). Hawkometer scrapes central bank communications and scores hawkish/dovish tone deltas. Together they establish the 'North Star' — which direction big money is flowing."
        role="Filter — only trade in the direction institutions are positioned"
      >
        <GodSignalPanel godSignal={state.godSignal} hawkometer={state.hawkometer} />
      </SectionWrapper>

      {/* Stage 2: Retail Trap Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionWrapper
          title="Stage 2A — Sentiment Divergence"
          description="Compares retail positioning (OANDA/IG/MyFXBook) against institutional flow. When ≥65% of retail is on one side while institutions lean opposite, a 'trap' is flagged — retail will be squeezed as price moves toward institutional targets."
          role="Trap Detector — identifies retail stop clusters to harvest"
        >
          <SentimentDivergencePanel profiles={state.sentiment?.profiles || []} />
        </SectionWrapper>

        <SectionWrapper
          title="Stage 2B — Dark Pool Liquidity Map"
          description="Synthesizes OANDA order/position book data into a liquidity depth score per pair. Identifies 'thin zones' (low depth = vulnerable to slippage) and 'optimal entry zones' where resting institutional orders cluster. Thin zones become SL placement targets."
          role="Liquidity Scanner — maps where price can move freely vs. where it'll stall"
        >
          <DarkPoolPanel profiles={state.darkPool?.profiles || []} />
        </SectionWrapper>
      </div>

      {/* Stage 3: Precision Strike */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionWrapper
          title="Stage 3A — Correlation Matrix"
          description="Computes rolling Pearson correlations across 14 FX pairs. When historically correlated pairs decouple (e.g. EUR/USD and GBP/USD diverge), it signals a temporary dislocation — one pair is 'wrong' and will revert, creating a precision entry opportunity."
          role="Strike Trigger — finds mispriced pairs via correlation breakdown"
        >
          <CorrelationMatrixPanel
            matrix={state.correlation?.matrix || []}
            alerts={state.correlation?.alerts || []}
          />
        </SectionWrapper>

        <SectionWrapper
          title="Stage 3B — Cross-Venue DOM"
          description="Aggregates OANDA order book + position book to simulate institutional depth-of-market. Shows where large resting orders cluster (buy/sell walls), net retail positioning imbalance, and the 'Wall of Pain' — the price level that would cause maximum retail losses."
          role="Depth Proxy — reveals hidden order flow and institutional price targets"
        >
          <CrossVenueDOMPanel data={state.crossVenueDom as any} />
        </SectionWrapper>
      </div>

      {/* Stage 4: Adaptive Exit & Protection */}
      <SectionWrapper
        title="Stage 4 — Execution Quality & Protection"
        description="Adversarial Slippage Guard audits every fill for adverse execution patterns. If slippage exceeds 0.5 pips on any pair, it auto-injects a gate forcing PREDATORY_LIMIT orders. Ensures the broker isn't front-running or adversarially filling the system."
        role="Quality Assurance — protects P&L from execution decay"
      >
        <AdversarialSlippagePanel profiles={state.slippage?.profiles || []} />
      </SectionWrapper>

      {/* Safety Layer */}
      <div className="rounded-xl border border-[hsl(var(--neural-red))]/20 bg-[hsl(var(--neural-red))]/5 p-3">
        <h3 className="text-[10px] font-bold text-[hsl(var(--neural-red))] uppercase tracking-wider mb-2">
          ⚡ Safety & Circuit Breakers
        </h3>
        <p className="text-[9px] text-muted-foreground mb-3 leading-relaxed">
          Three autonomous safety systems run independently of the kill-chain. They can halt ALL trading in milliseconds — 
          before headlines, before broker alerts, before human reaction. Pure price-action detection with zero reliance on news feeds.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionWrapper
          title="Flash-Crash Kill-Switch"
          description="Monitors raw 5-second tick velocity across 11 pairs simultaneously. If any single pair moves beyond its flash threshold (8-18 pips/5s) or 3+ pairs spike together (cascade), it instantly halts all trading and suspends all agents for 15-30 minutes."
          role="Emergency Brake — triggers before headlines hit, pure velocity detection"
        >
          <FlashCrashPanel data={state.flashCrash as any} />
        </SectionWrapper>

        <SectionWrapper
          title="London 4PM Fix Monitor"
          description="Tracks tick velocity compression and expansion around the London 4PM fixing window (15:30-16:30 UTC). Detects pre-fix 'coiling' (velocity dropping below 40% of normal = large orders queuing) and post-fix spikes. Auto-injects G19 gate to widen SL +50% during fix windows."
          role="Event Shield — protects against the most manipulated 30 minutes in FX"
        >
          <FixingVolatilityPanel data={state.fixingVolatility as any} />
        </SectionWrapper>
      </div>
    </motion.div>
  );
}
