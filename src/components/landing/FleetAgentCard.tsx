import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, Shield, Activity, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentDefinition } from '@/lib/agents/agentConfig';

interface FleetAgentCardProps {
  def: AgentDefinition;
  data: {
    inceptionDate: string;
    profitPct: number;
    lastTrade: { symbol: string; pct: number; time: string };
    totalTrades: number;
    winRate: number;
    sparkline: number[];
  };
  index: number;
  onClick?: () => void;
}

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

export const FleetAgentCard = ({ def, data, index, onClick }: FleetAgentCardProps) => {
  const isPositive = data.profitPct >= 0;
  const lastTradePositive = data.lastTrade.pct >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <button
        onClick={onClick}
        className="group block h-full w-full text-left"
      >
        <div className={cn(
          'relative h-full rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm',
          'p-5 transition-all duration-300',
          'hover:border-primary/40 hover:bg-background/20 hover:shadow-lg hover:shadow-primary/5',
          'hover:-translate-y-1'
        )}>
          {/* Top: Icon + Name + Model */}
          <div className="flex items-start justify-between mb-2">
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
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-3 line-clamp-2">
            {def.coreStrategy.split('.')[0]}.
          </p>

          {/* Since inception P&L + Win Rate */}
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

          {/* Win Rate + Trade Count Row */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-mono text-muted-foreground">
                {data.winRate}% win
              </span>
            </div>
            <div className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground">
                {data.totalTrades.toLocaleString()} trades
              </span>
            </div>
          </div>

          {/* Last closed trade */}
          <div className="rounded-lg bg-card/20 border border-border/10 p-2.5 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Last Closed Trade</span>
              <span className="text-[10px] text-muted-foreground/60">{data.lastTrade.time}</span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] font-mono text-muted-foreground/70">{data.lastTrade.symbol}</span>
              <span className={cn(
                'text-sm font-bold font-mono',
                lastTradePositive ? 'text-neural-green' : 'text-neural-red'
              )}>
                {lastTradePositive ? '+' : ''}{data.lastTrade.pct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Governance badges */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neural-green/10 border border-neural-green/20">
              <Shield className="w-2.5 h-2.5 text-neural-green" />
              <span className="text-[9px] font-mono text-neural-green">Governed</span>
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
              <Activity className="w-2.5 h-2.5 text-primary" />
              <span className="text-[9px] font-mono text-primary">Stable</span>
            </span>
          </div>

          {/* Footer CTA */}
          <div className="flex items-center justify-end">
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Explore Intelligence
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          {/* Hover glow */}
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-primary/20" />
        </div>
      </button>
    </motion.div>
  );
};
