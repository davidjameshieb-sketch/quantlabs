import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, BarChart3 } from 'lucide-react';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

// Deterministic "since inception" stats per agent
const agentShowcaseData: Record<string, {
  inceptionDate: string;
  profitPct: number;
  lastTrade: { pct: number; time: string };
  totalTrades: number;
  sparkline: number[];
}> = {
  'equities-alpha': {
    inceptionDate: 'Sep 2024',
    profitPct: 34.7,
    lastTrade: { pct: 2.1, time: '3:15 PM' },
    totalTrades: 1_284,
    sparkline: [30, 35, 28, 42, 38, 50, 47, 55, 60, 58, 65, 62, 70, 68, 75],
  },
  'forex-macro': {
    inceptionDate: 'Oct 2024',
    profitPct: 21.3,
    lastTrade: { pct: 1.4, time: '11:42 AM' },
    totalTrades: 987,
    sparkline: [20, 22, 18, 25, 30, 28, 35, 32, 38, 40, 36, 42, 45, 43, 48],
  },
  'crypto-momentum': {
    inceptionDate: 'Nov 2024',
    profitPct: 48.2,
    lastTrade: { pct: -0.8, time: '9:30 PM' },
    totalTrades: 2_156,
    sparkline: [10, 18, 15, 30, 25, 40, 35, 50, 42, 55, 60, 52, 68, 65, 72],
  },
  'liquidity-radar': {
    inceptionDate: 'Dec 2024',
    profitPct: 18.6,
    lastTrade: { pct: 0.9, time: '2:58 PM' },
    totalTrades: 643,
    sparkline: [15, 18, 16, 22, 20, 25, 28, 26, 32, 30, 35, 33, 38, 36, 40],
  },
  'range-navigator': {
    inceptionDate: 'Dec 2024',
    profitPct: 12.4,
    lastTrade: { pct: 0.6, time: '4:00 PM' },
    totalTrades: 512,
    sparkline: [20, 22, 21, 24, 23, 26, 25, 28, 27, 30, 29, 31, 30, 33, 32],
  },
  'volatility-architect': {
    inceptionDate: 'Jan 2025',
    profitPct: 27.9,
    lastTrade: { pct: 3.4, time: '1:20 PM' },
    totalTrades: 876,
    sparkline: [8, 12, 10, 20, 15, 28, 22, 35, 30, 40, 38, 45, 42, 50, 48],
  },
  'adaptive-learner': {
    inceptionDate: 'Jan 2025',
    profitPct: 9.1,
    lastTrade: { pct: 0.3, time: '10:45 AM' },
    totalTrades: 341,
    sparkline: [10, 11, 10, 13, 12, 15, 14, 17, 16, 19, 18, 20, 19, 22, 21],
  },
  'sentiment-reactor': {
    inceptionDate: 'Jan 2025',
    profitPct: 15.8,
    lastTrade: { pct: -1.2, time: '8:15 PM' },
    totalTrades: 723,
    sparkline: [12, 15, 10, 20, 18, 25, 20, 28, 24, 30, 28, 35, 30, 32, 34],
  },
  'fractal-intelligence': {
    inceptionDate: 'Feb 2025',
    profitPct: 22.1,
    lastTrade: { pct: 1.7, time: '3:45 PM' },
    totalTrades: 594,
    sparkline: [15, 18, 20, 22, 25, 24, 28, 30, 32, 35, 33, 38, 40, 42, 45],
  },
  'risk-sentinel': {
    inceptionDate: 'Nov 2024',
    profitPct: 19.4,
    lastTrade: { pct: 0.5, time: '3:59 PM' },
    totalTrades: 892,
    sparkline: [20, 22, 21, 24, 23, 26, 28, 27, 30, 32, 31, 34, 33, 36, 38],
  },
};

const MiniSparkline = ({ data, positive }: { data: number[]; positive: boolean }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-grad-${positive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? 'hsl(150 100% 45%)' : 'hsl(0 100% 60%)'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={positive ? 'hsl(150 100% 45%)' : 'hsl(0 100% 60%)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-grad-${positive ? 'up' : 'down'})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={positive ? 'hsl(150 100% 45%)' : 'hsl(0 100% 60%)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const AIFleetShowcase = () => {
  return (
    <section className="relative py-24 px-4" id="ai-fleet">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-5">
            10 AI Models · Unified Intelligence
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
            <span className="text-foreground">Meet the </span>
            <span className="text-gradient-neural">AI Trading Fleet</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            Each AI model brings a unique analytical personality. Explore their verified track records,
            strategy profiles, and historical performance — fully transparent, fully auditable.
          </p>
        </motion.div>

        {/* Agent grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {ALL_AGENT_IDS.map((id, i) => {
            const def = AGENT_DEFINITIONS[id];
            const data = agentShowcaseData[id];
            if (!def || !data) return null;
            const isPositive = data.profitPct >= 0;
            const lastTradePositive = data.lastTrade.pct >= 0;

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  to="/dashboard/agents"
                  className="group block h-full"
                >
                  <div className={cn(
                    'relative h-full rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm',
                    'p-5 transition-all duration-300',
                    'hover:border-primary/40 hover:bg-background/20 hover:shadow-lg hover:shadow-primary/5',
                    'hover:-translate-y-1'
                  )}>
                    {/* Top: Icon + Name + Model */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{def.icon}</span>
                        <div>
                          <h3 className="font-display text-sm font-bold text-foreground leading-tight">
                            {def.name}
                          </h3>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {def.model}
                          </p>
                        </div>
                      </div>
                      {/* Live indicator */}
                      <span className="relative flex h-2 w-2 mt-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-neural-green" />
                      </span>
                    </div>

                    {/* Strategy personality */}
                    <p className="text-xs text-muted-foreground/80 leading-relaxed mb-4 line-clamp-2">
                      {def.coreStrategy.split('.')[0]}.
                    </p>

                    {/* Since inception P&L */}
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                          Since {data.inceptionDate}
                        </p>
                        <p className={cn(
                          'font-display text-2xl font-bold',
                          isPositive ? 'text-neural-green' : 'text-neural-red'
                        )}>
                          {isPositive ? '+' : ''}{data.profitPct.toFixed(1)}%
                        </p>
                      </div>
                      <MiniSparkline data={data.sparkline} positive={isPositive} />
                    </div>

                    {/* Last closed trade */}
                    <div className="rounded-lg bg-card/20 border border-border/10 p-2.5 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Last Closed Trade</span>
                        <span className="text-[10px] text-muted-foreground/60">{data.lastTrade.time}</span>
                      </div>
                      <p className={cn(
                        'text-sm font-bold font-mono mt-0.5',
                        lastTradePositive ? 'text-neural-green' : 'text-neural-red'
                      )}>
                        Closed {lastTradePositive ? '+' : ''}{data.lastTrade.pct.toFixed(1)}%
                      </p>
                    </div>

                    {/* Footer: Trade count + CTA */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <BarChart3 className="w-3 h-3" />
                        <span className="text-[10px] font-mono">{data.totalTrades.toLocaleString()} trades</span>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Explore AI Insights
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>

                    {/* Hover glow */}
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-primary/20" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-center mt-10"
        >
          <p className="text-sm text-muted-foreground/60 font-mono">
            All performance data reflects historical AI analysis outcomes · Updated daily · Delayed data for free users
          </p>
        </motion.div>
      </div>
    </section>
  );
};
