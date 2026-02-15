// Retail Stop-Hunt Radar — topographical visualization of OANDA order book stop clusters
// Shows "Gravity Wells" with G14 rule and limit order positioning

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, Mountain, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface StopCluster {
  price: number;
  percent: number;
  type: 'long' | 'short';
}

interface LiquidityMapEntry {
  pair: string;
  currentPrice: number | null;
  wallOfPainPrice: number | null;
  wallOfPainPct: number | null;
  wallOfPainType: string | null;
  topStopClusters: StopCluster[];
  longClusters: StopCluster[];
  shortClusters: StopCluster[];
  updatedAt: string;
}

export function RetailStopHuntRadar() {
  const [maps, setMaps] = useState<LiquidityMapEntry[]>([]);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('market_liquidity_map')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!data) { setLoading(false); return; }

      const entries: LiquidityMapEntry[] = data.map((row: any) => ({
        pair: row.currency_pair,
        currentPrice: row.current_price,
        wallOfPainPrice: row.wall_of_pain_price,
        wallOfPainPct: row.wall_of_pain_pct,
        wallOfPainType: row.wall_of_pain_type,
        topStopClusters: (row.top_stop_clusters || []) as StopCluster[],
        longClusters: (row.long_clusters || []) as StopCluster[],
        shortClusters: (row.short_clusters || []) as StopCluster[],
        updatedAt: row.updated_at,
      }));

      setMaps(entries);
      if (!selectedPair && entries.length > 0) setSelectedPair(entries[0].pair);
      setLoading(false);
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

  const selected = maps.find(m => m.pair === selectedPair);

  // Get all clusters for the selected pair, sorted by proximity to current price
  const allClusters = selected
    ? [...(selected.topStopClusters || []), ...(selected.longClusters || []).map(c => ({ ...c, type: 'long' as const })), ...(selected.shortClusters || []).map(c => ({ ...c, type: 'short' as const }))]
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 10)
    : [];

  const maxClusterPct = Math.max(...allClusters.map(c => c.percent), 1);

  return (
    <Card className="bg-card/80 border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-red-400" />
            <CardTitle className="text-sm font-semibold">Retail Stop-Hunt Radar</CardTitle>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-red-400/80 border-red-400/30">
              Gravity Wells
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {loading ? (
          <div className="text-center text-muted-foreground text-xs py-4">Loading…</div>
        ) : maps.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-8">
            <Mountain className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No order book data — Wall of Pain scanner offline
          </div>
        ) : (
          <>
            {/* Pair selector */}
            <div className="flex flex-wrap gap-1 mb-3">
              {maps.map(m => (
                <button
                  key={m.pair}
                  onClick={() => setSelectedPair(m.pair)}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all ${
                    selectedPair === m.pair
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : 'border-border/20 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.pair.replace('_', '/')}
                  {m.wallOfPainPct && m.wallOfPainPct > 2 && (
                    <AlertTriangle className="inline w-2 h-2 ml-0.5 text-orange-400" />
                  )}
                </button>
              ))}
            </div>

            {selected && (
              <div className="space-y-3">
                {/* Wall of Pain header */}
                {selected.wallOfPainPrice && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2">
                      <Mountain className="w-4 h-4 text-red-400" />
                      <div>
                        <div className="text-[10px] text-red-400 font-semibold">Wall of Pain</div>
                        <div className="text-[9px] text-muted-foreground">
                          {selected.wallOfPainType?.toUpperCase()} stops · {selected.wallOfPainPct?.toFixed(1)}% concentration
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-red-400">
                        {selected.wallOfPainPrice.toFixed(selected.pair.includes('JPY') ? 3 : 5)}
                      </div>
                      {selected.currentPrice && (
                        <div className="text-[9px] text-muted-foreground">
                          Current: {selected.currentPrice.toFixed(selected.pair.includes('JPY') ? 3 : 5)}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Topographical stop cluster visualization */}
                <div className="space-y-1">
                  <div className="text-[9px] text-muted-foreground mb-1">Stop Cluster Topology</div>
                  {allClusters.map((cluster, i) => {
                    const barWidth = (cluster.percent / maxClusterPct) * 100;
                    const isLong = cluster.type === 'long';
                    const distFromPrice = selected.currentPrice
                      ? Math.abs(cluster.price - selected.currentPrice)
                      : 0;
                    const isNearby = selected.currentPrice
                      ? distFromPrice / selected.currentPrice < 0.003 // within 0.3%
                      : false;

                    return (
                      <motion.div
                        key={`${cluster.price}-${cluster.type}-${i}`}
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex items-center gap-2 text-[9px] font-mono ${
                          isNearby ? 'bg-red-500/10 rounded px-1' : ''
                        }`}
                      >
                        <span className="w-20 text-right text-muted-foreground">
                          {cluster.price.toFixed(selected.pair.includes('JPY') ? 3 : 5)}
                        </span>
                        <div className="flex-1 h-3 bg-muted/10 rounded-sm overflow-hidden relative">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05 }}
                            className={`h-full rounded-sm ${
                              isLong
                                ? 'bg-gradient-to-r from-green-600/60 to-green-500/40'
                                : 'bg-gradient-to-r from-red-600/60 to-red-500/40'
                            } ${isNearby ? 'animate-pulse' : ''}`}
                          />
                          {isNearby && (
                            <div className="absolute right-1 top-0 h-full flex items-center">
                              <Crosshair className="w-2.5 h-2.5 text-yellow-400" />
                            </div>
                          )}
                        </div>
                        <span className={`w-10 text-right ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                          {cluster.percent.toFixed(1)}%
                        </span>
                        <span className="w-8 text-muted-foreground text-[8px]">
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {allClusters.length === 0 && (
                  <div className="text-center text-muted-foreground text-[10px] py-3">
                    No stop clusters mapped for {selected.pair}
                  </div>
                )}

                {/* Data freshness */}
                <div className="text-[8px] text-muted-foreground text-right">
                  Last scan: {new Date(selected.updatedAt).toLocaleTimeString()}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
