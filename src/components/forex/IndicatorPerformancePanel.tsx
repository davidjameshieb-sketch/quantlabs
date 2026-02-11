// Indicator Performance Panel — Analyzes which indicators correlate with winning trades
// Three views: Leaderboard, Per-Trade Breakdown, Best Combos per Pair

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  RefreshCw, TrendingUp, BarChart3, Target, Trophy,
  ArrowUpRight, ArrowDownRight, Minus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const INDICATOR_NAMES: Record<string, string> = {
  ema50: 'EMA-50',
  rsi: 'RSI',
  supertrend: 'Supertrend',
  parabolicSAR: 'Parabolic SAR',
  ichimoku: 'Ichimoku',
  adx: 'ADX',
  bollingerBands: 'Bollinger Bands',
  donchianChannels: 'Donchian',
  stochastics: 'Stochastics',
  cci: 'CCI',
  keltnerChannels: 'Keltner',
  roc: 'ROC',
  elderForce: 'Elder Force',
  heikinAshi: 'Heikin-Ashi',
  pivotPoints: 'Pivot Points',
  trendEfficiency: 'Trend Efficiency',
};

interface IndicatorStat {
  key: string;
  name: string;
  totalTrades: number;
  confirmedTrades: number;
  confirmedWins: number;
  confirmedWinRate: number;
  againstTrades: number;
  againstWins: number;
  againstWinRate: number;
  lift: number; // winRate when confirmed vs overall
}

interface PairCombo {
  pair: string;
  topIndicators: { name: string; winRate: number; trades: number }[];
  worstIndicators: { name: string; winRate: number; trades: number }[];
  bestCombo: string[];
  bestComboWinRate: number;
  bestComboTrades: number;
}

interface TradeIndicators {
  id: string;
  pair: string;
  direction: string;
  pips: number;
  won: boolean;
  indicators: Record<string, string>;
  consensus: number;
  createdAt: string;
}

export const IndicatorPerformancePanel = () => {
  const [trades, setTrades] = useState<TradeIndicators[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, entry_price, exit_price, governance_payload, created_at, status')
        .in('status', ['filled', 'closed'])
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null)
        .not('governance_payload', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!data) { setTrades([]); return; }

      const parsed: TradeIndicators[] = [];
      for (const o of data) {
        const gp = o.governance_payload as Record<string, unknown> | null;
        const breakdown = gp?.indicatorBreakdown as Record<string, string> | undefined;
        if (!breakdown) continue;

        const entry = o.entry_price as number;
        const exit = o.exit_price as number;
        const pair = o.currency_pair;
        const pipDiv = pair?.includes('JPY') ? 0.01 : 0.0001;
        const pips = o.direction === 'long' ? (exit - entry) / pipDiv : (entry - exit) / pipDiv;

        parsed.push({
          id: o.id,
          pair,
          direction: o.direction,
          pips: Math.round(pips * 10) / 10,
          won: pips > 0,
          indicators: breakdown,
          consensus: (gp?.indicatorConsensus as number) || 0,
          createdAt: o.created_at,
        });
      }
      setTrades(parsed);
    } catch (e) {
      console.error('Indicator fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrades(); }, []);

  // ── Compute Leaderboard ──
  const leaderboard = useMemo<IndicatorStat[]>(() => {
    if (trades.length === 0) return [];

    const overallWinRate = trades.filter(t => t.won).length / trades.length;
    const stats: IndicatorStat[] = [];

    for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
      let confirmedTrades = 0, confirmedWins = 0;
      let againstTrades = 0, againstWins = 0;

      for (const t of trades) {
        const sig = t.indicators[key];
        if (!sig) continue;

        const isConfirming = (
          (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
          (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
        );

        if (isConfirming) {
          confirmedTrades++;
          if (t.won) confirmedWins++;
        } else if (sig !== 'neutral') {
          againstTrades++;
          if (t.won) againstWins++;
        }
      }

      const confirmedWinRate = confirmedTrades > 0 ? confirmedWins / confirmedTrades : 0;
      const againstWinRate = againstTrades > 0 ? againstWins / againstTrades : 0;

      stats.push({
        key, name,
        totalTrades: confirmedTrades + againstTrades,
        confirmedTrades, confirmedWins, confirmedWinRate,
        againstTrades, againstWins, againstWinRate,
        lift: confirmedWinRate - overallWinRate,
      });
    }

    return stats.sort((a, b) => b.confirmedWinRate - a.confirmedWinRate);
  }, [trades]);

  // ── Compute Best Combos Per Pair ──
  const pairCombos = useMemo<PairCombo[]>(() => {
    if (trades.length === 0) return [];

    const pairMap = new Map<string, TradeIndicators[]>();
    for (const t of trades) {
      if (!pairMap.has(t.pair)) pairMap.set(t.pair, []);
      pairMap.get(t.pair)!.push(t);
    }

    const combos: PairCombo[] = [];
    for (const [pair, pairTrades] of pairMap) {
      if (pairTrades.length < 5) continue;

      // Per-indicator stats for this pair
      const indicatorStats: { name: string; winRate: number; trades: number }[] = [];
      for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
        let confirmed = 0, wins = 0;
        for (const t of pairTrades) {
          const sig = t.indicators[key];
          if (!sig || sig === 'neutral') continue;
          const isConfirming = (
            (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
            (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
          );
          if (isConfirming) { confirmed++; if (t.won) wins++; }
        }
        if (confirmed >= 3) {
          indicatorStats.push({ name, winRate: wins / confirmed, trades: confirmed });
        }
      }

      indicatorStats.sort((a, b) => b.winRate - a.winRate);
      const top = indicatorStats.slice(0, 3);
      const worst = [...indicatorStats].sort((a, b) => a.winRate - b.winRate).slice(0, 3);

      // Best 3-indicator combo
      const topKeys = top.map(t => {
        const entry = Object.entries(INDICATOR_NAMES).find(([, v]) => v === t.name);
        return entry?.[0] || '';
      }).filter(Boolean);

      let comboWins = 0, comboTotal = 0;
      for (const t of pairTrades) {
        const allConfirm = topKeys.every(k => {
          const sig = t.indicators[k];
          return (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
                 (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'));
        });
        if (allConfirm) { comboTotal++; if (t.won) comboWins++; }
      }

      combos.push({
        pair,
        topIndicators: top,
        worstIndicators: worst,
        bestCombo: top.map(t => t.name),
        bestComboWinRate: comboTotal > 0 ? comboWins / comboTotal : 0,
        bestComboTrades: comboTotal,
      });
    }

    return combos.sort((a, b) => b.bestComboWinRate - a.bestComboWinRate);
  }, [trades]);

  const noData = trades.length === 0 && !loading;

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Indicator Performance Analytics
            <Badge variant="outline" className="text-[9px]">{trades.length} trades analyzed</Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={fetchTrades} disabled={loading} className="h-7 text-xs gap-1">
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {noData ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No trades with indicator data yet. New trades will automatically track all 16 indicators.
          </p>
        ) : (
          <Tabs defaultValue="leaderboard" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="leaderboard" className="text-[10px]">Leaderboard</TabsTrigger>
              <TabsTrigger value="trades" className="text-[10px]">Per-Trade</TabsTrigger>
              <TabsTrigger value="combos" className="text-[10px]">Best Combos</TabsTrigger>
            </TabsList>

            {/* ── Leaderboard ── */}
            <TabsContent value="leaderboard" className="mt-3 space-y-1">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-2">
                Indicator Win Rate When Confirming Trade Direction
              </p>
              {leaderboard.map((ind, i) => (
                <div key={ind.key} className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
                  <span className={cn('text-xs font-bold w-5', i < 3 ? 'text-emerald-400' : 'text-muted-foreground')}>
                    #{i + 1}
                  </span>
                  {i === 0 && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                  <span className="text-xs font-medium flex-1">{ind.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn('text-xs font-mono font-bold',
                        ind.confirmedWinRate >= 0.55 ? 'text-emerald-400' :
                        ind.confirmedWinRate >= 0.45 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {(ind.confirmedWinRate * 100).toFixed(0)}%
                      </p>
                      <p className="text-[8px] text-muted-foreground">{ind.confirmedTrades} trades</p>
                    </div>
                    <Badge variant="outline" className={cn('text-[8px] w-14 justify-center',
                      ind.lift > 0.03 ? 'text-emerald-400 border-emerald-500/30' :
                      ind.lift < -0.03 ? 'text-red-400 border-red-500/30' :
                      'text-muted-foreground'
                    )}>
                      {ind.lift > 0 ? '+' : ''}{(ind.lift * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
              {leaderboard.length > 0 && (
                <p className="text-[8px] text-muted-foreground pt-1">
                  Lift = win rate above baseline ({(trades.filter(t => t.won).length / trades.length * 100).toFixed(0)}% overall).
                  Positive lift = indicator adds edge.
                </p>
              )}
            </TabsContent>

            {/* ── Per-Trade ── */}
            <TabsContent value="trades" className="mt-3">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-2">
                Recent Trades — Indicator States at Entry
              </p>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {trades.slice(0, 30).map(t => (
                  <div key={t.id}>
                    <div
                      className="p-2 rounded-lg border border-border/20 bg-background/30 cursor-pointer hover:bg-background/50 transition-colors"
                      onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[8px]',
                          t.won ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'
                        )}>
                          {t.won ? '+' : ''}{t.pips}p
                        </Badge>
                        <span className="text-xs font-mono">{t.pair}</span>
                        <Badge variant="outline" className="text-[8px]">{t.direction}</Badge>
                        <span className="text-[9px] text-muted-foreground ml-auto">
                          Consensus: {t.consensus}%
                        </span>
                        {expanded === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </div>
                    </div>
                    {expanded === t.id && (
                      <div className="p-2 border border-border/10 border-t-0 rounded-b-lg bg-background/20">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                          {Object.entries(t.indicators).map(([key, sig]) => {
                            const isConfirming = (
                              (t.direction === 'long' && (sig === 'bullish' || sig === 'oversold')) ||
                              (t.direction === 'short' && (sig === 'bearish' || sig === 'overbought'))
                            );
                            const isAgainst = sig !== 'neutral' && !isConfirming;
                            return (
                              <div key={key} className="flex items-center gap-1">
                                {isConfirming ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-400" /> :
                                 isAgainst ? <ArrowDownRight className="w-2.5 h-2.5 text-red-400" /> :
                                 <Minus className="w-2.5 h-2.5 text-muted-foreground" />}
                                <span className="text-[9px] font-mono truncate">
                                  {INDICATOR_NAMES[key] || key}
                                </span>
                                <span className={cn('text-[8px]',
                                  isConfirming ? 'text-emerald-400' :
                                  isAgainst ? 'text-red-400' : 'text-muted-foreground'
                                )}>{sig}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Best Combos Per Pair ── */}
            <TabsContent value="combos" className="mt-3 space-y-3">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-2">
                Best Indicator Combinations by Currency Pair
              </p>
              {pairCombos.map(pc => (
                <div key={pc.pair} className="p-2.5 rounded-lg border border-border/20 bg-background/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold font-mono">{pc.pair}</span>
                    {pc.bestComboTrades > 0 && (
                      <Badge className={cn('text-[8px]',
                        pc.bestComboWinRate >= 0.6 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      )}>
                        Best Combo: {(pc.bestComboWinRate * 100).toFixed(0)}% WR ({pc.bestComboTrades} trades)
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[8px] text-emerald-400 uppercase mb-1 font-bold">Top Performers</p>
                      {pc.topIndicators.map(ind => (
                        <div key={ind.name} className="flex items-center gap-1 text-[9px]">
                          <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="font-mono">{ind.name}</span>
                          <span className="text-emerald-400 ml-auto">{(ind.winRate * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground">({ind.trades})</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[8px] text-red-400 uppercase mb-1 font-bold">Noise / Weak</p>
                      {pc.worstIndicators.map(ind => (
                        <div key={ind.name} className="flex items-center gap-1 text-[9px]">
                          <Target className="w-2.5 h-2.5 text-red-400" />
                          <span className="font-mono">{ind.name}</span>
                          <span className="text-red-400 ml-auto">{(ind.winRate * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground">({ind.trades})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {pc.bestCombo.length > 0 && (
                    <p className="text-[8px] text-muted-foreground mt-1.5 border-t border-border/10 pt-1">
                      🏆 Best combo: <span className="text-primary font-mono">{pc.bestCombo.join(' + ')}</span>
                    </p>
                  )}
                </div>
              ))}
              {pairCombos.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Need more trades with indicator data to compute pair combos.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

export default IndicatorPerformancePanel;
