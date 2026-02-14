// ═══════════════════════════════════════════════════════════════
// ECONOMIC CALENDAR — "Shock Sensor" for Smart G8
// Fetches high-impact economic events so the Sovereign Intelligence
// can distinguish scheduled news from random liquidity gaps.
// ═══════════════════════════════════════════════════════════════

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

// Impact classification based on Finnhub's numeric impact (1-3)
function classifyImpact(impact: number): "high" | "medium" | "low" {
  if (impact >= 3) return "high";
  if (impact >= 2) return "medium";
  return "low";
}

// In-memory cache (survives within a single edge function invocation batch)
let cachedEvents: EconomicEvent[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min cache

async function fetchFromFinnhub(apiKey: string): Promise<EconomicEvent[]> {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEvents;
  }

  // Fetch today + next 2 days
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
    .filter((e: any) => e.impact >= 2) // medium + high only
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

function buildSmartG8Context(events: EconomicEvent[]) {
  const now = Date.now();

  // Events in the next 60 minutes (danger zone)
  const imminent = events.filter(e => e.minutesUntil > -5 && e.minutesUntil <= 60);
  const highImpactImminent = imminent.filter(e => e.impact === "high");

  // Events that just released (last 30 min) with actual values
  const justReleased = events.filter(e => e.status === "released" && e.minutesUntil >= -30);

  // Compute "shock risk" per currency
  const shockRisk: Record<string, { level: "extreme" | "high" | "elevated" | "normal"; events: string[]; minutesUntil: number }> = {};

  for (const e of [...highImpactImminent, ...justReleased]) {
    const curr = e.currency;
    if (!shockRisk[curr]) {
      shockRisk[curr] = { level: "normal", events: [], minutesUntil: e.minutesUntil };
    }
    shockRisk[curr].events.push(e.event);
    shockRisk[curr].minutesUntil = Math.min(shockRisk[curr].minutesUntil, e.minutesUntil);

    if (e.impact === "high" && e.minutesUntil <= 5 && e.minutesUntil > -2) {
      shockRisk[curr].level = "extreme"; // Event hitting RIGHT NOW
    } else if (e.impact === "high" && e.minutesUntil <= 15) {
      shockRisk[curr].level = shockRisk[curr].level === "extreme" ? "extreme" : "high";
    } else if (e.impact === "high" && e.minutesUntil <= 60) {
      if (shockRisk[curr].level !== "extreme" && shockRisk[curr].level !== "high") {
        shockRisk[curr].level = "elevated";
      }
    }
  }

  // Affected pairs in danger
  const affectedPairs: string[] = [];
  for (const [curr, risk] of Object.entries(shockRisk)) {
    if (risk.level !== "normal") {
      affectedPairs.push(...(CURRENCY_PAIRS[curr] || []));
    }
  }

  // Surprise detection (actual vs estimate)
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
    .filter(s => Math.abs(s.surprisePct) > 5); // Only meaningful surprises

  return {
    timestamp: new Date().toISOString(),
    upcomingHighImpact: highImpactImminent.map(e => ({
      event: e.event,
      currency: e.currency,
      minutesUntil: e.minutesUntil,
      estimate: e.estimate,
      prev: e.prev,
    })),
    justReleased: justReleased.map(e => ({
      event: e.event,
      currency: e.currency,
      actual: e.actual,
      estimate: e.estimate,
      prev: e.prev,
      minutesAgo: Math.abs(e.minutesUntil),
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

    const events = await fetchFromFinnhub(apiKey);
    const context = buildSmartG8Context(events);

    console.log(`[ECON-CALENDAR] ${events.length} events loaded, ${context.upcomingHighImpact.length} high-impact imminent, directive: ${context.smartG8Directive.slice(0, 80)}`);

    return new Response(JSON.stringify(context), {
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
