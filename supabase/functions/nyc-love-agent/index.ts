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

const OANDA_HOST = 'https://api-fxpractice.oanda.com';
const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
const AGENT_ID = 'nyc-love';
const ENVIRONMENT = 'practice';

// ── Fixed risk parameters ──
const BASE_SL_PIPS = 20;
const TP_RATIO = 3; // 3:1 R:R always
const SPREAD_LIMIT_PIPS = 3.0;
const NEXUS_CONFIDENCE_THRESHOLD = 0.88;

// ── ADI crosses for dollar triangulation ──
const USD_CROSSES = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD', 'NZD_USD'];

function pipValue(inst: string): number { return inst.includes('JPY') ? 0.01 : 0.0001; }
function pricePrecision(inst: string): number { return inst.includes('JPY') ? 3 : 5; }
function pipScale(inst: string): number { return inst.includes('JPY') ? 100 : 10000; }

// ══════════════════════════════════════════
// SESSION GATE
// ══════════════════════════════════════════

function isNYCOpenWindow(): { allowed: boolean; reason: string } {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const minutes = utcH * 60 + utcM;
  if (minutes >= 810 && minutes <= 1290) {
    return { allowed: true, reason: `NYC session active (${utcH}:${String(utcM).padStart(2, '0')} UTC)` };
  }
  return { allowed: false, reason: `Outside NYC session (${utcH}:${String(utcM).padStart(2, '0')} UTC). Window: 13:30–21:30 UTC` };
}

// ══════════════════════════════════════════
// OANDA DATA LAYER
// ══════════════════════════════════════════

async function fetchBatchPricing(instruments: string[], apiToken: string, accountId: string): Promise<Record<string, { bid: number; ask: number; spread: number; mid: number }>> {
  const result: Record<string, { bid: number; ask: number; spread: number; mid: number }> = {};
  try {
    const joined = instruments.join(',');
    const res = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/pricing?instruments=${joined}`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
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

async function fetchM5Candles(instrument: string, count: number, apiToken: string, accountId: string): Promise<{ volume: number; close: number; open: number; high: number; low: number }[]> {
  try {
    const res = await fetch(`${OANDA_HOST}/v3/instruments/${instrument}/candles?count=${count}&granularity=M5&price=M`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.candles || [])
      .filter((c: { complete?: boolean }) => c.complete !== false)
      .map((c: { volume: number; mid: { o: string; c: string; h: string; l: string } }) => ({
        volume: c.volume,
        open: parseFloat(c.mid.o),
        close: parseFloat(c.mid.c),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
      }));
  } catch { return []; }
}

// ── Fetch Order Book from market_liquidity_map (pre-populated by wall-of-pain-injector) ──
async function fetchOrderBook(instrument: string, _apiToken: string, sb: any): Promise<{ price: number; longPct: number; shortPct: number; buckets: { price: number; longPct: number; shortPct: number }[] } | null> {
  try {
    const { data } = await sb
      .from('market_liquidity_map')
      .select('current_price, all_buckets')
      .eq('currency_pair', instrument)
      .single();

    if (!data || !data.all_buckets) return null;

    const price = data.current_price || 0;
    const buckets = (data.all_buckets || []) as { price: number; longPct: number; shortPct: number }[];

    // Global imbalance
    let totalLong = 0, totalShort = 0;
    for (const b of buckets) { totalLong += b.longPct; totalShort += b.shortPct; }
    return { price, longPct: totalLong, shortPct: totalShort, buckets };
  } catch { return null; }
}

async function getAccountNAV(apiToken: string, accountId: string): Promise<number> {
  try {
    const res = await fetch(`${OANDA_HOST}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    const data = await res.json();
    return parseFloat(data.account?.NAV || '0');
  } catch { return 0; }
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
// PILLAR 1: SYNTHETIC DOLLAR TRIANGULATION (ADI Truth Filter)
// ══════════════════════════════════════════
// Calculates Absolute Dollar Index across 7 USD crosses.
// If a tick spike on one pair isn't confirmed across the board,
// it's flagged as a Retail Liquidity Hunt → prepare to FADE.

interface ADIResult {
  dollarStrength: number;       // -1.0 (weak) to +1.0 (strong)
  confirmedCrosses: number;     // how many crosses agree
  totalCrosses: number;
  isRetailHunt: boolean;        // spike isolated = trap
  fadeDirection: 'BUY' | 'SELL' | null; // direction to fade if hunt detected
  detail: string;
}

function calculateADI(
  targetInstrument: string,
  targetDirection: 'BUY' | 'SELL',
  allPricing: Record<string, { mid: number; spread: number }>,
  allCandles: Record<string, { close: number; open: number }[]>,
): ADIResult {
  let dollarBullCount = 0;
  let dollarBearCount = 0;
  let totalChecked = 0;

  for (const cross of USD_CROSSES) {
    const candles = allCandles[cross];
    if (!candles || candles.length < 2) continue;
    totalChecked++;

    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const move = latest.close - prev.close;

    // For USD_XXX pairs (USD is base): price UP = base(USD) strong = USD bull
    // For XXX_USD pairs (USD is quote): price UP = base strong / USD weak = USD bear
    const isUsdBase = cross.startsWith('USD_');
    const usdStrengthening = isUsdBase ? move > 0 : move < 0;

    if (usdStrengthening) dollarBullCount++;
    else dollarBearCount++;
  }

  const dollarStrength = totalChecked > 0 ? (dollarBullCount - dollarBearCount) / totalChecked : 0;

  // Check if target pair's move is confirmed by dollar flow
  const [base, quote] = targetInstrument.split('_');
  const isUsdInPair = base === 'USD' || quote === 'USD';

  let confirmedCrosses = 0;
  if (isUsdInPair) {
    // BUY EUR/USD = EUR strong + USD weak → dollarBearCount confirms
    // SELL EUR/USD = EUR weak + USD strong → dollarBullCount confirms
    // BUY USD/JPY = USD strong + JPY weak → dollarBullCount confirms
    // SELL USD/JPY = USD weak + JPY strong → dollarBearCount confirms
    const tradeImpliesUsdStrong =
      (base === 'USD' && targetDirection === 'BUY') ||
      (quote === 'USD' && targetDirection === 'SELL');
    confirmedCrosses = tradeImpliesUsdStrong ? dollarBullCount : dollarBearCount;
  } else {
    confirmedCrosses = totalChecked; // non-USD pair, ADI is informational
  }

  // Retail Hunt detection: spike on target but <40% of crosses agree
  const confirmRatio = totalChecked > 0 ? confirmedCrosses / totalChecked : 0;
  const isRetailHunt = isUsdInPair && confirmRatio < 0.40;
  const fadeDirection = isRetailHunt ? (targetDirection === 'BUY' ? 'SELL' as const : 'BUY' as const) : null;

  return {
    dollarStrength,
    confirmedCrosses,
    totalCrosses: totalChecked,
    isRetailHunt,
    fadeDirection,
    detail: `ADI=${dollarStrength.toFixed(2)} confirmed=${confirmedCrosses}/${totalChecked} hunt=${isRetailHunt}`,
  };
}

// ══════════════════════════════════════════
// PILLAR 2: NEURAL VOLATILITY BUFFERS (Adaptive ATR-Gap Anti-MAE)
// ══════════════════════════════════════════
// ATR is a "rearview mirror" — it uses completed candles.
// During the first 15 minutes of the open (9:30 AM), the market
// changes in milliseconds. ATR based on the 9:25 candle thinks
// the market is "walking" when it's actually "sprinting."
//
// FIX: Use Real-Time Tick Variance (StdDev of last 50 ticks) during
// the first 15 minutes of the open. After that, ATR is reliable.

interface VolatilityBuffer {
  adaptiveSL: number;           // dynamic SL in pips
  adaptiveTP: number;           // maintains 3:1 ratio
  atrPips: number;              // current ATR in pips
  avgAtrPips: number;           // baseline ATR
  breathRatio: number;          // current/avg — >1.5 = "breathing hard"
  usedTickVariance: boolean;    // true if tick variance was used instead of ATR
  detail: string;
}

// Calculate real-time breath from streaming pricing ticks
function calculateTickVarianceBreath(
  currentPricing: { bid: number; ask: number; mid: number },
  recentCandles: { close: number }[],
  instrument: string,
): { breathRatio: number; tickVariancePips: number } {
  // Use close prices as proxy for tick samples (each M5 candle close = 1 "tick")
  // In first 15min we only have 0-3 completed candles, so use their closes
  // plus the current mid as tick data points
  const scale = pipScale(instrument);
  const ticks = recentCandles.map(c => c.close);
  ticks.push(currentPricing.mid); // add current live price

  if (ticks.length < 3) return { breathRatio: 1.0, tickVariancePips: 0 };

  // Calculate StdDev of tick-to-tick changes in pips
  const changes: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    changes.push((ticks[i] - ticks[i - 1]) * scale);
  }
  const mean = changes.reduce((s, c) => s + c, 0) / changes.length;
  const variance = changes.reduce((s, c) => s + (c - mean) ** 2, 0) / changes.length;
  const stdDevPips = Math.sqrt(variance);

  // Compare to expected "calm" StdDev (~2 pips for majors)
  const calmStdDev = instrument.includes('JPY') ? 3.0 : 2.0;
  const breathRatio = calmStdDev > 0 ? stdDevPips / calmStdDev : 1.0;

  return { breathRatio: Math.max(0.5, breathRatio), tickVariancePips: Math.round(stdDevPips * 10) / 10 };
}

function isFirstFifteenMinutes(): boolean {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const minutes = utcH * 60 + utcM;
  // 9:30 AM EST = 13:30 UTC = 810 minutes. First 15min = 810–825
  return minutes >= 810 && minutes <= 825;
}

function calculateNeuralVolatilityBuffer(
  candles: { high: number; low: number; close: number }[],
  instrument: string,
  currentPricing?: { bid: number; ask: number; mid: number },
): VolatilityBuffer {
  if (candles.length < 5) {
    return { adaptiveSL: BASE_SL_PIPS, adaptiveTP: BASE_SL_PIPS * TP_RATIO, atrPips: 0, avgAtrPips: 0, breathRatio: 1, usedTickVariance: false, detail: 'insufficient candles — using base SL' };
  }

  const scale = pipScale(instrument);

  // Calculate ATR for each candle (high - low in pips)
  const atrs = candles.map(c => (c.high - c.low) * scale);

  // Baseline ATR = average of full lookback (this is always reliable)
  const avgAtr = atrs.reduce((s, a) => s + a, 0) / atrs.length;

  // CRITICAL FIX: During first 15 minutes of open, ATR is a "rearview mirror."
  // Use real-time tick variance instead.
  let currentAtr: number;
  let usedTickVariance = false;

  if (isFirstFifteenMinutes() && currentPricing) {
    // Use tick variance for breath during the sprint
    const tv = calculateTickVarianceBreath(currentPricing, candles.slice(-5), instrument);
    currentAtr = avgAtr * tv.breathRatio; // Scale baseline by real-time breath
    usedTickVariance = true;
  } else {
    // Normal: average of last 3 candles (instantaneous breath)
    const recentAtrs = atrs.slice(-3);
    currentAtr = recentAtrs.reduce((s, a) => s + a, 0) / recentAtrs.length;
  }

  const breathRatio = avgAtr > 0 ? currentAtr / avgAtr : 1;

  // Adaptive SL: base SL * breath multiplier, clamped to 15–30 pips
  const rawAdaptiveSL = BASE_SL_PIPS * Math.max(0.75, Math.min(1.5, breathRatio));
  const adaptiveSL = Math.round(Math.max(15, Math.min(30, rawAdaptiveSL)) * 10) / 10;
  const adaptiveTP = Math.round(adaptiveSL * TP_RATIO * 10) / 10;

  return {
    adaptiveSL,
    adaptiveTP,
    atrPips: Math.round(currentAtr * 10) / 10,
    avgAtrPips: Math.round(avgAtr * 10) / 10,
    breathRatio: Math.round(breathRatio * 100) / 100,
    usedTickVariance,
    detail: `${usedTickVariance ? 'TICK-VAR' : 'ATR'}=${currentAtr.toFixed(1)} avg=${avgAtr.toFixed(1)} breath=${breathRatio.toFixed(2)} → SL=${adaptiveSL} TP=${adaptiveTP}`,
  };
}

// ══════════════════════════════════════════
// PILLAR 3: OBI (Order Book Imbalance) SNIFFER — MAGNET MODEL
// ══════════════════════════════════════════
// OANDA's order book = RETAIL positions only.
// Retail walls are NOT barriers — they are MAGNETS.
// Banks drive price THROUGH retail clusters to trigger stops and fill.
// If sovereign says BUY and there's a retail Sell Wall above → CONFIRMATION.
// The wall is liquidity the big fish will eat.

interface OBIResult {
  imbalanceRatio: number;       // >1 = more longs, <1 = more shorts
  nearbyWall: 'BUY_WALL' | 'SELL_WALL' | null;
  wallPrice: number | null;
  wallStrength: number;         // 0-1, how thick the wall is
  pathClear: boolean;           // always true in magnet model (walls = confirmation)
  wallIsMagnet: boolean;        // true if wall aligns as magnet for our direction
  longPct: number;              // total long percentage for UI
  shortPct: number;             // total short percentage for UI
  detail: string;
}

function analyzeOrderBookImbalance(
  orderBook: { price: number; longPct: number; shortPct: number; buckets: { price: number; longPct: number; shortPct: number }[] } | null,
  direction: 'BUY' | 'SELL',
  instrument: string,
): OBIResult {
  const neutral: OBIResult = { imbalanceRatio: 1, nearbyWall: null, wallPrice: null, wallStrength: 0, pathClear: true, wallIsMagnet: false, longPct: 50, shortPct: 50, detail: 'no order book data — path assumed clear' };
  if (!orderBook || !orderBook.buckets.length) return neutral;

  const currentPrice = orderBook.price;
  const pv = pipValue(instrument);
  const scanRange = 30 * pv; // scan 30 pips in our direction

  // Filter buckets in the direction of trade (where price needs to go for TP)
  const relevantBuckets = orderBook.buckets.filter(b => {
    if (direction === 'BUY') return b.price > currentPrice && b.price < currentPrice + scanRange;
    return b.price < currentPrice && b.price > currentPrice - scanRange;
  });

  // Find the thickest wall in our path
  let maxWallStrength = 0;
  let wallPrice: number | null = null;
  let wallType: 'BUY_WALL' | 'SELL_WALL' | null = null;

  for (const b of relevantBuckets) {
    // If we're buying, a cluster of retail SELL orders above = Sell Wall
    // If we're selling, a cluster of retail BUY orders below = Buy Wall
    const blockingPct = direction === 'BUY' ? b.shortPct : b.longPct;
    if (blockingPct > maxWallStrength) {
      maxWallStrength = blockingPct;
      wallPrice = b.price;
      wallType = direction === 'BUY' ? 'SELL_WALL' : 'BUY_WALL';
    }
  }

  const wallSignificant = maxWallStrength > 2.0;
  const imbalanceRatio = orderBook.shortPct > 0 ? orderBook.longPct / orderBook.shortPct : 1;

  // MAGNET MODEL: A retail wall in our path is CONFIRMATION, not a blocker.
  // If BUY and Sell Wall above → retail is shorting there → banks will drive through to eat stops → MAGNET
  // If SELL and Buy Wall below → retail is long there → banks will drive through → MAGNET
  const wallIsMagnet = wallSignificant; // Any significant wall in our path = magnet

  return {
    imbalanceRatio: Math.round(imbalanceRatio * 100) / 100,
    nearbyWall: wallSignificant ? wallType : null,
    wallPrice: wallSignificant ? wallPrice : null,
    wallStrength: maxWallStrength,
    pathClear: true, // ALWAYS true — walls are magnets, never blockers
    wallIsMagnet,
    longPct: orderBook.longPct,
    shortPct: orderBook.shortPct,
    detail: wallSignificant
      ? `🧲 MAGNET: ${wallType} @ ${wallPrice?.toFixed(pricePrecision(instrument))} (${maxWallStrength.toFixed(1)}%) — retail liquidity = fuel for institutional move`
      : `path clear, imbalance=${imbalanceRatio.toFixed(2)} (L/S ratio)`,
  };
}

// ══════════════════════════════════════════
// NEXUS PROBABILITY ENGINE
// ══════════════════════════════════════════
// Fuses all three pillars + sovereign direction into a single
// probabilistic conviction score.

interface NexusScore {
  probability: number;          // 0.0 to 1.0
  tier: 'NEXUS_STRIKE' | 'PROBE' | 'SOVEREIGN_ONLY' | 'BLOCKED';
  spreadBypass: boolean;        // >95% bypasses spread shield
  detail: string;
}

function calculateNexusProbability(
  sovereignDir: 'BUY' | 'SELL' | null,
  adi: ADIResult,
  obi: OBIResult,
  volBuffer: VolatilityBuffer,
  nerve: { signal: 'NOISE' | 'CLEAN_FLOW'; variance: number },
  velocityRatio: number,
): NexusScore {
  if (!sovereignDir) {
    return { probability: 0, tier: 'BLOCKED', spreadBypass: false, detail: 'no sovereign direction' };
  }

  let score = 0.40; // Sovereign baseline = 40%

  // ADI Truth Filter: +25% if confirmed, -30% if retail hunt
  if (adi.isRetailHunt) {
    score -= 0.30;
  } else {
    const confirmBonus = adi.totalCrosses > 0 ? (adi.confirmedCrosses / adi.totalCrosses) * 0.25 : 0.10;
    score += confirmBonus;
  }

  // OBI Magnet Model: +15% if wall confirms (magnet), +5% if clear, 0 if no data
  if (obi.wallIsMagnet) {
    score += 0.15; // Retail wall in our path = institutional fuel = CONFIRMATION
  } else if (obi.pathClear) {
    score += 0.05;
  }

  // Nerve Tension: +10% for clean flow, -5% for noise
  if (nerve.signal === 'CLEAN_FLOW') {
    score += 0.10;
  } else {
    score -= 0.05;
  }

  // Velocity confirmation: +10% if volume spike aligns
  if (velocityRatio > 1.5) {
    score += 0.10;
  }

  // Volatility buffer alignment: slight bonus if breath is normal
  if (volBuffer.breathRatio >= 0.8 && volBuffer.breathRatio <= 1.3) {
    score += 0.05;
  }

  const probability = Math.max(0, Math.min(1, score));
  // HARD CAP: Never bypass spread that exceeds 20% of adaptive SL
  // Even at 95%+ conviction, a 5-pip spread on a 20-pip SL = dead trade
  const maxBypassSpread = volBuffer.adaptiveSL * 0.20;
  const spreadBypass = false; // REMOVED — hard cap enforced at execution level

  let tier: NexusScore['tier'];
  if (probability >= NEXUS_CONFIDENCE_THRESHOLD) tier = 'NEXUS_STRIKE';
  else if (probability >= 0.65) tier = 'PROBE';
  else if (probability >= 0.45) tier = 'SOVEREIGN_ONLY';
  else tier = 'BLOCKED';

  return {
    probability: Math.round(probability * 1000) / 1000,
    tier,
    spreadBypass,
    detail: `P=${(probability * 100).toFixed(1)}% tier=${tier} bypass=${spreadBypass}`,
  };
}

// ══════════════════════════════════════════
// SOVEREIGN DIRECTION (unchanged)
// ══════════════════════════════════════════

async function getSovereignDirection(instrument: string, sb: ReturnType<typeof createClient>): Promise<{ direction: 'BUY' | 'SELL' | null; debug: string }> {
  try {
    const { data, error } = await sb
      .from('sovereign_memory')
      .select('payload')
      .eq('memory_key', 'live_strength_index')
      .eq('memory_type', 'currency_strength')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return { direction: null, debug: `query_error: ${error.message}` };
    if (!data?.payload) return { direction: null, debug: 'no_payload' };

    const payload = data.payload as { strengths?: { currency: string; rank: number }[] };
    if (!payload.strengths?.length) return { direction: null, debug: 'no_strengths' };

    const ranks: Record<string, number> = {};
    for (const s of payload.strengths) ranks[s.currency] = s.rank;

    const [base, quote] = instrument.split('_');
    const bR = ranks[base], qR = ranks[quote];
    if (bR == null || qR == null) return { direction: null, debug: `missing: ${base}=${bR} ${quote}=${qR}` };

    const dir = bR < qR ? 'BUY' as const : qR < bR ? 'SELL' as const : null;
    return { direction: dir, debug: `${base}=#${bR} ${quote}=#${qR} → ${dir || 'EQUAL'}` };
  } catch (e) {
    return { direction: null, debug: `exception: ${(e as Error).message}` };
  }
}

// ══════════════════════════════════════════
// ORDER EXECUTION
// ══════════════════════════════════════════

async function placeMarketOrder(
  instrument: string, units: number, direction: 'BUY' | 'SELL',
  bid: number, ask: number, slPips: number, tpPips: number,
  apiToken: string, accountId: string,
): Promise<{ success: boolean; tradeId?: string; error?: string; fillPrice?: number }> {
  const pv = pipValue(instrument);
  const prec = pricePrecision(instrument);
  const side = direction === 'BUY' ? 1 : -1;

  // BUY fills at ask, SELL fills at bid — use correct reference for SL/TP
  const refPrice = direction === 'BUY' ? ask : bid;
  const slPrice = (refPrice - side * slPips * pv).toFixed(prec);
  const tpPrice = (refPrice + side * tpPips * pv).toFixed(prec);

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
// VELOCITY DETECTION (retained)
// ══════════════════════════════════════════

function detectVelocitySpike(candles: { volume: number; close: number; open: number }[]): { spike: boolean; ratio: number; direction: 'BUY' | 'SELL' | null } {
  if (candles.length < 5) return { spike: false, ratio: 0, direction: null };
  const current = candles[candles.length - 1];
  const lookback = candles.slice(0, -1);
  const avgVol = lookback.reduce((s, c) => s + c.volume, 0) / lookback.length;
  const ratio = avgVol > 0 ? current.volume / avgVol : 0;
  if (ratio < 1.5) return { spike: false, ratio, direction: null };
  return { spike: true, ratio, direction: current.close > current.open ? 'BUY' : 'SELL' };
}

// ── Nerve tension (retained) ──
function calculateNerveTension(candles: { close: number }[]): { signal: 'NOISE' | 'CLEAN_FLOW'; variance: number } {
  if (candles.length < 3) return { signal: 'CLEAN_FLOW', variance: 0 };
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = (returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length) * 1e8;
  return { signal: variance > 0.85 ? 'NOISE' : 'CLEAN_FLOW', variance };
}

// ══════════════════════════════════════════
// MAIN HANDLER — SOVEREIGN NEURAL NEXUS
// ══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const log: string[] = [];
  const executions: { instrument: string; direction: string; status: string; detail: string; nexusP?: number }[] = [];

  try {
    // ── 1. Session Gate ──
    const session = isNYCOpenWindow();
    log.push(session.reason);
    if (!session.allowed) {
      return new Response(JSON.stringify({ success: true, reason: 'session_gate', detail: session.reason, log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Credentials ──
    const apiToken = Deno.env.get('OANDA_API_TOKEN')!;
    const accountId = Deno.env.get('OANDA_ACCOUNT_ID')!;
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── 3. NAV + Admin User ──
    const [nav, adminResult] = await Promise.all([
      getAccountNAV(apiToken, accountId),
      sb.from('user_roles').select('user_id').eq('role', 'admin').limit(1).single(),
    ]);
    log.push(`Account NAV: $${nav.toFixed(2)}`);
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

    const riskDollars = nav * 0.02;

    // ── Circuit Breaker Check ──
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

    // ── 4. PILLAR 1: ADI — Read pre-cached state first, fetch fresh only if stale ──
    // The "Latency Tax" fix: execution loop READS state, doesn't FETCH it.
    // A background invocation or cron should update this every 30s.
    let allPricing: Record<string, { bid: number; ask: number; spread: number; mid: number }> = {};
    let allCandles: Record<string, { volume: number; close: number; open: number; high: number; low: number }[]> = {};

    const { data: cachedAdi } = await sb
      .from('sovereign_memory')
      .select('payload, updated_at')
      .eq('memory_type', 'adi_cache')
      .eq('memory_key', 'live_adi_state')
      .single();

    const cacheAgeMs = cachedAdi?.updated_at ? Date.now() - new Date(cachedAdi.updated_at).getTime() : Infinity;
    const ADI_CACHE_TTL_MS = 60_000; // 60s stale threshold

    if (cachedAdi?.payload && cacheAgeMs < ADI_CACHE_TTL_MS) {
      // Use cached pricing + candles to avoid the Latency Tax
      const cached = cachedAdi.payload as { pricing?: Record<string, any>; candles?: Record<string, any[]> };
      allPricing = (cached.pricing || {}) as typeof allPricing;
      allCandles = (cached.candles || {}) as typeof allCandles;
      log.push(`🔺 PILLAR 1: ADI from cache (${Math.round(cacheAgeMs / 1000)}s old) — zero latency tax`);
    } else {
      // Cache miss or stale — fetch fresh and update cache
      log.push('🔺 PILLAR 1: ADI cache stale — fetching fresh (latency tax incurred)...');
      const allCrossInstruments = [...new Set([...INSTRUMENTS, ...USD_CROSSES])];
      const [freshPricing, ...crossCandleResults] = await Promise.all([
        fetchBatchPricing(allCrossInstruments, apiToken, accountId),
        ...allCrossInstruments.map(inst => fetchM5Candles(inst, 24, apiToken, accountId)),
      ]);
      allPricing = freshPricing;
      allCrossInstruments.forEach((inst, i) => { allCandles[inst] = crossCandleResults[i]; });

      // Persist to cache for next invocation
      await sb.from('sovereign_memory').upsert({
        memory_type: 'adi_cache',
        memory_key: 'live_adi_state',
        payload: { pricing: allPricing, candles: allCandles, updatedAt: new Date().toISOString() },
        relevance_score: 1.0,
        created_by: 'nyc-love-agent',
      }, { onConflict: 'memory_type,memory_key' });
    }

    log.push(`ADI data: ${Object.keys(allPricing).length} priced, ${Object.keys(allCandles).filter(k => (allCandles[k]?.length || 0) > 0).length} with candles`);

    // ── 5. PILLAR 3: Fetch Order Books for all instruments ──
    log.push('🔺 PILLAR 3: OBI Sniffer — reading order book from liquidity map...');
    const orderBooks = await Promise.all(INSTRUMENTS.map(inst => fetchOrderBook(inst, apiToken, sb)));
    const obiMap: Record<string, Awaited<ReturnType<typeof fetchOrderBook>>> = {};
    INSTRUMENTS.forEach((inst, i) => { obiMap[inst] = orderBooks[i]; });

    // ── 6. Scan each instrument through NEXUS ──
    for (const instrument of INSTRUMENTS) {
      const tag = `[${instrument}]`;

      // Check existing position
      if (await hasOpenPosition(instrument, sb)) {
        log.push(`${tag} Already has open position, skipping`);
        executions.push({ instrument, direction: '-', status: 'skipped', detail: 'existing_position' });
        continue;
      }

      // Pricing
      const pricing = allPricing[instrument];
      if (!pricing) {
        log.push(`${tag} No pricing data`);
        continue;
      }

      // ── Sovereign Direction ──
      const { direction: sovereignDir, debug: sovDebug } = await getSovereignDirection(instrument, sb);
      log.push(`${tag} SOVEREIGN: ${sovDebug}`);
      if (!sovereignDir) {
        executions.push({ instrument, direction: '-', status: 'no_direction', detail: sovDebug });
        continue;
      }

      // ── PILLAR 1: ADI Truth Filter ──
      const adi = calculateADI(instrument, sovereignDir, allPricing, allCandles);
      log.push(`${tag} 🔺 ADI: ${adi.detail}`);
      if (adi.isRetailHunt && adi.fadeDirection) {
        log.push(`${tag} ⚠️ RETAIL HUNT DETECTED — sovereign says ${sovereignDir} but only ${adi.confirmedCrosses}/${adi.totalCrosses} crosses confirm. Preparing FADE to ${adi.fadeDirection} when gravity kicks in.`);
      }

      // ── PILLAR 2: Neural Volatility Buffer (with tick variance for first 15min) ──
      const candles = allCandles[instrument] || [];
      const volBuffer = calculateNeuralVolatilityBuffer(candles, instrument, pricing);
      log.push(`${tag} 🧠 BREATH: ${volBuffer.detail}`);

      // ── PILLAR 3: OBI Sniffer ──
      const obi = analyzeOrderBookImbalance(obiMap[instrument], sovereignDir, instrument);
      log.push(`${tag} 📊 OBI: ${obi.detail}`);

      // ── Nerve + Velocity (supporting signals) ──
      const nerve = calculateNerveTension(candles);
      const velocity = detectVelocitySpike(candles);

      // ── NEXUS PROBABILITY ──
      const nexus = calculateNexusProbability(sovereignDir, adi, obi, volBuffer, nerve, velocity.ratio);
      log.push(`${tag} 🎯 NEXUS: ${nexus.detail}`);

      if (nexus.tier === 'BLOCKED') {
        log.push(`${tag} ❌ NEXUS BLOCKED — conviction too low (${(nexus.probability * 100).toFixed(1)}%)`);
        executions.push({ instrument, direction: sovereignDir, status: 'nexus_blocked', detail: nexus.detail, nexusP: nexus.probability });
        continue;
      }

      // ── Spread Shield: HARD CAP — max spread = 20% of adaptive SL. Period. ──
      const maxSpread = volBuffer.adaptiveSL * 0.20;
      if (pricing.spread > maxSpread) {
        log.push(`${tag} Spread Shield HARD CAP: ${pricing.spread.toFixed(1)} pips > ${maxSpread.toFixed(1)} (20% of ${volBuffer.adaptiveSL}p SL) — NO bypass allowed`);
        executions.push({ instrument, direction: sovereignDir, status: 'spread_blocked', detail: `spread=${pricing.spread.toFixed(1)} > cap=${maxSpread.toFixed(1)}` });
        continue;
      }

      // ── OBI Magnet Logging (no longer blocks — walls are confirmation) ──
      if (obi.wallIsMagnet) {
        log.push(`${tag} 🧲 OBI MAGNET: Retail ${obi.nearbyWall} @ ${obi.wallPrice?.toFixed(pricePrecision(instrument))} is FUEL — institutional move will eat through`);
      }

      // ── Position Sizing: Standard forex formula ──
      // For standard pairs: 1 pip = 0.0001 price move. 1 unit of EUR/USD: 1 pip = $0.0001
      // For 10,000 units: 1 pip = $1.00. Formula: units = riskDollars / (SL_pips * pip_value_per_unit)
      // For JPY pairs: 1 pip = 0.01. At ~155 JPY/USD, pip value in USD = 0.01/155 ≈ 0.0000645
      const sizingMultiplier = nexus.tier === 'NEXUS_STRIKE' ? 1.0 : nexus.tier === 'PROBE' ? 0.7 : 0.5;
      const pipValueUSD = instrument.includes('JPY')
        ? 0.01 / (pricing.mid > 1 ? pricing.mid : 1) // JPY: convert yen pip to USD using current rate
        : 0.0001; // Standard: $0.0001 per unit per pip
      const rawUnits = Math.floor(riskDollars / (volBuffer.adaptiveSL * pipValueUSD));
      const units = Math.max(100, Math.floor(rawUnits * sizingMultiplier));

      // ── Execute with adaptive SL/TP ──
      log.push(`${tag} 🚀 EXECUTING: ${sovereignDir} ${units} units (${nexus.tier} P=${(nexus.probability * 100).toFixed(1)}%) SL=${volBuffer.adaptiveSL} TP=${volBuffer.adaptiveTP}`);

      const signalId = `nexus-${instrument}-${Date.now()}`;
      const { data: slotResult } = await sb.rpc('try_acquire_blend_slot', {
        p_agent_id: AGENT_ID,
        p_currency_pair: instrument,
        p_user_id: userId,
        p_signal_id: signalId,
        p_direction: sovereignDir === 'BUY' ? 'long' : 'short',
        p_units: units,
        p_environment: ENVIRONMENT,
        p_confidence_score: nexus.probability,
        p_requested_price: pricing.mid,
      });

      if (!slotResult) {
        log.push(`${tag} Slot occupied (blend lock), skipping`);
        executions.push({ instrument, direction: sovereignDir, status: 'slot_blocked', detail: 'blend slot occupied' });
        continue;
      }

      const orderId = slotResult as string;
      const result = await placeMarketOrder(instrument, units, sovereignDir, pricing.bid, pricing.ask, volBuffer.adaptiveSL, volBuffer.adaptiveTP, apiToken, accountId);

      if (result.success) {
        const entryPrice = result.fillPrice || (sovereignDir === 'BUY' ? pricing.ask : pricing.bid);
        log.push(`${tag} ✅ NEXUS FILLED — Trade ID: ${result.tradeId} @ ${entryPrice.toFixed(pricePrecision(instrument))} | SL=${volBuffer.adaptiveSL} TP=${volBuffer.adaptiveTP}`);
        await sb.from('oanda_orders').update({
          status: 'filled',
          oanda_trade_id: result.tradeId || null,
          entry_price: entryPrice,
          session_label: 'newyork',
          spread_at_entry: pricing.spread,
        }).eq('id', orderId);
        executions.push({ instrument, direction: sovereignDir, status: 'filled', detail: `tradeId=${result.tradeId} P=${(nexus.probability * 100).toFixed(1)}%`, nexusP: nexus.probability });
      } else {
        log.push(`${tag} ❌ REJECTED — ${result.error}`);
        await sb.from('oanda_orders').update({ status: 'rejected', error_message: result.error?.slice(0, 500) }).eq('id', orderId);
        executions.push({ instrument, direction: sovereignDir, status: 'rejected', detail: result.error || 'unknown' });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      agent: AGENT_ID,
      engine: 'sovereign-neural-nexus-v2',
      session: 'newyork',
      executions,
      log,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[NYC-LOVE NEXUS] Fatal:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message, log }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
