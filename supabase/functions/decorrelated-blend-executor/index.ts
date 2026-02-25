// Decorrelated Portfolio Blend — Precision Executor v4 (LIMIT ORDER / GATES BYPASSED)
// Supports dynamic portfolio from agent_configs OR hardcoded 5-component blend fallback.

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
const RISK_FRACTION = 0.05; // 5% equity risk per trade
const TP_RATIO = 2.0;

const OANDA_AVAILABLE = new Set([
  'EUR_USD', 'EUR_GBP', 'EUR_AUD', 'EUR_NZD', 'EUR_CAD', 'EUR_CHF', 'EUR_JPY',
  'GBP_USD', 'GBP_AUD', 'GBP_NZD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY',
  'AUD_USD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF', 'AUD_JPY',
  'NZD_USD', 'NZD_CAD', 'NZD_CHF', 'NZD_JPY',
  'USD_CAD', 'USD_CHF', 'USD_JPY',
  'CAD_CHF', 'CAD_JPY',
  'CHF_JPY',
]);

// ── Component Definitions ──

interface BlendComponent {
  id: string;
  predatorRank: number;
  preyRank: number;
  requireG3: boolean;
  slType: 'swing_low_5' | 'atlas_wall_10' | 'atr_2x' | 'fixed_30' | 'fixed_custom';
  entryType: 'z_ofi_2' | 'order_block';
  weight: number;
  label: string;
  fixedPips?: number;
  tpRatio?: number;
  invertDirection?: boolean;
  agentId?: string;
  fixedUnits?: number;
  skipGates?: boolean;
}

// Hardcoded fallback (original 5-component blend)
const DEFAULT_COMPONENTS: BlendComponent[] = [
  { id: '3v8', predatorRank: 3, preyRank: 8, requireG3: true,  slType: 'swing_low_5',   entryType: 'z_ofi_2',     weight: 0.44, label: '#3v#8 · G1+G2+G3 · Swing low (5-bar) · Z-OFI > 2.0' },
  { id: '1v6', predatorRank: 1, preyRank: 6, requireG3: true,  slType: 'atlas_wall_10', entryType: 'order_block', weight: 0.22, label: '#1v#6 · G1+G2+G3 · Atlas Wall -10 · Order block' },
  { id: '1v7', predatorRank: 1, preyRank: 7, requireG3: true,  slType: 'atr_2x',        entryType: 'order_block', weight: 0.15, label: '#1v#7 · G1+G2+G3 · 2.0x ATR · Order block' },
  { id: '3v7', predatorRank: 3, preyRank: 7, requireG3: false, slType: 'fixed_30',      entryType: 'order_block', weight: 0.11, label: '#3v#7 · G1+G2 · 30 pip fixed · Order block' },
  { id: '3v6', predatorRank: 3, preyRank: 6, requireG3: false, slType: 'atr_2x',        entryType: 'order_block', weight: 0.09, label: '#3v#6 · G1+G2 · 2.0x ATR · Order block' },
];

// ── Pricing Helper ──

async function fetchBidAsk(instrument: string, apiToken: string): Promise<{ bid: number; ask: number } | null> {
  const host = OANDA_HOSTS[ENVIRONMENT];
  try {
    const res = await fetch(`${host}/v3/accounts/${Deno.env.get('OANDA_ACCOUNT_ID')!}/pricing?instruments=${instrument}`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.prices?.[0];
    if (!p) return null;
    return { bid: parseFloat(p.bids?.[0]?.price || p.closeoutBid), ask: parseFloat(p.asks?.[0]?.price || p.closeoutAsk) };
  } catch { return null; }
}

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

function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / period;
}

function computeSwingStop(candles: Candle[], bars: number, direction: 'long' | 'short'): number {
  const recent = candles.slice(-bars);
  if (direction === 'long') return Math.min(...recent.map(c => c.low));
  return Math.max(...recent.map(c => c.high));
}

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

function computeAtlasSnap(candles: Candle[], period = 20): { highest: number; lowest: number } {
  const lookback = candles.slice(0, -1);
  const slice = lookback.length >= period ? lookback.slice(-period) : lookback;
  return {
    highest: Math.max(...slice.map(c => c.high)),
    lowest: Math.min(...slice.map(c => c.low)),
  };
}

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
      return dist < 3 * pv ? 10 * pv : dist;
    }
    case 'atlas_wall_10': {
      const block = findAtlasBlock(candles, 20);
      if (block) {
        const wallLevel = direction === 'long' ? block.blockLow : block.blockHigh;
        return Math.abs(currentPrice - wallLevel) + 10 * pv;
      }
      return 15 * pv;
    }
    case 'atr_2x': {
      const atr = computeATR(candles, 14);
      const dist = atr * 2.0;
      return dist < 5 * pv ? 10 * pv : dist;
    }
    case 'fixed_30':
      return (comp.fixedPips || 30) * pv;
    case 'fixed_custom':
      return (comp.fixedPips || 30) * pv;
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

    const body = await req.json().catch(() => ({}));

    // ── Concurrency lock: row-level DB lock (advisory locks break with PgBouncer) ──
    const LOCK_KEY = 'blend_executor_lock';
    const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute stale lock timeout

    // Try to acquire lock — only succeeds if not locked or lock is stale (>5 min)
    const { data: lockRows } = await sb
      .from('system_settings')
      .select('value')
      .eq('key', LOCK_KEY)
      .single();

    const lockVal = lockRows?.value as any;
    const isLocked = lockVal?.locked === true;
    const lockedAt = lockVal?.locked_at ? new Date(lockVal.locked_at).getTime() : 0;
    const isStale = Date.now() - lockedAt > LOCK_TIMEOUT_MS;

    if (isLocked && !isStale) {
      console.log(`[BLEND] ⏳ Skipping — another cycle holds DB lock (locked ${Math.round((Date.now() - lockedAt) / 1000)}s ago)`);
      return new Response(
        JSON.stringify({ success: true, reason: 'db_lock_held' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Acquire lock
    await sb.from('system_settings').upsert({
      key: LOCK_KEY,
      value: { locked: true, locked_at: new Date().toISOString() } as any,
      updated_at: new Date().toISOString(),
    });

    // Release lock helper
    const releaseLock = async () => {
      await sb.from('system_settings').update({
        value: { locked: false, locked_at: null } as any,
        updated_at: new Date().toISOString(),
      }).eq('key', LOCK_KEY);
    };

    // ── Resolve active components (dynamic portfolio or hardcoded fallback) ──
    let activeComponents: BlendComponent[] = DEFAULT_COMPONENTS;
    let maxPositions = 5;
    let portfolioAgentIds: string[] = ['decorrelated-blend'];

    if (body.components && Array.isArray(body.components) && body.components.length > 0) {
      activeComponents = body.components.map((c: any) => ({
        id: c.id || `${c.predatorRank}v${c.preyRank}`,
        predatorRank: c.predatorRank,
        preyRank: c.preyRank,
        requireG3: c.requireG3 ?? false,
        slType: c.slType || 'fixed_custom',
        entryType: c.entryType || 'order_block',
        weight: c.weight,
        label: c.label || `#${c.predatorRank}v${c.preyRank}`,
        fixedPips: c.fixedPips,
        tpRatio: c.tpRatio,
        invertDirection: c.invertDirection ?? false,
        agentId: c.agentId,
      }));
      maxPositions = activeComponents.length;
      portfolioAgentIds = [...new Set(activeComponents.map(c => c.agentId || 'decorrelated-blend'))];
      console.log(`[BLEND] Using ${activeComponents.length} dynamic components from portfolio`);
    } else {
      // Auto-load Atlas Hedge portfolio from agent_configs if no components passed
      const { data: atlasConfigs } = await sb
        .from('agent_configs')
        .select('agent_id, config, is_active')
        .like('agent_id', 'atlas-hedge-%')
        .eq('is_active', true);

      if (atlasConfigs && atlasConfigs.length > 0) {
        activeComponents = atlasConfigs.map((ac: any) => {
          const cfg = ac.config || {};
          return {
            id: ac.agent_id,
            predatorRank: cfg.predatorRank || 1,
            preyRank: cfg.preyRank || 8,
            requireG3: cfg.requireG3 ?? true,
            slType: 'fixed_custom' as const,
            entryType: 'order_block' as const,
            weight: cfg.weight || 1 / atlasConfigs.length,
            label: cfg.label || ac.agent_id,
            fixedPips: cfg.slPips || 25,
            tpRatio: cfg.tpRatio || 2.0,
            invertDirection: cfg.invertDirection ?? false,
            agentId: ac.agent_id,
            fixedUnits: cfg.fixedUnits || undefined,
            skipGates: cfg.skipGates ?? false,
          };
        });
        maxPositions = Math.max(activeComponents.length, 20);
        portfolioAgentIds = atlasConfigs.map((ac: any) => ac.agent_id);
        console.log(`[BLEND] Auto-loaded ${activeComponents.length} Atlas Hedge strategies from agent_configs`);
      }
    }

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

    // ── Step 2a: Clean up orphaned submitted orders (no OANDA ID, older than 15 min) ──
    const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleOrders } = await sb
      .from('oanda_orders')
      .select('id')
      .eq('status', 'submitted')
      .is('oanda_order_id', null)
      .lt('created_at', staleThreshold)
      .eq('environment', ENVIRONMENT)
      .in('agent_id', portfolioAgentIds);

    if (staleOrders && staleOrders.length > 0) {
      const staleIds = staleOrders.map(o => o.id);
      await sb.from('oanda_orders').update({ status: 'expired', error_message: 'Stale submitted order — never reached OANDA' }).in('id', staleIds);
      console.log(`[BLEND] 🧹 Cleaned ${staleIds.length} orphaned submitted orders`);
    }

    // ── Step 2b: LIMIT ORDER FILL TRACKER — sync OANDA fills back to DB ──
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const oandaHost = OANDA_HOSTS[ENVIRONMENT];

    // Find DB orders with status='open' that have an oanda_order_id (sent to OANDA) but no trade_id yet
    const { data: pendingLimits } = await sb
      .from('oanda_orders')
      .select('id, oanda_order_id, currency_pair, direction, agent_id, requested_price')
      .eq('status', 'open')
      .not('oanda_order_id', 'is', null)
      .is('oanda_trade_id', null)
      .eq('environment', ENVIRONMENT)
      .in('agent_id', portfolioAgentIds);

    if (pendingLimits && pendingLimits.length > 0) {
      console.log(`[BLEND] 🔍 Checking ${pendingLimits.length} pending limit orders for fills...`);

      // Fetch all open trades from OANDA to match against pending limits
      try {
        const tradesRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/openTrades`, {
          headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
        });
        if (tradesRes.ok) {
          const tradesData = await tradesRes.json();
          const oandaTrades = tradesData.trades || [];

          // Also fetch recent orders to find which order spawned which trade
          const ordersRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
            headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
          });
          const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };
          const oandaPendingOrderIds = new Set((ordersData.orders || []).map((o: any) => o.id));

          for (const pl of pendingLimits) {
            // Check if the order is still pending on OANDA
            if (oandaPendingOrderIds.has(pl.oanda_order_id)) {
              continue; // Still pending, nothing to do
            }

            // Order is no longer pending — check if it filled into a trade
            const matchedTrade = oandaTrades.find((t: any) => t.instrument === pl.currency_pair);
            if (matchedTrade) {
              const fillPrice = parseFloat(matchedTrade.price);
              const tradeId = matchedTrade.id;
              const units = parseInt(matchedTrade.currentUnits || matchedTrade.initialUnits);
              const hasSL = !!matchedTrade.stopLossOrder;
              const hasTP = !!matchedTrade.takeProfitOrder;

              await sb.from('oanda_orders').update({
                status: 'filled',
                oanda_trade_id: tradeId,
                entry_price: fillPrice,
                units: Math.abs(units),
                fill_latency_ms: 0,
              }).eq('id', pl.id);

              console.log(`[BLEND] ✅ Fill detected: ${pl.currency_pair} ${pl.direction} @ ${fillPrice} (trade=${tradeId}, SL=${hasSL}, TP=${hasTP})`);

              // If trade is missing SL or TP, add them now
              if (!hasSL || !hasTP) {
                const prec = pl.currency_pair.includes('JPY') ? 3 : 5;
                const pv = pl.currency_pair.includes('JPY') ? 0.01 : 0.0001;
                // Look up agent config for SL/TP params
                const { data: agentCfg } = await sb.from('agent_configs').select('config').eq('agent_id', pl.agent_id).single();
                const cfg = (agentCfg?.config || {}) as any;
                const slPips = cfg.slPips || 25;
                const tpRatio = cfg.tpRatio || 2.0;
                const slDist = slPips * pv;

                if (!hasSL) {
                  const slPrice = pl.direction === 'long'
                    ? (fillPrice - slDist).toFixed(prec)
                    : (fillPrice + slDist).toFixed(prec);
                  try {
                    await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ order: { type: 'STOP_LOSS', tradeID: tradeId, price: slPrice, timeInForce: 'GTC' } }),
                    });
                    console.log(`[BLEND] 🛡️ Added SL @ ${slPrice} to trade ${tradeId}`);
                  } catch (e) { console.warn(`[BLEND] Failed to add SL:`, (e as Error).message); }
                }

                if (!hasTP) {
                  const tpPrice = pl.direction === 'long'
                    ? (fillPrice + slDist * tpRatio).toFixed(prec)
                    : (fillPrice - slDist * tpRatio).toFixed(prec);
                  try {
                    await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ order: { type: 'TAKE_PROFIT', tradeID: tradeId, price: tpPrice, timeInForce: 'GTC' } }),
                    });
                    console.log(`[BLEND] 🎯 Added TP @ ${tpPrice} to trade ${tradeId}`);
                  } catch (e) { console.warn(`[BLEND] Failed to add TP:`, (e as Error).message); }
                }
              }
            } else {
              // Order not pending and no matching trade → it expired or was cancelled
              await sb.from('oanda_orders').update({
                status: 'expired',
                error_message: 'Limit order expired or cancelled on OANDA',
              }).eq('id', pl.id);
              console.log(`[BLEND] ⏰ Limit expired: ${pl.currency_pair} ${pl.direction} (order=${pl.oanda_order_id})`);
            }
          }
        }
      } catch (e) {
        console.warn('[BLEND] Fill tracker error:', (e as Error).message);
      }
    }

    // ── Step 2c: Add SL/TP to any existing OANDA trades that are missing them ──
    try {
      const tradesCheckRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/openTrades`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      });
      if (tradesCheckRes.ok) {
        const allTrades = (await tradesCheckRes.json()).trades || [];
        for (const trade of allTrades) {
          const hasSL = !!trade.stopLossOrder;
          const hasTP = !!trade.takeProfitOrder;
          if (hasSL && hasTP) continue;

          const instrument = trade.instrument;
          const prec = instrument.includes('JPY') ? 3 : 5;
          const pv = instrument.includes('JPY') ? 0.01 : 0.0001;
          const fillPrice = parseFloat(trade.price);
          const isLong = parseInt(trade.currentUnits) > 0;
          const slPips = 25; // default
          const tpRatio = 2.0;
          const slDist = slPips * pv;

          if (!hasSL) {
            const slPrice = isLong
              ? (fillPrice - slDist).toFixed(prec)
              : (fillPrice + slDist).toFixed(prec);
            try {
              const slRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: { type: 'STOP_LOSS', tradeID: trade.id, price: slPrice, timeInForce: 'GTC' } }),
              });
              console.log(`[BLEND] 🛡️ Retroactive SL @ ${slPrice} for ${instrument} trade ${trade.id} (${slRes.ok ? 'OK' : 'FAILED'})`);
            } catch (e) { console.warn(`SL add failed:`, (e as Error).message); }
          }

          if (!hasTP) {
            const tpPrice = isLong
              ? (fillPrice + slDist * tpRatio).toFixed(prec)
              : (fillPrice - slDist * tpRatio).toFixed(prec);
            try {
              const tpRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/orders`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: { type: 'TAKE_PROFIT', tradeID: trade.id, price: tpPrice, timeInForce: 'GTC' } }),
              });
              console.log(`[BLEND] 🎯 Retroactive TP @ ${tpPrice} for ${instrument} trade ${trade.id} (${tpRes.ok ? 'OK' : 'FAILED'})`);
            } catch (e) { console.warn(`TP add failed:`, (e as Error).message); }
          }
        }
      }
    } catch (e) {
      console.warn('[BLEND] SL/TP retroactive check error:', (e as Error).message);
    }

    // ── Step 2d: CLOSED-TRADE RECONCILIATION ──
    // Detect trades closed by OANDA native SL/TP and update DB
    try {
      const { data: filledDbOrders } = await sb
        .from('oanda_orders')
        .select('id, oanda_trade_id, currency_pair, direction, agent_id, entry_price')
        .eq('status', 'filled')
        .not('oanda_trade_id', 'is', null)
        .eq('environment', ENVIRONMENT)
        .in('agent_id', portfolioAgentIds);

      if (filledDbOrders && filledDbOrders.length > 0) {
        // Fetch open trades from OANDA
        const openTradesRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/openTrades`, {
          headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
        });
        if (openTradesRes.ok) {
          const openTradesData = (await openTradesRes.json()).trades || [];
          const openTradeIds = new Set(openTradesData.map((t: any) => t.id));

          for (const dbOrder of filledDbOrders) {
            if (openTradeIds.has(dbOrder.oanda_trade_id)) continue; // Still open

            // Trade is NOT in OANDA open trades → closed by SL/TP
            // Fetch the trade details to get exit price
            try {
              const tradeDetailRes = await fetch(
                `${oandaHost}/v3/accounts/${accountId}/trades/${dbOrder.oanda_trade_id}`,
                { headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } }
              );
              if (tradeDetailRes.ok) {
                const tradeDetail = (await tradeDetailRes.json()).trade;
                const exitPrice = tradeDetail?.averageClosePrice ? parseFloat(tradeDetail.averageClosePrice) : null;
                const closeTime = tradeDetail?.closeTime || new Date().toISOString();
                const realizedPL = tradeDetail?.realizedPL ? parseFloat(tradeDetail.realizedPL) : null;

                await sb.from('oanda_orders').update({
                  status: 'closed',
                  exit_price: exitPrice,
                  closed_at: closeTime,
                }).eq('id', dbOrder.id);

                const pv = dbOrder.currency_pair?.includes('JPY') ? 0.01 : 0.0001;
                const pipResult = exitPrice && dbOrder.entry_price
                  ? dbOrder.direction === 'long'
                    ? ((exitPrice - dbOrder.entry_price) / pv)
                    : ((dbOrder.entry_price - exitPrice) / pv)
                  : null;
                const resultLabel = pipResult != null ? (pipResult > 0 ? 'WIN' : 'LOSS') : '?';

                console.log(`[BLEND] 🏁 Trade closed by SL/TP: ${dbOrder.currency_pair} ${dbOrder.direction} → ${resultLabel} ${pipResult?.toFixed(1)}p (PL=$${realizedPL?.toFixed(2)}) agent=${dbOrder.agent_id}`);
              }
            } catch (e) {
              // Fallback: mark as closed without exit price
              await sb.from('oanda_orders').update({
                status: 'closed',
                closed_at: new Date().toISOString(),
              }).eq('id', dbOrder.id);
              console.warn(`[BLEND] Trade ${dbOrder.oanda_trade_id} closed but details fetch failed:`, (e as Error).message);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[BLEND] Closed-trade reconciliation error:', (e as Error).message);
    }

    // ── Step 2b: Check open positions (only count orders that actually reached OANDA) ──
    const { data: openPositions } = await sb
      .from('oanda_orders')
      .select('currency_pair, agent_id, status, oanda_order_id')
      .in('status', ['filled', 'open', 'submitted'])
      .eq('environment', ENVIRONMENT)
      .in('agent_id', portfolioAgentIds);

    // Only count as "open" if filled/open, OR submitted WITH an oanda_order_id
    const realOpen = (openPositions || []).filter(p =>
      p.status === 'filled' || p.status === 'open' || (p.status === 'submitted' && p.oanda_order_id != null)
    );
    const openPairs = new Set(realOpen.map(p => p.currency_pair));

    if (openPairs.size >= maxPositions) {
      console.log(`[BLEND] Max positions (${maxPositions}) reached`);
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

    // ── Step 4: Spread guard check ──
    const { data: spreadGuards } = await sb
      .from('gate_bypasses')
      .select('pair')
      .like('gate_id', 'G16_SPREAD_GUARD:%')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString());

    const blockedPairs = new Set((spreadGuards || []).map(g => g.pair));

    // ── Step 5: Evaluate each component ──
    // apiToken, accountId, oandaHost already declared in fill-tracker section above
    const userId = '00000000-0000-0000-0000-000000000000';

    // ── Fetch live account equity for dynamic position sizing ──
    let accountEquity = 1000; // fallback
    try {
      const acctRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/summary`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      });
      if (acctRes.ok) {
        const acctData = await acctRes.json();
        const nav = parseFloat(acctData.account?.NAV || acctData.account?.balance || '1000');
        if (nav > 0) accountEquity = nav;
        console.log(`[BLEND] Account equity: $${accountEquity.toFixed(2)}`);
      }
    } catch (e) {
      console.warn('[BLEND] Could not fetch account equity, using fallback $1000:', (e as Error).message);
    }

    // ── Step 5b: Fetch OANDA pending orders to prevent duplicate limit stacking ──
    const oandaPendingInstruments = new Set<string>();
    try {
      const pendingRes = await fetch(`${oandaHost}/v3/accounts/${accountId}/pendingOrders`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      });
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        const pendingOrders = pendingData.orders || [];
        pendingOrders.forEach((o: any) => {
          if (o.instrument) oandaPendingInstruments.add(o.instrument);
        });
        if (oandaPendingInstruments.size > 0) {
          console.log(`[BLEND] 🔒 OANDA pending limits: ${[...oandaPendingInstruments].join(', ')}`);
        }
      }
    } catch (e) {
      console.warn('[BLEND] Could not fetch OANDA pending orders:', (e as Error).message);
    }

    const slotsAvailable = maxPositions - openPairs.size;
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

    const executionTasks: Array<any> = [];

    for (const comp of activeComponents) {
      if (slotsUsed >= slotsAvailable) {
        executionResults.push({ component: comp.id, label: comp.label, pair: '-', direction: '-', status: 'skipped', skipReason: 'No slots available' });
        continue;
      }

      const predCurrency = sortedCurrencies[comp.predatorRank - 1];
      const preyCurrency = sortedCurrencies[comp.preyRank - 1];

      if (!predCurrency || !preyCurrency) {
        executionResults.push({ component: comp.id, label: comp.label, pair: '-', direction: '-', status: 'skipped', skipReason: `No currency at rank ${comp.predatorRank}/${comp.preyRank}` });
        continue;
      }

      const instrInfo = findInstrument(predCurrency, preyCurrency);
      if (!instrInfo) {
        executionResults.push({ component: comp.id, label: comp.label, pair: `${predCurrency}/${preyCurrency}`, direction: '-', status: 'skipped', skipReason: 'No OANDA instrument' });
        continue;
      }

      const { instrument, inverted } = instrInfo;

      // ── MOMENTUM 1v8 SAFEGUARD ──
      // If this is a momentum agent (NOT invertDirection) and the resolved pair lands
      // on the absolute extreme (rank 1 vs rank 8), SKIP to avoid buying peak exhaustion.
      // Momentum agents should trade the "sweet spot" (e.g. 2v6, 3v7), not the extreme.
      const isMomentumAgent = !comp.invertDirection;
      const resolvedPredRank = currencyRanks[predCurrency] ?? comp.predatorRank;
      const resolvedPreyRank = currencyRanks[preyCurrency] ?? comp.preyRank;
      if (isMomentumAgent && resolvedPredRank === 1 && resolvedPreyRank === 8) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction: 'long', status: 'skipped', skipReason: 'Momentum 1v8 safeguard — peak exhaustion' });
        continue;
      }

      // Momentum direction (used for gate evaluation)
      const momentumDirection: 'long' | 'short' = inverted ? 'short' : 'long';
      // Actual trade direction: flipped for counter-leg mean-reversion
      let direction: 'long' | 'short' = momentumDirection;
      if (comp.invertDirection) {
        direction = direction === 'long' ? 'short' : 'long';
      }

      if (openPairs.has(instrument)) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Already open' });
        continue;
      }

      if (blockedPairs.has(instrument) || blockedPairs.has(instrument.replace('_', '/'))) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Spread guard active' });
        continue;
      }
      // ── OANDA pending limit guard: skip if broker already has a pending limit for this instrument ──
      if (oandaPendingInstruments.has(instrument)) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'OANDA pending limit already exists' });
        continue;
      }

      const candles = await fetchCandles(instrument, 30, apiToken);
      if (!candles || candles.length < 21) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: `Insufficient candles (${candles?.length ?? 0})` });
        continue;
      }

      const currentPrice = candles[candles.length - 1].close;
      const pv = pipValue(instrument);
      const prec = pricePrecision(instrument);

      // ── GATES BYPASSED — raw rank-divergence alpha ──
      // All G2/G3 gates disabled. Only G1 (rank) + spread guard apply.
      console.log(`[BLEND] ⚡ ${comp.id} → gates bypassed, raw rank-divergence signal`);
      const trigger = { pass: true, detail: 'gates_bypassed' };

      // ── Fetch live bid/ask for LIMIT order placement ──
      const pricing = await fetchBidAsk(instrument, apiToken);
      if (!pricing) {
        executionResults.push({ component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Could not fetch bid/ask pricing' });
        continue;
      }

      // ═══ HARDENED LIMIT ORDER MATH ═══
      // LONG (Buy Limit): limitPrice = currentAsk - (2 × pip) → strictly below market
      // SHORT (Sell Limit): limitPrice = currentBid + (2 × pip) → strictly above market
      const trapOffset = pv * 2; // 2.0 pips
      const limitPrice = direction === 'long'
        ? parseFloat((pricing.ask - trapOffset).toFixed(prec))
        : parseFloat((pricing.bid + trapOffset).toFixed(prec));

      // SL/TP anchored to limitPrice, NOT current market price
      const slDistance = computeSLDistance(comp, candles, direction, limitPrice, pv);
      const compTpRatio = comp.tpRatio || TP_RATIO;
      const slPrice = parseFloat((direction === 'long' ? limitPrice - slDistance : limitPrice + slDistance).toFixed(prec));
      const tpPrice = parseFloat((direction === 'long' ? limitPrice + slDistance * compTpRatio : limitPrice - slDistance * compTpRatio).toFixed(prec));

      // Position sizing: use fixedUnits if configured, otherwise dynamic 5% equity risk
      let units: number;
      if (comp.fixedUnits && comp.fixedUnits > 0) {
        units = comp.fixedUnits;
      } else {
        const riskAmount = accountEquity * RISK_FRACTION * comp.weight;
        units = Math.max(1, Math.round(riskAmount / slDistance));
      }

      // ── Dynamic Kelly Auto-Scaler ──
      // If enabled, check last 3 real closed trades for this agent.
      // 3 consecutive losses → 0.8x size. Last win → reset to 1.0x.
      let scalerMultiplier = 1.0;
      try {
        const { data: scalerSetting } = await sb
          .from('system_settings')
          .select('value')
          .eq('key', 'auto_scaler_enabled')
          .single();

        const scalerEnabled = (scalerSetting?.value as any)?.enabled ?? false;

        if (scalerEnabled && comp.agentId) {
          const { data: lastTrades } = await sb
            .from('oanda_orders')
            .select('currency_pair, direction, entry_price, exit_price')
            .eq('agent_id', comp.agentId)
            .eq('status', 'closed')
            .not('entry_price', 'is', null)
            .not('exit_price', 'is', null)
            .not('oanda_trade_id', 'is', null)
            .eq('baseline_excluded', false)
            .order('closed_at', { ascending: false })
            .limit(3);

          if (lastTrades && lastTrades.length >= 3) {
            const pips = lastTrades.map(t => {
              const isJPY = t.currency_pair?.includes('JPY');
              const mult = isJPY ? 100 : 10000;
              return t.direction === 'long'
                ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
                : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
            });
            const allNegative = pips.every(p => p < 0);
            if (allNegative) {
              scalerMultiplier = 0.8;
              console.log(`[BLEND] 📉 Auto-Scaler: ${comp.agentId} last 3 trades all losses → sizing at 80%`);
            }
          }
          // If last trade is positive, multiplier stays 1.0 (reset)
          if (lastTrades && lastTrades.length > 0) {
            const lastPips = (() => {
              const t = lastTrades[0];
              const isJPY = t.currency_pair?.includes('JPY');
              const mult = isJPY ? 100 : 10000;
              return t.direction === 'long'
                ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
                : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
            })();
            if (lastPips > 0) scalerMultiplier = 1.0;
          }
        }
      } catch (scalerErr) {
        console.warn('[BLEND] Auto-scaler check failed, using 1.0x:', (scalerErr as Error).message);
      }

      units = Math.max(1, Math.round(units * scalerMultiplier));
      const signedUnits = direction === 'short' ? -units : units;

      const gateLabel = 'G1-RAW';
      const signalId = `blend-${comp.id}-${instrument}-${Date.now()}`;
      const slPips = Math.round(slDistance / pv * 10) / 10;

      // Limit order expiry: 15 minutes from now — OANDA requires RFC3339 with nanosecond precision
      const limitExpiryDate = new Date(Date.now() + 15 * 60 * 1000);
      const limitExpiry = limitExpiryDate.toISOString().replace('Z', '000000Z'); // e.g. 2026-02-25T02:30:00.000000000Z

      console.log(`[BLEND] 🎯 ${comp.id} → ${instrument} ${direction.toUpperCase()} LIMIT @ ${limitPrice.toFixed(prec)} (bid=${pricing.bid.toFixed(prec)} ask=${pricing.ask.toFixed(prec)} ±2p) ${units}u | SL=${slPrice.toFixed(prec)} TP=${tpPrice.toFixed(prec)} | scaler=${scalerMultiplier}x`);

      // Collect execution tasks to run in parallel
      executionTasks.push({
        comp, instrument, direction, limitPrice, slPrice, tpPrice, slDistance, 
        signalId, gateLabel, limitExpiry, units, signedUnits, scalerMultiplier,
        predCurrency, preyCurrency, pv, prec, slPips: Math.round(slDistance / pv * 10) / 10,
        pricing: pricing!,
      });

      slotsUsed++;
      openPairs.add(instrument);
    }

    // ── Execute all orders in parallel ──
    const parallelResults = await Promise.allSettled(
      executionTasks.map(async (task) => {
        const { comp, instrument, direction, limitPrice, slPrice, tpPrice,
          signalId, gateLabel, limitExpiry, units, signedUnits, scalerMultiplier,
          predCurrency, preyCurrency, prec, slPips, pricing } = task;

        // Atomic idempotency: advisory lock + check + insert in one DB call
        const agentId = comp.agentId || 'decorrelated-blend';
        const { data: slotId, error: slotErr } = await sb.rpc('try_acquire_blend_slot', {
          p_agent_id: agentId,
          p_currency_pair: instrument,
          p_user_id: userId,
          p_signal_id: signalId,
          p_direction: direction,
          p_units: units,
          p_environment: ENVIRONMENT,
          p_confidence_score: comp.weight,
          p_requested_price: limitPrice,
        });

        if (slotErr) {
          console.error(`[BLEND] Slot acquire error ${instrument}:`, slotErr.message);
          return { component: comp.id, label: comp.label, pair: instrument, direction, status: 'db_error', error: slotErr.message };
        }

        if (!slotId) {
          return { component: comp.id, label: comp.label, pair: instrument, direction, status: 'skipped', skipReason: 'Slot occupied (advisory lock)' };
        }

        const dbOrder = { id: slotId };

        // Execute LIMIT ORDER on OANDA
        const orderTs = Date.now();
        const orderBody = {
          order: {
            type: 'LIMIT',
            instrument,
            units: signedUnits.toString(),
            price: limitPrice.toFixed(prec),
            timeInForce: 'GTD',
            gtdTime: limitExpiry,
            positionFill: 'DEFAULT',
            triggerCondition: 'DEFAULT',
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
          return { component: comp.id, label: comp.label, pair: instrument, direction, status: 'rejected', error: errMsg };
        }

        const oandaOrderId = oandaData.orderCreateTransaction?.id || null;
        const oandaTradeId = oandaData.orderFillTransaction?.tradeOpened?.tradeID || null;
        const filledPrice = oandaData.orderFillTransaction?.price ? parseFloat(oandaData.orderFillTransaction.price) : null;
        const wasImmediatelyFilled = filledPrice != null;

        const pipMult = instrument.includes('JPY') ? 100 : 10000;
        const slippagePips = filledPrice != null ? Math.abs((filledPrice - limitPrice) * pipMult) : null;

        // CRITICAL: Update DB with OANDA order ID immediately
        const { error: updateErr } = await sb.from('oanda_orders').update({
          status: wasImmediatelyFilled ? 'filled' : 'open',
          oanda_order_id: oandaOrderId,
          oanda_trade_id: oandaTradeId,
          entry_price: filledPrice,
          requested_price: limitPrice,
          slippage_pips: slippagePips,
          fill_latency_ms: fillLatency,
          gate_result: gateLabel,
          gate_reasons: [
            `Component: ${comp.id} (${(comp.weight * 100).toFixed(0)}% weight) | Scaler: ${scalerMultiplier}x`,
            `Rank: ${predCurrency}(#${comp.predatorRank}) vs ${preyCurrency}(#${comp.preyRank})`,
            `LIMIT @ ${limitPrice.toFixed(prec)} (bid=${pricing.bid.toFixed(prec)} ask=${pricing.ask.toFixed(prec)} ±2p trap)`,
            `SL: ${slPrice.toFixed(prec)} (${slPips}p) | TP: ${tpPrice.toFixed(prec)} | Expires: ${limitExpiry}`,
          ],
        }).eq('id', dbOrder.id);

        if (updateErr) {
          console.error(`[BLEND] ❌ DB UPDATE FAILED ${instrument} (id=${dbOrder.id}):`, updateErr.message);
        }

        const statusLabel = wasImmediatelyFilled ? 'filled' : 'pending_limit';
        console.log(`[BLEND] ✅ ${comp.id} ${instrument} ${direction.toUpperCase()} LIMIT ${units}u @ ${limitPrice.toFixed(prec)} [${statusLabel}] oanda=${oandaOrderId} [${fillLatency}ms]`);

        return {
          component: comp.id, label: comp.label, pair: instrument, direction,
          status: statusLabel, units, weight: comp.weight,
          entryPrice: filledPrice ?? limitPrice,
          slPrice: parseFloat(slPrice.toFixed(prec)),
          tpPrice: parseFloat(tpPrice.toFixed(prec)),
          oandaTradeId: oandaTradeId ?? oandaOrderId ?? undefined,
        };
      })
    );

    // Collect results
    for (const result of parallelResults) {
      if (result.status === 'fulfilled') {
        executionResults.push(result.value as any);
      } else {
        console.error(`[BLEND] Parallel task failed:`, result.reason);
        executionResults.push({ component: '?', label: '?', pair: '?', direction: '?', status: 'error', error: String(result.reason) });
      }
    }

    const filled = executionResults.filter(r => r.status === 'filled' || r.status === 'pending_limit').length;
    const skipped = executionResults.filter(r => r.status === 'skipped').length;
    const errors = executionResults.filter(r => !['filled', 'skipped', 'pending_limit'].includes(r.status)).length;

    console.log(`[BLEND] Cycle complete: ${filled} placed, ${skipped} skipped, ${errors} errors, ${openPairs.size} total open`);

    await releaseLock();

    return new Response(
      JSON.stringify({
        success: true,
        cycle: {
          componentsEvaluated: activeComponents.length,
          executed: filled,
          skipped,
          errors,
          existingPositions: openPairs.size,
          maxPositions,
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
    // Release DB lock on error
    try {
      const sb2 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb2.from('system_settings').update({
        value: { locked: false, locked_at: null } as any,
        updated_at: new Date().toISOString(),
      }).eq('key', 'blend_executor_lock');
    } catch {}
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
