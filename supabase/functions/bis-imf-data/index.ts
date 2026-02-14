import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30min — BIS/IMF data is monthly

// BIS Real Effective Exchange Rates (REER) — shows if a currency is over/undervalued
async function fetchBISReer(): Promise<Record<string, { reer: number; signal: string }>> {
  const results: Record<string, { reer: number; signal: string }> = {};
  // BIS publishes REER via their stats API
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  
  try {
    // BIS SDMX REST API for effective exchange rates
    const url = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_EER/1.0/M.N.B.US+XM+GB+JP+AU+CA+CH+NZ?lastNObservations=1&format=csv';
    const res = await fetch(url, {
      headers: { 'Accept': 'text/csv' },
    });
    
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n');
      // Parse CSV for REER values
      const countryMap: Record<string, string> = { 'US': 'USD', 'XM': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD' };
      
      for (const line of lines) {
        if (line.startsWith('FREQ') || !line.trim()) continue;
        const parts = line.split(',');
        // Try to extract country code and value
        for (const [code, currency] of Object.entries(countryMap)) {
          if (line.includes(code)) {
            const val = parseFloat(parts[parts.length - 1]);
            if (!isNaN(val) && val > 50 && val < 200) {
              let signal = 'FAIR VALUE';
              if (val > 115) signal = 'OVERVALUED — mean reversion risk (bearish)';
              else if (val > 105) signal = 'SLIGHTLY OVERVALUED';
              else if (val < 85) signal = 'UNDERVALUED — potential rebound (bullish)';
              else if (val < 95) signal = 'SLIGHTLY UNDERVALUED';
              results[currency] = { reer: +val.toFixed(1), signal };
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[BIS-IMF] BIS REER fetch failed:', e);
  }

  // If BIS API fails, provide baseline estimates (100 = fair value)
  if (Object.keys(results).length === 0) {
    for (const cur of currencies) {
      results[cur] = { reer: 100, signal: 'NO DATA — using baseline' };
    }
  }

  return results;
}

// IMF SDR rates and reserve currency allocations
async function fetchIMFData(): Promise<{ sdrRates: Record<string, number>; reserveAllocations: Record<string, number> }> {
  const sdrRates: Record<string, number> = {};
  const reserveAllocations: Record<string, number> = {
    // Latest known global reserve allocations (IMF COFER, updated quarterly)
    USD: 58.4, EUR: 19.8, JPY: 5.4, GBP: 4.9, CNY: 2.3, AUD: 1.9, CAD: 2.5, CHF: 0.2,
  };

  try {
    // IMF SDR valuation — free JSON API
    const url = 'https://www.imf.org/external/np/fin/data/rms_five.aspx?tsvflag=Y';
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      // Parse TSV for SDR exchange rates
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('U.S. dollar')) {
          const val = parseFloat(line.split('\t').pop()?.trim() || '');
          if (!isNaN(val)) sdrRates['USD'] = val;
        }
        if (line.includes('Euro')) {
          const val = parseFloat(line.split('\t').pop()?.trim() || '');
          if (!isNaN(val)) sdrRates['EUR'] = val;
        }
        if (line.includes('Japanese yen')) {
          const val = parseFloat(line.split('\t').pop()?.trim() || '');
          if (!isNaN(val)) sdrRates['JPY'] = val;
        }
        if (line.includes('Pound sterling')) {
          const val = parseFloat(line.split('\t').pop()?.trim() || '');
          if (!isNaN(val)) sdrRates['GBP'] = val;
        }
        if (line.includes('Chinese yuan')) {
          const val = parseFloat(line.split('\t').pop()?.trim() || '');
          if (!isNaN(val)) sdrRates['CNY'] = val;
        }
      }
    }
  } catch (e) {
    console.error('[BIS-IMF] IMF SDR fetch failed:', e);
  }

  return { sdrRates, reserveAllocations };
}

// Baltic Dry Index — global trade activity
async function fetchBalticDryIndex(): Promise<{ bdi: number | null; signal: string }> {
  try {
    // Try FRED for Baltic Dry Index
    const cosd = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DBDI&cosd=${cosd}`;
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.trim().split('\n').filter(l => {
      if (l.startsWith('DATE')) return false;
      const parts = l.split(',');
      return parts.length >= 2 && !isNaN(parseFloat(parts[1]));
    });
    
    if (lines.length === 0) return { bdi: null, signal: 'NO DATA' };
    const val = parseFloat(lines[lines.length - 1].split(',')[1]);
    if (isNaN(val)) return { bdi: null, signal: 'PARSE ERROR' };

    let signal = 'NEUTRAL';
    if (val > 3000) signal = 'STRONG GLOBAL TRADE — risk-on, favor commodity currencies';
    else if (val > 2000) signal = 'HEALTHY TRADE FLOWS';
    else if (val < 500) signal = 'TRADE COLLAPSE — recession signal, favor safe havens';
    else if (val < 1000) signal = 'WEAK TRADE — global slowdown';

    return { bdi: val, signal };
  } catch (e) {
    console.error('[BIS-IMF] BDI fetch failed:', e);
    return { bdi: null, signal: 'FETCH ERROR' };
  }
}

// TFF (Traders in Financial Futures) — more granular than legacy COT
async function fetchTFFData(): Promise<{ tff: Record<string, unknown>; tffDirective: string }> {
  try {
    const url = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?$order=report_date_as_yyyy_mm_dd DESC&$limit=50';
    const res = await fetch(url);
    if (!res.ok) return { tff: {}, tffDirective: 'TFF DATA UNAVAILABLE' };
    
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { tff: {}, tffDirective: 'NO TFF DATA' };

    const latestDate = data[0]?.report_date_as_yyyy_mm_dd;
    const latestRecords = data.filter((r: any) => r.report_date_as_yyyy_mm_dd === latestDate);

    const FX_CONTRACTS: Record<string, string> = {
      'EURO FX': 'EUR', 'BRITISH POUND': 'GBP', 'JAPANESE YEN': 'JPY',
      'AUSTRALIAN DOLLAR': 'AUD', 'CANADIAN DOLLAR': 'CAD', 'SWISS FRANC': 'CHF',
      'NZ DOLLAR': 'NZD', 'MEXICAN PESO': 'MXN', 'U.S. DOLLAR INDEX': 'DXY',
    };

    const tff: Record<string, unknown> = {};
    for (const record of latestRecords) {
      const name = (record.contract_market_name || '').toUpperCase();
      for (const [contractName, currency] of Object.entries(FX_CONTRACTS)) {
        if (name.includes(contractName)) {
          const dealerLong = parseInt(record.dealer_positions_long_all || '0');
          const dealerShort = parseInt(record.dealer_positions_short_all || '0');
          const assetMgrLong = parseInt(record.asset_mgr_positions_long_all || '0');
          const assetMgrShort = parseInt(record.asset_mgr_positions_short_all || '0');
          const leveragedLong = parseInt(record.lev_money_positions_long_all || '0');
          const leveragedShort = parseInt(record.lev_money_positions_short_all || '0');
          
          const dealerNet = dealerLong - dealerShort;
          const assetMgrNet = assetMgrLong - assetMgrShort;
          const leveragedNet = leveragedLong - leveragedShort;
          
          tff[currency] = {
            dealerNet, dealerLongPct: dealerLong + dealerShort > 0 ? +(dealerLong / (dealerLong + dealerShort) * 100).toFixed(1) : 50,
            assetMgrNet, assetMgrLongPct: assetMgrLong + assetMgrShort > 0 ? +(assetMgrLong / (assetMgrLong + assetMgrShort) * 100).toFixed(1) : 50,
            leveragedNet, leveragedLongPct: leveragedLong + leveragedShort > 0 ? +(leveragedLong / (leveragedLong + leveragedShort) * 100).toFixed(1) : 50,
          };
        }
      }
    }

    // Build directive from most extreme positioning
    const extremes: string[] = [];
    for (const [cur, d] of Object.entries(tff)) {
      const data = d as any;
      if (data.assetMgrLongPct > 75 || data.assetMgrLongPct < 25) {
        extremes.push(`${cur} AssetMgr ${data.assetMgrLongPct}% long`);
      }
    }

    const tffDirective = extremes.length > 0
      ? `TFF POSITIONING EXTREME: ${extremes.join(', ')}`
      : 'TFF POSITIONING NORMAL';

    return { tff, tffDirective };
  } catch (e) {
    console.error('[BIS-IMF] TFF fetch failed:', e);
    return { tff: {}, tffDirective: 'TFF FETCH ERROR' };
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

    const [reer, imf, bdi, tff] = await Promise.all([
      fetchBISReer(),
      fetchIMFData(),
      fetchBalticDryIndex(),
      fetchTFFData(),
    ]);

    // Composite directive
    const signals: string[] = [];
    const overvalued = Object.entries(reer).filter(([_, v]) => v.signal.includes('OVERVALUED'));
    const undervalued = Object.entries(reer).filter(([_, v]) => v.signal.includes('UNDERVALUED'));
    if (overvalued.length > 0) signals.push(`OVERVALUED: ${overvalued.map(([k]) => k).join(',')}`);
    if (undervalued.length > 0) signals.push(`UNDERVALUED: ${undervalued.map(([k]) => k).join(',')}`);
    if (bdi.bdi && bdi.bdi < 1000) signals.push(`BDI WEAK (${bdi.bdi})`);
    if (tff.tffDirective.includes('EXTREME')) signals.push(tff.tffDirective);

    const intermarketDirective = signals.length > 0
      ? `INTERMARKET ALERT: ${signals.join(' | ')}`
      : 'INTERMARKET NORMAL';

    const payload = {
      intermarketDirective,
      bisReer: reer,
      imf,
      balticDryIndex: bdi,
      tff: tff.tff,
      tffDirective: tff.tffDirective,
      timestamp: new Date().toISOString(),
    };

    cache = { data: payload, ts: Date.now() };
    console.log(`[BIS-IMF] ${intermarketDirective}`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[BIS-IMF] Error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
