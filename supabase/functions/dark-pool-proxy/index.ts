// Synthetic Dark Pool Proxy — Liquidity Depth Curve
// Maps slippage-per-lot across price levels using OANDA order book density
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LiquidityBucket {
  price: number;
  longPct: number;
  shortPct: number;
  netDensity: number;
  estimatedSlippagePips: number;
  depthScore: number; // 0-100
}

interface DarkPoolProfile {
  instrument: string;
  currentPrice: number;
  bidLiquidity: LiquidityBucket[];
  askLiquidity: LiquidityBucket[];
  totalDepthScore: number;
  thinZones: Array<{ from: number; to: number; severity: string }>;
  optimalEntryZone: { price: number; side: string; reason: string } | null;
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_TOKEN = Deno.env.get('OANDA_LIVE_API_TOKEN') || Deno.env.get('OANDA_API_TOKEN');
    const OANDA_ACCOUNT = Deno.env.get('OANDA_LIVE_ACCOUNT_ID') || Deno.env.get('OANDA_ACCOUNT_ID');
    if (!OANDA_TOKEN || !OANDA_ACCOUNT) throw new Error('OANDA credentials missing');

    const { instruments } = await req.json().catch(() => ({
      instruments: ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'EUR_JPY', 'GBP_JPY']
    }));

    const BASE = 'https://api-fxtrade.oanda.com';
    const headers = { Authorization: `Bearer ${OANDA_TOKEN}` };

    const profiles: DarkPoolProfile[] = [];

    for (const inst of instruments.slice(0, 8)) {
      try {
        // Fetch order book + pricing in parallel
        const [obRes, priceRes] = await Promise.all([
          fetch(`${BASE}/v3/instruments/${inst}/orderBook`, { headers }),
          fetch(`${BASE}/v3/accounts/${OANDA_ACCOUNT}/pricing?instruments=${inst}`, { headers }),
        ]);

        if (!obRes.ok) continue;
        const obData = await obRes.json();
        const priceData = await priceRes.json();

        const buckets = obData.orderBook?.buckets || [];
        const currentPrice = parseFloat(priceData.prices?.[0]?.closeoutAsk || obData.orderBook?.price || '0');
        const isJPY = inst.includes('JPY');
        const pipMult = isJPY ? 100 : 10000;

        // Build liquidity depth curve
        const bidBuckets: LiquidityBucket[] = [];
        const askBuckets: LiquidityBucket[] = [];

        for (const b of buckets) {
          const price = parseFloat(b.price);
          const longPct = parseFloat(b.longCountPercent || '0');
          const shortPct = parseFloat(b.shortCountPercent || '0');
          const netDensity = longPct + shortPct;
          const distPips = Math.abs(price - currentPrice) * pipMult;

          // Slippage model: thin areas = high slippage
          const depthScore = Math.min(100, netDensity * 500);
          const estimatedSlippagePips = depthScore > 20 ? 0.1 : depthScore > 5 ? 0.5 : 1.5;

          const bucket: LiquidityBucket = {
            price: Math.round(price * pipMult) / pipMult,
            longPct,
            shortPct,
            netDensity,
            estimatedSlippagePips,
            depthScore,
          };

          if (price < currentPrice) bidBuckets.push(bucket);
          else askBuckets.push(bucket);
        }

        // Identify thin zones (liquidity voids)
        const thinZones: Array<{ from: number; to: number; severity: string }> = [];
        const allBuckets = [...bidBuckets, ...askBuckets].sort((a, b) => a.price - b.price);
        for (let i = 1; i < allBuckets.length; i++) {
          if (allBuckets[i].depthScore < 5 && allBuckets[i - 1].depthScore < 5) {
            const gapPips = Math.abs(allBuckets[i].price - allBuckets[i - 1].price) * pipMult;
            if (gapPips > 2) {
              thinZones.push({
                from: allBuckets[i - 1].price,
                to: allBuckets[i].price,
                severity: gapPips > 10 ? 'CRITICAL' : gapPips > 5 ? 'WARNING' : 'MINOR',
              });
            }
          }
        }

        // Find optimal entry (highest depth near current price)
        const nearBuckets = allBuckets
          .filter(b => Math.abs(b.price - currentPrice) * pipMult < 20)
          .sort((a, b) => b.depthScore - a.depthScore);

        const optimal = nearBuckets[0] || null;

        const totalDepthScore = Math.round(
          allBuckets.reduce((s, b) => s + b.depthScore, 0) / Math.max(allBuckets.length, 1)
        );

        profiles.push({
          instrument: inst,
          currentPrice,
          bidLiquidity: bidBuckets.slice(-10), // nearest 10
          askLiquidity: askBuckets.slice(0, 10),
          totalDepthScore,
          thinZones: thinZones.slice(0, 5),
          optimalEntryZone: optimal ? {
            price: optimal.price,
            side: optimal.price < currentPrice ? 'BID' : 'ASK',
            reason: `Depth ${optimal.depthScore}/100, slippage ~${optimal.estimatedSlippagePips}p`,
          } : null,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`Dark Pool Proxy error for ${inst}:`, e);
      }
    }

    // Persist to sovereign_memory
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await sb.from('sovereign_memory').upsert({
      memory_type: 'dark_pool_proxy',
      memory_key: 'liquidity_depth_curve',
      payload: { profiles, generatedAt: new Date().toISOString() },
      relevance_score: 0.9,
      created_by: 'dark-pool-proxy',
    }, { onConflict: 'memory_type,memory_key' });

    return new Response(JSON.stringify({ success: true, profiles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Dark Pool Proxy error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
