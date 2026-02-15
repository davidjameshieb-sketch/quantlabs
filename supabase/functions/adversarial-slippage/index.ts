// Adversarial Slippage Guard + Fill-Latency Sentinel + Noise Injector
// 1. Half-Spread Adverse Fill Detection (existing)
// 2. Dynamic Fill-Latency Analysis — detects per-pair latency spikes → auto PREDATORY_LIMIT
// 3. Noise Injector — places low-conviction "retail mimicry" trades as sovereignty tax
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlippageProfile {
  instrument: string;
  totalFills: number;
  avgSlippage: number;
  adverseFillRate: number;
  patternDetected: 'CLEAN' | 'SUSPECT' | 'ADVERSARIAL';
  avgSpread: number;
  worstFill: { slippage: number; time: string } | null;
  recommendation: string;
}

interface LatencySentinelResult {
  instrument: string;
  baselineLatencyMs: number;
  recentLatencyMs: number;
  deltaMs: number;
  flagged: boolean;
  action: string;
}

interface NoiseTradeSpec {
  pair: string;
  direction: 'long' | 'short';
  pattern: string;      // 'buy_resistance' | 'sell_support' | 'chase_breakout' | 'wide_stop_reversal'
  stopDistancePips: number;
  reason: string;
}

// ─── Noise Injector: Retail Mimicry Patterns ───
const NOISE_PATTERNS: Array<{
  name: string;
  directionBias: 'counter_trend' | 'with_trend';
  stopMultiplier: number;  // vs normal SL distance
  description: string;
}> = [
  { name: 'buy_resistance', directionBias: 'counter_trend', stopMultiplier: 3.0, description: 'Buy into resistance with wide stop — classic retail failure' },
  { name: 'sell_support', directionBias: 'counter_trend', stopMultiplier: 3.0, description: 'Sell into support with wide stop — retail bottom-picking' },
  { name: 'chase_breakout', directionBias: 'with_trend', stopMultiplier: 0.5, description: 'Chase late breakout with tight stop — retail FOMO' },
  { name: 'wide_stop_reversal', directionBias: 'counter_trend', stopMultiplier: 4.0, description: 'Counter-trend entry with massive stop — retail "conviction" trade' },
];

function selectNoisePattern(seed: number): typeof NOISE_PATTERNS[0] {
  return NOISE_PATTERNS[seed % NOISE_PATTERNS.length];
}

// ─── Seeded RNG ───
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ═══════════════════════════════════════════════
    // SECTION 1: Adversarial Slippage Detection
    // ═══════════════════════════════════════════════

    const { data: orders } = await sb
      .from('oanda_orders')
      .select('currency_pair, direction, slippage_pips, spread_at_entry, entry_price, requested_price, created_at, fill_latency_ms, agent_id')
      .in('status', ['filled', 'closed'])
      .not('slippage_pips', 'is', null)
      .not('spread_at_entry', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const profiles: SlippageProfile[] = [];
    const latencySentinel: LatencySentinelResult[] = [];

    if (orders && orders.length > 0) {
      // Group by instrument
      const byInstrument: Record<string, typeof orders> = {};
      for (const o of orders) {
        if (!byInstrument[o.currency_pair]) byInstrument[o.currency_pair] = [];
        byInstrument[o.currency_pair].push(o);
      }

      for (const [inst, fills] of Object.entries(byInstrument)) {
        // ── Slippage analysis (existing) ──
        const slippages = fills.map(f => Math.abs(f.slippage_pips || 0));
        const spreads = fills.map(f => f.spread_at_entry || 0);
        const avgSlippage = slippages.reduce((s, v) => s + v, 0) / slippages.length;
        const avgSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;

        const adverseFills = fills.filter(f => {
          const slip = Math.abs(f.slippage_pips || 0);
          const halfSpread = (f.spread_at_entry || 0) / 2;
          return slip > halfSpread && slip > 0.1;
        });
        const adverseFillRate = adverseFills.length / fills.length;

        let patternDetected: SlippageProfile['patternDetected'] = 'CLEAN';
        if (adverseFillRate > 0.6) patternDetected = 'ADVERSARIAL';
        else if (adverseFillRate > 0.3) patternDetected = 'SUSPECT';

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
          instrument: inst, totalFills: fills.length, avgSlippage: Math.round(avgSlippage * 100) / 100,
          adverseFillRate: Math.round(adverseFillRate * 100) / 100, patternDetected, avgSpread: Math.round(avgSpread * 100) / 100,
          worstFill: worstFill ? { slippage: Math.abs(worstFill.slippage_pips || 0), time: worstFill.created_at } : null,
          recommendation,
        });

        // ═══════════════════════════════════════════════
        // SECTION 2: Fill-Latency Sentinel
        // ═══════════════════════════════════════════════

        const latencies = fills
          .map(f => f.fill_latency_ms)
          .filter((v): v is number => v != null && v > 0);

        if (latencies.length >= 5) {
          // Baseline = first 70% of fills, recent = last 30%
          const splitIdx = Math.floor(latencies.length * 0.7);
          const baseline = latencies.slice(splitIdx); // older fills (further from index 0)
          const recent = latencies.slice(0, Math.max(3, latencies.length - splitIdx)); // newest fills

          const avgBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length;
          const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
          const deltaMs = avgRecent - avgBaseline;
          const flagged = deltaMs > 50; // >50ms increase = flagged

          let action = 'MONITORING';
          if (flagged) {
            action = 'PREDATORY_LIMIT_24H';
            // Auto-inject gate bypass for 24h PREDATORY_LIMIT posture
            await sb.from('gate_bypasses').insert({
              gate_id: `LATENCY_SENTINEL:${inst}`,
              reason: JSON.stringify({
                baselineMs: Math.round(avgBaseline),
                recentMs: Math.round(avgRecent),
                deltaMs: Math.round(deltaMs),
                action: 'FORCE_PREDATORY_LIMIT',
                trigger: 'fill_latency_spike_>50ms',
              }),
              expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
              pair: inst,
              created_by: 'latency-sentinel',
            });
            console.log(`[LATENCY-SENTINEL] ⚠️ ${inst}: +${Math.round(deltaMs)}ms latency spike → PREDATORY_LIMIT for 24h`);
          }

          latencySentinel.push({
            instrument: inst,
            baselineLatencyMs: Math.round(avgBaseline),
            recentLatencyMs: Math.round(avgRecent),
            deltaMs: Math.round(deltaMs),
            flagged,
            action,
          });
        }
      }

      // Auto-inject G18 for adversarial instruments (existing)
      for (const p of profiles.filter(p => p.patternDetected === 'ADVERSARIAL')) {
        await sb.from('gate_bypasses').insert({
          gate_id: `G18_ADVERSARIAL_SLIPPAGE:${p.instrument}`,
          reason: JSON.stringify({
            adverseFillRate: p.adverseFillRate, avgSlippage: p.avgSlippage,
            totalFills: p.totalFills, action: 'FORCE_PREDATORY_LIMIT',
          }),
          expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
          pair: p.instrument,
          created_by: 'adversarial-slippage',
        });
      }
    }

    // ═══════════════════════════════════════════════
    // SECTION 3: Noise Injector (Sovereignty Tax)
    // ═══════════════════════════════════════════════

    const noiseSpecs: NoiseTradeSpec[] = [];
    let noiseInjected = false;

    // Check if noise injection is armed (via gate_bypasses or sovereign_memory)
    const { data: noiseArm } = await sb.from('gate_bypasses')
      .select('*')
      .eq('gate_id', 'NOISE_INJECTOR:armed')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    // Also check sovereign_memory for noise injection config
    const { data: noiseConfig } = await sb.from('sovereign_memory')
      .select('payload')
      .eq('memory_type', 'noise_injector')
      .eq('memory_key', 'config')
      .limit(1);

    const isArmed = (noiseArm && noiseArm.length > 0) || false;
    const config = noiseConfig?.[0]?.payload as Record<string, unknown> | null;
    const noiseFrequency = (config?.frequency as number) || 0.15; // 15% of cycles generate noise
    const noisePairs = (config?.pairs as string[]) || ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
    const maxNoisePerCycle = (config?.max_per_cycle as number) || 1;

    // Time-based seed for deterministic but varying noise
    const hourSeed = Math.floor(Date.now() / 3600_000);
    const shouldNoise = isArmed || seededRandom(hourSeed) < noiseFrequency;

    if (shouldNoise && noisePairs.length > 0) {
      const pairIdx = hourSeed % noisePairs.length;
      const pair = noisePairs[pairIdx];
      const pattern = selectNoisePattern(hourSeed + pairIdx);

      // Determine direction: counter_trend = opposite of recent dominant direction
      const { data: recentTrades } = await sb.from('oanda_orders')
        .select('direction')
        .eq('currency_pair', pair)
        .in('status', ['filled', 'closed'])
        .order('created_at', { ascending: false })
        .limit(5);

      const recentLongs = recentTrades?.filter(t => t.direction === 'long').length || 0;
      const dominantDir = recentLongs >= 3 ? 'long' : 'short';
      const noiseDir: 'long' | 'short' = pattern.directionBias === 'counter_trend'
        ? (dominantDir === 'long' ? 'short' : 'long')
        : dominantDir;

      const baseStopPips = pair.includes('JPY') ? 30 : 30;
      const stopDistancePips = Math.round(baseStopPips * pattern.stopMultiplier);

      noiseSpecs.push({
        pair,
        direction: noiseDir,
        pattern: pattern.name,
        stopDistancePips,
        reason: `SOVEREIGNTY_TAX: ${pattern.description}`,
      });

      // Write noise trade intent to sovereign_memory for the auto-trade loop to pick up
      await sb.from('sovereign_memory').upsert({
        memory_type: 'noise_injector',
        memory_key: 'pending_noise_trade',
        payload: {
          specs: noiseSpecs,
          generatedAt: new Date().toISOString(),
          sizing: '0.01x',  // Minimum sizing — sovereignty tax
          agentId: 'noise-injector',
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30min TTL
          patternName: pattern.name,
          patternDescription: pattern.description,
        },
        relevance_score: 0.3, // Low relevance — it's noise by design
        created_by: 'noise-injector',
      }, { onConflict: 'memory_type,memory_key' });

      noiseInjected = true;
      console.log(`[NOISE-INJECTOR] 🎭 Generated ${pattern.name} noise: ${noiseDir} ${pair} | SL=${stopDistancePips}pips | Sovereignty Tax`);
    }

    // ═══ Persist all results ═══
    await sb.from('sovereign_memory').upsert({
      memory_type: 'adversarial_slippage',
      memory_key: 'fill_quality_audit',
      payload: {
        profiles,
        latencySentinel,
        noiseInjected,
        noiseSpecs,
        generatedAt: new Date().toISOString(),
      },
      relevance_score: 0.85,
      created_by: 'adversarial-slippage',
    }, { onConflict: 'memory_type,memory_key' });

    return new Response(JSON.stringify({
      success: true,
      profiles,
      latencySentinel,
      noiseInjector: { armed: isArmed || shouldNoise, injected: noiseInjected, specs: noiseSpecs },
      adversarialInstruments: profiles.filter(p => p.patternDetected === 'ADVERSARIAL').length,
      suspectInstruments: profiles.filter(p => p.patternDetected === 'SUSPECT').length,
      flaggedLatencyPairs: latencySentinel.filter(l => l.flagged).length,
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
