// Execution Proof Panel — Shows per-decision verification of all intelligence layers.
// Fetches the last execution decision from forex-auto-trade and displays:
// MTF PASS/FAIL, Regime PASS/FAIL, Safety PASS/FAIL, Coalition agents + votes,
// Auto-promotion events, Final decision reason.

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, RefreshCw, Zap, ShieldCheck, Activity,
  Users, TrendingUp, ArrowDownRight, AlertTriangle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface ExecutionProof {
  success: boolean;
  mode: string;
  session: string;
  regime: string;
  governanceState: string;
  governance: {
    state: string;
    reasons: string[];
    bannedPairs: string[];
    config: { density: number; sizing: number; frictionK: number };
  };
  agentSnapshot: {
    eligible: number;
    total: number;
    shadow: number;
    disabled: number;
    coalition: {
      tier: string;
      minAgents: number;
      survivorshipScore: number;
      rollingPF: number;
      stabilityTrend: string;
      expectancySlope: number;
      reasons: string[];
    };
    promotionLog: string[];
    agents: { id: string; tier: string; fleetSet: string; state: string; size: number }[];
  };
  signals: {
    pair: string;
    direction: string;
    agentId: string;
    effectiveTier: string;
    gateResult: string;
    status: string;
    units: number;
    sizeMultiplier: number;
    pairCapitalMult: number;
    slippage: number;
    frictionScore: number;
    executionQuality: number;
    govState: string;
  }[];
  summary: {
    total: number;
    filled: number;
    gated: number;
    rejected: number;
    pairBanned: number;
  };
  elapsed: number;
}

const StatusIcon = ({ passed, size = 'sm' }: { passed: boolean; size?: 'sm' | 'md' }) => {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return passed
    ? <CheckCircle2 className={cn(cls, 'text-emerald-400 shrink-0')} />
    : <XCircle className={cn(cls, 'text-red-400 shrink-0')} />;
};

const LayerRow = ({ label, passed, detail, icon }: { label: string; passed: boolean; detail: string; icon: React.ReactNode }) => (
  <div className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
    <div className="w-5 text-muted-foreground">{icon}</div>
    <StatusIcon passed={passed} size="md" />
    <span className="text-xs font-medium flex-1">{label}</span>
    <span className={cn('text-[10px] font-mono', passed ? 'text-muted-foreground' : 'text-red-400')}>{detail}</span>
  </div>
);

export const ExecutionProofPanel = () => {
  const [proof, setProof] = useState<ExecutionProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchProof = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('forex-auto-trade', {
        body: { preflight: true },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (resp.error) throw new Error(resp.error.message);
      setProof(resp.data);
      setLastFetched(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!proof && !loading && !error) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="py-8 flex flex-col items-center gap-3">
          <Zap className="w-8 h-8 text-primary/50" />
          <p className="text-xs text-muted-foreground">Load last execution decision to verify all layers</p>
          <Button size="sm" variant="outline" onClick={fetchProof}>
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Load Execution Proof
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Execution Proof
            {lastFetched && <span className="text-[9px] text-muted-foreground font-normal">@ {lastFetched}</span>}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={fetchProof} disabled={loading} className="h-7 text-xs gap-1">
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading && !proof && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading preflight…
          </div>
        )}

        {proof && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Context Row */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-[9px]">Session: {proof.session}</Badge>
              <Badge variant="outline" className="text-[9px]">Regime: {proof.regime}</Badge>
              <Badge variant="outline" className={cn('text-[9px]',
                proof.governanceState === 'NORMAL' ? 'text-emerald-400' :
                proof.governanceState === 'HALT' ? 'text-red-400' : 'text-amber-400'
              )}>Gov: {proof.governanceState}</Badge>
              <Badge variant="outline" className="text-[9px]">{proof.elapsed}ms</Badge>
            </div>

            {/* Intelligence Layers */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Intelligence Layers</p>
              <LayerRow
                label="MTF Indicator Timing"
                passed={proof.signals.some(s => s.gateResult === 'PASS')}
                detail={proof.signals.length > 0 ? `${proof.signals.filter(s => s.gateResult === 'PASS').length}/${proof.signals.length} signals passed` : 'No signals'}
                icon={<TrendingUp className="w-3.5 h-3.5" />}
              />
              <LayerRow
                label="Regime Authorization"
                passed={proof.regime !== 'unknown' && proof.regime !== 'flat'}
                detail={proof.regime}
                icon={<Activity className="w-3.5 h-3.5" />}
              />
              <LayerRow
                label="Safety Gates (Spread/Slippage/Liquidity)"
                passed={proof.signals.every(s => s.frictionScore >= 50)}
                detail={proof.signals.length > 0 ? `Friction: ${proof.signals.map(s => s.frictionScore).join(', ')}` : 'No signals'}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
              />
              <LayerRow
                label="Coalition Governance"
                passed={proof.agentSnapshot.eligible >= proof.agentSnapshot.coalition.minAgents}
                detail={`${proof.agentSnapshot.coalition.tier.toUpperCase()}: ${proof.agentSnapshot.eligible} agents (min ${proof.agentSnapshot.coalition.minAgents})`}
                icon={<Users className="w-3.5 h-3.5" />}
              />
            </div>

            {/* Coalition Agents */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Coalition Agents</p>
              {proof.agentSnapshot.agents.map((agent, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/10 last:border-0">
                  <Badge variant="outline" className={cn('text-[9px]',
                    agent.fleetSet === 'ACTIVE' ? 'text-emerald-400 border-emerald-500/30' :
                    agent.fleetSet === 'BENCH' ? 'text-amber-400 border-amber-500/30' : 'text-muted-foreground'
                  )}>{agent.fleetSet}</Badge>
                  <span className="font-mono">{agent.id}</span>
                  <span className="text-muted-foreground text-[10px]">{agent.tier}</span>
                  <span className="text-muted-foreground text-[10px] ml-auto">×{agent.size}</span>
                </div>
              ))}
            </div>

            {/* Auto-Promotions */}
            {(proof.agentSnapshot.promotionLog?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-blue-400" /> Auto-Promotions
                </p>
                {proof.agentSnapshot.promotionLog.map((log, i) => (
                  <p key={i} className="text-[9px] text-blue-300/80 font-mono py-0.5">{log}</p>
                ))}
              </div>
            )}

            {/* Survivorship Metrics */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Survivorship</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricCell label="Score" value={proof.agentSnapshot.coalition.survivorshipScore.toString()} />
                <MetricCell label="PF" value={proof.agentSnapshot.coalition.rollingPF.toFixed(2)} />
                <MetricCell label="Exp Slope" value={proof.agentSnapshot.coalition.expectancySlope.toFixed(3)} />
                <MetricCell label="Stability" value={proof.agentSnapshot.coalition.stabilityTrend} color={
                  proof.agentSnapshot.coalition.stabilityTrend === 'improving' ? 'text-emerald-400' :
                  proof.agentSnapshot.coalition.stabilityTrend === 'flat' ? 'text-amber-400' : 'text-red-400'
                } />
              </div>
            </div>

            {/* Governance Reasons */}
            {proof.governance.reasons.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Governance Reasoning</p>
                {proof.governance.reasons.map((r, i) => (
                  <p key={i} className="text-[9px] text-muted-foreground font-mono py-0.5">{r}</p>
                ))}
              </div>
            )}

            {/* Signal Details */}
            {proof.signals.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Signal Details</p>
                {proof.signals.map((sig, i) => (
                  <div key={i} className="p-2 rounded-lg border border-border/20 bg-background/30 space-y-1 mb-2">
                    <div className="flex items-center gap-2">
                      {sig.direction === 'long'
                        ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                        : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                      <span className="text-xs font-mono font-bold">{sig.pair.replace('_', '/')}</span>
                      <Badge variant="outline" className="text-[9px]">{sig.direction.toUpperCase()}</Badge>
                      <Badge variant={sig.status === 'filled' ? 'default' : 'destructive'} className="text-[9px]">{sig.status}</Badge>
                      <span className="text-[9px] text-muted-foreground ml-auto">{sig.units}u</span>
                    </div>
                    <div className="flex gap-3 text-[9px] text-muted-foreground">
                      <span>Agent: {sig.agentId}({sig.effectiveTier})</span>
                      <span>Gate: {sig.gateResult}</span>
                      <span>Quality: {sig.executionQuality}</span>
                      <span>Friction: {sig.frictionScore}</span>
                      <span>Slippage: {sig.slippage.toFixed(2)}p</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="flex gap-3 text-[10px] text-muted-foreground border-t border-border/20 pt-2">
              <span>Total: {proof.summary.total}</span>
              <span className="text-emerald-400">Filled: {proof.summary.filled}</span>
              <span>Gated: {proof.summary.gated}</span>
              <span>Rejected: {proof.summary.rejected}</span>
              <span>Banned: {proof.summary.pairBanned}</span>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg border border-border/20 bg-background/30">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={cn('text-sm font-mono font-bold', color || 'text-foreground')}>{value}</p>
    </div>
  );
}

export default ExecutionProofPanel;
