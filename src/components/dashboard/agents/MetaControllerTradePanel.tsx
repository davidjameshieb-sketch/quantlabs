// Meta-Controller Trade Governance Panel
// Shows oversight and governance decisions made by the Meta-Controller AI

import { motion } from 'framer-motion';
import { Shield, Brain, CheckCircle, AlertTriangle, XCircle, Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  MetaControllerGovernance,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
} from '@/lib/agents/ledgerTypes';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

interface MetaControllerTradePanelProps {
  governance: MetaControllerGovernance;
}

const approvalConfig = {
  approved: { label: 'APPROVED', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-neural-green/20 text-neural-green border-neural-green/30' },
  throttled: { label: 'THROTTLED', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30' },
  restricted: { label: 'RESTRICTED', icon: <XCircle className="w-3.5 h-3.5" />, color: 'bg-neural-red/20 text-neural-red border-neural-red/30' },
  override: { label: 'OVERRIDE', icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-violet-400/20 text-violet-400 border-violet-400/30' },
};

export const MetaControllerTradePanel = ({ governance }: MetaControllerTradePanelProps) => {
  const approval = approvalConfig[governance.tradeApprovalStatus];
  const thought = governance.thoughtTransparency;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-display font-bold">Meta-Controller Governance</h4>
      </div>

      {/* Approval Status & Classification */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[10px] gap-1', approval.color)}>
          {approval.icon}
          {approval.label}
        </Badge>
        <Badge variant="outline" className={cn('text-[10px]', CLASSIFICATION_COLORS[governance.strategicClassification])}>
          {CLASSIFICATION_LABELS[governance.strategicClassification]}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          Auth. Confidence: {governance.tradeAuthorizationConfidence.toFixed(0)}%
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <MetricBox label="Risk Alignment" value={governance.portfolioRiskAlignmentScore} suffix="%" />
        <MetricBox label="Auth. Confidence" value={governance.tradeAuthorizationConfidence} suffix="%" />
      </div>

      {/* Capital Allocation Decision */}
      <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
        <p className="text-[10px] text-muted-foreground mb-1 font-medium">Capital Allocation Decision</p>
        <p className="text-xs text-foreground">{governance.capitalAllocationDecision}</p>
      </div>

      {/* Conflict Resolution */}
      <div className="p-2.5 rounded-lg bg-muted/10 border border-border/20">
        <p className="text-[10px] text-muted-foreground mb-1 font-medium">Conflict Resolution</p>
        <p className="text-xs text-foreground">{governance.conflictResolutionOutcome}</p>
      </div>

      {/* Model Weight Adjustments */}
      {governance.modelWeightAdjustments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Model Weight Adjustments</p>
          {governance.modelWeightAdjustments.map((adj, i) => {
            const def = AGENT_DEFINITIONS[adj.agentId];
            return (
              <div key={i} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-muted/5 border border-border/10">
                <div className="flex items-center gap-1.5">
                  <span>{def.icon}</span>
                  <span className="font-medium">{def.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-mono font-bold',
                    adj.adjustment > 0 ? 'text-neural-green' : adj.adjustment < 0 ? 'text-neural-red' : 'text-muted-foreground'
                  )}>
                    {adj.adjustment > 0 ? '+' : ''}{(adj.adjustment * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Separator className="bg-border/20" />

      {/* Thought Transparency */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <h5 className="text-[10px] font-display font-bold uppercase tracking-wider">Meta-Controller Thought Process</h5>
        </div>

        <ThoughtBlock label="Approval Reasoning" text={thought.approvalReasoning} />
        <ThoughtBlock
          label="Most Trusted Agents"
          text={thought.trustedAgents.map(id => `${AGENT_DEFINITIONS[id].icon} ${AGENT_DEFINITIONS[id].name}`).join(' • ')}
        />
        <ThoughtBlock label="Risk Containment" text={thought.riskContainmentEvaluation} />
        <ThoughtBlock label="Expected Lifecycle" text={thought.expectedLifecycleBehavior} />
        <ThoughtBlock label="Evolution Considerations" text={thought.evolutionaryConsiderations} />
      </div>
    </div>
  );
};

const MetricBox = ({ label, value, suffix }: { label: string; value: number; suffix: string }) => (
  <div className="p-2 rounded-lg bg-muted/10 border border-border/20">
    <p className="text-[10px] text-muted-foreground">{label}</p>
    <div className="flex items-center gap-2 mt-1">
      <span className={cn(
        'text-sm font-bold font-display',
        value > 75 ? 'text-neural-green' : value > 50 ? 'text-neural-orange' : 'text-neural-red'
      )}>
        {value.toFixed(0)}{suffix}
      </span>
      <Progress value={value} className="h-1 flex-1" />
    </div>
  </div>
);

const ThoughtBlock = ({ label, text }: { label: string; text: string }) => (
  <div className="p-2 rounded-lg bg-primary/5 border border-primary/10">
    <p className="text-[10px] text-primary font-medium mb-0.5">{label}</p>
    <p className="text-[10px] text-muted-foreground leading-relaxed">{text}</p>
  </div>
);
