import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10min — calendars don't change that fast

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  currency: string;
}

async function fetchForexFactoryCalendar(): Promise<CalendarEvent[]> {
  try {
    // Forex Factory XML calendar
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'QuantLabs/1.0 (Trading Intelligence)' },
    });
    if (!res.ok) {
      console.warn('[ECON-CAL] Forex Factory fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((e: any) => ({
      title: e.title || '',
      country: e.country || '',
      date: e.date || '',
      time: e.time || '',
      impact: e.impact || 'Low',
      forecast: e.forecast || null,
      previous: e.previous || null,
      actual: e.actual || null,
      currency: (e.country || '').toUpperCase(),
    }));
  } catch (e) {
    console.error('[ECON-CAL] FF fetch error:', e);
    return [];
  }
}

function computeCalendarIntelligence(events: CalendarEvent[]) {
  const now = new Date();
  const nowMs = now.getTime();

  // Parse event times and categorize
  const upcoming: CalendarEvent[] = [];
  const recent: CalendarEvent[] = [];
  const highImpactToday: CalendarEvent[] = [];

  for (const evt of events) {
    // Filter to high and medium impact
    if (evt.impact !== 'High' && evt.impact !== 'Medium') continue;

    if (evt.impact === 'High') {
      highImpactToday.push(evt);
    }

    // Determine if upcoming (next 4h) or recent (last 2h)
    if (evt.actual && evt.forecast) {
      recent.push(evt);
    } else if (!evt.actual) {
      upcoming.push(evt);
    }
  }

  // Detect surprises
  const surprises = recent.filter(evt => {
    if (!evt.actual || !evt.forecast) return false;
    const actual = parseFloat(evt.actual.replace(/[%K]/g, ''));
    const forecast = parseFloat(evt.forecast.replace(/[%K]/g, ''));
    if (isNaN(actual) || isNaN(forecast) || forecast === 0) return false;
    const deviation = Math.abs((actual - forecast) / forecast) * 100;
    return deviation > 15; // 15% deviation = surprise
  }).map(evt => {
    const actual = parseFloat(evt.actual!.replace(/[%K]/g, ''));
    const forecast = parseFloat(evt.forecast!.replace(/[%K]/g, ''));
    return {
      ...evt,
      surpriseDirection: actual > forecast ? 'BEAT' : 'MISS',
      deviationPct: +((actual - forecast) / Math.abs(forecast) * 100).toFixed(1),
    };
  });

  // Per-currency risk map
  const currencyRisk: Record<string, { events: number; highImpact: number; riskLevel: string }> = {};
  for (const evt of highImpactToday) {
    const cur = evt.currency || 'UNKNOWN';
    if (!currencyRisk[cur]) currencyRisk[cur] = { events: 0, highImpact: 0, riskLevel: 'normal' };
    currencyRisk[cur].events++;
    currencyRisk[cur].highImpact++;
    if (currencyRisk[cur].highImpact >= 3) currencyRisk[cur].riskLevel = 'extreme';
    else if (currencyRisk[cur].highImpact >= 2) currencyRisk[cur].riskLevel = 'high';
    else currencyRisk[cur].riskLevel = 'elevated';
  }

  // Build directive
  let calendarDirective = 'CALENDAR CLEAR';
  if (surprises.length > 0) {
    calendarDirective = `DATA SURPRISE: ${surprises.map(s => `${s.title} ${s.surpriseDirection} (${s.deviationPct}%)`).join(', ')}`;
  } else if (highImpactToday.filter(e => !e.actual).length >= 3) {
    calendarDirective = `HIGH EVENT DENSITY: ${highImpactToday.filter(e => !e.actual).length} high-impact events pending today`;
  } else if (highImpactToday.filter(e => !e.actual).length >= 1) {
    calendarDirective = `EVENTS PENDING: ${highImpactToday.filter(e => !e.actual).map(e => `${e.currency} ${e.title}`).join(', ')}`;
  }

  return {
    calendarDirective,
    totalEventsThisWeek: events.length,
    highImpactPending: highImpactToday.filter(e => !e.actual).length,
    upcomingHighImpact: upcoming.filter(e => e.impact === 'High').slice(0, 10),
    recentSurprises: surprises,
    currencyRisk,
    allHighImpact: highImpactToday.slice(0, 20),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const events = await fetchForexFactoryCalendar();
    const intel = computeCalendarIntelligence(events);

    const payload = { ...intel, timestamp: new Date().toISOString() };
    cache = { data: payload, ts: Date.now() };
    console.log(`[ECON-CAL] ${intel.calendarDirective} | ${events.length} events total`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ECON-CAL] Error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
