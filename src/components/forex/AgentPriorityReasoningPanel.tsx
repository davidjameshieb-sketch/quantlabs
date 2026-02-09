// Agent Priority Reasoning Panel — explainability UI for Adaptive Edge tab
// Read-only diagnostic: shows WHY each agent has its current capital tier.

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Brain, ChevronDown, ChevronUp, Download, HelpCircle,
  CheckCircle2, XCircle, TrendingUp, TrendingDown, Shield, Zap,
} from 'lucide-react';
import {
  computeAgentPriorityReasoning,
  exportPriorityReasoningCSV,
  type AgentPriorityReasoning,
  type ScoreComponent,
  type EvidenceTag,
} from '@/lib/forex/agentPriorityReasoning';
import { cn } from '@/lib/utils';
import type { AgentCapitalPriority } from '@/lib/forex/metaOrchestrator';

const PRIORITY_STYLES: Record<AgentCapitalPriority, string> = {
  HIGH: 'text-neural-green bg-neural-green/10 border-neural-green/30',
  STANDARD: 'text-primary bg-primary/10 border-primary/30',
  REDUCED: 'text-neural-orange bg-neural-orange/10 border-neural-orange/30',
  BLOCKED: 'text-neural-red bg-neural-red/10 border-neural-red/30',
};

const PRIORITY_LABELS: Record<AgentCapitalPriority, string> = {
  HIGH: '↑ High',
  STANDARD: '● Standard',
  REDUCED: '↓ Reduced',
  BLOCKED: '✕ Blocked',
};

const TAG_COLORS: Record<string, string> = {
  'Profit driver': 'bg-neural-green/15 text-neural-green border-neural-green/30',
  'Drawdown reducer': 'bg-primary/15 text-primary border-primary/30',
  'Friction optimizer': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'Risk guardian': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Fleet protector': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Session specialist': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Historically destructive': 'bg-neural-red/15 text-neural-red border-neural-red/30',
  'Unstable / drift risk': 'bg-neural-red/15 text-neural-orange border-neural-orange/30',
  'Sample too small': 'bg-muted text-muted-foreground border-border/50',
  'High WR but low expectancy': 'bg-neural-orange/15 text-neural-orange border-neural-orange/30',
};

export function AgentPriorityReasoningPanel() {
  const data = useMemo(() => computeAgentPriorityReasoning(), []);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const handleExportCSV = () => {
    const csv = exportPriorityReasoningCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-priority-reasoning-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (id: string) => setExpandedAgent(prev => prev === id ? null : id);

  return (
    <Card className="border-border/30 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-display">Agent Priority Reasoning</CardTitle>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              Read-only Diagnostics
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportCSV}>
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Explains why each agent is classified as High / Standard / Reduced / Blocked with score breakdowns, evidence, and environment analysis.
        </p>
      </CardHeader>
      <CardContent className="p-3">
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Agent</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">Tier</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">E</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">PF</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">S</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">H%</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Tags</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16"></th>
              </tr>
            </thead>
            <tbody>
              {data.map(agent => {
                const isExpanded = expandedAgent === agent.agentId;
                const e = agent.scores.find(s => s.shortKey === 'E')!;
                const pf = agent.scores.find(s => s.shortKey === 'PF')!;
                const sharpe = agent.scores.find(s => s.shortKey === 'S')!;
                const harm = agent.scores.find(s => s.shortKey === 'H')!;

                return (
                  <AgentRow
                    key={agent.agentId}
                    agent={agent}
                    e={e} pf={pf} sharpe={sharpe} harm={harm}
                    isExpanded={isExpanded}
                    onToggle={() => toggle(agent.agentId)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Agent Row + Expandable Detail ───────────────────────────

function AgentRow({
  agent, e, pf, sharpe, harm, isExpanded, onToggle,
}: {
  agent: AgentPriorityReasoning;
  e: ScoreComponent; pf: ScoreComponent; sharpe: ScoreComponent; harm: ScoreComponent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          'border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer',
          agent.tier === 'BLOCKED' && 'opacity-60',
          isExpanded && 'bg-muted/10',
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{agent.icon}</span>
            <div>
              <span className="font-medium text-foreground">{agent.name}</span>
              <div className="text-[9px] text-muted-foreground">{agent.model}</div>
            </div>
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          <span className={cn('px-2 py-0.5 rounded border text-[10px] font-bold', PRIORITY_STYLES[agent.tier])}>
            {PRIORITY_LABELS[agent.tier]}
          </span>
        </td>
        <td className={cn('px-2 py-2 text-center font-mono', e.passes ? 'text-neural-green' : 'text-neural-red')}>
          {e.value > 0 ? '+' : ''}{e.value}
        </td>
        <td className={cn('px-2 py-2 text-center font-mono', pf.passes ? 'text-foreground' : 'text-neural-orange')}>
          {pf.value}
        </td>
        <td className={cn('px-2 py-2 text-center font-mono', sharpe.passes ? 'text-foreground' : 'text-neural-orange')}>
          {sharpe.value.toFixed(2)}
        </td>
        <td className={cn('px-2 py-2 text-center font-mono', harm.passes ? 'text-foreground' : 'text-neural-red')}>
          {(harm.value * 100).toFixed(0)}%
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-1">
            {agent.tags.slice(0, 2).map(tag => (
              <span key={tag} className={cn('text-[8px] px-1.5 py-0.5 rounded border font-medium', TAG_COLORS[tag] || 'bg-muted text-muted-foreground border-border/50')}>
                {tag}
              </span>
            ))}
            {agent.tags.length > 2 && (
              <span className="text-[8px] text-muted-foreground">+{agent.tags.length - 2}</span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(ev) => { ev.stopPropagation(); onToggle(); }}>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0 border-b border-border/30">
            <AgentDetailPanel agent={agent} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Detail Panel ────────────────────────────────────────────

function AgentDetailPanel({ agent }: { agent: AgentPriorityReasoning }) {
  return (
    <div className="bg-muted/10 px-4 py-4 space-y-4">
      {/* Explanation */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-card/80 border border-border/30">
        <Brain className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <div className="text-[10px] font-medium text-muted-foreground mb-1">Plain-English Summary</div>
          <div className="text-xs text-foreground leading-relaxed">{agent.explanation}</div>
        </div>
      </div>

      {/* Rule & Tier */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-card/60 border border-border/20">
          <div className="text-[9px] text-muted-foreground mb-1">Tier Rule Triggered</div>
          <div className="text-xs font-mono text-foreground">{agent.ruleTriggered}</div>
        </div>
        <div className="p-3 rounded-lg bg-card/60 border border-border/20">
          <div className="text-[9px] text-muted-foreground mb-1">Evidence Tags</div>
          <div className="flex flex-wrap gap-1">
            {agent.tags.map(tag => (
              <span key={tag} className={cn('text-[9px] px-2 py-0.5 rounded border font-medium', TAG_COLORS[tag] || 'bg-muted text-muted-foreground border-border/50')}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground mb-2">Score Breakdown</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {agent.scores.map(score => (
            <ScoreCard key={score.shortKey} score={score} />
          ))}
        </div>
      </div>

      {/* Contribution Flags */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground mb-2">How This Agent Helps</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ContributionFlag label="Increases Wins" active={agent.contributions.increasesWins} icon={TrendingUp} />
          <ContributionFlag label="Reduces Losses" active={agent.contributions.reducesLosses} icon={TrendingDown} />
          <ContributionFlag label="Avoids Bad Conditions" active={agent.contributions.avoidsBadConditions} icon={Shield} />
          <ContributionFlag label="Reduces DD Volatility" active={agent.contributions.reducesDrawdownVolatility} icon={Zap} />
        </div>
      </div>

      {/* Best / Worst EnvKeys */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EnvKeyTable label="Top 5 Best Environments" envKeys={agent.bestEnvKeys} positive />
        <EnvKeyTable label="Top 5 Worst Environments" envKeys={agent.worstEnvKeys} positive={false} />
      </div>
    </div>
  );
}

function ScoreCard({ score }: { score: ScoreComponent }) {
  return (
    <div className={cn(
      'p-2 rounded border text-center',
      score.passes ? 'border-neural-green/20 bg-neural-green/5' : 'border-neural-red/20 bg-neural-red/5',
    )}>
      <div className="flex items-center justify-center gap-1 mb-1">
        {score.passes
          ? <CheckCircle2 className="w-3 h-3 text-neural-green" />
          : <XCircle className="w-3 h-3 text-neural-red" />}
        <span className="text-[9px] font-bold text-muted-foreground">{score.shortKey}</span>
      </div>
      <div className={cn('text-sm font-bold', score.passes ? 'text-neural-green' : 'text-neural-red')}>
        {typeof score.value === 'number' && score.value < 1 && score.shortKey === 'H'
          ? `${(score.value * 100).toFixed(0)}%`
          : score.value}
      </div>
      <div className="text-[8px] text-muted-foreground mt-0.5">{score.threshold}</div>
      <div className="text-[8px] text-muted-foreground mt-0.5 leading-tight">{score.detail}</div>
    </div>
  );
}

function ContributionFlag({ label, active, icon: Icon }: {
  label: string; active: boolean; icon: typeof TrendingUp;
}) {
  return (
    <div className={cn(
      'p-2 rounded border flex items-center gap-1.5',
      active ? 'border-neural-green/20 bg-neural-green/5' : 'border-border/20 bg-muted/10 opacity-50',
    )}>
      <Icon className={cn('w-3 h-3', active ? 'text-neural-green' : 'text-muted-foreground')} />
      <span className={cn('text-[9px]', active ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
    </div>
  );
}

function EnvKeyTable({ label, envKeys, positive }: {
  label: string; envKeys: AgentPriorityReasoning['bestEnvKeys']; positive: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-card/60 border border-border/20">
      <div className="text-[10px] font-medium text-muted-foreground mb-2">{label}</div>
      {envKeys.length === 0 ? (
        <div className="text-[9px] text-muted-foreground py-2">INSUFFICIENT DATA</div>
      ) : (
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left pb-1">EnvKey</th>
              <th className="text-right pb-1">E</th>
              <th className="text-right pb-1">PF</th>
              <th className="text-right pb-1">N</th>
            </tr>
          </thead>
          <tbody>
            {envKeys.map((e, i) => (
              <tr key={i} className="border-t border-border/10">
                <td className="py-1 font-mono text-foreground">{e.envKey}</td>
                <td className={cn('py-1 text-right font-mono', positive ? 'text-neural-green' : 'text-neural-red')}>
                  {e.expectancy > 0 ? '+' : ''}{e.expectancy}
                </td>
                <td className="py-1 text-right font-mono text-muted-foreground">{e.profitFactor}</td>
                <td className="py-1 text-right font-mono text-muted-foreground">{e.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
