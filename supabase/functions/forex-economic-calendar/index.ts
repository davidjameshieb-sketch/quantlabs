// ═══════════════════════════════════════════════════════════════
// ECONOMIC CALENDAR — "Shock Sensor" for Smart G8 + G16 News Kill-Switch
// Fetches high-impact economic events so the Sovereign Intelligence
// can distinguish scheduled news from random liquidity gaps.
//
// G16 NEWS KILL-SWITCH:
// 1. Dead-Zone Timer: FLATLINE 5min before → 15min after any Red Folder event
// 2. Surprise Delta: If actual deviates >2σ from forecast → bias-lock affected currency
// 3. Spread Guard: Delegated to auto-trade (reads live spread vs 24h median)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EconomicEvent {
  country: string;
  currency: string;
  event: string;
  impact: "high" | "medium" | "low";
  time: string;           // ISO timestamp
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
  minutesUntil: number;   // negative = already happened
  status: "upcoming" | "released" | "past";
}

// Currency → affected pairs mapping
const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "NZD_USD", "USD_CHF"],
  EUR: ["EUR_USD", "EUR_GBP", "EUR_JPY", "EUR_AUD", "EUR_CHF", "EUR_CAD", "EUR_NZD"],
  GBP: ["GBP_USD", "EUR_GBP", "GBP_JPY", "GBP_AUD", "GBP_CAD", "GBP_CHF", "GBP_NZD"],
  JPY: ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY", "CAD_JPY", "CHF_JPY", "NZD_JPY"],
  AUD: ["AUD_USD", "EUR_AUD", "GBP_AUD", "AUD_JPY", "AUD_CAD", "AUD_CHF", "AUD_NZD"],
  CAD: ["USD_CAD", "EUR_CAD", "GBP_CAD", "AUD_CAD", "CAD_JPY", "CAD_CHF", "NZD_CAD"],
  CHF: ["USD_CHF", "EUR_CHF", "GBP_CHF", "AUD_CHF", "CAD_CHF", "CHF_JPY", "NZD_CHF"],
  NZD: ["NZD_USD", "EUR_NZD", "GBP_NZD", "AUD_NZD", "NZD_CAD", "NZD_CHF", "NZD_JPY"],
  CNY: ["USD_CNH"],
};

// USD-bullish events: if actual > forecast, USD strengthens
const USD_BULLISH_EVENTS = [
  "nonfarm payrolls", "non-farm", "nfp", "cpi", "core cpi", "ppi",
  "retail sales", "gdp", "ism manufacturing", "ism services",
  "jolts", "consumer confidence", "durable goods",
];

function classifyImpact(impact: number): "high" | "medium" | "low" {
  if (impact >= 3) return "high";
  if (impact >= 2) return "medium";
  return "low";
}

let cachedEvents: EconomicEvent[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchFromFinnhub(apiKey: string): Promise<EconomicEvent[]> {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEvents;
  }

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rawEvents = data.economicCalendar || [];
  const nowMs = Date.now();

  const events: EconomicEvent[] = rawEvents
    .filter((e: any) => e.impact >= 2)
    .map((e: any) => {
      const eventTime = new Date(`${e.time || e.date}Z`).getTime();
      const minutesUntil = Math.round((eventTime - nowMs) / 60000);
      let status: "upcoming" | "released" | "past";
      if (minutesUntil > 5) status = "upcoming";
      else if (minutesUntil > -30 && e.actual !== null) status = "released";
      else if (minutesUntil <= -30) status = "past";
      else status = "upcoming";

      return {
        country: e.country || "",
        currency: e.country === "US" ? "USD"
          : e.country === "EU" ? "EUR"
          : e.country === "GB" ? "GBP"
          : e.country === "JP" ? "JPY"
          : e.country === "AU" ? "AUD"
          : e.country === "CA" ? "CAD"
          : e.country === "CH" ? "CHF"
          : e.country === "NZ" ? "NZD"
          : e.country === "CN" ? "CNY"
          : e.country || "USD",
        event: e.event || "Unknown",
        impact: classifyImpact(e.impact || 1),
        time: e.time ? `${e.time}Z` : `${e.date}T00:00:00Z`,
        actual: e.actual ?? null,
        estimate: e.estimate ?? null,
        prev: e.prev ?? null,
        unit: e.unit || "",
        minutesUntil,
        status,
      };
    })
    .sort((a: EconomicEvent, b: EconomicEvent) => a.minutesUntil - b.minutesUntil);

  cachedEvents = events;
  cacheTimestamp = now;
  return events;
}

// ═══════════════════════════════════════════════════════════════
// G16 NEWS KILL-SWITCH ENGINE
// ═══════════════════════════════════════════════════════════════

interface G16Result {
  deadZoneActive: boolean;
  deadZoneEvents: string[];
  deadZonePairs: string[];
  biasLocks: Array<{ currency: string; direction: 'block_short' | 'block_long'; event: string; surprisePct: number; expiresAt: string }>;
  gatesWritten: number;
}

async function enforceG16(
  events: EconomicEvent[],
  sb: ReturnType<typeof createClient>
): Promise<G16Result> {
  const result: G16Result = {
    deadZoneActive: false,
    deadZoneEvents: [],
    deadZonePairs: [],
    biasLocks: [],
    gatesWritten: 0,
  };

  // ─── 1. DEAD-ZONE TIMER ───
  // Flatline 5min before → 15min after any HIGH IMPACT event
  const deadZoneEvents = events.filter(e =>
    e.impact === "high" && e.minutesUntil <= 5 && e.minutesUntil >= -15
  );

  if (deadZoneEvents.length > 0) {
    result.deadZoneActive = true;
    const affectedPairs = new Set<string>();

    for (const ev of deadZoneEvents) {
      result.deadZoneEvents.push(`${ev.currency}: ${ev.event} (${ev.minutesUntil > 0 ? `in ${ev.minutesUntil}m` : `${Math.abs(ev.minutesUntil)}m ago`})`);
      const pairs = CURRENCY_PAIRS[ev.currency] || [];
      pairs.forEach(p => affectedPairs.add(p));
    }

    result.deadZonePairs = [...affectedPairs];

    // Write G16 dead-zone gate for each affected pair
    for (const pair of affectedPairs) {
      const gateId = `G16_NEWS_DEADZONE:${pair}`;
      // Check if already active to avoid duplicate writes
      const { data: existing } = await sb.from('gate_bypasses')
        .select('gate_id')
        .eq('gate_id', gateId)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        // Expires 20 minutes from now (covers the full dead zone window)
        await sb.from('gate_bypasses').insert({
          gate_id: gateId,
          reason: JSON.stringify({
            action: 'FLATLINE',
            events: deadZoneEvents.filter(e => (CURRENCY_PAIRS[e.currency] || []).includes(pair)).map(e => e.event),
            trigger: 'G16_DEAD_ZONE_TIMER',
          }),
          expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
          pair,
          created_by: 'g16-news-killswitch',
        });
        result.gatesWritten++;
        console.log(`[G16] 🔴 DEAD ZONE: ${pair} — FLATLINE until ${deadZoneEvents.map(e => e.event).join(', ')} clears`);
      }
    }
  }

  // ─── 2. SURPRISE DELTA — Bias Lock ───
  // If actual deviates from forecast by >2σ equivalent (using >15% relative deviation as proxy)
  // Lock the affected currency's direction for 4 hours
  const surpriseEvents = events.filter(e =>
    e.status === "released" &&
    e.impact === "high" &&
    e.actual !== null &&
    e.estimate !== null &&
    e.estimate !== 0 &&
    e.minutesUntil >= -30 // Released in last 30min
  );

  for (const ev of surpriseEvents) {
    const deviation = ev.actual! - ev.estimate!;
    const deviationPct = Math.abs(deviation / ev.estimate!) * 100;

    // >15% relative deviation ≈ >2σ for most macro data
    if (deviationPct < 15) continue;

    const eventNameLower = ev.event.toLowerCase();
    const isUsdEvent = ev.currency === 'USD';

    // Determine if this is bullish or bearish for the currency
    const isPositiveSurprise = deviation > 0;
    // For most events, higher actual = stronger currency
    // Exception: unemployment claims (higher = weaker)
    const isUnemployment = eventNameLower.includes('unemployment') || eventNameLower.includes('jobless');
    const isCurrencyBullish = isUnemployment ? !isPositiveSurprise : isPositiveSurprise;

    // If currency is bullish, block shorts on that currency; if bearish, block longs
    const blockDirection: 'block_short' | 'block_long' = isCurrencyBullish ? 'block_short' : 'block_long';

    const affectedPairs = CURRENCY_PAIRS[ev.currency] || [];
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();

    for (const pair of affectedPairs) {
      const gateId = `G16_BIAS_LOCK:${pair}:${blockDirection}`;

      const { data: existing } = await sb.from('gate_bypasses')
        .select('gate_id')
        .eq('gate_id', gateId)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await sb.from('gate_bypasses').insert({
          gate_id: gateId,
          reason: JSON.stringify({
            action: blockDirection,
            event: ev.event,
            currency: ev.currency,
            actual: ev.actual,
            estimate: ev.estimate,
            deviationPct: Math.round(deviationPct * 10) / 10,
            trigger: 'G16_SURPRISE_DELTA',
          }),
          expires_at: expiresAt,
          pair,
          created_by: 'g16-news-killswitch',
        });
        result.gatesWritten++;
        console.log(`[G16] ⚡ BIAS LOCK: ${pair} ${blockDirection} for 4h — ${ev.event} surprise ${deviationPct.toFixed(1)}%`);
      }
    }

    result.biasLocks.push({
      currency: ev.currency,
      direction: blockDirection,
      event: ev.event,
      surprisePct: Math.round(deviationPct * 10) / 10,
      expiresAt,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Smart G8 Context Builder (existing, preserved)
// ═══════════════════════════════════════════════════════════════

function buildSmartG8Context(events: EconomicEvent[]) {
  const imminent = events.filter(e => e.minutesUntil > -5 && e.minutesUntil <= 60);
  const highImpactImminent = imminent.filter(e => e.impact === "high");
  const justReleased = events.filter(e => e.status === "released" && e.minutesUntil >= -30);

  const shockRisk: Record<string, { level: "extreme" | "high" | "elevated" | "normal"; events: string[]; minutesUntil: number }> = {};

  for (const e of [...highImpactImminent, ...justReleased]) {
    const curr = e.currency;
    if (!shockRisk[curr]) {
      shockRisk[curr] = { level: "normal", events: [], minutesUntil: e.minutesUntil };
    }
    shockRisk[curr].events.push(e.event);
    shockRisk[curr].minutesUntil = Math.min(shockRisk[curr].minutesUntil, e.minutesUntil);

    if (e.impact === "high" && e.minutesUntil <= 5 && e.minutesUntil > -2) {
      shockRisk[curr].level = "extreme";
    } else if (e.impact === "high" && e.minutesUntil <= 15) {
      shockRisk[curr].level = shockRisk[curr].level === "extreme" ? "extreme" : "high";
    } else if (e.impact === "high" && e.minutesUntil <= 60) {
      if (shockRisk[curr].level !== "extreme" && shockRisk[curr].level !== "high") {
        shockRisk[curr].level = "elevated";
      }
    }
  }

  const affectedPairs: string[] = [];
  for (const [curr, risk] of Object.entries(shockRisk)) {
    if (risk.level !== "normal") {
      affectedPairs.push(...(CURRENCY_PAIRS[curr] || []));
    }
  }

  const surprises = justReleased
    .filter(e => e.actual !== null && e.estimate !== null && e.estimate !== 0)
    .map(e => ({
      event: e.event,
      currency: e.currency,
      surprise: e.actual! - e.estimate!,
      surprisePct: ((e.actual! - e.estimate!) / Math.abs(e.estimate!)) * 100,
      direction: e.actual! > e.estimate! ? "beat" : "miss",
      minutesAgo: Math.abs(e.minutesUntil),
    }))
    .filter(s => Math.abs(s.surprisePct) > 5);

  return {
    timestamp: new Date().toISOString(),
    upcomingHighImpact: highImpactImminent.map(e => ({
      event: e.event, currency: e.currency, minutesUntil: e.minutesUntil,
      estimate: e.estimate, prev: e.prev,
    })),
    justReleased: justReleased.map(e => ({
      event: e.event, currency: e.currency, actual: e.actual,
      estimate: e.estimate, prev: e.prev, minutesAgo: Math.abs(e.minutesUntil),
    })),
    shockRisk,
    affectedPairs: [...new Set(affectedPairs)],
    surprises,
    allEvents: events.filter(e => e.minutesUntil > -60 && e.minutesUntil < 480).slice(0, 20),
    smartG8Directive: buildDirective(shockRisk, surprises),
  };
}

function buildDirective(
  shockRisk: Record<string, { level: string; events: string[]; minutesUntil: number }>,
  surprises: { event: string; currency: string; direction: string; surprisePct: number }[]
): string {
  const extremeCurrencies = Object.entries(shockRisk).filter(([, r]) => r.level === "extreme");
  const highCurrencies = Object.entries(shockRisk).filter(([, r]) => r.level === "high");

  if (extremeCurrencies.length > 0) {
    const currs = extremeCurrencies.map(([c]) => c).join(", ");
    return `🔴 EXTREME SHOCK RISK: ${currs} — High-impact data releasing NOW. Flatten or widen stops on all ${currs} pairs. Do NOT enter new positions.`;
  }

  if (highCurrencies.length > 0) {
    const currs = highCurrencies.map(([c, r]) => `${c} (${r.minutesUntil}m)`).join(", ");
    return `🟡 HIGH SHOCK RISK: ${currs} — Major data imminent. Reduce sizing to 0.3x on affected pairs. Set mental stops tight.`;
  }

  if (surprises.length > 0) {
    const bigSurprise = surprises.sort((a, b) => Math.abs(b.surprisePct) - Math.abs(a.surprisePct))[0];
    return `📊 DATA SURPRISE: ${bigSurprise.event} ${bigSurprise.direction} (${bigSurprise.surprisePct > 0 ? "+" : ""}${bigSurprise.surprisePct.toFixed(1)}%). ${bigSurprise.currency} pairs may trend. Ride momentum if aligned with indicators.`;
  }

  return "🟢 CLEAR TAPE: No imminent high-impact data. Normal operations. G8 in standard mode.";
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FINNHUB_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "FINNHUB_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const events = await fetchFromFinnhub(apiKey);
    const context = buildSmartG8Context(events);

    // ═══ G16 NEWS KILL-SWITCH ═══
    const g16 = await enforceG16(events, sb);

    console.log(`[ECON-CALENDAR] ${events.length} events | ${context.upcomingHighImpact.length} high-impact imminent | G16: deadZone=${g16.deadZoneActive} biasLocks=${g16.biasLocks.length} gates=${g16.gatesWritten} | ${context.smartG8Directive.slice(0, 80)}`);

    return new Response(JSON.stringify({
      ...context,
      g16: g16,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ECON-CALENDAR] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
