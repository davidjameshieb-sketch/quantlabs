import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye } from 'lucide-react';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { Button } from '@/components/ui/button';
import { EdgePreviewModal } from './EdgePreviewModal';
import { FleetAgentCard } from './FleetAgentCard';
import { AgentPersonalityModal } from './AgentPersonalityModal';
import type { AgentId } from '@/lib/agents/types';

// Deterministic "since inception" stats per agent
export const agentShowcaseData: Record<string, {
  inceptionDate: string;
  profitPct: number;
  lastTrade: { symbol: string; pct: number; time: string };
  totalTrades: number;
  winRate: number;
  sparkline: number[];
}> = {
  'equities-alpha': {
    inceptionDate: 'Sep 2024',
    profitPct: 38.4,
    lastTrade: { symbol: 'EUR/USD', pct: 0.28, time: '10:14 AM' },
    totalTrades: 3_842,
    winRate: 74,
    sparkline: [30, 35, 33, 42, 45, 50, 48, 55, 58, 62, 65, 68, 72, 75, 78],
  },
  'forex-macro': {
    inceptionDate: 'Oct 2024',
    profitPct: 52.1,
    lastTrade: { symbol: 'EUR/USD', pct: 0.42, time: '11:02 AM' },
    totalTrades: 6_287,
    winRate: 76,
    sparkline: [20, 25, 28, 35, 38, 42, 45, 50, 55, 58, 62, 65, 70, 72, 78],
  },
  'crypto-momentum': {
    inceptionDate: 'Nov 2024',
    profitPct: 31.6,
    lastTrade: { symbol: 'GBP/USD', pct: 0.18, time: '9:47 AM' },
    totalTrades: 4_512,
    winRate: 71,
    sparkline: [10, 18, 22, 30, 28, 35, 40, 45, 48, 52, 55, 58, 62, 65, 68],
  },
  'liquidity-radar': {
    inceptionDate: 'Dec 2024',
    profitPct: 44.8,
    lastTrade: { symbol: 'USD/JPY', pct: 0.31, time: '10:33 AM' },
    totalTrades: 5_124,
    winRate: 73,
    sparkline: [15, 20, 22, 28, 32, 38, 42, 45, 50, 52, 56, 60, 63, 66, 70],
  },
  'range-navigator': {
    inceptionDate: 'Dec 2024',
    profitPct: 36.7,
    lastTrade: { symbol: 'GBP/JPY', pct: 0.24, time: '10:58 AM' },
    totalTrades: 5_893,
    winRate: 75,
    sparkline: [20, 22, 24, 28, 30, 33, 35, 38, 40, 43, 45, 48, 50, 52, 55],
  },
  'volatility-architect': {
    inceptionDate: 'Jan 2025',
    profitPct: 47.3,
    lastTrade: { symbol: 'EUR/JPY', pct: 0.55, time: '10:21 AM' },
    totalTrades: 4_876,
    winRate: 72,
    sparkline: [8, 15, 20, 28, 32, 38, 42, 50, 54, 58, 62, 66, 70, 74, 78],
  },
  'adaptive-learner': {
    inceptionDate: 'Jan 2025',
    profitPct: 28.9,
    lastTrade: { symbol: 'AUD/USD', pct: 0.15, time: '10:45 AM' },
    totalTrades: 3_241,
    winRate: 70,
    sparkline: [10, 12, 15, 18, 20, 23, 25, 28, 30, 33, 35, 38, 40, 42, 45],
  },
  'sentiment-reactor': {
    inceptionDate: 'Jan 2025',
    profitPct: 33.5,
    lastTrade: { symbol: 'EUR/GBP', pct: 0.19, time: '11:15 AM' },
    totalTrades: 4_387,
    winRate: 71,
    sparkline: [12, 16, 18, 24, 28, 32, 35, 38, 42, 45, 48, 52, 55, 58, 60],
  },
  'fractal-intelligence': {
    inceptionDate: 'Feb 2025',
    profitPct: 41.6,
    lastTrade: { symbol: 'USD/CAD', pct: 0.33, time: '10:52 AM' },
    totalTrades: 4_156,
    winRate: 73,
    sparkline: [15, 20, 25, 30, 33, 38, 42, 45, 50, 53, 57, 60, 64, 67, 70],
  },
  'risk-sentinel': {
    inceptionDate: 'Nov 2024',
    profitPct: 39.2,
    lastTrade: { symbol: 'GBP/USD', pct: 0.22, time: '11:28 AM' },
    totalTrades: 5_612,
    winRate: 76,
    sparkline: [20, 24, 26, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63],
  },
};

export const AIFleetShowcase = () => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);

  const selectedDef = selectedAgent ? AGENT_DEFINITIONS[selectedAgent] : null;
  const selectedData = selectedAgent ? agentShowcaseData[selectedAgent] : null;

  return (
    <section className="relative py-8 px-4" id="ai-fleet">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />
      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-4">
            10 Scalping Agents · OANDA Execution · Governance Filtered
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-3">
            <span className="text-foreground">Scalping Fleet </span>
            <span className="text-gradient-neural">Performance Truth Wall</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
            Every agent is tuned for high-frequency FX scalping. Click any agent to explore its
            scalping strategy, win rate, and OANDA execution readiness.
          </p>
        </motion.div>

        {/* Agent grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {ALL_AGENT_IDS.map((id, i) => {
            const def = AGENT_DEFINITIONS[id];
            const data = agentShowcaseData[id];
            if (!def || !data) return null;

            return (
              <FleetAgentCard
                key={id}
                def={def}
                data={data}
                index={i}
                onClick={() => setSelectedAgent(id)}
              />
            );
          })}
        </div>

        {/* CTA Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mt-10"
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          <Button asChild size="lg" className="text-base px-8 py-6 font-display bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
              <Link to="/dashboard/forex">
                Enter Scalping Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 py-6 border-border/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground gap-2"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="w-4 h-4" />
              Preview Edge Access
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/60 font-mono">
            Full scalping visibility · Free version uses previous-day signals · Edge Access unlocks live scalp feed
          </p>
        </motion.div>
      </div>

      {/* Agent Personality Intelligence Panel */}
      <AgentPersonalityModal
        agent={selectedDef}
        data={selectedData}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />

      {/* Edge Access Preview Modal */}
      <EdgePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </section>
  );
};
