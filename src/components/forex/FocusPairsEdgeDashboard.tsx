// Focus Pairs Edge Dashboard
// Shows active focus pairs edge and the unlock queue for future pairs.

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import { Target, Lock, Unlock, TrendingUp, TrendingDown, Shield, Zap, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toDisplaySymbol } from '@/lib/forex/forexSymbolMap';

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
}

const FOCUS_PAIRS = ['EUR_USD', 'USD_CAD'];

// Profitability threshold to consider a pair "proven" in live
const LIVE_PROOF_THRESHOLD = {
  minTrades: 20,
  minWinRate: 55,
  minExpectancy: 0.5,
};

export function FocusPairsEdgeDashboard() {
  const [pairData, setPairData] = useState<PairEdgeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPairEdgeData();
  }, []);

  async function fetchPairEdgeData() {
    setLoading(true);
    try {
      // Fetch all long-only closed trades grouped by pair + environment
      const { data: raw } = await supabase
        .from('oanda_orders')
        .select('currency_pair, environment, direction, entry_price, exit_price, spread_at_entry, slippage_pips, status')
        .eq('status', 'closed')
        .eq('direction', 'long')
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!raw) { setLoading(false); return; }

      // Group by pair
      const pairMap = new Map<string, {
        total: number; wins: number; netPips: number;
        liveTrades: number; liveWins: number; liveNetPips: number;
        spreads: number[]; slippages: number[];
      }>();

      for (const o of raw) {
        const pair = o.currency_pair;
        if (pair === 'SYSTEM') continue;
        if (!pairMap.has(pair)) {
          pairMap.set(pair, { total: 0, wins: 0, netPips: 0, liveTrades: 0, liveWins: 0, liveNetPips: 0, spreads: [], slippages: [] });
        }
        const m = pairMap.get(pair)!;
        const pipDiv = pair.includes('JPY') ? 0.01 : 0.0001;
        const pnl = (o.exit_price! - o.entry_price!) / pipDiv;
        
        m.total++;
        if (pnl > 0) m.wins++;
        m.netPips += pnl;
        if (o.spread_at_entry) m.spreads.push(o.spread_at_entry);
        if (o.slippage_pips) m.slippages.push(o.slippage_pips);

        if (o.environment === 'live') {
          m.liveTrades++;
          if (pnl > 0) m.liveWins++;
          m.liveNetPips += pnl;
        }
      }

      const result: PairEdgeData[] = [];
      for (const [pair, m] of pairMap) {
        result.push({
          pair,
          totalTrades: m.total,
          winRate: m.total > 0 ? (m.wins / m.total) * 100 : 0,
          expectancy: m.total > 0 ? m.netPips / m.total : 0,
          netPips: m.netPips,
          liveTrades: m.liveTrades,
          liveExpectancy: m.liveTrades > 0 ? m.liveNetPips / m.liveTrades : 0,
          liveWinRate: m.liveTrades > 0 ? (m.liveWins / m.liveTrades) * 100 : 0,
          avgSpread: m.spreads.length > 0 ? m.spreads.reduce((a, b) => a + b, 0) / m.spreads.length : 0,
          avgSlippage: m.slippages.length > 0 ? m.slippages.reduce((a, b) => a + b, 0) / m.slippages.length : 0,
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
  const queuePairs = useMemo(() => pairData.filter(p => !FOCUS_PAIRS.includes(p.pair) && p.totalTrades > 10), [pairData]);

  // Determine if focus pairs are "proven" enough to unlock more
  const focusProven = useMemo(() => {
    const totalLive = focusPairs.reduce((s, p) => s + p.liveTrades, 0);
    const totalLiveWins = focusPairs.reduce((s, p) => s + (p.liveWinRate / 100) * p.liveTrades, 0);
    const liveWR = totalLive > 0 ? (totalLiveWins / totalLive) * 100 : 0;
    const liveNet = focusPairs.reduce((s, p) => s + (p.liveExpectancy * p.liveTrades), 0);
    const liveExp = totalLive > 0 ? liveNet / totalLive : 0;
    return {
      totalLive,
      liveWR,
      liveExp,
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
            <h2 className="font-display text-lg font-bold">Focus Pairs Edge Map</h2>
            <p className="text-xs text-muted-foreground">
              Proving edge on {FOCUS_PAIRS.map(p => toDisplaySymbol(p)).join(' & ')} before expanding the universe.
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
              className={`text-[9px] ${focusProven.proven ? 'border-[hsl(var(--neural-green))]/40 text-[hsl(var(--neural-green))]' : 'border-[hsl(var(--neural-orange))]/40 text-[hsl(var(--neural-orange))]'}`}
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
              <p className={`text-lg font-mono font-bold ${focusProven.liveWR >= LIVE_PROOF_THRESHOLD.minWinRate ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]'}`}>
                {focusProven.liveWR.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Live Expectancy</p>
              <p className={`text-lg font-mono font-bold ${focusProven.liveExp >= LIVE_PROOF_THRESHOLD.minExpectancy ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-orange))]'}`}>
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

      {/* Active Focus Pairs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Unlock className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          <h3 className="text-sm font-display font-bold">Active Focus Pairs</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {focusPairs.map((p, i) => (
            <motion.div key={p.pair} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <FocusPairCard data={p} isActive />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Unlock Queue */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-display font-bold">Unlock Queue</h3>
          <span className="text-[10px] text-muted-foreground">— Ranked by validated edge strength</span>
        </div>
        <div className="space-y-2">
          {queuePairs.map((p, i) => (
            <motion.div key={p.pair} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <QueuePairRow data={p} rank={i + 1} provenEnough={focusProven.proven} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function FocusPairCard({ data, isActive }: { data: PairEdgeData; isActive: boolean }) {
  const display = toDisplaySymbol(data.pair);
  const edgeStrength = data.expectancy >= 2.0 ? 'Strong' : data.expectancy >= 1.5 ? 'Solid' : data.expectancy >= 1.0 ? 'Moderate' : 'Thin';
  const edgeColor = data.expectancy >= 2.0 ? 'text-[hsl(var(--neural-green))]' : data.expectancy >= 1.5 ? 'text-[hsl(var(--neural-blue))]' : 'text-[hsl(var(--neural-orange))]';

  return (
    <Card className="bg-card/60 border-border/30 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold">{display}</span>
            <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
              ACTIVE
            </Badge>
          </div>
          <span className={`text-xs font-mono ${edgeColor}`}>{edgeStrength} Edge</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Backtest Edge */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <MetricCell label="Backtest Exp" value={`+${data.expectancy.toFixed(2)}p`} positive={data.expectancy > 0} />
          <MetricCell label="Win Rate" value={`${data.winRate.toFixed(1)}%`} positive={data.winRate > 55} />
          <MetricCell label="Net Pips" value={`${data.netPips > 0 ? '+' : ''}${Math.round(data.netPips).toLocaleString()}`} positive={data.netPips > 0} />
          <MetricCell label="Sample" value={data.totalTrades.toLocaleString()} />
        </div>

        {/* Live Performance */}
        <div className="pt-2 border-t border-border/20">
          <p className="text-[9px] text-muted-foreground mb-2 uppercase tracking-wider">Live Execution</p>
          <div className="grid grid-cols-4 gap-3">
            <MetricCell label="Trades" value={data.liveTrades.toString()} />
            <MetricCell label="Win Rate" value={data.liveTrades > 0 ? `${data.liveWinRate.toFixed(0)}%` : '—'} positive={data.liveWinRate > 50} warn={data.liveTrades > 0 && data.liveWinRate < 50} />
            <MetricCell label="Expectancy" value={data.liveTrades > 0 ? `${data.liveExpectancy >= 0 ? '+' : ''}${data.liveExpectancy.toFixed(2)}p` : '—'} positive={data.liveExpectancy > 0} warn={data.liveTrades > 0 && data.liveExpectancy < 0} />
            <MetricCell label="Avg Spread" value={data.avgSpread > 0 ? `${data.avgSpread.toFixed(2)}` : '—'} />
          </div>
          {data.liveTrades > 0 && data.liveTrades < 10 && (
            <div className="flex items-center gap-1.5 mt-2 text-[9px] text-[hsl(var(--neural-orange))]">
              <AlertTriangle className="w-3 h-3" />
              Small sample — {data.liveTrades} live trades. Need {Math.max(0, 20 - data.liveTrades)} more for statistical confidence.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QueuePairRow({ data, rank, provenEnough }: { data: PairEdgeData; rank: number; provenEnough: boolean }) {
  const display = toDisplaySymbol(data.pair);
  const edgeStrength = data.expectancy >= 2.0 ? 'Strong' : data.expectancy >= 1.5 ? 'Solid' : data.expectancy >= 1.0 ? 'Moderate' : data.expectancy >= 0.5 ? 'Thin' : 'Fragile';
  const edgeColor = data.expectancy >= 2.0 ? 'text-[hsl(var(--neural-green))]'
    : data.expectancy >= 1.5 ? 'text-[hsl(var(--neural-blue))]'
    : data.expectancy >= 1.0 ? 'text-foreground'
    : data.expectancy >= 0.5 ? 'text-[hsl(var(--neural-orange))]'
    : 'text-[hsl(var(--neural-red))]';

  const readyToUnlock = provenEnough && data.expectancy >= 1.5 && data.winRate >= 60;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${readyToUnlock ? 'bg-[hsl(var(--neural-green))]/5 border-[hsl(var(--neural-green))]/20' : 'bg-card/40 border-border/20'}`}>
      {/* Rank */}
      <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground shrink-0">
        {rank}
      </div>

      {/* Pair name */}
      <div className="w-20 shrink-0">
        <p className="text-sm font-display font-bold">{display}</p>
        <p className={`text-[9px] font-mono ${edgeColor}`}>{edgeStrength}</p>
      </div>

      {/* Metrics bar */}
      <div className="flex-1 grid grid-cols-5 gap-2">
        <div>
          <p className="text-[8px] text-muted-foreground">Expectancy</p>
          <p className={`text-xs font-mono font-bold ${data.expectancy >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'}`}>
            {data.expectancy >= 0 ? '+' : ''}{data.expectancy.toFixed(2)}p
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground">Win Rate</p>
          <p className="text-xs font-mono">{data.winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground">Net Pips</p>
          <p className={`text-xs font-mono ${data.netPips >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'}`}>
            {data.netPips >= 0 ? '+' : ''}{Math.round(data.netPips).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground">Trades</p>
          <p className="text-xs font-mono">{data.totalTrades.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground">Live</p>
          <p className="text-xs font-mono">{data.liveTrades > 0 ? `${data.liveTrades} trades` : '—'}</p>
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0">
        {readyToUnlock ? (
          <Badge variant="outline" className="text-[8px] border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))] gap-1">
            <Unlock className="w-2.5 h-2.5" />READY
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[8px] border-border/30 text-muted-foreground gap-1">
            <Lock className="w-2.5 h-2.5" />QUEUED
          </Badge>
        )}
      </div>
    </div>
  );
}

function MetricCell({ label, value, positive, warn }: { label: string; value: string; positive?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-[8px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono font-bold ${warn ? 'text-[hsl(var(--neural-red))]' : positive ? 'text-[hsl(var(--neural-green))]' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
