// Adversarial Slippage Guard — Half-Spread Adverse Fill Detection
// Detects soft rejections (fills consistently at worst side of spread)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlippageProfile {
  instrument: string;
  totalFills: number;
  avgSlippage: number;
  adverseFillRate: number; // % of fills at worst half of spread
  patternDetected: 'CLEAN' | 'SUSPECT' | 'ADVERSARIAL';
  avgSpread: number;
  worstFill: { slippage: number; time: string } | null;
  recommendation: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get recent fills with slippage data
    const { data: orders } = await sb
      .from('oanda_orders')
      .select('currency_pair, direction, slippage_pips, spread_at_entry, entry_price, requested_price, created_at, fill_latency_ms')
      .in('status', ['filled', 'closed'])
      .not('slippage_pips', 'is', null)
      .not('spread_at_entry', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No fills with slippage data',
        profiles: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by instrument
    const byInstrument: Record<string, typeof orders> = {};
    for (const o of orders) {
      if (!byInstrument[o.currency_pair]) byInstrument[o.currency_pair] = [];
      byInstrument[o.currency_pair].push(o);
    }

    const profiles: SlippageProfile[] = [];

    for (const [inst, fills] of Object.entries(byInstrument)) {
      const slippages = fills.map(f => Math.abs(f.slippage_pips || 0));
      const spreads = fills.map(f => f.spread_at_entry || 0);
      const avgSlippage = slippages.reduce((s, v) => s + v, 0) / slippages.length;
      const avgSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;

      // Count adverse fills: slippage > half spread
      const adverseFills = fills.filter(f => {
        const slip = Math.abs(f.slippage_pips || 0);
        const halfSpread = (f.spread_at_entry || 0) / 2;
        return slip > halfSpread && slip > 0.1;
      });

      const adverseFillRate = adverseFills.length / fills.length;

      // Detect pattern
      let patternDetected: SlippageProfile['patternDetected'] = 'CLEAN';
      if (adverseFillRate > 0.6) patternDetected = 'ADVERSARIAL';
      else if (adverseFillRate > 0.3) patternDetected = 'SUSPECT';

      // Check for time-of-day clustering
      const adverseByHour: Record<number, number> = {};
      for (const f of adverseFills) {
        const h = new Date(f.created_at).getUTCHours();
        adverseByHour[h] = (adverseByHour[h] || 0) + 1;
      }

      const worstFill = fills.reduce((w, f) =>
        Math.abs(f.slippage_pips || 0) > Math.abs(w?.slippage_pips || 0) ? f : w
      , fills[0]);

      let recommendation = 'Execution quality acceptable';
      if (patternDetected === 'ADVERSARIAL') {
        recommendation = `⚠️ ADVERSARIAL: ${(adverseFillRate * 100).toFixed(0)}% fills at worst half of spread. Switch to LIMIT orders for ${inst}`;
      } else if (patternDetected === 'SUSPECT') {
        recommendation = `⚡ SUSPECT: ${(adverseFillRate * 100).toFixed(0)}% adverse fills. Consider PREDATORY_LIMIT during peak hours`;
      }

      profiles.push({
        instrument: inst,
        totalFills: fills.length,
        avgSlippage: Math.round(avgSlippage * 100) / 100,
        adverseFillRate: Math.round(adverseFillRate * 100) / 100,
        patternDetected,
        avgSpread: Math.round(avgSpread * 100) / 100,
        worstFill: worstFill ? {
          slippage: Math.abs(worstFill.slippage_pips || 0),
          time: worstFill.created_at,
        } : null,
        recommendation,
      });
    }

    // Auto-inject G18 for adversarial instruments
    for (const p of profiles.filter(p => p.patternDetected === 'ADVERSARIAL')) {
      await sb.from('gate_bypasses').insert({
        gate_id: `G18_ADVERSARIAL_SLIPPAGE:${p.instrument}`,
        reason: JSON.stringify({
          adverseFillRate: p.adverseFillRate,
          avgSlippage: p.avgSlippage,
          totalFills: p.totalFills,
          action: 'FORCE_PREDATORY_LIMIT',
        }),
        expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
        pair: p.instrument,
        created_by: 'adversarial-slippage',
      });
    }

    // Persist
    await sb.from('sovereign_memory').upsert({
      memory_type: 'adversarial_slippage',
      memory_key: 'fill_quality_audit',
      payload: { profiles, generatedAt: new Date().toISOString() },
      relevance_score: 0.85,
      created_by: 'adversarial-slippage',
    }, { onConflict: 'memory_type,memory_key' });

    return new Response(JSON.stringify({
      success: true,
      profiles,
      adversarialInstruments: profiles.filter(p => p.patternDetected === 'ADVERSARIAL').length,
      suspectInstruments: profiles.filter(p => p.patternDetected === 'SUSPECT').length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Adversarial Slippage error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
