// ═══════════════════════════════════════════════════════════════
// Ensemble Health & Agent Contribution Dashboard
// Cards: Ensemble Health (rolling metrics) + Agent Contribution
// CSV export for envKey tables
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  HeartPulse, Users, Download, AlertTriangle, TrendingUp,
  TrendingDown, Activity, BarChart3, ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllOrders } from '@/lib/forex/fetchAllOrders';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { LearnMode } from '@/lib/agents/agentCollaborationEngine';
import {
  computeEnsembleHealth,
  computeAgentContributions,
  exportContributionsCSV,
  exportEnvContributionsCSV,
  exportHealthCSV,
  EnsembleHealthSnapshot,
  AgentContribution,
  RollingMetrics,
} from '@/lib/agents/ensembleHealthEngine';

// ─── Helpers ─────────────────────────────────────────────────

const agentName = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.name || id;
const agentIcon = (id: string) => AGENT_DEFINITIONS[id as keyof typeof AGENT_DEFINITIONS]?.icon || '🤖';

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Rolling Metric Row ──────────────────────────────────────

const MetricRow = ({ label, metrics }: { label: string; metrics: RollingMetrics }) => (
  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10 border border-border/20">
    <span className="text-[10px] text-muted-foreground w-8 shrink-0 font-medium">{label}</span>
    <div className="flex-1 grid grid-cols-5 gap-2 text-[10px]">
      <div>
        <div className="text-muted-foreground">Expectancy</div>
        <div className={cn('font-mono font-bold', metrics.expectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
          {metrics.expectancy >= 0 ? '+' : ''}{metrics.expectancy}p
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Profit Factor</div>
        <div className={cn('font-mono font-bold', metrics.profitFactor >= 1.5 ? 'text-neural-green' : metrics.profitFactor >= 1 ? 'text-neural-orange' : 'text-neural-red')}>
          {metrics.profitFactor}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Max DD</div>
        <div className="font-mono font-bold text-neural-red">-{metrics.maxDrawdown}p</div>
      </div>
      <div>
        <div className="text-muted-foreground">DD Slope</div>
        <div className={cn('font-mono font-bold', metrics.drawdownSlope <= 0 ? 'text-neural-green' : 'text-neural-red')}>
          {metrics.drawdownSlope > 0 ? '+' : ''}{metrics.drawdownSlope}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Δ Rate</div>
        <div className="font-mono font-bold text-foreground">
          {(metrics.outcomeChangedRate * 100).toFixed(1)}%
        </div>
      </div>
    </div>
    <Badge variant="outline" className="text-[8px]">{metrics.tradeCount} trades</Badge>
  </div>
);

// ─── Main Component ──────────────────────────────────────────

export const EnsembleHealthDashboard = () => {
  const { user } = useAuth();
  const [health, setHealth] = useState<EnsembleHealthSnapshot | null>(null);
  const [contributions, setContributions] = useState<AgentContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [learnMode, setLearnMode] = useState<LearnMode>('live+practice');
  const [showEnvBreakdown, setShowEnvBreakdown] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchAllOrders({
        userId: user.id,
        select: 'agent_id, direction, currency_pair, entry_price, exit_price, status, created_at, confidence_score, session_label, governance_composite, environment, regime_label',
        statuses: ['closed'],
      });

      // Filter out null agent_id rows
      const filtered = data.filter((d: any) => d.agent_id != null);

      if (filtered.length > 0) {
        const h = computeEnsembleHealth(filtered as any, learnMode);
        setHealth(h);
        const c = computeAgentContributions(filtered as any);
        setContributions(c);
      }
    } catch (err) {
      console.error('[Ensemble] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [learnMode, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const harmfulAgents = useMemo(() => contributions.filter(c => c.isFlaggedHarmful), [contributions]);
  const topContributors = useMemo(() => contributions.filter(c => c.deltaExpectancy > 0).slice(0, 5), [contributions]);

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/30 text-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading ensemble data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-primary" />
          <h2 className="font-display text-sm font-bold">Ensemble Health & Contribution</h2>
          <Badge variant="outline" className="text-[9px]">{learnMode}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={learnMode} onValueChange={(v) => setLearnMode(v as LearnMode)}>
            <SelectTrigger className="h-7 text-[10px] w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="live+practice">Live + Practice</SelectItem>
              <SelectItem value="backtest">Backtest (View Only)</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={fetchData} className="text-[10px] h-7">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Rollback Alert */}
      {health?.rollbackActive && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-neural-red/10 border border-neural-red/30 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-neural-red shrink-0" />
          <div className="text-[10px]">
            <span className="font-bold text-neural-red">ENSEMBLE ROLLBACK ACTIVE</span>
            <span className="text-muted-foreground ml-2">{health.rollbackReason}</span>
          </div>
        </motion.div>
      )}

      {/* Ensemble Health Card */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-display font-bold flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-primary" /> Rolling Health Metrics
          </h3>
          <Button
            size="sm" variant="ghost" className="text-[9px] h-6"
            onClick={() => health && downloadCSV(exportHealthCSV(health), 'ensemble-health.csv')}
          >
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </div>
        {health && (
          <div className="space-y-1.5">
            <MetricRow label="E20" metrics={health.rolling20} />
            <MetricRow label="E50" metrics={health.rolling50} />
            <MetricRow label="E100" metrics={health.rolling100} />
          </div>
        )}

        {/* Mode Uptime */}
        {health && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(Object.entries(health.modeUptime) as [string, number][]).map(([mode, count]) => (
              <div key={mode} className="p-2 rounded bg-muted/10 border border-border/20 text-center">
                <div className="text-[9px] text-muted-foreground capitalize">{mode}</div>
                <div className="font-mono text-xs font-bold">{count}</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Agent Contribution Card */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="p-4 rounded-xl bg-card/50 border border-border/30"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-display font-bold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" /> Agent Contribution Accounting
          </h3>
          <div className="flex gap-1">
            <Button
              size="sm" variant="ghost" className="text-[9px] h-6"
              onClick={() => downloadCSV(exportContributionsCSV(contributions), 'agent-contributions.csv')}
            >
              <Download className="w-3 h-3 mr-1" /> Agent CSV
            </Button>
            <Button
              size="sm" variant="ghost" className="text-[9px] h-6"
              onClick={() => downloadCSV(exportEnvContributionsCSV(contributions), 'agent-env-contributions.csv')}
            >
              <Download className="w-3 h-3 mr-1" /> EnvKey CSV
            </Button>
          </div>
        </div>

        {/* Harmful agents warning */}
        {harmfulAgents.length > 0 && (
          <div className="mb-3 p-2 rounded bg-neural-red/10 border border-neural-red/20">
            <div className="flex items-center gap-1.5 text-[10px] text-neural-red font-bold mb-1">
              <AlertTriangle className="w-3 h-3" /> {harmfulAgents.length} agent(s) flagged harmful (≥{HARM_MIN_SAMPLE} trades, harm rate ≥55%)
            </div>
            <div className="flex flex-wrap gap-1">
              {harmfulAgents.map(a => (
                <Badge key={a.agentId} variant="outline" className="text-[8px] text-neural-red border-neural-red/30">
                  {agentIcon(a.agentId)} {agentName(a.agentId)} ({(a.harmRate * 100).toFixed(0)}%)
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Contribution table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/20 text-muted-foreground">
                <th className="text-left py-1 px-2">Agent</th>
                <th className="text-right py-1 px-2">Δ Expectancy</th>
                <th className="text-right py-1 px-2">Pips Gained</th>
                <th className="text-right py-1 px-2">Harm Rate</th>
                <th className="text-right py-1 px-2">Trades</th>
                <th className="text-center py-1 px-2">Status</th>
                <th className="text-center py-1 px-2">EnvKeys</th>
              </tr>
            </thead>
            <tbody>
              {contributions.slice(0, 18).map((c) => (
                <>
                  <tr key={c.agentId} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-1.5 px-2">
                      <span className="mr-1">{agentIcon(c.agentId)}</span>
                      <span className="font-medium">{agentName(c.agentId)}</span>
                    </td>
                    <td className={cn('text-right py-1.5 px-2 font-mono font-bold', c.deltaExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                      {c.deltaExpectancy >= 0 ? '+' : ''}{c.deltaExpectancy}p
                    </td>
                    <td className={cn('text-right py-1.5 px-2 font-mono', c.pipsGainedSynergy > 0 ? 'text-neural-green' : 'text-muted-foreground')}>
                      {c.pipsGainedSynergy > 0 ? '+' : ''}{c.pipsGainedSynergy}p
                    </td>
                    <td className="text-right py-1.5 px-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Progress
                          value={c.harmRate * 100}
                          className="h-1 w-12"
                        />
                        <span className={cn('font-mono', c.harmRate >= 0.55 ? 'text-neural-red' : c.harmRate >= 0.4 ? 'text-neural-orange' : 'text-neural-green')}>
                          {(c.harmRate * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-2 font-mono text-muted-foreground">
                      {c.participatingTrades}
                    </td>
                    <td className="text-center py-1.5 px-2">
                      {c.isFlaggedHarmful ? (
                        <Badge variant="outline" className="text-[8px] text-neural-red border-neural-red/30">HARMFUL</Badge>
                      ) : c.deltaExpectancy > 0 ? (
                        <Badge variant="outline" className="text-[8px] text-neural-green border-neural-green/30">POSITIVE</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[8px] text-muted-foreground">NEUTRAL</Badge>
                      )}
                    </td>
                    <td className="text-center py-1.5 px-2">
                      {c.envKeyBreakdown.length > 0 && (
                        <Button
                          size="sm" variant="ghost" className="text-[8px] h-5 px-1.5"
                          onClick={() => setShowEnvBreakdown(showEnvBreakdown === c.agentId ? null : c.agentId)}
                        >
                          {showEnvBreakdown === c.agentId ? 'Hide' : `${c.envKeyBreakdown.length} keys`}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {showEnvBreakdown === c.agentId && c.envKeyBreakdown.length > 0 && (
                    <tr key={`${c.agentId}-env`}>
                      <td colSpan={7} className="px-4 py-2 bg-muted/5">
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {c.envKeyBreakdown.slice(0, 10).map((env, i) => (
                            <div key={i} className="flex items-center gap-2 text-[9px]">
                              <span className="font-mono text-muted-foreground truncate max-w-[200px]">{env.envKey}</span>
                              <span className={cn('font-mono font-bold', env.deltaExpectancy >= 0 ? 'text-neural-green' : 'text-neural-red')}>
                                {env.deltaExpectancy >= 0 ? '+' : ''}{env.deltaExpectancy}p
                              </span>
                              <span className="text-muted-foreground">{env.trades}t</span>
                              {env.isFlaggedHarmful && (
                                <Badge variant="outline" className="text-[7px] text-neural-red border-neural-red/30">HARMFUL</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

const HARM_MIN_SAMPLE = 30;
