// Correlation Matrix Heatmap — 28-pair Pearson with Decoupling Alerts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAJORS = [
  'EUR_USD','GBP_USD','USD_JPY','AUD_USD','NZD_USD','USD_CAD','USD_CHF',
  'EUR_GBP','EUR_JPY','GBP_JPY','AUD_JPY','EUR_AUD','GBP_AUD','EUR_CAD',
];

interface CorrelationEntry {
  pair1: string;
  pair2: string;
  pearson: number;
  rolling20: number;
  rolling50: number;
  decoupled: boolean;
  decouplingMagnitude: number;
  regime: 'STRONG_POS' | 'WEAK_POS' | 'NEUTRAL' | 'WEAK_NEG' | 'STRONG_NEG';
}

interface DecouplingAlert {
  pair1: string;
  pair2: string;
  expectedCorr: number;
  actualCorr: number;
  delta: number;
  signal: string;
  tradeable: boolean;
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

function getRegime(r: number): CorrelationEntry['regime'] {
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

    // Fetch 50 candles for each instrument (H1)
    const candleData: Record<string, number[]> = {};

    const fetches = MAJORS.map(async (inst) => {
      try {
        const res = await fetch(
          `${BASE}/v3/instruments/${inst}/candles?granularity=H1&count=50&price=M`,
          { headers }
        );
        if (!res.ok) return;
        const data = await res.json();
        const closes = (data.candles || [])
          .filter((c: any) => c.complete)
          .map((c: any) => parseFloat(c.mid.c));
        // Convert to returns
        const returns: number[] = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
        candleData[inst] = returns;
      } catch { /* skip */ }
    });

    await Promise.all(fetches);

    // Build correlation matrix
    const matrix: CorrelationEntry[] = [];
    const alerts: DecouplingAlert[] = [];
    const instruments = Object.keys(candleData);

    // Known historical correlations for decoupling detection
    const HISTORICAL: Record<string, number> = {
      'EUR_USD|GBP_USD': 0.85,
      'EUR_USD|EUR_GBP': 0.60,
      'USD_JPY|EUR_JPY': 0.90,
      'USD_JPY|GBP_JPY': 0.82,
      'AUD_USD|NZD_USD': 0.92,
      'EUR_USD|USD_CAD': -0.78,
      'EUR_USD|USD_CHF': -0.90,
      'GBP_USD|GBP_JPY': 0.65,
    };

    for (let i = 0; i < instruments.length; i++) {
      for (let j = i + 1; j < instruments.length; j++) {
        const p1 = instruments[i], p2 = instruments[j];
        const r1 = candleData[p1], r2 = candleData[p2];

        const full = pearsonCorrelation(r1, r2);
        const r20 = pearsonCorrelation(r1.slice(-20), r2.slice(-20));
        const r50 = pearsonCorrelation(r1.slice(-50), r2.slice(-50));

        const key = `${p1}|${p2}`;
        const reverseKey = `${p2}|${p1}`;
        const historical = HISTORICAL[key] ?? HISTORICAL[reverseKey] ?? null;

        const decouplingMag = historical !== null ? Math.abs(r20 - historical) : 0;
        const decoupled = decouplingMag > 0.25;

        matrix.push({
          pair1: p1,
          pair2: p2,
          pearson: Math.round(full * 1000) / 1000,
          rolling20: Math.round(r20 * 1000) / 1000,
          rolling50: Math.round(r50 * 1000) / 1000,
          decoupled,
          decouplingMagnitude: Math.round(decouplingMag * 1000) / 1000,
          regime: getRegime(r20),
        });

        if (decoupled && historical !== null) {
          alerts.push({
            pair1: p1,
            pair2: p2,
            expectedCorr: historical,
            actualCorr: Math.round(r20 * 1000) / 1000,
            delta: Math.round((r20 - historical) * 1000) / 1000,
            signal: r20 > historical
              ? `${p1}/${p2} converging — mean reversion opportunity`
              : `${p1}/${p2} diverging — breakout or regime shift`,
            tradeable: decouplingMag > 0.35,
          });
        }
      }
    }

    // Persist
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await sb.from('sovereign_memory').upsert({
      memory_type: 'correlation_matrix',
      memory_key: 'live_pearson_heatmap',
      payload: { matrix, alerts, instruments, generatedAt: new Date().toISOString() },
      relevance_score: 0.85,
      created_by: 'correlation-matrix',
    }, { onConflict: 'memory_type,memory_key' });

    return new Response(JSON.stringify({
      success: true,
      pairsAnalyzed: matrix.length,
      decouplingAlerts: alerts.length,
      matrix: matrix.filter(m => m.decoupled || Math.abs(m.pearson) > 0.6),
      alerts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Correlation Matrix error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
