// NYC Love Agent — Edge Function
// Strategy: Spread Shield + 3:1 R:R (20 pip SL / 60 pip TP)
// Session: NYC Open 13:00–14:30 UTC (8:30–9:30 AM EST window + buffer)
// Direction: Sovereign Matrix rankings (Predator vs Prey)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OANDA_HOSTS: Record<string, string> = {
  practice: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com',
};

const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
const SPREAD_LIMIT_PIPS = 3.0;
const SL_PIPS = 20;
const TP_PIPS = 60; // 3:1 R:R
const AGENT_ID = 'nyc-love';
const ENVIRONMENT = 'practice';

function pipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

function pricePrecision(instrument: string): number {
  return instrument.includes('JPY') ? 3 : 5;
}

// ── Session Gate: Only trade during NYC Open surge window ──
function isNYCOpenWindow(): { allowed: boolean; reason: string } {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const minutes = utcH * 60 + utcM;

  // Full NYC session: 13:30–21:30 UTC (8:30 AM – 4:30 PM EST)
  if (minutes >= 810 && minutes <= 1290) {
    return { allowed: true, reason: `NYC session active (${utcH}:${String(utcM).padStart(2, '0')} UTC)` };
  }
  return { allowed: false, reason: `Outside NYC session (${utcH}:${String(utcM).padStart(2, '0')} UTC). Window: 13:30–21:30 UTC (8:30AM–4:30PM EST)` };
}

// ── Fetch live bid/ask from OANDA ──
async function fetchPricing(instrument: string, apiToken: string, accountId: string): Promise<{ bid: number; ask: number; spread: number; mid: number } | null> {
  const host = OANDA_HOSTS.practice;
  try {
    const res = await fetch(`${host}/v3/accounts/${accountId}/pricing?instruments=${instrument}`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.prices?.[0];
    if (!p?.bids?.length || !p?.asks?.length) return null;
    const bid = parseFloat(p.bids[0].price);
    const ask = parseFloat(p.asks[0].price);
    const pv = instrument.includes('JPY') ? 100 : 10000;
    return { bid, ask, spread: (ask - bid) * pv, mid: (bid + ask) / 2 };
  } catch { return null; }
}

// ── Fetch M5 candles for velocity detection ──
async function fetchM5Candles(instrument: string, count: number, apiToken: string, accountId: string): Promise<{ volume: number; close: number; open: number }[]> {
  const host = OANDA_HOSTS.practice;
  try {
    const res = await fetch(`${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M5&price=M`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.candles || [])
      .filter((c: { complete?: boolean }) => c.complete !== false)
      .map((c: { volume: number; mid: { o: string; c: string } }) => ({
        volume: c.volume,
        open: parseFloat(c.mid.o),
        close: parseFloat(c.mid.c),
      }));
  } catch { return []; }
}

// ── Velocity detector: volume spike vs 20-period avg ──
function detectVelocitySpike(candles: { volume: number; close: number; open: number }[], threshold = 1.5): { spike: boolean; ratio: number; direction: 'BUY' | 'SELL' | null } {
  if (candles.length < 5) return { spike: false, ratio: 0, direction: null };
  const current = candles[candles.length - 1];
  const lookback = candles.slice(0, -1);
  const avgVol = lookback.reduce((s, c) => s + c.volume, 0) / lookback.length;
  const ratio = avgVol > 0 ? current.volume / avgVol : 0;

  if (ratio < threshold) return { spike: false, ratio, direction: null };

  // Direction from candle body
  const direction = current.close > current.open ? 'BUY' : 'SELL';
  return { spike: true, ratio, direction };
}

// ── Sovereign Matrix direction: use currency rankings from sovereign_memory ──
async function getSovereignDirection(instrument: string, sb: ReturnType<typeof createClient>): Promise<'BUY' | 'SELL' | null> {
  try {
    const { data } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_key', 'currency_ranks')
      .eq('memory_type', 'matrix_state')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!data?.payload) return null;
    const ranks = data.payload as Record<string, number>;

    // Parse instrument: EUR_USD → base=EUR, quote=USD
    const [base, quote] = instrument.split('_');
    const baseRank = ranks[base];
    const quoteRank = ranks[quote];

    if (baseRank == null || quoteRank == null) return null;

    // Lower rank = stronger currency (rank 1 = predator)
    // If base is stronger (lower rank), BUY. If quote stronger, SELL.
    if (baseRank < quoteRank) return 'BUY';
    if (quoteRank < baseRank) return 'SELL';
    return null;
  } catch {
    return null;
  }
}

// ── OANDA Market Order with SL/TP ──
async function placeMarketOrder(
  instrument: string,
  units: number,
  direction: 'BUY' | 'SELL',
  mid: number,
  apiToken: string,
  accountId: string,
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  const host = OANDA_HOSTS.practice;
  const pv = pipValue(instrument);
  const prec = pricePrecision(instrument);
  const side = direction === 'BUY' ? 1 : -1;

  const slPrice = (mid - side * SL_PIPS * pv).toFixed(prec);
  const tpPrice = (mid + side * TP_PIPS * pv).toFixed(prec);

  const orderBody = {
    order: {
      type: 'MARKET',
      instrument,
      units: String(direction === 'BUY' ? units : -units),
      timeInForce: 'FOK',
      stopLossOnFill: { price: slPrice, timeInForce: 'GTC' },
      takeProfitOnFill: { price: tpPrice, timeInForce: 'GTC' },
    },
  };

  try {
    const res = await fetch(`${host}/v3/accounts/${accountId}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(orderBody),
    });

    const data = await res.json();
    if (data.orderFillTransaction) {
      return { success: true, tradeId: data.orderFillTransaction.tradeOpened?.tradeID || data.orderFillTransaction.id };
    }
    return { success: false, error: JSON.stringify(data.orderRejectTransaction || data).slice(0, 300) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Get account equity for position sizing ──
async function getAccountNAV(apiToken: string, accountId: string): Promise<number> {
  const host = OANDA_HOSTS.practice;
  try {
    const res = await fetch(`${host}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    const data = await res.json();
    return parseFloat(data.account?.NAV || '0');
  } catch { return 0; }
}

// ── Check for existing open position on instrument ──
async function hasOpenPosition(instrument: string, sb: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await sb
    .from('oanda_orders')
    .select('id')
    .eq('currency_pair', instrument)
    .eq('agent_id', AGENT_ID)
    .in('status', ['submitted', 'filled', 'open'])
    .eq('environment', ENVIRONMENT)
    .limit(1);
  return (data?.length || 0) > 0;
}

// ══════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const log: string[] = [];
  const executions: { instrument: string; direction: string; status: string; detail: string }[] = [];

  try {
    // ── 1. Session Gate ──
    const session = isNYCOpenWindow();
    log.push(session.reason);
    if (!session.allowed) {
      return new Response(JSON.stringify({ success: true, reason: 'session_gate', detail: session.reason, log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Credentials (ALWAYS demo/practice account) ──
    const env = 'practice';
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;

    const sbUrl = Deno.env.get('SUPABASE_URL')!;
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(sbUrl, sbKey);

    // ── 3. Get NAV for position sizing ──
    const nav = await getAccountNAV(apiToken, accountId);
    log.push(`Account NAV: $${nav.toFixed(2)}`);
    if (nav < 50) {
      return new Response(JSON.stringify({ success: false, reason: 'low_nav', nav, log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Risk 2% per trade, SL = 20 pips → units = (NAV * 0.02) / (20 * pipValue in $)
    // Simplified: ~1000 units per $100 NAV for standard pairs
    const riskDollars = nav * 0.02;

    // ── 4. Scan each instrument ──
    for (const instrument of INSTRUMENTS) {
      const tag = `[${instrument}]`;

      // Check existing position
      // Get a user_id — use the first admin or any user
      const { data: adminData } = await sb.from('user_roles').select('user_id').eq('role', 'admin').limit(1).single();
      const userId = adminData?.user_id;
      if (!userId) { log.push(`${tag} No user found, skipping`); continue; }

      if (await hasOpenPosition(instrument, sb, userId)) {
        log.push(`${tag} Already has open position, skipping`);
        executions.push({ instrument, direction: '-', status: 'skipped', detail: 'existing_position' });
        continue;
      }

      // ── 4a. Spread Shield ──
      const pricing = await fetchPricing(instrument, apiToken, accountId);
      if (!pricing) {
        log.push(`${tag} Failed to fetch pricing`);
        continue;
      }

      if (pricing.spread > SPREAD_LIMIT_PIPS) {
        log.push(`${tag} Spread Shield ACTIVE: ${pricing.spread.toFixed(1)} pips > ${SPREAD_LIMIT_PIPS} limit`);
        executions.push({ instrument, direction: '-', status: 'spread_blocked', detail: `spread=${pricing.spread.toFixed(1)}` });
        continue;
      }
      log.push(`${tag} Spread OK: ${pricing.spread.toFixed(2)} pips`);

      // ── 4b. Velocity Detection ──
      const candles = await fetchM5Candles(instrument, 24, apiToken, accountId);
      const velocity = detectVelocitySpike(candles, 1.5);

      // ── 4c. Direction: Sovereign Matrix as primary, velocity as confirmation ──
      const sovereignDir = await getSovereignDirection(instrument, sb);
      let finalDirection: 'BUY' | 'SELL' | null = null;

      if (sovereignDir && velocity.spike && velocity.direction === sovereignDir) {
        // Both agree — strong signal
        finalDirection = sovereignDir;
        log.push(`${tag} STRONG SIGNAL: Sovereign=${sovereignDir} + Velocity spike (${velocity.ratio.toFixed(1)}x) AGREE`);
      } else if (sovereignDir && velocity.spike) {
        // Divergence — skip
        log.push(`${tag} Direction conflict: Sovereign=${sovereignDir} vs Velocity=${velocity.direction}. Skipping.`);
        executions.push({ instrument, direction: '-', status: 'direction_conflict', detail: `sov=${sovereignDir} vel=${velocity.direction}` });
        continue;
      } else if (sovereignDir && !velocity.spike) {
        // No velocity confirmation — still trade if sovereign is clear
        finalDirection = sovereignDir;
        log.push(`${tag} Sovereign direction: ${sovereignDir} (no velocity spike, ratio=${velocity.ratio.toFixed(1)}x)`);
      } else {
        log.push(`${tag} No sovereign direction available, skipping`);
        executions.push({ instrument, direction: '-', status: 'no_direction', detail: 'no sovereign data' });
        continue;
      }

      // ── 4d. Position Sizing ──
      // units = riskDollars / (SL pips * pip value in account currency)
      // For simplicity: pip value ≈ $10 per standard lot (100k) for non-JPY, $8.50 for JPY
      const pipDollar = instrument.includes('JPY') ? 0.0085 : 0.0001;
      const units = Math.max(100, Math.floor(riskDollars / (SL_PIPS * pipDollar * 10)));

      // ── 4e. Execute ──
      log.push(`${tag} EXECUTING: ${finalDirection} ${units} units @ ${pricing.mid.toFixed(pricePrecision(instrument))}`);

      const signalId = `nyc-love-${instrument}-${Date.now()}`;

      // Record in DB first
      const { data: slotResult } = await sb.rpc('try_acquire_blend_slot', {
        p_agent_id: AGENT_ID,
        p_currency_pair: instrument,
        p_user_id: userId,
        p_signal_id: signalId,
        p_direction: finalDirection === 'BUY' ? 'long' : 'short',
        p_units: units,
        p_environment: ENVIRONMENT,
        p_confidence_score: velocity.spike ? velocity.ratio : 0.5,
        p_requested_price: pricing.mid,
      });

      if (!slotResult) {
        log.push(`${tag} Slot occupied (blend lock), skipping`);
        executions.push({ instrument, direction: finalDirection, status: 'slot_blocked', detail: 'blend slot occupied' });
        continue;
      }

      const orderId = slotResult as string;

      // Place on OANDA
      const result = await placeMarketOrder(instrument, units, finalDirection, pricing.mid, apiToken, accountId);

      if (result.success) {
        log.push(`${tag} ✅ FILLED — Trade ID: ${result.tradeId}`);
        await sb.from('oanda_orders').update({
          status: 'filled',
          oanda_trade_id: result.tradeId || null,
          entry_price: pricing.mid,
          session_label: 'newyork',
        }).eq('id', orderId);

        executions.push({ instrument, direction: finalDirection, status: 'filled', detail: `tradeId=${result.tradeId}` });
      } else {
        log.push(`${tag} ❌ REJECTED — ${result.error}`);
        await sb.from('oanda_orders').update({
          status: 'rejected',
          error_message: result.error?.slice(0, 500),
        }).eq('id', orderId);

        executions.push({ instrument, direction: finalDirection, status: 'rejected', detail: result.error || 'unknown' });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      agent: AGENT_ID,
      session: 'newyork',
      executions,
      log,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[NYC-LOVE] Fatal:', err);
    return new Response(JSON.stringify({
      success: false,
      error: (err as Error).message,
      log,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
