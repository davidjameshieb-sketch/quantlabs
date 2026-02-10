// Focus Pairs Edge Dashboard
// Shows active focus pairs edge, detailed edge quality breakdown for all pairs,
// and the unlock queue for future pairs.

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Lock, Unlock, TrendingUp, TrendingDown, Shield, Zap, Clock,
  BarChart3, AlertTriangle, ChevronDown, ChevronUp, Droplets, Gauge,
  Activity, Sun, Moon, Sunrise, Sunset, Star, Ban, Info,
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
  liveTrades: number;
  liveExpectancy: number;
  liveWinRate: number;
  avgSpread: number;
  avgSlippage: number;
  avgQuality: number;
  sessions: SessionEdge[];
  // derived
  edgeGrade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  edgeLabel: string;
  edgeColor: string;
  frictionCost: number;
  postFrictionExpectancy: number;
  bestSession: string;
  worstSession: string;
  edgeReasons: string[];
  edgeRisks: string[];
}

const FOCUS_PAIRS = ['EUR_USD', 'USD_CAD'];

const LIVE_PROOF_THRESHOLD = {
  minTrades: 20,
  minWinRate: 55,
  minExpectancy: 0.5,
};

const SESSION_ICONS: Record<string, React.ElementType> = {
  'london-open': Sunrise,
  'ny-overlap': Sun,
  'asian': Moon,
  'late-ny': Sunset,
  'rollover': Clock,
};

const SESSION_LABELS: Record<string, string> = {
  'london-open': 'London Open',
  'ny-overlap': 'NY Overlap',
  'asian': 'Asian',
  'late-ny': 'Late NY',
  'rollover': 'Rollover',
};

const PAIR_BASE_SPREADS: Record<string, number> = {
  EUR_USD: 0.6, GBP_USD: 0.9, USD_JPY: 0.7, AUD_USD: 0.8,
  USD_CAD: 1.0, EUR_JPY: 1.1, GBP_JPY: 1.5, EUR_GBP: 0.8,
  NZD_USD: 1.2, AUD_JPY: 1.3, USD_CHF: 1.0, EUR_CHF: 1.2,
  EUR_AUD: 1.6, GBP_AUD: 2.0, AUD_NZD: 1.8,
};

// ─── Edge grading logic ───

function gradeEdge(exp: number, winRate: number, avgQuality: number, frictionCost: number, postFrictionExp: number): {
  grade: PairEdgeData['edgeGrade'];
  label: string;
  color: string;
  reasons: string[];
  risks: string[];
} {
  const reasons: string[] = [];
  const risks: string[] = [];

  // Expectancy analysis
  if (exp >= 2.0) reasons.push(`Elite expectancy (+${exp.toFixed(2)}p) — each trade generates strong positive edge even after friction`);
  else if (exp >= 1.5) reasons.push(`Strong expectancy (+${exp.toFixed(2)}p) — consistently profitable with meaningful per-trade returns`);
  else if (exp >= 1.0) reasons.push(`Moderate expectancy (+${exp.toFixed(2)}p) — profitable but requires tight execution to maintain edge`);
  else if (exp >= 0.5) reasons.push(`Thin expectancy (+${exp.toFixed(2)}p) — barely covers friction costs, vulnerable to spread widening`);
  else if (exp > 0) reasons.push(`Marginal expectancy (+${exp.toFixed(2)}p) — edge exists but could evaporate under adverse conditions`);
  else reasons.push(`Negative expectancy (${exp.toFixed(2)}p) — this pair is currently destroying capital`);

  // Win rate analysis
  if (winRate >= 65) reasons.push(`High win rate (${winRate.toFixed(1)}%) — strong directional accuracy creates consistent returns`);
  else if (winRate >= 55) reasons.push(`Solid win rate (${winRate.toFixed(1)}%) — above breakeven with room for asymmetric payoffs`);
  else if (winRate >= 45) reasons.push(`Mixed win rate (${winRate.toFixed(1)}%) — relies on large winners to offset frequent small losses`);
  else risks.push(`Low win rate (${winRate.toFixed(1)}%) — losing more often than winning, requires outsized winners to compensate`);

  // Friction analysis
  if (frictionCost > 0) {
    const frictionPct = exp > 0 ? (frictionCost / exp) * 100 : 100;
    if (frictionPct > 60) risks.push(`High friction drag (${frictionCost.toFixed(2)}p per trade = ${frictionPct.toFixed(0)}% of gross edge) — spread and slippage consume most of the raw edge`);
    else if (frictionPct > 30) reasons.push(`Moderate friction (${frictionCost.toFixed(2)}p per trade = ${frictionPct.toFixed(0)}% of gross edge) — manageable but worth monitoring`);
    else reasons.push(`Low friction (${frictionCost.toFixed(2)}p per trade = ${frictionPct.toFixed(0)}% of gross edge) — clean execution preserves edge`);
  }

  // Execution quality
  if (avgQuality >= 70) reasons.push(`High execution quality (${avgQuality.toFixed(0)}/100) — fills are clean with minimal adverse selection`);
  else if (avgQuality >= 60) {} // neutral, don't mention
  else if (avgQuality >= 50) risks.push(`Below-average execution quality (${avgQuality.toFixed(0)}/100) — some fills are getting adversely selected`);
  else risks.push(`Poor execution quality (${avgQuality.toFixed(0)}/100) — frequent adverse fills are eroding returns`);

  // Post-friction viability
  if (postFrictionExp < 0.3 && exp > 0) risks.push(`Post-friction expectancy is thin (+${postFrictionExp.toFixed(2)}p) — real-world edge may not survive spread widening or volatility events`);
  if (postFrictionExp < 0) risks.push(`Post-friction expectancy is NEGATIVE (${postFrictionExp.toFixed(2)}p) — this pair loses money after accounting for execution costs`);

  // Grade
  let grade: PairEdgeData['edgeGrade'];
  let label: string;
  let color: string;

  if (exp >= 2.0 && winRate >= 60 && avgQuality >= 65) {
    grade = 'S'; label = 'Elite Edge'; color = 'text-[hsl(var(--neural-green))]';
  } else if (exp >= 1.5 && winRate >= 55) {
    grade = 'A'; label = 'Strong Edge'; color = 'text-[hsl(var(--neural-green))]';
  } else if (exp >= 1.0 && winRate >= 50) {
    grade = 'B'; label = 'Solid Edge'; color = 'text-[hsl(var(--neural-blue))]';
  } else if (exp >= 0.5 && winRate >= 45) {
    grade = 'C'; label = 'Thin Edge'; color = 'text-[hsl(var(--neural-orange))]';
  } else if (exp > 0) {
    grade = 'D'; label = 'Fragile Edge'; color = 'text-[hsl(var(--neural-orange))]';
  } else {
    grade = 'F'; label = 'No Edge'; color = 'text-[hsl(var(--neural-red))]';
  }

  return { grade, label, color, reasons, risks };
}

// ─── Main Component ───

export function FocusPairsEdgeDashboard() {
  const [pairData, setPairData] = useState<PairEdgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);

  useEffect(() => {
    fetchPairEdgeData();
  }, []);

  async function fetchPairEdgeData() {
    setLoading(true);
    try {
      const { data: raw } = await supabase
        .from('oanda_orders')
        .select('currency_pair, environment, direction, entry_price, exit_price, spread_at_entry, slippage_pips, execution_quality_score, session_label, status')
        .eq('status', 'closed')
        .eq('direction', 'long')
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .neq('currency_pair', 'SYSTEM')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!raw) { setLoading(false); return; }

      // Group by pair → session
      const pairMap = new Map<string, {
        total: number; wins: number; netPips: number;
        liveTrades: number; liveWins: number; liveNetPips: number;
        spreads: number[]; slippages: number[]; qualities: number[];
        sessions: Map<string, { trades: number; wins: number; netPips: number; spreads: number[]; slippages: number[]; qualities: number[] }>;
      }>();

      for (const o of raw) {
        const pair = o.currency_pair;
        if (!pairMap.has(pair)) {
          pairMap.set(pair, {
            total: 0, wins: 0, netPips: 0,
            liveTrades: 0, liveWins: 0, liveNetPips: 0,
            spreads: [], slippages: [], qualities: [],
            sessions: new Map(),
          });
        }
        const m = pairMap.get(pair)!;
        const pipDiv = pair.includes('JPY') ? 0.01 : 0.0001;
        const pnl = (o.exit_price! - o.entry_price!) / pipDiv;

        m.total++;
        if (pnl > 0) m.wins++;
        m.netPips += pnl;
        if (o.spread_at_entry) m.spreads.push(o.spread_at_entry);
        if (o.slippage_pips) m.slippages.push(Math.abs(o.slippage_pips));
        if (o.execution_quality_score) m.qualities.push(o.execution_quality_score);

        if (o.environment === 'live') {
          m.liveTrades++;
          if (pnl > 0) m.liveWins++;
          m.liveNetPips += pnl;
        }

        // Session tracking
        const sess = o.session_label || 'unknown';
        if (!m.sessions.has(sess)) {
          m.sessions.set(sess, { trades: 0, wins: 0, netPips: 0, spreads: [], slippages: [], qualities: [] });
        }
        const s = m.sessions.get(sess)!;
        s.trades++;
        if (pnl > 0) s.wins++;
        s.netPips += pnl;
        if (o.spread_at_entry) s.spreads.push(o.spread_at_entry);
        if (o.slippage_pips) s.slippages.push(Math.abs(o.slippage_pips));
        if (o.execution_quality_score) s.qualities.push(o.execution_quality_score);
      }

      const result: PairEdgeData[] = [];
      for (const [pair, m] of pairMap) {
        if (m.total < 5) continue; // skip noise pairs

        const winRate = m.total > 0 ? (m.wins / m.total) * 100 : 0;
        const expectancy = m.total > 0 ? m.netPips / m.total : 0;
        const avgSpread = m.spreads.length > 0 ? m.spreads.reduce((a, b) => a + b, 0) / m.spreads.length : PAIR_BASE_SPREADS[pair] || 1.0;
        const avgSlippage = m.slippages.length > 0 ? m.slippages.reduce((a, b) => a + b, 0) / m.slippages.length : 0.15;
        const avgQuality = m.qualities.length > 0 ? m.qualities.reduce((a, b) => a + b, 0) / m.qualities.length : 70;
        const frictionCost = avgSpread + avgSlippage;
        const postFrictionExpectancy = expectancy - frictionCost;

        const sessions: SessionEdge[] = [];
        for (const [sess, s] of m.sessions) {
          if (s.trades < 3) continue;
          sessions.push({
            session: sess,
            trades: s.trades,
            wins: s.wins,
            winRate: (s.wins / s.trades) * 100,
            expectancy: s.netPips / s.trades,
            avgSpread: s.spreads.length > 0 ? s.spreads.reduce((a, b) => a + b, 0) / s.spreads.length : avgSpread,
            avgSlippage: s.slippages.length > 0 ? s.slippages.reduce((a, b) => a + b, 0) / s.slippages.length : avgSlippage,
            avgQuality: s.qualities.length > 0 ? s.qualities.reduce((a, b) => a + b, 0) / s.qualities.length : avgQuality,
          });
        }
        sessions.sort((a, b) => b.expectancy - a.expectancy);

        const { grade, label, color, reasons, risks } = gradeEdge(expectancy, winRate, avgQuality, frictionCost, postFrictionExpectancy);

        // Best/worst session
        const bestSession = sessions.length > 0 ? sessions[0].session : 'unknown';
        const worstSession = sessions.length > 0 ? sessions[sessions.length - 1].session : 'unknown';

        // Session-specific reasons
        if (sessions.length > 1) {
          const best = sessions[0];
          const worst = sessions[sessions.length - 1];
          if (best.expectancy > expectancy * 1.2) {
            reasons.push(`Best session: ${SESSION_LABELS[best.session] || best.session} (+${best.expectancy.toFixed(2)}p, ${best.winRate.toFixed(0)}% WR) — ${best.expectancy > 2.0 ? 'dominant liquidity and tight spreads drive outsized returns' : 'above-average conditions improve fill quality'}`);
          }
          if (worst.expectancy < expectancy * 0.5 || worst.expectancy < 0) {
            risks.push(`Worst session: ${SESSION_LABELS[worst.session] || worst.session} (${worst.expectancy >= 0 ? '+' : ''}${worst.expectancy.toFixed(2)}p, ${worst.winRate.toFixed(0)}% WR) — ${worst.expectancy < 0 ? 'negative edge from wide spreads and low liquidity destroys profits made in other sessions' : 'weak returns from reduced market participation and poor fills'}`);
          }
        }

        result.push({
          pair, totalTrades: m.total, winRate, expectancy, netPips: m.netPips,
          liveTrades: m.liveTrades,
          liveExpectancy: m.liveTrades > 0 ? m.liveNetPips / m.liveTrades : 0,
          liveWinRate: m.liveTrades > 0 ? (m.liveWins / m.liveTrades) * 100 : 0,
          avgSpread, avgSlippage, avgQuality, sessions,
          edgeGrade: grade, edgeLabel: label, edgeColor: color,
          frictionCost, postFrictionExpectancy: postFrictionExpectancy,
          bestSession, worstSession,
          edgeReasons: reasons, edgeRisks: risks,
        });
      }

      result.sort((a, b) => b.expectancy - a.expectancy);
      setPairData(result);
    } catch (e) {
      console.error('Failed to fetch pair edge data:', e);
    }
    setLoading(false);
  }

  const focusPairs = useMemo(() => pairData.filter(p => FOCUS_PAIRS.includes(p.pair)), [pairData]);
  const queuePairs = useMemo(() => pairData.filter(p => !FOCUS_PAIRS.includes(p.pair)), [pairData]);

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
            <h2 className="font-display text-lg font-bold">Edge Quality Map</h2>
            <p className="text-xs text-muted-foreground">
              Detailed edge breakdown for every pair — why they work, where they're weak, and what drives the edge.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Zap className="w-3 h-3" />
          {FOCUS_PAIRS.length} Active / {queuePairs.length} Queued
        </Badge>
      </div>

      {/* Live Proof Progress */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-bold">Live Profitability Proof</span>
            </div>
            <Badge
              variant="outline"
              className={cn('text-[9px]', focusProven.proven
                ? 'border-[hsl(var(--neural-green))]/40 text-[hsl(var(--neural-green))]'
                : 'border-[hsl(var(--neural-orange))]/40 text-[hsl(var(--neural-orange))]'
              )}
            >
              {focusProven.proven ? 'PROVEN — Ready to expand' : 'PROVING'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Live Trades</p>
              <p className="text-lg font-mono font-bold">{focusProven.totalLive}<span className="text-[10px] text-muted-foreground">/{LIVE_PROOF_THRESHOLD.minTrades}</span></p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Live Win Rate</p>
              <p className={cn('text-lg font-mono font-bold', focusProven.liveWR >= LIVE_PROOF_THRESHOLD.minWinRate ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>
                {focusProven.liveWR.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Live Expectancy</p>
              <p className={cn('text-lg font-mono font-bold', focusProven.liveExp >= LIVE_PROOF_THRESHOLD.minExpectancy ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]')}>
                {focusProven.liveExp >= 0 ? '+' : ''}{focusProven.liveExp.toFixed(2)}p
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Progress to unlock</span>
              <span>{Math.round(focusProven.progress)}%</span>
            </div>
            <Progress value={focusProven.progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Active Focus Pairs — Full Detail */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Unlock className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          <h3 className="text-sm font-display font-bold">Active Focus Pairs</h3>
        </div>
        <div className="space-y-3">
          {focusPairs.map((p, i) => (
            <motion.div key={p.pair} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <EdgeDetailCard
                data={p}
                isActive
                isExpanded={expandedPair === p.pair}
                onToggle={() => setExpandedPair(expandedPair === p.pair ? null : p.pair)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Unlock Queue — Full Detail */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-display font-bold">Unlock Queue — Edge Quality Ranked</h3>
          <span className="text-[10px] text-muted-foreground">— Click any pair to see detailed edge analysis</span>
        </div>
        <div className="space-y-3">
          {queuePairs.map((p, i) => (
            <motion.div key={p.pair} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <EdgeDetailCard
                data={p}
                isActive={false}
                isExpanded={expandedPair === p.pair}
                onToggle={() => setExpandedPair(expandedPair === p.pair ? null : p.pair)}
                rank={i + 1}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Edge Detail Card ───

function EdgeDetailCard({ data, isActive, isExpanded, onToggle, rank }: {
  data: PairEdgeData;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  rank?: number;
}) {
  const display = toDisplaySymbol(data.pair);

  const gradeBg: Record<string, string> = {
    S: 'bg-[hsl(var(--neural-green))]/10 border-[hsl(var(--neural-green))]/30',
    A: 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20',
    B: 'bg-[hsl(var(--neural-blue))]/5 border-[hsl(var(--neural-blue))]/20',
    C: 'bg-[hsl(var(--neural-orange))]/5 border-[hsl(var(--neural-orange))]/20',
    D: 'bg-[hsl(var(--neural-orange))]/5 border-[hsl(var(--neural-orange))]/15',
    F: 'bg-[hsl(var(--neural-red))]/5 border-[hsl(var(--neural-red))]/20',
  };

  const gradeBadgeBg: Record<string, string> = {
    S: 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/40',
    A: 'bg-[hsl(var(--neural-green))]/15 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30',
    B: 'bg-[hsl(var(--neural-blue))]/15 text-[hsl(var(--neural-blue))] border-[hsl(var(--neural-blue))]/30',
    C: 'bg-[hsl(var(--neural-orange))]/15 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30',
    D: 'bg-[hsl(var(--neural-orange))]/10 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/20',
    F: 'bg-[hsl(var(--neural-red))]/15 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30',
  };

  return (
    <Card className={cn('transition-all cursor-pointer', gradeBg[data.edgeGrade])} onClick={onToggle}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {rank != null && (
              <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground shrink-0">
                {rank}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base">{display}</span>
                <Badge variant="outline" className={cn('text-[9px] font-bold px-2 py-0', gradeBadgeBg[data.edgeGrade])}>
                  {data.edgeGrade}-TIER · {data.edgeLabel}
                </Badge>
                {isActive && (
                  <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
                    LIVE
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {data.totalTrades.toLocaleString()} trades · {data.edgeReasons[0]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Key metrics */}
            <div className="hidden sm:grid grid-cols-4 gap-4 text-right">
              <div>
                <p className="text-[8px] text-muted-foreground">Expectancy</p>
                <p className={cn('text-sm font-mono font-bold', data.edgeColor)}>
                  {data.expectancy >= 0 ? '+' : ''}{data.expectancy.toFixed(2)}p
                </p>
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground">Win Rate</p>
                <p className="text-sm font-mono font-bold">{data.winRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground">Net Pips</p>
                <p className={cn('text-sm font-mono font-bold', data.netPips >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
                  {data.netPips >= 0 ? '+' : ''}{Math.round(data.netPips).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground">Post-Friction</p>
                <p className={cn('text-sm font-mono font-bold', data.postFrictionExpectancy >= 0.5 ? 'text-[hsl(var(--neural-green))]' : data.postFrictionExpectancy >= 0 ? 'text-[hsl(var(--neural-orange))]' : 'text-[hsl(var(--neural-red))]')}>
                  {data.postFrictionExpectancy >= 0 ? '+' : ''}{data.postFrictionExpectancy.toFixed(2)}p
                </p>
              </div>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Expanded Detail */}
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
                {/* Mobile metrics (shown only on small screens) */}
                <div className="grid grid-cols-4 gap-3 sm:hidden">
                  <MetricCell label="Expectancy" value={`${data.expectancy >= 0 ? '+' : ''}${data.expectancy.toFixed(2)}p`} positive={data.expectancy > 0} />
                  <MetricCell label="Win Rate" value={`${data.winRate.toFixed(1)}%`} positive={data.winRate > 55} />
                  <MetricCell label="Net Pips" value={`${data.netPips >= 0 ? '+' : ''}${Math.round(data.netPips).toLocaleString()}`} positive={data.netPips > 0} />
                  <MetricCell label="Post-Friction" value={`${data.postFrictionExpectancy >= 0 ? '+' : ''}${data.postFrictionExpectancy.toFixed(2)}p`} positive={data.postFrictionExpectancy > 0.5} warn={data.postFrictionExpectancy < 0} />
                </div>

                {/* WHY section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Edge Drivers */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--neural-green))]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--neural-green))]">Why This Edge Works</span>
                    </div>
                    <div className="space-y-1.5">
                      {data.edgeReasons.map((r, i) => (
                        <div key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                          <Star className="w-3 h-3 text-[hsl(var(--neural-green))] shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risks */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--neural-orange))]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--neural-orange))]">Edge Risks & Weaknesses</span>
                    </div>
                    {data.edgeRisks.length > 0 ? (
                      <div className="space-y-1.5">
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

                {/* Friction Breakdown */}
                <div className="p-3 rounded-lg bg-muted/5 border border-border/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Friction Analysis</span>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <MetricCell label="Avg Spread" value={`${data.avgSpread.toFixed(2)}p`} />
                    <MetricCell label="Avg Slippage" value={`${data.avgSlippage.toFixed(2)}p`} />
                    <MetricCell label="Total Friction" value={`${data.frictionCost.toFixed(2)}p`} warn={data.frictionCost > 1.5} />
                    <MetricCell label="Exec Quality" value={`${data.avgQuality.toFixed(0)}/100`} positive={data.avgQuality >= 70} warn={data.avgQuality < 55} />
                    <MetricCell label="Friction % of Edge" value={data.expectancy > 0 ? `${((data.frictionCost / data.expectancy) * 100).toFixed(0)}%` : '∞'} warn={data.expectancy > 0 && data.frictionCost / data.expectancy > 0.5} />
                  </div>
                </div>

                {/* Session Breakdown */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Session-Level Edge</span>
                    <span className="text-[9px] text-muted-foreground">— Where the edge is strongest and weakest</span>
                  </div>
                  <div className="space-y-1">
                    {data.sessions.map((s) => {
                      const Icon = SESSION_ICONS[s.session] || Clock;
                      const label = SESSION_LABELS[s.session] || s.session;
                      const isGood = s.expectancy >= data.expectancy;
                      const isBad = s.expectancy < 0;
                      return (
                        <div key={s.session} className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg',
                          isBad ? 'bg-[hsl(var(--neural-red))]/5' : isGood ? 'bg-[hsl(var(--neural-green))]/3' : 'bg-muted/5'
                        )}>
                          <Icon className={cn('w-3.5 h-3.5 shrink-0', isBad ? 'text-[hsl(var(--neural-red))]' : isGood ? 'text-[hsl(var(--neural-green))]' : 'text-muted-foreground')} />
                          <span className="w-24 text-xs font-display font-bold shrink-0">{label}</span>
                          <div className="flex-1 grid grid-cols-5 gap-2">
                            <div>
                              <p className="text-[8px] text-muted-foreground">Expectancy</p>
                              <p className={cn('text-xs font-mono font-bold', s.expectancy >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
                                {s.expectancy >= 0 ? '+' : ''}{s.expectancy.toFixed(2)}p
                              </p>
                            </div>
                            <div>
                              <p className="text-[8px] text-muted-foreground">Win Rate</p>
                              <p className="text-xs font-mono">{s.winRate.toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-muted-foreground">Trades</p>
                              <p className="text-xs font-mono">{s.trades.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-muted-foreground">Spread</p>
                              <p className="text-xs font-mono">{s.avgSpread.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-muted-foreground">Quality</p>
                              <p className={cn('text-xs font-mono', s.avgQuality >= 70 ? 'text-[hsl(var(--neural-green))]' : s.avgQuality < 55 ? 'text-[hsl(var(--neural-red))]' : '')}>
                                {s.avgQuality.toFixed(0)}
                              </p>
                            </div>
                          </div>
                          {/* Session verdict */}
                          <Badge variant="outline" className={cn('text-[8px] shrink-0',
                            isBad ? 'border-[hsl(var(--neural-red))]/30 text-[hsl(var(--neural-red))]'
                            : s.expectancy >= 2.0 ? 'border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]'
                            : s.expectancy >= 1.0 ? 'border-[hsl(var(--neural-blue))]/30 text-[hsl(var(--neural-blue))]'
                            : 'border-border/30 text-muted-foreground'
                          )}>
                            {isBad ? 'AVOID' : s.expectancy >= 2.0 ? 'PRIME' : s.expectancy >= 1.5 ? 'STRONG' : s.expectancy >= 1.0 ? 'OK' : 'WEAK'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live performance if available */}
                {isActive && data.liveTrades > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Live Execution Reality</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <MetricCell label="Live Trades" value={data.liveTrades.toString()} />
                      <MetricCell label="Live Win Rate" value={`${data.liveWinRate.toFixed(0)}%`} positive={data.liveWinRate >= 55} warn={data.liveWinRate < 45} />
                      <MetricCell label="Live Expectancy" value={`${data.liveExpectancy >= 0 ? '+' : ''}${data.liveExpectancy.toFixed(2)}p`} positive={data.liveExpectancy > 0} warn={data.liveExpectancy < 0} />
                    </div>
                    {data.liveTrades < 20 && (
                      <div className="flex items-center gap-1.5 mt-2 text-[9px] text-[hsl(var(--neural-orange))]">
                        <Info className="w-3 h-3" />
                        Small sample — need {Math.max(0, 20 - data.liveTrades)} more trades for statistical confidence.
                      </div>
                    )}
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

// ─── Metric Cell ───

function MetricCell({ label, value, positive, warn }: { label: string; value: string; positive?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-[8px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-mono font-bold',
        warn ? 'text-[hsl(var(--neural-red))]'
        : positive ? 'text-[hsl(var(--neural-green))]'
        : 'text-foreground'
      )}>
        {value}
      </p>
    </div>
  );
}
