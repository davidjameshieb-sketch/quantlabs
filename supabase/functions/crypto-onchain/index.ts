import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5min

// Blockchain.com API — free, no key needed
async function fetchBTCOnChain(): Promise<Record<string, unknown>> {
  const metrics: Record<string, unknown> = {};

  const endpoints: Record<string, string> = {
    hashRate: 'https://api.blockchain.info/charts/hash-rate?timespan=7days&format=json',
    mempoolSize: 'https://api.blockchain.info/charts/mempool-size?timespan=2days&format=json',
    txVolume: 'https://api.blockchain.info/charts/estimated-transaction-volume-usd?timespan=7days&format=json',
    avgBlockSize: 'https://api.blockchain.info/charts/avg-block-size?timespan=7days&format=json',
    difficulty: 'https://api.blockchain.info/charts/difficulty?timespan=30days&format=json',
    minerRevenue: 'https://api.blockchain.info/charts/miners-revenue?timespan=7days&format=json',
    nTx: 'https://api.blockchain.info/charts/n-transactions?timespan=7days&format=json',
  };

  const results = await Promise.allSettled(
    Object.entries(endpoints).map(async ([key, url]) => {
      const res = await fetch(url);
      if (!res.ok) { await res.text(); return [key, null]; }
      const data = await res.json();
      const values = data.values || [];
      if (values.length === 0) return [key, null];
      const latest = values[values.length - 1].y;
      const prev = values.length > 1 ? values[values.length - 2].y : latest;
      const change = prev > 0 ? +((latest - prev) / prev * 100).toFixed(2) : 0;
      return [key, { current: latest, change, unit: data.unit || '' }];
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const [key, val] = result.value as [string, unknown];
      if (val) metrics[key] = val;
    }
  }

  return metrics;
}

// BTC stats from blockchain.info
async function fetchBTCStats(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch('https://api.blockchain.info/stats');
    if (!res.ok) { await res.text(); return {}; }
    const data = await res.json();
    return {
      marketPrice: data.market_price_usd,
      tradeVolume: data.trade_volume_usd,
      blocksSize: data.blocks_size,
      totalBTC: data.totalbc / 100000000, // satoshi to BTC
      hashRate: data.hash_rate,
      difficulty: data.difficulty,
      minutesBetweenBlocks: data.minutes_between_blocks,
      nTxTotal: data.n_tx,
    };
  } catch (e) {
    console.error('[CRYPTO-ONCHAIN] BTC stats failed:', e);
    return {};
  }
}

// Simple ETH gas estimate from public endpoint
async function fetchETHGas(): Promise<{ gasGwei: number | null; signal: string }> {
  try {
    // Use Beaconcha.in or ethgasstation alternatives
    const res = await fetch('https://api.blocknative.com/gasprices/blockprices', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      await res.text();
      return { gasGwei: null, signal: 'NO DATA' };
    }
    const data = await res.json();
    const baseFee = data.blockPrices?.[0]?.baseFeePerGas;
    if (baseFee) {
      let signal = 'NORMAL';
      if (baseFee > 100) signal = 'HIGH GAS — network congestion (high activity)';
      else if (baseFee > 50) signal = 'MODERATE GAS';
      else if (baseFee < 10) signal = 'LOW GAS — low activity';
      return { gasGwei: +baseFee.toFixed(1), signal };
    }
    return { gasGwei: null, signal: 'PARSE ERROR' };
  } catch {
    return { gasGwei: null, signal: 'UNAVAILABLE' };
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

    const [onChain, btcStats, ethGas] = await Promise.all([
      fetchBTCOnChain(),
      fetchBTCStats(),
      fetchETHGas(),
    ]);

    // Compute on-chain directive
    const signals: string[] = [];
    const hr = onChain.hashRate as any;
    if (hr?.change && hr.change < -5) signals.push(`Hash rate declining ${hr.change}% — miner capitulation risk`);
    if (hr?.change && hr.change > 10) signals.push(`Hash rate surging ${hr.change}% — network strength`);
    
    const mempool = onChain.mempoolSize as any;
    if (mempool?.current && mempool.current > 100000000) signals.push('Mempool congested — high TX demand');
    
    const txVol = onChain.txVolume as any;
    if (txVol?.change && txVol.change > 20) signals.push(`TX volume surging ${txVol.change}%`);
    if (txVol?.change && txVol.change < -20) signals.push(`TX volume dropping ${txVol.change}%`);

    const onChainDirective = signals.length > 0
      ? `ON-CHAIN ALERT: ${signals.join(' | ')}`
      : 'ON-CHAIN NORMAL: BTC network operating normally';

    const payload = {
      onChainDirective,
      btcOnChain: onChain,
      btcStats,
      ethGas,
      timestamp: new Date().toISOString(),
    };

    cache = { data: payload, ts: Date.now() };
    console.log(`[CRYPTO-ONCHAIN] ${onChainDirective}`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[CRYPTO-ONCHAIN] Error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
