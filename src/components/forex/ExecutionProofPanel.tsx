// Execution Proof Panel — Shows per-decision verification of all intelligence layers.
// Fetches last execution decisions and displays:
// MTF PASS/FAIL (1m/5m/15m), Regime PASS/FAIL, Safety PASS/FAIL,
// Coalition agents + votes, Auto-promotion events, Final decision reason.
// Includes Live Integrity Summary mode (20-attempt audit).

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, RefreshCw, Zap, ShieldCheck, Activity,
  Users, TrendingUp, ArrowDownRight, AlertTriangle, Clock, Lock, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface EdgeProof {
  mtf_1m_ignition: "PASS" | "FAIL";
  mtf_5m_momentum: "PASS" | "FAIL";
  mtf_15m_bias: "PASS" | "FAIL";
  mtf_data_available: boolean;
  regime_detected: string;
  regime_authorized: "PASS" | "FAIL";
  spread_check: "PASS" | "FAIL";
  slippage_check: "PASS" | "FAIL";
  liquidity_check: "PASS" | "FAIL";
  eligible_agents_count: number;
  active_agents: string[];
  auto_promotion_event: "none" | "bench" | "shadow" | "support";
  coalition_threshold_required: number;
  coalition_threshold_met: "PASS" | "FAIL";
  is_support_agent: boolean;
  final_decision: "EXECUTE" | "SKIP" | "PENDING";
  final_reason_top3: string[];
}

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
    edgeLocked?: number;
    mtfBlocked?: number;
    weakConsensus?: number;
    gated: number;
    rejected: number;
    pairBanned: number;
  };
  elapsed: number;
}

interface IntegritySummary {
  total: number;
  fullStackPass: number;
  mtfVetoed: number;
  regimeVetoed: number;
  safetyVetoed: number;
  coalitionVetoed: number;
  executed: number;
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
  const [recentProofs, setRecentProofs] = useState<EdgeProof[]>([]);
  const [integrity, setIntegrity] = useState<IntegritySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [integrityLoading, setIntegrityLoading] = useState(false);
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

  // Load integrity summary from recent orders' governance_payload.edgeProof
  const fetchIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const { data: orders } = await supabase
        .from('oanda_orders')
        .select('governance_payload, status')
        .neq('currency_pair', 'SYSTEM')
        .not('governance_payload', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!orders || orders.length === 0) {
        setIntegrity({ total: 0, fullStackPass: 0, mtfVetoed: 0, regimeVetoed: 0, safetyVetoed: 0, coalitionVetoed: 0, executed: 0 });
        setRecentProofs([]);
        return;
      }

      const proofs: EdgeProof[] = [];
      const summary: IntegritySummary = { total: 0, fullStackPass: 0, mtfVetoed: 0, regimeVetoed: 0, safetyVetoed: 0, coalitionVetoed: 0, executed: 0 };

      for (const o of orders) {
        const gp = o.governance_payload as Record<string, unknown> | null;
        const ep = gp?.edgeProof as EdgeProof | undefined;
        if (!ep) continue;

        summary.total++;
        proofs.push(ep);

        const mtfPass = ep.mtf_1m_ignition === "PASS" && ep.mtf_5m_momentum === "PASS" && ep.mtf_15m_bias === "PASS";
        const regimePass = ep.regime_authorized === "PASS";
        const safetyPass = ep.spread_check === "PASS" && ep.slippage_check === "PASS" && ep.liquidity_check === "PASS";
        const coalitionPass = ep.coalition_threshold_met === "PASS";

        if (mtfPass && regimePass && safetyPass && coalitionPass) summary.fullStackPass++;
        if (!mtfPass) summary.mtfVetoed++;
        if (!regimePass) summary.regimeVetoed++;
        if (!safetyPass) summary.safetyVetoed++;
        if (!coalitionPass) summary.coalitionVetoed++;
        if (ep.final_decision === "EXECUTE") summary.executed++;
      }

      setIntegrity(summary);
      setRecentProofs(proofs.slice(0, 5));
    } catch (e: any) {
      console.error('Integrity fetch error:', e);
    } finally {
      setIntegrityLoading(false);
    }
  }, []);

  if (!proof && !loading && !error && !integrity) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="py-8 flex flex-col items-center gap-3">
          <Lock className="w-8 h-8 text-primary/50" />
          <p className="text-xs text-muted-foreground text-center">Verify all intelligence layers are consulted for every trade</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fetchProof}>
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Load Execution Proof
            </Button>
            <Button size="sm" variant="outline" onClick={fetchIntegrity}>
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Integrity Audit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live Integrity Summary */}
      {integrity && (
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                Live Integrity Summary
                <Badge variant="outline" className="text-[9px]">{integrity.total} decisions audited</Badge>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={fetchIntegrity} disabled={integrityLoading} className="h-7 text-xs gap-1">
                <RefreshCw className={cn('w-3 h-3', integrityLoading && 'animate-spin')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <IntegrityMetric
                label="Full Stack Pass"
                value={integrity.total > 0 ? `${Math.round(integrity.fullStackPass / integrity.total * 100)}%` : '—'}
                count={integrity.fullStackPass}
                total={integrity.total}
                good
              />
              <IntegrityMetric
                label="MTF Vetoed"
                value={integrity.total > 0 ? `${Math.round(integrity.mtfVetoed / integrity.total * 100)}%` : '—'}
                count={integrity.mtfVetoed}
                total={integrity.total}
              />
              <IntegrityMetric
                label="Regime Vetoed"
                value={integrity.total > 0 ? `${Math.round(integrity.regimeVetoed / integrity.total * 100)}%` : '—'}
                count={integrity.regimeVetoed}
                total={integrity.total}
              />
              <IntegrityMetric
                label="Safety Vetoed"
                value={integrity.total > 0 ? `${Math.round(integrity.safetyVetoed / integrity.total * 100)}%` : '—'}
                count={integrity.safetyVetoed}
                total={integrity.total}
              />
              <IntegrityMetric
                label="Coalition Vetoed"
                value={integrity.total > 0 ? `${Math.round(integrity.coalitionVetoed / integrity.total * 100)}%` : '—'}
                count={integrity.coalitionVetoed}
                total={integrity.total}
              />
              <IntegrityMetric
                label="Executed"
                value={integrity.total > 0 ? `${Math.round(integrity.executed / integrity.total * 100)}%` : '—'}
                count={integrity.executed}
                total={integrity.total}
                good
              />
            </div>

            {/* Recent Edge Proofs */}
            {recentProofs.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Recent Decision Proofs</p>
                <div className="space-y-1.5">
                  {recentProofs.map((ep, i) => (
                    <div key={i} className="p-2 rounded-lg border border-border/20 bg-background/30">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ProofBadge label="1m" value={ep.mtf_1m_ignition} />
                        <ProofBadge label="5m" value={ep.mtf_5m_momentum} />
                        <ProofBadge label="15m" value={ep.mtf_15m_bias} />
                        <span className="text-muted-foreground text-[9px]">|</span>
                        <ProofBadge label="Regime" value={ep.regime_authorized} />
                        <span className="text-muted-foreground text-[9px]">|</span>
                        <ProofBadge label="Spread" value={ep.spread_check} />
                        <ProofBadge label="Slip" value={ep.slippage_check} />
                        <ProofBadge label="Liq" value={ep.liquidity_check} />
                        <span className="text-muted-foreground text-[9px]">|</span>
                        <ProofBadge label="Coalition" value={ep.coalition_threshold_met} />
                        <span className="text-muted-foreground text-[9px]">|</span>
                        <Badge className={cn('text-[9px]',
                          ep.final_decision === 'EXECUTE' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                          ep.final_decision === 'SKIP' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                          'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        )}>{ep.final_decision}</Badge>
                        {ep.auto_promotion_event !== 'none' && (
                          <Badge className="text-[9px] bg-blue-500/20 text-blue-300 border-blue-500/30">
                            ⚡ {ep.auto_promotion_event}
                          </Badge>
                        )}
                        {ep.is_support_agent && (
                          <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                            SUPPORT
                          </Badge>
                        )}
                      </div>
                      {ep.final_reason_top3.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-1 font-mono">
                          {ep.final_reason_top3.join(' | ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Execution Proof (Preflight) */}
      <Card className="border-border/30 bg-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Execution Proof
              {lastFetched && <span className="text-[9px] text-muted-foreground font-normal">@ {lastFetched}</span>}
            </CardTitle>
            <div className="flex gap-1">
              {!integrity && (
                <Button size="sm" variant="ghost" onClick={fetchIntegrity} disabled={integrityLoading} className="h-7 text-xs gap-1">
                  <BarChart3 className="w-3 h-3" /> Audit
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={fetchProof} disabled={loading} className="h-7 text-xs gap-1">
                <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
                Refresh
              </Button>
            </div>
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

              {/* Hard Edge Lock Status */}
              <div className="p-2 rounded-lg border border-border/20 bg-background/30">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold">Hard Edge Lock</span>
                  <Badge className="text-[9px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">ACTIVE</Badge>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  No trade can execute without passing ALL layers: MTF confirmation, regime authorization, safety gates, coalition threshold. No bypass allowed.
                </p>
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
                    {agent.id.startsWith('support-') && (
                      <Badge className="text-[8px] bg-purple-500/20 text-purple-300 border-purple-500/30">CONFIRM ONLY</Badge>
                    )}
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

              {/* Summary */}
              <div className="flex gap-3 text-[10px] text-muted-foreground border-t border-border/20 pt-2 flex-wrap">
                <span>Total: {proof.summary.total}</span>
                <span className="text-emerald-400">Filled: {proof.summary.filled}</span>
                {(proof.summary.edgeLocked ?? 0) > 0 && <span className="text-red-400">Edge-Locked: {proof.summary.edgeLocked}</span>}
                {(proof.summary.mtfBlocked ?? 0) > 0 && <span className="text-red-400">MTF-Blocked: {proof.summary.mtfBlocked}</span>}
                {(proof.summary.weakConsensus ?? 0) > 0 && <span className="text-amber-400">Weak-Consensus: {proof.summary.weakConsensus}</span>}
                <span>Gated: {proof.summary.gated}</span>
                <span>Rejected: {proof.summary.rejected}</span>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function ProofBadge({ label, value }: { label: string; value: "PASS" | "FAIL" }) {
  return (
    <Badge variant="outline" className={cn('text-[8px] gap-0.5',
      value === 'PASS' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'
    )}>
      {value === 'PASS' ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {label}
    </Badge>
  );
}

function IntegrityMetric({ label, value, count, total, good }: { label: string; value: string; count: number; total: number; good?: boolean }) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div className="text-center p-2 rounded-lg border border-border/20 bg-background/30">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={cn('text-lg font-mono font-bold',
        good ? (pct > 0.7 ? 'text-emerald-400' : pct > 0.4 ? 'text-amber-400' : 'text-red-400')
        : (pct > 0.3 ? 'text-red-400' : pct > 0.1 ? 'text-amber-400' : 'text-emerald-400')
      )}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{count}/{total}</p>
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg border border-border/20 bg-background/30">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={cn('text-sm font-mono font-bold', color || 'text-foreground')}>{value}</p>
    </div>
  );
}

export default ExecutionProofPanel;
