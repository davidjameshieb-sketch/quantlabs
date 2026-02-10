// Indicator Comparison Dashboard — Agent × Pair × Timeframe Matrix
// Live indicator computation across all forex pairs with consensus heatmap

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, Radar, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useForexIndicators } from '@/hooks/useForexIndicators';
import {
  ALL_FOREX_PAIRS,
  SCALPING_TIMEFRAMES,
  ALL_INDICATOR_NAMES,
  INDICATOR_LABELS,
  type IndicatorSnapshot,
  type IndicatorSet,
  type ScalpingTimeframe,
} from '@/lib/forex/indicatorTypes';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';

// Signal color mapping
const signalColor = (signal: string): string => {
  if (['bullish', 'trending', 'breakout_high', 'above_r1', 'oversold'].includes(signal)) return 'text-emerald-400';
  if (['bearish', 'ranging', 'breakout_low', 'below_s1', 'overbought'].includes(signal)) return 'text-red-400';
  return 'text-muted-foreground';
};

const signalIcon = (signal: string) => {
  if (['bullish', 'trending', 'breakout_high', 'above_r1', 'oversold'].includes(signal))
    return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (['bearish', 'ranging', 'breakout_low', 'below_s1', 'overbought'].includes(signal))
    return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

const consensusBg = (score: number): string => {
  if (score > 40) return 'bg-emerald-500/20 border-emerald-500/30';
  if (score > 20) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score < -40) return 'bg-red-500/20 border-red-500/30';
  if (score < -20) return 'bg-red-500/10 border-red-500/20';
  return 'bg-muted/20 border-border/30';
};

// Simulated agent mapping — which agents align with which indicator signals
const AGENT_INDICATOR_AFFINITY: Record<string, (keyof IndicatorSet)[]> = {
  'equities-alpha': ['ema50', 'supertrend', 'trendEfficiency', 'adx'],
  'forex-macro': ['ichimoku', 'pivotPoints', 'bollingerBands', 'donchianChannels'],
  'crypto-momentum': ['roc', 'elderForce', 'cci', 'stochastics'],
  'liquidity-radar': ['keltnerChannels', 'bollingerBands', 'donchianChannels'],
  'range-navigator': ['bollingerBands', 'stochastics', 'cci', 'keltnerChannels'],
  'volatility-architect': ['adx', 'trendEfficiency', 'bollingerBands', 'supertrend'],
  'adaptive-learner': ['ema50', 'rsi', 'supertrend', 'heikinAshi'],
  'sentiment-reactor': ['roc', 'elderForce', 'cci', 'rsi'],
  'fractal-intelligence': ['ichimoku', 'pivotPoints', 'donchianChannels', 'parabolicSAR'],
  'risk-sentinel': ['adx', 'trendEfficiency', 'rsi', 'bollingerBands'],
  'session-momentum': ['ema50', 'supertrend', 'roc', 'stochastics'],
  'carry-flow': ['ema50', 'supertrend', 'trendEfficiency', 'parabolicSAR'],
  'correlation-regime': ['ichimoku', 'adx', 'trendEfficiency', 'bollingerBands'],
  'spread-microstructure': ['keltnerChannels', 'bollingerBands', 'cci', 'pivotPoints'],
  'news-event-shield': ['rsi', 'cci', 'stochastics', 'elderForce'],
  'cross-asset-sync': ['ichimoku', 'ema50', 'adx', 'roc'],
  'execution-optimizer': ['parabolicSAR', 'supertrend', 'pivotPoints', 'keltnerChannels'],
  'regime-transition': ['adx', 'trendEfficiency', 'heikinAshi', 'bollingerBands'],
};

function computeAgentScore(snap: IndicatorSnapshot, agentId: string): { score: number; direction: string } {
  const affinity = AGENT_INDICATOR_AFFINITY[agentId] || ['ema50', 'rsi', 'supertrend'];
  let bullish = 0, bearish = 0;
  for (const ind of affinity) {
    const indicator = snap.indicators[ind];
    if (!indicator) continue;
    const sig = indicator.signal;
    if (['bullish', 'trending', 'oversold', 'breakout_high'].includes(sig)) bullish++;
    else if (['bearish', 'ranging', 'overbought', 'breakout_low'].includes(sig)) bearish++;
  }
  const score = affinity.length > 0 ? Math.round(((bullish - bearish) / affinity.length) * 100) : 0;
  return { score, direction: score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral' };
}

export const IndicatorComparisonDashboard = () => {
  const { snapshots, loading, error, progress, fetchBatch } = useForexIndicators();
  const [selectedTf, setSelectedTf] = useState<ScalpingTimeframe>('5m');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(ALL_FOREX_PAIRS.slice(0, 8)); // Start with majors
  const [subTab, setSubTab] = useState('heatmap');
  const [started, setStarted] = useState(false);

  const handleScan = useCallback(async () => {
    setStarted(true);
    await fetchBatch(selectedPairs, [...SCALPING_TIMEFRAMES]);
  }, [selectedPairs, fetchBatch]);

  const handleScanAll = useCallback(async () => {
    setStarted(true);
    setSelectedPairs(ALL_FOREX_PAIRS);
    await fetchBatch(ALL_FOREX_PAIRS, [...SCALPING_TIMEFRAMES]);
  }, [fetchBatch]);

  // Get snapshots for current timeframe
  const currentSnapshots = useMemo(() => {
    const result: Record<string, IndicatorSnapshot> = {};
    for (const pair of selectedPairs) {
      const key = `${pair}_${selectedTf}`;
      if (snapshots[key]) result[pair] = snapshots[key];
    }
    return result;
  }, [snapshots, selectedTf, selectedPairs]);

  // Ranked pairs by consensus
  const rankedPairs = useMemo(() => {
    return Object.entries(currentSnapshots)
      .map(([pair, snap]) => ({ pair, snap }))
      .sort((a, b) => Math.abs(b.snap.consensus.score) - Math.abs(a.snap.consensus.score));
  }, [currentSnapshots]);

  // Agent rankings
  const agentRankings = useMemo(() => {
    if (Object.keys(currentSnapshots).length === 0) return [];
    return ALL_AGENT_IDS.map(agentId => {
      let totalScore = 0;
      let pairScores: { pair: string; score: number; direction: string }[] = [];
      for (const [pair, snap] of Object.entries(currentSnapshots)) {
        const { score, direction } = computeAgentScore(snap, agentId);
        totalScore += score;
        pairScores.push({ pair, score, direction });
      }
      const avgScore = pairScores.length > 0 ? totalScore / pairScores.length : 0;
      return { agentId, avgScore, pairScores };
    }).sort((a, b) => Math.abs(b.avgScore) - Math.abs(a.avgScore));
  }, [currentSnapshots]);

  // Top ensemble agents
  const topAgents = useMemo(() => agentRankings.slice(0, 5), [agentRankings]);

  if (!started) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Radar className="w-12 h-12 text-primary/50" />
          <h3 className="font-display font-bold text-lg">Live Indicator Scanner</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Compute 16 technical indicators across all pairs × 3 timeframes from live OANDA candle data.
            Compare agents, identify consensus, and build the optimal ensemble.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleScan} className="gap-2">
              <Activity className="w-4 h-4" />Scan Majors (8 pairs)
            </Button>
            <Button variant="outline" onClick={handleScanAll} className="gap-2">
              <Layers className="w-4 h-4" />Scan All ({ALL_FOREX_PAIRS.length} pairs)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">
              Computing indicators... {progress.done}/{progress.total}
            </span>
          </div>
          <Progress value={(progress.done / Math.max(1, progress.total)) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Fetching candles from OANDA and computing 16 indicators per pair×timeframe...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Live Indicator Comparison</h2>
            <Badge variant="outline" className="text-[9px]">
              {Object.keys(snapshots).length} snapshots · 16 indicators
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedTf} onValueChange={(v) => setSelectedTf(v as ScalpingTimeframe)}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALPING_TIMEFRAMES.map(tf => (
                  <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleScan}>
              <RefreshCw className="w-3 h-3" />Rescan
            </Button>
          </div>
        </div>
      </motion.div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 text-xs text-red-400">{error}</CardContent>
        </Card>
      )}

      <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
          <TabsTrigger value="heatmap" className="text-xs gap-1"><BarChart3 className="w-3 h-3" />Consensus Heatmap</TabsTrigger>
          <TabsTrigger value="indicators" className="text-xs gap-1"><Activity className="w-3 h-3" />Indicator Matrix</TabsTrigger>
          <TabsTrigger value="agents" className="text-xs gap-1"><Radar className="w-3 h-3" />Agent Rankings</TabsTrigger>
          <TabsTrigger value="ensemble" className="text-xs gap-1"><Layers className="w-3 h-3" />Ensemble Builder</TabsTrigger>
        </TabsList>

        {/* Consensus Heatmap */}
        <TabsContent value="heatmap" className="space-y-4">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Pair × Timeframe Consensus</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/20">
                      <th className="text-left py-1 px-2">Pair</th>
                      {SCALPING_TIMEFRAMES.map(tf => (
                        <th key={tf} className="text-center py-1 px-2">{tf}</th>
                      ))}
                      <th className="text-center py-1 px-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPairs.map(pair => (
                      <tr key={pair} className="border-b border-border/10">
                        <td className="py-1.5 px-2 font-mono font-medium">{pair.replace('_', '/')}</td>
                        {SCALPING_TIMEFRAMES.map(tf => {
                          const key = `${pair}_${tf}`;
                          const snap = snapshots[key];
                          if (!snap) return <td key={tf} className="text-center py-1.5 px-2 text-muted-foreground">—</td>;
                          return (
                            <td key={tf} className="text-center py-1.5 px-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${consensusBg(snap.consensus.score)}`}>
                                {signalIcon(snap.consensus.direction)}
                                {snap.consensus.score > 0 ? '+' : ''}{snap.consensus.score}%
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center py-1.5 px-2 font-mono text-muted-foreground">
                          {snapshots[`${pair}_${selectedTf}`]?.lastPrice?.toFixed(pair.includes('JPY') ? 3 : 5) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Indicator Matrix */}
        <TabsContent value="indicators" className="space-y-4">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Full Indicator Breakdown — {selectedTf}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/20">
                      <th className="text-left py-1 px-1.5 sticky left-0 bg-card/90 z-10">Pair</th>
                      {ALL_INDICATOR_NAMES.map(ind => (
                        <th key={ind} className="text-center py-1 px-1 whitespace-nowrap">{INDICATOR_LABELS[ind]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rankedPairs.map(({ pair, snap }) => (
                      <tr key={pair} className="border-b border-border/10">
                        <td className="py-1 px-1.5 font-mono font-medium sticky left-0 bg-card/90 z-10">{pair.replace('_', '/')}</td>
                        {ALL_INDICATOR_NAMES.map(ind => {
                          const indicator = snap.indicators[ind];
                          if (!indicator) return <td key={ind} className="text-center py-1 px-1">—</td>;
                          return (
                            <td key={ind} className="text-center py-1 px-1">
                              <span className={`${signalColor(indicator.signal)} font-mono`}>
                                {indicator.signal.slice(0, 4)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Rankings */}
        <TabsContent value="agents" className="space-y-4">
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Agent Performance by Indicator Affinity — {selectedTf}</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/20">
                      <th className="text-left py-1 px-2">#</th>
                      <th className="text-left py-1 px-2">Agent</th>
                      <th className="text-center py-1 px-2">Avg Score</th>
                      <th className="text-left py-1 px-2">Indicators</th>
                      {selectedPairs.slice(0, 8).map(p => (
                        <th key={p} className="text-center py-1 px-1 whitespace-nowrap text-[10px]">{p.replace('_', '/')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agentRankings.map((agent, idx) => (
                      <tr key={agent.agentId} className={`border-b border-border/10 ${idx < 5 ? 'bg-primary/5' : ''}`}>
                        <td className="py-1.5 px-2 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-mono font-medium">{agent.agentId}</td>
                        <td className="text-center py-1.5 px-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${consensusBg(agent.avgScore)}`}>
                            {agent.avgScore > 0 ? '+' : ''}{Math.round(agent.avgScore)}%
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground text-[10px]">
                          {(AGENT_INDICATOR_AFFINITY[agent.agentId] || []).map(i => INDICATOR_LABELS[i]).join(', ')}
                        </td>
                        {selectedPairs.slice(0, 8).map(pair => {
                          const ps = agent.pairScores.find(p => p.pair === pair);
                          if (!ps) return <td key={pair} className="text-center py-1.5 px-1">—</td>;
                          return (
                            <td key={pair} className="text-center py-1.5 px-1">
                              <span className={`font-mono text-[10px] ${signalColor(ps.direction)}`}>
                                {ps.score > 0 ? '+' : ''}{ps.score}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ensemble Builder */}
        <TabsContent value="ensemble" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Agents */}
            <Card className="border-border/30 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Recommended Ensemble (Top 5)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {topAgents.map((agent, idx) => (
                  <div key={agent.agentId} className="flex items-center justify-between p-2 rounded border border-border/20 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-primary font-bold">#{idx + 1}</span>
                      <span className="text-xs font-mono font-medium">{agent.agentId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono ${agent.avgScore > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {agent.avgScore > 0 ? '+' : ''}{Math.round(agent.avgScore)}% avg
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {(AGENT_INDICATOR_AFFINITY[agent.agentId] || []).length} indicators
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Strongest Pair Signals */}
            <Card className="border-border/30 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Strongest Pair Signals — {selectedTf}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {rankedPairs.slice(0, 8).map(({ pair, snap }) => (
                  <div key={pair} className="flex items-center justify-between p-2 rounded border border-border/20 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium">{pair.replace('_', '/')}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {snap.lastPrice?.toFixed(pair.includes('JPY') ? 3 : 5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${consensusBg(snap.consensus.score)}`}>
                        {signalIcon(snap.consensus.direction)}
                        {snap.consensus.score > 0 ? '+' : ''}{snap.consensus.score}%
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {snap.consensus.bullishCount}B / {snap.consensus.bearishCount}S
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Ensemble Consensus Summary */}
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Ensemble Consensus by Timeframe</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4">
                {SCALPING_TIMEFRAMES.map(tf => {
                  const tfSnaps = selectedPairs.map(p => snapshots[`${p}_${tf}`]).filter(Boolean);
                  const avgScore = tfSnaps.length > 0
                    ? Math.round(tfSnaps.reduce((s, snap) => s + (snap?.consensus.score || 0), 0) / tfSnaps.length)
                    : 0;
                  const bullishPairs = tfSnaps.filter(s => s && s.consensus.direction === 'bullish').length;
                  const bearishPairs = tfSnaps.filter(s => s && s.consensus.direction === 'bearish').length;
                  return (
                    <div key={tf} className={`p-4 rounded-lg border ${consensusBg(avgScore)} text-center`}>
                      <div className="text-lg font-mono font-bold">{tf}</div>
                      <div className={`text-2xl font-mono font-bold ${avgScore > 0 ? 'text-emerald-400' : avgScore < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {avgScore > 0 ? '+' : ''}{avgScore}%
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {bullishPairs} bullish · {bearishPairs} bearish · {tfSnaps.length - bullishPairs - bearishPairs} neutral
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
