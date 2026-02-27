// NYC Love Agent — Edge Function
// Strategy: Sovereign VolStop Triple-Lock
// 3 Volatility Stop shields on M1 candles — Macro(100,3.5), Meso(50,2.5), Micro(20,1.5)
// Entry: First M1 close above/below all 3 shields (max 3 candle chase)
// Exit: Micro shield break closes trade immediately
// Session: ALL SESSIONS — 6 major pairs only

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OANDA_HOST = 'https://api-fxpractice.oanda.com';
const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD'];
const AGENT_ID = 'nyc-love';
const ENVIRONMENT = 'practice';

// ── VolStop Shield Configuration ──
const MACRO = { period: 100, mult: 3.5 };
const MESO  = { period: 50,  mult: 2.5 };
const MICRO = { period: 20,  mult: 1.5 };

const MAX_CHASE_CANDLES = 3; // Don't chase if alignment started >3 candles ago
const ACCOUNT_RISK_PCT = 0.05; // 5% account risk per trade

function pipValue(inst: string): number { return inst.includes('JPY') ? 0.01 : 0.0001; }
function pricePrecision(inst: string): number { return inst.includes('JPY') ? 3 : 5; }
function pipScale(inst: string): number { return inst.includes('JPY') ? 100 : 10000; }

// ══════════════════════════════════════════
// OANDA DATA LAYER
// ══════════════════════════════════════════

async function fetchM1Candles(
  instrument: string, count: number, apiToken: string, accountId: string,
): Promise<{ close: number; high: number; low: number; open: number; time: string }[]> {
  try {
    const res = await fetch(
      `${OANDA_HOST}/v3/instruments/${instrument}/candles?count=${count}&granularity=M1&price=M`,
      { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.candles || [])
      .filter((c: any) => c.complete !== false)
      .map((c: any) => ({
        close: parseFloat(c.mid.c),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        open: parseFloat(c.mid.o),
        time: c.time,
      }));
  } catch { return []; }
}

async function fetchBatchPricing(
  instruments: string[], apiToken: string, accountId: string,
): Promise<Record<string, { bid: number; ask: number; spread: number; mid: number }>> {
  const result: Record<string, { bid: number; ask: number; spread: number; mid: number }> = {};
  try {
    const joined = instruments.join(',');
    const res = await fetch(
      `${OANDA_HOST}/v3/accounts/${accountId}/pricing?instruments=${joined}`,
      { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } },
    );
    if (!res.ok) return result;
    const data = await res.json();
    for (const p of (data.prices || [])) {
      if (!p?.bids?.length || !p?.asks?.length) continue;
      const bid = parseFloat(p.bids[0].price);
      const ask = parseFloat(p.asks[0].price);
      const inst = p.instrument as string;
      result[inst] = { bid, ask, spread: (ask - bid) * pipScale(inst), mid: (bid + ask) / 2 };
    }
  } catch { /* empty */ }
  return result;
}

async function getAccountSummary(
  apiToken: string, accountId: string,
): Promise<{ nav: number; marginAvailable: number; leverage: number }> {
  try {
    const res = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    const data = await res.json();
    const acct = data.account || {};
    return {
      nav: parseFloat(acct.NAV || '0'),
      marginAvailable: parseFloat(acct.marginAvailable || '0'),
      leverage: parseFloat(acct.marginRate || '0.02') > 0 ? 1 / parseFloat(acct.marginRate || '0.02') : 50,
    };
  } catch { return { nav: 0, marginAvailable: 0, leverage: 50 }; }
}

async function hasOpenPosition(instrument: string, sb: ReturnType<typeof createClient>): Promise<boolean> {
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
// VOLSTOP CALCULATION
// ══════════════════════════════════════════
// Volatility Stop = trailing stop based on ATR.
// When price is above the stop → bullish; below → bearish.
// The stop flips direction when price crosses it.

interface VolStopResult {
  value: number;       // current stop level (price)
  trend: 'bull' | 'bear';
  slope: number;       // rate of change (0 = flat)
}

function calculateATR(candles: { high: number; low: number; close: number }[], period: number): number[] {
  const atrs: number[] = [];
  if (candles.length < 2) return atrs;

  // First TR
  let prevClose = candles[0].close;
  let atr = candles[0].high - candles[0].low;
  atrs.push(atr);

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    // Wilder smoothing
    atr = (atr * (period - 1) + tr) / period;
    atrs.push(atr);
    prevClose = c.close;
  }
  return atrs;
}

function calculateVolStop(
  candles: { close: number; high: number; low: number }[],
  period: number,
  multiplier: number,
): VolStopResult {
  if (candles.length < period + 5) {
    return { value: candles[candles.length - 1]?.close || 0, trend: 'bull', slope: 0 };
  }

  const atrs = calculateATR(candles, period);

  // Walk through candles maintaining VolStop state
  let trend: 'bull' | 'bear' = 'bull';
  let stop = candles[0].close - atrs[0] * multiplier; // initial bullish stop
  let prevStop = stop;

  for (let i = 1; i < candles.length; i++) {
    const atr = atrs[i] * multiplier;
    const close = candles[i].close;

    if (trend === 'bull') {
      // In bull trend, stop trails below price
      const newStop = close - atr;
      stop = Math.max(stop, newStop); // stop can only go UP in bull
      if (close < stop) {
        // Flip to bear
        trend = 'bear';
        stop = close + atr;
      }
    } else {
      // In bear trend, stop trails above price
      const newStop = close + atr;
      stop = Math.min(stop, newStop); // stop can only go DOWN in bear
      if (close > stop) {
        // Flip to bull
        trend = 'bull';
        stop = close - atr;
      }
    }

    if (i === candles.length - 2) prevStop = stop;
  }

  // Slope = change in stop over last candle (normalized)
  const slope = candles.length >= 2 ? stop - prevStop : 0;

  return { value: stop, trend, slope };
}

// ══════════════════════════════════════════
// TRIPLE-LOCK ALIGNMENT CHECK
// ══════════════════════════════════════════

interface TripleLockSignal {
  direction: 'long' | 'short' | null;
  macro: VolStopResult;
  meso: VolStopResult;
  micro: VolStopResult;
  macroFlat: boolean;
  candlesSinceAlignment: number; // how many candles ago alignment started
  mesoDistance: number;          // pips from entry to meso shield (for SL)
  detail: string;
}

function analyzeTripleLock(
  candles: { close: number; high: number; low: number; open: number }[],
  instrument: string,
): TripleLockSignal {
  const noSignal = (msg: string, macro: VolStopResult, meso: VolStopResult, micro: VolStopResult, flat: boolean): TripleLockSignal => ({
    direction: null, macro, meso, micro, macroFlat: flat, candlesSinceAlignment: 999, mesoDistance: 0, detail: msg,
  });

  if (candles.length < MACRO.period + 10) {
    const def: VolStopResult = { value: 0, trend: 'bull', slope: 0 };
    return noSignal('Insufficient candles for VolStop calculation', def, def, def, true);
  }

  const macro = calculateVolStop(candles, MACRO.period, MACRO.mult);
  const meso  = calculateVolStop(candles, MESO.period, MESO.mult);
  const micro = calculateVolStop(candles, MICRO.period, MICRO.mult);

  const ps = pipScale(instrument);

  // ── PRIMARY FILTER: Macro slope must be non-zero ──
  const macroSlopePips = Math.abs(macro.slope) * ps;
  const macroFlat = macroSlopePips < 0.1; // less than 0.1 pip movement = flat

  if (macroFlat) {
    return noSignal(
      `Macro shield FLAT (slope=${macroSlopePips.toFixed(2)}p) — all signals void`,
      macro, meso, micro, true,
    );
  }

  const latestClose = candles[candles.length - 1].close;

  // Check current alignment
  const allBull = latestClose > macro.value && latestClose > meso.value && latestClose > micro.value;
  const allBear = latestClose < macro.value && latestClose < meso.value && latestClose < micro.value;

  if (!allBull && !allBear) {
    return noSignal(
      `No Triple-Lock: close=${latestClose.toFixed(pricePrecision(instrument))} ` +
      `macro=${macro.value.toFixed(pricePrecision(instrument))}(${macro.trend}) ` +
      `meso=${meso.value.toFixed(pricePrecision(instrument))}(${meso.trend}) ` +
      `micro=${micro.value.toFixed(pricePrecision(instrument))}(${micro.trend})`,
      macro, meso, micro, false,
    );
  }

  const direction = allBull ? 'long' as const : 'short' as const;

  // ── STRIKE CONDITION: Count how many candles the alignment has persisted ──
  // Walk backwards to find when alignment first started
  let candlesSinceAlignment = 0;
  for (let i = candles.length - 1; i >= MACRO.period + 5; i--) {
    // Recalculate VolStops at candle i (approximate: use same final values)
    // For efficiency, just check if close was on the same side of shields
    // This is an approximation — the shields shift, but for chase detection it works
    const c = candles[i].close;
    const aligned = direction === 'long'
      ? c > macro.value && c > meso.value && c > micro.value
      : c < macro.value && c < meso.value && c < micro.value;
    if (!aligned) break;
    candlesSinceAlignment++;
  }

  // Meso distance for SL calculation
  const mesoDistance = Math.abs(latestClose - meso.value) * ps;

  const chaseBlocked = candlesSinceAlignment > MAX_CHASE_CANDLES;

  if (chaseBlocked) {
    return {
      direction: null, macro, meso, micro, macroFlat: false,
      candlesSinceAlignment, mesoDistance,
      detail: `Triple-Lock ${direction.toUpperCase()} but CHASE BLOCKED (${candlesSinceAlignment} candles > ${MAX_CHASE_CANDLES} max)`,
    };
  }

  return {
    direction, macro, meso, micro, macroFlat: false,
    candlesSinceAlignment, mesoDistance,
    detail: `✅ TRIPLE-LOCK ${direction.toUpperCase()} — candle ${candlesSinceAlignment} of alignment. Meso SL=${mesoDistance.toFixed(1)}p`,
  };
}

// ══════════════════════════════════════════
// MICRO-KILL EXIT CHECK
// ══════════════════════════════════════════
// Check if any open trade should be closed because M1 close crossed the Micro shield

async function checkMicroKillExits(
  sb: ReturnType<typeof createClient>,
  apiToken: string,
  accountId: string,
  log: string[],
): Promise<{ instrument: string; tradeId: string; reason: string }[]> {
  const exits: { instrument: string; tradeId: string; reason: string }[] = [];

  // Get all open trades for this agent
  const { data: openTrades } = await sb
    .from('oanda_orders')
    .select('id, currency_pair, direction, oanda_trade_id')
    .eq('agent_id', AGENT_ID)
    .eq('environment', ENVIRONMENT)
    .in('status', ['filled', 'open'])
    .not('oanda_trade_id', 'is', null);

  if (!openTrades || openTrades.length === 0) return exits;

  for (const trade of openTrades) {
    const instrument = trade.currency_pair;
    const candles = await fetchM1Candles(instrument, MICRO.period + 10, apiToken, accountId);
    if (candles.length < MICRO.period + 5) continue;

    const candleData = candles.map(c => ({ close: c.close, high: c.high, low: c.low, open: c.open }));
    const micro = calculateVolStop(candleData, MICRO.period, MICRO.mult);
    const latestClose = candles[candles.length - 1].close;
    const prec = pricePrecision(instrument);

    // MICRO-KILL: Long closed below micro | Short closed above micro
    if (trade.direction === 'long' && latestClose < micro.value) {
      log.push(`[${instrument}] 💀 MICRO-KILL EXIT: Long trade — close ${latestClose.toFixed(prec)} < micro ${micro.value.toFixed(prec)}`);
      exits.push({ instrument, tradeId: trade.oanda_trade_id!, reason: 'micro_kill_long' });
    } else if (trade.direction === 'short' && latestClose > micro.value) {
      log.push(`[${instrument}] 💀 MICRO-KILL EXIT: Short trade — close ${latestClose.toFixed(prec)} > micro ${micro.value.toFixed(prec)}`);
      exits.push({ instrument, tradeId: trade.oanda_trade_id!, reason: 'micro_kill_short' });
    }
  }

  return exits;
}

async function closeOandaTrade(
  tradeId: string, apiToken: string, accountId: string,
): Promise<{ success: boolean; price?: number; error?: string }> {
  try {
    const res = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/trades/${tradeId}/close`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ units: 'ALL' }),
    });
    const data = await res.json();
    if (data.orderFillTransaction) {
      return { success: true, price: parseFloat(data.orderFillTransaction.price || '0') };
    }
    return { success: false, error: JSON.stringify(data).slice(0, 300) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ══════════════════════════════════════════
// ORDER EXECUTION (Market Order with Meso-based SL, no TP — Micro-Kill handles exit)
// ══════════════════════════════════════════

async function placeMarketOrder(
  instrument: string, units: number, direction: 'long' | 'short',
  bid: number, ask: number, slPips: number,
  apiToken: string, accountId: string,
): Promise<{ success: boolean; tradeId?: string; error?: string; fillPrice?: number }> {
  const pv = pipValue(instrument);
  const prec = pricePrecision(instrument);
  const side = direction === 'long' ? 1 : -1;
  const refPrice = direction === 'long' ? ask : bid;
  const slPrice = (refPrice - side * slPips * pv).toFixed(prec);

  const orderBody = {
    order: {
      type: 'MARKET',
      instrument,
      units: String(direction === 'long' ? units : -units),
      timeInForce: 'FOK',
      stopLossOnFill: { price: slPrice, timeInForce: 'GTC' },
      // No TP — Micro-Kill exit handles it
    },
  };

  try {
    const res = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(orderBody),
    });
    const data = await res.json();
    if (data.orderFillTransaction) {
      const fillPrice = parseFloat(data.orderFillTransaction.price || '0');
      return { success: true, tradeId: data.orderFillTransaction.tradeOpened?.tradeID || data.orderFillTransaction.id, fillPrice };
    }
    return { success: false, error: JSON.stringify(data.orderRejectTransaction || data).slice(0, 300) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ══════════════════════════════════════════
// MAIN HANDLER — Sovereign VolStop Triple-Lock
// ══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const log: string[] = [];
  const executions: { instrument: string; direction: string; status: string; detail: string }[] = [];

  try {
    log.push(`⚡ Sovereign VolStop Triple-Lock | ${new Date().toISOString()}`);
    log.push(`Instruments: ${INSTRUMENTS.join(', ')} | All sessions active`);

    // ── 1. Credentials ──
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── 2. Account + Admin (parallel) ──
    const [acctSummary, adminResult] = await Promise.all([
      getAccountSummary(apiToken, accountId),
      sb.from('user_roles').select('user_id').eq('role', 'admin').limit(1).single(),
    ]);
    const nav = acctSummary.nav;
    const marginAvailable = acctSummary.marginAvailable;
    const accountLeverage = acctSummary.leverage;
    log.push(`NAV: $${nav.toFixed(2)} | Margin: $${marginAvailable.toFixed(2)} | Leverage: ${accountLeverage}:1`);

    if (nav < 50) {
      return new Response(JSON.stringify({ success: false, reason: 'low_nav', nav, log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = adminResult.data?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, reason: 'no_admin_user', log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Circuit Breaker ──
    const { data: breakerData } = await sb
      .from('gate_bypasses')
      .select('id')
      .like('gate_id', 'CIRCUIT_BREAKER:%')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    if (breakerData && breakerData.length > 0) {
      log.push('🚨 CIRCUIT BREAKER ACTIVE — all trading halted');
      return new Response(JSON.stringify({ success: false, reason: 'circuit_breaker', log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. MICRO-KILL EXIT CHECK (before entries) ──
    log.push('💀 Checking Micro-Kill exits on open trades...');
    const microKills = await checkMicroKillExits(sb, apiToken, accountId, log);

    for (const kill of microKills) {
      const result = await closeOandaTrade(kill.tradeId, apiToken, accountId);
      if (result.success) {
        log.push(`[${kill.instrument}] ✅ MICRO-KILL CLOSED @ ${result.price?.toFixed(pricePrecision(kill.instrument))}`);
        await sb.from('oanda_orders')
          .update({
            status: 'closed',
            exit_price: result.price,
            closed_at: new Date().toISOString(),
          })
          .eq('oanda_trade_id', kill.tradeId)
          .eq('agent_id', AGENT_ID);
        executions.push({ instrument: kill.instrument, direction: '-', status: 'micro_kill_closed', detail: `tradeId=${kill.tradeId}` });
      } else {
        log.push(`[${kill.instrument}] ❌ MICRO-KILL CLOSE FAILED: ${result.error}`);
      }
    }

    // ── 5. Fetch M1 candles + pricing + position check (parallel per instrument) ──
    const candleCount = MACRO.period + 20; // Need enough for Macro(100) ATR warmup
    const [allPricing, ...candleAndPosResults] = await Promise.all([
      fetchBatchPricing(INSTRUMENTS, apiToken, accountId),
      ...INSTRUMENTS.map(async (inst) => {
        const [candles, hasPos] = await Promise.all([
          fetchM1Candles(inst, candleCount, apiToken, accountId),
          hasOpenPosition(inst, sb),
        ]);
        return { instrument: inst, candles, hasPosition: hasPos };
      }),
    ]);

    // ── 6. Triple-Lock Analysis + Execution ──
    const riskDollars = nav * ACCOUNT_RISK_PCT;
    log.push(`Risk budget: $${riskDollars.toFixed(2)} (${(ACCOUNT_RISK_PCT * 100).toFixed(0)}% of NAV)`);

    for (const { instrument, candles, hasPosition } of candleAndPosResults) {
      const tag = `[${instrument}]`;
      const pricing = allPricing[instrument];

      if (!pricing) {
        log.push(`${tag} No pricing data, skipping`);
        continue;
      }

      if (hasPosition) {
        log.push(`${tag} Has open position, skipping entry`);
        executions.push({ instrument, direction: '-', status: 'has_position', detail: 'existing position' });
        continue;
      }

      if (candles.length < MACRO.period + 10) {
        log.push(`${tag} Insufficient candles (${candles.length}/${candleCount}), skipping`);
        continue;
      }

      // Analyze Triple-Lock
      const candleData = candles.map(c => ({ close: c.close, high: c.high, low: c.low, open: c.open }));
      const signal = analyzeTripleLock(candleData, instrument);

      log.push(`${tag} Macro: ${signal.macro.trend} slope=${(signal.macro.slope * pipScale(instrument)).toFixed(2)}p | Meso: ${signal.meso.trend} | Micro: ${signal.micro.trend}`);
      log.push(`${tag} ${signal.detail}`);

      if (!signal.direction) {
        executions.push({ instrument, direction: '-', status: 'no_signal', detail: signal.detail });
        continue;
      }

      // ── SPREAD CHECK: Spread must be reasonable (<20% of Meso SL) ──
      const maxSpread = signal.mesoDistance * 0.20;
      if (pricing.spread > maxSpread && maxSpread > 0) {
        log.push(`${tag} Spread Shield: ${pricing.spread.toFixed(1)}p > ${maxSpread.toFixed(1)}p cap`);
        executions.push({ instrument, direction: signal.direction, status: 'spread_blocked', detail: `spread=${pricing.spread.toFixed(1)}` });
        continue;
      }

      // ── POSITION SIZING: Risk / (Distance to Meso in $) ──
      const slPips = Math.max(5, signal.mesoDistance); // Floor of 5 pips SL
      const pipValueUSD = instrument.includes('JPY') ? 0.01 / (pricing.mid > 1 ? pricing.mid : 1) : 0.0001;
      const rawUnits = Math.floor(riskDollars / (slPips * pipValueUSD));

      // Margin cap
      const safeMargin = marginAvailable * 0.80;
      const maxUnitsByMargin = Math.floor(safeMargin * accountLeverage);
      const units = Math.max(100, Math.min(rawUnits, maxUnitsByMargin));

      if (rawUnits > maxUnitsByMargin) {
        log.push(`${tag} ⚠️ MARGIN CAP: ${rawUnits} → ${units} units`);
      }

      log.push(`${tag} 🚀 EXECUTING: ${signal.direction.toUpperCase()} ${units} units | SL=${slPips.toFixed(1)}p (Meso distance) | Spread=${pricing.spread.toFixed(1)}p`);

      // Acquire slot
      const signalId = `volstop-${instrument}-${Date.now()}`;
      const { data: slotResult } = await sb.rpc('try_acquire_blend_slot', {
        p_agent_id: AGENT_ID,
        p_currency_pair: instrument,
        p_user_id: userId,
        p_signal_id: signalId,
        p_direction: signal.direction,
        p_units: units,
        p_environment: ENVIRONMENT,
        p_confidence_score: 0.90,
        p_requested_price: pricing.mid,
      });

      if (!slotResult) {
        log.push(`${tag} Slot occupied (blend lock), skipping`);
        executions.push({ instrument, direction: signal.direction, status: 'slot_blocked', detail: 'blend slot occupied' });
        continue;
      }

      const orderId = slotResult as string;
      const result = await placeMarketOrder(
        instrument, units, signal.direction,
        pricing.bid, pricing.ask, slPips,
        apiToken, accountId,
      );

      if (result.success) {
        const entryPrice = result.fillPrice || (signal.direction === 'long' ? pricing.ask : pricing.bid);
        log.push(`${tag} ✅ FILLED — Trade ID: ${result.tradeId} @ ${entryPrice.toFixed(pricePrecision(instrument))}`);
        await sb.from('oanda_orders').update({
          status: 'filled',
          oanda_trade_id: result.tradeId || null,
          entry_price: entryPrice,
          spread_at_entry: pricing.spread,
        }).eq('id', orderId);
        executions.push({
          instrument, direction: signal.direction, status: 'filled',
          detail: `tradeId=${result.tradeId} SL=${slPips.toFixed(1)}p`,
        });
      } else {
        log.push(`${tag} ❌ REJECTED — ${result.error}`);
        await sb.from('oanda_orders').update({
          status: 'rejected', error_message: result.error?.slice(0, 500),
        }).eq('id', orderId);
        executions.push({ instrument, direction: signal.direction, status: 'rejected', detail: result.error || 'unknown' });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      agent: AGENT_ID,
      engine: 'volstop-triple-lock-v1',
      executions,
      log,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[VOLSTOP-TRIPLE-LOCK] Fatal:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message, log }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
