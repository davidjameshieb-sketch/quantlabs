// Agent Contribution Panel
// Shows which AI agents participated in a trade decision with roles and influence

import { motion } from 'framer-motion';
import { Users, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LedgerAgentContribution, AGENT_ROLE_LABELS, AGENT_ROLE_COLORS } from '@/lib/agents/ledgerTypes';
import { cn } from '@/lib/utils';

interface AgentContributionPanelProps {
  contributions: LedgerAgentContribution[];
  consensusScore: number;
  conflictDetected: boolean;
}

export const AgentContributionPanel = ({
  contributions,
  consensusScore,
  conflictDetected,
}: AgentContributionPanelProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-display font-bold">AI Agent Contributions</h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              consensusScore > 75
                ? 'bg-neural-green/10 text-neural-green border-neural-green/30'
                : consensusScore > 50
                  ? 'bg-neural-orange/10 text-neural-orange border-neural-orange/30'
                  : 'bg-neural-red/10 text-neural-red border-neural-red/30'
            )}
          >
            Consensus: {consensusScore.toFixed(0)}%
          </Badge>
          {conflictDetected && (
            <Badge variant="outline" className="text-[10px] bg-neural-red/10 text-neural-red border-neural-red/30 gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              Conflict
            </Badge>
          )}
        </div>
      </div>

      {/* Weighted Contribution Bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/20 border border-border/30">
        {contributions.map((c, i) => (
          <motion.div
            key={c.agentId}
            initial={{ width: 0 }}
            animate={{ width: `${c.influenceWeight * 100}%` }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className={cn(
              'h-full transition-colors',
              i === 0 ? 'bg-primary' : i === 1 ? 'bg-neural-green' : i === 2 ? 'bg-neural-orange' : i === 3 ? 'bg-cyan-400' : 'bg-violet-400'
            )}
            title={`${c.agentName}: ${(c.influenceWeight * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Agent List */}
      <div className="space-y-2">
        {contributions.map((c, i) => (
          <motion.div
            key={c.agentId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="p-2.5 rounded-lg bg-muted/10 border border-border/20 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{c.icon}</span>
                <div>
                  <span className="text-xs font-bold">{c.agentName}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">({c.model})</span>
                </div>
              </div>
              <Badge variant="outline" className={cn('text-[9px]', AGENT_ROLE_COLORS[c.role])}>
                {AGENT_ROLE_LABELS[c.role]}
              </Badge>
            </div>

            <div className="text-[10px] text-muted-foreground italic">{c.personalityTitle}</div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-muted-foreground">Influence</span>
                  <span className="font-mono font-medium">{(c.influenceWeight * 100).toFixed(1)}%</span>
                </div>
                <Progress value={c.influenceWeight * 100} className="h-1" />
              </div>
              <div className="text-center min-w-[50px]">
                <div className="text-[10px] text-muted-foreground">Agreement</div>
                <div className={cn(
                  'text-xs font-bold font-mono',
                  c.signalAgreementScore > 75 ? 'text-neural-green' : c.signalAgreementScore > 50 ? 'text-neural-orange' : 'text-neural-red'
                )}>
                  {c.signalAgreementScore.toFixed(0)}%
                </div>
              </div>
              <div className="text-center min-w-[50px]">
                <div className="text-[10px] text-muted-foreground">Confidence</div>
                <div className="text-xs font-bold font-mono">{c.confidenceContribution.toFixed(0)}%</div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">{c.tradeReasonSummary}</p>

            {c.conflictsDetected && (
              <div className="flex items-center gap-1 text-[10px] text-neural-red">
                <AlertTriangle className="w-2.5 h-2.5" />
                Conflict detected with consensus direction
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
