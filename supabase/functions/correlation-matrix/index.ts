// Correlation Matrix + Currency Strength Heatmap — G19 Ripple Trigger
// Computes: 28-pair Pearson correlation, 8-currency strength index,
// Anchor Detection, Laggard Sniper, Divergence Kill-Switch
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// All 28 major/cross pairs for full 8x8 currency matrix
const ALL_PAIRS = [
  'EUR_USD','GBP_USD','USD_JPY','AUD_USD','NZD_USD','USD_CAD','USD_CHF',
  'EUR_GBP','EUR_JPY','EUR_AUD','EUR_NZD','EUR_CAD','EUR_CHF',
  'GBP_JPY','GBP_AUD','GBP_NZD','GBP_CAD','GBP_CHF',
  'AUD_JPY','AUD_NZD','AUD_CAD','AUD_CHF',
  'NZD_JPY','NZD_CAD','NZD_CHF',
  'CAD_JPY','CAD_CHF',
  'CHF_JPY',
];

const CURRENCIES = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'];

// Parse pair into base/quote currencies
function parsePair(pair: string): { base: string; quote: string } {
  const [base, quote] = pair.split('_');
  return { base, quote };
}

interface CorrelationEntry {
  pair1: string; pair2: string;
  pearson: number; rolling20: number; rolling50: number;
  decoupled: boolean; decouplingMagnitude: number;
  regime: string;
}

interface CurrencyStrength {
  currency: string;
  strength: number;       // aggregate pip change vs all others
  rank: number;           // 1=strongest, 8=weakest
  pairsUp: number;        // how many pairs this currency is gaining in
  pairsDown: number;
  totalPairs: number;
  sessionPips: number;    // total pip movement this session
  isAnchor: boolean;      // surging against 6+ currencies
  isWeakest: boolean;
}

interface LaggardSignal {
  loudCurrency: string;
  laggardPair: string;
  laggardMove: number;    // pips
  avgLoudMove: number;    // avg pips of the loud bloc
  gapPips: number;
  direction: 'long' | 'short';
  sizingMultiplier: number;
  signal: string;
}

interface AnchorSignal {
  anchorCurrency: string;
  anchorDirection: 'SURGING' | 'COLLAPSING';
  pairsAligned: number;
  laggardPair: string;
  laggardGapPips: number;
  frontRunDirection: 'long' | 'short';
  signal: string;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

function getRegime(r: number): string {
  if (r > 0.7) return 'STRONG_POS';
  if (r > 0.3) return 'WEAK_POS';
  if (r > -0.3) return 'NEUTRAL';
  if (r > -0.7) return 'WEAK_NEG';
  return 'STRONG_NEG';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_TOKEN = Deno.env.get('OANDA_LIVE_API_TOKEN') || Deno.env.get('OANDA_API_TOKEN');
    if (!OANDA_TOKEN) throw new Error('OANDA credentials missing');

    const BASE = 'https://api-fxtrade.oanda.com';
    const headers = { Authorization: `Bearer ${OANDA_TOKEN}` };

    // ═══ PHASE 1: Fetch candle data for all 28 pairs ═══
    const candleData: Record<string, { returns: number[]; closes: number[]; open: number; close: number; pipChange: number }> = {};

    const fetches = ALL_PAIRS.map(async (inst) => {
      try {
        const res = await fetch(
          `${BASE}/v3/instruments/${inst}/candles?granularity=H1&count=50&price=M`,
          { headers }
        );
        if (!res.ok) return;
        const data = await res.json();
        const candles = (data.candles || []).filter((c: any) => c.complete);
        const closes = candles.map((c: any) => parseFloat(c.mid.c));
        const returns: number[] = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }

        const isJpy = inst.includes('JPY');
        const pipMult = isJpy ? 100 : 10000;
        const sessionOpen = closes.length > 12 ? closes[closes.length - 12] : closes[0] || 0;
        const sessionClose = closes[closes.length - 1] || 0;
        const pipChange = (sessionClose - sessionOpen) * pipMult;

        candleData[inst] = { returns, closes, open: sessionOpen, close: sessionClose, pipChange };
      } catch { /* skip */ }
    });
    await Promise.all(fetches);

    // ═══ PHASE 2: Build Correlation Matrix ═══
    const matrix: CorrelationEntry[] = [];
    const decouplingAlerts: any[] = [];
    const instruments = Object.keys(candleData);

    const HISTORICAL: Record<string, number> = {
      'EUR_USD|GBP_USD': 0.85, 'EUR_USD|EUR_GBP': 0.60,
      'USD_JPY|EUR_JPY': 0.90, 'USD_JPY|GBP_JPY': 0.82,
      'AUD_USD|NZD_USD': 0.92, 'EUR_USD|USD_CAD': -0.78,
      'EUR_USD|USD_CHF': -0.90, 'GBP_USD|GBP_JPY': 0.65,
    };

    for (let i = 0; i < instruments.length; i++) {
      for (let j = i + 1; j < instruments.length; j++) {
        const p1 = instruments[i], p2 = instruments[j];
        const r1 = candleData[p1].returns, r2 = candleData[p2].returns;
        const full = pearsonCorrelation(r1, r2);
        const r20 = pearsonCorrelation(r1.slice(-20), r2.slice(-20));
        const r50 = pearsonCorrelation(r1.slice(-50), r2.slice(-50));

        const key = `${p1}|${p2}`;
        const reverseKey = `${p2}|${p1}`;
        const historical = HISTORICAL[key] ?? HISTORICAL[reverseKey] ?? null;
        const decouplingMag = historical !== null ? Math.abs(r20 - historical) : 0;
        const decoupled = decouplingMag > 0.25;

        matrix.push({
          pair1: p1, pair2: p2,
          pearson: Math.round(full * 1000) / 1000,
          rolling20: Math.round(r20 * 1000) / 1000,
          rolling50: Math.round(r50 * 1000) / 1000,
          decoupled, decouplingMagnitude: Math.round(decouplingMag * 1000) / 1000,
          regime: getRegime(r20),
        });

        if (decoupled && historical !== null) {
          decouplingAlerts.push({
            pair1: p1, pair2: p2,
            expectedCorr: historical, actualCorr: Math.round(r20 * 1000) / 1000,
            delta: Math.round((r20 - historical) * 1000) / 1000,
            signal: r20 > historical
              ? `${p1}/${p2} converging — mean reversion opportunity`
              : `${p1}/${p2} diverging — breakout or regime shift`,
            tradeable: decouplingMag > 0.35,
          });
        }
      }
    }

    // ═══ PHASE 3: Currency Strength Index ═══
    // For each currency, aggregate pip performance across all pairs it appears in
    const strengthMap: Record<string, { totalPips: number; up: number; down: number; total: number; pairMoves: { pair: string; pips: number }[] }> = {};
    for (const c of CURRENCIES) {
      strengthMap[c] = { totalPips: 0, up: 0, down: 0, total: 0, pairMoves: [] };
    }

    for (const [pair, data] of Object.entries(candleData)) {
      const { base, quote } = parsePair(pair);
      const pips = data.pipChange;

      // Base currency gains when pair goes up
      if (strengthMap[base]) {
        strengthMap[base].totalPips += pips;
        strengthMap[base].total++;
        if (pips > 0) strengthMap[base].up++; else strengthMap[base].down++;
        strengthMap[base].pairMoves.push({ pair, pips });
      }
      // Quote currency gains when pair goes down (inverse)
      if (strengthMap[quote]) {
        strengthMap[quote].totalPips -= pips;
        strengthMap[quote].total++;
        if (pips < 0) strengthMap[quote].up++; else strengthMap[quote].down++;
        strengthMap[quote].pairMoves.push({ pair, pips: -pips });
      }
    }

    // Rank currencies
    const ranked = CURRENCIES
      .map(c => ({ currency: c, ...strengthMap[c] }))
      .sort((a, b) => b.totalPips - a.totalPips);

    const currencyStrengths: CurrencyStrength[] = ranked.map((r, idx) => ({
      currency: r.currency,
      strength: Math.round(r.totalPips * 10) / 10,
      rank: idx + 1,
      pairsUp: r.up,
      pairsDown: r.down,
      totalPairs: r.total,
      sessionPips: Math.round(r.totalPips * 10) / 10,
      isAnchor: r.up >= 6 || r.down >= 6, // surging/collapsing against 6+ pairs
      isWeakest: idx === ranked.length - 1,
    }));

    // ═══ PHASE 4: G19-A Anchor Detection ═══
    const anchorSignals: AnchorSignal[] = [];

    for (const cs of currencyStrengths) {
      if (!cs.isAnchor) continue;
      const isSurging = cs.pairsUp >= 6;
      const moves = strengthMap[cs.currency].pairMoves;
      const avgMove = moves.reduce((s, m) => s + Math.abs(m.pips), 0) / Math.max(moves.length, 1);

      // Find the laggard — the pair that hasn't moved yet
      const sortedMoves = [...moves].sort((a, b) => Math.abs(a.pips) - Math.abs(b.pips));
      const laggard = sortedMoves[0];
      if (!laggard || Math.abs(laggard.pips) >= avgMove * 0.5) continue; // no clear laggard

      anchorSignals.push({
        anchorCurrency: cs.currency,
        anchorDirection: isSurging ? 'SURGING' : 'COLLAPSING',
        pairsAligned: isSurging ? cs.pairsUp : cs.pairsDown,
        laggardPair: laggard.pair,
        laggardGapPips: Math.round((avgMove - Math.abs(laggard.pips)) * 10) / 10,
        frontRunDirection: isSurging ? 'long' : 'short',
        signal: `G19 ANCHOR: ${cs.currency} ${isSurging ? 'surging' : 'collapsing'} vs ${isSurging ? cs.pairsUp : cs.pairsDown}/7 currencies. Laggard: ${laggard.pair} (only ${Math.abs(laggard.pips).toFixed(1)}p vs avg ${avgMove.toFixed(1)}p). Front-run ${isSurging ? 'long' : 'short'}.`,
      });
    }

    // ═══ PHASE 5: G19-B Laggard Sniper ═══
    const laggardSignals: LaggardSignal[] = [];

    // Check each currency bloc for "loud move + quiet pair"
    for (const currency of CURRENCIES) {
      const moves = strengthMap[currency].pairMoves;
      if (moves.length < 3) continue;

      // Check if bloc is "loud" (3+ pairs moving > 15 pips same direction)
      const loudMoves = moves.filter(m => Math.abs(m.pips) > 15);
      if (loudMoves.length < 3) continue;

      const avgLoudPips = loudMoves.reduce((s, m) => s + m.pips, 0) / loudMoves.length;
      const loudDirection = avgLoudPips > 0; // true = currency strengthening

      // Find the quiet pair
      const quietMoves = moves.filter(m => Math.abs(m.pips) < 5);
      for (const quiet of quietMoves) {
        const gapPips = Math.abs(avgLoudPips) - Math.abs(quiet.pips);
        if (gapPips < 10) continue;

        const { base, quote } = parsePair(quiet.pair);
        const isCurrencyBase = base === currency;

        // If currency is strengthening (loud moves up) and this pair hasn't moved,
        // we expect it to catch up in the same direction
        const direction: 'long' | 'short' = loudDirection
          ? (isCurrencyBase ? 'long' : 'short')
          : (isCurrencyBase ? 'short' : 'long');

        laggardSignals.push({
          loudCurrency: currency,
          laggardPair: quiet.pair,
          laggardMove: Math.round(quiet.pips * 10) / 10,
          avgLoudMove: Math.round(avgLoudPips * 10) / 10,
          gapPips: Math.round(gapPips * 10) / 10,
          direction,
          sizingMultiplier: 1.5,
          signal: `G19 LAGGARD: ${currency}-bloc flying (${loudMoves.length} pairs > 15p, avg ${avgLoudPips.toFixed(1)}p) but ${quiet.pair} flat (${quiet.pips.toFixed(1)}p). Strike ${direction} 1.5x.`,
        });
      }
    }

    // ═══ PHASE 6: Persist & Auto-inject Gate Bypasses ═══
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const now = new Date();

    // Persist correlation matrix
    await sb.from('sovereign_memory').upsert({
      memory_type: 'correlation_matrix',
      memory_key: 'live_pearson_heatmap',
      payload: { matrix, alerts: decouplingAlerts, instruments, generatedAt: now.toISOString() },
      relevance_score: 0.85,
      created_by: 'correlation-matrix',
    }, { onConflict: 'memory_type,memory_key' });

    // Persist currency strength index
    await sb.from('sovereign_memory').upsert({
      memory_type: 'currency_strength',
      memory_key: 'live_strength_index',
      payload: {
        strengths: currencyStrengths,
        anchorSignals,
        laggardSignals,
        strongest: currencyStrengths[0]?.currency,
        weakest: currencyStrengths[currencyStrengths.length - 1]?.currency,
        generatedAt: now.toISOString(),
      },
      relevance_score: 1.0,
      created_by: 'correlation-matrix',
    }, { onConflict: 'memory_type,memory_key' });

    // Auto-inject G19 gate bypasses for anchors and laggards
    const gatePromises: Promise<any>[] = [];

    for (const anchor of anchorSignals) {
      gatePromises.push(sb.from('gate_bypasses').upsert({
        gate_id: `G19_ANCHOR:${anchor.anchorCurrency}_${anchor.laggardPair}`,
        reason: JSON.stringify(anchor),
        expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
        pair: anchor.laggardPair,
        created_by: 'correlation-matrix',
      }, { onConflict: 'gate_id' }));
    }

    for (const laggard of laggardSignals) {
      gatePromises.push(sb.from('gate_bypasses').upsert({
        gate_id: `G19_LAGGARD:${laggard.loudCurrency}_${laggard.laggardPair}`,
        reason: JSON.stringify(laggard),
        expires_at: new Date(now.getTime() + 20 * 60_000).toISOString(),
        pair: laggard.laggardPair,
        created_by: 'correlation-matrix',
      }, { onConflict: 'gate_id' }));
    }

    // G19-C: Divergence Kill-Switch — write weakest currency gate
    const weakest = currencyStrengths[currencyStrengths.length - 1];
    const strongest = currencyStrengths[0];
    if (weakest && weakest.sessionPips < -20) {
      // Block all longs on pairs where the weakest currency is the base
      for (const pair of Object.keys(candleData)) {
        const { base } = parsePair(pair);
        if (base === weakest.currency) {
          gatePromises.push(sb.from('gate_bypasses').upsert({
            gate_id: `G19_DIVERGENCE_KILL:${pair}_block_long`,
            reason: JSON.stringify({
              type: 'G19_DIVERGENCE_KILL',
              weakestCurrency: weakest.currency,
              rank: weakest.rank,
              sessionPips: weakest.sessionPips,
              signal: `G19 KILL: ${weakest.currency} is weakest currency (rank 8, ${weakest.sessionPips.toFixed(1)}p). Blocking ${pair} longs.`,
            }),
            expires_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
            pair,
            created_by: 'correlation-matrix',
          }, { onConflict: 'gate_id' }));
        }
      }
      // Block all shorts on pairs where the weakest currency is the quote
      for (const pair of Object.keys(candleData)) {
        const { quote } = parsePair(pair);
        if (quote === weakest.currency) {
          gatePromises.push(sb.from('gate_bypasses').upsert({
            gate_id: `G19_DIVERGENCE_KILL:${pair}_block_short`,
            reason: JSON.stringify({
              type: 'G19_DIVERGENCE_KILL',
              weakestCurrency: weakest.currency,
              rank: weakest.rank,
              sessionPips: weakest.sessionPips,
              signal: `G19 KILL: ${weakest.currency} is weakest currency (rank 8, ${weakest.sessionPips.toFixed(1)}p). Blocking ${pair} shorts (would buy weakness).`,
            }),
            expires_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
            pair,
            created_by: 'correlation-matrix',
          }, { onConflict: 'gate_id' }));
        }
      }
    }

    await Promise.all(gatePromises);

    return new Response(JSON.stringify({
      success: true,
      pairsAnalyzed: matrix.length,
      currencyStrengths,
      anchorSignals,
      laggardSignals,
      decouplingAlerts: decouplingAlerts.length,
      g19Gates: {
        anchors: anchorSignals.length,
        laggards: laggardSignals.length,
        divergenceKills: weakest && weakest.sessionPips < -20 ? `${weakest.currency} blocked` : 'none',
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Correlation Matrix + G19 error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
