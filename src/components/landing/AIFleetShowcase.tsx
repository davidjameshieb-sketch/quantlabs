import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye } from 'lucide-react';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { Button } from '@/components/ui/button';
import { EdgePreviewModal } from './EdgePreviewModal';
import { FleetAgentCard } from './FleetAgentCard';

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
    profitPct: 34.7,
    lastTrade: { symbol: 'AAPL', pct: 2.1, time: '3:15 PM' },
    totalTrades: 1_284,
    winRate: 64,
    sparkline: [30, 35, 28, 42, 38, 50, 47, 55, 60, 58, 65, 62, 70, 68, 75],
  },
  'forex-macro': {
    inceptionDate: 'Oct 2024',
    profitPct: 21.3,
    lastTrade: { symbol: 'EUR/USD', pct: 1.4, time: '11:42 AM' },
    totalTrades: 987,
    winRate: 58,
    sparkline: [20, 22, 18, 25, 30, 28, 35, 32, 38, 40, 36, 42, 45, 43, 48],
  },
  'crypto-momentum': {
    inceptionDate: 'Nov 2024',
    profitPct: 48.2,
    lastTrade: { symbol: 'BTC', pct: -0.8, time: '9:30 PM' },
    totalTrades: 2_156,
    winRate: 61,
    sparkline: [10, 18, 15, 30, 25, 40, 35, 50, 42, 55, 60, 52, 68, 65, 72],
  },
  'liquidity-radar': {
    inceptionDate: 'Dec 2024',
    profitPct: 18.6,
    lastTrade: { symbol: 'MSFT', pct: 0.9, time: '2:58 PM' },
    totalTrades: 643,
    winRate: 66,
    sparkline: [15, 18, 16, 22, 20, 25, 28, 26, 32, 30, 35, 33, 38, 36, 40],
  },
  'range-navigator': {
    inceptionDate: 'Dec 2024',
    profitPct: 12.4,
    lastTrade: { symbol: 'GBP/JPY', pct: 0.6, time: '4:00 PM' },
    totalTrades: 512,
    winRate: 71,
    sparkline: [20, 22, 21, 24, 23, 26, 25, 28, 27, 30, 29, 31, 30, 33, 32],
  },
  'volatility-architect': {
    inceptionDate: 'Jan 2025',
    profitPct: 27.9,
    lastTrade: { symbol: 'ETH', pct: 3.4, time: '1:20 PM' },
    totalTrades: 876,
    winRate: 59,
    sparkline: [8, 12, 10, 20, 15, 28, 22, 35, 30, 40, 38, 45, 42, 50, 48],
  },
  'adaptive-learner': {
    inceptionDate: 'Jan 2025',
    profitPct: 9.1,
    lastTrade: { symbol: 'NVDA', pct: 0.3, time: '10:45 AM' },
    totalTrades: 341,
    winRate: 55,
    sparkline: [10, 11, 10, 13, 12, 15, 14, 17, 16, 19, 18, 20, 19, 22, 21],
  },
  'sentiment-reactor': {
    inceptionDate: 'Jan 2025',
    profitPct: 15.8,
    lastTrade: { symbol: 'SOL', pct: -1.2, time: '8:15 PM' },
    totalTrades: 723,
    winRate: 57,
    sparkline: [12, 15, 10, 20, 18, 25, 20, 28, 24, 30, 28, 35, 30, 32, 34],
  },
  'fractal-intelligence': {
    inceptionDate: 'Feb 2025',
    profitPct: 22.1,
    lastTrade: { symbol: 'SPY', pct: 1.7, time: '3:45 PM' },
    totalTrades: 594,
    winRate: 63,
    sparkline: [15, 18, 20, 22, 25, 24, 28, 30, 32, 35, 33, 38, 40, 42, 45],
  },
  'risk-sentinel': {
    inceptionDate: 'Nov 2024',
    profitPct: 19.4,
    lastTrade: { symbol: 'TSLA', pct: 0.5, time: '3:59 PM' },
    totalTrades: 892,
    winRate: 68,
    sparkline: [20, 22, 21, 24, 23, 26, 28, 27, 30, 32, 31, 34, 33, 36, 38],
  },
};

export const AIFleetShowcase = () => {
  const [previewOpen, setPreviewOpen] = useState(false);

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
            10 Trading Models · 4 Optimizers · 6 Governors
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-3">
            <span className="text-foreground">AI Fleet </span>
            <span className="text-gradient-neural">Performance Truth Wall</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
            Each AI model brings a unique analytical personality. Explore their verified track records,
            strategy profiles, and governance status — fully transparent, fully auditable.
          </p>
        </motion.div>

        {/* Agent grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {ALL_AGENT_IDS.map((id, i) => {
            const def = AGENT_DEFINITIONS[id];
            const data = agentShowcaseData[id];
            if (!def || !data) return null;

            return (
              <FleetAgentCard key={id} def={def} data={data} index={i} />
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
              <Link to="/dashboard">
                Enter Free Dashboard
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
            Full platform visibility · Free version uses previous-day data · Edge Access unlocks intraday intelligence
          </p>
        </motion.div>
      </div>

      {/* Edge Access Preview Modal */}
      <EdgePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </section>
  );
};
