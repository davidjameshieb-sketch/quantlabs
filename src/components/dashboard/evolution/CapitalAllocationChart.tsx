import { motion } from 'framer-motion';
import { PieChart, Beaker, Target, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CapitalAllocation } from '@/lib/agents/evolutionTypes';

interface CapitalAllocationChartProps {
  allocation: CapitalAllocation;
}

export const CapitalAllocationChart = ({ allocation }: CapitalAllocationChartProps) => {
  const exploitAngle = (allocation.exploitationPercent / 100) * 360;
  const exploreAngle = (allocation.explorationPercent / 100) * 360;

  // Simple donut segments using conic-gradient
  const exploitColor = 'hsl(var(--neural-green))';
  const exploreColor = 'hsl(var(--neural-purple))';

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          Capital Allocation
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Exploitation vs Exploration — continuous evolution balance
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visual Ring */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div
              className="w-28 h-28 rounded-full"
              style={{
                background: `conic-gradient(
                  ${exploitColor} 0deg ${exploitAngle}deg,
                  ${exploreColor} ${exploitAngle}deg 360deg
                )`,
              }}
            >
              <div className="absolute inset-3 rounded-full bg-card flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs font-mono font-bold text-foreground">
                    {allocation.exploitationPercent.toFixed(0)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">Exploit</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-[hsl(var(--neural-green))]/5 border border-[hsl(var(--neural-green))]/20">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" />
              <span className="text-xs font-medium text-foreground">Exploitation</span>
            </div>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-green))]">
              {allocation.exploitationPercent.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              P&L: ${allocation.exploitationPnl.toFixed(0)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[hsl(var(--neural-purple))]/5 border border-[hsl(var(--neural-purple))]/20">
            <div className="flex items-center gap-2 mb-1">
              <Beaker className="w-3.5 h-3.5 text-[hsl(var(--neural-purple))]" />
              <span className="text-xs font-medium text-foreground">Exploration</span>
            </div>
            <p className="text-lg font-mono font-bold text-[hsl(var(--neural-purple))]">
              {allocation.explorationPercent.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              Discoveries: {allocation.explorationDiscoveries}
            </p>
          </div>
        </div>

        {/* Rebalance History */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ArrowRightLeft className="w-3 h-3" />
            Recent Rebalances
          </p>
          <div className="space-y-2">
            {allocation.rebalanceHistory.slice(0, 3).map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="p-2 rounded bg-muted/10 border border-border/20"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(event.timestamp).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] font-mono text-foreground">
                    {event.fromExploration}% → {event.toExploration}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{event.reason}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
