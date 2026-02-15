// Sentiment Divergence Engine — Retail vs Institutional Trap Signal
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SentimentProfile {
  instrument: string;
  retailLongPct: number;
  retailShortPct: number;
  institutionalBias: string; // from COT/God Signal
  divergenceScore: number; // 0-100
  trapProbability: number; // 0-1
  trapDirection: 'LONG_TRAP' | 'SHORT_TRAP' | 'NO_TRAP';
  actionable: boolean;
  signal: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_TOKEN = Deno.env.get('OANDA_LIVE_API_TOKEN') || Deno.env.get('OANDA_API_TOKEN');
    const OANDA_ACCOUNT = Deno.env.get('OANDA_LIVE_ACCOUNT_ID') || Deno.env.get('OANDA_ACCOUNT_ID');
    if (!OANDA_TOKEN || !OANDA_ACCOUNT) throw new Error('OANDA credentials missing');

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const BASE = 'https://api-fxtrade.oanda.com';
    const headers = { Authorization: `Bearer ${OANDA_TOKEN}` };

    const INSTRUMENTS = ['EUR_USD','GBP_USD','USD_JPY','AUD_USD','NZD_USD','USD_CAD','EUR_JPY','GBP_JPY'];

    // Fetch institutional bias from sovereign_memory (COT data)
    const { data: cotMemory } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_type', 'cot_positioning')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const cotData = (cotMemory?.payload as any) || {};

    // Fetch God Signal data
    const { data: godSignal } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_type', 'god_signal')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const godData = (godSignal?.payload as any) || {};

    const profiles: SentimentProfile[] = [];

    for (const inst of INSTRUMENTS) {
      try {
        // Get OANDA position book (retail sentiment)
        const pbRes = await fetch(`${BASE}/v3/instruments/${inst}/positionBook`, { headers });
        if (!pbRes.ok) continue;
        const pbData = await pbRes.json();

        const buckets = pbData.positionBook?.buckets || [];
        let totalLong = 0, totalShort = 0;
        for (const b of buckets) {
          totalLong += parseFloat(b.longCountPercent || '0');
          totalShort += parseFloat(b.shortCountPercent || '0');
        }
        const total = totalLong + totalShort || 1;
        const retailLongPct = Math.round((totalLong / total) * 100);
        const retailShortPct = 100 - retailLongPct;

        // Institutional bias from COT
        const pair = inst.replace('_', '/');
        const cotBias = cotData[pair]?.bias || cotData[inst]?.bias || 'NEUTRAL';
        const godBias = godData[pair]?.consensus || godData[inst]?.consensus || null;
        const institutionalBias = godBias || cotBias;

        // Calculate divergence
        let divergenceScore = 0;
        let trapDirection: SentimentProfile['trapDirection'] = 'NO_TRAP';

        if (institutionalBias === 'LONG' || institutionalBias === 'BULLISH') {
          // Institutions long, if retail is also heavily long = no edge
          // If retail is heavily short = TRAP incoming
          if (retailShortPct > 60) {
            divergenceScore = Math.min(100, (retailShortPct - 50) * 4);
            trapDirection = 'SHORT_TRAP'; // Retail shorts will get squeezed
          }
        } else if (institutionalBias === 'SHORT' || institutionalBias === 'BEARISH') {
          if (retailLongPct > 60) {
            divergenceScore = Math.min(100, (retailLongPct - 50) * 4);
            trapDirection = 'LONG_TRAP'; // Retail longs will get trapped
          }
        }

        const trapProbability = Math.min(1, divergenceScore / 100);
        const actionable = divergenceScore >= 40;

        let signal = 'No significant divergence';
        if (trapDirection === 'SHORT_TRAP' && actionable) {
          signal = `🎯 SHORT TRAP: ${retailShortPct}% retail SHORT vs institutional LONG — squeeze likely`;
        } else if (trapDirection === 'LONG_TRAP' && actionable) {
          signal = `🎯 LONG TRAP: ${retailLongPct}% retail LONG vs institutional SHORT — dump likely`;
        }

        profiles.push({
          instrument: inst,
          retailLongPct,
          retailShortPct,
          institutionalBias,
          divergenceScore,
          trapProbability: Math.round(trapProbability * 100) / 100,
          trapDirection,
          actionable,
          signal,
        });
      } catch (e) {
        console.error(`Sentiment error for ${inst}:`, e);
      }
    }

    // Auto-inject G17 gates for high-confidence traps
    for (const p of profiles.filter(p => p.actionable && p.divergenceScore >= 70)) {
      await sb.from('gate_bypasses').insert({
        gate_id: `G17_SENTIMENT_TRAP:${p.instrument}`,
        reason: JSON.stringify({
          trapDirection: p.trapDirection,
          divergenceScore: p.divergenceScore,
          retailLongPct: p.retailLongPct,
          institutionalBias: p.institutionalBias,
          signal: p.signal,
        }),
        expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
        pair: p.instrument,
        created_by: 'sentiment-divergence',
      });
    }

    // Persist
    await sb.from('sovereign_memory').upsert({
      memory_type: 'sentiment_divergence',
      memory_key: 'retail_vs_institutional',
      payload: { profiles, generatedAt: new Date().toISOString() },
      relevance_score: 0.95,
      created_by: 'sentiment-divergence',
    }, { onConflict: 'memory_type,memory_key' });

    return new Response(JSON.stringify({
      success: true,
      profiles,
      trapsDetected: profiles.filter(p => p.actionable).length,
      gatesInjected: profiles.filter(p => p.actionable && p.divergenceScore >= 70).length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Sentiment Divergence error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
