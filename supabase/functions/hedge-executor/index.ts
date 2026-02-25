// Atlas Snap Hedge Matrix — Dedicated Executor
// Executes rank-divergence hedge legs: #1v#8 (50%), #2v#7 (30%), #3v#6 (20%)
// Reads activation state from agent_configs, uses correct agent_id for tracking

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const HEDGE_AGENT_ID = 'experimental-lab-atlas-hedge-matrix';
const ENVIRONMENT = 'practice' as const;
const RISK_FRACTION = 0.05; // 5% equity risk per trade
const MAX_POSITIONS = 3; // One per hedge leg

const OANDA_HOST = 'https://api-fxpractice.oanda.com';

const OANDA_AVAILABLE = new Set([
  'EUR_USD', 'EUR_GBP', 'EUR_AUD', 'EUR_NZD', 'EUR_CAD', 'EUR_CHF', 'EUR_JPY',
  'GBP_USD', 'GBP_AUD', 'GBP_NZD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY',
  'AUD_USD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF', 'AUD_JPY',
  'NZD_USD', 'NZD_CAD', 'NZD_CHF', 'NZD_JPY',
  'USD_CAD', 'USD_CHF', 'USD_JPY',
  'CAD_CHF', 'CAD_JPY', 'CHF_JPY',
]);

// Hedge legs: long the strongest, short the weakest (rank divergence)
const HEDGE_LEGS = [
  { id: 'leg1', strongRank: 1, weakRank: 8, weight: 0.50, label: '#1 vs #8 — Primary Divergence', slPips: 25, tpRatio: 2.0 },
  { id: 'leg2', strongRank: 2, weakRank: 7, weight: 0.30, label: '#2 vs #7 — Secondary Spread', slPips: 25, tpRatio: 2.0 },
  { id: 'leg3', strongRank: 3, weakRank: 6, weight: 0.20, label: '#3 vs #6 — Tertiary Dampener', slPips: 30, tpRatio: 1.8 },
];

// ── Helpers ──

function findInstrument(cur1: string, cur2: string): { instrument: string; inverted: boolean } | null {
  const direct = `${cur1}_${cur2}`;
  if (OANDA_AVAILABLE.has(direct)) return { instrument: direct, inverted: false };
  const inverse = `${cur2}_${cur1}`;
  if (OANDA_AVAILABLE.has(inverse)) return { instrument: inverse, inverted: true };
  return null;
}

function pipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

function pricePrecision(instrument: string): number {
  return instrument.includes('JPY') ? 3 : 5;
}

interface Candle { time: string; volume: number; high: number; low: number; open: number; close: number; }

async function fetchCandles(instrument: string, count: number, apiToken: string): Promise<Candle[] | null> {
  try {
    const res = await fetch(
      `${OANDA_HOST}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`,
      { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.candles || [])
      .filter((c: any) => c.complete !== false)
      .map((c: any) => ({
        time: c.time, volume: c.volume,
        high: parseFloat(c.mid.h), low: parseFloat(c.mid.l),
        open: parseFloat(c.mid.o), close: parseFloat(c.mid.c),
      }));
  } catch { return null; }
}

function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < period) return 0;
  return candles.slice(-period).reduce((s, c) => s + (c.high - c.low), 0) / period;
}

// Atlas Snap gate: price must break the 20-bar high/low
function atlasSnapGate(candles: Candle[], direction: 'long' | 'short'): boolean {
  if (candles.length < 21) return false;
  const lookback = candles.slice(-21, -1); // exclude current
  const highest = Math.max(...lookback.map(c => c.high));
  const lowest = Math.min(...lookback.map(c => c.low));
  const current = candles[candles.length - 1].close;
  return direction === 'long' ? current > highest : current < lowest;
}

// David Vector gate: linear regression slope must agree with direction
function davidVectorGate(candles: Candle[], direction: 'long' | 'short'): boolean {
  const closes = candles.slice(-20).map(c => c.close);
  const n = closes.length;
  if (n < 2) return false;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) { sumX += i; sumY += closes[i]; sumXY += i * closes[i]; sumX2 += i * i; }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return direction === 'long' ? slope > 0 : slope < 0;
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const userId = '00000000-0000-0000-0000-000000000000';

    // ── Step 1: Check if hedge strategy is active ──
    const { data: agentConfig } = await sb
      .from('agent_configs')
      .select('*')
      .eq('agent_id', HEDGE_AGENT_ID)
      .single();

    if (!agentConfig || !agentConfig.is_active) {
      console.log('[HEDGE] Strategy is not active, skipping cycle');
      return new Response(
        JSON.stringify({ success: true, reason: 'strategy_inactive' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[HEDGE] ══════ Atlas Snap Hedge Matrix — Execution Cycle ══════');

    // ── Step 2: Circuit breaker check ──
    const { data: breakers } = await sb
      .from('gate_bypasses')
      .select('gate_id, reason')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .or('gate_id.like.CIRCUIT_BREAKER:%,gate_id.like.AGENT_SUSPEND:%')
      .limit(1);

    if (breakers && breakers.length > 0) {
      console.log(`[HEDGE] 🔴 Circuit breaker active: ${breakers[0].gate_id}`);
      return new Response(
        JSON.stringify({ success: false, reason: 'circuit_breaker_active', detail: breakers[0].reason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: Check existing hedge positions ──
    const { data: openPositions } = await sb
      .from('oanda_orders')
      .select('currency_pair, agent_id')
      .in('status', ['filled', 'open', 'submitted'])
      .eq('environment', ENVIRONMENT)
      .eq('agent_id', HEDGE_AGENT_ID);

    const openPairs = new Set((openPositions || []).map(p => p.currency_pair));

    if (openPairs.size >= MAX_POSITIONS) {
      console.log(`[HEDGE] All ${MAX_POSITIONS} hedge legs already open`);
      return new Response(
        JSON.stringify({ success: true, reason: 'all_legs_open', openCount: openPairs.size }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 4: Get currency ranks from sovereign-matrix ──
    const matrixRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/sovereign-matrix`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        },
        body: JSON.stringify({ environment: ENVIRONMENT }),
      }
    );

    if (!matrixRes.ok) throw new Error(`Matrix scan failed: ${matrixRes.status}`);
    const matrixData = await matrixRes.json();
    if (!matrixData.success || !matrixData.sortedCurrencies) throw new Error('Matrix returned incomplete data');

    const sorted: string[] = matrixData.sortedCurrencies;
    const ranks: Record<string, number> = matrixData.currencyRanks;
    console.log(`[HEDGE] Ranks: ${sorted.map((c, i) => `#${i + 1}=${c}`).join(' ')}`);

    // ── Step 5: Fetch account equity for dynamic sizing ──
    let accountEquity = 1000;
    try {
      const acctRes = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/summary`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      });
      if (acctRes.ok) {
        const acctData = await acctRes.json();
        accountEquity = parseFloat(acctData.account?.NAV || acctData.account?.balance || '1000');
        console.log(`[HEDGE] Account equity: $${accountEquity.toFixed(2)}`);
      }
    } catch (e) {
      console.warn('[HEDGE] Could not fetch equity, using fallback:', (e as Error).message);
    }

    // ── Step 6: Evaluate and execute each hedge leg ──
    const results: any[] = [];

    for (const leg of HEDGE_LEGS) {
      const strongCcy = sorted[leg.strongRank - 1];
      const weakCcy = sorted[leg.weakRank - 1];

      if (!strongCcy || !weakCcy) {
        results.push({ leg: leg.id, label: leg.label, status: 'skipped', reason: 'Missing rank currency' });
        continue;
      }

      // We want to go LONG the strong currency vs the weak currency
      const instrInfo = findInstrument(strongCcy, weakCcy);
      if (!instrInfo) {
        results.push({ leg: leg.id, label: leg.label, pair: `${strongCcy}/${weakCcy}`, status: 'skipped', reason: 'No OANDA instrument' });
        continue;
      }

      const { instrument, inverted } = instrInfo;
      // If pair is inverted (e.g. we want long NZD/USD but instrument is USD/NZD), we short instead
      const direction: 'long' | 'short' = inverted ? 'short' : 'long';

      if (openPairs.has(instrument)) {
        results.push({ leg: leg.id, label: leg.label, pair: instrument, status: 'skipped', reason: 'Already open' });
        continue;
      }

      // Fetch candles
      const candles = await fetchCandles(instrument, 30, apiToken);
      if (!candles || candles.length < 21) {
        results.push({ leg: leg.id, label: leg.label, pair: instrument, status: 'skipped', reason: `Insufficient candles (${candles?.length ?? 0})` });
        continue;
      }

      const currentPrice = candles[candles.length - 1].close;
      const pv = pipValue(instrument);
      const prec = pricePrecision(instrument);

      // Gate bypass: skip G2/G3 — raw rank-divergence
      console.log(`[HEDGE] ⚡ ${leg.label} → gates bypassed, raw rank signal`);

      // Compute SL using ATR-based method, floored at leg.slPips
      const atr = computeATR(candles, 14);
      const atrSL = atr * 2.0;
      const minSL = leg.slPips * pv;
      const slDistance = Math.max(atrSL, minSL);
      const slPips = Math.round(slDistance / pv);

      const slPrice = direction === 'long' ? currentPrice - slDistance : currentPrice + slDistance;
      const tpDistance = slDistance * leg.tpRatio;
      const tpPrice = direction === 'long' ? currentPrice + tpDistance : currentPrice - tpDistance;

      // Dynamic position sizing: 5% equity * leg weight / SL distance
      const riskAmount = accountEquity * RISK_FRACTION * leg.weight;
      const units = Math.max(1, Math.round(riskAmount / slDistance));
      const signedUnits = direction === 'short' ? -units : units;

      const signalId = `hedge-${leg.id}-${instrument}-${Date.now()}`;

      console.log(`[HEDGE] 🎯 ${leg.label} → ${instrument} ${direction.toUpperCase()} ${units}u | SL=${slPips}p | Risk=$${riskAmount.toFixed(0)}`);

      try {
        // Insert order record
        const { data: dbOrder, error: dbErr } = await sb
          .from('oanda_orders')
          .insert({
            user_id: userId,
            signal_id: signalId,
            currency_pair: instrument,
            direction,
            units,
            agent_id: HEDGE_AGENT_ID,
            environment: ENVIRONMENT,
            status: 'submitted',
            confidence_score: leg.weight,
            r_pips: slPips,
          })
          .select('id')
          .single();

        if (dbErr) {
          console.error(`[HEDGE] DB error for ${instrument}:`, dbErr.message);
          results.push({ leg: leg.id, label: leg.label, pair: instrument, status: 'db_error', error: dbErr.message });
          continue;
        }

        // ── Fetch bid/ask for LIMIT order placement ──
        let limitPrice = currentPrice;
        try {
          const pricingRes = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/pricing?instruments=${instrument}`, {
            headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
          });
          if (pricingRes.ok) {
            const pData = await pricingRes.json();
            const p = pData.prices?.[0];
            if (p) {
              const bid = parseFloat(p.bids?.[0]?.price || p.closeoutBid);
              const ask = parseFloat(p.asks?.[0]?.price || p.closeoutAsk);
              const mid = (bid + ask) / 2;
              const trapOffset = pv * 2; // 2 pips (2 * 0.0001 = 0.0002)
              limitPrice = direction === 'long' ? mid - trapOffset : mid + trapOffset;
            }
          }
        } catch {}

        // Recalculate SL/TP relative to limit price
        const adjSlPrice = direction === 'long' ? limitPrice - slDistance : limitPrice + slDistance;
        const adjTpPrice = direction === 'long' ? limitPrice + tpDistance : limitPrice - tpDistance;
        const limitExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Execute LIMIT ORDER on OANDA
        const orderTs = Date.now();
        const oandaRes = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            order: {
              type: 'LIMIT',
              instrument,
              units: signedUnits.toString(),
              price: limitPrice.toFixed(prec),
              timeInForce: 'GTD',
              gtdTime: limitExpiry,
              positionFill: 'DEFAULT',
              triggerCondition: 'DEFAULT',
              stopLossOnFill: { price: adjSlPrice.toFixed(prec), timeInForce: 'GTC' },
              takeProfitOnFill: { price: adjTpPrice.toFixed(prec), timeInForce: 'GTC' },
            },
          }),
        });

        const oandaData = await oandaRes.json();
        const fillLatency = Date.now() - orderTs;

        if (!oandaRes.ok) {
          const errMsg = oandaData.errorMessage || oandaData.rejectReason || `OANDA ${oandaRes.status}`;
          console.error(`[HEDGE] ❌ OANDA rejected ${instrument}: ${errMsg}`);
          await sb.from('oanda_orders').update({ status: 'rejected', error_message: errMsg }).eq('id', dbOrder.id);
          results.push({ leg: leg.id, label: leg.label, pair: instrument, direction, status: 'rejected', error: errMsg });
          continue;
        }

        const oandaOrderId = oandaData.orderCreateTransaction?.id || null;
        const oandaTradeId = oandaData.orderFillTransaction?.tradeOpened?.tradeID || null;
        const filledPrice = oandaData.orderFillTransaction?.price ? parseFloat(oandaData.orderFillTransaction.price) : null;
        const wasImmediatelyFilled = filledPrice != null;
        const pipMult = instrument.includes('JPY') ? 100 : 10000;
        const slippagePips = filledPrice ? Math.abs((filledPrice - limitPrice) * pipMult) : null;

        await sb.from('oanda_orders').update({
          status: wasImmediatelyFilled ? 'filled' : 'open',
          oanda_order_id: oandaOrderId,
          oanda_trade_id: oandaTradeId,
          entry_price: filledPrice,
          requested_price: limitPrice,
          slippage_pips: slippagePips,
          fill_latency_ms: fillLatency,
          gate_result: 'G1-RAW',
          gate_reasons: [
            `Hedge Leg: ${leg.label}`,
            `Strong: ${strongCcy}(#${leg.strongRank}) vs Weak: ${weakCcy}(#${leg.weakRank})`,
            `LIMIT @ ${limitPrice.toFixed(prec)} (mid±2p trap) | Expires: ${limitExpiry}`,
            `SL: ATR-based ${slPips} pips | TP: ${leg.tpRatio}R`,
          ],
        }).eq('id', dbOrder.id);

        const statusLabel = wasImmediatelyFilled ? 'filled' : 'pending_limit';
        console.log(`[HEDGE] ✅ ${leg.label} → ${instrument} ${direction.toUpperCase()} LIMIT ${units}u @ ${limitPrice.toFixed(prec)} [${statusLabel}] [${fillLatency}ms]`);

        results.push({
          leg: leg.id, label: leg.label, pair: instrument, direction,
          status: statusLabel, units, entryPrice: filledPrice ?? limitPrice,
          slPrice: parseFloat(adjSlPrice.toFixed(prec)),
          tpPrice: parseFloat(adjTpPrice.toFixed(prec)),
          slPips, oandaTradeId: oandaTradeId ?? oandaOrderId,
        });

        openPairs.add(instrument);
        await new Promise(r => setTimeout(r, 300)); // rate limit buffer

      } catch (execErr) {
        console.error(`[HEDGE] Execution error ${instrument}:`, (execErr as Error).message);
        results.push({ leg: leg.id, label: leg.label, pair: instrument, status: 'error', error: (execErr as Error).message });
      }
    }

    const filled = results.filter(r => r.status === 'filled').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    console.log(`[HEDGE] ══════ Cycle complete: ${filled} filled, ${skipped} skipped ══════`);

    return new Response(
      JSON.stringify({
        success: true,
        agentId: HEDGE_AGENT_ID,
        cycle: { legsEvaluated: HEDGE_LEGS.length, filled, skipped, openPositions: openPairs.size },
        currencyRanks: ranks,
        sortedCurrencies: sorted,
        legs: results,
        accountEquity,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[HEDGE] Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
