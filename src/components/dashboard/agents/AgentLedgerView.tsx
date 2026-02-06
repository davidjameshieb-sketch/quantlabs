// Agent Ledger View
// Per-agent trade book showing all trades initiated and validated by a specific agent

import { motion } from 'framer-motion';
import { User, TrendingUp, TrendingDown, Target, Activity, Award } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AgentLedgerSummary } from '@/lib/agents/ledgerTypes';
import { cn } from '@/lib/utils';

interface AgentLedgerViewProps {
  summaries: AgentLedgerSummary[];
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
}

const regimeLabels: Record<string, string> = {
  trending: 'Trending',
  ranging: 'Ranging',
  volatile: 'Volatile',
  quiet: 'Quiet',
};

export const AgentLedgerView = ({ summaries, onSelectAgent, selectedAgentId }: AgentLedgerViewProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold">AI Model Trade Ledger</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {summaries.map((summary, i) => (
          <motion.div
            key={summary.agentId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card
              className={cn(
                'cursor-pointer transition-all border-border/50 bg-card/50 hover:bg-card/80',
                selectedAgentId === summary.agentId && 'ring-2 ring-primary border-primary/50'
              )}
              onClick={() => onSelectAgent(summary.agentId)}
            >
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{summary.icon}</span>
                  <div>
                    <h4 className="text-xs font-bold">{summary.agentName}</h4>
                    <p className="text-[10px] text-muted-foreground">{summary.model}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniMetric label="Initiated" value={summary.tradesInitiated.toString()} />
                  <MiniMetric label="Validated" value={summary.tradesValidated.toString()} />
                  <MiniMetric
                    label="Win Rate"
                    value={`${(summary.winRate * 100).toFixed(0)}%`}
                    color={summary.winRate > 0.55 ? 'text-neural-green' : summary.winRate > 0.45 ? 'text-neural-orange' : 'text-neural-red'}
                  />
                  <MiniMetric
                    label="Avg Return"
                    value={`${summary.avgReturn > 0 ? '+' : ''}${summary.avgReturn.toFixed(2)}%`}
                    color={summary.avgReturn > 0 ? 'text-neural-green' : 'text-neural-red'}
                  />
                </div>

                {/* Regime Performance Heatmap */}
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Regime Performance</p>
                  <div className="grid grid-cols-4 gap-0.5">
                    {Object.entries(summary.regimePerformance).map(([regime, wr]) => (
                      <div
                        key={regime}
                        className={cn(
                          'text-center py-1 rounded text-[8px] font-mono',
                          wr > 0.6 ? 'bg-neural-green/20 text-neural-green'
                            : wr > 0.45 ? 'bg-neural-orange/20 text-neural-orange'
                              : 'bg-neural-red/20 text-neural-red'
                        )}
                        title={`${regimeLabels[regime]}: ${(wr * 100).toFixed(0)}%`}
                      >
                        {(wr * 100).toFixed(0)}%
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-0.5 mt-0.5">
                    {Object.keys(summary.regimePerformance).map(regime => (
                      <div key={regime} className="text-center text-[7px] text-muted-foreground">
                        {regime.slice(0, 4).toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timing Score */}
                <div>
                  <div className="flex justify-between text-[9px] mb-0.5">
                    <span className="text-muted-foreground">Timing Score</span>
                    <span className="font-mono">{summary.timingScore.toFixed(0)}</span>
                  </div>
                  <Progress value={summary.timingScore} className="h-1" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const MiniMetric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="text-center p-1 rounded bg-muted/10">
    <p className="text-[8px] text-muted-foreground">{label}</p>
    <p className={cn('text-[11px] font-bold font-display', color || 'text-foreground')}>{value}</p>
  </div>
);
