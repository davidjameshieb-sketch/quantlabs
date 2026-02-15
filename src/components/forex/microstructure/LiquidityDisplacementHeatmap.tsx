// Liquidity Displacement Heatmap — 28-pair interconnected grid
// Shows lead-lag displacement across correlation groups with pulsing strike zones

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchOandaLivePrices, type OandaPrice } from '@/lib/forex/oandaPricingService';

// Correlation groups — which pairs move together and which lag
const CORRELATION_GROUPS: Record<string, { loud: string[]; quiet: string[]; label: string; color: string }> = {
  EUR_BLOC: {
    loud: ['EUR_USD'],
    quiet: ['EUR_GBP', 'EUR_AUD', 'EUR_NZD', 'EUR_CAD', 'EUR_CHF', 'EUR_JPY'],
    label: 'EUR Bloc',
    color: 'hsl(220, 70%, 55%)',
  },
  USD_BLOC: {
    loud: ['EUR_USD', 'GBP_USD'],
    quiet: ['USD_CAD', 'USD_CHF', 'USD_JPY', 'AUD_USD', 'NZD_USD'],
    label: 'USD Bloc',
    color: 'hsl(140, 60%, 45%)',
  },
  JPY_CARRY: {
    loud: ['USD_JPY'],
    quiet: ['EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'],
    label: 'JPY Carry',
    color: 'hsl(35, 80%, 50%)',
  },
  GBP_BLOC: {
    loud: ['GBP_USD'],
    quiet: ['EUR_GBP', 'GBP_JPY', 'GBP_AUD', 'GBP_NZD', 'GBP_CAD', 'GBP_CHF'],
    label: 'GBP Bloc',
    color: 'hsl(280, 60%, 55%)',
  },
  COMMODITY: {
    loud: ['AUD_USD'],
    quiet: ['NZD_USD', 'AUD_NZD', 'AUD_JPY', 'AUD_CAD', 'NZD_JPY', 'NZD_CAD'],
    label: 'Commodity',
    color: 'hsl(15, 70%, 50%)',
  },
};

// All 28 major pairs
const ALL_PAIRS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD',
  'AUD_USD', 'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'EUR_CHF',
  'EUR_AUD', 'EUR_NZD', 'EUR_CAD', 'GBP_JPY', 'GBP_AUD',
  'GBP_NZD', 'GBP_CAD', 'GBP_CHF', 'AUD_JPY', 'AUD_NZD',
  'AUD_CAD', 'NZD_JPY', 'NZD_CAD', 'CAD_JPY', 'CAD_CHF',
  'CHF_JPY', 'NZD_CHF', 'USD_SGD',
];

const JPY_PAIRS = new Set(['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY']);

function pipsFromMid(pair: string, oldMid: number, newMid: number): number {
  const mult = JPY_PAIRS.has(pair) ? 100 : 10000;
  return (newMid - oldMid) * mult;
}

interface PairState {
  pair: string;
  mid: number;
  baselineMid: number;
  deltaPips: number;
  isLoud: boolean;
  groups: string[];
  lagCoeff: number; // 0 = moved with loud, 1 = hasn't moved at all
  strikeZone: boolean;
}

export function LiquidityDisplacementHeatmap() {
  const [prices, setPrices] = useState<Record<string, OandaPrice>>({});
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  const [pairStates, setPairStates] = useState<PairState[]>([]);
  const [strikeCount, setStrikeCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch prices every 3s
  const fetchPrices = useCallback(async () => {
    const p = await fetchOandaLivePrices();
    if (Object.keys(p).length === 0) return;
    setPrices(p);
    setLastUpdate(new Date());

    // Set baseline on first load
    setBaseline(prev => {
      if (Object.keys(prev).length === 0) {
        const b: Record<string, number> = {};
        for (const [k, v] of Object.entries(p)) b[k] = v.mid;
        return b;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 3000);
    return () => clearInterval(id);
  }, [fetchPrices]);

  // Calculate displacement states
  useEffect(() => {
    if (Object.keys(prices).length === 0 || Object.keys(baseline).length === 0) return;

    const states: PairState[] = [];

    for (const pair of ALL_PAIRS) {
      const price = prices[pair];
      const base = baseline[pair];
      if (!price || !base) continue;

      const deltaPips = pipsFromMid(pair, base, price.mid);

      // Determine if this pair is "loud" in any group
      const memberGroups: string[] = [];
      let isLoud = false;
      for (const [gid, g] of Object.entries(CORRELATION_GROUPS)) {
        if (g.loud.includes(pair) || g.quiet.includes(pair)) {
          memberGroups.push(gid);
          if (g.loud.includes(pair)) isLoud = true;
        }
      }

      // Calculate lag coefficient
      let lagCoeff = 0;
      if (!isLoud && memberGroups.length > 0) {
        // Find the loudest pair in our groups
        let maxLoudDelta = 0;
        for (const gid of memberGroups) {
          const group = CORRELATION_GROUPS[gid];
          for (const loudPair of group.loud) {
            const lp = prices[loudPair];
            const lb = baseline[loudPair];
            if (lp && lb) {
              const ld = Math.abs(pipsFromMid(loudPair, lb, lp.mid));
              maxLoudDelta = Math.max(maxLoudDelta, ld);
            }
          }
        }

        if (maxLoudDelta > 3) {
          // Loud pair moved significantly — how much has quiet pair responded?
          const quietResponse = Math.abs(deltaPips);
          lagCoeff = Math.max(0, Math.min(1, 1 - (quietResponse / maxLoudDelta)));
        }
      }

      const strikeZone = lagCoeff > 0.6 && !isLoud;

      states.push({
        pair,
        mid: price.mid,
        baselineMid: base,
        deltaPips: Math.round(deltaPips * 10) / 10,
        isLoud,
        groups: memberGroups,
        lagCoeff,
        strikeZone,
      });
    }

    // Sort: strike zones first, then by absolute displacement
    states.sort((a, b) => {
      if (a.strikeZone !== b.strikeZone) return a.strikeZone ? -1 : 1;
      return Math.abs(b.deltaPips) - Math.abs(a.deltaPips);
    });

    setPairStates(states);
    setStrikeCount(states.filter(s => s.strikeZone).length);
  }, [prices, baseline]);

  const resetBaseline = useCallback(() => {
    const b: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) b[k] = v.mid;
    setBaseline(b);
  }, [prices]);

  return (
    <Card className="bg-card/80 border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Liquidity Displacement Heatmap</CardTitle>
            {strikeCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 animate-pulse">
                <Target className="w-3 h-3 mr-0.5" />
                {strikeCount} Strike Zone{strikeCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetBaseline}
              className="text-[9px] text-muted-foreground hover:text-foreground px-2 py-0.5 border border-border/30 rounded"
            >
              Reset Baseline
            </button>
            {lastUpdate && (
              <span className="text-[9px] text-muted-foreground">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {pairStates.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-8">
            Waiting for live price feed…
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-1">
            <AnimatePresence>
              {pairStates.map((ps) => (
                <PairCell key={ps.pair} state={ps} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> Loud (Leading)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Quiet (Lagging)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Strike Zone
            </span>
          </div>
          <div className="flex gap-2 text-[9px] text-muted-foreground">
            {Object.values(CORRELATION_GROUPS).map(g => (
              <span key={g.label} className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                {g.label}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PairCell({ state }: { state: PairState }) {
  const { pair, deltaPips, isLoud, lagCoeff, strikeZone, groups } = state;

  // Color based on displacement
  const absDelta = Math.abs(deltaPips);
  const isPositive = deltaPips >= 0;

  // Background intensity based on lag coefficient for quiet pairs, delta for loud
  let bgOpacity = 0;
  let bgHue = isPositive ? 142 : 0; // green or red

  if (isLoud) {
    bgOpacity = Math.min(0.6, absDelta / 15);
  } else if (strikeZone) {
    bgHue = 0; // red for strike zone
    bgOpacity = 0.3 + lagCoeff * 0.4;
  } else {
    bgOpacity = Math.min(0.3, absDelta / 20);
  }

  // Group color indicator
  const groupColor = groups.length > 0 ? CORRELATION_GROUPS[groups[0]]?.color : undefined;

  const label = pair.replace('_', '/');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: strikeZone ? [1, 1.03, 1] : 1,
        transition: strikeZone
          ? { scale: { repeat: Infinity, duration: 1.5 } }
          : { duration: 0.3 },
      }}
      className={`
        relative rounded-md border p-1.5 text-center cursor-default transition-colors
        ${strikeZone
          ? 'border-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
          : isLoud
            ? 'border-yellow-500/40'
            : 'border-border/20'
        }
      `}
      style={{
        background: `hsla(${bgHue}, 70%, 50%, ${bgOpacity})`,
      }}
    >
      {/* Group indicator dot */}
      {groupColor && (
        <span
          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ background: groupColor }}
        />
      )}

      {/* Loud indicator */}
      {isLoud && (
        <Zap className="absolute top-0.5 left-0.5 w-2.5 h-2.5 text-yellow-400" />
      )}

      <div className="text-[9px] font-mono text-foreground/80 leading-none mb-0.5">
        {label}
      </div>
      <div className={`text-[11px] font-bold font-mono leading-none ${
        deltaPips > 0 ? 'text-green-400' : deltaPips < 0 ? 'text-red-400' : 'text-muted-foreground'
      }`}>
        {deltaPips > 0 ? '+' : ''}{deltaPips.toFixed(1)}
      </div>

      {/* Lag coefficient bar */}
      {!isLoud && lagCoeff > 0.1 && (
        <div className="mt-0.5 h-[2px] w-full rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              strikeZone ? 'bg-red-500' : 'bg-orange-400'
            }`}
            style={{ width: `${lagCoeff * 100}%` }}
          />
        </div>
      )}

      {strikeZone && (
        <div className="text-[7px] text-red-400 font-semibold mt-0.5 tracking-wider">
          STRIKE
        </div>
      )}
    </motion.div>
  );
}
