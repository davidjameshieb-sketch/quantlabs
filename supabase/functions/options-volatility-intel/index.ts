import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cache
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchCBOESkew(): Promise<{ skewIndex: number | null; signal: string }> {
  try {
    // CBOE Skew Index from FRED (free, no key needed for this series)
    const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=SKEW&cosd=' +
      new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.trim().split('\n').filter(l => !l.startsWith('DATE') && l.includes(','));
    if (lines.length === 0) return { skewIndex: null, signal: 'NO DATA' };
    
    const lastLine = lines[lines.length - 1];
    const val = parseFloat(lastLine.split(',')[1]);
    if (isNaN(val)) return { skewIndex: null, signal: 'PARSE ERROR' };
    
    let signal = 'NORMAL';
    if (val > 150) signal = 'EXTREME TAIL RISK — institutions hedging aggressively';
    else if (val > 140) signal = 'ELEVATED TAIL RISK';
    else if (val > 130) signal = 'MODERATE TAIL RISK';
    else if (val < 110) signal = 'LOW TAIL RISK — complacency';
    
    return { skewIndex: val, signal };
  } catch (e) {
    console.error('[OPTIONS-VOL] CBOE Skew fetch failed:', e);
    return { skewIndex: null, signal: 'FETCH ERROR' };
  }
}

async function fetchMOVEIndex(): Promise<{ moveIndex: number | null; signal: string }> {
  try {
    // MOVE Index (Bond VIX) from FRED
    const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MOVE&cosd=' +
      new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.trim().split('\n').filter(l => !l.startsWith('DATE') && l.includes(','));
    if (lines.length === 0) return { moveIndex: null, signal: 'NO DATA' };
    
    const lastLine = lines[lines.length - 1];
    const val = parseFloat(lastLine.split(',')[1]);
    if (isNaN(val)) return { moveIndex: null, signal: 'PARSE ERROR' };
    
    let signal = 'NORMAL';
    if (val > 150) signal = 'EXTREME BOND STRESS — flight to safety imminent';
    else if (val > 120) signal = 'HIGH BOND VOLATILITY — favor JPY/CHF';
    else if (val > 100) signal = 'ELEVATED BOND VOL';
    else if (val < 70) signal = 'LOW BOND VOL — carry trades favorable';
    
    return { moveIndex: val, signal };
  } catch (e) {
    console.error('[OPTIONS-VOL] MOVE fetch failed:', e);
    return { moveIndex: null, signal: 'FETCH ERROR' };
  }
}

async function fetchCopperGoldRatio(): Promise<{ ratio: number | null; signal: string }> {
  try {
    // Use FRED for copper and gold prices
    const cosd = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const [copperRes, goldRes] = await Promise.all([
      fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOPPUSDM&cosd=${cosd}`),
      fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=GOLDAMGBD228NLBM&cosd=${cosd}`),
    ]);
    
    const parseLastVal = (text: string) => {
      const lines = text.trim().split('\n').filter(l => !l.startsWith('DATE') && l.includes(',') && !l.includes('.'));
      // Get all valid lines
      const validLines = text.trim().split('\n').filter(l => {
        if (l.startsWith('DATE')) return false;
        const parts = l.split(',');
        return parts.length >= 2 && !isNaN(parseFloat(parts[1]));
      });
      if (validLines.length === 0) return null;
      return parseFloat(validLines[validLines.length - 1].split(',')[1]);
    };
    
    const copper = parseLastVal(await copperRes.text());
    const gold = parseLastVal(await goldRes.text());
    
    if (!copper || !gold || gold === 0) return { ratio: null, signal: 'NO DATA' };
    
    const ratio = +(copper / gold * 1000).toFixed(2); // Normalized
    
    let signal = 'NEUTRAL';
    if (ratio > 5.5) signal = 'STRONG GROWTH — risk-on, favor AUD/NZD/CAD';
    else if (ratio > 4.5) signal = 'GROWTH BIAS';
    else if (ratio < 3.0) signal = 'RECESSION SIGNAL — favor JPY/CHF safe havens';
    else if (ratio < 3.5) signal = 'SLOWDOWN SIGNAL';
    
    return { ratio, signal };
  } catch (e) {
    console.error('[OPTIONS-VOL] Copper/Gold fetch failed:', e);
    return { ratio: null, signal: 'FETCH ERROR' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [skew, move, copperGold] = await Promise.all([
      fetchCBOESkew(),
      fetchMOVEIndex(),
      fetchCopperGoldRatio(),
    ]);

    // Composite directive
    const signals: string[] = [];
    if (skew.skewIndex && skew.skewIndex > 140) signals.push(`SKEW=${skew.skewIndex} (${skew.signal})`);
    if (move.moveIndex && move.moveIndex > 120) signals.push(`MOVE=${move.moveIndex} (${move.signal})`);
    if (copperGold.ratio && (copperGold.ratio > 5.5 || copperGold.ratio < 3.5)) signals.push(`Cu/Au=${copperGold.ratio} (${copperGold.signal})`);

    const optionsDirective = signals.length > 0
      ? `OPTIONS/VOL ALERT: ${signals.join(' | ')}`
      : `OPTIONS/VOL NORMAL: SKEW=${skew.skewIndex || 'N/A'}, MOVE=${move.moveIndex || 'N/A'}, Cu/Au=${copperGold.ratio || 'N/A'}`;

    const payload = {
      optionsDirective,
      cboeSkew: skew,
      moveIndex: move,
      copperGoldRatio: copperGold,
      timestamp: new Date().toISOString(),
    };

    cache = { data: payload, ts: Date.now() };
    console.log(`[OPTIONS-VOL] ${optionsDirective}`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[OPTIONS-VOL] Error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
