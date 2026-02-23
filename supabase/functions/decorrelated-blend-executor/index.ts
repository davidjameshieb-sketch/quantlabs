// Decorrelated Portfolio Blend — Precision Executor v2
// Mirrors the exact 5-component blend from Experimental Strategies Lab:
//
// #3v#8 · G1+G2+G3 · Swing low (5-bar) · Z-OFI > 2.0 · All Sessions · 44% weight
// #1v#6 · G1+G2+G3 · Atlas Wall -10  · Order block    · All Sessions · 22% weight
// #1v#7 · G1+G2+G3 · 2.0x ATR        · Order block    · All Sessions · 15% weight
// #3v#7 · G1+G2    · 30 pip fixed     · Order block    · All Sessions · 11% weight
// #3v#6 · G1+G2    · 2.0x ATR         · Order block    · All Sessions ·  9% weight

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

const ENVIRONMENT = 'practice' as const;
const TOTAL_RISK_UNITS = 5000;
const MAX_POSITIONS = 5;
const TP_RATIO = 2.0; // 2:1 R:R on all components

const OANDA_AVAILABLE = new Set([
  'EUR_USD', 'EUR_GBP', 'EUR_AUD', 'EUR_NZD', 'EUR_CAD', 'EUR_CHF', 'EUR_JPY',
  'GBP_USD', 'GBP_AUD', 'GBP_NZD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY',
  'AUD_USD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF', 'AUD_JPY',
  'NZD_USD', 'NZD_CAD', 'NZD_CHF', 'NZD_JPY',
  'USD_CAD', 'USD_CHF', 'USD_JPY',
  'CAD_CHF', 'CAD_JPY',
  'CHF_JPY',
]);

// ── Component Definitions (exact mirror of backtest) ──

interface BlendComponent {
  id: string;
  predatorRank: number;
  preyRank: number;
  requireG3: boolean;
  slType: 'swing_low_5' | 'atlas_wall_10' | 'atr_2x' | 'fixed_30';
  entryType: 'z_ofi_2' | 'order_block';
  weight: number;
  label: string;
}

const COMPONENTS: BlendComponent[] = [
  { id: '3v8', predatorRank: 3, preyRank: 8, requireG3: true,  slType: 'swing_low_5',   entryType: 'z_ofi_2',     weight: 0.44, label: '#3v#8 · G1+G2+G3 · Swing low (5-bar) · Z-OFI > 2.0' },
  { id: '1v6', predatorRank: 1, preyRank: 6, requireG3: true,  slType: 'atlas_wall_10', entryType: 'order_block', weight: 0.22, label: '#1v#6 · G1+G2+G3 · Atlas Wall -10 · Order block' },
  { id: '1v7', predatorRank: 1, preyRank: 7, requireG3: true,  slType: 'atr_2x',        entryType: 'order_block', weight: 0.15, label: '#1v#7 · G1+G2+G3 · 2.0x ATR · Order block' },
  { id: '3v7', predatorRank: 3, preyRank: 7, requireG3: false, slType: 'fixed_30',      entryType: 'order_block', weight: 0.11, label: '#3v#7 · G1+G2 · 30 pip fixed · Order block' },
  { id: '3v6', predatorRank: 3, preyRank: 6, requireG3: false, slType: 'atr_2x',        entryType: 'order_block', weight: 0.09, label: '#3v#6 · G1+G2 · 2.0x ATR · Order block' },
];

// ── Candle / Market Data Helpers ──

interface Candle {
  time: string;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

async function fetchCandles(instrument: string, count: number, apiToken: string): Promise<Candle[] | null> {
  const host = OANDA_HOSTS[ENVIRONMENT];
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.candles || [])
      .filter((c: { complete?: boolean }) => c.complete !== false)
      .map((c: { time: string; volume: number; mid: { h: string; l: string; o: string; c: string } }) => ({
        time: c.time,
        volume: c.volume,
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        open: parseFloat(c.mid.o),
        close: parseFloat(c.mid.c),
      }));
  } catch {
    return null;
  }
}

function pipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

function pricePrecision(instrument: string): number {
  return instrument.includes('JPY') ? 3 : 5;
}

function findInstrument(cur1: string, cur2: string): { instrument: string; inverted: boolean } | null {
  const direct = `${cur1}_${cur2}`;
  if (OANDA_AVAILABLE.has(direct)) return { instrument: direct, inverted: false };
  const inverse = `${cur2}_${cur1}`;
  if (OANDA_AVAILABLE.has(inverse)) return { instrument: inverse, inverted: true };
  return null;
}

// ── Technical Indicators ──

// ATR (14 period)
function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / period;
}

// Swing low (5-bar) for longs, swing high for shorts
function computeSwingStop(candles: Candle[], bars: number, direction: 'long' | 'short'): number {
  const recent = candles.slice(-bars);
  if (direction === 'long') return Math.min(...recent.map(c => c.low));
  return Math.max(...recent.map(c => c.high));
}

// Atlas Block: highest volume-efficiency candle in last 20
function findAtlasBlock(candles: Candle[], period = 20): { blockHigh: number; blockLow: number } | null {
  if (candles.length < period) return null;
  const recent = candles.slice(-period);
  const veffs = recent.map(c => {
    const range = Math.abs(c.high - c.low);
    return range === 0 ? 0 : c.volume / range;
  });
  const avgVeff = veffs.reduce((a, b) => a + b, 0) / veffs.length;
  const threshold = avgVeff * 1.5;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (veffs[i] > threshold) return { blockHigh: recent[i].high, blockLow: recent[i].low };
  }
  return null;
}

// Z-OFI: Z-score of Order Flow Imbalance
function computeZOFI(candles: Candle[], period = 20): number {
  if (candles.length < period + 1) return 0;
  const slice = candles.slice(-(period + 1));
  const ofiValues = slice.map(c => {
    const range = c.high - c.low || 0.0001;
    return c.volume * (c.close - c.open) / range;
  });
  const current = ofiValues[ofiValues.length - 1];
  const lookback = ofiValues.slice(0, -1);
  const mean = lookback.reduce((a, b) => a + b, 0) / lookback.length;
  const variance = lookback.reduce((a, b) => a + (b - mean) ** 2, 0) / lookback.length;
  const std = Math.sqrt(variance) || 1;
  return (current - mean) / std;
}

// Gate 2: Atlas Snap — 20-period breakout excluding current candle
function computeAtlasSnap(candles: Candle[], period = 20): { highest: number; lowest: number } {
  const lookback = candles.slice(0, -1);
  const slice = lookback.length >= period ? lookback.slice(-period) : lookback;
  return {
    highest: Math.max(...slice.map(c => c.high)),
    lowest: Math.min(...slice.map(c => c.low)),
  };
}

// Gate 3: David Vector — Linear Regression slope
function lrSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// ── SL Computation per Component ──

function computeSLDistance(
  comp: BlendComponent,
  candles: Candle[],
  direction: 'long' | 'short',
  currentPrice: number,
  pv: number
): number {
  switch (comp.slType) {
    case 'swing_low_5': {
      const swingLevel = computeSwingStop(candles, 5, direction);
      const dist = Math.abs(currentPrice - swingLevel);
      return dist < 3 * pv ? 10 * pv : dist; // min 3 pips fallback to 10
    }
    case 'atlas_wall_10': {
      const block = findAtlasBlock(candles, 20);
      if (block) {
        const wallLevel = direction === 'long' ? block.blockLow : block.blockHigh;
        return Math.abs(currentPrice - wallLevel) + 10 * pv;
      }
      return 15 * pv; // fallback
    }
    case 'atr_2x': {
      const atr = computeATR(candles, 14);
      const dist = atr * 2.0;
      return dist < 5 * pv ? 10 * pv : dist;
    }
    case 'fixed_30':
      return 30 * pv;
  }
}

// ── Entry Trigger Check ──

function checkEntryTrigger(
  comp: BlendComponent,
  candles: Candle[],
  direction: 'long' | 'short'
): { pass: boolean; detail: string } {
  if (comp.entryType === 'z_ofi_2') {
    const zofi = computeZOFI(candles, 20);
    const pass = direction === 'long' ? zofi > 2.0 : zofi < -2.0;
    return { pass, detail: `Z-OFI=${zofi.toFixed(2)}` };
  }
  // order_block: require atlas block existence
  const block = findAtlasBlock(candles, 20);
  if (!block) return { pass: false, detail: 'No order block found' };
  return { pass: true, detail: `OB=[${block.blockLow.toFixed(5)}-${block.blockHigh.toFixed(5)}]` };
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Step 1: Circuit breaker check ──
    const { data: activeBreakers } = await sb
      .from('gate_bypasses')
      .select('gate_id, reason')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .or('gate_id.like.CIRCUIT_BREAKER:%,gate_id.like.AGENT_SUSPEND:%')
      .limit(1);

    if (activeBreakers && activeBreakers.length > 0) {
      console.log(`[BLEND] 🔴 Circuit breaker active: ${activeBreakers[0].gate_id}`);
      return new Response(
        JSON.stringify({ success: false, reason: 'circuit_breaker_active', detail: activeBreakers[0].reason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 2: Check open positions ──
    const { data: openPositions } = await sb
      .from('oanda_orders')
      .select('currency_pair')
      .in('status', ['filled', 'open', 'submitted'])
      .eq('environment', ENVIRONMENT)
      .eq('agent_id', 'decorrelated-blend');

    const openPairs = new Set((openPositions || []).map(p => p.currency_pair));

    if (openPairs.size >= MAX_POSITIONS) {
      console.log(`[BLEND] Max positions (${MAX_POSITIONS}) reached`);
      return new Response(
        JSON.stringify({ success: true, reason: 'max_positions_reached', openCount: openPairs.size }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: Get currency ranks from sovereign-matrix ──
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

    if (!matrixRes.ok) {
      throw new Error(`Matrix scan failed: ${matrixRes.status} ${(await matrixRes.text()).slice(0, 200)}`);
    }

    const matrixData = await matrixRes.json();
    if (!matrixData.success || !matrixData.currencyRanks || !matrixData.sortedCurrencies) {
      throw new Error('Matrix returned incomplete data');
    }

    const currencyRanks: Record<string, number> = matrixData.currencyRanks;
    const sortedCurrencies: string[] = matrixData.sortedCurrencies;

    console.log(`[BLEND] Ranks: ${sortedCurrencies.map((c, i) => `#${i + 1}=${c}`).join(' ')}`);

    // ── Step 4: Spread guard check (one query for all) ──
    const { data: spreadGuards } = await sb
      .from('gate_bypasses')
      .select('pair')
      .like('gate_id', 'G16_SPREAD_GUARD:%')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString());

    const blockedPairs = new Set((spreadGuards || []).map(g => g.pair));

    // ── Step 5: Evaluate each component ──
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const oandaHost = OANDA_HOSTS[ENVIRONMENT];
    const userId = '00000000-0000-0000-0000-000000000000';

    const slotsAvailable = MAX_POSITIONS - openPairs.size;
    let slotsUsed = 0;

    const executionResults: Array<{
      component: string;
      label: string;
      pair: string;
      direction: string;
      status: string;
      units?: number;
      weight?: number;
      entryPrice?: number;
      slPrice?: number;
      tpPrice?: number;
      slType?: string;
      entryTrigger?: string;
      oandaTradeId?: string;
      error?: string;
      skipReason?: string;
    }> = [];

    for (const comp of COMPONENTS) {
      if (slotsUsed >= slotsAvailable) {
        executionResults.push({ component: comp.id, label: comp.label, pair: '-', direction: '-', status: 'skipped', skipReason: 'No slots available' });
        continue;
      }

      // Find currencies at the required ranks
      const predCurrency = sortedCurrencies[comp.predatorRank - 1];
      const preyCurrency = sortedCurrencies[comp.preyRank - 1];

      if (!predCurrency || !preyCurrency) {
        executionResults.push({ component: comp.id, label: comp.label, pair: '-', direction: '-', status: 'skipped', skipReason: `No currency at rank ${comp.predatorRank}/${comp.preyRank}` });
        continue;
      }

      // Find OANDA instrument
      const instrInfo = findInstrument(predCurrency, preyCurrency);
      if (!instrInfo) {
        executionResults.push({ component: comp.id, label: comp.label, pair: `${predCurrency}/${preyCurrency}`, direction: '-', status: 'skipped', skipReason: 'No OANDA instrument' });
        continue;
      }

      const { instrument, inverted } = instrInfo;
      // If predator is base → LONG; if inverted (prey is base) → SHORT
      const direction: 'long' | 'short' = inverted ? 'short' : 'long';

      // Duplicate check
      if (openPairs.has(instrument)) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Already open' });
        continue;
      }

      // Spread guard
      if (blockedPairs.has(instrument) || blockedPairs.has(instrument.replace('_', '/'))) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Spread guard active' });
        continue;
      }

      // Fetch candles for this pair
      const candles = await fetchCandles(instrument, 30, apiToken);
      if (!candles || candles.length < 21) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: `Insufficient candles (${candles?.length ?? 0})` });
        continue;
      }

      const currentPrice = candles[candles.length - 1].close;
      const pv = pipValue(instrument);
      const prec = pricePrecision(instrument);

      // ── Gate 2: Atlas Snap (20-period breakout) ──
      const snap = computeAtlasSnap(candles, 20);
      const gate2 = direction === 'long' ? currentPrice > snap.highest : currentPrice < snap.lowest;

      if (!gate2) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: `G2 Atlas Snap fail (close=${currentPrice.toFixed(prec)} hi=${snap.highest.toFixed(prec)} lo=${snap.lowest.toFixed(prec)})` });
        continue;
      }

      // ── Gate 3: David Vector (if required) ──
      if (comp.requireG3) {
        const closes = candles.slice(-20).map(c => c.close);
        const slope = lrSlope(closes);
        const gate3 = direction === 'long' ? slope > 0 : slope < 0;
        if (!gate3) {
          executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: `G3 David Vector fail (slope=${slope.toExponential(3)})` });
          continue;
        }
      }

      // ── Entry Trigger ──
      const trigger = checkEntryTrigger(comp, candles, direction);
      if (!trigger.pass) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: `Entry trigger fail: ${trigger.detail}` });
        continue;
      }

      // ── Compute SL/TP ──
      const slDistance = computeSLDistance(comp, candles, direction, currentPrice, pv);
      const slPrice = direction === 'long' ? currentPrice - slDistance : currentPrice + slDistance;
      const tpPrice = direction === 'long' ? currentPrice + slDistance * TP_RATIO : currentPrice - slDistance * TP_RATIO;

      // ── Weighted position sizing ──
      const units = Math.max(1, Math.round(TOTAL_RISK_UNITS * comp.weight));
      const signedUnits = direction === 'short' ? -units : units;

      const gateLabel = comp.requireG3 ? 'G1+G2+G3' : 'G1+G2';
      const signalId = `blend-${comp.id}-${instrument}-${Date.now()}`;
      const slPips = Math.round(slDistance / pv * 10) / 10;

      console.log(`[BLEND] 🎯 ${comp.id} → ${instrument} ${direction.toUpperCase()} ${units}u | ${gateLabel} | SL=${comp.slType}(${slPips}p) | Entry=${trigger.detail}`);

      try {
        // Insert pending order
        const { data: dbOrder, error: dbErr } = await sb
          .from('oanda_orders')
          .insert({
            user_id: userId,
            signal_id: signalId,
            currency_pair: instrument,
            direction,
            units,
            agent_id: 'decorrelated-blend',
            environment: ENVIRONMENT,
            status: 'submitted',
            confidence_score: comp.weight,
          })
          .select('id')
          .single();

        if (dbErr) {
          console.error(`[BLEND] DB error for ${instrument}:`, dbErr.message);
          executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'db_error', error: dbErr.message });
          continue;
        }

        // Execute on OANDA
        const orderTs = Date.now();
        const orderBody = {
          order: {
            type: 'MARKET',
            instrument,
            units: signedUnits.toString(),
            timeInForce: 'FOK',
            positionFill: 'DEFAULT',
            stopLossOnFill: { price: slPrice.toFixed(prec), timeInForce: 'GTC' },
            takeProfitOnFill: { price: tpPrice.toFixed(prec), timeInForce: 'GTC' },
          },
        };

        const oandaRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(orderBody),
        });

        const oandaData = await oandaRes.json();
        const fillLatency = Date.now() - orderTs;

        if (!oandaRes.ok) {
          const errMsg = oandaData.errorMessage || oandaData.rejectReason || `OANDA ${oandaRes.status}`;
          console.error(`[BLEND] OANDA rejected ${instrument}: ${errMsg}`);
          await sb.from('oanda_orders').update({ status: 'rejected', error_message: errMsg }).eq('id', dbOrder.id);
          executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'rejected', error: errMsg });
          continue;
        }

        // Extract fill
        const oandaOrderId = oandaData.orderCreateTransaction?.id || oandaData.orderFillTransaction?.orderID || null;
        const oandaTradeId = oandaData.orderFillTransaction?.tradeOpened?.tradeID || oandaData.orderFillTransaction?.id || null;
        const filledPrice = oandaData.orderFillTransaction?.price ? parseFloat(oandaData.orderFillTransaction.price) : null;

        const pipMult = instrument.includes('JPY') ? 100 : 10000;
        const slippagePips = filledPrice != null ? Math.abs((filledPrice - currentPrice) * pipMult) : null;

        await sb.from('oanda_orders').update({
          status: 'filled',
          oanda_order_id: oandaOrderId,
          oanda_trade_id: oandaTradeId,
          entry_price: filledPrice,
          requested_price: currentPrice,
          slippage_pips: slippagePips,
          fill_latency_ms: fillLatency,
          gate_result: gateLabel,
          gate_reasons: [
            `Component: ${comp.id} (${(comp.weight * 100).toFixed(0)}% weight)`,
            `Rank: ${predCurrency}(#${comp.predatorRank}) vs ${preyCurrency}(#${comp.preyRank})`,
            `SL: ${comp.slType} (${slPips} pips)`,
            `Entry: ${comp.entryType} — ${trigger.detail}`,
          ],
        }).eq('id', dbOrder.id);

        console.log(`[BLEND] ✅ ${comp.id} ${instrument} ${direction.toUpperCase()} ${units}u @ ${filledPrice} (SL=${slPrice.toFixed(prec)} TP=${tpPrice.toFixed(prec)}) [${fillLatency}ms]`);

        executionResults.push({
          component: comp.id,
          label: comp.label,
          pair: instrument,
          direction,
          status: 'filled',
          units,
          weight: comp.weight,
          entryPrice: filledPrice ?? undefined,
          slPrice: parseFloat(slPrice.toFixed(prec)),
          tpPrice: parseFloat(tpPrice.toFixed(prec)),
          slType: `${comp.slType} (${slPips}p)`,
          entryTrigger: trigger.detail,
          oandaTradeId: oandaTradeId ?? undefined,
        });

        slotsUsed++;
        openPairs.add(instrument);

        // Rate-limit cooldown between orders
        await new Promise(r => setTimeout(r, 300));

      } catch (execErr) {
        console.error(`[BLEND] Execution error ${instrument}:`, (execErr as Error).message);
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'error', error: (execErr as Error).message });
      }
    }

    const filled = executionResults.filter(r => r.status === 'filled').length;
    const skipped = executionResults.filter(r => r.status === 'skipped').length;
    const errors = executionResults.filter(r => !['filled', 'skipped'].includes(r.status)).length;

    console.log(`[BLEND] Cycle complete: ${filled} filled, ${skipped} skipped, ${errors} errors, ${openPairs.size} total open`);

    return new Response(
      JSON.stringify({
        success: true,
        cycle: {
          componentsEvaluated: COMPONENTS.length,
          executed: filled,
          skipped,
          errors,
          existingPositions: openPairs.size,
          maxPositions: MAX_POSITIONS,
        },
        currencyRanks,
        sortedCurrencies,
        executions: executionResults,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[BLEND] Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
