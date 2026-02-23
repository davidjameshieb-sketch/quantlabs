// Decorrelated Portfolio Blend — Automated Executor
// Runs the sovereign-matrix scan, selects diversified rank-divergence signals,
// and executes on OANDA practice account with SL/TP and duplicate prevention.
//
// Selection criteria (mirrors ExperimentalStrategies "Decorrelated Portfolio Blend"):
// 1. Base currency rank ≤ 3 (strong) AND quote currency rank ≥ 6 (weak)
// 2. At least G1 (rank elite) must be active
// 3. Direction must be defined (long or short)
// 4. Max 1 position per currency pair (no duplicates)
// 5. Max 5 total concurrent positions
// 6. Diversify across different rank combos + pairs

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

// Position sizing: fixed 1,000 units for demo safety
const UNITS = 1000;
const MAX_POSITIONS = 5;
const SL_PIPS = 15;
const TP_PIPS = 30; // 2:1 R:R
const ENVIRONMENT = 'practice' as const;

interface MatrixSignal {
  instrument: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseRank: number;
  quoteRank: number;
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  direction: string | null;
  triplelock: boolean;
  currentPrice: number;
  sobScore: number;
}

function pipValue(instrument: string): number {
  return instrument.includes('JPY') ? 0.01 : 0.0001;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Step 1: Check for active circuit breakers ──
    const { data: activeBreakers } = await sb
      .from('gate_bypasses')
      .select('gate_id, reason')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .or('gate_id.like.CIRCUIT_BREAKER:%,gate_id.like.AGENT_SUSPEND:%')
      .limit(1);

    if (activeBreakers && activeBreakers.length > 0) {
      console.log(`[BLEND-EXECUTOR] 🔴 Circuit breaker active: ${activeBreakers[0].gate_id} — skipping cycle`);
      return new Response(
        JSON.stringify({ success: false, reason: 'circuit_breaker_active', detail: activeBreakers[0].reason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 2: Get current open positions ──
    const { data: openPositions } = await sb
      .from('oanda_orders')
      .select('currency_pair, oanda_trade_id, status')
      .in('status', ['filled', 'open', 'submitted'])
      .eq('environment', ENVIRONMENT)
      .eq('agent_id', 'decorrelated-blend');

    const openPairs = new Set((openPositions || []).map(p => p.currency_pair));
    const openCount = openPairs.size;

    if (openCount >= MAX_POSITIONS) {
      console.log(`[BLEND-EXECUTOR] Max positions (${MAX_POSITIONS}) reached — skipping`);
      return new Response(
        JSON.stringify({ success: true, reason: 'max_positions_reached', openCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: Run sovereign-matrix scan ──
    const matrixUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sovereign-matrix`;
    const matrixRes = await fetch(matrixUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({ environment: ENVIRONMENT }),
    });

    if (!matrixRes.ok) {
      const errText = await matrixRes.text();
      throw new Error(`Matrix scan failed: ${matrixRes.status} ${errText.slice(0, 200)}`);
    }

    const matrixData = await matrixRes.json();
    if (!matrixData.success || !matrixData.signals) {
      throw new Error('Matrix scan returned no signals');
    }

    const signals: MatrixSignal[] = matrixData.signals;

    // ── Step 4: Filter for Decorrelated Portfolio Blend criteria ──
    // Predator rank ≤ 3, Prey rank ≥ 6, G1 active, direction defined
    const candidates = signals.filter(s =>
      s.baseRank <= 3 &&
      s.quoteRank >= 6 &&
      s.gate1 === true &&
      s.direction != null &&
      !openPairs.has(s.instrument)
    );

    // Sort by gate strength (triple-lock first) then by rank divergence
    candidates.sort((a, b) => {
      const aGates = [a.gate1, a.gate2, a.gate3].filter(Boolean).length;
      const bGates = [b.gate1, b.gate2, b.gate3].filter(Boolean).length;
      if (bGates !== aGates) return bGates - aGates;
      // Higher rank divergence = stronger signal
      return (b.quoteRank - b.baseRank) - (a.quoteRank - a.baseRank);
    });

    // Diversify: max 1 per rank combo key
    const slotsAvailable = MAX_POSITIONS - openCount;
    const usedCombos = new Set<string>();
    const toExecute: MatrixSignal[] = [];

    for (const c of candidates) {
      if (toExecute.length >= slotsAvailable) break;
      const comboKey = `${c.baseRank}v${c.quoteRank}`;
      if (usedCombos.has(comboKey)) continue;
      usedCombos.add(comboKey);
      toExecute.push(c);
    }

    if (toExecute.length === 0) {
      console.log(`[BLEND-EXECUTOR] No qualifying signals this cycle (${candidates.length} candidates filtered, ${openCount} open)`);
      return new Response(
        JSON.stringify({
          success: true,
          reason: 'no_qualifying_signals',
          candidatesScanned: signals.length,
          candidatesFiltered: candidates.length,
          openPositions: openCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 5: Check for G16 spread guards on selected pairs ──
    const { data: spreadGuards } = await sb
      .from('gate_bypasses')
      .select('pair')
      .like('gate_id', 'G16_SPREAD_GUARD:%')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString());

    const blockedPairs = new Set((spreadGuards || []).map(g => g.pair));
    const finalExecutions = toExecute.filter(s => {
      const pair = s.instrument.replace('_', '/');
      if (blockedPairs.has(pair) || blockedPairs.has(s.instrument)) {
        console.log(`[BLEND-EXECUTOR] ⚠️ ${s.instrument} blocked by G16 Spread Guard — skipping`);
        return false;
      }
      return true;
    });

    // ── Step 6: Execute trades ──
    const oandaApiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const oandaAccountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const oandaHost = OANDA_HOSTS[ENVIRONMENT];
    // Use system UUID for practice account trades
    const userId = '00000000-0000-0000-0000-000000000000';

    const executionResults: Array<{
      pair: string;
      direction: string;
      status: string;
      oandaTradeId?: string;
      entryPrice?: number;
      error?: string;
    }> = [];

    for (const signal of finalExecutions) {
      const signalId = `blend-${signal.instrument}-${Date.now()}`;
      const direction = signal.direction as 'long' | 'short';
      const signedUnits = direction === 'short' ? -UNITS : UNITS;
      const pv = pipValue(signal.instrument);

      // Calculate SL/TP prices
      const slPrice = direction === 'long'
        ? signal.currentPrice - SL_PIPS * pv
        : signal.currentPrice + SL_PIPS * pv;
      const tpPrice = direction === 'long'
        ? signal.currentPrice + TP_PIPS * pv
        : signal.currentPrice - TP_PIPS * pv;

      const isJPY = signal.instrument.includes('JPY');
      const precision = isJPY ? 3 : 5;

      try {
        // Insert pending order to DB first
        const { data: dbOrder, error: dbErr } = await sb
          .from('oanda_orders')
          .insert({
            user_id: userId,
            signal_id: signalId,
            currency_pair: signal.instrument,
            direction,
            units: UNITS,
            agent_id: 'decorrelated-blend',
            environment: ENVIRONMENT,
            status: 'submitted',
            confidence_score: [signal.gate1, signal.gate2, signal.gate3].filter(Boolean).length / 3,
          })
          .select('id')
          .single();

        if (dbErr) {
          console.error(`[BLEND-EXECUTOR] DB insert error for ${signal.instrument}:`, dbErr.message);
          executionResults.push({ pair: signal.instrument, direction, status: 'db_error', error: dbErr.message });
          continue;
        }

        // Execute market order on OANDA
        const orderTs = Date.now();
        const orderBody = {
          order: {
            type: 'MARKET',
            instrument: signal.instrument,
            units: signedUnits.toString(),
            timeInForce: 'FOK',
            positionFill: 'DEFAULT',
            stopLossOnFill: {
              price: slPrice.toFixed(precision),
              timeInForce: 'GTC',
            },
            takeProfitOnFill: {
              price: tpPrice.toFixed(precision),
              timeInForce: 'GTC',
            },
          },
        };

        const oandaRes = await fetch(
          `${oandaHost}/v3/accounts/${oandaAccountId}/orders`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${oandaApiToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(orderBody),
          }
        );

        const oandaData = await oandaRes.json();
        const fillLatency = Date.now() - orderTs;

        if (!oandaRes.ok) {
          const errMsg = oandaData.errorMessage || oandaData.rejectReason || `OANDA ${oandaRes.status}`;
          console.error(`[BLEND-EXECUTOR] OANDA rejected ${signal.instrument}: ${errMsg}`);

          await sb.from('oanda_orders').update({
            status: 'rejected',
            error_message: errMsg,
          }).eq('id', dbOrder.id);

          executionResults.push({ pair: signal.instrument, direction, status: 'rejected', error: errMsg });
          continue;
        }

        // Extract fill details
        const oandaOrderId = oandaData.orderCreateTransaction?.id || oandaData.orderFillTransaction?.orderID || null;
        const oandaTradeId = oandaData.orderFillTransaction?.tradeOpened?.tradeID || oandaData.orderFillTransaction?.id || null;
        const filledPrice = oandaData.orderFillTransaction?.price ? parseFloat(oandaData.orderFillTransaction.price) : null;

        // Compute real slippage
        const pipMult = isJPY ? 100 : 10000;
        const slippagePips = filledPrice != null
          ? Math.abs((filledPrice - signal.currentPrice) * pipMult)
          : null;

        // Update DB with fill
        await sb.from('oanda_orders').update({
          status: 'filled',
          oanda_order_id: oandaOrderId,
          oanda_trade_id: oandaTradeId,
          entry_price: filledPrice,
          requested_price: signal.currentPrice,
          slippage_pips: slippagePips,
          fill_latency_ms: fillLatency,
          gate_result: `G1:${signal.gate1} G2:${signal.gate2} G3:${signal.gate3}`,
          gate_reasons: [
            `Rank ${signal.baseRank}v${signal.quoteRank}`,
            `Gates: ${[signal.gate1 && 'G1', signal.gate2 && 'G2', signal.gate3 && 'G3'].filter(Boolean).join('+')}`,
            `SOB: ${signal.sobScore}`,
          ],
        }).eq('id', dbOrder.id);

        console.log(`[BLEND-EXECUTOR] ✅ ${signal.instrument} ${direction.toUpperCase()} ${UNITS}u filled @ ${filledPrice} (SL=${slPrice.toFixed(precision)} TP=${tpPrice.toFixed(precision)}) [${fillLatency}ms]`);

        executionResults.push({
          pair: signal.instrument,
          direction,
          status: 'filled',
          oandaTradeId: oandaTradeId || undefined,
          entryPrice: filledPrice || undefined,
        });

        // Brief cooldown between orders to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));

      } catch (execErr) {
        console.error(`[BLEND-EXECUTOR] Execution error for ${signal.instrument}:`, (execErr as Error).message);
        executionResults.push({ pair: signal.instrument, direction, status: 'error', error: (execErr as Error).message });
      }
    }

    const filled = executionResults.filter(r => r.status === 'filled').length;
    const rejected = executionResults.filter(r => r.status !== 'filled').length;

    console.log(`[BLEND-EXECUTOR] Cycle complete: ${filled} filled, ${rejected} rejected/skipped, ${openCount} already open`);

    return new Response(
      JSON.stringify({
        success: true,
        cycle: {
          signalsScanned: signals.length,
          candidatesMatched: candidates.length,
          executed: filled,
          rejected,
          existingPositions: openCount,
          maxPositions: MAX_POSITIONS,
        },
        executions: executionResults,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[BLEND-EXECUTOR] Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
