// Internalization Alpha Tracker — tracks "Reclaimed Tax" from PREDATORY_LIMIT fills
// Shows pips stolen from the broker by filling better than mid-price

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingDown, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface AlphaEntry {
  id: string;
  pair: string;
  direction: string;
  requestedPrice: number;
  fillPrice: number;
  spreadAtEntry: number;
  alphaPips: number;
  timestamp: string;
}

const JPY_PAIRS = new Set(['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY']);

export function InternalizationAlphaTracker() {
  const [entries, setEntries] = useState<AlphaEntry[]>([]);
  const [totalAlpha, setTotalAlpha] = useState(0);
  const [avgAlpha, setAvgAlpha] = useState(0);
  const [tradesWithAlpha, setTradesWithAlpha] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, requested_price, entry_price, spread_at_entry, created_at')
        .not('requested_price', 'is', null)
        .not('entry_price', 'is', null)
        .not('spread_at_entry', 'is', null)
        .in('status', ['filled', 'closed'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (!data) { setLoading(false); return; }

      const alphaEntries: AlphaEntry[] = [];
      let total = 0;

      for (const row of data) {
        if (!row.requested_price || !row.entry_price || row.spread_at_entry == null) continue;

        const mult = JPY_PAIRS.has(row.currency_pair) ? 100 : 10000;

        // Alpha = difference between where we asked to fill and where we actually filled
        // Positive = we got a better price (internalization alpha)
        let alphaPips: number;
        if (row.direction === 'long') {
          // For longs, lower fill = better
          alphaPips = (row.requested_price - row.entry_price) * mult;
        } else {
          // For shorts, higher fill = better
          alphaPips = (row.entry_price - row.requested_price) * mult;
        }

        // Also count spread savings — if spread was lower than typical
        // We show both positive and negative alpha
        alphaPips = Math.round(alphaPips * 100) / 100;

        alphaEntries.push({
          id: row.id,
          pair: row.currency_pair,
          direction: row.direction,
          requestedPrice: row.requested_price,
          fillPrice: row.entry_price,
          spreadAtEntry: row.spread_at_entry,
          alphaPips,
          timestamp: row.created_at,
        });

        total += alphaPips;
      }

      setEntries(alphaEntries);
      setTotalAlpha(Math.round(total * 100) / 100);
      const withAlpha = alphaEntries.filter(e => e.alphaPips > 0);
      setTradesWithAlpha(withAlpha.length);
      setAvgAlpha(withAlpha.length > 0
        ? Math.round((withAlpha.reduce((s, e) => s + e.alphaPips, 0) / withAlpha.length) * 100) / 100
        : 0
      );
      setLoading(false);
    }

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="bg-card/80 border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Internalization Alpha</CardTitle>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
              Reclaimed Tax
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {loading ? (
          <div className="text-center text-muted-foreground text-xs py-4">Loading…</div>
        ) : (
          <>
            {/* Summary counters */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center p-2 rounded-md bg-muted/20 border border-border/20">
                <div className={`text-lg font-bold font-mono ${totalAlpha >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalAlpha >= 0 ? '+' : ''}{totalAlpha.toFixed(2)}
                </div>
                <div className="text-[9px] text-muted-foreground">Total Sovereign α (pips)</div>
              </div>
              <div className="text-center p-2 rounded-md bg-muted/20 border border-border/20">
                <div className="text-lg font-bold font-mono text-primary">
                  {avgAlpha.toFixed(2)}
                </div>
                <div className="text-[9px] text-muted-foreground">Avg α per Fill</div>
              </div>
              <div className="text-center p-2 rounded-md bg-muted/20 border border-border/20">
                <div className="text-lg font-bold font-mono text-foreground">
                  {tradesWithAlpha}/{entries.length}
                </div>
                <div className="text-[9px] text-muted-foreground">Positive α Rate</div>
              </div>
            </div>

            {/* Recent fills */}
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {entries.slice(0, 20).map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded hover:bg-muted/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">
                      {e.pair.replace('_', '/')}
                    </span>
                    <span className={e.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                      {e.direction.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground">
                      req:{e.requestedPrice.toFixed(5)} → fill:{e.fillPrice.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      spd:{e.spreadAtEntry.toFixed(1)}
                    </span>
                    <span className={`font-bold ${e.alphaPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {e.alphaPips >= 0 ? '+' : ''}{e.alphaPips.toFixed(2)}p
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {entries.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4">
                No fills with price data yet
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
