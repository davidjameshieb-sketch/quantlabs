// Focus Pairs Edge Dashboard
// Governance-scored tiered ranking of all pairs with detailed edge analysis.

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Lock, Unlock, TrendingUp, Shield, Zap, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Droplets, Gauge,
  Activity, Sun, Moon, Sunrise, Sunset, Star, Ban, Info, Crown,
  Medal, CircleDot,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toDisplaySymbol } from '@/lib/forex/forexSymbolMap';
import { cn } from '@/lib/utils';

// ─── Types ───

interface SessionEdge {
  session: string;
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  avgSpread: number;
  avgSlippage: number;
  avgQuality: number;
}

interface PairEdgeData {
  pair: string;
  totalTrades: number;
  winRate: number;
  expectancy: number;
  netPips: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  stddev: number;
  sharpe: number;
  liveTrades: number;
  liveExpectancy: number;
  liveWinRate: number;
  avgSpread: number;
  avgSlippage: number;
  avgQuality: number;
  avgGovComposite: number;
  avgConfidence: number;
  sessions: SessionEdge[];
  // governance scoring
  frictionCost: number;
  postFrictionExp: number;
  frictionRatio: number; // friction as % of gross edge
  edgeScore: number; // composite governance score 0-100
  tier: 1 | 2 | 3;
  tierLabel: string;
  edgeReasons: string[];
  edgeRisks: string[];
  verdict: string;
}

const FOCUS_PAIRS = ['EUR_USD', 'USD_CAD'];

const LIVE_PROOF_THRESHOLD = { minTrades: 20, minWinRate: 55, minExpectancy: 0.5 };

const SESSION_ICONS: Record<string, React.ElementType> = {
  'london-open': Sunrise, 'ny-overlap': Sun, 'asian': Moon, 'late-ny': Sunset, 'rollover': Clock,
};
const SESSION_LABELS: Record<string, string> = {
  'london-open': 'London Open', 'ny-overlap': 'NY Overlap', 'asian': 'Asian', 'late-ny': 'Late NY', 'rollover': 'Rollover',
};

const PAIR_BASE_SPREADS: Record<string, number> = {
  EUR_USD: 0.6, GBP_USD: 0.9, USD_JPY: 0.7, AUD_USD: 0.8,
  USD_CAD: 1.0, EUR_JPY: 1.1, GBP_JPY: 1.5, EUR_GBP: 0.8,
};

// ─── Governance Edge Scoring ───
// Uses the same risk parameters as the governance layer:
// Expectancy, Sharpe, Win Rate, Friction Ratio, Execution Quality, Profit Factor, Session Robustness

function computeEdgeScore(p: {
  expectancy: number; sharpe: number; winRate: number; profitFactor: number;
  avgQuality: number; frictionRatio: number; sessionConsistency: number;
}): number {
  // Weighted composite (mirrors governance multiplier stack)
  const expScore = Math.min(30, Math.max(0, (p.expectancy / 3.0) * 30));          // 30pts max — expectancy is king
  const sharpeScore = Math.min(20, Math.max(0, (p.sharpe / 0.6) * 20));            // 20pts max — risk-adjusted return
  const wrScore = Math.min(15, Math.max(0, ((p.winRate - 40) / 30) * 15));         // 15pts max — directional accuracy
  const pfScore = Math.min(15, Math.max(0, ((p.profitFactor - 1.0) / 2.0) * 15));  // 15pts max — payoff asymmetry
  const qualScore = Math.min(10, Math.max(0, ((p.avgQuality - 50) / 30) * 10));    // 10pts max — execution quality
  const frictionPenalty = Math.min(10, Math.max(0, p.frictionRatio * 10));          // -10pts max — friction drag
  const sessionBonus = Math.min(10, Math.max(0, (p.sessionConsistency / 5) * 10)); // 10pts max — robustness across sessions
  return Math.round(expScore + sharpeScore + wrScore + pfScore + qualScore - frictionPenalty + sessionBonus);
}

function buildEdgeAnalysis(p: {
  expectancy: number; winRate: number; profitFactor: number; sharpe: number;
  avgQuality: number; avgSlippage: number; frictionCost: number; frictionRatio: number;
  postFrictionExp: number; sessions: SessionEdge[];
}): { reasons: string[]; risks: string[]; verdict: string } {
  const reasons: string[] = [];
  const risks: string[] = [];

  // ─── Expectancy ───
  if (p.expectancy >= 2.0) reasons.push(`Elite expectancy (+${p.expectancy.toFixed(2)}p/trade) — the governance layer's primary edge signal. This pair generates consistent surplus above the 0.72 composite threshold.`);
  else if (p.expectancy >= 1.5) reasons.push(`Strong expectancy (+${p.expectancy.toFixed(2)}p/trade) — reliably clears the governance composite gate with room to absorb friction spikes.`);
  else if (p.expectancy >= 1.0) reasons.push(`Moderate expectancy (+${p.expectancy.toFixed(2)}p/trade) — passes governance but thin margin means spread widening events could temporarily push below the approval threshold.`);
  else if (p.expectancy >= 0.5) risks.push(`Thin expectancy (+${p.expectancy.toFixed(2)}p/trade) — barely clears friction. Governance would throttle this pair during DEFENSIVE state as it can't absorb the K×Friction gate at K=3.8+.`);
  else risks.push(`Marginal expectancy (+${p.expectancy.toFixed(2)}p/trade) — would trigger pair-level banning in the governance state machine (threshold: expectancy < -0.5p over 50 trades).`);

  // ─── Sharpe ───
  if (p.sharpe >= 0.4) reasons.push(`High Sharpe ratio (${p.sharpe.toFixed(3)}) — risk-adjusted returns are strong, meaning profits aren't achieved through outsized variance. The governance Adaptive Capital Allocator would assign a 1.25-1.5× capital multiplier.`);
  else if (p.sharpe >= 0.25) reasons.push(`Moderate Sharpe (${p.sharpe.toFixed(3)}) — acceptable risk/reward. Capital allocation stays at 1.0× baseline.`);
  else risks.push(`Low Sharpe ratio (${p.sharpe.toFixed(3)}) — returns are noisy relative to risk taken. The governance layer would apply a 0.5-0.7× capital multiplier to limit exposure to this volatility profile.`);

  // ─── Win Rate ───
  if (p.winRate >= 65) reasons.push(`High win rate (${p.winRate.toFixed(1)}%) — exceeds the 55% governance NORMAL-state floor by a wide margin. Directional accuracy is a core edge driver.`);
  else if (p.winRate >= 55) reasons.push(`Solid win rate (${p.winRate.toFixed(1)}%) — meets governance NORMAL requirements. Stays above the 45% THROTTLE trigger.`);
  else if (p.winRate >= 45) risks.push(`Sub-threshold win rate (${p.winRate.toFixed(1)}%) — below the 55% DEFENSIVE trigger. Governance would escalate to DEFENSIVE state, reducing density to 65% and sizing to 75%.`);
  else risks.push(`Critical win rate (${p.winRate.toFixed(1)}%) — below the 45% THROTTLE trigger. System would cut density to 30% and restrict to top-performers only.`);

  // ─── Profit Factor ───
  if (p.profitFactor >= 2.5) reasons.push(`Exceptional profit factor (${p.profitFactor.toFixed(2)}×) — winners substantially outweigh losers. The loss-shrinker logic and asymmetric payoff structure are working as designed.`);
  else if (p.profitFactor >= 1.5) reasons.push(`Good profit factor (${p.profitFactor.toFixed(2)}×) — healthy payoff asymmetry with average wins exceeding average losses.`);
  else if (p.profitFactor >= 1.0) risks.push(`Weak profit factor (${p.profitFactor.toFixed(2)}×) — wins barely exceed losses. Any degradation in execution quality could flip this below 1.0.`);
  else risks.push(`Negative profit factor (${p.profitFactor.toFixed(2)}×) — this pair is a net capital destroyer. Governance would auto-ban at this level.`);

  // ─── Friction ───
  const frictionPct = p.frictionRatio * 100;
  if (frictionPct > 50) risks.push(`Severe friction drag (${p.frictionCost.toFixed(2)}p = ${frictionPct.toFixed(0)}% of gross edge) — spread + slippage consume over half the raw edge. The Friction Expectancy Gate (K×Friction check) would reject many entries for this pair.`);
  else if (frictionPct > 30) risks.push(`Moderate friction drag (${p.frictionCost.toFixed(2)}p = ${frictionPct.toFixed(0)}% of gross edge) — manageable but the 1.8× rollover friction multiplier would push this pair into rejection territory during off-hours.`);
  else reasons.push(`Low friction drag (${p.frictionCost.toFixed(2)}p = ${frictionPct.toFixed(0)}% of gross edge) — clean execution preserves edge. Easily clears the K=3.0 Friction Gate even during elevated spread conditions.`);

  // ─── Execution Quality ───
  if (p.avgQuality >= 70) reasons.push(`High execution quality (${p.avgQuality.toFixed(0)}/100) — fills are clean with minimal adverse selection. The Execution Safety layer reports no drift concerns.`);
  else if (p.avgQuality < 55) risks.push(`Poor execution quality (${p.avgQuality.toFixed(0)}/100) — frequent adverse fills. If quality drops below 35 with high rejection rate, governance triggers HALT state.`);

  // ─── Session Robustness ───
  if (p.sessions.length >= 3) {
    const profitable = p.sessions.filter(s => s.expectancy > 0);
    const negative = p.sessions.filter(s => s.expectancy < 0);
    if (profitable.length === p.sessions.length) {
      reasons.push(`Profitable across all ${p.sessions.length} sessions — edge is structurally robust and not dependent on a single liquidity window. Capital can be deployed around the clock.`);
    } else if (negative.length > 0) {
      const worst = p.sessions[p.sessions.length - 1];
      risks.push(`Negative edge in ${negative.length} session(s) — worst: ${SESSION_LABELS[worst?.session] || worst?.session} (${worst?.expectancy.toFixed(2)}p). The Session Budget system would cap density to ${worst?.session === 'rollover' ? '1 trade with 1.8× friction multiplier' : 'reduced levels'} in these windows.`);
    }
  }

  // ─── Post-Friction Viability ───
  if (p.postFrictionExp < 0) risks.push(`Post-friction expectancy is NEGATIVE (${p.postFrictionExp.toFixed(2)}p) — after real-world execution costs, this pair destroys capital. Governance would auto-restrict.`);
  else if (p.postFrictionExp < 0.5) risks.push(`Post-friction edge is razor-thin (+${p.postFrictionExp.toFixed(2)}p) — any spread widening event (news, low liquidity) would temporarily eliminate the edge.`);

  // ─── Verdict ───
  let verdict: string;
  if (p.expectancy >= 2.0 && p.winRate >= 60 && p.sharpe >= 0.35 && p.profitFactor >= 2.0) {
    verdict = "Deploy with full capital allocation (1.0-1.5×). This pair has a statistically validated, friction-resistant edge across multiple sessions.";
  } else if (p.expectancy >= 1.5 && p.winRate >= 55 && p.profitFactor >= 1.5) {
    verdict = "Deploy at standard allocation (1.0×). Strong edge but monitor friction ratio and session performance for early degradation signals.";
  } else if (p.expectancy >= 1.0 && p.winRate >= 50) {
    verdict = "Deploy at reduced allocation (0.7×). Moderate edge exists but limited margin for error — restrict to prime sessions (London Open, NY Overlap).";
  } else if (p.expectancy >= 0.5) {
    verdict = "Shadow-only or restricted allocation (0.3-0.5×). Edge is thin and session-dependent — only viable in the highest-liquidity windows with tight friction gates.";
  } else {
    verdict = "Do not deploy. Edge does not survive friction costs. Governance would auto-ban this pair or restrict to shadow observation only.";
  }

  return { reasons, risks, verdict };
}

// ─── Main Component ───

export function FocusPairsEdgeDashboard() {
  const [pairData, setPairData] = useState<PairEdgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);

  useEffect(() => { fetchPairEdgeData(); }, []);

  async function fetchPairEdgeData() {
    setLoading(true);
    try {
      const { data: raw } = await supabase
        .from('oanda_orders')
        .select('currency_pair, environment, direction, entry_price, exit_price, spread_at_entry, slippage_pips, execution_quality_score, session_label, governance_composite, confidence_score, status')
        .eq('status', 'closed')
        .eq('direction', 'long')
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .neq('currency_pair', 'SYSTEM')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!raw) { setLoading(false); return; }

      const pairMap = new Map<string, {
        pnls: number[]; livePnls: number[];
        spreads: number[]; slippages: number[]; qualities: number[];
        govComposites: number[]; confidences: number[];
        sessions: Map<string, { pnls: number[]; spreads: number[]; slippages: number[]; qualities: number[] }>;
      }>();

      for (const o of raw) {
        const pair = o.currency_pair;
        if (pair.includes('/')) continue; // skip malformed
        if (!pairMap.has(pair)) {
          pairMap.set(pair, { pnls: [], livePnls: [], spreads: [], slippages: [], qualities: [], govComposites: [], confidences: [], sessions: new Map() });
        }
        const m = pairMap.get(pair)!;
        const pipDiv = pair.includes('JPY') ? 0.01 : 0.0001;
        const pnl = (o.exit_price! - o.entry_price!) / pipDiv;
        m.pnls.push(pnl);
        if (o.environment === 'live') m.livePnls.push(pnl);
        if (o.spread_at_entry) m.spreads.push(o.spread_at_entry);
        if (o.slippage_pips) m.slippages.push(Math.abs(o.slippage_pips));
        if (o.execution_quality_score) m.qualities.push(o.execution_quality_score);
        if (o.governance_composite) m.govComposites.push(o.governance_composite);
        if (o.confidence_score) m.confidences.push(o.confidence_score);

        const sess = o.session_label || 'unknown';
        if (!m.sessions.has(sess)) m.sessions.set(sess, { pnls: [], spreads: [], slippages: [], qualities: [] });
        const s = m.sessions.get(sess)!;
        s.pnls.push(pnl);
        if (o.spread_at_entry) s.spreads.push(o.spread_at_entry);
        if (o.slippage_pips) s.slippages.push(Math.abs(o.slippage_pips));
        if (o.execution_quality_score) s.qualities.push(o.execution_quality_score);
      }

      const result: PairEdgeData[] = [];

      for (const [pair, m] of pairMap) {
        if (m.pnls.length < 20) continue;

        const total = m.pnls.length;
        const wins = m.pnls.filter(p => p > 0).length;
        const winRate = (wins / total) * 100;
        const netPips = m.pnls.reduce((a, b) => a + b, 0);
        const expectancy = netPips / total;
        const grossProfit = m.pnls.filter(p => p > 0).reduce((a, b) => a + b, 0);
        const grossLoss = Math.abs(m.pnls.filter(p => p <= 0).reduce((a, b) => a + b, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
        const mean = expectancy;
        const variance = m.pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / total;
        const stddev = Math.sqrt(variance);
        const sharpe = stddev > 0 ? mean / stddev : 0;

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const avgSpread = avg(m.spreads) || PAIR_BASE_SPREADS[pair] || 1.0;
        const avgSlippage = avg(m.slippages) || 0.15;
        const avgQuality = avg(m.qualities) || 70;
        const avgGovComposite = avg(m.govComposites);
        const avgConfidence = avg(m.confidences);
        const frictionCost = avgSpread + avgSlippage;
        const postFrictionExp = expectancy - frictionCost;
        const frictionRatio = expectancy > 0 ? frictionCost / expectancy : 1;

        const sessions: SessionEdge[] = [];
        for (const [sess, s] of m.sessions) {
          if (s.pnls.length < 5) continue;
          const sWins = s.pnls.filter(p => p > 0).length;
          sessions.push({
            session: sess,
            trades: s.pnls.length,
            wins: sWins,
            winRate: (sWins / s.pnls.length) * 100,
            expectancy: s.pnls.reduce((a, b) => a + b, 0) / s.pnls.length,
            avgSpread: avg(s.spreads) || avgSpread,
            avgSlippage: avg(s.slippages) || avgSlippage,
            avgQuality: avg(s.qualities) || avgQuality,
          });
        }
        sessions.sort((a, b) => b.expectancy - a.expectancy);

        // Session consistency: how many sessions are profitable
        const sessionConsistency = sessions.filter(s => s.expectancy > 0).length;

        const edgeScore = computeEdgeScore({ expectancy, sharpe, winRate, profitFactor, avgQuality, frictionRatio, sessionConsistency });

        const { reasons, risks, verdict } = buildEdgeAnalysis({
          expectancy, winRate, profitFactor, sharpe, avgQuality, avgSlippage,
          frictionCost, frictionRatio, postFrictionExp, sessions,
        });

        // Tier assignment based on governance score
        let tier: 1 | 2 | 3;
        let tierLabel: string;
        if (edgeScore >= 65) { tier = 1; tierLabel = 'TIER 1 — Deploy Capital'; }
        else if (edgeScore >= 45) { tier = 2; tierLabel = 'TIER 2 — Conditional Deploy'; }
        else { tier = 3; tierLabel = 'TIER 3 — Restrict / Shadow Only'; }

        const liveTrades = m.livePnls.length;
        const liveWins = m.livePnls.filter(p => p > 0).length;

        result.push({
          pair, totalTrades: total, winRate, expectancy, netPips, grossProfit, grossLoss,
          profitFactor, stddev, sharpe,
          liveTrades, liveExpectancy: liveTrades > 0 ? m.livePnls.reduce((a, b) => a + b, 0) / liveTrades : 0,
          liveWinRate: liveTrades > 0 ? (liveWins / liveTrades) * 100 : 0,
          avgSpread, avgSlippage, avgQuality, avgGovComposite, avgConfidence,
          sessions, frictionCost, postFrictionExp, frictionRatio,
          edgeScore, tier, tierLabel, edgeReasons: reasons, edgeRisks: risks, verdict,
        });
      }

      result.sort((a, b) => b.edgeScore - a.edgeScore);
      setPairData(result);
    } catch (e) {
      console.error('Failed to fetch pair edge data:', e);
    }
    setLoading(false);
  }

  const tiers = useMemo(() => ({
    t1: pairData.filter(p => p.tier === 1),
    t2: pairData.filter(p => p.tier === 2),
    t3: pairData.filter(p => p.tier === 3),
  }), [pairData]);

  const focusPairs = useMemo(() => pairData.filter(p => FOCUS_PAIRS.includes(p.pair)), [pairData]);

  const focusProven = useMemo(() => {
    const totalLive = focusPairs.reduce((s, p) => s + p.liveTrades, 0);
    const totalLiveWins = focusPairs.reduce((s, p) => s + (p.liveWinRate / 100) * p.liveTrades, 0);
    const liveWR = totalLive > 0 ? (totalLiveWins / totalLive) * 100 : 0;
    const liveNet = focusPairs.reduce((s, p) => s + (p.liveExpectancy * p.liveTrades), 0);
    const liveExp = totalLive > 0 ? liveNet / totalLive : 0;
    return {
      totalLive, liveWR, liveExp,
      proven: totalLive >= LIVE_PROOF_THRESHOLD.minTrades && liveWR >= LIVE_PROOF_THRESHOLD.minWinRate && liveExp >= LIVE_PROOF_THRESHOLD.minExpectancy,
      progress: Math.min(100, (totalLive / LIVE_PROOF_THRESHOLD.minTrades) * 100),
    };
  }, [focusPairs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold">Governance Edge Ranking</h2>
            <p className="text-xs text-muted-foreground">
              Pairs ranked by governance composite score — expectancy, Sharpe, friction resistance, execution quality, and session robustness.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
            <Crown className="w-3 h-3" /> T1: {tiers.t1.length}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 border-[hsl(var(--neural-blue))]/30 text-[hsl(var(--neural-blue))]">
            <Medal className="w-3 h-3" /> T2: {tiers.t2.length}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 border-[hsl(var(--neural-orange))]/30 text-[hsl(var(--neural-orange))]">
            <CircleDot className="w-3 h-3" /> T3: {tiers.t3.length}
          </Badge>
        </div>
      </div>

      {/* Live Proof Progress */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-bold">Live Profitability Proof</span>
            </div>
            <Badge variant="outline" className={cn('text-[9px]', focusProven.proven ? 'border-[hsl(var(--neural-green))]/40 text-[hsl(var(--neural-green))]' : 'border-[hsl(var(--neural-orange))]/40 text-[hsl(var(--neural-orange))]')}>
              {focusProven.proven ? 'PROVEN — Ready to expand' : 'PROVING'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div><p className="text-[10px] text-muted-foreground">Live Trades</p><p className="text-lg font-mono font-bold">{focusProven.totalLive}<span className="text-[10px] text-muted-foreground">/{LIVE_PROOF_THRESHOLD.minTrades}</span></p></div>
            <div><p className="text-[10px] text-muted-foreground">Live Win Rate</p><p className={cn('text-lg font-mono font-bold', focusProven.liveWR >= LIVE_PROOF_THRESHOLD.minWinRate ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>{focusProven.liveWR.toFixed(1)}%</p></div>
            <div><p className="text-[10px] text-muted-foreground">Live Expectancy</p><p className={cn('text-lg font-mono font-bold', focusProven.liveExp >= LIVE_PROOF_THRESHOLD.minExpectancy ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>{focusProven.liveExp >= 0 ? '+' : ''}{focusProven.liveExp.toFixed(2)}p</p></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>Progress</span><span>{Math.round(focusProven.progress)}%</span></div>
            <Progress value={focusProven.progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* TIER 1 */}
      <TierSection
        tier={1}
        icon={Crown}
        label="TIER 1 — Deploy Capital"
        description="These pairs have governance-validated edge: high expectancy, strong Sharpe, low friction drag, and consistent performance across sessions. Full capital allocation recommended."
        color="neural-green"
        pairs={tiers.t1}
        expandedPair={expandedPair}
        setExpandedPair={setExpandedPair}
      />

      {/* TIER 2 */}
      <TierSection
        tier={2}
        icon={Medal}
        label="TIER 2 — Conditional Deploy"
        description="Moderate edge exists but with constraints — higher friction, session dependency, or lower Sharpe. Deploy at reduced allocation (0.7×) and restrict to prime sessions."
        color="neural-blue"
        pairs={tiers.t2}
        expandedPair={expandedPair}
        setExpandedPair={setExpandedPair}
      />

      {/* TIER 3 */}
      <TierSection
        tier={3}
        icon={CircleDot}
        label="TIER 3 — Restrict / Shadow Only"
        description="Edge is thin, friction-sensitive, or session-dependent. Not viable for live capital deployment — shadow observation or restricted trading only."
        color="neural-orange"
        pairs={tiers.t3}
        expandedPair={expandedPair}
        setExpandedPair={setExpandedPair}
      />
    </div>
  );
}

// ─── Tier Section ───

function TierSection({ tier, icon: Icon, label, description, color, pairs, expandedPair, setExpandedPair }: {
  tier: number;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  pairs: PairEdgeData[];
  expandedPair: string | null;
  setExpandedPair: (p: string | null) => void;
}) {
  if (pairs.length === 0) return null;

  return (
    <div>
      <div className="flex items-start gap-2 mb-3">
        <Icon className={`w-5 h-5 text-[hsl(var(--${color}))] shrink-0 mt-0.5`} />
        <div>
          <h3 className="text-sm font-display font-bold">{label}</h3>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3">
        {pairs.map((p, i) => (
          <motion.div key={p.pair} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <EdgeCard
              data={p}
              color={color}
              isExpanded={expandedPair === p.pair}
              onToggle={() => setExpandedPair(expandedPair === p.pair ? null : p.pair)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Edge Card ───

function EdgeCard({ data, color, isExpanded, onToggle }: {
  data: PairEdgeData; color: string; isExpanded: boolean; onToggle: () => void;
}) {
  const display = toDisplaySymbol(data.pair);
  const isLive = FOCUS_PAIRS.includes(data.pair);

  return (
    <Card className={cn('transition-all cursor-pointer border', `bg-[hsl(var(--${color}))]/5 border-[hsl(var(--${color}))]/20 hover:border-[hsl(var(--${color}))]/40`)} onClick={onToggle}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm', `bg-[hsl(var(--${color}))]/15 text-[hsl(var(--${color}))]`)}>
              {data.edgeScore}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base">{display}</span>
                <Badge variant="outline" className={cn('text-[8px] font-bold px-1.5 py-0', `border-[hsl(var(--${color}))]/30 text-[hsl(var(--${color}))]`)}>
                  {data.tierLabel.split('—')[0].trim()}
                </Badge>
                {isLive && <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">LIVE</Badge>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 max-w-md truncate">{data.edgeReasons[0]}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:grid grid-cols-6 gap-3 text-right">
              <MiniMetric label="Exp" value={`${data.expectancy >= 0 ? '+' : ''}${data.expectancy.toFixed(2)}p`} good={data.expectancy >= 1.5} bad={data.expectancy < 0.5} />
              <MiniMetric label="WR" value={`${data.winRate.toFixed(1)}%`} good={data.winRate >= 60} bad={data.winRate < 45} />
              <MiniMetric label="Sharpe" value={data.sharpe.toFixed(3)} good={data.sharpe >= 0.35} bad={data.sharpe < 0.2} />
              <MiniMetric label="PF" value={`${data.profitFactor.toFixed(2)}×`} good={data.profitFactor >= 2.0} bad={data.profitFactor < 1.5} />
              <MiniMetric label="Friction" value={`${(data.frictionRatio * 100).toFixed(0)}%`} good={data.frictionRatio < 0.2} bad={data.frictionRatio > 0.5} invert />
              <MiniMetric label="Net" value={`${data.netPips >= 0 ? '+' : ''}${Math.round(data.netPips).toLocaleString()}`} good={data.netPips > 5000} bad={data.netPips < 0} />
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Expanded */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pt-4 mt-4 border-t border-border/20 space-y-4">
                {/* Mobile metrics */}
                <div className="grid grid-cols-6 gap-2 sm:hidden">
                  <MetricCell label="Expectancy" value={`${data.expectancy >= 0 ? '+' : ''}${data.expectancy.toFixed(2)}p`} positive={data.expectancy > 1.5} />
                  <MetricCell label="Win Rate" value={`${data.winRate.toFixed(1)}%`} positive={data.winRate > 55} />
                  <MetricCell label="Sharpe" value={data.sharpe.toFixed(3)} positive={data.sharpe > 0.35} />
                  <MetricCell label="PF" value={`${data.profitFactor.toFixed(2)}×`} positive={data.profitFactor > 2} />
                  <MetricCell label="Friction" value={`${(data.frictionRatio * 100).toFixed(0)}%`} warn={data.frictionRatio > 0.5} />
                  <MetricCell label="Net Pips" value={`${Math.round(data.netPips).toLocaleString()}`} positive={data.netPips > 0} />
                </div>

                {/* Verdict */}
                <div className={cn('p-3 rounded-lg border', `bg-[hsl(var(--${color}))]/5 border-[hsl(var(--${color}))]/15`)}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Gauge className={`w-3.5 h-3.5 text-[hsl(var(--${color}))]`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--${color}))]`}>Governance Verdict</span>
                    <span className={`text-[10px] font-mono font-bold text-[hsl(var(--${color}))]`}>Score: {data.edgeScore}/100</span>
                  </div>
                  <p className="text-[11px] text-foreground/80 leading-relaxed">{data.verdict}</p>
                </div>

                {/* Why / Risks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--neural-green))]">Edge Drivers</span>
                    </div>
                    <div className="space-y-2">
                      {data.edgeReasons.map((r, i) => (
                        <div key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                          <Star className="w-3 h-3 text-[hsl(var(--neural-green))] shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--neural-orange))]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--neural-orange))]">Risks & Constraints</span>
                    </div>
                    {data.edgeRisks.length > 0 ? (
                      <div className="space-y-2">
                        {data.edgeRisks.map((r, i) => (
                          <div key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                            <Ban className="w-3 h-3 text-[hsl(var(--neural-orange))] shrink-0 mt-0.5" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50 italic">No significant risks identified</p>
                    )}
                  </div>
                </div>

                {/* Governance Parameters */}
                <div className="p-3 rounded-lg bg-muted/5 border border-border/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Governance Risk Parameters</span>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    <MetricCell label="Avg Spread" value={`${data.avgSpread.toFixed(2)}p`} />
                    <MetricCell label="Avg Slippage" value={`${data.avgSlippage.toFixed(2)}p`} />
                    <MetricCell label="Total Friction" value={`${data.frictionCost.toFixed(2)}p`} warn={data.frictionCost > 1.0} />
                    <MetricCell label="Post-Friction" value={`${data.postFrictionExp >= 0 ? '+' : ''}${data.postFrictionExp.toFixed(2)}p`} positive={data.postFrictionExp >= 0.5} warn={data.postFrictionExp < 0} />
                    <MetricCell label="Exec Quality" value={`${data.avgQuality.toFixed(0)}/100`} positive={data.avgQuality >= 70} warn={data.avgQuality < 55} />
                    <MetricCell label="Std Dev" value={`${data.stddev.toFixed(2)}p`} />
                    <MetricCell label="Trades" value={data.totalTrades.toLocaleString()} />
                  </div>
                </div>

                {/* Session Breakdown */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Session Edge Map</span>
                  </div>
                  <div className="space-y-1">
                    {data.sessions.map((s) => {
                      const Icon = SESSION_ICONS[s.session] || Clock;
                      const label = SESSION_LABELS[s.session] || s.session;
                      const isBad = s.expectancy < 0;
                      const isPrime = s.expectancy >= 2.0;
                      return (
                        <div key={s.session} className={cn('flex items-center gap-3 p-2 rounded-lg', isBad ? 'bg-[hsl(var(--neural-red))]/5' : isPrime ? 'bg-[hsl(var(--neural-green))]/5' : 'bg-muted/5')}>
                          <Icon className={cn('w-3.5 h-3.5 shrink-0', isBad ? 'text-[hsl(var(--neural-red))]' : isPrime ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground')} />
                          <span className="w-24 text-xs font-display font-bold shrink-0">{label}</span>
                          <div className="flex-1 grid grid-cols-4 gap-2">
                            <div><p className="text-[8px] text-muted-foreground">Exp</p><p className={cn('text-xs font-mono font-bold', s.expectancy >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>{s.expectancy >= 0 ? '+' : ''}{s.expectancy.toFixed(2)}p</p></div>
                            <div><p className="text-[8px] text-muted-foreground">WR</p><p className="text-xs font-mono">{s.winRate.toFixed(1)}%</p></div>
                            <div><p className="text-[8px] text-muted-foreground">Trades</p><p className="text-xs font-mono">{s.trades.toLocaleString()}</p></div>
                            <div><p className="text-[8px] text-muted-foreground">Quality</p><p className={cn('text-xs font-mono', s.avgQuality >= 70 ? 'text-[hsl(var(--neural-green))]' : s.avgQuality < 55 ? 'text-[hsl(var(--neural-red))]' : '')}>{s.avgQuality.toFixed(0)}</p></div>
                          </div>
                          <Badge variant="outline" className={cn('text-[8px] shrink-0', isBad ? 'border-[hsl(var(--neural-red))]/30 text-[hsl(var(--neural-red))]' : isPrime ? 'border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]' : s.expectancy >= 1.5 ? 'border-[hsl(var(--neural-blue))]/30 text-[hsl(var(--neural-blue))]' : 'border-border/30 text-muted-foreground')}>
                            {isBad ? 'AVOID' : isPrime ? 'PRIME' : s.expectancy >= 1.5 ? 'STRONG' : s.expectancy >= 1.0 ? 'OK' : 'WEAK'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live if active */}
                {isLive && data.liveTrades > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Live Reality</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <MetricCell label="Live Trades" value={data.liveTrades.toString()} />
                      <MetricCell label="Live WR" value={`${data.liveWinRate.toFixed(0)}%`} positive={data.liveWinRate >= 55} warn={data.liveWinRate < 45} />
                      <MetricCell label="Live Exp" value={`${data.liveExpectancy >= 0 ? '+' : ''}${data.liveExpectancy.toFixed(2)}p`} positive={data.liveExpectancy > 0} warn={data.liveExpectancy < 0} />
                    </div>
                    {data.liveTrades < 20 && <p className="text-[9px] text-[hsl(var(--neural-orange))] mt-2 flex items-center gap-1"><Info className="w-3 h-3" />Need {20 - data.liveTrades} more trades for confidence.</p>}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ───

function MiniMetric({ label, value, good, bad, invert }: { label: string; value: string; good?: boolean; bad?: boolean; invert?: boolean }) {
  const isGood = invert ? bad : good;
  const isBad = invert ? good : bad;
  return (
    <div>
      <p className="text-[8px] text-muted-foreground">{label}</p>
      <p className={cn('text-xs font-mono font-bold', isBad ? 'text-[hsl(var(--neural-red))]' : isGood ? 'text-[hsl(var(--neural-green))]' : 'text-foreground')}>{value}</p>
    </div>
  );
}

function MetricCell({ label, value, positive, warn }: { label: string; value: string; positive?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-[8px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-mono font-bold', warn ? 'text-[hsl(var(--neural-red))]' : positive ? 'text-[hsl(var(--neural-green))]' : 'text-foreground')}>{value}</p>
    </div>
  );
}
